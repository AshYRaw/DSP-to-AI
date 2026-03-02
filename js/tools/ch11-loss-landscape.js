/* ============================================================
   Tool 11.1 — Loss Landscape Explorer
   Top-down heatmap of a 2D loss surface with contour lines.
   Balls roll down via SGD, Momentum, Adam — compare paths.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.LossLandscape = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 480;
  var PAD = { top: 30, right: 160, bottom: 30, left: 50 };

  // Landscape definitions
  var landscapes = {
    convex: {
      name: 'Convex Bowl',
      fn: function (x, y) { return 0.5 * x * x + 2 * y * y; },
      gx: function (x, y) { return x; },
      gy: function (x, y) { return 4 * y; },
      range: [-3, 3],
      start: [2.5, 2.0],
      minima: [[0, 0]]
    },
    saddle: {
      name: 'Saddle Point',
      fn: function (x, y) { return x * x - y * y + 0.1 * x * x * x * x + 0.1 * y * y * y * y; },
      gx: function (x, y) { return 2 * x + 0.4 * x * x * x; },
      gy: function (x, y) { return -2 * y + 0.4 * y * y * y; },
      range: [-2.5, 2.5],
      start: [0.05, 2.0],
      minima: []
    },
    local_minima: {
      name: 'Local Minima',
      fn: function (x, y) {
        return Math.sin(1.5 * x) * Math.cos(1.5 * y) + 0.08 * (x * x + y * y);
      },
      gx: function (x, y) {
        return 1.5 * Math.cos(1.5 * x) * Math.cos(1.5 * y) + 0.16 * x;
      },
      gy: function (x, y) {
        return -1.5 * Math.sin(1.5 * x) * Math.sin(1.5 * y) + 0.16 * y;
      },
      range: [-3, 3],
      start: [2.5, 2.5],
      minima: []
    },
    ravine: {
      name: 'Narrow Ravine',
      fn: function (x, y) { return 0.05 * x * x + 5 * y * y; },
      gx: function (x, y) { return 0.1 * x; },
      gy: function (x, y) { return 10 * y; },
      range: [-4, 4],
      start: [3.5, 1.5],
      minima: [[0, 0]]
    }
  };

  var state = {
    landscape: 'convex',
    lr: 0.05,
    showSGD: true,
    showMomentum: true,
    showAdam: true,
    running: false,
    step: 0,
    maxSteps: 200
  };

  // Optimizer trajectories
  var paths = { sgd: [], momentum: [], adam: [] };
  var optimizers = {};
  var animId = null;
  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '3D loss landscape with SGD, Momentum, and Adam optimizer trajectories');
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

    bindSelect(containerEl, 'landscape-type', function (v) {
      state.landscape = v;
      resetOptimizers();
      render();
    });
    bindSlider(containerEl, 'landscape-lr', function (v) {
      state.lr = parseFloat(v);
      resetOptimizers();
      render();
    });

    // Optimizer toggles
    var toggles = ['sgd', 'momentum', 'adam'];
    for (var t = 0; t < toggles.length; t++) {
      (function (name) {
        var el = containerEl.querySelector('[data-control="show-' + name + '"]');
        if (el) el.addEventListener('change', function () {
          state['show' + name.charAt(0).toUpperCase() + name.slice(1)] = this.checked;
          render();
        });
      })(toggles[t]);
    }

    var runBtn = containerEl.querySelector('[data-action="landscape-run"]');
    if (runBtn) runBtn.addEventListener('click', function () {
      if (state.running) stopAnim();
      else startAnim();
    });
    var resetBtn = containerEl.querySelector('[data-action="landscape-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      stopAnim();
      resetOptimizers();
      render();
    });
    var stepBtn = containerEl.querySelector('[data-action="landscape-step"]');
    if (stepBtn) stepBtn.addEventListener('click', function () {
      stepAll();
      render();
    });

    resetOptimizers();
    resize();
  }

  function resetOptimizers() {
    state.step = 0;
    var L = landscapes[state.landscape];
    var s = L.start;

    // SGD
    optimizers.sgd = { x: s[0], y: s[1] };
    paths.sgd = [{ x: s[0], y: s[1] }];

    // Momentum
    optimizers.momentum = { x: s[0], y: s[1], vx: 0, vy: 0, beta: 0.9 };
    paths.momentum = [{ x: s[0], y: s[1] }];

    // Adam
    optimizers.adam = {
      x: s[0], y: s[1],
      mx: 0, my: 0, vx: 0, vy: 0,
      beta1: 0.9, beta2: 0.999, eps: 1e-8, t: 0
    };
    paths.adam = [{ x: s[0], y: s[1] }];
  }

  function stepAll() {
    var L = landscapes[state.landscape];
    var lr = state.lr;

    // SGD
    var gx = L.gx(optimizers.sgd.x, optimizers.sgd.y);
    var gy = L.gy(optimizers.sgd.x, optimizers.sgd.y);
    optimizers.sgd.x -= lr * gx;
    optimizers.sgd.y -= lr * gy;
    paths.sgd.push({ x: optimizers.sgd.x, y: optimizers.sgd.y });

    // Momentum
    var m = optimizers.momentum;
    gx = L.gx(m.x, m.y);
    gy = L.gy(m.x, m.y);
    m.vx = m.beta * m.vx + lr * gx;
    m.vy = m.beta * m.vy + lr * gy;
    m.x -= m.vx;
    m.y -= m.vy;
    paths.momentum.push({ x: m.x, y: m.y });

    // Adam
    var a = optimizers.adam;
    a.t++;
    gx = L.gx(a.x, a.y);
    gy = L.gy(a.x, a.y);
    a.mx = a.beta1 * a.mx + (1 - a.beta1) * gx;
    a.my = a.beta1 * a.my + (1 - a.beta1) * gy;
    a.vx = a.beta2 * a.vx + (1 - a.beta2) * gx * gx;
    a.vy = a.beta2 * a.vy + (1 - a.beta2) * gy * gy;
    var mxHat = a.mx / (1 - Math.pow(a.beta1, a.t));
    var myHat = a.my / (1 - Math.pow(a.beta1, a.t));
    var vxHat = a.vx / (1 - Math.pow(a.beta2, a.t));
    var vyHat = a.vy / (1 - Math.pow(a.beta2, a.t));
    a.x -= lr * mxHat / (Math.sqrt(vxHat) + a.eps);
    a.y -= lr * myHat / (Math.sqrt(vyHat) + a.eps);
    paths.adam.push({ x: a.x, y: a.y });

    state.step++;
  }

  function startAnim() {
    state.running = true;
    updateRunBtn();
    animLoop();
  }

  function stopAnim() {
    state.running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    updateRunBtn();
  }

  function animLoop() {
    if (!state.running || state.step >= state.maxSteps) {
      stopAnim();
      render();
      return;
    }
    stepAll();
    render();
    animId = requestAnimationFrame(animLoop);
  }

  function updateRunBtn() {
    var btn = containerEl.querySelector('[data-action="landscape-run"]');
    if (btn) btn.textContent = state.running ? '\u23f8 Pause' : '\u25b6 Run';
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var L = landscapes[state.landscape];
    var range = L.range;
    var plotW = WIDTH - PAD.left - PAD.right;
    var plotH = HEIGHT - PAD.top - PAD.bottom;

    // Title
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(L.name.toUpperCase() + ' | Step ' + state.step, PAD.left, PAD.top - 8);

    // ─── Heatmap ───
    var res = 80;
    var cellW = plotW / res;
    var cellH = plotH / res;

    // Compute all values for color mapping
    var vals = [];
    var minVal = Infinity, maxVal = -Infinity;
    for (var i = 0; i < res; i++) {
      for (var j = 0; j < res; j++) {
        var px = range[0] + (range[1] - range[0]) * i / res;
        var py = range[1] - (range[1] - range[0]) * j / res;
        var v = L.fn(px, py);
        vals.push(v);
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }

    var idx = 0;
    for (var i = 0; i < res; i++) {
      for (var j = 0; j < res; j++) {
        var t = (vals[idx] - minVal) / (maxVal - minVal + 1e-10);
        ctx.fillStyle = landscapeColor(t);
        ctx.fillRect(PAD.left + i * cellW, PAD.top + j * cellH, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
        idx++;
      }
    }

    // ─── Contour lines ───
    var nContours = 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    for (var ci = 1; ci < nContours; ci++) {
      var threshold = minVal + (maxVal - minVal) * ci / nContours;
      drawContour(L.fn, range, plotW, plotH, threshold);
    }

    // ─── Optimizer Paths ───
    if (state.showSGD) drawPath(paths.sgd, '#fb7185', 'SGD', range, plotW, plotH, c);
    if (state.showMomentum) drawPath(paths.momentum, '#4ade80', 'Momentum', range, plotW, plotH, c);
    if (state.showAdam) drawPath(paths.adam, '#fbbf24', 'Adam', range, plotW, plotH, c);

    // ─── Axes ───
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i <= 4; i++) {
      var val = range[0] + (range[1] - range[0]) * i / 4;
      var px = PAD.left + plotW * i / 4;
      ctx.fillText(val.toFixed(1), px, HEIGHT - PAD.bottom + 14);
    }
    ctx.textAlign = 'right';
    for (var i = 0; i <= 4; i++) {
      var val = range[1] - (range[1] - range[0]) * i / 4;
      var py = PAD.top + plotH * i / 4;
      ctx.fillText(val.toFixed(1), PAD.left - 6, py + 3);
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('w\u2081', PAD.left + plotW / 2, HEIGHT - 4);
    ctx.save();
    ctx.translate(10, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('w\u2082', 0, 0);
    ctx.restore();

    // ─── Legend ───
    var legendX = PAD.left + plotW + 12;
    var legendY = PAD.top + 10;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    ctx.fillStyle = c.text;
    ctx.fillText('OPTIMIZERS', legendX, legendY);
    legendY += 20;

    var optimInfo = [
      { name: 'SGD', color: '#fb7185', key: 'sgd', show: state.showSGD },
      { name: 'Momentum', color: '#4ade80', key: 'momentum', show: state.showMomentum },
      { name: 'Adam', color: '#fbbf24', key: 'adam', show: state.showAdam }
    ];

    for (var oi = 0; oi < optimInfo.length; oi++) {
      var o = optimInfo[oi];
      if (!o.show) { legendY += 50; continue; }

      // Color dot
      ctx.beginPath();
      ctx.arc(legendX + 6, legendY, 4, 0, Math.PI * 2);
      ctx.fillStyle = o.color;
      ctx.fill();

      ctx.fillStyle = o.color;
      ctx.fillText(o.name, legendX + 16, legendY + 4);
      legendY += 16;

      // Current position
      var curPath = paths[o.key];
      if (curPath.length > 0) {
        var last = curPath[curPath.length - 1];
        var L2 = landscapes[state.landscape];
        var lossVal = L2.fn(last.x, last.y);
        ctx.fillStyle = c.textDim;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText('pos: (' + last.x.toFixed(2) + ', ' + last.y.toFixed(2) + ')', legendX + 4, legendY);
        legendY += 12;
        ctx.fillText('loss: ' + lossVal.toFixed(4), legendX + 4, legendY);
        legendY += 18;
      }
      ctx.font = '10px "JetBrains Mono", monospace';
    }

    // Loss comparison bar
    legendY += 10;
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('\u03B7 = ' + state.lr.toFixed(3), legendX + 4, legendY);
  }

  function drawPath(path, color, name, range, plotW, plotH, c) {
    if (path.length < 2) return;
    var rng = range[1] - range[0];

    // Trail
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    for (var i = 0; i < path.length; i++) {
      var px = PAD.left + ((path[i].x - range[0]) / rng) * plotW;
      var py = PAD.top + ((range[1] - path[i].y) / rng) * plotH;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Dots at intervals
    for (var i = 0; i < path.length; i += Math.max(1, Math.floor(path.length / 20))) {
      var px = PAD.left + ((path[i].x - range[0]) / rng) * plotW;
      var py = PAD.top + ((range[1] - path[i].y) / rng) * plotH;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Current position (large dot)
    var last = path[path.length - 1];
    var lpx = PAD.left + ((last.x - range[0]) / rng) * plotW;
    var lpy = PAD.top + ((range[1] - last.y) / rng) * plotH;
    ctx.beginPath();
    ctx.arc(lpx, lpy, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Start position marker
    var first = path[0];
    var fpx = PAD.left + ((first.x - range[0]) / rng) * plotW;
    var fpy = PAD.top + ((range[1] - first.y) / rng) * plotH;
    ctx.beginPath();
    ctx.arc(fpx, fpy, 4, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawContour(fn, range, plotW, plotH, threshold) {
    var res = 60;
    var rng = range[1] - range[0];
    for (var i = 0; i < res; i++) {
      for (var j = 0; j < res; j++) {
        var x0 = range[0] + rng * i / res;
        var y0 = range[1] - rng * j / res;
        var x1 = range[0] + rng * (i + 1) / res;
        var y1 = range[1] - rng * (j + 1) / res;
        var v00 = fn(x0, y0);
        var v10 = fn(x1, y0);
        var v01 = fn(x0, y1);
        // Horizontal crossing
        if ((v00 - threshold) * (v10 - threshold) < 0) {
          var t = (threshold - v00) / (v10 - v00);
          var px = PAD.left + ((i + t) / res) * plotW;
          var py = PAD.top + (j / res) * plotH;
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(px, py, 1.5, 1.5);
        }
        // Vertical crossing
        if ((v00 - threshold) * (v01 - threshold) < 0) {
          var t = (threshold - v00) / (v01 - v00);
          var px = PAD.left + (i / res) * plotW;
          var py = PAD.top + ((j + t) / res) * plotH;
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(px, py, 1.5, 1.5);
        }
      }
    }
  }

  function landscapeColor(t) {
    // Dark blue → teal → yellow → white
    t = Math.max(0, Math.min(1, t));
    if (t < 0.33) {
      var s = t / 0.33;
      return 'rgb(' + Math.floor(10 + 20 * s) + ',' + Math.floor(15 + 60 * s) + ',' + Math.floor(40 + 80 * s) + ')';
    } else if (t < 0.66) {
      var s = (t - 0.33) / 0.33;
      return 'rgb(' + Math.floor(30 + 100 * s) + ',' + Math.floor(75 + 100 * s) + ',' + Math.floor(120 - 40 * s) + ')';
    } else {
      var s = (t - 0.66) / 0.34;
      return 'rgb(' + Math.floor(130 + 125 * s) + ',' + Math.floor(175 + 60 * s) + ',' + Math.floor(80 - 30 * s) + ')';
    }
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
