/**
 * Time as Labor — the cost math.
 *
 * One law (see TIME_AS_LABOR.md §2): handling a number costs time proportional
 * to its *magnitude*; building a cell costs time proportional to how many you
 * already own; distance on the page adds to both; burning numbers into a cell
 * buys speed.
 *
 * THE UNIT IS DIGITS (log-magnitude), NOT RAW VALUE. This is the one decision
 * everything hangs off, and it is the only internally consistent choice:
 *
 *   - "Work = the cost of writing the result." Writing 10^200 is writing ~201
 *     digits, so an operation's work scales with the digit-count of its output.
 *   - Climbing stays net-positive. Producing 10^200 costs ~200 work; the fuel
 *     you burn to rush it is measured in digits too (a `1000` block is worth 3,
 *     a `1` is worth 1), so the *value* created dwarfs the *value* burned. If
 *     work scaled with raw value instead, making a number would cost its own
 *     magnitude in fuel and the operator hierarchy would be pointless.
 *   - Small fuel stays good. Per-block fuel contribution is its digit-count, so
 *     big fuel is barely better per block — and big fuel transits slowly
 *     (transit also scales with digits), so a fast stream of small denominations
 *     wins on delivery. The river-of-zeros economy falls out of the physics.
 *   - Zeros are ~free. A zero has 0 digits → ~0 work to write, move, or tap.
 *
 * This module is PURE: no Pixi, no Svelte, no world state. The headless engine
 * (`core/engine.ts`) and any future sim import it directly. Everything is
 * `Decimal`-valued so power-tower outputs (whose digit-counts are themselves
 * astronomical — i.e. "this will finish shortly after the sun does") never
 * overflow `Number`.
 */

import Decimal from 'break_eternity.js';
import { valueMagnitude, type Value } from './value.ts';

/**
 * The balance surface. Every constant the pacing depends on lives here so a
 * future sim can sweep them without touching logic. Defaults are a sane
 * *starting* point only — the real curve is found sim-first (PLAN Phase 5.3).
 * We lean aggressive (steep work growth) per the design, but conservatively
 * enough that the opening minutes still bootstrap by hand.
 */
export interface TimeTuning {
  /** Free progress every cell/pipe earns per tick, before any fuel. The single
   *  most important knob (and the future global time-lever). Nonzero so the
   *  game always trickles forward when idle. */
  baseRate: number;
  /** Operation work = opWorkPerDigit · digits(output)^opWorkExponent. */
  opWorkPerDigit: number;
  opWorkExponent: number;
  /** Floor so even a 1-digit operation takes a felt beat. */
  opWorkFloor: number;
  /** Build work for the Nth owned cell of a type = buildBase · buildGrowth^N. */
  buildBase: number;
  buildGrowth: number;
  /** Transit work = transitPerDigit · (digits+1) · (distanceUnits + transitNearCost). */
  transitPerDigit: number;
  /** Canvas pixels per "distance unit". */
  transitDistanceUnit: number;
  /** Distance cost even for adjacent cells (so transport is never free). */
  transitNearCost: number;
  transitFloor: number;
  /** Progress contributed by burning one fuel block = fuelPerDigit · digits(v). */
  fuelPerDigit: number;
}

export const DEFAULT_TUNING: TimeTuning = {
  baseRate: 1,
  // First tuning pass (sim-read, sim/time-run.ts). Super-linear in digits so
  // big numbers are genuinely slow to write at base — making the fuel economy
  // the answer (the design's core tension) — while a low per-digit coefficient
  // keeps small ops snappy. With these: a `1` is ~2 ticks, 10^6 ~37 ticks base
  // (but ~1 tick well-fuelled), 10^100 ~34m base (~40s well-fuelled).
  opWorkPerDigit: 2,
  opWorkExponent: 1.5,
  opWorkFloor: 2,
  buildBase: 16,
  buildGrowth: 1.5,
  transitPerDigit: 0.6,
  transitDistanceUnit: 240,
  transitNearCost: 0.5,
  transitFloor: 1,
  fuelPerDigit: 1,
};

const dZero = Decimal.dZero;
const dOne = Decimal.dOne;

/**
 * Digit-count of a value's magnitude — the universal unit of work.
 *
 *   - 0 (and sets, magnitude 0)  → 0   (free to handle: zeros, the substrate)
 *   - 0 < |v| < 1 (fractions)    → 1   (a few chars; fractions aren't the focus)
 *   - |v| ≥ 1                    → ⌊log₁₀|v|⌋ + 1
 *
 * Returns a `Decimal` because a power tower's digit-count is itself enormous.
 */
export function magnitudeDigits(v: Value): Decimal {
  const m = valueMagnitude(v); // absolute value, Decimal
  if (m.lte(dZero)) return dZero;
  if (m.lt(dOne)) return dOne;
  return m.log10().floor().add(1);
}

/** Work to carry out an operation, from the magnitude of its output. */
export function operationWork(output: Value, t: TimeTuning = DEFAULT_TUNING): Decimal {
  const digits = magnitudeDigits(output);
  const raw = new Decimal(t.opWorkPerDigit).mul(digits.pow(t.opWorkExponent));
  return Decimal.max(raw, new Decimal(t.opWorkFloor));
}

/**
 * Work to construct the `owned`-th cell of a type (0-indexed: the first cell
 * you ever build passes owned=0). Geometric in count — the RTS repurchase
 * scaling, expressed in time. Independent of magnitude (building isn't writing
 * a number).
 */
export function buildWork(owned: number, t: TimeTuning = DEFAULT_TUNING): Decimal {
  const n = Math.max(0, Math.floor(owned));
  return new Decimal(t.buildBase).mul(Decimal.pow(t.buildGrowth, n));
}

/** Work to carry a block of value `v` a distance of `distancePx` along a pipe. */
export function transitWork(v: Value, distancePx: number, t: TimeTuning = DEFAULT_TUNING): Decimal {
  const digits = magnitudeDigits(v);
  const units = Math.max(0, distancePx) / t.transitDistanceUnit + t.transitNearCost;
  const raw = new Decimal(t.transitPerDigit).mul(digits.add(1)).mul(units);
  return Decimal.max(raw, new Decimal(t.transitFloor));
}

/**
 * Progress contributed by burning one fuel block of value `v`. Measured in
 * digits, so big fuel is only marginally better per block than small — and
 * since big fuel also transits slowly, a fast stream of small denominations
 * is the efficient accelerant. The block is consumed (a real spend against
 * Total Score) by the caller.
 */
export function fuelWork(v: Value, t: TimeTuning = DEFAULT_TUNING): Decimal {
  return magnitudeDigits(v).mul(t.fuelPerDigit);
}

/**
 * Ticks to finish `work` at a given steady `rate` (= baseRate + any sustained
 * fuel feed). Convenience for the sim / previews; the engine itself accrues
 * progress incrementally so discrete fuel chunks are handled exactly.
 * `Infinity` when rate ≤ 0.
 */
export function ticksToComplete(work: Decimal, rate: number): number {
  if (rate <= 0) return Infinity;
  return work.div(rate).toNumber();
}
