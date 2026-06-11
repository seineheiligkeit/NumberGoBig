/**
 * Tests for the Time-as-Labor cost math (`core/time.ts`).
 *
 * Run with `npm test` (node --test, native TS, no extra deps).
 *
 * These lock the *shape* of the converged economy (TIME_AS_LABOR.md "The fuel
 * economy"): digits = creation cost, value = worth/fuel, per-operator labor
 * exponents, value-fuel (conserved), super-linear transit, and fuel grades.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'break_eternity.js';
import { valueOf, VALUE_ZERO, VALUE_ONE, type Value } from './value.ts';
import {
  magnitudeDigits,
  operationWork,
  buildWork,
  transitWork,
  fuelValue,
  minFuelDenomination,
  scaffoldRequirement,
  ticksToComplete,
  unifiedNeed,
  unifiedBand,
  materialBill,
  unifiedBuildSlots,
  DEFAULT_TUNING,
  UNIFIED_TUNING,
  type TimeTuning,
} from './time.ts';

const n = (d: Decimal) => d.toNumber();
const real = (s: string): Value => ({ kind: 'real', n: new Decimal(s) });

test('magnitudeDigits: zero is free (0 digits)', () => {
  assert.equal(n(magnitudeDigits(VALUE_ZERO)), 0);
});

test('magnitudeDigits: counts decimal digits of the magnitude', () => {
  assert.equal(n(magnitudeDigits(VALUE_ONE)), 1);
  assert.equal(n(magnitudeDigits(valueOf(10))), 2);
  assert.equal(n(magnitudeDigits(valueOf(999))), 3);
  assert.equal(n(magnitudeDigits(valueOf(1e6))), 7);
});

test('magnitudeDigits: negatives use absolute value; fractions → 1', () => {
  assert.equal(n(magnitudeDigits(valueOf(-1000))), 4);
  assert.equal(n(magnitudeDigits(valueOf(0.001))), 1);
});

test('magnitudeDigits: power towers stay finite Decimals, not overflow', () => {
  const tower: Value = { kind: 'real', n: new Decimal(10).tetrate(4) };
  assert.ok(magnitudeDigits(tower).gt(new Decimal('1e100')));
});

// --- Operation labor: digits^k, per-operator -------------------------------

test('operationWork: grows with output magnitude', () => {
  const a = operationWork(valueOf(100), 'multiplication');
  const b = operationWork(valueOf(1e6), 'multiplication');
  const c = operationWork(valueOf(1e12), 'multiplication');
  assert.ok(b.gt(a) && c.gt(b));
});

test('operationWork: steeper operators cost dramatically more for the same output', () => {
  const out = valueOf(1e9); // 10 digits
  const add = operationWork(out, 'addition'); // 10^2
  const mul = operationWork(out, 'multiplication'); // 10^3
  const exp = operationWork(out, 'exponentiation'); // 10^4
  assert.ok(mul.gt(add) && exp.gt(mul), 'labor escalates up the hierarchy');
  // Per the default exponents: addition=10^2, exp=10^4 → 100× more labor.
  assert.ok(exp.div(add).toNumber() >= 50);
});

test('operationWork: respects the floor for tiny outputs', () => {
  assert.ok(operationWork(VALUE_ONE, 'successor').gte(new Decimal(DEFAULT_TUNING.opWorkFloor)));
});

// --- Build: geometric in count ---------------------------------------------

test('buildWork: escalates geometrically with how many you own', () => {
  const first = buildWork(0);
  const second = buildWork(1);
  assert.ok(second.gt(first));
  assert.ok(Math.abs(n(second.div(first)) - DEFAULT_TUNING.buildGrowth) < 1e-9);
});

// --- Transit: super-linear in VALUE ----------------------------------------

test('transit: super-linear in value — big blocks are frozen, small ones free', () => {
  // Use values above the transit floor so the ratio reflects the law, not the
  // floor. value^1.5: 10× the value should cost much more than 10×.
  const hundred = transitWork(valueOf(100), 0);
  const thousand = transitWork(valueOf(1000), 0);
  const tenK = transitWork(valueOf(1e4), 0);
  assert.ok(thousand.div(hundred).toNumber() > 20, '10× value costs >20× transit (super-linear)');
  assert.ok(tenK.gt(hundred.mul(100)), '10⁴ is dramatically worse than 100');
});

test('transit: distance adds cost; zeros stay near-free (floor)', () => {
  assert.ok(transitWork(valueOf(1000), 2400).gt(transitWork(valueOf(1000), 0)));
  assert.ok(transitWork(VALUE_ZERO, 0).lte(new Decimal(DEFAULT_TUNING.transitFloor)));
});

test('transit: a pipe-accelerator boost divides the cost', () => {
  const plain = transitWork(valueOf(1000), 0, DEFAULT_TUNING, 1);
  const boosted = transitWork(valueOf(1000), 0, DEFAULT_TUNING, 10);
  assert.ok(boosted.lt(plain));
});

// --- Fuel = value (conserved), with grades ---------------------------------

test('fuel: content is VALUE, conserved under decomposition (no shatter exploit)', () => {
  // One 1000-block vs a thousand 1s: same total fuel-value. Decomposition
  // doesn't multiply fuel — it's a delivery tool, not a fuel-multiplier.
  const whole = fuelValue(valueOf(1000));
  const shattered = Array.from({ length: 1000 }, () => fuelValue(VALUE_ONE)).reduce(
    (a, b) => a.add(b),
    new Decimal(0),
  );
  assert.equal(n(whole), 1000);
  assert.equal(n(shattered), 1000);
});

test('fuel grade: tiny ops accept 1s; big ops demand big fuel', () => {
  const smallGrade = minFuelDenomination(operationWork(valueOf(7), 'addition'));
  const bigGrade = minFuelDenomination(operationWork(valueOf(1e9), 'exponentiation'));
  assert.ok(smallGrade.lte(1.0001), 'the smallest ops still accept value-1 fuel');
  assert.ok(bigGrade.gt(10), 'a big op refuses small fuel — fuel grades');
  assert.ok(bigGrade.gt(smallGrade));
});

// --- Scaffolding: the exponentiation pacing law ("show your work") ---------

const SCAFFOLD_ON: TimeTuning = { ...DEFAULT_TUNING, scaffoldCoeff: 1 };

test('scaffolding: off by default — zero requirement at any magnitude', () => {
  assert.equal(n(scaffoldRequirement(new Decimal('1e100'))), 0);
});

test('scaffolding: outputs at or below the floor are free (a playful toy)', () => {
  assert.equal(n(scaffoldRequirement(new Decimal(1e6), SCAFFOLD_ON)), 0);
  assert.equal(n(scaffoldRequirement(new Decimal(1000), SCAFFOLD_ON)), 0);
});

test('scaffolding: grows as M^α above the floor, continuous at the floor', () => {
  // just above the floor: tiny requirement (continuity)
  const justAbove = scaffoldRequirement(new Decimal(1.1e6), SCAFFOLD_ON);
  assert.ok(justAbove.gt(0) && justAbove.lt(100), `continuous at floor, got ${justAbove}`);
  // far above: ~M^0.5 — a 10^40 jump demands ~10^20 of working notes
  const big = scaffoldRequirement(new Decimal('1e40'), SCAFFOLD_ON);
  assert.ok(big.gte(new Decimal('9e19')) && big.lte(new Decimal('1.1e20')));
});

test('scaffolding: requirement is a shrinking FRACTION of output (climbing stays net-positive)', () => {
  const m1 = new Decimal('1e20');
  const m2 = new Decimal('1e80');
  const frac1 = scaffoldRequirement(m1, SCAFFOLD_ON).div(m1);
  const frac2 = scaffoldRequirement(m2, SCAFFOLD_ON).div(m2);
  assert.ok(frac2.lt(frac1), 'bigger jumps burn a smaller share of what they create');
});

// --- THE UNIFIED LAW: everything is paid one rung down ----------------------

test('unified: an operator k tiers up is paid k rungs down — need = M^(1/2^k)', () => {
  assert.equal(n(unifiedNeed(new Decimal(65536))), 256, 'mult (k=1): the tier-below root');
  assert.ok(Math.abs(n(unifiedNeed(new Decimal(1e40)).log10()) - 20) < 1e-9, '√ in digit terms: half the digits');
  // exp (k=2): the fourth root — an e20→e80 leap costs exactly one e20 commitment
  assert.ok(Math.abs(n(unifiedNeed(new Decimal('1e80'), 2).log10()) - 20) < 1e-9);
  // tet (k=3): the eighth root — the hierarchy stays a ladder of leaps
  assert.ok(Math.abs(n(unifiedNeed(new Decimal('1e80'), 3).log10()) - 10) < 1e-9);
});

test('unified: the band is [need/16, need] — the Mill ratio', () => {
  const b = unifiedBand(new Decimal(256));
  assert.equal(n(b.min), 16);
  assert.equal(n(b.cap), 256);
  // tiny ops accept 1s (the band floor never drops below 1)
  assert.equal(n(unifiedBand(new Decimal(2)).min), 1);
});

test('unified: material bills — the construct-this-number puzzles', () => {
  // first multiplication wants a 16 (addition’s first moment: 1+1→2→4→8→16)
  const mult0 = materialBill('multiplication', 0, new Decimal(100))!;
  assert.equal(n(mult0.min), 16);
  assert.ok(n(mult0.max) < 18, 'tight band: [16, 17.6]');
  // first exponentiation wants a MILLION — visible from the start
  assert.equal(n(materialBill('exponentiation', 0, new Decimal(100))!.min), 1e6);
  // leaf-class kinds are waived FOREVER — even at a huge peak, the 20th
  // successor is free (the fractal farm's volume cells; pencils throttle them)
  assert.equal(materialBill('successor', 0, new Decimal(1)), null);
  assert.equal(materialBill('addition', 2, new Decimal(8)), null);
  assert.equal(materialBill('successor', 20, new Decimal(1e12)), null);
  assert.equal(materialBill('addition', 20, new Decimal(1e12)), null);
  // repeats are priced in the game’s own currency: max(firstBill, √peak)
  const mult5 = materialBill('multiplication', 5, new Decimal(1e10))!;
  assert.equal(n(mult5.min), 1e5, 'the 6th mult at peak 1e10 costs a √peak-class block');
});

test('unified: pencils grow one per rung of the frontier (digits 6, 12, 24…)', () => {
  assert.equal(unifiedBuildSlots(new Decimal(100)), 1);
  assert.equal(unifiedBuildSlots(new Decimal(1e6)), 2); // 7 digits ≥ 6
  assert.equal(unifiedBuildSlots(new Decimal(1e12)), 3); // 13 ≥ 12
  assert.equal(unifiedBuildSlots(new Decimal(1e24)), 4);
  assert.equal(unifiedBuildSlots(new Decimal(1e50)), 5);
});

test('unified: addition is the always-cheap op (d^1.5, never a wall)', () => {
  const big = operationWork(valueOf(1e20), 'addition', UNIFIED_TUNING); // 21 digits
  assert.ok(big.toNumber() < 100, `a 20-digit sum costs a beat (~${big}), not an evening`);
  const mult = operationWork(valueOf(1e20), 'multiplication', UNIFIED_TUNING);
  assert.ok(mult.gt(big.mul(50)), 'amplifiers stay dramatically pricier than machining');
});

// --- Pacing guards: pin the intended feel ----------------------------------

test('guard: the first cell builds quickly at base rate (snappy opening)', () => {
  const ticks = ticksToComplete(buildWork(0), DEFAULT_TUNING.baseRate);
  assert.ok(ticks >= 6 && ticks <= 40, `first build ${ticks} ticks should be a brief, felt wait`);
});

test('guard: a successor (writes a 1) is near-instant', () => {
  assert.ok(ticksToComplete(operationWork(VALUE_ONE, 'successor'), DEFAULT_TUNING.baseRate) <= 4);
});

test('guard: big numbers are unpipeable-frozen until decomposed', () => {
  // A 10⁸ block's transit must be hundreds of thousands of ticks — i.e. you
  // cannot realistically move it whole; you must mill it down.
  const frozen = transitWork(real('1e8'), 0);
  assert.ok(frozen.toNumber() > 1e5, 'a 10⁸ block is effectively frozen on a pipe');
  // ...while small fuel (value 100) flows fluidly.
  assert.ok(transitWork(valueOf(100), 0).toNumber() < 50);
});

test('ticksToComplete: work / rate, Infinity at zero rate', () => {
  assert.equal(ticksToComplete(new Decimal(100), 4), 25);
  assert.equal(ticksToComplete(new Decimal(100), 0), Infinity);
});
