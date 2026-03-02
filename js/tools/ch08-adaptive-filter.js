/* ============================================================
   Tool 8.1 — Adaptive Noise Canceller
   LMS adaptive filter that cancels noise in real-time.
   Watch coefficients evolve, adjust step size (mu),
   see learning curve and error convergence.
   Depends on: plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.AdaptiveFilter = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var PAD = { top: 8, right: 20, bottom: 8, left: 55 };

  var sr = 8000;
  var duration = 2.0;
  var nSamples;

  // Signals
  var cleanSignal = null;
  var noiseRef = null;
  var noisySignal = null;
  var filteredSignal = null;
  var errorSignal = null;

  // Adaptive filter state
  var coefficients = null;    // filter taps w[n]
  var coeffHistory = null;    // 2D array: snapshots of coefficients over time
  var learningCurve = null;   // MSE over time (averaged)

  var state = {
    signalType: 'tones',       // tones | speech-like | chirp
    noiseType: 'correlated',   // correlated | narrowband | broadband
    mu: 0.01,                  // step size
    order: 16,                 // filter length
    snr: 0                     // signal-to-noise ratio in dB
  };

  var containerEl;
  var isRunning = false;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Adaptive filter simulator showing LMS convergence');
    canvas.setAttribute('tabindex', '0');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      containerEl.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    nSamples = Math.floor(sr * duration);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(480, Math.min(560, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Controls
    bindSelect(containerEl, 'adapt-signal', function (v) {
      state.signalType = v;
      runAdaptive();
    });
    bindSelect(containerEl, 'adapt-noise', function (v) {
      state.noiseType = v;
      runAdaptive();
    });
    bindSlider(containerEl, 'adapt-mu', function (v) {
      state.mu = parseFloat(v);
      runAdaptive();
    });
    bindSlider(containerEl, 'adapt-order', function (v) {
      state.order = parseInt(v, 10);
      runAdaptive();
    });
    bindSlider(containerEl, 'adapt-snr', function (v) {
      state.snr = parseFloat(v);
      runAdaptive();
    });

    // Play buttons
    var playNoisy = containerEl.querySelector('[data-action="play-noisy"]');
    if (playNoisy) playNoisy.addEventListener('click', function () {
      Audio.stop();
      if (noisySignal) Audio.playSamples(noisySignal, sr);
    });
    var playClean = containerEl.querySelector('[data-action="play-cleaned"]');
    if (playClean) playClean.addEventListener('click', function () {
      Audio.stop();
      if (filteredSignal) Audio.playSamples(filteredSignal, sr);
    });
    var playOrig = containerEl.querySelector('[data-action="play-original-adapt"]');
    if (playOrig) playOrig.addEventListener('click', function () {
      Audio.stop();
      if (cleanSignal) Audio.playSamples(cleanSignal, sr);
    });
    var stopBtn = containerEl.querySelector('[data-action="stop-adaptive"]');
    if (stopBtn) stopBtn.addEventListener('click', function () { Audio.stop(); });

    runAdaptive();
    resize();
  }

  // ─── Signal Generation ───

  function generateCleanSignal() {
    cleanSignal = new Float64Array(nSamples);
    switch (state.signalType) {
      case 'tones':
        for (var i = 0; i < nSamples; i++) {
          var t = i / sr;
          cleanSignal[i] = 0.3 * Math.sin(2 * Math.PI * 300 * t)
                         + 0.2 * Math.sin(2 * Math.PI * 700 * t)
                         + 0.15 * Math.sin(2 * Math.PI * 1200 * t);
        }
        break;
      case 'speech-like':
        for (var i = 0; i < nSamples; i++) {
          var t = i / sr;
          var glottal = 0;
          for (var h = 1; h <= 12; h++) {
            glottal += (1 / h) * Math.sin(2 * Math.PI * 150 * h * t);
          }
          var env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2.5 * t);
          cleanSignal[i] = glottal * env * 0.1;
        }
        break;
      case 'chirp':
        for (var i = 0; i < nSamples; i++) {
          var t = i / sr;
          var freq = 200 + 2000 * (t / duration);
          cleanSignal[i] = 0.35 * Math.sin(2 * Math.PI * freq * t);
        }
        break;
    }
  }

  function generateNoise() {
    noiseRef = new Float64Array(nSamples);
    var noiseActual = new Float64Array(nSamples);

    switch (state.noiseType) {
      case 'correlated':
        // Noise reference is correlated with actual noise via a transfer function
        // Generate base noise
        var baseNoise = new Float64Array(nSamples);
        for (var i = 0; i < nSamples; i++) {
          baseNoise[i] = (Math.random() - 0.5) * 2;
        }
        // Reference = base noise
        for (var i = 0; i < nSamples; i++) {
          noiseRef[i] = baseNoise[i];
        }
        // Actual noise = filtered version of base noise (FIR filter)
        var hNoise = [0.8, -0.3, 0.5, -0.2, 0.15, -0.1, 0.05, 0.08];
        for (var n = 0; n < nSamples; n++) {
          var sum = 0;
          for (var k = 0; k < hNoise.length; k++) {
            if (n - k >= 0) sum += hNoise[k] * baseNoise[n - k];
          }
          noiseActual[n] = sum;
        }
        break;

      case 'narrowband':
        // Narrowband interference at specific frequency
        var interfFreq = 1000;
        var baseNoise2 = new Float64Array(nSamples);
        for (var i = 0; i < nSamples; i++) {
          baseNoise2[i] = Math.sin(2 * Math.PI * interfFreq * i / sr)
                        + 0.3 * Math.sin(2 * Math.PI * interfFreq * 2 * i / sr)
                        + 0.2 * (Math.random() - 0.5);
        }
        for (var i = 0; i < nSamples; i++) {
          noiseRef[i] = baseNoise2[i];
        }
        // Actual noise = phase-shifted + scaled version
        for (var i = 0; i < nSamples; i++) {
          noiseActual[i] = 0.7 * Math.sin(2 * Math.PI * interfFreq * i / sr + 0.5)
                         + 0.2 * Math.sin(2 * Math.PI * interfFreq * 2 * i / sr + 0.3)
                         + 0.1 * (Math.random() - 0.5);
        }
        break;

      case 'broadband':
        // Broadband noise, harder to cancel
        var baseNoise3 = new Float64Array(nSamples);
        for (var i = 0; i < nSamples; i++) {
          baseNoise3[i] = (Math.random() - 0.5) * 2;
        }
        for (var i = 0; i < nSamples; i++) {
          noiseRef[i] = baseNoise3[i];
        }
        // Longer FIR path = harder to cancel
        var hLong = [0.5, 0.3, -0.4, 0.25, -0.15, 0.1, -0.2, 0.15, -0.1, 0.05,
                     0.08, -0.06, 0.04, -0.03, 0.02, -0.01];
        for (var n = 0; n < nSamples; n++) {
          var sum = 0;
          for (var k = 0; k < hLong.length; k++) {
            if (n - k >= 0) sum += hLong[k] * baseNoise3[n - k];
          }
          noiseActual[n] = sum;
        }
        break;
    }

    // Scale noise to desired SNR
    var signalPower = 0, noisePower = 0;
    for (var i = 0; i < nSamples; i++) {
      signalPower += cleanSignal[i] * cleanSignal[i];
      noisePower += noiseActual[i] * noiseActual[i];
    }
    signalPower /= nSamples;
    noisePower /= nSamples;

    var desiredNoisePower = signalPower / Math.pow(10, state.snr / 10);
    var scale = Math.sqrt(desiredNoisePower / (noisePower + 1e-10));

    noisySignal = new Float64Array(nSamples);
    for (var i = 0; i < nSamples; i++) {
      noiseActual[i] *= scale;
      noiseRef[i] *= scale;
      noisySignal[i] = cleanSignal[i] + noiseActual[i];
    }
  }

  // ─── LMS Algorithm ───

  function runLMS() {
    var M = state.order;
    var mu = state.mu;
    coefficients = new Float64Array(M);
    filteredSignal = new Float64Array(nSamples);
    errorSignal = new Float64Array(nSamples);

    // Track coefficient history for visualization
    var historyInterval = Math.max(1, Math.floor(nSamples / 200));
    coeffHistory = [];
    learningCurve = [];

    var mseWindow = 0;
    var mseCount = 0;
    var mseInterval = Math.max(1, Math.floor(nSamples / 400));

    for (var n = 0; n < nSamples; n++) {
      // Form input vector from noise reference
      var yHat = 0;
      for (var k = 0; k < M; k++) {
        if (n - k >= 0) yHat += coefficients[k] * noiseRef[n - k];
      }

      // Error = noisy signal - estimated noise
      var e = noisySignal[n] - yHat;
      errorSignal[n] = e;
      filteredSignal[n] = Math.max(-1, Math.min(1, e));

      // Update coefficients
      for (var k = 0; k < M; k++) {
        if (n - k >= 0) {
          coefficients[k] += 2 * mu * e * noiseRef[n - k];
        }
      }

      // Clamp coefficients to prevent blowup
      for (var k = 0; k < M; k++) {
        coefficients[k] = Math.max(-10, Math.min(10, coefficients[k]));
      }

      // Record history
      if (n % historyInterval === 0) {
        var snap = new Float64Array(M);
        for (var k = 0; k < M; k++) snap[k] = coefficients[k];
        coeffHistory.push(snap);
      }

      // Learning curve (running MSE)
      mseWindow += e * e;
      mseCount++;
      if (mseCount >= mseInterval) {
        learningCurve.push(mseWindow / mseCount);
        mseWindow = 0;
        mseCount = 0;
      }
    }
  }

  function runAdaptive() {
    generateCleanSignal();
    generateNoise();
    runLMS();
    render();
  }

  // ─── Rendering ───

  function render() {
    if (!ctx || !noisySignal) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var rowH = (HEIGHT - 30) / 4;

    // === Row 1: Noisy vs Original Signal ===
    drawRow(0, 'NOISY INPUT (cyan) vs ORIGINAL (dim)', function (x0, y0, w, h) {
      var mid = y0 + h / 2;
      drawZeroLine(x0, mid, w);

      var maxAbs = getMax(noisySignal);
      maxAbs = Math.max(maxAbs, getMax(cleanSignal));

      // Original (dim)
      drawWaveform(cleanSignal, x0, mid, w, h * 0.4, maxAbs, c.textDim, 1, 0.3);
      // Noisy
      drawWaveform(noisySignal, x0, mid, w, h * 0.4, maxAbs, c.dsp, 1.5, 0.7);
    });

    // === Row 2: Filtered (cleaned) output ===
    drawRow(1, 'ADAPTIVE OUTPUT (orange) vs ORIGINAL (dim)', function (x0, y0, w, h) {
      var mid = y0 + h / 2;
      drawZeroLine(x0, mid, w);

      var maxAbs = getMax(filteredSignal);
      maxAbs = Math.max(maxAbs, getMax(cleanSignal));

      // Original (dim)
      drawWaveform(cleanSignal, x0, mid, w, h * 0.4, maxAbs, c.textDim, 1, 0.3);
      // Filtered
      drawWaveform(filteredSignal, x0, mid, w, h * 0.4, maxAbs, c.ai, 2, 0.9);

      // SNR improvement
      var snrBefore = computeSNR(cleanSignal, noisySignal);
      var snrAfter = computeSNR(cleanSignal, filteredSignal);
      ctx.fillStyle = c.ai;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('SNR: ' + snrBefore.toFixed(1) + ' dB \u2192 ' + snrAfter.toFixed(1) + ' dB  (\u0394' + (snrAfter - snrBefore).toFixed(1) + ' dB)', x0 + w, y0 + 10);
    });

    // === Row 3: Coefficient Evolution ===
    drawRow(2, 'FILTER COEFFICIENTS OVER TIME', function (x0, y0, w, h) {
      if (!coeffHistory || coeffHistory.length === 0) return;
      var M = state.order;

      // Draw coefficient evolution as heatmap
      var cellW = w / coeffHistory.length;
      var cellH = h / M;

      // Find max absolute coefficient
      var maxCoeff = 0.01;
      for (var t = 0; t < coeffHistory.length; t++) {
        for (var k = 0; k < M; k++) {
          maxCoeff = Math.max(maxCoeff, Math.abs(coeffHistory[t][k]));
        }
      }

      for (var t = 0; t < coeffHistory.length; t++) {
        for (var k = 0; k < M; k++) {
          var val = coeffHistory[t][k] / maxCoeff;
          var color = coeffColor(val);
          ctx.fillStyle = color;
          ctx.fillRect(x0 + t * cellW, y0 + k * cellH, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
        }
      }

      // Tap labels
      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      if (M <= 32) {
        var labelStep = M <= 16 ? 1 : 2;
        for (var k = 0; k < M; k += labelStep) {
          ctx.fillText('w' + k, x0 - 4, y0 + k * cellH + cellH * 0.7);
        }
      }

      // Time labels
      ctx.textAlign = 'center';
      ctx.fillText('t=0', x0, y0 + h + 10);
      ctx.fillText('t=' + duration.toFixed(1) + 's', x0 + w, y0 + h + 10);
    });

    // === Row 4: Learning Curve ===
    drawRow(3, 'LEARNING CURVE (MSE)', function (x0, y0, w, h) {
      if (!learningCurve || learningCurve.length === 0) return;

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x0, y0, w, h);

      var maxMSE = 0.001;
      for (var i = 0; i < learningCurve.length; i++) {
        maxMSE = Math.max(maxMSE, learningCurve[i]);
      }

      // Use log scale
      var logMax = Math.log10(maxMSE + 1e-10);
      var logMin = Math.log10(Math.max(1e-6, learningCurve[learningCurve.length - 1] * 0.1));

      ctx.beginPath();
      ctx.strokeStyle = c.math;
      ctx.lineWidth = 2;
      for (var i = 0; i < learningCurve.length; i++) {
        var px = x0 + (i / (learningCurve.length - 1)) * w;
        var logVal = Math.log10(learningCurve[i] + 1e-10);
        var norm = (logVal - logMin) / (logMax - logMin + 1e-10);
        norm = Math.max(0, Math.min(1, norm));
        var py = y0 + h - norm * h;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Fill under curve
      ctx.lineTo(x0 + w, y0 + h);
      ctx.lineTo(x0, y0 + h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(74,222,128,0.08)';
      ctx.fill();

      // Axis labels
      ctx.fillStyle = c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(maxMSE.toExponential(1), x0 + 4, y0 + 10);
      ctx.fillText(learningCurve[learningCurve.length - 1].toExponential(1), x0 + 4, y0 + h - 4);

      // Convergence status
      var finalMSE = learningCurve[learningCurve.length - 1];
      var midMSE = learningCurve[Math.floor(learningCurve.length / 2)];
      var diverged = finalMSE > midMSE * 2;
      ctx.textAlign = 'right';
      ctx.font = '10px "JetBrains Mono", monospace';
      if (diverged) {
        ctx.fillStyle = '#fb7185';
        ctx.fillText('DIVERGED \u2014 reduce \u03BC!', x0 + w - 4, y0 + 12);
      } else {
        ctx.fillStyle = c.math;
        ctx.fillText('CONVERGED \u2014 final MSE: ' + finalMSE.toExponential(2), x0 + w - 4, y0 + 12);
      }
    });

    // Mu info
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('\u03BC=' + state.mu.toFixed(4) + ' | order=' + state.order + ' | ' + state.noiseType, WIDTH - PAD.right, HEIGHT - 4);
  }

  // ─── Drawing Helpers ───

  function drawRow(index, label, drawFn) {
    var c = Plot.getColors();
    var plotW = WIDTH - PAD.left - PAD.right;
    var rowH = (HEIGHT - 30) / 4;
    var y0 = PAD.top + index * rowH;

    // Separator
    if (index > 0) {
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y0 - 2);
      ctx.lineTo(WIDTH - PAD.right, y0 - 2);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, PAD.left, y0 + 10);

    drawFn(PAD.left, y0 + 14, plotW, rowH - 20);
  }

  function drawZeroLine(x, y, w) {
    var c = Plot.getColors();
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawWaveform(signal, x0, mid, w, halfH, maxAbs, color, lineW, alpha) {
    if (!signal) return;
    var showSamples = Math.min(1200, signal.length);
    var step = Math.floor(signal.length / showSamples);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.globalAlpha = alpha;
    for (var i = 0; i < showSamples; i++) {
      var idx = i * step;
      var px = x0 + (i / showSamples) * w;
      var py = mid - (signal[idx] / (maxAbs * 1.1)) * halfH;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function getMax(signal) {
    if (!signal) return 0.01;
    var m = 0.01;
    for (var i = 0; i < signal.length; i++) m = Math.max(m, Math.abs(signal[i]));
    return m;
  }

  function computeSNR(clean, noisy) {
    var signalPower = 0, noisePower = 0;
    for (var i = 0; i < clean.length; i++) {
      signalPower += clean[i] * clean[i];
      var err = noisy[i] - clean[i];
      noisePower += err * err;
    }
    if (noisePower < 1e-10) return 60;
    return 10 * Math.log10(signalPower / noisePower);
  }

  function coeffColor(val) {
    // Blue (negative) -> dark -> Red/orange (positive)
    val = Math.max(-1, Math.min(1, val));
    if (val >= 0) {
      var r = Math.floor(50 + 200 * val);
      var g = Math.floor(30 + 120 * val);
      var b = Math.floor(20 + 30 * val);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    } else {
      var v = -val;
      var r = Math.floor(20 + 30 * v);
      var g = Math.floor(40 + 80 * v);
      var b = Math.floor(60 + 195 * v);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
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
