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
import { pencilStrokeDouble } from '../pixi/pencil';
import { drawValueLabel } from '../pixi/value-label';
import { GRAPHITE, PENCIL_FONT_FAMILY } from '../pixi/typography';
import { valueMagnitude, valueOf, type Value } from '../../../core/value';
import { pencilStroke } from '../pixi/pencil';
import {
  createWorld,
  placeCell,
  placePipe,
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
import { scoreStore, toolStore, type Tool } from './stores';

// --- View constants --------------------------------------------------------

const CELL_W = 100;
const CELL_H = 76;
const PORT_R = 13; // operand / fuel port hit-radius
const BLOCK_R = 26; // loose-block half-size

/** View-side playback speed: engine ticks advanced per real second. The model
 *  treats 1 tick = 1 second; we run a touch faster so the prototype feels
 *  alive while we eyeball it. Pure presentation — real pacing is sim-tuned. */
const TICKS_PER_SECOND = 3;

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
  root: Container;
  outline: Graphics; // drawn once; alpha ramps with build progress
  glyph: Text;
  meter: Graphics; // progress bar, redrawn each frame (no jitter → no shimmer)
  ports: Graphics; // operand + fuel port markers, drawn once on build
  ghost: Container | null; // output-in-progress numeral
  ghostKey: string; // identity of the value currently ghosted
  builtFlourished: boolean;
  halo: Graphics | null; // accelerator coverage radius
  info: Text | null; // accelerator boost readout
}

interface BlockVisual {
  root: Container;
}

interface PipeVisual {
  root: Container;
  line: Graphics; // redrawn when an endpoint cell moves
  flight: Container | null; // the block sliding along the pipe
  flightKey: string;
  endKey: string; // last endpoint positions, to detect a move
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
    pipeGhost
      .moveTo(a.x, a.y)
      .lineTo(lastPointer.x, lastPointer.y)
      .stroke({ color: GRAPHITE, width: 1.5, alpha: 0.4 });
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
        vis.root.destroy({ children: true });
        pipeVisuals.delete(id);
      }
    }
  }

  function endpointsKey(a: { x: number; y: number }, b: { x: number; y: number }): string {
    return `${a.x.toFixed(0)},${a.y.toFixed(0)}|${b.x.toFixed(0)},${b.y.toFixed(0)}`;
  }

  function drawPipeLine(vis: PipeVisual, pipe: SimPipe, a: { x: number; y: number }, b: { x: number; y: number }): void {
    vis.line.clear();
    // Redrawn when an endpoint moves (re-wobbles during a drag; stable at rest).
    pencilStroke(vis.line, [a, b], { color: GRAPHITE, width: pipe.fuel ? 1.1 : 1.6, alpha: 0.55 });
    vis.line.circle(a.x, a.y, 3).fill({ color: GRAPHITE, alpha: 0.6 });
    vis.line.circle(b.x, b.y, 4).stroke({ color: GRAPHITE, width: 1.2, alpha: 0.6 });
    vis.endKey = endpointsKey(a, b);
  }

  function makePipeVisual(pipe: SimPipe): PipeVisual {
    const root = new Container();
    const line = new Graphics();
    const vis: PipeVisual = { root, line, flight: null, flightKey: '', endKey: '' };
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
    if (!pipe.inFlight) {
      if (vis.flight) {
        vis.flight.destroy({ children: true });
        vis.flight = null;
        vis.flightKey = '';
      }
      return;
    }
    // The block slides from source to dest as transit progresses.
    const a = endpointPos(src, -1, false);
    const b = endpointPos(dst, pipe.toPort, pipe.fuel);
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
    if (vis.flight) vis.flight.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
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
      const p = canvasPoint(e.global.x, e.global.y);
      cellDrag = { id, dx: p.x - c.x, dy: p.y - c.y };
    });

    const ports = new Graphics();
    const outline = new Graphics();
    drawCellOutline(outline);

    const glyph = new Text({
      text: GLYPH[cell.kind],
      style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 30, fill: GRAPHITE },
    });
    glyph.anchor.set(0.5);

    const meter = new Graphics();

    // Accelerator: a faint dashed coverage halo (drawn once, under the cell).
    let halo: Graphics | null = null;
    let info: Text | null = null;
    if (cell.kind === 'accelerator') {
      halo = new Graphics();
      halo.circle(0, 0, ACCELERATOR_RADIUS).stroke({ color: GRAPHITE, width: 1, alpha: 0.18 });
      info = new Text({ text: '', style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 16, fill: GRAPHITE } });
      info.anchor.set(0.5);
      info.position.set(0, CELL_H / 2 + 16);
      root.addChildAt(halo, 0);
    }

    root.addChild(ports, outline, glyph, meter);
    if (info) root.addChild(info);
    canvasLayer.addChild(root);
    return { root, outline, glyph, meter, ports, ghost: null, ghostKey: '', builtFlourished: false, halo, info };
  }

  function updateCellVisual(cell: SimCell, vis: CellVisual): void {
    const frac = buildFraction(cell);
    // Sketch-in: ramp alpha with build progress (stable, no per-frame jitter).
    vis.outline.alpha = 0.25 + 0.75 * frac;
    vis.glyph.alpha = cell.built ? 1 : 0.2 + 0.6 * frac;

    if (cell.built && !vis.builtFlourished) {
      vis.builtFlourished = true;
      drawPortMarkers(vis.ports, cell.kind);
    }

    // Accelerator: show its live boost (and pulse the halo when charged).
    if (cell.kind === 'accelerator' && vis.info && vis.halo) {
      const boost = cellBoost(cell);
      vis.info.text = boost > 1.05 ? `×${boost.toFixed(1)}` : 'idle';
      vis.halo.alpha = 0.12 + 0.012 * Math.min(20, boost);
      return; // accelerators have no op ghost/meter
    }

    // Output ghost: a faint numeral that darkens as the op completes.
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
        vis.root.addChild(vis.ghost);
        vis.ghostKey = key;
      }
      if (vis.ghost) vis.ghost.alpha = 0.15 + 0.85 * f;

      // Progress meter — a pencil bar under the cell (straight lines, no jitter).
      const w = CELL_W * 0.8;
      vis.meter.rect(-w / 2, CELL_H / 2 + 14, w * f, 5).fill({ color: GRAPHITE, alpha: 0.6 });
      vis.meter.rect(-w / 2, CELL_H / 2 + 14, w, 5).stroke({ color: GRAPHITE, width: 1, alpha: 0.35 });
    } else if (vis.ghost) {
      vis.ghost.destroy({ children: true });
      vis.ghost = null;
      vis.ghostKey = '';
    }
  }

  function makeBlockVisual(id: number, value: Value): BlockVisual {
    const root = new Container();
    root.zIndex = 5;
    root.eventMode = 'static';
    root.cursor = 'pointer';

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
    root.addChild(g);

    const label = drawValueLabel(value.kind === 'real' ? value : { kind: 'real', n: valueMagnitude(value) }, {
      baseFontSize: 24,
      color: GRAPHITE,
    });
    root.addChild(label);

    root.on('pointerdown', (e) => {
      e.stopPropagation();
      drag = { id, root };
      root.zIndex = 100;
    });

    canvasLayer.addChild(root);
    return { root };
  }

  // --- Ticker --------------------------------------------------------------

  let acc = 0;
  let enginePaused = false;
  app.ticker.add((t) => {
    // Advance the model in whole ticks for determinism.
    if (!enginePaused) {
      acc += (t.deltaMS / 1000) * TICKS_PER_SECOND;
      while (acc >= 1) {
        tick(world, 1);
        acc -= 1;
      }
    }
    syncPipes();
    syncCells();
    syncBlocks();
    scoreStore.set(formatScore(totalScore(world)));
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
      unsubTool();
      app.destroy(true, { children: true });
    },
  };
}

// --- Drawing helpers -------------------------------------------------------

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
