import { writeFileSync } from 'node:fs';

// ===========================================================================
// V2.0 — Adversary sim model (standalone).
//
// Spec: sim/ADVERSARY.md.  Design: DESIGN.md Part II.
//
// This is the FIRST V2 build and, per project discipline, it is sim-only:
// no game code changes until this model shows the growth-vs-defense loop is
// balanceable.  It answers the V2.0 acceptance questions:
//
//   1. Does defense ever fully starve growth?           (defense tax in band)
//   2. Do the Part I pacing targets survive combat?      (projected Tet/Pent)
//   3. Are setbacks a mistakes-cost, not the default?    (setback count)
//   4. With combat off, do we reproduce locked pacing?   (--no-adversary guard)
//
// Method.  Rather than re-deriving the whole economy, we layer combat on top
// of the LOCKED pacing curve (sim/PACING_LOCKED.md).  The key theoretical
// move: both the incoming threat AND the player's production scale with the
// frontier (the current Comprehension ceiling).  So we work in *normalized*
// units where production capacity = 1.0/tick, threat is a fraction of it, and
// Core HP is denominated in "magnitude-seconds."  Because threat and
// production scale together, the defense tax is frontier-invariant — combat
// stays proportionate at every tier — and we tune a few interpretable knobs
// until the tax lands in band.
//
// A diverted fraction `tax` of production slows growth by (1 - tax), so the
// run stretches by 1/(1 - tax).  We integrate (1 - tax) per tick as
// "growth-work" and read off when each locked milestone is reached.
//
// Run:  node sim/adversary.ts
//       node sim/adversary.ts --verbose
//       node sim/adversary.ts --no-adversary      (regression vs locked curve)
//       node sim/adversary.ts --csv combat.csv
// ===========================================================================

// --------------------------------------------------------------------------
// Tuning surface — the only numbers to touch when balancing.
// --------------------------------------------------------------------------
const TUNING = {
  // Threat.  Steady incoming antimagnitude per tick, as a fraction of the
  // player's (normalized) production capacity at the current frontier.
  // 0.15 = the recommended baseline from the --sweep (moderate, felt war).
  THREAT_LEVEL: 0.15,

  // Defense efficiency.  Normalized threat neutralized per unit of production
  // spent on batteries.  < 1 because firing a battery pays the fuel ladder
  // (overhead).  0.9 ⇒ ~11% fuel overhead.
  DEFENSE_EFFICIENCY: 0.9,

  // Most of production the player can divert to defense in a pinch — the rest
  // is illiquid (committed to in-flight growth, unbuilt infra).  This is the
  // cap that lets a big boss out-pace the line and actually drain the Core.
  MAX_DEFENSE_FRAC: 0.6,

  // Negate rebate.  Fraction of the defense cost a Negate-battery returns to
  // the economy as positive value (the "error becomes an asset" mechanic).
  // Offsets the net tax without reducing delivered defense.
  NEGATE_REBATE: 0.25,

  // Bosses.  One boss is scheduled at every Comprehension-tier milestone
  // (matching the "every tier carries a puzzle" cadence).  During a boss the
  // threat spikes past what batteries can fully absorb (> MAX_DEFENSE_FRAC),
  // so the Core takes real damage — the HP mechanic only matters if bosses
  // can actually out-pace the line.
  BOSS_MULT: 4.0,
  BOSS_DURATION: 25, // ticks

  // Core.  Hit-points in normalized magnitude-seconds; the agent repairs when
  // HP dips below the safety floor, paying for it out of production.
  CORE_HP_MAX: 40,
  CORE_HP_FLOOR: 16, // repair kicks in below this
  CORE_REPAIR_RATE: 1.5, // HP/tick the agent can buy back (counts toward tax)

  // Setback.  On Core collapse: pause the wave and lose growth-work.
  SETBACK_PAUSE: 60, // ticks the wave is suspended while rebuilding
  SETBACK_GROWTH_PENALTY: 0, // extra growth-work lost beyond the pause itself

  // Acceptance band for the mean defense tax — "meaningful but not crushing"
  // for an idle-friendly builder with a combat layer.
  TAX_BAND: [0.1, 0.3] as const,
} as const;

// --------------------------------------------------------------------------
// The locked timeline (sim/PACING_LOCKED.md).  Comp tiers define the frontier;
// the Adversary onsets at the Subtraction unlock.
// --------------------------------------------------------------------------
const ONSET_TICK = 599; // subtraction — the Adversary switches on here

/** Comprehension tier unlocks: [baselineTick, tierIndex N] ⇒ frontier 2^N. */
const COMP_UNLOCKS: ReadonlyArray<readonly [number, number]> = [
  [567, 2], [608, 3], [622, 4], [861, 5], [952, 6], [1099, 7],
  [2126, 8], [3009, 9], [3999, 10], [15766, 11], [17080, 12], [18517, 13],
  [20310, 14], [22461, 15], [24969, 16], [27833, 17], [31054, 18],
  [34632, 19], [38568, 20],
];

/** Milestones we report projected times for. [label, baselineTick]. */
const MILESTONES: ReadonlyArray<readonly [string, number]> = [
  ['tetration', 15046],
  ['pentation', 42484],
];

const END_TICK = 42484; // pentation (baseline)

/** Frontier tier index (N, where ceiling = 2^N) at a given baseline-equiv tick. */
function frontierTier(baselineTick: number): number {
  let tier = 1; // baseline comp ≤ 2
  for (const [t, n] of COMP_UNLOCKS) {
    if (baselineTick >= t) tier = n;
    else break;
  }
  return tier;
}

/** Bosses fire at each comp-tier unlock at/after onset; window = BOSS_DURATION. */
function bossActive(baselineTick: number): boolean {
  for (const [t] of COMP_UNLOCKS) {
    if (t < ONSET_TICK) continue;
    if (baselineTick >= t && baselineTick < t + TUNING.BOSS_DURATION) return true;
  }
  return false;
}

// --------------------------------------------------------------------------
// Simulation.
// --------------------------------------------------------------------------
interface TickRecord {
  realTick: number;
  baselineTick: number;
  tier: number;
  tax: number;
  margin: number; // defended - threat (normalized); negative = leak
  coreHp: number;
  boss: boolean;
  setback: boolean;
}

interface Result {
  records: TickRecord[];
  projected: Map<string, number>; // milestone label -> projected real tick
  setbacks: number;
  meanTax: number;
  peakTax: number;
  minCoreHp: number;
  taxToTetration: number;
}

function simulate(adversaryOn: boolean, override: Partial<typeof TUNING> = {}): Result {
  const T = { ...TUNING, ...override };
  const records: TickRecord[] = [];
  const projected = new Map<string, number>();

  let coreHp = T.CORE_HP_MAX;
  let setbacks = 0;
  let pause = 0;
  let growthWork = 0;
  let taxSum = 0;
  let peakTax = 0;
  let minCoreHp = T.CORE_HP_MAX;
  let taxSumToTet = 0;
  let ticksToTet = 0;

  const eff = T.DEFENSE_EFFICIENCY;
  const maxRealTicks = 400_000; // safety

  for (let realTick = ONSET_TICK; ; realTick++) {
    if (realTick - ONSET_TICK > maxRealTicks) break;

    const baselineTick = ONSET_TICK + Math.floor(growthWork);
    const tier = frontierTier(baselineTick);

    let tax = 0;
    let margin = 0;
    let boss = false;
    let setback = false;

    if (!adversaryOn) {
      // Regression guard: no combat, growth proceeds at baseline rate.
      growthWork += 1;
    } else if (pause > 0) {
      // Mid-setback: the wave is suspended, the line is being rebuilt.
      pause -= 1;
      coreHp = Math.min(T.CORE_HP_MAX, coreHp + T.CORE_REPAIR_RATE);
      tax = 1; // all production goes to rebuilding, none to growth
      growthWork += 0; // stalled
    } else {
      boss = bossActive(baselineTick);

      // Incoming threat (normalized to production capacity = 1.0/tick).
      const threat = T.THREAT_LEVEL * (boss ? T.BOSS_MULT : 1);

      // Repair allocation if the Core has dipped below the safety floor.
      let repairFrac = 0;
      if (coreHp < T.CORE_HP_FLOOR) {
        repairFrac = T.CORE_REPAIR_RATE / T.CORE_HP_MAX; // normalized cost
      }

      // Production we can throw at batteries: capped, and after repair.
      const defenseBudget = Math.max(0, T.MAX_DEFENSE_FRAC - repairFrac);
      // Gross production needed to fully neutralize the threat.
      const grossFrac = threat / eff;
      // What we can actually afford this tick — a big boss may exceed the cap.
      const spentFrac = Math.min(grossFrac, defenseBudget);
      const defended = spentFrac * eff;
      margin = defended - threat;

      // The Negate rebate offsets the *cost* of what we spent (not the defense).
      const netCost = spentFrac * (1 - T.NEGATE_REBATE);
      tax = Math.min(1, netCost + repairFrac);

      // Core HP dynamics.
      const leak = Math.max(0, threat - defended);
      coreHp -= leak;
      if (repairFrac > 0) coreHp = Math.min(T.CORE_HP_MAX, coreHp + T.CORE_REPAIR_RATE);

      if (coreHp <= 0) {
        setback = true;
        setbacks += 1;
        coreHp = T.CORE_HP_MAX * 0.5; // rebuilt partway
        pause = T.SETBACK_PAUSE;
        growthWork -= T.SETBACK_GROWTH_PENALTY;
      }

      growthWork += Math.max(0, 1 - tax);
    }

    taxSum += tax;
    peakTax = Math.max(peakTax, tax);
    minCoreHp = Math.min(minCoreHp, coreHp);
    if (baselineTick < MILESTONES[0][1]) {
      taxSumToTet += tax;
      ticksToTet += 1;
    }

    records.push({ realTick, baselineTick, tier, tax, margin, coreHp, boss, setback });

    // Milestone crossings: recorded the first real tick the player's *progress*
    // (baselineTick = onset + growth-work) reaches the locked milestone tick.
    for (const [label, baseTick] of MILESTONES) {
      if (!projected.has(label) && baselineTick >= baseTick) {
        projected.set(label, realTick);
      }
    }

    if (projected.size === MILESTONES.length) break;
  }

  const n = records.length;
  return {
    records,
    projected,
    setbacks,
    meanTax: taxSum / n,
    peakTax,
    minCoreHp,
    taxToTetration: ticksToTet > 0 ? taxSumToTet / ticksToTet : 0,
  };
}

// --------------------------------------------------------------------------
// Reporting.
// --------------------------------------------------------------------------
function formatTicks(n: number): string {
  const s = Math.round(n);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m ${rs.toString().padStart(2, '0')}s`;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function report(res: Result, adversaryOn: boolean, verbose: boolean): void {
  console.log('\n=== V2.0 Adversary model ===\n');
  console.log(`  Mode: ${adversaryOn ? 'combat ON' : 'combat OFF (regression guard)'}`);
  console.log(`  Onset: subtraction @ ${formatTicks(ONSET_TICK)} (tick ${ONSET_TICK})`);
  console.log('');

  console.log('=== Projected milestone pacing (vs locked baseline) ===\n');
  console.log(
    `  ${'Milestone'.padEnd(12)} | ${'Locked'.padEnd(12)} | ${'Projected'.padEnd(12)} | Stretch`,
  );
  console.log('  ' + '-'.repeat(58));
  for (const [label, baseTick] of MILESTONES) {
    const proj = res.projected.get(label) ?? NaN;
    const stretch = proj / baseTick;
    console.log(
      `  ${label.padEnd(12)} | ${formatTicks(baseTick).padEnd(12)} | ` +
        `${formatTicks(proj).padEnd(12)} | ${stretch.toFixed(2)}×`,
    );
  }
  console.log('');

  if (adversaryOn) {
    console.log('=== Defense economy ===\n');
    console.log(`  Mean defense tax:          ${pct(res.meanTax)}`);
    console.log(`  Mean tax (to tetration):   ${pct(res.taxToTetration)}`);
    console.log(`  Peak defense tax:          ${pct(res.peakTax)} (boss windows)`);
    console.log(`  Min Core HP:               ${res.minCoreHp.toFixed(1)} / ${TUNING.CORE_HP_MAX}`);
    console.log(`  Setbacks (Core collapses): ${res.setbacks}`);

    // Survival-margin distribution (combat ticks only).
    const margins = res.records.filter((r) => !r.setback).map((r) => r.margin);
    const leaks = margins.filter((m) => m < -1e-9).length;
    console.log(`  Leak ticks (margin < 0):   ${leaks} / ${margins.length} (${pct(leaks / margins.length)})`);
    console.log('');

    // Acceptance verdict.
    console.log('=== Acceptance (sim/ADVERSARY.md §7) ===\n');
    const [lo, hi] = TUNING.TAX_BAND;
    const taxOk = res.meanTax >= lo && res.meanTax <= hi;
    const tetStretch = (res.projected.get('tetration') ?? NaN) / MILESTONES[0][1];
    const pentStretch = (res.projected.get('pentation') ?? NaN) / MILESTONES[1][1];
    const pacingOk = tetStretch <= 1.25 && pentStretch <= 1.4;
    const setbackOk = res.setbacks <= 3;
    line(`Tax in band [${pct(lo)}, ${pct(hi)}]`, taxOk, `mean ${pct(res.meanTax)}`);
    line('Growth not starved', res.meanTax < 0.6, `tax < 60%`);
    line('Pacing within tolerance', pacingOk, `tet ${tetStretch.toFixed(2)}×, pent ${pentStretch.toFixed(2)}×`);
    line('Setbacks are exceptional', setbackOk, `${res.setbacks} on the optimal line`);
    console.log('');
  } else {
    const tet = res.projected.get('tetration');
    const pent = res.projected.get('pentation');
    const ok = tet === 15046 && pent === 42484;
    console.log('=== Regression guard ===\n');
    line('Reproduces locked curve', ok, `tet ${tet}, pent ${pent} (expect 15046 / 42484)`);
    console.log('');
  }

  if (verbose) {
    console.log('=== Tick trace (every 2000 real ticks) ===\n');
    console.log(`  ${'real'.padStart(7)} | ${'base'.padStart(7)} | tier | ${'tax'.padStart(6)} | ${'coreHP'.padStart(6)} | boss`);
    console.log('  ' + '-'.repeat(52));
    for (const r of res.records) {
      // Sample every 2000 ticks, plus always surface setbacks.
      if ((r.realTick - ONSET_TICK) % 2000 !== 0 && !r.setback) continue;
      console.log(
        `  ${String(r.realTick).padStart(7)} | ${String(r.baselineTick).padStart(7)} | ` +
          `${String(r.tier).padStart(4)} | ${pct(r.tax).padStart(6)} | ${r.coreHp.toFixed(1).padStart(6)} | ${r.boss ? 'BOSS' : ''}${r.setback ? ' SETBACK' : ''}`,
      );
    }
    console.log('');
  }
}

function line(label: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(28)} ${detail}`);
}

function writeCsv(res: Result, path: string): void {
  const lines = ['realTick,baselineTick,tier,tax,margin,coreHp,boss,setback'];
  for (const r of res.records) {
    lines.push(
      `${r.realTick},${r.baselineTick},${r.tier},${r.tax.toFixed(4)},${r.margin.toFixed(4)},${r.coreHp.toFixed(2)},${r.boss ? 1 : 0},${r.setback ? 1 : 0}`,
    );
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
  console.log(`✓ CSV written to ${path}\n`);
}

// --------------------------------------------------------------------------
// Sweep — the tax/pacing trade-off as a menu.
//
// Combat cannot keep pentation at the locked ~12h: any meaningful defense tax
// delays it.  This sweep makes that quantitative so the team can pick its
// point on the curve (how hard the war is vs how much it costs the run), and
// see how much better batteries (DEFENSE_EFFICIENCY) shift the whole curve.
// --------------------------------------------------------------------------
function runSweep(): void {
  const threats = [0.08, 0.1, 0.12, 0.15, 0.18, 0.2, 0.25, 0.3];
  const effs = [0.9, 1.1, 1.3];

  console.log('\n=== Defense-intensity sweep ===\n');
  console.log('  Pentation time as a function of war intensity (THREAT_LEVEL)');
  console.log('  and battery tech (DEFENSE_EFFICIENCY). Baseline pentation 11h 48m.\n');

  const header = `  ${'threat'.padStart(7)} | ${'meanTax'.padStart(8)} | ` +
    effs.map((e) => `eff ${e.toFixed(1)}`.padEnd(13)).join('| ');
  console.log(header);
  console.log('  ' + '-'.repeat(header.length));

  for (const threat of threats) {
    const cells = effs.map((e) => {
      const res = simulate(true, { THREAT_LEVEL: threat, DEFENSE_EFFICIENCY: e });
      const pent = res.projected.get('pentation') ?? NaN;
      return `${formatTicks(pent)} ${(pent / MILESTONES[1][1]).toFixed(2)}×`.padEnd(13);
    });
    // meanTax shown for the middle efficiency as a representative figure.
    const mid = simulate(true, { THREAT_LEVEL: threat, DEFENSE_EFFICIENCY: effs[0] });
    const mark = Math.abs(threat - TUNING.THREAT_LEVEL) < 1e-9 ? ' ← current threat' : '';
    console.log(
      `  ${threat.toFixed(2).padStart(7)} | ${pct(mid.meanTax).padStart(8)} | ${cells.join('| ')}${mark}`,
    );
  }

  console.log(
    '\n  Reading:\n' +
      '  • No row returns pentation to the locked 11h48m — combat always costs time.\n' +
      '  • Moving DOWN a column (harder war) trades minutes-to-pentation for a\n' +
      '    higher, more felt defense tax.\n' +
      '  • Moving RIGHT a row (better batteries) buys most of that time back at\n' +
      '    the same threat — the in-game lever is battery levels + Negate rebate.\n' +
      '  • Suggested lock: threat 0.15–0.18 at eff ≥ 1.1 → tax ~13–16%,\n' +
      '    pentation ~13h. Re-baseline the §V2.8 target to "~13h with combat."\n',
  );
}

// --------------------------------------------------------------------------
// CLI.
// --------------------------------------------------------------------------
function main(): void {
  const argv = process.argv.slice(2);

  if (argv.includes('--sweep')) {
    runSweep();
    return;
  }

  const adversaryOn = !argv.includes('--no-adversary');
  const verbose = argv.includes('--verbose');
  const csvIdx = argv.indexOf('--csv');
  const csvPath = csvIdx >= 0 ? argv[csvIdx + 1] : null;

  const res = simulate(adversaryOn);
  report(res, adversaryOn, verbose);
  if (csvPath) writeCsv(res, csvPath);
}

main();
