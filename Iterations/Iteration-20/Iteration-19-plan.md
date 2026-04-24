# Iteration 19 Plan: Feature Completion & Engine Validation

### Goals
* **Mathematical Truth**: Finalize the payout table reconciliation to hit the 92% Total RTP target (87% Base + 5% Jackpot contribution) using a 3-million-spin internal validation gate.
* **Tactile Feedback**: Implement the "Big Win" screen-shake and "Coin Fountain" particle system to provide high-intensity visual rewards for 4-of-a-kind and Jackpot hits.
* **Immersive Luck UX**: Complete the transition from "Pity Meter" to "Luck Warmup." Implement the non-linear neon-orange pulsing that accelerates as the threshold nears.
* **Layout Finalization**: Reorder the left panel (Achievements above Chat) and implement a persistent player rank badge on the machine frame.
* **Security Sealing**: Convert internal `GameLogic` helpers into strict private closure-scoped functions to prevent any browser-console manipulation of spin outcomes.

---

### Master Prompt for Iteration 20

**Role:** Lead Software Engineer & UX Architect.

**Contextual Anchor:**
1.  Use **OriginalPrompt.txt** as the "Constitutional" authority.
2.  Use the **Iteration 16/Current codebase** as the functional baseline.
3.  Reference **ai-use-log.md** to maintain continuity for the 20-entry minimum.

**Mission:** Execute the "Feature Complete" phase. This iteration must bridge the gap between a hardened prototype and a polished game engine.

#### 1. The 92% RTP Reconciliation (Crucial)
* **Payout Tuning**: Adjust the `PAYOUTS` table in `gameLogic.js` to hit exactly **87% Base-Game RTP**. (Note: The pity mechanic contributes ~10-15pp; tune tiers FOUR and TWO carefully to compensate).
* **Validation Gate**: Update `GameLogic.verifyRTP()` to run **3,000,000 spins** by default. Gate the `withinTarget` boolean strictly on the Base-Game RTP at **87% ± 0.5%**. 
* **Harness**: Update `smoke-test.js` to use a deterministic Mulberry32 PRNG to verify these new mathematical invariants.

#### 2. Immersive Visuals & "Luck Warmup"
* **Luck Indicator**: Remove all "PITY" text. Map `pityMeter` to `.luck-node` elements. Transition colors: **Dull Grey (#90a4ae) → Glowing Neon Orange (#ff9100)**. 
* **High-Tension Pulse**: Implement a `.lk-pulse-fast` CSS animation that triggers when the player is within 2 spins of a guaranteed match.
* **Win FX**: In `ui.js`, implement `_triggerBigWinFX()`. This must include a **Screen Shake** on the `#machine-frame` and a **Coin Fountain** (2D particle eruption) for any win > 50x bet.

#### 3. UI Architecture & Widget Reorder
* **Hierarchy Fix**: Swap the order of the left-panel widgets in `index.html`: Achievements must appear *above* the Chat log.
* **Rank Visibility**: Add a `#player-rank-badge` to the machine frame UI. Ensure it updates in real-time whenever `Leaderboard` events fire.
* **Toast Queue**: Enforce a limit of 3 toasts. Use a "First-In-First-Out" logic to ensure new achievements displace the oldest ones gracefully.

#### 4. Logic Hardening & Accessibility
* **Closure Encapsulation**: Move `_resolve`, `_applyPity`, and `_weightedPickSymbol` into the module closure so they are `undefined` when accessed via `GameLogic` in the console.
* **Epilepsy Safe Mode**: Harden the toggle to ensure the new Coin Fountain, Screen Shake, and Luck Pulsing are entirely disabled when active.
* **Storage Timeout**: Ensure the `#storage-warning` badge stops pulsing and goes static (opacity 0.6) exactly 10 seconds after boot.

**Output Requirement:** Provide full source code for all affected files and the `ai-use-log.md` entry. Every function must include JSDoc annotations.
