// sim/time-run.ts
//
// Headless pacing instrument for the Time-as-Labor prototype. The engine
// (core/engine.ts) is the simulation; this drives a scripted factory forward
// and prints the economy over time, so we can *see* the time economy and feel
// the pacing before any renderer exists.
//
// This is a rough instrument, not the locked balance source of truth — a
// proper optimal-play agent (like the Phase-6 sim's strategies) is the
// Phase 5.3 sim re-point. The driver here is a simple greedy auto-player:
// keep built operators fed from the loose pool, and shovel spare 1s as fuel.
//
// Usage:
//   node sim/time-run.ts                 # default scenario, 5000 ticks
//   node sim/time-run.ts --ticks 20000
//   node sim/time-run.ts --successors 6

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
import { valueMagnitude, type Value } from '../core/value.ts';
import { DEFAULT_TUNING } from '../core/time.ts';

interface Args {
  ticks: number;
  successors: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { ticks: 5000, successors: 4 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ticks') a.ticks = Number(argv[++i]);
    else if (argv[i] === '--successors') a.successors = Number(argv[++i]);
  }
  return a;
}

/** Pull the largest loose block from the pool (helps operators grow fast). */
function takeLargest(world: World): Value | null {
  if (world.pool.length === 0) return null;
  let bestIdx = 0;
  for (let i = 1; i < world.pool.length; i++) {
    if (valueMagnitude(world.pool[i]).gt(valueMagnitude(world.pool[bestIdx]))) bestIdx = i;
  }
  return world.pool.splice(bestIdx, 1)[0];
}

/** Pull the smallest loose block (good cheap fuel). */
function takeSmallest(world: World): Value | null {
  if (world.pool.length === 0) return null;
  let bestIdx = 0;
  for (let i = 1; i < world.pool.length; i++) {
    if (valueMagnitude(world.pool[i]).lt(valueMagnitude(world.pool[bestIdx]))) bestIdx = i;
  }
  return world.pool.splice(bestIdx, 1)[0];
}

/** A simple greedy auto-player: feed idle operators, fuel busy ones. */
function drive(world: World): void {
  for (const cell of world.cells.values()) {
    if (!cell.built) continue;
    if (cell.kind === 'successor') continue; // taps the river on its own

    // Stage operands from the pool when idle.
    if (cell.op === null) {
      for (let p = 0; p < cell.operands.length; p++) {
        if (cell.operands[p] === null) {
          const v = takeLargest(world);
          if (v) feedOperand(world, cell.id, p, v);
        }
      }
    } else {
      // Busy: accelerate with a cheap small block if one is going spare.
      if (world.pool.length > 2) {
        const f = takeSmallest(world);
        if (f) injectFuel(world, cell.id, f);
      }
    }
  }
}

function fmt(d: ReturnType<typeof totalScore>): string {
  const x = d.toNumber();
  if (!Number.isFinite(x)) return d.toString();
  if (x >= 1e6) return x.toExponential(2);
  return x.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const world = createWorld(DEFAULT_TUNING);

  // Scenario: a successor farm + one each of the constructive operators.
  for (let i = 0; i < args.successors; i++) placeCell(world, 'successor', 0, i * 50);
  placeCell(world, 'addition', 300, 0);
  placeCell(world, 'multiplication', 600, 0);
  placeCell(world, 'exponentiation', 900, 0);

  const kinds: CellKind[] = ['successor', 'addition', 'multiplication', 'exponentiation'];
  const counts = () => {
    const c: Record<string, number> = {};
    for (const k of kinds) c[k] = 0;
    let built = 0;
    for (const cell of world.cells.values()) {
      c[cell.kind]++;
      if (cell.built) built++;
    }
    return { c, built };
  };

  console.log('Time-as-Labor — headless pacing run');
  console.log(`baseRate=${DEFAULT_TUNING.baseRate}  successors=${args.successors}  ticks=${args.ticks}`);
  console.log('');
  console.log('  tick |        score | pool | note');
  console.log('  -----+--------------+------+---------------------------');

  const thresholds = [10, 100, 1_000, 10_000, 1e6, 1e9];
  let nextThreshold = 0;
  const sample = Math.max(1, Math.floor(args.ticks / 20));

  for (let t = 1; t <= args.ticks; t++) {
    drive(world);
    tick(world, 1);
    const s = totalScore(world);

    let logged = false;
    while (nextThreshold < thresholds.length && s.gte(thresholds[nextThreshold])) {
      const note = `first ≥ ${thresholds[nextThreshold].toLocaleString('en-US')}`;
      console.log(`  ${String(t).padStart(5)} | ${fmt(s).padStart(12)} | ${String(poolSize(world)).padStart(4)} | ${note}`);
      nextThreshold++;
      logged = true;
    }
    if (t % sample === 0 && !logged) {
      console.log(`  ${String(t).padStart(5)} | ${fmt(s).padStart(12)} | ${String(poolSize(world)).padStart(4)} |`);
    }
  }

  const { c, built } = counts();
  console.log('');
  console.log(`final score: ${fmt(totalScore(world))}`);
  console.log(`cells: ${built} built — ` + kinds.map((k) => `${k}×${c[k]}`).join(', '));
}

main();
