# Iteration 16 Plan: UI Stability, Accessibility, and System Validation

### Goals
* **UI Stability & Layout**: Cap visible toasts to a maximum of 3 and reorder left-panel widgets so Achievements appear above the Chat log to prevent layout shifting.
* **UX Refinement**: Replace the explicit "Pity" terminology with a subtle, immersive "Luck Warmup" indicator that tracks progress toward the next guaranteed match.
* **Visual Balance**: Implement a 10-second timeout for the persistent storage warning pulse and ensure **Epilepsy Safe Mode** fully suppresses all high-intensity animations.
* **Audio Reliability**: Add a 50ms silent lead-in to the `playDenied()` sound effect to prevent clipping on mobile browser audio contexts.
* **System Validation**: Formally promote the `smoke-test.js` script into the repository and run a **100k-spin simulation** to empirically verify the 92% RTP target.

---

### Master Prompt for Iteration 16

**Role:** Lead Software Engineer & UX Architect.

**Contextual Anchor:**
1.  Use **OriginalPrompt.txt** as the "Constitutional" authority.
2.  Use the **Iteration 15 codebase** as the functional baseline.
3.  Reference **ai-use-log.md** to maintain continuity for the 20-entry minimum.

**Mission:** Transition the application from a hardened prototype to a "Production-Grade Immersive Experience." This iteration represents a "Big Jump" in UI stability, mechanical depth, and system validation.

#### 1. UI Architecture & Stability
* **Widget Priority Reorder**: Modify `index.html` and `styles.css` to move the **Achievements Widget** above the **Chat Widget** in the left panel.
* **Toast Management**: In `ui.js`, implement a **Toast Queue Manager**. Limit visible toasts to a maximum of 3. If a 4th toast is triggered, it should displace the oldest toast.
* **Mobile Compression**: Ensure `.chat-mini` has a hard `min-height: 180px` to prevent collapsing on smaller viewports.

#### 2. Immersive "Luck Warmup" (Pity System Refactor)
* **Thematic Integration**: Completely remove the "PITY" text label. Replace it with a **"Luck Warmup"** indicator using the `.luck-indicator` nodes.
* **Visual Feedback**: Map the `pityMeter` from `State` to these nodes. As the player approaches the threshold, these nodes should transition from **Dull Grey** (#90a4ae) to a **Glowing Neon Orange** (#ff9100).
* **Mechanical Hook**: Ensure the transition is non-linear—pulsing faster as the player gets within 2 spins of a guaranteed match.

#### 3. Logic Hardening & Atomic Security
* **Encapsulation**: Refactor `GameLogic` to use private class fields or a stricter closure pattern to hide all internal helper functions (like `_resolve` or `_applyPity`) from the `window` object.
* **Audio Warmup**: In `audio.js`, add a **50ms silent lead-in** to the `playDenied()` buzz to ensure the Web Audio context fully initializes on mobile Safari before the sound triggers.

#### 4. Visual Balance & Accessibility (Epilepsy Safe Mode)
* **Pulse Suppression**: When `epilepsySafe` is active, disable the **Jackpot Amount pulse**, the **Robot Mascot chest-light**, and the **Power Core ambient glow**.
* **Storage Warning Timeout**: Modify the `#storage-warning` header badge to pulse for exactly 10 seconds after boot, then transition to a static, non-distracting state.

#### 5. Mathematical Validation & Regression Protection
* **RTP Simulation**: Include a simulation script (or an internal `GameLogic.verifyRTP()` method). Run **100,000 spins** and log the empirical Return-to-Player (RTP) to the console. Target: **92% ± 0.5%**.
* **Harness Integration**: Create a permanent `smoke-test.js` in the root directory that validates the balance conservation invariant: `Balance_End === Balance_Start - Total_Bets + Total_Payouts`.

**Output Requirement:** Provide full source code for all affected files and the `ai-use-log.md` entry. Every function must include JSDoc annotations.
