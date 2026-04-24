/**
 * ui.js — UI orchestration layer (Iteration 09).
 *
 * Serves as the top-level coordinator that wires together every sub-module
 * (UiReels, UiMascot, UiPanels) and drives the core spin cycle, win
 * celebrations, and boot sequence. The heavy lifting has been split out:
 *
 *   • uiReels.js   — reel-strip construction and CSS-blur animation.
 *   • uiMascot.js  — robot mascot interactions, chat, idle quips.
 *   • uiPanels.js  — slide-over panels, settings, leaderboard, achievements.
 *
 * What remains here is intentionally narrow:
 *   • The spin handler (_doSpin) and security gate.
 *   • Win / loss / near-miss outcome handling.
 *   • Visual effects (flash, coin burst, lights, win-celebration overlay).
 *   • Jackpot and winnings displays.
 *   • Global keyboard and mouse-entropy listeners.
 *   • Boot sequence (greeting, private-mode warning).
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIG — UI-layer tunables only. Reel timing lives in UiReels.CFG.
  // ═══════════════════════════════════════════════════════════════════
  /** @type {Object} Spin-outcome and visual-effect tunables. */
  const CFG = Object.freeze({
    /** Refresh cadence for the jackpot display (ms). */
    JACKPOT_POLL_MS:   2000,
    /** Threshold: payout / bet >= this triggers a "big win" celebration. */
    BIG_WIN_MULTIPLE:  10,
    /** Small win celebration duration (ms). */
    SMALL_WIN_MS:      1500,
    /** Big win celebration duration (ms). */
    BIG_WIN_MS:        3000,
    /** Jackpot celebration duration (ms). */
    JACKPOT_WIN_MS:    5000,
    /** Coins spawned per tier. */
    COINS_SMALL:       8,
    COINS_BIG:         20,
    COINS_JACKPOT:     40,
    /** Winnings counter bump animation duration (ms). */
    BUMP_MS:           450,
    /** Near-miss bar visibility duration (ms). */
    NEAR_MISS_SHOW_MS: 3000,
    /** Flash overlay clear delay (ms — slightly beyond the keyframe). */
    FLASH_CLEAR_MS:    1100,
    /** Boot-sequence greeting delay (ms). */
    BOOT_DELAY_MS:     600,
  });

  // ── DOM helpers ────────────────────────────────────────────────────
  /** @param {string} id @returns {HTMLElement|null} */
  const $  = id  => document.getElementById(id);
  /** @param {string} sel @returns {NodeListOf<HTMLElement>} */
  const $$ = sel => document.querySelectorAll(sel);

  // ── DOM references ─────────────────────────────────────────────────
  const spinBtn        = $('spin-btn');
  const jackpotAmount  = $('jackpot-amount');
  const winningsAmount = $('winnings-amount');
  const resultDisplay  = $('result-display');
  const nearMissBar    = $('near-miss-bar');
  const winFlash       = $('win-flash');
  const coinBurst      = $('coin-burst');
  const winCelebration = $('win-celebration');
  const winAmountDisp  = $('win-amount-display');
  const winLabelDisp   = $('win-label-display');

  // ── Spin-local state ───────────────────────────────────────────────
  /** @type {boolean} True while a spin is in progress. */
  let _spinning = false;
  /** @type {number} Currently selected bet amount. */
  let _currentBet = 1;

  // ── Utility ────────────────────────────────────────────────────────
  /**
   * HTML-escape a value for safe innerHTML insertion.
   * @param {*} str
   * @returns {string}
   */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Boot: build reel strips ────────────────────────────────────────
  UiReels.buildAllStrips();

  // ── Bet selector ───────────────────────────────────────────────────
  $$('.bet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_spinning) return;
      $$('.bet-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      _currentBet = Number(btn.dataset.bet);
      Audio.playClick();
      UiMascot.resetIdle();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SPIN HANDLER
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Execute a full spin cycle: security → resolve → animate → outcome.
   * @returns {Promise<void>} Resolves when the UI returns to its idle state.
   */
  async function _doSpin() {
    if (_spinning) return;

    Audio.unlock();

    const check = Security.checkSpin();
    if (!check.allowed) {
      UiMascot.showRobotBubble(_lockoutMessage(check.reason));
      return;
    }

    _spinning = true;
    UiReels.setSpinning(true);
    UiMascot.resetIdle();
    spinBtn.disabled = true;
    spinBtn.classList.add('is-spinning');
    $$('.lights-bar').forEach(lb => lb.classList.add('active'));

    Audio.playSpin();
    resultDisplay.textContent = '';
    nearMissBar.textContent   = '';
    nearMissBar.classList.remove('visible');

    // Resolve the spin outcome up-front — animation is purely presentational.
    const result        = GameLogic.spin(_currentBet);
    const spinUnlocked  = Achievements.recordSpin();

    // Per-reel durations respect the Fast Play setting.
    const fastPlay = !!(State.get('settings.fastPlay'));
    const durations = UiReels.spinDurations(fastPlay);

    // Kick off all reel animations in parallel.
    const spinPromises = result.stops.map((stop, i) =>
      UiReels.animateReel(i, stop, durations[i])
    );

    // As each reel settles: play thunk SFX and update the reel's ARIA label.
    spinPromises.forEach((p, i) => p.then(() => {
      Audio.playReelStop(i);
      const sym       = GameLogic.getSymbolById(result.symbols[i]);
      const container = $('reel-' + i);
      if (container && sym) container.setAttribute('aria-label', sym.label);
    }));

    await Promise.all(spinPromises);

    // ── Outcome ──────────────────────────────────────────────────
    $$('.lights-bar').forEach(lb => lb.classList.remove('active'));
    spinBtn.classList.remove('is-spinning');

    if (result.payout > 0 || result.type === 'jackpot') {
      _handleWin(result);
    } else if (result.nearMiss) {
      _handleNearMiss();
    } else {
      _handleLoss();
    }

    // Check pity achievement if pity triggered this spin.
    if (result.pityTriggered) {
      const pityUnlocked = Achievements.recordPity();
      if (pityUnlocked.length) _showAchievementUnlock(pityUnlocked[0]);
    }

    // Show any spin-count achievements.
    if (spinUnlocked.length) _showAchievementUnlock(spinUnlocked[0]);

    _updateJackpot();
    _updatePityBar();
    UiPanels.updateStats();
    UiPanels.updateAchievements();
    UiPanels.refreshLeaderboard();

    _spinning = false;
    UiReels.setSpinning(false);
    spinBtn.disabled = false;
    UiMascot.resetIdle();
  }

  /**
   * Map a Security rejection code to a humorous bubble message.
   * @param {string} reason - Security reason code.
   * @returns {string} Human-readable message.
   */
  function _lockoutMessage(reason) {
    const msgs = {
      too_fast:    "Whoa! Slow down, unit! You're not a machine. Well, I am. But still.",
      burst:       'Burst limit reached. Take a breath. Humans need those.',
      low_entropy: "Movement entropy too low. Are you a bot? I'm the only bot allowed here.",
      slow_down:   'Cooldown in progress. ' +
                   (Security.lockoutRemaining() / 1000).toFixed(1) + 's remaining.',
    };
    return msgs[reason] || 'Not so fast!';
  }

  // ── Win / loss / near-miss handlers ────────────────────────────────

  /**
   * Celebrate a winning spin outcome.
   * @param {Object} result - Resolved spin result from `GameLogic.spin`.
   * @returns {void}
   */
  function _handleWin(result) {
    if (result.type === 'jackpot') {
      _triggerJackpot(result.jackpotAmount || result.payout);
    } else if (result.payout >= _currentBet * CFG.BIG_WIN_MULTIPLE) {
      _triggerBigWin(result.payout);
    } else {
      _triggerSmallWin(result.payout);
    }

    _animateWinnings(GameLogic.totalWinnings);

    const winUnlocked = Achievements.recordWin(result.payout);
    if (result.type === 'jackpot') Achievements.recordJackpot();
    if (winUnlocked.length) _showAchievementUnlock(winUnlocked[0]);

    const chatResp = Chat.getWinReaction(result.type);
    UiMascot.addChatMessage('ROBO', chatResp, true);
    UiMascot.showRobotBubble(chatResp.slice(0, 60));
    UiMascot.setRobotMood('excited');

    const playerName  = State.get('player.name')  || 'YOU';
    const playerColor = State.get('player.color') || '#fff176';
    Leaderboard.recordPlayerWin(playerName, playerColor, result.payout);

    resultDisplay.textContent =
      result.type === 'jackpot' ? '★★★ JACKPOT! ★★★'      :
      result.type === 'five'    ? '★★ FIVE OF A KIND! ★★' :
      result.type === 'four'    ? '★ FOUR OF A KIND! ★'   :
      result.type === 'three'   ? 'THREE OF A KIND!'       :
                                  'Two of a kind!';
  }

  /**
   * Handle a near-miss outcome.
   * @returns {void}
   */
  function _handleNearMiss() {
    Audio.playNearMiss();
    nearMissBar.textContent = '⚠ SO CLOSE! Just one symbol off...';
    nearMissBar.classList.add('visible');
    setTimeout(() => nearMissBar.classList.remove('visible'), CFG.NEAR_MISS_SHOW_MS);

    const chatResp = Chat.getWinReaction('nearMiss');
    UiMascot.addChatMessage('ROBO', chatResp, true);
    UiMascot.showRobotBubble(chatResp.slice(0, 60));
    UiMascot.setRobotMood('normal');
    resultDisplay.textContent = 'Almost...';
  }

  /**
   * Handle a plain loss outcome.
   * @returns {void}
   */
  function _handleLoss() {
    Audio.playLoss();
    const chatResp = Chat.getWinReaction('loss');
    UiMascot.addChatMessage('ROBO', chatResp, true);
    UiMascot.setRobotMood('sad');
    resultDisplay.textContent = 'No match.';
  }

  // ── Win visual effects ─────────────────────────────────────────────

  /**
   * Small-win celebration.
   * @param {number} amount - Payout amount.
   * @returns {void}
   */
  function _triggerSmallWin(amount) {
    Audio.playSmallWin();
    _flashWin('green');
    _lightsCycle(CFG.SMALL_WIN_MS);
    _showWinCelebration(GameLogic.formatMoney(amount), 'WIN!', CFG.SMALL_WIN_MS);
    _spawnCoins(CFG.COINS_SMALL);
  }

  /**
   * Big-win celebration.
   * @param {number} amount - Payout amount.
   * @returns {void}
   */
  function _triggerBigWin(amount) {
    Audio.playBigWin();
    _flashWin('gold');
    _lightsCycle(CFG.BIG_WIN_MS);
    _showWinCelebration(GameLogic.formatMoney(amount), 'BIG WIN!', CFG.BIG_WIN_MS);
    _spawnCoins(CFG.COINS_BIG);
  }

  /**
   * Jackpot celebration.
   * @param {number} amount - Jackpot payout amount.
   * @returns {void}
   */
  function _triggerJackpot(amount) {
    Audio.playJackpot();
    _flashWin('gold');
    _lightsCycle(CFG.JACKPOT_WIN_MS);
    _showWinCelebration(GameLogic.formatMoney(amount), 'JACKPOT!!!', CFG.JACKPOT_WIN_MS);
    _spawnCoins(CFG.COINS_JACKPOT);
    UiMascot.setRobotMood('dance');
    setTimeout(() => UiMascot.setRobotMood('normal'), CFG.JACKPOT_WIN_MS);
  }

  /**
   * Flash the machine frame with a win colour.
   * Suppressed entirely in epilepsy-safe mode.
   * @param {('green'|'gold')} type - Flash colour.
   * @returns {void}
   */
  function _flashWin(type) {
    if (document.body.dataset.epilepsysafe === 'true') return;
    if (!winFlash) return;
    winFlash.className = 'win-flash-overlay flash-' + type;
    setTimeout(() => { winFlash.className = 'win-flash-overlay'; }, CFG.FLASH_CLEAR_MS);
  }

  /**
   * Cycle the lights bars for a duration.
   * @param {number} duration - ms.
   * @returns {void}
   */
  function _lightsCycle(duration) {
    $$('.lights-bar').forEach(lb => lb.classList.add('win-lights'));
    setTimeout(
      () => $$('.lights-bar').forEach(lb => lb.classList.remove('win-lights')),
      duration
    );
  }

  /**
   * Show the centre-screen win-amount celebration overlay.
   * @param {string} amount   - Formatted money string.
   * @param {string} label    - Label text ("BIG WIN!" etc).
   * @param {number} duration - Visibility duration (ms).
   * @returns {void}
   */
  function _showWinCelebration(amount, label, duration) {
    if (!winCelebration) return;
    winAmountDisp.textContent = amount;
    winLabelDisp.textContent  = label;
    winCelebration.classList.add('visible');
    winCelebration.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      winCelebration.classList.remove('visible');
      winCelebration.setAttribute('aria-hidden', 'true');
    }, duration);
  }

  /**
   * Emit a radial coin burst from the centre of the machine.
   * Suppressed in epilepsy-safe mode.
   * @param {number} count - Number of coins to spawn.
   * @returns {void}
   */
  function _spawnCoins(count) {
    if (document.body.dataset.epilepsysafe === 'true') return;
    if (!coinBurst) return;
    coinBurst.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const coin  = document.createElement('div');
      coin.className = 'coin';
      const angle = (i / count) * 2 * Math.PI;
      const dist  = 60 + RNG.randInt(0, 80);
      const tx    = Math.cos(angle) * dist;
      const ty    = Math.sin(angle) * dist - 80; // bias upward
      coin.style.setProperty('--tx', tx + 'px');
      coin.style.setProperty('--ty', ty + 'px');
      coin.style.animationDelay = RNG.randInt(0, 200) + 'ms';
      coin.textContent = '$';
      coinBurst.appendChild(coin);
    }
    setTimeout(() => { coinBurst.innerHTML = ''; }, 1200);
  }

  /**
   * Bump-animate the winnings counter to a new value.
   * @param {number} target - New total.
   * @returns {void}
   */
  function _animateWinnings(target) {
    if (!winningsAmount) return;
    winningsAmount.classList.add('bump');
    winningsAmount.textContent = GameLogic.formatMoney(target);
    setTimeout(() => winningsAmount.classList.remove('bump'), CFG.BUMP_MS);
  }

  /**
   * Announce a newly unlocked achievement via bubble + chat.
   * @param {{label:string, desc:string}} def - Achievement definition.
   * @returns {void}
   */
  function _showAchievementUnlock(def) {
    Audio.playAchievement();
    UiMascot.showRobotBubble('ACHIEVEMENT UNLOCKED: ' + def.label + '!');
    UiMascot.addChatMessage('ROBO', 'Achievement unlocked: ' + def.label + '! ' + def.desc, true);
    UiPanels.updateAchievements();
  }

  // ── Jackpot display ────────────────────────────────────────────────
  /**
   * Refresh the jackpot amount display.
   * @returns {void}
   */
  function _updateJackpot() {
    if (jackpotAmount) jackpotAmount.textContent = GameLogic.formatMoney(GameLogic.jackpot);
  }
  setInterval(_updateJackpot, CFG.JACKPOT_POLL_MS);
  _updateJackpot();

  // ── Pity bar ───────────────────────────────────────────────────────
  /**
   * Sync the pity progress bar to the current pity meter value.
   * Color shifts dim → yellow → red as the meter fills toward threshold.
   * @returns {void}
   */
  function _updatePityBar() {
    const fill = $('pity-bar-fill');
    if (!fill) return;
    const frac = Math.min(
      GameLogic.pityMeter / GameLogic.CONFIG.PITY_THRESHOLD, 1
    );
    fill.style.width = (frac * 100) + '%';
    fill.style.backgroundColor =
      frac < 0.35  ? 'rgba(105,240,174,0.35)'   // dim green
      : frac < 0.70 ? 'var(--yellow-sat)'        // yellow
                    : 'var(--red)';              // red
  }
  _updatePityBar();

  // Hydrate winnings on boot.
  if (winningsAmount) {
    winningsAmount.textContent = GameLogic.formatMoney(GameLogic.totalWinnings);
  }

  // Initial stats + achievements render.
  UiPanels.updateStats();
  UiPanels.updateAchievements();

  // ── Global key handlers ────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (e.code === 'Space' && !isTyping) {
      e.preventDefault();
      _doSpin();
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.slide-panel:not([hidden])').forEach(p =>
        UiPanels.closePanel(p.id)
      );
    }
    Security.addEntropy(e.keyCode || 0);
  });

  document.addEventListener('mousemove', e => {
    Security.addEntropy((e.clientX * 7 + e.clientY * 13) & 0xffff);
  }, { passive: true });

  // Power-Core click.
  if (spinBtn) spinBtn.addEventListener('click', _doSpin);

  // ═══════════════════════════════════════════════════════════════════
  //  BOOT SEQUENCE
  // ═══════════════════════════════════════════════════════════════════
  setTimeout(() => {
    const greeting = Chat.getBootGreeting();
    UiMascot.addChatMessage('ROBO', greeting, true);
    UiMascot.showRobotBubble(
      greeting.length > 60 ? greeting.slice(0, 57) + '...' : greeting
    );

    // Warn the player if localStorage is unavailable (private/incognito mode).
    if (!State.isStorageAvailable()) {
      const warning = '⚠ Private browsing detected — your progress will NOT be saved this session!';
      UiMascot.addChatMessage('ROBO', warning, true);
      UiMascot.showRobotBubble('Warning: no storage available!');
    }

    // Welcome sting for returning players only.
    if (State.isReturningPlayer()) {
      try { Audio.unlock(); Audio.playWelcome(); } catch (_e) { /* suspended context */ }
    }
  }, CFG.BOOT_DELAY_MS);

})();
