/**
 * Time as Labor — the headless simulation engine.
 *
 * This is the PURE MODEL of the game: cells that take time to build and to
 * operate, pipes that carry blocks over time-and-distance, fuel that buys
 * speed, a loose pool, and Total Score. No Pixi, no Svelte, no DOM — so it
 * runs in `node --test`, can be driven by a future balance sim, and is the
 * single source of truth for *what the game does*. The renderer (src/) will be
 * a thin view that holds a `World`, ticks it, and draws it.
 *
 * Design: TIME_AS_LABOR.md. Cost math: core/time.ts. Number math: core/value.ts.
 *
 * The economy (TIME_AS_LABOR.md §3):
 *   ∞ zeros (free) → Successor (taps the river, the only net-positive source)
 *   → Addition (plumbing) → Multiplication / Exponentiation (amplifiers)
 *   → big numbers that are simultaneously score and fuel, burned back in.
 *
 * Score accounting: Total Score = the magnitude of every block you *possess* —
 * loose pool + staged operands + blocks in transit + the inputs a cell is
 * currently computing on (held until the result replaces them on emit). A
 * fuel block leaves your possession the moment it is burned. Constructive
 * operators are net-positive (output magnitude ≥ inputs), so the score climbs.
 */

import Decimal from 'break_eternity.js';
import { operate } from './cell-types.ts';
import {
  VALUE_ZERO,
  valueMagnitude,
  type Value,
} from './value.ts';
import {
  DEFAULT_TUNING,
  buildWork,
  fuelWork,
  operationWork,
  transitWork,
  type TimeTuning,
} from './time.ts';

/** The constructive operators the prototype ships with (TIME_AS_LABOR.md §1). */
export type CellKind =
  | 'successor'
  | 'addition'
  | 'multiplication'
  | 'exponentiation'
  | 'tetration'
  | 'pentation';

/** Operand ports a kind exposes (Successor taps the free river — 0 operands). */
export function operandArity(kind: CellKind): number {
  return kind === 'successor' ? 0 : 2;
}

/** An operation in progress inside a cell. */
interface ActiveOp {
  /** Inputs consumed when the op started — held (counted toward score) until
   *  the result replaces them on emit, so score never dips mid-computation. */
  heldInputs: Value[];
  /** The emit events the op will produce once progress reaches work. */
  emits: { portIndex: number; value: Value }[];
  work: Decimal;
  progress: Decimal;
}

export interface SimCell {
  id: number;
  kind: CellKind;
  x: number;
  y: number;
  /** Construction state. The cell is inert (won't stage/fire) until built. */
  built: boolean;
  buildProgress: Decimal;
  buildWork: Decimal;
  /** Staged operands (one slot per operand port); null = empty. */
  operands: (Value | null)[];
  /** The current operation, or null when idle. */
  op: ActiveOp | null;
}

export interface SimPipe {
  id: number;
  fromCell: number;
  fromPort: number;
  toCell: number;
  /** Destination operand-port index, or -1 for the fuel intake. */
  toPort: number;
  fuel: boolean;
  inFlight: { value: Value; work: Decimal; progress: Decimal } | null;
}

/**
 * A loose block sitting on the canvas. Position is a first-class simulation
 * concept (distance affects transport), and the view needs identity to render
 * and drag individual blocks — so loose blocks carry both.
 */
export interface LooseBlock {
  id: number;
  value: Value;
  x: number;
  y: number;
}

export interface World {
  tuning: TimeTuning;
  cells: Map<number, SimCell>;
  pipes: Map<number, SimPipe>;
  /** Loose blocks on the canvas (outputs with nowhere to go). */
  pool: LooseBlock[];
  nextId: number;
}

export function createWorld(tuning: TimeTuning = DEFAULT_TUNING): World {
  return { tuning, cells: new Map(), pipes: new Map(), pool: [], nextId: 1 };
}

/** Materialise a loose block at a position. Internal + setup helper. */
function pushLoose(world: World, value: Value, x: number, y: number): LooseBlock {
  const block: LooseBlock = { id: world.nextId++, value, x, y };
  world.pool.push(block);
  return block;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Place a cell; it begins construction (inert until built). Build work scales
 *  with how many of that kind already exist (the RTS repurchase, in time). */
export function placeCell(world: World, kind: CellKind, x = 0, y = 0): number {
  let owned = 0;
  for (const c of world.cells.values()) if (c.kind === kind) owned++;
  const id = world.nextId++;
  world.cells.set(id, {
    id,
    kind,
    x,
    y,
    built: false,
    buildProgress: Decimal.dZero,
    buildWork: buildWork(owned, world.tuning),
    operands: new Array(operandArity(kind)).fill(null),
    op: null,
  });
  return id;
}

/** Connect a source cell's output to a destination operand port (or fuel
 *  intake when `fuel` is true). Returns the pipe id. */
export function placePipe(
  world: World,
  fromCell: number,
  fromPort: number,
  toCell: number,
  toPort: number,
  opts: { fuel?: boolean } = {},
): number {
  const id = world.nextId++;
  world.pipes.set(id, {
    id,
    fromCell,
    fromPort,
    toCell,
    toPort: opts.fuel ? -1 : toPort,
    fuel: !!opts.fuel,
    inFlight: null,
  });
  return id;
}

/** Manually stage an operand on a built cell's port (models a hand-drop). */
export function feedOperand(world: World, cellId: number, port: number, value: Value): boolean {
  const cell = world.cells.get(cellId);
  if (!cell || !cell.built) return false;
  if (port < 0 || port >= cell.operands.length) return false;
  if (cell.operands[port] !== null) return false;
  cell.operands[port] = value;
  return true;
}

/** Manually burn a fuel block into a cell (models a hand-drop on the fuel port).
 *  Applies to whatever work is active (build or op); if the cell is idle the
 *  block is returned to the loose pool rather than wasted. */
export function injectFuel(world: World, cellId: number, value: Value): void {
  const cell = world.cells.get(cellId);
  if (!cell) {
    pushLoose(world, value, 0, 0);
    return;
  }
  applyFuel(world, cell, value);
}

/** Drop a loose block onto the canvas (setup / manual play). Returns its id. */
export function addLoose(world: World, value: Value, x = 0, y = 0): number {
  return pushLoose(world, value, x, y).id;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/** Advance the whole world by `dt` ticks (default 1). Deterministic. */
export function tick(world: World, dt = 1): void {
  const base = world.tuning.baseRate * dt;
  tickConstruction(world, base);
  tickOperations(world, base);
  tickPipes(world, base);
}

function tickConstruction(world: World, base: number): void {
  for (const cell of world.cells.values()) {
    if (cell.built) continue;
    cell.buildProgress = cell.buildProgress.add(base);
    if (cell.buildProgress.gte(cell.buildWork)) {
      cell.buildProgress = cell.buildWork;
      cell.built = true;
    }
  }
}

function tickOperations(world: World, base: number): void {
  for (const cell of world.cells.values()) {
    if (!cell.built) continue;

    // Start an op if idle and ready.
    if (cell.op === null) {
      if (cell.kind === 'successor') {
        // Taps the river: a free zero in, a 1 out. Always ready.
        startOp(world, cell, [VALUE_ZERO]);
      } else if (cell.operands.every((o) => o !== null)) {
        const inputs = cell.operands as Value[];
        cell.operands = new Array(cell.operands.length).fill(null);
        startOp(world, cell, inputs);
      }
    }

    // Advance an active op.
    if (cell.op !== null) {
      cell.op.progress = cell.op.progress.add(base);
      if (cell.op.progress.gte(cell.op.work)) {
        for (const e of cell.op.emits) emit(world, cell, e.portIndex, e.value);
        cell.op = null;
      }
    }
  }
}

function startOp(world: World, cell: SimCell, inputs: Value[]): void {
  const result = operate(cell.kind, inputs);
  const emits = result.emits.map((e) => ({ portIndex: e.portIndex, value: e.value }));
  // Work = the cost of writing the result (the largest emit). An empty result
  // (a refusal) still "completes" at the floor so the cell doesn't deadlock,
  // but emits nothing.
  const work = emits.length
    ? emits.reduce((mx, e) => Decimal.max(mx, operationWork(e.value, world.tuning)), Decimal.dZero)
    : new Decimal(world.tuning.opWorkFloor);
  cell.op = { heldInputs: inputs, emits, work, progress: Decimal.dZero };
}

/** Route an emitted block: into an attached empty pipe, else the loose pool. */
function emit(world: World, cell: SimCell, port: number, value: Value): void {
  for (const pipe of world.pipes.values()) {
    if (pipe.fromCell === cell.id && pipe.fromPort === port && pipe.inFlight === null) {
      const dist = pipeDistance(world, pipe);
      pipe.inFlight = { value, work: transitWork(value, dist, world.tuning), progress: Decimal.dZero };
      return;
    }
  }
  pushLoose(world, value, cell.x + 60, cell.y);
}

function tickPipes(world: World, base: number): void {
  for (const pipe of world.pipes.values()) {
    if (pipe.inFlight === null) continue;
    pipe.inFlight.progress = pipe.inFlight.progress.add(base);
    if (pipe.inFlight.progress.gte(pipe.inFlight.work)) {
      deliver(world, pipe, pipe.inFlight.value);
      pipe.inFlight = null;
    }
  }
}

function deliver(world: World, pipe: SimPipe, value: Value): void {
  const dest = world.cells.get(pipe.toCell);
  if (!dest) {
    pushLoose(world, value, 0, 0);
    return;
  }
  if (pipe.fuel) {
    applyFuel(world, dest, value);
    return;
  }
  // Operand delivery: stage if the port is free, else spill to the pool
  // (back-pressure — the upstream block waits as a loose block).
  if (dest.built && pipe.toPort >= 0 && pipe.toPort < dest.operands.length && dest.operands[pipe.toPort] === null) {
    dest.operands[pipe.toPort] = value;
  } else {
    pushLoose(world, value, dest.x - 60, dest.y);
  }
}

/** Burn a fuel block: push progress on the cell's active work. Idle → pool. */
function applyFuel(world: World, cell: SimCell, value: Value): void {
  const chunk = fuelWork(value, world.tuning);
  if (!cell.built) {
    cell.buildProgress = cell.buildProgress.add(chunk);
    if (cell.buildProgress.gte(cell.buildWork)) {
      cell.buildProgress = cell.buildWork;
      cell.built = true;
    }
    return;
  }
  if (cell.op !== null) {
    cell.op.progress = cell.op.progress.add(chunk);
    return;
  }
  // No active work to accelerate — the block isn't wasted, it lands loose.
  pushLoose(world, value, cell.x, cell.y + 40);
}

function pipeDistance(world: World, pipe: SimPipe): number {
  const a = world.cells.get(pipe.fromCell);
  const b = world.cells.get(pipe.toCell);
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Total Score: the magnitude of every block you currently possess. */
export function totalScore(world: World): Decimal {
  let sum = Decimal.dZero;
  for (const b of world.pool) sum = sum.add(valueMagnitude(b.value));
  for (const cell of world.cells.values()) {
    for (const o of cell.operands) if (o) sum = sum.add(valueMagnitude(o));
    if (cell.op) for (const h of cell.op.heldInputs) sum = sum.add(valueMagnitude(h));
  }
  for (const pipe of world.pipes.values()) {
    if (pipe.inFlight) sum = sum.add(valueMagnitude(pipe.inFlight.value));
  }
  return sum;
}

/** Count loose-pool blocks whose magnitude equals `target` (test convenience). */
export function poolCountOf(world: World, target: number): number {
  const t = new Decimal(target);
  let count = 0;
  for (const b of world.pool) if (valueMagnitude(b.value).eq(t)) count++;
  return count;
}

/** Total number of loose blocks in the pool. */
export function poolSize(world: World): number {
  return world.pool.length;
}

export function getCell(world: World, id: number): SimCell | undefined {
  return world.cells.get(id);
}

/** Remove a loose block by id and return it (for the view's drag pickup). */
export function takeLooseById(world: World, id: number): LooseBlock | null {
  const idx = world.pool.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  return world.pool.splice(idx, 1)[0];
}

/** Reposition a loose block (the view dragging it around the canvas). */
export function moveLoose(world: World, id: number, x: number, y: number): void {
  const b = world.pool.find((b) => b.id === id);
  if (b) {
    b.x = x;
    b.y = y;
  }
}

/** Fraction of a cell's construction complete, 0..1. */
export function buildFraction(cell: SimCell): number {
  if (cell.built) return 1;
  if (cell.buildWork.lte(0)) return 1;
  return Math.min(1, cell.buildProgress.div(cell.buildWork).toNumber());
}

/** Fraction of a cell's current operation complete, 0..1 (0 when idle). */
export function opFraction(cell: SimCell): number {
  if (!cell.op || cell.op.work.lte(0)) return 0;
  return Math.min(1, cell.op.progress.div(cell.op.work).toNumber());
}
