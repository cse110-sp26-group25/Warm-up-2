/**
 * leaderboard.js — Persistent leaderboard backed by localStorage.
 *
 * Score integrity rules:
 *  - Each player name maps to at most ONE entry per session.
 *  - Clicking "Save Score" a second time overwrites the prior entry (no stacking).
 *  - The button is disabled immediately after saving and re-enabled only
 *    after the next spin (so the saved value is always the final session value).
 */

'use strict';

const Leaderboard = (() => {
  const STORAGE_KEY = 'luckyReels_leaderboard_v2';
  const MAX_ENTRIES = 10;

  let _scoreSavedThisSession = false;

  /* ---- Persistence --------------------------------------- */

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function _save(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // localStorage unavailable — silently degrade
    }
  }

  /* ---- Score management ---------------------------------- */

  /**
   * Upsert a score entry for the given player name.
   * If an entry for this name already exists, overwrite it (no duplicates).
   * Keeps the top MAX_ENTRIES scores, sorted descending.
   */
  function saveScore(name, score) {
    if (!name || !name.trim()) return false;

    const entries = _load();
    const cleanName = name.trim().slice(0, 20);

    // Remove any existing entry for this name
    const idx = entries.findIndex(e => e.name.toLowerCase() === cleanName.toLowerCase());
    if (idx !== -1) entries.splice(idx, 1);

    entries.push({
      name:  cleanName,
      score,
      date:  new Date().toLocaleDateString(),
    });

    // Sort descending, keep top N
    entries.sort((a, b) => b.score - a.score);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;

    _save(entries);
    _scoreSavedThisSession = true;
    return true;
  }

  function clearAll() {
    _save([]);
    _scoreSavedThisSession = false;
  }

  /* ---- Rendering ----------------------------------------- */

  function render() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    const entries = _load();
    list.innerHTML = '';

    if (entries.length === 0) {
      const li = document.createElement('li');
      li.style.color = 'var(--color-text-muted)';
      li.style.fontSize = '0.8rem';
      li.textContent = 'No scores yet — be the first!';
      list.appendChild(li);
      return;
    }

    entries.forEach((entry, i) => {
      const li    = document.createElement('li');
      const rank  = document.createElement('span');
      const name  = document.createElement('span');
      const score = document.createElement('span');

      rank.className  = 'lb-rank';
      name.className  = 'lb-name';
      score.className = 'lb-score';

      rank.textContent  = `${i + 1}.`;
      name.textContent  = entry.name;
      score.textContent = entry.score.toLocaleString();

      li.appendChild(rank);
      li.appendChild(name);
      li.appendChild(score);

      list.appendChild(li);
    });
  }

  /* ---- Save button state --------------------------------- */

  function _setSaveButtonState(enabled) {
    const btn = document.getElementById('save-score-btn');
    if (!btn) return;
    btn.disabled = !enabled;
    btn.title = enabled ? '' : 'Score already saved — play a spin to unlock.';
  }

  /** Call after each spin so the button re-enables. */
  function onSpinComplete() {
    if (_scoreSavedThisSession) {
      _scoreSavedThisSession = false;
    }
    _setSaveButtonState(true);
  }

  /* ---- Public API ---------------------------------------- */

  function init() {
    render();

    const saveBtn  = document.getElementById('save-score-btn');
    const clearBtn = document.getElementById('clear-lb-btn');

    saveBtn.addEventListener('click', () => {
      const name  = document.getElementById('player-name-input').value.trim() || 'Anonymous';
      const score = GameState.credits;

      if (saveScore(name, score)) {
        render();
        _setSaveButtonState(false);
        UI.addLog(`Score saved: ${name} — ${score.toLocaleString()} credits.`, 'info');
        UI.announce(`Score saved: ${score} credits for ${name}`);
      }
    });

    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all leaderboard entries?')) {
        clearAll();
        render();
        UI.addLog('Leaderboard cleared.', 'info');
      }
    });
  }

  return { init, onSpinComplete, render };
})();
