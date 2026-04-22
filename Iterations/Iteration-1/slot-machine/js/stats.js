/**
 * stats.js — Session Statistics and Leaderboard
 *
 * Tracks per-session stats (spins, time played, credits won) and maintains a
 * persistent all-time leaderboard in localStorage ranked by total credits won.
 *
 * SESSION STATS (in-memory, reset each page load)
 * ─────────────────────────────────────────────────
 * • spins          — total spins this session
 * • totalWon       — total credits won (not net; never shows net loss)
 * • startTime      — session start timestamp
 * • winStreak      — current consecutive winning spins
 * • lossStreak     — current consecutive losing spins
 * • highBetStreak  — consecutive high-bet spins
 * • lowBetStreak   — consecutive low-bet spins
 * • nearMisses     — near-miss count this session
 * • highBetsPlaced — total high bets placed this session
 *
 * LEADERBOARD (localStorage)
 * ───────────────────────────
 * Top N scores by "total won" within a single session. Players enter a name
 * on the leaderboard submission form.
 *
 * @module Stats
 */

const Stats = (() => {
  "use strict";

  const STORAGE_KEY = `${CONFIG.STORAGE_KEY}_leaderboard`;

  // ── Session State ──────────────────────────────────────────────────────────
  const _session = {
    spins:         0,
    totalWon:      0,
    startTime:     Date.now(),
    winStreak:     0,
    lossStreak:    0,
    highBetStreak: 0,
    lowBetStreak:  0,
    nearMisses:    0,
    highBetsPlaced:0,
  };

  // ── Leaderboard State ──────────────────────────────────────────────────────
  let _leaderboard = []; // Array of { name, avatar, score, date }

  // ── Persistence ────────────────────────────────────────────────────────────

  function _loadLeaderboard() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _leaderboard = raw ? JSON.parse(raw) : [];
    } catch (_) {
      _leaderboard = [];
    }
  }

  function _saveLeaderboard() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_leaderboard)); } catch (_) {}
  }

  // ── Session Updates ────────────────────────────────────────────────────────

  /**
   * Record the result of a completed spin.
   * @param {object} result - From GameLogic.processSpin()
   */
  function recordSpin(result) {
    _session.spins++;

    // Near-miss tracking
    if (result.type === "near_miss") {
      _session.nearMisses++;
    }

    // High/low bet streaks
    if (result.betType === "high") {
      _session.highBetsPlaced++;
      _session.highBetStreak++;
      _session.lowBetStreak = 0;
    } else {
      _session.highBetStreak = 0;
      _session.lowBetStreak++;
    }

    // Win / loss streaks and total-won counter
    if (result.payout > 0) {
      _session.totalWon  += result.payout;
      _session.winStreak++;
      _session.lossStreak = 0;
    } else {
      _session.winStreak  = 0;
      _session.lossStreak++;
    }

    _updateStatBar();
  }

  // ── UI Bar Update ───────────────────────────────────────────────────────────

  function _updateStatBar() {
    const elapsed = Math.floor((Date.now() - _session.startTime) / 1000);
    const mins    = Math.floor(elapsed / 60);
    const secs    = elapsed % 60;

    _setText("stat-spins",  _session.spins.toLocaleString());
    _setText("stat-won",    _session.totalWon.toLocaleString());
    _setText("stat-streak", _session.winStreak);
    _setText("stat-time",   `${mins}:${String(secs).padStart(2, "0")}`);
  }

  function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ── Leaderboard Operations ─────────────────────────────────────────────────

  /**
   * Submit current session's score to the leaderboard.
   * @param {string} playerName - Display name for this entry
   * @param {string} avatarEmoji - Avatar emoji to show beside name
   */
  function submitScore(playerName, avatarEmoji) {
    const entry = {
      name:   (playerName || "Anonymous").slice(0, 24),
      avatar: avatarEmoji || "😀",
      score:  _session.totalWon,
      spins:  _session.spins,
      date:   new Date().toISOString(),
    };

    _leaderboard.push(entry);
    // Sort descending by score, keep top N
    _leaderboard.sort((a, b) => b.score - a.score);
    _leaderboard = _leaderboard.slice(0, CONFIG.LEADERBOARD_MAX_ENTRIES);
    _saveLeaderboard();
    _renderLeaderboard();
  }

  /**
   * Render the leaderboard panel.
   */
  function _renderLeaderboard() {
    const container = document.getElementById("leaderboard-list");
    if (!container) return;
    container.innerHTML = "";

    if (_leaderboard.length === 0) {
      container.innerHTML = `<p class="empty-message">No scores yet. Be the first!</p>`;
      return;
    }

    const ol = document.createElement("ol");
    ol.className = "leaderboard-ol";

    _leaderboard.forEach((entry, i) => {
      const li = document.createElement("li");
      li.className = `lb-entry rank-${i + 1}`;

      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
      const date  = (() => {
        try { return new Date(entry.date).toLocaleDateString(); } catch(_) { return ""; }
      })();

      li.innerHTML = `
        <span class="lb-rank">${medal}</span>
        <span class="lb-avatar" aria-hidden="true">${entry.avatar}</span>
        <span class="lb-name">${_escape(entry.name)}</span>
        <span class="lb-score">${entry.score.toLocaleString()} pts</span>
        <span class="lb-meta">${entry.spins} spins · ${date}</span>
      `;
      ol.appendChild(li);
    });

    // Submit button (shows current session score)
    const submitArea = document.createElement("div");
    submitArea.className = "lb-submit-area";
    submitArea.innerHTML = `
      <hr class="lb-divider">
      <p class="lb-current">Your session: <strong>${_session.totalWon.toLocaleString()}</strong> pts</p>
      <div class="lb-submit-row">
        <input type="text" id="lb-name-input" class="lb-name-input"
               placeholder="Your name" maxlength="24" aria-label="Enter your name for the leaderboard">
        <button id="lb-submit-btn" class="lb-submit-btn">Submit Score</button>
      </div>
    `;
    container.appendChild(ol);
    container.appendChild(submitArea);

    // Attach submit handler
    const btn = document.getElementById("lb-submit-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        const name   = document.getElementById("lb-name-input")?.value.trim();
        const avatar = (typeof Avatar !== "undefined") ? Avatar.getCurrentEmoji() : "😀";
        submitScore(name, avatar);
        if (typeof Audio !== "undefined") Audio.playAchievement();
      });
    }
  }

  // Simple HTML-escape to prevent XSS from user-entered names
  function _escape(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  function getSession()     { return { ..._session }; }
  function getSessionMinutes() {
    return Math.floor((Date.now() - _session.startTime) / 60000);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    _loadLeaderboard();
    _renderLeaderboard();
    // Refresh time display every second
    setInterval(_updateStatBar, 1000);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return Object.freeze({ init, recordSpin, submitScore, getSession, getSessionMinutes });

})();
