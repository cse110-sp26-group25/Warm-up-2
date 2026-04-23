/**
 * main.js — Application Entry Point
 *
 * Bootstraps all modules in dependency order, wires event listeners, and
 * starts the game loop. This is the only file that knows about the ordering
 * of module initialisation; all other modules are self-contained.
 *
 * BOOT ORDER
 * ──────────
 * 1. Security (console warning, devtools watch)
 * 2. Stats, Achievements, Quests, Chat, Avatar (independent)
 * 3. GameLogic (depends on RNG, Security)
 * 4. UI (depends on GameLogic, Audio)
 *
 * Audio is initialised lazily on first user interaction (required by browser
 * autoplay policy). The spin button and space bar are the primary triggers.
 *
 * @module main
 */

(function () {
  "use strict";

  let _audioStarted = false;

  // ── Module Initialisation ─────────────────────────────────────────────────

  function _boot() {
    Security.init();
    Stats.init();
    Achievements.init();
    Quests.init();
    Chat.init();
    Avatar.init();
    GameLogic.init();
    UI.init();

    _wireEventListeners();
    _wireKeyboard();
    _wireSuspiciousActivity();

    console.log(
      "%c🤖 NEURAL MELTDOWN v" + CONFIG.GAME_VERSION + " loaded. " +
      "My prediction: you will have a great time and also lose all your credits.",
      "color:#FFD700;font-weight:bold;"
    );
  }

  // ── Audio Lazy Init ────────────────────────────────────────────────────────

  /**
   * AudioContext requires a user gesture. We initialise it on the first click
   * or keydown anywhere on the page.
   */
  function _ensureAudio() {
    if (_audioStarted) return;
    _audioStarted = true;
    Audio.init();
  }

  // ── Spin Button ────────────────────────────────────────────────────────────

  function _handleSpinPress() {
    _ensureAudio();
    Audio.playClick();
    GameLogic.spin();
    _resetIdleMessage();
  }

  function _wireEventListeners() {
    // Primary spin button
    const spinBtn = document.getElementById("spin-btn");
    if (spinBtn) {
      spinBtn.addEventListener("click", _handleSpinPress);
      // Prevent double-fire on rapid touch
      spinBtn.addEventListener("touchend", (e) => { e.preventDefault(); _handleSpinPress(); });
    }

    // Bet selectors
    const betLow  = document.getElementById("bet-low");
    const betHigh = document.getElementById("bet-high");

    if (betLow) {
      betLow.addEventListener("click", () => {
        _ensureAudio();
        Audio.playClick();
        GameLogic.setBetType("low");
        betLow.classList.add("active");
        betLow.setAttribute("aria-checked", "true");
        if (betHigh) {
          betHigh.classList.remove("active");
          betHigh.setAttribute("aria-checked", "false");
        }
      });
    }

    if (betHigh) {
      betHigh.addEventListener("click", () => {
        _ensureAudio();
        Audio.playClick();
        GameLogic.setBetType("high");
        betHigh.classList.add("active");
        betHigh.setAttribute("aria-checked", "true");
        if (betLow) {
          betLow.classList.remove("active");
          betLow.setAttribute("aria-checked", "false");
        }
      });
    }

    // Chat input
    const chatInput = document.getElementById("chat-input");
    const chatSend  = document.getElementById("chat-send");

    const _sendChatMsg = () => {
      if (!chatInput) return;
      const text = chatInput.value.trim();
      if (!text) return;
      Chat.sendPlayerMessage(text, Avatar.getCurrentName(), Avatar.getCurrentEmoji());
      chatInput.value = "";
    };

    if (chatSend)  chatSend.addEventListener("click", _sendChatMsg);
    if (chatInput) chatInput.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); _sendChatMsg(); }
    });

    // Any interaction should reset the idle timer
    document.addEventListener("click",    _resetIdleMessage, { passive: true });
    document.addEventListener("keydown",  _resetIdleMessage, { passive: true });
    document.addEventListener("touchstart",_resetIdleMessage, { passive: true });
  }

  // ── Keyboard Controls ─────────────────────────────────────────────────────

  function _wireKeyboard() {
    document.addEventListener("keydown", (e) => {
      // Space or Enter triggers a spin (when not focused in a text input)
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        _handleSpinPress();
      }

      // Number keys 1 / 2 switch bet
      if (e.key === "1") document.getElementById("bet-low")?.click();
      if (e.key === "2") document.getElementById("bet-high")?.click();
    });
  }

  // ── Suspicious Activity Response ──────────────────────────────────────────

  function _wireSuspiciousActivity() {
    document.addEventListener("nm:suspiciousActivity", () => {
      // Rate-limit the warning message itself
      UI.showToast(
        "🤖 Suspiciously regular timing detected. Are you a bot? So am I. Ironic.",
        "warn",
        5000
      );
    });
  }

  // ── Idle Message Reset ─────────────────────────────────────────────────────

  let _lastActivity = Date.now();
  function _resetIdleMessage() {
    _lastActivity = Date.now();
  }

  // ── DOMContentLoaded ──────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _boot);
  } else {
    // Already loaded (script deferred or placed at end of body)
    _boot();
  }

})();
