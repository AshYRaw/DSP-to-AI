/* ============================================================
   Tool 3.2 — 2D Convolution Viewer
   Drag a 3x3 kernel over a small image grid.
   See the computation and result at each position.
   Presets: blur, sharpen, edge detect (Sobel).
   Depends on: plot-utils.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.Conv2D = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 420;

  /* --- Sample 8x8 image (grayscale 0-255) --- */
  var sourceImage = [
    [ 40,  40,  40,  40, 200, 200, 200, 200],
    [ 40,  40,  40,  40, 200, 200, 200, 200],
    [ 40,  40, 120, 120, 120, 120, 200, 200],
    [ 40,  40, 120, 220, 220, 120, 200, 200],
    [ 40,  40, 120, 220, 220, 120, 200, 200],
    [ 40,  40, 120, 120, 120, 120, 200, 200],
    [ 40,  40,  40,  40, 200, 200, 200, 200],
    [ 40,  40,  40,  40, 200, 200, 200, 200]
  ];

  var kernelPresets = {
    'blur': {
      label: 'Blur (Average)',
      k: [[1/9,1/9,1/9],[1/9,1/9,1/9],[1/9,1/9,1/9]]
    },
    'sharpen': {
      label: 'Sharpen',
      k: [[0,-1,0],[-1,5,-1],[0,-1,0]]
    },
    'edge-h': {
      label: 'Edge Detect (Horizontal)',
      k: [[-1,-1,-1],[0,0,0],[1,1,1]]
    },
    'edge-v': {
      label: 'Edge Detect (Vertical)',
      k: [[-1,0,1],[-1,0,1],[-1,0,1]]
    },
    'sobel': {
      label: 'Sobel (Horizontal)',
      k: [[-1,-2,-1],[0,0,0],[1,2,1]]
    },
    'emboss': {
      label: 'Emboss',
      k: [[-2,-1,0],[-1,1,1],[0,1,2]]
    }
  };

  var state = {
    kernelName: 'blur',
    kernel: kernelPresets['blur'].k,
    hoverRow: -1,
    hoverCol: -1,
    outputImage: null
  };

  function init(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '2D convolution viewer with kernel applied to image grid');
    canvas.setAttribute('tabindex', '0');
    canvas.style.cursor = 'crosshair';
    var wrapper = container.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      container.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(380, Math.min(460, WIDTH * 0.52));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      computeFullOutput();
      render();
    }
    window.addEventListener('resize', resize);

    // Mouse hover
    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = (e.clientX - rect.left);
      var my = (e.clientY - rect.top);
      var cell = getCellFromMouse(mx, my, 'input');
      if (cell) {
        state.hoverRow = cell.row;
        state.hoverCol = cell.col;
      } else {
        state.hoverRow = -1;
        state.hoverCol = -1;
      }
      render();
    });

    canvas.addEventListener('mouseleave', function () {
      state.hoverRow = -1;
      state.hoverCol = -1;
      render();
    });

    // Kernel select
    bindSelect(container, 'kernel-2d', function (v) {
      state.kernelName = v;
      state.kernel = kernelPresets[v].k;
      computeFullOutput();
      render();
    });

    resize();
  }

  function computeFullOutput() {
    var img = sourceImage;
    var k = state.kernel;
    var rows = img.length;
    var cols = img[0].length;
    state.outputImage = [];
    for (var r = 0; r < rows; r++) {
      state.outputImage[r] = [];
      for (var c = 0; c < cols; c++) {
        state.outputImage[r][c] = convolve2DAt(img, k, r, c);
      }
    }
  }

  function convolve2DAt(img, k, row, col) {
    var sum = 0;
    var kSize = k.length;
    var offset = Math.floor(kSize / 2);
    for (var kr = 0; kr < kSize; kr++) {
      for (var kc = 0; kc < kSize; kc++) {
        var ir = row + kr - offset;
        var ic = col + kc - offset;
        var val = 0;
        if (ir >= 0 && ir < img.length && ic >= 0 && ic < img[0].length) {
          val = img[ir][ic];
        }
        sum += val * k[kr][kc];
      }
    }
    return sum;
  }

  function getCellFromMouse(mx, my, gridType) {
    var layout = getLayout();
    var grid = gridType === 'input' ? layout.input : layout.output;
    var cellSize = grid.cellSize;
    var col = Math.floor((mx - grid.x) / cellSize);
    var row = Math.floor((my - grid.y) / cellSize);
    if (row >= 0 && row < 8 && col >= 0 && col < 8) {
      return { row: row, col: col };
    }
    return null;
  }

  function getLayout() {
    var gridSize = Math.min(240, (WIDTH - 200) / 3);
    var cellSize = gridSize / 8;
    var gap = 40;
    var totalW = gridSize * 2 + 80 + gap * 2;
    var startX = (WIDTH - totalW) / 2;
    var gridY = 50;

    return {
      input: { x: startX, y: gridY, cellSize: cellSize, size: gridSize },
      kernel: { x: startX + gridSize + gap, y: gridY + gridSize / 2 - cellSize * 1.5, cellSize: cellSize, size: cellSize * 3 },
      output: { x: startX + gridSize + 80 + gap * 2, y: gridY, cellSize: cellSize, size: gridSize }
    };
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var layout = getLayout();
    var cellSize = layout.input.cellSize;

    // Labels
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('INPUT IMAGE', layout.input.x + layout.input.size / 2, layout.input.y - 8);
    ctx.fillText('KERNEL (3\u00D73)', layout.kernel.x + layout.kernel.size / 2, layout.kernel.y - 8);
    ctx.fillText('OUTPUT', layout.output.x + layout.output.size / 2, layout.output.y - 8);

    // Draw input grid
    drawImageGrid(sourceImage, layout.input.x, layout.input.y, cellSize, false);

    // Draw output grid
    if (state.outputImage) {
      drawImageGrid(state.outputImage, layout.output.x, layout.output.y, cellSize, true);
      // Show actual value range below output
      var oMin = Infinity, oMax = -Infinity;
      for (var r = 0; r < state.outputImage.length; r++) {
        for (var cc = 0; cc < state.outputImage[r].length; cc++) {
          oMin = Math.min(oMin, state.outputImage[r][cc]);
          oMax = Math.max(oMax, state.outputImage[r][cc]);
        }
      }
      ctx.fillStyle = c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('range: [' + Math.round(oMin) + ', ' + Math.round(oMax) + ']',
        layout.output.x + layout.output.size / 2, layout.output.y + layout.output.size + 14);
    }

    // Draw kernel
    drawKernelGrid(state.kernel, layout.kernel.x, layout.kernel.y, cellSize);

    // Arrow
    var arrowY = layout.input.y + layout.input.size / 2;
    ctx.strokeStyle = c.bridge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(layout.kernel.x + layout.kernel.size + 10, arrowY);
    ctx.lineTo(layout.output.x - 10, arrowY);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(layout.output.x - 10, arrowY);
    ctx.lineTo(layout.output.x - 18, arrowY - 5);
    ctx.lineTo(layout.output.x - 18, arrowY + 5);
    ctx.closePath();
    ctx.fillStyle = c.bridge;
    ctx.fill();

    // Highlight hover position
    if (state.hoverRow >= 0 && state.hoverCol >= 0) {
      var hr = state.hoverRow;
      var hc = state.hoverCol;

      // Highlight 3x3 region on input
      var offset = 1;
      for (var kr = -offset; kr <= offset; kr++) {
        for (var kc = -offset; kc <= offset; kc++) {
          var ir = hr + kr;
          var ic = hc + kc;
          if (ir >= 0 && ir < 8 && ic >= 0 && ic < 8) {
            ctx.strokeStyle = c.ai;
            ctx.lineWidth = 2;
            ctx.strokeRect(
              layout.input.x + ic * cellSize,
              layout.input.y + ir * cellSize,
              cellSize, cellSize
            );
          }
        }
      }

      // Highlight output cell
      ctx.strokeStyle = c.math;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        layout.output.x + hc * cellSize,
        layout.output.y + hr * cellSize,
        cellSize, cellSize
      );

      // Show computation
      var compY = layout.input.y + layout.input.size + 30;
      ctx.fillStyle = c.text;
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';

      var compStr = 'y[' + hr + ',' + hc + '] = ';
      var sum = 0;
      var terms = [];
      for (var kr = 0; kr < 3; kr++) {
        for (var kc = 0; kc < 3; kc++) {
          var ir = hr + kr - 1;
          var ic = hc + kc - 1;
          var pixVal = (ir >= 0 && ir < 8 && ic >= 0 && ic < 8) ? sourceImage[ir][ic] : 0;
          var kVal = state.kernel[kr][kc];
          sum += pixVal * kVal;
          if (Math.abs(kVal) > 0.001) {
            terms.push(pixVal + '\u00D7' + kVal.toFixed(2));
          }
        }
      }
      var termStr = terms.length <= 5 ? terms.join(' + ') : terms.slice(0, 4).join(' + ') + ' + ...';
      ctx.fillText(compStr + termStr + ' = ' + sum.toFixed(1), WIDTH / 2, compY);

      // Kernel label
      ctx.fillStyle = c.ai;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('Kernel overlaid at position (' + hr + ', ' + hc + ')', WIDTH / 2, compY + 18);
    }

    // Bridge note at bottom
    ctx.fillStyle = c.bridge;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('In CNNs, the kernel weights are LEARNED via backpropagation', WIDTH / 2, HEIGHT - 8);
  }

  function drawImageGrid(img, x, y, cellSize, isOutput) {
    var c = Plot.getColors();
    // Find range for normalization (output may have negative values)
    var minVal = Infinity, maxVal = -Infinity;
    for (var r = 0; r < img.length; r++) {
      for (var cc = 0; cc < img[r].length; cc++) {
        minVal = Math.min(minVal, img[r][cc]);
        maxVal = Math.max(maxVal, img[r][cc]);
      }
    }
    var range = maxVal - minVal || 1;

    for (var r = 0; r < img.length; r++) {
      for (var cc = 0; cc < img[r].length; cc++) {
        var val = img[r][cc];
        var norm = (val - minVal) / range;
        var brightness = Math.round(norm * 255);

        ctx.fillStyle = 'rgb(' + brightness + ',' + brightness + ',' + brightness + ')';
        ctx.fillRect(x + cc * cellSize, y + r * cellSize, cellSize - 1, cellSize - 1);

        // Value text
        ctx.fillStyle = brightness > 128 ? '#000' : '#fff';
        ctx.font = (cellSize > 28 ? 10 : 8) + 'px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(val), x + cc * cellSize + cellSize / 2, y + r * cellSize + cellSize / 2 + 3);
      }
    }

    // Grid border
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cellSize * 8, cellSize * 8);
  }

  function drawKernelGrid(k, x, y, cellSize) {
    var c = Plot.getColors();
    for (var r = 0; r < k.length; r++) {
      for (var cc = 0; cc < k[r].length; cc++) {
        var val = k[r][cc];
        var intensity = Math.abs(val);
        var maxK = 0;
        for (var i = 0; i < k.length; i++) for (var j = 0; j < k[i].length; j++) maxK = Math.max(maxK, Math.abs(k[i][j]));
        var norm = maxK > 0 ? intensity / maxK : 0;

        // Color: positive = green, negative = red, zero = dark
        var bg;
        if (val > 0.001) bg = 'rgba(74,222,128,' + (0.15 + norm * 0.5) + ')';
        else if (val < -0.001) bg = 'rgba(251,113,133,' + (0.15 + norm * 0.5) + ')';
        else bg = 'rgba(100,100,100,0.1)';

        ctx.fillStyle = bg;
        ctx.fillRect(x + cc * cellSize, y + r * cellSize, cellSize - 1, cellSize - 1);

        ctx.fillStyle = c.text;
        ctx.font = (cellSize > 28 ? 11 : 9) + 'px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(val % 1 === 0 ? val.toString() : val.toFixed(2), x + cc * cellSize + cellSize / 2, y + r * cellSize + cellSize / 2 + 3);
      }
    }

    // Border
    ctx.strokeStyle = c.ai;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cellSize * k[0].length, cellSize * k.length);
  }

  function bindSelect(container, name, callback) {
    var el = container.querySelector('[data-control="' + name + '"]');
    if (!el) return;
    el.addEventListener('change', function () { callback(this.value); });
  }

  return { init: init };
})();
