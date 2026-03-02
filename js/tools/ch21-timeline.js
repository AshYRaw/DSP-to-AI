/* ============================================================
   Tool 21.1 — SSM Evolution Timeline Explorer
   Interactive timeline showing 5 eras of SSM development.
   Modes: timeline, complexity chart, DSP connections.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.Timeline = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;

  var state = {
    view: 'timeline',
    era: 'all'
  };

  var containerEl;

  var ERAS = [
    {
      label: 'Era 1: Foundations', year: '2020-21', color: '#22d3ee',
      milestones: [
        { name: 'HiPPO', year: '2020', desc: 'Optimal polynomial history compression', dsp: 'Optimal basis (like DFT for time)', complexity: 'N/A — theory' },
        { name: 'LSSL', year: '2021', desc: 'Conv-recurrence duality', dsp: 'IIR impulse response → FIR kernel', complexity: 'O(T²N²)' }
      ]
    },
    {
      label: 'Era 2: Architecture', year: '2022-23', color: '#fb923c',
      milestones: [
        { name: 'S4', year: '2022', desc: 'DPLR parameterization, first competitive SSM', dsp: 'Partial fraction expansion of H(z)', complexity: 'O(T log T)' },
        { name: 'S4D/DSS', year: '2022', desc: 'Diagonal A — massive simplification', dsp: 'Parallel 1st-order IIR sections', complexity: 'O(TN)' },
        { name: 'H3', year: '2023', desc: 'Gated SSM, identifies LTI limitation', dsp: 'Fixed filter can\'t select by content', complexity: 'O(TN)' }
      ]
    },
    {
      label: 'Era 3: Mamba', year: '2023-24', color: '#4ade80',
      milestones: [
        { name: 'Mamba (S6)', year: 'Dec 2023', desc: 'Input-dependent Δ,B,C — selective SSM', dsp: 'Adaptive IIR filter bank', complexity: 'O(TDN)' },
        { name: 'Mamba-2', year: 'May 2024', desc: 'SSM = structured masked attention', dsp: 'Semiseparable matrix structure', complexity: 'O(TDN), 2-8× faster' }
      ]
    },
    {
      label: 'Era 4: Hybrids', year: '2024', color: '#a78bfa',
      milestones: [
        { name: 'Jamba', year: '2024', desc: '1:7 attention:Mamba ratio, 52B', dsp: 'Cascaded FIR + IIR stages', complexity: 'Near O(T)' },
        { name: 'Griffin', year: '2024', desc: 'Gated LR + local attention', dsp: 'IIR + sliding-window FIR', complexity: 'O(TW)' },
        { name: 'Bamba', year: '2024', desc: 'Mamba-2 + 3 attention layers', dsp: 'Minimal FIR checkpoints', complexity: 'Near O(T)' }
      ]
    },
    {
      label: 'Era 5: Edge & Future', year: '2025+', color: '#fb7185',
      milestones: [
        { name: 'XAMBA/eMamba', year: '2025', desc: '260 tok/s on NPU, ASIC-optimized', dsp: 'Fixed-point DSP on embedded processors', complexity: 'O(TDN), INT8' },
        { name: 'Production Hybrids', year: '2025', desc: 'Jamba 1.5, Falcon Mamba, Phi-4-flash', dsp: 'Production DSP chains', complexity: 'Varies' }
      ]
    }
  ];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive SSM evolution timeline from HiPPO to Mamba-2');
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
      HEIGHT = Math.max(460, Math.min(560, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSelect(containerEl, 'tl-view', function (v) { state.view = v; render(); });
    bindSelect(containerEl, 'tl-era', function (v) { state.era = v; render(); });

    resize();
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    if (state.view === 'timeline') renderTimeline(c);
    else if (state.view === 'complexity') renderComplexity(c);
    else renderDSP(c);
  }

  function renderTimeline(c) {
    var PAD = 14;
    var eras = getFilteredEras();
    var eraH = (HEIGHT - PAD * 2 - 20) / eras.length;

    // Title
    ctx.fillStyle = c.text;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SSM EVOLUTION TIMELINE', PAD, PAD + 10);

    // Timeline spine
    var spineX = PAD + 100;
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(spineX, PAD + 20);
    ctx.lineTo(spineX, HEIGHT - PAD);
    ctx.stroke();

    for (var e = 0; e < eras.length; e++) {
      var era = eras[e];
      var eraY = PAD + 22 + e * eraH;

      // Era marker
      ctx.fillStyle = era.color;
      ctx.beginPath();
      ctx.arc(spineX, eraY + 8, 6, 0, Math.PI * 2);
      ctx.fill();

      // Era label
      ctx.fillStyle = era.color;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(era.year, spineX - 14, eraY + 11);

      // Era title
      ctx.fillStyle = era.color;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(era.label, spineX + 14, eraY + 11);

      // Milestones
      var msW = WIDTH - spineX - 30;
      var msH = Math.max(16, (eraH - 18) / era.milestones.length);

      for (var m = 0; m < era.milestones.length; m++) {
        var ms = era.milestones[m];
        var msY = eraY + 18 + m * msH;

        // Connector
        ctx.strokeStyle = era.color;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(spineX + 6, msY + 6);
        ctx.lineTo(spineX + 24, msY + 6);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Milestone dot
        ctx.fillStyle = era.color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(spineX + 24, msY + 6, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Name
        ctx.fillStyle = c.text;
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(ms.name + ' (' + ms.year + ')', spineX + 32, msY + 6);

        // Description
        ctx.fillStyle = c.textDim;
        ctx.font = '7px "JetBrains Mono", monospace';
        var descW = msW - 40;
        var desc = ms.desc;
        if (ctx.measureText(desc).width > descW) {
          desc = desc.substring(0, Math.floor(descW / 4.5)) + '...';
        }
        ctx.fillText(desc, spineX + 32, msY + 16);
      }
    }
  }

  function renderComplexity(c) {
    var PAD = 14;

    ctx.fillStyle = c.text;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('COMPLEXITY EVOLUTION', PAD, PAD + 10);

    // Models on a complexity scale
    var models = [
      { name: 'LSSL (2021)', complexity: 5, era: 0, training: 'O(T²N²)', inference: 'O(N²)' },
      { name: 'S4 (2022)', complexity: 3.5, era: 1, training: 'O(T log T)', inference: 'O(N)' },
      { name: 'S4D (2022)', complexity: 2.5, era: 1, training: 'O(TN)', inference: 'O(N)' },
      { name: 'H3 (2023)', complexity: 2.5, era: 1, training: 'O(TN)', inference: 'O(N)' },
      { name: 'Mamba (2023)', complexity: 2, era: 2, training: 'O(TDN)', inference: 'O(DN)' },
      { name: 'Mamba-2 (2024)', complexity: 1.5, era: 2, training: 'O(TDN)', inference: 'O(DN)' },
      { name: 'Jamba (2024)', complexity: 1.8, era: 3, training: '~O(T)', inference: '~O(1)' },
      { name: 'Edge SSM (2025)', complexity: 1.2, era: 4, training: 'O(TDN)', inference: 'O(DN) INT8' }
    ];

    // Reference: Transformer
    var chartY = PAD + 28;
    var chartH = HEIGHT - chartY - 50;
    var chartX = PAD + 90;
    var chartW = WIDTH - chartX - PAD - 10;

    // Y-axis: complexity (log scale, 1=best, 5=worst)
    // X-axis: timeline position
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX, chartY + chartH);
    ctx.lineTo(chartX + chartW, chartY + chartH);
    ctx.stroke();

    // Transformer reference line
    ctx.strokeStyle = 'rgba(251,113,133,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    var transY = chartY + 10;
    ctx.beginPath();
    ctx.moveTo(chartX, transY);
    ctx.lineTo(chartX + chartW, transY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fb7185';
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Transformer O(T²d)', chartX + chartW - 100, transY - 4);

    // Labels
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Higher cost', chartX - 6, chartY + 10);
    ctx.fillText('Lower cost', chartX - 6, chartY + chartH);
    ctx.textAlign = 'center';
    ctx.fillText('2021', chartX, chartY + chartH + 12);
    ctx.fillText('2025+', chartX + chartW, chartY + chartH + 12);

    // Plot models
    var eraColors = ERAS.map(function (e) { return e.color; });
    ctx.beginPath();
    ctx.strokeStyle = c.bridge;
    ctx.lineWidth = 1.5;

    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var px = chartX + (i / (models.length - 1)) * chartW;
      var py = chartY + (1 - (5 - m.complexity) / 4) * chartH;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var px = chartX + (i / (models.length - 1)) * chartW;
      var py = chartY + (1 - (5 - m.complexity) / 4) * chartH;

      ctx.fillStyle = eraColors[m.era];
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = c.text;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = i % 2 === 0 ? 'left' : 'right';
      var labelX = i % 2 === 0 ? px + 8 : px - 8;
      ctx.fillText(m.name, labelX, py - 6);

      ctx.fillStyle = c.textDim;
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.fillText('Train: ' + m.training, labelX, py + 6);
      ctx.fillText('Infer: ' + m.inference, labelX, py + 14);
    }

    // Arrow showing trend
    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↓ Complexity drops with each generation — rediscovering DSP efficiency', chartX + chartW / 2, HEIGHT - 12);
  }

  function renderDSP(c) {
    var PAD = 14;

    ctx.fillStyle = c.text;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DSP CONNECTIONS — Every SSM Breakthrough Has a DSP Ancestor', PAD, PAD + 10);

    var eras = getFilteredEras();
    var rowH = (HEIGHT - PAD * 2 - 30) / Math.max(countMilestones(eras), 1);
    rowH = Math.min(rowH, 50);

    var nameX = PAD + 10;
    var arrowX = WIDTH * 0.38;
    var dspX = WIDTH * 0.42;

    // Headers
    ctx.fillStyle = c.ai;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('AI MILESTONE', nameX, PAD + 24);
    ctx.fillStyle = c.dsp;
    ctx.fillText('DSP ORIGIN', dspX, PAD + 24);

    var y = PAD + 36;
    for (var e = 0; e < eras.length; e++) {
      var era = eras[e];
      for (var m = 0; m < era.milestones.length; m++) {
        var ms = era.milestones[m];

        // Name
        ctx.fillStyle = era.color;
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(ms.name, nameX, y + 8);

        // Arrow
        ctx.strokeStyle = c.bridge;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(arrowX - 20, y + 5);
        ctx.lineTo(arrowX, y + 5);
        ctx.stroke();
        // Arrow head
        ctx.beginPath();
        ctx.moveTo(arrowX, y + 5);
        ctx.lineTo(arrowX - 4, y + 2);
        ctx.lineTo(arrowX - 4, y + 8);
        ctx.fill();
        ctx.globalAlpha = 1;

        // DSP connection
        ctx.fillStyle = c.dsp;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        var dspText = ms.dsp;
        var maxDspW = WIDTH - dspX - PAD;
        if (ctx.measureText(dspText).width > maxDspW) {
          dspText = dspText.substring(0, Math.floor(maxDspW / 4.5)) + '...';
        }
        ctx.fillText(dspText, dspX, y + 8);

        // Separator
        ctx.strokeStyle = 'rgba(148,163,184,0.1)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(nameX, y + rowH - 4);
        ctx.lineTo(WIDTH - PAD, y + rowH - 4);
        ctx.stroke();

        y += rowH;
      }
    }

    // Footer
    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('The SSM revolution = ML community rediscovering signal processing, then extending it with gradient-based learning.', WIDTH / 2, HEIGHT - 10);
  }

  function getFilteredEras() {
    if (state.era === 'all') return ERAS;
    var idx = parseInt(state.era, 10);
    return [ERAS[idx]];
  }

  function countMilestones(eras) {
    var count = 0;
    for (var e = 0; e < eras.length; e++) count += eras[e].milestones.length;
    return count;
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
