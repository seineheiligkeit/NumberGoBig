// sim/time-run.ts
//
// Observation/tuning instrument for the converged Time-as-Labor economy.
// Reports the *shape* the current DEFAULT_TUNING produces so we tune by
// reading. Sections:
//   1. Operation labor + fuel grade, per operator, across output sizes.
//   2. Transit freeze — how value^p makes big blocks immovable.
//   3. Driven bootstrap — a greedy auto-player (grade-aware fuelling).
//
// Usage: node sim/time-run.ts [--ticks 6000] [--successors 4]

import {
  createWorld,
  placeCell,
  feedOperand,
  injectFuel,
  tick,
  totalScore,
  poolSize,
  getCell,
  type World,
  type CellKind,
} from '../core/engine.ts';
import { valueOf, valueMagnitude, type Value } from '../core/value.ts';
import {
  DEFAULT_TUNING,
  buildWork,
  operationWork,
  minFuelDenomination,
  transitWork,
  ticksToComplete,
} from '../core/time.ts';
import Decimal from 'break_eternity.js';

const T = DEFAULT_TUNING;

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  if (x !== 0 && (Math.abs(x) >= 1e6 || Math.abs(x) < 0.01)) return x.toExponential(1);
  return x.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
function secs(ticks: number): string {
  if (!Number.isFinite(ticks)) return '∞';
  if (ticks < 90) return `${ticks.toFixed(0)}s`;
  if (ticks < 5400) return `${(ticks / 60).toFixed(1)}m`;
  if (ticks < 1.3e5) return `${(ticks / 3600).toFixed(1)}h`;
  return `${(ticks / 3.15e7).toExponential(1)}yr`;
}
const real = (s: string): Value => ({ kind: 'real', n: new Decimal(s) });

function laborTable(): void {
  const ops: CellKind[] = ['addition', 'multiplication', 'exponentiation'];
  console.log('Operation labor (ticks) & fuel grade, per operator × output size:');
  console.log('  output |   add (grade) |   mul (grade) |   exp (grade)');
  console.log('  -------+---------------+---------------+--------------');
  for (const k of [2, 4, 6, 9, 12]) {
    const out = real(`1e${k}`);
    const cells = ops.map((op) => {
      const w = operationWork(out, op);
      const g = minFuelDenomination(w);
      return `${secs(ticksToComplete(w, T.baseRate)).padStart(6)} (${fmt(g.toNumber())})`;
    });
    console.log(`  10^${String(k).padEnd(2)} | ${cells.map((c) => c.padStart(13)).join(' | ')}`);
  }
  console.log('  (grade = min fuel denomination the op accepts; base-rate ticks shown)');
  console.log('');
}

function transitTable(): void {
  console.log('Transit freeze (adjacent pipe, no accelerator):');
  console.log('  block |  transit  ');
  console.log('  ------+-----------');
  for (const k of [0, 1, 2, 3, 4, 6]) {
    const v: Value = k === 0 ? valueOf(1) : real(`1e${k}`);
    const tw = transitWork(v, 0);
    const label = k === 0 ? '1' : `10^${k}`;
    console.log(`  ${label.padStart(5)} | ${secs(ticksToComplete(tw, T.baseRate)).padStart(8)}`);
  }
  console.log('  (small blocks flow; big blocks are frozen → must be milled to move)');
  console.log('');
}

function takeLargest(world: World): Value | null {
  if (!world.pool.length) return null;
  let b = 0;
  for (let i = 1; i < world.pool.length; i++)
    if (valueMagnitude(world.pool[i].value).gt(valueMagnitude(world.pool[b].value))) b = i;
  return world.pool.splice(b, 1)[0].value;
}
/** Take the smallest pool block whose value ≥ floor (grade-aware fuel pick). */
function takeFuel(world: World, floor: Decimal): Value | null {
  let best = -1;
  for (let i = 0; i < world.pool.length; i++) {
    const m = valueMagnitude(world.pool[i].value);
    if (m.gte(floor) && (best < 0 || m.lt(valueMagnitude(world.pool[best].value)))) best = i;
  }
  return best < 0 ? null : world.pool.splice(best, 1)[0].value;
}

function drive(world: World): void {
  for (const cell of world.cells.values()) {
    if (!cell.built || cell.kind === 'successor') continue;
    if (cell.op === null) {
      for (let p = 0; p < cell.operands.length; p++) {
        if (cell.operands[p] === null) {
          const v = takeLargest(world);
          if (v) feedOperand(world, cell.id, p, v);
        }
      }
    } else if (world.pool.length > 2) {
      const f = takeFuel(world, cell.op.grade);
      if (f) injectFuel(world, cell.id, f);
    }
  }
}

function bootstrap(ticks: number, successors: number): void {
  const world = createWorld(T);
  for (let i = 0; i < successors; i++) placeCell(world, 'successor', 0, i * 40);
  placeCell(world, 'addition', 300, 0);
  placeCell(world, 'multiplication', 600, 0);
  placeCell(world, 'exponentiation', 900, 0);
  console.log(`Driven bootstrap (${successors} successors + add/mul/exp, ${ticks} ticks):`);
  const thresholds = [10, 100, 1e3, 1e6, 1e9, 1e12];
  let nt = 0;
  for (let t = 1; t <= ticks; t++) {
    drive(world);
    tick(world, 1);
    const s = totalScore(world);
    while (nt < thresholds.length && s.gte(thresholds[nt])) {
      console.log(`  score ≥ ${fmt(thresholds[nt]).padStart(8)} at ${secs(t).padStart(6)} (tick ${t})`);
      nt++;
    }
  }
  console.log(`  final score ${fmt(totalScore(world).toNumber())} · loose blocks ${poolSize(world)}`);
  console.log('');
}

function main() {
  let ticks = 6000;
  let successors = 4;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--successors') successors = Number(a[++i]);
  }
  console.log('Time-as-Labor — converged-model tuning report');
  console.log(
    `baseRate=${T.baseRate}  opExp=${JSON.stringify(T.opExponent)}  ` +
      `transit=${T.transitCoeff}·v^${T.transitExp}  grade=${T.gradeCoeff}·W^${T.gradeExp}`,
  );
  console.log(`first build ≈ ${secs(ticksToComplete(buildWork(0), T.baseRate))}\n`);
  laborTable();
  transitTable();
  bootstrap(ticks, successors);
}

main();
