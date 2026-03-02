/* ============================================================
   Tool 11.2 — Learning Rate Finder
   Sweep learning rate from tiny to huge, plot loss-vs-LR.
   Also shows side-by-side training curves at 3 different LR values.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.LRFinder = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 420;
  var PAD = { top: 30, right: 20, bottom: 40, left: 55 };

  // Simple 2-layer network for XOR
  var dataset = [];
  var sweepResults = [];       // { lr, loss }
  var trainingCurves = [];     // array of { lr, losses[] }
  var state = {
    dataType: 'xor',
    sweepDone: false,
    bestLR: 0,
    selectedLRs: [0.001, 0.03, 0.3]
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Learning rate finder showing loss versus learning rate curve');
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

    bindSelect(containerEl, 'lrf-dataset', function (v) {
      state.dataType = v;
      state.sweepDone = false;
      render();
    });

    var sweepBtn = containerEl.querySelector('[data-action="lrf-sweep"]');
    if (sweepBtn) sweepBtn.addEventListener('click', function () {
      runSweep();
      render();
    });

    generateData();
    resize();
  }

  function generateData() {
    dataset = [];
    var rng = mulberry32(77);

    switch (state.dataType) {
      case 'xor':
        for (var i = 0; i < 100; i++) {
          var x = rng() * 2 - 1, y = rng() * 2 - 1;
          dataset.push({ x: x, y: y, label: (x * y > 0) ? 0 : 1 });
        }
        break;
      case 'circles':
        for (var i = 0; i < 100; i++) {
          var a = rng() * Math.PI * 2;
          var r = rng() < 0.5 ? rng() * 0.4 : 0.6 + rng() * 0.35;
          dataset.push({ x: r * Math.cos(a), y: r * Math.sin(a), label: r < 0.5 ? 1 : 0 });
        }
        break;
      case 'moons':
        for (var i = 0; i < 50; i++) {
          var a = Math.PI * rng();
          dataset.push({ x: Math.cos(a) * 0.7, y: (Math.sin(a) - 0.3) * 0.7, label: 0 });
        }
        for (var i = 0; i < 50; i++) {
          var a = Math.PI + Math.PI * rng();
          dataset.push({ x: (Math.cos(a) + 1 - 0.5) * 0.7, y: (Math.sin(a) + 0.3) * 0.7, label: 1 });
        }
        break;
    }
  }

  // ─── Simple Network ───

  function createNetwork(seed) {
    var rng = mulberry32(seed);
    var scale = Math.sqrt(2 / 2);
    return {
      w1: [[rng() * scale * 2 - scale, rng() * scale * 2 - scale],
           [rng() * scale * 2 - scale, rng() * scale * 2 - scale],
           [rng() * scale * 2 - scale, rng() * scale * 2 - scale],
           [rng() * scale * 2 - scale, rng() * scale * 2 - scale]],
      b1: [0, 0, 0, 0],
      w2: [[rng() * 0.5 - 0.25, rng() * 0.5 - 0.25, rng() * 0.5 - 0.25, rng() * 0.5 - 0.25]],
      b2: [0]
    };
  }

  function trainStep(net, lr) {
    var totalLoss = 0;
    // Accumulate gradients
    var dw1 = [[0,0],[0,0],[0,0],[0,0]];
    var db1 = [0,0,0,0];
    var dw2 = [[0,0,0,0]];
    var db2 = [0];

    for (var p = 0; p < dataset.length; p++) {
      var d = dataset[p];
      // Forward: 2 → 4 (relu) → 1 (sigmoid)
      var z1 = [];
      var a1 = [];
      for (var j = 0; j < 4; j++) {
        z1[j] = net.w1[j][0] * d.x + net.w1[j][1] * d.y + net.b1[j];
        a1[j] = Math.max(0, z1[j]); // ReLU
      }
      var z2 = net.b2[0];
      for (var j = 0; j < 4; j++) z2 += net.w2[0][j] * a1[j];
      var a2 = 1 / (1 + Math.exp(-clamp(z2, -500, 500)));

      a2 = clamp(a2, 1e-7, 1 - 1e-7);
      totalLoss += -(d.label * Math.log(a2) + (1 - d.label) * Math.log(1 - a2));

      // Backward
      var dz2 = a2 - d.label;
      for (var j = 0; j < 4; j++) {
        dw2[0][j] += dz2 * a1[j];
      }
      db2[0] += dz2;

      for (var j = 0; j < 4; j++) {
        var da1 = net.w2[0][j] * dz2;
        var dz1 = z1[j] > 0 ? da1 : 0;
        dw1[j][0] += dz1 * d.x;
        dw1[j][1] += dz1 * d.y;
        db1[j] += dz1;
      }
    }

    var n = dataset.length;
    for (var j = 0; j < 4; j++) {
      net.w1[j][0] -= lr * dw1[j][0] / n;
      net.w1[j][1] -= lr * dw1[j][1] / n;
      net.b1[j] -= lr * db1[j] / n;
      net.w2[0][j] -= lr * dw2[0][j] / n;
    }
    net.b2[0] -= lr * db2[0] / n;

    return totalLoss / n;
  }

  function runSweep() {
    generateData();
    sweepResults = [];
    trainingCurves = [];

    // LR sweep: exponential range from 1e-4 to 1
    var nSteps = 60;
    var warmupEpochs = 3;

    for (var i = 0; i < nSteps; i++) {
      var lr = Math.pow(10, -4 + 4 * i / (nSteps - 1));
      var net = createNetwork(42);

      // Warm up a few epochs
      for (var e = 0; e < warmupEpochs; e++) trainStep(net, lr);
      var loss = trainStep(net, lr);
      if (!isFinite(loss)) loss = 10;
      sweepResults.push({ lr: lr, loss: Math.min(10, loss) });
    }

    // Find best LR (steepest descent in sweep)
    var bestIdx = 0;
    var bestSlope = 0;
    for (var i = 2; i < sweepResults.length - 2; i++) {
      var slope = sweepResults[i - 2].loss - sweepResults[i + 2].loss;
      if (slope > bestSlope) {
        bestSlope = slope;
        bestIdx = i;
      }
    }
    state.bestLR = sweepResults[bestIdx].lr;

    // Training curves at 3 LRs: too small, good, too large
    state.selectedLRs = [
      sweepResults[Math.max(0, bestIdx - 15)].lr,
      state.bestLR,
      Math.min(1, state.bestLR * 20)
    ];

    var epochs = 100;
    for (var s = 0; s < 3; s++) {
      var lr = state.selectedLRs[s];
      var net = createNetwork(42);
      var losses = [];
      for (var e = 0; e < epochs; e++) {
        var loss = trainStep(net, lr);
        losses.push(isFinite(loss) ? Math.min(5, loss) : 5);
      }
      trainingCurves.push({ lr: lr, losses: losses });
    }

    state.sweepDone = true;
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    if (!state.sweepDone) {
      ctx.fillStyle = c.textDim;
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Click "Run Sweep" to find the optimal learning rate', WIDTH / 2, HEIGHT / 2 - 10);
      ctx.fillStyle = c.text;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('This will train ' + 60 + ' networks at different learning rates', WIDTH / 2, HEIGHT / 2 + 10);
      return;
    }

    var totalW = WIDTH - PAD.left - PAD.right;
    var topH = (HEIGHT - PAD.top - PAD.bottom - 20) * 0.55;
    var bottomH = (HEIGHT - PAD.top - PAD.bottom - 20) * 0.45;
    var topY = PAD.top;
    var bottomY = PAD.top + topH + 20;

    // === Top: LR Sweep ===
    drawSweep(PAD.left, topY, totalW, topH, c);

    // === Bottom: Training curves ===
    drawTrainingCurves(PAD.left, bottomY, totalW, bottomH, c);
  }

  function drawSweep(x0, y0, w, h, c) {
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LEARNING RATE SWEEP (loss after 4 epochs vs learning rate)', x0, y0 + 10);

    var plotY = y0 + 18;
    var plotH = h - 22;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x0, plotY, w, plotH);

    // Find ranges
    var minLoss = Infinity, maxLoss = -Infinity;
    for (var i = 0; i < sweepResults.length; i++) {
      if (sweepResults[i].loss < minLoss) minLoss = sweepResults[i].loss;
      if (sweepResults[i].loss > maxLoss) maxLoss = sweepResults[i].loss;
    }
    var lrMin = Math.log10(sweepResults[0].lr);
    var lrMax = Math.log10(sweepResults[sweepResults.length - 1].lr);

    // Sweep curve
    ctx.beginPath();
    ctx.strokeStyle = c.dsp;
    ctx.lineWidth = 2;
    for (var i = 0; i < sweepResults.length; i++) {
      var px = x0 + ((Math.log10(sweepResults[i].lr) - lrMin) / (lrMax - lrMin)) * w;
      var py = plotY + plotH - ((sweepResults[i].loss - minLoss) / (maxLoss - minLoss + 1e-10)) * plotH;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Fill under
    ctx.lineTo(x0 + w, plotY + plotH);
    ctx.lineTo(x0, plotY + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(34,211,238,0.06)';
    ctx.fill();

    // Best LR marker
    var bestPx = x0 + ((Math.log10(state.bestLR) - lrMin) / (lrMax - lrMin)) * w;
    ctx.strokeStyle = c.math;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(bestPx, plotY);
    ctx.lineTo(bestPx, plotY + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = c.math;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('best: ' + state.bestLR.toExponential(1), bestPx, plotY - 2);

    // Mark the 3 selected LRs
    var colors = [c.dsp, c.math, c.danger];
    var labels = ['too slow', 'good', 'too fast'];
    for (var s = 0; s < 3; s++) {
      var px = x0 + ((Math.log10(state.selectedLRs[s]) - lrMin) / (lrMax - lrMin)) * w;
      ctx.beginPath();
      ctx.arc(px, plotY + plotH + 8, 4, 0, Math.PI * 2);
      ctx.fillStyle = colors[s];
      ctx.fill();
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(labels[s], px, plotY + plotH + 20);
    }

    // X axis
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (var e = -4; e <= 0; e++) {
      var px = x0 + ((e - lrMin) / (lrMax - lrMin)) * w;
      ctx.fillText('10^' + e, px, plotY + plotH + 30);
    }
  }

  function drawTrainingCurves(x0, y0, w, h, c) {
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TRAINING CURVES AT 3 LEARNING RATES', x0, y0 + 10);

    var plotY = y0 + 16;
    var plotH = h - 20;

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x0, plotY, w, plotH);

    if (trainingCurves.length === 0) return;

    // Y range
    var maxLoss = 0.01;
    for (var s = 0; s < trainingCurves.length; s++) {
      for (var i = 0; i < trainingCurves[s].losses.length; i++) {
        maxLoss = Math.max(maxLoss, trainingCurves[s].losses[i]);
      }
    }

    var colors = [c.dsp, c.math, c.danger];
    var labels = ['\u03b7=' + state.selectedLRs[0].toExponential(1) + ' (slow)',
                  '\u03b7=' + state.selectedLRs[1].toExponential(1) + ' (good)',
                  '\u03b7=' + state.selectedLRs[2].toExponential(1) + ' (fast)'];

    for (var s = 0; s < trainingCurves.length; s++) {
      var losses = trainingCurves[s].losses;
      ctx.beginPath();
      ctx.strokeStyle = colors[s];
      ctx.lineWidth = 2;
      for (var i = 0; i < losses.length; i++) {
        var px = x0 + (i / (losses.length - 1)) * w;
        var py = plotY + plotH - (losses[i] / maxLoss) * plotH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Label at end
      var lastLoss = losses[losses.length - 1];
      var lpy = plotY + plotH - (lastLoss / maxLoss) * plotH;
      ctx.fillStyle = colors[s];
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(labels[s], x0 + w - 4, Math.max(plotY + 10, Math.min(plotY + plotH - 4, lpy - 4)));
    }

    // X axis label
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Epoch', x0 + w / 2, plotY + plotH + 14);
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
