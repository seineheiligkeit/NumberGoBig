import type { Container, Graphics } from 'pixi.js';
import { Graphics as GraphicsCtor } from 'pixi.js';
import { GRAPHITE } from '../colors';

export interface PencilStrokeOptions {
  color: number;
  width: number;
  /** Stroke alpha. Default 0.88. */
  alpha?: number;
  /** Maximum perpendicular wobble in pixels at each subdivided point. Default 0.6. */
  jitter?: number;
  /** Subdivision density: waypoints per pixel of segment length. Higher = wobblier. Default 0.18. */
  segmentsPerUnit?: number;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Strokes a polyline with a pencil-like wobble along its length.
 *
 * Each segment is subdivided into many small steps; each intermediate waypoint
 * is nudged perpendicular to the segment by a small random amount, so the
 * resulting line wavers like a graphite mark instead of running pixel-perfect
 * like a vector primitive. Endpoints are not jittered, so polygon corners stay
 * recognizable.
 */
export function pencilStroke(
  graphics: Graphics,
  points: Point[],
  options: PencilStrokeOptions,
): void {
  if (points.length < 2) return;
  const wobble = pencilWaypoints(points, options);
  strokeWaypoints(graphics, wobble, options);
}

/**
 * Build the jittered waypoint list for a polyline WITHOUT drawing it. Compute it
 * once and keep it, so a stroke that's revealed progressively (e.g. a cell
 * sketching itself in over build time) waves the *same* graphite line rather
 * than re-randomising — and so doesn't shimmer frame to frame.
 */
export function pencilWaypoints(
  points: Point[],
  options: Pick<PencilStrokeOptions, 'jitter' | 'segmentsPerUnit'> = {},
): Point[] {
  const { jitter = 0.6, segmentsPerUnit = 0.18 } = options;
  const wobble: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;

    const numSegments = Math.max(2, Math.floor(len * segmentsPerUnit));

    // Perpendicular unit vector for jitter direction.
    const px = -dy / len;
    const py = dx / len;

    for (let s = 0; s <= numSegments; s++) {
      const t = s / numSegments;
      const isEndpoint = s === 0 || s === numSegments;
      const j = isEndpoint ? 0 : (Math.random() - 0.5) * 2 * jitter;
      wobble.push({
        x: a.x + dx * t + px * j,
        y: a.y + dy * t + py * j,
      });
    }
  }
  return wobble;
}

/** Stroke a precomputed waypoint list (the output of `pencilWaypoints`). */
export function strokeWaypoints(
  graphics: Graphics,
  wobble: Point[],
  options: { color: number; width: number; alpha?: number },
): void {
  if (wobble.length < 2) return;
  const { color, width, alpha = 0.88 } = options;
  graphics.moveTo(wobble[0].x, wobble[0].y);
  for (let i = 1; i < wobble.length; i++) {
    graphics.lineTo(wobble[i].x, wobble[i].y);
  }
  graphics.stroke({ color, width, alpha });
}

/**
 * Strokes the path twice with independent jitter and a slightly lighter second
 * pass — mimicking how real pencil marks build up from overlapping strokes.
 * Use this when you want a "drawn with intent" weight on important outlines.
 */
export function pencilStrokeDouble(
  graphics: Graphics,
  points: Point[],
  options: PencilStrokeOptions,
): void {
  pencilStroke(graphics, points, options);
  pencilStroke(graphics, points, {
    ...options,
    alpha: (options.alpha ?? 0.88) * 0.55,
    width: options.width * 0.82,
  });
}

/**
 * Draws a hand-noted dashed rectangle centred on `(cx, cy)` (Slice 6.16).
 *
 * Used by every cell visual to mark drop-zones (operand inputs, fuel
 * sockets, deposit zones, filter inputs). Was duplicated identically in
 * five files — extracting here is a pure DRY pass; the visual is
 * unchanged.
 *
 * `dashStep` controls the dash period (7 px = 7 on, 7 off); finer steps
 * make the rectangle read denser. `color` and `alpha` default to the
 * faint-graphite hint look the existing call sites use.
 */
export function drawDashedRect(
  parent: Container,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  options: {
    dashStep?: number;
    color?: number;
    alpha?: number;
    width?: number;
  } = {},
): void {
  const { dashStep = 7, color = GRAPHITE, alpha = 0.32, width = 0.9 } = options;
  const g = new GraphicsCtor();
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
  g.stroke({ color, width, alpha });
  parent.addChild(g);
}
