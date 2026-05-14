/**
 * Pencil-notebook palette — the single source of truth for canvas-side
 * colour in numeric (0xRRGGBB) form. Mirrors the `--accent-*` CSS variables
 * in `app.css`; the two must be kept in sync.
 *
 * Reading the design discipline (DESIGN §17 — "Color discipline"):
 * default is graphite-on-cream; accents enter only for *meaning*. Each
 * constant below corresponds to a number family or a state signal — never
 * decorative.
 */

/** Default graphite — used for every numeral, outline, and label by default. */
export const GRAPHITE = 0x3a3a3a;

/** Primes (Phase 4). */
export const ACCENT_RED = 0xc8473c;
/** Negatives. */
export const ACCENT_BLUE = 0x4a6b8a;
/** Rationals (and decimals). */
export const ACCENT_GREEN = 0x4a7a4a;
/** Complex numbers. */
export const ACCENT_PURPLE = 0x6b4a8a;
/** Selection / callout highlight. */
export const HIGHLIGHTER = 0xf4e68a;
/** Jammed-pipe tint. The only state-driven exception to the "color for
 *  meaning" rule — and it earns its place because a stalled pipe needs an
 *  unmissable cue. */
export const JAM_TINT = 0x8b3a2a;
