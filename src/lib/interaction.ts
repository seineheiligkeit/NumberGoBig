import type { Application, Container, FederatedPointerEvent } from 'pixi.js';
import { Text, TextStyle } from 'pixi.js';
import { drawBlock, updateStackBadge } from './pixi/block';
import {
  drawSuccessorCell,
} from './pixi/successor-cell';
import {
  drawAdditionCell,
  drawSubtractionCell,
  drawMultiplicationCell,
  drawDivisionCell,
  drawExponentiationCell,
} from './pixi/binary-cell';
import {
  drawDecrementCell,
  drawFactorCell,
  drawSquareRootCell,
} from './pixi/unary-cell';
import {
  drawWarehouseCell,
  updateWarehouseBadge,
} from './pixi/warehouse-cell';
import {
  drawArithmeticCell,
  drawFibonacciCell,
  drawGeometricCell,
  updateCultivationBadge,
} from './pixi/cultivation-cell';
import { captureSeed, setCultivationBlockInteractionAttach } from './cultivation';
import { drawCleanupBot } from './pixi/cleanup-bot';
import {
  MERGE_DROP_RADIUS,
  MERGE_EMIT_RADIUS,
  addBlock,
  addCell,
  addPipe,
  comprehensionLevel,
  decreaseStack,
  depositToWarehouse,
  findBlockAt,
  findCellOutputPortAt,
  findCellPortAt,
  increaseStack,
  markDirty,
  spendOnes,
  withdrawFromWarehouse,
  type PipeEndpoint,
  type PlacedBlock,
  type PlacedCell,
} from './world';
import { computationalCost, isCultivationType, operate, type CellType } from './cell-types';
import { PENCIL_ACTIVE_CURSOR_URL, PENCIL_CURSOR_URL } from './cursors';
import { showMarginalia } from './marginalia';
import { onCameraChange, screenToCanvas } from './camera';
import { drawPipe, type PipeVisualHandles } from './pixi/pipe-visual';
import { PENCIL_FONT_FAMILY } from './pixi/typography';
import {
  deletePipe,
  findPipeAt,
  pipeEndpointPosition,
  registerPipeRuntime,
  setPipeBlockInteractionAttach,
} from './pipe';
import {
  valueExceeds,
  valueIsOne,
  valueLabel,
  type Value,
} from './value';
import { valueColor } from './family';

/**
 * Drag-and-drop machinery + cell placement mode.
 *
 * Drop priority on release:
 *   1. **Cell port** — if the cursor is over a specific empty input port,
 *      that port is filled. When all ports of a cell are filled, the cell
 *      fires (operate → produce output at output offset).
 *   2. **Same-value stack nearby** — merge into existing stack.
 *   3. **Empty space** — place as a new draggable block.
 *
 * Placed blocks become draggable themselves (via `attachBlockInteraction`):
 * pressing one decrements that stack by one and starts a fresh drag.
 *
 * Cell placement is initiated by Literature purchases; a ghost cell of the
 * purchased type follows the cursor, and the next pointerdown commits it.
 *
 * A module-level mode flag prevents concurrent flows.
 */

type InteractionMode = 'idle' | 'dragging' | 'placing' | 'placing-pipe';

export interface DragController {
  beginDragFromRiver(event: FederatedPointerEvent, value: Value): void;
  beginCellPlacement(type: CellType): void;
  /** Two-click pipe placement: source then destination. */
  beginPipePlacement(magnitude: number, cooldownMs?: number): void;
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
    },
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

let _controller: DragController | null = null;

export function getController(): DragController {
  if (!_controller) {
    throw new Error('Drag controller not yet initialized (call createDragController first)');
  }
  return _controller;
}

export function createDragController(app: Application, canvasLayer: Container): DragController {
  const rectOf = (): DOMRect => app.canvas.getBoundingClientRect();
  let mode: InteractionMode = 'idle';

  /**
   * Renders a small graphite numeral inside a filled input port. Sized to
   * fit within the port hit-area, slightly faded.
   */
  function makePendingDisplay(value: Value): Text {
    const text = new Text({
      text: valueLabel(value),
      style: new TextStyle({
        fontFamily: PENCIL_FONT_FAMILY,
        fontSize: 24,
        fontWeight: '500',
        fill: valueColor(value),
      }),
    });
    text.anchor.set(0.5);
    text.alpha = 0.88;
    return text;
  }

  /**
   * Attempts to drop `value` into the indicated cell port.
   *   - For warehouses: deposit into the typed storage. Type-mismatch and
   *     full-capacity drops are refused (false), so the caller can fall
   *     back to stack-merge or new placement.
   *   - For equation cells: fill the input port. If the port is already
   *     filled, refuse (false). Once every port is filled, the cell fires.
   */
  function tryFeedPort(target: { cell: PlacedCell; portIndex: number }, value: Value): boolean {
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

    if (isCultivationType(cell.type)) {
      if (cell.seed !== null && cell.seed !== undefined) {
        showMarginalia(
          'This cultivation cell already has a seed. Place another cell for a new sequence.',
          'cultivation_already_seeded',
        );
        return false;
      }
      return captureSeed(cell, value);
    }

    if (cell.pending[portIndex] !== null) return false;

    cell.pending[portIndex] = value;

    const port = cell.inputs[portIndex];
    const display = makePendingDisplay(value);
    display.x = port.offsetX;
    display.y = port.offsetY;
    cell.container.addChild(display);
    cell.pendingDisplays[portIndex] = display;

    if (cell.pending.every((v) => v !== null)) {
      fireCell(cell);
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
  function fireCell(cell: PlacedCell): void {
    const cost = computationalCost(cell.type);
    if (cost > 0 && !spendOnes(cost)) {
      // Per-cell-id so each freshly-placed cell can earn its one "I'm
      // waiting" beat. Type-only keying meant only the very first cell of
      // each type ever surfaced the message.
      showMarginalia(
        `${cellLabel(cell.type)} requires ${cost} ${cost === 1 ? 'one' : 'ones'} to fire. It will wait.`,
        `cell_cost_blocked_${cell.id}`,
      );
      return;
    }

    const inputs = cell.pending.map((v) => v as Value);
    const result = operate(cell.type, inputs);

    // Clear pending state.
    for (let i = 0; i < cell.pending.length; i++) {
      cell.pending[i] = null;
      const display = cell.pendingDisplays[i];
      if (display) {
        cell.container.removeChild(display);
        display.destroy({ children: true });
        cell.pendingDisplays[i] = null;
      }
    }

    if (result.marginalia) {
      showMarginalia(result.marginalia.text, result.marginalia.key);
    }

    // Track how many times each port has emitted this firing, so we can
    // fan multi-emits at one port (e.g. Factor's prime factors) rather
    // than stacking them at a single pixel.
    const emitsPerPort = new Map<number, number>();

    for (const ev of result.emits) {
      const port = cell.outputs[ev.portIndex];
      if (!port) continue;

      const fanIndex = emitsPerPort.get(ev.portIndex) ?? 0;
      emitsPerPort.set(ev.portIndex, fanIndex + 1);

      // Fan layout: progressive offset to the right of each subsequent emit.
      // Same-value emits will still merge via the stack-radius check below.
      const fanDx = fanIndex * 18;
      const outX = cell.container.x + port.offsetX + fanDx;
      const outY = cell.container.y + port.offsetY;

      const existing = findBlockAt(outX, outY, MERGE_EMIT_RADIUS, ev.value);
      if (existing) {
        increaseStack(existing, 1);
        updateStackBadge(existing);
        continue;
      }

      const outBlock = drawBlock(ev.value, outX, outY);
      canvasLayer.addChild(outBlock);
      const placed = addBlock(outBlock, ev.value);
      attachBlockInteraction(placed);

      // The narrator beat genuinely is about going from zero to one. The
      // earlier `> 0` check fired on `2` from `1+1` too — wrong moment.
      if (valueIsOne(ev.value)) {
        showMarginalia('Built 1 from nothing. Peano nods approvingly.', 'first_one');
      }
    }
  }

  /**
   * Core drag flow. Ghost lives in `canvasLayer` so it scales with the camera;
   * pointer events deliver screen coords which we convert to canvas-space
   * before positioning or hit-testing. On release the drop is resolved
   * against cells, stacks, then empty space.
   */
  function beginDrag(value: Value, initialScreenX: number, initialScreenY: number): void {
    mode = 'dragging';
    const rect = rectOf();
    const init = screenToCanvas(initialScreenX, initialScreenY);
    const ghost = drawBlock(value, init.x, init.y);
    canvasLayer.addChild(ghost);

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
      if (target && tryFeedPort(target, value)) {
        canvasLayer.removeChild(ghost);
        ghost.destroy({ children: true });
        cleanup();
        return;
      }

      // 2) Stack merge?
      const existing = findBlockAt(x, y, MERGE_DROP_RADIUS, value);
      if (existing) {
        canvasLayer.removeChild(ghost);
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
      attachBlockInteraction(placed);
      cleanup();
    };

    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = PENCIL_CURSOR_URL;
      mode = 'idle';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * Makes a placed block respond to pointerdown by decrementing its stack
   * and starting a drag of one unit at the click position.
   */
  function attachBlockInteraction(block: PlacedBlock): void {
    block.container.eventMode = 'static';
    block.container.cursor = PENCIL_CURSOR_URL;
    block.container.on('pointerdown', (event: FederatedPointerEvent) => {
      if (event.button !== 0) return; // left-mouse only; middle-mouse pans
      if (mode !== 'idle') return;
      if (block.count <= 0) return;

      // Comprehension gate: the player can only manually lift numbers up
      // to their current level. Anything larger must travel by automation.
      const cap = comprehensionLevel();
      if (valueExceeds(block.value, cap)) {
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
      beginDrag(value, x, y);
    });
  }

  function cellLabel(type: CellType): string {
    // Currently only the cost-bearing operators need a friendly label, but
    // we keep this exhaustive so adding a new cost-bearing CellType later
    // forces the compiler to flag the missing entry.
    switch (type) {
      case 'multiplication':
        return 'Multiplication';
      case 'division':
        return 'Division';
      case 'exponentiation':
        return 'Exponentiation';
      case 'successor':
        return 'Successor';
      case 'addition':
        return 'Addition';
      case 'subtraction':
        return 'Subtraction';
      case 'decrement':
        return 'Decrement';
      case 'factor':
        return 'Factor';
      case 'square-root':
        return 'Square Root';
      case 'warehouse':
        return 'Warehouse';
      case 'cultivation-arithmetic':
        return 'Arithmetic cultivation';
      case 'cultivation-geometric':
        return 'Geometric cultivation';
      case 'cultivation-fibonacci':
        return 'Fibonacci cultivation';
      case 'cleanup-bot':
        return 'Cleanup bot';
    }
  }

  function installWarehouseRefresh(cell: PlacedCell): void {
    cell.refreshBadge = () => updateWarehouseBadge(cell);
    cell.refreshBadge();
  }

  function drawCellByType(type: CellType): Container {
    switch (type) {
      case 'successor':
        return drawSuccessorCell(0, 0);
      case 'addition':
        return drawAdditionCell(0, 0);
      case 'subtraction':
        return drawSubtractionCell(0, 0);
      case 'multiplication':
        return drawMultiplicationCell(0, 0);
      case 'division':
        return drawDivisionCell(0, 0);
      case 'exponentiation':
        return drawExponentiationCell(0, 0);
      case 'decrement':
        return drawDecrementCell(0, 0);
      case 'factor':
        return drawFactorCell(0, 0);
      case 'square-root':
        return drawSquareRootCell(0, 0);
      case 'warehouse':
        return drawWarehouseCell(0, 0);
      case 'cultivation-arithmetic':
        return drawArithmeticCell(0, 0);
      case 'cultivation-geometric':
        return drawGeometricCell(0, 0);
      case 'cultivation-fibonacci':
        return drawFibonacciCell(0, 0);
      case 'cleanup-bot':
        return drawCleanupBot(0, 0);
    }
  }

  function placementMarginalia(type: CellType): { text: string; key: string } | null {
    switch (type) {
      case 'successor':
        return { text: '{ } awaits its first zero.', key: 'first_successor_placed' };
      case 'addition':
        return { text: '+ awaits two summands.', key: 'first_addition_placed' };
      case 'subtraction':
        return {
          text: '− awaits a minuend (top) and a subtrahend (bottom). Negatives await on the other side.',
          key: 'first_subtraction_placed',
        };
      case 'multiplication':
        return { text: '× awaits two factors.', key: 'first_multiplication_placed' };
      case 'division':
        return {
          text: '÷ awaits a dividend (top) and a divisor (bottom). Rationals at the ready.',
          key: 'first_division_placed',
        };
      case 'exponentiation':
        return { text: '^ awaits a base and an exponent.', key: 'first_exponentiation_placed' };
      case 'decrement':
        return {
          text: 'Decrement: pulls a 1 free from anything it can.',
          key: 'first_decrement_placed',
        };
      case 'factor':
        return {
          text: 'Factor: reduces a composite to its primes. The score will object.',
          key: 'first_factor_placed',
        };
      case 'square-root':
        return {
          text: '√ awaits a non-negative input. Non-squares emerge as something irrational.',
          key: 'first_square_root_placed',
        };
      case 'warehouse':
        return {
          text: 'Warehouse: deposits on the left, withdrawals on the right. Untyped until the first drop.',
          key: 'first_warehouse_placed',
        };
      case 'cultivation-arithmetic':
        return {
          text: 'Arithmetic cultivation: drop a seed, watch the linear march.',
          key: 'first_cultivation_arithmetic',
        };
      case 'cultivation-geometric':
        return {
          text: 'Geometric cultivation: a seed and a doubling. Grows quickly.',
          key: 'first_cultivation_geometric',
        };
      case 'cultivation-fibonacci':
        return {
          text: 'Fibonacci cultivation: each emission is the sum of the previous two, scaled by the seed.',
          key: 'first_cultivation_fibonacci',
        };
      case 'cleanup-bot':
        return {
          text: 'A cleanup bot. It sweeps loose blocks within reach into a nearby warehouse of matching type.',
          key: 'first_cleanup_bot',
        };
    }
  }

  const controller: DragController = {
    beginDragFromRiver(event: FederatedPointerEvent, value: Value): void {
      if (mode !== 'idle') return;

      showMarginalia('You picked up a zero. Auspicious.', 'first_pickup');
      beginDrag(value, event.global.x, event.global.y);
    },

    rehydrateBlock(value: Value, count: number, x: number, y: number): void {
      const container = drawBlock(value, x, y);
      canvasLayer.addChild(container);
      const placed = addBlock(container, value, count);
      attachBlockInteraction(placed);
      updateStackBadge(placed);
    },

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
      },
    ): void {
      const container = drawCellByType(type);
      container.x = x;
      container.y = y;
      canvasLayer.addChild(container);
      const placed = addCell(type, container);
      if (type === 'warehouse') {
        installWarehouseRefresh(placed);
        if (warehouseState) {
          placed.storedValue = warehouseState.storedValue;
          placed.storedCount = warehouseState.storedCount;
          placed.capacity = warehouseState.capacity;
          placed.refreshBadge?.();
        }
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
      if (type === 'cleanup-bot' && botState) {
        placed.botRadius = botState.botRadius;
        placed.botCooldownMs = botState.botCooldownMs;
        placed.botCooldownRemaining = botState.botCooldownRemaining;
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
    },

    beginPipePlacement(magnitude: number, cooldownMs = 1000): void {
      if (mode !== 'idle') return;
      mode = 'placing-pipe';

      const rect = rectOf();
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
        source ? endpointPosition(source) : null;

      // Re-projects the ghost on any camera move so river-anchored sources
      // stay locked to the river while the player drags the dest endpoint.
      // Unsubscribe on cleanup so each placement doesn't leak a listener.
      const unsubCamera = onCameraChange(() => {
        if (!ghost || !source || !lastCursor) return;
        const sp = currentSourcePos();
        if (!sp) return;
        ghost.redraw(sp, lastCursor);
      });

      const onMove = (e: PointerEvent): void => {
        const c = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
        lastCursor = c;
        if (!source || !ghost) return;
        const sp = currentSourcePos();
        if (!sp) return;
        ghost.redraw(sp, c);
      };

      const onClick = (e: PointerEvent): void => {
        if (e.button !== 0) return;
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const { x, y } = screenToCanvas(sx, sy);
        lastCursor = { x, y };

        if (!source) {
          const hit = resolvePipeEndpoint('source', x, y, sx, sy);
          if (!hit) {
            showMarginalia(
              'A pipe source must be a cell output or the river.',
              'pipe_source_hint',
            );
            return;
          }
          source = hit.endpoint;
          ghost = drawPipe(hit.pos, { x, y }, magnitude);
          ghost.container.alpha = 0.55;
          canvasLayer.addChild(ghost.container);
          return;
        }

        const hit = resolvePipeEndpoint('dest', x, y, sx, sy);
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
        ghost.redraw(sp, hit.pos);

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
          canvasLayer.removeChild(ghost.container);
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
        mode = 'idle';
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerdown', onClick);
      window.addEventListener('keydown', onKey);
    },

    rehydratePipe(
      source: PipeEndpoint,
      dest: PipeEndpoint,
      magnitude: number,
      cooldownMs: number,
      cooldownRemaining?: number,
    ): void {
      const srcPos = endpointPosition(source);
      const dstPos = endpointPosition(dest);
      if (!srcPos || !dstPos) {
        // Source or dest cell missing — skip. Could happen if the schema
        // changes; the player loses a pipe but the world stays consistent.
        return;
      }
      const visual = drawPipe(srcPos, dstPos, magnitude);
      canvasLayer.addChild(visual.container);
      const placed = addPipe(source, dest, magnitude, visual.container, cooldownMs);
      if (typeof cooldownRemaining === 'number') placed.cooldownRemaining = cooldownRemaining;
      registerPipeRuntime(placed.id, {
        pulse: visual.pulse,
        redraw: visual.redraw,
        setJammed: visual.setJammed,
        hitTest: visual.hitTest,
        destroy: visual.destroy,
      });
    },

    beginCellPlacement(type: CellType): void {
      if (mode !== 'idle') return;
      mode = 'placing';

      const rect = rectOf();
      const ghost = drawCellByType(type);
      ghost.alpha = 0.7;
      canvasLayer.addChild(ghost);

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

        const note = placementMarginalia(type);
        if (note) showMarginalia(note.text, note.key);

        cleanup();
      };

      const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onClick);
        document.body.style.cursor = PENCIL_CURSOR_URL;
        mode = 'idle';
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerdown', onClick);
    },
  };

  // Endpoint resolver delegates to pipe.ts so the river-screen-anchor logic
  // stays in one place (the pipe module also needs it for camera sync).
  const endpointPosition = pipeEndpointPosition;

  // ---- Pipe placement helpers ------------------------------------------

  /**
   * Resolves a click coordinate to a pipe endpoint, or null if neither a
   * matching port nor the river area was clicked. `side` constrains the
   * kind of endpoint sought: `'source'` accepts cell-output ports and the
   * river area; `'dest'` accepts cell-input ports.
   */
  function resolvePipeEndpoint(
    side: 'source' | 'dest',
    canvasX: number,
    canvasY: number,
    screenX: number,
    screenY: number,
  ): { endpoint: PipeEndpoint; pos: { x: number; y: number } } | null {
    if (side === 'source') {
      const outHit = findCellOutputPortAt(canvasX, canvasY);
      if (outHit) {
        const port = outHit.cell.outputs[outHit.portIndex];
        return {
          endpoint: { kind: 'cell-output', cellId: outHit.cell.id, portIndex: outHit.portIndex },
          pos: {
            x: outHit.cell.container.x + port.offsetX,
            y: outHit.cell.container.y + port.offsetY,
          },
        };
      }
      // River area: the bottom 170 px of the screen (river band height ~160 +
      // a forgiving margin). River endpoints store *screen* coords so the
      // pipe's start point stays pinned to the river through pan and zoom.
      if (screenY >= app.screen.height - 170) {
        return {
          endpoint: { kind: 'river', screenX, screenY },
          pos: screenToCanvas(screenX, screenY),
        };
      }
      return null;
    }

    const inHit = findCellPortAt(canvasX, canvasY);
    if (!inHit) return null;
    const port = inHit.cell.inputs[inHit.portIndex];
    return {
      endpoint: { kind: 'cell-input', cellId: inHit.cell.id, portIndex: inHit.portIndex },
      pos: {
        x: inHit.cell.container.x + port.offsetX,
        y: inHit.cell.container.y + port.offsetY,
      },
    };
  }

  // ---- Output-port click handlers (warehouse withdrawal) ----------------
  // A window-level listener watches for left-mouse-down anywhere on the
  // canvas and checks whether the click lands on an output port. For
  // warehouse outputs with stored items, this withdraws one and starts a
  // drag at the cursor — the inverse of the deposit gesture.
  //
  // The handler runs after Pixi's own dispatch, so any block-pickup
  // pointerdown will have already set `mode = 'dragging'` and we'll skip.
  const onOutputClick = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (mode !== 'idle') return;

    const rect = rectOf();
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

    const hit = findCellOutputPortAt(x, y);
    if (!hit) return;
    const cell = hit.cell;

    if (cell.type === 'warehouse') {
      if ((cell.storedCount ?? 0) <= 0) {
        showMarginalia(
          'Warehouse is empty.',
          `warehouse_empty_${cell.id}`,
        );
        return;
      }
      const value = withdrawFromWarehouse(cell);
      if (value === null) return;
      beginDrag(value, e.clientX - rect.left, e.clientY - rect.top);
    }
  };
  window.addEventListener('pointerdown', onOutputClick);

  // Hook blocks fired by automation back into the pickup path so the player
  // can still grab them by hand (when within Comprehension).
  setPipeBlockInteractionAttach(attachBlockInteraction);
  setCultivationBlockInteractionAttach(attachBlockInteraction);

  _controller = controller;
  return controller;
}
