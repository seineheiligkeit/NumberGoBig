import type { Container } from 'pixi.js';
import {
  addBlock,
  allBlocks,
  allCells,
  comprehensionLevel,
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
import { valueComprehensible, valueEq, valueLabel, valueMagnitude, type Value } from '../../core/value';
import { getWarehouseRule } from '../../core/warehouse-rules';
import { operate, type CellType } from '../../core/cell-types';
import Decimal from 'break_eternity.js';

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

/** All bot cell types — T-bot + decomposer family. */
function isAnyBot(type: CellType): boolean {
  return (
    type === 'cleanup-bot' ||
    type === 'factor-bot' ||
    type === 'decrement-bot' ||
    type === 'inversion-bot'
  );
}

function isDecomposerBot(type: CellType): boolean {
  return type === 'factor-bot' || type === 'decrement-bot' || type === 'inversion-bot';
}

export function tickBots(_dtMs: number, canvasLayer: Container): void {
  const dtSec = _dtMs / 1000;

  // Build the claimed-block set once per tick — shared across every
  // bot's idle search. Both T-bots and decomposer bots claim, so the
  // set spans the whole bot family.
  const claimed = new Set<number>();
  for (const c of allCells()) {
    if (!isAnyBot(c.type)) continue;
    if (c.botTargetBlockId != null) claimed.add(c.botTargetBlockId);
  }

  for (const cell of allCells()) {
    if (!isAnyBot(cell.type)) continue;
    const handles = getBotHandles(cell.container);
    if (!handles) continue;

    // Defensive defaults — pre-v14 saves rehydrate without these.
    cell.botPhase = cell.botPhase ?? 'idle';
    cell.botWorkerX = cell.botWorkerX ?? cell.container.x;
    cell.botWorkerY = cell.botWorkerY ?? cell.container.y;
    cell.botSpeed = cell.botSpeed ?? 100;

    if (isDecomposerBot(cell.type)) {
      // Decomposer state machine has no 'returning' phase — they act
      // in place rather than carry. idle → approaching → (transform on
      // arrival) → going-home → idle.
      switch (cell.botPhase) {
        case 'idle':
          tickDecomposerIdle(cell, claimed);
          break;
        case 'approaching':
          tickDecomposerApproaching(cell, dtSec, handles, canvasLayer);
          break;
        case 'returning':
          // Decomposers don't return-with-payload; if a save somehow
          // restored a decomposer in 'returning', route to going-home.
          cell.botPhase = 'going-home';
          break;
        case 'going-home':
          tickGoingHome(cell, dtSec, handles);
          break;
      }
      continue;
    }

    // T-bot (cleanup-bot) — existing four-phase state machine.
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
// Decomposer phases
// ---------------------------------------------------------------------------

function tickDecomposerIdle(cell: PlacedCell, claimed: Set<number>): void {
  const radius = cell.botRadius ?? 240;
  // Phase 6 δ.1: rating is INDEPENDENT of player comp. The bot can act
  // on uncomprehended blocks — that's its whole point. Match the
  // block by magnitude ≤ rating, not by comprehensibility.
  const rating = cell.botRating ?? 0;
  if (rating <= 0) return;
  const ratingD = new Decimal(rating);
  const target = findClosestBlockWithinRating(
    cell.container.x,
    cell.container.y,
    radius,
    ratingD,
    claimed,
  );
  if (!target) return;
  cell.botTargetBlockId = target.id;
  cell.botPhase = 'approaching';
  claimed.add(target.id);
}

function tickDecomposerApproaching(
  cell: PlacedCell,
  dtSec: number,
  handles: ReturnType<typeof getBotHandles>,
  canvasLayer: Container,
): void {
  if (!handles) return;
  const target = cell.botTargetBlockId != null ? findBlockById(cell.botTargetBlockId) : null;
  if (!target) {
    cell.botTargetBlockId = null;
    cell.botPhase = 'going-home';
    return;
  }
  const arrived = stepToward(cell, target.container.x, target.container.y, dtSec);
  applyWorkerLocal(cell, handles);
  if (!arrived) return;

  // ARRIVED — apply transformation in place, then walk home.
  const inputValue = target.value;
  const targetX = target.container.x;
  const targetY = target.container.y;
  const transformType = decomposerTransformFor(cell.type);

  // Consume one of the target stack first so the operate() result lands
  // in the vacated slot. (operate is pure; decreaseStack actually frees
  // the slot.)
  decreaseStack(target, 1);

  // Apply the transformation via `operate` — same logic as the static
  // decomposition cells. F-bot is free; D-bot is free; I-bot's
  // signed-fuel cost is paid via the global spend path. Failures
  // (factor of non-integer, inversion of zero) fall through quietly —
  // the bot walks home without producing anything.
  let result;
  try {
    result = operate(transformType, [inputValue]);
  } catch (err) {
    console.warn('Decomposer transform failed:', err);
    result = { emits: [] };
  }

  // Emit each result block at the target's original position, fanned
  // a few px so multiple emits don't all stack on each other.
  let offset = 0;
  for (const ev of result.emits) {
    const ox = targetX + (offset * 18);
    const oy = targetY;
    spawnLooseAt(ev.value, ox, oy, canvasLayer);
    offset += 1;
  }

  // One-shot narrator beat per bot family on first action. The
  // marginalia is keyed by transformType so it fires once per family
  // across the save's lifetime.
  if (result.emits.length > 0) {
    fireDecomposerBeat(cell.type, inputValue, result.emits.map((e) => e.value));
  }

  cell.botTargetBlockId = null;
  cell.botPhase = 'going-home';
}

function decomposerTransformFor(botType: CellType): CellType {
  switch (botType) {
    case 'factor-bot':
      return 'factor';
    case 'decrement-bot':
      return 'decrement';
    case 'inversion-bot':
      return 'inversion';
    default:
      return botType;
  }
}

function fireDecomposerBeat(botType: CellType, input: Value, outputs: Value[]): void {
  if (botType === 'factor-bot') {
    const factors = outputs.map(valueLabel).join(' × ');
    showMarginalia(
      `The factorizer has split ${valueLabel(input)} into ${factors}. Progress, however incomplete.`,
      'first_factor_bot',
    );
  } else if (botType === 'decrement-bot') {
    showMarginalia(
      `The decrementer takes ${valueLabel(input)} and removes one. Slow, but steady.`,
      'first_decrement_bot',
    );
  } else if (botType === 'inversion-bot') {
    showMarginalia(
      `The inverter has taken ${valueLabel(input)} and produced its reciprocal. The cost, regrettably, may have been negative.`,
      'first_inversion_bot',
    );
  }
}

function findClosestBlockWithinRating(
  x: number,
  y: number,
  radius: number,
  rating: Decimal,
  claimed: Set<number>,
): PlacedBlock | null {
  let best: PlacedBlock | null = null;
  let bestDist = Infinity;
  for (const b of allBlocks()) {
    if (b.count <= 0) continue;
    if (claimed.has(b.id)) continue;
    // Within rating: |value| ≤ rating. Independent of comp.
    if (valueMagnitude(b.value).gt(rating)) continue;
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

function spawnLooseAt(value: Value, x: number, y: number, canvasLayer: Container): void {
  const existing = findBlockAt(x, y, MERGE_EMIT_RADIUS, value);
  if (existing) {
    increaseStack(existing, 1);
    return;
  }
  const container = drawBlock(value, x, y);
  canvasLayer.addChild(container);
  addBlock(container, value, 1);
}

// ---------------------------------------------------------------------------
// Phase: idle
// ---------------------------------------------------------------------------

function tickIdle(cell: PlacedCell, claimed: Set<number>): void {
  const radius = cell.botRadius ?? 240;
  // Phase 6 β.2 universal comp gate (DESIGN §9): T-bots cap at the
  // player's current Comprehension. A bot won't pick up what its
  // owner can't yet hold. The block-search filter applies this rule
  // directly. (Per-bot magnitude ratings — distinct from comp — are
  // γ.2 territory; β.2 uses the player's comp ceiling.)
  const comp = comprehensionLevel();
  const block = findClosestUnclaimedBlock(cell.container.x, cell.container.y, radius, claimed, comp);
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
  comp: number,
): PlacedBlock | null {
  let best: PlacedBlock | null = null;
  let bestDist = Infinity;
  for (const b of allBlocks()) {
    if (b.count <= 0) continue;
    if (claimed.has(b.id)) continue;
    // Phase 6 β.2: uncomprehended blocks aren't targets.
    if (!valueComprehensible(b.value, comp)) continue;
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
