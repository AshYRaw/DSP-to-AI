/* ============================================================
   Tool 12.1 — RNN Unroller
   Character-level RNN/LSTM processing text. Shows folded
   diagram, unrolled view, hidden state heatmap, gate values.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.RNNUnroller = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 480;
  var PAD = { top: 10, right: 20, bottom: 10, left: 20 };

  var hiddenSize = 8;
  var vocabSize = 27; // a-z + space

  // Weights (random but seeded for consistency)
  var rng;
  var weightsRNN = {};
  var weightsLSTM = {};

  var state = {
    mode: 'rnn',          // rnn | lstm
    inputText: 'hello world',
    currentStep: 0,
    hiddenStates: [],     // array of Float64Array per timestep
    gateValues: [],       // for LSTM: {f,i,o,c} per timestep
    outputProbs: []       // output probability distributions
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'RNN unrolling visualization showing recurrent connections across time steps');
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
      HEIGHT = Math.max(440, Math.min(520, WIDTH * 0.6));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    initWeights();

    bindSelect(containerEl, 'rnn-mode', function (v) {
      state.mode = v;
      runSequence();
      render();
    });
    bindSelect(containerEl, 'rnn-text', function (v) {
      state.inputText = v;
      state.currentStep = 0;
      runSequence();
      render();
    });

    var nextBtn = containerEl.querySelector('[data-action="rnn-next"]');
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (state.currentStep < state.inputText.length - 1) state.currentStep++;
      render();
    });
    var prevBtn = containerEl.querySelector('[data-action="rnn-prev"]');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      if (state.currentStep > 0) state.currentStep--;
      render();
    });
    var allBtn = containerEl.querySelector('[data-action="rnn-all"]');
    if (allBtn) allBtn.addEventListener('click', function () {
      state.currentStep = state.inputText.length - 1;
      render();
    });

    runSequence();
    resize();
  }

  // ─── Character Encoding ───

  function charToIdx(c) {
    if (c === ' ') return 26;
    var code = c.toLowerCase().charCodeAt(0) - 97;
    if (code < 0 || code > 25) return 26;
    return code;
  }

  function oneHot(idx) {
    var v = new Float64Array(vocabSize);
    v[idx] = 1;
    return v;
  }

  // ─── Weight Initialization ───

  function initWeights() {
    rng = mulberry32(99);

    // Vanilla RNN: h = tanh(Wh*h + Wx*x + b)
    weightsRNN.Wh = randMatrix(hiddenSize, hiddenSize, 0.3);
    weightsRNN.Wx = randMatrix(hiddenSize, vocabSize, 0.3);
    weightsRNN.bh = randVector(hiddenSize, 0.1);
    weightsRNN.Wy = randMatrix(vocabSize, hiddenSize, 0.3);
    weightsRNN.by = randVector(vocabSize, 0.1);

    // LSTM: forget, input, output gates + cell candidate
    weightsLSTM.Wf = randMatrix(hiddenSize, hiddenSize + vocabSize, 0.2);
    weightsLSTM.bf = fillVector(hiddenSize, 1.0); // bias toward remembering
    weightsLSTM.Wi = randMatrix(hiddenSize, hiddenSize + vocabSize, 0.2);
    weightsLSTM.bi = randVector(hiddenSize, 0.1);
    weightsLSTM.Wo = randMatrix(hiddenSize, hiddenSize + vocabSize, 0.2);
    weightsLSTM.bo = randVector(hiddenSize, 0.1);
    weightsLSTM.Wc = randMatrix(hiddenSize, hiddenSize + vocabSize, 0.2);
    weightsLSTM.bc = randVector(hiddenSize, 0.1);
    weightsLSTM.Wy = randMatrix(vocabSize, hiddenSize, 0.3);
    weightsLSTM.by = randVector(vocabSize, 0.1);
  }

  function randMatrix(rows, cols, scale) {
    var m = [];
    for (var i = 0; i < rows; i++) {
      var row = new Float64Array(cols);
      for (var j = 0; j < cols; j++) row[j] = (rng() * 2 - 1) * scale;
      m.push(row);
    }
    return m;
  }

  function randVector(n, scale) {
    var v = new Float64Array(n);
    for (var i = 0; i < n; i++) v[i] = (rng() * 2 - 1) * scale;
    return v;
  }

  function fillVector(n, val) {
    var v = new Float64Array(n);
    for (var i = 0; i < n; i++) v[i] = val;
    return v;
  }

  // ─── Math Helpers ───

  function matVec(M, v) {
    var out = new Float64Array(M.length);
    for (var i = 0; i < M.length; i++) {
      var sum = 0;
      for (var j = 0; j < v.length; j++) sum += M[i][j] * v[j];
      out[i] = sum;
    }
    return out;
  }

  function vecAdd(a, b) {
    var out = new Float64Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] + b[i];
    return out;
  }

  function vecMul(a, b) {
    var out = new Float64Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] * b[i];
    return out;
  }

  function concat(a, b) {
    var out = new Float64Array(a.length + b.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i];
    for (var i = 0; i < b.length; i++) out[a.length + i] = b[i];
    return out;
  }

  function sigmoid(v) {
    var out = new Float64Array(v.length);
    for (var i = 0; i < v.length; i++) out[i] = 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, v[i]))));
    return out;
  }

  function tanhVec(v) {
    var out = new Float64Array(v.length);
    for (var i = 0; i < v.length; i++) out[i] = Math.tanh(v[i]);
    return out;
  }

  function softmax(v) {
    var max = -Infinity;
    for (var i = 0; i < v.length; i++) if (v[i] > max) max = v[i];
    var out = new Float64Array(v.length);
    var sum = 0;
    for (var i = 0; i < v.length; i++) {
      out[i] = Math.exp(v[i] - max);
      sum += out[i];
    }
    for (var i = 0; i < v.length; i++) out[i] /= sum;
    return out;
  }

  // ─── Forward Pass ───

  function runSequence() {
    state.hiddenStates = [];
    state.gateValues = [];
    state.outputProbs = [];

    var h = new Float64Array(hiddenSize);
    var c = new Float64Array(hiddenSize); // cell state for LSTM

    for (var t = 0; t < state.inputText.length; t++) {
      var x = oneHot(charToIdx(state.inputText[t]));

      if (state.mode === 'rnn') {
        // h = tanh(Wh*h + Wx*x + bh)
        var hPart = matVec(weightsRNN.Wh, h);
        var xPart = matVec(weightsRNN.Wx, x);
        h = tanhVec(vecAdd(vecAdd(hPart, xPart), weightsRNN.bh));

        // output
        var y = softmax(vecAdd(matVec(weightsRNN.Wy, h), weightsRNN.by));

        state.hiddenStates.push(new Float64Array(h));
        state.gateValues.push(null);
        state.outputProbs.push(y);
      } else {
        // LSTM
        var hx = concat(h, x);

        var ft = sigmoid(vecAdd(matVec(weightsLSTM.Wf, hx), weightsLSTM.bf));
        var it = sigmoid(vecAdd(matVec(weightsLSTM.Wi, hx), weightsLSTM.bi));
        var ot = sigmoid(vecAdd(matVec(weightsLSTM.Wo, hx), weightsLSTM.bo));
        var cCandidate = tanhVec(vecAdd(matVec(weightsLSTM.Wc, hx), weightsLSTM.bc));

        c = vecAdd(vecMul(ft, c), vecMul(it, cCandidate));
        h = vecMul(ot, tanhVec(c));

        var y = softmax(vecAdd(matVec(weightsLSTM.Wy, h), weightsLSTM.by));

        state.hiddenStates.push(new Float64Array(h));
        state.gateValues.push({
          f: new Float64Array(ft),
          i: new Float64Array(it),
          o: new Float64Array(ot),
          c: new Float64Array(c)
        });
        state.outputProbs.push(y);
      }
    }
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var topH = HEIGHT * 0.45;
    var bottomH = HEIGHT * 0.55 - 20;

    // === Top: Unrolled Network Diagram ===
    drawUnrolled(PAD.left, PAD.top, plotW, topH, c);

    // === Bottom: Hidden State Heatmap + Gate Values ===
    drawHeatmap(PAD.left, PAD.top + topH + 10, plotW, bottomH, c);
  }

  function drawUnrolled(x0, y0, w, h, c) {
    var T = state.inputText.length;
    var stepW = Math.min(60, (w - 20) / T);
    var startX = x0 + (w - stepW * T) / 2;

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('UNROLLED ' + state.mode.toUpperCase() + ' (' + T + ' steps)', x0, y0 + 10);

    var boxH = h * 0.35;
    var boxW = stepW * 0.7;
    var boxY = y0 + 25 + (h - 25 - boxH) / 2;

    for (var t = 0; t < T; t++) {
      var bx = startX + t * stepW + (stepW - boxW) / 2;
      var active = t <= state.currentStep;
      var isCurrent = t === state.currentStep;

      // Box
      ctx.fillStyle = isCurrent ? 'rgba(251,146,60,0.15)' : (active ? 'rgba(34,211,238,0.08)' : 'rgba(0,0,0,0.15)');
      ctx.fillRect(bx, boxY, boxW, boxH);
      ctx.strokeStyle = isCurrent ? c.ai : (active ? c.dsp : c.border);
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.strokeRect(bx, boxY, boxW, boxH);

      // Cell label
      ctx.fillStyle = active ? c.text : c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(state.mode.toUpperCase(), bx + boxW / 2, boxY + boxH / 2 + 3);

      // Input character below
      ctx.fillStyle = active ? c.dsp : c.textDim;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(state.inputText[t] === ' ' ? '\u2423' : state.inputText[t], bx + boxW / 2, boxY + boxH + 16);

      // Arrow up from input
      if (active) {
        ctx.strokeStyle = c.dsp;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + boxW / 2, boxY + boxH + 4);
        ctx.lineTo(bx + boxW / 2, boxY + boxH);
        ctx.stroke();
      }

      // Hidden state arrow (right)
      if (t < T - 1) {
        var nextBx = startX + (t + 1) * stepW + (stepW - boxW) / 2;
        ctx.strokeStyle = active ? 'rgba(167,139,250,0.6)' : c.border;
        ctx.lineWidth = active ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(bx + boxW, boxY + boxH / 2);
        ctx.lineTo(nextBx, boxY + boxH / 2);
        ctx.stroke();
        // Arrowhead
        if (active) {
          ctx.beginPath();
          ctx.moveTo(nextBx, boxY + boxH / 2);
          ctx.lineTo(nextBx - 5, boxY + boxH / 2 - 3);
          ctx.lineTo(nextBx - 5, boxY + boxH / 2 + 3);
          ctx.closePath();
          ctx.fillStyle = c.bridge;
          ctx.fill();
        }
      }

      // h label above arrow
      if (t < T - 1 && active) {
        ctx.fillStyle = c.bridge;
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('h\u2099', bx + boxW + stepW * 0.15, boxY + boxH / 2 - 5);
      }

      // Top output label for current step
      if (isCurrent && state.outputProbs[t]) {
        var topIdx = 0;
        for (var k = 1; k < vocabSize; k++) {
          if (state.outputProbs[t][k] > state.outputProbs[t][topIdx]) topIdx = k;
        }
        var topChar = topIdx === 26 ? '\u2423' : String.fromCharCode(97 + topIdx);
        ctx.fillStyle = c.ai;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('\u2192 ' + topChar, bx + boxW / 2, boxY - 6);
      }
    }

    // Step indicator
    ctx.fillStyle = c.ai;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Step ' + (state.currentStep + 1) + '/' + T, x0 + w, y0 + 10);
  }

  function drawHeatmap(x0, y0, w, h, c) {
    var T = state.inputText.length;

    // === Left: Hidden state heatmap ===
    var heatW = w * (state.mode === 'lstm' ? 0.45 : 0.7);
    var gateW = state.mode === 'lstm' ? w * 0.55 - 10 : 0;
    var gateX = x0 + heatW + 10;

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HIDDEN STATE h[t] (rows=neurons, cols=time)', x0, y0 + 10);

    var hmTop = y0 + 18;
    var hmH = h - 30;
    var cellW = Math.min(20, heatW / T);
    var cellH = hmH / hiddenSize;
    var hmStartX = x0 + (heatW - cellW * T) / 2;

    for (var t = 0; t < T; t++) {
      var active = t <= state.currentStep;
      for (var n = 0; n < hiddenSize; n++) {
        var val = active ? state.hiddenStates[t][n] : 0;
        ctx.fillStyle = heatColor(val);
        ctx.fillRect(hmStartX + t * cellW, hmTop + n * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }

      // Character label
      ctx.fillStyle = t === state.currentStep ? c.ai : (active ? c.text : c.textDim);
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      var charLabel = state.inputText[t] === ' ' ? '\u2423' : state.inputText[t];
      ctx.fillText(charLabel, hmStartX + t * cellW + cellW / 2, hmTop + hmH + 10);
    }

    // Neuron labels
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (var n = 0; n < hiddenSize; n++) {
      ctx.fillText('h' + n, hmStartX - 3, hmTop + n * cellH + cellH / 2 + 2);
    }

    // Current step highlight
    if (state.currentStep < T) {
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      ctx.strokeRect(hmStartX + state.currentStep * cellW - 1, hmTop - 1, cellW + 2, hmH + 2);
    }

    // Color legend
    var legX = hmStartX + T * cellW + 8;
    var legH = hmH * 0.8;
    var legTop = hmTop + (hmH - legH) / 2;
    for (var i = 0; i < legH; i++) {
      var v = 1 - 2 * i / legH;
      ctx.fillStyle = heatColor(v);
      ctx.fillRect(legX, legTop + i, 8, 2);
    }
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('+1', legX + 12, legTop + 4);
    ctx.fillText(' 0', legX + 12, legTop + legH / 2 + 2);
    ctx.fillText('-1', legX + 12, legTop + legH);

    // === Right: LSTM Gate Values ===
    if (state.mode === 'lstm' && gateW > 0) {
      drawGateValues(gateX, y0, gateW, h, c);
    }
  }

  function drawGateValues(x0, y0, w, h, c) {
    var t = state.currentStep;
    var gates = state.gateValues[t];
    if (!gates) return;

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LSTM GATES at step ' + (t + 1), x0, y0 + 10);

    var gateNames = [
      { key: 'f', label: 'Forget gate', color: '#fb7185' },
      { key: 'i', label: 'Input gate', color: '#4ade80' },
      { key: 'o', label: 'Output gate', color: '#fbbf24' },
      { key: 'c', label: 'Cell state', color: '#a78bfa' }
    ];

    var barTop = y0 + 22;
    var gateH = (h - 34) / 4;
    var barW = w - 10;

    for (var g = 0; g < gateNames.length; g++) {
      var gy = barTop + g * gateH;
      var gateData = gates[gateNames[g].key];

      // Label
      ctx.fillStyle = gateNames[g].color;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(gateNames[g].label, x0, gy + 8);

      // Bar chart of gate values
      var barH = gateH - 16;
      var cellW = barW / hiddenSize;
      for (var n = 0; n < hiddenSize; n++) {
        var val = gateData[n];
        var normVal;
        if (gateNames[g].key === 'c') {
          // Cell state can be negative
          normVal = (val + 1) / 2; // map [-1,1] to [0,1]
        } else {
          normVal = val; // gates are already [0,1]
        }
        normVal = Math.max(0, Math.min(1, normVal));
        var bh = normVal * barH;

        ctx.fillStyle = gateNames[g].color;
        ctx.globalAlpha = 0.3 + normVal * 0.7;
        ctx.fillRect(x0 + n * cellW, gy + 12 + barH - bh, cellW - 1, bh);
        ctx.globalAlpha = 1;
      }

      // Mean value
      var mean = 0;
      for (var n = 0; n < hiddenSize; n++) mean += gateData[n];
      mean /= hiddenSize;
      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('avg=' + mean.toFixed(2), x0 + barW, gy + 8);
    }
  }

  function heatColor(val) {
    // Blue (-1) → black (0) → orange (+1)
    val = Math.max(-1, Math.min(1, val));
    if (val >= 0) {
      var r = Math.floor(50 + 200 * val);
      var g = Math.floor(30 + 120 * val);
      var b = Math.floor(15 + 20 * val);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    } else {
      var v = -val;
      var r = Math.floor(15 + 20 * v);
      var g = Math.floor(40 + 80 * v);
      var b = Math.floor(60 + 190 * v);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
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
