/**
 * Level badge — small Roman-numeral indicator placed at the top-right of
 * any leveled primitive (cells, pipes). Shows nothing for level 1
 * (the default), II–V otherwise.
 *
 * Stored on the host container as `__levelBadge` so callers can update
 * it without re-walking children. The badge text style is the shared
 * pencil family for consistency with the rest of the page.
 *
 * Slice 6.16 added `cellLevelBadgeOffset(type)`. The default position
 * (76, −40) was tuned for binary cells (200×108) and was cramped on
 * successor (156×88, badge ended up 2 px from the right edge). Each
 * cell type now has an offset that lands the badge ~24 px from the
 * right edge and ~14 px below the top edge, regardless of cell size.
 */

import { Container, Text } from 'pixi.js';
import { pencilText, pencilTextStyle } from './typography';
import type { CellType } from '../cell-types';

const ROMAN: readonly string[] = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];

interface BadgeHost {
  __levelBadge?: Text;
}

/**
 * Returns the level-badge offset for a given cell type. Anchored at the
 * badge's top-right corner (via `anchor.set(1, 0)` in `applyLevelBadge`),
 * so positive `x` values move the badge LEFT from the cell's right edge.
 *
 * Aim: ~24 px from the cell's right edge, ~14 px below the top edge,
 * which lands inside the frame for every cell shape we ship today.
 */
export function cellLevelBadgeOffset(type: CellType): { x: number; y: number } {
  switch (type) {
    case 'successor':
      // 156 × 88 — halfW 78, halfH 44.
      return { x: 78 - 24, y: -44 + 14 };
    case 'addition':
    case 'subtraction':
    case 'multiplication':
    case 'division':
    case 'exponentiation':
    case 'tetration':
    case 'pentation':
      // Binary cells: 200 × 108 — halfW 100, halfH 54.
      return { x: 100 - 24, y: -54 + 14 };
    case 'variadic-arrow':
      // 220 × 140 — halfW 110, halfH 70.
      return { x: 110 - 24, y: -70 + 14 };
    case 'decrement':
    case 'factor':
    case 'square-root':
    case 'negation':
    case 'inversion':
      // Unary cells: 168 × 88 — halfW 84, halfH 44.
      return { x: 84 - 24, y: -44 + 14 };
    case 'warehouse':
    case 'warehouse-rule':
      // 200 × 124 — halfW 100, halfH 62.
      return { x: 100 - 24, y: -62 + 14 };
    case 'filter':
      // 168 × 132 — halfW 84, halfH 66.
      return { x: 84 - 24, y: -66 + 14 };
    case 'cultivation-arithmetic':
    case 'cultivation-geometric':
    case 'cultivation-fibonacci':
    case 'cultivation-harmonic':
    case 'cultivation-polynomial':
    case 'cultivation-factorial':
      // 168 × 104 — halfW 84, halfH 52.
      return { x: 84 - 24, y: -52 + 14 };
    case 'cleanup-bot':
    case 'factor-bot':
    case 'decrement-bot':
    case 'inversion-bot':
      // Bot family: 56 × 56 — too small for a Roman-numeral badge to
      // read cleanly, and bots aren't leveled in v1 anyway. Default
      // offset is a safe placeholder if a future tier introduces them.
      return { x: 28 - 8, y: -28 + 8 };
  }
}

/**
 * Installs or updates the level badge on a container. Positioned at a
 * fixed offset relative to the cell's local origin — `(offsetX, offsetY)`
 * defaults to a reasonable top-right placement for medium-sized cells.
 * Pass explicit offsets for cells where the default looks off, OR use
 * `cellLevelBadgeOffset(type)` to get the canonical per-type offset.
 */
export function applyLevelBadge(
  container: Container,
  level: number,
  offsetX: number = 76,
  offsetY: number = -40,
): void {
  const host = container as Container & BadgeHost;
  const text = level >= 2 && level <= 5 ? ROMAN[level] : '';

  if (!host.__levelBadge) {
    if (!text) return;
    // Slice 6.18: `pencilText` bakes in the higher Text resolution so
    // the Roman numeral stays crisp at the camera's max 4× zoom.
    const badge = pencilText(text, pencilTextStyle({ fontSize: 14 }));
    badge.anchor.set(1, 0);
    badge.x = offsetX;
    badge.y = offsetY;
    badge.alpha = 0.75;
    host.addChild(badge);
    host.__levelBadge = badge;
    return;
  }

  host.__levelBadge.text = text;
  host.__levelBadge.alpha = text ? 0.75 : 0;
}
