/**
 * gameLogic.js — Core Game Engine
 *
 * Owns all canonical game state and mathematical logic:
 *   • 3 rows × 5 columns reel grid
 *   • 9 configurable paylines
 *   • Weighted symbol pool with payout table
 *   • 7 configurable bet amounts
 *   • Progressive jackpot with 3% rake per spin
 *   • Win-tier classification (normal / big / mega / jackpot)
 *   • Leaderboard persistence via localStorage
 *   • Avatar + player-name management
 *
 * All state lives in the IIFE closure. The frozen public API is the only
 * interface other modules may use — nothing inside can be read or mutated
 * from the browser console.
 *
 * Depends on: rng.js (must be loaded first)
 */
const GameLogic = (() => {
  'use strict';

  // ─── Symbol Definitions ─────────────────────────────────────────────────────
  // weight: relative draw probability (higher = more common)
  // payouts: multiplier applied to bet for 3, 4, or 5 consecutive matches
  // wild: substitutes for any non-wild symbol when matching from the left
  const SYMBOLS = [
    { id: 'cherry',  emoji: '🍒', name: 'Cherry',  weight: 22, wild: false,
      payouts: { 3: 4,   4: 12,   5: 40   } },
    { id: 'lemon',   emoji: '🍋', name: 'Lemon',   weight: 18, wild: false,
      payouts: { 3: 6,   4: 18,   5: 55   } },
    { id: 'orange',  emoji: '🍊', name: 'Orange',  weight: 15, wild: false,
      payouts: { 3: 8,   4: 22,   5: 70   } },
    { id: 'grape',   emoji: '🍇', name: 'Grape',   weight: 12, wild: false,
      payouts: { 3: 12,  4: 30,   5: 90   } },
    { id: 'bell',    emoji: '🔔', name: 'Bell',    weight: 9,  wild: false,
      payouts: { 3: 18,  4: 45,   5: 130  } },
    { id: 'diamond', emoji: '💎', name: 'Diamond', weight: 5,  wild: false,
      payouts: { 3: 40,  4: 100,  5: 300  } },
    { id: 'seven',   emoji: '7️⃣', name: 'Lucky 7', weight: 2,  wild: false,
      payouts: { 3: 80,  4: 200,  5: 600  } },
    { id: 'robot',   emoji: '🤖', name: 'Robot',   weight: 1,  wild: true,
      payouts: { 3: 150, 4: 400,  5: 1500 } },
  ];

  const SYMBOL_POOL = SYMBOLS.map(s => ({ value: s.id, weight: s.weight }));
  const SYMBOL_MAP  = Object.fromEntries(SYMBOLS.map(s => [s.id, s]));
  const WILD_ID     = SYMBOLS.find(s => s.wild).id;  // 'robot'

  // ─── Paylines (3 rows × 5 cols) ─────────────────────────────────────────────
  // pattern[col] = which row index (0=top, 1=mid, 2=bot) to read for that column
  const PAYLINES = [
    { id: 0, pattern: [1, 1, 1, 1, 1], name: 'Middle Row',  color: '#ffd60a' },
    { id: 1, pattern: [0, 0, 0, 0, 0], name: 'Top Row',     color: '#ff6b6b' },
    { id: 2, pattern: [2, 2, 2, 2, 2], name: 'Bottom Row',  color: '#06ffa5' },
    { id: 3, pattern: [2, 1, 0, 1, 2], name: 'V Shape',     color: '#00b4d8' },
    { id: 4, pattern: [0, 1, 2, 1, 0], name: '∧ Shape',     color: '#c77dff' },
    { id: 5, pattern: [0, 0, 1, 2, 2], name: 'Stair Down',  color: '#ff9f43' },
    { id: 6, pattern: [2, 2, 1, 0, 0], name: 'Stair Up',    color: '#a8e063' },
    { id: 7, pattern: [1, 0, 0, 0, 1], name: 'Top U',       color: '#ff78c4' },
    { id: 8, pattern: [1, 2, 2, 2, 1], name: 'Bottom U',    color: '#56cfe1' },
  ];

  // ─── Constants ───────────────────────────────────────────────────────────────
  const BET_OPTIONS      = [5, 10, 25, 50, 100, 250, 500];
  const ROWS             = 3;
  const COLS             = 5;
  const STARTING_BALANCE = 1000;
  const JACKPOT_SEED     = 5000;
  const JACKPOT_RAKE     = 0.03;   // 3% of each bet feeds the jackpot
  const BIG_WIN_MULT     = 25;     // totalWin ≥ 25× bet → big win
  const MEGA_WIN_MULT    = 100;    // totalWin ≥ 100× bet → mega win

  // ─── Avatars ─────────────────────────────────────────────────────────────────
  const AVATARS = [
    { id: 'robo1', emoji: '🤖', name: 'Rusty',   color: '#7c83fd' },
    { id: 'robo2', emoji: '👾', name: 'Glitch',   color: '#ff6b35' },
    { id: 'robo3', emoji: '🦾', name: 'Titan',    color: '#06ffa5' },
    { id: 'robo4', emoji: '🎮', name: 'Gamer-X',  color: '#ffd60a' },
    { id: 'robo5', emoji: '🚀', name: 'Astro',    color: '#00b4d8' },
    { id: 'robo6', emoji: '⚡', name: 'Zapper',   color: '#ff78c4' },
    { id: 'robo7', emoji: '🔮', name: 'Oracle',   color: '#c77dff' },
    { id: 'robo8', emoji: '💫', name: 'Nova',     color: '#a8e063' },
  ];

  // ─── Mutable State (private) ──────────────────────────────────────────────────
  let _state = {
    balance:      STARTING_BALANCE,
    currentBet:   10,
    jackpot:      JACKPOT_SEED,
    totalSpins:   0,
    totalWon:     0,
    totalWagered: 0,
    biggestWin:   0,
    winStreak:    0,
    isSpinning:   false,
    playerName:   'Player',
    avatarId:     null,
  };

  // ─── Spin ────────────────────────────────────────────────────────────────────

  /**
   * Execute one full spin:
   *  1. Validate state and balance
   *  2. Deduct bet, grow jackpot
   *  3. Generate 3×5 grid via RNG
   *  4. Evaluate all 9 paylines
   *  5. Check dedicated jackpot condition (5 robots on middle row)
   *  6. Update state and return a complete result object
   *
   * Returns null if already spinning.
   * Returns { error: 'insufficient_balance' } if balance too low.
   */
  function spin() {
    if (_state.isSpinning) return null;

    const bet = _state.currentBet;
    if (bet > _state.balance) return { error: 'insufficient_balance' };

    _state.isSpinning    = true;
    _state.balance      -= bet;
    _state.totalWagered += bet;
    _state.totalSpins++;
    _state.jackpot      += bet * JACKPOT_RAKE;

    // Generate the grid (all randomness happens here, in one contained call)
    const rawGrid     = RNG.generateGrid(ROWS, COLS, SYMBOL_POOL);
    const displayGrid = rawGrid.map(row => row.map(id => SYMBOL_MAP[id]?.emoji ?? '?'));

    // Evaluate every payline
    const allLineResults = PAYLINES.map(pl => _evaluateLine(pl, rawGrid));
    let totalWin  = 0;
    const winLines = [];

    for (const res of allLineResults) {
      if (res.win > 0) {
        const lineWin = Math.floor(res.win * bet);
        totalWin     += lineWin;
        winLines.push({ ...res, lineWin });
      }
    }

    // Jackpot: 5 robots on the middle row (row index 1), regardless of payline
    const middleRow   = rawGrid[1];
    const isJackpot   = middleRow.every(id => id === WILD_ID);
    let jackpotAmount = 0;
    if (isJackpot) {
      jackpotAmount    = Math.floor(_state.jackpot);
      totalWin        += jackpotAmount;
      _state.jackpot   = JACKPOT_SEED;
    }

    // Apply winnings
    _state.balance  += totalWin;
    _state.totalWon += totalWin;
    if (totalWin > _state.biggestWin) _state.biggestWin = totalWin;
    _state.winStreak = totalWin > 0 ? _state.winStreak + 1 : 0;
    _state.isSpinning = false;

    // Classify win tier for UI feedback
    let winTier = 'none';
    if (isJackpot)                          winTier = 'jackpot';
    else if (totalWin >= bet * MEGA_WIN_MULT) winTier = 'mega';
    else if (totalWin >= bet * BIG_WIN_MULT)  winTier = 'big';
    else if (totalWin > 0)                  winTier = 'normal';

    return {
      grid: displayGrid,
      rawGrid,
      winLines,
      totalWin,
      jackpotAmount,
      isJackpot,
      winTier,
      bet,
      balance: _state.balance,
    };
  }

  // ─── Payline Evaluation ───────────────────────────────────────────────────────

  /**
   * Check a single payline for a left-to-right consecutive match.
   * Wilds substitute for any non-wild symbol.
   * Minimum match length is 3 to earn a payout.
   *
   * @param {{id, pattern, name, color}} payline
   * @param {string[][]} rawGrid
   * @returns {{ payline, symbolId, symbol, count, win, cellPositions }}
   */
  function _evaluateLine(payline, rawGrid) {
    const cells = payline.pattern.map((row, col) => rawGrid[row][col]);

    // Resolve the "anchor" symbol — first non-wild from the left (or wild if all wilds)
    let baseId = null;
    for (const id of cells) {
      if (id !== WILD_ID) { baseId = id; break; }
    }
    if (baseId === null) baseId = WILD_ID; // All five are wilds

    // Count unbroken run from column 0 (wilds count for anything)
    let count = 0;
    for (const id of cells) {
      if (id === baseId || id === WILD_ID) count++;
      else break;
    }

    if (count < 3) {
      return { payline, symbolId: null, symbol: null, count: 0, win: 0, cellPositions: [] };
    }

    const symbol       = SYMBOL_MAP[baseId];
    const win          = symbol?.payouts?.[count] ?? 0;
    const cellPositions = payline.pattern.slice(0, count).map((row, col) => ({ row, col }));

    return { payline, symbolId: baseId, symbol, count, win, cellPositions };
  }

  // ─── Bet Management ──────────────────────────────────────────────────────────

  function setBet(amount) {
    if (BET_OPTIONS.includes(amount)) { _state.currentBet = amount; return true; }
    return false;
  }

  function increaseBet() {
    const idx = BET_OPTIONS.indexOf(_state.currentBet);
    if (idx < BET_OPTIONS.length - 1) _state.currentBet = BET_OPTIONS[idx + 1];
  }

  function decreaseBet() {
    const idx = BET_OPTIONS.indexOf(_state.currentBet);
    if (idx > 0) _state.currentBet = BET_OPTIONS[idx - 1];
  }

  // ─── Player / Avatar ──────────────────────────────────────────────────────────

  function setPlayerName(name) {
    const clean = String(name).trim().slice(0, 20);
    _state.playerName = clean || 'Player';
  }

  function setAvatar(id) {
    if (AVATARS.some(a => a.id === id)) _state.avatarId = id;
  }

  function getAvatarById(id) {
    return AVATARS.find(a => a.id === id) ?? AVATARS[0];
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────────

  const _LB_KEY = 'roboSlots_v2_leaderboard';

  function getLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem(_LB_KEY) ?? '[]');
    } catch { return []; }
  }

  /**
   * Write current session stats to the top-20 leaderboard in localStorage.
   * Noop if no spins have been made (nothing worth saving).
   * Returns the updated leaderboard array.
   */
  function saveScore() {
    if (_state.totalSpins === 0) return getLeaderboard();

    const entry = {
      name:       _state.playerName,
      avatarId:   _state.avatarId,
      totalSpins: _state.totalSpins,
      totalWon:   _state.totalWon,
      biggestWin: _state.biggestWin,
      netProfit:  _state.balance - STARTING_BALANCE,
      timestamp:  Date.now(),
    };

    const board = getLeaderboard();
    board.push(entry);
    board.sort((a, b) => b.totalWon - a.totalWon);
    const top20 = board.slice(0, 20);

    try { localStorage.setItem(_LB_KEY, JSON.stringify(top20)); } catch { /* storage full */ }
    return top20;
  }

  function resetSession() {
    _state.balance      = STARTING_BALANCE;
    _state.totalSpins   = 0;
    _state.totalWon     = 0;
    _state.totalWagered = 0;
    _state.biggestWin   = 0;
    _state.winStreak    = 0;
    _state.jackpot      = JACKPOT_SEED;
    _state.isSpinning   = false;
  }

  // ─── Read-only Getters ────────────────────────────────────────────────────────
  // Spread/slice copies prevent external mutation of internal state

  function getState()      { return { ..._state }; }
  function getSymbols()    { return [...SYMBOLS]; }
  function getPaylines()   { return [...PAYLINES]; }
  function getBetOptions() { return [...BET_OPTIONS]; }
  function getAvatars()    { return [...AVATARS]; }
  function getConstants()  {
    return { ROWS, COLS, STARTING_BALANCE, JACKPOT_SEED, BIG_WIN_MULT, MEGA_WIN_MULT };
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  return Object.freeze({
    spin,
    setBet, increaseBet, decreaseBet,
    setPlayerName, setAvatar, getAvatarById,
    saveScore, getLeaderboard, resetSession,
    getState, getSymbols, getPaylines, getBetOptions, getAvatars, getConstants,
  });
})();
