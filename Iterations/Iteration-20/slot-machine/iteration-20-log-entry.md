# Iteration 20 Review

## Query Data

| Category | Value / Description |
| :--- | :--- |
| **Input tokens** | _(fill in)_ |
| **Output tokens** | _(fill in)_ |
| **Total tokens** | _(fill in)_ |
| **Query time** | _(fill in)_ |

## Iteration Information

| Category | Value / Description |
| :--- | :--- |
| **Number of files** | 17 (16 code files + 1 log entry) |
| **Number of folders** | 1 (`Iterations/Iteration-20/slot-machine/`) |
| **Lines of code** | 8,580 total across the bundle; ~350 net lines added (tactile-feedback stack + rank badge), mostly in `ui.js` and `styles.css`; `gameLogic.js` unchanged except for a restamped header |

## Observations

### Downsides

#### Frontend issues

- The screen-shake keyframe composites alongside the existing `framePulse` ambient animation via CSS animation stacking. On most browsers this works correctly — the shake plays its 600ms cycle, then `framePulse` resumes uninterrupted. On older WebKit builds (Safari ≤ 15, embedded browsers), multiple animations on the same property (transform) don't always blend cleanly and the shake can appear to "snap back" at the end rather than decay smoothly. Acceptable degradation for now; could be addressed by moving the pulse to `box-shadow` alone.
- `_popWinningSymbols` derives match count from `result.type` via a lookup table (`{two: 2, three: 3, four: 4, five: 5, jackpot: 3}`). This is a deliberate choice to keep gameLogic's closure sealed (the sealed `_resolve` computes match count internally but doesn't expose it), but it means the client has to stay in sync with the type string vocabulary. If a future iteration adds a new win type (e.g. "scatter") without updating this lookup, the pop won't fire. A comment at the lookup warns the next dev but there's no compile-time safeguard.
- The `#player-rank-badge` is positioned `absolute; top: 14px; left: 14px` inside the machine frame. On viewports < 560px wide the jackpot display and the badge can crowd each other — the jackpot label starts at the top-centre and the badge is top-left. They don't overlap directly, but they're visually competing. A media query could re-anchor the badge to top-right on narrow viewports; not done this iteration.
- The coin fountain now spawns up to 100 coins for a jackpot. Each coin is a DOM element with its own keyframe animation — on low-end Android devices (Chrome on a Redmi-class device), 100 simultaneous transform-animated elements can cause a brief frame stutter. Not catastrophic, but noticeable. Could be swapped for a canvas-based particle system if it ever becomes a real problem.

#### Backend issues

- No backend changes in this iteration. gameLogic.js was restamped but not functionally touched; the Iteration 16 RTP tuning and closure sealing are authoritative and pass their gates deterministically. The smoke-test harness is also unchanged.
- That said, the `matchCountByType` lookup in ui.js duplicates knowledge that lives inside gameLogic's `_resolve`. A cleaner architecture would expose `matchCount` as a non-leaking field on the spin result — adding a number to the return object doesn't compromise closure sealing the way exposing a function would. The reason I didn't do this was that the gameLogic plan mandate said "no functional changes" this iteration; adding a field is technically a change to the public API shape, even a benign one. A future iteration should add it.
- `_triggerScreenShake` writes `--shake-x` / `--shake-y` directly to the element's inline style. That's clean and testable, but it means the inline style dictionary gains entries that linger after the animation ends (the class is removed, the CSS variables aren't). No functional issue, but a minor memory-footprint concern if the machine frame is inspected in DevTools.

### Upsides

#### Good frontend

- **Screen shake feels right.** The keyframe uses `cubic-bezier(0.36, 0.07, 0.19, 0.97)` — a sharp-start, slow-decay curve — which reads as an impact followed by settle rather than a symmetric back-and-forth. Ten-step path with decaying amplitude at each step gives it texture without seeming mechanical. Rotation is intentionally small (max 0.5°) so the effect registers peripherally; any larger and it tips over into "motion sickness" territory.
- **Coin fountain origin locked to the spin button.** Every coin's starting position is computed per-spawn from `spinBtn.getBoundingClientRect() − coinBurst.getBoundingClientRect()` — which means if the button is ever moved (e.g. by a future layout refactor) or if the viewport resizes mid-burst, the fountain still lands on the correct spot. No hard-coded coordinates. The upper-hemisphere angle bias (−π to 0) gives the coins a fountain silhouette rather than a radial burst.
- **Winning-symbol pop is cheap and correct.** The `.winning-symbol` class is added via `classList`, CSS handles every visual detail via `@keyframes winnerPop`, and the class auto-clears after `WINNER_POP_MS + 50ms` so overlapping wins don't leak state. The keyframe uses `cubic-bezier(0.34, 1.56, 0.64, 1)` — a spring curve that overshoots slightly at the 1.1× peak — which gives the symbol a satisfying "bounce" into place. The ceiling is strictly 1.1× scale so the symbol never distorts the reel layout.
- **Rank-up pulse is targeted.** The badge only fires its celebratory animation when `rank < prev` (strict improvement), not on first-ever display, not on same-rank refreshes, not on rank drops (those happen silently). Previous rank is persisted in `dataset.prevRank` so the logic survives across spin cycles within a session. Rank-drops don't animate because a rank drop is already bad news; further visual emphasis would rub it in.
- **CFG-driven intensity.** All four new tactile parameters (`JUICE_WIN_MULTIPLE`, `SHAKE_MS`, `SHAKE_INTENSITY_MAX`, `WINNER_POP_MS`) live in the UI CFG block at the top of `ui.js`. A future playtest session that finds the shake "too weak" or the pop "too aggressive" can tune all four in one place — no hunt through the codebase.
- **Epilepsy-safe coverage is complete and explicit.** The selector list in `styles.css` now enumerates every Iteration 20 effect (shake, winner-pop, rank-up) alongside the earlier suppressions. A human reviewing the block can immediately see which effects are suppressed without cross-referencing JS logic. The `.coin` CSS class is still in the list even though the JS-side coin guard in `_spawnCoins` makes the CSS suppression redundant — defence in depth.

#### Good backend

- **gameLogic.js is functionally untouched.** The Iteration 16 payout tuning and closure sealing are authoritative; Iteration 20 didn't need to revisit either. The smoke-test passes deterministically on every run: base RTP 87.115%, total RTP 92.352%, 20/20 tests. The plan mandate "target exactly 87.0% Base-Game RTP" was already satisfied (current mean is 87.11%, within ±0.11 pp of target, well inside the ±0.5% gate).
- **Closure sealing verified end-to-end.** `GameLogic._resolve`, `._applyPity`, `._buildReel`, `._getBalance`, `._validateBet`, and `._weightedPickSymbol` all return `undefined` when accessed on the public object. They exist only as local bindings inside the IIFE. A DevTools attacker cannot inspect, call, or overwrite any of them.
- **`Object.isFrozen` holds for every exposed data structure.** `GameLogic`, `REELS`, each individual reel strip, `PAYOUTS`, and each PAYOUTS tier (`FIVE`, `FOUR`, `THREE`, `TWO`) all return `true` from `Object.isFrozen`. Mutations fail silently in non-strict code and throw in strict code. Read access is unaffected, so the UI still works.
- **200-spin conservation holds to the penny.** Test at 200 spins with $50,000 starting balance gave expected $49,947.80 / actual $49,947.80 exactly — no floating-point drift, no stray pennies, no leaked payouts.

## Notes for next iteration

1. **Expose `matchCount` on the spin result.** Add a `matchCount: number` field to the return object of `spin()`. Not a closure violation (it's data, not a function), removes the `matchCountByType` lookup duplication in ui.js, and makes `_popWinningSymbols` less brittle to future type additions.

2. **Re-anchor the rank badge on narrow viewports.** Media query at `max-width: 560px` to move the badge to `top: 14px; right: 14px` so it doesn't crowd the jackpot display.

3. **Persist screen-shake and winner-pop preferences.** Add a `settings.tactileFeedback` boolean (separate from `epilepsySafe` — some players might want low motion but still enjoy the coin fountain, etc.) and wire it through to `_triggerScreenShake` / `_popWinningSymbols` early returns. The plan stopped at "epilepsy-safe suppresses all three" but there's appetite in the middle (reduced-motion mode) that isn't served.

4. **Canvas-based particle system for the coin fountain.** A 100-element DOM-animation fountain is fine on desktop but taxes low-end mobile. Swap to a single `<canvas>` element that renders the coins via `requestAnimationFrame` — same API surface (`_spawnCoins(count)`), different internals. Would cut GPU compositor cost by ~95% for jackpot bursts.

5. **Rank-drop handling.** Currently a rank drop is silent — no animation, no announcement. That's the right default, but a single-shot screen-reader announcement ("rank dropped to #8") in an `aria-live` region would help accessibility. Easy to bolt on.

6. **Ship the `verifyRTP` UI affordance** that Iteration 16's log entry flagged but didn't build. A hidden "RTP self-test" button in Settings that runs `GameLogic.verifyRTP()` and renders the structured result (base RTP, total RTP, within-target, sample size, σ) in a collapsible diagnostic card. Players won't see it; QA reviewers don't have to open DevTools.

7. **User-avatar depth.** Iteration 15's review flagged "the user avatar is just a color and should be more interesting." Still unaddressed. A hexagonal or circuit-board badge with the selected colour as an accent would make `State.player.color` feel like identity rather than a decoration.

## Rationale and Learning

### Rationale

Iteration 20 had a dual brief: validate the mathematical engine (92% RTP, closure sealing, smoke-test) and layer on the "Big Win Juice" tactile-feedback stack (screen shake, coin fountain, winning-symbol pop, rank badge). When I started the turn, my first instinct was to treat these as parallel workstreams — reconcile RTP math first because it's the more consequential, then add the polish.

When I actually opened the Iteration 18/19 baseline, I discovered that **everything in the math/validation mandate was already done**. The RTP tuning landed in Iteration 16; the closure sealing landed in Iteration 16; the 3M-spin `verifyRTP` default and the ±0.5% base-game gate are Iteration 16 work; the Mulberry32 smoke-test is Iteration 16 work. I ran `node smoke-test.js` on the baseline before touching anything and got 20/20 tests passing with base RTP 87.115%. The plan mandate "adjust the PAYOUTS table in gameLogic.js to target exactly 87.0% Base-Game RTP" was already satisfied to within 0.11 pp.

So the iteration's actual centre of gravity became the **tactile-feedback stack** — screen shake, upgraded coin fountain, winning-symbol pop, and the floating rank badge. These are smaller changes individually but they're the four things a player will *feel* from Iteration 20.

The structural decisions within that stack were:

1. **Don't expose `matchCount` from gameLogic.** The plan said "keep closure sealing." Adding `matchCount: number` to the spin result would be architecturally clean but would technically change the public API shape, and the plan's Logic Hardening section was emphatic about *not* changing gameLogic's surface this iteration. So I derived it client-side from `result.type`. This is a deliberate constraint-vs-cleanliness trade-off that I flagged for next iteration.

2. **Compute coin fountain origin at spawn time, not cached.** I could have cached the spin-button bounding rect once at boot. That would be faster but would break if the button ever moved (window resize, dev-tools orientation, theme switch, etc.). Recomputing every spawn adds one `getBoundingClientRect()` call per fountain — O(1) — and makes the code resilient to layout changes. Right trade.

3. **Screen shake uses a single keyframe parameterised by CSS custom properties.** The alternative was multiple keyframes (`shakeWeak`, `shakeMedium`, `shakeStrong`) with a classList toggle. Custom properties let me scale a single keyframe continuously, which means a "55× multiplier" can shake slightly less than a "60× multiplier" instead of both being quantised to "medium". Turned out to matter for readability: the gradation between "this was a pretty good win" and "this was a really big win" is now communicated in the shake itself, not just the toast above it.

4. **Rank-up pulse only on strict improvement.** The first version fired every time `rank !== prev`. That meant going from rank 5 to rank 4 pulsed (good), but so did going from rank 4 to rank 5 (bad — that's a regression, shouldn't be celebrated). The final implementation checks `rank < prev`, which excludes both first-display and regressions. Took three minutes to notice the bug and fix it, but it's the kind of thing that would read as "the rank badge is broken" to a playtester who saw it once and moved on.

### Learning

**First: before touching anything, run the regression harness.** My plan for this iteration was to spend the first 30% of the turn on RTP tuning. When I ran the smoke-test and got 20/20 passes, I nearly started "fixing" code that was already correct — muscle memory from the Iteration 16 work, where I had just lived through the RTP investigation. The lesson: iteration plans don't override the ground truth of the existing code. Check first, change second. The plan's framing ("Previous simulations show the actual base RTP was ~78%") was describing the Iteration 15 state, not the Iteration 18 state, and re-reading it with that context made the plan's real priority (tactile feedback) clear.

**Second: "tactile feedback" is a system, not a list of effects.** My first sketch treated shake, coins, pop, and badge as four independent items — four functions, four classList additions, done. Thirty minutes into implementation I noticed they needed to compose: a jackpot triggers all four, and the four need to *sequence* correctly so they feel coherent rather than chaotic. The shake starts immediately (on frame level); the winning-symbol pop kicks in right away too (per-symbol); the coin fountain starts after a tiny delay so the eye registers the shake before coins appear; the rank badge update runs *after* Leaderboard records the win so the badge reflects the post-win state. None of this is encoded in code structure — it's encoded in *the order of calls inside `_handleWin`*. A future refactor should extract this as a formal "celebration pipeline" so the sequencing is explicit rather than positional.

**Third: CSS custom properties are the right abstraction for "parameterised animation".** The old Iteration 15 approach to coin timing was a hard-coded 200ms random delay inside the `setTimeout`. The Iteration 20 approach puts the delay on `animationDelay` via inline style, the translation on `--tx`/`--ty`, the duration on `--winner-pop-ms`, and the shake amplitude on `--shake-x`/`--shake-y`. Every tunable is a CSS variable or a `style.setProperty` call. The result is that *every* animation timing can be adjusted without touching JS or reloading — a CSS-live-edit in DevTools is sufficient. That's the first time in this project that the CSS-JS boundary has felt really clean.

**Fourth: the cheapest bugs to catch are the ones that require integration between layers.** My integration-check Python script ran 33 assertions across HTML, CSS, and JS simultaneously: does every `$()` call find a DOM id? Does every CSS class referenced from JS actually exist in CSS? Is every private helper *actually* closure-local? All 33 passed on the first clean run, but three of them were checking things that used to be wrong in earlier iterations (the `achievements-widget` ordering heuristic, the closure-locality detector, the epilepsy-safe coverage list). Every integration check I wrote today was one I wished I'd had two iterations ago.

### What I'd do differently

Ship the integration-check Python script as a permanent pre-commit harness, not just a debug-session tool. It costs ~50 ms to run, catches cross-file drift that `node --check` can't see, and every assertion in it encodes a piece of architectural intent that's otherwise implicit. Every future iteration could be gated on it. The version that ran today is scratch code in `/tmp`; it should live in the repo alongside `smoke-test.js` as `integration-check.py`. That's the change I would make if I could rewind this turn.
