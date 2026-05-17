import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { drawDashedRect, pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';

/**
 * Filter cell — predicate-based router (Slice 5.2, DESIGN §13).
 *
 * One input on the left, two outputs on the right:
 *   - top output (index 0)    — values matching the predicate
 *   - bottom output (index 1) — values rejected by the predicate
 *
 * The predicate label sits in the centre; small italic "yes" / "no"
 * annotations mark which output is which. No fuel cost; the filter
 * simply routes whatever arrives at the input to the appropriate
 * output, preserving stacks via the standard merge radius.
 */

import { FILTER_CELL_WIDTH, FILTER_CELL_HEIGHT } from '../../../core/cell-geometry';
export { FILTER_CELL_WIDTH, FILTER_CELL_HEIGHT };

export function drawFilterCell(_x: number, _y: number, ruleLabel?: string): Container {
  const container = new Container();
  const halfW = FILTER_CELL_WIDTH / 2;
  const halfH = FILTER_CELL_HEIGHT / 2;

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

  // Input drop-zone (left centre).
  drawDashedRect(container, -halfW + 32, 0, 26, 22);

  // Predicate label — italic, in the centre of the cell.
  const labelLen = ruleLabel ? ruleLabel.length : 0;
  const labelFontSize = labelLen > 4 ? 18 : 24;
  const ruleStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: labelFontSize,
    fontStyle: 'italic',
    fontWeight: '500',
    fill: GRAPHITE,
  });
  const ruleText = new Text({ text: ruleLabel ?? '?', style: ruleStyle });
  ruleText.anchor.set(0.5);
  ruleText.x = 0;
  ruleText.y = 0;
  ruleText.alpha = 0.85;
  ruleText.rotation = (Math.random() - 0.5) * 0.04;
  container.addChild(ruleText);

  // Output arrows + branch annotations. Match (top) gets a clean arrow
  // and "yes"; no-match (bottom) gets a slightly fainter arrow and "no",
  // keeping the visual hierarchy clear at a glance.
  const arrowStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 26,
    fontWeight: '400',
    fill: GRAPHITE,
  });
  const hintStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '400',
    fill: GRAPHITE,
  });

  const matchArrow = new Text({ text: '→', style: arrowStyle });
  matchArrow.anchor.set(0.5);
  matchArrow.x = halfW - 18;
  matchArrow.y = -34;
  matchArrow.alpha = 0.75;
  container.addChild(matchArrow);

  const matchHint = new Text({ text: 'yes', style: hintStyle });
  matchHint.anchor.set(0.5);
  matchHint.x = halfW - 48;
  matchHint.y = -34;
  matchHint.alpha = 0.6;
  matchHint.rotation = (Math.random() - 0.5) * 0.05;
  container.addChild(matchHint);

  const noMatchArrow = new Text({ text: '→', style: arrowStyle });
  noMatchArrow.anchor.set(0.5);
  noMatchArrow.x = halfW - 18;
  noMatchArrow.y = 34;
  noMatchArrow.alpha = 0.55;
  container.addChild(noMatchArrow);

  const noMatchHint = new Text({ text: 'no', style: hintStyle });
  noMatchHint.anchor.set(0.5);
  noMatchHint.x = halfW - 48;
  noMatchHint.y = 34;
  noMatchHint.alpha = 0.5;
  noMatchHint.rotation = (Math.random() - 0.5) * 0.05;
  container.addChild(noMatchHint);

  // Slice 6.16: standardised to 0.03 across all cells (was 0.025 here).
  container.rotation = (Math.random() - 0.5) * 0.03;

  return container;
}

// Slice 6.16: `drawDashedRect` is the shared helper from `pencil.ts`.
