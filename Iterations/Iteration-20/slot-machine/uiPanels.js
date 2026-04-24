/**
 * uiPanels.js — Slide-over panels, settings, leaderboard, and achievement
 * rendering (Iteration 09).
 *
 * Owns:
 *   • openPanel / closePanel (slide-over overlay lifecycle).
 *   • Panel navigation button wiring (nav bar + close buttons + overlay click).
 *   • Settings panel: audio toggles, volume sliders, Fast Play toggle,
 *     accessibility toggles, player avatar (name + colour), data-reset.
 *   • Leaderboard rendering in the sidebar widget and the full panel.
 *   • Stats sidebar widget updates.
 *   • Achievements grid rendering (sidebar) and full-panel list.
 *
 * All Settings changes are written to State immediately. On boot,
 * `applySettings()` hydrates the live UI from the persisted State.
 *
 * @module UiPanels
 */
const UiPanels = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIG
  // ═══════════════════════════════════════════════════════════════════
  /** @type {Object} Panel and rendering tunables. */
  const CFG = Object.freeze({
    /** Number of leaderboard entries shown in the sidebar. */
    LB_SIDEBAR_COUNT: 8,
    /** Number of leaderboard entries shown in the full panel. */
    LB_FULL_COUNT:    20,
  });

  // ── DOM helper ─────────────────────────────────────────────────────
  /** @param {string} id @returns {HTMLElement|null} */
  const $ = id => document.getElementById(id);
  /** @param {string} sel @returns {NodeListOf<HTMLElement>} */
  const $$ = sel => document.querySelectorAll(sel);

  // ── DOM references ─────────────────────────────────────────────────
  const panelOverlay         = $('panel-overlay');
  const lbList               = $('leaderboard-list');
  const lbFull               = $('leaderboard-full');
  const achGrid              = $('achievements-grid');
  const statsSpins           = $('stat-spins');
  const statsWins            = $('stat-wins');
  const statsBest            = $('stat-best');
  const statsJackpots        = $('stat-jackpots');
  const statsTime            = $('stat-time');
  const statsFullEl          = $('stats-full');
  const achFullEl            = $('achievements-full');
  // Settings controls
  const toggleSound          = $('toggle-sound');
  const toggleMusic          = $('toggle-music');
  const toggleReducedMotion  = $('toggle-reduced-motion');
  const toggleEpilepsySafe   = $('toggle-epilepsy-safe');
  const toggleFastPlay       = $('toggle-fast-play');
  const volumeMaster         = $('volume-master');
  const volumeMusic          = $('volume-music');
  const playerNameInput      = $('player-name');
  const btnResetData         = $('btn-reset-data');
  const themeSelect          = $('theme-select');

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * HTML-escape a value for safe innerHTML insertion.
   * @param {*} str
   * @returns {string}
   */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Return the inline SVG markup for an achievement icon identifier.
   * @param {string} icon - Icon key.
   * @returns {string} SVG markup string.
   */
  function _achIcon(icon) {
    const icons = {
      spin:    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="12,6 16,14 8,14" fill="currentColor"/></svg>`,
      bolt:    `<svg viewBox="0 0 24 24"><polygon points="13,2 6,13 11,13 11,22 18,11 13,11" fill="currentColor"/></svg>`,
      gear:    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/></svg>`,
      star:    `<svg viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="currentColor"/></svg>`,
      jackpot: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".3"/><text x="12" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="currentColor">7</text></svg>`,
      coin:    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".4"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      clock:   `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="6" x2="12" y2="13" stroke="currentColor" stroke-width="2"/><line x1="12" y1="13" x2="16" y2="16" stroke="currentColor" stroke-width="2"/></svg>`,
      heart:   `<svg viewBox="0 0 24 24"><path d="M12 21C12 21 3 14 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 13-9 13z" fill="currentColor"/></svg>`,
      chat:    `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    };
    return icons[icon] || icons.star;
  }

  // ── Theme helpers (Iteration 18) ──────────────────────────────────

  /**
   * Swap the logo text to match the active theme.
   * @param {string} theme - Theme id ('robot' or 'lizard-hopper').
   */
  function _updateLogoText(theme) {
    const el = document.querySelector('.logo-text');
    if (!el) return;
    if (theme === 'lizard-hopper') {
      el.innerHTML = 'LIZARD-HOPPER <span class="logo-3000">3000</span>';
    } else {
      el.innerHTML = 'ROBO-SLOTS <span class="logo-3000">3000</span>';
    }
  }

  /**
   * Apply a theme: swap body class, update logo, rebuild reel strips, persist.
   * @param {string} theme - Theme id ('robot' or 'lizard-hopper').
   */
  function _applyTheme(theme) {
    document.body.className = document.body.className
      .replace(/\btheme-\S+/g, '').trim() + ' theme-' + theme;
    _updateLogoText(theme);
    UiReels.buildAllStrips();
    State.set('settings.theme', theme);
  }

  // ── Panel lifecycle ────────────────────────────────────────────────

  /**
   * Open a slide-over panel by element id.
   * @param {string} id - Panel element id.
   * @returns {void}
   */
  function _openPanel(id) {
    const panel = $(id);
    if (!panel) return;
    panel.removeAttribute('hidden');
    if (panelOverlay) {
      panelOverlay.classList.add('active');
      panelOverlay.setAttribute('aria-hidden', 'false');
    }
    panel.focus();
    Audio.playClick();
  }

  /**
   * Close a slide-over panel by element id.
   * @param {string} id - Panel element id.
   * @returns {void}
   */
  function _closePanel(id) {
    const panel = $(id);
    if (!panel) return;
    panel.setAttribute('hidden', '');
    if (panelOverlay) {
      panelOverlay.classList.remove('active');
      panelOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  // ── Wire panel navigation ──────────────────────────────────────────
  ['leaderboard', 'achievements', 'stats', 'settings', 'chat'].forEach(name => {
    const btn = $('btn-' + name);
    if (btn) btn.addEventListener('click', () => _openPanel('panel-' + name));
  });

  // ── Payout table ───────────────────────────────────────────────────
  /**
   * Render the payout table into the payouts panel content area.
   * Reads multipliers directly from GameLogic.PAYOUTS and symbol icons
   * from UiReels.SYMBOL_SVG. Jackpot symbol rows note pool triggers.
   * @returns {void}
   */
  function _renderPayoutsTable() {
    const el = $('payouts-table-content');
    if (!el) return;
    const P = GameLogic.PAYOUTS;

    function _fmtCell(symId, tier) {
      if (symId === 'jackpot') {
        return tier === 'TWO'
          ? `<td class="pt-nil">—</td>`
          : `<td class="pt-jp">POOL</td>`;
      }
      const v = P[tier][symId];
      return v === undefined
        ? `<td class="pt-nil">—</td>`
        : `<td>${v}&times;</td>`;
    }

    let html = `
      <table class="payout-table">
        <thead><tr>
          <th>Symbol</th>
          <th>&times;2</th>
          <th>&times;3</th>
          <th>&times;4</th>
          <th>&times;5</th>
        </tr></thead>
        <tbody>`;

    for (const sym of GameLogic.SYMBOLS) {
      const isLizard = document.body.classList.contains('theme-lizard-hopper');
      const svgMap = isLizard ? UiReels.SYMBOL_SVG_LIZARD_HOPPER : UiReels.SYMBOL_SVG;
      const icon = svgMap[sym.id] || UiReels.SYMBOL_SVG[sym.id] || '';
      html += `<tr>
        <td>
          <div class="pt-sym-cell">
            <span class="pt-sym-icon">${icon}</span>
            <span class="pt-sym-label">${_esc(sym.label)}</span>
          </div>
        </td>
        ${_fmtCell(sym.id, 'TWO')}
        ${_fmtCell(sym.id, 'THREE')}
        ${_fmtCell(sym.id, 'FOUR')}
        ${_fmtCell(sym.id, 'FIVE')}
      </tr>`;
    }

    html += '</tbody></table>';
    el.innerHTML = html;
  }

  const btnPayouts = $('btn-payouts');
  if (btnPayouts) {
    btnPayouts.addEventListener('click', () => {
      _renderPayoutsTable();
      _openPanel('panel-payouts');
    });
  }

  $$('.panel-close').forEach(btn => {
    btn.addEventListener('click', () => _closePanel(btn.dataset.close));
  });

  if (panelOverlay) {
    panelOverlay.addEventListener('click', () => {
      $$('.slide-panel:not([hidden])').forEach(p => _closePanel(p.id));
    });
  }

  // ── Stats panel button — populate full stats on open ──────────────
  const btnStats = $('btn-stats');
  if (btnStats) {
    btnStats.addEventListener('click', () => {
      if (!statsFullEl) return;
      const s = Achievements.stats;
      statsFullEl.innerHTML = `
        <dl class="stats-list">
          <div class="stat-row"><dt>Total Spins</dt>      <dd>${s.spins    || 0}</dd></div>
          <div class="stat-row"><dt>Total Wins</dt>       <dd>${s.wins     || 0}</dd></div>
          <div class="stat-row"><dt>Best Single Win</dt>  <dd>${GameLogic.formatMoney(s.bestWin || 0)}</dd></div>
          <div class="stat-row"><dt>Jackpots Hit</dt>     <dd>${s.jackpots || 0}</dd></div>
          <div class="stat-row"><dt>Pity Triggers</dt>    <dd>${s.pityTriggers || 0}</dd></div>
          <div class="stat-row"><dt>Chat Messages</dt>    <dd>${s.chatMessages || 0}</dd></div>
          <div class="stat-row"><dt>Time Played</dt>      <dd>${Achievements.formatTime(s.timePlayed || 0)}</dd></div>
          <div class="stat-row"><dt>Session #</dt>        <dd>${State.sessionCount()}</dd></div>
          <div class="stat-row"><dt>Achievements</dt>     <dd>${(State.get('unlockedAchievements') || []).length} / ${Achievements.getDefs().length}</dd></div>
        </dl>
      `;
    });
  }

  // ── Achievements panel button — populate full list on open ─────────
  const btnAchievements = $('btn-achievements');
  if (btnAchievements) {
    btnAchievements.addEventListener('click', () => {
      if (!achFullEl) return;
      achFullEl.innerHTML = '';
      Achievements.getDefs().forEach(def => {
        const unlocked = Achievements.isUnlocked(def.id);
        const div = document.createElement('div');
        div.className = 'ach-badge' + (unlocked ? ' unlocked' : '');
        div.style.cssText = [
          'display:flex', 'gap:12px', 'align-items:center',
          'padding:12px', 'margin-bottom:8px',
          'border-radius:8px', 'background:var(--surface)',
          'border:1px solid var(--border)',
        ].join(';');
        div.innerHTML = `
          <div style="flex-shrink:0;width:36px;height:36px;color:${unlocked ? 'var(--yellow)' : 'var(--text-dim)'}">
            ${_achIcon(def.icon)}
          </div>
          <div>
            <div style="font-weight:700;color:${unlocked ? 'var(--yellow)' : 'var(--text-dim)'}">
              ${_esc(def.label)}
            </div>
            <div style="font-size:0.8rem;color:var(--text-dim)">${_esc(def.desc)}</div>
            ${unlocked ? '<div style="font-size:0.72rem;color:var(--green);margin-top:3px">✓ Unlocked</div>' : ''}
          </div>
        `;
        achFullEl.appendChild(div);
      });
    });
  }

  // ── Leaderboard rendering ──────────────────────────────────────────

  /**
   * Render leaderboard entries into a list element (diff-update).
   * @param {Array<{id:string,name:string,color:string,amount:number,isBot:boolean}>} list
   * @param {HTMLOListElement|null} el - Target <ol>.
   * @param {number} maxEntries - Maximum rows to render.
   * @returns {void}
   */
  function _renderLeaderboard(list, el, maxEntries) {
    if (!el) return;
    const entries = list.slice(0, maxEntries);
    const existing = el.children;
    entries.forEach((entry, i) => {
      const rankClass   = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const playerClass = entry.isBot ? '' : 'is-player';
      const html = `
        <span class="lb-rank ${rankClass}">#${i + 1}</span>
        <svg class="lb-avatar" viewBox="0 0 20 20" style="background:${_esc(entry.color)}">
          <circle cx="10" cy="8" r="4" fill="rgba(0,0,0,0.3)"/>
          <rect x="4" y="14" width="12" height="5" rx="3" fill="rgba(0,0,0,0.3)"/>
        </svg>
        <span class="lb-name">${_esc(entry.name)}</span>
        <span class="lb-amount">${Leaderboard.formatAmount(entry.amount)}</span>
      `;
      if (existing[i]) {
        existing[i].innerHTML = html;
        existing[i].className = 'lb-entry ' + playerClass;
      } else {
        const li = document.createElement('li');
        li.className = 'lb-entry ' + playerClass;
        li.innerHTML = html;
        el.appendChild(li);
      }
    });
    while (el.children.length > entries.length) el.removeChild(el.lastChild);
  }

  /**
   * Re-render both the sidebar and full-panel leaderboards.
   * @returns {void}
   */
  function _refreshLeaderboard() {
    _renderLeaderboard(Leaderboard.getTop(CFG.LB_SIDEBAR_COUNT), lbList, CFG.LB_SIDEBAR_COUNT);
    _renderLeaderboard(Leaderboard.getAll(), lbFull, CFG.LB_FULL_COUNT);
  }

  // Initial render + subscribe to bot-update events.
  _refreshLeaderboard();
  Leaderboard.onChange(_refreshLeaderboard);

  // ── Settings ───────────────────────────────────────────────────────

  /**
   * Apply a settings snapshot to the live UI, audio engine, and body datasets.
   * @description Called on boot to hydrate from persistent State, and whenever
   *   a batch of settings must be applied at once (e.g., after a data reset).
   * @param {Object} s - Settings block (same shape as State `settings` object).
   * @returns {void}
   */
  function _applySettings(s) {
    if (!s) return;
    if (toggleSound)         toggleSound.checked         = !!s.sfxEnabled;
    if (toggleMusic)         toggleMusic.checked         = !!s.musicEnabled;
    if (toggleReducedMotion) toggleReducedMotion.checked = !!s.reducedMotion;
    if (toggleEpilepsySafe)  toggleEpilepsySafe.checked  = !!s.epilepsySafe;
    if (toggleFastPlay)      toggleFastPlay.checked      = !!s.fastPlay;
    if (volumeMaster)        volumeMaster.value          = String(s.masterVolume ?? 70);
    if (volumeMusic)         volumeMusic.value           = String(s.musicVolume  ?? 40);

    Audio.setSfxEnabled(!!s.sfxEnabled);
    Audio.setMusicEnabled(!!s.musicEnabled);
    Audio.setMasterVolume(Number(s.masterVolume ?? 70));
    Audio.setMusicVolume(Number(s.musicVolume   ?? 40));

    document.body.dataset.reducedmotion = String(!!s.reducedMotion);
    document.body.dataset.epilepsysafe  = String(!!s.epilepsySafe);

    // Iteration 18: theme
    const theme = s.theme || 'robot';
    if (themeSelect) themeSelect.value = theme;
    document.body.className = document.body.className
      .replace(/\btheme-\S+/g, '').trim() + ' theme-' + theme;
    _updateLogoText(theme);
    // Reel strips are rebuilt by ui.js after _applySettings on boot;
    // on live changes the themeSelect listener calls _applyTheme instead.
  }

  // Hydrate on boot.
  _applySettings(State.get('settings') || {});

  // ── Settings event listeners ───────────────────────────────────────
  if (toggleSound) {
    toggleSound.addEventListener('change', () => {
      Audio.unlock();
      Audio.setSfxEnabled(toggleSound.checked);
      State.set('settings.sfxEnabled', toggleSound.checked);
    });
  }
  if (toggleMusic) {
    toggleMusic.addEventListener('change', () => {
      Audio.unlock();
      Audio.setMusicEnabled(toggleMusic.checked);
      State.set('settings.musicEnabled', toggleMusic.checked);
    });
  }
  if (volumeMaster) {
    volumeMaster.addEventListener('input', () => {
      const v = Number(volumeMaster.value);
      Audio.setMasterVolume(v);
      State.set('settings.masterVolume', v);
    });
  }
  if (volumeMusic) {
    volumeMusic.addEventListener('input', () => {
      const v = Number(volumeMusic.value);
      Audio.setMusicVolume(v);
      State.set('settings.musicVolume', v);
    });
  }
  if (toggleReducedMotion) {
    toggleReducedMotion.addEventListener('change', () => {
      document.body.dataset.reducedmotion = String(toggleReducedMotion.checked);
      State.set('settings.reducedMotion', toggleReducedMotion.checked);
    });
  }
  if (toggleEpilepsySafe) {
    toggleEpilepsySafe.addEventListener('change', () => {
      document.body.dataset.epilepsysafe = String(toggleEpilepsySafe.checked);
      State.set('settings.epilepsySafe', toggleEpilepsySafe.checked);
    });
  }
  if (toggleFastPlay) {
    toggleFastPlay.addEventListener('change', () => {
      State.set('settings.fastPlay', toggleFastPlay.checked);
    });
  }

  // Iteration 18: theme selector
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      _applyTheme(themeSelect.value);
      Audio.playClick();
    });
  }

  // ── Player avatar ──────────────────────────────────────────────────
  if (playerNameInput) {
    const savedName = State.get('player.name');
    if (savedName && savedName !== 'YOU') playerNameInput.value = savedName;

    playerNameInput.addEventListener('input', () => {
      const name = playerNameInput.value.trim() || 'YOU';
      State.set('player.name', name);
    });
  }

  $$('.avatar-color-btn').forEach(btn => {
    if (btn.dataset.color === State.get('player.color')) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      $$('.avatar-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      State.set('player.color', btn.dataset.color);
      Audio.playClick();
    });
  });

  // ── Wipe Saved Data ────────────────────────────────────────────────
  if (btnResetData) {
    btnResetData.addEventListener('click', () => {
      const ok = window.confirm(
        'This will erase your winnings, spins, achievements, and settings. Continue?'
      );
      if (!ok) return;
      State.reset();
      location.reload();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────
  return Object.freeze({

    /**
     * Open a slide-over panel by id.
     * @param {string} id - Panel element id.
     * @returns {void}
     */
    openPanel:  _openPanel,

    /**
     * Close a slide-over panel by id.
     * @param {string} id - Panel element id.
     * @returns {void}
     */
    closePanel: _closePanel,

    /**
     * Apply a settings snapshot to the live UI and audio engine.
     * @param {Object} s - Settings object.
     * @returns {void}
     */
    applySettings: _applySettings,

    /**
     * Re-render both leaderboard views.
     * @returns {void}
     */
    refreshLeaderboard: _refreshLeaderboard,

    /**
     * Update the sidebar stats widget from the current Achievements stats.
     * @returns {void}
     */
    updateStats() {
      const s = Achievements.stats;
      if (statsSpins)    statsSpins.textContent    = s.spins    || 0;
      if (statsWins)     statsWins.textContent     = s.wins     || 0;
      if (statsBest)     statsBest.textContent     = GameLogic.formatMoney(s.bestWin || 0);
      if (statsJackpots) statsJackpots.textContent = s.jackpots || 0;
      if (statsTime)     statsTime.textContent     = Achievements.formatTime(s.timePlayed || 0);
    },

    /**
     * Re-render the sidebar achievements grid from current unlock state.
     * @returns {void}
     */
    updateAchievements() {
      if (!achGrid) return;
      const defs = Achievements.getDefs();
      achGrid.innerHTML = '';
      defs.forEach(def => {
        const badge = document.createElement('div');
        badge.className = 'ach-badge' + (Achievements.isUnlocked(def.id) ? ' unlocked' : '');
        badge.innerHTML = `
          ${_achIcon(def.icon)}
          <div>${_esc(def.label)}</div>
          <div class="ach-tooltip">${_esc(def.desc)}</div>
        `;
        achGrid.appendChild(badge);
      });
    },
  });
})();
