/**
 * uiReels.js — Reel-strip construction and animation (Iteration 09).
 *
 * Owns all DOM work for the 5-reel grid:
 *   • Building symbol-strip elements from GameLogic reel data.
 *   • Animating each strip through spin → decelerate → overshoot → settle.
 *   • CSS-only motion blur (replaces SVG <filter> from Iteration 08) via
 *     will-change + CSS blur() — compatible with Firefox and Safari.
 *   • Fast-Play timing table (≈1.2 s total spin when active).
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
    /** Fast-Play first-reel stop (ms). Last reel ≈ 1.0 s + OVERSHOOT. */
    FAST_FIRST_STOP_MS:  600,
    /** Fast-Play stagger (ms). */
    FAST_REEL_STAGGER:   100,
    /** Duration of the overshoot → settle bounce (ms). */
    OVERSHOOT_MS:        180,
    /** Overshoot distance expressed in symbol-heights. */
    OVERSHOOT_FRACTION:  0.5,
    /** Approximate full rotations during the high-speed phase. */
    HIGH_SPEED_WRAPS:    8,
    /** Fraction of Phase 1 at which motion blur is removed (strip decelerates). */
    BLUR_LIFT_FRACTION:  0.6,
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
    div.innerHTML = SYMBOL_SVG[symbolId] || SYMBOL_SVG.screw;
    return div;
  }

  // ── Public API ─────────────────────────────────────────────────────
  return Object.freeze({

    /** Expose CFG so the orchestrator can read timing values. */
    CFG,

    /** Expose SYMBOL_SVG for any module that needs to render a symbol inline. */
    SYMBOL_SVG,

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
     * Animate one reel through its full spin cycle.
     * @description
     *   Phase 1 (deceleration):  strip travels `HIGH_SPEED_WRAPS` full rotations
     *     with an ease-out curve; CSS blur simulates motion-blur (no SVG filter).
     *   Phase 2 (overshoot):     strip continues past target by
     *     `OVERSHOOT_FRACTION` symbol-heights.
     *   Phase 3 (settle):        strip bounces back to the exact target.
     *   Phase 4 (snap):          transition cleared; strip pinned to a clean
     *     "2nd repetition" offset to prevent sub-pixel drift over many spins.
     *
     *   Motion blur is implemented with the CSS `blur()` filter and a gentle
     *   `opacity` dip — both GPU-composited and compatible with all major
     *   browsers. The SVG <filter id="vblur"> from Iteration 08 is gone.
     * @param {number} reelIndex    - Column index (0–4).
     * @param {number} targetStop   - Strip index of the winning centre symbol.
     * @param {number} spinDuration - Phase-1 duration in ms.
     * @returns {Promise<void>} Resolves after the reel fully settles.
     */
    animateReel(reelIndex, targetStop, spinDuration) {
      return new Promise(resolve => {
        const strip = $('strip-' + reelIndex);
        if (!strip) { resolve(); return; }

        const reel    = GameLogic.REELS[reelIndex];
        const total   = reel.length;
        const symH    = CFG.SYMBOL_HEIGHT;

        // Start from a random position in the 2nd repetition.
        const startPos  = (total + RNG.randInt(0, total - 1) - 1) * symH;
        // Target: winning symbol centred (row 1) in the 2nd repetition.
        const targetPos = (total + targetStop - 1) * symH;
        // The high-speed phase adds HIGH_SPEED_WRAPS full rotations so
        // the reel looks like it's genuinely flying.
        const finalPos  = targetPos + CFG.HIGH_SPEED_WRAPS * symH;
        const overshoot = symH * CFG.OVERSHOOT_FRACTION;

        // Snap to start position without animating.
        strip.style.transition = 'none';
        strip.style.transform  = `translateY(-${startPos}px)`;
        strip.classList.remove('is-decelerating', 'is-settling');
        strip.classList.add('is-spinning');

        // Force a reflow so the class and transform take effect before
        // the transition starts.
        // eslint-disable-next-line no-unused-expressions
        strip.offsetHeight;

        // Phase 1: ease-out deceleration toward finalPos + overshoot.
        strip.style.transition = `transform ${spinDuration}ms cubic-bezier(0.12, 0.82, 0.18, 1)`;
        strip.style.transform  = `translateY(-${finalPos + overshoot}px)`;

        // At ~60% of Phase 1 the strip is slow enough to remove heavy blur.
        const blurLiftMs = Math.floor(spinDuration * CFG.BLUR_LIFT_FRACTION);
        const t1 = setTimeout(() => {
          if (!_spinning) return;
          strip.classList.remove('is-spinning');
          strip.classList.add('is-decelerating');
        }, blurLiftMs);

        // Phase 1 → Phase 2: overshoot bounce.
        const t2 = setTimeout(() => {
          clearTimeout(t1); // already fired, no-op; guard for safety
          strip.classList.remove('is-decelerating');
          strip.classList.add('is-settling');
          strip.style.transition = `transform ${CFG.OVERSHOOT_MS}ms cubic-bezier(0.4, 0, 0.3, 1)`;
          strip.style.transform  = `translateY(-${finalPos}px)`;
        }, spinDuration);

        // Phase 2 → Phase 4: snap to clean target, resolve the promise.
        setTimeout(() => {
          clearTimeout(t2);
          strip.classList.remove('is-settling');
          strip.style.transition = 'none';
          strip.style.transform  = `translateY(-${targetPos}px)`;
          resolve();
        }, spinDuration + CFG.OVERSHOOT_MS);
      });
    },

    /**
     * Compute per-reel spin durations for all columns.
     * @param {boolean} fastPlay - True when Fast Play mode is active.
     * @returns {number[]} Array of durations in ms, one per reel.
     */
    spinDurations(fastPlay) {
      const first   = fastPlay ? CFG.FAST_FIRST_STOP_MS : CFG.FIRST_STOP_MS;
      const stagger = fastPlay ? CFG.FAST_REEL_STAGGER  : CFG.PER_REEL_STAGGER;
      return Array.from(
        { length: GameLogic.REEL_COUNT },
        (_, i) => first + i * stagger
      );
    },
  });
})();
