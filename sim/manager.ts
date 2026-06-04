// sim/manager.ts
//
// A MANAGING agent with a HUMAN ACTION BUDGET — the tuning lens.
//
// Principle we're tuning toward (the player's words): idling is always fine and
// satisfying (the free river makes Total Score rise no matter what), but ACTIVE
// interaction is always *more efficient*, so there's always something worth
// doing — without demanding robotic APM. To measure that, we cap the agent's
// manual actions (place / pipe / feed / fuel / remove) to a realistic rate:
// 1 tick = 1 second of play, so ~1 action/sec is a fast human. Banked budget is
// capped (you can't time-travel actions), so idle time isn't hoarded into a burst.
//
// Each manual action = 1 budget. We sweep the rate from idle-ish to "instant"
// (superhuman) and report how far the FRONTIER (biggest single number) climbs.
// The gap between rates IS the value of active play.
//
// Usage:
//   node sim/manager.ts                 # sweep rates over a fixed window
//   node sim/manager.ts --rate 1 --ticks 20000 --trace

import {
  createWorld,
  placeCell,
  placePipe,
  feedOperand,
  injectFuel,
  tick,
  totalScore,
  type World,
  type CellKind,
} from '../core/engine.ts';
import { valueOf, valueMagnitude, type Value } from '../core/value.ts';
import { DEFAULT_TUNING } from '../core/time.ts';
import Decimal from 'break_eternity.js';

const mag = (v: Value) => valueMagnitude(v);
const BUDGET_CAP = 3; // can't hoard idle time into a burst of actions

function takeLargest(w: World, max = Infinity): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value).toNumber();
    if (m <= max && (bi < 0 || mag(w.pool[i].value).gt(mag(w.pool[bi].value)))) bi = i;
  }
  return bi < 0 ? null : w.pool.splice(bi, 1)[0].value;
}
function takeSmallest(w: World): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) if (bi < 0 || mag(w.pool[i].value).lt(mag(w.pool[bi].value))) bi = i;
  return bi < 0 ? null : w.pool.splice(bi, 1)[0].value;
}
/** Largest loose block whose value is ≤ cap (a "moderate multiplier", not the frontier). */
function takeModerate(w: World, cap: number): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value).toNumber();
    if (m >= 2 && m <= cap && (bi < 0 || mag(w.pool[i].value).gt(mag(w.pool[bi].value)))) bi = i;
  }
  return bi < 0 ? null : w.pool.splice(bi, 1)[0].value;
}
/** Smallest loose block whose value ≥ floor (grade-matched fuel). */
function takeFuel(w: World, floor: Decimal): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value);
    if (m.gte(floor) && (bi < 0 || m.lt(mag(w.pool[bi].value)))) bi = i;
  }
  return bi < 0 ? null : w.pool.splice(bi, 1)[0].value;
}
function pushBack(w: World, v: Value | null): void {
  if (v) w.pool.push({ id: w.nextId++, value: v, x: 0, y: 0 });
}
interface Result { frontier: number; score: number; actions: number; cells: number }

function runManager(rate: number, ticks: number, trace = false): Result {
  const world = createWorld(DEFAULT_TUNING);
  let budget = 0;
  let actions = 0;
  const act = (fn: () => void): boolean => {
    if (budget < 1) return false;
    budget -= 1;
    actions++;
    fn();
    return true;
  };

  // --- The idle baseline: an AUTO-PIPED backbone that runs with zero actions.
  // A balanced multiplication tree (successors → adders → squaring mults), all
  // wired, that steadily spills its root product (~65,536) into the loose pool.
  // Left alone (rate 0) it keeps producing → score rises → idle is fine. Built
  // "for free" here: this is the factory you've already set up; we measure the
  // value of ONGOING management on top of it.
  const placePiped = (kind: CellKind, x: number, y: number): number => placeCell(world, kind, x, y);
  function buildBackbone(depth: number): void {
    let sc = 0;
    const succ: number[] = [];
    const nSucc = 1 << depth;
    for (let i = 0; i < nSucc; i++) succ.push(placePiped('successor', 0, i * 12));
    const nextS = () => succ[sc++ % nSucc];
    const build = (level: number, idx: number): number => {
      if (level === 0) {
        const adder = placePiped('addition', 200, idx * 40);
        placePipe(world, nextS(), adder, 0, false);
        placePipe(world, nextS(), adder, 1, false);
        placePipe(world, nextS(), adder, -1, true);
        return adder;
      }
      const l = build(level - 1, idx * 2);
      const r = build(level - 1, idx * 2 + 1);
      const m = placePiped('multiplication', 200 + (depth - level + 1) * 160, idx * 40);
      placePipe(world, l, 0, m, 0, false);
      placePipe(world, r, 0, m, 1, false);
      return m;
    };
    build(depth, 0); // root spills 65,536s into the loose pool (no output pipe)
  }
  buildBackbone(3); // root spills ~256s (idle baseline); kept modest so the sim stays fast
  // ONE frontier multiplication, grown INCREMENTALLY: each pass multiplies the
  // current frontier by a moderate block (×≤1000), so the frontier's digits
  // grow ~linearly per action (a smooth gradient) instead of doubling (a cliff).
  // op0 = the frontier (largest loose); op1 = a moderate multiplier.
  // N PARALLEL frontier-builders — more APM keeps more of them fed/fuelled, so
  // active play can absorb extra actions (the factory-width APM gradient).
  const N_FRONTIER = 4;
  const fmults: number[] = [];
  for (let i = 0; i < N_FRONTIER; i++) fmults.push(placePiped('multiplication', 1100, (i - 2) * 90));
  const MULT_CAP = 1000; // each multiply grows the frontier by at most ×1000
  // Build everything instantly (the factory is already set up).
  while ([...world.cells.values()].some((c) => !c.built)) tick(world, 1);

  function manageCell(fm: number): boolean {
    const cell = world.cells.get(fm)!;
    if (cell.op === null) {
      if (cell.operands[0] === null) {
        const front = takeLargest(world);
        if (front && mag(front).gte(2)) { if (!act(() => feedOperand(world, fm, 0, front))) { pushBack(world, front); return false; } return true; }
        pushBack(world, front); return false;
      } else if (cell.operands[1] === null) {
        const m = takeModerate(world, MULT_CAP);
        if (m) { if (!act(() => feedOperand(world, fm, 1, m))) { pushBack(world, m); return false; } return true; }
        return false;
      }
      return false;
    }
    const f = takeFuel(world, cell.op.grade);
    if (f) { if (!act(() => injectFuel(world, fm, f))) { pushBack(world, f); return false; } return true; }
    return false;
  }

  function manage(): void {
    let progressed = true;
    while (budget >= 1 && progressed) {
      progressed = false;
      for (const fm of fmults) {
        if (budget < 1) break;
        if (manageCell(fm)) progressed = true;
      }
    }
    // Keep the loose pile bounded (engine bookkeeping, not a player action).
    while (world.pool.length > 1500) {
      const x = takeSmallest(world); const y = takeSmallest(world);
      if (!x || !y) { pushBack(world, x); pushBack(world, y); break; }
      pushBack(world, valueOf(mag(x).add(mag(y)).toNumber()));
    }
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
  const sample = Math.max(1, Math.floor(ticks / 16));
  const cap = Math.max(BUDGET_CAP, rate); // a fast rate isn't throttled by the anti-hoard cap
  for (let t = 1; t <= ticks; t++) {
    budget = Math.min(cap, budget + rate);
    manage();
    tick(world, 1);
    if (trace && t % sample === 0) {
      console.log(`  t=${String(t).padStart(6)} | score ${fmt(totalScore(world).toNumber()).padStart(10)} | frontier ${fmt(frontier()).padStart(10)} | cells ${world.cells.size} | loose ${world.pool.length}`);
    }
  }
  return { frontier: frontier(), score: totalScore(world).toNumber(), actions, cells: world.cells.size };
}

function main(): void {
  let rate: number | null = null;
  let ticks = 18000;
  let trace = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--rate') rate = Number(a[++i]);
    else if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--trace') trace = true;
  }
  const fmt = (x: number) => (!Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US'));

  if (rate !== null) {
    console.log(`Managing agent @ ${rate} actions/sec, ${ticks} ticks (${(ticks / 3600).toFixed(1)}h):\n`);
    const r = runManager(rate, ticks, trace);
    console.log(`\n  frontier ${fmt(r.frontier)} | score ${fmt(r.score)} | ${r.actions} actions | ${r.cells} cells`);
    return;
  }

  console.log('Managing agent — frontier vs human action rate (how much does non-instant play cost?)');
  console.log(`window: ${ticks} ticks ≈ ${(ticks / 3600).toFixed(1)}h of play\n`);
  console.log('  actions/sec |   frontier   |    score    | actions used | note');
  console.log('  ------------+--------------+-------------+--------------+-----------------');
  const rates: [number, string][] = [
    [0, 'pure idle (backbone only)'],
    [0.5, '1 action / 2s'],
    [1, '1 / sec (fast human)'],
    [2, '2 / sec (frantic)'],
  ];
  for (const [r, note] of rates) {
    const res = runManager(r, ticks);
    console.log(`  ${String(r).padStart(11)} | ${fmt(res.frontier).padStart(12)} | ${fmt(res.score).padStart(11)} | ${String(res.actions).padStart(12)} | ${note}`);
  }
  console.log('\n  idle never stalls (score rises); each step up in rate should buy more frontier —');
  console.log('  the gap is the value of active play. We tune so that gap is rewarding but not punishing.');
}

main();
