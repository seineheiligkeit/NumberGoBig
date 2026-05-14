import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pencilStroke, pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';

/**
 * Cleanup bot — a small portless cell that sweeps loose blocks within its
 * radius into the nearest matching warehouse on a slow cadence.
 *
 * Visually: a small circle with a pencil-drawn broom glyph inside, plus a
 * faint dashed search-radius circle indicating its reach. The bot itself
 * doesn't move on the canvas (Phase 2 simplification — sweeps are instant
 * and represented by a brief pulse). Phase 3+ could animate the bot.
 */

export const CLEANUP_BOT_WIDTH = 56;
export const CLEANUP_BOT_HEIGHT = 56;

export function drawCleanupBot(_x: number, _y: number, radius = 240): Container {
  const container = new Container();

  // Outer body — a hand-drawn circle.
  const body = new Graphics();
  const segs = 28;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const wob = (Math.random() - 0.5) * 1.2;
    pts.push({
      x: Math.cos(t) * (CLEANUP_BOT_WIDTH / 2 + wob),
      y: Math.sin(t) * (CLEANUP_BOT_HEIGHT / 2 + wob),
    });
  }
  pencilStrokeDouble(body, pts, {
    color: GRAPHITE,
    width: 1.5,
    alpha: 0.7,
    jitter: 0.6,
    segmentsPerUnit: 0.18,
  });
  container.addChild(body);

  // Sweep glyph — a small rotation arrow, hand-lettered. Reads as
  // "this thing cycles" rather than the earlier ✦ which was decorative
  // and didn't carry the bot's motion semantics.
  const glyph = new Text({
    text: '⟲',
    style: new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: 28,
      fontWeight: '500',
      fill: GRAPHITE,
    }),
  });
  glyph.anchor.set(0.5);
  glyph.alpha = 0.85;
  glyph.rotation = (Math.random() - 0.5) * 0.12;
  container.addChild(glyph);

  // Dashed search radius — drawn very faintly so it doesn't dominate.
  // 32 dashes spaced around the circle; each one a short pencil-wobbled
  // arc segment. Higher counts read as a solid circle, lower as a sparser
  // ring of marks — 32 sits well between "obvious boundary" and "barely
  // perceptible hint."
  const halo = new Graphics();
  for (let i = 0; i < 64; i += 2) {
    const t0 = (i / 64) * Math.PI * 2;
    const t1 = ((i + 1) / 64) * Math.PI * 2;
    pencilStroke(
      halo,
      [
        { x: Math.cos(t0) * radius, y: Math.sin(t0) * radius },
        { x: Math.cos(t1) * radius, y: Math.sin(t1) * radius },
      ],
      { color: GRAPHITE, width: 0.6, alpha: 0.18, jitter: 0.3, segmentsPerUnit: 0.16 },
    );
  }
  container.addChild(halo);

  return container;
}

/** Flashes a short transit line from the bot to the (block → warehouse) pair. */
export function spawnSweepPulse(
  parent: Container,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const line = new Graphics();
  pencilStroke(
    line,
    [
      { x: fromX, y: fromY },
      { x: toX, y: toY },
    ],
    { color: GRAPHITE, width: 1.2, alpha: 0.7, jitter: 0.5, segmentsPerUnit: 0.18 },
  );
  parent.addChild(line);

  const start = performance.now();
  const duration = 450;
  function step(): void {
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);
    line.alpha = 0.7 * (1 - t);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      parent.removeChild(line);
      line.destroy();
    }
  }
  requestAnimationFrame(step);
}
