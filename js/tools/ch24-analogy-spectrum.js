/* ============================================================
   Tool 24.1 — Analogy Spectrum
   Interactive visualization: matched filter → attention continuum.
   Adjust softmax temperature τ to see detection efficiency change.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.AnalogySpectrum = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var containerEl;

  var state = {
    temperature: 1.0,
    noise: 0.3,
    numTemplates: 3
  };

  // Simulated signal and templates
  var SEQ_LEN = 32;
  var DIM = 8;
  var signal = [];
  var templates = [];
  var templatePositions = [];
  var linearAttnMatrix = [];
  var softmaxAttnMatrix = [];
  var efficiencyCurve = [];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Analogy Spectrum: matched filter to attention continuum');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(460, Math.min(560, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      compute();
      render();
    }

    bindSlider(containerEl, 'as-temp', function (v) {
      state.temperature = parseFloat(v);
      containerEl.querySelector('[data-value="as-temp"]').textContent = state.temperature.toFixed(2);
      compute(); render();
    });
    bindSlider(containerEl, 'as-noise', function (v) {
      state.noise = parseFloat(v);
      containerEl.querySelector('[data-value="as-noise"]').textContent = state.noise.toFixed(2);
      compute(); render();
    });
    bindSlider(containerEl, 'as-templates', function (v) {
      state.numTemplates = parseInt(v, 10);
      containerEl.querySelector('[data-value="as-templates"]').textContent = v;
      generateSignal(); compute(); render();
    });

    window.addEventListener('resize', resize);
    generateSignal();
    resize();
  }

  function seededRandom(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function generateSignal() {
    signal = [];
    templates = [];
    templatePositions = [];

    // Generate random templates
    for (var t = 0; t < state.numTemplates; t++) {
      var tpl = [];
      for (var d = 0; d < DIM; d++) {
        tpl.push(seededRandom(t * DIM + d + 42) * 2 - 1);
      }
      // Normalize
      var norm = 0;
      for (var d = 0; d < DIM; d++) norm += tpl[d] * tpl[d];
      norm = Math.sqrt(norm) || 1;
      for (var d = 0; d < DIM; d++) tpl[d] /= norm;
      templates.push(tpl);
    }

    // Place templates at random positions
    var step = Math.floor(SEQ_LEN / (state.numTemplates + 1));
    for (var t = 0; t < state.numTemplates; t++) {
      templatePositions.push(step * (t + 1));
    }

    // Generate signal: noise + embedded templates
    for (var i = 0; i < SEQ_LEN; i++) {
      var vec = [];
      for (var d = 0; d < DIM; d++) {
        vec.push(seededRandom(i * DIM + d + 7) * state.noise * 2 - state.noise);
      }
      // Add template if at a template position
      for (var t = 0; t < templatePositions.length; t++) {
        if (i === templatePositions[t]) {
          for (var d = 0; d < DIM; d++) {
            vec[d] += templates[t][d];
          }
        }
      }
      signal.push(vec);
    }
  }

  function dotProduct(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
  }

  function compute() {
    var N = SEQ_LEN;
    var tau = state.temperature;

    // Recompute signal with current noise level
    generateSignal();

    // Compute attention matrices
    linearAttnMatrix = [];
    softmaxAttnMatrix = [];

    for (var i = 0; i < N; i++) {
      var linearRow = [];
      var softmaxRow = [];
      var maxScore = -Infinity;
      var scores = [];

      for (var j = 0; j < N; j++) {
        var score = dotProduct(signal[i], signal[j]) / Math.sqrt(DIM);
        scores.push(score);
        linearRow.push(score);
        if (score > maxScore) maxScore = score;
      }

      // Softmax with temperature
      var expSum = 0;
      for (var j = 0; j < N; j++) {
        var e = Math.exp((scores[j] - maxScore) / tau);
        softmaxRow.push(e);
        expSum += e;
      }
      for (var j = 0; j < N; j++) {
        softmaxRow[j] /= expSum;
      }

      // Normalize linear for comparison
      var linMax = 0;
      for (var j = 0; j < N; j++) {
        if (Math.abs(linearRow[j]) > linMax) linMax = Math.abs(linearRow[j]);
      }
      if (linMax > 0) {
        for (var j = 0; j < N; j++) linearRow[j] /= linMax;
      }

      linearAttnMatrix.push(linearRow);
      softmaxAttnMatrix.push(softmaxRow);
    }

    // Compute detection efficiency curve across temperatures
    efficiencyCurve = [];
    var tauValues = [];
    for (var ti = 0; ti < 50; ti++) {
      var t = 0.05 + ti * 0.1;
      tauValues.push(t);

      // Measure detection: how well do template positions stand out?
      var signalPower = 0;
      var noisePower = 0;
      var count = 0;

      for (var tp = 0; tp < templatePositions.length; tp++) {
        var pos = templatePositions[tp];
        // Compute softmax attention from pos to all positions at this temperature
        var rowScores = [];
        var rowMax = -Infinity;
        for (var j = 0; j < N; j++) {
          var s = dotProduct(signal[pos], signal[j]) / Math.sqrt(DIM);
          rowScores.push(s);
          if (s > rowMax) rowMax = s;
        }

        var rowExp = [];
        var rowExpSum = 0;
        for (var j = 0; j < N; j++) {
          var e = Math.exp((rowScores[j] - rowMax) / t);
          rowExp.push(e);
          rowExpSum += e;
        }

        // Self-attention weight (signal)
        signalPower += (rowExp[pos] / rowExpSum);
        // Average non-template weight (noise)
        for (var j = 0; j < N; j++) {
          if (j !== pos) {
            noisePower += (rowExp[j] / rowExpSum);
            count++;
          }
        }
      }

      var avgNoise = count > 0 ? noisePower / count : 0.001;
      var avgSignal = templatePositions.length > 0 ? signalPower / templatePositions.length : 0;
      var efficiency = avgSignal / (avgNoise + 0.001);
      // Normalize to [0,1] range approximately
      efficiency = Math.min(1, efficiency / (N * 0.5));

      efficiencyCurve.push({ tau: t, eta: efficiency });
    }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var PAD = { top: 14, bottom: 30, left: 12, right: 12 };
    var midGap = 16;
    var topH = HEIGHT * 0.48;
    var bottomH = HEIGHT - topH - PAD.top - PAD.bottom - midGap;
    var halfW = (WIDTH - PAD.left - PAD.right - midGap) / 2;

    // ─── Title ───
    ctx.fillStyle = c.text;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    // ─── Left: Linear Attention Matrix ───
    var lx = PAD.left;
    var ly = PAD.top;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Linear Attention (= Cross-Correlation)', lx + halfW / 2, ly + 6);

    drawMatrix(linearAttnMatrix, lx, ly + 12, halfW, topH - 16, c.dsp, true);

    // ─── Right: Softmax Attention Matrix ───
    var rx = PAD.left + halfW + midGap;
    ctx.fillStyle = c.textDim;
    ctx.fillText('Softmax Attention (\u03C4 = ' + state.temperature.toFixed(2) + ')', rx + halfW / 2, ly + 6);

    drawMatrix(softmaxAttnMatrix, rx, ly + 12, halfW, topH - 16, c.ai, false);

    // Mark template positions on both matrices
    var cellW = halfW / SEQ_LEN;
    var cellH = (topH - 16) / SEQ_LEN;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    for (var tp = 0; tp < templatePositions.length; tp++) {
      var pos = templatePositions[tp];
      // Left matrix
      ctx.strokeRect(lx + pos * cellW, ly + 12 + pos * cellH, cellW, cellH);
      // Right matrix
      ctx.strokeRect(rx + pos * cellW, ly + 12 + pos * cellH, cellW, cellH);
    }

    // ─── Bottom: Detection Efficiency Curve ───
    var bx = PAD.left + 40;
    var by = PAD.top + topH + midGap;
    var bw = WIDTH - PAD.left - PAD.right - 50;
    var bh = bottomH - 10;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Detection Efficiency \u03B7 vs Temperature \u03C4', PAD.left + (WIDTH - PAD.left - PAD.right) / 2, by - 2);

    // Axes
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.stroke();

    // Y label
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('1.0', bx - 4, by + 4);
    ctx.fillText('0.0', bx - 4, by + bh + 3);
    ctx.textAlign = 'center';
    ctx.fillText('\u03C4', bx + bw + 10, by + bh + 3);

    // X ticks
    var tauMin = 0.05, tauMax = 5;
    for (var tick = 0; tick <= 5; tick++) {
      var tv = tick;
      var tx = bx + (tv - tauMin) / (tauMax - tauMin) * bw;
      ctx.fillStyle = c.textDim;
      ctx.fillText(tv.toString(), tx, by + bh + 12);
    }

    // Efficiency curve
    if (efficiencyCurve.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      for (var i = 0; i < efficiencyCurve.length; i++) {
        var pt = efficiencyCurve[i];
        var px = bx + (pt.tau - tauMin) / (tauMax - tauMin) * bw;
        var py = by + bh - pt.eta * bh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Current temperature marker
    var curX = bx + (state.temperature - tauMin) / (tauMax - tauMin) * bw;
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(curX, by);
    ctx.lineTo(curX, by + bh);
    ctx.stroke();
    ctx.setLineDash([]);

    // Matched filter regime band
    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
    var regimeLeft = bx + (0.5 - tauMin) / (tauMax - tauMin) * bw;
    var regimeRight = bx + (2.0 - tauMin) / (tauMax - tauMin) * bw;
    ctx.fillRect(regimeLeft, by, regimeRight - regimeLeft, bh);

    ctx.fillStyle = 'rgba(245, 158, 11, 0.6)';
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Matched Filter Regime', (regimeLeft + regimeRight) / 2, by + 12);

    // Legend
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('\u25A0 Template positions highlighted in amber', PAD.left, HEIGHT - 6);
  }

  function drawMatrix(matrix, x, y, w, h, color, isLinear) {
    var N = matrix.length;
    if (N === 0) return;
    var cellW = w / N;
    var cellH = h / N;

    // Find max value for scaling
    var maxVal = 0.001;
    for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
        var v = isLinear ? Math.abs(matrix[i][j]) : matrix[i][j];
        if (v > maxVal) maxVal = v;
      }
    }

    // Parse color for rgba
    var rgb = hexToRgb(color);

    for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
        var val = isLinear ? Math.abs(matrix[i][j]) / maxVal : matrix[i][j] / maxVal;
        var alpha = Math.max(0, Math.min(1, val));
        ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + (alpha * 0.9).toFixed(3) + ')';
        ctx.fillRect(x + j * cellW, y + i * cellH, cellW - 0.5, cellH - 0.5);
      }
    }
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16)
    };
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('input', function () { callback(this.value); });
  }

  return { init: init };
})();
