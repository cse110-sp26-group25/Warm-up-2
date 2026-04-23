# Iteration 08: Architectural Hardening & High-Fidelity UX Synchronization

## 1. Executive Summary & Goals
Iteration 08 is designated as the **"System Integrity & Fidelity"** phase. While Iteration 07 achieved a stable 5-reel visual grid, the internal data flow remains ephemeral. This iteration moves the project toward a **Centralized State Pattern**, enforces **Hard-Sync Audio Modeling**, and transforms the visual feedback loop from "Functional" to "Premium."

### High-Level Engineering Objectives:
* **Centralized Persistent State:** Unify `GameLogic`, `Achievements`, and `Leaderboard` under a single, robust `localStorage` synchronization layer to prevent data drift.
* **Audio Engine Dynamic Wiring:** Fully implement the Web Audio API `GainNode` logic to react in real-time to the "Master" and "Music" sliders in the Settings panel.
* **Physics-Based Visual Polish:** Introduce CSS-based motion blur and "staggered stop" physics to reels, and transform the spin button into a mechanical, multi-state "Robot Lever".
* **Semantic Structural Overhaul:** Execute a "Refactor-Only" pass on `index.html` to replace nested `div` elements with WAI-ARIA compliant semantic tags (`<main>`, `<section>`, `<aside>`).
* **Documentation & Safety:** Enforce 100% JSDoc coverage for internal private functions and implement `try-catch` safety wrappers for all browser API interactions.

---

## 2. Master Prompt (Iteration 08)

**Role:** You are a Senior Software Engineer specializing in high-performance browser-based gaming and state management.

**Context:** Reference `OriginalPrompt.txt` for personas and the "Medically Sound" payout logic. Use the provided Iteration 07 codebase as the authoritative source.

**Mission:** Perform a comprehensive system hardening of the current codebase. You must provide the full, updated source code for all affected files to ensure integration stability.

### Technical Requirement A: Centralized Persistence Manager
* **Refactor `achievements.js` and `gameLogic.js`:** Instead of isolated local storage calls, create a centralized `State` object that synchronizes `totalWinnings`, `spinCount`, `pityMeter`, `unlockedAchievements`, and `playerStats`.
* **Initialization Logic:** On page load, the system must perform a "Deep Load." If existing stats are detected, the `Chat.js` module must trigger a custom humorous "Welcome Back" greeting from the robot mascot.

### Technical Requirement B: Audio-Visual Synchronization
* **Real-Time Gain Mapping:** In `audio.js`, the `_masterGain` and `_musicGain` must be dynamically updated via exported methods called by the UI sliders.
* **High-BPM Background Loop:** Refactor the robotic arpeggio loop to be a true "High-BPM" ambient track that does not stutter when other sound effects trigger.
* **Motion Blur Filters:** In `styles.css` and `ui.js`, implement a dynamic CSS `blur()` filter that activates only during the `spinning` state. Reels should appear to blur vertically based on the velocity of the scroll.

### Technical Requirement C: The "Robot Lever" UI
* **Button-to-Lever Transition:** Redesign the central `spin-btn`. It should visually resemble a mechanical lever with a physical "throw" animation. Use CSS `:active` and `:hover` states to simulate mechanical depth and haptic feedback.
* **Interactive Robot Reactions:** Add at least 5 new "Fidget Interactions." Clicking different parts of the SVG robot (Antenna, Chest Panel) should trigger unique CSS animations and Chatbot quips.

### Technical Requirement D: Engineering Standards & Documentation
* **Semantic Refactor:** Remove the "Div Slop" from `index.html`. Use `<main>`, `<header>`, `<section>`, and `<nav>` to structure the machine frame and panels.
* **Strict JSDocs:** Every function, including internal helper functions (e.g., `_buildStrip`, `_resolve`), must have JSDoc blocks with `@description`, `@param`, and `@type` annotations.
* **Constants Standardization:** Move all "Magic Numbers" (RTP rates, blur strengths, animation durations) into a `const CONFIG` object at the top of `gameLogic.js`.

---

## 3. Prompt Adjustments & Rationale
* **Persistence Focus:** Shifted from "Save Score" to "Continuous State" to address the core "Downside" that the game resets on refresh.
* **Audio Logic Upgrade:** Previous iterations focused on "having sound"; this iteration focuses on "controlling sound" via proper Web Audio API GainNode management.
* **UX Fidelity:** Based on the Iteration 7 Review, the "Feel" of the spin is too static. Adding motion blur and physics-based "overshoot" stops is required for a "Significantly Better" game.
* **Structural Refactor:** Explicitly requiring a shift to semantic HTML tags to meet the "Software Engineering Standards" of the lab, moving away from the excessive `<div>` architecture seen in Iteration 7.

---

## 4. Evaluation Metrics for Iteration 08
* **State Integrity:** Does refreshing the browser retain the exact winnings and achievement status?
* **Audio Responsiveness:** Does moving the "Master Volume" slider immediately affect the volume of an active spin sound?
* **Code Maintainability:** Can a new developer identify the "Pity Threshold" or "Jackpot Growth Rate" within 10 seconds by looking at the `CONFIG` object?
* **Visual Engagement:** Does the "Motion Blur" significantly reduce the visual "flicker" of the reels during high-speed spins?
