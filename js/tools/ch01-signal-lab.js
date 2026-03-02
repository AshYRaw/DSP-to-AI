/* ============================================================
   Tool 1.1 — Signal Laboratory
   Interactive waveform generator with audio playback.
   Depends on: signal-generator.js, plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.SignalLab = (function () {
  'use strict';

  var SG = window.DSPtoAI.SignalGenerator;
  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 320;
  var PAD = { top: 25, right: 20, bottom: 45, left: 55 };

  // State
  var state = {
    type: 'sine',
    frequency: 440,
    amplitude: 0.8,
    offset: 0,
    showDiscrete: true,
    discreteSampleRate: 40, // visual sample points (not audio SR)
    audioPlaying: false,
    toneHandle: null
  };

  // Display settings: show ~4 cycles at current frequency
  var displayDuration = 0.01; // seconds of signal to show
  var displaySamples = 800;   // resolution of continuous line

  function init(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    // Create canvas
    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Signal waveform generator showing continuous and discrete representations');
    canvas.setAttribute('tabindex', '0');
    var canvasWrapper = container.querySelector('.tool-canvas-wrapper');
    if (!canvasWrapper) {
      canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'tool-canvas-wrapper';
      container.querySelector('.tool-body').appendChild(canvasWrapper);
    }
    canvasWrapper.appendChild(canvas);

    // Responsive sizing
    function resize() {
      WIDTH = canvasWrapper.offsetWidth || 800;
      HEIGHT = Math.max(280, Math.min(360, WIDTH * 0.4));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }

    window.addEventListener('resize', resize);
    resize();

    // Bind controls
    bindControl(container, 'signal-type', 'change', function (val) {
      state.type = val;
      render();
    });

    bindSlider(container, 'frequency', function (val) {
      state.frequency = parseFloat(val);
      updateDisplayDuration();
      if (state.toneHandle) state.toneHandle.setFrequency(state.frequency);
      render();
    });

    bindSlider(container, 'amplitude', function (val) {
      state.amplitude = parseFloat(val);
      if (state.toneHandle) state.toneHandle.setGain(state.amplitude * 0.4);
      render();
    });

    bindSlider(container, 'offset', function (val) {
      state.offset = parseFloat(val);
      render();
    });

    bindSlider(container, 'sample-points', function (val) {
      state.discreteSampleRate = parseInt(val, 10);
      render();
    });

    // Discrete toggle
    var discreteToggle = container.querySelector('[data-control="show-discrete"]');
    if (discreteToggle) {
      discreteToggle.addEventListener('change', function () {
        state.showDiscrete = this.checked;
        render();
      });
    }

    // Play/Stop button
    var playBtn = container.querySelector('[data-action="play"]');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (state.audioPlaying) {
          stopAudio();
          playBtn.textContent = '\u25B6 Play';
          playBtn.classList.remove('btn--active');
        } else {
          startAudio();
          playBtn.textContent = '\u25A0 Stop';
          playBtn.classList.add('btn--active');
        }
      });
    }

    updateDisplayDuration();
    render();
  }

  function updateDisplayDuration() {
    // Show ~4 cycles
    var period = 1 / state.frequency;
    displayDuration = period * 4;
    // Clamp: show at least 2ms, at most 0.5s
    displayDuration = Math.max(0.002, Math.min(0.5, displayDuration));
  }

  function render() {
    if (!ctx) return;

    Plot.clear(ctx, WIDTH, HEIGHT);
    var c = Plot.getColors();

    // Generate continuous signal for display
    var sig = SG.generate({
      type: state.type,
      frequency: state.frequency,
      amplitude: state.amplitude,
      offset: state.offset,
      sampleRate: displaySamples / displayDuration,
      duration: displayDuration
    });

    var yMax = Math.max(1.2, Math.abs(state.amplitude) + Math.abs(state.offset) + 0.2);
    var yMin = -yMax;

    var plotOpts = {
      width: WIDTH,
      height: HEIGHT,
      padding: PAD,
      yMin: yMin,
      yMax: yMax,
      color: c.dsp,
      lineWidth: 2
    };

    // Draw axes
    Plot.drawAxes(ctx, {
      width: WIDTH,
      height: HEIGHT,
      padding: PAD,
      xMin: 0,
      xMax: displayDuration * 1000,
      yMin: yMin,
      yMax: yMax,
      xTicks: 4,
      yTicks: 4,
      xLabel: 'Time (ms)',
      yLabel: 'Amplitude'
    });

    // Draw continuous waveform
    Plot.drawSignal(ctx, sig.samples, plotOpts);

    // Draw discrete samples if enabled
    if (state.showDiscrete && state.type !== 'noise') {
      var numDiscreteSamples = Math.max(4, Math.round(state.discreteSampleRate * displayDuration * state.frequency));
      numDiscreteSamples = Math.min(200, numDiscreteSamples);

      var discreteSig = SG.generate({
        type: state.type,
        frequency: state.frequency,
        amplitude: state.amplitude,
        offset: state.offset,
        sampleRate: numDiscreteSamples / displayDuration,
        duration: displayDuration
      });

      Plot.drawSamples(ctx, discreteSig.samples, {
        width: WIDTH,
        height: HEIGHT,
        padding: PAD,
        yMin: yMin,
        yMax: yMax,
        color: c.ai,
        dotRadius: 4
      });
    }

    // Title label
    var typeLabels = {
      sine: 'Sine Wave', square: 'Square Wave', triangle: 'Triangle Wave',
      sawtooth: 'Sawtooth Wave', noise: 'White Noise', chirp: 'Chirp (Sweep)'
    };
    Plot.drawLabel(ctx, typeLabels[state.type] || state.type, PAD.left + 8, PAD.top + 4, {
      color: c.dsp, fontSize: 12
    });

    Plot.drawLabel(ctx, state.frequency + ' Hz', WIDTH - PAD.right - 8, PAD.top + 4, {
      color: c.textDim, fontSize: 11, align: 'right'
    });
  }

  function startAudio() {
    if (state.type === 'noise') {
      // Play noise buffer
      var noiseSig = SG.generate({
        type: 'noise',
        amplitude: state.amplitude * 0.4,
        sampleRate: 44100,
        duration: 2
      });
      Audio.playSamples(noiseSig.samples, 44100, true);
      state.audioPlaying = true;
    } else if (state.type === 'chirp') {
      var chirpSig = SG.generate({
        type: 'chirp',
        frequency: state.frequency,
        freqEnd: state.frequency * 4,
        amplitude: state.amplitude * 0.4,
        sampleRate: 44100,
        duration: 2
      });
      Audio.playSamples(chirpSig.samples, 44100, true);
      state.audioPlaying = true;
    } else {
      // Use oscillator for periodic signals
      var oscType = state.type;
      if (oscType === 'triangle') oscType = 'triangle';
      state.toneHandle = Audio.playTone(oscType, state.frequency, state.amplitude * 0.4);
      state.audioPlaying = true;
    }
  }

  function stopAudio() {
    Audio.stop();
    state.audioPlaying = false;
    state.toneHandle = null;
  }

  // --- Helper: bind a slider with value display ---
  function bindSlider(container, name, callback) {
    var slider = container.querySelector('[data-control="' + name + '"]');
    if (!slider) return;
    var display = container.querySelector('[data-value="' + name + '"]');

    slider.addEventListener('input', function () {
      if (display) display.textContent = this.value;
      callback(this.value);
    });

    // Set initial display
    if (display) display.textContent = slider.value;
  }

  function bindControl(container, name, event, callback) {
    var el = container.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener(event, function () {
      callback(this.value);
    });
  }

  return { init: init };
})();
