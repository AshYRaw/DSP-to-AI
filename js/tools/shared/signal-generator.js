/* ============================================================
   DSP to AI — Signal Generator
   Creates common signal types as arrays of samples.
   Used across all chapters for generating test signals.
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.SignalGenerator = (function () {
  'use strict';

  /**
   * Generate a signal of the given type.
   * @param {Object} opts
   * @param {string}  opts.type       - 'sine'|'square'|'triangle'|'sawtooth'|'noise'|'chirp'|'impulse'|'step'
   * @param {number}  opts.frequency  - Hz (for periodic types)
   * @param {number}  opts.amplitude  - peak amplitude (default 1)
   * @param {number}  opts.offset     - DC offset (default 0)
   * @param {number}  opts.phase      - phase in radians (default 0)
   * @param {number}  opts.sampleRate - samples per second (default 44100)
   * @param {number}  opts.duration   - seconds (default 1)
   * @param {number}  opts.freqEnd    - end frequency for chirp (default 4× frequency)
   * @returns {{ samples: Float64Array, sampleRate: number, duration: number }}
   */
  function generate(opts) {
    var type = opts.type || 'sine';
    var freq = opts.frequency || 440;
    var amp = opts.amplitude !== undefined ? opts.amplitude : 1;
    var offset = opts.offset || 0;
    var phase = opts.phase || 0;
    var sr = opts.sampleRate || 44100;
    var dur = opts.duration || 1;
    var N = Math.floor(sr * dur);
    var samples = new Float64Array(N);

    switch (type) {
      case 'sine':
        for (var i = 0; i < N; i++) {
          var t = i / sr;
          samples[i] = amp * Math.sin(2 * Math.PI * freq * t + phase) + offset;
        }
        break;

      case 'square':
        for (var i = 0; i < N; i++) {
          var t = i / sr;
          var val = Math.sin(2 * Math.PI * freq * t + phase);
          samples[i] = amp * (val >= 0 ? 1 : -1) + offset;
        }
        break;

      case 'triangle':
        for (var i = 0; i < N; i++) {
          var t = i / sr;
          var p = (freq * t + phase / (2 * Math.PI)) % 1;
          samples[i] = amp * (4 * Math.abs(p - 0.5) - 1) + offset;
        }
        break;

      case 'sawtooth':
        for (var i = 0; i < N; i++) {
          var t = i / sr;
          var p = (freq * t + phase / (2 * Math.PI)) % 1;
          samples[i] = amp * (2 * p - 1) + offset;
        }
        break;

      case 'noise':
        for (var i = 0; i < N; i++) {
          samples[i] = amp * (Math.random() * 2 - 1) + offset;
        }
        break;

      case 'chirp':
        var f0 = freq;
        var f1 = opts.freqEnd || freq * 4;
        for (var i = 0; i < N; i++) {
          var t = i / sr;
          var instFreq = f0 + (f1 - f0) * t / dur;
          samples[i] = amp * Math.sin(2 * Math.PI * (f0 * t + (f1 - f0) * t * t / (2 * dur)) + phase) + offset;
        }
        break;

      case 'impulse':
        samples[0] = amp + offset;
        for (var i = 1; i < N; i++) {
          samples[i] = offset;
        }
        break;

      case 'step':
        for (var i = 0; i < N; i++) {
          samples[i] = amp + offset;
        }
        break;

      default:
        for (var i = 0; i < N; i++) {
          samples[i] = amp * Math.sin(2 * Math.PI * freq * (i / sr) + phase) + offset;
        }
    }

    return { samples: samples, sampleRate: sr, duration: dur };
  }

  /**
   * Add two signals sample-by-sample.
   * @param {Float64Array} a
   * @param {Float64Array} b
   * @returns {Float64Array}
   */
  function add(a, b) {
    var len = Math.max(a.length, b.length);
    var result = new Float64Array(len);
    for (var i = 0; i < len; i++) {
      result[i] = (i < a.length ? a[i] : 0) + (i < b.length ? b[i] : 0);
    }
    return result;
  }

  /**
   * Scale a signal by a constant.
   * @param {Float64Array} signal
   * @param {number} factor
   * @returns {Float64Array}
   */
  function scale(signal, factor) {
    var result = new Float64Array(signal.length);
    for (var i = 0; i < signal.length; i++) {
      result[i] = signal[i] * factor;
    }
    return result;
  }

  /**
   * Get a subsection of samples suitable for display.
   * @param {Float64Array} samples
   * @param {number} start - start index
   * @param {number} count - number of samples
   * @returns {Float64Array}
   */
  function slice(samples, start, count) {
    start = Math.max(0, Math.min(start, samples.length));
    count = Math.min(count, samples.length - start);
    return samples.slice(start, start + count);
  }

  return {
    generate: generate,
    add: add,
    scale: scale,
    slice: slice
  };
})();
