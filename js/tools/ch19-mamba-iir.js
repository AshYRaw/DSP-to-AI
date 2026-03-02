/* ============================================================
   Tool 19.3 — Mamba ↔ IIR Filter Bank Dual View
   Left: DSP view — poles moving in z-plane, impulse response.
   Right: AI view — state evolution, Δ heatmap.
   Shows Mamba as a bank of adaptive IIR filters.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.MambaIIR = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 580;

  var T = 24;  // sequence length
  var state = {
    channels: 4,
    observeStep: 0
  };

  var animating = false;
  var animTimer = null;

  // Per-channel, per-timestep data
  var inputSeq = [];
  var isImportant = [];
  var channelPoles = [];     // [T][channels] pole magnitudes
  var channelDelta = [];     // [T][channels] Δ values
  var channelState = [];     // [T][channels] state values (simplified 1D per channel)
  var channelImpResp = [];   // [T][channels][impulseLen] impulse responses
  var outputSeq = [];

  var containerEl;
  var IMPULSE_LEN = 20;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Mamba as adaptive IIR filter bank visualization');
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
      HEIGHT = Math.max(520, Math.min(620, WIDTH * 0.72));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    bindSelect(containerEl, 'iir-channels', function (v) {
      state.channels = parseInt(v, 10);
      simulate();
      render();
    });
    bindSlider(containerEl, 'iir-step', function (v) {
      state.observeStep = parseInt(v, 10);
      render();
    });

    bindAction(containerEl, 'iir-animate', function () { toggleAnimate(); });
    bindAction(containerEl, 'iir-reset', function () { resetAnim(); });

    simulate();
    resize();
  }

  function simulate() {
    var D = state.channels;

    // Generate input with keywords
    inputSeq = new Float64Array(T);
    isImportant = [];
    var kw = [3, 7, 12, 17, 21];
    for (var n = 0; n < T; n++) {
      if (kw.indexOf(n) >= 0) {
        inputSeq[n] = 0.7 + Math.random() * 0.3;
        isImportant.push(true);
      } else {
        inputSeq[n] = Math.random() * 0.2;
        isImportant.push(false);
      }
    }

    // Base A diagonals per channel (different decay rates)
    var A_base = [];
    for (var d = 0; d < D; d++) {
      A_base.push(-(d + 1) * 0.6 - 0.3);
    }

    channelPoles = [];
    channelDelta = [];
    channelState = [];
    channelImpResp = [];
    outputSeq = new Float64Array(T);

    // State per channel
    var x = new Float64Array(D);

    for (var n = 0; n < T; n++) {
      var poles = new Float64Array(D);
      var deltas = new Float64Array(D);
      var states = new Float64Array(D);
      var impResps = [];

      for (var d = 0; d < D; d++) {
        // Input-dependent Δ per channel
        var raw = inputSeq[n] * 2.5 + d * 0.3 - 0.5;
        var dt = Math.log(1 + Math.exp(raw)); // softplus
        if (isImportant[n]) dt = Math.max(dt, 0.5 + d * 0.1);
        else dt = Math.min(dt, 0.12 + d * 0.02);
        deltas[d] = dt;

        // Discretize
        var a_bar = Math.exp(A_base[d] * dt);
        poles[d] = Math.abs(a_bar); // pole magnitude

        // Input-dependent B
        var b = Math.sin(inputSeq[n] * (d + 1) * 2.0 + 0.5) * 0.3 + 0.6;
        var b_bar = dt * b;

        // State update
        x[d] = a_bar * x[d] + b_bar * inputSeq[n];
        states[d] = x[d];

        // Compute impulse response at this timestep's pole location
        var ir = new Float64Array(IMPULSE_LEN);
        for (var k = 0; k < IMPULSE_LEN; k++) {
          ir[k] = Math.pow(a_bar, k) * b_bar;
        }
        impResps.push(ir);
      }

      channelPoles.push(poles);
      channelDelta.push(deltas);
      channelState.push(states);
      channelImpResp.push(impResps);

      // Output = sum of channel states
      var y = 0;
      for (var d = 0; d < D; d++) y += states[d];
      outputSeq[n] = y / D;
    }
  }

  function toggleAnimate() {
    if (animating) {
      stopAnim();
      return;
    }
    animating = true;
    state.observeStep = 0;
    animTimer = setInterval(function () {
      state.observeStep++;
      updateStepSlider();
      render();
      if (state.observeStep >= T - 1) {
        stopAnim();
      }
    }, 250);
  }

  function stopAnim() {
    animating = false;
    if (animTimer) { clearInterval(animTimer); animTimer = null; }
  }

  function resetAnim() {
    stopAnim();
    state.observeStep = 0;
    updateStepSlider();
    render();
  }

  function updateStepSlider() {
    var el = containerEl.querySelector('[data-control="iir-step"]');
    var disp = containerEl.querySelector('[data-value="iir-step"]');
    if (el) el.value = state.observeStep;
    if (disp) disp.textContent = state.observeStep;
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var D = state.channels;
    var obs = Math.min(state.observeStep, T - 1);
    var PAD = 12;
    var midX = WIDTH / 2;

    // ─── LEFT: DSP VIEW ───
    var leftW = midX - PAD - 8;

    ctx.fillStyle = c.dsp;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DSP VIEW — IIR Filter Bank', PAD, PAD + 12);

    // Z-plane
    var zCX = PAD + leftW / 2;
    var zCY = PAD + 30 + leftW * 0.35;
    var zR = Math.min(leftW * 0.35, 120);

    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('z-plane: pole positions at step ' + obs, zCX, PAD + 22);

    // Unit circle
    ctx.strokeStyle = 'rgba(251,191,36,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(zCX, zCY, zR, 0, Math.PI * 2);
    ctx.stroke();

    // Axes
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(zCX - zR - 10, zCY);
    ctx.lineTo(zCX + zR + 10, zCY);
    ctx.moveTo(zCX, zCY - zR - 10);
    ctx.lineTo(zCX, zCY + zR + 10);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('|z|=1', zCX + zR + 2, zCY - zR * 0.7);
    ctx.fillText('Re', zCX + zR + 8, zCY + 10);

    // Plot poles for current timestep (on real axis since A is diagonal)
    var poleColors = Plot.SIGNAL_COLORS;
    if (obs < channelPoles.length) {
      for (var d = 0; d < D; d++) {
        var poleMag = channelPoles[obs][d];
        var px = zCX + poleMag * zR;
        var py = zCY; // real axis (diagonal A = real poles)

        // Draw pole marker (×)
        ctx.strokeStyle = poleColors[d % poleColors.length];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 5, py - 5);
        ctx.lineTo(px + 5, py + 5);
        ctx.moveTo(px + 5, py - 5);
        ctx.lineTo(px - 5, py + 5);
        ctx.stroke();

        // Trail: show where this pole was in previous steps
        ctx.globalAlpha = 0.15;
        for (var prev = Math.max(0, obs - 5); prev < obs; prev++) {
          var prevMag = channelPoles[prev][d];
          var ppx = zCX + prevMag * zR;
          ctx.fillStyle = poleColors[d % poleColors.length];
          ctx.beginPath();
          ctx.arc(ppx, py + (d - D / 2) * 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Pole legend
    var legendY = zCY + zR + 16;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    for (var d = 0; d < D; d++) {
      ctx.fillStyle = poleColors[d % poleColors.length];
      var mag = obs < channelPoles.length ? channelPoles[obs][d].toFixed(3) : '?';
      ctx.fillText('Ch' + d + ': |z|=' + mag, PAD + (d % 2) * (leftW / 2), legendY + Math.floor(d / 2) * 11);
    }

    // Impulse response at current step
    var irY = legendY + Math.ceil(D / 2) * 11 + 10;
    var irH = 60;

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Impulse response h[k] at step ' + obs + ' (changes per token!)', PAD, irY - 2);

    if (obs < channelImpResp.length) {
      for (var d = 0; d < D; d++) {
        var ir = channelImpResp[obs][d];
        var maxIR = 0.001;
        for (var k = 0; k < IMPULSE_LEN; k++) {
          if (Math.abs(ir[k]) > maxIR) maxIR = Math.abs(ir[k]);
        }

        ctx.beginPath();
        ctx.strokeStyle = poleColors[d % poleColors.length];
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7;
        for (var k = 0; k < IMPULSE_LEN; k++) {
          var px = PAD + (k / IMPULSE_LEN) * leftW;
          var py = irY + irH / 2 - (ir[k] / maxIR) * irH * 0.4;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Zero line
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(PAD, irY + irH / 2);
    ctx.lineTo(PAD + leftW, irY + irH / 2);
    ctx.stroke();

    // Key insight
    var insightY = irY + irH + 12;
    ctx.fillStyle = c.bridge;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Poles move → impulse response changes', PAD, insightY);
    ctx.fillText('= adaptive IIR filter bank', PAD, insightY + 10);

    // ─── Divider ───
    ctx.strokeStyle = c.textDim;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(midX, PAD);
    ctx.lineTo(midX, HEIGHT - 40);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ─── RIGHT: AI VIEW ───
    var rightX = midX + 8;
    var rightW = WIDTH - rightX - PAD;

    ctx.fillStyle = c.ai;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('AI VIEW — Selective State Space', rightX, PAD + 12);

    // Input tokens row
    var tokY = PAD + 24;
    var tokH = 20;
    var tokenW = rightW / T;

    for (var n = 0; n < T; n++) {
      var tx = rightX + n * tokenW;
      var opacity = 1.0;
      if (n > obs) opacity = 0.15;

      ctx.globalAlpha = opacity;
      ctx.fillStyle = isImportant[n] ? c.ai : 'rgba(148,163,184,0.3)';
      ctx.fillRect(tx + 0.5, tokY, tokenW - 1, tokH);

      if (n === obs) {
        ctx.strokeStyle = c.bridge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx, tokY - 1, tokenW, tokH + 2);
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('input tokens (orange = keyword)', rightX, tokY - 2);

    // Δ heatmap per channel
    var dtHeatY = tokY + tokH + 8;
    var dtCellH = Math.max(8, Math.min(14, 60 / D));

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Δ[n] per channel (bright = absorb)', rightX, dtHeatY - 2);

    var maxDt = 0.01;
    for (var n = 0; n < T; n++) {
      if (!channelDelta[n]) continue;
      for (var d = 0; d < D; d++) {
        if (channelDelta[n][d] > maxDt) maxDt = channelDelta[n][d];
      }
    }

    for (var n = 0; n <= obs && n < T; n++) {
      var tx = rightX + n * tokenW;
      for (var d = 0; d < D; d++) {
        var val = channelDelta[n][d] / maxDt;
        var r = Math.round(50 + val * 201);
        var g = Math.round(30 + val * 116);
        var b = Math.round(10 + val * 50);
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(tx + 0.5, dtHeatY + d * dtCellH, tokenW - 1, dtCellH - 1);
      }
    }

    // Channel labels
    ctx.font = '5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = c.textDim;
    for (var d = 0; d < D; d++) {
      ctx.fillText('ch' + d, rightX - 2, dtHeatY + d * dtCellH + dtCellH - 2);
    }

    // State heatmap per channel
    var stateHY = dtHeatY + D * dtCellH + 10;
    var stCellH = dtCellH;

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('state x[n] per channel', rightX, stateHY - 2);

    var maxSt = 0.001;
    for (var n = 0; n < T; n++) {
      if (!channelState[n]) continue;
      for (var d = 0; d < D; d++) {
        if (Math.abs(channelState[n][d]) > maxSt) maxSt = Math.abs(channelState[n][d]);
      }
    }

    for (var n = 0; n <= obs && n < T; n++) {
      var tx = rightX + n * tokenW;
      for (var d = 0; d < D; d++) {
        var val = channelState[n][d] / maxSt;
        var cy = stateHY + d * stCellH;
        if (val >= 0) {
          ctx.fillStyle = 'rgba(34,211,238,' + (val * 0.8).toFixed(3) + ')';
        } else {
          ctx.fillStyle = 'rgba(251,113,133,' + ((-val) * 0.8).toFixed(3) + ')';
        }
        ctx.fillRect(tx + 0.5, cy, tokenW - 1, stCellH - 1);
      }
    }

    // Output
    var outY = stateHY + D * stCellH + 12;
    var outH = 40;

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('output y[n]', rightX, outY - 2);

    var maxOut = 0.001;
    for (var n = 0; n < T; n++) {
      if (Math.abs(outputSeq[n]) > maxOut) maxOut = Math.abs(outputSeq[n]);
    }

    // Zero line
    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(rightX, outY + outH / 2);
    ctx.lineTo(rightX + rightW, outY + outH / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = c.bridge;
    ctx.lineWidth = 1.5;
    for (var n = 0; n <= obs && n < T; n++) {
      var px = rightX + n * tokenW + tokenW / 2;
      var py = outY + outH / 2 - (outputSeq[n] / maxOut) * outH * 0.4;
      if (n === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ─── Bottom: connection annotation ───
    var annY = HEIGHT - 16;
    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Left: poles move in z-plane per token = adaptive IIR. Right: Δ,B,C change per token = selective SSM. Same math, two views.', WIDTH / 2, annY);
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

  function bindAction(cont, name, callback) {
    var btns = cont.querySelectorAll('[data-action="' + name + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', callback);
    }
  }

  return { init: init };
})();
