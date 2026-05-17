/**
 * Magnitude-ladder value rendering (Slice 6.2a + 6.2b + 6.2c).
 *
 * As numbers escalate up the operator hierarchy, the *label* on a block
 * climbs through notation tiers (DESIGN §17):
 *
 *   - **digits**  (0–999)            : plain numerals, no separators
 *   - **commas**  (10³–10⁶)          : 1,234 / 999,999
 *   - **sci**     (10⁶ … 10^(10⁸))   : 1.50×10⁴⁵ with Unicode superscript
 *   - **tower**   (beyond sci)       : penciled power tower of 10s with top mag (6.2b)
 *   - **arrow**   (beyond towers)    : `10↑↑N` — too tall to draw (6.2c)
 *   - **fgh**     (transfinite)      : `f_ε₀(100)`, then a parody placeholder
 *
 * The boundary between sci and tower is `Decimal.layer`: layer = 0 means
 * the mantissa is the value itself, layer = 1 means it's a single log₁₀
 * away (renderable as `1.50×10⁴⁵`), layer ≥ 2 means we're stacking
 * exponents — beyond what scientific notation can write inline. break_
 * eternity normalises so most layer=1 values have a sane mag (e.g.
 * 2↑↑5 ≈ 2e19728 is layer=1 mag=19728); tetration outputs only start
 * stacking at 2↑↑6 onward.
 *
 * The boundary between tower and arrow is `TIER_ARROW_LAYER_MIN`. Once the
 * height of the tower itself reaches six digits, the visual stack stops
 * communicating anything useful — you can't tell `↕1,000,003` from
 * `↕1,000,004` at a glance. The arrow tier compacts the same information
 * into `10↑↑N` (Knuth's double up-arrow notation) where N is the tower
 * height. `3↑↑↑3` renders as `10↑↑7.6×10¹²` — still legible, still
 * communicating order-of-magnitude scale.
 *
 * Non-real Value variants (rational, irrational, complex) keep their
 * existing renderers for now — the magnitude they carry is in their
 * real-Decimal parts, and those parts can route through this module in
 * a later polish pass.
 *
 * The module sits in `pixi/` and is the SOLE place that produces numeric
 * block labels above the digits tier. Callers (`block.ts`) get back a
 * `Container` they can drop in as a child; sizing and color are passed in.
 */

import { Container, Text, TextStyle } from 'pixi.js';
import Decimal from 'break_eternity.js';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';
import { valueMagnitude, type Value } from '../../../core/value';

// Thresholds in Decimal land — comparing magnitudes against constructed
// boundaries keeps tetration-tier inputs working without the JS-number trap.
const TIER_COMMAS_MIN = new Decimal(1000); // 10³
const TIER_SCI_MIN = new Decimal(1_000_000); // 10⁶

// Once the visual tower's height badge would have more than ~6 digits, the
// player can no longer absorb the height at a glance — switch to compact
// arrow notation. 100_000 is well past readability; below it, the
// truncated-tower with `↕N` badge still tells the right story.
const TIER_ARROW_LAYER_MIN = 100_000;

export type ValueLabelTier = 'digits' | 'commas' | 'sci' | 'tower' | 'arrow';

/**
 * Returns the tier appropriate for displaying `v`. Non-real Values stay on
 * the digits tier — their renderers (rational stacked, complex `a + bi`,
 * irrational symbol) handle the layout themselves. A later polish slice
 * can route the *parts* of these variants back through this function once
 * those parts grow past the comma threshold.
 */
export function valueLabelTier(v: Value): ValueLabelTier {
  if (v.kind !== 'real') return 'digits';
  const n = v.n;
  // Layer >= TIER_ARROW_LAYER_MIN: tower is too tall to render visually,
  // fall back to compact `10↑↑N` arrow notation.
  if (n.layer >= TIER_ARROW_LAYER_MIN) return 'arrow';
  // Layer >= 2 means the value is `10^(10^…)` — stacked exponents. Sci-
  // notation can't write this inline; the tower renderer is the home.
  if (n.layer >= 2) return 'tower';
  // Layer 1 always reads as a sci-notation number: the mag IS the exponent.
  if (n.layer === 1) return 'sci';
  // Layer 0 — classify by magnitude.
  const mag = valueMagnitude(v);
  if (mag.lt(TIER_COMMAS_MIN)) return 'digits';
  if (mag.lt(TIER_SCI_MIN)) return 'commas';
  return 'sci';
}

export interface ValueLabelOptions {
  /** Base font size for the digits tier — other tiers scale relative to this
   *  so a `1.50×10⁴⁵` fits the same 64-px block as a single-digit `7`. */
  baseFontSize: number;
  color: number;
}

/**
 * Returns a Pixi `Container` holding the label for `value`. The container
 * is anchored at its own (0, 0) — caller positions it inside the block.
 *
 * Only real Values use this entry point today; the other variants stay on
 * their existing rendering paths (see `block.ts:drawNumeralInto`).
 */
export function drawValueLabel(value: Value, options: ValueLabelOptions): Container {
  if (value.kind !== 'real') {
    // Caller shouldn't reach here; defensive fallback uses the digits tier.
    return drawDigits(new Decimal(0), false, options.baseFontSize, options.color);
  }
  const negative = value.n.lt(Decimal.dZero);
  const abs = value.n.abs();
  switch (valueLabelTier(value)) {
    case 'digits':
      return drawDigits(value.n, negative, options.baseFontSize, options.color);
    case 'commas':
      return drawCommas(value.n, negative, abs, options.baseFontSize, options.color);
    case 'sci':
      return drawSci(value.n, negative, abs, options.baseFontSize, options.color);
    case 'tower':
      return drawTower(value.n, negative, options.baseFontSize, options.color);
    case 'arrow':
      return drawArrow(value.n, negative, options.baseFontSize, options.color);
  }
}

// ---------------------------------------------------------------------------
// Tier renderers — each returns a Container that fits inside a block.
// ---------------------------------------------------------------------------

function drawDigits(n: Decimal, _negative: boolean, baseSize: number, color: number): Container {
  const c = new Container();
  const text = n.toString();
  // Slight per-instance size variance keeps hand-placed feel.
  const sizeJitter = (Math.random() - 0.5) * 4;
  const style = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: baseSize + sizeJitter,
    fontWeight: '400',
    fill: color,
    align: 'center',
  });
  const t = new Text({ text, style });
  t.anchor.set(0.5);
  t.alpha = 0.93;
  t.rotation = (Math.random() - 0.5) * 0.04;
  c.addChild(t);
  return c;
}

function drawCommas(
  n: Decimal,
  negative: boolean,
  abs: Decimal,
  baseSize: number,
  color: number,
): Container {
  // Format the integer with US-style thousand separators. At this magnitude
  // (10³–10⁶) the number is small enough that Decimal.toNumber() is exact.
  // Non-integer reals in this range are rare in practice (we only produce
  // them from division of non-divisible integers) — they fall through to
  // sci-notation rendering of the same magnitude for a consistent look.
  const num = n.toNumber();
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return drawSci(n, negative, abs, baseSize, color);
  }
  const text = num.toLocaleString('en-US');
  // The longest comma-tier string is "-999,999" — 8 chars. Auto-shrink so
  // both "1,000" and "999,999" sit comfortably inside the same block size.
  const len = text.length;
  const fontSize = len <= 5 ? baseSize * 0.62 : len <= 7 ? baseSize * 0.5 : baseSize * 0.42;
  const c = new Container();
  const sizeJitter = (Math.random() - 0.5) * 2;
  const style = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: fontSize + sizeJitter,
    fontWeight: '400',
    fill: color,
    align: 'center',
  });
  const t = new Text({ text, style });
  t.anchor.set(0.5);
  t.alpha = 0.93;
  t.rotation = (Math.random() - 0.5) * 0.03;
  c.addChild(t);
  return c;
}

/**
 * Sci-notation: `1.50×10⁴⁵`. We render as ONE Text — exponent is a Unicode
 * superscript string, so font metrics and the multiplication sign sit
 * together cleanly. (A separate-Text approach with manual positioning
 * would fight the pencil font's variable widths.)
 *
 * The tier router only sends layer ≤ 1 values here, so `expNum` is always
 * a finite JS number; for layer=1 it can run to ~10⁸ which we render as
 * a long superscript string with auto-shrunk font. Anything bigger gets
 * promoted to layer ≥ 2 by break_eternity and routes to `drawTower`.
 */
function drawSci(
  n: Decimal,
  negative: boolean,
  abs: Decimal,
  baseSize: number,
  color: number,
): Container {
  const c = new Container();

  const log = abs.log10();
  const expDecimal = log.floor();
  const expNum = expDecimal.toNumber();

  // Mantissa: abs / 10^exp. For very large `expNum`, computing 10^expNum
  // round-trips through break_eternity safely; mantNum lands in [1, 10).
  const mantD = abs.div(new Decimal(10).pow(expDecimal));
  const mantNum = mantD.toNumber();
  const mantStr = Number.isFinite(mantNum) ? mantNum.toFixed(2) : '1.00';
  const sign = negative ? '-' : '';
  const text = `${sign}${mantStr}×10${superscriptDigits(expNum)}`;

  // Size: scientific notation needs 7–10 chars to read; shrink relative
  // to the digits tier so the block isn't visually crowded. Very long
  // exponents (layer=1 with huge mag) still need a readable size.
  const len = text.length;
  const fontSize =
    len <= 9 ? baseSize * 0.42 :
    len <= 12 ? baseSize * 0.36 :
    len <= 16 ? baseSize * 0.3 :
    baseSize * 0.24;
  return makeSingleText(c, text, fontSize, color);
}

/**
 * Power tower — stacked `10`s topped by the Decimal's `mag` (Slice 6.2b).
 *
 * `Decimal.layer` counts how many times `log₁₀` has been applied; visually
 * that's how many `10`s stack beneath the top number. So:
 *
 *   - layer=2, mag=4.29 → `10^(10^4.29)` → tower of `[10, 10, 4.29]`
 *   - layer=4, mag=8    → tower of `[10, 10, 10, 10, 8]`
 *   - layer=98, mag=1e10 → truncated tower with a height badge
 *
 * Visible levels cap at 4 (top-most three + base) to fit a 64-px block.
 * Past that we drop in a vertical `⋮` between the top stack and base, plus
 * an italic `↕ N` annotation to the right showing total height.
 *
 * Each level is rendered as one `Text`; per-level font sizes decrease
 * upward — the way mathematicians actually write towers, the topmost
 * exponent shrinking out toward illegibility being part of the joke.
 */
function drawTower(n: Decimal, negative: boolean, baseSize: number, color: number): Container {
  const c = new Container();
  const layer = n.layer;
  const topMag = n.mag;
  const totalLevels = layer + 1;

  const MAX_VISIBLE = 4;
  const truncated = totalLevels > MAX_VISIBLE;

  // Build the list of strings to stack, BOTTOM to TOP.
  //   - all-visible:    `['10', '10', ..., topMag-formatted]`  (layer 10s + 1 top)
  //   - truncated:      `['10', '⋮', '10', '10', topMag-formatted]`
  //                     bottom 10, ellipsis collapsing the middle, top 3
  const topMagStr = formatTopMag(topMag);
  let levels: string[];
  if (!truncated) {
    levels = new Array(layer).fill('10');
    levels.push(topMagStr);
  } else {
    levels = ['10', '⋮', '10', '10', topMagStr];
  }

  // Stack vertically — bottom level sits low in the block, top level sits
  // high. Both Y and font size adapt to the number of levels so a 3-tall
  // tower spreads through the whole block height while a 5-tall tower
  // packs tighter without spilling out.
  const count = levels.length;
  const yPositions = towerYPositions(count);
  const sizes = towerFontSizes(count, baseSize);

  // Negative-sign marker on the base (rare at tower magnitudes — included
  // for completeness).
  if (negative) {
    levels[0] = `-${levels[0]}`;
  }

  for (let i = 0; i < count; i++) {
    const style = new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: sizes[i],
      fontWeight: '400',
      fill: color,
      align: 'center',
    });
    const t = new Text({ text: levels[i], style });
    t.anchor.set(0.5);
    t.x = 0;
    t.y = yPositions[i];
    t.alpha = 0.93;
    t.rotation = (Math.random() - 0.5) * 0.04;
    c.addChild(t);
  }

  // Height annotation `↕ N` — only when truncated. Sits to the right of
  // the stack as a small italic note, in the same italic register the
  // warehouse-port and cost-preview labels use.
  if (truncated) {
    const badgeStyle = new TextStyle({
      fontFamily: PENCIL_FONT_FAMILY,
      fontSize: baseSize * 0.22,
      fontStyle: 'italic',
      fontWeight: '400',
      fill: GRAPHITE,
    });
    const badge = new Text({ text: `↕${totalLevels}`, style: badgeStyle });
    badge.anchor.set(0, 0.5);
    badge.x = 14;
    badge.y = -2;
    badge.alpha = 0.6;
    badge.rotation = (Math.random() - 0.5) * 0.04;
    c.addChild(badge);
  }

  return c;
}

/**
 * Arrow-notation tier — compact `10↑↑N` for values whose tower height
 * has overflowed the visual stack (Slice 6.2c).
 *
 * A Decimal with `layer = L, mag = m` is approximately `10↑↑(L+1)` for
 * any modestly-sized mag (when mag < ~10 the top of the tower is just a
 * small constant; when mag is itself large the top contributes one extra
 * effective level). We round up to `L + 1` so the player sees the
 * height of the implied tower of 10s plus the top mag.
 *
 * Rendering is a single `Text` with Knuth's `↑↑` between `10` and the
 * formatted height. No Unicode superscript exponent because the height
 * may already be in sci-notation (`10↑↑7.6×10¹²`), and nested
 * superscripts would crowd the block.
 */
function drawArrow(n: Decimal, negative: boolean, baseSize: number, color: number): Container {
  const c = new Container();
  // Effective tower height: `layer` 10s plus one for the top mag.
  // `layer` is a JS number — for the values we see here it's between
  // 10⁵ and Number.MAX_VALUE; formatLayerHeight handles both ranges.
  const towerHeight = n.layer + 1;
  const sign = negative ? '-' : '';
  const text = `${sign}10↑↑${formatLayerHeight(towerHeight)}`;

  // Auto-shrink for very long heights. `10↑↑7.6e+12` is ~12 chars;
  // `10↑↑(1.0e+18)` is closer to 16.
  const len = text.length;
  const fontSize =
    len <= 10 ? baseSize * 0.36 :
    len <= 14 ? baseSize * 0.3 :
    baseSize * 0.24;
  return makeSingleText(c, text, fontSize, color);
}

/**
 * Formats the tower-height count (a JS number, possibly enormous) into
 * a short string suitable for inline arrow notation. ASCII sci-notation
 * past 10⁶ keeps the label compact; comma-separated below that for
 * readability when the player can still recognise the magnitude.
 */
function formatLayerHeight(height: number): string {
  if (!Number.isFinite(height)) return '∞';
  const rounded = Math.round(height);
  if (rounded < 1000) return rounded.toString();
  if (rounded < 1_000_000) return rounded.toLocaleString('en-US');
  return rounded.toExponential(1);
}

/**
 * Distributes `count` tower levels vertically inside a 64-px block. The
 * bottom level sits low (~+18), the top high (~-22), with equal spacing.
 * Returned positions are ordered BOTTOM-to-TOP to match how `levels[]` is
 * built in `drawTower`.
 */
function towerYPositions(count: number): number[] {
  if (count === 1) return [0];
  const BOTTOM = 18;
  const TOP = -22;
  const step = (BOTTOM - TOP) / (count - 1);
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(BOTTOM - i * step);
  }
  return positions;
}

/**
 * Tapered font sizes for the tower — bottom level largest (most prominent),
 * shrinking linearly toward the top so even a 5-tall tower fits without
 * overlapping. The taper is part of the joke (the upper levels of an
 * arrow-tower number genuinely become unreadable in standard notation).
 */
function towerFontSizes(count: number, baseSize: number): number[] {
  const BOTTOM_RATIO = 0.4;
  const TOP_RATIO = 0.18;
  const bottom = baseSize * BOTTOM_RATIO;
  if (count === 1) return [bottom];
  const top = baseSize * TOP_RATIO;
  const step = (bottom - top) / (count - 1);
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) {
    sizes.push(bottom - i * step);
  }
  return sizes;
}

/**
 * Renders the top-of-tower magnitude as a short string. `mag` is the
 * mantissa after `layer` applications of log₁₀ — usually a normal JS
 * number, occasionally astronomical (e.g. `10↑↑5` has top mag 10¹⁰).
 *
 *   - mag < 1000     : show as integer (`8`, `742`)
 *   - mag < 10⁶      : show with commas (`19,728`)
 *   - else           : sci-notation string with ASCII exponent
 *
 * No Unicode superscript here — the top of a tower is already small;
 * mixing in `×10⁹` superscripts adds visual noise.
 */
function formatTopMag(mag: number): string {
  if (!Number.isFinite(mag)) return '∞';
  const rounded = Math.round(mag * 100) / 100;
  if (Math.abs(rounded) < 1000) {
    // For small mag, show integer-ish (round). The hundredths add detail
    // the tower top doesn't really need; ceil/floor to integer for clarity.
    return Math.round(rounded).toString();
  }
  if (Math.abs(rounded) < 1_000_000) {
    return Math.round(rounded).toLocaleString('en-US');
  }
  // Sci notation, ASCII exponent (no superscript Unicode at this nesting).
  return rounded.toExponential(1);
}

function makeSingleText(container: Container, text: string, fontSize: number, color: number): Container {
  const sizeJitter = (Math.random() - 0.5) * 2;
  const style = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: fontSize + sizeJitter,
    fontWeight: '400',
    fill: color,
    align: 'center',
  });
  const t = new Text({ text, style });
  t.anchor.set(0.5);
  t.alpha = 0.93;
  t.rotation = (Math.random() - 0.5) * 0.03;
  container.addChild(t);
  return container;
}

// ---------------------------------------------------------------------------
// Unicode superscript exponent — covers digits and sign so `2.5×10⁻⁷` reads.
// ---------------------------------------------------------------------------

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '+': '⁺',
};

function superscriptDigits(n: number): string {
  return String(Math.trunc(n))
    .split('')
    .map((ch) => SUPERSCRIPT_MAP[ch] ?? ch)
    .join('');
}
