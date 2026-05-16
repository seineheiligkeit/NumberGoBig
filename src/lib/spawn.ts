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
  findBlockAt,
  increaseStack,
  type PlacedBlock,
  type PlacedCell,
} from './world';
import { drawBlock, updateStackBadge } from './pixi/block';
import { spawnEmitScribble } from './pixi/micro-anim';
import { type Value } from './value';

let _attachInteraction: ((b: PlacedBlock) => void) | null = null;
export function setSpawnBlockInteractionAttach(fn: (b: PlacedBlock) => void): void {
  _attachInteraction = fn;
}

export type SpawnTarget =
  | { kind: 'merge'; block: PlacedBlock }
  | { kind: 'new'; x: number; y: number };

const FAN_STEP = 40;
const MAX_FAN = 12;

/**
 * Plans where an emission of `value` should land at the given port —
 * merging into a same-value stack if one sits at the port, otherwise
 * fanning right through up to MAX_FAN distinct slots. Returns
 * `'clogged'` when every slot in the fan is occupied.
 *
 * Pure: doesn't mutate world state. Call before fuel-spend so a
 * back-pressured cell doesn't burn fuel it can't deliver against.
 */
export function planSpawnAtPort(
  cell: PlacedCell,
  portIndex: number,
  value: Value,
): SpawnTarget | 'clogged' {
  const port = cell.outputs[portIndex];
  if (!port) return 'clogged';
  const baseX = cell.container.x + port.offsetX;
  const baseY = cell.container.y + port.offsetY;

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
    return;
  }
  const block = drawBlock(value, target.x, target.y);
  canvasLayer.addChild(block);
  const placed = addBlock(block, value, amount);
  if (amount > 1) updateStackBadge(placed);
  _attachInteraction?.(placed);
  // Slice 6.17: same flourish at the new spawn point.
  spawnEmitScribble(canvasLayer, target.x, target.y);
}
