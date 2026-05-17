import type { Container, Text } from 'pixi.js';
import { writable, type Readable } from 'svelte/store';
import { CELL_SHAPES, type CellType } from '../../../core/cell-types';
// Phase B.1 — entity + snapshot types live in the sibling `./types`.
// Re-export so existing `from '../lib/world'` consumers still resolve
// `PlacedBlock`, `PlacedCell`, etc. through the facade.
import type {
  PlacedBlock,
  PlacedCell,
  PipeEndpoint,
  PlacedPipe,
  FuelOutcome,
  BlockSnapshot,
  CellSnapshot,
  PipeSnapshot,
} from './types';
export type {
  PlacedBlock,
  PlacedCell,
  PipeEndpoint,
  PlacedPipe,
  FuelOutcome,
  BlockSnapshot,
  CellSnapshot,
  PipeSnapshot,
};
import Decimal from 'break_eternity.js';
import {
  VALUE_ZERO,
  valueComprehensible,
  valueEq,
  valueIsNegative,
  valueIsZero,
  valueKey,
  valueMagnitude,
  valueOf,
  valueSnapshot,
  type Value,
  type ValueSnapshot,
} from '../../../core/value';
import { getWarehouseRule } from '../../../core/warehouse-rules';
import { costTier } from '../../../core/cost';

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
// Blocks — entity shape lives in `./types`; registry state below.
// ---------------------------------------------------------------------------

let nextBlockId = 1;
const blocks: PlacedBlock[] = [];

// ---------------------------------------------------------------------------
// Cells — entity shape lives in `./types`; registry state below.
// ---------------------------------------------------------------------------

let nextCellId = 1;
const cells: PlacedCell[] = [];

// ---------------------------------------------------------------------------
// Pipes — entity shape lives in `./types`; registry state below.
// ---------------------------------------------------------------------------

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

/**
 * Records a value's `valueKey` in the discoveries set. Idempotent — the
 * Set dedups across repeated calls. Phase 6 β.4 (DESIGN §9): discovery
 * is comprehension, not production. The renderer calls this for blocks
 * that are currently within the player's Comp ceiling; uncomprehended
 * blocks wait, then get recorded on the comp-upgrade reveal pass.
 */
export function recordDiscovery(value: Value): void {
  const key = valueKey(value);
  if (_currentDiscoveries.has(key)) return;
  _discoveredValues.update((s) => {
    if (s.has(key)) return s;
    const next = new Set(s);
    next.add(key);
    return next;
  });
}

const _comprehension = writable(2);
/**
 * The player's manual-lift ceiling. Blocks of `|value| > comprehension`
 * cannot be picked up by hand — they must be moved by automation (pipes,
 * bots). The player raises this via Literature upgrades that demand
 * specific number collections.
 *
 * Phase 6 (DESIGN.md §9): the ladder is power-of-2 and infinite. The
 * baseline is **Comp ≤ 2** (zeros and ones only); the first paid
 * Literature entry after Successor is the upgrade to ≤ 4 — teaches
 * the mechanic in the opening minute.
 *
 * Stored as a plain JS number — even tier 30 (2^30 ≈ 1.07B) stays well
 * below Number.MAX_SAFE_INTEGER, and comparisons in `valueExceeds`
 * lift the ceiling into Decimal space on demand.
 */
export const comprehension: Readable<number> = _comprehension;

let _currentComprehension = 2;
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

// ---------------------------------------------------------------------------
// Cell and pipe levels (Phase 5.6 leveling system)
// ---------------------------------------------------------------------------
//
// Per-type global levels: all cells of a given type share the same level.
// Same for pipes (per-magnitude). Level 1 is the implicit default; only
// non-default levels are stored. Throughput multiplier is `2^(level-1)`
// — applied to cell output count and pipe cooldown speed. Qualities at
// specific tiers (fuel discount on Mult/Exp lvl 3 and 5) are gated by
// checking the level directly in firing code. (Successor lvl 3
// river-tap was removed in α.5; the level is now a pure throughput
// bump and zeros still flow through pipe ≤1.)
//
// Cap is 5. Future iterations may extend.

const MAX_LEVEL = 5;

const _cellLevels = writable<Map<CellType, number>>(new Map());
export const cellLevels: Readable<Map<CellType, number>> = _cellLevels;
let _currentCellLevels = new Map<CellType, number>();
_cellLevels.subscribe((m) => {
  _currentCellLevels = m;
});

// Phase 6 γ.1: pipe leveling DISSOLVED into the Comp ladder. The
// per-magnitude `_pipeLevels` store, its setters, and its
// snapshot/restore have been removed. Throughput from pipes comes from
// placing parallel pipes (Quantity), not from upgrading them.

export function cellLevel(type: CellType): number {
  return _currentCellLevels.get(type) ?? 1;
}

/** Throughput multiplier for a level. Doubling per level. */
export function levelMultiplier(level: number): number {
  return Math.pow(2, Math.max(0, level - 1));
}

/** Sets a cell-type level. Clamped to [1, MAX_LEVEL]. */
export function setCellLevel(type: CellType, level: number): void {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, level));
  _cellLevels.update((m) => {
    const next = new Map(m);
    if (clamped === 1) next.delete(type);
    else next.set(type, clamped);
    return next;
  });
  markDirty();
}

/** Snapshot for persistence — entries with level > 1 only. */
export function snapshotCellLevels(): [CellType, number][] {
  return Array.from(_currentCellLevels.entries());
}

export function restoreCellLevels(entries: [CellType, number][]): void {
  _cellLevels.set(new Map(entries));
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

  // Slices 3.5.2 + 3.5.3: warehouse contents contribute to Total Score AND
  // to countByValue — they're "accumulated wealth made visible" (DESIGN §3)
  // AND a real currency reservoir for Literature purchases. With both
  // counted here, `canAfford` lights up entries the player can pay for
  // from stored currency, and `spendValue` (below) drains warehouses
  // alongside loose blocks.
  //
  // In-transit pipe items aren't summed because the simulation transfers
  // them atomically inside a single tick — there's no persistent
  // "block currently in the pipe" state to scan. If a future slice adds
  // a visible transit delay, the same loop can be extended over `pipes`.
  for (const c of cells) {
    if (c.type === 'warehouse') {
      const v = c.storedValue;
      if (v === null || v === undefined) continue;
      const n = c.storedCount ?? 0;
      if (n <= 0) continue;
      score = score.add(valueMagnitude(v).mul(n));
      const key = valueKey(v);
      counts.set(key, (counts.get(key) ?? 0) + n);
    } else if (c.type === 'warehouse-rule') {
      // Mixed contents: sum each (value, count) pair.
      for (const item of c.ruleItems ?? []) {
        if (item.count <= 0) continue;
        score = score.add(valueMagnitude(item.value).mul(item.count));
        const key = valueKey(item.value);
        counts.set(key, (counts.get(key) ?? 0) + item.count);
      }
    }
  }

  _totalScore.set(score);
  _zeroCount.set(zeros);
  _blockCount.set(blocks.length);
  _countByValue.set(counts);
}

/**
 * Public-facing trigger to recompute aggregates after a mutation that
 * doesn't already flow through the block path. Warehouse deposits /
 * withdrawals call this so Total Score reflects stored wealth in real
 * time. Same shape as the internal `recompute`, but callable from outside
 * the module without exporting that name.
 */
export function refreshTotals(): void {
  recompute();
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
  // Discovery used to be recorded here unconditionally. Phase 6 β.4
  // (DESIGN §9) shifts it to "on reveal" — the renderer
  // (`applyComprehensionStyle`) records discoveries for blocks within
  // the player's current Comp, AND on every comp upgrade walks all
  // blocks to retroactively discover newly-comprehensible ones.
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
 * Consumes `n` blocks of `value` from the player's stacks AND from any
 * warehouses storing that value (Slice 3.5.3). Returns true on success,
 * false if there weren't enough across both pools.
 *
 * Spend order: loose blocks first, then warehoused. Loose blocks read as
 * "small change" to the player; the warehouse is "savings" — draining
 * loose first matches the mental model. Within each pool the draw order
 * doesn't matter (all matched blocks share the same value).
 *
 * Notifies block listeners after recompute, and refreshes any warehouse
 * badge that was touched.
 */
export function spendValue(value: Value, n: number): boolean {
  let available = 0;
  for (const b of blocks) {
    if (valueEq(b.value, value)) available += b.count;
  }
  const typedWarehouses: PlacedCell[] = [];
  const ruleSources: { cell: PlacedCell; itemIndex: number }[] = [];
  for (const c of cells) {
    if (c.type === 'warehouse') {
      const sv = c.storedValue;
      if (sv === null || sv === undefined) continue;
      if (!valueEq(sv, value)) continue;
      const stored = c.storedCount ?? 0;
      if (stored <= 0) continue;
      available += stored;
      typedWarehouses.push(c);
    } else if (c.type === 'warehouse-rule') {
      const items = c.ruleItems ?? [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].count <= 0) continue;
        if (!valueEq(items[i].value, value)) continue;
        available += items[i].count;
        ruleSources.push({ cell: c, itemIndex: i });
      }
    }
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

  // Loose pool exhausted; drain typed warehouses next, then rule ones.
  for (const c of typedWarehouses) {
    if (remaining <= 0) break;
    const stored = c.storedCount ?? 0;
    const take = Math.min(stored, remaining);
    c.storedCount = stored - take;
    if (c.storedCount === 0) c.storedValue = null;
    c.refreshBadge?.();
    remaining -= take;
  }
  for (const src of ruleSources) {
    if (remaining <= 0) break;
    const items = src.cell.ruleItems ?? [];
    const item = items[src.itemIndex];
    if (!item) continue;
    const take = Math.min(item.count, remaining);
    item.count -= take;
    remaining -= take;
    src.cell.refreshBadge?.();
  }
  // Compact each touched rule warehouse to drop emptied entries — cheaper
  // than splicing during the spend loop (which would invalidate indices).
  for (const src of ruleSources) {
    src.cell.ruleItems = (src.cell.ruleItems ?? []).filter((it) => it.count > 0);
  }

  recompute();
  for (const b of partiallySpent) notifyChange(b);
  return true;
}

/** Backward-compatible shorthand for spending zeros. */
export function spendZeros(n: number): boolean {
  return spendValue(VALUE_ZERO, n);
}

/**
 * Counts every block-or-warehouse-item whose value satisfies `test`,
 * across loose stacks, typed warehouses, and rule warehouses. Drives
 * predicate-based Literature affordability (Slice 5.3 — "10 primes",
 * "5 primes ≥ 100").
 */
export function countMatching(test: (v: Value) => boolean): number {
  let total = 0;
  for (const b of blocks) {
    if (b.count > 0 && test(b.value)) total += b.count;
  }
  for (const c of cells) {
    if (c.type === 'warehouse') {
      const v = c.storedValue;
      if (v && test(v)) total += c.storedCount ?? 0;
    } else if (c.type === 'warehouse-rule') {
      for (const it of c.ruleItems ?? []) {
        if (it.count > 0 && test(it.value)) total += it.count;
      }
    }
  }
  return total;
}

/**
 * Consumes `n` blocks satisfying `test`, drawing from loose blocks
 * first, then typed warehouses, then rule warehouses. Returns true on
 * success, false (without spending) if not enough qualifying blocks
 * exist.
 */
export function spendMatching(test: (v: Value) => boolean, n: number): boolean {
  if (n <= 0) return true;
  if (countMatching(test) < n) return false;

  const partiallySpent: PlacedBlock[] = [];
  let remaining = n;

  for (let i = blocks.length - 1; i >= 0 && remaining > 0; i--) {
    const b = blocks[i];
    if (!test(b.value)) continue;
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

  for (const c of cells) {
    if (remaining <= 0) break;
    if (c.type !== 'warehouse') continue;
    const v = c.storedValue;
    if (!v || !test(v)) continue;
    const stored = c.storedCount ?? 0;
    const take = Math.min(stored, remaining);
    c.storedCount = stored - take;
    if (c.storedCount === 0) c.storedValue = null;
    c.refreshBadge?.();
    remaining -= take;
  }

  for (const c of cells) {
    if (remaining <= 0) break;
    if (c.type !== 'warehouse-rule') continue;
    const items = c.ruleItems ?? [];
    for (let i = 0; i < items.length && remaining > 0; i++) {
      const it = items[i];
      if (!test(it.value)) continue;
      const take = Math.min(it.count, remaining);
      it.count -= take;
      remaining -= take;
    }
    c.ruleItems = items.filter((it) => it.count > 0);
    c.refreshBadge?.();
  }

  recompute();
  for (const b of partiallySpent) notifyChange(b);
  return true;
}

/**
 * Pays `cost` fuel by consuming a single block whose **signed magnitude
 * meets the cost** (DESIGN §6, Slice 3.5.7 + 6.15). Searches loose blocks
 * AND warehouse contents in one pool; picks the smallest qualifying block
 * to minimise over-payment.
 *
 * **Sign rule (Slice 6.15).** Cost may be negative (Inversion). The
 * matching rule generalises:
 *
 *   - cost > 0  → match a block with the **same sign** (non-negative)
 *                 AND |block| ≥ cost. Existing behaviour.
 *   - cost < 0  → match a block with the same sign (negative) AND
 *                 |block| ≥ |cost|. The block's value is ≤ cost in the
 *                 signed-comparison sense ("more negative").
 *   - cost = 0  → free; nothing to consume. (Note: the function still
 *                 returns true. Callers can early-return on zero too.)
 *
 * Complex blocks have a positive modulus and no meaningful "negative"
 * sign, so they qualify only for positive costs (via their modulus).
 *
 * Why one block instead of N small ones: the design wants fuel paid in
 * magnitude, not denomination — a multiplication of cost 3 happily eats
 * a single `5` (and wastes 2), but it can NOT pay with three `1`s. This
 * is what makes warehouse choice load-bearing: a `wh<10` of fives feeds
 * cheap operations efficiently, a `wh<1000` of nines wastes magnitude on
 * tier-0 operators it shouldn't have been wired to.
 *
 * Returns true on success, false if no qualifying block exists.
 */
export function spendFuel(cost: Decimal): boolean {
  if (cost.eq(Decimal.dZero)) return true;
  const wantsNegative = cost.lt(Decimal.dZero);
  const absCost = cost.abs();

  // Track the smallest qualifying source across all three pools. For rule
  // warehouses we also track the SPECIFIC value to draw — the warehouse's
  // overall smallest item may be below cost, so we can't just polymorph
  // through `withdrawFromWarehouse` for those.
  type Source =
    | { kind: 'loose'; block: PlacedBlock }
    | { kind: 'warehouse-typed'; cell: PlacedCell }
    | { kind: 'warehouse-rule'; cell: PlacedCell; value: Value };
  let bestSource: Source | null = null;
  let bestMag: Decimal | null = null;

  const consider = (mag: Decimal, src: Source): void => {
    if (bestMag === null || mag.lt(bestMag)) {
      bestSource = src;
      bestMag = mag;
    }
  };

  const qualifies = (v: Value): boolean => {
    // Slice 6.15: sign-aware matching. A block must share the cost's
    // sign before its magnitude is considered. Complex values are never
    // "negative" (no total order on ℂ), so they only fuel positive costs.
    if (valueIsNegative(v) !== wantsNegative) return false;
    return valueMagnitude(v).gte(absCost);
  };

  for (const b of blocks) {
    if (b.count <= 0) continue;
    if (!qualifies(b.value)) continue;
    consider(valueMagnitude(b.value), { kind: 'loose', block: b });
  }

  for (const c of cells) {
    if (c.type === 'warehouse') {
      const v = c.storedValue;
      if (v === null || v === undefined) continue;
      if ((c.storedCount ?? 0) <= 0) continue;
      if (!qualifies(v)) continue;
      consider(valueMagnitude(v), { kind: 'warehouse-typed', cell: c });
    } else if (c.type === 'warehouse-rule') {
      for (const item of c.ruleItems ?? []) {
        if (item.count <= 0) continue;
        if (!qualifies(item.value)) continue;
        consider(valueMagnitude(item.value), { kind: 'warehouse-rule', cell: c, value: item.value });
      }
    }
  }

  if (!bestSource) return false;
  const src = bestSource as Source;
  switch (src.kind) {
    case 'loose':
      decreaseStack(src.block, 1);
      return true;
    case 'warehouse-typed':
      withdrawFromWarehouse(src.cell);
      return true;
    case 'warehouse-rule':
      return withdrawSpecificFromRuleWarehouse(src.cell, src.value);
  }
}

/**
 * α.5c — consume a per-firing fuel ladder. For each `(value, count)`
 * entry in the ladder, pulls exactly `count` blocks of exactly that
 * value from loose pool + warehouses + rule-warehouses (combined).
 *
 * Atomic: verifies every entry is payable BEFORE consuming any.
 * Returns true if the full ladder was consumed, false otherwise (no
 * blocks spent).
 *
 * Used by tier-1+ cells under the Ladder Rule. Inversion (signed
 * single-block fuel) uses `spendFuel` / `consumeFuelOrFail` instead.
 */
export function consumeFuelLadder(ladder: Map<number, number>): boolean {
  if (ladder.size === 0) return true;

  // Phase 1: verify availability of every ladder entry.
  for (const [v, count] of ladder) {
    if (count <= 0) continue;
    const target = valueOf(v);
    const available = countMatching((val) => valueEq(val, target));
    if (available < count) return false;
  }

  // Phase 2: actually spend. Each spendValue is itself atomic per
  // value; since we verified above, none should fail.
  for (const [v, count] of ladder) {
    if (count <= 0) continue;
    if (!spendValue(valueOf(v), count)) return false;
  }
  return true;
}

/**
 * Removes one of the named value from a rule-based warehouse. Used by the
 * fuel-spend path to consume the specific qualifying block its search
 * found, rather than the smallest item the warehouse happens to hold.
 */
export function withdrawSpecificFromRuleWarehouse(
  cell: PlacedCell,
  value: Value,
): boolean {
  if (cell.type !== 'warehouse-rule') return false;
  const items = cell.ruleItems ?? [];
  const idx = items.findIndex((it) => it.count > 0 && valueEq(it.value, value));
  if (idx < 0) return false;
  items[idx].count -= 1;
  if (items[idx].count <= 0) items.splice(idx, 1);
  recompute();
  cell.refreshBadge?.();
  markDirty();
  return true;
}

// ---------------------------------------------------------------------------
// Cell operations
// ---------------------------------------------------------------------------

/**
 * Registers a placed cell of the given type at the given container.
 * Port geometry comes from `CELL_SHAPES[type]`.
 */
/**
 * Phase 6 γ.3 (DESIGN §9): warehouse capacity scales with Comprehension.
 * Baseline at Comp ≤ 2 is `WAREHOUSE_BASE_CAPACITY`; each comp doubling
 * doubles the cap. Capacity is dynamic — existing warehouses gain space
 * the moment Comprehension upgrades, without any per-warehouse state
 * change.
 *
 * Future warehouse leveling (deferred slice) will multiply `baseFactor`
 * per leveled warehouse; for γ.3 every warehouse uses the same base.
 */
const WAREHOUSE_BASE_CAPACITY = 10;

export function warehouseCapacity(comp: number = _currentComprehension): number {
  if (comp < 2) return WAREHOUSE_BASE_CAPACITY;
  const tier = Math.max(1, Math.round(Math.log2(comp)));
  return WAREHOUSE_BASE_CAPACITY * Math.pow(2, tier - 1);
}

/** Legacy default — kept for v15-era saves' `capacity` field. New
 *  warehouses don't store capacity; the dynamic `warehouseCapacity()`
 *  is consulted instead. The constant survives only so the persistence
 *  snapshot path has a number to write. */
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
  if (type === 'warehouse-rule') {
    // ruleId is installed by the caller (placement / rehydrate) once the
    // chosen predicate is known; defaults below keep the cell safe in the
    // interval between addCell and the caller's assignment.
    placed.ruleItems = [];
    placed.capacity = WAREHOUSE_DEFAULT_CAPACITY;
  }
  if (
    type === 'cultivation-arithmetic' ||
    type === 'cultivation-geometric' ||
    type === 'cultivation-fibonacci' ||
    type === 'cultivation-harmonic' ||
    type === 'cultivation-polynomial' ||
    type === 'cultivation-factorial'
  ) {
    // Phase 6 ε.1: cultivators are now input-driven transformers. The
    // `seed` field is obsolete (kept on PlacedCell for legacy
    // back-compat) and the cooldown fields are no longer consulted —
    // firing happens via the standard pending-input path.
    placed.seed = null;
    placed.cultivationStep = 0;
    placed.cultivationCooldownMs = 0;
    placed.cultivationCooldownRemaining = 0;
  }
  if (type === 'cleanup-bot') {
    placed.botRadius = 240;
    // Legacy fields retained for save back-compat (v13). The new tick
    // (Slice 6.11) ignores them — the walk phases are the throttle.
    placed.botCooldownMs = 2500;
    placed.botCooldownRemaining = placed.botCooldownMs;
    // Phase-machine defaults. Worker starts at home, idle, empty-handed.
    placed.botPhase = 'idle';
    placed.botTargetBlockId = null;
    placed.botDestCellId = null;
    placed.botWorkerX = container.x;
    placed.botWorkerY = container.y;
    placed.botSpeed = 100;
    placed.botCarried = null;
    // T-bots cap at current comp (see `bots.ts:tickIdle`); botRating is
    // unused for them.
  }
  if (
    type === 'factor-bot' ||
    type === 'decrement-bot' ||
    type === 'inversion-bot'
  ) {
    // Decomposer bots (Phase 6 δ.1). Same walking-worker chassis as
    // T-bots, but they act on a block in place rather than carry it.
    // `botRating` is set by the caller (interaction.ts) from the
    // Literature entry — independent of player Comprehension.
    placed.botRadius = 240;
    placed.botPhase = 'idle';
    placed.botTargetBlockId = null;
    placed.botWorkerX = container.x;
    placed.botWorkerY = container.y;
    placed.botSpeed = 100;
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
/** Total items currently held in a rule-based warehouse. */
export function ruleWarehouseTotal(cell: PlacedCell): number {
  let total = 0;
  for (const item of cell.ruleItems ?? []) total += item.count;
  return total;
}

export function depositToWarehouse(cell: PlacedCell, value: Value): boolean {
  if (cell.type === 'warehouse-rule') return depositToRuleWarehouse(cell, value);
  if (cell.type !== 'warehouse') return false;
  // Phase 6 (DESIGN §9): warehouses store only what the player can comprehend.
  // Pipes that deliver into a warehouse are placement-gated above comp, so
  // pipe-delivered values are within comp by construction — this defensive
  // check matters for manual drag-drop and for T-bot deposits.
  if (!valueComprehensible(value, _currentComprehension)) return false;
  // γ.3: capacity scales with Comprehension — dynamic, not stored.
  const cap = warehouseCapacity();
  if ((cell.storedCount ?? 0) >= cap) return false;
  if (cell.storedValue === undefined || cell.storedValue === null) {
    cell.storedValue = value;
  } else if (!valueEq(cell.storedValue, value)) {
    return false;
  }
  cell.storedCount = (cell.storedCount ?? 0) + 1;
  // Total Score scans warehouses since Slice 3.5.2 — refresh before
  // notifying autosave so the header readout updates this same frame.
  recompute();
  cell.refreshBadge?.();
  markDirty();
  return true;
}

/**
 * Deposits one block into a rule-based warehouse. Refused if the predicate
 * rejects the value, the cell has no ruleId set, or the total count is at
 * capacity. Same-value items stack within `ruleItems`; new values append.
 */
export function depositToRuleWarehouse(cell: PlacedCell, value: Value): boolean {
  if (cell.type !== 'warehouse-rule') return false;
  // Universal comp rule — see `depositToWarehouse` for the rationale.
  if (!valueComprehensible(value, _currentComprehension)) return false;
  const rule = getWarehouseRule(cell.ruleId);
  if (!rule || !rule.test(value)) return false;
  const cap = warehouseCapacity();
  if (ruleWarehouseTotal(cell) >= cap) return false;

  cell.ruleItems = cell.ruleItems ?? [];
  const existing = cell.ruleItems.find((it) => valueEq(it.value, value));
  if (existing) existing.count += 1;
  else cell.ruleItems.push({ value, count: 1 });

  recompute();
  cell.refreshBadge?.();
  markDirty();
  return true;
}

/**
 * Withdraws one unit from the warehouse and returns its value, or null if
 * the warehouse is empty.
 */
export function withdrawFromWarehouse(cell: PlacedCell): Value | null {
  if (cell.type === 'warehouse-rule') return withdrawFromRuleWarehouse(cell);
  if (cell.type !== 'warehouse') return null;
  if ((cell.storedCount ?? 0) <= 0) return null;
  const value = cell.storedValue!;
  // Universal comp rule (Phase 6 β.2): a withdraw is a lift, gated by comp.
  // In practice values stored should be within comp by deposit-time check,
  // but guard against the case where a future slice (e.g. higher-rated
  // bots delivering into a warehouse) bypasses the deposit gate.
  if (!valueComprehensible(value, _currentComprehension)) return null;
  cell.storedCount = (cell.storedCount ?? 0) - 1;
  // Withdrawal that empties the warehouse unlocks the type so the player
  // (or a pipe) can repurpose it.
  if (cell.storedCount === 0) cell.storedValue = null;
  recompute();
  cell.refreshBadge?.();
  markDirty();
  return value;
}

/**
 * Peeks at the value that `withdrawFromRuleWarehouse` would return next
 * — the smallest-magnitude item present. Used by pipes (peekSource) so
 * the magnitude check happens BEFORE the destructive pull.
 */
export function peekRuleWarehouseSmallest(cell: PlacedCell): Value | null {
  if (cell.type !== 'warehouse-rule') return null;
  let best: Value | null = null;
  let bestMag: Decimal | null = null;
  for (const item of cell.ruleItems ?? []) {
    if (item.count <= 0) continue;
    const mag = valueMagnitude(item.value);
    if (bestMag === null || mag.lt(bestMag)) {
      best = item.value;
      bestMag = mag;
    }
  }
  return best;
}

/**
 * Withdraws one block from a rule-based warehouse — the smallest-magnitude
 * item present. Smallest-first matches both the fuel-spend rule (minimise
 * over-payment downstream) and the player's intuition that a mixed bin
 * empties from "small change" first.
 */
export function withdrawFromRuleWarehouse(cell: PlacedCell): Value | null {
  if (cell.type !== 'warehouse-rule') return null;
  const items = cell.ruleItems ?? [];
  if (items.length === 0) return null;

  // Smallest-magnitude FIRST that's also within comp — matches both the
  // "drain small change first" intuition and the universal comp rule
  // (Phase 6 β.2). If everything in the warehouse exceeds comp, refuse.
  let bestIdx = -1;
  let bestMag: Decimal | null = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.count <= 0) continue;
    if (!valueComprehensible(it.value, _currentComprehension)) continue;
    const mag = valueMagnitude(it.value);
    if (bestMag === null || mag.lt(bestMag)) {
      bestIdx = i;
      bestMag = mag;
    }
  }
  if (bestIdx < 0) return null;

  const item = items[bestIdx];
  const value = item.value;
  item.count -= 1;
  if (item.count <= 0) items.splice(bestIdx, 1);

  recompute();
  cell.refreshBadge?.();
  markDirty();
  return value;
}

export function allCells(): readonly PlacedCell[] {
  return cells;
}

// ---------------------------------------------------------------------------
// Cell jam (Phase 6 β.3)
// ---------------------------------------------------------------------------

/** Fan-slot geometry mirrors `spawn.ts` constants. Duplicated rather than
 *  imported to avoid a world.ts ⇄ spawn.ts cycle (spawn imports world for
 *  block lookups; world can't import back without a circular dep). */
const JAM_FAN_STEP = 40;
const JAM_MAX_FAN = 12;

/**
 * Phase 6 β.3 (DESIGN §9): a cell is "jammed" iff any of its output
 * ports has an uncomprehended block sitting in its fan range. A jammed
 * cell:
 *   - refuses to fire (no fuel burn, no input consumption)
 *   - cannot be dragged (it's pinned in place by the stuck block)
 *
 * The check walks the same fan-slot grid `planSpawnAtPort` uses, so a
 * cell that emits a `?`-block and a cell that returns 'jammed' from a
 * spawn plan agree on what 'jammed' means.
 */
export function isCellJammed(cell: PlacedCell, comp: number): boolean {
  for (const port of cell.outputs) {
    const baseX = cell.container.x + port.offsetX;
    const baseY = cell.container.y + port.offsetY;
    for (let i = 0; i < JAM_MAX_FAN; i++) {
      const x = baseX + i * JAM_FAN_STEP;
      const existing = findBlockAt(x, baseY, MERGE_EMIT_RADIUS);
      if (existing && !valueComprehensible(existing.value, comp)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fuel-port plumbing (Slice 3.5.5)
// ---------------------------------------------------------------------------

/**
 * Returns the cell's operand inputs only — fuel-port slots are filtered
 * out. Callers of `operate()` and `computationalCost()` use this so the
 * fuel block isn't mistaken for an operand.
 */
export function operandPending(cell: PlacedCell): (Value | null)[] {
  return cell.pending.filter((_, i) => (cell.inputs[i].kind ?? 'operand') !== 'fuel');
}

/** True when every operand port has a value — fuel port is allowed empty. */
export function operandsFilled(cell: PlacedCell): boolean {
  return cell.inputs.every(
    (p, i) => (p.kind ?? 'operand') === 'fuel' || cell.pending[i] !== null,
  );
}

/** Index of the cell's fuel port, or -1 if it has none. */
export function fuelPortIndex(cell: PlacedCell): number {
  return cell.inputs.findIndex((p) => p.kind === 'fuel');
}

/** True when at least one pipe terminates at this cell's fuel port. */
export function hasFuelPipeAttached(cell: PlacedCell): boolean {
  const idx = fuelPortIndex(cell);
  if (idx < 0) return false;
  for (const pipe of pipes) {
    const d = pipe.dest;
    if (d.kind === 'cell-input' && d.cellId === cell.id && d.portIndex === idx) {
      return true;
    }
  }
  return false;
}

// FuelOutcome moved to `./types` (Phase B.1).

/**
 * Slice 6.17 — registered hook for disposing a pending-input ghost
 * (fade animation rather than instant destroy). The renderer wires this
 * in `setup.ts`; world.ts stays pixi-free at the import level. Falls
 * back to a synchronous destroy when no hook is registered (tests, or
 * if the renderer hasn't initialised yet).
 */
let _disposePendingDisplay: ((display: Container) => void) | null = null;
export function setPendingDisplayDisposer(fn: (display: Container) => void): void {
  _disposePendingDisplay = fn;
}
function disposePendingDisplay(display: Container): void {
  if (_disposePendingDisplay) {
    _disposePendingDisplay(display);
    return;
  }
  display.parent?.removeChild(display);
  display.destroy({ children: true });
}

/**
 * Pays the cost for one firing, in priority order:
 *
 *   1. Manual fuel sitting in the fuel slot — consume it if large enough,
 *      reject as 'too-small' otherwise (block stays parked so the player
 *      can intervene; the design's "over-payment is wasted, under-payment
 *      is rejected" symmetry).
 *   2. Fuel pipe wired but slot empty — return 'awaiting-pipe' so the
 *      fire path stalls without falling through to the global pool. This
 *      is what DESIGN §6 means by "the operator pulls EXCLUSIVELY from
 *      that warehouse" — explicit fuel routing turns off the safety net.
 *   3. No fuel port at all, OR no pipe and slot empty — fall through to
 *      `spendFuel` (Slice 3.5.3) which scans loose blocks and warehouses
 *      for the smallest qualifying source.
 *
 * Returns `'paid'` on success; one of the failure tags otherwise. The
 * fuel block (manual or pipe-delivered) is consumed exactly once on
 * success; nothing is touched on failure.
 */
/**
 * α.5c — Ladder Rule supersedes the old single-fuel-block model. For
 * ladder cells (every tier-1+ cell EXCEPT inversion), `cost` is the
 * Decimal SUM of the ladder; the real consumption happens via the
 * ladder map. Callers in the fire path should call `fuelLadder` to
 * get the ladder and pass it here via the overload, OR just call
 * `consumeFuelLadder(ladder)` directly.
 *
 * **Inversion** keeps the old signed-Decimal contract: a single
 * sign-aware block from the wired fuel port (or, if no port, from the
 * global pool). The fuel-port slot still exists on inversion's
 * CELL_SHAPES entry for that reason.
 *
 * For non-inversion cells called with a single Decimal cost, we treat
 * `cost` as the total fuel magnitude (back-compat for tier-0 free
 * firings — they early-return 'paid').
 */
export function consumeFuelOrFail(cell: PlacedCell, cost: Decimal): FuelOutcome {
  if (cost.eq(Decimal.dZero)) return 'paid';

  // Inversion's signed-fuel contract — unchanged.
  if (cell.type === 'inversion') {
    const fuelIdx = fuelPortIndex(cell);
    if (fuelIdx < 0) {
      // No port: fall through to global signed-fuel scan.
      return spendFuel(cost) ? 'paid' : 'no-fuel';
    }
    const slotValue = cell.pending[fuelIdx];
    if (slotValue !== null && slotValue !== undefined) {
      const wantsNegative = cost.lt(Decimal.dZero);
      if (valueIsNegative(slotValue) !== wantsNegative) return 'too-small';
      const fuelMag = valueMagnitude(slotValue);
      if (fuelMag.lt(cost.abs())) return 'too-small';
      cell.pending[fuelIdx] = null;
      const display = cell.pendingDisplays[fuelIdx];
      if (display) {
        disposePendingDisplay(display);
        cell.pendingDisplays[fuelIdx] = null;
      }
      return 'paid';
    }
    // Slot empty: fall through to global pool (no required-port rule
    // for inversion under α.5c — the ladder system replaced fuel-port
    // routing for everything except inversion's signed-fuel quirk).
    if (hasFuelPipeAttached(cell)) return 'awaiting-pipe';
    return spendFuel(cost) ? 'paid' : 'no-fuel';
  }

  // α.5c: ladder cells. `cost` here is the total magnitude (a back-
  // compat sum). The real consumption uses the ladder map directly —
  // callers should use `consumeFuelLadder` on the fire path. For
  // robustness, if we got a positive cost without a ladder context,
  // fall through to single-block spending (legacy paths during the
  // migration window).
  return spendFuel(cost) ? 'paid' : 'no-fuel';
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

// Snapshot shapes moved to `./types` (Phase B.1).

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
    if (c.type === 'warehouse-rule') {
      snap.ruleWarehouseState = {
        ruleId: c.ruleId ?? '',
        items: (c.ruleItems ?? []).map((it) => ({
          value: valueSnapshot(it.value),
          count: it.count,
        })),
        capacity: c.capacity ?? WAREHOUSE_DEFAULT_CAPACITY,
      };
    }
    if (c.type === 'filter') {
      snap.filterState = { ruleId: c.ruleId ?? '' };
    }
    if (
      c.type === 'cultivation-arithmetic' ||
      c.type === 'cultivation-geometric' ||
      c.type === 'cultivation-fibonacci' ||
      c.type === 'cultivation-harmonic' ||
      c.type === 'cultivation-polynomial' ||
      c.type === 'cultivation-factorial'
    ) {
      const cooldownMs = c.cultivationCooldownMs ?? 2000;
      snap.cultivationState = {
        seed: c.seed ? valueSnapshot(c.seed) : null,
        cultivationStep: c.cultivationStep ?? 0,
        cultivationCooldownMs: cooldownMs,
        cultivationCooldownRemaining: c.cultivationCooldownRemaining ?? cooldownMs,
      };
    }
    if (
      c.type === 'cleanup-bot' ||
      c.type === 'factor-bot' ||
      c.type === 'decrement-bot' ||
      c.type === 'inversion-bot'
    ) {
      // Phase-machine fields persist so a worker mid-walk picks up where
      // it left off after a reload. Cell-id and block-id refs are saved
      // raw — on load, the rehydrator (and the next tick) re-resolves them
      // against the new world's id space; unresolvable refs fall back to
      // idle. (Block ids reset on reset-world but persist within a save.)
      // Decomposer bots additionally persist `botRating` (Phase 6 δ.1).
      snap.botState = {
        botRadius: c.botRadius ?? 240,
        botCooldownMs: c.botCooldownMs ?? 2500,
        botCooldownRemaining: c.botCooldownRemaining ?? c.botCooldownMs ?? 2500,
        botPhase: c.botPhase ?? 'idle',
        botTargetBlockId: c.botTargetBlockId ?? null,
        botDestCellId: c.botDestCellId ?? null,
        botWorkerX: c.botWorkerX ?? c.container.x,
        botWorkerY: c.botWorkerY ?? c.container.y,
        botSpeed: c.botSpeed ?? 100,
        botCarried: c.botCarried ? valueSnapshot(c.botCarried) : null,
        botRating: c.botRating,
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
  _comprehension.set(2); // Phase 6 baseline (DESIGN §9)
  _cellLevels.set(new Map());
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
