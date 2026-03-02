/* ============================================================
   Tool 4.1 — Fourier Decomposition Playground
   Add/remove sinusoidal components, see the sum reconstruct in
   real-time. Hear each component or the composite. Presets for
   square wave harmonics, musical chord, vowel formants.
   Depends on: plot-utils.js, audio-engine.js
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.FourierDecomp = (function () {
  'use strict';

  var Plot = window.DSPtoAI.PlotUtils;
  var Audio = window.DSPtoAI.AudioEngine;

  var canvas, ctx;
  var WIDTH = 800, HEIGHT = 520;
  var PAD = { top: 8, right: 20, bottom: 8, left: 55 };

  var N = 512; // samples to display

  /* --- Component list: each has freq (Hz), amplitude, phase --- */
  var MAX_COMPONENTS = 12;

  var presets = {
    'square': {
      label: 'Square Wave Harmonics',
      components: (function () {
        var c = [];
        // Square wave = sum of odd harmonics: (4/pi) * sin((2k-1)x) / (2k-1)
        for (var k = 1; k <= 8; k++) {
          var n = 2 * k - 1; // odd: 1,3,5,7,9,11,13,15
          c.push({ freq: n, amp: 1.0 / n, phase: 0 });
        }
        return c;
      })()
    },
    'sawtooth': {
      label: 'Sawtooth Harmonics',
      components: (function () {
        var c = [];
        // Sawtooth = sum of all harmonics: (2/pi) * (-1)^(k+1) * sin(kx) / k
        for (var k = 1; k <= 10; k++) {
          c.push({ freq: k, amp: 1.0 / k, phase: k % 2 === 0 ? Math.PI : 0 });
        }
        return c;
      })()
    },
    'chord': {
      label: 'Musical Chord (C Major)',
      components: [
        { freq: 1, amp: 0.8, phase: 0 },     // C (fundamental)
        { freq: 1.26, amp: 0.7, phase: 0 },   // E (major third, ~5/4)
        { freq: 1.5, amp: 0.7, phase: 0 },    // G (perfect fifth, 3/2)
        { freq: 2, amp: 0.4, phase: 0 }       // C octave
      ]
    },
    'vowel-a': {
      label: 'Vowel "ah" (Formants)',
      components: [
        { freq: 1, amp: 1.0, phase: 0 },     // F0
        { freq: 2, amp: 0.5, phase: 0 },     // 2nd harmonic
        { freq: 3, amp: 0.7, phase: 0 },     // near F1 (~730 Hz)
        { freq: 5, amp: 0.4, phase: 0 },     // near F2 (~1090 Hz)
        { freq: 7, amp: 0.2, phase: 0 },
        { freq: 10, amp: 0.15, phase: 0 }    // near F3
      ]
    },
    'two-sines': {
      label: 'Two Frequencies',
      components: [
        { freq: 3, amp: 0.8, phase: 0 },
        { freq: 7, amp: 0.5, phase: 0 }
      ]
    },
    'single': {
      label: 'Single Sinusoid',
      components: [
        { freq: 3, amp: 1.0, phase: 0 }
      ]
    }
  };

  var state = {
    presetName: 'square',
    components: [],      // array of {freq, amp, phase, active}
    baseFreq: 2,         // Hz (visual frequency for display)
    selectedIdx: -1,     // which component is selected for editing
    showIndividual: true  // show individual components
  };

  var container;

  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) return;

    canvas = document.createElement('canvas');
    canvas.className = 'tool-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Fourier decomposition showing component sinusoids and frequency spectrum');
    canvas.setAttribute('tabindex', '0');
    canvas.style.cursor = 'pointer';
    var wrapper = container.querySelector('.tool-canvas-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'tool-canvas-wrapper';
      container.querySelector('.tool-body').appendChild(wrapper);
    }
    wrapper.appendChild(canvas);

    function resize() {
      WIDTH = wrapper.offsetWidth || 800;
      HEIGHT = Math.max(460, Math.min(560, WIDTH * 0.65));
      ctx = Plot.setupCanvas(canvas, WIDTH, HEIGHT);
      render();
    }
    window.addEventListener('resize', resize);

    // Load preset
    loadPreset('square');

    // Controls
    bindSelect(container, 'fourier-preset', function (v) {
      state.presetName = v;
      loadPreset(v);
      render();
    });

    bindSlider(container, 'base-freq', function (v) {
      state.baseFreq = parseFloat(v);
      render();
    });

    // Toggle individual display
    var showToggle = container.querySelector('[data-control="show-individual"]');
    if (showToggle) {
      showToggle.addEventListener('change', function () {
        state.showIndividual = this.checked;
        render();
      });
    }

    // Play buttons
    var playAllBtn = container.querySelector('[data-action="play-all"]');
    if (playAllBtn) {
      playAllBtn.addEventListener('click', function () {
        playComposite();
      });
    }

    var stopBtn = container.querySelector('[data-action="stop-audio"]');
    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        Audio.stop();
      });
    }

    // Add component button
    var addBtn = container.querySelector('[data-action="add-component"]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (state.components.length < MAX_COMPONENTS) {
          var maxFreq = 1;
          for (var i = 0; i < state.components.length; i++) {
            maxFreq = Math.max(maxFreq, state.components[i].freq);
          }
          state.components.push({ freq: maxFreq + 2, amp: 0.5, phase: 0, active: true });
          render();
        }
      });
    }

    // Remove last component
    var removeBtn = container.querySelector('[data-action="remove-component"]');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        if (state.components.length > 1) {
          state.components.pop();
          if (state.selectedIdx >= state.components.length) {
            state.selectedIdx = state.components.length - 1;
          }
          render();
        }
      });
    }

    // Canvas click: select component in spectrum display
    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      handleClick(mx, my);
    });

    resize();
  }

  function loadPreset(name) {
    var preset = presets[name];
    if (!preset) return;
    state.components = [];
    for (var i = 0; i < preset.components.length; i++) {
      var c = preset.components[i];
      state.components.push({ freq: c.freq, amp: c.amp, phase: c.phase || 0, active: true });
    }
    state.selectedIdx = -1;
  }

  function generateComposite() {
    var samples = new Float64Array(N);
    var bf = state.baseFreq;
    for (var c = 0; c < state.components.length; c++) {
      var comp = state.components[c];
      if (!comp.active) continue;
      for (var i = 0; i < N; i++) {
        var t = i / N;
        samples[i] += comp.amp * Math.sin(2 * Math.PI * comp.freq * bf * t + comp.phase);
      }
    }
    return samples;
  }

  function generateComponent(idx) {
    var samples = new Float64Array(N);
    var comp = state.components[idx];
    if (!comp || !comp.active) return samples;
    var bf = state.baseFreq;
    for (var i = 0; i < N; i++) {
      var t = i / N;
      samples[i] = comp.amp * Math.sin(2 * Math.PI * comp.freq * bf * t + comp.phase);
    }
    return samples;
  }

  function playComposite() {
    Audio.stop();
    var sr = 8000;
    var dur = 2.0;
    var totalSamples = Math.floor(sr * dur);
    var audio = new Float64Array(totalSamples);
    var baseAudio = 220; // base audio frequency Hz

    for (var c = 0; c < state.components.length; c++) {
      var comp = state.components[c];
      if (!comp.active) continue;
      for (var i = 0; i < totalSamples; i++) {
        var t = i / sr;
        audio[i] += comp.amp * 0.3 * Math.sin(2 * Math.PI * comp.freq * baseAudio * t + comp.phase);
      }
    }

    // Normalize
    var peak = 0;
    for (var i = 0; i < audio.length; i++) peak = Math.max(peak, Math.abs(audio[i]));
    if (peak > 0.8) {
      for (var i = 0; i < audio.length; i++) audio[i] = audio[i] / peak * 0.6;
    }

    Audio.playSamples(audio, sr);
  }

  function handleClick(mx, my) {
    // Check if click is in spectrum area (bottom half)
    var specY = PAD.top + (HEIGHT - 16) * 0.6;
    var specH = (HEIGHT - 16) * 0.35;
    var plotW = WIDTH - PAD.left - PAD.right;

    if (my > specY && my < specY + specH + 30) {
      // Find which bar was clicked
      var maxFreq = 1;
      for (var i = 0; i < state.components.length; i++) {
        maxFreq = Math.max(maxFreq, state.components[i].freq);
      }
      maxFreq = Math.ceil(maxFreq * 1.3) + 1;

      for (var i = 0; i < state.components.length; i++) {
        var barX = PAD.left + (state.components[i].freq / maxFreq) * plotW;
        if (Math.abs(mx - barX) < 15) {
          state.selectedIdx = (state.selectedIdx === i) ? -1 : i;
          render();
          return;
        }
      }
      state.selectedIdx = -1;
      render();
    }
  }

  function render() {
    if (!ctx) return;
    var c = Plot.getColors();
    Plot.clear(ctx, WIDTH, HEIGHT);

    var composite = generateComposite();
    var plotW = WIDTH - PAD.left - PAD.right;

    // --- Layout: Top = waveform, Bottom = spectrum ---
    var waveH = (HEIGHT - 16) * 0.55;
    var specY = PAD.top + waveH + 20;
    var specH = (HEIGHT - 16) * 0.35;

    // === Waveform section ===
    // Find y range
    var maxAbs = 0.01;
    for (var i = 0; i < composite.length; i++) maxAbs = Math.max(maxAbs, Math.abs(composite[i]));
    var yR = maxAbs * 1.2;

    var midY = PAD.top + waveH * 0.5;

    // Label
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('COMPOSITE WAVEFORM (sum of all components)', PAD.left, PAD.top + 10);

    // Component count
    var activeCount = 0;
    for (var i = 0; i < state.components.length; i++) {
      if (state.components[i].active) activeCount++;
    }
    ctx.textAlign = 'right';
    ctx.fillText(activeCount + ' component' + (activeCount !== 1 ? 's' : '') + ' active', WIDTH - PAD.right, PAD.top + 10);

    // Zero line
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, midY);
    ctx.lineTo(WIDTH - PAD.right, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw individual components (if enabled)
    if (state.showIndividual) {
      var sigColors = Plot.SIGNAL_COLORS || [
        '#22d3ee', '#fb923c', '#a78bfa', '#4ade80', '#f472b6',
        '#facc15', '#34d399', '#f87171', '#818cf8', '#a3e635'
      ];
      for (var ci = 0; ci < state.components.length; ci++) {
        if (!state.components[ci].active) continue;
        var compSamples = generateComponent(ci);
        ctx.beginPath();
        ctx.strokeStyle = sigColors[ci % sigColors.length];
        ctx.lineWidth = state.selectedIdx === ci ? 2.5 : 1;
        ctx.globalAlpha = state.selectedIdx === ci ? 0.9 : 0.3;
        for (var i = 0; i < N; i++) {
          var px = PAD.left + (i / (N - 1)) * plotW;
          var py = midY - (compSamples[i] / yR) * (waveH * 0.4);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Draw composite (bold)
    ctx.beginPath();
    ctx.strokeStyle = c.math;
    ctx.lineWidth = 2.5;
    for (var i = 0; i < N; i++) {
      var px = PAD.left + (i / (N - 1)) * plotW;
      var py = midY - (composite[i] / yR) * (waveH * 0.4);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // === Separator ===
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, specY - 10);
    ctx.lineTo(WIDTH - PAD.right, specY - 10);
    ctx.stroke();

    // === Spectrum section (bar chart of magnitudes) ===
    ctx.fillStyle = c.textDim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FREQUENCY SPECTRUM (magnitude of each component)', PAD.left, specY + 2);

    // Determine max frequency for x-axis
    var maxFreq = 1;
    for (var i = 0; i < state.components.length; i++) {
      maxFreq = Math.max(maxFreq, state.components[i].freq);
    }
    maxFreq = Math.ceil(maxFreq * 1.3) + 1;

    // Max amplitude for y-axis
    var maxAmp = 0.01;
    for (var i = 0; i < state.components.length; i++) {
      maxAmp = Math.max(maxAmp, state.components[i].amp);
    }

    var barBottom = specY + specH;
    var barTop = specY + 15;
    var barH = barBottom - barTop;

    // Frequency axis
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, barBottom);
    ctx.lineTo(WIDTH - PAD.right, barBottom);
    ctx.stroke();

    // Frequency ticks
    ctx.fillStyle = c.textDim;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    var tickStep = maxFreq <= 8 ? 1 : maxFreq <= 20 ? 2 : 5;
    for (var f = 0; f <= maxFreq; f += tickStep) {
      var tx = PAD.left + (f / maxFreq) * plotW;
      ctx.beginPath();
      ctx.moveTo(tx, barBottom);
      ctx.lineTo(tx, barBottom + 4);
      ctx.stroke();
      ctx.fillText(f + 'f\u2080', tx, barBottom + 14);
    }

    // Axis label
    ctx.fillStyle = c.textDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (multiples of base f\u2080 = ' + state.baseFreq + ' Hz)', WIDTH / 2, barBottom + 26);

    // Draw bars
    var sigColors = Plot.SIGNAL_COLORS || [
      '#22d3ee', '#fb923c', '#a78bfa', '#4ade80', '#f472b6',
      '#facc15', '#34d399', '#f87171', '#818cf8', '#a3e635'
    ];
    var barWidth = Math.max(6, Math.min(30, plotW / maxFreq * 0.4));

    for (var i = 0; i < state.components.length; i++) {
      var comp = state.components[i];
      var bx = PAD.left + (comp.freq / maxFreq) * plotW;
      var bh = (comp.amp / (maxAmp * 1.2)) * barH;
      var by = barBottom - bh;

      var isSelected = state.selectedIdx === i;

      ctx.fillStyle = sigColors[i % sigColors.length];
      ctx.globalAlpha = comp.active ? (isSelected ? 1 : 0.7) : 0.2;
      ctx.fillRect(bx - barWidth / 2, by, barWidth, bh);

      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - barWidth / 2 - 1, by - 1, barWidth + 2, bh + 2);
      }
      ctx.globalAlpha = 1;

      // Label above bar
      ctx.fillStyle = comp.active ? sigColors[i % sigColors.length] : c.textDim;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(comp.amp.toFixed(2), bx, by - 4);
    }

    // Selected component info
    if (state.selectedIdx >= 0 && state.selectedIdx < state.components.length) {
      var sel = state.components[state.selectedIdx];
      ctx.fillStyle = c.text;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        'Component ' + (state.selectedIdx + 1) + ': freq=' + sel.freq.toFixed(1) + 'f\u2080  amp=' + sel.amp.toFixed(2) + '  phase=' + (sel.phase / Math.PI).toFixed(2) + '\u03C0',
        WIDTH - PAD.right, specY + 2
      );
    }
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
