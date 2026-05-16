import type { Container } from 'pixi.js';
import {
  addBlock,
  allBlocks,
  allCells,
  decreaseStack,
  depositToWarehouse,
  findBlockAt,
  findCellById,
  increaseStack,
  ruleWarehouseTotal,
  MERGE_EMIT_RADIUS,
  type PlacedBlock,
  type PlacedCell,
} from './world';
import { getBotHandles } from './pixi/cleanup-bot';
import { drawBlock } from './pixi/block';
import { showMarginalia } from './marginalia';
import { valueEq, type Value } from './value';
import { getWarehouseRule } from './warehouse-rules';

/**
 * Translation Operator (T-bot) tick — Slice 6.11.
 *
 * Each bot runs a four-phase state machine:
 *
 *   idle         → search for a target block and matching warehouse;
 *                  on success, claim them and enter `approaching`.
 *   approaching  → walk worker toward the target's current position;
 *                  on arrival, pick up (decrement stack) and enter
 *                  `returning`. If the target vanishes mid-walk, abort
 *                  to `going-home`.
 *   returning    → walk worker toward the destination warehouse;
 *                  on arrival, deposit (or drop loose if it filled in
 *                  the meantime) and enter `going-home`.
 *   going-home   → walk worker back to the station (placement) position;
 *                  on arrival, enter `idle`. The station-anchored
 *                  search radius means the bot doesn't drift.
 *
 * The walk itself is the throttle; the legacy `botCooldownMs` is
 * retained for save back-compat but isn't consulted here.
 *
 * Claim system: each bot stores its `botTargetBlockId` for the duration
 * of the approach. Other bots' searches skip already-claimed blocks, so
 * two bots near each other don't race for the same pile.
 */

const ARRIVAL_RADIUS = 6;

export function tickBots(_dtMs: number, canvasLayer: Container): void {
  const dtSec = _dtMs / 1000;

  // Build the claimed-block set once per tick — cheap (few bots) and
  // shared across every bot's idle search below.
  const claimed = new Set<number>();
  for (const c of allCells()) {
    if (c.type !== 'cleanup-bot') continue;
    if (c.botTargetBlockId != null) claimed.add(c.botTargetBlockId);
  }

  for (const cell of allCells()) {
    if (cell.type !== 'cleanup-bot') continue;
    const handles = getBotHandles(cell.container);
    if (!handles) continue;

    // Defensive defaults — pre-v14 saves rehydrate without these and the
    // rehydrate hook fills them, but a brand-new code path that creates
    // bots via some other route would otherwise NPE here.
    cell.botPhase = cell.botPhase ?? 'idle';
    cell.botWorkerX = cell.botWorkerX ?? cell.container.x;
    cell.botWorkerY = cell.botWorkerY ?? cell.container.y;
    cell.botSpeed = cell.botSpeed ?? 100;

    switch (cell.botPhase) {
      case 'idle':
        tickIdle(cell, claimed);
        break;
      case 'approaching':
        tickApproaching(cell, dtSec, handles);
        break;
      case 'returning':
        tickReturning(cell, dtSec, handles, canvasLayer);
        break;
      case 'going-home':
        tickGoingHome(cell, dtSec, handles);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Phase: idle
// ---------------------------------------------------------------------------

function tickIdle(cell: PlacedCell, claimed: Set<number>): void {
  const radius = cell.botRadius ?? 240;
  const block = findClosestUnclaimedBlock(cell.container.x, cell.container.y, radius, claimed);
  if (!block) return;
  const warehouse = findClosestMatchingWarehouse(cell.container.x, cell.container.y, block.value);
  if (!warehouse) return;
  // Both ends found — claim and start walking.
  cell.botTargetBlockId = block.id;
  cell.botDestCellId = warehouse.id;
  cell.botPhase = 'approaching';
  // Add this bot's claim to the shared set so a second bot iterating
  // later in the same tick doesn't grab the same block.
  claimed.add(block.id);
}

// ---------------------------------------------------------------------------
// Phase: approaching
// ---------------------------------------------------------------------------

function tickApproaching(cell: PlacedCell, dtSec: number, handles: ReturnType<typeof getBotHandles>): void {
  if (!handles) return;
  const target = cell.botTargetBlockId != null ? findBlockById(cell.botTargetBlockId) : null;
  if (!target) {
    // Target vanished (player grabbed it, decomposed, etc). Walk back home.
    cell.botTargetBlockId = null;
    cell.botPhase = 'going-home';
    return;
  }
  // Live position — chase the block even if the player drags it.
  const arrived = stepToward(cell, target.container.x, target.container.y, dtSec);
  applyWorkerLocal(cell, handles);
  if (arrived) {
    // Pickup. Capture the value BEFORE decreaseStack — decrement may
    // remove the block (count → 0) and tear down its container.
    const carried = target.value;
    decreaseStack(target, 1);
    cell.botCarried = carried;
    cell.botTargetBlockId = null;
    handles.setCarried(carried);
    cell.botPhase = 'returning';
  }
}

// ---------------------------------------------------------------------------
// Phase: returning
// ---------------------------------------------------------------------------

function tickReturning(
  cell: PlacedCell,
  dtSec: number,
  handles: ReturnType<typeof getBotHandles>,
  canvasLayer: Container,
): void {
  if (!handles) return;
  const dest = cell.botDestCellId != null ? findCellById(cell.botDestCellId) : null;
  if (!dest || !cell.botCarried) {
    // Destination disappeared (player deleted it) OR we lost the carried
    // value somehow. Drop whatever we have at the worker's current
    // position so the value isn't lost; head home.
    if (cell.botCarried) {
      dropLooseAt(cell.botCarried, cell.botWorkerX ?? cell.container.x, cell.botWorkerY ?? cell.container.y, canvasLayer);
    }
    cell.botCarried = null;
    cell.botDestCellId = null;
    handles.setCarried(null);
    cell.botPhase = 'going-home';
    return;
  }
  const arrived = stepToward(cell, dest.container.x, dest.container.y, dtSec);
  applyWorkerLocal(cell, handles);
  if (arrived) {
    // Deposit. The warehouse may have filled in the meantime — fall back
    // to a loose drop just below the warehouse if so.
    const ok = depositToWarehouse(dest, cell.botCarried);
    if (!ok) {
      dropLooseAt(cell.botCarried, dest.container.x, dest.container.y + 30, canvasLayer);
      // One-shot per bot so the player isn't spammed if the same bot
      // keeps colliding with a full warehouse.
      showMarginalia(
        'The warehouse declined. The block sits where the operator left it.',
        `bot_dropped_${cell.id}`,
      );
    }
    cell.botCarried = null;
    cell.botDestCellId = null;
    handles.setCarried(null);
    cell.botPhase = 'going-home';
  }
}

// ---------------------------------------------------------------------------
// Phase: going-home
// ---------------------------------------------------------------------------

function tickGoingHome(cell: PlacedCell, dtSec: number, handles: ReturnType<typeof getBotHandles>): void {
  if (!handles) return;
  const arrived = stepToward(cell, cell.container.x, cell.container.y, dtSec);
  applyWorkerLocal(cell, handles);
  if (arrived) {
    cell.botPhase = 'idle';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advances the worker's stored position toward (tx, ty) by `botSpeed * dt`.
 *  Returns true if the worker arrived this tick (within ARRIVAL_RADIUS or
 *  overshooting). On arrival, the worker snaps exactly to the target. */
function stepToward(cell: PlacedCell, tx: number, ty: number, dtSec: number): boolean {
  const wx = cell.botWorkerX ?? cell.container.x;
  const wy = cell.botWorkerY ?? cell.container.y;
  const dx = tx - wx;
  const dy = ty - wy;
  const dist = Math.hypot(dx, dy);
  if (dist <= ARRIVAL_RADIUS) {
    cell.botWorkerX = tx;
    cell.botWorkerY = ty;
    return true;
  }
  const step = (cell.botSpeed ?? 100) * dtSec;
  if (step >= dist) {
    cell.botWorkerX = tx;
    cell.botWorkerY = ty;
    return true;
  }
  cell.botWorkerX = wx + (dx / dist) * step;
  cell.botWorkerY = wy + (dy / dist) * step;
  return false;
}

/** Translates the worker's canvas position into local coords for the
 *  station-anchored container, and pushes it through to the visual. */
function applyWorkerLocal(cell: PlacedCell, handles: ReturnType<typeof getBotHandles>): void {
  if (!handles) return;
  const wx = cell.botWorkerX ?? cell.container.x;
  const wy = cell.botWorkerY ?? cell.container.y;
  handles.setWorkerLocal(wx - cell.container.x, wy - cell.container.y);
}

function findBlockById(id: number): PlacedBlock | null {
  for (const b of allBlocks()) {
    if (b.id === id) return b;
  }
  return null;
}

function findClosestUnclaimedBlock(
  x: number,
  y: number,
  radius: number,
  claimed: Set<number>,
): PlacedBlock | null {
  let best: PlacedBlock | null = null;
  let bestDist = Infinity;
  for (const b of allBlocks()) {
    if (b.count <= 0) continue;
    if (claimed.has(b.id)) continue;
    const dx = b.container.x - x;
    const dy = b.container.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) continue;
    if (dist < bestDist) {
      best = b;
      bestDist = dist;
    }
  }
  return best;
}

function findClosestMatchingWarehouse(
  x: number,
  y: number,
  value: Value,
): PlacedCell | null {
  let best: PlacedCell | null = null;
  let bestDist = Infinity;
  for (const c of allCells()) {
    let cap = 0;
    let count = 0;
    if (c.type === 'warehouse') {
      // Typed warehouses accept any value while empty (first deposit
      // locks the type), otherwise only the locked value.
      if (c.storedValue !== null && c.storedValue !== undefined && !valueEq(c.storedValue, value)) continue;
      cap = c.capacity ?? 0;
      count = c.storedCount ?? 0;
    } else if (c.type === 'warehouse-rule') {
      const rule = getWarehouseRule(c.ruleId);
      if (!rule || !rule.test(value)) continue;
      cap = c.capacity ?? 0;
      count = ruleWarehouseTotal(c);
    } else {
      continue;
    }
    if (count >= cap) continue;
    const dx = c.container.x - x;
    const dy = c.container.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

/** Materialises a Value as a loose canvas block at (x, y), merging with
 *  any existing same-value stack within MERGE_EMIT_RADIUS. Used for the
 *  "warehouse declined" fallback so the carried value isn't lost. */
function dropLooseAt(value: Value, x: number, y: number, canvasLayer: Container): void {
  const existing = findBlockAt(x, y, MERGE_EMIT_RADIUS, value);
  if (existing) {
    increaseStack(existing, 1);
    return;
  }
  const container = drawBlock(value, x, y);
  canvasLayer.addChild(container);
  addBlock(container, value, 1);
}
