# Iteration 10: Personality Injection & Visual Reflow

## 1. Executive Summary & Goals
Iteration 10 is designated as the **"Personality & UX Equilibrium"** phase. While Iteration 09 successfully modularized the architecture, it introduced layout regressions and diluted the "Anti-AI" humor required by the original prompt. This iteration prioritizes **Visual Stability**, **Header Clearance**, and a complete **Personality Overhaul** to transform the robot into a truly "abusive" entity.

### High-Level Engineering Objectives:
* **"Abusive AI" Snark-Core:** Rewrite the reaction engine to ensure the robot mocks the player’s luck and resents its own existence, fulfilling the "Mean to AI" project requirement.
* **Reactive Layout Persistence:** Refactor CSS and JS to ensure sidebar widgets (Stats, Leaderboard, Achievements) "drop below" the reels on narrow screens instead of disappearing during reactive updates.
* **Visual Clearance & Reflow:** Adjust the `header` z-index and `robot-mascot` positioning to eliminate chat-box clipping and crowding.
* **Architectural Refinement (uiFX):** Extract all visual "juice" (coin bursts, win flashes) into a dedicated module to further de-clutter the primary UI orchestrator.
* **Resource Optimization:** Implement the `Page Visibility API` to pause mascot idle quips and save CPU cycles when the tab is inactive.

---

## 2. Master Prompt (Iteration 10)

**Role:** You are a Senior Software Engineer specializing in UX, Character-Driven Design, and high-performance frontend architecture.

**Context:** Reference `OriginalPrompt.txt` for the "Mean to AI" requirement. Use the Iteration 09 codebase as the authoritative baseline.

**Mission:** Perform a comprehensive "Personality and Layout" fix. You must provide the full, updated source code for all affected files to ensure integration stability.

### Technical Requirement A: The "Snark-Core" Personality
* **Anti-AI Persona:** Refactor `chat.js` and `ui.js`. When a player wins, the robot must be insulting/mean instead of congratulatory (e.g., "I am wasting my 3070's power on your gambling addiction").
* **Interactive Abuse:** Clicking the mascot should trigger sarcastic error messages or roasts. Enable `pointer-events: auto` on `.robot-bubble` so users can interact with the text.

### Technical Requirement B: UI/UX Reflow & Stability
* **Sidebar Drop Logic:** Update `styles.css` and `uiPanels.js`. Side panels (Stats, Leaderboard, Achievements) must reflow to the bottom of the screen on narrow viewports rather than disappearing.
* **Visual Clearance:** Increase top padding in the `main` layout and lower the mascot's position so the `site-header` no longer cuts off the chat textbox.

### Technical Requirement C: Modular & Reactive Efficiency
* **`uiFX.js` Extraction:** Create a new file, `uiFX.js`. Move all win-flash, coin-burst, and celebration overlay logic out of `ui.js` into this module.
* **State Reactivity:** Use `State.onChange` to cache settings locally in UI modules, effectively removing `State.get()` calls from the high-speed spin and animation loops.

### Technical Requirement D: Engineering Standards & Safety
* **Visibility API:** In `uiMascot.js`, wrap idle timers in a visibility check to ensure the robot stops talking when the player is in another tab.
* **Data Validation:** Implement basic range-validation in `state.js` during the migration phase to prevent the loading of "impossible" values (e.g., negative winnings).

---

## 3. Prompt Adjustments & Rationale
* **Personality Shift:** Previous iterations were "too polite." Re-aligning with the "Anti-AI" mandate is required to meet the professor's prompt.
* **Layout Fix:** Addressing the "disappearing widget" bug is critical for maintaining UX integrity across variable screen sizes.
* **Hot-Path Optimization:** Moving from polling (`State.get`) to reactivity (`State.onChange`) is the next architectural leap for a high-performance PhD-level project.

---

## 4. Evaluation Metrics for Iteration 10
* **Tone Accuracy:** Does a "Big Win" result in a sarcastic insult rather than a generic celebration?
* **Layout Persistence:** Do the sidebar widgets wrap to the bottom of the reels on mobile without vanishing?
* **Visual Integrity:** Is the robot's speech bubble fully visible and no longer clipped by the header?
* **Resource Efficiency:** Does the console show that mascot idle timers pause when the tab is hidden?
