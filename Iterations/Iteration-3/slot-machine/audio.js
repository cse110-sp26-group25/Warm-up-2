/**
 * audio.js — Procedural Audio Engine
 *
 * All sound generated via Web Audio API — no external files needed.
 * Context created lazily on first user interaction (browser autoplay policy).
 *
 * Public API:
 *   setVolume(0–100)       master volume
 *   startBg() / stopBg()   ambient casino hum + distant chatter
 *   playReelSpin(durMs)    mechanical whirr + ticking
 *   playReelStop(colIdx)   thud + click per column
 *   playWin(tier)          tier-scaled fanfare: normal/big/mega/jackpot
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

  // ── Background ambient ──────────────────────────────────────────────────────
  function startBg() {
    const c = _c(); if (!c || _bgStarted) return;
    if (c.state === 'suspended') c.resume();
    _bgStarted = true;

    // Low mechanical hum
    const humG = c.createGain(); humG.gain.value = 0.04; humG.connect(_bgGain);
    [60, 120, 180].forEach(f => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(humG); o.start(); _bgNodes.push(o);
    });

    // Distant casino chatter (looped noise filtered to speech frequencies)
    const len = c.sampleRate * 5;
    const cb = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = cb.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const cs = c.createBufferSource(); cs.buffer = cb; cs.loop = true;
    const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 2200;
    const lpf = c.createBiquadFilter(); lpf.type = 'lowpass';  lpf.frequency.value = 4800;
    const cg  = c.createGain(); cg.gain.value = 0.011;
    cs.connect(hpf); hpf.connect(lpf); lpf.connect(cg); cg.connect(_bgGain);
    cs.start(); _bgNodes.push(cs);

    _scheduleBell();
  }

  function _scheduleBell() {
    const c = _c(); if (!c || !_bgStarted) return;
    const delay = 6 + Math.random() * 12;
    _bellTimer = setTimeout(() => {
      if (!_bgStarted) return;
      const t = c.currentTime + 0.05;
      const f = [523, 659, 784, 1047][Math.floor(Math.random() * 4)];
      _osc(f, t, 1.4, 'sine', 0.055, _bgGain);
      _scheduleBell();
    }, delay * 1000);
  }

  function stopBg() {
    clearTimeout(_bellTimer);
    _bgNodes.forEach(n => { try { n.stop(); } catch (_) {} });
    _bgNodes = []; _bgStarted = false;
  }

  // ── Reel spin / stop ────────────────────────────────────────────────────────
  function playReelSpin(duration = 2000) {
    const c = _c(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    const t   = c.currentTime;
    const dur = duration / 1000;

    // Descending bandpass sweep (whirr that slows down)
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bpf = c.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(900, t);
    bpf.frequency.exponentialRampToValueAtTime(180, t + dur * 0.88);
    bpf.Q.value = 2.5;
    const env = c.createGain();
    env.gain.setValueAtTime(0.20, t);
    env.gain.setValueAtTime(0.18, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bpf); bpf.connect(env); env.connect(_sfxGain);
    src.start(t); src.stop(t + dur);

    // Mechanical ticking
    const ticks = Math.floor(dur * 10);
    for (let i = 0; i < ticks; i++) {
      const tt = t + (i / ticks) * dur * 0.90;
      _osc(75 + Math.random() * 50, tt, 0.022, 'square', 0.065);
    }
  }

  function playReelStop(col = 0) {
    const c = _c(); if (!c) return;
    const t = c.currentTime;
    // Descending thud
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210 - col * 18, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.13);
    env.gain.setValueAtTime(0.32, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    osc.connect(env); env.connect(_sfxGain); osc.start(t); osc.stop(t + 0.22);
    // Click transient
    _noise(t, 0.038, 500 + col * 70, 0.8, 0.20);
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

  return Object.freeze({ setVolume, startBg, stopBg, playReelSpin, playReelStop, playWin, playCoin, playCombo });
})();
