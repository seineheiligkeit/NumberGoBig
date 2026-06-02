// sim/strategies/speedrun-greedy.ts
//
// Baseline strategy: the original baked-in agent extracted into the
// Strategy interface. Identical behaviour to pre-refactor `decide()` —
// pacing-locked.csv must match byte-for-byte when using this strategy
// with the default config.

import { decide, newAgent, type AgentState, type WorldState } from '../simulator.ts';
import { registerStrategy, type Strategy } from '../strategy.ts';

export function makeSpeedrunGreedy(roadmap: string[]): Strategy {
  const agent: AgentState = newAgent(roadmap);
  return {
    name: 'speedrun-greedy',
    decide(world: WorldState) {
      return decide(world, agent);
    },
    onPurchase(_world: WorldState, entryId: string) {
      // The simulate() loop calls this after every successful buy.
      // Mirror the previous in-loop logic: advance the goal pointer
      // when we just bought the current roadmap goal.
      if (agent.roadmap[agent.goalIndex] === entryId) {
        agent.goalIndex += 1;
      }
    },
    currentGoal() {
      return agent.roadmap[agent.goalIndex] ?? null;
    },
  };
}

registerStrategy('speedrun-greedy', (opts) => makeSpeedrunGreedy(opts.roadmap));
