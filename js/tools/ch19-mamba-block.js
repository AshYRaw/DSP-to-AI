/* ============================================================
   Tool 19.1 — Mamba Block Simulator
   Visualizes data flow through a Mamba block: linear expand,
   Conv1D, selective SSM (Δ,B,C input-dependent), gating, project.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.MambaBlock = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 620;

  var T = 16; // sequence length
  var state = {
    inputType: 'selective',
    N: 8,           // state dimension
    expand: 2,      // expansion factor
    observeToken: 8
  };

  // Simulated data
  var inputSeq = [];      // T values
  var tokenLabels = [];   // labels for each token
  var isKeyword = [];     // boolean mask
  var deltaValues = [];   // Δ[n] per token
  var stateHistory = [];  // N-dim state at each step
  var outputSeq = [];     // final output
  var gateValues = [];    // gating branch values

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Mamba block architecture simulator showing selective state space operation');
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
      HEIGHT = Math.max(560, Math.min(660, WIDTH * 0.82));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSelect(containerEl, 'mamba-input', function (v) { state.inputType = v; simulate(); render(); });
    bindSelect(containerEl, 'mamba-N', function (v) { state.N = parseInt(v, 10); simulate(); render(); });
    bindSlider(containerEl, 'mamba-expand', function (v) { state.expand = parseInt(v, 10); simulate(); render(); });
    bindSlider(containerEl, 'mamba-token', function (v) { state.observeToken = parseInt(v, 10); render(); });

    simulate();
    resize();
  }

  function generateInput() {
    inputSeq = new Float64Array(T);
    tokenLabels = [];
    isKeyword = [];

    if (state.inputType === 'selective') {
      // Keywords scattered in noise
      var keywords = [2, 5, 9, 13];
      for (var i = 0; i < T; i++) {
        if (keywords.indexOf(i) >= 0) {
          inputSeq[i] = 0.8 + Math.random() * 0.2;
          tokenLabels.push('K' + keywords.indexOf(i));
          isKeyword.push(true);
        } else {
          inputSeq[i] = Math.random() * 0.3;
          tokenLabels.push('n');
          isKeyword.push(false);
        }
      }
    } else if (state.inputType === 'memorize') {
      // A, B at start, noise, then query for A, B
      var vals = [0.9, 0.7];
      inputSeq[0] = vals[0]; tokenLabels.push('A'); isKeyword.push(true);
      inputSeq[1] = vals[1]; tokenLabels.push('B'); isKeyword.push(true);
      for (var i = 2; i < T - 2; i++) {
        inputSeq[i] = Math.random() * 0.2;
        tokenLabels.push('.');
        isKeyword.push(false);
      }
      inputSeq[T - 2] = 0.5; tokenLabels.push('?A'); isKeyword.push(true);
      inputSeq[T - 1] = 0.5; tokenLabels.push('?B'); isKeyword.push(true);
    } else if (state.inputType === 'impulse') {
      for (var i = 0; i < T; i++) {
        inputSeq[i] = (i === 4) ? 1.0 : 0.0;
        tokenLabels.push(i === 4 ? 'δ' : '0');
        isKeyword.push(i === 4);
      }
    } else { // periodic
      for (var i = 0; i < T; i++) {
        inputSeq[i] = 0.5 + 0.5 * Math.sin(2 * Math.PI * i / 5);
        tokenLabels.push(i.toString());
        isKeyword.push(inputSeq[i] > 0.7);
      }
    }
  }

  function simulate() {
    generateInput();
    var N = state.N;

    // Generate Δ values: higher for keywords, lower for noise
    deltaValues = new Float64Array(T);
    for (var n = 0; n < T; n++) {
      // softplus(linear(u[n])) — simulate with content-dependent values
      var base = 0.1 + inputSeq[n] * 0.8;
      deltaValues[n] = Math.log(1 + Math.exp(base * 3 - 1)); // softplus
      if (isKeyword[n]) deltaValues[n] *= 1.5;
    }

    // Simulate selective SSM
    // A: diagonal, negative (HiPPO-like)
    var A_diag = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      A_diag[i] = -(i + 1) * 0.5; // increasing decay rates
    }

    stateHistory = [];
    var x = new Float64Array(N); // state
    outputSeq = new Float64Array(T);
    gateValues = new Float64Array(T);

    for (var n = 0; n < T; n++) {
      // Input-dependent B and C (simulated as projections)
      var B = new Float64Array(N);
      var C = new Float64Array(N);
      for (var i = 0; i < N; i++) {
        B[i] = Math.sin(inputSeq[n] * (i + 1) * 2.1 + 0.3) * 0.5 + 0.5;
        C[i] = Math.cos(inputSeq[n] * (i + 1) * 1.7 + 0.7) * 0.5 + 0.5;
      }

      var dt = deltaValues[n];
      // Discretize: A_bar = exp(A * dt), B_bar ≈ dt * B
      var newX = new Float64Array(N);
      var y = 0;
      for (var i = 0; i < N; i++) {
        var a_bar = Math.exp(A_diag[i] * dt);
        var b_bar = dt * B[i];
        newX[i] = a_bar * x[i] + b_bar * inputSeq[n];
        y += C[i] * newX[i];
      }
      x = newX;

      // Save state snapshot
      stateHistory.push(new Float64Array(x));
      outputSeq[n] = y / N;

      // Gating branch: SiLU(linear(input))
      var g = inputSeq[n] * 1.5 - 0.3;
      gateValues[n] = g / (1 + Math.exp(-g)); // SiLU
    }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var PAD = 14;
    var N = state.N;
    var obs = Math.min(state.observeToken, T - 1);

    // ─── Section 1: Input Sequence (top) ───
    var seqY = PAD + 4;
    var seqH = 50;
    var seqLeft = PAD + 40;
    var seqRight = WIDTH - PAD;
    var seqW = seqRight - seqLeft;
    var tokenW = seqW / T;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('INPUT', seqLeft - 6, seqY + 14);
    ctx.fillText('u[n]', seqLeft - 6, seqY + 26);

    // Token bars
    for (var n = 0; n < T; n++) {
      var tx = seqLeft + n * tokenW;
      var barH = inputSeq[n] * (seqH - 16);

      // Highlight observed token
      if (n === obs) {
        ctx.fillStyle = 'rgba(167,139,250,0.15)';
        ctx.fillRect(tx, seqY, tokenW - 1, HEIGHT - PAD - seqY);
      }

      ctx.fillStyle = isKeyword[n] ? c.ai : c.textDim;
      ctx.globalAlpha = isKeyword[n] ? 0.9 : 0.4;
      ctx.fillRect(tx + 2, seqY + seqH - 16 - barH, tokenW - 4, barH);
      ctx.globalAlpha = 1;

      // Token label
      ctx.fillStyle = isKeyword[n] ? c.ai : c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tokenLabels[n], tx + tokenW / 2, seqY + seqH - 2);
    }

    // ─── Section 2: Δ values ───
    var dtY = seqY + seqH + 8;
    var dtH = 40;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Δ[n]', seqLeft - 6, dtY + 14);

    var maxDt = 0;
    for (var n = 0; n < T; n++) if (deltaValues[n] > maxDt) maxDt = deltaValues[n];

    for (var n = 0; n < T; n++) {
      var tx = seqLeft + n * tokenW;
      var barH = (deltaValues[n] / maxDt) * (dtH - 4);

      // Color: high Δ = orange (absorb), low Δ = dim (ignore)
      var intensity = deltaValues[n] / maxDt;
      var r = Math.round(34 + intensity * 217);
      var g = Math.round(34 + intensity * 112);
      var b = Math.round(34 + intensity * 26);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fillRect(tx + 2, dtY + dtH - 4 - barH, tokenW - 4, barH);

      if (n === obs) {
        ctx.fillStyle = c.bridge;
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(deltaValues[n].toFixed(2), tx + tokenW / 2, dtY - 1);
      }
    }

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('high Δ = absorb token', seqLeft, dtY + dtH + 10);
    ctx.textAlign = 'right';
    ctx.fillText('low Δ = ignore token', seqRight, dtY + dtH + 10);

    // ─── Section 3: State heatmap ───
    var stateY = dtY + dtH + 22;
    var stateH = Math.max(80, N * 10);
    var cellH = stateH / N;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('STATE', seqLeft - 6, stateY + 14);
    ctx.fillText('x[n]', seqLeft - 6, stateY + 26);

    // Find state range
    var maxState = 0.001;
    for (var n = 0; n < stateHistory.length; n++) {
      for (var i = 0; i < N; i++) {
        if (Math.abs(stateHistory[n][i]) > maxState) maxState = Math.abs(stateHistory[n][i]);
      }
    }

    for (var n = 0; n < T; n++) {
      var tx = seqLeft + n * tokenW;
      for (var i = 0; i < N; i++) {
        var val = stateHistory[n][i] / maxState; // -1 to 1
        var cy = stateY + i * cellH;
        if (val >= 0) {
          ctx.fillStyle = 'rgba(34,211,238,' + (val * 0.8).toFixed(3) + ')';
        } else {
          ctx.fillStyle = 'rgba(251,113,133,' + ((-val) * 0.8).toFixed(3) + ')';
        }
        ctx.fillRect(tx + 1, cy + 1, tokenW - 2, cellH - 2);
      }
    }

    // State dimension labels
    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (var i = 0; i < N; i++) {
      ctx.fillText('x' + i, seqLeft - 2, stateY + i * cellH + cellH / 2 + 2);
    }

    // Observed token state detail
    if (obs < stateHistory.length) {
      var detailX = seqLeft;
      var detailY = stateY + stateH + 8;
      ctx.fillStyle = c.bridge;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('State at token ' + obs + ' (' + tokenLabels[obs] + '):', detailX, detailY);
      var stateStr = '[';
      for (var i = 0; i < Math.min(N, 8); i++) {
        stateStr += stateHistory[obs][i].toFixed(2);
        if (i < Math.min(N, 8) - 1) stateStr += ', ';
      }
      if (N > 8) stateStr += ', ...';
      stateStr += ']';
      ctx.fillText(stateStr, detailX, detailY + 12);
    }

    // ─── Section 4: Gating + Output ───
    var gateY = stateY + stateH + 34;
    var gateH = 35;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('GATE', seqLeft - 6, gateY + 10);
    ctx.fillText('g[n]', seqLeft - 6, gateY + 22);

    var maxGate = 0.001;
    for (var n = 0; n < T; n++) {
      if (Math.abs(gateValues[n]) > maxGate) maxGate = Math.abs(gateValues[n]);
    }

    for (var n = 0; n < T; n++) {
      var tx = seqLeft + n * tokenW;
      var val = gateValues[n] / maxGate;
      var barH = Math.abs(val) * (gateH - 4);
      ctx.fillStyle = val >= 0 ? 'rgba(74,222,128,0.6)' : 'rgba(251,113,133,0.4)';
      ctx.fillRect(tx + 2, gateY + gateH - 4 - barH, tokenW - 4, barH);
    }

    // ─── Section 5: Output ───
    var outY = gateY + gateH + 16;
    var outH = 50;

    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('OUTPUT', seqLeft - 6, outY + 14);
    ctx.fillText('y[n]', seqLeft - 6, outY + 26);

    var maxOut = 0.001;
    for (var n = 0; n < T; n++) {
      if (Math.abs(outputSeq[n]) > maxOut) maxOut = Math.abs(outputSeq[n]);
    }

    // Output line
    ctx.beginPath();
    ctx.strokeStyle = c.bridge;
    ctx.lineWidth = 2;
    for (var n = 0; n < T; n++) {
      var tx = seqLeft + n * tokenW + tokenW / 2;
      var val = outputSeq[n] / maxOut;
      var py = outY + outH / 2 - val * outH * 0.4;
      if (n === 0) ctx.moveTo(tx, py);
      else ctx.lineTo(tx, py);
    }
    ctx.stroke();

    // Output dots
    for (var n = 0; n < T; n++) {
      var tx = seqLeft + n * tokenW + tokenW / 2;
      var val = outputSeq[n] / maxOut;
      var py = outY + outH / 2 - val * outH * 0.4;
      ctx.fillStyle = n === obs ? c.bridge : c.textDim;
      ctx.beginPath();
      ctx.arc(tx, py, n === obs ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Zero line
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(seqLeft, outY + outH / 2);
    ctx.lineTo(seqRight, outY + outH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ─── Block diagram annotation ───
    var annotY = outY + outH + 18;
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('u[n] → Linear↑' + state.expand + 'x → Conv1D(k=4) → SelectiveSSM(Δ,B,C) ⊗ SiLU-Gate → Linear↓ → y[n]', WIDTH / 2, annotY);

    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('Δ[n], B[n], C[n] are all functions of the input — the filter adapts at every timestep', WIDTH / 2, annotY + 14);
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
