/**
 * Computational cost — magnitude-scaled per-firing fuel cost (DESIGN §6,
 * ROADMAP Slice 3.5.1).
 *
 * Pre-3.5.1, every cost-bearing operator paid a flat number of ones per
 * firing (×: 1, ^: 3). That made `1 × 1` and `10⁶ × 10⁶` indistinguishable
 * — the operator does very different amounts of work in the two cases.
 *
 * From 3.5.1 the cost climbs with the order of magnitude of the cell's
 * largest input:
 *
 *     cost = tier × max(1, ⌈log₁₀(max(|a|, |b|))⌉)        when max > 0
 *     cost = 0                                              when max ≤ 0
 *
 * Tier table:
 *
 *   - successor / addition / subtraction         : 0  (free)
 *   - multiplication / division                  : 1
 *   - exponentiation                             : 2
 *   - tetration                                  : 4  (Slice 6.1a — required fuel port)
 *   - pentation                                  : 8  (Slice 6.1b — required fuel port)
 *   - (Knuth arrow arrives in Slice 6.1c)
 *
 * Single-digit multiplications still cost 1; multiplying by 10⁶ costs 6;
 * exponentiation pays double for the same digit count. The "floored at 1
 * for any positive magnitude" rule prevents `× 1` from being free (which
 * would let the player pump output magnitude through a 1-multiplier chain
 * for nothing).
 *
 * **Decimal-valued cost (Slice 6.1a).** Pre-6.1a the cost was a plain
 * `number`, which works through exponentiation (whose costs are bounded
 * by tier × log10 of the input magnitudes — fits in a double). Once
 * tetration enters the picture, chained tetrations produce inputs whose
 * log10 exceeds `Number.MAX_SAFE_INTEGER`, so `cost` is now a `Decimal`
 * end-to-end. Callers compare against `Decimal.dZero` for free-firing
 * and use `cost.toString()` for the cost-preview badge.
 *
 * This module lives separately from `cell-types.ts` so the cost-preview
 * badge in `pixi/binary-cell.ts` can import it without creating a
 * `cell-types → pixi/binary-cell → cell-types` runtime cycle. The
 * `CellType` import below is `type`-only and erased at runtime.
 */

import Decimal from 'break_eternity.js';
import type { CellType } from './cell-types';
import {
  VALUE_ONE,
  VALUE_ZERO,
  valueAdd,
  valueIsNonNegativeInteger,
  valueMagnitude,
  valueMul,
  valueOf,
  valuePow,
  valueToSafeNumber,
  type Value,
} from './value';

/**
 * Tier table — retained for backward-compat callers (e.g.
 * UI deciding whether a cell has a fuel port) and for the inversion
 * special case (signed-fuel block, not a ladder).
 *
 * α.5c (Ladder Rule): tier-0 cells (successor, add, sub, neg, factor,
 * decrement) have no fuel. Tier-1+ cells consume a per-firing ladder
 * of small numbers, computed by `fuelLadder` below. Inversion is the
 * one exception — its signed fuel cost (negative for uphill) doesn't
 * fit the ladder shape; it keeps the old single-block model.
 */
export function costTier(type: CellType): number {
  switch (type) {
    case 'multiplication':
    case 'division':
      return 1;
    case 'exponentiation':
    case 'inversion':
      return 2;
    case 'tetration':
      return 4;
    case 'pentation':
      return 8;
    case 'variadic-arrow':
      return 2;
    default:
      return 0;
  }
}

/**
 * α.5c Ladder Rule — hierarchy position L of a cell type. Returns -1
 * for cells outside the ladder system (no per-firing fuel).
 *
 *   L=0  Successor                 (1 zero ladder)
 *   L=1  Addition/Subtraction/Neg  (2 zeros + 1 one)
 *   L=2  Multiplication/Division   (4z + 2o + 1t)
 *   L=3  Exp/Sqrt                  (8z + 4o + 2t + 1×3)
 *   L=4  Tetration                 (16z + 8o + 4t + 2×3 + 1×4)
 *   L=5  Pentation                 (32z + 16o + 8t + 4×3 + 2×4 + 1×5)
 *
 * Successor's L=0 is "1 zero," matching its existing operand-input
 * cost — successor already consumed a zero per firing under the old
 * model, so the ladder doesn't add anything new for L=0.
 *
 * Variadic-arrow's L is runtime — defined by the arrows-count input
 * (slot 1). Handled inside `fuelLadder` rather than here.
 *
 * Inversion is special-cased (signed single-block); returns -1 so
 * `fuelLadder` falls through to its special path.
 */
export function ladderPosition(type: CellType): number {
  switch (type) {
    case 'successor':
      return 0;
    case 'addition':
    case 'subtraction':
    case 'negation':
      return 1;
    case 'multiplication':
    case 'division':
      return 2;
    case 'exponentiation':
    case 'square-root':
      return 3;
    case 'tetration':
      return 4;
    case 'pentation':
      return 5;
    default:
      // variadic-arrow, inversion, cultivators, decomposer bots,
      // utility cells: handled separately or no fuel ladder.
      return -1;
  }
}

/**
 * α.5c: per-firing fuel ladder for a cell. Returns a Map<value, count>
 * — the agent (or game) must consume `count` blocks of value `value`
 * for each entry, in addition to the cell's operand inputs.
 *
 * Pattern: at position L, demand `2^(L-k)` of value k for k=0..L,
 * scaled by `⌈log₁₀(max input)⌉` (the order-of-magnitude tax).
 *
 * Examples:
 *   Mult 10×10  (L=2, order=1):  4 zeros + 2 ones + 1 two.
 *   Mult 10⁶×10⁶ (L=2, order=6): 24 zeros + 12 ones + 6 twos.
 *   Exp(10, 3) (L=3, order=1):  8 zeros + 4 ones + 2 twos + 1×3.
 *
 * Returns an empty Map for cells outside the ladder system
 * (tier-0 ops have no per-firing fuel; inversion uses a signed
 * single-block cost via `computationalCost`).
 *
 * Mult/Exp level discounts (lvl 3+ order−1, lvl 5 halved) apply.
 */
export function fuelLadder(
  type: CellType,
  inputs: readonly (Value | null)[] = [],
  level: number = 1,
): Map<number, number> {
  let L: number;
  if (type === 'variadic-arrow') {
    // L equals the arrows-count input value (slot 1).
    const arrowsInput = inputs[1];
    if (!arrowsInput || !valueIsNonNegativeInteger(arrowsInput)) {
      return new Map();
    }
    const arrowsN = valueToSafeNumber(arrowsInput);
    if (arrowsN === null || arrowsN < 1) return new Map();
    L = arrowsN;
  } else {
    L = ladderPosition(type);
    if (L < 0) return new Map();
  }

  // Max input magnitude (excluding arrows slot for variadic-arrow).
  let maxMag = new Decimal(0);
  let any = false;
  for (let i = 0; i < inputs.length; i++) {
    const v = inputs[i];
    if (v === null || v === undefined) continue;
    if (type === 'variadic-arrow' && i === 1) continue;
    any = true;
    const m = valueMagnitude(v);
    if (m.gt(maxMag)) maxMag = m;
  }
  if (!any || maxMag.lte(Decimal.dZero)) return new Map();

  // Order = max(1, ceil(log10(maxMag))). Convert to plain number for
  // ladder count arithmetic; cap if mag is huge.
  const logD = maxMag.log10();
  let order: number;
  if (logD.lte(Decimal.dOne)) {
    order = 1;
  } else {
    const logNum = logD.toNumber();
    if (!isFinite(logNum)) order = 1e9; // sanity cap for unhinged input mags
    else order = Math.max(1, Math.ceil(logNum));
  }

  // Level discount (Mult/Exp lvl 3+): reduce order by 1 (min 1) at
  // lvl 3-4, halve at lvl 5.
  if ((type === 'multiplication' || type === 'exponentiation') && level >= 3) {
    if (level >= 5) order = Math.max(1, Math.floor(order / 2));
    else order = Math.max(1, order - 1);
  }

  const ladder = new Map<number, number>();
  for (let k = 0; k <= L; k++) {
    ladder.set(k, Math.pow(2, L - k) * order);
  }
  return ladder;
}

/**
 * Returns the fuel cost as a `Decimal`. Cost is paid by consuming one
 * block whose magnitude ≥ this number (Slice 3.5.7).
 *
 * `inputs` is the cell's pending-input vector — null slots are ignored, so
 * a partial preview (only one input filled) still produces a meaningful
 * cost estimate that climbs as the second input lands. Callers in the fire
 * path pass fully-resolved inputs; callers in the preview path pass
 * `cell.pending` directly.
 *
 * Successor takes no `inputs` argument from old call sites — the default
 * empty array short-circuits to 0 (tier 0 anyway, but defends against
 * future tier-bumps that forget to update the call site).
 */
// `applyLevelDiscount` (Slice 6.7) was removed in α.5c — its
// behaviour now lives inside `fuelLadder` where the order multiplier
// is reduced before building the ladder.

/**
 * `computationalCost` is now a back-compat wrapper: for inversion it
 * returns the signed-Decimal cost (single block). For all other cells
 * it returns the SUM of `value × count` across the ladder — a single-
 * number summary useful for cost-preview badges that want a magnitude
 * reading.
 *
 * Fire paths should use `fuelLadder()` directly to know exactly what
 * blocks to consume.
 */
export function computationalCost(
  type: CellType,
  inputs: readonly (Value | null)[] = [],
  level: number = 1,
): Decimal {
  // Inversion: signed single-block fuel — kept on the original
  // signed-Decimal contract (negative for uphill, positive downhill).
  if (type === 'inversion') {
    const input = inputs[0];
    if (!input) return Decimal.dZero;
    const mag = valueMagnitude(input);
    if (mag.lte(Decimal.dZero)) return Decimal.dZero;
    const logOutput = mag.log10().neg();
    const orderD = logOutput.ceil();
    return orderD.neg().mul(2);
  }

  // All other cells: ladder-derived total magnitude.
  const ladder = fuelLadder(type, inputs, level);
  let total = Decimal.dZero;
  for (const [v, c] of ladder) {
    total = total.add(new Decimal(v).mul(c));
  }
  return total;
}

/**
 * Per-emission fuel cost for a cultivation cell (Slice 3.5.6). Each
 * emission consumes one fuel block of magnitude ≥ this cost — same
 * payment shape as a cost-bearing equation cell.
 *
 *   cost = max(1, ⌈log₁₀(|value|)⌉)        when |value| > 0
 *   cost = 0                                 when value = 0
 *
 * Geometric cultivation self-throttles naturally — emissions grow,
 * costs grow, and the cell stalls once the player can no longer pay.
 */
export function cultivationEmissionCost(value: Value): Decimal {
  const mag = valueMagnitude(value);
  if (mag.lte(Decimal.dZero)) return Decimal.dZero;
  const logD = mag.log10();
  return logD.lte(Decimal.dOne) ? Decimal.dOne : logD.ceil();
}

/**
 * Returns the next value a cultivation cell should emit, given its seed
 * and the 0-based emission index. Pure — lives in `cost.ts` rather than
 * `cell-types.ts` so the pixi-side preview badge can import it without
 * threading a runtime cycle back through `cell-types.ts`'s
 * shape-builder.
 *
 *  - arithmetic:  s, s+1, s+2, s+3, …
 *  - geometric:   s, 2s, 4s, 8s, …
 *  - fibonacci:   s·F₁, s·F₂, s·F₃, … = s, s, 2s, 3s, 5s, 8s, …
 */
export function cultivationEmit(
  type: CellType,
  seed: Value,
  stepIndex: number,
): Value {
  switch (type) {
    case 'cultivation-arithmetic':
      return valueAdd(seed, valueOf(stepIndex));
    case 'cultivation-geometric':
      return valueMul(seed, valuePow(valueOf(2), valueOf(stepIndex)));
    case 'cultivation-fibonacci': {
      let a: Value = VALUE_ONE;
      let b: Value = VALUE_ONE;
      for (let i = 0; i < stepIndex; i++) {
        const c = valueAdd(a, b);
        a = b;
        b = c;
      }
      return valueMul(seed, a);
    }
    // Phase 6 ε.2: three series the design has called for since
    // Phase 2 (DESIGN §6 *Cultivation Cells*). All use the same
    // transformer model — input × series-coefficient(step).
    case 'cultivation-harmonic': {
      // f(x, n) = x · H_{n+1}, where H_k = 1 + 1/2 + ... + 1/k.
      // Harmonic numbers grow logarithmically — painfully slow.
      let H = valueOf(0);
      for (let k = 1; k <= stepIndex + 1; k++) {
        const recip = valuePow(valueOf(k), valueOf(-1));
        H = valueAdd(H, recip);
      }
      return valueMul(seed, H);
    }
    case 'cultivation-polynomial': {
      // f(x, n) = x · (n+1)^2. Quadratic growth — slower than
      // geometric, faster than arithmetic. Future sim iterations may
      // generalise to player-chosen polynomial coefficients.
      return valueMul(seed, valuePow(valueOf(stepIndex + 1), valueOf(2)));
    }
    case 'cultivation-factorial': {
      // f(x, n) = x · (n+1)!. Factorial growth — terrifying. The
      // cell self-throttles via the universal comp jam rule (β.3)
      // long before reaching truly absurd magnitudes.
      let fac: Value = VALUE_ONE;
      for (let k = 1; k <= stepIndex + 1; k++) {
        fac = valueMul(fac, valueOf(k));
      }
      return valueMul(seed, fac);
    }
    default:
      return VALUE_ZERO;
  }
}
