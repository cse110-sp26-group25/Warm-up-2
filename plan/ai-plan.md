# Our plan for what we need to see in our AI generated programs and prompts

- Payout system must be mathematically sound
- The system must generate profit while avoiding draining players too quickly
- Payouts should be dynamic and variable
- Allow customizable bet sizes (low and high bets)
- Implement a growing jackpot / snowball pot
- Animations must not be so short that they violate gambling regulations
- Random number generation must be secure and inaccessible from browser dev tools
- Must include protections against macros or automated play
- Low bet players still have occasional wins
- High bet players experience larger but rarer payouts
- Include pity payouts to prevent extended loss streaks
- Maintain mathematical fairness
- “Almost there” payout indicators
- visual reward effects
- sound feedback
- high BPM background music
- subtle moving elements to keep players alert
- low-effort fidget interaction
- dynamic animations
- avoid exhausting players
- timed stimulation cycles
- maintain excitement without overstimulation
- Money counter should not dominate the screen
- Only display money won, not net profit/loss
- Main screen color should be calm and non-noisy
- Large central interaction element (similar to a “big red button”)
- Play actions available through mouse click or keyboard (spacebar)
- player rankings
- leaderboards
- achievements
- stats tracking (plays, time played, amount won)
- text chat rooms
- avatar creation
- side quests
- RNG must not be accessible through browser developer tools
- server-side randomness
- tamper-proof results
- detect macro generation
- detect automation scripts
- detect unnatural play patterns
- epilepsy safe mode
- screen reader compatibility
- adjustable volume
- reduced motion settings
- color accessibility
- strong recognizable identity
- animated effects
- sound cues for rewards
- visual effects for near wins and big wins
- Needs to make fun of AI
- Split code into multiple files, including multiple js files for readability
- Comprehensive comments that help developers understand what the code is doing
- Consistent coding style
- No magic numbers
- Accomodates variable screen dimensions
- use proper html sections rather than excessive div usage
- Use modern css notation and strategies

Here is a **clean paragraph-style master prompt**:

---

Write the full source code for a browser-based slot machine game using **HTML, CSS, and JavaScript**, organized as a **multi-file project** with clear separation 
of concerns (e.g., `index.html`, `styles.css`, `rng.js`, `gameLogic.js`, `ui.js`, `audio.js`, `security.js`, etc.). The code should be written with a **consistent 
coding style**, use **modern CSS practices**, and avoid magic numbers by defining configuration constants. The interface should use **semantic HTML sections** 
rather than excessive `<div>` elements, and the layout must **adapt to variable screen sizes** using responsive design techniques. Include **comprehensive comments 
throughout the code** explaining what each component does so future developers can easily understand and maintain the system. The game should feature a 
**mathematically sound payout system** designed to generate profit while avoiding draining players too quickly. Payouts must be **dynamic and variable**, allow 
**customizable bet sizes (low and high bets)**, and include a **growing jackpot or snowball pot** mechanic. The system should ensure **low bet players occasionally
win smaller rewards while high bet players experience larger but rarer payouts**, and include a **pity payout mechanism** to prevent excessively long losing streaks
while still maintaining mathematical fairness. Random number generation must be **secure, server-side simulated, tamper-resistant, and inaccessible from browser 
developer tools**, and the system should include protections against **macro usage, automation scripts, and unnatural play patterns**. The game must also implement 
**“almost there” indicators for near wins**, **visual reward effects**, **sound feedback**, and **high-BPM background music** with subtle animated elements to 
maintain player engagement without exhausting them. Include **timed stimulation cycles** and **low-effort fidget interaction** to keep gameplay active but not 
overwhelming. The UI should prioritize clarity and accessibility: the **money counter should be unobtrusive and only display money won rather than net profit/loss**,
the main screen color should be **calm and non-noisy**, and the interface should include a **large central play element similar to a “big red button”** that can be 
activated via **mouse click or keyboard spacebar**. The project should also include **player engagement systems** such as rankings, leaderboards, achievements, 
statistics tracking (number of plays, time played, and amount won), text chat rooms, avatar creation, and small optional side quests. Accessibility must be 
supported through **epilepsy safe mode, reduced motion settings, screen reader compatibility, adjustable volume controls, and color accessibility options**. The 
game should have a **distinct recognizable theme with animated effects and reward sound cues**, and humorous elements that **playfully make fun of AI** as part of 
the theme. Ensure animations meet reasonable duration guidelines so they are **not unrealistically short**. The final output should include **all files needed for 
the project**, clearly separated and labeled, with clean structure and maintainable code that demonstrates best practices in modern web development.


# Learnings from Iteration 1 
- Linear Bet sizes (not just high and low)
- No clocks
- Larger slot machine 3x5


# Learnings from Iteration 2
- Top rankings should be visible at all times.
- Chat needs to be active and not blank or unresponsive
- Cheer Animations/ words splash across screen for non audio players
- Other background animations required / Webpage too blank 

# Learnings from Iteration 3-4
- Prompting the Ai by telling it what not to do is more effective than telling it what to do.
  - When prompting to move away from emoji icons Claude was able to switch to more "unique" graphics.
  - On the other hand, simply stating to change colors and add more animations isn't sucesseding, the changes are minimal.
  - This might be because it's hard for Claude to determine what "meaningful" change is, as it's an arbituary standard. On the other had, a more binary or specific intruction forces drastic changes. 
- Being more specific about the code files we intend Claude to iterate rather than just saying iterate seems to be working, the drift from iteration 3 to 4 was extremely minimal in comparison to the previous warmup. 

