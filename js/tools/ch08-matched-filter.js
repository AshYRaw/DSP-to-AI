/* ============================================================
   Tool 8.3 — Matched Filter Detector
   Interactive matched filter: pick a template, embed it in noise,
   see the cross-correlation peak that detects it.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.MatchedFilter = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;
  var PAD = { top: 8, right: 20, bottom: 8, left: 55 };

  var sr = 8000;
  var duration = 1.0;
  var nSamples;

  // Signals
  var template = null;
  var received = null;       // template + noise
  var mfOutput = null;       // matched filter (cross-correlation) output
  var templatePos = 0;       // where template is embedded

  var state = {
    templateType: 'pulse',   // pulse | chirp | sinc | gaussian
    snrDb: -3,               // input SNR in dB
    filterLen: 64            // template length
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Matched filter detector showing template, noisy signal, and cross-correlation peak');
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
      HEIGHT = Math.max(500, Math.min(600, WIDTH * 0.7));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Controls
    bindSelect(containerEl, 'mf-template', function (v) {
      state.templateType = v;
      runDetection();
    });
    bindSlider(containerEl, 'mf-snr', function (v) {
      state.snrDb = parseFloat(v);
      runDetection();
    });
    bindSlider(containerEl, 'mf-length', function (v) {
      state.filterLen = parseInt(v, 10);
      runDetection();
    });

    // Regenerate button
    var regenBtn = containerEl.querySelector('[data-action="mf-regenerate"]');
    if (regenBtn) regenBtn.addEventListener('click', function () { runDetection(); });

    runDetection();
    resize();
  }

  // ─── Template Generation ───

  function generateTemplate() {
    var L = state.filterLen;
    template = new Float64Array(L);

    switch (state.templateType) {
      case 'pulse':
        // Raised-cosine pulse
        for (var i = 0; i < L; i++) {
          var t = (i - L / 2) / (L / 4);
          template[i] = Math.exp(-t * t / 2) * Math.cos(2 * Math.PI * 3 * i / L);
        }
        break;

      case 'chirp':
        // Linear chirp (frequency sweep)
        for (var i = 0; i < L; i++) {
          var phase = 2 * Math.PI * (2 * i / L + 4 * (i / L) * (i / L));
          var env = 0.5 * (1 - Math.cos(2 * Math.PI * i / L)); // Hann window
          template[i] = env * Math.sin(phase);
        }
        break;

      case 'sinc':
        // Windowed sinc burst
        for (var i = 0; i < L; i++) {
          var x = (i - L / 2);
          var sinc = (Math.abs(x) < 0.001) ? 1.0 : Math.sin(Math.PI * x / 4) / (Math.PI * x / 4);
          var win = 0.5 * (1 - Math.cos(2 * Math.PI * i / L));
          template[i] = sinc * win;
        }
        break;

      case 'gaussian':
        // Gaussian modulated pulse
        for (var i = 0; i < L; i++) {
          var t = (i - L / 2) / (L / 6);
          template[i] = Math.exp(-t * t / 2) * Math.cos(2 * Math.PI * 5 * i / L);
        }
        break;
    }

    // Normalize template energy to 1
    var energy = 0;
    for (var i = 0; i < L; i++) energy += template[i] * template[i];
    var norm = Math.sqrt(energy);
    if (norm > 1e-10) {
      for (var i = 0; i < L; i++) template[i] /= norm;
    }
  }

  // ─── Signal Construction ───

  function constructReceived() {
    received = new Float64Array(nSamples);
    var L = state.filterLen;

    // Random position for template (ensure it fits)
    var margin = L + 100;
    templatePos = margin + Math.floor(Math.random() * (nSamples - 2 * margin));

    // Generate white Gaussian noise
    var noise = new Float64Array(nSamples);
    for (var i = 0; i < nSamples; i++) {
      // Box-Muller transform for Gaussian noise
      var u1 = Math.random() || 1e-10;
      var u2 = Math.random();
      noise[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    // Compute template energy
    var templateEnergy = 0;
    for (var i = 0; i < L; i++) templateEnergy += template[i] * template[i];

    // SNR = 10*log10(E_signal / E_noise_in_template_window)
    // We want: signalPower / noisePower = 10^(SNR/10) within the template region
    // Signal amplitude scales template; noise variance = sigma^2
    // SNR_input = A^2 * E_template / (L * sigma^2)
    var sigma = 1.0;
    var snrLinear = Math.pow(10, state.snrDb / 10);
    var A = Math.sqrt(snrLinear * L * sigma * sigma / (templateEnergy + 1e-10));

    // Embed template at position
    for (var i = 0; i < nSamples; i++) {
      received[i] = noise[i];
    }
    for (var i = 0; i < L; i++) {
      if (templatePos + i < nSamples) {
        received[templatePos + i] += A * template[i];
      }
    }
  }

  // ─── Matched Filter (Cross-Correlation) ───

  function runMatchedFilter() {
    mfOutput = new Float64Array(nSamples);
    var L = state.filterLen;

    // Matched filter = cross-correlation with template = convolution with time-reversed template
    // h_mf[n] = template[L-1-n]  (time-reversed)
    // Output[n] = sum_k received[n-k] * template[k]  (cross-correlation)

    for (var n = 0; n < nSamples; n++) {
      var sum = 0;
      for (var k = 0; k < L; k++) {
        var idx = n - k;
        if (idx >= 0 && idx < nSamples) {
          sum += received[idx] * template[k];
        }
      }
      mfOutput[n] = sum;
    }
  }

  function runDetection() {
    generateTemplate();
    constructReceived();
    runMatchedFilter();
    render();
  }

  // ─── Rendering ───

  function render() {
    if (!ctx || !template) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var rowH = (HEIGHT - 30) / 4;

    // === Row 1: Clean Template ===
    drawRow(0, 'TEMPLATE SIGNAL (' + state.templateType + ', L=' + state.filterLen + ')', function (x0, y0, w, h) {
      var mid = y0 + h / 2;
      drawZeroLine(x0, mid, w);

      // Draw template centered in the row
      var tLen = template.length;
      var maxT = getMax(template);
      var tW = Math.min(w * 0.6, tLen * 4);
      var tX0 = x0 + (w - tW) / 2;

      ctx.beginPath();
      ctx.strokeStyle = c.dsp;
      ctx.lineWidth = 2;
      for (var i = 0; i < tLen; i++) {
        var px = tX0 + (i / (tLen - 1)) * tW;
        var py = mid - (template[i] / (maxT * 1.2)) * (h * 0.4);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Fill under curve
      ctx.lineTo(tX0 + tW, mid);
      ctx.lineTo(tX0, mid);
      ctx.closePath();
      ctx.fillStyle = 'rgba(34,211,238,0.08)';
      ctx.fill();

      // Energy label
      var energy = 0;
      for (var i = 0; i < tLen; i++) energy += template[i] * template[i];
      ctx.fillStyle = c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('E = ' + energy.toFixed(3), x0 + w, y0 + 10);
    });

    // === Row 2: Noisy Received Signal ===
    drawRow(1, 'RECEIVED SIGNAL (template + noise, SNR = ' + state.snrDb + ' dB)', function (x0, y0, w, h) {
      var mid = y0 + h / 2;
      drawZeroLine(x0, mid, w);

      var maxR = getMax(received);

      // Draw received signal
      drawWaveform(received, x0, mid, w, h * 0.4, maxR, c.textDim, 1, 0.5);

      // Highlight template location
      var tStartX = x0 + (templatePos / nSamples) * w;
      var tEndX = x0 + ((templatePos + state.filterLen) / nSamples) * w;
      ctx.fillStyle = 'rgba(34,211,238,0.1)';
      ctx.fillRect(tStartX, y0, tEndX - tStartX, h);

      // Arrow for template position
      ctx.strokeStyle = c.dsp;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(tStartX, y0);
      ctx.lineTo(tStartX, y0 + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tEndX, y0);
      ctx.lineTo(tEndX, y0 + h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = c.dsp;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('template here', (tStartX + tEndX) / 2, y0 + h - 3);
    });

    // === Row 3: Matched Filter Output ===
    drawRow(2, 'MATCHED FILTER OUTPUT (cross-correlation)', function (x0, y0, w, h) {
      var mid = y0 + h / 2;
      drawZeroLine(x0, mid, w);

      var maxMF = getMax(mfOutput);

      // Draw MF output
      drawWaveform(mfOutput, x0, mid, w, h * 0.4, maxMF, c.bridge, 1.5, 0.8);

      // Find and highlight peak
      var peakIdx = 0, peakVal = -Infinity;
      for (var i = 0; i < mfOutput.length; i++) {
        if (Math.abs(mfOutput[i]) > Math.abs(peakVal)) {
          peakVal = mfOutput[i];
          peakIdx = i;
        }
      }

      var peakX = x0 + (peakIdx / nSamples) * w;
      var peakY = mid - (peakVal / (maxMF * 1.2)) * (h * 0.4);

      // Peak marker
      ctx.beginPath();
      ctx.arc(peakX, peakY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = c.ai;
      ctx.fill();
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Peak line
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(peakX, y0);
      ctx.lineTo(peakX, y0 + h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Threshold line (simple: mean + 3*std of |output|)
      var meanAbs = 0, stdAbs = 0;
      for (var i = 0; i < mfOutput.length; i++) meanAbs += Math.abs(mfOutput[i]);
      meanAbs /= mfOutput.length;
      for (var i = 0; i < mfOutput.length; i++) {
        var d = Math.abs(mfOutput[i]) - meanAbs;
        stdAbs += d * d;
      }
      stdAbs = Math.sqrt(stdAbs / mfOutput.length);
      var threshold = meanAbs + 3 * stdAbs;

      var threshY = mid - (threshold / (maxMF * 1.2)) * (h * 0.4);
      var threshYNeg = mid + (threshold / (maxMF * 1.2)) * (h * 0.4);
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, threshY);
      ctx.lineTo(x0 + w, threshY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, threshYNeg);
      ctx.lineTo(x0 + w, threshYNeg);
      ctx.stroke();
      ctx.setLineDash([]);

      // Labels
      ctx.fillStyle = '#fb7185';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('threshold', x0 + 4, threshY - 3);

      ctx.fillStyle = c.ai;
      ctx.textAlign = 'center';
      ctx.fillText('PEAK (n=' + peakIdx + ')', peakX, y0 + 10);

      // Detection result
      var detected = Math.abs(peakVal) > threshold;
      var expectedPeak = templatePos + state.filterLen - 1;
      var peakError = Math.abs(peakIdx - expectedPeak);
      ctx.textAlign = 'right';
      ctx.font = '10px "JetBrains Mono", monospace';
      if (detected && peakError < state.filterLen) {
        ctx.fillStyle = '#4ade80';
        ctx.fillText('DETECTED \u2714 (error: ' + peakError + ' samples)', x0 + w, y0 + 10);
      } else {
        ctx.fillStyle = '#fb7185';
        ctx.fillText('MISSED \u2718', x0 + w, y0 + 10);
      }
    });

    // === Row 4: Detection Performance vs SNR ===
    drawRow(3, 'OUTPUT SNR GAIN (matched filter advantage)', function (x0, y0, w, h) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x0, y0, w, h);

      // Theoretical output SNR = 2*E/N0 = 2*L*SNR_in (for normalized template)
      // Show detection probability curve estimated by running multiple trials
      var snrRange = [];
      var detRates = [];
      var outputSnrs = [];
      var L = state.filterLen;

      // Sweep from -20 to +20 dB
      var nPoints = 25;
      var nTrials = 30;
      for (var si = 0; si < nPoints; si++) {
        var testSnr = -20 + (40 * si / (nPoints - 1));
        snrRange.push(testSnr);

        var detCount = 0;
        var outputSnrSum = 0;
        for (var trial = 0; trial < nTrials; trial++) {
          var result = quickDetectionTest(testSnr, L);
          if (result.detected) detCount++;
          outputSnrSum += result.outputSnr;
        }
        detRates.push(detCount / nTrials);
        outputSnrs.push(outputSnrSum / nTrials);
      }

      // Draw axes
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + h);
      ctx.lineTo(x0 + w, y0 + h);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 + h);
      ctx.stroke();

      // Draw detection probability curve
      ctx.beginPath();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      for (var i = 0; i < nPoints; i++) {
        var px = x0 + (i / (nPoints - 1)) * w;
        var py = y0 + h - detRates[i] * h;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Fill under detection curve
      ctx.lineTo(x0 + w, y0 + h);
      ctx.lineTo(x0, y0 + h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(74,222,128,0.08)';
      ctx.fill();

      // Mark current SNR
      var curIdx = Math.round((state.snrDb + 20) / 40 * (nPoints - 1));
      curIdx = Math.max(0, Math.min(nPoints - 1, curIdx));
      var curX = x0 + (curIdx / (nPoints - 1)) * w;
      var curY = y0 + h - detRates[curIdx] * h;
      ctx.beginPath();
      ctx.arc(curX, curY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = c.ai;
      ctx.fill();
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Vertical marker line
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(curX, y0);
      ctx.lineTo(curX, y0 + h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Axis labels
      ctx.fillStyle = c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('-20 dB', x0 + 20, y0 + h + 10);
      ctx.fillText('0 dB', x0 + w / 2, y0 + h + 10);
      ctx.fillText('+20 dB', x0 + w - 20, y0 + h + 10);
      ctx.fillText('Input SNR \u2192', x0 + w / 2, y0 + h + 20);

      ctx.textAlign = 'right';
      ctx.fillText('P(detect)', x0 - 4, y0 + 10);
      ctx.fillText('1.0', x0 - 4, y0 + 6);
      ctx.fillText('0.0', x0 - 4, y0 + h);

      // Legend
      ctx.textAlign = 'right';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#4ade80';
      ctx.fillText('P(detection) vs input SNR', x0 + w, y0 + 10);

      // Current operating point
      ctx.fillStyle = c.ai;
      var rate = detRates[curIdx];
      ctx.fillText('current: SNR=' + state.snrDb + 'dB, P(det)=' + rate.toFixed(2), x0 + w, y0 + 24);

      // Theoretical gain
      var gainDb = 10 * Math.log10(L);
      ctx.fillStyle = c.textDim;
      ctx.fillText('MF gain: 10\u00B7log\u2081\u2080(L) = ' + gainDb.toFixed(1) + ' dB', x0 + w, y0 + h - 4);
    });

    // Footer info
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(state.templateType + ' | SNR=' + state.snrDb + ' dB | L=' + state.filterLen, WIDTH - PAD.right, HEIGHT - 4);
  }

  // ─── Quick Detection Test (for performance curve) ───

  function quickDetectionTest(snrDb, L) {
    // Generate small template
    var tpl = new Float64Array(L);
    switch (state.templateType) {
      case 'pulse':
        for (var i = 0; i < L; i++) {
          var t = (i - L / 2) / (L / 4);
          tpl[i] = Math.exp(-t * t / 2) * Math.cos(2 * Math.PI * 3 * i / L);
        }
        break;
      case 'chirp':
        for (var i = 0; i < L; i++) {
          var phase = 2 * Math.PI * (2 * i / L + 4 * (i / L) * (i / L));
          var env = 0.5 * (1 - Math.cos(2 * Math.PI * i / L));
          tpl[i] = env * Math.sin(phase);
        }
        break;
      case 'sinc':
        for (var i = 0; i < L; i++) {
          var x = (i - L / 2);
          var sinc = (Math.abs(x) < 0.001) ? 1.0 : Math.sin(Math.PI * x / 4) / (Math.PI * x / 4);
          var win = 0.5 * (1 - Math.cos(2 * Math.PI * i / L));
          tpl[i] = sinc * win;
        }
        break;
      case 'gaussian':
        for (var i = 0; i < L; i++) {
          var t = (i - L / 2) / (L / 6);
          tpl[i] = Math.exp(-t * t / 2) * Math.cos(2 * Math.PI * 5 * i / L);
        }
        break;
    }

    // Normalize
    var energy = 0;
    for (var i = 0; i < L; i++) energy += tpl[i] * tpl[i];
    var norm = Math.sqrt(energy);
    if (norm > 1e-10) for (var i = 0; i < L; i++) tpl[i] /= norm;

    // Short test signal
    var N = L * 8;
    var pos = L + Math.floor(Math.random() * (N - 3 * L));
    var sig = new Float64Array(N);

    // Noise
    for (var i = 0; i < N; i++) {
      var u1 = Math.random() || 1e-10;
      var u2 = Math.random();
      sig[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    // Embed template
    var tplEnergy = 0;
    for (var i = 0; i < L; i++) tplEnergy += tpl[i] * tpl[i];
    var snrLin = Math.pow(10, snrDb / 10);
    var A = Math.sqrt(snrLin * L / (tplEnergy + 1e-10));
    for (var i = 0; i < L; i++) {
      if (pos + i < N) sig[pos + i] += A * tpl[i];
    }

    // Cross-correlate
    var output = new Float64Array(N);
    for (var n = 0; n < N; n++) {
      var sum = 0;
      for (var k = 0; k < L; k++) {
        var idx = n - k;
        if (idx >= 0 && idx < N) sum += sig[idx] * tpl[k];
      }
      output[n] = sum;
    }

    // Find peak
    var peakIdx = 0, peakVal = -Infinity;
    for (var i = 0; i < N; i++) {
      if (Math.abs(output[i]) > Math.abs(peakVal)) {
        peakVal = output[i];
        peakIdx = i;
      }
    }

    // Threshold
    var meanAbs = 0;
    for (var i = 0; i < N; i++) meanAbs += Math.abs(output[i]);
    meanAbs /= N;
    var stdAbs = 0;
    for (var i = 0; i < N; i++) {
      var d = Math.abs(output[i]) - meanAbs;
      stdAbs += d * d;
    }
    stdAbs = Math.sqrt(stdAbs / N);
    var thresh = meanAbs + 3 * stdAbs;

    var expectedPeak = pos + L - 1;
    var detected = Math.abs(peakVal) > thresh && Math.abs(peakIdx - expectedPeak) < L;

    // Output SNR estimate
    var peakPower = peakVal * peakVal;
    var noisePower = 0;
    var noiseCount = 0;
    for (var i = 0; i < N; i++) {
      if (Math.abs(i - expectedPeak) > L) {
        noisePower += output[i] * output[i];
        noiseCount++;
      }
    }
    noisePower = noiseCount > 0 ? noisePower / noiseCount : 1e-10;
    var outputSnr = 10 * Math.log10(peakPower / (noisePower + 1e-10));

    return { detected: detected, outputSnr: outputSnr };
  }

  // ─── Drawing Helpers ───

  function drawRow(index, label, drawFn) {
    var c = Plot.getColors();
    var plotW = WIDTH - PAD.left - PAD.right;
    var rowH = (HEIGHT - 30) / 4;
    var y0 = PAD.top + index * rowH;

    if (index > 0) {
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y0 - 2);
      ctx.lineTo(WIDTH - PAD.right, y0 - 2);
      ctx.stroke();
    }

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
    var step = Math.max(1, Math.floor(signal.length / showSamples));

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.globalAlpha = alpha;
    for (var i = 0; i < showSamples; i++) {
      var idx = i * step;
      if (idx >= signal.length) break;
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
