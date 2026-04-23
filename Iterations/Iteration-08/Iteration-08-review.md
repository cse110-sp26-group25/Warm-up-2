# Iteration 8 Review

## Query Data

Category	Value / Description
Input tokens	~15.2k (Full Iteration 07 Context + Plan + Reference Docs)
Output tokens	~18.5k (Total for 11 code files + 1 log entry + architecting logic)
Total tokens	~33.7k
Query time	~25 Minutes 

## Iteration Information:
| Category           | Value / Description |
|--------------------|---------------------|
| Number of files    | 11                  |
| Number of folders  | 1 (`Iterations/Iteration-08/slot-machine/`) |
| Lines of code      | 4,176               |

## Observations:

### Downsides

#### Front end issues
1. The Power Core animation is busy. The outer ring counter-pulse + core spin + ambient glow pulse all fire at once, which may be too much for sensitive players. The epilepsy-safe mode kills the glow but not the ring pulse during spin.
2. Motion blur is implemented via an SVG `<filter>` referenced by `filter: url(#vblur)`. This looks great in Chromium but can be less performant or subtly different in Firefox/Safari because the browsers handle SVG filter composition differently. The fallback `blur(1.2px)` during deceleration works, but the "high-speed" phase relies entirely on the SVG filter.
3. The staggered stop has five reels with 250 ms of stagger each — total spin time is now ~2.1 s + 180 ms overshoot. That's noticeably longer than Iteration 7's 1.8 s, which some testers may read as "slow."
4. The bet buttons now go up to $100, but the physical layout wraps on narrow screens. Looks fine, but might be unexpected.
5. `localStorage` usage means private-browsing users silently lose progress at the end of a tab session. The code degrades gracefully but does not warn the player.

#### Back end issues
1. The pity-trigger counter is now incremented in two places (gameLogic's `spin()` and achievements' `recordPity()`) — the latter is a no-op kept only for backwards-compat. This is a latent footgun if a future iteration calls both.
2. `State.get()` returns a deep clone on every call for safety, which adds allocation pressure on hot paths (the `_interpolate` helper in chat.js calls it every interpolation). Fine at current scale, but worth watching.
3. The `State` schema is versioned (`STORAGE_KEY = 'robo_slots_state_v1'`) but there is no actual migration pathway wired up — a future schema bump would need new code in `_merge`.
4. `ui.js` is now 1,062 lines. It's well-commented but genuinely should be split into `ui/reels.js`, `ui/panels.js`, `ui/chat.js` etc. in a future iteration.

### Upsides

#### Good front end
1. The 3x5 grid is preserved — no regression on the Iteration-7 win.
2. The Power Core genuinely reads as a "button you press" with all four states distinct (idle pulse, hover lift, active press-down, disabled lock). Keyboard focus ring is also obvious.
3. Volume sliders now move audio in real-time because they `setTargetAtTime` the GainNodes. No clicky stepping, no reload required.
4. Returning-player greeting is a noticeable moment of personality — "I saved your digital debt for you" landed well.
5. Persistent winnings mean the leaderboard is finally meaningful across sessions; player rank re-hydrates on boot.
6. Semantic tags (`<fieldset>` for bets, `<figure>` + `<output>` for money displays, `<button>` for the mascot instead of `<div role="button">`) meaningfully improve screen-reader navigation.

#### Good back end
1. Every JS module now has a `CONFIG` (or `CFG`) object at the top with all tunables — grepping for magic numbers returns zero hits in the business logic.
2. Every function has JSDoc with `@param`/`@returns` types. The `state.js` API is fully typed.
3. The `State` module is a clean single source of truth. Other modules don't touch `localStorage` at all anymore.
4. Debounced writes (400ms) + `beforeunload` flush means localStorage isn't thrashed during rapid spins but still persists if the tab closes.
5. `node --check` passes on all 9 JS files; `html.parser` balance check passes on `index.html`; all CSS variables resolve (except `--tx`/`--ty` which are set by JS at runtime as intended).

## Notes for next iteration:
1. Split `ui.js` (1062 LOC) into sub-modules. Reel animation, panel management, chat wiring, and settings hydration are all independent concerns.
2. Add a real schema-migration pathway to `state.js` — today `_merge` silently back-fills new fields but can't rename or transform old ones.
3. Consider a WebAudio-native motion-blur alternative for Firefox (SVG filter composition there is slower).
4. The pity mechanic currently books a `pityTriggers` increment whenever the nudge is applied, even if the forced 2-of-a-kind happens to land on a dead symbol where the 2-pair multiplier is 0. Worth tightening.
5. Add a "compact mode" or "reduced animation" preset that shortens the full spin cycle from ~2.1s → ~1.2s for power users.
6. Unit tests on `gameLogic.js` `_resolve` would catch regressions in payout math — RTP is assumed ~92% but has never been measured empirically.
7. `State.reset()` currently requires a page reload to take full effect because the frozen module singletons (RNG, GameLogic, etc.) snapshot their values at load time. Document this or make them reactive to State changes.

---

## Rationale and Learning

**Rationale.** Iteration 08 was deliberately a "no new features, all plumbing" iteration. Iterations 1–7 oscillated between expanding the feature set (animations, chat, achievements) and fighting regressions (the 3×5 grid got lost in Iteration 5, the chatbot went blank in Iteration 4). The root cause of that oscillation was architectural: each module owned its own corner of `localStorage`, its own magic numbers, and its own notion of "what a player is." So when an iteration rewrote one module, it usually broke the implicit contracts with two or three others.

The fix was to centralise the three things that were leaking everywhere:
- **Persistent state** → one `State` module, one storage key, debounced writes.
- **Tunable numbers** → one `CONFIG` object per module, frozen at the top of the file.
- **Contracts between modules** → explicit JSDoc on every function, with `@param` types.

The visual requirements (Power Core, motion blur, staggered overshoot) were framed in the prompt as UX deliverables, but they were really a test of whether the state and audio engines could be touched without breaking each other. They could — because the animation lives in `ui.js`, the state in `state.js`, and the audio in `audio.js`, and they only communicate through documented APIs.

**Learning.** Three things stood out.

1. **JSDoc is load-bearing, not decoration.** Writing `@returns {Array<{id:string,label:string}>}` forces the author to decide what the function returns *before* the caller has to guess. Several of the ambiguous contracts in Iteration 7 (especially in `leaderboard.js`) became obvious once they were written as types.

2. **"Centralise state" means "remove the other copies."** Half of my initial draft of `achievements.js` still had a local cache of stats alongside the `State.get()` calls. Every local cache is a future bug — the stats drift apart after a spin, and now the UI and the localStorage disagree. The final version reads the stats fresh on every access, trading a tiny allocation for a strong invariant. That tradeoff was the right one at this scale.

3. **Motion blur is a performance story, not a visual one.** The SVG `<filter id="vblur">` is applied only during the high-speed phase of the spin (the first ~60% of the Phase-1 duration) and removed before the deceleration settles. The browser only has to composite the filter for about 500 ms per spin, not the full 2+ seconds. That's deliberate — keeping the filter on through the overshoot would tank framerate on integrated GPUs.

**What I'd do differently.** I would have written the `State` module first in Iteration 1, before any feature work. Rebuilding an app to be persistent in Iteration 8 means auditing every module and every counter to confirm it uses the central store. If the contract had been there from the start, every iteration's feature work would have been strictly additive rather than periodically regressive.
