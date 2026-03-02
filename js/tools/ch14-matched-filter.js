/* ============================================================
   Tool 14.2 — Attention as Matched Filtering
   Split-screen: DSP matched filter (left) vs attention (right).
   Changing one side updates the other, showing the equivalence
   between cross-correlation and QK^T.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.MatchedFilter = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;
  var PAD = { top: 10, right: 15, bottom: 10, left: 15 };

  var N = 64;  // signal length

  var state = {
    templateType: 'pulse',   // pulse, chirp, step
    noiseLevel: 0.3,
    templatePos: 20,         // where template is embedded in signal
    showCorrelation: true
  };

  // Signals
  var template = [];       // the template / "query"
  var signal = [];         // the signal containing template + noise / "keys"
  var correlation = [];    // cross-correlation result / "attention scores"
  var attentionWeights = [];  // softmax of scaled correlation

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Matched filter to attention bridge showing correlation-based detection');
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
      HEIGHT = Math.max(480, Math.min(580, WIDTH * 0.72));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSelect(containerEl, 'mf-template', function (v) {
      state.templateType = v;
      computeAll();
      render();
    });

    bindSlider(containerEl, 'mf-noise', function (v) {
      state.noiseLevel = parseFloat(v);
      computeAll();
      render();
    });

    bindSlider(containerEl, 'mf-pos', function (v) {
      state.templatePos = parseInt(v, 10);
      computeAll();
      render();
    });

    computeAll();
    resize();
  }

  function computeAll() {
    var rng = mulberry32(77);
    var M = 12; // template length

    // Generate template
    template = new Float64Array(M);
    switch (state.templateType) {
      case 'pulse':
        for (var i = 0; i < M; i++) {
          template[i] = Math.exp(-0.5 * Math.pow((i - M / 2) / 2, 2));
        }
        break;
      case 'chirp':
        for (var i = 0; i < M; i++) {
          var t = i / M;
          template[i] = Math.sin(2 * Math.PI * (1 + 3 * t) * t) * (1 - Math.pow(2 * t - 1, 2));
        }
        break;
      case 'step':
        for (var i = 0; i < M; i++) {
          template[i] = (i < M / 2) ? -0.8 : 0.8;
        }
        break;
    }

    // Normalize template
    var norm = 0;
    for (var i = 0; i < M; i++) norm += template[i] * template[i];
    norm = Math.sqrt(norm) + 1e-10;
    for (var i = 0; i < M; i++) template[i] /= norm;

    // Generate signal: noise + embedded template
    signal = new Float64Array(N);
    var pos = Math.min(state.templatePos, N - M);

    // Noise
    for (var i = 0; i < N; i++) {
      signal[i] = (rng() - 0.5) * 2 * state.noiseLevel;
    }

    // Embed template
    for (var i = 0; i < M; i++) {
      signal[pos + i] += template[i];
    }

    // Cross-correlation: slide template across signal
    correlation = new Float64Array(N);
    for (var n = 0; n < N; n++) {
      var sum = 0;
      for (var m = 0; m < M; m++) {
        var idx = n + m - Math.floor(M / 2);
        if (idx >= 0 && idx < N) {
          sum += signal[idx] * template[m];
        }
      }
      correlation[n] = sum;
    }

    // Softmax of scaled correlation = attention weights
    var scale = 2.0;
    var maxCorr = -Infinity;
    for (var n = 0; n < N; n++) {
      if (correlation[n] * scale > maxCorr) maxCorr = correlation[n] * scale;
    }
    attentionWeights = new Float64Array(N);
    var expSum = 0;
    for (var n = 0; n < N; n++) {
      attentionWeights[n] = Math.exp(correlation[n] * scale - maxCorr);
      expSum += attentionWeights[n];
    }
    for (var n = 0; n < N; n++) {
      attentionWeights[n] /= expSum;
    }
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var midX = WIDTH / 2;
    var colW = (WIDTH - PAD.left - PAD.right - 30) / 2;

    // ─── Headers ───
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    // Left header: DSP
    ctx.fillStyle = c.dsp || c.signal;
    ctx.fillText('DSP: MATCHED FILTER', PAD.left + colW / 2, PAD.top + 14);

    // Right header: AI
    ctx.fillStyle = c.ai;
    ctx.fillText('AI: ATTENTION MECHANISM', midX + 15 + colW / 2, PAD.top + 14);

    // Divider
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(midX, PAD.top + 24);
    ctx.lineTo(midX, HEIGHT - PAD.bottom - 30);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bridge arrows
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('\u2194 same math', midX, PAD.top + 38);

    // Row heights
    var rowH = (HEIGHT - PAD.top - PAD.bottom - 90) / 4;
    var rowStart = PAD.top + 50;

    // ─── Row 1: Template / Query ───
    drawRow(PAD.left, rowStart, colW, rowH,
      'Template h[n]', template, c.signal, c, true);
    drawRow(midX + 15, rowStart, colW, rowH,
      'Query vector q', template, c.ai, c, true);
    drawBridgeLabel(midX, rowStart + rowH / 2, 'q = h', c);

    // ─── Row 2: Signal / Keys ───
    drawRow(PAD.left, rowStart + rowH, colW, rowH,
      'Signal x[n] (template + noise)', signal, c.signal, c, false);
    drawRow(midX + 15, rowStart + rowH, colW, rowH,
      'Key vectors {k\u2099}', signal, c.math, c, false);
    drawBridgeLabel(midX, rowStart + rowH * 1.5, 'k\u2099 = x[n]', c);

    // Highlight template position in signal
    var M = template.length;
    var pos = Math.min(state.templatePos, N - M);
    highlightRegion(PAD.left, rowStart + rowH, colW, rowH, pos, pos + M, c.ai);
    highlightRegion(midX + 15, rowStart + rowH, colW, rowH, pos, pos + M, c.ai);

    // ─── Row 3: Cross-correlation / Scores ───
    drawRow(PAD.left, rowStart + rowH * 2, colW, rowH,
      'Cross-correlation R_{xh}[n]', correlation, '#f59e0b', c, false);
    drawRow(midX + 15, rowStart + rowH * 2, colW, rowH,
      'Attention scores (q \u00b7 k\u2099)', correlation, '#f59e0b', c, false);
    drawBridgeLabel(midX, rowStart + rowH * 2.5, 'q\u00b7k = R_{xh}', c);

    // Mark peak in correlation
    var peakIdx = 0;
    for (var i = 1; i < N; i++) {
      if (correlation[i] > correlation[peakIdx]) peakIdx = i;
    }
    markPeak(PAD.left, rowStart + rowH * 2, colW, rowH, peakIdx, c);
    markPeak(midX + 15, rowStart + rowH * 2, colW, rowH, peakIdx, c);

    // ─── Row 4: Peak Detection / Softmax Weights ───
    drawRow(PAD.left, rowStart + rowH * 3, colW, rowH,
      'Peak detection \u2192 position', attentionWeights, c.danger || '#fb7185', c, false, true);
    drawRow(midX + 15, rowStart + rowH * 3, colW, rowH,
      'Softmax \u2192 attention weights', attentionWeights, '#4ade80', c, false, true);
    drawBridgeLabel(midX, rowStart + rowH * 3.5, 'softmax \u2248 peak', c);

    // ─── Bottom: DSP connection ───
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QK\u1D40 computes cross-correlation between query and all keys \u2014 softmax picks the best match', WIDTH / 2, HEIGHT - 12);
  }

  function drawRow(x, y, w, h, label, data, color, c, isShort, isBars) {
    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 4, y + 10);

    var plotX = x + 4;
    var plotW = w - 8;
    var plotY = y + 14;
    var plotH = h - 20;
    var len = data.length;

    // Find range
    var minV = Infinity, maxV = -Infinity;
    for (var i = 0; i < len; i++) {
      if (data[i] < minV) minV = data[i];
      if (data[i] > maxV) maxV = data[i];
    }
    var range = maxV - minV || 1;
    var padFrac = 0.1;
    minV -= range * padFrac;
    maxV += range * padFrac;
    range = maxV - minV;

    // Zero line
    var zeroY = plotY + plotH - ((0 - minV) / range) * plotH;
    if (zeroY > plotY && zeroY < plotY + plotH) {
      ctx.strokeStyle = c.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(plotX, zeroY);
      ctx.lineTo(plotX + plotW, zeroY);
      ctx.stroke();
    }

    if (isBars) {
      // Bar chart for attention weights
      var barW = plotW / len;
      for (var i = 0; i < len; i++) {
        var bh = (data[i] / (maxV + 1e-10)) * plotH;
        var bx = plotX + i * barW;
        var by = plotY + plotH - bh;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3 + (data[i] / (maxV + 1e-10)) * 0.7;
        ctx.fillRect(bx, by, barW - 0.5, bh);
        ctx.globalAlpha = 1;
      }
    } else {
      // Line chart
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var i = 0; i < len; i++) {
        var px = plotX + (i / (len - 1)) * plotW;
        var py = plotY + plotH - ((data[i] - minV) / range) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  function highlightRegion(x, y, w, h, startIdx, endIdx, color) {
    var plotX = x + 4;
    var plotW = w - 8;
    var plotY = y + 14;
    var plotH = h - 20;

    var sx = plotX + (startIdx / N) * plotW;
    var ex = plotX + (endIdx / N) * plotW;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(sx, plotY, ex - sx, plotH);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(sx, plotY, ex - sx, plotH);
    ctx.setLineDash([]);
  }

  function markPeak(x, y, w, h, peakIdx, c) {
    var plotX = x + 4;
    var plotW = w - 8;
    var plotY = y + 14;
    var plotH = h - 20;

    var px = plotX + (peakIdx / (N - 1)) * plotW;

    ctx.strokeStyle = c.danger || '#fb7185';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(px, plotY);
    ctx.lineTo(px, plotY + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = c.danger || '#fb7185';
    ctx.beginPath();
    ctx.arc(px, plotY + 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBridgeLabel(x, y, text, c) {
    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
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
