/* ============================================================
   Tool 19.2 — Selective Scan Visualizer
   Compare fixed-parameter SSM (S4) vs input-dependent SSM (Mamba).
   Shows how selection lets Mamba focus on important tokens.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.SelectiveScan = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;

  var T = 24;    // sequence length
  var N = 8;     // state dimension
  var currentStep = 0;
  var playing = false;
  var playTimer = null;

  var state = {
    pattern: 'keyword',
    fixedDt: 0.3
  };

  // Sequence data
  var inputSeq = [];
  var tokenLabels = [];
  var isImportant = [];

  // Fixed SSM state history
  var fixedState = [];
  var fixedOutput = [];
  var fixedDelta = [];

  // Adaptive SSM state history
  var adaptState = [];
  var adaptOutput = [];
  var adaptDelta = [];

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Selective scan visualizer showing input-dependent state transitions');
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
      HEIGHT = Math.max(500, Math.min(600, WIDTH * 0.7));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSelect(containerEl, 'scan-pattern', function (v) { state.pattern = v; generateAndReset(); });
    bindSlider(containerEl, 'scan-fixed-dt', function (v) { state.fixedDt = parseFloat(v); generateAndReset(); });

    bindAction(containerEl, 'scan-step', function () { stepForward(); });
    bindAction(containerEl, 'scan-play', function () { togglePlay(); });
    bindAction(containerEl, 'scan-reset', function () { resetPlayback(); });

    generateAndReset();
    resize();
  }

  function generateAndReset() {
    generateSequence();
    simulateBoth();
    currentStep = 0;
    stopPlay();
    render();
  }

  function generateSequence() {
    inputSeq = new Float64Array(T);
    tokenLabels = [];
    isImportant = [];

    if (state.pattern === 'keyword') {
      var kw = [3, 7, 11, 16, 20];
      for (var i = 0; i < T; i++) {
        if (kw.indexOf(i) >= 0) {
          inputSeq[i] = 0.7 + Math.random() * 0.3;
          tokenLabels.push('K');
          isImportant.push(true);
        } else {
          inputSeq[i] = Math.random() * 0.25;
          tokenLabels.push('·');
          isImportant.push(false);
        }
      }
    } else if (state.pattern === 'repeat') {
      // Tokens A B C at start, noise, then query positions
      var tokens = [0.9, 0.7, 0.5];
      var labels = ['A', 'B', 'C'];
      for (var i = 0; i < 3; i++) {
        inputSeq[i] = tokens[i];
        tokenLabels.push(labels[i]);
        isImportant.push(true);
      }
      for (var i = 3; i < T - 3; i++) {
        inputSeq[i] = Math.random() * 0.15;
        tokenLabels.push('·');
        isImportant.push(false);
      }
      for (var i = 0; i < 3; i++) {
        inputSeq[T - 3 + i] = 0.4;
        tokenLabels.push('?' + labels[i]);
        isImportant.push(true);
      }
    } else { // spike
      for (var i = 0; i < T; i++) {
        var isSp = (i % 6 === 2);
        inputSeq[i] = isSp ? 1.0 : 0.05;
        tokenLabels.push(isSp ? '↑' : '·');
        isImportant.push(isSp);
      }
    }
  }

  function simulateBoth() {
    // HiPPO-like A diagonal
    var A_diag = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      A_diag[i] = -(i + 1) * 0.4;
    }

    // ─── Fixed SSM (S4-style) ───
    fixedState = [];
    fixedOutput = new Float64Array(T);
    fixedDelta = new Float64Array(T);
    var xf = new Float64Array(N);

    var B_fixed = new Float64Array(N);
    var C_fixed = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      B_fixed[i] = 1.0 / Math.sqrt(N);
      C_fixed[i] = 1.0 / Math.sqrt(N);
    }

    for (var n = 0; n < T; n++) {
      fixedDelta[n] = state.fixedDt;
      var newX = new Float64Array(N);
      var y = 0;
      for (var i = 0; i < N; i++) {
        var a_bar = Math.exp(A_diag[i] * state.fixedDt);
        newX[i] = a_bar * xf[i] + state.fixedDt * B_fixed[i] * inputSeq[n];
        y += C_fixed[i] * newX[i];
      }
      xf = newX;
      fixedState.push(new Float64Array(xf));
      fixedOutput[n] = y / N;
    }

    // ─── Adaptive SSM (Mamba-style) ───
    adaptState = [];
    adaptOutput = new Float64Array(T);
    adaptDelta = new Float64Array(T);
    var xa = new Float64Array(N);

    for (var n = 0; n < T; n++) {
      // Input-dependent Δ
      var rawDt = inputSeq[n] * 3.0 - 0.5;
      var dt = Math.log(1 + Math.exp(rawDt)); // softplus
      if (isImportant[n]) dt = Math.max(dt, 0.6);
      else dt = Math.min(dt, 0.15);
      adaptDelta[n] = dt;

      // Input-dependent B, C
      var B_adapt = new Float64Array(N);
      var C_adapt = new Float64Array(N);
      for (var i = 0; i < N; i++) {
        B_adapt[i] = (Math.sin(inputSeq[n] * (i + 1) * 2.5 + 1.0) * 0.3 + 0.5);
        C_adapt[i] = (Math.cos(inputSeq[n] * (i + 1) * 1.8 + 0.5) * 0.3 + 0.5);
      }

      var newX = new Float64Array(N);
      var y = 0;
      for (var i = 0; i < N; i++) {
        var a_bar = Math.exp(A_diag[i] * dt);
        newX[i] = a_bar * xa[i] + dt * B_adapt[i] * inputSeq[n];
        y += C_adapt[i] * newX[i];
      }
      xa = newX;
      adaptState.push(new Float64Array(xa));
      adaptOutput[n] = y / N;
    }
  }

  function stepForward() {
    if (currentStep < T - 1) {
      currentStep++;
      render();
    }
  }

  function togglePlay() {
    if (playing) {
      stopPlay();
    } else {
      playing = true;
      playTimer = setInterval(function () {
        if (currentStep >= T - 1) {
          stopPlay();
          return;
        }
        currentStep++;
        render();
      }, 300);
    }
  }

  function stopPlay() {
    playing = false;
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  }

  function resetPlayback() {
    stopPlay();
    currentStep = 0;
    render();
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var PAD = 12;
    var leftLabel = 60;
    var seqLeft = leftLabel + 4;
    var seqRight = WIDTH - PAD;
    var seqW = seqRight - seqLeft;
    var tokenW = seqW / T;

    // ─── Input sequence (top) ───
    var inputY = PAD;
    var inputH = 30;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('INPUT', leftLabel - 2, inputY + 14);

    for (var n = 0; n < T; n++) {
      var tx = seqLeft + n * tokenW;
      var opacity = n <= currentStep ? 1.0 : 0.2;

      ctx.globalAlpha = opacity;
      ctx.fillStyle = isImportant[n] ? c.ai : c.textDim;
      var barH = inputSeq[n] * (inputH - 8);
      ctx.fillRect(tx + 1, inputY + inputH - 8 - barH, tokenW - 2, barH);

      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tokenLabels[n], tx + tokenW / 2, inputY + inputH + 2);
      ctx.globalAlpha = 1;
    }

    // Current step marker
    if (currentStep < T) {
      var cx = seqLeft + currentStep * tokenW + tokenW / 2;
      ctx.strokeStyle = c.bridge;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(cx, inputY);
      ctx.lineTo(cx, HEIGHT - 40);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ─── FIXED SSM (S4) ─── top half
    var halfH = (HEIGHT - inputH - 80) / 2;
    var fixedY = inputY + inputH + 18;

    ctx.fillStyle = c.dsp;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('FIXED', leftLabel - 2, fixedY + 10);
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillText('(S4-style)', leftLabel - 2, fixedY + 20);
    ctx.fillText('Δ=' + state.fixedDt.toFixed(2), leftLabel - 2, fixedY + 30);

    // Fixed Δ bar (uniform)
    var dtBarH = 14;
    for (var n = 0; n <= currentStep && n < T; n++) {
      var tx = seqLeft + n * tokenW;
      ctx.fillStyle = 'rgba(34,211,238,0.35)';
      ctx.fillRect(tx + 1, fixedY, tokenW - 2, dtBarH);
    }
    ctx.fillStyle = c.dsp;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Δ (fixed)', seqLeft, fixedY - 2);

    // Fixed state heatmap
    var fStateY = fixedY + dtBarH + 4;
    var fCellH = Math.max(6, (halfH - dtBarH - 50) / N);
    drawStateHeatmap(seqLeft, fStateY, tokenW, fCellH, fixedState, currentStep, c.dsp);

    // Fixed output
    var fOutY = fStateY + N * fCellH + 6;
    var fOutH = 30;
    drawOutputLine(seqLeft, fOutY, seqW, fOutH, fixedOutput, currentStep, c.dsp);

    // ─── ADAPTIVE SSM (Mamba) ─── bottom half
    var adaptY = fixedY + halfH + 10;

    ctx.fillStyle = c.ai;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('ADAPTIVE', leftLabel - 2, adaptY + 10);
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillText('(Mamba)', leftLabel - 2, adaptY + 20);
    ctx.fillText('Δ[n]=f(u)', leftLabel - 2, adaptY + 30);

    // Adaptive Δ bars (varying)
    var maxAdaptDt = 0.01;
    for (var n = 0; n < T; n++) {
      if (adaptDelta[n] > maxAdaptDt) maxAdaptDt = adaptDelta[n];
    }
    for (var n = 0; n <= currentStep && n < T; n++) {
      var tx = seqLeft + n * tokenW;
      var h = (adaptDelta[n] / maxAdaptDt) * dtBarH;
      var intensity = adaptDelta[n] / maxAdaptDt;
      ctx.fillStyle = 'rgba(251,146,60,' + (0.3 + intensity * 0.6).toFixed(2) + ')';
      ctx.fillRect(tx + 1, adaptY + dtBarH - h, tokenW - 2, h);
    }
    ctx.fillStyle = c.ai;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Δ[n] (adaptive)', seqLeft, adaptY - 2);

    // Adaptive state heatmap
    var aStateY = adaptY + dtBarH + 4;
    drawStateHeatmap(seqLeft, aStateY, tokenW, fCellH, adaptState, currentStep, c.ai);

    // Adaptive output
    var aOutY = aStateY + N * fCellH + 6;
    drawOutputLine(seqLeft, aOutY, seqW, fOutH, adaptOutput, currentStep, c.ai);

    // ─── Bottom annotation ───
    var annY = HEIGHT - 16;
    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Fixed SSM: same Δ for all tokens (content-blind). Mamba: Δ adapts per token (content-aware selective filtering).', WIDTH / 2, annY);

    // Step indicator
    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Step ' + currentStep + '/' + (T - 1), WIDTH - PAD, annY);
  }

  function drawStateHeatmap(x0, y0, tokenW, cellH, stateHist, maxN, color) {
    var maxVal = 0.001;
    for (var n = 0; n < stateHist.length; n++) {
      for (var i = 0; i < N; i++) {
        if (Math.abs(stateHist[n][i]) > maxVal) maxVal = Math.abs(stateHist[n][i]);
      }
    }

    for (var n = 0; n <= maxN && n < T; n++) {
      var tx = x0 + n * tokenW;
      for (var i = 0; i < N; i++) {
        var val = stateHist[n][i] / maxVal;
        var cy = y0 + i * cellH;
        if (val >= 0) {
          ctx.fillStyle = 'rgba(34,211,238,' + (val * 0.7).toFixed(3) + ')';
        } else {
          ctx.fillStyle = 'rgba(251,113,133,' + ((-val) * 0.7).toFixed(3) + ')';
        }
        ctx.fillRect(tx + 1, cy, tokenW - 2, cellH - 1);
      }
    }
  }

  function drawOutputLine(x0, y0, w, h, output, maxN, color) {
    var maxOut = 0.001;
    for (var n = 0; n < T; n++) {
      if (Math.abs(output[n]) > maxOut) maxOut = Math.abs(output[n]);
    }

    // Zero line
    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h / 2);
    ctx.lineTo(x0 + w, y0 + h / 2);
    ctx.stroke();

    // Output line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    var tokenW = w / T;
    for (var n = 0; n <= maxN && n < T; n++) {
      var px = x0 + n * tokenW + tokenW / 2;
      var py = y0 + h / 2 - (output[n] / maxOut) * h * 0.4;
      if (n === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Dots
    for (var n = 0; n <= maxN && n < T; n++) {
      var px = x0 + n * tokenW + tokenW / 2;
      var py = y0 + h / 2 - (output[n] / maxOut) * h * 0.4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = cont.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      if (disp) disp.textContent = parseFloat(this.value).toFixed(2);
      callback(this.value);
    });
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  function bindAction(cont, name, callback) {
    var btns = cont.querySelectorAll('[data-action="' + name + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', callback);
    }
  }

  return { init: init };
})();
