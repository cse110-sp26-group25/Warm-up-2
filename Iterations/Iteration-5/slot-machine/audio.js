/**
 * audio.js — Procedural sound effects via Web Audio API.
 *
 * All sounds are synthesized — no audio files required.
 * Each reel gets its own clicking pattern that decelerates as it stops.
 */

'use strict';

const Audio = (() => {
  let ctx = null;
  let muted = false;

  // Per-reel state for the clicking loop
  const reelClickers = [null, null, null];

  /* ---- Init / teardown ----------------------------------- */

  function _ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setMuted(val) {
    muted = val;
    if (muted) _stopAllReels();
  }

  /* ---- Primitive sound builders -------------------------- */

  /**
   * Mechanical click: a very short burst of filtered noise — sounds like a
   * ratchet tooth snapping over a peg.
   * @param {number} time  — AudioContext time to schedule
   * @param {number} gain  — volume (0-1)
   * @param {number} freq  — filter frequency (higher = sharper click)
   */
  function _click(time, gain = 0.35, freq = 1800) {
    const c = _ensureCtx();

    // White noise source
    const bufSize = c.sampleRate * 0.04; // 40 ms buffer
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const src = c.createBufferSource();
    src.buffer = buf;

    // Band-pass so it sounds like a click, not hiss
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 3.5;

    // Quick envelope
    const env = c.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

    src.connect(bp);
    bp.connect(env);
    env.connect(c.destination);
    src.start(time);
    src.stop(time + 0.04);
  }

  /**
   * Heavy thud: reel stopping sound — low, percussive.
   */
  function _thud(time, gain = 0.5) {
    const c = _ensureCtx();

    // Sine burst pitched low
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.12);

    const env = c.createGain();
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(env);
    env.connect(c.destination);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  /**
   * Single coin clink.
   */
  function _coin(time, pitch = 1.0, gain = 0.3) {
    const c = _ensureCtx();

    const osc1 = c.createOscillator();
    const osc2 = c.createOscillator();
    osc1.type = 'triangle';
    osc2.type = 'triangle';
    osc1.frequency.value = 2200 * pitch;
    osc2.frequency.value = 3100 * pitch;

    const env = c.createGain();
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc1.connect(env); osc2.connect(env);
    env.connect(c.destination);
    osc1.start(time); osc2.start(time);
    osc1.stop(time + 0.26); osc2.stop(time + 0.26);
  }

  /**
   * Rising tone sweep — used for big win fanfare.
   */
  function _riseTone(startTime, durationSec, startFreq, endFreq, gain = 0.25) {
    const c = _ensureCtx();
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + durationSec);

    const env = c.createGain();
    env.gain.setValueAtTime(gain, startTime);
    env.gain.setValueAtTime(gain, startTime + durationSec - 0.05);
    env.gain.linearRampToValueAtTime(0, startTime + durationSec);

    // Lowpass to tame the square wave
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;

    osc.connect(lp); lp.connect(env); env.connect(c.destination);
    osc.start(startTime); osc.stop(startTime + durationSec + 0.05);
  }

  /* ---- Reel spin loops ----------------------------------- */

  /**
   * Start a mechanical clicking loop for one reel.
   * @param {number} reelIndex  0-2
   * @param {number} intervalMs initial click interval (smaller = faster)
   */
  function startReelSpin(reelIndex, intervalMs = 80) {
    if (muted) return;
    _ensureCtx();

    const state = {
      interval: intervalMs,
      active: true,
      timer: null,
    };
    reelClickers[reelIndex] = state;

    function scheduleClick() {
      if (!state.active) return;
      const t = ctx.currentTime;
      // Alternate filter freq to simulate high/low ratchet teeth
      const isHigh = Math.random() > 0.4;
      _click(t, 0.28, isHigh ? 2000 : 1200);

      state.timer = setTimeout(scheduleClick, state.interval + (Math.random() * 12 - 6));
    }

    scheduleClick();
  }

  /**
   * Decelerate a reel's clicking and then stop it with a thud.
   * @param {number} reelIndex
   * @param {number} decelMs   how long to decelerate (ms)
   * @returns {Promise}        resolves when the thud fires
   */
  function stopReelSpin(reelIndex, decelMs = 600) {
    if (muted) {
      const s = reelClickers[reelIndex];
      if (s) { s.active = false; clearTimeout(s.timer); reelClickers[reelIndex] = null; }
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const s = reelClickers[reelIndex];
      if (!s) { resolve(); return; }

      const startInterval = s.interval;
      const endInterval   = 260; // slow clicks just before stopping
      const steps         = 10;
      let   step          = 0;

      clearTimeout(s.timer);

      function decelStep() {
        if (!s.active || step >= steps) {
          s.active = false;
          reelClickers[reelIndex] = null;
          // Final thud
          if (!muted && ctx) _thud(ctx.currentTime, 0.5);
          setTimeout(resolve, 180);
          return;
        }
        const progress = step / steps;
        s.interval = startInterval + (endInterval - startInterval) * progress;

        const t = ctx.currentTime;
        _click(t, 0.3 - progress * 0.1, 1400 - progress * 400);

        step++;
        s.timer = setTimeout(decelStep, s.interval);
      }

      s.timer = setTimeout(decelStep, startInterval);
    });
  }

  function _stopAllReels() {
    for (let i = 0; i < reelClickers.length; i++) {
      const s = reelClickers[i];
      if (s) { s.active = false; clearTimeout(s.timer); reelClickers[i] = null; }
    }
  }

  /* ---- Outcome sounds ------------------------------------ */

  function playLoss() {
    if (muted) return;
    const c = _ensureCtx();
    const t = c.currentTime + 0.05;

    // Two descending short tones
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.linearRampToValueAtTime(180, t + 0.18);

    const env = c.createGain();
    env.gain.setValueAtTime(0.18, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(env); env.connect(c.destination);
    osc.start(t); osc.stop(t + 0.25);
  }

  function playSmallWin(amount) {
    if (muted) return;
    const c = _ensureCtx();
    const coins = Math.min(Math.ceil(amount / 10), 5);
    for (let i = 0; i < coins; i++) {
      _coin(c.currentTime + i * 0.12, 0.9 + i * 0.05, 0.28);
    }
  }

  function playBigWin() {
    if (muted) return;
    const c = _ensureCtx();
    const t = c.currentTime;
    // Quick ascending chord
    [1.0, 1.25, 1.5, 2.0].forEach((ratio, i) => {
      _coin(t + i * 0.08, ratio, 0.28);
    });
    _riseTone(t + 0.4, 0.6, 400, 1200, 0.18);
  }

  function playMegaWin() {
    if (muted) return;
    const c = _ensureCtx();
    const t = c.currentTime;
    for (let i = 0; i < 8; i++) _coin(t + i * 0.07, 0.8 + i * 0.08, 0.25);
    _riseTone(t + 0.5, 0.8, 300, 1400, 0.2);
    _riseTone(t + 1.3, 0.5, 600, 1800, 0.15);
  }

  function playJackpot() {
    if (muted) return;
    const c = _ensureCtx();
    const t = c.currentTime;
    // Long coin shower + fanfare
    for (let i = 0; i < 16; i++) {
      _coin(t + i * 0.06, 0.7 + (i % 4) * 0.12, 0.22);
    }
    _riseTone(t + 0.2, 1.0, 200, 800,  0.2);
    _riseTone(t + 1.2, 1.0, 400, 1600, 0.18);
    _riseTone(t + 2.2, 0.7, 800, 2000, 0.15);
  }

  function playButtonClick() {
    if (muted) return;
    const c = _ensureCtx();
    _click(c.currentTime, 0.2, 1000);
  }

  function playNearMiss() {
    if (muted) return;
    const c = _ensureCtx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.linearRampToValueAtTime(240, t + 0.2);
    const env = c.createGain();
    env.gain.setValueAtTime(0.12, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(env); env.connect(c.destination);
    osc.start(t); osc.stop(t + 0.27);
  }

  /* ---- Public API ---------------------------------------- */
  return {
    setMuted,
    startReelSpin,
    stopReelSpin,
    playLoss,
    playSmallWin,
    playBigWin,
    playMegaWin,
    playJackpot,
    playButtonClick,
    playNearMiss,
  };
})();
