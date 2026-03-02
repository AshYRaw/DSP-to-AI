/* ============================================================
   Tool 15.1 — Transformer Block Explorer
   Interactive architecture diagram of a Transformer block.
   Click components to expand, step through data flow,
   see tensor shapes at each stage.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.TransformerBlock = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 600;
  var PAD = { top: 10, right: 10, bottom: 10, left: 10 };

  // Transformer parameters
  var T = 5;          // sequence length
  var dModel = 8;     // model dimension
  var dFF = 16;       // feedforward hidden dim
  var numHeads = 2;

  var state = {
    step: 0,          // current step in forward pass
    maxSteps: 7,      // 0:input, 1:pos-enc, 2:self-attn, 3:add&norm1, 4:ffn, 5:add&norm2, 6:output
    hoveredBlock: -1,
    showEncoder: true
  };

  var stepLabels = [
    'Input Embeddings',
    'Add Positional Encoding',
    'Multi-Head Self-Attention',
    'Add & Layer Norm',
    'Feed-Forward Network',
    'Add & Layer Norm',
    'Block Output'
  ];

  var stepDescriptions = [
    'Token embeddings: each token mapped to a ' + dModel + '-dim vector. Shape: [' + T + ' x ' + dModel + ']',
    'Sinusoidal position info added element-wise. Each position gets a unique pattern. Shape: [' + T + ' x ' + dModel + ']',
    numHeads + ' heads, d_k=' + (dModel / numHeads) + ' each. QK\u1D40/\u221Ad_k \u2192 softmax \u2192 weighted V. Shape: [' + T + ' x ' + dModel + ']',
    'Residual connection (skip) + layer normalization. x + Attention(x), then normalize. Shape: [' + T + ' x ' + dModel + ']',
    'Two linear layers with ReLU: ' + dModel + ' \u2192 ' + dFF + ' \u2192 ' + dModel + '. Applied identically to each position. Shape: [' + T + ' x ' + dModel + ']',
    'Second residual + layer norm. x + FFN(x), then normalize. Shape: [' + T + ' x ' + dModel + ']',
    'Output of one Transformer block. Feed into the next block or to the final layer. Shape: [' + T + ' x ' + dModel + ']'
  ];

  // Simulated tensor data (for visualization)
  var tensors = [];

  var containerEl;

  // Block layout rectangles for hit-testing
  var blocks = [];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Transformer block data flow explorer');
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
      HEIGHT = Math.max(540, Math.min(640, WIDTH * 0.75));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      computeTensors();
      render();
    }
    window.addEventListener('resize', resize);

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var mx = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
      var my = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
      var hovered = -1;
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          hovered = i;
          break;
        }
      }
      if (hovered !== state.hoveredBlock) {
        state.hoveredBlock = hovered;
        render();
      }
    });

    canvas.addEventListener('click', function (e) {
      if (state.hoveredBlock >= 0) {
        state.step = state.hoveredBlock;
        render();
      }
    });

    var nextBtn = containerEl.querySelector('[data-action="tf-next"]');
    if (nextBtn) nextBtn.addEventListener('click', function () {
      state.step = Math.min(state.step + 1, state.maxSteps - 1);
      render();
    });

    var prevBtn = containerEl.querySelector('[data-action="tf-prev"]');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      state.step = Math.max(state.step - 1, 0);
      render();
    });

    var resetBtn = containerEl.querySelector('[data-action="tf-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      state.step = 0;
      render();
    });

    computeTensors();
    resize();
  }

  function computeTensors() {
    var rng = mulberry32(42);
    tensors = [];
    for (var s = 0; s < state.maxSteps; s++) {
      var mat = [];
      for (var i = 0; i < T; i++) {
        var row = [];
        for (var j = 0; j < dModel; j++) {
          row.push((rng() - 0.5) * 2);
        }
        mat.push(row);
      }
      // Layer norm steps: reduce variance
      if (s === 3 || s === 5) {
        for (var i = 0; i < T; i++) {
          var mean = 0;
          for (var j = 0; j < dModel; j++) mean += mat[i][j];
          mean /= dModel;
          var variance = 0;
          for (var j = 0; j < dModel; j++) variance += (mat[i][j] - mean) * (mat[i][j] - mean);
          variance /= dModel;
          var std = Math.sqrt(variance + 1e-5);
          for (var j = 0; j < dModel; j++) mat[i][j] = (mat[i][j] - mean) / std;
        }
      }
      tensors.push(mat);
    }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    blocks = [];

    // Layout
    var diagramX = PAD.left + 15;
    var diagramW = WIDTH * 0.42;
    var detailX = diagramX + diagramW + 30;
    var detailW = WIDTH - detailX - PAD.right;

    // ─── Left: Architecture Diagram ───
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TRANSFORMER BLOCK', diagramX, PAD.top + 14);
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('click components to inspect', diagramX, PAD.top + 28);

    var blockH = 44;
    var gap = 10;
    var totalH = state.maxSteps * blockH + (state.maxSteps - 1) * gap;
    var startY = PAD.top + 44;
    var blockW = diagramW - 20;
    var blockX = diagramX + 10;

    // Block colors
    var blockColors = [
      { bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.5)', label: 'Input Embed' },
      { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.5)', label: '+ Pos Encoding' },
      { bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.5)', label: 'Multi-Head Attn' },
      { bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.5)', label: 'Add & LayerNorm' },
      { bg: 'rgba(251,113,133,0.15)', border: 'rgba(251,113,133,0.5)', label: 'Feed-Forward' },
      { bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.5)', label: 'Add & LayerNorm' },
      { bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.5)', label: 'Block Output' }
    ];

    for (var i = 0; i < state.maxSteps; i++) {
      var by = startY + i * (blockH + gap);
      var bc = blockColors[i];
      var isActive = (i <= state.step);
      var isHovered = (i === state.hoveredBlock);
      var isCurrent = (i === state.step);

      blocks.push({ x: blockX, y: by, w: blockW, h: blockH });

      // Background
      ctx.fillStyle = isActive ? bc.bg : 'rgba(128,128,128,0.05)';
      ctx.fillRect(blockX, by, blockW, blockH);

      // Border
      ctx.strokeStyle = isCurrent ? bc.border : (isHovered ? 'rgba(255,255,255,0.3)' : 'rgba(128,128,128,0.15)');
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.strokeRect(blockX, by, blockW, blockH);

      // Step number
      ctx.fillStyle = isActive ? c.text : c.textDim;
      ctx.font = (isCurrent ? 'bold ' : '') + '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(i + ': ' + bc.label, blockX + 8, by + 18);

      // Shape annotation
      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('[' + T + ' x ' + dModel + ']', blockX + blockW - 8, by + 18);

      // DSP analogy
      var dspNotes = [
        'signal samples',
        'time encoding',
        'FIR filter bank',
        'skip + AGC',
        'pointwise filter',
        'skip + AGC',
        'processed signal'
      ];
      ctx.fillStyle = c.bridge;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('DSP: ' + dspNotes[i], blockX + 8, by + 34);

      // Arrow between blocks
      if (i < state.maxSteps - 1) {
        var arrowY = by + blockH;
        ctx.strokeStyle = isActive ? 'rgba(255,255,255,0.3)' : 'rgba(128,128,128,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(blockX + blockW / 2, arrowY + 1);
        ctx.lineTo(blockX + blockW / 2, arrowY + gap - 1);
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(blockX + blockW / 2 - 3, arrowY + gap - 4);
        ctx.lineTo(blockX + blockW / 2, arrowY + gap - 1);
        ctx.lineTo(blockX + blockW / 2 + 3, arrowY + gap - 4);
        ctx.stroke();
      }

      // Residual connections (skip arrows for steps 2→3 and 4→5)
      if (i === 3 || i === 5) {
        var skipFrom = i - 2;
        var fromY = startY + skipFrom * (blockH + gap) + blockH / 2;
        var toY = by + blockH / 2;
        var skipX = blockX + blockW + 6;

        ctx.strokeStyle = isActive ? 'rgba(251,191,36,0.4)' : 'rgba(128,128,128,0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(blockX + blockW, fromY);
        ctx.lineTo(skipX, fromY);
        ctx.lineTo(skipX, toY);
        ctx.lineTo(blockX + blockW, toY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        if (isActive) {
          ctx.fillStyle = 'rgba(251,191,36,0.6)';
          ctx.font = '7px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.save();
          ctx.translate(skipX + 4, (fromY + toY) / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText('residual', 0, 0);
          ctx.restore();
        }
      }
    }

    // Data flow animation indicator
    if (state.step < state.maxSteps - 1) {
      var activeY = startY + state.step * (blockH + gap) + blockH;
      ctx.fillStyle = c.ai;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(blockX + blockW / 2, activeY + gap / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ─── Right: Detail Panel ───
    if (detailW < 100) return;

    ctx.fillStyle = c.text;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Step ' + state.step + ': ' + stepLabels[state.step], detailX, PAD.top + 14);

    // Description
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    wrapText(ctx, stepDescriptions[state.step], detailX, PAD.top + 32, detailW, 13);

    // Tensor heatmap
    var tensorY = PAD.top + 90;
    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('Tensor values:', detailX, tensorY);

    var mat = tensors[state.step];
    var cellW = Math.min(22, (detailW - 40) / dModel);
    var cellH = Math.min(22, 110 / T);
    var heatX = detailX;
    var heatY = tensorY + 24;

    // Row labels (tokens)
    var tokenNames = ['tok_0', 'tok_1', 'tok_2', 'tok_3', 'tok_4'];
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (var i = 0; i < T; i++) {
      ctx.fillStyle = c.textDim;
      ctx.fillText(tokenNames[i], heatX - 4, heatY + i * cellH + cellH / 2 + 3);
    }

    // Column labels (dimensions)
    ctx.textAlign = 'center';
    for (var j = 0; j < dModel; j++) {
      ctx.fillStyle = c.textDim;
      ctx.fillText('d' + j, heatX + j * cellW + cellW / 2, heatY - 4);
    }

    // Heatmap cells
    for (var i = 0; i < T; i++) {
      for (var j = 0; j < dModel; j++) {
        var val = mat[i][j];
        var norm = (val + 2) / 4; // map [-2,2] to [0,1]
        norm = Math.max(0, Math.min(1, norm));

        // Blue-white-red diverging colormap
        var r, g, b;
        if (norm < 0.5) {
          var t = norm * 2;
          r = Math.floor(30 + 90 * t);
          g = Math.floor(60 + 100 * t);
          b = Math.floor(180 + 75 * t);
        } else {
          var t = (norm - 0.5) * 2;
          r = Math.floor(120 + 135 * t);
          g = Math.floor(160 - 80 * t);
          b = Math.floor(255 - 175 * t);
        }

        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(heatX + j * cellW, heatY + i * cellH, cellW - 1, cellH - 1);

        // Value text
        if (cellW > 18 && cellH > 14) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.font = '6px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(val.toFixed(1), heatX + j * cellW + cellW / 2, heatY + i * cellH + cellH / 2 + 2);
        }
      }
    }

    // Color scale
    var scaleY = heatY + T * cellH + 10;
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('-2', heatX, scaleY + 16);
    ctx.fillText('+2', heatX + dModel * cellW, scaleY + 16);
    for (var px = 0; px < dModel * cellW; px++) {
      var t = px / (dModel * cellW);
      var r, g, b;
      if (t < 0.5) {
        var s = t * 2;
        r = Math.floor(30 + 90 * s);
        g = Math.floor(60 + 100 * s);
        b = Math.floor(180 + 75 * s);
      } else {
        var s = (t - 0.5) * 2;
        r = Math.floor(120 + 135 * s);
        g = Math.floor(160 - 80 * s);
        b = Math.floor(255 - 175 * s);
      }
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fillRect(heatX + px, scaleY, 1, 6);
    }

    // ─── Component detail based on current step ───
    var infoY = scaleY + 36;
    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    var details = getStepDetails(state.step);
    for (var i = 0; i < details.length; i++) {
      ctx.fillStyle = details[i].color || c.textDim;
      ctx.font = details[i].bold ? 'bold 9px "JetBrains Mono", monospace' : '9px "JetBrains Mono", monospace';
      ctx.fillText(details[i].text, detailX, infoY + i * 14);
    }

    // ─── Bottom: progress bar ───
    var progY = HEIGHT - 26;
    var progW = WIDTH - PAD.left - PAD.right - 20;
    var progX = PAD.left + 10;

    ctx.fillStyle = 'rgba(128,128,128,0.1)';
    ctx.fillRect(progX, progY, progW, 6);

    var progFill = ((state.step + 1) / state.maxSteps) * progW;
    ctx.fillStyle = c.ai;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(progX, progY, progFill, 6);
    ctx.globalAlpha = 1;

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Step ' + (state.step + 1) + ' / ' + state.maxSteps, progX + progW / 2, progY + 16);
  }

  function getStepDetails(step) {
    var c = Plot.getColors();
    switch (step) {
      case 0: return [
        { text: 'Each token \u2192 lookup in embedding matrix W_E', bold: true, color: c.ai },
        { text: 'W_E shape: [vocab_size x d_model]', color: c.textDim },
        { text: '"The" \u2192 [0.3, -0.1, 0.8, ...]', color: c.textDim },
        { text: '', color: c.textDim },
        { text: 'DSP: Analogous to sampling a continuous', color: c.bridge },
        { text: 'signal at discrete points.', color: c.bridge }
      ];
      case 1: return [
        { text: 'PE(pos, 2i)   = sin(pos / 10000^(2i/d))', bold: true, color: c.ai },
        { text: 'PE(pos, 2i+1) = cos(pos / 10000^(2i/d))', bold: true, color: c.ai },
        { text: 'Each position gets unique frequency mix', color: c.textDim },
        { text: 'Low dims = low freq, high dims = high freq', color: c.textDim },
        { text: '', color: c.textDim },
        { text: 'DSP: Fourier-like encoding! Different dims', color: c.bridge },
        { text: 'are different frequency components.', color: c.bridge }
      ];
      case 2: return [
        { text: 'Q = X\u00b7W_Q, K = X\u00b7W_K, V = X\u00b7W_V', bold: true, color: c.ai },
        { text: 'scores = QK\u1D40 / \u221Ad_k', color: c.textDim },
        { text: 'weights = softmax(scores)', color: c.textDim },
        { text: 'output = weights \u00b7 V', color: c.textDim },
        { text: numHeads + ' heads, each d_k=' + (dModel / numHeads), color: c.textDim },
        { text: '', color: c.textDim },
        { text: 'DSP: FIR filter bank with data-dependent', color: c.bridge },
        { text: 'coefficients (adaptive matched filtering).', color: c.bridge }
      ];
      case 3: return [
        { text: 'residual: y = x + Attention(x)', bold: true, color: c.ai },
        { text: 'layernorm: \u03bc=0, \u03c3=1 per position', color: c.textDim },
        { text: 'LN(y) = \u03b3 \u00b7 (y - \u03bc) / \u03c3 + \u03b2', color: c.textDim },
        { text: '', color: c.textDim },
        { text: 'Residual = skip connection (identity path)', color: c.textDim },
        { text: 'DSP: Residual = allpass in parallel path.', color: c.bridge },
        { text: 'LayerNorm = automatic gain control (AGC).', color: c.bridge }
      ];
      case 4: return [
        { text: 'FFN(x) = ReLU(x\u00b7W\u2081 + b\u2081)\u00b7W\u2082 + b\u2082', bold: true, color: c.ai },
        { text: 'W\u2081: [' + dModel + ' x ' + dFF + '], W\u2082: [' + dFF + ' x ' + dModel + ']', color: c.textDim },
        { text: 'Expand to 4x width, then compress back', color: c.textDim },
        { text: 'Applied independently to each position', color: c.textDim },
        { text: '', color: c.textDim },
        { text: 'DSP: Pointwise (1x1) nonlinear filter.', color: c.bridge },
        { text: 'No mixing across positions \u2014 per-sample.', color: c.bridge }
      ];
      case 5: return [
        { text: 'y = x + FFN(x), then LayerNorm', bold: true, color: c.ai },
        { text: 'Second residual + normalization', color: c.textDim },
        { text: 'Ensures gradient highway through the block', color: c.textDim },
        { text: '', color: c.textDim },
        { text: 'Deep nets without residuals = vanishing grad', color: c.textDim },
        { text: 'DSP: Identity path preserves signal energy.', color: c.bridge },
        { text: 'Like LSTM cell state highway (Ch 12).', color: c.bridge }
      ];
      case 6: return [
        { text: 'Block output ready for next layer', bold: true, color: c.ai },
        { text: 'GPT-3: 96 blocks stacked', color: c.textDim },
        { text: 'Each block refines representations', color: c.textDim },
        { text: 'Early blocks: syntax, late blocks: semantics', color: c.textDim },
        { text: '', color: c.textDim },
        { text: 'DSP: Cascade of filter stages. Each stage', color: c.bridge },
        { text: 'extracts higher-level features.', color: c.bridge }
      ];
      default: return [];
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    var lineY = y;
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i] + ' ';
      var metrics = ctx.measureText(test);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, x, lineY);
        line = words[i] + ' ';
        lineY += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, lineY);
  }

  // ─── Utilities ───

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
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
