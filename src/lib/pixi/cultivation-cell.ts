import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import Decimal from 'break_eternity.js';
import { pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';
import type { PlacedCell } from '../world';
import { valueLabel } from '../value';
import { valueColor } from '../family';
// Both helpers come from `../cost` to avoid a runtime cycle through
// `../cell-types` (which imports CULTIVATION_CELL_WIDTH from this file).
import { cultivationEmissionCost, cultivationEmit } from '../cost';

/**
 * Cultivation cells — seed-driven number streams.
 *
 * Visually similar to unary equation cells but a touch taller, with a formula
 * glyph in the centre (e.g. "n+k", "n·2ᵏ", "F·n") and a small "seed: —"
 * badge that fills in once the player drops a seed on the input port.
 *
 * The seed input is *not consumed*; once captured, the cell pulses an output
 * on a timer.
 */

export const CULTIVATION_CELL_WIDTH = 168;
export const CULTIVATION_CELL_HEIGHT = 104;

export interface CultivationOptions {
  symbol: string;
  /** Optional override for the glyph font size. */
  symbolFontSize?: number;
}

export function drawCultivationCell(_x: number, _y: number, opts: CultivationOptions): Container {
  const { symbol, symbolFontSize = 26 } = opts;
  const container = new Container();

  const halfW = CULTIVATION_CELL_WIDTH / 2;
  const halfH = CULTIVATION_CELL_HEIGHT / 2;

  // Outer frame.
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

  // Input drop-zone (seed).
  drawDashedRect(container, -halfW + 32, 0, 26, 24);
  const seedHint = new Text({
    text: 'seed',
    style: new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: 12,
      fontWeight: '400',
      fill: GRAPHITE,
    }),
  });
  seedHint.anchor.set(0.5);
  seedHint.x = -halfW + 32;
  seedHint.y = -halfH + 12;
  seedHint.alpha = 0.55;
  container.addChild(seedHint);

  // Centre glyph — the cell's emission formula.
  const glyphStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: symbolFontSize,
    fontWeight: '500',
    fill: GRAPHITE,
  });
  const glyph = new Text({ text: symbol, style: glyphStyle });
  glyph.anchor.set(0.5);
  glyph.x = 0;
  glyph.y = -8;
  glyph.alpha = 0.9;
  glyph.rotation = (Math.random() - 0.5) * 0.05;
  container.addChild(glyph);

  // Output arrow.
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
  container.addChild(arrow);

  // Seed readout (bottom-centre).
  const seedReadoutStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 14,
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const seedReadout = new Text({ text: 'seed: —', style: seedReadoutStyle });
  seedReadout.anchor.set(0.5);
  seedReadout.x = 0;
  seedReadout.y = halfH - 14;
  seedReadout.alpha = 0.55;
  container.addChild(seedReadout);

  // Slice 3.5.6: next-emission cost preview. Sits just above the seed
  // readout. Hidden until a seed lands and the next cost is known.
  const costPreviewStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const costPreview = new Text({ text: '', style: costPreviewStyle });
  costPreview.anchor.set(0.5);
  costPreview.x = 0;
  costPreview.y = halfH - 30;
  costPreview.alpha = 0;
  container.addChild(costPreview);

  // Slight whole-cell rotation.
  container.rotation = (Math.random() - 0.5) * 0.025;

  // Stash the readout texts on the container for later refresh.
  (container as Container & {
    __cultivationReadout?: Text;
    __cultivationCostPreview?: Text;
  }).__cultivationReadout = seedReadout;
  (container as Container & {
    __cultivationReadout?: Text;
    __cultivationCostPreview?: Text;
  }).__cultivationCostPreview = costPreview;

  return container;
}

export function drawArithmeticCell(x: number, y: number): Container {
  return drawCultivationCell(x, y, { symbol: 'a + n' });
}

export function drawGeometricCell(x: number, y: number): Container {
  return drawCultivationCell(x, y, { symbol: 'a · 2ⁿ', symbolFontSize: 24 });
}

export function drawFibonacciCell(x: number, y: number): Container {
  return drawCultivationCell(x, y, { symbol: 'a · Fₙ', symbolFontSize: 24 });
}

export function updateCultivationBadge(cell: PlacedCell): void {
  const tagged = cell.container as Container & {
    __cultivationReadout?: Text;
    __cultivationCostPreview?: Text;
  };
  const readout = tagged.__cultivationReadout;
  if (readout) {
    readout.text = `seed: ${cell.seed === null || cell.seed === undefined ? '—' : valueLabel(cell.seed)}`;
    readout.alpha = cell.seed === null || cell.seed === undefined ? 0.55 : 0.9;
    readout.style.fill = cell.seed ? valueColor(cell.seed) : GRAPHITE;
  }

  // Next-emission cost preview (Slice 3.5.6). Only meaningful once seeded.
  const costBadge = tagged.__cultivationCostPreview;
  if (costBadge) {
    if (cell.seed === null || cell.seed === undefined) {
      costBadge.text = '';
      costBadge.alpha = 0;
    } else {
      const step = cell.cultivationStep ?? 0;
      const nextValue = cultivationEmit(cell.type, cell.seed, step);
      const nextCost = cultivationEmissionCost(nextValue);
      if (nextCost.lte(Decimal.dZero)) {
        costBadge.text = '';
        costBadge.alpha = 0;
      } else {
        costBadge.text = `next ≥ ${nextCost.toString()}`;
        costBadge.alpha = 0.65;
      }
    }
  }
}

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
