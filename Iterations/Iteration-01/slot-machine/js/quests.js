/**
 * quests.js — Side Quest System
 *
 * Provides five optional side quests that give players medium-term goals and
 * bonus credit rewards. Quest progress is tracked in localStorage so it
 * survives page refreshes.
 *
 * QUEST TYPES (tracker field in CONFIG.QUESTS)
 * ─────────────────────────────────────────────
 * • spins       — total spins played
 * • win_streak  — consecutive wins in a row (resets on any loss)
 * • total_won   — cumulative credits won across spins
 * • high_bets   — cumulative high-bet spins placed
 * • near_misses — cumulative near-miss events
 *
 * Completing a quest pays out a credit reward directly into the player's
 * balance and marks the quest as complete. Completed quests cannot be re-done
 * in the same session (they lock with a ✅ badge).
 *
 * @module Quests
 */

const Quests = (() => {
  "use strict";

  const STORAGE_KEY = `${CONFIG.STORAGE_KEY}_quests`;

  // ── State ──────────────────────────────────────────────────────────────────
  // Map of quest id → { progress: number, completed: bool, completedAt: string|null }
  let _state = {};

  // Win-streak counter (only for the win_streak quest type)
  let _currentWinStreak = 0;

  // ── Persistence ────────────────────────────────────────────────────────────

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _state    = raw ? JSON.parse(raw) : {};
    } catch (_) { _state = {}; }

    CONFIG.QUESTS.forEach(q => {
      if (!_state[q.id]) _state[q.id] = { progress: 0, completed: false, completedAt: null };
    });
  }

  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch (_) {}
  }

  // ── Progress Update ────────────────────────────────────────────────────────

  /**
   * Update quest progress based on a spin result.
   * Called by gameLogic.js after each resolved spin.
   *
   * @param {object} result   - Spin result from GameLogic.processSpin()
   * @param {object} session  - Current session stats from Stats.getSession()
   * @param {function} onReward - Callback(creditAmount) to add reward to balance
   */
  function update(result, session, onReward) {
    // Track win streak for the "win_streak" quest
    if (result.type !== "near_miss" && result.payout > 0) {
      _currentWinStreak++;
    } else if (result.payout === 0) {
      _currentWinStreak = 0;
    }

    CONFIG.QUESTS.forEach(quest => {
      const st = _state[quest.id];
      if (st.completed) return; // Skip already-completed quests

      let newProgress = st.progress;

      switch (quest.tracker) {
        case "spins":
          newProgress = session.spins;
          break;
        case "win_streak":
          newProgress = Math.max(newProgress, _currentWinStreak);
          break;
        case "total_won":
          newProgress = session.totalWon;
          break;
        case "high_bets":
          newProgress = session.highBetsPlaced;
          break;
        case "near_misses":
          newProgress = session.nearMisses;
          break;
        default:
          break;
      }

      const wasBelow = st.progress < quest.goal;
      st.progress    = newProgress;

      // Check completion
      if (wasBelow && newProgress >= quest.goal) {
        _completeQuest(quest, onReward);
      }
    });

    _save();
    _renderPanel();
  }

  // ── Quest Completion ────────────────────────────────────────────────────────

  function _completeQuest(quest, onReward) {
    _state[quest.id].completed   = true;
    _state[quest.id].completedAt = new Date().toISOString();
    _save();

    // Pay out reward
    if (typeof onReward === "function") onReward(quest.reward);

    // Notify the player
    if (typeof UI !== "undefined") {
      UI.showToast(`⚔️ Quest Complete: <strong>${quest.label}</strong> — +${quest.reward} credits!`, "quest");
    }

    // Fire achievement check
    if (typeof Achievements !== "undefined") {
      Achievements.check("quest_complete", { questId: quest.id });
    }

    if (typeof Audio !== "undefined") Audio.playBigWin();
  }

  // ── Panel Rendering ─────────────────────────────────────────────────────────

  function _renderPanel() {
    const container = document.getElementById("quests-list");
    if (!container) return;
    container.innerHTML = "";

    CONFIG.QUESTS.forEach(quest => {
      const st      = _state[quest.id];
      const pct     = Math.min(100, Math.round((st.progress / quest.goal) * 100));
      const done    = st.completed;
      const article = document.createElement("article");
      article.className = `quest-item ${done ? "completed" : "active"}`;
      article.setAttribute("aria-label", `${quest.label}: ${quest.desc}. Progress: ${st.progress}/${quest.goal}.${done ? " Completed." : ""}`);

      article.innerHTML = `
        <header class="quest-header">
          <span class="quest-icon" aria-hidden="true">${done ? "✅" : quest.icon}</span>
          <span class="quest-label">${quest.label}</span>
          <span class="quest-reward">+${quest.reward} cr</span>
        </header>
        <p class="quest-desc">${quest.desc}</p>
        <div class="quest-progress-bar" role="progressbar"
             aria-valuenow="${st.progress}" aria-valuemin="0" aria-valuemax="${quest.goal}"
             aria-label="Quest progress">
          <div class="quest-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="quest-fraction">${st.progress.toLocaleString()} / ${quest.goal.toLocaleString()}</span>
      `;
      container.appendChild(article);
    });
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  function getCompletedCount() {
    return CONFIG.QUESTS.filter(q => _state[q.id]?.completed).length;
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    _load();
    _renderPanel();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return Object.freeze({ init, update, getCompletedCount });

})();
