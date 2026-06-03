/**
 * Tests for the Time-as-Labor cost math (`core/time.ts`).
 *
 * Run with `npm test` (node --test, native TS, no extra deps).
 *
 * These lock the *shape* of the economy — not specific tuned numbers (those
 * are sim-discovered later). They assert the invariants the design rests on:
 * zeros are free, work grows with magnitude, building escalates with count,
 * small fuel is competitive, and climbing the hierarchy is net-positive.
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
  fuelWork,
  ticksToComplete,
  DEFAULT_TUNING,
} from './time.ts';

const n = (d: Decimal) => d.toNumber();

test('magnitudeDigits: zero is free (0 digits)', () => {
  assert.equal(n(magnitudeDigits(VALUE_ZERO)), 0);
});

test('magnitudeDigits: counts decimal digits of the magnitude', () => {
  assert.equal(n(magnitudeDigits(VALUE_ONE)), 1);
  assert.equal(n(magnitudeDigits(valueOf(9))), 1);
  assert.equal(n(magnitudeDigits(valueOf(10))), 2);
  assert.equal(n(magnitudeDigits(valueOf(999))), 3);
  assert.equal(n(magnitudeDigits(valueOf(1000))), 4);
  assert.equal(n(magnitudeDigits(valueOf(1e6))), 7);
});

test('magnitudeDigits: negatives use absolute value', () => {
  assert.equal(n(magnitudeDigits(valueOf(-1000))), 4);
});

test('magnitudeDigits: fractions collapse to 1, never 0', () => {
  assert.equal(n(magnitudeDigits(valueOf(0.001))), 1);
});

test('magnitudeDigits: power towers stay finite Decimals, not overflow', () => {
  // 10 ↑↑ 4 — its digit-count is astronomical but representable.
  const tower: Value = { kind: 'real', n: new Decimal(10).tetrate(4) };
  const digits = magnitudeDigits(tower);
  assert.ok(digits.gt(new Decimal('1e100')), 'tower digit-count should be huge');
  assert.ok(Number.isFinite(digits.layer) || digits.layer >= 0, 'representable Decimal');
});

test('operationWork: grows with output magnitude', () => {
  const small = operationWork(VALUE_ONE);
  const big = operationWork(valueOf(1e6));
  const huge = operationWork(valueOf(1e12));
  assert.ok(big.gt(small));
  assert.ok(huge.gt(big));
});

test('operationWork: respects the floor for tiny outputs', () => {
  assert.ok(operationWork(VALUE_ONE).gte(new Decimal(DEFAULT_TUNING.opWorkFloor)));
  assert.ok(operationWork(VALUE_ZERO).gte(new Decimal(DEFAULT_TUNING.opWorkFloor)));
});

test('buildWork: escalates geometrically with how many you own', () => {
  const first = buildWork(0);
  const second = buildWork(1);
  const fifth = buildWork(4);
  assert.ok(second.gt(first), 'the 2nd cell costs more time than the 1st');
  assert.ok(fifth.gt(second));
  // geometric: ratio between consecutive equals buildGrowth
  assert.ok(
    Math.abs(n(second.div(first)) - DEFAULT_TUNING.buildGrowth) < 1e-9,
    'consecutive build costs differ by the growth factor',
  );
});

test('transitWork: bigger blocks and longer pipes cost more', () => {
  const smallNear = transitWork(VALUE_ONE, 0);
  const smallFar = transitWork(VALUE_ONE, 2400);
  const bigNear = transitWork(valueOf(1e6), 0);
  assert.ok(smallFar.gt(smallNear), 'distance adds time');
  assert.ok(bigNear.gt(smallNear), 'magnitude adds time');
});

test('transitWork: zeros move fast but never instantly (floor)', () => {
  const zero = transitWork(VALUE_ZERO, 0);
  assert.ok(zero.gte(new Decimal(DEFAULT_TUNING.transitFloor)));
  // a zero crossing a short pipe is cheaper than a big block crossing it
  assert.ok(transitWork(VALUE_ZERO, 240).lte(transitWork(valueOf(1e6), 240)));
});

test('fuel: small fuel is competitive per-block (digit-measured), not dwarfed', () => {
  // A 1000-block is worth only ~4 of a 1-block, not 1000× — so a fast stream
  // of small denominations is the efficient accelerant. This is the invariant
  // that keeps the river-of-zeros economy alive.
  const one = fuelWork(VALUE_ONE);
  const thousand = fuelWork(valueOf(1000));
  assert.equal(n(one), 1);
  assert.equal(n(thousand), 4);
  assert.ok(n(thousand) < 10 * n(one), 'big fuel is only marginally better per block');
});

test('climbing is net-positive: producing a big number is worth far more than the fuel to rush it', () => {
  // Multiply 1000 × 1000 = 1e6. Work to produce it:
  const output = valueOf(1e6);
  const work = operationWork(output);
  // Rush it entirely with fuel: how much *value* must be burned?
  // Each unit of work needs ~ (1 / fuelPerDigit-of-the-fuel) ... use 1-blocks
  // (worth 1 work each): work ≈ number of 1-blocks burned.
  const onesBurned = n(work); // ≈ value burned, since each 1 is worth 1
  const valueCreated = 1e6;
  assert.ok(
    valueCreated > onesBurned * 100,
    'output magnitude dwarfs the fuel spent rushing it — the hierarchy pays',
  );
});

test('ticksToComplete: work / rate, Infinity at zero rate', () => {
  assert.equal(ticksToComplete(new Decimal(100), 4), 25);
  assert.equal(ticksToComplete(new Decimal(100), 0), Infinity);
});
