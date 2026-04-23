# Iteration 12 Plan

### Goals:

- Completely overhaul the reel spin animation: replace the CSS-transition-based approach with a requestAnimationFrame loop that applies a proper physics deceleration curve, eliminating the visible snap at the end of each spin
- Add a pity counter progress bar visible on the machine frame so players can see how close they are to a guaranteed payout
- Fix the vertical spacing between the bet buttons, spin button, and winnings display so the machine frame is no longer cramped
- Add a payout table (accessible via ) showing all possible winnings type and symbol multipliers
- Fix the playtime timer so it pauses when the browser tab loses focus and resumes when it regains it
- Fix 4-of-a-kind jackpot symbol paying $0 by adding `jackpot` to `PAYOUTS.FOUR` and routing it through the jackpot pool payout path
- Consolidate the duplicate spin counters (`spinCount` and `playerStats.spins`) into a single source

### Prompt being used:

Keep the original prompt located at `./OriginalPrompt.txt` as the authoritative specification at all times. Use the Iteration 11 codebase as the baseline. Do not change payout math values, RNG logic, leaderboard, achievements, or audio systems unless explicitly listed below. Make only the following targeted changes:

**1. Overhaul reel spin animation (`uiReels.js`, `styles.css`):**
The current CSS-transition approach snaps visibly at the end of each spin. Replace `animateReel` with a `requestAnimationFrame`-driven loop: compute `targetPos` far enough into the strip that the reel travels multiple full visual rotations, drive the strip each frame using an ease-out curve, and apply a small overshoot-and-settle bounce on landing. The strip must always scroll downward (translateY toward more-negative values). Remove the old setTimeout-based phase chain. Keep the `setSpinning` API and `_spinning` guard intact.

**2. Add pity counter progress bar (`index.html`, `styles.css`, `ui.js`):**
Add a thin horizontal progress bar inside `.machine-frame` between the reels window and the near-miss bar. It should fill proportionally to the current pity meter value out of `PITY_THRESHOLD` (20), shift color from dim to yellow to red as it fills, and reset to empty after a pity-triggered spin. Show no numeric value — visual bar only.

**3. Fix vertical spacing in machine frame (`styles.css`):**
Increase spacing between the bet controls, spin button, and winnings display so the machine frame is no longer cramped. The spin button and winnings box should have clear breathing room from the elements above and below them.

**4. Add a payout table (`index.html`, `styles.css`, `uiPanels.js`):**
Add a Payouts section/tab in the header bar. When clicked, show every winings listing every symbol with its 2×/3×/4×/5× multipliers, read directly from `GameLogic.PAYOUTS`. Reuse `UiReels.SYMBOL_SVG` for symbol icons. No new external files.

**5. Pause playtime timer when tab is hidden (`achievements.js`):**
Use the Page Visibility API to pause the `playerStats.timePlayed` accumulation timer whenever the tab is not visible, and resume it when the tab regains focus. This prevents the "60 minutes played" achievement from being earned passively in a background tab.

**6. Fix 4-of-a-kind jackpot paying $0 (`gameLogic.js`):**
Currently 4-of-a-kind jackpot symbols fall through to a loss. Make it award the jackpot pool and reset it, consistent with how 3-of-a-kind and 5-of-a-kind jackpot already behave.

**7. Consolidate duplicate spin counters (`gameLogic.js`):**
`gameLogic.js` maintains a private `_spinCount` that duplicates `State.playerStats.spins`. Remove the private counter and read spin count from State exclusively. Do not change the external `GameLogic` API.

Implement all changes incrementally. Spin outcome, payout values, leaderboard, achievements, and audio must behave as normal.
