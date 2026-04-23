# Iteration 14 Review

## Query Data

| Category | Value / Description |
| :--- | :--- |
| **Input tokens** | ~15,500 (Baseline + Hardening Prompt) |
| **Output tokens** | ~19,200 (13 code files + 1 log entry) |
| **Total tokens** | ~34,700 |
| **Query time** | 28 minutes (Across three Claude generation cycles) |

## Iteration Information

| Category | Value / Description |
| :--- | :--- |
| **Number of files** | 14 (13 code files + 1 log entry) |
| **Number of folders** | 1 (`Iterations/Iteration-14/slot-machine/`) |
| **Lines of code** | ~5,100 total; ~690 net lines changed across 6 touched files |

## Observations

### Downsides

#### Frontend issues
- **Viewport Collisions**: The top-center toast location clears the jackpot figure, but on mid-range screens (780px to 1100px), it may briefly overlap the reels.
- **Animation Fatigue**: The new `#storage-warning` badge pulses continuously. Combined with the mascot and jackpot pulses, there are now four simultaneous pulsing elements.
- **Audio Clipping**: The mechanical "denied" buzz is very short (~240ms); on slower audio contexts like mobile Safari, the first pulse can occasionally get trimmed.

#### Backend issues
- **Result Schema**: `GameLogic.spin()` now returns a union of two different shapes (rejection vs. result), which makes JSDoc typing somewhat verbose.
- **DOM Stale Frame**: There is a single-frame window where the DOM balance label is stale after a win before `ui.js` calls the update function.
- **Fast Play Scaling**: While blur feels proportionally correct, it currently lifts earlier in Fast Play mode because it is scaled by a fraction rather than an absolute time constant.

### Upsides

#### Good frontend
- **Focal Point Toasts**: Achievement toasts now drop down directly into the player's focal region on the machine frame, ensuring they aren't missed.
- **Responsive Stability**: New CSS flex constraints prevent the chatbox from collapsing on smaller viewports, making the game fully playable on laptops.
- **Incognito Signaling**: The `#storage-warning` header badge provides a clear, glance-able signal to private-mode users without blocking gameplay.
- **True Fast-Play**: By scaling all phases (spin, overshoot, settle) by 50%, the total cycle is now a crisp ≈1.0s.

#### Good backend
- **Security Hardened**: The console-bypass vulnerability is closed. `GameLogic.spin()` now authorizes the balance before any state mutation occurs.
- **Atomic Transactions**: Both deduction and credit are handled in a single function call, preventing "split-brain" state errors.
- **Enums for Rejections**: Rejection reasons use a frozen `REJECT` enum, allowing the UI to handle different error states via named constants.
- **Conservation Verified**: A 100-spin simulation confirmed that the balance math (Start - Bets + Payouts) matched to the penny.

## Notes for next iteration

1. **Toast Queue Cap**: Limit visible toasts to 3 to prevent vertical stacking from pushing past the jackpot display.
2. **Regression Harness**: Promote the smoke-test script to a permanent file in the repo to prevent future balance math regressions.
3. **Audio Warmup**: Add a 50ms silent lead-in to `playDenied()` to ensure mobile browsers don't trim the sound.
4. **Storage Warning Polish**: Consider stopping the warning pulse after 10 seconds to reduce persistent visual distraction.
5. **RTP Verification**: Execute a 100k-spin simulation to confirm the 92% target RTP empirically.
