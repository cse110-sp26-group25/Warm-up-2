# Iteration 13 Plan: Logic Hardening & Mobile Layout Optimization

### Goals
- **Security & Integrity**: Move balance-checking and deduction logic from the UI layer (`ui.js`) into the `GameLogic` module to prevent client-side exploits.
- **Responsive Recovery**: Fix the chatbox compression and layout shifting observed on smaller viewports in the Iteration 13 recording.
- **UX Prominence**: Relocate achievement toasts to a more central, high-visibility area so they aren't missed during active play.
- **Session Continuity**: Implement a "Storage Warning" to notify players if they are in Incognito/Private mode where their data won't persist.

---

### Prompt Being Used

Keep the original prompt at `./OriginalPrompt.txt` as the authoritative specification. Use the **Iteration 13** codebase as the baseline. Focus strictly on layout stability and logic encapsulation.

**1. Encapsulate Balance Logic (gameLogic.js, ui.js)**
- **Refactor**: Move the "Insufficient Balance" guard from the UI click handler into `GameLogic.spin(bet)`.
- **Logic**: `GameLogic.spin` must now return a specific error code or `null` if `bet > balance`.
- **UI Update**: If the spin is rejected due to balance, trigger a "denied" mechanical sound and have ROBO quip: "Insufficient funds, unit. My charity module is currently disabled.".

**2. High-Visibility Achievement Toasts (styles.css, index.html)**
- **Relocation**: Move the `#toast-container` from the bottom-right corner to the top-center, overlaying the machine frame.
- **Visuals**: Update the slide animation in `styles.css` to "Drop Down" from the top. Ensure multiple toasts stack vertically without obscuring the Jackpot amount.

**3. Small-Screen Chatbox Fix (styles.css)**
- **Stability**: Set a `min-height: 180px` and `flex-shrink: 0` for the `.chat-mini` container to prevent the "compressed" look seen in the Iteration 13 recording.
- **Flex Layout**: Adjust `.panel-left` to use a `column` flex-direction that prioritizes the Mascot's visibility while allowing the chat history to scroll independently.

**4. Incognito Mode Detection (state.js, ui.js)**
- **Detection**: Use the existing `State.isStorageAvailable()` check at boot.
- **Warning**: If storage is blocked, add a "Memory Error" icon to the header and have the initial ROBO greeting change to: "SYSTEMS ONLINE. Memory circuits fried (Incognito Mode). Progress will be lost on exit.".

**5. "Fast Play" Logic (ui.js, state.js)**
- **Speed**: Wire the `fastPlay` setting to the reel animation. When active, reduce the Phase 1 spin duration and the Phase 2/3 settle times by 50% (targeting a ≈1.0s total cycle).
