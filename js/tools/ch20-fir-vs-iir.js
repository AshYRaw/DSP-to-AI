/* ============================================================
   Tool 20.2 — FIR vs IIR Filter Paradigm
   Side-by-side: FIR (attention-like, finite window) vs
   IIR (Mamba-like, recursive state, infinite impulse response).
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.FIRvsIIR = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 540;

  var T = 64; // signal length
  var state = {
    signal: 'impulse',
    firTaps: 12,
    iirPole: 0.9
  };

  var inputSignal = [];
  var firOutput = [];
  var iirOutput = [];
  var firImpulse = [];
  var iirImpulse = [];

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'FIR versus IIR architectural comparison');
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
      HEIGHT = Math.max(480, Math.min(580, WIDTH * 0.68));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSelect(containerEl, 'fir-signal', function (v) { state.signal = v; simulate(); render(); });
    bindSlider(containerEl, 'fir-taps', function (v) { state.firTaps = parseInt(v, 10); simulate(); render(); });
    bindSlider(containerEl, 'iir-pole', function (v) { state.iirPole = parseFloat(v); simulate(); render(); });

    simulate();
    resize();
  }

  function generateInput() {
    inputSignal = new Float64Array(T);

    if (state.signal === 'impulse') {
      inputSignal[8] = 1.0;
    } else if (state.signal === 'step') {
      for (var i = 10; i < 30; i++) inputSignal[i] = 1.0;
    } else if (state.signal === 'keywords') {
      var kw = [5, 15, 25, 45, 55];
      for (var i = 0; i < T; i++) {
        if (kw.indexOf(i) >= 0) {
          inputSignal[i] = 0.8 + Math.random() * 0.2;
        } else {
          inputSignal[i] = Math.random() * 0.15;
        }
      }
    } else { // chirp
      for (var i = 0; i < T; i++) {
        var f = 0.02 + 0.3 * (i / T);
        inputSignal[i] = Math.sin(2 * Math.PI * f * i) * 0.8;
      }
    }
  }

  function simulate() {
    generateInput();
    var W = state.firTaps;
    var pole = state.iirPole;

    // FIR: moving average with W taps (uniform weights, normalized)
    firOutput = new Float64Array(T);
    for (var n = 0; n < T; n++) {
      var sum = 0;
      var count = 0;
      for (var k = 0; k < W && (n - k) >= 0; k++) {
        sum += inputSignal[n - k];
        count++;
      }
      firOutput[n] = count > 0 ? sum / W : 0;
    }

    // FIR impulse response
    firImpulse = new Float64Array(T);
    for (var k = 0; k < Math.min(W, T); k++) {
      firImpulse[k] = 1.0 / W;
    }

    // IIR: first-order recursive y[n] = pole * y[n-1] + (1-pole) * x[n]
    iirOutput = new Float64Array(T);
    var y = 0;
    for (var n = 0; n < T; n++) {
      y = pole * y + (1 - pole) * inputSignal[n];
      iirOutput[n] = y;
    }

    // IIR impulse response
    iirImpulse = new Float64Array(T);
    for (var k = 0; k < T; k++) {
      iirImpulse[k] = (1 - pole) * Math.pow(pole, k);
    }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var PAD = { top: 10, right: 14, bottom: 30, left: 14 };
    var colW = (WIDTH - PAD.left - PAD.right - 20) / 2;

    // ─── LEFT: FIR (Attention) ───
    var leftX = PAD.left;
    renderColumn(leftX, colW, 'FIR (Attention-like)',
      'Finite window: W=' + state.firTaps + ' taps',
      '#60a5fa', firOutput, firImpulse, c);

    // ─── Divider ───
    var midX = PAD.left + colW + 10;
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(midX, PAD.top + 20);
    ctx.lineTo(midX, HEIGHT - PAD.bottom - 10);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ─── RIGHT: IIR (Mamba) ───
    var rightX = midX + 10;
    renderColumn(rightX, colW, 'IIR (Mamba-like)',
      'Recursive: pole=' + state.iirPole.toFixed(2),
      '#4ade80', iirOutput, iirImpulse, c);

    // ─── Bottom annotation ───
    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FIR = explicit finite memory (like KV-cache). IIR = compressed infinite memory (like SSM state). Same signal, different philosophy.', WIDTH / 2, HEIGHT - 6);
  }

  function renderColumn(x0, w, title, subtitle, color, output, impulse, c) {
    var PAD_TOP = 10;
    var sectionH = (HEIGHT - 70) / 4;

    // Title
    ctx.fillStyle = color;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(title, x0, PAD_TOP + 12);
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText(subtitle, x0, PAD_TOP + 24);

    var plotY0 = PAD_TOP + 32;

    // ── Row 1: Input signal ──
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Input Signal', x0, plotY0 - 2);

    drawSignalPlot(x0, plotY0, w, sectionH - 10, inputSignal, c.text, 0.6);

    // ── Row 2: Impulse response ──
    var irY = plotY0 + sectionH;
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillText('Impulse Response h[n]', x0, irY - 2);

    drawSignalPlot(x0, irY, w, sectionH - 10, impulse, color, 0.8);

    // Mark the window/decay
    if (color === '#60a5fa') {
      // FIR: mark the window boundary
      var boundaryX = x0 + (state.firTaps / T) * w;
      ctx.strokeStyle = 'rgba(251,113,133,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(boundaryX, irY);
      ctx.lineTo(boundaryX, irY + sectionH - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fb7185';
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('cutoff!', boundaryX + 2, irY + 10);
    } else {
      // IIR: show decay envelope
      ctx.strokeStyle = 'rgba(251,191,36,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      var halfLife = -Math.log(2) / Math.log(state.iirPole);
      for (var n = 0; n < T; n++) {
        var env = (1 - state.iirPole) * Math.pow(state.iirPole, n);
        var px = x0 + (n / T) * w;
        var maxIR = (1 - state.iirPole);
        var py = irY + (sectionH - 10) / 2 - (env / maxIR) * (sectionH - 10) * 0.4;
        if (n === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('half-life: ~' + halfLife.toFixed(1) + ' samples', x0 + w * 0.4, irY + 10);
    }

    // ── Row 3: Output ──
    var outY = irY + sectionH;
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Output y[n]', x0, outY - 2);

    drawSignalPlot(x0, outY, w, sectionH - 10, output, color, 1.0);

    // ── Row 4: Memory usage ──
    var memY = outY + sectionH;
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Memory Usage Over Time', x0, memY - 2);

    // Draw memory growth
    var memH = sectionH - 18;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(x0, memY, w, memH);

    if (color === '#60a5fa') {
      // FIR: memory grows with window size up to W, then constant
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (var n = 0; n < T; n++) {
        var mem = Math.min(n + 1, state.firTaps) / state.firTaps;
        var px = x0 + (n / T) * w;
        var py = memY + memH - mem * memH * 0.8;
        if (n === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('stores W=' + state.firTaps + ' past tokens', x0 + w - 2, memY + memH - 4);

      // Note: in real attention, memory grows as T (all past tokens)
      ctx.fillStyle = '#fb7185';
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('(real attention: grows as T, not W)', x0 + 2, memY + 10);
    } else {
      // IIR: constant memory (just the state)
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      var constMem = 0.15; // small constant
      ctx.moveTo(x0, memY + memH - constMem * memH);
      ctx.lineTo(x0 + w, memY + memH - constMem * memH);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('constant: just the state vector', x0 + w - 2, memY + memH - 4);
    }
  }

  function drawSignalPlot(x0, y0, w, h, signal, color, opacity) {
    // Find range
    var maxVal = 0.001;
    for (var i = 0; i < signal.length; i++) {
      if (Math.abs(signal[i]) > maxVal) maxVal = Math.abs(signal[i]);
    }

    // Zero line
    ctx.strokeStyle = 'rgba(148,163,184,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h / 2);
    ctx.lineTo(x0 + w, y0 + h / 2);
    ctx.stroke();

    // Signal line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = opacity;
    for (var n = 0; n < T; n++) {
      var px = x0 + (n / T) * w;
      var py = y0 + h / 2 - (signal[n] / maxVal) * h * 0.42;
      if (n === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = cont.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      var v = this.value;
      if (disp) {
        if (name === 'iir-pole') disp.textContent = parseFloat(v).toFixed(2);
        else disp.textContent = v;
      }
      callback(v);
    });
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
