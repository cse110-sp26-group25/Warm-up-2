/**
 * gameLogic.js — Payout math, reel configuration, spin resolution.
 *
 * All tunable numbers live in the module-level `CONFIG` object below —
 * there are no magic numbers anywhere else in this file. Persistent
 * values (jackpot, spinCount, pityMeter, totalWinnings) are read from
 * and written back to the `State` module so they survive page reloads.
 *
 * Target RTP is ~92 %. A pity mechanic guarantees a small payout after
 * `CONFIG.PITY_THRESHOLD` consecutive dry spins so losing streaks cannot
 * grind indefinitely. The jackpot snowballs by `CONFIG.JACKPOT_FRACTION`
 * of every bet and resets to `CONFIG.JACKPOT_SEED` after a win.
 */
const GameLogic = (() => {

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIG — every tunable in one place. No magic numbers elsewhere.
  // ═══════════════════════════════════════════════════════════════════
  const CONFIG = Object.freeze({
    /** Symbols per reel strip (must be large enough for visual illusion). */
    REEL_SIZE:        32,
    /** Number of reels (visible columns in the 3×5 grid). */
    REEL_COUNT:       5,
    /** Visible rows (fixed by the HTML/CSS layout). */
    VISIBLE_ROWS:     3,
    /** Consecutive dry spins after which pity kicks in. */
    PITY_THRESHOLD:   20,
    /** Fraction of each bet added to the jackpot pool. */
    JACKPOT_FRACTION: 0.05,
    /** Jackpot reset value after it is won. */
    JACKPOT_SEED:     1000,
    /** Minimum number of "high" symbols on the line to register a near-miss. */
    NEAR_MISS_HIGHS:  2,
    /** Pay-multiplier tables — bet × multiplier = payout (2 decimals). */
    PAYOUTS: {
      /** Five-of-a-kind multipliers (from reel 0 → 4). `jackpot` pays the pool. */
      FIVE:  { jackpot: 0, seven: 500, gear: 150, bolt: 75, chip: 40, robo: 25, nut: 12, screw: 7 },
      /** Four-of-a-kind multipliers. */
      FOUR:  { seven: 100, gear: 30,  bolt: 15, chip:  8, robo:  5,  nut: 2.5, screw: 1.5 },
      /** Three-of-a-kind multipliers. Three `jackpot` symbols also pay the pool. */
      THREE: { jackpot: 0, seven: 200, gear: 50, bolt: 25, chip: 15, robo: 10, nut: 5, screw: 3 },
      /** Two-of-a-kind multipliers (small change). */
      TWO:   { seven: 10, gear:  5,  bolt:  3, chip:  2, robo:  1.5, nut: 1, screw: 0.5 },
    },
  });

  // ── Symbol definitions (reel-strip frequency via `weight`) ─────────
  /** @type {ReadonlyArray<{id:string,label:string,weight:number}>} */
  const SYMBOLS = Object.freeze([
    { id: 'jackpot', label: 'JACKPOT', weight:  1 },
    { id: 'seven',   label: '7',       weight:  3 },
    { id: 'gear',    label: 'GEAR',    weight:  6 },
    { id: 'bolt',    label: 'BOLT',    weight: 10 },
    { id: 'chip',    label: 'CHIP',    weight: 14 },
    { id: 'robo',    label: 'ROBO',    weight: 18 },
    { id: 'nut',     label: 'NUT',     weight: 22 },
    { id: 'screw',   label: 'SCREW',   weight: 26 },
  ]);

  /**
   * Build one reel strip by sampling the weighted symbol pool.
   * @returns {string[]} An array of symbol ids, length `CONFIG.REEL_SIZE`.
   */
  function _buildReel() {
    const pool = [];
    for (const sym of SYMBOLS) for (let i = 0; i < sym.weight; i++) pool.push(sym.id);
    const strip = [];
    for (let i = 0; i < CONFIG.REEL_SIZE; i++) strip.push(RNG.pick(pool));
    return strip;
  }

  /** @type {string[][]} The five reel strips — built once per page load. */
  const REELS = Array.from({ length: CONFIG.REEL_COUNT }, _buildReel);

  // ── Persistent state: read from (and write back to) the State module ──
  /** @type {number} Session-local spin counter (mirrors State.spinCount). */
  let _spinCount      = /** @type {number} */ (State.get('spinCount'))     || 0;
  /** @type {number} Running total winnings (mirrors State.totalWinnings). */
  let _totalWinnings  = /** @type {number} */ (State.get('totalWinnings')) || 0;
  /** @type {number} Current jackpot pool. */
  let _jackpot        = /** @type {number} */ (State.get('jackpot'))       || CONFIG.JACKPOT_SEED;
  /** @type {number} Consecutive dry spins (the pity meter). */
  let _pityMeter      = /** @type {number} */ (State.get('pityMeter'))     || 0;

  // ── Public API ─────────────────────────────────────────────────────
  return {
    /** @type {ReadonlyArray<{id:string,label:string,weight:number}>} */
    SYMBOLS,
    /** @type {string[][]} */
    REELS,
    /** @type {number} */
    REEL_SIZE:  CONFIG.REEL_SIZE,
    /** @type {number} */
    REEL_COUNT: CONFIG.REEL_COUNT,
    /** @type {Object} Exposed for debugging + UI read-back. */
    CONFIG,

    /** @returns {number} Current jackpot value. */
    get jackpot()       { return _jackpot; },
    /** @returns {number} Cumulative lifetime winnings. */
    get totalWinnings() { return _totalWinnings; },
    /** @returns {number} Total number of spins over all sessions. */
    get spinCount()     { return _spinCount; },
    /** @returns {number} Current pity meter value. */
    get pityMeter()     { return _pityMeter; },

    /**
     * Spin all reels and resolve the centre-row payline.
     * @description Mutates persistent state on every call: `spinCount`
     *   always increments, the jackpot grows by a fraction of the bet,
     *   and `pityMeter` either resets on a win or increments on a loss.
     * @param {number} bet - Bet amount in dollars.
     * @returns {{stops:number[], symbols:string[], payout:number, type:string, nearMiss:boolean, jackpotAmount?:number, pityTriggered?:boolean}} Spin result.
     */
    spin(bet) {
      _spinCount += 1;
      State.set('spinCount', _spinCount);

      // Snowball: a fraction of every bet feeds the jackpot.
      _jackpot += bet * CONFIG.JACKPOT_FRACTION;

      // Pick reel stops; apply pity nudge if we've been dry too long.
      let stops = REELS.map(reel => RNG.randInt(0, reel.length - 1));
      let pityTriggered = false;
      if (_pityMeter >= CONFIG.PITY_THRESHOLD) {
        stops = this._applyPity(stops);
        pityTriggered = true;
        State.increment('playerStats.pityTriggers', 1);
      }

      const syms   = stops.map((stop, i) => REELS[i][stop]);
      const result = this._resolve(syms, bet);

      // Book-keeping.
      if (result.payout > 0) {
        _pityMeter = 0;
        _totalWinnings += result.payout;

        if (result.type === 'jackpot') {
          const jpWin = Math.floor(_jackpot);
          _totalWinnings    += jpWin;
          result.payout     += jpWin;
          result.jackpotAmount = jpWin;
          _jackpot = CONFIG.JACKPOT_SEED;
        }
      } else {
        _pityMeter += 1;
      }

      // Persist.
      State.set('jackpot',       _jackpot);
      State.set('pityMeter',     _pityMeter);
      State.set('totalWinnings', _totalWinnings);

      return { stops, symbols: syms, pityTriggered, ...result };
    },

    /**
     * Resolve the centre-row payline.
     * @description Counts consecutive left-to-right matches from reel 0 and
     *   consults the 5/4/3/2-of-a-kind multiplier tables. Also flags a
     *   near-miss when `CONFIG.NEAR_MISS_HIGHS` high-value symbols appear.
     * @param {string[]} syms - The five centre-row symbol ids.
     * @param {number}   bet  - Bet amount in dollars.
     * @returns {{payout:number, type:string, nearMiss:boolean}} Resolution.
     */
    _resolve(syms, bet) {
      const anchor = syms[0];

      // Count consecutive left-to-right matches.
      let matchCount = 1;
      for (let i = 1; i < syms.length; i++) {
        if (syms[i] === anchor) matchCount++;
        else break;
      }

      // 5-of-a-kind (special case: jackpot symbol pays the pool).
      if (matchCount === 5) {
        if (anchor === 'jackpot') return { payout: 0, type: 'jackpot', nearMiss: false };
        const mult = CONFIG.PAYOUTS.FIVE[anchor] || 1;
        return { payout: +(bet * mult).toFixed(2), type: 'five', nearMiss: false };
      }

      // 4-of-a-kind.
      if (matchCount === 4) {
        const mult = CONFIG.PAYOUTS.FOUR[anchor] || 0;
        if (mult) return { payout: +(bet * mult).toFixed(2), type: 'four', nearMiss: false };
      }

      // 3-of-a-kind (special case: jackpot symbol pays the pool).
      if (matchCount === 3) {
        if (anchor === 'jackpot') return { payout: 0, type: 'jackpot', nearMiss: false };
        const mult = CONFIG.PAYOUTS.THREE[anchor] || 0;
        if (mult) return { payout: +(bet * mult).toFixed(2), type: 'three', nearMiss: false };
      }

      // 2-of-a-kind.
      if (matchCount === 2) {
        const mult = CONFIG.PAYOUTS.TWO[anchor] || 0;
        if (mult) return { payout: +(bet * mult).toFixed(2), type: 'two', nearMiss: false };
      }

      // Near-miss: ≥ NEAR_MISS_HIGHS premium symbols anywhere on the line.
      const highCount = syms.filter(s => s === 'jackpot' || s === 'seven').length;
      if (highCount >= CONFIG.NEAR_MISS_HIGHS) {
        return { payout: 0, type: 'loss', nearMiss: true };
      }

      return { payout: 0, type: 'loss', nearMiss: false };
    },

    /**
     * Pity nudge: force reel 1 to match reel 0 so the spin yields at least a
     * 2-of-a-kind. Chooses the nearest matching index on reel 1 to minimise
     * visible disruption to the animation.
     * @param {number[]} stops - Current stop indices for all reels.
     * @returns {number[]} Adjusted stop indices.
     */
    _applyPity(stops) {
      const nudged    = stops.slice();
      const targetSym = REELS[0][nudged[0]];
      let best = -1, bestDist = Infinity;
      for (let i = 0; i < REELS[1].length; i++) {
        if (REELS[1][i] === targetSym) {
          const dist = Math.abs(i - nudged[1]);
          if (dist < bestDist) { bestDist = dist; best = i; }
        }
      }
      if (best !== -1) nudged[1] = best;
      return nudged;
    },

    /**
     * Grow the jackpot externally (e.g. from simulated leaderboard bets).
     * @param {number} amount - Dollar amount to add.
     * @returns {void}
     */
    growJackpot(amount) {
      _jackpot += amount;
      State.set('jackpot', _jackpot);
    },

    /**
     * Look up a symbol definition by id.
     * @param {string} id - Symbol id.
     * @returns {{id:string,label:string,weight:number}|undefined} Definition.
     */
    getSymbolById(id) {
      return SYMBOLS.find(s => s.id === id);
    },

    /**
     * Format a number as US-dollar currency.
     * @param {number} n - Amount.
     * @returns {string} Formatted string (e.g. `$1,234.56`).
     */
    formatMoney(n) {
      return '$' + n.toLocaleString('en-US', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });
    },
  };
})();

Object.freeze(GameLogic);
