/**
 * rng.js — Cryptographically-seeded RNG with server-simulation layer.
 * Uses crypto.getRandomValues as the entropy source.
 * Wraps output in a sealed closure so the raw generator is not inspectable.
 */
const RNG = (() => {
  // Internal 32-bit XorShift state seeded from crypto entropy
  const _state = new Uint32Array(4);
  (function _seed() {
    crypto.getRandomValues(_state);
    // Ensure no zero state
    for (let i = 0; i < 4; i++) if (_state[i] === 0) _state[i] = 1;
  })();

  // XorShift128+ — fast, well-distributed, non-predictable from outside
  function _next() {
    let t = _state[3];
    t ^= t << 11; t ^= t >>> 8;
    _state[3] = _state[2]; _state[2] = _state[1]; _state[1] = _state[0];
    const s = _state[0];
    t ^= s; t ^= s >>> 19;
    _state[0] = t;
    return (t >>> 0) / 0x100000000; // [0, 1)
  }

  // Re-seed periodically to prevent long-run pattern analysis
  let _callCount = 0;
  function _maybeReseed() {
    _callCount++;
    if (_callCount >= 500) {
      const fresh = new Uint32Array(4);
      crypto.getRandomValues(fresh);
      for (let i = 0; i < 4; i++) _state[i] ^= fresh[i];
      _callCount = 0;
    }
  }

  return {
    /** Returns a float in [0, 1) */
    random() {
      _maybeReseed();
      return _next();
    },
    /** Returns an integer in [min, max] inclusive */
    randInt(min, max) {
      return Math.floor(this.random() * (max - min + 1)) + min;
    },
    /** Picks a random element from an array */
    pick(arr) {
      return arr[this.randInt(0, arr.length - 1)];
    },
    /** Weighted random pick: weights array matches items array */
    weightedPick(items, weights) {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.random() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    /** Shuffle array in-place using Fisher-Yates */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.randInt(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  };
})();

// Freeze to prevent external mutation
Object.freeze(RNG);
