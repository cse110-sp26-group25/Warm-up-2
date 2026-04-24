# Iteration 18 Plan

## Overview

Iteration 18 focuses on improving the usability, responsiveness, and accessibility of the slot machine notification system introduced in Iteration 17. While the previous iteration successfully implemented toast prioritization and batching behavior, several issues were identified during review and testing that negatively affected the user experience.

This iteration aims to refine the toast system by improving accessibility behavior for high-priority notifications, reducing unnecessary delays for achievement notifications, and preserving toast timing consistency when notifications are interrupted by higher-priority events.

---

## Goals

### 1. Improve Accessibility for High-Priority Notifications

Currently, all toast notifications use the same accessibility role behavior. This causes jackpot notifications to be treated similarly to low-priority informational messages by screen readers.

This iteration will:

- use role="alert" for jackpot notifications
- preserve role="status" for standard informational notifications
- improve screen reader urgency and accessibility feedback for important events

---

### 2. Reduce Delay for Achievement Notifications

The current batching implementation delays even the first achievement notification while waiting for additional notifications to merge.

This iteration will:

- immediately display the first achievement notification
- continue batching additional achievement notifications that appear shortly afterward
- improve responsiveness while preserving batching behavior

---

### 3. Preserve Remaining Toast Duration During Preemption

When a high-priority toast interrupts a lower-priority toast, the interrupted toast currently restarts with its full duration after being restored.

This iteration will:

- track the remaining display duration of interrupted toasts
- restore interrupted notifications using their remaining time
- create more consistent and natural notification timing behavior

---

### 4. Improve RTP Certification Validation Feedback

The RTP certification validation currently does not warn when config_fingerprint values are missing.

This iteration will:

- add a warning when config_fingerprint is null
- improve debugging visibility for stale or incomplete certification states

---

## Expected Outcome

By the end of Iteration 18, the slot machine notification system should feel more responsive, accessible, and polished while maintaining compatibility with the existing architecture introduced in Iteration 17.
