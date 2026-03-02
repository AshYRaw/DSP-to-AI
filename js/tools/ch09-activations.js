/* ============================================================
   Tool 9.2 — Activation Function Gallery
   Interactive plot of all activation functions + derivatives.
   Hover to see values, shows vanishing gradient regions.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.ActivationGallery = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 420;
  var PAD = { top: 30, right: 20, bottom: 40, left: 55 };

  var activations = [
    {
      name: 'Step',
      fn: function (z) { return z >= 0 ? 1 : 0; },
      deriv: function (z) { return 0; },  // technically undefined at 0
      color: '#94a3b8',
      range: [-1.5, 1.5],
      notes: 'Original perceptron. Not differentiable — cannot use gradient descent.'
    },
    {
      name: 'Sigmoid',
      fn: function (z) { return 1 / (1 + Math.exp(-z)); },
      deriv: function (z) { var s = 1 / (1 + Math.exp(-z)); return s * (1 - s); },
      color: '#22d3ee',
      range: [-0.5, 1.5],
      notes: 'Smooth step. Saturates for |z|>5 causing vanishing gradients.'
    },
    {
      name: 'Tanh',
      fn: function (z) { return Math.tanh(z); },
      deriv: function (z) { var t = Math.tanh(z); return 1 - t * t; },
      color: '#a78bfa',
      range: [-1.5, 1.5],
      notes: 'Zero-centered sigmoid. Still saturates, but often better than sigmoid.'
    },
    {
      name: 'ReLU',
      fn: function (z) { return Math.max(0, z); },
      deriv: function (z) { return z > 0 ? 1 : 0; },
      color: '#4ade80',
      range: [-2, 6],
      notes: 'Default for most networks. No saturation for z>0, but "dead neurons" for z<0.'
    },
    {
      name: 'Leaky ReLU',
      fn: function (z) { return z >= 0 ? z : 0.1 * z; },
      deriv: function (z) { return z >= 0 ? 1 : 0.1; },
      color: '#fbbf24',
      range: [-2, 6],
      notes: 'Fixes dead neurons with small negative slope (alpha=0.1).'
    },
    {
      name: 'GELU',
      fn: function (z) { return 0.5 * z * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z * z * z))); },
      deriv: function (z) {
        // Numerical derivative
        var h = 0.001;
        var f1 = 0.5 * (z + h) * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * ((z + h) + 0.044715 * (z + h) * (z + h) * (z + h))));
        var f0 = 0.5 * (z - h) * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * ((z - h) + 0.044715 * (z - h) * (z - h) * (z - h))));
        return (f1 - f0) / (2 * h);
      },
      color: '#fb923c',
      range: [-2, 6],
      notes: 'Used in Transformers (GPT, BERT). Smooth approximation of ReLU.'
    },
    {
      name: 'Swish',
      fn: function (z) { return z / (1 + Math.exp(-z)); },
      deriv: function (z) {
        var s = 1 / (1 + Math.exp(-z));
        return s + z * s * (1 - s);
      },
      color: '#fb7185',
      range: [-2, 6],
      notes: 'Self-gated: z * sigmoid(z). Non-monotonic. Found by neural architecture search.'
    }
  ];

  var state = {
    selected: 1,   // index into activations (sigmoid by default)
    hoverX: null,   // hover position in z-space
    showAll: false
  };

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Activation function comparison showing sigmoid, tanh, ReLU, and variants');
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
      HEIGHT = Math.max(380, Math.min(460, WIDTH * 0.52));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Activation selector buttons
    var btnContainer = containerEl.querySelector('.activation-buttons');
    if (btnContainer) {
      for (var i = 0; i < activations.length; i++) {
        var btn = document.createElement('button');
        btn.className = 'act-btn' + (i === state.selected ? ' active' : '');
        btn.style.borderColor = activations[i].color;
        btn.textContent = activations[i].name;
        btn.dataset.index = i;
        btn.addEventListener('click', (function (idx) {
          return function () {
            state.selected = idx;
            state.showAll = false;
            updateButtons();
            render();
          };
        })(i));
        btnContainer.appendChild(btn);
      }
      // "Show All" button
      var allBtn = document.createElement('button');
      allBtn.className = 'act-btn act-btn--all';
      allBtn.textContent = 'All';
      allBtn.addEventListener('click', function () {
        state.showAll = !state.showAll;
        updateButtons();
        render();
      });
      btnContainer.appendChild(allBtn);
    }

    // Canvas hover
    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var plotW = WIDTH - PAD.left - PAD.right;
      if (mx >= PAD.left && mx <= PAD.left + plotW) {
        var t = (mx - PAD.left) / plotW;
        state.hoverX = -6 + t * 12; // z-range: -6 to 6
        render();
      }
    });

    canvas.addEventListener('mouseleave', function () {
      state.hoverX = null;
      render();
    });

    resize();
  }

  function updateButtons() {
    var btns = containerEl.querySelectorAll('.act-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].classList.contains('act-btn--all')) {
        btns[i].classList.toggle('active', state.showAll);
      } else {
        var idx = parseInt(btns[i].dataset.index, 10);
        btns[i].classList.toggle('active', idx === state.selected && !state.showAll);
      }
    }
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var plotW = WIDTH - PAD.left - PAD.right;
    var halfH = (HEIGHT - PAD.top - PAD.bottom) / 2;
    var topY = PAD.top;
    var bottomY = PAD.top + halfH;

    // === Top: Activation Function ===
    drawFunctionPlot(PAD.left, topY, plotW, halfH, false, c);

    // === Separator ===
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, bottomY);
    ctx.lineTo(PAD.left + plotW, bottomY);
    ctx.stroke();

    // === Bottom: Derivative ===
    drawFunctionPlot(PAD.left, bottomY, plotW, halfH, true, c);
  }

  function drawFunctionPlot(x0, y0, w, h, isDerivative, c) {
    var act = activations[state.selected];
    var zMin = -6, zMax = 6;

    // Determine y range
    var yRange;
    if (isDerivative) {
      yRange = [-0.5, 1.2];
    } else {
      yRange = act.range;
    }

    var plotH = h - 10;
    var plotY = y0 + 5;

    // Title
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    if (isDerivative) {
      ctx.fillText('DERIVATIVE: \u03C3\'(z)', x0, y0 + 10);
    } else {
      ctx.fillText('ACTIVATION: \u03C3(z)', x0, y0 + 10);
    }

    // Grid lines
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.3;

    // Zero line (horizontal)
    var zeroY = plotY + plotH * (yRange[1] / (yRange[1] - yRange[0]));
    if (zeroY >= plotY && zeroY <= plotY + plotH) {
      ctx.beginPath();
      ctx.moveTo(x0, zeroY);
      ctx.lineTo(x0 + w, zeroY);
      ctx.stroke();
    }

    // Zero line (vertical, z=0)
    var zeroX = x0 + w * (-zMin / (zMax - zMin));
    ctx.beginPath();
    ctx.moveTo(zeroX, plotY);
    ctx.lineTo(zeroX, plotY + plotH);
    ctx.stroke();

    // Y axis labels
    ctx.fillStyle = c.textDim;
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    var yTicks = 4;
    for (var i = 0; i <= yTicks; i++) {
      var yVal = yRange[0] + (yRange[1] - yRange[0]) * i / yTicks;
      var py = plotY + plotH - (plotH * i / yTicks);
      ctx.fillText(yVal.toFixed(1), x0 - 4, py + 3);
    }

    // X axis labels
    ctx.textAlign = 'center';
    for (var z = -6; z <= 6; z += 2) {
      var px = x0 + w * ((z - zMin) / (zMax - zMin));
      if (!isDerivative) {
        ctx.fillText(z.toString(), px, plotY + plotH + 12);
      }
    }

    // "Show All" mode
    if (state.showAll) {
      for (var a = 0; a < activations.length; a++) {
        var fn = isDerivative ? activations[a].deriv : activations[a].fn;
        drawCurve(x0, plotY, w, plotH, zMin, zMax, yRange, fn, activations[a].color, a === state.selected ? 2.5 : 1, a === state.selected ? 1 : 0.4);
      }
      // Legend
      if (!isDerivative) {
        for (var a = 0; a < activations.length; a++) {
          ctx.fillStyle = activations[a].color;
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          var lx = x0 + w - 75;
          var ly = plotY + 12 + a * 12;
          ctx.globalAlpha = a === state.selected ? 1 : 0.5;
          ctx.fillRect(lx, ly - 4, 10, 2);
          ctx.fillText(activations[a].name, lx + 14, ly);
          ctx.globalAlpha = 1;
        }
      }
    } else {
      // Single activation
      var fn = isDerivative ? act.deriv : act.fn;

      // Highlight vanishing gradient regions for sigmoid/tanh
      if (isDerivative && (state.selected === 1 || state.selected === 2)) {
        // Left saturation region
        ctx.fillStyle = 'rgba(251,113,133,0.08)';
        var satLeftEnd = x0 + w * ((-3 - zMin) / (zMax - zMin));
        ctx.fillRect(x0, plotY, satLeftEnd - x0, plotH);
        // Right saturation region
        var satRightStart = x0 + w * ((3 - zMin) / (zMax - zMin));
        ctx.fillRect(satRightStart, plotY, x0 + w - satRightStart, plotH);
        // Labels
        ctx.fillStyle = 'rgba(251,113,133,0.5)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('vanishing', x0 + (satLeftEnd - x0) / 2, plotY + plotH / 2);
        ctx.fillText('gradient', x0 + (satLeftEnd - x0) / 2, plotY + plotH / 2 + 10);
        ctx.fillText('vanishing', satRightStart + (x0 + w - satRightStart) / 2, plotY + plotH / 2);
        ctx.fillText('gradient', satRightStart + (x0 + w - satRightStart) / 2, plotY + plotH / 2 + 10);
      }

      drawCurve(x0, plotY, w, plotH, zMin, zMax, yRange, fn, act.color, 2.5, 1);

      // Notes
      if (!isDerivative) {
        ctx.fillStyle = act.color;
        ctx.globalAlpha = 0.7;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        // Wrap notes text
        var maxW = w * 0.55;
        ctx.fillText(act.notes.substring(0, 60), x0 + w, plotY + 10);
        if (act.notes.length > 60) {
          ctx.fillText(act.notes.substring(60), x0 + w, plotY + 22);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Hover crosshair and value
    if (state.hoverX !== null) {
      var hoverPx = x0 + w * ((state.hoverX - zMin) / (zMax - zMin));

      // Vertical line
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hoverPx, plotY);
      ctx.lineTo(hoverPx, plotY + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Value dot and label
      var fn = isDerivative ? act.deriv : act.fn;
      var val = fn(state.hoverX);
      var valPy = plotY + plotH - ((val - yRange[0]) / (yRange[1] - yRange[0])) * plotH;
      valPy = Math.max(plotY, Math.min(plotY + plotH, valPy));

      ctx.beginPath();
      ctx.arc(hoverPx, valPy, 5, 0, Math.PI * 2);
      ctx.fillStyle = act.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Value text
      ctx.fillStyle = '#fff';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = hoverPx > x0 + w / 2 ? 'right' : 'left';
      var offset = hoverPx > x0 + w / 2 ? -10 : 10;
      if (isDerivative) {
        ctx.fillText('\u03C3\'(' + state.hoverX.toFixed(1) + ')=' + val.toFixed(3), hoverPx + offset, valPy - 8);
      } else {
        ctx.fillText('\u03C3(' + state.hoverX.toFixed(1) + ')=' + val.toFixed(3), hoverPx + offset, valPy - 8);
      }
    }
  }

  function drawCurve(x0, y0, w, h, zMin, zMax, yRange, fn, color, lineW, alpha) {
    var nPts = 300;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.globalAlpha = alpha;

    var started = false;
    for (var i = 0; i <= nPts; i++) {
      var z = zMin + (zMax - zMin) * i / nPts;
      var val = fn(z);
      var px = x0 + (i / nPts) * w;
      var py = y0 + h - ((val - yRange[0]) / (yRange[1] - yRange[0])) * h;
      py = Math.max(y0 - 5, Math.min(y0 + h + 5, py));

      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ─── Helpers ───

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
