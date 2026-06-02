/**
 * Save/load rehydration — invoked by `persistence.ts` to recreate the
 * placed-block, placed-cell, and placed-pipe state from a snapshot.
 *
 * Phase B.3c: extracted out of `interaction/index.ts`. Imports
 * `attachBlockInteraction` and `attachCellInteraction` from `attach.ts`
 * to wire interactivity onto every restored entity — same path the
 * fresh-placement and blueprint-stamp flows use, so re-attached blocks
 * behave indistinguishably from freshly placed ones.
 */

import { drawBlock, updateStackBadge } from '../pixi/block';
import { updateCostBadge } from '../pixi/binary-cell';
import { updateCultivationBadge } from '../pixi/cultivation-cell';
import { getBotHandles } from '../pixi/cleanup-bot';
import { drawPipe } from '../pixi/pipe-visual';
import {
  addBlock,
  addCell,
  addPipe,
  cellLevel,
  refreshTotals,
  type PipeEndpoint,
} from '../world';
import { pipeEndpointDirection, pipeEndpointPosition, registerPipeRuntime } from '../pipe';
import { isCultivationType, type CellType } from '../../../core/cell-types';
import { type Value } from '../../../core/value';
import {
  drawCellByType,
  installWarehouseRefresh,
  makePendingDisplay,
} from './helpers';
import { attachBlockInteraction, attachCellInteraction } from './attach';
import type { ControllerCtx } from './index';

export function rehydrateBlock(ctx: ControllerCtx, value: Value, count: number, x: number, y: number): void {
  const container = drawBlock(value, x, y);
  ctx.canvasLayer.addChild(container);
  const placed = addBlock(container, value, count);
  attachBlockInteraction(ctx, placed);
  updateStackBadge(placed);
}

export function rehydrateCell(
  ctx: ControllerCtx,
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
  batteryState?: { mode: 'add' | 'divide' | 'negate' | 'feed' },
): void {
  // Rule warehouses AND filters need their predicate id at draw time
  // (it picks the centre glyph/label), so peek the state before
  // calling drawCellByType.
  const ruleId =
    type === 'warehouse-rule'
      ? ruleWarehouseState?.ruleId
      : type === 'filter'
        ? filterState?.ruleId
        : undefined;
  const container = drawCellByType(type, ruleId);
  container.x = x;
  container.y = y;
  ctx.canvasLayer.addChild(container);
  const placed = addCell(type, container);
  if (type === 'warehouse') {
    installWarehouseRefresh(placed);
    if (warehouseState) {
      placed.storedValue = warehouseState.storedValue;
      placed.storedCount = warehouseState.storedCount;
      placed.capacity = warehouseState.capacity;
      placed.refreshBadge?.();
      // Slice 3.5.2: rehydrated warehouse contents feed Total Score —
      // refresh so a save with warehouses but no loose blocks still
      // shows the correct headline number.
      refreshTotals();
    }
  }
  if (type === 'warehouse-rule') {
    installWarehouseRefresh(placed);
    if (ruleWarehouseState) {
      placed.ruleId = ruleWarehouseState.ruleId;
      placed.ruleItems = ruleWarehouseState.items.map((it) => ({
        value: it.value,
        count: it.count,
      }));
      placed.capacity = ruleWarehouseState.capacity;
      placed.refreshBadge?.();
      refreshTotals();
    }
  }
  if (type === 'filter' && filterState) {
    placed.ruleId = filterState.ruleId;
  }
  if (type === 'battery') {
    placed.batteryMode = batteryState?.mode ?? 'add';
  }
  if (isCultivationType(type) && cultivationState) {
    placed.seed = cultivationState.seed;
    placed.cultivationStep = cultivationState.cultivationStep;
    placed.cultivationCooldownMs = cultivationState.cultivationCooldownMs;
    // Honour the saved remaining cooldown so a near-ready cultivation
    // doesn't reset its whole cadence on reload. Older saves omit the
    // field and we fall back to a fresh cooldown.
    placed.cultivationCooldownRemaining =
      cultivationState.cultivationCooldownRemaining ?? cultivationState.cultivationCooldownMs;
    updateCultivationBadge(placed);
  }
  if (
    (type === 'cleanup-bot' ||
      type === 'factor-bot' ||
      type === 'decrement-bot' ||
      type === 'inversion-bot') &&
    botState
  ) {
    placed.botRadius = botState.botRadius;
    placed.botCooldownMs = botState.botCooldownMs;
    placed.botCooldownRemaining = botState.botCooldownRemaining;
    // Phase-machine fields (Slice 6.11). Pre-v14 saves omit them and
    // we fall through to the addCell defaults: idle, worker at home,
    // empty-handed. Cell-id and block-id refs are validated lazily by
    // the next tick — unresolvable refs revert to idle.
    placed.botPhase = botState.botPhase ?? 'idle';
    placed.botTargetBlockId = botState.botTargetBlockId ?? null;
    placed.botDestCellId = botState.botDestCellId ?? null;
    placed.botWorkerX = botState.botWorkerX ?? placed.container.x;
    placed.botWorkerY = botState.botWorkerY ?? placed.container.y;
    placed.botSpeed = botState.botSpeed ?? 100;
    placed.botCarried = botState.botCarried ?? null;
    // Phase 6 δ.1: decomposer-bot rating (T-bots don't use this).
    placed.botRating = botState.botRating;
    // Push the saved walk progress into the visual so a save loaded
    // mid-carry shows the worker where it was, with its block in
    // hand. The next tick keeps walking from here.
    const handles = getBotHandles(placed.container);
    if (handles) {
      handles.setWorkerLocal(
        (placed.botWorkerX ?? placed.container.x) - placed.container.x,
        (placed.botWorkerY ?? placed.container.y) - placed.container.y,
      );
      handles.setCarried(placed.botCarried);
    }
  }
  // Restore pending input displays without re-firing the cell.
  for (let i = 0; i < pending.length && i < placed.inputs.length; i++) {
    const v = pending[i];
    if (v === null) continue;
    placed.pending[i] = v;
    const port = placed.inputs[i];
    const display = makePendingDisplay(v);
    display.x = port.offsetX;
    display.y = port.offsetY;
    placed.container.addChild(display);
    placed.pendingDisplays[i] = display;
  }
  // Reflect any restored pending state on the cost-preview badge.
  updateCostBadge(placed, cellLevel(placed.type));
  attachCellInteraction(ctx, placed);
}

export function rehydratePipe(
  ctx: ControllerCtx,
  source: PipeEndpoint,
  dest: PipeEndpoint,
  magnitude: number,
  cooldownMs: number,
  cooldownRemaining?: number,
): void {
  const srcPos = pipeEndpointPosition(source);
  const dstPos = pipeEndpointPosition(dest);
  if (!srcPos || !dstPos) {
    // Source or dest cell missing — skip. Could happen if the schema
    // changes; the player loses a pipe but the world stays consistent.
    return;
  }
  const visual = drawPipe(
    srcPos,
    dstPos,
    magnitude,
    pipeEndpointDirection(source),
    pipeEndpointDirection(dest),
  );
  ctx.canvasLayer.addChild(visual.container);
  const placed = addPipe(source, dest, magnitude, visual.container, cooldownMs);
  if (typeof cooldownRemaining === 'number') placed.cooldownRemaining = cooldownRemaining;
  registerPipeRuntime(placed.id, {
    pulse: visual.pulse,
    redraw: visual.redraw,
    setJammed: visual.setJammed,
    hitTest: visual.hitTest,
    destroy: visual.destroy,
  });
}
