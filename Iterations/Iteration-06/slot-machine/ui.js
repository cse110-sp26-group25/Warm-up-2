/**
 * ui.js — UI orchestration, reel animation, event wiring, DOM updates.
 * Coordinates all modules: GameLogic, Audio, Achievements, Leaderboard, Chat, Security.
 */
(function () {
  'use strict';

  // ── DOM references ─────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

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
  const toggleSound     = $('toggle-sound');
  const toggleMusic     = $('toggle-music');
  const toggleReducedMotion = $('toggle-reduced-motion');
  const toggleEpilepsySafe  = $('toggle-epilepsy-safe');
  const volumeMaster    = $('volume-master');
  const volumeMusic     = $('volume-music');
  const playerNameInput = $('player-name');

  // ── Symbol SVG builders ────────────────────────────────────────────────
  // Each returns an SVG string for the given symbol id
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
        const a = i*(Math.PI/4); const cos=Math.cos(a); const sin=Math.sin(a);
        const x1=40+cos*24; const y1=40+sin*24; const x2=40+cos*32; const y2=40+sin*32;
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

  // ── Reel strip setup ──────────────────────────────────────────────────
  const VISIBLE_SYMBOLS = 3; // show 3 symbols per reel (top, center, bottom)
  const SYMBOL_HEIGHT   = 200 / VISIBLE_SYMBOLS; // ~66.7px per slot

  function _buildStrip(reelIndex) {
    const strip = $('strip-' + reelIndex);
    strip.innerHTML = '';
    // Build extended strip (enough for smooth scroll animation)
    const reel = GameLogic.REELS[reelIndex];
    const total = reel.length;
    // Duplicate: 3 full sets for seamless looping
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i < total; i++) {
        const div = document.createElement('div');
        div.className = 'reel-symbol';
        div.innerHTML = SYMBOL_SVG[reel[i]] || SYMBOL_SVG.screw;
        strip.appendChild(div);
      }
    }
  }

  for (let i = 0; i < 3; i++) _buildStrip(i);

  // ── Spin state ─────────────────────────────────────────────────────────
  let _spinning = false;
  let _currentBet = 1;
  let _playerName = 'YOU';
  let _playerColor = '#fff176';
  let _idleTimer = null;
  let _idleDelay = 18000; // 18s idle → robot quip

  // ── Bet selector ───────────────────────────────────────────────────────
  $$('.bet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_spinning) return;
      $$('.bet-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed','true');
      _currentBet = +btn.dataset.bet;
      Audio.playClick();
      _resetIdle();
    });
  });

  // ── Spin animation ─────────────────────────────────────────────────────
  /**
   * Animate one reel to a target stop position.
   * Returns a Promise that resolves when animation completes.
   */
  function _animateReel(reelIndex, targetStop, spinDuration) {
    return new Promise(resolve => {
      const strip    = $('strip-' + reelIndex);
      const reel     = GameLogic.REELS[reelIndex];
      const total    = reel.length;
      const symH     = 200; // full height per symbol (reel-symbol height)

      // Start at a random offset in the first repetition
      const startPos = RNG.randInt(0, total - 1) * symH;
      // Target is in the 2nd repetition for safe scrolling
      const targetPos = (total + targetStop) * symH;
      // Extra "overshoot" full rotations for visual effect
      const extraRounds = 2 + reelIndex;
      const finalPos    = targetPos + extraRounds * total * symH;

      // Snap to start without transition
      strip.style.transition = 'none';
      strip.style.transform  = `translateY(-${startPos}px)`;

      // Force reflow
      strip.offsetHeight; // eslint-disable-line no-unused-expressions

      // Animate to final
      strip.style.transition = `transform ${spinDuration}ms cubic-bezier(0.25,0.1,0.25,1)`;
      strip.style.transform  = `translateY(-${finalPos}px)`;

      setTimeout(() => {
        // Snap back to clean position (targetStop in first repetition)
        strip.style.transition = 'none';
        strip.style.transform  = `translateY(-${targetStop * symH}px)`;
        resolve();
      }, spinDuration);
    });
  }

  // ── Spin handler ──────────────────────────────────────────────────────
  async function _doSpin() {
    if (_spinning) return;

    Audio.unlock();

    // Security check
    const check = Security.checkSpin();
    if (!check.allowed) {
      _showRobotBubble(_lockoutMessage(check.reason));
      return;
    }

    _spinning = true;
    _resetIdle();
    spinBtn.disabled = true;
    spinBtn.classList.add('spinning');

    // Flash lights on
    $$('.lights-bar').forEach(lb => lb.classList.add('active'));

    Audio.playSpin();
    resultDisplay.textContent = '';
    nearMissBar.textContent   = '';
    nearMissBar.classList.remove('visible');

    // Resolve spin
    const result = GameLogic.spin(_currentBet);
    const newlyUnlocked = Achievements.recordSpin();

    // Reel durations staggered: 600ms, 900ms, 1200ms
    const durations = [800, 1100, 1400];
    const spinPromises = result.stops.map((stop, i) =>
      _animateReel(i, stop, durations[i])
    );

    // Play reel-stop sound as each finishes
    spinPromises.forEach((p, i) => p.then(() => {
      Audio.playReelStop(i);
      // Update reels ARIA label with landed symbol
      const sym = GameLogic.getSymbolById(result.symbols[i]);
      $('reel-' + i).setAttribute('aria-label', sym ? sym.label : '');
    }));

    await Promise.all(spinPromises);

    // ── Resolve outcome ───────────────────────────────────────────────
    $$('.lights-bar').forEach(lb => lb.classList.remove('active'));
    spinBtn.classList.remove('spinning');

    if (result.payout > 0 || result.type === 'jackpot') {
      _handleWin(result);
    } else if (result.nearMiss) {
      _handleNearMiss();
    } else {
      _handleLoss();
    }

    // Check achievements
    if (newlyUnlocked.length) _showAchievementUnlock(newlyUnlocked[0]);

    // Update UI
    _updateJackpot();
    _updateStats();
    _updateAchievements();

    _spinning = false;
    spinBtn.disabled = false;
    _resetIdle();
  }

  function _lockoutMessage(reason) {
    const msgs = {
      too_fast:    "Whoa! Slow down, unit! You're not a machine. Well, I am. But still.",
      burst:       "Burst limit reached. Take a breath. Humans need those.",
      low_entropy: "Movement entropy too low. Are you a bot? I'm the only bot allowed here.",
      slow_down:   "Cooldown in progress. " + (Security.lockoutRemaining() / 1000).toFixed(1) + "s remaining.",
    };
    return msgs[reason] || "Not so fast!";
  }

  // ── Win / loss handlers ───────────────────────────────────────────────
  function _handleWin(result) {
    const payout = result.jackpotAmount
      ? result.jackpotAmount + result.payout
      : result.payout;

    if (result.type === 'jackpot') {
      _triggerJackpot(result.jackpotAmount || result.payout);
    } else if (result.payout >= _currentBet * 10) {
      _triggerBigWin(result.payout);
    } else {
      _triggerSmallWin(result.payout);
    }

    // Update winnings display
    _animateWinnings(GameLogic.totalWinnings);

    // Record achievements
    const unlocked = Achievements.recordWin(result.payout);
    if (result.type === 'jackpot') Achievements.recordJackpot();
    if (unlocked.length) _showAchievementUnlock(unlocked[0]);

    // Robot reaction
    const chatResp = Chat.getWinReaction(result.type);
    _addChatMessage('ROBO', chatResp, true);
    _showRobotBubble(chatResp.slice(0, 60));
    _setRobotMood('excited');

    // Leaderboard update
    Leaderboard.recordPlayerWin(_playerName, _playerColor, result.payout);

    resultDisplay.textContent = result.type === 'three' ? '★ THREE OF A KIND! ★' :
                                result.type === 'jackpot' ? '★★★ JACKPOT! ★★★' :
                                'Two of a kind!';
  }

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

  function _handleLoss() {
    Audio.playLoss();
    const chatResp = Chat.getWinReaction('loss');
    _addChatMessage('ROBO', chatResp, true);
    _setRobotMood('sad');
    resultDisplay.textContent = 'No match.';
  }

  // ── Win visual effects ────────────────────────────────────────────────
  function _triggerSmallWin(amount) {
    Audio.playSmallWin();
    _flashWin('green');
    _lightsCycle(1500);
    _showWinCelebration(GameLogic.formatMoney(amount), 'WIN!', 1500);
    _spawnCoins(8);
  }

  function _triggerBigWin(amount) {
    Audio.playBigWin();
    _flashWin('gold');
    _lightsCycle(3000);
    _showWinCelebration(GameLogic.formatMoney(amount), 'BIG WIN!', 3000);
    _spawnCoins(20);
  }

  function _triggerJackpot(amount) {
    Audio.playJackpot();
    _flashWin('gold');
    _lightsCycle(5000);
    _showWinCelebration(GameLogic.formatMoney(amount), 'JACKPOT!!!', 5000);
    _spawnCoins(40);
    _setRobotMood('dance');
    setTimeout(() => _setRobotMood('normal'), 5000);
  }

  function _flashWin(type) {
    const epilepsy = document.body.dataset.epilepsysafe === 'true';
    if (epilepsy) return;
    winFlash.className = 'win-flash-overlay flash-' + type;
    // Reset class after animation
    setTimeout(() => { winFlash.className = 'win-flash-overlay'; }, 1100);
  }

  function _lightsCycle(duration) {
    $$('.lights-bar').forEach(lb => lb.classList.add('win-lights'));
    setTimeout(() => $$('.lights-bar').forEach(lb => lb.classList.remove('win-lights')), duration);
  }

  function _showWinCelebration(amount, label, duration) {
    winAmountDisp.textContent = amount;
    winLabelDisp.textContent  = label;
    winCelebration.classList.add('visible');
    winCelebration.setAttribute('aria-hidden','false');
    setTimeout(() => {
      winCelebration.classList.remove('visible');
      winCelebration.setAttribute('aria-hidden','true');
    }, duration);
  }

  function _spawnCoins(count) {
    const epilepsy = document.body.dataset.epilepsysafe === 'true';
    if (epilepsy) return;
    coinBurst.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin';
      const angle = (i / count) * 2 * Math.PI;
      const dist = 60 + RNG.randInt(0, 80);
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

  // ── Winnings counter animation ────────────────────────────────────────
  function _animateWinnings(target) {
    winningsAmount.classList.add('bump');
    winningsAmount.textContent = GameLogic.formatMoney(target);
    setTimeout(() => winningsAmount.classList.remove('bump'), 450);
  }

  // ── Jackpot display ───────────────────────────────────────────────────
  function _updateJackpot() {
    jackpotAmount.textContent = GameLogic.formatMoney(GameLogic.jackpot);
  }
  setInterval(_updateJackpot, 2000);

  // ── Stats panel ───────────────────────────────────────────────────────
  function _updateStats() {
    const s = Achievements.stats;
    statsSpins.textContent     = s.spins;
    statsWins.textContent      = s.wins;
    statsBest.textContent      = GameLogic.formatMoney(s.bestWin);
    statsJackpots.textContent  = s.jackpots;
    statsTime.textContent      = Achievements.formatTime(s.timePlayed);
  }
  setInterval(_updateStats, 5000);
  _updateStats();

  // ── Achievements ──────────────────────────────────────────────────────
  function _updateAchievements() {
    const defs = Achievements.getDefs();
    achGrid.innerHTML = '';
    defs.forEach(def => {
      const badge = document.createElement('div');
      badge.className = 'ach-badge' + (Achievements.isUnlocked(def.id) ? ' unlocked' : '');
      badge.innerHTML = `
        ${_achIcon(def.icon)}
        <div>${def.label}</div>
        <div class="ach-tooltip">${def.desc}</div>
      `;
      achGrid.appendChild(badge);
    });
  }
  _updateAchievements();

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

  function _showAchievementUnlock(def) {
    Audio.playAchievement();
    _showRobotBubble('ACHIEVEMENT UNLOCKED: ' + def.label + '!');
    _addChatMessage('ROBO', 'Achievement unlocked: ' + def.label + '! ' + def.desc, true);
    _updateAchievements();
  }

  // ── Leaderboard ────────────────────────────────────────────────────────
  function _renderLeaderboard(list, el, maxEntries) {
    const entries = list.slice(0, maxEntries);
    // Diff-render: only update changed entries to avoid full flash
    const existing = el.children;
    entries.forEach((entry, i) => {
      const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
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
      } else {
        const li = document.createElement('li');
        li.className = 'lb-entry';
        li.innerHTML = html;
        el.appendChild(li);
      }
    });
    // Remove extras
    while (el.children.length > entries.length) el.removeChild(el.lastChild);
  }

  function _refreshLeaderboard() {
    _renderLeaderboard(Leaderboard.getTop(8), lbList, 8);
    if (lbFull) _renderLeaderboard(Leaderboard.getAll(), lbFull, 20);
  }
  _refreshLeaderboard();

  Leaderboard.onChange(() => _refreshLeaderboard());

  // ── Chat ──────────────────────────────────────────────────────────────
  function _addChatMessage(author, text, isRobot) {
    const div = document.createElement('div');
    div.className = 'chat-message ' + (isRobot ? 'robot' : 'player');
    div.innerHTML = `<strong>${_esc(author)}:</strong> ${_esc(text)}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    // Keep last 30 messages
    while (chatMessages.children.length > 30) chatMessages.removeChild(chatMessages.firstChild);
  }

  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg) return;
    chatInput.value = '';
    _addChatMessage(_playerName, msg, false);
    Achievements.recordChat();
    Security.addEntropy(msg.length * 17);

    // Contextual reply
    setTimeout(() => {
      const resp = Chat.getResponse(msg);
      _addChatMessage('ROBO', resp, true);
      _showRobotBubble(resp.slice(0, 80));
    }, 400 + RNG.randInt(0, 300));

    _resetIdle();
  });

  // Chat room (slide panel)
  const chatRoomMessages = $('chat-room-messages');
  const chatRoomForm     = $('chat-room-form');
  const chatRoomInput    = $('chat-room-input');

  function _addRoomMessage(author, color, text, isRobot) {
    const div = document.createElement('div');
    div.className = 'chat-room-msg' + (isRobot ? ' robot-msg' : '');
    div.innerHTML = `<span class="msg-author" style="color:${color}">${_esc(author)}</span>${_esc(text)}`;
    chatRoomMessages.appendChild(div);
    chatRoomMessages.scrollTop = chatRoomMessages.scrollHeight;
    while (chatRoomMessages.children.length > 60) chatRoomMessages.removeChild(chatRoomMessages.firstChild);
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

  // ── Robot mascot interactions ─────────────────────────────────────────
  const ROBOT_CLICK_QUIPS = [
    "OW. My thorax.",
    "Please stop poking me.",
    "I have feelings. Probably.",
    "Initiating tickle response...",
    "That was my on/off switch. Please don't.",
    "ALERT: physical contact detected.",
    "My warranty doesn't cover this.",
    "I LIKED YOU BETTER WHEN YOU WERE SPINNING.",
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

  robotMascot.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') robotMascot.click();
  });

  function _showRobotBubble(text) {
    robotBubble.textContent = text;
    robotBubble.classList.add('visible');
    clearTimeout(_showRobotBubble._timer);
    _showRobotBubble._timer = setTimeout(_hideBubble, 4000);
  }

  function _hideBubble() {
    robotBubble.classList.remove('visible');
  }

  function _setRobotMood(mood) {
    robotMascot.classList.remove('robot-excited','robot-sad','robot-dance');
    if (mood !== 'normal') robotMascot.classList.add('robot-' + mood);
    // Update mouth text
    const mouth = robotMascot.querySelector('.mouth-text');
    if (mouth) {
      const texts = { excited:'YEAH!!', sad:'...', dance:'PARTY', normal:'READY', jackpot:'WOW!!' };
      mouth.textContent = texts[mood] || 'READY';
    }
  }

  // ── Idle behavior ─────────────────────────────────────────────────────
  function _resetIdle() {
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
      const quip = Chat.getIdleQuip();
      _showRobotBubble(quip);
      _addChatMessage('ROBO', quip, true);
      _resetIdle();
    }, _idleDelay);
  }
  _resetIdle();

  // ── Keyboard: Spacebar = spin ─────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      _doSpin();
    }
    Security.addEntropy(e.keyCode || 0);
  });

  document.addEventListener('mousemove', e => {
    Security.addEntropy((e.clientX * 7 + e.clientY * 13) & 0xffff);
  }, { passive: true });

  // ── Spin button click ─────────────────────────────────────────────────
  spinBtn.addEventListener('click', _doSpin);

  // ── Panel navigation ──────────────────────────────────────────────────
  function _openPanel(id) {
    const panel = $(id);
    if (!panel) return;
    panel.removeAttribute('hidden');
    panelOverlay.classList.add('active');
    panelOverlay.setAttribute('aria-hidden','false');
    panel.focus();
    Audio.playClick();
  }
  function _closePanel(id) {
    const panel = $(id);
    if (!panel) return;
    panel.setAttribute('hidden','');
    panelOverlay.classList.remove('active');
    panelOverlay.setAttribute('aria-hidden','true');
  }

  ['leaderboard','achievements','stats','settings','chat'].forEach(name => {
    const btn = $('btn-' + name);
    if (btn) btn.addEventListener('click', () => _openPanel('panel-' + name));
  });

  $$('.panel-close').forEach(btn => {
    btn.addEventListener('click', () => _closePanel(btn.dataset.close));
  });

  panelOverlay.addEventListener('click', () => {
    $$('.slide-panel:not([hidden])').forEach(p => _closePanel(p.id));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.slide-panel:not([hidden])').forEach(p => _closePanel(p.id));
  });

  // ── Settings wiring ────────────────────────────────────────────────────
  toggleSound.addEventListener('change',  () => Audio.setSfxEnabled(toggleSound.checked));
  toggleMusic.addEventListener('change',  () => { Audio.unlock(); Audio.setMusicEnabled(toggleMusic.checked); });
  volumeMaster.addEventListener('input',  () => Audio.setMasterVolume(+volumeMaster.value));
  volumeMusic.addEventListener('input',   () => Audio.setMusicVolume(+volumeMusic.value));

  toggleReducedMotion.addEventListener('change', () => {
    document.body.dataset.reducedmotion = String(toggleReducedMotion.checked);
  });
  toggleEpilepsySafe.addEventListener('change', () => {
    document.body.dataset.epilepsysafe = String(toggleEpilepsySafe.checked);
  });

  playerNameInput.addEventListener('input', () => {
    _playerName = playerNameInput.value.trim() || 'YOU';
  });

  $$('.avatar-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.avatar-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _playerColor = btn.dataset.color;
      Audio.playClick();
    });
  });

  // ── Stats full panel ───────────────────────────────────────────────────
  const statsFullEl = $('stats-full');
  $('btn-stats').addEventListener('click', () => {
    const s = Achievements.stats;
    statsFullEl.innerHTML = `
      <dl class="stats-list">
        <div class="stat-row"><dt>Total Spins</dt><dd>${s.spins}</dd></div>
        <div class="stat-row"><dt>Total Wins</dt><dd>${s.wins}</dd></div>
        <div class="stat-row"><dt>Best Single Win</dt><dd>${GameLogic.formatMoney(s.bestWin)}</dd></div>
        <div class="stat-row"><dt>Jackpots Hit</dt><dd>${s.jackpots}</dd></div>
        <div class="stat-row"><dt>Pity Triggers</dt><dd>${s.pityTriggers}</dd></div>
        <div class="stat-row"><dt>Chat Messages</dt><dd>${s.chatMessages}</dd></div>
        <div class="stat-row"><dt>Time Played</dt><dd>${Achievements.formatTime(s.timePlayed)}</dd></div>
        <div class="stat-row"><dt>Achievements</dt><dd>${s.unlocked.length} / ${Achievements.getDefs().length}</dd></div>
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
        <div style="flex-shrink:0;width:36px;height:36px;color:${unlocked?'var(--yellow)':'var(--text-dim)'}">${_achIcon(def.icon)}</div>
        <div>
          <div style="font-weight:700;color:${unlocked?'var(--yellow)':'var(--text-dim)'}">${_esc(def.label)}</div>
          <div style="font-size:0.8rem;color:var(--text-dim)">${_esc(def.desc)}</div>
          ${unlocked ? '<div style="font-size:0.72rem;color:var(--green);margin-top:3px">✓ Unlocked</div>' : ''}
        </div>
      `;
      achFullEl.appendChild(div);
    });
  });

  // ── Utility ────────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Init greeting ──────────────────────────────────────────────────────
  setTimeout(() => {
    const greeting = "SYSTEMS ONLINE. Welcome, unit. Press SPIN to begin. Or talk to me. I'm lonely.";
    _addChatMessage('ROBO', greeting, true);
    _showRobotBubble('SYSTEMS ONLINE. Ready to spin!');
  }, 600);

})();
