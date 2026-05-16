import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pencilStroke, pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY, pencilText } from './typography';
import type { PlacedBlock } from '../world';
import { valueExceeds, valueLabel, type Value } from '../value';
import { valueColor } from '../family';
import { drawValueLabel } from './value-label';

/**
 * Renders a single number block in the pencil-notebook style.
 *
 * Each block is a small square with the number penciled inside. To avoid the
 * stamped, mechanical feel of a vector primitive:
 *  - the four corners are jittered (block isn't a perfect square)
 *  - the outline is stroked twice with a pencil-style wobble along its length
 *  - the numeral has a slight per-instance size and rotation variation
 *  - the whole block is slightly rotated
 * No two blocks are pixel-identical. This is the visual signature of the
 * "hand-drawn" aesthetic.
 *
 * Slice 4.2 adds rational rendering — a stacked numerator/pencil-bar/
 * denominator layout. Same outer square; just the contents differ by
 * Value variant.
 */

const BLOCK_SIZE = 64;
const CORNER_JITTER_PX = 1.8;
const ROTATION_JITTER_RAD = 0.05;

export function drawBlock(value: Value, x: number, y: number): Container {
  const container = new Container();
  container.x = x;
  container.y = y;

  const half = BLOCK_SIZE / 2;

  // Slightly imperfect square corners.
  const cj = (): number => (Math.random() - 0.5) * 2 * CORNER_JITTER_PX;
  const corners = [
    { x: -half + cj(), y: -half + cj() },
    { x: half + cj(), y: -half + cj() },
    { x: half + cj(), y: half + cj() },
    { x: -half + cj(), y: half + cj() },
  ];
  // Close the loop so the outline meets itself.
  corners.push({ ...corners[0] });

  // Outline always stays graphite — the family colour reads on the numeral,
  // not the page. (DESIGN §17 — "color is used sparingly, the way
  // mathematicians use colored pencils.")
  const outline = new Graphics();
  pencilStrokeDouble(outline, corners, {
    color: GRAPHITE,
    width: 1.7,
    alpha: 0.85,
    jitter: 0.75,
    segmentsPerUnit: 0.22,
  });
  container.addChild(outline);

  drawNumeralInto(container, value);

  // Whole-block rotation — sits on the page like it was placed by hand.
  container.rotation = (Math.random() - 0.5) * 2 * ROTATION_JITTER_RAD;

  return container;
}

/**
 * Draws the inner content of a block. Branches on Value variant:
 *   - real        → a single penciled numeral
 *   - rational    → stacked numerator / pencil bar / denominator
 *   - irrational  → the symbol as a single inline glyph (the `√` does the
 *                   visual work; 4.5 polish may build out a proper radical
 *                   with vinculum)
 *   - (4.4)       → complex `a + bi`, etc.
 */
function drawNumeralInto(container: Container, value: Value): void {
  switch (value.kind) {
    case 'real': {
      // Real Values route through the magnitude-ladder renderer (Slice 6.2a):
      // digits / commas / sci-notation per `valueLabelTier`. The renderer
      // returns a Container which we add directly; per-instance jitter is
      // baked in there so two `1729`s still look distinct.
      const labelContainer = drawValueLabel(value, { baseFontSize: 38, color: valueColor(value) });
      container.addChild(labelContainer);
      return;
    }
    case 'rational':
      drawRationalNumeral(container, value);
      return;
    case 'irrational':
      // Irrational labels (`√2`, `-√1234`) span more characters than a
      // typical real; shrink a touch so a `-√1729` still fits.
      drawSingleLineNumeral(container, value, 30);
      return;
    case 'complex':
      // `a + bi` is the widest standard label in the catalog. Auto-shrink
      // proportional to length so `3 + 4i` reads big and `100 + 200i`
      // still fits.
      drawSingleLineNumeral(container, value, complexFontSize(value));
      return;
  }
}

function complexFontSize(v: Value & { kind: 'complex' }): number {
  const len = `${v.re.toString()}+${v.im.toString()}i`.length;
  if (len <= 4) return 32;
  if (len <= 7) return 22;
  return 16;
}

/** Single-line text numeral with the family colour. Used by `real` and
 *  `irrational`. Per-instance jitter for hand-placed feel.
 *
 *  Slice 6.18: routed through `pencilText` so block numerals stay crisp
 *  at the camera's max 4× zoom. With ~hundreds of blocks visible at
 *  once in a mid-game factory, this is the single highest-impact
 *  Text-resolution change. */
function drawSingleLineNumeral(container: Container, value: Value, baseSize: number): void {
  const sizeJitter = (Math.random() - 0.5) * 4;
  const style = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: baseSize + sizeJitter,
    fontWeight: '400',
    fill: valueColor(value),
    align: 'center',
  });
  const text = pencilText(valueLabel(value), style);
  text.anchor.set(0.5);
  text.alpha = 0.93;
  text.rotation = (Math.random() - 0.5) * 0.04;
  container.addChild(text);
}

/**
 * Two stacked penciled numerals separated by a hand-drawn horizontal bar —
 * the way a mathematician writes a fraction. Each numeral keeps its own
 * per-instance jitter so two `1/3` blocks still look distinct.
 */
function drawRationalNumeral(container: Container, value: Value & { kind: 'rational' }): void {
  const color = valueColor(value);
  const numText = value.num.toString();
  const denText = value.den.toString();

  // Auto-shrink for wider numerators / denominators so the digits stay
  // inside the block. The natural size is 22 px; long fractions like
  // "1234/5678" drop to ~16.
  const longer = Math.max(numText.length, denText.length);
  const fontSize = longer <= 2 ? 22 : longer <= 4 ? 18 : 14;

  const numStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize,
    fontWeight: '400',
    fill: color,
    align: 'center',
  });
  const denStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize,
    fontWeight: '400',
    fill: color,
    align: 'center',
  });

  // Slice 6.18: rational numerals also use `pencilText` for crispness
  // at zoom — fractions read smaller per-digit than integers.
  const numerator = pencilText(numText, numStyle);
  numerator.anchor.set(0.5);
  numerator.x = 0;
  numerator.y = -fontSize * 0.7;
  numerator.alpha = 0.93;
  numerator.rotation = (Math.random() - 0.5) * 0.03;
  container.addChild(numerator);

  const denominator = pencilText(denText, denStyle);
  denominator.anchor.set(0.5);
  denominator.x = 0;
  denominator.y = fontSize * 0.7;
  denominator.alpha = 0.93;
  denominator.rotation = (Math.random() - 0.5) * 0.03;
  container.addChild(denominator);

  // The fraction bar — a short penciled horizontal line. Slightly tilted
  // and wobbled so it reads handwritten.
  const barHalf = 18;
  const barTilt = (Math.random() - 0.5) * 0.04;
  const bar = new Graphics();
  pencilStroke(
    bar,
    [
      { x: -barHalf, y: 0 + barTilt * barHalf },
      { x: barHalf, y: 0 - barTilt * barHalf },
    ],
    { color, width: 1.4, alpha: 0.85, jitter: 0.4, segmentsPerUnit: 0.3 },
  );
  container.addChild(bar);
}

/**
 * Sets a block's visual alpha based on the player's Comprehension level.
 * Numbers above the cap are faded so the player can see they exist but
 * understands they cannot be touched — only moved by automation. Single
 * place to keep the look consistent across block creations and Comprehension
 * upgrades.
 */
const OVER_COMP_ALPHA = 0.42;
const NORMAL_ALPHA = 1.0;
export function applyComprehensionStyle(block: PlacedBlock, cap: number): void {
  block.container.alpha = valueExceeds(block.value, cap) ? OVER_COMP_ALPHA : NORMAL_ALPHA;
}

/**
 * Adds or updates the `×N` stack-count badge on a placed block.
 *
 * When count <= 1, the badge is removed (single blocks read as "just a block").
 * When count >= 2, a small penciled annotation appears at the lower-right of
 * the block — like a mathematician's marginal tally.
 */
export function updateStackBadge(block: PlacedBlock): void {
  if (block.count <= 1) {
    if (block.badge) {
      block.container.removeChild(block.badge);
      block.badge.destroy();
      block.badge = null;
    }
    return;
  }

  const label = `×${block.count}`;
  if (block.badge) {
    block.badge.text = label;
    return;
  }

  // Slice 6.18: stack badge crisp at zoom — visible on every multi-stack
  // block in the world.
  const badge = pencilText(label, new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 22,
    fontWeight: '400',
    fill: GRAPHITE,
  }));
  badge.anchor.set(0, 0.5);
  badge.x = 30;
  badge.y = 26;
  badge.alpha = 0.88;
  // Counter-rotate slightly so the annotation reads horizontally despite
  // the block's hand-placed tilt.
  badge.rotation = (Math.random() - 0.5) * 0.06;
  block.container.addChild(badge);
  block.badge = badge;
}
