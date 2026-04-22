/**
 * rng.js — Cryptographically-Secure, Encapsulated RNG
 *
 * Uses window.crypto.getRandomValues() exclusively — never Math.random().
 * All internal state lives inside a closure; the public API is frozen so
 * console access cannot replace or read private variables.
 *
 * Rejection-sampling prevents modulo bias on integer picks.
 * Weighted selection supports non-uniform symbol distributions.
 */
const RNG = (() => {
  'use strict';

  /**
   * Unbiased random integer in [min, max).
   * Rejection loop discards any value that falls above the largest
   * multiple of `range` that fits in 32 bits, eliminating modulo bias.
   */
  function randomInt(min, max) {
    const range = max - min;
    if (!Number.isInteger(range) || range <= 0) {
      throw new RangeError('randomInt: max must be an integer > min');
    }
    // Largest multiple of range that still fits in a uint32
    const limit = Math.floor(0x100000000 / range) * range;
    const buf   = new Uint32Array(1);
    let r;
    do {
      crypto.getRandomValues(buf);
      r = buf[0];
    } while (r >= limit);
    return min + (r % range);
  }

  /**
   * Random float in [0, 1).
   * Divides a fresh 32-bit value by 2^32.
   */
  function randomFloat() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }

  /**
   * Select one value from an array of { value, weight } items.
   * Weights are arbitrary positive numbers (not required to sum to 100).
   * Uses a single randomFloat() draw — O(n) walk avoids extra entropy calls.
   *
   * @param {Array<{value: *, weight: number}>} items
   * @returns {*} The selected item's value
   */
  function weightedPick(items) {
    let total = 0;
    for (const item of items) total += item.weight;

    let cursor = randomFloat() * total;
    for (const item of items) {
      cursor -= item.weight;
      if (cursor < 0) return item.value;
    }
    // Floating-point edge case: return last entry
    return items[items.length - 1].value;
  }

  /**
   * Generate a 2-D grid of symbol IDs for a slot machine spin.
   * Each cell is drawn independently from the weighted symbol pool,
   * simulating independent reel strips.
   *
   * Outcome is computed entirely in this call; the result is returned
   * to the caller (GameLogic) rather than stored in module state, so
   * there is no shared mutable outcome that could be read from the console.
   *
   * @param {number} rows
   * @param {number} cols
   * @param {Array<{value: string, weight: number}>} symbolPool
   * @returns {string[][]}  grid[row][col] = symbolId
   */
  function generateGrid(rows, cols, symbolPool) {
    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        grid[r][c] = weightedPick(symbolPool);
      }
    }
    return grid;
  }

  /**
   * Fisher-Yates shuffle — returns a new array, does not mutate input.
   * @param {Array} arr
   * @returns {Array}
   */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Freeze the API so no external code can replace these functions
  return Object.freeze({ randomInt, randomFloat, weightedPick, generateGrid, shuffle });
})();
