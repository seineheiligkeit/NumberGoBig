// sim/play.ts
//
// A "real play" agent: it starts from an EMPTY canvas and plays the whole game
// at a HUMAN action rate — no instant-build, no pre-wired farm, no hardcoded
// optimal tree, no free block-merging. It must figure out its own fuel supply.
// The point is a realistic baseline to compare a human play session against.
//
// It plays "well" with general heuristics (not a proven-optimal shortcut):
//   1. Build ONE compact fuel factory — a depth-3 multiplication tree that pipes
//      a steady stream of ~256-grade fuel into the loose pool (auto-runs once
//      wired). Successors → adders (2s) → mults (4 → 16 → 256).
//   2. Build a couple of frontier multiplications and grow them: pick up the big
//      result, drop it back as one operand, a moderate block as the other, then
//      pour the graded fuel into the (digits³-growing) op to rush it.
//   3. Only when GENUINELY, sustainedly fuel-starved, build ONE more fuel tree —
//      bounded, so it never spam-builds cells that can't finish.
//
// Honest constraints (vs. the strategy probes, which use shortcuts):
//   * Every place / pipe / feed / fuel is ONE action, paid from a per-second
//     budget. A human idles, so the default rates are LOW (1 action / 30–60 s).
//   * Every cell pays its real build time (no instant-build).
//   * NO free summation-merge of loose blocks — fuel is delivered one block per
//     fuel-action, so fuel throughput is a real ceiling (the way it is for a
//     human shoveling blocks). The pool is only ever trimmed as a last resort.
//
// Usage:
//   node sim/play.ts                 # table across realistic rates, 4h each
//   node sim/play.ts --rate 0.1 --hours 4 --trace
//
//   --rate R   actions per second (default: a table of 1/60 … 1)
//   --hours H  play-session length (default 4).  1 tick = 1 second.

import {
  createWorld, placeCell, placePipe, feedOperand, injectFuel, tick, totalScore, getCell,
  type World,
} from '../core/engine.ts';
import { valueMagnitude, type Value } from '../core/value.ts';
import { DEFAULT_TUNING } from '../core/time.ts';
import Decimal from 'break_eternity.js';

const mag = (v: Value) => valueMagnitude(v);

/** Pull ONE loose block matching `ok`; biggest (default) or smallest. With
 *  stacking on (the live game), the matching pool entry may be a *stack* — we
 *  PEEL ONE block off it (decrement count) rather than splice the whole pile,
 *  which would throw away the rest. With stacking off, count is 1 and this is the
 *  original splice. So one action still moves one block, exactly as for a human. */
function take(w: World, ok: (m: Decimal) => boolean, biggest = true): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value);
    if (!ok(m)) continue;
    if (bi < 0 || (biggest ? m.gt(mag(w.pool[bi].value)) : m.lt(mag(w.pool[bi].value)))) bi = i;
  }
  if (bi < 0) return null;
  const b = w.pool[bi];
  if ((b.count ?? 1) > 1) { b.count -= 1; return b.value; }
  return w.pool.splice(bi, 1)[0].value;
}
const pushBack = (w: World, v: Value | null) => { if (v) w.pool.push({ id: w.nextId++, value: v, x: 0, y: 0, count: 1 }); };

// Bounds that keep the agent honest (a human can't place unlimited cells: build
// cost grows per kind, so beyond a handful of trees it isn't worth it).
const MAX_FUEL_TREES = 6;
const POOL_HARD_CAP = 4000; // safety only; with bounded trees it rarely binds

interface Counts { place: number; pipe: number; feed: number; fuel: number }

function runSession(rate: number, hours: number, trace: boolean, stacking: boolean): {
  frontier: number; score: number; cells: number; built: number; pipes: number;
  trees: number; actions: number; counts: Counts; poolEntities: number;
} {
  const ticks = Math.round(hours * 3600);
  // Mirror the live game: stacking on means un-piped output piles into one
  // movable stack (so the agent peels fuel off a pile, and nothing is discarded
  // by the pool cap). Off reproduces the original per-block baseline.
  const world = createWorld(DEFAULT_TUNING, { stacking });
  const counts: Counts = { place: 0, pipe: 0, feed: 0, fuel: 0 };

  let budget = 0;
  const cap = Math.max(2, rate); // allow a small burst (a player does 2 quick acts then idles)

  // --- The build queue: thunks, each one action. The agent works through it,
  //     then manages. It appends another tree only when truly fuel-starved. ---
  const queue: (() => void)[] = [];
  let fuelTrees = 0;
  let yOff = 0;

  /** Queue a depth-3 balanced multiplication tree → ~256-grade fuel, piped,
   *  auto-running. 8 successors (1s) → 8 adders (2s) → 4·16·… mults → 256s. */
  function queueFuelTree(): void {
    fuelTrees++;
    const baseY = yOff; yOff += 340;
    const ref: Record<string, number> = {};
    const succ: string[] = [];
    for (let i = 0; i < 8; i++) {
      const k = `s${baseY}_${i}`; succ.push(k);
      queue.push(() => { ref[k] = placeCell(world, 'successor', 0, baseY + i * 12); counts.place++; });
    }
    let sN = 0;
    const nextS = () => succ[sN++ % succ.length];
    const build = (level: number, idx: number, slot: string): void => {
      if (level === 0) {
        queue.push(() => { ref[slot] = placeCell(world, 'addition', 200, baseY + idx * 24); counts.place++; });
        const a0 = nextS(), a1 = nextS(), a2 = nextS();
        queue.push(() => { placePipe(world, ref[a0], 0, ref[slot], 0); counts.pipe++; });
        queue.push(() => { placePipe(world, ref[a1], 0, ref[slot], 1); counts.pipe++; });
        queue.push(() => { placePipe(world, ref[a2], 0, ref[slot], -1, { fuel: true }); counts.pipe++; });
        return;
      }
      const l = `${slot}L`, r = `${slot}R`;
      build(level - 1, idx * 2, l); build(level - 1, idx * 2 + 1, r);
      queue.push(() => { ref[slot] = placeCell(world, 'multiplication', 200 + level * 160, baseY + idx * 24); counts.place++; });
      queue.push(() => { placePipe(world, ref[l], 0, ref[slot], 0); counts.pipe++; });
      queue.push(() => { placePipe(world, ref[r], 0, ref[slot], 1); counts.pipe++; });
    };
    build(3, 0, 'root'); // root spills 256s into the loose pool (no output pipe)
  }

  // The frontier multiplications (the active climb): start with two; the agent
  // feeds & fuels them. They have no output pipe, so results land loose to be
  // picked up and fed back in (the manual recycle a player does by hand).
  const fmults: number[] = [];
  queueFuelTree(); // first: a fuel factory
  queue.push(() => { fmults.push(placeCell(world, 'multiplication', 1500, -80)); counts.place++; });
  queue.push(() => { fmults.push(placeCell(world, 'multiplication', 1500, 40)); counts.place++; });

  let starve = 0; // sustained no-graded-fuel counter (drives bounded expansion)

  /** Do one unit of work (one action). Returns true if an action was spent. */
  function step(): boolean {
    if (budget < 1) return false;

    // 1) Lay out the factory first.
    if (queue.length) { budget -= 1; queue.shift()!(); return true; }

    // 2) Manage the frontier mults — CONCENTRATE: grow one, then out-fuel it.
    for (const fm of fmults) {
      if (budget < 1) break;
      const c = getCell(world, fm);
      if (!c || !c.built) continue;
      if (c.op === null) {
        // Idle: stage operands. op0 = the biggest block we have (the frontier),
        // op1 = a moderate block (≤1000) so the op stays digits³-cheap-ish.
        if (c.operands[0] === null) {
          const f = take(world, (m) => m.gte(2));
          if (f) { budget -= 1; counts.feed++; feedOperand(world, fm, 0, f); return true; }
        } else if (c.operands[1] === null) {
          const m = take(world, (mm) => mm.gte(2) && mm.lte(1000));
          if (m) { budget -= 1; counts.feed++; feedOperand(world, fm, 1, m); return true; }
        }
      } else {
        // Working: pour in graded fuel to rush the digits³ op. Take the biggest
        // block in the BAND [grade, fuelCap] — never bigger, so we don't torch
        // the frontier-sized result (that's reserved as the next op0). fuelCap
        // tracks the grade so deeper trees' fuel is used as the op grows.
        const grade = c.op.grade;
        const fuelCap = Decimal.max(new Decimal(4096), grade.mul(64));
        const f = take(world, (m) => m.gte(grade) && m.lte(fuelCap));
        if (f) { budget -= 1; counts.fuel++; injectFuel(world, fm, f); starve = Math.max(0, starve - 3); return true; }
        starve++; // wanted to fuel, but nothing in-band — real fuel pressure
      }
    }

    // 3) Bounded expansion: under sustained fuel pressure, add a fuel tree (a
    //    competent player scales fuel production to match the climb). Capped.
    if (starve > 150 && queue.length === 0 && fuelTrees < MAX_FUEL_TREES) {
      starve = 0;
      queueFuelTree();
      return false; // queued; spend the action next step
    }
    return false;
  }

  const frontier = (): number => {
    let b = 0;
    for (const bl of world.pool) b = Math.max(b, mag(bl.value).toNumber());
    for (const c of world.cells.values()) {
      for (const o of c.operands) if (o) b = Math.max(b, mag(o).toNumber());
      if (c.op) for (const e of c.op.emits) b = Math.max(b, mag(e.value).toNumber());
    }
    return b;
  };
  const fmt = (x: number) => (!Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US'));
  const hm = (t: number) => `${Math.floor(t / 3600)}h${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;

  if (trace) {
    console.log(`\nReal-play trace — from zero, ${rate} action/s, ${hours}h (1 tick = 1s):`);
    console.log('   time |   score      |  frontier    | cells(built) | loose | trees');
  }
  const sample = Math.max(1, Math.floor(ticks / 24));

  for (let t = 1; t <= ticks; t++) {
    budget = Math.min(cap, budget + rate);
    let guard = 0;
    while (budget >= 1 && step() && guard++ < 200) { /* spend the tick's budget */ }
    tick(world, 1);
    // Last-resort pool trim (NOT a fuel source): if the pool somehow runs away,
    // drop the very smallest loose blocks. With bounded trees this rarely fires.
    while (world.pool.length > POOL_HARD_CAP) take(world, () => true, false);
    if (trace && t % sample === 0) {
      const built = [...world.cells.values()].filter((c) => c.built).length;
      console.log(`  ${hm(t).padStart(5)} | ${fmt(totalScore(world).toNumber()).padStart(12)} | ${fmt(frontier()).padStart(12)} | ${String(world.cells.size).padStart(4)}(${String(built).padStart(3)}) | ${String(world.pool.length).padStart(5)} | ${fuelTrees}`);
    }
  }

  const built = [...world.cells.values()].filter((c) => c.built).length;
  return {
    frontier: frontier(),
    score: totalScore(world).toNumber(),
    cells: world.cells.size, built, pipes: world.pipes.size, trees: fuelTrees,
    actions: counts.place + counts.pipe + counts.feed + counts.fuel, counts,
    poolEntities: world.pool.length,
  };
}

function main(): void {
  let rate = 0, hours = 4, trace = false, stacking = true;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--rate') rate = Number(a[++i]);
    else if (a[i] === '--hours') hours = Number(a[++i]);
    else if (a[i] === '--trace') trace = true;
    else if (a[i] === '--no-stacking') stacking = false;
  }
  const fmt = (x: number) => (!Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US'));

  console.log(`Real-play baseline — a competent player from an EMPTY canvas.`);
  console.log(`No instant-build, no pre-wired farm, no free block-merge. ${hours}h sessions.`);
  console.log(`stacking: ${stacking ? 'ON (mirrors the live game)' : 'OFF (legacy per-block pool)'}\n`);

  // A realistic spread of human action rates: from "idle, a few taps a minute"
  // up to "engaged, ~1 action a second". A little speed reward should show.
  const rates = rate > 0 ? [rate] : [1 / 60, 1 / 30, 1 / 10, 1 / 3, 1];
  const label = (r: number) => (r >= 1 ? `${r}/s` : `1 / ${Math.round(1 / r)}s`);

  console.log('   action rate  |   FRONTIER    |    score      | cells(built) | trees | actions | pool');
  console.log('  -------------+---------------+---------------+--------------+-------+---------+------');
  for (const r of rates) {
    const res = runSession(r, hours, trace && rates.length === 1, stacking);
    console.log(`  ${label(r).padStart(12)} | ${fmt(res.frontier).padStart(13)} | ${fmt(res.score).padStart(13)} | ${String(res.cells).padStart(4)}(${String(res.built).padStart(3)}) | ${String(res.trees).padStart(5)} | ${String(res.actions).padStart(7)} | ${res.poolEntities}`);
  }
  console.log(`\n  FRONTIER = biggest single number built. A faster player reaches higher`);
  console.log(`  (more fuel-actions per second → the digits³ frontier op rushes faster),`);
  console.log(`  but idling never stalls: the river + fuel trees keep score climbing.`);
  console.log(`  pool = loose-block ENTITIES at session end (stacks when stacking is on).`);
}

main();
