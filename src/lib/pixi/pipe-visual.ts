import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pencilStroke, pencilStrokeDouble } from './pencil';
import { PENCIL_FONT_FAMILY } from './typography';
import { GRAPHITE, JAM_TINT } from '../colors';
import { valueLabel, type Value } from '../value';
import { valueColor } from '../family';

/**
 * Pipes — pencil-drawn conduits between cells / warehouses / river.
 *
 * Magnitude is communicated visually:
 *   - Line weight scales with the log of magnitude.
 *   - Higher-rated pipes get cross-hatch decorations along the length.
 *   - Endpoint dots mark source (filled) and destination (open) ports.
 *
 * Implementation note: every shape that varies between redraws is drawn
 * either into one of two persistent `Graphics` buffers (so `.clear()` wipes
 * it) or onto a persistent `Text` child (repositioned in place). Earlier
 * versions `addChild`'d fresh dots and labels each render, and on rapid
 * placement-cursor moves the layer accumulated hundreds of overlapping
 * objects.
 *
 * Pipe state (jammed vs. flowing) is exposed via `setJammed(true|false)`.
 * Jammed pipes are dashed and slightly redder than normal graphite.
 */

export interface PipeVisualHandles {
  container: Container;
  /** Spawn a transit pulse for `value` traveling from src to dst over `durationMs`. */
  pulse: (value: Value, durationMs: number) => void;
  /**
   * Updates the pipe's endpoint positions and redraws. Optional `srcDir`
   * / `dstDir` are unit vectors describing the natural "outward" direction
   * at each endpoint — supplied for port-aware bezier tangents (Slice 6.13).
   * When omitted, falls back to the chord-orientation heuristic.
   */
  redraw: (
    src: { x: number; y: number },
    dst: { x: number; y: number },
    srcDir?: { x: number; y: number } | null,
    dstDir?: { x: number; y: number } | null,
  ) => void;
  /** Toggles the "jammed" visual state. Persistent until cleared. */
  setJammed: (jammed: boolean) => void;
  /** Returns true if the (canvas-space) point lies near the pipe line. */
  hitTest: (x: number, y: number, tolerance?: number) => boolean;
  /**
   * Cancels any in-flight pulse animations. Callers MUST invoke this before
   * destroying the pipe's container — otherwise pending rAF callbacks will
   * try to mutate destroyed Pixi objects.
   */
  destroy: () => void;
}

export function drawPipe(
  src: { x: number; y: number },
  dst: { x: number; y: number },
  magnitude: number,
  srcDir?: { x: number; y: number } | null,
  dstDir?: { x: number; y: number } | null,
): PipeVisualHandles {
  const container = new Container();

  // Two persistent Graphics buffers: line (the wobble) and decor (dots +
  // hatch ticks). Both get `.clear()` at the start of every render, so no
  // accumulation across redraws.
  const lineLayer = new Graphics();
  const decorLayer = new Graphics();
  const pulseLayer = new Container();
  container.addChild(lineLayer);
  container.addChild(decorLayer);
  container.addChild(pulseLayer);

  // Persistent magnitude label — Text can't live inside a Graphics buffer,
  // so it's a separate child we just reposition each render.
  const label = new Text({
    text: `≤${magnitude}`,
    style: new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: 12,
      fontWeight: '400',
      fill: GRAPHITE,
    }),
  });
  label.anchor.set(0.5);
  label.alpha = 0.7;
  container.addChild(label);

  let _src = { ...src };
  let _dst = { ...dst };
  let _srcDir: { x: number; y: number } | null = srcDir ?? null;
  let _dstDir: { x: number; y: number } | null = dstDir ?? null;
  let _mag = magnitude;
  let _jammed = false;
  let _destroyed = false;
  // The current curve sampling — rebuilt on every render, reused by
  // pulse animation and hit-tests so they trace the same path the
  // player sees on screen.
  let _waypoints: { x: number; y: number }[] = [];

  /**
   * Builds a cubic bezier from src to dst. When port-aware tangent hints
   * are available (Slice 6.13), control points sit along those tangents
   * — pipes exit each cell along the port's natural axis, matching the
   * standard flow-chart-connector look. Without hints (e.g. mid-drag
   * ghost when the moving end isn't yet over a port), falls back to the
   * older orientation heuristic from Slice 5.8.
   *
   * Control-point distance is clamped so very short pipes (< 80 px) can't
   * loop back on themselves: each control point extends no more than half
   * the chord length toward its anchor's tangent.
   *
   * Samples into a polyline so `pencilStrokeDouble` can wobble it like
   * the straight pipes used to.
   */
  function buildWaypoints(): { x: number; y: number }[] {
    const dx = _dst.x - _src.x;
    const dy = _dst.y - _src.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return [{ ..._src }];

    // Control-point distance: ~40% of chord with a 24 px floor for a
    // small visible bow even on short pipes; capped at half the chord
    // to prevent the two control points from crossing (which produces
    // the loop-back artefact on very-short pipes).
    const k = Math.min(Math.max(24, len * 0.4), len * 0.5);

    let c1: { x: number; y: number };
    let c2: { x: number; y: number };
    if (_srcDir && _dstDir) {
      // Port-aware: each control point extends from its endpoint along
      // the port's outward direction. For a typical horizontal flow
      // (output port faces +x, input port faces -x), this puts c1 to
      // the right of src and c2 to the left of dst — a clean S-curve
      // whose entry and exit tangents match the cell ports.
      c1 = { x: _src.x + _srcDir.x * k, y: _src.y + _srcDir.y * k };
      c2 = { x: _dst.x + _dstDir.x * k, y: _dst.y + _dstDir.y * k };
    } else {
      // Fallback: dominant-axis heuristic. Chord-oriented bow, switching
      // between horizontal and vertical styles at 45°. Used during ghost
      // placement and re-route drags before a port is resolved.
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      if (horizontal) {
        const kx = Math.sign(dx) * k;
        c1 = { x: _src.x + kx, y: _src.y };
        c2 = { x: _dst.x - kx, y: _dst.y };
      } else {
        const ky = Math.sign(dy) * k;
        c1 = { x: _src.x, y: _src.y + ky };
        c2 = { x: _dst.x, y: _dst.y - ky };
      }
    }

    const samples = Math.max(10, Math.min(40, Math.floor(len / 22)));
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const u = 1 - t;
      const x =
        u * u * u * _src.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t * t * t * _dst.x;
      const y =
        u * u * u * _src.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t * t * t * _dst.y;
      pts.push({ x, y });
    }
    return pts;
  }

  function render(): void {
    lineLayer.clear();
    decorLayer.clear();
    _waypoints = buildWaypoints();
    if (_waypoints.length < 2) {
      label.visible = false;
      return;
    }

    const color = _jammed ? JAM_TINT : GRAPHITE;
    const w = Math.min(6, 1.4 + Math.log10(Math.max(1, _mag)) * 1.0);
    const alpha = _jammed ? 0.7 : 0.85;

    // Endpoint dots — drawn at the actual curve endpoints (which equal
    // src/dst by bezier definition).
    decorLayer
      .circle(_src.x, _src.y, 4 + w * 0.4)
      .fill({ color, alpha: 0.75 });
    decorLayer
      .circle(_dst.x, _dst.y, 4 + w * 0.4)
      .stroke({ color, width: 1.2, alpha: 0.8 });

    if (_jammed) {
      drawDashedAlongWaypoints(lineLayer, _waypoints, w, color, alpha);
    } else {
      pencilStrokeDouble(lineLayer, _waypoints, {
        color,
        width: w,
        alpha,
        jitter: 0.9,
        segmentsPerUnit: 0.16,
      });
    }

    // Cross-hatch ticks at evenly-spaced points along the CURVE. Each
    // tick is perpendicular to the local tangent at its sample point.
    if (_mag >= 10) {
      const tickEvery = Math.max(18, 40 - Math.log10(_mag) * 6);
      const tickLen = 4 + Math.log10(_mag);
      const lengths = waypointArcLengths(_waypoints);
      const total = lengths[lengths.length - 1];
      const tickCount = Math.floor(total / tickEvery);
      for (let i = 1; i < tickCount; i++) {
        const target = (i / tickCount) * total;
        const seg = sampleAtArcLength(_waypoints, lengths, target);
        const dx = seg.tangent.x;
        const dy = seg.tangent.y;
        const tLen = Math.hypot(dx, dy);
        if (tLen === 0) continue;
        const px = -dy / tLen;
        const py = dx / tLen;
        pencilStroke(
          decorLayer,
          [
            { x: seg.x - px * tickLen, y: seg.y - py * tickLen },
            { x: seg.x + px * tickLen, y: seg.y + py * tickLen },
          ],
          { color, width: 0.9, alpha: 0.55, jitter: 0.3, segmentsPerUnit: 0.2 },
        );
      }
    }

    // Magnitude label at the curve's midpoint, offset perpendicular to
    // the local tangent so it sits cleanly above the line.
    const lengths = waypointArcLengths(_waypoints);
    const total = lengths[lengths.length - 1];
    const mid = sampleAtArcLength(_waypoints, lengths, total * 0.5);
    const tx = mid.tangent.x;
    const ty = mid.tangent.y;
    const tLen = Math.hypot(tx, ty);
    const px = tLen === 0 ? 0 : -ty / tLen;
    const py = tLen === 0 ? -1 : tx / tLen;
    label.visible = true;
    label.text = `≤${_mag}`;
    label.x = mid.x + px * 10;
    label.y = mid.y + py * 10;
    let rot = Math.atan2(ty, tx);
    if (rot > Math.PI / 2 || rot < -Math.PI / 2) rot += Math.PI;
    label.rotation = rot;
  }

  render();

  function pulse(value: Value, durationMs: number): void {
    if (_destroyed) return;
    const pulseText = new Text({
      text: valueLabel(value),
      style: new TextStyle({
        fontFamily: PENCIL_FONT_FAMILY,
        fontSize: 18,
        fontWeight: '500',
        fill: valueColor(value),
      }),
    });
    pulseText.anchor.set(0.5);
    pulseText.alpha = 0;
    pulseLayer.addChild(pulseText);

    const start = performance.now();
    function step(): void {
      // Bail if the parent pipe was destroyed mid-flight — the rAF kept
      // ticking but the Pixi container is gone.
      if (_destroyed) {
        if (!pulseText.destroyed) pulseText.destroy();
        return;
      }
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      // Walk along the curve by arc length so the pulse moves at a
      // visually-constant speed rather than skipping through the bends.
      const lengths = waypointArcLengths(_waypoints);
      const total = lengths[lengths.length - 1] || 1;
      const pt = sampleAtArcLength(_waypoints, lengths, total * t);
      pulseText.x = pt.x;
      pulseText.y = pt.y;
      // Slice 6.13: flatter alpha curve so the pulse is visible across
      // most of the pipe, not just at the midpoint. `sin(πt)^0.45` ramps
      // quickly past 50% alpha and holds near peak through the middle
      // 60 % of the journey, fading out near the destination.
      pulseText.alpha = Math.pow(Math.sin(t * Math.PI), 0.45) * 0.95;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        if (pulseText.parent) pulseText.parent.removeChild(pulseText);
        if (!pulseText.destroyed) pulseText.destroy();
      }
    }
    requestAnimationFrame(step);
  }

  function hitTest(px2: number, py2: number, tolerance = 8): boolean {
    // Distance from point to the polyline. Cheapest correct test for a
    // sampled curve — segment-distance per pair.
    if (_waypoints.length < 2) return false;
    for (let i = 0; i < _waypoints.length - 1; i++) {
      const a = _waypoints[i];
      const b = _waypoints[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((px2 - a.x) * dx + (py2 - a.y) * dy) / len2));
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      if (Math.hypot(px2 - cx, py2 - cy) <= tolerance) return true;
    }
    return false;
  }

  return {
    container,
    pulse,
    redraw: (s, d, sd, dd) => {
      _src = { ...s };
      _dst = { ...d };
      // Caller passes `null` to deliberately clear a hint (no port);
      // `undefined` keeps the existing one. Useful during re-route drags
      // where the moving end has no port until release.
      if (sd !== undefined) _srcDir = sd;
      if (dd !== undefined) _dstDir = dd;
      render();
    },
    setJammed: (jammed: boolean) => {
      if (_jammed === jammed) return;
      _jammed = jammed;
      render();
    },
    hitTest,
    destroy: () => {
      _destroyed = true;
    },
  };
}

/**
 * Cumulative arc-length at each waypoint. `out[i]` is the total length
 * from `waypoints[0]` through `waypoints[i]`, so `out[last]` is the
 * pipe's total drawn length.
 */
function waypointArcLengths(waypoints: { x: number; y: number }[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    out.push(out[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return out;
}

/**
 * Returns the (x, y) at the given arc-length along the polyline, plus
 * the local tangent (b - a for the segment that contains it). Used for
 * positioning the magnitude label and the transit pulse.
 */
function sampleAtArcLength(
  waypoints: { x: number; y: number }[],
  lengths: number[],
  s: number,
): { x: number; y: number; tangent: { x: number; y: number } } {
  if (waypoints.length === 0) return { x: 0, y: 0, tangent: { x: 1, y: 0 } };
  if (waypoints.length === 1) return { ...waypoints[0], tangent: { x: 1, y: 0 } };
  const total = lengths[lengths.length - 1];
  if (s <= 0) {
    const a = waypoints[0];
    const b = waypoints[1];
    return { x: a.x, y: a.y, tangent: { x: b.x - a.x, y: b.y - a.y } };
  }
  if (s >= total) {
    const a = waypoints[waypoints.length - 2];
    const b = waypoints[waypoints.length - 1];
    return { x: b.x, y: b.y, tangent: { x: b.x - a.x, y: b.y - a.y } };
  }
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] >= s) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      const segLen = lengths[i] - lengths[i - 1];
      const t = segLen === 0 ? 0 : (s - lengths[i - 1]) / segLen;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        tangent: { x: b.x - a.x, y: b.y - a.y },
      };
    }
  }
  const a = waypoints[waypoints.length - 2];
  const b = waypoints[waypoints.length - 1];
  return { x: b.x, y: b.y, tangent: { x: b.x - a.x, y: b.y - a.y } };
}

/**
 * Walks the polyline emitting pencil-wobbled dashes by arc-length —
 * used for jammed pipes. Generalises the old straight-line dash logic
 * to curves so a stalled pipe still reads "broken" along its bends.
 */
function drawDashedAlongWaypoints(
  g: Graphics,
  waypoints: { x: number; y: number }[],
  width: number,
  color: number,
  alpha: number,
): void {
  if (waypoints.length < 2) return;
  const dashLen = 9;
  const gapLen = 6;
  const lengths = waypointArcLengths(waypoints);
  const total = lengths[lengths.length - 1];
  let s = 0;
  while (s < total) {
    const e = Math.min(s + dashLen, total);
    const a = sampleAtArcLength(waypoints, lengths, s);
    const b = sampleAtArcLength(waypoints, lengths, e);
    pencilStroke(
      g,
      [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ],
      { color, width, alpha, jitter: 0.6, segmentsPerUnit: 0.18 },
    );
    s = e + gapLen;
  }
}
