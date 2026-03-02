/* ============================================================
   DSP to AI — Audio Engine
   Web Audio API wrapper for playing signals, generating tones,
   and real-time audio processing. No external dependencies.
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.AudioEngine = (function () {
  'use strict';

  var audioCtx = null;
  var currentSource = null;
  var isPlaying = false;

  function getContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * Play a signal (Float64Array or number[]) as audio.
   * @param {Float64Array|number[]} samples
   * @param {number} sampleRate - default 44100
   * @param {boolean} loop      - default false
   */
  function playSamples(samples, sampleRate, loop) {
    stop();
    var ctx = getContext();
    sampleRate = sampleRate || 44100;

    var buffer = ctx.createBuffer(1, samples.length, sampleRate);
    var channelData = buffer.getChannelData(0);
    for (var i = 0; i < samples.length; i++) {
      channelData[i] = Math.max(-1, Math.min(1, samples[i]));
    }

    currentSource = ctx.createBufferSource();
    currentSource.buffer = buffer;
    currentSource.loop = !!loop;
    currentSource.connect(ctx.destination);
    currentSource.start(0);
    isPlaying = true;

    currentSource.onended = function () {
      isPlaying = false;
    };
  }

  /**
   * Play a continuous tone using OscillatorNode.
   * @param {string} type      - 'sine'|'square'|'triangle'|'sawtooth'
   * @param {number} frequency - Hz
   * @param {number} gain      - 0 to 1 (default 0.3)
   * @returns {Object} { oscillator, gainNode, stop() }
   */
  function playTone(type, frequency, gain) {
    stop();
    var ctx = getContext();
    var osc = ctx.createOscillator();
    var gainNode = ctx.createGain();

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency || 440, ctx.currentTime);
    gainNode.gain.setValueAtTime(gain !== undefined ? gain : 0.3, ctx.currentTime);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    isPlaying = true;

    var handle = {
      oscillator: osc,
      gainNode: gainNode,
      setFrequency: function (f) {
        osc.frequency.setValueAtTime(f, ctx.currentTime);
      },
      setGain: function (g) {
        gainNode.gain.setValueAtTime(g, ctx.currentTime);
      },
      stop: function () {
        try { osc.stop(); } catch (e) {}
        isPlaying = false;
      }
    };

    currentSource = handle;
    return handle;
  }

  /**
   * Stop any currently playing audio.
   */
  function stop() {
    if (currentSource) {
      if (currentSource.stop) {
        try { currentSource.stop(); } catch (e) {}
      } else if (currentSource.oscillator) {
        try { currentSource.oscillator.stop(); } catch (e) {}
      }
      currentSource = null;
    }
    isPlaying = false;
  }

  /**
   * Generate a short click / beep for UI feedback.
   * @param {number} frequency - Hz (default 1000)
   * @param {number} duration  - seconds (default 0.05)
   */
  function beep(frequency, duration) {
    var ctx = getContext();
    frequency = frequency || 1000;
    duration = duration || 0.05;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  /**
   * Check if audio is currently playing.
   */
  function playing() {
    return isPlaying;
  }

  /**
   * Get the sample rate of the audio context.
   */
  function getSampleRate() {
    return getContext().sampleRate;
  }

  return {
    getContext: getContext,
    playSamples: playSamples,
    playTone: playTone,
    stop: stop,
    beep: beep,
    playing: playing,
    getSampleRate: getSampleRate
  };
})();
