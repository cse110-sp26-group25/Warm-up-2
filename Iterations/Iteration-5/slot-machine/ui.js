/**
 * ui.js — DOM rendering, reel animation, win display, and game log.
 *
 * Reel animation uses requestAnimationFrame-driven physics:
 * each reel has a position (symbol index as float) that accelerates,
 * then decelerates to land on the target symbol.
 */

'use strict';

const UI = (() => {
  /* ---- DOM refs ------------------------------------------ */
  const els = {};

  function _ref(id) {
    els[id] = els[id] || document.getElementById(id);
    return els[id];
  }

  /* ---- Reel strip setup ---------------------------------- */

  // How many symbols appear in the strip (enough for smooth looping)
  const STRIP_LENGTH = 30;
  // Pixel height of one symbol cell (must match --reel-symbol-h CSS var)
  const CELL_H = 100;

  // Per-reel animation state
  const reelState = Array.from({ length: CONFIG.REELS }, () => ({
    strip:     [],       // array of symbolIds rendered in strip
    position:  0,       // current top offset (px, increases downward to simulate strip moving up)
    velocity:  0,       // px per frame
    targetPos: null,    // null while free-spinning; set when stopping
    stopped:   false,
    rafId:     null,
  }));

  /**
   * Build the DOM strip for a reel.
   * The strip is STRIP_LENGTH cells tall; we repeat symbols to fill it.
   */
  function _buildStrip(reelIndex) {
    const wrapper = document.getElementById(`reel-${reelIndex}`);
    const stripEl = wrapper.querySelector('.reel-strip');
    stripEl.innerHTML = '';

    const strip = [];
    for (let i = 0; i < STRIP_LENGTH; i++) {
      const symId = SYMBOL_IDS[i % SYMBOL_IDS.length];
      strip.push(symId);
      const cell = document.createElement('div');
      cell.className = 'reel-symbol';
      cell.dataset.symbolId = symId;
      cell.textContent = SYMBOL_LOOKUP[symId].emoji;
      stripEl.appendChild(cell);
    }

    reelState[reelIndex].strip = strip;
    stripEl.style.transform = 'translateY(0px)';
    reelState[reelIndex].position = 0;
    reelState[reelIndex].velocity = 0;
    reelState[reelIndex].stopped  = true;
    reelState[reelIndex].targetPos = null;
  }

  /** Re-order strip cells to ensure final result symbols are at the right rows. */
  function _prepStripForResult(reelIndex, resultCol) {
    const wrapper = document.getElementById(`reel-${reelIndex}`);
    const cells   = wrapper.querySelectorAll('.reel-symbol');
    const state   = reelState[reelIndex];

    // resultCol[row] = symbolId for rows 0, 1, 2 (top, mid, bottom)
    // We place result symbols at the end of the strip so the reel
    // naturally decelerates into them.
    // Positions: last-2, last-1, last in the visible window
    // The viewport shows cells [N, N+1, N+2]; we pick N so that
    // cell N   = resultCol[0], N+1 = resultCol[1], N+2 = resultCol[2]

    const totalCells = cells.length;
    // Overwrite the last 5 cells to include our results
    const offset = totalCells - 5;

    // Fill offset..offset+2 with the target column, rest random
    for (let i = 0; i < 5; i++) {
      const idx = offset + i;
      if (i < CONFIG.ROWS) {
        cells[idx].dataset.symbolId = resultCol[i];
        cells[idx].textContent = SYMBOL_LOOKUP[resultCol[i]].emoji;
        state.strip[idx] = resultCol[i];
      } else {
        const symId = RNG.pick(SYMBOL_IDS);
        cells[idx].dataset.symbolId = symId;
        cells[idx].textContent = SYMBOL_LOOKUP[symId].emoji;
        state.strip[idx] = symId;
      }
    }

    // targetPos: strip translateY so that cell `offset` is at the top of viewport
    // translateY is negative when strip moves up; position here = distance strip moved up
    state.targetPos = offset * CELL_H;
  }

  /* ---- Animation loop ------------------------------------ */

  const ACCEL_PX   = 18;   // px/frame² during spin-up
  const MAX_VEL    = 55;   // px/frame max speed
  const DECEL_DIST = 900;  // px from target at which deceleration begins

  function _animateReel(reelIndex) {
    const state   = reelState[reelIndex];
    const wrapper = document.getElementById(`reel-${reelIndex}`);
    const stripEl = wrapper.querySelector('.reel-strip');

    function frame() {
      if (state.stopped) return;

      if (state.targetPos !== null) {
        // Decelerating toward target
        const remaining = state.targetPos - state.position;

        if (remaining <= 0) {
          // Snap to target
          state.position = state.targetPos;
          stripEl.style.transform = `translateY(-${state.position}px)`;
          state.velocity  = 0;
          state.stopped   = true;
          state.targetPos = null;
          wrapper.classList.remove('spinning');
          _onReelStopped(reelIndex);
          return;
        }

        // Ease-out: velocity proportional to remaining distance
        const desiredVel = Math.min(Math.sqrt(remaining * 2.5), MAX_VEL);
        state.velocity = state.velocity * 0.75 + desiredVel * 0.25;

      } else {
        // Free spin: accelerate up to max velocity
        state.velocity = Math.min(state.velocity + ACCEL_PX, MAX_VEL);
      }

      state.position += state.velocity;

      // Loop strip: if we've scrolled past the end, wrap
      const maxScroll = (STRIP_LENGTH - CONFIG.ROWS) * CELL_H;
      if (state.targetPos === null && state.position > maxScroll * 0.5) {
        state.position -= maxScroll * 0.5;
      }

      stripEl.style.transform = `translateY(-${state.position}px)`;
      state.rafId = requestAnimationFrame(frame);
    }

    state.rafId = requestAnimationFrame(frame);
  }

  /* ---- External animation API ---------------------------- */

  let _reelStoppedCallbacks = [null, null, null];

  function _onReelStopped(reelIndex) {
    const cb = _reelStoppedCallbacks[reelIndex];
    if (cb) {
      _reelStoppedCallbacks[reelIndex] = null;
      cb();
    }
  }

  /**
   * Start spinning a reel (free spin).
   * No-op in reduce-motion mode — stopReel will snap directly.
   */
  function startReel(reelIndex) {
    if (isReducedMotion()) return;
    const state = reelState[reelIndex];
    const wrapper = document.getElementById(`reel-${reelIndex}`);
    state.stopped   = false;
    state.targetPos = null;
    state.velocity  = 0;
    wrapper.classList.add('spinning');
    _animateReel(reelIndex);
  }

  /**
   * Command a reel to stop on `resultCol`.
   * Returns a Promise that resolves when the reel is fully stopped.
   */
  function stopReel(reelIndex, resultCol) {
    // Reduce-motion: snap immediately, no animation
    if (isReducedMotion()) {
      _showStaticResult(reelIndex, resultCol);
      return Promise.resolve();
    }

    return new Promise(resolve => {
      _prepStripForResult(reelIndex, resultCol);
      _reelStoppedCallbacks[reelIndex] = resolve;
    });
  }

  /** In reduce-motion mode, just snap symbols directly. */
  function _showStaticResult(reelIndex, resultCol) {
    const wrapper = document.getElementById(`reel-${reelIndex}`);
    const cells   = wrapper.querySelectorAll('.reel-symbol');
    // Reset strip, show 3 target symbols in positions 0-2
    cells.forEach((cell, i) => {
      if (i < CONFIG.ROWS) {
        cell.dataset.symbolId = resultCol[i];
        cell.textContent = SYMBOL_LOOKUP[resultCol[i]].emoji;
        cell.className = 'reel-symbol';
      } else {
        cell.textContent = '';
        cell.className = 'reel-symbol';
      }
    });
    const stripEl = wrapper.querySelector('.reel-strip');
    stripEl.style.transform = 'translateY(0px)';
    reelState[reelIndex].position = 0;
  }

  /* ---- Win highlighting ---------------------------------- */

  function clearWinHighlights() {
    document.querySelectorAll('.reel-symbol.winning').forEach(el => {
      el.classList.remove('winning');
    });
    const overlay = _ref('win-overlay');
    overlay.classList.add('hidden');
  }

  /**
   * Return the index of the first visible cell within a reel's strip.
   * "Visible" means rendered inside the viewport based on current position.
   */
  function _visibleStartIndex(reelIndex) {
    const pos = reelState[reelIndex].position;
    return Math.round(pos / CELL_H);
  }

  /**
   * Highlight winning cells.
   * @param {Array} paylineWins — from evaluateAllPaylines()
   * @param {string} winType
   * @param {number} cashPayout
   */
  function showWin(paylineWins, winType, cashPayout) {
    paylineWins.forEach(win => {
      for (let r = 0; r < win.count; r++) {
        const wrapper    = document.getElementById(`reel-${r}`);
        const cells      = wrapper.querySelectorAll('.reel-symbol');
        const startIdx   = _visibleStartIndex(r);
        const targetIdx  = startIdx + win.row; // visible row offset

        // Highlight the cell at the winning row within the visible window
        if (cells[targetIdx]) {
          cells[targetIdx].classList.add('winning');
        }
        // Fallback: if reduce-motion, winning symbols are always at indices 0-2
        if (isReducedMotion() && cells[win.row]) {
          cells[win.row].classList.add('winning');
        }
      }
    });

    if (cashPayout <= 0) return;

    const overlay  = _ref('win-overlay');
    const textEl   = overlay.querySelector('.win-overlay-text');
    overlay.classList.remove('hidden');

    if (winType === 'jackpot') {
      textEl.textContent = `JACKPOT! +${cashPayout}`;
      textEl.className = 'win-overlay-text jackpot-text';
      document.getElementById('slot-machine').classList.add('flash-jackpot');
      setTimeout(() => document.getElementById('slot-machine').classList.remove('flash-jackpot'), 1200);
    } else {
      const labels = { mega: '★ MEGA WIN ★', big: '★ BIG WIN ★', small: 'WIN!', pity: 'WIN' };
      textEl.textContent = `${labels[winType] || 'WIN'} +${cashPayout}`;
      textEl.className = 'win-overlay-text';
      document.getElementById('slot-machine').classList.add('flash-win');
      setTimeout(() => document.getElementById('slot-machine').classList.remove('flash-win'), 800);
    }

    setTimeout(clearWinHighlights, winType === 'jackpot' ? 4000 : 2500);
  }

  /* ---- HUD updates --------------------------------------- */

  function updateCredits(credits, animate = false) {
    const el = _ref('credits-display');
    el.textContent = credits.toLocaleString();
    if (animate) {
      el.classList.remove('credits-bump');
      void el.offsetWidth; // reflow
      el.classList.add('credits-bump');
    }
  }

  function updateBet(bet) {
    _ref('bet-amount').textContent = bet;
  }

  function updateJackpot(amount) {
    _ref('jackpot-amount').textContent = `$${amount.toLocaleString()}`;
  }

  function updateLastWin(amount) {
    const el = _ref('last-win-display');
    el.textContent = amount > 0 ? `+${amount}` : '—';
  }

  function updateStats() {
    _ref('stat-spins').textContent     = GameState.session.spins.toLocaleString();
    _ref('stat-total-won').textContent = GameState.session.totalWon.toLocaleString();
    _ref('stat-biggest-win').textContent = GameState.session.biggestWin.toLocaleString();
    _ref('stat-win-rate').textContent  = `${getWinRate().toFixed(1)}%`;
  }

  function setSpinButtonState(spinning) {
    const btn = _ref('spin-button');
    btn.disabled = spinning;
    if (spinning) btn.classList.add('spinning');
    else          btn.classList.remove('spinning');
  }

  function setBetButtonsState(enabled) {
    ['bet-decrease', 'bet-increase', 'max-bet'].forEach(id => {
      _ref(id).disabled = !enabled;
    });
  }

  /* ---- Game Log ------------------------------------------ */

  const LOG_MAX = 60;

  function addLog(message, type = 'info') {
    const log = _ref('game-log');
    const p   = document.createElement('p');
    p.className = `log-entry log-${type}`;
    p.textContent = message;
    log.prepend(p);

    // Trim old entries
    while (log.children.length > LOG_MAX) {
      log.removeChild(log.lastChild);
    }
  }

  /* ---- Screen-reader announce ---------------------------- */

  function announce(msg) {
    const el = _ref('sr-announce');
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = msg; });
  }

  /* ---- Reduce-motion compatibility ----------------------- */

  function isReducedMotion() {
    return document.body.classList.contains('reduce-motion');
  }

  /* ---- Initialization ------------------------------------ */

  function init() {
    for (let i = 0; i < CONFIG.REELS; i++) _buildStrip(i);
    updateCredits(GameState.credits);
    updateBet(GameState.bet);
    updateJackpot(GameState.jackpot);
    updateLastWin(0);
    updateStats();
  }

  return {
    init,
    startReel,
    stopReel,
    showWin,
    clearWinHighlights,
    updateCredits,
    updateBet,
    updateJackpot,
    updateLastWin,
    updateStats,
    setSpinButtonState,
    setBetButtonsState,
    addLog,
    announce,
    isReducedMotion,
  };
})();
