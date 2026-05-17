/**
 * The drag + fire + attach core.
 *
 * Phase B.3c: these four functions form a mutually-recursive cluster
 * that's pulled out together so the cycle stays inside one file:
 *
 *   - `beginDrag`              → starts a drag, on drop calls
 *   - `tryFeedPort`            → if cell port, may trigger
 *   - `fireCell`               → on output emit, calls
 *   - `attachBlockInteraction` → re-arms blocks for pickup, eventually
 *                                triggers `beginDrag` again
 *   - `attachCellInteraction`  → re-arms cells for body-drag, calls
 *   - `beginCellMove`          → drags the cell body
 *
 * Kept here together because separating them re-creates the
 * `import drag → import fire → import drag` cycle. `modes.ts` and
 * `rehydration.ts` import from here for the attach + drag entry points
 * but never the other way around.
 */

import type { Container, FederatedPointerEvent } from 'pixi.js';
import type Decimal from 'break_eternity.js';

import { drawBlock, updateStackBadge } from '../pixi/block';
import { updateCostBadge } from '../pixi/binary-cell';
import { updateCultivationBadge } from '../pixi/cultivation-cell';
import { fadeAndDestroy } from '../pixi/micro-anim';
import { routeViaFilter } from '../filter';
import { commitSpawn, planSpawnAtPort } from '../spawn';
import {
  MERGE_DROP_RADIUS,
  MERGE_EMIT_RADIUS,
  addBlock,
  cellLevel,
  comprehensionLevel,
  consumeFuelLadder,
  consumeFuelOrFail,
  levelMultiplier,
  decreaseStack,
  depositToWarehouse,
  findBlockAt,
  findCellPortAt,
  fuelPortIndex,
  increaseStack,
  isCellJammed,
  markDirty,
  operandPending,
  operandsFilled,
  type PlacedBlock,
  type PlacedCell,
} from '../world';
import {
  computationalCost,
  cultivationEmissionCost,
  cultivationEmit,
  fuelLadder,
  isCultivationType,
  operate,
} from '../../../core/cell-types';
import { getWarehouseRule } from '../../../core/warehouse-rules';
import { PENCIL_ACTIVE_CURSOR_URL, PENCIL_CURSOR_URL } from '../cursors';
import { showMarginalia } from '../marginalia';
import { screenToCanvas } from '../camera';
import { redrawPipesForCell } from '../pipe';
import { valueComprehensible, valueIsOne, valueLabel, type Value } from '../../../core/value';
import {
  cellLabel,
  clickIsOnPort,
  describeLadder,
  makePendingDisplay,
  rectOf,
} from './helpers';
import type { ControllerCtx } from './index';

// ---------------------------------------------------------------------------
// Drag-block mode
// ---------------------------------------------------------------------------

/**
 * Core drag flow. Ghost lives in `canvasLayer` so it scales with the camera;
 * pointer events deliver screen coords which we convert to canvas-space
 * before positioning or hit-testing. On release the drop is resolved
 * against cells, stacks, then empty space.
 */
export function beginDrag(ctx: ControllerCtx, value: Value, initialScreenX: number, initialScreenY: number): void {
  ctx.state.mode = 'dragging';
  const rect = rectOf(ctx);
  const init = screenToCanvas(initialScreenX, initialScreenY);
  const ghost = drawBlock(value, init.x, init.y);
  ctx.canvasLayer.addChild(ghost);

  document.body.style.cursor = PENCIL_ACTIVE_CURSOR_URL;

  const onMove = (e: PointerEvent): void => {
    const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    ghost.x = c.x;
    ghost.y = c.y;
  };

  const onUp = (e: PointerEvent): void => {
    const { x, y } = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);

    // 1) Cell port?
    const target = findCellPortAt(x, y);
    if (target && tryFeedPort(ctx, target, value)) {
      ctx.canvasLayer.removeChild(ghost);
      ghost.destroy({ children: true });
      cleanup();
      return;
    }

    // 2) Stack merge?
    const existing = findBlockAt(x, y, MERGE_DROP_RADIUS, value);
    if (existing) {
      ctx.canvasLayer.removeChild(ghost);
      ghost.destroy({ children: true });
      increaseStack(existing, 1);
      updateStackBadge(existing);
      cleanup();
      return;
    }

    // 3) New placement.
    ghost.x = x;
    ghost.y = y;
    const placed = addBlock(ghost, value);
    attachBlockInteraction(ctx, placed);
    cleanup();
  };

  const cleanup = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.style.cursor = PENCIL_CURSOR_URL;
    ctx.state.mode = 'idle';
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/**
 * Makes a placed block respond to pointerdown by decrementing its stack
 * and starting a drag of one unit at the click position.
 */
export function attachBlockInteraction(ctx: ControllerCtx, block: PlacedBlock): void {
  block.container.eventMode = 'static';
  block.container.cursor = PENCIL_CURSOR_URL;
  block.container.on('pointerdown', (event: FederatedPointerEvent) => {
    if (event.button !== 0) return; // left-mouse only; middle-mouse pans
    if (ctx.state.mode !== 'idle') return;
    if (block.count <= 0) return;

    // Phase 6 β.2 universal comp gate (DESIGN §9): the player can
    // only manually lift numbers within their current Comprehension.
    // Anything larger must travel by automation (pipe / T-bot) — and
    // those are themselves capped at comp.
    const cap = comprehensionLevel();
    if (!valueComprehensible(block.value, cap)) {
      showMarginalia(
        `${valueLabel(block.value)} exceeds your current Comprehension (${cap}). Build automation, or earn a Comprehension upgrade.`,
        'comprehension_blocked',
      );
      return;
    }

    const x = event.global.x;
    const y = event.global.y;
    const value = block.value;

    decreaseStack(block, 1);
    beginDrag(ctx, value, x, y);
  });
}

// ---------------------------------------------------------------------------
// Cell-move mode
// ---------------------------------------------------------------------------

/**
 * Makes a placed cell respond to pointerdown by starting a cell-drag —
 * the body of the cell moves with the cursor, and every pipe whose
 * endpoint references this cell redraws each frame. Drops on input
 * ports (the warehouse deposit zone, the binary cell's two operand
 * ports, the fuel port) keep their existing meaning and short-circuit
 * the body-drag.
 */
export function attachCellInteraction(ctx: ControllerCtx, cell: PlacedCell): void {
  cell.container.eventMode = 'static';
  cell.container.on('pointerdown', (event: FederatedPointerEvent) => {
    if (event.button !== 0) return;
    if (ctx.state.mode !== 'idle') return;
    const c = screenToCanvas(event.global.x, event.global.y);
    if (clickIsOnPort(cell, c.x, c.y)) return;
    // Phase 6 β.3 (DESIGN §9): a jammed cell is pinned in place by
    // the uncomprehended block at its port. The factory must
    // engineer *around* it — re-route consumers, route the `?`-block
    // to a Factor cell via pipe, or wait for Comp to catch up.
    if (isCellJammed(cell, comprehensionLevel())) {
      showMarginalia(
        'This cell is pinned by an uncomprehended output. Clear the `?`-block before relocating it.',
        `cell_jammed_drag_${cell.id}`,
      );
      return;
    }
    // Past the gate — this is a body-drag. Stop propagation so the
    // window-level `onOutputClick` listener (warehouse withdraw,
    // shift-click pipe delete) doesn't double-fire on the same press.
    event.stopPropagation();
    beginCellMove(ctx, cell, c);
  });
}

/**
 * Drags `cell` with the cursor until pointerup. Pipes connected to
 * this cell redraw each move tick. ESC cancels and snaps the cell back
 * to its starting position.
 */
function beginCellMove(ctx: ControllerCtx, cell: PlacedCell, startCanvasPt: { x: number; y: number }): void {
  ctx.state.mode = 'moving-cell';
  const startX = cell.container.x;
  const startY = cell.container.y;
  const grabOffsetX = startCanvasPt.x - startX;
  const grabOffsetY = startCanvasPt.y - startY;
  const rect = rectOf(ctx);
  document.body.style.cursor = 'grabbing';

  const onMove = (e: PointerEvent): void => {
    const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    cell.container.x = c.x - grabOffsetX;
    cell.container.y = c.y - grabOffsetY;
    redrawPipesForCell(cell.id);
  };

  const onUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    finalize();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    cell.container.x = startX;
    cell.container.y = startY;
    redrawPipesForCell(cell.id);
    finalize();
  };

  function finalize(): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    document.body.style.cursor = PENCIL_CURSOR_URL;
    ctx.state.mode = 'idle';
    // Position changed — autosave needs to pick it up.
    markDirty();
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------------------------
// Cell-firing logic
// ---------------------------------------------------------------------------

/**
 * Attempts to drop `value` into the indicated cell port.
 *   - For warehouses: deposit into the typed storage. Type-mismatch and
 *     full-capacity drops are refused (false), so the caller can fall
 *     back to stack-merge or new placement.
 *   - For equation cells: fill the input port. If the port is already
 *     filled, refuse (false). Once every port is filled, the cell fires.
 */
function tryFeedPort(ctx: ControllerCtx, target: { cell: PlacedCell; portIndex: number }, value: Value): boolean {
  const { cell, portIndex } = target;

  if (cell.type === 'warehouse') {
    if (!depositToWarehouse(cell, value)) {
      // Friendly nudge for the two failure cases.
      const stored = cell.storedValue;
      const cap = cell.capacity ?? 0;
      const count = cell.storedCount ?? 0;
      if (count >= cap) {
        showMarginalia('Warehouse is full.', 'warehouse_full');
      } else if (stored !== null && stored !== undefined) {
        showMarginalia(
          `Warehouse holds ${valueLabel(stored)}s. A ${valueLabel(value)} is not the same shape of number.`,
          'warehouse_type_mismatch',
        );
      }
      return false;
    }
    return true;
  }

  if (cell.type === 'warehouse-rule') {
    if (!depositToWarehouse(cell, value)) {
      // Two failure cases for rule warehouses: predicate-fail or full.
      const rule = getWarehouseRule(cell.ruleId);
      const cap = cell.capacity ?? 0;
      const total = (cell.ruleItems ?? []).reduce((s, it) => s + it.count, 0);
      if (total >= cap) {
        showMarginalia('Generalized warehouse is full.', 'warehouse_rule_full');
      } else if (rule && !rule.test(value)) {
        showMarginalia(
          `${valueLabel(value)} does not satisfy ${rule.label}. The warehouse declines.`,
          `warehouse_rule_reject_${cell.id}`,
        );
      }
      return false;
    }
    return true;
  }

  if (cell.type === 'filter') {
    const ok = routeViaFilter(cell, value, ctx.canvasLayer);
    if (!ok) {
      showMarginalia(
        'Filter has no rule installed — drop refused.',
        `filter_no_rule_${cell.id}`,
      );
    }
    return ok;
  }

  // Phase 6 ε.1: cultivators are no longer seed-based timer cells.
  // They take an INPUT each firing (consumed) and emit f(input, step),
  // advancing an internal step counter per firing. The drop-onto-input
  // flow is therefore identical to a unary operator's — fall through
  // to the standard pending-input path below.

  if (cell.pending[portIndex] !== null) return false;

  cell.pending[portIndex] = value;

  const port = cell.inputs[portIndex];
  const display = makePendingDisplay(value);
  display.x = port.offsetX;
  display.y = port.offsetY;
  cell.container.addChild(display);
  cell.pendingDisplays[portIndex] = display;

  // Refresh the cost preview now that another input contributes magnitude.
  updateCostBadge(cell, cellLevel(cell.type));

  if (operandsFilled(cell)) {
    fireCell(ctx, cell);
  } else {
    // Partial-fill: recompute didn't run, but state changed. Notify autosave.
    markDirty();
  }
  return true;
}

/**
 * Fires the cell: gathers the pending inputs, computes the result via
 * `operate()`, clears the pending state, and emits one block per emit
 * event at the corresponding output port. Multiple emits at the same port
 * are fanned slightly so they don't all spawn at the exact same pixel.
 *
 * Cells with a non-zero computational cost (multiplication, exponentiation)
 * pay in 1s. If the player doesn't have enough ones, the cell stays
 * loaded; the simulation tick will retry once a one becomes available.
 */
function fireCell(ctx: ControllerCtx, cell: PlacedCell): void {
  // Operand-only inputs drive cost & operate; the fuel slot (if present)
  // is the payment, not part of the operation (Slice 3.5.5).
  const operands = operandPending(cell).map((v) => v as Value);

  // operate() is pure — call it now so we can pre-check output port
  // capacity before paying fuel. α.5c: ladder cells consume a Map
  // of (value, count) instead of a single fuel block. Inversion
  // keeps the signed-Decimal contract; cultivators keep their
  // per-emission single-block cost.
  let result;
  let cost: Decimal; // single-block back-compat / inversion / cultivator
  let ladder: Map<number, number> | null = null;
  if (isCultivationType(cell.type)) {
    const step = cell.cultivationStep ?? 0;
    const output = cultivationEmit(cell.type, operands[0], step);
    result = { emits: [{ portIndex: 0, value: output }] };
    cost = cultivationEmissionCost(output);
  } else if (cell.type === 'inversion') {
    result = operate(cell.type, operands);
    cost = computationalCost(cell.type, operands, cellLevel(cell.type));
  } else {
    result = operate(cell.type, operands);
    ladder = fuelLadder(cell.type, operands, cellLevel(cell.type));
    // Cost (single-magnitude sum) used only for cost-preview / error
    // marginalia text. Real consumption uses the ladder.
    cost = computationalCost(cell.type, operands, cellLevel(cell.type));
  }

  const portsChecked = new Set<number>();
  for (const ev of result.emits) {
    if (portsChecked.has(ev.portIndex)) continue;
    portsChecked.add(ev.portIndex);
    const plan = planSpawnAtPort(cell, ev.portIndex, ev.value);
    if (plan === 'jammed') {
      // Phase 6 β.3 (DESIGN §9): an uncomprehended block at the
      // output port jams the cell. No fuel burn, no input
      // consumption — pending operands stay in their slots.
      showMarginalia(
        `${cellLabel(cell.type)} output exceeds your present Comprehension. The cell will wait.`,
        `cell_jammed_${cell.id}`,
      );
      return;
    }
    if (plan === 'clogged') {
      showMarginalia(
        `${cellLabel(cell.type)} output is clogged — clear the port before this cell can fire again.`,
        `cell_output_clogged_${cell.id}`,
      );
      return;
    }
  }

  // α.5c: ladder consumption for tier-1+ non-inversion cells.
  if (ladder !== null) {
    if (!consumeFuelLadder(ladder)) {
      const ladderStr = describeLadder(ladder);
      showMarginalia(
        `${cellLabel(cell.type)} awaits fuel ladder: ${ladderStr}.`,
        `cell_cost_blocked_${cell.id}`,
      );
      return;
    }
  } else {
    // Inversion + cultivators use the single-block path.
    const fuelOutcome = consumeFuelOrFail(cell, cost);
    if (fuelOutcome !== 'paid') {
      switch (fuelOutcome) {
        case 'awaiting-pipe':
          showMarginalia(
            `${cellLabel(cell.type)} awaits fuel (≥ ${cost.toString()}) from its dedicated pipe.`,
            `cell_cost_blocked_${cell.id}`,
          );
          break;
        case 'too-small': {
          const fuelIdx = fuelPortIndex(cell);
          const slot = fuelIdx >= 0 ? cell.pending[fuelIdx] : null;
          showMarginalia(
            `Fuel block too small: ${slot ? valueLabel(slot) : '—'} cannot pay cost ${cost.toString()}. The block stays in the slot until cleared.`,
            `cell_fuel_too_small_${cell.id}`,
          );
          break;
        }
        case 'no-fuel':
          showMarginalia(
            `${cellLabel(cell.type)} awaits fuel: one block of magnitude ≥ ${cost.toString()}.`,
            `cell_cost_blocked_${cell.id}`,
          );
          break;
      }
      return;
    }
  }

  // Clear pending state. Slice 6.17: ghosts ease out via `fadeAndDestroy`
  // instead of vanishing on a frame, giving the firing a small visible
  // exhale. The pendingDisplays slot is cleared synchronously so the
  // logical cell state is correct immediately; the visual lingers
  // ~180 ms in the cell container before destroying itself.
  for (let i = 0; i < cell.pending.length; i++) {
    cell.pending[i] = null;
    const display = cell.pendingDisplays[i];
    if (display) {
      fadeAndDestroy(display);
      cell.pendingDisplays[i] = null;
    }
  }
  updateCostBadge(cell, cellLevel(cell.type));

  // Phase 6 ε.1: cultivators advance their step counter per firing.
  // The new step is reflected in the cell badge on next render.
  if (isCultivationType(cell.type)) {
    cell.cultivationStep = (cell.cultivationStep ?? 0) + 1;
    updateCultivationBadge(cell);
  }

  if ('marginalia' in result && result.marginalia) {
    showMarginalia(result.marginalia.text, result.marginalia.key);
  }

  // Commit emits. First emit at each port goes through planSpawnAtPort
  // (back-pressure + smart fan slot). Subsequent emits at the same
  // port within ONE firing keep the 18px within-firing fan, anchored
  // to the first emit's planned anchor so Factor's primes stay
  // clustered when the port shifts due to a prior pile-up.
  //
  // Cell level multiplies each emit's stack count (Slice 6.7): a
  // lvl-2 successor's "one zero in → one one out" becomes "one zero
  // in → two ones out" without the cell visually firing twice.
  const emitMultiplier = levelMultiplier(cellLevel(cell.type));
  const emitsPerPort = new Map<number, number>();
  const portAnchors = new Map<number, { x: number; y: number }>();
  for (const ev of result.emits) {
    const port = cell.outputs[ev.portIndex];
    if (!port) continue;
    const fanIndex = emitsPerPort.get(ev.portIndex) ?? 0;
    emitsPerPort.set(ev.portIndex, fanIndex + 1);

    if (fanIndex === 0) {
      const plan = planSpawnAtPort(cell, ev.portIndex, ev.value);
      // pre-check should have caught these; treat as no-ops defensively.
      if (plan === 'clogged' || plan === 'jammed') continue;
      if (plan.kind === 'new') {
        portAnchors.set(ev.portIndex, { x: plan.x, y: plan.y });
      } else {
        portAnchors.set(ev.portIndex, {
          x: plan.block.container.x,
          y: plan.block.container.y,
        });
      }
      commitSpawn(plan, ev.value, ctx.canvasLayer, emitMultiplier);
    } else {
      const anchor = portAnchors.get(ev.portIndex);
      if (!anchor) continue;
      const x = anchor.x + fanIndex * 18;
      const y = anchor.y;
      const existing = findBlockAt(x, y, MERGE_EMIT_RADIUS, ev.value);
      if (existing) {
        increaseStack(existing, emitMultiplier);
        updateStackBadge(existing);
      } else {
        const outBlock = drawBlock(ev.value, x, y);
        ctx.canvasLayer.addChild(outBlock);
        const placed = addBlock(outBlock, ev.value, emitMultiplier);
        if (emitMultiplier > 1) updateStackBadge(placed);
        attachBlockInteraction(ctx, placed);
      }
    }

    if (valueIsOne(ev.value)) {
      showMarginalia('Built 1 from nothing. Peano nods approvingly.', 'first_one');
    }
  }
}
