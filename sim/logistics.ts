// sim/logistics.ts
//
// Logistics-aware pacing tool. Where sim/agent.ts measures the PRODUCTION
// economy with free routing, this one puts transport in the loop: it builds a
// real piped factory in the engine and measures how fast a builder can run
// when its fuel must be DELIVERED over distance, through a finite number of
// pipes, optionally boosted by accelerators.
//
// Topology (the design's areas, minimal but real):
//   [fuel plant] a multiplication fed 10×10 → 100s (grade fuel)
//        │  k parallel fuel pipes, length = distance, optional accelerator
//        ▼
//   [builder]    a multiplication fed 1000×1000 → 10⁶, fuelled by the arriving
//                100s. Its op rate is gated by fuel arrival = the logistics.
//
// The point isn't optimal play — it's to read how distance / parallelism /
// accelerators move the throughput, so we can feel (and tune) the transport
// layer. Operands are hand-staged (free) to isolate the FUEL-delivery question,
// which the design says is the central one ("not 'do I have fuel' but 'can I
// keep it flowing'").
//
// Usage:
//   node sim/logistics.ts                 # default sweep over distance
//   node sim/logistics.ts --distance 800 --pipes 2 --accel 1 --ticks 6000

import {
  createWorld,
  placeCell,
  placePipe,
  feedOperand,
  injectFuel,
  tick,
  getCell,
  totalScore,
} from '../core/engine.ts';
import { valueOf } from '../core/value.ts';
import { DEFAULT_TUNING } from '../core/time.ts';

interface Opts {
  distance: number;
  pipes: number;
  accel: number; // accelerator charge level (0 = none)
  ticks: number;
}

function run(o: Opts): { score: number; firstFuelTick: number } {
  const world = createWorld(DEFAULT_TUNING);
  const plant = placeCell(world, 'multiplication', 0, 0);
  const builder = placeCell(world, 'multiplication', o.distance, 0);
  let accel = -1;
  if (o.accel > 0) accel = placeCell(world, 'accelerator', o.distance / 2, 0);
  for (let i = 0; i < o.pipes; i++) placePipe(world, plant, 0, builder, -1, { fuel: true });

  // build everything
  while ([plant, builder, ...(accel >= 0 ? [accel] : [])].some((id) => !getCell(world, id)!.built)) tick(world, 1);
  if (accel >= 0) injectFuel(world, accel, valueOf(o.accel)); // charge the accelerator

  let firstFuelTick = -1;
  for (let t = 1; t <= o.ticks; t++) {
    // keep the fuel plant making 100s
    if (getCell(world, plant)!.op === null) {
      feedOperand(world, plant, 0, valueOf(10));
      feedOperand(world, plant, 1, valueOf(10));
    }
    // keep the builder's operands staged (free — isolating the fuel question)
    const b = getCell(world, builder)!;
    if (b.op === null) {
      feedOperand(world, builder, 0, valueOf(1000));
      feedOperand(world, builder, 1, valueOf(1000));
    }
    if (accel >= 0) injectFuel(world, accel, valueOf(o.accel * 0.02)); // top up the charge
    tick(world, 1);
    if (firstFuelTick < 0 && b.op && b.op.progress.toNumber() > DEFAULT_TUNING.baseRate * t * 1.5) {
      firstFuelTick = t; // op is advancing faster than baseRate → fuel is arriving
    }
  }
  return { score: totalScore(world).toNumber(), firstFuelTick };
}

function fmt(x: number): string {
  return Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
}

function main(): void {
  const o: Opts = { distance: -1, pipes: 1, accel: 0, ticks: 6000 };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--distance') o.distance = Number(a[++i]);
    else if (a[i] === '--pipes') o.pipes = Number(a[++i]);
    else if (a[i] === '--accel') o.accel = Number(a[++i]);
    else if (a[i] === '--ticks') o.ticks = Number(a[++i]);
  }

  console.log('Time-as-Labor — logistics pacing (fuel-delivery-gated builder)');
  console.log(`builder op = 1000×1000 → 10⁶ (fuel grade ≈ 5.6); fuel = 100-blocks from the plant\n`);

  if (o.distance >= 0) {
    const r = run(o);
    console.log(`distance=${o.distance} pipes=${o.pipes} accel=${o.accel} ticks=${o.ticks}`);
    console.log(`  final score: ${fmt(r.score)}  (≈ ${fmt(r.score / 1e6)} builder ops)`);
    return;
  }

  // Default: sweep distance × {1 pipe, 3 pipes, 1 pipe + accelerator}.
  console.log(`Builder output over ${o.ticks} ticks (more = better throughput):`);
  console.log('  distance | 1 pipe       | 3 pipes      | 1 pipe + accel');
  console.log('  ---------+--------------+--------------+---------------');
  for (const d of [0, 300, 800, 2000]) {
    const a1 = run({ distance: d, pipes: 1, accel: 0, ticks: o.ticks });
    const a3 = run({ distance: d, pipes: 3, accel: 0, ticks: o.ticks });
    const aa = run({ distance: d, pipes: 1, accel: 5e6, ticks: o.ticks });
    console.log(
      `  ${String(d).padStart(8)} | ${fmt(a1.score).padStart(12)} | ${fmt(a3.score).padStart(12)} | ${fmt(aa.score).padStart(13)}`,
    );
  }
  console.log('\n  (a far builder starves on one pipe; parallel pipes and accelerators recover it)');
}

main();
