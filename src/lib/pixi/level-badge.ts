/**
 * Level badge — small Roman-numeral indicator placed at the top-right of
 * any leveled primitive (cells, pipes). Shows nothing for level 1
 * (the default), II–V otherwise.
 *
 * Stored on the host container as `__levelBadge` so callers can update
 * it without re-walking children. The badge text style is the shared
 * pencil family for consistency with the rest of the page.
 */

import { Container, Text } from 'pixi.js';
import { pencilTextStyle } from './typography';

const ROMAN: readonly string[] = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];

interface BadgeHost {
  __levelBadge?: Text;
}

/**
 * Installs or updates the level badge on a container. Positioned at a
 * fixed offset relative to the cell's local origin — `(offsetX, offsetY)`
 * defaults to a reasonable top-right placement for medium-sized cells.
 * Pass explicit offsets for cells where the default looks off (e.g.
 * smaller unary cells).
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
    const badge = new Text({
      text,
      style: pencilTextStyle({ fontSize: 14 }),
    });
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
