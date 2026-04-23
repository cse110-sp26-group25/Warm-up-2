# Iteration 15 Review

## Query Data

| Category | Value / Description |
| :--- | :--- |
| **Input tokens** | 6.2K (Baseline + Hardening Prompt) |
| **Output tokens** | ~19,200 (13 code files + 1 log entry) |
| **Total tokens** | ~19207 |
| **Query time** | 31 minutes 7 seconds   |

## Iteration Information

| Category | Value / Description |
| :--- | :--- |
| **Number of files** | 18 |
| **Number of folders** | 1|
| **Lines of code** | ~5,977 total; ~438 net lines changed across 6 touched files |

## Observations

### Downsides

#### Frontend issues
- Lots of fucntions such as change of mood lighting has been taken out.
- The chat extends and pushes the ahcievements down. It should not do that it should be a scroll instead.
- Player's ranking number is not shown ansywhere. 
- There is not enough flahing lights.
- There is not enough animation upon winning.
- The user avatar is just a color and should be more interesting.
- The webpage has no background them picked from popular media.
- Audio can be louder.

#### Backend issues
- All the important logic (balance, payouts, RNG) runs in the browser, so technically a user could still mess with it using DevTools.
-  Some internal stuff in `GameLogic` (like reels and helper functions) is accessible when it probably shouldn’t be, which could lead to misuse.
-  The game logic directly reads and writes from `State`, which makes things harder to test or change later.
-  `GameLogic.spin()` returns two different kinds of objects (error vs result), which makes the code that uses it more complicated than it needs to be.
- The random system is solid, but it only controls randomness — it doesn’t stop someone from messing with other parts of the game.

### Upsides

#### Good frontend
- The pity payout bar has been removed. 
- Epilepsy mode is in place. It just sometimes hard to toggle on off.
- All the bets and payouts track correctly.

#### Good backend
- Better security (for a browser game): Moving the balance check into `GameLogic.spin()` was a really good fix — you can’t just bypass it from the console anymore.
- Everything happens in one place: Spins now handle deduction, payout, and updates all together, which avoids weird bugs where things get out of sync.
-  All the important numbers (payouts, reel sizes, etc.) are in one `CONFIG` object, which makes the code easier to tweak and read.
-  The way wins are calculated is clear and structured, which makes debugging and balancing the game much easier.
-  Using `crypto` + reseeding is honestly pretty solid for a browser game.
-  Using named rejection types makes it easy for the UI to know what went wrong without guessing.

## Notes for next iteration

1. Chat box pushes the achievements down as it grows, it would be better for achievements to come before chat.
2. Flashy lights are not flashy enough yet.
3. Add a themed background based on popular media? ***
4. Add comments and statements that pop up on screen upon winning.
5. Add coins falshed on screen upon winning.
6. Ranking of the User should be shown on screen at all times.
7. User avatar could be more interesting than just a color picked.
8. Lights should be flashing unless epilepsy mode is turned on.
9. There is no accessibility to change the contrast/ light mode dark mode.
10. Reduce how much internal logic is exposed from `GameLogic` so helper functions and reel data are not as easy to access directly.
11. Clean up the return value of `GameLogic.spin()` so success and rejection cases are easier to handle without extra branching.
12. Separate game logic from saved-state handling a little more so the code is easier to test and maintain.
13. Review whether all public methods in the backend really need to be public, and hide anything the UI does not truly need.
14.  Keep in mind that the backend still runs fully in the browser, so it can be made harder to exploit but not fully protected from DevTools tampering.
15. The RNG system is good for randomness, but it should not be treated as full security since other parts of the game can still be manipulated.
   
