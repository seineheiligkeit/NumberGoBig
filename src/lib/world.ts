import type { Container, Text } from 'pixi.js';
import { writable, type Readable } from 'svelte/store';
import {
  CELL_SHAPES,
  type CellInputPort,
  type CellOutputPort,
  type CellType,
} from './cell-types';
import Decimal from 'break_eternity.js';
import {
  VALUE_ZERO,
  valueEq,
  valueIsZero,
  valueKey,
  valueMagnitude,
  valueOf,
  valueSnapshot,
  type Value,
  type ValueSnapshot,
} from './value';

/**
 * The world — pure data model of every block and cell the player possesses.
 *
 * Simulation core lives here, separate from rendering. Pixi containers are
 * referenced for visual update purposes, but the source of truth is the
 * data model below.
 *
 * Cells carry their own input geometry, pending input slots, and pending
 * display references. Firing logic lives in the interaction layer — this
 * file owns *state*, not *behaviour*.
 */

/**
 * Stack-merge radii. Two cases:
 *   - **MERGE_DROP_RADIUS** — manual drag-drop. The player aims with a mouse
 *     and gets a forgiving merge zone.
 *   - **MERGE_EMIT_RADIUS** — automated emit (cell firing, cultivation,
 *     pipe transit). Tighter zone keeps stacks predictable at known port
 *     positions and prevents distant unrelated blocks from auto-merging.
 *
 * Both replace earlier inconsistent local constants (`STACK_RADIUS_PX = 60`,
 * `SOURCE_HIT_RADIUS = 32`, `STACK_RADIUS = 32`) that drifted between
 * `interaction.ts`, `pipe.ts` and `cultivation.ts`.
 */
export const MERGE_DROP_RADIUS = 60;
export const MERGE_EMIT_RADIUS = 32;

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export interface PlacedBlock {
  id: number;
  container: Container;
  value: Value;
  count: number;
  badge: Text | null;
}

let nextBlockId = 1;
const blocks: PlacedBlock[] = [];

// ---------------------------------------------------------------------------
// Cells (equation cells)
// ---------------------------------------------------------------------------

export interface PlacedCell {
  id: number;
  type: CellType;
  container: Container;
  inputs: readonly CellInputPort[];
  /** Pending input values in port order. `null` means the port is empty. */
  pending: (Value | null)[];
  /** Pixi display objects for the pending values, parallel to `pending`. */
  pendingDisplays: (Container | null)[];
  outputs: readonly CellOutputPort[];

  // --- Warehouse-specific state ---------------------------------------
  /** The value type stored. `null` until the first deposit locks the type. */
  storedValue?: Value | null;
  /** How many of `storedValue` are currently held. */
  storedCount?: number;
  /** Maximum capacity (warehouses refuse deposits at the cap). */
  capacity?: number;
  /** Renderer-provided callback to refresh the warehouse's badge after writes. */
  refreshBadge?: () => void;

  // --- Cultivation-specific state -------------------------------------
  /** Captured seed value; `null` until the player drops a seed on the input. */
  seed?: Value | null;
  /** Step index (0-based). Increments per emission. */
  cultivationStep?: number;
  /** Emission cooldown in ms. */
  cultivationCooldownMs?: number;
  /** Time remaining on the current cooldown. */
  cultivationCooldownRemaining?: number;

  // --- Cleanup-bot-specific state -------------------------------------
  /** Search radius in canvas pixels. */
  botRadius?: number;
  /** Sweep cooldown in ms. */
  botCooldownMs?: number;
  /** Time remaining on the current sweep cooldown. */
  botCooldownRemaining?: number;
}

let nextCellId = 1;
const cells: PlacedCell[] = [];

// ---------------------------------------------------------------------------
// Pipes
// ---------------------------------------------------------------------------

export type PipeEndpoint =
  // The river is conceptually screen-anchored — it doesn't pan with the
  // canvas — so its tap point is stored in screen coordinates and
  // re-projected to canvas space each render (and each camera change).
  | { kind: 'river'; screenX: number; screenY: number }
  | { kind: 'cell-output'; cellId: number; portIndex: number }
  | { kind: 'cell-input'; cellId: number; portIndex: number };

export interface PlacedPipe {
  id: number;
  source: PipeEndpoint;
  dest: PipeEndpoint;
  /** Maximum block value this pipe carries. Larger items are refused. */
  magnitude: number;
  /** Total cooldown between attempted transfers (ms). */
  cooldownMs: number;
  /** Time remaining on the current cooldown. */
  cooldownRemaining: number;
  /** Pipe's main visual line (lives in canvasLayer). */
  container: Container;
}

let nextPipeId = 1;
const pipes: PlacedPipe[] = [];

export function allPipes(): readonly PlacedPipe[] {
  return pipes;
}

export function addPipe(
  source: PipeEndpoint,
  dest: PipeEndpoint,
  magnitude: number,
  container: Container,
  cooldownMs = 1000,
): PlacedPipe {
  const pipe: PlacedPipe = {
    id: nextPipeId++,
    source,
    dest,
    magnitude,
    cooldownMs,
    cooldownRemaining: cooldownMs,
    container,
  };
  pipes.push(pipe);
  markDirty();
  return pipe;
}

export function removePipe(pipe: PlacedPipe): void {
  const idx = pipes.findIndex((p) => p.id === pipe.id);
  if (idx < 0) return;
  pipes.splice(idx, 1);
  pipe.container.parent?.removeChild(pipe.container);
  pipe.container.destroy({ children: true });
  markDirty();
}

export function findCellById(id: number): PlacedCell | null {
  return cells.find((c) => c.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Reactive stores
// ---------------------------------------------------------------------------

const _totalScore = writable<Decimal>(Decimal.dZero);
/**
 * Sum of every block the player currently possesses (DESIGN §3). Decimal-
 * backed since Slice 4.0 — a single geometric-cultivation chain produces
 * values past Number.MAX_SAFE_INTEGER in minutes.
 */
export const totalScore: Readable<Decimal> = _totalScore;

const _zeroCount = writable(0);
export const zeroCount: Readable<number> = _zeroCount;

const _blockCount = writable(0);
export const blockCount: Readable<number> = _blockCount;

const _countByValue = writable<ReadonlyMap<string, number>>(new Map());
/**
 * Per-value total counts across all stacks, keyed by `valueKey(v)`. Drives
 * generic Literature cost UI and `canAfford` checks. The string key keeps
 * the map disjoint across future Value variants (`"real:5"` vs
 * `"rational:5/1"` vs `"complex:5+0i"`).
 */
export const countByValue: Readable<ReadonlyMap<string, number>> = _countByValue;

const _achievements = writable<Set<string>>(new Set());
export const achievements: Readable<Set<string>> = _achievements;

const _unlocks = writable<Set<string>>(new Set());
export const unlocks: Readable<Set<string>> = _unlocks;

const _purchaseCounts = writable<ReadonlyMap<string, number>>(new Map());
/** How many times each Literature entry has been purchased (drives scaling cost). */
export const purchaseCounts: Readable<ReadonlyMap<string, number>> = _purchaseCounts;

const _discoveredValues = writable<ReadonlySet<string>>(new Set());
/**
 * The set of every `valueKey(v)` the player has ever produced — even values
 * no longer on the canvas (consumed by purchases, decomposed, etc). This is
 * the foundation for the Phase 4 Gallery (Slice 5.1) and persists across
 * the run. Phase 5 will make it survive prestige as well.
 */
export const discoveredValues: Readable<ReadonlySet<string>> = _discoveredValues;

let _currentDiscoveries: ReadonlySet<string> = new Set<string>();
_discoveredValues.subscribe((s) => {
  _currentDiscoveries = s;
});

function recordDiscovery(value: Value): void {
  const key = valueKey(value);
  if (_currentDiscoveries.has(key)) return;
  _discoveredValues.update((s) => {
    if (s.has(key)) return s;
    const next = new Set(s);
    next.add(key);
    return next;
  });
}

const _comprehension = writable(10);
/**
 * The player's manual-lift ceiling. Blocks of `|value| > comprehension`
 * cannot be picked up by hand — they must be moved by automation (pipes,
 * bots). The player raises this via Literature upgrades that demand
 * specific number collections. Default 10; first upgrade tier is 100 (per
 * DESIGN §9).
 *
 * Stored as a plain JS number — the Phase 3 ceilings stay well below
 * Number.MAX_SAFE_INTEGER, and comparisons in `valueExceeds` lift the
 * ceiling into Decimal space on demand.
 */
export const comprehension: Readable<number> = _comprehension;

let _currentComprehension = 10;
_comprehension.subscribe((c) => {
  _currentComprehension = c;
});

export function comprehensionLevel(): number {
  return _currentComprehension;
}

export function setComprehension(level: number): void {
  _comprehension.set(level);
}

export function raiseComprehension(level: number): void {
  if (level > _currentComprehension) _comprehension.set(level);
}

const _dirtyTick = writable(0);
/** Increments after any world mutation. Persistence subscribes (debounced). */
export const dirtyTick: Readable<number> = _dirtyTick;

/**
 * Bumps the dirty counter. Block mutations reach here via the `_countByValue`
 * subscription set up below; cell placement and pending-input changes call
 * this directly.
 */
export function markDirty(): void {
  _dirtyTick.update((n) => n + 1);
}

function recompute(): void {
  let score = Decimal.dZero;
  let zeros = 0;
  const counts = new Map<string, number>();

  for (const b of blocks) {
    // Total Score (DESIGN §3) sums absolute values: negatives contribute
    // their magnitude, rationals their decimal magnitude, complex (4.4)
    // their modulus. `valueMagnitude` abstracts the variant so this loop
    // doesn't grow a switch per slice.
    score = score.add(valueMagnitude(b.value).mul(b.count));
    if (valueIsZero(b.value)) zeros += b.count;
    const key = valueKey(b.value);
    counts.set(key, (counts.get(key) ?? 0) + b.count);
  }

  _totalScore.set(score);
  _zeroCount.set(zeros);
  _blockCount.set(blocks.length);
  _countByValue.set(counts);
}

// ---------------------------------------------------------------------------
// Block-change listener pattern (renderer reacts without a circular import)
// ---------------------------------------------------------------------------

type BlockChangeListener = (block: PlacedBlock) => void;
const blockChangeListeners: BlockChangeListener[] = [];

export function onBlockChange(listener: BlockChangeListener): void {
  blockChangeListeners.push(listener);
}

function notifyChange(block: PlacedBlock): void {
  for (const l of blockChangeListeners) l(block);
}

// ---------------------------------------------------------------------------
// Block operations
// ---------------------------------------------------------------------------

export function addBlock(container: Container, value: Value, count = 1): PlacedBlock {
  const block: PlacedBlock = {
    id: nextBlockId++,
    container,
    value,
    count,
    badge: null,
  };
  blocks.push(block);
  // Record the Gallery discovery — only on the *first* time this value-key
  // is seen across the lifetime of the save. Idempotent on rehydrate (the
  // saved set is restored before any addBlock calls fire).
  recordDiscovery(value);
  recompute();
  // Notify renderers so per-block styling (stack badge, comprehension fade)
  // applies immediately rather than on the next stack change.
  notifyChange(block);
  return block;
}

export function increaseStack(block: PlacedBlock, delta = 1): void {
  block.count += delta;
  // Aggregates first, listeners second — that way a listener reading
  // `$totalScore` inside `onBlockChange` sees the new value.
  recompute();
  notifyChange(block);
}

export function decreaseStack(block: PlacedBlock, delta = 1): void {
  block.count -= delta;
  if (block.count <= 0) {
    const idx = blocks.findIndex((b) => b.id === block.id);
    if (idx >= 0) blocks.splice(idx, 1);
    block.container.parent?.removeChild(block.container);
    block.container.destroy({ children: true });
    recompute();
  } else {
    recompute();
    notifyChange(block);
  }
}

/**
 * Returns the first block whose container sits within `radius` of (x, y).
 * When `value` is given, only blocks of that exact Value match — used for
 * stack-merging same-value drops. When omitted, the function is value-
 * agnostic — used by pipes to source whatever block happens to sit at a
 * cell's output port.
 */
export function findBlockAt(
  x: number,
  y: number,
  radius: number,
  value?: Value,
): PlacedBlock | null {
  for (const b of blocks) {
    if (value !== undefined && !valueEq(b.value, value)) continue;
    const dx = b.container.x - x;
    const dy = b.container.y - y;
    if (Math.hypot(dx, dy) <= radius) return b;
  }
  return null;
}

export function allBlocks(): readonly PlacedBlock[] {
  return blocks;
}

/**
 * Consumes `n` blocks of `value` from the player's stacks. Returns true on
 * success, false if there weren't enough. Notifies listeners; removes empty
 * stacks from the world.
 */
export function spendValue(value: Value, n: number): boolean {
  let available = 0;
  for (const b of blocks) {
    if (valueEq(b.value, value)) available += b.count;
  }
  if (available < n) return false;

  // Collect partial-spend notifications to fire AFTER recompute, so any
  // listener inspecting aggregates sees the post-spend totals.
  const partiallySpent: PlacedBlock[] = [];

  let remaining = n;
  for (let i = blocks.length - 1; i >= 0 && remaining > 0; i--) {
    const b = blocks[i];
    if (!valueEq(b.value, value)) continue;

    if (b.count > remaining) {
      b.count -= remaining;
      remaining = 0;
      partiallySpent.push(b);
    } else {
      remaining -= b.count;
      b.count = 0;
      b.container.parent?.removeChild(b.container);
      b.container.destroy({ children: true });
      blocks.splice(i, 1);
    }
  }
  recompute();
  for (const b of partiallySpent) notifyChange(b);
  return true;
}

/** Backward-compatible shorthand for spending zeros. */
export function spendZeros(n: number): boolean {
  return spendValue(VALUE_ZERO, n);
}

// Cached `valueOf(1)` for the very common cost-of-one spend. Computational
// cost (multiplication, exponentiation) hits this every firing.
const _VALUE_ONE_CACHE = valueOf(1);
/** Spends `n` ones in one call — the hot path for computational cost. */
export function spendOnes(n: number): boolean {
  return spendValue(_VALUE_ONE_CACHE, n);
}

// ---------------------------------------------------------------------------
// Cell operations
// ---------------------------------------------------------------------------

/**
 * Registers a placed cell of the given type at the given container.
 * Port geometry comes from `CELL_SHAPES[type]`.
 */
/** Default capacity of a freshly-placed warehouse. Upgradeable in later slices. */
const WAREHOUSE_DEFAULT_CAPACITY = 100;

export function addCell(type: CellType, container: Container): PlacedCell {
  const shape = CELL_SHAPES[type];
  const placed: PlacedCell = {
    id: nextCellId++,
    type,
    container,
    inputs: shape.inputs,
    pending: shape.inputs.map(() => null),
    pendingDisplays: shape.inputs.map(() => null),
    outputs: shape.outputs,
  };
  if (type === 'warehouse') {
    placed.storedValue = null;
    placed.storedCount = 0;
    placed.capacity = WAREHOUSE_DEFAULT_CAPACITY;
  }
  if (
    type === 'cultivation-arithmetic' ||
    type === 'cultivation-geometric' ||
    type === 'cultivation-fibonacci'
  ) {
    placed.seed = null;
    placed.cultivationStep = 0;
    placed.cultivationCooldownMs = type === 'cultivation-fibonacci' ? 2200 : 1800;
    placed.cultivationCooldownRemaining = placed.cultivationCooldownMs;
  }
  if (type === 'cleanup-bot') {
    placed.botRadius = 240;
    placed.botCooldownMs = 2500;
    placed.botCooldownRemaining = placed.botCooldownMs;
  }
  cells.push(placed);
  // Cell placement is one of the few mutations that doesn't reach recompute.
  // Notify the autosave layer directly.
  markDirty();
  return placed;
}

/**
 * Finds a specific cell input port at the given canvas coordinates.
 * Returns null if no port's hit-area contains the point. Strict — a drop
 * "near" a cell but not over a port doesn't qualify.
 */
export function findCellPortAt(
  x: number,
  y: number,
): { cell: PlacedCell; portIndex: number } | null {
  for (const c of cells) {
    for (let i = 0; i < c.inputs.length; i++) {
      const p = c.inputs[i];
      const px = c.container.x + p.offsetX;
      const py = c.container.y + p.offsetY;
      if (Math.abs(x - px) <= p.halfWidth && Math.abs(y - py) <= p.halfHeight) {
        return { cell: c, portIndex: i };
      }
    }
  }
  return null;
}

/**
 * Finds a cell's output port at the given canvas coordinates. Used for
 * click-to-withdraw on warehouses and (later) pipe source-port targeting.
 * A radius around the output position counts as a hit.
 */
const OUTPUT_PORT_HIT_RADIUS = 22;
export function findCellOutputPortAt(
  x: number,
  y: number,
): { cell: PlacedCell; portIndex: number } | null {
  for (const c of cells) {
    for (let i = 0; i < c.outputs.length; i++) {
      const p = c.outputs[i];
      const px = c.container.x + p.offsetX;
      const py = c.container.y + p.offsetY;
      if (Math.hypot(x - px, y - py) <= OUTPUT_PORT_HIT_RADIUS) {
        return { cell: c, portIndex: i };
      }
    }
  }
  return null;
}

/**
 * Deposits one unit of `value` into the warehouse cell. Returns true on
 * success, false on type mismatch or full capacity. The first deposit locks
 * the warehouse's type.
 */
export function depositToWarehouse(cell: PlacedCell, value: Value): boolean {
  if (cell.type !== 'warehouse') return false;
  const cap = cell.capacity ?? WAREHOUSE_DEFAULT_CAPACITY;
  if ((cell.storedCount ?? 0) >= cap) return false;
  if (cell.storedValue === undefined || cell.storedValue === null) {
    cell.storedValue = value;
  } else if (!valueEq(cell.storedValue, value)) {
    return false;
  }
  cell.storedCount = (cell.storedCount ?? 0) + 1;
  cell.refreshBadge?.();
  markDirty();
  return true;
}

/**
 * Withdraws one unit from the warehouse and returns its value, or null if
 * the warehouse is empty.
 */
export function withdrawFromWarehouse(cell: PlacedCell): Value | null {
  if (cell.type !== 'warehouse') return null;
  if ((cell.storedCount ?? 0) <= 0) return null;
  const value = cell.storedValue!;
  cell.storedCount = (cell.storedCount ?? 0) - 1;
  // Withdrawal that empties the warehouse unlocks the type so the player
  // (or a pipe) can repurpose it.
  if (cell.storedCount === 0) cell.storedValue = null;
  cell.refreshBadge?.();
  markDirty();
  return value;
}

export function allCells(): readonly PlacedCell[] {
  return cells;
}

// ---------------------------------------------------------------------------
// Achievements and Literature unlocks
// ---------------------------------------------------------------------------

let _currentAchievements = new Set<string>();
_achievements.subscribe((s) => {
  _currentAchievements = s;
});

export function unlockAchievement(id: string): void {
  if (_currentAchievements.has(id)) return;
  _achievements.update((s) => {
    if (s.has(id)) return s;
    const next = new Set(s);
    next.add(id);
    return next;
  });
}

export function hasAchievement(id: string): boolean {
  return _currentAchievements.has(id);
}

let _currentUnlocks = new Set<string>();
_unlocks.subscribe((s) => {
  _currentUnlocks = s;
});

export function unlock(id: string): void {
  if (_currentUnlocks.has(id)) return;
  _unlocks.update((s) => {
    if (s.has(id)) return s;
    const next = new Set(s);
    next.add(id);
    return next;
  });
}

export function hasUnlock(id: string): boolean {
  return _currentUnlocks.has(id);
}

let _currentPurchaseCounts: ReadonlyMap<string, number> = new Map();
_purchaseCounts.subscribe((m) => {
  _currentPurchaseCounts = m;
});

export function incrementPurchaseCount(id: string): void {
  _purchaseCounts.update((m) => {
    const next = new Map(m);
    next.set(id, (next.get(id) ?? 0) + 1);
    return next;
  });
}

export function purchaseCountOf(id: string): number {
  return _currentPurchaseCounts.get(id) ?? 0;
}

// ---------------------------------------------------------------------------
// Snapshots and restoration (Phase 1 Slice 2.7 → Phase 3 Slice 4.0)
// ---------------------------------------------------------------------------

export interface BlockSnapshot {
  value: ValueSnapshot;
  count: number;
  x: number;
  y: number;
}

export interface CellSnapshot {
  type: CellType;
  x: number;
  y: number;
  pending: (ValueSnapshot | null)[];
  /** Warehouse cells only — typed storage state. */
  warehouseState?: {
    storedValue: ValueSnapshot | null;
    storedCount: number;
    capacity: number;
  };
  /** Cultivation cells only — seed, step, and remaining cooldown. */
  cultivationState?: {
    seed: ValueSnapshot | null;
    cultivationStep: number;
    cultivationCooldownMs: number;
    cultivationCooldownRemaining?: number;
  };
  /** Cleanup-bot cells only — config + remaining cooldown. */
  botState?: {
    botRadius: number;
    botCooldownMs: number;
    botCooldownRemaining: number;
  };
}

export interface PipeSnapshot {
  source: PipeEndpoint;
  dest: PipeEndpoint;
  magnitude: number;
  cooldownMs: number;
  /** Remaining cooldown — preserves "almost ready to fire" pipes across reloads. */
  cooldownRemaining?: number;
}

export function snapshotBlocks(): BlockSnapshot[] {
  return blocks.map((b) => ({
    value: valueSnapshot(b.value),
    count: b.count,
    x: b.container.x,
    y: b.container.y,
  }));
}

export function snapshotCells(): CellSnapshot[] {
  return cells.map((c) => {
    const snap: CellSnapshot = {
      type: c.type,
      x: c.container.x,
      y: c.container.y,
      pending: c.pending.map((v) => (v === null ? null : valueSnapshot(v))),
    };
    if (c.type === 'warehouse') {
      snap.warehouseState = {
        storedValue: c.storedValue ? valueSnapshot(c.storedValue) : null,
        storedCount: c.storedCount ?? 0,
        capacity: c.capacity ?? WAREHOUSE_DEFAULT_CAPACITY,
      };
    }
    if (
      c.type === 'cultivation-arithmetic' ||
      c.type === 'cultivation-geometric' ||
      c.type === 'cultivation-fibonacci'
    ) {
      const cooldownMs = c.cultivationCooldownMs ?? 2000;
      snap.cultivationState = {
        seed: c.seed ? valueSnapshot(c.seed) : null,
        cultivationStep: c.cultivationStep ?? 0,
        cultivationCooldownMs: cooldownMs,
        cultivationCooldownRemaining: c.cultivationCooldownRemaining ?? cooldownMs,
      };
    }
    if (c.type === 'cleanup-bot') {
      snap.botState = {
        botRadius: c.botRadius ?? 240,
        botCooldownMs: c.botCooldownMs ?? 2500,
        botCooldownRemaining: c.botCooldownRemaining ?? c.botCooldownMs ?? 2500,
      };
    }
    return snap;
  });
}

export function snapshotAchievements(): string[] {
  return [..._currentAchievements];
}

export function snapshotUnlocks(): string[] {
  return [..._currentUnlocks];
}

export function snapshotPurchaseCounts(): [string, number][] {
  return [..._currentPurchaseCounts.entries()];
}

export function snapshotComprehension(): number {
  return _currentComprehension;
}

export function snapshotDiscoveries(): string[] {
  return [..._currentDiscoveries];
}

export function restoreDiscoveries(keys: readonly string[]): void {
  _discoveredValues.set(new Set(keys));
}

export function snapshotPipes(): PipeSnapshot[] {
  return pipes.map((p) => ({
    source: p.source,
    dest: p.dest,
    magnitude: p.magnitude,
    cooldownMs: p.cooldownMs,
    cooldownRemaining: p.cooldownRemaining,
  }));
}

/**
 * Tears down all world state — blocks, cells, achievements, unlocks, purchase
 * counts. Pixi containers are removed from their parents and destroyed. Used
 * by the persistence layer immediately before rehydrating from a save.
 */
export function resetWorld(): void {
  for (const b of blocks) {
    b.container.parent?.removeChild(b.container);
    b.container.destroy({ children: true });
  }
  blocks.length = 0;

  for (const c of cells) {
    c.container.parent?.removeChild(c.container);
    c.container.destroy({ children: true });
  }
  cells.length = 0;

  for (const p of pipes) {
    p.container.parent?.removeChild(p.container);
    p.container.destroy({ children: true });
  }
  pipes.length = 0;

  // Reset monotonic id counters so a rehydrated cell-id `3` matches what it
  // was when saved (we restore in save order). Pipes reference cells by id;
  // without this reset, pipe endpoints would dangle after load.
  nextBlockId = 1;
  nextCellId = 1;
  nextPipeId = 1;

  _achievements.set(new Set());
  _unlocks.set(new Set());
  _purchaseCounts.set(new Map());
  _comprehension.set(10);
  _discoveredValues.set(new Set());

  recompute();
}

export function restoreAchievements(ids: readonly string[]): void {
  _achievements.set(new Set(ids));
}

export function restoreUnlocks(ids: readonly string[]): void {
  _unlocks.set(new Set(ids));
}

export function restorePurchaseCounts(entries: readonly [string, number][]): void {
  _purchaseCounts.set(new Map(entries));
}

// Bump dirty on every store change that reflects state mutation. Subscribers
// run synchronously; `markDirty()` is a cheap counter increment, and the
// autosave debounce collapses bursts. `_countByValue` covers every block
// mutation (it fires from `recompute()`, called by every block mutator).
// The other four stores each track an orthogonal piece of state outside the
// block aggregates — every one needs its own subscription. Pipes, cell-
// placement, and pending-input state all bump `markDirty()` directly from
// their mutators.
_countByValue.subscribe(() => markDirty());
_achievements.subscribe(() => markDirty());
_unlocks.subscribe(() => markDirty());
_purchaseCounts.subscribe(() => markDirty());
_comprehension.subscribe(() => markDirty());
_discoveredValues.subscribe(() => markDirty());
