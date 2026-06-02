import { Container, Graphics, Point } from 'pixi.js';
import { pencilStroke } from './pencil';
import { pencilText, pencilTextStyle, HINT } from './typography';
import { GRAPHITE } from '../colors';
import type { CellType } from '../cell-types';

// ===========================================================================
// V4 — shared visual for the set-operation cells (unary {·}, |·|, unfold, P;
// binary ∪ ∩ \ △). A penciled box with the operator glyph and port nubs,
// in the same hand as the rest of the factory.
// ===========================================================================

interface SetCellSpec {
  glyph: string;
  label: string;
  binary: boolean;
}

const SPECS: Record<string, SetCellSpec> = {
  singleton: { glyph: '{·}', label: 'singleton', binary: false },
  count: { glyph: '|·|', label: 'count', binary: false },
  unfold: { glyph: '{0…}', label: 'unfold', binary: false },
  powerset: { glyph: '𝒫', label: 'power set', binary: false },
  'set-union': { glyph: '∪', label: 'union', binary: true },
  'set-intersect': { glyph: '∩', label: 'intersect', binary: true },
  'set-diff': { glyph: '∖', label: 'difference', binary: true },
  'set-symdiff': { glyph: '△', label: 'sym. diff.', binary: true },
};

function rectLoop(x: number, y: number, w: number, h: number): Point[] {
  return [
    new Point(x, y),
    new Point(x + w, y),
    new Point(x + w, y + h),
    new Point(x, y + h),
    new Point(x, y),
  ];
}

function portNub(g: Graphics, x: number, y: number): void {
  pencilStroke(g, [new Point(x, y), new Point(x + 14, y)], { color: GRAPHITE, width: 1.5 });
  g.circle(x, y, 3).fill({ color: GRAPHITE, alpha: 0.85 });
}

export function drawSetCell(type: CellType): Container {
  const spec = SPECS[type] ?? { glyph: '∅', label: 'set', binary: false };
  const c = new Container();

  const halfW = spec.binary ? 90 : 72;
  const halfH = spec.binary ? 50 : 40;

  const box = new Graphics();
  pencilStroke(box, rectLoop(-halfW, -halfH, halfW * 2, halfH * 2), { color: GRAPHITE, width: 2 });
  c.addChild(box);

  // Input nubs (one for unary, two for binary), output nub on the right.
  const nubs = new Graphics();
  if (spec.binary) {
    portNub(nubs, -halfW - 14, -26);
    portNub(nubs, -halfW - 14, 26);
  } else {
    portNub(nubs, -halfW - 14, 0);
  }
  pencilStroke(nubs, [new Point(halfW, 0), new Point(halfW + 14, 0)], { color: GRAPHITE, width: 1.5 });
  nubs.circle(halfW + 14, 0, 3).fill({ color: GRAPHITE, alpha: 0.4 });
  c.addChild(nubs);

  const glyph = pencilText(spec.glyph, pencilTextStyle({ fontSize: 30, fontWeight: '600' }));
  glyph.anchor.set(0.5);
  glyph.y = -4;
  c.addChild(glyph);

  const label = pencilText(spec.label, HINT.style());
  label.anchor.set(0.5);
  label.y = halfH - 9;
  c.addChild(label);

  return c;
}
