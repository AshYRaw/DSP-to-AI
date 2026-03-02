/* ============================================================
   Tool 18.1 — State-Space Simulator
   Specify A,B,C,D matrices → discretize → impulse response
   that matches IIR filter → poles in z-plane.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.SSMSimulator = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 560;
  var PAD = { top: 10, right: 10, bottom: 10, left: 10 };

  // State-space: x' = Ax + Bu, y = Cx + Du  (continuous)
  // Discretized (ZOH): x[n+1] = Ad x[n] + Bd u[n], y[n] = C x[n] + D u[n]

  var state = {
    // 2x2 A matrix entries (continuous)
    a11: -0.5, a12: 1.0,
    a21: -1.0, a22: -0.5,
    // B: 2x1, C: 1x2, D: scalar
    b1: 1.0, b2: 0.0,
    c1: 1.0, c2: 0.0,
    d: 0.0,
    dt: 0.1,  // discretization step
    presetIdx: 0
  };

  var presets = [
    { name: 'Damped Oscillator', a11: -0.5, a12: 1.0, a21: -1.0, a22: -0.5, b1: 1, b2: 0, c1: 1, c2: 0 },
    { name: 'Pure Oscillator', a11: 0, a12: 2.0, a21: -2.0, a22: 0, b1: 1, b2: 0, c1: 1, c2: 0 },
    { name: 'Overdamped', a11: -3.0, a12: 0, a21: 0, a22: -1.0, b1: 1, b2: 1, c1: 1, c2: 0.5 },
    { name: 'Unstable', a11: 0.3, a12: 1.0, a21: -1.0, a22: 0.3, b1: 1, b2: 0, c1: 1, c2: 0 }
  ];

  // Computed
  var Ad = [], Bd = [];  // discretized matrices (2x2, 2x1)
  var impulseResponse = [];
  var contPoles = [];    // continuous eigenvalues
  var discPoles = [];    // discrete eigenvalues
  var T = 80;            // simulation length

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'State-space model simulator showing state evolution and output');
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

    // A matrix sliders
    bindSlider(containerEl, 'ssm-a11', function (v) { state.a11 = parseFloat(v); compute(); render(); });
    bindSlider(containerEl, 'ssm-a12', function (v) { state.a12 = parseFloat(v); compute(); render(); });
    bindSlider(containerEl, 'ssm-a21', function (v) { state.a21 = parseFloat(v); compute(); render(); });
    bindSlider(containerEl, 'ssm-a22', function (v) { state.a22 = parseFloat(v); compute(); render(); });

    bindSlider(containerEl, 'ssm-dt', function (v) { state.dt = parseFloat(v); compute(); render(); });

    bindSelect(containerEl, 'ssm-preset', function (v) {
      var p = presets[parseInt(v, 10)];
      state.a11 = p.a11; state.a12 = p.a12;
      state.a21 = p.a21; state.a22 = p.a22;
      state.b1 = p.b1; state.b2 = p.b2;
      state.c1 = p.c1; state.c2 = p.c2;
      // Update slider displays
      updateSliderDisplay('ssm-a11', state.a11);
      updateSliderDisplay('ssm-a12', state.a12);
      updateSliderDisplay('ssm-a21', state.a21);
      updateSliderDisplay('ssm-a22', state.a22);
      compute();
      render();
    });

    compute();
    resize();
  }

  function updateSliderDisplay(name, val) {
    var el = containerEl.querySelector('[data-control="' + name + '"]');
    var disp = containerEl.querySelector('[data-value="' + name + '"]');
    if (el) el.value = val;
    if (disp) disp.textContent = val.toFixed(1);
  }

  function compute() {
    var A = [[state.a11, state.a12], [state.a21, state.a22]];
    var B = [state.b1, state.b2];
    var C = [state.c1, state.c2];
    var D = state.d;
    var dt = state.dt;

    // Continuous eigenvalues: det(A - λI) = 0
    // λ² - tr(A)λ + det(A) = 0
    var tr = A[0][0] + A[1][1];
    var det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    var disc = tr * tr - 4 * det;
    if (disc >= 0) {
      contPoles = [
        { re: (tr + Math.sqrt(disc)) / 2, im: 0 },
        { re: (tr - Math.sqrt(disc)) / 2, im: 0 }
      ];
    } else {
      contPoles = [
        { re: tr / 2, im: Math.sqrt(-disc) / 2 },
        { re: tr / 2, im: -Math.sqrt(-disc) / 2 }
      ];
    }

    // Discretize via ZOH: Ad = e^(A*dt) ≈ I + A*dt + (A*dt)²/2
    // Using second-order approximation for simplicity
    var Adt = [[A[0][0] * dt, A[0][1] * dt], [A[1][0] * dt, A[1][1] * dt]];
    var Adt2 = mat2x2Mul(Adt, Adt);
    Ad = [
      [1 + Adt[0][0] + Adt2[0][0] / 2, Adt[0][1] + Adt2[0][1] / 2],
      [Adt[1][0] + Adt2[1][0] / 2, 1 + Adt[1][1] + Adt2[1][1] / 2]
    ];

    // Bd ≈ (I + A*dt/2) * B * dt
    var half = [[1 + Adt[0][0] / 2, Adt[0][1] / 2], [Adt[1][0] / 2, 1 + Adt[1][1] / 2]];
    Bd = [half[0][0] * B[0] * dt + half[0][1] * B[1] * dt,
          half[1][0] * B[0] * dt + half[1][1] * B[1] * dt];

    // Discrete eigenvalues
    var trD = Ad[0][0] + Ad[1][1];
    var detD = Ad[0][0] * Ad[1][1] - Ad[0][1] * Ad[1][0];
    var discD = trD * trD - 4 * detD;
    if (discD >= 0) {
      discPoles = [
        { re: (trD + Math.sqrt(discD)) / 2, im: 0 },
        { re: (trD - Math.sqrt(discD)) / 2, im: 0 }
      ];
    } else {
      discPoles = [
        { re: trD / 2, im: Math.sqrt(-discD) / 2 },
        { re: trD / 2, im: -Math.sqrt(-discD) / 2 }
      ];
    }

    // Impulse response: feed δ[n] through discrete SSM
    impulseResponse = new Float64Array(T);
    var x = [0, 0]; // state
    for (var n = 0; n < T; n++) {
      var u = (n === 0) ? 1 : 0;
      // y = Cx + Du
      impulseResponse[n] = C[0] * x[0] + C[1] * x[1] + D * u;
      // x_next = Ad*x + Bd*u
      var x0 = Ad[0][0] * x[0] + Ad[0][1] * x[1] + Bd[0] * u;
      var x1 = Ad[1][0] * x[0] + Ad[1][1] * x[1] + Bd[1] * u;
      x = [x0, x1];
    }
  }

  function mat2x2Mul(A, B) {
    return [
      [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
      [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]
    ];
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var colW = (WIDTH - PAD.left - PAD.right - 30) / 3;

    // ─── Column 1: A matrix & Continuous Poles ───
    var col1X = PAD.left + 10;

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CONTINUOUS: x\' = Ax + Bu', col1X, PAD.top + 14);

    // Draw A matrix
    var matY = PAD.top + 30;
    ctx.fillStyle = c.text;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('A = [' + state.a11.toFixed(1) + '  ' + state.a12.toFixed(1) + ']', col1X + 10, matY + 14);
    ctx.fillText('    [' + state.a21.toFixed(1) + '  ' + state.a22.toFixed(1) + ']', col1X + 10, matY + 30);

    // Continuous poles (s-plane)
    var planeY = matY + 48;
    var planeSize = Math.min(colW - 20, 160);
    var planeCX = col1X + colW / 2;
    var planeCY = planeY + planeSize / 2;
    var planeR = planeSize / 2;

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('s-plane (continuous poles)', planeCX, planeY - 4);

    // Axes
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(planeCX - planeR, planeCY);
    ctx.lineTo(planeCX + planeR, planeCY);
    ctx.moveTo(planeCX, planeCY - planeR);
    ctx.lineTo(planeCX, planeCY + planeR);
    ctx.stroke();

    // Imaginary axis label (stability boundary)
    ctx.strokeStyle = 'rgba(251,113,133,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(planeCX, planeCY - planeR);
    ctx.lineTo(planeCX, planeCY + planeR);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.fillText('Re', planeCX + planeR - 8, planeCY - 4);
    ctx.fillText('Im', planeCX + 4, planeCY - planeR + 8);
    ctx.fillText('stable \u2190', planeCX - planeR / 2, planeCY + planeR + 10);
    ctx.fillText('\u2192 unstable', planeCX + planeR / 2, planeCY + planeR + 10);

    // Scale: map ±4 to plane
    var sScale = planeR / 4;

    // Plot poles
    for (var i = 0; i < contPoles.length; i++) {
      var px = planeCX + contPoles[i].re * sScale;
      var py = planeCY - contPoles[i].im * sScale;
      var isStable = contPoles[i].re < 0;
      ctx.strokeStyle = isStable ? '#4ade80' : '#fb7185';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 4, py - 4); ctx.lineTo(px + 4, py + 4);
      ctx.moveTo(px + 4, py - 4); ctx.lineTo(px - 4, py + 4);
      ctx.stroke();
    }

    // Pole values
    var poleInfoY = planeY + planeSize + 20;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    for (var i = 0; i < contPoles.length; i++) {
      var p = contPoles[i];
      var isStable = p.re < 0;
      ctx.fillStyle = isStable ? '#4ade80' : '#fb7185';
      var label = 's' + (i + 1) + ' = ' + p.re.toFixed(2) + (p.im !== 0 ? (p.im > 0 ? '+' : '') + p.im.toFixed(2) + 'j' : '');
      ctx.fillText(label + (isStable ? ' \u2713' : ' \u2717'), col1X, poleInfoY + i * 12);
    }

    // ─── Column 2: Discrete Poles (z-plane) ───
    var col2X = col1X + colW + 15;

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DISCRETE: x[n+1] = A\u0305x[n] + B\u0305u[n]', col2X, PAD.top + 14);

    ctx.fillStyle = c.text;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('\u0394t = ' + state.dt.toFixed(2) + ' (ZOH discretization)', col2X, PAD.top + 30);

    // z-plane
    var zPlaneY = PAD.top + 46;
    var zSize = Math.min(colW - 20, 180);
    var zCX = col2X + colW / 2;
    var zCY = zPlaneY + zSize / 2;
    var zR = zSize / 2;

    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('z-plane (discrete poles)', zCX, zPlaneY - 4);

    // Unit circle
    ctx.strokeStyle = 'rgba(251,191,36,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(zCX, zCY, zR * 0.75, 0, Math.PI * 2);
    ctx.stroke();

    // Axes
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(zCX - zR, zCY);
    ctx.lineTo(zCX + zR, zCY);
    ctx.moveTo(zCX, zCY - zR);
    ctx.lineTo(zCX, zCY + zR);
    ctx.stroke();

    ctx.fillStyle = c.textDim;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.fillText('Re', zCX + zR - 8, zCY - 4);
    ctx.fillText('Im', zCX + 4, zCY - zR + 8);
    ctx.fillText('|z|=1', zCX + zR * 0.75 + 4, zCY - zR * 0.5);

    // Plot discrete poles
    var zScale = zR * 0.75; // unit circle maps to 0.75 of radius
    for (var i = 0; i < discPoles.length; i++) {
      var px = zCX + discPoles[i].re * zScale;
      var py = zCY - discPoles[i].im * zScale;
      var mag = Math.sqrt(discPoles[i].re * discPoles[i].re + discPoles[i].im * discPoles[i].im);
      var isStable = mag < 1.01;
      ctx.strokeStyle = isStable ? '#4ade80' : '#fb7185';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 4, py - 4); ctx.lineTo(px + 4, py + 4);
      ctx.moveTo(px + 4, py - 4); ctx.lineTo(px - 4, py + 4);
      ctx.stroke();
    }

    // Discrete pole values
    var dPoleY = zPlaneY + zSize + 14;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    for (var i = 0; i < discPoles.length; i++) {
      var p = discPoles[i];
      var mag = Math.sqrt(p.re * p.re + p.im * p.im);
      var isStable = mag < 1.01;
      ctx.fillStyle = isStable ? '#4ade80' : '#fb7185';
      var label = 'z' + (i + 1) + ' = ' + p.re.toFixed(3) + (p.im !== 0 ? (p.im > 0 ? '+' : '') + p.im.toFixed(3) + 'j' : '');
      ctx.fillText(label + ' |z|=' + mag.toFixed(3), col2X, dPoleY + i * 12);
    }

    // Mapping note
    ctx.fillStyle = c.bridge;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillText('z = e^{s\u00b7\u0394t}: s-plane \u2192 z-plane', col2X, dPoleY + 30);

    // ─── Column 3: Impulse Response ───
    var col3X = col2X + colW + 15;

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('IMPULSE RESPONSE h[n]', col3X, PAD.top + 14);

    ctx.fillStyle = c.ai;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('y = Cx + Du,  feed \u03B4[n] as input', col3X, PAD.top + 28);

    var irY = PAD.top + 42;
    var irW = colW - 10;
    var irH = HEIGHT * 0.55;

    // Find range
    var maxIR = 0;
    for (var i = 0; i < T; i++) {
      if (Math.abs(impulseResponse[i]) > maxIR) maxIR = Math.abs(impulseResponse[i]);
    }
    if (maxIR < 1e-10) maxIR = 1;

    // Zero line
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(col3X, irY + irH / 2);
    ctx.lineTo(col3X + irW, irY + irH / 2);
    ctx.stroke();

    // Impulse response stems
    for (var n = 0; n < T; n++) {
      var bx = col3X + (n / T) * irW;
      var val = impulseResponse[n] / maxIR;
      var bh = val * irH * 0.45;
      var by = irY + irH / 2;

      ctx.strokeStyle = c.ai;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - bh);
      ctx.stroke();

      if (T <= 80) {
        ctx.fillStyle = c.ai;
        ctx.beginPath();
        ctx.arc(bx, by - bh, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Envelope (if oscillatory)
    if (contPoles[0].im !== 0) {
      var decay = Math.sqrt(discPoles[0].re * discPoles[0].re + discPoles[0].im * discPoles[0].im);
      ctx.strokeStyle = 'rgba(251,191,36,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (var n = 0; n < T; n++) {
        var env = Math.pow(decay, n) * Math.abs(impulseResponse[0] || 1) / maxIR;
        var px = col3X + (n / T) * irW;
        var py = irY + irH / 2 - env * irH * 0.45;
        if (n === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.beginPath();
      for (var n = 0; n < T; n++) {
        var env = Math.pow(decay, n) * Math.abs(impulseResponse[0] || 1) / maxIR;
        var px = col3X + (n / T) * irW;
        var py = irY + irH / 2 + env * irH * 0.45;
        if (n === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Labels
    ctx.fillStyle = c.textDim;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('n=0', col3X, irY + irH + 12);
    ctx.textAlign = 'right';
    ctx.fillText('n=' + T, col3X + irW, irY + irH + 12);

    // DSP connection
    ctx.fillStyle = c.bridge;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('This IS an IIR impulse response!', col3X, irY + irH + 26);
    ctx.fillText('Poles determine decay & oscillation.', col3X, irY + irH + 38);

    // Stability assessment
    var allStable = true;
    for (var i = 0; i < discPoles.length; i++) {
      var mag = Math.sqrt(discPoles[i].re * discPoles[i].re + discPoles[i].im * discPoles[i].im);
      if (mag > 1.01) allStable = false;
    }
    ctx.fillStyle = allStable ? '#4ade80' : '#fb7185';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillText(allStable ? 'STABLE \u2014 all |z| < 1' : 'UNSTABLE \u2014 pole(s) outside unit circle!', col3X, irY + irH + 54);

    // ─── Bottom annotation ───
    ctx.fillStyle = c.bridge;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Discretized SSM = IIR filter. Eigenvalues of A become poles of H(z). Same stability theory, same math.', WIDTH / 2, HEIGHT - 8);
  }

  // ─── Utilities ───

  function bindSlider(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = cont.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      if (disp) disp.textContent = parseFloat(this.value).toFixed(1);
      callback(this.value);
    });
    if (disp) disp.textContent = parseFloat(el.value).toFixed(1);
  }

  function bindSelect(cont, name, callback) {
    var el = cont.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
