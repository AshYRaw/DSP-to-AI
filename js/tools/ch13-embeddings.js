/* ============================================================
   Tool 13.1 — Embedding Space Explorer
   2D projection of word embeddings with analogy solver,
   nearest neighbors, semantic clusters.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.EmbeddingExplorer = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var PAD = { top: 30, right: 180, bottom: 30, left: 50 };

  // Pre-computed mini embedding set (50 words, 8-dim, with 2D projections)
  // Clusters: animals, colors, numbers, countries, emotions, food, tech
  var words = [];
  var embeddings = [];  // 8-dim vectors
  var proj2D = [];      // 2D projections
  var clusters = [];    // cluster index per word

  var clusterNames = ['Animals', 'Colors', 'Numbers', 'Countries', 'Emotions', 'Food', 'Tech'];
  var clusterColors;

  var state = {
    hoveredIdx: -1,
    selectedA: -1,
    selectedB: -1,
    selectedC: -1,
    analogyResult: -1,
    showClusters: true,
    showAnalogy: false
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Word embedding explorer showing semantic relationships in vector space');
    canvas.setAttribute('tabindex', '0');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      containerEl.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    clusterColors = Plot.SIGNAL_COLORS;
    generateEmbeddings();

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(460, Math.min(560, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Mouse interactions
    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var idx = findNearest(mx, my);
      if (idx !== state.hoveredIdx) {
        state.hoveredIdx = idx;
        render();
      }
    });

    canvas.addEventListener('click', function (e) {
      if (state.hoveredIdx < 0) return;
      if (!state.showAnalogy) return;

      if (state.selectedA < 0) {
        state.selectedA = state.hoveredIdx;
      } else if (state.selectedB < 0) {
        state.selectedB = state.hoveredIdx;
      } else if (state.selectedC < 0) {
        state.selectedC = state.hoveredIdx;
        solveAnalogy();
      } else {
        // Reset
        state.selectedA = state.hoveredIdx;
        state.selectedB = -1;
        state.selectedC = -1;
        state.analogyResult = -1;
      }
      render();
    });

    // Controls
    var analogyBtn = containerEl.querySelector('[data-action="emb-analogy"]');
    if (analogyBtn) analogyBtn.addEventListener('click', function () {
      state.showAnalogy = !state.showAnalogy;
      state.selectedA = -1;
      state.selectedB = -1;
      state.selectedC = -1;
      state.analogyResult = -1;
      render();
    });

    var resetBtn = containerEl.querySelector('[data-action="emb-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      state.selectedA = -1;
      state.selectedB = -1;
      state.selectedC = -1;
      state.analogyResult = -1;
      render();
    });

    // Preset analogies
    bindSelect(containerEl, 'emb-preset', function (v) {
      if (v === 'none') {
        state.selectedA = -1; state.selectedB = -1; state.selectedC = -1; state.analogyResult = -1;
      } else {
        var parts = v.split(',');
        state.selectedA = findWord(parts[0]);
        state.selectedB = findWord(parts[1]);
        state.selectedC = findWord(parts[2]);
        state.showAnalogy = true;
        if (state.selectedA >= 0 && state.selectedB >= 0 && state.selectedC >= 0) {
          solveAnalogy();
        }
      }
      render();
    });

    resize();
  }

  // ─── Embedding Generation ───

  function generateEmbeddings() {
    var rng = mulberry32(2024);

    var wordData = [
      // Animals (cluster 0)
      { w: 'cat', c: 0 }, { w: 'dog', c: 0 }, { w: 'fish', c: 0 }, { w: 'bird', c: 0 },
      { w: 'horse', c: 0 }, { w: 'lion', c: 0 }, { w: 'mouse', c: 0 },
      // Colors (cluster 1)
      { w: 'red', c: 1 }, { w: 'blue', c: 1 }, { w: 'green', c: 1 }, { w: 'yellow', c: 1 },
      { w: 'black', c: 1 }, { w: 'white', c: 1 }, { w: 'purple', c: 1 },
      // Numbers (cluster 2)
      { w: 'one', c: 2 }, { w: 'two', c: 2 }, { w: 'three', c: 2 }, { w: 'four', c: 2 },
      { w: 'five', c: 2 }, { w: 'ten', c: 2 }, { w: 'hundred', c: 2 },
      // Countries (cluster 3)
      { w: 'france', c: 3 }, { w: 'germany', c: 3 }, { w: 'japan', c: 3 }, { w: 'india', c: 3 },
      { w: 'brazil', c: 3 }, { w: 'china', c: 3 }, { w: 'italy', c: 3 },
      // Emotions (cluster 4)
      { w: 'happy', c: 4 }, { w: 'sad', c: 4 }, { w: 'angry', c: 4 }, { w: 'love', c: 4 },
      { w: 'fear', c: 4 }, { w: 'joy', c: 4 }, { w: 'calm', c: 4 },
      // Food (cluster 5)
      { w: 'bread', c: 5 }, { w: 'rice', c: 5 }, { w: 'pasta', c: 5 }, { w: 'pizza', c: 5 },
      { w: 'sushi', c: 5 }, { w: 'cake', c: 5 }, { w: 'soup', c: 5 },
      // Tech (cluster 6)
      { w: 'code', c: 6 }, { w: 'data', c: 6 }, { w: 'neural', c: 6 }, { w: 'signal', c: 6 },
      { w: 'filter', c: 6 }, { w: 'model', c: 6 }, { w: 'train', c: 6 }
    ];

    // Generate 8-dim embeddings with cluster structure
    var clusterCenters = [];
    for (var ci = 0; ci < 7; ci++) {
      var center = [];
      for (var d = 0; d < 8; d++) center.push((rng() - 0.5) * 4);
      clusterCenters.push(center);
    }

    words = [];
    embeddings = [];
    clusters = [];

    for (var i = 0; i < wordData.length; i++) {
      var wd = wordData[i];
      words.push(wd.w);
      clusters.push(wd.c);
      var emb = new Float64Array(8);
      for (var d = 0; d < 8; d++) {
        emb[d] = clusterCenters[wd.c][d] + (rng() - 0.5) * 1.5;
      }
      embeddings.push(emb);
    }

    // Add analogy structure: country→capital-like relationships
    // Make france-italy ≈ japan-china direction consistent
    var countryOffset = [0.3, -0.2, 0.1, 0.4, -0.1, 0.2, 0.15, -0.05];
    var countryIdxs = [];
    for (var i = 0; i < words.length; i++) {
      if (clusters[i] === 3) countryIdxs.push(i);
    }
    // Make sequential countries have structured offsets
    for (var ci = 1; ci < countryIdxs.length; ci++) {
      for (var d = 0; d < 8; d++) {
        embeddings[countryIdxs[ci]][d] = embeddings[countryIdxs[0]][d] + countryOffset[d] * ci + (rng() - 0.5) * 0.3;
      }
    }

    // Compute 2D projections using simple PCA-like approach
    compute2DProjection();
  }

  function compute2DProjection() {
    // Simple dimensionality reduction: use first two principal components
    // Compute mean
    var mean = new Float64Array(8);
    for (var i = 0; i < embeddings.length; i++) {
      for (var d = 0; d < 8; d++) mean[d] += embeddings[i][d];
    }
    for (var d = 0; d < 8; d++) mean[d] /= embeddings.length;

    // Center data
    var centered = [];
    for (var i = 0; i < embeddings.length; i++) {
      var c = new Float64Array(8);
      for (var d = 0; d < 8; d++) c[d] = embeddings[i][d] - mean[d];
      centered.push(c);
    }

    // Power iteration for top 2 components
    var pc1 = powerIteration(centered, null);
    var pc2 = powerIteration(centered, pc1);

    proj2D = [];
    for (var i = 0; i < embeddings.length; i++) {
      var x = dot8(centered[i], pc1);
      var y = dot8(centered[i], pc2);
      proj2D.push({ x: x, y: y });
    }

    // Normalize to [-1, 1]
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < proj2D.length; i++) {
      if (proj2D[i].x < minX) minX = proj2D[i].x;
      if (proj2D[i].x > maxX) maxX = proj2D[i].x;
      if (proj2D[i].y < minY) minY = proj2D[i].y;
      if (proj2D[i].y > maxY) maxY = proj2D[i].y;
    }
    var rangeX = maxX - minX || 1;
    var rangeY = maxY - minY || 1;
    for (var i = 0; i < proj2D.length; i++) {
      proj2D[i].x = ((proj2D[i].x - minX) / rangeX) * 2 - 1;
      proj2D[i].y = ((proj2D[i].y - minY) / rangeY) * 2 - 1;
    }
  }

  function powerIteration(data, deflect) {
    var rng2 = mulberry32(77);
    var v = new Float64Array(8);
    for (var d = 0; d < 8; d++) v[d] = rng2() - 0.5;

    for (var iter = 0; iter < 50; iter++) {
      var newV = new Float64Array(8);
      for (var i = 0; i < data.length; i++) {
        var proj = dot8(data[i], v);
        for (var d = 0; d < 8; d++) newV[d] += proj * data[i][d];
      }
      // Deflate previous component
      if (deflect) {
        var proj = dot8(newV, deflect);
        for (var d = 0; d < 8; d++) newV[d] -= proj * deflect[d];
      }
      // Normalize
      var norm = 0;
      for (var d = 0; d < 8; d++) norm += newV[d] * newV[d];
      norm = Math.sqrt(norm) || 1;
      for (var d = 0; d < 8; d++) v[d] = newV[d] / norm;
    }
    return v;
  }

  function dot8(a, b) {
    var s = 0;
    for (var d = 0; d < 8; d++) s += a[d] * b[d];
    return s;
  }

  // ─── Analogy Solver ───

  function solveAnalogy() {
    // A is to B as C is to ?
    // ? = C + (B - A)
    var target = new Float64Array(8);
    for (var d = 0; d < 8; d++) {
      target[d] = embeddings[state.selectedC][d] + embeddings[state.selectedB][d] - embeddings[state.selectedA][d];
    }

    // Find nearest word (excluding A, B, C)
    var bestIdx = -1;
    var bestDist = Infinity;
    for (var i = 0; i < embeddings.length; i++) {
      if (i === state.selectedA || i === state.selectedB || i === state.selectedC) continue;
      var dist = 0;
      for (var d = 0; d < 8; d++) {
        var diff = embeddings[i][d] - target[d];
        dist += diff * diff;
      }
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    state.analogyResult = bestIdx;
  }

  function findWord(w) {
    for (var i = 0; i < words.length; i++) {
      if (words[i] === w) return i;
    }
    return -1;
  }

  // ─── Interaction ───

  function findNearest(mx, my) {
    var plotW = WIDTH - PAD.left - PAD.right;
    var plotH = HEIGHT - PAD.top - PAD.bottom;
    var best = -1;
    var bestD = 20; // snap radius in pixels

    for (var i = 0; i < proj2D.length; i++) {
      var px = PAD.left + ((proj2D[i].x + 1) / 2) * plotW;
      var py = PAD.top + ((1 - proj2D[i].y) / 2) * plotH;
      var dx = mx - px;
      var dy = my - py;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function cosineSim(a, b) {
    var dot = 0, na = 0, nb = 0;
    for (var d = 0; d < 8; d++) {
      dot += a[d] * b[d];
      na += a[d] * a[d];
      nb += b[d] * b[d];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var plotH = HEIGHT - PAD.top - PAD.bottom;

    // Title
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('EMBEDDING SPACE (8-dim \u2192 2D projection)', PAD.left, PAD.top - 8);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

    // Analogy arrow
    if (state.showAnalogy && state.selectedA >= 0 && state.selectedB >= 0) {
      drawAnalogyArrow(plotW, plotH, c);
    }

    // Draw points
    for (var i = 0; i < words.length; i++) {
      var px = PAD.left + ((proj2D[i].x + 1) / 2) * plotW;
      var py = PAD.top + ((1 - proj2D[i].y) / 2) * plotH;
      var color = clusterColors[clusters[i] % clusterColors.length];

      var isSelected = (i === state.selectedA || i === state.selectedB || i === state.selectedC || i === state.analogyResult);
      var isHovered = (i === state.hoveredIdx);
      var radius = isSelected ? 7 : (isHovered ? 6 : 4);

      // Glow for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = color + '30';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = isSelected || isHovered ? 1 : 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Label
      if (isHovered || isSelected) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.strokeText(words[i], px, py - radius - 4);
        ctx.fillText(words[i], px, py - radius - 4);
      } else {
        ctx.fillStyle = color;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.7;
        ctx.fillText(words[i], px, py - radius - 2);
        ctx.globalAlpha = 1;
      }

      // Selection labels (A, B, C, ?)
      if (i === state.selectedA) drawSelLabel(px, py + radius + 12, 'A', c.dsp);
      if (i === state.selectedB) drawSelLabel(px, py + radius + 12, 'B', c.ai);
      if (i === state.selectedC) drawSelLabel(px, py + radius + 12, 'C', c.math);
      if (i === state.analogyResult) drawSelLabel(px, py + radius + 12, '?', c.danger);
    }

    // ─── Right Panel ───
    var panelX = WIDTH - PAD.right + 10;
    var panelY = PAD.top;

    // Cluster legend
    ctx.fillStyle = c.text;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CLUSTERS', panelX, panelY + 10);

    for (var ci = 0; ci < clusterNames.length; ci++) {
      var ly = panelY + 24 + ci * 16;
      ctx.beginPath();
      ctx.arc(panelX + 5, ly, 4, 0, Math.PI * 2);
      ctx.fillStyle = clusterColors[ci];
      ctx.fill();
      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText(clusterNames[ci], panelX + 14, ly + 3);
    }

    // Hovered word info
    var infoY = panelY + 150;
    if (state.hoveredIdx >= 0) {
      var hi = state.hoveredIdx;
      ctx.fillStyle = c.text;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(words[hi].toUpperCase(), panelX, infoY);
      infoY += 16;

      ctx.fillStyle = c.textDim;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('Cluster: ' + clusterNames[clusters[hi]], panelX, infoY);
      infoY += 14;

      // Nearest neighbors
      ctx.fillText('Nearest:', panelX, infoY);
      infoY += 12;
      var neighbors = getNearestNeighbors(hi, 5);
      for (var ni = 0; ni < neighbors.length; ni++) {
        var sim = cosineSim(embeddings[hi], embeddings[neighbors[ni]]);
        ctx.fillStyle = clusterColors[clusters[neighbors[ni]]];
        ctx.fillText(words[neighbors[ni]] + ' (' + sim.toFixed(2) + ')', panelX + 4, infoY);
        infoY += 11;
      }
    }

    // Analogy status
    if (state.showAnalogy) {
      infoY = Math.max(infoY + 10, panelY + 320);
      ctx.fillStyle = c.text;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('ANALOGY', panelX, infoY);
      infoY += 16;

      ctx.font = '9px "JetBrains Mono", monospace';
      var aText = state.selectedA >= 0 ? words[state.selectedA] : '___';
      var bText = state.selectedB >= 0 ? words[state.selectedB] : '___';
      var cText = state.selectedC >= 0 ? words[state.selectedC] : '___';
      var dText = state.analogyResult >= 0 ? words[state.analogyResult] : '?';

      ctx.fillStyle = c.dsp;
      ctx.fillText(aText, panelX, infoY);
      ctx.fillStyle = c.textDim;
      ctx.fillText(' is to ', panelX + ctx.measureText(aText).width, infoY);
      infoY += 13;
      ctx.fillStyle = c.ai;
      ctx.fillText(bText, panelX, infoY);
      ctx.fillStyle = c.textDim;
      ctx.fillText(' as ', panelX + ctx.measureText(bText).width, infoY);
      infoY += 13;
      ctx.fillStyle = c.math;
      ctx.fillText(cText, panelX, infoY);
      ctx.fillStyle = c.textDim;
      ctx.fillText(' is to ', panelX + ctx.measureText(cText).width, infoY);
      infoY += 13;
      ctx.fillStyle = c.danger;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText(dText, panelX, infoY);

      if (state.selectedA < 0) {
        infoY += 18;
        ctx.fillStyle = c.textDim;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText('Click A, then B, then C', panelX, infoY);
      }
    }
  }

  function drawAnalogyArrow(plotW, plotH, c) {
    var getXY = function (idx) {
      return {
        x: PAD.left + ((proj2D[idx].x + 1) / 2) * plotW,
        y: PAD.top + ((1 - proj2D[idx].y) / 2) * plotH
      };
    };

    // A → B arrow
    if (state.selectedA >= 0 && state.selectedB >= 0) {
      var a = getXY(state.selectedA);
      var b = getXY(state.selectedB);
      drawArrow(a.x, a.y, b.x, b.y, 'rgba(255,255,255,0.4)', 2);
    }

    // C → ? arrow (parallel to A→B)
    if (state.selectedC >= 0 && state.analogyResult >= 0) {
      var cc = getXY(state.selectedC);
      var d = getXY(state.analogyResult);
      drawArrow(cc.x, cc.y, d.x, d.y, 'rgba(251,113,133,0.6)', 2);
    }
  }

  function drawArrow(x1, y1, x2, y2, color, lw) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    var angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 10 * Math.cos(angle - 0.3), y2 - 10 * Math.sin(angle - 0.3));
    ctx.lineTo(x2 - 10 * Math.cos(angle + 0.3), y2 - 10 * Math.sin(angle + 0.3));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawSelLabel(x, y, label, color) {
    ctx.fillStyle = color;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y);
  }

  function getNearestNeighbors(idx, k) {
    var dists = [];
    for (var i = 0; i < embeddings.length; i++) {
      if (i === idx) continue;
      var dist = 0;
      for (var d = 0; d < 8; d++) {
        var diff = embeddings[i][d] - embeddings[idx][d];
        dist += diff * diff;
      }
      dists.push({ idx: i, dist: dist });
    }
    dists.sort(function (a, b) { return a.dist - b.dist; });
    var result = [];
    for (var i = 0; i < Math.min(k, dists.length); i++) result.push(dists[i].idx);
    return result;
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

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
