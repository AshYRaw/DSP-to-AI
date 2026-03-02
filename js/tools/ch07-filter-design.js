/* ============================================================
   Tool 7.1 — Filter Design Workbench
   Specify filter type / cutoff / order, compare FIR vs IIR
   side-by-side. See coefficients, frequency response,
   pole-zero plot, impulse response. Audio A/B test.
   Depends on: plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.FilterDesign = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 580;
  var PAD = { top: 8, right: 20, bottom: 8, left: 50 };

  var state = {
    filterType: 'lowpass',  // lowpass | highpass | bandpass
    cutoff: 0.25,           // normalized 0–0.5 (fraction of Nyquist)
    cutoff2: 0.4,           // second cutoff for bandpass
    firOrder: 31,           // FIR tap count (odd)
    iirOrder: 4,            // IIR order (number of poles)
    windowType: 'hamming',  // rectangular | hamming | blackman | hann
    view: 'both'            // 'fir' | 'iir' | 'both'
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'FIR and IIR filter design workbench with frequency response comparison');
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
      HEIGHT = Math.max(520, Math.min(620, WIDTH * 0.72));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Controls
    bindSelect(containerEl, 'filter-type', function (v) { state.filterType = v; render(); });
    bindSlider(containerEl, 'cutoff', function (v) { state.cutoff = parseFloat(v); render(); });
    bindSlider(containerEl, 'cutoff2', function (v) { state.cutoff2 = parseFloat(v); render(); });
    bindSlider(containerEl, 'fir-order', function (v) { state.firOrder = parseInt(v, 10) | 1; render(); }); // force odd
    bindSlider(containerEl, 'iir-order', function (v) { state.iirOrder = parseInt(v, 10); render(); });
    bindSelect(containerEl, 'window-type', function (v) { state.windowType = v; render(); });
    bindSelect(containerEl, 'design-view', function (v) { state.view = v; render(); });

    // Audio buttons
    var playFir = containerEl.querySelector('[data-action="play-fir"]');
    if (playFir) playFir.addEventListener('click', function () { playFiltered('fir'); });
    var playIir = containerEl.querySelector('[data-action="play-iir"]');
    if (playIir) playIir.addEventListener('click', function () { playFiltered('iir'); });
    var playRaw = containerEl.querySelector('[data-action="play-raw"]');
    if (playRaw) playRaw.addEventListener('click', function () { playFiltered('raw'); });
    var stopBtn = containerEl.querySelector('[data-action="stop-design"]');
    if (stopBtn) stopBtn.addEventListener('click', function () { Audio.stop(); });

    resize();
  }

  /* ---- FIR Design: Windowed Sinc ---- */
  function designFIR() {
    var M = state.firOrder;
    var fc = state.cutoff; // normalized to Nyquist (0–0.5 maps to 0–π)
    var omega_c = fc * Math.PI * 2; // angular cutoff (0 to 2π range, but we use 0 to π)
    omega_c = fc * 2; // normalized frequency for sinc

    var h = new Float64Array(M);
    var center = (M - 1) / 2;

    // Ideal sinc lowpass
    for (var n = 0; n < M; n++) {
      var nm = n - center;
      if (Math.abs(nm) < 1e-10) {
        h[n] = omega_c;
      } else {
        h[n] = Math.sin(Math.PI * omega_c * nm) / (Math.PI * nm);
      }
    }

    // For highpass: spectral inversion
    if (state.filterType === 'highpass') {
      for (var n = 0; n < M; n++) {
        h[n] = -h[n];
      }
      h[Math.floor(center)] += 1;
    }

    // For bandpass: design two lowpass and subtract
    if (state.filterType === 'bandpass') {
      var fc2 = state.cutoff2;
      var omega_c2 = fc2 * 2;
      var hHigh = new Float64Array(M);
      for (var n = 0; n < M; n++) {
        var nm = n - center;
        if (Math.abs(nm) < 1e-10) {
          hHigh[n] = omega_c2;
        } else {
          hHigh[n] = Math.sin(Math.PI * omega_c2 * nm) / (Math.PI * nm);
        }
      }
      // bandpass = highcutoff_lp - lowcutoff_lp
      for (var n = 0; n < M; n++) {
        h[n] = hHigh[n] - h[n];
      }
    }

    // Apply window
    var win = getWindow(M, state.windowType);
    for (var n = 0; n < M; n++) {
      h[n] *= win[n];
    }

    // Normalize
    var sum = 0;
    for (var n = 0; n < M; n++) sum += h[n];
    if (state.filterType === 'lowpass' && Math.abs(sum) > 1e-10) {
      for (var n = 0; n < M; n++) h[n] /= sum;
    }

    return { b: h, a: [1] };
  }

  function getWindow(N, type) {
    var w = new Float64Array(N);
    for (var n = 0; n < N; n++) {
      switch (type) {
        case 'rectangular':
          w[n] = 1;
          break;
        case 'hann':
          w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
          break;
        case 'hamming':
          w[n] = 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (N - 1));
          break;
        case 'blackman':
          w[n] = 0.42 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1)) + 0.08 * Math.cos(4 * Math.PI * n / (N - 1));
          break;
        default:
          w[n] = 1;
      }
    }
    return w;
  }

  /* ---- IIR Design: Butterworth via pole placement ---- */
  function designIIR() {
    var N = state.iirOrder;
    var fc = state.cutoff;
    // Butterworth poles in s-plane, then bilinear transform to z-plane
    var omega_c = Math.tan(Math.PI * fc); // pre-warped cutoff

    // s-plane poles for Butterworth: equally spaced on left half of unit circle
    var sPoles = [];
    for (var k = 0; k < N; k++) {
      var angle = Math.PI * (2 * k + N + 1) / (2 * N);
      sPoles.push({
        r: omega_c * Math.cos(angle),
        i: omega_c * Math.sin(angle)
      });
    }

    // Bilinear transform: z = (1 + s/2) / (1 - s/2)  (with Ts=2 normalization)
    var zPoles = [];
    for (var k = 0; k < N; k++) {
      var sr = sPoles[k].r, si = sPoles[k].i;
      // z = (2 + s) / (2 - s)  where s is already pre-warped
      var numR = 1 + sr, numI = si;
      var denR = 1 - sr, denI = -si;
      var denMag2 = denR * denR + denI * denI;
      zPoles.push({
        r: (numR * denR + numI * denI) / denMag2,
        i: (numI * denR - numR * denI) / denMag2
      });
    }

    // For lowpass Butterworth, zeros are all at z = -1
    var zZeros = [];
    for (var k = 0; k < N; k++) {
      zZeros.push({ r: -1, i: 0 });
    }

    // For highpass: swap zeros to z = 1, transform poles
    if (state.filterType === 'highpass') {
      for (var k = 0; k < N; k++) {
        zZeros[k] = { r: 1, i: 0 };
      }
      // Re-do with highpass transformation: s → ωc/s
      var omega_hp = Math.tan(Math.PI * fc);
      sPoles = [];
      for (var k = 0; k < N; k++) {
        var angle = Math.PI * (2 * k + N + 1) / (2 * N);
        var sr = Math.cos(angle);
        var si = Math.sin(angle);
        // s → omega_hp / s: new pole = omega_hp / (sr + j*si)
        var mag2 = sr * sr + si * si;
        sPoles.push({
          r: omega_hp * sr / mag2,
          i: -omega_hp * si / mag2
        });
      }
      zPoles = [];
      for (var k = 0; k < N; k++) {
        var sr = sPoles[k].r, si = sPoles[k].i;
        var numR = 1 + sr, numI = si;
        var denR = 1 - sr, denI = -si;
        var denMag2 = denR * denR + denI * denI;
        zPoles.push({
          r: (numR * denR + numI * denI) / denMag2,
          i: (numI * denR - numR * denI) / denMag2
        });
      }
    }

    // Build polynomial coefficients from poles and zeros
    var b = polyFromRoots(zZeros);
    var a = polyFromRoots(zPoles);

    // Normalize gain at DC (lowpass) or Nyquist (highpass)
    var evalFreq = state.filterType === 'highpass' ? Math.PI : 0;
    var numVal = evalPoly(b, evalFreq);
    var denVal = evalPoly(a, evalFreq);
    var numMag = Math.sqrt(numVal.r * numVal.r + numVal.i * numVal.i);
    var denMag = Math.sqrt(denVal.r * denVal.r + denVal.i * denVal.i);
    var gainCorr = denMag / (numMag || 1e-10);
    for (var i = 0; i < b.length; i++) b[i] *= gainCorr;

    return { b: b, a: a, poles: zPoles, zeros: zZeros };
  }

  function polyFromRoots(roots) {
    var poly = [1];
    for (var i = 0; i < roots.length; i++) {
      var rr = roots[i].r;
      var newPoly = new Array(poly.length + 1);
      for (var k = 0; k < newPoly.length; k++) newPoly[k] = 0;
      for (var k = 0; k < poly.length; k++) {
        newPoly[k] += poly[k];
        newPoly[k + 1] -= rr * poly[k];
      }
      poly = newPoly;
    }
    return poly;
  }

  function evalPoly(coeffs, omega) {
    // Evaluate B(z) at z = e^(jω)
    var zr = Math.cos(omega), zi = Math.sin(omega);
    var zinvR = zr, zinvI = -zi; // z^-1 = e^(-jω)
    var sumR = 0, sumI = 0;
    var powR = 1, powI = 0;
    for (var k = 0; k < coeffs.length; k++) {
      sumR += coeffs[k] * powR;
      sumI += coeffs[k] * powI;
      var nR = powR * zinvR - powI * zinvI;
      var nI = powR * zinvI + powI * zinvR;
      powR = nR; powI = nI;
    }
    return { r: sumR, i: sumI };
  }

  function computeFreqResponse(b, a, nPts) {
    var mag = new Float64Array(nPts);
    var phase = new Float64Array(nPts);
    for (var i = 0; i < nPts; i++) {
      var omega = Math.PI * i / (nPts - 1);
      var num = evalPoly(b, omega);
      var den = evalPoly(a, omega);
      var denMag2 = den.r * den.r + den.i * den.i;
      if (denMag2 < 1e-30) { mag[i] = 1e6; phase[i] = 0; continue; }
      var hr = (num.r * den.r + num.i * den.i) / denMag2;
      var hi = (num.i * den.r - num.r * den.i) / denMag2;
      mag[i] = Math.sqrt(hr * hr + hi * hi);
      phase[i] = Math.atan2(hi, hr);
    }
    return { mag: mag, phase: phase };
  }

  function computeIR(b, a, maxLen) {
    var h = new Float64Array(maxLen);
    var x = new Float64Array(maxLen);
    var y = new Float64Array(maxLen);
    x[0] = 1;
    for (var n = 0; n < maxLen; n++) {
      var sum = 0;
      for (var k = 0; k < b.length; k++) {
        if (n - k >= 0) sum += b[k] * x[n - k];
      }
      for (var k = 1; k < a.length; k++) {
        if (n - k >= 0) sum -= a[k] * y[n - k];
      }
      y[n] = sum; h[n] = sum;
      if (Math.abs(h[n]) > 1e5) break;
    }
    return h;
  }

  /* ---- Audio ---- */
  function playFiltered(mode) {
    Audio.stop();
    var sr = 8000;
    var dur = 2.0;
    var nSamples = Math.floor(sr * dur);

    // Generate test signal: mix of frequencies
    var signal = new Float64Array(nSamples);
    var freqs = [200, 500, 1000, 2000, 3500];
    for (var f = 0; f < freqs.length; f++) {
      for (var i = 0; i < nSamples; i++) {
        signal[i] += 0.15 * Math.sin(2 * Math.PI * freqs[f] * i / sr);
      }
    }
    // Add some noise
    for (var i = 0; i < nSamples; i++) signal[i] += 0.05 * (Math.random() - 0.5);

    if (mode === 'raw') {
      Audio.playSamples(signal, sr);
      return;
    }

    var filter = mode === 'fir' ? designFIR() : designIIR();
    var output = new Float64Array(nSamples);
    var y = new Float64Array(nSamples);

    for (var n = 0; n < nSamples; n++) {
      var sum = 0;
      for (var k = 0; k < filter.b.length; k++) {
        if (n - k >= 0) sum += filter.b[k] * signal[n - k];
      }
      for (var k = 1; k < filter.a.length; k++) {
        if (n - k >= 0) sum -= filter.a[k] * y[n - k];
      }
      y[n] = sum;
      output[n] = Math.max(-1, Math.min(1, sum));
    }

    // Normalize
    var peak = 0;
    for (var i = 0; i < output.length; i++) peak = Math.max(peak, Math.abs(output[i]));
    if (peak > 0) {
      for (var i = 0; i < output.length; i++) output[i] = output[i] / peak * 0.5;
    }

    Audio.playSamples(output, sr);
  }

  /* ---- Rendering ---- */
  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var fir = designFIR();
    var iir = designIIR();
    var nPts = 256;
    var firResp = computeFreqResponse(fir.b, fir.a, nPts);
    var iirResp = computeFreqResponse(iir.b, iir.a, nPts);

    var showFir = state.view !== 'iir';
    var showIir = state.view !== 'fir';

    var plotW = WIDTH - PAD.left - PAD.right;

    // Layout: 3 rows
    var rowH = (HEIGHT - 30) / 3;

    // === Row 0: Magnitude Response ===
    drawMagnitudeRow(0, rowH, firResp, iirResp, showFir, showIir, c, plotW, nPts);

    // === Row 1: Impulse Response ===
    drawImpulseRow(1, rowH, fir, iir, showFir, showIir, c, plotW);

    // === Row 2: Coefficients / Info ===
    drawInfoRow(2, rowH, fir, iir, showFir, showIir, c, plotW);

    // Cutoff line on frequency response
    var cutoffX = PAD.left + state.cutoff * 2 * plotW;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cutoffX, PAD.top);
    ctx.lineTo(cutoffX, PAD.top + rowH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('fc', cutoffX, PAD.top + rowH + 22);
  }

  function drawMagnitudeRow(rowIdx, rowH, firResp, iirResp, showFir, showIir, c, plotW, nPts) {
    var yOff = PAD.top + rowIdx * rowH;

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MAGNITUDE RESPONSE  |H(e^{j\u03C9})|', PAD.left, yOff + 12);

    // Legend
    ctx.textAlign = 'right';
    if (showFir) {
      ctx.fillStyle = c.dsp;
      ctx.fillText('\u2014 FIR (' + state.firOrder + ' taps, ' + state.windowType + ')', WIDTH - PAD.right, yOff + 12);
    }
    if (showIir) {
      ctx.fillStyle = c.ai;
      ctx.fillText(showFir ? '\u2014 IIR (order ' + state.iirOrder + ', Butterworth)' : '\u2014 IIR (order ' + state.iirOrder + ')',
        WIDTH - PAD.right, yOff + (showFir ? 24 : 12));
    }

    // Find max
    var maxMag = 0.01;
    for (var i = 0; i < nPts; i++) {
      if (showFir) maxMag = Math.max(maxMag, firResp.mag[i]);
      if (showIir) maxMag = Math.max(maxMag, iirResp.mag[i]);
    }
    var yMax = Math.max(1.5, maxMag * 1.1);

    var plotTop = yOff + 28;
    var plotH = rowH - 40;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(PAD.left, plotTop, plotW, plotH);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (var g = 0; g <= 4; g++) {
      var gy = plotTop + (g / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, gy); ctx.lineTo(PAD.left + plotW, gy);
      ctx.stroke();
    }

    // Unity line
    var unityY = plotTop + plotH - (1.0 / yMax) * plotH;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, unityY); ctx.lineTo(PAD.left + plotW, unityY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw FIR response
    if (showFir) {
      ctx.beginPath();
      ctx.strokeStyle = c.dsp;
      ctx.lineWidth = 2;
      for (var i = 0; i < nPts; i++) {
        var px = PAD.left + (i / (nPts - 1)) * plotW;
        var py = plotTop + plotH - (firResp.mag[i] / yMax) * plotH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Draw IIR response
    if (showIir) {
      ctx.beginPath();
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      for (var i = 0; i < nPts; i++) {
        var px = PAD.left + (i / (nPts - 1)) * plotW;
        var py = plotTop + plotH - (Math.min(iirResp.mag[i], yMax) / yMax) * plotH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // X-axis
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', PAD.left, plotTop + plotH + 12);
    ctx.fillText('\u03C0/2', PAD.left + plotW * 0.5, plotTop + plotH + 12);
    ctx.fillText('\u03C0', PAD.left + plotW, plotTop + plotH + 12);
  }

  function drawImpulseRow(rowIdx, rowH, fir, iir, showFir, showIir, c, plotW) {
    var yOff = PAD.top + rowIdx * rowH;
    var maxLen = 80;
    var firIR = showFir ? computeIR(fir.b, fir.a, maxLen) : null;
    var iirIR = showIir ? computeIR(iir.b, iir.a, maxLen) : null;

    // Separator
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, yOff);
    ctx.lineTo(PAD.left + plotW, yOff);
    ctx.stroke();

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('IMPULSE RESPONSE h[n]', PAD.left, yOff + 12);

    var plotTop = yOff + 20;
    var plotH = rowH - 30;
    var midY = plotTop + plotH / 2;

    // Zero line
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, midY); ctx.lineTo(PAD.left + plotW, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Range
    var maxAbs = 0.01;
    if (firIR) for (var i = 0; i < firIR.length; i++) maxAbs = Math.max(maxAbs, Math.abs(firIR[i]));
    if (iirIR) for (var i = 0; i < iirIR.length; i++) maxAbs = Math.max(maxAbs, Math.abs(iirIR[i]));
    var yR = maxAbs * 1.2;

    // Draw FIR IR as stems
    if (firIR) {
      for (var i = 0; i < firIR.length; i++) {
        var px = PAD.left + (i / (maxLen - 1)) * plotW;
        var py = midY - (firIR[i] / yR) * (plotH * 0.45);
        ctx.beginPath();
        ctx.moveTo(px, midY); ctx.lineTo(px, py);
        ctx.strokeStyle = c.dsp;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = c.dsp;
        ctx.fill();
      }
    }

    // Draw IIR IR as line
    if (iirIR) {
      ctx.beginPath();
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      for (var i = 0; i < iirIR.length; i++) {
        var px = PAD.left + (i / (maxLen - 1)) * plotW;
        var py = midY - (iirIR[i] / yR) * (plotH * 0.45);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  function drawInfoRow(rowIdx, rowH, fir, iir, showFir, showIir, c, plotW) {
    var yOff = PAD.top + rowIdx * rowH;

    // Separator
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, yOff);
    ctx.lineTo(PAD.left + plotW, yOff);
    ctx.stroke();

    var colW = plotW / 2;
    var textY = yOff + 18;
    var lineH = 16;

    // FIR info
    if (showFir) {
      ctx.fillStyle = c.dsp;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('FIR Filter', PAD.left, textY);

      ctx.fillStyle = c.textDim;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('Type: ' + state.filterType + ' | Taps: ' + state.firOrder + ' | Window: ' + state.windowType, PAD.left, textY + lineH);
      ctx.fillText('Cutoff: ' + (state.cutoff * 100).toFixed(0) + '% of Nyquist | Delay: ' + Math.floor(state.firOrder / 2) + ' samples', PAD.left, textY + lineH * 2);
      ctx.fillText('Always stable (no feedback) | Linear phase | ' + state.firOrder + ' multiplies/sample', PAD.left, textY + lineH * 3);

      // Coefficients preview
      ctx.fillStyle = c.dsp;
      ctx.font = '9px "JetBrains Mono", monospace';
      var coeffStr = 'h = [' + Array.from(fir.b).slice(0, 5).map(function (v) { return v.toFixed(4); }).join(', ');
      if (fir.b.length > 5) coeffStr += ', ...';
      coeffStr += ']';
      ctx.fillText(coeffStr, PAD.left, textY + lineH * 4.5);
    }

    // IIR info
    if (showIir) {
      var iirX = showFir ? PAD.left + colW + 20 : PAD.left;
      ctx.fillStyle = c.ai;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('IIR Filter (Butterworth)', iirX, textY);

      ctx.fillStyle = c.textDim;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('Type: ' + state.filterType + ' | Order: ' + state.iirOrder, iirX, textY + lineH);
      ctx.fillText('Cutoff: ' + (state.cutoff * 100).toFixed(0) + '% of Nyquist | ' + (state.iirOrder * 2 + 1) + ' multiplies/sample', iirX, textY + lineH * 2);
      ctx.fillText('Needs stability check | Nonlinear phase | Infinite impulse response', iirX, textY + lineH * 3);

      // Feedback coefficients preview
      ctx.fillStyle = c.ai;
      ctx.font = '9px "JetBrains Mono", monospace';
      var aStr = 'a = [' + iir.a.slice(0, 5).map(function (v) { return v.toFixed(4); }).join(', ');
      if (iir.a.length > 5) aStr += ', ...';
      aStr += ']';
      ctx.fillText(aStr, iirX, textY + lineH * 4.5);
    }

    // Bridge note
    ctx.fillStyle = c.bridge;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FIR = finite memory (like Attention) | IIR = infinite memory (like Mamba)', WIDTH / 2, yOff + rowH - 8);
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
