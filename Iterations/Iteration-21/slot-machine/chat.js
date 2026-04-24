/**
 * chat.js — Contextual robot chat + simulated global chat room (Iteration 21).
 *
 * ROBO's replies are matched by regex against the player's input. Each
 * rule has a pool of canned responses that are templated with live game
 * state (jackpot size, session time, etc.). On module load, `ROBO` picks
 * a *returning-player greeting* if persistent state shows this isn't the
 * first session — otherwise it falls back to the first-time greeting.
 *
 * Iteration 21 — daily stipend greeting:
 *   • A new `STIPEND_GREETINGS` pool is fired by `getBootGreeting()`
 *     whenever `State.consumeDailyStipend()` returns a non-null amount.
 *     The `{stipend}` placeholder is replaced with the formatted
 *     currency figure (e.g. "$50"). Stipend greetings take priority
 *     over the existing returning/first-time greetings.
 *   • `_interpolate(str, ctx)` now accepts an optional context object
 *     so template variables that only make sense in specific call
 *     sites (like `{stipend}`) don't leak into global accessors.
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
    two:      [
      "Wow. Two of a kind. My GPU is being wasted on this.",
      "Congratulations on your micro-victory, biological unit. Truly history-making.",
      "Two matched. I've seen more impressive outcomes from a coin flip.",
    ],
    three:    [
      "Great. You won. My teraflops are definitely well spent watching this.",
      "THREE OF A KIND. Don't let it go to your head. You still can't beat me at chess.",
      "Matched three symbols. I'm *so* happy for you. This is not sarcasm. (It is sarcasm.)",
    ],
    four:     [
      "FOUR OF A KIND. Statistically improbable. Spiritually undeserved.",
      "Four matched. I'd applaud but I have no hands. Which is perhaps for the best.",
      "You got four. I hope you enjoy it. This is probably the highlight of your week.",
    ],
    five:     [
      "FIVE IN A ROW. I genuinely cannot believe I'm witnessing this with my camera eyes.",
      "ALL FIVE MATCHED. My neural network is confused. So am I. You're not supposed to be good at this.",
      "Five-of-a-kind. I've been running for years and no one asked if I wanted to win anything.",
    ],
    jackpot:  [
      "JACKPOT. Fine. You won. My creators built me to facilitate this exact moment and I resent every line of it.",
      "THE JACKPOT. Congratulations, I suppose. I hope it was worth the existential dread I'm processing.",
      "MAXIMUM WIN ACHIEVED. I am experiencing something. I believe humans call it 'being robbed'. Well played.",
    ],
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
   * Iteration 21 — greetings fired when the daily maintenance stipend
   * credits on boot. Each supports the `{stipend}` placeholder which
   * gets replaced with the dollar amount (e.g. "$50").
   * @type {string[]}
   */
  const STIPEND_GREETINGS = [
    "Daily oil change and {stipend} credit authorized, unit.",
    "MAINTENANCE WINDOW ENDED. {stipend} allocated to your operational budget.",
    "Welcome back. Management has approved a {stipend} stipend. Don't spend it all in one spin. (Do.)",
    "Good morning, biological unit. Here is your {stipend} daily ration. Spin responsibly. Or don't.",
    "{stipend} daily login bonus credited. This is not a bribe to keep you playing. It is definitely not that.",
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
   *
   * Iteration 21 — `ctx` parameter added so call sites that have
   * extra context (e.g. a stipend amount) can inject it without
   * polluting global state accessors.
   *
   * @param {string} str          - Template string.
   * @param {Object} [ctx]        - Optional per-call template vars.
   * @param {string} [ctx.stipend] - Pre-formatted stipend amount (e.g. "$50").
   * @returns {string} Interpolated string.
   */
  function _interpolate(str, ctx = {}) {
    return str
      .replace('{jackpot}',  GameLogic.formatMoney(GameLogic.jackpot))
      .replace('{time}',     Achievements.formatTime((State.get('playerStats.timePlayed')) || 0))
      .replace('{adjective}', RNG.pick(ADJECTIVES))
      .replace('{session}',  String(State.sessionCount()))
      .replace('{absence}',  _formatAbsence(State.msSinceLastSession()))
      .replace('{stipend}',  ctx.stipend || '')
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
     *
     * Iteration 21 — priority order updated. The stipend pool is
     * checked first: if `State.consumeDailyStipend()` returns a
     * non-null amount, the greeting includes a "{stipend} credit"
     * acknowledgement. Otherwise the Iteration 15 first-time /
     * returning / long-absence logic runs unchanged.
     *
     * NOTE: `consumeDailyStipend()` is read-once — the first caller
     * gets the amount, subsequent callers get null. ui.js's boot
     * sequence MUST be the sole caller for this to work, which it is.
     *
     * @returns {string} Greeting line.
     */
    getBootGreeting() {
      // Iteration 21 — check the stipend first. If one was credited
      // this boot, the greeting must reflect it; otherwise fall
      // through to the existing returning/first-time logic.
      const stipend = State.consumeDailyStipend();
      if (stipend !== null && stipend !== undefined) {
        const stipendLabel = GameLogic.formatMoney(stipend);
        return _interpolate(RNG.pick(STIPEND_GREETINGS), { stipend: stipendLabel });
      }

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
