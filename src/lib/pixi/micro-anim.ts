/**
 * Micro-animations — Slice 6.17.
 *
 * Two small additive visual cues, deliberately subtle to fit the pencil-
 * notebook aesthetic:
 *
 *   - `spawnEmitScribble(layer, x, y)` — a brief 4-stroke pencil flourish
 *     at the position where a block materialises. Fires from
 *     `commitSpawn` for every emitted block (merge or new). ~250 ms life.
 *
 *   - `fadeAndDestroy(display, dur?)` — eases an existing display's alpha
 *     to 0 over `dur` ms, then removes + destroys it. Used by the fire
 *     path to give consumed pending-input ghosts a soft exit instead of
 *     the previous instant pop.
 *
 * Animation philosophy (DESIGN §17): "the timing of a calm, confident
 * hand." No bounce, no overshoot, no juice. Brief and quiet.
 */

import { Container, Graphics } from 'pixi.js';
import { pencilStroke } from './pencil';
import { GRAPHITE } from '../colors';

/**
 * Spawns a small radiating pencil flourish at (x, y) on the given layer.
 * Four short strokes at random angles, fading out over ~260 ms. Cheap;
 * the Graphics object is destroyed on completion so no accumulation.
 */
export function spawnEmitScribble(
  layer: Container,
  x: number,
  y: number,
): void {
  const g = new Graphics();
  g.x = x;
  g.y = y;
  layer.addChild(g);

  const STROKES = 4;
  const baseAngle = Math.random() * Math.PI * 2;
  for (let i = 0; i < STROKES; i++) {
    const angle = baseAngle + (i / STROKES) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const len = 6 + Math.random() * 4;
    const inner = 2 + Math.random() * 1.5;
    pencilStroke(
      g,
      [
        { x: Math.cos(angle) * inner, y: Math.sin(angle) * inner },
        { x: Math.cos(angle) * (inner + len), y: Math.sin(angle) * (inner + len) },
      ],
      { color: GRAPHITE, width: 0.9, alpha: 0.7, jitter: 0.4, segmentsPerUnit: 0.2 },
    );
  }

  const start = performance.now();
  const duration = 260;
  function step(): void {
    if (g.destroyed) return;
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);
    // Fast-rising-then-fading curve (∝ sin(πt)) so the scribble is
    // visible mid-life and never just a flat fade. Multiplied by 0.85
    // so even at peak it stays in the "pencil mark" register.
    g.alpha = Math.sin(t * Math.PI) * 0.85;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      g.parent?.removeChild(g);
      g.destroy({ children: true });
    }
  }
  requestAnimationFrame(step);
}

/**
 * Fades a display's alpha to 0 over `durationMs`, then removes it from
 * its parent and destroys it. Safe against display.destroyed (e.g. if
 * the parent cell is removed mid-animation).
 *
 * Use this in the fire path INSTEAD of `removeChild + destroy` when you
 * want the input ghost to ease out rather than vanish on a frame.
 */
export function fadeAndDestroy(
  display: Container,
  durationMs: number = 180,
): void {
  if (display.destroyed) return;
  const start = performance.now();
  const startAlpha = display.alpha;
  function step(): void {
    if (display.destroyed) return;
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / durationMs);
    display.alpha = startAlpha * (1 - t);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      display.parent?.removeChild(display);
      if (!display.destroyed) display.destroy({ children: true });
    }
  }
  requestAnimationFrame(step);
}
