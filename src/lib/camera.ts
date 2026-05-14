import type { Application, Container } from 'pixi.js';

/**
 * Camera — pan and zoom for the canvas layer.
 *
 * The canvas is conceptually infinite; the camera is the player's viewport
 * onto it. The river and UI overlays stay screen-fixed (they live on
 * `app.stage` directly, not the canvas layer). Pencil strokes and cell
 * placements live on `canvasLayer`, which we translate and scale here.
 *
 * Inputs (chosen to avoid conflicts with left-mouse drag-and-place):
 *   - Middle-mouse drag → pan
 *   - Right-mouse drag → pan (with contextmenu suppressed)
 *   - Mousewheel → zoom to cursor (clamped to [0.25, 4])
 *
 * Hit-tests in the interaction layer must convert screen coordinates to
 * canvas coordinates with `screenToCanvas()` before they query world.ts,
 * since the world stores cells in canvas-local space.
 */

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.1;

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

const state: CameraState = { x: 0, y: 0, scale: 1 };
let _canvasLayer: Container | null = null;

const _changeListeners: (() => void)[] = [];

function applyTransform(): void {
  if (!_canvasLayer) return;
  _canvasLayer.x = state.x;
  _canvasLayer.y = state.y;
  _canvasLayer.scale.set(state.scale);
  for (const cb of _changeListeners) cb();
}

/** Fires after any pan or zoom. Returns an unsubscribe function. */
export function onCameraChange(cb: () => void): () => void {
  _changeListeners.push(cb);
  return () => {
    const idx = _changeListeners.indexOf(cb);
    if (idx >= 0) _changeListeners.splice(idx, 1);
  };
}

export function screenToCanvas(x: number, y: number): { x: number; y: number } {
  return { x: (x - state.x) / state.scale, y: (y - state.y) / state.scale };
}

export function snapshotCamera(): CameraState {
  return { ...state };
}

export function restoreCamera(s: Partial<CameraState>): void {
  if (typeof s.x === 'number') state.x = s.x;
  if (typeof s.y === 'number') state.y = s.y;
  if (typeof s.scale === 'number') state.scale = clamp(s.scale, MIN_SCALE, MAX_SCALE);
  applyTransform();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Zooms by `factor` keeping `(screenX, screenY)` invariant. */
function zoomAt(screenX: number, screenY: number, factor: number): void {
  const nextScale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);
  if (nextScale === state.scale) return;

  const canvasX = (screenX - state.x) / state.scale;
  const canvasY = (screenY - state.y) / state.scale;
  state.scale = nextScale;
  state.x = screenX - canvasX * state.scale;
  state.y = screenY - canvasY * state.scale;
  applyTransform();
}

export function setupCamera(app: Application, canvasLayer: Container): void {
  _canvasLayer = canvasLayer;

  const rectOf = (): DOMRect => app.canvas.getBoundingClientRect();

  // ---- Pan: middle-mouse drag, or right-mouse drag --------------------
  let panning = false;
  let lastX = 0;
  let lastY = 0;

  const insideCanvas = (e: PointerEvent): boolean => {
    const r = rectOf();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 1 && e.button !== 2) return;
    if (!insideCanvas(e)) return;

    panning = true;
    lastX = e.clientX;
    lastY = e.clientY;
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!panning) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    state.x += dx;
    state.y += dy;
    applyTransform();
  };

  const onPointerUp = (): void => {
    panning = false;
  };

  // Suppress browser context menu on right-click inside the canvas so
  // right-mouse-drag pan doesn't pop a menu on release.
  const onContextMenu = (e: MouseEvent): void => {
    const r = rectOf();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      e.preventDefault();
    }
  };

  // ---- Zoom via wheel ----------------------------------------------------
  const onWheel = (e: WheelEvent): void => {
    const r = rectOf();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
  };

  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('contextmenu', onContextMenu);
  app.canvas.addEventListener('wheel', onWheel, { passive: false });

  applyTransform();
}
