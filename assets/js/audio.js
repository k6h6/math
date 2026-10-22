/* ============================================================
   Math Adventures — tiny sound engine (native Web Audio API)
   Replaces the Tone.js CDN dependency. No external files.
   Respects the sound setting; context starts on first gesture.
   ============================================================ */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch (e) { ctx = null; }
    return ctx;
  }

  function resume() {
    var c = ensureCtx();
    if (c && c.state === 'suspended') {
      try { c.resume(); } catch (e) { /* ignore */ }
    }
  }

  function tone(freq, durationSec, opts) {
    if (!enabled) return;
    var c = ensureCtx();
    if (!c) return;
    resume();
    opts = opts || {};
    try {
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.value = freq;
      var t0 = c.currentTime + (opts.delay || 0);
      var vol = opts.volume != null ? opts.volume : 0.12;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + durationSec + 0.03);
    } catch (e) { /* never break the UI for sound */ }
  }

  var MAAudio = {
    setEnabled: function (on) { enabled = !!on; },
    isEnabled: function () { return enabled; },
    unlock: function () { resume(); },
    play: function (name) {
      if (!enabled) return;
      switch (name) {
        case 'click':   tone(660, 0.07, { type: 'triangle', volume: 0.08 }); break;
        case 'correct':
          tone(523.25, 0.12, { type: 'sine', volume: 0.12 });
          tone(659.25, 0.12, { type: 'sine', volume: 0.12, delay: 0.08 });
          tone(783.99, 0.16, { type: 'sine', volume: 0.12, delay: 0.16 });
          break;
        case 'wrong':
          tone(196.00, 0.18, { type: 'sawtooth', volume: 0.08 });
          tone(130.81, 0.22, { type: 'sawtooth', volume: 0.08, delay: 0.12 });
          break;
        case 'win':
          tone(523.25, 0.15, { type: 'triangle', volume: 0.12 });
          tone(659.25, 0.15, { type: 'triangle', volume: 0.12, delay: 0.12 });
          tone(783.99, 0.15, { type: 'triangle', volume: 0.12, delay: 0.24 });
          tone(1046.5, 0.30, { type: 'triangle', volume: 0.12, delay: 0.36 });
          break;
        case 'tick':    tone(880, 0.04, { type: 'square', volume: 0.05 }); break;
        case 'pop':     tone(440, 0.06, { type: 'sine', volume: 0.10 }); break;
        case 'stepUp':  tone(523.25, 0.08, { type: 'sine', volume: 0.10 }); break;
        case 'stepDown':tone(392.00, 0.08, { type: 'sine', volume: 0.10 }); break;
        case 'fanfare':
          tone(523.25, 0.18, { type: 'triangle', volume: 0.13 });
          tone(659.25, 0.18, { type: 'triangle', volume: 0.13, delay: 0.15 });
          tone(783.99, 0.18, { type: 'triangle', volume: 0.13, delay: 0.30 });
          tone(1046.5, 0.40, { type: 'triangle', volume: 0.13, delay: 0.45 });
          break;
        default: break;
      }
    }
  };

  global.MAAudio = MAAudio;
})(typeof window !== 'undefined' ? window : globalThis);
