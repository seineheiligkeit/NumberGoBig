/**
 * Drag controller — wiring layer.
 *
 * Phase B.3c (2026-05-17): split out of the 1840-line monolith. The
 * `createDragController` factory below assembles the controller's shared
 * `ControllerCtx`, installs the persistent output-click listener, wires
 * the various `setXBlockInteractionAttach` hooks back to
 * `attachBlockInteraction`, and exposes the eight-method public
 * `DragController` interface by delegating to the mode functions in
 * `modes.ts`, `attach.ts`, and `rehydration.ts`.
 *
 * Sibling files:
 *   - `helpers.ts`     — pure helpers (no `ctx.state` writes)
 *   - `attach.ts`      — drag-block + cell-firing + attach handlers
 *   - `modes.ts`       — entry-mode functions + persistent listener
 *   - `rehydration.ts` — save/load entity restoration
 *
 * Phase B.3b's ctx pattern: every helper takes a `ControllerCtx` first
 * arg. `mode` is wrapped in `ctx.state` so mutations are visible across
 * the controller's lifetime.
 */

import type { Application, Container, FederatedPointerEvent } from 'pixi.js';

import { setCultivationBlockInteractionAttach } from '../cultivation';
import { fadeAndDestroy } from '../pixi/micro-anim';
import { setFilterBlockInteractionAttach } from '../filter';
import { setSpawnBlockInteractionAttach } from '../spawn';
import {
  setPendingDisplayDisposer,
  type PipeEndpoint,
  type PlacedBlock,
  type PlacedCell,
} from '../world';
import type { CellType } from '../../../core/cell-types';
import { setPipeBlockInteractionAttach } from '../pipe';
import { showMarginalia } from '../marginalia';
import { type Value } from '../../../core/value';
import { attachBlockInteraction, beginDrag } from './attach';
import {
  beginBlueprintPlacement as beginBlueprintPlacementMode,
  beginBlueprintSelection as beginBlueprintSelectionMode,
  beginCellPlacement as beginCellPlacementMode,
  beginPipePlacement as beginPipePlacementMode,
  installOutputClickListener,
} from './modes';
import {
  rehydrateBlock as rehydrateBlockImpl,
  rehydrateCell as rehydrateCellImpl,
  rehydratePipe as rehydratePipeImpl,
} from './rehydration';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export type InteractionMode =
  | 'idle'
  | 'dragging'
  | 'placing'
  | 'placing-pipe'
  | 'rerouting-pipe'
  | 'blueprint-select'
  | 'blueprint-stamp'
  | 'moving-cell';

export interface DragController {
  beginDragFromRiver(event: FederatedPointerEvent, value: Value): void;
  beginCellPlacement(type: CellType, options?: { ruleId?: string; botRating?: number }): void;
  /** Two-click pipe placement: source then destination. */
  beginPipePlacement(magnitude: number, cooldownMs?: number): void;
  /** Rect-drag a region; on release, prompt for a name and save as
   *  Blueprint (Slice 5.4). ESC cancels. */
  beginBlueprintSelection(): void;
  /** Click on canvas to stamp a copy of the Blueprint at that position. */
  beginBlueprintPlacement(blueprintId: string): void;
  /** Restores a placed block at the given canvas coordinates. */
  rehydrateBlock(value: Value, count: number, x: number, y: number): void;
  /** Restores a placed cell with optional pending input + per-type state. */
  rehydrateCell(
    type: CellType,
    x: number,
    y: number,
    pending: (Value | null)[],
    warehouseState?: {
      storedValue: Value | null;
      storedCount: number;
      capacity: number;
    },
    cultivationState?: {
      seed: Value | null;
      cultivationStep: number;
      cultivationCooldownMs: number;
      cultivationCooldownRemaining?: number;
    },
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
      botCarried?: Value | null;
      botRating?: number;
    },
    ruleWarehouseState?: {
      ruleId: string;
      items: { value: Value; count: number }[];
      capacity: number;
    },
    filterState?: { ruleId: string },
  ): void;
  /** Restores a placed pipe. `cooldownRemaining` defaults to `cooldownMs`. */
  rehydratePipe(
    source: PipeEndpoint,
    dest: PipeEndpoint,
    magnitude: number,
    cooldownMs: number,
    cooldownRemaining?: number,
  ): void;
}

// ---------------------------------------------------------------------------
// ControllerCtx — shared state object passed to every mode function
// ---------------------------------------------------------------------------
//
// Every helper takes a `ControllerCtx` as its first argument instead of
// capturing `app`, `canvasLayer`, and `mode` via closure. The mode is
// boxed in `state` so functions can mutate `state.mode` and have the
// change be visible to every other function holding the ctx.

export interface ControllerCtx {
  app: Application;
  canvasLayer: Container;
  state: { mode: InteractionMode };
}

// `PlacedBlock` / `PlacedCell` are re-exported so existing import sites
// that go through `./interaction` for these don't break. (They live in
// `world.ts`; this is just a pass-through.)
export type { PlacedBlock, PlacedCell };

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _controller: DragController | null = null;

export function getController(): DragController {
  if (!_controller) {
    throw new Error('Drag controller not yet initialized (call createDragController first)');
  }
  return _controller;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDragController(app: Application, canvasLayer: Container): DragController {
  const ctx: ControllerCtx = {
    app,
    canvasLayer,
    state: { mode: 'idle' },
  };

  installOutputClickListener(ctx);

  // Hook blocks fired by automation back into the pickup path so the player
  // can still grab them by hand (when within Comprehension). The shared
  // spawn module owns the singleton (Slice 5.7); the older per-module
  // setters are now no-ops kept for back-compat.
  setSpawnBlockInteractionAttach((block) => attachBlockInteraction(ctx, block));
  setPipeBlockInteractionAttach((block) => attachBlockInteraction(ctx, block));
  setCultivationBlockInteractionAttach((block) => attachBlockInteraction(ctx, block));
  setFilterBlockInteractionAttach((block) => attachBlockInteraction(ctx, block));

  // Slice 6.17: world.ts dispatches pending-display destruction through
  // this hook so consumed fuel-slot ghosts get the same fade animation
  // as operand ghosts (kept here in interaction.ts because world.ts is
  // pixi-free at the import level).
  setPendingDisplayDisposer(fadeAndDestroy);

  const controller: DragController = {
    beginDragFromRiver(event: FederatedPointerEvent, value: Value): void {
      if (ctx.state.mode !== 'idle') return;
      showMarginalia('You picked up a zero. Auspicious.', 'first_pickup');
      beginDrag(ctx, value, event.global.x, event.global.y);
    },
    beginCellPlacement(type, options) {
      beginCellPlacementMode(ctx, type, options);
    },
    beginPipePlacement(magnitude, cooldownMs) {
      beginPipePlacementMode(ctx, magnitude, cooldownMs);
    },
    beginBlueprintSelection() {
      beginBlueprintSelectionMode(ctx);
    },
    beginBlueprintPlacement(blueprintId) {
      beginBlueprintPlacementMode(ctx, blueprintId);
    },
    rehydrateBlock(value, count, x, y) {
      rehydrateBlockImpl(ctx, value, count, x, y);
    },
    rehydrateCell(type, x, y, pending, warehouseState, cultivationState, botState, ruleWarehouseState, filterState) {
      rehydrateCellImpl(ctx, type, x, y, pending, warehouseState, cultivationState, botState, ruleWarehouseState, filterState);
    },
    rehydratePipe(source, dest, magnitude, cooldownMs, cooldownRemaining) {
      rehydratePipeImpl(ctx, source, dest, magnitude, cooldownMs, cooldownRemaining);
    },
  };

  _controller = controller;
  return controller;
}
