/**
 * Tests for the Time-as-Labor headless engine (`core/engine.ts`).
 *
 * These exercise the whole economic loop end-to-end, headlessly: cells build
 * over time, operations take time proportional to magnitude, fuel buys speed,
 * pipes carry blocks over time-and-distance, and Total Score climbs. This is
 * the "simulation of the system" — what lets us fully understand and test the
 * game without a browser.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'break_eternity.js';
import { valueOf, valueMul, valueMagnitude, VALUE_ONE, type Value } from './value.ts';
import { DEFAULT_TUNING, buildWork, operationWork, type TimeTuning } from './time.ts';
import {
  createWorld,
  placeCell,
  placePipe,
  removeCell,
  feedOperand,
  injectFuel,
  depositToWarehouse,
  addLoose,
  moveLoose,
  takeLooseById,
  tick,
  totalScore,
  poolCountOf,
  poolSize,
  getCell,
  buildFraction,
  opFraction,
  currentBuildSlots,
} from './engine.ts';

const score = (w: ReturnType<typeof createWorld>) => totalScore(w).toNumber();

/** Run `n` ticks. */
function run(world: ReturnType<typeof createWorld>, n: number) {
  for (let i = 0; i < n; i++) tick(world, 1);
}

// --- Construction (Phase 2) ------------------------------------------------

test('a placed cell is inert until built, then becomes active', () => {
  const w = createWorld();
  const id = placeCell(w, 'successor');
  const cell = getCell(w, id)!;
  assert.equal(cell.built, false);
  assert.equal(buildFraction(cell), 0);

  // Build work for the first successor at baseRate=1.
  const need = buildWork(0).toNumber();
  run(w, Math.ceil(need) - 1);
  assert.equal(getCell(w, id)!.built, false, 'not done one tick early');
  run(w, 2);
  assert.equal(getCell(w, id)!.built, true, 'built after enough ticks');
});

test('build time escalates with how many of a kind you already own', () => {
  const w = createWorld();
  const a = placeCell(w, 'successor');
  const b = placeCell(w, 'successor');
  assert.ok(
    getCell(w, b)!.buildWork.gt(getCell(w, a)!.buildWork),
    'the second successor takes longer to build',
  );
});

test('fuel accelerates construction', () => {
  const w = createWorld();
  const slow = placeCell(w, 'successor');
  // Identical fresh world, but burn a big fuel block into the build.
  const w2 = createWorld();
  const fast = placeCell(w2, 'successor');
  injectFuel(w2, fast, valueOf(1e9)); // a 10-digit block → ~10 work instantly

  let slowTicks = 0;
  while (!getCell(w, slow)!.built && slowTicks < 10000) {
    tick(w, 1);
    slowTicks++;
  }
  let fastTicks = 0;
  while (!getCell(w2, fast)!.built && fastTicks < 10000) {
    tick(w2, 1);
    fastTicks++;
  }
  assert.ok(fastTicks < slowTicks, 'fuelled build finishes sooner');
});

// --- The clock: operations take time (Phase 1) -----------------------------

test('successor taps the river and produces 1s over time', () => {
  const w = createWorld();
  const id = placeCell(w, 'successor');
  // Build it.
  while (!getCell(w, id)!.built) tick(w, 1);
  assert.equal(poolCountOf(w, 1), 0, 'no output yet');

  // One successor op produces a single 1. Work to write a "1":
  const opTicks = Math.ceil(operationWork(VALUE_ONE, 'successor').toNumber());
  run(w, opTicks + 1);
  assert.ok(poolCountOf(w, 1) >= 1, 'a 1 has been produced');
});

test('successor is the only net-positive source: score climbs from nothing', () => {
  const w = createWorld();
  const id = placeCell(w, 'successor');
  while (!getCell(w, id)!.built) tick(w, 1);
  const before = score(w);
  run(w, 200);
  assert.ok(score(w) > before, 'score grows as 1s accumulate');
  assert.ok(score(w) >= 1);
});

test('bigger outputs take longer to compute than smaller ones', () => {
  // Multiplication producing 1e6 vs producing 100.
  const small = freshMul(valueOf(10), valueOf(10)); // 100
  const big = freshMul(valueOf(1000), valueOf(1000)); // 1e6
  assert.ok(big.ticks > small.ticks, 'the larger product takes longer to write');
});

function freshMul(a: Value, b: Value): { ticks: number } {
  const w = createWorld();
  const id = placeCell(w, 'multiplication');
  while (!getCell(w, id)!.built) tick(w, 1);
  feedOperand(w, id, 0, a);
  feedOperand(w, id, 1, b);
  const product = valueMagnitude(valueMul(a, b)).toNumber();
  let ticks = 0;
  while (poolCountOf(w, product) === 0 && ticks < 100000) {
    tick(w, 1);
    ticks++;
  }
  return { ticks };
}

test('addition conserves score (plumbing); multiplication amplifies it', () => {
  // Addition: 3 + 4 -> 7. Score unchanged (3+4 == 7).
  const wa = createWorld();
  const add = placeCell(wa, 'addition');
  while (!getCell(wa, add)!.built) tick(wa, 1);
  feedOperand(wa, add, 0, valueOf(3));
  feedOperand(wa, add, 1, valueOf(4));
  const beforeAdd = score(wa); // 7 (both staged)
  run(wa, 2000);
  assert.ok(poolCountOf(wa, 7) >= 1, 'produced the sum');
  assert.equal(score(wa), beforeAdd, 'addition is score-neutral');

  // Multiplication: 3 × 4 -> 12. Score jumps from 7 to 12.
  const wm = createWorld();
  const mul = placeCell(wm, 'multiplication');
  while (!getCell(wm, mul)!.built) tick(wm, 1);
  feedOperand(wm, mul, 0, valueOf(3));
  feedOperand(wm, mul, 1, valueOf(4));
  const beforeMul = score(wm); // 7
  run(wm, 2000);
  assert.ok(poolCountOf(wm, 12) >= 1, 'produced the product');
  assert.ok(score(wm) > beforeMul, 'multiplication grows score');
  assert.equal(score(wm), 12);
});

test('score does not dip while an operation is in progress (inputs are held)', () => {
  const w = createWorld();
  const mul = placeCell(w, 'multiplication');
  while (!getCell(w, mul)!.built) tick(w, 1);
  feedOperand(w, mul, 0, valueOf(1000));
  feedOperand(w, mul, 1, valueOf(1000));
  const staged = score(w); // 2000
  tick(w, 1); // op starts; inputs consumed but held
  assert.equal(score(w), staged, 'held inputs still count mid-computation');
  // ...and never drops below the held value until the (larger) result lands.
  for (let i = 0; i < 50; i++) {
    tick(w, 1);
    assert.ok(score(w) >= staged * 0.999, 'no scary mid-op dip');
  }
});

// --- Fuel = value, with grades (the converged model) -----------------------

test('fuel (at or above grade) makes an operation finish in fewer ticks', () => {
  const target = valueOf(1e9).n.toNumber(); // big output → long op (exp)

  function ticksToFinish(fuelEachTick: number | null): number {
    const w = createWorld();
    const f = placeCell(w, 'exponentiation');
    while (!getCell(w, f)!.built) tick(w, 1);
    feedOperand(w, f, 0, valueOf(10));
    feedOperand(w, f, 1, valueOf(9)); // 10^9
    let t = 0;
    while (poolCountOf(w, target) === 0 && t < 200000) {
      if (fuelEachTick !== null) injectFuel(w, f, valueOf(fuelEachTick));
      tick(w, 1);
      t++;
    }
    return t;
  }
  // 1000 is comfortably above the exp op's grade; value-fuel adds 1000/tick.
  assert.ok(ticksToFinish(1000) < ticksToFinish(null), 'graded fuel beats baseRate alone');
});

test('fuel below the op grade is REFUSED and returned loose (fuel grades)', () => {
  const w = createWorld();
  const f = placeCell(w, 'exponentiation');
  while (!getCell(w, f)!.built) tick(w, 1);
  feedOperand(w, f, 0, valueOf(10));
  feedOperand(w, f, 1, valueOf(9)); // 10^9 → a high grade
  tick(w, 1); // op starts
  const before = opFraction(getCell(w, f)!);
  // A value-1 block is far below this op's grade — it must be refused.
  injectFuel(w, f, VALUE_ONE);
  assert.equal(poolCountOf(w, 1), 1, 'sub-grade fuel lands back in the pool');
  const after = opFraction(getCell(w, f)!);
  assert.ok(after - before < 0.01, 'refused fuel did not accelerate the op');
});

test('a tiny op DOES accept value-1 fuel (the base fuel still works low down)', () => {
  const w = createWorld();
  const a = placeCell(w, 'addition');
  while (!getCell(w, a)!.built) tick(w, 1);
  feedOperand(w, a, 0, valueOf(500));
  feedOperand(w, a, 1, valueOf(499)); // 999, a 3-digit add → low grade (~1)
  tick(w, 1); // op starts
  injectFuel(w, a, VALUE_ONE);
  // accepted → consumed (not returned to pool as a loose 1)
  assert.equal(poolCountOf(w, 1), 0, 'a 1 is valid fuel for the smallest ops');
});

// --- The 2026-06-10 fuel-economy lock (sim-tuned; HANDOVER §0) --------------

test('lock: amplifiers creep at HALF baseRate; plumbing (addition) runs at full', () => {
  const w = createWorld();
  const m = placeCell(w, 'multiplication');
  while (!getCell(w, m)!.built) tick(w, 1);
  feedOperand(w, m, 0, valueOf(1000));
  feedOperand(w, m, 1, valueOf(1000)); // 10⁶ output → a long op
  tick(w, 1); // op starts (and accrues its first slice)
  const p1 = getCell(w, m)!.op!.progress;
  tick(w, 1);
  const p2 = getCell(w, m)!.op!.progress;
  const ampPerTick = DEFAULT_TUNING.baseRate * DEFAULT_TUNING.amplifierBaseRateScale;
  assert.equal(p2.sub(p1).toNumber(), ampPerTick, 'multiplication accrues scaled baseRate');
  assert.equal(DEFAULT_TUNING.amplifierBaseRateScale, 0.5, 'the locked value');

  const a = placeCell(w, 'addition');
  while (!getCell(w, a)!.built) tick(w, 1);
  feedOperand(w, a, 0, valueOf(5e5));
  feedOperand(w, a, 1, valueOf(5e5)); // 10⁶ → 7 digits → 49 work, multi-tick
  tick(w, 1);
  const q1 = getCell(w, a)!.op!.progress;
  tick(w, 1);
  const q2 = getCell(w, a)!.op!.progress;
  assert.equal(q2.sub(q1).toNumber(), DEFAULT_TUNING.baseRate, 'addition keeps the full free base');
});

test('lock: overpaying fuel has √ diminishing returns (right-sized streams are optimal)', () => {
  const w = createWorld();
  const f = placeCell(w, 'exponentiation');
  while (!getCell(w, f)!.built) tick(w, 1);
  feedOperand(w, f, 0, valueOf(10));
  feedOperand(w, f, 1, valueOf(9)); // 10⁹ → work 10⁴, grade ≈ 30
  tick(w, 1); // op starts
  const cell = getCell(w, f)!;
  const grade = cell.op!.grade;
  const before = cell.op!.progress;
  const v = grade.mul(100).toNumber(); // a 100×-grade block
  injectFuel(w, f, valueOf(v));
  const gained = cell.op!.progress.sub(before);
  // effective = grade^(1-p) · V^p with the locked p = 0.5 → √(grade·V) = 10·grade.
  assert.equal(DEFAULT_TUNING.fuelOverpayExp, 0.5, 'the locked value');
  const expected = grade.mul(new Decimal(v)).sqrt();
  assert.ok(gained.sub(expected).abs().div(expected).toNumber() < 1e-9, 'engine applies the overpay law');
  assert.ok(gained.toNumber() < v * 0.2, 'a 100×-grade block buys ~10% of its value, not 100%');
});

// --- Build slots: one pencil — construction is a QUEUE, not a dump ----------

const SLOTS_TUNING: TimeTuning = { ...DEFAULT_TUNING, buildSlots: 1 };

test('build slots: with one pencil, the second cell waits its turn', () => {
  const w = createWorld(SLOTS_TUNING);
  const a = placeCell(w, 'successor');
  const b = placeCell(w, 'successor');
  run(w, Math.ceil(buildWork(0).toNumber()) + 1); // exactly enough for the FIRST
  assert.equal(getCell(w, a)!.built, true, 'first build completes');
  assert.equal(getCell(w, b)!.built, false, 'second has been queued');
  assert.ok(getCell(w, b)!.buildProgress.lte(buildWork(1).mul(0.2)), 'queued cell barely progressed');
  run(w, Math.ceil(buildWork(1).toNumber()) + 1); // now ITS turn runs
  assert.equal(getCell(w, b)!.built, true, 'the queue advances');
});

test('build slots: fuel rushes a QUEUED build — paid parallelism', () => {
  const w = createWorld(SLOTS_TUNING);
  placeCell(w, 'successor'); // occupies the only pencil
  const b = placeCell(w, 'addition');
  tick(w, 1);
  injectFuel(w, b, valueOf(1000)); // build fuel is 1:1 and grade-agnostic
  assert.equal(getCell(w, b)!.built, true, 'a paid build skips the queue');
});

test('build slots: frontier milestones grant more pencils', () => {
  const w = createWorld(SLOTS_TUNING);
  assert.equal(currentBuildSlots(w), 1);
  addLoose(w, valueOf(1e6)); // peak crosses the first slot milestone
  assert.equal(currentBuildSlots(w), 2);
  const a = placeCell(w, 'successor');
  const b = placeCell(w, 'successor');
  run(w, 3);
  assert.ok(getCell(w, a)!.buildProgress.gt(0) && getCell(w, b)!.buildProgress.gt(0), 'two sketch at once');
});

test('build slots: off by default — everything still builds in parallel', () => {
  const w = createWorld(); // DEFAULT_TUNING: buildSlots 0 = unlimited
  const ids = Array.from({ length: 5 }, () => placeCell(w, 'successor'));
  run(w, 3);
  for (const id of ids) assert.ok(getCell(w, id)!.buildProgress.gt(0), 'no queue when the rule is off');
});

// --- Powered logistics: accelerator charge carries transit ------------------

const CARRY_TUNING: TimeTuning = { ...DEFAULT_TUNING, accelChargeCarry: 1 };

test('powered logistics: a charged accelerator un-freezes big blocks on pipes', () => {
  // A 10⁸ block over a 300px pipe is frozen by the transit law (the pacing
  // guard above pins that). With carry on and a charged accelerator covering
  // the pipe, the SAME delivery arrives in ordinary time.
  function arrivesWithin(charge: number | null, ticks: number): boolean {
    const w = createWorld(CARRY_TUNING);
    const src = placeCell(w, 'warehouse', 0, 0, { built: true });
    const dst = placeCell(w, 'addition', 300, 0, { built: true });
    if (charge !== null) {
      const accel = placeCell(w, 'accelerator', 150, 0, { built: true });
      injectFuel(w, accel, valueOf(charge));
    }
    depositToWarehouse(w, src, valueOf(1e8));
    placePipe(w, src, 0, dst, 0);
    for (let t = 0; t < ticks; t++) {
      tick(w, 1);
      if (getCell(w, dst)!.operands[0] !== null) return true;
    }
    return false;
  }
  assert.equal(arrivesWithin(null, 2000), false, 'unpowered: a 10⁸ block is frozen');
  assert.equal(arrivesWithin(1e9, 2000), true, 'charged ≥ cargo: it flows');
});

test('powered logistics: off by default — the carry law changes nothing', () => {
  const w = createWorld(); // DEFAULT_TUNING: accelChargeCarry 0
  const src = placeCell(w, 'warehouse', 0, 0, { built: true });
  const dst = placeCell(w, 'addition', 300, 0, { built: true });
  const accel = placeCell(w, 'accelerator', 150, 0, { built: true });
  injectFuel(w, accel, valueOf(1e9));
  depositToWarehouse(w, src, valueOf(1e8));
  placePipe(w, src, 0, dst, 0);
  for (let t = 0; t < 2000; t++) tick(w, 1);
  assert.equal(getCell(w, dst)!.operands[0], null, 'still frozen with the knob off');
});

test('world counters: produced and burned track emissions and fuel spends', () => {
  const w = createWorld();
  const s = placeCell(w, 'successor');
  while (!getCell(w, s)!.built) tick(w, 1);
  run(w, 10); // a few river taps → 1s emitted
  assert.ok(w.produced > 0, 'emissions counted');
  const m = placeCell(w, 'multiplication');
  while (!getCell(w, m)!.built) tick(w, 1);
  feedOperand(w, m, 0, valueOf(99));
  feedOperand(w, m, 1, valueOf(99));
  tick(w, 1);
  injectFuel(w, m, valueOf(100)); // ≥ grade → burned
  assert.ok(w.burned.gte(100), 'accepted fuel magnitude counted as burned');
});

// --- Scaffolding: exp-tier ops demand working notes, in-band only ----------

const SCAFFOLD_TUNING: TimeTuning = { ...DEFAULT_TUNING, scaffoldCoeff: 1 };

test('scaffolding: an exp op completes ONLY after its working notes are paid in-band', () => {
  const w = createWorld(SCAFFOLD_TUNING);
  const f = placeCell(w, 'exponentiation');
  while (!getCell(w, f)!.built) tick(w, 1);
  feedOperand(w, f, 0, valueOf(10));
  feedOperand(w, f, 1, valueOf(7)); // 10⁷ — above the 10⁶ floor
  tick(w, 1); // op starts
  const op = getCell(w, f)!.op!;
  // S = √(10⁷) − √(10⁶) ≈ 2162; band ≈ [S/64 ≈ 33.8, S]
  assert.ok(op.fuelRequired.gt(2000) && op.fuelRequired.lt(2300), `S ≈ 2162, got ${op.fuelRequired}`);
  assert.ok(op.scaffold !== null, 'the op carries its denomination band');

  // Let TIME complete fully — the op must still be held open by the unpaid notes.
  run(w, 9000); // work = 8⁴ = 4096 at amplifier base 0.5 → done well within this
  assert.ok(getCell(w, f)!.op !== null, 'progress alone cannot finish a scaffolded op');
  assert.equal(poolCountOf(w, 1e7), 0, 'no result emitted yet');

  // Oversized block (your finished result is not scratch paper) → refused.
  injectFuel(w, f, valueOf(5e6));
  assert.equal(poolCountOf(w, 5e6), 1, 'above-band block lands back loose');
  // Undersized for the band (but above the op GRADE ≈ 19) → also refused.
  injectFuel(w, f, valueOf(25));
  assert.equal(poolCountOf(w, 25), 1, 'below-band block lands back loose');
  assert.ok(getCell(w, f)!.op!.fuelPaid.eq(0), 'refused blocks paid nothing');

  // Two in-band notes (≈ S/2 each) pay the requirement → the op completes.
  injectFuel(w, f, valueOf(1100));
  injectFuel(w, f, valueOf(1100));
  tick(w, 1);
  assert.equal(getCell(w, f)!.op, null, 'paid in-band → op completes');
  assert.equal(poolCountOf(w, 1e7), 1, 'the result lands');
});

test('scaffolding: multiplication is NEVER scaffolded (accelerant economy only)', () => {
  const w = createWorld(SCAFFOLD_TUNING);
  const m = placeCell(w, 'multiplication');
  while (!getCell(w, m)!.built) tick(w, 1);
  feedOperand(w, m, 0, valueOf(1e5));
  feedOperand(w, m, 1, valueOf(1e5)); // 10¹⁰ output — far above the floor
  tick(w, 1);
  const op = getCell(w, m)!.op!;
  assert.ok(op.fuelRequired.eq(0), 'no requirement on mult');
  assert.equal(op.scaffold, null, 'no band on mult');
});

test('scaffolding: exp outputs at/below the floor are a free toy', () => {
  const w = createWorld(SCAFFOLD_TUNING);
  const f = placeCell(w, 'exponentiation');
  while (!getCell(w, f)!.built) tick(w, 1);
  feedOperand(w, f, 0, valueOf(10));
  feedOperand(w, f, 1, valueOf(5)); // 10⁵ ≤ the 10⁶ floor
  tick(w, 1);
  const op = getCell(w, f)!.op!;
  assert.ok(op.fuelRequired.eq(0), 'no scaffolding below the floor');
  assert.equal(op.scaffold, null);
  injectFuel(w, f, valueOf(1e6)); // ordinary graded fuel one-shots the time-work
  tick(w, 1);
  assert.equal(poolCountOf(w, 1e5), 1, 'small exp completes like any op');
});

test('fuel injected at an idle cell is returned to the pool, not wasted', () => {
  const w = createWorld();
  const id = placeCell(w, 'addition');
  while (!getCell(w, id)!.built) tick(w, 1);
  assert.equal(getCell(w, id)!.op, null);
  injectFuel(w, id, valueOf(5));
  assert.equal(poolCountOf(w, 5), 1, 'idle-cell fuel lands loose');
});

// --- Transport: time × distance (Phase 4) ----------------------------------

test('a block takes time to travel a pipe; longer pipe = longer transit', () => {
  // Use a mid-sized block (1000) so transit is above the floor and distance
  // actually registers. Source = an addition that outputs 1000 (500+500).
  function transitTicks(distance: number): number {
    const w = createWorld();
    const src = placeCell(w, 'addition', 0, 0);
    const dst = placeCell(w, 'multiplication', distance, 0);
    while (!getCell(w, src)!.built || !getCell(w, dst)!.built) tick(w, 1);
    placePipe(w, src, 0, dst, 0);
    feedOperand(w, src, 0, valueOf(500));
    feedOperand(w, src, 1, valueOf(500)); // → 1000 emitted into the pipe
    let ticks = 0;
    while (getCell(w, dst)!.operands[0] === null && ticks < 500000) {
      tick(w, 1);
      ticks++;
    }
    return ticks;
  }
  const near = transitTicks(0);
  const far = transitTicks(2400);
  assert.ok(far > near, 'a longer supply line is slower');
});

test('the canvas is a map: a big block is frozen but its small pieces flow', () => {
  // A large block crawls down a pipe (super-linear transit); a small one zips.
  function arriveTicks(fuelValue: number): number {
    const w = createWorld();
    const src = placeCell(w, 'addition', 0, 0);
    const dst = placeCell(w, 'multiplication', 200, 0);
    while (!getCell(w, src)!.built || !getCell(w, dst)!.built) tick(w, 1);
    placePipe(w, src, 0, dst, 0);
    // Stage a block at the source's output by hand: drop it loose, then it's
    // already there — instead, emit it by feeding src an op that outputs it.
    // Simpler: addLoose into the pipe isn't supported; feed src to produce it.
    // Use feedOperand on src to make `fuelValue` (a+0)... addition needs 2 ops.
    feedOperand(w, src, 0, valueOf(fuelValue));
    feedOperand(w, src, 1, valueOf(0));
    let t = 0;
    while (getCell(w, dst)!.operands[0] === null && t < 500000) {
      tick(w, 1);
      t++;
    }
    return t;
  }
  const small = arriveTicks(100);
  const big = arriveTicks(100000);
  assert.ok(big > small * 5, 'a big block is dramatically slower to move than a small one');
});

test('emit fans out fairly: one producer can feed both operand ports of a consumer', () => {
  // A successor's 1s, piped to BOTH operand ports of an addition, must fill
  // both (round-robin) so the addition fires — not starve port 1 (the bug the
  // faithful factory agent surfaced). Without fair fan-out this deadlocks.
  const w = createWorld();
  const s = placeCell(w, 'successor', 0, 0);
  const a = placeCell(w, 'addition', 150, 0);
  while (!getCell(w, s)!.built || !getCell(w, a)!.built) tick(w, 1);
  placePipe(w, s, 0, a, 0); // → operand 0
  placePipe(w, s, 0, a, 1); // → operand 1
  run(w, 400);
  assert.ok(poolCountOf(w, 2) >= 1, 'the addition fired (1+1→2), so both ports were fed');
});

test('removeCell / removePipe return held blocks to the pool (nothing destroyed)', () => {
  const w = createWorld();
  const m = placeCell(w, 'multiplication');
  while (!getCell(w, m)!.built) tick(w, 1);
  feedOperand(w, m, 0, valueOf(50));
  feedOperand(w, m, 1, valueOf(50));
  const before = score(w); // 100 staged
  removeCell(w, m);
  assert.equal(getCell(w, m), undefined, 'cell gone');
  assert.equal(score(w), before, 'its staged operands returned to the pool (score conserved)');
  assert.equal(poolCountOf(w, 50), 2);
});

test('back-pressure: a pipe into an occupied port stalls; a flowing pipe does not', () => {
  const w = createWorld();
  // Flowing case: s1, s2 → both operand ports of an addition that fires and
  // consumes, so its feed pipes keep staging successfully → never stalled.
  const s1 = placeCell(w, 'successor', 0, -40);
  const s2 = placeCell(w, 'successor', 0, 40);
  const a = placeCell(w, 'addition', 150, 0);
  while (!getCell(w, s1)!.built || !getCell(w, s2)!.built || !getCell(w, a)!.built) tick(w, 1);
  const p1 = placePipe(w, s1, 0, a, 0);
  placePipe(w, s2, 0, a, 1);
  run(w, 200);
  assert.equal(w.pipes.get(p1)!.stalled, false, 'a pipe feeding a consuming cell flows freely');

  // Blocked case: an addition with port 0 pre-occupied and never consumed; a
  // pipe into port 0 can never stage → it reads as stalled (visible back-pressure).
  const s3 = placeCell(w, 'successor', 0, 300);
  const b = placeCell(w, 'addition', 150, 300);
  while (!getCell(w, s3)!.built || !getCell(w, b)!.built) tick(w, 1);
  feedOperand(w, b, 0, valueOf(5)); // occupy port 0 (no port 1 → never fires → never clears)
  const pb = placePipe(w, s3, 0, b, 0);
  run(w, 200);
  assert.equal(w.pipes.get(pb)!.stalled, true, 'a pipe into an occupied port reads as stalled');
});

test('recentBurn lights when a cell is fuelled and decays without more fuel', () => {
  const w = createWorld();
  const m = placeCell(w, 'multiplication');
  while (!getCell(w, m)!.built) tick(w, 1);
  feedOperand(w, m, 0, valueOf(99));
  feedOperand(w, m, 1, valueOf(99)); // 99×99 → a real op with a >1 fuel grade
  tick(w, 1); // start the op
  assert.ok(getCell(w, m)!.op, 'op is running');
  injectFuel(w, m, valueOf(100)); // burn fuel into it (≥ grade)
  assert.equal(getCell(w, m)!.recentBurn, 1, 'fuelling lights the burn glow');
  run(w, 12);
  assert.ok(getCell(w, m)!.recentBurn < 0.2, 'the glow decays without further fuel');
});

// --- The Mill (additive splitter) ------------------------------------------

test('Mill splits a block into pieces summing to the same value (conserved)', () => {
  const w = createWorld();
  const m = placeCell(w, 'mill');
  while (!getCell(w, m)!.built) tick(w, 1);
  feedOperand(w, m, 0, valueOf(800));
  const before = score(w); // 800 staged
  run(w, 50); // grind (cheap) + emit
  assert.equal(poolCountOf(w, 100), 8, '800 → 8 × 100');
  assert.equal(score(w), before, 'milling conserves score (additive split)');
});

// --- The warehouse (any-block store) ---------------------------------------

test('warehouse: deposits stockpile, withdraws drain out a pipe (score-counted)', () => {
  const w = createWorld();
  const s = placeCell(w, 'successor', 0, 0);
  const wh = placeCell(w, 'warehouse', 200, 0);
  const wh2 = placeCell(w, 'warehouse', 400, 0);
  while ([s, wh, wh2].some((id) => !getCell(w, id)!.built)) tick(w, 1);
  placePipe(w, s, 0, wh, 0); // deposit: successor → warehouse
  placePipe(w, wh, 0, wh2, 0); // withdraw: warehouse → warehouse2
  run(w, 300);
  const count = (id: number) => getCell(w, id)!.store.reduce((a, e) => a + e.count, 0);
  assert.ok(count(wh) > 0, 'warehouse buffered deposited 1s');
  assert.ok(count(wh2) > 0, 'withdrawals flowed on to the second warehouse');
  assert.ok(score(w) >= count(wh) + count(wh2), 'warehoused blocks count toward Total Score');
});

// --- The pipe-accelerator --------------------------------------------------

test('an accelerator boosts the transit of nearby pipes', () => {
  function arriveTicks(withAccel: boolean): number {
    const w = createWorld();
    const src = placeCell(w, 'addition', 0, 0);
    const dst = placeCell(w, 'multiplication', 300, 0);
    let accel = -1;
    if (withAccel) accel = placeCell(w, 'accelerator', 150, 0); // over the pipe midpoint
    while ([src, dst, ...(withAccel ? [accel] : [])].some((id) => !getCell(w, id)!.built)) tick(w, 1);
    placePipe(w, src, 0, dst, 0);
    if (withAccel) injectFuel(w, accel, valueOf(1e6)); // a big power cell → strong boost
    feedOperand(w, src, 0, valueOf(500));
    feedOperand(w, src, 1, valueOf(500)); // → 1000 emitted into the pipe
    let t = 0;
    while (getCell(w, dst)!.operands[0] === null && t < 500000) {
      tick(w, 1);
      t++;
    }
    return t;
  }
  assert.ok(arriveTicks(true) < arriveTicks(false), 'a charged accelerator speeds the supply line');
});

// --- The bootstrap loop (Phase 3 §3) ---------------------------------------

test('bootstrap: a small successor farm produces a rising score, faster when wider', () => {
  function farmScore(successors: number, ticks: number): number {
    const w = createWorld();
    const ids = [];
    for (let i = 0; i < successors; i++) ids.push(placeCell(w, 'successor', 0, i * 50));
    while (ids.some((id) => !getCell(w, id)!.built)) tick(w, 1);
    run(w, ticks);
    return score(w);
  }
  const narrow = farmScore(1, 500);
  const wide = farmScore(4, 500);
  assert.ok(narrow > 0, 'one successor still produces');
  assert.ok(wide > narrow, 'a wider farm produces more 1s in the same time');
});

// --- Tuning is injectable (sim-first discipline) ---------------------------

test('tuning is injectable: a higher baseRate finishes the same op sooner', () => {
  function ticksFor(rate: number): number {
    const t: TimeTuning = { ...DEFAULT_TUNING, baseRate: rate };
    const w = createWorld(t);
    const id = placeCell(w, 'multiplication');
    while (!getCell(w, id)!.built) tick(w, 1);
    feedOperand(w, id, 0, valueOf(1000));
    feedOperand(w, id, 1, valueOf(1000));
    let ticks = 0;
    while (poolCountOf(w, 1e6) === 0 && ticks < 100000) {
      tick(w, 1);
      ticks++;
    }
    return ticks;
  }
  assert.ok(ticksFor(4) < ticksFor(1), 'a faster baseRate is, well, faster');
});

test('idle world is stable (no NaNs, no spurious blocks)', () => {
  const w = createWorld();
  run(w, 1000);
  assert.equal(poolSize(w), 0);
  assert.equal(score(w), 0);
  assert.ok(Number.isFinite(score(w)));
});

// --- Loose-block stacking (the live game; OFF for the sims) -----------------

test('stacking on: an un-piped producer piles its output into one movable stack', () => {
  const w = createWorld(DEFAULT_TUNING, { stacking: true });
  const id = placeCell(w, 'successor');
  while (!getCell(w, id)!.built) tick(w, 1);
  run(w, 300);
  // Many 1s produced, but they live as ONE stack entity (the pile) — that's the
  // moveability + perf win (no thousands of invisible blocks on the port).
  const ones = w.pool.filter((b) => valueMagnitude(b.value).eq(1));
  assert.equal(ones.length, 1, 'all the 1s are a single stack');
  assert.ok(ones[0].count > 1, 'the stack counts the pile');
  // ...and it is economically identical to that many loose 1s.
  assert.equal(poolCountOf(w, 1), ones[0].count, 'pool count sums the stack');
  assert.equal(score(w), ones[0].count, 'Total Score = blocks × magnitude');
});

test('stacking OFF (default — the balance sims): identical outputs stay separate', () => {
  const w = createWorld(); // default: no merging, exactly as the agents expect
  const id = placeCell(w, 'successor');
  while (!getCell(w, id)!.built) tick(w, 1);
  run(w, 300);
  const ones = w.pool.filter((b) => valueMagnitude(b.value).eq(1));
  assert.ok(ones.length > 1, 'each 1 is its own block (the agent manages the pool)');
  assert.ok(ones.every((b) => b.count === 1));
});

test('stacking on: dropping a stack onto a same-value stack merges them', () => {
  const w = createWorld(DEFAULT_TUNING, { stacking: true });
  addLoose(w, valueOf(5), 0, 0, 3);
  const b = addLoose(w, valueOf(5), 500, 0, 2); // far apart → distinct stacks
  assert.equal(w.pool.length, 2, 'two stacks while apart');
  moveLoose(w, b, 0, 0); // carry the second onto the first
  assert.equal(w.pool.length, 1, 'merged into one');
  assert.equal(poolCountOf(w, 5), 5, 'counts combined');
  assert.equal(score(w), 25, 'score conserved across the merge');
});

test('stacking on: takeLooseById lifts the whole stack; feeding peels one', () => {
  const w = createWorld(DEFAULT_TUNING, { stacking: true });
  const sid = addLoose(w, valueOf(1), 0, 0, 5);
  const stack = takeLooseById(w, sid);
  assert.equal(stack!.count, 5, 'a drag lifts the whole pile');
  assert.equal(w.pool.length, 0, 'the pile left the pool');
  // The view feeds one and re-adds the remainder — emulate that contract.
  addLoose(w, valueOf(1), 200, 0, stack!.count - 1);
  assert.equal(poolCountOf(w, 1), 4, 'one consumed, four remain');
});
