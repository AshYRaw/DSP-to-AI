/* ============================================================
   Tool 2.1 — System Black Box
   Feed signals in, see outputs. Toggle linearity and
   time-invariance to watch system properties hold or break.
   Depends on: signal-generator.js, plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.BlackBox = (function () {
  'use strict';

  var SG = window.DSPtoAI.SignalGenerator;
  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var PAD = { top: 20, right: 20, bottom: 35, left: 50 };

  var state = {
    signalA: 'sine',
    signalB: 'square',
    freqA: 3,
    freqB: 5,
    isLinear: true,
    isTimeInvariant: true,
    showSuperposition: true,
    timeShift: 0
  };

  var N = 400;
  var duration = 1.0;

  function init(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'System linearity and time-invariance tester');
    canvas.setAttribute('tabindex', '0');
    var wrapper = container.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      container.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(480, Math.min(580, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);
    resize();

    // Bind controls
    bindSelect(container, 'signal-a', function (v) { state.signalA = v; render(); });
    bindSelect(container, 'signal-b', function (v) { state.signalB = v; render(); });

    bindSlider(container, 'freq-a', function (v) { state.freqA = parseFloat(v); render(); });
    bindSlider(container, 'freq-b', function (v) { state.freqB = parseFloat(v); render(); });

    var linToggle = container.querySelector('[data-control="linear"]');
    if (linToggle) {
      linToggle.addEventListener('change', function () {
        state.isLinear = this.checked;
        render();
      });
    }

    var tiToggle = container.querySelector('[data-control="time-invariant"]');
    if (tiToggle) {
      tiToggle.addEventListener('change', function () {
        state.isTimeInvariant = this.checked;
        render();
      });
    }

    bindSlider(container, 'time-shift', function (v) { state.timeShift = parseInt(v, 10); render(); });

    render();
  }

  /* --- System function --- */
  function applySystem(input, isLinear, isTimeInvariant, timeIdx) {
    var output = new Float64Array(input.length);
    for (var i = 0; i < input.length; i++) {
      var x = input[i];
      var t = i / input.length;

      // Linear system: simple lowpass (weighted average of neighbours)
      // Nonlinear system: adds clipping + squaring
      if (isLinear) {
        // Simple FIR lowpass: y[n] = 0.5*x[n] + 0.3*x[n-1] + 0.2*x[n-2]
        var x1 = i >= 1 ? input[i - 1] : 0;
        var x2 = i >= 2 ? input[i - 2] : 0;
        output[i] = 0.5 * x + 0.3 * x1 + 0.2 * x2;
      } else {
        // Nonlinear: hard clip + cubic distortion
        var clipped = Math.max(-0.6, Math.min(0.6, x));
        output[i] = clipped + 0.3 * clipped * clipped * clipped;
      }

      // Time-varying modulation
      if (!isTimeInvariant) {
        var modulation = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
        output[i] *= modulation;
      }
    }
    return output;
  }

  function generateSignal(type, freq) {
    var sig = SG.generate({
      type: type, frequency: freq,
      amplitude: 0.8, sampleRate: N / duration, duration: duration
    });
    return sig.samples;
  }

  function shiftSignal(samples, shift) {
    var result = new Float64Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
      var src = i - shift;
      result[i] = (src >= 0 && src < samples.length) ? samples[src] : 0;
    }
    return result;
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var sigA = generateSignal(state.signalA, state.freqA);
    var sigB = generateSignal(state.signalB, state.freqB);

    // Combined input: A + B
    var sigAB = SG.add(sigA, sigB);

    // System outputs
    var outA = applySystem(sigA, state.isLinear, state.isTimeInvariant, 0);
    var outB = applySystem(sigB, state.isLinear, state.isTimeInvariant, 0);
    var outAB = applySystem(sigAB, state.isLinear, state.isTimeInvariant, 0);

    // Superposition check: T(A) + T(B) should equal T(A+B) if linear
    var outAplusB = SG.add(outA, outB);

    // Time invariance check
    var shiftedInput = shiftSignal(sigA, state.timeShift);
    var outShiftedInput = applySystem(shiftedInput, state.isLinear, state.isTimeInvariant, 0);
    var shiftedOutput = shiftSignal(outA, state.timeShift);

    // --- Layout: 4 rows of plots ---
    var rowH = (HEIGHT - 40) / 4;
    var yRange = 2.0;

    function drawRow(rowIdx, label, signals, colors, annotation) {
      var yOff = 10 + rowIdx * rowH;
      var localH = rowH - 10;
      var localPad = { top: yOff + 15, right: PAD.right, bottom: yOff + localH, left: PAD.left };

      // Row label
      ctx.fillStyle = c.textDim;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, PAD.left, yOff + 10);

      // Annotation on right
      if (annotation) {
        ctx.textAlign = 'right';
        ctx.fillStyle = annotation.color || c.textDim;
        ctx.font = (annotation.bold ? 'bold ' : '') + '11px "JetBrains Mono", monospace';
        ctx.fillText(annotation.text, WIDTH - PAD.right, yOff + 10);
      }

      // Separator line
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, yOff);
      ctx.lineTo(WIDTH - PAD.right, yOff);
      ctx.stroke();

      // Zero line
      var zeroY = localPad.top + (localH - 25) / 2;
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, zeroY);
      ctx.lineTo(WIDTH - PAD.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw signals
      for (var s = 0; s < signals.length; s++) {
        var plotW = WIDTH - PAD.left - PAD.right;
        var plotH = localH - 25;
        ctx.beginPath();
        ctx.strokeStyle = colors[s];
        ctx.lineWidth = s === 0 ? 2 : 1.5;
        ctx.globalAlpha = s > 0 ? 0.7 : 1;
        for (var i = 0; i < signals[s].length; i++) {
          var x = PAD.left + (i / (signals[s].length - 1)) * plotW;
          var y = localPad.top + plotH / 2 - (signals[s][i] / yRange) * plotH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Row 0: Input signals
    drawRow(0, 'INPUTS: A (cyan) + B (orange) = A+B (violet)',
      [sigA, sigB, sigAB],
      [c.dsp, c.ai, c.bridge]
    );

    // Row 1: Individual outputs T(A) and T(B)
    drawRow(1, 'SYSTEM OUTPUT: T(A) and T(B) separately',
      [outA, outB],
      [c.dsp, c.ai]
    );

    // Row 2: Superposition test
    var superpositionHolds = state.isLinear;
    drawRow(2, 'SUPERPOSITION TEST: T(A+B) vs T(A)+T(B)',
      [outAB, outAplusB],
      [c.bridge, c.math],
      {
        text: superpositionHolds ? 'MATCH — System is LINEAR' : 'MISMATCH — System is NONLINEAR',
        color: superpositionHolds ? c.math : c.danger,
        bold: true
      }
    );

    // Draw mismatch warning
    if (!superpositionHolds) {
      var row2Y = 10 + 2 * rowH;
      ctx.save();
      ctx.strokeStyle = c.danger;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(PAD.left - 5, row2Y + 2, WIDTH - PAD.left - PAD.right + 10, rowH - 12);
      ctx.restore();
    }

    // Row 3: Time invariance test
    var tiHolds = state.isTimeInvariant;
    drawRow(3, 'TIME-INVARIANCE: Shift input then process vs process then shift (shift=' + state.timeShift + ')',
      [outShiftedInput, shiftedOutput],
      [c.dsp, c.math],
      {
        text: tiHolds ? 'MATCH — System is TIME-INVARIANT' : 'MISMATCH — System is TIME-VARYING',
        color: tiHolds ? c.math : c.danger,
        bold: true
      }
    );

    if (!tiHolds && state.timeShift !== 0) {
      var row3Y = 10 + 3 * rowH;
      ctx.save();
      ctx.strokeStyle = c.danger;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(PAD.left - 5, row3Y + 2, WIDTH - PAD.left - PAD.right + 10, rowH - 12);
      ctx.restore();
    }

    // System box label
    ctx.fillStyle = state.isLinear && state.isTimeInvariant ? c.math : c.danger;
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    var sysLabel = state.isLinear && state.isTimeInvariant ? 'LTI SYSTEM' :
                   state.isLinear ? 'LINEAR TIME-VARYING' :
                   state.isTimeInvariant ? 'NONLINEAR TIME-INVARIANT' : 'NONLINEAR TIME-VARYING';
    ctx.fillText(sysLabel, WIDTH / 2, HEIGHT - 4);
  }

  function bindSlider(container, name, callback) {
    var el = container.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    var disp = container.querySelector('[data-value="' + name + '"]');
    el.addEventListener('input', function () {
      if (disp) disp.textContent = this.value;
      callback(this.value);
    });
    if (disp) disp.textContent = el.value;
  }

  function bindSelect(container, name, callback) {
    var el = container.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
