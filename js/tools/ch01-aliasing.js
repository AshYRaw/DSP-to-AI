/* ============================================================
   Tool 1.2 — Sampling & Aliasing Demonstrator
   Shows what happens when sample rate drops below Nyquist.
   Depends on: signal-generator.js, plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.AliasingDemo = (function () {
  'use strict';

  var SG = window.DSPtoAI.SignalGenerator;
  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 380;
  var PAD = { top: 25, right: 20, bottom: 45, left: 55 };

  var state = {
    signalFreq: 5,       // Hz (visual, low for clear display)
    sampleRate: 20,      // samples per second
    audioFreq: 440,      // Hz (for audio demo)
    audioSampleRate: 44100,
    showReconstructed: true
  };

  var displayDuration = 1.0; // show 1 second
  var continuousN = 1000;    // high-res continuous

  function init(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Aliasing demonstrator comparing original and reconstructed signals');
    canvas.setAttribute('tabindex', '0');
    var canvasWrapper = container.querySelector('.tool-canvas-wrapper');
    if (!canvasWrapper) {
      canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'tool-canvas-wrapper';
      container.querySelector('.tool-body').appendChild(canvasWrapper);
    }
    canvasWrapper.appendChild(canvas);

    function resize() {
      WIDTH = canvasWrapper.offsetWidth || 800;
      HEIGHT = Math.max(340, Math.min(420, WIDTH * 0.48));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }

    window.addEventListener('resize', resize);
    resize();

    // Bind controls
    bindSlider(container, 'signal-freq', function (val) {
      state.signalFreq = parseFloat(val);
      state.audioFreq = state.signalFreq * 88; // scale to audible
      render();
    });

    bindSlider(container, 'sample-rate', function (val) {
      state.sampleRate = parseFloat(val);
      render();
    });

    // Play original button
    var playOrigBtn = container.querySelector('[data-action="play-original"]');
    if (playOrigBtn) {
      playOrigBtn.addEventListener('click', function () {
        Audio.stop();
        var sig = SG.generate({
          type: 'sine', frequency: state.audioFreq,
          amplitude: 0.3, sampleRate: 44100, duration: 1.5
        });
        Audio.playSamples(sig.samples, 44100);
      });
    }

    // Play aliased button
    var playAliasBtn = container.querySelector('[data-action="play-aliased"]');
    if (playAliasBtn) {
      playAliasBtn.addEventListener('click', function () {
        Audio.stop();
        // Compute aliased frequency
        var aliasedFreq = getAliasedFrequency(state.audioFreq, state.sampleRate * 88);
        var sig = SG.generate({
          type: 'sine', frequency: aliasedFreq,
          amplitude: 0.3, sampleRate: 44100, duration: 1.5
        });
        Audio.playSamples(sig.samples, 44100);
      });
    }

    render();
  }

  function getAliasedFrequency(freq, sampleRate) {
    // Fold frequency into [0, sampleRate/2]
    var nyquist = sampleRate / 2;
    if (freq <= nyquist) return freq;
    // Reflect around Nyquist
    var folded = freq % sampleRate;
    if (folded > nyquist) folded = sampleRate - folded;
    return Math.abs(folded);
  }

  function render() {
    if (!ctx) return;

    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var nyquist = state.sampleRate / 2;
    var isAliased = state.signalFreq > nyquist;
    var aliasedFreq = getAliasedFrequency(state.signalFreq, state.sampleRate);

    // --- Generate continuous original signal ---
    var continuous = SG.generate({
      type: 'sine', frequency: state.signalFreq,
      amplitude: 0.8, sampleRate: continuousN / displayDuration,
      duration: displayDuration
    });

    // --- Generate sample points ---
    var numSamples = Math.round(state.sampleRate * displayDuration);
    var samplePoints = [];
    for (var i = 0; i < numSamples; i++) {
      var t = i / state.sampleRate;
      var val = 0.8 * Math.sin(2 * Math.PI * state.signalFreq * t);
      samplePoints.push(val);
    }

    // --- Generate reconstructed (aliased) signal ---
    var reconstructed = SG.generate({
      type: 'sine', frequency: aliasedFreq,
      amplitude: 0.8, sampleRate: continuousN / displayDuration,
      duration: displayDuration
    });

    var yMin = -1.3, yMax = 1.3;

    // Draw axes
    Plot.drawAxes(ctx, {
      width: WIDTH, height: HEIGHT, padding: PAD,
      xMin: 0, xMax: displayDuration * 1000,
      yMin: yMin, yMax: yMax,
      xTicks: 5, yTicks: 4,
      xLabel: 'Time (ms)', yLabel: 'Amplitude'
    });

    // Draw original signal (always cyan)
    Plot.drawSignal(ctx, continuous.samples, {
      width: WIDTH, height: HEIGHT, padding: PAD,
      yMin: yMin, yMax: yMax,
      color: c.dsp, lineWidth: 2
    });

    // Draw reconstructed signal (red if aliased, green if ok)
    if (state.showReconstructed && isAliased) {
      Plot.drawSignal(ctx, reconstructed.samples, {
        width: WIDTH, height: HEIGHT, padding: PAD,
        yMin: yMin, yMax: yMax,
        color: c.danger, lineWidth: 2
      });
    }

    // Draw sample points
    var plotW = WIDTH - PAD.left - PAD.right;
    var plotH = HEIGHT - PAD.top - PAD.bottom;
    var yRange = yMax - yMin;

    for (var i = 0; i < samplePoints.length; i++) {
      var x = PAD.left + (i / (numSamples - 1 || 1)) * plotW;
      var y = PAD.top + plotH - ((samplePoints[i] - yMin) / yRange) * plotH;

      // Stem
      var zeroY = PAD.top + plotH - ((0 - yMin) / yRange) * plotH;
      ctx.beginPath();
      ctx.moveTo(x, zeroY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = isAliased ? c.danger : c.math;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Dot
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = isAliased ? c.danger : c.math;
      ctx.fill();
      ctx.strokeStyle = c.bg;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // --- Info labels ---
    var labelY = PAD.top + 4;
    Plot.drawLabel(ctx, 'Signal: ' + state.signalFreq.toFixed(1) + ' Hz', PAD.left + 8, labelY, {
      color: c.dsp, fontSize: 12
    });

    Plot.drawLabel(ctx, 'Fs = ' + state.sampleRate.toFixed(0) + ' Hz', PAD.left + 180, labelY, {
      color: c.textDim, fontSize: 11
    });

    Plot.drawLabel(ctx, 'Nyquist = ' + nyquist.toFixed(1) + ' Hz', PAD.left + 310, labelY, {
      color: isAliased ? c.danger : c.math, fontSize: 11
    });

    // Status indicator
    var statusText = isAliased
      ? 'ALIASED! Appears as ' + aliasedFreq.toFixed(1) + ' Hz'
      : 'OK: Sample rate sufficient (Fs > 2f)';
    var statusColor = isAliased ? c.danger : c.math;

    // Status bar at bottom
    var statusY = HEIGHT - 8;
    Plot.drawLabel(ctx, statusText, WIDTH / 2, statusY, {
      color: statusColor, fontSize: 12, align: 'center'
    });

    // Nyquist line annotation
    if (isAliased) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = c.danger;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      // Draw subtle warning flash on border
      ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);
      ctx.restore();
    }
  }

  function bindSlider(container, name, callback) {
    var slider = container.querySelector('[data-control="' + name + '"]');
    if (!slider) return;
    var display = container.querySelector('[data-value="' + name + '"]');

    slider.addEventListener('input', function () {
      if (display) display.textContent = this.value;
      callback(this.value);
    });

    if (display) display.textContent = slider.value;
  }

  return { init: init };
})();
