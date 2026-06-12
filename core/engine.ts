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
  valueKey,
  valueMagnitude,
  type Value,
} from './value.ts';
import {
  DEFAULT_TUNING,
  BUILD_SLOT_MILESTONES,
  buildWork,
  fuelTax,
  fuelValue,
  magnitudeDigits,
  minFuelDenomination,
  operationWork,
  scaffoldRequirement,
  transitWork,
  unifiedNeed,
  unifiedTier,
  unifiedBand,
  materialBill,
  unifiedBuildSlots,
  UNIFIED_BUILD_TIME,
  UNIFIED_NOTES_FLOOR,
  type TimeTuning,
} from './time.ts';

/** The constructive operators + the reprocessing/storage objects. */
export type CellKind =
  | 'successor'
  | 'addition'
  | 'multiplication'
  | 'exponentiation'
  | 'tetration'
  | 'pentation'
  | 'mill' // additive splitter — liquefies a block into a graded fuel stream
  | 'accelerator' // beacon — burns fuel to boost surrounding pipe throughput
  | 'warehouse'; // any-block store — pipe blocks in to stockpile, pipe out later for fuel

/** Non-operator kinds (don't go through core `operate()`). */
type NonOperator = 'mill' | 'accelerator' | 'warehouse';
/** Operator kinds that go through core `operate()` (== the `CellType` union). */
type OperatorKind = Exclude<CellKind, NonOperator>;

/** True for the constructive operator cells (those that go through operate()). */
function isOperator(kind: CellKind): kind is OperatorKind {
  return kind !== 'mill' && kind !== 'accelerator' && kind !== 'warehouse';
}

/** Operand ports a kind exposes (Successor taps the free river — 0 operands). */
export function operandArity(kind: CellKind): number {
  if (kind === 'successor' || kind === 'accelerator') return 0;
  if (kind === 'mill' || kind === 'warehouse') return 1; // one deposit/input port
  return 2;
}

/** The Mill splits toward this fuel grade (value per piece), capped at
 *  MILL_MAX_PIECES per pass. So a small/medium block liquefies in one pass; a
 *  huge block is coarsened (chain mills to grind finer). Score-conserved. */
export const MILL_TARGET_GRADE = 100;
export const MILL_MAX_PIECES = 16;

const ACCEL_RADIUS = 260; // pipes within this distance of an accelerator are boosted
const ACCEL_GAIN = 2.5; // boost = 1 + GAIN·log10(charge+1), capped
const ACCEL_MAX_BOOST = 24;
const ACCEL_DECAY = 0.996; // charge drained per tick (slow fade)

/** Identical loose blocks within this radius of a spawn/drop point merge into a
 *  single stack (when the world has stacking on — the live game). Keeps an
 *  un-piped producer's output one movable pile, and bounds the pool. */
const STACK_MERGE_RADIUS = 40;
/** How far right of a cell its un-piped output spills. Must clear the view's
 *  output nub (the pipe source, at CELL_W/2 = 50px) plus a block-radius, so the
 *  port stays clickable/wireable and the result isn't hidden behind the block. */
const OUTPUT_SPILL_OFFSET = 100;

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
  /** Fuel-magnitude that MUST be burned for this op to complete (the fuel tax,
   *  or an exp-tier op's SCAFFOLDING requirement). baseRate advances `progress`
   *  (time) but never this; only burned fuel does. 0 when off. */
  fuelRequired: Decimal;
  /** Fuel-magnitude burned into this op so far (toward `fuelRequired`). */
  fuelPaid: Decimal;
  /** Scaffolding denomination band (exp-tier ops, when scaffolding is on):
   *  fuel is accepted ONLY in [min, cap]. Blocks above the cap are refused
   *  outright — your finished result is not scratch paper — which is what
   *  forces every launch to be paid with a freshly mult-produced SET (and
   *  protects the player from fat-fingering their frontier into the cell).
   *  Null = no band (the normal grade-only fuel rules). */
  scaffold: { min: Decimal; cap: Decimal } | null;
  /** UNIFIED law only: the op's universal fuel need √(output). In-band fuel
   *  pays PRO-RATA (progress += work·v/need); paying the full need completes
   *  the work. Null in legacy mode. */
  unifiedNeed: Decimal | null;
  /** True for amplifier ops (multiplication and up). When tuning.amplifierFuelOnly
   *  is set, these accrue NO baseRate — fuel is mandatory. */
  amplifier: boolean;
  /** WRITE-TIME FLOOR: ticks this op has been running, and the minimum ticks
   *  it must run (digits(output)/writeSpeed) regardless of fuel. The cell
   *  still has to WRITE the number — fuel can't buy ink speed. 0 = no floor. */
  elapsed: number;
  minTicks: number;
}

/** An op is done only when its TIME work is met AND its fuel tax is paid AND
 *  it has run at least its write-time floor. With the tax and floor off this
 *  is just `progress ≥ work`, as before. */
function opSatisfied(op: ActiveOp): boolean {
  return op.progress.gte(op.work) && op.fuelPaid.gte(op.fuelRequired) && op.elapsed >= op.minTicks;
}

/** Read helper for the agent/view: is this cell's op fully satisfied (time +
 *  tax)? False when idle. */
export function opComplete(cell: SimCell): boolean {
  return cell.op !== null && opSatisfied(cell.op);
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
  /** Warehouse only: the stockpile (stacked by value). Blocks piped in are added;
   *  blocks piped out (largest-first) are withdrawn. Counts toward Total Score. */
  store: { value: Value; count: number }[];
  /** Round-robin cursor over this cell's attached output pipes (fair fan-out). */
  emitCursor: number;
  /** Back-pressure: true when the last emit had output pipes but all were full
   *  (output bandwidth-bound → result spilled loose). False for a terminal cell
   *  with no output pipe (spilling there is by design, not a clog). View-read. */
  outputStalled: boolean;
  /** A 0..1 "is this cell being actively fueled" glow — set to 1 when fuel is
   *  burned into it, decaying each tick. The view draws fuelled cells darker
   *  (graphite weight = fuel gauge). View-read. */
  recentBurn: number;
  /** UNIFIED law only: the MATERIAL this cell still demands before its pencil
   *  starts — one block in the tight band [min, max] deposited on the cell.
   *  Null = paid (or waived/legacy). An unpaid cell neither builds nor holds
   *  a pencil slot. */
  materialNeed: { min: Decimal; max: Decimal } | null;
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
  /** Back-pressure: true when this (operand) pipe's last delivery couldn't be
   *  staged (dest port occupied / cell busy) and spilled loose. View-read. */
  stalled: boolean;
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
  /** A stack of `count` identical blocks sharing one position. Spawns and drops
   *  merge into a nearby same-value stack (when the world has stacking on), so an
   *  un-piped producer makes one movable pile instead of an invisible heap — and
   *  the pool can't explode into thousands of entities. Economically a no-op: a
   *  stack of N is exactly N blocks for Total Score and pool counts. */
  count: number;
}

export interface World {
  tuning: TimeTuning;
  cells: Map<number, SimCell>;
  pipes: Map<number, SimPipe>;
  /** Loose blocks on the canvas (outputs with nowhere to go). */
  pool: LooseBlock[];
  nextId: number;
  /** When true, spawns/drops of identical co-located blocks merge into one
   *  stack (the live game — see LooseBlock.count). Off by default so the balance
   *  sims keep managing the pool as individual blocks exactly as before. */
  stacking: boolean;
  /** Lifetime counters (stats for the monitor / session reports — never read
   *  by the simulation itself): blocks emitted by cells, and total fuel
   *  MAGNITUDE burned (ops + builds + accelerator charge absorbed). */
  produced: number;
  burned: Decimal;
  /** The largest magnitude ever produced/held — drives milestone-gated rules
   *  (build slots). Milestones don't un-happen, so this never decreases. */
  peakMagnitude: Decimal;
  /** THE INK TAX: smoothed coverage of the upkeep demand (EMA of paid/demand,
   *  in [0, 1]; 1 when the tax is off or fully paid). Throttles writeSpeed and
   *  amplifier baseRate via max(upkeepThrottleFloor, inkCoverage). */
  inkCoverage: number;
  /** Last tick's upkeep demand (magnitude/tick) — telemetry for the monitor. */
  inkDemand: Decimal;
}

export function createWorld(
  tuning: TimeTuning = DEFAULT_TUNING,
  opts: { stacking?: boolean } = {},
): World {
  return {
    tuning,
    cells: new Map(),
    pipes: new Map(),
    pool: [],
    nextId: 1,
    stacking: !!opts.stacking,
    produced: 0,
    burned: Decimal.dZero,
    peakMagnitude: Decimal.dZero,
    inkCoverage: 1,
    inkDemand: Decimal.dZero,
  };
}

/** Empty a world in place (keeping its tuning + stacking flag). The view holds
 *  the `World` by reference, so a dev "reset"/preset-load clears it here and lets
 *  the next render sync tear down the now-orphaned visuals. */
export function resetWorld(world: World): void {
  world.cells.clear();
  world.pipes.clear();
  world.pool.length = 0;
  world.nextId = 1;
  world.produced = 0;
  world.burned = Decimal.dZero;
  world.peakMagnitude = Decimal.dZero;
  world.inkCoverage = 1;
  world.inkDemand = Decimal.dZero;
}

/** Materialise `count` loose blocks at a position. When the world has stacking
 *  on, merge into the nearest same-value stack within STACK_MERGE_RADIUS instead
 *  of adding a new entity (so producers pile into one movable stack). Internal +
 *  setup helper. */
function pushLoose(world: World, value: Value, x: number, y: number, count = 1): LooseBlock {
  world.peakMagnitude = Decimal.max(world.peakMagnitude, valueMagnitude(value));
  if (world.stacking) {
    const key = valueKey(value);
    let best: LooseBlock | null = null;
    let bestD = STACK_MERGE_RADIUS;
    for (const b of world.pool) {
      if (valueKey(b.value) !== key) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d <= bestD) {
        bestD = d;
        best = b;
      }
    }
    if (best) {
      best.count += count;
      return best;
    }
  }
  const block: LooseBlock = { id: world.nextId++, value, x, y, count };
  world.pool.push(block);
  return block;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Place a cell; it begins construction (inert until built). Build work scales
 *  with how many of that kind already exist (the RTS repurchase, in time).
 *  `opts.built` places it already finished (no construction) — used by dev/test
 *  factory presets that snapshot a stage rather than build it in real time. */
export function placeCell(
  world: World,
  kind: CellKind,
  x = 0,
  y = 0,
  opts: { built?: boolean } = {},
): number {
  let owned = 0;
  for (const c of world.cells.values()) if (c.kind === kind) owned++;
  const id = world.nextId++;
  // UNIFIED law: flat per-kind pencil time — the MATERIAL is the project.
  const work = world.tuning.unifiedCosts
    ? new Decimal(UNIFIED_BUILD_TIME[kind] ?? 24)
    : buildWork(owned, world.tuning);
  const material =
    world.tuning.unifiedCosts && !opts.built ? materialBill(kind, owned, world.peakMagnitude) : null;
  world.cells.set(id, {
    id,
    kind,
    x,
    y,
    built: !!opts.built,
    buildProgress: opts.built ? work : Decimal.dZero,
    buildWork: work,
    operands: new Array(operandArity(kind)).fill(null),
    op: null,
    charge: Decimal.dZero,
    store: [],
    emitCursor: 0,
    outputStalled: false,
    recentBurn: 0,
    materialNeed: material,
  });
  return id;
}

/** Add `count` of a block to a warehouse's stockpile (merged by value). */
function depositToStore(cell: SimCell, value: Value, count = 1): void {
  const key = valueKey(value);
  const e = cell.store.find((s) => valueKey(s.value) === key);
  if (e) e.count += count;
  else cell.store.push({ value, count });
}

/** Manually deposit block(s) into a warehouse (the view's drag-drop path). */
export function depositToWarehouse(world: World, id: number, value: Value, count = 1): boolean {
  const c = world.cells.get(id);
  if (!c || c.kind !== 'warehouse' || !c.built) return false;
  depositToStore(c, value, count);
  return true;
}

/** Manual withdraw (the view's click-a-warehouse verb, U3.3): take the largest
 *  block from the stockpile and set it loose beside the cell. */
export function withdrawFromWarehouse(world: World, id: number): boolean {
  const c = world.cells.get(id);
  if (!c || c.kind !== 'warehouse' || !c.built) return false;
  const v = withdrawLargest(c);
  if (!v) return false;
  pushLoose(world, v, c.x + 90, c.y + 50);
  return true;
}

/** Manual "collect nearby" (U3.3, tedium removal): sweep loose blocks within
 *  `radius` of the warehouse into its stockpile. Returns blocks collected.
 *  Hand-dragging is free and instant anyway — this just spares the wrist. */
export function collectNearby(world: World, id: number, radius = 340): number {
  const c = world.cells.get(id);
  if (!c || c.kind !== 'warehouse' || !c.built) return 0;
  let n = 0;
  for (let i = world.pool.length - 1; i >= 0; i--) {
    const b = world.pool[i];
    if (Math.hypot(b.x - c.x, b.y - c.y) <= radius) {
      depositToStore(c, b.value, b.count);
      n += b.count;
      world.pool.splice(i, 1);
    }
  }
  return n;
}

/** Withdraw the largest-magnitude block from a warehouse's stockpile (or null). */
function withdrawLargest(cell: SimCell): Value | null {
  if (cell.store.length === 0) return null;
  let bi = 0;
  for (let i = 1; i < cell.store.length; i++) {
    if (valueMagnitude(cell.store[i].value).gt(valueMagnitude(cell.store[bi].value))) bi = i;
  }
  const e = cell.store[bi];
  const v = e.value;
  if (e.count > 1) e.count -= 1;
  else cell.store.splice(bi, 1);
  return v;
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
    stalled: false,
  });
  return id;
}

/** Remove a pipe; any in-flight block is returned to the loose pool (nothing is
 *  destroyed). Rerouting = removePipe + placePipe. */
export function removePipe(world: World, id: number): void {
  const p = world.pipes.get(id);
  if (!p) return;
  if (p.inFlight) {
    const c = world.cells.get(p.fromCell);
    pushLoose(world, p.inFlight.value, c ? c.x : 0, c ? c.y : 0);
  }
  world.pipes.delete(id);
}

/** Remove a cell. Its staged operands, in-progress inputs, and any held output
 *  return to the loose pool; its connected pipes are removed (their in-flight
 *  blocks also returned). Accelerator charge is lost. Nothing else is destroyed. */
export function removeCell(world: World, id: number): void {
  const cell = world.cells.get(id);
  if (!cell) return;
  for (const o of cell.operands) if (o) pushLoose(world, o, cell.x, cell.y);
  if (cell.op) for (const h of cell.op.heldInputs) pushLoose(world, h, cell.x, cell.y);
  for (const s of cell.store) pushLoose(world, s.value, cell.x, cell.y, s.count); // warehouse → pool
  for (const [pid, p] of world.pipes) {
    if (p.fromCell === id || p.toCell === id) removePipe(world, pid);
  }
  world.cells.delete(id);
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

/** Drop loose block(s) onto the canvas (setup / manual play). With stacking on,
 *  merges into a nearby same-value stack. Returns the resulting stack's id. */
export function addLoose(world: World, value: Value, x = 0, y = 0, count = 1): number {
  return pushLoose(world, value, x, y, count).id;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/** Advance the whole world by `dt` ticks (default 1). Deterministic. */
export function tick(world: World, dt = 1): void {
  const base = world.tuning.baseRate * dt;
  tickInk(world, dt);
  tickConstruction(world, base);
  tickOperations(world, base);
  tickAccelerators(world);
  tickPipes(world, base);
  // Decay the "being fuelled" glow (set to 1 by applyFuel). dt-aware so the fade
  // is consistent whether ticked one-at-a-time or in a batch.
  const decay = Math.pow(0.85, dt);
  for (const cell of world.cells.values()) {
    if (cell.recentBurn > 0) cell.recentBurn = cell.recentBurn < 1e-3 ? 0 : cell.recentBurn * decay;
  }
}

/** THE INK TAX. Holding wealth demands a flow of small numbers: demand =
 *  upkeepCoeff · max(0, digits(score) − floor) magnitude per tick, auto-pulled
 *  from the loose pool — largest in-band blocks first (fewest blocks burned),
 *  where in-band means magnitude ≤ upkeepBandRatio · demand. Big blocks can
 *  NEVER pay the rent: only a broad small-number economy covers the tax.
 *  Coverage is smoothed into world.inkCoverage (EMA); the throttle it drives
 *  lives in tickOperations. Wealth is never confiscated beyond the pull —
 *  underfunding slows the factory, it never shrinks the score. */
function tickInk(world: World, dt: number): void {
  const T = world.tuning;
  if (T.upkeepCoeff <= 0) {
    world.inkCoverage = 1;
    world.inkDemand = Decimal.dZero;
    return;
  }
  const digits = magnitudeDigits({ kind: 'real', n: totalScore(world) });
  const over = digits.sub(T.upkeepFloorDigits);
  const alpha = 1 - Math.pow(0.97, dt); // EMA smoothing, dt-aware
  if (over.lte(Decimal.dZero)) {
    // below the pocket-lint floor: no tax, coverage recovers toward 1
    world.inkDemand = Decimal.dZero;
    world.inkCoverage += alpha * (1 - world.inkCoverage);
    return;
  }
  const demand = over.mul(T.upkeepCoeff).mul(dt);
  world.inkDemand = over.mul(T.upkeepCoeff);
  const cap = demand.mul(T.upkeepBandRatio);
  // pull largest-in-band first until the demand is covered (each pass burns
  // at least one block item, so this terminates)
  let paid = Decimal.dZero;
  while (paid.lt(demand)) {
    let bi = -1;
    let bm = Decimal.dZero;
    for (let i = 0; i < world.pool.length; i++) {
      const m = valueMagnitude(world.pool[i].value);
      if (m.lt(Decimal.dOne) || m.gt(cap)) continue;
      if (bi < 0 || m.gt(bm)) {
        bi = i;
        bm = m;
      }
    }
    if (bi < 0) break;
    const b = world.pool[bi];
    const have = b.count ?? 1;
    const need = Decimal.max(Decimal.dOne, demand.sub(paid).div(bm).ceil()).toNumber();
    const take = Math.min(have, Number.isFinite(need) ? need : have);
    paid = paid.add(bm.mul(take));
    if (take >= have) world.pool.splice(bi, 1);
    else b.count = have - take;
    world.burned = world.burned.add(bm.mul(take));
  }
  const sample = Decimal.min(Decimal.dOne, paid.div(demand)).toNumber();
  world.inkCoverage += alpha * (sample - world.inkCoverage);
  if (world.inkCoverage > 1) world.inkCoverage = 1;
  if (world.inkCoverage < 0) world.inkCoverage = 0;
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

/** How many builds may draw the free baseRate concurrently ("pencils"):
 *  the tuning's base count plus one per BUILD_SLOT_MILESTONE the world's peak
 *  magnitude has crossed. Infinity when the slots rule is off (buildSlots ≤ 0). */
export function currentBuildSlots(world: World): number {
  if (world.tuning.unifiedCosts) return unifiedBuildSlots(world.peakMagnitude); // one per rung
  const base = world.tuning.buildSlots;
  if (base <= 0) return Infinity;
  let slots = base;
  for (const m of BUILD_SLOT_MILESTONES) if (world.peakMagnitude.gte(m)) slots++;
  return slots;
}

/** A cell's position in the build queue: 0-based among unbuilt cells in
 *  placement order. Positions < currentBuildSlots are actively drawing the
 *  free baseRate; the rest wait (fuel still rushes them). -1 if built/absent.
 *  Cells still AWAITING MATERIALS aren't in the queue at all (-1). */
export function buildQueuePosition(world: World, cellId: number): number {
  let pos = 0;
  for (const cell of world.cells.values()) {
    if (cell.built || cell.materialNeed) continue;
    if (cell.id === cellId) return pos;
    pos++;
  }
  return -1;
}

function tickConstruction(world: World, base: number): void {
  // Build slots: only the first `slots` unbuilt cells (placement order) accrue
  // the free baseRate — ONE pencil sketches at a time, early on. Fuel-rushed
  // builds (applyFuel) are unaffected: paid parallelism is always available.
  // A cell awaiting its MATERIAL neither builds nor holds a pencil.
  const slots = currentBuildSlots(world);
  let active = 0;
  for (const cell of world.cells.values()) {
    if (cell.built || cell.materialNeed) continue;
    if (active >= slots) continue; // the rest of the queue waits its turn
    active++;
    cell.buildProgress = cell.buildProgress.add(base);
    if (cell.buildProgress.gte(cell.buildWork)) {
      cell.buildProgress = cell.buildWork;
      cell.built = true;
    }
  }
}

function tickOperations(world: World, base: number): void {
  // THE INK THROTTLE: an underfunded ink supply slows the expensive machinery —
  // amplifier clocks and writing speed — but NEVER the leaves (successor/
  // addition keep producing ink, so recovery is always possible).
  const throttle =
    world.tuning.upkeepCoeff > 0
      ? Math.max(world.tuning.upkeepThrottleFloor, world.inkCoverage)
      : 1;
  for (const cell of world.cells.values()) {
    if (!cell.built) continue;
    if (cell.kind === 'accelerator') continue; // handled in tickAccelerators

    // Warehouse: no operation — withdraw largest-first into each empty output
    // pipe (back-pressure holds the rest in the store until the dest accepts).
    if (cell.kind === 'warehouse') {
      if (cell.store.length > 0) {
        for (const pipe of world.pipes.values()) {
          if (pipe.fromCell !== cell.id || pipe.inFlight !== null) continue;
          const blk = withdrawLargest(cell);
          if (!blk) break;
          pipe.inFlight = { value: blk, work: pipedTransitWork(world, pipe, blk), progress: Decimal.dZero };
        }
      }
      continue;
    }

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

    // Advance an active op. baseRate pays down TIME (work); amplifier ops get it
    // scaled by amplifierBaseRateScale (so fuel matters more), non-amplifiers get
    // it in full (the free base). baseRate never pays the fuel tax.
    if (cell.op !== null) {
      const opBase = cell.op.amplifier ? base * world.tuning.amplifierBaseRateScale * throttle : base;
      if (opBase > 0) cell.op.progress = Decimal.min(cell.op.work, cell.op.progress.add(opBase));
      // the write advances at full speed only when the ink flows
      cell.op.elapsed += cell.op.amplifier ? throttle : 1;
      if (opSatisfied(cell.op)) {
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
  // Aim for ~MILL_TARGET_GRADE per piece; cap the count so we never explode.
  const want = mag.div(MILL_TARGET_GRADE).ceil().toNumber();
  const count = Math.max(2, Math.min(MILL_MAX_PIECES, Number.isFinite(want) ? want : MILL_MAX_PIECES));
  const piece = mag.div(count);
  const out: { portIndex: number; value: Value }[] = [];
  for (let i = 0; i < count; i++) out.push({ portIndex: 0, value: { kind: 'real', n: piece } });
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
  // AMPLIFIERS (multiplication and up) are the cells that cost fuel — successor/
  // addition are plumbing, the mill is reprocessing. They pay the optional tax and
  // (when amplifierFuelOnly) forgo baseRate.
  const amplifier =
    cell.kind === 'multiplication' ||
    cell.kind === 'exponentiation' ||
    cell.kind === 'tetration' ||
    cell.kind === 'pentation';
  const grade = minFuelDenomination(work, world.tuning);
  let fuelRequired = Decimal.dZero;
  let scaffold: { min: Decimal; cap: Decimal } | null = null;
  let uNeed: Decimal | null = null;
  const expTier = cell.kind === 'exponentiation' || cell.kind === 'tetration' || cell.kind === 'pentation';
  if (amplifier && emits.length) {
    let maxMag = Decimal.dZero;
    for (const e of emits) maxMag = Decimal.max(maxMag, valueMagnitude(e.value));
    if (world.tuning.unifiedCosts) {
      // THE UNIFIED LAW: an operator k tiers up is paid k rungs down —
      // need = M^(1/2^k), in the band [need/16, need], pro-rata. OPTIONAL for
      // mult-tier (baseRate still finishes — fuel is speed); MANDATORY for
      // exp-tier above the floor (the working notes — scaffolding IS this
      // law, and the 2^-k root is exp's crazy-leap license).
      uNeed = unifiedNeed(maxMag, unifiedTier(cell.kind));
      scaffold = unifiedBand(uNeed);
      if (expTier && maxMag.gt(UNIFIED_NOTES_FLOOR)) fuelRequired = uNeed;
    } else {
      fuelRequired = fuelTax(maxMag, world.tuning);
      // SCAFFOLDING ("show your work"): exp-tier ops additionally demand burned
      // working notes scaling with the OUTPUT's value, payable only in the
      // denomination band [S/band, S]. Multiplication is never scaffolded — the
      // accelerant economy is its whole cost model.
      if (expTier) {
        const s = scaffoldRequirement(maxMag, world.tuning);
        if (s.gt(Decimal.dZero)) {
          fuelRequired = Decimal.max(fuelRequired, s);
          scaffold = { min: Decimal.max(grade, s.div(world.tuning.scaffoldBand)), cap: s };
        }
      }
    }
  }
  // WRITE-TIME FLOOR: even a fully paid op must spend the ticks to WRITE its
  // output's digits. Fuel buys down the work; it cannot buy ink speed.
  let minTicks = 0;
  if (world.tuning.writeSpeed > 0 && emits.length) {
    let maxDigits = Decimal.dZero;
    for (const e of emits) maxDigits = Decimal.max(maxDigits, magnitudeDigits(e.value));
    minTicks = maxDigits.div(world.tuning.writeSpeed).ceil().toNumber(); // Infinity for towers — that's tet-era ink tech's problem
  }
  cell.op = {
    heldInputs: inputs,
    emits,
    work,
    progress: Decimal.dZero,
    grade,
    fuelRequired,
    fuelPaid: Decimal.dZero,
    amplifier,
    scaffold,
    unifiedNeed: uNeed,
    elapsed: 0,
    minTicks,
  };
}

/** Route an emitted block: into an attached empty pipe, else the loose pool. */
function emit(world: World, cell: SimCell, port: number, value: Value): void {
  // Round-robin across the pipes attached to this output port, so a producer
  // feeding several destinations (e.g. both operand ports of a multiplication)
  // distributes fairly instead of always loading the first pipe and starving
  // the rest. The cursor rotates per cell.
  const attached: SimPipe[] = [];
  for (const pipe of world.pipes.values()) {
    if (pipe.fromCell === cell.id && pipe.fromPort === port) attached.push(pipe);
  }
  world.produced += 1;
  world.peakMagnitude = Decimal.max(world.peakMagnitude, valueMagnitude(value));
  if (attached.length > 0) {
    const n = attached.length;
    for (let k = 0; k < n; k++) {
      const pipe = attached[(cell.emitCursor + k) % n];
      if (pipe.inFlight === null) {
        pipe.inFlight = { value, work: pipedTransitWork(world, pipe, value), progress: Decimal.dZero };
        cell.emitCursor = (cell.emitCursor + k + 1) % n;
        cell.outputStalled = false;
        return;
      }
    }
    // Output pipes exist but all are mid-transit — bandwidth-bound back-pressure.
    cell.outputStalled = true;
  } else {
    cell.outputStalled = false; // terminal cell: loose output is by design
  }
  // Spill well clear of the output nub so the port stays wireable and the result
  // isn't hidden behind the block; with stacking on, repeated spills pile here.
  pushLoose(world, value, cell.x + OUTPUT_SPILL_OFFSET, cell.y);
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
  // Any pipe INTO a warehouse is a deposit — stockpile it (no operand staging).
  if (dest.kind === 'warehouse') {
    depositToStore(dest, value);
    pipe.stalled = false;
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
    pipe.stalled = false;
  } else {
    pushLoose(world, value, dest.x - 60, dest.y);
    pipe.stalled = true;
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
  const fv = fuelValue(value, world.tuning);
  // An accelerator stores fuel as charge — including a whole big number dropped
  // in as a "power cell" (its huge value = a huge, long-fading boost).
  if (cell.kind === 'accelerator') {
    cell.charge = cell.charge.add(fv);
    world.burned = world.burned.add(fv); // charge decays — absorbed value is spent
    return;
  }
  if (!cell.built) {
    // UNIFIED law: an unpaid cell takes its MATERIAL first — one block in the
    // tight band [min, max]. Out-of-band blocks bounce (machine them to fit:
    // Mill down, Add up). Only after the bill is paid does fuel rush the time.
    if (cell.materialNeed) {
      if (fv.gte(cell.materialNeed.min) && fv.lte(cell.materialNeed.max)) {
        cell.materialNeed = null; // the material is consumed into the structure
        world.burned = world.burned.add(fv);
        cell.recentBurn = 1;
      } else {
        pushLoose(world, value, cell.x, cell.y + 40);
      }
      return;
    }
    cell.buildProgress = cell.buildProgress.add(fv);
    world.burned = world.burned.add(fv);
    cell.recentBurn = 1; // fuelling a build lights the glow too
    if (cell.buildProgress.gte(cell.buildWork)) {
      cell.buildProgress = cell.buildWork;
      cell.built = true;
    }
    return;
  }
  if (cell.op !== null) {
    // A scaffolded op (exp-tier, scaffolding on) accepts fuel ONLY in its
    // denomination band [min, cap]: oversized blocks are refused outright
    // (your finished result is not scratch paper — this breaks the
    // burn-the-output-to-fund-the-next-jump chain), undersized ones too.
    const sc = cell.op.scaffold;
    if (sc && (fv.lt(sc.min) || fv.gt(sc.cap))) {
      pushLoose(world, value, cell.x, cell.y + 40);
      return;
    }
    // UNIFIED law: in-band fuel pays PRO-RATA against the universal need —
    // progress += work·v/need; the full √(output) completes the work. The
    // same payment counts toward a mandatory requirement (exp-tier notes).
    if (cell.op.unifiedNeed) {
      const share = cell.op.work.mul(fv).div(cell.op.unifiedNeed);
      cell.op.progress = Decimal.min(cell.op.work, cell.op.progress.add(share));
      cell.op.fuelPaid = cell.op.fuelPaid.add(fv);
      world.burned = world.burned.add(fv);
      cell.recentBurn = 1;
      return;
    }
    if (fv.gte(cell.op.grade)) {
      // Diminishing returns on overpay: a block contributes `grade^(1-p)·V^p`
      // progress (p = fuelOverpayExp). p=1 → V (no penalty); p<1 → big blocks buy
      // proportionally less, so paying near the grade is most efficient. The block
      // is still consumed at its FULL magnitude, so overpay is real waste.
      const p = world.tuning.fuelOverpayExp;
      const effective = p >= 1 ? fv : cell.op.grade.pow(1 - p).mul(fv.pow(p));
      cell.op.progress = Decimal.min(cell.op.work, cell.op.progress.add(effective));
      // The same burn pays the fuel tax / scaffolding (a magnitude quantity),
      // capped at need.
      cell.op.fuelPaid = Decimal.min(cell.op.fuelRequired, cell.op.fuelPaid.add(fv));
      world.burned = world.burned.add(fv);
      cell.recentBurn = 1;
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

/** Max CHARGE of any built accelerator covering a pipe's midpoint (the powered-
 *  logistics carry; pipeBoost is the legacy step multiplier from the same cells). */
function pipeCoverCharge(world: World, pipe: SimPipe): Decimal {
  const a = world.cells.get(pipe.fromCell);
  const b = world.cells.get(pipe.toCell);
  if (!a || !b) return Decimal.dZero;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  let charge = Decimal.dZero;
  for (const cell of world.cells.values()) {
    if (cell.kind !== 'accelerator' || !cell.built) continue;
    if (Math.hypot(cell.x - mx, cell.y - my) <= ACCEL_RADIUS) charge = Decimal.max(charge, cell.charge);
  }
  return charge;
}

/** Transit work for a block entering a pipe, with POWERED LOGISTICS: when
 *  `accelChargeCarry` is on, a covering accelerator's charge "carries" the
 *  block — effective magnitude = m / (1 + charge·carry) — so a powered region
 *  ferries numbers up to its charge, paid for by the charge's standing decay.
 *  Computed at ENTRY (the charge at departure decides the trip). */
function pipedTransitWork(world: World, pipe: SimPipe, value: Value): Decimal {
  const dist = pipeDistance(world, pipe);
  const carry = world.tuning.accelChargeCarry;
  if (carry <= 0) return transitWork(value, dist, world.tuning);
  const charge = pipeCoverCharge(world, pipe);
  if (charge.lte(Decimal.dZero)) return transitWork(value, dist, world.tuning);
  const eff = valueMagnitude(value).div(charge.mul(carry).add(1));
  return transitWork({ kind: 'real', n: eff }, dist, world.tuning);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Total Score: the magnitude of every block you currently possess. */
export function totalScore(world: World): Decimal {
  let sum = Decimal.dZero;
  for (const b of world.pool) sum = sum.add(valueMagnitude(b.value).mul(b.count ?? 1));
  for (const cell of world.cells.values()) {
    for (const o of cell.operands) if (o) sum = sum.add(valueMagnitude(o));
    if (cell.op) for (const h of cell.op.heldInputs) sum = sum.add(valueMagnitude(h));
    for (const s of cell.store) sum = sum.add(valueMagnitude(s.value).mul(s.count)); // warehoused
  }
  for (const pipe of world.pipes.values()) {
    if (pipe.inFlight) sum = sum.add(valueMagnitude(pipe.inFlight.value));
  }
  return sum;
}

/** Count loose-pool blocks whose magnitude equals `target` (test convenience).
 *  Sums stack counts, so a merged stack reports the blocks it represents. */
export function poolCountOf(world: World, target: number): number {
  const t = new Decimal(target);
  let count = 0;
  for (const b of world.pool) if (valueMagnitude(b.value).eq(t)) count += b.count ?? 1;
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

/** Reposition a loose stack (the view dragging it around the canvas). With
 *  stacking on, if it lands near another same-value stack the two merge
 *  (drop-to-stack comfort) and this stack is removed. */
export function moveLoose(world: World, id: number, x: number, y: number): void {
  const b = world.pool.find((b) => b.id === id);
  if (!b) return;
  b.x = x;
  b.y = y;
  if (!world.stacking) return;
  const key = valueKey(b.value);
  for (const other of world.pool) {
    if (other === b || valueKey(other.value) !== key) continue;
    if (Math.hypot(other.x - x, other.y - y) <= STACK_MERGE_RADIUS) {
      other.count += b.count;
      const idx = world.pool.indexOf(b);
      if (idx >= 0) world.pool.splice(idx, 1);
      return;
    }
  }
}

/** Reposition a cell (the view dragging it). Connected pipes follow because
 *  pipe geometry is derived from cell positions. */
export function moveCell(world: World, id: number, x: number, y: number): void {
  const c = world.cells.get(id);
  if (c) {
    c.x = x;
    c.y = y;
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
