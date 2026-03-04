/* ============================================================
   Tool 24.2 — LTI vs LTV Explorer
   Split-canvas: S4's fixed poles vs Mamba's moving poles.
   Bottom strip: "frozen H_t(z)" magnitude response.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.LTIvsLTV = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var containerEl;
  var animId = null;
  var playing = true;

  var state = {
    signalType: 'speech',
    speed: 1.0
  };

  var NUM_POLES = 6;
  var TIME_STEPS = 128;
  var currentStep = 0;

  // Fixed S4 poles (LTI)
  var s4Poles = [];
  // Time-varying Mamba poles
  var mambaPolesOverTime = [];
  // Signal envelope for driving Mamba
  var signalEnvelope = [];
  // Frozen frequency response at current step
  var frozenResponse = [];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'LTI vs LTV pole explorer');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(440, Math.min(540, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }

    var selectEl = containerEl.querySelector('[data-control="ltv-signal"]');
    if (selectEl) {
      selectEl.addEventListener('change', function () {
        state.signalType = this.value;
        generateAll();
        currentStep = 0;
      });
    }

    bindSlider(containerEl, 'ltv-speed', function (v) {
      state.speed = parseFloat(v);
      containerEl.querySelector('[data-value="ltv-speed"]').textContent = parseFloat(v).toFixed(1);
    });

    var toggleBtn = containerEl.querySelector('[data-control="ltv-toggle"]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        playing = !playing;
        this.textContent = playing ? 'Pause' : 'Play';
        if (playing) animate();
      });
    }

    window.addEventListener('resize', resize);
    generateAll();
    resize();
    animate();
  }

  function generateAll() {
    // Generate fixed S4 poles (HiPPO-like, on negative real axis + some complex)
    s4Poles = [];
    for (var i = 0; i < NUM_POLES; i++) {
      var decay = 0.85 + i * 0.02;
      var angle = (i % 2 === 0) ? 0 : (i + 1) * 0.3;
      s4Poles.push({ r: decay, theta: angle });
      if (angle !== 0) {
        s4Poles.push({ r: decay, theta: -angle }); // conjugate
      }
    }

    // Generate signal envelope
    signalEnvelope = [];
    for (var t = 0; t < TIME_STEPS; t++) {
      var v = 0;
      var phase = t / TIME_STEPS;
      switch (state.signalType) {
        case 'speech':
          // Alternating vowels (steady) and consonants (transient)
          var segment = Math.floor(phase * 6);
          if (segment % 2 === 0) {
            // Vowel: smooth, sustained
            v = 0.6 + 0.3 * Math.sin(2 * Math.PI * t / 12);
          } else {
            // Consonant: transient, noisy
            v = 0.2 + 0.5 * Math.abs(Math.sin(2 * Math.PI * t / 3));
          }
          break;
        case 'music':
          // Periodic with slow modulation
          v = 0.5 + 0.4 * Math.sin(2 * Math.PI * t / 20) * Math.sin(2 * Math.PI * t / 80);
          break;
        case 'transient':
          // Sharp onsets
          var pos1 = 0.2, pos2 = 0.5, pos3 = 0.8;
          v = 0.1;
          if (Math.abs(phase - pos1) < 0.03) v = 1.0;
          else if (Math.abs(phase - pos2) < 0.03) v = 0.9;
          else if (Math.abs(phase - pos3) < 0.03) v = 0.8;
          else v = 0.1 + 0.05 * Math.sin(t);
          break;
        case 'noise':
          v = 0.3 + 0.4 * seededRandom(t + 999);
          break;
      }
      signalEnvelope.push(v);
    }

    // Pre-compute Mamba poles over time
    mambaPolesOverTime = [];
    var basePoles = [];
    for (var i = 0; i < NUM_POLES; i++) {
      basePoles.push({
        baseR: 0.7 + i * 0.04,
        baseTheta: (i * 0.5) % (Math.PI),
        aReal: -(i + 1) * 0.5,
        aImag: (i % 2 === 0 ? 1 : -1) * (i + 1) * 0.8
      });
    }

    for (var t = 0; t < TIME_STEPS; t++) {
      var poles = [];
      var env = signalEnvelope[t];
      var delta = 0.1 + env * 0.9; // Input-dependent discretization step

      for (var i = 0; i < basePoles.length; i++) {
        var bp = basePoles[i];
        // λ_i(t) = exp(Δ_t * a_i)
        var r = Math.exp(delta * bp.aReal);
        var theta = delta * bp.aImag;
        // Clamp r to (0, 0.99) for stability
        r = Math.min(0.99, Math.max(0.01, r));
        poles.push({ r: r, theta: theta });
        // Conjugate
        poles.push({ r: r, theta: -theta });
      }
      mambaPolesOverTime.push(poles);
    }
  }

  function computeFrozenResponse(poles) {
    // Compute |H(e^jω)| from poles (assuming all-pole model)
    var N_FREQ = 64;
    frozenResponse = [];
    for (var k = 0; k < N_FREQ; k++) {
      var omega = Math.PI * k / N_FREQ;
      var mag = 1.0;
      for (var p = 0; p < poles.length; p++) {
        var pr = poles[p].r;
        var pt = poles[p].theta;
        // |e^jω - p| = |e^jω - r*e^jθ|
        var dx = Math.cos(omega) - pr * Math.cos(pt);
        var dy = Math.sin(omega) - pr * Math.sin(pt);
        var dist = Math.sqrt(dx * dx + dy * dy);
        mag /= (dist + 0.01);
      }
      frozenResponse.push(Math.min(mag, 20));
    }

    // Normalize
    var maxResp = 0;
    for (var k = 0; k < frozenResponse.length; k++) {
      if (frozenResponse[k] > maxResp) maxResp = frozenResponse[k];
    }
    if (maxResp > 0) {
      for (var k = 0; k < frozenResponse.length; k++) {
        frozenResponse[k] /= maxResp;
      }
    }
  }

  function animate() {
    if (!playing) return;

    currentStep = (currentStep + state.speed) % TIME_STEPS;
    if (currentStep < 0) currentStep += TIME_STEPS;

    var stepIdx = Math.floor(currentStep);
    if (mambaPolesOverTime[stepIdx]) {
      computeFrozenResponse(mambaPolesOverTime[stepIdx]);
    }

    render();
    animId = requestAnimationFrame(animate);
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var PAD = 12;
    var midGap = 16;
    var halfW = (WIDTH - PAD * 2 - midGap) / 2;
    var topH = HEIGHT * 0.55;
    var bottomH = HEIGHT - topH - PAD * 2 - midGap - 20;
    var stepIdx = Math.floor(currentStep) % TIME_STEPS;

    // ─── Labels ───
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    // ─── Left: S4 (LTI) Z-Plane ───
    var lx = PAD, ly = PAD;
    ctx.fillStyle = c.dsp;
    ctx.fillText('S4 (LTI) — Fixed Poles', lx + halfW / 2, ly + 10);
    drawZPlane(lx, ly + 16, halfW, topH - 20, s4Poles, c.dsp);

    // ─── Right: Mamba (LTV) Z-Plane ───
    var rx = PAD + halfW + midGap;
    ctx.fillStyle = c.ai;
    ctx.fillText('Mamba (LTV) — Adaptive Poles (t=' + stepIdx + ')', rx + halfW / 2, ly + 10);
    if (mambaPolesOverTime[stepIdx]) {
      drawZPlane(rx, ly + 16, halfW, topH - 20, mambaPolesOverTime[stepIdx], c.ai);
    }

    // ─── Bottom: Signal envelope + frozen H_t(z) ───
    var by = PAD + topH + midGap;
    var stripH = bottomH / 2;

    // Signal envelope
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Input Signal Envelope', PAD + 40, by + 8);

    var sigX = PAD + 40;
    var sigW = WIDTH - PAD * 2 - 50;

    ctx.beginPath();
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 1;
    for (var t = 0; t < TIME_STEPS; t++) {
      var px = sigX + (t / TIME_STEPS) * sigW;
      var py = by + 12 + (1 - signalEnvelope[t]) * (stripH - 16);
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Current position marker
    var curX = sigX + (stepIdx / TIME_STEPS) * sigW;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(curX, by + 10);
    ctx.lineTo(curX, by + stripH);
    ctx.stroke();

    // Frozen H_t(z) magnitude response
    var fry = by + stripH + 4;
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Frozen |H_t(z)| at t=' + stepIdx, PAD + 40, fry + 8);

    if (frozenResponse.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 1.5;
      for (var k = 0; k < frozenResponse.length; k++) {
        var px = sigX + (k / frozenResponse.length) * sigW;
        var py = fry + 12 + (1 - frozenResponse[k]) * (stripH - 18);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = c.textDim;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('0', sigX, fry + stripH + 2);
      ctx.fillText('\u03C0', sigX + sigW, fry + stripH + 2);
      ctx.fillText('\u03C9', sigX + sigW / 2, fry + stripH + 2);
    }
  }

  function drawZPlane(x, y, w, h, poles, color) {
    var c = Plot.getColors();
    var cx = x + w / 2;
    var cy = y + h / 2;
    var radius = Math.min(w, h) / 2 - 10;

    // Unit circle
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Axes
    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - radius - 5, cy);
    ctx.lineTo(cx + radius + 5, cy);
    ctx.moveTo(cx, cy - radius - 5);
    ctx.lineTo(cx, cy + radius + 5);
    ctx.stroke();

    // Labels
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Re', cx + radius + 8, cy + 3);
    ctx.fillText('Im', cx, cy - radius - 4);

    // Draw poles
    for (var i = 0; i < poles.length; i++) {
      var p = poles[i];
      var pr = p.r * radius;
      var px = cx + pr * Math.cos(p.theta);
      var py = cy - pr * Math.sin(p.theta);

      // Pole cross
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      var sz = 4;
      ctx.beginPath();
      ctx.moveTo(px - sz, py - sz);
      ctx.lineTo(px + sz, py + sz);
      ctx.moveTo(px + sz, py - sz);
      ctx.lineTo(px - sz, py + sz);
      ctx.stroke();

      // Glow for poles near unit circle
      if (p.r > 0.9) {
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba');
        if (color.charAt(0) === '#') {
          var rgb = hexToRgb(color);
          ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.15)';
        }
        ctx.fill();
      }
    }
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16)
    };
  }

  function seededRandom(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('input', function () { callback(this.value); });
  }

  return { init: init };
})();
