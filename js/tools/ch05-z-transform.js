/* ============================================================
   Tool 5.1 — Z-Transform Visual Computer
   Enter filter coefficients, see:
     - Z-plane heatmap of |H(z)| with poles/zeros marked
     - Unit circle cross-section = frequency response
     - Impulse response h[n]
   Preset filters demonstrate key concepts.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.ZTransformViz = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;

  /* --- Preset transfer functions (numerator b[], denominator a[]) ---
     H(z) = (b0 + b1*z^-1 + b2*z^-2 + ...) / (a0 + a1*z^-1 + a2*z^-2 + ...)
     a[0] is always 1 (normalized).
  */
  var presets = {
    'simple-delay': {
      label: 'Simple Delay: z^{-1}',
      b: [0, 1],
      a: [1],
      desc: 'One sample delay. Zero at origin, pole at origin. |H| = 1 everywhere on unit circle (all-pass for magnitude).'
    },
    'fir-average': {
      label: 'FIR Average (3-tap)',
      b: [1/3, 1/3, 1/3],
      a: [1],
      desc: 'Moving average filter. Only zeros (FIR). Lowpass: attenuates high frequencies.'
    },
    'fir-diff': {
      label: 'FIR Differentiator',
      b: [1, -1],
      a: [1],
      desc: 'Difference filter [1, -1]. Zero at z=1 (DC). Highpass: blocks DC, passes changes.'
    },
    'iir-lowpass': {
      label: 'IIR Lowpass (1st order)',
      b: [0.2],
      a: [1, -0.8],
      desc: 'y[n] = 0.2*x[n] + 0.8*y[n-1]. Pole at z=0.8. Exponential decay impulse response.'
    },
    'iir-resonator': {
      label: 'IIR Resonator',
      b: [1],
      a: [1, -1.6, 0.81],
      desc: 'Complex pole pair at r=0.9, angle=±0.45rad. Rings at resonant frequency. Narrowband peak.'
    },
    'iir-notch': {
      label: 'Notch Filter',
      b: [1, -1.414, 1],
      a: [1, -1.272, 0.81],
      desc: 'Zeros on unit circle cancel a specific frequency. Poles inside pull response back up elsewhere.'
    },
    'unstable': {
      label: 'Unstable System (!)',
      b: [1],
      a: [1, -1.1],
      desc: 'Pole at z=1.1 — OUTSIDE unit circle. Impulse response grows without bound. System is UNSTABLE.'
    }
  };

  var state = {
    presetName: 'iir-lowpass',
    b: [0.2],
    a: [1, -0.8],
    heatmapResolution: 80,  // grid points per axis
    hoverAngle: -1           // angle on unit circle being hovered
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Z-transform magnitude surface with poles, zeros, and frequency response');
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
      HEIGHT = Math.max(500, Math.min(600, WIDTH * 0.7));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Mouse interaction on z-plane
    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      handleHover(mx, my);
    });

    canvas.addEventListener('mouseleave', function () {
      state.hoverAngle = -1;
      render();
    });

    // Controls
    bindSelect(containerEl, 'z-preset', function (v) {
      state.presetName = v;
      var p = presets[v];
      if (p) {
        state.b = p.b.slice();
        state.a = p.a.slice();
      }
      render();
    });

    // Load initial preset
    var p = presets[state.presetName];
    state.b = p.b.slice();
    state.a = p.a.slice();

    resize();
  }

  /* --- Complex math helpers --- */
  function cmul(ar, ai, br, bi) {
    return [ar * br - ai * bi, ar * bi + ai * br];
  }

  function cdiv(ar, ai, br, bi) {
    var denom = br * br + bi * bi;
    if (denom < 1e-30) return [1e10, 0];
    return [(ar * br + ai * bi) / denom, (ai * br - ar * bi) / denom];
  }

  function cabs(r, i) {
    return Math.sqrt(r * r + i * i);
  }

  /* Evaluate H(z) = B(z)/A(z) at complex point z = (zr, zi)
     B(z) = b[0] + b[1]*z^-1 + b[2]*z^-2 + ...
     z^-1 = 1/z  */
  function evalH(zr, zi) {
    // Compute z^-1
    var zmag2 = zr * zr + zi * zi;
    if (zmag2 < 1e-20) return [1e10, 0]; // avoid division by zero at origin
    var zinvR = zr / zmag2;
    var zinvI = -zi / zmag2;

    // Numerator: sum b[k] * (z^-1)^k
    var numR = 0, numI = 0;
    var powR = 1, powI = 0; // (z^-1)^0 = 1
    for (var k = 0; k < state.b.length; k++) {
      numR += state.b[k] * powR;
      numI += state.b[k] * powI;
      var next = cmul(powR, powI, zinvR, zinvI);
      powR = next[0]; powI = next[1];
    }

    // Denominator: sum a[k] * (z^-1)^k
    var denR = 0, denI = 0;
    powR = 1; powI = 0;
    for (var k = 0; k < state.a.length; k++) {
      denR += state.a[k] * powR;
      denI += state.a[k] * powI;
      var next = cmul(powR, powI, zinvR, zinvI);
      powR = next[0]; powI = next[1];
    }

    return cdiv(numR, numI, denR, denI);
  }

  /* Find zeros (roots of numerator) and poles (roots of denominator)
     For polynomials up to degree 2, use analytical formulas.
     For higher degrees, use Durand-Kerner iteration. */
  function findRoots(coeffs) {
    // coeffs are in z^-1 form: c[0] + c[1]*z^-1 + c[2]*z^-2 + ...
    // Multiply through by z^n to get polynomial in z:
    // c[0]*z^n + c[1]*z^(n-1) + ... + c[n]
    var n = coeffs.length - 1;
    if (n <= 0) return [];
    if (n === 1) {
      // c[0] + c[1]*z^-1 = 0  => z = -c[1]/c[0]
      if (Math.abs(coeffs[0]) < 1e-15) return [];
      return [{ r: -coeffs[1] / coeffs[0], i: 0 }];
    }
    if (n === 2) {
      // c[0]*z^2 + c[1]*z + c[2] = 0
      var A = coeffs[0], B = coeffs[1], C = coeffs[2];
      if (Math.abs(A) < 1e-15) {
        if (Math.abs(B) < 1e-15) return [];
        return [{ r: -C / B, i: 0 }];
      }
      var disc = B * B - 4 * A * C;
      if (disc >= 0) {
        var sq = Math.sqrt(disc);
        return [
          { r: (-B + sq) / (2 * A), i: 0 },
          { r: (-B - sq) / (2 * A), i: 0 }
        ];
      } else {
        var sq = Math.sqrt(-disc);
        return [
          { r: -B / (2 * A), i: sq / (2 * A) },
          { r: -B / (2 * A), i: -sq / (2 * A) }
        ];
      }
    }

    // Durand-Kerner for higher degrees
    // Reverse to standard polynomial form: a_n*z^n + ... + a_0
    var poly = [];
    for (var i = 0; i <= n; i++) poly.push(coeffs[i]);

    // Initial guesses on a circle
    var roots = [];
    for (var i = 0; i < n; i++) {
      var angle = 2 * Math.PI * i / n + 0.1;
      roots.push({ r: 0.5 * Math.cos(angle), i: 0.5 * Math.sin(angle) });
    }

    // Iterate
    for (var iter = 0; iter < 100; iter++) {
      var maxDelta = 0;
      for (var i = 0; i < n; i++) {
        // Evaluate polynomial at roots[i]
        var pr = 0, pi = 0;
        var zPowR = 1, zPowI = 0;
        for (var k = n; k >= 0; k--) {
          pr += poly[k] * zPowR;
          pi += poly[k] * zPowI;
          if (k > 0) {
            var nxt = cmul(zPowR, zPowI, roots[i].r, roots[i].i);
            zPowR = nxt[0]; zPowI = nxt[1];
          }
        }
        // Wait — polynomial evaluation: p(z) = poly[0]*z^n + poly[1]*z^(n-1) + ... + poly[n]
        // Use Horner's method instead
        pr = poly[0]; pi = 0;
        for (var k = 1; k <= n; k++) {
          var nxt = cmul(pr, pi, roots[i].r, roots[i].i);
          pr = nxt[0] + poly[k];
          pi = nxt[1];
        }

        // Product of (roots[i] - roots[j]) for j != i
        var dr = 1, di = 0;
        for (var j = 0; j < n; j++) {
          if (j === i) continue;
          var diffR = roots[i].r - roots[j].r;
          var diffI = roots[i].i - roots[j].i;
          var nxt = cmul(dr, di, diffR, diffI);
          dr = nxt[0]; di = nxt[1];
        }

        var corr = cdiv(pr, pi, dr, di);
        roots[i].r -= corr[0];
        roots[i].i -= corr[1];
        maxDelta = Math.max(maxDelta, cabs(corr[0], corr[1]));
      }
      if (maxDelta < 1e-10) break;
    }

    // Clean up near-real roots
    for (var i = 0; i < roots.length; i++) {
      if (Math.abs(roots[i].i) < 1e-8) roots[i].i = 0;
    }

    return roots;
  }

  function computeImpulseResponse(maxLen) {
    // Compute y[n] by direct-form filtering of impulse
    var h = new Float64Array(maxLen);
    var x = new Float64Array(maxLen);
    var y = new Float64Array(maxLen);
    x[0] = 1; // impulse

    for (var n = 0; n < maxLen; n++) {
      // y[n] = sum(b[k]*x[n-k]) - sum(a[k]*y[n-k], k>=1)
      var sum = 0;
      for (var k = 0; k < state.b.length; k++) {
        var idx = n - k;
        if (idx >= 0) sum += state.b[k] * x[idx];
      }
      for (var k = 1; k < state.a.length; k++) {
        var idx = n - k;
        if (idx >= 0) sum -= state.a[k] * y[idx];
      }
      y[n] = sum;
      h[n] = sum;

      // Clamp for stability display
      if (Math.abs(h[n]) > 1e6) {
        for (var m = n; m < maxLen; m++) h[m] = h[n] > 0 ? 1e6 : -1e6;
        break;
      }
    }
    return h;
  }

  function handleHover(mx, my) {
    var layout = getLayout();
    var zp = layout.zplane;

    // Check if in z-plane area
    var cx = zp.cx, cy = zp.cy, radius = zp.radius;
    var dx = mx - cx, dy = my - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < radius * 1.5) {
      // Map to z-plane coordinates
      var zr = dx / radius * 1.5;
      var zi = -dy / radius * 1.5;
      var zmag = Math.sqrt(zr * zr + zi * zi);

      // If near unit circle, show frequency response at that angle
      if (Math.abs(zmag - 1.0) < 0.15) {
        state.hoverAngle = Math.atan2(-dy, dx);
      } else {
        state.hoverAngle = -10;
      }
    } else {
      state.hoverAngle = -10;
    }
    render();
  }

  function getLayout() {
    var zplaneSize = Math.min(WIDTH * 0.42, HEIGHT * 0.55);
    var radius = zplaneSize / 2 * 0.75;
    var cx = WIDTH * 0.28;
    var cy = HEIGHT * 0.35;

    var freqX = WIDTH * 0.56;
    var freqW = WIDTH * 0.4;
    var freqH = HEIGHT * 0.3;
    var freqY = 40;

    var irX = WIDTH * 0.56;
    var irW = WIDTH * 0.4;
    var irH = HEIGHT * 0.25;
    var irY = freqY + freqH + 40;

    return {
      zplane: { cx: cx, cy: cy, radius: radius },
      freq: { x: freqX, y: freqY, w: freqW, h: freqH },
      ir: { x: irX, y: irY, w: irW, h: irH }
    };
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var layout = getLayout();

    drawZPlaneHeatmap(layout, c);
    drawFrequencyResponse(layout, c);
    drawImpulseResponse(layout, c);
    drawInfo(layout, c);
  }

  function drawZPlaneHeatmap(layout, c) {
    var zp = layout.zplane;
    var cx = zp.cx, cy = zp.cy, radius = zp.radius;
    var res = state.heatmapResolution;
    var range = 1.8; // z-plane range: -range to +range

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Z-PLANE  |H(z)| (log magnitude)', cx, cy - radius - 20);

    // Compute heatmap
    var cellW = (radius * 2 * range / 1.5) / res;
    var cellH = cellW;
    var startX = cx - res * cellW / 2;
    var startY = cy - res * cellH / 2;

    // Find max for normalization
    var maxLog = -Infinity;
    var minLog = Infinity;
    var heatmap = [];
    for (var yi = 0; yi < res; yi++) {
      heatmap[yi] = [];
      for (var xi = 0; xi < res; xi++) {
        var zr = -range + (xi / res) * 2 * range;
        var zi = range - (yi / res) * 2 * range;
        var h = evalH(zr, zi);
        var mag = cabs(h[0], h[1]);
        var logMag = Math.log10(Math.max(mag, 1e-6));
        logMag = Math.max(-3, Math.min(3, logMag));
        heatmap[yi][xi] = logMag;
        if (logMag > maxLog) maxLog = logMag;
        if (logMag < minLog) minLog = logMag;
      }
    }

    var logRange = maxLog - minLog || 1;

    // Draw heatmap
    for (var yi = 0; yi < res; yi++) {
      for (var xi = 0; xi < res; xi++) {
        var norm = (heatmap[yi][xi] - minLog) / logRange;
        ctx.fillStyle = heatmapColor(norm);
        ctx.fillRect(startX + xi * cellW, startY + yi * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    // Unit circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius / range, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(startX, cy);
    ctx.lineTo(startX + res * cellW, cy);
    ctx.moveTo(cx, startY);
    ctx.lineTo(cx, startY + res * cellH);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Re(z)', cx, startY + res * cellH + 12);
    ctx.save();
    ctx.translate(startX - 8, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Im(z)', 0, 0);
    ctx.restore();

    // Tick labels on real axis
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '8px "JetBrains Mono", monospace';
    for (var v = -1; v <= 1; v++) {
      var tx = cx + (v / range) * (res * cellW / 2);
      ctx.fillText(v.toString(), tx, startY + res * cellH + 22);
    }

    // Find and plot poles and zeros
    var zeros = findRoots(state.b);
    var poles = findRoots(state.a);

    var scale = (radius / range);

    // Draw zeros (circles)
    ctx.strokeStyle = c.math;
    ctx.lineWidth = 2.5;
    for (var i = 0; i < zeros.length; i++) {
      var zx = cx + zeros[i].r * scale;
      var zy = cy - zeros[i].i * scale;
      ctx.beginPath();
      ctx.arc(zx, zy, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw poles (X marks)
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2.5;
    for (var i = 0; i < poles.length; i++) {
      var px = cx + poles[i].r * scale;
      var py = cy - poles[i].i * scale;
      ctx.beginPath();
      ctx.moveTo(px - 5, py - 5); ctx.lineTo(px + 5, py + 5);
      ctx.moveTo(px + 5, py - 5); ctx.lineTo(px - 5, py + 5);
      ctx.stroke();
    }

    // Legend
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = c.math;
    ctx.textAlign = 'left';
    ctx.fillText('\u25CB = zero', startX, startY + res * cellH + 34);
    ctx.fillStyle = '#f87171';
    ctx.fillText('\u2717 = pole', startX + 65, startY + res * cellH + 34);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('--- = unit circle', startX + 130, startY + res * cellH + 34);

    // Hover indicator on unit circle
    if (state.hoverAngle > -5) {
      var hx = cx + Math.cos(state.hoverAngle) * (radius / range);
      var hy = cy - Math.sin(state.hoverAngle) * (radius / range);
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawFrequencyResponse(layout, c) {
    var fr = layout.freq;

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FREQUENCY RESPONSE |H(e^{j\u03C9})|', fr.x, fr.y - 6);

    // Compute frequency response (unit circle)
    var nPoints = 256;
    var magResp = new Float64Array(nPoints);
    var phaseResp = new Float64Array(nPoints);
    var maxMag = 0.01;

    for (var i = 0; i < nPoints; i++) {
      var omega = Math.PI * i / (nPoints - 1); // 0 to pi
      var zr = Math.cos(omega);
      var zi = Math.sin(omega);
      var h = evalH(zr, zi);
      magResp[i] = cabs(h[0], h[1]);
      phaseResp[i] = Math.atan2(h[1], h[0]);
      maxMag = Math.max(maxMag, magResp[i]);
    }

    var yMax = maxMag * 1.2;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(fr.x, fr.y, fr.w, fr.h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (var g = 0; g <= 4; g++) {
      var gy = fr.y + (g / 4) * fr.h;
      ctx.beginPath();
      ctx.moveTo(fr.x, gy);
      ctx.lineTo(fr.x + fr.w, gy);
      ctx.stroke();
    }

    // Zero line if response goes to zero
    var zeroY = fr.y + fr.h;

    // Draw magnitude response
    ctx.beginPath();
    ctx.strokeStyle = c.math;
    ctx.lineWidth = 2;
    for (var i = 0; i < nPoints; i++) {
      var px = fr.x + (i / (nPoints - 1)) * fr.w;
      var py = fr.y + fr.h - (magResp[i] / yMax) * fr.h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(fr.x + fr.w, fr.y + fr.h);
    ctx.lineTo(fr.x, fr.y + fr.h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(74,222,128,0.1)';
    ctx.fill();

    // Hover marker
    if (state.hoverAngle > -5) {
      var omega = state.hoverAngle;
      if (omega < 0) omega += 2 * Math.PI;
      if (omega > Math.PI) omega = 2 * Math.PI - omega;
      var idx = Math.round(omega / Math.PI * (nPoints - 1));
      idx = Math.max(0, Math.min(nPoints - 1, idx));
      var hx = fr.x + (idx / (nPoints - 1)) * fr.w;
      var hy = fr.y + fr.h - (magResp[idx] / yMax) * fr.h;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('|H| = ' + magResp[idx].toFixed(3) + ' at \u03C9 = ' + omega.toFixed(2), fr.x + fr.w, fr.y - 6);
    }

    // X-axis labels
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', fr.x, fr.y + fr.h + 12);
    ctx.fillText('\u03C0/4', fr.x + fr.w * 0.25, fr.y + fr.h + 12);
    ctx.fillText('\u03C0/2', fr.x + fr.w * 0.5, fr.y + fr.h + 12);
    ctx.fillText('3\u03C0/4', fr.x + fr.w * 0.75, fr.y + fr.h + 12);
    ctx.fillText('\u03C0', fr.x + fr.w, fr.y + fr.h + 12);
    ctx.fillText('Frequency (\u03C9)', fr.x + fr.w / 2, fr.y + fr.h + 24);

    // Y-axis label
    ctx.textAlign = 'right';
    ctx.fillText(yMax.toFixed(1), fr.x - 4, fr.y + 4);
    ctx.fillText('0', fr.x - 4, fr.y + fr.h + 4);
  }

  function drawImpulseResponse(layout, c) {
    var ir = layout.ir;
    var maxLen = 60;
    var h = computeImpulseResponse(maxLen);

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('IMPULSE RESPONSE h[n]', ir.x, ir.y - 6);

    // Check stability
    var isUnstable = false;
    for (var i = 0; i < h.length; i++) {
      if (Math.abs(h[i]) >= 1e6) { isUnstable = true; break; }
    }
    if (isUnstable) {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('UNSTABLE \u2014 h[n] grows without bound!', ir.x + ir.w, ir.y - 6);
    }

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(ir.x, ir.y, ir.w, ir.h);

    // Find range
    var maxAbs = 0.01;
    for (var i = 0; i < h.length; i++) maxAbs = Math.max(maxAbs, Math.abs(h[i]));
    if (maxAbs > 100) maxAbs = 100; // clamp for display
    var yR = maxAbs * 1.2;

    var midY = ir.y + ir.h / 2;

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ir.x, midY);
    ctx.lineTo(ir.x + ir.w, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw stems
    for (var i = 0; i < h.length; i++) {
      var px = ir.x + (i / (maxLen - 1)) * ir.w;
      var val = Math.max(-100, Math.min(100, h[i]));
      var py = midY - (val / yR) * (ir.h * 0.45);

      // Stem
      ctx.beginPath();
      ctx.moveTo(px, midY);
      ctx.lineTo(px, py);
      ctx.strokeStyle = isUnstable ? '#f87171' : c.ai;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Dot
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isUnstable ? '#f87171' : c.ai;
      ctx.fill();
    }

    // X-axis labels
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', ir.x, ir.y + ir.h + 12);
    ctx.fillText(Math.floor(maxLen / 2).toString(), ir.x + ir.w / 2, ir.y + ir.h + 12);
    ctx.fillText(maxLen.toString(), ir.x + ir.w, ir.y + ir.h + 12);
    ctx.fillText('Sample n', ir.x + ir.w / 2, ir.y + ir.h + 24);
  }

  function drawInfo(layout, c) {
    var preset = presets[state.presetName];
    if (!preset) return;

    // Transfer function display
    var infoY = HEIGHT - 50;
    ctx.fillStyle = c.text;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    var bStr = 'B(z) = ' + state.b.map(function (v, i) {
      var coeff = v === 1 ? '' : v === -1 ? '-' : v.toFixed(3);
      if (i === 0) return v.toFixed(3);
      return (v >= 0 ? ' + ' : ' ') + coeff + 'z\u207B' + (i === 1 ? '\u00B9' : '\u00B2');
    }).join('');

    var aStr = 'A(z) = ' + state.a.map(function (v, i) {
      if (i === 0) return v.toFixed(3);
      return (v >= 0 ? ' + ' : ' ') + v.toFixed(3) + 'z\u207B' + (i === 1 ? '\u00B9' : '\u00B2');
    }).join('');

    ctx.fillText('H(z) = B(z)/A(z)', WIDTH / 2, infoY);
    ctx.fillStyle = c.math;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(bStr + '  /  ' + aStr, WIDTH / 2, infoY + 16);

    // Preset description
    ctx.fillStyle = c.bridge;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(preset.desc, WIDTH / 2, infoY + 34);
  }

  function heatmapColor(t) {
    // 0 = dark blue/purple, 0.5 = teal, 1 = yellow/white
    t = Math.max(0, Math.min(1, t));
    var r, g, b;
    if (t < 0.25) {
      var s = t / 0.25;
      r = Math.round(10 + s * 20);
      g = Math.round(5 + s * 30);
      b = Math.round(40 + s * 80);
    } else if (t < 0.5) {
      var s = (t - 0.25) / 0.25;
      r = Math.round(30 + s * 10);
      g = Math.round(35 + s * 100);
      b = Math.round(120 + s * 30);
    } else if (t < 0.75) {
      var s = (t - 0.5) / 0.25;
      r = Math.round(40 + s * 160);
      g = Math.round(135 + s * 80);
      b = Math.round(150 - s * 100);
    } else {
      var s = (t - 0.75) / 0.25;
      r = Math.round(200 + s * 55);
      g = Math.round(215 + s * 40);
      b = Math.round(50 + s * 100);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
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
