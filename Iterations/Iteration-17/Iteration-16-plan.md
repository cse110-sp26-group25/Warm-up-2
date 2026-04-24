# Iteration 16 Plan

### Goals
#### UI / Frontend
1. Toast Notification Priority
Implement a priority-based toast queue instead of simple FIFO replacement.
Define priority tiers (e.g., Jackpot > Big Win > Bonus > Achievement).
Ensure lower-priority toasts are queued instead of immediately discarded.
Allow queued toasts to appear after visible toasts expire.
1. Toast Flooding During Jackpot Sequences
Add event grouping/batching for rapid events.
Combine similar notifications (e.g., “3 Achievements Unlocked”) into a single toast.
1. Mid-Range Tablet Layout Conflict (780px–1100px)
Ensure toast container dynamically offsets from header height.
Add responsive CSS rules for tablet breakpoints.
Prevent toast/header overlap during orientation changes.
1. Orientation and Resize Handling
Add a resize/orientation listener that recalculates header height.
Update toast container position dynamically when viewport changes.

#### Backend / Logic Issues
1. RTP Verification Boot Delay
Remove verifyRTP() from the immediate boot sequence.
Run RTP verification in one of the following instead:
build/deployment step
background worker
server-side validation
1. Large Simulation Runtime
Optimize spin simulation by:
batching spins
allowing early exit when RTP confidence interval stabilizes
optionally reducing runtime verification frequency.
1. Jackpot RTP Variance
Separate base-game RTP validation from jackpot RTP.
Validate jackpot contribution using expected value math rather than relying on simulation hits.

#### System Architecture Improvements
1. RTP Certification Storage
Store a verified RTP configuration file generated during testing or build.
Load this configuration at runtime instead of recalculating.
1. Asynchronous Validation (Optional)
Run RTP verification asynchronously after the game loads.
Log results for debugging or analytics instead of blocking startup.


# Master prompt for iteration 17:

You are acting as a **senior game systems engineer** tasked with refactoring and improving a browser-based slot machine game's architecture. The goal is to resolve UI issues, improve performance, and stabilize RTP validation without introducing regressions.

Your output should produce **fully implemented modules and code changes**, not just conceptual advice.

Follow these engineering rules:

• Preserve existing gameplay functionality
• Avoid blocking the main UI thread
• Prefer modular and maintainable code
• Use clear comments explaining new systems
• Assume a modern browser environment (ES6+, CSS variables supported)
• Any heavy computation must run **off the main thread**

Organize your response in the following sections:

1. Architecture Overview
2. New / Modified Modules
3. UI System Improvements
4. Backend / Simulation Improvements
5. RTP Certification System
6. Example Integration
7. Performance Considerations

---

## SYSTEM CONTEXT

This is a browser-based slot machine game with:

• toast-based notifications
• jackpot events
• achievement events
• RTP simulation verification
• a responsive UI layout

The current implementation has several performance and architecture problems that must be corrected.

---

## UI / FRONTEND ISSUES

### 1. Toast Notification Priority System

Current behavior:

* Maximum 3 visible toasts
* FIFO replacement
* Important notifications can be lost during jackpot sequences

Replace the current system with a **priority-based toast queue**.

Requirements:

• Maximum **3 visible toasts**
• Additional toasts must be **queued**
• Define priority tiers:

Priority 4 — Jackpot
Priority 3 — Big Win
Priority 2 — Bonus Trigger
Priority 1 — Achievement

Rules:

• If queue is full and a higher-priority toast arrives, replace the **lowest-priority visible toast**
• Lower-priority toasts must be **queued instead of discarded**
• When a toast expires, display the **next queued toast**

Implement a reusable **ToastManager module**.

Provide:

• toast queue data structure
• priority handling logic
• expiration handling
• example usage

---

### 2. Notification Flood Protection

Jackpot cascades can generate excessive notifications.

Implement **event batching logic**.

Behavior:

If multiple identical notifications occur within a short time window (ex: 2 seconds), they should be grouped.

Example transformation:

Instead of:
Achievement unlocked
Achievement unlocked
Achievement unlocked

Display:

"3 Achievements Unlocked"

Requirements:

• configurable batching window
• do not batch jackpot notifications
• system must integrate with the ToastManager

---

### 3. Mid-Range Tablet Layout Conflict (780px–1100px)

Toast container currently overlaps the header.

Fix the layout so the toast container dynamically offsets from the **actual header height**.

Requirements:

• use CSS variable `--header-height`
• toast container position must be:

top: calc(var(--header-height) + spacing)

• responsive adjustments for 780px–1100px
• maintain centered layout

Provide:

• updated CSS
• explanation of layout approach

---

### 4. Orientation / Resize Handling

Header height changes during orientation changes.

Implement a lightweight system that:

• listens for `resize` and `orientationchange`
• recalculates header height
• updates the CSS variable `--header-height`

Avoid layout thrashing.

---

## BACKEND / GAME LOGIC ISSUES

### 5. RTP Verification Boot Delay

Current system runs:

verifyRTP(3,000,000 spins)

during boot which causes a **3–5 second delay**.

Refactor so RTP verification **does not block startup**.

Implement one of the following:

• Web Worker simulation
• Build-time verification script
• server-side verification

Preferred solution:

**Build-time RTP verification + runtime certification loading**

Game should start immediately.

---

### 6. Simulation Runtime Optimization

Improve the RTP simulation engine.

Requirements:

• spin batching
• early termination when confidence interval stabilizes
• ability to configure sample size

Example target:

Instead of 3,000,000 spins in a single loop,
run:

300k spins × 10 batches

Stop early if variance stabilizes.

---

### 7. Jackpot RTP Variance

Jackpots introduce extreme variance due to rare events.

Refactor RTP validation:

• **Base RTP** validated via simulation
• **Jackpot RTP** validated via expected value math

Formula:

jackpot_RTP = jackpot_probability × jackpot_payout

Avoid relying on simulation to validate jackpot RTP.

---

## SYSTEM ARCHITECTURE IMPROVEMENTS

### 8. RTP Certification System

Create a build step that generates:

rtp_certification.json

Example format:

{
"base_rtp": 0.957,
"jackpot_rtp": 0.012,
"total_rtp": 0.969,
"sample_size": 50000000,
"verified_at": "<timestamp>"
}

At runtime the game should:

• load this file
• verify configuration
• skip runtime RTP simulation

---

### 9. Optional Asynchronous Validation

Provide an optional **background verification worker** that can run after the game loads.

Requirements:

• must not block gameplay
• logs results for debugging
• optional feature flag

---

## EXPECTED OUTPUT

Your response must include:

1. Full **ToastManager module implementation**
2. **Notification batching system**
3. Updated **responsive CSS**
4. **Resize/orientation handler**
5. **Web Worker RTP simulation example**
6. **Build-time RTP verification script**
7. Example **rtp_certification.json**
8. Integration example with the slot engine
9. Explanation of architectural decisions

All code should be **production-ready JavaScript/CSS** with clear comments.

Avoid partial snippets.
Provide complete modules where possible.
