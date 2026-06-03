/**
 * Cell behaviour — what each operator cell computes.
 *
 * Time-as-Labor prototype: pared down to the constructive operator hierarchy
 * (Successor → Pentation). `operate(type, inputs)` is a pure function from a
 * cell type + its operand values to the blocks it emits. No geometry, no cost,
 * no fuel here — those are the engine's job (core/engine.ts) and the cost
 * math's (core/time.ts). The reducing operators, sets, cultivators, bots, and
 * warehouses from the old game are intentionally gone; they return later atop
 * this working core.
 */

import {
  VALUE_ONE,
  valueAdd,
  valueIsNonNegativeInteger,
  valueLabel,
  valueMul,
  valuePow,
  valuePentate,
  valueTetrate,
  valueToSafeNumber,
  PENTATE_HEIGHT_CAP,
  TETRATE_HEIGHT_CAP,
  type Value,
} from './value.ts';

/** The constructive operator hierarchy (mirrors engine.ts `CellKind`). */
export type CellType =
  | 'successor'
  | 'addition'
  | 'multiplication'
  | 'exponentiation'
  | 'tetration'
  | 'pentation';

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

/**
 * Given a cell type and its operand values (in port order), returns the emit
 * events the cell produces and an optional narrator beat. Pure: no side
 * effects, no world access. Successor receives a single river zero as input[0].
 */
export function operate(type: CellType, inputs: readonly Value[]): OperateResult {
  switch (type) {
    case 'successor':
      return { emits: [{ portIndex: 0, value: valueAdd(inputs[0], VALUE_ONE) }] };
    case 'addition':
      return { emits: [{ portIndex: 0, value: valueAdd(inputs[0], inputs[1]) }] };
    case 'multiplication':
      return { emits: [{ portIndex: 0, value: valueMul(inputs[0], inputs[1]) }] };
    case 'exponentiation':
      return { emits: [{ portIndex: 0, value: valuePow(inputs[0], inputs[1]) }] };
    case 'tetration': {
      // `a ↑↑ b` — a tower of `b` copies of `a`. Constraints refuse rather
      // than emit a wrong answer: real base only, non-negative integer height,
      // bounded by TETRATE_HEIGHT_CAP so a pathological height can't lock up.
      const a = inputs[0];
      const b = inputs[1];
      if (a.kind === 'complex') {
        return refuse('Tetration of a complex base is beyond this Literature.', 'tetration_complex_base');
      }
      if (!valueIsNonNegativeInteger(b)) {
        return refuse(
          `Tetration requires a non-negative integer height. ${valueLabel(b)} declined.`,
          'tetration_non_integer_height',
        );
      }
      const h = valueToSafeNumber(b);
      if (h !== null && h > TETRATE_HEIGHT_CAP) {
        return refuse(
          `Tetration height ${valueLabel(b)} exceeds the cap of ${TETRATE_HEIGHT_CAP}.`,
          'tetration_overflow',
        );
      }
      const result = valueTetrate(a, b);
      if (result === null) return refuse('Tetration declined the configuration.', 'tetration_refused');
      return { emits: [{ portIndex: 0, value: result }] };
    }
    case 'pentation': {
      // `a ↑↑↑ b` — repeated tetration. Tighter height cap; same refusals.
      const a = inputs[0];
      const b = inputs[1];
      if (a.kind === 'complex') {
        return refuse('Pentation of a complex base is beyond this Literature.', 'pentation_complex_base');
      }
      if (!valueIsNonNegativeInteger(b)) {
        return refuse(
          `Pentation requires a non-negative integer height. ${valueLabel(b)} declined.`,
          'pentation_non_integer_height',
        );
      }
      const h = valueToSafeNumber(b);
      if (h !== null && h > PENTATE_HEIGHT_CAP) {
        return refuse(
          `Pentation height ${valueLabel(b)} exceeds the cap of ${PENTATE_HEIGHT_CAP}.`,
          'pentation_overflow',
        );
      }
      const result = valuePentate(a, b);
      if (result === null) return refuse('Pentation declined the configuration.', 'pentation_refused');
      return { emits: [{ portIndex: 0, value: result }] };
    }
  }
}

function refuse(text: string, key: string): OperateResult {
  return { emits: [], marginalia: { text, key } };
}
