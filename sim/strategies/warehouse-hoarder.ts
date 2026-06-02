// sim/strategies/warehouse-hoarder.ts
//
// "Buy warehouses early." For every value the pool is already
// accumulating (>40% of cap), if a warehouse for it is affordable,
// buy one before doing anything else. Tests whether warehouses are
// undervalued — if hoarder beats baseline, the agent should be
// buying warehouses more aggressively.

import {
  canPurchase,
  currentCost,
  poolCap,
  type WorldState,
} from '../simulator.ts';
import { LITERATURE } from '../catalog.ts';
import { makeSpeedrunGreedy } from './speedrun-greedy.ts';
import { registerStrategy, type Strategy } from '../strategy.ts';

const EARLY_FILL_RATIO = 0.4;

export function makeWarehouseHoarder(roadmap: string[]): Strategy {
  const base = makeSpeedrunGreedy(roadmap);
  return {
    name: 'warehouse-hoarder',
    decide(world: WorldState) {
      // Scan every warehouse entry. If the pool for its value is
      // already trending toward cap and the warehouse is affordable,
      // buy it preemptively.
      for (const entry of LITERATURE) {
        if (entry.kind !== 'warehouse') continue;
        if (entry.warehouseValue === undefined) continue;
        const value = entry.warehouseValue;
        const have = world.pool.get(value) ?? 0;
        const cap = poolCap(world, value);
        if (!Number.isFinite(cap)) continue;
        if (have < cap * EARLY_FILL_RATIO) continue;
        const cost = currentCost(entry, world.purchaseCount.get(entry.id) ?? 0);
        if (canPurchase(world, entry, cost)) {
          return { buy: entry.id };
        }
      }
      return base.decide(world);
    },
    onPurchase(world, entryId) {
      base.onPurchase?.(world, entryId);
    },
    currentGoal() {
      return base.currentGoal?.() ?? null;
    },
  };
}

registerStrategy('warehouse-hoarder', (opts) => makeWarehouseHoarder(opts.roadmap));
