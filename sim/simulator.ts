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
// α.4b extension (warehouse capacity scaling):
//   - The per-value pool is now capped by Comprehension. Mirrors the
//     in-game `warehouseCapacity(comp) = 10 × 2^(tier-1)` where
//     tier = round(log2(comp)). The simulator-side cap is
//     `warehouseCapacity(comp) × POOL_CAP_K` to account for the
//     agent's typical warehouse fleet per value (K is sim-tuned).
//   - When the pool of value V is at cap and the agent needs more, the
//     bottleneck routes to comprehension (climb to lift the cap).
//   - Value 0 (river zeros) is exempt — zeros come from the river and
//     don't need storage.
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
  type PredicateId,
  LITERATURE,
  LITERATURE_BY_ID,
  RECIPE_BY_VALUE,
  MANUAL_PICKUP_RATE_PER_TICK,
  isValueCost,
  isPredicateCost,
  ladderFor,
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
  /** α.4b.1: typed warehouses per value. Each contributes
   *  warehouseCapacity(comp) of storage for its value. */
  warehouses: Map<number, number>;
  /** α.4c.4: predicate stocks the agent grows via specific cell
   *  firings. Spending from a predicate-cost item draws from here.
   *  Decoupled from `pool` because the production-tracking
   *  abstraction is per-predicate, not per-value. */
  predicateStocks: Map<PredicateId, number>;
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
    warehouses: new Map(),
    predicateStocks: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Predicate production rates (α.4c.4)
// ---------------------------------------------------------------------------
//
// Each predicate is "produced" by specific cell-type firings:
//   - negative   ← subtraction, negation (any firing emits a negative)
//   - prime      ← factor (each firing emits prime factors), addition
//                  producing-prime values (2/3/5/7/...)
//   - irrational ← square-root (firing on a non-square produces one)
//
// The agent's production rate for a predicate is the sum of throughputs
// of the producer cells. We tick this when the agent's focus is a
// predicate.

export function predicateProductionRate(
  world: WorldState,
  pred: PredicateId,
): number {
  switch (pred) {
    case 'negative':
      return cellThroughput(world, 'subtraction') + cellThroughput(world, 'negation');
    case 'irrational':
      return cellThroughput(world, 'square-root');
    case 'prime':
      // Factor cell: each firing emits prime factors (modeled as 1
      // prime stock unit per firing — a conservative approximation).
      // Addition: producing primes 2/3/5/7 contributes when the agent
      // ticks those values. The factor path is the dominant lane.
      return cellThroughput(world, 'factor');
  }
}

export function predicateStock(world: WorldState, pred: PredicateId): number {
  return world.predicateStocks.get(pred) ?? 0;
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
// Warehouse capacity (α.4b — DESIGN §9, γ.3 in game code)
// ---------------------------------------------------------------------------
//
// Mirrors `src/lib/world.ts:warehouseCapacity`. Capacity per warehouse
// scales geometrically with the comp tier.
//
// **Pacing relevance — α.4b finding:** in the game, loose blocks on
// the canvas have NO cap; only warehouses do. Literature purchases
// pull from loose + warehouses + rule-warehouses combined (Slice
// 3.5.3), so purchase affordability is not capacity-bound. The
// capacity constraint mostly matters for fuel-flow routing at tier-2+
// operators — a continuous-time burst-buffer concern that the sim's
// steady-state model doesn't capture.
//
// We expose `warehouseCapacity(comp)` so future α.x extensions can
// model fuel-flow constraints (e.g. cultivator per-step fuel
// throttling) on top of it. The pool itself is not clamped in α.4b.

const WAREHOUSE_BASE_CAPACITY = 10;

/** Mirrors src/lib/world.ts:warehouseCapacity. */
export function warehouseCapacity(comp: number): number {
  if (comp < 2) return WAREHOUSE_BASE_CAPACITY;
  const tier = Math.max(1, Math.round(Math.log2(comp)));
  return WAREHOUSE_BASE_CAPACITY * Math.pow(2, tier - 1);
}

/**
 * α.4b.1: How many units the agent's loose pile tolerates for any
 * single value before requiring warehouses. Modeled as a sim-tuning
 * lever — represents "canvas clutter tolerance."
 *
 * The user's directive: "loose numbers on the canvas are completely
 * fine" — so this is generous. Early-game costs (addition 900 ones,
 * multiplication 200 tens, exp 200 hundreds) fit inside the loose
 * pile with room to spare; warehouses only become a pressure point
 * once stockpile costs climb past this threshold (tetration's 4000
 * thousands, pentation's 8500 thousands, etc.).
 *
 * Sim-tuning lever — α.4c sweeps this if early-game pacing needs
 * adjustment.
 */
export const LOOSE_POOL_TOLERANCE = 1000;

/**
 * Per-value pool cap. Loose tolerance + warehouse storage. α.5: zero
 * is now cap-bound like every other value — players must hoard zeros
 * in warehouses just like other currencies. The pipe ≤1 feeds the
 * pool; warehouses store the surplus.
 */
export function poolCap(world: WorldState, value: number): number {
  const warehouses = world.warehouses.get(value) ?? 0;
  return LOOSE_POOL_TOLERANCE + warehouses * warehouseCapacity(world.comprehension);
}

/** Is the per-value pool at or above its current cap? */
export function poolAtCap(world: WorldState, value: number): boolean {
  const cap = poolCap(world, value);
  if (!Number.isFinite(cap)) return false;
  return (world.pool.get(value) ?? 0) >= cap;
}

/**
 * Which warehouse Literature entry buys storage for `value`. Returns
 * `null` if no such entry exists (e.g. for unusual values not in the
 * `WAREHOUSE_VALUES` list).
 */
export function warehouseEntryForValue(value: number): LitEntry | null {
  for (const entry of LITERATURE) {
    if (entry.kind === 'warehouse' && entry.warehouseValue === value) return entry;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resource-cost vector
// ---------------------------------------------------------------------------

/**
 * α.5 — ladder fuel model replaces the single-block fuel.
 * `smallestFuelDenomination` and `effectiveFuelMagnitude` were callers
 * of the old model; both retired here. Level discounts on the ladder
 * are deferred — see `ladderForCell` below.
 */
export function ladderForCell(
  world: WorldState,
  cellType: CellType,
  maxInput: number,
): Map<number, number> {
  // Level discounts (α.4d carry-over): for mult/exp at lvl ≥ 3, reduce
  // the magnitude tax by 1 (min 1); at lvl 5 halve it. Acts on the
  // magnitude multiplier, so it scales every ladder entry uniformly.
  const base = ladderFor(cellType, maxInput);
  const level = world.cellLevels.get(cellType) ?? 1;
  const isDiscountable = cellType === 'multiplication' || cellType === 'exponentiation';
  if (!isDiscountable || level < 3) return base;

  // Recompute with reduced magnitude.
  const absMax = Math.abs(maxInput);
  const baseMag = absMax > 0 ? Math.max(1, Math.ceil(Math.log10(absMax))) : 1;
  let discounted: number;
  if (level >= 5) discounted = Math.max(1, Math.floor(baseMag / 2));
  else discounted = Math.max(1, baseMag - 1);
  if (discounted === baseMag) return base;

  const scaled = new Map<number, number>();
  for (const [v, c] of base) {
    scaled.set(v, (c / baseMag) * discounted);
  }
  return scaled;
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
    // α.5: ladder fuel — every firing pulls a pyramid of small numbers
    // sized by the cell's hierarchy position and scaled by the firing's
    // max-input magnitude.
    const ladder = ladderForCell(world, r.cell, r.maxInput);
    for (const [fuelValue, fuelCount] of ladder) {
      visit(fuelValue, multiplier * fuelCount);
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
    // α.5: ladder values are also intermediates the agent must lift.
    // The highest ladder entry is `r.cell`'s position L (value L); for
    // exp on max-input=10 that introduces value 3 as an intermediate.
    const ladder = ladderFor(r.cell, r.maxInput);
    for (const fuelValue of ladder.keys()) {
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
 * α.5: zero supply is universal — comes from pipe ≤1 (the wired
 * river→pool feed) for every consumer (successor's input + every
 * other cell's ladder draw). River-tap was removed because it
 * conflated successor's input with pool supply for the ladder, and
 * the design now treats zeros as a wired resource always.
 *
 * If no pipe_0 is owned yet, the agent's manual pickup rate provides
 * the trickle for the opening (the 0 → 30s "manual phase").
 */
export function zeroSupply(world: WorldState): number {
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

  // Phase 6 comp gate: any intermediate above comp blocks the whole
  // path. α.5c kept this strict — per design, uncomprehended blocks
  // are not usable as Literature costs, so producing above-comp
  // values for the goal pool would be wasted work.
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
    // α.5: pipe ≤1 is the only zero feed. No river-tap shortcut.
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
  const mult = Math.pow(scale, purchaseCount);
  return entry.cost.map((item): CostItem => {
    const scaled = Math.ceil(item.count * mult);
    if (isValueCost(item)) return { value: item.value, count: scaled };
    return {
      predicate: item.predicate,
      count: scaled,
      ...(item.magnitudeMin !== undefined ? { magnitudeMin: item.magnitudeMin } : {}),
    };
  });
}

export function canAfford(world: WorldState, cost: CostItem[]): boolean {
  const requiredValues = new Map<number, number>();
  const requiredPredicates = new Map<PredicateId, number>();
  for (const item of cost) {
    if (isValueCost(item)) {
      requiredValues.set(item.value, (requiredValues.get(item.value) ?? 0) + item.count);
    } else if (isPredicateCost(item)) {
      requiredPredicates.set(
        item.predicate,
        (requiredPredicates.get(item.predicate) ?? 0) + item.count,
      );
    }
  }
  for (const [value, need] of requiredValues) {
    if ((world.pool.get(value) ?? 0) < need) return false;
  }
  for (const [pred, need] of requiredPredicates) {
    if (predicateStock(world, pred) < need) return false;
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
  for (const item of cost) {
    if (isValueCost(item)) {
      const have = world.pool.get(item.value) ?? 0;
      world.pool.set(item.value, have - item.count);
    } else if (isPredicateCost(item)) {
      const have = predicateStock(world, item.predicate);
      world.predicateStocks.set(item.predicate, have - item.count);
    }
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
    case 'warehouse':
      if (entry.warehouseValue !== undefined) {
        world.warehouses.set(
          entry.warehouseValue,
          (world.warehouses.get(entry.warehouseValue) ?? 0) + 1,
        );
      }
      break;
    case 'bot':
      // α.1: bots are catalog stubs. Tick-time effects (T-bots as
      // frontier throughput; decomposer bots as jam-clearing) wire up
      // in α.4b.3/.4.
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
 * A focus is either a numeric value (use the value pool) or a
 * predicate id (use the predicateStocks map). Internally encoded as
 * union; `tickProduction` and friends branch on shape.
 */
export type ProductionFocus = number | { predicate: PredicateId };

export function isPredicateFocus(f: ProductionFocus): f is { predicate: PredicateId } {
  return typeof f === 'object' && 'predicate' in f;
}

export function tickProduction(world: WorldState, focus: ProductionFocus): void {
  if (isPredicateFocus(focus)) {
    const rate = predicateProductionRate(world, focus.predicate);
    if (rate > 0) {
      const cur = world.predicateStocks.get(focus.predicate) ?? 0;
      world.predicateStocks.set(focus.predicate, cur + rate);
    }
    world.tick += 1;
    return;
  }
  const rate = steadyStateRate(world, focus);
  if (rate > 0) {
    const cur = world.pool.get(focus) ?? 0;
    // α.4b.1: clamp to (loose tolerance + owned warehouse capacity).
    // Excess production above this is discarded — the game refuses to
    // deposit into a full warehouse, and a player's loose pile has a
    // practical clutter tolerance.
    const cap = poolCap(world, focus);
    world.pool.set(focus, Math.min(cap, cur + rate));
  }
  world.tick += 1;
}

// ---------------------------------------------------------------------------
// Agent decision policy
// ---------------------------------------------------------------------------

export interface AgentDecision {
  buy?: string;
  buyLevel?: LevelEntry;
  /** α.4c.4: a focus is a numeric value (pool target) or a predicate
   *  (predicateStocks target). */
  tickFocus?: ProductionFocus;
  done?: boolean;
}

export interface AgentState {
  roadmap: string[];
  goalIndex: number;
}

export function newAgent(roadmap: string[]): AgentState {
  return { roadmap, goalIndex: 0 };
}

/** Picks the cost item with the largest production-time shortfall.
 *  Returns either a numeric value (pool focus) or a predicate focus. */
function mostNeededFocus(world: WorldState, cost: CostItem[]): ProductionFocus | null {
  let worstShortfall = -1;
  let worstFocus: ProductionFocus | null = null;
  for (const item of cost) {
    if (isValueCost(item)) {
      const have = world.pool.get(item.value) ?? 0;
      const need = item.count - have;
      if (need <= 0) continue;
      const rate = steadyStateRate(world, item.value);
      const ticksNeeded = rate > 0 ? need / rate : Infinity;
      if (ticksNeeded > worstShortfall) {
        worstShortfall = ticksNeeded;
        worstFocus = item.value;
      }
    } else if (isPredicateCost(item)) {
      const have = predicateStock(world, item.predicate);
      const need = item.count - have;
      if (need <= 0) continue;
      const rate = predicateProductionRate(world, item.predicate);
      const ticksNeeded = rate > 0 ? need / rate : Infinity;
      if (ticksNeeded > worstShortfall) {
        worstShortfall = ticksNeeded;
        worstFocus = { predicate: item.predicate };
      }
    }
  }
  return worstFocus;
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
    if (isValueCost(item)) {
      const have = world.pool.get(item.value) ?? 0;
      const need = item.count - have;
      if (need <= 0) continue;
      const rate = steadyStateRate(world, item.value);
      if (rate <= 0) return Infinity;
      worst = Math.max(worst, need / rate);
    } else if (isPredicateCost(item)) {
      const have = predicateStock(world, item.predicate);
      const need = item.count - have;
      if (need <= 0) continue;
      const rate = predicateProductionRate(world, item.predicate);
      if (rate <= 0) return Infinity;
      worst = Math.max(worst, need / rate);
    }
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

    const focus = mostNeededFocus(world, cost);
    if (focus === null) {
      return { tickFocus: 0 };
    }

    // α.4c.4: predicate focus — production from specific cell-type
    // firings. No warehouse / pool cap concerns here. If the agent
    // owns no producer for this predicate, route to buying one.
    if (isPredicateFocus(focus)) {
      const rate = predicateProductionRate(world, focus.predicate);
      if (rate <= 0) {
        const producerBuy = pursuePredicateProducer(world, focus.predicate);
        if (producerBuy) return producerBuy;
      }
      return { tickFocus: focus };
    }

    // α.4b.1: if the focus value's pool is at cap, the agent needs
    // more storage. Prefer warehouse purchase (local, cheap for the
    // bound value); fall through to comp upgrade if no warehouse entry
    // exists or it's not productive.
    if (poolAtCap(world, focus)) {
      const warehouseDecision = pursueWarehouse(world, focus);
      if (warehouseDecision) return warehouseDecision;
      const compDecision = pursueCompUpgrade(world);
      if (compDecision) return compDecision;
      return { tickFocus: focus };
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
      const infraFocus = mostNeededFocus(world, bestAction.cost);
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
  const compFocus = mostNeededFocus(world, compEntry.cost);
  if (compFocus !== null) return { tickFocus: compFocus };
  return null;
}

/**
 * α.4c.4: when the agent needs a predicate stock but owns no producer,
 * route to buying the canonical producer cell. Returns null if a
 * producer is already owned (caller can simply tick to grow the stock).
 */
function pursuePredicateProducer(
  world: WorldState,
  pred: PredicateId,
): AgentDecision | null {
  const producers: Record<PredicateId, string[]> = {
    negative: ['subtraction', 'negation'],
    irrational: ['square-root'],
    prime: ['factor'],
  };
  for (const id of producers[pred]) {
    const entry = LITERATURE_BY_ID.get(id);
    if (!entry) continue;
    const owned = world.purchaseCount.get(id) ?? 0;
    if (owned > 0) return null; // already owned, just tick
    const cost = currentCost(entry, owned);
    if (canPurchase(world, entry, cost)) return { buy: id };
    // Can't afford the producer — route to its cost first.
    const subFocus = mostNeededFocus(world, cost);
    if (subFocus !== null) return { tickFocus: subFocus };
  }
  return null;
}

/**
 * α.4b.1 helper: when pool[value] is at cap, route the agent toward a
 * warehouse purchase for that value. Returns null when no warehouse
 * entry exists for the value (then the caller falls through to comp
 * upgrade). For affordable purchases, returns the buy; for unaffordable,
 * recursively routes to the warehouse cost's most-needed value.
 *
 * **Self-funded warehouses.** If the warehouse cost is denominated in
 * the same value as the one being stored (the recursive-bootstrap
 * case), and the pool is at cap holding fewer than the warehouse cost,
 * the agent can't ever afford it — there isn't enough buffer.
 * Detection: if the only cost value equals `value` and `cap < cost`,
 * return null so caller falls through to comp upgrade (which lifts cap).
 */
function pursueWarehouse(world: WorldState, value: number): AgentDecision | null {
  const entry = warehouseEntryForValue(value);
  if (!entry) return null;
  const owned = world.purchaseCount.get(entry.id) ?? 0;
  const cost = currentCost(entry, owned);

  // Warehouse Literature costs are value-only (no predicate side-costs).
  // If every cost item is in `value` and the cap is already below the
  // needed count, comp upgrade is the only way out.
  const valueCosts = cost.filter(isValueCost);
  const allInSameValue =
    valueCosts.length === cost.length && valueCosts.every((item) => item.value === value);
  if (allInSameValue) {
    const totalCount = valueCosts.reduce((s, item) => s + item.count, 0);
    const cap = poolCap(world, value);
    if (Number.isFinite(cap) && cap < totalCount) return null;
  }

  if (canPurchase(world, entry, cost)) {
    return { buy: entry.id };
  }
  const focus = mostNeededFocus(world, cost);
  if (focus !== null) return { tickFocus: focus };
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
      // α.4b.1: a tickFocus whose pool is at cap wastes the tick. The
      // decide() path may have routed to a cost-currency value without
      // realising its pool was full; intercept here and route to the
      // warehouse / comp upgrade that lifts the cap.
      //
      // α.4c.4: predicate focuses bypass this check — predicateStocks
      // have no cap.
      const focus = decision.tickFocus;
      if (!isPredicateFocus(focus) && poolAtCap(world, focus)) {
        const reroute =
          pursueWarehouse(world, focus) ??
          pursueCompUpgrade(world);
        if (reroute) {
          if (reroute.buy) {
            const ok = purchase(world, reroute.buy);
            if (ok) {
              events.push({
                tick: world.tick,
                kind: 'purchase',
                message: `Bought ${reroute.buy} (cap reroute on value ${focus})`,
              });
              if (!unlocks.has(reroute.buy)) {
                unlocks.set(reroute.buy, world.tick);
                if (agent.roadmap[agent.goalIndex] === reroute.buy) {
                  agent.goalIndex += 1;
                }
              }
              lastPurchaseTick = world.tick;
              continue;
            }
          }
          if (
            reroute.tickFocus !== undefined &&
            !(typeof reroute.tickFocus === 'number' && poolAtCap(world, reroute.tickFocus))
          ) {
            tickProduction(world, reroute.tickFocus);
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
            continue;
          }
        }
      }

      tickProduction(world, focus);

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
    if (isValueCost(item)) {
      const have = world.pool.get(item.value) ?? 0;
      const need = item.count;
      const rate = steadyStateRate(world, item.value);
      const bn = bottleneckResource(world, item.value);
      parts.push(
        `${item.value}×${need} (have ${have.toFixed(1)}, rate ${rate.toFixed(3)}/tick, bottleneck: ${bn ?? 'none'})`,
      );
    } else if (isPredicateCost(item)) {
      const have = predicateStock(world, item.predicate);
      const rate = predicateProductionRate(world, item.predicate);
      parts.push(
        `${item.predicate}×${item.count} (have ${have.toFixed(1)}, rate ${rate.toFixed(3)}/tick)`,
      );
    }
  }
  return parts.join('; ');
}
