// sim/simulator.ts
//
// Pacing simulator engine. Runs a tick-by-tick simulation of an
// "optimal-play" agent walking a fixed Literature roadmap.
//
// Production model
// ----------------
//
// For each target value V, we compute a **resource-cost vector** — how
// many firings of each cell type (and how many river zeros) are required
// to manufacture one unit of V from scratch. The steady-state production
// rate of V is then:
//
//   rate(V) = min over cell types C of (N_cells(C) / cost_per_output_C(V))
//
// This naturally captures sharing: an adder making 5 via add(2,3) requires
// firings to make both the 2 and the 3 (and the 2 inside the 3); the
// per-output cost folds all of that in.
//
// The agent focuses on ONE value at a time — the most-needed item in the
// current cost bundle. This mirrors real sequential play ("now I'm making
// tens until I have 10 of them, then I'll make twos"). The pool grows
// only in the focus value; intermediates are consumed in steady state.

import {
  type CellType,
  type LitEntry,
  type CostItem,
  type LevelEntry,
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
  /** Number of pipes per magnitude rating. */
  pipes: Map<number, number>;
  /** Current level per pipe magnitude (default 1). */
  pipeLevels: Map<number, number>;
  /** Pool of accumulated currency: value → count (fractional accumulators OK). */
  pool: Map<number, number>;
  /** Set of Literature ids already purchased. */
  unlocked: Set<string>;
  /** Per-entry purchase counts (for geometric repurchase cost scaling). */
  purchaseCount: Map<string, number>;
  /** Manual ceiling (Comprehension). */
  comprehension: number;
}

export function newWorld(): WorldState {
  return {
    tick: 0,
    cells: new Map(),
    cellLevels: new Map(),
    pipes: new Map(),
    pipeLevels: new Map(),
    pool: new Map(),
    unlocked: new Set(),
    purchaseCount: new Map(),
    comprehension: 10,
  };
}

/** Effective throughput contributed by a cell type (count × level multiplier). */
export function cellThroughput(world: WorldState, cellType: CellType): number {
  const count = world.cells.get(cellType) ?? 0;
  const level = world.cellLevels.get(cellType) ?? 1;
  return count * levelMultiplier(level);
}

/** Effective throughput per pipe of a given magnitude (level multiplier × count). */
export function pipeThroughput(world: WorldState, magnitude: number): number {
  const count = world.pipes.get(magnitude) ?? 0;
  const level = world.pipeLevels.get(magnitude) ?? 1;
  return count * levelMultiplier(level);
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
 *
 * For low-magnitude operations (mult of small numbers), fuel was already
 * 1 — leveling can't go lower. For mult/exp on hundreds and beyond,
 * leveling produces real fuel savings.
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
 *
 * Computed by recursively walking the recipe DAG, summing per-output
 * costs. NOT cached at module level — depends on world.cellLevels.
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

// ---------------------------------------------------------------------------
// Throughput math
// ---------------------------------------------------------------------------

/**
 * Steady-state production rate (per tick) for one value, given the
 * factory's owned cells/pipes.
 *
 * Computed as min over all required resources of (supply / per-output-cost).
 */
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

export function steadyStateRate(world: WorldState, target: number): number {
  if (target === 0) {
    return zeroSupply(world);
  }
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
 * Identifies which cell type (or pipe-≤1 → 'zero') is the binding
 * constraint when producing `target`. The agent buys more of this to
 * raise the production rate.
 */
export function bottleneckResource(
  world: WorldState,
  target: number,
): string | null {
  if (target === 0) {
    // Zero supply has two possible bottlenecks: pipe ≤1 (if river-tap
    // not yet unlocked) or successor (if it is).
    const successorLevel = world.cellLevels.get('successor') ?? 1;
    if (successorLevel >= 3 && (world.cells.get('successor') ?? 0) > 0) {
      return 'successor';
    }
    return (world.pipes.get(1) ?? 0) === 0 ? 'zero' : null;
  }
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
 * Apply a level-up. Deducts cost, increments the level, sets the entry as
 * unlocked. Returns true on success.
 */
export function purchaseLevel(world: WorldState, entry: LevelEntry): boolean {
  if (!canAfford(world, entry.cost)) return false;
  // Verify current level is one below target.
  const currentLevel =
    entry.target.kind === 'cell'
      ? world.cellLevels.get(entry.target.cellType) ?? 1
      : world.pipeLevels.get(entry.target.magnitude) ?? 1;
  if (currentLevel !== entry.level - 1) return false;

  deductCost(world, entry.cost);
  if (entry.target.kind === 'cell') {
    world.cellLevels.set(entry.target.cellType, entry.level);
  } else {
    world.pipeLevels.set(entry.target.magnitude, entry.level);
  }
  world.unlocked.add(entry.id);
  return true;
}

export function purchase(world: WorldState, entryId: string): boolean {
  const entry = LITERATURE_BY_ID.get(entryId);
  if (!entry) return false;
  const owned = world.purchaseCount.get(entryId) ?? 0;
  if (entry.once && owned > 0) return false;

  const cost = currentCost(entry, owned);
  if (!canAfford(world, cost)) return false;

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
    case 'theorem':
      break;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Per-tick production
// ---------------------------------------------------------------------------

/**
 * Applies one tick of production with a SINGLE focus value. All factory
 * output flows into the focus pool at steady-state rate; intermediates
 * are implicitly consumed (their cost is folded into the resource
 * vector).
 *
 * For multi-item costs, the agent rotates focus between cost items
 * each tick based on which has the largest shortfall.
 */
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
  /** Level upgrade to apply this step. */
  buyLevel?: LevelEntry;
  /** What value to focus production on this tick. */
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

/**
 * Picks the cost item with the largest production-time shortfall. The
 * agent will focus production on this value next.
 */
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
 * a pipe_1 purchase for 'zero', or the cell entry for a cell-type key.
 */
function infraEntryForBottleneck(bn: string): LitEntry | null {
  if (bn === 'zero') return LITERATURE_BY_ID.get('pipe_1') ?? null;
  if (bn.startsWith('literal:')) return null;
  return entryForCellType(bn as CellType);
}

/**
 * Estimates the time-to-acquire for a cost bundle at the factory's
 * current rates. Used to decide whether a bottleneck cell is worth
 * buying — if it would noticeably speed up the goal, buy it.
 */
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

    if (canAfford(world, cost)) {
      return { buy: goalId };
    }

    // Pick the most-needed cost item for the current goal.
    const focus = mostNeededValue(world, cost);
    if (focus === null) {
      return { tickFocus: 0 };
    }

    // Identify the bottleneck for producing the focus value.
    const bn = bottleneckResource(world, focus);
    if (!bn || bn.startsWith('literal:')) {
      return { tickFocus: focus };
    }

    // Is buying more of this infrastructure worth it? Compare clone vs
    // upgrade ROI: with N owned cells at multiplier M, an upgrade gains
    // N×M throughput; a clone gains only M. Upgrades favored at high N.
    const infraEntry = infraEntryForBottleneck(bn);
    const cloneCount = infraEntry
      ? world.purchaseCount.get(infraEntry.id) ?? 0
      : 0;
    const cloneCost = infraEntry ? currentCost(infraEntry, cloneCount) : null;

    // Find the next-level upgrade for this bottleneck, if any.
    let upgradeEntry: LevelEntry | null = null;
    if (bn === 'zero') {
      const pipeLevel = world.pipeLevels.get(1) ?? 1;
      upgradeEntry = nextLevelEntry({ kind: 'pipe', magnitude: 1 }, pipeLevel);
    } else if (!bn.startsWith('literal:')) {
      const cellType = bn as CellType;
      const currentLevel = world.cellLevels.get(cellType) ?? 1;
      upgradeEntry = nextLevelEntry({ kind: 'cell', cellType }, currentLevel);
    }

    // Compute ROI for each option (lower ticksToAfford / per-firing-gain wins).
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
          : infraEntry.kind === 'pipe' && infraEntry.pipeMagnitude !== undefined
            ? levelMultiplier(world.pipeLevels.get(infraEntry.pipeMagnitude) ?? 1)
            : 1;
      // Gain from cloning = +levelMult throughput on this cell type.
      // Effective speedup on the goal ≈ goalRemaining × (currentSupply / (currentSupply + levelMult))
      const currentSupply = ownedCells * levelMult;
      const cloneSpeedupRatio =
        currentSupply > 0 ? currentSupply / (currentSupply + levelMult) : 0;
      const cloneAffordTime = canAfford(world, cloneCost)
        ? 0
        : ticksToAfford(world, cloneCost);
      const cloneScore = cloneAffordTime + goalRemaining * cloneSpeedupRatio;
      if (cloneScore < bestScore) {
        bestScore = cloneScore;
        if (canAfford(world, cloneCost)) {
          bestAction = { kind: 'clone' };
        } else {
          bestAction = { kind: 'pursue-infra', cost: cloneCost };
        }
      }
    }

    if (upgradeEntry) {
      // Upgrade doubles throughput on this cell type (multiplier scales 2×).
      // Speedup ratio ≈ 1/2 of the bottleneck contribution.
      const upgradeAffordTime = canAfford(world, upgradeEntry.cost)
        ? 0
        : ticksToAfford(world, upgradeEntry.cost);
      // Optimistic: upgrade halves the time spent on this bottleneck.
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
      // Failed buy — defensive. Advance tick with no-op focus.
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
