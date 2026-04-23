# Iteration 17 Review

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
| **Number of files** | 21 (19 code files + 1 log entry + 1 cert JSON) |
| **Number of folders** | 2 (`Iteration-17/slot-machine/` + `slot-machine/scripts/`) |
| **Lines of code** | ~8,200 total across the bundle; ~700 net lines added across 5 new files (`toastManager.js`, `rtpWorker.js`, `rtpCertification.js`, `rtp_certification.json`, `scripts/verifyRtp.js`); ~180 net lines changed across 4 touched files (`ui.js`, `gameLogic.js`, `styles.css`, `index.html`) |

## Observations

### Downsides

#### Frontend issues

- **Toast batching introduces a 500ms display delay for the first achievement in a cascade.** When `_batchOrShow()` opens a batch window, it intentionally delays even the first notification until the window expires so a rapid cascade is always shown as a consolidated summary rather than a single toast followed by a batch summary. For a player who unlocks exactly one achievement and nothing else fires, that notification now takes 500ms longer to appear than it did in Iteration 16. This is the correct trade-off for the stated batching requirement, but it will feel slightly sluggish for isolated achievement unlocks. A hybrid approach — show the first immediately, then if more arrive within the window update the text in-place — would eliminate the delay while still coalescing cascades.
- **Displaced-toast content is re-queued without its remaining display time.** When a high-priority toast preempts a lower-priority one, the displaced toast's message is pushed back into `_queue` and will start a fresh `visibleMs` timer when it eventually surfaces. A player who watched a big-win toast get knocked off the screen by a jackpot notification will see that same big-win toast reappear later, potentially well after the win is contextually relevant. Storing the `remainingMs` at preemption time and using it to set a shorter timer on re-display would make the queue feel more coherent.
- **`.toast-p4` (Jackpot) uses `font-size: 0.88rem`** — slightly larger than the base `0.80rem` — which can cause the toast to wrap to two lines on a 320px viewport if the jackpot amount is large (e.g. `★ JACKPOT! $51,000.00`). The `max-width: min(380px, 90vw)` constraint doesn't account for the larger font. Either remove the font-size bump or add `white-space: nowrap` and `overflow: hidden` / `text-overflow: ellipsis` for this tier.
- **The `--header-height` CSS variable is updated inside a `requestAnimationFrame` callback**, which is correct for avoiding layout thrashing, but there is a one-frame gap between the page loading and the variable being written. In that first frame the toast container uses the CSS fallback value (`62px` on desktop, `110px` on 781–1100px, `128px` on ≤780px). If a toast fires within the first frame — which can't happen in practice because toasts are gameplay-driven — it would use the fallback. Not a real bug, but worth noting for any future feature that might show a toast on page load (e.g. a "session restored" notification).
- **No `aria-label` or `aria-live` priority hint on priority-4 toasts.** Screen readers receive the same `role="status"` and implicit `aria-live="polite"` for all priority tiers. A jackpot notification and an achievement notification are announced identically. For accessibility, jackpot-tier toasts should use `role="alert"` (which maps to `aria-live="assertive"`) so screen-reader users hear them immediately rather than waiting for the current speech to finish.

#### Backend issues

- **`rtpWorker.js` duplicates the batch loop from `GameLogic.verifyRTPBatched()`** rather than importing a shared utility. The two implementations must be kept in sync manually. If a future iteration changes the pity mechanic or adds a new symbol, the worker's simulation will silently diverge from the live game unless both files are updated. A cleaner architecture would have the worker accept the complete `_resolve` function source as a serialized string and `eval()` it — but that's an XSS risk. The best realistic solution is a shared `simulationCore.js` that both `gameLogic.js` and `rtpWorker.js` import, but that requires a module system (ES modules or a bundler) that the current script-tag loading model doesn't support.
- **The config fingerprint in the shipped `rtp_certification.json` is `null`**, which means `RtpCertification.load()` skips fingerprint validation and will accept any cert file regardless of whether it was generated against the current payout table. This is safe for this iteration (the cert values are manually authored to match the current CONFIG) but it opens a latent risk: if a developer changes the payout table, regenerates nothing, and the cert fingerprint is still `null`, the game silently uses stale certification. The fingerprint check is only protective when the build script has actually run and written a real hex string. A `null` fingerprint should emit a console warning, not silent acceptance.
- **`scripts/verifyRtp.js` uses `Math.random`** — the same PRNG as `gameLogic.js` — rather than the game's seeded `RNG` module. This means the script's results are non-reproducible: running it twice with the same `--spins` will produce slightly different base RTP values. For a build-time artifact this is acceptable (the CI gate catches regressions; exact reproducibility isn't required), but it makes debugging payout changes harder because you can't isolate whether a shift in measured RTP is from the payout change or from PRNG variance. A `--seed` argument that uses Mulberry32 would make the script deterministic for diagnostic purposes.
- **Early termination at `CI < 0.1 pp` after ≥3 batches** is vulnerable to a degenerate case: if the first three batches happen to be unusually consistent (unlikely but possible), the simulation stops at 900k spins with a CI that happens to be tight but around a biased mean. The current check doesn't require the pooled mean to be within the tolerance band before stopping — it only checks that variance is low. Combining early stop with a mean-stability check (e.g. require `|mean - BASE_TARGET| < 0.3 %` before allowing early stop) would prevent spurious PASS results from short runs where the CI converged around the wrong value.

### Upsides

#### Good frontend

- **The priority preemption model is architecturally correct.** The original FIFO cap discarded notifications silently when the three-toast limit was hit during a jackpot cascade. The new queue never discards: displaced toasts are pushed back for later display, and the slot fills with the highest-importance pending item. From the player's perspective, jackpot notifications always appear immediately and achievement notifications accumulate in the queue without being lost.
- **Batching is key-scoped, not type-scoped.** Using `key: 'achievement'` as the batch identifier means all achievement toasts coalesce together regardless of which specific achievement was unlocked. This is intentional and correct for the stated requirement ("3 Achievements Unlocked"), but it's also flexible: a future iteration could give each achievement its own key to coalesce only exact duplicates, or use a shared key across bonus triggers and achievements to merge the two tiers visually. The batching system doesn't bake in that policy; callers choose it by setting keys.
- **`_updateHeaderHeight` uses `requestAnimationFrame` for layout-thrash prevention.** The pattern — cancel the pending RAF on every event, only measure once the frame has committed — is the standard idiom for debouncing resize handlers that read layout properties. It collapses any burst of `resize` events (e.g. from a smooth window drag) into a single measurement per frame, which is exactly the right cost for this operation.
- **The per-priority CSS classes (`.toast-p1` through `.toast-p4`) keep all visual policy in the stylesheet.** `ToastManager` appends a class name; it doesn't set any inline styles. This means the visual differentiation between priority tiers can be completely redesigned in CSS without touching JavaScript. The architecture separates *what* is important (JS) from *how importance is communicated visually* (CSS), which is the correct division of responsibility.
- **`ToastManager.clearAll()` is a clean teardown hook.** The method cancels all batch timers, removes all DOM nodes, and resets the active/queue arrays atomically. This makes it trivial to reset the toast system cleanly in any future context that needs a hard screen transition (e.g. a hypothetical "change game mode" button). Iteration 16's direct DOM manipulation had no equivalent — teardown required manually querying `.toast` nodes and removing them.

#### Good backend

- **Jackpot RTP computed analytically removes the largest source of simulation variance.** The 3M-spin simulation in Iteration 16 observed 2–4 jackpot hits per run; each hit shifted measured total RTP by ±1 pp. The analytical formula (`P_trigger × E[pool]`) gives an exact steady-state contribution of 5.11% with zero variance. Separating the deterministic component (base RTP, measured via simulation) from the analytical component (jackpot RTP, computed by math) is both statistically correct and computationally cheaper.
- **The build-time certification pattern is the right architecture for a production game.** By moving the expensive verification to a build step that produces a committed artifact, the game starts immediately regardless of hardware. The runtime loader validates the artifact against the live config so a stale cert is caught at startup rather than silently applied. Exit code 1 on `within_target=false` makes the build step a real CI gate: a developer can't accidentally ship a detuned payout table if they run the script as part of their deploy pipeline.
- **`RtpCertification.load()` degrades gracefully.** If the cert file is missing, malformed, or fails fingerprint validation, the function returns `false` and the game continues normally. The game is not hard-dependent on the cert; it's an optimisation and an audit trail, not a gating requirement. This is important for local development (first checkout, no cert) and for environments where `fetch()` fails (e.g. `file://` protocol without a local server).
- **The background worker is opt-in with a dual feature flag (global variable + localStorage).** Developers can activate it from the browser console without modifying source code, which is exactly the right ergonomics for a diagnostic tool. Keeping it off by default means production players never pay the battery cost of a 3M-spin simulation running in a background thread after page load.
- **`GameLogic.verifyRTPBatched` exposes `ciHalfWidth` in its return object.** Unlike `verifyRTP()` which reported `trialStd` (a within-sim variance figure), `ciHalfWidth` is a proper 95% confidence interval half-width — the correct statistic for answering "how trustworthy is this measurement?" A `ciHalfWidth` of 0.04 pp means the true base RTP is almost certainly within 87.0% ± 0.04%, which is a much cleaner interpretation than a standard deviation that listeners would have to convert.

## Notes for next iteration

1. **Fix the one-frame toast delay edge case.** The `requestAnimationFrame`-batched header measurement means there's a one-frame window at boot where `--header-height` still holds the CSS fallback. No toast fires that early now, but any future boot notification (e.g. "Welcome back, session restored") would use the fallback. Measure synchronously on first call and only use RAF for subsequent resize debouncing.

2. **Add `role="alert"` to jackpot-tier toasts.** Currently all toasts use `role="status"` (polite). Jackpot notifications should use `role="alert"` (assertive) so screen-reader users hear them immediately. The `ToastManager.show()` call or the `_displayToast` function should set `role` based on priority tier.

3. **Show the first batched notification immediately; merge subsequent ones.** Instead of delaying all notifications for `batchWindowMs`, display the first immediately and update the toast text in-place if more arrive within the window. This eliminates the 500ms delay for isolated achievement unlocks while still coalescing cascades.

4. **Add `--seed` flag to `scripts/verifyRtp.js`** using Mulberry32. This makes a single known-seed run reproducible for debugging payout table changes — you can confirm that a payout change moved RTP by exactly X pp rather than attributing the shift to PRNG variance.

5. **Emit a console warning when `config_fingerprint` is `null` in the cert.** Silent acceptance of a `null` fingerprint removes the cert's main protection against stale artifacts. A warning keeps the fast-path valid for local development while making the risk visible.

6. **Extract shared simulation core.** `rtpWorker.js` and `GameLogic.verifyRTPBatched` share the same spin loop. Consider moving to ES modules (`type="module"` in `index.html`) so both can import a shared `simulationCore.js`, eliminating the divergence risk.

7. **Store remaining display time on preempted toasts.** When a toast is displaced from an active slot, save its `remainingMs = visibleMs - elapsedMs`. When it eventually surfaces from the queue, give it that shorter timer rather than a fresh `visibleMs`. This prevents "stale" big-win toasts from re-appearing at full duration long after their context has passed.

8. **Staggered luck-node reset (carried from Iteration 16).** When pity fires and the meter drops to 0, all five nodes de-activate simultaneously. A rightmost-first stagger (~120ms per step) would read as a capacitor discharging. Pure CSS; ~10 lines.

9. **Reel-strip RTP variance (carried from Iteration 16).** The live game uses 32-slot reel strips with small-sample bias. Either increase `REEL_SIZE` toward 256 (negligible sampling variance) or switch resolution math to the infinite-reel weighted-pick model and keep strips for rendering only.

10. **User avatar depth (carried from Iteration 15 review).** The avatar is still just a colour swatch. A hexagonal or circuit-board badge with the player's colour as an accent would feel more personal without requiring a full avatar system.

## Rationale and Learning

### Rationale

Iteration 17's mandate was a multi-front refactoring: replace the FIFO toast cap with a priority queue, fix the 780–1100px tablet layout overlap, move RTP verification off the boot path, and add simulation improvements. Each problem was correctly identified in the Iteration 16 notes.

The most structurally significant decision was **where to put the simulation**. The three viable options — Web Worker, build-time script, server-side — trade off differently against this codebase's constraints. A Web Worker doesn't help boot time (it runs concurrently with the game loading, so the game still starts before results are available — meaning you'd always ignore the first run's result anyway). Server-side verification doesn't fit a static browser game with no backend. Build-time certification is the only option that actually eliminates the boot cost: run once, commit the result, load the JSON file at startup.

That decision shaped everything downstream. The `rtp_certification.json` format needed to be self-describing (so it can be validated without re-running the simulation), the runtime loader needed to be gracefully degradable (so local development doesn't require a pre-built cert), and the config fingerprint needed to catch the case where payouts change without the cert being regenerated. The background Web Worker (`rtpWorker.js`) is retained as an opt-in diagnostic tool rather than the primary verification path — it exists to let developers run a sanity check post-deployment without touching Node.

The `ToastManager` architecture followed from the requirement's internal logic. "Replace the lowest-priority visible toast" and "queue instead of discard" are exactly the semantics of a bounded-buffer priority queue with preemption, a well-known data structure problem. The implementation maps directly: `_active` is the bounded display buffer, `_queue` is the overflow, and the preemption path is the standard "insert into full buffer by evicting the minimum" operation. Framing it that way made the code almost write itself; the interesting work was deciding what *not* to build (e.g. no per-toast remaining-time tracking, no animated queue-drain ordering).

### Learning

**First: the "correct" architecture for a feature depends on the deployment model, not just the feature requirements.** The RTP verification requirement said "move it off the main thread". A naive reading suggests "use a Web Worker". But Web Workers don't remove latency — they relocate it. The game still has to wait for the worker's result to know whether the payout table is valid before it can state that to the player. The boot delay was eliminated not by parallelism but by temporal separation: run the expensive work before deployment, not at runtime. Thinking about *when* a computation needs to run is more powerful than thinking about *where* it runs.

**Second: a priority queue with preemption requires careful bookkeeping of what you evict.** The initial sketch of the ToastManager had a bug: when a low-priority toast was preempted, it was discarded rather than re-queued. The requirement explicitly says "lower-priority toasts must be queued instead of discarded" — but it's easy to implement the preemption (the interesting part) and forget the bookkeeping (the boring part). The final implementation stores `message`, `priority`, `key`, and `rawIcon` directly in the `_active` entry so the displaced item can be fully reconstructed and re-queued without reading back from the DOM.

**Third: CSS variable fallbacks need to account for the full range of possible values.** The original bug was a hardcoded `top: 72px` that worked on desktop but broke on mid-range tablets where the header wraps. The fix (`calc(var(--header-height) + var(--toast-top-gap))` driven by JS measurement) is correct, but the fallback values set in CSS (`62px` desktop, `110px` tablet, `128px` mobile) need to be conservative enough that the toast never overlaps the header in the one-frame window before JS runs. Setting the tablet fallback to `110px` is a deliberate over-estimate — it may leave a small extra gap before JS corrects it, but it will never overlap. When designing CSS-variable fallbacks for values that JS will update, err toward the maximum plausible value rather than the expected value.

**Fourth: coalescing notifications is a UX policy decision disguised as an implementation problem.** The batching requirement is stated as an engineering spec ("group identical notifications within a 2-second window") but the real question is: *what does the player expect to see?* A player who unlocks three achievements simultaneously almost certainly wants to see "3 Achievements Unlocked" as a single confirmation rather than three sequential toasts. But a player who unlocks one achievement now and another 1.5 seconds later might find "2× UNLOCKED: Boot Up" confusing — they experienced two separate moments, not a batch. The 500ms window in this implementation is a reasonable middle ground for the cascade case (all within a single spin resolution) but may coalesce events the player experienced as distinct. Getting this right ultimately requires player testing, not engineering judgment.

### What I'd do differently

The `rtpWorker.js` file should not have been written as a standalone module. The moment you have a simulation loop in two places — `gameLogic.js` and `rtpWorker.js` — you have two implementations that will drift. The correct approach is to decide the module system upfront. If the game used ES modules (`<script type="module">`), `rtpWorker.js` could import `_resolve` and `_weightedPickSymbol` directly from `gameLogic.js` via a `import { ... } from './simulationCore.js'` pattern, and the worker would just be a thin message-handler wrapper. The current script-tag loading model makes that impossible, but the choice of loading model should have been a deliberate architectural decision at Iteration 1, not an inherited constraint. If this codebase has a future, converting to ES modules would eliminate the most annoying category of maintenance risk.
