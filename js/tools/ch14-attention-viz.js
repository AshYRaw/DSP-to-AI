/* ============================================================
   Tool 14.1 — Attention Mechanism Visualizer
   Interactive Q/K/V computation, scaled dot-product attention,
   multi-head attention heatmap for a token sequence.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.AttentionViz = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;
  var PAD = { top: 10, right: 15, bottom: 10, left: 15 };

  var sentences = [
    { text: 'The cat sat on the mat', tokens: ['The', 'cat', 'sat', 'on', 'the', 'mat'] },
    { text: 'I love signals and systems', tokens: ['I', 'love', 'signals', 'and', 'systems'] },
    { text: 'The bank by the river was steep', tokens: ['The', 'bank', 'by', 'the', 'river', 'was', 'steep'] },
    { text: 'Attention is all you need', tokens: ['Attention', 'is', 'all', 'you', 'need'] }
  ];

  var state = {
    sentenceIdx: 0,
    selectedToken: -1,  // which token's query to highlight
    numHeads: 1,
    headIdx: 0,
    dModel: 8,          // embedding dim
    showQKV: true,
    temperature: 1.0
  };

  // Computed attention data
  var embeddings = [];   // T x dModel
  var Wq = [], Wk = [], Wv = [];  // per-head projection matrices
  var Q = [], K = [], V = [];      // per-head projected
  var scores = [];       // per-head T x T raw scores
  var weights = [];      // per-head T x T after softmax
  var output = [];       // per-head T x dk

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Attention mechanism heatmap showing Query-Key similarity weights');
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
      HEIGHT = Math.max(500, Math.min(600, WIDTH * 0.7));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Mouse interaction — click tokens in the heatmap
    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      var my = (e.clientY - rect.top) * (canvas.height / rect.height);
      var dpr = window.devicePixelRatio || 1;
      mx /= dpr; my /= dpr;

      // Check if click is in token bar area (top)
      var tokens = sentences[state.sentenceIdx].tokens;
      var T = tokens.length;
      var heatSize = Math.min(280, (WIDTH - 40) / 2);
      var cellSize = Math.min(36, heatSize / T);
      var heatX = PAD.left + 20;
      var tokenY = PAD.top + 40;

      for (var i = 0; i < T; i++) {
        var tx = heatX + i * cellSize;
        if (mx >= tx && mx < tx + cellSize && my >= tokenY && my < tokenY + 24) {
          state.selectedToken = (state.selectedToken === i) ? -1 : i;
          render();
          return;
        }
      }
    });

    bindSelect(containerEl, 'attn-sentence', function (v) {
      state.sentenceIdx = parseInt(v, 10);
      state.selectedToken = -1;
      computeAttention();
      render();
    });

    bindSlider(containerEl, 'attn-heads', function (v) {
      state.numHeads = parseInt(v, 10);
      state.headIdx = 0;
      computeAttention();
      render();
    });

    bindSlider(containerEl, 'attn-head-idx', function (v) {
      state.headIdx = Math.min(parseInt(v, 10), state.numHeads - 1);
      render();
    });

    bindSlider(containerEl, 'attn-temp', function (v) {
      state.temperature = parseFloat(v);
      computeAttention();
      render();
    });

    computeAttention();
    resize();
  }

  // ─── Attention Computation ───

  function computeAttention() {
    var rng = mulberry32(123 + state.sentenceIdx * 7);
    var tokens = sentences[state.sentenceIdx].tokens;
    var T = tokens.length;
    var d = state.dModel;
    var H = state.numHeads;
    var dk = Math.max(2, Math.floor(d / H));

    // Generate pseudo-embeddings (seeded, deterministic)
    embeddings = [];
    for (var i = 0; i < T; i++) {
      var emb = [];
      // Use token character codes to seed slightly different embeddings
      var seed = 0;
      for (var c = 0; c < tokens[i].length; c++) seed += tokens[i].charCodeAt(c);
      var trng = mulberry32(seed);
      for (var j = 0; j < d; j++) {
        emb.push((trng() - 0.5) * 2);
      }
      embeddings.push(emb);
    }

    // Per-head projection matrices
    Wq = []; Wk = []; Wv = [];
    Q = []; K = []; V = [];
    scores = []; weights = []; output = [];

    for (var h = 0; h < H; h++) {
      // Random projection matrices d x dk
      var wq = randomMatrix(d, dk, rng);
      var wk = randomMatrix(d, dk, rng);
      var wv = randomMatrix(d, dk, rng);
      Wq.push(wq); Wk.push(wk); Wv.push(wv);

      // Project: Q = X * Wq, K = X * Wk, V = X * Wv
      var qh = matMul(embeddings, wq);
      var kh = matMul(embeddings, wk);
      var vh = matMul(embeddings, wv);
      Q.push(qh); K.push(kh); V.push(vh);

      // Scaled dot-product attention
      var scale = Math.sqrt(dk) * state.temperature;
      var rawScores = [];
      for (var i = 0; i < T; i++) {
        var row = [];
        for (var j = 0; j < T; j++) {
          var dot = 0;
          for (var k = 0; k < dk; k++) dot += qh[i][k] * kh[j][k];
          row.push(dot / scale);
        }
        rawScores.push(row);
      }
      scores.push(rawScores);

      // Softmax per row
      var attnWeights = [];
      for (var i = 0; i < T; i++) {
        attnWeights.push(softmax(rawScores[i]));
      }
      weights.push(attnWeights);

      // Output = weights * V
      var out = [];
      for (var i = 0; i < T; i++) {
        var oRow = new Array(dk).fill(0);
        for (var j = 0; j < T; j++) {
          for (var k = 0; k < dk; k++) {
            oRow[k] += attnWeights[i][j] * vh[j][k];
          }
        }
        out.push(oRow);
      }
      output.push(out);
    }
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var tokens = sentences[state.sentenceIdx].tokens;
    var T = tokens.length;
    var h = Math.min(state.headIdx, state.numHeads - 1);
    var W = weights[h];

    // Layout
    var heatSize = Math.min(300, (WIDTH - 80) * 0.45);
    var cellSize = Math.min(40, heatSize / T);
    var actualHeatSize = cellSize * T;

    // ─── Left side: Attention Heatmap ───
    var heatX = PAD.left + 20;
    var heatY = PAD.top + 70;

    // Title
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ATTENTION WEIGHTS' + (state.numHeads > 1 ? ' (HEAD ' + h + ')' : ''), heatX, PAD.top + 12);

    // Subtitle
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = c.ai;
    ctx.fillText('softmax(Q K\u1D40 / \u221Ad\u2096) — click a token to inspect', heatX, PAD.top + 26);

    // Token labels on top (Keys)
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (var j = 0; j < T; j++) {
      var tx = heatX + j * cellSize + cellSize / 2;
      var ty = heatY - 6;
      ctx.fillStyle = (state.selectedToken >= 0) ? (j === state.selectedToken ? c.ai : c.textDim) : c.text;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(tokens[j], 0, 0);
      ctx.restore();
    }

    // Key label
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Keys \u2192', heatX + actualHeatSize / 2, heatY - 28);

    // Token labels on left (Queries)
    ctx.textAlign = 'right';
    ctx.font = '10px "JetBrains Mono", monospace';
    for (var i = 0; i < T; i++) {
      var ty = heatY + i * cellSize + cellSize / 2 + 4;
      ctx.fillStyle = (state.selectedToken === i) ? c.ai : c.text;
      ctx.fillText(tokens[i], heatX - 6, ty);
    }

    // Query label
    ctx.save();
    ctx.translate(heatX - 40, heatY + actualHeatSize / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Queries \u2192', 0, 0);
    ctx.restore();

    // Heatmap cells
    for (var i = 0; i < T; i++) {
      for (var j = 0; j < T; j++) {
        var val = W[i][j];
        var cx = heatX + j * cellSize;
        var cy = heatY + i * cellSize;

        // Color: darker = lower attention, brighter = higher
        var intensity = Math.pow(val, 0.6); // gamma for visibility
        if (state.selectedToken >= 0 && state.selectedToken !== i) {
          // Dim rows not selected
          intensity *= 0.3;
        }

        var r = Math.floor(20 + 60 * intensity);
        var g = Math.floor(80 + 175 * intensity);
        var b = Math.floor(120 + 135 * intensity);
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(cx, cy, cellSize - 1, cellSize - 1);

        // Value text (if cells are large enough)
        if (cellSize > 28) {
          ctx.fillStyle = intensity > 0.5 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.6)';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(val.toFixed(2), cx + cellSize / 2, cy + cellSize / 2 + 3);
        }
      }
    }

    // Selected token highlight border
    if (state.selectedToken >= 0) {
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 2;
      ctx.strokeRect(heatX, heatY + state.selectedToken * cellSize, actualHeatSize - 1, cellSize - 1);
    }

    // Color scale
    var scaleX = heatX;
    var scaleY = heatY + actualHeatSize + 12;
    var scaleW = actualHeatSize;
    var scaleH = 8;
    for (var px = 0; px < scaleW; px++) {
      var t = px / scaleW;
      var r = Math.floor(20 + 60 * t);
      var g = Math.floor(80 + 175 * t);
      var b = Math.floor(120 + 135 * t);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fillRect(scaleX + px, scaleY, 1, scaleH);
    }
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0', scaleX, scaleY + scaleH + 10);
    ctx.textAlign = 'right';
    ctx.fillText('1', scaleX + scaleW, scaleY + scaleH + 10);
    ctx.textAlign = 'center';
    ctx.fillText('attention weight', scaleX + scaleW / 2, scaleY + scaleH + 10);

    // ─── Right side: QKV Detail Panel ───
    var panelX = heatX + actualHeatSize + 50;
    var panelW = WIDTH - panelX - PAD.right;

    if (state.selectedToken >= 0 && panelW > 80) {
      var sel = state.selectedToken;
      var dk = Q[h][0].length;

      ctx.fillStyle = c.text;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Token: "' + tokens[sel] + '"', panelX, PAD.top + 16);

      // Q vector
      var vecY = PAD.top + 40;
      drawVectorBar(panelX, vecY, panelW, 'Query (Q)', Q[h][sel], c.ai, c);

      // K vectors as bars
      vecY += 50;
      ctx.fillStyle = c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText('Dot products (Q \u00b7 K):', panelX, vecY);
      vecY += 14;

      // Show raw scores and softmax weights for this query
      var rawRow = scores[h][sel];
      var wRow = W[sel];
      var maxRaw = 0;
      for (var j = 0; j < T; j++) maxRaw = Math.max(maxRaw, Math.abs(rawRow[j]));

      var barH = Math.min(18, (HEIGHT - vecY - 120) / (T + 2));
      for (var j = 0; j < T; j++) {
        var by = vecY + j * (barH + 3);
        // Token label
        ctx.fillStyle = c.text;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(tokens[j], panelX + 60, by + barH - 3);

        // Raw score bar
        var barMaxW = panelW * 0.35;
        var barValW = (rawRow[j] / (maxRaw + 1e-10)) * barMaxW;
        var barStartX = panelX + 65;
        if (barValW >= 0) {
          ctx.fillStyle = 'rgba(56,189,248,0.4)';
          ctx.fillRect(barStartX, by, barValW, barH - 1);
        } else {
          ctx.fillStyle = 'rgba(251,113,133,0.4)';
          ctx.fillRect(barStartX + barValW, by, -barValW, barH - 1);
        }

        // Score value
        ctx.fillStyle = c.textDim;
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(rawRow[j].toFixed(2), barStartX + barMaxW + 4, by + barH - 3);

        // Softmax weight bar
        var swX = barStartX + barMaxW + 35;
        var swW = panelW * 0.2;
        var swBarW = wRow[j] * swW;
        ctx.fillStyle = 'rgba(74,222,128,' + (0.3 + wRow[j] * 0.7) + ')';
        ctx.fillRect(swX, by, swBarW, barH - 1);

        // Weight value
        ctx.fillStyle = c.text;
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(wRow[j].toFixed(3), swX + swW + 4, by + barH - 3);
      }

      // Column headers
      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('raw score', panelX + 65 + panelW * 0.175, vecY - 4);
      ctx.fillText('softmax', panelX + 65 + panelW * 0.35 + 35 + panelW * 0.1, vecY - 4);

      // Interpretation
      var interpY = vecY + T * (barH + 3) + 16;
      var maxJ = 0;
      for (var j = 1; j < T; j++) {
        if (wRow[j] > wRow[maxJ]) maxJ = j;
      }
      ctx.fillStyle = c.math;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('"' + tokens[sel] + '" attends most to "' + tokens[maxJ] + '" (' + (wRow[maxJ] * 100).toFixed(1) + '%)', panelX, interpY);

    } else if (panelW > 80) {
      // No token selected — show instructions
      ctx.fillStyle = c.textDim;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Click a token to inspect', panelX, PAD.top + 60);
      ctx.fillText('its Q/K dot products', panelX, PAD.top + 78);
      ctx.fillText('and attention weights.', panelX, PAD.top + 96);

      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = c.ai;
      ctx.fillText('Each row in the heatmap', panelX, PAD.top + 130);
      ctx.fillText('shows how much a query', panelX, PAD.top + 146);
      ctx.fillText('token attends to each key.', panelX, PAD.top + 162);
    }

    // ─── Bottom: computation formula ───
    var formulaY = HEIGHT - 30;
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Attention(Q,K,V) = softmax(QK\u1D40 / \u221Ad\u2096) \u00b7 V', WIDTH / 2, formulaY);
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('DSP: QK\u1D40 = cross-correlation matrix \u2014 softmax = adaptive normalization', WIDTH / 2, formulaY + 14);
  }

  function drawVectorBar(x, y, maxW, label, vec, color, c) {
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y);

    var barW = Math.min(maxW, 200);
    var cellW = barW / vec.length;
    var maxVal = 0;
    for (var i = 0; i < vec.length; i++) maxVal = Math.max(maxVal, Math.abs(vec[i]));

    for (var i = 0; i < vec.length; i++) {
      var norm = vec[i] / (maxVal + 1e-10);
      var alpha = 0.2 + Math.abs(norm) * 0.8;
      if (norm >= 0) {
        ctx.fillStyle = 'rgba(56,189,248,' + alpha + ')';
      } else {
        ctx.fillStyle = 'rgba(251,113,133,' + alpha + ')';
      }
      ctx.fillRect(x + i * cellW, y + 4, cellW - 1, 16);

      if (cellW > 18) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '6px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(vec[i].toFixed(1), x + i * cellW + cellW / 2, y + 15);
      }
    }
  }

  // ─── Math Utilities ───

  function randomMatrix(rows, cols, rng) {
    var mat = [];
    var scale = Math.sqrt(2.0 / (rows + cols));
    for (var i = 0; i < rows; i++) {
      var row = [];
      for (var j = 0; j < cols; j++) {
        row.push((rng() - 0.5) * 2 * scale);
      }
      mat.push(row);
    }
    return mat;
  }

  function matMul(A, B) {
    // A: M x N,  B: N x P  =>  C: M x P
    var M = A.length, N = A[0].length, P = B[0].length;
    var C = [];
    for (var i = 0; i < M; i++) {
      var row = new Array(P).fill(0);
      for (var k = 0; k < N; k++) {
        for (var j = 0; j < P; j++) {
          row[j] += A[i][k] * B[k][j];
        }
      }
      C.push(row);
    }
    return C;
  }

  function softmax(arr) {
    var max = -Infinity;
    for (var i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    var exps = [];
    var sum = 0;
    for (var i = 0; i < arr.length; i++) {
      var e = Math.exp(arr[i] - max);
      exps.push(e);
      sum += e;
    }
    for (var i = 0; i < arr.length; i++) exps[i] /= sum;
    return exps;
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
