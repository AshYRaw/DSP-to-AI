/* ============================================================
   Tool 23.1 — Capstone Integrator
   Build a hybrid model, process a signal, see both AI view
   (layer activations) and DSP view (filter responses).
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.Capstone = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;

  var T = 32; // signal length
  var state = {
    arch: 'hybrid-light',
    signal: 'mixed',
    numLayers: 8,
    N: 8
  };

  // Computed
  var inputSignal = [];
  var isImportant = [];
  var layerTypes = [];
  var layerOutputs = [];   // per layer, T values
  var layerStates = [];    // per layer (SSM only), T x N
  var layerAttnMaps = [];  // per layer (attn only), T x T

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Capstone project integrator connecting DSP and AI concepts');
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

    bindSelect(containerEl, 'cap-arch', function (v) { state.arch = v; simulate(); render(); });
    bindSelect(containerEl, 'cap-signal', function (v) { state.signal = v; simulate(); render(); });
    bindSlider(containerEl, 'cap-layers', function (v) { state.numLayers = parseInt(v, 10); simulate(); render(); });
    bindSelect(containerEl, 'cap-N', function (v) { state.N = parseInt(v, 10); simulate(); render(); });

    simulate();
    resize();
  }

  function buildArchitecture() {
    var L = state.numLayers;
    layerTypes = [];

    if (state.arch === 'pure-ssm') {
      for (var i = 0; i < L; i++) layerTypes.push('ssm');
    } else if (state.arch === 'pure-attn') {
      for (var i = 0; i < L; i++) layerTypes.push('attn');
    } else if (state.arch === 'hybrid-light') {
      // 1:7 ratio, attention in later layers
      for (var i = 0; i < L; i++) layerTypes.push('ssm');
      var numAttn = Math.max(1, Math.round(L / 8));
      for (var i = 0; i < numAttn; i++) {
        var idx = L - 1 - i * 2;
        if (idx >= 0) layerTypes[idx] = 'attn';
      }
    } else { // hybrid-heavy
      // 1:3 ratio
      for (var i = 0; i < L; i++) layerTypes.push('ssm');
      var numAttn = Math.max(1, Math.round(L / 4));
      var spacing = Math.floor(L / numAttn);
      for (var i = 0; i < numAttn; i++) {
        var idx = Math.min(Math.round(spacing * (i + 0.5)), L - 1);
        layerTypes[idx] = 'attn';
      }
    }
  }

  function generateSignal() {
    inputSignal = new Float64Array(T);
    isImportant = [];

    if (state.signal === 'mixed') {
      // Local patterns + long-range + key-value
      for (var i = 0; i < T; i++) {
        var local = 0.3 * Math.sin(2 * Math.PI * i / 5);
        var kv = 0;
        if (i === 3 || i === 4) kv = 0.7;  // key-value pair
        if (i === T - 3) kv = 0.6;          // query
        var noise = Math.random() * 0.1;
        inputSignal[i] = local + kv + noise;
        isImportant.push(kv > 0.3);
      }
    } else if (state.signal === 'periodic') {
      for (var i = 0; i < T; i++) {
        inputSignal[i] = 0.5 + 0.4 * Math.sin(2 * Math.PI * i / 6) + 0.2 * Math.sin(2 * Math.PI * i / 13);
        isImportant.push(inputSignal[i] > 0.7);
      }
    } else { // sparse spikes
      for (var i = 0; i < T; i++) {
        var isSp = (i === 4 || i === 12 || i === 20 || i === 28);
        inputSignal[i] = isSp ? 1.0 : Math.random() * 0.08;
        isImportant.push(isSp);
      }
    }
  }

  function simulate() {
    buildArchitecture();
    generateSignal();

    var L = layerTypes.length;
    var N = state.N;

    layerOutputs = [];
    layerStates = [];
    layerAttnMaps = [];

    var currentSignal = new Float64Array(inputSignal);

    for (var l = 0; l < L; l++) {
      if (layerTypes[l] === 'ssm') {
        var result = runSSMLayer(currentSignal, N);
        layerOutputs.push(result.output);
        layerStates.push(result.states);
        layerAttnMaps.push(null);
        // Residual connection
        currentSignal = new Float64Array(T);
        for (var n = 0; n < T; n++) {
          currentSignal[n] = inputSignal[n] * 0.3 + result.output[n] * 0.7;
        }
      } else {
        var result = runAttnLayer(currentSignal);
        layerOutputs.push(result.output);
        layerStates.push(null);
        layerAttnMaps.push(result.attnMap);
        currentSignal = new Float64Array(T);
        for (var n = 0; n < T; n++) {
          currentSignal[n] = inputSignal[n] * 0.3 + result.output[n] * 0.7;
        }
      }
    }
  }

  function runSSMLayer(input, N) {
    var A_diag = new Float64Array(N);
    for (var i = 0; i < N; i++) A_diag[i] = -(i + 1) * 0.4;

    var output = new Float64Array(T);
    var states = [];
    var x = new Float64Array(N);

    for (var n = 0; n < T; n++) {
      var rawDt = input[n] * 2.5 - 0.3;
      var dt = Math.log(1 + Math.exp(rawDt));
      if (isImportant[n]) dt = Math.max(dt, 0.5);
      else dt = Math.min(dt, 0.2);

      var newX = new Float64Array(N);
      var y = 0;
      for (var i = 0; i < N; i++) {
        var a_bar = Math.exp(A_diag[i] * dt);
        var b = Math.sin(input[n] * (i + 1) * 1.8 + 0.5) * 0.3 + 0.5;
        var c = Math.cos(input[n] * (i + 1) * 1.4 + 0.3) * 0.3 + 0.5;
        newX[i] = a_bar * x[i] + dt * b * input[n];
        y += c * newX[i];
      }
      x = newX;
      states.push(new Float64Array(x));
      output[n] = y / N;
    }
    return { output: output, states: states };
  }

  function runAttnLayer(input) {
    var output = new Float64Array(T);
    var attnMap = [];

    for (var n = 0; n < T; n++) {
      var row = new Float64Array(T);
      var maxScore = -Infinity;

      for (var k = 0; k <= n; k++) {
        var score = input[n] * input[k] * 2.5;
        score += Math.exp(-Math.abs(input[n] - input[k]) * 4);
        score += 0.2 / (1 + (n - k) * 0.05);
        row[k] = score;
        if (score > maxScore) maxScore = score;
      }

      var expSum = 0;
      for (var k = 0; k <= n; k++) {
        row[k] = Math.exp(row[k] - maxScore);
        expSum += row[k];
      }
      for (var k = 0; k <= n; k++) row[k] /= expSum;

      var y = 0;
      for (var k = 0; k <= n; k++) y += row[k] * input[k];
      output[n] = y;
      attnMap.push(row);
    }
    return { output: output, attnMap: attnMap };
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var L = layerTypes.length;
    var PAD = 12;

    // ─── Layer stack (left) ───
    var stackW = 40;
    var stackY = PAD + 20;
    var stackH = HEIGHT - stackY - 50;
    var layerH = stackH / L;

    ctx.fillStyle = c.text;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LAYERS', PAD + stackW / 2, PAD + 10);

    for (var l = 0; l < L; l++) {
      var ly = stackY + (L - 1 - l) * layerH;
      var isAttn = layerTypes[l] === 'attn';

      ctx.fillStyle = isAttn ? 'rgba(96,165,250,0.5)' : 'rgba(74,222,128,0.25)';
      ctx.fillRect(PAD, ly, stackW, layerH - 1);

      ctx.fillStyle = isAttn ? '#60a5fa' : '#4ade80';
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isAttn ? 'A' : 'S', PAD + stackW / 2, ly + layerH / 2 + 2);
    }

    // ─── Main visualization area ───
    var mainX = PAD + stackW + 10;
    var mainW = WIDTH - mainX - PAD;

    // Input signal row
    var inputH = 30;
    var tokenW = mainW / T;

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Input Signal', mainX, PAD + 10);

    var maxIn = 0.001;
    for (var n = 0; n < T; n++) {
      if (Math.abs(inputSignal[n]) > maxIn) maxIn = Math.abs(inputSignal[n]);
    }

    for (var n = 0; n < T; n++) {
      var tx = mainX + n * tokenW;
      var barH = (inputSignal[n] / maxIn) * (inputH - 4);
      ctx.fillStyle = isImportant[n] ? c.ai : c.textDim;
      ctx.globalAlpha = isImportant[n] ? 0.8 : 0.3;
      ctx.fillRect(tx + 1, stackY + inputH - 4 - barH, tokenW - 2, barH);
      ctx.globalAlpha = 1;
    }

    // Layer activations heatmap
    var heatY = stackY + inputH + 4;
    var heatH = stackH - inputH - 60;
    var heatLayerH = heatH / L;

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Layer Activations', mainX, heatY - 2);

    // Find max activation
    var maxAct = 0.001;
    for (var l = 0; l < L; l++) {
      for (var n = 0; n < T; n++) {
        if (Math.abs(layerOutputs[l][n]) > maxAct) maxAct = Math.abs(layerOutputs[l][n]);
      }
    }

    for (var l = 0; l < L; l++) {
      var ly = heatY + l * heatLayerH;
      var isAttn = layerTypes[l] === 'attn';
      var baseColor = isAttn ? [96, 165, 250] : [74, 222, 128];

      for (var n = 0; n < T; n++) {
        var tx = mainX + n * tokenW;
        var val = layerOutputs[l][n] / maxAct;
        var intensity = Math.abs(val);
        ctx.fillStyle = 'rgba(' + baseColor[0] + ',' + baseColor[1] + ',' + baseColor[2] + ',' + (intensity * 0.8).toFixed(3) + ')';
        ctx.fillRect(tx + 0.5, ly + 0.5, tokenW - 1, heatLayerH - 1);
      }

      // Layer type indicator
      ctx.fillStyle = isAttn ? '#60a5fa' : '#4ade80';
      ctx.font = '5px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('L' + l, mainX - 2, ly + heatLayerH / 2 + 2);
    }

    // Final output
    var outY = heatY + heatH + 8;
    var outH = 35;

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Final Output', mainX, outY - 2);

    var finalOutput = layerOutputs[L - 1];
    var maxOut = 0.001;
    for (var n = 0; n < T; n++) {
      if (Math.abs(finalOutput[n]) > maxOut) maxOut = Math.abs(finalOutput[n]);
    }

    // Zero line
    ctx.strokeStyle = 'rgba(148,163,184,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(mainX, outY + outH / 2);
    ctx.lineTo(mainX + mainW, outY + outH / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = c.bridge;
    ctx.lineWidth = 2;
    for (var n = 0; n < T; n++) {
      var px = mainX + n * tokenW + tokenW / 2;
      var py = outY + outH / 2 - (finalOutput[n] / maxOut) * outH * 0.4;
      if (n === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ─── Stats footer ───
    var numAttn = layerTypes.filter(function (l) { return l === 'attn'; }).length;
    var numSSM = L - numAttn;

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    var archLabel = state.arch === 'pure-ssm' ? 'Pure IIR' :
                    state.arch === 'pure-attn' ? 'Pure FIR' :
                    'FIR+IIR Cascade';
    ctx.fillText(
      archLabel + ' | ' + numSSM + ' SSM (IIR) + ' + numAttn + ' Attention (FIR) | State dim N=' + state.N +
      ' | DSP→AI: same math, different names',
      WIDTH / 2, HEIGHT - 8
    );
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = cont.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      if (disp) disp.textContent = this.value;
      callback(this.value);
    });
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
