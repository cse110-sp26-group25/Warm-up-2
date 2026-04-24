/**
 * state.js — Centralized, persistent application state (Iteration 21).
 *
 * Single source of truth for data that must survive a page refresh:
 *   • totalWinnings, spinCount, pityMeter, balance
 *   • unlockedAchievements, playerStats
 *   • jackpot, player (name, color), settings, meta
 *   • lastLoginDate, dailyStipend (Iteration 21)
 *
 * Iteration 21 — "The Loop" retention mechanic:
 *   • `meta.lastLoginDate` persists the ISO date of the most recent
 *     session start. On boot, if more than 24 hours have passed (strict
 *     day-boundary semantics — midnight-to-midnight local), a $50
 *     daily maintenance stipend is credited to `balance`.
 *   • `dailyStipend` is a transient read-once field populated at boot
 *     and consumed by ui.js to route the contextual "Stipend" greeting.
 *     It is NOT persisted; it lives only on the in-memory `_data`.
 *
 * Prior-iteration highlights preserved here:
 *   • `_checkStorageAvailable()` — detects private/incognito mode at boot.
 *   • `_migrate(saved)` — versioned migration pathway. Each schema bump
 *     adds a new conditional block here; older saves upgrade cleanly.
 *   • `settings.fastPlay` (added Iteration 09).
 *   • `balance` field (added Iteration 13).
 *   • Writes are no-ops (silently swallowed) when storage is unavailable.
 */
const State = (() => {

  /** @type {string} localStorage key (versioned for migrations). */
  const STORAGE_KEY = 'robo_slots_state_v1';

  /**
   * Current schema version. Bump when fields are added/removed.
   * Iteration 21 — bumped to 4 for `meta.lastLoginDate`.
   * @type {number}
   */
  const SCHEMA_VERSION = 4;

  /** @type {number} Debounce window for persistence writes (ms). */
  const SAVE_DEBOUNCE_MS = 400;

  /**
   * Iteration 21 — daily maintenance stipend.
   * Amount credited to `balance` once per 24-hour period.
   * @type {number}
   */
  const DAILY_STIPEND_AMOUNT = 50;

  /**
   * Millisecond window above which a returning session counts as a
   * new "day" for stipend purposes. Exactly 24 hours; intentionally
   * uses elapsed time rather than calendar-day boundaries so a player
   * who plays daily at 11 PM and 11 PM the next day gets the stipend
   * every time, instead of having to wait past midnight.
   * @type {number}
   */
  const DAILY_STIPEND_WINDOW_MS = 24 * 60 * 60 * 1000;

  // ── localStorage availability check ───────────────────────────────
  /**
   * Test whether localStorage is readable and writable.
   * Returns `false` in private/incognito mode (Safari, Firefox) where
   * storage throws on write.
   * @returns {boolean}
   */
  function _checkStorageAvailable() {
    const TEST_KEY = '__robo_slots_storage_test__';
    try {
      localStorage.setItem(TEST_KEY, '1');
      localStorage.removeItem(TEST_KEY);
      return true;
    } catch (_err) {
      return false;
    }
  }

  /** @type {boolean} True if localStorage is usable in this session. */
  const _storageAvailable = _checkStorageAvailable();

  // ── Default state factory ──────────────────────────────────────────
  /**
   * Return a fresh default-state object.
   * @description A function (not a frozen constant) so each call returns a
   *   brand-new writeable object — avoids shared-reference bugs.
   * @returns {Object} Fresh default state.
   */
  function _defaultState() {
    return {
      version: SCHEMA_VERSION,
      meta: {
        firstSeen:    Date.now(),
        lastSeen:     Date.now(),
        /**
         * Iteration 21 — ms epoch of the most recent session start.
         * Used by the daily-stipend logic to decide whether to credit
         * the $50 bonus. `null` for never-loaded installs; gets set on
         * every boot by the stipend gate below.
         */
        lastLoginDate: null,
        sessionCount: 0,
      },
      player: {
        name:  '',
        color: '#fff176',
      },
      balance:       200,
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
        fastPlay:      false,   // Iteration 09: Fast Play toggle
        theme:         'robot', // Iteration 18: theme selection
      },
      jackpot: 1000,
      /**
       * Iteration 21 — in-memory-only flag set at boot when a daily
       * stipend has been credited. Read once by ui.js to route the
       * contextual greeting, then cleared. Never persisted.
       * @type {number|null}
       */
      dailyStipend: null,
    };
  }

  // ── Versioned migration pathway ────────────────────────────────────
  /**
   * Upgrade a saved state object from an older schema version.
   * @description Called before merging onto defaults. Each version block is
   *   additive: missing fields will be back-filled by the subsequent
   *   `_merge(_defaultState(), migrated)` call, so only destructive or
   *   shape-changing migrations need explicit transforms here.
   * @param {Object} saved - Raw parsed state from localStorage (may be partial).
   * @returns {Object} The saved state, transformed to the current schema.
   */
  function _migrate(saved) {
    if (!saved || typeof saved !== 'object') return _defaultState();

    const v = Number(saved.version) || 0;

    // v0 → v1: initial schema; no persistent `settings` existed.
    if (v < 1) {
      saved.settings = saved.settings || {};
      saved.version  = 1;
    }

    // v1 → v2: added `settings.fastPlay`.
    if (v < 2) {
      if (!saved.settings) saved.settings = {};
      if (saved.settings.fastPlay === undefined) saved.settings.fastPlay = false;
      saved.version = 2;
    }

    // v2 → v3: added `balance` (starting credit system).
    if (v < 3) {
      if (saved.balance === undefined) saved.balance = 200;
      saved.version = 3;
    }

    // v3 → v4: added `meta.lastLoginDate` (Iteration 21 daily stipend).
    // Existing installs have no lastLoginDate — we seed it from the
    // persisted `meta.lastSeen` if present, or null if the record
    // predates that field too. A null value will cause the stipend
    // gate below to skip on this session (a player shouldn't get a
    // windfall just for upgrading), and set lastLoginDate to now.
    if (v < 4) {
      if (!saved.meta) saved.meta = {};
      if (saved.meta.lastLoginDate === undefined) {
        saved.meta.lastLoginDate = saved.meta.lastSeen || null;
      }
      saved.version = 4;
    }

    // Future migrations: add new `if (v < N)` blocks here.
    // Always set saved.version = N at the end of each block.

    return saved;
  }

  // ── Deep merge ─────────────────────────────────────────────────────
  /**
   * Deep-merge a saved partial state onto a fresh defaults object.
   * @description Preserves saved values while back-filling any fields added
   *   in later schema versions. Merges plain-object nodes recursively.
   * @param {Object} defaults - Shape to merge onto.
   * @param {Object} saved    - Persisted state (may be partial).
   * @returns {Object} Merged state.
   */
  function _merge(defaults, saved) {
    const out = { ...defaults };
    for (const key of Object.keys(saved || {})) {
      const sv = saved[key];
      const dv = defaults[key];
      if (
        sv !== null && typeof sv === 'object' && !Array.isArray(sv) &&
        dv !== null && typeof dv === 'object' && !Array.isArray(dv)
      ) {
        out[key] = _merge(dv, sv);
      } else if (sv !== undefined) {
        out[key] = sv;
      }
    }
    return out;
  }

  // ── Persistence I/O ────────────────────────────────────────────────
  /**
   * Read, migrate, and merge persisted state from localStorage.
   * @description Falls back gracefully on any parse or access error.
   * @returns {Object} The loaded (and defaults-merged) state object.
   */
  function _load() {
    if (!_storageAvailable) return _defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _defaultState();
      const parsed  = JSON.parse(raw);
      const migrated = _migrate(parsed);
      return _merge(_defaultState(), migrated);
    } catch (_err) {
      return _defaultState();
    }
  }

  /** @type {Object} In-memory working copy — the single source of truth. */
  let _data = _load();

  /** @type {number} Timestamp of the previous session's last save. */
  const _previousLastSeen = _data.meta.lastSeen;

  /** @type {boolean} True if persisted data existed when the module loaded. */
  const _wasReturning = _data.meta.sessionCount > 0;

  // ─────────────────────────────────────────────────────────────────
  // Iteration 21 — Daily maintenance stipend.
  // ─────────────────────────────────────────────────────────────────
  // Credit DAILY_STIPEND_AMOUNT to `balance` when the previous login
  // was more than DAILY_STIPEND_WINDOW_MS ago. `meta.lastLoginDate`
  // is checked (not `meta.lastSeen`), so the tab-visibility writes
  // that bump lastSeen every few seconds don't reset the stipend
  // timer. The stipend is gated on being a returning player; new
  // players start with the $200 default balance instead.
  //
  // The resulting bonus is written both to persistent state (balance)
  // and to an in-memory-only `dailyStipend` field that ui.js reads
  // once at boot to route the contextual greeting. The transient
  // field is NOT persisted — if it were, re-opening the app after a
  // refresh would show the greeting a second time.
  // ─────────────────────────────────────────────────────────────────
  const _lastLoginDate = _data.meta.lastLoginDate;
  const _now           = Date.now();
  if (_wasReturning
      && _lastLoginDate !== null
      && _lastLoginDate !== undefined
      && (_now - _lastLoginDate) >= DAILY_STIPEND_WINDOW_MS) {
    _data.balance      = (_data.balance || 0) + DAILY_STIPEND_AMOUNT;
    _data.dailyStipend = DAILY_STIPEND_AMOUNT;
  } else {
    _data.dailyStipend = null;
  }
  // Always update lastLoginDate — both when the stipend fires and
  // when it doesn't — so the 24-hour clock restarts from *this*
  // session regardless of outcome.
  _data.meta.lastLoginDate = _now;

  // Bump session counter and refresh lastSeen before any consumer reads.
  _data.meta.sessionCount += 1;
  _data.meta.lastSeen = _now;

  /** @type {number|null} Pending debounced-save timer handle. */
  let _saveTimer = null;

  /**
   * Write current state to localStorage immediately.
   * No-ops silently if storage is unavailable.
   * @returns {void}
   */
  function _saveNow() {
    if (!_storageAvailable) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch (_err) { /* quota exceeded or storage revoked — silently degrade */ }
  }

  /**
   * Schedule a debounced persistence write.
   * @description Collapses rapid-fire writes during a spin into a single save.
   * @returns {void}
   */
  function _queueSave() {
    if (_saveTimer !== null) return;
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      _saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  // Flush on tab hide / close.
  window.addEventListener('beforeunload', () => {
    if (_saveTimer !== null) { clearTimeout(_saveTimer); _saveTimer = null; }
    _data.meta.lastSeen = Date.now();
    _saveNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _saveNow();
  });

  // Persist the bumped session count right away.
  _queueSave();

  // ── Change-listener registry ───────────────────────────────────────
  /** @type {Array<(path:string, value:*) => void>} */
  const _listeners = [];

  /**
   * Fire all registered listeners.
   * @param {string} path  - Dotted state path.
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
   * @param {string} path - Dotted key path.
   * @returns {*} Resolved value, or undefined if absent.
   */
  function _getPath(obj, path) {
    if (!path) return obj;
    let cur = obj;
    for (const p of path.split('.')) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  /**
   * Write a dotted path on an object, creating intermediates as needed.
   * @param {Object} obj   - Root object.
   * @param {string} path  - Dotted key path.
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
     * Whether localStorage is usable in this browsing context.
     * False in private/incognito mode where storage is blocked.
     * @returns {boolean}
     */
    isStorageAvailable() { return _storageAvailable; },

    /**
     * Whether a persisted session existed when this module loaded.
     * @returns {boolean} True for a returning player.
     */
    isReturningPlayer() { return _wasReturning; },

    /**
     * Milliseconds elapsed since the previous session ended.
     * @returns {number} 0 for new players.
     */
    msSinceLastSession() {
      return _wasReturning ? Math.max(0, Date.now() - _previousLastSeen) : 0;
    },

    /**
     * Total number of sessions started (this session inclusive).
     * @returns {number} >= 1.
     */
    sessionCount() { return _data.meta.sessionCount; },

    /**
     * Iteration 21 — consume (read-and-clear) the daily stipend
     * amount granted at boot, or `null` if none was granted.
     *
     * This is a single-read accessor: once called, subsequent calls
     * return null for the same session, so the contextual greeting
     * can't be triggered twice by a UI re-render. The underlying
     * balance change has already been committed to persistent
     * state by the boot-time gate.
     *
     * @returns {number|null} Amount credited, or null.
     */
    consumeDailyStipend() {
      const v = _data.dailyStipend;
      _data.dailyStipend = null;
      return v;
    },

    /**
     * Read a value from state by dotted path.
     * @param {string} [path] - Dotted path; omit for the full snapshot.
     * @returns {*} A deep copy (safe to mutate by the caller).
     */
    get(path) {
      const v = _getPath(_data, path || '');
      return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    },

    /**
     * Write a value at a dotted path and queue a persistence write.
     * @param {string} path  - Dotted path.
     * @param {*}      value - Value to store.
     * @returns {void}
     */
    set(path, value) {
      _setPath(_data, path, value);
      _queueSave();
      _emit(path, value);
    },

    /**
     * Increment a numeric path by a delta (default 1).
     * @param {string} path    - Dotted path to a number.
     * @param {number} [delta] - Amount to add.
     * @returns {number} New value.
     */
    increment(path, delta = 1) {
      const cur  = _getPath(_data, path) || 0;
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
     * @param {(path:string, value:*) => void} fn - Listener.
     * @returns {void}
     */
    onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); },

    /**
     * Force an immediate persistence write (bypasses debounce).
     * @returns {void}
     */
    flush() {
      if (_saveTimer !== null) { clearTimeout(_saveTimer); _saveTimer = null; }
      _saveNow();
    },

    /**
     * Wipe all persisted data and reset to defaults.
     * A page reload is recommended after calling this.
     * @returns {void}
     */
    reset() {
      if (_storageAvailable) {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_err) {}
      }
      _data = _defaultState();
      _data.meta.sessionCount = 1;
      _saveNow();
      _emit('', _data);
    },

    /**
     * Return a full deep copy of the current state — useful for debugging.
     * @returns {Object} Snapshot.
     */
    snapshot() { return JSON.parse(JSON.stringify(_data)); },
  };
})();

Object.freeze(State);
