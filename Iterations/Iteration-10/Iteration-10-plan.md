# Iteration 10 Plan

### Goals:

- Fix the reel spin animation so the symbols scroll in the correct direction and the motion feels in sync with the spin cycle duration
- Fix the site header so it does not overlap or clip the robot mascot's speech bubble and chat textbox
- Add a background behind the result display text (e.g. "THREE OF A KIND!", "No match.") so it is readable against any reel symbol underneath it
- Rewrite `chat.js` WIN_REACTIONS so the robot insults the player on wins rather than celebrating, consistent with the "Anti-AI" theme required by the original prompt
- Add a favicon to `index.html` so the browser tab is no longer blank

### Prompt being used:

Keep the original prompt located at `./OriginalPrompt.txt` as the authoritative specification at all times, and ensure all changes remain consistent with its intent without breaking existing functionality. Do not alter any game logic, payout math, RNG, state management, or backend systems. Make only the following five targeted changes:

**1. Fix reel spin animation direction and sync (`uiReels.js`, `styles.css`):**
The current `animateReel` function snaps each strip to a random `startPos` in the range of the 2nd repetition (roughly 2480–4960px) and then animates to `finalPos = targetPos + HIGH_SPEED_WRAPS * symH`. Because `HIGH_SPEED_WRAPS * symH` is only 640px of extra travel, `finalPos` can be less than `startPos`, causing the strip to animate backward (symbols scroll upward instead of downward). Fix this by ensuring `finalPos` is always greater than `startPos` regardless of the target stop — for example by increasing `HIGH_SPEED_WRAPS` so the extra travel always exceeds the maximum possible `startPos`, or by clamping `startPos` so it is always less than `finalPos`. The animation must always scroll symbols downward (strip translates upward, i.e. toward more-negative translateY values).

**2. Fix site header overlapping the mascot chat textbox (`styles.css`, `index.html`):**
The `.site-header` currently has a fixed or sticky position that causes it to overlap the top of the robot mascot's speech bubble and mini-chat widget in `.panel-left`. Increase the top padding or margin of `#main-game` or `.panel-left` to clear the header height, and adjust the `.robot-bubble` and mascot positioning so the speech bubble appears fully below the header with no clipping. Do not change the header's height or content.

**3. Add a readable background behind the result display text (`styles.css`):**
The `#result-display` element currently renders text directly over the reel symbols with no background, making it hard to read. Add a semi-transparent dark pill or banner background to `#result-display` (e.g. `background: rgba(0,0,0,0.65)`, rounded corners, padding) so the result text is always legible regardless of which symbols are showing underneath. Apply the same treatment to `#near-miss-bar`.

**4. Rewrite WIN_REACTIONS in `chat.js` to be anti-AI and insulting on wins:**
The current `WIN_REACTIONS` object in `chat.js` is celebratory ("THREE OF A KIND! WOOOOO!"). Replace every winning reaction pool (`two`, `three`, `four`, `five`, `jackpot`) with responses where the robot is sarcastic, self-deprecating about being an AI, or insulting toward the player's luck in a humorous way — consistent with the "humorous elements that playfully make fun of AI" requirement in the original prompt. Example tone: "Great. You won. My GPU is being wasted on this." or "Congratulations, I guess. Don't let it go to your head, biological unit." Loss and near-miss reactions can remain as-is or be made slightly more taunting.

**5. Add a favicon to `index.html`:**
Add a `<link rel="icon">` tag in the `<head>` of `index.html`. Use an inline SVG data URI or a simple base64-encoded PNG that fits the robot theme — a small robot face, gear, or the letter R in the game's red/yellow color scheme. Do not create any new external asset files; the favicon must be self-contained in the HTML.

Implement all five changes incrementally and verify that no existing features are broken: the spin outcome, payout logic, leaderboard, achievements, settings, and audio must all behave identically to Iteration 10. Provide the full updated source for every file you modify.
