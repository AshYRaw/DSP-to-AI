/* ============================================================
   DSP to AI — Plot Utilities
   Lightweight Canvas 2D plotting for signal visualization.
   No external dependencies.
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.PlotUtils = (function () {
  'use strict';

  /**
   * Get theme-aware colors from CSS variables.
   */
  function getColors() {
    var s = getComputedStyle(document.documentElement);
    return {
      bg: s.getPropertyValue('--bg').trim() || '#0a0e1a',
      surface: s.getPropertyValue('--surface').trim() || '#111827',
      text: s.getPropertyValue('--text').trim() || '#e2e8f0',
      textDim: s.getPropertyValue('--text-dim').trim() || '#94a3b8',
      border: s.getPropertyValue('--border').trim() || '#1e293b',
      dsp: s.getPropertyValue('--color-dsp').trim() || '#22d3ee',
      ai: s.getPropertyValue('--color-ai').trim() || '#fb923c',
      bridge: s.getPropertyValue('--color-bridge').trim() || '#a78bfa',
      math: s.getPropertyValue('--color-math').trim() || '#4ade80',
      danger: s.getPropertyValue('--color-danger').trim() || '#fb7185'
    };
  }

  var SIGNAL_COLORS = [
    '#22d3ee', '#fb923c', '#a78bfa', '#4ade80', '#fb7185',
    '#fbbf24', '#60a5fa', '#34d399', '#f472b6', '#818cf8'
  ];

  /**
   * Setup a canvas for HiDPI rendering.
   * @param {HTMLCanvasElement} canvas
   * @param {number} width  - CSS width
   * @param {number} height - CSS height
   * @returns {CanvasRenderingContext2D}
   */
  function setupCanvas(canvas, width, height) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
  }

  /**
   * Draw axes on a canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} opts
   * @param {number} opts.width   - CSS width
   * @param {number} opts.height  - CSS height
   * @param {Object} opts.padding - { top, right, bottom, left }
   * @param {string} opts.xLabel
   * @param {string} opts.yLabel
   * @param {number} opts.xMin
   * @param {number} opts.xMax
   * @param {number} opts.yMin
   * @param {number} opts.yMax
   * @param {number} opts.xTicks  - approximate number of x ticks
   * @param {number} opts.yTicks  - approximate number of y ticks
   */
  function drawAxes(ctx, opts) {
    var c = getColors();
    var pad = opts.padding || { top: 20, right: 20, bottom: 40, left: 50 };
    var plotW = opts.width - pad.left - pad.right;
    var plotH = opts.height - pad.top - pad.bottom;

    // Axis lines
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // Zero line (if visible)
    if (opts.yMin <= 0 && opts.yMax > 0) {
      var zeroY = pad.top + plotH * (opts.yMax / (opts.yMax - opts.yMin));
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, zeroY);
      ctx.lineTo(pad.left + plotW, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Tick marks and labels
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    // X ticks
    var xTicks = opts.xTicks || 5;
    for (var i = 0; i <= xTicks; i++) {
      var xVal = opts.xMin + (opts.xMax - opts.xMin) * i / xTicks;
      var x = pad.left + plotW * i / xTicks;
      ctx.beginPath();
      ctx.moveTo(x, pad.top + plotH);
      ctx.lineTo(x, pad.top + plotH + 4);
      ctx.strokeStyle = c.textDim;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillText(formatNum(xVal), x, pad.top + plotH + 16);
    }

    // Y ticks
    ctx.textAlign = 'right';
    var yTicks = opts.yTicks || 4;
    for (var i = 0; i <= yTicks; i++) {
      var yVal = opts.yMin + (opts.yMax - opts.yMin) * i / yTicks;
      var y = pad.top + plotH - plotH * i / yTicks;
      ctx.beginPath();
      ctx.moveTo(pad.left - 4, y);
      ctx.lineTo(pad.left, y);
      ctx.strokeStyle = c.textDim;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillText(formatNum(yVal), pad.left - 8, y + 3);
    }

    // Labels
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    if (opts.xLabel) {
      ctx.textAlign = 'center';
      ctx.fillText(opts.xLabel, pad.left + plotW / 2, opts.height - 4);
    }
    if (opts.yLabel) {
      ctx.save();
      ctx.translate(12, pad.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(opts.yLabel, 0, 0);
      ctx.restore();
    }
  }

  /**
   * Draw a signal (array of values) as a continuous line.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Float64Array|number[]} samples
   * @param {Object} opts
   * @param {number} opts.width
   * @param {number} opts.height
   * @param {Object} opts.padding
   * @param {number} opts.yMin
   * @param {number} opts.yMax
   * @param {string} opts.color
   * @param {number} opts.lineWidth
   */
  function drawSignal(ctx, samples, opts) {
    if (!samples || samples.length === 0) return;
    var pad = opts.padding || { top: 20, right: 20, bottom: 40, left: 50 };
    var plotW = opts.width - pad.left - pad.right;
    var plotH = opts.height - pad.top - pad.bottom;
    var yMin = opts.yMin !== undefined ? opts.yMin : -1;
    var yMax = opts.yMax !== undefined ? opts.yMax : 1;
    var yRange = yMax - yMin || 1;

    ctx.beginPath();
    ctx.strokeStyle = opts.color || getColors().dsp;
    ctx.lineWidth = opts.lineWidth || 2;
    ctx.lineJoin = 'round';

    for (var i = 0; i < samples.length; i++) {
      var x = pad.left + (i / (samples.length - 1)) * plotW;
      var y = pad.top + plotH - ((samples[i] - yMin) / yRange) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /**
   * Draw discrete sample points (stem plot).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Float64Array|number[]} samples
   * @param {Object} opts - same as drawSignal
   * @param {number} opts.dotRadius
   */
  function drawSamples(ctx, samples, opts) {
    if (!samples || samples.length === 0) return;
    var pad = opts.padding || { top: 20, right: 20, bottom: 40, left: 50 };
    var plotW = opts.width - pad.left - pad.right;
    var plotH = opts.height - pad.top - pad.bottom;
    var yMin = opts.yMin !== undefined ? opts.yMin : -1;
    var yMax = opts.yMax !== undefined ? opts.yMax : 1;
    var yRange = yMax - yMin || 1;
    var color = opts.color || getColors().dsp;
    var radius = opts.dotRadius || 3;

    // Zero line y
    var zeroY = pad.top + plotH - ((0 - yMin) / yRange) * plotH;

    for (var i = 0; i < samples.length; i++) {
      var x = pad.left + (i / (samples.length - 1)) * plotW;
      var y = pad.top + plotH - ((samples[i] - yMin) / yRange) * plotH;

      // Stem line
      ctx.beginPath();
      ctx.moveTo(x, zeroY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Dot
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  /**
   * Clear the canvas with the theme background.
   */
  function clear(ctx, width, height) {
    var c = getColors();
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * Draw a label/title inside the plot area.
   */
  function drawLabel(ctx, text, x, y, opts) {
    opts = opts || {};
    var c = getColors();
    ctx.fillStyle = opts.color || c.textDim;
    ctx.font = (opts.fontSize || 11) + 'px "JetBrains Mono", monospace';
    ctx.textAlign = opts.align || 'left';
    ctx.fillText(text, x, y);
  }

  function formatNum(n) {
    if (Math.abs(n) < 0.001 && n !== 0) return n.toExponential(1);
    if (Math.abs(n) >= 1000) return n.toFixed(0);
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(2);
  }

  /**
   * Map a value from data space to pixel space.
   */
  function mapX(val, xMin, xMax, padLeft, plotW) {
    return padLeft + ((val - xMin) / (xMax - xMin)) * plotW;
  }

  function mapY(val, yMin, yMax, padTop, plotH) {
    return padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;
  }

  return {
    getColors: getColors,
    SIGNAL_COLORS: SIGNAL_COLORS,
    setupCanvas: setupCanvas,
    drawAxes: drawAxes,
    drawSignal: drawSignal,
    drawSamples: drawSamples,
    clear: clear,
    drawLabel: drawLabel,
    mapX: mapX,
    mapY: mapY
  };
})();
