// sim/manager.ts
//
// A MANAGING agent — the test of your hypothesis: does a factory that only
// works with "constant fiddling and rethinking" actually climb past the static
// plateau? Unlike factory-agent.ts (build once, run), this agent has the verbs
// a player has — it actively SHUTTLES loose blocks into cells (instant manual
// handling, as in the real game), amplifies the frontier, fuels working ops,
// and REBALANCES (places/removes cells, reroutes) when it spots a bottleneck.
//
// A piped successor bank produces the raw 1s; everything strategic is hand-
// managed. It logs the management actions (place / remove / feed / fuel) and
// reports the frontier (biggest single number) over time — the real "numbers
// go big" metric, distinct from Total Score (which always rises trivially).
//
// Usage: node sim/manager.ts [--ticks 20000] [--trace]

import {
  createWorld,
  placeCell,
  removeCell,
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

const counts = { place: 0, remove: 0, feed: 0, fuel: 0, rethink: 0 };
const mag = (v: Value) => valueMagnitude(v);

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

function main(): void {
  let ticks = 20000;
  let trace = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--trace') trace = true;
  }

  const world = createWorld(DEFAULT_TUNING);
  const have = (k: CellKind) => [...world.cells.values()].filter((c) => c.kind === k).length;
  function ensure(kind: CellKind, n: number): void {
    while (have(kind) < n) {
      placeCell(world, kind, 0, 0);
      counts.place++;
    }
  }
  // Initial roster — a modest factory; the manager grows/rebalances it.
  ensure('successor', 6);
  ensure('addition', 3);
  ensure('multiplication', 3);
  ensure('exponentiation', 1);

  // --- Management policy, run every tick (the "constant fiddling") ----------
  function manage(): void {
    for (const cell of world.cells.values()) {
      if (!cell.built || cell.kind === 'successor') continue;
      if (cell.op !== null) {
        const f = takeFuel(world, cell.op.grade); // keep working ops fuelled
        if (f) { injectFuel(world, cell.id, f); counts.fuel++; }
        continue;
      }
      if (cell.kind === 'addition') {
        // Consolidate the smallest loose into bigger denominations (build fuel
        // grades + operands), keeping a reserve so ops don't starve.
        if (world.pool.length > 6) {
          const x = takeSmallest(world); const y = takeSmallest(world);
          if (x && y) { feedOperand(world, cell.id, 0, x); feedOperand(world, cell.id, 1, y); counts.feed += 2; }
          else { pushBack(world, x); pushBack(world, y); }
        }
      } else if (cell.kind === 'multiplication') {
        // Amplify the frontier: combine the two biggest blocks.
        const x = takeLargest(world); const y = takeLargest(world);
        if (x && y && mag(x).gte(2) && mag(y).gte(2)) { feedOperand(world, cell.id, 0, x); feedOperand(world, cell.id, 1, y); counts.feed += 2; }
        else { pushBack(world, x); pushBack(world, y); }
      } else if (cell.kind === 'exponentiation') {
        const h = takeLargest(world);
        if (h && mag(h).gte(8) && mag(h).lte(2000)) { feedOperand(world, cell.id, 0, valueOf(2)); feedOperand(world, cell.id, 1, h); counts.feed += 2; }
        else pushBack(world, h);
      }
    }
  }

  // --- Rebalance / rethink, periodically (places, removes, shifts capacity) -
  function rethink(): void {
    counts.rethink++;
    const loose = world.pool.length;
    // Flooding with raw material → shift capacity from production to amplifying
    // (remove a successor, add a multiplication). The factory is re-thought.
    if (loose > 1200) {
      const succ = [...world.cells.values()].find((c) => c.kind === 'successor');
      if (succ && have('successor') > 3) { removeCell(world, succ.id); counts.remove++; }
      ensure('multiplication', have('multiplication') + 1);
    } else if (loose < 200) {
      // Starved → add raw production.
      ensure('successor', have('successor') + 1);
    }
    // Consolidate excess small blocks so the pool stays bounded & scannable.
    while (world.pool.length > 1500) {
      const x = takeSmallest(world); const y = takeSmallest(world);
      if (!x || !y) { pushBack(world, x); pushBack(world, y); break; }
      pushBack(world, valueOf(mag(x).add(mag(y)).toNumber()));
    }
  }

  console.log('Time-as-Labor — managing agent (active fiddling: shuttle + rebalance + remove)\n');
  console.log('  tick |   time | score        | FRONTIER (biggest) | cells | loose');
  console.log('  -----+--------+--------------+--------------------+-------+------');

  const secs = (t: number) => (t < 90 ? `${t}s` : t < 5400 ? `${(t / 60).toFixed(1)}m` : `${(t / 3600).toFixed(1)}h`);
  const fmt = (x: number) => (!Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US'));
  const frontier = (): number => {
    let b = 0;
    for (const bl of world.pool) b = Math.max(b, mag(bl.value).toNumber());
    for (const c of world.cells.values()) {
      for (const o of c.operands) if (o) b = Math.max(b, mag(o).toNumber());
      if (c.op) for (const e of c.op.emits) b = Math.max(b, mag(e.value).toNumber());
    }
    return b;
  };
  const sample = Math.max(1, Math.floor(ticks / 20));

  for (let t = 1; t <= ticks; t++) {
    manage();
    if (t % 200 === 0) rethink();
    tick(world, 1);
    if (trace && t % sample === 0) {
      console.log(`  ${String(t).padStart(5)} | ${secs(t).padStart(6)} | ${fmt(totalScore(world).toNumber()).padStart(12)} | ${fmt(frontier()).padStart(18)} | ${String(world.cells.size).padStart(5)} | ${world.pool.length}`);
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  final score:    ${fmt(totalScore(world).toNumber())}`);
  console.log(`  FRONTIER:       ${fmt(frontier())}   ← biggest single number (the real goal)`);
  console.log(`  factory size:   ${world.cells.size} cells`);
  console.log(`  mgmt actions:   ${Object.entries(counts).map(([k, n]) => `${k}:${n}`).join(', ')}`);
  console.log(`  loose blocks:   ${world.pool.length}`);
}

main();
