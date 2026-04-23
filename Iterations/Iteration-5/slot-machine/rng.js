/**
 * rng.js — Pseudo-random number generation utilities
 *
 * Uses Mulberry32: a fast, high-quality 32-bit PRNG that produces
 * statistically uniform output suitable for a fair slot machine.
 */

'use strict';

const RNG = (() => {
  let _state = Date.now() ^ (Math.random() * 0xFFFFFFFF | 0);

  /**
   * Advance the state and return a float in [0, 1).
   * Mulberry32 — by Tommy Ettinger.
   */
  function _next() {
    _state |= 0;
    _state = _state + 0x6D2B79F5 | 0;
    let t = Math.imul(_state ^ (_state >>> 15), 1 | _state);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  /**
   * Re-seed the generator (useful for deterministic replays/testing).
   * @param {number} seed
   */
  function seed(seed) {
    _state = seed >>> 0;
  }

  /**
   * Return a float in [0, 1).
   */
  function random() {
    return _next();
  }

  /**
   * Return an integer in [min, max] (inclusive).
   * @param {number} min
   * @param {number} max
   */
  function int(min, max) {
    return Math.floor(_next() * (max - min + 1)) + min;
  }

  /**
   * Pick one item from an array, weighted by a parallel weights array.
   * @param {Array}         items   — items to choose from
   * @param {number[]}      weights — non-negative weight per item
   * @returns {*} selected item
   */
  function weightedPick(items, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let cursor = _next() * total;
    for (let i = 0; i < items.length; i++) {
      cursor -= weights[i];
      if (cursor <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /**
   * Pick one item from an array with equal probability.
   * @param {Array} items
   */
  function pick(items) {
    return items[Math.floor(_next() * items.length)];
  }

  /**
   * Return true with probability `p` (0–1).
   * @param {number} p
   */
  function chance(p) {
    return _next() < p;
  }

  /**
   * Shuffle an array in-place using Fisher-Yates.
   * @param {Array} arr
   * @returns {Array} the same array, shuffled
   */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(_next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { seed, random, int, weightedPick, pick, chance, shuffle };
})();
