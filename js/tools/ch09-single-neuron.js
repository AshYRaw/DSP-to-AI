/* ============================================================
   Tool 9.1 — Single Neuron Playground
   Visual neuron with weight sliders, 2D classification canvas
   with decision boundary. Switch activations, try XOR.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.SingleNeuron = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 420;
  var PAD = { top: 10, right: 20, bottom: 10, left: 10 };

  var state = {
    w1: 1.0,
    w2: 1.0,
    bias: 0.0,
    activation: 'sigmoid',    // step | sigmoid | tanh | relu | leaky-relu
    dataset: 'linear',        // linear | diagonal | xor | circle
    showBoundary: true
  };

  // 2D dataset points
  var points = [];
  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Single neuron classification space with decision boundary');
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

    // Controls
    bindSlider(containerEl, 'neuron-w1', function (v) {
      state.w1 = parseFloat(v);
      render();
    });
    bindSlider(containerEl, 'neuron-w2', function (v) {
      state.w2 = parseFloat(v);
      render();
    });
    bindSlider(containerEl, 'neuron-bias', function (v) {
      state.bias = parseFloat(v);
      render();
    });
    bindSelect(containerEl, 'neuron-activation', function (v) {
      state.activation = v;
      render();
    });
    bindSelect(containerEl, 'neuron-dataset', function (v) {
      state.dataset = v;
      generateDataset();
      render();
    });

    // Train button (simple perceptron learning rule)
    var trainBtn = containerEl.querySelector('[data-action="neuron-train"]');
    if (trainBtn) trainBtn.addEventListener('click', function () {
      trainPerceptron();
    });

    // Reset button
    var resetBtn = containerEl.querySelector('[data-action="neuron-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      state.w1 = 0;
      state.w2 = 0;
      state.bias = 0;
      updateSliders();
      render();
    });

    generateDataset();
    resize();
  }

  // ─── Activation Functions ───

  function activate(z) {
    switch (state.activation) {
      case 'step':
        return z >= 0 ? 1 : 0;
      case 'sigmoid':
        return 1 / (1 + Math.exp(-z));
      case 'tanh':
        return Math.tanh(z);
      case 'relu':
        return Math.max(0, z);
      case 'leaky-relu':
        return z >= 0 ? z : 0.01 * z;
      default:
        return 1 / (1 + Math.exp(-z));
    }
  }

  function neuronOutput(x1, x2) {
    var z = state.w1 * x1 + state.w2 * x2 + state.bias;
    return activate(z);
  }

  // ─── Datasets ───

  function generateDataset() {
    points = [];
    var rng = mulberry32(42);  // seeded RNG for reproducibility

    switch (state.dataset) {
      case 'linear':
        // Linearly separable: class 0 bottom-left, class 1 top-right
        for (var i = 0; i < 40; i++) {
          points.push({ x: rng() * 0.8 - 0.9, y: rng() * 0.8 - 0.9, label: 0 });
        }
        for (var i = 0; i < 40; i++) {
          points.push({ x: rng() * 0.8 + 0.1, y: rng() * 0.8 + 0.1, label: 1 });
        }
        break;

      case 'diagonal':
        // Points separated by diagonal line
        for (var i = 0; i < 80; i++) {
          var x = rng() * 2 - 1;
          var y = rng() * 2 - 1;
          var label = (x + y > 0) ? 1 : 0;
          // Add some noise
          if (rng() < 0.05) label = 1 - label;
          points.push({ x: x, y: y, label: label });
        }
        break;

      case 'xor':
        // XOR pattern — NOT linearly separable
        for (var i = 0; i < 25; i++) {
          points.push({ x: rng() * 0.6 - 0.8, y: rng() * 0.6 - 0.8, label: 0 });
        }
        for (var i = 0; i < 25; i++) {
          points.push({ x: rng() * 0.6 + 0.2, y: rng() * 0.6 + 0.2, label: 0 });
        }
        for (var i = 0; i < 25; i++) {
          points.push({ x: rng() * 0.6 + 0.2, y: rng() * 0.6 - 0.8, label: 1 });
        }
        for (var i = 0; i < 25; i++) {
          points.push({ x: rng() * 0.6 - 0.8, y: rng() * 0.6 + 0.2, label: 1 });
        }
        break;

      case 'circle':
        // Points inside/outside a circle — NOT linearly separable
        for (var i = 0; i < 100; i++) {
          var x = rng() * 2 - 1;
          var y = rng() * 2 - 1;
          var r = Math.sqrt(x * x + y * y);
          var label = r < 0.55 ? 1 : 0;
          points.push({ x: x, y: y, label: label });
        }
        break;
    }
  }

  // ─── Perceptron Training ───

  function trainPerceptron() {
    var lr = 0.1;
    var epochs = 50;

    for (var ep = 0; ep < epochs; ep++) {
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        var z = state.w1 * p.x + state.w2 * p.y + state.bias;
        var yHat = activate(z);
        var target = p.label;

        // For step/sigmoid: use perceptron-like update
        var err = target - yHat;
        state.w1 += lr * err * p.x;
        state.w2 += lr * err * p.y;
        state.bias += lr * err;
      }
    }

    // Clamp weights to slider range
    state.w1 = Math.max(-5, Math.min(5, state.w1));
    state.w2 = Math.max(-5, Math.min(5, state.w2));
    state.bias = Math.max(-5, Math.min(5, state.bias));

    updateSliders();
    render();
  }

  function updateSliders() {
    var s1 = containerEl.querySelector('[data-control="neuron-w1"]');
    var s2 = containerEl.querySelector('[data-control="neuron-w2"]');
    var sb = containerEl.querySelector('[data-control="neuron-bias"]');
    if (s1) { s1.value = state.w1.toFixed(2); }
    if (s2) { s2.value = state.w2.toFixed(2); }
    if (sb) { sb.value = state.bias.toFixed(2); }
    var d1 = containerEl.querySelector('[data-value="neuron-w1"]');
    var d2 = containerEl.querySelector('[data-value="neuron-w2"]');
    var db = containerEl.querySelector('[data-value="neuron-bias"]');
    if (d1) d1.textContent = state.w1.toFixed(2);
    if (d2) d2.textContent = state.w2.toFixed(2);
    if (db) db.textContent = state.bias.toFixed(2);
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;

    // Layout: left = neuron diagram (30%), right = classification plot (70%)
    var diagramW = Math.floor(plotW * 0.28);
    var classW = plotW - diagramW - 20;
    var classX = PAD.left + diagramW + 20;
    var classH = HEIGHT - PAD.top - PAD.bottom - 20;
    var classY = PAD.top + 10;

    // ─── Left: Neuron Diagram ───
    drawNeuronDiagram(PAD.left, PAD.top + 10, diagramW, classH, c);

    // ─── Right: Classification Plot ───
    drawClassificationPlot(classX, classY, classW, classH, c);
  }

  function drawNeuronDiagram(x0, y0, w, h, c) {
    var cx = x0 + w / 2;
    var cy = y0 + h / 2;
    var neuronR = Math.min(w, h) * 0.15;

    // Title
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SINGLE NEURON', cx, y0 + 4);

    // Input nodes
    var inputY1 = cy - neuronR * 1.8;
    var inputY2 = cy + neuronR * 1.8;
    var inputX = x0 + 15;
    var inputR = 8;

    // x1 node
    ctx.beginPath();
    ctx.arc(inputX, inputY1, inputR, 0, Math.PI * 2);
    ctx.fillStyle = c.dsp;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.dsp;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('x\u2081', inputX, inputY1 + 3);

    // x2 node
    ctx.beginPath();
    ctx.arc(inputX, inputY2, inputR, 0, Math.PI * 2);
    ctx.fillStyle = c.dsp;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.dsp;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = c.text;
    ctx.fillText('x\u2082', inputX, inputY2 + 3);

    // Bias node
    var biasY = cy;
    var biasX = inputX;
    ctx.beginPath();
    ctx.arc(biasX, biasY, inputR, 0, Math.PI * 2);
    ctx.fillStyle = c.bridge;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.bridge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = c.text;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('+1', biasX, biasY + 3);

    // Connection lines with weight labels
    var weightColor = function (w) {
      if (w > 0) return c.math;
      if (w < 0) return c.danger;
      return c.textDim;
    };

    var lineWidth = function (w) {
      return Math.max(0.5, Math.min(4, Math.abs(w) * 1.5));
    };

    // w1 connection
    ctx.beginPath();
    ctx.moveTo(inputX + inputR, inputY1);
    ctx.lineTo(cx - neuronR, cy - neuronR * 0.4);
    ctx.strokeStyle = weightColor(state.w1);
    ctx.lineWidth = lineWidth(state.w1);
    ctx.stroke();
    // w1 label
    var midX1 = (inputX + inputR + cx - neuronR) / 2;
    var midY1 = (inputY1 + cy - neuronR * 0.4) / 2;
    ctx.fillStyle = weightColor(state.w1);
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('w\u2081=' + state.w1.toFixed(1), midX1, midY1 - 6);

    // w2 connection
    ctx.beginPath();
    ctx.moveTo(inputX + inputR, inputY2);
    ctx.lineTo(cx - neuronR, cy + neuronR * 0.4);
    ctx.strokeStyle = weightColor(state.w2);
    ctx.lineWidth = lineWidth(state.w2);
    ctx.stroke();
    // w2 label
    var midX2 = (inputX + inputR + cx - neuronR) / 2;
    var midY2 = (inputY2 + cy + neuronR * 0.4) / 2;
    ctx.fillStyle = weightColor(state.w2);
    ctx.fillText('w\u2082=' + state.w2.toFixed(1), midX2, midY2 + 12);

    // bias connection
    ctx.beginPath();
    ctx.moveTo(biasX + inputR, biasY);
    ctx.lineTo(cx - neuronR, cy);
    ctx.strokeStyle = weightColor(state.bias);
    ctx.lineWidth = lineWidth(state.bias);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // bias label
    ctx.fillStyle = weightColor(state.bias);
    ctx.font = '8px "JetBrains Mono", monospace';
    var midBx = (biasX + inputR + cx - neuronR) / 2;
    ctx.fillText('b=' + state.bias.toFixed(1), midBx, biasY - 8);

    // Neuron body
    ctx.beginPath();
    ctx.arc(cx, cy, neuronR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251,146,60,0.12)';
    ctx.fill();
    ctx.strokeStyle = c.ai;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sigma symbol
    ctx.fillStyle = c.ai;
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('\u03C3(\u03A3)', cx, cy + 5);

    // Output arrow
    ctx.beginPath();
    ctx.moveTo(cx + neuronR, cy);
    ctx.lineTo(cx + neuronR + 30, cy);
    ctx.strokeStyle = c.ai;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(cx + neuronR + 30, cy);
    ctx.lineTo(cx + neuronR + 24, cy - 4);
    ctx.lineTo(cx + neuronR + 24, cy + 4);
    ctx.closePath();
    ctx.fillStyle = c.ai;
    ctx.fill();

    // Output label
    ctx.fillStyle = c.ai;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('y', cx + neuronR + 33, cy + 3);

    // Activation name
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(state.activation, cx, cy + neuronR + 14);

    // Equation
    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('z = w\u2081x\u2081 + w\u2082x\u2082 + b', cx, y0 + h - 20);
    ctx.fillText('y = \u03C3(z)', cx, y0 + h - 6);
  }

  function drawClassificationPlot(x0, y0, w, h, c) {
    // Title
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CLASSIFICATION SPACE', x0 + w / 2, y0 - 2);

    // Plot background with decision heatmap
    var resolution = 40;
    var cellW = w / resolution;
    var cellH = h / resolution;

    for (var i = 0; i < resolution; i++) {
      for (var j = 0; j < resolution; j++) {
        var px1 = -1 + (2 * i / resolution);
        var px2 = 1 - (2 * j / resolution);
        var out = neuronOutput(px1, px2);

        // Map output to color
        var alpha;
        if (state.activation === 'step') {
          alpha = out > 0.5 ? 0.15 : 0.05;
        } else if (state.activation === 'tanh') {
          alpha = 0.03 + Math.abs(out) * 0.12;
        } else if (state.activation === 'relu' || state.activation === 'leaky-relu') {
          var norm = Math.min(1, out / 2);
          alpha = 0.03 + norm * 0.15;
        } else {
          alpha = 0.03 + out * 0.12;
        }

        if (state.activation === 'tanh') {
          ctx.fillStyle = out > 0
            ? 'rgba(251,146,60,' + alpha + ')'
            : 'rgba(34,211,238,' + alpha + ')';
        } else if (state.activation === 'relu' || state.activation === 'leaky-relu') {
          ctx.fillStyle = 'rgba(251,146,60,' + alpha + ')';
        } else {
          ctx.fillStyle = out > 0.5
            ? 'rgba(251,146,60,' + alpha + ')'
            : 'rgba(34,211,238,' + alpha + ')';
        }
        ctx.fillRect(x0 + i * cellW, y0 + j * cellH, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }

    // Decision boundary (where w1*x1 + w2*x2 + b = 0)
    if (Math.abs(state.w2) > 0.001 || Math.abs(state.w1) > 0.001) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);

      if (Math.abs(state.w2) > Math.abs(state.w1) * 0.01) {
        // Sweep x1, compute x2
        for (var i = 0; i <= 100; i++) {
          var x1 = -1 + 2 * i / 100;
          var x2 = -(state.w1 * x1 + state.bias) / state.w2;
          var px = x0 + ((x1 + 1) / 2) * w;
          var py = y0 + ((1 - x2) / 2) * h;
          if (x2 >= -1 && x2 <= 1) {
            if (i === 0 || x2 < -1 || x2 > 1) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        }
      } else {
        // Sweep x2, compute x1
        for (var j = 0; j <= 100; j++) {
          var x2 = -1 + 2 * j / 100;
          var x1 = -(state.w2 * x2 + state.bias) / state.w1;
          var px = x0 + ((x1 + 1) / 2) * w;
          var py = y0 + ((1 - x2) / 2) * h;
          if (x1 >= -1 && x1 <= 1) {
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw data points
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var px = x0 + ((p.x + 1) / 2) * w;
      var py = y0 + ((1 - p.y) / 2) * h;
      var predicted = neuronOutput(p.x, p.y);
      var correct;
      if (state.activation === 'tanh') {
        correct = (predicted > 0 && p.label === 1) || (predicted <= 0 && p.label === 0);
      } else if (state.activation === 'relu' || state.activation === 'leaky-relu') {
        correct = (predicted > 0.5 && p.label === 1) || (predicted <= 0.5 && p.label === 0);
      } else {
        correct = (predicted > 0.5 && p.label === 1) || (predicted <= 0.5 && p.label === 0);
      }

      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      if (p.label === 1) {
        ctx.fillStyle = c.ai;
      } else {
        ctx.fillStyle = c.dsp;
      }
      ctx.fill();

      // Wrong predictions get a red ring
      if (!correct) {
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.strokeStyle = c.danger;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Axes labels
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('x\u2081', x0 + w / 2, y0 + h + 14);
    ctx.save();
    ctx.translate(x0 - 10, y0 + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('x\u2082', 0, 0);
    ctx.restore();

    // Accuracy
    var correct = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var pred = neuronOutput(p.x, p.y);
      var predLabel;
      if (state.activation === 'tanh') {
        predLabel = pred > 0 ? 1 : 0;
      } else {
        predLabel = pred > 0.5 ? 1 : 0;
      }
      if (predLabel === p.label) correct++;
    }
    var acc = points.length > 0 ? (correct / points.length * 100).toFixed(0) : 0;
    ctx.fillStyle = acc > 90 ? c.math : (acc > 70 ? c.ai : c.danger);
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Accuracy: ' + acc + '%', x0 + w, y0 + h + 14);

    // XOR warning
    if (state.dataset === 'xor' || state.dataset === 'circle') {
      ctx.fillStyle = c.danger;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('NOT linearly separable!', x0 + w, y0 - 2);
    }

    // Legend
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.beginPath();
    ctx.arc(x0 + 8, y0 + 12, 4, 0, Math.PI * 2);
    ctx.fillStyle = c.dsp;
    ctx.fill();
    ctx.fillStyle = c.textDim;
    ctx.fillText('Class 0', x0 + 16, y0 + 15);

    ctx.beginPath();
    ctx.arc(x0 + 8, y0 + 26, 4, 0, Math.PI * 2);
    ctx.fillStyle = c.ai;
    ctx.fill();
    ctx.fillStyle = c.textDim;
    ctx.fillText('Class 1', x0 + 16, y0 + 29);
  }

  // ─── Seeded RNG ───

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ─── Helpers ───

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = cont.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      if (disp) disp.textContent = parseFloat(this.value).toFixed(2);
      callback(this.value);
    });
    if (disp) disp.textContent = parseFloat(el.value).toFixed(2);
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
