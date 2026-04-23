/**
 * avatar.js — CSS Avatar Creator
 *
 * Lets players build a simple avatar from:
 *  • A background colour (8 options)
 *  • A face emoji (16 options)
 *  • A hat emoji (10 options, including "none")
 *
 * The current avatar is persisted to localStorage and used in the
 * leaderboard and chat. The avatar modal is opened from the footer button.
 *
 * @module Avatar
 */

const Avatar = (() => {
  "use strict";

  const STORAGE_KEY = `${CONFIG.STORAGE_KEY}_avatar`;

  // ── State ──────────────────────────────────────────────────────────────────
  let _current = {
    bg:   CONFIG.AVATAR_BG_COLORS[0],
    face: CONFIG.AVATAR_FACES[0],
    hat:  CONFIG.AVATAR_HATS[0],       // "none" or emoji string
    name: "Player",
  };

  // ── Persistence ────────────────────────────────────────────────────────────

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(_current, JSON.parse(raw));
    } catch (_) {}
  }

  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_current)); } catch (_) {}
  }

  // ── Rendered Preview ────────────────────────────────────────────────────────

  /**
   * Build the avatar HTML string for use anywhere in the UI.
   * @returns {string} HTML snippet
   */
  function renderHTML() {
    const hatPart = _current.hat && _current.hat !== "none"
      ? `<span class="av-hat" aria-hidden="true">${_current.hat}</span>`
      : "";
    return `
      <span class="avatar-display" style="background:${_current.bg}" aria-label="Avatar: ${_current.name}">
        ${hatPart}
        <span class="av-face" aria-hidden="true">${_current.face}</span>
      </span>
    `;
  }

  /** Return just the face emoji for compact display (chat, leaderboard). */
  function getCurrentEmoji() { return _current.face; }
  function getCurrentName()  { return _current.name; }

  // ── Modal Builder ──────────────────────────────────────────────────────────

  /**
   * Populate the #avatar-builder div inside the avatar modal.
   * Attaches event listeners for live preview updates.
   */
  function buildModal() {
    const container = document.getElementById("avatar-builder");
    if (!container) return;

    container.innerHTML = `
      <!-- Live preview -->
      <div class="av-preview-area" aria-label="Avatar preview">
        <div class="av-preview" id="av-preview-box">${renderHTML()}</div>
        <div class="av-preview-name" id="av-preview-name">${_escape(_current.name)}</div>
      </div>

      <!-- Name input -->
      <label class="av-section-label" for="av-name-input">Display Name</label>
      <input type="text" id="av-name-input" class="av-name-input"
             value="${_escape(_current.name)}"
             maxlength="20" aria-label="Your display name">

      <!-- Background colour picker -->
      <p class="av-section-label">Background Colour</p>
      <div class="av-option-row" role="radiogroup" aria-label="Avatar background colour">
        ${CONFIG.AVATAR_BG_COLORS.map(c => `
          <button class="av-color-swatch ${c === _current.bg ? "selected" : ""}"
                  data-field="bg" data-value="${c}"
                  style="background:${c}"
                  aria-label="Background colour ${c}"
                  aria-pressed="${c === _current.bg}"></button>
        `).join("")}
      </div>

      <!-- Face picker -->
      <p class="av-section-label">Face</p>
      <div class="av-option-row" role="radiogroup" aria-label="Avatar face">
        ${CONFIG.AVATAR_FACES.map(f => `
          <button class="av-emoji-btn ${f === _current.face ? "selected" : ""}"
                  data-field="face" data-value="${f}"
                  aria-label="Face ${f}"
                  aria-pressed="${f === _current.face}">${f}</button>
        `).join("")}
      </div>

      <!-- Hat picker -->
      <p class="av-section-label">Hat</p>
      <div class="av-option-row" role="radiogroup" aria-label="Avatar hat">
        ${CONFIG.AVATAR_HATS.map(h => `
          <button class="av-emoji-btn ${h === _current.hat ? "selected" : ""}"
                  data-field="hat" data-value="${h}"
                  aria-label="${h === "none" ? "No hat" : `Hat ${h}`}"
                  aria-pressed="${h === _current.hat}">${h === "none" ? "✖" : h}</button>
        `).join("")}
      </div>

      <!-- Save button -->
      <button class="av-save-btn" id="av-save-btn">Save Avatar</button>
    `;

    _attachListeners(container);
    _updateHeaderAvatar();
  }

  function _escape(str) {
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
  }

  // ── Event Listeners ────────────────────────────────────────────────────────

  function _attachListeners(container) {
    // Colour/emoji option buttons
    container.querySelectorAll("[data-field]").forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        _current[field] = value;

        // Update selected state within the group
        container.querySelectorAll(`[data-field="${field}"]`).forEach(b => {
          const active = b.dataset.value === value;
          b.classList.toggle("selected", active);
          b.setAttribute("aria-pressed", String(active));
        });

        _updatePreview();
        if (typeof Audio !== "undefined") Audio.playClick();
      });
    });

    // Name input — live update
    const nameInput = document.getElementById("av-name-input");
    if (nameInput) {
      nameInput.addEventListener("input", () => {
        _current.name = nameInput.value.trim() || "Player";
        document.getElementById("av-preview-name").textContent = _current.name;
      });
    }

    // Save button
    const saveBtn = document.getElementById("av-save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        _save();
        _updateHeaderAvatar();
        // Close modal
        const modal = document.getElementById("avatar-modal");
        if (modal) {
          modal.hidden = true;
          modal.setAttribute("aria-hidden", "true");
        }
        if (typeof UI !== "undefined") {
          UI.showToast("Avatar saved! 👤", "info");
        }
        if (typeof Audio !== "undefined") Audio.playClick();
      });
    }
  }

  // ── Preview Update ─────────────────────────────────────────────────────────

  function _updatePreview() {
    const box = document.getElementById("av-preview-box");
    if (box) box.innerHTML = renderHTML();
  }

  function _updateHeaderAvatar() {
    // If there's an avatar slot in the header, update it
    const slot = document.getElementById("header-avatar");
    if (slot) slot.innerHTML = renderHTML();
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    _load();

    // Open modal button
    const openBtn = document.getElementById("open-avatar");
    if (openBtn) {
      openBtn.addEventListener("click", () => {
        const modal = document.getElementById("avatar-modal");
        if (!modal) return;
        modal.hidden = false;
        modal.removeAttribute("aria-hidden");
        buildModal();
        if (typeof Audio !== "undefined") Audio.playClick();
        // Focus first interactive element
        setTimeout(() => {
          const first = modal.querySelector("input, button");
          if (first) first.focus();
        }, 100);
      });
    }

    // Close modal button (the × in the header)
    document.querySelectorAll(".modal-close").forEach(btn => {
      btn.addEventListener("click", () => {
        const modal = btn.closest(".modal-overlay");
        if (modal) {
          modal.hidden = true;
          modal.setAttribute("aria-hidden", "true");
        }
      });
    });

    // Close on backdrop click
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", e => {
        if (e.target === overlay) {
          overlay.hidden = true;
          overlay.setAttribute("aria-hidden", "true");
        }
      });
    });

    _updateHeaderAvatar();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return Object.freeze({ init, renderHTML, getCurrentEmoji, getCurrentName });

})();
