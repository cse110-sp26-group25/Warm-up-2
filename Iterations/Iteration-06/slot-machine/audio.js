/**
 * audio.js — Web Audio API sound engine.
 * Generates all sounds procedurally (no external files needed).
 * Exposes play/stop methods and volume/mute controls.
 */
const Audio = (() => {
  let _ctx = null;
  let _masterGain = null;
  let _musicGain = null;
  let _sfxGain = null;
  let _musicOsc = [];
  let _musicRunning = false;
  let _sfxEnabled = true;
  let _musicEnabled = false;

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _masterGain = _ctx.createGain(); _masterGain.gain.value = 0.7;
      _sfxGain    = _ctx.createGain(); _sfxGain.gain.value = 1.0;
      _musicGain  = _ctx.createGain(); _musicGain.gain.value = 0.4;
      _sfxGain.connect(_masterGain);
      _musicGain.connect(_masterGain);
      _masterGain.connect(_ctx.destination);
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  // Generic tone helper
  function _tone(freq, type, duration, vol, dest, startDelay = 0) {
    const ctx = _getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
    gain.gain.setValueAtTime(vol, ctx.currentTime + startDelay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
    osc.connect(gain); gain.connect(dest);
    osc.start(ctx.currentTime + startDelay);
    osc.stop(ctx.currentTime + startDelay + duration);
  }

  // Noise burst (for spinning reel texture)
  function _noise(duration, vol, dest) {
    const ctx = _getCtx();
    const bufSize = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * vol;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 0.5;
    src.connect(filter); filter.connect(dest);
    src.start(); src.stop(ctx.currentTime + duration);
  }

  // ── Sound library ─────────────────────────────────────────────────────

  function _playSpin() {
    if (!_sfxEnabled) return;
    const ctx = _getCtx();
    // Descending mechanical ratchet
    for (let i = 0; i < 8; i++) {
      _tone(300 - i * 20, 'sawtooth', 0.08, 0.15, _sfxGain, i * 0.06);
    }
    _noise(0.5, 0.05, _sfxGain);
  }

  function _playReelStop(reelIndex) {
    if (!_sfxEnabled) return;
    const freqs = [220, 277, 330];
    _tone(freqs[reelIndex] || 220, 'square', 0.12, 0.2, _sfxGain);
    _noise(0.06, 0.1, _sfxGain);
  }

  function _playSmallWin() {
    if (!_sfxEnabled) return;
    // Quick ascending arpeggio
    const notes = [523, 659, 784];
    notes.forEach((f, i) => _tone(f, 'triangle', 0.18, 0.3, _sfxGain, i * 0.1));
  }

  function _playBigWin() {
    if (!_sfxEnabled) return;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => _tone(f, 'triangle', 0.3, 0.4, _sfxGain, i * 0.1));
    // Extra fanfare chord
    [523, 659, 784, 1047].forEach(f => _tone(f, 'sine', 0.8, 0.3, _sfxGain, 0.6));
  }

  function _playJackpot() {
    if (!_sfxEnabled) return;
    const scale = [523,587,659,698,784,880,988,1047];
    scale.forEach((f, i) => {
      _tone(f, 'triangle', 0.4, 0.5, _sfxGain, i * 0.08);
      _tone(f * 2, 'sine',    0.3, 0.2, _sfxGain, i * 0.08 + 0.04);
    });
  }

  function _playLoss() {
    if (!_sfxEnabled) return;
    _tone(200, 'sawtooth', 0.25, 0.15, _sfxGain);
    _tone(150, 'sawtooth', 0.25, 0.15, _sfxGain, 0.15);
  }

  function _playNearMiss() {
    if (!_sfxEnabled) return;
    _tone(880, 'sine', 0.12, 0.2, _sfxGain);
    _tone(660, 'sine', 0.12, 0.2, _sfxGain, 0.1);
  }

  function _playClick() {
    if (!_sfxEnabled) return;
    _tone(440, 'square', 0.04, 0.1, _sfxGain);
  }

  function _playAchievement() {
    if (!_sfxEnabled) return;
    [784, 988, 1319].forEach((f, i) => _tone(f, 'sine', 0.3, 0.4, _sfxGain, i * 0.12));
  }

  // ── Background music: simple robotic arpeggio loop ────────────────────
  const BG_NOTES = [130, 165, 196, 220, 261, 330, 392]; // C-minor pentatonic-ish
  let _bgLoopTimeout = null;

  function _startMusic() {
    if (!_musicEnabled || _musicRunning) return;
    _musicRunning = true;
    let beat = 0;

    function _tick() {
      if (!_musicRunning) return;
      const ctx = _getCtx();
      const note = BG_NOTES[beat % BG_NOTES.length];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = note;
      g.gain.setValueAtTime(0.07, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(g); g.connect(_musicGain);
      osc.start(); osc.stop(ctx.currentTime + 0.15);

      // Bass pulse every 4 beats
      if (beat % 4 === 0) {
        _tone(65, 'sawtooth', 0.3, 0.06, _musicGain);
      }

      beat++;
      _bgLoopTimeout = setTimeout(_tick, 200); // 300 BPM-ish 16th note feel
    }
    _tick();
  }

  function _stopMusic() {
    _musicRunning = false;
    if (_bgLoopTimeout) { clearTimeout(_bgLoopTimeout); _bgLoopTimeout = null; }
  }

  return {
    playSpin()              { _playSpin(); },
    playReelStop(i)         { _playReelStop(i); },
    playSmallWin()          { _playSmallWin(); },
    playBigWin()            { _playBigWin(); },
    playJackpot()           { _playJackpot(); },
    playLoss()              { _playLoss(); },
    playNearMiss()          { _playNearMiss(); },
    playClick()             { _playClick(); },
    playAchievement()       { _playAchievement(); },

    setSfxEnabled(v) {
      _sfxEnabled = !!v;
    },
    setMusicEnabled(v) {
      _musicEnabled = !!v;
      if (_musicEnabled) _startMusic(); else _stopMusic();
    },
    setMasterVolume(v) {
      _getCtx();
      _masterGain.gain.value = Math.max(0, Math.min(1, v / 100));
    },
    setMusicVolume(v) {
      _getCtx();
      _musicGain.gain.value = Math.max(0, Math.min(1, v / 100)) * 0.5;
    },
    /** Must be called from a user gesture to unlock AudioContext */
    unlock() { _getCtx(); }
  };
})();

Object.freeze(Audio);
