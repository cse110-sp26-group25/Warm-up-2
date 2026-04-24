/**
 * rtpCertification.js — Build-time RTP certification loader (Iteration 18).
 *
 * At runtime the game fetches the pre-generated `rtp_certification.json`
 * file (produced by `scripts/verifyRtp.js` during the build step) and
 * validates that its config fingerprint matches the live GameLogic CONFIG.
 * If the certificate loads and validates successfully, the game skips the
 * expensive runtime RTP simulation entirely.
 *
 * Additionally exposes an optional background verification worker that runs
 * post-load (gated by a feature flag in the cert file or in local storage)
 * to continuously validate RTP without touching the main thread.
 *
 * ── Public API ───────────────────────────────────────────────────────────
 *
 *   RtpCertification.load()
 *     → Promise<boolean>  true if cert is valid for the current config
 *
 *   RtpCertification.data
 *     → Object | null   the parsed certification JSON (null until loaded)
 *
 *   RtpCertification.isVerified
 *     → boolean   true after a successful load()
 *
 *   RtpCertification.startBackgroundWorker(gameLogicConfig)
 *     → void   spins up rtpWorker.js post-load (feature-flag gated)
 *
 *   RtpCertification.stopBackgroundWorker()
 *     → void   terminates the background worker if running
 */
const RtpCertification = (() => {
  'use strict';

  // ── Internal state ─────────────────────────────────────────────────────
  /** @type {Object|null} Parsed rtp_certification.json contents. */
  let _data = null;

  /** @type {boolean} True once the cert has been loaded and validated. */
  let _verified = false;

  /** @type {Worker|null} Optional background validation worker. */
  let _worker = null;

  // ── Config fingerprint ─────────────────────────────────────────────────
  /**
   * Build a lightweight fingerprint from the live GameLogic CONFIG so we
   * can detect if payouts have changed since the cert was generated.
   *
   * The fingerprint is a simple checksum over the stringified PAYOUTS table
   * and the JACKPOT_FRACTION value — the two fields that most directly
   * affect RTP. If GameLogic is not yet available (e.g. cert loaded very
   * early), this returns null and fingerprint validation is skipped.
   *
   * @returns {string|null}
   */
  function _buildFingerprint() {
    try {
      // GameLogic must be loaded before this module's load() is called.
      const { PAYOUTS, JACKPOT_FRACTION, PITY_THRESHOLD } = GameLogic.CONFIG;
      const raw = JSON.stringify(PAYOUTS) + '|' + JACKPOT_FRACTION + '|' + PITY_THRESHOLD;
      // djb2-style hash (non-cryptographic, but sufficient for change detection)
      let h = 5381;
      for (let i = 0; i < raw.length; i++) {
        h = ((h << 5) + h) ^ raw.charCodeAt(i);
        h |= 0; // force 32-bit signed integer
      }
      return (h >>> 0).toString(16); // unsigned hex string
    } catch (_e) {
      return null;
    }
  }

  /**
   * Validate the loaded cert object against the current game config.
   * Returns an array of validation error strings (empty = valid).
   * @param {Object} cert
   * @returns {string[]}
   */
  function _validate(cert) {
    const errors = [];

    // Check required fields.
    const required = ['base_rtp', 'jackpot_rtp', 'total_rtp', 'sample_size', 'verified_at'];
    for (const field of required) {
      if (cert[field] === undefined || cert[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Sanity-check numeric ranges.
    if (typeof cert.base_rtp === 'number' && (cert.base_rtp <= 0 || cert.base_rtp >= 1)) {
      errors.push(`base_rtp out of range: ${cert.base_rtp} (expected 0–1)`);
    }
    if (typeof cert.total_rtp === 'number' && (cert.total_rtp <= 0 || cert.total_rtp >= 1)) {
      errors.push(`total_rtp out of range: ${cert.total_rtp} (expected 0–1)`);
    }
    if (typeof cert.sample_size === 'number' && cert.sample_size < 100_000) {
      errors.push(`sample_size too small: ${cert.sample_size} (minimum 100,000)`);
    }

    // Config fingerprint check.
    if (cert.config_fingerprint) {
      const live = _buildFingerprint();
      if (live && live !== cert.config_fingerprint) {
        errors.push(
          `Config fingerprint mismatch: cert=${cert.config_fingerprint}, live=${live}. ` +
          'Payout table or jackpot settings have changed since certification.'
        );
      }
    } else {
      // Iteration 18: warn when the cert has no fingerprint so a developer
      // regenerating the cert file is alerted that change-detection is off.
      // This is a warning only — a missing fingerprint is not a hard failure
      // because older cert files may legitimately omit the field.
      console.warn(
        '[RtpCertification] config_fingerprint is missing from the certificate. ' +
        'Payout-table change detection is disabled. ' +
        'Re-run `node scripts/verifyRtp.js` to regenerate a complete certificate.'
      );
    }

    // within_target flag (set by the build script).
    if (cert.within_target === false) {
      errors.push(
        `Certification records within_target=false: base_rtp=${cert.base_rtp} ` +
        `did not meet the target at build time.`
      );
    }

    return errors;
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    /** @returns {Object|null} Parsed cert data, or null if not yet loaded. */
    get data()       { return _data; },

    /** @returns {boolean} True if cert loaded and validated successfully. */
    get isVerified() { return _verified; },

    /**
     * Fetch and validate `rtp_certification.json` relative to the page.
     *
     * Resolves to `true` if the cert is valid for the current config and
     * `false` if the cert is missing, malformed, or fails validation.
     * Never throws — the game can always fall back to no-cert operation.
     *
     * @returns {Promise<boolean>}
     */
    async load() {
      try {
        const response = await fetch('./rtp_certification.json', {
          // Use no-cache so a freshly-generated cert is always picked up.
          cache: 'no-cache',
        });

        if (!response.ok) {
          console.warn(
            `[RtpCertification] Could not fetch rtp_certification.json ` +
            `(HTTP ${response.status}). Runtime simulation will be used if triggered.`
          );
          return false;
        }

        const cert = await response.json();
        const errors = _validate(cert);

        if (errors.length > 0) {
          console.warn('[RtpCertification] Validation failed:\n  • ' + errors.join('\n  • '));
          return false;
        }

        _data     = cert;
        _verified = true;

        console.info(
          `[RtpCertification] Certificate loaded ✓\n` +
          `  base_rtp:    ${(cert.base_rtp  * 100).toFixed(2)} %\n` +
          `  jackpot_rtp: ${(cert.jackpot_rtp * 100).toFixed(2)} %\n` +
          `  total_rtp:   ${(cert.total_rtp * 100).toFixed(2)} %\n` +
          `  sample_size: ${cert.sample_size.toLocaleString()} spins\n` +
          `  verified_at: ${cert.verified_at}`
        );

        return true;

      } catch (err) {
        console.warn('[RtpCertification] Load error:', err.message || err);
        return false;
      }
    },

    /**
     * Start an optional background Web Worker that runs a full RTP
     * verification simulation post-load.
     *
     * Requirements:
     *   • Does NOT block gameplay — runs entirely off the main thread.
     *   • Results are logged to the console for developer inspection.
     *   • Only starts if `window.__RTP_BACKGROUND_VERIFY === true` or the
     *     localStorage flag 'rtp_bg_verify' is set to '1'.
     *
     * @param {Object} gameLogicConfig - The live GameLogic.CONFIG object.
     * @param {{totalSpins?:number, batchSize?:number}} [opts]
     */
    startBackgroundWorker(gameLogicConfig, opts = {}) {
      // Feature flag: opt-in only (off by default to save battery / CPU).
      const flagEnabled =
        window.__RTP_BACKGROUND_VERIFY === true ||
        localStorage.getItem('rtp_bg_verify') === '1';

      if (!flagEnabled) {
        console.debug(
          '[RtpCertification] Background worker disabled. ' +
          'Set window.__RTP_BACKGROUND_VERIFY=true or localStorage.rtp_bg_verify=1 to enable.'
        );
        return;
      }

      if (_worker) {
        console.debug('[RtpCertification] Background worker already running.');
        return;
      }

      if (typeof Worker === 'undefined') {
        console.warn('[RtpCertification] Web Workers not supported in this environment.');
        return;
      }

      console.info('[RtpCertification] Starting background RTP verification worker...');

      try {
        _worker = new Worker('./rtpWorker.js');

        _worker.onmessage = ({ data }) => {
          switch (data.type) {
            case 'progress':
              // Throttle progress logging to every 10 batches.
              if (data.batchesComplete % 10 === 0) {
                console.debug(
                  `[RtpCertification BG] Batch ${data.batchesComplete}/${data.totalBatches} ` +
                  `— partial base RTP: ${data.partialRTP.toFixed(3)} %`
                );
              }
              break;

            case 'complete': {
              const r = data.result;
              const pass = r.withinTarget ? '✓ PASS' : '✗ FAIL';
              console.info(
                `[RtpCertification BG] Verification complete ${pass}\n` +
                `  base_rtp:     ${r.baseRTP.toFixed(3)} % (target: 87.0 % ± 0.5 %)\n` +
                `  jackpot_rtp:  ${r.jackpotRTP_ev.toFixed(3)} % (analytical EV)\n` +
                `  total_rtp:    ${r.totalRTP.toFixed(3)} %\n` +
                `  batches_run:  ${r.batchesRun}` +
                (data.stoppedEarly ? ` (early stop; CI ≤ 0.1 pp)` : '') + `\n` +
                `  ci_halfwidth: ±${r.ciHalfWidth.toFixed(4)} pp\n` +
                `  jackpot_hits: ${r.jackpotHits}\n` +
                `  pity_fires:   ${r.pityFires}`
              );
              _worker = null;
              break;
            }

            case 'error':
              console.error('[RtpCertification BG] Worker error:', data.message);
              _worker = null;
              break;
          }
        };

        _worker.onerror = (err) => {
          console.error('[RtpCertification BG] Worker uncaught error:', err.message);
          _worker = null;
        };

        // Build a plain-object copy of the config (structured-clone safe).
        // We must also convert the PAYOUTS frozen object to a plain object
        // because structured clone preserves values but not freeze/prototype.
        const configPayload = {
          PAYOUTS:          JSON.parse(JSON.stringify(gameLogicConfig.PAYOUTS)),
          SYMBOLS:          gameLogicConfig.SYMBOLS.map(s => ({ id: s.id, weight: s.weight })),
          JACKPOT_FRACTION: gameLogicConfig.JACKPOT_FRACTION,
          JACKPOT_SEED:     gameLogicConfig.JACKPOT_SEED,
          PITY_THRESHOLD:   gameLogicConfig.PITY_THRESHOLD,
          REEL_COUNT:       gameLogicConfig.REEL_COUNT,
        };

        _worker.postMessage({
          command:    'verify',
          config:     configPayload,
          totalSpins: opts.totalSpins || 3_000_000,
          batchSize:  opts.batchSize  || 300_000,
          earlyStopCI: 0.1,
        });

      } catch (err) {
        console.warn('[RtpCertification] Failed to start worker:', err.message);
        _worker = null;
      }
    },

    /**
     * Terminate the background worker if running.
     * Safe to call even if the worker is not running.
     */
    stopBackgroundWorker() {
      if (_worker) {
        _worker.terminate();
        _worker = null;
        console.debug('[RtpCertification] Background worker terminated.');
      }
    },
  };
})();

Object.freeze(RtpCertification);
