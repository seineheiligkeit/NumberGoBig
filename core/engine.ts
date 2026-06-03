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
  fuelValue,
  magnitudeDigits,
  minFuelDenomination,
  operationWork,
  transitWork,
  type TimeTuning,
} from './time.ts';

/** The constructive operators + the two reprocessing objects. */
export type CellKind =
  | 'successor'
  | 'addition'
  | 'multiplication'
  | 'exponentiation'
  | 'tetration'
  | 'pentation'
  | 'mill' // additive splitter — liquefies a block into a graded fuel stream
  | 'accelerator'; // beacon — burns fuel to boost surrounding pipe throughput

/** Operator kinds that go through core `operate()` (== the `CellType` union). */
type OperatorKind = Exclude<CellKind, 'mill' | 'accelerator'>;

/** True for the constructive operator cells (those that go through operate()). */
function isOperator(kind: CellKind): kind is OperatorKind {
  return kind !== 'mill' && kind !== 'accelerator';
}

/** Operand ports a kind exposes (Successor taps the free river — 0 operands). */
export function operandArity(kind: CellKind): number {
  if (kind === 'successor' || kind === 'accelerator') return 0;
  if (kind === 'mill') return 1;
  return 2;
}

/** How many equal pieces a Mill splits a block into per pass (chain to grind
 *  finer). Score-conserved: N pieces of V/N sum to V. */
export const MILL_PIECES = 8;

const ACCEL_RADIUS = 260; // pipes within this distance of an accelerator are boosted
const ACCEL_GAIN = 2.5; // boost = 1 + GAIN·log10(charge+1), capped
const ACCEL_MAX_BOOST = 24;
const ACCEL_DECAY = 0.996; // charge drained per tick (slow fade)

/** An operation in progress inside a cell. */
interface ActiveOp {
  /** Inputs consumed when the op started — held (counted toward score) until
   *  the result replaces them on emit, so score never dips mid-computation. */
  heldInputs: Value[];
  /** The emit events the op will produce once progress reaches work. */
  emits: { portIndex: number; value: Value }[];
  work: Decimal;
  progress: Decimal;
  /** Minimum fuel denomination this op accepts (fuel grade). */
  grade: Decimal;
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
  /** Accelerator only: stored fuel value, providing the boost; decays per tick. */
  charge: Decimal;
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
    charge: Decimal.dZero,
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
  tickAccelerators(world);
  tickPipes(world, base);
}

/** Accelerators drain their charge slowly each tick (it provides the boost). */
function tickAccelerators(world: World): void {
  for (const cell of world.cells.values()) {
    if (cell.kind !== 'accelerator' || !cell.built) continue;
    if (cell.charge.gt(Decimal.dZero)) cell.charge = cell.charge.mul(ACCEL_DECAY);
  }
}

/** A built accelerator's transit boost, from its stored charge. */
function acceleratorBoost(charge: Decimal): number {
  if (charge.lte(Decimal.dZero)) return 1;
  const b = 1 + ACCEL_GAIN * charge.add(1).log10().toNumber();
  return Math.min(ACCEL_MAX_BOOST, b);
}

/** Max boost from any built accelerator covering a pipe's midpoint. */
function pipeBoost(world: World, pipe: SimPipe): number {
  const a = world.cells.get(pipe.fromCell);
  const b = world.cells.get(pipe.toCell);
  if (!a || !b) return 1;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  let boost = 1;
  for (const cell of world.cells.values()) {
    if (cell.kind !== 'accelerator' || !cell.built) continue;
    if (Math.hypot(cell.x - mx, cell.y - my) <= ACCEL_RADIUS) {
      boost = Math.max(boost, acceleratorBoost(cell.charge));
    }
  }
  return boost;
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
    if (cell.kind === 'accelerator') continue; // handled in tickAccelerators

    // Start an op if idle and ready.
    if (cell.op === null) {
      if (cell.kind === 'successor') {
        // Taps the river: a free zero in, a 1 out. Always ready.
        startOp(world, cell, [VALUE_ZERO]);
      } else if (cell.operands.length > 0 && cell.operands.every((o) => o !== null)) {
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

/** The Mill's additive split: N equal pieces summing to the input (conserved).
 *  Pieces below value 1 aren't worth splitting further — pass through. */
function millEmits(v: Value): { portIndex: number; value: Value }[] {
  const mag = valueMagnitude(v);
  if (mag.lte(Decimal.dOne)) return [{ portIndex: 0, value: v }];
  const piece = mag.div(MILL_PIECES);
  const out: { portIndex: number; value: Value }[] = [];
  for (let i = 0; i < MILL_PIECES; i++) out.push({ portIndex: 0, value: { kind: 'real', n: piece } });
  return out;
}

function startOp(world: World, cell: SimCell, inputs: Value[]): void {
  let emits: { portIndex: number; value: Value }[];
  if (cell.kind === 'mill') {
    // Liquefy: split the input into a graded fuel stream (score-conserved).
    emits = millEmits(inputs[0]);
  } else if (isOperator(cell.kind)) {
    emits = operate(cell.kind, inputs).emits.map((e) => ({ portIndex: e.portIndex, value: e.value }));
  } else {
    emits = []; // accelerators never reach startOp
  }
  // Labor: milling is cheap processing (≈ digits of the input); a constructive
  // op is digits(output)^k for its operator. Empty result still completes at
  // the floor so the cell never deadlocks.
  const work =
    cell.kind === 'mill'
      ? Decimal.max(magnitudeDigits(inputs[0]), new Decimal(world.tuning.opWorkFloor))
      : emits.length
        ? emits.reduce((mx, e) => Decimal.max(mx, operationWork(e.value, cell.kind, world.tuning)), Decimal.dZero)
        : new Decimal(world.tuning.opWorkFloor);
  cell.op = {
    heldInputs: inputs,
    emits,
    work,
    progress: Decimal.dZero,
    grade: minFuelDenomination(work, world.tuning),
  };
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
    // In-flight blocks advance at base × any covering accelerator's boost.
    const step = base * pipeBoost(world, pipe);
    pipe.inFlight.progress = pipe.inFlight.progress.add(step);
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

/**
 * Burn a fuel block: its VALUE pushes progress on the cell's active work.
 *  - Building cells accept any fuel (construction is grade-agnostic).
 *  - A working op accepts fuel only at or above its grade (min denomination);
 *    sub-grade fuel is refused and returned loose. Surplus beyond completion is
 *    wasted (the op caps at its work) — so right-sizing the denomination
 *    matters, which is what motivates the Mill.
 *  - An idle cell returns the block loose (nothing to accelerate).
 */
function applyFuel(world: World, cell: SimCell, value: Value): void {
  const fv = fuelValue(value);
  // An accelerator stores fuel as charge — including a whole big number dropped
  // in as a "power cell" (its huge value = a huge, long-fading boost).
  if (cell.kind === 'accelerator') {
    cell.charge = cell.charge.add(fv);
    return;
  }
  if (!cell.built) {
    cell.buildProgress = cell.buildProgress.add(fv);
    if (cell.buildProgress.gte(cell.buildWork)) {
      cell.buildProgress = cell.buildWork;
      cell.built = true;
    }
    return;
  }
  if (cell.op !== null) {
    if (fv.gte(cell.op.grade)) {
      cell.op.progress = Decimal.min(cell.op.work, cell.op.progress.add(fv));
    } else {
      // Too small a denomination for this op — refused, lands loose.
      pushLoose(world, value, cell.x, cell.y + 40);
    }
    return;
  }
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

/** An accelerator's current transit boost (1 = none), for the view. */
export function cellBoost(cell: SimCell): number {
  return cell.kind === 'accelerator' ? acceleratorBoost(cell.charge) : 1;
}

/** Accelerator coverage radius (canvas px), for the view's halo. */
export const ACCELERATOR_RADIUS = ACCEL_RADIUS;
