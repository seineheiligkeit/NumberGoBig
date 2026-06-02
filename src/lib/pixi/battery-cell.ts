import { Container, Graphics, Point } from 'pixi.js';
import { pencilStroke } from './pencil';
import { pencilText, pencilTextStyle, HINT } from './typography';
import { ACCENT_RED, GRAPHITE } from '../colors';

// ===========================================================================
// V2.2 — Battery cells (automated defense, DESIGN §V2.5).
//
// A battery is a port-less canvas cell (like a bot): it pulls ammo from the
// pool and fires on a cadence at the front-most antinumber. Three modes:
//   - add    (+) finisher  — needs a block ≥ the target's magnitude
//   - divide (÷) softener   — halves the target for a cheap small block
//   - negate (±) converter  — flips the target to a positive block (wealth)
// The visual is a small penciled emplacement with a red muzzle pointed at
// the Front.
// ===========================================================================

export type BatteryMode = 'add' | 'divide' | 'negate' | 'feed';

const BATTERY_HALF = 24;

export function batteryGlyph(mode: BatteryMode): string {
  return mode === 'add' ? '+' : mode === 'divide' ? '÷' : mode === 'negate' ? '±' : '▲';
}

function rectLoop(x: number, y: number, w: number, h: number): Point[] {
  return [
    new Point(x, y),
    new Point(x + w, y),
    new Point(x + w, y + h),
    new Point(x, y + h),
    new Point(x, y),
  ];
}

export function drawBattery(mode: BatteryMode, x = 0, y = 0): Container {
  const c = new Container();
  c.x = x;
  c.y = y;

  const box = new Graphics();
  pencilStroke(box, rectLoop(-BATTERY_HALF, -BATTERY_HALF, BATTERY_HALF * 2, BATTERY_HALF * 2), {
    color: GRAPHITE,
    width: 2,
  });
  c.addChild(box);

  // Muzzle: a short red barrel pointing up toward the Front.
  const muzzle = new Graphics();
  pencilStroke(
    muzzle,
    [new Point(0, -BATTERY_HALF), new Point(0, -BATTERY_HALF - 12)],
    { color: ACCENT_RED, width: 3, alpha: 0.85 },
  );
  c.addChild(muzzle);

  const glyph = pencilText(
    batteryGlyph(mode),
    pencilTextStyle({ fontSize: 26, fontWeight: '600' }),
  );
  glyph.anchor.set(0.5);
  glyph.y = -2;
  c.addChild(glyph);

  const label = pencilText('battery', HINT.style());
  label.anchor.set(0.5);
  label.y = BATTERY_HALF - 6;
  c.addChild(label);

  return c;
}
