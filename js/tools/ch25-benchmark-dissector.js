/* ============================================================
   Tool 25.1 — Benchmark Dissector
   Fair architecture comparisons at iso-parameter budgets.
   Shows bar chart + fairness meter.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.BenchmarkDissector = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 480;
  var containerEl;

  var state = {
    params: 30,
    data: 960,
    metric: 'wer'
  };

  // Simulated benchmark data: [params][data] → { arch: value }
  // WER values are approximate/illustrative based on published results
  var benchmarks = {
    wer: {
      10:  { 960: { conformer: 6.2, conmamba_bidir: 5.8, conmamba_causal: 7.1, pure_mamba: 8.5, hybrid_jamba: 6.0 },
             5000: { conformer: 4.8, conmamba_bidir: 4.5, conmamba_causal: 5.5, pure_mamba: 6.2, hybrid_jamba: 4.6 },
             15000: { conformer: 3.5, conmamba_bidir: 3.3, conmamba_causal: 4.0, pure_mamba: 4.5, hybrid_jamba: 3.4 } },
      30:  { 960: { conformer: 4.3, conmamba_bidir: 3.9, conmamba_causal: 5.0, pure_mamba: 6.8, hybrid_jamba: 4.1 },
             5000: { conformer: 3.4, conmamba_bidir: 3.1, conmamba_causal: 3.9, pure_mamba: 4.8, hybrid_jamba: 3.2 },
             15000: { conformer: 2.6, conmamba_bidir: 2.5, conmamba_causal: 3.1, pure_mamba: 3.5, hybrid_jamba: 2.5 } },
      100: { 960: { conformer: 3.5, conmamba_bidir: 3.4, conmamba_causal: 4.2, pure_mamba: 5.5, hybrid_jamba: 3.4 },
             5000: { conformer: 2.8, conmamba_bidir: 2.7, conmamba_causal: 3.2, pure_mamba: 3.8, hybrid_jamba: 2.7 },
             15000: { conformer: 2.0, conmamba_bidir: 1.9, conmamba_causal: 2.3, pure_mamba: 2.8, hybrid_jamba: 1.9 } },
      300: { 960: { conformer: 3.2, conmamba_bidir: 3.1, conmamba_causal: 3.8, pure_mamba: 4.8, hybrid_jamba: 3.1 },
             5000: { conformer: 2.4, conmamba_bidir: 2.3, conmamba_causal: 2.8, pure_mamba: 3.2, hybrid_jamba: 2.3 },
             15000: { conformer: 1.6, conmamba_bidir: 1.5, conmamba_causal: 1.9, pure_mamba: 2.2, hybrid_jamba: 1.5 } }
    },
    speed: {  // Relative inference speed (higher = faster)
      10:  { 960: { conformer: 1.0, conmamba_bidir: 0.9, conmamba_causal: 1.4, pure_mamba: 1.8, hybrid_jamba: 1.3 },
             5000: { conformer: 1.0, conmamba_bidir: 0.9, conmamba_causal: 1.4, pure_mamba: 1.8, hybrid_jamba: 1.3 },
             15000: { conformer: 1.0, conmamba_bidir: 0.9, conmamba_causal: 1.4, pure_mamba: 1.8, hybrid_jamba: 1.3 } },
      30:  { 960: { conformer: 1.0, conmamba_bidir: 0.85, conmamba_causal: 1.5, pure_mamba: 2.0, hybrid_jamba: 1.4 },
             5000: { conformer: 1.0, conmamba_bidir: 0.85, conmamba_causal: 1.5, pure_mamba: 2.0, hybrid_jamba: 1.4 },
             15000: { conformer: 1.0, conmamba_bidir: 0.85, conmamba_causal: 1.5, pure_mamba: 2.0, hybrid_jamba: 1.4 } },
      100: { 960: { conformer: 1.0, conmamba_bidir: 0.8, conmamba_causal: 1.6, pure_mamba: 2.2, hybrid_jamba: 1.5 },
             5000: { conformer: 1.0, conmamba_bidir: 0.8, conmamba_causal: 1.6, pure_mamba: 2.2, hybrid_jamba: 1.5 },
             15000: { conformer: 1.0, conmamba_bidir: 0.8, conmamba_causal: 1.6, pure_mamba: 2.2, hybrid_jamba: 1.5 } },
      300: { 960: { conformer: 1.0, conmamba_bidir: 0.75, conmamba_causal: 1.8, pure_mamba: 2.5, hybrid_jamba: 1.6 },
             5000: { conformer: 1.0, conmamba_bidir: 0.75, conmamba_causal: 1.8, pure_mamba: 2.5, hybrid_jamba: 1.6 },
             15000: { conformer: 1.0, conmamba_bidir: 0.75, conmamba_causal: 1.8, pure_mamba: 2.5, hybrid_jamba: 1.6 } }
    },
    memory: { // Relative peak memory (lower = better)
      10:  { 960: { conformer: 1.0, conmamba_bidir: 0.85, conmamba_causal: 0.65, pure_mamba: 0.5, hybrid_jamba: 0.7 },
             5000: { conformer: 1.0, conmamba_bidir: 0.85, conmamba_causal: 0.65, pure_mamba: 0.5, hybrid_jamba: 0.7 },
             15000: { conformer: 1.0, conmamba_bidir: 0.85, conmamba_causal: 0.65, pure_mamba: 0.5, hybrid_jamba: 0.7 } },
      30:  { 960: { conformer: 1.0, conmamba_bidir: 0.8, conmamba_causal: 0.55, pure_mamba: 0.4, hybrid_jamba: 0.6 },
             5000: { conformer: 1.0, conmamba_bidir: 0.8, conmamba_causal: 0.55, pure_mamba: 0.4, hybrid_jamba: 0.6 },
             15000: { conformer: 1.0, conmamba_bidir: 0.8, conmamba_causal: 0.55, pure_mamba: 0.4, hybrid_jamba: 0.6 } },
      100: { 960: { conformer: 1.0, conmamba_bidir: 0.75, conmamba_causal: 0.45, pure_mamba: 0.3, hybrid_jamba: 0.5 },
             5000: { conformer: 1.0, conmamba_bidir: 0.75, conmamba_causal: 0.45, pure_mamba: 0.3, hybrid_jamba: 0.5 },
             15000: { conformer: 1.0, conmamba_bidir: 0.75, conmamba_causal: 0.45, pure_mamba: 0.3, hybrid_jamba: 0.5 } },
      300: { 960: { conformer: 1.0, conmamba_bidir: 0.7, conmamba_causal: 0.35, pure_mamba: 0.25, hybrid_jamba: 0.4 },
             5000: { conformer: 1.0, conmamba_bidir: 0.7, conmamba_causal: 0.35, pure_mamba: 0.25, hybrid_jamba: 0.4 },
             15000: { conformer: 1.0, conmamba_bidir: 0.7, conmamba_causal: 0.35, pure_mamba: 0.25, hybrid_jamba: 0.4 } }
    }
  };

  var archLabels = {
    conformer: 'Conformer',
    conmamba_bidir: 'ConMamba\n(bidir)',
    conmamba_causal: 'ConMamba\n(causal)',
    pure_mamba: 'Pure\nMamba',
    hybrid_jamba: 'Hybrid\n(Jamba)'
  };

  var archColors = ['#60a5fa', '#a78bfa', '#c084fc', '#4ade80', '#f59e0b'];
  var archFlags = {
    conformer: { bidir: true, streaming: false },
    conmamba_bidir: { bidir: true, streaming: false },
    conmamba_causal: { bidir: false, streaming: true },
    pure_mamba: { bidir: false, streaming: true },
    hybrid_jamba: { bidir: false, streaming: true }
  };

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Benchmark dissector comparing architectures at iso-parameter budgets');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(400, Math.min(500, WIDTH * 0.6));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }

    bindSelect(containerEl, 'bd-params', function (v) { state.params = parseInt(v, 10); render(); });
    bindSelect(containerEl, 'bd-data', function (v) { state.data = parseInt(v, 10); render(); });
    bindSelect(containerEl, 'bd-metric', function (v) { state.metric = v; render(); });

    window.addEventListener('resize', resize);
    resize();
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var data = benchmarks[state.metric][state.params][state.data];
    if (!data) return;

    var archs = Object.keys(data);
    var values = archs.map(function (a) { return data[a]; });

    var PAD = { top: 30, bottom: 55, left: 55, right: 20 };
    var chartW = WIDTH - PAD.left - PAD.right;
    var chartH = HEIGHT - PAD.top - PAD.bottom - 60; // Leave room for fairness meter
    var barW = chartW / archs.length;
    var barPad = barW * 0.2;

    // Determine if lower is better (WER, memory) or higher is better (speed)
    var lowerBetter = (state.metric === 'wer' || state.metric === 'memory');

    var maxVal = Math.max.apply(null, values) * 1.15;
    var minVal = 0;

    // Title
    ctx.fillStyle = c.text;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    var metricLabel = state.metric === 'wer' ? 'Word Error Rate (%)' :
                      state.metric === 'speed' ? 'Relative Inference Speed' : 'Relative Peak Memory';
    ctx.fillText(metricLabel + ' @ ' + state.params + 'M params, ' + state.data + 'h data', WIDTH / 2, 16);

    // Y axis
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + chartH);
    ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
    ctx.stroke();

    // Y ticks
    var numTicks = 5;
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (var i = 0; i <= numTicks; i++) {
      var val = minVal + (maxVal - minVal) * (i / numTicks);
      var y = PAD.top + chartH - (val / maxVal) * chartH;
      ctx.fillText(val.toFixed(1), PAD.left - 5, y + 3);

      ctx.strokeStyle = 'rgba(148,163,184,0.1)';
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + chartW, y);
      ctx.stroke();
    }

    // Bars
    for (var i = 0; i < archs.length; i++) {
      var val = values[i];
      var barH = (val / maxVal) * chartH;
      var bx = PAD.left + i * barW + barPad;
      var bw = barW - barPad * 2;
      var by = PAD.top + chartH - barH;

      ctx.fillStyle = archColors[i];
      ctx.globalAlpha = 0.8;
      ctx.fillRect(bx, by, bw, barH);
      ctx.globalAlpha = 1;

      // Value label on bar
      ctx.fillStyle = c.text;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(val.toFixed(1), bx + bw / 2, by - 5);

      // Architecture label (with line breaks)
      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      var label = archLabels[archs[i]];
      var lines = label.split('\n');
      for (var li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], bx + bw / 2, PAD.top + chartH + 12 + li * 10);
      }

      // Bidir/causal flag
      var flags = archFlags[archs[i]];
      if (flags) {
        ctx.font = '6px "JetBrains Mono", monospace';
        ctx.fillStyle = flags.streaming ? 'rgba(74,222,128,0.7)' : 'rgba(251,146,60,0.7)';
        ctx.fillText(flags.streaming ? 'CAUSAL' : 'BIDIR', bx + bw / 2, PAD.top + chartH + 32);
      }
    }

    // ─── Fairness Meter ───
    var fmY = HEIGHT - 35;
    var fmW = WIDTH * 0.5;
    var fmX = (WIDTH - fmW) / 2;

    // Compute fairness score
    var fairness = computeFairness();
    var fairColor = fairness > 0.7 ? '#4ade80' : fairness > 0.4 ? '#f59e0b' : '#fb7185';
    var fairLabel = fairness > 0.7 ? 'Fair Comparison' : fairness > 0.4 ? 'Caveats Apply' : 'Misleading';

    // Background
    ctx.fillStyle = 'rgba(148,163,184,0.1)';
    ctx.fillRect(fmX, fmY, fmW, 14);

    // Fill
    ctx.fillStyle = fairColor;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(fmX, fmY, fmW * fairness, 14);
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = fairColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(fmX, fmY, fmW, 14);

    // Label
    ctx.fillStyle = c.text;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Fairness: ' + fairLabel + ' (' + Math.round(fairness * 100) + '%)', WIDTH / 2, fmY + 11);

    // Arrow indicator for "better direction"
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(lowerBetter ? '\u2193 lower = better' : '\u2191 higher = better', WIDTH - PAD.right, PAD.top - 5);
  }

  function computeFairness() {
    // Fairness heuristic based on controlled variables
    var score = 0.5; // Baseline

    // Same parameter budget → +0.2
    score += 0.2;

    // Same data → +0.15
    if (state.data === 960) score += 0.1; // Standard benchmark
    else score += 0.15;

    // Bidir vs causal mix → -0.15
    score -= 0.1;

    // Higher params → fairer (gap narrows)
    if (state.params >= 100) score += 0.1;

    return Math.max(0.2, Math.min(1.0, score));
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
