/**
 * achievements.js — Achievement System
 *
 * Manages the 15 in-game achievements defined in CONFIG.ACHIEVEMENTS.
 * State is persisted to localStorage so achievements carry across sessions.
 *
 * DESIGN
 * ──────
 * Each achievement has:
 *  • id        — unique identifier
 *  • label     — short display name
 *  • desc      — description shown to player
 *  • icon      — emoji icon
 *  • unlocked  — boolean (persisted)
 *  • unlockedAt — ISO timestamp of first unlock
 *
 * Achievements are checked reactively: call Achievements.check(eventType, data)
 * from gameLogic.js or other modules after each relevant event.
 *
 * When an achievement unlocks for the first time, a toast notification is
 * shown and the achievement panel is updated.
 *
 * @module Achievements
 */

const Achievements = (() => {
  "use strict";

  const STORAGE_KEY = `${CONFIG.STORAGE_KEY}_achievements`;

  // ── State ──────────────────────────────────────────────────────────────────
  // Map of id → { unlocked: bool, unlockedAt: string|null }
  let _state = {};

  // ── Persistence ────────────────────────────────────────────────────────────

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _state    = raw ? JSON.parse(raw) : {};
    } catch (_) {
      _state = {};
    }
    // Ensure all achievements have a state entry (for new achievements added later)
    CONFIG.ACHIEVEMENTS.forEach(a => {
      if (!_state[a.id]) _state[a.id] = { unlocked: false, unlockedAt: null };
    });
  }

  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch (_) {}
  }

  // ── Unlock ─────────────────────────────────────────────────────────────────

  /**
   * Unlock a single achievement by id. If already unlocked, do nothing.
   * @param {string} id - Achievement id from CONFIG.ACHIEVEMENTS
   */
  function unlock(id) {
    if (!_state[id] || _state[id].unlocked) return;

    _state[id].unlocked   = true;
    _state[id].unlockedAt = new Date().toISOString();
    _save();

    const def = CONFIG.ACHIEVEMENTS.find(a => a.id === id);
    if (!def) return;

    // Notify the UI
    if (typeof UI !== "undefined") UI.showAchievementToast(def);
    if (typeof Audio !== "undefined") Audio.playAchievement();
    _renderPanel();
  }

  // ── Event-based Checks ─────────────────────────────────────────────────────

  /**
   * Evaluate which achievements should fire after a game event.
   * Called from gameLogic.js after each spin and from other modules.
   *
   * @param {string} event - Event name (see switch below)
   * @param {object} data  - Event payload (varies by event)
   */
  function check(event, data = {}) {
    switch (event) {

      case "spin": {
        // "First Blood" — very first spin ever
        if (data.totalSpins === 1) unlock("first_spin");

        // "Centurion" — 100th spin
        if (data.totalSpins === 100) unlock("centurion");

        // "Millennium" — 1000th spin
        if (data.totalSpins === 1000) unlock("millennium");

        // "Rock Bottom" — balance reached 0
        if (data.balance <= 0) unlock("broke");

        // "Night Owl" — 30 minutes of play
        if (data.sessionMinutes >= 30) unlock("night_owl");

        // "Diamond Hands" — 50 consecutive high bets
        if (data.highBetStreak >= 50) unlock("diamond_hand");

        // "Safety First" — 50 consecutive low bets
        if (data.lowBetStreak >= 50) unlock("safety_first");

        break;
      }

      case "win": {
        // "Lucky Accident" — first ever win
        unlock("first_win");

        // "High Roller" — single win ≥ 500
        if (data.amount >= 500) unlock("high_roller");

        // "Survivor" — was below 50, now above 200
        if (data.prevBalance < 50 && data.newBalance >= 200) unlock("survivor");

        break;
      }

      case "jackpot": {
        unlock("jackpot");
        break;
      }

      case "pity_win": {
        unlock("pity_win");
        break;
      }

      case "chat_message": {
        unlock("chat_user");
        break;
      }

      case "quest_complete": {
        unlock("quest_done");
        break;
      }

      case "ai_joke_agreed": {
        // "AI Critic" — agreed with 5 different jokes
        if (data.count >= 5) unlock("ai_hater");
        break;
      }

      default:
        break;
    }
  }

  // ── Panel Rendering ─────────────────────────────────────────────────────────

  /**
   * Render (or re-render) the full achievements list into #achievements-list.
   */
  function _renderPanel() {
    const container = document.getElementById("achievements-list");
    if (!container) return;

    container.innerHTML = "";

    // Group: unlocked first, then locked
    const defs = CONFIG.ACHIEVEMENTS;
    const sorted = [...defs].sort((a, b) => {
      const aU = _state[a.id]?.unlocked ? 0 : 1;
      const bU = _state[b.id]?.unlocked ? 0 : 1;
      return aU - bU;
    });

    sorted.forEach(def => {
      const st   = _state[def.id] || { unlocked: false };
      const item = document.createElement("article");
      item.className = `achievement-item ${st.unlocked ? "unlocked" : "locked"}`;
      item.setAttribute("aria-label", `${def.label}: ${def.desc}${st.unlocked ? " (unlocked)" : " (locked)"}`);

      item.innerHTML = `
        <span class="ach-icon" aria-hidden="true">${st.unlocked ? def.icon : "🔒"}</span>
        <div class="ach-info">
          <strong class="ach-label">${def.label}</strong>
          <span class="ach-desc">${def.desc}</span>
          ${st.unlockedAt ? `<time class="ach-time" datetime="${st.unlockedAt}">${_formatDate(st.unlockedAt)}</time>` : ""}
        </div>
      `;
      container.appendChild(item);
    });
  }

  function _formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (_) { return ""; }
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  function getUnlockedCount() {
    return CONFIG.ACHIEVEMENTS.filter(a => _state[a.id]?.unlocked).length;
  }

  function isUnlocked(id) {
    return !!_state[id]?.unlocked;
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    _load();
    _renderPanel();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return Object.freeze({ init, unlock, check, getUnlockedCount, isUnlocked, renderPanel: _renderPanel });

})();
