/* ============================================================
   Tool 22.1 — Hybrid Architecture Designer
   Configure layers, attention ratio, placement, context length.
   Visualize: layer stack, compute cost, memory, capability.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.HybridDesigner = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;

  var state = {
    totalLayers: 32,
    attnRatio: 12,     // percent
    placement: 'even',
    context: 262144
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Hybrid architecture designer showing layer composition, compute, and memory');
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

    bindSelect(containerEl, 'hd-layers', function (v) { state.totalLayers = parseInt(v, 10); render(); });
    bindSlider(containerEl, 'hd-ratio', function (v) { state.attnRatio = parseInt(v, 10); render(); });
    bindSelect(containerEl, 'hd-placement', function (v) { state.placement = v; render(); });
    bindSelect(containerEl, 'hd-context', function (v) { state.context = parseInt(v, 10); render(); });

    resize();
  }

  function getLayerTypes() {
    var L = state.totalLayers;
    var numAttn = Math.round(L * state.attnRatio / 100);
    var layers = [];

    // Initialize all as SSM
    for (var i = 0; i < L; i++) layers.push('ssm');

    if (numAttn === 0) return layers;
    if (numAttn >= L) {
      for (var i = 0; i < L; i++) layers[i] = 'attn';
      return layers;
    }

    if (state.placement === 'even') {
      var spacing = Math.floor(L / numAttn);
      for (var i = 0; i < numAttn; i++) {
        var idx = Math.min(Math.round(spacing * (i + 0.5)), L - 1);
        layers[idx] = 'attn';
      }
    } else if (state.placement === 'late') {
      for (var i = 0; i < numAttn; i++) {
        layers[L - 1 - i] = 'attn';
      }
    } else if (state.placement === 'middle') {
      var start = Math.floor((L - numAttn) / 2);
      for (var i = 0; i < numAttn; i++) {
        layers[start + i] = 'attn';
      }
    } else { // custom (Jamba-style: skip first few, then every 8th)
      var placed = 0;
      for (var i = Math.floor(L * 0.25); i < L && placed < numAttn; i += Math.max(1, Math.floor(L / numAttn))) {
        layers[i] = 'attn';
        placed++;
      }
    }
    return layers;
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var layers = getLayerTypes();
    var L = layers.length;
    var numAttn = layers.filter(function (l) { return l === 'attn'; }).length;
    var numSSM = L - numAttn;

    var PAD = 14;

    // ─── Left: Layer Stack Visualization ───
    var stackW = Math.min(180, WIDTH * 0.22);
    var stackX = PAD;
    var stackY = PAD + 18;
    var stackH = HEIGHT - stackY - 40;
    var layerH = Math.min(stackH / L, 18);

    ctx.fillStyle = c.text;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LAYER STACK (' + L + ' layers)', stackX, PAD + 10);

    for (var i = 0; i < L; i++) {
      var ly = stackY + i * layerH;
      var isAttn = layers[L - 1 - i] === 'attn'; // render top-down

      ctx.fillStyle = isAttn ? 'rgba(96,165,250,0.5)' : 'rgba(74,222,128,0.25)';
      ctx.fillRect(stackX, ly, stackW, layerH - 1);

      ctx.strokeStyle = isAttn ? '#60a5fa' : '#4ade80';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(stackX, ly, stackW, layerH - 1);

      // Layer label
      if (layerH >= 10) {
        ctx.fillStyle = isAttn ? '#60a5fa' : '#4ade80';
        ctx.font = '6px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isAttn ? 'ATTN' : 'SSM', stackX + stackW / 2, ly + layerH / 2 + 2);
      }
    }

    // Legend
    var legY = stackY + L * layerH + 8;
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(stackX, legY, 10, 8);
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Attention (' + numAttn + ')', stackX + 14, legY + 7);

    ctx.fillStyle = '#4ade80';
    ctx.fillRect(stackX + stackW / 2, legY, 10, 8);
    ctx.fillStyle = c.textDim;
    ctx.fillText('SSM (' + numSSM + ')', stackX + stackW / 2 + 14, legY + 7);

    // ─── Right: Metrics ───
    var metricsX = stackX + stackW + 24;
    var metricsW = WIDTH - metricsX - PAD;

    // Compute metrics
    var T = state.context;
    var d = 1024;
    var N = 16;
    var W = 4096; // sliding window for attention

    var pureAttnFlops = L * (2 * T * T * d + 4 * T * d * d);
    var pureSSMFlops = L * T * d * 2 * N;
    var hybridFlops = numSSM * T * d * 2 * N + numAttn * (2 * T * W * d + 4 * T * d * d);

    var pureAttnMem = L * 2 * T * d; // KV cache
    var pureSSMMem = L * d * N;
    var hybridMem = numSSM * d * N + numAttn * 2 * W * d;

    // ── Compute comparison ──
    ctx.fillStyle = c.text;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('COMPUTE (FLOPs/token at T=' + formatNum(T) + ')', metricsX, PAD + 10);

    var barY = PAD + 20;
    var barH = 22;
    var maxFlops = pureAttnFlops;

    drawMetricBar(metricsX, barY, metricsW, barH, 'Pure Attention', pureAttnFlops, maxFlops, '#60a5fa');
    drawMetricBar(metricsX, barY + barH + 6, metricsW, barH, 'Your Hybrid', hybridFlops, maxFlops, c.bridge);
    drawMetricBar(metricsX, barY + (barH + 6) * 2, metricsW, barH, 'Pure SSM', pureSSMFlops, maxFlops, '#4ade80');

    // Savings
    var savings = ((1 - hybridFlops / pureAttnFlops) * 100);
    ctx.fillStyle = c.bridge;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Compute savings: ' + savings.toFixed(0) + '% vs pure attention', metricsX, barY + (barH + 6) * 3 + 4);

    // ── Memory comparison ──
    var memSectionY = barY + (barH + 6) * 3 + 22;

    ctx.fillStyle = c.text;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillText('INFERENCE MEMORY (KV-cache + state)', metricsX, memSectionY);

    var memBarY = memSectionY + 12;
    var maxMem = pureAttnMem;

    drawMetricBar(metricsX, memBarY, metricsW, barH, 'Pure Attention', pureAttnMem, maxMem, '#60a5fa');
    drawMetricBar(metricsX, memBarY + barH + 6, metricsW, barH, 'Your Hybrid', hybridMem, maxMem, c.bridge);
    drawMetricBar(metricsX, memBarY + (barH + 6) * 2, metricsW, barH, 'Pure SSM', pureSSMMem, maxMem, '#4ade80');

    var memSavings = ((1 - hybridMem / pureAttnMem) * 100);
    ctx.fillStyle = c.bridge;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.fillText('Memory savings: ' + memSavings.toFixed(0) + '% vs pure attention', metricsX, memBarY + (barH + 6) * 3 + 4);

    // ── Capability profile ──
    var capY = memBarY + (barH + 6) * 3 + 22;

    ctx.fillStyle = c.text;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillText('CAPABILITY PROFILE', metricsX, capY);

    var capabilities = [
      { name: 'Retrieval', score: Math.min(1, numAttn / (L * 0.15)) },
      { name: 'Long-Range', score: numSSM > 0 ? Math.min(1, numSSM / (L * 0.5)) : 0.3 },
      { name: 'Efficiency', score: 1 - state.attnRatio / 100 },
      { name: 'Edge-Ready', score: numAttn === 0 ? 1.0 : Math.max(0, 1 - numAttn / (L * 0.2)) }
    ];

    var capBarY = capY + 12;
    var capBarH = 14;
    var capBarW = metricsW * 0.5;

    for (var i = 0; i < capabilities.length; i++) {
      var cap = capabilities[i];
      var cy = capBarY + i * (capBarH + 6);

      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(cap.name, metricsX, cy + capBarH - 3);

      // Background bar
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(metricsX + 70, cy, capBarW, capBarH);

      // Score bar
      var barColor = cap.score > 0.7 ? '#4ade80' : cap.score > 0.4 ? '#fbbf24' : '#fb7185';
      ctx.fillStyle = barColor;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(metricsX + 70, cy, capBarW * cap.score, capBarH);
      ctx.globalAlpha = 1;

      // Score text
      ctx.fillStyle = c.text;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText((cap.score * 100).toFixed(0) + '%', metricsX + 74 + capBarW * cap.score, cy + capBarH - 3);
    }

    // ─── Footer ───
    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DSP principle: cascade IIR (SSM) for efficiency + FIR (Attention) for precision. Ratio depends on task.', WIDTH / 2, HEIGHT - 8);
  }

  function drawMetricBar(x, y, maxW, h, label, value, maxValue, color) {
    var c = Plot.getColors();
    var barW = Math.max(2, (value / maxValue) * maxW * 0.75);

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(x, y, maxW * 0.75, h);

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x, y, barW, h);
    ctx.globalAlpha = 1;

    ctx.fillStyle = c.text;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label + ': ' + formatNum(value), x + 4, y + h / 2 + 2);
  }

  function formatNum(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'G';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = cont.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      if (disp) disp.textContent = this.value;
      callback(this.value);
    });
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
