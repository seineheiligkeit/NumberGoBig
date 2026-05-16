// sim/simulator.ts
//
// Pacing simulator engine — Phase 6 model (Comprehension as Spine).
// Runs a tick-by-tick simulation of an "optimal-play" agent walking a
// fixed Literature roadmap.
//
// Phase 6 changes (α.1 port):
//   - Comprehension is the universal gate. Producing value V requires
//     comp ≥ V; the recipe DAG is checked against the comp ceiling at
//     each call.
//   - Pipes have no leveling axis (dissolved into the comp ladder).
//     Throughput from a pipe-rated path is `count × 1` per tick.
//   - Pipe purchases honor `compRequirement` (a 2^N-pipe requires
//     comp ≥ 2^(N+1)).
//   - Agent picks comp upgrades when comp is the bottleneck.
//   - Decomposer-bot and transformer-cultivator entries land in the
//     catalog as stubs; their tick-time effects on production wire up
//     in α.2.
//
// Production model
// ----------------
//
// For each target value V, we compute a **resource-cost vector** — how
// many firings of each cell type (and how many river zeros) are
// required to manufacture one unit of V from scratch. The steady-state
// production rate of V is then:
//
//   rate(V) = min over cell types C of (N_cells(C) / cost_per_output_C(V))
//
// This naturally captures sharing across recipes.
//
// The agent focuses on ONE value at a time — the most-needed item in
// the current cost bundle.

import {
  type CellType,
  type LitEntry,
  type CostItem,
  type LevelEntry,
  LITERATURE,
  LITERATURE_BY_ID,
  RECIPE_BY_VALUE,
  MANUAL_PICKUP_RATE_PER_TICK,
  levelMultiplier,
  nextLevelEntry,
} from './catalog.ts';

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------

export interface WorldState {
  tick: number;
  /** Number of each cell type owned. */
  cells: Map<CellType, number>;
  /** Current level per cell type (default 1). All cells of a type share level. */
  cellLevels: Map<CellType, number>;
  /** Number of pipes per magnitude rating. No leveling. */
  pipes: Map<number, number>;
  /** Pool of accumulated currency: value → count (fractional accumulators OK). */
  pool: Map<number, number>;
  /** Set of Literature ids already purchased. */
  unlocked: Set<string>;
  /** Per-entry purchase counts (for geometric repurchase cost scaling). */
  purchaseCount: Map<string, number>;
  /** Comprehension ceiling — the spine. Baseline is 2 (Phase 6, DESIGN §9). */
  comprehension: number;
}

export function newWorld(): WorldState {
  return {
    tick: 0,
    cells: new Map(),
    cellLevels: new Map(),
    pipes: new Map(),
    pool: new Map(),
    unlocked: new Set(),
    purchaseCount: new Map(),
    comprehension: 2, // Phase 6 baseline (DESIGN §9: Comp ≤ 2 at game start)
  };
}

/** Effective throughput contributed by a cell type (count × level multiplier). */
export function cellThroughput(world: WorldState, cellType: CellType): number {
  const count = world.cells.get(cellType) ?? 0;
  const level = world.cellLevels.get(cellType) ?? 1;
  return count * levelMultiplier(level);
}

/** Pipe throughput at a given magnitude — count alone (no leveling in Phase 6). */
export function pipeThroughput(world: WorldState, magnitude: number): number {
  return world.pipes.get(magnitude) ?? 0;
}

// ---------------------------------------------------------------------------
// Resource-cost vector
// ---------------------------------------------------------------------------

/**
 * Returns the cheapest fuel block size for a given magnitude requirement.
 * Mirrors the in-game "pay one block ≥ cost" rule.
 */
export function smallestFuelDenomination(magnitudeRequired: number): number {
  if (magnitudeRequired <= 1) return 1;
  if (magnitudeRequired <= 10) return 10;
  if (magnitudeRequired <= 100) return 100;
  if (magnitudeRequired <= 1000) return 1000;
  return Math.pow(10, Math.ceil(Math.log10(magnitudeRequired)));
}

/**
 * Effective fuel magnitude for a recipe given the firing cell's current
 * level. Mirrors the level qualities:
 *
 *   - Mult/Exp lvl 3+: fuel magnitude − 1 (min 1)
 *   - Mult/Exp lvl 5:  fuel magnitude halved (min 1)
 */
export function effectiveFuelMagnitude(
  world: WorldState,
  cellType: CellType,
  baseMagnitude: number,
): number {
  if (baseMagnitude <= 0) return 0;
  const level = world.cellLevels.get(cellType) ?? 1;
  if (level >= 5 && (cellType === 'multiplication' || cellType === 'exponentiation')) {
    return Math.max(1, Math.floor(baseMagnitude / 2));
  }
  if (level >= 3 && (cellType === 'multiplication' || cellType === 'exponentiation')) {
    return Math.max(1, baseMagnitude - 1);
  }
  return baseMagnitude;
}

/**
 * The resource vector for producing one unit of `target`, given the
 * current factory state (levels affect effective fuel costs). Keys are
 * cell types (their firings required) plus the special key `'zero'`
 * (river zeros consumed).
 */
export type ResourceVector = Map<string, number>;

export function resourceCost(world: WorldState, target: number): ResourceVector {
  const vec: ResourceVector = new Map();
  const add = (key: string, n: number) =>
    vec.set(key, (vec.get(key) ?? 0) + n);

  function visit(v: number, multiplier: number) {
    if (v === 0) {
      add('zero', multiplier);
      return;
    }
    const r = RECIPE_BY_VALUE.get(v);
    if (!r) {
      add(`literal:${v}`, multiplier);
      return;
    }
    add(r.cell, multiplier);
    for (const inp of r.inputs) {
      visit(inp, multiplier);
    }
    const fuelMag = effectiveFuelMagnitude(world, r.cell, r.fuelMagnitude);
    if (fuelMag > 0) {
      const fuelValue = smallestFuelDenomination(fuelMag);
      visit(fuelValue, multiplier);
    }
  }

  visit(target, 1);
  return vec;
}

/**
 * Largest value that appears anywhere in the recipe DAG for `target`,
 * INCLUDING fuel sub-recipes. Used to gate production against the
 * comprehension ceiling — every intermediate must be ≤ comp for the
 * production path to be viable.
 *
 * Phase 6 universal rule (DESIGN §9): producing V requires comp ≥
 * each intermediate's value, because every block on the canvas
 * (input, output, fuel) must be liftable/pipeable to flow.
 */
export function maxIntermediateValue(target: number): number {
  let max = 0;
  const visited = new Set<number>();
  function visit(v: number) {
    if (visited.has(v)) return;
    visited.add(v);
    if (v > max) max = v;
    const r = RECIPE_BY_VALUE.get(v);
    if (!r) return;
    for (const inp of r.inputs) visit(inp);
    if (r.fuelMagnitude > 0) {
      const fuelValue = smallestFuelDenomination(r.fuelMagnitude);
      visit(fuelValue);
    }
  }
  visit(target);
  return max;
}

// ---------------------------------------------------------------------------
// Throughput math
// ---------------------------------------------------------------------------

/**
 * Effective zero supply, accounting for the level-3 successor river-tap
 * quality. Without river-tap, zeros come from pipe ≤1s (or manual
 * pickup). With river-tap (successor lvl ≥ 3), zeros stream directly
 * into the successor at successor-throughput rate.
 */
export function zeroSupply(world: WorldState): number {
  const successorLevel = world.cellLevels.get('successor') ?? 1;
  if (successorLevel >= 3 && (world.cells.get('successor') ?? 0) > 0) {
    return cellThroughput(world, 'successor');
  }
  const pipe1 = pipeThroughput(world, 1);
  return pipe1 > 0 ? pipe1 : MANUAL_PICKUP_RATE_PER_TICK;
}

/**
 * Steady-state production rate (per tick) for one value, given the
 * factory's owned cells/pipes and Comprehension ceiling.
 *
 * Returns 0 if the target — or any intermediate in its recipe DAG —
 * exceeds Comprehension. This is the Phase 6 universal rule's
 * simulator-level expression: a value the factory cannot lift cannot
 * flow.
 */
export function steadyStateRate(world: WorldState, target: number): number {
  if (target === 0) return zeroSupply(world);

  // Phase 6 comp gate: any intermediate above comp blocks the whole path.
  if (maxIntermediateValue(target) > world.comprehension) return 0;

  const vec = resourceCost(world, target);
  let minRate = Infinity;
  for (const [key, perOutput] of vec) {
    if (perOutput <= 0) continue;
    let supply: number;
    if (key === 'zero') {
      supply = zeroSupply(world);
    } else if (key.startsWith('literal:')) {
      return 0;
    } else {
      supply = cellThroughput(world, key as CellType);
    }
    if (supply <= 0) return 0;
    minRate = Math.min(minRate, supply / perOutput);
  }
  return minRate === Infinity ? 0 : minRate;
}

/**
 * Identifies which cell type (or pipe-≤1 → 'zero' / 'comprehension')
 * is the binding constraint when producing `target`. The agent buys
 * more of this to raise the production rate.
 */
export function bottleneckResource(
  world: WorldState,
  target: number,
): string | null {
  if (target === 0) {
    const successorLevel = world.cellLevels.get('successor') ?? 1;
    if (successorLevel >= 3 && (world.cells.get('successor') ?? 0) > 0) {
      return 'successor';
    }
    return (world.pipes.get(1) ?? 0) === 0 ? 'zero' : null;
  }

  // Phase 6 comp bottleneck — checked before any cell-supply analysis.
  if (maxIntermediateValue(target) > world.comprehension) return 'comprehension';

  const vec = resourceCost(world, target);
  let worstRatio = Infinity;
  let worstKey: string | null = null;
  for (const [key, perOutput] of vec) {
    if (perOutput <= 0) continue;
    let supply: number;
    if (key === 'zero') {
      supply = zeroSupply(world);
    } else if (key.startsWith('literal:')) {
      return key;
    } else {
      supply = cellThroughput(world, key as CellType);
    }
    const ratio = supply / perOutput;
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worstKey = key;
    }
  }
  return worstKey;
}

// ---------------------------------------------------------------------------
// Purchase logic
// ---------------------------------------------------------------------------

export function currentCost(entry: LitEntry, purchaseCount: number): CostItem[] {
  if (entry.once || purchaseCount === 0) return entry.cost;
  const scale = entry.costScale ?? 1.6;
  return entry.cost.map((item) => ({
    value: item.value,
    count: Math.ceil(item.count * Math.pow(scale, purchaseCount)),
  }));
}

export function canAfford(world: WorldState, cost: CostItem[]): boolean {
  const required = new Map<number, number>();
  for (const item of cost) {
    required.set(item.value, (required.get(item.value) ?? 0) + item.count);
  }
  for (const [value, need] of required) {
    if ((world.pool.get(value) ?? 0) < need) return false;
  }
  return true;
}

/**
 * Phase 6: a purchase is allowed only if its `compRequirement` is met
 * AND its cost is affordable. Pipes with `compRequirement = 2^(N+1)`
 * can't be bought until comp climbs that high.
 */
export function canPurchase(world: WorldState, entry: LitEntry, cost: CostItem[]): boolean {
  if (entry.compRequirement && world.comprehension < entry.compRequirement) return false;
  return canAfford(world, cost);
}

export function deductCost(world: WorldState, cost: CostItem[]): void {
  const required = new Map<number, number>();
  for (const item of cost) {
    required.set(item.value, (required.get(item.value) ?? 0) + item.count);
  }
  for (const [value, need] of required) {
    const have = world.pool.get(value) ?? 0;
    world.pool.set(value, have - need);
  }
}

/**
 * Apply a level-up. Deducts cost, increments the level, sets the entry
 * as unlocked. Returns true on success. Phase 6: cell-level only
 * (pipes no longer have a level axis).
 */
export function purchaseLevel(world: WorldState, entry: LevelEntry): boolean {
  if (!canAfford(world, entry.cost)) return false;
  const currentLevel = world.cellLevels.get(entry.target.cellType) ?? 1;
  if (currentLevel !== entry.level - 1) return false;

  deductCost(world, entry.cost);
  world.cellLevels.set(entry.target.cellType, entry.level);
  world.unlocked.add(entry.id);
  return true;
}

export function purchase(world: WorldState, entryId: string): boolean {
  const entry = LITERATURE_BY_ID.get(entryId);
  if (!entry) return false;
  const owned = world.purchaseCount.get(entryId) ?? 0;
  if (entry.once && owned > 0) return false;

  const cost = currentCost(entry, owned);
  if (!canPurchase(world, entry, cost)) return false;

  deductCost(world, cost);
  world.purchaseCount.set(entryId, owned + 1);
  world.unlocked.add(entryId);

  switch (entry.kind) {
    case 'cell':
      if (entry.cellType) {
        world.cells.set(entry.cellType, (world.cells.get(entry.cellType) ?? 0) + 1);
      }
      break;
    case 'pipe':
      if (entry.pipeMagnitude !== undefined) {
        world.pipes.set(
          entry.pipeMagnitude,
          (world.pipes.get(entry.pipeMagnitude) ?? 0) + 1,
        );
      }
      break;
    case 'comprehension':
      if (entry.comprehensionLevel) {
        world.comprehension = Math.max(world.comprehension, entry.comprehensionLevel);
      }
      break;
    case 'bot':
      // α.1: bots are catalog stubs. Tick-time effects (T-bots as
      // frontier throughput; decomposer bots as jam-clearing) wire up
      // in α.2.
      break;
    case 'theorem':
      break;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Per-tick production
// ---------------------------------------------------------------------------

export function tickProduction(world: WorldState, focus: number): void {
  const rate = steadyStateRate(world, focus);
  if (rate > 0) {
    const cur = world.pool.get(focus) ?? 0;
    world.pool.set(focus, cur + rate);
  }
  world.tick += 1;
}

// ---------------------------------------------------------------------------
// Agent decision policy
// ---------------------------------------------------------------------------

export interface AgentDecision {
  buy?: string;
  buyLevel?: LevelEntry;
  tickFocus?: number;
  done?: boolean;
}

export interface AgentState {
  roadmap: string[];
  goalIndex: number;
}

export function newAgent(roadmap: string[]): AgentState {
  return { roadmap, goalIndex: 0 };
}

/** Picks the cost item with the largest production-time shortfall. */
function mostNeededValue(world: WorldState, cost: CostItem[]): number | null {
  let worstShortfall = -1;
  let worstValue: number | null = null;
  for (const item of cost) {
    const have = world.pool.get(item.value) ?? 0;
    const need = item.count - have;
    if (need <= 0) continue;
    const rate = steadyStateRate(world, item.value);
    const ticksNeeded = rate > 0 ? need / rate : Infinity;
    if (ticksNeeded > worstShortfall) {
      worstShortfall = ticksNeeded;
      worstValue = item.value;
    }
  }
  return worstValue;
}

function entryForCellType(cellType: CellType): LitEntry | null {
  for (const entry of LITERATURE_BY_ID.values()) {
    if (entry.kind === 'cell' && entry.cellType === cellType) return entry;
  }
  return null;
}

/**
 * Returns the entry id that would resolve the given resource bottleneck:
 * a pipe ≤1 purchase for 'zero', or the cell entry for a cell-type key.
 */
function infraEntryForBottleneck(bn: string): LitEntry | null {
  if (bn === 'zero') return LITERATURE_BY_ID.get('pipe_0') ?? null;
  if (bn.startsWith('literal:')) return null;
  return entryForCellType(bn as CellType);
}

/**
 * Phase 6: next unowned comprehension upgrade above the current ceiling.
 * The agent buys these sequentially as the comp gate forces.
 */
function nextCompUpgrade(world: WorldState): LitEntry | null {
  let best: LitEntry | null = null;
  for (const entry of LITERATURE) {
    if (entry.kind !== 'comprehension') continue;
    if (world.unlocked.has(entry.id)) continue;
    if ((entry.comprehensionLevel ?? 0) <= world.comprehension) continue;
    if (
      !best ||
      (entry.comprehensionLevel ?? Infinity) < (best.comprehensionLevel ?? Infinity)
    ) {
      best = entry;
    }
  }
  return best;
}

function ticksToAfford(world: WorldState, cost: CostItem[]): number {
  let worst = 0;
  for (const item of cost) {
    const have = world.pool.get(item.value) ?? 0;
    const need = item.count - have;
    if (need <= 0) continue;
    const rate = steadyStateRate(world, item.value);
    if (rate <= 0) return Infinity;
    worst = Math.max(worst, need / rate);
  }
  return worst;
}

export function decide(world: WorldState, agent: AgentState): AgentDecision {
  while (agent.goalIndex < agent.roadmap.length) {
    const goalId = agent.roadmap[agent.goalIndex];
    if (world.unlocked.has(goalId) && LITERATURE_BY_ID.get(goalId)?.once) {
      agent.goalIndex += 1;
      continue;
    }
    const entry = LITERATURE_BY_ID.get(goalId);
    if (!entry) {
      agent.goalIndex += 1;
      continue;
    }
    const cost = currentCost(entry, world.purchaseCount.get(goalId) ?? 0);

    // Phase 6: if the entry has a compRequirement we can't meet, route
    // through the comp ladder first regardless of affordability.
    if (entry.compRequirement && world.comprehension < entry.compRequirement) {
      const compDecision = pursueCompUpgrade(world);
      if (compDecision) return compDecision;
      // Fallthrough: no comp upgrade available — agent will idle.
    }

    if (canPurchase(world, entry, cost)) {
      return { buy: goalId };
    }

    const focus = mostNeededValue(world, cost);
    if (focus === null) {
      return { tickFocus: 0 };
    }

    const bn = bottleneckResource(world, focus);
    if (!bn || bn.startsWith('literal:')) {
      return { tickFocus: focus };
    }

    // Phase 6: if the focus value's bottleneck is comp, prioritise the
    // next comp upgrade — clone/upgrade analysis doesn't help here.
    if (bn === 'comprehension') {
      const compDecision = pursueCompUpgrade(world);
      if (compDecision) return compDecision;
      return { tickFocus: focus }; // No more comp tiers; idle.
    }

    // Standard clone/upgrade ROI analysis for cell-supply bottlenecks.
    const infraEntry = infraEntryForBottleneck(bn);
    const cloneCount = infraEntry
      ? world.purchaseCount.get(infraEntry.id) ?? 0
      : 0;
    const cloneCost = infraEntry ? currentCost(infraEntry, cloneCount) : null;

    // Phase 6: pipes no longer level. Only cell-type bottlenecks have
    // upgrade options.
    let upgradeEntry: LevelEntry | null = null;
    if (!bn.startsWith('literal:') && bn !== 'zero') {
      const cellType = bn as CellType;
      const currentLevel = world.cellLevels.get(cellType) ?? 1;
      upgradeEntry = nextLevelEntry({ kind: 'cell', cellType }, currentLevel);
    }

    let bestAction:
      | { kind: 'goal' }
      | { kind: 'clone' }
      | { kind: 'upgrade'; entry: LevelEntry }
      | { kind: 'pursue-infra'; cost: CostItem[] }
      | null = null;
    let bestScore = Infinity;

    const goalRemaining = ticksToAfford(world, cost);
    bestAction = { kind: 'goal' };
    bestScore = goalRemaining;

    if (cloneCost && infraEntry) {
      const ownedCells =
        infraEntry.kind === 'cell' && infraEntry.cellType
          ? world.cells.get(infraEntry.cellType) ?? 0
          : infraEntry.kind === 'pipe' && infraEntry.pipeMagnitude !== undefined
            ? world.pipes.get(infraEntry.pipeMagnitude) ?? 0
            : 0;
      const levelMult =
        infraEntry.kind === 'cell' && infraEntry.cellType
          ? levelMultiplier(world.cellLevels.get(infraEntry.cellType) ?? 1)
          : 1; // pipes don't level
      const currentSupply = ownedCells * levelMult;
      const cloneSpeedupRatio =
        currentSupply > 0 ? currentSupply / (currentSupply + levelMult) : 0;
      const cloneAffordable = canPurchase(world, infraEntry, cloneCost);
      const cloneAffordTime = cloneAffordable ? 0 : ticksToAfford(world, cloneCost);
      const cloneScore = cloneAffordTime + goalRemaining * cloneSpeedupRatio;
      if (cloneScore < bestScore) {
        bestScore = cloneScore;
        if (cloneAffordable) {
          bestAction = { kind: 'clone' };
        } else {
          bestAction = { kind: 'pursue-infra', cost: cloneCost };
        }
      }
    }

    if (upgradeEntry) {
      const upgradeAffordTime = canAfford(world, upgradeEntry.cost)
        ? 0
        : ticksToAfford(world, upgradeEntry.cost);
      const upgradeSpeedupRatio = 0.5;
      const upgradeScore = upgradeAffordTime + goalRemaining * upgradeSpeedupRatio;
      if (upgradeScore < bestScore) {
        bestScore = upgradeScore;
        if (canAfford(world, upgradeEntry.cost)) {
          bestAction = { kind: 'upgrade', entry: upgradeEntry };
        } else {
          bestAction = { kind: 'pursue-infra', cost: upgradeEntry.cost };
        }
      }
    }

    if (bestAction === null) return { tickFocus: focus };
    if (bestAction.kind === 'clone' && infraEntry) {
      return { buy: infraEntry.id };
    }
    if (bestAction.kind === 'upgrade') {
      return { buyLevel: bestAction.entry };
    }
    if (bestAction.kind === 'pursue-infra') {
      const infraFocus = mostNeededValue(world, bestAction.cost);
      if (infraFocus !== null) {
        return { tickFocus: infraFocus };
      }
    }
    return { tickFocus: focus };
  }
  return { done: true };
}

/**
 * Phase 6 helper: when comp is the bottleneck, route the agent toward
 * the next available comp upgrade — either buy it or pursue its cost.
 * Returns null if there's no comp upgrade to pursue.
 */
function pursueCompUpgrade(world: WorldState): AgentDecision | null {
  const compEntry = nextCompUpgrade(world);
  if (!compEntry) return null;
  if (canPurchase(world, compEntry, compEntry.cost)) {
    return { buy: compEntry.id };
  }
  const compFocus = mostNeededValue(world, compEntry.cost);
  if (compFocus !== null) return { tickFocus: compFocus };
  return null;
}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

export interface TraceEvent {
  tick: number;
  kind: 'purchase' | 'stall' | 'note';
  message: string;
}

export interface SimulationResult {
  finalTick: number;
  events: TraceEvent[];
  unlocks: Map<string, number>;
  finalWorld: WorldState;
  stalled: boolean;
}

export function simulate(
  agent: AgentState,
  options: { maxTicks: number; stallThreshold?: number } = { maxTicks: 100_000 },
): SimulationResult {
  const world = newWorld();
  const events: TraceEvent[] = [];
  const unlocks = new Map<string, number>();
  const stallThreshold = options.stallThreshold ?? 50_000;

  let lastPurchaseTick = 0;
  let stalled = false;

  while (world.tick < options.maxTicks) {
    const decision = decide(world, agent);
    if (decision.done) break;

    if (decision.buy) {
      const ok = purchase(world, decision.buy);
      if (ok) {
        events.push({
          tick: world.tick,
          kind: 'purchase',
          message: `Bought ${decision.buy}`,
        });
        if (!unlocks.has(decision.buy)) {
          unlocks.set(decision.buy, world.tick);
          if (agent.roadmap[agent.goalIndex] === decision.buy) {
            agent.goalIndex += 1;
          }
        }
        lastPurchaseTick = world.tick;
        continue;
      }
      tickProduction(world, 0);
      continue;
    }

    if (decision.buyLevel) {
      const ok = purchaseLevel(world, decision.buyLevel);
      if (ok) {
        events.push({
          tick: world.tick,
          kind: 'purchase',
          message: `Upgraded ${decision.buyLevel.id}`,
        });
        unlocks.set(decision.buyLevel.id, world.tick);
        lastPurchaseTick = world.tick;
        continue;
      }
      tickProduction(world, 0);
      continue;
    }

    if (decision.tickFocus !== undefined) {
      tickProduction(world, decision.tickFocus);

      if (world.tick - lastPurchaseTick > stallThreshold) {
        const goalId = agent.roadmap[agent.goalIndex];
        events.push({
          tick: world.tick,
          kind: 'stall',
          message: `Agent stalled at goal "${goalId}" — ${describeBottleneck(world, goalId)}`,
        });
        stalled = true;
        break;
      }
    }
  }

  return {
    finalTick: world.tick,
    events,
    unlocks,
    finalWorld: world,
    stalled,
  };
}

function describeBottleneck(world: WorldState, goalId: string): string {
  const entry = LITERATURE_BY_ID.get(goalId);
  if (!entry) return 'unknown';
  const owned = world.purchaseCount.get(goalId) ?? 0;
  const cost = currentCost(entry, owned);
  const parts: string[] = [];
  if (entry.compRequirement && world.comprehension < entry.compRequirement) {
    parts.push(
      `comp gate: need comp ≥ ${entry.compRequirement}, have ${world.comprehension}`,
    );
  }
  for (const item of cost) {
    const have = world.pool.get(item.value) ?? 0;
    const need = item.count;
    const rate = steadyStateRate(world, item.value);
    const bn = bottleneckResource(world, item.value);
    parts.push(
      `${item.value}×${need} (have ${have.toFixed(1)}, rate ${rate.toFixed(3)}/tick, bottleneck: ${bn ?? 'none'})`,
    );
  }
  return parts.join('; ');
}
