/**
 * Entry-mode functions — beginCellPlacement, beginPipePlacement,
 * beginPipeReroute, beginBlueprintSelection, beginBlueprintPlacement,
 * plus stampBlueprint and the persistent output-click listener.
 *
 * Each `begin*` function transitions `ctx.state.mode` away from `'idle'`,
 * installs window-level pointer listeners, and cleans up on commit /
 * cancel. None of them call each other directly — `installOutputClickListener`
 * (the persistent listener installed at controller creation) is the
 * only function here that *enters* another mode (pipe-reroute or drag-
 * from-warehouse).
 */

import type { PlacedPipe, PipeEndpoint } from '../world';
import { Graphics } from 'pixi.js';
import {
  addCell,
  addPipe,
  allCells,
  comprehensionLevel,
  type PlacedCell,
} from '../world';
import { onCameraChange, screenToCanvas } from '../camera';
import { drawPipe, type PipeVisualHandles } from '../pixi/pipe-visual';
import {
  deletePipe,
  findPipeAt,
  findPipeEndpointAt,
  previewPipeEndpoint,
  refreshPipeVisual,
  setPipeEndpoint,
  pipeEndpointPosition,
  pipeEndpointDirection,
  registerPipeRuntime,
} from '../pipe';
import { findCellOutputPortAt, withdrawFromWarehouse } from '../world';
import {
  createBlueprint,
  findBlueprint,
  type BlueprintDef,
} from '../blueprints';
import { PENCIL_CURSOR_URL } from '../cursors';
import { showMarginalia } from '../marginalia';
import type { CellType } from '../../../core/cell-types';
import {
  drawCellByType,
  endpointsEqual,
  installWarehouseRefresh,
  placementMarginalia,
  rectOf,
  resolvePipeEndpoint,
} from './helpers';
import type { BatteryMode } from '../pixi/battery-cell';
import { attachCellInteraction, beginDrag } from './attach';
import { rehydratePipe } from './rehydration';
import type { ControllerCtx } from './index';

// ---------------------------------------------------------------------------
// Cell placement mode
// ---------------------------------------------------------------------------

export function beginCellPlacement(ctx: ControllerCtx, type: CellType, options?: { ruleId?: string; botRating?: number; batteryMode?: BatteryMode }): void {
  if (ctx.state.mode !== 'idle') return;
  ctx.state.mode = 'placing';

  const ruleId = options?.ruleId;
  const botRating = options?.botRating;
  const batteryMode = options?.batteryMode;
  const rect = rectOf(ctx);
  const ghost = drawCellByType(type, ruleId, batteryMode);
  ghost.alpha = 0.7;
  ctx.canvasLayer.addChild(ghost);

  document.body.style.cursor = 'crosshair';

  const onMove = (e: PointerEvent): void => {
    const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    ghost.x = c.x;
    ghost.y = c.y;
  };

  const onClick = (e: PointerEvent): void => {
    // Left mouse only; ignore middle-button (pan) and right-click.
    if (e.button !== 0) return;
    const { x, y } = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);

    ghost.x = x;
    ghost.y = y;
    ghost.alpha = 1;

    const placed = addCell(type, ghost);
    if (type === 'warehouse') installWarehouseRefresh(placed);
    if (type === 'warehouse-rule') {
      placed.ruleId = ruleId;
      installWarehouseRefresh(placed);
    }
    if (type === 'filter') {
      placed.ruleId = ruleId;
    }
    if (
      (type === 'factor-bot' ||
        type === 'decrement-bot' ||
        type === 'inversion-bot') &&
      botRating !== undefined
    ) {
      // Phase 6 δ.1: bot rating is pinned at placement, independent
      // of player Comprehension. The bot will act on any block of
      // magnitude ≤ this rating, even uncomprehended ones.
      placed.botRating = botRating;
    }
    if (type === 'battery') {
      placed.batteryMode = batteryMode ?? 'add';
    }
    attachCellInteraction(ctx, placed);

    const note = placementMarginalia(type);
    if (note) showMarginalia(note.text, note.key);

    cleanup();
  };

  const cleanup = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onClick);
    document.body.style.cursor = PENCIL_CURSOR_URL;
    ctx.state.mode = 'idle';
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onClick);
}

// ---------------------------------------------------------------------------
// Pipe placement mode
// ---------------------------------------------------------------------------

export function beginPipePlacement(ctx: ControllerCtx, magnitude: number, cooldownMs = 1000): void {
  if (ctx.state.mode !== 'idle') return;
  ctx.state.mode = 'placing-pipe';

  const rect = rectOf(ctx);
  let source: PipeEndpoint | null = null;
  let ghost: PipeVisualHandles | null = null;
  // Last cursor canvas-coord, used to redraw the ghost on camera change.
  let lastCursor: { x: number; y: number } | null = null;

  document.body.style.cursor = 'crosshair';

  showMarginalia(
    'Click a cell output (or the river) to start the pipe.',
    'pipe_placement_hint',
  );

  const currentSourcePos = (): { x: number; y: number } | null =>
    source ? pipeEndpointPosition(source) : null;

  // Re-projects the ghost on any camera move so river-anchored sources
  // stay locked to the river while the player drags the dest endpoint.
  // Unsubscribe on cleanup so each placement doesn't leak a listener.
  const unsubCamera = onCameraChange(() => {
    if (!ghost || !source || !lastCursor) return;
    const sp = currentSourcePos();
    if (!sp) return;
    // Source has a port tangent; cursor (dest preview) has none.
    ghost.redraw(sp, lastCursor, pipeEndpointDirection(source), null);
  });

  const onMove = (e: PointerEvent): void => {
    const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    lastCursor = c;
    if (!source || !ghost) return;
    const sp = currentSourcePos();
    if (!sp) return;
    ghost.redraw(sp, c, pipeEndpointDirection(source), null);
  };

  const onClick = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = screenToCanvas(sx, sy);
    lastCursor = { x, y };

    if (!source) {
      const hit = resolvePipeEndpoint(ctx, 'source', x, y, sx, sy);
      if (!hit) {
        showMarginalia(
          'A pipe source must be a cell output or the river.',
          'pipe_source_hint',
        );
        return;
      }
      source = hit.endpoint;
      // Source tangent comes from the port; dest is still the cursor
      // until the second click resolves it.
      ghost = drawPipe(hit.pos, { x, y }, magnitude, pipeEndpointDirection(hit.endpoint), null);
      ghost.container.alpha = 0.55;
      ctx.canvasLayer.addChild(ghost.container);
      return;
    }

    const hit = resolvePipeEndpoint(ctx, 'dest', x, y, sx, sy);
    if (!hit) {
      showMarginalia(
        'A pipe destination must be a cell or warehouse input port.',
        'pipe_dest_hint',
      );
      return;
    }
    if (!ghost) return;
    const sp = currentSourcePos();
    if (!sp) return;
    ghost.container.alpha = 1;
    ghost.redraw(
      sp,
      hit.pos,
      pipeEndpointDirection(source),
      pipeEndpointDirection(hit.endpoint),
    );

    const placed = addPipe(source, hit.endpoint, magnitude, ghost.container, cooldownMs);
    registerPipeRuntime(placed.id, {
      pulse: ghost.pulse,
      redraw: ghost.redraw,
      setJammed: ghost.setJammed,
      hitTest: ghost.hitTest,
      destroy: ghost.destroy,
    });

    cleanup();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (ghost) {
      ctx.canvasLayer.removeChild(ghost.container);
      ghost.container.destroy({ children: true });
    }
    showMarginalia('Pipe placement cancelled.', 'pipe_cancelled');
    cleanup();
  };

  const cleanup = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onClick);
    window.removeEventListener('keydown', onKey);
    unsubCamera();
    document.body.style.cursor = PENCIL_CURSOR_URL;
    ctx.state.mode = 'idle';
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onClick);
  window.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------------------------
// Pipe reroute mode (Slice 6.12)
// ---------------------------------------------------------------------------

/**
 * Drags one end of a pipe to a new compatible port. Captures the original
 * endpoint for snap-back, previews the curve following the cursor each
 * pointermove, and on pointerup either commits to a resolved port
 * (`resolvePipeEndpoint` is the same validator the fresh-placement flow
 * uses) or restores the original. Click-without-drag is a deliberate no-op
 * so a misfire costs nothing.
 */
function beginPipeReroute(ctx: ControllerCtx, pipe: PlacedPipe, end: 'source' | 'dest'): void {
  if (ctx.state.mode !== 'idle') return;
  ctx.state.mode = 'rerouting-pipe';
  document.body.style.cursor = 'crosshair';
  const original = end === 'source' ? pipe.source : pipe.dest;
  let moved = false;

  const onMove = (ev: PointerEvent): void => {
    const r = rectOf(ctx);
    const sx = ev.clientX - r.left;
    const sy = ev.clientY - r.top;
    const c = screenToCanvas(sx, sy);
    // Only flip `moved` once we've passed a small threshold — a tiny
    // wobble during a click shouldn't be treated as a drag.
    if (!moved) {
      const origPos = pipeEndpointPosition(original);
      if (origPos && Math.hypot(c.x - origPos.x, c.y - origPos.y) > 4) {
        moved = true;
      }
    }
    if (moved) previewPipeEndpoint(pipe, end, c);
  };

  const onUp = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    if (!moved) {
      // Pure click — no preview was ever shown, no commit needed. The
      // visual is unchanged. Stay quiet so accidental clicks don't
      // surface narrator chatter.
      cleanup();
      return;
    }
    const r = rectOf(ctx);
    const sx = ev.clientX - r.left;
    const sy = ev.clientY - r.top;
    const c = screenToCanvas(sx, sy);
    const hit = resolvePipeEndpoint(ctx, end, c.x, c.y, sx, sy);
    if (hit && !endpointsEqual(original, hit.endpoint)) {
      setPipeEndpoint(pipe, end, hit.endpoint);
      showMarginalia('Pipe re-routed.', 'pipe_rerouted');
    } else {
      // No compatible target OR same endpoint as before — snap back.
      refreshPipeVisual(pipe);
      if (!hit) {
        showMarginalia(
          end === 'source'
            ? 'A pipe source must be a cell output or the river.'
            : 'A pipe destination must be a cell or warehouse input port.',
          'pipe_reroute_invalid',
        );
      }
    }
    cleanup();
  };

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    if (moved) refreshPipeVisual(pipe);
    cleanup();
  };

  const cleanup = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    document.body.style.cursor = PENCIL_CURSOR_URL;
    ctx.state.mode = 'idle';
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------------------------
// Blueprint capture + stamp modes
// ---------------------------------------------------------------------------

/**
 * Stamps a Blueprint onto the canvas at the given offset (Slice 5.4).
 * Cells go down first in declaration order, so the captured pipe
 * indices map cleanly to the new cell ids. Pipes use rehydratePipe so
 * their visuals + simulation runtime are registered the same way as
 * a save-restore.
 */
function stampBlueprint(ctx: ControllerCtx, bp: BlueprintDef, offsetX: number, offsetY: number): void {
  const newCellIds: number[] = [];
  for (const snap of bp.cells) {
    const ruleId =
      snap.type === 'warehouse-rule'
        ? snap.ruleWarehouseState?.ruleId
        : snap.type === 'filter'
          ? snap.filterState?.ruleId
          : undefined;
    const container = drawCellByType(snap.type as CellType, ruleId);
    container.x = offsetX + snap.x;
    container.y = offsetY + snap.y;
    ctx.canvasLayer.addChild(container);
    const placed = addCell(snap.type as CellType, container);

    if (snap.type === 'warehouse') {
      installWarehouseRefresh(placed);
    }
    if (snap.type === 'warehouse-rule') {
      placed.ruleId = snap.ruleWarehouseState?.ruleId;
      placed.capacity = snap.ruleWarehouseState?.capacity ?? placed.capacity;
      installWarehouseRefresh(placed);
    }
    if (snap.type === 'filter') {
      placed.ruleId = snap.filterState?.ruleId;
    }
    attachCellInteraction(ctx, placed);
    newCellIds.push(placed.id);
  }

  for (const pipeDef of bp.pipes) {
    const srcCellId = newCellIds[pipeDef.sourceCellIdx];
    const dstCellId = newCellIds[pipeDef.destCellIdx];
    if (srcCellId === undefined || dstCellId === undefined) continue;
    const source: PipeEndpoint = {
      kind: 'cell-output',
      cellId: srcCellId,
      portIndex: pipeDef.sourcePortIdx,
    };
    const dest: PipeEndpoint = {
      kind: 'cell-input',
      cellId: dstCellId,
      portIndex: pipeDef.destPortIdx,
    };
    rehydratePipe(ctx, source, dest, pipeDef.magnitude, pipeDef.cooldownMs);
  }
}

export function beginBlueprintSelection(ctx: ControllerCtx): void {
  if (ctx.state.mode !== 'idle') return;
  ctx.state.mode = 'blueprint-select';
  const rect = rectOf(ctx);

  showMarginalia(
    'Drag a rectangle around the cells you want to bundle. Release to name and save.',
    'blueprint_select_hint',
  );

  document.body.style.cursor = 'crosshair';

  const ghost = new Graphics();
  ghost.alpha = 0.85;
  ctx.canvasLayer.addChild(ghost);

  let start: { x: number; y: number } | null = null;
  let lastCursor: { x: number; y: number } | null = null;

  const drawGhost = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
    ghost.clear();
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ghost.rect(x, y, w, h);
    ghost.stroke({ color: 0xc9aa30, width: 2, alpha: 0.85 });
    ghost.fill({ color: 0xf4e68a, alpha: 0.18 });
  };

  const cellsInsideBox = (a: { x: number; y: number }, b: { x: number; y: number }): PlacedCell[] => {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const out: PlacedCell[] = [];
    for (const c of allCells()) {
      const cx = c.container.x;
      const cy = c.container.y;
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.push(c);
    }
    return out;
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    start = c;
    lastCursor = c;
    drawGhost(start, lastCursor);
  };

  const onMove = (e: PointerEvent): void => {
    const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    lastCursor = c;
    if (start) drawGhost(start, c);
  };

  const onUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (!start || !lastCursor) return;
    const picked = cellsInsideBox(start, lastCursor);
    if (picked.length === 0) {
      showMarginalia('No cells captured. Try again.', 'blueprint_select_empty');
      // Reset for another rect; don't exit mode.
      start = null;
      lastCursor = null;
      ghost.clear();
      return;
    }
    const name = window.prompt(
      `Name this blueprint (${picked.length} cell${picked.length === 1 ? '' : 's'}):`,
      '',
    );
    if (name && name.trim().length > 0) {
      const bp = createBlueprint(name.trim(), picked);
      if (bp) {
        showMarginalia(
          `Blueprint "${bp.name}" saved. ${bp.cells.length} cells, ${bp.pipes.length} pipes.`,
          `blueprint_saved_${bp.id}`,
        );
      }
    } else {
      showMarginalia('Blueprint capture cancelled.', 'blueprint_cancelled');
    }
    cleanup();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    showMarginalia('Blueprint capture cancelled.', 'blueprint_cancelled');
    cleanup();
  };

  const cleanup = (): void => {
    ctx.canvasLayer.removeChild(ghost);
    ghost.destroy({ children: true });
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    document.body.style.cursor = PENCIL_CURSOR_URL;
    ctx.state.mode = 'idle';
  };

  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
}

export function beginBlueprintPlacement(ctx: ControllerCtx, blueprintId: string): void {
  if (ctx.state.mode !== 'idle') return;
  const bp = findBlueprint(blueprintId);
  if (!bp) return;
  ctx.state.mode = 'blueprint-stamp';
  const rect = rectOf(ctx);

  showMarginalia(
    `Stamp "${bp.name}" — click to place, ESC to cancel.`,
    'blueprint_stamp_hint',
  );

  document.body.style.cursor = 'crosshair';

  // Ghost: a faint dashed rectangle showing the blueprint's footprint.
  const ghost = new Graphics();
  ghost.alpha = 0.7;
  ctx.canvasLayer.addChild(ghost);

  const drawGhost = (cx: number, cy: number): void => {
    ghost.clear();
    ghost.rect(cx, cy, bp.width, bp.height);
    ghost.stroke({ color: 0x3a3a3a, width: 1.5, alpha: 0.7 });
    ghost.fill({ color: 0xf4e68a, alpha: 0.12 });
  };

  const onMove = (e: PointerEvent): void => {
    const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    drawGhost(c.x, c.y);
  };

  const onClick = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const { x, y } = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    stampBlueprint(ctx, bp, x, y);
    cleanup();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    showMarginalia('Stamp cancelled.', 'blueprint_stamp_cancelled');
    cleanup();
  };

  const cleanup = (): void => {
    ctx.canvasLayer.removeChild(ghost);
    ghost.destroy({ children: true });
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onClick);
    window.removeEventListener('keydown', onKey);
    document.body.style.cursor = PENCIL_CURSOR_URL;
    ctx.state.mode = 'idle';
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onClick);
  window.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------------------------
// Window-level output-port click handler (persistent)
// ---------------------------------------------------------------------------
//
// A window-level listener watches for left-mouse-down anywhere on the
// canvas and checks whether the click lands on an output port. For
// warehouse outputs with stored items, this withdraws one and starts a
// drag at the cursor — the inverse of the deposit gesture.
//
// Also handles: shift-click pipe deletion, plain-click pipe-endpoint
// reroute (Slice 6.12). All of these are gated on `mode === 'idle'`.

export function installOutputClickListener(ctx: ControllerCtx): void {
  const onOutputClick = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (ctx.state.mode !== 'idle') return;

    const rect = rectOf(ctx);
    if (e.clientX < rect.left || e.clientX > rect.right) return;
    if (e.clientY < rect.top || e.clientY > rect.bottom) return;

    const { x, y } = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);

    // Shift+left-click on a pipe deletes it. Check this before warehouse
    // output click — a player intending to delete a pipe shouldn't have
    // their warehouse withdraw fire as a side effect.
    if (e.shiftKey) {
      const pipe = findPipeAt(x, y);
      if (pipe) {
        deletePipe(pipe);
        showMarginalia(
          'Pipe removed. The eraser leaves a faint smudge.',
          'pipe_deleted',
        );
        return;
      }
    }

    // Slice 6.12: plain left-click on a pipe endpoint dot starts a
    // re-route drag. Tighter tolerance (10 px) than the port hit-zone
    // (22 px) means a player who wants to withdraw from a warehouse
    // with an attached pipe can still click on the port edge — only
    // clicks AT the dot grab the endpoint. Fires after the shift-delete
    // check so shift+click on an endpoint still deletes the whole pipe.
    const endpointHit = findPipeEndpointAt(x, y);
    if (endpointHit) {
      beginPipeReroute(ctx, endpointHit.pipe, endpointHit.end);
      return;
    }

    const hit = findCellOutputPortAt(x, y);
    if (!hit) return;
    const cell = hit.cell;

    if (cell.type === 'warehouse' || cell.type === 'warehouse-rule') {
      const empty =
        cell.type === 'warehouse'
          ? (cell.storedCount ?? 0) <= 0
          : (cell.ruleItems ?? []).every((it) => it.count <= 0);
      if (empty) {
        showMarginalia('Warehouse is empty.', `warehouse_empty_${cell.id}`);
        return;
      }
      // Phase 6 β.2 universal comp gate (DESIGN §9): a manual withdraw is
      // a lift. `withdrawFromWarehouse` already refuses values past comp,
      // so a null return here can mean "empty" OR "all contents exceed
      // comp." Distinguish with a marginalia note so the player isn't
      // confused by a non-empty warehouse that refuses to give anything.
      const cap = comprehensionLevel();
      const value = withdrawFromWarehouse(cell);
      if (value === null) {
        showMarginalia(
          `This warehouse holds nothing within your present Comprehension (${cap}).`,
          `warehouse_uncomprehended_${cell.id}`,
        );
        return;
      }
      beginDrag(ctx, value, e.clientX - rect.left, e.clientY - rect.top);
    }
  };
  window.addEventListener('pointerdown', onOutputClick);
}
