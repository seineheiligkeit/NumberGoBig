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
  feedOperand,
  injectFuel,
  addLoose,
  tick,
  totalScore,
  poolCountOf,
  poolSize,
  getCell,
  buildFraction,
  opFraction,
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
  const opTicks = Math.ceil(operationWork(VALUE_ONE).toNumber());
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

// --- Fuel buys speed (Phase 3) ---------------------------------------------

test('fuel makes an operation finish in fewer ticks', () => {
  const target = valueOf(1e9).n.toNumber(); // big output → long op

  const slow = createWorld();
  const s = placeCell(slow, 'exponentiation');
  while (!getCell(slow, s)!.built) tick(slow, 1);
  feedOperand(slow, s, 0, valueOf(10));
  feedOperand(slow, s, 1, valueOf(9)); // 10^9
  let slowTicks = 0;
  while (poolCountOf(slow, target) === 0 && slowTicks < 100000) {
    tick(slow, 1);
    slowTicks++;
  }

  const fast = createWorld();
  const f = placeCell(fast, 'exponentiation');
  while (!getCell(fast, f)!.built) tick(fast, 1);
  feedOperand(fast, f, 0, valueOf(10));
  feedOperand(fast, f, 1, valueOf(9));
  let fastTicks = 0;
  while (poolCountOf(fast, target) === 0 && fastTicks < 100000) {
    // shovel fuel every tick
    injectFuel(fast, f, valueOf(100));
    tick(fast, 1);
    fastTicks++;
  }

  assert.ok(fastTicks < slowTicks, `fuelled op (${fastTicks}) beats unfuelled (${slowTicks})`);
});

test('fuel injected at an idle cell is returned to the pool, not wasted', () => {
  const w = createWorld();
  const id = placeCell(w, 'addition');
  while (!getCell(w, id)!.built) tick(w, 1);
  // cell is built and idle (no operands)
  assert.equal(getCell(w, id)!.op, null);
  injectFuel(w, id, valueOf(5));
  assert.equal(poolCountOf(w, 5), 1, 'idle-cell fuel lands loose');
});

// --- Transport: time × distance (Phase 4) ----------------------------------

test('a block takes time to travel a pipe; longer pipe = longer transit', () => {
  function transitTicks(distance: number): number {
    const w = createWorld();
    const src = placeCell(w, 'successor', 0, 0);
    const dst = placeCell(w, 'addition', distance, 0);
    while (!getCell(w, src)!.built || !getCell(w, dst)!.built) tick(w, 1);
    placePipe(w, src, 0, dst, 0); // successor's 1 → addition operand 0
    // run until the addition has a staged operand on port 0
    let ticks = 0;
    while (getCell(w, dst)!.operands[0] === null && ticks < 100000) {
      tick(w, 1);
      ticks++;
    }
    return ticks;
  }
  const near = transitTicks(0);
  const far = transitTicks(2400);
  assert.ok(far > near, 'a longer supply line is slower');
});

test('the canvas is a map: keeping fuel close accelerates more cheaply', () => {
  // Same fuel feeding the same op, delivered from near vs far. Near should
  // land more fuel-chunks within a fixed window (because each trip is shorter).
  function chunksDelivered(distance: number, windowTicks: number): number {
    const w = createWorld();
    const op = placeCell(w, 'exponentiation', 0, 0);
    const depot = placeCell(w, 'successor', distance, 0); // emits 1s as fuel
    while (!getCell(w, op)!.built || !getCell(w, depot)!.built) tick(w, 1);
    feedOperand(w, op, 0, valueOf(10));
    feedOperand(w, op, 1, valueOf(12)); // 10^12, a long op
    placePipe(w, depot, 0, op, -1, { fuel: true });
    const startFrac = opFraction(getCell(w, op)!);
    run(w, windowTicks);
    // progress beyond what baseRate alone would give is the fuel's contribution
    return opFraction(getCell(w, op)!) - startFrac;
  }
  const near = chunksDelivered(0, 400);
  const far = chunksDelivered(3000, 400);
  assert.ok(near >= far, 'closer fuel depot delivers at least as much progress');
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
