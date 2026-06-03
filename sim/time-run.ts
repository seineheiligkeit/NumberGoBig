// sim/time-run.ts
//
// Tuning instrument for the Time-as-Labor prototype. The engine
// (core/engine.ts) is the simulation; this reports the *shape* of the economy
// the current DEFAULT_TUNING produces, so we can tune by reading rather than
// guessing. Three sections:
//
//   1. Build ladder   — how long the Nth cell of a kind takes to construct.
//   2. Operation ladder — how long it takes to write an output of magnitude
//      10^k, at base rate vs. with a steady fuel feed (the wait-vs-burn knob).
//   3. Driven bootstrap — a greedy auto-player over a small factory, reporting
//      the score curve and time-to-thresholds (the felt opening).
//
// All durations are model ticks (1 tick = 1 second of play). The view runs a
// few ticks/second so the prototype feels alive; that's presentation only.
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
  type World,
  type CellKind,
} from '../core/engine.ts';
import { valueOf, valueMagnitude, type Value } from '../core/value.ts';
import {
  DEFAULT_TUNING,
  buildWork,
  operationWork,
  ticksToComplete,
} from '../core/time.ts';

const T = DEFAULT_TUNING;

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  if (x >= 1e6 || (x > 0 && x < 0.01)) return x.toExponential(2);
  return x.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function secs(ticks: number): string {
  if (!Number.isFinite(ticks)) return '∞';
  if (ticks < 90) return `${ticks.toFixed(0)}s`;
  if (ticks < 5400) return `${(ticks / 60).toFixed(1)}m`;
  return `${(ticks / 3600).toFixed(1)}h`;
}

function buildLadder(): void {
  console.log('Build ladder (Nth cell of a kind, at baseRate):');
  console.log('  N | build work |   ticks |  ~time');
  console.log('  --+------------+---------+-------');
  for (let n = 0; n < 6; n++) {
    const w = buildWork(n).toNumber();
    const ticks = ticksToComplete(buildWork(n), T.baseRate);
    console.log(`  ${n + 1} | ${fmt(w).padStart(10)} | ${fmt(ticks).padStart(7)} | ${secs(ticks).padStart(6)}`);
  }
  console.log('');
}

function opLadder(): void {
  const feeds = [0, 10, 50];
  console.log('Operation ladder (write an output of magnitude 10^k):');
  console.log('  output | op work |   base | ' + feeds.slice(1).map((f) => `+${f}/t`.padStart(8)).join(' | '));
  console.log('  -------+---------+--------+' + feeds.slice(1).map(() => '---------').join('+'));
  for (const k of [0, 1, 2, 3, 6, 9, 12, 30, 100]) {
    const v: Value = valueOf(Math.pow(10, Math.min(k, 308)));
    // For very large k, build the magnitude via string to dodge Number limits.
    const value: Value = k <= 300 ? v : { kind: 'real', n: valueOf(1).n };
    const w = operationWork(value);
    const cells = feeds.map((f) => secs(ticksToComplete(w, T.baseRate + f)));
    const label = k === 0 ? '1' : `10^${k}`;
    console.log(
      `  ${label.padStart(6)} | ${fmt(w.toNumber()).padStart(7)} | ${cells[0].padStart(6)} | ` +
        cells.slice(1).map((c) => c.padStart(8)).join(' | '),
    );
  }
  console.log('  (a fast small-fuel stream is worth several +/t; this is the wait-vs-burn lever)');
  console.log('');
}

// --- Driven bootstrap ------------------------------------------------------

function takeLargest(world: World): Value | null {
  if (world.pool.length === 0) return null;
  let b = 0;
  for (let i = 1; i < world.pool.length; i++)
    if (valueMagnitude(world.pool[i].value).gt(valueMagnitude(world.pool[b].value))) b = i;
  return world.pool.splice(b, 1)[0].value;
}
function takeSmallest(world: World): Value | null {
  if (world.pool.length === 0) return null;
  let b = 0;
  for (let i = 1; i < world.pool.length; i++)
    if (valueMagnitude(world.pool[i].value).lt(valueMagnitude(world.pool[b].value))) b = i;
  return world.pool.splice(b, 1)[0].value;
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
      const f = takeSmallest(world);
      if (f) injectFuel(world, cell.id, f);
    }
  }
}

function bootstrap(ticks: number, successors: number): void {
  const world = createWorld(T);
  for (let i = 0; i < successors; i++) placeCell(world, 'successor', 0, i * 50);
  placeCell(world, 'addition', 300, 0);
  placeCell(world, 'multiplication', 600, 0);
  placeCell(world, 'exponentiation', 900, 0);

  console.log(`Driven bootstrap (${successors} successors + add/mul/exp, ${ticks} ticks):`);
  const thresholds = [10, 100, 1_000, 1e6, 1e9];
  let nt = 0;
  for (let t = 1; t <= ticks; t++) {
    drive(world);
    tick(world, 1);
    const s = totalScore(world);
    while (nt < thresholds.length && s.gte(thresholds[nt])) {
      console.log(`  score ≥ ${thresholds[nt].toLocaleString('en-US').padStart(13)} at ${secs(t).padStart(6)} (tick ${t})`);
      nt++;
    }
  }
  console.log(`  final score ${fmt(totalScore(world).toNumber())} · pool ${poolSize(world)}`);
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

  console.log('Time-as-Labor — tuning report');
  console.log(
    `baseRate=${T.baseRate} opWork=${T.opWorkPerDigit}·d^${T.opWorkExponent} ` +
      `build=${T.buildBase}·${T.buildGrowth}^n fuel=${T.fuelPerDigit}·d\n`,
  );
  buildLadder();
  opLadder();
  bootstrap(ticks, successors);
}

main();
