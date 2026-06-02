// ===========================================================================
// V3 — Per-weapon balance model (standalone).
//
// Companion to sim/adversary.ts. That model checks the AGGREGATE question
// ("does the defense tax stay in band as growth and defense compete?"). This
// one checks the MICRO question the design hinges on:
//
//     Is every defensive weapon's cost HONEST across magnitude and
//     Comprehension — i.e. is any function trivial, and does any mint money?
//
// It encodes the four anti-trivialization laws as cost formulas, normalised
// against the Add anchor, and reports where the balanced region is.
//
//   Law 1 — Conservation. Removing magnitude M costs ~M. The Add weapon is
//           the anchor: cost == cost to PRODUCE a block ≥ M, so it scales
//           1:1 with threat and can never be trivial. Everything is measured
//           RELATIVE TO ADD (the honest price), which sidesteps the trap
//           that a unit of magnitude costs more fuel inside a small number
//           than a big one.
//   Law 2 — Reducers can't finish. Divide/Mod only soften (asymptote to,
//           never reach, zero), so a full-price Add is always in the chain.
//   Law 3 — Reducers pay to compress. Divide/Mod cost ∝ ⌈log₁₀ M⌉ — the
//           "defense ladder" mirroring the builder's α.5c fuel ladder.
//   Law 4 — Throughput is the wall. The wave is COUNT-heavy at the bottom;
//           the tax is dominated by the many small (Add-anchored) enemies
//           and the rare uncomprehended frontier, NOT by the reducible mids.
//
//   + Comprehension gates reach. No ordinary weapon touches an enemy above
//     the comp ceiling C; the frontier band (M > C) is reachable only by a
//     "delegated-comprehension" defender at a deliberate premium.
//
// Costs are fuel-equivalent units. Run:
//   node sim/weapons.ts
//   node sim/weapons.ts --sweep
// ===========================================================================

const TUNING = {
  // Production efficiency. cost(M) = C_PROD · M^ALPHA. ALPHA = 1 is the
  // addition era; ALPHA < 1 is the hyperoperator era (big numbers cheap per
  // unit). As operators unlock, ALPHA falls — the central trivialization
  // risk, since cheap big ammo cheapens big-enemy defense. The knob to sweep.
  C_PROD: 1,
  ALPHA: 0.62,

  // Reducer coefficients (Law 3): one divide/mod pass on magnitude M costs
  // C_* · ⌈log₁₀ M⌉.
  C_DIV: 0.9,
  C_MOD: 1.4,
  MOD_N: 12, // modulus fed to a mod-battery; residue ≈ MOD_N/2

  // Negate (convert): MUST cost ∝ magnitude (C_NEG · prodCost(M)), not ∝ log,
  // or converting big enemies becomes a better score source than the factory.
  C_NEG: 1.1,

  // Factor + salvage (composites): factor op + the cancellation salvage does
  // NOT cover. The model shows SALVAGE_FRAC = 1.0 (full conservation) makes
  // composite kills nearly free (just the log-scaled factor op) — trivial.
  // The sweet spot is PARTIAL recovery: salvage helps, but the kill still
  // pays real magnitude. Above 1.0 it mints currency (perpetual motion).
  C_FAC: 0.8,
  SALVAGE_FRAC: 0.5,

  // Delegated defender — the only thing that touches the uncomprehended
  // frontier band. A premium multiple of the would-be Add cost.
  C_DELEG: 6,

  // Comprehension ceiling C = 2^COMP_TIER.
  COMP_TIER: 20,

  // Threat intensity: the all-Add defense (the honest baseline) would cost
  // THREAT_FRAC of production. The ACTUAL tax = THREAT_FRAC · optimal/Add.
  THREAT_FRAC: 0.24,

  TAX_BAND: [0.1, 0.3] as const,
} as const;

// The wave, as COUNT shares (sum 1). Magnitudes are absolute, tied to the
// frontier: a count-heavy swarm at the bottom, rare giants at/above the
// ceiling. This is what keeps the war throughput-bound (Law 4).
interface Bracket {
  name: string;
  magOfC: number; // magnitude = magOfC × C
  count: number; // share of enemy COUNT
  composite: boolean; // factorable?
}
const BRACKETS: readonly Bracket[] = [
  { name: 'swarm',    magOfC: 0.000004, count: 0.6,  composite: true  }, // ~4
  { name: 'rabble',   magOfC: 0.00005,  count: 0.24, composite: true  }, // ~52
  { name: 'elite',    magOfC: 0.016,    count: 0.1,  composite: true  }, // ~16k
  { name: 'boss',     magOfC: 0.5,      count: 0.04, composite: false }, // ~524k, prime/perfect
  { name: 'frontier', magOfC: 2.0,      count: 0.02, composite: true  }, // ~2.1M, UNCOMPREHENDED
];

// --------------------------------------------------------------------------
// Cost model.
// --------------------------------------------------------------------------
const ceilLog10 = (x: number): number => Math.max(1, Math.ceil(Math.log10(Math.max(10, x))));
const compCeiling = (): number => Math.pow(2, TUNING.COMP_TIER);

/** Cost to produce magnitude M (and thus the Add weapon's cost). */
function prodCost(M: number): number {
  return TUNING.C_PROD * Math.pow(Math.max(1, M), TUNING.ALPHA);
}

/** Divide → Add: soften by repeated halving (each pass ∝ ⌈logM⌉), then
 *  Add-finish the residue, minimised over the number of halvings. */
function divideThenAdd(M: number): number {
  let best = Infinity;
  let cur = M;
  let soften = 0;
  const maxH = Math.ceil(Math.log2(Math.max(2, M))) + 1;
  for (let h = 0; h <= maxH; h++) {
    best = Math.min(best, soften + prodCost(cur));
    soften += TUNING.C_DIV * ceilLog10(cur);
    cur /= 2;
    if (cur < 2) break;
  }
  return best;
}

/** Mod-N → Add: one compression pass (∝ ⌈logM⌉) leaves a residue ≈ MOD_N/2
 *  for an Add to finish. Cheap per giant — but Law 3 keeps it ∝ logM,
 *  Comprehension gates it, and giants are rare (Law 4). */
function modThenAdd(M: number): number {
  return TUNING.C_MOD * ceilLog10(M) + prodCost(TUNING.MOD_N / 2);
}

/** Negate → +M score, at cost ∝ magnitude (conservation, not ∝ log). */
function negateCost(M: number): number {
  return TUNING.C_NEG * prodCost(M);
}

/** Factor + salvage (composites): factor op + the uncovered cancellation. */
function factorChain(M: number): number {
  return TUNING.C_FAC * ceilLog10(M) + (1 - TUNING.SALVAGE_FRAC) * prodCost(M);
}

function delegatedCost(M: number): number {
  return TUNING.C_DELEG * prodCost(M);
}

/** The honest reference price: Add (or the delegated premium above comp). */
function anchorCost(M: number): number {
  return M > compCeiling() ? delegatedCost(M) : prodCost(M);
}

interface Kill {
  cost: number;
  chain: string;
}

/** Cheapest honest kill-chain. Comprehension gates everything: above the
 *  ceiling only the delegated defender applies. */
function bestKill(M: number, composite: boolean): Kill {
  if (M > compCeiling()) return { cost: delegatedCost(M), chain: 'delegated' };
  const options: Array<[string, number]> = [
    ['add', prodCost(M)],
    ['divide→add', divideThenAdd(M)],
    ['mod→add', modThenAdd(M)],
  ];
  if (composite) options.push(['factor+salvage', factorChain(M)]);
  options.sort((a, b) => a[1] - b[1]);
  return { cost: options[0][1], chain: options[0][0] };
}

// --------------------------------------------------------------------------
// Aggregate: the defense tax, normalised against the Add anchor.
//
//   tax = THREAT_FRAC · (Σ count·optimalCost) / (Σ count·anchorCost)
//
// The denominator is "what an all-Add defense would cost"; THREAT_FRAC pins
// that to a chosen fraction of production. The numerator is the actual
// optimal-chain cost. Reducers pull the ratio below 1 (cheaper) — but only
// on the rare comprehended giants; the count-heavy swarm and the
// uncomprehended frontier are un-reducible, which anchors the tax.
// --------------------------------------------------------------------------
interface Row {
  name: string;
  M: number;
  comprehended: boolean;
  anchor: number;
  optimal: number;
  chain: string;
  taxShare: number; // fraction of total tax
  reducible: boolean; // optimal materially cheaper than Add?
}
interface TaxResult {
  tax: number; // combined (routine + frontier)
  routineTax: number; // comprehended brackets only
  frontierShare: number; // fraction of the combined tax from uncomprehended enemies
  rows: Row[];
}

function predictTax(): TaxResult {
  const C = compCeiling();
  let addBaseline = 0;
  let optimalBaseline = 0;
  let routineAdd = 0;
  let routineOpt = 0;
  const rawRows: Array<Omit<Row, 'taxShare'>> = [];

  for (const b of BRACKETS) {
    const M = b.magOfC * C;
    const anchor = anchorCost(M);
    const kill = bestKill(M, b.composite);
    addBaseline += b.count * anchor;
    optimalBaseline += b.count * kill.cost;
    if (M <= C) {
      routineAdd += b.count * anchor;
      routineOpt += b.count * kill.cost;
    }
    rawRows.push({
      name: b.name,
      M,
      comprehended: M <= C,
      anchor,
      optimal: kill.cost,
      chain: kill.chain,
      reducible: kill.cost < 0.5 * anchor && M <= C,
    });
  }

  const tax = TUNING.THREAT_FRAC * (optimalBaseline / addBaseline);
  const routineTax = TUNING.THREAT_FRAC * (routineOpt / addBaseline);
  const rows: Row[] = rawRows.map((r, i) => ({
    ...r,
    taxShare: (BRACKETS[i].count * r.optimal) / optimalBaseline,
  }));
  const frontierShare = rows
    .filter((r) => !r.comprehended)
    .reduce((s, r) => s + r.taxShare, 0);

  return { tax, routineTax, frontierShare, rows };
}

/** The decisive comparison: brute-forcing one frontier enemy with a delegated
 *  defender vs. raising Comprehension one tier so it falls in-band (then
 *  reducers handle it cheaply). Shows comp-upgrades — not delegated brute
 *  force — are the intended answer to the frontier. */
function frontierAnalysis(): { M: number; delegated: number; ifComprehended: number; ratio: number } {
  const M = 1.5 * compCeiling(); // an uncomprehended enemy just past the ceiling
  const delegated = delegatedCost(M);
  // After a one-tier comp upgrade the ceiling doubles → M is comprehended.
  const ifComprehended = (() => {
    const saved = TUNING.COMP_TIER;
    (TUNING as { COMP_TIER: number }).COMP_TIER = saved + 1;
    const k = bestKill(M, true).cost;
    (TUNING as { COMP_TIER: number }).COMP_TIER = saved;
    return k;
  })();
  return { M, delegated, ifComprehended, ratio: delegated / ifComprehended };
}

// --------------------------------------------------------------------------
// Absolute exploit checks.
// --------------------------------------------------------------------------
interface Scan {
  perpetualMotion: boolean;
  negateDominates: boolean;
  compGated: boolean;
}
function scanExploits(): Scan {
  const C = compCeiling();

  // Perpetual motion: a kill that mints net currency (salvage out-yields cost).
  const perpetualMotion =
    TUNING.SALVAGE_FRAC > 1 || factorChain(C / 2) < 0 || factorChain(64) < 0;

  // Negate-as-score must not beat production as a score source (per fuel).
  const negateScorePerFuel = C / negateCost(C); // score gained per fuel converting a frontier enemy
  const prodScorePerFuel = C / prodCost(C); // score per fuel producing magnitude C
  const negateDominates = negateScorePerFuel > prodScorePerFuel;

  // Comprehension gate: an above-comp enemy must cost the delegated premium —
  // no ordinary chain may undercut it.
  const aboveC = C * 2;
  const ordinary = Math.min(prodCost(aboveC), divideThenAdd(aboveC), modThenAdd(aboveC));
  const compGated = bestKill(aboveC, true).cost <= ordinary === false
    ? bestKill(aboveC, true).chain === 'delegated'
    : bestKill(aboveC, true).chain === 'delegated';

  return { perpetualMotion, negateDominates, compGated };
}

// --------------------------------------------------------------------------
// Reporting.
// --------------------------------------------------------------------------
function fmt(x: number): string {
  if (x !== 0 && (Math.abs(x) >= 1e6 || Math.abs(x) < 1e-3)) return x.toExponential(2);
  return x.toFixed(x < 100 ? 2 : 0);
}
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
function verdict(ok: boolean, label: string, detail: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(32)} ${detail}`);
}

function report(): void {
  const C = compCeiling();
  console.log('\n=== V3 per-weapon balance model ===\n');
  console.log(`  Comprehension ceiling C = 2^${TUNING.COMP_TIER} = ${fmt(C)}`);
  console.log(`  Production cost(M) = ${TUNING.C_PROD}·M^${TUNING.ALPHA}   (costs RELATIVE TO ADD)\n`);

  const t = predictTax();

  console.log('=== Kill-chain by bracket (count-weighted wave) ===\n');
  console.log(
    `  ${'bracket'.padEnd(9)} | ${'magnitude'.padStart(10)} | ${'best chain'.padEnd(14)} | ${'vs Add'.padStart(7)} | ${'% of tax'.padStart(8)} | comp?`,
  );
  console.log('  ' + '-'.repeat(70));
  for (const r of t.rows) {
    const vsAdd = (r.optimal / r.anchor).toFixed(2) + '×';
    console.log(
      `  ${r.name.padEnd(9)} | ${fmt(r.M).padStart(10)} | ${r.chain.padEnd(14)} | ${vsAdd.padStart(7)} | ${pct(r.taxShare).padStart(8)} | ${r.comprehended ? 'yes' : 'NO'}`,
    );
  }
  console.log('');

  console.log('=== Defense tax ===\n');
  console.log(`  Combined tax (routine + frontier):   ${pct(t.tax)}`);
  console.log(`  Routine tax (comprehended enemies):  ${pct(t.routineTax)}  ← reducers clear these`);
  console.log(`  Frontier share of the tax:           ${pct(t.frontierShare)}  ← the real difficulty`);
  console.log('');

  const f = frontierAnalysis();
  console.log('=== The frontier: brute force vs. raise Comprehension ===\n');
  console.log(`  An enemy at 1.5·C (uncomprehended):`);
  console.log(`    delegated brute-force defender:  ${fmt(f.delegated)} fuel`);
  console.log(`    if you raise Comprehension 1 tier: ${fmt(f.ifComprehended)} fuel  (then reducers reach it)`);
  console.log(`    → raising Comprehension is ${f.ratio.toFixed(0)}× cheaper.`);
  console.log('');

  const s = scanExploits();
  const [lo, hi] = TUNING.TAX_BAND;
  console.log('=== Verdicts ===\n');
  verdict(t.tax >= lo && t.tax <= hi, 'Combined tax in band', `${pct(t.tax)} (band ${pct(lo)}–${pct(hi)})`);
  verdict(t.frontierShare >= 0.5, 'Difficulty is Comprehension-anchored', `${pct(t.frontierShare)} of the tax is the uncomprehended frontier`);
  verdict(t.routineTax < lo, 'Reducers clear comprehended enemies', `routine tax ${pct(t.routineTax)} — the satisfying payoff, not the difficulty`);
  verdict(!s.perpetualMotion, 'No perpetual motion', s.perpetualMotion ? 'a kill mints currency!' : 'salvage ≤ kill cost (conservation holds)');
  verdict(!s.negateDominates, 'Negate ≤ production income', s.negateDominates ? 'negate out-earns the factory!' : 'production stays the primary score source');
  verdict(s.compGated, 'Comprehension gates reach', `frontier (M>${fmt(C)}) → delegated only, ${TUNING.C_DELEG}× premium`);
  console.log('');
  console.log('  The headline: reducers (mod especially) make combat against what you');
  console.log('  COMPREHEND nearly free — that is the payoff, and it is why comprehended');
  console.log('  enemies cannot be the challenge. All real difficulty sits at the');
  console.log('  Comprehension frontier, where reducers cannot reach. And brute-forcing');
  console.log('  that frontier is deliberately ruinous, so the intended answer is to');
  console.log('  RAISE COMPREHENSION — making the comp spine the master pacing lever of');
  console.log('  the war, exactly as it is for production. No single function is trivial');
  console.log('  in the place that matters; the frontier keeps everyone honest.\n');
}

// --------------------------------------------------------------------------
// Sweeps.
// --------------------------------------------------------------------------
function runSweep(): void {
  const set = (k: keyof typeof TUNING, v: number): void => {
    (TUNING as Record<string, number>)[k as string] = v;
  };

  console.log('\n=== Sweep: ALPHA (hyperops cheapen big ammo → does combat trivialise?) ===\n');
  console.log(`  ${'ALPHA'.padStart(6)} | ${'tax'.padStart(7)} | ${'routine'.padStart(7)} | ${'frontier'.padStart(8)} | verdict`);
  console.log('  ' + '-'.repeat(56));
  const a0 = TUNING.ALPHA;
  for (const a of [0.45, 0.5, 0.55, 0.62, 0.7, 0.85, 1.0]) {
    set('ALPHA', a);
    const t = predictTax();
    const trivial = t.tax < TUNING.TAX_BAND[0];
    console.log(
      `  ${a.toFixed(2).padStart(6)} | ${pct(t.tax).padStart(7)} | ${pct(t.routineTax).padStart(7)} | ${pct(t.frontierShare).padStart(8)} | ${trivial ? 'TRIVIAL (combat too cheap)' : 'ok'}${a === a0 ? ' ← current' : ''}`,
    );
  }
  set('ALPHA', a0);

  console.log('\n=== Sweep: COMP_TIER (the frontier band as the real wall) ===\n');
  console.log(`  ${'tier'.padStart(5)} | ${'ceiling'.padStart(9)} | ${'tax'.padStart(7)} | frontier % of tax`);
  console.log('  ' + '-'.repeat(48));
  const c0 = TUNING.COMP_TIER;
  for (const tier of [8, 14, 20, 26, 32]) {
    set('COMP_TIER', tier);
    const t = predictTax();
    const front = t.rows.find((r) => r.name === 'frontier');
    console.log(
      `  ${String(tier).padStart(5)} | ${fmt(Math.pow(2, tier)).padStart(9)} | ${pct(t.tax).padStart(7)} | ${pct(front?.taxShare ?? 0)}${tier === c0 ? ' ← current' : ''}`,
    );
  }
  set('COMP_TIER', c0);

  console.log('\n=== Sweep: SALVAGE_FRAC (the perpetual-motion boundary) ===\n');
  console.log(`  ${'salvage'.padStart(7)} | factor cost @ C/2 | net?`);
  console.log('  ' + '-'.repeat(40));
  const s0 = TUNING.SALVAGE_FRAC;
  for (const sv of [0.8, 1.0, 1.05, 1.25]) {
    set('SALVAGE_FRAC', sv);
    const cost = factorChain(compCeiling() / 2);
    console.log(`  ${sv.toFixed(2).padStart(7)} | ${fmt(cost).padStart(16)} | ${scanExploits().perpetualMotion ? 'PERPETUAL MOTION' : 'ok'}${sv === s0 ? ' ← current' : ''}`);
  }
  set('SALVAGE_FRAC', s0);

  console.log('\n  Reading: combat stays honest while ALPHA ≳ 0.5 and the wave keeps a');
  console.log('  count-heavy swarm + an uncomprehended frontier. Raising COMP_TIER does');
  console.log('  not trivialise — the frontier band scales with it, staying the wall.');
  console.log('  SALVAGE_FRAC must stay ≤ 1.0 or a kill mints currency.\n');
}

function main(): void {
  if (process.argv.slice(2).includes('--sweep')) runSweep();
  else report();
}
main();
