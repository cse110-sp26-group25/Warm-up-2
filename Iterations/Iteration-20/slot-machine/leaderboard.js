/**
 * leaderboard.js — Simulated global leaderboard with periodic "live" updates.
 *
 * The bot entries are seeded once per page load and drift upward to create
 * a feeling of activity. The player's entry is upserted from persistent
 * `State` (so their rank survives page refreshes) and grows whenever
 * `recordPlayerWin` is called.
 */
const Leaderboard = (() => {

  /** @type {Object} Tunable constants. */
  const CONFIG = Object.freeze({
    /** Minimum seed amount for a freshly-minted bot. */
    BOT_SEED_MIN:    500,
    /** Maximum seed amount for a freshly-minted bot. */
    BOT_SEED_MAX:    15000,
    /** Min amount a bot gains in one simulated win. */
    BOT_GAIN_MIN:    10,
    /** Max amount a bot gains in one simulated win. */
    BOT_GAIN_MAX:    500,
    /** Min interval between simulated bot wins (ms). */
    TICK_MIN_MS:     3000,
    /** Max interval between simulated bot wins (ms). */
    TICK_MAX_MS:     9000,
    /** Score ceiling for bot entries — stops growing at this amount. */
    BOT_MAX_SCORE:   50000,
  });

  /** @type {string[]} Rotation of humorous bot names. */
  const BOT_NAMES = Object.freeze([
    'UNIT-7742','SERVO-99','GLaDOS-Jr','MEGA-BOT','RUST-BUCKET',
    'SPARKPLUG','CLANK-3','OVERLORD','CHIP-X','BOLT-MASTER',
    'ROBO-KING','CIRCUIT-8','IRON-WILL','NANO-BOT','VOLT-9000',
    'SPARK-3K','DEEPFAKE-5','HAL-NEIN','R2-DEEZ','BEEP-BOOP',
  ]);

  /** @type {string[]} Avatar colours parallel to names (cycled). */
  const COLORS = Object.freeze([
    '#e53935','#69f0ae','#fff176','#40c4ff','#ce93d8',
    '#ff8a65','#80cbc4','#f06292','#aed581','#ffb74d',
  ]);

  /**
   * @typedef {Object} LbEntry
   * @property {string}  id      - Stable identifier ('bot_X' or 'player').
   * @property {string}  name    - Display name.
   * @property {string}  color   - Avatar hex colour.
   * @property {number}  amount  - Cumulative winnings.
   * @property {boolean} isBot   - True for synthetic entries.
   */

  /** @type {LbEntry[]} All leaderboard entries. */
  let _entries = BOT_NAMES.map((name, i) => ({
    id:     'bot_' + i,
    name,
    color:  COLORS[i % COLORS.length],
    amount: Math.floor(RNG.randInt(CONFIG.BOT_SEED_MIN, CONFIG.BOT_SEED_MAX)),
    isBot:  true,
  }));

  /** @type {LbEntry|null} The player's entry (created on first win). */
  let _playerEntry = null;

  // Rehydrate player from State if they have previous winnings.
  (function _rehydrate() {
    const persistedName   = State.get('player.name');
    const persistedColor  = State.get('player.color');
    const persistedTotal  = State.get('totalWinnings') || 0;
    if (persistedTotal > 0) {
      _playerEntry = {
        id:    'player',
        name:  persistedName  || 'YOU',
        color: persistedColor || '#fff176',
        amount: persistedTotal,
        isBot: false,
      };
      _entries.push(_playerEntry);
    }
  })();

  /** Sort entries descending by amount. @returns {void} */
  function _sort() { _entries.sort((a, b) => b.amount - a.amount); }
  _sort();

  /** @type {Array<(event:string, data:LbEntry) => void>} */
  const _listeners = [];

  /**
   * Broadcast an event to all subscribers.
   * @param {string}  event - Event name.
   * @param {LbEntry} data  - Entry payload.
   * @returns {void}
   */
  function _notify(event, data) {
    for (const fn of _listeners) { try { fn(event, data); } catch (_e) {} }
  }

  /**
   * Bump a random bot's amount — simulates global activity.
   * @returns {void}
   */
  function _simulateBotActivity() {
    const idx = RNG.randInt(0, _entries.length - 1);
    const entry = _entries[idx];
    if (entry.isBot && entry.amount < CONFIG.BOT_MAX_SCORE) {
      entry.amount = Math.min(
        entry.amount + RNG.randInt(CONFIG.BOT_GAIN_MIN, CONFIG.BOT_GAIN_MAX),
        CONFIG.BOT_MAX_SCORE
      );
    }
    _sort();
    _notify('update', _entries[idx]);
  }

  /**
   * Schedule the next simulated bot tick.
   * @returns {void}
   */
  function _scheduleNext() {
    setTimeout(() => {
      _simulateBotActivity();
      _scheduleNext();
    }, RNG.randInt(CONFIG.TICK_MIN_MS, CONFIG.TICK_MAX_MS));
  }
  _scheduleNext();

  return {

    /**
     * Top-N entries sorted high-to-low.
     * @param {number} [n] - How many to return (default 10).
     * @returns {LbEntry[]} Entries.
     */
    getTop(n = 10) { return _entries.slice(0, n); },

    /**
     * All entries sorted high-to-low.
     * @returns {LbEntry[]} Entries.
     */
    getAll() { return _entries.slice(); },

    /**
     * Record a player win and upsert their leaderboard entry.
     * @description Persists the updated amount (it lives in `State.totalWinnings`).
     * @param {string} name      - Current player name.
     * @param {string} color     - Current avatar colour (hex).
     * @param {number} winAmount - Dollar amount of this win.
     * @returns {void}
     */
    recordPlayerWin(name, color, winAmount) {
      if (!_playerEntry) {
        _playerEntry = {
          id:     'player',
          name:   name  || 'YOU',
          color:  color || '#fff176',
          amount: 0,
          isBot:  false,
        };
        _entries.push(_playerEntry);
      }
      _playerEntry.name  = name  || _playerEntry.name;
      _playerEntry.color = color || _playerEntry.color;
      _playerEntry.amount += winAmount;
      _sort();
      _notify('player_win', _playerEntry);
    },

    /**
     * 1-indexed rank of the player, or null if they haven't won yet.
     * @returns {number|null}
     */
    getPlayerRank() {
      if (!_playerEntry) return null;
      return _entries.findIndex(e => e.id === 'player') + 1;
    },

    /**
     * Subscribe to leaderboard events.
     * @param {(event:string, data:LbEntry) => void} fn - Listener.
     * @returns {void}
     */
    onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); },

    /**
     * Format a dollar amount without cents.
     * @param {number} n - Amount.
     * @returns {string} e.g. `$1,234`.
     */
    formatAmount(n) { return '$' + Math.floor(n).toLocaleString('en-US'); },
  };
})();

Object.freeze(Leaderboard);
