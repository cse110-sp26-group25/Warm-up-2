/**
 * uiReels.js — Reel-strip construction and animation (Iteration 21).
 *
 * Owns all DOM work for the 5-reel grid:
 *   • Building symbol-strip elements from GameLogic reel data.
 *   • Animating each strip through spin → decelerate → overshoot → settle.
 *   • CSS-only motion blur via will-change + blur() class toggles.
 *   • Fast-Play timing reduction (≈1.0 s total cycle when active).
 *
 * Iteration 21 — tease state:
 *   `spinDurations(fastPlay, teaseIndices)` accepts an array of reel
 *   indices to tease when the orchestrator (ui.js) detects the
 *   `symbols[0] === symbols[1]` near-miss condition pre-animation.
 *   Each teased reel gets its own per-reel extra delay from
 *   `CFG.TEASE_EXTRA_MS` (+1.0 s / +1.5 s / +2.0 s for reels 3/4/5).
 *   The extra delay is added AFTER fast-play scaling — tension
 *   deliberately survives fast-play mode at full duration.
 *
 * Iteration 14 — Fast Play wiring (retained):
 *   Every animation phase scales by `FAST_FACTOR` (0.5 by default).
 *   Applied at two points:
 *     • `spinDurations(fastPlay)` returns the scaled per-reel durations.
 *     • `animateReel(...)` pulls `OVERSHOOT_MS` through `_phaseScale(...)`.
 *
 *   Resulting totals at the default factor of 0.5:
 *     Normal: 900 + 4×250 + 180 = 2080 ms
 *     Fast:   450 + 4×125 +  90 = 1040 ms  ←  ≈1.0 s as specified.
 *
 * All tunables live in the top-level CFG object. Exposes a frozen public
 * API consumed by the ui.js orchestrator.
 *
 * @module UiReels
 */
const UiReels = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIG — all tunables in one place, no magic numbers elsewhere.
  // ═══════════════════════════════════════════════════════════════════
  /** @type {Object} Reel-animation tunables. */
  const CFG = Object.freeze({
    /** Height of one symbol slot (px). Must match CSS --symbol-h. */
    SYMBOL_HEIGHT:       80,
    /** Strip repetitions per reel for seamless infinite scroll. */
    STRIP_REPS:          5,
    /** ms before the first reel stops (normal speed). */
    FIRST_STOP_MS:       900,
    /** Extra ms added per subsequent reel at normal speed. */
    PER_REEL_STAGGER:    250,
    /**
     * Fast-Play duration multiplier.
     * Applied uniformly to every phase (reel spin + overshoot + settle)
     * so the whole animation scales together instead of just Phase 1.
     */
    FAST_FACTOR:         0.5,
    /** Duration of the full overshoot → settle bounce (ms). Each half gets half. */
    OVERSHOOT_MS:        180,
    /** Overshoot distance expressed in symbol-heights. */
    OVERSHOOT_FRACTION:  0.5,
    /** Fraction of Phase 1 at which motion blur is removed (strip decelerates). */
    BLUR_LIFT_FRACTION:  0.6,
    /**
     * Iteration 21 — tease-state extra delays per teased reel (ms).
     *
     * When `symbols[0] === symbols[1]` is detected by the orchestrator
     * (ui.js), it passes a `teaseIndices` array to `spinDurations()`.
     * Each teased reel has this many milliseconds added to its spin
     * duration, amplifying the anticipation that a third match might
     * land. Values escalate per the Iteration 21 plan mandate:
     *
     *   reel 3 (index 2): +1.0 s
     *   reel 4 (index 3): +1.5 s
     *   reel 5 (index 4): +2.0 s
     *
     * The array index corresponds directly to the reel index — so
     * non-teased reels are simply absent from `teaseIndices` and their
     * base duration is used unchanged.
     */
    TEASE_EXTRA_MS: Object.freeze({ 2: 1000, 3: 1500, 4: 2000 }),
  });

  // ── DOM helper ─────────────────────────────────────────────────────
  /** @param {string} id @returns {HTMLElement|null} */
  const $ = id => document.getElementById(id);

  // ── Symbol SVG library ─────────────────────────────────────────────
  /**
   * Inline SVG strings keyed by symbol id.
   * Each SVG fits a 80×80 viewBox and uses the game colour palette.
   * @type {Readonly<Object<string,string>>}
   */
  const SYMBOL_SVG = Object.freeze({
    jackpot: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="36" fill="#ffd600" stroke="#ff6f00" stroke-width="3"/>
      <text x="40" y="30" text-anchor="middle" font-family="monospace" font-size="11" font-weight="900" fill="#b71c1c">JACK</text>
      <text x="40" y="46" text-anchor="middle" font-family="monospace" font-size="11" font-weight="900" fill="#b71c1c">POT</text>
      <polygon points="40,52 44,62 36,62" fill="#e53935"/>
    </svg>`,
    seven: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="64" height="64" rx="10" fill="#e53935" stroke="#ff5252" stroke-width="2"/>
      <text x="40" y="58" text-anchor="middle" font-family="monospace" font-size="46" font-weight="900" fill="#fff176">7</text>
    </svg>`,
    gear: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="28" fill="#546e7a" stroke="#78909c" stroke-width="2"/>
      <circle cx="40" cy="40" r="12" fill="#263238"/>
      ${Array.from({length:8},(_,i)=>{
        const a=i*(Math.PI/4);const cos=Math.cos(a);const sin=Math.sin(a);
        const x1=40+cos*24;const y1=40+sin*24;
        return `<rect x="${x1-4}" y="${y1-4}" width="8" height="8" rx="2" fill="#69f0ae" transform="rotate(${i*45} ${x1} ${y1})"/>`;
      }).join('')}
      <circle cx="40" cy="40" r="5" fill="#69f0ae"/>
    </svg>`,
    bolt: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <polygon points="46,8 24,44 38,44 34,72 56,36 42,36" fill="#fff176" stroke="#ffd600" stroke-width="2" stroke-linejoin="round"/>
    </svg>`,
    chip: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="18" width="44" height="44" rx="6" fill="#1565c0" stroke="#42a5f5" stroke-width="2"/>
      <rect x="26" y="26" width="28" height="28" rx="3" fill="#0d47a1"/>
      <circle cx="34" cy="34" r="3" fill="#69f0ae"/><circle cx="46" cy="34" r="3" fill="#69f0ae"/>
      <circle cx="34" cy="46" r="3" fill="#69f0ae"/><circle cx="46" cy="46" r="3" fill="#69f0ae"/>
      <rect x="12" y="30" width="6" height="4" rx="1" fill="#78909c"/>
      <rect x="12" y="46" width="6" height="4" rx="1" fill="#78909c"/>
      <rect x="62" y="30" width="6" height="4" rx="1" fill="#78909c"/>
      <rect x="62" y="46" width="6" height="4" rx="1" fill="#78909c"/>
      <rect x="30" y="12" width="4" height="6" rx="1" fill="#78909c"/>
      <rect x="46" y="12" width="4" height="6" rx="1" fill="#78909c"/>
      <rect x="30" y="62" width="4" height="6" rx="1" fill="#78909c"/>
      <rect x="46" y="62" width="4" height="6" rx="1" fill="#78909c"/>
    </svg>`,
    robo: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="28" width="40" height="34" rx="6" fill="#e53935"/>
      <rect x="28" y="16" width="24" height="14" rx="4" fill="#e53935"/>
      <rect x="24" y="36" width="12" height="10" rx="2" fill="#fff"/>
      <rect x="44" y="36" width="12" height="10" rx="2" fill="#fff"/>
      <circle cx="30" cy="41" r="3" fill="#1a237e"/>
      <circle cx="50" cy="41" r="3" fill="#1a237e"/>
      <rect x="26" y="50" width="28" height="6" rx="2" fill="#b71c1c"/>
      <rect x="14" y="36" width="6" height="18" rx="3" fill="#c62828"/>
      <rect x="60" y="36" width="6" height="18" rx="3" fill="#c62828"/>
    </svg>`,
    nut: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <polygon points="40,10 64,24 64,56 40,70 16,56 16,24" fill="#78909c" stroke="#b0bec5" stroke-width="2"/>
      <circle cx="40" cy="40" r="14" fill="#263238"/>
      <circle cx="40" cy="40" r="8" fill="#37474f" stroke="#546e7a" stroke-width="1.5"/>
    </svg>`,
    screw: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="22" r="16" fill="#90a4ae" stroke="#b0bec5" stroke-width="2"/>
      <line x1="30" y1="22" x2="50" y2="22" stroke="#263238" stroke-width="3" stroke-linecap="round"/>
      <line x1="40" y1="12" x2="40" y2="32" stroke="#263238" stroke-width="3" stroke-linecap="round"/>
      <rect x="37" y="38" width="6" height="24" rx="2" fill="#78909c"/>
      ${Array.from({length:5},(_,i)=>`<line x1="36" y1="${42+i*4}" x2="44" y2="${42+i*4}" stroke="#546e7a" stroke-width="1.5"/>`).join('')}
    </svg>`,
  });

  // ── Lizard Hopper symbol SVGs (Iteration 18) ──────────────────────
  /**
   * Alternative SVG set for the Lizard Hopper theme.
   * Keys match GameLogic symbol IDs exactly so the swap is transparent.
   */
  const SYMBOL_SVG_LIZARD_HOPPER = Object.freeze({
    jackpot: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="36" fill="#ff8f00" stroke="#e65100" stroke-width="3"/>
      <ellipse cx="40" cy="43" rx="17" ry="13" fill="#ffca28"/>
      <circle cx="31" cy="34" r="5.5" fill="#1b5e20"/><circle cx="49" cy="34" r="5.5" fill="#1b5e20"/>
      <circle cx="31" cy="33" r="2.5" fill="#fff"/><circle cx="49" cy="33" r="2.5" fill="#fff"/>
      <path d="M 33 49 Q 40 54 47 49" fill="none" stroke="#e65100" stroke-width="2" stroke-linecap="round"/>
      <text x="40" y="70" text-anchor="middle" font-family="monospace" font-size="9" font-weight="900" fill="#1b5e20">JACKPOT</text>
    </svg>`,
    seven: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="50" rx="27" ry="20" fill="#2e7d32" stroke="#66bb6a" stroke-width="2"/>
      <circle cx="27" cy="38" r="8" fill="#1b5e20"/><circle cx="53" cy="38" r="8" fill="#1b5e20"/>
      <circle cx="27" cy="37" r="4" fill="#c5e1a5"/><circle cx="53" cy="37" r="4" fill="#c5e1a5"/>
      <circle cx="28" cy="36" r="1.5" fill="#111"/><circle cx="54" cy="36" r="1.5" fill="#111"/>
      <path d="M 20 63 L 8 73 M 60 63 L 72 73" stroke="#2e7d32" stroke-width="3" stroke-linecap="round"/>
      <text x="40" y="60" text-anchor="middle" font-family="monospace" font-size="24" font-weight="900" fill="#ffca28">7</text>
    </svg>`,
    gear: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="32" fill="#795548" stroke="#a1887f" stroke-width="2"/>
      <path d="M 40 14 Q 56 16 64 29 Q 72 42 65 56 Q 58 70 43 73 Q 28 76 18 65 Q 8 54 10 40 Q 12 24 25 17 Q 32 13 40 14"
            fill="none" stroke="#efebe9" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 40 22 Q 52 24 58 34 Q 64 44 58 54 Q 52 64 42 66 Q 30 68 23 60 Q 16 52 18 42 Q 20 30 30 25"
            fill="none" stroke="#d7ccc8" stroke-width="2" stroke-linecap="round"/>
      <circle cx="40" cy="40" r="9" fill="#4e342e"/>
      <circle cx="40" cy="40" r="5" fill="#3e2723" stroke="#6d4c41" stroke-width="1.5"/>
    </svg>`,
    bolt: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="16" rx="10" ry="7" fill="#558b2f" stroke="#8bc34a" stroke-width="1.5"/>
      <rect x="37" y="23" width="6" height="28" rx="3" fill="#c5e1a5"/>
      <path d="M 40 51 L 26 70" stroke="#c5e1a5" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 40 51 L 54 70" stroke="#c5e1a5" stroke-width="4.5" stroke-linecap="round"/>
    </svg>`,
    chip: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="46" rx="30" ry="19" fill="#2e7d32" stroke="#43a047" stroke-width="2"/>
      <ellipse cx="40" cy="44" rx="26" ry="15" fill="#1b5e20"/>
      <path d="M 40 44 L 40 12" stroke="#2e7d32" stroke-width="3" stroke-linecap="round"/>
      <circle cx="40" cy="44" r="20" fill="none" stroke="#43a047" stroke-width="1.5" stroke-dasharray="5 4"/>
      <circle cx="40" cy="44" r="12" fill="none" stroke="#43a047" stroke-width="1.5" stroke-dasharray="3 3"/>
      <circle cx="45" cy="36" r="5" fill="#a5d6a7"/>
    </svg>`,
    robo: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="50" rx="21" ry="14" fill="#558b2f" stroke="#8bc34a" stroke-width="2"/>
      <ellipse cx="40" cy="34" rx="15" ry="12" fill="#558b2f" stroke="#8bc34a" stroke-width="2"/>
      <circle cx="33" cy="29" r="5" fill="#1b5e20"/><circle cx="47" cy="29" r="5" fill="#1b5e20"/>
      <circle cx="33" cy="28" r="2.5" fill="#c5e1a5"/><circle cx="47" cy="28" r="2.5" fill="#c5e1a5"/>
      <path d="M 19 52 Q 7 48 4 57" stroke="#558b2f" stroke-width="3" stroke-linecap="round"/>
      <path d="M 61 52 Q 73 48 76 57" stroke="#558b2f" stroke-width="3" stroke-linecap="round"/>
      <path d="M 30 64 L 20 76 M 50 64 L 60 76" stroke="#558b2f" stroke-width="3" stroke-linecap="round"/>
      <path d="M 40 64 L 40 78" stroke="#558b2f" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
    nut: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="38" cy="46" rx="27" ry="21" fill="#78909c" stroke="#90a4ae" stroke-width="2"/>
      <ellipse cx="38" cy="44" rx="23" ry="17" fill="#607d8b"/>
      <ellipse cx="31" cy="40" rx="9" ry="7" fill="#546e7a"/>
      <ellipse cx="47" cy="46" rx="11" ry="8" fill="#546e7a"/>
      <ellipse cx="37" cy="52" rx="8" ry="6" fill="#546e7a"/>
      <path d="M 13 45 Q 17 28 36 23" stroke="#90a4ae" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>`,
    screw: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <rect x="37" y="30" width="6" height="36" rx="3" fill="#33691e"/>
      <circle cx="40" cy="24" r="8" fill="#33691e" stroke="#66bb6a" stroke-width="1.5"/>
      <circle cx="37" cy="20" r="3" fill="#c5e1a5"/><circle cx="43" cy="20" r="3" fill="#c5e1a5"/>
      <ellipse cx="22" cy="37" rx="19" ry="8" fill="rgba(197,225,165,0.35)" stroke="#8bc34a" stroke-width="1.5" transform="rotate(-18 22 37)"/>
      <ellipse cx="58" cy="37" rx="19" ry="8" fill="rgba(197,225,165,0.35)" stroke="#8bc34a" stroke-width="1.5" transform="rotate(18 58 37)"/>
      <ellipse cx="20" cy="50" rx="15" ry="6" fill="rgba(197,225,165,0.25)" stroke="#8bc34a" stroke-width="1" transform="rotate(-12 20 50)"/>
      <ellipse cx="60" cy="50" rx="15" ry="6" fill="rgba(197,225,165,0.25)" stroke="#8bc34a" stroke-width="1" transform="rotate(12 60 50)"/>
    </svg>`,
  });

  // ── Private module state ───────────────────────────────────────────
  /** @type {boolean} Guards against animation calls while a spin is live. */
  let _spinning = false;

  // ── Private helpers ────────────────────────────────────────────────
  /**
   * Build one symbol div for a reel strip.
   * @param {string} symbolId - Symbol identifier.
   * @returns {HTMLDivElement} Configured symbol element.
   */
  function _makeSymbolDiv(symbolId) {
    const div = document.createElement('div');
    div.className = 'reel-symbol';
    const isLizard = document.body.classList.contains('theme-lizard-hopper');
    const map = isLizard ? SYMBOL_SVG_LIZARD_HOPPER : SYMBOL_SVG;
    div.innerHTML = map[symbolId] || SYMBOL_SVG[symbolId] || SYMBOL_SVG.screw;
    return div;
  }

  /**
   * Apply the Fast-Play scale factor to a duration.
   * @param {number}  ms       - Base duration in ms.
   * @param {boolean} fastPlay - True if Fast Play is currently active.
   * @returns {number} Scaled duration in ms.
   */
  function _phaseScale(ms, fastPlay) {
    return fastPlay ? ms * CFG.FAST_FACTOR : ms;
  }

  // ── Public API ─────────────────────────────────────────────────────
  return Object.freeze({

    /** Expose CFG so the orchestrator can read timing values. */
    CFG,

    /** Expose SYMBOL_SVG for any module that needs to render a symbol inline. */
    SYMBOL_SVG,

    /** Expose Lizard Hopper symbol SVGs for payout-table rendering. */
    SYMBOL_SVG_LIZARD_HOPPER,

    /**
     * Build the DOM symbol-strip for one reel column.
     * @description Repeats the reel `CFG.STRIP_REPS` times so the animation
     *   never visually runs off the end of the strip.
     * @param {number} reelIndex - Reel column index (0–4).
     * @returns {void}
     */
    buildStrip(reelIndex) {
      const strip = $('strip-' + reelIndex);
      if (!strip) return;
      strip.innerHTML = '';
      const reel  = GameLogic.REELS[reelIndex];
      const total = reel.length;
      const frag  = document.createDocumentFragment();
      for (let rep = 0; rep < CFG.STRIP_REPS; rep++) {
        for (let i = 0; i < total; i++) {
          frag.appendChild(_makeSymbolDiv(reel[i]));
        }
      }
      strip.appendChild(frag);
    },

    /**
     * Build all five reel strips. Called once on boot.
     * @returns {void}
     */
    buildAllStrips() {
      for (let i = 0; i < GameLogic.REEL_COUNT; i++) this.buildStrip(i);
    },

    /**
     * Notify the module whether a spin is in progress.
     * @description Used to guard the mid-Phase-1 timer callbacks.
     * @param {boolean} val - True while spinning.
     * @returns {void}
     */
    setSpinning(val) { _spinning = !!val; },

    /**
     * Animate one reel through its full spin cycle using requestAnimationFrame.
     * @description
     *   Phase 1: ease-out cubic drives the strip from startPos to landingPos
     *     (winning symbol centred in the 4th repetition), covering 3–4 full
     *     visual rotations. CSS blur classes simulate motion blur.
     *   Phase 2: small overshoot past landingPos (ease-in-out, half of
     *     scaled OVERSHOOT_MS).
     *   Phase 3: settle back to landingPos (ease-out, other half).
     *   The strip always scrolls downward (translateY toward more-negative).
     *
     * @param {number}  reelIndex    - Column index (0–4).
     * @param {number}  targetStop   - Strip index of the winning centre symbol.
     * @param {number}  spinDuration - Phase-1 duration in ms (already scaled).
     * @param {boolean} [fastPlay]   - True if Fast Play is on — also scales the
     *                                 overshoot/settle phases.
     * @returns {Promise<void>} Resolves after the reel fully settles.
     */
    animateReel(reelIndex, targetStop, spinDuration, fastPlay) {
      return new Promise(resolve => {
        const strip = $('strip-' + reelIndex);
        if (!strip) { resolve(); return; }

        const reel    = GameLogic.REELS[reelIndex];
        const total   = reel.length;
        const symH    = CFG.SYMBOL_HEIGHT;
        const overshootDist   = symH * CFG.OVERSHOOT_FRACTION;
        const overshootMs     = _phaseScale(CFG.OVERSHOOT_MS, !!fastPlay);
        const halfOvershootMs = overshootMs / 2;

        // Landing: winning symbol centred (row 1) in the 4th repetition (0-indexed rep 3).
        const landingPos = (3 * total + targetStop - 1) * symH;

        // Random start within the first repetition — always < landingPos.
        const startPos = RNG.randInt(0, total - 1) * symH;

        // Easing helpers.
        const easeOut   = t => 1 - Math.pow(1 - t, 3);

        // Snap to start instantly (no animation).
        strip.style.transition = 'none';
        strip.style.transform  = `translateY(-${startPos}px)`;
        strip.classList.remove('is-decelerating', 'is-settling');
        strip.classList.add('is-spinning');
        // eslint-disable-next-line no-unused-expressions
        strip.offsetHeight; // force reflow before rAF starts

        let p1Start = null;

        // ── Phase 1: ease-out deceleration from startPos to landingPos ──
        function phase1(ts) {
          if (!_spinning) { resolve(); return; }
          if (!p1Start) p1Start = ts;
          const t = Math.min((ts - p1Start) / spinDuration, 1);
          strip.style.transform =
            `translateY(-${startPos + (landingPos - startPos) * easeOut(t)}px)`;

          // Lift heavy blur at ~60 % — strip is decelerating visibly.
          if (t >= CFG.BLUR_LIFT_FRACTION && strip.classList.contains('is-spinning')) {
            strip.classList.remove('is-spinning');
            strip.classList.add('is-decelerating');
          }

          if (t < 1) { requestAnimationFrame(phase1); return; }

          // Phase 1 complete — strip is at landingPos.
          // Phases 2+3 use CSS transitions so the browser interpolates without
          // per-frame JS snap risk.
          strip.classList.remove('is-decelerating');
          strip.classList.add('is-settling');

          // Commit current transform as the animation start point before
          // switching to CSS-driven movement.
          void strip.offsetHeight;

          // Phase 2: ease-in overshoot to peakPos.
          strip.style.transition = `transform ${halfOvershootMs}ms ease-in`;
          strip.style.transform  = `translateY(-${landingPos + overshootDist}px)`;

          setTimeout(() => {
            // Phase 3: ease-out settle back to landingPos — no explicit final
            // snap needed because the CSS end-value IS landingPos.
            void strip.offsetHeight;
            strip.style.transition = `transform ${halfOvershootMs}ms ease-out`;
            strip.style.transform  = `translateY(-${landingPos}px)`;

            setTimeout(() => {
              strip.style.transition = '';  // restore CSS control
              strip.classList.remove('is-settling');
              resolve();
            }, halfOvershootMs);
          }, halfOvershootMs);
        }

        requestAnimationFrame(phase1);
      });
    },

    /**
     * Compute per-reel spin durations for all columns.
     *
     * Iteration 21 — accepts an optional `teaseIndices` array. For each
     * reel index listed, the corresponding per-reel extra delay from
     * `CFG.TEASE_EXTRA_MS` is added AFTER the fast-play scale is
     * applied. This means tease delays are NOT shortened by fast-play;
     * the tension window needs its full duration to land, and fast-play
     * would otherwise compress the tease below perceptibility.
     *
     * @description When `fastPlay` is true, each base duration is scaled
     *   by `CFG.FAST_FACTOR`. The same scaling is applied inside
     *   `animateReel` to the overshoot/settle phases, so the whole cycle
     *   shrinks together.
     * @param {boolean} fastPlay - True when Fast Play mode is active.
     * @param {number[]} [teaseIndices=[]] - Indices of reels to "tease"
     *   with extra spin duration per CFG.TEASE_EXTRA_MS.
     * @returns {number[]} Array of durations in ms, one per reel.
     */
    spinDurations(fastPlay, teaseIndices = []) {
      const teased = new Set(teaseIndices);
      return Array.from(
        { length: GameLogic.REEL_COUNT },
        (_, i) => {
          const base  = _phaseScale(CFG.FIRST_STOP_MS + i * CFG.PER_REEL_STAGGER, !!fastPlay);
          const extra = teased.has(i) ? (CFG.TEASE_EXTRA_MS[i] || 0) : 0;
          return base + extra;
        }
      );
    },
  });
})();
