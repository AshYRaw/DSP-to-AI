/* ============================================================
   Tool 17.1 — Evolution Playground
   Four stages side-by-side: fixed matched filter → adaptive
   filter bank → learned Q/K projections → full multi-head
   self-attention. Same input through all four systems.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.EvolutionPlayground = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 580;
  var PAD = { top: 10, right: 10, bottom: 10, left: 10 };

  var N = 48;        // signal length
  var M = 8;         // template length

  var state = {
    noiseLevel: 0.3,
    inputVariability: 0.0,  // how much template varies per occurrence
    numTemplates: 2,        // number of embedded templates
    activeStage: -1         // -1 = all, 0-3 = highlight one
  };

  // Signal and results per stage
  var signal = [];
  var templates = [];         // original templates
  var templatePositions = [];
  var stageResults = [];      // 4 stages, each with { scores, weights, label }

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Evolution timeline from matched filter to attention mechanism');
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
      HEIGHT = Math.max(520, Math.min(620, WIDTH * 0.75));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSlider(containerEl, 'evo-noise', function (v) {
      state.noiseLevel = parseFloat(v);
      computeAll();
      render();
    });

    bindSlider(containerEl, 'evo-variability', function (v) {
      state.inputVariability = parseFloat(v);
      computeAll();
      render();
    });

    bindSlider(containerEl, 'evo-templates', function (v) {
      state.numTemplates = parseInt(v, 10);
      computeAll();
      render();
    });

    // Stage highlight buttons
    var stageBtns = containerEl.querySelectorAll('[data-stage]');
    for (var i = 0; i < stageBtns.length; i++) {
      stageBtns[i].addEventListener('click', function () {
        var s = parseInt(this.getAttribute('data-stage'), 10);
        state.activeStage = (state.activeStage === s) ? -1 : s;
        render();
      });
    }

    computeAll();
    resize();
  }

  function computeAll() {
    var rng = mulberry32(99);

    // Generate base templates
    templates = [];
    // Template A: Gaussian pulse
    var tA = new Float64Array(M);
    for (var i = 0; i < M; i++) {
      tA[i] = Math.exp(-0.5 * Math.pow((i - M / 2) / 1.5, 2));
    }
    normalize(tA);
    templates.push(tA);

    // Template B: Chirp burst
    var tB = new Float64Array(M);
    for (var i = 0; i < M; i++) {
      var t = i / M;
      tB[i] = Math.sin(2 * Math.PI * (1 + 4 * t) * t) * (1 - Math.pow(2 * t - 1, 4));
    }
    normalize(tB);
    templates.push(tB);

    // Generate signal with embedded templates
    signal = new Float64Array(N);
    templatePositions = [];

    // Add noise
    for (var i = 0; i < N; i++) {
      signal[i] = (rng() - 0.5) * 2 * state.noiseLevel;
    }

    // Embed templates at random positions
    var positions = [8, 28, 18]; // fixed positions for reproducibility
    for (var t = 0; t < state.numTemplates && t < 3; t++) {
      var tmpl = templates[t % templates.length];
      var pos = positions[t];
      if (pos + M > N) pos = N - M - 2;
      templatePositions.push({ pos: pos, tmplIdx: t % templates.length });

      for (var i = 0; i < M; i++) {
        // Add variability to the embedded template
        var variation = state.inputVariability * (rng() - 0.5) * 2;
        signal[pos + i] += tmpl[i] * (1 + variation);
      }
    }

    // ─── Stage 1: Fixed Matched Filter ───
    // Cross-correlate with template A only (fixed, doesn't adapt)
    var s1Scores = correlate(signal, templates[0]);
    stageResults[0] = {
      scores: s1Scores,
      weights: peakDetect(s1Scores),
      label: 'Fixed Matched Filter',
      sublabel: 'One fixed template, cross-correlation'
    };

    // ─── Stage 2: Adaptive Filter Bank ───
    // Use both templates, take the max at each position
    var s2ScoresA = correlate(signal, templates[0]);
    var s2ScoresB = correlate(signal, templates.length > 1 ? templates[1] : templates[0]);
    var s2Combined = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      s2Combined[i] = Math.max(s2ScoresA[i], s2ScoresB[i]);
    }
    stageResults[1] = {
      scores: s2Combined,
      weights: peakDetect(s2Combined),
      label: 'Adaptive Filter Bank',
      sublabel: 'Multiple templates, best match wins'
    };

    // ─── Stage 3: Learned Q/K Projections ───
    // Simulate by projecting signal into a "query space" before correlating
    // The projection adapts to the input, improving matching
    var projectedSignal = new Float64Array(N);
    var projectedTemplate = new Float64Array(M);
    // Simulate learned projection: enhance the matching dimension
    for (var i = 0; i < N; i++) {
      projectedSignal[i] = signal[i] * 1.2 + (i > 0 ? signal[i - 1] * 0.3 : 0);
    }
    for (var i = 0; i < M; i++) {
      projectedTemplate[i] = templates[0][i] * 1.2 + (i > 0 ? templates[0][i - 1] * 0.3 : 0);
    }
    normalize(projectedTemplate);
    var s3Scores = correlate(projectedSignal, projectedTemplate);
    // Also try template B projected
    var projTemplate2 = new Float64Array(M);
    var tmpl2 = templates.length > 1 ? templates[1] : templates[0];
    for (var i = 0; i < M; i++) {
      projTemplate2[i] = tmpl2[i] * 1.2 + (i > 0 ? tmpl2[i - 1] * 0.3 : 0);
    }
    normalize(projTemplate2);
    var s3Scores2 = correlate(projectedSignal, projTemplate2);
    var s3Combined = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      s3Combined[i] = Math.max(s3Scores[i], s3Scores2[i]);
    }
    stageResults[2] = {
      scores: s3Combined,
      weights: softmaxWeights(s3Combined, 3.0),
      label: 'Learned Q/K Projections',
      sublabel: 'Data-dependent matching via projection'
    };

    // ─── Stage 4: Full Multi-Head Self-Attention ───
    // Simulate: each position attends to all others with data-dependent weights
    var s4Weights = new Float64Array(N);
    // For a "target" position (center), compute attention to all positions
    var target = Math.floor(N / 2);
    var qkScores = new Float64Array(N);

    // Simulate Q/K dot products with learned projections
    var qRng = mulberry32(200);
    // Generate pseudo Q and K vectors
    var qVec = [];
    var kVecs = [];
    var dk = 4;
    for (var j = 0; j < dk; j++) qVec.push(signal[target] * (qRng() - 0.3));
    for (var i = 0; i < N; i++) {
      var kv = [];
      for (var j = 0; j < dk; j++) kv.push(signal[i] * (qRng() - 0.3) + (qRng() - 0.5) * 0.1);
      kVecs.push(kv);
    }
    for (var i = 0; i < N; i++) {
      var dot = 0;
      for (var j = 0; j < dk; j++) dot += qVec[j] * kVecs[i][j];
      qkScores[i] = dot / Math.sqrt(dk);
    }
    // Boost scores near template positions (simulate learned relevance)
    for (var tp = 0; tp < templatePositions.length; tp++) {
      var pos = templatePositions[tp].pos;
      for (var i = 0; i < M; i++) {
        if (pos + i < N) qkScores[pos + i] += 1.5;
      }
    }
    s4Weights = softmaxArray(qkScores);
    stageResults[3] = {
      scores: qkScores,
      weights: s4Weights,
      label: 'Full Self-Attention',
      sublabel: 'All positions attend to all, multi-head'
    };
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var stageColors = ['#f59e0b', '#38bdf8', '#a78bfa', '#4ade80'];

    // ─── Top: Input Signal ───
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('INPUT SIGNAL (noise=' + state.noiseLevel.toFixed(1) + ', variability=' + state.inputVariability.toFixed(1) + ', templates=' + state.numTemplates + ')', PAD.left + 10, PAD.top + 14);

    var sigY = PAD.top + 22;
    var sigH = 60;
    var plotX = PAD.left + 10;
    var plotW = WIDTH - PAD.left - PAD.right - 20;

    drawSignalPlot(plotX, sigY, plotW, sigH, signal, c.text, c);

    // Highlight template regions
    for (var tp = 0; tp < templatePositions.length; tp++) {
      var pos = templatePositions[tp].pos;
      var sx = plotX + (pos / N) * plotW;
      var ex = plotX + ((pos + M) / N) * plotW;
      ctx.fillStyle = stageColors[templatePositions[tp].tmplIdx % stageColors.length];
      ctx.globalAlpha = 0.12;
      ctx.fillRect(sx, sigY + 8, ex - sx, sigH - 10);
      ctx.globalAlpha = 1;
    }

    // ─── Four Stage Panels ───
    var panelTop = sigY + sigH + 16;
    var panelH = (HEIGHT - panelTop - PAD.bottom - 30) / 4;

    for (var s = 0; s < 4; s++) {
      var py = panelTop + s * panelH;
      var result = stageResults[s];
      var color = stageColors[s];
      var isActive = (state.activeStage === -1 || state.activeStage === s);
      var isDimmed = !isActive;

      // Stage background
      if (isDimmed) {
        ctx.globalAlpha = 0.25;
      }

      // Stage number and label
      ctx.fillStyle = color;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('STAGE ' + (s + 1) + ': ' + result.label.toUpperCase(), plotX, py + 10);

      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText(result.sublabel, plotX + ctx.measureText('STAGE ' + (s + 1) + ': ' + result.label.toUpperCase()).width + 10, py + 10);

      // Split panel: scores (left half) and weights (right half)
      var halfW = (plotW - 20) / 2;
      var rowY = py + 16;
      var rowH = panelH - 24;

      // Scores
      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(s < 3 ? 'correlation scores' : 'QK\u1D40/\u221Ad scores', plotX, rowY + 6);

      drawBarPlot(plotX, rowY + 8, halfW, rowH - 12, result.scores, color, c);

      // Weights / detection
      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(s < 2 ? 'peak detection' : 'softmax weights', plotX + halfW + 20, rowY + 6);

      drawBarPlot(plotX + halfW + 20, rowY + 8, halfW, rowH - 12, result.weights, color, c);

      // Mark true positions in weights
      for (var tp = 0; tp < templatePositions.length; tp++) {
        var pos = templatePositions[tp].pos + Math.floor(M / 2);
        if (pos < N) {
          var markerX = plotX + halfW + 20 + (pos / N) * halfW;
          ctx.strokeStyle = '#fb7185';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(markerX, rowY + 8);
          ctx.lineTo(markerX, rowY + rowH - 4);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Score for this stage: how well does it detect true positions?
      var detection = computeDetectionScore(result.weights);
      ctx.fillStyle = detection > 0.6 ? '#4ade80' : (detection > 0.3 ? '#f59e0b' : '#fb7185');
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('detection: ' + (detection * 100).toFixed(0) + '%', plotX + plotW, py + 10);

      if (isDimmed) {
        ctx.globalAlpha = 1;
      }

      // Separator line
      if (s < 3) {
        ctx.strokeStyle = c.gridLine;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(plotX, py + panelH - 2);
        ctx.lineTo(plotX + plotW, py + panelH - 2);
        ctx.stroke();
      }
    }

    // ─── Bottom annotation ───
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Evolution: fixed template \u2192 multiple templates \u2192 learned projections \u2192 full self-attention (data-dependent, multi-head)', WIDTH / 2, HEIGHT - 8);
  }

  function drawSignalPlot(x, y, w, h, data, color, c) {
    var plotY = y + 8;
    var plotH = h - 10;
    var minV = -2, maxV = 2;

    // Zero line
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    var zeroY = plotY + plotH / 2;
    ctx.beginPath();
    ctx.moveTo(x, zeroY);
    ctx.lineTo(x + w, zeroY);
    ctx.stroke();

    // Signal
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i < data.length; i++) {
      var px = x + (i / (data.length - 1)) * w;
      var val = Math.max(minV, Math.min(maxV, data[i]));
      var py = plotY + plotH / 2 - (val / maxV) * (plotH / 2);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function drawBarPlot(x, y, w, h, data, color, c) {
    var barW = w / data.length;
    var maxVal = 0;
    for (var i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > maxVal) maxVal = Math.abs(data[i]);
    }
    if (maxVal < 1e-10) maxVal = 1;

    for (var i = 0; i < data.length; i++) {
      var val = data[i] / maxVal;
      var bh = Math.abs(val) * (h * 0.45);
      var bx = x + i * barW;
      var by;

      if (val >= 0) {
        by = y + h / 2 - bh;
      } else {
        by = y + h / 2;
      }

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2 + Math.abs(val) * 0.6;
      ctx.fillRect(bx, by, barW - 0.5, bh);
      ctx.globalAlpha = 1;
    }

    // Zero line
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
  }

  // ─── Computation helpers ───

  function correlate(sig, tmpl) {
    var result = new Float64Array(sig.length);
    var halfM = Math.floor(tmpl.length / 2);
    for (var n = 0; n < sig.length; n++) {
      var sum = 0;
      for (var m = 0; m < tmpl.length; m++) {
        var idx = n + m - halfM;
        if (idx >= 0 && idx < sig.length) {
          sum += sig[idx] * tmpl[m];
        }
      }
      result[n] = sum;
    }
    return result;
  }

  function peakDetect(scores) {
    var result = new Float64Array(scores.length);
    // Find max
    var maxVal = -Infinity;
    for (var i = 0; i < scores.length; i++) {
      if (scores[i] > maxVal) maxVal = scores[i];
    }
    var threshold = maxVal * 0.5;
    for (var i = 0; i < scores.length; i++) {
      result[i] = scores[i] > threshold ? scores[i] / maxVal : 0;
    }
    return result;
  }

  function softmaxWeights(scores, temperature) {
    var scaled = new Float64Array(scores.length);
    for (var i = 0; i < scores.length; i++) scaled[i] = scores[i] * temperature;
    return softmaxArray(scaled);
  }

  function softmaxArray(arr) {
    var max = -Infinity;
    for (var i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    var result = new Float64Array(arr.length);
    var sum = 0;
    for (var i = 0; i < arr.length; i++) {
      result[i] = Math.exp(arr[i] - max);
      sum += result[i];
    }
    for (var i = 0; i < arr.length; i++) result[i] /= sum;
    return result;
  }

  function normalize(arr) {
    var norm = 0;
    for (var i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
    norm = Math.sqrt(norm) + 1e-10;
    for (var i = 0; i < arr.length; i++) arr[i] /= norm;
  }

  function computeDetectionScore(weights) {
    // What fraction of total weight is concentrated near true template positions?
    var totalNearTrue = 0;
    var totalWeight = 0;
    for (var i = 0; i < weights.length; i++) totalWeight += Math.abs(weights[i]);
    if (totalWeight < 1e-10) return 0;

    for (var tp = 0; tp < templatePositions.length; tp++) {
      var center = templatePositions[tp].pos + Math.floor(M / 2);
      for (var i = Math.max(0, center - 3); i <= Math.min(N - 1, center + 3); i++) {
        totalNearTrue += Math.abs(weights[i]);
      }
    }
    return totalNearTrue / totalWeight;
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
