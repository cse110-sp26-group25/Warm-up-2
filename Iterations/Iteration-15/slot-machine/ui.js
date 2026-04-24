/**
 * ui.js — UI orchestration layer (Iteration 16).
 *
 * Top-level coordinator that wires together every sub-module (UiReels,
 * UiMascot, UiPanels) and drives the core spin cycle, win celebrations,
 * and boot sequence. Heavy lifting is split into:
 *
 *   • uiReels.js   — reel-strip construction and CSS-blur animation.
 *   • uiMascot.js  — robot mascot interactions, chat, idle quips.
 *   • uiPanels.js  — slide-over panels, settings, leaderboard, achievements.
 *
 * Iteration 16 — what changed in this file:
 *   • `_updateLuckIndicator()` refactored for the new dull-grey →
 *     glowing-neon-orange luck-node scheme. Within 2 spins of the pity
 *     threshold, active nodes gain a `.lk-pulse-fast` class that drives
 *     a non-linear anticipatory pulse (CSS-defined).
 *   • `_showStorageWarning()` now applies the CSS `.static` class after
 *     10 s instead of killing the animation cold — the transition is
 *     smoother and the badge can be fully styled via CSS.
 *
 * Iteration 14 retained:
 *   • Balance guard lives inside `GameLogic.spin()`; this module branches
 *     on the returned rejection object and surfaces a denied-sound + quip.
 *   • Achievement toasts drop from the top-center over the machine frame.
 *   • `#storage-warning` header badge for private/incognito mode.
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIG — UI-layer tunables only. Reel timing lives in UiReels.CFG.
  // ═══════════════════════════════════════════════════════════════════
  /** @type {Object} Spin-outcome and visual-effect tunables. */
  const CFG = Object.freeze({
    /** Refresh cadence for the jackpot display (ms). */
    JACKPOT_POLL_MS:    2000,
    /** Threshold: payout / bet >= this triggers a "big win" celebration. */
    BIG_WIN_MULTIPLE:   10,
    /** Small win celebration duration (ms). */
    SMALL_WIN_MS:       1500,
    /** Big win celebration duration (ms). */
    BIG_WIN_MS:         3000,
    /** Jackpot celebration duration (ms). */
    JACKPOT_WIN_MS:     5000,
    /** Coins spawned per tier. */
    COINS_SMALL:        8,
    COINS_BIG:          20,
    COINS_JACKPOT:      40,
    /** Winnings counter bump animation duration (ms). */
    BUMP_MS:            450,
    /** Near-miss bar visibility duration (ms). */
    NEAR_MISS_SHOW_MS:  3000,
    /** Flash overlay clear delay (ms — slightly beyond the keyframe). */
    FLASH_CLEAR_MS:     1100,
    /** Boot-sequence greeting delay (ms). */
    BOOT_DELAY_MS:      600,
    /** Toast visibility before slide-out (ms). */
    TOAST_VISIBLE_MS:   3000,
    /** Toast slide-out animation duration — must match CSS (ms). */
    TOAST_SLIDE_OUT_MS: 300,
    /**
     * How long the `#storage-warning` header badge pulses before
     * transitioning to its static state (Iteration 16 mandate).
     */
    STORAGE_WARN_PULSE_MS: 10_000,
  });

  /**
   * Memory-error greeting for players in private/incognito browsing.
   * Verbatim from the Iteration 14 plan.
   * @type {string}
   */
  const MEMORY_ERROR_GREETING =
    'SYSTEMS ONLINE. Memory circuits fried. Progress will be lost on exit.';

  /**
   * ROBO quip for insufficient-balance rejections.
   * Verbatim from the Iteration 14 plan.
   * @type {string}
   */
  const INSUFFICIENT_FUNDS_QUIP =
    'Insufficient funds, unit. My charity module is currently disabled.';

  // ── DOM helpers ────────────────────────────────────────────────────
  /** @param {string} id @returns {HTMLElement|null} */
  const $  = id  => document.getElementById(id);
  /** @param {string} sel @returns {NodeListOf<HTMLElement>} */
  const $$ = sel => document.querySelectorAll(sel);

  // ── DOM references ─────────────────────────────────────────────────
  const spinBtn        = $('spin-btn');
  const jackpotAmount  = $('jackpot-amount');
  const winningsAmount = $('winnings-amount');
  const balanceAmount  = $('balance-amount');
  const balanceDisplay = $('balance-display');
  const rankDisplay    = $('rank-display');
  const resultDisplay  = $('result-display');
  const nearMissBar    = $('near-miss-bar');
  const winFlash       = $('win-flash');
  const coinBurst      = $('coin-burst');
  const winCelebration = $('win-celebration');
  const winAmountDisp  = $('win-amount-display');
  const winLabelDisp   = $('win-label-display');
  const toastContainer = $('toast-container');
  const storageWarning = $('storage-warning');

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

  // ── Balance helpers ────────────────────────────────────────────────
  /**
   * Refresh the balance display and spin-button lock state.
   * @description Uses `GameLogic.canSpin(bet)` as the source of truth for
   *   whether the spin button should be disabled. The authoritative guard
   *   still lives inside `GameLogic.spin()` — this call is purely for UI
   *   responsiveness.
   * @returns {void}
   */
  function _updateBalance() {
    const bal = GameLogic.balance;
    if (balanceAmount) balanceAmount.textContent = GameLogic.formatMoney(bal);
    const affordable = GameLogic.canSpin(_currentBet);
    if (balanceDisplay) balanceDisplay.classList.toggle('balance-low', !affordable);
    if (!_spinning) spinBtn.disabled = !affordable;
  }

  /**
   * Refresh the player rank indicator.
   * @returns {void}
   */
  function _updateRank() {
    if (!rankDisplay) return;
    const rank = Leaderboard.getPlayerRank();
    if (rank === null) {
      rankDisplay.textContent = 'UNRANKED';
      rankDisplay.classList.remove('ranked');
    } else {
      rankDisplay.textContent = 'RANK #' + rank;
      rankDisplay.classList.add('ranked');
    }
  }

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
      _updateBalance(); // re-evaluate lock state for new bet
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SPIN HANDLER
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Handle a rejection returned by `GameLogic.spin()`.
   * @description Centralised in its own function so every rejection path
   *   (insufficient balance, invalid bet, future hard rejections) gets the
   *   same user-facing treatment: denied sound + ROBO quip + UI refresh.
   * @param {{reason:string, balance:number, bet:number}} rej
   * @returns {void}
   */
  function _handleSpinRejection(rej) {
    if (rej.reason === GameLogic.REJECT.INSUFFICIENT_BALANCE) {
      Audio.unlock();
      Audio.playDenied();
      UiMascot.showRobotBubble(INSUFFICIENT_FUNDS_QUIP);
      UiMascot.addChatMessage('ROBO', INSUFFICIENT_FUNDS_QUIP, true);
      resultDisplay.textContent = 'Insufficient balance.';
      UiMascot.setRobotMood('sad');
    } else {
      // Invalid bet / future reasons — still play the denied sound.
      Audio.playDenied();
      UiMascot.showRobotBubble('Spin rejected: ' + rej.reason);
    }
    _updateBalance();
  }

  /**
   * Execute a full spin cycle: security → resolve → animate → outcome.
   * @returns {Promise<void>} Resolves when the UI returns to its idle state.
   */
  async function _doSpin() {
    if (_spinning) return;

    Audio.unlock();

    // Anti-automation gate (timing + entropy). Unrelated to balance.
    const check = Security.checkSpin();
    if (!check.allowed) {
      UiMascot.showRobotBubble(_lockoutMessage(check.reason));
      return;
    }

    // Call GameLogic.spin *first*. The balance guard lives inside it now.
    const result = GameLogic.spin(_currentBet);

    // ── Rejection path ───────────────────────────────────────────
    if (result && result.rejected) {
      _handleSpinRejection(result);
      return;
    }

    // ── Accepted path ────────────────────────────────────────────
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

    // Achievement bookkeeping for the spin event itself.
    const spinUnlocked = Achievements.recordSpin();

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

    // Balance was debited (and any payout credited) atomically inside
    // GameLogic.spin. We only need to display the outcome here.

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
    _updateLuckIndicator();
    _updateBalance();
    _updateRank();
    UiPanels.updateStats();
    UiPanels.updateAchievements();
    UiPanels.refreshLeaderboard();

    _spinning = false;
    UiReels.setSpinning(false);
    // Re-evaluate disabled state (balance may now be too low for current bet).
    _updateBalance();
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
   * Suppressed in epilepsy-safe mode — rapid colour cycling is a flash risk.
   * @param {number} duration - ms.
   * @returns {void}
   */
  function _lightsCycle(duration) {
    if (document.body.dataset.epilepsysafe === 'true') return;
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
   * Show a brief top-center toast for a newly unlocked achievement.
   * Toasts stack below one another via flex column layout.
   * Enforces a cap of 3 simultaneous toasts — if the cap is reached the
   * oldest live toast is dismissed immediately before the new one is added,
   * so the stack never grows tall enough to overlap the jackpot or reels.
   * Respects the `data-reducedmotion` setting (CSS handles it).
   * @param {{label:string, desc:string}} def - Achievement definition.
   * @returns {void}
   */
  function _showAchievementToast(def) {
    if (!toastContainer) return;

    // Enforce a 3-toast cap: dismiss the oldest live toast before adding a new one.
    const live = toastContainer.querySelectorAll('.toast:not(.toast-out)');
    if (live.length >= 3) {
      const oldest = live[0];
      oldest.classList.add('toast-out');
      setTimeout(() => {
        if (oldest.parentNode) oldest.parentNode.removeChild(oldest);
      }, CFG.TOAST_SLIDE_OUT_MS);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      `<span class="toast-icon" aria-hidden="true">&#9733;</span>` +
      `<span class="toast-body">UNLOCKED: ${_esc(def.label)}</span>`;
    toastContainer.appendChild(toast);

    // After the visible duration, animate out and remove.
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, CFG.TOAST_SLIDE_OUT_MS);
    }, CFG.TOAST_VISIBLE_MS);
  }

  /**
   * Announce a newly unlocked achievement via bubble, chat, and toast.
   * @param {{label:string, desc:string}} def - Achievement definition.
   * @returns {void}
   */
  function _showAchievementUnlock(def) {
    Audio.playAchievement();
    UiMascot.showRobotBubble('ACHIEVEMENT UNLOCKED: ' + def.label + '!');
    UiMascot.addChatMessage('ROBO', 'Achievement unlocked: ' + def.label + '! ' + def.desc, true);
    _showAchievementToast(def);
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

  // ── Luck warmup indicator ──────────────────────────────────────────
  /**
   * Sync the five luck-node dots to the current pity meter.
   *
   * Iteration 16 — colour and motion refactor:
   *   • Single `.lk-active` class now drives the dull-grey → glowing-
   *     neon-orange transition (CSS handles the colour math).
   *   • When within `PULSE_FAST_WINDOW` spins of the pity threshold,
   *     active nodes also get `.lk-pulse-fast` for a non-linear
   *     anticipatory pulse — felt, not read.
   *   • Square-root compression of the raw fraction is retained so
   *     early progress reads clearly and the indicator plateaus in the
   *     upper range, keeping the exact trigger point unpredictable.
   *
   * No numeric label — players see "machine warming up", not "X/20 to
   * free win". The pity threshold remains private.
   * @returns {void}
   */
  function _updateLuckIndicator() {
    const nodes = document.querySelectorAll('.luck-node');
    if (!nodes.length) return;

    const threshold = GameLogic.CONFIG.PITY_THRESHOLD;
    const meter     = GameLogic.pityMeter;
    const raw       = Math.min(meter / threshold, 1);

    // Square-root compression: early progress reads clearly; late progress converges.
    const vis         = Math.sqrt(raw);
    const activeCount = Math.round(vis * nodes.length);

    // Within this many spins of the threshold, active nodes pulse fast.
    const PULSE_FAST_WINDOW = 2;
    const shouldPulse = (threshold - meter) <= PULSE_FAST_WINDOW && meter < threshold;

    nodes.forEach((node, i) => {
      // Iteration 16: strip legacy 3-band classes first so an old
      // persisted DOM state doesn't bleed into the new scheme.
      node.classList.remove('lk-cool', 'lk-warm', 'lk-hot',
                            'lk-active', 'lk-pulse-fast');
      if (i < activeCount) {
        node.classList.add('lk-active');
        if (shouldPulse) node.classList.add('lk-pulse-fast');
      }
    });
  }
  _updateLuckIndicator();

  // Hydrate winnings on boot.
  if (winningsAmount) {
    winningsAmount.textContent = GameLogic.formatMoney(GameLogic.totalWinnings);
  }

  // Hydrate balance and rank on boot.
  _updateBalance();
  _updateRank();

  // Re-render rank whenever leaderboard changes (bot ticks, etc.).
  Leaderboard.onChange(_updateRank);

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

  /**
   * Surface the header "memory error" badge if localStorage is unavailable.
   *
   * Iteration 16 — uses a CSS `.static` class after 10 s instead of
   * killing the animation cold via inline style. The static class
   * defines a lower-intensity non-animated state with a smooth 0.6 s
   * fade-out, so the handover from pulsing to stable is gentle. The
   * badge remains visible (so the player doesn't forget their session
   * is ephemeral) but stops competing with the jackpot and antenna
   * pulses for attention.
   * @returns {void}
   */
  function _showStorageWarning() {
    if (!storageWarning) return;
    storageWarning.hidden = false;
    storageWarning.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (storageWarning) storageWarning.classList.add('static');
    }, CFG.STORAGE_WARN_PULSE_MS);
  }

  setTimeout(() => {
    const storageOk = State.isStorageAvailable();

    // Pick the right greeting: normal path via Chat, or memory-error override.
    const greeting = storageOk
      ? Chat.getBootGreeting()
      : MEMORY_ERROR_GREETING;

    UiMascot.addChatMessage('ROBO', greeting, true);
    UiMascot.showRobotBubble(
      greeting.length > 60 ? greeting.slice(0, 57) + '...' : greeting
    );

    if (!storageOk) _showStorageWarning();

    // Welcome sting for returning players only (and only if storage works —
    // otherwise "returning" has no meaning).
    if (storageOk && State.isReturningPlayer()) {
      try { Audio.unlock(); Audio.playWelcome(); } catch (_e) { /* suspended context */ }
    }
  }, CFG.BOOT_DELAY_MS);

})();
