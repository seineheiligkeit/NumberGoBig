import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { drawDashedRect, pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';
import type { PlacedCell } from '../world';
import { valueLabel } from '../../../core/value';
import { valueColor } from '../family';
import { getWarehouseRule } from '../../../core/warehouse-rules';

/**
 * Warehouse — typed storage cell.
 *
 * Visually: a hand-drawn box (taller and wider than equation cells) with a
 * dashed deposit zone on the left, a small output arrow on the right, and a
 * large penciled "N / cap" readout in the centre. Once typed (after the
 * first deposit), the stored value appears as a glyph above the count.
 *
 * Drops onto the deposit zone add to the stack; clicks on the output port
 * withdraw one block (and start a drag at the cursor). Pipes in Slice 3.2
 * source from the output port as well.
 */

import { WAREHOUSE_CELL_WIDTH, WAREHOUSE_CELL_HEIGHT } from '../../../core/cell-geometry';
export { WAREHOUSE_CELL_WIDTH, WAREHOUSE_CELL_HEIGHT };

/**
 * Draws a warehouse cell. When `ruleLabel` is provided (e.g. "< 10",
 * "prime"), the cell renders as a rule-based warehouse — the centre
 * type-glyph carries the predicate label permanently, and the count
 * reflects total mixed contents instead of a single locked value.
 */
export function drawWarehouseCell(_x: number, _y: number, ruleLabel?: string): Container {
  const container = new Container();

  const halfW = WAREHOUSE_CELL_WIDTH / 2;
  const halfH = WAREHOUSE_CELL_HEIGHT / 2;

  // Outer frame — same wobble pattern as the equation cells but with a
  // slightly heavier inner line, so a warehouse reads as "a container."
  const frame = new Graphics();
  const cj = (): number => (Math.random() - 0.5) * 2.6;
  const corners = [
    { x: -halfW + cj(), y: -halfH + cj() },
    { x: halfW + cj(), y: -halfH + cj() },
    { x: halfW + cj(), y: halfH + cj() },
    { x: -halfW + cj(), y: halfH + cj() },
  ];
  corners.push({ ...corners[0] });
  pencilStrokeDouble(frame, corners, {
    color: GRAPHITE,
    width: 1.6,
    alpha: 0.6,
    jitter: 1.0,
    segmentsPerUnit: 0.16,
  });
  // Second inner pass — gives the box a faint double-wall look.
  const innerCorners = [
    { x: -halfW + 6 + cj() * 0.4, y: -halfH + 6 + cj() * 0.4 },
    { x: halfW - 6 + cj() * 0.4, y: -halfH + 6 + cj() * 0.4 },
    { x: halfW - 6 + cj() * 0.4, y: halfH - 6 + cj() * 0.4 },
    { x: -halfW + 6 + cj() * 0.4, y: halfH - 6 + cj() * 0.4 },
  ];
  innerCorners.push({ ...innerCorners[0] });
  pencilStrokeDouble(frame, innerCorners, {
    color: GRAPHITE,
    width: 0.9,
    alpha: 0.32,
    jitter: 0.5,
    segmentsPerUnit: 0.12,
  });
  container.addChild(frame);

  // Deposit zone (left half).
  drawDashedRect(container, -halfW / 2, 0, halfW / 2 - 4, 44);

  // Hand-noted hints above each port — italic lowercase, slightly tilted,
  // like a mathematician annotating their own diagram. They sit at the top
  // edge of the cell so they don't crowd the deposit zone or the centre
  // readout.
  const hintStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const dropHint = new Text({ text: 'in', style: hintStyle });
  dropHint.anchor.set(0.5);
  dropHint.x = -halfW / 2;
  dropHint.y = -halfH + 12;
  dropHint.alpha = 0.55;
  dropHint.rotation = (Math.random() - 0.5) * 0.06;
  container.addChild(dropHint);

  const withdrawHint = new Text({ text: 'out', style: hintStyle });
  withdrawHint.anchor.set(0.5);
  withdrawHint.x = halfW - 28;
  withdrawHint.y = -halfH + 12;
  withdrawHint.alpha = 0.55;
  withdrawHint.rotation = (Math.random() - 0.5) * 0.06;
  container.addChild(withdrawHint);

  // Output arrow on the right.
  const arrowStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 26,
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const arrow = new Text({ text: '→', style: arrowStyle });
  arrow.anchor.set(0.5);
  arrow.x = halfW - 18;
  arrow.y = 0;
  arrow.alpha = 0.65;
  arrow.rotation = (Math.random() - 0.5) * 0.04;
  container.addChild(arrow);

  // Centre badge: large "N / cap" with optional typed-value glyph above.
  // The badge updates via the `refreshBadge` callback installed by the
  // interaction layer once the cell is registered.
  const badge = new Container();
  badge.x = 4;
  badge.y = 0;
  container.addChild(badge);

  // Rule labels (`prime`, `composite`) are wider than typed glyphs
  // (`1`, `144`), so we shrink the font for long labels to keep them
  // inside the cell's centre area.
  const typeFontSize = ruleLabel && ruleLabel.length > 4 ? 18 : 26;
  const typeGlyphStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: typeFontSize,
    fontWeight: '500',
    fontStyle: ruleLabel ? 'italic' : 'normal',
    fill: GRAPHITE,
  });
  const typeGlyph = new Text({ text: ruleLabel ?? '—', style: typeGlyphStyle });
  typeGlyph.anchor.set(0.5);
  typeGlyph.y = -16;
  typeGlyph.alpha = ruleLabel ? 0.85 : 0.8;
  badge.addChild(typeGlyph);

  const countStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 18,
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const countLabel = new Text({ text: '0 / 100', style: countStyle });
  countLabel.anchor.set(0.5);
  countLabel.y = 14;
  countLabel.alpha = 0.75;
  badge.addChild(countLabel);

  // Stash the text references on the container so the interaction layer
  // can install a refresh callback once the cell is registered.
  (container as Container & { __warehouseBadge?: { type: Text; count: Text } }).__warehouseBadge = {
    type: typeGlyph,
    count: countLabel,
  };

  // Slight whole-cell rotation so it sits like a hand-placed object.
  // Slice 6.16: standardised to 0.03 across all cells (was 0.025 here).
  container.rotation = (Math.random() - 0.5) * 0.03;

  return container;
}

/**
 * Updates a warehouse cell's centre badge to reflect its current state.
 * Called by the interaction layer after deposit/withdraw, and at restore.
 */
export function updateWarehouseBadge(cell: PlacedCell, cellCapacity: number): void {
  const badge = (cell.container as Container & {
    __warehouseBadge?: { type: Text; count: Text };
  }).__warehouseBadge;
  if (!badge) return;

  if (cell.type === 'warehouse-rule') {
    // The rule label is installed at construction and never changes; the
    // only thing that varies here is the count. Total counts items across
    // every (value, count) pair the cell holds. Inlined here rather than
    // calling `ruleWarehouseTotal` from `../world` to avoid a runtime
    // cycle (pixi/warehouse-cell → world → cell-types → pixi/warehouse-cell).
    let total = 0;
    for (const item of cell.ruleItems ?? []) total += item.count;
    // γ.3: capacity is dynamic, scales with Comprehension. Caller
    // (interaction.ts) passes it in via the curried refreshBadge —
    // keeps `warehouse-cell.ts` runtime-import-free from `world.ts`
    // and avoids the cell-types ↔ pixi/* cycle CLAUDE.md warns about.
    const cap = cellCapacity;
    const rule = getWarehouseRule(cell.ruleId);
    if (rule) badge.type.text = rule.label;
    badge.count.text = `${total} / ${cap}`;
    badge.count.alpha = total >= cap ? 1.0 : 0.75;
    return;
  }

  const v = cell.storedValue;
  const n = cell.storedCount ?? 0;
  const cap = cellCapacity;
  badge.type.text = v === null || v === undefined ? '—' : valueLabel(v);
  // Tint the type glyph by family — a warehouse holding negatives reads
  // accent-blue at a glance, the same hint the blocks themselves carry.
  badge.type.style.fill = v ? valueColor(v) : GRAPHITE;
  badge.count.text = `${n} / ${cap}`;
  // Visual cue when full: bold the count.
  badge.count.alpha = n >= cap ? 1.0 : 0.75;
}

// Slice 6.16: `drawDashedRect` is the shared helper from `pencil.ts`.
