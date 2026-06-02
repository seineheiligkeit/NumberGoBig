// ===========================================================================
// V3 — Throughput model (standalone).
//
// The architecture from the design discussion, made numeric. Two layers:
//
//   LAYER 1 — Attrition (the army): numbers clashing with numbers. The
//   factory delivers positive blocks to the front; incoming negatives
//   annihilate them 1:1 by magnitude (collision = the Add anchor applied as
//   continuous attrition). This is the PRIMARY, ever-scaling defense and it
//   is pure throughput: produced magnitude/sec vs incoming threat/sec.
//
//   LAYER 2 — Functions (the artillery): mod / divide / factor / negate as
//   rate-limited emplacements. Each processes ONE target per cooldown
//   (cooldown ∝ ⌈log₁₀ M⌉ — Law 3 as TIME, not money), costs fuel per shot,
//   and is Comprehension-gated. Scarce throughput ⇒ you spend it on the
//   highest-leverage targets (the rare, expensive elites/bosses); the
//   count-heavy swarm is too voluminous to function, so the army must carry
//   it. Functions can never trivialize the bulk — that is the whole point.
//
// The question this answers: with functions THROUGHPUT-CAPPED (not cost-
// capped), do they stay "strategic spice" — a meaningful minority of the
// defense — while the army-vs-army clash remains the dominant sink? And the
// sweep finds the throughput ceiling beyond which functions start eating the
// swarm and the clash-core vanishes.
//
// Frontier-invariant by construction: production fuel rate R scales with
// prodCost(C), and every army cost scales with prodCost(C), so the attrition
// tax is independent of the comp tier — the comp spine is the wall at every
// scale. (Verified by the COMP_TIER sweep.)
//
// Run:  node sim/throughput.ts
//       node sim/throughput.ts --sweep
// ===========================================================================

const TUNING = {
  // Production. cost(M) = C_PROD·M^ALPHA (ALPHA<1 = hyperoperator era).
  C_PROD: 1,
  ALPHA: 0.62,

  // Comprehension ceiling C = 2^COMP_TIER. Production blocks cap at C; an
  // enemy above C must be CHIPPED with ⌈M/C⌉ max-comprehensible blocks (the
  // frontier wall), and functions cannot touch it at all.
  COMP_TIER: 20,

  // Production-to-front fuel rate, as a multiple of prodCost(C). Sets the
  // size of the army; chosen so the army-only attrition tax ≈ 30%.
  R_COEF: 0.31,

  // Functions (the artillery).
  N_BATTERIES: 2, // total emplacements (the throughput cap)
  BASE_COOLDOWN: 2.5, // seconds of cooldown per log₁₀ of the target's magnitude
  MOD_N: 12, // mod-battery residue ≈ MOD_N/2
  C_FUNC: 1, // fuel per shot = C_FUNC · ⌈log₁₀ M⌉

  // Verdict bands.
  TAX_BAND: [0.1, 0.35] as const,
  SPICE_LEVERAGE_MAX: 0.45, // functions above this share are "dominant", not spice
  SWARM_FUNCTION_MAX: 0.05, // functions may process at most this share of swarm count
} as const;

// The wave: magnitude relative to C, arrival in enemies/sec. Count-heavy at
// the bottom (the swarm the army must carry), rare expensive tail, and a rare
// uncomprehended frontier enemy.
interface Bracket {
  name: string;
  magOfC: number;
  rate: number; // enemies / sec
}
const BRACKETS: readonly Bracket[] = [
  { name: 'swarm',    magOfC: 0.000004, rate: 40 },   // ~4
  { name: 'rabble',   magOfC: 0.0001,   rate: 6 },    // ~100
  { name: 'elite',    magOfC: 0.01,     rate: 0.4 },  // ~10k
  { name: 'boss',     magOfC: 0.5,      rate: 0.03 }, // ~500k
  { name: 'frontier', magOfC: 3.0,      rate: 0.004 },// ~3M, UNCOMPREHENDED
];

// --------------------------------------------------------------------------
// Costs.
// --------------------------------------------------------------------------
const ceilLog10 = (x: number): number => Math.max(1, Math.ceil(Math.log10(Math.max(10, x))));
const compCeiling = (): number => Math.pow(2, TUNING.COMP_TIER);
const prodCost = (M: number): number => TUNING.C_PROD * Math.pow(Math.max(1, M), TUNING.ALPHA);
const productionRate = (): number => TUNING.R_COEF * prodCost(compCeiling());

/** Army fuel to annihilate one enemy of magnitude M by collision. Within
 *  comprehension: one +M block. Above it: chip with ⌈M/C⌉ max-comp blocks. */
function armyCost(M: number): number {
  const C = compCeiling();
  if (M <= C) return prodCost(M);
  return Math.ceil(M / C) * prodCost(C);
}

/** Fuel a function spends per shot on a magnitude-M target. */
const funcShotCost = (M: number): number => TUNING.C_FUNC * ceilLog10(M);
/** Seconds one battery is busy processing a magnitude-M target. */
const funcCooldown = (M: number): number => TUNING.BASE_COOLDOWN * ceilLog10(M);

/** Net army-fuel SAVED by mod-processing one magnitude-M enemy (residue
 *  ≈ MOD_N/2): the army now annihilates the residue, not M, minus the shot. */
function functionSaving(M: number): number {
  const residue = TUNING.MOD_N / 2;
  return armyCost(M) - armyCost(residue) - funcShotCost(M);
}

// --------------------------------------------------------------------------
// Model: allocate scarce function throughput to highest-leverage targets,
// army handles the rest.
// --------------------------------------------------------------------------
interface Row {
  name: string;
  M: number;
  rate: number;
  comprehended: boolean;
  processedShare: number; // fraction of this bracket handled by functions
  armyFuel: number; // fuel/sec the army spends on this bracket (post-functions)
  handler: string;
}
interface Result {
  rows: Row[];
  armyOnlyFuel: number;
  netFuel: number;
  funcSaved: number;
  armyOnlyTax: number;
  netTax: number;
  leverage: number;
  swarmFunctionShare: number;
  armyCountShare: number; // share of enemy COUNT the army fights
  armyMagnitudeShare: number; // share of incoming MAGNITUDE the army annihilates
  armyFuelShare: number; // share of defense FUEL spent by the army (vs function shots)
}

function run(): Result {
  const C = compCeiling();
  const R = productionRate();

  // Army-only baseline.
  const armyOnlyFuel = BRACKETS.reduce((s, b) => s + b.rate * armyCost(b.magOfC * C), 0);

  // Greedy function allocation by leverage density (saving per battery-second).
  let capacity = TUNING.N_BATTERIES; // battery-seconds available per second
  const processed = new Map<string, number>(); // name -> processed enemies/sec
  const eligible = BRACKETS
    .map((b) => ({ b, M: b.magOfC * C }))
    .filter((x) => x.M <= C && functionSaving(x.M) > 0)
    .map((x) => ({ ...x, density: functionSaving(x.M) / funcCooldown(x.M) }))
    .sort((a, b) => b.density - a.density);

  let funcSaved = 0;
  for (const e of eligible) {
    if (capacity <= 0) break;
    const cd = funcCooldown(e.M);
    const need = e.b.rate * cd; // battery-seconds/sec to process all of this bracket
    const use = Math.min(need, capacity);
    const procRate = use / cd; // enemies/sec actually processed
    funcSaved += procRate * functionSaving(e.M);
    processed.set(e.b.name, procRate);
    capacity -= use;
  }

  // Per-bracket rows + army fuel after functions.
  const rows: Row[] = BRACKETS.map((b) => {
    const M = b.magOfC * C;
    const proc = processed.get(b.name) ?? 0;
    const share = proc / b.rate;
    const armyHandled = b.rate - proc;
    const residueArmy = proc * armyCost(TUNING.MOD_N / 2); // army still finishes residues
    const armyFuel = armyHandled * armyCost(M) + residueArmy;
    const handler = M > C ? 'army (chip)' : share > 0.5 ? 'function+army' : share > 0 ? 'army (some fn)' : 'army';
    return { name: b.name, M, rate: b.rate, comprehended: M <= C, processedShare: share, armyFuel, handler };
  });

  const netFuel = armyOnlyFuel - funcSaved;
  const totalMag = BRACKETS.reduce((s, b) => s + b.rate * b.magOfC * C, 0);
  const totalCount = BRACKETS.reduce((s, b) => s + b.rate, 0);
  let funcMag = 0;
  let funcCount = 0;
  let funcShotFuel = 0;
  for (const [name, pr] of processed.entries()) {
    const b = BRACKETS.find((x) => x.name === name)!;
    funcMag += pr * (b.magOfC * C - TUNING.MOD_N / 2);
    funcCount += pr;
    funcShotFuel += pr * funcShotCost(b.magOfC * C);
  }
  const armyFuel = netFuel - funcShotFuel;

  return {
    rows,
    armyOnlyFuel,
    netFuel,
    funcSaved,
    armyOnlyTax: armyOnlyFuel / R,
    netTax: netFuel / R,
    leverage: funcSaved / armyOnlyFuel,
    swarmFunctionShare: (processed.get('swarm') ?? 0) / 40,
    armyCountShare: (totalCount - funcCount) / totalCount,
    armyMagnitudeShare: (totalMag - funcMag) / totalMag,
    armyFuelShare: armyFuel / netFuel,
  };
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
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(34)} ${detail}`);
}

function report(): void {
  const C = compCeiling();
  const r = run();
  console.log('\n=== V3 throughput model — army (clash) + artillery (functions) ===\n');
  console.log(`  Comprehension ceiling C = 2^${TUNING.COMP_TIER} = ${fmt(C)}`);
  console.log(`  Production-to-front: ${fmt(productionRate())} fuel/sec   Batteries: ${TUNING.N_BATTERIES}\n`);

  console.log('=== Wave: who does the fighting ===\n');
  console.log(`  ${'bracket'.padEnd(9)} | ${'magnitude'.padStart(10)} | ${'rate/s'.padStart(7)} | ${'fn-handled'.padStart(10)} | ${'army fuel/s'.padStart(11)} | handler`);
  console.log('  ' + '-'.repeat(78));
  for (const row of r.rows) {
    console.log(
      `  ${row.name.padEnd(9)} | ${fmt(row.M).padStart(10)} | ${fmt(row.rate).padStart(7)} | ${pct(row.processedShare).padStart(10)} | ${fmt(row.armyFuel).padStart(11)} | ${row.handler}`,
    );
  }
  console.log('');

  console.log('=== Defense economy ===\n');
  console.log(`  Army-only attrition tax:     ${pct(r.armyOnlyTax)}   (the clash, no functions)`);
  console.log(`  Function leverage:           ${pct(r.leverage)}   (army fuel the artillery saves)`);
  console.log(`  Net defense tax:             ${pct(r.netTax)}   (with the artillery)`);
  console.log(`  Army fights:                 ${pct(r.armyCountShare)} of enemy COUNT, spends ${pct(r.armyFuelShare)} of defense FUEL`);
  console.log(`  Functions neutralise:        ${pct(1 - r.armyMagnitudeShare)} of incoming MAGNITUDE (the rare giants)`);
  console.log(`  Functions process the swarm: ${pct(r.swarmFunctionShare)} of its count\n`);

  const [lo, hi] = TUNING.TAX_BAND;
  console.log('=== Verdicts ===\n');
  verdict(r.netTax >= lo && r.netTax <= hi, 'Net defense tax in band', `${pct(r.netTax)} (band ${pct(lo)}–${pct(hi)})`);
  verdict(r.armyCountShare >= 0.5, 'The clash is the primary defense', `army fights ${pct(r.armyCountShare)} of enemies, ${pct(r.armyFuelShare)} of fuel`);
  verdict(r.leverage <= TUNING.SPICE_LEVERAGE_MAX, 'Functions are spice, not the answer', `leverage ${pct(r.leverage)} (cap ${pct(TUNING.SPICE_LEVERAGE_MAX)})`);
  verdict(r.swarmFunctionShare <= TUNING.SWARM_FUNCTION_MAX, 'Swarm is army-carried (throughput cap)', `functions touch only ${pct(r.swarmFunctionShare)} of the swarm`);
  verdict(true, 'Frontier is the comp wall', `M>${fmt(C)} chipped by ⌈M/C⌉ max blocks; functions can't reach it`);
  console.log('');
  console.log('  Reading: the army (numbers clashing with numbers) annihilates the');
  console.log('  great bulk and scales forever with the factory — that is the core. The');
  console.log('  artillery is throughput-capped, so it can only pick off the rare,');
  console.log('  expensive tail (bosses/elites) where its scarce shots have the most');
  console.log('  leverage; it physically cannot be turned on the swarm. Functions are a');
  console.log('  worthwhile strategic investment (they cut the tax meaningfully) without');
  console.log('  ever replacing the clash. Comprehension still walls the frontier.\n');
}

// --------------------------------------------------------------------------
// Sweeps.
// --------------------------------------------------------------------------
function runSweep(): void {
  const set = (k: keyof typeof TUNING, v: number): void => {
    (TUNING as Record<string, number>)[k as string] = v;
  };

  console.log('\n=== Sweep: N_BATTERIES (when does the artillery eat the army?) ===\n');
  console.log(`  ${'batteries'.padStart(9)} | ${'net tax'.padStart(7)} | ${'leverage'.padStart(8)} | ${'army mag%'.padStart(9)} | ${'swarm fn%'.padStart(9)} | verdict`);
  console.log('  ' + '-'.repeat(72));
  const n0 = TUNING.N_BATTERIES;
  for (const n of [1, 2, 4, 8, 20, 60, 200]) {
    set('N_BATTERIES', n);
    const r = run();
    const dominant = r.leverage > TUNING.SPICE_LEVERAGE_MAX;
    const eatsSwarm = r.swarmFunctionShare > TUNING.SWARM_FUNCTION_MAX;
    const v = eatsSwarm ? 'FUNCTIONS EAT THE SWARM (clash gone)' : dominant ? 'functions dominant' : 'spice ✓';
    console.log(
      `  ${String(n).padStart(9)} | ${pct(r.netTax).padStart(7)} | ${pct(r.leverage).padStart(8)} | ${pct(r.armyMagnitudeShare).padStart(9)} | ${pct(r.swarmFunctionShare).padStart(9)} | ${v}${n === n0 ? ' ← current' : ''}`,
    );
  }
  set('N_BATTERIES', n0);

  console.log('\n  Reading: leverage RISES with batteries but ASYMPTOTES (~60% here) and');
  console.log('  the swarm stays at 0% even at 200 batteries — because modding a tiny');
  console.log('  number is pointless (residue ≥ the enemy) and the frontier is comp-');
  console.log('  gated. So no amount of function-spam can take the swarm or the frontier:');
  console.log('  the army PERMANENTLY owns the count and ~40% of the magnitude. The');
  console.log('  clash-core cannot be bought out. Keep the default battery supply low');
  console.log('  (gating/cost) and functions sit in the "spice" band.\n');

  console.log('=== Sweep: COMP_TIER (attrition tax is frontier-invariant) ===\n');
  console.log(`  ${'tier'.padStart(5)} | ${'ceiling'.padStart(9)} | ${'army tax'.padStart(8)} | ${'net tax'.padStart(7)} | ${'leverage'.padStart(8)}`);
  console.log('  ' + '-'.repeat(52));
  const c0 = TUNING.COMP_TIER;
  for (const tier of [16, 20, 24, 28, 32]) {
    set('COMP_TIER', tier);
    const r = run();
    console.log(
      `  ${String(tier).padStart(5)} | ${fmt(Math.pow(2, tier)).padStart(9)} | ${pct(r.armyOnlyTax).padStart(8)} | ${pct(r.netTax).padStart(7)} | ${pct(r.leverage).padStart(8)}${tier === c0 ? ' ← current' : ''}`,
    );
  }
  set('COMP_TIER', c0);

  console.log('\n  Reading: army tax is flat across the calibrated range (tier 16+) — the');
  console.log('  clash scales with the factory at every frontier, exactly the comp-spine');
  console.log('  design. (Below ~tier 14 the fixed wave is relatively harsher, matching');
  console.log('  the game\'s tougher early defense.) Function leverage drifts DOWN at high');
  console.log('  tiers: bigger targets cooldown longer (∝ logM), so the artillery thins');
  console.log('  and the army matters even more at scale.\n');
}

function main(): void {
  if (process.argv.slice(2).includes('--sweep')) runSweep();
  else report();
}
main();
