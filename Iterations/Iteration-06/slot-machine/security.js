/**
 * security.js — Anti-automation, rate limiting, and tamper detection.
 * Guards against: macro scripts, rapid-fire automation, devtools probing.
 */
const Security = (() => {
  // Timing ring buffer to detect inhuman click patterns
  const _timestamps = [];
  const MAX_HISTORY = 20;
  const MIN_HUMAN_INTERVAL_MS = 180; // faster than this = suspicious
  const MAX_BURST_COUNT = 8;          // max spins in a 3-second window

  let _lockoutUntil = 0;
  let _devtoolsWarned = false;
  let _inputEntropy = [];             // mouse move positions for human proof

  // Detect DevTools via timing trick
  function _checkDevtools() {
    const start = performance.now();
    // eslint-disable-next-line no-debugger
    debugger; // Pauses here if devtools are open, creating a measurable delay
    const elapsed = performance.now() - start;
    if (elapsed > 100 && !_devtoolsWarned) {
      _devtoolsWarned = true;
      console.warn('%c[ROBO-SLOTS] DevTools detected. Play fair, unit!',
        'color:#e53935;font-size:18px;font-weight:bold;');
    }
  }

  // Track mouse movement for entropy / proof-of-human
  document.addEventListener('mousemove', (e) => {
    _inputEntropy.push(e.clientX ^ e.clientY);
    if (_inputEntropy.length > 50) _inputEntropy.shift();
  }, { passive: true });

  // Compute entropy score from mouse movement diversity
  function _humanEntropyScore() {
    if (_inputEntropy.length < 5) return 0;
    const unique = new Set(_inputEntropy).size;
    return unique / _inputEntropy.length; // 0–1; humans > 0.4
  }

  return {
    /**
     * Call before each spin attempt.
     * Returns { allowed: bool, reason: string }
     */
    checkSpin() {
      const now = Date.now();

      // Still in lockout
      if (now < _lockoutUntil) {
        return { allowed: false, reason: 'slow_down' };
      }

      _timestamps.push(now);
      if (_timestamps.length > MAX_HISTORY) _timestamps.shift();

      // Check interval between last two spins
      if (_timestamps.length >= 2) {
        const lastInterval = _timestamps[_timestamps.length - 1] - _timestamps[_timestamps.length - 2];
        if (lastInterval < MIN_HUMAN_INTERVAL_MS) {
          _lockoutUntil = now + 2000;
          return { allowed: false, reason: 'too_fast' };
        }
      }

      // Burst check: count spins in last 3 seconds
      const windowStart = now - 3000;
      const recentCount = _timestamps.filter(t => t >= windowStart).length;
      if (recentCount > MAX_BURST_COUNT) {
        _lockoutUntil = now + 4000;
        return { allowed: false, reason: 'burst' };
      }

      // Low entropy = no mouse movement = likely automated
      if (_humanEntropyScore() < 0.15 && _timestamps.length > 5) {
        return { allowed: false, reason: 'low_entropy' };
      }

      _checkDevtools();
      return { allowed: true, reason: '' };
    },

    /** Returns ms until lockout expires, or 0 if not locked */
    lockoutRemaining() {
      return Math.max(0, _lockoutUntil - Date.now());
    },

    /** Called on confirmed human interaction (mouse move, key, scroll) to top up entropy */
    addEntropy(value) {
      _inputEntropy.push(value | 0);
      if (_inputEntropy.length > 50) _inputEntropy.shift();
    }
  };
})();

Object.freeze(Security);
