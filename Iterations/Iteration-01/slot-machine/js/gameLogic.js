/**
 * gameLogic.js — Core Game Engine
 *
 * Responsible for all mathematical game mechanics:
 *  • Processing spin outcomes from the RNG
 *  • Calculating payouts based on bet type and outcome table
 *  • Managing balance, jackpot, and pity system
 *  • Determining reel symbol display (visual mapping of outcomes)
 *  • Coordinating module callbacks after each spin resolves
 *
 * ARCHITECTURE
 * ─────────────
 * GameLogic owns the canonical game state. All other modules (UI, Audio,
 * Stats, Quests, Achievements) receive notification via the resolve()
 * callback chain — they never write to game state directly.
 *
 * PAYOUT SYSTEM OVERVIEW
 * ───────────────────────
 * Outcomes are determined by rolling a 0–999 integer (via SecureRNG) and
 * looking it up in CONFIG.OUTCOME_TABLE. The table is designed for ~88–92%
 * RTP after jackpot contribution. The visual reel display is then set to
 * match the pre-determined outcome (real slot machine firmware works the
 * same way).
 *
 * NEAR-MISS
 * ──────────
 * When outcome type is "near_miss", the centre reel shows 2 matching symbols
 * on the payline with the 3rd either offset by one row or showing a
 * different symbol. Cosmetically convincing; mathematically still a loss.
 *
 * PITY SYSTEM
 * ────────────
 * After CONFIG.PITY_LOSS_THRESHOLD consecutive net losses the next spin
 * is guaranteed to resolve to a win of at least CONFIG.PITY_MIN_PAYOUT×bet,
 * regardless of the RNG roll. This prevents crushingly long losing streaks
 * while maintaining the overall house edge (pity events are rare enough that
 * they do not materially affect the RTP).
 *
 * @module GameLogic
 */

const GameLogic = (() => {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────────────
  let _balance          = CONFIG.STARTING_BALANCE;
  let _jackpot          = CONFIG.JACKPOT_SEED;
  let _betType          = "low";      // "low" | "high"
  let _consecutiveLosses = 0;         // Tracks losses in a row for pity system
  let _isSpinning       = false;      // Guard against double-spin
  let _pendingCommitment = null;      // SHA-256 hash of current spin's seed

  // ── Balance ────────────────────────────────────────────────────────────────

  function getBalance()  { return _balance; }
  function getJackpot()  { return _jackpot; }
  function getBetType()  { return _betType; }
  function getBetAmount(){ return _betType === "high" ? CONFIG.HIGH_BET : CONFIG.LOW_BET; }
  function isSpinning()  { return _isSpinning; }

  function setBetType(type) {
    if (type !== "low" && type !== "high") return;
    _betType = type;
  }

  // ── Jackpot Growth ─────────────────────────────────────────────────────────

  function _growJackpot(bet) {
    const contribution = bet * (
      _betType === "high"
        ? CONFIG.JACKPOT_CONTRIBUTION_HIGH
        : CONFIG.JACKPOT_CONTRIBUTION_LOW
    );
    _jackpot += contribution;
    _jackpot  = Math.round(_jackpot * 100) / 100; // Keep 2 decimal places
    _updateJackpotDisplay();
  }

  function _updateJackpotDisplay() {
    const el = document.getElementById("jackpot-amount");
    if (el) el.textContent = Math.floor(_jackpot).toLocaleString();
  }

  // ── Outcome Resolution ─────────────────────────────────────────────────────

  /**
   * Look up a roll value (0–999) in the outcome table.
   * @param {number} roll
   * @returns {object} The matching CONFIG.OUTCOME_TABLE entry
   */
  function _lookupOutcome(roll) {
    for (const entry of CONFIG.OUTCOME_TABLE) {
      if (roll >= entry.range[0] && roll <= entry.range[1]) return entry;
    }
    // Fallback (should never reach if table covers 0–999 fully)
    return CONFIG.OUTCOME_TABLE[0];
  }

  /**
   * Separate jackpot check — runs independently of the main outcome table.
   * Uses CONFIG.JACKPOT_PROBABILITY so the jackpot's EV contribution is
   * decoupled from base-table RTP (see config.js RTP mathematics comment).
   * @returns {boolean}
   */
  function _rollForJackpot() {
    return SecureRNG.randomFloat() < CONFIG.JACKPOT_PROBABILITY;
  }

  /**
   * Apply pity override: if the player has lost too many times in a row,
   * find the smallest win outcome and force it.
   */
  function _applyPityIfNeeded(outcome) {
    if (_consecutiveLosses < CONFIG.PITY_LOSS_THRESHOLD) return outcome;
    if (outcome.type !== "lose" && outcome.type !== "near_miss") return outcome; // Already a win

    // Find the first "win" entry with payout ≥ PITY_MIN_PAYOUT
    const pityOutcome = CONFIG.OUTCOME_TABLE.find(
      e => e.type === "win" &&
           (_betType === "high" ? e.payoutHigh : e.payoutLow) >= CONFIG.PITY_MIN_PAYOUT
    );
    if (!pityOutcome) return outcome; // Shouldn't happen

    return { ...pityOutcome, _pity: true };
  }

  // ── Symbol Mapping ─────────────────────────────────────────────────────────

  /**
   * Determine the three reel centre symbols based on outcome type.
   * Returns [reel0sym, reel1sym, reel2sym] — each is a CONFIG.SYMBOLS entry.
   *
   * • win / jackpot → all three are the matching symbol
   * • near_miss     → two matching + one different (or matching on wrong row)
   * • lose          → three different random symbols
   */
  function _buildReelResult(outcome) {
    const allSymbols = CONFIG.SYMBOLS;

    const getById = id => allSymbols.find(s => s.id === id) || allSymbols[allSymbols.length - 1];
    const getRandom = () => SecureRNG.weightedSymbol();

    if (outcome.type === "win" || outcome.type === "jackpot") {
      const sym = getById(outcome.symbol);
      return {
        center: [sym, sym, sym],     // All three reels show same symbol on payline
        nearMissReel: -1,            // No near-miss
        nearMissOffset: 0,
      };
    }

    if (outcome.type === "near_miss") {
      const sym    = getById(outcome.symbol);
      // Which reel "misses" — randomise between reel 0 and reel 2
      const missReel  = SecureRNG.randomInt(2) === 0 ? 0 : 2;
      const diffSym   = _getDifferentSymbol(sym.id);
      const center    = [sym, sym, sym];
      center[missReel] = diffSym;

      return {
        center: center,
        nearMissReel: missReel,   // This reel shows the "almost" symbol one row off
        nearMissOffset: (SecureRNG.randomInt(2) === 0) ? 1 : -1,  // Top or bottom
      };
    }

    // Lose: all different symbols (pick weighted randoms ensuring they differ)
    let s0, s1, s2;
    s0 = getRandom();
    do { s1 = getRandom(); } while (s1.id === s0.id);
    do { s2 = getRandom(); } while (s2.id === s0.id || s2.id === s1.id);

    return { center: [s0, s1, s2], nearMissReel: -1, nearMissOffset: 0 };
  }

  function _getDifferentSymbol(excludeId) {
    const pool = CONFIG.SYMBOLS.filter(s => s.id !== excludeId);
    return pool[SecureRNG.randomInt(pool.length)];
  }

  // ── Main Spin Entry Point ──────────────────────────────────────────────────

  /**
   * Initiate a full spin cycle:
   *  1. Validate (balance, not already spinning, security check)
   *  2. Deduct bet, grow jackpot
   *  3. Commit RNG seed
   *  4. Kick off reel animation via UI
   *  5. When animation ends, resolve outcome and update all state
   *
   * @returns {boolean} Whether the spin was accepted
   */
  async function spin() {
    if (_isSpinning) return false;

    // ── Security check ───────────────────────────────────────────────────
    const secCheck = Security.checkSpinAllowed();
    if (!secCheck.allowed) {
      if (secCheck.reason === "too_fast") {
        UI.showToast("Slow down! 🤖 My prediction speed has limits.", "warn");
      }
      return false;
    }

    const bet = getBetAmount();
    if (_balance < bet) {
      UI.showToast("Not enough credits! The AI is amused by your poverty.", "warn");
      return false;
    }

    // ── Begin spin ───────────────────────────────────────────────────────
    _isSpinning = true;

    // Deduct bet and grow jackpot immediately
    _balance -= bet;
    _growJackpot(bet);
    UI.updateBalance(_balance);

    // Pre-commit RNG seed for provable fairness
    _pendingCommitment = await SecureRNG.prepareCommitment();

    // Update commitment display (shows hash while reels spin)
    UI.showCommitment(_pendingCommitment);

    // Start reel animation — UI will call _onAnimationComplete when done
    Audio.playSpin();
    UI.startSpinAnimation(_onAnimationComplete);

    return true;
  }

  // ── Animation Completion Callback ──────────────────────────────────────────

  /**
   * Called by UI after all reel animations finish.
   * Resolves the RNG commitment, applies outcome, updates all modules.
   */
  async function _onAnimationComplete() {
    // Resolve the committed seed → roll 0–999
    const { roll, seedHex } = SecureRNG.resolveCommitment();

    // Check jackpot first (independent probability — see config.js RTP notes)
    const isJackpotRoll = _rollForJackpot();

    // Look up normal outcome (only used if jackpot did not fire)
    let outcome = isJackpotRoll
      ? { type: "jackpot", symbol: "seven", payoutLow: 0, payoutHigh: 0 }
      : _lookupOutcome(roll);

    const isPity = !isJackpotRoll &&
                   _consecutiveLosses >= CONFIG.PITY_LOSS_THRESHOLD &&
                   (outcome.type === "lose" || outcome.type === "near_miss");

    if (isPity) outcome = _applyPityIfNeeded(outcome);

    // Build the visual reel result
    const reelResult = _buildReelResult(outcome);

    // Calculate payout
    const payoutMultiplier = _betType === "high" ? outcome.payoutHigh : outcome.payoutLow;
    const bet              = getBetAmount();
    let   payout           = 0;
    const isJackpot        = isJackpotRoll; // Already determined above

    if (isJackpot) {
      payout    = Math.floor(_jackpot);
      isJackpot = true;
      _jackpot  = CONFIG.JACKPOT_SEED; // Reset jackpot
      _updateJackpotDisplay();
      Chat.triggerAIEvent("jackpot");
      Chat.postSystemMessage(`🎉 JACKPOT! Someone won ${payout.toLocaleString()} credits!`);
    } else if (outcome.type === "win") {
      payout = Math.floor(bet * payoutMultiplier);
      Chat.triggerAIEvent("win");
    } else {
      Chat.triggerAIEvent("lose");
    }

    // Apply payout to balance
    const prevBalance = _balance;
    _balance += payout;

    // Update consecutive losses counter
    if (payout > 0) {
      _consecutiveLosses = 0;
    } else {
      _consecutiveLosses++;
    }

    // ── Package result object ────────────────────────────────────────────
    const result = {
      roll,
      seedHex,
      type:           outcome.type,
      symbol:         outcome.symbol,
      payout,
      isJackpot,
      isPity,
      betType:        _betType,
      betAmount:      bet,
      payoutMultiplier,
      reelResult,
      balance:        _balance,
      prevBalance,
      consecutiveLosses: _consecutiveLosses,
    };

    // ── Update all modules ────────────────────────────────────────────────
    UI.updateBalance(_balance);
    UI.showSpinResult(result);           // Show win/loss visual + particles

    const session = Stats.getSession();
    Stats.recordSpin(result);

    Achievements.check("spin", {
      totalSpins:    session.spins + 1,
      balance:       _balance,
      sessionMinutes: Stats.getSessionMinutes(),
      highBetStreak: session.highBetStreak + (result.betType === "high" ? 1 : 0),
      lowBetStreak:  session.lowBetStreak  + (result.betType === "low"  ? 1 : 0),
    });

    if (payout > 0) {
      Achievements.check("win", { amount: payout, prevBalance, newBalance: _balance });
    }
    if (isJackpot)  Achievements.check("jackpot");
    if (isPity)     Achievements.check("pity_win");

    Quests.update(result, Stats.getSession(), (reward) => {
      _balance += reward;
      UI.updateBalance(_balance);
    });

    _isSpinning = false;
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    _updateJackpotDisplay();
    UI.updateBalance(_balance);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return Object.freeze({
    init,
    spin,
    getBalance,
    getJackpot,
    getBetType,
    getBetAmount,
    isSpinning,
    setBetType,
  });

})();
