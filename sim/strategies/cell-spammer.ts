// sim/strategies/cell-spammer.ts
//
// "Prefer cloning over leveling." Whenever the baseline strategy
// would upgrade a cell's level, redirect to cloning a fresh copy of
// the same cell type (if affordable). Tests whether level upgrades
// are correctly priced relative to clone costs — if spammer wins,
// levels are over-priced; if it loses, levels deliver more
// throughput-per-stockpile than the ladder suggests.

import {
  canPurchase,
  currentCost,
  entryForCellTypeExt,
  type WorldState,
} from '../simulator.ts';
import { makeSpeedrunGreedy } from './speedrun-greedy.ts';
import { registerStrategy, type Strategy } from '../strategy.ts';

export function makeCellSpammer(roadmap: string[]): Strategy {
  const base = makeSpeedrunGreedy(roadmap);
  return {
    name: 'cell-spammer',
    decide(world: WorldState) {
      const inner = base.decide(world);
      if (inner.buyLevel) {
        const cellType = inner.buyLevel.target.cellType;
        const cellEntry = entryForCellTypeExt(cellType);
        if (cellEntry) {
          const cost = currentCost(
            cellEntry,
            world.purchaseCount.get(cellEntry.id) ?? 0,
          );
          if (canPurchase(world, cellEntry, cost)) {
            return { buy: cellEntry.id };
          }
        }
        // Can't afford a clone — fall through and let the inner
        // decision (upgrade) proceed.
      }
      return inner;
    },
    onPurchase(world, entryId) {
      base.onPurchase?.(world, entryId);
    },
    currentGoal() {
      return base.currentGoal?.() ?? null;
    },
  };
}

registerStrategy('cell-spammer', (opts) => makeCellSpammer(opts.roadmap));
