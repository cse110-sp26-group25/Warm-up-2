/**
 * state.js — Centralized, persistent application state.
 *
 * Single source of truth for data that must survive a page refresh:
 *   • totalWinnings       (cumulative, monotonic)
 *   • spinCount           (session-agnostic lifetime spins)
 *   • pityMeter           (consecutive dry spins; pity triggers payout)
 *   • unlockedAchievements (array of achievement ids)
 *   • playerStats         (spins, wins, jackpots, bestWin, timePlayed, …)
 *   • jackpot             (snowball pot)
 *   • player              (name, color)
 *   • settings            (audio, accessibility)
 *   • meta                (firstSeen, lastSeen, sessionCount)
 *
 * Persistence uses `localStorage` under a single versioned key. Writes are
 * debounced so that rapid state changes during a spin do not thrash storage.
 * If the stored schema version is older than the current one, stored data
 * is deep-merged onto defaults so new fields back-fill cleanly.
 *
 * Consumers read via `State.get(path)` and write via `State.set(path,v)` or
 * use the dedicated helpers (`addWinnings`, `recordSpin`, etc.). A change-
 * listener registry (`State.onChange`) allows other modules to react.
 */
const State = (() => {

  /** @type {string} localStorage key (versioned for migrations) */
  const STORAGE_KEY = 'robo_slots_state_v1';

  /** @type {number} Current schema version */
  const SCHEMA_VERSION = 1;

  /** @type {number} Debounce window for persistence writes, in ms */
  const SAVE_DEBOUNCE_MS = 400;

  /**
   * Factory for the default state object.
   * @description A function (not a frozen constant) so every call returns a
   *   fresh, writeable copy — avoids accidental shared-reference bugs.
   * @returns {Object} A fresh default-state snapshot.
   */
  function _defaultState() {
    return {
      version: SCHEMA_VERSION,
      meta: {
        firstSeen: Date.now(),
        lastSeen:  Date.now(),
        sessionCount: 0,
      },
      player: {
        name:  '',
        color: '#fff176',
      },
      totalWinnings: 0,
      spinCount:     0,
      pityMeter:     0,
      unlockedAchievements: [],
      playerStats: {
        spins:        0,
        wins:         0,
        jackpots:     0,
        bestWin:      0,
        timePlayed:   0,
        pityTriggers: 0,
        chatMessages: 0,
      },
      settings: {
        sfxEnabled:    true,
        musicEnabled:  false,
        masterVolume:  70,
        musicVolume:   40,
        reducedMotion: false,
        epilepsySafe:  false,
      },
      jackpot: 1000,
    };
  }

  /**
   * Deep-merge a saved partial state onto a fresh defaults object.
   * @description Preserves saved values while back-filling any new fields
   *   added in later schema versions. Only merges plain-object leaves.
   * @param {Object} defaults - Shape to merge onto.
   * @param {Object} saved    - Previously persisted state (may be partial).
   * @returns {Object} A merged state object.
   */
  function _merge(defaults, saved) {
    const out = { ...defaults };
    for (const key of Object.keys(saved || {})) {
      const sv = saved[key];
      const dv = defaults[key];
      if (sv !== null && typeof sv === 'object' && !Array.isArray(sv)
          && dv !== null && typeof dv === 'object' && !Array.isArray(dv)) {
        out[key] = _merge(dv, sv);
      } else if (sv !== undefined) {
        out[key] = sv;
      }
    }
    return out;
  }

  /**
   * Read persisted state from localStorage.
   * @description Falls back to defaults on any parse or access error.
   * @returns {Object} The loaded (and defaults-merged) state object.
   */
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _defaultState();
      const parsed = JSON.parse(raw);
      return _merge(_defaultState(), parsed);
    } catch (_err) {
      return _defaultState();
    }
  }

  /** @type {Object} In-memory working copy (the single source of truth) */
  let _data = _load();

  /** @type {number} Timestamp of the *previous* session's last save */
  const _previousLastSeen = _data.meta.lastSeen;

  /** @type {boolean} Did persisted data exist when this module loaded? */
  const _wasReturning = _data.meta.sessionCount > 0;

  // Bump session counter & refresh lastSeen — treat every module load as a
  // new session. This is done before any consumer can read.
  _data.meta.sessionCount += 1;
  _data.meta.lastSeen = Date.now();

  /** @type {number|null} Pending debounced-save timer handle */
  let _saveTimer = null;

  /**
   * Write current state to localStorage immediately.
   * @returns {void}
   */
  function _saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch (_err) { /* quota full / privacy mode — silently degrade */ }
  }

  /**
   * Schedule a debounced persistence write.
   * @description Collapses rapid-fire writes (e.g. during a spin) into one.
   * @returns {void}
   */
  function _queueSave() {
    if (_saveTimer !== null) return;
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      _saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  // Flush any pending save when the tab hides / closes.
  window.addEventListener('beforeunload', () => {
    if (_saveTimer !== null) { clearTimeout(_saveTimer); _saveTimer = null; }
    _data.meta.lastSeen = Date.now();
    _saveNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _saveNow();
  });

  // Persist the bumped session count up front.
  _queueSave();

  // ── Change-listener registry ────────────────────────────────────────
  /** @type {Array<(path:string, value:*) => void>} */
  const _listeners = [];

  /**
   * Fire all registered listeners.
   * @param {string} path  - Dotted state path (e.g. 'playerStats.spins').
   * @param {*}      value - New value at that path.
   * @returns {void}
   */
  function _emit(path, value) {
    for (const fn of _listeners) {
      try { fn(path, value); } catch (_err) { /* listener isolation */ }
    }
  }

  // ── Path utilities ─────────────────────────────────────────────────
  /**
   * Read a dotted path from an object.
   * @param {Object} obj  - Root object.
   * @param {string} path - Dotted path (e.g. 'playerStats.spins').
   * @returns {*} The resolved value, or undefined if missing.
   */
  function _getPath(obj, path) {
    if (!path) return obj;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  /**
   * Write a dotted path on an object (creates intermediates as needed).
   * @param {Object} obj   - Root object.
   * @param {string} path  - Dotted path.
   * @param {*}      value - Value to write.
   * @returns {void}
   */
  function _setPath(obj, path, value) {
    const parts = path.split('.');
    const last  = parts.pop();
    let cur = obj;
    for (const p of parts) {
      if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
      cur = cur[p];
    }
    cur[last] = value;
  }

  // ── Public API ─────────────────────────────────────────────────────
  return {

    /**
     * Whether a persisted session was found when this module loaded.
     * @returns {boolean} True for a returning player, false for a fresh slate.
     */
    isReturningPlayer() { return _wasReturning; },

    /**
     * Milliseconds elapsed since the player's previous session ended.
     * @returns {number} 0 for new players; otherwise ms since last save.
     */
    msSinceLastSession() {
      return _wasReturning ? Math.max(0, Date.now() - _previousLastSeen) : 0;
    },

    /**
     * Total number of sessions the player has started (this one inclusive).
     * @returns {number} Session count (>= 1).
     */
    sessionCount() { return _data.meta.sessionCount; },

    /**
     * Read a value from state by dotted path.
     * @param {string} [path] - Dotted path; omit for a full deep copy.
     * @returns {*} A deep copy of the value (safe to mutate by caller).
     */
    get(path) {
      const v = _getPath(_data, path || '');
      // Deep copy so callers cannot mutate our internal state.
      return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    },

    /**
     * Write a value at a dotted path and persist.
     * @param {string} path  - Dotted path (e.g. 'player.name').
     * @param {*}      value - Value to store.
     * @returns {void}
     */
    set(path, value) {
      _setPath(_data, path, value);
      _queueSave();
      _emit(path, value);
    },

    /**
     * Increment a numeric path by a delta.
     * @param {string} path    - Dotted path to a number.
     * @param {number} [delta] - Amount to add (defaults to 1).
     * @returns {number} The new value.
     */
    increment(path, delta = 1) {
      const cur = _getPath(_data, path) || 0;
      const next = cur + delta;
      _setPath(_data, path, next);
      _queueSave();
      _emit(path, next);
      return next;
    },

    /**
     * Append a value to an array path (no-op if already present).
     * @param {string} path  - Dotted path to an array.
     * @param {*}      value - Value to push.
     * @returns {boolean} True if appended, false if already present.
     */
    addUnique(path, value) {
      const arr = _getPath(_data, path);
      if (!Array.isArray(arr)) { _setPath(_data, path, [value]); _queueSave(); return true; }
      if (arr.includes(value)) return false;
      arr.push(value);
      _queueSave();
      _emit(path, arr.slice());
      return true;
    },

    /**
     * Subscribe to state changes.
     * @param {(path:string, value:*) => void} fn - Listener callback.
     * @returns {void}
     */
    onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); },

    /**
     * Force an immediate persistence write.
     * @returns {void}
     */
    flush() {
      if (_saveTimer !== null) { clearTimeout(_saveTimer); _saveTimer = null; }
      _saveNow();
    },

    /**
     * Wipe all persisted data and reset to defaults. Page reload recommended.
     * @returns {void}
     */
    reset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_err) {}
      _data = _defaultState();
      _data.meta.sessionCount = 1;
      _saveNow();
      _emit('', _data);
    },

    /**
     * Deep copy of the entire state — useful for debugging and exports.
     * @returns {Object} Snapshot.
     */
    snapshot() { return JSON.parse(JSON.stringify(_data)); },
  };
})();

Object.freeze(State);
