// sim/strategies/beam-search.ts
//
// Lookahead strategy: at each "pick next goal" moment, evaluate every
// remaining candidate unlock by running a short speedrun-greedy
// rollout in a cloned world. Commit to the candidate with the earliest
// arrival time. Repeat.
//
// This is beam-width-1 lookahead — sufficient to surface "weird and
// fast" orderings (e.g. taking square-root before exponentiation if
// the predicate-stock savings make multiplication-via-sqrt cheaper),
// without the combinatorial explosion of a full beam.
//
// Cost: O(remainingCandidates × rolloutMaxTicks) per pick. With ~30
// candidates and rollouts of ~10k ticks, each pick costs ~300k tick
// iterations; full run picks ~30 goals → ~9M ticks ≈ a few seconds.

import {
  cloneWorld,
  currentCost,
  canPurchase,
  purchase,
  purchaseLevel,
  tickProduction,
  isPredicateFocus,
  poolAtCap,
  pursueWarehouseExt,
  pursueCompUpgradeExt,
  decide,
  newAgent,
  type WorldState,
  type AgentDecision,
} from '../simulator.ts';
import { LITERATURE_BY_ID } from '../catalog.ts';
import { makeSpeedrunGreedy } from './speedrun-greedy.ts';
import { registerStrategy, type Strategy } from '../strategy.ts';

/** Roll out a speedrun-greedy agent pursuing `goal` in a cloned world.
 *  Returns the tick at which the goal was purchased, or +Infinity if
 *  it wasn't reached within `maxTicks` from the rollout start. */
function rolloutTime(world: WorldState, goal: string, maxTicks: number): number {
  const w = cloneWorld(world);
  const startTick = w.tick;
  const stopTick = startTick + maxTicks;
  const agent = newAgent([goal]);

  // Stall guard: bail if we go too long without a purchase. Mirrors
  // the safety simulate() uses but with a tighter budget — rollouts
  // are speculative and shouldn't burn the full maxTicks chasing a
  // dead end.
  const stallLimit = Math.min(2000, Math.floor(maxTicks / 4));
  let lastPurchase = w.tick;

  while (w.tick < stopTick) {
    if (w.tick - lastPurchase > stallLimit) return Infinity;

    const decision: AgentDecision = decide(w, agent);
    if (decision.done) break;

    if (decision.buy) {
      const ok = purchase(w, decision.buy);
      if (ok) {
        if (decision.buy === goal) return w.tick;
        if (agent.roadmap[agent.goalIndex] === decision.buy) {
          agent.goalIndex += 1;
        }
        lastPurchase = w.tick;
        continue;
      }
      tickProduction(w, 0);
      continue;
    }

    if (decision.buyLevel) {
      const ok = purchaseLevel(w, decision.buyLevel);
      if (ok) {
        lastPurchase = w.tick;
        continue;
      }
      tickProduction(w, 0);
      continue;
    }

    if (decision.tickFocus !== undefined) {
      const focus = decision.tickFocus;
      if (!isPredicateFocus(focus) && poolAtCap(w, focus)) {
        const reroute =
          pursueWarehouseExt(w, focus) ?? pursueCompUpgradeExt(w);
        if (reroute?.buy) {
          const ok = purchase(w, reroute.buy);
          if (ok) {
            if (reroute.buy === goal) return w.tick;
            lastPurchase = w.tick;
            continue;
          }
        }
        if (reroute?.tickFocus !== undefined) {
          tickProduction(w, reroute.tickFocus);
          continue;
        }
      }
      tickProduction(w, focus);
    }
  }
  return Infinity;
}

/** Candidate set: every milestone the agent hasn't unlocked yet. We
 *  treat each cell as a single-pick milestone for beam-search purposes
 *  even though the underlying catalog allows repurchases — re-picking
 *  the same already-unlocked cell would just stall the search. */
function remainingCandidates(world: WorldState, allGoals: string[]): string[] {
  return allGoals.filter((id) => {
    const entry = LITERATURE_BY_ID.get(id);
    if (!entry) return false;
    if (world.unlocked.has(id)) return false;
    return true;
  });
}

export interface BeamSearchOptions {
  /** Maximum ticks per rollout. Default 8000. Each rollout already
   *  stops early on stall (no purchase in 2000 ticks), so this is
   *  more of a wall-clock cap than a fairness budget. */
  rolloutMaxTicks?: number;
  /** Print "picked X (rollout=Yt)" lines to stderr. Default false. */
  verbose?: boolean;
}

export function makeBeamSearch(
  candidatePool: string[],
  options: BeamSearchOptions = {},
): Strategy {
  const rolloutMaxTicks = options.rolloutMaxTicks ?? 8000;
  const verbose = options.verbose ?? false;

  let currentGoal: string | null = null;
  let chosenOrder: string[] = [];
  let inner: Strategy | null = null;

  function pickNext(world: WorldState): string | null {
    const candidates = remainingCandidates(world, candidatePool);
    if (candidates.length === 0) return null;

    let best: string | null = null;
    let bestTime = Infinity;
    for (const c of candidates) {
      if (!LITERATURE_BY_ID.has(c)) continue;
      const t = rolloutTime(world, c, rolloutMaxTicks);
      if (t < bestTime) {
        bestTime = t;
        best = c;
      }
    }
    if (verbose && best !== null) {
      const rel = bestTime === Infinity ? '∞' : `${bestTime - world.tick}t`;
      process.stderr.write(`  beam: picked ${best} (rollout +${rel})\n`);
    }
    return best;
  }

  function ensureGoal(world: WorldState): void {
    if (currentGoal !== null && !world.unlocked.has(currentGoal)) return;
    const next = pickNext(world);
    currentGoal = next;
    if (next !== null) {
      chosenOrder.push(next);
      inner = makeSpeedrunGreedy([next]);
    } else {
      inner = null;
    }
  }

  return {
    name: 'beam-search',
    decide(world) {
      ensureGoal(world);
      if (!inner) return { done: true };
      return inner.decide(world);
    },
    onPurchase(world, entryId) {
      inner?.onPurchase?.(world, entryId);
      if (entryId === currentGoal) {
        currentGoal = null; // forces a re-pick on next decide()
        inner = null;
      }
    },
    currentGoal() {
      return currentGoal;
    },
  };
}

// Default candidate pool — the milestone subset of the standard
// roadmap. Excludes comp/pipe/warehouse infrastructure (those are
// bought reactively by the inner speedrun-greedy via the comp gate /
// pool-cap detours). Including them as candidates would just inflate
// the rollout count without giving beam search any genuinely novel
// ordering to discover.
const DEFAULT_BEAM_CANDIDATES = [
  'successor',
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'negation',
  'exponentiation',
  'inversion',
  'square-root',
  'decrement',
  'factor',
  'tetration',
  'pentation',
];

registerStrategy('beam-search', (opts) => {
  // Intersect the user's roadmap with the milestone pool — they get
  // explored, infrastructure is implicit.
  const candidates = DEFAULT_BEAM_CANDIDATES.filter((id) => opts.roadmap.includes(id));
  const pool = candidates.length > 0 ? candidates : DEFAULT_BEAM_CANDIDATES;
  return makeBeamSearch(pool, { verbose: process.env.BEAM_VERBOSE === '1' });
});

