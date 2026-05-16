import {
  MERGE_EMIT_RADIUS,
  addBlock,
  allCells,
  allPipes,
  cellLevel,
  consumeFuelOrFail,
  decreaseStack,
  depositToWarehouse,
  findBlockAt,
  findCellById,
  increaseStack,
  levelMultiplier,
  markDirty,
  operandPending,
  operandsFilled,
  peekRuleWarehouseSmallest,
  pipeLevel,
  removePipe,
  ruleWarehouseTotal,
  type PipeEndpoint,
  type PlacedBlock,
  type PlacedCell,
  type PlacedPipe,
  withdrawFromWarehouse,
} from './world';
import { getWarehouseRule } from './warehouse-rules';
import type { Container } from 'pixi.js';
import { drawBlock, updateStackBadge } from './pixi/block';
import { updateCostBadge } from './pixi/binary-cell';
import { computationalCost, isCultivationType, operate } from './cell-types';
import { captureSeed } from './cultivation';
import { routeViaFilter } from './filter';
import { showMarginalia } from './marginalia';
import { commitSpawn, planSpawnAtPort } from './spawn';
import { fadeAndDestroy } from './pixi/micro-anim';
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
  redraw: (
    src: { x: number; y: number },
    dst: { x: number; y: number },
    srcDir?: { x: number; y: number } | null,
    dstDir?: { x: number; y: number } | null,
  ) => void;
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

/**
 * The "outward" direction at an endpoint — the unit vector the pipe
 * naturally points along as it leaves (source) or approaches (dest)
 * the port. Slice 6.13. Used by the pipe-visual layer to place bezier
 * control points so curves exit a cell along the port's axis rather
 * than along the chord — the flow-chart-connector look.
 *
 * Rules:
 *  - River endpoints face upward (away from the bottom band): (0, -1).
 *  - Cell ports face along their dominant axis from cell center:
 *      port at (offsetX > 0, 0) → (+1, 0) (right-facing output)
 *      port at (offsetX < 0, 0) → (-1, 0) (left-facing input)
 *      port at (0, offsetY > 0) → (0, +1) (bottom-facing fuel)
 *  - Mixed offsets resolve to the dominant axis.
 *
 * Returns null if the endpoint's cell can't be resolved (mid-load race).
 */
export function pipeEndpointDirection(ep: PipeEndpoint): { x: number; y: number } | null {
  if (ep.kind === 'river') return { x: 0, y: -1 };
  const cell = findCellById(ep.cellId);
  if (!cell) return null;
  const port =
    ep.kind === 'cell-output' ? cell.outputs[ep.portIndex] : cell.inputs[ep.portIndex];
  if (!port) return null;
  const dx = port.offsetX;
  const dy = port.offsetY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: Math.sign(dx) || 1, y: 0 };
  }
  return { x: 0, y: Math.sign(dy) || 1 };
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
    rt.redraw(src, dst, pipeEndpointDirection(pipe.source), pipeEndpointDirection(pipe.dest));
  }
}

let _cameraHookInstalled = false;
function ensureCameraHook(): void {
  if (_cameraHookInstalled) return;
  _cameraHookInstalled = true;
  onCameraChange(syncRiverPipesToCamera);
}

/**
 * Redraws every pipe with an endpoint at `cellId` — used while the
 * player drags a cell around the canvas (Slice 5.6) so the connections
 * follow in real time. Cheap O(pipes) scan; the lookup is the same one
 * the camera-sync path uses for river endpoints.
 */
export function redrawPipesForCell(cellId: number): void {
  for (const pipe of allPipes()) {
    let touches = false;
    if (pipe.source.kind === 'cell-output' && pipe.source.cellId === cellId) touches = true;
    else if (pipe.dest.kind === 'cell-input' && pipe.dest.cellId === cellId) touches = true;
    if (!touches) continue;
    const rt = runtimes.get(pipe.id);
    if (!rt) continue;
    const src = pipeEndpointPosition(pipe.source);
    const dst = pipeEndpointPosition(pipe.dest);
    if (!src || !dst) continue;
    rt.redraw(src, dst, pipeEndpointDirection(pipe.source), pipeEndpointDirection(pipe.dest));
  }
}

/** Per-frame driver. `dtMs` is delta time in milliseconds. */
export function tickPipes(dtMs: number, canvasLayer: Container): void {
  for (const pipe of allPipes()) {
    // Pipe level multiplies the effective tick rate (Slice 6.7). A
    // lvl-2 pipe consumes its cooldown twice as fast as a lvl-1 pipe
    // of the same magnitude; lvl-5 sixteen times as fast.
    const speedMult = levelMultiplier(pipeLevel(pipe.magnitude));
    pipe.cooldownRemaining -= dtMs * speedMult;
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
// Pipe endpoint editing — Slice 6.12
// ---------------------------------------------------------------------------

/**
 * Returns the pipe whose source or destination endpoint dot is within
 * `tolerance` of (x, y), and which end was hit. Used by the interaction
 * layer to start an endpoint re-route drag. Tolerance defaults tight (10
 * px) so a click on the broader output-port hit-zone still falls through
 * to e.g. warehouse withdraw — players grab the visible dot, not the
 * surrounding port.
 *
 * Both endpoints of every pipe are scanned; the first hit wins. Source
 * is checked before dest in iteration order, but ties are vanishingly
 * rare in practice (would require two pipes with overlapping endpoints).
 */
export function findPipeEndpointAt(
  x: number,
  y: number,
  tolerance = 10,
): { pipe: PlacedPipe; end: 'source' | 'dest' } | null {
  for (const pipe of allPipes()) {
    const src = pipeEndpointPosition(pipe.source);
    if (src && Math.hypot(src.x - x, src.y - y) <= tolerance) {
      return { pipe, end: 'source' };
    }
    const dst = pipeEndpointPosition(pipe.dest);
    if (dst && Math.hypot(dst.x - x, dst.y - y) <= tolerance) {
      return { pipe, end: 'dest' };
    }
  }
  return null;
}

/**
 * Visual-only redraw of a pipe with one endpoint relocated to `pos`. Does
 * NOT mutate the pipe's data — used during the live re-route drag so the
 * curve follows the cursor without committing until release. The other
 * endpoint stays at its data-canonical position.
 */
export function previewPipeEndpoint(
  pipe: PlacedPipe,
  end: 'source' | 'dest',
  pos: { x: number; y: number },
): void {
  const rt = runtimes.get(pipe.id);
  if (!rt) return;
  const fixedKind = end === 'source' ? pipe.dest : pipe.source;
  const fixed = pipeEndpointPosition(fixedKind);
  if (!fixed) return;
  // The moving end has no port — pass null to clear any stale tangent
  // hint so the curve falls back to the chord-orientation heuristic
  // until release. The fixed end keeps its port-aware tangent.
  const fixedDir = pipeEndpointDirection(fixedKind);
  if (end === 'source') rt.redraw(pos, fixed, null, fixedDir);
  else rt.redraw(fixed, pos, fixedDir, null);
}

/**
 * Commits a new endpoint for a pipe and redraws at the canonical
 * positions. Marks the world dirty so autosave persists the change.
 */
export function setPipeEndpoint(
  pipe: PlacedPipe,
  end: 'source' | 'dest',
  endpoint: PipeEndpoint,
): void {
  if (end === 'source') pipe.source = endpoint;
  else pipe.dest = endpoint;
  refreshPipeVisual(pipe);
  markDirty();
}

/**
 * Re-renders a pipe at its current data-canonical endpoints. Used to
 * snap back after a cancelled re-route drag.
 */
export function refreshPipeVisual(pipe: PlacedPipe): void {
  const rt = runtimes.get(pipe.id);
  if (!rt) return;
  const src = pipeEndpointPosition(pipe.source);
  const dst = pipeEndpointPosition(pipe.dest);
  if (src && dst) {
    rt.redraw(src, dst, pipeEndpointDirection(pipe.source), pipeEndpointDirection(pipe.dest));
  }
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
  if (cell.type === 'warehouse-rule') {
    // Outputs the smallest-magnitude item — the pipe's magnitude check
    // then decides if it qualifies (overflow = stall, jamming after a
    // few seconds as usual).
    return peekRuleWarehouseSmallest(cell);
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
  if (cell.type === 'warehouse' || cell.type === 'warehouse-rule') {
    return withdrawFromWarehouse(cell);
  }
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
  if (cell.type === 'warehouse-rule') {
    const cap = cell.capacity ?? 0;
    if (ruleWarehouseTotal(cell) >= cap) return false;
    const rule = getWarehouseRule(cell.ruleId);
    return !!rule && rule.test(value);
  }
  if (cell.type === 'filter') {
    // Filters always accept — routing happens on delivery.
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
  if (cell.type === 'warehouse-rule') return depositToWarehouse(cell, value);
  if (cell.type === 'filter') return routeViaFilter(cell, value, canvasLayer);
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
  updateCostBadge(cell, cellLevel(cell.type));
  if (operandsFilled(cell)) {
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
  const operands = operandPending(cell).map((v) => v as Value);
  const cost = computationalCost(cell.type, operands, cellLevel(cell.type));
  const result = operate(cell.type, operands);

  // Pre-check every output port for capacity (Slice 5.7). If any is
  // clogged, refuse to fire — don't burn fuel, don't consume inputs.
  // The retry pass next frame will try again once the player drains it.
  const portsChecked = new Set<number>();
  for (const ev of result.emits) {
    if (portsChecked.has(ev.portIndex)) continue;
    portsChecked.add(ev.portIndex);
    if (planSpawnAtPort(cell, ev.portIndex, ev.value) === 'clogged') return false;
  }

  if (consumeFuelOrFail(cell, cost) !== 'paid') return false;

  // Clear pending values AND any pending displays (the manual path may have
  // installed them before the cell switched to cost-blocked-then-retry state).
  // Slice 6.17: fade rather than instant-destroy.
  for (let i = 0; i < cell.pending.length; i++) {
    cell.pending[i] = null;
    const display = cell.pendingDisplays[i];
    if (display) {
      fadeAndDestroy(display);
      cell.pendingDisplays[i] = null;
    }
  }
  updateCostBadge(cell, cellLevel(cell.type));

  if (result.marginalia) {
    showMarginalia(result.marginalia.text, result.marginalia.key);
  }

  // Commit emits — first emit at each port via planSpawnAtPort, rest
  // within-firing fan anchored to the first emit's spot. Cell level
  // multiplies each emit's stack count (Slice 6.7).
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
      if (plan === 'clogged') continue;
      if (plan.kind === 'new') {
        portAnchors.set(ev.portIndex, { x: plan.x, y: plan.y });
      } else {
        portAnchors.set(ev.portIndex, {
          x: plan.block.container.x,
          y: plan.block.container.y,
        });
      }
      commitSpawn(plan, ev.value, canvasLayer, emitMultiplier);
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
        canvasLayer.addChild(outBlock);
        const placed = addBlock(outBlock, ev.value, emitMultiplier);
        if (emitMultiplier > 1) updateStackBadge(placed);
        _attachInteraction?.(placed);
      }
    }
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
    if (cell.type === 'warehouse-rule') continue;
    if (isCultivationType(cell.type)) continue;
    if (cell.inputs.length === 0) continue;
    // Operand ports filled — fuel slot may still be empty (the retry pass
    // exists precisely to thaw cost-blocked cells once fuel materialises).
    if (!operandsFilled(cell)) continue;
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
