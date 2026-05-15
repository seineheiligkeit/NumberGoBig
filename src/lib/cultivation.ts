import type { Container } from 'pixi.js';
import Decimal from 'break_eternity.js';
import {
  allCells,
  markDirty,
  spendFuel,
  type PlacedCell,
} from './world';
import { cultivationEmit, isCultivationType } from './cell-types';
import { cultivationEmissionCost } from './cost';
import { updateCultivationBadge } from './pixi/cultivation-cell';
import { showMarginalia } from './marginalia';
import { valueLabel, type Value } from './value';
import { commitSpawn, planSpawnAtPort } from './spawn';

/**
 * Cultivation tick — for each cultivation cell with a seed installed, advance
 * its cooldown and (when ready) emit the next value of its sequence at the
 * cell's output port. The emission is a regular PlacedBlock; if a pipe is
 * downstream, the next pipe tick will carry it onward. Without a pipe, the
 * block stays at the output port and accumulates as a stack (which the player
 * may pick up by hand once it's within Comprehension, or have a Cleanup bot
 * collect into a warehouse).
 */

// The shared spawn-block-interaction-attach hook lives in `./spawn`
// (Slice 5.7). Kept this exported no-op so older callers still wire
// through one place; effective attach happens via setSpawnBlockInteractionAttach.
export function setCultivationBlockInteractionAttach(_fn: (b: import('./world').PlacedBlock) => void): void {
  // intentionally empty — interaction.ts now wires setSpawnBlockInteractionAttach.
}

export function tickCultivation(dtMs: number, canvasLayer: Container): void {
  for (const cell of allCells()) {
    if (!isCultivationType(cell.type)) continue;
    if (cell.seed === null || cell.seed === undefined) continue;
    const cooldown = cell.cultivationCooldownMs ?? 2000;
    cell.cultivationCooldownRemaining = (cell.cultivationCooldownRemaining ?? cooldown) - dtMs;
    if ((cell.cultivationCooldownRemaining ?? 0) > 0) continue;

    // Slice 3.5.6: each emission costs one fuel block ≥ the magnitude
    // order of what's about to come out. We compute the value first so
    // both the cost check AND the eventual emit see the same step.
    const step = cell.cultivationStep ?? 0;
    const value = cultivationEmit(cell.type, cell.seed, step);
    const cost = cultivationEmissionCost(value);

    // Plan where the block goes WITHOUT mutating world state yet — both
    // back-pressure (no free port slot) and fuel-starvation must stall
    // the cell idempotently: don't spawn, don't burn fuel, don't advance
    // step, don't reset cooldown. Each retry next frame is cheap.
    const target = planSpawnAtPort(cell, 0, value);
    if (target === 'clogged') {
      showMarginalia(
        'Cultivation output is clogged — clear the port before this cell can emit again.',
        `cultivation_clogged_${cell.id}`,
      );
      continue;
    }

    if (cost.gt(Decimal.dZero) && !spendFuel(cost)) {
      showMarginalia(
        `Cultivation cell stalls — next emission (${valueLabel(value)}) needs fuel ≥ ${cost.toString()}.`,
        `cultivation_starved_${cell.id}`,
      );
      continue;
    }

    cell.cultivationStep = step + 1;
    cell.cultivationCooldownRemaining = cooldown;
    commitSpawn(target, value, canvasLayer);
    updateCultivationBadge(cell);
    markDirty();
  }
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
