# Iteration 09: Modular Decomposition & Performance Optimization

## 1. Executive Summary & Goals
Iteration 09 focuses on **Architectural Scalability** and **UX Fluidity**. While Iteration 08 successfully centralized the state, it resulted in a monolithic `ui.js` (1000+ LOC) and introduced performance bottlenecks on specific browsers. This phase will decompose the UI into maintainable sub-modules, optimize animation performance for cross-browser parity, and introduce a "Compact Mode" to address feedback regarding spin duration.

### High-Level Engineering Objectives:
* **UI Module Decomposition:** Split the monolithic `ui.js` into `uiReels.js`, `uiPanels.js`, and `uiMascot.js` to improve maintainability and prevent "file bloat".
* **Cross-Browser Performance:** Replace the SVG-only motion blur with a hybrid CSS `transform` and `opacity` system to ensure smooth 60fps performance on Firefox and Safari.
* **Schema Migration Engine:** Implement a versioned migration layer in `state.js` to allow for future data transformations without resetting user progress.
* **"Compact Mode" Implementation:** Introduce a user-toggleable fast-play setting that reduces spin duration from ~2.1s to ~1.2s.
* **Refinement & Safety:** Correct the double-increment bug in the pity-counter and add UI warnings for players in private browsing modes.

---

## 2. Master Prompt (Iteration 09)

**Role:** You are a Senior Software Engineer specializing in modular architecture and high-performance web animations.

**Context:** Use the Iteration 08 codebase as the authoritative baseline. Maintain the "Robot Mascot" persona and strict Rust-inspired engineering practices (no `unwrap`, handle all edge cases).

**Mission:** Perform a modular refactor of the UI and optimize the game loop for speed and cross-browser stability.

### Technical Requirement A: UI Module Decomposition
* **Segregate `ui.js`:** Break the file into logical modules:
    * `uiReels.js`: Handles reel animations, blur states, and staggered stops.
    * `uiPanels.js`: Manages Settings, Leaderboards, and Achievements.
    * `uiMascot.js`: Logic for the "Robot Lever" and SVG fidget animations.
* **Dependency Management:** Ensure clean communication between modules via the central `State.js` API.

### Technical Requirement B: Animation & Performance Tuning
* **Hybrid Motion Blur:** Develop a CSS-based vertical blur (using `transform: scaleY` or layered shadows) that replaces the SVG filter for better performance in non-Chromium browsers.
* **Power Core Cleanup:** Reduce the visual "noise" of the Power Core pulses. Epilepsy-safe mode must now explicitly disable the ring-pulse animation.

### Technical Requirement C: Pacing & Persistence
* **Compact Mode Toggle:** Implement a "Fast Play" setting in the UI. When enabled, reduce staggered stop intervals (e.g., 250ms → 100ms) for a ~1.2s total cycle.
* **State Migration:** Add a `migrate()` function to `state.js` that handles `STORAGE_KEY` versioning.
* **Graceful Degradation:** Detect if `localStorage` is blocked (private browsing) and trigger a one-time Chatbot warning about progress loss.

---

## 3. Evaluation Metrics for Iteration 09
* **File Maintainability:** Is `ui.js` successfully decomposed into files under 400 lines?
* **Performance Parity:** Does the motion blur maintain 60fps in Firefox?
* **Logic Accuracy:** Is the pity-meter incrementing exactly once per spin?
* **User Control:** Does "Compact Mode" significantly improve the "feel" of session speed?
