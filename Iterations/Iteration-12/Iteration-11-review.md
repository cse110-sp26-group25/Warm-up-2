# Iteration 11 Review

## Query Data

| Category          | Value / Description |
| :---------------- | :------------------ |
| **Input tokens**  | 6.4k                |
| **Output tokens** | 87k                 |
| **Total tokens**  | 93.4k               |
| **Query time**    | 10m 3s              |

## Observations:

### 1. Downsides

#### 1.1 Frontend issues

- The wheel spin still snaps to an outcome that does not correspond to what was shown on the spin wheel before the snap
- No clear pity progress bar indicator, and there's just a bar sitting under the wheels with no label to explain what it represents
- The chatbox under the robot mascot is too short
- Too much visual imbalance on the right side, achievements should be moved to the left panel

#### 1.2 Backend issues

- There is currently no balance system, which is not realistic and allows infinite free spins
- The jackpot pool never actually distributed correctly, with them still being 0 in the entries
- Bot leaderboard scores grow forever with no cap, which will eventually produce unrealistically large numbers
- The `PITY` text label is missing from the pity bar HTML

### 2. Upsides

#### 2.1 Good frontend

- The payouts table is correctly implemented as a tab in the top navigation
- The pity bar is visible, correctly positioned below the reels, and the color transition from green to yellow to red is working as intended

#### 2.2 Good back end

- The reel animation overhaul was implemented correctly with proper ease-out curve and overshoot bounce, replacing the old CSS-transition approach
- The playtime timer now correctly pauses when the browser tab is hidden and resumes when the tab regains focus

## 3. Notes for next iteration:

- Fix the reel snap after the wheel animation settles, the strip should visually land on the correct symbol without any final jump.
- Add a text label next to the pity progress bar so players understand what the bar represents
- Increase the height of the chatbox under the robot mascot so more message history is visible at once
- Move the achievements widget from the right panel to the left panel to reduce the visual weight imbalance between the two sides
- Add a credit/balance system: give the player a starting balance, deduct the bet amount on each spin, and disable the spin button when the balance is insufficient. Display the current balance prominently on the machine frame
- Add a cap to bot leaderboard score growth so bots cannot accumulate unrealistically large totals over a long session
- Fix the jackpot pool payout bug
