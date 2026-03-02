/* ============================================================
   Tool 10.2 — Backprop Step-Through
   Tiny network (2→2→1), walk through one forward+backward pass
   with exact arithmetic. Click "Next Step" to advance.
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.BackpropStep = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 400;
  var PAD = { top: 20, right: 20, bottom: 20, left: 20 };

  // Fixed tiny network: 2 inputs → 2 hidden (sigmoid) → 1 output (sigmoid)
  var net = {
    // Hidden layer
    w: [[0.35, 0.15], [0.25, 0.40]],  // w[j][i]
    bh: [0.60, 0.60],
    // Output layer
    v: [[0.45, 0.50]],                 // v[k][j]
    bo: [0.55]
  };

  var input = [0.8, 0.2];
  var target = 0.9;
  var lr = 0.5;

  // Computed values at each step
  var computed = {};
  var stepIndex = 0;
  var totalSteps = 10;

  var stepNames = [
    'Input',
    'Hidden weighted sum',
    'Hidden activation',
    'Output weighted sum',
    'Output activation',
    'Compute loss',
    'Output gradient',
    'Hidden gradients',
    'Update output weights',
    'Update hidden weights'
  ];

  var containerEl;

  function init(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Backpropagation step-through showing forward and backward passes');
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
      HEIGHT = Math.max(360, Math.min(420, WIDTH * 0.5));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Buttons
    var nextBtn = containerEl.querySelector('[data-action="bp-next"]');
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (stepIndex < totalSteps - 1) stepIndex++;
      render();
    });
    var prevBtn = containerEl.querySelector('[data-action="bp-prev"]');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      if (stepIndex > 0) stepIndex--;
      render();
    });
    var resetBtn = containerEl.querySelector('[data-action="bp-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      stepIndex = 0;
      render();
    });
    var allBtn = containerEl.querySelector('[data-action="bp-all"]');
    if (allBtn) allBtn.addEventListener('click', function () {
      stepIndex = totalSteps - 1;
      render();
    });

    computeAll();
    resize();
  }

  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

  function computeAll() {
    // Forward pass
    var zh = [];
    for (var j = 0; j < 2; j++) {
      zh.push(net.w[j][0] * input[0] + net.w[j][1] * input[1] + net.bh[j]);
    }
    computed.zh = zh;

    var ah = [];
    for (var j = 0; j < 2; j++) {
      ah.push(sigmoid(zh[j]));
    }
    computed.ah = ah;

    var zo = net.v[0][0] * ah[0] + net.v[0][1] * ah[1] + net.bo[0];
    computed.zo = zo;

    var ao = sigmoid(zo);
    computed.ao = ao;

    // Loss (MSE for simplicity)
    computed.loss = 0.5 * (target - ao) * (target - ao);

    // Backward pass
    // Output gradient: dL/dao = -(target - ao), dao/dzo = ao*(1-ao)
    var dLdao = -(target - ao);
    var daodzo = ao * (1 - ao);
    var deltaO = dLdao * daodzo;
    computed.deltaO = deltaO;

    // dL/dv[0][j] = deltaO * ah[j]
    computed.dv = [deltaO * ah[0], deltaO * ah[1]];
    computed.dbo = deltaO;

    // Hidden gradients
    var deltaH = [];
    for (var j = 0; j < 2; j++) {
      var dLdah = net.v[0][j] * deltaO;
      var dahdz = ah[j] * (1 - ah[j]);
      deltaH.push(dLdah * dahdz);
    }
    computed.deltaH = deltaH;

    // dL/dw[j][i] = deltaH[j] * input[i]
    computed.dw = [
      [deltaH[0] * input[0], deltaH[0] * input[1]],
      [deltaH[1] * input[0], deltaH[1] * input[1]]
    ];
    computed.dbh = [deltaH[0], deltaH[1]];

    // Updated weights
    computed.v_new = [[
      net.v[0][0] - lr * computed.dv[0],
      net.v[0][1] - lr * computed.dv[1]
    ]];
    computed.bo_new = [net.bo[0] - lr * computed.dbo];

    computed.w_new = [
      [net.w[0][0] - lr * computed.dw[0][0], net.w[0][1] - lr * computed.dw[0][1]],
      [net.w[1][0] - lr * computed.dw[1][0], net.w[1][1] - lr * computed.dw[1][1]]
    ];
    computed.bh_new = [
      net.bh[0] - lr * computed.dbh[0],
      net.bh[1] - lr * computed.dbh[1]
    ];
  }

  // ─── Rendering ───

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var totalW = WIDTH - PAD.left - PAD.right;
    var netW = totalW * 0.55;
    var infoW = totalW - netW - 20;
    var infoX = PAD.left + netW + 20;
    var netH = HEIGHT - PAD.top - PAD.bottom - 30;

    // Step indicator
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Step ' + (stepIndex + 1) + '/' + totalSteps + ': ' + stepNames[stepIndex], PAD.left, PAD.top);

    // Progress bar
    var barW = totalW * 0.5;
    var barX = PAD.left + totalW - barW;
    ctx.fillStyle = c.border;
    ctx.fillRect(barX, PAD.top - 8, barW, 4);
    var isForward = stepIndex < 6;
    ctx.fillStyle = isForward ? c.dsp : c.ai;
    ctx.fillRect(barX, PAD.top - 8, barW * ((stepIndex + 1) / totalSteps), 4);

    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = isForward ? c.dsp : c.ai;
    ctx.fillText(isForward ? 'FORWARD PASS' : 'BACKWARD PASS', barX + barW, PAD.top);

    var y0 = PAD.top + 16;

    // ─── Network Diagram ───
    drawNetwork(PAD.left, y0, netW, netH, c);

    // ─── Info Panel ───
    drawInfoPanel(infoX, y0, infoW, netH, c);
  }

  function drawNetwork(x0, y0, w, h, c) {
    var cx = x0 + w / 2;
    var layers = [2, 2, 1];
    var layerX = [x0 + w * 0.15, x0 + w * 0.50, x0 + w * 0.85];
    var nodeR = 18;

    // Compute node positions
    var positions = [];
    for (var l = 0; l < 3; l++) {
      var n = layers[l];
      var layerPos = [];
      var totalH = n * nodeR * 3;
      var startY = y0 + h / 2 - totalH / 2 + nodeR * 1.5;
      for (var j = 0; j < n; j++) {
        layerPos.push({ x: layerX[l], y: startY + j * nodeR * 3 });
      }
      positions.push(layerPos);
    }

    // ─── Connections: Input→Hidden ───
    for (var j = 0; j < 2; j++) {
      for (var i = 0; i < 2; i++) {
        var active = stepIndex >= 1;
        var updating = stepIndex >= 9;
        var wVal = updating ? computed.w_new[j][i] : net.w[j][i];
        var alpha = active ? 0.8 : 0.2;

        ctx.beginPath();
        ctx.moveTo(positions[0][i].x + nodeR, positions[0][i].y);
        ctx.lineTo(positions[1][j].x - nodeR, positions[1][j].y);
        ctx.strokeStyle = updating
          ? 'rgba(74,222,128,' + alpha + ')'
          : 'rgba(148,163,184,' + alpha + ')';
        ctx.lineWidth = active ? 2 : 1;
        ctx.stroke();

        // Weight label
        if (active) {
          var mx = (positions[0][i].x + nodeR + positions[1][j].x - nodeR) / 2;
          var my = (positions[0][i].y + positions[1][j].y) / 2;
          ctx.fillStyle = updating ? c.math : c.text;
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('w=' + wVal.toFixed(3), mx, my - 4);
          if (stepIndex >= 9) {
            ctx.fillStyle = c.danger;
            ctx.fillText('\u0394=' + (-lr * computed.dw[j][i]).toFixed(4), mx, my + 6);
          }
        }
      }
    }

    // ─── Connections: Hidden→Output ───
    for (var j = 0; j < 2; j++) {
      var active = stepIndex >= 3;
      var updating = stepIndex >= 8;
      var vVal = updating ? computed.v_new[0][j] : net.v[0][j];
      var alpha = active ? 0.8 : 0.2;

      ctx.beginPath();
      ctx.moveTo(positions[1][j].x + nodeR, positions[1][j].y);
      ctx.lineTo(positions[2][0].x - nodeR, positions[2][0].y);
      ctx.strokeStyle = updating
        ? 'rgba(74,222,128,' + alpha + ')'
        : 'rgba(148,163,184,' + alpha + ')';
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();

      if (active) {
        var mx = (positions[1][j].x + nodeR + positions[2][0].x - nodeR) / 2;
        var my = (positions[1][j].y + positions[2][0].y) / 2;
        ctx.fillStyle = updating ? c.math : c.text;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('v=' + vVal.toFixed(3), mx, my - 4);
        if (stepIndex >= 8) {
          ctx.fillStyle = c.danger;
          ctx.fillText('\u0394=' + (-lr * computed.dv[j]).toFixed(4), mx, my + 6);
        }
      }
    }

    // ─── Backward arrows ───
    if (stepIndex >= 6) {
      ctx.setLineDash([4, 4]);
      // Output → Hidden
      var arrowAlpha = 0.6;
      ctx.strokeStyle = 'rgba(251,146,60,' + arrowAlpha + ')';
      ctx.lineWidth = 1.5;
      for (var j = 0; j < 2; j++) {
        ctx.beginPath();
        ctx.moveTo(positions[2][0].x - nodeR - 4, positions[2][0].y + (j === 0 ? -4 : 4));
        ctx.lineTo(positions[1][j].x + nodeR + 4, positions[1][j].y);
        ctx.stroke();
      }
      // Hidden → Input (show at step 7+)
      if (stepIndex >= 7) {
        ctx.strokeStyle = 'rgba(251,146,60,' + (arrowAlpha * 0.7) + ')';
        for (var j = 0; j < 2; j++) {
          for (var i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.moveTo(positions[1][j].x - nodeR - 4, positions[1][j].y);
            ctx.lineTo(positions[0][i].x + nodeR + 4, positions[0][i].y);
            ctx.stroke();
          }
        }
      }
      ctx.setLineDash([]);
    }

    // ─── Nodes ───
    // Input nodes
    for (var i = 0; i < 2; i++) {
      var active = stepIndex >= 0;
      drawNode(positions[0][i].x, positions[0][i].y, nodeR,
        active ? c.dsp : c.textDim,
        'x' + (i + 1) + '=' + input[i].toFixed(1),
        active);
    }

    // Hidden nodes
    for (var j = 0; j < 2; j++) {
      var active = stepIndex >= 1;
      var label = 'h' + (j + 1);
      var value = '';
      if (stepIndex >= 2) value = computed.ah[j].toFixed(4);
      else if (stepIndex >= 1) value = 'z=' + computed.zh[j].toFixed(4);

      var color = c.bridge;
      if (stepIndex >= 7) color = c.ai; // backprop active
      drawNode(positions[1][j].x, positions[1][j].y, nodeR,
        active ? color : c.textDim,
        label, active, value);

      // Show delta below
      if (stepIndex >= 7) {
        ctx.fillStyle = c.ai;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('\u03B4=' + computed.deltaH[j].toFixed(4), positions[1][j].x, positions[1][j].y + nodeR + 12);
      }
    }

    // Output node
    var outActive = stepIndex >= 3;
    var outLabel = '\u0177';
    var outValue = '';
    if (stepIndex >= 4) outValue = computed.ao.toFixed(4);
    else if (stepIndex >= 3) outValue = 'z=' + computed.zo.toFixed(4);
    var outColor = c.ai;
    if (stepIndex >= 6) outColor = c.danger;
    drawNode(positions[2][0].x, positions[2][0].y, nodeR,
      outActive ? outColor : c.textDim,
      outLabel, outActive, outValue);

    // Show delta below output
    if (stepIndex >= 6) {
      ctx.fillStyle = c.ai;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('\u03B4=' + computed.deltaO.toFixed(4), positions[2][0].x, positions[2][0].y + nodeR + 12);
    }

    // Target
    ctx.fillStyle = c.math;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('target=' + target, positions[2][0].x, positions[2][0].y - nodeR - 8);
  }

  function drawNode(x, y, r, color, label, active, value) {
    var c = Plot.getColors();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = active ? (color + '22') : 'rgba(0,0,0,0.2)';
    ctx.fill();
    ctx.strokeStyle = active ? color : c.textDim;
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = active ? color : c.textDim;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + (value ? -2 : 4));

    if (value) {
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.fillText(value, x, y + 8);
    }
  }

  function drawInfoPanel(x0, y0, w, h, c) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x0, y0, w, h);

    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('COMPUTATION', x0 + 8, y0 + 14);

    var lineH = 14;
    var ty = y0 + 32;
    var indent = x0 + 10;

    function line(text, color) {
      ctx.fillStyle = color || c.text;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(text, indent, ty);
      ty += lineH;
    }

    function heading(text) {
      ty += 4;
      ctx.fillStyle = c.textDim;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText(text, indent, ty);
      ty += lineH;
    }

    if (stepIndex >= 0) {
      heading('INPUT');
      line('x\u2081=' + input[0] + '  x\u2082=' + input[1], c.dsp);
    }
    if (stepIndex >= 1) {
      heading('HIDDEN WEIGHTED SUM');
      line('z\u2081 = ' + net.w[0][0] + '\u00d7' + input[0] + ' + ' + net.w[0][1] + '\u00d7' + input[1] + ' + ' + net.bh[0], c.text);
      line('   = ' + computed.zh[0].toFixed(4), c.bridge);
      line('z\u2082 = ' + computed.zh[1].toFixed(4), c.bridge);
    }
    if (stepIndex >= 2) {
      heading('HIDDEN ACTIVATION');
      line('h\u2081 = \u03C3(' + computed.zh[0].toFixed(3) + ') = ' + computed.ah[0].toFixed(4), c.bridge);
      line('h\u2082 = \u03C3(' + computed.zh[1].toFixed(3) + ') = ' + computed.ah[1].toFixed(4), c.bridge);
    }
    if (stepIndex >= 3) {
      heading('OUTPUT WEIGHTED SUM');
      line('z_o = ' + net.v[0][0] + '\u00d7' + computed.ah[0].toFixed(3) + ' + ' + net.v[0][1] + '\u00d7' + computed.ah[1].toFixed(3), c.text);
      line('    = ' + computed.zo.toFixed(4), c.ai);
    }
    if (stepIndex >= 4) {
      heading('OUTPUT ACTIVATION');
      line('\u0177 = \u03C3(' + computed.zo.toFixed(3) + ') = ' + computed.ao.toFixed(4), c.ai);
    }
    if (stepIndex >= 5) {
      heading('LOSS');
      line('L = \u00bd(t-\u0177)\u00b2 = ' + computed.loss.toFixed(6), c.danger);
    }
    if (stepIndex >= 6) {
      heading('OUTPUT GRADIENT');
      line('\u03B4_o = (' + computed.ao.toFixed(3) + '-' + target + ')\u00d7\u03C3\'', c.ai);
      line('     = ' + computed.deltaO.toFixed(6), c.ai);
    }
    if (stepIndex >= 7) {
      heading('HIDDEN GRADIENTS');
      line('\u03B4\u2081 = v\u2081\u00d7\u03B4_o\u00d7\u03C3\'(z\u2081) = ' + computed.deltaH[0].toFixed(6), c.ai);
      line('\u03B4\u2082 = ' + computed.deltaH[1].toFixed(6), c.ai);
    }
    if (stepIndex >= 8) {
      heading('UPDATE OUTPUT WEIGHTS');
      line('v\u2081: ' + net.v[0][0].toFixed(3) + ' \u2192 ' + computed.v_new[0][0].toFixed(4), c.math);
      line('v\u2082: ' + net.v[0][1].toFixed(3) + ' \u2192 ' + computed.v_new[0][1].toFixed(4), c.math);
    }
    if (stepIndex >= 9) {
      heading('UPDATE HIDDEN WEIGHTS');
      line('w\u2081\u2081: ' + net.w[0][0].toFixed(3) + ' \u2192 ' + computed.w_new[0][0].toFixed(4), c.math);
      line('w\u2082\u2082: ' + net.w[1][1].toFixed(3) + ' \u2192 ' + computed.w_new[1][1].toFixed(4), c.math);
    }
  }

  return { init: init };
})();
