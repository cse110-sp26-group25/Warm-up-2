# Iteration 21 Plan: The "Gold Master" Deployment

### Goals
* **Sequential Logic Correction**: Refactor the resolution engine to enforce the "Left-to-Right" rule, ensuring wins only count consecutive matches starting from Reel 1.
* **Sensory "Near-Miss" Tension**: Implement the "Tease" mechanic where reels 3–5 spin longer if reels 1 and 2 match, synchronized with a rising-pitch audio ramp.
* **Behavioral Retention Loops**: Introduce the **Daily Maintenance Stipend** ($50 every 24h) and **Mascot Rank Evolution** to encourage daily play and status-seeking.
* **Performance Scaling**: Implement hardware-aware particle capping for the "Coin Fountain" and dynamic SVG filter lifecycle management for low-end devices.
* **Production Seal**: Finalize absolute logic encapsulation and implement a hidden "Diagnostic Export" for post-deployment troubleshooting.

---

### Master Prompt for Iteration 21

**Role:** Lead Software Engineer & UX Architect.

**Contextual Anchor:**
1.  Use **OriginalPrompt.txt** as the "Constitutional" authority.
2.  Use the **Iteration 20 codebase** as the functional baseline.
3.  Reference the **Iteration 20 Screen Recording** for visual/logic verification.

**Mission:** Deliver the "Gold Master" version. Transition from a feature-complete engine to a high-retention, hardware-optimized gaming ecosystem.

#### 1. Logic Fix: Consecutive "Left-to-Right" Matching
- **Refactor `GameLogic._resolve`**: The engine must count consecutive matches starting from `syms[0]`.
- **Constraint**: If any reel in the sequence does not match the first symbol, the "chain" must break. 
    - *Example*: `[X, X, Y, X, X]` must resolve as a **Two-of-a-Kind**, not a Four.
    - *Example*: `[Y, X, X, X, X]` must resolve as a **Loss**.
- **Math Buffer**: Slightly buff the `three` and `four` payout multipliers in the `CONFIG` to maintain the **92% RTP** target despite the stricter matching logic.

#### 2. Sensory Tension: The "Near-Miss" Tease
- **Reel Pacing (`uiReels.js`)**: If `symbols[0] === symbols[1]`, trigger the "Tease" state. Extend the spin duration of Reels 3, 4, and 5 by +1.0s, +1.5s, and +2.0s respectively.
- **Audio Pitch-Ramp (`audio.js`)**: Implement `_playTensionRamp(duration)`. Use a procedural oscillator to slide from **220Hz to 880Hz** during the extended spin to maximize player anticipation.

#### 3. Retention Hooks: Stipends & Evolution
- **Daily Bonus (`state.js`)**: Track `lastLoginTimestamp`. If >24h since last seen, grant a **$50 "Maintenance Stipend"**.
- **Dynamic Mascot (`uiMascot.js`)**: Apply CSS filters based on leaderboard rank:
    - **Top 5**: `.gold-plated` (Gold sepia + crown icon).
    - **Top 20**: `.polished-chrome` (High brightness/contrast).
    - **Otherwise**: Standard industrial grey.

#### 4. Hardware Optimization & Performance
- **Dynamic Particles**: Cap the "Coin Fountain" at 15 particles if `reducedMotion` is true or if the browser reports a high frame-delta.
- **Filter Lifecycle**: Set the SVG `#vblur` filter to `display: none` in the CSS whenever the reels are in the `idle` state to save GPU cycles.

#### 5. Final Security & Export
- **Closure Sealing**: Ensure all internal `GameLogic` helpers are strictly private and unreachable from the `window` object.
- **Diagnostic Tool**: Implement a 3-second long-press on the Mascot that triggers a JSON download of the current `State` for session troubleshooting.

**Output Requirement:** Provide the **full source code** for all affected files and the final **Iteration 21** entry for the `ai-use-log.md`. Every function must include **JSDoc annotations**.
