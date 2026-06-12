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
import { setupCamera, screenToCanvas, restoreCamera, snapshotCamera } from '../camera';
import { pencilStrokeDouble, pencilWaypoints, strokeWaypoints } from '../pixi/pencil';
import { drawValueLabel } from '../pixi/value-label';
import { GRAPHITE, PENCIL_FONT_FAMILY } from '../pixi/typography';
import { JAM_TINT } from '../colors';
import { valueMagnitude, valueOf, type Value } from '../../../core/value';
import { pencilStroke } from '../pixi/pencil';
import {
  createWorld,
  resetWorld,
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
  depositToWarehouse,
  withdrawFromWarehouse,
  collectNearby,
  cancelWork,
  operandArity,
  buildFraction,
  opFraction,
  cellBoost,
  currentBuildSlots,
  buildQueuePosition,
  ACCELERATOR_RADIUS,
  type World,
  type SimCell,
  type SimPipe,
  type CellKind,
} from '../../../core/engine';
import { INK_TUNING, materialBill, UNIFIED_BUILD_TIME } from '../../../core/time';
import { PRESETS } from './presets';
import { createJuice, setJuice } from './physics';
import { note } from './narrator';
import { sndSnap, sndBurn, sndErase, sndMilestone, resumeAudio } from './audio';
import { scoreStore, toolStore, frontierStore, statsStore, speedStore, milestoneStore, unlockedTools, buildPreviews, inspectorStore, type InspectorData, type Tool } from './stores';
import { buildWork } from '../../../core/time';

// --- View constants --------------------------------------------------------

// THE INK ERA IS THE GAME (promoted 2026-06-12, after the cancel verb landed
// and the round-2 sweep locked the numbers — see HANDOVER §0a). The live game
// runs INK_TUNING verbatim: the unified law (need = M^(1/2^k), bands /16,
// pro-rata), MATERIAL bills on every machine, one pencil + frontier-rung
// pencils, the write-time floor (2.5 d/s), the ink tax (×2, Ledger-paid,
// 3-minute delayed shock), the divisor-mill, and powered logistics.
// Measured by the Player agent at 1 act/s: mult 5.2 m · exp 31.6 m · first
// launch 32.8 m · launch eras 33→65→…→234 m · e328 at 4 h. Locked until
// first human playtest.
const GAME_TUNING = INK_TUNING;

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
  warehouse: 'W',
  ledger: '§',
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
  intakeZero: Text | null; // successor's river-intake 0 (animated rising), else null
  hadScaffold: boolean; // the active op demanded working notes — for the launch beat
  queueBadge: Text | null; // "№k" while waiting for a build slot (lazy)
  gradeLabel: Text | null; // "≥ N" fuel-grade readout beside the fuel socket (lazy)
  opLabels: Text[]; // staged/held operand value labels, one per operand port
  etaLabel: Text | null; // "~3m" remaining-time under a working/building cell (lazy)
  ghostUnder: Container | null; // faint full under-trace so long ops never read dead
}

interface BlockVisual {
  root: Container; // interactive (drag); never transformed
  body: Container; // visual; punched/scaled by the juice layer
  badge: Text; // `×N` stack-count, shown when count > 1
  lastCount: number; // last rendered count — to detect a stack growing/shrinking
  label: Container; // the full ladder numeral (close-up)
  lodText: Text; // magnitude-only "e22" swap-in at altitude (U2.4)
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
  /** Dev menu: clear the canvas back to an empty world. */
  reset(): void;
  /** Dev menu: clear, then build a named factory snapshot (see presets.ts). */
  loadPreset(key: string): void;
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

  // The model. Stacking on: identical un-piped outputs pile into one movable
  // stack (a `×N` badge), instead of an invisible heap on the output port.
  const world: World = createWorld(GAME_TUNING, { stacking: true });
  note('A river of zeros below — endless, and free. Everything is built from it.', 'intro');

  // Visual caches keyed by engine id.
  const cellVisuals = new Map<number, CellVisual>();
  const blockVisuals = new Map<number, BlockVisual>();
  const pipeVisuals = new Map<number, PipeVisual>();

  // Zoom level-of-detail (U2.4): below this camera scale, cells drop to state
  // chips (outline + glyph + clock ring) and blocks to magnitude-only labels —
  // the altitude view becomes a readable BOARD instead of scribble.
  let lodActive = false;

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
  // Drag state for a cell being repositioned (grab offset keeps it under cursor;
  // ox/oy remember the grab position so a no-move release reads as a CLICK).
  let cellDrag: { id: number; dx: number; dy: number; ox: number; oy: number } | null = null;

  // --- Interaction ---------------------------------------------------------

  app.stage.eventMode = 'static';
  app.stage.hitArea = { contains: () => true } as unknown as Container['hitArea'];

  function canvasPoint(globalX: number, globalY: number): { x: number; y: number } {
    return screenToCanvas(globalX, globalY);
  }

  // Track Shift via the keyboard (more robust than Pixi's event modifier) —
  // shift-click deletes cells/pipes.
  let shiftHeld = false;
  // The canonical toolbar order — hotkeys 1–8 map to the UNLOCKED tools in this
  // order (matching what the shelf displays). Mirrored from the store.
  const TOOL_ORDER: Tool[] = ['successor', 'addition', 'multiplication', 'exponentiation', 'mill', 'accelerator', 'warehouse', 'ledger', 'pipe'];
  let unlockedList: Tool[] = [];
  const unsubUnlocked = unlockedTools.subscribe((l) => (unlockedList = TOOL_ORDER.filter((t) => l.includes(t))));
  const SPEED_STEPS = [0, 1, 3, 10, 30];
  const onKey = (e: KeyboardEvent): void => {
    shiftHeld = e.shiftKey;
    if (e.type !== 'keydown') return;
    // Escape / cancel: a half-laid pipe first, then the tool, then the selection.
    if (e.key === 'Escape') {
      if (wireDrag) {
        wireDrag = null;
        pipeGhost.clear();
      } else if (pipeSource !== null) {
        pipeSource = null;
        drawPipeGhost();
      } else if (tool) {
        toolStore.set(null);
      } else {
        clearSelection();
      }
      if (marquee) {
        marquee = null;
        marqueeG.clear();
      }
      return;
    }
    // 1–8: pick the nth unlocked tool (shown on the shelf buttons).
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= unlockedList.length) {
      const t = unlockedList[n - 1];
      toolStore.set(tool === t ? null : t); // same key again = put the tool down
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      speedStore.update((s) => (s === 0 ? 3 : 0)); // Space = pause/resume
      return;
    }
    if (e.key === '+' || e.key === '=' || e.key === '-') {
      speedStore.update((s) => {
        const i = Math.max(0, SPEED_STEPS.indexOf(s));
        const j = e.key === '-' ? Math.max(0, i - 1) : Math.min(SPEED_STEPS.length - 1, i + 1);
        return SPEED_STEPS[j];
      });
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      frameWorld();
      return;
    }
    if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey) {
      e.preventDefault();
      undoRemoval();
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  // The active tool (cell to place, or the pipe tool), mirrored from the store.
  let tool: Tool | null = null;

  // Pipe placement: first click picks a source output, second a dest port.
  let pipeSource: number | null = null;
  // Drag-to-wire (U3.4): pointerdown on an output nub → release on a port.
  // Also set by grabbing an existing pipe's ARRIVAL end (reroute in place).
  let wireDrag: { src: number } | null = null;
  let lastPointer = { x: 0, y: 0 };
  const pipeGhost = new Graphics();
  pipeGhost.zIndex = 50;
  canvasLayer.addChild(pipeGhost);
  // Hover tooltip for pipes: what it carries + how long the trip has left.
  const pipeTip = new Text({ text: '', style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 12, fill: GRAPHITE } });
  pipeTip.alpha = 0.8;
  pipeTip.visible = false;
  pipeTip.zIndex = 95;
  canvasLayer.addChild(pipeTip);

  // --- Box-select + group move (U3.1) ---------------------------------------
  // Drag on empty canvas (no tool) sketches a dashed pencil marquee; the cells
  // and stacks inside get a faint halo; dragging any selected member moves the
  // whole set (pipes follow). Esc or an empty click clears.
  const selCells = new Set<number>();
  const selBlocks = new Set<number>();
  let marquee: { x0: number; y0: number } | null = null;
  let groupDrag: { x0: number; y0: number; cells: Map<number, Pt>; blocks: Map<number, Pt> } | null = null;
  const marqueeG = new Graphics();
  marqueeG.zIndex = 90;
  canvasLayer.addChild(marqueeG);
  const selectionG = new Graphics();
  selectionG.zIndex = 89;
  canvasLayer.addChild(selectionG);

  function clearSelection(): void {
    selCells.clear();
    selBlocks.clear();
    selectionG.clear();
    inspected = null;
    inspectorStore.set(null);
  }

  // --- One-step undo for deletions (U3.5) -----------------------------------
  // Shift-click erases instantly; a slipped click mid-rearrange can cost
  // minutes of build time. We cache the last removed cell (with its pipes) or
  // pipe and restore on Ctrl+Z. Held blocks were returned loose by the engine,
  // so the restored cell comes back EMPTY — no value is duplicated or lost.
  let undoSnap: { cell?: SimCell; pipes: SimPipe[] } | null = null;

  function cacheCellRemoval(c: SimCell): void {
    const pipes = [...world.pipes.values()]
      .filter((p) => p.fromCell === c.id || p.toCell === c.id)
      .map((p) => ({ ...p, inFlight: null, stalled: false }));
    undoSnap = {
      cell: {
        ...c,
        operands: new Array(c.operands.length).fill(null),
        op: null,
        store: [],
        outputStalled: false,
        recentBurn: 0,
      },
      pipes,
    };
  }
  function cachePipeRemoval(p: SimPipe): void {
    undoSnap = { pipes: [{ ...p, inFlight: null, stalled: false }] };
  }
  function undoRemoval(): void {
    if (!undoSnap) return;
    if (undoSnap.cell) world.cells.set(undoSnap.cell.id, undoSnap.cell);
    for (const p of undoSnap.pipes) {
      if (world.cells.has(p.fromCell) && world.cells.has(p.toCell)) world.pipes.set(p.id, p);
    }
    note('Un-erased. The page forgives, once.');
    undoSnap = null;
  }

  // --- The inspector (U4.1): click (no drag) a cell or block ----------------
  let inspected: { type: 'cell' | 'block'; id: number } | null = null;

  const CELL_ROLE: Record<string, string> = {
    successor: 'taps the river — writes 1s from zeros, gated by how many you build',
    addition: 'plumbing — consolidates small numbers into fewer, larger operands',
    multiplication: 'amplifier — the product is score AND future fuel',
    exponentiation: 'the jump operator — demands working notes (show your work)',
    mill: 'partitions a block into ÷gear equal pieces, value conserved — feed port 2 a number to re-gear',
    accelerator: 'a power plant — its charge carries blocks on covered pipes',
    warehouse: 'a stockpile — pipes deposit; output pipes withdraw largest-first',
    ledger: 'the tax office — upkeep is paid from its store; an empty ledger slows the machinery',
  };

  /** Largest op-work this block one-shots under the overpay law (the grade-fit
   *  teaching hint): solve grade^(1-p)·V^p ≥ W with grade = c·W^g. */
  function oneShotWork(v: ReturnType<typeof valueMagnitude>): ReturnType<typeof valueMagnitude> {
    const p = GAME_TUNING.fuelOverpayExp;
    const g = GAME_TUNING.gradeExp;
    const c = GAME_TUNING.gradeCoeff;
    // W^(1 - g(1-p)) ≤ c^(1-p) · V^p  →  W ≤ (c^(1-p) · V^p)^(1/(1-g(1-p)))
    const expo = 1 - g * (1 - p);
    return v.pow(p).mul(Math.pow(c, 1 - p)).pow(1 / Math.max(0.05, expo));
  }

  /** Rebuild the inspector card from live world state (called per monitor tick
   *  and on click). Closes itself if the entity is gone. */
  function refreshInspector(): void {
    if (!inspected) return;
    if (inspected.type === 'cell') {
      const c = world.cells.get(inspected.id);
      if (!c) {
        inspected = null;
        inspectorStore.set(null);
        return;
      }
      const lines: InspectorData['lines'] = [];
      if (!c.built) {
        if (c.materialNeed) {
          // THE BILL: the cell is a sketch until its material is deposited.
          lines.push({ k: 'state', v: 'awaiting MATERIAL — drop the bill on the cell' });
          lines.push({ k: 'bill', v: `one block, ${formatScore(c.materialNeed.min)} – ${formatScore(c.materialNeed.max)}` });
        } else {
          const pos = buildQueuePosition(world, c.id);
          const slots = currentBuildSlots(world);
          lines.push({
            k: 'state',
            v:
              pos >= slots
                ? `queued №${pos - slots + 1} (fuel may rush it)`
                : `building — ${Math.round(buildFraction(c) * 100)}%`,
          });
        }
        lines.push({ k: 'build work', v: formatScore(c.buildWork) });
      } else if (c.kind === 'accelerator') {
        lines.push({ k: 'charge', v: formatScore(c.charge) });
        lines.push({ k: 'carries', v: c.charge.gt(1) ? `blocks ≤ ${formatScore(c.charge)} on covered pipes` : 'nothing (feed it)' });
      } else if (c.kind === 'warehouse' || c.kind === 'ledger') {
        let n = 0;
        let biggest = valueOf(0);
        for (const e of c.store) {
          n += e.count;
          if (valueMagnitude(e.value).gt(valueMagnitude(biggest))) biggest = e.value;
        }
        lines.push({ k: 'stockpile', v: n === 0 ? 'empty' : `${n} blocks · ≤ ${formatScore(valueMagnitude(biggest))}` });
        if (c.kind === 'ledger') {
          lines.push({ k: 'rent due', v: world.inkDemand.gt(0) ? `${formatScore(world.inkDemand)}/s` : 'nothing (yet)' });
          lines.push({ k: 'ink coverage', v: `${Math.round(world.inkCoverage * 100)}%` });
          if (world.inkDemand.gt(0))
            lines.push({ k: 'pays with', v: `blocks ≤ ${formatScore(world.inkDemand.mul(world.tuning.upkeepBandRatio))}` });
        }
        const wid = c.id;
        const actions = [
          { label: 'withdraw largest', run: (): void => void withdrawFromWarehouse(world, wid) },
        ];
        if (c.kind === 'warehouse')
          actions.push({ label: 'collect nearby', run: () => {
              const got = collectNearby(world, wid);
              if (got > 0) note(`Swept ${got} loose block${got === 1 ? '' : 's'} into the stockpile.`);
            } });
        inspectorStore.set({
          title: GLYPH[c.kind] + '  ' + c.kind,
          role: CELL_ROLE[c.kind] ?? '',
          lines,
          actions,
        });
        return;
      } else if (c.op) {
        lines.push({ k: 'state', v: `working — ${Math.round(opFraction(c) * 100)}%` });
        const held = c.op.heldInputs;
        if (held.length > 0) lines.push({ k: 'computing', v: held.map((h) => formatScore(valueMagnitude(h))).join(' , ') });
        lines.push({ k: 'labor', v: formatScore(c.op.work) });
        if (c.op.scaffold) {
          lines.push({ k: 'notes due', v: `${formatScore(c.op.fuelPaid)} / ${formatScore(c.op.fuelRequired)}` });
          lines.push({ k: 'note band', v: `${formatScore(c.op.scaffold.min)} – ${formatScore(c.op.scaffold.cap)}` });
        } else {
          lines.push({ k: 'fuel grade', v: `≥ ${formatScore(c.op.grade)}` });
        }
      } else {
        const staged = c.operands.filter((o) => o !== null).length;
        lines.push({ k: 'state', v: staged > 0 ? `waiting — ${staged}/${c.operands.length} operands staged` : 'idle' });
        for (let i = 0; i < c.operands.length; i++) {
          if (c.operands[i]) lines.push({ k: `operand ${i === 0 ? 'a' : 'b'}`, v: formatScore(valueMagnitude(c.operands[i]!)) });
        }
      }
      let pin = 0;
      let pout = 0;
      for (const p of world.pipes.values()) {
        if (p.toCell === c.id) pin++;
        if (p.fromCell === c.id) pout++;
      }
      lines.push({ k: 'pipes', v: `${pin} in · ${pout} out` });
      // THE CANCEL VERB: any work-in-progress (or staged operands) can be
      // aborted — operands come back, burned notes do not. The rescue for a
      // regretted hours-long write or a launch staged before its notes exist.
      const cancellable = c.op !== null || c.operands.some((o) => o !== null);
      const cid = c.id;
      inspectorStore.set({
        title: GLYPH[c.kind] + '  ' + c.kind,
        role: CELL_ROLE[c.kind] ?? '',
        lines,
        ...(cancellable
          ? {
              actions: [
                {
                  label: 'cancel (operands return)',
                  run: () => {
                    if (cancelWork(world, cid)) note('Abandoned. The operands return; the ink does not.');
                  },
                },
              ],
            }
          : {}),
      });
    } else {
      const b = world.pool.find((bl) => bl.id === inspected!.id);
      if (!b) {
        inspected = null;
        inspectorStore.set(null);
        return;
      }
      const m = valueMagnitude(b.value);
      const lines: InspectorData['lines'] = [
        { k: 'value', v: formatScore(m) },
        ...(b.count > 1 ? [{ k: 'stack', v: `×${b.count} (drag carries the pile; drops feed one)` }] : []),
        { k: 'as fuel', v: `worth ${formatScore(m)} of progress, before overpay` },
        { k: 'one-shots', v: `ops of labor ≤ ${formatScore(oneShotWork(m))}` },
      ];
      inspectorStore.set({
        title: 'block',
        role: 'a number — simultaneously score, operand, and fuel',
        lines,
        hint: 'fuel near an op’s asking grade goes furthest; oversized burns as smoke.',
      });
    }
  }
  function selectionSize(): number {
    return selCells.size + selBlocks.size;
  }
  /** Snapshot the selection's current logical positions for a group drag. */
  function beginGroupDrag(p: Pt): void {
    const cells = new Map<number, Pt>();
    for (const id of selCells) {
      const c = world.cells.get(id);
      if (c) cells.set(id, { x: c.x, y: c.y });
    }
    const blocks = new Map<number, Pt>();
    for (const id of selBlocks) {
      const b = world.pool.find((bl) => bl.id === id);
      if (b) blocks.set(id, { x: b.x, y: b.y });
    }
    groupDrag = { x0: p.x, y0: p.y, cells, blocks };
  }
  /** Faint dashed halos on the selected set, redrawn each frame (cheap; the
   *  selection is dozens at most). */
  function drawSelection(): void {
    selectionG.clear();
    if (selectionSize() === 0) return;
    for (const id of selCells) {
      const c = world.cells.get(id);
      if (!c) {
        selCells.delete(id);
        continue;
      }
      dashedRect(selectionG, c.x - CELL_W / 2 - 7, c.y - CELL_H / 2 - 7, CELL_W + 14, CELL_H + 14);
    }
    for (const id of selBlocks) {
      const b = world.pool.find((bl) => bl.id === id);
      if (!b) {
        selBlocks.delete(id);
        continue;
      }
      dashedRect(selectionG, b.x - BLOCK_R - 6, b.y - BLOCK_R - 6, BLOCK_R * 2 + 12, BLOCK_R * 2 + 12);
    }
    selectionG.stroke({ color: GRAPHITE, width: 1.1, alpha: 0.4 });
  }

  // Subscribe AFTER the pipe state above exists — Svelte fires the subscriber
  // synchronously on subscribe, and it touches pipeSource / drawPipeGhost.
  const unsubTool = toolStore.subscribe((t) => {
    tool = t;
    if (t !== 'pipe') pipeSource = null; // leaving pipe mode cancels a pending source
    drawPipeGhost();
  });

  app.stage.on('pointerdown', (e) => {
    resumeAudio(); // first user gesture unlocks the synth audio context
    if (drag) return; // a block grab handles its own pointerdown
    const p = canvasPoint(e.global.x, e.global.y);

    // Shift-click a pipe to delete it (reroute = delete + re-draw). Cells handle
    // their own shift-click delete (they sit on top and stop propagation).
    if (shiftHeld) {
      const pid = findPipeAt(p.x, p.y);
      if (pid !== null) {
        juice.eraser(p.x, p.y, 18, 12); // erase where the pipe was clicked (it's thin)
        sndErase();
        const pp = world.pipes.get(pid);
        if (pp) cachePipeRemoval(pp); // Ctrl+Z restores (U3.5)
        removePipe(world, pid);
      }
      return;
    }

    if (tool === 'pipe') {
      handlePipeClick(p.x, p.y);
      return;
    }
    if (tool) {
      // STICKY tools (U3.2): the opening play is "place 5–16 successors" — the
      // tool stays in hand; Esc / right-click / re-pressing its hotkey drops it.
      placeCell(world, tool, p.x, p.y);
      return;
    }
    // Grab an existing pipe's ARRIVAL end to reroute it in place (U3.4): the
    // pipe lifts off (cached for Ctrl+Z) and follows the cursor to a new port.
    for (const pipe of world.pipes.values()) {
      const dst = world.cells.get(pipe.toCell);
      if (!dst) continue;
      const b = endpointPos(dst, pipe.toPort, pipe.fuel);
      if (Math.hypot(p.x - b.x, p.y - b.y) <= 10) {
        cachePipeRemoval(pipe);
        const src = pipe.fromCell;
        removePipe(world, pipe.id);
        wireDrag = { src };
        drawPipeGhost();
        return;
      }
    }
    // No tool, empty canvas: begin a box-select marquee (left-drag; the camera
    // pans on middle/right, so this verb is free).
    marquee = { x0: p.x, y0: p.y };
  });

  // Right-click = the same cancel cascade as Escape (and no browser menu).
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  app.stage.on('rightdown', () => {
    if (pipeSource !== null) {
      pipeSource = null;
      drawPipeGhost();
    } else if (tool) {
      toolStore.set(null);
    } else {
      clearSelection();
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
    const sourceId = wireDrag ? wireDrag.src : tool === 'pipe' ? pipeSource : null;
    if (sourceId === null) return;
    const src = world.cells.get(sourceId);
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
    if (groupDrag) {
      // Group move: every selected cell/stack follows by the same delta;
      // pipes re-project off the moved cells automatically.
      const dx = p.x - groupDrag.x0;
      const dy = p.y - groupDrag.y0;
      for (const [id, base] of groupDrag.cells) moveCell(world, id, base.x + dx, base.y + dy);
      for (const [id, base] of groupDrag.blocks) moveLoose(world, id, base.x + dx, base.y + dy);
    } else if (drag) {
      drag.root.position.set(p.x, p.y);
    } else if (cellDrag) {
      moveCell(world, cellDrag.id, p.x - cellDrag.dx, p.y - cellDrag.dy);
    } else if (marquee) {
      marqueeG.clear();
      dashedRect(
        marqueeG,
        Math.min(marquee.x0, p.x),
        Math.min(marquee.y0, p.y),
        Math.abs(p.x - marquee.x0),
        Math.abs(p.y - marquee.y0),
      );
      marqueeG.stroke({ color: GRAPHITE, width: 1.2, alpha: 0.5 });
    } else if (wireDrag || (tool === 'pipe' && pipeSource !== null)) {
      drawPipeGhost();
    } else if (!tool) {
      // Pipe hover tooltip (U3.4): what it carries + the trip remaining.
      const pid = findPipeAt(p.x, p.y, 8);
      if (pid !== null) {
        const pipe = world.pipes.get(pid)!;
        let text: string;
        if (pipe.inFlight) {
          const eta = fmtEta(pipe.inFlight.work.sub(pipe.inFlight.progress).toNumber() / GAME_TUNING.baseRate);
          text = `${formatScore(valueMagnitude(pipe.inFlight.value))} in transit${eta ? ` · ${eta}` : ''}`;
        } else {
          text = pipe.fuel ? 'fuel line · empty' : 'pipe · empty';
        }
        pipeTip.text = text;
        pipeTip.position.set(p.x + 14, p.y - 18);
        pipeTip.visible = true;
      } else {
        pipeTip.visible = false;
      }
    }
  });

  app.stage.on('pointerup', (e) => endDrag(e.global.x, e.global.y));
  app.stage.on('pointerupoutside', (e) => endDrag(e.global.x, e.global.y));

  function endDrag(globalX: number, globalY: number): void {
    if (wireDrag) {
      // Release the wire on a port to commit; anywhere else cancels.
      const p = canvasPoint(globalX, globalY);
      const dest = portAt(p.x, p.y);
      if (dest && dest.cellId !== wireDrag.src) {
        placePipe(world, wireDrag.src, 0, dest.cellId, dest.port, { fuel: dest.fuel });
      }
      wireDrag = null;
      pipeGhost.clear();
      return;
    }
    if (cellDrag) {
      // A grab that never moved is a CLICK — open the inspector (U4.1).
      const c = world.cells.get(cellDrag.id);
      if (c && Math.hypot(c.x - cellDrag.ox, c.y - cellDrag.oy) < 3) {
        inspected = { type: 'cell', id: cellDrag.id };
        refreshInspector();
      }
      cellDrag = null;
      return;
    }
    if (groupDrag) {
      groupDrag = null; // positions were applied live; the set stays selected
      return;
    }
    if (marquee) {
      // Finalize the box-select: collect cells (by centre) and stacks inside.
      const p0 = canvasPoint(globalX, globalY);
      const x0 = Math.min(marquee.x0, p0.x);
      const y0 = Math.min(marquee.y0, p0.y);
      const x1 = Math.max(marquee.x0, p0.x);
      const y1 = Math.max(marquee.y0, p0.y);
      marquee = null;
      marqueeG.clear();
      clearSelection();
      if (x1 - x0 > 6 || y1 - y0 > 6) {
        for (const c of world.cells.values()) {
          if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) selCells.add(c.id);
        }
        for (const b of world.pool) {
          if (b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) selBlocks.add(b.id);
        }
        if (selectionSize() > 0) {
          note('A selection. Drag any member to move the set; Esc to release it.', 'first-select');
        }
      }
      return; // a tiny rect = an empty click = selection cleared, nothing else
    }
    if (!drag) return;
    const id = drag.id;
    const p = canvasPoint(globalX, globalY);
    const target = portAt(p.x, p.y);
    drag = null;

    if (target) {
      // Dragging picks up the WHOLE stack; dropping on a port consumes ONE block
      // and the remainder stays as a stack at the drop point (drop again to feed
      // more, or carry it off). Feels right for a pile of fuel/operands.
      const stack = takeLooseById(world, id);
      if (stack) {
        // Dropping a pile onto a warehouse/ledger stockpiles the WHOLE stack.
        const destCell = world.cells.get(target.cellId);
        if (destCell && destCell.kind === 'warehouse') {
          depositToWarehouse(world, target.cellId, stack.value, stack.count);
          return;
        }
        if (destCell && destCell.kind === 'ledger') {
          for (let k = 0; k < stack.count; k++) feedOperand(world, target.cellId, 0, stack.value);
          return;
        }
        let consumed = true;
        if (target.fuel) {
          // The whoosh fires off the burn rising-edge in updateCellVisual (so
          // hand-drop and pipe-fed fuel feel identical, and a fuel block bounced
          // off an idle cell doesn't falsely ignite). REFUSALS, though, must
          // never be silent (UX_PLAN U1.1) — diagnose before the engine bounces
          // the block, flash the socket, and let the narrator teach the rule.
          const c = world.cells.get(target.cellId)!;
          const fv = valueMagnitude(stack.value);
          const sc = c.op?.scaffold ?? null;
          const fL = c.kind === 'accelerator' ? { x: 0, y: 0 } : portLayout(c.kind).fuel;
          let refused = false;
          if (c.kind !== 'accelerator' && c.built) {
            if (!c.op) {
              refused = true;
              note('Nothing is burning here — fuel quickens a WORKING cell. It returns to the pool.', 'refuse-idle');
            } else if (sc && fv.gt(sc.cap)) {
              refused = true;
              note('Refused — your finished result is not scratch paper. Mill it down to note size, perhaps.', 'scaffold-too-big');
            } else if (sc && fv.lt(sc.min)) {
              refused = true;
              note('Refused — too slight for working notes. It wants something near the task at hand.', 'scaffold-too-small');
            } else if (!sc && fv.lt(c.op.grade)) {
              refused = true;
              note(`Refused. This operation does not take small change — it asks ≥ ${formatScore(c.op.grade)}.`, 'refuse-grade');
            }
          }
          if (refused) {
            jamFlash(c.x + fL.x, c.y + fL.y);
            juice.burst(c.x + fL.x, c.y + fL.y, 4, 26);
          } else if (c.op && !sc && GAME_TUNING.fuelOverpayExp < 1 && fv.gt(c.op.grade.mul(20))) {
            // OVERPAY (U1.2): the block burns, but most of it as smoke — an
            // oversized waste-puff + a one-time note teach the √ law by
            // consequence, never by dialog.
            juice.burst(c.x + fL.x, c.y + fL.y, 14, 70);
            note('Most of that burned as smoke. Fuel near the asking grade goes furthest.', 'overpay');
          }
          injectFuel(world, target.cellId, stack.value);
        } else if (!feedOperand(world, target.cellId, target.port, stack.value)) {
          consumed = false; // port occupied / cell busy — nothing taken
          jamFlash(p.x, p.y); // an occupied/unready port is a refusal too (U1.2/A2)
        }
        const remaining = consumed ? stack.count - 1 : stack.count;
        if (remaining > 0) addLoose(world, stack.value, p.x, p.y, remaining);
      }
    } else {
      const b = world.pool.find((bl) => bl.id === id);
      if (b && Math.hypot(p.x - b.x, p.y - b.y) < 3) {
        // A pick-up that never travelled is a CLICK — inspect the block.
        inspected = { type: 'block', id };
        refreshInspector();
      } else {
        moveLoose(world, id, p.x, p.y);
      }
    }
  }

  // Drag-aware drop targets (U1.5): while a block is in hand, compatible
  // ports brighten; fuel sockets that would REFUSE the carried value show a
  // faint JAM dash instead. Redrawn each frame from the ticker while dragging.
  const dragHintG = new Graphics();
  dragHintG.zIndex = 60;
  canvasLayer.addChild(dragHintG);

  function drawDragHints(value: Value): void {
    dragHintG.clear();
    const fv = valueMagnitude(value);
    for (const cell of world.cells.values()) {
      if (!cell.built) continue;
      if (cell.kind === 'accelerator' || cell.kind === 'warehouse' || cell.kind === 'ledger') {
        // Whole-body sinks: always-willing drop targets.
        dashedRect(dragHintG, cell.x - CELL_W / 2 - 5, cell.y - CELL_H / 2 - 5, CELL_W + 10, CELL_H + 10);
        continue;
      }
      const L = portLayout(cell.kind);
      for (let i = 0; i < L.operands.length; i++) {
        if (cell.operands[i] !== null) continue; // occupied — stays rest-state
        dragHintG.circle(cell.x + L.operands[i].x, cell.y + L.operands[i].y, PORT_R + 4);
      }
    }
    dragHintG.stroke({ color: GRAPHITE, width: 1.4, alpha: 0.55 });
    // Fuel sockets second, color-split by acceptance.
    for (const cell of world.cells.values()) {
      if (!cell.built || cell.kind === 'accelerator' || cell.kind === 'warehouse' || cell.kind === 'ledger') continue;
      if (!cell.op) continue; // idle cells bounce fuel — no invitation
      const L = portLayout(cell.kind);
      const fx = cell.x + L.fuel.x;
      const fy = cell.y + L.fuel.y;
      const sc = cell.op.scaffold;
      const accepts = fv.gte(cell.op.grade) && (!sc || (fv.gte(sc.min) && fv.lte(sc.cap)));
      dragHintG.rect(fx - 12, fy - 12, 24, 24);
      dragHintG.stroke(
        accepts ? { color: GRAPHITE, width: 1.6, alpha: 0.7 } : { color: JAM_TINT, width: 1.1, alpha: 0.35 },
      );
    }
  }

  /** One-shot refusal cue: a dashed JAM ring that expands and fades (~0.6s).
   *  The transient cousin of drawClogMark — same vocabulary, single beat. */
  function jamFlash(x: number, y: number): void {
    const g = new Graphics();
    fxLayer.addChild(g);
    let life = 0;
    const step = (t: { deltaMS: number }): void => {
      life += t.deltaMS;
      const a = 1 - life / 600;
      g.clear();
      if (a <= 0) {
        app.ticker.remove(step);
        g.destroy();
        return;
      }
      const r = 11 + (1 - a) * 7;
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
        g.arc(x, y, r, a0, a0 + 0.52);
      }
      g.stroke({ color: JAM_TINT, width: 1.6, alpha: 0.85 * a });
    };
    app.ticker.add(step);
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
        const vis = makeBlockVisual(b.id, b.value, b.count);
        blockVisuals.set(b.id, vis);
        vis.root.position.set(b.x, b.y);
        juice.punch(vis.body); // a block just written/spilled into existence — pop it
      }
      const vis = blockVisuals.get(b.id)!;
      // A stack that grew (more output landed in the pile) re-badges and pops, so
      // you SEE the count tick up; a shrink just re-badges.
      if (b.count !== vis.lastCount) {
        if (b.count > vis.lastCount) juice.punch(vis.body, 0.12);
        updateBlockBadge(vis, b.count);
      }
      // Don't fight the drag: the dragged block follows the cursor.
      if (!drag || drag.id !== b.id) vis.root.position.set(b.x, b.y);
      // Zoom LOD (U2.4): the full ladder numeral close-up, "e22" at altitude.
      vis.label.visible = !lodActive;
      vis.lodText.visible = lodActive;
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
      // Heavy blocks sag the line — a weight on a string, dipping most mid-pipe.
      const sag = blockHeaviness(v) * 16 * Math.sin(Math.PI * f);
      vis.flight.position.set(p.x, p.y + sag);
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
        sndErase();
        cacheCellRemoval(c); // Ctrl+Z restores (U3.5)
        removeCell(world, id);
        return;
      }
      const p = canvasPoint(e.global.x, e.global.y);
      // Grabbing the OUTPUT NUB starts a wire, not a move (drag-to-wire, U3.4).
      const onub = endpointPos(c, -1, false);
      if (c.built && Math.hypot(p.x - onub.x, p.y - onub.y) <= PORT_R + 2) {
        wireDrag = { src: id };
        drawPipeGhost();
        return;
      }
      // A selected member grabs the whole SET (U3.1 group move).
      if (selCells.has(id) && selectionSize() > 1) {
        beginGroupDrag(p);
        return;
      }
      cellDrag = { id, dx: p.x - c.x, dy: p.y - c.y, ox: c.x, oy: c.y };
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

    // A readout line below the cell — accelerator boost or warehouse contents.
    let halo: Graphics | null = null;
    let info: Text | null = null;
    if (cell.kind === 'accelerator' || cell.kind === 'warehouse' || cell.kind === 'ledger' || cell.kind === 'mill') {
      info = new Text({ text: '', style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 14, fill: GRAPHITE } });
      info.anchor.set(0.5);
      info.position.set(0, CELL_H / 2 + 16);
      if (cell.kind === 'accelerator') {
        halo = new Graphics();
        halo.circle(0, 0, ACCELERATOR_RADIUS).stroke({ color: GRAPHITE, width: 1, alpha: 0.18 });
        body.addChildAt(halo, 0);
      }
    }

    // Successor: a downward "intake" that draws zeros up from the river below, so
    // it reads thematically as the source of the zeros. A pencil spout + a faint
    // dashed channel toward the (screen-fixed) river, plus a 0 that rises into it.
    let intakeZero: Text | null = null;
    if (cell.kind === 'successor') {
      const intake = new Graphics();
      const top = CELL_H / 2;
      intake.moveTo(-11, top).lineTo(-5, top + 15);
      intake.moveTo(11, top).lineTo(5, top + 15);
      intake.stroke({ color: GRAPHITE, width: 1.4, alpha: 0.5 });
      for (let y = top + 22; y < top + 78; y += 11) intake.moveTo(0, y).lineTo(0, y + 5);
      intake.stroke({ color: GRAPHITE, width: 1, alpha: 0.22 });
      intakeZero = new Text({ text: '0', style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 13, fill: GRAPHITE } });
      intakeZero.anchor.set(0.5);
      body.addChild(intake, intakeZero);
    }

    body.addChild(ports, idleHint, outline, glyph, meter);
    if (info) body.addChild(info);
    // Staged-operand readouts: what each port holds (kept while the op runs as
    // the HELD inputs) — you can predict the output and catch a mis-feed.
    const opLabels: Text[] = [];
    {
      const L = portLayout(cell.kind);
      for (const port of L.operands) {
        const t = new Text({ text: '', style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 10, fill: GRAPHITE } });
        // Below the port, centred — clear of the clock ring and the glyph.
        t.anchor.set(0.5, 0);
        t.position.set(port.x + 2, port.y + PORT_R + 1);
        t.alpha = 0.75;
        body.addChild(t);
        opLabels.push(t);
      }
      // Non-commutative operators label their ports (10^40 vs 40^10 is a
      // catastrophic difference): italic a (base) over b (exponent).
      if (cell.kind === 'exponentiation') {
        const letters = ['a', 'b'];
        L.operands.forEach((port, i) => {
          const t = new Text({
            text: letters[i] ?? '',
            style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 13, fontStyle: 'italic', fill: GRAPHITE },
          });
          t.anchor.set(1, 0.5);
          t.position.set(port.x - PORT_R - 3, port.y);
          t.alpha = 0.6;
          body.addChild(t);
        });
      }
    }
    root.addChild(hit, body);
    canvasLayer.addChild(root);
    return { root, body, outline, glyph, meter, ports, ghost: null, ghostKey: '', ghostMask: null, ghostBounds: null, builtFlourished: false, halo, info, clog: null, idleHint, prevBurn: 0, outlinePath, outlineCum, intakeZero, hadScaffold: false, queueBadge: null, gradeLabel: null, opLabels, etaLabel: null, ghostUnder: null };
  }

  /** Show/update the "~3m" remaining-time readout under a cell ('' hides). */
  function setEta(vis: CellVisual, text: string): void {
    if (!text) {
      if (vis.etaLabel) vis.etaLabel.visible = false;
      return;
    }
    if (!vis.etaLabel) {
      vis.etaLabel = new Text({ text: '', style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 12, fill: GRAPHITE } });
      vis.etaLabel.anchor.set(0.5, 0);
      vis.etaLabel.position.set(0, CELL_H / 2 + 14);
      vis.etaLabel.alpha = 0.55;
      vis.body.addChild(vis.etaLabel);
    }
    if (vis.etaLabel.text !== text) vis.etaLabel.text = text;
    vis.etaLabel.visible = true;
  }

  function updateCellVisual(cell: SimCell, vis: CellVisual): void {
    const frac = buildFraction(cell);

    // Successor river-intake: a 0 rises from the river (below) up into the spout,
    // fading in and out. Staggered by cell id so a farm of successors shimmers.
    if (vis.intakeZero) {
      const t = (performance.now() / 1500 + cell.id * 0.13) % 1;
      vis.intakeZero.position.set(0, CELL_H / 2 + 46 - t * 36);
      vis.intakeZero.alpha = 0.45 * Math.sin(Math.PI * t);
    }

    if (!cell.built) {
      // Sketch-in: trace the stable outline path up to build progress — a real
      // graphite line being drawn, with a pencil tip riding the head.
      vis.outline.clear();
      const sub = subPath(vis.outlinePath, vis.outlineCum, frac);
      strokeWaypoints(vis.outline, sub, { color: GRAPHITE, width: 1.6, alpha: 0.85 });
      const head = sub[sub.length - 1];
      if (head) vis.outline.circle(head.x, head.y, 2).fill({ color: GRAPHITE, alpha: 0.9 });
      vis.glyph.alpha = 0.12 + 0.5 * frac; // the symbol fades in as the box forms
      // BUILD SLOTS: a cell waiting for a pencil shows its place in the queue;
      // a cell awaiting its MATERIAL shows the bill; an ACTIVE build shows its
      // remaining time instead (U1.6b).
      const pos = buildQueuePosition(world, cell.id);
      const slots = currentBuildSlots(world);
      if (cell.materialNeed) {
        setEta(vis, '');
        if (!vis.queueBadge) {
          vis.queueBadge = new Text({
            text: '',
            style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 13, fill: GRAPHITE },
          });
          vis.queueBadge.anchor.set(0.5);
          vis.queueBadge.position.set(0, CELL_H / 2 + 16);
          vis.queueBadge.alpha = 0.55;
          vis.body.addChild(vis.queueBadge);
          note('A sketch awaits its MATERIAL — construct the bill and drop it on the cell.', 'first-bill');
        }
        vis.queueBadge.text = `bill: ${formatScore(cell.materialNeed.min)}`;
      } else if (pos >= slots) {
        setEta(vis, '');
        if (!vis.queueBadge) {
          vis.queueBadge = new Text({
            text: '',
            style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 13, fill: GRAPHITE },
          });
          vis.queueBadge.anchor.set(0.5);
          vis.queueBadge.position.set(0, CELL_H / 2 + 16);
          vis.queueBadge.alpha = 0.55;
          vis.body.addChild(vis.queueBadge);
          note('It must wait its turn — one pencil, one sketch. Fuel may persuade it sooner.', 'first-queue');
        }
        vis.queueBadge.text = `№${pos - slots + 1} in queue`;
      } else {
        if (vis.queueBadge) {
          vis.queueBadge.destroy();
          vis.queueBadge = null;
        }
        setEta(vis, fmtEta(cell.buildWork.sub(cell.buildProgress).toNumber() / GAME_TUNING.baseRate));
      }
    } else if (!vis.builtFlourished) {
      // Snap to the finished cell: filled, rounded outline + a small flourish.
      vis.builtFlourished = true;
      if (vis.queueBadge) {
        vis.queueBadge.destroy();
        vis.queueBadge = null;
      }
      setEta(vis, '');
      vis.outline.clear();
      drawCellOutline(vis.outline);
      vis.glyph.alpha = 1;
      drawPortMarkers(vis.ports, cell.kind);
      juice.punch(vis.body, 0.28);
      juice.burst(cell.x, cell.y, 6, 42);
      sndSnap();
      note('Construction complete. The apparatus is yours to feed.', 'first-build');
      unlockToolsFor(cell.kind);
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
        sndBurn();
        note('Fuel quickens the hand — a real expense, briefly worth it.', 'first-burn');
      }
      vis.prevBurn = burn;
    }

    // Staged-operand readouts (every operator cell): what each port holds.
    // While an op runs, the HELD inputs stay visible — the cell never goes
    // amnesiac about what it's computing on.
    if (cell.built && vis.opLabels.length > 0) {
      for (let i = 0; i < vis.opLabels.length; i++) {
        const v = cell.operands[i] ?? cell.op?.heldInputs[i] ?? null;
        const label = v ? formatScore(valueMagnitude(v)) : '';
        if (vis.opLabels[i].text !== label) vis.opLabels[i].text = label;
      }
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

    // Accelerator: show what its charge can CARRY (powered logistics — covered
    // pipes ferry blocks up to ~the charge), and pulse the halo when charged.
    if (cell.kind === 'accelerator' && vis.info && vis.halo) {
      const boost = cellBoost(cell);
      vis.info.text = cell.charge.gt(1) ? `carries ≤${formatScore(cell.charge)}` : 'idle';
      vis.halo.alpha = 0.12 + 0.012 * Math.min(20, boost);
      return; // accelerators have no op ghost/meter
    }

    // Warehouse: show the stockpile (count · biggest grade). No op ghost/meter.
    if (cell.kind === 'warehouse' && vis.info) {
      let n = 0;
      let biggest: Value | null = null;
      for (const e of cell.store) {
        n += e.count;
        if (!biggest || valueMagnitude(e.value).gt(valueMagnitude(biggest))) biggest = e.value;
      }
      vis.info.text = n === 0 ? 'empty' : `${n} · ≤${formatScore(valueMagnitude(biggest!))}`;
      return;
    }

    // Mill: the gear line (÷N). The op ghost/meter still run below it.
    if (cell.kind === 'mill' && vis.info) {
      vis.info.text = `÷${formatScore(cell.millDivisor)}`;
    }

    // Ledger: the rent line — coverage tells the whole story at a glance.
    if (cell.kind === 'ledger' && vis.info) {
      if (world.inkDemand.lte(0)) vis.info.text = 'no rent due';
      else {
        let n = 0;
        for (const e of cell.store) n += e.count;
        vis.info.text = `rent ${formatScore(world.inkDemand)}/s · ink ${Math.round(world.inkCoverage * 100)}% · ${n} held`;
      }
      return;
    }

    // Output result: the numeral is WRITTEN left-to-right over the op (a reveal
    // mask), with a clock-sweep ring around the operator glyph for progress.
    vis.meter.clear();
    if (!cell.op) {
      if (vis.gradeLabel) vis.gradeLabel.visible = false;
      if (cell.built) setEta(vis, '');
    }
    if (cell.op) {
      // Remaining time at the CURRENT free rate (U1.6a) — honest about fuel:
      // it shows what waiting costs, which is exactly what sells feeding it.
      const opRate = GAME_TUNING.baseRate * (cell.op.amplifier ? GAME_TUNING.amplifierBaseRateScale : 1);
      setEta(vis, fmtEta(cell.op.work.sub(cell.op.progress).toNumber() / Math.max(1e-9, opRate)));
      // Fuel-grade readout (UX_PLAN's #1 finding): a working op pencils its
      // asking denomination beside the fuel socket — under-grade fuel is
      // silently refused by the engine, so SAY the grade up front. Scaffolded
      // ops show their band floor (the working-note minimum).
      const gradeMin = cell.op.scaffold ? cell.op.scaffold.min : cell.op.grade;
      if (gradeMin.gt(1)) {
        if (!vis.gradeLabel) {
          vis.gradeLabel = new Text({
            text: '',
            style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 12, fill: GRAPHITE },
          });
          vis.gradeLabel.anchor.set(0, 0.5);
          vis.gradeLabel.position.set(13, CELL_H / 2 + 1);
          vis.gradeLabel.alpha = 0.6;
          vis.body.addChild(vis.gradeLabel);
        }
        const txt = `≥ ${formatScore(gradeMin)}`;
        if (vis.gradeLabel.text !== txt) vis.gradeLabel.text = txt;
        vis.gradeLabel.visible = true;
      } else if (vis.gradeLabel) {
        vis.gradeLabel.visible = false;
      }
      const f = opFraction(cell);
      const out = cell.op.emits[0]?.value;
      const key = out ? `${out.kind}:${valueMagnitude(out).toString()}` : 'none';
      if (out && vis.ghostKey !== key) {
        if (vis.ghost) vis.ghost.destroy({ children: true });
        if (vis.ghostUnder) vis.ghostUnder.destroy({ children: true });
        vis.ghost = drawValueLabel(out.kind === 'real' ? out : { kind: 'real', n: valueMagnitude(out) }, {
          baseFontSize: 22,
          color: GRAPHITE,
        });
        const L = portLayout(cell.kind);
        // Faint full under-trace from t=0 (U1.7): a long op's numeral is no
        // longer invisible for its first stretch — the wipe stays the signal.
        vis.ghostUnder = drawValueLabel(out.kind === 'real' ? out : { kind: 'real', n: valueMagnitude(out) }, {
          baseFontSize: 22,
          color: GRAPHITE,
        });
        vis.ghostUnder.alpha = 0.13;
        vis.ghostUnder.position.set(L.output.x + 34, L.output.y);
        vis.body.addChild(vis.ghostUnder);
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
        if (cell.op.work.gte(5000)) {
          note('This operation will conclude shortly after the sun does. Fuel it, perhaps.', 'long-op');
        }
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
      // SCAFFOLDING ("show your work"): an exp-tier op demanding working notes
      // draws a second, DASHED outer ring for notes-paid progress. Unpaid notes
      // hold the op open even at full clock — the ring is the tell.
      if (cell.op.scaffold && cell.op.fuelRequired.gt(0)) {
        if (!vis.hadScaffold) {
          vis.hadScaffold = true;
          note(
            `It demands to see the work: provide notes between ${formatScore(cell.op.scaffold.min)} and ${formatScore(cell.op.scaffold.cap)}. Your finished results will be refused.`,
            'first-scaffold',
          );
        }
        const paid = Math.min(1, cell.op.fuelPaid.div(cell.op.fuelRequired).toNumber());
        const R2 = 25;
        // dashed base ring
        for (let k = 0; k < 12; k++) {
          const a0 = (k / 12) * Math.PI * 2 - Math.PI / 2;
          vis.meter.arc(0, 0, R2, a0, a0 + 0.3).stroke({ color: GRAPHITE, width: 1, alpha: 0.18 });
        }
        if (paid > 0.001) {
          vis.meter
            .arc(0, 0, R2, -Math.PI / 2, -Math.PI / 2 + paid * Math.PI * 2)
            .stroke({ color: GRAPHITE, width: 2.2, alpha: 0.65 });
        }
      }
    } else if (vis.ghost) {
      // Op just completed (ghost present, op now null): pop the cell and spray a
      // few shavings at the output where the result was written.
      vis.ghost.destroy({ children: true });
      vis.ghost = null;
      if (vis.ghostUnder) {
        vis.ghostUnder.destroy({ children: true });
        vis.ghostUnder = null;
      }
      vis.ghostKey = '';
      vis.ghostMask = null;
      vis.ghostBounds = null;
      juice.punch(vis.body, 0.18);
      const L = portLayout(cell.kind);
      juice.burst(cell.x + L.output.x, cell.y + L.output.y, 5, 50);
      note('The first computation resolves. The numbers begin.', 'first-op');
      if (vis.hadScaffold) {
        // a PAID launch resolving is the milestone beat of the whole economy
        vis.hadScaffold = false;
        juice.flash(cell.x, cell.y);
        sndMilestone();
        note('The work is shown; the result follows. Adequate.', 'first-launch');
      }
    }

    // Idle states: a built cell with no op shows drop-zone hints on its empty
    // operand ports (it's waiting for input). If SOME operands are staged but
    // not all, the missing port(s) PULSE — the "waiting on the other operand"
    // (starving) state, distinct from a fully-empty idle cell.
    vis.idleHint.clear();
    const arity = operandArity(cell.kind);
    if (cell.built && !cell.op && arity > 0 && cell.kind !== 'accelerator' && !lodActive) {
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

    // Zoom LOD (U2.4): below ~0.5× the detail layer hides — outline, glyph and
    // the clock ring carry the state; labels, ports and spouts are sub-pixel
    // noise at altitude. This is what makes the engaged factory a readable board.
    vis.ports.visible = !lodActive;
    if (vis.intakeZero) vis.intakeZero.visible = !lodActive;
    for (const t of vis.opLabels) t.visible = !lodActive;
    if (vis.gradeLabel) vis.gradeLabel.visible = vis.gradeLabel.visible && !lodActive;
    if (vis.etaLabel) vis.etaLabel.visible = vis.etaLabel.visible && !lodActive;
    if (vis.queueBadge) vis.queueBadge.visible = !lodActive;
    if (vis.ghost) vis.ghost.visible = !lodActive;
    if (vis.ghostUnder) vis.ghostUnder.visible = !lodActive;
  }

  function makeBlockVisual(id: number, value: Value, count: number): BlockVisual {
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
    drawHeaviness(g, BLOCK_R, blockHeaviness(value)); // heavy numbers read frozen/dense
    body.addChild(g);

    const label = drawValueLabel(value.kind === 'real' ? value : { kind: 'real', n: valueMagnitude(value) }, {
      baseFontSize: 24,
      color: GRAPHITE,
    });
    // Contrast guarantee (U2.2): a paper underlay behind the numeral so the
    // value always wins over the heaviness hatch — reading your big numbers
    // IS the fantasy; the frozen metaphor stays underneath it.
    const lb = label.getLocalBounds();
    if (lb.width > 0.5) {
      const under = new Graphics();
      under.roundRect(lb.x - 3, lb.y - 1, lb.width + 6, lb.height + 2, 3).fill({ color: 0xfbf7ee, alpha: 0.82 });
      body.addChild(under);
    }
    body.addChild(label);
    // Altitude swap-in (U2.4): magnitude only, big and blunt — "e22".
    const mag = valueMagnitude(value);
    const magNum = mag.toNumber();
    const lodStr = !Number.isFinite(magNum)
      ? 'e↑↑'
      : magNum >= 1e4
        ? `e${Math.floor(Math.log10(magNum))}`
        : `${Math.round(magNum)}`;
    const lodText = new Text({
      text: lodStr,
      style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 26, fontWeight: '600', fill: GRAPHITE },
    });
    lodText.anchor.set(0.5);
    lodText.visible = false;
    body.addChild(lodText);

    // `×N` stack count, lower-right corner just outside the block (clear of the
    // centred numeral). Penciled, like a margin tally; hidden when count ≤ 1.
    const badge = new Text({
      text: '',
      style: { fontFamily: PENCIL_FONT_FAMILY, fontSize: 16, fontWeight: '600', fill: GRAPHITE },
    });
    badge.anchor.set(1, 1);
    badge.position.set(BLOCK_R + 6, BLOCK_R + 11);
    body.addChild(badge);
    root.addChild(body);

    root.on('pointerdown', (e) => {
      e.stopPropagation();
      // A selected stack grabs the whole SET (U3.1 group move).
      if (selBlocks.has(id) && selectionSize() > 1) {
        beginGroupDrag(canvasPoint(e.global.x, e.global.y));
        return;
      }
      drag = { id, root };
      root.zIndex = 100;
    });

    canvasLayer.addChild(root);
    const vis: BlockVisual = { root, body, badge, lastCount: -1, label, lodText };
    updateBlockBadge(vis, count);
    return vis;
  }

  /** Show/hide the `×N` stack badge for a block's current count. */
  function updateBlockBadge(vis: BlockVisual, count: number): void {
    vis.lastCount = count;
    vis.badge.text = count > 1 ? `×${count}` : '';
    vis.badge.visible = count > 1;
  }

  // --- Ticker --------------------------------------------------------------

  // Magnitude milestones — the first time the frontier crosses each, a flourish
  // fires and the narrator (P4) is notified. Thresholds < 1e308 so the plain
  // `Decimal.gte(number)` works; the tower check uses `.layer`.
  const reachedMilestones = new Set<string>();
  const MILESTONES: { key: string; label: string; hit: (m: ReturnType<typeof valueMagnitude>) => boolean }[] = [
    { key: '1e3', label: 'one thousand', hit: (m) => m.gte(1e3) },
    { key: '1e6', label: 'one million', hit: (m) => m.gte(1e6) },
    { key: '1e9', label: 'one billion', hit: (m) => m.gte(1e9) },
    { key: '1e12', label: 'one trillion', hit: (m) => m.gte(1e12) },
    { key: '1e18', label: 'a quintillion', hit: (m) => m.gte(1e18) },
    { key: '1e30', label: '10³⁰', hit: (m) => m.gte(1e30) },
    { key: '1e60', label: '10⁶⁰', hit: (m) => m.gte(1e60) },
    { key: 'googol', label: 'a googol — 10¹⁰⁰', hit: (m) => m.gte(1e100) },
    { key: 'tower', label: 'a power tower', hit: (m) => m.layer >= 2 },
  ];

  // Progressive tool reveal: building a prerequisite drafts the next apparatus.
  const unlockTool = (tool: Tool, label: string, noteText?: string): void => {
    unlockedTools.update((list) => {
      if (list.includes(tool)) return list;
      note(noteText ?? `New apparatus drafted: ${label}.`, `unlock-${tool}`);
      return [...list, tool];
    });
  };
  function unlockToolsFor(kind: CellKind): void {
    if (kind === 'addition') {
      unlockTool('multiplication', 'Multiplication');
      unlockTool('warehouse', 'a Warehouse (stockpile spare numbers)');
    }
    if (kind === 'multiplication') {
      // Exponentiation is NOT drafted here — it is earned at the one-billion
      // frontier milestone (a produced achievement, not a purchase).
      unlockTool('mill', 'the Mill');
      unlockTool('accelerator', 'the Accelerator');
    }
  }

  let acc = 0;
  let enginePaused = false;
  let speed = 3;
  let elapsedTicks = 0;
  let prevSlots = GAME_TUNING.buildSlots > 0 ? GAME_TUNING.buildSlots : Infinity;
  const unsubSpeed = speedStore.subscribe((s) => (speed = s));
  let monitorAccum = 0;
  // Rate-instrument sampling state (U4.2).
  let rateSampleScore: ReturnType<typeof totalScore> | null = null;
  let rateSampleProduced = 0;
  let rateSampleTick = 0;
  let lastScoreRate = '';
  let lastProduceRate = '';
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
    drawSelection(); // U3.1 halos track their (possibly moving) members
    // Drag-aware drop targets: light the compatible ports while carrying.
    if (drag) {
      const blk = world.pool.find((b) => b.id === drag!.id);
      if (blk) drawDragHints(blk.value);
      else dragHintG.clear();
    } else {
      dragHintG.clear();
    }
    // The river is close-up ambiance: fade it toward invisible as the camera
    // zooms out (U2.1) — at altitude it's pure noise behind the factory.
    const camScale = snapshotCamera().scale;
    river.alpha = Math.max(0, Math.min(1, (camScale - 0.35) / 0.3));
    lodActive = camScale < 0.5;
    juice.step(t.deltaMS); // visual-only, real-time (independent of sim pause/speed)
    scoreStore.set(formatScore(totalScore(world)));
    // Dev monitors — refresh a few times a second (frontier scan is O(pool)).
    monitorAccum += t.deltaMS;
    if (monitorAccum >= 250) {
      monitorAccum = 0;
      const fi = frontierInfo(world);
      frontierStore.set(formatScore(fi.mag));
      // Milestone crossings — flourish at the frontier block + notify the narrator.
      let hit: string | null = null;
      for (const ms of MILESTONES) {
        if (!reachedMilestones.has(ms.key) && ms.hit(fi.mag)) {
          reachedMilestones.add(ms.key);
          hit = ms.label;
          if (ms.key === '1e6') {
            // The earned operator: a million proves the multiplication factory
            // — and a million is exactly exponentiation's asking price (its
            // first MATERIAL bill). The reveal and the puzzle are one number.
            unlockTool(
              'exponentiation',
              'Exponentiation',
              'One million. Exponentiation is drafted — its bill is the very number you just wrote.',
            );
          }
        }
      }
      if (hit) {
        juice.flash(fi.x, fi.y);
        sndMilestone();
        milestoneStore.set(hit);
        note(`The frontier reaches ${hit}.`);
      }
      let working = 0;
      let unbuilt = 0;
      // The two starvation signatures (U4.2) — THE strategic signal: cells
      // idle for OPERANDS want wider production; working amplifiers with no
      // recent burn are crawling UNFUELLED and want fuel/notes.
      let idleOps = 0;
      let crawling = 0;
      for (const c of world.cells.values()) {
        if (c.op) working++;
        if (!c.built) {
          unbuilt++;
          continue;
        }
        if (c.kind === 'warehouse' || c.kind === 'accelerator' || c.kind === 'successor' || c.kind === 'ledger')
          continue;
        if (!c.op) idleOps++;
        else if (c.op.amplifier && c.recentBurn < 0.05) crawling++;
      }
      const bottleneckParts: string[] = [];
      if (world.tuning.upkeepCoeff > 0 && world.inkDemand.gt(0)) {
        // The rent era begins: the Ledger drafts itself the moment ink is owed.
        unlockTool(
          'ledger',
          'the Ledger',
          'The notebook begins to charge rent — holding numbers costs ink. A Ledger is drafted; keep it fed.',
        );
      }
      if (world.tuning.upkeepCoeff > 0 && world.inkDemand.gt(0) && world.inkCoverage < 0.75)
        bottleneckParts.push(`ink at ${Math.round(world.inkCoverage * 100)}% — the ledger runs dry`);
      if (idleOps > 0) bottleneckParts.push(`${idleOps} idle for operands`);
      if (crawling > 0) bottleneckParts.push(`${crawling} crawling unfuelled`);
      // Windowed per-game-second rates (≥2 ticks between samples; survive pause).
      const scoreNow = totalScore(world);
      const dtTicks = elapsedTicks - rateSampleTick;
      if (dtTicks >= 2) {
        if (rateSampleScore) {
          const ds = scoreNow.sub(rateSampleScore);
          lastScoreRate = ds.lte(0) ? '0' : `${formatScore(ds.div(dtTicks))} / s`;
          lastProduceRate = `${Math.max(0, Math.round((world.produced - rateSampleProduced) / dtTicks))} blocks / s`;
        }
        rateSampleScore = scoreNow;
        rateSampleProduced = world.produced;
        rateSampleTick = elapsedTicks;
      }
      const slots = currentBuildSlots(world);
      if (Number.isFinite(slots) && slots > prevSlots) {
        const PENCIL_NOTES: Record<number, string> = {
          2: 'A second pencil. Do try not to smudge.',
          3: 'A third hand joins the margins — irregular, but productive.',
          4: 'Four draftsmen now. The notebook grows crowded.',
        };
        note(PENCIL_NOTES[slots] ?? 'Another draftsman joins the margins.', `slot-${slots}`);
        prevSlots = slots;
      }
      statsStore.set({
        cells: world.cells.size,
        pipes: world.pipes.size,
        loose: world.pool.length,
        elapsed: elapsedTicks,
        working,
        building: Math.min(unbuilt, Number.isFinite(slots) ? slots : unbuilt),
        slots,
        scoreRate: lastScoreRate,
        produceRate: lastProduceRate,
        bottleneck: bottleneckParts.join(' · '),
        ink:
          world.tuning.upkeepCoeff > 0 && world.inkDemand.gt(0)
            ? `${formatScore(world.inkDemand)}/s · ${Math.round(world.inkCoverage * 100)}% covered`
            : '',
      });
      refreshInspector(); // the open card tracks live state
      // Toolbar previews (U1.6c): under the unified law the pencil time is
      // flat per kind — the real price is the MATERIAL bill, so the shelf
      // quotes the bill (the construct-this-number puzzle) before you commit.
      const kindCounts: Record<string, number> = {};
      for (const c of world.cells.values()) kindCounts[c.kind] = (kindCounts[c.kind] ?? 0) + 1;
      const previews: Record<string, string> = {};
      for (const t of TOOL_ORDER) {
        if (t === 'pipe') continue;
        const bill = materialBill(t as CellKind, kindCounts[t] ?? 0, world.peakMagnitude, GAME_TUNING);
        const secs = (UNIFIED_BUILD_TIME[t] ?? 24) * GAME_TUNING.buildTimeScale;
        previews[t] = bill ? `bill ${formatScore(bill.min)}` : fmtEta(secs) || `~${Math.max(1, Math.round(secs))}s`;
      }
      buildPreviews.set(previews);
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
      reset: () => reset(),
      loadPreset: (key: string) => loadPreset(key),
      presets: () => PRESETS.map((p) => p.key),
    };
  }

  // --- Resize --------------------------------------------------------------

  const onResize = (): void => {
    paper.destroy({ children: true });
    paper = drawPaper(app.screen.width, app.screen.height);
    app.stage.addChildAt(paper, 0);
  };
  window.addEventListener('resize', onResize);

  // --- Dev menu: reset + factory presets -----------------------------------

  /** Frame the camera so every cell in the world fits on screen (presets are
   *  wide). Zooms out as needed, clamped to the camera's min scale. */
  function frameWorld(): void {
    const cells = [...world.cells.values()];
    if (cells.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of cells) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    const pad = 220;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    // Frame into the UNOCCUPIED viewport (U2.3): the shelf (left), monitor
    // (right) and river band (bottom) are reserved — a framed factory must
    // never hide underneath the panels.
    const M = { left: 235, right: 235, top: 16, bottom: 125 };
    const availW = Math.max(200, app.screen.width - M.left - M.right);
    const availH = Math.max(200, app.screen.height - M.top - M.bottom);
    const scale = Math.min(1, availW / w, availH / h);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    restoreCamera({ x: M.left + availW / 2 - cx * scale, y: M.top + availH / 2 - cy * scale, scale });
  }

  /** Clear the canvas to an empty world. Visual caches are purged HERE, not
   *  left to the next sync: `resetWorld` recycles ids from 1, so a same-frame
   *  rebuild (loadPreset) would otherwise hand old visuals to new same-id
   *  entities — an exponentiation wearing a `×` glyph (UX_PLAN E1). */
  function reset(): void {
    resetWorld(world);
    for (const [, vis] of cellVisuals) {
      vis.clog?.destroy();
      vis.root.destroy({ children: true });
    }
    cellVisuals.clear();
    for (const [, vis] of blockVisuals) vis.root.destroy({ children: true });
    blockVisuals.clear();
    for (const [, vis] of pipeVisuals) {
      vis.clog?.destroy();
      vis.root.destroy({ children: true });
    }
    pipeVisuals.clear();
    drag = null;
    cellDrag = null;
    pipeSource = null;
    pipeGhost.clear();
    clearSelection(); // also closes the inspector
    reachedMilestones.clear();
    elapsedTicks = 0;
    acc = 0;
    toolStore.set(null);
    unlockedTools.set(['successor', 'addition', 'pipe']);
    restoreCamera({ x: app.screen.width / 2, y: app.screen.height * 0.42, scale: 1 });
  }

  /** Clear, then build a named factory snapshot and frame it. */
  function loadPreset(key: string): void {
    reset();
    world.tuning = GAME_TUNING; // a preset may switch rule-sets (ink district) — start each from the house rules
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    preset.build(world);
    // A loaded factory: unlock the whole toolbar so you can extend it freely.
    unlockedTools.set(['successor', 'addition', 'multiplication', 'exponentiation', 'mill', 'accelerator', 'warehouse', 'ledger', 'pipe']);
    note(`Loaded snapshot: ${preset.label}.`);
    frameWorld();
  }

  return {
    reset,
    loadPreset,
    destroy() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      unsubTool();
      unsubSpeed();
      unsubUnlocked();
      juice.destroy();
      app.destroy(true, { children: true });
    },
  };
}

// --- Drawing helpers -------------------------------------------------------

/** Dashed pencil rectangle PATH (caller strokes) — the marquee + selection halos. */
function dashedRect(g: Graphics, x: number, y: number, w: number, h: number): void {
  const dash = 8;
  const gap = 5;
  const edge = (ax: number, ay: number, bx: number, by: number): void => {
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / (len || 1);
    const uy = (by - ay) / (len || 1);
    for (let d = 0; d < len; d += dash + gap) {
      const e2 = Math.min(d + dash, len);
      g.moveTo(ax + ux * d, ay + uy * d);
      g.lineTo(ax + ux * e2, ay + uy * e2);
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
}

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

/** How "heavy" a value reads, 0..1 — small fuel is light/liquid, big numbers are
 *  frozen. Ramps 0 at magnitude 100 → 1 at 10⁵+ (and any layer≥1 tower). This
 *  is a *visual* echo of the transit law (transit ∝ value^1.5), not a new rule. */
function blockHeaviness(v: Value): number {
  const m = valueMagnitude(v);
  if (m.lte(100)) return 0;
  const digits = m.log10().toNumber();
  if (!Number.isFinite(digits)) return 1; // astronomically large → fully frozen
  return Math.max(0, Math.min(1, (digits - 2) / 3));
}

/** Crosshatch the interior of a block to read as dense/heavy graphite. Denser
 *  and darker the heavier the value. Clipped to the inner square. */
function drawHeaviness(g: Graphics, R: number, h: number): void {
  if (h <= 0.02) return;
  const inner = R - 3;
  const spacing = 14 - 9 * h; // denser when heavier
  for (let o = -2 * inner; o <= 2 * inner; o += spacing) {
    const a0 = Math.max(-inner, -inner - o);
    const a1 = Math.min(inner, inner - o);
    if (a1 > a0) g.moveTo(a0, a0 + o).lineTo(a1, a1 + o); // slope +1
    const b0 = Math.max(-inner, o - inner);
    const b1 = Math.min(inner, o + inner);
    if (b1 > b0) g.moveTo(b0, -b0 + o).lineTo(b1, -b1 + o); // slope -1
  }
  // Alpha capped (U2.2): the hatch is a texture, never a curtain — the
  // numeral's paper underlay + this cap keep big values legible at any zoom.
  g.stroke({ color: GRAPHITE, width: 0.8, alpha: 0.06 + 0.14 * h });
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
  // Warehouses/ledgers have no fuel port (their one input is the deposit operand).
  if (kind !== 'warehouse' && kind !== 'ledger') {
    g.rect(L.fuel.x - 9, L.fuel.y - 9, 18, 18).stroke({ color: GRAPHITE, width: 1.1, alpha: 0.5 });
  }
  // Output nub (not for the Mill's many-piece output — still useful as a hint).
  g.circle(L.output.x, L.output.y, 5).fill({ color: GRAPHITE, alpha: 0.5 });
}

/** Human-scale duration from ticks (1 tick = 1 s). Empty under 10s — short
 *  waits don't need a caption; the meters carry them. */
function fmtEta(ticks: number): string {
  if (!Number.isFinite(ticks) || ticks < 10) return '';
  if (ticks < 90) return `~${Math.round(ticks)}s`;
  if (ticks < 5400) return `~${Math.round(ticks / 60)}m`;
  if (ticks < 172800) return `~${(ticks / 3600).toFixed(ticks < 36000 ? 1 : 0)}h`;
  if (ticks < 1e8) return `~${Math.round(ticks / 86400)}d`;
  return '~ages'; // the narrator can elaborate
}

/** ONE number language (U4.5): the same pretty ladder the blocks speak —
 *  plain integers, then `1.23×10⁸` with superscript exponents, then the
 *  Decimal tower notation for the truly large. Used by the header, monitor,
 *  inspector, grade labels — everywhere a number meets the DOM or a caption. */
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function supDigits(s: string): string {
  let out = '';
  for (const ch of s) out += ch === '-' ? '⁻' : (SUP[Number(ch)] ?? ch);
  return out;
}
function formatScore(d: ReturnType<typeof totalScore>): string {
  const x = d.toNumber();
  if (!Number.isFinite(x)) return d.toString(); // tower-class → break_eternity's notation
  if (x >= 1e6) {
    const e = Math.floor(Math.log10(x));
    const m = x / Math.pow(10, e);
    return `${m.toFixed(2)}×10${supDigits(String(e))}`;
  }
  return Math.round(x).toLocaleString('en-US');
}

/** The biggest single magnitude anywhere — pool, staged operands, in-progress
 *  outputs — and WHERE it is (world coords), for the milestone flourish. The
 *  real "numbers go big" metric (distinct from Total Score). */
function frontierInfo(world: World): { mag: ReturnType<typeof totalScore>; x: number; y: number } {
  let max = valueMagnitude(valueOf(0));
  let mx = 0;
  let my = 0;
  const consider = (v: Value, x: number, y: number): void => {
    const m = valueMagnitude(v);
    if (m.gt(max)) {
      max = m;
      mx = x;
      my = y;
    }
  };
  for (const b of world.pool) consider(b.value, b.x, b.y);
  for (const c of world.cells.values()) {
    for (const o of c.operands) if (o) consider(o, c.x, c.y);
    if (c.op) {
      for (const h of c.op.heldInputs) consider(h, c.x, c.y);
      for (const e of c.op.emits) consider(e.value, c.x, c.y);
    }
  }
  return { mag: max, x: mx, y: my };
}
