/* ============================================================
   Tool 2.2 — Impulse Response Explorer
   Fire an impulse into different systems, see and hear h[n].
   Then convolve an arbitrary signal with h[n] to show that
   the impulse response fully characterizes the system.
   Depends on: signal-generator.js, plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.ImpulseExplorer = (function () {
  'use strict';

  var SG = window.DSPtoAI.SignalGenerator;
  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 440;
  var PAD = { top: 20, right: 20, bottom: 35, left: 50 };

  var N = 300; // samples to show

  /* --- Predefined systems as impulse responses --- */
  var systems = {
    echo: {
      label: 'Echo / Delay',
      desc: 'A copy of the signal arrives later',
      generate: function () {
        var h = new Float64Array(N);
        h[0] = 1.0;
        h[40] = 0.6;    // echo at 40 samples
        h[80] = 0.35;   // second echo
        h[120] = 0.2;   // third echo
        return h;
      }
    },
    reverb: {
      label: 'Reverb',
      desc: 'Exponentially decaying reflections',
      generate: function () {
        var h = new Float64Array(N);
        for (var i = 0; i < N; i++) {
          h[i] = Math.exp(-i / 40) * (i === 0 ? 1 : (Math.random() * 0.4));
        }
        h[0] = 1.0;
        return h;
      }
    },
    lowpass: {
      label: 'Lowpass Filter',
      desc: 'Smooths the signal, removes high frequencies',
      generate: function () {
        var h = new Float64Array(N);
        var M = 21; // filter length
        var fc = 0.1; // cutoff
        for (var i = 0; i < M; i++) {
          var n = i - (M - 1) / 2;
          if (n === 0) {
            h[i] = 2 * fc;
          } else {
            h[i] = Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
          }
          // Hamming window
          h[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (M - 1));
        }
        return h;
      }
    },
    highpass: {
      label: 'Highpass Filter',
      desc: 'Passes sharp changes, removes slow trends',
      generate: function () {
        var h = new Float64Array(N);
        var M = 21;
        var fc = 0.3;
        for (var i = 0; i < M; i++) {
          var n = i - (M - 1) / 2;
          if (n === 0) {
            h[i] = 1 - 2 * fc;
          } else {
            h[i] = -Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
          }
          h[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (M - 1));
        }
        return h;
      }
    },
    resonator: {
      label: 'Resonator',
      desc: 'Rings at a specific frequency — like a tuning fork',
      generate: function () {
        var h = new Float64Array(N);
        var freq = 0.12; // normalized frequency
        var decay = 0.96; // pole radius
        for (var i = 0; i < N; i++) {
          h[i] = Math.pow(decay, i) * Math.sin(2 * Math.PI * freq * i);
        }
        return h;
      }
    },
    differentiator: {
      label: 'Differentiator',
      desc: 'Detects rate of change — edge detector',
      generate: function () {
        var h = new Float64Array(N);
        h[0] = 1;
        h[1] = -1;
        return h;
      }
    }
  };

  var state = {
    systemType: 'echo',
    inputType: 'impulse', // 'impulse' | 'sine' | 'square' | 'noise'
    inputFreq: 5
  };

  function init(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Impulse response explorer with convolution output');
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
      HEIGHT = Math.max(400, Math.min(500, WIDTH * 0.55));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);
    resize();

    // Controls
    bindSelect(container, 'system-type', function (v) { state.systemType = v; render(); });
    bindSelect(container, 'input-type', function (v) { state.inputType = v; render(); });
    bindSlider(container, 'input-freq', function (v) { state.inputFreq = parseFloat(v); render(); });

    // Play impulse response
    var playBtn = container.querySelector('[data-action="play-ir"]');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        Audio.stop();
        var sys = systems[state.systemType];
        var h = sys.generate();
        // Scale up to audible: repeat h to fill 1.5 seconds
        var sr = 8000;
        var durSamples = sr * 1.5;
        var audio = new Float64Array(Math.floor(durSamples));
        // Place impulse response with repetition for echo-like systems
        for (var i = 0; i < h.length && i < audio.length; i++) {
          audio[i] = h[i] * 0.5;
        }
        Audio.playSamples(audio, sr);
      });
    }

    // Play output
    var playOutBtn = container.querySelector('[data-action="play-output"]');
    if (playOutBtn) {
      playOutBtn.addEventListener('click', function () {
        Audio.stop();
        var h = systems[state.systemType].generate();
        var input = getInput(2000, 1.5); // longer for audio
        var output = convolve(input, h);
        // Normalize
        var peak = 0;
        for (var i = 0; i < output.length; i++) peak = Math.max(peak, Math.abs(output[i]));
        if (peak > 0) {
          for (var i = 0; i < output.length; i++) output[i] = output[i] / peak * 0.4;
        }
        Audio.playSamples(output, 8000);
      });
    }

    render();
  }

  function getInput(sampleCount, dur) {
    sampleCount = sampleCount || N;
    dur = dur || 1;
    if (state.inputType === 'impulse') {
      var imp = new Float64Array(sampleCount);
      imp[0] = 1;
      return imp;
    }
    var sig = SG.generate({
      type: state.inputType === 'noise' ? 'noise' : state.inputType,
      frequency: state.inputFreq,
      amplitude: 0.8,
      sampleRate: sampleCount / dur,
      duration: dur
    });
    return sig.samples;
  }

  function convolve(x, h) {
    var lenOut = x.length + h.length - 1;
    var y = new Float64Array(lenOut);
    for (var i = 0; i < x.length; i++) {
      for (var j = 0; j < h.length; j++) {
        y[i + j] += x[i] * h[j];
      }
    }
    return y;
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var sys = systems[state.systemType];
    var h = sys.generate();
    var input = getInput(N, 1);
    var output = convolve(input, h);

    // Trim output to N samples
    var outputTrimmed = new Float64Array(N);
    for (var i = 0; i < N && i < output.length; i++) outputTrimmed[i] = output[i];

    // Find y range
    var maxVal = 0.01;
    for (var i = 0; i < N; i++) {
      maxVal = Math.max(maxVal, Math.abs(input[i]), Math.abs(h[i]), Math.abs(outputTrimmed[i]));
    }
    var yRange = maxVal * 1.3;

    // --- Layout: 3 rows ---
    var rowH = (HEIGHT - 30) / 3;

    function drawRow(rowIdx, label, samples, color, useStem) {
      var yOff = 8 + rowIdx * rowH;
      var plotH = rowH - 22;
      var plotW = WIDTH - PAD.left - PAD.right;

      // Label
      ctx.fillStyle = c.textDim;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, PAD.left, yOff + 10);

      // Separator
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, yOff);
      ctx.lineTo(WIDTH - PAD.right, yOff);
      ctx.stroke();

      // Zero line
      var midY = yOff + 14 + plotH / 2;
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, midY);
      ctx.lineTo(WIDTH - PAD.right, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (useStem) {
        // Draw as stems (for impulse response and impulse input)
        for (var i = 0; i < samples.length; i++) {
          if (Math.abs(samples[i]) < 0.001) continue;
          var x = PAD.left + (i / (samples.length - 1)) * plotW;
          var y = midY - (samples[i] / yRange) * (plotH / 2);

          ctx.beginPath();
          ctx.moveTo(x, midY);
          ctx.lineTo(x, y);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;

          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      } else {
        // Draw as line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (var i = 0; i < samples.length; i++) {
          var x = PAD.left + (i / (samples.length - 1)) * plotW;
          var y = midY - (samples[i] / yRange) * (plotH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Row 0: Input
    var isImpulse = state.inputType === 'impulse';
    drawRow(0, 'INPUT x[n]' + (isImpulse ? ' (impulse \u03B4[n])' : ' (' + state.inputType + ' ' + state.inputFreq + ' Hz)'),
      input, c.dsp, isImpulse);

    // Row 1: Impulse Response
    drawRow(1, 'IMPULSE RESPONSE h[n] \u2014 ' + sys.label, h, c.math, true);

    // Row 2: Output
    drawRow(2, 'OUTPUT y[n] = x[n] * h[n] (convolution)', outputTrimmed, c.ai, false);

    // System description
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sys.desc, WIDTH / 2, HEIGHT - 4);

    // Key insight annotation
    if (isImpulse) {
      ctx.fillStyle = c.math;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('When input = impulse, output IS h[n]', WIDTH - PAD.right, 8 + 2 * rowH + 10);
    }
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
