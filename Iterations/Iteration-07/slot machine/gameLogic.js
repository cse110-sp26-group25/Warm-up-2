/**
 * gameLogic.js — Payout math, reel configuration, spin resolution.
 * RTP target ~92%. Pity mechanic after 20 dry spins. Jackpot snowball.
 */
const GameLogic = (() => {

  // ── Symbol definitions ───────────────────────────────────────────────
  // id: internal key, label: display name, weight: reel frequency (lower = rarer)
  const SYMBOLS = [
    { id: 'jackpot',  label: 'JACKPOT',  weight: 1  },
    { id: 'seven',    label: '7',        weight: 3  },
    { id: 'gear',     label: 'GEAR',     weight: 6  },
    { id: 'bolt',     label: 'BOLT',     weight: 10 },
    { id: 'chip',     label: 'CHIP',     weight: 14 },
    { id: 'robo',     label: 'ROBO',     weight: 18 },
    { id: 'nut',      label: 'NUT',      weight: 22 },
    { id: 'screw',    label: 'SCREW',    weight: 26 },
  ];

  // ── Payout table: multipliers applied to bet amount ──────────────────
  // Left-to-right consecutive match on center row; more matches = more pay.
  const PAYOUTS_5 = {
    jackpot: 0,        // special: pays jackpot pool
    seven:   500,
    gear:    150,
    bolt:    75,
    chip:    40,
    robo:    25,
    nut:     12,
    screw:   7,
  };
  const PAYOUTS_4 = {
    seven:   100,
    gear:    30,
    bolt:    15,
    chip:    8,
    robo:    5,
    nut:     2.5,
    screw:   1.5,
  };
  const PAYOUTS_3 = {
    jackpot: 0,
    seven:   200,
    gear:    50,
    bolt:    25,
    chip:    15,
    robo:    10,
    nut:     5,
    screw:   3,
  };
  const PAYOUTS_2 = {
    seven:   10,
    gear:    5,
    bolt:    3,
    chip:    2,
    robo:    1.5,
    nut:     1,
    screw:   0.5,
  };

  // ── Reel strip: each reel is built from weighted symbol pool ─────────
  const REEL_SIZE  = 32; // symbols per reel strip
  const REEL_COUNT = 5;  // number of reels (columns in the 3×5 grid)

  function _buildReel() {
    const pool = [];
    for (const sym of SYMBOLS) {
      for (let i = 0; i < sym.weight; i++) pool.push(sym.id);
    }
    // Shuffle for distribution
    const strip = [];
    for (let i = 0; i < REEL_SIZE; i++) strip.push(RNG.pick(pool));
    return strip;
  }

  // Five reels (columns), each rebuilt once per session
  const REELS = Array.from({ length: REEL_COUNT }, _buildReel);

  // ── Game state ───────────────────────────────────────────────────────
  let _jackpot         = 1000;
  let _totalWinnings   = 0;
  let _spinCount       = 0;
  let _lastDrySpins    = 0;  // consecutive non-wins
  const PITY_THRESHOLD = 20; // force small win after this many dry spins

  // ── Public API ────────────────────────────────────────────────────────
  return {
    SYMBOLS,
    REELS,
    REEL_SIZE,
    REEL_COUNT,

    get jackpot()       { return _jackpot; },
    get totalWinnings() { return _totalWinnings; },
    get spinCount()     { return _spinCount; },

    /**
     * Spin all five reels and resolve the center-row payline.
     * @param {number} bet - Bet amount in dollars.
     * @returns {{ stops: number[], symbols: string[], payout: number, type: string, nearMiss: boolean }} Spin result.
     */
    spin(bet) {
      _spinCount++;

      // Grow jackpot by a fraction of every bet
      _jackpot += bet * 0.05;

      // Pick stop positions for each reel
      let stops = REELS.map(reel => RNG.randInt(0, reel.length - 1));

      // Pity override: if too many dry spins, nudge for a small win
      if (_lastDrySpins >= PITY_THRESHOLD) {
        stops = this._applyPity(stops);
      }

      const syms = stops.map((stop, i) => REELS[i][stop]);
      const result = this._resolve(syms, bet);

      if (result.payout > 0) {
        _lastDrySpins = 0;
        _totalWinnings += result.payout;
        if (result.type === 'jackpot') {
          const jpWin = Math.floor(_jackpot);
          _totalWinnings += jpWin;
          result.payout += jpWin;
          result.jackpotAmount = jpWin;
          _jackpot = 1000; // reset
        }
      } else {
        _lastDrySpins++;
      }

      return { stops, symbols: syms, ...result };
    },

    /**
     * Resolve the center-row payline for 5 reels.
     * Counts consecutive left-to-right matches; 5→4→3→2 match tiers.
     * @param {string[]} syms - Array of 5 center-row symbol IDs.
     * @param {number}   bet  - Bet amount in dollars.
     * @returns {{ payout: number, type: string, nearMiss: boolean }} Resolution.
     */
    _resolve(syms, bet) {
      const anchor = syms[0];

      // Count consecutive matches from the leftmost reel
      let matchCount = 1;
      for (let i = 1; i < syms.length; i++) {
        if (syms[i] === anchor) matchCount++;
        else break;
      }

      // 5-of-a-kind
      if (matchCount === 5) {
        if (anchor === 'jackpot') return { payout: 0, type: 'jackpot', nearMiss: false };
        const mult = PAYOUTS_5[anchor] || 1;
        return { payout: +(bet * mult).toFixed(2), type: 'five', nearMiss: false };
      }

      // 4-of-a-kind
      if (matchCount === 4) {
        const mult = PAYOUTS_4[anchor] || 0;
        if (mult) return { payout: +(bet * mult).toFixed(2), type: 'four', nearMiss: false };
      }

      // 3-of-a-kind
      if (matchCount === 3) {
        if (anchor === 'jackpot') return { payout: 0, type: 'jackpot', nearMiss: false };
        const mult = PAYOUTS_3[anchor] || 0;
        if (mult) return { payout: +(bet * mult).toFixed(2), type: 'three', nearMiss: false };
      }

      // 2-of-a-kind from left
      if (matchCount === 2) {
        const mult = PAYOUTS_2[anchor] || 0;
        if (mult) return { payout: +(bet * mult).toFixed(2), type: 'two', nearMiss: false };
      }

      // Near miss: two or more jackpot/seven symbols anywhere on the line
      const highCount = syms.filter(s => s === 'jackpot' || s === 'seven').length;
      if (highCount >= 2) {
        return { payout: 0, type: 'loss', nearMiss: true };
      }

      return { payout: 0, type: 'loss', nearMiss: false };
    },

    /**
     * Pity nudge: force reel 1 to match reel 0 for a guaranteed 2-of-a-kind.
     * @param {number[]} stops - Current stop indices for all reels.
     * @returns {number[]} Adjusted stop indices.
     */
    _applyPity(stops) {
      const nudged = [...stops];
      const targetSym = REELS[0][nudged[0]];
      // Find nearest occurrence of targetSym on reel 1
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

    /** Grow jackpot externally (e.g., from simulated leaderboard bets) */
    growJackpot(amount) {
      _jackpot += amount;
    },

    getSymbolById(id) {
      return SYMBOLS.find(s => s.id === id);
    },

    formatMoney(n) {
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };
})();

Object.freeze(GameLogic);
