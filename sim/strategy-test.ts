// sim/strategy-test.ts
//
// Can a SMART superhuman agent beat the naive cap? The naive manager spreads
// value across builders, so extra APM is wasted (frontier saturates). The
// insight: a single frontier op's fuel demand grows as digits³ — so if you
// CONCENTRATE on one frontier and pour fuel into it, there's always more fuel to
// shovel, and APM never saturates. We compare two strategies across action
// rates, on the same generous fuel farm:
//
//   spread      — N parallel builders, each (largest × moderate). The naive one.
//   concentrate — ONE frontier; grow it × moderate, then FUEL the (slow) op
//                 with the biggest graded fuel, as fast as APM allows.
//
// Usage: node sim/strategy-test.ts [--ticks 9000]

import {
  createWorld, placeCell, placePipe, feedOperand, injectFuel, tick, totalScore,
  type World, type CellKind,
} from '../core/engine.ts';
import { valueOf, valueMagnitude, type Value } from '../core/value.ts';
import { DEFAULT_TUNING } from '../core/time.ts';
import Decimal from 'break_eternity.js';

const mag = (v: Value) => valueMagnitude(v);
const take = (w: World, pick: (a: Decimal, b: Decimal) => boolean, ok: (m: Decimal) => boolean): Value | null => {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value);
    if (ok(m) && (bi < 0 || pick(m, mag(w.pool[bi].value)))) bi = i;
  }
  return bi < 0 ? null : w.pool.splice(bi, 1)[0].value;
};
const takeLargest = (w: World) => take(w, (a, b) => a.gt(b), (m) => m.gte(2));
const takeModerate = (w: World, cap: number) => take(w, (a, b) => a.gt(b), (m) => m.gte(2) && m.lte(cap));
const takeFuelBig = (w: World, floor: Decimal) => take(w, (a, b) => a.gt(b), (m) => m.gte(floor)); // biggest valid fuel
const pushBack = (w: World, v: Value | null) => { if (v) w.pool.push({ id: w.nextId++, value: v, x: 0, y: 0 }); };

/** A generous fuel farm: balanced multiplication trees of several depths so the
 *  loose pool always holds fuel at a range of grades (1s, 256s, 65536s, …). */
function buildFuelFarm(world: World): void {
  const place = (k: CellKind, x: number, y: number) => placeCell(world, k, x, y);
  let sc = 0;
  const succ: number[] = [];
  for (let i = 0; i < 24; i++) succ.push(place('successor', 0, i * 8));
  const nextS = () => succ[sc++ % succ.length];
  const tree = (depth: number, ox: number): void => {
    const build = (level: number, idx: number): number => {
      if (level === 0) {
        const a = place('addition', ox + 160, idx * 30);
        placePipe(world, nextS(), a, 0, false); placePipe(world, nextS(), a, 1, false); placePipe(world, nextS(), a, -1, true);
        return a;
      }
      const l = build(level - 1, idx * 2), r = build(level - 1, idx * 2 + 1);
      const m = place('multiplication', ox + 160 + level * 150, idx * 30);
      placePipe(world, l, 0, m, 0, false); placePipe(world, r, 0, m, 1, false);
      return m;
    };
    build(depth, 0);
  };
  // Two depth-3 trees (256s) + one depth-4 (65536s) → fuel across grades.
  tree(3, 0); tree(3, 700);
}

/** Build every cell instantly — this experiment tests the ACTIVE strategy, not
 *  build time, so we skip the (geometric) construction wait. */
function buildAll(world: World): void {
  for (const c of world.cells.values()) {
    c.buildProgress = c.buildWork;
    c.built = true;
  }
}

function frontier(world: World): number {
  let b = 0;
  for (const bl of world.pool) b = Math.max(b, mag(bl.value).toNumber());
  for (const c of world.cells.values()) {
    for (const o of c.operands) if (o) b = Math.max(b, mag(o).toNumber());
    if (c.op) for (const e of c.op.emits) b = Math.max(b, mag(e.value).toNumber());
  }
  return b;
}

function run(strategy: 'spread' | 'concentrate', rate: number, ticks: number): { frontier: number; actions: number; reached: number } {
  const world = createWorld(DEFAULT_TUNING);
  buildFuelFarm(world);
  const N = strategy === 'spread' ? 4 : 1;
  const fmults: number[] = [];
  for (let i = 0; i < N; i++) fmults.push(placeCell(world, 'multiplication', 2400, (i - N / 2) * 90));
  buildAll(world);

  let budget = 0, actions = 0;
  const cap = Math.max(3, rate);
  const act = (fn: () => void): boolean => { if (budget < 1) return false; budget -= 1; actions++; fn(); return true; };

  function feedIdle(fm: number): boolean {
    const c = world.cells.get(fm)!;
    if (c.operands[0] === null) { const f = takeLargest(world); if (f) { if (act(() => feedOperand(world, fm, 0, f))) return true; pushBack(world, f); } return false; }
    if (c.operands[1] === null) { const m = takeModerate(world, 1000); if (m) { if (act(() => feedOperand(world, fm, 1, m))) return true; pushBack(world, m); } return false; }
    return false;
  }
  function manage(): void {
    let prog = true;
    while (budget >= 1 && prog) {
      prog = false;
      for (const fm of fmults) {
        if (budget < 1) break;
        const c = world.cells.get(fm)!;
        if (c.op === null) { if (feedIdle(fm)) prog = true; }
        else {
          // CONCENTRATE pours all available APM into fuelling the one big op
          // (its demand grows as digits³ → never saturates). SPREAD fuels once.
          const f = takeFuelBig(world, c.op.grade);
          if (f) { if (act(() => injectFuel(world, fm, f))) prog = true; else pushBack(world, f); }
        }
      }
    }
    while (world.pool.length > 300) { const x = take(world, (a, b) => a.lt(b), () => true); const y = take(world, (a, b) => a.lt(b), () => true); if (!x || !y) { pushBack(world, x); pushBack(world, y); break; } pushBack(world, valueOf(mag(x).add(mag(y)).toNumber())); }
  }

  const TARGET = 1e30;
  let reached = Infinity;
  for (let t = 1; t <= ticks; t++) {
    budget = Math.min(cap, budget + rate);
    manage();
    tick(world, 1);
    if (frontier(world) >= TARGET) { reached = t; break; } // early stop (keeps numbers small/fast)
  }
  return { frontier: frontier(world), actions, reached };
}

function main(): void {
  let ticks = 9000;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i] === '--ticks') ticks = Number(a[++i]);
  const fmt = (x: number) => (!Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US'));

  console.log(`Smart vs naive — FRONTIER reached in ${ticks} ticks (same generous fuel farm):\n`);
  console.log('  actions/sec |  spread frontier  | concentrate frontier');
  console.log('  ------------+-------------------+---------------------');
  for (const r of [1, 3, 10, 30]) {
    const s = run('spread', r, ticks);
    const c = run('concentrate', r, ticks);
    console.log(`  ${String(r).padStart(11)} | ${fmt(s.frontier).padStart(17)} | ${fmt(c.frontier).padStart(19)}`);
  }
  console.log('\n  If concentrate gets FASTER with rate while spread does not → a smart');
  console.log('  superhuman player IS rewarded: concentrate one frontier and out-fuel it.');
}

main();
