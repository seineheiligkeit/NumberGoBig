/**
 * Interaction helpers — pure functions used by every mode.
 *
 * Phase B.3c: extracted out of `interaction/index.ts` so the
 * mode-entry functions in `modes.ts`, the drag/firing logic in
 * `attach.ts`, and the save/load path in `rehydration.ts` all share
 * one home for hit-tests, draw factories, and narrator helpers.
 *
 * Nothing here owns mutable state — `rectOf` and `resolvePipeEndpoint`
 * take a `ControllerCtx` as a read-only reference to the app/canvas
 * but do not write to `ctx.state`.
 */

import type { Container } from 'pixi.js';
import { Text, TextStyle } from 'pixi.js';

import { drawBlock } from '../pixi/block';
import { drawSuccessorCell } from '../pixi/successor-cell';
import {
  drawAdditionCell,
  drawSubtractionCell,
  drawMultiplicationCell,
  drawDivisionCell,
  drawExponentiationCell,
  drawTetrationCell,
  drawPentationCell,
} from '../pixi/binary-cell';
import { drawVariadicArrowCell } from '../pixi/variadic-arrow-cell';
import {
  drawDecrementCell,
  drawFactorCell,
  drawInversionCell,
  drawNegationCell,
  drawSquareRootCell,
} from '../pixi/unary-cell';
import { drawWarehouseCell, updateWarehouseBadge } from '../pixi/warehouse-cell';
import {
  drawArithmeticCell,
  drawFactorialCell,
  drawFibonacciCell,
  drawGeometricCell,
  drawHarmonicCell,
  drawPolynomialCell,
} from '../pixi/cultivation-cell';
import { drawCleanupBot } from '../pixi/cleanup-bot';
import { drawDecomposerBot } from '../pixi/decomposer-bot';
import { drawFilterCell } from '../pixi/filter-cell';
import { drawBattery, type BatteryMode } from '../pixi/battery-cell';
import { drawSetCell } from '../pixi/set-cell';
import { screenToCanvas } from '../camera';
import { PENCIL_FONT_FAMILY } from '../pixi/typography';
import {
  findCellOutputPortAt,
  findCellPortAt,
  warehouseCapacity,
  type PipeEndpoint,
  type PlacedCell,
} from '../world';
import { getWarehouseRule } from '../../../core/warehouse-rules';
import { valueLabel, type Value } from '../../../core/value';
import { valueColor } from '../family';
import type { CellType } from '../../../core/cell-types';
import type { ControllerCtx } from './index';

// Drawing — block used only via re-export so siblings don't have to
// reach across the directory. Re-exported here would also work but
// adds noise; siblings import drawBlock directly.

/** Convenience: forwarded so `drawBlock` lives next to its sibling helpers. */
export { drawBlock };

/** Canvas rect for the active Pixi application — used by every mode
 *  that converts mouse client-coords to canvas-coords. */
export function rectOf(ctx: ControllerCtx): DOMRect {
  return ctx.app.canvas.getBoundingClientRect();
}

/** Render a per-firing ladder as a compact human label, e.g.
 *  `4 zeros + 2 ones + 1 two`. */
export function describeLadder(ladder: Map<number, number>): string {
  if (ladder.size === 0) return '—';
  const NAMES: Record<number, string> = {
    0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
  };
  const sorted = Array.from(ladder.entries()).sort((a, b) => a[0] - b[0]);
  return sorted
    .map(([v, c]) => {
      const name = NAMES[v] ?? `value ${v}`;
      const plural = c === 1 ? name : `${name}s`;
      return `${c} ${plural}`;
    })
    .join(' + ');
}

/**
 * Renders a small graphite numeral inside a filled input port. Sized to
 * fit within the port hit-area, slightly faded.
 */
export function makePendingDisplay(value: Value): Text {
  const text = new Text({
    text: valueLabel(value),
    style: new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: 24,
      fontWeight: '500',
      fill: valueColor(value),
    }),
  });
  text.anchor.set(0.5);
  text.alpha = 0.88;
  return text;
}

/** Friendly cell-type label for narrator messages. */
export function cellLabel(type: CellType): string {
  // Exhaustive switch — adding a CellType variant forces an update.
  switch (type) {
    case 'multiplication': return 'Multiplication';
    case 'division': return 'Division';
    case 'exponentiation': return 'Exponentiation';
    case 'tetration': return 'Tetration';
    case 'pentation': return 'Pentation';
    case 'variadic-arrow': return 'Knuth Arrow';
    case 'successor': return 'Successor';
    case 'addition': return 'Addition';
    case 'subtraction': return 'Subtraction';
    case 'decrement': return 'Decrement';
    case 'factor': return 'Factor';
    case 'square-root': return 'Square Root';
    case 'negation': return 'Negation';
    case 'inversion': return 'Inversion';
    case 'warehouse': return 'Warehouse';
    case 'warehouse-rule': return 'Generalized Warehouse';
    case 'filter': return 'Filter';
    case 'cultivation-arithmetic': return 'Arithmetic cultivation';
    case 'cultivation-geometric': return 'Geometric cultivation';
    case 'cultivation-fibonacci': return 'Fibonacci cultivation';
    case 'cultivation-harmonic': return 'Harmonic cultivation';
    case 'cultivation-polynomial': return 'Polynomial cultivation';
    case 'cultivation-factorial': return 'Factorial cultivation';
    case 'cleanup-bot': return 'Translation Operator';
    case 'factor-bot': return 'Factor Operator';
    case 'decrement-bot': return 'Decrement Operator';
    case 'inversion-bot': return 'Inversion Operator';
    case 'battery': return 'Battery';
    case 'singleton': return 'Singleton';
    case 'count': return 'Count';
    case 'unfold': return 'Unfold';
    case 'powerset': return 'Power set';
    case 'set-union': return 'Union';
    case 'set-intersect': return 'Intersection';
    case 'set-diff': return 'Difference';
    case 'set-symdiff': return 'Symmetric difference';
  }
}

/**
 * Hit-test for a point against a single cell's input or output ports.
 * Used to decide whether a click should start a cell-move drag — clicks
 * ON a port keep their existing semantics and don't initiate a body-drag.
 */
export function clickIsOnPort(cell: PlacedCell, x: number, y: number): boolean {
  for (const p of cell.inputs) {
    const px = cell.container.x + p.offsetX;
    const py = cell.container.y + p.offsetY;
    if (Math.abs(x - px) <= p.halfWidth && Math.abs(y - py) <= p.halfHeight) return true;
  }
  // Output port hit-radius mirrors `findCellOutputPortAt`'s 22 px.
  for (const p of cell.outputs) {
    const px = cell.container.x + p.offsetX;
    const py = cell.container.y + p.offsetY;
    if (Math.hypot(x - px, y - py) <= 22) return true;
  }
  return false;
}

export function installWarehouseRefresh(cell: PlacedCell): void {
  // γ.3: capacity is dynamic — fetch it on each refresh.
  cell.refreshBadge = () => updateWarehouseBadge(cell, warehouseCapacity());
  cell.refreshBadge();
}

export function drawCellByType(type: CellType, ruleId?: string, batteryMode?: BatteryMode): Container {
  switch (type) {
    case 'successor': return drawSuccessorCell(0, 0);
    case 'addition': return drawAdditionCell(0, 0);
    case 'subtraction': return drawSubtractionCell(0, 0);
    case 'multiplication': return drawMultiplicationCell(0, 0);
    case 'division': return drawDivisionCell(0, 0);
    case 'exponentiation': return drawExponentiationCell(0, 0);
    case 'tetration': return drawTetrationCell(0, 0);
    case 'pentation': return drawPentationCell(0, 0);
    case 'variadic-arrow': return drawVariadicArrowCell(0, 0);
    case 'decrement': return drawDecrementCell(0, 0);
    case 'factor': return drawFactorCell(0, 0);
    case 'square-root': return drawSquareRootCell(0, 0);
    case 'negation': return drawNegationCell(0, 0);
    case 'inversion': return drawInversionCell(0, 0);
    case 'warehouse': return drawWarehouseCell(0, 0);
    case 'warehouse-rule': {
      const rule = getWarehouseRule(ruleId);
      return drawWarehouseCell(0, 0, rule?.label ?? '?');
    }
    case 'filter': {
      const rule = getWarehouseRule(ruleId);
      return drawFilterCell(0, 0, rule?.label ?? '?');
    }
    case 'cultivation-arithmetic': return drawArithmeticCell(0, 0);
    case 'cultivation-geometric': return drawGeometricCell(0, 0);
    case 'cultivation-fibonacci': return drawFibonacciCell(0, 0);
    case 'cultivation-harmonic': return drawHarmonicCell(0, 0);
    case 'cultivation-polynomial': return drawPolynomialCell(0, 0);
    case 'cultivation-factorial': return drawFactorialCell(0, 0);
    case 'cleanup-bot': return drawCleanupBot(0, 0);
    case 'factor-bot': return drawDecomposerBot(0, 0, { glyph: 'F' });
    case 'decrement-bot': return drawDecomposerBot(0, 0, { glyph: 'D' });
    case 'inversion-bot': return drawDecomposerBot(0, 0, { glyph: '1/x' });
    case 'battery': return drawBattery(batteryMode ?? 'add', 0, 0);
    case 'singleton':
    case 'count':
    case 'unfold':
    case 'powerset':
    case 'set-union':
    case 'set-intersect':
    case 'set-diff':
    case 'set-symdiff':
      return drawSetCell(type);
  }
}

export function placementMarginalia(type: CellType): { text: string; key: string } | null {
  switch (type) {
    case 'successor':
      return { text: '{ } awaits its first zero.', key: 'first_successor_placed' };
    case 'addition':
      return { text: '+ awaits two summands.', key: 'first_addition_placed' };
    case 'subtraction':
      return {
        text: '− awaits a minuend (top) and a subtrahend (bottom). Negatives await on the other side.',
        key: 'first_subtraction_placed',
      };
    case 'multiplication':
      return { text: '× awaits two factors.', key: 'first_multiplication_placed' };
    case 'division':
      return {
        text: '÷ awaits a dividend (top) and a divisor (bottom). Rationals at the ready.',
        key: 'first_division_placed',
      };
    case 'exponentiation':
      return { text: '^ awaits a base and an exponent.', key: 'first_exponentiation_placed' };
    case 'tetration':
      return {
        text: '↑↑ awaits a base (top) and a height (bottom). Wire fuel — this one does not improvise.',
        key: 'first_tetration_placed',
      };
    case 'pentation':
      return {
        text: '↑↑↑ awaits a base and a height. Heights past three become unspeakable. Wire fuel and use small numbers.',
        key: 'first_pentation_placed',
      };
    case 'variadic-arrow':
      return {
        text: '↑ⁿ awaits a base (top), an arrow count n (middle), and a height (bottom). Fuel scales as 2ⁿ.',
        key: 'first_variadic_arrow_placed',
      };
    case 'decrement':
      return {
        text: 'Decrement: pulls a 1 free from anything it can.',
        key: 'first_decrement_placed',
      };
    case 'factor':
      return {
        text: 'Factor: reduces a composite to its primes. The score will object.',
        key: 'first_factor_placed',
      };
    case 'square-root':
      return {
        text: '√ awaits a non-negative input. Non-squares emerge as something irrational.',
        key: 'first_square_root_placed',
      };
    case 'negation':
      return {
        text: 'Negation: a single input, flipped in sign. The minus sign on demand.',
        key: 'first_negation_placed',
      };
    case 'inversion':
      return {
        text: 'Inversion: n becomes 1/n. The fuel cost is signed — small inputs to big outputs accept negative fuel.',
        key: 'first_inversion_placed',
      };
    case 'warehouse':
      return {
        text: 'Warehouse: deposits on the left, withdrawals on the right. Untyped until the first drop.',
        key: 'first_warehouse_placed',
      };
    case 'warehouse-rule':
      return {
        text: 'Generalized warehouse: accepts any block matching its rule, in mixed company.',
        key: 'first_warehouse_rule_placed',
      };
    case 'filter':
      return {
        text: 'Filter cell: matches go out the top, the rest fall through the bottom.',
        key: 'first_filter_placed',
      };
    case 'cultivation-arithmetic':
      return {
        text: 'Arithmetic cultivation: each input emerges as a + n where n advances per firing.',
        key: 'first_cultivation_arithmetic',
      };
    case 'cultivation-geometric':
      return {
        text: 'Geometric cultivation: each input is doubled n times. Grows quickly.',
        key: 'first_cultivation_geometric',
      };
    case 'cultivation-fibonacci':
      return {
        text: 'Fibonacci cultivation: each input scales by the n-th Fibonacci number.',
        key: 'first_cultivation_fibonacci',
      };
    case 'cultivation-harmonic':
      return {
        text: 'Harmonic cultivation: each input scales by Hₙ — the n-th harmonic sum. Painfully slow.',
        key: 'first_cultivation_harmonic',
      };
    case 'cultivation-polynomial':
      return {
        text: 'Polynomial cultivation: each input scales by (n+1)². Quadratic growth.',
        key: 'first_cultivation_polynomial',
      };
    case 'cultivation-factorial':
      return {
        text: 'Factorial cultivation: each input scales by (n+1)!. Terrifying.',
        key: 'first_cultivation_factorial',
      };
    case 'cleanup-bot':
      return {
        text: 'A Translation Operator. The worker fetches loose blocks within reach and carries them to a matching warehouse.',
        key: 'first_cleanup_bot',
      };
    case 'factor-bot':
      return {
        text: 'A Factor Operator. The worker walks to a loose block within its rating and splits it into prime factors in place. Reads what you cannot.',
        key: 'first_factor_bot',
      };
    case 'decrement-bot':
      return {
        text: 'A Decrement Operator. The worker walks to a loose block within its rating and removes one. Slow, brute-force salvage.',
        key: 'first_decrement_bot',
      };
    case 'inversion-bot':
      return {
        text: 'An Inversion Operator. The worker walks to a loose block within its rating and replaces it with its reciprocal.',
        key: 'first_inversion_bot',
      };
    case 'battery':
      return {
        text: 'A battery, trained on the Front. It pulls ammo from your stock and fires at the nearest correction — no wiring required.',
        key: 'first_battery_placed',
      };
    case 'singleton':
      return { text: '{·} wraps a value in a one-element set. The smallest possible set.', key: 'first_singleton_placed' };
    case 'count':
      return { text: '|·| counts a set into a number — the one bridge back to the economy.', key: 'first_count_placed' };
    case 'unfold':
      return { text: 'Unfold turns a number n into the set {0, 1, …, n−1}. A number IS a set.', key: 'first_unfold_placed' };
    case 'powerset':
      return { text: '𝒫 forms ALL subsets — 2^n of them. This is why numbers go big (Cantor).', key: 'first_powerset_placed' };
    case 'set-union':
      return { text: '∪ pours two sets together — duplicates merge (a set has no repeats).', key: 'first_union_placed' };
    case 'set-intersect':
      return { text: '∩ keeps only what both sets share. Set "AND".', key: 'first_intersect_placed' };
    case 'set-diff':
      return { text: '∖ removes the right set from the left.', key: 'first_diff_placed' };
    case 'set-symdiff':
      return { text: '△ keeps what is in exactly one of the two sets. Set "XOR".', key: 'first_symdiff_placed' };
  }
}

/** Structural equality on PipeEndpoint discriminated union. */
export function endpointsEqual(a: PipeEndpoint, b: PipeEndpoint): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'river' && b.kind === 'river') {
    return a.screenX === b.screenX && a.screenY === b.screenY;
  }
  if (
    (a.kind === 'cell-output' || a.kind === 'cell-input') &&
    (b.kind === 'cell-output' || b.kind === 'cell-input')
  ) {
    return a.cellId === b.cellId && a.portIndex === b.portIndex;
  }
  return false;
}

/**
 * Resolves a click coordinate to a pipe endpoint, or null if neither a
 * matching port nor the river area was clicked. `side` constrains the
 * kind of endpoint sought: `'source'` accepts cell-output ports and the
 * river area; `'dest'` accepts cell-input ports.
 */
export function resolvePipeEndpoint(
  ctx: ControllerCtx,
  side: 'source' | 'dest',
  canvasX: number,
  canvasY: number,
  screenX: number,
  screenY: number,
): { endpoint: PipeEndpoint; pos: { x: number; y: number } } | null {
  if (side === 'source') {
    const outHit = findCellOutputPortAt(canvasX, canvasY);
    if (outHit) {
      const port = outHit.cell.outputs[outHit.portIndex];
      return {
        endpoint: { kind: 'cell-output', cellId: outHit.cell.id, portIndex: outHit.portIndex },
        pos: {
          x: outHit.cell.container.x + port.offsetX,
          y: outHit.cell.container.y + port.offsetY,
        },
      };
    }
    // River area: the bottom 170 px of the screen (river band height ~160 +
    // a forgiving margin). River endpoints store *screen* coords so the
    // pipe's start point stays pinned to the river through pan and zoom.
    if (screenY >= ctx.app.screen.height - 170) {
      return {
        endpoint: { kind: 'river', screenX, screenY },
        pos: screenToCanvas(screenX, screenY),
      };
    }
    return null;
  }

  const inHit = findCellPortAt(canvasX, canvasY);
  if (!inHit) return null;
  const port = inHit.cell.inputs[inHit.portIndex];
  return {
    endpoint: { kind: 'cell-input', cellId: inHit.cell.id, portIndex: inHit.portIndex },
    pos: {
      x: inHit.cell.container.x + port.offsetX,
      y: inHit.cell.container.y + port.offsetY,
    },
  };
}
