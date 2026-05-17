/**
 * World types — every interface/type exposed by the world module.
 *
 * Phase B.1 (2026-05-17): extracted out of `world/index.ts` so the
 * shape of every entity (`PlacedBlock`, `PlacedCell`, `PlacedPipe`,
 * `PipeEndpoint`) and every persistence snapshot
 * (`BlockSnapshot`, `CellSnapshot`, `PipeSnapshot`) has a single home
 * separate from the runtime mutators.
 *
 * Pure types — no Svelte stores, no Pixi side-effects, no module state.
 * `Container` / `Text` from pixi.js are referenced as type-only imports
 * for the renderer handles each entity carries.
 *
 * Re-exported from `world/index.ts` so existing `from '../lib/world'`
 * imports continue to resolve types through the facade.
 */

import type { Container, Text } from 'pixi.js';
import type { CellInputPort, CellOutputPort, CellType } from '../../../core/cell-types';
import type { Value, ValueSnapshot } from '../../../core/value';

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

export interface PlacedBlock {
  id: number;
  container: Container;
  value: Value;
  count: number;
  badge: Text | null;
}

// ---------------------------------------------------------------------------
// Cell
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

  // --- Rule-warehouse-specific state (Slice 3.5.4) --------------------
  /** Predicate identifier (e.g. 'lt10', 'prime'). Set on placement. */
  ruleId?: string;
  /** Mixed-value contents. A rule warehouse may hold many distinct values
   *  matching its predicate; `capacity` caps the total count across items. */
  ruleItems?: { value: Value; count: number }[];

  // --- Cultivation-specific state -------------------------------------
  /** Captured seed value; `null` until the player drops a seed on the input. */
  seed?: Value | null;
  /** Step index (0-based). Increments per emission. */
  cultivationStep?: number;
  /** Emission cooldown in ms. */
  cultivationCooldownMs?: number;
  /** Time remaining on the current cooldown. */
  cultivationCooldownRemaining?: number;

  // --- Bot state (Slice 3.6 + 6.11 + δ.1) ------------------------------
  /** Search radius in canvas pixels, anchored on the bot's home position. */
  botRadius?: number;
  /** Phase 6 δ.1: per-bot magnitude rating. For decomposer bots
   *  (factor-bot / decrement-bot / inversion-bot) this is independent
   *  of player Comprehension — fixed at purchase. For cleanup-bot
   *  (T-bot) the bot caps at the player's current comp (see `bots.ts`
   *  `tickIdle`), so this field is unused there. */
  botRating?: number;
  /** Legacy field — Phase 2 had instant-transfer bots on a fixed cooldown.
   *  Slice 6.11 made bots walk; the phase machine itself is the throttle.
   *  Field retained so v13 saves restore cleanly. */
  botCooldownMs?: number;
  /** Same — legacy. */
  botCooldownRemaining?: number;
  /** Slice 6.11 phase machine. */
  botPhase?: 'idle' | 'approaching' | 'returning' | 'going-home';
  /** Block id the bot has claimed as its current target (during approaching). */
  botTargetBlockId?: number | null;
  /** Cell id of the destination warehouse (during returning). */
  botDestCellId?: number | null;
  /** Walking worker's current canvas position. Initialised to the bot's
   *  home (placement) position; advances toward the active target each tick. */
  botWorkerX?: number;
  botWorkerY?: number;
  /** Walk speed in canvas pixels per second. */
  botSpeed?: number;
  /** The Value the worker is carrying (during returning). null otherwise. */
  botCarried?: Value | null;
}

// ---------------------------------------------------------------------------
// Pipe
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

// ---------------------------------------------------------------------------
// Fuel-port outcome (Slice 3.5.5 + 6.15)
// ---------------------------------------------------------------------------

export type FuelOutcome = 'paid' | 'awaiting-pipe' | 'too-small' | 'no-fuel';

// ---------------------------------------------------------------------------
// Persistence snapshots (Slice 2.7 → Phase 6 δ.1)
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
  /** Rule-warehouse cells only (Slice 3.5.4) — mixed-value storage. */
  ruleWarehouseState?: {
    ruleId: string;
    items: { value: ValueSnapshot; count: number }[];
    capacity: number;
  };
  /** Filter cells only (Slice 5.2) — predicate id only; no stored values. */
  filterState?: {
    ruleId: string;
  };
  /** Cultivation cells only — seed, step, and remaining cooldown. */
  cultivationState?: {
    seed: ValueSnapshot | null;
    cultivationStep: number;
    cultivationCooldownMs: number;
    cultivationCooldownRemaining?: number;
  };
  /** Bot cells (cleanup-bot + decomposer family) — config + phase
   *  state. Slice 6.11 added the phase fields; Phase 6 δ.1 added
   *  `botRating` (decomposer bots only). Pre-v14 saves carry only the
   *  legacy cooldown trio and the rehydrator falls back to safe defaults. */
  botState?: {
    botRadius: number;
    botCooldownMs: number;
    botCooldownRemaining: number;
    botPhase?: 'idle' | 'approaching' | 'returning' | 'going-home';
    botTargetBlockId?: number | null;
    botDestCellId?: number | null;
    botWorkerX?: number;
    botWorkerY?: number;
    botSpeed?: number;
    botCarried?: ValueSnapshot | null;
    /** Phase 6 δ.1: per-bot magnitude rating (decomposer family). */
    botRating?: number;
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
