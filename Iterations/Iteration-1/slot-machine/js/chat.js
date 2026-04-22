/**
 * chat.js — Simulated Chat Room
 *
 * Provides a live-feeling chat experience without a server. Simulated bot
 * players post messages at random intervals to create atmosphere. Real
 * player messages appear immediately.
 *
 * The AI commentary bot "GLITCH_BOT" occasionally responds directly to
 * in-game events (big win, jackpot) with snarky AI-bashing commentary.
 *
 * All messages are sanitised before insertion to prevent XSS.
 *
 * @module Chat
 */

const Chat = (() => {
  "use strict";

  const MAX_MESSAGES    = 80;   // Maximum messages before oldest are pruned
  let   _botTimers      = [];   // setInterval/setTimeout handles
  let   _aiJokesAgreed  = 0;    // Counter for "AI Critic" achievement

  // ── Sanitisation ──────────────────────────────────────────────────────────

  function _sanitise(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Message Rendering ─────────────────────────────────────────────────────

  /**
   * Append a single chat message to the chat window.
   *
   * @param {string}  name    - Sender display name
   * @param {string}  avatar  - Single emoji avatar
   * @param {string}  text    - Raw message text (will be sanitised)
   * @param {string}  [type]  - "player" | "bot" | "system" | "ai"
   */
  function _appendMessage(name, avatar, text, type = "bot") {
    const container = document.getElementById("chat-messages");
    if (!container) return;

    const msg = document.createElement("article");
    msg.className = `chat-msg chat-msg--${type}`;
    msg.setAttribute("aria-label", `${name} says: ${text}`);

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    msg.innerHTML = `
      <span class="chat-avatar" aria-hidden="true">${avatar}</span>
      <div class="chat-body">
        <header class="chat-meta">
          <span class="chat-name">${_sanitise(name)}</span>
          <time class="chat-time">${timeStr}</time>
        </header>
        <p class="chat-text">${_sanitise(text)}</p>
      </div>
    `;

    container.appendChild(msg);

    // Prune old messages to keep DOM light
    const all = container.querySelectorAll(".chat-msg");
    if (all.length > MAX_MESSAGES) {
      all[0].remove();
    }

    // Auto-scroll to latest message
    container.scrollTop = container.scrollHeight;
  }

  // ── System / AI Event Messages ─────────────────────────────────────────────

  /**
   * Post a system-level announcement (e.g. someone won the jackpot).
   */
  function postSystemMessage(text) {
    _appendMessage("SYSTEM", "📢", text, "system");
  }

  /**
   * Post a game-event-triggered AI commentary message.
   * Called from gameLogic.js on big events.
   */
  function postAIComment(event) {
    let pool;
    switch (event) {
      case "win":     pool = CONFIG.AI_TAUNTS_WIN;     break;
      case "lose":    pool = CONFIG.AI_TAUNTS_LOSE;    break;
      case "jackpot": pool = CONFIG.AI_TAUNTS_JACKPOT; break;
      default:        pool = CONFIG.AI_TAUNTS_IDLE;    break;
    }
    const text = pool[Math.floor(Math.random() * pool.length)];
    _appendMessage("GLITCH.AI", "🤖", text, "ai");
  }

  // ── AI Joke Bar ────────────────────────────────────────────────────────────
  // The "AI Commentary" banner above the reels shows rotating taunts.
  // Players can click "👍 Agree" to collect the "AI Critic" achievement.

  let _currentTauntIndex = 0;
  let _tauntTimer        = null;

  function _rotateTaunt() {
    const pool  = CONFIG.AI_TAUNTS_IDLE;
    const text  = pool[_currentTauntIndex % pool.length];
    const el    = document.getElementById("taunt-text");
    if (el) {
      el.style.opacity = "0";
      setTimeout(() => {
        el.textContent   = text;
        el.style.opacity = "1";
      }, 400);
    }
    _currentTauntIndex++;
  }

  function _setupAgreeButton() {
    const btn = document.getElementById("taunt-agree");
    if (!btn) return;
    btn.addEventListener("click", () => {
      _aiJokesAgreed++;
      btn.textContent = "✅ Agreed!";
      btn.disabled    = true;
      // Re-enable after taunt rotation
      setTimeout(() => {
        btn.textContent = "👍 Agree";
        btn.disabled    = false;
      }, 4000);
      if (typeof Achievements !== "undefined") {
        Achievements.check("ai_joke_agreed", { count: _aiJokesAgreed });
      }
      if (typeof Audio !== "undefined") Audio.playClick();
    });
  }

  // ── Player Send ────────────────────────────────────────────────────────────

  /**
   * Send a player-authored message. Called from the input handler in main.js.
   */
  function sendPlayerMessage(text, playerName, playerAvatar) {
    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return;

    _appendMessage(playerName || "You", playerAvatar || "😀", trimmed, "player");

    // Achievement: first chat message
    if (typeof Achievements !== "undefined") {
      Achievements.check("chat_message");
    }

    // Occasionally have GLITCH_BOT "respond" to the player
    if (Math.random() < 0.25) {
      const delay = 1500 + Math.random() * 3000;
      setTimeout(() => postAIComment("idle"), delay);
    }
  }

  // ── Bot Simulation ─────────────────────────────────────────────────────────

  function _scheduleBot(bot) {
    const [minDelay, maxDelay] = bot.delay;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);

    const timer = setTimeout(() => {
      const pool = CONFIG.CHAT_BOT_MESSAGES;
      const msg  = pool[Math.floor(Math.random() * pool.length)];
      _appendMessage(bot.name, bot.avatar, msg, "bot");
      _scheduleBot(bot); // Reschedule
    }, delay);

    _botTimers.push(timer);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    // Post a welcome message
    _appendMessage("GLITCH.AI", "🤖",
      "Welcome to NEURAL MELTDOWN. I have calculated a 97.3% chance you will lose all your credits. Good luck — statistically you'll need it.",
      "ai");

    // Start all bot simulation timers
    CONFIG.CHAT_BOTS.forEach(_scheduleBot);

    // Rotate taunts every 8 seconds
    _rotateTaunt();
    _tauntTimer = setInterval(_rotateTaunt, 8000);

    // Wire up agree button
    _setupAgreeButton();
  }

  /**
   * Trigger an AI comment in the chat tied to a specific game event.
   * Exposed so gameLogic.js can call it.
   */
  function triggerAIEvent(event) {
    // Only post to chat occasionally to avoid spam
    if (Math.random() < 0.5) {
      setTimeout(() => postAIComment(event), 800 + Math.random() * 1500);
    }
    // Always update the taunt bar immediately for major events
    if (event === "jackpot" || event === "win") {
      const pool = event === "jackpot" ? CONFIG.AI_TAUNTS_JACKPOT : CONFIG.AI_TAUNTS_WIN;
      const el   = document.getElementById("taunt-text");
      if (el) {
        el.style.opacity = "0";
        setTimeout(() => {
          el.textContent   = pool[Math.floor(Math.random() * pool.length)];
          el.style.opacity = "1";
        }, 300);
      }
    }
  }

  // ── Destroy ────────────────────────────────────────────────────────────────

  function destroy() {
    _botTimers.forEach(t => clearTimeout(t));
    _botTimers = [];
    clearInterval(_tauntTimer);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return Object.freeze({ init, destroy, sendPlayerMessage, postSystemMessage, triggerAIEvent });

})();
