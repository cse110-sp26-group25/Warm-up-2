/**
 * gameLogic.js — Core game state, symbols, paylines, win calculation,
 * pity system, and jackpot management.
 */

'use strict';

/* ============================================================
   CONFIGURATION — no magic numbers beyond this block
   ============================================================ */
const CONFIG = Object.freeze({
  INITIAL_CREDITS:     1000,
  MIN_BET:             5,
  MAX_BET:             100,
  BET_STEP:            5,
  BET_OPTIONS:         [5, 10, 25, 50, 100],
  DEFAULT_BET:         10,

  REELS:               3,
  ROWS:                3,           // visible rows per reel; middle row = payline

  JACKPOT_SEED:        10000,       // starting jackpot value
  JACKPOT_CONTRIB:     0.02,        // fraction of each bet added to jackpot

  PITY_THRESHOLD:      12,          // consecutive losses before pity activates
  PITY_BONUS_CREDITS:  5,           // credits awarded by pity trigger (≈½ min bet)

  SPIN_STOP_DELAY:     400,         // ms between each reel stopping
  SPIN_BASE_DURATION:  1200,        // ms for first reel to stop

  // Win classification thresholds (× bet)
  WIN_TIER_SMALL:      4,
  WIN_TIER_BIG:        15,
  WIN_TIER_MEGA:       40,
});

/* ============================================================
   SYMBOL DEFINITIONS
   weight     — relative frequency on any reel position
   payouts    — { matchCount: payoutMultiplier } for main payline
                'JACKPOT' as a value triggers the progressive jackpot
   ============================================================ */
const SYMBOLS = Object.freeze([
  { id: 'CHERRY',  emoji: '🍒', label: 'Cherry',  weight: 36, payouts: { 2: 1.5, 3: 4  } },
  { id: 'LEMON',   emoji: '🍋', label: 'Lemon',   weight: 28, payouts: {         3: 5  } },
  { id: 'ORANGE',  emoji: '🍊', label: 'Orange',  weight: 22, payouts: {         3: 7  } },
  { id: 'GRAPE',   emoji: '🍇', label: 'Grape',   weight: 16, payouts: {         3: 10 } },
  { id: 'BELL',    emoji: '🔔', label: 'Bell',    weight: 10, payouts: {         3: 16 } },
  { id: 'DIAMOND', emoji: '💎', label: 'Diamond', weight: 5,  payouts: {         3: 30 } },
  { id: 'STAR',    emoji: '⭐', label: 'Star',    weight: 3,  payouts: {         3: 60 } },
  { id: 'SEVEN',   emoji: '🎰', label: 'Seven',   weight: 2,  payouts: {         3: 'JACKPOT' } },
]);

const SYMBOL_IDS    = SYMBOLS.map(s => s.id);
const SYMBOL_LOOKUP = Object.fromEntries(SYMBOLS.map(s => [s.id, s]));
const SYMBOL_WEIGHTS = SYMBOLS.map(s => s.weight);

/* ============================================================
   GAME STATE
   ============================================================ */
const GameState = {
  credits:           CONFIG.INITIAL_CREDITS,
  bet:               CONFIG.DEFAULT_BET,
  jackpot:           CONFIG.JACKPOT_SEED,
  isSpinning:        false,

  // 3D array: reelResults[reel][row] = symbolId
  reelResults:       Array.from({ length: CONFIG.REELS }, () => Array(CONFIG.ROWS).fill('CHERRY')),
  lastWin:           0,

  consecutiveLosses: 0,
  autoSpinsLeft:     0,

  session: {
    spins:      0,
    totalWon:   0,
    biggestWin: 0,
    wins:       0,
  },
};

/* ============================================================
   SYMBOL HELPERS
   ============================================================ */

/** Draw a random symbol using weighted distribution. */
function drawSymbol() {
  return RNG.weightedPick(SYMBOL_IDS, SYMBOL_WEIGHTS);
}

/**
 * Draw a complete set of reel results.
 * Returns a 2-D array [reel][row].
 * @param {boolean} [forcePity=false] — nudge results toward a small win
 */
function drawReels(forcePity = false) {
  const results = [];

  for (let r = 0; r < CONFIG.REELS; r++) {
    const col = [];
    for (let row = 0; row < CONFIG.ROWS; row++) {
      col.push(drawSymbol());
    }
    results.push(col);
  }

  if (forcePity) {
    // Guarantee at least 2 cherries on the main (middle) payline
    results[0][1] = 'CHERRY';
    results[1][1] = 'CHERRY';
    // Third reel stays random — if it's also cherry the player gets 4× bet
  }

  return results;
}

/* ============================================================
   WIN CALCULATION
   ============================================================ */

/**
 * Evaluate a single payline (array of symbolIds, length = REELS).
 * Returns { symbolId, count, multiplier } or null if no win.
 */
function evaluatePayline(line) {
  const first = line[0];
  let count = 1;

  for (let i = 1; i < line.length; i++) {
    if (line[i] === first) count++;
    else break;
  }

  const sym = SYMBOL_LOOKUP[first];
  const mult = sym.payouts[count];
  if (!mult) return null;

  return { symbolId: first, count, multiplier: mult };
}

/**
 * Evaluate all paylines from a full reel result set.
 * We check three horizontal rows: top (row 0), middle (row 1), bottom (row 2).
 *
 * @param {string[][]} reelResults — [reel][row]
 * @returns {{ paylineWins: Array, totalMultiplier: number, isJackpot: boolean }}
 */
function evaluateAllPaylines(reelResults) {
  const paylineWins = [];
  let totalMultiplier = 0;
  let isJackpot = false;

  for (let row = 0; row < CONFIG.ROWS; row++) {
    const line = reelResults.map(reel => reel[row]);
    const result = evaluatePayline(line);
    if (!result) continue;

    if (result.multiplier === 'JACKPOT') {
      isJackpot = true;
      paylineWins.push({ row, ...result, payout: GameState.jackpot });
    } else {
      paylineWins.push({ row, ...result, payout: Math.floor(result.multiplier * GameState.bet) });
      totalMultiplier += result.multiplier;
    }
  }

  const cashPayout = Math.floor(totalMultiplier * GameState.bet);
  return { paylineWins, cashPayout, isJackpot };
}

/* ============================================================
   WIN CLASSIFICATION
   ============================================================ */

/**
 * Classify a win amount relative to bet.
 * @returns {'jackpot'|'mega'|'big'|'small'|'pity'|'none'}
 */
function classifyWin(amount, isJackpot) {
  if (isJackpot) return 'jackpot';
  const mult = amount / GameState.bet;
  if (mult >= CONFIG.WIN_TIER_MEGA)  return 'mega';
  if (mult >= CONFIG.WIN_TIER_BIG)   return 'big';
  if (mult >= CONFIG.WIN_TIER_SMALL) return 'small';
  if (amount > 0)                    return 'pity';
  return 'none';
}

/* ============================================================
   MAIN SPIN LOGIC
   ============================================================ */

/**
 * Execute a complete spin cycle.
 * Deducts bet, draws reels, evaluates wins, updates state.
 *
 * @returns {{
 *   reelResults: string[][],
 *   paylineWins: Array,
 *   cashPayout:  number,
 *   isJackpot:   boolean,
 *   winType:     string,
 *   pityCredited: boolean,
 * }}
 */
function spin() {
  if (GameState.isSpinning) return null;
  if (GameState.credits < GameState.bet) return null;

  GameState.isSpinning = true;

  // Deduct bet & grow jackpot
  GameState.credits -= GameState.bet;
  GameState.jackpot += Math.floor(GameState.bet * CONFIG.JACKPOT_CONTRIB);

  GameState.session.spins++;

  // Pity system: after threshold consecutive losses, force a small win next spin
  const shouldPity = GameState.consecutiveLosses >= CONFIG.PITY_THRESHOLD;
  const results = drawReels(shouldPity);

  GameState.reelResults = results;

  const { paylineWins, cashPayout, isJackpot } = evaluateAllPaylines(results);

  let totalPayout = cashPayout;
  let pityCredited = false;

  if (isJackpot) {
    totalPayout = GameState.jackpot;
    GameState.jackpot = CONFIG.JACKPOT_SEED; // reset jackpot
  }

  if (totalPayout > 0) {
    GameState.credits += totalPayout;
    GameState.lastWin = totalPayout;
    GameState.session.wins++;
    GameState.session.totalWon += totalPayout;
    GameState.session.biggestWin = Math.max(GameState.session.biggestWin, totalPayout);
    GameState.consecutiveLosses = 0;
  } else {
    GameState.lastWin = 0;
    GameState.consecutiveLosses++;

    // Pity credit: small consolation on long losing streaks, without forcing a win
    if (GameState.consecutiveLosses > CONFIG.PITY_THRESHOLD) {
      GameState.credits += CONFIG.PITY_BONUS_CREDITS;
      pityCredited = true;
      // Don't reset counter — let pity keep triggering sparsely
    }
  }

  const winType = classifyWin(totalPayout, isJackpot);

  GameState.isSpinning = false;

  return { reelResults: results, paylineWins, cashPayout: totalPayout, isJackpot, winType, pityCredited };
}

/* ============================================================
   BET MANAGEMENT
   ============================================================ */

function increaseBet() {
  const idx = CONFIG.BET_OPTIONS.indexOf(GameState.bet);
  if (idx < CONFIG.BET_OPTIONS.length - 1) {
    GameState.bet = CONFIG.BET_OPTIONS[idx + 1];
  }
}

function decreaseBet() {
  const idx = CONFIG.BET_OPTIONS.indexOf(GameState.bet);
  if (idx > 0) {
    GameState.bet = CONFIG.BET_OPTIONS[idx - 1];
  }
}

function setMaxBet() {
  GameState.bet = CONFIG.MAX_BET;
}

/* ============================================================
   SESSION HELPERS
   ============================================================ */

function getWinRate() {
  if (GameState.session.spins === 0) return 0;
  return (GameState.session.wins / GameState.session.spins) * 100;
}

function resetSession() {
  Object.assign(GameState.session, { spins: 0, totalWon: 0, biggestWin: 0, wins: 0 });
  GameState.consecutiveLosses = 0;
  GameState.lastWin = 0;
}
