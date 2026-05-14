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
  /** Updates the pipe's endpoint positions and redraws. */
  redraw: (src: { x: number; y: number }, dst: { x: number; y: number }) => void;
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
  let _mag = magnitude;
  let _jammed = false;
  let _destroyed = false;

  function render(): void {
    lineLayer.clear();
    decorLayer.clear();

    const dx = _dst.x - _src.x;
    const dy = _dst.y - _src.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      label.visible = false;
      return;
    }
    const px = -dy / len;
    const py = dx / len;

    const color = _jammed ? JAM_TINT : GRAPHITE;
    const w = Math.min(6, 1.4 + Math.log10(Math.max(1, _mag)) * 1.0);
    const alpha = _jammed ? 0.7 : 0.85;

    // Endpoint dots into decorLayer's instruction buffer (no children).
    decorLayer
      .circle(_src.x, _src.y, 4 + w * 0.4)
      .fill({ color, alpha: 0.75 });
    decorLayer
      .circle(_dst.x, _dst.y, 4 + w * 0.4)
      .stroke({ color, width: 1.2, alpha: 0.8 });

    // Primary pencil-wobbled line. For a jammed pipe we draw it dashed so
    // the stall reads as "something's wrong" rather than a normal pause.
    if (_jammed) {
      drawDashedPencil(lineLayer, _src, _dst, len, w, color, alpha);
    } else {
      pencilStrokeDouble(
        lineLayer,
        [{ x: _src.x, y: _src.y }, { x: _dst.x, y: _dst.y }],
        { color, width: w, alpha, jitter: 0.9, segmentsPerUnit: 0.16 },
      );
    }

    // Cross-hatch ticks for higher magnitudes — draw straight into decorLayer.
    if (_mag >= 10) {
      const tickEvery = Math.max(18, 40 - Math.log10(_mag) * 6);
      const tickLen = 4 + Math.log10(_mag);
      const tickCount = Math.floor(len / tickEvery);
      for (let i = 1; i < tickCount; i++) {
        const t = i / tickCount;
        const cx = _src.x + dx * t;
        const cy = _src.y + dy * t;
        pencilStroke(
          decorLayer,
          [
            { x: cx - px * tickLen, y: cy - py * tickLen },
            { x: cx + px * tickLen, y: cy + py * tickLen },
          ],
          { color, width: 0.9, alpha: 0.55, jitter: 0.3, segmentsPerUnit: 0.2 },
        );
      }
    }

    // Reposition magnitude label near the midpoint. The label stays graphite
    // regardless of jam state — the dashed line is the jam signal.
    label.visible = true;
    label.text = `≤${_mag}`;
    label.x = _src.x + dx * 0.5 + px * 10;
    label.y = _src.y + dy * 0.5 + py * 10;
    let rot = Math.atan2(dy, dx);
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
      pulseText.x = _src.x + (_dst.x - _src.x) * t;
      pulseText.y = _src.y + (_dst.y - _src.y) * t;
      pulseText.alpha = Math.sin(t * Math.PI) * 0.9;
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
    // Distance from point to the pipe segment in container-local coords.
    const dx = _dst.x - _src.x;
    const dy = _dst.y - _src.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px2 - _src.x, py2 - _src.y) <= tolerance;
    const t = Math.max(0, Math.min(1, ((px2 - _src.x) * dx + (py2 - _src.y) * dy) / len2));
    const cx = _src.x + dx * t;
    const cy = _src.y + dy * t;
    return Math.hypot(px2 - cx, py2 - cy) <= tolerance;
  }

  return {
    container,
    pulse,
    redraw: (s, d) => {
      _src = { ...s };
      _dst = { ...d };
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
 * Draws a dashed pencil line — used for jammed pipes. The dash pattern is
 * jittered like a real pencil's broken strokes; cheaper than calling
 * pencilStroke per dash because we draw straight into the target Graphics.
 */
function drawDashedPencil(
  g: Graphics,
  src: { x: number; y: number },
  dst: { x: number; y: number },
  len: number,
  width: number,
  color: number,
  alpha: number,
): void {
  const dashLen = 9;
  const gapLen = 6;
  const ux = (dst.x - src.x) / len;
  const uy = (dst.y - src.y) / len;
  let traversed = 0;
  while (traversed < len) {
    const segEnd = Math.min(traversed + dashLen, len);
    pencilStroke(
      g,
      [
        { x: src.x + ux * traversed, y: src.y + uy * traversed },
        { x: src.x + ux * segEnd, y: src.y + uy * segEnd },
      ],
      { color, width, alpha, jitter: 0.6, segmentsPerUnit: 0.18 },
    );
    traversed = segEnd + gapLen;
  }
}
