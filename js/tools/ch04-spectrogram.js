/* ============================================================
   Tool 4.3 — Spectrogram Viewer
   Scrolling spectrogram (time × frequency × intensity).
   Adjustable FFT size, window type, and overlap.
   Works with microphone or generated test signals.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.Spectrogram = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 360;
  var PAD = { top: 30, right: 60, bottom: 30, left: 55 };

  var audioCtx = null;
  var analyser = null;
  var micStream = null;
  var micSource = null;
  var oscNode = null;
  var oscGain = null;
  var animFrame = null;
  var isRunning = false;

  // Spectrogram image buffer: columns of frequency data scrolling left
  var spectroData = [];  // array of Uint8Array columns
  var maxCols = 300;

  var state = {
    source: 'chirp',  // 'mic' | 'chirp' | 'tone' | 'two-tone'
    fftSize: 1024,
    toneFreq: 440,
    toneFreq2: 880,
    colorMap: 'viridis'
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Scrolling spectrogram waterfall display');
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
      HEIGHT = Math.max(320, Math.min(400, WIDTH * 0.45));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      maxCols = Math.floor((WIDTH - PAD.left - PAD.right));
      if (!isRunning) renderStatic();
    }
    window.addEventListener('resize', resize);

    // Controls
    bindSelect(containerEl, 'spectro-source', function (v) {
      state.source = v;
      if (isRunning) {
        stopSpectrogram();
        spectroData = [];
        startSpectrogram();
      }
    });

    bindSelect(containerEl, 'fft-size', function (v) {
      state.fftSize = parseInt(v, 10);
      if (isRunning) {
        stopSpectrogram();
        spectroData = [];
        startSpectrogram();
      }
    });

    bindSlider(containerEl, 'spectro-freq', function (v) {
      state.toneFreq = parseFloat(v);
      if (oscNode) {
        oscNode.frequency.setValueAtTime(state.toneFreq, audioCtx.currentTime);
      }
    });

    // Start/Stop
    var startBtn = containerEl.querySelector('[data-action="start-spectro"]');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        if (isRunning) {
          stopSpectrogram();
          startBtn.textContent = '\u25B6 Start';
        } else {
          spectroData = [];
          startSpectrogram();
          startBtn.textContent = '\u23F9 Stop';
        }
      });
    }

    // Clear
    var clearBtn = containerEl.querySelector('[data-action="clear-spectro"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        spectroData = [];
      });
    }

    resize();
  }

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function setupAnalyser() {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = state.fftSize;
    analyser.smoothingTimeConstant = 0.6;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
  }

  function startSpectrogram() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    setupAnalyser();

    if (state.source === 'mic') {
      startMic();
    } else {
      startSignal();
    }

    isRunning = true;
    animate();
  }

  function stopSpectrogram() {
    isRunning = false;
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    stopMic();
    stopSignal();
  }

  function startMic() {
    stopSignal();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          micStream = stream;
          micSource = audioCtx.createMediaStreamSource(stream);
          micSource.connect(analyser);
        })
        .catch(function () {
          state.source = 'chirp';
          var sel = containerEl.querySelector('[data-control="spectro-source"]');
          if (sel) sel.value = 'chirp';
          startSignal();
        });
    } else {
      state.source = 'chirp';
      startSignal();
    }
  }

  function stopMic() {
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
  }

  function startSignal() {
    stopMic();
    if (oscNode) stopSignal();

    if (state.source === 'chirp') {
      // Create a chirp: sweep frequency over time
      var sr = audioCtx.sampleRate;
      var dur = 4.0;
      var bufLen = Math.floor(sr * dur);
      var buffer = audioCtx.createBuffer(1, bufLen, sr);
      var data = buffer.getChannelData(0);
      var f0 = 200, f1 = 4000;
      for (var i = 0; i < bufLen; i++) {
        var t = i / sr;
        var phase = t / dur;
        var freq = f0 + (f1 - f0) * phase;
        data[i] = 0.3 * Math.sin(2 * Math.PI * freq * t);
      }
      var src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(analyser);
      src.connect(audioCtx.destination);
      src.start();
      oscNode = src;
    } else if (state.source === 'two-tone') {
      // Two oscillators
      oscGain = audioCtx.createGain();
      oscGain.gain.setValueAtTime(0.2, audioCtx.currentTime);

      oscNode = audioCtx.createOscillator();
      oscNode.type = 'sine';
      oscNode.frequency.setValueAtTime(state.toneFreq, audioCtx.currentTime);
      oscNode.connect(oscGain);

      var osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(state.toneFreq2, audioCtx.currentTime);
      osc2.connect(oscGain);

      oscGain.connect(analyser);
      oscGain.connect(audioCtx.destination);
      oscNode.start();
      osc2.start();
      // Store second osc for cleanup
      oscNode._osc2 = osc2;
    } else {
      // Single tone
      oscNode = audioCtx.createOscillator();
      oscGain = audioCtx.createGain();
      oscNode.type = 'sine';
      oscNode.frequency.setValueAtTime(state.toneFreq, audioCtx.currentTime);
      oscGain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      oscNode.connect(oscGain);
      oscGain.connect(analyser);
      oscGain.connect(audioCtx.destination);
      oscNode.start();
    }
  }

  function stopSignal() {
    if (oscNode) {
      try {
        if (oscNode._osc2) { oscNode._osc2.stop(); oscNode._osc2.disconnect(); }
        oscNode.stop();
      } catch (e) { /* ignore */ }
      oscNode.disconnect();
      oscNode = null;
    }
    if (oscGain) { oscGain.disconnect(); oscGain = null; }
  }

  function animate() {
    if (!isRunning) return;
    animFrame = requestAnimationFrame(animate);

    if (!analyser) return;
    var freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    // Add new column
    spectroData.push(freqData);
    if (spectroData.length > maxCols) {
      spectroData.shift();
    }

    renderSpectrogram();
  }

  // Color maps
  function getColor(value) {
    // value 0-255 → RGB
    var t = value / 255;
    // Viridis-like
    var r = Math.round(Math.min(255, Math.max(0, (0.27 + 1.0 * t * t) * 255 * t)));
    var g = Math.round(Math.min(255, Math.max(0, (0.004 + t * (1.5 - t * 0.8)) * 255)));
    var b = Math.round(Math.min(255, Math.max(0, (0.33 + t * 0.6 - t * t * 0.9) * 255)));

    if (t < 0.01) return 'rgb(10,14,26)';
    if (t < 0.1) {
      r = Math.round(20 + t * 300);
      g = Math.round(10 + t * 200);
      b = Math.round(80 + t * 800);
      return 'rgb(' + Math.min(r, 60) + ',' + Math.min(g, 30) + ',' + Math.min(b, 160) + ')';
    }
    if (t < 0.4) {
      r = Math.round(30 + (t - 0.1) * 200);
      g = Math.round(80 + (t - 0.1) * 500);
      b = Math.round(160 - (t - 0.1) * 200);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    if (t < 0.7) {
      r = Math.round(90 + (t - 0.4) * 500);
      g = Math.round(220 - (t - 0.4) * 100);
      b = Math.round(80 - (t - 0.4) * 200);
      return 'rgb(' + Math.min(r, 255) + ',' + g + ',' + Math.max(b, 10) + ')';
    }
    // Hot
    r = Math.round(220 + (t - 0.7) * 100);
    g = Math.round(200 + (t - 0.7) * 180);
    b = Math.round(10 + (t - 0.7) * 300);
    return 'rgb(' + Math.min(r, 255) + ',' + Math.min(g, 255) + ',' + Math.min(b, 120) + ')';
  }

  function renderSpectrogram() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var plotH = HEIGHT - PAD.top - PAD.bottom;

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SPECTROGRAM  (FFT size: ' + state.fftSize + ')', PAD.left, PAD.top - 8);

    ctx.textAlign = 'right';
    var sr = audioCtx ? audioCtx.sampleRate : 44100;
    var nyquist = sr / 2;
    var freqRes = sr / state.fftSize;
    ctx.fillText('Freq resolution: ' + freqRes.toFixed(1) + ' Hz/bin', WIDTH - PAD.right, PAD.top - 8);

    if (spectroData.length === 0) return;

    // Draw spectrogram: each column is a time slice, rendered as vertical strip
    var colW = plotW / maxCols;
    var binCount = spectroData[0].length;
    // Show only up to ~8kHz for readability
    var maxBinShow = Math.min(binCount, Math.floor(8000 / nyquist * binCount));
    var rowH = plotH / maxBinShow;

    for (var col = 0; col < spectroData.length; col++) {
      var data = spectroData[col];
      var x = PAD.left + col * colW;

      for (var bin = 0; bin < maxBinShow; bin++) {
        var y = PAD.top + plotH - (bin + 1) * rowH;
        ctx.fillStyle = getColor(data[bin]);
        ctx.fillRect(x, y, colW + 0.5, rowH + 0.5);
      }
    }

    // Frequency axis (right side)
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    var freqLabels = [0, 500, 1000, 2000, 3000, 4000, 6000, 8000];
    for (var fi = 0; fi < freqLabels.length; fi++) {
      var f = freqLabels[fi];
      var binIdx = Math.floor(f / nyquist * binCount);
      if (binIdx >= maxBinShow) continue;
      var fy = PAD.top + plotH - (binIdx / maxBinShow) * plotH;
      ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : f + '', WIDTH - PAD.right + 5, fy + 3);
      // Tick
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, fy);
      ctx.lineTo(WIDTH - PAD.right, fy);
      ctx.stroke();
    }

    // Frequency axis label
    ctx.save();
    ctx.translate(WIDTH - 8, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (Hz)', 0, 0);
    ctx.restore();

    // Time axis label
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Time \u2192', WIDTH / 2, HEIGHT - 4);

    // Color bar legend
    var legendX = WIDTH - PAD.right + 30;
    var legendH = plotH * 0.6;
    var legendY = PAD.top + (plotH - legendH) / 2;
    for (var i = 0; i < legendH; i++) {
      var val = Math.round((1 - i / legendH) * 255);
      ctx.fillStyle = getColor(val);
      ctx.fillRect(legendX, legendY + i, 8, 1.5);
    }
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('loud', legendX, legendY - 3);
    ctx.fillText('quiet', legendX - 2, legendY + legendH + 10);
  }

  function renderStatic() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    ctx.fillStyle = c.textDim;
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press Start to see the spectrogram', WIDTH / 2, HEIGHT / 2 - 10);
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('Color intensity = energy at each frequency over time', WIDTH / 2, HEIGHT / 2 + 14);
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
