import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';

/**
 * Shared rendering for unary equation cells — currently Decrement and Factor.
 *
 * A single input drop-zone on the left, a hand-lettered glyph in the middle,
 * a primary output arrow on the right, and (optionally) one or more
 * secondary output indicators pointing elsewhere (e.g. the `1` block that
 * falls out the bottom of Decrement).
 *
 * Port positions and hit-areas are defined centrally in `cell-types.ts`
 * (`CELL_SHAPES`); the visuals drawn here must stay in sync.
 */

export const UNARY_CELL_WIDTH = 168;
export const UNARY_CELL_HEIGHT = 88;

export interface UnaryCellOptions {
  /** The glyph centered between input and output ('−1', 'p…', …). */
  symbol: string;
  /** Optional font-size override for the glyph (default 38). */
  symbolFontSize?: number;
  /** Optional vertical offset for the glyph. */
  symbolYOffset?: number;
  /** Extra output indicators (arrow + label) rendered relative to cell center. */
  secondaryOutputs?: readonly { offsetX: number; offsetY: number; label: string }[];
}

export function drawUnaryCell(x: number, y: number, options: UnaryCellOptions): Container {
  const { symbol, symbolFontSize = 38, symbolYOffset = 0, secondaryOutputs = [] } = options;

  const container = new Container();
  container.x = x;
  container.y = y;

  const halfW = UNARY_CELL_WIDTH / 2;
  const halfH = UNARY_CELL_HEIGHT / 2;

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

  // Input drop-zone on the left.
  drawDashedRect(container, -halfW + 32, 0, 26, 22);

  // The glyph — hand-lettered, centered.
  const glyphStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: symbolFontSize,
    fontWeight: '500',
    fill: GRAPHITE,
  });
  const glyph = new Text({ text: symbol, style: glyphStyle });
  glyph.anchor.set(0.5);
  glyph.x = 8;
  glyph.y = symbolYOffset;
  glyph.alpha = 0.92;
  glyph.rotation = (Math.random() - 0.5) * 0.06;
  container.addChild(glyph);

  // Primary output arrow on the right.
  const arrowStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 30,
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const arrow = new Text({ text: '→', style: arrowStyle });
  arrow.anchor.set(0.5);
  arrow.x = halfW - 22;
  arrow.y = 0;
  arrow.alpha = 0.7;
  arrow.rotation = (Math.random() - 0.5) * 0.04;
  container.addChild(arrow);

  // Secondary output indicators (e.g. Decrement's `1` falling out below).
  // Each is a small `↓` glyph at the secondary output position with a faint
  // label nearby — a visual hint that something will appear here.
  for (const sec of secondaryOutputs) {
    const tickStyle = new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: 22,
      fontWeight: '400',
      fill: GRAPHITE,
    });
    const tick = new Text({ text: '↓', style: tickStyle });
    tick.anchor.set(0.5);
    tick.x = sec.offsetX;
    tick.y = sec.offsetY - 22;
    tick.alpha = 0.55;
    tick.rotation = (Math.random() - 0.5) * 0.06;
    container.addChild(tick);

    const labelStyle = new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: 16,
      fontWeight: '400',
      fill: GRAPHITE,
    });
    const label = new Text({ text: sec.label, style: labelStyle });
    label.anchor.set(0, 0.5);
    label.x = sec.offsetX + 10;
    label.y = sec.offsetY - 22;
    label.alpha = 0.55;
    label.rotation = (Math.random() - 0.5) * 0.05;
    container.addChild(label);
  }

  // Slight whole-cell rotation so it sits on the page like a hand-placed object.
  container.rotation = (Math.random() - 0.5) * 0.03;

  return container;
}

export function drawDecrementCell(x: number, y: number): Container {
  return drawUnaryCell(x, y, {
    symbol: '−1',
    symbolFontSize: 36,
    // Match CELL_SHAPES.decrement.outputs[1] geometry: the freed `1` drops
    // out below-and-toward-center.
    secondaryOutputs: [{ offsetX: UNARY_CELL_WIDTH / 2 + 56 - 60, offsetY: 78, label: '1' }],
  });
}

export function drawFactorCell(x: number, y: number): Container {
  return drawUnaryCell(x, y, {
    symbol: 'p₁p₂…',
    symbolFontSize: 28,
  });
}

export function drawSquareRootCell(x: number, y: number): Container {
  // `√` reads delicate at small sizes; bump font-size for visual weight.
  return drawUnaryCell(x, y, {
    symbol: '√',
    symbolFontSize: 44,
    symbolYOffset: -2,
  });
}

/**
 * Draws a hand-drawn dashed rectangle centered on (cx, cy). Mirrors the
 * binary-cell helper — duplicated to avoid a cross-file dependency between
 * sibling renderers.
 */
function drawDashedRect(parent: Container, cx: number, cy: number, halfW: number, halfH: number): void {
  const g = new Graphics();
  const dashStep = 7;

  for (let dx = -halfW; dx < halfW; dx += dashStep * 2) {
    g.moveTo(cx + dx, cy - halfH);
    g.lineTo(cx + Math.min(dx + dashStep, halfW), cy - halfH);
    g.moveTo(cx + dx, cy + halfH);
    g.lineTo(cx + Math.min(dx + dashStep, halfW), cy + halfH);
  }
  for (let dy = -halfH; dy < halfH; dy += dashStep * 2) {
    g.moveTo(cx - halfW, cy + dy);
    g.lineTo(cx - halfW, cy + Math.min(dy + dashStep, halfH));
    g.moveTo(cx + halfW, cy + dy);
    g.lineTo(cx + halfW, cy + Math.min(dy + dashStep, halfH));
  }
  g.stroke({ color: GRAPHITE, width: 0.9, alpha: 0.32 });
  parent.addChild(g);
}
