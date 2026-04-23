/**
 * chatbot.js — Lucky Assistant: context-aware chatbot with varied responses.
 *
 * Responses are drawn from large pools to minimise repetition.
 * The chatbot also reacts to game events (wins, losses, jackpot, etc.).
 */

'use strict';

const Chatbot = (() => {

  /* ---- Response pools ------------------------------------ */

  const POOLS = {
    greetings: [
      "Hey! Ready to hit the jackpot today?",
      "Welcome back! The reels are warm and ready.",
      "Good to see you! Let's see if luck is on your side.",
      "Hello, spinner! Feeling lucky today?",
      "Great timing — the jackpot is looking juicy right now!",
      "Well hello there! May the symbols align in your favour.",
    ],

    tips: [
      "Pro tip: Cherries on the first two reels always pay something!",
      "Bet higher to grow the jackpot faster — but only what you can afford.",
      "The progressive jackpot resets after every win, so it's freshest right after a jackpot.",
      "Near-miss on the centre row? The reels are just teasing you.",
      "Auto-spin is great for grinding, but keep an eye on your credits!",
      "Cherries on reel 1 + reel 2 still pay, even with no match on reel 3.",
      "Bigger bets contribute more to the jackpot — but variance is higher too.",
      "The pity system quietly tops you up after a long losing streak.",
      "Stars and Sevens are rare but pay many times your bet.",
      "Set your bet before you spin — changing it mid-session resets your rhythm!",
    ],

    wins: {
      small: [
        "Nice! A little something to keep the momentum going!",
        "A small but tasty win — every credit counts!",
        "The reels smiled at you! Keep it up.",
        "That's the one! Small win, big vibes.",
        "A coin here, a coin there — it adds up!",
        "Sweet! The machine likes you today.",
      ],
      big: [
        "Now THAT is a win! Well played!",
        "Excellent! The reels delivered — big time!",
        "Oh wow, a big win! The machine is generous today.",
        "Ka-ching! That's what we came here for!",
        "Huge win! You're on a roll — ride that wave!",
        "Impressive spin! The stars aligned for you.",
      ],
      mega: [
        "MEGA WIN! The reels are absolutely on fire!",
        "INCREDIBLE! That's a massive payout — screenshot-worthy stuff!",
        "You're unstoppable right now! MEGA WIN!",
        "I've seen a lot of spins, but that was something else. MEGA WIN!",
        "Holy symbols! That is one colossal win. Bravo!",
      ],
      jackpot: [
        "🎰 JACKPOT! YOU HIT THE JACKPOT! I can barely contain myself!",
        "THE JACKPOT IS YOURS! This is the spin of a lifetime!",
        "JACKPOT! The machine surrenders — take your winnings and celebrate!",
        "Once in a million spins — and it happened RIGHT NOW. JACKPOT!",
        "YOU BROKE THE BANK! Jackpot hit — absolute legend!",
      ],
    },

    losses: [
      "So close! Don't let it get you down — the next spin could be it.",
      "The reels weren't kind that time. Onwards!",
      "Rough spin, but luck can turn in an instant.",
      "No win this time, but the jackpot grew a little bigger!",
      "Shake it off — the machine owes you one.",
      "Not today, but persistence pays!",
      "The reels are warming up — keep going!",
      "Better luck next spin. The odds reset every time.",
      "A loss just means the big win is one step closer.",
      "The casino always takes one, then you take three — stay patient!",
    ],

    nearMiss: [
      "Ooh, SO close! Two matching symbols… the third one is cruel.",
      "That was agonisingly near! The reel stopped one off.",
      "Near-miss! The machine is dangling that win right in front of you.",
      "Two out of three — the suspense is real!",
      "Almost! The symbols were just out of reach.",
    ],

    pity: [
      "The machine felt bad and slipped you a little something. Every bit counts!",
      "Consolation credits incoming — the streak can only go up from here.",
      "A small courtesy from the reels to keep you spinning.",
    ],

    unknown: [
      "Hmm, I'm not sure about that one. Ask me about tips, odds, or how the game works!",
      "That's outside my expertise! Try asking about the symbols or jackpot.",
      "I'm a slot machine expert, not an oracle — ask me about the game!",
      "Not sure I follow! I'm best at answering questions about Lucky Reels.",
      "Could you rephrase that? I'm better at game tips than riddles.",
    ],

    howToPlay: [
      "Simple! Pick your bet, hit SPIN, and see if any row matches 3 symbols.\n• Cherry + Cherry pays even on just 2!\n• Bells, Diamonds, Stars, and Sevens are rare but pay big.\n• The middle row is the main payline, but top and bottom rows count too!",
    ],

    aboutJackpot: [
      "The progressive jackpot grows with every spin (2% of each bet is added). It resets to $10,000 after being won. Three 🎰 symbols on any payline triggers it — rare, but glorious!",
    ],

    aboutRTP: [
      "Lucky Reels has a balanced return-to-player with a pity system — after a long losing streak, small consolation credits kick in automatically so you're never completely drained.",
    ],

    aboutSymbols: [
      "Here's the symbol guide:\n🍒 Cherry — most common, pays 2×–4×\n🍋 Lemon — common, pays 5×\n🍊 Orange — pays 7×\n🍇 Grape — pays 10×\n🔔 Bell — pays 16×\n💎 Diamond — rare, pays 30×\n⭐ Star — very rare, pays 60×\n🎰 Seven — jackpot!",
    ],
  };

  /* ---- Last-event context for proactive commentary ------- */

  let _lastWinType = null;
  let _lastLossRun = 0;
  let _sessionSpins = 0;

  function onGameEvent(type, data = {}) {
    if (type === 'win') {
      _lastWinType  = data.winType;
      _lastLossRun  = 0;
      _sessionSpins++;
      // Proactively comment on notable wins
      if (['mega', 'jackpot', 'big'].includes(data.winType)) {
        _botSay(_pickFrom(POOLS.wins[data.winType] || POOLS.wins.big));
      } else if (data.winType === 'small' && Math.random() < 0.35) {
        _botSay(_pickFrom(POOLS.wins.small));
      }
    } else if (type === 'loss') {
      _lastLossRun++;
      _sessionSpins++;
      if (data.nearMiss && Math.random() < 0.55) {
        _botSay(_pickFrom(POOLS.nearMiss));
      } else if (_lastLossRun >= 8 && Math.random() < 0.3) {
        _botSay(_pickFrom(POOLS.losses));
      }
    } else if (type === 'pity') {
      if (Math.random() < 0.7) _botSay(_pickFrom(POOLS.pity));
    }
  }

  /* ---- Intent parsing ------------------------------------ */

  function _parseIntent(text) {
    const t = text.toLowerCase().trim();

    if (/\b(hi|hello|hey|sup|yo|howdy)\b/.test(t))           return 'greeting';
    if (/\b(how.*(play|work)|rules?|tutorial)\b/.test(t))    return 'howToPlay';
    if (/\b(jackpot|progressive|grand)\b/.test(t))           return 'aboutJackpot';
    if (/\b(rtp|return|odds|payout rate|house edge)\b/.test(t)) return 'aboutRTP';
    if (/\b(symbol|cherry|lemon|orange|grape|bell|diamond|star|seven)\b/.test(t)) return 'aboutSymbols';
    if (/\b(tip|advice|strat|help|suggest)\b/.test(t))       return 'tip';
    if (/\b(win|won|won)\b/.test(t))                         return 'askWin';
    if (/\b(lose|lost|losing|streak)\b/.test(t))             return 'askLoss';
    if (/\b(bet|wager|stake|how much)\b/.test(t))            return 'aboutBet';
    if (/\b(auto|autospin|automatic)\b/.test(t))             return 'aboutAuto';
    if (/\b(thank|thanks|ty|cheers)\b/.test(t))              return 'thanks';
    if (/\b(pity|consolation|bonus credit)\b/.test(t))       return 'aboutPity';

    return 'unknown';
  }

  function _respond(intent) {
    switch (intent) {
      case 'greeting':    return _pickFrom(POOLS.greetings);
      case 'howToPlay':   return _pickFrom(POOLS.howToPlay);
      case 'aboutJackpot':return _pickFrom(POOLS.aboutJackpot);
      case 'aboutRTP':    return _pickFrom(POOLS.aboutRTP);
      case 'aboutSymbols':return _pickFrom(POOLS.aboutSymbols);
      case 'tip':         return _pickFrom(POOLS.tips);

      case 'askWin':
        if (_lastWinType && _lastWinType !== 'none') {
          return `Your last win was a ${_lastWinType} win! ${_pickFrom(POOLS.wins[_lastWinType] || POOLS.wins.small)}`;
        }
        return "No wins recorded yet this session — keep spinning, fortune favours the bold!";

      case 'askLoss':
        if (_lastLossRun > 0) {
          return `You've had ${_lastLossRun} loss${_lastLossRun !== 1 ? 'es' : ''} in a row. ${_pickFrom(POOLS.losses)}`;
        }
        return "You're actually on a pretty decent run right now! Long may it continue.";

      case 'aboutBet':
        return `Bets go from ${CONFIG.MIN_BET} to ${CONFIG.MAX_BET} in steps of ${CONFIG.BET_STEP}. Higher bets mean bigger payouts — and more jackpot contributions!`;

      case 'aboutAuto':
        return "Hit the AUTO button and pick 5–50 spins. Auto-spin pauses automatically if you win big or run low on credits.";

      case 'thanks':
        return _pickFrom([
          "Anytime! That's what I'm here for!",
          "You're welcome — now go get that jackpot!",
          "Happy to help! Good luck!",
          "No problem! May the reels align in your favour.",
        ]);

      case 'aboutPity':
        return "After a long losing streak the machine quietly tops up your credits — just a little nudge to keep you in the game. It won't make you rich, but it keeps the reels turning!";

      default:
        return _pickFrom(POOLS.unknown);
    }
  }

  /* ---- Utilities ----------------------------------------- */

  const _recentBotMessages = [];

  function _pickFrom(pool) {
    // Avoid immediate repetition
    const available = pool.filter(m => !_recentBotMessages.includes(m));
    const chosen = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : pool[Math.floor(Math.random() * pool.length)];

    _recentBotMessages.push(chosen);
    if (_recentBotMessages.length > 6) _recentBotMessages.shift();
    return chosen;
  }

  function _botSay(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function _userSay(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  /* ---- Public API ---------------------------------------- */

  function handleUserInput(text) {
    if (!text || !text.trim()) return;
    _userSay(text.trim());

    // Slight delay to feel more natural
    setTimeout(() => {
      const intent  = _parseIntent(text);
      const reply   = _respond(intent);
      _botSay(reply);
    }, 280 + Math.random() * 220);
  }

  function init() {
    const input  = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    function submit() {
      const txt = input.value.trim();
      if (txt) {
        handleUserInput(txt);
        input.value = '';
      }
    }

    sendBtn.addEventListener('click', submit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') submit();
    });
  }

  return { init, onGameEvent };
})();
