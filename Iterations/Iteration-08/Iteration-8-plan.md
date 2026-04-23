# Iteration 08: System Hardening & Professional UX Refinement

## 1. Goals and Objectives
The objective of Iteration 08 is to transition the "ROBO-SLOTS 3000" from a functional prototype into a production-grade software application. This iteration focuses on **Persistence, Architectural Integrity, and High-Fidelity Feedback Loops**. We are moving away from simple feature additions toward "System Hardening" to ensure the project meets the "Software Engineering Quality" criteria defined in the lab manual.

### Primary Objectives:
* **State Persistence:** Implement a full-stack simulation using `localStorage` to ensure the "User Experience" is not reset on refresh (crucial for User 5/Joe and User 3/Steven).
* **Advanced Motion Graphics:** Replace the "flicker" spin with a high-performance CSS-filtered motion blur to simulate mechanical speed.
* **Hardware-Software Sync:** Bridge the logical gap between the UI Settings (Sliders) and the Web Audio API (Engine).
* **Semantic Integrity:** Perform a "Standardization Pass" to eliminate "Div Slop" and enforce HTML5 semantic standards for accessibility.
* **Documentation Excellence:** Enforce 100% JSDoc coverage to satisfy the "Readability" and "Appropriate Use" grading rubrics.

---

## 2. Master Prompt (Iteration 08)

**Role:** You are a Senior Frontend Engineer specializing in Psychological UX and High-Performance Web Applications.

**Context:** Reference the `OriginalPrompt.txt` as the authoritative specification for personas and math logic. Use the Iteration 07 codebase as the baseline. We are in the final "Hardening" phase before the 11:59 PM project deadline.

**Mission:** Execute a comprehensive refactor of Iteration 07 to implement persistence, fix interaction debt, and enforce strict Software Engineering standards.

**Detailed Requirements:**

### A. Persistence & State Management
* **LocalStorage Integration:** Create a `PersistenceManager` module. Save the following to `localStorage`: `currentBalance`, `totalSpins`, `accumulatedJackpot`, and the `unlockedAchievements` array.
* **Session Restoration:** Upon initialization, the game must check for existing data. If found, the "Robot Mascot" should provide a contextual, humorous comment about "restoring the player's digital debt" or "remembering their previous failures."

### B. High-Fidelity UX & Animation
* **The Mechanical Lever:** Redesign the 'SPIN' button. It must no longer be a static circle. Style it as a 3D-effect mechanical lever or a glowing "Power Core." It must include `:active` and `:hover` states with distinct CSS transitions.
* **Motion Blur Reels:** During the `spin` state, apply a `filter: blur(4px)` and `transform: translateY` animation to the reel icons to simulate a high-speed mechanical roll. The stop must be staggered (left to right) with a "bounce" effect (overshoot) to mimic physical momentum.

### C. Audio-Engine Synchronization
* **Gain Node Control:** Refactor `audio.js` to utilize the **Web Audio API**. Connect the 'Master Volume' and 'Music Volume' sliders in the settings menu to the `GainNode`. 
* **Ambient Soundscape:** Ensure background music is looped seamlessly and does not restart or stutter when menus are opened.

### D. Software Engineering Standards (Non-Negotiable)
* **Semantic HTML5:** Replace at least 60% of nested `<div>` elements with semantic tags: `<main>` for the machine, `<section>` for stats/leaderboards, `<aside>` for the chat, and `<nav>` for the header tabs.
* **JSDoc Documentation:** Every single function across all `.js` files must include a JSDoc block with `@description`, `@param` (with types), and `@returns`. 
* **Zero Magic Numbers:** Create a `Config` object in a separate file or at the top of `gameLogic.js` containing `STARTING_BALANCE`, `REEL_DELAY`, `BLUR_STRENGTH`, and `PAYOUT_RATES`. No raw numbers should exist in the logic.
* **Error Handling:** Implement `try-catch` blocks around the `localStorage` and `AudioContext` initializations to prevent the app from crashing on restricted browsers.

---

## 3. Prompt Adjustments & Rationale
* **Why Persistence?** Previous iterations were "ephemeral." To simulate a real casino (Domain Knowledge), the player's history must matter. This satisfies the "Trust Fund Steven" persona who values his ranking over time.
* **Why Semantic HTML?** Rule 3.5 explicitly forbids "excessive div usage." This iteration is a direct response to the "Div Slop" identified in the Iteration 7 review.
* **Why JSDocs now?** As the code grows to 10+ files, manual readability is dropping. JSDocs are required to maintain the "as if one person wrote the whole thing" goal.
* **Why Motion Blur?** Based on "Psychology of Slot Machines" research, the visual satisfaction of the "Near-Miss" is dependent on the perceived speed of the reels.

---

## 4. Expected Learning Outcomes (For FINAL-REPORT.md)
* Observe how the transition from "feature-building" to "refactoring" affects the stability of the AI-generated code.
* Measure the difficulty of maintaining "Contextual Awareness" in the Chatbot after changing the underlying HTML structure.
* Evaluate if the AI can successfully manage state across multiple sessions without manual "Hand-editing" of the `localStorage` logic.

---

## 5. Execution Steps
1.  Initialize a fresh Claude 3.5 Sonnet session.
2.  Provide the `OriginalPrompt.txt` as the "Constitutional" instruction.
3.  Upload the Iteration 07 source code.
4.  Execute the Iteration 08 Master Prompt.
5.  Validate the output in "Live Server" before committing to the repository.
