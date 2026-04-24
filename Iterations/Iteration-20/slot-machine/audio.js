/**
 * audio.js — Web Audio engine, fully procedural (no external assets).
 *
 * All sounds are synthesised on demand via oscillators and filtered noise,
 * routed through three cascaded GainNodes:
 *
 *   [sfx GainNode]  ─┐
 *                    ├─► [master GainNode] ─► destination
 *   [music GainNode] ┘
 *
 * UI volume sliders are wired directly to `master.gain` and `music.gain`
 * via `setTargetAtTime` for smooth, click-free level changes in real time.
 * Mute toggles bypass scheduling entirely so there is no audible zipper.
 *
 * The AudioContext is created lazily and must be unlocked via a user
 * gesture (browser policy) — `Audio.unlock()` is called on first click.
 *
 * Iteration 21 — tension ramp added. `playTensionRamp(ms)` slides a
 * sawtooth oscillator from 220 Hz to 880 Hz over the supplied duration
 * with a short attack/release envelope so the ramp doesn't click on
 * start or end. Used by ui.js during the tease-state extended spin
 * when `symbols[0] === symbols[1]` is detected pre-animation.
 *
 * Iteration 16 retained — 50 ms lead-in in `_playDenied()` for mobile
 * audio warmup; Iteration 14 retained — `playDenied()` mechanical buzz.
 */
const Audio = (() => {

  /** @type {Object} All tunable constants for synthesis + routing. */
  const CONFIG = Object.freeze({
    DEFAULT_MASTER:   0.70,    // 0–1 base gain
    DEFAULT_SFX:      1.00,
    DEFAULT_MUSIC:    0.40,
    VOLUME_RAMP_SEC:  0.03,    // setTargetAtTime time constant
    MUSIC_BPM_INT_MS: 200,     // inter-note delay for background loop
    MUSIC_BASS_EVERY: 4,       // bass pulse cadence (every N notes)
    NOISE_FILTER_HZ:  800,
    NOISE_FILTER_Q:   0.5,
  });

  /** @type {AudioContext|null} */
  let _ctx = null;
  /** @type {GainNode|null} */
  let _masterGain = null;
  /** @type {GainNode|null} */
  let _musicGain  = null;
  /** @type {GainNode|null} */
  let _sfxGain    = null;

  /** @type {boolean} */
  let _sfxEnabled   = true;
  /** @type {boolean} */
  let _musicEnabled = false;
  /** @type {boolean} */
  let _musicRunning = false;

  /** @type {number|null} Handle for the scheduled background-music loop. */
  let _bgLoopTimeout = null;

  /** @type {number} User-facing slider value for master (0-100). */
  let _masterPct = CONFIG.DEFAULT_MASTER * 100;
  /** @type {number} User-facing slider value for music (0-100). */
  let _musicPct  = CONFIG.DEFAULT_MUSIC  * 100;

  /**
   * Lazily create (and resume) the AudioContext + gain graph.
   * @returns {AudioContext} The live context.
   */
  function _getCtx() {
    if (!_ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      _ctx = new Ctor();

      _masterGain = _ctx.createGain();
      _sfxGain    = _ctx.createGain();
      _musicGain  = _ctx.createGain();

      _masterGain.gain.value = CONFIG.DEFAULT_MASTER;
      _sfxGain.gain.value    = CONFIG.DEFAULT_SFX;
      _musicGain.gain.value  = CONFIG.DEFAULT_MUSIC;

      _sfxGain.connect(_masterGain);
      _musicGain.connect(_masterGain);
      _masterGain.connect(_ctx.destination);
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  /**
   * Ramp a gain parameter smoothly toward a target — no click artefacts.
   * @param {AudioParam} param  - The gain AudioParam to ramp.
   * @param {number}     target - Target gain (0–1).
   * @returns {void}
   */
  function _rampGain(param, target) {
    const ctx = _getCtx();
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(target, now, CONFIG.VOLUME_RAMP_SEC);
  }

  /**
   * Emit a tone into a specific destination node.
   * @param {number}     freq       - Frequency in Hz.
   * @param {OscillatorType} type   - Oscillator waveform.
   * @param {number}     duration   - Lifetime in seconds.
   * @param {number}     vol        - Peak gain (0–1).
   * @param {AudioNode}  dest       - Output node.
   * @param {number}     [startDelay] - Seconds from `currentTime`.
   * @returns {void}
   */
  function _tone(freq, type, duration, vol, dest, startDelay = 0) {
    const ctx  = _getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
    gain.gain.setValueAtTime(vol,   ctx.currentTime + startDelay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
    osc.connect(gain); gain.connect(dest);
    osc.start(ctx.currentTime + startDelay);
    osc.stop (ctx.currentTime + startDelay + duration);
  }

  /**
   * Emit a band-passed noise burst (for reel texture).
   * @param {number}    duration - Seconds.
   * @param {number}    vol      - Sample amplitude (0–1).
   * @param {AudioNode} dest     - Output node.
   * @returns {void}
   */
  function _noise(duration, vol, dest) {
    const ctx = _getCtx();
    const bufSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * vol;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = CONFIG.NOISE_FILTER_HZ;
    filter.Q.value         = CONFIG.NOISE_FILTER_Q;
    src.connect(filter); filter.connect(dest);
    src.start(); src.stop(ctx.currentTime + duration);
  }

  // ── SFX library ───────────────────────────────────────────────────

  /** Mechanical descending ratchet. @returns {void} */
  function _playSpin() {
    if (!_sfxEnabled) return;
    for (let i = 0; i < 8; i++) {
      _tone(300 - i * 20, 'sawtooth', 0.08, 0.15, _sfxGain, i * 0.06);
    }
    _noise(0.5, 0.05, _sfxGain);
  }

  /** Short thunk when a reel lands. @param {number} reelIndex @returns {void} */
  function _playReelStop(reelIndex) {
    if (!_sfxEnabled) return;
    const freqs = [220, 247, 277, 311, 330];
    _tone(freqs[reelIndex] || 220, 'square', 0.12, 0.2, _sfxGain);
    _noise(0.06, 0.1, _sfxGain);
  }

  /** Three-note ascending arpeggio. @returns {void} */
  function _playSmallWin() {
    if (!_sfxEnabled) return;
    [523, 659, 784].forEach((f, i) => _tone(f, 'triangle', 0.18, 0.3, _sfxGain, i * 0.1));
  }

  /** Five-note fanfare + chord. @returns {void} */
  function _playBigWin() {
    if (!_sfxEnabled) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => _tone(f, 'triangle', 0.3, 0.4, _sfxGain, i * 0.1));
    [523, 659, 784, 1047].forEach(f => _tone(f, 'sine', 0.8, 0.3, _sfxGain, 0.6));
  }

  /** Eight-note rising scale with octave harmony. @returns {void} */
  function _playJackpot() {
    if (!_sfxEnabled) return;
    const scale = [523, 587, 659, 698, 784, 880, 988, 1047];
    scale.forEach((f, i) => {
      _tone(f,     'triangle', 0.4, 0.5, _sfxGain, i * 0.08);
      _tone(f * 2, 'sine',     0.3, 0.2, _sfxGain, i * 0.08 + 0.04);
    });
  }

  /** Two-note descending "sad trombone". @returns {void} */
  function _playLoss() {
    if (!_sfxEnabled) return;
    _tone(200, 'sawtooth', 0.25, 0.15, _sfxGain);
    _tone(150, 'sawtooth', 0.25, 0.15, _sfxGain, 0.15);
  }

  /** Two-note "so close" chime. @returns {void} */
  function _playNearMiss() {
    if (!_sfxEnabled) return;
    _tone(880, 'sine', 0.12, 0.2, _sfxGain);
    _tone(660, 'sine', 0.12, 0.2, _sfxGain, 0.1);
  }

  /** Soft UI click. @returns {void} */
  function _playClick() {
    if (!_sfxEnabled) return;
    _tone(440, 'square', 0.04, 0.1, _sfxGain);
  }

  /** Three-note achievement chime. @returns {void} */
  function _playAchievement() {
    if (!_sfxEnabled) return;
    [784, 988, 1319].forEach((f, i) => _tone(f, 'sine', 0.3, 0.4, _sfxGain, i * 0.12));
  }

  /** Rising welcome-back sting for returning players. @returns {void} */
  function _playWelcome() {
    if (!_sfxEnabled) return;
    [440, 554, 659, 880].forEach((f, i) => _tone(f, 'triangle', 0.3, 0.25, _sfxGain, i * 0.09));
  }

  /**
   * Mechanical "denied" buzz — harsh square-wave pulse with a
   * low-frequency noise thud. Used when a spin is rejected (e.g. for
   * insufficient balance). Distinct from the loss sting so players
   * can tell "you lost" from "the machine refused you".
   *
   * The 50 ms silent lead-in (`LEAD = 0.05`) schedules all samples after
   * the AudioContext finishes resuming. On mobile Safari and Chrome the
   * context takes one event-loop tick to wake from 'suspended'; without
   * the lead-in, the very first buffer frame is often dropped entirely,
   * resulting in a noticeably clipped or silent effect.
   * @returns {void}
   */
  function _playDenied() {
    if (!_sfxEnabled) return;
    const ctx  = _getCtx();
    const LEAD = 0.05; // 50 ms silent lead-in — ensures context wake before first sample
    // Two harsh descending square pulses, offset by the lead-in.
    _tone(180, 'square', 0.12, 0.25, _sfxGain, LEAD);
    _tone(140, 'square', 0.14, 0.25, _sfxGain, LEAD + 0.12);
    // Noise burst also starts after the lead-in so the whole effect coheres.
    const bufSize = Math.floor(ctx.sampleRate * 0.18);
    const buf  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
    const src    = ctx.createBufferSource();
    src.buffer   = buf;
    const filter = ctx.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = CONFIG.NOISE_FILTER_HZ;
    filter.Q.value         = CONFIG.NOISE_FILTER_Q;
    src.connect(filter); filter.connect(_sfxGain);
    src.start(ctx.currentTime + LEAD);
    src.stop(ctx.currentTime  + LEAD + 0.18);
  }

  /**
   * Iteration 21 — procedural tension ramp for the tease-state spin.
   *
   * Slides an oscillator linearly from 220 Hz to 880 Hz over the
   * supplied duration, with an envelope that fades in over the first
   * 200 ms and fades out over the last 200 ms so the ramp doesn't
   * click on start/end. The waveform is `sawtooth` — the harmonically
   * rich overtones sell the "something's about to happen" vibe much
   * better than a pure sine or square.
   *
   * The ramp is purely additive to whatever else is playing (reel
   * ratchet noise, etc.) — it goes through the sfx gain stage so
   * volume slider + mute still work on it.
   *
   * @param {number} durationMs - How long to hold the ramp (ms).
   *   Typical value: max of the tease extras, i.e. 2000ms for a
   *   full reels 3/4/5 tease.
   * @returns {void}
   */
  function _playTensionRamp(durationMs) {
    if (!_sfxEnabled) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;
    const dur = Math.max(0.1, durationMs / 1000);  // clamp to 100ms+
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sawtooth';
    // Linear ramp 220Hz → 880Hz over the full duration.
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(880, now + dur);
    // Envelope: 200ms attack, flat middle at 0.12, 200ms release.
    const attack  = Math.min(0.2, dur * 0.15);
    const release = Math.min(0.2, dur * 0.15);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.12, now + attack);
    g.gain.setValueAtTime(0.12, now + dur - release);
    g.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(g);
    g.connect(_sfxGain);
    osc.start(now);
    osc.stop(now + dur);
  }

  /**
   * Iteration 21 (revised) — fade the background music gain toward
   * silence over the supplied duration, then restore it.
   *
   * Used to dim the music during the tease-state window so the
   * tension-ramp sawtooth lives in the sonic foreground. When the
   * reels finish and the win-sting fires, the music should have
   * already been quietly re-approaching its original level.
   *
   * Implementation:
   *   1. Capture the current target music gain (CONFIG.DEFAULT_MUSIC
   *      if music is enabled, 0 otherwise) — this is the level we'll
   *      restore to at the end of the fade.
   *   2. Schedule a linearRamp from current gain → 0.0001 over the
   *      first 60% of `durationMs`.
   *   3. Hold at 0.0001 for the middle 20% (the dramatic pause).
   *   4. Schedule a linearRamp back to the original level over the
   *      last 20% — so by the time the final reel lands, music is
   *      back at full volume, synchronised with the win-sting.
   *
   * If music is disabled or the context isn't available, this is a
   * no-op — `_musicGain` won't exist until the first unlock() call.
   *
   * Safe to call during an existing fade: setValueAtTime at `now`
   * re-anchors the schedule to the current realised value, cancelling
   * any in-flight ramp implicitly.
   *
   * @param {number} durationMs - Total fade-out-and-back duration (ms).
   * @returns {void}
   */
  function _fadeOutMusic(durationMs) {
    if (!_musicGain) return;
    const ctx = _getCtx();
    const now = ctx.currentTime;
    const dur = Math.max(0.2, durationMs / 1000);
    const targetGain = _musicEnabled ? CONFIG.DEFAULT_MUSIC : 0;
    // Anchor to current realised value (cancels any in-flight ramp).
    const currentValue = _musicGain.gain.value || targetGain;
    _musicGain.gain.cancelScheduledValues(now);
    _musicGain.gain.setValueAtTime(currentValue, now);
    // Phase 1: ramp down over 60% of duration.
    const dipEnd    = now + dur * 0.60;
    const holdEnd   = now + dur * 0.80;
    const restoreEnd = now + dur;
    // linearRampToValueAtTime(0) is safe here; exponentialRamp requires > 0.
    _musicGain.gain.linearRampToValueAtTime(0.0001, dipEnd);
    // Phase 2: hold near-silence for the dramatic pause.
    _musicGain.gain.setValueAtTime(0.0001, holdEnd);
    // Phase 3: ramp back to the original level.
    _musicGain.gain.linearRampToValueAtTime(targetGain, restoreEnd);
  }

  // ── Background music: simple robotic arpeggio loop ──────────────

  /** Note set (C-minor pentatonic-ish). */
  const BG_NOTES = [130, 165, 196, 220, 261, 330, 392];

  /** Start the background music loop (no-op if disabled / already running). @returns {void} */
  function _startMusic() {
    if (!_musicEnabled || _musicRunning) return;
    _musicRunning = true;
    let beat = 0;

    function _tick() {
      if (!_musicRunning) return;
      const ctx = _getCtx();
      const note = BG_NOTES[beat % BG_NOTES.length];
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = note;
      g.gain.setValueAtTime(0.07, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(g); g.connect(_musicGain);
      osc.start(); osc.stop(ctx.currentTime + 0.15);

      if (beat % CONFIG.MUSIC_BASS_EVERY === 0) {
        _tone(65, 'sawtooth', 0.3, 0.06, _musicGain);
      }

      beat++;
      _bgLoopTimeout = setTimeout(_tick, CONFIG.MUSIC_BPM_INT_MS);
    }
    _tick();
  }

  /** Stop the background music loop. @returns {void} */
  function _stopMusic() {
    _musicRunning = false;
    if (_bgLoopTimeout) { clearTimeout(_bgLoopTimeout); _bgLoopTimeout = null; }
  }

  return {
    /** @returns {void} */ playSpin()        { _playSpin(); },
    /** @param {number} i @returns {void} */ playReelStop(i) { _playReelStop(i); },
    /** @returns {void} */ playSmallWin()    { _playSmallWin(); },
    /** @returns {void} */ playBigWin()      { _playBigWin(); },
    /** @returns {void} */ playJackpot()     { _playJackpot(); },
    /** @returns {void} */ playLoss()        { _playLoss(); },
    /** @returns {void} */ playNearMiss()    { _playNearMiss(); },
    /** @returns {void} */ playClick()       { _playClick(); },
    /** @returns {void} */ playAchievement() { _playAchievement(); },
    /** @returns {void} */ playWelcome()     { _playWelcome(); },
    /** @returns {void} */ playDenied()      { _playDenied(); },
    /**
     * Iteration 21 — play the tease-state tension ramp.
     * @param {number} durationMs - Ramp duration in milliseconds.
     * @returns {void}
     */
    playTensionRamp(durationMs) { _playTensionRamp(durationMs); },

    /**
     * Iteration 21 (revised) — fade music down and back up over a window.
     *
     * Used during the tease spin to dim BGM for the sawtooth ramp,
     * then restore music just as the final reel lands and win-sting fires.
     *
     * @param {number} durationMs - Total fade-out-and-back duration (ms).
     * @returns {void}
     */
    fadeOutMusic(durationMs) { _fadeOutMusic(durationMs); },

    /**
     * Enable or disable sound effects.
     * @param {boolean} v - True to enable SFX.
     * @returns {void}
     */
    setSfxEnabled(v) {
      _sfxEnabled = !!v;
      if (_sfxGain) _rampGain(_sfxGain.gain, _sfxEnabled ? CONFIG.DEFAULT_SFX : 0);
    },

    /**
     * Enable or disable the background music loop.
     * @param {boolean} v - True to start music, false to stop.
     * @returns {void}
     */
    setMusicEnabled(v) {
      _musicEnabled = !!v;
      _getCtx();
      if (_musicEnabled) _startMusic(); else _stopMusic();
    },

    /**
     * Set master volume in real time (0–100).
     * @param {number} v - Slider value (0–100).
     * @returns {void}
     */
    setMasterVolume(v) {
      _masterPct = Math.max(0, Math.min(100, v));
      _getCtx();
      _rampGain(_masterGain.gain, _masterPct / 100);
    },

    /**
     * Set music volume in real time (0–100).
     * @description The slider maps 0–100 → 0–0.5 to keep music well
     *   below SFX head-room and prevent clipping at max master.
     * @param {number} v - Slider value (0–100).
     * @returns {void}
     */
    setMusicVolume(v) {
      _musicPct = Math.max(0, Math.min(100, v));
      _getCtx();
      _rampGain(_musicGain.gain, (_musicPct / 100) * 0.5);
    },

    /**
     * Read-back current slider values (useful when re-hydrating UI from State).
     * @returns {{master:number, music:number, sfx:boolean, musicOn:boolean}}
     */
    getLevels() {
      return {
        master:  _masterPct,
        music:   _musicPct,
        sfx:     _sfxEnabled,
        musicOn: _musicEnabled,
      };
    },

    /**
     * Unlock the AudioContext (required on first user gesture).
     * @returns {void}
     */
    unlock() { _getCtx(); },
  };
})();

Object.freeze(Audio);
