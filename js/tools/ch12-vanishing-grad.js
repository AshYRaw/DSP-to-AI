/* ============================================================
   Tool 12.2 — Vanishing Gradient Demonstrator
   Shows gradient magnitude flowing backward through time.
   RNN gradients fade; LSTM gradients maintained.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.VanishingGrad = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 420;
  var PAD = { top: 10, right: 20, bottom: 10, left: 55 };

  var state = {
    seqLen: 30,
    rnnScale: 0.7,      // recurrent weight scale (controls vanishing)
    lstmForgetBias: 1.5, // forget gate bias (controls memory retention)
    showRNN: true,
    showLSTM: true
  };

  // Computed gradient magnitudes
  var rnnGrads = [];
  var lstmGrads = [];

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Vanishing gradient demonstration showing gradient magnitude decay over time');
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
      HEIGHT = Math.max(380, Math.min(460, WIDTH * 0.52));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSlider(containerEl, 'vg-seqlen', function (v) {
      state.seqLen = parseInt(v, 10);
      computeGradients();
      render();
    });
    bindSlider(containerEl, 'vg-rnn-scale', function (v) {
      state.rnnScale = parseFloat(v);
      computeGradients();
      render();
    });
    bindSlider(containerEl, 'vg-lstm-bias', function (v) {
      state.lstmForgetBias = parseFloat(v);
      computeGradients();
      render();
    });

    computeGradients();
    resize();
  }

  function computeGradients() {
    var T = state.seqLen;
    var rng = mulberry32(42);

    // ─── RNN Gradient Simulation ───
    // dh_T/dh_t ≈ product of (diag(tanh'(z)) * W_h) from t to T
    // Simplified: gradient magnitude ≈ |w_scale * tanh_deriv|^(T-t)
    rnnGrads = new Float64Array(T);
    var wScale = state.rnnScale;
    for (var t = 0; t < T; t++) {
      var distance = T - 1 - t; // how far back from the loss
      // Average tanh derivative for typical activations is ~0.65
      var avgTanhDeriv = 0.65;
      // Add some noise to make it realistic
      var noise = 1 + (rng() - 0.5) * 0.2;
      rnnGrads[t] = Math.pow(wScale * avgTanhDeriv, distance) * noise;
    }

    // ─── LSTM Gradient Simulation ───
    // The key insight: gradient flows through the cell state with multiplicative
    // forget gate values, which are close to 1 when properly biased
    lstmGrads = new Float64Array(T);
    var forgetGateAvg = 1 / (1 + Math.exp(-state.lstmForgetBias)); // sigmoid of bias
    for (var t = 0; t < T; t++) {
      var distance = T - 1 - t;
      // Cell state gradient: product of forget gate values
      var noise = 1 + (rng() - 0.5) * 0.15;
      // LSTM maintains gradient much better due to additive cell state
      var cellGrad = Math.pow(forgetGateAvg, distance);
      // But there's also a multiplicative path through the output gate
      var outputContrib = 0.3; // some gradient also flows through output gate path
      lstmGrads[t] = (cellGrad * 0.7 + outputContrib) * noise;
    }

    // Normalize to [0, 1] relative to the final timestep
    var rnnMax = rnnGrads[T - 1];
    var lstmMax = lstmGrads[T - 1];
    for (var t = 0; t < T; t++) {
      rnnGrads[t] = Math.min(1, rnnGrads[t] / (rnnMax + 1e-10));
      lstmGrads[t] = Math.min(1, lstmGrads[t] / (lstmMax + 1e-10));
    }
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var T = state.seqLen;

    // === Top: Gradient flow direction indicator ===
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('GRADIENT MAGNITUDE FLOWING BACKWARD FROM LOSS', PAD.left, PAD.top + 10);

    // Arrow showing backward flow
    ctx.strokeStyle = c.ai;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.left + plotW - 10, PAD.top + 18);
    ctx.lineTo(PAD.left + 10, PAD.top + 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(PAD.left + 10, PAD.top + 18);
    ctx.lineTo(PAD.left + 16, PAD.top + 14);
    ctx.lineTo(PAD.left + 16, PAD.top + 22);
    ctx.closePath();
    ctx.fillStyle = c.ai;
    ctx.fill();

    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = c.ai;
    ctx.fillText('gradient flows \u2190 from loss', PAD.left + plotW, PAD.top + 22);

    // === Main: Gradient bars ===
    var barTop = PAD.top + 32;
    var barAreaH = (HEIGHT - PAD.top - PAD.bottom - 80) / 2;
    var barW = Math.min(20, (plotW - 20) / T);
    var startX = PAD.left + (plotW - barW * T) / 2;

    // RNN gradients
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('VANILLA RNN (|w|=' + state.rnnScale.toFixed(2) + ')', PAD.left, barTop + 8);

    for (var t = 0; t < T; t++) {
      var bh = rnnGrads[t] * (barAreaH - 16);
      var bx = startX + t * barW;
      var by = barTop + 14 + (barAreaH - 16) - bh;

      // Color by magnitude
      var alpha = 0.3 + rnnGrads[t] * 0.7;
      var red = Math.floor(255 * (1 - rnnGrads[t]));
      var green = Math.floor(100 * rnnGrads[t]);
      var blue = Math.floor(200 * rnnGrads[t]);
      ctx.fillStyle = 'rgba(' + (50 + red * 0.7) + ',' + (30 + green) + ',' + (50 + blue * 0.3) + ',' + alpha + ')';
      ctx.fillRect(bx, by, barW - 1, bh);

      // Border for current bars
      if (bh > 1) {
        ctx.strokeStyle = 'rgba(251,113,133,0.4)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, by, barW - 1, bh);
      }
    }

    // Vanishing label
    if (rnnGrads[0] < 0.01) {
      ctx.fillStyle = c.danger;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('\u2190 VANISHED! grad \u2248 0', startX, barTop + barAreaH + 2);
    }

    // Value labels
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('1.0', PAD.left - 4, barTop + 16);
    ctx.fillText('0.0', PAD.left - 4, barTop + barAreaH);

    // LSTM gradients
    var lstmTop = barTop + barAreaH + 16;
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LSTM (forget bias=' + state.lstmForgetBias.toFixed(1) + ', f\u2248' + (1 / (1 + Math.exp(-state.lstmForgetBias))).toFixed(2) + ')', PAD.left, lstmTop + 8);

    for (var t = 0; t < T; t++) {
      var bh = lstmGrads[t] * (barAreaH - 16);
      var bx = startX + t * barW;
      var by = lstmTop + 14 + (barAreaH - 16) - bh;

      var alpha = 0.3 + lstmGrads[t] * 0.7;
      ctx.fillStyle = 'rgba(34,' + Math.floor(140 + 115 * lstmGrads[t]) + ',' + Math.floor(100 + 138 * lstmGrads[t]) + ',' + alpha + ')';
      ctx.fillRect(bx, by, barW - 1, bh);

      if (bh > 1) {
        ctx.strokeStyle = 'rgba(74,222,128,0.4)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, by, barW - 1, bh);
      }
    }

    // Maintained label
    if (lstmGrads[0] > 0.1) {
      ctx.fillStyle = c.math;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('\u2190 MAINTAINED! grad \u2248 ' + lstmGrads[0].toFixed(2), startX, lstmTop + barAreaH + 2);
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('1.0', PAD.left - 4, lstmTop + 16);
    ctx.fillText('0.0', PAD.left - 4, lstmTop + barAreaH);

    // Time axis
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('t=1', startX + barW / 2, lstmTop + barAreaH + 14);
    ctx.fillText('t=' + T, startX + (T - 1) * barW + barW / 2, lstmTop + barAreaH + 14);
    ctx.fillText('(early)', startX + barW / 2, lstmTop + barAreaH + 24);
    ctx.fillText('(loss)', startX + (T - 1) * barW + barW / 2, lstmTop + barAreaH + 24);

    // DSP connection note
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DSP: vanishing gradient = pole |p| < 1 causing exponential decay of h[n] = p\u207f', WIDTH / 2, HEIGHT - 8);
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
