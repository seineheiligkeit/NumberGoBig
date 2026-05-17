import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';
import type { PlacedCell } from '../world';
import { cultivationEmissionCost, cultivationEmit } from '../../../core/cost';
import Decimal from 'break_eternity.js';
// α.4b.2: per-step fuel cost is back — every firing pays
// `cultivationEmissionCost(emission)`, so the cost-preview badge
// reads the next emission's magnitude when an input is pending.

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

import { CULTIVATION_CELL_WIDTH, CULTIVATION_CELL_HEIGHT } from '../../../core/cell-geometry';
export { CULTIVATION_CELL_WIDTH, CULTIVATION_CELL_HEIGHT };

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
  const seedReadout = new Text({ text: 'step 0', style: seedReadoutStyle });
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

// Phase 6 ε.2 — three series deferred since Phase 2 (DESIGN §6).
export function drawHarmonicCell(x: number, y: number): Container {
  return drawCultivationCell(x, y, { symbol: 'a · Hₙ', symbolFontSize: 24 });
}

export function drawPolynomialCell(x: number, y: number): Container {
  return drawCultivationCell(x, y, { symbol: 'a · n²', symbolFontSize: 24 });
}

export function drawFactorialCell(x: number, y: number): Container {
  return drawCultivationCell(x, y, { symbol: 'a · n!', symbolFontSize: 24 });
}

export function updateCultivationBadge(cell: PlacedCell): void {
  const tagged = cell.container as Container & {
    __cultivationReadout?: Text;
    __cultivationCostPreview?: Text;
  };
  // Phase 6 ε.1: cultivators are input-driven transformers — the badge
  // now displays the cell's internal STEP counter rather than a seed.
  // Each firing advances the step, so the badge ticks up over time.
  const readout = tagged.__cultivationReadout;
  if (readout) {
    const step = cell.cultivationStep ?? 0;
    readout.text = `step ${step}`;
    readout.alpha = step > 0 ? 0.9 : 0.55;
    readout.style.fill = GRAPHITE;
  }

  // α.4b.2: per-firing cost preview. The next emission's cost is the
  // magnitude of f(input, step) — known once an input is pending, else
  // an estimate at step alone (treating input as 1 — the lower bound).
  const costBadge = tagged.__cultivationCostPreview;
  if (costBadge) {
    const step = cell.cultivationStep ?? 0;
    const input = cell.pending[0];
    if (input) {
      const nextOutput = cultivationEmit(cell.type, input, step);
      const cost = cultivationEmissionCost(nextOutput);
      costBadge.text = cost.gt(Decimal.dZero) ? `fuel ≥ ${cost.toString()}` : '';
      costBadge.alpha = cost.gt(Decimal.dZero) ? 0.85 : 0;
    } else {
      costBadge.text = '';
      costBadge.alpha = 0;
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
