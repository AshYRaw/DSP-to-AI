/* ============================================================
   Tool 20.1 — O(n²) vs O(n) Scaling Explorer
   Interactive chart showing how Attention and Mamba scale
   with sequence length. Compute cost + memory curves.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.ComplexityExplorer = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;

  var state = {
    seqLen: 4096,
    dim: 1024,
    scale: 'log', // 'linear' or 'log'
    N: 16,        // Mamba state dim
    E: 2          // expansion factor
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Complexity comparison showing attention O(n-squared) versus Mamba O(n) scaling');
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
      HEIGHT = Math.max(460, Math.min(560, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSlider(containerEl, 'cx-seqlen', function (v) {
      state.seqLen = parseInt(v, 10);
      render();
    });
    bindSelect(containerEl, 'cx-dim', function (v) { state.dim = parseInt(v, 10); render(); });
    bindSelect(containerEl, 'cx-scale', function (v) { state.scale = v; render(); });

    resize();
  }

  function attnFLOPs(T, d) {
    // 2 * T^2 * d (QK + AV) + 4*T*d^2 (projections)
    return 2 * T * T * d + 4 * T * d * d;
  }

  function mambaFLOPs(T, d) {
    var N = state.N;
    var E = state.E;
    // T * d * E * N (dominant: scan) + 2*T*d*E (projections) + T*E*4 (conv)
    return T * d * E * N + 2 * T * d * E + T * E * 4;
  }

  function attnMem(T, d) {
    // KV cache: 2 * T * d (keys + values)
    return 2 * T * d;
  }

  function mambaMem(T, d) {
    // Fixed state: d * N * E
    return d * state.N * state.E;
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var T = state.seqLen;
    var d = state.dim;

    var PAD = { top: 16, right: 20, bottom: 44, left: 70 };
    var chartH = (HEIGHT - PAD.top - PAD.bottom - 50) / 2;
    var chartW = WIDTH - PAD.left - PAD.right;

    // ─── FLOPS Chart (top) ───
    drawChart(
      PAD.left, PAD.top, chartW, chartH,
      'COMPUTE (FLOPs per layer)', T, d,
      attnFLOPs, mambaFLOPs, c
    );

    // ─── Memory Chart (bottom) ───
    drawChart(
      PAD.left, PAD.top + chartH + 42, chartW, chartH,
      'INFERENCE MEMORY (elements)', T, d,
      attnMem, mambaMem, c
    );

    // ─── Stats bar ───
    var statsY = HEIGHT - 20;
    var attnF = attnFLOPs(T, d);
    var mambaF = mambaFLOPs(T, d);
    var ratio = attnF / Math.max(mambaF, 1);
    var attnM = attnMem(T, d);
    var mambaM = mambaMem(T, d);
    var memRatio = attnM / Math.max(mambaM, 1);

    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    ctx.fillStyle = c.textDim;
    ctx.fillText('T=' + formatLargeNum(T), WIDTH * 0.12, statsY);
    ctx.fillText('d=' + d, WIDTH * 0.24, statsY);

    ctx.fillStyle = '#60a5fa';
    ctx.fillText('Attn: ' + formatLargeNum(attnF) + ' FLOPs', WIDTH * 0.42, statsY);
    ctx.fillStyle = '#4ade80';
    ctx.fillText('Mamba: ' + formatLargeNum(mambaF) + ' FLOPs', WIDTH * 0.64, statsY);

    ctx.fillStyle = c.bridge;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillText('Ratio: ' + ratio.toFixed(0) + 'x compute, ' + memRatio.toFixed(0) + 'x memory', WIDTH * 0.86, statsY);
  }

  function drawChart(x0, y0, w, h, title, T, d, attnFn, mambaFn, c) {
    // Title
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(title, x0, y0 - 2);

    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(x0, y0, w, h);

    // Generate data points
    var points = 60;
    var minT = 64;
    var maxT = 131072;
    var attnVals = [];
    var mambaVals = [];
    var xVals = [];

    for (var i = 0; i < points; i++) {
      var t;
      if (state.scale === 'log') {
        t = Math.round(Math.exp(Math.log(minT) + (Math.log(maxT) - Math.log(minT)) * i / (points - 1)));
      } else {
        t = Math.round(minT + (maxT - minT) * i / (points - 1));
      }
      xVals.push(t);
      attnVals.push(attnFn(t, d));
      mambaVals.push(mambaFn(t, d));
    }

    // Y range
    var maxVal = 0;
    for (var i = 0; i < points; i++) {
      if (attnVals[i] > maxVal) maxVal = attnVals[i];
      if (mambaVals[i] > maxVal) maxVal = mambaVals[i];
    }

    // Map to pixels
    function mapX(t) {
      if (state.scale === 'log') {
        return x0 + (Math.log(t) - Math.log(minT)) / (Math.log(maxT) - Math.log(minT)) * w;
      }
      return x0 + (t - minT) / (maxT - minT) * w;
    }

    function mapY(v) {
      if (state.scale === 'log' && v > 0) {
        var logMin = Math.log(Math.max(mambaVals[0], 1));
        var logMax = Math.log(maxVal);
        return y0 + h - ((Math.log(v) - logMin) / (logMax - logMin)) * h;
      }
      return y0 + h - (v / maxVal) * h;
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(148,163,184,0.1)';
    ctx.lineWidth = 0.5;
    for (var i = 0; i <= 4; i++) {
      var gy = y0 + h * i / 4;
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x0 + w, gy);
      ctx.stroke();
    }

    // Attention curve
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    for (var i = 0; i < points; i++) {
      var px = mapX(xVals[i]);
      var py = mapY(attnVals[i]);
      py = Math.max(y0, Math.min(y0 + h, py));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Mamba curve
    ctx.beginPath();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    for (var i = 0; i < points; i++) {
      var px = mapX(xVals[i]);
      var py = mapY(mambaVals[i]);
      py = Math.max(y0, Math.min(y0 + h, py));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Current T marker
    var markerX = mapX(T);
    ctx.strokeStyle = c.bridge;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(markerX, y0);
    ctx.lineTo(markerX, y0 + h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Marker dots
    var attnAtT = attnFn(T, d);
    var mambaAtT = mambaFn(T, d);
    var attnDotY = mapY(attnAtT);
    var mammaDotY = mapY(mambaAtT);
    attnDotY = Math.max(y0, Math.min(y0 + h, attnDotY));
    mammaDotY = Math.max(y0, Math.min(y0 + h, mammaDotY));

    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(markerX, attnDotY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(markerX, mammaDotY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Labels
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillStyle = '#60a5fa';
    ctx.textAlign = 'left';
    ctx.fillText('Attention O(n\u00B2)', markerX + 8, Math.max(y0 + 10, attnDotY - 4));
    ctx.fillStyle = '#4ade80';
    ctx.fillText('Mamba O(n)', markerX + 8, Math.min(y0 + h - 4, mammaDotY + 10));

    // X-axis labels
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    var xTicks = state.scale === 'log' ? [64, 256, 1024, 4096, 16384, 65536, 131072] : [0, 32768, 65536, 98304, 131072];
    for (var i = 0; i < xTicks.length; i++) {
      var tx = mapX(xTicks[i]);
      if (tx >= x0 && tx <= x0 + w) {
        ctx.fillText(formatLargeNum(xTicks[i]), tx, y0 + h + 10);
      }
    }
    ctx.textAlign = 'center';
    ctx.fillText('Sequence Length T', x0 + w / 2, y0 + h + 22);

    // Axes
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y0 + h);
    ctx.lineTo(x0 + w, y0 + h);
    ctx.stroke();
  }

  function formatLargeNum(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'G';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = cont.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      var v = parseInt(this.value, 10);
      if (disp) disp.textContent = formatLargeNum(v);
      callback(this.value);
    });
    if (disp) disp.textContent = formatLargeNum(parseInt(el.value, 10));
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
