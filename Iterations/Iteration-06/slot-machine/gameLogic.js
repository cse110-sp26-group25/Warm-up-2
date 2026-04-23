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
  // Three-of-a-kind pays, two-of-a-kind pays less
  const PAYOUTS_3 = {
    jackpot: 0,       // special: pays jackpot pool
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
  const REEL_SIZE = 32; // symbols per reel strip

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

  // Three reels, each rebuilt once per session
  const REELS = [_buildReel(), _buildReel(), _buildReel()];

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

    get jackpot()       { return _jackpot; },
    get totalWinnings() { return _totalWinnings; },
    get spinCount()     { return _spinCount; },

    /**
     * Spin all three reels and resolve the outcome.
     * @param {number} bet - bet amount in dollars
     * @returns {object} { stops, symbols, payout, type, nearMiss }
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
     * Resolve payline: detect three-of-a-kind, two-of-a-kind, near-miss.
     */
    _resolve(syms, bet) {
      const [a, b, c] = syms;

      // Three of a kind
      if (a === b && b === c) {
        if (a === 'jackpot') return { payout: 0, type: 'jackpot', nearMiss: false };
        const mult = PAYOUTS_3[a] || 1;
        return { payout: +(bet * mult).toFixed(2), type: 'three', nearMiss: false };
      }

      // Two of a kind
      const pairs = [[a,b],[b,c],[a,c]];
      for (const [x, y] of pairs) {
        if (x === y && PAYOUTS_2[x]) {
          return { payout: +(bet * PAYOUTS_2[x]).toFixed(2), type: 'two', nearMiss: false };
        }
      }

      // Near miss: two jackpots or two sevens that didn't align
      const highCount = syms.filter(s => s === 'jackpot' || s === 'seven').length;
      if (highCount >= 2) {
        return { payout: 0, type: 'loss', nearMiss: true };
      }

      return { payout: 0, type: 'loss', nearMiss: false };
    },

    /**
     * Pity: nudge one reel to match another for a minimal win.
     */
    _applyPity(stops) {
      const nudged = [...stops];
      // Find a low-value symbol on reel 0, then match it on reel 2
      const targetSym = REELS[0][nudged[0]];
      // Find the nearest occurrence of that symbol on reel 2
      let best = -1, bestDist = Infinity;
      for (let i = 0; i < REELS[2].length; i++) {
        if (REELS[2][i] === targetSym) {
          const dist = Math.abs(i - nudged[2]);
          if (dist < bestDist) { bestDist = dist; best = i; }
        }
      }
      if (best !== -1) nudged[2] = best;
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
