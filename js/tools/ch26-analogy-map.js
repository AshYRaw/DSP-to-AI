/* ============================================================
   Tool 26.1 — Analogy Map
   Interactive grid of all DSP↔AI analogies, color-coded by strength.
   Click cells for details. Links back to relevant chapters.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.AnalogyMap = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;
  var containerEl;
  var selectedIdx = -1;

  var state = { filter: 'all' };

  var analogies = [
    { dsp: 'Cross-correlation', ai: 'Linear Attention (QK\u1D40)', strength: 'exact',
      chapter: 'Ch 14, 17', holds: 'Linear attention = weighted cross-correlation in projected space.',
      breaks: 'Only exact without softmax.', resolution: 'Present linear attention as the true matched filter analogue.' },
    { dsp: 'S4 / LTI SSM', ai: 'IIR Filter', strength: 'exact',
      chapter: 'Ch 18', holds: 'H(z) = C(zI-A)\u207B\u00B9B + D is literally an IIR transfer function.',
      breaks: 'Only for time-invariant (S4), not time-varying (Mamba).', resolution: 'Clearly delineate S4 (exact) vs Mamba (approximate).' },
    { dsp: 'Convolution mode', ai: 'FIR Approximation', strength: 'exact',
      chapter: 'Ch 18', holds: 'Truncated kernel K\u0304 * u is exactly FIR filtering.',
      breaks: 'Truncation introduces approximation error for long dependencies.', resolution: 'FIR truncation of IIR — a standard DSP technique.' },
    { dsp: 'Mamba ICL', ai: 'LMS Adaptive Filter', strength: 'exact',
      chapter: 'Ch 8, 26', holds: 'Mamba\'s in-context learning = online gradient descent = LMS.',
      breaks: 'Transformer does batch GD (different convergence properties).', resolution: 'The strongest DSP analogy — verified by recent ICL theory.' },
    { dsp: 'Softmax Attention', ai: 'Competitive Matched Filter', strength: 'approximate',
      chapter: 'Ch 14, 17, 24', holds: 'Pre-softmax logits are bilinear similarity (like correlation).',
      breaks: 'Softmax couples all positions; not classical matched filtering.', resolution: 'Structural analogy, not equivalence. Linear attention is the exact limit.' },
    { dsp: 'Mamba (LTV SSM)', ai: 'Adaptive IIR / Kalman', strength: 'approximate',
      chapter: 'Ch 19, 24', holds: '"Frozen" H_t(z) gives instantaneous filter view.',
      breaks: 'No single H(z) for time-varying system.', resolution: 'Kalman filter is the better DSP analogue than fixed IIR.' },
    { dsp: 'HiPPO poles', ai: 'Butterworth poles', strength: 'approximate',
      chapter: 'Ch 18, 24', holds: 'Both are principled pole placement methodologies.',
      breaks: 'Different optimization spaces (approximation theory vs frequency domain).', resolution: 'Shared methodology, different objectives. HiPPO-FouT is the bridge.' },
    { dsp: 'FIR = Attention', ai: 'IIR = Mamba', strength: 'approximate',
      chapter: 'Ch 20, 24', holds: 'Captures essential computational tradeoff (O(n²) vs O(n)).',
      breaks: 'KV-cache makes attention recursive; Mamba\'s "infinite memory" is lossy.', resolution: 'First-order approximation — use explicit/compressed memory framework.' },
    { dsp: 'Filter bank', ai: 'Multi-head attention', strength: 'approximate',
      chapter: 'Ch 8, 16', holds: 'Multiple parallel analysis channels extracting different features.',
      breaks: 'Attention heads aren\'t frequency bands.', resolution: 'Structural parallel — multi-channel analysis.' },
    { dsp: 'Sampling / Nyquist', ai: 'Tokenization', strength: 'approximate',
      chapter: 'Ch 1, 16', holds: 'Both convert continuous to discrete; information loss if too coarse.',
      breaks: 'Tokenization is not uniform sampling; no exact Nyquist theorem.', resolution: 'Conceptual parallel — both need sufficient resolution.' },
    { dsp: 'Transfer function H(z)', ai: 'Mamba (LTV)', strength: 'breaks',
      chapter: 'Ch 24', holds: 'N/A — H(z) doesn\'t exist for time-varying systems.',
      breaks: 'Mamba\'s input-dependent parameters break time-invariance assumption.', resolution: 'Use "frozen H_t(z)" or Lyapunov analysis instead.' },
    { dsp: 'BIBO Stability', ai: 'Mamba Stability', strength: 'breaks',
      chapter: 'Ch 24', holds: 'N/A — eigenvalue conditions insufficient for LTV.',
      breaks: 'LTV stability requires Lyapunov exponents, not pole magnitudes.', resolution: 'Mamba proven stable by construction (ICLR 2025); exponents always non-positive.' },
    { dsp: 'IIR infinite memory', ai: 'Mamba state', strength: 'breaks',
      chapter: 'Ch 24', holds: 'N/A — Mamba\'s fixed-size state is a lossy bottleneck.',
      breaks: 'N=16 state ≈ 512 bits of past, regardless of sequence length.', resolution: 'Mamba = lossy IIR with information bottleneck. Different from deterministic IIR.' },
  ];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Analogy map showing all DSP to AI analogies');
    canvas.style.cursor = 'pointer';
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    wrapper.appendChild(canvas);

    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var mx = (e.clientX - rect.left);
      var my = (e.clientY - rect.top);
      handleClick(mx, my);
    });

    var filterEl = containerEl.querySelector('[data-control="am-filter"]');
    if (filterEl) {
      filterEl.addEventListener('change', function () {
        state.filter = this.value;
        selectedIdx = -1;
        render();
      });
    }

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(480, Math.min(600, WIDTH * 0.7));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }

    window.addEventListener('resize', resize);
    resize();
  }

  var cellRects = [];

  function getFiltered() {
    if (state.filter === 'all') return analogies;
    return analogies.filter(function (a) { return a.strength === state.filter; });
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);
    cellRects = [];

    var items = getFiltered();
    var PAD = 12;
    var detailH = selectedIdx >= 0 ? 100 : 0;
    var gridH = HEIGHT - PAD * 2 - detailH - 20;

    var cols = Math.min(4, items.length);
    var rows = Math.ceil(items.length / cols);
    var cellW = (WIDTH - PAD * 2) / cols;
    var cellH = Math.min(gridH / rows, 80);

    // Title
    ctx.fillStyle = c.text;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DSP \u2194 AI Analogy Map', WIDTH / 2, PAD + 8);

    // Legend
    var legY = PAD + 4;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    drawLegendDot(PAD, legY, '#4ade80', 'Exact', c);
    drawLegendDot(PAD + 70, legY, '#f59e0b', 'Approximate', c);
    drawLegendDot(PAD + 170, legY, '#fb7185', 'Breaks', c);

    var startY = PAD + 22;

    for (var i = 0; i < items.length; i++) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var x = PAD + col * cellW;
      var y = startY + row * cellH;

      var item = items[i];
      var color = item.strength === 'exact' ? '#4ade80' :
                  item.strength === 'approximate' ? '#f59e0b' : '#fb7185';

      var isSelected = (i === selectedIdx);

      // Cell background
      ctx.fillStyle = isSelected ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.05)';
      ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

      // Cell border
      ctx.strokeStyle = isSelected ? color : 'rgba(148,163,184,0.15)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);

      // Strength indicator
      ctx.fillStyle = color;
      ctx.fillRect(x + 4, y + 4, 3, cellH - 8);

      // DSP side
      ctx.fillStyle = c.dsp;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      var dspText = truncate(item.dsp, cellW - 20);
      ctx.fillText(dspText, x + 12, y + 20);

      // Arrow
      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('\u2194', x + 12, y + 33);

      // AI side
      ctx.fillStyle = c.ai;
      ctx.font = '9px "JetBrains Mono", monospace';
      var aiText = truncate(item.ai, cellW - 20);
      ctx.fillText(aiText, x + 22, y + 33);

      // Chapter reference
      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.fillText(item.chapter, x + 12, y + cellH - 8);

      // Strength badge
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.font = 'bold 6px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(item.strength.toUpperCase(), x + cellW - 8, y + 14);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';

      cellRects.push({ x: x + 2, y: y + 2, w: cellW - 4, h: cellH - 4, idx: i });
    }

    // Detail panel
    if (selectedIdx >= 0 && selectedIdx < items.length) {
      var sel = items[selectedIdx];
      var dY = startY + rows * cellH + 8;

      ctx.fillStyle = 'rgba(148,163,184,0.06)';
      ctx.fillRect(PAD, dY, WIDTH - PAD * 2, detailH);
      ctx.strokeStyle = 'rgba(148,163,184,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(PAD, dY, WIDTH - PAD * 2, detailH);

      var color = sel.strength === 'exact' ? '#4ade80' :
                  sel.strength === 'approximate' ? '#f59e0b' : '#fb7185';

      ctx.fillStyle = color;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(sel.dsp + ' \u2194 ' + sel.ai + '  [' + sel.strength.toUpperCase() + ']', PAD + 8, dY + 18);

      ctx.fillStyle = c.text;
      ctx.font = '9px "Outfit", sans-serif';
      ctx.fillText('Holds: ' + sel.holds, PAD + 8, dY + 38);

      ctx.fillStyle = c.textDim;
      ctx.fillText('Breaks: ' + sel.breaks, PAD + 8, dY + 56);

      ctx.fillStyle = '#f59e0b';
      ctx.fillText('Resolution: ' + sel.resolution, PAD + 8, dY + 74);

      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('Reference: ' + sel.chapter, PAD + 8, dY + 92);
    }
  }

  function drawLegendDot(x, y, color, label, c) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = c.textDim;
    ctx.fillText(label, x + 12, y + 7);
  }

  function truncate(str, maxW) {
    // Simple character limit
    var maxChars = Math.floor(maxW / 6);
    if (str.length <= maxChars) return str;
    return str.substring(0, maxChars - 2) + '..';
  }

  function handleClick(mx, my) {
    for (var i = 0; i < cellRects.length; i++) {
      var r = cellRects[i];
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        selectedIdx = (selectedIdx === r.idx) ? -1 : r.idx;
        render();
        return;
      }
    }
    selectedIdx = -1;
    render();
  }

  return { init: init };
})();
