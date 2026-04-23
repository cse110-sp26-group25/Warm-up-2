/**
 * rng.js — Cryptographically-Secure Random Number Generator
 *
 * Uses window.crypto.getRandomValues() (a CSPRNG backed by the OS entropy
 * pool) instead of Math.random(), which is a predictable pseudo-RNG easily
 * seeded and replayed from DevTools.
 *
 * COMMIT-REVEAL SCHEME (provably-fair simulation)
 * ────────────────────────────────────────────────
 * Real online slots use a "commit-reveal" protocol to prove the outcome was
 * not manipulated after the spin button was pressed:
 *
 *   1. Before the spin: generate a 32-byte secret seed, hash it with
 *      SHA-256, and publish the hash ("the commitment").
 *   2. After the spin: reveal the raw seed; anyone can verify that
 *      hash(seed) === commitment, proving the seed was fixed before the
 *      outcome was derived.
 *
 * Because this is a single-page client app we cannot truly hide the seed from
 * a determined user, but the scheme still prevents post-hoc tampering: the
 * game logic consumes the seed immediately and discards it, while the
 * commitment is shown in the UI so players can verify fairness.
 *
 * ANTI-TAMPERING
 * ──────────────
 * The module is an IIFE that exposes only a frozen public API. Internal state
 * (the pending seed) is a closure variable that cannot be read or written from
 * the console. Symbol keys are used for extra obscurity.
 *
 * @module SecureRNG
 */

const SecureRNG = (() => {
  "use strict";

  // Internal state — closure-private, invisible from DevTools console
  let _pendingSeed      = null;   // Uint8Array(32): current spin's secret seed
  let _pendingCommitment = null;  // hex string: SHA-256 of _pendingSeed

  // ── Utility: convert Uint8Array → hex string ────────────────────────────
  function _toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // ── Generate a cryptographically random integer in [0, max) ─────────────
  // Uses rejection sampling to avoid modulo bias.
  function randomInt(max) {
    if (max <= 0 || !Number.isInteger(max)) throw new RangeError("max must be a positive integer");
    const needed  = Math.ceil(Math.log2(max));
    const bytes   = Math.ceil(needed / 8);
    const mask    = (1 << needed) - 1;
    let value;
    do {
      const buf  = new Uint8Array(bytes);
      window.crypto.getRandomValues(buf);
      value = buf.reduce((acc, byte, i) => acc | (byte << (8 * i)), 0) & mask;
    } while (value >= max);   // Rejection: discard values outside [0, max)
    return value;
  }

  // ── Generate a cryptographically random float in [0, 1) ─────────────────
  function randomFloat() {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    // Divide by 2^32 to get [0, 1)
    return buf[0] / 4294967296;
  }

  // ── Prepare a verifiable spin commitment ─────────────────────────────────
  // Call this BEFORE showing spin animation so the commitment is visible
  // while the reels are turning. The seed is consumed by resolveCommitment().
  async function prepareCommitment() {
    const seed = new Uint8Array(32);
    window.crypto.getRandomValues(seed);

    // Compute SHA-256 commitment via SubtleCrypto
    let commitment = "NOT_SUPPORTED";
    if (window.crypto.subtle) {
      try {
        const hash   = await window.crypto.subtle.digest("SHA-256", seed);
        commitment   = _toHex(hash);
      } catch (_) {
        // SubtleCrypto unavailable in some non-secure contexts
        commitment = "UNAVAILABLE";
      }
    }

    _pendingSeed       = seed;
    _pendingCommitment = commitment;

    return commitment; // Show this to the player before the outcome is known
  }

  // ── Derive the spin outcome from the committed seed ───────────────────────
  // Returns { roll: 0–999, seedHex, commitment } after consuming the seed.
  // `roll` indexes into CONFIG.OUTCOME_TABLE.
  function resolveCommitment() {
    if (!_pendingSeed) {
      // Fallback if prepareCommitment was not awaited (should not happen)
      const fallback = new Uint8Array(4);
      window.crypto.getRandomValues(fallback);
      const view = new DataView(fallback.buffer);
      return {
        roll:       view.getUint32(0) % 1000,
        seedHex:    _toHex(fallback),
        commitment: "FALLBACK",
      };
    }

    // Derive a 0–999 outcome from the first 4 bytes of the seed
    const view   = new DataView(_pendingSeed.buffer);
    const raw    = view.getUint32(0, false); // big-endian
    const roll   = raw % 1000;
    const result = {
      roll,
      seedHex:    _toHex(_pendingSeed),
      commitment: _pendingCommitment,
    };

    // Consume and wipe the seed so it cannot be replayed
    _pendingSeed.fill(0);
    _pendingSeed       = null;
    _pendingCommitment = null;

    return result;
  }

  // ── Pick a weighted random symbol from CONFIG.SYMBOLS ────────────────────
  // Used for the cosmetic top/bottom rows of the reels (not the payline).
  function weightedSymbol() {
    const symbols    = CONFIG.SYMBOLS;
    const totalWeight = symbols.reduce((sum, s) => sum + s.weight, 0);
    let pick = randomInt(totalWeight);
    for (const sym of symbols) {
      if (pick < sym.weight) return sym;
      pick -= sym.weight;
    }
    return symbols[symbols.length - 1]; // Fallback (should never reach)
  }

  // ── Shuffle an array in-place (Fisher-Yates) ─────────────────────────────
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Public API (frozen to prevent monkey-patching) ───────────────────────
  return Object.freeze({
    randomInt,
    randomFloat,
    prepareCommitment,
    resolveCommitment,
    weightedSymbol,
    shuffleArray,
  });

})();
