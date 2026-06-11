import type { Application, FederatedPointerEvent } from 'pixi.js';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { PENCIL_CURSOR_URL } from '../cursors';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';

/**
 * The river of zeros — the game's only source.
 *
 * A densely-packed, overlapping torrent of `0`-cards drifting leftward along
 * the bottom of the page. Each zero sits on a small paper-tinted card with a
 * faint pencil outline; with hundreds of these layered across a tall band,
 * the river reads as a churning soup where no single zero is visible for long
 * before the current rearranges it.
 *
 * Each zero is assigned a single "depth" value t ∈ [0, 1] that correlates its
 * size, opacity, and flow speed:
 *   t ≈ 0 → small, faint, slow (back of the stream)
 *   t ≈ 1 → large, bold, fast  (front of the stream)
 * Zeros are stacked back-to-front by speed so the parallax reads correctly,
 * and the cards' paper-coloured fills mean closer zeros visibly *occlude*
 * the ones behind them.
 */

// Slimmed for screen hygiene (UX_PLAN U2.1): the river is ambiance for the
// close-up game; at factory scale it must not own a third of the page or
// drown the loose pool and marginalia that share the bottom band.
const RIVER_BAND_HEIGHT_PX = 104;
const RIVER_CENTER_FROM_BOTTOM_PX = 60;

const ZERO_COUNT = 320; // dense enough to read as a torrent, not a wall

const FONT_SIZE_MIN = 18;
const FONT_SIZE_MAX = 40;
const FILL_ALPHA_MIN = 0.14;
const FILL_ALPHA_MAX = 0.7;
const OUTLINE_ALPHA_MIN = 0.06;
const OUTLINE_ALPHA_MAX = 0.32;
const TEXT_ALPHA_MIN = 0.22;
const TEXT_ALPHA_MAX = 0.78;
const FLOW_SPEED_MIN_PX_PER_SEC = 12;
const FLOW_SPEED_MAX_PX_PER_SEC = 70;
const ROTATION_JITTER_RAD = 0.22;

const PAPER = 0xfbf7ee;

interface RiverZero {
  container: Container;
  speed: number;
}

export interface RiverOptions {
  /**
   * Called when the user presses a river zero. The picked zero is
   * immediately recycled to the right edge so the stream stays full; the
   * handler receives the original pointer event so the caller can begin
   * a drag at the click coordinates.
   */
  onZeroPicked?: (event: FederatedPointerEvent) => void;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/**
 * Builds one river card: paper-tinted background, faint outline, numeral.
 * Cheaper than the placed-block visual (no double-pencil wobble) — the river
 * holds many, and they each appear for moments only. Placed blocks remain
 * the more individually-crafted artifacts.
 */
function makeRiverZero(t: number): Container {
  const fontSize = Math.round(lerp(FONT_SIZE_MIN, FONT_SIZE_MAX, t));
  const boxW = fontSize * 1.35;
  const boxH = fontSize * 1.2;

  const fillAlpha = lerp(FILL_ALPHA_MIN, FILL_ALPHA_MAX, t);
  const outlineAlpha = lerp(OUTLINE_ALPHA_MIN, OUTLINE_ALPHA_MAX, t);
  const textAlpha = lerp(TEXT_ALPHA_MIN, TEXT_ALPHA_MAX, t);

  const container = new Container();

  const bg = new Graphics();
  bg.rect(-boxW / 2, -boxH / 2, boxW, boxH);
  bg.fill({ color: PAPER, alpha: fillAlpha });
  bg.stroke({ color: GRAPHITE, width: 0.9, alpha: outlineAlpha });
  container.addChild(bg);

  const text = new Text({
    text: '0',
    style: new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize,
      fontWeight: '400',
      fill: GRAPHITE,
    }),
  });
  text.anchor.set(0.5);
  text.alpha = textAlpha;
  container.addChild(text);

  return container;
}

export function setupRiver(app: Application, options: RiverOptions = {}): Container {
  const riverContainer = new Container();
  riverContainer.y = app.screen.height - RIVER_CENTER_FROM_BOTTOM_PX;

  const halfBand = RIVER_BAND_HEIGHT_PX / 2;
  const width = app.screen.width;
  const zeros: RiverZero[] = [];

  // One clean margin line separating the river from the workspace (a ruled
  // notebook line — the bank). Redrawn on resize by the caller recreating us.
  const bank = new Graphics();
  bank.moveTo(0, -halfBand - 12).lineTo(width, -halfBand - 12);
  bank.stroke({ color: GRAPHITE, width: 1, alpha: 0.18 });
  riverContainer.addChild(bank);

  for (let i = 0; i < ZERO_COUNT; i++) {
    const t = Math.random();
    const speed = lerp(FLOW_SPEED_MIN_PX_PER_SEC, FLOW_SPEED_MAX_PX_PER_SEC, t);

    const zeroCard = makeRiverZero(t);
    zeroCard.x = rand(-150, width + 150);
    zeroCard.y = rand(-halfBand, halfBand);
    zeroCard.rotation = rand(-ROTATION_JITTER_RAD, ROTATION_JITTER_RAD);

    // Interactivity: each card responds to pointerdown to initiate pickup.
    // The pencil cursor stays the same on hover — the visual feedback for
    // "this is grabbable" comes from the river's own motion and density,
    // not from a cursor change.
    zeroCard.eventMode = 'static';
    zeroCard.cursor = PENCIL_CURSOR_URL;

    const zeroRef: RiverZero = { container: zeroCard, speed };
    zeros.push(zeroRef);

    zeroCard.on('pointerdown', (event: FederatedPointerEvent) => {
      if (event.button !== 0) return; // left-mouse only; middle-mouse pans
      // Immediately recycle the picked zero so the river density stays constant.
      // The player's drag is handled by the caller via the callback.
      const screenWidth = app.screen.width;
      zeroCard.x = screenWidth + rand(20, 180);
      zeroCard.y = rand(-halfBand, halfBand);
      zeroCard.rotation = rand(-ROTATION_JITTER_RAD, ROTATION_JITTER_RAD);

      options.onZeroPicked?.(event);
    });
  }

  // Sort back-to-front so the faster, larger, more opaque "near" zeros render
  // on top of the slower, fainter "far" ones. This is what makes the parallax
  // depth read correctly.
  zeros.sort((a, b) => a.speed - b.speed);
  for (const z of zeros) riverContainer.addChild(z.container);

  // Continuous leftward drift. Recycled zeros keep their depth (so a slow
  // background zero stays slow forever) but get a fresh Y and rotation.
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    const screenWidth = app.screen.width;

    for (const z of zeros) {
      z.container.x -= z.speed * dt;
      if (z.container.x < -150) {
        z.container.x = screenWidth + rand(20, 180);
        z.container.y = rand(-halfBand, halfBand);
        z.container.rotation = rand(-ROTATION_JITTER_RAD, ROTATION_JITTER_RAD);
      }
    }
  });

  return riverContainer;
}
