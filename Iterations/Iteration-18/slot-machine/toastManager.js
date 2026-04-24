/**
 * toastManager.js — Priority-based toast notification system (Iteration 18).
 *
 * Replaces the previous FIFO-capped implementation in ui.js with a fully
 * queued, priority-aware system. Key properties:
 *
 *   • MAX_VISIBLE (3) toasts shown simultaneously — extras are queued, not
 *     discarded.
 *   • Four priority tiers: JACKPOT (4) > BIG_WIN (3) > BONUS (2) > ACHIEVEMENT (1).
 *   • If all slots are full and an incoming toast has higher priority than
 *     the lowest currently visible toast, the lowest-priority slot is
 *     preempted — the displaced toast is pushed back into the queue with its
 *     remaining display time preserved so it re-appears for the same total
 *     duration it was originally granted (Iteration 18).
 *   • When any toast expires, the queue is drained in priority order.
 *   • Notification flood protection via configurable batching windows:
 *     the first achievement toast is shown immediately; any additional
 *     identical-key toasts that arrive within the batch window are coalesced
 *     into a single follow-up "Nx message" toast (Iteration 18).
 *     JACKPOT notifications bypass batching entirely.
 *   • JACKPOT toasts use role="alert" for immediate screen-reader
 *     announcement; all other toasts use role="status" (Iteration 18).
 *
 * Usage:
 *   ToastManager.init(document.getElementById('toast-container'), {
 *     visibleMs:    3000,  // how long each toast is visible
 *     slideOutMs:   300,   // must match CSS toastDropOut duration
 *     batchWindowMs: 500,  // deduplication window for identical keys
 *   });
 *
 *   ToastManager.show({
 *     message:  'UNLOCKED: Boot Up',
 *     priority: ToastManager.PRIORITY.ACHIEVEMENT,
 *     key:      'achievement',          // used for batching
 *     icon:     '&#9733;',             // HTML entity string
 *     batchable: true,                 // default true; false bypasses batching
 *   });
 */
const ToastManager = (() => {
  'use strict';

  // ── Priority tier constants ────────────────────────────────────────────
  /**
   * Priority values for toast notifications.
   * Higher number = higher priority = harder to preempt.
   * @readonly
   * @enum {number}
   */
  const PRIORITY = Object.freeze({
    ACHIEVEMENT: 1,
    BONUS:       2,
    BIG_WIN:     3,
    JACKPOT:     4,
  });

  // ── Configuration (set via init(), overridable) ────────────────────────
  const MAX_VISIBLE    = 3;          // hard cap on simultaneous visible toasts
  let _container       = null;       // DOM element that hosts toast nodes
  let _visibleMs       = 3000;       // toast display duration
  let _slideOutMs      = 300;        // exit-animation duration (match CSS)
  let _batchWindowMs   = 500;        // coalescing window for identical keys

  // ── Internal state ─────────────────────────────────────────────────────
  /**
   * Active toasts currently rendered in the DOM.
   * Each entry stores everything needed to preempt or expire the toast.
   * @type {Array<{
   *   element:     HTMLElement,
   *   priority:    number,
   *   key:         string|null,
   *   message:     string,
   *   rawIcon:     string,
   *   expireTimer: ReturnType<typeof setTimeout>
   * }>}
   */
  let _active = [];

  /**
   * Pending toasts waiting for a display slot.
   * Sorted lazily (on drain) by priority descending so highest-priority
   * items are shown first.
   * @type {Array<{message:string, priority:number, key:string|null, rawIcon:string}>}
   */
  let _queue = [];

  /**
   * Batch accumulator keyed by notification key.
   * Each entry holds the count of identical incoming notifications that
   * have arrived within the current batch window.
   * @type {Map<string, {
   *   count:    number,
   *   message:  string,
   *   priority: number,
   *   rawIcon:  string,
   *   timer:    ReturnType<typeof setTimeout>
   * }>}
   */
  let _batches = new Map();

  // ── HTML escape helper ─────────────────────────────────────────────────
  /**
   * Escape a value for safe insertion into innerHTML.
   * Note: icon strings are expected to be trusted HTML entities (e.g.
   * '&#9733;') and are inserted without escaping.
   * @param {*} str
   * @returns {string}
   */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Core display logic ─────────────────────────────────────────────────

  /**
   * Physically create and mount a toast element for one pending item.
   * Adds the entry to `_active` and schedules its expiry.
   *
   * Iteration 18 changes:
   *   • JACKPOT toasts use role="alert" (assertive, interrupts screen readers
   *     immediately) instead of role="status" (polite).
   *   • item.remainingMs, when present, overrides _visibleMs so that toasts
   *     re-queued after preemption finish the time they were originally shown.
   *   • shownAt records when the toast became visible, enabling remaining-time
   *     calculation if it is later preempted.
   *
   * @param {{
   *   message:      string,
   *   priority:     number,
   *   key:          string|null,
   *   rawIcon:      string,
   *   remainingMs?: number
   * }} item
   */
  function _displayToast(item) {
    if (!_container) return;

    const toast = document.createElement('div');
    // Base class + per-priority variant for optional CSS styling
    toast.className = `toast toast-p${item.priority}`;
    // Iteration 18: JACKPOT uses role="alert" so screen readers interrupt
    // the current reading and announce the jackpot win immediately.
    toast.setAttribute('role', item.priority >= PRIORITY.JACKPOT ? 'alert' : 'status');
    toast.setAttribute('data-priority', String(item.priority));
    toast.setAttribute('data-key', item.key || '');

    // rawIcon is a trusted HTML entity string (e.g. '&#9733;')
    toast.innerHTML =
      `<span class="toast-icon" aria-hidden="true">${item.rawIcon}</span>` +
      `<span class="toast-body">${_esc(item.message)}</span>`;

    _container.appendChild(toast);

    // Iteration 18: honour a preserved remaining time when re-displaying a
    // preempted toast; otherwise use the default full-duration.
    const duration = (item.remainingMs != null) ? item.remainingMs : _visibleMs;
    const expireTimer = setTimeout(() => _expireToast(toast), duration);

    _active.push({
      element:     toast,
      priority:    item.priority,
      key:         item.key,
      message:     item.message,
      rawIcon:     item.rawIcon,
      shownAt:     Date.now(),   // Iteration 18: used to compute remaining time on preemption
      expireTimer,
    });
  }

  /**
   * Animate a toast out of view, remove it from DOM and `_active`, then
   * drain the queue so the next pending item can fill the slot.
   * @param {HTMLElement} element
   */
  function _expireToast(element) {
    // Locate and evict from active list first.
    const idx = _active.findIndex(t => t.element === element);
    if (idx !== -1) {
      clearTimeout(_active[idx].expireTimer);
      _active.splice(idx, 1);
    }

    // CSS exit animation — duration matches _slideOutMs / CSS toastDropOut.
    element.classList.add('toast-out');
    setTimeout(() => {
      if (element.parentNode) element.parentNode.removeChild(element);
      // Slot just freed — try to show the next queued item.
      _drainQueue();
    }, _slideOutMs);
  }

  /**
   * Fill available display slots from the queue.
   * Queue is sorted by priority (high → low) so the most important pending
   * item always gets the next open slot.
   */
  function _drainQueue() {
    // Sort queue: highest priority first; preserve arrival order within tier.
    _queue.sort((a, b) => b.priority - a.priority);
    while (_active.length < MAX_VISIBLE && _queue.length > 0) {
      _displayToast(_queue.shift());
    }
  }

  /**
   * Route an item to display or queue, with optional preemption.
   * If all slots are full and the item outranks the lowest visible toast,
   * that toast is preempted (animated out, its content re-queued) and the
   * new item takes the slot immediately.
   * @param {{message:string, priority:number, key:string|null, rawIcon:string}} item
   */
  function _enqueue(item) {
    // Fast path: slot available.
    if (_active.length < MAX_VISIBLE) {
      _displayToast(item);
      return;
    }

    // All slots full — find the lowest-priority active toast.
    const lowestIdx = _active.reduce(
      (minIdx, t, i) => t.priority < _active[minIdx].priority ? i : minIdx,
      0
    );
    const lowest = _active[lowestIdx];

    if (item.priority > lowest.priority) {
      // Preempt: push displaced toast back to queue so it isn't lost.
      clearTimeout(lowest.expireTimer);
      _active.splice(lowestIdx, 1);

      // Iteration 18: preserve the remaining display time so the displaced
      // toast doesn't start over from _visibleMs when it re-appears.
      // Minimum 500 ms so the player has time to read it even if it was
      // preempted almost immediately.
      const elapsed     = Date.now() - lowest.shownAt;
      const remainingMs = Math.max(_visibleMs - elapsed, 500);

      _queue.push({
        message:     lowest.message,
        priority:    lowest.priority,
        key:         lowest.key,
        rawIcon:     lowest.rawIcon,
        remainingMs,
      });

      // Animate the displaced element out without triggering _drainQueue
      // (we're about to fill that slot immediately with the new item).
      const displaced = lowest.element;
      displaced.classList.add('toast-out');
      setTimeout(() => {
        if (displaced.parentNode) displaced.parentNode.removeChild(displaced);
      }, _slideOutMs);

      // Show the higher-priority item right away.
      _displayToast(item);
    } else {
      // New item doesn't outrank anything visible — queue it for later.
      _queue.push(item);
    }
  }

  // ── Batching ───────────────────────────────────────────────────────────

  /**
   * Handle the batching window for a given key.
   *
   * Iteration 18: first call enqueues the item immediately, then opens a
   * batch window (count=0) to collect follow-ups. Subsequent calls within
   * the window increment count and reset the timer. JACKPOT (priority 4)
   * always bypasses this path.
   *
   * @param {{message:string, priority:number, key:string, rawIcon:string}} item
   */
  function _batchOrShow(item) {
    const existing = _batches.get(item.key);

    if (existing) {
      // Another identical notification within the window — accumulate.
      existing.count++;
      // Reset the window so the flush waits for the cascade to settle.
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => _flushBatch(item.key), _batchWindowMs);
    } else {
      // Iteration 18: show the first notification immediately rather than
      // waiting for the batch window to expire.
      _enqueue(item);

      // Open a window to catch any follow-up notifications.
      // count starts at 0 because the first was already displayed above.
      const timer = setTimeout(() => _flushBatch(item.key), _batchWindowMs);
      _batches.set(item.key, {
        count:    0,
        message:  item.message,
        priority: item.priority,
        rawIcon:  item.rawIcon,
        timer,
      });
    }
  }

  /**
   * Flush a completed batch: if additional notifications arrived after the
   * first, emit a summary toast through the normal enqueue path.
   * @param {string} key
   */
  function _flushBatch(key) {
    const batch = _batches.get(key);
    if (!batch) return;
    _batches.delete(key);

    // Iteration 18: count=0 means only the first notification arrived and it
    // was already shown immediately — nothing more to display.
    if (batch.count === 0) return;

    // count=1 → show the additional notification as a normal message.
    // count>1 → condense into "Nx ..." summary.
    const finalMessage = batch.count > 1
      ? `${batch.count}\u00d7 ${batch.message}`  // "3× UNLOCKED: Boot Up"
      : batch.message;

    _enqueue({
      message:  finalMessage,
      priority: batch.priority,
      key,
      rawIcon:  batch.rawIcon,
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    /** Exported priority constants for callers. */
    PRIORITY,

    /**
     * Initialise the ToastManager.
     * Must be called once before `show()`. Safe to call multiple times
     * (re-init clears active state — use only during testing).
     *
     * @param {HTMLElement} container - DOM element to host toast nodes.
     * @param {{
     *   visibleMs?:    number,
     *   slideOutMs?:   number,
     *   batchWindowMs?: number
     * }} [cfg]
     */
    init(container, cfg = {}) {
      _container     = container;
      _visibleMs     = cfg.visibleMs    ?? _visibleMs;
      _slideOutMs    = cfg.slideOutMs   ?? _slideOutMs;
      _batchWindowMs = cfg.batchWindowMs ?? _batchWindowMs;
      // Clear state on re-init (for hot reloading / testing)
      _active  = [];
      _queue   = [];
      _batches.clear();
    },

    /**
     * Submit a notification for display.
     *
     * @param {{
     *   message:   string,          — Text shown to the player.
     *   priority?: number,          — PRIORITY.* constant; default ACHIEVEMENT.
     *   key?:      string|null,     — Batching key. null = never batch.
     *   icon?:     string,          — HTML entity string (trusted, not escaped).
     *   batchable?: boolean         — False forces immediate display (no batching).
     * }} opts
     */
    show({
      message,
      priority = PRIORITY.ACHIEVEMENT,
      key      = null,
      icon     = '&#9733;',
      batchable = true,
    }) {
      const item = { message, priority, key, rawIcon: icon };

      // JACKPOT (priority 4) and explicitly non-batchable items bypass
      // the batching path entirely — they always show immediately.
      if (!batchable || priority >= PRIORITY.JACKPOT || key === null) {
        _enqueue(item);
        return;
      }

      // Route through the batch accumulator.
      _batchOrShow(item);
    },

    /**
     * Programmatically dismiss all visible toasts and clear the queue.
     * Useful when transitioning away from a screen or resetting state.
     */
    clearAll() {
      // Cancel all pending batch timers.
      _batches.forEach(b => clearTimeout(b.timer));
      _batches.clear();

      // Expire all active toasts immediately (no animation).
      _active.forEach(t => {
        clearTimeout(t.expireTimer);
        if (t.element.parentNode) t.element.parentNode.removeChild(t.element);
      });
      _active = [];
      _queue  = [];
    },

    // ── Diagnostic read-only accessors (useful for debugging) ──────────
    /** @returns {number} Number of toasts currently visible. */
    get activeCount()  { return _active.length; },
    /** @returns {number} Number of toasts waiting in the queue. */
    get queueLength()  { return _queue.length; },
    /** @returns {number} Number of open batch windows. */
    get batchCount()   { return _batches.size; },
  };
})();

// Freeze the public API surface.
Object.freeze(ToastManager);
