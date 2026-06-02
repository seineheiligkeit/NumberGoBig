import { Container, Graphics, Point } from 'pixi.js';
import { pencilStroke } from './pencil';
import { pencilText, pencilTextStyle, COUNTER } from './typography';
import { ACCENT_RED, GRAPHITE } from '../colors';
import { valueMagnitude, type Value } from '../../../core/value';

// ===========================================================================
// V2.1 — Adversary visuals (the Front).
//
// An antinumber is rendered as a red, struck-through numeral. This is the
// "grader's red pen" of DESIGN §17: red is the *marking* colour, and a
// strike-through reads as "crossed out" — the threat — distinct from the red
// *underline* a prime gets. Lives on the screen-fixed frontLayer (no camera
// transform), so no PENCIL_TEXT_RESOLUTION boost is needed.
// ===========================================================================

/** A short "−N" label for an antinumber. V2.1 enemies are small integers. */
function antiLabel(value: Value): string {
  const mag = valueMagnitude(value);
  return `−${mag.toString()}`;
}

/** Red numeral with a hand-drawn strike-through. Bosses (V2.4) render
 *  larger and carry a small italic label ("Erratum: prime", …). */
export function drawAntinumber(
  value: Value,
  opts?: { boss?: boolean; label?: string },
): Container {
  const c = new Container();
  const fontSize = opts?.boss ? 34 : 22;

  const txt = pencilText(
    antiLabel(value),
    pencilTextStyle({ fontSize, fontWeight: '500', fill: ACCENT_RED }),
  );
  txt.anchor.set(0.5);
  c.addChild(txt);

  const strike = new Graphics();
  const half = txt.width / 2 + 4;
  pencilStroke(strike, [new Point(-half, 0), new Point(half, 0)], {
    color: ACCENT_RED,
    width: opts?.boss ? 3 : 2,
    alpha: 0.9,
  });
  c.addChild(strike);

  if (opts?.boss) {
    const tag = pencilText(
      `Erratum: ${opts.label ?? 'boss'}`,
      pencilTextStyle({ fontSize: 12, fontStyle: 'italic', fill: ACCENT_RED }),
    );
    tag.anchor.set(0.5);
    tag.y = fontSize * 0.7 + 8;
    c.addChild(tag);
  }

  return c;
}

/** Closed-rectangle point loop for pencilStroke. */
function rectLoop(x: number, y: number, w: number, h: number): Point[] {
  return [
    new Point(x, y),
    new Point(x + w, y),
    new Point(x + w, y + h),
    new Point(x, y + h),
    new Point(x, y),
  ];
}

export interface CoreHandle {
  container: Container;
  setHp(hp: number, max: number): void;
  setShield(text: string): void;
}

/**
 * The Core ("rigor") — a penciled ℕ monument with an HP readout and bar.
 * Antinumbers that reach it deal damage equal to their magnitude.
 */
export function drawCore(): CoreHandle {
  const c = new Container();

  const box = new Graphics();
  pencilStroke(box, rectLoop(-28, -32, 56, 64), { color: GRAPHITE, width: 2 });
  c.addChild(box);

  const glyph = pencilText('ℕ', pencilTextStyle({ fontSize: 28, fontWeight: '600' }));
  glyph.anchor.set(0.5);
  glyph.y = -8;
  c.addChild(glyph);

  const hpText = pencilText('', COUNTER.style());
  hpText.anchor.set(0.5);
  hpText.y = 16;
  c.addChild(hpText);

  const bar = new Graphics();
  c.addChild(bar);

  // V3: the Shield — your committed positive magnitude (the "army"), shown as
  // a bold slab just ahead of the Core (toward the incoming Front), where the
  // antinumbers clash into it.
  const shieldText = pencilText('', pencilTextStyle({ fontSize: 20, fontWeight: '600' }));
  shieldText.anchor.set(0, 0.5);
  shieldText.x = 38;
  shieldText.y = 0;
  c.addChild(shieldText);

  function setHp(hp: number, max: number): void {
    const shown = Math.max(0, Math.ceil(hp));
    hpText.text = `${shown}/${max}`;

    const w = 50;
    const frac = Math.max(0, Math.min(1, hp / max));
    bar.clear();
    bar.rect(-w / 2, 30, w, 5).fill({ color: GRAPHITE, alpha: 0.15 });
    bar
      .rect(-w / 2, 30, w * frac, 5)
      .fill({ color: frac < 0.34 ? ACCENT_RED : GRAPHITE, alpha: 0.7 });
  }

  function setShield(text: string): void {
    shieldText.text = text ? `▌ ${text}` : '';
  }

  return { container: c, setHp, setShield };
}
