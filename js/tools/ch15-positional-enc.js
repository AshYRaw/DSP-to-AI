/* ============================================================
   Tool 15.2 — Positional Encoding Visualizer
   Sinusoidal positional encodings as heatmap, dot product
   matrix showing distance encoding, frequency analysis.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.PositionalEncoding = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var PAD = { top: 10, right: 15, bottom: 10, left: 15 };

  var state = {
    maxPos: 50,       // number of positions
    dModel: 32,       // embedding dimension
    selectedDim: -1,  // dimension to highlight waveform
    showDotProduct: true
  };

  // Pre-computed encoding matrix
  var PE = [];      // maxPos x dModel
  var dotMatrix = []; // maxPos x maxPos

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Positional encoding visualizer showing sinusoidal patterns');
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

    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var mx = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
      var my = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;

      // Check if click is on heatmap (to select a dimension)
      var heatX = PAD.left + 50;
      var heatY = PAD.top + 40;
      var heatW = (WIDTH - 40) * 0.55 - 50;
      var heatH = HEIGHT * 0.45;
      var cellW = heatW / state.dModel;

      if (mx >= heatX && mx < heatX + heatW && my >= heatY && my < heatY + heatH) {
        var dim = Math.floor((mx - heatX) / cellW);
        state.selectedDim = (state.selectedDim === dim) ? -1 : dim;
        render();
      }
    });

    bindSlider(containerEl, 'pe-positions', function (v) {
      state.maxPos = parseInt(v, 10);
      computeEncodings();
      render();
    });

    bindSlider(containerEl, 'pe-dims', function (v) {
      state.dModel = parseInt(v, 10);
      computeEncodings();
      render();
    });

    computeEncodings();
    resize();
  }

  function computeEncodings() {
    var T = state.maxPos;
    var d = state.dModel;

    PE = [];
    for (var pos = 0; pos < T; pos++) {
      var row = new Float64Array(d);
      for (var i = 0; i < d; i++) {
        var angle = pos / Math.pow(10000, (2 * Math.floor(i / 2)) / d);
        if (i % 2 === 0) {
          row[i] = Math.sin(angle);
        } else {
          row[i] = Math.cos(angle);
        }
      }
      PE.push(row);
    }

    // Dot product matrix: PE[i] · PE[j]
    dotMatrix = [];
    for (var i = 0; i < T; i++) {
      var row = new Float64Array(T);
      for (var j = 0; j < T; j++) {
        var dot = 0;
        for (var k = 0; k < d; k++) {
          dot += PE[i][k] * PE[j][k];
        }
        row[j] = dot;
      }
      dotMatrix.push(row);
    }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var leftW = (WIDTH - 30) * 0.55;
    var rightX = PAD.left + leftW + 30;
    var rightW = WIDTH - rightX - PAD.right;

    // ─── Left: Encoding Heatmap ───
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('POSITIONAL ENCODING HEATMAP', PAD.left + 50, PAD.top + 14);

    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillStyle = c.ai;
    ctx.fillText('PE(pos,2i) = sin(pos/10000^(2i/d)), PE(pos,2i+1) = cos(...)', PAD.left + 50, PAD.top + 28);

    var heatX = PAD.left + 50;
    var heatY = PAD.top + 40;
    var heatW = leftW - 50;
    var heatH = HEIGHT * 0.42;
    var cellW = heatW / state.dModel;
    var cellH = heatH / state.maxPos;

    // Heatmap
    for (var pos = 0; pos < state.maxPos; pos++) {
      for (var dim = 0; dim < state.dModel; dim++) {
        var val = PE[pos][dim]; // [-1, 1]
        var norm = (val + 1) / 2; // [0, 1]

        // Purple-white-green diverging
        var r, g, b;
        if (norm < 0.5) {
          var t = norm * 2;
          r = Math.floor(120 + 60 * t);
          g = Math.floor(40 + 80 * t);
          b = Math.floor(200 - 40 * t);
        } else {
          var t = (norm - 0.5) * 2;
          r = Math.floor(180 - 140 * t);
          g = Math.floor(120 + 100 * t);
          b = Math.floor(160 - 100 * t);
        }

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(heatX + dim * cellW, heatY + pos * cellH, Math.max(1, cellW - 0.5), Math.max(1, cellH - 0.5));
      }
    }

    // Selected dimension highlight
    if (state.selectedDim >= 0 && state.selectedDim < state.dModel) {
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      ctx.strokeRect(heatX + state.selectedDim * cellW - 1, heatY - 1, cellW + 2, heatH + 2);
    }

    // Axis labels
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('dim 0', heatX + cellW / 2, heatY + heatH + 10);
    ctx.fillText('dim ' + (state.dModel - 1), heatX + (state.dModel - 0.5) * cellW, heatY + heatH + 10);
    ctx.fillText('dimension \u2192', heatX + heatW / 2, heatY + heatH + 20);

    ctx.textAlign = 'right';
    ctx.fillText('pos 0', heatX - 4, heatY + cellH / 2 + 3);
    ctx.fillText('pos ' + (state.maxPos - 1), heatX - 4, heatY + heatH - 2);

    ctx.save();
    ctx.translate(heatX - 30, heatY + heatH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('position \u2192', 0, 0);
    ctx.restore();

    // ─── Below heatmap: selected dimension waveform ───
    var waveY = heatY + heatH + 30;
    var waveH = HEIGHT - waveY - PAD.bottom - 30;

    if (state.selectedDim >= 0 && waveH > 30) {
      var dim = state.selectedDim;
      var isEven = (dim % 2 === 0);
      var freqIdx = Math.floor(dim / 2);
      var wavelength = 2 * Math.PI * Math.pow(10000, (2 * freqIdx) / state.dModel);

      ctx.fillStyle = c.text;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Dim ' + dim + ': ' + (isEven ? 'sin' : 'cos') + '(pos / 10000^(' + (2 * freqIdx) + '/' + state.dModel + '))', heatX, waveY);
      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('wavelength \u2248 ' + wavelength.toFixed(1) + (freqIdx === 0 ? ' (fastest)' : freqIdx >= state.dModel / 2 - 1 ? ' (slowest)' : ''), heatX, waveY + 13);

      // Draw waveform
      var plotY = waveY + 20;
      var plotH = waveH - 24;

      // Zero line
      ctx.strokeStyle = c.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(heatX, plotY + plotH / 2);
      ctx.lineTo(heatX + heatW, plotY + plotH / 2);
      ctx.stroke();

      // Waveform
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var pos = 0; pos < state.maxPos; pos++) {
        var px = heatX + (pos / (state.maxPos - 1)) * heatW;
        var py = plotY + plotH / 2 - PE[pos][dim] * (plotH / 2 - 4);
        if (pos === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Sample dots
      if (state.maxPos <= 60) {
        ctx.fillStyle = c.ai;
        for (var pos = 0; pos < state.maxPos; pos++) {
          var px = heatX + (pos / (state.maxPos - 1)) * heatW;
          var py = plotY + plotH / 2 - PE[pos][dim] * (plotH / 2 - 4);
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (waveH > 30) {
      ctx.fillStyle = c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Click a column in the heatmap to see its waveform', heatX, waveY + 10);
    }

    // ─── Right: Dot Product Matrix ───
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DOT PRODUCT MATRIX', rightX, PAD.top + 14);

    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillStyle = c.math;
    ctx.fillText('PE(i) \u00b7 PE(j) \u2014 encodes relative distance', rightX, PAD.top + 28);

    var dotY = PAD.top + 40;
    var dotSize = Math.min(rightW - 10, HEIGHT * 0.42);
    var dotCellSize = dotSize / state.maxPos;

    // Find range for normalization
    var dotMax = 0;
    for (var i = 0; i < state.maxPos; i++) {
      for (var j = 0; j < state.maxPos; j++) {
        if (Math.abs(dotMatrix[i][j]) > dotMax) dotMax = Math.abs(dotMatrix[i][j]);
      }
    }

    for (var i = 0; i < state.maxPos; i++) {
      for (var j = 0; j < state.maxPos; j++) {
        var val = dotMatrix[i][j] / (dotMax + 1e-10);
        var norm = (val + 1) / 2;

        // Dark blue to yellow-white
        var r = Math.floor(20 + 235 * norm);
        var g = Math.floor(20 + 200 * norm);
        var b = Math.floor(80 + 40 * norm);

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(rightX + j * dotCellSize, dotY + i * dotCellSize,
          Math.max(1, dotCellSize), Math.max(1, dotCellSize));
      }
    }

    // Axis labels
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('position j \u2192', rightX + dotSize / 2, dotY + dotSize + 12);
    ctx.save();
    ctx.translate(rightX - 10, dotY + dotSize / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('position i \u2192', 0, 0);
    ctx.restore();

    // Key insight
    var insightY = dotY + dotSize + 24;
    ctx.fillStyle = c.math;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Diagonal = self-similarity (max)', rightX, insightY);
    ctx.fillText('Off-diagonal decays with |i-j|', rightX, insightY + 12);
    ctx.fillText('\u2192 Encodes relative position!', rightX, insightY + 24);

    // Cross-section plot: dot product as function of distance
    var crossY = insightY + 44;
    var crossH = HEIGHT - crossY - PAD.bottom - 20;
    var crossW = rightW - 10;

    if (crossH > 40) {
      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('PE(0) \u00b7 PE(d) vs distance d:', rightX, crossY);

      var plotY = crossY + 12;
      var plotH = crossH - 16;

      // Zero line
      ctx.strokeStyle = c.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(rightX, plotY + plotH);
      ctx.lineTo(rightX + crossW, plotY + plotH);
      ctx.stroke();

      // Curve: dot product of PE[0] with PE[d]
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var d = 0; d < state.maxPos; d++) {
        var px = rightX + (d / (state.maxPos - 1)) * crossW;
        var val = dotMatrix[0][d] / (dotMax + 1e-10);
        var py = plotY + plotH - val * plotH;
        if (d === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('d=0', rightX, plotY + plotH + 10);
      ctx.textAlign = 'right';
      ctx.fillText('d=' + (state.maxPos - 1), rightX + crossW, plotY + plotH + 10);
    }

    // ─── Bottom: DSP connection ───
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DSP: sinusoidal PE = Fourier basis for position. Low dims = low freq (coarse), high dims = high freq (fine).', WIDTH / 2, HEIGHT - 8);
  }

  // ─── Utilities ───

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
