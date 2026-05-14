/**
 * Pencil cursors for the page. The player is always holding a pencil; the
 * cursor is the tip of that pencil.
 *
 * Two states ship in Slice 1.5:
 *   - PENCIL_CURSOR_URL: idle pencil (default everywhere)
 *   - PENCIL_ACTIVE_CURSOR_URL: slightly darker / heavier pencil for "in use"
 *     during a drag, conveying weight / pressure
 *
 * The hot-spot is at the graphite tip (the writing point) — so the cursor
 * position is precisely where the pencil would lay its mark.
 *
 * We deliberately stylize the pencil rather than draw a literal hand. The
 * pencil is the iconic object of the mathematician's notebook; the game's
 * cursor *is* that pencil.
 */

const PENCIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g stroke-linecap="round" fill="none">
    <line x1="4" y1="4" x2="7" y2="7" stroke="#d97766" stroke-width="3.6"/>
    <line x1="7.5" y1="7.5" x2="9" y2="9" stroke="#9a9a9a" stroke-width="3.2"/>
    <line x1="9.5" y1="9.5" x2="20" y2="20" stroke="#d4a85a" stroke-width="3.6"/>
    <line x1="20.5" y1="20.5" x2="22.8" y2="22.8" stroke="#e8c986" stroke-width="3.0"/>
    <line x1="23" y1="23" x2="26" y2="26" stroke="#2c2c2c" stroke-width="2.4"/>
  </g>
</svg>`;

const PENCIL_ACTIVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g stroke-linecap="round" fill="none">
    <line x1="4" y1="4" x2="7" y2="7" stroke="#bd5042" stroke-width="3.8"/>
    <line x1="7.5" y1="7.5" x2="9" y2="9" stroke="#777777" stroke-width="3.4"/>
    <line x1="9.5" y1="9.5" x2="20" y2="20" stroke="#b08a35" stroke-width="3.8"/>
    <line x1="20.5" y1="20.5" x2="22.8" y2="22.8" stroke="#cca661" stroke-width="3.2"/>
    <line x1="23" y1="23" x2="26" y2="26" stroke="#0d0d0d" stroke-width="2.6"/>
  </g>
</svg>`;

function toCursorUrl(svg: string, hotspotX: number, hotspotY: number): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${hotspotX} ${hotspotY}, auto`;
}

export const PENCIL_CURSOR_URL = toCursorUrl(PENCIL_SVG, 26, 26);
export const PENCIL_ACTIVE_CURSOR_URL = toCursorUrl(PENCIL_ACTIVE_SVG, 26, 26);
