/**
 * rng.js — Cryptographically-seeded pseudo-random number generator.
 *
 * Uses `crypto.getRandomValues` for entropy and an XorShift128+ core for
 * fast, well-distributed output. The raw generator state is sealed in a
 * closure so it cannot be inspected, replayed, or mutated from DevTools.
 * Every ~500 calls the state is re-mixed with fresh crypto entropy to
 * defeat any long-run pattern analysis an attacker might attempt.
 */
const RNG = (() => {

  /** @type {Object} Configuration constants — no magic numbers. */
  const CONFIG = Object.freeze({
    /** Number of 32-bit words in the XorShift state vector. */
    STATE_WORDS: 4,
    /** Calls between crypto re-mix cycles. */
    RESEED_INTERVAL: 500,
    /** Divisor to convert uint32 → [0,1). */
    UINT32_RANGE: 0x100000000,
  });

  /** @type {Uint32Array} Internal 32-bit XorShift state (sealed in closure). */
  const _state = new Uint32Array(CONFIG.STATE_WORDS);

  /**
   * Seed the state from crypto entropy.
   * @description Guarantees no word is zero (a degenerate XorShift state).
   * @returns {void}
   */
  (function _seed() {
    crypto.getRandomValues(_state);
    for (let i = 0; i < CONFIG.STATE_WORDS; i++) {
      if (_state[i] === 0) _state[i] = 1;
    }
  })();

  /**
   * Advance the XorShift128+ state and return the next 32-bit word as [0,1).
   * @returns {number} A float in [0, 1).
   */
  function _next() {
    let t = _state[3];
    t ^= t << 11; t ^= t >>> 8;
    _state[3] = _state[2];
    _state[2] = _state[1];
    _state[1] = _state[0];
    const s = _state[0];
    t ^= s; t ^= s >>> 19;
    _state[0] = t;
    return (t >>> 0) / CONFIG.UINT32_RANGE;
  }

  /** @type {number} Call counter since last reseed. */
  let _callCount = 0;

  /**
   * Periodically XOR fresh crypto entropy into the state.
   * @returns {void}
   */
  function _maybeReseed() {
    _callCount++;
    if (_callCount >= CONFIG.RESEED_INTERVAL) {
      const fresh = new Uint32Array(CONFIG.STATE_WORDS);
      crypto.getRandomValues(fresh);
      for (let i = 0; i < CONFIG.STATE_WORDS; i++) _state[i] ^= fresh[i];
      _callCount = 0;
    }
  }

  return {
    /**
     * Uniform random float in [0, 1).
     * @returns {number} Random float.
     */
    random() {
      _maybeReseed();
      return _next();
    },

    /**
     * Uniform random integer in [min, max] inclusive.
     * @param {number} min - Lower bound (inclusive).
     * @param {number} max - Upper bound (inclusive).
     * @returns {number} Random integer.
     */
    randInt(min, max) {
      return Math.floor(this.random() * (max - min + 1)) + min;
    },

    /**
     * Pick a uniformly-random element from an array.
     * @param {Array<T>} arr - Source array.
     * @returns {T} A random element.
     * @template T
     */
    pick(arr) {
      return arr[this.randInt(0, arr.length - 1)];
    },

    /**
     * Weighted random pick: each item’s probability ∝ its weight.
     * @param {Array<T>}      items   - Items to choose from.
     * @param {Array<number>} weights - Parallel weight array.
     * @returns {T} The chosen item.
     * @template T
     */
    weightedPick(items, weights) {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.random() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },

    /**
     * Fisher-Yates in-place shuffle.
     * @param {Array<T>} arr - Array to shuffle (mutated).
     * @returns {Array<T>} The same array (for chaining).
     * @template T
     */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.randInt(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
})();

Object.freeze(RNG);
