// sim/factory-agent.ts
//
// A WIDTH-AWARE fully-faithful play agent. The squaring *chain* plateaus
// because each stage is 2-in/1-out (throughput halves per stage) and the deep
// stage starves. The fix is a balanced binary MULTIPLICATION TREE: each node is
// fed by two distinct children (one per operand port — which also avoids the
// fan-out problem), and the tree's width doubles toward the base, exactly
// matching the 2-in/1-out rule so the root stays fed. Depth D → root ≈ 2^(2^D)
// (D=4 → 65,536; D=5 → ~4.3e9; D=6 → ~1.8e19), SUSTAINED rather than one-shot.
//
// Everything is piped (operands AND fuel), real build times, transit, grades,
// the freeze. Deep nodes outgrow 1s-fuel (the grade wall), so we refine fuel by
// tapping a lower tree level (its products are the right grade). Instrumented:
// build timeline, factory size, action count, climb.
//
// Usage: node sim/factory-agent.ts [--depth 5] [--ticks 30000] [--trace]

import {
  createWorld,
  placeCell,
  placePipe,
  tick,
  totalScore,
  getCell,
  type World,
  type CellKind,
} from '../core/engine.ts';
import { valueMagnitude } from '../core/value.ts';
import { DEFAULT_TUNING } from '../core/time.ts';

interface Action { tick: number; kind: string; detail: string; }
const log: Action[] = [];
let currentTick = 0;
function rec(kind: string, detail: string): void { log.push({ tick: currentTick, kind, detail }); }

function place(world: World, kind: CellKind, x: number, y: number, why: string): number {
  const id = placeCell(world, kind, x, y);
  rec('place', `${kind} #${id} — ${why}`);
  return id;
}
function pipe(world: World, from: number, to: number, port: number, fuel: boolean): void {
  placePipe(world, from, 0, to, port, { fuel });
  rec('pipe', `#${from}→#${to}${fuel ? '(fuel)' : `[${port}]`}`);
}
function secs(t: number): string {
  if (t < 90) return `${t}s`;
  if (t < 5400) return `${(t / 60).toFixed(1)}m`;
  return `${(t / 3600).toFixed(1)}h`;
}
function fmt(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  return Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
}

// A node in the built tree: its output cell, and its depth (for fuel grading).
interface Node { out: number; depth: number; }

function main(): void {
  let depth = 4; // depth 4 (root 65,536) fills & sustains; 5+ needs a bigger base
  let ticks = 30000;
  let trace = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--depth') depth = Number(a[++i]);
    else if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--trace') trace = true;
  }

  const world = createWorld(DEFAULT_TUNING);

  // A shared successor bank — leaves draw operands + fuel from it (round-robin
  // distributes fairly now). Sized to the base width so it doesn't starve.
  const leaves = 1 << depth;
  const nSucc = Math.min(64, Math.max(8, leaves));
  const succ: number[] = [];
  for (let i = 0; i < nSucc; i++) succ.push(place(world, 'successor', 0, (i - nSucc / 2) * 18, 'fuel farm'));
  let sc = 0;
  const nextSucc = () => succ[sc++ % nSucc];

  // Track all nodes by level so deep nodes can be fuelled from a lower level's
  // (correctly-graded) products instead of starving on 1s.
  const byLevel: Node[][] = [];
  function addNode(level: number, n: Node): void {
    (byLevel[level] ??= []).push(n);
  }

  // Recursively build the tree; returns the node whose output carries the value.
  function build(level: number, idx: number): Node {
    const x = 220 + (depth - level) * 200;
    const span = 1 << level;
    const y = (idx - span / 2 + 0.5) * (560 / Math.max(1, span));
    if (level === 0) {
      const adder = place(world, 'addition', x, y, `leaf ${idx}: 1+1→2`);
      pipe(world, nextSucc(), adder, 0, false);
      pipe(world, nextSucc(), adder, 1, false);
      pipe(world, nextSucc(), adder, -1, true); // 1s fuel a tiny add (grade ~1)
      const node = { out: adder, depth: 0 };
      addNode(0, node);
      return node;
    }
    const left = build(level - 1, idx * 2);
    const right = build(level - 1, idx * 2 + 1);
    const m = place(world, 'multiplication', x, y, `merge L${level}: square`);
    pipe(world, left.out, m, 0, false); // one child per operand port — no fan-out issue
    pipe(world, right.out, m, 1, false);
    const node = { out: m, depth: level };
    addNode(level, node);
    return node;
  }

  const root = build(depth, 0);
  rec('wire', `tree built: depth ${depth}, ${leaves} leaves, root #${root.out}`);

  // Fuel the merge mults. Shallow nodes accept 1s; deeper ones need bigger fuel
  // (the grade wall), so we tap a node two levels down — its products are the
  // right grade — into each deep node's fuel port.
  for (let level = 1; level <= depth; level++) {
    for (const n of byLevel[level]) {
      if (level <= 2) {
        pipe(world, nextSucc(), n.out, -1, true); // 1s suffice
      } else {
        const donors = byLevel[level - 2]; // products ≈ right grade for this level
        const donor = donors[Math.floor(Math.random() * donors.length)];
        pipe(world, donor.out, n.out, -1, true);
      }
    }
  }
  rec('wire', 'fuel wired (1s shallow; tapped lower levels for deep nodes)');

  console.log(`Time-as-Labor — width-aware factory agent (binary multiplication tree)\n`);
  console.log(`target root ≈ 2^(2^${depth}) ; leaves ${leaves} ; successors ${nSucc}\n`);

  const sample = Math.max(1, Math.floor(ticks / 20));
  const traceRows: string[] = [];
  for (let t = 1; t <= ticks; t++) {
    currentTick = t;
    tick(world, 1);
    if (trace && t % sample === 0) {
      let biggest = 0;
      for (const b of world.pool) biggest = Math.max(biggest, valueMagnitude(b.value).toNumber());
      for (const c of world.cells.values())
        if (c.op) for (const e of c.op.emits) biggest = Math.max(biggest, valueMagnitude(e.value).toNumber());
      traceRows.push(
        `  ${secs(t).padStart(6)} | score ${fmt(totalScore(world).toNumber()).padStart(12)} | biggest ${fmt(biggest).padStart(10)} | loose ${world.pool.length}`,
      );
    }
  }

  const byKind: Record<string, number> = {};
  for (const ev of log) byKind[ev.kind] = (byKind[ev.kind] ?? 0) + 1;
  let biggest = 0;
  for (const b of world.pool) biggest = Math.max(biggest, valueMagnitude(b.value).toNumber());
  for (const c of world.cells.values())
    if (c.op) for (const e of c.op.emits) biggest = Math.max(biggest, valueMagnitude(e.value).toNumber());

  if (trace) {
    console.log('State trace:');
    for (const r of traceRows) console.log(r);
    console.log('');
  }
  console.log('Summary:');
  console.log(`  final score:   ${fmt(totalScore(world).toNumber())}`);
  console.log(`  biggest block: ${fmt(biggest)}`);
  console.log(`  factory size:  ${world.cells.size} cells, ${world.pipes.size} pipes`);
  console.log(`  actions taken: ${log.length} (${Object.entries(byKind).map(([k, n]) => `${k}:${n}`).join(', ')})`);
  console.log(`  loose blocks:  ${world.pool.length}`);
}

main();
