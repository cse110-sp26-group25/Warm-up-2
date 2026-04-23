/**
 * gameLogic.js — Payout math, reel configuration, spin resolution (Iteration 09).
 *
 * All tunable numbers live in the module-level `CONFIG` object — no magic
 * numbers elsewhere in this file. Persistent values (jackpot, spinCount,
 * pityMeter, totalWinnings) are read from and written back to the `State`
 * module so they survive page reloads.
 *
 * Iteration 09 bug fix — Pity double-counting:
 *   In Iteration 08, if pity triggered but reel 0 landed on the `jackpot`
 *   symbol (which has no TWO-multiplier entry), `_resolve` returned payout=0.
 *   The loss branch then incremented `_pityMeter` again, so pity fired on
 *   the very next spin too — double-counting `playerStats.pityTriggers`.
 *
 *   Fix: `_pityMeter` is reset to 0 whenever `pityTriggered === true`,
 *   regardless of whether the resulting spin produced a non-zero payout.
 *   This ensures the pity mechanic fires exactly once per threshold crossing.
 */
const GameLogic = (() => {

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIG — every tunable in one place. No magic numbers elsewhere.
  // ═══════════════════════════════════════════════════════════════════
  const CONFIG = Object.freeze({
    /** Symbols per reel strip (large enough for the visual illusion). */
    REEL_SIZE:        32,
    /** Number of reels (visible columns in the 3×5 grid). */
    REEL_COUNT:       5,
    /** Visible rows (fixed by the HTML/CSS layout). */
    VISIBLE_ROWS:     3,
    /** Consecutive dry spins before the pity mechanic kicks in. */
    PITY_THRESHOLD:   20,
    /** Fraction of each bet added to the jackpot pool. */
    JACKPOT_FRACTION: 0.05,
    /** Jackpot reset value after it is won. */
    JACKPOT_SEED:     1000,
    /** Minimum "high" symbols on the payline to register a near-miss. */
    NEAR_MISS_HIGHS:  2,
    /** Pay-multiplier tables — bet × multiplier = payout. */
    PAYOUTS: {
      /** Five-of-a-kind. `jackpot` symbol pays the pool (payout=0 here). */
      FIVE:  { jackpot: 0, seven: 500, gear: 150, bolt: 75, chip: 40, robo: 25, nut: 12, screw: 7 },
      /** Four-of-a-kind. */
      FOUR:  { seven: 100, gear: 30,  bolt: 15, chip:  8, robo:  5, nut: 2.5, screw: 1.5 },
      /** Three-of-a-kind. Three `jackpot` symbols also pay the pool. */
      THREE: { jackpot: 0, seven: 200, gear: 50, bolt: 25, chip: 15, robo: 10, nut: 5, screw: 3 },
      /** Two-of-a-kind (small change). `jackpot` intentionally absent. */
      TWO:   { seven: 10, gear:  5,  bolt:  3, chip:  2, robo: 1.5, nut: 1, screw: 0.5 },
    },
  });

  // ── Symbol definitions ─────────────────────────────────────────────
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
   * @returns {string[]} Array of symbol ids, length `CONFIG.REEL_SIZE`.
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

  // ── Persistent state mirrors ───────────────────────────────────────
  /** @type {number} */
  let _spinCount     = /** @type {number} */ (State.get('spinCount'))     || 0;
  /** @type {number} */
  let _totalWinnings = /** @type {number} */ (State.get('totalWinnings')) || 0;
  /** @type {number} */
  let _jackpot       = /** @type {number} */ (State.get('jackpot'))       || CONFIG.JACKPOT_SEED;
  /** @type {number} */
  let _pityMeter     = /** @type {number} */ (State.get('pityMeter'))     || 0;

  // ── Public API ─────────────────────────────────────────────────────
  return {
    SYMBOLS,
    REELS,
    REEL_SIZE:  CONFIG.REEL_SIZE,
    REEL_COUNT: CONFIG.REEL_COUNT,
    CONFIG,

    /** @returns {number} Current jackpot value. */
    get jackpot()       { return _jackpot; },
    /** @returns {number} Cumulative lifetime winnings. */
    get totalWinnings() { return _totalWinnings; },
    /** @returns {number} Total spins across all sessions. */
    get spinCount()     { return _spinCount; },
    /** @returns {number} Current pity meter value. */
    get pityMeter()     { return _pityMeter; },

    /**
     * Spin all reels and resolve the centre-row payline.
     * @description
     *   1. Increments `spinCount` and grows the jackpot by a fraction of bet.
     *   2. If `_pityMeter >= PITY_THRESHOLD`, applies the pity nudge (forces
     *      reel 1 to match reel 0) and resets `_pityMeter` to 0 — regardless
     *      of whether the resulting spin pays out. This prevents double-counting
     *      when the forced symbol has no TWO-multiplier (e.g. jackpot × jackpot).
     *   3. Resolves the payline and updates all persistent counters.
     * @param {number} bet - Bet amount in dollars.
     * @returns {{
     *   stops: number[],
     *   symbols: string[],
     *   payout: number,
     *   type: string,
     *   nearMiss: boolean,
     *   pityTriggered: boolean,
     *   jackpotAmount?: number
     * }} Spin result.
     */
    spin(bet) {
      _spinCount += 1;
      State.set('spinCount', _spinCount);

      // Grow the jackpot pool.
      _jackpot += bet * CONFIG.JACKPOT_FRACTION;

      // Pick reel stops.
      let stops         = REELS.map(reel => RNG.randInt(0, reel.length - 1));
      let pityTriggered = false;

      if (_pityMeter >= CONFIG.PITY_THRESHOLD) {
        stops         = this._applyPity(stops);
        pityTriggered = true;
        // Increment the persistent pity counter exactly once.
        State.increment('playerStats.pityTriggers', 1);
        // BUG FIX (Iteration 09): reset pityMeter immediately so the mechanic
        // cannot fire again on the very next spin if this spin's payout is 0
        // (which can happen when the forced symbol has no TWO-multiplier, e.g.
        // jackpot+jackpot). In Iteration 08 the reset only happened on a
        // non-zero payout, causing pityTriggers to increment twice.
        _pityMeter = 0;
      }

      const syms   = stops.map((stop, i) => REELS[i][stop]);
      const result = this._resolve(syms, bet);

      // Book-keeping (pityMeter was already reset above if pity fired).
      if (result.payout > 0) {
        _totalWinnings += result.payout;

        if (result.type === 'jackpot') {
          const jpWin          = Math.floor(_jackpot);
          _totalWinnings      += jpWin;
          result.payout       += jpWin;
          result.jackpotAmount = jpWin;
          _jackpot             = CONFIG.JACKPOT_SEED;
        }
      } else if (!pityTriggered) {
        // Only grow pityMeter on a genuine loss (not after a pity reset).
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
     *   looks up the multiplier table. Also flags a near-miss when
     *   `CONFIG.NEAR_MISS_HIGHS` high-value symbols appear anywhere on the line.
     * @param {string[]} syms - The five centre-row symbol ids.
     * @param {number}   bet  - Bet amount in dollars.
     * @returns {{payout:number, type:string, nearMiss:boolean}} Resolution.
     */
    _resolve(syms, bet) {
      const anchor = syms[0];

      let matchCount = 1;
      for (let i = 1; i < syms.length; i++) {
        if (syms[i] === anchor) matchCount++;
        else break;
      }

      if (matchCount === 5) {
        if (anchor === 'jackpot') return { payout: 0, type: 'jackpot', nearMiss: false };
        const mult = CONFIG.PAYOUTS.FIVE[anchor] || 1;
        return { payout: +(bet * mult).toFixed(2), type: 'five', nearMiss: false };
      }
      if (matchCount === 4) {
        const mult = CONFIG.PAYOUTS.FOUR[anchor] || 0;
        if (mult) return { payout: +(bet * mult).toFixed(2), type: 'four', nearMiss: false };
      }
      if (matchCount === 3) {
        if (anchor === 'jackpot') return { payout: 0, type: 'jackpot', nearMiss: false };
        const mult = CONFIG.PAYOUTS.THREE[anchor] || 0;
        if (mult) return { payout: +(bet * mult).toFixed(2), type: 'three', nearMiss: false };
      }
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
     * Pity nudge: force reel 1 to match reel 0, guaranteeing ≥ 2-of-a-kind.
     * @description Selects the stop on reel 1 closest to the random stop already
     *   chosen, minimising visible disruption to the animation trajectory.
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
     * @returns {{id:string,label:string,weight:number}|undefined}
     */
    getSymbolById(id) {
      return SYMBOLS.find(s => s.id === id);
    },

    /**
     * Format a number as US-dollar currency.
     * @param {number} n - Amount.
     * @returns {string} e.g. `$1,234.56`.
     */
    formatMoney(n) {
      return '$' + n.toLocaleString('en-US', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });
    },
  };
})();

Object.freeze(GameLogic);
