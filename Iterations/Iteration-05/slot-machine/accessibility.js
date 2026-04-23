/**
 * accessibility.js — Accessibility features and toggles.
 *
 * Features:
 *  - Reduce Motion: disables CSS animations, reel physics, spin effects
 *  - High Contrast: adds .high-contrast class for stronger colour overrides
 *  - Large Text:    adds .large-text class to scale up font-sizes
 *  - Mute Audio:    passes muted flag to Audio module
 *
 * Preferences are persisted to localStorage so they survive page reloads.
 */

'use strict';

const Accessibility = (() => {
  const STORAGE_KEY = 'luckyReels_a11y_prefs';

  const DEFAULTS = {
    reduceMotion:  false,
    highContrast:  false,
    largeText:     false,
    muted:         false,
  };

  let prefs = { ...DEFAULTS };

  /* ---- Persistence --------------------------------------- */

  function _loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) prefs = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
  }

  function _savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }

  /* ---- Apply preferences --------------------------------- */

  function _applyAll() {
    document.body.classList.toggle('reduce-motion',  prefs.reduceMotion);
    document.body.classList.toggle('high-contrast',  prefs.highContrast);
    document.body.classList.toggle('large-text',     prefs.largeText);

    // Sync system prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('reduce-motion');
      prefs.reduceMotion = true;
    }

    Audio.setMuted(prefs.muted);
  }

  /* ---- Toggle handlers ----------------------------------- */

  function _bindToggle(inputId, prefKey, onChangeFn) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.checked = prefs[prefKey];
    el.addEventListener('change', () => {
      prefs[prefKey] = el.checked;
      _savePrefs();
      if (onChangeFn) onChangeFn(el.checked);
    });
  }

  /* ---- Panel open/close ---------------------------------- */

  function _bindPanel() {
    const toggleBtn = document.getElementById('a11y-toggle-btn');
    const optionsEl = document.getElementById('a11y-options');

    if (!toggleBtn || !optionsEl) return;

    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      optionsEl.hidden = expanded;
    });

    // Close when clicking outside
    document.addEventListener('click', e => {
      if (!document.getElementById('a11y-panel').contains(e.target)) {
        toggleBtn.setAttribute('aria-expanded', 'false');
        optionsEl.hidden = true;
      }
    }, true);
  }

  /* ---- System preference observer ----------------------- */

  function _observeSystemPrefs() {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    mql.addEventListener('change', e => {
      if (e.matches && !prefs.reduceMotion) {
        prefs.reduceMotion = true;
        document.body.classList.add('reduce-motion');
        const el = document.getElementById('toggle-reduce-motion');
        if (el) el.checked = true;
        _savePrefs();
      }
    });
  }

  /* ---- Public API ---------------------------------------- */

  function init() {
    _loadPrefs();
    _applyAll();
    _bindPanel();

    _bindToggle('toggle-reduce-motion', 'reduceMotion', val => {
      document.body.classList.toggle('reduce-motion', val);
    });

    _bindToggle('toggle-high-contrast', 'highContrast', val => {
      document.body.classList.toggle('high-contrast', val);
    });

    _bindToggle('toggle-large-text', 'largeText', val => {
      document.body.classList.toggle('large-text', val);
    });

    _bindToggle('toggle-mute', 'muted', val => {
      Audio.setMuted(val);
    });

    _observeSystemPrefs();
  }

  function isReducedMotion() { return prefs.reduceMotion || document.body.classList.contains('reduce-motion'); }
  function isMuted()         { return prefs.muted; }

  return { init, isReducedMotion, isMuted };
})();
