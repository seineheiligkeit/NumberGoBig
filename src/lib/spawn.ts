/**
 * Output spawn — shared back-pressure + fan-out logic for every cell
 * type that emits a block (Slice 5.7, generalising the cultivation
 * pattern from 3.5.6 across operators, filters, and cultivators).
 *
 * Two phases, separated so the fire path can plan ALL emissions before
 * paying fuel:
 *
 *   1. `planSpawnAtPort(cell, portIndex, value)` returns a SpawnTarget
 *      (merge or new-spot) or `'clogged'` when the port and every fan
 *      slot is occupied. Pure — no world mutation.
 *
 *   2. `commitSpawn(target, value, canvasLayer)` materialises the
 *      planned block. Same shape as the cultivation code it replaces.
 *
 * The fan uses 40 px spacing (greater than `MERGE_EMIT_RADIUS` so each
 * empty slot is detectable by `findBlockAt`), capped at 12 unique slots.
 * Past that, the cell is "clogged" — the design's back-pressure rule.
 *
 * Operators with multiple emits at the same port within ONE firing
 * (Factor's prime factorisation) keep their existing 18 px within-firing
 * fan; the planSpawnAtPort cap only kicks in across firings.
 */

import type { Container } from 'pixi.js';
import {
  MERGE_EMIT_RADIUS,
  addBlock,
  comprehensionLevel,
  findBlockAt,
  increaseStack,
  type PlacedBlock,
  type PlacedCell,
} from './world';
import { drawBlock, updateStackBadge } from './pixi/block';
import { spawnEmitScribble } from './pixi/micro-anim';
import { punch } from './physics';
import { valueComprehensible, type Value } from '../../core/value';

let _attachInteraction: ((b: PlacedBlock) => void) | null = null;
export function setSpawnBlockInteractionAttach(fn: (b: PlacedBlock) => void): void {
  _attachInteraction = fn;
}

export type SpawnTarget =
  | { kind: 'merge'; block: PlacedBlock }
  | { kind: 'new'; x: number; y: number };

/** Phase 6 β.3 (DESIGN §9): planSpawnAtPort can also return `'jammed'`
 *  when an uncomprehended block sits at the port. Distinguished from
 *  `'clogged'` so callers can fire a comp-jam marginalia instead of a
 *  fan-full one. */
export type SpawnPlan = SpawnTarget | 'clogged' | 'jammed';

const FAN_STEP = 40;
const MAX_FAN = 12;

/**
 * Plans where an emission of `value` should land at the given port:
 *   - **merge** — a same-value block sits at the port; the emission
 *     joins its stack.
 *   - **new (x, y)** — first free fan slot.
 *   - **clogged** — every fan slot is occupied with a (different-value
 *     comprehended) block. Classic back-pressure.
 *   - **jammed** (β.3) — any uncomprehended block sits in the port's
 *     fan range. The cell stalls — no fuel burn, no input consumption —
 *     until the offending `?`-block is cleared (by Comp upgrade, a
 *     pipe, a T-bot, a decomposer bot, or shift-click delete).
 *
 * Pure: doesn't mutate world state. Call before fuel-spend.
 */
export function planSpawnAtPort(
  cell: PlacedCell,
  portIndex: number,
  value: Value,
): SpawnPlan {
  const port = cell.outputs[portIndex];
  if (!port) return 'clogged';
  const baseX = cell.container.x + port.offsetX;
  const baseY = cell.container.y + port.offsetY;

  // Phase 6 β.3 — comp gate. Any uncomprehended block in the port's
  // fan range jams the cell. Checked BEFORE the merge fast-path so
  // a stuck `?`-block can't silently grow by absorbing same-value
  // emissions.
  const cap = comprehensionLevel();
  for (let i = 0; i < MAX_FAN; i++) {
    const x = baseX + i * FAN_STEP;
    const existing = findBlockAt(x, baseY, MERGE_EMIT_RADIUS);
    if (existing && !valueComprehensible(existing.value, cap)) {
      return 'jammed';
    }
  }

  const existingSame = findBlockAt(baseX, baseY, MERGE_EMIT_RADIUS, value);
  if (existingSame) return { kind: 'merge', block: existingSame };

  let outX = baseX;
  for (let i = 0; i < MAX_FAN; i++) {
    if (findBlockAt(outX, baseY, MERGE_EMIT_RADIUS) === null) {
      return { kind: 'new', x: outX, y: baseY };
    }
    outX = baseX + (i + 1) * FAN_STEP;
  }
  return 'clogged';
}

/**
 * Materialises a planned spawn. Same-value merge bumps an existing
 * stack; new-spot draws a fresh block at the planned canvas coords and
 * wires it into the interaction layer (so the player can pick it up).
 *
 * `amount` is the number of identical blocks this firing emits — used
 * by the leveling system (Slice 6.7) where a level-N cell produces N
 * outputs per firing. Defaults to 1 for non-leveled cells.
 */
export function commitSpawn(
  target: SpawnTarget,
  value: Value,
  canvasLayer: Container,
  amount: number = 1,
): void {
  if (target.kind === 'merge') {
    increaseStack(target.block, amount);
    updateStackBadge(target.block);
    // Slice 6.17: a small pencil flourish at the merge point so the
    // player notices the stack just grew. The merge block's container
    // already lives in canvasLayer, so its (x, y) are canvas coords.
    spawnEmitScribble(canvasLayer, target.block.container.x, target.block.container.y);
    punch(target.block.container, 0.12); // production-pop: the stack absorbs an emission
    return;
  }
  const block = drawBlock(value, target.x, target.y);
  canvasLayer.addChild(block);
  const placed = addBlock(block, value, amount);
  if (amount > 1) updateStackBadge(placed);
  _attachInteraction?.(placed);
  // Slice 6.17: same flourish at the new spawn point.
  spawnEmitScribble(canvasLayer, target.x, target.y);
  punch(placed.container, 0.1); // production-pop: a fresh output pops out of the cell
}
