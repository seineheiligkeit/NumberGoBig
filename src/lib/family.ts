/**
 * Family — variant-derived classification of a Value.
 *
 * The page begins muted graphite-on-cream. Color enters only for *meaning*,
 * the way a mathematician reaches for a colored pencil to circle a prime
 * (DESIGN §17). This module is the single source of truth for which family
 * a Value belongs to and how that family is drawn.
 *
 * Slice 4.1 adds the `zero` / `natural` / `negative` distinction. Each
 * subsequent Phase 3 slice extends the union:
 *   - 4.2 adds 'rational'
 *   - 4.3 adds 'irrational'
 *   - 4.4 adds 'complex'
 *
 * Slice 4.5 will revisit this module as the colour-polish slice and pick
 * up Gallery hooks; for now its only consumer is the renderer.
 */

import Decimal from 'break_eternity.js';
import type { Value } from '../../core/value';
import {
  ACCENT_BLUE,
  ACCENT_GREEN,
  ACCENT_PURPLE,
  GRAPHITE,
} from './colors';

export type Family =
  | 'zero'
  | 'natural'
  | 'negative'
  | 'rational'
  | 'irrational'
  | 'complex';

/**
 * Classifies a Value into a family. Sign-only branching lives on `real`;
 * other variants always derive their family from their `kind` (a `rational`
 * is `rational` even when its numerator is negative — the "negative
 * rational" experience is still meaningfully different from a negative
 * integer).
 */
export function family(v: Value): Family {
  switch (v.kind) {
    case 'real':
      if (v.n.eq(Decimal.dZero)) return 'zero';
      return v.n.lt(Decimal.dZero) ? 'negative' : 'natural';
    case 'rational':
      return 'rational';
    case 'irrational':
      return 'irrational';
    case 'complex':
      return 'complex';
  }
}

/**
 * Pencil colour for a family's numeral. Default is graphite. The accent
 * palette echoes `--accent-*` CSS variables in `app.css` (kept in sync via
 * the constants in `src/lib/colors.ts`).
 *
 * Irrationals stay graphite — DESIGN §17 doesn't reserve a colour for
 * them, and the radical sign in the symbol is itself the visual cue.
 */
export function familyColor(f: Family): number {
  switch (f) {
    case 'negative':
      return ACCENT_BLUE;
    case 'rational':
      return ACCENT_GREEN;
    case 'complex':
      return ACCENT_PURPLE;
    case 'irrational':
    case 'zero':
    case 'natural':
      return GRAPHITE;
  }
}

/** Convenience: family colour straight from a Value. */
export function valueColor(v: Value): number {
  return familyColor(family(v));
}
