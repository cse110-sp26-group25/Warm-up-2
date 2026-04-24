# Iteration 10 Review

## Query Data

| Category          | Value / Description |
| :---------------- | :------------------ |
| **Input tokens**  | 5.3k                |
| **Output tokens** | 61.1k               |
| **Total tokens**  | 66.4k               |
| **Query time**    | 9m 15s              |

## Observations:

### 1. Downsides

#### 1.1 Frontend issues

- The issue with the spin animation still persists, with inconsistent snapping that does not correspond to what was shown on the spin wheel
- There is still not enough vertical spacing between the bet options, spin button, and winnings box
- The payout table is not showing, players would have no idea how much they could win

#### 1.2 Backend issues

- Playtime timer never pauses when the tab is hidden, you could just have that tab open (not focused) to get the 60 minutes played achievement
- 4-of-a-kind jackpot pays $0 since jackpot isn't an entry in CONFIGS.PAYOUTS.FOUR
- There are two different spin counters `spinCount` and `playerStats.spins` keeping track of the same thing

### 2. Upsides

#### 2.1 Good frontend

- The site header covering part of the robot's dialogue box is now fixed with game layout padding being increased
- Favicon is implemented with the svg of the robot mascot
- The result display now has a dark background for readibility

#### 2.2 Good back end

- The wheels backwards spinning issue was fixed with a clamp `(startPos = Math.min(rawStart, finalPos - symH)`
- `chat.js` is now updated to include more self-depreciating statements against AI and insults the player, but it did it a little more subtlely than I liked?

## 3. Notes for next iteration:

- Fix the wheel snapping visual bug during wheel spins
- Add payout table to show possible payouts for different winnings
- Add vertical spacing between `.bet-controls`, `.power-core`, and `.winnings-display` inside `.machine-frame`
- Add jackpot to the CONFIGS.PAYOUTS entries
- Remove the redudant spin counters
