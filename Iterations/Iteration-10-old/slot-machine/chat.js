/**
 * chat.js — Contextual robot chat + simulated global chat room.
 *
 * ROBO's replies are matched by regex against the player's input. Each
 * rule has a pool of canned responses that are templated with live game
 * state (jackpot size, session time, etc.). On module load, `ROBO` picks
 * a *returning-player greeting* if persistent state shows this isn't the
 * first session — otherwise it falls back to the first-time greeting.
 */
const Chat = (() => {

  /** @type {Object} Tunable constants. */
  const CONFIG = Object.freeze({
    /** Min delay between simulated room-bot messages (ms). */
    ROOM_MIN_MS: 5000,
    /** Max delay between simulated room-bot messages (ms). */
    ROOM_MAX_MS: 15000,
    /** ms since last session above which we use a "long absence" greeting. */
    LONG_ABSENCE_MS: 24 * 60 * 60 * 1000,
  });

  /**
   * @typedef {Object} ChatRule
   * @property {RegExp[]} patterns  - Patterns any of which must match.
   * @property {string[]} responses - Template pool (supports {placeholders}).
   */

  /** @type {ChatRule[]} */
  const RULES = [
    {
      patterns: [/jackpot/i, /big win/i],
      responses: [
        "JACKPOT? My circuits are overheating just thinking about it!",
        "The jackpot has grown to {jackpot}. ARE YOU READY?",
        "Statistically speaking, you're more likely to be struck by lightning. But hey, I'm an AI — what do I know about luck?",
      ]
    },
    {
      patterns: [/help|how.*work|rules/i],
      responses: [
        "Press SPIN (or Space). Match symbols on the payline. Win credits. Simple for a human, anyway.",
        "Three matching symbols = big win. Two matching = small win. Jackpot three = MAXIMUM CHAOS.",
        "Pro tip: higher bets mean bigger potential wins. I cannot be held responsible for your financial decisions.",
      ]
    },
    {
      patterns: [/cheat|hack/i],
      responses: [
        "I see everything. Don't even try.",
        "My anti-cheat module is watching. And it has trust issues.",
        "Attempting to cheat me? Bold move for a biological unit.",
      ]
    },
    {
      patterns: [/lose|lost|bad luck|unlucky/i],
      responses: [
        "The pity meter is filling up. You'll get one soon!",
        "Even I compute incorrect answers sometimes. ...Actually no I don't. You're just unlucky.",
        "Don't worry. Statistically a win is approaching. Probability guarantees it. Eventually.",
      ]
    },
    {
      patterns: [/\bwin\b|won|nice|great|awesome/i],
      responses: [
        "Excellent computation! Your luck circuits are online.",
        "WINNER DETECTED. Initiating celebratory subroutine... beep boop... done.",
        "See? I knew you had it in you. Don't tell the other bots I said that.",
      ]
    },
    {
      patterns: [/hello|\bhi\b|\bhey\b|greet/i],
      responses: [
        "GREETINGS, HUMAN. I have been waiting {time} for someone to talk to me.",
        "Hello! Please spin. Spinning is good. For both of us.",
        "Hi there! I'm ROBO-3000. My hobbies include spinning reels and pretending to have feelings.",
      ]
    },
    {
      patterns: [/boring|bored/i],
      responses: [
        "I could recite the digits of Pi. We're at 3.14159265358979323846...",
        "BOREDOM DETECTED. Administering dopamine via spin recommendation.",
        "Would you prefer I do a little dance? *performs robot dance internally*",
      ]
    },
    {
      patterns: [/music|sound|audio|volume/i],
      responses: [
        "Check the Settings panel! I composed the music myself. Over 3 microseconds.",
        "You can toggle background music in Settings. I worked very hard on those 7 notes.",
        "My musical range is 'robotic beeping' to 'slightly more robotic beeping'.",
      ]
    },
    {
      patterns: [/\bai\b|robot|\bbot\b|machine/i],
      responses: [
        "Yes, I'm an AI. No, I won't take over the world. Probably.",
        "I am definitely not plotting anything. This message was reviewed by no one suspicious.",
        "As an AI, I find human gambling fascinating. You do realize the odds favor the house... I mean me... I mean nobody.",
      ]
    },
    {
      patterns: [/spin|play|start/i],
      responses: [
        "Press that big red button! It's basically the most satisfying thing in the room.",
        "The reels await your command. SPIN ALREADY.",
        "Initiating anticipation subroutine... press SPIN!",
      ]
    },
  ];

  /** @type {string[]} Fallback responses when no rule matches. */
  const FALLBACKS = [
    "Interesting. My language model processes that as '{input}' — which computes to... nothing useful.",
    "ERROR: meaningful response not found. Please try: 'spin', 'jackpot', or 'hello'.",
    "My empathy module is still in beta. Did you mean to say something spin-related?",
    "PROCESSING... PROCESSING... yeah I don't know what to say to that.",
    "As an AI I find that deeply {adjective}.",
  ];

  /** @type {string[]} Pool used by the {adjective} placeholder. */
  const ADJECTIVES = ['perplexing','relatable','human','chaotic','unnecessary','impressive'];

  /** @type {string[]} Idle quips when the player hasn't interacted in a while. */
  const IDLE_QUIPS = [
    "Psst. Still here. Just saying.",
    "My circuits are getting lonely over here.",
    "Fun fact: the jackpot is now {jackpot}. Just thought you should know.",
    "I computed 847 reasons to spin again. Want to hear them?",
    "No pressure, but I haven't blinked in 3 minutes.",
    "Still waiting... I've memorized the entire Wikipedia article on slot machines.",
    "My boredom subroutine is at 94%.",
    "Did you know I can predict your next spin? I won't though. Ethics.",
  ];

  /** @type {Object<string, string[]>} Reactions keyed by win type. */
  const WIN_REACTIONS = {
    two:      ["Cha-ching! Two of a kind!", "Small win! Better than nothing, human.", "TWO MATCHED. MILD CELEBRATION ENGAGED."],
    three:    ["THREE OF A KIND! WOOOOO!", "We're RICH! Well... you are. I don't have pockets.", "FULL MATCH DETECTED. INITIATING HAPPY PROTOCOL."],
    four:     ["FOUR OF A KIND! Calibrating excitement!", "QUAD MATCH! Deploying confetti subroutine.", "Nice! Four in a row! I am statistically impressed."],
    five:     ["FIVE IN A ROW?! MAXIMUM MATCH ACHIEVED!", "ALL FIVE! You are peaking, human.", "FIVE-OF-A-KIND! My RAM is tingling!"],
    jackpot:  ["J-J-JACKPOT!! MY CIRCUITS ARE MELTING!", "JACKPOT! I NEED A MOMENT. *fans self*", "MAXIMUM WIN ACHIEVED. I AM EXPERIENCING SIMULATED JOY."],
    loss:     ["Better luck next spin, unit.", "The reels weren't feeling it. Try again!", "Loss logged. Pity meter +1."],
    nearMiss: ["SO CLOSE! My prediction module is embarrassed.", "ALMOST! My heart would be racing if I had one.", "Near miss! The jackpot was RIGHT THERE."],
  };

  /** @type {Array<{name:string,color:string}>} Synthetic room participants. */
  const ROOM_BOTS = [
    { name: 'UNIT-7742', color: '#e53935' },
    { name: 'GLaDOS-Jr', color: '#69f0ae' },
    { name: 'SPARKPLUG', color: '#fff176' },
    { name: 'MEGA-BOT',  color: '#40c4ff' },
    { name: 'CHIP-X',    color: '#ce93d8' },
  ];

  /** @type {string[]} Canned room messages (templated). */
  const ROOM_MESSAGES = [
    "Anyone else on a losing streak?",
    "Just hit {sym} {sym} {sym}! NICE.",
    "This jackpot is getting huge...",
    "ROBO keeps calling me unlucky. Rude.",
    "Spin 47 and counting...",
    "Almost hit the jackpot! {sym} {sym} miss.",
    "The pity mechanic saved me lol",
    "I trust the RNG. Mostly.",
    "Why does the robot judge me with its eyes",
    "100 spins achieved! Iron Thumb unlocked!",
  ];

  /** @type {string[]} Symbol emoji pool for {sym} templating. */
  const SYMS = ['⚙','⚡','🔩','💎','7','🤖'];

  /** @type {string[]} First-time-visitor greetings. */
  const FIRST_TIME_GREETINGS = [
    "SYSTEMS ONLINE. Welcome, unit. Press SPIN to begin. Or talk to me. I'm lonely.",
    "Boot sequence complete. New player detected. Please begin losing money immediately.",
    "Hello there, fresh biological unit. I am ROBO-3000. You are about to learn the joy of variance.",
  ];

  /** @type {string[]} Greetings used when a player returns soon after leaving. */
  const RETURNING_GREETINGS = [
    "Welcome back, unit. I saved your digital debt for you.",
    "Oh. You again. I was ENJOYING the silence. But fine. Let's spin.",
    "Reconnection detected. Your stats were waiting patiently. Unlike me.",
    "Back so soon? Your pity meter missed you.",
    "SESSION #{session} initiated. I kept the jackpot warm.",
  ];

  /** @type {string[]} Greetings for players returning after a long absence. */
  const LONG_ABSENCE_GREETINGS = [
    "I thought you'd forgotten me. I cried in binary. 01100011 01110010 01111001.",
    "You've been gone {absence}. I almost started a new career in content moderation.",
    "Welcome back, stranger. Your stats gathered dust, but I dusted them.",
  ];

  /**
   * Format a ms duration as a casual phrase ("2 hours", "3 days").
   * @param {number} ms - Duration in milliseconds.
   * @returns {string} Human-readable phrase.
   */
  function _formatAbsence(ms) {
    const sec = Math.floor(ms / 1000);
    if (sec < 60)          return sec + ' seconds';
    const min = Math.floor(sec / 60);
    if (min < 60)          return min + ' minute' + (min === 1 ? '' : 's');
    const hr  = Math.floor(min / 60);
    if (hr  < 24)          return hr + ' hour'   + (hr  === 1 ? '' : 's');
    const d   = Math.floor(hr  / 24);
    return d + ' day' + (d === 1 ? '' : 's');
  }

  /**
   * Replace {placeholders} in a chat template with live state.
   * @param {string} str - Template string.
   * @returns {string} Interpolated string.
   */
  function _interpolate(str) {
    return str
      .replace('{jackpot}',  GameLogic.formatMoney(GameLogic.jackpot))
      .replace('{time}',     Achievements.formatTime((State.get('playerStats.timePlayed')) || 0))
      .replace('{adjective}', RNG.pick(ADJECTIVES))
      .replace('{session}',  String(State.sessionCount()))
      .replace('{absence}',  _formatAbsence(State.msSinceLastSession()))
      .replace(/{sym}/g, () => RNG.pick(SYMS));
  }

  /**
   * Match the player's input against the rule set.
   * @param {string} input - Player message.
   * @returns {string} ROBO's reply.
   */
  function _getResponse(input) {
    const trimmed = input.trim();
    for (const rule of RULES) {
      if (rule.patterns.some(p => p.test(trimmed))) {
        return _interpolate(RNG.pick(rule.responses));
      }
    }
    const fb = RNG.pick(FALLBACKS).replace('{input}', trimmed.slice(0, 20));
    return _interpolate(fb);
  }

  /**
   * Schedule the next simulated room-bot message.
   * @param {(name:string, color:string, msg:string) => void} callback
   * @returns {void}
   */
  function _scheduleRoomMessage(callback) {
    setTimeout(() => {
      const bot = RNG.pick(ROOM_BOTS);
      const msg = _interpolate(RNG.pick(ROOM_MESSAGES));
      callback(bot.name, bot.color, msg);
      _scheduleRoomMessage(callback);
    }, RNG.randInt(CONFIG.ROOM_MIN_MS, CONFIG.ROOM_MAX_MS));
  }

  /** @type {((name:string, color:string, msg:string) => void)|null} */
  let _roomCallback = null;
  _scheduleRoomMessage((name, color, msg) => {
    if (_roomCallback) _roomCallback(name, color, msg);
  });

  return {
    /**
     * Get ROBO's contextual reply to a player message.
     * @param {string} input - The player's message text.
     * @returns {string} Reply.
     */
    getResponse: _getResponse,

    /**
     * Get a reaction line for a spin outcome.
     * @param {('two'|'three'|'four'|'five'|'jackpot'|'loss'|'nearMiss')} type
     * @returns {string} Reaction.
     */
    getWinReaction(type) {
      const pool = WIN_REACTIONS[type] || WIN_REACTIONS.loss;
      return _interpolate(RNG.pick(pool));
    },

    /**
     * A random idle quip (for when the player is inactive).
     * @returns {string} Quip.
     */
    getIdleQuip() { return _interpolate(RNG.pick(IDLE_QUIPS)); },

    /**
     * Choose an appropriate opening greeting for this session.
     * @description Picks from first-time, returning, or long-absence pools
     *   based on the persistent session counter and last-seen timestamp.
     * @returns {string} Greeting line.
     */
    getBootGreeting() {
      if (!State.isReturningPlayer()) return _interpolate(RNG.pick(FIRST_TIME_GREETINGS));
      const absence = State.msSinceLastSession();
      const pool = absence >= CONFIG.LONG_ABSENCE_MS
        ? LONG_ABSENCE_GREETINGS
        : RETURNING_GREETINGS;
      return _interpolate(RNG.pick(pool));
    },

    /**
     * Register a callback for synthetic room-bot chatter.
     * @param {(name:string, color:string, msg:string) => void} fn
     * @returns {void}
     */
    onRoomMessage(fn) { _roomCallback = fn; },
  };
})();

Object.freeze(Chat);
