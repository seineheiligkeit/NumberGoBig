// sim/strategy.ts
//
// Pluggable agent strategies. Each Strategy owns its own goal-selection
// state and exposes a single `decide(world)` method. The simulator
// drives the loop the same way regardless of strategy.
//
// Strategies shipped with this slice:
//   - speedrun-greedy   : the original baked-in agent (pacing-locked baseline)
//   - comp-rush         : always max comp before any operator unlock
//   - warehouse-hoarder : buy typed warehouses early and often
//   - cell-spammer      : prefer cloning over leveling
//   - beam-search       : K-step lookahead to discover non-obvious orderings

import type { AgentDecision, WorldState } from './simulator.ts';

export interface Strategy {
  /** Human-readable name (used in compare tables / CSV). */
  name: string;
  /** Pick the next action given the current world. */
  decide(world: WorldState): AgentDecision;
  /** Called after a successful purchase so the strategy can advance
   *  its goal pointer / invalidate caches. */
  onPurchase?(world: WorldState, entryId: string): void;
}

export interface StrategyOptions {
  /** Initial roadmap. Some strategies ignore this and pick their own
   *  ordering (e.g. beam-search). Speedrun-greedy follows it. */
  roadmap: string[];
}

export type StrategyFactory = (opts: StrategyOptions) => Strategy;

// Registry of strategy names → factory.
export const STRATEGIES: Record<string, StrategyFactory> = {};

export function registerStrategy(name: string, factory: StrategyFactory): void {
  STRATEGIES[name] = factory;
}

export function createStrategy(name: string, opts: StrategyOptions): Strategy {
  const factory = STRATEGIES[name];
  if (!factory) {
    const known = Object.keys(STRATEGIES).join(', ');
    throw new Error(`Unknown strategy "${name}". Known: ${known}`);
  }
  return factory(opts);
}
