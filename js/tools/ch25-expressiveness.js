/* ============================================================
   Tool 25.2 — Expressiveness vs Generalization
   Bias-variance tradeoff across architectures.
   Shows learning curves with crossing points.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.Expressiveness = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 460;
  var containerEl;

  var state = {
    task: 'speech',
    range: 'medium'
  };

  var archNames = ['Softmax Attention', 'Linear Attention', 'Mamba-2 (SSD)', 'Mamba-1 (Selective)', 'Hybrid'];
  var archColors = ['#60a5fa', '#818cf8', '#c084fc', '#4ade80', '#f59e0b'];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Expressiveness vs generalization: learning curves for different architectures');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(380, Math.min(480, WIDTH * 0.55));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }

    bindSelect(containerEl, 'ex-task', function (v) { state.task = v; render(); });
    bindSelect(containerEl, 'ex-range', function (v) { state.range = v; render(); });

    window.addEventListener('resize', resize);
    resize();
  }

  function generateCurves() {
    // Generate learning curves based on task and data range
    // More expressive models: lower bias (better at large data) but higher variance (worse at small data)

    var rangeConfig = {
      small:  { min: 100, max: 1000, steps: 30 },
      medium: { min: 100, max: 50000, steps: 40 },
      large:  { min: 100, max: 500000, steps: 50 }
    };

    var taskConfig = {
      speech: {
        // Speech: attention's structure helps early, Mamba catches up
        curves: [
          { base: 12, decay: 0.35, floor: 2.5 },  // Softmax Attention
          { base: 14, decay: 0.33, floor: 2.8 },  // Linear Attention
          { base: 15, decay: 0.38, floor: 2.3 },  // Mamba-2
          { base: 16, decay: 0.40, floor: 2.0 },  // Mamba-1
          { base: 11, decay: 0.37, floor: 2.0 },  // Hybrid
        ]
      },
      language: {
        // Language modeling: attention dominates longer, compositionality matters
        curves: [
          { base: 25, decay: 0.30, floor: 5.0 },
          { base: 28, decay: 0.28, floor: 5.5 },
          { base: 30, decay: 0.34, floor: 4.8 },
          { base: 32, decay: 0.36, floor: 4.2 },
          { base: 23, decay: 0.33, floor: 4.3 },
        ]
      },
      music: {
        // Music: periodicity favors IIR/SSM earlier
        curves: [
          { base: 18, decay: 0.32, floor: 4.0 },
          { base: 17, decay: 0.34, floor: 3.5 },
          { base: 15, decay: 0.38, floor: 2.8 },
          { base: 14, decay: 0.42, floor: 2.2 },
          { base: 13, decay: 0.39, floor: 2.3 },
        ]
      }
    };

    var rc = rangeConfig[state.range];
    var tc = taskConfig[state.task];
    var curves = [];

    for (var a = 0; a < tc.curves.length; a++) {
      var curve = tc.curves[a];
      var points = [];

      for (var s = 0; s < rc.steps; s++) {
        var frac = s / (rc.steps - 1);
        var dataHours = rc.min * Math.pow(rc.max / rc.min, frac);
        // Learning curve: loss = base * (data/100)^(-decay) + floor
        var loss = curve.base * Math.pow(dataHours / 100, -curve.decay) + curve.floor;
        // Add a small noise for realism
        loss += (seededRandom(a * 100 + s) - 0.5) * 0.15;
        points.push({ x: dataHours, y: Math.max(curve.floor * 0.95, loss) });
      }
      curves.push(points);
    }

    return { curves: curves, range: rc };
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var data = generateCurves();
    var curves = data.curves;
    var rc = data.range;

    var PAD = { top: 30, bottom: 50, left: 55, right: 140 };
    var chartW = WIDTH - PAD.left - PAD.right;
    var chartH = HEIGHT - PAD.top - PAD.bottom;

    // Title
    ctx.fillStyle = c.text;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    var taskLabel = state.task === 'speech' ? 'Speech ASR' : state.task === 'language' ? 'Language Modeling' : 'Music Generation';
    ctx.fillText('Test Loss vs Training Data (' + taskLabel + ')', PAD.left + chartW / 2, 16);

    // Axes
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + chartH);
    ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
    ctx.stroke();

    // Find data ranges for scaling
    var yMin = Infinity, yMax = -Infinity;
    for (var a = 0; a < curves.length; a++) {
      for (var p = 0; p < curves[a].length; p++) {
        if (curves[a][p].y < yMin) yMin = curves[a][p].y;
        if (curves[a][p].y > yMax) yMax = curves[a][p].y;
      }
    }
    yMin = Math.max(0, yMin - 1);
    yMax = yMax + 1;

    // X axis (log scale)
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    var xTicks = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000];
    for (var t = 0; t < xTicks.length; t++) {
      if (xTicks[t] < rc.min || xTicks[t] > rc.max) continue;
      var px = PAD.left + (Math.log(xTicks[t]) - Math.log(rc.min)) / (Math.log(rc.max) - Math.log(rc.min)) * chartW;

      ctx.strokeStyle = 'rgba(148,163,184,0.1)';
      ctx.beginPath();
      ctx.moveTo(px, PAD.top);
      ctx.lineTo(px, PAD.top + chartH);
      ctx.stroke();

      var label = xTicks[t] >= 1000 ? (xTicks[t] / 1000) + 'K' : xTicks[t].toString();
      ctx.fillStyle = c.textDim;
      ctx.fillText(label, px, PAD.top + chartH + 14);
    }

    ctx.fillText('Training Data (hours)', PAD.left + chartW / 2, PAD.top + chartH + 30);

    // Y axis ticks
    ctx.textAlign = 'right';
    var yRange = yMax - yMin;
    var yStep = Math.ceil(yRange / 5);
    for (var yv = Math.ceil(yMin); yv <= yMax; yv += yStep) {
      var py = PAD.top + chartH - ((yv - yMin) / (yMax - yMin)) * chartH;
      ctx.fillStyle = c.textDim;
      ctx.fillText(yv.toFixed(0), PAD.left - 5, py + 3);

      ctx.strokeStyle = 'rgba(148,163,184,0.08)';
      ctx.beginPath();
      ctx.moveTo(PAD.left, py);
      ctx.lineTo(PAD.left + chartW, py);
      ctx.stroke();
    }

    // Y label
    ctx.save();
    ctx.translate(12, PAD.top + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Test Loss', 0, 0);
    ctx.restore();

    // Draw curves
    for (var a = 0; a < curves.length; a++) {
      ctx.beginPath();
      ctx.strokeStyle = archColors[a];
      ctx.lineWidth = 2;

      for (var p = 0; p < curves[a].length; p++) {
        var pt = curves[a][p];
        var px = PAD.left + (Math.log(pt.x) - Math.log(rc.min)) / (Math.log(rc.max) - Math.log(rc.min)) * chartW;
        var py = PAD.top + chartH - ((pt.y - yMin) / (yMax - yMin)) * chartH;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Find and mark crossing points (where Mamba-1 crosses Softmax Attention)
    var attnCurve = curves[0];
    var mambaCurve = curves[3];
    for (var p = 1; p < attnCurve.length; p++) {
      var prevDiff = attnCurve[p - 1].y - mambaCurve[p - 1].y;
      var currDiff = attnCurve[p].y - mambaCurve[p].y;
      if (prevDiff * currDiff < 0) {
        // Crossing found
        var px = PAD.left + (Math.log(attnCurve[p].x) - Math.log(rc.min)) / (Math.log(rc.max) - Math.log(rc.min)) * chartW;
        var py = PAD.top + chartH - ((attnCurve[p].y - yMin) / (yMax - yMin)) * chartH;

        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Crossover', px, py - 10);
      }
    }

    // Legend (right side)
    var legendX = WIDTH - PAD.right + 10;
    var legendY = PAD.top + 10;

    ctx.fillStyle = c.textDim;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ARCHITECTURES', legendX, legendY);

    for (var a = 0; a < archNames.length; a++) {
      var ly = legendY + 18 + a * 18;

      ctx.fillStyle = archColors[a];
      ctx.fillRect(legendX, ly - 4, 12, 3);

      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText(archNames[a], legendX + 16, ly);
    }

    // Annotation
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('More constrained = better generalization at small data', legendX, legendY + 120);
    ctx.fillText('More expressive = lower floor at large data', legendX, legendY + 132);
  }

  function seededRandom(seed) {
    var x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
