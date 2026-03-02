/* ============================================================
   Tool 7.2 — Audio Filter Playground
   Generate or load audio, apply FIR/IIR filters, hear
   before/after, see waveform + spectral comparison.
   Depends on: plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.AudioFilter = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 400;
  var PAD = { top: 8, right: 20, bottom: 8, left: 50 };

  var sr = 8000;
  var duration = 2.0;
  var nSamples;
  var originalSignal = null;
  var filteredSignal = null;

  var state = {
    signalType: 'mixed',     // mixed | speech-like | noise | chirp
    filterMode: 'lowpass',   // lowpass | highpass | bandpass
    cutoff: 0.25,
    method: 'fir',           // fir | iir
    order: 21
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Audio filter playground with original and filtered signal comparison');
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
      HEIGHT = Math.max(360, Math.min(440, WIDTH * 0.5));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Controls
    bindSelect(containerEl, 'audio-signal', function (v) {
      state.signalType = v;
      generateSignal();
      applyFilter();
      render();
    });
    bindSelect(containerEl, 'audio-filter-mode', function (v) {
      state.filterMode = v;
      applyFilter();
      render();
    });
    bindSlider(containerEl, 'audio-cutoff', function (v) {
      state.cutoff = parseFloat(v);
      applyFilter();
      render();
    });
    bindSelect(containerEl, 'audio-method', function (v) {
      state.method = v;
      applyFilter();
      render();
    });
    bindSlider(containerEl, 'audio-order', function (v) {
      state.order = parseInt(v, 10) | 1;
      applyFilter();
      render();
    });

    // Play buttons
    var playOrig = containerEl.querySelector('[data-action="play-original"]');
    if (playOrig) playOrig.addEventListener('click', function () {
      Audio.stop();
      if (originalSignal) Audio.playSamples(originalSignal, sr);
    });
    var playFilt = containerEl.querySelector('[data-action="play-filtered"]');
    if (playFilt) playFilt.addEventListener('click', function () {
      Audio.stop();
      if (filteredSignal) Audio.playSamples(filteredSignal, sr);
    });
    var stopBtn = containerEl.querySelector('[data-action="stop-audio-filter"]');
    if (stopBtn) stopBtn.addEventListener('click', function () { Audio.stop(); });

    generateSignal();
    applyFilter();
    resize();
  }

  function generateSignal() {
    originalSignal = new Float64Array(nSamples);

    switch (state.signalType) {
      case 'mixed':
        // Mix of several frequencies + noise
        var freqs = [200, 440, 800, 1500, 3000];
        for (var f = 0; f < freqs.length; f++) {
          for (var i = 0; i < nSamples; i++) {
            originalSignal[i] += 0.15 * Math.sin(2 * Math.PI * freqs[f] * i / sr);
          }
        }
        for (var i = 0; i < nSamples; i++) {
          originalSignal[i] += 0.08 * (Math.random() - 0.5);
        }
        break;

      case 'speech-like':
        // Simulate formant-like structure
        for (var i = 0; i < nSamples; i++) {
          var t = i / sr;
          var glottal = 0;
          for (var h = 1; h <= 15; h++) {
            glottal += (1 / h) * Math.sin(2 * Math.PI * 150 * h * t);
          }
          // Amplitude envelope (syllable-like)
          var env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
          originalSignal[i] = glottal * env * 0.12;
        }
        break;

      case 'noise':
        for (var i = 0; i < nSamples; i++) {
          originalSignal[i] = 0.5 * (Math.random() - 0.5);
        }
        break;

      case 'chirp':
        for (var i = 0; i < nSamples; i++) {
          var t = i / sr;
          var freq = 100 + (3500 - 100) * (t / duration);
          originalSignal[i] = 0.4 * Math.sin(2 * Math.PI * freq * t);
        }
        break;
    }
  }

  function applyFilter() {
    if (!originalSignal) return;
    var b, a;

    // Design filter
    var M = state.order;
    var fc = state.cutoff;
    var omega_c = fc * 2;

    if (state.method === 'fir') {
      // Windowed sinc
      b = new Float64Array(M);
      a = [1];
      var center = (M - 1) / 2;
      for (var n = 0; n < M; n++) {
        var nm = n - center;
        if (Math.abs(nm) < 1e-10) {
          b[n] = omega_c;
        } else {
          b[n] = Math.sin(Math.PI * omega_c * nm) / (Math.PI * nm);
        }
        // Hamming window
        b[n] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (M - 1));
      }

      if (state.filterMode === 'highpass') {
        for (var n = 0; n < M; n++) b[n] = -b[n];
        b[Math.floor(center)] += 1;
      }

      // Normalize
      var sum = 0;
      for (var n = 0; n < M; n++) sum += b[n];
      if (state.filterMode === 'lowpass' && Math.abs(sum) > 1e-10) {
        for (var n = 0; n < M; n++) b[n] /= sum;
      }
    } else {
      // Simple IIR: first-order recursive
      // y[n] = (1-alpha)*x[n] + alpha*y[n-1]
      var alpha = Math.exp(-2 * Math.PI * fc);
      if (state.filterMode === 'lowpass') {
        b = [1 - alpha];
        a = [1, -alpha];
      } else {
        // Highpass: subtract lowpass from original
        b = [(1 + alpha) / 2, -(1 + alpha) / 2];
        a = [1, -alpha];
      }
    }

    // Apply filter
    filteredSignal = new Float64Array(nSamples);
    var y = new Float64Array(nSamples);
    for (var n = 0; n < nSamples; n++) {
      var sum = 0;
      for (var k = 0; k < b.length; k++) {
        if (n - k >= 0) sum += b[k] * originalSignal[n - k];
      }
      for (var k = 1; k < a.length; k++) {
        if (n - k >= 0) sum -= a[k] * y[n - k];
      }
      y[n] = sum;
      filteredSignal[n] = Math.max(-1, Math.min(1, sum));
    }
  }

  function computeSimpleSpectrum(signal, nBins) {
    // Simple magnitude spectrum via DFT on first chunk
    var N = Math.min(512, signal.length);
    var spec = new Float64Array(nBins);
    for (var k = 0; k < nBins; k++) {
      var freq = k / nBins * Math.PI;
      var sumR = 0, sumI = 0;
      for (var n = 0; n < N; n++) {
        sumR += signal[n] * Math.cos(freq * n);
        sumI -= signal[n] * Math.sin(freq * n);
      }
      spec[k] = Math.sqrt(sumR * sumR + sumI * sumI) / N;
    }
    return spec;
  }

  function render() {
    if (!ctx || !originalSignal) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var halfH = (HEIGHT - 20) / 2;

    // === Top: Waveform comparison ===
    var waveY = PAD.top;
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WAVEFORM: Original (cyan) vs Filtered (orange)', PAD.left, waveY + 10);

    ctx.textAlign = 'right';
    ctx.fillText(state.method.toUpperCase() + ' ' + state.filterMode + ' | fc=' + (state.cutoff * 100).toFixed(0) + '%', WIDTH - PAD.right, waveY + 10);

    var waveMid = waveY + 14 + (halfH - 20) / 2;

    // Zero line
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, waveMid);
    ctx.lineTo(WIDTH - PAD.right, waveMid);
    ctx.stroke();
    ctx.setLineDash([]);

    var maxAbs = 0.01;
    for (var i = 0; i < originalSignal.length; i++) maxAbs = Math.max(maxAbs, Math.abs(originalSignal[i]));
    if (filteredSignal) for (var i = 0; i < filteredSignal.length; i++) maxAbs = Math.max(maxAbs, Math.abs(filteredSignal[i]));
    var yR = maxAbs * 1.1;

    // Draw a subset for performance
    var showSamples = Math.min(1000, originalSignal.length);
    var step = Math.floor(originalSignal.length / showSamples);

    // Original
    ctx.beginPath();
    ctx.strokeStyle = c.dsp;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    for (var i = 0; i < showSamples; i++) {
      var idx = i * step;
      var px = PAD.left + (i / showSamples) * plotW;
      var py = waveMid - (originalSignal[idx] / yR) * (halfH * 0.35);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Filtered
    if (filteredSignal) {
      ctx.beginPath();
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      for (var i = 0; i < showSamples; i++) {
        var idx = i * step;
        var px = PAD.left + (i / showSamples) * plotW;
        var py = waveMid - (filteredSignal[idx] / yR) * (halfH * 0.35);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // === Bottom: Spectrum comparison ===
    var specY = PAD.top + halfH + 10;

    // Separator
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, specY - 5);
    ctx.lineTo(WIDTH - PAD.right, specY - 5);
    ctx.stroke();

    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SPECTRUM: Original (cyan) vs Filtered (orange)', PAD.left, specY + 10);

    var nBins = 128;
    var origSpec = computeSimpleSpectrum(originalSignal, nBins);
    var filtSpec = filteredSignal ? computeSimpleSpectrum(filteredSignal, nBins) : null;

    var maxSpec = 0.01;
    for (var i = 0; i < nBins; i++) {
      maxSpec = Math.max(maxSpec, origSpec[i]);
      if (filtSpec) maxSpec = Math.max(maxSpec, filtSpec[i]);
    }

    var specTop = specY + 16;
    var specH = halfH - 30;
    var specBottom = specTop + specH;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(PAD.left, specTop, plotW, specH);

    // Draw original spectrum
    ctx.beginPath();
    ctx.strokeStyle = c.dsp;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    for (var i = 0; i < nBins; i++) {
      var px = PAD.left + (i / nBins) * plotW;
      var py = specBottom - (origSpec[i] / maxSpec) * specH;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw filtered spectrum
    if (filtSpec) {
      ctx.beginPath();
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      for (var i = 0; i < nBins; i++) {
        var px = PAD.left + (i / nBins) * plotW;
        var py = specBottom - (filtSpec[i] / maxSpec) * specH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Fill under filtered
      ctx.lineTo(PAD.left + plotW, specBottom);
      ctx.lineTo(PAD.left, specBottom);
      ctx.closePath();
      ctx.fillStyle = 'rgba(251,146,60,0.08)';
      ctx.fill();
    }

    // Cutoff line
    var cutoffX = PAD.left + state.cutoff * 2 * plotW;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cutoffX, specTop);
    ctx.lineTo(cutoffX, specBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('fc', cutoffX, specBottom + 10);

    // Frequency axis
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', PAD.left, specBottom + 10);
    ctx.fillText((sr / 4) + ' Hz', PAD.left + plotW * 0.5, specBottom + 10);
    ctx.fillText((sr / 2) + ' Hz', PAD.left + plotW, specBottom + 10);
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
