/**
 * Cell geometry — canonical width/height constants per cell type.
 *
 * These numbers describe the physical footprint of each cell type in
 * canvas-space pixels. They're consumed by:
 *
 *   - `core/cell-types.ts` to lay out port offsets relative to the
 *     cell center (CELL_SHAPES);
 *   - the `src/lib/pixi/*-cell.ts` renderers that actually draw the
 *     cell at the matching width.
 *
 * Lived previously inside each pixi/*-cell.ts file. Lifted to `core/`
 * in Phase A.2 so `cell-types.ts` could move to `core/` without an
 * import cycle through the rendering layer. Each pixi/*-cell.ts file
 * now re-exports its constant from here so existing call sites keep
 * working.
 *
 * Units are canvas pixels at zoom 1. No Pixi or DOM dependency.
 */

export const SUCCESSOR_CELL_WIDTH = 156;
export const SUCCESSOR_CELL_HEIGHT = 88;

export const BINARY_CELL_WIDTH = 200;
export const BINARY_CELL_HEIGHT = 108;

export const UNARY_CELL_WIDTH = 168;
export const UNARY_CELL_HEIGHT = 88;

export const VARIADIC_ARROW_CELL_WIDTH = 220;
export const VARIADIC_ARROW_CELL_HEIGHT = 140;

export const WAREHOUSE_CELL_WIDTH = 200;
export const WAREHOUSE_CELL_HEIGHT = 124;

export const CULTIVATION_CELL_WIDTH = 168;
export const CULTIVATION_CELL_HEIGHT = 104;

export const FILTER_CELL_WIDTH = 168;
export const FILTER_CELL_HEIGHT = 132;
