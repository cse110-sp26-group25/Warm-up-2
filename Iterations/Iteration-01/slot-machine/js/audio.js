/**
 * audio.js — Procedural Audio Engine
 *
 * All audio is synthesised in real-time using the Web Audio API — no audio
 * files are required. This keeps the project self-contained and avoids
 * copyright issues.
 *
 * COMPONENTS
 * ──────────
 * • Background music: an 8-bit chiptune loop at CONFIG.MUSIC_BPM using a
 *   sawtooth/square oscillator melody over a bass line and percussion.
 * • SFX: spin whirr, reel-stop click, win chime, big-win fanfare, jackpot
 *   celebration, near-miss "thunk", and coin rain tinkle.
 *
 * The AudioContext is created lazily on first user interaction (required by
 * browser autoplay policy). Volume levels are read from CONFIG and can be
 * updated at runtime via setVolume().
 *
 * @module Audio
 */

const Audio = (() => {
  "use strict";

  // ── State ─────────────────────────────────────────────────────────────────
  let _ctx           = null;    // AudioContext (created on first interaction)
  let _masterGain    = null;    // Master output gain node
  let _musicGain     = null;    // Gain node for background music
  let _sfxGain       = null;    // Gain node for SFX
  let _musicRunning  = false;   // Whether the music loop is active
  let _musicEnabled  = true;    // User toggle
  let _spinSource    = null;    // Looping spin noise source (stopped on result)

  // Music sequencer state
  let _musicScheduler = null;   // setInterval handle
  let _nextBeatTime   = 0;      // Absolute AudioContext time of next beat
  let _beatIndex      = 0;      // Current position in MUSIC_PATTERN

  // ── Context Bootstrap ─────────────────────────────────────────────────────

  /**
   * Create (or resume) the AudioContext. Must be called from a user gesture
   * handler the first time.
   */
  function _ensureContext() {
    if (!_ctx) {
      _ctx        = new (window.AudioContext || window.webkitAudioContext)();
      _masterGain = _ctx.createGain();
      _musicGain  = _ctx.createGain();
      _sfxGain    = _ctx.createGain();

      _masterGain.gain.value = CONFIG.MASTER_VOLUME;
      _musicGain.gain.value  = CONFIG.MUSIC_VOLUME;
      _sfxGain.gain.value    = CONFIG.SFX_VOLUME;

      _musicGain.connect(_masterGain);
      _sfxGain.connect(_masterGain);
      _masterGain.connect(_ctx.destination);
    }
    if (_ctx.state === "suspended") _ctx.resume();
  }

  // ── Low-level oscillator helpers ───────────────────────────────────────────

  /**
   * Create a simple note that plays for `duration` seconds.
   * @param {number}  freq        - Frequency in Hz
   * @param {string}  type        - OscillatorType: "sine","square","sawtooth","triangle"
   * @param {number}  startTime   - AudioContext time to start
   * @param {number}  duration    - How long (seconds)
   * @param {number}  peakGain    - Peak amplitude (0–1)
   * @param {GainNode} output     - Destination gain node
   */
  function _playNote(freq, type, startTime, duration, peakGain, output) {
    const osc  = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type          = type;
    osc.frequency.value = freq;

    // Simple ADSR: fast attack, short decay, sustain, release
    gain.gain.setValueAtTime(0,         startTime);
    gain.gain.linearRampToValueAtTime(peakGain,  startTime + 0.01);
    gain.gain.linearRampToValueAtTime(peakGain * 0.7, startTime + duration * 0.3);
    gain.gain.linearRampToValueAtTime(0,         startTime + duration);

    osc.connect(gain);
    gain.connect(output);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  /**
   * White noise burst — used for percussion and "whirr" effect.
   */
  function _playNoise(startTime, duration, peakGain, output, lowpass = 8000) {
    const bufSize  = Math.ceil(_ctx.sampleRate * duration);
    const buffer   = _ctx.createBuffer(1, bufSize, _ctx.sampleRate);
    const data     = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const src    = _ctx.createBufferSource();
    const filter = _ctx.createBiquadFilter();
    const gain   = _ctx.createGain();

    src.buffer          = buffer;
    filter.type         = "lowpass";
    filter.frequency.value = lowpass;

    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    src.start(startTime);
  }

  // ── Background Music ───────────────────────────────────────────────────────

  /**
   * Schedule the next beat of the chiptune background loop.
   * Uses the "lookahead clock" pattern to avoid drift.
   */
  const LOOK_AHEAD      = 0.1;   // Schedule this many seconds ahead
  const SCHEDULE_PERIOD = 50;    // Check every 50ms

  function _scheduleMusicBeat() {
    const beatDuration = 60 / CONFIG.MUSIC_BPM;
    const notes        = CONFIG.MUSIC_NOTES;
    const pattern      = CONFIG.MUSIC_PATTERN;

    while (_nextBeatTime < _ctx.currentTime + LOOK_AHEAD) {
      const noteIdx  = pattern[_beatIndex % pattern.length];
      const freq     = notes[noteIdx];

      // ── Melody (sawtooth, upper octave) ─────────────────────────────────
      _playNote(freq * 2, "sawtooth", _nextBeatTime, beatDuration * 0.45, 0.18, _musicGain);

      // ── Bass line (square wave, sub-octave, every 2 beats) ──────────────
      if (_beatIndex % 2 === 0) {
        _playNote(freq * 0.5, "square", _nextBeatTime, beatDuration * 0.9, 0.22, _musicGain);
      }

      // ── Percussion (noise burst on beat 1 and 3 of each 4-beat bar) ─────
      const beatInBar = _beatIndex % 4;
      if (beatInBar === 0) {
        // Kick: low-pass noise + very low sine
        _playNoise(_nextBeatTime, 0.12, 0.55, _musicGain, 200);
        _playNote(60, "sine", _nextBeatTime, 0.12, 0.35, _musicGain);
      }
      if (beatInBar === 2) {
        // Snare: broadband noise burst
        _playNoise(_nextBeatTime, 0.08, 0.35, _musicGain, 6000);
      }
      // Hi-hat: every beat
      _playNoise(_nextBeatTime, 0.04, 0.12, _musicGain, 12000);

      // ── Arpeggio accent every 8 beats ────────────────────────────────────
      if (_beatIndex % 8 === 4) {
        const arpFreqs = [notes[4], notes[6], notes[8]];
        arpFreqs.forEach((f, i) => {
          _playNote(f * 2, "triangle", _nextBeatTime + i * (beatDuration / 3), beatDuration / 3, 0.12, _musicGain);
        });
      }

      _nextBeatTime += beatDuration;
      _beatIndex++;
    }
  }

  function startMusic() {
    if (!_musicEnabled || _musicRunning) return;
    _ensureContext();
    _musicRunning = true;
    _nextBeatTime = _ctx.currentTime + 0.05; // Small buffer before first beat
    _beatIndex    = 0;
    _musicScheduler = setInterval(_scheduleMusicBeat, SCHEDULE_PERIOD);
  }

  function stopMusic() {
    _musicRunning = false;
    clearInterval(_musicScheduler);
    _musicScheduler = null;
  }

  function toggleMusic() {
    _musicEnabled = !_musicEnabled;
    if (_musicEnabled) {
      startMusic();
    } else {
      stopMusic();
    }
    return _musicEnabled;
  }

  // ── Sound Effects ─────────────────────────────────────────────────────────

  /** Continuous spin whirr — a frequency-swept noise. Stopped by stopSpin(). */
  function playSpin() {
    _ensureContext();
    if (_spinSource) { try { _spinSource.stop(); } catch (_) {} }

    // Oscillator pitch that descends slightly, imitating mechanical spin-up
    const osc    = _ctx.createOscillator();
    const filter = _ctx.createBiquadFilter();
    const gain   = _ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(400, _ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, _ctx.currentTime + 2.5);

    filter.type            = "bandpass";
    filter.frequency.value = 300;
    filter.Q.value         = 1.5;

    gain.gain.setValueAtTime(0,    _ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, _ctx.currentTime + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(_sfxGain);
    osc.start();
    _spinSource = osc;
  }

  /** Stop the spin whirr gracefully. */
  function stopSpin() {
    if (!_spinSource || !_ctx) return;
    const gain = _ctx.createGain();
    gain.gain.setValueAtTime(0.25, _ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, _ctx.currentTime + 0.08);
    try { _spinSource.stop(_ctx.currentTime + 0.1); } catch (_) {}
    _spinSource = null;
  }

  /** Sharp "clunk" when a reel stops. */
  function playReelStop() {
    _ensureContext();
    _playNoise(_ctx.currentTime, 0.07, 0.5, _sfxGain, 400);
    _playNote(110, "sine", _ctx.currentTime, 0.07, 0.3, _sfxGain);
  }

  /** Ascending arpeggio for a regular win. */
  function playWin() {
    _ensureContext();
    const now    = _ctx.currentTime;
    const freqs  = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const step   = 0.1;
    freqs.forEach((f, i) => {
      _playNote(f, "square", now + i * step, 0.25, 0.35, _sfxGain);
    });
  }

  /** Bigger fanfare for high payouts. */
  function playBigWin() {
    _ensureContext();
    const now   = _ctx.currentTime;
    // Rising major arpeggio followed by a sustained chord
    const freqs = [261.63, 329.63, 392, 523.25, 659.25, 783.99];
    freqs.forEach((f, i) => {
      _playNote(f, "sawtooth", now + i * 0.08, 0.5 - i * 0.04, 0.4, _sfxGain);
    });
    // Sustain chord
    [523.25, 659.25, 783.99].forEach(f => {
      _playNote(f, "triangle", now + 0.6, 0.8, 0.25, _sfxGain);
    });
  }

  /** Full jackpot celebration — long, triumphant. */
  function playJackpot() {
    _ensureContext();
    const now = _ctx.currentTime;

    // Dramatic ascending run
    const runFreqs = [261.63, 293.66, 329.63, 392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    runFreqs.forEach((f, i) => {
      _playNote(f, "sawtooth", now + i * 0.07, 0.35, 0.45, _sfxGain);
    });

    // Grand chord
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      _playNote(f, "square", now + 0.8, 1.8, 0.3 - i * 0.04, _sfxGain);
    });

    // Noise bursts as "percussion hits"
    [0.8, 1.0, 1.2].forEach(t => _playNoise(now + t, 0.08, 0.5, _sfxGain, 5000));

    // Twinkling high notes
    for (let i = 0; i < 10; i++) {
      const delay = 1.0 + i * 0.15 + Math.random() * 0.1;
      const f     = 1046.5 * (1 + Math.random() * 0.5);
      _playNote(f, "triangle", now + delay, 0.1, 0.15, _sfxGain);
    }
  }

  /** "Thud" sound for a near-miss (feels like almost-win). */
  function playNearMiss() {
    _ensureContext();
    const now = _ctx.currentTime;
    _playNote(440, "square",  now,        0.12, 0.4, _sfxGain);
    _playNote(220, "triangle", now + 0.08, 0.2, 0.3, _sfxGain);
  }

  /** Small coin-tinkle for minor wins. */
  function playCoin() {
    _ensureContext();
    const now = _ctx.currentTime;
    const f   = 1400 + Math.random() * 600;
    _playNote(f, "triangle", now, 0.12, 0.25, _sfxGain);
  }

  /** Subtle "button press" click. */
  function playClick() {
    _ensureContext();
    _playNoise(_ctx.currentTime, 0.025, 0.3, _sfxGain, 2000);
  }

  /** Achievement unlock chime. */
  function playAchievement() {
    _ensureContext();
    const now   = _ctx.currentTime;
    const notes = [783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      _playNote(f, "triangle", now + i * 0.12, 0.3, 0.35, _sfxGain);
    });
  }

  // ── Volume Control ─────────────────────────────────────────────────────────

  /**
   * Set master volume. vol is a 0–1 float.
   */
  function setMasterVolume(vol) {
    if (!_masterGain) return;
    const clamped = Math.max(0, Math.min(1, vol));
    _masterGain.gain.linearRampToValueAtTime(clamped, _ctx.currentTime + 0.05);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  /**
   * Call from main.js on first user interaction to unlock the AudioContext.
   */
  function init() {
    // AudioContext creation deferred to first interaction; start music now.
    _ensureContext();
    startMusic();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return Object.freeze({
    init,
    startMusic,
    stopMusic,
    toggleMusic,
    playSpin,
    stopSpin,
    playReelStop,
    playWin,
    playBigWin,
    playJackpot,
    playNearMiss,
    playCoin,
    playClick,
    playAchievement,
    setMasterVolume,
  });

})();
