import { Container, Graphics } from 'pixi.js';

/**
 * Renders the squared-paper grid background — the foundational surface on which
 * the entire game is drawn. Faint pencil-blue lines on cream paper, mimicking
 * the 5mm-grid notebooks European mathematicians actually use.
 *
 * The grid is functional (snap target later) but visually quiet.
 */

const GRID_SIZE = 28; // pixels per grid cell
const GRID_COLOR = 0xc8d4e0; // pale pencil-blue
const GRID_ALPHA = 0.45;
const GRID_LINE_WIDTH = 0.6;

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
  return container;
}
