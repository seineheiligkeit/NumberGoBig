import type { Container } from 'pixi.js';
import {
  MERGE_EMIT_RADIUS,
  addBlock,
  allCells,
  findBlockAt,
  increaseStack,
  markDirty,
  type PlacedBlock,
  type PlacedCell,
} from './world';
import { cultivationEmit, isCultivationType } from './cell-types';
import { drawBlock, updateStackBadge } from './pixi/block';
import { updateCultivationBadge } from './pixi/cultivation-cell';
import { valueLabel, type Value } from './value';

/**
 * Cultivation tick — for each cultivation cell with a seed installed, advance
 * its cooldown and (when ready) emit the next value of its sequence at the
 * cell's output port. The emission is a regular PlacedBlock; if a pipe is
 * downstream, the next pipe tick will carry it onward. Without a pipe, the
 * block stays at the output port and accumulates as a stack (which the player
 * may pick up by hand once it's within Comprehension, or have a Cleanup bot
 * collect into a warehouse).
 */

let _attachInteraction: ((b: PlacedBlock) => void) | null = null;
export function setCultivationBlockInteractionAttach(fn: (b: PlacedBlock) => void): void {
  _attachInteraction = fn;
}

export function tickCultivation(dtMs: number, canvasLayer: Container): void {
  for (const cell of allCells()) {
    if (!isCultivationType(cell.type)) continue;
    if (cell.seed === null || cell.seed === undefined) continue;
    const cooldown = cell.cultivationCooldownMs ?? 2000;
    cell.cultivationCooldownRemaining = (cell.cultivationCooldownRemaining ?? cooldown) - dtMs;
    if ((cell.cultivationCooldownRemaining ?? 0) > 0) continue;
    cell.cultivationCooldownRemaining = cooldown;
    emitCultivation(cell, canvasLayer);
    markDirty();
  }
}

function emitCultivation(cell: PlacedCell, canvasLayer: Container): void {
  const seed = cell.seed!;
  const step = cell.cultivationStep ?? 0;
  const value = cultivationEmit(cell.type, seed, step);
  cell.cultivationStep = step + 1;

  const port = cell.outputs[0];
  if (!port) return;
  const outX = cell.container.x + port.offsetX;
  const outY = cell.container.y + port.offsetY;

  const existing = findBlockAt(outX, outY, MERGE_EMIT_RADIUS, value);
  if (existing) {
    increaseStack(existing, 1);
    updateStackBadge(existing);
    return;
  }
  const block = drawBlock(value, outX, outY);
  canvasLayer.addChild(block);
  const placed = addBlock(block, value);
  _attachInteraction?.(placed);
}

/**
 * Drops a seed onto a cultivation cell, locking the cell into its sequence.
 * The block is "captured" — the player loses the block but the cell starts
 * emitting. Returns true on success.
 */
export function captureSeed(cell: PlacedCell, value: Value): boolean {
  if (!isCultivationType(cell.type)) return false;
  if (cell.seed !== null && cell.seed !== undefined) return false; // already seeded
  cell.seed = value;
  cell.cultivationStep = 0;
  updateCultivationBadge(cell);
  markDirty();
  return true;
}
