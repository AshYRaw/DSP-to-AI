/* ============================================================
   Tool 26.2 — ICL Mechanism Comparator
   Shows Transformer (batch GD) vs Mamba (online GD / LMS)
   solving the same in-context learning task.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.ICLComparator = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 480;
  var containerEl;

  var state = {
    numExamples: 8,
    noise: 0.2
  };

  // Ground truth: y = w_true * x + b_true
  var w_true = 1.5;
  var b_true = -0.3;
  var dataPoints = [];

  // Transformer's batch estimate
  var w_batch = 0, b_batch = 0;

  // Mamba's online estimate trajectory
  var w_online_history = [];
  var b_online_history = [];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'ICL comparator: Transformer batch vs Mamba online learning');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(400, Math.min(500, WIDTH * 0.6));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }

    bindSlider(containerEl, 'icl-examples', function (v) {
      state.numExamples = parseInt(v, 10);
      containerEl.querySelector('[data-value="icl-examples"]').textContent = v;
      generateData(); compute(); render();
    });

    bindSlider(containerEl, 'icl-noise', function (v) {
      state.noise = parseFloat(v);
      containerEl.querySelector('[data-value="icl-noise"]').textContent = parseFloat(v).toFixed(2);
      generateData(); compute(); render();
    });

    var resetBtn = containerEl.querySelector('[data-control="icl-reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        w_true = 0.5 + Math.random() * 2;
        b_true = (Math.random() - 0.5) * 2;
        generateData(); compute(); render();
      });
    }

    window.addEventListener('resize', resize);
    generateData();
    compute();
    resize();
  }

  function generateData() {
    dataPoints = [];
    for (var i = 0; i < state.numExamples; i++) {
      var x = (i / (state.numExamples - 1)) * 4 - 2; // [-2, 2]
      var noise = (seededRandom(i * 7 + 13 + Math.floor(w_true * 100)) - 0.5) * 2 * state.noise;
      var y = w_true * x + b_true + noise;
      dataPoints.push({ x: x, y: y });
    }
  }

  function compute() {
    var N = dataPoints.length;
    if (N < 2) return;

    // ─── Transformer: Batch Least Squares ───
    // w = (X^T X)^{-1} X^T y (closed-form)
    var sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (var i = 0; i < N; i++) {
      sumX += dataPoints[i].x;
      sumY += dataPoints[i].y;
      sumXX += dataPoints[i].x * dataPoints[i].x;
      sumXY += dataPoints[i].x * dataPoints[i].y;
    }
    var denom = N * sumXX - sumX * sumX;
    if (Math.abs(denom) > 0.001) {
      w_batch = (N * sumXY - sumX * sumY) / denom;
      b_batch = (sumY - w_batch * sumX) / N;
    } else {
      w_batch = 0;
      b_batch = sumY / N;
    }

    // ─── Mamba: Online Gradient Descent (LMS) ───
    var lr = 0.15; // Learning rate (step size)
    var w = 0, b = 0;
    w_online_history = [{ w: w, b: b }];
    b_online_history = [];

    for (var i = 0; i < N; i++) {
      var xi = dataPoints[i].x;
      var yi = dataPoints[i].y;
      var pred = w * xi + b;
      var error = yi - pred;

      // LMS update: w += lr * error * x
      w += lr * error * xi;
      b += lr * error;

      w_online_history.push({ w: w, b: b });
    }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var PAD = { top: 24, bottom: 40, left: 12, right: 12 };
    var midGap = 20;
    var halfW = (WIDTH - PAD.left - PAD.right - midGap) / 2;
    var plotH = HEIGHT - PAD.top - PAD.bottom;

    // ─── Left Panel: Transformer (Batch) ───
    var lx = PAD.left;
    var ly = PAD.top;

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Transformer: Batch Least-Squares', lx + halfW / 2, ly - 6);

    drawScatter(lx, ly, halfW, plotH, w_batch, b_batch, '#60a5fa', c, true);

    // ─── Right Panel: Mamba (Online / LMS) ───
    var rx = PAD.left + halfW + midGap;

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Mamba: Online GD (= LMS Adaptive Filter)', rx + halfW / 2, ly - 6);

    var lastOnline = w_online_history[w_online_history.length - 1];
    drawScatter(rx, ly, halfW, plotH, lastOnline.w, lastOnline.b, '#4ade80', c, false);

    // Show online trajectory as fading lines
    for (var i = 1; i < w_online_history.length; i++) {
      var prev = w_online_history[i - 1];
      var curr = w_online_history[i];
      var alpha = 0.15 + 0.6 * (i / w_online_history.length);

      ctx.strokeStyle = 'rgba(74, 222, 128, ' + alpha.toFixed(2) + ')';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();

      // Draw the intermediate regression line
      var xMin = -2.5, xMax = 2.5;
      var y1 = curr.w * xMin + curr.b;
      var y2 = curr.w * xMax + curr.b;

      var px1 = rx + mapX(xMin, halfW);
      var py1 = ly + mapY(y1, plotH);
      var px2 = rx + mapX(xMax, halfW);
      var py2 = ly + mapY(y2, plotH);

      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bottom info
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    var batchErr = computeMSE(w_batch, b_batch);
    var onlineErr = computeMSE(lastOnline.w, lastOnline.b);
    var trueErr = computeMSE(w_true, b_true);

    ctx.fillText(
      'True: y = ' + w_true.toFixed(2) + 'x + ' + b_true.toFixed(2) +
      '  |  Batch MSE: ' + batchErr.toFixed(3) +
      '  |  Online MSE: ' + onlineErr.toFixed(3) +
      '  |  Optimal MSE: ' + trueErr.toFixed(3),
      WIDTH / 2, HEIGHT - 8
    );
  }

  function computeMSE(w, b) {
    var sum = 0;
    for (var i = 0; i < dataPoints.length; i++) {
      var pred = w * dataPoints[i].x + b;
      var err = dataPoints[i].y - pred;
      sum += err * err;
    }
    return sum / dataPoints.length;
  }

  var VIEW_X = [-2.5, 2.5];
  var VIEW_Y = [-5, 5];

  function mapX(x, w) {
    return ((x - VIEW_X[0]) / (VIEW_X[1] - VIEW_X[0])) * w;
  }

  function mapY(y, h) {
    return h - ((y - VIEW_Y[0]) / (VIEW_Y[1] - VIEW_Y[0])) * h;
  }

  function drawScatter(ox, oy, w, h, fitW, fitB, color, c, isBatch) {
    // Background
    ctx.fillStyle = 'rgba(148,163,184,0.03)';
    ctx.fillRect(ox, oy, w, h);

    // Axes
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // X axis (y=0)
    var zeroY = oy + mapY(0, h);
    ctx.moveTo(ox, zeroY);
    ctx.lineTo(ox + w, zeroY);
    // Y axis (x=0)
    var zeroX = ox + mapX(0, w);
    ctx.moveTo(zeroX, oy);
    ctx.lineTo(zeroX, oy + h);
    ctx.stroke();

    // Ground truth line (faint)
    ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ox + mapX(VIEW_X[0], w), oy + mapY(w_true * VIEW_X[0] + b_true, h));
    ctx.lineTo(ox + mapX(VIEW_X[1], w), oy + mapY(w_true * VIEW_X[1] + b_true, h));
    ctx.stroke();
    ctx.setLineDash([]);

    // Fit line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ox + mapX(VIEW_X[0], w), oy + mapY(fitW * VIEW_X[0] + fitB, h));
    ctx.lineTo(ox + mapX(VIEW_X[1], w), oy + mapY(fitW * VIEW_X[1] + fitB, h));
    ctx.stroke();

    // Data points
    for (var i = 0; i < dataPoints.length; i++) {
      var px = ox + mapX(dataPoints[i].x, w);
      var py = oy + mapY(dataPoints[i].y, h);

      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = c.text;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;

      // If batch: show all points equally. If online: show progressive opacity
      if (!isBatch) {
        var alpha = 0.2 + 0.8 * (i / dataPoints.length);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(74, 222, 128, ' + alpha.toFixed(2) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Step number
        ctx.fillStyle = 'rgba(74, 222, 128, ' + (alpha * 0.7).toFixed(2) + ')';
        ctx.font = '6px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), px, py - 7);
      }
    }

    // Equation
    ctx.fillStyle = color;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('y\u0302 = ' + fitW.toFixed(2) + 'x + ' + fitB.toFixed(2), ox + 5, oy + h - 5);
  }

  function seededRandom(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('input', function () { callback(this.value); });
  }

  return { init: init };
})();
