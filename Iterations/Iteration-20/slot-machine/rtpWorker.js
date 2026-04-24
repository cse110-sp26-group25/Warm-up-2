/**
 * rtpWorker.js — Off-main-thread RTP simulation worker (Iteration 17).
 *
 * Runs the RTP verification simulation inside a Web Worker so the main UI
 * thread is never blocked. The worker supports batched execution with early
 * termination when the 95 % confidence interval for base-game RTP stabilises.
 *
 * ── Message protocol ────────────────────────────────────────────────────
 *
 *  Main → Worker  (postMessage):
 *  {
 *    command:     'verify',
 *    config:      { ...game config object (PAYOUTS, SYMBOLS, etc.) },
 *    totalSpins:  number,   // total spins to run (default 3_000_000)
 *    batchSize:   number,   // spins per batch    (default 300_000)
 *    earlyStopCI: number,   // stop when 95% CI width < this pp (default 0.2)
 *  }
 *
 *  Worker → Main  (postMessage):
 *  // Progress update after each batch:
 *  { type: 'progress', batchesComplete: n, totalBatches: N, partialRTP: number }
 *
 *  // Final result or early-stop result:
 *  { type: 'complete', result: RTPResult, stoppedEarly: boolean }
 *
 *  // If an error occurs:
 *  { type: 'error', message: string }
 *
 * ── Usage example (main thread) ─────────────────────────────────────────
 *
 *   const worker = new Worker('rtpWorker.js');
 *   worker.postMessage({
 *     command:   'verify',
 *     config:    GameLogic.CONFIG,   // pass the frozen config object
 *     totalSpins: 3_000_000,
 *     batchSize:  300_000,
 *   });
 *   worker.onmessage = ({ data }) => {
 *     if (data.type === 'progress') { ... update a loading bar ... }
 *     if (data.type === 'complete') { console.log(data.result); worker.terminate(); }
 *     if (data.type === 'error')    { console.error(data.message); worker.terminate(); }
 *   };
 */

'use strict';

// ── Simulation helpers (self-contained; no browser globals) ───────────────

/**
 * Resolve the centre-row payline given 5 symbol ids and a bet.
 * Must stay in sync with the private `_resolve` function in gameLogic.js.
 * @param {string[]} syms - Five symbol ids.
 * @param {number}   bet  - Bet amount.
 * @param {Object}   PAYOUTS - Payout table from CONFIG.
 * @returns {{payout:number, type:string}}
 */
function _resolve(syms, bet, PAYOUTS) {
  const anchor = syms[0];
  let matchCount = 1;
  for (let i = 1; i < syms.length; i++) {
    if (syms[i] === anchor) matchCount++;
    else break;
  }

  if (matchCount >= 3 && anchor === 'jackpot') {
    return { payout: 0, type: 'jackpot' };
  }
  if (matchCount === 5) {
    const mult = PAYOUTS.FIVE[anchor] || 0;
    return { payout: +(bet * mult).toFixed(2), type: 'five' };
  }
  if (matchCount === 4) {
    const mult = PAYOUTS.FOUR[anchor] || 0;
    return { payout: +(bet * mult).toFixed(2), type: 'four' };
  }
  if (matchCount === 3) {
    const mult = PAYOUTS.THREE[anchor] || 0;
    return { payout: +(bet * mult).toFixed(2), type: 'three' };
  }
  if (matchCount === 2) {
    const mult = PAYOUTS.TWO[anchor] || 0;
    return { payout: +(bet * mult).toFixed(2), type: 'two' };
  }
  return { payout: 0, type: 'loss' };
}

/**
 * Pick one symbol by weighted random selection.
 * @param {Array<{id:string,weight:number}>} symbols
 * @param {number} totalWeight
 * @returns {string} Symbol id.
 */
function _weightedPick(symbols, totalWeight) {
  let r = Math.random() * totalWeight;
  for (const sym of symbols) {
    r -= sym.weight;
    if (r < 0) return sym.id;
  }
  return symbols[symbols.length - 1].id;
}

/**
 * Compute the standard deviation of an array of numbers.
 * @param {number[]} arr
 * @param {number}   mean
 * @returns {number}
 */
function _stdDev(arr, mean) {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Compute the 95 % confidence interval half-width for a set of batch RTP values.
 * Formula: 1.96 × σ / √n  (normal approximation; adequate for n ≥ 5 batches).
 * @param {number[]} batchRtps - Per-batch base-game RTP values (percentage points).
 * @returns {number} CI half-width in percentage points.
 */
function _ciHalfWidth(batchRtps) {
  if (batchRtps.length < 2) return Infinity;
  const mean = batchRtps.reduce((a, b) => a + b, 0) / batchRtps.length;
  const sd   = _stdDev(batchRtps, mean);
  return 1.96 * sd / Math.sqrt(batchRtps.length);
}

// ── Main simulation ───────────────────────────────────────────────────────

/**
 * Run the full batched RTP simulation.
 *
 * Design: splits `totalSpins` into batches of `batchSize`. After each batch
 * a 95 % CI is computed for the pooled base-game RTP. Once the CI half-width
 * falls below `earlyStopCI` (default 0.1 pp), simulation stops early because
 * additional spins would not meaningfully change the conclusion.
 *
 * Jackpot RTP is NOT validated via simulation; its theoretical expected value
 * is computed analytically (see §jackpot note below) to avoid the extreme
 * variance that jackpot events introduce into sampled RTP figures.
 *
 * @param {{
 *   config:      Object,
 *   totalSpins:  number,
 *   batchSize:   number,
 *   earlyStopCI: number,
 * }} params
 * @returns {{
 *   totalSpins:    number,
 *   batchesRun:    number,
 *   stoppedEarly:  boolean,
 *   baseRTP:       number,
 *   jackpotRTP_ev: number,
 *   totalRTP:      number,
 *   withinTarget:  boolean,
 *   ciHalfWidth:   number,
 *   jackpotHits:   number,
 *   pityFires:     number,
 *   batchBaseRtps: number[],
 * }}
 */
function _runSimulation({ config, totalSpins, batchSize, earlyStopCI }) {
  const { PAYOUTS, JACKPOT_FRACTION, JACKPOT_SEED, PITY_THRESHOLD, REEL_COUNT } = config;
  const BET          = 1;
  const BASE_TARGET  = 87;       // 92 % total − 5 % jackpot contribution
  const TOLERANCE    = 0.5;

  // Derive symbol list + total weight from config.SYMBOLS (passed through).
  const SYMBOLS      = config.SYMBOLS;
  const TOTAL_WEIGHT = SYMBOLS.reduce((a, s) => a + s.weight, 0);

  // Compute jackpot probability analytically.
  // P(jackpot symbol) = weight / totalWeight
  // P(trigger) ≈ P_jp^3  (first 3 consecutive reels must all be jackpot)
  // See gameLogic.js §verifyRTP docstring for derivation.
  const P_JP        = SYMBOLS.find(s => s.id === 'jackpot').weight / TOTAL_WEIGHT;
  const P_TRIGGER   = P_JP ** 3;  // P(≥3 consecutive jackpot from reel 0)

  // ── Jackpot RTP via expected value (analytical) ───────────────────────
  // In steady state, each unit of bet contributes JACKPOT_FRACTION to the
  // pool. The pool at the winning spin averages:
  //   E[pool] ≈ JACKPOT_SEED + (BET × JACKPOT_FRACTION) / P_TRIGGER
  // jackpot_RTP = P_TRIGGER × E[pool] / BET
  //             = P_TRIGGER × JACKPOT_SEED + JACKPOT_FRACTION
  const jackpotRTP_ev = (P_TRIGGER * JACKPOT_SEED + JACKPOT_FRACTION) * 100;

  // ── Batched simulation ────────────────────────────────────────────────
  const maxBatches    = Math.ceil(totalSpins / batchSize);
  const batchBaseRtps = [];

  let grandWagered   = 0;
  let grandRetBase   = 0;
  let totalJpHits    = 0;
  let totalPityFires = 0;
  let stoppedEarly   = false;

  for (let b = 0; b < maxBatches; b++) {
    let wag     = 0;
    let retBase = 0;
    let jpHits  = 0;
    let pFires  = 0;

    // Each batch maintains its own pity and jackpot state so batches are
    // statistically independent — this is important for CI validity.
    let simJp   = JACKPOT_SEED;
    let simPity = 0;

    for (let i = 0; i < batchSize; i++) {
      wag    += BET;
      simJp  += BET * JACKPOT_FRACTION;

      // Sample REEL_COUNT symbols from weighted pool (infinite-reel model).
      const syms = [];
      for (let j = 0; j < REEL_COUNT; j++) {
        syms.push(_weightedPick(SYMBOLS, TOTAL_WEIGHT));
      }

      // Pity mechanic: force reel 1 to match reel 0 on threshold crossing.
      let pityFlag = false;
      if (simPity >= PITY_THRESHOLD) {
        syms[1]   = syms[0];
        pityFlag  = true;
        simPity   = 0;
        pFires++;
      }

      const res = _resolve(syms, BET, PAYOUTS);

      if (res.type === 'jackpot') {
        // Count jackpot hits but do NOT add jackpot payout to base RTP.
        // Jackpot contribution is computed analytically above.
        simJp = JACKPOT_SEED;
        jpHits++;
        if (!pityFlag) simPity = 0; // jackpot also resets pity
      } else {
        retBase += res.payout;
        if (res.payout === 0 && !pityFlag) simPity++;
      }
    }

    const batchBaseRtp = (retBase / wag) * 100;
    batchBaseRtps.push(batchBaseRtp);

    grandWagered   += wag;
    grandRetBase   += retBase;
    totalJpHits    += jpHits;
    totalPityFires += pFires;

    // ── Early termination check ───────────────────────────────────────
    // Require at least 3 batches before evaluating CI (avoids spurious
    // early stops from first-batch fluctuations).
    if (b >= 2) {
      const ci = _ciHalfWidth(batchBaseRtps);
      if (ci < earlyStopCI) {
        stoppedEarly = true;
        break;
      }
    }
  }

  const baseRTP     = (grandRetBase / grandWagered) * 100;
  const totalRTP    = baseRTP + jackpotRTP_ev;
  const withinTarget = Math.abs(baseRTP - BASE_TARGET) <= TOLERANCE;
  const finalCI      = _ciHalfWidth(batchBaseRtps);

  return {
    totalSpins:    grandWagered,
    batchesRun:    batchBaseRtps.length,
    stoppedEarly,
    baseRTP,
    jackpotRTP_ev,
    totalRTP,
    withinTarget,
    ciHalfWidth:   finalCI,
    jackpotHits:   totalJpHits,
    pityFires:     totalPityFires,
    batchBaseRtps,
    // Gate thresholds for the caller's reference
    baseTarget:    BASE_TARGET,
    tolerance:     TOLERANCE,
  };
}

// ── Worker message handler ────────────────────────────────────────────────

self.onmessage = function (event) {
  const { command, config, totalSpins, batchSize, earlyStopCI } = event.data;

  if (command !== 'verify') {
    self.postMessage({ type: 'error', message: `Unknown command: ${command}` });
    return;
  }

  // Validate required fields.
  if (!config || !config.PAYOUTS || !config.SYMBOLS) {
    self.postMessage({ type: 'error', message: 'config missing PAYOUTS or SYMBOLS' });
    return;
  }

  const params = {
    config,
    totalSpins:  totalSpins  || 3_000_000,
    batchSize:   batchSize   || 300_000,
    earlyStopCI: earlyStopCI || 0.1,
  };

  // Reconstruct PAYOUTS as a plain object if it was frozen/structured-cloned.
  // (Structured clone loses Object.freeze but preserves values, which is fine.)

  try {
    const maxBatches = Math.ceil(params.totalSpins / params.batchSize);

    // Override _runSimulation to emit progress messages.
    // We do this by wrapping the batch loop with progress reporting.
    const { PAYOUTS, JACKPOT_FRACTION, JACKPOT_SEED, PITY_THRESHOLD, REEL_COUNT } = params.config;
    const BET          = 1;
    const BASE_TARGET  = 87;
    const TOLERANCE    = 0.5;
    const SYMBOLS      = params.config.SYMBOLS;
    const TOTAL_WEIGHT = SYMBOLS.reduce((a, s) => a + s.weight, 0);

    const P_JP        = SYMBOLS.find(s => s.id === 'jackpot').weight / TOTAL_WEIGHT;
    const P_TRIGGER   = P_JP ** 3;
    const jackpotRTP_ev = (P_TRIGGER * JACKPOT_SEED + JACKPOT_FRACTION) * 100;

    const batchBaseRtps = [];
    let grandWagered   = 0;
    let grandRetBase   = 0;
    let totalJpHits    = 0;
    let totalPityFires = 0;
    let stoppedEarly   = false;

    for (let b = 0; b < maxBatches; b++) {
      let wag     = 0;
      let retBase = 0;
      let jpHits  = 0;
      let pFires  = 0;
      let simJp   = JACKPOT_SEED;
      let simPity = 0;

      for (let i = 0; i < params.batchSize; i++) {
        wag   += BET;
        simJp += BET * JACKPOT_FRACTION;

        const syms = [];
        for (let j = 0; j < REEL_COUNT; j++) {
          syms.push(_weightedPick(SYMBOLS, TOTAL_WEIGHT));
        }

        let pityFlag = false;
        if (simPity >= PITY_THRESHOLD) {
          syms[1]  = syms[0];
          pityFlag = true;
          simPity  = 0;
          pFires++;
        }

        const res = _resolve(syms, BET, PAYOUTS);
        if (res.type === 'jackpot') {
          simJp = JACKPOT_SEED;
          jpHits++;
          if (!pityFlag) simPity = 0;
        } else {
          retBase += res.payout;
          if (res.payout === 0 && !pityFlag) simPity++;
        }
      }

      const batchBaseRtp = (retBase / wag) * 100;
      batchBaseRtps.push(batchBaseRtp);

      grandWagered   += wag;
      grandRetBase   += retBase;
      totalJpHits    += jpHits;
      totalPityFires += pFires;

      // Emit progress after each batch.
      self.postMessage({
        type:            'progress',
        batchesComplete: b + 1,
        totalBatches:    maxBatches,
        partialRTP:      (grandRetBase / grandWagered) * 100,
      });

      // Early termination.
      if (b >= 2) {
        const ci = _ciHalfWidth(batchBaseRtps);
        if (ci < params.earlyStopCI) {
          stoppedEarly = true;
          break;
        }
      }
    }

    const baseRTP      = (grandRetBase / grandWagered) * 100;
    const totalRTP     = baseRTP + jackpotRTP_ev;
    const withinTarget = Math.abs(baseRTP - BASE_TARGET) <= TOLERANCE;
    const finalCI      = _ciHalfWidth(batchBaseRtps);

    const result = {
      totalSpins:    grandWagered,
      batchesRun:    batchBaseRtps.length,
      stoppedEarly,
      baseRTP,
      jackpotRTP_ev,
      totalRTP,
      withinTarget,
      ciHalfWidth:   finalCI,
      jackpotHits:   totalJpHits,
      pityFires:     totalPityFires,
      batchBaseRtps,
      baseTarget:    BASE_TARGET,
      tolerance:     TOLERANCE,
    };

    self.postMessage({ type: 'complete', result, stoppedEarly });

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
