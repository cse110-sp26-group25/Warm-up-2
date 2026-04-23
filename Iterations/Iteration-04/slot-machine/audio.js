/**
 * audio.js — Procedural Audio Engine
 *
 * All sound generated via Web Audio API — no external files needed.
 * Context created lazily on first user interaction (browser autoplay policy).
 *
 * Public API:
 *   setVolume(0–100)       master volume
 *   startBg() / stopBg()   ambient casino music + chatter
 *   playReelSpin(durMs)    mechanical ratcheting reel mechanism
 *   playReelStop(colIdx)   thud + click per column
 *   playWin(tier)          tier-scaled fanfare: normal/big/mega/jackpot
 *   playNoWin()            distinct descending cue for a losing spin
 *   playCoin()             metallic tink for particle rain
 *   playCombo(streak)      rising tone per consecutive-win step
 */
const Audio = (() => {
  'use strict';

  let _ctx        = null;
  let _masterGain = null;
  let _bgGain     = null;
  let _sfxGain    = null;
  let _volume     = 0.70;
  let _bgStarted  = false;
  let _bgNodes    = [];
  let _bellTimer  = null;
  let _bgMusicTimer = null;

  // ── Context bootstrap (lazy) ────────────────────────────────────────────────
  function _c() {
    if (_ctx) return _ctx;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _masterGain = _ctx.createGain();
      _masterGain.gain.value = _volume;
      _masterGain.connect(_ctx.destination);

      _bgGain = _ctx.createGain();
      _bgGain.gain.value = 0.13;
      _bgGain.connect(_masterGain);

      _sfxGain = _ctx.createGain();
      _sfxGain.gain.value = 0.90;
      _sfxGain.connect(_masterGain);
    } catch (_) { _ctx = null; }
    return _ctx;
  }

  // ── Volume ──────────────────────────────────────────────────────────────────
  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v / 100));
    if (_masterGain) _masterGain.gain.setTargetAtTime(_volume, _c().currentTime, 0.05);
  }

  // ── Primitive: oscillator tone with ADSR ───────────────────────────────────
  function _osc(freq, t0, dur, type = 'sine', peak = 0.28, dst = null) {
    const c = _c(); if (!c) return;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.015, dur * 0.1));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(dst ?? _sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // ── Primitive: band-pass noise burst ───────────────────────────────────────
  function _noise(t0, dur, cf = 600, q = 1, peak = 0.12, dst = null) {
    const c = _c(); if (!c) return;
    const len = Math.max(1, Math.ceil(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bpf = c.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = cf; bpf.Q.value = q;
    const env = c.createGain();
    env.gain.setValueAtTime(peak, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bpf); bpf.connect(env); env.connect(dst ?? _sfxGain);
    src.start(t0); src.stop(t0 + dur);
  }

  // ── Background ambient + looping casino music ───────────────────────────────
  function startBg() {
    const c = _c(); if (!c || _bgStarted) return;
    if (c.state === 'suspended') c.resume();
    _bgStarted = true;

    // Distant casino chatter (looped noise filtered to mid frequencies)
    const len = c.sampleRate * 5;
    const cb = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = cb.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const cs = c.createBufferSource(); cs.buffer = cb; cs.loop = true;
    const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 1800;
    const lpf = c.createBiquadFilter(); lpf.type = 'lowpass';  lpf.frequency.value = 4200;
    const cg  = c.createGain(); cg.gain.value = 0.008;
    cs.connect(hpf); hpf.connect(lpf); lpf.connect(cg); cg.connect(_bgGain);
    cs.start(); _bgNodes.push(cs);

    // Gentle bass pad — warm, casino lounge feel
    const bassG = c.createGain(); bassG.gain.value = 0.03; bassG.connect(_bgGain);
    [65, 130].forEach(f => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(bassG); o.start(); _bgNodes.push(o);
    });

    _scheduleBell();
    _scheduleMusicBar(c.currentTime + 0.5);
  }

  // Repeating pentatonic melody — E minor pentatonic: E4, G4, A4, B4, D5, E5
  function _scheduleMusicBar(startTime) {
    const c = _c(); if (!c || !_bgStarted) return;
    const E4 = 329.6, G4 = 392.0, A4 = 440.0, B4 = 493.9, D5 = 587.3;
    // Casino ragtime-ish repeating phrase (8 eighth notes per bar)
    const notes = [E4, G4, A4, G4, B4, A4, G4, E4];
    const beatDur = 0.28;

    notes.forEach((freq, i) => {
      _osc(freq,     startTime + i * beatDur, beatDur * 0.65, 'triangle', 0.018, _bgGain);
      // Bass note every other beat (root tone)
      if (i % 2 === 0) {
        _osc(freq / 2, startTime + i * beatDur, beatDur * 0.9, 'sine', 0.012, _bgGain);
      }
    });

    const barDur = notes.length * beatDur;
    _bgMusicTimer = setTimeout(() => {
      if (_bgStarted) _scheduleMusicBar(c.currentTime + 0.05);
    }, (barDur - 0.1) * 1000);
  }

  function _scheduleBell() {
    const c = _c(); if (!c || !_bgStarted) return;
    const delay = 6 + Math.random() * 12;
    _bellTimer = setTimeout(() => {
      if (!_bgStarted) return;
      const t = c.currentTime + 0.05;
      const f = [523, 659, 784, 1047][Math.floor(Math.random() * 4)];
      _osc(f, t, 1.4, 'sine', 0.045, _bgGain);
      _scheduleBell();
    }, delay * 1000);
  }

  function stopBg() {
    clearTimeout(_bellTimer);
    clearTimeout(_bgMusicTimer);
    _bgNodes.forEach(n => { try { n.stop(); } catch (_) {} });
    _bgNodes = []; _bgStarted = false;
  }

  // ── Reel spin / stop ────────────────────────────────────────────────────────
  function playReelSpin(duration = 2000) {
    const c = _c(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    const t   = c.currentTime;
    const dur = duration / 1000;

    // Motor whirr underneath — descending as reels decelerate
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bpf = c.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(700, t);
    bpf.frequency.exponentialRampToValueAtTime(200, t + dur * 0.85);
    bpf.Q.value = 3.0;
    const env = c.createGain();
    env.gain.setValueAtTime(0.14, t);
    env.gain.setValueAtTime(0.12, t + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bpf); bpf.connect(env); env.connect(_sfxGain);
    src.start(t); src.stop(t + dur);

    // Traditional ratcheting clicks — exponential spacing (fast → slow)
    // simulates the physical pawl catching each reel notch as it decelerates
    const clickCount = 30;
    for (let i = 0; i < clickCount; i++) {
      // Progress 0→1 with quadratic ease-out so clicks cluster at start
      const progress = i / (clickCount - 1);
      const tt = t + dur * (1 - Math.pow(1 - progress, 2.2)) * 0.91;
      // Sharp bandpass click — like a metal pawl hitting a notch
      _noise(tt, 0.013, 1200 + Math.random() * 600, 5, 0.22);
      // Low thump component for mechanical weight
      _osc(80 + Math.random() * 40, tt, 0.010, 'square', 0.07);
    }
  }

  function playReelStop(col = 0) {
    const c = _c(); if (!c) return;
    const t = c.currentTime;
    // Heavy mechanical thud — lower pitch on later reels
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200 - col * 20, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    env.gain.setValueAtTime(0.38, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(env); env.connect(_sfxGain); osc.start(t); osc.stop(t + 0.25);
    // Sharp spring-catch click
    _noise(t, 0.030, 1800 + col * 80, 6, 0.28);
    // Secondary resonance knock
    _noise(t + 0.015, 0.020, 400 + col * 50, 2, 0.10);
  }

  // ── Win fanfares ────────────────────────────────────────────────────────────
  function playWin(tier = 'normal') {
    const c = _c(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime + 0.04;
    if      (tier === 'jackpot') _jackpot(t);
    else if (tier === 'mega')    _mega(t);
    else if (tier === 'big')     _big(t);
    else                         _normal(t);
  }

  function _normal(t) {
    _osc(523, t,        0.35, 'sine', 0.28);
    _osc(659, t + 0.12, 0.35, 'sine', 0.28);
    _osc(784, t + 0.24, 0.50, 'sine', 0.32);
  }

  function _big(t) {
    _osc(262,  t,        0.70, 'sine', 0.12);
    _osc(523,  t,        0.35, 'sine', 0.30);
    _osc(659,  t + 0.10, 0.35, 'sine', 0.30);
    _osc(784,  t + 0.20, 0.35, 'sine', 0.30);
    _osc(1047, t + 0.30, 0.45, 'sine', 0.34);
    _osc(1319, t + 0.42, 0.65, 'sine', 0.38);
  }

  function _mega(t) {
    [523, 587, 659, 698, 784, 880, 988, 1047].forEach((f, i) =>
      _osc(f, t + i * 0.07, 0.40, 'sine', 0.28));
    [523, 659, 784, 1047].forEach(f => _osc(f, t + 0.72, 1.30, 'sine', 0.18));
  }

  function _jackpot(t) {
    _mega(t);
    for (let i = 0; i < 24; i++)
      _osc(i % 2 === 0 ? 1319 : 1047, t + 1.1 + i * 0.055, 0.12, 'sine', 0.20);
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      _osc(f, t + 2.55, 2.2, 'sine', 0.14 - i * 0.02));
  }

  // ── No-win cue ──────────────────────────────────────────────────────────────
  // Distinct descending "wah-wah" tone so the player has clear audio feedback
  // that the spin resolved with no payout.
  function playNoWin() {
    const c = _c(); if (!c) return;
    const t = c.currentTime + 0.08;

    // Descending trombone-style slide
    const osc1 = c.createOscillator();
    const filt = c.createBiquadFilter();
    const env1 = c.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(320, t);
    osc1.frequency.linearRampToValueAtTime(160, t + 0.75);
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(500, t);
    filt.frequency.linearRampToValueAtTime(180, t + 0.75);
    filt.Q.value = 2.5;
    env1.gain.setValueAtTime(0, t);
    env1.gain.linearRampToValueAtTime(0.18, t + 0.04);
    env1.gain.setValueAtTime(0.18, t + 0.35);
    env1.gain.linearRampToValueAtTime(0, t + 0.80);
    osc1.connect(filt); filt.connect(env1); env1.connect(_sfxGain);
    osc1.start(t); osc1.stop(t + 0.85);

    // Second shorter drop note
    _osc(180, t + 0.45, 0.40, 'sawtooth', 0.10);
    // Brief noise burst for texture
    _noise(t + 0.02, 0.08, 300, 1.5, 0.06);
  }

  // ── Coin tink ───────────────────────────────────────────────────────────────
  function playCoin() {
    const c = _c(); if (!c) return;
    const t = c.currentTime;
    const f = 720 + Math.random() * 480;
    _osc(f,       t,    0.25, 'sine',     0.12);
    _osc(f * 1.5, t,    0.10, 'triangle', 0.06);
    _noise(t, 0.018, 2200, 2, 0.07);
  }

  // ── Combo rising tone ───────────────────────────────────────────────────────
  function playCombo(streak = 1) {
    const c = _c(); if (!c) return;
    const t    = c.currentTime;
    const base = 440 * Math.pow(1.12, Math.min(streak - 1, 8));
    _osc(base,        t,        0.18, 'sine', 0.28);
    _osc(base * 1.25, t + 0.06, 0.18, 'sine', 0.22);
    _osc(base * 1.5,  t + 0.12, 0.28, 'sine', 0.18);
  }

  return Object.freeze({ setVolume, startBg, stopBg, playReelSpin, playReelStop, playWin, playNoWin, playCoin, playCombo });
})();
