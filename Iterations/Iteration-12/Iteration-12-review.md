# Iteration 12 Review

## Query Data

| Category          | Value / Description |
| :---------------- | :------------------ |
| **Input tokens**  | 6.4k                |
| **Output tokens** | 132.5k              |
| **Total tokens**  | 126.1k              |
| **Query time**    | 14m 25s             |

## Observations:

### 1. Downsides

#### 1.1 Frontend issues

- The chatbox is completely compressed on smaller screens, though it works fine on larger screens
- The achievement toast appears in the bottom-right corner, which is too far out of the way to be noticeable during active play

#### 1.2 Backend issues

- The balance deduction logic lives in `ui.js` rather than inside `GameLogic` — a developer could call `GameLogic.spin(1000)` from the console with a low balance and bypass the check entirely

### 2. Upsides

#### 2.1 Good frontend

- Wheel animation snapping is now fixed — phases 2 and 3 (overshoot and settle) correctly use CSS transitions instead of continuing the rAF loop, eliminating the visual jump
- A "PITY" label now appears next to the pity progress bar
- Achievement toasts appear correctly whenever the player unlocks an achievement
- The spin button is correctly disabled whenever the balance is insufficient for the currently selected bet

#### 2.2 Good back end

- Jackpot payout is fixed — all jackpot hits (3-, 4-, and 5-of-a-kind) now correctly pay out and reset the pool
- The balance system is correctly implemented with per-spin deduction and payout crediting
- Bot leaderboard scores are now capped so they cannot grow unboundedly over a long session
- Player leaderboard rank updates automatically when bots tick past the player during idle, not only on the next spin

## 3. Notes for next iteration:

- Fix the chatbox layout on smaller screens so it does not get compressed or overflow its container
- Move the achievement toast to a more visible location and consider showing it near the result display or above the machine frame instead of the bottom-right corner
- Move balance deduction logic into `GameLogic.spin()` so the balance guard cannot be bypassed from the console
