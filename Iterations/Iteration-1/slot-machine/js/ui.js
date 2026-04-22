/**
 * ui.js — User Interface Controller
 *
 * Handles all DOM manipulation, animations, and visual feedback. This module
 * is the only place that directly touches the DOM (except for panel rendering
 * in the other modules, which own their own panel content).
 *
 * REEL ANIMATION
 * ──────────────
 * Each reel shows three emoji symbols (top, centre, bottom). During a spin,
 * symbols change at a fast rate that slows exponentially — simulating the
 * mechanical deceleration of a real reel. Reel 0 stops first, then 1, then
 * 2, each staggered by CONFIG.REEL_STAGGER_MS.
 *
 * The final centre symbol is the payline result. Top and bottom symbols are
 * chosen randomly from the weighted pool for visual variety.
 *
 * PARTICLE EFFECTS
 * ─────────────────
 * Wins trigger CSS-animated coin particles that burst from the reel area.
 * Big wins and jackpots use more particles and a screen flash overlay.
 *
 * ENGAGEMENT LOOP
 * ────────────────
 * The spin button pulses every CONFIG.FIDGET_PULSE_INTERVAL_MS when idle to
 * provide subtle visual stimulation. An idle prompt appears after
 * CONFIG.IDLE_PROMPT_DELAY_MS to gently encourage a return to play.
 *
 * @module UI
 */

const UI = (() => {
  "use strict";

  // ── Cached DOM References ─────────────────────────────────────────────────
  // Populated in init() after the DOM is ready
  let _spinBtn        = null;
  let _balanceEl      = null;
  let _winDisplay     = null;
  let _winAmountEl    = null;
  let _effectsLayer   = null;
  let _toastContainer = null;
  let _reels          = [];    // Array of { top, center, bottom } element refs

  // ── State ─────────────────────────────────────────────────────────────────
  let _onAnimComplete  = null;    // Callback set by GameLogic.spin()
  let _idleTimer       = null;
  let _fidgetTimer     = null;
  let _reelsStoppedCount = 0;
  let _pendingResult     = null;  // Stored during reel animation, used on stop

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    _spinBtn        = document.getElementById("spin-btn");
    _balanceEl      = document.getElementById("balance-display");
    _winDisplay     = document.getElementById("win-display");
    _winAmountEl    = document.getElementById("win-amount");
    _effectsLayer   = document.getElementById("effects-layer");
    _toastContainer = document.getElementById("toast-container");

    // Build reel element references
    for (let i = 0; i < CONFIG.REEL_COUNT; i++) {
      _reels.push({
        top:    document.getElementById(`reel-${i}-top`),
        center: document.getElementById(`reel-${i}-center`),
        bottom: document.getElementById(`reel-${i}-bottom`),
        el:     document.getElementById(`reel-${i}`),
      });
    }

    _startFidgetCycle();
    _startIdleWatcher();
    _setupPanelTabs();
    _setupAccessibilityToggles();
  }

  // ── Balance Display ────────────────────────────────────────────────────────

  /**
   * Animate the balance counter to a new value.
   * @param {number} newBalance
   */
  function updateBalance(newBalance) {
    if (!_balanceEl) return;
    const prev = parseInt(_balanceEl.textContent.replace(/,/g, ""), 10) || 0;
    _animateCounter(_balanceEl, prev, newBalance, 600);
  }

  function _animateCounter(el, from, to, duration) {
    const start     = performance.now();
    const diff      = to - from;

    function step(now) {
      const elapsed = now - start;
      const t       = Math.min(elapsed / duration, 1);
      const ease    = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
      el.textContent = Math.round(from + diff * ease).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Spin Animation ─────────────────────────────────────────────────────────

  /**
   * Start the spin animation on all reels.
   * `callback` is stored and invoked after all reels have stopped.
   * @param {function} callback
   */
  function startSpinAnimation(callback) {
    _onAnimComplete  = callback;
    _reelsStoppedCount = 0;
    _pendingResult   = null;

    // Disable spin button during animation
    if (_spinBtn) {
      _spinBtn.disabled = true;
      _spinBtn.classList.add("spinning");
    }

    // Hide previous win display
    _hideWinDisplay();
    _removeReelHighlights();

    // Start each reel with staggered stop times
    for (let i = 0; i < CONFIG.REEL_COUNT; i++) {
      const duration = CONFIG.SPIN_BASE_DURATION + i * CONFIG.REEL_STAGGER_MS;
      _spinReel(i, duration);
    }
  }

  /**
   * Spin a single reel for `duration` milliseconds, then show `finalSymbols`.
   * The final symbols are not known until the animation completes, so we store
   * the result and apply it in _onReelStopped().
   *
   * @param {number} reelIndex
   * @param {number} duration   - Total ms before this reel stops
   */
  function _spinReel(reelIndex, duration) {
    const reel     = _reels[reelIndex];
    const start    = Date.now();

    reel.el.classList.add("spinning");

    function tick() {
      const elapsed  = Date.now() - start;
      const t        = Math.min(elapsed / duration, 1);

      // Quadratic ease-out: starts at CONFIG.REEL_FAST_INTERVAL, ends at REEL_SLOW_INTERVAL
      const speed = CONFIG.REEL_FAST_INTERVAL +
                    Math.pow(t, 2) * (CONFIG.REEL_SLOW_INTERVAL - CONFIG.REEL_FAST_INTERVAL);

      if (t >= 1) {
        _onReelStopped(reelIndex);
        return;
      }

      // Show random symbols while spinning
      reel.top.textContent    = SecureRNG.weightedSymbol().emoji;
      reel.center.textContent = SecureRNG.weightedSymbol().emoji;
      reel.bottom.textContent = SecureRNG.weightedSymbol().emoji;

      setTimeout(tick, speed);
    }

    tick();
  }

  /**
   * Called when one reel's animation ends. Applies the final symbols if we
   * have the result yet; otherwise queues symbol application for when result
   * arrives. Fires the completion callback once ALL reels have stopped.
   */
  function _onReelStopped(reelIndex) {
    const reel = _reels[reelIndex];
    reel.el.classList.remove("spinning");
    reel.el.classList.add("landing");
    setTimeout(() => reel.el.classList.remove("landing"), 300);

    Audio.playReelStop();

    _reelsStoppedCount++;

    if (_reelsStoppedCount === CONFIG.REEL_COUNT) {
      // All reels stopped — fire async resolution in GameLogic
      Audio.stopSpin();
      if (_spinBtn) _spinBtn.disabled = false;
      if (typeof _onAnimComplete === "function") _onAnimComplete();
      _onAnimComplete = null;
    }
  }

  // ── Result Display ─────────────────────────────────────────────────────────

  /**
   * Called by GameLogic after the outcome is resolved.
   * Applies correct symbols to the reels and shows win/loss feedback.
   *
   * @param {object} result - From GameLogic._onAnimationComplete
   */
  function showSpinResult(result) {
    const { reelResult, type, payout, isJackpot, isPity, betAmount } = result;

    // Apply final reel symbols
    reelResult.center.forEach((sym, i) => {
      _reels[i].center.textContent = sym.emoji;
      // Top/bottom: weighted random for visual variety
      _reels[i].top.textContent    = SecureRNG.weightedSymbol().emoji;
      _reels[i].bottom.textContent = SecureRNG.weightedSymbol().emoji;
    });

    // Near-miss: offset the "miss" reel so the matching symbol is just above/below
    if (type === "near_miss" && reelResult.nearMissReel >= 0) {
      const mr     = reelResult.nearMissReel;
      const offset = reelResult.nearMissOffset;
      const sym    = reelResult.center[mr];  // The symbol that "almost" matched
      if (offset > 0) {
        _reels[mr].top.textContent    = sym.emoji;   // Symbol is just above payline
      } else {
        _reels[mr].bottom.textContent = sym.emoji;  // Symbol is just below payline
      }
      _showNearMissEffect(mr);
    }

    // Win feedback
    if (payout > 0) {
      if (isJackpot) {
        _showJackpotEffect(payout);
      } else if (payout >= betAmount * CONFIG.BIG_WIN_THRESHOLD) {
        _showBigWinEffect(payout, result);
      } else {
        _showWinEffect(payout, result);
      }
      _highlightPayline();
    }

    // Pity indicator
    if (isPity && payout > 0) {
      showToast("🛡️ Pity payout activated. The AI is merciful. Barely.", "info");
    }

    // Re-enable spin button and reset idle watcher
    if (_spinBtn) {
      _spinBtn.disabled = false;
      _spinBtn.classList.remove("spinning");
    }
    _resetIdleTimer();
  }

  // ── Win Effects ────────────────────────────────────────────────────────────

  function _showWinEffect(payout, result) {
    _showWinDisplay(payout);
    _spawnParticles(CONFIG.PARTICLE_COUNT_NORMAL, false);
    Audio.playWin();
    setTimeout(() => _hideWinDisplay(), CONFIG.WIN_DISPLAY_DURATION_MS);
  }

  function _showBigWinEffect(payout, result) {
    _showWinDisplay(payout, true);
    _spawnParticles(CONFIG.PARTICLE_COUNT_BIG, false);
    _flashScreen("big-win-flash", 1500);
    Audio.playBigWin();
    setTimeout(() => _hideWinDisplay(), CONFIG.WIN_DISPLAY_DURATION_MS + 500);
  }

  function _showJackpotEffect(payout) {
    _showWinDisplay(payout, true, true);
    _spawnParticles(CONFIG.PARTICLE_COUNT_BIG * 2, true);
    _flashScreen("jackpot-flash", CONFIG.JACKPOT_CELEBRATION_MS);
    Audio.playJackpot();
    setTimeout(() => _hideWinDisplay(), CONFIG.JACKPOT_CELEBRATION_MS);
  }

  function _showNearMissEffect(reelIndex) {
    const reel = _reels[reelIndex];
    reel.el.classList.add("near-miss-shake");
    setTimeout(() => reel.el.classList.remove("near-miss-shake"), 600);
    Audio.playNearMiss();
  }

  function _showWinDisplay(amount, big = false, jackpot = false) {
    if (!_winDisplay || !_winAmountEl) return;
    _winDisplay.className = `win-display visible${big ? " big" : ""}${jackpot ? " jackpot" : ""}`;
    _winAmountEl.textContent = amount.toLocaleString();

    // Animate win amount counting up
    _animateCounter(_winAmountEl, 0, amount, jackpot ? 2000 : 800);

    // Announce to screen readers
    _winDisplay.setAttribute("aria-label", `You won ${amount.toLocaleString()} credits!`);
  }

  function _hideWinDisplay() {
    if (!_winDisplay) return;
    _winDisplay.className = "win-display";
    _winAmountEl.textContent = "0";
  }

  function _highlightPayline() {
    document.querySelectorAll(".reel").forEach(r => r.classList.add("win-highlight"));
    setTimeout(() => {
      document.querySelectorAll(".reel").forEach(r => r.classList.remove("win-highlight"));
    }, CONFIG.WIN_DISPLAY_DURATION_MS);
  }

  function _removeReelHighlights() {
    document.querySelectorAll(".reel").forEach(r => {
      r.classList.remove("win-highlight", "near-miss-shake");
    });
  }

  // ── Particle Effects ────────────────────────────────────────────────────────

  function _spawnParticles(count, isGold) {
    if (!_effectsLayer) return;

    // Skip particles if reduced motion is active
    if (document.body.classList.contains("reduced-motion")) return;
    // Skip particles if epilepsy safe mode is active
    if (document.body.classList.contains("epilepsy-safe")) return;

    const reelArea = document.querySelector(".machine-cabinet");
    if (!reelArea) return;
    const rect = reelArea.getBoundingClientRect();

    for (let i = 0; i < count; i++) {
      const coin = document.createElement("span");
      coin.className = `particle ${isGold ? "gold-particle" : "coin-particle"}`;
      coin.textContent = isGold ? "💰" : "🪙";
      coin.setAttribute("aria-hidden", "true");

      // Randomise starting position across the reel area
      const startX = rect.left + Math.random() * rect.width;
      const startY = rect.top  + Math.random() * rect.height * 0.5;

      // Random trajectory
      const vx  = (Math.random() - 0.5) * 200;
      const vy  = -(60 + Math.random() * 180);
      const rot = (Math.random() - 0.5) * 720;

      coin.style.cssText = `
        left: ${startX}px;
        top: ${startY}px;
        --vx: ${vx}px;
        --vy: ${vy}px;
        --rot: ${rot}deg;
        animation-delay: ${Math.random() * 300}ms;
        animation-duration: ${800 + Math.random() * 600}ms;
      `;
      _effectsLayer.appendChild(coin);

      // Remove from DOM after animation finishes to avoid memory leak
      coin.addEventListener("animationend", () => coin.remove(), { once: true });
    }
  }

  // ── Screen Flash ────────────────────────────────────────────────────────────

  function _flashScreen(cssClass, duration) {
    if (document.body.classList.contains("epilepsy-safe")) return;
    const overlay = document.createElement("div");
    overlay.className = `screen-flash ${cssClass}`;
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);

    // Fade in then out
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      setTimeout(() => {
        overlay.style.opacity = "0";
        overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
      }, Math.min(duration * 0.3, 800));
    });
  }

  // ── Commitment Display ─────────────────────────────────────────────────────

  /**
   * Show the SHA-256 commitment hash during the spin for provable fairness.
   * @param {string} hash - Hex string
   */
  function showCommitment(hash) {
    const el = document.getElementById("commitment-hash");
    if (!el) return;
    el.textContent = hash.slice(0, 16) + "…";
    el.title       = `Full commitment: ${hash}`;
  }

  // ── Toast Notifications ────────────────────────────────────────────────────

  /**
   * Show a brief notification toast.
   * @param {string} message - HTML-safe string (or safe HTML for quest completions)
   * @param {string} [type]  - "info" | "warn" | "win" | "quest"
   * @param {number} [duration] - Display ms
   */
  function showToast(message, type = "info", duration = 3500) {
    if (!_toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.setAttribute("role", "status");
    toast.innerHTML = message;

    _toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add("visible"));

    // Remove after duration
    setTimeout(() => {
      toast.classList.remove("visible");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, duration);
  }

  // ── Achievement Toast ──────────────────────────────────────────────────────

  /**
   * Show a rich achievement unlock notification.
   * @param {object} def - Achievement definition from CONFIG
   */
  function showAchievementToast(def) {
    showToast(
      `${def.icon} <strong>${def.label}</strong><br><small>${def.desc}</small>`,
      "win",
      4500
    );
  }

  // ── Panel Tabs ─────────────────────────────────────────────────────────────

  function _setupPanelTabs() {
    const tabs    = document.querySelectorAll(".panel-tab");
    const panels  = document.querySelectorAll(".panel-content");

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const targetId = tab.getAttribute("aria-controls");

        // Deactivate all
        tabs.forEach(t => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        panels.forEach(p => {
          p.classList.remove("active");
          p.hidden = true;
        });

        // Activate target
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        const panel = document.getElementById(targetId);
        if (panel) {
          panel.classList.add("active");
          panel.hidden = false;
        }

        if (typeof Audio !== "undefined") Audio.playClick();
      });
    });
  }

  // ── Accessibility Toggles ─────────────────────────────────────────────────

  function _setupAccessibilityToggles() {
    const body = document.body;

    // Epilepsy safe mode — removes flashes and rapid animations
    const epilepsyBtn = document.getElementById("toggle-epilepsy");
    if (epilepsyBtn) {
      epilepsyBtn.addEventListener("click", () => {
        const active = body.classList.toggle("epilepsy-safe");
        epilepsyBtn.setAttribute("aria-pressed", String(active));
        showToast(active ? "⚡ Epilepsy safe mode ON — flashes and particles disabled." : "⚡ Epilepsy safe mode OFF.", "info");
      });
    }

    // Reduced motion
    const motionBtn = document.getElementById("toggle-reduced-motion");
    if (motionBtn) {
      // Respect OS prefers-reduced-motion by default
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        body.classList.add("reduced-motion");
        motionBtn.setAttribute("aria-pressed", "true");
      }
      motionBtn.addEventListener("click", () => {
        const active = body.classList.toggle("reduced-motion");
        motionBtn.setAttribute("aria-pressed", String(active));
      });
    }

    // High contrast
    const contrastBtn = document.getElementById("toggle-high-contrast");
    if (contrastBtn) {
      contrastBtn.addEventListener("click", () => {
        const active = body.classList.toggle("high-contrast");
        contrastBtn.setAttribute("aria-pressed", String(active));
      });
    }

    // Music toggle
    const musicBtn = document.getElementById("toggle-music");
    if (musicBtn) {
      musicBtn.addEventListener("click", () => {
        const on = Audio.toggleMusic();
        musicBtn.setAttribute("aria-pressed", String(on));
        musicBtn.textContent = on ? "🎵" : "🔇";
      });
    }

    // Volume slider
    const volSlider = document.getElementById("volume-slider");
    if (volSlider) {
      volSlider.addEventListener("input", () => {
        const vol = parseInt(volSlider.value, 10) / 100;
        Audio.setMasterVolume(vol);
        volSlider.setAttribute("aria-valuenow", volSlider.value);
      });
    }
  }

  // ── Fidget & Idle Cycle ────────────────────────────────────────────────────

  /**
   * Subtle pulse animation on the spin button to maintain engagement.
   */
  function _startFidgetCycle() {
    _fidgetTimer = setInterval(() => {
      if (!_spinBtn || GameLogic.isSpinning()) return;
      _spinBtn.classList.add("fidget-pulse");
      setTimeout(() => _spinBtn.classList.remove("fidget-pulse"), 1200);
    }, CONFIG.FIDGET_PULSE_INTERVAL_MS);
  }

  /**
   * Prompt player if they've been inactive for a while.
   */
  function _startIdleWatcher() {
    _resetIdleTimer();
  }

  function _resetIdleTimer() {
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
      showToast("🤖 Still there? My model predicts a 73% chance you'll spin again. Don't prove it wrong.", "info", 5000);
      // Re-trigger fidget pulse
      if (_spinBtn) {
        _spinBtn.classList.add("idle-bounce");
        setTimeout(() => _spinBtn.classList.remove("idle-bounce"), 2000);
      }
    }, CONFIG.IDLE_PROMPT_DELAY_MS);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return Object.freeze({
    init,
    updateBalance,
    startSpinAnimation,
    showSpinResult,
    showCommitment,
    showToast,
    showAchievementToast,
  });

})();
