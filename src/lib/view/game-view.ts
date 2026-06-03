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
import { setupCamera, screenToCanvas } from '../camera';
import { pencilStrokeDouble } from '../pixi/pencil';
import { drawValueLabel } from '../pixi/value-label';
import { GRAPHITE, PENCIL_FONT_FAMILY } from '../pixi/typography';
import { valueMagnitude, type Value } from '../../../core/value';
import {
  createWorld,
  placeCell,
  tick,
  totalScore,
  takeLooseById,
  moveLoose,
  addLoose,
  feedOperand,
  injectFuel,
  operandArity,
  buildFraction,
  opFraction,
  type World,
  type SimCell,
  type CellKind,
} from '../../../core/engine';
import { scoreStore, placingStore } from './stores';

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
}

interface BlockVisual {
  root: Container;
}

export interface GameViewHandle {
  destroy(): void;
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

  // The model.
  const world: World = createWorld();

  // Visual caches keyed by engine id.
  const cellVisuals = new Map<number, CellVisual>();
  const blockVisuals = new Map<number, BlockVisual>();

  // Drag state for a loose block being moved.
  let drag: { id: number; root: Container } | null = null;

  // --- Interaction ---------------------------------------------------------

  app.stage.eventMode = 'static';
  app.stage.hitArea = { contains: () => true } as unknown as Container['hitArea'];

  function canvasPoint(globalX: number, globalY: number): { x: number; y: number } {
    return screenToCanvas(globalX, globalY);
  }

  // Place a cell where the player clicks while in placement mode.
  let placing: CellKind | null = null;
  const unsubPlacing = placingStore.subscribe((k) => (placing = k));

  app.stage.on('pointerdown', (e) => {
    if (drag) return; // a block grab handles its own pointerdown
    if (placing) {
      const p = canvasPoint(e.global.x, e.global.y);
      placeCell(world, placing, p.x, p.y);
      placingStore.set(null);
    }
  });

  app.stage.on('pointermove', (e) => {
    if (!drag) return;
    const p = canvasPoint(e.global.x, e.global.y);
    drag.root.position.set(p.x, p.y);
  });

  app.stage.on('pointerup', (e) => endDrag(e.global.x, e.global.y));
  app.stage.on('pointerupoutside', (e) => endDrag(e.global.x, e.global.y));

  function endDrag(globalX: number, globalY: number): void {
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

  function makeCellVisual(cell: SimCell): CellVisual {
    const root = new Container();
    root.position.set(cell.x, cell.y);
    root.zIndex = 1;

    const ports = new Graphics();
    const outline = new Graphics();
    drawCellOutline(outline);

    const glyph = new Text({
      text: GLYPH[cell.kind],
      style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 30, fill: GRAPHITE },
    });
    glyph.anchor.set(0.5);

    const meter = new Graphics();

    root.addChild(ports, outline, glyph, meter);
    canvasLayer.addChild(root);
    return { root, outline, glyph, meter, ports, ghost: null, ghostKey: '', builtFlourished: false };
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
  app.ticker.add((t) => {
    // Advance the model in whole ticks for determinism.
    acc += (t.deltaMS / 1000) * TICKS_PER_SECOND;
    while (acc >= 1) {
      tick(world, 1);
      acc -= 1;
    }
    syncCells();
    syncBlocks();
    scoreStore.set(formatScore(totalScore(world)));
  });

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
      unsubPlacing();
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
  const L = portLayout(kind);
  for (const op of L.operands) {
    g.circle(op.x, op.y, PORT_R).stroke({ color: GRAPHITE, width: 1.2, alpha: 0.6 });
  }
  // Fuel socket — a small open square at the bottom (distinct from round operands).
  g.rect(L.fuel.x - 9, L.fuel.y - 9, 18, 18).stroke({ color: GRAPHITE, width: 1.1, alpha: 0.5 });
  // Output nub.
  g.circle(L.output.x, L.output.y, 5).fill({ color: GRAPHITE, alpha: 0.5 });
}

function formatScore(d: ReturnType<typeof totalScore>): string {
  const x = d.toNumber();
  if (!Number.isFinite(x)) return d.toString();
  if (x >= 1e6) return x.toExponential(2);
  return Math.round(x).toLocaleString('en-US');
}
