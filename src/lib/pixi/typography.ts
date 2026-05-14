import { TextStyle } from 'pixi.js';
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
 * Convenience factory for a `TextStyle` in the pencil register. Keeps the
 * font family + weight defaults consistent without forcing every caller to
 * pass the same options.
 */
export function pencilTextStyle(opts: {
  fontSize: number;
  fontWeight?: '300' | '400' | '500';
  fill?: number;
}): TextStyle {
  return new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: opts.fontSize,
    fontWeight: opts.fontWeight ?? '400',
    fill: opts.fill ?? GRAPHITE,
  });
}
