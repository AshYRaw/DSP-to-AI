/* ============================================================
   Tool 27.2 — DSP-Mamba Architect
   Interactive designer for a DSP-informed Mamba variant.
   Compare predicted metrics against standard Mamba.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.DSPMamba = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 500;
  var containerEl;

  var state = {
    initType: 'mixed',
    kernelSize: 15,
    stabilityMargin: 0.05,
    gatingMode: 'bandwidth'
  };

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'DSP-Mamba architecture designer and comparator');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(420, Math.min(520, WIDTH * 0.6));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }

    bindSelect(containerEl, 'dm-init', function (v) { state.initType = v; render(); });
    bindSelect(containerEl, 'dm-gating', function (v) { state.gatingMode = v; render(); });

    var kernelEl = containerEl.querySelector('[data-control="dm-kernel"]');
    if (kernelEl) {
      kernelEl.addEventListener('input', function () {
        state.kernelSize = parseInt(this.value, 10);
        containerEl.querySelector('[data-value="dm-kernel"]').textContent = this.value;
        render();
      });
    }

    var marginEl = containerEl.querySelector('[data-control="dm-margin"]');
    if (marginEl) {
      marginEl.addEventListener('input', function () {
        state.stabilityMargin = parseFloat(this.value);
        containerEl.querySelector('[data-value="dm-margin"]').textContent = parseFloat(this.value).toFixed(2);
        render();
      });
    }

    window.addEventListener('resize', resize);
    resize();
  }

  function computeMetrics() {
    // Compute predicted metrics for DSP-Mamba vs Standard Mamba
    var standard = {
      freqCoverage: 0.65,    // How much of frequency range is covered at init
      stabilityMargin: 0.05,
      memorySpan: 0.75,      // Relative memory span (0-1)
      localContext: 4,        // Conv kernel (ms equivalent)
      convergenceSpeed: 0.5,
      expectedWER: 4.0
    };

    var custom = {
      freqCoverage: 0,
      stabilityMargin: state.stabilityMargin,
      memorySpan: 0,
      localContext: state.kernelSize,
      convergenceSpeed: 0,
      expectedWER: 0
    };

    // Frequency coverage based on init type
    switch (state.initType) {
      case 'hippo': custom.freqCoverage = 0.4; break;      // Low-frequency biased
      case 'butterworth': custom.freqCoverage = 0.8; break; // Spread across bands
      case 'bessel': custom.freqCoverage = 0.5; break;      // Real axis, limited spread
      case 'mixed': custom.freqCoverage = 0.9; break;       // Best coverage
    }

    // Memory span: inversely related to stability margin
    custom.memorySpan = Math.min(1.0, (1 - state.stabilityMargin * 5) * 0.95);
    standard.memorySpan = 0.75;

    // Convergence speed: mixed init and larger kernel help
    custom.convergenceSpeed = 0.5;
    if (state.initType === 'mixed') custom.convergenceSpeed += 0.2;
    if (state.initType === 'butterworth') custom.convergenceSpeed += 0.1;
    if (state.kernelSize > 10) custom.convergenceSpeed += 0.1;
    if (state.gatingMode === 'bandwidth') custom.convergenceSpeed += 0.05;
    custom.convergenceSpeed = Math.min(1.0, custom.convergenceSpeed);

    // Expected WER (lower is better)
    custom.expectedWER = 4.0;
    // Init bonus
    if (state.initType === 'mixed') custom.expectedWER -= 0.3;
    else if (state.initType === 'butterworth') custom.expectedWER -= 0.15;
    // Kernel bonus (larger kernel = better local features, but diminishing returns)
    custom.expectedWER -= Math.min(0.4, (state.kernelSize - 4) * 0.03);
    // Bandwidth gating bonus
    if (state.gatingMode === 'bandwidth') custom.expectedWER -= 0.1;
    // Stability margin effect (too tight = short memory = worse)
    if (state.stabilityMargin > 0.1) custom.expectedWER += 0.2;

    return { standard: standard, custom: custom };
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var metrics = computeMetrics();
    var std = metrics.standard;
    var cust = metrics.custom;

    var PAD = { top: 20, bottom: 30, left: 12, right: 12 };
    var midGap = 20;

    // ─── Top: Frequency Coverage Plot ───
    var topH = HEIGHT * 0.35;
    var plotW = WIDTH - PAD.left - PAD.right;

    ctx.fillStyle = c.text;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency Coverage at Initialization', WIDTH / 2, PAD.top + 8);

    drawFrequencyCoverage(PAD.left, PAD.top + 16, plotW, topH - 24, c);

    // ─── Bottom: Metric Comparison Bars ───
    var bottomY = PAD.top + topH + midGap;
    var bottomH = HEIGHT - bottomY - PAD.bottom;

    ctx.fillStyle = c.text;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DSP-Mamba vs Standard Mamba', WIDTH / 2, bottomY - 4);

    var metricNames = ['Freq Coverage', 'Memory Span', 'Convergence', 'Local Context', 'Stability', 'Expected WER'];
    var stdValues = [std.freqCoverage, std.memorySpan, std.convergenceSpeed, std.localContext / 31, 1 - std.stabilityMargin * 5, 1 - std.expectedWER / 8];
    var custValues = [cust.freqCoverage, cust.memorySpan, cust.convergenceSpeed, cust.localContext / 31, 1 - cust.stabilityMargin * 5, 1 - cust.expectedWER / 8];

    var numMetrics = metricNames.length;
    var barGroupW = (plotW - 60) / numMetrics;
    var barW = barGroupW * 0.35;

    for (var m = 0; m < numMetrics; m++) {
      var gx = PAD.left + 40 + m * barGroupW;
      var maxH = bottomH - 30;

      // Standard bar (blue)
      var sh = Math.max(2, stdValues[m] * maxH);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.6)';
      ctx.fillRect(gx, bottomY + 8 + maxH - sh, barW, sh);

      // Custom bar (amber)
      var ch = Math.max(2, custValues[m] * maxH);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
      ctx.fillRect(gx + barW + 2, bottomY + 8 + maxH - ch, barW, ch);

      // Label
      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      var labelX = gx + barW + 1;
      ctx.fillText(metricNames[m], labelX, bottomY + maxH + 22);

      // Win indicator
      if (custValues[m] > stdValues[m] + 0.02) {
        ctx.fillStyle = '#4ade80';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText('+', gx + barW + 1, bottomY + 6);
      } else if (custValues[m] < stdValues[m] - 0.02) {
        ctx.fillStyle = '#fb7185';
        ctx.fillText('-', gx + barW + 1, bottomY + 6);
      }
    }

    // Legend
    ctx.fillStyle = 'rgba(96, 165, 250, 0.6)';
    ctx.fillRect(PAD.left, bottomY + bottomH - 8, 10, 6);
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Standard Mamba', PAD.left + 14, bottomY + bottomH - 3);

    ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
    ctx.fillRect(PAD.left + 130, bottomY + bottomH - 8, 10, 6);
    ctx.fillStyle = c.textDim;
    ctx.fillText('Your DSP-Mamba', PAD.left + 144, bottomY + bottomH - 3);

    // Expected WER comparison
    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Standard WER: ' + std.expectedWER.toFixed(1) + '%  |  Your WER: ' + cust.expectedWER.toFixed(1) + '%',
      WIDTH - PAD.right, bottomY + bottomH - 3);
  }

  function drawFrequencyCoverage(x, y, w, h, c) {
    var N = 64; // Frequency bins
    var coverage = new Float64Array(N);

    // Compute initial frequency coverage based on init type
    var NUM_CH = 16;
    for (var ch = 0; ch < NUM_CH; ch++) {
      var frac = ch / (NUM_CH - 1);
      var centerFreq = 0;
      var bandwidth = 0;

      switch (state.initType) {
        case 'hippo':
          centerFreq = frac * 0.3; // Low-frequency biased
          bandwidth = 0.08;
          break;
        case 'butterworth':
          centerFreq = 0.05 + frac * 0.9; // Uniform spread
          bandwidth = 0.06;
          break;
        case 'bessel':
          centerFreq = frac * 0.5;
          bandwidth = 0.1;
          break;
        case 'mixed':
          if (frac < 0.33) centerFreq = frac * 0.3;
          else if (frac < 0.66) centerFreq = 0.1 + (frac - 0.33) * 1.5;
          else centerFreq = 0.5 + (frac - 0.66) * 0.8;
          bandwidth = 0.07;
          break;
      }

      // Add Gaussian bump
      for (var k = 0; k < N; k++) {
        var f = k / N;
        var dist = (f - centerFreq);
        coverage[k] += Math.exp(-dist * dist / (2 * bandwidth * bandwidth));
      }
    }

    // Normalize
    var maxCov = 0;
    for (var k = 0; k < N; k++) {
      if (coverage[k] > maxCov) maxCov = coverage[k];
    }

    // Draw
    ctx.fillStyle = 'rgba(148,163,184,0.05)';
    ctx.fillRect(x, y, w, h);

    // Standard Mamba coverage (HiPPO, faint background)
    ctx.fillStyle = 'rgba(96, 165, 250, 0.1)';
    for (var k = 0; k < N; k++) {
      var f = k / N;
      var stdCov = Math.exp(-f * f / (2 * 0.15 * 0.15)); // HiPPO is low-freq biased
      var px = x + (k / N) * w;
      var barH = stdCov * h * 0.8;
      ctx.fillRect(px, y + h - barH, w / N, barH);
    }

    // Custom coverage
    ctx.fillStyle = 'rgba(245, 158, 11, 0.5)';
    for (var k = 0; k < N; k++) {
      var val = maxCov > 0 ? coverage[k] / maxCov : 0;
      var px = x + (k / N) * w;
      var barH = val * h * 0.8;
      ctx.fillRect(px, y + h - barH, w / N - 0.5, barH);
    }

    // Frequency axis
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', x, y + h + 10);
    ctx.fillText('\u03C0/2', x + w / 2, y + h + 10);
    ctx.fillText('\u03C0', x + w, y + h + 10);
    ctx.fillText('Frequency (\u03C9)', x + w / 2, y + h + 20);

    // Formant frequencies (approximate, for context)
    var formants = [
      { f: 0.08, label: 'F1' },
      { f: 0.18, label: 'F2' },
      { f: 0.32, label: 'F3' }
    ];
    for (var fi = 0; fi < formants.length; fi++) {
      var fx = x + formants[fi].f * w;
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.3)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(fx, y);
      ctx.lineTo(fx, y + h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(251, 146, 60, 0.5)';
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.fillText(formants[fi].label, fx, y + 8);
    }
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
