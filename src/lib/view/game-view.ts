/**
 * GameView — the thin Pixi view over the headless engine (core/engine.ts).
 *
 * The engine is the simulation; this draws it and routes input back into it.
 * No game logic lives here — only rendering and interaction. Each frame it
 * ticks the engine and syncs visuals to the new `World` state.
 *
 * Time-as-Labor view slice A (TIME_AS_LABOR_PLAN.md):
 *   - place cells (Successor / Addition / Multiplication / Exponentiation …)
 *     that SKETCH IN over their build time, then come alive;
 *   - Successors tap the river and pencil out `1`s into a positioned pool;
 *   - drag loose blocks onto operand ports to feed operators, or onto the
 *     fuel socket of a working cell to burn them for speed;
 *   - operations pencil in their result over time, with a progress meter;
 *   - live Total Score.
 *
 * Pipes + transport-distance + the river-manual-pickup are the next view
 * slice; here, feeding is by hand so the core loop is provable end-to-end.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { drawPaper } from '../pixi/paper';
import { setupRiver } from '../pixi/river';
import { setupCamera, screenToCanvas, restoreCamera } from '../camera';
import { pencilStrokeDouble, pencilWaypoints, strokeWaypoints } from '../pixi/pencil';
import { drawValueLabel } from '../pixi/value-label';
import { GRAPHITE, PENCIL_FONT_FAMILY } from '../pixi/typography';
import { JAM_TINT } from '../colors';
import { valueMagnitude, valueOf, type Value } from '../../../core/value';
import { pencilStroke } from '../pixi/pencil';
import {
  createWorld,
  placeCell,
  placePipe,
  removeCell,
  removePipe,
  tick,
  totalScore,
  takeLooseById,
  moveLoose,
  moveCell,
  addLoose,
  feedOperand,
  injectFuel,
  operandArity,
  buildFraction,
  opFraction,
  cellBoost,
  ACCELERATOR_RADIUS,
  type World,
  type SimCell,
  type SimPipe,
  type CellKind,
} from '../../../core/engine';
import { createJuice, setJuice } from './physics';
import { scoreStore, toolStore, frontierStore, statsStore, speedStore, type Tool } from './stores';

// --- View constants --------------------------------------------------------

const CELL_W = 100;
const CELL_H = 76;
const PORT_R = 13; // operand / fuel port hit-radius
const BLOCK_R = 26; // loose-block half-size

// View-side playback speed lives in `speedStore` (the dev speed control), in
// engine ticks per real second. The model treats 1 tick = 1 second.

const GLYPH: Record<CellKind, string> = {
  successor: '{ }',
  addition: '+',
  multiplication: '×',
  exponentiation: '^',
  tetration: '↑↑',
  pentation: '↑↑↑',
  mill: 'M',
  accelerator: '»',
};

// --- Per-entity visual caches ----------------------------------------------

interface CellVisual {
  root: Container; // interactive (hit-fill + pointerdown); never transformed
  body: Container; // visual children; punched/scaled by the juice layer
  outline: Graphics; // drawn once; alpha ramps with build progress
  glyph: Text;
  meter: Graphics; // progress bar, redrawn each frame (no jitter → no shimmer)
  ports: Graphics; // operand + fuel port markers, drawn once on build
  ghost: Container | null; // output-in-progress numeral
  ghostKey: string; // identity of the value currently ghosted
  ghostMask: Graphics | null; // left-to-right reveal mask (child of ghost)
  ghostBounds: { x: number; y: number; w: number; h: number } | null; // ghost-local
  builtFlourished: boolean;
  halo: Graphics | null; // accelerator coverage radius
  info: Text | null; // accelerator boost readout
  clog: Graphics | null; // output back-pressure mark (lazy)
  idleHint: Graphics; // drop-zone hints on empty operand ports when idle
  prevBurn: number; // last frame's recentBurn — for whoosh rising-edge detection
  outlinePath: Pt[]; // stable wobble path for the outline (revealed as it builds)
  outlineCum: number[]; // cumulative arc length of outlinePath
}

interface BlockVisual {
  root: Container; // interactive (drag); never transformed
  body: Container; // visual; punched/scaled by the juice layer
}

interface PipeVisual {
  root: Container;
  line: Graphics; // redrawn when an endpoint cell moves
  flight: Container | null; // the block sliding along the pipe
  flightKey: string;
  endKey: string; // last endpoint positions, to detect a move
  path: Pt[]; // cached bezier samples (the curve the block rides)
  cum: number[]; // cumulative arc length per sample
  clog: Graphics | null; // back-pressure mark at the dest end (lazy)
}

export interface GameViewHandle {
  destroy(): void;
}

/** World-space position of a pipe endpoint (source output / dest operand|fuel). */
function endpointPos(cell: SimCell, port: number, fuel: boolean): { x: number; y: number } {
  const L = portLayout(cell.kind);
  if (fuel) return { x: cell.x + L.fuel.x, y: cell.y + L.fuel.y };
  if (port < 0) return { x: cell.x + L.output.x, y: cell.y + L.output.y };
  const op = L.operands[port] ?? L.output;
  return { x: cell.x + op.x, y: cell.y + op.y };
}

/** Local-space operand/fuel/output port positions for a cell kind. */
function portLayout(kind: CellKind): {
  operands: { x: number; y: number }[];
  fuel: { x: number; y: number };
  output: { x: number; y: number };
} {
  const arity = operandArity(kind);
  const operands: { x: number; y: number }[] = [];
  if (arity === 1) operands.push({ x: -CELL_W / 2, y: 0 });
  else if (arity >= 2) {
    operands.push({ x: -CELL_W / 2, y: -18 });
    operands.push({ x: -CELL_W / 2, y: 18 });
  }
  return {
    operands,
    fuel: { x: 0, y: CELL_H / 2 },
    output: { x: CELL_W / 2, y: 0 },
  };
}

// --- Pipe geometry (port-aware bezier) -------------------------------------

interface Pt {
  x: number;
  y: number;
}

/** Outward axis a pipe leaves/enters a port along — so the curve exits the
 *  source's output nub rightward, and arrives along the dest port's own axis
 *  (operands on the left, the fuel socket from below). */
function portDir(port: number, fuel: boolean): Pt {
  if (fuel) return { x: 0, y: 1 }; // fuel socket sits at the bottom
  if (port < 0) return { x: 1, y: 0 }; // output nub on the right
  return { x: -1, y: 0 }; // operand ports on the left
}

/** Sample a cubic bezier whose tangents leave `a`/`b` along `da`/`db`. Control
 *  distance is clamped to [24, len/2] so short hops don't loop. */
function cubicSamples(a: Pt, da: Pt, b: Pt, db: Pt, n = 28): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const d = Math.max(24, Math.min(len / 2, len * 0.42));
  const c1 = { x: a.x + da.x * d, y: a.y + da.y * d };
  const c2 = { x: b.x + db.x * d, y: b.y + db.y * d };
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const w0 = mt * mt * mt;
    const w1 = 3 * mt * mt * t;
    const w2 = 3 * mt * t * t;
    const w3 = t * t * t;
    pts.push({
      x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
      y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
    });
  }
  return pts;
}

/** Cumulative arc length at each sampled point (for even, magnitude-honest
 *  travel along the curve rather than along the chord). */
function cumLengths(pts: Pt[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return cum;
}

/** Position at fraction `f` of total arc length along a sampled polyline. */
function pointAt(pts: Pt[], cum: number[], f: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  const total = cum[cum.length - 1] || 1;
  const target = Math.max(0, Math.min(1, f)) * total;
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] >= target) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (target - cum[i - 1]) / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      };
    }
  }
  return pts[pts.length - 1];
}

/** The prefix of a polyline up to fraction `f` of its total arc length, with a
 *  final interpolated point — for revealing a stroke as it's drawn. */
function subPath(pts: Pt[], cum: number[], f: number): Pt[] {
  if (pts.length === 0) return [];
  const total = cum[cum.length - 1] || 1;
  const target = Math.max(0, Math.min(1, f)) * total;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] <= target) {
      out.push(pts[i]);
    } else {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (target - cum[i - 1]) / seg;
      out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t });
      break;
    }
  }
  return out;
}

/** Lay faint graphite dots along a polyline at a fixed arc-length step — the
 *  dashed "ink-flow" look for fuel lines. */
function dottedAlong(g: Graphics, pts: Pt[], cum: number[], step: number, r: number, alpha: number): void {
  const total = cum[cum.length - 1] || 1;
  for (let s = 0; s <= total; s += step) {
    const p = pointAt(pts, cum, s / total);
    g.circle(p.x, p.y, r).fill({ color: GRAPHITE, alpha });
  }
}

/** Shortest distance from a point to a sampled polyline (curve hit-test). */
function distToPolyline(pts: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

export async function setupGameView(host: HTMLElement): Promise<GameViewHandle> {
  const app = new Application();
  await app.init({
    background: 0xfbf7ee,
    resizeTo: host,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  host.appendChild(app.canvas);

  // Layers: paper (fixed) → canvas (pan/zoom) → river (fixed ambiance).
  let paper = drawPaper(app.screen.width, app.screen.height);
  app.stage.addChild(paper);

  const canvasLayer = new Container();
  canvasLayer.sortableChildren = true; // cells z=1, blocks z=5, dragged z=100
  app.stage.addChild(canvasLayer);

  const river = setupRiver(app);
  app.stage.addChild(river);

  setupCamera(app, canvasLayer);
  // Start with the canvas origin mid-screen, a touch above the river — a
  // modest workspace, so the first cells you place land in clear view.
  restoreCamera({ x: app.screen.width / 2, y: app.screen.height * 0.42, scale: 1 });

  // The model.
  const world: World = createWorld();

  // Visual caches keyed by engine id.
  const cellVisuals = new Map<number, CellVisual>();
  const blockVisuals = new Map<number, BlockVisual>();
  const pipeVisuals = new Map<number, PipeVisual>();

  // Pipe layer sits under cells/blocks so lines read as the substrate.
  const pipeLayer = new Container();
  pipeLayer.zIndex = 0;
  canvasLayer.addChild(pipeLayer);

  // FX layer (dust/shavings) sits above everything, in world space so particles
  // pan/zoom with the canvas. The juice layer is visual-only — see physics.ts.
  const fxLayer = new Container();
  fxLayer.zIndex = 200;
  fxLayer.eventMode = 'none'; // purely decorative (dust + clog) — never hit-tested
  canvasLayer.addChild(fxLayer);
  const juice = createJuice(fxLayer);
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setJuice(0);

  // Drag state for a loose block being moved.
  let drag: { id: number; root: Container } | null = null;
  // Drag state for a cell being repositioned (grab offset keeps it under cursor).
  let cellDrag: { id: number; dx: number; dy: number } | null = null;

  // --- Interaction ---------------------------------------------------------

  app.stage.eventMode = 'static';
  app.stage.hitArea = { contains: () => true } as unknown as Container['hitArea'];

  function canvasPoint(globalX: number, globalY: number): { x: number; y: number } {
    return screenToCanvas(globalX, globalY);
  }

  // Track Shift via the keyboard (more robust than Pixi's event modifier) —
  // shift-click deletes cells/pipes.
  let shiftHeld = false;
  const onKey = (e: KeyboardEvent): void => {
    shiftHeld = e.shiftKey;
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  // The active tool (cell to place, or the pipe tool), mirrored from the store.
  let tool: Tool | null = null;

  // Pipe placement: first click picks a source output, second a dest port.
  let pipeSource: number | null = null;
  let lastPointer = { x: 0, y: 0 };
  const pipeGhost = new Graphics();
  pipeGhost.zIndex = 50;
  canvasLayer.addChild(pipeGhost);

  // Subscribe AFTER the pipe state above exists — Svelte fires the subscriber
  // synchronously on subscribe, and it touches pipeSource / drawPipeGhost.
  const unsubTool = toolStore.subscribe((t) => {
    tool = t;
    if (t !== 'pipe') pipeSource = null; // leaving pipe mode cancels a pending source
    drawPipeGhost();
  });

  app.stage.on('pointerdown', (e) => {
    if (drag) return; // a block grab handles its own pointerdown
    const p = canvasPoint(e.global.x, e.global.y);

    // Shift-click a pipe to delete it (reroute = delete + re-draw). Cells handle
    // their own shift-click delete (they sit on top and stop propagation).
    if (shiftHeld) {
      const pid = findPipeAt(p.x, p.y);
      if (pid !== null) {
        juice.eraser(p.x, p.y, 18, 12); // erase where the pipe was clicked (it's thin)
        removePipe(world, pid);
      }
      return;
    }

    if (tool === 'pipe') {
      handlePipeClick(p.x, p.y);
      return;
    }
    if (tool) {
      placeCell(world, tool, p.x, p.y);
      toolStore.set(null);
    }
  });

  function handlePipeClick(x: number, y: number): void {
    if (pipeSource === null) {
      const src = outputPortAt(x, y);
      if (src !== null) {
        pipeSource = src;
        drawPipeGhost();
      }
      return;
    }
    const dest = portAt(x, y);
    if (dest && dest.cellId !== pipeSource) {
      placePipe(world, pipeSource, 0, dest.cellId, dest.port, { fuel: dest.fuel });
    }
    // Either committed or clicked empty space → end the gesture, stay in tool.
    pipeSource = null;
    drawPipeGhost();
  }

  /** Ghost line from the chosen source to the cursor while wiring a pipe. */
  function drawPipeGhost(): void {
    pipeGhost.clear();
    if (tool !== 'pipe' || pipeSource === null) return;
    const src = world.cells.get(pipeSource);
    if (!src) return;
    const a = endpointPos(src, -1, false);
    const b = lastPointer;
    // Curve out of the source nub and arrive smoothly at the cursor (we don't
    // yet know the dest port, so aim back along the chord).
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const L = Math.hypot(dx, dy) || 1;
    const pts = cubicSamples(a, portDir(-1, false), b, { x: dx / L, y: dy / L });
    pipeGhost.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) pipeGhost.lineTo(pts[i].x, pts[i].y);
    pipeGhost.stroke({ color: GRAPHITE, width: 1.5, alpha: 0.4 });
  }

  app.stage.on('pointermove', (e) => {
    const p = canvasPoint(e.global.x, e.global.y);
    lastPointer = p;
    if (drag) {
      drag.root.position.set(p.x, p.y);
    } else if (cellDrag) {
      moveCell(world, cellDrag.id, p.x - cellDrag.dx, p.y - cellDrag.dy);
    } else if (tool === 'pipe' && pipeSource !== null) {
      drawPipeGhost();
    }
  });

  app.stage.on('pointerup', (e) => endDrag(e.global.x, e.global.y));
  app.stage.on('pointerupoutside', (e) => endDrag(e.global.x, e.global.y));

  function endDrag(globalX: number, globalY: number): void {
    cellDrag = null;
    if (!drag) return;
    const id = drag.id;
    const p = canvasPoint(globalX, globalY);
    const target = portAt(p.x, p.y);
    drag = null;

    if (target) {
      const block = takeLooseById(world, id);
      if (block) {
        if (target.fuel) {
          // The whoosh fires off the burn rising-edge in updateCellVisual (so
          // hand-drop and pipe-fed fuel feel identical, and a fuel block bounced
          // off an idle cell doesn't falsely ignite).
          injectFuel(world, target.cellId, block.value);
        } else if (!feedOperand(world, target.cellId, target.port, block.value)) {
          // Port was occupied / cell busy — drop it back where it landed.
          // (takeLooseById already removed it; re-add at the drop point.)
          moveLooseBack(block.value, p.x, p.y);
        }
      }
    } else {
      moveLoose(world, id, p.x, p.y);
    }
  }

  function moveLooseBack(value: Value, x: number, y: number): void {
    // Re-materialise a block the engine handed us but we couldn't place
    // (e.g. the target port was occupied) at the drop point.
    addLoose(world, value, x, y);
  }

  /** Find an operand/fuel port near a canvas point (for drop resolution). */
  function portAt(x: number, y: number): { cellId: number; port: number; fuel: boolean } | null {
    for (const cell of world.cells.values()) {
      if (!cell.built) continue;
      // An accelerator's whole body is a fuel intake (drop a block — even a big
      // one as a power cell — anywhere on it).
      if (cell.kind === 'accelerator') {
        if (Math.abs(x - cell.x) <= CELL_W / 2 + 6 && Math.abs(y - cell.y) <= CELL_H / 2 + 6) {
          return { cellId: cell.id, port: -1, fuel: true };
        }
        continue;
      }
      const L = portLayout(cell.kind);
      for (let i = 0; i < L.operands.length; i++) {
        const px = cell.x + L.operands[i].x;
        const py = cell.y + L.operands[i].y;
        if (Math.hypot(x - px, y - py) <= PORT_R + 6) return { cellId: cell.id, port: i, fuel: false };
      }
      const fx = cell.x + L.fuel.x;
      const fy = cell.y + L.fuel.y;
      if (Math.hypot(x - fx, y - fy) <= PORT_R + 6) return { cellId: cell.id, port: -1, fuel: true };
    }
    return null;
  }

  /** Find a pipe whose curve is near a canvas point (for shift-click delete).
   *  Prefer the cached samples; fall back to recomputing for a fresh pipe. */
  function findPipeAt(x: number, y: number, tol = 9): number | null {
    for (const pipe of world.pipes.values()) {
      const vis = pipeVisuals.get(pipe.id);
      let pts = vis?.path;
      if (!pts || pts.length < 2) {
        const src = world.cells.get(pipe.fromCell);
        const dst = world.cells.get(pipe.toCell);
        if (!src || !dst) continue;
        const a = endpointPos(src, -1, false);
        const b = endpointPos(dst, pipe.toPort, pipe.fuel);
        pts = cubicSamples(a, portDir(-1, false), b, portDir(pipe.toPort, pipe.fuel));
      }
      if (distToPolyline(pts, x, y) <= tol) return pipe.id;
    }
    return null;
  }

  /** Find a built cell whose output nub is near a canvas point (pipe source). */
  function outputPortAt(x: number, y: number): number | null {
    for (const cell of world.cells.values()) {
      if (!cell.built) continue;
      const o = endpointPos(cell, -1, false);
      if (Math.hypot(x - o.x, y - o.y) <= PORT_R + 6) return cell.id;
    }
    return null;
  }

  // --- Render sync ---------------------------------------------------------

  function syncCells(): void {
    // Add visuals for new cells.
    for (const cell of world.cells.values()) {
      if (!cellVisuals.has(cell.id)) cellVisuals.set(cell.id, makeCellVisual(cell));
    }
    // Remove visuals for gone cells.
    for (const [id, vis] of cellVisuals) {
      if (!world.cells.has(id)) {
        vis.clog?.destroy(); // lives in fxLayer, not a child of root
        vis.root.destroy({ children: true });
        cellVisuals.delete(id);
      }
    }
    // Update each.
    for (const cell of world.cells.values()) {
      const vis = cellVisuals.get(cell.id)!;
      vis.root.position.set(cell.x, cell.y);
      updateCellVisual(cell, vis);
    }
  }

  function syncBlocks(): void {
    for (const b of world.pool) {
      if (!blockVisuals.has(b.id)) {
        const vis = makeBlockVisual(b.id, b.value);
        blockVisuals.set(b.id, vis);
        vis.root.position.set(b.x, b.y);
        juice.punch(vis.body); // a block just written/spilled into existence — pop it
      }
      const vis = blockVisuals.get(b.id)!;
      // Don't fight the drag: the dragged block follows the cursor.
      if (!drag || drag.id !== b.id) vis.root.position.set(b.x, b.y);
    }
    for (const [id, vis] of blockVisuals) {
      if (!world.pool.find((b) => b.id === id)) {
        vis.root.destroy({ children: true });
        blockVisuals.delete(id);
      }
    }
  }

  function syncPipes(): void {
    for (const pipe of world.pipes.values()) {
      if (!pipeVisuals.has(pipe.id)) pipeVisuals.set(pipe.id, makePipeVisual(pipe));
      updatePipeVisual(pipe, pipeVisuals.get(pipe.id)!);
    }
    for (const [id, vis] of pipeVisuals) {
      if (!world.pipes.has(id)) {
        vis.clog?.destroy(); // lives in fxLayer, not a child of root
        vis.root.destroy({ children: true });
        pipeVisuals.delete(id);
      }
    }
  }

  function endpointsKey(a: { x: number; y: number }, b: { x: number; y: number }): string {
    return `${a.x.toFixed(0)},${a.y.toFixed(0)}|${b.x.toFixed(0)},${b.y.toFixed(0)}`;
  }

  function drawPipeLine(vis: PipeVisual, pipe: SimPipe, a: Pt, b: Pt): void {
    vis.line.clear();
    // Port-aware curve: leaves the source output rightward, arrives along the
    // dest port's own axis. Cached so the in-flight block rides it by arc length.
    const pts = cubicSamples(a, portDir(-1, false), b, portDir(pipe.toPort, pipe.fuel));
    const cum = cumLengths(pts);
    vis.path = pts;
    vis.cum = cum;
    // Redrawn when an endpoint moves (re-wobbles during a drag; stable at rest).
    if (pipe.fuel) {
      // Fuel lines read as a faint dashed channel (distinct from solid operand
      // lines, lighter weight — "thin supply line").
      dottedAlong(vis.line, pts, cum, 8, 1.1, 0.45);
    } else {
      pencilStroke(vis.line, pts, { color: GRAPHITE, width: 1.6, alpha: 0.55 });
    }
    vis.line.circle(a.x, a.y, 3).fill({ color: GRAPHITE, alpha: 0.6 });
    vis.line.circle(b.x, b.y, 4).stroke({ color: GRAPHITE, width: 1.2, alpha: 0.6 });
    vis.endKey = endpointsKey(a, b);
  }

  function makePipeVisual(pipe: SimPipe): PipeVisual {
    const root = new Container();
    const line = new Graphics();
    const vis: PipeVisual = { root, line, flight: null, flightKey: '', endKey: '', path: [], cum: [0], clog: null };
    root.addChild(line);
    pipeLayer.addChild(root);
    const src = world.cells.get(pipe.fromCell);
    const dst = world.cells.get(pipe.toCell);
    if (src && dst) drawPipeLine(vis, pipe, endpointPos(src, -1, false), endpointPos(dst, pipe.toPort, pipe.fuel));
    return vis;
  }

  function updatePipeVisual(pipe: SimPipe, vis: PipeVisual): void {
    const src = world.cells.get(pipe.fromCell);
    const dst = world.cells.get(pipe.toCell);
    if (!src || !dst) return;
    const ea = endpointPos(src, -1, false);
    const eb = endpointPos(dst, pipe.toPort, pipe.fuel);
    // Re-project the line if either endpoint cell moved (cell dragging).
    if (endpointsKey(ea, eb) !== vis.endKey) drawPipeLine(vis, pipe, ea, eb);
    // Back-pressure: mark the dest end when deliveries can't stage.
    if (pipe.stalled) {
      if (!vis.clog) {
        vis.clog = new Graphics();
        fxLayer.addChild(vis.clog); // top layer so the cue is never covered
      }
      drawClogMark(vis.clog, eb.x, eb.y);
    } else if (vis.clog) {
      vis.clog.clear();
    }
    if (!pipe.inFlight) {
      if (vis.flight) {
        vis.flight.destroy({ children: true });
        vis.flight = null;
        vis.flightKey = '';
      }
      return;
    }
    // The block slides along the pipe curve as transit progresses.
    const f = Math.min(1, pipe.inFlight.progress.div(pipe.inFlight.work).toNumber());
    const v = pipe.inFlight.value;
    const key = `${v.kind}:${valueMagnitude(v).toString()}`;
    if (vis.flightKey !== key) {
      if (vis.flight) vis.flight.destroy({ children: true });
      vis.flight = drawValueLabel(v.kind === 'real' ? v : { kind: 'real', n: valueMagnitude(v) }, {
        baseFontSize: 18,
        color: GRAPHITE,
      });
      vis.root.addChild(vis.flight);
      vis.flightKey = key;
    }
    if (vis.flight) {
      const p = pointAt(vis.path, vis.cum, f);
      vis.flight.position.set(p.x, p.y);
    }
  }

  function makeCellVisual(cell: SimCell): CellVisual {
    const root = new Container();
    root.position.set(cell.x, cell.y);
    root.zIndex = 1;
    root.eventMode = 'static';
    root.cursor = 'move';
    // Grab the cell body (when no tool is active) to reposition it; connected
    // pipes follow. Ports/blocks sit on top and stop propagation, so this only
    // fires on the bare body.
    root.on('pointerdown', (e) => {
      if (tool || drag) return; // placement/pipe mode, or a block grab, wins
      e.stopPropagation();
      const id = cell.id;
      const c = world.cells.get(id);
      if (!c) return;
      // Shift-click deletes the cell (held blocks return to the pool). The
      // rethinking/rebalancing verb — connected pipes go too. An eraser scrub
      // sells the removal.
      if (shiftHeld) {
        juice.eraser(c.x, c.y, CELL_W / 2, CELL_H / 2);
        removeCell(world, id);
        return;
      }
      const p = canvasPoint(e.global.x, e.global.y);
      cellDrag = { id, dx: p.x - c.x, dy: p.y - c.y };
    });

    const ports = new Graphics();
    const outline = new Graphics();
    // Precompute one stable wobble path for the outline rectangle so the build
    // sketch-in reveals the SAME line (no per-frame shimmer). Snaps to the
    // filled, rounded outline on completion.
    const hw = CELL_W / 2;
    const hh = CELL_H / 2;
    const outlinePath = pencilWaypoints([
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
      { x: -hw, y: -hh },
    ]);
    const outlineCum = cumLengths(outlinePath);
    // An invisible body fill so the cell stays grab/delete-able regardless of the
    // (progressive, fill-on-snap) outline — hit testing uses fill geometry, not
    // alpha, so this is clickable while staying invisible during the sketch-in.
    const hit = new Graphics();
    hit.rect(-hw, -hh, CELL_W, CELL_H).fill({ color: 0xffffff, alpha: 0.01 });
    hit.eventMode = 'static';

    const glyph = new Text({
      text: GLYPH[cell.kind],
      style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 30, fill: GRAPHITE },
    });
    glyph.anchor.set(0.5);

    const meter = new Graphics();
    const idleHint = new Graphics();

    // Visual children live in an inner `body` so the juice layer can scale-punch
    // them WITHOUT scaling the interactive root (scaling the hit-tested root
    // breaks pointer hits — see physics.ts). The root holds only the stable
    // hit-fill + body.
    const body = new Container();

    // Accelerator: a faint dashed coverage halo (drawn once, under the cell).
    let halo: Graphics | null = null;
    let info: Text | null = null;
    if (cell.kind === 'accelerator') {
      halo = new Graphics();
      halo.circle(0, 0, ACCELERATOR_RADIUS).stroke({ color: GRAPHITE, width: 1, alpha: 0.18 });
      info = new Text({ text: '', style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 16, fill: GRAPHITE } });
      info.anchor.set(0.5);
      info.position.set(0, CELL_H / 2 + 16);
      body.addChildAt(halo, 0);
    }

    body.addChild(ports, idleHint, outline, glyph, meter);
    if (info) body.addChild(info);
    root.addChild(hit, body);
    canvasLayer.addChild(root);
    return { root, body, outline, glyph, meter, ports, ghost: null, ghostKey: '', ghostMask: null, ghostBounds: null, builtFlourished: false, halo, info, clog: null, idleHint, prevBurn: 0, outlinePath, outlineCum };
  }

  function updateCellVisual(cell: SimCell, vis: CellVisual): void {
    const frac = buildFraction(cell);

    if (!cell.built) {
      // Sketch-in: trace the stable outline path up to build progress — a real
      // graphite line being drawn, with a pencil tip riding the head.
      vis.outline.clear();
      const sub = subPath(vis.outlinePath, vis.outlineCum, frac);
      strokeWaypoints(vis.outline, sub, { color: GRAPHITE, width: 1.6, alpha: 0.85 });
      const head = sub[sub.length - 1];
      if (head) vis.outline.circle(head.x, head.y, 2).fill({ color: GRAPHITE, alpha: 0.9 });
      vis.glyph.alpha = 0.12 + 0.5 * frac; // the symbol fades in as the box forms
    } else if (!vis.builtFlourished) {
      // Snap to the finished cell: filled, rounded outline + a small flourish.
      vis.builtFlourished = true;
      vis.outline.clear();
      drawCellOutline(vis.outline);
      vis.glyph.alpha = 1;
      drawPortMarkers(vis.ports, cell.kind);
      juice.punch(vis.body, 0.28);
      juice.burst(cell.x, cell.y, 6, 42);
    }

    // Graphite weight = fuel gauge: a cell being actively fuelled is pressed
    // darker; an unfuelled one (running at baseRate) reads fainter and slower.
    if (cell.built) {
      const burn = Math.min(1, cell.recentBurn);
      vis.outline.alpha = 0.82 + 0.18 * burn;
      vis.glyph.alpha = 0.82 + 0.18 * burn;
      // The whoosh — an ignition (cold→hot) sprays a graphite puff at the fuel
      // port and pops the cell ("coal in the furnace"). Driven by the burn
      // rising edge, so it fires for BOTH hand-dropped and pipe-delivered fuel
      // and only when something actually burned (idle returns don't ignite).
      if (burn > 0.8 && vis.prevBurn < 0.5) {
        const L = portLayout(cell.kind);
        const fx = cell.kind === 'accelerator' ? cell.x : cell.x + L.fuel.x;
        const fy = cell.kind === 'accelerator' ? cell.y : cell.y + L.fuel.y;
        juice.burst(fx, fy, 7, 42);
        juice.punch(vis.body, 0.2);
      }
      vis.prevBurn = burn;
    }

    // Output back-pressure: all output pipes full → result spilling loose. Drawn
    // in the top FX layer (world space) so blocks/cells don't cover the cue.
    if (cell.outputStalled) {
      if (!vis.clog) {
        vis.clog = new Graphics();
        fxLayer.addChild(vis.clog);
      }
      const L = portLayout(cell.kind);
      drawClogMark(vis.clog, cell.x + L.output.x, cell.y + L.output.y);
    } else if (vis.clog) {
      vis.clog.clear();
    }

    // Accelerator: show its live boost (and pulse the halo when charged).
    if (cell.kind === 'accelerator' && vis.info && vis.halo) {
      const boost = cellBoost(cell);
      vis.info.text = boost > 1.05 ? `×${boost.toFixed(1)}` : 'idle';
      vis.halo.alpha = 0.12 + 0.012 * Math.min(20, boost);
      return; // accelerators have no op ghost/meter
    }

    // Output result: the numeral is WRITTEN left-to-right over the op (a reveal
    // mask), with a clock-sweep ring around the operator glyph for progress.
    vis.meter.clear();
    if (cell.op) {
      const f = opFraction(cell);
      const out = cell.op.emits[0]?.value;
      const key = out ? `${out.kind}:${valueMagnitude(out).toString()}` : 'none';
      if (out && vis.ghostKey !== key) {
        if (vis.ghost) vis.ghost.destroy({ children: true });
        vis.ghost = drawValueLabel(out.kind === 'real' ? out : { kind: 'real', n: valueMagnitude(out) }, {
          baseFontSize: 22,
          color: GRAPHITE,
        });
        const L = portLayout(cell.kind);
        vis.ghost.position.set(L.output.x + 34, L.output.y);
        vis.body.addChild(vis.ghost);
        // Reveal mask (child → auto-destroyed with the ghost). Drawn in
        // ghost-local space, which is centred, so it wipes left-to-right.
        const lb = vis.ghost.getLocalBounds();
        if (lb.width > 0.5) {
          const gmask = new Graphics();
          vis.ghost.addChild(gmask);
          vis.ghost.mask = gmask;
          vis.ghostMask = gmask;
          vis.ghostBounds = { x: lb.x, y: lb.y, w: lb.width, h: lb.height };
        } else {
          vis.ghostMask = null;
          vis.ghostBounds = null;
        }
        vis.ghostKey = key;
      }
      // Write the numeral up to the op fraction.
      if (vis.ghost) {
        vis.ghost.alpha = 1;
        if (vis.ghostMask && vis.ghostBounds) {
          const gb = vis.ghostBounds;
          vis.ghostMask.clear();
          vis.ghostMask.rect(gb.x - 2, gb.y - 2, gb.w * f + 2, gb.h + 4).fill({ color: 0xffffff });
        } else {
          // Unmeasurable label — fall back to a darkening reveal.
          vis.ghost.alpha = 0.15 + 0.85 * f;
        }
      }
      // Clock-sweep ring around the operator glyph — legible even for long ops
      // where the written numeral inches forward imperceptibly. The arc presses
      // bolder while fuelled, so a burn reads as a felt lurch forward.
      const R = 19;
      const burn = Math.min(1, cell.recentBurn);
      vis.meter.circle(0, 0, R).stroke({ color: GRAPHITE, width: 1, alpha: 0.14 });
      if (f > 0.001) {
        vis.meter
          .arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2)
          .stroke({ color: GRAPHITE, width: 2 + 1.6 * burn, alpha: 0.5 + 0.35 * burn });
      }
    } else if (vis.ghost) {
      // Op just completed (ghost present, op now null): pop the cell and spray a
      // few shavings at the output where the result was written.
      vis.ghost.destroy({ children: true });
      vis.ghost = null;
      vis.ghostKey = '';
      vis.ghostMask = null;
      vis.ghostBounds = null;
      juice.punch(vis.body, 0.18);
      const L = portLayout(cell.kind);
      juice.burst(cell.x + L.output.x, cell.y + L.output.y, 5, 50);
    }

    // Idle states: a built cell with no op shows drop-zone hints on its empty
    // operand ports (it's waiting for input). If SOME operands are staged but
    // not all, the missing port(s) PULSE — the "waiting on the other operand"
    // (starving) state, distinct from a fully-empty idle cell.
    vis.idleHint.clear();
    const arity = operandArity(cell.kind);
    if (cell.built && !cell.op && arity > 0 && cell.kind !== 'accelerator') {
      const L = portLayout(cell.kind);
      const filled = cell.operands.filter((o) => o !== null).length;
      const partial = filled > 0 && filled < arity;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
      for (let i = 0; i < L.operands.length; i++) {
        if (cell.operands[i] != null) continue; // already fed
        const alpha = partial ? 0.2 + 0.5 * pulse : 0.22; // partial → pulse the missing port
        dashedSquare(vis.idleHint, L.operands[i].x, L.operands[i].y, 15, alpha);
      }
    }
  }

  function makeBlockVisual(id: number, value: Value): BlockVisual {
    const root = new Container();
    root.zIndex = 5;
    root.eventMode = 'static';
    root.cursor = 'pointer';

    // Visual children in an inner `body` so the juice layer can punch them
    // without scaling the interactive (hit-tested) root.
    const body = new Container();
    const g = new Graphics();
    g.roundRect(-BLOCK_R, -BLOCK_R, BLOCK_R * 2, BLOCK_R * 2, 4);
    g.fill({ color: 0xfbf7ee, alpha: 0.95 });
    pencilStrokeDouble(
      g,
      [
        { x: -BLOCK_R, y: -BLOCK_R },
        { x: BLOCK_R, y: -BLOCK_R },
        { x: BLOCK_R, y: BLOCK_R },
        { x: -BLOCK_R, y: BLOCK_R },
        { x: -BLOCK_R, y: -BLOCK_R },
      ],
      { color: GRAPHITE, width: 1.4 },
    );
    body.addChild(g);

    const label = drawValueLabel(value.kind === 'real' ? value : { kind: 'real', n: valueMagnitude(value) }, {
      baseFontSize: 24,
      color: GRAPHITE,
    });
    body.addChild(label);
    root.addChild(body);

    root.on('pointerdown', (e) => {
      e.stopPropagation();
      drag = { id, root };
      root.zIndex = 100;
    });

    canvasLayer.addChild(root);
    return { root, body };
  }

  // --- Ticker --------------------------------------------------------------

  let acc = 0;
  let enginePaused = false;
  let speed = 3;
  let elapsedTicks = 0;
  const unsubSpeed = speedStore.subscribe((s) => (speed = s));
  let monitorAccum = 0;
  app.ticker.add((t) => {
    // Advance the model in whole ticks for determinism, at the dev speed.
    if (!enginePaused && speed > 0) {
      acc += (t.deltaMS / 1000) * speed;
      while (acc >= 1) {
        tick(world, 1);
        acc -= 1;
        elapsedTicks += 1;
      }
    }
    syncPipes();
    syncCells();
    syncBlocks();
    juice.step(t.deltaMS); // visual-only, real-time (independent of sim pause/speed)
    scoreStore.set(formatScore(totalScore(world)));
    // Dev monitors — refresh a few times a second (frontier scan is O(pool)).
    monitorAccum += t.deltaMS;
    if (monitorAccum >= 250) {
      monitorAccum = 0;
      frontierStore.set(formatScore(frontierOf(world)));
      let working = 0;
      for (const c of world.cells.values()) if (c.op) working++;
      statsStore.set({ cells: world.cells.size, pipes: world.pipes.size, loose: world.pool.length, elapsed: elapsedTicks, working });
    }
  });

  // --- DEV inspection hooks ------------------------------------------------
  // In dev builds, expose the engine so a headless Playwright harness can
  // drive and assert the real game (place cells, advance time deterministically,
  // read score/pool). The view stays the view; this is just a test seam.
  if (import.meta.env.DEV) {
    (window as unknown as { __nbg?: unknown }).__nbg = {
      world,
      setPaused: (p: boolean) => {
        enginePaused = p;
      },
      tick: (n = 1) => tick(world, n),
      place: (kind: CellKind, x = 0, y = 0) => placeCell(world, kind, x, y),
      pipe: (fromCell: number, toCell: number, toPort: number, fuel = false) =>
        placePipe(world, fromCell, 0, toCell, toPort, { fuel }),
      moveCell: (id: number, x: number, y: number) => moveCell(world, id, x, y),
      removeCell: (id: number) => removeCell(world, id),
      removePipe: (id: number) => removePipe(world, id),
      feed: (cellId: number, port: number, n: number) => feedOperand(world, cellId, port, valueOf(n)),
      fuel: (cellId: number, n: number) => injectFuel(world, cellId, valueOf(n)),
      addLoose: (n: number, x = 0, y = 0) => addLoose(world, valueOf(n), x, y),
      score: () => totalScore(world).toString(),
      poolSize: () => world.pool.length,
      pipeCount: () => world.pipes.size,
      cellState: (id: number) => {
        const c = world.cells.get(id);
        return c ? { built: c.built, build: buildFraction(c), op: opFraction(c), kind: c.kind } : null;
      },
    };
  }

  // --- Resize --------------------------------------------------------------

  const onResize = (): void => {
    paper.destroy({ children: true });
    paper = drawPaper(app.screen.width, app.screen.height);
    app.stage.addChildAt(paper, 0);
  };
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      unsubTool();
      unsubSpeed();
      juice.destroy();
      app.destroy(true, { children: true });
    },
  };
}

// --- Drawing helpers -------------------------------------------------------

/** A pulsing dashed JAM_TINT ring — the unmissable back-pressure cue. Redrawn
 *  each frame while a stall persists (the pulse draws the eye to the jam). */
function drawClogMark(g: Graphics, x: number, y: number): void {
  g.clear();
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 170);
  const r = 9;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2 / segs) * 0.5; // half-on/half-off → dashed
    g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    g.arc(x, y, r, a0, a1);
  }
  g.stroke({ color: JAM_TINT, width: 1.8, alpha: 0.4 + 0.45 * pulse });
}

/** A faint dashed square — the "drop a block here" hint on an empty operand
 *  port. `alpha` is pulsed by the caller for the partial/waiting state. */
function dashedSquare(g: Graphics, cx: number, cy: number, half: number, alpha: number): void {
  const step = 5;
  for (let d = -half; d < half; d += step * 2) {
    g.moveTo(cx + d, cy - half).lineTo(cx + Math.min(d + step, half), cy - half);
    g.moveTo(cx + d, cy + half).lineTo(cx + Math.min(d + step, half), cy + half);
    g.moveTo(cx - half, cy + d).lineTo(cx - half, cy + Math.min(d + step, half));
    g.moveTo(cx + half, cy + d).lineTo(cx + half, cy + Math.min(d + step, half));
  }
  g.stroke({ color: GRAPHITE, width: 1, alpha });
}

function drawCellOutline(g: Graphics): void {
  const hw = CELL_W / 2;
  const hh = CELL_H / 2;
  g.roundRect(-hw, -hh, CELL_W, CELL_H, 6);
  g.fill({ color: 0xfbf7ee, alpha: 0.9 });
  pencilStrokeDouble(
    g,
    [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
      { x: -hw, y: -hh },
    ],
    { color: GRAPHITE, width: 1.6 },
  );
}

function drawPortMarkers(g: Graphics, kind: CellKind): void {
  g.clear();
  if (kind === 'accelerator') return; // whole body is the fuel intake; no ports
  const L = portLayout(kind);
  for (const op of L.operands) {
    g.circle(op.x, op.y, PORT_R).stroke({ color: GRAPHITE, width: 1.2, alpha: 0.6 });
  }
  // Fuel socket — a small open square at the bottom (distinct from round operands).
  g.rect(L.fuel.x - 9, L.fuel.y - 9, 18, 18).stroke({ color: GRAPHITE, width: 1.1, alpha: 0.5 });
  // Output nub (not for the Mill's many-piece output — still useful as a hint).
  g.circle(L.output.x, L.output.y, 5).fill({ color: GRAPHITE, alpha: 0.5 });
}

function formatScore(d: ReturnType<typeof totalScore>): string {
  const x = d.toNumber();
  if (!Number.isFinite(x)) return d.toString();
  if (x >= 1e6) return x.toExponential(2);
  return Math.round(x).toLocaleString('en-US');
}

/** The biggest single magnitude anywhere — pool, staged operands, in-progress
 *  outputs. The real "numbers go big" metric (distinct from Total Score). */
function frontierOf(world: World): ReturnType<typeof totalScore> {
  let max = valueMagnitude(valueOf(0));
  const consider = (v: Value): void => {
    const m = valueMagnitude(v);
    if (m.gt(max)) max = m;
  };
  for (const b of world.pool) consider(b.value);
  for (const c of world.cells.values()) {
    for (const o of c.operands) if (o) consider(o);
    if (c.op) {
      for (const h of c.op.heldInputs) consider(h);
      for (const e of c.op.emits) consider(e.value);
    }
  }
  return max;
}
