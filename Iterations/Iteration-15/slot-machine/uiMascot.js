/**
 * uiMascot.js — Robot mascot, speech bubble, chat widgets (Iteration 09).
 *
 * Owns:
 *   • Robot mascot click / hover reactions and mood state.
 *   • Speech-bubble show / hide with auto-dismiss timer.
 *   • Mini-chat log and form (player ↔ ROBO conversation).
 *   • Global chat-room log and form (broadcast room).
 *   • Idle-quip countdown (fires after CFG.IDLE_QUIP_MS of inactivity).
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

  // ── Wire mascot button events ──────────────────────────────────────
  if (robotMascot) {
    robotMascot.addEventListener('click', () => {
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
  });
})();
