/**
 * security.js — Anti-automation, rate-limiting, and tamper detection.
 *
 * Guards against:
 *   • Macro scripts and rapid-fire automation (timing-based lockouts).
 *   • "Headless" play (entropy score from real mouse movement).
 *   • DevTools tampering (debugger-statement timing probe — non-blocking).
 *
 * This is a *client-side* defence in depth, not a crypto barrier: the
 * authoritative RNG and spin resolution still live in `gameLogic.js` and
 * `rng.js`, whose state is sealed in closures.
 */
const Security = (() => {

  /** @type {Object} All tunable thresholds — no magic numbers inline. */
  const CONFIG = Object.freeze({
    /** Max number of recent timestamps kept for burst analysis. */
    MAX_HISTORY:           20,
    /** Minimum interval between spins that a human is plausibly capable of (ms). */
    MIN_HUMAN_INTERVAL_MS: 180,
    /** Max spins allowed in the burst window. */
    MAX_BURST_COUNT:       8,
    /** Sliding window for burst detection (ms). */
    BURST_WINDOW_MS:       3000,
    /** Lockout duration after an interval violation (ms). */
    LOCKOUT_INTERVAL_MS:   2000,
    /** Lockout duration after a burst violation (ms). */
    LOCKOUT_BURST_MS:      4000,
    /** Max entropy samples retained in the ring buffer. */
    ENTROPY_SAMPLES:       50,
    /** Below this uniqueness ratio, input stream looks synthetic. */
    ENTROPY_MIN_RATIO:     0.15,
    /** Skip entropy checks until this many spins have happened. */
    ENTROPY_WARMUP_SPINS:  5,
    /** DevTools `debugger` probe threshold (ms). */
    DEVTOOLS_PROBE_MS:     100,
  });

  /** @type {number[]} Ring buffer of spin timestamps. */
  const _timestamps = [];

  /** @type {number} Epoch ms until which spins are rejected. */
  let _lockoutUntil = 0;

  /** @type {boolean} Whether we've already scolded the player about DevTools. */
  let _devtoolsWarned = false;

  /** @type {number[]} Recent mouse-move entropy samples (ring buffer). */
  const _inputEntropy = [];

  /**
   * Non-blocking DevTools probe: a `debugger` statement pauses the thread
   * only when DevTools is open, making the elapsed time detectable.
   * @returns {void}
   */
  function _checkDevtools() {
    const start = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    const elapsed = performance.now() - start;
    if (elapsed > CONFIG.DEVTOOLS_PROBE_MS && !_devtoolsWarned) {
      _devtoolsWarned = true;
      console.warn(
        '%c[ROBO-SLOTS] DevTools detected. Play fair, unit!',
        'color:#e53935;font-size:18px;font-weight:bold;'
      );
    }
  }

  /**
   * Passively collect a mouse-move sample into the entropy buffer.
   * @param {MouseEvent} e - Native mousemove event.
   * @returns {void}
   */
  function _onMouseMove(e) {
    _inputEntropy.push(e.clientX ^ e.clientY);
    if (_inputEntropy.length > CONFIG.ENTROPY_SAMPLES) _inputEntropy.shift();
  }
  document.addEventListener('mousemove', _onMouseMove, { passive: true });

  /**
   * Compute a 0–1 uniqueness ratio over recent input samples.
   * @description A real human yields a ratio well above 0.4; a replay
   *   script typically yields 0 or a tiny constant.
   * @returns {number} Ratio in [0, 1].
   */
  function _humanEntropyScore() {
    if (_inputEntropy.length < 5) return 0;
    const unique = new Set(_inputEntropy).size;
    return unique / _inputEntropy.length;
  }

  return {
    /**
     * Validate whether a spin is permitted right now.
     * @description Called *before* the reels resolve. Returns both a
     *   boolean and a reason code so the UI can explain the rejection.
     * @returns {{allowed: boolean, reason: string}} Decision + reason.
     */
    checkSpin() {
      const now = Date.now();

      // Active lockout.
      if (now < _lockoutUntil) {
        return { allowed: false, reason: 'slow_down' };
      }

      _timestamps.push(now);
      if (_timestamps.length > CONFIG.MAX_HISTORY) _timestamps.shift();

      // Interval check.
      if (_timestamps.length >= 2) {
        const dt = _timestamps[_timestamps.length - 1]
                 - _timestamps[_timestamps.length - 2];
        if (dt < CONFIG.MIN_HUMAN_INTERVAL_MS) {
          _lockoutUntil = now + CONFIG.LOCKOUT_INTERVAL_MS;
          return { allowed: false, reason: 'too_fast' };
        }
      }

      // Burst check.
      const windowStart = now - CONFIG.BURST_WINDOW_MS;
      const recent = _timestamps.filter(t => t >= windowStart).length;
      if (recent > CONFIG.MAX_BURST_COUNT) {
        _lockoutUntil = now + CONFIG.LOCKOUT_BURST_MS;
        return { allowed: false, reason: 'burst' };
      }

      // Entropy check (after warmup).
      if (_humanEntropyScore() < CONFIG.ENTROPY_MIN_RATIO
          && _timestamps.length > CONFIG.ENTROPY_WARMUP_SPINS) {
        return { allowed: false, reason: 'low_entropy' };
      }

      _checkDevtools();
      return { allowed: true, reason: '' };
    },

    /**
     * Milliseconds remaining on the current lockout.
     * @returns {number} Remaining ms (0 if not locked).
     */
    lockoutRemaining() {
      return Math.max(0, _lockoutUntil - Date.now());
    },

    /**
     * Top up the entropy buffer from a non-mouse source (key, scroll, …).
     * @param {number} value - Any 32-bit integer (XOR'd into the buffer).
     * @returns {void}
     */
    addEntropy(value) {
      _inputEntropy.push(value | 0);
      if (_inputEntropy.length > CONFIG.ENTROPY_SAMPLES) _inputEntropy.shift();
    },
  };
})();

Object.freeze(Security);
