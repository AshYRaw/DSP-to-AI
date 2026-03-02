/* ============================================================
   Tool 20.3 — Head-to-Head Arena
   Feed the same task to simplified Attention and Mamba.
   Attention: shows similarity/attention matrix (heatmap).
   Mamba: shows state evolution (trajectory + Δ).
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.Arena = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;

  var T = 20;  // sequence length
  var N = 8;   // Mamba state dim

  var state = {
    task: 'retrieval',
    step: 0,
    running: false
  };
  var runTimer = null;

  // Data
  var inputSeq = [];
  var tokenLabels = [];
  var isKey = [];

  // Attention data
  var attnMatrix = [];   // T x T attention weights
  var attnOutput = [];

  // Mamba data
  var mambaState = [];   // T x N state snapshots
  var mambaOutput = [];
  var mambaDelta = [];

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Arena benchmark comparing attention and Mamba on retrieval and pattern tasks');
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

    bindSelect(containerEl, 'arena-task', function (v) { state.task = v; generateAndRun(); });
    bindAction(containerEl, 'arena-run', function () { startRun(); });
    bindAction(containerEl, 'arena-reset', function () { resetRun(); });

    generateAndRun();
    resize();
  }

  function generateAndRun() {
    generateTask();
    simulateBoth();
    state.step = T - 1; // show full result
    stopRun();
    render();
  }

  function generateTask() {
    inputSeq = new Float64Array(T);
    tokenLabels = [];
    isKey = [];

    if (state.task === 'retrieval') {
      // Key=0.9 at position 2, Value=0.7 at position 3, noise, query at T-2
      for (var i = 0; i < T; i++) {
        if (i === 2) {
          inputSeq[i] = 0.9; tokenLabels.push('K'); isKey.push(true);
        } else if (i === 3) {
          inputSeq[i] = 0.7; tokenLabels.push('V'); isKey.push(true);
        } else if (i === T - 2) {
          inputSeq[i] = 0.85; tokenLabels.push('Q'); isKey.push(true);
        } else {
          inputSeq[i] = Math.random() * 0.15;
          tokenLabels.push('·');
          isKey.push(false);
        }
      }
    } else if (state.task === 'longrange') {
      // Pattern: signal at start, must be detected at end
      for (var i = 0; i < T; i++) {
        if (i < 3) {
          inputSeq[i] = 0.3 + 0.2 * i;
          tokenLabels.push('P' + i);
          isKey.push(true);
        } else if (i >= T - 3) {
          inputSeq[i] = 0.3 + 0.2 * (i - T + 3);
          tokenLabels.push('P' + (i - T + 3) + '?');
          isKey.push(true);
        } else {
          inputSeq[i] = Math.random() * 0.1;
          tokenLabels.push('·');
          isKey.push(false);
        }
      }
    } else if (state.task === 'local') {
      // Local bigram/trigram patterns
      for (var i = 0; i < T; i++) {
        inputSeq[i] = 0.5 + 0.4 * Math.sin(2 * Math.PI * i / 4);
        tokenLabels.push(i.toString());
        isKey.push(inputSeq[i] > 0.7);
      }
    } else { // selective
      // Copy only marked tokens
      var marks = [1, 4, 8, 12, 16];
      for (var i = 0; i < T; i++) {
        if (marks.indexOf(i) >= 0) {
          inputSeq[i] = 0.6 + Math.random() * 0.4;
          tokenLabels.push('C');
          isKey.push(true);
        } else {
          inputSeq[i] = Math.random() * 0.2;
          tokenLabels.push('·');
          isKey.push(false);
        }
      }
    }
  }

  function simulateBoth() {
    simulateAttention();
    simulateMamba();
  }

  function simulateAttention() {
    // Simplified: Q[n] = K[n] = V[n] = input[n] (single-dim self-attention)
    // Attention weights: softmax(Q[n] * K[k] / sqrt(d)) for k <= n
    attnMatrix = [];
    attnOutput = new Float64Array(T);

    for (var n = 0; n < T; n++) {
      var row = new Float64Array(T);
      var maxScore = -Infinity;

      // Compute scores (causal: only k <= n)
      for (var k = 0; k <= n; k++) {
        // Use multiple features for richer attention patterns
        var score = inputSeq[n] * inputSeq[k] * 3.0;
        // Boost for similar values (retrieval mechanism)
        score += Math.exp(-Math.abs(inputSeq[n] - inputSeq[k]) * 5);
        // Recency bias
        score += 0.3 / (1 + (n - k) * 0.1);
        row[k] = score;
        if (score > maxScore) maxScore = score;
      }

      // Softmax
      var expSum = 0;
      for (var k = 0; k <= n; k++) {
        row[k] = Math.exp(row[k] - maxScore);
        expSum += row[k];
      }
      for (var k = 0; k <= n; k++) {
        row[k] /= expSum;
      }

      // Output = weighted sum of values
      var y = 0;
      for (var k = 0; k <= n; k++) {
        y += row[k] * inputSeq[k];
      }
      attnOutput[n] = y;
      attnMatrix.push(row);
    }
  }

  function simulateMamba() {
    var A_diag = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      A_diag[i] = -(i + 1) * 0.5;
    }

    mambaState = [];
    mambaOutput = new Float64Array(T);
    mambaDelta = new Float64Array(T);
    var x = new Float64Array(N);

    for (var n = 0; n < T; n++) {
      // Input-dependent Δ
      var rawDt = inputSeq[n] * 3.0 - 0.5;
      var dt = Math.log(1 + Math.exp(rawDt));
      if (isKey[n]) dt = Math.max(dt, 0.6);
      else dt = Math.min(dt, 0.15);
      mambaDelta[n] = dt;

      // B, C input-dependent
      var B = new Float64Array(N);
      var C = new Float64Array(N);
      for (var i = 0; i < N; i++) {
        B[i] = Math.sin(inputSeq[n] * (i + 1) * 2.0 + 0.5) * 0.4 + 0.5;
        C[i] = Math.cos(inputSeq[n] * (i + 1) * 1.7 + 0.3) * 0.4 + 0.5;
      }

      var newX = new Float64Array(N);
      var y = 0;
      for (var i = 0; i < N; i++) {
        var a_bar = Math.exp(A_diag[i] * dt);
        newX[i] = a_bar * x[i] + dt * B[i] * inputSeq[n];
        y += C[i] * newX[i];
      }
      x = newX;
      mambaState.push(new Float64Array(x));
      mambaOutput[n] = y / N;
    }
  }

  function startRun() {
    stopRun();
    state.step = 0;
    state.running = true;
    render();
    runTimer = setInterval(function () {
      state.step++;
      render();
      if (state.step >= T - 1) {
        stopRun();
      }
    }, 200);
  }

  function stopRun() {
    state.running = false;
    if (runTimer) { clearInterval(runTimer); runTimer = null; }
  }

  function resetRun() {
    stopRun();
    state.step = 0;
    generateAndRun();
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var PAD = 12;
    var midX = WIDTH / 2;
    var step = Math.min(state.step, T - 1);

    // ─── Header ───
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    var taskLabel = {
      retrieval: 'EXACT RETRIEVAL — find value associated with key',
      longrange: 'LONG-RANGE DEPENDENCY — connect start to end',
      local: 'LOCAL PATTERNS — nearby periodic structure',
      selective: 'SELECTIVE COPY — copy only marked tokens'
    };
    ctx.fillText(taskLabel[state.task] || '', WIDTH / 2, PAD + 8);

    // ─── Input tokens row ───
    var tokY = PAD + 16;
    var tokH = 22;
    var tokLeft = PAD + 4;
    var tokRight = WIDTH - PAD - 4;
    var tokW = (tokRight - tokLeft) / T;

    for (var n = 0; n < T; n++) {
      var tx = tokLeft + n * tokW;
      var opacity = n <= step ? 1.0 : 0.15;
      ctx.globalAlpha = opacity;
      ctx.fillStyle = isKey[n] ? c.ai : 'rgba(148,163,184,0.3)';
      ctx.fillRect(tx + 0.5, tokY, tokW - 1, tokH);
      ctx.fillStyle = isKey[n] ? c.ai : c.textDim;
      ctx.font = '6px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tokenLabels[n], tx + tokW / 2, tokY + tokH + 8);
      ctx.globalAlpha = 1;
    }

    // ─── LEFT: Attention ───
    var colW = midX - PAD - 8;
    var colY = tokY + tokH + 18;

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ATTENTION', PAD, colY);
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillText('similarity matrix (all pairs)', PAD + 75, colY);

    // Attention matrix heatmap
    var matY = colY + 8;
    var matSize = Math.min(colW - 10, (HEIGHT - matY - 90));
    var cellSize = matSize / T;

    // Find max weight for scaling
    var maxW = 0;
    for (var n = 0; n <= step; n++) {
      for (var k = 0; k < T; k++) {
        if (attnMatrix[n][k] > maxW) maxW = attnMatrix[n][k];
      }
    }

    for (var n = 0; n <= step; n++) {
      for (var k = 0; k <= n; k++) {
        var val = attnMatrix[n][k] / Math.max(maxW, 0.001);
        var cx = PAD + k * cellSize;
        var cy = matY + n * cellSize;
        ctx.fillStyle = 'rgba(96,165,250,' + (val * 0.85).toFixed(3) + ')';
        ctx.fillRect(cx, cy, cellSize - 0.5, cellSize - 0.5);
      }
    }

    // Matrix axes
    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('keys (k)', PAD + matSize / 2, matY + matSize + 10);
    ctx.save();
    ctx.translate(PAD - 6, matY + matSize / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('queries (n)', 0, 0);
    ctx.restore();

    // Attention output
    var attnOutY = matY + matSize + 18;
    var outH = Math.max(25, HEIGHT - attnOutY - 30);

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Output', PAD, attnOutY - 2);

    drawOutputBar(PAD, attnOutY, colW, outH, attnOutput, step, '#60a5fa');

    // ─── Divider ───
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(midX, colY - 6);
    ctx.lineTo(midX, HEIGHT - 20);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ─── RIGHT: Mamba ───
    var rightX = midX + 8;

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MAMBA', rightX, colY);
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillText('state evolution (compressed)', rightX + 52, colY);

    // Δ bar
    var dtY = colY + 8;
    var dtH = 16;
    var maxDt = 0.01;
    for (var n = 0; n < T; n++) {
      if (mambaDelta[n] > maxDt) maxDt = mambaDelta[n];
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Δ[n]', rightX, dtY - 1);

    var mambaTokenW = colW / T;
    for (var n = 0; n <= step && n < T; n++) {
      var tx = rightX + n * mambaTokenW;
      var intensity = mambaDelta[n] / maxDt;
      ctx.fillStyle = 'rgba(74,222,128,' + (0.2 + intensity * 0.7).toFixed(2) + ')';
      var barH = intensity * dtH;
      ctx.fillRect(tx + 0.5, dtY + dtH - barH, mambaTokenW - 1, barH);
    }

    // State heatmap
    var stY = dtY + dtH + 6;
    var stCellH = Math.max(6, Math.min(12, (matSize - dtH - 20) / N));
    var stateH = N * stCellH;

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('State x[n]', rightX, stY - 1);

    var maxSt = 0.001;
    for (var n = 0; n < mambaState.length; n++) {
      for (var i = 0; i < N; i++) {
        if (Math.abs(mambaState[n][i]) > maxSt) maxSt = Math.abs(mambaState[n][i]);
      }
    }

    for (var n = 0; n <= step && n < T; n++) {
      var tx = rightX + n * mambaTokenW;
      for (var i = 0; i < N; i++) {
        var val = mambaState[n][i] / maxSt;
        var cy = stY + i * stCellH;
        if (val >= 0) {
          ctx.fillStyle = 'rgba(74,222,128,' + (val * 0.75).toFixed(3) + ')';
        } else {
          ctx.fillStyle = 'rgba(251,113,133,' + ((-val) * 0.75).toFixed(3) + ')';
        }
        ctx.fillRect(tx + 0.5, cy, mambaTokenW - 1, stCellH - 1);
      }
    }

    // State dim labels
    ctx.fillStyle = c.textDim;
    ctx.font = '5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (var i = 0; i < N; i++) {
      ctx.fillText('x' + i, rightX - 2, stY + i * stCellH + stCellH - 1);
    }

    // State magnitude over time
    var magY = stY + stateH + 8;
    var magH = Math.max(30, matSize - stateH - dtH - 30);

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('||state|| (memory utilization)', rightX, magY - 1);

    var maxMag = 0.001;
    for (var n = 0; n < mambaState.length; n++) {
      var mag = 0;
      for (var i = 0; i < N; i++) mag += mambaState[n][i] * mambaState[n][i];
      mag = Math.sqrt(mag);
      if (mag > maxMag) maxMag = mag;
    }

    ctx.beginPath();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    for (var n = 0; n <= step && n < T; n++) {
      var mag = 0;
      for (var i = 0; i < N; i++) mag += mambaState[n][i] * mambaState[n][i];
      mag = Math.sqrt(mag);
      var px = rightX + n * mambaTokenW + mambaTokenW / 2;
      var py = magY + magH - (mag / maxMag) * magH * 0.85;
      if (n === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Mamba output
    var mambaOutY = matY + matSize + 18;

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Output', rightX, mambaOutY - 2);

    drawOutputBar(rightX, mambaOutY, colW, outH, mambaOutput, step, '#4ade80');

    // ─── Bottom verdict ───
    var verdictY = HEIGHT - 12;
    var verdicts = {
      retrieval: 'Attention: direct key-value access via bright off-diagonal spots. Mamba: key may decay in compressed state.',
      longrange: 'Mamba: state carries info cheaply across all tokens. Attention: O(T²) cost or sparse approximation needed.',
      local: 'Both handle local patterns well. Attention diagonal band ≈ Mamba rapid state updates.',
      selective: 'Both compete: Attention looks back selectively. Mamba filters with Δ gating.'
    };
    ctx.fillStyle = c.bridge;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(verdicts[state.task] || '', WIDTH / 2, verdictY);

    // Step counter
    ctx.fillStyle = c.text;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Step ' + step + '/' + (T - 1), WIDTH - PAD, verdictY);
  }

  function drawOutputBar(x0, y0, w, h, output, maxN, color) {
    var maxOut = 0.001;
    for (var n = 0; n < T; n++) {
      if (Math.abs(output[n]) > maxOut) maxOut = Math.abs(output[n]);
    }

    // Zero line
    ctx.strokeStyle = 'rgba(148,163,184,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h / 2);
    ctx.lineTo(x0 + w, y0 + h / 2);
    ctx.stroke();

    var tokW = w / T;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (var n = 0; n <= maxN && n < T; n++) {
      var px = x0 + n * tokW + tokW / 2;
      var py = y0 + h / 2 - (output[n] / maxOut) * h * 0.4;
      if (n === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    for (var n = 0; n <= maxN && n < T; n++) {
      var px = x0 + n * tokW + tokW / 2;
      var py = y0 + h / 2 - (output[n] / maxOut) * h * 0.4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  function bindAction(cont, name, callback) {
    var btns = cont.querySelectorAll('[data-action="' + name + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', callback);
    }
  }

  return { init: init };
})();
