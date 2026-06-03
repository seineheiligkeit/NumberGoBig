// sim/agent.ts
//
// A heuristic "optimal-play" agent for the converged Time-as-Labor economy.
// It drives the pure engine (core/engine.ts) directly — feeding operands and
// fuel by hand (perfect, instantaneous logistics) — so it isolates the
// PRODUCTION economy (build/op/fuel/grade/mill) from transport. The answer it
// gives is the pacing ceiling: "with good play and free routing, how fast does
// score climb?" Transport friction (transit, accelerators, distance) is the
// layer the player adds on top; a logistics-aware agent is a later iteration.
//
// This is not a provably-optimal agent — it's a competent climber whose job is
// to make the curve legible so we can tune the exponents/grades. Run it,
// read the unlock pacing, adjust DEFAULT_TUNING, repeat.
//
// Usage: node sim/agent.ts [--ticks 20000] [--verbose]

import {
  createWorld,
  placeCell,
  feedOperand,
  injectFuel,
  tick,
  totalScore,
  getCell,
  type World,
  type CellKind,
  type SimCell,
} from '../core/engine.ts';
import { valueOf, valueMagnitude, type Value } from '../core/value.ts';
import { DEFAULT_TUNING } from '../core/time.ts';
import Decimal from 'break_eternity.js';

const T = DEFAULT_TUNING;

// ---- Pool helpers (the agent's working inventory) -------------------------

function mag(v: Value): Decimal {
  return valueMagnitude(v);
}
/** Remove and return the largest loose block (or null). */
function takeLargest(w: World, max = Infinity): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value).toNumber();
    if (m <= max && (bi < 0 || mag(w.pool[i].value).gt(mag(w.pool[bi].value)))) bi = i;
  }
  return bi < 0 ? null : w.pool.splice(bi, 1)[0].value;
}
/** Remove and return the smallest loose block (or null). */
function takeSmallest(w: World): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    if (bi < 0 || mag(w.pool[i].value).lt(mag(w.pool[bi].value))) bi = i;
  }
  return bi < 0 ? null : w.pool.splice(bi, 1)[0].value;
}
/** Remove and return the smallest loose block whose value ≥ floor (or null). */
function takeSmallestAtLeast(w: World, floor: Decimal): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    if (mag(w.pool[i].value).gte(floor) && (bi < 0 || mag(w.pool[i].value).lt(mag(w.pool[bi].value)))) bi = i;
  }
  return bi < 0 ? null : w.pool.splice(bi, 1)[0].value;
}
function pushBack(w: World, v: Value | null): void {
  if (v) w.pool.push({ id: w.nextId++, value: v, x: 0, y: 0 });
}
/** Safety cap: consolidate the two smallest blocks into one (conserves value,
 *  bounds block count) when the pool grows large. Models the player keeping the
 *  loose pile under control; without it the O(pool) scans blow up. */
const POOL_CAP = 1500;
function capPool(w: World): void {
  while (w.pool.length > POOL_CAP) {
    const a = takeSmallest(w);
    const b = takeSmallest(w);
    if (!a || !b) {
      pushBack(w, a);
      pushBack(w, b);
      break;
    }
    pushBack(w, valueOf(mag(a).add(mag(b)).toNumber()));
  }
}

// ---- The agent ------------------------------------------------------------

interface Roster {
  successors: number;
  additions: number;
  multiplications: number;
  exponentiations: number;
}

function build(world: World, roster: Roster): void {
  const have = (k: CellKind) => [...world.cells.values()].filter((c) => c.kind === k).length;
  const want: [CellKind, number][] = [
    ['successor', roster.successors],
    ['addition', roster.additions],
    ['multiplication', roster.multiplications],
    ['exponentiation', roster.exponentiations],
  ];
  for (const [kind, n] of want) {
    if (have(kind) < n) placeCell(world, kind, 0, 0);
  }
}

/** Fuel a working cell with the smallest pool block at/above its grade. */
function fuelCell(world: World, cell: SimCell): void {
  if (!cell.op) return;
  const f = takeSmallestAtLeast(world, cell.op.grade);
  if (f) injectFuel(world, cell.id, f);
}

function agentStep(world: World): void {
  for (const cell of world.cells.values()) {
    if (!cell.built) continue;
    if (cell.kind === 'successor') continue; // taps the river

    if (cell.op !== null) {
      fuelCell(world, cell);
      continue;
    }
    if (cell.kind === 'addition') {
      // Drain the smallest blocks upward (1+1→2, 2+2→4…), keeping a small fuel
      // reserve so working ops never starve. This bounds the loose-pile count.
      if (world.pool.length > 5) {
        const a = takeSmallest(world);
        const b = takeSmallest(world);
        if (a && b) {
          feedOperand(world, cell.id, 0, a);
          feedOperand(world, cell.id, 1, b);
        } else {
          pushBack(world, a);
          pushBack(world, b);
        }
      }
    } else if (cell.kind === 'multiplication') {
      const a = takeLargest(world);
      const b = takeLargest(world);
      if (a && b && mag(a).gte(2) && mag(b).gte(2)) {
        feedOperand(world, cell.id, 0, a);
        feedOperand(world, cell.id, 1, b);
      } else {
        pushBack(world, a);
        pushBack(world, b);
      }
    } else if (cell.kind === 'exponentiation') {
      // 2 ^ (a modest height) — small base, big-ish height → huge numbers.
      const height = takeLargest(world);
      if (height && mag(height).gte(8) && mag(height).lte(2000)) {
        feedOperand(world, cell.id, 0, valueOf(2));
        feedOperand(world, cell.id, 1, height);
      } else {
        pushBack(world, height);
      }
    }
  }
  capPool(world);
}

// ---- Runner ---------------------------------------------------------------

function secs(t: number): string {
  if (!Number.isFinite(t)) return '∞';
  if (t < 90) return `${t.toFixed(0)}s`;
  if (t < 5400) return `${(t / 60).toFixed(1)}m`;
  if (t < 1.3e5) return `${(t / 3600).toFixed(1)}h`;
  return `${(t / 3.15e7).toExponential(1)}yr`;
}
function fmt(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  return Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
}

function main(): void {
  let ticks = 20000;
  let verbose = false;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ticks') ticks = Number(argv[++i]);
    else if (argv[i] === '--verbose') verbose = true;
  }

  const world = createWorld(T);
  const roster: Roster = { successors: 8, additions: 2, multiplications: 1, exponentiations: 1 };

  console.log('Time-as-Labor — optimal-play agent (production economy, free logistics)');
  console.log(`roster: ${JSON.stringify(roster)}  ticks=${ticks}\n`);
  console.log('  tick |   time | score          | note');
  console.log('  -----+--------+----------------+----------------------');

  const thresholds = [100, 1e3, 1e6, 1e9, 1e12, 1e18, 1e30, 1e60, 1e100];
  let nt = 0;
  const sample = Math.max(1, Math.floor(ticks / 24));

  for (let t = 1; t <= ticks; t++) {
    build(world, roster);
    agentStep(world);
    tick(world, 1);

    const s = totalScore(world);
    let logged = false;
    while (nt < thresholds.length && s.gte(thresholds[nt])) {
      console.log(
        `  ${String(t).padStart(5)} | ${secs(t).padStart(6)} | ${fmt(s.toNumber()).padStart(14)} | first ≥ 10^${Math.round(Math.log10(thresholds[nt]))}`,
      );
      nt++;
      logged = true;
    }
    if (verbose && t % sample === 0 && !logged) {
      console.log(`  ${String(t).padStart(5)} | ${secs(t).padStart(6)} | ${fmt(s.toNumber()).padStart(14)} |`);
    }
  }

  const built = [...world.cells.values()].filter((c) => c.built).length;
  console.log('');
  console.log(`final score: ${fmt(totalScore(world).toNumber())}`);
  console.log(`cells: ${built} built; loose blocks: ${world.pool.length}`);
}

main();
