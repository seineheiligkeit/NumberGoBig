import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { drawDashedRect, pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY, pencilText } from './typography';

/**
 * Variadic Knuth-arrow cell — `a ↑ⁿ b` (Slice 6.1c).
 *
 * Generalises tetration / pentation by adding a third operand: the arrow
 * count. With `n = 1` it's exponentiation; with `n = 2` tetration; with
 * `n = 3` pentation; beyond that, hyperoperations that have no common
 * name. The dedicated cells stay separate because their fuel-cost
 * profiles are well-understood and the player benefits from named
 * literature entries — but this cell exists for the player who wants to
 * parametrise the operator at runtime.
 *
 * Three operand ports on the left (base, height, arrows) plus the
 * standard fuel port hanging off the bottom. The cell is a touch taller
 * than the binary cells (140 vs 108 px) to give each input its own
 * comfortable row.
 */

import { VARIADIC_ARROW_CELL_WIDTH, VARIADIC_ARROW_CELL_HEIGHT } from '../../../core/cell-geometry';
export { VARIADIC_ARROW_CELL_WIDTH, VARIADIC_ARROW_CELL_HEIGHT };

export function drawVariadicArrowCell(x: number, y: number): Container {
  const container = new Container();
  container.x = x;
  container.y = y;

  const halfW = VARIADIC_ARROW_CELL_WIDTH / 2;
  const halfH = VARIADIC_ARROW_CELL_HEIGHT / 2;

  // Outer hand-drawn frame.
  const frame = new Graphics();
  const cj = (): number => (Math.random() - 0.5) * 2.4;
  const corners = [
    { x: -halfW + cj(), y: -halfH + cj() },
    { x: halfW + cj(), y: -halfH + cj() },
    { x: halfW + cj(), y: halfH + cj() },
    { x: -halfW + cj(), y: halfH + cj() },
  ];
  corners.push({ ...corners[0] });
  pencilStrokeDouble(frame, corners, {
    color: GRAPHITE,
    width: 1.4,
    alpha: 0.55,
    jitter: 0.9,
    segmentsPerUnit: 0.16,
  });
  container.addChild(frame);

  // Three input drop-zones on the left, stacked. Hit areas declared in
  // cell-types.ts must mirror these positions.
  const dropPortX = -halfW + 32;
  drawDashedRect(container, dropPortX, -36, 24, 16);
  drawDashedRect(container, dropPortX, 0, 24, 16);
  drawDashedRect(container, dropPortX, 36, 24, 16);

  // Tiny italic labels next to each input — base / height / arrow-count.
  // Without these the player has no way to tell which port is which.
  const portLabelStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '400',
    fill: GRAPHITE,
  });
  addPortLabel(container, 'a', dropPortX + 30, -36, portLabelStyle);
  addPortLabel(container, 'n', dropPortX + 30, 0, portLabelStyle);
  addPortLabel(container, 'b', dropPortX + 30, 36, portLabelStyle);

  // The operator glyph — `↑ⁿ` (up-arrow with Unicode superscript-n).
  // Reads "the arrow operator with `n` arrows", which is exactly what
  // the cell does.
  const glyphStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 56,
    fontWeight: '500',
    fill: GRAPHITE,
  });
  const glyph = new Text({ text: '↑ⁿ', style: glyphStyle });
  glyph.anchor.set(0.5);
  glyph.x = 10;
  glyph.y = 0;
  glyph.alpha = 0.92;
  glyph.rotation = (Math.random() - 0.5) * 0.06;
  container.addChild(glyph);

  // Output arrow on the right.
  const arrowStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 30,
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const arrow = new Text({ text: '→', style: arrowStyle });
  arrow.anchor.set(0.5);
  arrow.x = halfW - 26;
  arrow.y = 0;
  arrow.alpha = 0.7;
  arrow.rotation = (Math.random() - 0.5) * 0.04;
  container.addChild(arrow);

  // α.5c: fuel port removed. Ladder pulls from pool automatically;
  // no socket needed. (The original "fuel" hint was here.)

  // Cost-preview badge — same shape as binary-cell.ts. The interaction
  // layer calls `updateVariadicArrowCostBadge` whenever pending state
  // mutates.
  // Slice 6.18: cost badge uses `pencilText` for crisp text at max zoom.
  const costStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const costBadge = pencilText('', costStyle);
  costBadge.anchor.set(0.5);
  costBadge.x = 0;
  costBadge.y = halfH - 12;
  costBadge.alpha = 0;
  costBadge.rotation = (Math.random() - 0.5) * 0.04;
  container.addChild(costBadge);
  (container as Container & { __costBadge?: Text }).__costBadge = costBadge;

  container.rotation = (Math.random() - 0.5) * 0.03;
  return container;
}

// The cost-preview badge is updated by the shared `updateCostBadge` in
// `binary-cell.ts` — it reads `container.__costBadge` and filters out
// fuel-slot inputs the same way, so it works for any cell that installs
// the `__costBadge` Text. `computationalCost` routes the variadic-arrow
// case to its arrows-aware tier formula internally.

function addPortLabel(
  parent: Container,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
): void {
  const t = new Text({ text, style });
  t.anchor.set(0.5);
  t.x = x;
  t.y = y;
  t.alpha = 0.6;
  t.rotation = (Math.random() - 0.5) * 0.05;
  parent.addChild(t);
}

// Slice 6.16: `drawDashedRect` is the shared helper from `pencil.ts`.
