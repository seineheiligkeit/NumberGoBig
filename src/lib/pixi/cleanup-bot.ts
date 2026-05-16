import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pencilStroke, pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';
import { drawBlock } from './block';
import type { Value } from '../value';

/**
 * Translation Operator (T-bot) — Slice 6.11. The Phase 2 cleanup bot was a
 * portless cell that teleported a loose block into the nearest matching
 * warehouse via a sweep pulse. Slice 6.11 made the bot *walk*: a small
 * worker figure leaves the station, fetches the block, carries it across
 * the canvas, and sets it down. The cell type id stays `cleanup-bot` for
 * save back-compat; the user-visible name is "Translation Operator" (a
 * pun on the math/physics translation operator T̂).
 *
 * Visually:
 *   - **Station**: the stationary circle with a `T` glyph at the bot's
 *     placement (home) position. Plus a faint dashed search-radius halo.
 *   - **Worker**: a smaller pencil-drawn figure that lives as a child of
 *     the station container. Its local position is updated each tick by
 *     the bots.ts state machine; the bot's container itself doesn't move.
 *   - **Carried block**: when the worker is returning with a value, a
 *     small block sketch hovers above its head. Cleared on dropoff.
 *
 * The container exposes `__botHandles` so `bots.ts` can update the
 * worker's local position and the carried-block visual without reaching
 * into Pixi internals from the simulation layer.
 */

export const CLEANUP_BOT_WIDTH = 56;
export const CLEANUP_BOT_HEIGHT = 56;

/** Visual-side handles installed on the bot container. The simulation
 *  layer (bots.ts) drives these each tick. */
export interface BotHandles {
  /** Worker's local position relative to the station (home). The station
   *  itself doesn't move, so worker.x/y is offset from (0,0). */
  setWorkerLocal(localX: number, localY: number): void;
  /** Show the carried Value above the worker; pass null to clear. */
  setCarried(value: Value | null): void;
}

/** Augment the Container shape so TypeScript accepts the handles property. */
type BotContainer = Container & { __botHandles?: BotHandles };

export function drawCleanupBot(_x: number, _y: number, radius = 240): Container {
  const container = new Container() as BotContainer;

  // -- Station ----------------------------------------------------------
  // The home circle. Hand-drawn outline, faint cross-hatch suggesting
  // a small platform / charging pad. Doesn't move.
  const station = new Graphics();
  const segs = 28;
  const stationPts: { x: number; y: number }[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const wob = (Math.random() - 0.5) * 1.2;
    stationPts.push({
      x: Math.cos(t) * (CLEANUP_BOT_WIDTH / 2 + wob),
      y: Math.sin(t) * (CLEANUP_BOT_HEIGHT / 2 + wob),
    });
  }
  pencilStrokeDouble(station, stationPts, {
    color: GRAPHITE,
    width: 1.3,
    alpha: 0.55,
    jitter: 0.6,
    segmentsPerUnit: 0.18,
  });
  station.alpha = 0.85;
  container.addChild(station);

  // Faint pad cross-hatch — three short diagonals, very light. Reads as
  // "this is where the worker docks" without dominating the silhouette.
  const pad = new Graphics();
  for (let i = -2; i <= 2; i++) {
    const y = i * 6;
    pencilStroke(
      pad,
      [
        { x: -CLEANUP_BOT_WIDTH / 2 + 8, y },
        { x: CLEANUP_BOT_WIDTH / 2 - 8, y },
      ],
      { color: GRAPHITE, width: 0.5, alpha: 0.15, jitter: 0.3, segmentsPerUnit: 0.18 },
    );
  }
  container.addChild(pad);

  // -- Search-radius halo -----------------------------------------------
  // Same dashed-circle pattern as before. Shows the bot's reach.
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

  // -- Worker -----------------------------------------------------------
  // Smaller figure that walks out from the station. Lives as a child of
  // the bot container, so its local (0, 0) === station centre. The state
  // machine writes worker.x / worker.y per tick.
  const worker = new Container();
  worker.x = 0;
  worker.y = 0;

  // Worker body — a small hand-drawn circle, ~60% the station diameter.
  const workerR = 16;
  const workerBody = new Graphics();
  const wPts: { x: number; y: number }[] = [];
  const wSegs = 22;
  for (let i = 0; i <= wSegs; i++) {
    const t = (i / wSegs) * Math.PI * 2;
    const wob = (Math.random() - 0.5) * 0.9;
    wPts.push({
      x: Math.cos(t) * (workerR + wob),
      y: Math.sin(t) * (workerR + wob),
    });
  }
  pencilStrokeDouble(workerBody, wPts, {
    color: GRAPHITE,
    width: 1.4,
    alpha: 0.85,
    jitter: 0.5,
    segmentsPerUnit: 0.2,
  });
  worker.addChild(workerBody);

  // T glyph — the joke. Hand-lettered, slightly rotated.
  const tGlyph = new Text({
    text: 'T',
    style: new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: 18,
      fontWeight: '600',
      fontStyle: 'italic',
      fill: GRAPHITE,
    }),
  });
  tGlyph.anchor.set(0.5);
  tGlyph.alpha = 0.9;
  tGlyph.rotation = (Math.random() - 0.5) * 0.18;
  worker.addChild(tGlyph);

  // Carried-block slot — populated when the worker is returning. The
  // block sits just above the worker's head. We keep a reference here
  // so setCarried can swap it cleanly.
  const carriedSlot = new Container();
  carriedSlot.y = -workerR - 14;
  carriedSlot.scale.set(0.55);
  worker.addChild(carriedSlot);

  container.addChild(worker);

  // -- Handles ----------------------------------------------------------
  let carriedChild: Container | null = null;

  container.__botHandles = {
    setWorkerLocal(localX: number, localY: number): void {
      worker.x = localX;
      worker.y = localY;
    },
    setCarried(value: Value | null): void {
      // Clear any existing carried child first.
      if (carriedChild) {
        carriedSlot.removeChild(carriedChild);
        carriedChild.destroy({ children: true });
        carriedChild = null;
      }
      if (value === null) return;
      // drawBlock places at (x, y); we want it centred at the slot
      // origin, so draw at (0, 0).
      carriedChild = drawBlock(value, 0, 0);
      carriedSlot.addChild(carriedChild);
    },
  };

  return container;
}

/** Type-narrowing accessor for the simulation layer. */
export function getBotHandles(container: Container): BotHandles | null {
  const c = container as BotContainer;
  return c.__botHandles ?? null;
}
