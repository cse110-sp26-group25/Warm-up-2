/**
 * main.js — Application bootstrap and orchestration.
 *
 * Wires together all modules: game logic, UI, audio, chatbot,
 * leaderboard, and accessibility. Handles the spin flow end-to-end.
 */

'use strict';

/* ============================================================
   GAME LOG MESSAGES — varied pools to avoid repetition
   ============================================================ */
const LOG_MESSAGES = {
  winSmall: [
    'Small win — every credit helps!',
    'A little something from the reels.',
    'Nice pick-up!',
    'The machine paid out a little.',
    'A modest win — keep that momentum.',
    'Small, but welcome!',
    'A token of goodwill from the reels.',
  ],
  winBig: [
    'BIG WIN! The reels are generous!',
    'Excellent spin — that is a big payout!',
    'A great win — well earned!',
    'Now we are talking! Big win!',
    'The symbols aligned beautifully — big win!',
    'Outstanding! Big credits incoming.',
  ],
  winMega: [
    '★ MEGA WIN! Absolutely incredible! ★',
    'MEGA WIN! The machine bows to you!',
    'UNBELIEVABLE! Mega win confirmed!',
    'Jaw-dropping mega win!',
    'Astronomical win — the reels gave everything!',
  ],
  loss: [
    'No match this time — try again.',
    'The reels did not cooperate.',
    'Close but no cigar.',
    'Better luck next spin.',
    'The machine holds on — for now.',
    'Chin up — the odds reset with every spin.',
    'Not this time. Perseverance pays!',
    'A quiet spin — things will turn around.',
    'Unlucky roll. The reels will loosen up.',
    'The symbols scattered. Keep going!',
  ],
  nearMiss: [
    'So close! Two matching symbols on the payline.',
    'Near-miss! The third reel was cruel.',
    'Tantalizingly close — one symbol away!',
    'Almost a win! The reels are teasing.',
    'Right there! One position off.',
  ],
  pity: [
    'Consolation bonus — the machine felt the streak.',
    'A little pity credit to keep you spinning.',
    'Small top-up from a generous machine.',
  ],
};

function _pickLog(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ============================================================
   NEAR-MISS DETECTION
   Returns true if 2 of 3 reels on the main payline match
   ============================================================ */
function _isNearMiss(reelResults) {
  const middle = reelResults.map(col => col[1]); // middle row
  const counts = {};
  middle.forEach(sym => { counts[sym] = (counts[sym] || 0) + 1; });
  return Object.values(counts).some(c => c === 2);
}

/* ============================================================
   AUTO-SPIN STATE
   ============================================================ */
let _autoSpinning  = false;
let _autoRemaining = 0;
let _autoTimer     = null;

/* ============================================================
   SPIN ORCHESTRATOR
   ============================================================ */

async function executeSpin() {
  if (GameState.isSpinning) return;
  if (GameState.credits < GameState.bet) {
    UI.addLog('Not enough credits to spin!', 'info');
    UI.announce('Not enough credits to spin');
    _stopAutoSpin();
    return;
  }

  // Disable controls during spin
  UI.setSpinButtonState(true);
  UI.setBetButtonsState(false);
  UI.clearWinHighlights();
  Audio.playButtonClick();

  // ----- Phase 1: start all reels spinning -----
  const reduceMotion = Accessibility.isReducedMotion();

  if (!reduceMotion) {
    for (let i = 0; i < CONFIG.REELS; i++) {
      UI.startReel(i);
      Audio.startReelSpin(i, 75 - i * 5);
    }
    // Let reels spin freely for a moment
    await _delay(CONFIG.SPIN_BASE_DURATION);
  }

  // ----- Phase 2: execute game logic -----
  const result = spin(); // from gameLogic.js

  if (!result) {
    UI.setSpinButtonState(false);
    UI.setBetButtonsState(true);
    return;
  }

  // ----- Phase 3: stop reels staggered -----
  if (reduceMotion) {
    // Instant reveal — no delays, no animation
    for (let i = 0; i < CONFIG.REELS; i++) {
      await UI.stopReel(i, result.reelResults[i]);
    }
  } else {
    for (let i = 0; i < CONFIG.REELS; i++) {
      if (i > 0) await _delay(CONFIG.SPIN_STOP_DELAY);
      await Promise.all([
        UI.stopReel(i, result.reelResults[i]),
        Audio.stopReelSpin(i, 500 - i * 40),
      ]);
    }
  }

  // ----- Phase 4: evaluate & display outcome -----
  const { paylineWins, cashPayout, isJackpot, winType, pityCredited } = result;

  // Update HUD
  UI.updateCredits(GameState.credits, cashPayout > 0);
  UI.updateLastWin(cashPayout);
  UI.updateJackpot(GameState.jackpot);
  UI.updateStats();

  if (cashPayout > 0) {
    UI.showWin(paylineWins, winType, cashPayout);

    // Audio
    if (isJackpot)           Audio.playJackpot();
    else if (winType === 'mega')  Audio.playMegaWin();
    else if (winType === 'big')   Audio.playBigWin();
    else                          Audio.playSmallWin(cashPayout);

    // Log
    const logType = isJackpot ? 'jackpot' : winType === 'mega' ? 'big-win' : winType === 'big' ? 'big-win' : 'win';
    const pool = isJackpot ? ['JACKPOT! You hit the jackpot!'] :
                 winType === 'mega' ? LOG_MESSAGES.winMega :
                 winType === 'big'  ? LOG_MESSAGES.winBig  :
                                      LOG_MESSAGES.winSmall;

    UI.addLog(
      `${_pickLog(pool)} (+${cashPayout} credits)`,
      isJackpot ? 'jackpot' : winType === 'big' || winType === 'mega' ? 'big-win' : 'win'
    );

    // Announce for screen readers
    UI.announce(`Win: ${cashPayout} credits. ${winType} win.`);

    // Chatbot
    Chatbot.onGameEvent('win', { winType });

    // Auto-spin: pause on big wins
    if (_autoSpinning && ['mega', 'jackpot'].includes(winType)) {
      _stopAutoSpin();
    }

  } else {
    // Loss
    Audio.playLoss();

    const nearMiss = _isNearMiss(result.reelResults);
    if (nearMiss) {
      UI.addLog(_pickLog(LOG_MESSAGES.nearMiss), 'near');
      Audio.playNearMiss();
      Chatbot.onGameEvent('loss', { nearMiss: true });
    } else {
      UI.addLog(_pickLog(LOG_MESSAGES.loss), 'loss');
      Chatbot.onGameEvent('loss', { nearMiss: false });
    }

    if (pityCredited) {
      UI.addLog(_pickLog(LOG_MESSAGES.pity), 'info');
      Chatbot.onGameEvent('pity');
    }

    UI.announce('No win this spin.');
  }

  // Re-enable controls
  UI.setSpinButtonState(false);
  UI.setBetButtonsState(true);
  Leaderboard.onSpinComplete();

  // Auto-spin next
  if (_autoSpinning && _autoRemaining > 0) {
    _autoRemaining--;
    _updateAutoRemaining();
    if (_autoRemaining <= 0) {
      _stopAutoSpin();
    } else {
      _autoTimer = setTimeout(executeSpin, 900);
    }
  }
}

/* ============================================================
   AUTO-SPIN
   ============================================================ */

function _startAutoSpin() {
  const countEl = document.getElementById('auto-count-select');
  _autoRemaining = parseInt(countEl.value, 10);
  _autoSpinning  = true;

  const btn = document.getElementById('auto-spin-btn');
  btn.setAttribute('aria-pressed', 'true');

  _updateAutoRemaining();
  executeSpin();
}

function _stopAutoSpin() {
  _autoSpinning  = false;
  _autoRemaining = 0;
  clearTimeout(_autoTimer);

  const btn = document.getElementById('auto-spin-btn');
  btn.setAttribute('aria-pressed', 'false');

  document.getElementById('auto-remaining').textContent = '';
}

function _updateAutoRemaining() {
  const el = document.getElementById('auto-remaining');
  el.textContent = _autoRemaining > 0 ? `×${_autoRemaining}` : '';
}

/* ============================================================
   UTILITY
   ============================================================ */
function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  // Boot modules
  Accessibility.init();
  UI.init();
  Chatbot.init();
  Leaderboard.init();

  // Jackpot ticker
  setInterval(() => {
    UI.updateJackpot(GameState.jackpot);
  }, 5000);

  /* ---- Spin button --------------------------------------- */
  document.getElementById('spin-button').addEventListener('click', () => {
    if (_autoSpinning) {
      _stopAutoSpin();
    } else {
      executeSpin();
    }
  });

  /* ---- Bet controls -------------------------------------- */
  document.getElementById('bet-decrease').addEventListener('click', () => {
    decreaseBet();
    UI.updateBet(GameState.bet);
    Audio.playButtonClick();
  });

  document.getElementById('bet-increase').addEventListener('click', () => {
    increaseBet();
    UI.updateBet(GameState.bet);
    Audio.playButtonClick();
  });

  document.getElementById('max-bet').addEventListener('click', () => {
    setMaxBet();
    UI.updateBet(GameState.bet);
    Audio.playButtonClick();
  });

  /* ---- Auto spin ----------------------------------------- */
  document.getElementById('auto-spin-btn').addEventListener('click', () => {
    if (_autoSpinning) {
      _stopAutoSpin();
    } else {
      _startAutoSpin();
    }
  });

  /* ---- Keyboard shortcuts -------------------------------- */
  document.addEventListener('keydown', e => {
    // Space or Enter on spin button area
    if ((e.code === 'Space' || e.code === 'Enter') && e.target === document.body) {
      e.preventDefault();
      if (!GameState.isSpinning) executeSpin();
    }
  });

  /* ---- Player name feedback ------------------------------ */
  document.getElementById('player-name-input').addEventListener('input', () => {
    // Enable save button if name changes
    document.getElementById('save-score-btn').disabled = false;
  });

  // Initial log message
  UI.addLog(`Good luck! Jackpot starts at $${GameState.jackpot.toLocaleString()}.`, 'info');
});
