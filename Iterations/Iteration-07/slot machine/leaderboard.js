/**
 * leaderboard.js — Simulated global leaderboard with periodic "live" updates.
 * Entries are seeded bots that grow naturally to feel active.
 */
const Leaderboard = (() => {

  const BOT_NAMES = [
    'UNIT-7742','SERVO-99','GLaDOS-Jr','MEGA-BOT','RUST-BUCKET',
    'SPARKPLUG','CLANK-3','OVERLORD','CHIP-X','BOLT-MASTER',
    'ROBO-KING','CIRCUIT-8','IRON-WILL','NANO-BOT','VOLT-9000',
    'SPARK-3K','DEEPFAKE-5','HAL-NEIN','R2-DEEZ','BEEP-BOOP',
  ];

  const COLORS = [
    '#e53935','#69f0ae','#fff176','#40c4ff','#ce93d8',
    '#ff8a65','#80cbc4','#f06292','#aed581','#ffb74d',
  ];

  // Seed entries: {name, color, amount, rank}
  let _entries = BOT_NAMES.map((name, i) => ({
    id: 'bot_' + i,
    name,
    color: COLORS[i % COLORS.length],
    amount: Math.floor(RNG.randInt(500, 15000)),
    isBot: true,
  }));

  // Sort descending
  function _sort() {
    _entries.sort((a, b) => b.amount - a.amount);
  }
  _sort();

  // Player's entry (added when they first win)
  let _playerEntry = null;

  // Simulate bots winning periodically
  function _simulateBotActivity() {
    const idx = RNG.randInt(0, _entries.length - 1);
    const entry = _entries[idx];
    if (entry.isBot) {
      entry.amount += RNG.randInt(10, 500);
    }
    _sort();
    _notifyListeners('update', _entries[idx]);
  }

  // Random interval between 3–9 seconds
  function _scheduleNext() {
    setTimeout(() => {
      _simulateBotActivity();
      _scheduleNext();
    }, RNG.randInt(3000, 9000));
  }
  _scheduleNext();

  const _listeners = [];

  function _notifyListeners(event, data) {
    for (const fn of _listeners) fn(event, data);
  }

  return {
    /** Returns top N entries */
    getTop(n = 10) {
      return _entries.slice(0, n);
    },

    /** Get all entries */
    getAll() {
      return [..._entries];
    },

    /** Record a player win and upsert their entry */
    recordPlayerWin(name, color, winAmount) {
      if (!_playerEntry) {
        _playerEntry = { id: 'player', name: name || 'YOU', color: color || '#fff176', amount: 0, isBot: false };
        _entries.push(_playerEntry);
      }
      _playerEntry.name   = name  || _playerEntry.name;
      _playerEntry.color  = color || _playerEntry.color;
      _playerEntry.amount += winAmount;
      _sort();
      _notifyListeners('player_win', _playerEntry);
    },

    /** Player rank (1-indexed) */
    getPlayerRank() {
      if (!_playerEntry) return null;
      return _entries.findIndex(e => e.id === 'player') + 1;
    },

    /** Subscribe to leaderboard events */
    onChange(fn) { _listeners.push(fn); },

    formatAmount(n) {
      return '$' + n.toLocaleString('en-US');
    }
  };
})();

Object.freeze(Leaderboard);
