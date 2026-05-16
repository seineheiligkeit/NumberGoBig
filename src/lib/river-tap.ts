/**
 * River-tap — the level-3 Successor quality (Slice 6.7).
 *
 * A Successor at level ≥ 3 fires on its own cadence, pulling zeros
 * directly from the river without needing a pipe ≤1 attached. The cell
 * still emits one operation per firing (in line with the sim's strict
 * throughput model: `rate = min(cell_supply, …)` rather than letting
 * pipe and cell speedups multiply). Each firing emits
 * `levelMultiplier(level)` ones at the output port.
 *
 * Cadence is fixed at 1000ms regardless of level; the level scales
 * output count, not firing rate. This keeps the in-game rate aligned
 * with the simulator's predicted rate for sim-tuned cost curves.
 */

import type { Container } from 'pixi.js';
import {
  allCells,
  cellLevel,
  levelMultiplier,
  type PlacedCell,
} from './world';
import { planSpawnAtPort, commitSpawn } from './spawn';
import { VALUE_ONE } from './value';
import { showMarginalia } from './marginalia';

const RIVER_TAP_PERIOD_MS = 1000;

/** Per-cell cooldown remaining (ms). Cells not in the map default to a
 *  full period — first firing happens one period after the cell becomes
 *  river-tap-eligible. */
const cooldowns = new Map<number, number>();

/**
 * Per-frame driver. Iterates every Successor cell; if its type-global
 * level is ≥ 3, ticks its private river-tap cooldown and fires when
 * ready. Cells below lvl 3 are skipped (their cooldown state, if any,
 * is held but unused).
 *
 * Does NOT consume from an input slot — the river is the source. The
 * pipe-fed firing path (`fireCellViaPipe`) keeps working in parallel:
 * a player who wires a pipe-1 to a lvl-3 successor gets BOTH river-tap
 * and pipe deliveries firing the cell. The two cadences interleave
 * naturally; the planSpawn back-pressure handles port congestion.
 */
export function tickRiverTapSuccessors(
  dtMs: number,
  canvasLayer: Container,
): void {
  const level = cellLevel('successor');
  if (level < 3) {
    // Quality not unlocked — nothing to do. Don't clear cooldowns;
    // they're tiny and harmless.
    return;
  }
  const emitMultiplier = levelMultiplier(level);

  for (const cell of allCells()) {
    if (cell.type !== 'successor') continue;

    let remaining = cooldowns.get(cell.id);
    if (remaining === undefined) {
      remaining = RIVER_TAP_PERIOD_MS;
    }
    remaining -= dtMs;

    if (remaining > 0) {
      cooldowns.set(cell.id, remaining);
      continue;
    }

    // Plan the spawn; if the output port is clogged or comp-jammed, defer.
    const plan = planSpawnAtPort(cell, 0, VALUE_ONE);
    if (plan === 'jammed') {
      // River-tap produces 1s — which are always within comp ≥ 2 baseline.
      // This branch is effectively unreachable but kept for defensive
      // exhaustiveness on the SpawnPlan union.
      cooldowns.set(cell.id, RIVER_TAP_PERIOD_MS);
      continue;
    }
    if (plan === 'clogged') {
      showMarginalia(
        `Successor output clogged — river-tap idle.`,
        `cell_output_clogged_${cell.id}`,
      );
      cooldowns.set(cell.id, RIVER_TAP_PERIOD_MS);
      continue;
    }

    commitSpawn(plan, VALUE_ONE, canvasLayer, emitMultiplier);
    cooldowns.set(cell.id, RIVER_TAP_PERIOD_MS);
  }
}

/** Clears stale cooldown state when a cell is removed. The setup module
 *  isn't currently tracking removal, so this is best-effort: stale
 *  entries are harmless (just take a few bytes) and any reused id
 *  (which doesn't happen — ids are monotonic) would inherit a partial
 *  cooldown which evens out on the first re-fire. */
export function clearRiverTapCooldown(cell: PlacedCell): void {
  cooldowns.delete(cell.id);
}
