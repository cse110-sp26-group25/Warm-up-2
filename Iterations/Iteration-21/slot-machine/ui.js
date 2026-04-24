/**
 * ui.js — UI orchestration layer (Iteration 21).
 *
 * Top-level coordinator that wires together every sub-module (UiReels,
 * UiMascot, UiPanels) and drives the core spin cycle, win celebrations,
 * and boot sequence. Heavy lifting is split into:
 *
 *   • uiReels.js         — reel-strip construction and CSS-blur animation.
 *   • uiMascot.js        — robot mascot interactions, chat, idle quips.
 *   • uiPanels.js        — slide-over panels, settings, leaderboard, achievements.
 *   • toastManager.js    — priority-queue toast system (Iteration 17).
 *   • rtpCertification.js — build-time cert loader (Iteration 17).
 *
 * Iteration 21 — The Loop + Sensory Pacing + Hardware Scaling:
 *   • Tease state. When a spin's pre-determined result shows
 *     `symbols[0] === symbols[1]`, the spin loop extends reels 3/4/5
 *     by +1.0s/+1.5s/+2.0s (via `UiReels.spinDurations(fastPlay,
 *     teaseIndices)`) and kicks off `Audio.playTensionRamp(2000)`,
 *     a 220Hz→880Hz sawtooth slide that lands exactly as reel 5 stops.
 *   • Rank evolution sync. `UiMascot.updateRankEvolution()` is called
 *     alongside `_updatePlayerRankBadge()` on every win and at boot so
 *     the mascot's `.gold-plated` / `.polished-chrome` class stays in
 *     sync with the live leaderboard rank.
 *   • Hardware-scaling particle cap. `_spawnCoins` clamps to
 *     `CFG.MAX_PARTICLES` (15) when `settings.reducedMotion` is true,
 *     cutting compositor cost for jackpot bursts.
 *
 * Iteration 20 retained — tactile-feedback stack (screen shake, coin
 * fountain from spin-button origin, winning-symbol pop, floating rank
 * badge).
 *
 * Iteration 17 retained — priority-queue toasts + certificated RTP.
 * Iteration 16 retained — luck-warmup grey→orange + `.lk-pulse-fast`.
 * Iteration 14 retained — balance guard inside `GameLogic.spin()`.
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
    /**
     * Threshold (payout / bet) at which the Iteration 20 tactile-feedback
     * stack engages: screen shake + coin fountain + winning-symbol pop.
     * A 4-of-a-kind `gear` at bet $1 pays 40× — below this threshold.
     * A 4-of-a-kind `seven` at bet $1 pays 135× — well above.
     * Picks up most 4-of-a-kind outcomes on high-value symbols and every
     * 5-of-a-kind, without firing on routine 3-of-a-kind wins.
     */
    JUICE_WIN_MULTIPLE: 50,
    /** Small win celebration duration (ms). */
    SMALL_WIN_MS:       1500,
    /** Big win celebration duration (ms). */
    BIG_WIN_MS:         3000,
    /** Jackpot celebration duration (ms). */
    JACKPOT_WIN_MS:     5000,
    /**
     * Coins spawned per tier. Iteration 20: Big and Jackpot counts raised
     * into the plan-mandated 50-100 band. "Small" is kept modest so
     * routine 3-of-a-kind wins don't become visually exhausting.
     */
    COINS_SMALL:        12,
    COINS_BIG:          60,
    COINS_JACKPOT:      100,
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
    /**
     * Iteration 20 — screen-shake tuning for the tactile-feedback stack.
     * SHAKE_MS is the total duration of the CSS keyframe animation;
     * SHAKE_INTENSITY_MAX caps the translate amount in pixels so the
     * effect reads as impactful without being nauseating.
     */
    SHAKE_MS:             600,
    SHAKE_INTENSITY_MAX:  14,
    /**
     * Iteration 20 — winning-symbol pop duration (ms). The CSS transform
     * `scale(1.1)` is applied to symbols on the centre row of winning
     * reels for this long before relaxing back to scale(1).
     */
    WINNER_POP_MS:        900,
    /**
     * Iteration 21 — hardware-scaling particle cap.
     *
     * When the user has `reducedMotion` or `epilepsySafe` enabled, the
     * coin fountain is clamped to this many particles (instead of the
     * full 60 / 100 for BIG / JACKPOT wins). The celebration still
     * lands — the coins still originate from the spin button, still
     * erupt upward — but the compositor cost is roughly cut in six.
     *
     * 15 was chosen as the smallest count that still reads as a "burst"
     * rather than a "sparse sprinkle" on visual inspection.
     */
    MAX_PARTICLES:        15,
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

  // ═══════════════════════════════════════════════════════════════════
  //  HEADER HEIGHT — dynamic CSS variable (Iteration 17)
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Measure the real rendered header height and write it into the
   * `--header-height` CSS variable on <html>.
   *
   * This single function is the source of truth for toast container
   * positioning. Using getBoundingClientRect() is accurate regardless of
   * whether the header has wrapped to multiple lines (e.g. on 780–1100px
   * tablets in landscape where the nav buttons push the header taller).
   *
   * Layout thrashing avoidance: the read (getBoundingClientRect) is done
   * once inside a requestAnimationFrame callback, which batches the
   * measurement with the browser's natural paint cycle so no extra layout
   * reflows are triggered.
   * @returns {void}
   */
  const _siteHeader = document.querySelector('.site-header');
  let   _headerRafId = null;

  function _updateHeaderHeight() {
    // Cancel any pending frame — only the latest measurement matters.
    if (_headerRafId !== null) cancelAnimationFrame(_headerRafId);

    _headerRafId = requestAnimationFrame(() => {
      _headerRafId = null;
      if (!_siteHeader) return;
      const h = _siteHeader.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--header-height', h + 'px');
    });
  }

  // Listen for layout-changing events that alter header height.
  window.addEventListener('resize',            _updateHeaderHeight, { passive: true });
  window.addEventListener('orientationchange', _updateHeaderHeight, { passive: true });

  // Measure immediately so the CSS variable is correct before any toast
  // could possibly appear (well before the 600ms boot greeting delay).
  _updateHeaderHeight();

  // ═══════════════════════════════════════════════════════════════════
  //  TOAST MANAGER INITIALISATION (Iteration 17)
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Wire the ToastManager to the DOM container and match its timing
   * constants to the existing CFG values so slide-out animations still
   * align with the CSS `toastDropOut` keyframe duration (300 ms).
   */
  ToastManager.init(toastContainer, {
    visibleMs:     CFG.TOAST_VISIBLE_MS,
    slideOutMs:    CFG.TOAST_SLIDE_OUT_MS,
    batchWindowMs: 500,   // 500ms window collapses rapid achievement cascades
  });

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

    // ── Iteration 21 — Tease state ────────────────────────────────────
    //
    // If the first two reels land on the same symbol, we've got a
    // guaranteed "two-of-a-kind or better" win AND the player can see
    // two-matching while reels 3/4/5 are still spinning. Extend the
    // spin duration of those trailing reels by +1.0s/+1.5s/+2.0s to
    // amplify the "is it coming?" anticipation, and kick off the audio
    // tension ramp that slides from 220Hz to 880Hz across the extended
    // window. The max extra delay (reel 5, +2000 ms) sets the ramp
    // duration so the audio ends exactly when the last teased reel
    // lands.
    //
    // The tease is driven purely by the pre-determined result.symbols
    // values; it is NOT a probabilistic anticipation hook, which means
    // the tension is always resolved truthfully (no fake tease that
    // doesn't match the landed result).
    const teaseIndices = [];
    let   teaseRampMs  = 0;
    if (result.symbols
        && result.symbols[0] !== undefined
        && result.symbols[0] === result.symbols[1]) {
      teaseIndices.push(2, 3, 4);
      teaseRampMs = UiReels.CFG.TEASE_EXTRA_MS[4] || 2000;
      Audio.playTensionRamp(teaseRampMs);
    }

    const durations = UiReels.spinDurations(fastPlay, teaseIndices);

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

    // ── Iteration 20: Tactile-feedback stack ─────────────────────────
    //
    // Screen shake on any win at or above JUICE_WIN_MULTIPLE × bet.
    // Intensity scales by win tier so Jackpot shakes harder than 4oak.
    //
    // Note: we gate on actual payout rather than `type` because a
    // 4-of-a-kind on a low-value symbol (e.g. `screw` paying 2×) would
    // not meet the plan's "> 50× bet" threshold, whereas a 4-of-a-kind
    // `seven` (135×) clearly does.
    const multiple = result.payout / Math.max(_currentBet, 1);
    if (result.type === 'jackpot') {
      _triggerScreenShake(CFG.SHAKE_INTENSITY_MAX);            // ≈ 14 px
    } else if (multiple >= CFG.JUICE_WIN_MULTIPLE) {
      // Scale intensity with magnitude, capped by SHAKE_INTENSITY_MAX.
      // A 50× win shakes at ~8 px; a 500× 5oak at the ~14 px ceiling.
      const intensity = Math.min(
        8 + Math.log2(multiple / CFG.JUICE_WIN_MULTIPLE) * 2,
        CFG.SHAKE_INTENSITY_MAX
      );
      _triggerScreenShake(intensity);
    }

    // Winning-symbol pop — derive match count from result.type. The
    // `type` string is authoritative; gameLogic.js resolves matchCount
    // internally and reports the tier, and we map the tier back here
    // without exposing matchCount on the API surface.
    const matchCountByType = { two: 2, three: 3, four: 4, five: 5, jackpot: 3 };
    const matchCount = matchCountByType[result.type] || 0;
    if (matchCount >= 2) _popWinningSymbols(matchCount);

    // ── End tactile-feedback stack ───────────────────────────────────

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

    // Iteration 20: refresh the floating rank badge after the
    // leaderboard records the win. This runs last so the badge
    // reflects the post-win rank, not the pre-win rank.
    _updatePlayerRankBadge();

    // Iteration 21: the mascot's gold-plated / polished-chrome class
    // is also rank-dependent, so sync it with the same data source.
    // Idempotent if rank didn't change into/out of a tier boundary.
    if (UiMascot && typeof UiMascot.updateRankEvolution === 'function') {
      UiMascot.updateRankEvolution();
    }

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
    // No toast for small wins — the win-celebration overlay is sufficient.
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

    // Iteration 17: Priority-3 toast so big-win can preempt queued
    // achievement notifications but never a jackpot notification.
    ToastManager.show({
      message:  'BIG WIN! ' + GameLogic.formatMoney(amount),
      priority: ToastManager.PRIORITY.BIG_WIN,
      key:      'bigwin',
      icon:     '&#9733;&#9733;',
      batchable: false,  // each big win is a distinct event
    });
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

    // Iteration 17: Priority-4 (JACKPOT) toast — highest tier, never
    // batched, always preempts everything else currently visible.
    ToastManager.show({
      message:  '\u2605 JACKPOT! ' + GameLogic.formatMoney(amount),
      priority: ToastManager.PRIORITY.JACKPOT,
      key:      null,      // null key = never batched
      icon:     '&#9733;',
      batchable: false,
    });
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
   * Emit a coin fountain erupting from the Spin button.
   *
   * Iteration 20 — origin relocated from the centre of the machine to
   * the spin-button centroid. Coins are still rendered inside the
   * `#coin-burst` overlay (which covers the full machine frame) but each
   * coin's translation vector is computed relative to the spin button's
   * position in the coin-burst's coordinate space, so the effect reads
   * as "erupts from the button the player just pressed."
   *
   * The ejection angles are biased upward and outward (−120° to −60°
   * relative to horizontal, i.e. the upper half-circle) to give a
   * fountain silhouette rather than a symmetric radial burst — this
   * matches player expectation of "coins spraying from where I clicked."
   *
   * Suppressed in epilepsy-safe mode (JS-side guard — the static coin
   * glyphs would remain visible if we only suppressed the CSS animation).
   *
   * @param {number} count - Number of coins to spawn (CFG.COINS_*).
   * @returns {void}
   */
  function _spawnCoins(count) {
    if (document.body.dataset.epilepsysafe === 'true') return;
    if (!coinBurst || !spinBtn) return;
    coinBurst.innerHTML = '';

    // ── Iteration 21 — hardware-scaling particle cap ─────────────────
    //
    // When the user has reduced-motion enabled in their settings, the
    // coin count is clamped to CFG.MAX_PARTICLES (15) to cut compositor
    // cost. The clamp applies to reducedMotion only — the epilepsy-safe
    // guard above has already returned before we get here, so we never
    // spawn any coins in that mode. The mandate also calls for a low-
    // performance-device clamp; we treat reducedMotion as the user's
    // explicit request for that behaviour, which is more reliable than
    // a heuristic device-performance score that can be wrong either way.
    //
    // If `count` is already below MAX_PARTICLES (e.g. COINS_SMALL=12),
    // the clamp is a no-op — `Math.min` guarantees we never inflate.
    const reducedMotion = !!(State.get('settings.reducedMotion'));
    if (reducedMotion) {
      count = Math.min(count, CFG.MAX_PARTICLES);
    }
    // ───────────────────────────────────────────────────────────────────

    // Compute the spin button's centre in coin-burst local coordinates.
    // coinBurst is absolutely positioned inside the machine-frame, so
    // subtracting its bounding rect gives the correct local origin.
    const burstRect = coinBurst.getBoundingClientRect();
    const btnRect   = spinBtn.getBoundingClientRect();
    const originX   = (btnRect.left + btnRect.width  / 2) - burstRect.left;
    const originY   = (btnRect.top  + btnRect.height / 2) - burstRect.top;

    for (let i = 0; i < count; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin';

      // Upper hemisphere angles: −π (left) to 0 (right), never below horizontal.
      // Add a small random jitter so parallel bursts don't look mechanical.
      const baseAngle = -Math.PI + (i / count) * Math.PI;
      const jitter    = (RNG.random() - 0.5) * 0.4;
      const angle     = baseAngle + jitter;

      // Scale distance by count so 100-coin jackpots get a proportionally
      // wider spread. The baseline is 80 px; the fountain reaches 180+ px
      // for a jackpot, which fills the machine frame nicely.
      const dist = 80 + RNG.randInt(0, 100);
      const tx   = Math.cos(angle) * dist;
      const ty   = Math.sin(angle) * dist;  // negative = upward (canvas coords)

      coin.style.left = originX + 'px';
      coin.style.top  = originY + 'px';
      coin.style.setProperty('--tx', tx + 'px');
      coin.style.setProperty('--ty', ty + 'px');
      coin.style.animationDelay = RNG.randInt(0, 250) + 'ms';
      coin.textContent = '$';
      coinBurst.appendChild(coin);
    }

    // Clear the overlay shortly after the keyframes complete. The 1400ms
    // window covers the worst-case 250ms delay + ~1000ms animation.
    setTimeout(() => { coinBurst.innerHTML = ''; }, 1400);
  }

  /**
   * Trigger a screen shake on `#machine-frame`.
   *
   * Iteration 20 — the tactile-feedback punch that accompanies any win
   * above `JUICE_WIN_MULTIPLE` × bet. Intensity is passed in pixels on
   * each axis and written to inline CSS custom properties (`--shake-x`,
   * `--shake-y`), which the `.shake` keyframe then multiplies by its
   * per-step coefficients. This lets a single CSS keyframe handle any
   * intensity from subtle (4-of-a-kind) to forceful (jackpot).
   *
   * The method is an exclusive event — if called while a shake is in
   * progress the previous animation is cancelled and replaced, so a
   * double-win (e.g. "5-of-a-kind + achievement unlock") produces a
   * single clean shake rather than a muddy overlap.
   *
   * Suppressed in epilepsy-safe mode both via the CSS block
   * (`animation: none`) and an early return here so no transform
   * property is ever set on the frame in that mode.
   *
   * @param {number} intensity - Shake amplitude in pixels (typically 6-14).
   * @returns {void}
   */
  function _triggerScreenShake(intensity) {
    if (document.body.dataset.epilepsysafe === 'true') return;
    const frame = $('machine-frame');
    if (!frame) return;

    // Clamp intensity so a runaway caller can't make the page unusable.
    const clamped = Math.max(2, Math.min(intensity, CFG.SHAKE_INTENSITY_MAX));
    frame.style.setProperty('--shake-x',        clamped + 'px');
    frame.style.setProperty('--shake-y',        clamped + 'px');
    frame.style.setProperty('--shake-duration', CFG.SHAKE_MS + 'ms');

    // Restart the animation reliably: remove the class, force reflow,
    // then re-add. Without the void-read, class-toggling in the same
    // frame does not re-trigger the animation in most browsers.
    frame.classList.remove('shake');
    void frame.offsetWidth;  // force reflow — intentional no-op read
    frame.classList.add('shake');

    // Auto-clear after the animation so the transform doesn't linger.
    setTimeout(() => {
      if (frame) frame.classList.remove('shake');
    }, CFG.SHAKE_MS + 50);
  }

  /**
   * Apply the winning-symbol scale(1.1) pop to the matched symbols on
   * the centre row of winning reels.
   *
   * Iteration 20 — visual emphasis for the payline. Given a `matchCount`
   * from the spin result (2/3/4/5 consecutive matches starting at reel 0),
   * this function finds the centre-row symbol in each of those reels and
   * adds the `.winning-symbol` class. The CSS keyframe handles the pop.
   *
   * The function is idempotent — repeated calls on the same symbols will
   * re-trigger the animation because we remove + reflow + re-add the
   * class the same way the screen shake does.
   *
   * @param {number} matchCount - Number of leading reels that matched (2-5).
   * @returns {void}
   */
  function _popWinningSymbols(matchCount) {
    if (matchCount < 2) return;
    for (let r = 0; r < matchCount; r++) {
      const strip = $('strip-' + r);
      if (!strip) continue;
      // The centre row is the middle (VISIBLE_ROWS=3 → index 1) of the
      // currently-visible three-symbol window. UiReels positions the
      // strip via translateY so the resting centre is always `strip`'s
      // middle child of the three visible ones; its DOM node has a
      // stable `.symbol` class. We locate it via the reel-container's
      // middle of three visible children, but the simpler and more
      // robust approach used here is to pop EVERY symbol currently on
      // the reel-strip at the "is-active" landed index — which UiReels
      // tags with `.is-centre` after the spin settles. If the tag is
      // unavailable (older UiReels) we fall back to the middle child.
      const centreSymbol =
        strip.querySelector('.symbol.is-centre') ||
        strip.children[Math.floor(strip.children.length / 2)];
      if (!centreSymbol) continue;

      // Parameterise the keyframe duration so epilepsy-safe mode (which
      // zeroes the animation) still lets the CSS cascade apply cleanly.
      centreSymbol.style.setProperty('--winner-pop-ms', CFG.WINNER_POP_MS + 'ms');
      centreSymbol.classList.remove('winning-symbol');
      void centreSymbol.offsetWidth;
      centreSymbol.classList.add('winning-symbol');

      setTimeout(() => {
        if (centreSymbol) centreSymbol.classList.remove('winning-symbol');
      }, CFG.WINNER_POP_MS + 50);
    }
  }

  /**
   * Sync the floating `#player-rank-badge` with the live Leaderboard rank.
   *
   * Iteration 20 — called after each win so the badge reflects rank
   * changes in real time. The badge is hidden until the player has a
   * rank (i.e. first win has been recorded); from then on, any rank
   * improvement fires the `.rank-up` pulse.
   *
   * @returns {void}
   */
  function _updatePlayerRankBadge() {
    const badge = $('player-rank-badge');
    const value = $('player-rank-badge-value');
    if (!badge || !value || typeof Leaderboard === 'undefined') return;

    const rank = Leaderboard.getPlayerRank();
    if (rank === null || rank === undefined) {
      badge.hidden = true;
      return;
    }

    // Reveal if hidden; detect improvement for celebratory pulse.
    const prev = Number(badge.dataset.prevRank) || null;
    badge.hidden = false;
    value.textContent = '#' + rank;
    badge.dataset.prevRank = String(rank);

    // Only pulse on a strict improvement (smaller rank number), not on
    // first-ever display and not on the repeated "still rank 4" call
    // that happens after most spins.
    if (prev !== null && rank < prev
        && document.body.dataset.epilepsysafe !== 'true') {
      badge.classList.remove('rank-up');
      void badge.offsetWidth;
      badge.classList.add('rank-up');
      setTimeout(() => badge.classList.remove('rank-up'), 1200);
    }
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
   * Announce a newly unlocked achievement via bubble, chat, and toast.
   *
   * Iteration 17: `_showAchievementToast` is removed. All toast creation
   * now goes through `ToastManager.show()` with PRIORITY.ACHIEVEMENT (1).
   * Rapid cascades (e.g. "first spin" + "10 spins" both firing on spin 10)
   * are automatically coalesced by the 500ms batch window into a single
   * "2× UNLOCKED: ..." toast, preventing notification floods.
   *
   * @param {{label:string, desc:string}} def - Achievement definition.
   * @returns {void}
   */
  function _showAchievementUnlock(def) {
    Audio.playAchievement();
    UiMascot.showRobotBubble('ACHIEVEMENT UNLOCKED: ' + def.label + '!');
    UiMascot.addChatMessage('ROBO', 'Achievement unlocked: ' + def.label + '! ' + def.desc, true);

    // Route through the priority toast manager.
    // key='achievement' enables batching: multiple rapid achievement unlocks
    // within the 500ms window will be shown as a single grouped toast.
    ToastManager.show({
      message:  'UNLOCKED: ' + def.label,
      priority: ToastManager.PRIORITY.ACHIEVEMENT,
      key:      'achievement',
      icon:     '&#9733;',
      batchable: true,
    });

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

  // ── Async boot sequence ───────────────────────────────────────────────
  // Iteration 17: the boot sequence is now async so we can await the cert
  // load before deciding whether to start the background worker. The actual
  // UI greeting still fires after CFG.BOOT_DELAY_MS — the cert load runs in
  // parallel so it doesn't add any perceptible delay.
  (async function _boot() {
    // ── 1. Load RTP certification (non-blocking) ────────────────────
    // The cert load happens immediately (not after BOOT_DELAY_MS) so it
    // has time to complete before the player might trigger a spin.
    const certLoaded = await RtpCertification.load();

    if (certLoaded) {
      // The pre-generated certification is valid — no runtime simulation
      // needed. The background worker below is optional and off by default.
      // Iteration 21 — gated behind DEBUG_MODE so production consoles
      // stay clean. Developers can flip `window.__ROBO_SLOTS_DEBUG = true`
      // in DevTools to see the boot trace.
      if (GameLogic.CONFIG.DEBUG_MODE === true ||
          (typeof window !== 'undefined' && window.__ROBO_SLOTS_DEBUG === true)) {
        console.info('[boot] RTP cert valid — runtime simulation skipped.');
      }
    } else {
      // Cert missing or stale (e.g. first run, or payouts changed without
      // re-running the build script). Log a warning but do not block
      // gameplay — the game is fully playable without a cert.
      // Warnings stay visible regardless of DEBUG_MODE because a missing
      // cert is a real configuration issue a developer should see.
      console.warn(
        '[boot] rtp_certification.json not loaded. ' +
        'Run `node scripts/verifyRtp.js` to generate it.'
      );
    }

    // ── 2. Optional background RTP worker ──────────────────────────
    // Starts only if window.__RTP_BACKGROUND_VERIFY === true or
    // localStorage.rtp_bg_verify === '1'. Off by default.
    // Runs entirely on a separate thread; zero impact on gameplay.
    RtpCertification.startBackgroundWorker(GameLogic.CONFIG, {
      totalSpins: 3_000_000,
      batchSize:  300_000,
    });

    // ── 3. Delayed UI greeting (original BOOT_DELAY_MS timing) ─────
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

      // Iteration 21 — sync rank-dependent UI at boot so a returning
      // player with pre-existing winnings sees their rank badge and
      // mascot evolution immediately, without needing to spin first.
      _updatePlayerRankBadge();
      if (UiMascot && typeof UiMascot.updateRankEvolution === 'function') {
        UiMascot.updateRankEvolution();
      }
    }, CFG.BOOT_DELAY_MS);
  })();

})();
