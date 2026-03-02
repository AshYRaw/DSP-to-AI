/* ============================================================
   Tool 3.1 — Convolution Visualizer (Crown Jewel)
   Kernel slides across input step by step. At each position,
   overlapping samples are multiplied and summed. Output builds
   in a third plot. Play/pause/step, speed, preset kernels,
   and draw-your-own mode.
   Depends on: plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.ConvolutionViz = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;
  var PAD = { top: 8, right: 20, bottom: 8, left: 55 };

  /* --- Preset signals --- */
  var inputPresets = {
    'pulse-train': { label: 'Pulse Train', fn: function (N) {
      var s = new Float64Array(N);
      for (var i = 0; i < N; i++) s[i] = (i % 20 < 3) ? 1 : 0;
      return s;
    }},
    'sine': { label: 'Sine', fn: function (N) {
      var s = new Float64Array(N);
      for (var i = 0; i < N; i++) s[i] = 0.8 * Math.sin(2 * Math.PI * i / 30);
      return s;
    }},
    'step': { label: 'Step', fn: function (N) {
      var s = new Float64Array(N);
      for (var i = Math.floor(N * 0.2); i < N; i++) s[i] = 1;
      return s;
    }},
    'spike': { label: 'Single Spike', fn: function (N) {
      var s = new Float64Array(N);
      s[Math.floor(N * 0.3)] = 1;
      return s;
    }},
    'noisy-sine': { label: 'Noisy Sine', fn: function (N) {
      var s = new Float64Array(N);
      for (var i = 0; i < N; i++) s[i] = 0.6 * Math.sin(2 * Math.PI * i / 25) + 0.3 * (Math.random() - 0.5);
      return s;
    }}
  };

  var kernelPresets = {
    'averaging': { label: 'Averaging (Blur)', h: [0.2, 0.2, 0.2, 0.2, 0.2] },
    'difference': { label: 'Difference (Edge)', h: [1, -1] },
    'echo': { label: 'Echo', h: [1, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0.3] },
    'gaussian': { label: 'Gaussian Smooth', h: [0.06, 0.12, 0.18, 0.24, 0.18, 0.12, 0.06] },
    'derivative': { label: 'Derivative', h: [-0.5, 0, 0.5] },
    'sharpen': { label: 'Sharpen', h: [-0.25, 1.5, -0.25] }
  };

  var N = 80; // signal length

  var state = {
    input: null,
    kernel: null,
    output: null,
    pos: -1,        // current kernel position (step index)
    maxPos: 0,
    playing: false,
    speed: 150,      // ms per step
    timer: null,
    inputPreset: 'sine',
    kernelPreset: 'averaging'
  };

  function init(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Animated convolution step-by-step visualization');
    canvas.setAttribute('tabindex', '0');
    var wrapper = container.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      container.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(500, Math.min(600, WIDTH * 0.7));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Initialize signals
    resetSignals();

    // Controls
    bindSelect(container, 'input-preset', function (v) {
      state.inputPreset = v;
      resetSignals();
      render();
    });

    bindSelect(container, 'kernel-preset', function (v) {
      state.kernelPreset = v;
      resetSignals();
      render();
    });

    bindSlider(container, 'speed', function (v) {
      state.speed = 300 - parseInt(v, 10); // invert: higher slider = faster
      if (state.playing) { clearInterval(state.timer); startTimer(); }
    });

    // Play/Pause
    var playBtn = container.querySelector('[data-action="play-pause"]');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (state.playing) {
          pause();
          playBtn.textContent = '\u25B6 Play';
        } else {
          if (state.pos >= state.maxPos) { state.pos = -1; computeOutput(); }
          play();
          playBtn.textContent = '\u23F8 Pause';
        }
      });
    }

    // Step forward
    var stepBtn = container.querySelector('[data-action="step"]');
    if (stepBtn) {
      stepBtn.addEventListener('click', function () {
        pause();
        if (playBtn) playBtn.textContent = '\u25B6 Play';
        stepForward();
        render();
      });
    }

    // Reset
    var resetBtn = container.querySelector('[data-action="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        pause();
        if (playBtn) playBtn.textContent = '\u25B6 Play';
        state.pos = -1;
        computeOutput();
        render();
      });
    }

    resize();
  }

  function resetSignals() {
    var preset = inputPresets[state.inputPreset];
    state.input = preset ? preset.fn(N) : inputPresets['sine'].fn(N);

    var kPreset = kernelPresets[state.kernelPreset];
    state.kernel = kPreset ? new Float64Array(kPreset.h) : new Float64Array([0.2, 0.2, 0.2, 0.2, 0.2]);

    state.maxPos = state.input.length + state.kernel.length - 2;
    state.pos = -1;
    computeOutput();
  }

  function computeOutput() {
    var x = state.input;
    var h = state.kernel;
    var outLen = x.length + h.length - 1;
    state.output = new Float64Array(outLen);

    // Only compute up to current position
    var limit = state.pos >= 0 ? state.pos + 1 : 0;
    for (var n = 0; n < limit && n < outLen; n++) {
      var sum = 0;
      for (var k = 0; k < h.length; k++) {
        var idx = n - k;
        if (idx >= 0 && idx < x.length) {
          sum += x[idx] * h[k];
        }
      }
      state.output[n] = sum;
    }
  }

  function stepForward() {
    if (state.pos < state.maxPos) {
      state.pos++;
      computeOutput();
    }
  }

  function play() {
    state.playing = true;
    startTimer();
  }

  function startTimer() {
    state.timer = setInterval(function () {
      stepForward();
      render();
      if (state.pos >= state.maxPos) {
        pause();
        var playBtn = document.querySelector('[data-action="play-pause"]');
        if (playBtn) playBtn.textContent = '\u25B6 Play';
      }
    }, Math.max(20, state.speed));
  }

  function pause() {
    state.playing = false;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var x = state.input;
    var h = state.kernel;
    var y = state.output;
    var pos = state.pos;

    // Find global y range
    var maxAbs = 0.01;
    for (var i = 0; i < x.length; i++) maxAbs = Math.max(maxAbs, Math.abs(x[i]));
    for (var i = 0; i < h.length; i++) maxAbs = Math.max(maxAbs, Math.abs(h[i]));
    for (var i = 0; i < y.length; i++) maxAbs = Math.max(maxAbs, Math.abs(y[i]));
    var yR = maxAbs * 1.3;

    var plotW = WIDTH - PAD.left - PAD.right;
    var rowH = (HEIGHT - 16) / 3;

    function getX(idx, totalLen) {
      return PAD.left + (idx / (totalLen - 1 || 1)) * plotW;
    }

    function getY(val, midY) {
      return midY - (val / yR) * (rowH * 0.35);
    }

    function drawStemPlot(samples, midY, color, totalLen, highlightRange) {
      for (var i = 0; i < samples.length; i++) {
        var px = getX(i, totalLen);
        var py = getY(samples[i], midY);
        var isHighlighted = highlightRange && i >= highlightRange[0] && i <= highlightRange[1];

        // Stem
        ctx.beginPath();
        ctx.moveTo(px, midY);
        ctx.lineTo(px, py);
        ctx.strokeStyle = color;
        ctx.lineWidth = isHighlighted ? 2.5 : 1.5;
        ctx.globalAlpha = isHighlighted ? 1 : 0.45;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Dot
        ctx.beginPath();
        ctx.arc(px, py, isHighlighted ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isHighlighted ? '#ffffff' : color;
        ctx.fill();
        if (isHighlighted) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    function drawRowLabel(text, y, color) {
      ctx.fillStyle = color || c.textDim;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(text, PAD.left, y);
    }

    function drawZeroLine(midY) {
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, midY);
      ctx.lineTo(WIDTH - PAD.right, midY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    var totalLen = y.length; // use output length as reference frame

    // === Row 0: Input x[n] ===
    var midY0 = PAD.top + rowH * 0.55;
    drawRowLabel('INPUT x[n]', PAD.top + 12, c.dsp);
    drawZeroLine(midY0);

    // Highlight range: which input samples overlap with kernel at current pos
    var hlStart = pos >= 0 ? Math.max(0, pos - h.length + 1) : -1;
    var hlEnd = pos >= 0 ? Math.min(x.length - 1, pos) : -1;

    drawStemPlot(x, midY0, c.dsp, totalLen, pos >= 0 ? [hlStart, hlEnd] : null);

    // Draw kernel overlay on input row (flipped, positioned at current step)
    if (pos >= 0) {
      ctx.globalAlpha = 0.6;
      for (var k = 0; k < h.length; k++) {
        var inputIdx = pos - k;
        if (inputIdx >= 0 && inputIdx < totalLen) {
          var kx = getX(inputIdx, totalLen);
          var ky = getY(h[k], midY0);
          // Kernel stem
          ctx.beginPath();
          ctx.moveTo(kx, midY0);
          ctx.lineTo(kx, ky);
          ctx.strokeStyle = c.ai;
          ctx.lineWidth = 2;
          ctx.stroke();
          // Kernel dot
          ctx.beginPath();
          ctx.arc(kx, ky, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = c.ai;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Show multiplication at overlap
      var sum = 0;
      var multText = '';
      var terms = 0;
      for (var k = 0; k < h.length; k++) {
        var idx = pos - k;
        if (idx >= 0 && idx < x.length) {
          var prod = x[idx] * h[k];
          sum += prod;
          if (terms < 4) {
            multText += (terms > 0 ? ' + ' : '') + x[idx].toFixed(2) + '\u00D7' + h[k].toFixed(2);
          }
          terms++;
        }
      }
      if (terms > 4) multText += ' + ...';
      multText += ' = ' + sum.toFixed(3);

      ctx.fillStyle = c.math;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('y[' + pos + '] = ' + multText, WIDTH - PAD.right, PAD.top + 12);
    }

    // Separator
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top + rowH);
    ctx.lineTo(WIDTH - PAD.right, PAD.top + rowH);
    ctx.stroke();

    // === Row 1: Kernel h[n] (flipped = h[-n]) ===
    var midY1 = PAD.top + rowH + rowH * 0.55;
    drawRowLabel('KERNEL h[k] (flipped for convolution)', PAD.top + rowH + 12, c.ai);
    drawZeroLine(midY1);

    // Draw kernel at its native position
    drawStemPlot(h, midY1, c.ai, h.length > 10 ? h.length : 10, null);

    // Show kernel length info
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Length: ' + h.length + ' taps', WIDTH - PAD.right, PAD.top + rowH + 12);

    // Separator
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top + 2 * rowH);
    ctx.lineTo(WIDTH - PAD.right, PAD.top + 2 * rowH);
    ctx.strokeStyle = c.border;
    ctx.stroke();

    // === Row 2: Output y[n] ===
    var midY2 = PAD.top + 2 * rowH + rowH * 0.55;
    drawRowLabel('OUTPUT y[n] = x[n] \u2217 h[n]', PAD.top + 2 * rowH + 12, c.math);
    drawZeroLine(midY2);

    // Draw output (only computed samples)
    if (pos >= 0) {
      // Draw as line for smoothness
      ctx.beginPath();
      ctx.strokeStyle = c.math;
      ctx.lineWidth = 2;
      for (var i = 0; i <= pos && i < y.length; i++) {
        var px = getX(i, totalLen);
        var py = getY(y[i], midY2);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Highlight current output sample
      if (pos < y.length) {
        var cpx = getX(pos, totalLen);
        var cpy = getY(y[pos], midY2);
        ctx.beginPath();
        ctx.arc(cpx, cpy, 5, 0, Math.PI * 2);
        ctx.fillStyle = c.math;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Progress indicator
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    var pct = state.maxPos > 0 ? Math.round((pos + 1) / (state.maxPos + 1) * 100) : 0;
    ctx.fillText('Step ' + (pos + 1) + ' / ' + (state.maxPos + 1) + '  (' + pct + '%)', WIDTH - PAD.right, PAD.top + 2 * rowH + 12);
  }

  function bindSlider(container, name, callback) {
    var el = container.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = container.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      if (disp) disp.textContent = this.value;
      callback(this.value);
    });
    if (disp) disp.textContent = el.value;
  }

  function bindSelect(container, name, callback) {
    var el = container.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
