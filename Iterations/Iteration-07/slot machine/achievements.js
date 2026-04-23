/**
 * achievements.js — Achievement definitions, tracking, and persistence.
 * Stats are saved to localStorage.
 */
const Achievements = (() => {

  const DEFS = [
    { id: 'first_spin',   label: 'Boot Up',       desc: 'Complete your first spin',      icon: 'spin',    check: s => s.spins >= 1 },
    { id: 'ten_spins',    label: 'Warm Circuits',  desc: '10 spins played',               icon: 'bolt',    check: s => s.spins >= 10 },
    { id: 'hundred_spins',label: 'Iron Thumb',     desc: '100 spins played',              icon: 'gear',    check: s => s.spins >= 100 },
    { id: 'first_win',    label: 'First Credit',   desc: 'Win for the first time',        icon: 'star',    check: s => s.wins >= 1 },
    { id: 'ten_wins',     label: 'Lucky Diode',    desc: '10 wins',                       icon: 'star',    check: s => s.wins >= 10 },
    { id: 'jackpot',      label: 'JACKPOT!',       desc: 'Hit the jackpot',               icon: 'jackpot', check: s => s.jackpots >= 1 },
    { id: 'big_win',      label: 'Big Output',     desc: 'Win $100 or more in one spin',  icon: 'coin',    check: s => s.bestWin >= 100 },
    { id: 'hour',         label: 'Clock Cycles',   desc: 'Play for 60 minutes',           icon: 'clock',   check: s => s.timePlayed >= 3600 },
    { id: 'pity',         label: 'Sympathy Chip',  desc: 'Trigger the pity mechanic',     icon: 'heart',   check: s => s.pityTriggers >= 1 },
    { id: 'chat5',        label: 'Talkative Unit', desc: 'Send 5 chat messages',          icon: 'chat',    check: s => s.chatMessages >= 5 },
  ];

  const DEFAULT_STATS = {
    spins: 0, wins: 0, jackpots: 0, bestWin: 0,
    timePlayed: 0, pityTriggers: 0, chatMessages: 0,
    unlocked: [],
    sessionStart: Date.now(),
  };

  let _stats = _load();
  _stats.sessionStart = Date.now();

  function _load() {
    try {
      const raw = localStorage.getItem('robo_stats');
      if (raw) return { ...DEFAULT_STATS, ...JSON.parse(raw) };
    } catch (_) {}
    return { ...DEFAULT_STATS };
  }

  function _save() {
    try {
      localStorage.setItem('robo_stats', JSON.stringify(_stats));
    } catch (_) {}
  }

  // Check all achievements and return newly unlocked ones
  function _check() {
    const newlyUnlocked = [];
    for (const def of DEFS) {
      if (!_stats.unlocked.includes(def.id) && def.check(_stats)) {
        _stats.unlocked.push(def.id);
        newlyUnlocked.push(def);
      }
    }
    if (newlyUnlocked.length) _save();
    return newlyUnlocked;
  }

  // Timer to accumulate played time
  setInterval(() => {
    _stats.timePlayed++;
    _save();
  }, 1000);

  return {
    get stats() { return { ..._stats }; },
    getDefs() { return DEFS; },

    recordSpin()       { _stats.spins++;          return _check(); },
    recordWin(amount)  {
      _stats.wins++;
      if (amount > _stats.bestWin) _stats.bestWin = amount;
      return _check();
    },
    recordJackpot()    { _stats.jackpots++;        return _check(); },
    recordPity()       { _stats.pityTriggers++;    return _check(); },
    recordChat()       { _stats.chatMessages++;    return _check(); },

    isUnlocked(id)     { return _stats.unlocked.includes(id); },

    /** Format timePlayed (seconds) as Xm or Xh Ym */
    formatTime(secs) {
      if (secs < 3600) return Math.floor(secs / 60) + 'm';
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      return h + 'h ' + m + 'm';
    }
  };
})();

Object.freeze(Achievements);
