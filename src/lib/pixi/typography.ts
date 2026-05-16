import { Text, TextStyle } from 'pixi.js';
import { GRAPHITE } from '../colors';

/**
 * Shared text constants for the pencil-notebook aesthetic.
 *
 * Every canvas-side text in the game uses the same font stack — Kalam at the
 * top, Patrick Hand and Caveat as graceful degradations, then Georgia and a
 * generic serif for systems without web fonts. Centralising the stack here
 * means future tweaks (e.g. switching to a single bundled font) land in one
 * place instead of twelve.
 */
export const PENCIL_FONT_FAMILY =
  '"Kalam", "Patrick Hand", "Caveat", Georgia, serif';

/** Re-exported for backwards compatibility — the palette source of truth
 *  is now `src/lib/colors.ts`. New consumers should import from there. */
export { GRAPHITE };

/**
 * Slice 6.18 — text resolution multiplier. Pixi renders Text to a texture
 * at this resolution, then the texture is scaled by the camera. Without
 * a multiplier, text gets visibly pixelated at the camera's max 4× zoom.
 * 2× hits a pragmatic sweet spot: crisp at 2-3× zoom, acceptable at 4×,
 * memory cost still small for the few hundred Text nodes a typical
 * factory holds.
 */
export const PENCIL_TEXT_RESOLUTION = 2;

/**
 * Convenience factory for a `TextStyle` in the pencil register. Keeps the
 * font family + weight defaults consistent without forcing every caller to
 * pass the same options.
 */
export function pencilTextStyle(opts: {
  fontSize: number;
  fontWeight?: '300' | '400' | '500' | '600';
  fill?: number;
  fontStyle?: 'normal' | 'italic';
}): TextStyle {
  return new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: opts.fontSize,
    fontWeight: opts.fontWeight ?? '400',
    fill: opts.fill ?? GRAPHITE,
    fontStyle: opts.fontStyle ?? 'normal',
  });
}

/**
 * Slice 6.18 — canonical badge typography hierarchy. Every cell visual
 * uses one of these so font sizes don't drift across the catalog.
 *
 *   - HEADLINE  (cell operator glyph)              : 28–64 pt, weight 500
 *   - LABEL     (warehouse type, filter predicate) : 18–24 pt, italic
 *   - ARROW     (output indicator →)               : 28 pt
 *   - COUNTER   (warehouse N / cap)                : 18 pt
 *   - BADGE     (cost preview, level Roman)        : 13 pt italic
 *   - HINT      (port label, fuel, in/out, yes/no) : 12 pt italic
 *
 * Callers either use these factories directly or read `BADGE.fontSize`
 * for placement math.
 */
export const BADGE = {
  fontSize: 13,
  style(): TextStyle {
    return pencilTextStyle({ fontSize: 13, fontStyle: 'italic' });
  },
};

export const HINT = {
  fontSize: 12,
  style(): TextStyle {
    return pencilTextStyle({ fontSize: 12, fontStyle: 'italic' });
  },
};

export const ARROW = {
  fontSize: 28,
  style(): TextStyle {
    return pencilTextStyle({ fontSize: 28 });
  },
};

export const COUNTER = {
  fontSize: 18,
  style(): TextStyle {
    return pencilTextStyle({ fontSize: 18 });
  },
};

/**
 * Slice 6.18 — `Text` factory that bakes in the pencil resolution
 * boost. Use this for any Text that needs to remain crisp under camera
 * zoom (i.e. anything in `canvasLayer`). Screen-fixed UI (HUD, sidebar)
 * doesn't need it — those don't pass through the camera transform.
 *
 * If the Pixi build doesn't expose the `resolution` option on Text,
 * we fall back silently — visible to the player as text that's slightly
 * less crisp at max zoom, but never broken.
 */
export function pencilText(text: string, style: TextStyle): Text {
  // The cast covers Pixi 8 versions whose typings vary on the options
  // shape; the constructor accepts an extra resolution field at runtime.
  return new Text({
    text,
    style,
    resolution: PENCIL_TEXT_RESOLUTION,
  } as ConstructorParameters<typeof Text>[0]);
}
