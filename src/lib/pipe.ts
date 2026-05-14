import {
  MERGE_EMIT_RADIUS,
  addBlock,
  allCells,
  allPipes,
  decreaseStack,
  depositToWarehouse,
  findBlockAt,
  findCellById,
  increaseStack,
  markDirty,
  removePipe,
  spendOnes,
  type PipeEndpoint,
  type PlacedBlock,
  type PlacedCell,
  type PlacedPipe,
  withdrawFromWarehouse,
} from './world';
import type { Container } from 'pixi.js';
import { drawBlock, updateStackBadge } from './pixi/block';
import { computationalCost, isCultivationType, operate } from './cell-types';
import { captureSeed } from './cultivation';
import { showMarginalia } from './marginalia';
import { onCameraChange, screenToCanvas } from './camera';
import {
  VALUE_ZERO,
  valueEq,
  valueExceeds,
  valueLabel,
  type Value,
} from './value';

/**
 * Hook the interaction layer registers so freshly-emitted output blocks are
 * pickup-able by the player. Set during controller setup; fireCellViaPipe
 * calls through it after every emit. If unset (e.g. tests), output blocks
 * stay inert — present but un-grabbable until the next interaction pass.
 */
let _attachInteraction: ((b: PlacedBlock) => void) | null = null;
export function setPipeBlockInteractionAttach(fn: (b: PlacedBlock) => void): void {
  _attachInteraction = fn;
}

/**
 * Pipe simulation — every frame, advance each pipe's cooldown and, when
 * ready, attempt to transfer one item from source to destination.
 *
 * Sources:
 *   - river:        infinite stream of zeros
 *   - cell-output:  blocks at the cell's output port position OR (warehouse)
 *                   the typed storage stack
 * Destinations:
 *   - cell-input:   fill the input port; if all ports of an equation cell are
 *                   filled, fire it. For warehouse cells, deposit into
 *                   typed storage.
 *
 * If a pulled value exceeds the pipe's magnitude rating, the pipe drops it
 * back at the source (loose block) with a narrator note. Connections that
 * are statically known to mismatch should be refused at placement time.
 *
 * Visual transit pulses are spawned by the pipe-visual layer; this module
 * holds the simulation only.
 */

// Stall behaviour: when a pipe has nothing to source or its destination is
// full, we retry on a short interval (cheaper than every frame) and call it
// "stalled." After enough stalled time the pipe visual flips to jammed.
const STALL_RETRY_MS = 200;

interface PipeRuntime {
  pulse: (value: Value, durationMs: number) => void;
  redraw: (src: { x: number; y: number }, dst: { x: number; y: number }) => void;
  setJammed: (jammed: boolean) => void;
  hitTest: (x: number, y: number, tolerance?: number) => boolean;
  /** Cancel pending pulse animations. Called before container destroy. */
  destroy: () => void;
}
const runtimes = new Map<number, PipeRuntime>();

/** Attach the visual handles for a pipe so simulation can fire transit pulses. */
export function registerPipeRuntime(pipeId: number, runtime: PipeRuntime): void {
  runtimes.set(pipeId, runtime);
  ensureCameraHook();
}

export function unregisterPipeRuntime(pipeId: number): void {
  runtimes.delete(pipeId);
  stallTimers.delete(pipeId);
}

// How long a pipe must stall before its visual flips to "jammed."
const JAM_THRESHOLD_MS = 3000;
const stallTimers = new Map<number, number>();

/**
 * Returns the canvas-space position of a pipe endpoint. River endpoints store
 * a screen-space anchor and re-project here, so panning/zooming keeps them
 * visually pinned to the river even though the rest of the pipe lives in the
 * canvas layer. Cell endpoints follow their cell directly.
 */
export function pipeEndpointPosition(ep: PipeEndpoint): { x: number; y: number } | null {
  if (ep.kind === 'river') return screenToCanvas(ep.screenX, ep.screenY);
  const cell = findCellById(ep.cellId);
  if (!cell) return null;
  const port =
    ep.kind === 'cell-output' ? cell.outputs[ep.portIndex] : cell.inputs[ep.portIndex];
  if (!port) return null;
  return { x: cell.container.x + port.offsetX, y: cell.container.y + port.offsetY };
}

/** True if either endpoint is the river (and so the visual depends on camera). */
function pipeAnchoredToRiver(p: PlacedPipe): boolean {
  return p.source.kind === 'river' || p.dest.kind === 'river';
}

/**
 * Recomputes river-anchored pipe visuals after a camera change. Cell-to-cell
 * pipes don't need this — their endpoints live in canvasLayer and pan/zoom
 * with the camera automatically.
 */
function syncRiverPipesToCamera(): void {
  for (const pipe of allPipes()) {
    if (!pipeAnchoredToRiver(pipe)) continue;
    const rt = runtimes.get(pipe.id);
    if (!rt) continue;
    const src = pipeEndpointPosition(pipe.source);
    const dst = pipeEndpointPosition(pipe.dest);
    if (!src || !dst) continue;
    rt.redraw(src, dst);
  }
}

let _cameraHookInstalled = false;
function ensureCameraHook(): void {
  if (_cameraHookInstalled) return;
  _cameraHookInstalled = true;
  onCameraChange(syncRiverPipesToCamera);
}

/** Per-frame driver. `dtMs` is delta time in milliseconds. */
export function tickPipes(dtMs: number, canvasLayer: Container): void {
  for (const pipe of allPipes()) {
    pipe.cooldownRemaining -= dtMs;
    if (pipe.cooldownRemaining > 0) continue;

    // Peek source + dest. JS is single-threaded so peek and pull cannot
    // race in practice. Failures advance the stall timer; a successful
    // transfer resets it. Once stalled past JAM_THRESHOLD_MS the visual
    // flips to dashed-red.
    const peeked = peekSource(pipe);
    if (peeked === null) {
      pipe.cooldownRemaining = STALL_RETRY_MS;
      advanceStall(pipe, dtMs);
      continue;
    }
    if (!destAccepts(pipe.dest, peeked)) {
      pipe.cooldownRemaining = STALL_RETRY_MS;
      advanceStall(pipe, dtMs);
      continue;
    }
    if (valueExceeds(peeked, pipe.magnitude)) {
      // Source has an item too big. Don't pull; stall (and visually jam)
      // until something smaller appears or the player intervenes. The
      // marginalia is per-pipe so each new pipe gets one warning rather
      // than the player seeing it once globally for an entire magnitude.
      showMarginalia(
        `A pipe rated ≤${pipe.magnitude} refuses ${valueLabel(peeked)}.`,
        `pipe_overflow_${pipe.id}`,
      );
      pipe.cooldownRemaining = pipe.cooldownMs;
      advanceStall(pipe, dtMs);
      continue;
    }

    const value = pullSource(pipe);
    if (value === null) {
      pipe.cooldownRemaining = STALL_RETRY_MS;
      advanceStall(pipe, dtMs);
      continue;
    }
    const delivered = deliverDest(pipe.dest, value, canvasLayer);
    if (!delivered) {
      spawnLooseBlock(value, pipe.dest, canvasLayer);
    } else {
      runtimes.get(pipe.id)?.pulse(value, pipe.cooldownMs * 0.85);
      resetStall(pipe);
    }

    pipe.cooldownRemaining = pipe.cooldownMs;
    markDirty();
  }
}

function advanceStall(pipe: PlacedPipe, dtMs: number): void {
  const prev = stallTimers.get(pipe.id) ?? 0;
  const next = prev + dtMs;
  stallTimers.set(pipe.id, next);
  if (prev < JAM_THRESHOLD_MS && next >= JAM_THRESHOLD_MS) {
    runtimes.get(pipe.id)?.setJammed(true);
  }
}
function resetStall(pipe: PlacedPipe): void {
  const prev = stallTimers.get(pipe.id) ?? 0;
  if (prev >= JAM_THRESHOLD_MS) {
    runtimes.get(pipe.id)?.setJammed(false);
  }
  stallTimers.set(pipe.id, 0);
}

/**
 * Returns the first pipe whose line passes near (x, y) in canvas-space.
 * Used by interaction for shift-click delete. Tolerance scales with the
 * pipe's visual weight so heavier pipes are easier to grab.
 */
export function findPipeAt(x: number, y: number): PlacedPipe | null {
  for (const pipe of allPipes()) {
    const rt = runtimes.get(pipe.id);
    if (!rt) continue;
    const tolerance = 6 + Math.log10(Math.max(1, pipe.magnitude)) * 2;
    if (rt.hitTest(x, y, tolerance)) return pipe;
  }
  return null;
}

/**
 * Removes a pipe and its visual. Cancels any in-flight pulse animations
 * BEFORE destroying the container so rAF callbacks don't fire on destroyed
 * Pixi objects.
 */
export function deletePipe(pipe: PlacedPipe): void {
  runtimes.get(pipe.id)?.destroy();
  unregisterPipeRuntime(pipe.id);
  removePipe(pipe);
}

// ---------------------------------------------------------------------------
// Source / destination resolvers
// ---------------------------------------------------------------------------

function peekSource(pipe: PlacedPipe): Value | null {
  const ep = pipe.source;
  if (ep.kind === 'river') return VALUE_ZERO;
  if (ep.kind !== 'cell-output') return null;
  const cell = findCellById(ep.cellId);
  if (!cell) return null;
  if (cell.type === 'warehouse') {
    return (cell.storedCount ?? 0) > 0 ? (cell.storedValue ?? null) : null;
  }
  // Equation cell: peek any block sitting at the output port position.
  const port = cell.outputs[ep.portIndex];
  if (!port) return null;
  const block = findBlockAt(
    cell.container.x + port.offsetX,
    cell.container.y + port.offsetY,
    MERGE_EMIT_RADIUS,
  );
  return block ? block.value : null;
}

function pullSource(pipe: PlacedPipe): Value | null {
  const ep = pipe.source;
  if (ep.kind === 'river') return VALUE_ZERO;
  if (ep.kind !== 'cell-output') return null;
  const cell = findCellById(ep.cellId);
  if (!cell) return null;
  if (cell.type === 'warehouse') return withdrawFromWarehouse(cell);
  const port = cell.outputs[ep.portIndex];
  if (!port) return null;
  const block = findBlockAt(
    cell.container.x + port.offsetX,
    cell.container.y + port.offsetY,
    MERGE_EMIT_RADIUS,
  );
  if (!block) return null;
  const value = block.value;
  decreaseStack(block, 1);
  return value;
}

function destAccepts(ep: PipeEndpoint, value: Value): boolean {
  if (ep.kind !== 'cell-input') return false;
  const cell = findCellById(ep.cellId);
  if (!cell) return false;
  if (cell.type === 'warehouse') {
    const cap = cell.capacity ?? 0;
    const count = cell.storedCount ?? 0;
    if (count >= cap) return false;
    if (cell.storedValue !== null && cell.storedValue !== undefined) {
      return valueEq(cell.storedValue, value);
    }
    return true;
  }
  if (isCultivationType(cell.type)) {
    // Cultivation cells accept exactly one seed in their lifetime.
    return cell.seed === null || cell.seed === undefined;
  }
  // Equation cell: port must currently be empty.
  return cell.pending[ep.portIndex] === null;
}

function deliverDest(ep: PipeEndpoint, value: Value, canvasLayer: Container): boolean {
  if (ep.kind !== 'cell-input') return false;
  const cell = findCellById(ep.cellId);
  if (!cell) return false;
  if (cell.type === 'warehouse') return depositToWarehouse(cell, value);
  // Cultivation cells capture the value as a seed; they don't use `pending`.
  // Without this branch a pipe would silently consume seeds and emit nothing.
  if (isCultivationType(cell.type)) return captureSeed(cell, value);

  // Equation cell: fill port, then fire if complete.
  if (cell.pending[ep.portIndex] !== null) return false;
  cell.pending[ep.portIndex] = value;
  // Pipe-delivered values intentionally don't draw a pending-display: they
  // pass through too quickly to matter, and the cell either fires this tick
  // or waits for the cost-retry pass. The block's visual life is the pipe
  // pulse → output emission; no graphite ghost in the input slot.
  if (cell.pending.every((v) => v !== null)) {
    fireCellViaPipe(cell, canvasLayer);
  }
  return true;
}

/**
 * Mirror of the controller's `fireCell`, but runs from the automation loop
 * where we don't have the interaction-closure references. Spawns output
 * blocks at the cell's output position; pipes connected to that output will
 * pick them up next tick.
 *
 * Returns false if the cell couldn't fire (insufficient computational cost).
 */
function fireCellViaPipe(cell: PlacedCell, canvasLayer: Container): boolean {
  const cost = computationalCost(cell.type);
  if (cost > 0 && !spendOnes(cost)) {
    return false;
  }

  const inputs = cell.pending.map((v) => v as Value);
  const result = operate(cell.type, inputs);

  // Clear pending values AND any pending displays (the manual path may have
  // installed them before the cell switched to cost-blocked-then-retry state).
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

  const emitsPerPort = new Map<number, number>();
  for (const ev of result.emits) {
    const port = cell.outputs[ev.portIndex];
    if (!port) continue;
    const fanIndex = emitsPerPort.get(ev.portIndex) ?? 0;
    emitsPerPort.set(ev.portIndex, fanIndex + 1);
    const fanDx = fanIndex * 18;
    const outX = cell.container.x + port.offsetX + fanDx;
    const outY = cell.container.y + port.offsetY;

    // Stack into an existing same-value block at the output position if any.
    const existing = findBlockAt(outX, outY, MERGE_EMIT_RADIUS, ev.value);
    if (existing) {
      increaseStack(existing, 1);
      updateStackBadge(existing);
      continue;
    }
    const outBlock = drawBlock(ev.value, outX, outY);
    canvasLayer.addChild(outBlock);
    const placed = addBlock(outBlock, ev.value);
    _attachInteraction?.(placed);
  }
  return true;
}

/**
 * Retry pass for equation cells that are fully loaded but blocked on
 * computational cost. Each frame, scan for such cells and try firing them.
 * Cheap O(cells) iteration; cells without cost / not fully loaded short-
 * circuit immediately.
 */
export function tickEquationCells(_dtMs: number, canvasLayer: Container): void {
  for (const cell of allCells()) {
    if (cell.type === 'warehouse') continue;
    if (isCultivationType(cell.type)) continue;
    if (cell.pending.length === 0) continue;
    if (!cell.pending.every((v) => v !== null)) continue;
    // All inputs ready. Try to fire (cost check inside).
    fireCellViaPipe(cell, canvasLayer);
  }
}

function spawnLooseBlock(value: Value, ep: PipeEndpoint, canvasLayer: Container): void {
  const pos = pipeEndpointPosition(ep);
  if (!pos) return;
  // Drop the loose block slightly below the endpoint so it doesn't sit
  // exactly on the port and immediately get re-sourced.
  const c = drawBlock(value, pos.x, pos.y + 40);
  canvasLayer.addChild(c);
  addBlock(c, value);
}
