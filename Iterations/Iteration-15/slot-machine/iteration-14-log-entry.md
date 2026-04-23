# Iteration 14 Review

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
| **Number of files** | 14 (13 code files + 1 log entry) |
| **Number of folders** | 1 (`Iterations/Iteration-14/slot-machine/`) |
| **Lines of code** | ~5,100 total; ~690 net lines changed across the 6 touched files |

## Observations

### Downsides

#### Frontend issues

- The top-center toast location clears the jackpot figure, but on screens between 780px and 1100px wide (where the right panel is already hidden but the header hasn't yet wrapped) the toast sits directly over the reels briefly. Acceptable — it's the *point* of the relocation — but a less-intrusive option would be a side-slide from the left panel once the viewport is that narrow.
- The `#storage-warning` badge pulses continuously while visible. That's intentional so private-mode users can't miss it, but combined with the existing jackpot-pulse and chest-light animations on the mascot, there are now four simultaneously pulsing UI elements on the main view. Worth watching for accessibility feedback.
- The mechanical "denied" buzz is a distinct sound from the loss sting, but it's only ~240ms long — on slow audio contexts (some Android tablets) the first pulse can get cut off before rendering finishes warming up.

#### Backend issues

- `GameLogic.spin()` now returns **two different shapes** — a rejection object or a full spin result — discriminated by the `rejected` boolean. TypeScript would model this cleanly as a discriminated union, but in plain JSDoc the union type works but looks verbose. A future iteration could wrap spins in a dedicated `SpinResult` class with a `.isRejected()` method, but that's framework weight this project doesn't need yet.
- The bet deduction + payout credit are now atomic *within* `GameLogic.spin()`, but there's still a window between the function returning and `ui.js` calling `_updateBalance()` where the DOM label is stale for one frame. Not a real bug because the authoritative balance lives on `State`, but someone reading console logs during a jackpot might briefly see `balance: old, winnings: new` before the next render.
- `Fast Play` is now one multiplier (`FAST_FACTOR: 0.5`), but the `BLUR_LIFT_FRACTION` is still a fraction of whatever the scaled phase 1 duration is — so blur lifts at 60% of the shorter fast-play phase, which is ~270ms in. In the normal path it lifts at ~540ms. The blur thus feels proportionally "right" either way, but a future tweak might want to keep the absolute post-blur settle time constant instead.

### Upsides

#### Good frontend

- The Iteration 13 flag — "toasts in the bottom-right are too far out of the way to be noticeable during active play" — is resolved by the top-center relocation. The toast now drops down directly into the player's focal region (the machine frame) rather than requiring them to look away.
- `.chat-mini { min-height: 180px; flex-shrink: 0 }` plus `.chat-messages { flex: 1 1 auto; min-height: 120px }` is the correct combination. The container refuses to collapse; the inner log expands to fill whatever space the container gets. The earlier Iteration 13 rule (`height: 200px`) fought with the parent flex layout; the new rules let the box become authoritative and the log respond.
- The `#storage-warning` header badge gives a glance-sized signal without blocking the player's first spin. Hiding the text label under 480px (icon-only fallback) keeps it usable on phones.
- Fast-Play now actually feels fast. The Iteration 13 version only sped up phase 1, so the overshoot and settle still ate ~180ms per spin — in a "fast" mode that's 10% of the entire cycle. Scaling everything uniformly gives the expected "half as long" feel.

#### Good backend

- **The console-bypass vulnerability flagged in Iteration 13 is closed.** Calling `GameLogic.spin(1000000)` at a balance of $200 now returns `{rejected: true, reason: 'insufficient_balance'}` with zero state mutation. I verified this with a 100-spin conservation test: every dollar is accounted for, start to finish, to the penny.
- Moving *both* deduction and credit inside `GameLogic.spin()` means there is no "split brain" where the console could deduct via `State.set('balance', ...)` but not credit. The whole balance lifecycle of a spin is now a single atomic function call.
- `REJECT` is a frozen enum exported on `GameLogic`, so callers can `switch (result.reason)` on named constants instead of string-matching `'insufficient_balance'` at the call site. This is the pattern I'd use for any future rejection reasons (rate-limit, maintenance-mode, etc.).
- `canSpin(bet)` gives the UI layer a cheap, synchronous check for disabling the button **without** being a security gate. The naming reflects that: `canSpin` is advisory; `spin` is authoritative. The UI always asks the second function before committing.
- `playDenied()` is synthesised the same way as every other SFX in the engine — two descending square pulses plus a filtered noise thud — so it plays off the same GainNode graph and respects the master/sfx volume sliders automatically. No new audio routing plumbing needed.
- Storage detection has been in `state.js` since Iteration 09, but was previously surfaced only as a chat warning. Iteration 14 promotes it to a header badge — a persistent, glance-able indicator — using the API that already existed. Good signal that the Iteration 09 investment paid off here.

## Notes for next iteration

1. **Toast queue overflow**: if five achievements unlock in one spin (rare but possible for new players), five toasts stack vertically and push past the jackpot. Cap visible toasts at 3 with a small "+N more" counter, or reduce the `TOAST_VISIBLE_MS` when the queue is long.
2. **Typed spin result**: the `{rejected: true} | {stops, symbols, ...}` union works but is verbose in JSDoc. Consider wrapping in a `SpinResult` class with `.isRejected` / `.payout` accessors, or adopt TypeScript. Not urgent — the current shape is checkable and the smoke test confirms correctness.
3. **Test harness**: the ad-hoc Node.js smoke script at `/tmp/smoke_test.js` proved the conservation invariant. Promote it to a real test file checked into the repo so future iterations can't regress the balance math.
4. **RTP empirical verification**: Iteration 08's note is still outstanding — run a 100k-spin Node.js simulation using the same harness and confirm the ~92% target RTP empirically against the current payout tables.
5. **Denied-buzz on slow audio contexts**: add a 50ms silent lead-in to `_playDenied` so the first pulse doesn't get trimmed on mobile Safari, which has a slower `AudioContext.resume()` warmup than Chromium.
6. **Storage warning pulse**: consider stopping the pulse after 10 seconds so it doesn't distract from gameplay once the player has noticed it. First impression matters; persistent distraction doesn't.
7. **Mid-range viewport toast collision**: audit the 780–1100px range and consider positioning the toast on the left side of the machine frame in that window, reverting to top-center above 1100px.

---

## Rationale and Learning

### Rationale

Iteration 14 had an asymmetric mandate: a single critical **security** fix (the balance-bypass flagged in Iteration 13's backend review) alongside a batch of **UX polish** items (toast placement, mobile chat, incognito warning, fast-play wiring). The temptation was to treat them as independent tickets and touch each file minimally. The better choice was to use the security fix as an opportunity to clean up the balance-lifecycle boundary — because the bypass existed precisely *because* the boundary was blurry.

In Iteration 13, `ui.js` owned:
1. Reading the balance.
2. Checking it against the bet.
3. Deducting the bet from `State`.
4. Running the spin.
5. Crediting the payout back to `State`.

Five responsibilities, no encapsulation. Moving only step 2 into `GameLogic.spin()` — the literal reading of the Iteration 13 review bullet — would have fixed the bypass but left four more balance mutations exposed on the UI layer. So I moved **all five**. `ui.js` now calls `GameLogic.spin(bet)` once and receives a result object that tells it whether to celebrate, commiserate, or apologise. The balance never appears in `ui.js` as a writable value; it's read-only via `GameLogic.balance`.

The UX items clustered naturally around **visibility**: the Iteration 13 player couldn't see their achievements (too far out of the way), couldn't see their chat on mobile (compressed), and couldn't see their progress was about to be lost (no incognito indicator). So I framed the CSS work as a single theme — "ensure every state change the system wants the player to notice is actually reachable from the focal zone" — rather than three disconnected tweaks.

### Learning

Three things stood out on this iteration.

**First: the security fix was architectural, not defensive.** The literal ask was "move the check into `spin()`." But a check that protects only step 2 while steps 3–5 stay on the UI layer is just the same vulnerability with one extra line of code. The real fix was to ask "why does `ui.js` know how to mutate `balance` at all?" and answer "it shouldn't." Once balance mutation left the UI layer entirely, there was no surface to attack. This is the difference between patching a leak and removing the pipe.

**Second: runtime tests catch what type systems can't.** `node --check` passes on a file that deducts the bet but forgets to credit the payout. JSDoc happily accepts a function that returns two shapes with incompatible fields. The 100-spin conservation test — `expected = start - bets + payouts; assert actual === expected` — caught nothing on this iteration because the code was right, but having written the test gives me confidence the code *is* right in a way that reading it can't. This invariant should be a permanent regression test, not a throwaway script.

**Third: responsive CSS rules compound.** The Iteration 13 chatbox compression wasn't caused by a bad rule; it was caused by three acceptable rules interacting. `.chat-mini` had no explicit height, `.chat-messages` had `height: 200px`, and the parent flex container distributed leftover space with no floor. Each rule in isolation was defensible. The fix — `min-height` on the outer container, `flex: 1 1 auto` on the inner log — required reasoning about the *cascade of flex constraints*, not about any one rule. In future, when a responsive bug is reported, I'll check the chain first and the individual properties second.

### What I'd do differently

Include a real test file in the repository from the start. Conservation, pity-meter behavior, and payout-multiplier ranges are all invariants that can be checked deterministically, and re-running them on every iteration would prevent the class of regressions that have plagued earlier iterations (the pity double-counting bug in Iteration 08, the balance bypass here). A 200-line test file would have more iteration-to-iteration value than most of the feature additions.
