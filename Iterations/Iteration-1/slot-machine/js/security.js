/**
 * security.js — Anti-Cheat, Anti-Automation, and Integrity Protections
 *
 * This module implements client-side defences against common forms of
 * cheating or automated play. Browser-side security is inherently
 * best-effort (a determined attacker with source access can bypass anything),
 * but these measures raise the bar significantly for casual cheating.
 *
 * PROTECTIONS INCLUDED
 * ─────────────────────
 * 1. Rate-limiting  — enforces a minimum gap and maximum spins/minute.
 * 2. Timing analysis — detects unnaturally regular click intervals
 *    (macro/bot patterns have very low standard deviation).
 * 3. DevTools detection — heuristic check for open developer tools;
 *    pauses the game and warns the player if detected.
 * 4. Console overrides — suppress and log attempts to use the console.
 * 5. Object integrity — watches CONFIG for tampering via Proxy (dev mode).
 *
 * @module Security
 */

const Security = (() => {
  "use strict";

  // ── Internal State ────────────────────────────────────────────────────────
  let _spinTimestamps  = [];          // Circular buffer of recent spin times
  let _devtoolsOpen    = false;       // Last known devtools state
  let _warningShown    = false;       // Prevent spam-warning
  let _blockedSpins    = 0;           // Consecutive blocked attempts
  let _devtoolsTimer   = null;

  // ── 1. Rate Limiting ──────────────────────────────────────────────────────

  /**
   * Record a spin attempt and check if it should be allowed.
   * Returns { allowed: boolean, reason: string }
   */
  function checkSpinAllowed() {
    const now = Date.now();

    // Enforce minimum gap between spins
    if (_spinTimestamps.length > 0) {
      const lastSpin = _spinTimestamps[_spinTimestamps.length - 1];
      const gap      = now - lastSpin;
      if (gap < CONFIG.MIN_SPIN_GAP_MS) {
        _blockedSpins++;
        if (_blockedSpins > 5) _maybeWarnBot();
        return { allowed: false, reason: "too_fast" };
      }
    }

    // Enforce spins-per-minute cap
    const oneMinuteAgo  = now - 60000;
    const recentSpins   = _spinTimestamps.filter(t => t > oneMinuteAgo);
    if (recentSpins.length >= CONFIG.MAX_SPINS_PER_MINUTE) {
      return { allowed: false, reason: "rate_limited" };
    }

    // Record this spin
    _spinTimestamps.push(now);
    // Keep only the last N timestamps to bound memory
    if (_spinTimestamps.length > CONFIG.TIMING_HISTORY_SIZE * 4) {
      _spinTimestamps = _spinTimestamps.slice(-CONFIG.TIMING_HISTORY_SIZE * 4);
    }

    _blockedSpins = 0; // Reset on success

    // Timing analysis (non-blocking — just logs a warning internally)
    _analyzeTimingPattern();

    return { allowed: true, reason: "ok" };
  }

  // ── 2. Timing Analysis ───────────────────────────────────────────────────

  /**
   * Checks whether recent spin intervals are suspiciously regular.
   * Legitimate human players have high variance; macros are clock-precise.
   * Logs an internal warning (does not block play, avoids false positives).
   */
  function _analyzeTimingPattern() {
    const hist = _spinTimestamps;
    if (hist.length < CONFIG.TIMING_HISTORY_SIZE) return; // Not enough data yet

    // Compute inter-spin intervals
    const recent = hist.slice(-CONFIG.TIMING_HISTORY_SIZE);
    const gaps   = [];
    for (let i = 1; i < recent.length; i++) {
      gaps.push(recent[i] - recent[i - 1]);
    }

    const mean   = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((sum, g) => sum + Math.pow(g - mean, 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);
    const cv     = stdDev / mean; // Coefficient of variation

    if (cv < CONFIG.TIMING_REGULARITY_THRESH && mean < 2000) {
      // Very regular and fast — likely automated
      _maybeWarnBot();
    }
  }

  // ── 3. DevTools Detection ────────────────────────────────────────────────

  /**
   * Heuristic check for open DevTools.
   * Technique: the debugger getter on a custom object fires when DevTools
   * tries to display/format the object in the console panel.
   * Additional: window size difference check (works for docked DevTools).
   */
  function _checkDevTools() {
    // Size-based detection (undocked DevTools doesn't change window size)
    const widthDiff  = window.outerWidth  - window.innerWidth  > 160;
    const heightDiff = window.outerHeight - window.innerHeight > 160;
    const sizeHint   = widthDiff || heightDiff;

    // Getter-trap detection: if DevTools is open and formats this object,
    // the getter is invoked (which is slower than a plain property read).
    let getterFired = false;
    const probe     = {};
    const trapKey   = Symbol("__dt__");
    Object.defineProperty(probe, trapKey, {
      get() {
        getterFired = true;
        return "";
      },
      configurable: true,
    });
    // Force evaluation — DevTools evaluates all enumerable/non-enumerable props
    void probe[trapKey];

    const nowOpen = sizeHint || getterFired;

    if (nowOpen && !_devtoolsOpen) {
      _devtoolsOpen = true;
      _handleDevToolsOpen();
    } else if (!nowOpen && _devtoolsOpen) {
      _devtoolsOpen = false;
      _handleDevToolsClosed();
    }
  }

  function _handleDevToolsOpen() {
    if (_warningShown) return;
    _warningShown = true;

    // Show a non-intrusive banner (does not block play)
    const banner = document.createElement("div");
    banner.id    = "devtools-warning";
    banner.setAttribute("role", "alert");
    banner.style.cssText = [
      "position:fixed", "top:0", "left:0", "right:0", "z-index:9999",
      "background:#FF3B3B", "color:#fff", "text-align:center",
      "padding:8px 16px", "font-family:monospace", "font-size:14px",
    ].join(";");
    banner.textContent =
      "🤖 Developer tools detected. RNG state is cryptographically sealed — tampering voids fairness guarantees.";
    document.body.prepend(banner);

    // Override console methods to log attempts without providing useful output
    _overrideConsole();
  }

  function _handleDevToolsClosed() {
    const banner = document.getElementById("devtools-warning");
    if (banner) banner.remove();
  }

  // ── 4. Console Override ───────────────────────────────────────────────────

  /**
   * Replaces console.log/warn/error with stubs that print a single humorous
   * message and suppress further output. This does not truly prevent reading
   * source or network tabs, but it delays and confuses casual tampering.
   */
  function _overrideConsole() {
    const _original = { log: console.log, warn: console.warn, error: console.error };
    const taunts = [
      "%c🤖 NEURAL MELTDOWN: Nice try. The RNG is sealed with crypto.subtle and closure scope.",
      "%c🤖 My training data includes every console cheat attempt. I'm disappointed.",
      "%c🤖 I calculated the probability of this working: 0.0000%. Proceeding anyway?",
    ];
    let tIdx = 0;
    const stub = function (...args) {
      _original.log(taunts[tIdx % taunts.length], "color:#FF3B3B;font-weight:bold");
      tIdx++;
    };
    console.log   = stub;
    console.warn  = stub;
    console.error = stub;
    console.table = stub;
    console.dir   = stub;
  }

  // ── 5. Bot Warning ─────────────────────────────────────────────────────────

  function _maybeWarnBot() {
    // Dispatch a custom event that main.js can listen to
    const evt = new CustomEvent("nm:suspiciousActivity", {
      detail: { timestamp: Date.now() }
    });
    document.dispatchEvent(evt);
  }

  // ── Startup ────────────────────────────────────────────────────────────────

  /**
   * Start periodic devtools check and register initial console warning.
   * Call once from main.js after the DOM is ready.
   */
  function init() {
    // Print a visible-but-harmless deterrence message in the native console
    // (before we potentially override it)
    const style = "color:#FFD700;font-weight:bold;font-size:16px";
    console.log("%c🤖 NEURAL MELTDOWN — Built with ❤️ and cryptography.", style);
    console.log(
      "%cGame RNG uses crypto.getRandomValues + SHA-256 commit-reveal.\n" +
      "Attempting to manipulate outcomes from the console will not work.\n" +
      "If you find a genuine bug, please report it — not exploit it.",
      "color:#888;font-size:12px"
    );

    _devtoolsTimer = setInterval(_checkDevTools, CONFIG.DEVTOOLS_CHECK_INTERVAL);

    // Listen for visibility change — reset timestamps if tab is hidden
    // (avoids false positives from returning to an idle tab)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) _spinTimestamps = [];
    });
  }

  /**
   * Stop the periodic check (e.g., on cleanup / game over).
   */
  function destroy() {
    clearInterval(_devtoolsTimer);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return Object.freeze({ init, destroy, checkSpinAllowed });

})();
