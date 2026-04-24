/**
 * achievements.js — Achievement definitions, tracking, and persistence.
 *
 * All counters and unlocked-id lists live on the central `State` module.
 * This module only owns the *definitions* (id, label, description, check
 * predicate) and the trivial logic for evaluating them after each event.
 *
 * A live-time timer accumulates `playerStats.timePlayed` once a second.
 */
const Achievements = (() => {

  /** @type {Object} Tunable constants. */
  const CONFIG = Object.freeze({
    /** Interval (ms) for the play-time accumulator. */
    TIME_TICK_MS: 1000,
    /** How many seconds the "hour" achievement needs. */
    HOUR_SECS:    3600,
  });

  /**
   * Canonical list of achievement definitions.
   * @type {ReadonlyArray<{id:string,label:string,desc:string,icon:string,check:(s:Object)=>boolean}>}
   */
  const DEFS = Object.freeze([
    { id: 'first_spin',    label: 'Boot Up',       desc: 'Complete your first spin',      icon: 'spin',    check: s => s.spins        >= 1 },
    { id: 'ten_spins',     label: 'Warm Circuits', desc: '10 spins played',               icon: 'bolt',    check: s => s.spins        >= 10 },
    { id: 'hundred_spins', label: 'Iron Thumb',    desc: '100 spins played',              icon: 'gear',    check: s => s.spins        >= 100 },
    { id: 'first_win',     label: 'First Credit',  desc: 'Win for the first time',        icon: 'star',    check: s => s.wins         >= 1 },
    { id: 'ten_wins',      label: 'Lucky Diode',   desc: '10 wins',                       icon: 'star',    check: s => s.wins         >= 10 },
    { id: 'jackpot',       label: 'JACKPOT!',      desc: 'Hit the jackpot',               icon: 'jackpot', check: s => s.jackpots     >= 1 },
    { id: 'big_win',       label: 'Big Output',    desc: 'Win $100 or more in one spin',  icon: 'coin',    check: s => s.bestWin      >= 100 },
    { id: 'hour',          label: 'Clock Cycles',  desc: 'Play for 60 minutes',           icon: 'clock',   check: s => s.timePlayed   >= CONFIG.HOUR_SECS },
    { id: 'pity',          label: 'Sympathy Chip', desc: 'Trigger the pity mechanic',     icon: 'heart',   check: s => s.pityTriggers >= 1 },
    { id: 'chat5',         label: 'Talkative Unit',desc: 'Send 5 chat messages',          icon: 'chat',    check: s => s.chatMessages >= 5 },
  ]);

  /**
   * Read the latest stats snapshot from the State module.
   * @returns {Object} Stats object (`playerStats` shape).
   */
  function _stats() { return State.get('playerStats') || {}; }

  /**
   * Read the unlocked-id list from the State module.
   * @returns {string[]} Array of unlocked achievement ids.
   */
  function _unlocked() { return State.get('unlockedAchievements') || []; }

  /**
   * Evaluate every achievement against current stats, persisting any new unlocks.
   * @returns {Array<{id:string,label:string,desc:string,icon:string}>} Newly unlocked definitions.
   */
  function _check() {
    const s = _stats();
    const already = new Set(_unlocked());
    const newly = [];
    for (const def of DEFS) {
      if (!already.has(def.id) && def.check(s)) {
        State.addUnique('unlockedAchievements', def.id);
        newly.push(def);
      }
    }
    return newly;
  }

  // Accumulate play-time once a second. Passive timer; survives by design.
  setInterval(() => {
    State.increment('playerStats.timePlayed', 1);
  }, CONFIG.TIME_TICK_MS);

  return {
    /**
     * Snapshot of the player's cumulative stats.
     * @returns {Object} Stats object.
     */
    get stats() { return _stats(); },

    /**
     * Canonical achievement definitions.
     * @returns {ReadonlyArray} Definitions.
     */
    getDefs() { return DEFS; },

    /**
     * Increment the spin counter and re-check achievements.
     * @returns {Array} Newly unlocked definitions (possibly empty).
     */
    recordSpin() {
      State.increment('playerStats.spins', 1);
      return _check();
    },

    /**
     * Increment the win counter + update `bestWin`, then re-check.
     * @param {number} amount - Dollar amount of the win.
     * @returns {Array} Newly unlocked definitions.
     */
    recordWin(amount) {
      State.increment('playerStats.wins', 1);
      const best = State.get('playerStats.bestWin') || 0;
      if (amount > best) State.set('playerStats.bestWin', amount);
      return _check();
    },

    /**
     * Increment the jackpot counter and re-check.
     * @returns {Array} Newly unlocked definitions.
     */
    recordJackpot() {
      State.increment('playerStats.jackpots', 1);
      return _check();
    },

    /**
     * Manually flag a pity trigger (game logic also does this on nudge).
     * @returns {Array} Newly unlocked definitions.
     */
    recordPity() {
      // Note: gameLogic already increments on nudge; this is a safe alias.
      return _check();
    },

    /**
     * Record a chat message sent by the player.
     * @returns {Array} Newly unlocked definitions.
     */
    recordChat() {
      State.increment('playerStats.chatMessages', 1);
      return _check();
    },

    /**
     * Whether an achievement is currently unlocked.
     * @param {string} id - Achievement id.
     * @returns {boolean}
     */
    isUnlocked(id) { return _unlocked().includes(id); },

    /**
     * Format a seconds value as e.g. "Xm" or "Xh Ym".
     * @param {number} secs - Seconds.
     * @returns {string}  Human-friendly duration.
     */
    formatTime(secs) {
      if (secs < CONFIG.HOUR_SECS) return Math.floor(secs / 60) + 'm';
      const h = Math.floor(secs / CONFIG.HOUR_SECS);
      const m = Math.floor((secs % CONFIG.HOUR_SECS) / 60);
      return h + 'h ' + m + 'm';
    },
  };
})();

Object.freeze(Achievements);
