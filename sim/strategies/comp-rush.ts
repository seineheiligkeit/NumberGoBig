// sim/strategies/comp-rush.ts
//
// "Always pursue the next comp upgrade." When the baseline strategy
// is grinding toward an operator-unlock cost (not buying anything
// right now), divert grinding-time toward the next comprehension
// upgrade's cost instead. Infrastructure / level-up purchases
// proposed by the baseline are allowed through — comp-rush only
// reroutes the *grind*.
//
// Tests whether the comp ladder is correctly costed relative to
// operator unlocks. If comp-rush wins handily, comp is too cheap
// (or operator unlocks too tight); if it loses, comp is over-priced.

import {
  canPurchase,
  currentCost,
  mostNeededFocusExt,
  nextCompUpgradeExt,
  ticksToAffordExt,
  type WorldState,
} from '../simulator.ts';
import { makeSpeedrunGreedy } from './speedrun-greedy.ts';
import { registerStrategy, type Strategy } from '../strategy.ts';

export function makeCompRush(roadmap: string[]): Strategy {
  const base = makeSpeedrunGreedy(roadmap);
  return {
    name: 'comp-rush',
    decide(world: WorldState) {
      const inner = base.decide(world);
      if (inner.buy || inner.buyLevel || inner.done) return inner;

      // We're grinding (tickFocus). Divert to the next comp upgrade
      // if one exists and is reachable.
      const compEntry = nextCompUpgradeExt(world);
      if (!compEntry) return inner;
      const cost = currentCost(
        compEntry,
        world.purchaseCount.get(compEntry.id) ?? 0,
      );
      if (canPurchase(world, compEntry, cost)) {
        return { buy: compEntry.id };
      }
      // Only divert if comp's cost is currently reachable — otherwise
      // we'd starve the agent of the infrastructure needed to produce
      // anything.
      if (!Number.isFinite(ticksToAffordExt(world, cost))) return inner;
      const focus = mostNeededFocusExt(world, cost);
      if (focus !== null) return { tickFocus: focus };
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

registerStrategy('comp-rush', (opts) => makeCompRush(opts.roadmap));
