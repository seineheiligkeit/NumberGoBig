import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pencilStroke, pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';
import { getBotHandles, type BotHandles } from './cleanup-bot';

/**
 * Decomposer bot visual — Phase 6 δ.1 (DESIGN §9). Three flavours of
 * walking worker that act on a loose block IN PLACE rather than carrying
 * it elsewhere:
 *
 *   - **Factor (F-bot)** — splits a composite into its prime factors.
 *   - **Decrement (D-bot)** — n ↦ (n − 1) + a free 1.
 *   - **Inversion (I-bot)** — n ↦ 1/n. Late-game; signed-fuel.
 *
 * Shares the station-and-worker chassis with the T-bot (`cleanup-bot.ts`)
 * — only the worker's glyph and the bot's structural role differ. The
 * carried-block visual is reused on the unlikely path where a future
 * variant might carry an intermediate; today decomposer bots don't
 * carry, but the API stays for parity with `BotHandles`.
 *
 * Visual signature: station outline is slightly more angular (a small
 * pencil-square instead of the T-bot's circle) so the player can
 * distinguish bot families at a glance even before reading the glyph.
 */

export const DECOMPOSER_BOT_WIDTH = 56;
export const DECOMPOSER_BOT_HEIGHT = 56;

type BotContainer = Container & { __botHandles?: BotHandles };

export function drawDecomposerBot(
  _x: number,
  _y: number,
  options: { glyph: string; radius?: number },
): Container {
  const { glyph, radius = 240 } = options;
  const container = new Container() as BotContainer;

  // -- Station (square — distinguishes from T-bot's circle) -------------
  const station = new Graphics();
  const half = DECOMPOSER_BOT_WIDTH / 2;
  const cj = (): number => (Math.random() - 0.5) * 1.8;
  const corners = [
    { x: -half + cj(), y: -half + cj() },
    { x: half + cj(), y: -half + cj() },
    { x: half + cj(), y: half + cj() },
    { x: -half + cj(), y: half + cj() },
  ];
  corners.push({ ...corners[0] });
  pencilStrokeDouble(station, corners, {
    color: GRAPHITE,
    width: 1.3,
    alpha: 0.55,
    jitter: 0.6,
    segmentsPerUnit: 0.18,
  });
  station.alpha = 0.85;
  container.addChild(station);

  // Faint pad cross-hatch — three short diagonals.
  const pad = new Graphics();
  for (let i = -2; i <= 2; i++) {
    const y = i * 6;
    pencilStroke(
      pad,
      [
        { x: -half + 8, y },
        { x: half - 8, y },
      ],
      { color: GRAPHITE, width: 0.5, alpha: 0.15, jitter: 0.3, segmentsPerUnit: 0.18 },
    );
  }
  container.addChild(pad);

  // -- Search-radius halo -----------------------------------------------
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
  const worker = new Container();
  worker.x = 0;
  worker.y = 0;

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

  // Glyph — F / D / 1/x (per bot family).
  const fontSize = glyph.length > 1 ? 13 : 18;
  const glyphText = new Text({
    text: glyph,
    style: new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize,
      fontWeight: '600',
      fontStyle: 'italic',
      fill: GRAPHITE,
    }),
  });
  glyphText.anchor.set(0.5);
  glyphText.alpha = 0.9;
  glyphText.rotation = (Math.random() - 0.5) * 0.18;
  worker.addChild(glyphText);

  container.addChild(worker);

  // -- Handles ----------------------------------------------------------
  // Decomposer bots don't carry — `setCarried` is a no-op kept so the
  // shared `BotHandles` shape works for both bot families.
  container.__botHandles = {
    setWorkerLocal(localX: number, localY: number): void {
      worker.x = localX;
      worker.y = localY;
    },
    setCarried(_value): void {
      // intentionally empty
    },
  };

  return container;
}

/** Re-export so callers don't import from two places. */
export { getBotHandles };
