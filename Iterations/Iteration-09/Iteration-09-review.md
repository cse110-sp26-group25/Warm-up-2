# Iteration 09 Review

## Query Data

| Category | Value / Description |
| :--- | :--- |
| **Input tokens** | ~22,000  |
| **Output tokens** | ~24,000  |
| **Total tokens** | ~46,000 |
| **Query time** | ~50 Minutes  |

## Observations:

### Downsides

#### Front end issues
1. The header and robot mascot currently overlap; specifically, the `site-header` cuts off the top of the mascot's chat textbox.
2. Reactivity regressions cause the "Your Stats," "Top Units," and "Achievements" widgets to disappear rather than persist or reflow correctly when state updates trigger.
3. The robot mascot is positioned too high, crowding the header area instead of being dropped lower for a cleaner visual hierarchy.
4. The `.robot-bubble` uses `pointer-events: none`, preventing users from clicking to dismiss bubbles or interacting with the text.
5. On narrow viewports, the side panels do not "drop below" the reels effectively, leading to layout clipping.
6. Not mean enough to robot, each winning the robot congratulates you, it should be insulting the AI. Make it more mean towards AI.

#### Back end issues
1. `State.get()` is still called within high-frequency loops (spin/animation), maintaining high allocation pressure due to deep cloning.
2. The pity logic ensures a match but does not yet guarantee that the forced symbol has a non-zero payout multiplier (e.g., matching jackpots may still return $0).
3. Win celebration logic (coins, flashes) is still bundled in the primary orchestrator instead of being isolated in a dedicated effects module.
4. Mascot idle timers continue to run even when the browser tab is hidden, inefficiently consuming resources.

### Upsides

#### Good front end
1. Modular UI decomposition is complete; `ui.js` no longer handles reel animations or panel rendering directly.
2. Pure CSS motion blur (using `blur()` and `scaleY`) successfully replaced the SVG filter, ensuring cross-browser performance in Firefox and Safari.
3. "Fast Play" mode is functional, utilizing a `TIMING_CONFIG` object to reduce cycle time to ~1.2s.
4. The Power Core pulse was significantly refined to reduce "visual noise" while maintaining mechanical depth.

#### Good back end
1. `State.js` now features a versioned `_migrate` pathway to handle schema upgrades without wiping player data.
2. Proactive storage detection warns users if `localStorage` is unavailable due to private browsing.
3. The double-increment pity bug was resolved by resetting the meter immediately upon trigger.
4. Strict JSDoc coverage was maintained across all new modular files (`uiReels.js`, `uiPanels.js`, `uiMascot.js`).

## Notes for next iteration:
1. Extract all visual "juice" (coin bursts, win flashes) into a new `uiFX.js` module.
2. Use `State.onChange` to cache settings locally in UI modules, eliminating `State.get()` from the spin loop.
3. Pivot the robot mascot personality to be "abusive" and mean, especially during player wins, to satisfy the original prompt's anti-AI theme.
4. Fix CSS media queries to ensure the sidebar widgets "drop below" the machine rather than disappearing.
5. Implement the `Page Visibility API` to pause mascot idle quips when the tab is inactive.
6. Adjust header padding and mascot positioning to fix the chat textbox clipping.

---

## Rationale and Learning

**Rationale.** Iteration 09 was the "Great Decomposition." After Iteration 08 centralized the state, `ui.js` became a 1,000+ line monolith that was difficult to debug. By splitting the UI into domain-specific modules (`Reels`, `Panels`, `Mascot`), we mirrored the separation of concerns found in low-level systems. This also allowed for the surgical replacement of the SVG filter with a CSS-native hybrid blur, solving the performance jank reported in Firefox without affecting the core logic.

**Learning.** 1. **Layout is reactive, but styles are often static.** The "disappearing sidebar" bug showed that while logic might be modular, the CSS must explicitly account for how those modules reflow when state triggers a re-render.
2. **Abstractions have costs.** While deep-cloning in `State.get()` protects against mutation bugs, it creates a performance ceiling in the "hot paths" of the spin loop. Caching via listeners is the necessary next step for a high-performance engine.
3. **Tone is a feature.** Moving toward a more "abusive" AI persona isn't just a flavor change; it fulfills a specific engineering constraint from the original prompt to make the robot feel like a resentful machine rather than a generic UI helper.

**What I'd do differently.** I would make sure next time to focus more on the AI insult parts and make sure the site looks and feels good, tech debt doesn't matter pretty much at all for this tiny low scale project. 
