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
  let _spinIntervals = [];   // clearInterval handles for active reel tickers
  let _idlePulseTimer = null;

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
    };

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
        cell.textContent = '🎰';
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

    // Disable button and set mascot state for duration of spin
    dom.spinBtn.disabled = true;
    dom.spinBtn.classList.add('is-spinning');
    _clearWinHighlights();
    _setRobotState('excited');
    _resetIdlePulse();

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
      // Cancel any leftover timers from a previous (abnormal) spin
      _spinIntervals.forEach(clearInterval);
      _spinIntervals = [];

      const symbols   = GameLogic.getSymbols();
      const { ROWS, COLS } = GameLogic.getConstants();
      const BASE_MS   = 900;
      const STAGGER   = 220;

      let stoppedCount = 0;

      for (let c = 0; c < COLS; c++) {
        const stopAt  = Date.now() + BASE_MS + c * STAGGER;

        // Mark all cells in this column as spinning
        for (let r = 0; r < ROWS; r++) {
          _getCell(r, c)?.classList.add('is-spinning');
        }

        const timer = setInterval(() => {
          if (Date.now() >= stopAt) {
            clearInterval(timer);

            // Lock column into final symbols from the pre-computed result
            for (let r = 0; r < ROWS; r++) {
              const cell = _getCell(r, c);
              if (!cell) continue;
              cell.classList.remove('is-spinning');
              cell.textContent = result.grid[r][c];
              // Landing "bounce" animation
              cell.classList.add('is-landing');
              cell.addEventListener('animationend', () => cell.classList.remove('is-landing'), { once: true });
            }

            stoppedCount++;
            if (stoppedCount === COLS) {
              // Brief pause after last reel, then resolve
              setTimeout(resolve, 120);
            }
          } else {
            // Scramble symbols while spinning
            for (let r = 0; r < ROWS; r++) {
              const cell = _getCell(r, c);
              if (cell) cell.textContent = symbols[RNG.randomInt(0, symbols.length)].emoji;
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
    } else {
      _setRobotState('sad');
      _addChatMsg('system', _getLoseMessage());
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
        if (!reduced) _spawnParticles(80, true);
        break;
      case 'mega':
        _showOverlay('⚡ MEGA WIN!', result.totalWin, 'mega', 3500);
        if (!reduced) _spawnParticles(50, true);
        break;
      case 'big':
        _showOverlay('💰 BIG WIN!', result.totalWin, 'big', 2800);
        if (!reduced) _spawnParticles(30, false);
        break;
      default:
        if (!reduced) _spawnParticles(12, false);
        break;
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

    const board = GameLogic.getLeaderboard();

    if (board.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="lb-empty">
            No scores yet — play a few rounds and click <strong>Save Score</strong>!
          </td>
        </tr>`;
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];

    tbody.innerHTML = board.map((entry, i) => {
      const av      = GameLogic.getAvatarById(entry.avatarId);
      const medal   = medals[i] ?? `#${i + 1}`;
      const ago     = _timeAgo(entry.timestamp);
      const profit  = entry.netProfit >= 0
        ? `+${entry.netProfit.toLocaleString()}`
        : entry.netProfit.toLocaleString();
      return `
        <tr class="${i < 3 ? 'lb-top' : ''}">
          <td class="lb-rank">${medal}</td>
          <td class="lb-player">
            <span class="lb-av" style="--av-color:${av.color}">${av.emoji}</span>
            <span class="lb-name">${_esc(entry.name)}</span>
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
      tbody.innerHTML = GameLogic.getSymbols().map(s => `
        <tr>
          <td class="pt-sym">${s.emoji}</td>
          <td>${s.name}${s.wild ? ' <em>(Wild)</em>' : ''}</td>
          <td class="pt-num">${s.payouts[3]}×</td>
          <td class="pt-num">${s.payouts[4]}×</td>
          <td class="pt-num">${s.payouts[5]}×</td>
        </tr>`).join('');
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
    };

    dom.chatSend?.addEventListener('click', send);
    dom.chatInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
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

    if (state !== 'idle') {
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
      e.target.setAttribute('aria-valuenow', e.target.value);
      // Stub: connect to an Audio module if present
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
      _getAllCells().forEach(c => { c.textContent = '🎰'; c.classList.remove('is-winner'); });
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

  // ─── Public API ───────────────────────────────────────────────────────────────
  return Object.freeze({ init });
})();
