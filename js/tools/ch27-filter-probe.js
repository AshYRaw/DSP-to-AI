/* ============================================================
   Tool 27.1 — Filter Probe Simulator
   Simulated SSM filter bank with pole-zero plots, magnitude
   responses, and impulse responses per channel.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.FilterProbe = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var containerEl;

  var state = {
    initType: 'hippo',
    numChannels: 8,
    trainingStage: 0 // 0 = untrained, 1 = fully trained
  };

  var channels = [];

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Filter probe: SSM filter bank analysis');
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(440, Math.min(560, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      computeChannels();
      render();
    }

    bindSelect(containerEl, 'fp-init', function (v) {
      state.initType = v;
      computeChannels(); render();
    });
    bindSelect(containerEl, 'fp-channels', function (v) {
      state.numChannels = parseInt(v, 10);
      computeChannels(); render();
    });

    var stageEl = containerEl.querySelector('[data-control="fp-stage"]');
    if (stageEl) {
      stageEl.addEventListener('input', function () {
        state.trainingStage = parseFloat(this.value);
        var label = state.trainingStage < 0.1 ? 'Untrained' :
                    state.trainingStage < 0.5 ? 'Early' :
                    state.trainingStage < 0.9 ? 'Mid-train' : 'Trained';
        containerEl.querySelector('[data-value="fp-stage"]').textContent = label;
        computeChannels(); render();
      });
    }

    window.addEventListener('resize', resize);
    resize();
  }

  function computeChannels() {
    var N = state.numChannels;
    var t = state.trainingStage;
    channels = [];

    for (var i = 0; i < N; i++) {
      var frac = i / (N - 1);
      var pole = getInitPole(i, N);

      // Interpolate toward "trained" poles (mel-like spacing, complex)
      var trainedR = 0.85 + frac * 0.12;
      var trainedTheta = (0.1 + frac * 0.9) * Math.PI * 0.45;
      // Add some learned variation
      trainedTheta += seededRandom(i * 31 + 7) * 0.15;
      trainedR += (seededRandom(i * 17 + 3) - 0.5) * 0.05;

      var r = pole.r * (1 - t) + trainedR * t;
      var theta = pole.theta * (1 - t) + trainedTheta * t;

      // Compute magnitude response
      var magResp = computeMagnitudeResponse(r, theta);
      // Compute impulse response
      var impResp = computeImpulseResponse(r, theta);

      // Classify
      var type = classifyFilter(r, theta, magResp);

      channels.push({
        r: r, theta: theta,
        magResp: magResp,
        impResp: impResp,
        type: type
      });
    }
  }

  function getInitPole(idx, total) {
    var frac = idx / (total - 1);
    switch (state.initType) {
      case 'hippo':
        // HiPPO-LegS: negative real axis, exponentially decaying
        return { r: Math.exp(-(idx + 0.5) * 0.3), theta: 0 };
      case 'butterworth':
        // Butterworth: uniformly on circle
        var angle = Math.PI * (0.5 + idx) / total;
        return { r: 0.9, theta: angle * 0.5 };
      case 'random':
        return {
          r: 0.3 + seededRandom(idx * 13 + 1) * 0.6,
          theta: seededRandom(idx * 7 + 2) * Math.PI * 0.5
        };
      case 'mixed':
        // First third: HiPPO, second: Butterworth, third: Bessel
        if (frac < 0.33) {
          return { r: Math.exp(-(idx + 0.5) * 0.3), theta: 0 };
        } else if (frac < 0.66) {
          var bwAngle = Math.PI * (0.3 + (frac - 0.33) * 2.0);
          return { r: 0.9, theta: bwAngle * 0.3 };
        } else {
          // Bessel: nearly on real axis, linear phase
          return { r: 0.8 + frac * 0.1, theta: frac * 0.1 };
        }
      default:
        return { r: 0.5, theta: 0 };
    }
  }

  function computeMagnitudeResponse(r, theta) {
    var N_FREQ = 32;
    var resp = [];
    for (var k = 0; k < N_FREQ; k++) {
      var omega = Math.PI * k / N_FREQ;
      // |1 / (e^jω - r*e^jθ)| * |1 / (e^jω - r*e^-jθ)|
      var dx1 = Math.cos(omega) - r * Math.cos(theta);
      var dy1 = Math.sin(omega) - r * Math.sin(theta);
      var dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) + 0.01;

      var dx2 = Math.cos(omega) - r * Math.cos(-theta);
      var dy2 = Math.sin(omega) - r * Math.sin(-theta);
      var dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) + 0.01;

      resp.push(1 / (dist1 * dist2));
    }
    // Normalize
    var maxR = Math.max.apply(null, resp);
    if (maxR > 0) resp = resp.map(function (v) { return v / maxR; });
    return resp;
  }

  function computeImpulseResponse(r, theta) {
    var N = 24;
    var resp = [];
    for (var n = 0; n < N; n++) {
      // h[n] = r^n * cos(n*theta) (simplified all-pole)
      resp.push(Math.pow(r, n) * Math.cos(n * theta));
    }
    return resp;
  }

  function classifyFilter(r, theta, magResp) {
    // Find peak frequency
    var peakIdx = 0, peakVal = 0;
    for (var k = 0; k < magResp.length; k++) {
      if (magResp[k] > peakVal) { peakVal = magResp[k]; peakIdx = k; }
    }

    var peakFrac = peakIdx / magResp.length;

    if (peakFrac < 0.15) return 'LP';
    if (peakFrac > 0.85) return 'HP';
    if (Math.abs(theta) < 0.05) return 'AP';
    return 'BP';
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var N = channels.length;
    var PAD = 10;
    var cols = Math.min(N, 4);
    var rows = Math.ceil(N / cols);
    var cellW = (WIDTH - PAD * 2) / cols;
    var cellH = (HEIGHT - PAD * 2 - 20) / rows;

    // Title
    ctx.fillStyle = c.text;
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SSM Filter Bank (' + state.initType.toUpperCase() + ' init, ' +
      (state.trainingStage < 0.1 ? 'untrained' : 'stage ' + (state.trainingStage * 100).toFixed(0) + '%') + ')',
      WIDTH / 2, PAD + 8);

    for (var i = 0; i < N; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var x = PAD + col * cellW;
      var y = PAD + 16 + row * cellH;
      var ch = channels[i];

      drawChannelCell(x, y, cellW - 4, cellH - 4, ch, i, c);
    }
  }

  function drawChannelCell(x, y, w, h, ch, idx, c) {
    // Cell border
    ctx.strokeStyle = 'rgba(148,163,184,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Header
    var typeColors = { LP: '#22d3ee', BP: '#fb923c', HP: '#fb7185', AP: '#a78bfa' };
    var typeColor = typeColors[ch.type] || c.textDim;

    ctx.fillStyle = typeColor;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Ch ' + idx + ' [' + ch.type + ']', x + 4, y + 10);

    // Pole info
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('r=' + ch.r.toFixed(2) + ' \u03B8=' + ch.theta.toFixed(2), x + w - 4, y + 10);

    var innerY = y + 16;
    var innerH = h - 20;

    // Top half: Pole-Zero on z-plane (mini)
    var zPlaneH = innerH * 0.45;
    drawMiniZPlane(x + 4, innerY, w / 2 - 8, zPlaneH, ch, typeColor, c);

    // Top-right: Magnitude response
    drawMiniMagResponse(x + w / 2 + 2, innerY, w / 2 - 6, zPlaneH, ch.magResp, typeColor, c);

    // Bottom: Impulse response
    var impY = innerY + zPlaneH + 4;
    var impH = innerH - zPlaneH - 8;
    drawMiniImpulseResponse(x + 4, impY, w - 8, impH, ch.impResp, typeColor, c);
  }

  function drawMiniZPlane(x, y, w, h, ch, color, c) {
    var cx = x + w / 2;
    var cy = y + h / 2;
    var radius = Math.min(w, h) / 2 - 2;

    // Unit circle
    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw poles (x marks)
    var angles = [ch.theta, -ch.theta]; // Conjugate pair
    for (var a = 0; a < angles.length; a++) {
      var px = cx + ch.r * radius * Math.cos(angles[a]);
      var py = cy - ch.r * radius * Math.sin(angles[a]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      var sz = 3;
      ctx.beginPath();
      ctx.moveTo(px - sz, py - sz);
      ctx.lineTo(px + sz, py + sz);
      ctx.moveTo(px + sz, py - sz);
      ctx.lineTo(px - sz, py + sz);
      ctx.stroke();
    }
  }

  function drawMiniMagResponse(x, y, w, h, resp, color, c) {
    if (!resp || resp.length === 0) return;

    ctx.strokeStyle = 'rgba(148,163,184,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (var k = 0; k < resp.length; k++) {
      var px = x + (k / resp.length) * w;
      var py = y + h - resp[k] * (h - 4);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('|H|', x, y + 6);
  }

  function drawMiniImpulseResponse(x, y, w, h, resp, color, c) {
    if (!resp || resp.length === 0) return;

    var midY = y + h / 2;

    // Zero line
    ctx.strokeStyle = 'rgba(148,163,184,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, midY);
    ctx.lineTo(x + w, midY);
    ctx.stroke();

    // Find max
    var maxVal = 0.001;
    for (var n = 0; n < resp.length; n++) {
      if (Math.abs(resp[n]) > maxVal) maxVal = Math.abs(resp[n]);
    }

    // Draw stems
    var barW = w / resp.length;
    for (var n = 0; n < resp.length; n++) {
      var px = x + n * barW + barW / 2;
      var barH = (resp[n] / maxVal) * (h / 2 - 2);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(px, midY);
      ctx.lineTo(px, midY - barH);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = c.textDim;
    ctx.font = '5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('h[n]', x, y + 6);
  }

  function seededRandom(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
