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
  /** Operation labor = max(floor, digits(output)^opExponent[kind]). The
   *  exponent is PER OPERATOR and steepens up the hierarchy, so higher
   *  operators are dramatically more labor-intensive per digit. Sub-linear in
   *  value (digit-based), so climbing the hierarchy stays net-positive. */
  opExponent: Record<string, number>;
  opWorkFloor: number;
  /** Build work for the Nth owned cell of a type = buildBase · buildGrowth^N. */
  buildBase: number;
  buildGrowth: number;
  /** Transit work = max(floor, transitCoeff · value^transitExp · distFactor).
   *  Super-linear in VALUE (not digits) so big blocks are frozen — they must be
   *  decomposed (or processed locally) to move. Small blocks always move freely. */
  transitCoeff: number;
  transitExp: number;
  transitDistanceUnit: number;
  transitNearCost: number;
  transitFloor: number;
  /** Min fuel denomination an op accepts = max(1, gradeCoeff · opWork^gradeExp).
   *  A big op refuses fuel below its grade → fuel grades → the tiers chain.
   *  gradeCoeff < 1 keeps the smallest ops accepting `1`s (the base fuel). */
  gradeExp: number;
  gradeCoeff: number;
}

export const DEFAULT_TUNING: TimeTuning = {
  baseRate: 1,
  // Per-operator labor exponents (digits^k). Steepening up the hierarchy.
  // Starting moderate; the real curve is sim-tuned (sim/time-run.ts).
  opExponent: {
    successor: 1,
    addition: 2,
    multiplication: 3,
    exponentiation: 4,
    tetration: 5,
    pentation: 6,
  },
  opWorkFloor: 2,
  buildBase: 16,
  // Mild geometric repurchase. Was 1.5, but the build-ROI sweep (sim/build-roi.ts)
  // showed 1.5 walls expansion at ~10 cells (payback explodes), which chokes the
  // factory-WIDTH lever that rewards active play. 1.15 keeps every next cell
  // worth building deep into the game ("always something to build").
  buildGrowth: 1.15,
  // Transit super-linear in value: a 1 ≈ free, a 100 ≈ 10 ticks, a 1000 ≈ 300,
  // a 10⁴ ≈ frozen — so you decompose to ~100-grade fuel for fluid transport.
  transitCoeff: 0.01,
  transitExp: 1.5,
  transitDistanceUnit: 240,
  transitNearCost: 0.5,
  transitFloor: 1,
  // Grade ≈ gradeCoeff·sqrt(opWork): an op of labor W needs ~sqrt(W) blocks.
  // gradeCoeff 0.3 keeps tiny ops + small adds accepting `1`s, while
  // multiplication wants ≥~6 and exponentiation ≥~30. (Sim-tuned later.)
  gradeExp: 0.5,
  gradeCoeff: 0.3,
};

const dZero = Decimal.dZero;
const dOne = Decimal.dOne;

/**
 * Digit-count of a value's magnitude — the unit of *creation cost* (labor).
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

/** Per-operator labor exponent (digits^k), defaulting to 1 for unknown kinds. */
export function opExponentFor(kind: string, t: TimeTuning = DEFAULT_TUNING): number {
  return t.opExponent[kind] ?? 1;
}

/**
 * Labor of an operation: `max(floor, digits(output)^k)` where `k` is the
 * operator's exponent. Digit-based (so climbing pays), steep at high tiers.
 */
export function operationWork(output: Value, kind: string, t: TimeTuning = DEFAULT_TUNING): Decimal {
  const digits = magnitudeDigits(output);
  const raw = digits.pow(opExponentFor(kind, t));
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

/**
 * Work to carry a block of value `v` a distance of `distancePx`. Super-linear
 * in VALUE: small blocks move freely, big blocks are frozen (and must be
 * decomposed to move). `boost` divides the cost (a pipe-accelerator's effect).
 */
export function transitWork(
  v: Value,
  distancePx: number,
  t: TimeTuning = DEFAULT_TUNING,
  boost = 1,
): Decimal {
  const mag = valueMagnitude(v);
  const units = Math.max(0, distancePx) / t.transitDistanceUnit + t.transitNearCost;
  const raw = mag.pow(t.transitExp).mul(t.transitCoeff).mul(units).div(Math.max(1e-9, boost));
  return Decimal.max(raw, new Decimal(t.transitFloor));
}

/**
 * Fuel content of a block = its VALUE (magnitude). Conserved under additive
 * decomposition (splitting a block conserves the sum), so there is no
 * "shatter-to-1s" exploit — decomposition is a *delivery* tool, not a
 * fuel-multiplier. The block is consumed (a real spend against Total Score).
 */
export function fuelValue(v: Value): Decimal {
  return valueMagnitude(v);
}

/**
 * Minimum fuel denomination an operation of labor `opWork` will accept:
 * `max(1, opWork^gradeExp)`. Smaller blocks are refused — this is what creates
 * fuel grades and chains the tiers.
 */
export function minFuelDenomination(opWork: Decimal, t: TimeTuning = DEFAULT_TUNING): Decimal {
  return Decimal.max(dOne, opWork.pow(t.gradeExp).mul(t.gradeCoeff));
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
