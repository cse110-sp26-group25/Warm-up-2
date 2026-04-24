#!/usr/bin/env node
/**
 * scripts/verifyRtp.js — Build-time RTP verification script (Iteration 17).
 *
 * Runs a high-confidence RTP simulation and writes `rtp_certification.json`
 * to the game root. The game reads this file at startup and skips the
 * expensive runtime simulation when a valid cert is present.
 *
 * ── Why build-time? ──────────────────────────────────────────────────────
 *
 *   The RTP simulation needs 3 million+ spins to achieve the ±0.5 pp
 *   accuracy required for the ±0.5 % tolerance gate. In V8 (Node.js) this
 *   takes about 1–2 seconds — acceptable in a build step but not in a
 *   browser boot sequence. Moving it here eliminates the startup delay while
 *   still providing verifiable evidence that the design target is met.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *
 *   node scripts/verifyRtp.js
 *   node scripts/verifyRtp.js --spins=5000000
 *   node scripts/verifyRtp.js --spins=1000000 --batch=100000
 *   node scripts/verifyRtp.js --output=../dist/rtp_certification.json
 *   node scripts/verifyRtp.js --quiet
 *
 * ── Exit codes ───────────────────────────────────────────────────────────
 *
 *   0  Success — cert written and within_target is true.
 *   1  Failure — simulation ran but base RTP is outside the ±0.5 % gate.
 *   2  Error   — script failed to run (bad args, FS error, etc.).
 *
 * ── Jackpot RTP methodology ──────────────────────────────────────────────
 *
 *   Jackpot events are so rare (P ≈ 1e-6 per spin) that a 3M-spin
 *   simulation will typically see only 2–4 jackpot hits, introducing
 *   extreme sampling variance. Instead of relying on those few observed
 *   hits, this script computes jackpot_rtp analytically:
 *
 *     P_jackpot  = (jackpot_symbol_weight / total_weight)^3
 *     E[pool]    = JACKPOT_SEED + (BET × JACKPOT_FRACTION) / P_jackpot
 *     jackpot_rtp = P_jackpot × E[pool] / BET
 *                 = P_jackpot × JACKPOT_SEED + JACKPOT_FRACTION
 *
 *   At JACKPOT_SEED=1000, JACKPOT_FRACTION=0.05, P≈1e-6:
 *     jackpot_rtp ≈ 0.001 + 0.05 = 0.051 (5.1 %)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── CLI argument parsing ──────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [rawKey, rawVal] = a.slice(2).split('=');
      return [rawKey.toLowerCase(), rawVal !== undefined ? rawVal : 'true'];
    })
);

const TOTAL_SPINS  = parseInt(args.spins  || '3000000', 10);
const BATCH_SIZE   = parseInt(args.batch  || '300000',  10);
const EARLY_STOP_CI = parseFloat(args.ci  || '0.1');       // pp
const QUIET        = args.quiet  === 'true';
const OUTPUT_PATH  = args.output
  ? path.resolve(process.cwd(), args.output)
  : path.join(__dirname, '..', 'rtp_certification.json');

// ── Game configuration ────────────────────────────────────────────────────
// IMPORTANT: keep this in sync with CONFIG in gameLogic.js.
// If payout values or jackpot settings change, re-run this script and commit
// the updated rtp_certification.json.

const CONFIG = {
  REEL_COUNT:       5,
  PITY_THRESHOLD:   20,
  JACKPOT_FRACTION: 0.05,
  JACKPOT_SEED:     1000,
  PAYOUTS: {
    FIVE:  { jackpot: 0, seven: 560, gear: 168, bolt: 84,    chip: 45,   robo: 28,   nut: 13.5, screw: 8     },
    FOUR:  {             seven: 135, gear:  40, bolt: 20,    chip: 11,   robo:  7,   nut:  3.5, screw: 2     },
    THREE: { jackpot: 0, seven: 335, gear:  84, bolt: 41,    chip: 25,   robo: 17,   nut:  8.5, screw: 5     },
    TWO:   {             seven:  16.5, gear: 7.75, bolt: 4.85, chip: 3.4, robo: 2.2, nut: 1.65, screw: 0.83 },
  },
};

const SYMBOLS = [
  { id: 'jackpot', weight:  1 },
  { id: 'seven',   weight:  3 },
  { id: 'gear',    weight:  6 },
  { id: 'bolt',    weight: 10 },
  { id: 'chip',    weight: 14 },
  { id: 'robo',    weight: 18 },
  { id: 'nut',     weight: 22 },
  { id: 'screw',   weight: 26 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((a, s) => a + s.weight, 0);

// ── Simulation helpers ────────────────────────────────────────────────────

/**
 * Resolve the centre-row payline — must match gameLogic.js `_resolve`.
 */
function _resolve(syms, bet) {
  const anchor = syms[0];
  let matchCount = 1;
  for (let i = 1; i < syms.length; i++) {
    if (syms[i] === anchor) matchCount++;
    else break;
  }
  if (matchCount >= 3 && anchor === 'jackpot') return { payout: 0, type: 'jackpot' };
  if (matchCount === 5) {
    const mult = CONFIG.PAYOUTS.FIVE[anchor] || 0;
    return { payout: +(bet * mult).toFixed(2), type: 'five' };
  }
  if (matchCount === 4) {
    const mult = CONFIG.PAYOUTS.FOUR[anchor] || 0;
    return { payout: +(bet * mult).toFixed(2), type: 'four' };
  }
  if (matchCount === 3) {
    const mult = CONFIG.PAYOUTS.THREE[anchor] || 0;
    return { payout: +(bet * mult).toFixed(2), type: 'three' };
  }
  if (matchCount === 2) {
    const mult = CONFIG.PAYOUTS.TWO[anchor] || 0;
    return { payout: +(bet * mult).toFixed(2), type: 'two' };
  }
  return { payout: 0, type: 'loss' };
}

/** Weighted symbol pick — must match gameLogic.js `_weightedPickSymbol`. */
function _weightedPick() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const sym of SYMBOLS) {
    r -= sym.weight;
    if (r < 0) return sym.id;
  }
  return SYMBOLS[SYMBOLS.length - 1].id;
}

/**
 * 95 % CI half-width for an array of per-batch RTP values.
 * @param {number[]} arr
 * @returns {number}
 */
function _ciHalfWidth(arr) {
  if (arr.length < 2) return Infinity;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd   = Math.sqrt(arr.reduce((a, v) => a + (v - mean) ** 2, 0) / arr.length);
  return 1.96 * sd / Math.sqrt(arr.length);
}

/**
 * Build a djb2 fingerprint of the config for change detection at runtime.
 * @returns {string} 8-char hex string.
 */
function _buildFingerprint() {
  const raw = JSON.stringify(CONFIG.PAYOUTS) + '|' + CONFIG.JACKPOT_FRACTION + '|' + CONFIG.PITY_THRESHOLD;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(16);
}

// ── Main simulation ───────────────────────────────────────────────────────

function log(msg) { if (!QUIET) process.stdout.write(msg); }
function logln(msg) { if (!QUIET) console.log(msg); }

logln(`\n[verifyRtp] Starting build-time RTP verification`);
logln(`  total_spins: ${TOTAL_SPINS.toLocaleString()}`);
logln(`  batch_size:  ${BATCH_SIZE.toLocaleString()}`);
logln(`  early_stop:  CI < ${EARLY_STOP_CI} pp`);
logln(`  output:      ${OUTPUT_PATH}`);
logln('');

const BET          = 1;
const BASE_TARGET  = 87;   // 92 % total − 5 % jackpot contribution
const TOLERANCE    = 0.5;

// ── Analytical jackpot RTP ────────────────────────────────────────────────
// Avoids simulation variance for the rare jackpot event.
const P_JP        = SYMBOLS.find(s => s.id === 'jackpot').weight / TOTAL_WEIGHT;
const P_TRIGGER   = P_JP ** 3;
// E[pool] at time of win (steady-state geometric distribution approximation)
const E_POOL      = CONFIG.JACKPOT_SEED + (BET * CONFIG.JACKPOT_FRACTION) / P_TRIGGER;
const jackpotRTP_ev = P_TRIGGER * E_POOL;   // fraction (not percentage)

logln(`[verifyRtp] Jackpot RTP (analytical EV):`);
logln(`  P(jackpot symbol)  = ${P_JP.toFixed(6)}`);
logln(`  P(trigger ≥3 reel) = ${P_TRIGGER.toExponential(4)}`);
logln(`  E[pool at win]     = ${E_POOL.toFixed(2)}`);
logln(`  jackpot_rtp (EV)   = ${(jackpotRTP_ev * 100).toFixed(4)} %`);
logln('');

// ── Batched base-game simulation ──────────────────────────────────────────
const maxBatches    = Math.ceil(TOTAL_SPINS / BATCH_SIZE);
const batchBaseRtps = [];
let grandWagered    = 0;
let grandRetBase    = 0;
let totalJpHits     = 0;
let totalPityFires  = 0;
let stoppedEarly    = false;

const startMs = Date.now();
log(`[verifyRtp] Simulating: `);

for (let b = 0; b < maxBatches; b++) {
  let wag     = 0;
  let retBase = 0;
  let jpHits  = 0;
  let pFires  = 0;
  let simJp   = CONFIG.JACKPOT_SEED;
  let simPity = 0;

  for (let i = 0; i < BATCH_SIZE; i++) {
    wag   += BET;
    simJp += BET * CONFIG.JACKPOT_FRACTION;

    const syms = [];
    for (let j = 0; j < CONFIG.REEL_COUNT; j++) syms.push(_weightedPick());

    let pityFlag = false;
    if (simPity >= CONFIG.PITY_THRESHOLD) {
      syms[1]  = syms[0];
      pityFlag = true;
      simPity  = 0;
      pFires++;
    }

    const res = _resolve(syms, BET);
    if (res.type === 'jackpot') {
      simJp = CONFIG.JACKPOT_SEED;
      jpHits++;
      if (!pityFlag) simPity = 0;
    } else {
      retBase += res.payout;
      if (res.payout === 0 && !pityFlag) simPity++;
    }
  }

  const batchRTP = (retBase / wag) * 100;
  batchBaseRtps.push(batchRTP);
  grandWagered   += wag;
  grandRetBase   += retBase;
  totalJpHits    += jpHits;
  totalPityFires += pFires;

  log('.');  // progress dot per batch

  // Early termination after at least 3 batches.
  if (b >= 2) {
    const ci = _ciHalfWidth(batchBaseRtps);
    if (ci < EARLY_STOP_CI) {
      log(` [early stop at batch ${b + 1}/${maxBatches}]`);
      stoppedEarly = true;
      break;
    }
  }
}

logln('');

const elapsedMs   = Date.now() - startMs;
const baseRTP     = (grandRetBase / grandWagered) * 100;
const jackpotRTP  = jackpotRTP_ev * 100;
const totalRTP    = baseRTP + jackpotRTP;
const withinTarget = Math.abs(baseRTP - BASE_TARGET) <= TOLERANCE;
const ciHalfWidth  = _ciHalfWidth(batchBaseRtps);
const fingerprint  = _buildFingerprint();

// ── Results ───────────────────────────────────────────────────────────────
logln(`[verifyRtp] Results:`);
logln(`  spins simulated: ${grandWagered.toLocaleString()}`);
logln(`  batches run:     ${batchBaseRtps.length}${stoppedEarly ? ' (early stop)' : ''}`);
logln(`  elapsed:         ${(elapsedMs / 1000).toFixed(2)} s`);
logln('');
logln(`  base_rtp:        ${baseRTP.toFixed(4)} %`);
logln(`  jackpot_rtp:     ${jackpotRTP.toFixed(4)} % (EV, analytical)`);
logln(`  total_rtp:       ${totalRTP.toFixed(4)} %`);
logln(`  base target:     ${BASE_TARGET} % ± ${TOLERANCE} %`);
logln(`  within_target:   ${withinTarget ? '✓ YES' : '✗ NO'}`);
logln(`  95% CI:          ± ${ciHalfWidth.toFixed(4)} pp`);
logln(`  jackpot_hits:    ${totalJpHits}`);
logln(`  pity_fires:      ${totalPityFires}`);
logln(`  fingerprint:     ${fingerprint}`);
logln('');

// ── Write certificate ─────────────────────────────────────────────────────
const cert = {
  base_rtp:          +(baseRTP    / 100).toFixed(6),
  jackpot_rtp:       +(jackpotRTP / 100).toFixed(6),
  total_rtp:         +(totalRTP   / 100).toFixed(6),
  sample_size:       grandWagered,
  batches_run:       batchBaseRtps.length,
  stopped_early:     stoppedEarly,
  ci_halfwidth_pp:   +ciHalfWidth.toFixed(6),
  jackpot_hits:      totalJpHits,
  pity_fires:        totalPityFires,
  within_target:     withinTarget,
  base_target:       BASE_TARGET / 100,
  tolerance:         TOLERANCE / 100,
  config_fingerprint: fingerprint,
  generator:         'scripts/verifyRtp.js',
  verified_at:       new Date().toISOString(),
};

try {
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cert, null, 2) + '\n', 'utf8');
  logln(`[verifyRtp] Certificate written to: ${OUTPUT_PATH}`);
} catch (err) {
  console.error(`[verifyRtp] Failed to write certificate: ${err.message}`);
  process.exit(2);
}

// Exit with code 1 if outside gate so CI pipelines can catch regressions.
if (!withinTarget) {
  console.error(
    `\n[verifyRtp] FAIL: base_rtp=${baseRTP.toFixed(4)} % is outside the ` +
    `${BASE_TARGET} % ± ${TOLERANCE} % target. ` +
    `Re-tune the payout table and re-run.`
  );
  process.exit(1);
}

logln(`[verifyRtp] PASS — certification complete.\n`);
process.exit(0);
