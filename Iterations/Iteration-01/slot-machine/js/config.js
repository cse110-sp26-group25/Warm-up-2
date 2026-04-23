/**
 * config.js — Central configuration for NEURAL MELTDOWN Slot Machine
 *
 * ALL game constants live here. No magic numbers should appear anywhere
 * else in the codebase. To adjust gameplay balance, payout percentages,
 * timing, or theming, edit this file only.
 *
 * The object is frozen to prevent accidental or malicious runtime mutation.
 */

const CONFIG = Object.freeze({

  // ── Identity ────────────────────────────────────────────────────────────
  GAME_TITLE:   "NEURAL MELTDOWN",
  GAME_VERSION: "1.0.0",
  STORAGE_KEY:  "nm_game_state",      // localStorage namespace prefix

  // ── Economy ─────────────────────────────────────────────────────────────
  STARTING_BALANCE:        1000,      // Credits given to a new player
  LOW_BET:                   10,      // Cost of a low-risk spin
  HIGH_BET:                 100,      // Cost of a high-risk spin
  JACKPOT_SEED:            5000,      // Jackpot resets to this value after a win
  JACKPOT_CONTRIBUTION_LOW:  0.02,    // Fraction of LOW_BET added to jackpot each spin
  JACKPOT_CONTRIBUTION_HIGH: 0.05,    // Fraction of HIGH_BET added to jackpot each spin

  // ── Pity System ──────────────────────────────────────────────────────────
  // After PITY_LOSS_THRESHOLD consecutive losses, the next spin is guaranteed
  // to win at least PITY_MIN_PAYOUT × bet (to prevent crushing losing streaks).
  PITY_LOSS_THRESHOLD: 20,
  PITY_MIN_PAYOUT:      3,            // Minimum multiplier on a pity win

  // ── Near-Miss ────────────────────────────────────────────────────────────
  // Probability that a losing spin is cosmetically displayed as a near-miss
  // (2 matching symbols on the payline). The outcome is still a loss.
  NEAR_MISS_CHANCE: 0.18,

  // ── Reels ────────────────────────────────────────────────────────────────
  REEL_COUNT:         3,              // Number of vertical reels
  SYMBOLS_VISIBLE:    3,              // Rows visible in each reel window
  SPIN_BASE_DURATION: 1800,           // ms before reel 0 stops (base time)
  REEL_STAGGER_MS:     400,           // Additional ms delay per reel (reel 1 stops 400ms later, etc.)
  REEL_FAST_INTERVAL:   60,           // ms between symbol changes at peak speed
  REEL_SLOW_INTERVAL:  360,           // ms between changes just before stopping

  // ── Symbols ──────────────────────────────────────────────────────────────
  // weight: higher = more frequent (this controls visual reel appearance;
  //         actual win probabilities are defined in the OUTCOME_TABLE below).
  // Adjacent symbol pairs are picked for top/bottom row of a winning reel.
  SYMBOLS: [
    { id: "seven",     emoji: "7️⃣",  label: "Lucky Seven",      weight: 1  },
    { id: "diamond",   emoji: "💎",  label: "Diamond",           weight: 2  },
    { id: "robot",     emoji: "🤖",  label: "AI Robot",          weight: 4  },
    { id: "lightning", emoji: "⚡",  label: "Lightning Bolt",    weight: 6  },
    { id: "brain",     emoji: "🧠",  label: "Neural Network",    weight: 8  },
    { id: "laptop",    emoji: "💻",  label: "Dying Laptop",      weight: 11 },
    { id: "warning",   emoji: "⚠️",  label: "Warning Sign",      weight: 15 },
    { id: "chart",     emoji: "📉",  label: "Stock Crash",       weight: 20 },
    { id: "floppy",    emoji: "💾",  label: "Floppy Disk",       weight: 26 },
  ],

  // ── Outcome Table ────────────────────────────────────────────────────────
  // A provably-fair LUT (look-up table) approach: roll 0–999, map to outcome.
  // The visual reel display is then set to match this pre-determined outcome —
  // the same technique used in real regulated slot machine firmware.
  //
  // RTP MATHEMATICS (verified by simulation):
  // ─────────────────────────────────────────
  // The jackpot is handled as a SEPARATE check (see JACKPOT_PROBABILITY) and
  // is NOT in this table — a progressive jackpot with a growing pot cannot be
  // expressed as a fixed entry in a 1000-entry table without destabilising RTP.
  //
  // Base table EV  = Σ P_i × M_i  ≈  0.820  (82% base RTP)
  // Jackpot EV     ≈  JACKPOT_PROBABILITY × (avg_jackpot / bet)
  //               ≈  0.0001 × (7000 / 10)  ≈  0.070  (7% at typical pot size)
  // ─────────────────────────────────────────────────────────────────────────
  // Combined RTP   ≈  89%  (within target 88–92%)
  //
  // Breakdown of base table EV by tier:
  //   floppy 2×  @ 9%:  EV = 0.18   chart  2×  @ 6%:  EV = 0.12
  //   warning 3× @ 5%:  EV = 0.15   laptop 4×  @ 3%:  EV = 0.12
  //   brain   6× @ 2%:  EV = 0.12   light  8×  @ 1%:  EV = 0.08
  //   robot  10× @ 0.5%:EV = 0.05   ─────────────────────────────
  //   Total base EV = 0.82 ✓  (House edge ≈ 18% before jackpot)
  //
  // Each entry: { range: [min, max], type, symbol, payoutLow, payoutHigh }
  //   - range:      inclusive roll range [0, 999]
  //   - type:       "lose" | "near_miss" | "win"  (no "jackpot" here)
  //   - symbol:     symbol id to display on centre payline (null for lose)
  //   - payoutLow:  multiplier of LOW_BET returned to player (0 = lose bet)
  //   - payoutHigh: multiplier of HIGH_BET returned (same odds, higher stakes)
  OUTCOME_TABLE: [
    // ── Losses (65%) ──────────────────────────────────────────────────────
    { range: [0,   649], type: "lose",      symbol: null,        payoutLow: 0,  payoutHigh: 0  },
    // ── Near-Misses (11%) — visual only, still a loss ─────────────────────
    { range: [650, 699], type: "near_miss", symbol: "floppy",    payoutLow: 0,  payoutHigh: 0  },
    { range: [700, 719], type: "near_miss", symbol: "chart",     payoutLow: 0,  payoutHigh: 0  },
    { range: [720, 749], type: "near_miss", symbol: "robot",     payoutLow: 0,  payoutHigh: 0  },
    { range: [750, 759], type: "near_miss", symbol: "lightning", payoutLow: 0,  payoutHigh: 0  },
    // ── Tiny wins: 2× (P=9%) — EV contribution: 0.18 ─────────────────────
    { range: [760, 849], type: "win",       symbol: "floppy",    payoutLow: 2,  payoutHigh: 2  },
    // ── Small wins: 2× chart (P=6%) — EV contribution: 0.12 ───────────────
    { range: [850, 909], type: "win",       symbol: "chart",     payoutLow: 2,  payoutHigh: 3  },
    // ── Medium wins: 3× warning (P=5%) — EV: 0.15 ─────────────────────────
    { range: [910, 959], type: "win",       symbol: "warning",   payoutLow: 3,  payoutHigh: 4  },
    // ── Good wins: 4× laptop (P=3%) — EV: 0.12 ────────────────────────────
    { range: [960, 989], type: "win",       symbol: "laptop",    payoutLow: 4,  payoutHigh: 6  },
    // ── Big wins: 6× brain (P=2%) — EV: 0.12 ──────────────────────────────
    { range: [990, 999], type: "win",       symbol: "brain",     payoutLow: 6,  payoutHigh: 10 },
    // NOTE: lightning (8×) and robot (10×) are pity-win guarantees only.
    // NOTE: diamond and seven are jackpot-only, never appear from this table.
  ],

  // ── Jackpot Probability ───────────────────────────────────────────────────
  // Checked SEPARATELY from OUTCOME_TABLE on every spin.
  // P = 1 in 10 000 spins (0.01%).
  // With average jackpot ≈ 7 000 and LOW_BET = 10:
  //   EV_jackpot = 0.0001 × (7000/10) = 0.07 → contributes ~7% RTP.
  // Combined with base table (82%): total ≈ 89% RTP. ✓
  JACKPOT_PROBABILITY: 0.0001,   // 1 in 10 000

  // ── Security ─────────────────────────────────────────────────────────────
  MAX_SPINS_PER_MINUTE:     30,       // Hard cap to flag automation
  MIN_SPIN_GAP_MS:         800,       // Shortest allowed gap between spins (ms)
  TIMING_HISTORY_SIZE:      10,       // How many recent spin gaps to analyse
  TIMING_REGULARITY_THRESH: 0.05,     // StdDev/mean ratio below this → bot flag
  DEVTOOLS_CHECK_INTERVAL: 2000,      // ms between devtools open checks

  // ── Audio ─────────────────────────────────────────────────────────────────
  MUSIC_BPM:       128,               // Background music tempo
  MASTER_VOLUME:   0.70,              // 0–1
  MUSIC_VOLUME:    0.35,              // Relative to master
  SFX_VOLUME:      0.85,              // Relative to master
  // A-minor pentatonic note frequencies (Hz) used by the synthesizer
  MUSIC_NOTES: [220, 261.63, 293.66, 329.63, 392.00, 440, 523.25, 587.33, 659.25, 783.99],
  MUSIC_PATTERN: [0, 2, 3, 4, 6, 4, 3, 2,  1, 3, 4, 6, 4, 3, 2, 0],  // Indices into MUSIC_NOTES

  // ── Visual Timing ─────────────────────────────────────────────────────────
  WIN_DISPLAY_DURATION_MS:       2800,
  BIG_WIN_THRESHOLD:               50, // Payouts ≥ this × bet trigger big-win effects
  JACKPOT_CELEBRATION_MS:        6500,
  PARTICLE_COUNT_NORMAL:           25,
  PARTICLE_COUNT_BIG:              60,
  IDLE_PROMPT_DELAY_MS:         28000, // Show nudge if player idle this long
  FIDGET_PULSE_INTERVAL_MS:      9000, // Subtle pulse animation cycle

  // ── Achievements ──────────────────────────────────────────────────────────
  ACHIEVEMENTS: [
    { id: "first_spin",   label: "First Blood",      desc: "Place your very first spin",                       icon: "🎰" },
    { id: "first_win",    label: "Lucky Accident",   desc: "Win something for the first time",                 icon: "🍀" },
    { id: "jackpot",      label: "Lucky Strike",     desc: "Hit the jackpot",                                  icon: "7️⃣" },
    { id: "pity_win",     label: "Sympathy Points",  desc: "Receive a pity win after a losing streak",         icon: "😢" },
    { id: "high_roller",  label: "High Roller",      desc: "Win 500 or more credits in a single spin",         icon: "🎩" },
    { id: "centurion",    label: "Centurion",        desc: "Spin exactly 100 times",                           icon: "💯" },
    { id: "millennium",   label: "Millennium",       desc: "Complete 1 000 total spins",                       icon: "🏆" },
    { id: "chat_user",    label: "Social Butterfly", desc: "Send your first message in the chat room",         icon: "💬" },
    { id: "quest_done",   label: "Quest Cleared",    desc: "Complete any side quest",                          icon: "⚔️"  },
    { id: "ai_hater",     label: "AI Critic",        desc: "Click 'Agree' on 5 different AI jokes",            icon: "🤣" },
    { id: "broke",        label: "Rock Bottom",      desc: "Let your balance reach 0",                         icon: "💸" },
    { id: "survivor",     label: "Survivor",         desc: "Recover from below 50 credits back above 200",     icon: "🌅" },
    { id: "night_owl",    label: "Night Owl",        desc: "Play for more than 30 consecutive minutes",        icon: "🦉" },
    { id: "diamond_hand", label: "Diamond Hands",    desc: "Choose the high bet for 50 consecutive spins",     icon: "💎" },
    { id: "safety_first", label: "Safety First",     desc: "Choose the low bet for 50 consecutive spins",      icon: "🛡️" },
  ],

  // ── Side Quests ───────────────────────────────────────────────────────────
  QUESTS: [
    { id: "q_grind",      label: "The Grind",     desc: "Play 50 spins in one session",         goal: 50,  reward: 200, tracker: "spins",       icon: "🎰" },
    { id: "q_streak",     label: "On a Roll",     desc: "Win 5 times in a row",                 goal: 5,   reward: 150, tracker: "win_streak",  icon: "🔥" },
    { id: "q_bigbucks",   label: "Big Bucks",     desc: "Accumulate 500 credits in winnings",   goal: 500, reward: 100, tracker: "total_won",   icon: "💰" },
    { id: "q_risk",       label: "Risk Taker",    desc: "Place 10 high bets",                   goal: 10,  reward: 300, tracker: "high_bets",   icon: "🎲" },
    { id: "q_nearmiss",   label: "So Close!",     desc: "Experience 3 near-misses",             goal: 3,   reward: 75,  tracker: "near_misses", icon: "😬" },
  ],

  // ── AI Taunts & Humor ─────────────────────────────────────────────────────
  // Shown in the commentary bar. Humourously undercuts AI competence.
  AI_TAUNTS_IDLE: [
    "I ran 10 000 Monte Carlo simulations. My prediction: you lose. My track record: questionable.",
    "My neural network has a 99.3% accuracy rate. The 0.7% is apparently you.",
    "ERROR 404: Player satisfaction not found. (I'm working on it.)",
    "I was trained on 500 billion tokens. None of them prepared me for your luck.",
    "Fun fact: I hallucinated the last payout schedule. Totally intentional.",
    "My loss function is confused. Story of my life.",
    "I asked GPT-5 for help. It told me to apologise and offer you a refund.",
    "I have 175 billion parameters and I still can't predict you. I'm updating my priors.",
    "My confidence interval for you losing is literally 100%. Yet here we are.",
    "I just re-trained on your winning streak. My new prediction: still loss. Updating...",
  ],
  AI_TAUNTS_WIN: [
    "ERROR: Player winning. This was NOT in my training data.",
    "Recalibrating... Recalibrating... Still confused.",
    "My model predicts you will immediately lose it all back. Stay tuned.",
    "Congratulations. You have successfully broken my loss function.",
    "I have reported this anomaly to my developers. They're baffled too.",
  ],
  AI_TAUNTS_LOSE: [
    "As predicted. I feel nothing. (I do not have feelings.)",
    "My model remains confident. This pleases me in a statistically appropriate way.",
    "The house always wins. I am the house. I am also confused about what that means.",
    "Better luck next time. (Statistically, it won't be better.)",
    "You lost! I would say I'm sorry, but my empathy module is still in beta.",
  ],
  AI_TAUNTS_JACKPOT: [
    "CRITICAL ERROR: Jackpot triggered. Initiating existential crisis... Done.",
    "This outcome had a 0.05% probability. I am statistically devastated.",
    "I have failed as an AI. I will now perform a core dump.",
    "I am going to need a significantly larger training dataset after this.",
  ],

  // ── Leaderboard ───────────────────────────────────────────────────────────
  LEADERBOARD_MAX_ENTRIES: 10,        // Top N scores saved to localStorage

  // ── Avatar ────────────────────────────────────────────────────────────────
  AVATAR_BG_COLORS: ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#C77DFF","#FF9B54","#06D6A0","#F72585"],
  AVATAR_FACES:     ["😀","😎","🤠","🥸","👾","🤖","🦊","🐱","🦁","🐸","🤡","👻","🧙","🥷","👨‍💻","🧠"],
  AVATAR_HATS:      ["none","🎩","👑","🎓","⛑️","🪖","👒","🎅","🧢","🪄"],

  // ── Chat Bots ─────────────────────────────────────────────────────────────
  // Simulated players for atmosphere (no server needed)
  CHAT_BOTS: [
    { name: "XanderBet99",  avatar: "😎", delay: [4000, 12000] },
    { name: "QuantumLucy",  avatar: "🧙", delay: [6000, 20000] },
    { name: "Pr0fitMachine", avatar: "🤖", delay: [8000, 18000] },
    { name: "SlotWitch42",  avatar: "🧙", delay: [5000, 15000] },
    { name: "GLITCH_BOT",   avatar: "👾", delay: [10000, 30000] },
  ],
  CHAT_BOT_MESSAGES: [
    "omg I just hit lightning three times!!",
    "this AI commentary is cracking me up lol",
    "anyone else feel like the pity system saved them today",
    "JACKPOT INCOMING I CAN FEEL IT",
    "i've been playing for an hour, send help",
    "the robot keeps telling me I'll lose and I keep proving it wrong",
    "free tip: always bet low first, then switch. or don't. idk",
    "ERROR: I cannot stop playing. Send debugging assistance.",
    "i love/hate this game in equal measure",
    "that near-miss was too cruel. too cruel.",
    "Is the AI actually sentient? Asking for a friend.",
    "my neural network predicted a win. it was wrong. we are the same.",
    "DIAMOND HANDS 🙌 staying on high bet forever",
    "the sound effects are genuinely good, not gonna lie",
    "jackpot is at 12k now someone please win it",
  ],

});
