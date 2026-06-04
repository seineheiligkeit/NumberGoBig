import { Container, Graphics } from 'pixi.js';
import { pencilStroke } from './pencil';
import { GRAPHITE } from '../colors';

/**
 * Renders the squared-paper grid background — the foundational surface on which
 * the entire game is drawn. Faint pencil-blue lines on cream paper, mimicking
 * the 5mm-grid notebooks European mathematicians actually use.
 *
 * The grid is functional (snap target later) but visually quiet. A couple of
 * faint coffee rings and margin doodles (P4.4) give the page a lived-in feel —
 * positions are deterministic fractions of the page so they don't jump on
 * resize, and placed clear of the UI panels.
 */

const GRID_SIZE = 28; // pixels per grid cell
const GRID_COLOR = 0xc8d4e0; // pale pencil-blue
const GRID_ALPHA = 0.45;
const GRID_LINE_WIDTH = 0.6;
const COFFEE = 0xb79a78; // faint brown coffee-ring

export function drawPaper(width: number, height: number): Container {
  const container = new Container();
  const grid = new Graphics();

  // Vertical lines
  for (let x = 0; x <= width; x += GRID_SIZE) {
    grid.moveTo(x, 0);
    grid.lineTo(x, height);
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += GRID_SIZE) {
    grid.moveTo(0, y);
    grid.lineTo(width, y);
  }

  grid.stroke({
    color: GRID_COLOR,
    width: GRID_LINE_WIDTH,
    alpha: GRID_ALPHA,
  });
  container.addChild(grid);

  // Lived-in notebook character (decorative, behind the factory).
  container.addChild(notebookMarks(width, height));
  return container;
}

/** Faint coffee rings + a few margin doodles — placed clear of the UI panels
 *  (top-left shelf, top-right monitor, bottom-left marginalia, bottom hint). */
function notebookMarks(width: number, height: number): Graphics {
  const g = new Graphics();

  // Coffee ring (and its lighter inner echo) in the clear right-of-workspace,
  // above the river. A faint fill plus the darker rim, like a dried stain.
  const cx = width * 0.8;
  const cy = height * 0.34;
  g.circle(cx, cy, 38).fill({ color: COFFEE, alpha: 0.05 });
  g.circle(cx, cy, 38).stroke({ color: COFFEE, width: 3.5, alpha: 0.2 });
  g.circle(cx + 22, cy + 14, 22).stroke({ color: COFFEE, width: 2, alpha: 0.14 });

  // A tiny pencil asterisk doodle, upper-mid where the page is usually clear.
  const dx = width * 0.42;
  const dy = height * 0.13;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    pencilStroke(
      g,
      [
        { x: dx - Math.cos(a) * 8, y: dy - Math.sin(a) * 8 },
        { x: dx + Math.cos(a) * 8, y: dy + Math.sin(a) * 8 },
      ],
      { color: GRAPHITE, width: 1.1, alpha: 0.22 },
    );
  }
  return g;
}
