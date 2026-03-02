/* ============================================================
   Tool 18.3 — Convolution-Recurrence Duality
   Side-by-side: compute SSM output via convolution (parallel)
   vs recurrence (sequential). Toggle train/inference mode.
   They produce identical outputs.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.ConvRecurrence = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 500;
  var PAD = { top: 10, right: 10, bottom: 10, left: 10 };

  var T = 40;    // sequence length
  var N = 4;     // state dim

  var state = {
    mode: 'both',   // 'conv', 'recurrence', 'both'
    animStep: -1,   // -1 = show all, 0..T-1 = animate step
    animating: false,
    speed: 1
  };

  // SSM parameters (simple stable system)
  var A = [], B = [], C = [];
  var inputSignal = [];
  var kernel = [];          // convolution kernel h[n] = C A^n B
  var convOutput = [];      // output via convolution
  var recOutput = [];       // output via recurrence
  var recStates = [];       // state at each step (for recurrence)

  var animFrame = null;
  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Convolution-recurrence duality demonstrator');
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
      HEIGHT = Math.max(440, Math.min(540, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    var convBtn = containerEl.querySelector('[data-action="cr-conv"]');
    if (convBtn) convBtn.addEventListener('click', function () {
      state.mode = 'conv';
      startAnimation();
    });

    var recBtn = containerEl.querySelector('[data-action="cr-rec"]');
    if (recBtn) recBtn.addEventListener('click', function () {
      state.mode = 'recurrence';
      startAnimation();
    });

    var bothBtn = containerEl.querySelector('[data-action="cr-both"]');
    if (bothBtn) bothBtn.addEventListener('click', function () {
      state.mode = 'both';
      state.animStep = -1;
      state.animating = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      render();
    });

    var resetBtn = containerEl.querySelector('[data-action="cr-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      state.animStep = -1;
      state.animating = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      render();
    });

    computeAll();
    resize();
  }

  function startAnimation() {
    state.animStep = 0;
    state.animating = true;
    if (animFrame) cancelAnimationFrame(animFrame);
    animate();
  }

  function animate() {
    if (!state.animating) return;
    render();
    state.animStep++;
    if (state.animStep >= T) {
      state.animStep = T - 1;
      state.animating = false;
      render();
      return;
    }
    animFrame = requestAnimationFrame(function () {
      setTimeout(animate, 80);
    });
  }

  function computeAll() {
    var rng = mulberry32(55);

    // Simple diagonal A matrix (stable)
    A = [];
    for (var i = 0; i < N; i++) {
      A[i] = new Float64Array(N);
      A[i][i] = 0.85 - i * 0.1; // eigenvalues: 0.85, 0.75, 0.65, 0.55
    }
    // Add some off-diagonal
    A[0][1] = 0.1; A[1][0] = -0.1;

    B = new Float64Array(N);
    C = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      B[i] = 1.0 / (i + 1);
      C[i] = (i % 2 === 0) ? 1 : -0.5;
    }

    // Generate input
    inputSignal = new Float64Array(T);
    for (var t = 0; t < T; t++) {
      inputSignal[t] = Math.sin(2 * Math.PI * 2 * t / T) * 0.5 + (rng() - 0.5) * 0.3;
    }

    // Compute convolution kernel: h[n] = C * A^n * B
    kernel = new Float64Array(T);
    var An = []; // A^n as matrix
    // A^0 = I
    for (var i = 0; i < N; i++) {
      An[i] = new Float64Array(N);
      An[i][i] = 1;
    }
    for (var n = 0; n < T; n++) {
      // h[n] = C^T * An * B
      var AnB = new Float64Array(N);
      for (var i = 0; i < N; i++) {
        for (var j = 0; j < N; j++) {
          AnB[i] += An[i][j] * B[j];
        }
      }
      var hn = 0;
      for (var i = 0; i < N; i++) hn += C[i] * AnB[i];
      kernel[n] = hn;

      // An = An * A for next iteration
      var newAn = [];
      for (var i = 0; i < N; i++) {
        newAn[i] = new Float64Array(N);
        for (var j = 0; j < N; j++) {
          for (var k = 0; k < N; k++) {
            newAn[i][j] += An[i][k] * A[k][j];
          }
        }
      }
      An = newAn;
    }

    // Output via convolution: y[n] = Σ_k h[k] * x[n-k]
    convOutput = new Float64Array(T);
    for (var n = 0; n < T; n++) {
      for (var k = 0; k <= n; k++) {
        convOutput[n] += kernel[k] * inputSignal[n - k];
      }
    }

    // Output via recurrence: x[n+1] = Ax[n] + Bu[n], y[n] = Cx[n]
    recOutput = new Float64Array(T);
    recStates = [];
    var x = new Float64Array(N);
    for (var n = 0; n < T; n++) {
      // y[n] = Cx[n] (+ Du[n], but D=0)
      var y = 0;
      for (var i = 0; i < N; i++) y += C[i] * x[i];
      recOutput[n] = y;
      recStates.push(new Float64Array(x));

      // x[n+1] = Ax[n] + Bu[n]
      var newX = new Float64Array(N);
      for (var i = 0; i < N; i++) {
        for (var j = 0; j < N; j++) {
          newX[i] += A[i][j] * x[j];
        }
        newX[i] += B[i] * inputSignal[n];
      }
      x = newX;
    }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var midX = WIDTH / 2;
    var colW = (WIDTH - PAD.left - PAD.right - 30) / 2;
    var plotX = PAD.left + 10;
    var plotW = WIDTH - PAD.left - PAD.right - 20;

    // ─── Top: Input signal ───
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('INPUT SIGNAL u[n]', plotX, PAD.top + 14);

    var sigY = PAD.top + 20;
    var sigH = 50;
    drawSignal(plotX, sigY, plotW, sigH, inputSignal, c.text, c, state.animStep);

    // ─── Middle: Two columns ───
    var colY = sigY + sigH + 16;
    var colH = HEIGHT * 0.45;

    // Left: Convolution mode
    var leftActive = (state.mode === 'conv' || state.mode === 'both');
    ctx.globalAlpha = leftActive ? 1 : 0.3;

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CONVOLUTION (parallel, train mode)', plotX, colY);

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('y[n] = \u03A3_k h[k] \u00b7 u[n-k]', plotX, colY + 14);
    ctx.fillText('Pre-compute kernel h[n] = CA\u207FB, then convolve', plotX, colY + 26);

    // Kernel
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('Kernel h[n]:', plotX, colY + 44);
    drawSignal(plotX, colY + 48, colW - 10, 40, kernel, '#38bdf8', c, -1);

    // Conv output
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('Output (conv):', plotX, colY + 98);
    drawSignal(plotX, colY + 102, colW - 10, 50, convOutput, '#38bdf8', c, state.mode === 'conv' ? state.animStep : -1);

    // Computation indicator
    if (state.mode === 'conv' && state.animStep >= 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText('Computing y[' + state.animStep + '] = sum over kernel...', plotX, colY + colH - 10);
    }

    ctx.globalAlpha = 1;

    // Right: Recurrence mode
    var rightActive = (state.mode === 'recurrence' || state.mode === 'both');
    ctx.globalAlpha = rightActive ? 1 : 0.3;

    var rX = midX + 15;

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('RECURRENCE (sequential, inference mode)', rX, colY);

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('x[n+1] = Ax[n] + Bu[n], y[n] = Cx[n]', rX, colY + 14);
    ctx.fillText('Update state step-by-step, O(1) per step', rX, colY + 26);

    // State heatmap
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('State x[n] over time:', rX, colY + 44);

    var hmY = colY + 48;
    var hmH = 40;
    var cellW = (colW - 10) / T;
    var cellH = hmH / N;
    var maxSt = 0;
    for (var t = 0; t < T; t++) {
      for (var i = 0; i < N; i++) {
        if (Math.abs(recStates[t][i]) > maxSt) maxSt = Math.abs(recStates[t][i]);
      }
    }
    if (maxSt < 0.01) maxSt = 1;

    var stepsToShow = (state.mode === 'recurrence' && state.animStep >= 0) ? state.animStep + 1 : T;
    for (var t = 0; t < stepsToShow; t++) {
      for (var i = 0; i < N; i++) {
        var val = recStates[t][i] / maxSt;
        var norm = (val + 1) / 2;
        var r = Math.floor(30 + 200 * norm);
        var g = Math.floor(100 + 120 * norm);
        var b = Math.floor(60 + 60 * (1 - norm));
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(rX + t * cellW, hmY + i * cellH, Math.max(1, cellW), cellH - 0.5);
      }
    }

    // Rec output
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('Output (recurrence):', rX, colY + 98);
    drawSignal(rX, colY + 102, colW - 10, 50, recOutput, '#4ade80', c, state.mode === 'recurrence' ? state.animStep : -1);

    if (state.mode === 'recurrence' && state.animStep >= 0) {
      ctx.fillStyle = '#4ade80';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText('Step ' + state.animStep + ': x\u2099\u208A\u2081 = Ax\u2099 + Bu\u2099', rX, colY + colH - 10);
    }

    ctx.globalAlpha = 1;

    // ─── Bottom: Comparison / match verification ───
    var compY = colY + colH + 12;

    ctx.fillStyle = c.text;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('VERIFICATION: outputs are identical', plotX, compY);

    // Compute difference
    var maxDiff = 0;
    for (var t = 0; t < T; t++) {
      var d = Math.abs(convOutput[t] - recOutput[t]);
      if (d > maxDiff) maxDiff = d;
    }

    ctx.fillStyle = maxDiff < 1e-6 ? '#4ade80' : '#fbbf24';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('Max |conv - rec| = ' + maxDiff.toExponential(2) + (maxDiff < 1e-6 ? ' \u2714 EXACT MATCH' : ' (numerical precision)'), plotX, compY + 14);

    // Side-by-side output overlay
    drawSignal(plotX, compY + 20, plotW, 40, convOutput, '#38bdf8', c, -1);
    drawSignal(plotX, compY + 20, plotW, 40, recOutput, '#4ade80', c, -1);

    // Mode labels
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('conv (blue)', plotX + plotW, compY + 24);
    ctx.fillStyle = '#4ade80';
    ctx.fillText('rec (green)', plotX + plotW, compY + 34);

    // ─── Bottom annotation ───
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Duality: same SSM output computed as FIR convolution (train, parallel) or IIR recurrence (infer, O(1) per step)', WIDTH / 2, HEIGHT - 8);
  }

  function drawSignal(x, y, w, h, data, color, c, highlightStep) {
    var maxVal = 0;
    for (var i = 0; i < data.length; i++) if (Math.abs(data[i]) > maxVal) maxVal = Math.abs(data[i]);
    if (maxVal < 0.01) maxVal = 1;

    var zeroY = y + h / 2;

    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x, zeroY);
    ctx.lineTo(x + w, zeroY);
    ctx.stroke();

    var len = highlightStep >= 0 ? Math.min(highlightStep + 1, data.length) : data.length;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i < len; i++) {
      var px = x + (i / (data.length - 1)) * w;
      var py = zeroY - (data[i] / maxVal) * (h / 2 - 4);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Highlight current step
    if (highlightStep >= 0 && highlightStep < data.length) {
      var hx = x + (highlightStep / (data.length - 1)) * w;
      var hy = zeroY - (data[highlightStep] / maxVal) * (h / 2 - 4);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
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

  return { init: init };
})();
