import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import Decimal from 'break_eternity.js';
import { drawDashedRect, pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY, pencilText } from './typography';
import { computationalCost, fuelLadder } from '../cost';
import type { PlacedCell } from '../world';

/**
 * Shared rendering for binary equation cells: Addition, Multiplication, and
 * (later) Exponentiation. All three have the same shape — two input drop-zones
 * stacked on the left, a hand-lettered operator symbol in the middle, an
 * output arrow on the right — and differ only in the glyph drawn.
 *
 * Port positions and hit-areas are defined centrally in `cell-types.ts`
 * (`CELL_SHAPES`); the visual drop-zones drawn here must stay in sync with
 * that geometry.
 */

export const BINARY_CELL_WIDTH = 200;
export const BINARY_CELL_HEIGHT = 108;

export interface BinaryCellOptions {
  /** The operator glyph centered between the two inputs ('+', '×', '^', …). */
  symbol: string;
  /** Optional font-size override for the glyph (default 56). */
  symbolFontSize?: number;
  /** Optional vertical offset for the glyph (some symbols read better raised). */
  symbolYOffset?: number;
  /**
   * When true (multiplication, division, exponentiation in Slice 3.5.5),
   * a small fuel intake is drawn hanging off the cell's bottom-centre.
   * Operand-only cells (addition, subtraction) keep the cell rectangle
   * clean by leaving this off.
   */
  hasFuelPort?: boolean;
}

export function drawBinaryCell(x: number, y: number, options: BinaryCellOptions): Container {
  const { symbol, symbolFontSize = 56, symbolYOffset = 0, hasFuelPort = false } = options;

  const container = new Container();
  container.x = x;
  container.y = y;

  const halfW = BINARY_CELL_WIDTH / 2;
  const halfH = BINARY_CELL_HEIGHT / 2;

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

  // Two input drop-zones on the left, vertically stacked.
  const dropPortX = -halfW + 32;
  drawDashedRect(container, dropPortX, -26, 26, 20);
  drawDashedRect(container, dropPortX, 26, 26, 20);

  // The operator glyph — hand-lettered, centered.
  const glyphStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: symbolFontSize,
    fontWeight: '500',
    fill: GRAPHITE,
  });
  const glyph = new Text({ text: symbol, style: glyphStyle });
  glyph.anchor.set(0.5);
  glyph.x = -10;
  glyph.y = symbolYOffset;
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

  // Fuel intake socket (Slice 3.5.5) — sits below the cell with a small
  // italic "fuel" hint, so a pipe coming up from a warehouse below docks
  // naturally. The port's hit-area is registered in `cell-types.ts` at
  // the same offsets.
  if (hasFuelPort) {
    drawDashedRect(container, 0, halfH + 18, 22, 14);
    const fuelHintStyle = new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: 11,
      fontStyle: 'italic',
      fontWeight: '400',
      fill: GRAPHITE,
    });
    const fuelHint = new Text({ text: 'fuel', style: fuelHintStyle });
    fuelHint.anchor.set(0.5);
    fuelHint.x = 0;
    fuelHint.y = halfH + 38;
    fuelHint.alpha = 0.55;
    fuelHint.rotation = (Math.random() - 0.5) * 0.05;
    container.addChild(fuelHint);
  }

  // Cost-preview badge (Slice 3.5.1). Hidden until the cell has at least
  // one input that contributes a non-zero magnitude; tier-0 cells (addition,
  // subtraction) keep it hidden permanently. The interaction layer calls
  // `updateCostBadge` whenever pending state mutates.
  // Slice 6.18: cost badge uses `pencilText` so the small italic stays
  // crisp at the camera's max 4× zoom.
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

  // Slight whole-cell rotation so it sits on the page like a hand-placed object.
  container.rotation = (Math.random() - 0.5) * 0.03;

  return container;
}

/**
 * Refreshes the cost-preview badge on a cell. Reads `cell.pending` and
 * shows the cost the next firing would pay. Tier-0 cells (no fuel cost)
 * stay hidden. Empty cells (no inputs filled yet) also stay hidden — the
 * preview only appears once the player has begun loading the cell.
 */
/**
 * Updates the cost preview badge on a cost-bearing cell. `level` is the
 * cell-type's current upgrade level (default 1) — used to compute the
 * effective fuel cost after Mult/Exp discounts. Pulling the level
 * directly from `world.ts` would create a runtime import cycle
 * (pixi/binary-cell → world → cell-types → pixi/binary-cell), so the
 * caller is expected to look it up and pass it in.
 */
export function updateCostBadge(cell: PlacedCell, level: number = 1): void {
  const badge = (cell.container as Container & { __costBadge?: Text }).__costBadge;
  if (!badge) return;
  const operands = cell.pending.filter(
    (_, i) => (cell.inputs[i].kind ?? 'operand') !== 'fuel',
  );

  // Inversion keeps the signed-Decimal single-block contract.
  if (cell.type === 'inversion') {
    const cost = computationalCost(cell.type, operands, level);
    if (cost.eq(Decimal.dZero)) {
      badge.text = '';
      badge.alpha = 0;
      return;
    }
    if (cost.lt(Decimal.dZero)) {
      badge.text = `fuel ≤ ${cost.toString()}`;
    } else {
      badge.text = `fuel ≥ ${cost.toString()}`;
    }
    badge.alpha = 0.65;
    return;
  }

  // α.5c: ladder cells — show the per-firing ladder as a compact
  // "Nz + No + Nt" string.
  const ladder = fuelLadder(cell.type, operands, level);
  if (ladder.size === 0) {
    badge.text = '';
    badge.alpha = 0;
    return;
  }
  const GLYPHS: Record<number, string> = {
    0: 'z', 1: 'o', 2: 't', 3: '×3', 4: '×4', 5: '×5',
  };
  const sorted = Array.from(ladder.entries()).sort((a, b) => a[0] - b[0]);
  const parts = sorted.map(([v, c]) => {
    const g = GLYPHS[v] ?? `×${v}`;
    return `${c}${g}`;
  });
  badge.text = parts.join(' + ');
  badge.alpha = 0.65;
}

export function drawAdditionCell(x: number, y: number): Container {
  return drawBinaryCell(x, y, { symbol: '+' });
}

export function drawSubtractionCell(x: number, y: number): Container {
  // `−` (U+2212, mathematical minus) reads thin at the default font size;
  // a slight bump keeps the visual weight comparable to `+` and `×`.
  return drawBinaryCell(x, y, { symbol: '−', symbolFontSize: 60 });
}

// α.5c: hasFuelPort dropped — fuel ports removed from tier-1+
// binary cells. Ladder pulls from pool automatically.

export function drawMultiplicationCell(x: number, y: number): Container {
  // `×` reads slightly larger than `+` at the same font-size; trim a few px
  // so the visual weight matches across the catalog.
  return drawBinaryCell(x, y, { symbol: '×', symbolFontSize: 50, hasFuelPort: false });
}

export function drawDivisionCell(x: number, y: number): Container {
  // `÷` (U+00F7) — the obelus reads at the same visual weight as `×` and `+`.
  return drawBinaryCell(x, y, { symbol: '÷', symbolFontSize: 52, hasFuelPort: false });
}

export function drawExponentiationCell(x: number, y: number): Container {
  // `^` is rendered as a small superscript caret in most fonts — it floats
  // high and reads thin. Pump the font-size up and push it down so it sits
  // visually centered between the two ports.
  return drawBinaryCell(x, y, { symbol: '^', symbolFontSize: 64, symbolYOffset: 12, hasFuelPort: false });
}

export function drawTetrationCell(x: number, y: number): Container {
  // `↑↑` (Knuth's double up-arrow, U+2191 ×2) — the canonical notation for
  // tetration. Reads narrow but tall at the default glyph size; a small
  // bump keeps it visually weighty next to the other operator symbols.
  return drawBinaryCell(x, y, { symbol: '↑↑', symbolFontSize: 44, hasFuelPort: false });
}

export function drawPentationCell(x: number, y: number): Container {
  // `↑↑↑` (Knuth's triple up-arrow) — pentation, repeated tetration.
  // Three arrows side by side spread wide; we drop the font size a notch
  // versus tetration so the glyph still fits comfortably between ports.
  return drawBinaryCell(x, y, { symbol: '↑↑↑', symbolFontSize: 36, hasFuelPort: false });
}

// Slice 6.16: `drawDashedRect` moved to `pencil.ts` as a shared helper.
// All cell visuals now import the same implementation.
