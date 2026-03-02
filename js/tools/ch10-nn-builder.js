/* ============================================================
   Tool 10.1 — Neural Network Builder
   Add layers, train on 2D datasets, watch decision boundary
   evolve, see forward pass and loss curve.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.NNBuilder = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 480;
  var PAD = { top: 10, right: 10, bottom: 10, left: 10 };

  var state = {
    dataset: 'xor',
    layers: [4, 4],        // hidden layer sizes
    activation: 'relu',
    lr: 0.03,
    epoch: 0,
    maxEpochs: 500,
    training: false
  };

  // Network weights and data
  var network = null;
  var dataPoints = [];
  var lossHistory = [];
  var animId = null;
  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Neural network builder with training visualization and decision boundary');
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
      HEIGHT = Math.max(420, Math.min(520, WIDTH * 0.6));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Controls
    bindSelect(containerEl, 'nn-dataset', function (v) {
      state.dataset = v;
      stopTraining();
      generateData();
      initNetwork();
      render();
    });
    bindSelect(containerEl, 'nn-activation', function (v) {
      state.activation = v;
      stopTraining();
      initNetwork();
      render();
    });
    bindSlider(containerEl, 'nn-lr', function (v) {
      state.lr = parseFloat(v);
    });
    bindSelect(containerEl, 'nn-arch', function (v) {
      stopTraining();
      switch (v) {
        case '1x4': state.layers = [4]; break;
        case '2x4': state.layers = [4, 4]; break;
        case '2x8': state.layers = [8, 8]; break;
        case '3x6': state.layers = [6, 6, 6]; break;
        case '4x4': state.layers = [4, 4, 4, 4]; break;
        default: state.layers = [4, 4];
      }
      initNetwork();
      render();
    });

    // Buttons
    var trainBtn = containerEl.querySelector('[data-action="nn-train"]');
    if (trainBtn) trainBtn.addEventListener('click', function () {
      if (state.training) { stopTraining(); }
      else { startTraining(); }
    });
    var resetBtn = containerEl.querySelector('[data-action="nn-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      stopTraining();
      initNetwork();
      render();
    });
    var stepBtn = containerEl.querySelector('[data-action="nn-step"]');
    if (stepBtn) stepBtn.addEventListener('click', function () {
      trainEpoch();
      render();
    });

    generateData();
    initNetwork();
    resize();
  }

  // ─── Data Generation ───

  function generateData() {
    dataPoints = [];
    var rng = mulberry32(123);

    switch (state.dataset) {
      case 'xor':
        for (var i = 0; i < 200; i++) {
          var x = rng() * 2 - 1;
          var y = rng() * 2 - 1;
          var label = (x * y > 0) ? 0 : 1;
          dataPoints.push({ x: x, y: y, label: label });
        }
        break;

      case 'circles':
        for (var i = 0; i < 200; i++) {
          var angle = rng() * Math.PI * 2;
          var r = rng() < 0.5 ? rng() * 0.4 : 0.6 + rng() * 0.35;
          var x = r * Math.cos(angle);
          var y = r * Math.sin(angle);
          var label = r < 0.5 ? 1 : 0;
          dataPoints.push({ x: x, y: y, label: label });
        }
        break;

      case 'moons':
        for (var i = 0; i < 100; i++) {
          var angle = Math.PI * rng();
          var x = Math.cos(angle) + (rng() - 0.5) * 0.2;
          var y = Math.sin(angle) + (rng() - 0.5) * 0.2;
          dataPoints.push({ x: x * 0.7, y: (y - 0.3) * 0.7, label: 0 });
        }
        for (var i = 0; i < 100; i++) {
          var angle = Math.PI + Math.PI * rng();
          var x = Math.cos(angle) + 1 + (rng() - 0.5) * 0.2;
          var y = Math.sin(angle) + 0.3 + (rng() - 0.5) * 0.2;
          dataPoints.push({ x: (x - 0.5) * 0.7, y: y * 0.7, label: 1 });
        }
        break;

      case 'spiral':
        for (var i = 0; i < 100; i++) {
          var t = i / 100 * 2 * Math.PI;
          var r = t / (2 * Math.PI) * 0.8;
          dataPoints.push({
            x: r * Math.cos(t) + (rng() - 0.5) * 0.08,
            y: r * Math.sin(t) + (rng() - 0.5) * 0.08,
            label: 0
          });
          dataPoints.push({
            x: r * Math.cos(t + Math.PI) + (rng() - 0.5) * 0.08,
            y: r * Math.sin(t + Math.PI) + (rng() - 0.5) * 0.08,
            label: 1
          });
        }
        break;
    }
  }

  // ─── Network ───

  function initNetwork() {
    state.epoch = 0;
    lossHistory = [];

    var sizes = [2].concat(state.layers).concat([1]);
    network = { sizes: sizes, weights: [], biases: [] };

    var rng = mulberry32(42);
    for (var l = 1; l < sizes.length; l++) {
      var W = [];
      var b = [];
      var fanIn = sizes[l - 1];
      var scale = Math.sqrt(2 / fanIn); // He initialization
      for (var j = 0; j < sizes[l]; j++) {
        var row = [];
        for (var i = 0; i < sizes[l - 1]; i++) {
          row.push((rng() * 2 - 1) * scale);
        }
        W.push(row);
        b.push(0);
      }
      network.weights.push(W);
      network.biases.push(b);
    }
  }

  function activate(z) {
    switch (state.activation) {
      case 'sigmoid': return 1 / (1 + Math.exp(-clamp(z, -500, 500)));
      case 'tanh': return Math.tanh(z);
      case 'relu': return Math.max(0, z);
      default: return Math.max(0, z);
    }
  }

  function activateDeriv(z) {
    switch (state.activation) {
      case 'sigmoid':
        var s = 1 / (1 + Math.exp(-clamp(z, -500, 500)));
        return s * (1 - s);
      case 'tanh':
        var t = Math.tanh(z);
        return 1 - t * t;
      case 'relu':
        return z > 0 ? 1 : 0;
      default:
        return z > 0 ? 1 : 0;
    }
  }

  function forward(input) {
    var activations = [input];
    var zValues = [null];
    var a = input;

    for (var l = 0; l < network.weights.length; l++) {
      var W = network.weights[l];
      var b = network.biases[l];
      var z = [];
      var aNext = [];
      var isOutput = (l === network.weights.length - 1);

      for (var j = 0; j < W.length; j++) {
        var sum = b[j];
        for (var i = 0; i < a.length; i++) {
          sum += W[j][i] * a[i];
        }
        z.push(sum);
        // Output layer uses sigmoid always
        if (isOutput) {
          aNext.push(1 / (1 + Math.exp(-clamp(sum, -500, 500))));
        } else {
          aNext.push(activate(sum));
        }
      }
      zValues.push(z);
      activations.push(aNext);
      a = aNext;
    }

    return { activations: activations, zValues: zValues };
  }

  function trainEpoch() {
    var totalLoss = 0;

    // Mini-batch SGD (full batch for simplicity)
    // Accumulate gradients
    var dW = [];
    var dB = [];
    for (var l = 0; l < network.weights.length; l++) {
      var layerDW = [];
      var layerDB = [];
      for (var j = 0; j < network.weights[l].length; j++) {
        var row = [];
        for (var i = 0; i < network.weights[l][j].length; i++) row.push(0);
        layerDW.push(row);
        layerDB.push(0);
      }
      dW.push(layerDW);
      dB.push(layerDB);
    }

    for (var p = 0; p < dataPoints.length; p++) {
      var pt = dataPoints[p];
      var result = forward([pt.x, pt.y]);
      var output = result.activations[result.activations.length - 1][0];
      var target = pt.label;

      // Binary cross-entropy loss
      output = clamp(output, 1e-7, 1 - 1e-7);
      totalLoss += -(target * Math.log(output) + (1 - target) * Math.log(1 - output));

      // Backprop
      // Output layer delta (sigmoid + BCE gives simple form)
      var deltas = [];
      var outputDelta = [output - target];
      deltas.unshift(outputDelta);

      // Hidden layers
      for (var l = network.weights.length - 2; l >= 0; l--) {
        var delta = [];
        for (var j = 0; j < network.weights[l].length; j++) {
          var err = 0;
          for (var k = 0; k < network.weights[l + 1].length; k++) {
            err += network.weights[l + 1][k][j] * deltas[0][k];
          }
          delta.push(err * activateDeriv(result.zValues[l + 1][j]));
        }
        deltas.unshift(delta);
      }

      // Accumulate gradients
      for (var l = 0; l < network.weights.length; l++) {
        for (var j = 0; j < network.weights[l].length; j++) {
          for (var i = 0; i < network.weights[l][j].length; i++) {
            dW[l][j][i] += deltas[l][j] * result.activations[l][i];
          }
          dB[l][j] += deltas[l][j];
        }
      }
    }

    // Update weights
    var n = dataPoints.length;
    for (var l = 0; l < network.weights.length; l++) {
      for (var j = 0; j < network.weights[l].length; j++) {
        for (var i = 0; i < network.weights[l][j].length; i++) {
          network.weights[l][j][i] -= state.lr * dW[l][j][i] / n;
        }
        network.biases[l][j] -= state.lr * dB[l][j] / n;
      }
    }

    state.epoch++;
    lossHistory.push(totalLoss / n);
  }

  function startTraining() {
    state.training = true;
    updateTrainButton();
    animLoop();
  }

  function stopTraining() {
    state.training = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    updateTrainButton();
  }

  function animLoop() {
    if (!state.training || state.epoch >= state.maxEpochs) {
      stopTraining();
      render();
      return;
    }
    // Train several epochs per frame for speed
    var batchSize = 5;
    for (var i = 0; i < batchSize; i++) {
      trainEpoch();
      if (state.epoch >= state.maxEpochs) break;
    }
    render();
    animId = requestAnimationFrame(animLoop);
  }

  function updateTrainButton() {
    var btn = containerEl.querySelector('[data-action="nn-train"]');
    if (btn) btn.textContent = state.training ? '\u23f8 Pause' : '\u25b6 Train';
  }

  // ─── Prediction ───

  function predict(x, y) {
    var result = forward([x, y]);
    return result.activations[result.activations.length - 1][0];
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    // Layout: left = network diagram (30%), center = classification (42%), right = loss curve (28%)
    var totalW = WIDTH - PAD.left - PAD.right;
    var netW = Math.floor(totalW * 0.25);
    var classW = Math.floor(totalW * 0.42);
    var lossW = totalW - netW - classW - 20;

    var netX = PAD.left;
    var classX = netX + netW + 10;
    var lossX = classX + classW + 10;
    var plotH = HEIGHT - PAD.top - PAD.bottom - 20;
    var plotY = PAD.top + 16;

    // ─── Network Diagram ───
    drawNetworkDiagram(netX, plotY, netW, plotH, c);

    // ─── Classification Plot ───
    drawClassificationPlot(classX, plotY, classW, plotH, c);

    // ─── Loss Curve ───
    drawLossCurve(lossX, plotY, lossW, plotH, c);

    // Epoch counter
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Epoch: ' + state.epoch + '/' + state.maxEpochs, WIDTH / 2, HEIGHT - 4);
  }

  function drawNetworkDiagram(x0, y0, w, h, c) {
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NETWORK', x0 + w / 2, y0 - 4);

    var sizes = network.sizes;
    var nLayers = sizes.length;
    var layerSpacing = w / (nLayers + 1);
    var maxNeurons = 0;
    for (var l = 0; l < nLayers; l++) maxNeurons = Math.max(maxNeurons, sizes[l]);

    var neuronR = Math.min(10, h / (maxNeurons * 3));

    // Compute positions
    var positions = [];
    for (var l = 0; l < nLayers; l++) {
      var layerPos = [];
      var n = sizes[l];
      var totalH = n * neuronR * 2.5;
      var startY = y0 + h / 2 - totalH / 2 + neuronR;
      var lx = x0 + layerSpacing * (l + 1);

      for (var j = 0; j < n; j++) {
        layerPos.push({ x: lx, y: startY + j * neuronR * 2.5 });
      }
      positions.push(layerPos);
    }

    // Draw connections
    for (var l = 1; l < nLayers; l++) {
      for (var j = 0; j < positions[l].length; j++) {
        for (var i = 0; i < positions[l - 1].length; i++) {
          var wVal = network.weights[l - 1][j][i];
          var alpha = Math.min(0.8, Math.abs(wVal) * 0.3);
          ctx.beginPath();
          ctx.moveTo(positions[l - 1][i].x + neuronR, positions[l - 1][i].y);
          ctx.lineTo(positions[l][j].x - neuronR, positions[l][j].y);
          ctx.strokeStyle = wVal > 0
            ? 'rgba(74,222,128,' + alpha + ')'
            : 'rgba(251,113,133,' + alpha + ')';
          ctx.lineWidth = Math.max(0.3, Math.min(2.5, Math.abs(wVal) * 0.8));
          ctx.stroke();
        }
      }
    }

    // Draw neurons
    for (var l = 0; l < nLayers; l++) {
      for (var j = 0; j < positions[l].length; j++) {
        ctx.beginPath();
        ctx.arc(positions[l][j].x, positions[l][j].y, neuronR, 0, Math.PI * 2);

        if (l === 0) {
          ctx.fillStyle = 'rgba(34,211,238,0.15)';
          ctx.strokeStyle = c.dsp;
        } else if (l === nLayers - 1) {
          ctx.fillStyle = 'rgba(251,146,60,0.15)';
          ctx.strokeStyle = c.ai;
        } else {
          ctx.fillStyle = 'rgba(167,139,250,0.15)';
          ctx.strokeStyle = c.bridge;
        }
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Layer labels
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.textDim;
    var labels = ['In'];
    for (var l = 0; l < state.layers.length; l++) labels.push('H' + (l + 1));
    labels.push('Out');
    for (var l = 0; l < nLayers; l++) {
      var lx = x0 + layerSpacing * (l + 1);
      ctx.fillText(labels[l], lx, y0 + h + 10);
    }
  }

  function drawClassificationPlot(x0, y0, w, h, c) {
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DECISION BOUNDARY', x0 + w / 2, y0 - 4);

    // Decision boundary heatmap
    var res = 35;
    var cellW = w / res;
    var cellH = h / res;

    for (var i = 0; i < res; i++) {
      for (var j = 0; j < res; j++) {
        var px = -1.2 + 2.4 * i / res;
        var py = 1.2 - 2.4 * j / res;
        var out = predict(px, py);
        out = clamp(out, 0, 1);

        var alpha = 0.04 + Math.abs(out - 0.5) * 0.25;
        ctx.fillStyle = out > 0.5
          ? 'rgba(251,146,60,' + alpha + ')'
          : 'rgba(34,211,238,' + alpha + ')';
        ctx.fillRect(x0 + i * cellW, y0 + j * cellH, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }

    // Decision boundary contour (where output ≈ 0.5)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    // Simple marching: find transitions
    var gridRes = 60;
    for (var i = 0; i < gridRes; i++) {
      for (var j = 0; j < gridRes; j++) {
        var x1 = -1.2 + 2.4 * i / gridRes;
        var y1 = 1.2 - 2.4 * j / gridRes;
        var x2 = -1.2 + 2.4 * (i + 1) / gridRes;
        var y2 = 1.2 - 2.4 * (j + 1) / gridRes;
        var v00 = predict(x1, y1);
        var v10 = predict(x2, y1);
        var v01 = predict(x1, y2);
        // Check horizontal edge
        if ((v00 - 0.5) * (v10 - 0.5) < 0) {
          var t = (0.5 - v00) / (v10 - v00);
          var px = x0 + ((x1 + t * (x2 - x1) + 1.2) / 2.4) * w;
          var py = y0 + ((1.2 - y1) / 2.4) * h;
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(px - 0.5, py - 0.5, 1.5, 1.5);
        }
        // Check vertical edge
        if ((v00 - 0.5) * (v01 - 0.5) < 0) {
          var t = (0.5 - v00) / (v01 - v00);
          var px = x0 + ((x1 + 1.2) / 2.4) * w;
          var py = y0 + ((1.2 - (y1 + t * (y2 - y1))) / 2.4) * h;
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(px - 0.5, py - 0.5, 1.5, 1.5);
        }
      }
    }

    // Data points
    for (var i = 0; i < dataPoints.length; i++) {
      var p = dataPoints[i];
      var px = x0 + ((p.x + 1.2) / 2.4) * w;
      var py = y0 + ((1.2 - p.y) / 2.4) * h;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.label === 1 ? c.ai : c.dsp;
      ctx.fill();
    }

    // Accuracy
    var correct = 0;
    for (var i = 0; i < dataPoints.length; i++) {
      var p = dataPoints[i];
      var pred = predict(p.x, p.y) > 0.5 ? 1 : 0;
      if (pred === p.label) correct++;
    }
    var acc = (correct / dataPoints.length * 100).toFixed(0);
    ctx.fillStyle = acc > 95 ? c.math : (acc > 75 ? c.ai : c.danger);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(acc + '% acc', x0 + w, y0 + h + 12);
  }

  function drawLossCurve(x0, y0, w, h, c) {
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOSS', x0 + w / 2, y0 - 4);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x0, y0, w, h);

    if (lossHistory.length < 2) {
      ctx.fillStyle = c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Train to see', x0 + w / 2, y0 + h / 2 - 5);
      ctx.fillText('loss curve', x0 + w / 2, y0 + h / 2 + 8);
      return;
    }

    var maxLoss = 0.01;
    for (var i = 0; i < lossHistory.length; i++) {
      maxLoss = Math.max(maxLoss, lossHistory[i]);
    }
    maxLoss *= 1.1;

    ctx.beginPath();
    ctx.strokeStyle = c.danger;
    ctx.lineWidth = 1.5;
    for (var i = 0; i < lossHistory.length; i++) {
      var px = x0 + (i / (lossHistory.length - 1)) * w;
      var py = y0 + h - (lossHistory[i] / maxLoss) * h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Fill
    ctx.lineTo(x0 + w, y0 + h);
    ctx.lineTo(x0, y0 + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(251,113,133,0.08)';
    ctx.fill();

    // Current loss
    var currentLoss = lossHistory[lossHistory.length - 1];
    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(currentLoss.toFixed(4), x0 + w / 2, y0 + h + 12);
  }

  // ─── Utilities ───

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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
