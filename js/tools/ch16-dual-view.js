/* ============================================================
   Tool 16.1 — Dual-View Concept Explorer
   12 DSP↔AI mappings made interactive. Click to expand,
   linked parameter sliders show the mathematical equivalence.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.DualView = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 620;
  var PAD = { top: 10, right: 10, bottom: 10, left: 10 };

  // The 12 core mappings
  var mappings = [
    {
      id: 'conv',
      dsp: 'Convolution',
      ai: 'Neural Network Layer',
      dspEq: 'y[n] = \u03A3_k h[k] x[n-k]',
      aiEq: 'y = Wx + b',
      desc: 'Both compute weighted sums of inputs. Convolution slides a kernel; a layer multiplies by a weight matrix. The weights ARE the filter coefficients.',
      category: 'processing'
    },
    {
      id: 'impulse',
      dsp: 'Impulse Response h[n]',
      ai: 'Network Weights W',
      dspEq: 'h[n] = system output to \u03B4[n]',
      aiEq: 'W = learned parameters',
      desc: 'The impulse response fully characterizes an LTI system. Network weights fully characterize a layer. Both are "what the system has learned."',
      category: 'representation'
    },
    {
      id: 'freq',
      dsp: 'Frequency Response H(\u03C9)',
      ai: 'Feature Selectivity',
      dspEq: 'H(\u03C9) = \u03A3_n h[n]e^{-j\u03C9n}',
      aiEq: 'Neuron activates for specific patterns',
      desc: 'A filter passes certain frequencies and blocks others. A neuron responds to certain input patterns and ignores others. Both are selective.',
      category: 'representation'
    },
    {
      id: 'poles',
      dsp: 'Poles & Zeros',
      ai: 'Eigenvalues of A matrix',
      dspEq: 'H(z) = B(z)/A(z), roots of A(z)',
      aiEq: '\u03BB_i of state-space matrix A',
      desc: 'Poles determine system behavior: stability, resonance, memory. SSM eigenvalues determine the same: how information decays, oscillates, or persists.',
      category: 'stability'
    },
    {
      id: 'fir',
      dsp: 'FIR Filter (finite response)',
      ai: 'Attention (finite context)',
      dspEq: 'y[n] = \u03A3_{k=0}^{M} h[k]x[n-k]',
      aiEq: 'y = softmax(QK\u1D40/\u221Ad)V',
      desc: 'FIR filters have finite memory — they look at a fixed window. Attention looks at a finite context window. Both: weighted sum of finite past, always stable, O(T\u00b2) naive.',
      category: 'processing'
    },
    {
      id: 'iir',
      dsp: 'IIR Filter (infinite response)',
      ai: 'Mamba / SSM (compressed state)',
      dspEq: 'y[n] = \u03A3 b[k]x[n-k] + \u03A3 a[k]y[n-k]',
      aiEq: 'h\u2099 = Ah\u2099\u208B\u2081 + Bx\u2099',
      desc: 'IIR filters have infinite memory via feedback — past outputs feed back in. Mamba/SSMs maintain a compressed state that theoretically remembers everything. Both: O(T) sequential, potentially unstable.',
      category: 'processing'
    },
    {
      id: 'bank',
      dsp: 'Filter Bank',
      ai: 'Multi-Head Attention',
      dspEq: 'y_k[n] = h_k[n] * x[n], k=1..K',
      aiEq: 'head_i = Attn(QW_i^Q, KW_i^K, VW_i^V)',
      desc: 'A filter bank decomposes a signal into K sub-bands in parallel. Multi-head attention decomposes representations into H sub-spaces in parallel. Both extract different features simultaneously.',
      category: 'processing'
    },
    {
      id: 'adaptive',
      dsp: 'Adaptive Filter (LMS)',
      ai: 'Training (SGD)',
      dspEq: 'w[n+1] = w[n] + \u03BC\u00b7e[n]\u00b7x[n]',
      aiEq: '\u03B8\u2099\u208A\u2081 = \u03B8\u2099 - \u03B7\u2207L(\u03B8\u2099)',
      desc: 'LMS updates filter coefficients using the error signal and step size \u03BC. SGD updates neural network weights using the loss gradient and learning rate \u03B7. Same algorithm, different name.',
      category: 'adaptation'
    },
    {
      id: 'stability',
      dsp: 'BIBO Stability',
      ai: 'Gradient Flow / Trainability',
      dspEq: '|poles| < 1 inside unit circle',
      aiEq: '|\u03BB_i| \u2264 1 for stable gradients',
      desc: 'An IIR filter is stable iff all poles are inside the unit circle. A recurrent network trains well iff eigenvalues of the recurrence matrix have magnitude \u2264 1. Same constraint.',
      category: 'stability'
    },
    {
      id: 'causal',
      dsp: 'Causal Filter',
      ai: 'Autoregressive Model',
      dspEq: 'h[n] = 0 for n < 0',
      aiEq: 'P(x_t | x_{<t}) — no future info',
      desc: 'A causal filter uses only past and present inputs. An autoregressive model predicts each token using only previous tokens. Both enforce the arrow of time.',
      category: 'stability'
    },
    {
      id: 'basis',
      dsp: 'Fourier Basis',
      ai: 'Embedding Space',
      dspEq: 'x(t) = \u03A3 c_k e^{j\u03C9_k t}',
      aiEq: 'word \u2192 v \u2208 \u211D^d',
      desc: 'Fourier analysis represents signals in a basis of sinusoids. Embeddings represent words in a learned basis. Both are change-of-basis operations that reveal structure.',
      category: 'representation'
    },
    {
      id: 'transfer',
      dsp: 'Transfer Function H(z)',
      ai: 'Learned Representation',
      dspEq: 'Y(z) = H(z)\u00b7X(z)',
      aiEq: 'y = f(x; \u03B8)',
      desc: 'The transfer function completely describes input-to-output transformation in the z-domain. A trained network completely describes the learned mapping. Both encapsulate "what the system does."',
      category: 'representation'
    }
  ];

  var categoryColors = {
    representation: '#a78bfa',
    processing: '#38bdf8',
    stability: '#fb7185',
    adaptation: '#4ade80'
  };

  var categoryLabels = {
    representation: 'Representation',
    processing: 'Processing',
    stability: 'Stability & Memory',
    adaptation: 'Adaptation & Learning'
  };

  var state = {
    selectedIdx: -1,
    hoveredIdx: -1,
    scrollOffset: 0
  };

  var containerEl;
  var cardRects = [];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Dual-view Rosetta explorer showing DSP and AI concept equivalences');
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
      HEIGHT = Math.max(560, Math.min(680, WIDTH * 0.85));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var mx = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
      var my = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;

      var hovered = -1;
      for (var i = 0; i < cardRects.length; i++) {
        var cr = cardRects[i];
        if (mx >= cr.x && mx <= cr.x + cr.w && my >= cr.y && my <= cr.y + cr.h) {
          hovered = i;
          break;
        }
      }
      if (hovered !== state.hoveredIdx) {
        state.hoveredIdx = hovered;
        canvas.style.cursor = hovered >= 0 ? 'pointer' : 'default';
        render();
      }
    });

    canvas.addEventListener('click', function () {
      if (state.hoveredIdx >= 0) {
        state.selectedIdx = (state.selectedIdx === state.hoveredIdx) ? -1 : state.hoveredIdx;
        render();
      }
    });

    // Category filter buttons
    var filterBtns = containerEl.querySelectorAll('[data-filter]');
    for (var i = 0; i < filterBtns.length; i++) {
      filterBtns[i].addEventListener('click', function () {
        var cat = this.getAttribute('data-filter');
        // Find first mapping of this category
        for (var j = 0; j < mappings.length; j++) {
          if (cat === 'all' || mappings[j].category === cat) {
            state.selectedIdx = j;
            render();
            return;
          }
        }
      });
    }

    resize();
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);
    cardRects = [];

    // Title
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('THE ROSETTA STONE \u2014 12 DSP \u2194 AI MAPPINGS', PAD.left + 10, PAD.top + 14);

    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillStyle = c.ai;
    ctx.fillText('click any mapping to expand \u2014 equations and explanation', PAD.left + 10, PAD.top + 28);

    // Category legend
    var legendX = WIDTH - PAD.right - 10;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    var cats = ['representation', 'processing', 'stability', 'adaptation'];
    for (var i = 0; i < cats.length; i++) {
      ctx.fillStyle = categoryColors[cats[i]];
      ctx.fillRect(legendX - 60, PAD.top + 6 + i * 12, 6, 6);
      ctx.fillText(categoryLabels[cats[i]], legendX, PAD.top + 12 + i * 12);
    }

    // Layout: grid of mapping cards
    var gridTop = PAD.top + 42;
    var gridW = WIDTH - PAD.left - PAD.right - 20;
    var cols = WIDTH > 600 ? 3 : 2;
    var cardW = (gridW - (cols - 1) * 8) / cols;
    var cardH = 62;
    var cardGap = 8;

    // If a card is selected, show expanded view below the grid
    var gridRows = Math.ceil(mappings.length / cols);
    var gridH = gridRows * (cardH + cardGap);

    for (var i = 0; i < mappings.length; i++) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var cx = PAD.left + 10 + col * (cardW + cardGap);
      var cy = gridTop + row * (cardH + cardGap);

      cardRects.push({ x: cx, y: cy, w: cardW, h: cardH });

      var m = mappings[i];
      var isSelected = (i === state.selectedIdx);
      var isHovered = (i === state.hoveredIdx);
      var catColor = categoryColors[m.category];

      // Card background
      if (isSelected) {
        ctx.fillStyle = catColor.replace(')', ',0.2)').replace('rgb', 'rgba');
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
      }
      ctx.fillRect(cx, cy, cardW, cardH);

      // Left accent bar
      ctx.fillStyle = catColor;
      ctx.globalAlpha = isSelected ? 1 : 0.5;
      ctx.fillRect(cx, cy, 3, cardH);
      ctx.globalAlpha = 1;

      // Border
      ctx.strokeStyle = isSelected ? catColor : (isHovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)');
      ctx.lineWidth = isSelected ? 1.5 : 0.5;
      ctx.strokeRect(cx, cy, cardW, cardH);

      // Mapping number
      ctx.fillStyle = catColor;
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('#' + (i + 1), cx + 8, cy + 14);

      // DSP label
      ctx.fillStyle = c.dsp || c.signal;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(m.dsp, cx + 28, cy + 14);

      // Arrow
      ctx.fillStyle = c.bridge;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('\u2194', cx + cardW / 2, cy + 30);

      // AI label
      ctx.fillStyle = c.ai;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(m.ai, cx + 28, cy + 44);

      // Category tag
      ctx.fillStyle = catColor;
      ctx.globalAlpha = 0.6;
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(categoryLabels[m.category].toUpperCase(), cx + cardW - 6, cy + 56);
      ctx.globalAlpha = 1;
    }

    // ─── Expanded Detail Panel ───
    if (state.selectedIdx >= 0) {
      var m = mappings[state.selectedIdx];
      var catColor = categoryColors[m.category];
      var panelY = gridTop + gridH + 10;
      var panelH = HEIGHT - panelY - PAD.bottom - 24;
      var panelW = gridW;
      var panelX = PAD.left + 10;

      if (panelH < 60) return;

      // Panel background
      ctx.fillStyle = catColor.replace(')', ',0.06)').replace('rgb', 'rgba');
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.strokeStyle = catColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX, panelY, panelW, panelH);

      // Split into DSP (left) and AI (right)
      var halfW = (panelW - 30) / 2;
      var leftX = panelX + 12;
      var rightX = panelX + halfW + 30;

      // DSP side
      ctx.fillStyle = c.dsp || c.signal;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('DSP: ' + m.dsp, leftX, panelY + 20);

      ctx.fillStyle = c.text;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(m.dspEq, leftX, panelY + 40);

      // DSP mini visualization
      drawMiniViz(leftX, panelY + 52, halfW, panelH - 70, state.selectedIdx, 'dsp', c);

      // AI side
      ctx.fillStyle = c.ai;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('AI: ' + m.ai, rightX, panelY + 20);

      ctx.fillStyle = c.text;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(m.aiEq, rightX, panelY + 40);

      // AI mini visualization
      drawMiniViz(rightX, panelY + 52, halfW, panelH - 70, state.selectedIdx, 'ai', c);

      // Center bridge arrow
      var arrowX = panelX + halfW + 15;
      ctx.fillStyle = c.bridge;
      ctx.font = '16px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('\u21D4', arrowX, panelY + 20);

      // Description at bottom
      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      wrapText(ctx, m.desc, panelX + panelW / 2, panelY + panelH - 10, panelW - 24, 11, true);
    }

    // Bottom DSP note
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('The central insight: FIR filter = Attention (finite, stable, O(T\u00b2))  \u2194  IIR filter = Mamba (infinite memory, O(T), may be unstable)', WIDTH / 2, HEIGHT - 8);
  }

  // ─── Mini Visualizations for each mapping ───

  function drawMiniViz(x, y, w, h, idx, side, c) {
    var rng = mulberry32(idx * 100 + (side === 'ai' ? 50 : 0));
    var plotW = Math.min(w - 10, 200);
    var plotH = Math.min(h - 10, 60);
    var plotX = x + 5;
    var plotY = y + 5;

    if (plotH < 20) return;

    var mapping = mappings[idx];

    switch (mapping.id) {
      case 'conv':
      case 'impulse':
        drawImpulseResponse(plotX, plotY, plotW, plotH, side, c, rng);
        break;
      case 'freq':
        drawFreqResponse(plotX, plotY, plotW, plotH, side, c, rng);
        break;
      case 'fir':
      case 'iir':
        drawFIRvsIIR(plotX, plotY, plotW, plotH, side, c, rng, mapping.id);
        break;
      case 'poles':
      case 'stability':
        drawPoleZero(plotX, plotY, plotW, plotH, side, c, rng);
        break;
      case 'bank':
        drawFilterBank(plotX, plotY, plotW, plotH, side, c, rng);
        break;
      case 'adaptive':
        drawLearningCurve(plotX, plotY, plotW, plotH, side, c, rng);
        break;
      case 'causal':
        drawCausal(plotX, plotY, plotW, plotH, side, c, rng);
        break;
      case 'basis':
        drawBasis(plotX, plotY, plotW, plotH, side, c, rng);
        break;
      case 'transfer':
        drawTransfer(plotX, plotY, plotW, plotH, side, c, rng);
        break;
      default:
        break;
    }
  }

  function drawImpulseResponse(x, y, w, h, side, c, rng) {
    var N = 16;
    var color = side === 'dsp' ? (c.signal) : c.ai;

    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    for (var i = 0; i < N; i++) {
      var val = side === 'dsp'
        ? Math.exp(-i * 0.3) * Math.cos(i * 0.8) * (1 + (rng() - 0.5) * 0.2)
        : (rng() - 0.3) * Math.exp(-i * 0.15);
      var bx = x + (i / N) * w;
      var bh = val * h * 0.8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + w / N / 2, y + h);
      ctx.lineTo(bx + w / N / 2, y + h - bh);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx + w / N / 2, y + h - bh, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'dsp' ? 'h[n]' : 'weights', x, y - 2);
  }

  function drawFreqResponse(x, y, w, h, side, c, rng) {
    var color = side === 'dsp' ? c.signal : c.ai;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i <= 40; i++) {
      var t = i / 40;
      var val = side === 'dsp'
        ? 1 / (1 + Math.pow(t / 0.3, 4)) // lowpass
        : Math.exp(-Math.pow((t - 0.5) / 0.15, 2)); // selective
      var px = x + t * w;
      var py = y + h - val * h * 0.9;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'dsp' ? '|H(\u03C9)|' : 'selectivity', x, y - 2);
  }

  function drawFIRvsIIR(x, y, w, h, side, c, rng, type) {
    var N = 24;
    var color = side === 'dsp' ? c.signal : c.ai;

    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.7);
    ctx.lineTo(x + w, y + h * 0.7);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i < N; i++) {
      var t = i / N;
      var val;
      if (type === 'fir') {
        // Finite: nonzero for small window then zero
        val = (i < 10) ? Math.sin(i * 0.7) * (1 - i / 10) : 0;
      } else {
        // Infinite: exponentially decaying
        val = Math.exp(-i * 0.15) * Math.sin(i * 0.6);
      }
      var px = x + t * w;
      var py = y + h * 0.7 - val * h * 0.5;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(type === 'fir' ? (side === 'dsp' ? 'finite h[n]' : 'finite context') : (side === 'dsp' ? 'infinite h[n]' : 'compressed state'), x, y - 2);
  }

  function drawPoleZero(x, y, w, h, side, c, rng) {
    var size = Math.min(w, h) - 4;
    var cx = x + w / 2;
    var cy = y + h / 2;
    var r = size / 2;

    // Unit circle
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Axes
    ctx.beginPath();
    ctx.moveTo(cx - r - 4, cy);
    ctx.lineTo(cx + r + 4, cy);
    ctx.moveTo(cx, cy - r - 4);
    ctx.lineTo(cx, cy + r + 4);
    ctx.stroke();

    // Poles (inside unit circle = stable)
    var poles = [
      { re: 0.7, im: 0.3 },
      { re: 0.7, im: -0.3 },
      { re: -0.4, im: 0 }
    ];
    ctx.strokeStyle = side === 'dsp' ? c.signal : c.ai;
    ctx.lineWidth = 1.5;
    for (var i = 0; i < poles.length; i++) {
      var px = cx + poles[i].re * r;
      var py = cy - poles[i].im * r;
      ctx.beginPath();
      ctx.moveTo(px - 3, py - 3);
      ctx.lineTo(px + 3, py + 3);
      ctx.moveTo(px + 3, py - 3);
      ctx.lineTo(px - 3, py + 3);
      ctx.stroke();
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'dsp' ? 'z-plane poles' : 'eigenvalues \u03BB', x, y - 2);
  }

  function drawFilterBank(x, y, w, h, side, c, rng) {
    var nBands = 4;
    var colors = Plot.SIGNAL_COLORS;

    for (var b = 0; b < nBands; b++) {
      ctx.strokeStyle = colors[b % colors.length];
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i <= 30; i++) {
        var t = i / 30;
        var center = (b + 0.5) / nBands;
        var val = Math.exp(-Math.pow((t - center) / 0.08, 2));
        var px = x + t * w;
        var py = y + h - val * h * 0.85;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'dsp' ? 'filter bank' : 'attention heads', x, y - 2);
  }

  function drawLearningCurve(x, y, w, h, side, c, rng) {
    var color = side === 'dsp' ? c.signal : c.ai;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i <= 30; i++) {
      var t = i / 30;
      var val = Math.exp(-3 * t) + 0.05 + (rng() - 0.5) * 0.03;
      var px = x + t * w;
      var py = y + (1 - val) * h * 0.9 + h * 0.05;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'dsp' ? 'MSE vs iteration' : 'loss vs epoch', x, y - 2);
  }

  function drawCausal(x, y, w, h, side, c, rng) {
    var N = 12;
    var midX = x + w / 2;

    // Past (green) and future (red)
    for (var i = 0; i < N; i++) {
      var bx = x + (i / N) * w;
      var isPast = bx < midX;
      ctx.fillStyle = isPast ? 'rgba(74,222,128,0.4)' : 'rgba(251,113,133,0.15)';
      ctx.fillRect(bx, y + 8, w / N - 1, h - 12);
    }

    // Divider
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(midX, y + 4);
    ctx.lineTo(midX, y + h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('past \u2713', x + w * 0.25, y + h - 2);
    ctx.fillText('future \u2717', x + w * 0.75, y + h - 2);

    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'dsp' ? 'causal h[n]' : 'masked attn', x, y - 2);
  }

  function drawBasis(x, y, w, h, side, c, rng) {
    var colors = Plot.SIGNAL_COLORS;
    var nBasis = 3;

    for (var b = 0; b < nBasis; b++) {
      ctx.strokeStyle = colors[b];
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i <= 30; i++) {
        var t = i / 30;
        var val;
        if (side === 'dsp') {
          val = Math.sin(2 * Math.PI * (b + 1) * t);
        } else {
          // Learned basis — irregular
          val = Math.sin(2 * Math.PI * (b + 1) * t + b * 1.2) * (0.8 + 0.4 * Math.cos(t * 3));
        }
        var px = x + t * w;
        var py = y + h / 2 - val * h * 0.35;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'dsp' ? 'Fourier basis' : 'embedding dims', x, y - 2);
  }

  function drawTransfer(x, y, w, h, side, c, rng) {
    // Simple input → box → output
    var boxW = w * 0.3;
    var boxH = h * 0.4;
    var boxX = x + (w - boxW) / 2;
    var boxY = y + (h - boxH) / 2;

    // Input arrow
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, boxY + boxH / 2);
    ctx.lineTo(boxX - 4, boxY + boxH / 2);
    ctx.stroke();

    // Box
    var color = side === 'dsp' ? c.signal : c.ai;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = color;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(side === 'dsp' ? 'H(z)' : 'f(\u03B8)', boxX + boxW / 2, boxY + boxH / 2 + 3);

    // Output arrow
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(boxX + boxW + 4, boxY + boxH / 2);
    ctx.lineTo(x + w - 10, boxY + boxH / 2);
    ctx.stroke();

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'dsp' ? 'X(z)\u2192Y(z)' : 'x\u2192y', x, y - 2);
  }

  // ─── Utilities ───

  function wrapText(ctx, text, centerX, y, maxWidth, lineHeight, center) {
    var words = text.split(' ');
    var line = '';
    var lineY = y;
    var lines = [];

    for (var i = 0; i < words.length; i++) {
      var test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxWidth && i > 0) {
        lines.push(line.trim());
        line = words[i] + ' ';
      } else {
        line = test;
      }
    }
    lines.push(line.trim());

    // Draw from bottom up so y is the bottom line
    var startY = y - (lines.length - 1) * lineHeight;
    for (var i = 0; i < lines.length; i++) {
      if (center) ctx.textAlign = 'center';
      ctx.fillText(lines[i], centerX, startY + i * lineHeight);
    }
  }

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
