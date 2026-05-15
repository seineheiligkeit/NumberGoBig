/**
 * Cell behaviour registry — what each equation cell looks like and does.
 *
 * Each entry in `CELL_SHAPES` describes the *geometry* of a cell type: where
 * its input ports sit (relative to the cell's center), how big each port's
 * drop hit-area is, and where each output port lands. The `operate` function
 * maps cell type + input values → a list of emit events.
 *
 * Cells may have multiple output ports (Decrement: `n-1` out one side, `1`
 * out another) and a single port may emit multiple blocks per firing
 * (Factor: `12 → 2, 2, 3`). The emit-event list captures both.
 *
 * Adding a new operator is a matter of:
 *   1. extending `CellType`
 *   2. adding a `CELL_SHAPES` entry
 *   3. extending `operate`
 *   4. adding a Literature entry
 *   5. ensuring the pixi layer has a `draw<Whatever>Cell` (binary operators
 *      can reuse `drawBinaryCell`)
 */

import { SUCCESSOR_CELL_WIDTH } from './pixi/successor-cell';
import { BINARY_CELL_WIDTH } from './pixi/binary-cell';
import { UNARY_CELL_WIDTH } from './pixi/unary-cell';
import { WAREHOUSE_CELL_WIDTH } from './pixi/warehouse-cell';
import { CULTIVATION_CELL_WIDTH } from './pixi/cultivation-cell';
import { FILTER_CELL_WIDTH } from './pixi/filter-cell';
import {
  VALUE_ONE,
  VALUE_ZERO,
  valueAdd,
  valueDiv,
  valueIsNonNegativeInteger,
  valueIsZero,
  valueLabel,
  valueLt,
  valueMul,
  valueOf,
  valuePow,
  valueSqrt,
  valueSub,
  valueToSafeNumber,
  type Value,
} from './value';

export type CellType =
  | 'successor'
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
  | 'exponentiation'
  | 'decrement'
  | 'factor'
  | 'square-root'
  | 'warehouse'
  | 'warehouse-rule'
  | 'filter'
  | 'cultivation-arithmetic'
  | 'cultivation-geometric'
  | 'cultivation-fibonacci'
  | 'cleanup-bot';

export function isCultivationType(t: CellType): boolean {
  return (
    t === 'cultivation-arithmetic' ||
    t === 'cultivation-geometric' ||
    t === 'cultivation-fibonacci'
  );
}

export interface CellInputPort {
  /** Offset from cell center to port center, in cell-local pixels. */
  offsetX: number;
  offsetY: number;
  /** Half-extents of the port's axis-aligned hit-area. */
  halfWidth: number;
  halfHeight: number;
  /**
   * Operand by default; `'fuel'` for the optional fuel intake on tier-1+
   * operators (Slice 3.5.5). Operands feed `operate()`; the fuel value is
   * deliberately excluded from the operate input vector and from
   * `computationalCost`, because the fuel block's magnitude is what's
   * being PAID, not what the operator is computing on.
   */
  kind?: 'operand' | 'fuel';
}

export interface CellOutputPort {
  offsetX: number;
  offsetY: number;
}

export interface CellShape {
  inputs: readonly CellInputPort[];
  outputs: readonly CellOutputPort[];
}

/** A single block to emit at a specific output port. */
export interface EmitEvent {
  portIndex: number;
  value: Value;
}

/** Result of firing a cell: zero or more emit events + an optional narrator beat. */
export interface OperateResult {
  emits: readonly EmitEvent[];
  marginalia?: { text: string; key: string };
}

// Binary cells (Addition, Multiplication, Exponentiation) share input
// geometry — two drop-zones on the left at y = ±26 with the same hit-area.
// Pulled into constants to avoid drift between visual and logical positions.
const BINARY_PORT_X = -BINARY_CELL_WIDTH / 2 + 32;
const BINARY_PORT_HALF_W = 26;
const BINARY_PORT_HALF_H = 20;
const BINARY_OUTPUT_X = BINARY_CELL_WIDTH / 2 + 56;

// Fuel port (Slice 3.5.5) — tier-1 cells get an extra small input socket
// hanging off the bottom-centre. Sitting outside the main cell rect makes
// it visually distinct from the operand ports and gives pipes from below
// a natural docking line.
const BINARY_HALF_H = 54; // = BINARY_CELL_HEIGHT / 2 (hand-rolled to keep
// this expression a literal — importing the constant would bind it through
// a runtime cycle).
const BINARY_FUEL_PORT_OFFSET_Y = BINARY_HALF_H + 18;
const BINARY_FUEL_PORT_HALF_W = 22;
const BINARY_FUEL_PORT_HALF_H = 14;

const BINARY_FUEL_INPUT = {
  offsetX: 0,
  offsetY: BINARY_FUEL_PORT_OFFSET_Y,
  halfWidth: BINARY_FUEL_PORT_HALF_W,
  halfHeight: BINARY_FUEL_PORT_HALF_H,
  kind: 'fuel' as const,
};

// Unary cells (Decrement, Factor) — single drop-zone on the left.
const UNARY_INPUT_X = -UNARY_CELL_WIDTH / 2 + 32;
const UNARY_INPUT_HALF_W = 26;
const UNARY_INPUT_HALF_H = 22;
const UNARY_OUTPUT_X = UNARY_CELL_WIDTH / 2 + 56;

export const CELL_SHAPES: Record<CellType, CellShape> = {
  successor: {
    inputs: [{ offsetX: 0, offsetY: 0, halfWidth: 28, halfHeight: 24 }],
    outputs: [{ offsetX: SUCCESSOR_CELL_WIDTH / 2 + 56, offsetY: 0 }],
  },
  addition: {
    inputs: [
      { offsetX: BINARY_PORT_X, offsetY: -26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
      { offsetX: BINARY_PORT_X, offsetY: 26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
    ],
    outputs: [{ offsetX: BINARY_OUTPUT_X, offsetY: 0 }],
  },
  subtraction: {
    // a − b. Minuend on the top port, subtrahend on the bottom.
    inputs: [
      { offsetX: BINARY_PORT_X, offsetY: -26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
      { offsetX: BINARY_PORT_X, offsetY: 26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
    ],
    outputs: [{ offsetX: BINARY_OUTPUT_X, offsetY: 0 }],
  },
  multiplication: {
    inputs: [
      { offsetX: BINARY_PORT_X, offsetY: -26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
      { offsetX: BINARY_PORT_X, offsetY: 26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
      BINARY_FUEL_INPUT,
    ],
    outputs: [{ offsetX: BINARY_OUTPUT_X, offsetY: 0 }],
  },
  division: {
    // a ÷ b. Dividend on top, divisor on bottom.
    inputs: [
      { offsetX: BINARY_PORT_X, offsetY: -26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
      { offsetX: BINARY_PORT_X, offsetY: 26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
      BINARY_FUEL_INPUT,
    ],
    outputs: [{ offsetX: BINARY_OUTPUT_X, offsetY: 0 }],
  },
  exponentiation: {
    inputs: [
      { offsetX: BINARY_PORT_X, offsetY: -26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
      { offsetX: BINARY_PORT_X, offsetY: 26, halfWidth: BINARY_PORT_HALF_W, halfHeight: BINARY_PORT_HALF_H },
      BINARY_FUEL_INPUT,
    ],
    outputs: [{ offsetX: BINARY_OUTPUT_X, offsetY: 0 }],
  },
  decrement: {
    inputs: [{ offsetX: UNARY_INPUT_X, offsetY: 0, halfWidth: UNARY_INPUT_HALF_W, halfHeight: UNARY_INPUT_HALF_H }],
    // Two outputs: `n-1` straight right, `1` below the cell (the freed unit
    // falls out the bottom — a visual cue that this is a decomposition).
    outputs: [
      { offsetX: UNARY_OUTPUT_X, offsetY: 0 },
      { offsetX: UNARY_OUTPUT_X - 60, offsetY: 78 },
    ],
  },
  factor: {
    inputs: [{ offsetX: UNARY_INPUT_X, offsetY: 0, halfWidth: UNARY_INPUT_HALF_W, halfHeight: UNARY_INPUT_HALF_H }],
    outputs: [{ offsetX: UNARY_OUTPUT_X, offsetY: 0 }],
  },
  'square-root': {
    inputs: [{ offsetX: UNARY_INPUT_X, offsetY: 0, halfWidth: UNARY_INPUT_HALF_W, halfHeight: UNARY_INPUT_HALF_H }],
    outputs: [{ offsetX: UNARY_OUTPUT_X, offsetY: 0 }],
  },
  warehouse: {
    // Input port: large drop zone covering the left half of the warehouse —
    // the player should be able to drop blocks anywhere on it without aiming.
    inputs: [
      {
        offsetX: -WAREHOUSE_CELL_WIDTH / 4,
        offsetY: 0,
        halfWidth: WAREHOUSE_CELL_WIDTH / 4 - 4,
        halfHeight: 44,
      },
    ],
    // Output port: right side. Click here to withdraw a single block.
    // Pipes (Slice 3.2) will source from this position automatically.
    outputs: [{ offsetX: WAREHOUSE_CELL_WIDTH / 2 + 32, offsetY: 0 }],
  },
  // Filter cell (Slice 5.2). One input on the left, two outputs on the
  // right — top is "match", bottom is "no-match". The predicate label
  // (set from the cell's ruleId) lives in the middle of the visual.
  filter: {
    inputs: [
      {
        offsetX: -FILTER_CELL_WIDTH / 2 + 32,
        offsetY: 0,
        halfWidth: 26,
        halfHeight: 22,
      },
    ],
    outputs: [
      { offsetX: FILTER_CELL_WIDTH / 2 + 32, offsetY: -34 },
      { offsetX: FILTER_CELL_WIDTH / 2 + 32, offsetY: 34 },
    ],
  },
  // Rule-based warehouse (Slice 3.5.4). Same geometry as the typed warehouse
  // — the player's interaction (deposit zone left, withdraw port right)
  // doesn't change. The difference is internal: instead of locking to a
  // single value on first deposit, the cell carries a predicate and
  // accepts any block matching it (mixed contents).
  'warehouse-rule': {
    inputs: [
      {
        offsetX: -WAREHOUSE_CELL_WIDTH / 4,
        offsetY: 0,
        halfWidth: WAREHOUSE_CELL_WIDTH / 4 - 4,
        halfHeight: 44,
      },
    ],
    outputs: [{ offsetX: WAREHOUSE_CELL_WIDTH / 2 + 32, offsetY: 0 }],
  },
  // Cultivation cells: single seed input, single emit output. The seed
  // installs once and is not consumed; the cell pulses an output value at
  // a fixed cadence following its sequence rule.
  'cultivation-arithmetic': cultivationShape(),
  'cultivation-geometric': cultivationShape(),
  'cultivation-fibonacci': cultivationShape(),
  // Cleanup bots: portless cells. They sweep loose blocks within a radius
  // into the nearest matching warehouse on their own cadence — no inputs
  // for the player to wire, and no outputs to wire from.
  'cleanup-bot': {
    inputs: [],
    outputs: [],
  },
};

function cultivationShape(): CellShape {
  return {
    inputs: [
      {
        offsetX: -CULTIVATION_CELL_WIDTH / 2 + 32,
        offsetY: 0,
        halfWidth: 26,
        halfHeight: 24,
      },
    ],
    outputs: [{ offsetX: CULTIVATION_CELL_WIDTH / 2 + 32, offsetY: 0 }],
  };
}

/** Returns the prime factorization of `n` as an ascending list of primes. */
function primeFactorize(n: number): number[] {
  if (n < 2 || !Number.isInteger(n)) return [];
  const factors: number[] = [];
  let remaining = n;
  for (let p = 2; p * p <= remaining; p++) {
    while (remaining % p === 0) {
      factors.push(p);
      remaining /= p;
    }
  }
  if (remaining > 1) factors.push(remaining);
  return factors;
}

/**
 * Given a cell type and its filled input values (in port order), returns the
 * emit events the cell produces and an optional narrator beat. Pure: no side
 * effects, no world access.
 */
export function operate(type: CellType, inputs: readonly Value[]): OperateResult {
  switch (type) {
    case 'successor':
      return { emits: [{ portIndex: 0, value: valueAdd(inputs[0], VALUE_ONE) }] };
    case 'addition':
      return { emits: [{ portIndex: 0, value: valueAdd(inputs[0], inputs[1]) }] };
    case 'subtraction':
      return { emits: [{ portIndex: 0, value: valueSub(inputs[0], inputs[1]) }] };
    case 'multiplication':
      return { emits: [{ portIndex: 0, value: valueMul(inputs[0], inputs[1]) }] };
    case 'division': {
      if (valueIsZero(inputs[1])) {
        return {
          emits: [],
          marginalia: {
            text: 'You attempted to divide by zero. We are not even going to acknowledge this.',
            key: 'division_by_zero',
          },
        };
      }
      return { emits: [{ portIndex: 0, value: valueDiv(inputs[0], inputs[1]) }] };
    }
    case 'exponentiation':
      return { emits: [{ portIndex: 0, value: valuePow(inputs[0], inputs[1]) }] };
    case 'decrement': {
      const v = inputs[0];
      // Negatives exist as of Slice 4.1 — decrement now works on the whole
      // integer line. The decomposition invariant is preserved: `n` emits
      // `n − 1` straight ahead and a free `+1` out the bottom, summing to
      // the original. For negatives (`-5 → -6 + 1`) that's mathematically
      // honest, if conceptually amusing.
      return {
        emits: [
          { portIndex: 0, value: valueSub(v, VALUE_ONE) },
          { portIndex: 1, value: VALUE_ONE },
        ],
      };
    }
    case 'factor': {
      const v = inputs[0];
      // Negatives refuse explicitly — the sign isn't part of a prime
      // factorisation in any conventional sense, and a quiet pass-through
      // would be wrong. Phase 3 Slice 4.1 onwards.
      if (valueLt(v, VALUE_ZERO)) {
        return {
          emits: [],
          marginalia: {
            text: `Factor declines to assign sign. ${valueLabel(v)} keeps its negativity to itself.`,
            key: 'factor_negative',
          },
        };
      }
      // Factor needs a safe JS integer to run the trial-division loop. Big
      // composites past 2^53 are out of reach — refuse with a narrator beat
      // rather than producing garbage. Phase 5 will revisit with a
      // Decimal-aware factoriser.
      if (!valueIsNonNegativeInteger(v)) {
        return {
          emits: [],
          marginalia: {
            text: `${valueLabel(v)} is not yet in a shape Factor can grasp.`,
            key: 'factor_non_integer',
          },
        };
      }
      const n = valueToSafeNumber(v);
      if (n === null) {
        return {
          emits: [],
          marginalia: {
            text: 'This number is too large for the current Factor. A heavier mill awaits in later literature.',
            key: 'factor_too_large',
          },
        };
      }
      const factors = primeFactorize(n);
      if (factors.length === 0) {
        return {
          emits: [],
          marginalia: {
            text: `${n} has no prime factorisation. Returned untouched would be charitable; returned at all would be a lie.`,
            key: 'factor_indivisible',
          },
        };
      }
      if (factors.length === 1) {
        // n is prime — pass it through unchanged.
        return {
          emits: [{ portIndex: 0, value: valueOf(factors[0]) }],
          marginalia: {
            text: `${n} is prime. Factor returns it unbroken.`,
            key: 'factor_prime_passthrough',
          },
        };
      }
      return {
        emits: factors.map((p) => ({ portIndex: 0, value: valueOf(p) })),
      };
    }
    case 'square-root': {
      // Negatives no longer refuse — Slice 4.4 routes them through the
      // complex plane. `valueSqrt` handles every variant correctly.
      return { emits: [{ portIndex: 0, value: valueSqrt(inputs[0]) }] };
    }
    case 'warehouse':
    case 'warehouse-rule':
    case 'filter':
      // Warehouses and filters don't fire through operate(). Deposits,
      // withdrawals, and predicate-routing are handled directly by the
      // interaction layer; this branch exists only for exhaustiveness.
      return { emits: [] };
    case 'cultivation-arithmetic':
    case 'cultivation-geometric':
    case 'cultivation-fibonacci':
      // Cultivation cells emit on a timer, not on full-input firing. The
      // automation tick computes their emissions via `cultivationEmit`;
      // operate() returns an empty list for exhaustiveness only.
      return { emits: [] };
    case 'cleanup-bot':
      // Cleanup bots have no operation — they sweep, they don't fire.
      return { emits: [] };
  }
}

// Computational cost moved to `./cost.ts` in Slice 3.5.1 — see that module
// for the magnitude-scaled formula. Re-exported from here so the existing
// `import { computationalCost } from './cell-types'` call sites keep working.
export { computationalCost } from './cost';

// `cultivationEmit` moved to `./cost.ts` in Slice 3.5.6 so the renderer's
// next-emission preview can import it without threading a runtime cycle
// (pixi/cultivation-cell → cell-types → pixi/cultivation-cell). Re-exported
// from here so existing imports stay valid.
export { cultivationEmit } from './cost';
