import type { Graphics } from 'pixi.js';

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
  const {
    color,
    width,
    alpha = 0.88,
    jitter = 0.6,
    segmentsPerUnit = 0.18,
  } = options;

  if (points.length < 2) return;

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
