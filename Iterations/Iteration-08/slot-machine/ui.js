/**
 * ui.js — UI orchestration layer (Iteration 08).
 *
 * Wires together every module (State, GameLogic, Audio, Achievements,
 * Leaderboard, Chat, Security) and drives all DOM mutations. Kept in an
 * IIFE so nothing leaks to `window`.
 *
 * New in Iteration 08:
 *   • Reel animation uses a physics-inspired "spin → decelerate → overshoot
 *     → settle" pipeline with per-reel stagger.
 *   • Vertical motion-blur via an SVG filter (`url(#vblur)`) is toggled on
 *     the `.reel-strip` during the high-speed phase only.
 *   • Settings, player avatar, and the spin button label all hydrate from
 *     the persistent `State` module on boot.
 *   • A "Wipe Saved Data" control clears persistent state.
 *   • Boot greeting varies for first-time vs returning vs long-absent players.
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIG — no magic numbers inline.
  // ═══════════════════════════════════════════════════════════════════
  /** @type {Object} Tunables used only by the UI layer. */
  const CFG = Object.freeze({
    /** Height of one symbol slot (px). Must match CSS --symbol-h. */
    SYMBOL_HEIGHT:      80,
    /** Symbol-strip repetitions in each reel element (for seamless scroll). */
    STRIP_REPS:         5,
    /** ms before the first reel stops. */
    FIRST_STOP_MS:      900,
    /** Extra ms added per subsequent reel (staggered deceleration). */
    PER_REEL_STAGGER:   250,
    /** ms spent on the overshoot → settle bounce. */
    OVERSHOOT_MS:       180,
    /** Overshoot distance (symbol heights). */
    OVERSHOOT_FRACTION: 0.5,
    /** Symbol-heights travelled during the high-speed phase (approx). */
    HIGH_SPEED_WRAPS:   8,
    /** ms of idle inactivity before ROBO offers a quip. */
    IDLE_QUIP_MS:       18000,
    /** Refresh cadence for the jackpot display. */
    JACKPOT_POLL_MS:    2000,
    /** Refresh cadence for the stats widget. */
    STATS_POLL_MS:      5000,
    /** Bubble hide delay after robot interactions. */
    BUBBLE_HIDE_MS:     4000,
    /** Threshold of (payout / bet) above which a "big win" celebration fires. */
    BIG_WIN_MULTIPLE:   10,
    /** Small win celebration duration (ms). */
    SMALL_WIN_MS:       1500,
    /** Big win celebration duration (ms). */
    BIG_WIN_MS:         3000,
    /** Jackpot celebration duration (ms). */
    JACKPOT_WIN_MS:     5000,
    /** Coin counts by celebration tier. */
    COINS_SMALL:        8,
    COINS_BIG:          20,
    COINS_JACKPOT:      40,
    /** Max chat messages retained in the mini-chat log. */
    MINI_CHAT_LIMIT:    30,
    /** Max chat messages retained in the full room. */
    ROOM_CHAT_LIMIT:    60,
  });

  // ── DOM helpers ────────────────────────────────────────────────────
  /** @param {string} id @returns {HTMLElement} */
  const $  = id  => document.getElementById(id);
  /** @param {string} sel @returns {NodeListOf<HTMLElement>} */
  const $$ = sel => document.querySelectorAll(sel);

  // ── DOM references ─────────────────────────────────────────────────
  const spinBtn         = $('spin-btn');
  const jackpotAmount   = $('jackpot-amount');
  const winningsAmount  = $('winnings-amount');
  const resultDisplay   = $('result-display');
  const nearMissBar     = $('near-miss-bar');
  const winFlash        = $('win-flash');
  const coinBurst       = $('coin-burst');
  const winCelebration  = $('win-celebration');
  const winAmountDisp   = $('win-amount-display');
  const winLabelDisp    = $('win-label-display');
  const robotBubble     = $('robot-bubble');
  const robotMascot     = $('robot-mascot');
  const chatMessages    = $('chat-messages');
  const chatForm        = $('chat-form');
  const chatInput       = $('chat-input');
  const lbList          = $('leaderboard-list');
  const lbFull          = $('leaderboard-full');
  const achGrid         = $('achievements-grid');
  const statsSpins      = $('stat-spins');
  const statsWins       = $('stat-wins');
  const statsBest       = $('stat-best');
  const statsJackpots   = $('stat-jackpots');
  const statsTime       = $('stat-time');
  const panelOverlay    = $('panel-overlay');

  // Settings controls
  const toggleSound         = $('toggle-sound');
  const toggleMusic         = $('toggle-music');
  const toggleReducedMotion = $('toggle-reduced-motion');
  const toggleEpilepsySafe  = $('toggle-epilepsy-safe');
  const volumeMaster        = $('volume-master');
  const volumeMusic         = $('volume-music');
  const playerNameInput     = $('player-name');
  const btnResetData        = $('btn-reset-data');

  // ── Symbol SVGs ─────────────────────────────────────────────────────
  /** @type {Object<string,string>} Hand-drawn SVG strings keyed by symbol id. */
  const SYMBOL_SVG = {
    jackpot: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="36" fill="#ffd600" stroke="#ff6f00" stroke-width="3"/>
      <text x="40" y="30" text-anchor="middle" font-family="monospace" font-size="11" font-weight="900" fill="#b71c1c">JACK</text>
      <text x="40" y="46" text-anchor="middle" font-family="monospace" font-size="11" font-weight="900" fill="#b71c1c">POT</text>
      <polygon points="40,52 44,62 36,62" fill="#e53935"/>
    </svg>`,
    seven: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="64" height="64" rx="10" fill="#e53935" stroke="#ff5252" stroke-width="2"/>
      <text x="40" y="58" text-anchor="middle" font-family="monospace" font-size="46" font-weight="900" fill="#fff176">7</text>
    </svg>`,
    gear: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="28" fill="#546e7a" stroke="#78909c" stroke-width="2"/>
      <circle cx="40" cy="40" r="12" fill="#263238"/>
      ${Array.from({length:8},(_,i)=>{
        const a=i*(Math.PI/4); const cos=Math.cos(a); const sin=Math.sin(a);
        const x1=40+cos*24; const y1=40+sin*24;
        return `<rect x="${x1-4}" y="${y1-4}" width="8" height="8" rx="2" fill="#69f0ae" transform="rotate(${i*45} ${x1} ${y1})"/>`;
      }).join('')}
      <circle cx="40" cy="40" r="5" fill="#69f0ae"/>
    </svg>`,
    bolt: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <polygon points="46,8 24,44 38,44 34,72 56,36 42,36" fill="#fff176" stroke="#ffd600" stroke-width="2" stroke-linejoin="round"/>
    </svg>`,
    chip: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="18" width="44" height="44" rx="6" fill="#1565c0" stroke="#42a5f5" stroke-width="2"/>
      <rect x="26" y="26" width="28" height="28" rx="3" fill="#0d47a1"/>
      <circle cx="34" cy="34" r="3" fill="#69f0ae"/><circle cx="46" cy="34" r="3" fill="#69f0ae"/>
      <circle cx="34" cy="46" r="3" fill="#69f0ae"/><circle cx="46" cy="46" r="3" fill="#69f0ae"/>
      <rect x="12" y="30" width="6" height="4" rx="1" fill="#78909c"/>
      <rect x="12" y="46" width="6" height="4" rx="1" fill="#78909c"/>
      <rect x="62" y="30" width="6" height="4" rx="1" fill="#78909c"/>
      <rect x="62" y="46" width="6" height="4" rx="1" fill="#78909c"/>
      <rect x="30" y="12" width="4" height="6" rx="1" fill="#78909c"/>
      <rect x="46" y="12" width="4" height="6" rx="1" fill="#78909c"/>
      <rect x="30" y="62" width="4" height="6" rx="1" fill="#78909c"/>
      <rect x="46" y="62" width="4" height="6" rx="1" fill="#78909c"/>
    </svg>`,
    robo: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="28" width="40" height="34" rx="6" fill="#e53935"/>
      <rect x="28" y="16" width="24" height="14" rx="4" fill="#e53935"/>
      <rect x="24" y="36" width="12" height="10" rx="2" fill="#fff"/>
      <rect x="44" y="36" width="12" height="10" rx="2" fill="#fff"/>
      <circle cx="30" cy="41" r="3" fill="#1a237e"/>
      <circle cx="50" cy="41" r="3" fill="#1a237e"/>
      <rect x="26" y="50" width="28" height="6" rx="2" fill="#b71c1c"/>
      <rect x="14" y="36" width="6" height="18" rx="3" fill="#c62828"/>
      <rect x="60" y="36" width="6" height="18" rx="3" fill="#c62828"/>
    </svg>`,
    nut: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <polygon points="40,10 64,24 64,56 40,70 16,56 16,24" fill="#78909c" stroke="#b0bec5" stroke-width="2"/>
      <circle cx="40" cy="40" r="14" fill="#263238"/>
      <circle cx="40" cy="40" r="8" fill="#37474f" stroke="#546e7a" stroke-width="1.5"/>
    </svg>`,
    screw: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="22" r="16" fill="#90a4ae" stroke="#b0bec5" stroke-width="2"/>
      <line x1="30" y1="22" x2="50" y2="22" stroke="#263238" stroke-width="3" stroke-linecap="round"/>
      <line x1="40" y1="12" x2="40" y2="32" stroke="#263238" stroke-width="3" stroke-linecap="round"/>
      <rect x="37" y="38" width="6" height="24" rx="2" fill="#78909c"/>
      ${Array.from({length:5},(_,i)=>`<line x1="36" y1="${42+i*4}" x2="44" y2="${42+i*4}" stroke="#546e7a" stroke-width="1.5"/>`).join('')}
    </svg>`,
  };

  // ── Reel-strip construction ────────────────────────────────────────
  /**
   * Build the DOM symbol-strip for one reel column.
   * @description Repeats the reel `CFG.STRIP_REPS` times so the animation
   *   never visually runs off the end of the strip.
   * @param {number} reelIndex - Reel column index (0–4).
   * @returns {void}
   */
  function _buildStrip(reelIndex) {
    const strip = $('strip-' + reelIndex);
    strip.innerHTML = '';
    const reel  = GameLogic.REELS[reelIndex];
    const total = reel.length;
    for (let rep = 0; rep < CFG.STRIP_REPS; rep++) {
      for (let i = 0; i < total; i++) {
        const div = document.createElement('div');
        div.className = 'reel-symbol';
        div.innerHTML = SYMBOL_SVG[reel[i]] || SYMBOL_SVG.screw;
        strip.appendChild(div);
      }
    }
  }
  for (let i = 0; i < GameLogic.REEL_COUNT; i++) _buildStrip(i);

  // ── Spin-local state ───────────────────────────────────────────────
  /** @type {boolean} Is a spin currently in progress? */
  let _spinning = false;
  /** @type {number} Currently selected bet amount. */
  let _currentBet = 1;
  /** @type {string} Display name of the current player. */
  let _playerName = 'YOU';
  /** @type {string} Hex avatar colour of the current player. */
  let _playerColor = '#fff176';
  /** @type {number|null} Handle for the idle-quip timer. */
  let _idleTimer = null;

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
      _resetIdle();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  REEL ANIMATION — spin → decelerate → overshoot → settle
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Promise-returning setTimeout.
   * @param {number} ms - Delay.
   * @returns {Promise<void>} Resolves after `ms`.
   */
  function _delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  /**
   * Animate one reel through its full spin cycle.
   * @description
   *   Phase 1 (deceleration):  the strip travels a large distance with
   *     an ease-out curve while a motion-blur filter is applied.
   *   Phase 2 (overshoot):     the strip continues past its target by
   *     `CFG.OVERSHOOT_FRACTION` of a symbol height.
   *   Phase 3 (settle):        the strip bounces back to the exact target.
   *   Phase 4 (snap):          transition is cleared and the strip is
   *     pinned to a clean "2nd repetition" target position — this keeps
   *     the numeric transform small to prevent sub-pixel drift across
   *     dozens of spins.
   * @param {number} reelIndex    - Reel column index (0–4).
   * @param {number} targetStop   - Strip index of the winning centre symbol.
   * @param {number} spinDuration - Total Phase-1 duration in ms.
   * @returns {Promise<void>} Resolves when the reel has fully settled.
   */
  function _animateReel(reelIndex, targetStop, spinDuration) {
    return new Promise(resolve => {
      const strip = $('strip-' + reelIndex);
      const reel  = GameLogic.REELS[reelIndex];
      const total = reel.length;
      const symH  = CFG.SYMBOL_HEIGHT;

      // Start position: random symbol centred in the 2nd strip repetition.
      const startPos  = (total + RNG.randInt(0, total - 1) - 1) * symH;
      // Target position: targetStop centred (row 1) in 2nd repetition.
      const targetPos = (total + targetStop - 1) * symH;
      // Final "wrap" position for the high-speed phase — adds HIGH_SPEED_WRAPS
      // full rotations so the reel looks like it's really flying.
      const finalPos  = targetPos + CFG.HIGH_SPEED_WRAPS * symH;
      // Overshoot carries us past the final position before we bounce back.
      const overshoot = symH * CFG.OVERSHOOT_FRACTION;

      // Snap to start without animating.
      strip.style.transition = 'none';
      strip.style.transform  = `translateY(-${startPos}px)`;
      // Apply motion blur as the strip begins to race.
      strip.classList.remove('is-decelerating', 'is-settling');
      strip.classList.add('is-spinning');

      // Force reflow so the next transition is applied cleanly.
      // eslint-disable-next-line no-unused-expressions
      strip.offsetHeight;

      // Phase 1: decelerate toward `finalPos + overshoot`.
      strip.style.transition = `transform ${spinDuration}ms cubic-bezier(0.12, 0.82, 0.18, 1)`;
      strip.style.transform  = `translateY(-${finalPos + overshoot}px)`;

      // ~60% into Phase 1 the strip is slow enough that motion blur stops.
      setTimeout(() => {
        if (_spinning === false) return; // spin cancelled — bail safely
        strip.classList.remove('is-spinning');
        strip.classList.add('is-decelerating');
      }, Math.floor(spinDuration * 0.6));

      // End of Phase 1 → Phase 2 (bounce back to target).
      setTimeout(() => {
        strip.classList.remove('is-decelerating');
        strip.classList.add('is-settling');
        strip.style.transition = `transform ${CFG.OVERSHOOT_MS}ms cubic-bezier(0.4, 0, 0.3, 1)`;
        strip.style.transform  = `translateY(-${finalPos}px)`;
      }, spinDuration);

      // End of Phase 2 → Phase 4 (snap to clean target, resolve).
      setTimeout(() => {
        strip.classList.remove('is-settling');
        strip.style.transition = 'none';
        strip.style.transform  = `translateY(-${targetPos}px)`;
        resolve();
      }, spinDuration + CFG.OVERSHOOT_MS);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SPIN HANDLER
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Execute a full spin cycle: security → resolve → animate → outcome.
   * @returns {Promise<void>} Resolves when UI is back to its idle state.
   */
  async function _doSpin() {
    if (_spinning) return;

    Audio.unlock();

    const check = Security.checkSpin();
    if (!check.allowed) {
      _showRobotBubble(_lockoutMessage(check.reason));
      return;
    }

    _spinning = true;
    _resetIdle();
    spinBtn.disabled = true;
    spinBtn.classList.add('is-spinning');
    $$('.lights-bar').forEach(lb => lb.classList.add('active'));

    Audio.playSpin();
    resultDisplay.textContent = '';
    nearMissBar.textContent   = '';
    nearMissBar.classList.remove('visible');

    // Resolve the spin up front — the animation is presentation only.
    const result = GameLogic.spin(_currentBet);
    const newlyUnlocked = Achievements.recordSpin();

    // Per-reel spin durations — stagger left → right.
    const durations = Array.from(
      { length: GameLogic.REEL_COUNT },
      (_v, i) => CFG.FIRST_STOP_MS + i * CFG.PER_REEL_STAGGER
    );

    // Kick off all reel animations in parallel.
    const spinPromises = result.stops.map((stop, i) =>
      _animateReel(i, stop, durations[i])
    );

    // As each reel lands, play its thunk and update ARIA label.
    spinPromises.forEach((p, i) => p.then(() => {
      Audio.playReelStop(i);
      const sym = GameLogic.getSymbolById(result.symbols[i]);
      const container = $('reel-' + i);
      if (container && sym) container.setAttribute('aria-label', sym.label);
    }));

    await Promise.all(spinPromises);

    // ── Outcome ─────────────────────────────────────────────────
    $$('.lights-bar').forEach(lb => lb.classList.remove('active'));
    spinBtn.classList.remove('is-spinning');

    if (result.payout > 0 || result.type === 'jackpot') {
      _handleWin(result);
    } else if (result.nearMiss) {
      _handleNearMiss();
    } else {
      _handleLoss();
    }

    if (newlyUnlocked.length) _showAchievementUnlock(newlyUnlocked[0]);

    _updateJackpot();
    _updateStats();
    _updateAchievements();

    _spinning = false;
    spinBtn.disabled = false;
    _resetIdle();
  }

  /**
   * Map a Security rejection reason to a humorous bubble message.
   * @param {string} reason - Security reason code.
   * @returns {string} Bubble message.
   */
  function _lockoutMessage(reason) {
    const msgs = {
      too_fast:    "Whoa! Slow down, unit! You're not a machine. Well, I am. But still.",
      burst:       "Burst limit reached. Take a breath. Humans need those.",
      low_entropy: "Movement entropy too low. Are you a bot? I'm the only bot allowed here.",
      slow_down:   'Cooldown in progress. ' + (Security.lockoutRemaining() / 1000).toFixed(1) + 's remaining.',
    };
    return msgs[reason] || 'Not so fast!';
  }

  // ── Win / loss / near-miss handlers ────────────────────────────────

  /**
   * Celebrate a winning spin.
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

    const unlocked = Achievements.recordWin(result.payout);
    if (result.type === 'jackpot') Achievements.recordJackpot();
    if (unlocked.length) _showAchievementUnlock(unlocked[0]);

    const chatResp = Chat.getWinReaction(result.type);
    _addChatMessage('ROBO', chatResp, true);
    _showRobotBubble(chatResp.slice(0, 60));
    _setRobotMood('excited');

    Leaderboard.recordPlayerWin(_playerName, _playerColor, result.payout);

    resultDisplay.textContent =
      result.type === 'jackpot' ? '★★★ JACKPOT! ★★★'       :
      result.type === 'five'    ? '★★ FIVE OF A KIND! ★★' :
      result.type === 'four'    ? '★ FOUR OF A KIND! ★'    :
      result.type === 'three'   ? 'THREE OF A KIND!'        :
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
    setTimeout(() => nearMissBar.classList.remove('visible'), 3000);

    const chatResp = Chat.getWinReaction('nearMiss');
    _addChatMessage('ROBO', chatResp, true);
    _showRobotBubble(chatResp.slice(0, 60));
    _setRobotMood('normal');
    resultDisplay.textContent = 'Almost...';
  }

  /**
   * Handle a plain loss.
   * @returns {void}
   */
  function _handleLoss() {
    Audio.playLoss();
    const chatResp = Chat.getWinReaction('loss');
    _addChatMessage('ROBO', chatResp, true);
    _setRobotMood('sad');
    resultDisplay.textContent = 'No match.';
  }

  // ── Win visual effects ─────────────────────────────────────────────

  /** @param {number} amount @returns {void} */
  function _triggerSmallWin(amount) {
    Audio.playSmallWin();
    _flashWin('green');
    _lightsCycle(CFG.SMALL_WIN_MS);
    _showWinCelebration(GameLogic.formatMoney(amount), 'WIN!', CFG.SMALL_WIN_MS);
    _spawnCoins(CFG.COINS_SMALL);
  }

  /** @param {number} amount @returns {void} */
  function _triggerBigWin(amount) {
    Audio.playBigWin();
    _flashWin('gold');
    _lightsCycle(CFG.BIG_WIN_MS);
    _showWinCelebration(GameLogic.formatMoney(amount), 'BIG WIN!', CFG.BIG_WIN_MS);
    _spawnCoins(CFG.COINS_BIG);
  }

  /** @param {number} amount @returns {void} */
  function _triggerJackpot(amount) {
    Audio.playJackpot();
    _flashWin('gold');
    _lightsCycle(CFG.JACKPOT_WIN_MS);
    _showWinCelebration(GameLogic.formatMoney(amount), 'JACKPOT!!!', CFG.JACKPOT_WIN_MS);
    _spawnCoins(CFG.COINS_JACKPOT);
    _setRobotMood('dance');
    setTimeout(() => _setRobotMood('normal'), CFG.JACKPOT_WIN_MS);
  }

  /**
   * Flash the machine frame for a win (suppressed in epilepsy-safe mode).
   * @param {('green'|'gold')} type - Flash colour.
   * @returns {void}
   */
  function _flashWin(type) {
    if (document.body.dataset.epilepsysafe === 'true') return;
    winFlash.className = 'win-flash-overlay flash-' + type;
    setTimeout(() => { winFlash.className = 'win-flash-overlay'; }, 1100);
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
   * Show the centre-screen amount/label celebration.
   * @param {string} amount   - Formatted money string.
   * @param {string} label    - Celebration label ("BIG WIN!", etc).
   * @param {number} duration - Visibility duration (ms).
   * @returns {void}
   */
  function _showWinCelebration(amount, label, duration) {
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
   * Emit the coin-burst visual.
   * @param {number} count - Number of coins to spawn.
   * @returns {void}
   */
  function _spawnCoins(count) {
    if (document.body.dataset.epilepsysafe === 'true') return;
    coinBurst.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin';
      const angle = (i / count) * 2 * Math.PI;
      const dist  = 60 + RNG.randInt(0, 80);
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 80; // bias upward
      coin.style.setProperty('--tx', tx + 'px');
      coin.style.setProperty('--ty', ty + 'px');
      coin.style.animationDelay = RNG.randInt(0, 200) + 'ms';
      coin.textContent = '$';
      coinBurst.appendChild(coin);
    }
    setTimeout(() => { coinBurst.innerHTML = ''; }, 1200);
  }

  /**
   * Bump-animate the winnings counter and set new value.
   * @param {number} target - New total.
   * @returns {void}
   */
  function _animateWinnings(target) {
    winningsAmount.classList.add('bump');
    winningsAmount.textContent = GameLogic.formatMoney(target);
    setTimeout(() => winningsAmount.classList.remove('bump'), 450);
  }

  // ── Jackpot display ────────────────────────────────────────────────
  /** @returns {void} */
  function _updateJackpot() {
    jackpotAmount.textContent = GameLogic.formatMoney(GameLogic.jackpot);
  }
  setInterval(_updateJackpot, CFG.JACKPOT_POLL_MS);
  _updateJackpot();

  // ── Stats widget ───────────────────────────────────────────────────
  /** @returns {void} */
  function _updateStats() {
    const s = Achievements.stats;
    statsSpins.textContent    = s.spins    || 0;
    statsWins.textContent     = s.wins     || 0;
    statsBest.textContent     = GameLogic.formatMoney(s.bestWin || 0);
    statsJackpots.textContent = s.jackpots || 0;
    statsTime.textContent     = Achievements.formatTime(s.timePlayed || 0);
  }
  setInterval(_updateStats, CFG.STATS_POLL_MS);
  _updateStats();

  // Hydrate the current winnings display from persistent state.
  winningsAmount.textContent = GameLogic.formatMoney(GameLogic.totalWinnings);

  // ── Achievements grid ──────────────────────────────────────────────
  /** @returns {void} */
  function _updateAchievements() {
    const defs = Achievements.getDefs();
    achGrid.innerHTML = '';
    defs.forEach(def => {
      const badge = document.createElement('div');
      badge.className = 'ach-badge' + (Achievements.isUnlocked(def.id) ? ' unlocked' : '');
      badge.innerHTML = `
        ${_achIcon(def.icon)}
        <div>${_esc(def.label)}</div>
        <div class="ach-tooltip">${_esc(def.desc)}</div>
      `;
      achGrid.appendChild(badge);
    });
  }
  _updateAchievements();

  /**
   * Return the inline SVG markup for an achievement icon id.
   * @param {string} icon - Icon id.
   * @returns {string} SVG markup.
   */
  function _achIcon(icon) {
    const icons = {
      spin:    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="12,6 16,14 8,14" fill="currentColor"/></svg>`,
      bolt:    `<svg viewBox="0 0 24 24"><polygon points="13,2 6,13 11,13 11,22 18,11 13,11" fill="currentColor"/></svg>`,
      gear:    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/></svg>`,
      star:    `<svg viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="currentColor"/></svg>`,
      jackpot: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".3"/><text x="12" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="currentColor">7</text></svg>`,
      coin:    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".4"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      clock:   `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="6" x2="12" y2="13" stroke="currentColor" stroke-width="2"/><line x1="12" y1="13" x2="16" y2="16" stroke="currentColor" stroke-width="2"/></svg>`,
      heart:   `<svg viewBox="0 0 24 24"><path d="M12 21C12 21 3 14 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 13-9 13z" fill="currentColor"/></svg>`,
      chat:    `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    };
    return icons[icon] || icons.star;
  }

  /**
   * Celebrate a newly unlocked achievement.
   * @param {{label:string, desc:string}} def - Achievement definition.
   * @returns {void}
   */
  function _showAchievementUnlock(def) {
    Audio.playAchievement();
    _showRobotBubble('ACHIEVEMENT UNLOCKED: ' + def.label + '!');
    _addChatMessage('ROBO', 'Achievement unlocked: ' + def.label + '! ' + def.desc, true);
    _updateAchievements();
  }

  // ── Leaderboard ────────────────────────────────────────────────────

  /**
   * Render leaderboard entries into a given list element (diff-update).
   * @param {Array<{id:string,name:string,color:string,amount:number,isBot:boolean}>} list
   * @param {HTMLOListElement} el         - Target <ol>.
   * @param {number}           maxEntries - Max rows to render.
   * @returns {void}
   */
  function _renderLeaderboard(list, el, maxEntries) {
    const entries = list.slice(0, maxEntries);
    const existing = el.children;
    entries.forEach((entry, i) => {
      const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const playerClass = entry.isBot ? '' : 'is-player';
      const html = `
        <span class="lb-rank ${rankClass}">#${i + 1}</span>
        <svg class="lb-avatar" viewBox="0 0 20 20" style="background:${entry.color}">
          <circle cx="10" cy="8" r="4" fill="rgba(0,0,0,0.3)"/>
          <rect x="4" y="14" width="12" height="5" rx="3" fill="rgba(0,0,0,0.3)"/>
        </svg>
        <span class="lb-name">${_esc(entry.name)}</span>
        <span class="lb-amount">${Leaderboard.formatAmount(entry.amount)}</span>
      `;
      if (existing[i]) {
        existing[i].innerHTML = html;
        existing[i].className = 'lb-entry ' + playerClass;
      } else {
        const li = document.createElement('li');
        li.className = 'lb-entry ' + playerClass;
        li.innerHTML = html;
        el.appendChild(li);
      }
    });
    while (el.children.length > entries.length) el.removeChild(el.lastChild);
  }

  /** @returns {void} */
  function _refreshLeaderboard() {
    _renderLeaderboard(Leaderboard.getTop(8), lbList, 8);
    if (lbFull) _renderLeaderboard(Leaderboard.getAll(), lbFull, 20);
  }
  _refreshLeaderboard();
  Leaderboard.onChange(() => _refreshLeaderboard());

  // ── Mini chat ──────────────────────────────────────────────────────
  /**
   * Append a chat message to the mini log.
   * @param {string}  author  - Speaker name.
   * @param {string}  text    - Message text.
   * @param {boolean} isRobot - True if speaker is ROBO.
   * @returns {void}
   */
  function _addChatMessage(author, text, isRobot) {
    const div = document.createElement('div');
    div.className = 'chat-message ' + (isRobot ? 'robot' : 'player');
    div.innerHTML = `<strong>${_esc(author)}:</strong> ${_esc(text)}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    while (chatMessages.children.length > CFG.MINI_CHAT_LIMIT) {
      chatMessages.removeChild(chatMessages.firstChild);
    }
  }

  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg) return;
    chatInput.value = '';
    _addChatMessage(_playerName, msg, false);
    Achievements.recordChat();
    Security.addEntropy(msg.length * 17);

    setTimeout(() => {
      const resp = Chat.getResponse(msg);
      _addChatMessage('ROBO', resp, true);
      _showRobotBubble(resp.slice(0, 80));
    }, 400 + RNG.randInt(0, 300));

    _resetIdle();
  });

  // ── Global chat room ───────────────────────────────────────────────
  const chatRoomMessages = $('chat-room-messages');
  const chatRoomForm     = $('chat-room-form');
  const chatRoomInput    = $('chat-room-input');

  /**
   * Append a message to the global-room log.
   * @param {string}  author  - Speaker name.
   * @param {string}  color   - Author hex colour.
   * @param {string}  text    - Message text.
   * @param {boolean} isRobot - True if speaker is a bot.
   * @returns {void}
   */
  function _addRoomMessage(author, color, text, isRobot) {
    const div = document.createElement('div');
    div.className = 'chat-room-msg' + (isRobot ? ' robot-msg' : '');
    div.innerHTML = `<span class="msg-author" style="color:${color}">${_esc(author)}</span>${_esc(text)}`;
    chatRoomMessages.appendChild(div);
    chatRoomMessages.scrollTop = chatRoomMessages.scrollHeight;
    while (chatRoomMessages.children.length > CFG.ROOM_CHAT_LIMIT) {
      chatRoomMessages.removeChild(chatRoomMessages.firstChild);
    }
  }
  Chat.onRoomMessage((name, color, msg) => _addRoomMessage(name, color, msg, false));

  chatRoomForm.addEventListener('submit', e => {
    e.preventDefault();
    const msg = chatRoomInput.value.trim();
    if (!msg) return;
    chatRoomInput.value = '';
    _addRoomMessage(_playerName, _playerColor, msg, false);
    Achievements.recordChat();

    setTimeout(() => {
      const resp = Chat.getResponse(msg);
      _addRoomMessage('ROBO', '#69f0ae', resp, true);
    }, 600 + RNG.randInt(0, 400));
  });

  // ── Robot mascot interactions ──────────────────────────────────────
  const ROBOT_CLICK_QUIPS = [
    'OW. My thorax.',
    'Please stop poking me.',
    'I have feelings. Probably.',
    'Initiating tickle response...',
    "That was my on/off switch. Please don't.",
    'ALERT: physical contact detected.',
    "My warranty doesn't cover this.",
    'I LIKED YOU BETTER WHEN YOU WERE SPINNING.',
  ];

  robotMascot.addEventListener('click', () => {
    const quip = RNG.pick(ROBOT_CLICK_QUIPS);
    _showRobotBubble(quip);
    _setRobotMood('excited');
    Audio.playClick();
    setTimeout(() => _setRobotMood('normal'), 1200);
    _resetIdle();
  });

  robotMascot.addEventListener('mouseenter', () => {
    if (!_spinning) _showRobotBubble('Hover detected. Suspicious.');
    setTimeout(() => _hideBubble(), 1800);
  });

  /**
   * Show the robot's speech bubble with the given text.
   * @param {string} text - Message.
   * @returns {void}
   */
  function _showRobotBubble(text) {
    robotBubble.textContent = text;
    robotBubble.classList.add('visible');
    clearTimeout(_showRobotBubble._timer);
    _showRobotBubble._timer = setTimeout(_hideBubble, CFG.BUBBLE_HIDE_MS);
  }

  /** @returns {void} */
  function _hideBubble() { robotBubble.classList.remove('visible'); }

  /**
   * Set the mascot's current mood CSS class + mouth text.
   * @param {('normal'|'excited'|'sad'|'dance')} mood
   * @returns {void}
   */
  function _setRobotMood(mood) {
    robotMascot.classList.remove('robot-excited', 'robot-sad', 'robot-dance');
    if (mood !== 'normal') robotMascot.classList.add('robot-' + mood);
    const mouth = robotMascot.querySelector('.mouth-text');
    if (mouth) {
      const texts = { excited: 'YEAH!!', sad: '...', dance: 'PARTY', normal: 'READY' };
      mouth.textContent = texts[mood] || 'READY';
    }
  }

  // ── Idle-quip timer ────────────────────────────────────────────────
  /** @returns {void} */
  function _resetIdle() {
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
      const quip = Chat.getIdleQuip();
      _showRobotBubble(quip);
      _addChatMessage('ROBO', quip, true);
      _resetIdle();
    }, CFG.IDLE_QUIP_MS);
  }
  _resetIdle();

  // ── Global key handlers ────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Spacebar → spin (unless the user is typing in an input).
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (e.code === 'Space' && !isTyping) {
      e.preventDefault();
      _doSpin();
    }
    if (e.key === 'Escape') {
      $$('.slide-panel:not([hidden])').forEach(p => _closePanel(p.id));
    }
    Security.addEntropy(e.keyCode || 0);
  });

  document.addEventListener('mousemove', e => {
    Security.addEntropy((e.clientX * 7 + e.clientY * 13) & 0xffff);
  }, { passive: true });

  // Power-Core click
  spinBtn.addEventListener('click', _doSpin);

  // ── Panel navigation ───────────────────────────────────────────────
  /**
   * Open a slide-over panel by id.
   * @param {string} id - Panel element id.
   * @returns {void}
   */
  function _openPanel(id) {
    const panel = $(id);
    if (!panel) return;
    panel.removeAttribute('hidden');
    panelOverlay.classList.add('active');
    panelOverlay.setAttribute('aria-hidden', 'false');
    panel.focus();
    Audio.playClick();
  }

  /**
   * Close a slide-over panel by id.
   * @param {string} id - Panel element id.
   * @returns {void}
   */
  function _closePanel(id) {
    const panel = $(id);
    if (!panel) return;
    panel.setAttribute('hidden', '');
    panelOverlay.classList.remove('active');
    panelOverlay.setAttribute('aria-hidden', 'true');
  }

  ['leaderboard', 'achievements', 'stats', 'settings', 'chat'].forEach(name => {
    const btn = $('btn-' + name);
    if (btn) btn.addEventListener('click', () => _openPanel('panel-' + name));
  });

  $$('.panel-close').forEach(btn => {
    btn.addEventListener('click', () => _closePanel(btn.dataset.close));
  });

  panelOverlay.addEventListener('click', () => {
    $$('.slide-panel:not([hidden])').forEach(p => _closePanel(p.id));
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SETTINGS — hydrate from State, persist on change
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Apply a settings object to the live UI + audio engine + body datasets.
   * @param {Object} s - Settings block from State.
   * @returns {void}
   */
  function _applySettings(s) {
    toggleSound.checked         = !!s.sfxEnabled;
    toggleMusic.checked         = !!s.musicEnabled;
    toggleReducedMotion.checked = !!s.reducedMotion;
    toggleEpilepsySafe.checked  = !!s.epilepsySafe;
    volumeMaster.value          = String(s.masterVolume);
    volumeMusic.value           = String(s.musicVolume);

    Audio.setSfxEnabled(toggleSound.checked);
    Audio.setMusicEnabled(toggleMusic.checked);
    Audio.setMasterVolume(Number(volumeMaster.value));
    Audio.setMusicVolume(Number(volumeMusic.value));

    document.body.dataset.reducedmotion = String(toggleReducedMotion.checked);
    document.body.dataset.epilepsysafe  = String(toggleEpilepsySafe.checked);
  }

  // Hydrate from persisted state on boot.
  _applySettings(State.get('settings') || {});

  toggleSound.addEventListener('change', () => {
    Audio.unlock();
    Audio.setSfxEnabled(toggleSound.checked);
    State.set('settings.sfxEnabled', toggleSound.checked);
  });
  toggleMusic.addEventListener('change', () => {
    Audio.unlock();
    Audio.setMusicEnabled(toggleMusic.checked);
    State.set('settings.musicEnabled', toggleMusic.checked);
  });
  volumeMaster.addEventListener('input', () => {
    const v = Number(volumeMaster.value);
    Audio.setMasterVolume(v);
    State.set('settings.masterVolume', v);
  });
  volumeMusic.addEventListener('input', () => {
    const v = Number(volumeMusic.value);
    Audio.setMusicVolume(v);
    State.set('settings.musicVolume', v);
  });
  toggleReducedMotion.addEventListener('change', () => {
    document.body.dataset.reducedmotion = String(toggleReducedMotion.checked);
    State.set('settings.reducedMotion', toggleReducedMotion.checked);
  });
  toggleEpilepsySafe.addEventListener('change', () => {
    document.body.dataset.epilepsysafe = String(toggleEpilepsySafe.checked);
    State.set('settings.epilepsySafe', toggleEpilepsySafe.checked);
  });

  // ── Player avatar (name + colour) ──────────────────────────────────
  _playerName  = State.get('player.name')  || 'YOU';
  _playerColor = State.get('player.color') || '#fff176';
  if (_playerName && _playerName !== 'YOU') playerNameInput.value = _playerName;

  playerNameInput.addEventListener('input', () => {
    _playerName = playerNameInput.value.trim() || 'YOU';
    State.set('player.name', _playerName);
  });

  $$('.avatar-color-btn').forEach(btn => {
    if (btn.dataset.color === _playerColor) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      $$('.avatar-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _playerColor = btn.dataset.color;
      State.set('player.color', _playerColor);
      Audio.playClick();
    });
  });

  // ── Wipe Saved Data ────────────────────────────────────────────────
  if (btnResetData) {
    btnResetData.addEventListener('click', () => {
      const ok = window.confirm(
        'This will erase your winnings, spins, achievements, and settings. Continue?'
      );
      if (!ok) return;
      State.reset();
      // Full reload so every module re-seeds from a clean slate.
      location.reload();
    });
  }

  // ── Stats full panel ───────────────────────────────────────────────
  const statsFullEl = $('stats-full');
  $('btn-stats').addEventListener('click', () => {
    const s = Achievements.stats;
    statsFullEl.innerHTML = `
      <dl class="stats-list">
        <div class="stat-row"><dt>Total Spins</dt>      <dd>${s.spins || 0}</dd></div>
        <div class="stat-row"><dt>Total Wins</dt>       <dd>${s.wins  || 0}</dd></div>
        <div class="stat-row"><dt>Best Single Win</dt>  <dd>${GameLogic.formatMoney(s.bestWin || 0)}</dd></div>
        <div class="stat-row"><dt>Jackpots Hit</dt>     <dd>${s.jackpots || 0}</dd></div>
        <div class="stat-row"><dt>Pity Triggers</dt>    <dd>${s.pityTriggers || 0}</dd></div>
        <div class="stat-row"><dt>Chat Messages</dt>    <dd>${s.chatMessages || 0}</dd></div>
        <div class="stat-row"><dt>Time Played</dt>      <dd>${Achievements.formatTime(s.timePlayed || 0)}</dd></div>
        <div class="stat-row"><dt>Session #</dt>        <dd>${State.sessionCount()}</dd></div>
        <div class="stat-row"><dt>Achievements</dt>     <dd>${(State.get('unlockedAchievements') || []).length} / ${Achievements.getDefs().length}</dd></div>
      </dl>
    `;
  });

  // Achievements full panel
  const achFullEl = $('achievements-full');
  $('btn-achievements').addEventListener('click', () => {
    achFullEl.innerHTML = '';
    Achievements.getDefs().forEach(def => {
      const unlocked = Achievements.isUnlocked(def.id);
      const div = document.createElement('div');
      div.className = 'ach-badge' + (unlocked ? ' unlocked' : '');
      div.style.cssText = 'display:flex;gap:12px;align-items:center;padding:12px;margin-bottom:8px;border-radius:8px;background:var(--surface);border:1px solid var(--border)';
      div.innerHTML = `
        <div style="flex-shrink:0;width:36px;height:36px;color:${unlocked ? 'var(--yellow)' : 'var(--text-dim)'}">${_achIcon(def.icon)}</div>
        <div>
          <div style="font-weight:700;color:${unlocked ? 'var(--yellow)' : 'var(--text-dim)'}">${_esc(def.label)}</div>
          <div style="font-size:0.8rem;color:var(--text-dim)">${_esc(def.desc)}</div>
          ${unlocked ? '<div style="font-size:0.72rem;color:var(--green);margin-top:3px">✓ Unlocked</div>' : ''}
        </div>
      `;
      achFullEl.appendChild(div);
    });
  });

  // ── Utility ────────────────────────────────────────────────────────
  /**
   * HTML-escape a string for safe innerHTML insertion.
   * @param {*} str - Any value coercible to string.
   * @returns {string} Escaped string.
   */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BOOT SEQUENCE
  // ═══════════════════════════════════════════════════════════════════
  setTimeout(() => {
    const greeting = Chat.getBootGreeting();
    _addChatMessage('ROBO', greeting, true);
    _showRobotBubble(greeting.length > 60 ? greeting.slice(0, 57) + '...' : greeting);

    // Sting for returning players only.
    if (State.isReturningPlayer()) {
      try { Audio.unlock(); Audio.playWelcome(); } catch (_e) { /* suspended context */ }
    }
  }, 600);

})();
