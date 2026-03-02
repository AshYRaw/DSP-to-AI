/* ============================================================
   Tool 6.1 — Pole-Zero Drag-and-Drop Designer  (Flagship)
   Click to place poles/zeros on the z-plane, drag them.
   Three linked displays update in real-time:
     1. Pole-zero plot with unit circle
     2. Frequency response (magnitude + phase)
     3. Impulse response h[n]
   Conjugate pairs enforced for real coefficients.
   Audio: hear white noise filtered through the design.
   Depends on: plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.PoleZeroDesigner = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 600;

  var state = {
    poles: [],   // array of {r, i}  (complex)
    zeros: [],   // array of {r, i}
    mode: 'pole', // 'pole' | 'zero' | 'move' | 'delete'
    dragging: null,  // {type:'pole'|'zero', idx, conjIdx}
    conjugate: true, // enforce conjugate pairs
    gain: 1.0
  };

  var presets = {
    'empty': { label: 'Empty (start fresh)', poles: [], zeros: [] },
    'lowpass1': {
      label: 'Lowpass (1st order)',
      poles: [{ r: 0.85, i: 0 }],
      zeros: [{ r: -1, i: 0 }]
    },
    'highpass1': {
      label: 'Highpass (1st order)',
      poles: [{ r: -0.85, i: 0 }],
      zeros: [{ r: 1, i: 0 }]
    },
    'bandpass': {
      label: 'Bandpass (resonator)',
      poles: [{ r: 0.637, i: 0.637 }, { r: 0.637, i: -0.637 }],
      zeros: [{ r: 1, i: 0 }, { r: -1, i: 0 }]
    },
    'notch': {
      label: 'Notch (band-reject)',
      poles: [{ r: 0.566, i: 0.566 }, { r: 0.566, i: -0.566 }],
      zeros: [{ r: 0.707, i: 0.707 }, { r: 0.707, i: -0.707 }]
    },
    'allpass': {
      label: 'All-Pass',
      poles: [{ r: 0.5, i: 0.5 }, { r: 0.5, i: -0.5 }],
      zeros: [{ r: 0.769, i: -0.769 }, { r: 0.769, i: 0.769 }]
    },
    'comb': {
      label: 'Comb Filter',
      poles: [
        { r: 0.75, i: 0 },
        { r: 0.375, i: 0.6495 }, { r: 0.375, i: -0.6495 },
        { r: -0.375, i: 0.6495 }, { r: -0.375, i: -0.6495 },
        { r: -0.75, i: 0 }
      ],
      zeros: []
    }
  };

  var containerEl;
  var zPlaneRadius;  // pixels
  var zPlaneCx, zPlaneCy; // center of z-plane in canvas coords

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive pole-zero plot designer with linked frequency and impulse response');
    canvas.setAttribute('tabindex', '0');
    canvas.style.cursor = 'crosshair';
    var wrapper = containerEl.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      containerEl.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(520, Math.min(640, WIDTH * 0.75));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Mouse events
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDblClick);

    // Controls
    bindSelect(containerEl, 'pz-mode', function (v) {
      state.mode = v;
      canvas.style.cursor = v === 'move' ? 'grab' : v === 'delete' ? 'not-allowed' : 'crosshair';
    });

    bindSelect(containerEl, 'pz-preset', function (v) {
      loadPreset(v);
      render();
    });

    var conjToggle = containerEl.querySelector('[data-control="conjugate"]');
    if (conjToggle) {
      conjToggle.addEventListener('change', function () {
        state.conjugate = this.checked;
      });
    }

    bindSlider(containerEl, 'pz-gain', function (v) {
      state.gain = parseFloat(v);
      render();
    });

    // Clear
    var clearBtn = containerEl.querySelector('[data-action="clear-pz"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        state.poles = [];
        state.zeros = [];
        render();
      });
    }

    // Play audio
    var playBtn = containerEl.querySelector('[data-action="play-filter"]');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        playFilteredNoise();
      });
    }

    var stopBtn = containerEl.querySelector('[data-action="stop-filter"]');
    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        Audio.stop();
      });
    }

    // Load default
    loadPreset('lowpass1');
    resize();
  }

  function loadPreset(name) {
    var p = presets[name];
    if (!p) return;
    state.poles = p.poles.map(function (v) { return { r: v.r, i: v.i }; });
    state.zeros = p.zeros.map(function (v) { return { r: v.r, i: v.i }; });
  }

  /* ---- Coordinate transforms ---- */
  function getLayout() {
    var zpSize = Math.min(WIDTH * 0.45, HEIGHT * 0.65);
    zPlaneRadius = zpSize / 2 * 0.8;
    zPlaneCx = WIDTH * 0.25;
    zPlaneCy = HEIGHT * 0.38;

    return {
      zp: { cx: zPlaneCx, cy: zPlaneCy, radius: zPlaneRadius },
      freq: { x: WIDTH * 0.54, y: 30, w: WIDTH * 0.42, h: HEIGHT * 0.32 },
      phase: { x: WIDTH * 0.54, y: 30 + HEIGHT * 0.32 + 30, w: WIDTH * 0.42, h: HEIGHT * 0.18 },
      ir: { x: WIDTH * 0.54, y: 30 + HEIGHT * 0.32 + 30 + HEIGHT * 0.18 + 30, w: WIDTH * 0.42, h: HEIGHT * 0.22 }
    };
  }

  function zToPixel(zr, zi) {
    return {
      x: zPlaneCx + zr * zPlaneRadius,
      y: zPlaneCy - zi * zPlaneRadius
    };
  }

  function pixelToZ(px, py) {
    return {
      r: (px - zPlaneCx) / zPlaneRadius,
      i: -(py - zPlaneCy) / zPlaneRadius
    };
  }

  /* ---- Mouse handlers ---- */
  function findNearest(mx, my, list) {
    var bestDist = 15;  // snap radius in pixels
    var bestIdx = -1;
    for (var i = 0; i < list.length; i++) {
      var p = zToPixel(list[i].r, list[i].i);
      var d = Math.sqrt((mx - p.x) * (mx - p.x) + (my - p.y) * (my - p.y));
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function findConjugate(list, idx) {
    if (idx < 0 || Math.abs(list[idx].i) < 0.01) return -1;
    var target = { r: list[idx].r, i: -list[idx].i };
    for (var i = 0; i < list.length; i++) {
      if (i === idx) continue;
      if (Math.abs(list[i].r - target.r) < 0.02 && Math.abs(list[i].i - target.i) < 0.02) {
        return i;
      }
    }
    return -1;
  }

  function onMouseDown(e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    // Check if in z-plane region
    var dFromCenter = Math.sqrt((mx - zPlaneCx) * (mx - zPlaneCx) + (my - zPlaneCy) * (my - zPlaneCy));
    if (dFromCenter > zPlaneRadius * 1.4) return;

    if (state.mode === 'move') {
      // Find nearest pole or zero to grab
      var pi = findNearest(mx, my, state.poles);
      var zi = findNearest(mx, my, state.zeros);
      if (pi >= 0) {
        var ci = state.conjugate ? findConjugate(state.poles, pi) : -1;
        state.dragging = { type: 'pole', idx: pi, conjIdx: ci };
        canvas.style.cursor = 'grabbing';
      } else if (zi >= 0) {
        var ci = state.conjugate ? findConjugate(state.zeros, zi) : -1;
        state.dragging = { type: 'zero', idx: zi, conjIdx: ci };
        canvas.style.cursor = 'grabbing';
      }
    } else if (state.mode === 'delete') {
      // Delete nearest pole or zero
      var pi = findNearest(mx, my, state.poles);
      var zi = findNearest(mx, my, state.zeros);
      if (pi >= 0) {
        var ci = state.conjugate ? findConjugate(state.poles, pi) : -1;
        if (ci >= 0 && ci !== pi) {
          state.poles.splice(Math.max(pi, ci), 1);
          state.poles.splice(Math.min(pi, ci), 1);
        } else {
          state.poles.splice(pi, 1);
        }
        render();
      } else if (zi >= 0) {
        var ci = state.conjugate ? findConjugate(state.zeros, zi) : -1;
        if (ci >= 0 && ci !== zi) {
          state.zeros.splice(Math.max(zi, ci), 1);
          state.zeros.splice(Math.min(zi, ci), 1);
        } else {
          state.zeros.splice(zi, 1);
        }
        render();
      }
    } else {
      // Add pole or zero
      var z = pixelToZ(mx, my);
      // Snap to axes if close
      if (Math.abs(z.i) < 0.05) z.i = 0;
      if (Math.abs(z.r) < 0.05) z.r = 0;

      var list = state.mode === 'pole' ? state.poles : state.zeros;
      list.push({ r: z.r, i: z.i });
      // Add conjugate if imaginary and conjugate mode
      if (state.conjugate && Math.abs(z.i) > 0.01) {
        list.push({ r: z.r, i: -z.i });
      }
      render();
    }
  }

  function onMouseMove(e) {
    if (!state.dragging) return;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var z = pixelToZ(mx, my);

    // Snap to axes
    if (Math.abs(z.i) < 0.04) z.i = 0;
    if (Math.abs(z.r) < 0.04) z.r = 0;

    var list = state.dragging.type === 'pole' ? state.poles : state.zeros;
    list[state.dragging.idx].r = z.r;
    list[state.dragging.idx].i = z.i;

    // Move conjugate
    if (state.dragging.conjIdx >= 0) {
      list[state.dragging.conjIdx].r = z.r;
      list[state.dragging.conjIdx].i = -z.i;
    }

    render();
  }

  function onMouseUp() {
    if (state.dragging) {
      state.dragging = null;
      canvas.style.cursor = state.mode === 'move' ? 'grab' : state.mode === 'delete' ? 'not-allowed' : 'crosshair';
      render();
    }
  }

  function onDblClick(e) {
    // Double click to delete nearest
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var pi = findNearest(mx, my, state.poles);
    var zi = findNearest(mx, my, state.zeros);
    if (pi >= 0) {
      var ci = findConjugate(state.poles, pi);
      if (ci >= 0 && ci !== pi) {
        state.poles.splice(Math.max(pi, ci), 1);
        state.poles.splice(Math.min(pi, ci), 1);
      } else {
        state.poles.splice(pi, 1);
      }
      render();
    } else if (zi >= 0) {
      var ci = findConjugate(state.zeros, zi);
      if (ci >= 0 && ci !== zi) {
        state.zeros.splice(Math.max(zi, ci), 1);
        state.zeros.splice(Math.min(zi, ci), 1);
      } else {
        state.zeros.splice(zi, 1);
      }
      render();
    }
  }

  /* ---- Evaluation ---- */
  function evalH(zr, zi) {
    // H(z) = gain * product(z - zero_k) / product(z - pole_k)
    var numR = state.gain, numI = 0;
    for (var k = 0; k < state.zeros.length; k++) {
      var dr = zr - state.zeros[k].r;
      var di = zi - state.zeros[k].i;
      var nr = numR * dr - numI * di;
      var ni = numR * di + numI * dr;
      numR = nr; numI = ni;
    }

    var denR = 1, denI = 0;
    for (var k = 0; k < state.poles.length; k++) {
      var dr = zr - state.poles[k].r;
      var di = zi - state.poles[k].i;
      var nr = denR * dr - denI * di;
      var ni = denR * di + denI * dr;
      denR = nr; denI = ni;
    }

    var denMag2 = denR * denR + denI * denI;
    if (denMag2 < 1e-30) return { r: 1e10, i: 0 };
    return {
      r: (numR * denR + numI * denI) / denMag2,
      i: (numI * denR - numR * denI) / denMag2
    };
  }

  function computeIR(maxLen) {
    // Build polynomial coefficients from poles/zeros, then filter impulse
    // Numerator from zeros: B(z) = product(1 - z_k * z^-1)
    // Denominator from poles: A(z) = product(1 - p_k * z^-1)
    var b = polyFromRoots(state.zeros);
    var a = polyFromRoots(state.poles);

    // Scale numerator by gain
    for (var i = 0; i < b.length; i++) b[i] *= state.gain;

    var h = new Float64Array(maxLen);
    var x = new Float64Array(maxLen);
    var y = new Float64Array(maxLen);
    x[0] = 1;

    for (var n = 0; n < maxLen; n++) {
      var sum = 0;
      for (var k = 0; k < b.length; k++) {
        if (n - k >= 0) sum += b[k] * x[n - k];
      }
      for (var k = 1; k < a.length; k++) {
        if (n - k >= 0) sum -= a[k] * y[n - k];
      }
      y[n] = sum;
      h[n] = sum;
      if (Math.abs(h[n]) > 1e6) {
        for (var m = n + 1; m < maxLen; m++) h[m] = h[n] > 0 ? 1e6 : -1e6;
        break;
      }
    }
    return h;
  }

  function polyFromRoots(roots) {
    // Build polynomial coefficients from roots: product of (1 - root_k * z^-1)
    // Returns real part of coefficients (assumes conjugate pairs give real result)
    var poly = [1]; // start with 1
    for (var i = 0; i < roots.length; i++) {
      var rr = roots[i].r;
      var ri = roots[i].i;
      // Multiply poly by (1 - (rr+j*ri)*z^-1) = [1, -(rr+j*ri)]
      // For real coefficients we work with pairs, but let's use complex multiplication
      // and take real parts at the end
      var newLen = poly.length + 1;
      var newPoly = new Array(newLen);
      for (var k = 0; k < newLen; k++) newPoly[k] = 0;

      for (var k = 0; k < poly.length; k++) {
        newPoly[k] += poly[k];
        newPoly[k + 1] += -rr * poly[k]; // real part of -root * poly[k]
        // Imaginary part contributes when multiplied with previous imaginary parts
        // For conjugate pairs this cancels — we handle it by just taking real parts
      }
      poly = newPoly;
    }
    return poly;
  }

  /* ---- Audio ---- */
  function playFilteredNoise() {
    Audio.stop();
    var sr = 8000;
    var dur = 2.0;
    var nSamples = Math.floor(sr * dur);

    // Generate white noise
    var noise = new Float64Array(nSamples);
    for (var i = 0; i < nSamples; i++) noise[i] = (Math.random() - 0.5) * 2;

    // Build filter coefficients
    var b = polyFromRoots(state.zeros);
    var a = polyFromRoots(state.poles);
    for (var i = 0; i < b.length; i++) b[i] *= state.gain;

    // Filter
    var output = new Float64Array(nSamples);
    for (var n = 0; n < nSamples; n++) {
      var sum = 0;
      for (var k = 0; k < b.length; k++) {
        if (n - k >= 0) sum += b[k] * noise[n - k];
      }
      for (var k = 1; k < a.length; k++) {
        if (n - k >= 0) sum -= a[k] * output[n - k];
      }
      output[n] = sum;
      // Clamp for safety
      if (Math.abs(output[n]) > 5) output[n] = output[n] > 0 ? 5 : -5;
    }

    // Normalize
    var peak = 0;
    for (var i = 0; i < output.length; i++) peak = Math.max(peak, Math.abs(output[i]));
    if (peak > 0) {
      for (var i = 0; i < output.length; i++) output[i] = output[i] / peak * 0.5;
    }

    Audio.playSamples(output, sr);
  }

  /* ---- Rendering ---- */
  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var layout = getLayout();
    drawZPlane(layout, c);
    drawFreqResponse(layout, c);
    drawPhaseResponse(layout, c);
    drawImpulseResponse(layout, c);
    drawStatusBar(c);
  }

  function drawZPlane(layout, c) {
    var zp = layout.zp;
    var cx = zp.cx, cy = zp.cy, r = zp.radius;

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('POLE-ZERO PLOT', cx, cy - r - 22);
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('Click to place \u2022 Drag to move \u2022 Double-click to delete', cx, cy - r - 10);

    // Background circle region
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // Grid circles
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (var gr = 0.5; gr <= 1.5; gr += 0.5) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * gr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Unit circle (prominent)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.35, cy);
    ctx.lineTo(cx + r * 1.35, cy);
    ctx.moveTo(cx, cy - r * 1.35);
    ctx.lineTo(cx, cy + r * 1.35);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Re', cx + r * 1.35 + 12, cy + 3);
    ctx.fillText('Im', cx, cy - r * 1.35 - 5);
    ctx.fillText('1', cx + r + 2, cy + 12);
    ctx.fillText('-1', cx - r - 2, cy + 12);
    ctx.fillText('j', cx + 8, cy - r + 2);
    ctx.fillText('-j', cx + 10, cy + r + 2);

    // Draw zeros (open circles)
    for (var i = 0; i < state.zeros.length; i++) {
      var p = zToPixel(state.zeros[i].r, state.zeros[i].i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = c.math;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Fill slightly for visibility
      ctx.fillStyle = 'rgba(74,222,128,0.15)';
      ctx.fill();
    }

    // Draw poles (X marks)
    for (var i = 0; i < state.poles.length; i++) {
      var p = zToPixel(state.poles[i].r, state.poles[i].i);
      var mag = Math.sqrt(state.poles[i].r * state.poles[i].r + state.poles[i].i * state.poles[i].i);
      var poleColor = mag > 1.0 ? '#f87171' : mag > 0.95 ? '#facc15' : '#fb923c';

      ctx.strokeStyle = poleColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y - 7); ctx.lineTo(p.x + 7, p.y + 7);
      ctx.moveTo(p.x + 7, p.y - 7); ctx.lineTo(p.x - 7, p.y + 7);
      ctx.stroke();
    }
  }

  function drawFreqResponse(layout, c) {
    var fr = layout.freq;
    var nPts = 256;
    var magResp = new Float64Array(nPts);
    var maxMag = 0.01;

    for (var i = 0; i < nPts; i++) {
      var omega = Math.PI * i / (nPts - 1);
      var zr = Math.cos(omega);
      var zi = Math.sin(omega);
      var h = evalH(zr, zi);
      magResp[i] = Math.sqrt(h.r * h.r + h.i * h.i);
      maxMag = Math.max(maxMag, magResp[i]);
    }

    var yMax = maxMag * 1.15;

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MAGNITUDE RESPONSE |H(e^{j\u03C9})|', fr.x, fr.y - 6);

    // Peak info
    ctx.textAlign = 'right';
    ctx.fillText('Peak: ' + maxMag.toFixed(2), fr.x + fr.w, fr.y - 6);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(fr.x, fr.y, fr.w, fr.h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (var g = 0; g <= 4; g++) {
      var gy = fr.y + (g / 4) * fr.h;
      ctx.beginPath();
      ctx.moveTo(fr.x, gy); ctx.lineTo(fr.x + fr.w, gy);
      ctx.stroke();
    }

    // Unity gain line
    if (yMax > 1) {
      var unityY = fr.y + fr.h - (1.0 / yMax) * fr.h;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(fr.x, unityY); ctx.lineTo(fr.x + fr.w, unityY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('1.0', fr.x - 3, unityY + 3);
    }

    // Draw curve
    ctx.beginPath();
    ctx.strokeStyle = c.math;
    ctx.lineWidth = 2;
    for (var i = 0; i < nPts; i++) {
      var px = fr.x + (i / (nPts - 1)) * fr.w;
      var py = fr.y + fr.h - (magResp[i] / yMax) * fr.h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Fill
    ctx.lineTo(fr.x + fr.w, fr.y + fr.h);
    ctx.lineTo(fr.x, fr.y + fr.h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(74,222,128,0.08)';
    ctx.fill();

    // X-axis
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', fr.x, fr.y + fr.h + 12);
    ctx.fillText('\u03C0/2', fr.x + fr.w * 0.5, fr.y + fr.h + 12);
    ctx.fillText('\u03C0', fr.x + fr.w, fr.y + fr.h + 12);

    // Y-axis
    ctx.textAlign = 'right';
    ctx.fillText(yMax.toFixed(1), fr.x - 3, fr.y + 4);
    ctx.fillText('0', fr.x - 3, fr.y + fr.h + 4);
  }

  function drawPhaseResponse(layout, c) {
    var ph = layout.phase;
    var nPts = 256;
    var phaseResp = new Float64Array(nPts);

    for (var i = 0; i < nPts; i++) {
      var omega = Math.PI * i / (nPts - 1);
      var zr = Math.cos(omega);
      var zi = Math.sin(omega);
      var h = evalH(zr, zi);
      phaseResp[i] = Math.atan2(h.i, h.r);
    }

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PHASE RESPONSE \u2220H(e^{j\u03C9})', ph.x, ph.y - 6);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(ph.x, ph.y, ph.w, ph.h);

    // Zero line
    var midY = ph.y + ph.h / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ph.x, midY); ctx.lineTo(ph.x + ph.w, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw phase curve
    ctx.beginPath();
    ctx.strokeStyle = c.bridge;
    ctx.lineWidth = 1.5;
    for (var i = 0; i < nPts; i++) {
      var px = ph.x + (i / (nPts - 1)) * ph.w;
      var py = midY - (phaseResp[i] / Math.PI) * (ph.h * 0.45);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('+\u03C0', ph.x - 3, ph.y + 6);
    ctx.fillText('0', ph.x - 3, midY + 3);
    ctx.fillText('-\u03C0', ph.x - 3, ph.y + ph.h);

    // X-axis
    ctx.textAlign = 'center';
    ctx.fillText('0', ph.x, ph.y + ph.h + 10);
    ctx.fillText('\u03C0', ph.x + ph.w, ph.y + ph.h + 10);
  }

  function drawImpulseResponse(layout, c) {
    var ir = layout.ir;
    var maxLen = 60;
    var h = computeIR(maxLen);

    // Check stability
    var isUnstable = false;
    for (var i = 0; i < state.poles.length; i++) {
      var mag = Math.sqrt(state.poles[i].r * state.poles[i].r + state.poles[i].i * state.poles[i].i);
      if (mag > 1.001) { isUnstable = true; break; }
    }

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('IMPULSE RESPONSE h[n]', ir.x, ir.y - 6);

    if (isUnstable) {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('\u26A0 UNSTABLE', ir.x + ir.w, ir.y - 6);
    }

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(ir.x, ir.y, ir.w, ir.h);

    // Range
    var maxAbs = 0.01;
    for (var i = 0; i < h.length; i++) maxAbs = Math.max(maxAbs, Math.abs(h[i]));
    if (maxAbs > 100) maxAbs = 100;
    var yR = maxAbs * 1.2;
    var midY = ir.y + ir.h / 2;

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ir.x, midY); ctx.lineTo(ir.x + ir.w, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Stems
    for (var i = 0; i < h.length; i++) {
      var px = ir.x + (i / (maxLen - 1)) * ir.w;
      var val = Math.max(-100, Math.min(100, h[i]));
      var py = midY - (val / yR) * (ir.h * 0.45);

      ctx.beginPath();
      ctx.moveTo(px, midY); ctx.lineTo(px, py);
      ctx.strokeStyle = isUnstable ? '#f87171' : c.ai;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isUnstable ? '#f87171' : c.ai;
      ctx.fill();
    }

    // X-axis
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', ir.x, ir.y + ir.h + 10);
    ctx.fillText(maxLen.toString(), ir.x + ir.w, ir.y + ir.h + 10);
    ctx.fillText('n', ir.x + ir.w / 2, ir.y + ir.h + 10);
  }

  function drawStatusBar(c) {
    var y = HEIGHT - 16;
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    var nPoles = state.poles.length;
    var nZeros = state.zeros.length;

    // Stability check
    var maxPoleMag = 0;
    for (var i = 0; i < state.poles.length; i++) {
      var mag = Math.sqrt(state.poles[i].r * state.poles[i].r + state.poles[i].i * state.poles[i].i);
      maxPoleMag = Math.max(maxPoleMag, mag);
    }

    var systemType = nPoles === 0 ? 'FIR (all-zero)' :
                     nZeros === 0 ? 'All-pole' : 'IIR (pole-zero)';

    var stabilityStr;
    if (nPoles === 0) {
      stabilityStr = 'Always stable (FIR)';
      ctx.fillStyle = c.math;
    } else if (maxPoleMag > 1.001) {
      stabilityStr = 'UNSTABLE (max |pole| = ' + maxPoleMag.toFixed(3) + ')';
      ctx.fillStyle = '#f87171';
    } else if (maxPoleMag > 0.95) {
      stabilityStr = 'Marginally stable (max |pole| = ' + maxPoleMag.toFixed(3) + ')';
      ctx.fillStyle = '#facc15';
    } else {
      stabilityStr = 'Stable (max |pole| = ' + maxPoleMag.toFixed(3) + ')';
      ctx.fillStyle = c.math;
    }

    ctx.fillText(nPoles + ' pole' + (nPoles !== 1 ? 's' : '') + ', ' +
                 nZeros + ' zero' + (nZeros !== 1 ? 's' : '') + '  |  ' +
                 systemType + '  |  ' + stabilityStr,
                 WIDTH / 2, y);
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
