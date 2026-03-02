/* ============================================================
   Tool 18.2 — HiPPO Visualizer
   Input signal → state as Legendre coefficients → reconstruct
   history. Compare HiPPO (structured A) vs random initialization.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.HiPPOViz = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var PAD = { top: 10, right: 10, bottom: 10, left: 10 };

  var N = 8;      // state dimension (number of Legendre coefficients)
  var T = 100;    // sequence length

  var state = {
    signalType: 'ramp',   // ramp, sine, step, mixed
    useHiPPO: true,
    showReconstruction: true,
    currentStep: 60       // how far into the sequence to show
  };

  // Signal and state history
  var inputSignal = [];
  var hippoStates = [];     // T x N
  var randomStates = [];    // T x N
  var hippoRecon = [];      // T-length reconstruction from HiPPO at currentStep
  var randomRecon = [];     // T-length reconstruction from random at currentStep

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'HiPPO memory visualizer showing Legendre polynomial state compression');
    canvas.setAttribute('tabindex', '0');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      containerEl.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(460, Math.min(560, WIDTH * 0.68));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSelect(containerEl, 'hippo-signal', function (v) {
      state.signalType = v;
      computeAll();
      render();
    });

    bindSlider(containerEl, 'hippo-step', function (v) {
      state.currentStep = parseInt(v, 10);
      reconstructAtStep();
      render();
    });

    var toggleBtn = containerEl.querySelector('[data-action="hippo-toggle"]');
    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      state.useHiPPO = !state.useHiPPO;
      render();
    });

    computeAll();
    resize();
  }

  function computeAll() {
    // Generate input signal
    inputSignal = new Float64Array(T);
    switch (state.signalType) {
      case 'ramp':
        for (var t = 0; t < T; t++) inputSignal[t] = t / T;
        break;
      case 'sine':
        for (var t = 0; t < T; t++) inputSignal[t] = Math.sin(2 * Math.PI * 3 * t / T);
        break;
      case 'step':
        for (var t = 0; t < T; t++) inputSignal[t] = (t > T / 3 && t < 2 * T / 3) ? 1.0 : 0.0;
        break;
      case 'mixed':
        for (var t = 0; t < T; t++) {
          inputSignal[t] = 0.5 * Math.sin(2 * Math.PI * 2 * t / T) + 0.3 * (t > T / 2 ? 1 : 0) + 0.2 * (t / T);
        }
        break;
    }

    // ─── HiPPO-LegS A matrix (Legendre measure) ───
    // A[n,k] = -(2n+1)^{1/2} (2k+1)^{1/2}  if n > k
    //        = -(n+1)                          if n = k
    //        = 0                               if n < k
    var hippoA = [];
    var hippoB = [];
    for (var n = 0; n < N; n++) {
      hippoA[n] = new Float64Array(N);
      for (var k = 0; k < N; k++) {
        if (n > k) {
          hippoA[n][k] = -Math.sqrt(2 * n + 1) * Math.sqrt(2 * k + 1);
        } else if (n === k) {
          hippoA[n][k] = -(n + 1);
        } else {
          hippoA[n][k] = 0;
        }
      }
      hippoB[n] = Math.sqrt(2 * n + 1);
    }

    // ─── Random A matrix (for comparison) ───
    var rng = mulberry32(42);
    var randomA = [];
    var randomB = [];
    for (var n = 0; n < N; n++) {
      randomA[n] = new Float64Array(N);
      for (var k = 0; k < N; k++) {
        randomA[n][k] = (rng() - 0.5) * 2;
      }
      // Make it stable (scale to have spectral radius < 1)
      randomA[n][n] -= 2.0;
      randomB[n] = rng() * 2;
    }

    // Discretize both with dt = 1/T using Euler method
    var dt = 1.0 / T;

    // Run both SSMs
    hippoStates = [];
    randomStates = [];
    var hx = new Float64Array(N);
    var rx = new Float64Array(N);

    for (var t = 0; t < T; t++) {
      var u = inputSignal[t];

      // Store current state
      hippoStates.push(new Float64Array(hx));
      randomStates.push(new Float64Array(rx));

      // HiPPO update: x += dt * (A*x + B*u)
      var hAx = matVec(hippoA, hx);
      for (var n = 0; n < N; n++) {
        hx[n] += dt * (hAx[n] + hippoB[n] * u);
      }

      // Random update
      var rAx = matVec(randomA, rx);
      for (var n = 0; n < N; n++) {
        rx[n] += dt * (rAx[n] + randomB[n] * u);
      }
    }

    reconstructAtStep();
  }

  function reconstructAtStep() {
    var step = Math.min(state.currentStep, T - 1);

    // Reconstruct signal history from Legendre coefficients at this timestep
    // f(s) ≈ Σ_n c_n * P_n(s) for s ∈ [0, 1] mapped to [0, step]
    hippoRecon = new Float64Array(step + 1);
    randomRecon = new Float64Array(step + 1);

    var hCoeffs = hippoStates[step];
    var rCoeffs = randomStates[step];

    for (var t = 0; t <= step; t++) {
      var s = (step > 0) ? t / step : 0; // normalized to [0,1]
      // Evaluate Legendre polynomials at s mapped to [-1, 1]
      var x = 2 * s - 1;

      var hVal = 0, rVal = 0;
      for (var n = 0; n < N; n++) {
        var Pn = legendreP(n, x);
        hVal += hCoeffs[n] * Pn * Math.sqrt(2 * n + 1);
        rVal += rCoeffs[n] * Pn;
      }
      hippoRecon[t] = hVal;
      randomRecon[t] = rVal;
    }
  }

  function legendreP(n, x) {
    if (n === 0) return 1;
    if (n === 1) return x;
    var p0 = 1, p1 = x, p2;
    for (var k = 2; k <= n; k++) {
      p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
      p0 = p1;
      p1 = p2;
    }
    return p1;
  }

  function matVec(A, x) {
    var result = new Float64Array(x.length);
    for (var i = 0; i < x.length; i++) {
      for (var j = 0; j < x.length; j++) {
        result[i] += A[i][j] * x[j];
      }
    }
    return result;
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotX = PAD.left + 50;
    var plotW = WIDTH * 0.6 - 50;
    var rightX = PAD.left + WIDTH * 0.6 + 20;
    var rightW = WIDTH - rightX - PAD.right - 10;
    var step = Math.min(state.currentStep, T - 1);

    // ─── Title ───
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HiPPO: OPTIMAL HISTORY COMPRESSION INTO STATE', plotX, PAD.top + 14);

    // ─── Top: Input signal + reconstruction ───
    var sigY = PAD.top + 28;
    var sigH = HEIGHT * 0.35;

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('Input signal & reconstruction from state at step ' + step, plotX, sigY + 8);

    // Axes
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('1.0', plotX - 4, sigY + 18);
    ctx.fillText('0.0', plotX - 4, sigY + sigH / 2 + 4);
    ctx.fillText('-1.0', plotX - 4, sigY + sigH - 4);

    // Find signal range
    var maxSig = 0;
    for (var t = 0; t < T; t++) if (Math.abs(inputSignal[t]) > maxSig) maxSig = Math.abs(inputSignal[t]);
    if (maxSig < 0.01) maxSig = 1;

    // Zero line
    var zeroY = sigY + 14 + (sigH - 20) / 2;
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(plotX, zeroY);
    ctx.lineTo(plotX + plotW, zeroY);
    ctx.stroke();

    // Current step marker
    var stepX = plotX + (step / T) * plotW;
    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(stepX, sigY + 14);
    ctx.lineTo(stepX, sigY + sigH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('t=' + step, stepX, sigY + sigH + 10);

    // Draw input signal (full)
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (var t = 0; t < T; t++) {
      var px = plotX + (t / T) * plotW;
      var py = zeroY - (inputSignal[t] / maxSig) * ((sigH - 20) / 2);
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw input signal up to current step (solid)
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var t = 0; t <= step; t++) {
      var px = plotX + (t / T) * plotW;
      var py = zeroY - (inputSignal[t] / maxSig) * ((sigH - 20) / 2);
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw reconstruction (HiPPO)
    if (hippoRecon.length > 1) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      for (var t = 0; t < hippoRecon.length; t++) {
        var px = plotX + (t / T) * plotW;
        var val = Math.max(-maxSig * 2, Math.min(maxSig * 2, hippoRecon[t]));
        var py = zeroY - (val / maxSig) * ((sigH - 20) / 2);
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw reconstruction (Random)
    if (randomRecon.length > 1) {
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      for (var t = 0; t < randomRecon.length; t++) {
        var px = plotX + (t / T) * plotW;
        var val = Math.max(-maxSig * 3, Math.min(maxSig * 3, randomRecon[t]));
        var py = zeroY - (val / maxSig) * ((sigH - 20) / 2);
        if (t === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Legend
    var legY = sigY + 16;
    ctx.textAlign = 'left';
    ctx.font = '8px "JetBrains Mono", monospace';

    ctx.fillStyle = c.text;
    ctx.fillRect(plotX + plotW - 140, legY, 8, 2);
    ctx.fillText('input signal', plotX + plotW - 128, legY + 4);

    ctx.fillStyle = '#4ade80';
    ctx.fillRect(plotX + plotW - 140, legY + 12, 8, 2);
    ctx.fillText('HiPPO recon', plotX + plotW - 128, legY + 16);

    ctx.fillStyle = '#fb7185';
    ctx.fillRect(plotX + plotW - 140, legY + 24, 8, 2);
    ctx.fillText('random recon', plotX + plotW - 128, legY + 28);

    // ─── Bottom: State heatmap ───
    var heatY = sigY + sigH + 22;
    var heatH = HEIGHT - heatY - PAD.bottom - 30;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('STATE VECTOR OVER TIME (HiPPO coefficients)', plotX, heatY);

    var cellW = plotW / T;
    var cellH = Math.min(20, (heatH - 16) / N);
    var hmY = heatY + 14;

    // Find range
    var maxState = 0;
    for (var t = 0; t < T; t++) {
      for (var n = 0; n < N; n++) {
        if (Math.abs(hippoStates[t][n]) > maxState) maxState = Math.abs(hippoStates[t][n]);
      }
    }
    if (maxState < 0.01) maxState = 1;

    for (var n = 0; n < N; n++) {
      // Row label
      ctx.fillStyle = c.textDim;
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('c' + n, plotX - 4, hmY + n * cellH + cellH / 2 + 2);

      for (var t = 0; t < T; t++) {
        var val = hippoStates[t][n] / maxState;
        val = Math.max(-1, Math.min(1, val));

        // Blue-black-red diverging
        var r, g, b;
        if (val < 0) {
          r = Math.floor(30 + 220 * (-val));
          g = Math.floor(60 * (1 + val));
          b = Math.floor(180 * (1 + val));
        } else {
          r = Math.floor(30 + 20 * val);
          g = Math.floor(60 + 160 * val);
          b = Math.floor(180 + 60 * val);
        }

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(plotX + t * cellW, hmY + n * cellH, Math.max(1, cellW), cellH - 0.5);
      }
    }

    // Current step highlight
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(plotX + step * cellW - 1, hmY - 1, Math.max(2, cellW) + 2, N * cellH + 2);

    // ─── Right panel: State vector at current step ───
    ctx.fillStyle = c.text;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('State at t=' + step, rightX, PAD.top + 30);

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText(N + ' Legendre coefficients', rightX, PAD.top + 44);
    ctx.fillText('compress full signal history', rightX, PAD.top + 56);

    var barY = PAD.top + 72;
    var barH = 16;
    var barMaxW = rightW - 40;

    // HiPPO coefficients
    ctx.fillStyle = '#4ade80';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('HiPPO:', rightX, barY);
    barY += 14;

    var hCoeffs = hippoStates[step];
    for (var n = 0; n < N; n++) {
      var val = hCoeffs[n] / (maxState + 1e-10);
      var bw = Math.abs(val) * barMaxW;
      var bx = val >= 0 ? rightX + 20 : rightX + 20 - bw;

      ctx.fillStyle = val >= 0 ? 'rgba(74,222,128,0.5)' : 'rgba(251,113,133,0.5)';
      ctx.fillRect(bx, barY + n * (barH + 2), bw, barH);

      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('c' + n + '=' + hCoeffs[n].toFixed(2), rightX + barMaxW + 24, barY + n * (barH + 2) + barH - 3);
    }

    // Reconstruction error
    var reconErrH = 0, reconErrR = 0;
    var nSamples = Math.min(step + 1, hippoRecon.length);
    for (var t = 0; t < nSamples; t++) {
      reconErrH += Math.pow(inputSignal[t] - hippoRecon[t], 2);
      reconErrR += Math.pow(inputSignal[t] - (t < randomRecon.length ? randomRecon[t] : 0), 2);
    }
    reconErrH = nSamples > 0 ? Math.sqrt(reconErrH / nSamples) : 0;
    reconErrR = nSamples > 0 ? Math.sqrt(reconErrR / nSamples) : 0;

    var errY = barY + N * (barH + 2) + 20;
    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Reconstruction RMSE:', rightX, errY);

    ctx.fillStyle = '#4ade80';
    ctx.fillText('HiPPO:  ' + reconErrH.toFixed(4), rightX, errY + 16);
    ctx.fillStyle = '#fb7185';
    ctx.fillText('Random: ' + reconErrR.toFixed(4), rightX, errY + 30);

    if (reconErrH < reconErrR * 0.8) {
      ctx.fillStyle = c.bridge;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('HiPPO wins! Structured A', rightX, errY + 48);
      ctx.fillText('optimally compresses history.', rightX, errY + 60);
    }

    // ─── Bottom ───
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HiPPO: the A matrix is designed so state coefficients optimally approximate signal history via Legendre polynomials', WIDTH / 2, HEIGHT - 8);
  }

  // ─── Utilities ───

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = cont.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      if (disp) disp.textContent = this.value;
      callback(this.value);
    });
    if (disp) disp.textContent = el.value;
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
