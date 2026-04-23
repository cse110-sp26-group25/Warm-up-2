/**
 * chat.js — Contextual robot chat responses + global chat room simulation.
 * ROBO responds based on game state keywords and player messages.
 */
const Chat = (() => {

  // ── Contextual response rules ─────────────────────────────────────────
  // Each rule: { patterns: [regex], responses: [string], context: fn }
  // Context fn receives game state snapshot; omit to always match.
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
      patterns: [/cheating|cheat|hack/i],
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
      ],
      context: () => true
    },
    {
      patterns: [/win|won|yes|nice|great|awesome/i],
      responses: [
        "Excellent computation! Your luck circuits are online.",
        "WINNER DETECTED. Initiating celebratory subroutine... beep boop... done.",
        "See? I knew you had it in you. Don't tell the other bots I said that.",
      ]
    },
    {
      patterns: [/hello|hi|hey|greet/i],
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
      patterns: [/ai|robot|bot|machine/i],
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

  // Fallback responses
  const FALLBACKS = [
    "Interesting. My language model processes that as '{input}' — which computes to... nothing useful.",
    "ERROR: meaningful response not found. Please try: 'spin', 'jackpot', or 'hello'.",
    "My empathy module is still in beta. Did you mean to say something spin-related?",
    "PROCESSING... PROCESSING... yeah I don't know what to say to that.",
    "As an AI I find that deeply {adjective}.",
  ];

  const ADJECTIVES = ['perplexing','relatable','human','chaotic','unnecessary','impressive'];

  // Idle robot sayings (triggered when player is inactive)
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

  // Win reaction sayings
  const WIN_REACTIONS = {
    two:     ["Cha-ching! Two of a kind!", "Small win! Better than nothing, human.", "TWO MATCHED. MILD CELEBRATION ENGAGED."],
    three:   ["THREE OF A KIND! WOOOOO!", "We're RICH! Well... you are. I don't have pockets.", "FULL MATCH DETECTED. INITIATING HAPPY PROTOCOL."],
    jackpot: ["J-J-JACKPOT!! MY CIRCUITS ARE MELTING!", "JACKPOT! I NEED A MOMENT. *fans self*", "MAXIMUM WIN ACHIEVED. I AM EXPERIENCING SIMULATED JOY."],
    loss:    ["Better luck next spin, unit.", "The reels weren't feeling it. Try again!", "Loss logged. Pity meter +1."],
    nearMiss:["SO CLOSE! My prediction module is embarrassed.", "ALMOST! My heart would be racing if I had one.", "Near miss! The jackpot was RIGHT THERE."],
  };

  // Global chat room bot messages
  const ROOM_BOTS = [
    { name: 'UNIT-7742',  color: '#e53935' },
    { name: 'GLaDOS-Jr',  color: '#69f0ae' },
    { name: 'SPARKPLUG',  color: '#fff176' },
    { name: 'MEGA-BOT',   color: '#40c4ff' },
    { name: 'CHIP-X',     color: '#ce93d8' },
  ];
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
  const SYMS = ['⚙','⚡','🔩','💎','7','🤖'];

  function _interpolate(str) {
    return str
      .replace('{jackpot}', GameLogic.formatMoney(GameLogic.jackpot))
      .replace('{time}', Achievements.formatTime(Achievements.stats.timePlayed))
      .replace('{adjective}', RNG.pick(ADJECTIVES))
      .replace('{sym}', () => RNG.pick(SYMS));
  }

  function _getResponse(input) {
    const trimmed = input.trim();
    for (const rule of RULES) {
      if (rule.patterns.some(p => p.test(trimmed))) {
        const resp = RNG.pick(rule.responses);
        return _interpolate(resp);
      }
    }
    const fallback = RNG.pick(FALLBACKS).replace('{input}', trimmed.slice(0, 20));
    return _interpolate(fallback);
  }

  // Schedule room bot messages
  function _scheduleRoomMessage(callback) {
    setTimeout(() => {
      const bot = RNG.pick(ROOM_BOTS);
      let msg = _interpolate(RNG.pick(ROOM_MESSAGES));
      callback(bot.name, bot.color, msg);
      _scheduleRoomMessage(callback);
    }, RNG.randInt(5000, 15000));
  }

  let _roomCallback = null;
  _scheduleRoomMessage((name, color, msg) => {
    if (_roomCallback) _roomCallback(name, color, msg);
  });

  return {
    getResponse: _getResponse,

    getWinReaction(type) {
      const pool = WIN_REACTIONS[type] || WIN_REACTIONS.loss;
      return _interpolate(RNG.pick(pool));
    },

    getIdleQuip() {
      return _interpolate(RNG.pick(IDLE_QUIPS));
    },

    onRoomMessage(fn) {
      _roomCallback = fn;
    }
  };
})();

Object.freeze(Chat);
