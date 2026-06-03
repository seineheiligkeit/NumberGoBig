// sim/factory-agent.ts
//
// A FULLY FAITHFUL play agent: it builds and runs a real piped factory in the
// engine — every operand and every fuel block flows through pipes, with real
// build times, transit (value^p × distance), fuel grades, the freeze, mills,
// and accelerators. Nothing is hand-fed. The point is OBSERVATION: what does it
// build, when; how large does the factory get; how many actions does it take;
// and how does score climb under full transport.
//
// It is instrumented with an action log (place / pipe / mill / charge / seed),
// and prints a build timeline, a periodic state trace, and a final summary.
//
// The topology it grows (the design's areas, all piped):
//   successors ──fuel──▶ Height accumulator (loopback adder: counts up)
//                              │ tap
//                              ├──operand──▶ Exponentiation (2 ^ height) ──▶ score
//                              └──▶ Mill ──fuel──▶ exp fuel port (graded fuel)
//   + accelerators on long lines; + more successors / pipes when starved.
//
// Usage: node sim/factory-agent.ts [--ticks 20000] [--trace]

import {
  createWorld,
  placeCell,
  placePipe,
  feedOperand,
  tick,
  totalScore,
  getCell,
  opFraction,
  type World,
  type CellKind,
} from '../core/engine.ts';
import { valueOf, valueMagnitude } from '../core/value.ts';
import { DEFAULT_TUNING } from '../core/time.ts';

// ---- Action logging -------------------------------------------------------

interface Action {
  tick: number;
  kind: string;
  detail: string;
}
const log: Action[] = [];
function record(world: World, kind: string, detail: string): void {
  log.push({ tick: currentTick, kind, detail });
}
let currentTick = 0;

function secs(t: number): string {
  if (t < 90) return `${t}s`;
  if (t < 5400) return `${(t / 60).toFixed(1)}m`;
  return `${(t / 3600).toFixed(1)}h`;
}
function fmt(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  return Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
}

// ---- The agent ------------------------------------------------------------

interface Factory {
  successors: number[];
  adder: number; // 1+1 → 2 (seeds the chain)
  mults: number[]; // squaring chain: 2→4→16→256→… (each fed by the previous)
  mill: number;
}

function place(world: World, kind: CellKind, x: number, y: number, why: string): number {
  const id = placeCell(world, kind, x, y);
  record(world, 'place', `${kind} #${id} @(${x},${y}) — ${why}`);
  return id;
}
function pipe(world: World, from: number, to: number, port: number, fuel: boolean, why: string): void {
  placePipe(world, from, 0, to, port, { fuel });
  record(world, 'pipe', `#${from} → #${to}${fuel ? ' (fuel)' : `[${port}]`} — ${why}`);
}

const CHAIN = 5; // squaring stages: 2→4→16→256→65536→~4e9

/** Build the skeleton: a fuel farm + an adder + a squaring multiplication chain.
 *  Each mult is fed BOTH operands from the previous stage (two pipes; the
 *  round-robin emit fills the two ports over successive outputs → it squares).
 *  No loopback — robust under the engine's one-block-per-pipe model. */
function bootstrap(world: World): Factory {
  // Fuel/operand sources: adder needs 2 operands + fuel; each mult needs fuel.
  const nSucc = 3 + CHAIN; // 2 adder-operands + 1 adder-fuel + 1 per mult fuel
  const successors: number[] = [];
  for (let i = 0; i < nSucc; i++) successors.push(place(world, 'successor', 0, (i - nSucc / 2) * 44, 'fuel farm'));
  const adder = place(world, 'addition', 240, 0, 'seed: 1+1 → 2');
  const mults: number[] = [];
  for (let i = 0; i < CHAIN; i++) {
    mults.push(place(world, 'multiplication', 460 + i * 200, (i % 2 ? 60 : -60), `square stage ${i + 1}`));
  }
  const mill = place(world, 'mill', 460 + CHAIN * 200, 0, 'liquefy the final product → recycle fuel');
  return { successors, adder, mults, mill };
}

function wire(world: World, f: Factory): void {
  // Adder: two successors → operands; one successor → fuel.
  pipe(world, f.successors[0], f.adder, 0, false, 'adder operand 0 (a 1)');
  pipe(world, f.successors[1], f.adder, 1, false, 'adder operand 1 (a 1)');
  pipe(world, f.successors[2], f.adder, -1, true, 'adder fuel (1s; tiny add accepts them)');
  // Squaring chain: each stage fed both operands from the previous (two pipes →
  // round-robin fills both ports → it squares), fuelled by a dedicated successor.
  let prev = f.adder;
  for (let i = 0; i < f.mults.length; i++) {
    const m = f.mults[i];
    pipe(world, prev, m, 0, false, `square ${i + 1}: operand 0`);
    pipe(world, prev, m, 1, false, `square ${i + 1}: operand 1`);
    pipe(world, f.successors[3 + i], m, -1, true, `square ${i + 1}: base fuel (1s)`);
    prev = m;
  }
  // The high stages outgrow 1s-fuel (the grade wall). Tap a mid stage's product
  // into the Mill, liquefy it to ~100-grade pieces, and pipe that refined fuel
  // to the top stages' fuel ports — the design's "previous tier fuels the next".
  const midStage = f.mults[2]; // produces 256s
  pipe(world, midStage, f.mill, 0, false, 'tap 256s → mill (refine fuel)');
  for (let i = 3; i < f.mults.length; i++) {
    pipe(world, f.mill, f.mults[i], -1, true, `refined fuel → square ${i + 1}`);
  }
}

/** Nothing to hand-feed — the factory is fully piped. (Hook kept for future
 *  adaptive expansion: add fuel pipes / successors when a stage starves.) */
function manage(_world: World, _f: Factory): void {}

// ---- Runner ---------------------------------------------------------------

function main(): void {
  let ticks = 20000;
  let trace = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--trace') trace = true;
  }

  const world = createWorld(DEFAULT_TUNING);
  const f = bootstrap(world);

  console.log('Time-as-Labor — fully faithful factory agent (real pipes + transport)\n');

  let wired = false;
  const sample = Math.max(1, Math.floor(ticks / 20));
  const traceRows: string[] = [];

  for (let t = 1; t <= ticks; t++) {
    currentTick = t;
    if (!wired) {
      const allBuilt = [...f.successors, f.adder, ...f.mults, f.mill].every((id) => getCell(world, id)!.built);
      if (allBuilt) {
        wire(world, f);
        wired = true;
        record(world, 'wire', 'skeleton wired');
      }
    }
    manage(world, f);
    tick(world, 1);

    if (trace && t % sample === 0) {
      // Largest value anywhere (the "frontier" the chain has reached).
      let biggest = 0;
      for (const b of world.pool) biggest = Math.max(biggest, valueMagnitude(b.value).toNumber());
      for (const c of world.cells.values()) {
        if (c.op) for (const e of c.op.emits) biggest = Math.max(biggest, valueMagnitude(e.value).toNumber());
      }
      const lastMul = getCell(world, f.mults[f.mults.length - 1])!;
      traceRows.push(
        `  ${secs(t).padStart(6)} | score ${fmt(totalScore(world).toNumber()).padStart(12)} | ` +
          `biggest ${fmt(biggest).padStart(10)} | tip ${(opFraction(lastMul) * 100).toFixed(0).padStart(3)}% | ` +
          `cells ${world.cells.size} pipes ${world.pipes.size} loose ${world.pool.length}`,
      );
    }
  }

  // Build timeline.
  console.log('Build timeline (actions):');
  for (const ev of log) console.log(`  ${secs(ev.tick).padStart(6)} | ${ev.kind.padEnd(6)} | ${ev.detail}`);
  console.log('');
  if (trace) {
    console.log('State trace:');
    for (const r of traceRows) console.log(r);
    console.log('');
  }

  // Summary.
  const byKind: Record<string, number> = {};
  for (const ev of log) byKind[ev.kind] = (byKind[ev.kind] ?? 0) + 1;
  console.log('Summary:');
  console.log(`  final score: ${fmt(totalScore(world).toNumber())}`);
  console.log(`  factory size: ${world.cells.size} cells, ${world.pipes.size} pipes`);
  console.log(`  actions taken: ${log.length} (${Object.entries(byKind).map(([k, n]) => `${k}:${n}`).join(', ')})`);
  console.log(`  loose blocks: ${world.pool.length}`);
}

main();
