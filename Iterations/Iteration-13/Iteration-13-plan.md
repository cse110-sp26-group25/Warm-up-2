# Iteration 13 Plan

### Goals:

- Fix the reel snap so the strip visually lands on the correct symbol without any jump after the animation settles
- Add a "PITY" text label next to the pity progress bar
- Increase the chatbox height under the robot mascot so more message history is visible
- Move the achievements widget from the right panel to the left panel to balance the layout
- Add a credit/balance system with a starting balance, per-spin deduction, and a disabled spin button when broke
- Cap bot leaderboard score growth so totals cannot grow unrealistically large
- Fix the jackpot pool payout bug so the pool is actually awarded and reset on any jackpot hit
- Show a toast notification when the player unlocks an achievement
- Show the player's current leaderboard rank on the machine frame

### Prompt being used:

Keep the original prompt located at `./OriginalPrompt.txt` as the authoritative specification at all times. Use the Iteration 12 codebase as the baseline. Do not change RNG logic, audio systems, or payout multiplier values unless explicitly listed below. Make only the following targeted changes:

**1. Fix reel snap after animation (`uiReels.js`):**
After the rAF settle phase completes there is a visible snap to the final symbol. Find and eliminate it — the strip must come to rest on the correct symbol smoothly with no jump. Keep the `setSpinning` API and overall rAF structure intact.

**2. Add "PITY" label to pity bar (`index.html`, `styles.css`):**
Add a small text label "PITY" to the left of the existing progress bar so players know what it represents. Keep it visually subtle so it does not compete with the reels.

**3. Increase chatbox height (`styles.css`):**
Make the chat message area under the robot mascot taller so more message history is visible. Keep it scrollable and contained within the left panel.

**4. Move achievements to left panel (`index.html`, `styles.css`):**
Relocate the achievements widget from the right panel into the left panel, below the chat widget. The leaderboard and stats widgets stay on the right. Adjust layout so neither panel overflows.

**5. Add credit/balance system (`gameLogic.js`, `state.js`, `ui.js`, `index.html`, `styles.css`):**
Give the player a starting balance of $200. Deduct the bet on each spin and add any payout back. Persist the balance to State. Block and visually disable the spin button when the balance is too low for the selected bet. Display the balance on the machine frame, styled consistently with the existing winnings display.

**6. Cap bot leaderboard growth (`leaderboard.js`):**
Add a maximum score ceiling for bot entries so their totals cannot grow indefinitely. Bots at the cap stop receiving score increments.

**7. Fix jackpot pool payout (`gameLogic.js`):**
The jackpot pool is currently never distributed because the award logic is inside an `if (result.payout > 0)` guard, but jackpot outcomes always return `payout: 0`. Move the jackpot pool award and reset outside that guard so the pool pays out and resets correctly on any jackpot hit.

**8. Achievement toast notifications (`ui.js`, `index.html`, `styles.css`):**
Show a brief toast in the bottom-right corner when an achievement is unlocked, displaying the achievement name. Toasts should stack if multiple unlock at once, animate in and out, and respect the `data-reducedmotion` setting. The existing mascot bubble announcement can stay alongside it.

**9. Player leaderboard rank display (`index.html`, `styles.css`, `ui.js`):**
Add a small indicator on the machine frame showing the player's current rank in the leaderboard (e.g. `RANK #3`) or `UNRANKED` if they have no wins yet. Update it after every spin. Use the existing `Leaderboard.getPlayerRank()` method.

Implement all changes incrementally. Spin outcome, payout multipliers, RNG, audio, and settings must behave as normal.
