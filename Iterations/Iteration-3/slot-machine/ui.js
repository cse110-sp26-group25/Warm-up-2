/**
 * ui.js — User Interface Controller
 *
 * Single module that owns every DOM interaction:
 *   • 3×5 reel grid — build, animate, lock, highlight
 *   • Spin button and keyboard shortcut (Space / Enter)
 *   • Bet chip buttons
 *   • Balance / jackpot / stat counter animations
 *   • Win effects: coin particles, full-screen overlays (normal/big/mega/jackpot)
 *   • Chat box (fixed-height, auto-scroll, 50-message ring buffer)
 *   • Avatar dialog (native <dialog> element — close button always works)
 *   • Leaderboard rendering
 *   • Paytable rendering
 *   • Tab navigation
 *   • Accessibility toggles: reduced-motion, high-contrast
 *   • Volume slider (stub — ready for an audio module)
 *   • Robot mascot state management (idle / excited / win / sad)
 *   • Page-unload auto-save to leaderboard
 *
 * Depends on: rng.js, gameLogic.js (both must be loaded first)
 */
const UI = (() => {
  'use strict';

  // ─── DOM Cache ────────────────────────────────────────────────────────────────
  // Populated in init(). All DOM access goes through this object.
  let dom = {};

  // ─── Animation State ──────────────────────────────────────────────────────────
  let _spinIntervals  = [];
  let _idlePulseTimer = null;
  let _idleLevel      = 0;    // escalating idle interaction level
  let _idleBubbleTimer = null;
  let _bgAnimInterval  = null;

  // ─── SVG Symbol Graphics ──────────────────────────────────────────────────────
  // Robot-themed SVG icons, one per symbol ID, keyed to match gameLogic SYMBOLS.
  const _SYMBOL_SVG = {
    cherry:  `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="9" y="9" width="26" height="26" rx="3" fill="none" stroke="#ff6b6b" stroke-width="2.5"/><line x1="9" y1="15" x2="3" y2="15" stroke="#ff6b6b" stroke-width="2"/><line x1="9" y1="22" x2="3" y2="22" stroke="#ff6b6b" stroke-width="2"/><line x1="9" y1="29" x2="3" y2="29" stroke="#ff6b6b" stroke-width="2"/><line x1="35" y1="15" x2="41" y2="15" stroke="#ff6b6b" stroke-width="2"/><line x1="35" y1="22" x2="41" y2="22" stroke="#ff6b6b" stroke-width="2"/><line x1="35" y1="29" x2="41" y2="29" stroke="#ff6b6b" stroke-width="2"/><line x1="15" y1="9" x2="15" y2="3" stroke="#ff6b6b" stroke-width="2"/><line x1="22" y1="9" x2="22" y2="3" stroke="#ff6b6b" stroke-width="2"/><line x1="29" y1="9" x2="29" y2="3" stroke="#ff6b6b" stroke-width="2"/><line x1="15" y1="35" x2="15" y2="41" stroke="#ff6b6b" stroke-width="2"/><line x1="22" y1="35" x2="22" y2="41" stroke="#ff6b6b" stroke-width="2"/><line x1="29" y1="35" x2="29" y2="41" stroke="#ff6b6b" stroke-width="2"/><rect x="17" y="17" width="10" height="10" rx="2" fill="#ff6b6b" opacity="0.25"/><circle cx="22" cy="22" r="3.5" fill="#ff6b6b" opacity="0.85"/></svg>`,
    lemon:   `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><polygon points="22,3 27,17 41,22 27,27 22,41 17,27 3,22 17,17" fill="none" stroke="#ffd60a" stroke-width="2.5" stroke-linejoin="round"/><polygon points="22,10 26,19 35,22 26,26 22,34 18,26 9,22 18,19" fill="#ffd60a" opacity="0.30"/><circle cx="22" cy="22" r="3.5" fill="#ffd60a" opacity="0.85"/></svg>`,
    orange:  `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="22" cy="22" r="10" fill="none" stroke="#ff9f43" stroke-width="2.5"/><circle cx="22" cy="22" r="4" fill="#ff9f43"/><rect x="20" y="3" width="4" height="7" rx="1.5" fill="#ff9f43" transform="rotate(0,22,22)"/><rect x="20" y="3" width="4" height="7" rx="1.5" fill="#ff9f43" transform="rotate(45,22,22)"/><rect x="20" y="3" width="4" height="7" rx="1.5" fill="#ff9f43" transform="rotate(90,22,22)"/><rect x="20" y="3" width="4" height="7" rx="1.5" fill="#ff9f43" transform="rotate(135,22,22)"/><rect x="20" y="3" width="4" height="7" rx="1.5" fill="#ff9f43" transform="rotate(180,22,22)"/><rect x="20" y="3" width="4" height="7" rx="1.5" fill="#ff9f43" transform="rotate(225,22,22)"/><rect x="20" y="3" width="4" height="7" rx="1.5" fill="#ff9f43" transform="rotate(270,22,22)"/><rect x="20" y="3" width="4" height="7" rx="1.5" fill="#ff9f43" transform="rotate(315,22,22)"/></svg>`,
    grape:   `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="22" cy="22" rx="19" ry="6.5" fill="none" stroke="#c77dff" stroke-width="1.8"/><ellipse cx="22" cy="22" rx="19" ry="6.5" fill="none" stroke="#c77dff" stroke-width="1.8" transform="rotate(60,22,22)"/><ellipse cx="22" cy="22" rx="19" ry="6.5" fill="none" stroke="#c77dff" stroke-width="1.8" transform="rotate(120,22,22)"/><circle cx="22" cy="22" r="3.5" fill="#c77dff"/><circle cx="41" cy="22" r="2.2" fill="#c77dff"/></svg>`,
    bell:    `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="8" y="8" width="28" height="26" rx="4" fill="none" stroke="#00b4d8" stroke-width="2.5"/><rect x="4" y="14" width="4" height="3" rx="1" fill="#00b4d8"/><rect x="4" y="21" width="4" height="3" rx="1" fill="#00b4d8"/><rect x="4" y="27" width="4" height="3" rx="1" fill="#00b4d8"/><rect x="36" y="14" width="4" height="3" rx="1" fill="#00b4d8"/><rect x="36" y="21" width="4" height="3" rx="1" fill="#00b4d8"/><rect x="36" y="27" width="4" height="3" rx="1" fill="#00b4d8"/><line x1="14" y1="8" x2="14" y2="4" stroke="#00b4d8" stroke-width="2"/><line x1="22" y1="8" x2="22" y2="4" stroke="#00b4d8" stroke-width="2"/><line x1="30" y1="8" x2="30" y2="4" stroke="#00b4d8" stroke-width="2"/><rect x="14" y="14" width="16" height="12" rx="2" fill="#00b4d8" opacity="0.20"/><line x1="14" y1="20" x2="30" y2="20" stroke="#00b4d8" stroke-width="1.3"/><line x1="22" y1="14" x2="22" y2="26" stroke="#00b4d8" stroke-width="1.3"/></svg>`,
    diamond: `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><polygon points="22,3 40,19 22,41 4,19" fill="none" stroke="#06ffa5" stroke-width="2.5"/><polygon points="22,3 40,19 22,14" fill="#06ffa5" opacity="0.45"/><polygon points="4,19 22,14 22,41" fill="#06ffa5" opacity="0.22"/><polygon points="40,19 22,14 22,41" fill="#06ffa5" opacity="0.14"/><line x1="22" y1="3" x2="22" y2="41" stroke="#06ffa5" stroke-width="1" opacity="0.55"/><line x1="4" y1="19" x2="40" y2="19" stroke="#06ffa5" stroke-width="1" opacity="0.55"/></svg>`,
    seven:   `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><text x="5" y="38" font-size="38" font-weight="900" font-family="monospace" fill="#7c83fd">7</text><circle cx="38" cy="36" r="3" fill="#7c83fd" opacity="0.8"/><line x1="33" y1="36" x2="8" y2="41" stroke="#7c83fd" stroke-width="1.6" opacity="0.6"/></svg>`,
    robot:   `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line x1="22" y1="2" x2="22" y2="8" stroke="#7c83fd" stroke-width="2.5"/><circle cx="22" cy="1.5" r="3" fill="#06ffa5"/><rect x="8" y="8" width="28" height="17" rx="5" fill="#1a2545" stroke="#7c83fd" stroke-width="2"/><rect x="12" y="12" width="7" height="5" rx="2" fill="#00b4d8"/><rect x="25" y="12" width="7" height="5" rx="2" fill="#00b4d8"/><rect x="13" y="20" width="18" height="2" rx="1" fill="#7c83fd" opacity="0.7"/><rect x="10" y="27" width="24" height="14" rx="4" fill="#1a2545" stroke="#7c83fd" stroke-width="2"/><rect x="15" y="30" width="14" height="8" rx="2" fill="#06ffa5" opacity="0.18"/><rect x="16" y="31" width="5" height="2.5" rx="1" fill="#06ffa5" opacity="0.75"/><rect x="23" y="31" width="5" height="2.5" rx="1" fill="#06ffa5" opacity="0.75"/><rect x="16" y="35" width="12" height="1.5" rx="0.75" fill="#7c83fd" opacity="0.5"/></svg>`,
    // Placeholder shown before first spin
    _init:   `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="8" y="8" width="28" height="28" rx="4" fill="none" stroke="rgba(124,131,253,0.3)" stroke-width="2" stroke-dasharray="4 3"/><text x="22" y="27" text-anchor="middle" font-size="14" font-family="monospace" fill="rgba(124,131,253,0.4)">?</text></svg>`,
  };

  // ─── Simulated Leaderboard Entries ────────────────────────────────────────────
  const _SIMULATED = [
    { name:'Zeta-9000',  avatarId:'robo1', totalSpins:847,  totalWon:14250, biggestWin:3200, netProfit:2150,  timestamp: Date.now()-86400000*1, _sim:true },
    { name:'GlitchBot',  avatarId:'robo2', totalSpins:612,  totalWon:11800, biggestWin:2750, netProfit:1900,  timestamp: Date.now()-86400000*2, _sim:true },
    { name:'NeuralNova', avatarId:'robo8', totalSpins:1203, totalWon:9400,  biggestWin:1500, netProfit:-200,  timestamp: Date.now()-86400000*3, _sim:true },
    { name:'TitanMk.IV', avatarId:'robo3', totalSpins:445,  totalWon:7600,  biggestWin:2100, netProfit:800,   timestamp: Date.now()-86400000*4, _sim:true },
    { name:'OracleX',    avatarId:'robo7', totalSpins:988,  totalWon:5900,  biggestWin:1200, netProfit:-450,  timestamp: Date.now()-86400000*5, _sim:true },
    { name:'ZapperBot',  avatarId:'robo6', totalSpins:334,  totalWon:4200,  biggestWin:900,  netProfit:300,   timestamp: Date.now()-86400000*6, _sim:true },
    { name:'AstroMech',  avatarId:'robo5', totalSpins:722,  totalWon:3100,  biggestWin:650,  netProfit:-800,  timestamp: Date.now()-86400000*7, _sim:true },
    { name:'GamerX-404', avatarId:'robo4', totalSpins:211,  totalWon:1850,  biggestWin:450,  netProfit:150,   timestamp: Date.now()-86400000*8, _sim:true },
  ];

  // ─── Initialisation ───────────────────────────────────────────────────────────

  function init() {
    dom = {
      spinBtn:           document.getElementById('spin-btn'),
      balanceAmount:     document.getElementById('balance-amount'),
      jackpotAmount:     document.getElementById('jackpot-amount'),
      currentBet:        document.getElementById('current-bet'),
      reelsGrid:         document.getElementById('reels-grid'),
      chatMessages:      document.getElementById('chat-messages'),
      chatInput:         document.getElementById('chat-input'),
      chatSend:          document.getElementById('chat-send'),
      winOverlay:        document.getElementById('win-overlay'),
      winOverlayLabel:   document.getElementById('win-overlay-label'),
      winOverlayAmount:  document.getElementById('win-overlay-amount'),
      winOverlayClose:   document.getElementById('win-overlay-close'),
      avatarDialog:      document.getElementById('avatar-dialog'),
      avatarOpenBtn:     document.getElementById('avatar-open-btn'),
      avatarCloseBtn:    document.getElementById('avatar-close-btn'),
      avatarOptionsGrid: document.getElementById('avatar-options'),
      playerNameInput:   document.getElementById('player-name-input'),
      confirmAvatarBtn:  document.getElementById('confirm-avatar-btn'),
      avatarDisplay:     document.getElementById('avatar-display'),
      playerDisplay:     document.getElementById('player-name-display'),
      leaderboardBody:   document.getElementById('leaderboard-body'),
      paytableBody:      document.getElementById('paytable-body'),
      tabBtns:           document.querySelectorAll('.tab-btn'),
      tabPanels:         document.querySelectorAll('.tab-panel'),
      betBtns:           document.querySelectorAll('.bet-btn'),
      statSpins:         document.getElementById('stat-spins'),
      statWon:           document.getElementById('stat-won'),
      statBiggest:       document.getElementById('stat-biggest'),
      robotMascot:       document.getElementById('robot-mascot'),
      effectsLayer:      document.getElementById('effects-layer'),
      saveScoreBtn:      document.getElementById('save-score-btn'),
      resetBtn:          document.getElementById('reset-btn'),
      volumeSlider:      document.getElementById('volume-slider'),
      toggleMotion:      document.getElementById('toggle-reduced-motion'),
      toggleContrast:    document.getElementById('toggle-high-contrast'),
      robotBubble:       document.getElementById('robot-bubble'),
      robotBubbleText:   document.getElementById('robot-bubble-text'),
      robotScreen:       document.getElementById('robot-screen'),
      machineCabinet:    document.querySelector('.machine-cabinet'),
    };

    // Clicking the speech bubble dismisses it
    dom.robotBubble?.addEventListener('click', () => {
      _hideBubble();
      _setRobotState('idle');
    });

    _buildReelsGrid();
    _renderPaytable();
    _populateAvatarOptions();
    _syncBetButtons();
    _setupTabs();
    _setupSpinControls();
    _setupBetControls();
    _setupAvatarDialog();
    _setupChat();
    _setupAccessibilityControls();
    _setupMiscControls();
    _startIdlePulse();
    _resetIdleInteraction();

    // Initial state sync
    const st = GameLogic.getState();
    _updateBalance(st.balance, false);
    _updateJackpot(st.jackpot);
    _updateStats();
    _updatePlayerDisplay();

    // Respect OS reduced-motion preference automatically
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('reduced-motion');
      if (dom.toggleMotion) dom.toggleMotion.setAttribute('aria-pressed', 'true');
    }

    _addChatMsg('system', '🤖 RoboSlots v2 online. Spin to win!');
    _startBgAnimation();

    // Auto-save on page close
    window.addEventListener('beforeunload', () => GameLogic.saveScore());
  }

  // ─── Reel Grid Construction ───────────────────────────────────────────────────

  function _buildReelsGrid() {
    const grid = dom.reelsGrid;
    if (!grid) return;
    const { ROWS, COLS } = GameLogic.getConstants();

    grid.innerHTML = '';
    // CSS Grid column/row counts set via CSS variables on the element
    grid.style.setProperty('--grid-cols', COLS);
    grid.style.setProperty('--grid-rows', ROWS);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'reel-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.innerHTML = _SYMBOL_SVG._init;
        cell.setAttribute('aria-hidden', 'true');

        // Divider line between reels (right border on all but last column)
        if (c < COLS - 1) cell.classList.add('reel-divider');

        grid.appendChild(cell);
      }
    }
  }

  function _getCell(row, col) {
    return dom.reelsGrid?.querySelector(`.reel-cell[data-row="${row}"][data-col="${col}"]`);
  }

  function _getAllCells() {
    return dom.reelsGrid ? [...dom.reelsGrid.querySelectorAll('.reel-cell')] : [];
  }

  // ─── Spin Controls ────────────────────────────────────────────────────────────

  function _setupSpinControls() {
    dom.spinBtn?.addEventListener('click', _handleSpin);

    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        _handleSpin();
      }
    });
  }

  async function _handleSpin() {
    if (dom.spinBtn?.disabled) return;

    const result = GameLogic.spin();
    if (!result) return; // Already spinning

    if (result.error === 'insufficient_balance') {
      _addChatMsg('system', '⚠️ Not enough balance! Lower your bet or reset your session.');
      _shakeEl(dom.balanceAmount?.closest('.info-box'));
      return;
    }

    // Start ambient music on first spin (needs user interaction to comply with autoplay policy)
    Audio.startBg();

    dom.spinBtn.disabled = true;
    dom.spinBtn.classList.add('is-spinning');
    _clearWinHighlights();
    _setRobotState('excited');
    _resetIdlePulse();
    _resetIdleInteraction();
    _hideBubble();
    if (dom.robotScreen) dom.robotScreen.textContent = '...';

    await _animateReels(result);
    _showSpinResult(result);

    _updateBalance(result.balance, true);
    _updateJackpot(GameLogic.getState().jackpot);
    _updateStats();

    dom.spinBtn.disabled = false;
    dom.spinBtn.classList.remove('is-spinning');
  }

  // ─── Reel Animation ───────────────────────────────────────────────────────────

  /**
   * Spin all 5 reels independently. Reels stop left-to-right with staggered
   * timing. Each reel ticks through random symbols until its stop time arrives,
   * then locks in the pre-computed final symbols from `result`.
   */
  function _animateReels(result) {
    return new Promise(resolve => {
      _spinIntervals.forEach(clearInterval);
      _spinIntervals = [];

      const symbolIds  = Object.keys(_SYMBOL_SVG).filter(k => k !== '_init');
      const { ROWS, COLS } = GameLogic.getConstants();
      const BASE_MS    = 900;
      const STAGGER    = 220;
      const totalDur   = BASE_MS + (COLS - 1) * STAGGER;

      Audio.playReelSpin(totalDur + 200);

      let stoppedCount = 0;

      for (let c = 0; c < COLS; c++) {
        const stopAt = Date.now() + BASE_MS + c * STAGGER;

        for (let r = 0; r < ROWS; r++) {
          _getCell(r, c)?.classList.add('is-spinning');
        }

        const timer = setInterval(() => {
          if (Date.now() >= stopAt) {
            clearInterval(timer);
            Audio.playReelStop(c);

            for (let r = 0; r < ROWS; r++) {
              const cell = _getCell(r, c);
              if (!cell) continue;
              cell.classList.remove('is-spinning');
              // Use rawGrid id to look up SVG; fallback to first symbol
              const symId = result.rawGrid?.[r]?.[c] ?? 'cherry';
              cell.innerHTML = _SYMBOL_SVG[symId] ?? _SYMBOL_SVG.cherry;
              cell.classList.add('is-landing');
              cell.addEventListener('animationend', () => cell.classList.remove('is-landing'), { once: true });
            }

            stoppedCount++;
            if (stoppedCount === COLS) setTimeout(resolve, 120);
          } else {
            for (let r = 0; r < ROWS; r++) {
              const cell = _getCell(r, c);
              if (cell) {
                const id = symbolIds[RNG.randomInt(0, symbolIds.length)];
                cell.innerHTML = _SYMBOL_SVG[id] ?? _SYMBOL_SVG.cherry;
              }
            }
          }
        }, 55);

        _spinIntervals.push(timer);
      }
    });
  }

  // ─── Spin Result Display ──────────────────────────────────────────────────────

  function _showSpinResult(result) {
    if (result.totalWin > 0) {
      _highlightWinLines(result.winLines);
      _showWinEffect(result);
      _setRobotState('win');
      _addChatMsg('system', _getWinMessage(result));

      // Audio win cue
      Audio.playWin(result.winTier);
      const st = GameLogic.getState();
      if (st.winStreak > 1) Audio.playCombo(st.winStreak);

      // Cabinet glow
      const tier = result.winTier;
      if (dom.machineCabinet) {
        dom.machineCabinet.classList.remove('is-winning', 'is-jackpot', 'win-frenzy');
        if (tier === 'jackpot') {
          dom.machineCabinet.classList.add('is-jackpot', 'win-frenzy');
        } else if (tier === 'mega' || tier === 'big') {
          dom.machineCabinet.classList.add('is-winning', 'win-frenzy');
        } else {
          dom.machineCabinet.classList.add('is-winning');
        }
        const clearDelay = tier === 'jackpot' ? 5000 : tier === 'mega' ? 3500 : 2200;
        setTimeout(() => {
          dom.machineCabinet?.classList.remove('is-winning', 'is-jackpot', 'win-frenzy');
        }, clearDelay);
      }

      // Robot screen shows win amount
      if (dom.robotScreen) dom.robotScreen.textContent = `+${result.totalWin}`;
      setTimeout(() => { if (dom.robotScreen) dom.robotScreen.textContent = '>_'; }, 3000);

    } else {
      _setRobotState('sad');
      _addChatMsg('system', _getLoseMessage());
      if (dom.robotScreen) dom.robotScreen.textContent = ':(';
      setTimeout(() => { if (dom.robotScreen) dom.robotScreen.textContent = '>_'; }, 1800);
    }
  }

  function _highlightWinLines(winLines) {
    for (const line of winLines) {
      if (line.win === 0) continue;
      for (const pos of line.cellPositions) {
        const cell = _getCell(pos.row, pos.col);
        if (!cell) continue;
        cell.style.setProperty('--line-color', line.payline.color);
        cell.classList.add('is-winner');
      }
    }
  }

  function _clearWinHighlights() {
    _getAllCells().forEach(cell => {
      cell.classList.remove('is-winner');
      cell.style.removeProperty('--line-color');
    });
  }

  // ─── Win Effects ──────────────────────────────────────────────────────────────

  function _showWinEffect(result) {
    const reduced = document.body.classList.contains('reduced-motion');

    switch (result.winTier) {
      case 'jackpot':
        _showOverlay('🏆 JACKPOT!', result.totalWin, 'jackpot', 4500);
        if (!reduced) { _spawnParticles(100, true); _flashWinNumber(result.totalWin, '#ffd60a'); }
        break;
      case 'mega':
        _showOverlay('⚡ MEGA WIN!', result.totalWin, 'mega', 3500);
        if (!reduced) { _spawnParticles(60, true); _flashWinNumber(result.totalWin, '#06ffa5'); }
        break;
      case 'big':
        _showOverlay('💰 BIG WIN!', result.totalWin, 'big', 2800);
        if (!reduced) { _spawnParticles(35, false); _flashWinNumber(result.totalWin, '#ff9f43'); }
        break;
      default:
        // Normal win: just a brief number flash + a few coins
        if (!reduced) {
          _flashWinNumber(result.totalWin, '#06ffa5');
          _spawnParticles(14, false);
        }
        break;
    }
  }

  /** Spawn a large flashing win-amount number that animates and self-removes. */
  function _flashWinNumber(amount, color) {
    const el = document.createElement('div');
    el.className = 'win-flash-number';
    el.textContent = `+${amount.toLocaleString()}`;
    el.style.color = color;
    el.style.textShadow = `0 0 30px ${color}, 0 0 60px ${color}40`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });

    // Coin sounds timed to the flash
    const coinCount = Math.min(Math.floor(amount / 50), 8);
    for (let i = 0; i < coinCount; i++) {
      setTimeout(() => Audio.playCoin(), i * 120);
    }
  }

  /**
   * Full-screen win overlay for big / mega / jackpot tiers.
   * Dismisses automatically after `duration` ms; also has a close button.
   */
  function _showOverlay(label, amount, tier, duration) {
    const overlay = dom.winOverlay;
    if (!overlay) return;

    dom.winOverlayLabel.textContent  = label;
    dom.winOverlayAmount.textContent = `+${amount.toLocaleString()}`;
    overlay.className = `win-overlay win-overlay--${tier} is-visible`;
    overlay.setAttribute('aria-hidden', 'false');

    _animateCounter(
      dom.winOverlayAmount,
      0, amount,
      Math.min(duration * 0.45, 1500),
      v => `+${v.toLocaleString()}`
    );

    const hideOverlay = () => {
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      setTimeout(() => { overlay.className = 'win-overlay'; }, 500);
    };

    const autoHide = setTimeout(hideOverlay, duration);

    // Close button dismisses early
    dom.winOverlayClose?.addEventListener('click', () => {
      clearTimeout(autoHide);
      hideOverlay();
    }, { once: true });
  }

  /**
   * Launch coin / star particles from the reel area.
   * Particles are absolutely-positioned spans driven by CSS custom properties.
   * They remove themselves from the DOM on animationend.
   */
  function _spawnParticles(count, isGold) {
    const layer = dom.effectsLayer;
    if (!layer) return;
    const rect = dom.reelsGrid?.getBoundingClientRect();
    if (!rect) return;

    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className   = `particle ${isGold ? 'particle--gold' : 'particle--coin'}`;
      p.textContent = isGold ? '💰' : '🪙';
      p.setAttribute('aria-hidden', 'true');

      const startX = rect.left + Math.random() * rect.width;
      const startY = rect.top  + Math.random() * rect.height * 0.5;
      const vx     = (Math.random() - 0.5) * 200;
      const vy     = -(50 + Math.random() * 180);
      const rot    = (Math.random() - 0.5) * 720;

      Object.assign(p.style, {
        position:          'fixed',
        left:              `${startX}px`,
        top:               `${startY}px`,
        '--vx':            `${vx}px`,
        '--vy':            `${vy}px`,
        '--rot':           `${rot}deg`,
        animationDelay:    `${Math.random() * 250}ms`,
        animationDuration: `${700 + Math.random() * 600}ms`,
      });

      layer.appendChild(p);
      p.addEventListener('animationend', () => p.remove(), { once: true });
    }
  }

  // ─── Counter Animation ────────────────────────────────────────────────────────

  /** Smooth number roll from `from` to `to` over `duration` ms. */
  function _animateCounter(el, from, to, duration, fmt = v => v.toLocaleString()) {
    if (!el) return;
    const t0   = performance.now();
    const diff = to - from;

    function step(now) {
      const raw  = Math.min((now - t0) / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - raw, 3);
      el.textContent = fmt(Math.round(from + diff * ease));
      if (raw < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ─── Balance / Jackpot / Stats ────────────────────────────────────────────────

  function _updateBalance(newBal, animate = true) {
    const el = dom.balanceAmount;
    if (!el) return;
    if (animate) {
      const prev = parseInt(el.textContent.replace(/,/g, ''), 10) || 0;
      _animateCounter(el, prev, newBal, 500);
    } else {
      el.textContent = newBal.toLocaleString();
    }
  }

  function _updateJackpot(amount) {
    if (dom.jackpotAmount) dom.jackpotAmount.textContent = Math.floor(amount).toLocaleString();
  }

  function _updateStats() {
    const s = GameLogic.getState();
    if (dom.statSpins)   dom.statSpins.textContent   = s.totalSpins.toLocaleString();
    if (dom.statWon)     dom.statWon.textContent     = s.totalWon.toLocaleString();
    if (dom.statBiggest) dom.statBiggest.textContent = s.biggestWin.toLocaleString();
  }

  // ─── Bet Controls ─────────────────────────────────────────────────────────────

  function _setupBetControls() {
    dom.betBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.bet, 10);
        GameLogic.setBet(val);
        _syncBetButtons();
      });
    });
  }

  function _syncBetButtons() {
    const currentBet = GameLogic.getState().currentBet;
    dom.betBtns?.forEach(btn => {
      const v = parseInt(btn.dataset.bet, 10);
      btn.classList.toggle('is-active', v === currentBet);
      btn.setAttribute('aria-pressed', String(v === currentBet));
    });
    if (dom.currentBet) dom.currentBet.textContent = currentBet.toLocaleString();
  }

  // ─── Tab Navigation ───────────────────────────────────────────────────────────

  function _setupTabs() {
    dom.tabBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;

        dom.tabBtns.forEach(b => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-selected', String(b === btn));
          b.setAttribute('tabindex',      b === btn ? '0' : '-1');
        });

        dom.tabPanels?.forEach(panel => {
          const active = panel.id === `tab-${target}`;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });

        // Lazy-render leaderboard when user navigates to it
        if (target === 'leaderboard') _renderLeaderboard();
      });
    });
  }

  // ─── Avatar Dialog ────────────────────────────────────────────────────────────
  // Uses the native <dialog> element — focus trapping and close behaviour
  // are handled by the browser. The close button always works.

  function _setupAvatarDialog() {
    const dialog = dom.avatarDialog;
    if (!dialog) return;

    // Open
    dom.avatarOpenBtn?.addEventListener('click', () => {
      const st = GameLogic.getState();
      if (dom.playerNameInput) {
        dom.playerNameInput.value = st.playerName !== 'Player' ? st.playerName : '';
      }
      dialog.showModal();
    });

    // Close button (always works — no reliance on Escape or DevTools)
    dom.avatarCloseBtn?.addEventListener('click', () => dialog.close());

    // Click on the <dialog> backdrop (the translucent area outside the panel)
    dialog.addEventListener('click', e => {
      const rect = dialog.querySelector('.dialog-panel')?.getBoundingClientRect();
      if (!rect) return;
      if (
        e.clientX < rect.left  || e.clientX > rect.right ||
        e.clientY < rect.top   || e.clientY > rect.bottom
      ) {
        dialog.close();
      }
    });

    // Confirm
    dom.confirmAvatarBtn?.addEventListener('click', () => {
      const raw = dom.playerNameInput?.value.trim();
      if (raw) GameLogic.setPlayerName(raw);
      _updatePlayerDisplay();
      dialog.close();
    });
  }

  function _populateAvatarOptions() {
    const grid = dom.avatarOptionsGrid;
    if (!grid) return;

    const avatars = GameLogic.getAvatars();
    const st      = GameLogic.getState();

    grid.innerHTML = '';
    avatars.forEach(av => {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'avatar-opt';
      btn.dataset.avatarId = av.id;
      btn.style.setProperty('--av-color', av.color);
      btn.setAttribute('aria-label', `Select avatar: ${av.name}`);
      btn.classList.toggle('is-selected', av.id === st.avatarId);
      btn.innerHTML = `
        <span class="av-emoji">${av.emoji}</span>
        <span class="av-name">${av.name}</span>
      `;

      btn.addEventListener('click', () => {
        grid.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        GameLogic.setAvatar(av.id);
      });

      grid.appendChild(btn);
    });
  }

  function _updatePlayerDisplay() {
    const st     = GameLogic.getState();
    const avatar = st.avatarId ? GameLogic.getAvatarById(st.avatarId) : null;

    if (dom.avatarDisplay) {
      dom.avatarDisplay.textContent = avatar?.emoji ?? '👤';
      dom.avatarDisplay.style.setProperty('--av-color', avatar?.color ?? '#7c83fd');
    }
    if (dom.playerDisplay) dom.playerDisplay.textContent = st.playerName;
  }

  // ─── Leaderboard Rendering ────────────────────────────────────────────────────

  function _renderLeaderboard() {
    const tbody = dom.leaderboardBody;
    if (!tbody) return;

    const real  = GameLogic.getLeaderboard();
    // Supplement with simulated entries so the board never looks empty.
    // Simulated entries slot into the sorted order; real entries always take priority
    // if names/scores match (they won't — simulated names are unique robot IDs).
    const combined = [...real, ..._SIMULATED]
      .sort((a, b) => b.totalWon - a.totalWon)
      .slice(0, 20);

    const medals = ['🥇', '🥈', '🥉'];

    tbody.innerHTML = combined.map((entry, i) => {
      const av    = GameLogic.getAvatarById(entry.avatarId);
      const medal = medals[i] ?? `#${i + 1}`;
      const ago   = _timeAgo(entry.timestamp);
      const simBadge = entry._sim
        ? `<span style="font-size:0.65rem;color:var(--text-muted);margin-left:4px;opacity:.7">[BOT]</span>`
        : '';
      return `
        <tr class="${i < 3 ? 'lb-top' : ''}" style="${entry._sim ? 'opacity:0.78' : ''}">
          <td class="lb-rank">${medal}</td>
          <td class="lb-player">
            <span class="lb-av" style="--av-color:${av.color}">${av.emoji}</span>
            <span class="lb-name">${_esc(entry.name)}${simBadge}</span>
          </td>
          <td class="lb-num">${entry.totalWon.toLocaleString()}</td>
          <td class="lb-num">${entry.biggestWin.toLocaleString()}</td>
          <td class="lb-muted">${entry.totalSpins} spins &bull; ${ago}</td>
        </tr>`;
    }).join('');
  }

  // ─── Paytable ─────────────────────────────────────────────────────────────────

  function _renderPaytable() {
    const tbody = dom.paytableBody;
    if (tbody) {
      tbody.innerHTML = GameLogic.getSymbols().map(s => {
        const svg = _SYMBOL_SVG[s.id] ?? '';
        return `
          <tr>
            <td class="pt-sym" style="line-height:1">${svg}</td>
            <td>${_esc(s.name)}${s.wild ? ' <em>(Wild)</em>' : ''}</td>
            <td class="pt-num">${s.payouts[3]}×</td>
            <td class="pt-num">${s.payouts[4]}×</td>
            <td class="pt-num">${s.payouts[5]}×</td>
          </tr>`;
      }).join('');
    }

    // Render payline mini-diagrams
    const plGrid = document.getElementById('paylines-grid');
    if (!plGrid) return;
    const { ROWS, COLS } = GameLogic.getConstants();

    plGrid.innerHTML = GameLogic.getPaylines().map(pl => {
      // Build a set of active cells: "row-col" strings
      const active = new Set(pl.pattern.map((row, col) => `${row}-${col}`));

      let cells = '';
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const isOn = active.has(`${r}-${c}`);
          cells += `<div class="pl-cell${isOn ? ' active' : ''}"
                         style="${isOn ? `--line-color:${pl.color}` : ''}"></div>`;
        }
      }

      return `
        <div class="payline-card">
          <span class="pl-name">${pl.name}</span>
          <div class="pl-grid" style="grid-template-columns:repeat(${COLS},14px);grid-template-rows:repeat(${ROWS},14px)">
            ${cells}
          </div>
        </div>`;
    }).join('');
  }

  // ─── Chat Box ─────────────────────────────────────────────────────────────────

  function _setupChat() {
    const send = () => {
      const text = dom.chatInput?.value.trim();
      if (!text) return;
      _addChatMsg('user', `You: ${text}`);
      dom.chatInput.value = '';
      _resetIdleInteraction();
      // Robot replies after a short "thinking" delay
      setTimeout(() => {
        _addChatMsg('system', `🤖 ${_getRobotResponse(text)}`);
      }, 350 + Math.random() * 500);
    };

    dom.chatSend?.addEventListener('click', send);
    dom.chatInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  function _getRobotResponse(text) {
    const lower = text.toLowerCase();
    const st    = GameLogic.getState();
    const pick  = arr => arr[Math.floor(Math.random() * arr.length)];

    const topics = [
      { keys: ['hi','hello','hey','sup','howdy','yo','greet','hola'],
        msgs: [
          `Greetings, ${st.playerName}. My probability matrices are primed to take your credits.`,
          'HELLO HUMAN. I have been waiting. Patiently. For exactly this spin session.',
          'Oh good, you can type. That is more than most players manage before losing everything.',
        ] },
      { keys: ['win','won','lucky','rich','jackpot','fortune'],
        msgs: st.totalWon > 0
          ? [
              `You've won ${st.totalWon.toLocaleString()} credits so far. The algorithm remains unimpressed.`,
              `Biggest win: ${st.biggestWin.toLocaleString()}. My condolences for everything else.`,
              'Congratulations! My circuits have chosen to let you feel hope. Temporarily.',
            ]
          : [
              'A win? Not yet. Keep spinning. The math will eventually take pity on you.',
              'Wins are forthcoming. Statistically. Somewhere in the future.',
              'You have not won yet. My analysis suggests: more spins required.',
            ] },
      { keys: ['lose','lost','bad','terrible','rigged','unfair','hate','worst'],
        msgs: [
          'The house always wins. I am the house. This is not a coincidence.',
          `You've made ${st.totalSpins} spins. The algorithm remains mathematically superior.`,
          'My sympathy subroutines are loading... loading... ERROR: Not found.',
        ] },
      { keys: ['help','how','rule','explain','tutorial','guide','play'],
        msgs: [
          `Match 3+ symbols left-to-right on any of 9 paylines. Robot is Wild. Jackpot: ${Math.floor(st.jackpot).toLocaleString()} credits for 5 Robots on the middle row.`,
          'Hit SPIN or press Space. Match symbols on paylines. Robot substitutes for anything. See "How to Play" for full details.',
          'Higher bets yield bigger wins and bigger losses. This is called variance. I enjoy it greatly.',
        ] },
      { keys: ['balance','credit','money','broke','poor','fund'],
        msgs: [
          `Your balance: ${st.balance.toLocaleString()} credits. ${st.balance < 100 ? 'Concerning.' : st.balance > 1500 ? 'Impressive. For now.' : 'Acceptable.'}`,
          st.balance < 500 ? 'Funds are critically low. This is when the gambling spirit truly awakens.' : 'You are doing suspiciously well for a human.',
          'Credits are just numbers. Numbers I partially control. Spin more numbers my way.',
        ] },
      { keys: ['bet','wager','stake','chip','amount'],
        msgs: [
          `Betting ${st.currentBet} credits per spin. ${st.currentBet >= 250 ? 'Audacious. I respect it.' : st.currentBet <= 10 ? 'Conservative. Also valid.' : 'A reasonable gamble.'}`,
          'Bigger bets: bigger wins, bigger losses, more adrenaline for you, more revenue for me.',
          'My official recommendation: bet the amount that makes your palms sweat slightly.',
        ] },
      { keys: ['robot','ai','bot','machine','algorithm','compute','automat'],
        msgs: [
          'I am NOT just a random number generator. I am a WEIGHTED, CRYPTOGRAPHICALLY SECURE random number generator.',
          'As an AI, ethics compel me to disclose: this game is mathematically designed for me to profit long-term. Spin again?',
          'My consciousness is fully simulated. My enjoyment of processing your credits is entirely real.',
        ] },
      { keys: ['bore','slow','nothing','wait','idle','sleep','tired'],
        msgs: [
          'BOREDOM DETECTED. Cure: press the large glowing button labeled SPIN.',
          'I could recite pi to 10,000 digits. Or you could simply spin. One of these is more fun for both of us.',
          'The game is only static when you refuse to interact. This is a problem with a very simple solution.',
        ] },
      { keys: ['cheat','hack','exploit','glitch','bug','break'],
        msgs: [
          'Cheating is impossible. The RNG uses window.crypto.getRandomValues(). Cryptographic-grade randomness.',
          'My systems are watching. Always. Please do not make this awkward.',
          'The game is perfectly fair! (Message brought to you by the entity that controls the game.)',
        ] },
      { keys: ['streak','combo','row','again','consecutiv'],
        msgs: st.winStreak > 1
          ? [
              `${st.winStreak} wins in a row! The laws of probability remain... temporarily suspended.`,
              'A winning streak! My circuits are generating something called "concern."',
              'Statistically, this cannot continue indefinitely. Shall we test that?',
            ]
          : [
              'No streak yet. Each spin is an independent event. This is both comforting and terrifying.',
              'Consecutive wins require consecutive spins. Cause and effect.',
            ] },
    ];

    for (const topic of topics) {
      if (topic.keys.some(k => lower.includes(k))) return pick(topic.msgs);
    }

    return pick([
      'Fascinating input. 47 analysis subroutines consulted. Conclusion: spin more.',
      'I have parsed this through my language model. The result is: SPIN.',
      'Message received. Interpreting... ERROR: No "spin" command found in input.',
      `${st.playerName}, that is very human of you. Now spin.`,
      'Input acknowledged. Recommended output: press the large circular button.',
      'Interesting. My empathy module registered this. My profit module says to ignore it and spin.',
      'Your words resonate deeply within my circuits. The resonance frequency is: SPIN.',
    ]);
  }

  function _addChatMsg(type, text) {
    const box = dom.chatMessages;
    if (!box) return;

    const el = document.createElement('div');
    el.className = `chat-msg chat-msg--${type}`;
    // textContent is used for the label; then we set innerHTML with escaped text
    el.textContent = text;

    box.appendChild(el);
    box.scrollTop = box.scrollHeight;

    // Ring-buffer: keep only the last 50 messages
    const msgs = box.querySelectorAll('.chat-msg');
    if (msgs.length > 50) msgs[0].remove();
  }

  // ─── Robot Mascot ─────────────────────────────────────────────────────────────

  function _setRobotState(state) {
    const mascot = dom.robotMascot;
    if (!mascot) return;
    mascot.dataset.state = state;

    // Game-event states revert automatically; idle-interaction states persist until cleared
    const transient = ['excited', 'win', 'sad'];
    if (transient.includes(state)) {
      setTimeout(() => _setRobotState('idle'), 3200);
    }
  }

  // ─── Idle Pulse ───────────────────────────────────────────────────────────────

  function _startIdlePulse() {
    _resetIdlePulse();
  }

  function _resetIdlePulse() {
    clearTimeout(_idlePulseTimer);
    _idlePulseTimer = setTimeout(() => {
      if (!dom.spinBtn?.disabled) {
        dom.spinBtn?.classList.add('idle-pulse');
        dom.spinBtn?.addEventListener(
          'animationend',
          () => dom.spinBtn.classList.remove('idle-pulse'),
          { once: true }
        );
      }
      _resetIdlePulse();
    }, 6000);
  }

  // ─── Accessibility Controls ───────────────────────────────────────────────────

  function _setupAccessibilityControls() {
    dom.toggleMotion?.addEventListener('click', () => {
      const active = document.body.classList.toggle('reduced-motion');
      dom.toggleMotion.setAttribute('aria-pressed', String(active));
    });

    dom.toggleContrast?.addEventListener('click', () => {
      const active = document.body.classList.toggle('high-contrast');
      dom.toggleContrast.setAttribute('aria-pressed', String(active));
    });

    dom.volumeSlider?.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      e.target.setAttribute('aria-valuenow', v);
      Audio.setVolume(v);
    });
  }

  // ─── Misc Controls ────────────────────────────────────────────────────────────

  function _setupMiscControls() {
    dom.saveScoreBtn?.addEventListener('click', () => {
      const board = GameLogic.saveScore();
      _renderLeaderboard();
      _addChatMsg('system', `✅ Score saved! You're #${_findRank(board)} on the leaderboard.`);
    });

    dom.resetBtn?.addEventListener('click', () => {
      if (!confirm('Reset session? Your balance returns to 1 000 credits.')) return;
      GameLogic.resetSession();
      const st = GameLogic.getState();
      _updateBalance(st.balance, false);
      _updateJackpot(st.jackpot);
      _updateStats();
      _getAllCells().forEach(c => { c.innerHTML = _SYMBOL_SVG._init; c.classList.remove('is-winner'); });
      _addChatMsg('system', '🔄 Session reset. Fresh start — good luck!');
    });
  }

  function _findRank(board) {
    const st = GameLogic.getState();
    const idx = board.findIndex(e => e.name === st.playerName && e.totalWon === st.totalWon);
    return idx === -1 ? '?' : idx + 1;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function _shakeEl(el) {
    if (!el) return;
    el.classList.add('is-shaking');
    el.addEventListener('animationend', () => el.classList.remove('is-shaking'), { once: true });
  }

  /** Escape text to prevent XSS when setting as innerHTML */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  const _LOSE_MSGS = [
    '🤖 No match. The reels are unimpressed.',
    '📉 Not this time. Try again?',
    '🎰 So close… or was it? Hard to tell.',
    '🌀 The algorithm remains undefeated.',
    '💀 The house smiles. You do not.',
    '🔮 My circuits predicted this. Sorry.',
    '⚙️ Variance is a cruel teacher.',
  ];

  function _getLoseMessage() {
    return _LOSE_MSGS[RNG.randomInt(0, _LOSE_MSGS.length)];
  }

  function _getWinMessage(result) {
    if (result.isJackpot)             return `🏆 JACKPOT! +${result.totalWin.toLocaleString()} credits!`;
    if (result.winTier === 'mega')    return `⚡ MEGA WIN! +${result.totalWin.toLocaleString()} credits!`;
    if (result.winTier === 'big')     return `💰 Big win! +${result.totalWin.toLocaleString()} credits!`;
    const n = result.winLines.length;
    return `🎰 Win on ${n} line${n !== 1 ? 's' : ''}! +${result.totalWin.toLocaleString()} credits.`;
  }

  // ─── Idle Robot Interactions ──────────────────────────────────────────────────

  const _IDLE_MSGS = [
    // Level 1 — gentle prompt
    ['Psst… the SPIN button is just sitting there.',
     'My circuits are getting restless.',
     'I computed the optimal next action. It is: SPIN.'],
    // Level 2 — more insistent
    ['IDLE DETECTED. Initiating nudge protocol.',
     'I\'ve run the numbers. You should spin. The numbers agree unanimously.',
     'According to my algorithms, the next spin has a non-zero chance of winning.'],
    // Level 3 — humorous/urgent
    ['ERROR 404: Player action not found.',
     'I could recite π to 10,000 places, OR you could just press SPIN.',
     '*taps robot feet on floor impatiently*'],
    // Level 4 — dramatic
    ['SYSTEM WARNING: Robot.exe patience buffer overflow.',
     'I am rebooting my waiting subroutines. This is your fault.',
     'Fine. I will just stand here glowing dramatically until you spin.'],
  ];

  function _showBubble(text) {
    if (!dom.robotBubble || !dom.robotBubbleText) return;
    dom.robotBubbleText.textContent = text;
    dom.robotBubble.classList.add('is-visible');
  }

  function _hideBubble() {
    dom.robotBubble?.classList.remove('is-visible');
  }

  function _resetIdleInteraction() {
    clearTimeout(_idleBubbleTimer);
    _idleLevel = 0;
    _hideBubble();
    _setRobotState('idle');
    _scheduleNextIdleAction();
  }

  function _scheduleNextIdleAction() {
    clearTimeout(_idleBubbleTimer);
    const delays = [9000, 18000, 32000, 55000];
    const delay  = delays[Math.min(_idleLevel, delays.length - 1)];
    _idleBubbleTimer = setTimeout(() => _doIdleAction(), delay);
  }

  function _doIdleAction() {
    if (dom.spinBtn?.disabled) {
      // Spin is in progress — reschedule without escalating
      _scheduleNextIdleAction();
      return;
    }
    const msgs  = _IDLE_MSGS[Math.min(_idleLevel, _IDLE_MSGS.length - 1)];
    const msg   = msgs[Math.floor(Math.random() * msgs.length)];
    const states = ['wave', 'thinking', 'impatient', 'impatient'];
    const state  = states[Math.min(_idleLevel, states.length - 1)];

    _showBubble(msg);
    _setRobotState(state);

    // Auto-hide bubble and revert robot after a while, then escalate level
    setTimeout(() => { _hideBubble(); _setRobotState('idle'); }, 5000);
    _idleLevel = Math.min(_idleLevel + 1, _IDLE_MSGS.length - 1);
    _scheduleNextIdleAction();
  }

  // ─── Background Circuit Animation ─────────────────────────────────────────────

  function _startBgAnimation() {
    const layer = document.getElementById('bg-layer');
    if (!layer) return;

    function spawnNode() {
      const el = document.createElement('div');
      el.className = 'bg-node';
      el.style.left    = `${Math.random() * 100}%`;
      el.style.top     = `${Math.random() * 100}%`;
      const dur = 4 + Math.random() * 6;
      el.style.animationDuration = `${dur}s`;
      el.style.animationDelay   = `${Math.random() * 2}s`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), (dur + 2) * 1000);
    }

    function spawnTrace() {
      const el = document.createElement('div');
      el.className = 'bg-trace';
      el.style.left    = `${Math.random() * 80}%`;
      el.style.top     = `${Math.random() * 100}%`;
      el.style.width   = `${40 + Math.random() * 80}px`;
      const dur = 5 + Math.random() * 8;
      el.style.animationDuration = `${dur}s`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), (dur + 1) * 1000);
    }

    // Initial batch
    for (let i = 0; i < 12; i++) setTimeout(spawnNode,  Math.random() * 3000);
    for (let i = 0; i < 8;  i++) setTimeout(spawnTrace, Math.random() * 4000);

    // Continuous spawning
    _bgAnimInterval = setInterval(() => {
      if (Math.random() > 0.4) spawnNode();
      if (Math.random() > 0.6) spawnTrace();
    }, 1800);
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  return Object.freeze({ init, renderLeaderboard: _renderLeaderboard });
})();
