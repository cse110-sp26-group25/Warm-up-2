/**
 * uiMascot.js — Robot mascot, speech bubble, chat widgets (Iteration 21).
 *
 * Owns:
 *   • Robot mascot click / hover / long-press reactions and mood state.
 *   • Speech-bubble show / hide with auto-dismiss timer.
 *   • Mini-chat log and form (player ↔ ROBO conversation).
 *   • Global chat-room log and form (broadcast room).
 *   • Idle-quip countdown (fires after CFG.IDLE_QUIP_MS of inactivity).
 *
 * Iteration 21 additions:
 *   • `updateRankEvolution()` — public method that applies the
 *     `.gold-plated` class (top 5) or `.polished-chrome` class
 *     (top 20) to the mascot element based on
 *     `Leaderboard.getPlayerRank()`. Classes are mutually exclusive.
 *   • 3-second long-press on the mascot triggers a diagnostic export
 *     of the current `State` snapshot as a `session_diagnostic.json`
 *     download. Pointer-down arms a timer; pointer-up before 3s
 *     cancels it so the normal click handler still fires.
 *
 * Player identity (name + colour) is read from State on demand so this
 * module never holds stale copies after a settings change.
 *
 * @module UiMascot
 */
const UiMascot = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIG
  // ═══════════════════════════════════════════════════════════════════
  /** @type {Object} Mascot and chat tunables. */
  const CFG = Object.freeze({
    /** Auto-hide delay for the speech bubble (ms). */
    BUBBLE_HIDE_MS:  4000,
    /** Inactivity window before ROBO offers an idle quip (ms). */
    IDLE_QUIP_MS:    18000,
    /** Maximum messages retained in the mini-chat log. */
    MINI_CHAT_LIMIT: 30,
    /** Maximum messages retained in the global chat-room log. */
    ROOM_CHAT_LIMIT: 60,
    /** Delay range for ROBO's mini-chat reply (base ms). */
    MINI_REPLY_BASE: 400,
    /** Random extra delay added to ROBO's mini-chat reply (ms). */
    MINI_REPLY_RAND: 300,
    /** Delay range for ROBO's room reply (base ms). */
    ROOM_REPLY_BASE: 600,
    /** Random extra delay added to ROBO's room reply (ms). */
    ROOM_REPLY_RAND: 400,
    /** Duration to hold "excited" mood after a mascot click (ms). */
    CLICK_MOOD_MS:   1200,
    /** Duration to hold hover bubble before auto-hiding (ms). */
    HOVER_BUBBLE_MS: 1800,
    /**
     * Iteration 21 — rank-evolution thresholds. Ranks are 1-indexed
     * (rank 1 is the top of the leaderboard). RANK_GOLD_MAX is the
     * inclusive upper bound for the gold-plated tier; RANK_CHROME_MAX
     * for the polished-chrome tier. Below CHROME_MAX the mascot reverts
     * to its default appearance.
     */
    RANK_GOLD_MAX:   5,
    RANK_CHROME_MAX: 20,
    /**
     * Iteration 21 — long-press threshold for diagnostic export (ms).
     * 3 seconds is deliberately long enough that a stray tap or
     * accidental press-and-hold (common on touch devices) can't
     * trigger the download.
     */
    LONG_PRESS_MS: 3000,
  });

  // ── DOM references (retrieved once; null-guarded before use) ───────
  const robotBubble      = document.getElementById('robot-bubble');
  const robotMascot      = document.getElementById('robot-mascot');
  const chatMessages     = document.getElementById('chat-messages');
  const chatForm         = document.getElementById('chat-form');
  const chatInput        = document.getElementById('chat-input');
  const chatRoomMessages = document.getElementById('chat-room-messages');
  const chatRoomForm     = document.getElementById('chat-room-form');
  const chatRoomInput    = document.getElementById('chat-room-input');

  // ── Private state ──────────────────────────────────────────────────
  /** @type {number|null} Handle for the bubble auto-hide timer. */
  let _bubbleTimer = null;
  /** @type {number|null} Handle for the idle-quip timer. */
  let _idleTimer = null;

  // ── Click-quip pool ────────────────────────────────────────────────
  /** @type {ReadonlyArray<string>} */
  const ROBOT_CLICK_QUIPS = Object.freeze([
    'OW. My thorax.',
    'Please stop poking me.',
    'I have feelings. Probably.',
    'Initiating tickle response...',
    "That was my on/off switch. Please don't.",
    'ALERT: physical contact detected.',
    "My warranty doesn't cover this.",
    'I LIKED YOU BETTER WHEN YOU WERE SPINNING.',
  ]);

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * HTML-escape a value for safe innerHTML insertion.
   * @param {*} str - Any value coercible to string.
   * @returns {string} Escaped string.
   */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Hide the robot speech bubble.
   * @returns {void}
   */
  function _hideBubble() {
    if (robotBubble) robotBubble.classList.remove('visible');
  }

  /**
   * Show the robot speech bubble with the given text.
   * Resets the auto-hide timer on every call.
   * @param {string} text - Message to display.
   * @returns {void}
   */
  function _showRobotBubble(text) {
    if (!robotBubble) return;
    robotBubble.textContent = text;
    robotBubble.classList.add('visible');
    if (_bubbleTimer !== null) clearTimeout(_bubbleTimer);
    _bubbleTimer = setTimeout(_hideBubble, CFG.BUBBLE_HIDE_MS);
  }

  /**
   * Set the mascot CSS mood class and update the mouth-display text.
   * @param {('normal'|'excited'|'sad'|'dance')} mood
   * @returns {void}
   */
  function _setRobotMood(mood) {
    if (!robotMascot) return;
    robotMascot.classList.remove('robot-excited', 'robot-sad', 'robot-dance');
    if (mood !== 'normal') robotMascot.classList.add('robot-' + mood);
    const mouth = robotMascot.querySelector('.mouth-text');
    if (mouth) {
      const texts = { excited: 'YEAH!!', sad: '...', dance: 'PARTY', normal: 'READY' };
      mouth.textContent = texts[mood] || 'READY';
    }
  }

  /**
   * Append a message row to the mini-chat log, pruning old entries.
   * @param {string}  author  - Speaker name.
   * @param {string}  text    - Message text (HTML-escaped before insertion).
   * @param {boolean} isRobot - True if the speaker is ROBO.
   * @returns {void}
   */
  function _addChatMessage(author, text, isRobot) {
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = 'chat-message ' + (isRobot ? 'robot' : 'player');
    div.innerHTML = `<strong>${_esc(author)}:</strong> ${_esc(text)}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    while (chatMessages.children.length > CFG.MINI_CHAT_LIMIT) {
      chatMessages.removeChild(chatMessages.firstChild);
    }
  }

  /**
   * Append a message row to the global chat-room log, pruning old entries.
   * @param {string}  author  - Speaker name.
   * @param {string}  color   - Author hex colour (used inline on the name span).
   * @param {string}  text    - Message text.
   * @param {boolean} isRobot - True if speaker is a bot.
   * @returns {void}
   */
  function _addRoomMessage(author, color, text, isRobot) {
    if (!chatRoomMessages) return;
    const div = document.createElement('div');
    div.className = 'chat-room-msg' + (isRobot ? ' robot-msg' : '');
    div.innerHTML =
      `<span class="msg-author" style="color:${_esc(color)}">${_esc(author)}</span>${_esc(text)}`;
    chatRoomMessages.appendChild(div);
    chatRoomMessages.scrollTop = chatRoomMessages.scrollHeight;
    while (chatRoomMessages.children.length > CFG.ROOM_CHAT_LIMIT) {
      chatRoomMessages.removeChild(chatRoomMessages.firstChild);
    }
  }

  /**
   * Reset the idle-quip countdown.
   * Called after every user interaction so the timer only fires when
   * the player has been truly inactive for CFG.IDLE_QUIP_MS.
   * @returns {void}
   */
  function _resetIdle() {
    if (_idleTimer !== null) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
      const quip = Chat.getIdleQuip();
      _showRobotBubble(quip);
      _addChatMessage('ROBO', quip, true);
      _resetIdle(); // re-arm for the next idle cycle
    }, CFG.IDLE_QUIP_MS);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Iteration 21 — Rank evolution + diagnostic export
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Apply the correct rank-evolution CSS class to the mascot element.
   *
   * Reads `Leaderboard.getPlayerRank()` (1-indexed; null = unranked)
   * and toggles `.gold-plated` / `.polished-chrome` / neither. The
   * two classes are mutually exclusive — the higher tier wins.
   *
   * Idempotent: calling it repeatedly with no rank change is a no-op
   * because classList.add/remove short-circuit when the class is
   * already in the expected state. Safe to call after every win.
   *
   * @returns {void}
   */
  function _updateRankEvolution() {
    if (!robotMascot || typeof Leaderboard === 'undefined') return;

    const rank = Leaderboard.getPlayerRank();

    // Always clear both classes first so a rank drop cleanly removes
    // the previous tier's styling.
    robotMascot.classList.remove('gold-plated', 'polished-chrome');

    if (rank === null || rank === undefined) return;

    if (rank <= CFG.RANK_GOLD_MAX) {
      robotMascot.classList.add('gold-plated');
    } else if (rank <= CFG.RANK_CHROME_MAX) {
      robotMascot.classList.add('polished-chrome');
    }
    // Otherwise: mascot stays default — no class added.
  }

  /**
   * Trigger a browser download of the current persistent state as a
   * JSON file named `session_diagnostic.json`.
   *
   * Called from the 3-second long-press handler on the mascot. The
   * file is assembled client-side via a Blob URL; no network
   * round-trip. Revokes the object URL after triggering the download
   * so we don't leak the Blob for the rest of the session.
   *
   * Additionally logs a bubble acknowledgement so the player gets
   * visible confirmation the action fired.
   *
   * @returns {void}
   */
  function _exportDiagnostic() {
    try {
      const snapshot = State.snapshot();
      // Add a few derived fields the raw snapshot lacks that would
      // be useful to a reviewer inspecting the export offline.
      const diagnostic = {
        exportedAt:       new Date().toISOString(),
        userAgent:        navigator.userAgent,
        sessionCount:     State.sessionCount(),
        isReturning:      State.isReturningPlayer(),
        msSinceLastSession: State.msSinceLastSession(),
        state:            snapshot,
      };
      const blob = new Blob([JSON.stringify(diagnostic, null, 2)],
                            { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'session_diagnostic.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Release the blob URL promptly; it's already been navigated to.
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      _showRobotBubble('Diagnostic export complete. Check your downloads.');
      _addChatMessage('ROBO', 'Session diagnostic exported to session_diagnostic.json.', true);
    } catch (err) {
      _showRobotBubble('Diagnostic export failed. Check console for details.');
      // Don't swallow — surface to the console for developers.
      console.error('[UiMascot] Diagnostic export failed:', err);
    }
  }
  // ── Wire mascot button events ──────────────────────────────────────
  //
  // Iteration 21 — long-press handling layered on top of the existing
  // click/hover listeners. pointerdown arms a 3-second timer; pointerup,
  // pointercancel, or pointerleave cancels it. If the timer fires,
  // `_exportDiagnostic()` runs AND a flag is set that suppresses the
  // immediately-subsequent click event (otherwise the player would see
  // both a diagnostic download AND a mascot quip firing back-to-back).
  /** @type {number|null} Handle for the long-press timer. */
  let _longPressTimer = null;
  /**
   * Flag set when a long-press just completed; the next click event
   * on the mascot will be consumed silently. Reset on next pointerdown.
   * @type {boolean}
   */
  let _longPressFired = false;

  if (robotMascot) {
    robotMascot.addEventListener('pointerdown', (e) => {
      // Only left-button / touch presses arm the long-press.
      if (e.button !== undefined && e.button !== 0) return;
      _longPressFired = false;
      if (_longPressTimer !== null) clearTimeout(_longPressTimer);
      _longPressTimer = setTimeout(() => {
        _longPressFired = true;
        _longPressTimer = null;
        _exportDiagnostic();
      }, CFG.LONG_PRESS_MS);
    });

    const _cancelLongPress = () => {
      if (_longPressTimer !== null) {
        clearTimeout(_longPressTimer);
        _longPressTimer = null;
      }
    };
    robotMascot.addEventListener('pointerup',     _cancelLongPress);
    robotMascot.addEventListener('pointercancel', _cancelLongPress);
    robotMascot.addEventListener('pointerleave',  _cancelLongPress);

    robotMascot.addEventListener('click', () => {
      // If the long-press just fired, swallow this synthetic click.
      if (_longPressFired) {
        _longPressFired = false;
        return;
      }
      const quip = RNG.pick(ROBOT_CLICK_QUIPS);
      _showRobotBubble(quip);
      _setRobotMood('excited');
      Audio.playClick();
      setTimeout(() => _setRobotMood('normal'), CFG.CLICK_MOOD_MS);
      _resetIdle();
    });

    robotMascot.addEventListener('mouseenter', () => {
      _showRobotBubble('Hover detected. Suspicious.');
      // Override the 4s auto-hide with a shorter one for the hover tooltip.
      if (_bubbleTimer !== null) clearTimeout(_bubbleTimer);
      _bubbleTimer = setTimeout(_hideBubble, CFG.HOVER_BUBBLE_MS);
    });
  }

  // ── Wire mini-chat form ────────────────────────────────────────────
  if (chatForm) {
    chatForm.addEventListener('submit', e => {
      e.preventDefault();
      const msg = chatInput ? chatInput.value.trim() : '';
      if (!msg) return;
      if (chatInput) chatInput.value = '';

      const playerName = State.get('player.name') || 'YOU';
      _addChatMessage(playerName, msg, false);
      Achievements.recordChat();
      Security.addEntropy(msg.length * 17);

      setTimeout(() => {
        const resp = Chat.getResponse(msg);
        _addChatMessage('ROBO', resp, true);
        _showRobotBubble(resp.slice(0, 80));
      }, CFG.MINI_REPLY_BASE + RNG.randInt(0, CFG.MINI_REPLY_RAND));

      _resetIdle();
    });
  }

  // ── Wire global chat-room form ─────────────────────────────────────
  if (chatRoomForm) {
    chatRoomForm.addEventListener('submit', e => {
      e.preventDefault();
      const msg = chatRoomInput ? chatRoomInput.value.trim() : '';
      if (!msg) return;
      if (chatRoomInput) chatRoomInput.value = '';

      const playerName  = State.get('player.name')  || 'YOU';
      const playerColor = State.get('player.color') || '#fff176';
      _addRoomMessage(playerName, playerColor, msg, false);
      Achievements.recordChat();

      setTimeout(() => {
        const resp = Chat.getResponse(msg);
        _addRoomMessage('ROBO', '#69f0ae', resp, true);
      }, CFG.ROOM_REPLY_BASE + RNG.randInt(0, CFG.ROOM_REPLY_RAND));
    });
  }

  // ── Subscribe to simulated room-bot messages ───────────────────────
  Chat.onRoomMessage((name, color, msg) => _addRoomMessage(name, color, msg, false));

  // ── Kick off the idle-quip timer on module load ────────────────────
  _resetIdle();

  // ── Public API ─────────────────────────────────────────────────────
  return Object.freeze({

    /**
     * Show the robot speech bubble with the given text.
     * @param {string} text - Message to display.
     * @returns {void}
     */
    showRobotBubble: _showRobotBubble,

    /**
     * Set the mascot's current mood.
     * @param {('normal'|'excited'|'sad'|'dance')} mood
     * @returns {void}
     */
    setRobotMood: _setRobotMood,

    /**
     * Append a message to the mini-chat log.
     * @param {string}  author  - Speaker name.
     * @param {string}  text    - Message text.
     * @param {boolean} isRobot - True if ROBO is speaking.
     * @returns {void}
     */
    addChatMessage: _addChatMessage,

    /**
     * Append a message to the global chat-room log.
     * @param {string}  author  - Speaker name.
     * @param {string}  color   - Hex colour for the name.
     * @param {string}  text    - Message text.
     * @param {boolean} isRobot - True if a bot is speaking.
     * @returns {void}
     */
    addRoomMessage: _addRoomMessage,

    /**
     * Reset the idle-quip countdown (call after every user interaction).
     * @returns {void}
     */
    resetIdle: _resetIdle,

    /**
     * Iteration 21 — sync the mascot's rank-evolution CSS class with
     * the current player rank from `Leaderboard.getPlayerRank()`.
     *
     * Top 5 → `.gold-plated` (gold filter + crown pseudo-element).
     * Top 20 → `.polished-chrome` (brightness/contrast boost).
     * Below top 20 or unranked → both classes removed.
     *
     * Safe to call repeatedly; idempotent when rank is unchanged.
     * @returns {void}
     */
    updateRankEvolution: _updateRankEvolution,
  });
})();
