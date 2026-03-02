/* ============================================================
   Tool 4.2 — Real-Time Spectrum Analyzer
   Microphone input via Web Audio API or generated signal,
   dual waveform + spectrum display. Whistle/hum/speak and
   see your voice decomposed into frequencies.
   Depends on: plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.SpectrumAnalyzer = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 400;
  var PAD = { top: 8, right: 20, bottom: 30, left: 55 };

  var audioCtx = null;
  var analyser = null;
  var micStream = null;
  var micSource = null;
  var oscNode = null;
  var oscGain = null;
  var animFrame = null;
  var isRunning = false;
  var useMic = false;

  var fftSize = 2048;
  var timeData = null;
  var freqData = null;

  var state = {
    source: 'tone',  // 'mic' | 'tone'
    toneFreq: 440,
    toneType: 'sine',
    logScale: false
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Real-time spectrum analyzer showing waveform and frequency spectrum');
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
      HEIGHT = Math.max(360, Math.min(440, WIDTH * 0.5));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      if (!isRunning) renderStatic();
    }
    window.addEventListener('resize', resize);

    // Controls
    bindSelect(containerEl, 'spectrum-source', function (v) {
      state.source = v;
      if (isRunning) {
        stopAnalyzer();
        startAnalyzer();
      }
    });

    bindSlider(containerEl, 'tone-freq', function (v) {
      state.toneFreq = parseFloat(v);
      if (oscNode) {
        oscNode.frequency.setValueAtTime(state.toneFreq, audioCtx.currentTime);
      }
    });

    bindSelect(containerEl, 'tone-type', function (v) {
      state.toneType = v;
      if (oscNode) {
        oscNode.type = v;
      }
    });

    var logToggle = containerEl.querySelector('[data-control="log-scale"]');
    if (logToggle) {
      logToggle.addEventListener('change', function () {
        state.logScale = this.checked;
      });
    }

    // Start/Stop
    var startBtn = containerEl.querySelector('[data-action="start-analyzer"]');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        if (isRunning) {
          stopAnalyzer();
          startBtn.textContent = '\u25B6 Start';
        } else {
          startAnalyzer();
          startBtn.textContent = '\u23F9 Stop';
        }
      });
    }

    resize();
  }

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.8;
    timeData = new Uint8Array(analyser.fftSize);
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }

  function startAnalyzer() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (state.source === 'mic') {
      startMic();
    } else {
      startTone();
    }

    isRunning = true;
    animate();
  }

  function stopAnalyzer() {
    isRunning = false;
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    stopMic();
    stopTone();
    renderStatic();
  }

  function startMic() {
    stopTone();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          micStream = stream;
          micSource = audioCtx.createMediaStreamSource(stream);
          micSource.connect(analyser);
          useMic = true;
        })
        .catch(function () {
          // Fallback to tone if mic denied
          state.source = 'tone';
          var sel = containerEl.querySelector('[data-control="spectrum-source"]');
          if (sel) sel.value = 'tone';
          startTone();
        });
    } else {
      state.source = 'tone';
      startTone();
    }
  }

  function stopMic() {
    if (micSource) {
      micSource.disconnect();
      micSource = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(function (t) { t.stop(); });
      micStream = null;
    }
    useMic = false;
  }

  function startTone() {
    stopMic();
    if (oscNode) stopTone();
    oscNode = audioCtx.createOscillator();
    oscGain = audioCtx.createGain();
    oscNode.type = state.toneType;
    oscNode.frequency.setValueAtTime(state.toneFreq, audioCtx.currentTime);
    oscGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    oscNode.connect(oscGain);
    oscGain.connect(analyser);
    oscGain.connect(audioCtx.destination);
    oscNode.start();
  }

  function stopTone() {
    if (oscNode) {
      try { oscNode.stop(); } catch (e) { /* ignore */ }
      oscNode.disconnect();
      oscNode = null;
    }
    if (oscGain) {
      oscGain.disconnect();
      oscGain = null;
    }
  }

  function animate() {
    if (!isRunning) return;
    animFrame = requestAnimationFrame(animate);
    renderLive();
  }

  function renderLive() {
    if (!ctx || !analyser) return;
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var halfH = (HEIGHT - PAD.bottom - PAD.top - 20) / 2;

    // === Waveform (top half) ===
    var waveY = PAD.top;
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WAVEFORM (time domain)', PAD.left, waveY + 10);

    if (state.source === 'mic') {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f87171';
      ctx.fillText('\u25CF LIVE MIC', WIDTH - PAD.right, waveY + 10);
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = c.dsp;
      ctx.fillText(state.toneType + ' @ ' + state.toneFreq + ' Hz', WIDTH - PAD.right, waveY + 10);
    }

    var waveMid = waveY + 14 + halfH / 2;

    // Zero line
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, waveMid);
    ctx.lineTo(WIDTH - PAD.right, waveMid);
    ctx.stroke();
    ctx.setLineDash([]);

    // Waveform
    ctx.beginPath();
    ctx.strokeStyle = c.dsp;
    ctx.lineWidth = 2;
    var sliceWidth = plotW / timeData.length;
    for (var i = 0; i < timeData.length; i++) {
      var v = (timeData[i] - 128) / 128.0;
      var px = PAD.left + i * sliceWidth;
      var py = waveMid - v * (halfH * 0.45);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // === Separator ===
    var sepY = waveY + halfH + 18;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, sepY);
    ctx.lineTo(WIDTH - PAD.right, sepY);
    ctx.stroke();

    // === Spectrum (bottom half) ===
    var specTop = sepY + 4;
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SPECTRUM (frequency domain)', PAD.left, specTop + 10);

    var specMid = specTop + 14;
    var specH = halfH - 14;
    var specBottom = specMid + specH;

    // Frequency axis
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, specBottom);
    ctx.lineTo(WIDTH - PAD.right, specBottom);
    ctx.stroke();

    // Frequency labels
    var sr = audioCtx ? audioCtx.sampleRate : 44100;
    var nyquist = sr / 2;
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    var freqLabels = [0, 500, 1000, 2000, 4000, 8000, 16000, nyquist];
    for (var fi = 0; fi < freqLabels.length; fi++) {
      var f = freqLabels[fi];
      if (f > nyquist) continue;
      var fx;
      if (state.logScale && f > 0) {
        fx = PAD.left + (Math.log10(f) / Math.log10(nyquist)) * plotW;
      } else {
        fx = PAD.left + (f / nyquist) * plotW;
      }
      ctx.beginPath();
      ctx.moveTo(fx, specBottom);
      ctx.lineTo(fx, specBottom + 4);
      ctx.strokeStyle = c.border;
      ctx.stroke();
      var label = f >= 1000 ? (f / 1000) + 'k' : f + '';
      ctx.fillText(label, fx, specBottom + 14);
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (Hz)', WIDTH / 2, HEIGHT - 2);

    // Draw spectrum bars
    var binCount = freqData.length;
    var barW = Math.max(1, plotW / binCount);

    // Gradient fill
    ctx.beginPath();
    ctx.moveTo(PAD.left, specBottom);
    for (var i = 0; i < binCount; i++) {
      var norm = freqData[i] / 255.0;
      var binFreq = (i / binCount) * nyquist;
      var bx;
      if (state.logScale && binFreq > 1) {
        bx = PAD.left + (Math.log10(binFreq) / Math.log10(nyquist)) * plotW;
      } else {
        bx = PAD.left + (i / binCount) * plotW;
      }
      var by = specBottom - norm * specH;
      if (i === 0) ctx.moveTo(bx, by);
      else ctx.lineTo(bx, by);
    }
    ctx.lineTo(WIDTH - PAD.right, specBottom);
    ctx.closePath();

    // Fill with gradient
    var gradient = ctx.createLinearGradient(0, specMid, 0, specBottom);
    gradient.addColorStop(0, 'rgba(74,222,128,0.6)');
    gradient.addColorStop(0.5, 'rgba(34,211,238,0.4)');
    gradient.addColorStop(1, 'rgba(34,211,238,0.05)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Spectrum line
    ctx.beginPath();
    ctx.strokeStyle = c.math;
    ctx.lineWidth = 1.5;
    for (var i = 0; i < binCount; i++) {
      var norm = freqData[i] / 255.0;
      var binFreq = (i / binCount) * nyquist;
      var bx;
      if (state.logScale && binFreq > 1) {
        bx = PAD.left + (Math.log10(binFreq) / Math.log10(nyquist)) * plotW;
      } else {
        bx = PAD.left + (i / binCount) * plotW;
      }
      var by = specBottom - norm * specH;
      if (i === 0) ctx.moveTo(bx, by);
      else ctx.lineTo(bx, by);
    }
    ctx.stroke();

    // Find dominant frequency
    var maxBin = 0;
    var maxVal = 0;
    for (var i = 1; i < binCount; i++) {
      if (freqData[i] > maxVal) {
        maxVal = freqData[i];
        maxBin = i;
      }
    }
    if (maxVal > 20) {
      var domFreq = (maxBin / binCount) * nyquist;
      ctx.fillStyle = c.math;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('Peak: ' + Math.round(domFreq) + ' Hz', WIDTH - PAD.right, specTop + 10);
    }
  }

  function renderStatic() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    ctx.fillStyle = c.textDim;
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press Start to begin analyzing', WIDTH / 2, HEIGHT / 2 - 10);
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('Select "Microphone" to analyze your voice, or use a generated tone', WIDTH / 2, HEIGHT / 2 + 14);
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
