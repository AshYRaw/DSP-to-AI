/* ============================================================
   Tool 8.2 — Filter Bank Decomposer
   Decompose a signal into N frequency bands, toggle bands on/off,
   reconstruct from selected bands. Mel scale option.
   Depends on: plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.FilterBank = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 480;
  var PAD = { top: 8, right: 20, bottom: 8, left: 55 };

  var sr = 8000;
  var duration = 2.0;
  var nSamples;

  var originalSignal = null;
  var bandSignals = [];       // array of Float64Array, one per band
  var reconstructed = null;

  var state = {
    signalType: 'rich',       // rich | speech-like | chirp | noise
    nBands: 8,
    scaleType: 'linear',      // linear | mel
    activeBands: [],           // boolean array — which bands are active
    hoveredBand: -1
  };

  var containerEl;
  var bandToggles = null;      // DOM element container for band buttons

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Filter bank analyzer showing sub-band decomposition');
    canvas.setAttribute('tabindex', '0');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      containerEl.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    bandToggles = containerEl.querySelector('.band-toggles');

    nSamples = Math.floor(sr * duration);

    // Initialize active bands
    for (var i = 0; i < state.nBands; i++) state.activeBands.push(true);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(440, Math.min(520, WIDTH * 0.6));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Controls
    bindSelect(containerEl, 'bank-signal', function (v) {
      state.signalType = v;
      runBank();
    });
    bindSlider(containerEl, 'bank-nbands', function (v) {
      state.nBands = parseInt(v, 10);
      resetActiveBands();
      runBank();
    });
    bindSelect(containerEl, 'bank-scale', function (v) {
      state.scaleType = v;
      runBank();
    });

    // All/None buttons
    var allBtn = containerEl.querySelector('[data-action="bank-all"]');
    if (allBtn) allBtn.addEventListener('click', function () {
      for (var i = 0; i < state.nBands; i++) state.activeBands[i] = true;
      updateBandButtons();
      reconstruct();
      render();
    });
    var noneBtn = containerEl.querySelector('[data-action="bank-none"]');
    if (noneBtn) noneBtn.addEventListener('click', function () {
      for (var i = 0; i < state.nBands; i++) state.activeBands[i] = false;
      updateBandButtons();
      reconstruct();
      render();
    });

    // Play buttons
    var playOrig = containerEl.querySelector('[data-action="play-original-bank"]');
    if (playOrig) playOrig.addEventListener('click', function () {
      Audio.stop();
      if (originalSignal) Audio.playSamples(originalSignal, sr);
    });
    var playRecon = containerEl.querySelector('[data-action="play-reconstructed"]');
    if (playRecon) playRecon.addEventListener('click', function () {
      Audio.stop();
      if (reconstructed) Audio.playSamples(reconstructed, sr);
    });
    var stopBtn = containerEl.querySelector('[data-action="stop-bank"]');
    if (stopBtn) stopBtn.addEventListener('click', function () { Audio.stop(); });

    // Mouse hover on canvas
    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var plotW = WIDTH - PAD.left - PAD.right;
      var bandsTop = PAD.top + ((HEIGHT - 30) / 3) + 14;
      var bandsH = ((HEIGHT - 30) / 3) - 20;

      if (mx >= PAD.left && mx <= PAD.left + plotW && my >= bandsTop && my <= bandsTop + bandsH) {
        var bandH = bandsH / state.nBands;
        var idx = Math.floor((my - bandsTop) / bandH);
        idx = Math.max(0, Math.min(state.nBands - 1, idx));
        if (idx !== state.hoveredBand) {
          state.hoveredBand = idx;
          render();
        }
      } else if (state.hoveredBand !== -1) {
        state.hoveredBand = -1;
        render();
      }
    });

    canvas.addEventListener('click', function (e) {
      if (state.hoveredBand >= 0 && state.hoveredBand < state.nBands) {
        state.activeBands[state.hoveredBand] = !state.activeBands[state.hoveredBand];
        updateBandButtons();
        reconstruct();
        render();
      }
    });

    runBank();
    resize();
  }

  function resetActiveBands() {
    state.activeBands = [];
    for (var i = 0; i < state.nBands; i++) state.activeBands.push(true);
    state.hoveredBand = -1;
    updateBandButtons();
  }

  function updateBandButtons() {
    if (!bandToggles) return;
    bandToggles.innerHTML = '';
    var edges = getBandEdges();
    for (var i = 0; i < state.nBands; i++) {
      var btn = document.createElement('button');
      btn.className = 'band-btn' + (state.activeBands[i] ? ' active' : '');
      btn.style.borderColor = Plot.SIGNAL_COLORS[i % Plot.SIGNAL_COLORS.length];
      if (state.activeBands[i]) {
        btn.style.backgroundColor = Plot.SIGNAL_COLORS[i % Plot.SIGNAL_COLORS.length] + '30';
      }
      var lo = Math.round(edges[i]);
      var hi = Math.round(edges[i + 1]);
      btn.textContent = lo + '-' + hi + ' Hz';
      btn.dataset.band = i;
      btn.addEventListener('click', (function (idx) {
        return function () {
          state.activeBands[idx] = !state.activeBands[idx];
          updateBandButtons();
          reconstruct();
          render();
        };
      })(i));
      bandToggles.appendChild(btn);
    }
  }

  // ─── Signal Generation ───

  function generateSignal() {
    originalSignal = new Float64Array(nSamples);
    switch (state.signalType) {
      case 'rich':
        var freqs = [150, 300, 500, 800, 1200, 1800, 2500, 3200, 3800];
        for (var f = 0; f < freqs.length; f++) {
          var amp = 0.15 / (1 + f * 0.2);
          for (var i = 0; i < nSamples; i++) {
            originalSignal[i] += amp * Math.sin(2 * Math.PI * freqs[f] * i / sr);
          }
        }
        for (var i = 0; i < nSamples; i++) {
          originalSignal[i] += 0.04 * (Math.random() - 0.5);
        }
        break;
      case 'speech-like':
        for (var i = 0; i < nSamples; i++) {
          var t = i / sr;
          var glottal = 0;
          for (var h = 1; h <= 15; h++) {
            glottal += (1 / h) * Math.sin(2 * Math.PI * 150 * h * t);
          }
          var env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
          originalSignal[i] = glottal * env * 0.1;
        }
        break;
      case 'chirp':
        for (var i = 0; i < nSamples; i++) {
          var t = i / sr;
          var freq = 100 + 3700 * (t / duration);
          originalSignal[i] = 0.35 * Math.sin(2 * Math.PI * freq * t);
        }
        break;
      case 'noise':
        for (var i = 0; i < nSamples; i++) {
          originalSignal[i] = 0.4 * (Math.random() - 0.5);
        }
        break;
    }
  }

  // ─── Filter Bank ───

  function hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
  }

  function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  function getBandEdges() {
    var edges = [];
    var nyquist = sr / 2;
    var N = state.nBands;

    if (state.scaleType === 'linear') {
      for (var i = 0; i <= N; i++) {
        edges.push((i / N) * nyquist);
      }
    } else {
      // Mel scale
      var melMin = hzToMel(0);
      var melMax = hzToMel(nyquist);
      for (var i = 0; i <= N; i++) {
        var mel = melMin + (i / N) * (melMax - melMin);
        edges.push(melToHz(mel));
      }
    }
    return edges;
  }

  function designBandpassFIR(fLow, fHigh, M) {
    // Normalized frequencies
    var wLow = fLow / (sr / 2);
    var wHigh = fHigh / (sr / 2);
    wLow = Math.max(0, Math.min(1, wLow));
    wHigh = Math.max(0, Math.min(1, wHigh));

    var b = new Float64Array(M);
    var center = (M - 1) / 2;

    if (wLow <= 0.001) {
      // Lowpass
      for (var n = 0; n < M; n++) {
        var nm = n - center;
        if (Math.abs(nm) < 1e-10) {
          b[n] = wHigh;
        } else {
          b[n] = Math.sin(Math.PI * wHigh * nm) / (Math.PI * nm);
        }
        b[n] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (M - 1));
      }
    } else if (wHigh >= 0.999) {
      // Highpass
      for (var n = 0; n < M; n++) {
        var nm = n - center;
        if (Math.abs(nm) < 1e-10) {
          b[n] = 1 - wLow;
        } else {
          b[n] = -Math.sin(Math.PI * wLow * nm) / (Math.PI * nm);
        }
        b[n] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (M - 1));
      }
      // Spectral inversion
      b[Math.floor(center)] += 1;
      // Re-window
      for (var n = 0; n < M; n++) {
        b[n] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (M - 1));
      }
    } else {
      // Bandpass = lowpass(wHigh) - lowpass(wLow)
      var bHigh = new Float64Array(M);
      var bLow = new Float64Array(M);
      for (var n = 0; n < M; n++) {
        var nm = n - center;
        var win = 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (M - 1));
        if (Math.abs(nm) < 1e-10) {
          bHigh[n] = wHigh * win;
          bLow[n] = wLow * win;
        } else {
          bHigh[n] = (Math.sin(Math.PI * wHigh * nm) / (Math.PI * nm)) * win;
          bLow[n] = (Math.sin(Math.PI * wLow * nm) / (Math.PI * nm)) * win;
        }
        b[n] = bHigh[n] - bLow[n];
      }
    }
    return b;
  }

  function applyFIR(signal, b) {
    var N = signal.length;
    var M = b.length;
    var out = new Float64Array(N);
    for (var n = 0; n < N; n++) {
      var sum = 0;
      for (var k = 0; k < M; k++) {
        if (n - k >= 0) sum += b[k] * signal[n - k];
      }
      out[n] = sum;
    }
    return out;
  }

  function decompose() {
    var edges = getBandEdges();
    bandSignals = [];
    var filterOrder = 51;  // reasonable FIR order

    for (var i = 0; i < state.nBands; i++) {
      var b = designBandpassFIR(edges[i], edges[i + 1], filterOrder);
      bandSignals.push(applyFIR(originalSignal, b));
    }
  }

  function reconstruct() {
    reconstructed = new Float64Array(nSamples);
    for (var i = 0; i < state.nBands; i++) {
      if (state.activeBands[i] && bandSignals[i]) {
        for (var n = 0; n < nSamples; n++) {
          reconstructed[n] += bandSignals[i][n];
        }
      }
    }
  }

  function runBank() {
    generateSignal();
    decompose();
    resetActiveBands();
    reconstruct();
    render();
  }

  // ─── Rendering ───

  function render() {
    if (!ctx || !originalSignal) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var rowH = (HEIGHT - 30) / 3;

    // === Row 1: Original Signal ===
    var y0 = PAD.top;
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ORIGINAL SIGNAL', PAD.left, y0 + 10);

    var mid1 = y0 + 14 + (rowH - 20) / 2;
    drawZeroLine(PAD.left, mid1, plotW);
    var maxOrig = getMax(originalSignal);
    drawWaveform(originalSignal, PAD.left, mid1, plotW, (rowH - 20) * 0.4, maxOrig, c.dsp, 1.5, 0.8);

    // === Row 2: Band Decomposition ===
    var y1 = PAD.top + rowH;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y1 - 2);
    ctx.lineTo(WIDTH - PAD.right, y1 - 2);
    ctx.stroke();

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FILTER BANK DECOMPOSITION (' + state.nBands + ' bands, ' + state.scaleType + ' scale) — click to toggle', PAD.left, y1 + 10);

    var bandsTop = y1 + 14;
    var bandsH = rowH - 20;
    var bandH = bandsH / state.nBands;
    var edges = getBandEdges();

    for (var i = 0; i < state.nBands; i++) {
      var by = bandsTop + i * bandH;
      var color = Plot.SIGNAL_COLORS[i % Plot.SIGNAL_COLORS.length];

      // Highlight hovered band
      if (i === state.hoveredBand) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(PAD.left, by, plotW, bandH);
      }

      // Dim inactive bands
      var alpha = state.activeBands[i] ? 0.8 : 0.15;

      // Band waveform
      if (bandSignals[i]) {
        var bandMid = by + bandH / 2;
        var maxB = getMax(bandSignals[i]);
        maxB = Math.max(maxB, 0.01);
        var showSamples = Math.min(800, nSamples);
        var step = Math.floor(nSamples / showSamples);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha;
        for (var s = 0; s < showSamples; s++) {
          var idx = s * step;
          var px = PAD.left + (s / showSamples) * plotW;
          var py = bandMid - (bandSignals[i][idx] / (maxB * 1.2)) * (bandH * 0.4);
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Band label
      ctx.fillStyle = state.activeBands[i] ? color : c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      var lo = Math.round(edges[i]);
      var hi = Math.round(edges[i + 1]);
      ctx.fillText(lo + '-' + hi + 'Hz', PAD.left - 4, by + bandH / 2 + 3);

      // Muted indicator
      if (!state.activeBands[i]) {
        ctx.fillStyle = 'rgba(251,113,133,0.4)';
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('MUTED', PAD.left + 4, by + bandH / 2 + 3);
      }
    }

    // === Row 3: Reconstructed Signal ===
    var y2 = PAD.top + rowH * 2;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y2 - 2);
    ctx.lineTo(WIDTH - PAD.right, y2 - 2);
    ctx.stroke();

    var activeCt = 0;
    for (var i = 0; i < state.nBands; i++) if (state.activeBands[i]) activeCt++;
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('RECONSTRUCTED FROM ' + activeCt + '/' + state.nBands + ' BANDS (orange)', PAD.left, y2 + 10);

    var mid3 = y2 + 14 + (rowH - 20) / 2;
    drawZeroLine(PAD.left, mid3, plotW);

    // Show original dim
    drawWaveform(originalSignal, PAD.left, mid3, plotW, (rowH - 20) * 0.4, maxOrig, c.textDim, 1, 0.2);

    // Show reconstructed
    if (reconstructed) {
      var maxR = Math.max(getMax(reconstructed), maxOrig);
      drawWaveform(reconstructed, PAD.left, mid3, plotW, (rowH - 20) * 0.4, maxR, c.ai, 2, 0.9);
    }

    // Reconstruction error info
    if (reconstructed) {
      var errPower = 0, sigPower = 0;
      for (var i = 0; i < nSamples; i++) {
        sigPower += originalSignal[i] * originalSignal[i];
        var e = originalSignal[i] - reconstructed[i];
        errPower += e * e;
      }
      var reconSNR = sigPower > 0 ? 10 * Math.log10(sigPower / (errPower + 1e-10)) : 60;
      ctx.fillStyle = c.ai;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('Reconstruction SNR: ' + reconSNR.toFixed(1) + ' dB', WIDTH - PAD.right, y2 + 10);
    }
  }

  // ─── Drawing Helpers ───

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
