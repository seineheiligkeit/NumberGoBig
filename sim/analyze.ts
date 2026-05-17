// sim/analyze.ts
//
// Deeper analysis of the simulator's behaviour. Walks the sim
// tick-by-tick and reports — beyond the basic unlock-pacing table —
// per-value consumption / production rates, bottleneck distribution
// over time, and pool snapshots at each unlock event.
//
// Run:
//   node sim/analyze.ts                  # full default roadmap, console output
//   node sim/analyze.ts --to multiplication --max-ticks 5000
//   node sim/analyze.ts --csv-cons consumption.csv
//
// Why this exists: the focus-time metric (% ticks per focus value)
// only surfaces what the agent grinds toward — it misses values that
// are continuously CONSUMED but never explicitly stockpiled (zeros
// pulled through ladders being the canonical example). Consumption
// rate captures that demand directly.

import { writeFileSync } from 'node:fs';
import {
  newWorld,
  newAgent,
  decide,
  purchase,
  purchaseLevel,
  tickProduction,
  isPredicateFocus,
  poolAtCap,
  steadyStateRate,
  predicateProductionRate,
  predicateStock,
  bottleneckResource,
  cellThroughput,
  type WorldState,
  type ProductionFocus,
} from './simulator.ts';
import {
  LITERATURE_BY_ID,
  RECIPE_BY_VALUE,
  ladderFor,
  type CellType,
  type PredicateId,
} from './catalog.ts';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  to: string | null;
  maxTicks: number;
  csvCons: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { to: null, maxTicks: 500_000, csvCons: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--to') result.to = args[++i] ?? null;
    else if (a === '--max-ticks') result.maxTicks = Number(args[++i] ?? result.maxTicks);
    else if (a === '--csv-cons') result.csvCons = args[++i] ?? null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Roadmap (matches sim/run.ts default — keep in sync)
// ---------------------------------------------------------------------------

const FULL_ROADMAP = [
  'successor', 'pipe_0', 'addition', 'comp_2', 'subtraction', 'comp_3',
  'multiplication', 'comp_4', 'pipe_2', 'division', 'negation', 'comp_5',
  'pipe_3', 'comp_6', 'pipe_4', 'comp_7', 'exponentiation', 'pipe_5',
  'inversion', 'square-root', 'comp_8', 'pipe_6', 'comp_9', 'pipe_7',
  'comp_10', 'pipe_8', 'tetration', 'comp_11', 'pipe_9', 'comp_14',
  'comp_17', 'comp_20', 'pentation',
];

// ---------------------------------------------------------------------------
// Per-output consumption — walks recipe DAG counting per-value blocks
// consumed to produce 1 unit of target.
// ---------------------------------------------------------------------------

function consumptionPerOutput(
  world: WorldState,
  target: number,
): Map<number, number> {
  const cons = new Map<number, number>();
  const add = (v: number, n: number) =>
    cons.set(v, (cons.get(v) ?? 0) + n);

  function visit(v: number, multiplier: number) {
    if (v === 0) return; // zero is the leaf; caller already added it
    const r = RECIPE_BY_VALUE.get(v);
    if (!r) return; // literal value; caller already added it

    // Recipe inputs (operand consumption) + cascading upstream draws.
    for (const inp of r.inputs) {
      add(inp, multiplier);
      visit(inp, multiplier);
    }
    // Ladder fuel (per-firing) + cascading upstream draws.
    const ladder = ladderFor(r.cell, r.maxInput);
    for (const [fuelValue, fuelCount] of ladder) {
      add(fuelValue, multiplier * fuelCount);
      visit(fuelValue, multiplier * fuelCount);
    }
  }

  visit(target, 1);
  return cons;
}

/** Per-firing ladder consumption for a cell (mag=1 baseline). */
function ladderConsumption(cellType: CellType): Map<number, number> {
  return ladderFor(cellType, 1);
}

/** Map predicate → producer cell type (mirrors simulator.ts:pursuePredicateProducer). */
const PREDICATE_PRODUCERS: Record<PredicateId, CellType> = {
  negative: 'subtraction',
  irrational: 'square-root',
  prime: 'factor',
};

// ---------------------------------------------------------------------------
// Walker state
// ---------------------------------------------------------------------------

interface UnlockSnapshot {
  unlock: string;
  tick: number;
  pool: Map<number, number>;
  predicateStocks: Map<PredicateId, number>;
}

const args = parseArgs();
let roadmap = FULL_ROADMAP;
if (args.to) {
  const idx = roadmap.indexOf(args.to);
  if (idx === -1) {
    console.error(`Unknown roadmap entry: ${args.to}`);
    process.exit(1);
  }
  roadmap = roadmap.slice(0, idx + 1);
}

const world = newWorld();
const agent = newAgent(roadmap);

const focusTime = new Map<string, number>();
const bottleneckTime = new Map<string, number>();
const consumptionTotal = new Map<number, number>();
const productionTotal = new Map<number, number>();
const predicateConsumption = new Map<PredicateId, number>();
const unlocks: UnlockSnapshot[] = [];

let lastPurchaseTick = 0;
let stalled = false;

function recordTick(focus: ProductionFocus): void {
  const focusLabel = isPredicateFocus(focus)
    ? `predicate:${focus.predicate}`
    : `value:${focus}`;
  focusTime.set(focusLabel, (focusTime.get(focusLabel) ?? 0) + 1);

  if (isPredicateFocus(focus)) {
    const producer = PREDICATE_PRODUCERS[focus.predicate];
    const rate = predicateProductionRate(world, focus.predicate);
    if (rate > 0) {
      productionTotal.set(
        // Predicates don't have a single "value" — store under negative key for clarity.
        // (Track under "predicate:X" separately to avoid clashing with numeric pool entries.)
        Number.NaN,
        0, // no-op; predicates tracked in predicateConsumption + below
      );
      predicateConsumption.set(
        focus.predicate,
        (predicateConsumption.get(focus.predicate) ?? 0) + rate,
      );
      // Producer's ladder is consumed per firing of producer.
      const ladder = ladderConsumption(producer);
      for (const [v, c] of ladder) {
        consumptionTotal.set(v, (consumptionTotal.get(v) ?? 0) + rate * c);
      }
    }
    bottleneckTime.set(
      `producer:${producer}`,
      (bottleneckTime.get(`producer:${producer}`) ?? 0) + 1,
    );
    return;
  }

  const rate = steadyStateRate(world, focus);
  if (rate > 0) {
    productionTotal.set(focus, (productionTotal.get(focus) ?? 0) + rate);
    const cons = consumptionPerOutput(world, focus);
    for (const [v, c] of cons) {
      consumptionTotal.set(v, (consumptionTotal.get(v) ?? 0) + rate * c);
    }
  }

  const bn = bottleneckResource(world, focus);
  const bnLabel = bn ?? 'none';
  bottleneckTime.set(bnLabel, (bottleneckTime.get(bnLabel) ?? 0) + 1);
}

function snapshotUnlock(id: string): void {
  unlocks.push({
    unlock: id,
    tick: world.tick,
    pool: new Map(world.pool),
    predicateStocks: new Map(world.predicateStocks),
  });
}

// ---------------------------------------------------------------------------
// Run the sim
// ---------------------------------------------------------------------------

while (world.tick < args.maxTicks && !stalled) {
  const d = decide(world, agent);
  if (d.done) break;

  if (d.buy) {
    const isGoal = agent.roadmap[agent.goalIndex] === d.buy;
    const ok = purchase(world, d.buy);
    if (ok) {
      // Snapshot EVERY purchase, even non-roadmap auto-buys (comp
      // upgrades, warehouses), so the unlock report shows the full
      // chronological story.
      if (!unlocks.find((u) => u.unlock === d.buy)) {
        snapshotUnlock(d.buy);
      }
      if (isGoal) agent.goalIndex += 1;
      lastPurchaseTick = world.tick;
      continue;
    }
    tickProduction(world, 0);
    continue;
  }
  if (d.buyLevel) {
    const ok = purchaseLevel(world, d.buyLevel);
    if (ok) {
      lastPurchaseTick = world.tick;
      continue;
    }
    tickProduction(world, 0);
    continue;
  }
  if (d.tickFocus !== undefined) {
    const focus = d.tickFocus;
    if (!isPredicateFocus(focus) && poolAtCap(world, focus)) {
      const whId = `warehouse_${focus}`;
      const ok = purchase(world, whId);
      if (ok) {
        lastPurchaseTick = world.tick;
        continue;
      }
      // Cap-rescue: tick ones to grind toward warehouse cost.
      recordTick(1);
      tickProduction(world, 1);
      if (world.tick - lastPurchaseTick > 50000) { stalled = true; break; }
      continue;
    }
    recordTick(focus);
    tickProduction(world, focus);
    if (world.tick - lastPurchaseTick > 50000) { stalled = true; break; }
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function fmtTicks(n: number): string {
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

function fmt(n: number, places = 1): string {
  if (n === 0) return '0';
  if (n < 1) return n.toFixed(2);
  if (n < 10) return n.toFixed(1);
  if (n < 1000) return Math.round(n).toString();
  if (n < 1e6) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)}M`;
  return `${(n / 1e9).toFixed(1)}B`;
}

const totalTicks = world.tick;

// --- 1. Unlock pacing (chronological — interleaves roadmap goals,
//        auto-bought comp tiers, and warehouses)
console.log('\n=== Unlock pacing (chronological) ===\n');
console.log('  tick    |  time         |  unlock');
console.log('  ' + '-'.repeat(56));
const sortedUnlocks = [...unlocks].sort((a, b) => a.tick - b.tick);
for (const u of sortedUnlocks) {
  const isRoadmap = roadmap.includes(u.unlock);
  const marker = isRoadmap ? '' : '  (auto)';
  console.log(
    `  ${String(u.tick).padStart(6)}  |  ${fmtTicks(u.tick).padEnd(11)}  |  ${u.unlock}${marker}`,
  );
}
for (const id of roadmap) {
  if (!unlocks.find((u) => u.unlock === id)) {
    console.log(`  ------  |  ---          |  ${id} (not reached)`);
  }
}

// --- 2. Focus-time distribution ----------------------------------------
console.log(`\n=== Focus distribution (over ${totalTicks} ticks) ===\n`);
console.log('  Focus                       Ticks   %');
console.log('  ' + '-'.repeat(52));
const sortedFocus = Array.from(focusTime.entries()).sort((a, b) => b[1] - a[1]);
for (const [label, count] of sortedFocus) {
  const pct = ((count / totalTicks) * 100).toFixed(1);
  console.log(`  ${label.padEnd(28)} ${String(count).padStart(6)}  ${pct.padStart(5)}%`);
}

// --- 3. Bottleneck distribution ----------------------------------------
console.log(`\n=== Bottleneck distribution (resource limiting the focus) ===\n`);
console.log('  Bottleneck                  Ticks   %');
console.log('  ' + '-'.repeat(52));
const sortedBn = Array.from(bottleneckTime.entries()).sort((a, b) => b[1] - a[1]);
for (const [label, count] of sortedBn) {
  const pct = ((count / totalTicks) * 100).toFixed(1);
  console.log(`  ${label.padEnd(28)} ${String(count).padStart(6)}  ${pct.padStart(5)}%`);
}

// --- 4. Per-value consumption & production -----------------------------
console.log(`\n=== Per-value flow (consumed vs produced over the run) ===\n`);
const allValues = new Set<number>([
  ...consumptionTotal.keys(),
  ...productionTotal.keys(),
]);
allValues.delete(Number.NaN);
const sortedValues = Array.from(allValues).sort((a, b) => a - b);
console.log(
  '  Value      Consumed   Produced   Consume/sec   Produce/sec   Cons/Prod ratio',
);
console.log('  ' + '-'.repeat(80));
for (const v of sortedValues) {
  const cons = consumptionTotal.get(v) ?? 0;
  const prod = productionTotal.get(v) ?? 0;
  const consRate = cons / totalTicks;
  const prodRate = prod / totalTicks;
  const ratio = prod > 0 ? cons / prod : (cons > 0 ? Infinity : 0);
  const ratioStr = ratio === Infinity ? '∞' : ratio.toFixed(1);
  console.log(
    `  ${String(v).padStart(8)}   ${fmt(cons).padStart(8)}   ${fmt(prod).padStart(8)}    ${fmt(consRate).padStart(8)}      ${fmt(prodRate).padStart(8)}        ${ratioStr.padStart(6)}`,
  );
}

// --- 5. Predicate consumption ------------------------------------------
if (predicateConsumption.size > 0) {
  console.log(`\n=== Predicate production (predicates the agent grew) ===\n`);
  console.log('  Predicate           Total    Per-sec');
  console.log('  ' + '-'.repeat(48));
  for (const [pred, total] of predicateConsumption) {
    const rate = total / totalTicks;
    console.log(`  ${pred.padEnd(20)} ${fmt(total).padStart(6)}    ${fmt(rate).padStart(6)}`);
  }
}

// --- 6. Pool state at each unlock --------------------------------------
console.log(`\n=== Pool state at each unlock ===\n`);
const allPoolValues = new Set<number>();
for (const u of unlocks) for (const v of u.pool.keys()) allPoolValues.add(v);
const sortedPoolValues = Array.from(allPoolValues).sort((a, b) => a - b);
const headers = ['unlock'].concat(sortedPoolValues.map((v) => `[${v}]`));
console.log('  ' + headers.map((h) => h.padStart(8)).join(' '));
for (const u of unlocks) {
  const row = [u.unlock.slice(0, 8)];
  for (const v of sortedPoolValues) {
    const amount = u.pool.get(v) ?? 0;
    row.push(amount > 0 ? fmt(amount) : '-');
  }
  console.log('  ' + row.map((c) => c.padStart(8)).join(' '));
}

// --- 7. Infrastructure built -------------------------------------------
console.log(`\n=== Infrastructure built ===\n`);
const sortedCells = Array.from(world.cells.entries()).sort();
for (const [type, count] of sortedCells) {
  const lvl = world.cellLevels.get(type) ?? 1;
  console.log(`  ${type.padEnd(28)} × ${count}${lvl > 1 ? `  (lvl ${lvl})` : ''}`);
}
const sortedPipes = Array.from(world.pipes.entries()).sort((a, b) => a[0] - b[0]);
for (const [mag, count] of sortedPipes) {
  console.log(`  pipe ≤${String(mag).padEnd(22)} × ${count}`);
}
const sortedWh = Array.from(world.warehouses.entries()).sort((a, b) => a[0] - b[0]);
for (const [val, count] of sortedWh) {
  if (count > 0) console.log(`  warehouse(${val}) × ${count}`);
}
console.log(
  `  comprehension                ${world.comprehension} (= 2^${Math.round(Math.log2(world.comprehension))})`,
);

// --- CSV (optional) ----------------------------------------------------
if (args.csvCons) {
  const lines: string[] = ['value,consumed,produced,consume_per_sec,produce_per_sec'];
  for (const v of sortedValues) {
    const cons = consumptionTotal.get(v) ?? 0;
    const prod = productionTotal.get(v) ?? 0;
    lines.push(
      `${v},${cons.toFixed(2)},${prod.toFixed(2)},${(cons / totalTicks).toFixed(4)},${(prod / totalTicks).toFixed(4)}`,
    );
  }
  writeFileSync(args.csvCons, lines.join('\n') + '\n', 'utf-8');
  console.log(`\n✓ Consumption CSV written to ${args.csvCons}`);
}

if (stalled) {
  console.log('\n⚠  Simulation stalled.');
}
