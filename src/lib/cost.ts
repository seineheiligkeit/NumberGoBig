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
 * Tier table for each cell type. Exposed (not module-private) so
 * `consumeFuelOrFail` can distinguish tier-1 (optional fuel port, falls
 * back to global pool when unwired) from tier-2+ (required fuel port,
 * never dips into the global pool).
 */
export function costTier(type: CellType): number {
  switch (type) {
    case 'multiplication':
    case 'division':
      return 1;
    case 'exponentiation':
      return 2;
    case 'tetration':
      return 4;
    case 'pentation':
      return 8;
    case 'variadic-arrow':
      // Variadic arrow's tier depends on the runtime arrows-count input;
      // this baseline returns the minimum (=2) so `consumeFuelOrFail`
      // correctly treats it as "required fuel port". The actual cost
      // is computed below in `computationalCost` with full input context.
      return 2;
    default:
      return 0;
  }
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
export function computationalCost(
  type: CellType,
  inputs: readonly (Value | null)[] = [],
): Decimal {
  // Variadic arrow's tier is `2 ^ arrows`, where `arrows` is the cell's
  // SECOND operand input (slot 1, between base and height). The `costTier`
  // table can't express that without runtime context, so we special-case
  // here. The base/height inputs contribute to the order calculation; the
  // arrows input does NOT (it's the operator parameter, not an operand).
  if (type === 'variadic-arrow') {
    const arrowsInput = inputs[1];
    if (!arrowsInput || !valueIsNonNegativeInteger(arrowsInput)) {
      return Decimal.dZero;
    }
    const arrowsN = valueToSafeNumber(arrowsInput);
    if (arrowsN === null || arrowsN < 1) return Decimal.dZero;
    const tier = Math.pow(2, arrowsN);

    let maxMag = new Decimal(0);
    let any = false;
    for (const idx of [0, 2]) {
      const v = inputs[idx];
      if (v === null || v === undefined) continue;
      any = true;
      const m = valueMagnitude(v);
      if (m.gt(maxMag)) maxMag = m;
    }
    if (!any || maxMag.lte(Decimal.dZero)) return Decimal.dZero;
    const logD = maxMag.log10();
    const orderD = logD.lte(Decimal.dOne) ? Decimal.dOne : logD.ceil();
    return orderD.mul(tier);
  }

  const tier = costTier(type);
  if (tier === 0) return Decimal.dZero;

  let maxMag = new Decimal(0);
  let any = false;
  for (const v of inputs) {
    if (v === null || v === undefined) continue;
    any = true;
    const m = valueMagnitude(v);
    if (m.gt(maxMag)) maxMag = m;
  }
  if (!any) return Decimal.dZero;
  if (maxMag.lte(Decimal.dZero)) return Decimal.dZero;

  // ⌈log₁₀(max)⌉, floored at 1. For tetration outputs the log itself can
  // exceed `Number.MAX_SAFE_INTEGER`, so we work in `Decimal` throughout —
  // break_eternity's `log10` returns a Decimal that may itself be huge.
  const logD = maxMag.log10();
  const orderD = logD.lte(Decimal.dOne) ? Decimal.dOne : logD.ceil();
  return orderD.mul(tier);
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
    default:
      return VALUE_ZERO;
  }
}
