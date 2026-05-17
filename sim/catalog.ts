// sim/catalog.ts
//
// Static data for the pacing simulator — Phase 6 model: Comprehension
// as Spine. See DESIGN.md §9 and ROADMAP §2 Phase 6 for the design.
//
// ===========================================================================
// α.4 TUNE (in progress, 2026-05-16) — reverse-porting the shipped game
// numbers. Phase 6 game code shipped with operator costs significantly
// lower than the α.3 lock (e.g. tetration 4000 thousands vs α.3's 19,000).
// This slice ports those numbers back into the sim so the sim mirrors the
// running game, then layers a warehouse-capacity model on top.
// ===========================================================================
//
// PREVIOUS α.3 LOCK (2026-05-16) curve was:
//   Successor → 20s  · Addition → 2m 25s  · Multiplication → 44m
//   Exponentiation → 1h 19m  · Tetration → 4h 44m  · Pentation → 6h 38m
//
// LOCKED sections (cite this file when editing the game source):
//   - `compUpgradeCost(n)`          ← THE spine (unchanged from α.3)
//   - `pipeCost(n)`                  (unchanged from α.3)
//   - `OPERATOR_AND_CELL_ENTRIES`   ← α.4a: reverse-ported from src/lib/literature.ts
//   - `LEVEL_LADDERS`               ← cell-only leveling (unchanged)
//   - `RECIPES`                      (unchanged)
//   - `costTier`, `computationalCost` (unchanged)
//
// STUB sections (catalog entries only — production effects not yet modeled
// in `simulator.ts`; defer locking until tick-model lands in a later α.x):
//   - `CULTIVATOR_ENTRIES`          ← transformer cultivator production
//   - `generateTBotLadder` / `FBot` / `DBot` / `IBot`
//
// Code slices β–ζ consume the locked sections as authoritative. Edit
// `src/lib/literature.ts` and `src/lib/cost.ts` only by mirroring from
// here. If a future tuning iteration unlocks a section, update the
// section header AND this manifest.
//
// Pacing snapshot: see `sim/PACING_LOCKED.md` and `sim/pacing-locked.csv`.
// ===========================================================================
//
// Pacing target (declared, not enforced):
//
//   Speedrun:  Tetration unlock at ~18,000 ticks  (5 hours @ 1 tick/sec)
//   Casual:    Tetration unlock at ~36,000 ticks  (10 hours)
//
// Phase 6 model summary:
//
//   - Comprehension is the spine. Power-of-2 ladder: Comp ≤ 2^N for
//     N ≥ 1, infinite in principle (we materialise up to N=30 here).
//     The universal rule: production, transport, and storage of value
//     V all require comp ≥ V. Pipes lag manual handling by one tier
//     (a pipe ≤ 2^N requires comp ≥ 2^(N+1)).
//   - Cell jam: a cell whose output would exceed comp will not fire.
//     In the simulator, this collapses to "production rate of value V
//     is zero if V > comprehension."
//   - Pipe leveling dissolves. One Literature entry per magnitude
//     tier; throughput via parallel placement (Quantity, not Level).
//   - Cell leveling stays (cap 5; future redesign session).
//   - Cultivators are input-driven transformers (stubs in α.1; tick
//     model lands in α.2).
//   - Decomposer bots — Factor, Decrement, Inversion — have
//     independent magnitude ratings priced in stockpiles, no comp
//     prerequisite (delegated comprehension). Stubs in α.1.

// Phase A.5 (2026-05-17): the cost-math formulas (`ladderUnlockCost`,
// `compUpgradeCost`, `pipeCost`) are now THIN ADAPTERS over the canonical
// versions in `core/catalog/costs.ts`. The shape that lives in sim — number
// values, `predicate` instead of `ruleId`, etc. — is preserved; the
// adapter (`fromCoreCostItem` below) translates at the boundary. Result:
// changing a ladder formula in core/ flows automatically into the sim.
import { valueToSafeNumber } from '../core/value.ts';
import {
  ladderUnlockCost as coreLadderUnlockCost,
  compUpgradeCost as coreCompUpgradeCost,
  pipeCost as corePipeCost,
} from '../core/catalog/costs.ts';
import {
  isValueItem as coreIsValueItem,
  type LiteratureCostItem as CoreCostItem,
} from '../core/catalog/types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CellType =
  | 'successor'
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
  | 'exponentiation'
  | 'tetration'
  | 'pentation'
  | 'square-root'
  | 'decrement'
  | 'factor'
  | 'negation' // Phase 5 6.15
  | 'inversion' // Phase 5 6.15 — tier 2, signed-fuel cost
  // Transformer cultivators (Phase 6 slice ε.1) — input-driven, each
  // input advances internal step counter; output = f(input, step);
  // per-step fuel cost escalates. Modeled as stubs in α.1; behaviour
  // wires up in α.2.
  | 'cultivation-arithmetic'
  | 'cultivation-geometric'
  | 'cultivation-fibonacci'
  | 'cultivation-harmonic'
  | 'cultivation-polynomial'
  | 'cultivation-factorial';

export type BotType =
  | 'translation-bot' // T-bot (existing cleanup-bot rebranded)
  | 'factor-bot' // Decomposer: walks to a block, factorises in place
  | 'decrement-bot' // Decomposer: walks to a block, decrements in place
  | 'inversion-bot'; // Decomposer: walks to a block, replaces with 1/n

export type EntryKind =
  | 'cell'
  | 'pipe'
  | 'theorem'
  | 'comprehension'
  | 'bot'
  | 'warehouse';

/**
 * α.4c.4: Cost items come in two shapes:
 *   - Value cost: N blocks of a specific value (the early-mid default).
 *   - Predicate cost: N blocks satisfying a named predicate. Mirrors
 *     the game's `LiteratureCostPredicate` (Slice 5.3) — used to force
 *     variety in factory composition. Predicates draw from per-predicate
 *     stocks the agent grows via specific cell-type firings.
 */
export type CostItem =
  | { value: number; count: number }
  | { predicate: PredicateId; count: number; magnitudeMin?: number };

export function isValueCost(c: CostItem): c is { value: number; count: number } {
  return 'value' in c;
}
export function isPredicateCost(
  c: CostItem,
): c is { predicate: PredicateId; count: number; magnitudeMin?: number } {
  return 'predicate' in c;
}

/**
 * Recognized predicates. Mirrors the game's warehouse-rule catalog
 * minus the magnitude-band predicates (lt10/lt100/etc) which aren't
 * variety-forcing.
 */
export type PredicateId = 'prime' | 'negative' | 'irrational';

export interface LitEntry {
  id: string;
  kind: EntryKind;
  cellType?: CellType;
  botType?: BotType;
  cost: CostItem[];
  costScale?: number;
  once?: boolean;
  /** Pipe magnitude rating (2^N for some N ≥ 0). */
  pipeMagnitude?: number;
  pipeCooldownTicks?: number;
  /** Comprehension ceiling reached by this upgrade (2^N for some N ≥ 1). */
  comprehensionLevel?: number;
  /** Bot magnitude rating — for T-bots, capped at comp; decomposer bots
   *  are independent (no comp prerequisite). */
  botRating?: number;
  /** Minimum comprehension required to PURCHASE this entry. 0 = none. */
  compRequirement?: number;
  /** For `warehouse` entries: which value this warehouse holds.
   *  Each owned warehouse contributes warehouseCapacity(comp) units of
   *  storage capacity for this value. */
  warehouseValue?: number;
}

// ---------------------------------------------------------------------------
// Comprehension ladder generator (Phase 6 — power-of-2)
// ---------------------------------------------------------------------------

/**
 * Number of comprehension tiers materialised in the catalog up front.
 * 2^30 ≈ 1.07B — covers the climb through Tetration and into Pentation
 * territory at the magnitudes that demand it.
 */
export const COMP_MAX_TIER = 30;

/**
 * Phase A.5 adapter: convert a core (Value-shaped) cost item to sim's
 * number-shaped CostItem.
 *
 * Game side stores cost values as `Value` (Decimal-backed) because
 * the canvas/UI handles full Value semantics. Sim runs in plain
 * numbers for speed and simplicity — the agent never sees a Decimal.
 * This boundary function does the cheap one-shot translation.
 *
 * Predicate items: game uses `ruleId` (the full warehouse-rule
 * vocabulary including magnitude-band rules like `lt100`); sim only
 * cares about variety-forcing predicates (`prime` / `negative` /
 * `irrational`). If a core entry asks for a magnitude-band predicate
 * the adapter errors loudly — that's a sign sim's roadmap is consuming
 * entries it doesn't know how to model.
 */
function fromCoreCostItem(item: CoreCostItem): CostItem {
  if (coreIsValueItem(item)) {
    const n = valueToSafeNumber(item.value);
    if (n === null) {
      throw new Error(
        `sim adapter: core cost item has non-safe-number Value; sim model can't represent it`,
      );
    }
    return { value: n, count: item.count };
  }
  const id = item.ruleId;
  if (id !== 'prime' && id !== 'negative' && id !== 'irrational') {
    throw new Error(
      `sim adapter: predicate '${id}' is not modeled (only prime/negative/irrational)`,
    );
  }
  return { predicate: id, count: item.count, magnitudeMin: item.magnitudeMin };
}

/**
 * Cost curve for the comp upgrade to tier N (reaches Comp ≤ 2^N).
 *
 * Phase A.5: delegates to `core/catalog/costs.ts:compUpgradeCost`.
 * Original logic preserved verbatim there; this wrapper adapts the
 * Value-shaped result to sim's number-shaped form.
 */
function compUpgradeCost(n: number): CostItem[] {
  return coreCompUpgradeCost(n).map(fromCoreCostItem);
}

function generateCompLadder(): LitEntry[] {
  const entries: LitEntry[] = [];
  for (let n = 1; n <= COMP_MAX_TIER; n++) {
    const ceiling = Math.pow(2, n);
    entries.push({
      id: `comp_${n}`,
      kind: 'comprehension',
      cost: compUpgradeCost(n),
      comprehensionLevel: ceiling,
      once: true,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Pipe ladder generator (Phase 6 — one per magnitude tier, gated by comp)
// ---------------------------------------------------------------------------

/**
 * Cost curve for a pipe rated ≤ 2^N.
 *
 * PLACEHOLDER — α.2 will tune. The intent is to preserve the
 * recursive-bootstrap economy (DESIGN.md §7): a pipe ≤ 2^N costs
 * blocks of that magnitude. In the simulator we denominate in round
 * numbers near the magnitude.
 *
 * Pipes have NO leveling axis anymore. Throughput comes from placing
 * parallel pipes (Quantity), per §19 *Three axes of progression*.
 */
/**
 * Cost curve for a pipe rated ≤ 2^N.
 *
 * Phase A.5: delegates to `core/catalog/costs.ts:pipeCost`. The
 * recursive-bootstrap economy (pipe ≤ 2^N paid in blocks at that
 * magnitude) is preserved by the canonical implementation.
 */
function pipeCost(n: number): CostItem[] {
  return corePipeCost(n).map(fromCoreCostItem);
}

// ---------------------------------------------------------------------------
// Warehouse ladder (α.4b.1 — typed warehouses per value)
// ---------------------------------------------------------------------------
//
// Each warehouse the agent owns contributes `warehouseCapacity(comp)`
// units of storage for ONE value (typed warehouse — value-bound). The
// agent buys warehouses when pool[V] hits its current cap and the goal
// needs more.
//
// Costs are PLACEHOLDER — α.4c tunes these against the curve. Initial
// guess: each warehouse costs roughly 10 units of the value it holds
// (recursive-bootstrap consistency: a thousand-warehouse is paid in
// thousands).

function warehouseCost(value: number): CostItem[] {
  // Recursive-bootstrap: warehouse is paid in the value it stores.
  // Zero warehouses paid in zeros (the river-block currency itself).
  return [{ value, count: 10 }];
}

/** Values the simulator tracks warehouses for. Covers the full magnitude
 *  spread from zeros to millions. α.5: zero warehouses added — every
 *  ladder firing pulls zeros from the pool, so the player must hoard
 *  zeros in warehouses just like any other currency. */
const WAREHOUSE_VALUES = [0, 1, 2, 3, 10, 100, 1000, 10_000, 100_000, 1_000_000];

function generateWarehouseLadder(): LitEntry[] {
  return WAREHOUSE_VALUES.map((v) => ({
    id: `warehouse_${v}`,
    kind: 'warehouse' as const,
    cost: warehouseCost(v),
    costScale: 1.5,
    warehouseValue: v,
  }));
}

function generatePipeLadder(): LitEntry[] {
  const entries: LitEntry[] = [];
  // Pipe ≤2^0 = 1 is the introductory pipe (paid at Comp ≤ 2 baseline).
  // Pipe ≤2^N requires Comp > 2^N → Comp ≥ 2^(N+1).
  for (let n = 0; n < COMP_MAX_TIER; n++) {
    const magnitude = Math.pow(2, n);
    entries.push({
      id: `pipe_${n}`,
      kind: 'pipe',
      cost: pipeCost(n),
      pipeMagnitude: magnitude,
      pipeCooldownTicks: 1,
      costScale: 1.6,
      compRequirement: Math.pow(2, n + 1),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Unlock-cost ladder helper (α.5b)
// ---------------------------------------------------------------------------
//
// Every operator unlock cost follows the ladder pattern: at hierarchy
// position L, demand `M × 2^(L-k)` of value k for k = 0..L. M is the
// per-entry tuning multiplier. This makes zero/one/two/... demand
// EXPLICIT for every operator — the agent grinds the small-number
// pyramid, not just a single main currency.

/**
 * Phase A.5: delegates to `core/catalog/costs.ts:ladderUnlockCost`.
 * The wrapper adapts core's Value-shaped output to sim's number-
 * shaped CostItem. Used directly by every hand-curated operator
 * entry below.
 */
function ladderUnlockCost(L: number, M: number): CostItem[] {
  return coreLadderUnlockCost(L, M).map(fromCoreCostItem);
}

// ---------------------------------------------------------------------------
// Hand-curated operator and special-cell Literature
// ---------------------------------------------------------------------------

const OPERATOR_AND_CELL_ENTRIES: LitEntry[] = [
  // α.4a: reverse-ported from src/lib/literature.ts. The game shipped
  // Phase 6 with these numbers; the sim now mirrors them so we can
  // measure the live pacing curve and tune from a true baseline.

  // -- Successor: free opener. -----------------------------------------
  {
    id: 'successor',
    kind: 'cell',
    cellType: 'successor',
    cost: ladderUnlockCost(0, 10), // 10 zeros
    costScale: 1.6,
  },

  // -- Addition: first real grind. -------------------------------------
  {
    id: 'addition',
    kind: 'cell',
    cellType: 'addition',
    cost: ladderUnlockCost(1, 400), // 800z + 400o
    costScale: 1.6,
  },

  // -- Subtraction. ----------------------------------------------------
  {
    id: 'subtraction',
    kind: 'cell',
    cellType: 'subtraction',
    cost: ladderUnlockCost(1, 80), // 160z + 80o
    costScale: 1.6,
  },

  // -- Multiplication: introduces tier-1 fuel + the 10-magnitude grind.
  //
  // α.4c.4: predicate-cost side demand — 20 negatives — forces the
  // player to USE Subtraction or Negation productively, not just
  // unlock them. Without this, the family-exploration cells are
  // bought once and abandoned.
  {
    id: 'multiplication',
    kind: 'cell',
    cellType: 'multiplication',
    cost: [
      ...ladderUnlockCost(2, 100), // 400z + 200o + 100t
      { predicate: 'negative', count: 20 },
      { value: 10, count: 1 }, // puzzle: construct a 10 via addition
    ],
    costScale: 1.6,
  },

  // -- Division. -------------------------------------------------------
  {
    id: 'division',
    kind: 'cell',
    cellType: 'division',
    cost: [
      ...ladderUnlockCost(2, 40),
      { value: 100, count: 1 }, // puzzle: prove the player can multiply
    ],
    costScale: 1.6,
  },

  // -- Negation: cheap sign-flipper. -----------------------------------
  {
    id: 'negation',
    kind: 'cell',
    cellType: 'negation',
    cost: ladderUnlockCost(1, 40), // 80z + 40o
    costScale: 1.6,
  },

  // -- Exponentiation: tier-2 fuel + the 100-magnitude grind. ----------
  //
  // α.4c.4: predicate-cost side demand — 30 primes — forces Factor
  // cell or sustained small-prime production. Pre-exponentiation is
  // the natural place: the player has just unlocked Factor (often at
  // this tier) and needs a reason to USE it.
  {
    id: 'exponentiation',
    kind: 'cell',
    cellType: 'exponentiation',
    cost: [
      ...ladderUnlockCost(3, 50), // 400z + 200o + 100t + 50×3
      { predicate: 'prime', count: 30 },
      { value: 100, count: 1 }, // puzzle: 100 produced via mult
    ],
    costScale: 1.6,
  },

  // -- Inversion: side-line, modest cost. ------------------------------
  {
    id: 'inversion',
    kind: 'cell',
    cellType: 'inversion',
    cost: [
      ...ladderUnlockCost(3, 15),
      { value: 100, count: 1 }, // puzzle: a 100 to invert
    ],
    costScale: 1.6,
  },

  // -- Square root. ----------------------------------------------------
  {
    id: 'square-root',
    kind: 'cell',
    cellType: 'square-root',
    cost: [
      ...ladderUnlockCost(3, 12),
      { value: 100, count: 1 }, // puzzle: a perfect square to root
    ],
    costScale: 1.6,
  },

  // -- Decomposition cells. --------------------------------------------
  {
    id: 'decrement',
    kind: 'cell',
    cellType: 'decrement',
    cost: ladderUnlockCost(1, 10), // 20z + 10o
    costScale: 1.6,
  },
  {
    id: 'factor',
    kind: 'cell',
    cellType: 'factor',
    cost: ladderUnlockCost(1, 30), // 60z + 30o
    costScale: 1.6,
  },

  // -- Tetration: tier-4 fuel, the signature late-game gate. -----------
  //
  // α.5: ladder model cascades small-number demand through every
  // recipe → each "thousand" produced is significantly more expensive
  // than under the single-fuel-block model. Tetration cost reduced
  // proportionally (18000 → 3000 thousands) to keep the ~5h target.
  {
    id: 'tetration',
    kind: 'cell',
    cellType: 'tetration',
    cost: [
      ...ladderUnlockCost(4, 950), // 15200z + 7600o + 3800t + 1900×3 + 950×4
      { predicate: 'irrational', count: 10 },
      { value: 1024, count: 1 }, // puzzle: 2^10 — the first power-of-2 tower
    ],
    costScale: 1.8,
  },

  // -- Pentation: tier-8 fuel. The 10⁶-class payoff. -------------------
  //
  // α.5: ladder cascades make millions extremely expensive to produce.
  // Cost reduced (50k → 8k thousands, 1500 → 200 millions) for the
  // ~7h target under the new cost model.
  {
    id: 'pentation',
    kind: 'cell',
    cellType: 'pentation',
    cost: [
      ...ladderUnlockCost(5, 250), // 8000z + 4000o + 2000t + 1000×3 + 500×4 + 250×5
      { value: 1_000_000, count: 1 }, // puzzle: a million — the 10^6 milestone
    ],
    costScale: 1.8,
  },
];

// ---------------------------------------------------------------------------
// Transformer cultivator entries (Phase 6 ε.1 — stubs in α.1)
// ---------------------------------------------------------------------------
//
// Each transformer cultivator has one input port, one output, an
// internal step counter. Each input consumed advances the step and
// emits f(input, step). Per-step fuel cost escalates per a per-cell-
// type formula (sim-tuned).
//
// For α.1: catalog entries only. The simulator does not yet model the
// per-step production curve — α.2 wires this up.

const CULTIVATOR_ENTRIES: LitEntry[] = [
  {
    id: 'cultivation-arithmetic',
    kind: 'cell',
    cellType: 'cultivation-arithmetic',
    cost: [{ value: 100, count: 200 }],
    costScale: 1.8,
  },
  {
    id: 'cultivation-geometric',
    kind: 'cell',
    cellType: 'cultivation-geometric',
    cost: [{ value: 100, count: 400 }],
    costScale: 1.8,
  },
  {
    id: 'cultivation-fibonacci',
    kind: 'cell',
    cellType: 'cultivation-fibonacci',
    cost: [{ value: 100, count: 300 }],
    costScale: 1.8,
  },
  {
    id: 'cultivation-harmonic',
    kind: 'cell',
    cellType: 'cultivation-harmonic',
    cost: [{ value: 100, count: 250 }],
    costScale: 1.8,
  },
  {
    id: 'cultivation-polynomial',
    kind: 'cell',
    cellType: 'cultivation-polynomial',
    cost: [{ value: 100, count: 350 }],
    costScale: 1.8,
  },
  {
    id: 'cultivation-factorial',
    kind: 'cell',
    cellType: 'cultivation-factorial',
    cost: [{ value: 100, count: 500 }],
    costScale: 1.8,
  },
];

// ---------------------------------------------------------------------------
// Bot entries (Phase 6 δ.1/δ.2 — stubs in α.1)
// ---------------------------------------------------------------------------
//
// T-bots and decomposer bots. Costs are placeholders. T-bot rating is
// capped at comp (`compRequirement` set per tier); decomposer bots are
// rated independently (no comp prerequisite).
//
// For α.1: catalog entries only. Bot effects on production wire up in
// α.2 (T-bots as throughput multipliers at the current frontier;
// decomposer bots as jam-clearing paths).

function generateTBotLadder(): LitEntry[] {
  const entries: LitEntry[] = [];
  for (let n = 1; n <= COMP_MAX_TIER; n++) {
    const rating = Math.pow(2, n);
    entries.push({
      id: `tbot_${n}`,
      kind: 'bot',
      botType: 'translation-bot',
      cost: [{ value: Math.min(rating, 100), count: Math.ceil(rating / 2) }],
      costScale: 1.6,
      botRating: rating,
      compRequirement: rating, // T-bot rating matches comp
    });
  }
  return entries;
}

function generateFBotLadder(): LitEntry[] {
  const entries: LitEntry[] = [];
  for (let n = 1; n <= COMP_MAX_TIER; n++) {
    const rating = Math.pow(2, n);
    entries.push({
      id: `fbot_${n}`,
      kind: 'bot',
      botType: 'factor-bot',
      cost: [{ value: Math.min(rating, 1000), count: Math.ceil(rating / 2) }],
      costScale: 1.6,
      botRating: rating,
      // No comp prerequisite — delegated comprehension.
    });
  }
  return entries;
}

function generateDBotLadder(): LitEntry[] {
  const entries: LitEntry[] = [];
  for (let n = 1; n <= COMP_MAX_TIER; n++) {
    const rating = Math.pow(2, n);
    entries.push({
      id: `dbot_${n}`,
      kind: 'bot',
      botType: 'decrement-bot',
      cost: [{ value: Math.min(rating, 1000), count: Math.ceil(rating / 3) }],
      costScale: 1.6,
      botRating: rating,
    });
  }
  return entries;
}

function generateIBotLadder(): LitEntry[] {
  const entries: LitEntry[] = [];
  for (let n = 1; n <= COMP_MAX_TIER; n++) {
    const rating = Math.pow(2, n);
    entries.push({
      id: `ibot_${n}`,
      kind: 'bot',
      botType: 'inversion-bot',
      cost: [{ value: Math.min(rating, 1000), count: Math.ceil(rating / 2) }],
      costScale: 1.6,
      botRating: rating,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Combined LITERATURE catalog
// ---------------------------------------------------------------------------

export const LITERATURE: LitEntry[] = [
  ...OPERATOR_AND_CELL_ENTRIES,
  ...generateCompLadder(),
  ...generatePipeLadder(),
  ...generateWarehouseLadder(),
  ...CULTIVATOR_ENTRIES,
  ...generateTBotLadder(),
  ...generateFBotLadder(),
  ...generateDBotLadder(),
  ...generateIBotLadder(),
];

export const LITERATURE_BY_ID = new Map(LITERATURE.map((e) => [e.id, e] as const));

// ---------------------------------------------------------------------------
// Ladder fuel model (α.5 — DESIGN §6 evolution)
// ---------------------------------------------------------------------------
//
// Per-firing fuel is no longer a single magnitude-scaled block. Each
// cell at hierarchy position L consumes a LADDER of small numbers:
//
//   2^L zeros + 2^(L-1) ones + 2^(L-2) twos + ... + 1 of value L
//
// scaled by ⌈log₁₀(max input)⌉ (preserves magnitude tax on big ops).
//
// Hierarchy positions:
//   L=0  successor
//   L=1  addition, subtraction, negation
//   L=2  multiplication, division
//   L=3  exponentiation, square-root, inversion
//   L=4  tetration
//   L=5  pentation
//
// At each tier the ladder requires the ENTIRE pyramid below it. Zero
// production stays load-bearing forever — every firing draws zeros.
// Late-game ops draw from many different value streams simultaneously,
// turning fuel routing into a continuous coordination puzzle rather
// than a single-port wiring task.

/** Hierarchy position of a cell type (0 = successor, 5 = pentation). */
export function ladderPosition(type: CellType): number {
  switch (type) {
    case 'successor':
      return 0;
    case 'addition':
    case 'subtraction':
    case 'negation':
      return 1;
    case 'multiplication':
    case 'division':
      return 2;
    case 'exponentiation':
    case 'square-root':
    case 'inversion':
      return 3;
    case 'tetration':
      return 4;
    case 'pentation':
      return 5;
    default:
      // Cultivators, decomposers, factor, decrement: no ladder model
      // for now (treat as L=0 with empty ladder).
      return -1;
  }
}

/**
 * Per-firing ladder for a cell type, given the firing's max input
 * magnitude. Returns a value→count map representing all blocks the
 * cell consumes as FUEL per firing (operand inputs are separate and
 * tracked by the recipe's `inputs` field).
 *
 * Pattern: at position L, consume 2^(L-k) blocks of value k for
 * k = 0..L. Counts scale by ⌈log₁₀(max input)⌉ (floored at 1).
 *
 * Examples (with maxInput=10, mag=1):
 *   - Successor    L=0: { 0: 1 }
 *   - Addition     L=1: { 0: 2, 1: 1 }
 *   - Multiplication L=2: { 0: 4, 1: 2, 2: 1 }
 *   - Exponentiation L=3: { 0: 8, 1: 4, 2: 2, 3: 1 }
 *   - Tetration    L=4: { 0:16, 1: 8, 2: 4, 3: 2, 4: 1 }
 *   - Pentation    L=5: { 0:32, 1:16, 2: 8, 3: 4, 4: 2, 5: 1 }
 *
 * With maxInput=1M, mag=6, multiplication's ladder is
 * {0: 24, 1: 12, 2: 6} — the 4z/2o/1t shape scaled 6×.
 */
export function ladderFor(type: CellType, maxInput: number): Map<number, number> {
  const L = ladderPosition(type);
  const ladder = new Map<number, number>();
  if (L < 0) return ladder;
  // Magnitude tax: ⌈log₁₀(max input)⌉, floored at 1. Successor's
  // input is zero (log undefined) — treat as mag=1.
  const absMax = Math.abs(maxInput);
  const mag = absMax > 0 ? Math.max(1, Math.ceil(Math.log10(absMax))) : 1;
  for (let k = 0; k <= L; k++) {
    const baseCount = Math.pow(2, L - k);
    ladder.set(k, baseCount * mag);
  }
  return ladder;
}

/**
 * Legacy single-magnitude cost API — retained as a derived helper for
 * compat with anything that wants a "total fuel magnitude" reading.
 * Returns the sum of (value × count) across the ladder.
 */
export function computationalCost(type: CellType, maxInput: number): number {
  let total = 0;
  for (const [v, c] of ladderFor(type, maxInput)) {
    total += v * c;
  }
  return total;
}

/** Backwards-compat cost tier — derived from ladder position so call
 *  sites that branch on tier (e.g. fuel-port-required vs optional)
 *  keep something to consult. tier 0 still means "free" since L<0 is
 *  the marker for cells outside the ladder system. */
export function costTier(type: CellType): number {
  const L = ladderPosition(type);
  return L < 0 ? 0 : L;
}

// ---------------------------------------------------------------------------
// Cell recipes — what each cell type produces given its inputs
// ---------------------------------------------------------------------------

export interface Recipe {
  produces: number;
  cell: CellType;
  inputs: number[];
  /** Convenience: max |input| for ladder magnitude scaling. */
  maxInput: number;
}

function recipe(produces: number, cell: CellType, inputs: number[]): Recipe {
  const maxInput = inputs.length > 0 ? Math.max(...inputs.map(Math.abs)) : 0;
  return { produces, cell, inputs, maxInput };
}

/**
 * Standard recipe for each value the simulator tracks. The agent picks
 * one recipe per value; multiple paths exist for some (e.g. 10 = 2×5
 * vs 5+5) but we commit to a single canonical form for tractability.
 *
 * Tuning note: changing a recipe shifts which currencies become the
 * production bottleneck.
 */
export const RECIPES: Recipe[] = [
  // Small values: addition-only paths, so they're constructible during
  // Stage A before multiplication is unlocked.
  recipe(1, 'successor', [0]),
  recipe(2, 'addition', [1, 1]),
  recipe(3, 'addition', [1, 2]),
  recipe(4, 'addition', [2, 2]),
  recipe(5, 'addition', [2, 3]),
  recipe(6, 'addition', [3, 3]),
  recipe(7, 'addition', [3, 4]),
  recipe(8, 'addition', [4, 4]),
  recipe(9, 'addition', [4, 5]),
  recipe(10, 'addition', [5, 5]),

  // Stage B intermediates — addition for small targets, multiplication
  // for the 100+ range.
  recipe(15, 'addition', [5, 10]),
  recipe(20, 'addition', [10, 10]),
  recipe(25, 'addition', [10, 15]),
  recipe(50, 'multiplication', [5, 10]),
  recipe(100, 'multiplication', [10, 10]),
  recipe(250, 'multiplication', [10, 25]),
  recipe(1000, 'exponentiation', [10, 3]),
  recipe(10_000, 'exponentiation', [10, 4]),
  recipe(100_000, 'exponentiation', [10, 5]),
  recipe(1_000_000, 'exponentiation', [10, 6]),
  recipe(1_000_000_000, 'exponentiation', [10, 9]),

  // α.5c: puzzle values — specific numbers demanded at unlock
  // milestones. Every comp_N unlock demands 1 × 2^(N-1) (the ceiling
  // of the previous tier), so every power of 2 in the comp range
  // needs a recipe.
  //
  // Mixed strategy: addition doubling for early powers (≤ 64, before
  // exponentiation is unlocked in roadmap order), exp(2, N) for
  // 128 and up. Each new exp recipe pulls in any missing
  // exponent-input addition recipe.

  // -- Addition intermediates (exp operand inputs needed below). ------
  recipe(11, 'addition', [5, 6]),
  recipe(12, 'addition', [6, 6]),
  recipe(13, 'addition', [6, 7]),
  recipe(14, 'addition', [7, 7]),
  recipe(16, 'addition', [8, 8]),
  recipe(17, 'addition', [8, 9]),
  recipe(18, 'addition', [9, 9]),
  recipe(19, 'addition', [9, 10]),

  // -- Powers of 2 via addition doubling (comp_2..comp_6 puzzles). ---
  // (2, 4, 8, 16 already exist via the small-values block.)
  recipe(32, 'addition', [16, 16]),
  recipe(64, 'addition', [32, 32]),

  // -- Powers of 2 via exp(2, N) (comp_7+ puzzles). ------------------
  recipe(128, 'exponentiation', [2, 7]),
  recipe(256, 'exponentiation', [2, 8]),
  recipe(512, 'exponentiation', [2, 9]),
  recipe(1024, 'exponentiation', [2, 10]),
  recipe(2048, 'exponentiation', [2, 11]),
  recipe(4096, 'exponentiation', [2, 12]),
  recipe(8192, 'exponentiation', [2, 13]),
  recipe(16_384, 'exponentiation', [2, 14]),
  recipe(32_768, 'exponentiation', [2, 15]),
  recipe(65_536, 'exponentiation', [2, 16]),
  recipe(131_072, 'exponentiation', [2, 17]),
  recipe(262_144, 'exponentiation', [2, 18]),
  recipe(524_288, 'exponentiation', [2, 19]),
];

export const RECIPE_BY_VALUE = new Map(RECIPES.map((r) => [r.produces, r] as const));

// ---------------------------------------------------------------------------
// Level ladders (cell levels only — pipe leveling DISSOLVED in Phase 6)
// ---------------------------------------------------------------------------
//
// Cell levels stay (cap 5; redesign session pending). Every leveled
// primitive doubles throughput per level (2^(L-1)) and may add a
// quality. Costs are denominated in the currency the primitive helps
// produce, so leveling is self-amortizing.
//
// Pipe leveling has dissolved into the comprehension ladder (Phase 6
// γ.1). Throughput comes from placing parallel pipes.

export type LevelTarget = { kind: 'cell'; cellType: CellType };

export interface LevelEntry {
  id: string;
  target: LevelTarget;
  level: number;
  multiplier: number;
  cost: CostItem[];
  quality?: string;
}

/** Throughput multiplier given current level (1-indexed). */
export function levelMultiplier(level: number): number {
  return Math.pow(2, Math.max(0, level - 1));
}

export const LEVEL_LADDERS: LevelEntry[] = [
  // -- Successor -----------------------------------------------------------
  {
    id: 'successor_lvl2',
    target: { kind: 'cell', cellType: 'successor' },
    level: 2,
    multiplier: 2,
    cost: [{ value: 1, count: 200 }],
  },
  {
    id: 'successor_lvl3',
    target: { kind: 'cell', cellType: 'successor' },
    level: 3,
    multiplier: 4,
    cost: [{ value: 10, count: 200 }],
    // α.5: river-tap removed. Successor lvl 3 is a pure 4× throughput
    // bump; zeros still flow through pipe ≤1.
  },
  {
    id: 'successor_lvl4',
    target: { kind: 'cell', cellType: 'successor' },
    level: 4,
    multiplier: 8,
    cost: [{ value: 100, count: 300 }],
  },
  {
    id: 'successor_lvl5',
    target: { kind: 'cell', cellType: 'successor' },
    level: 5,
    multiplier: 16,
    cost: [{ value: 100, count: 5000 }],
    quality: 'bundle output: every 5 firings emit a 5-block',
  },

  // -- Addition ------------------------------------------------------------
  {
    id: 'addition_lvl2',
    target: { kind: 'cell', cellType: 'addition' },
    level: 2,
    multiplier: 2,
    cost: [{ value: 10, count: 100 }],
  },
  {
    id: 'addition_lvl3',
    target: { kind: 'cell', cellType: 'addition' },
    level: 3,
    multiplier: 4,
    cost: [{ value: 100, count: 200 }],
  },
  {
    id: 'addition_lvl4',
    target: { kind: 'cell', cellType: 'addition' },
    level: 4,
    multiplier: 8,
    cost: [{ value: 1000, count: 300 }],
    quality: 'variadic: sums 3 inputs per firing',
  },
  {
    id: 'addition_lvl5',
    target: { kind: 'cell', cellType: 'addition' },
    level: 5,
    multiplier: 16,
    cost: [{ value: 1000, count: 5000 }],
  },

  // -- Multiplication ------------------------------------------------------
  {
    id: 'multiplication_lvl2',
    target: { kind: 'cell', cellType: 'multiplication' },
    level: 2,
    multiplier: 2,
    cost: [{ value: 100, count: 100 }],
  },
  {
    id: 'multiplication_lvl3',
    target: { kind: 'cell', cellType: 'multiplication' },
    level: 3,
    multiplier: 4,
    cost: [{ value: 1000, count: 200 }],
    quality: 'fuel cost −1 (min 1)',
  },
  {
    id: 'multiplication_lvl4',
    target: { kind: 'cell', cellType: 'multiplication' },
    level: 4,
    multiplier: 8,
    cost: [{ value: 10_000, count: 300 }],
  },
  {
    id: 'multiplication_lvl5',
    target: { kind: 'cell', cellType: 'multiplication' },
    level: 5,
    multiplier: 16,
    cost: [{ value: 10_000, count: 3000 }],
    quality: 'fuel cost halved',
  },

  // -- Exponentiation ------------------------------------------------------
  {
    id: 'exponentiation_lvl2',
    target: { kind: 'cell', cellType: 'exponentiation' },
    level: 2,
    multiplier: 2,
    cost: [{ value: 1000, count: 100 }],
  },
  {
    id: 'exponentiation_lvl3',
    target: { kind: 'cell', cellType: 'exponentiation' },
    level: 3,
    multiplier: 4,
    cost: [{ value: 10_000, count: 200 }],
    quality: 'fuel cost −1 (min 1)',
  },
  {
    id: 'exponentiation_lvl4',
    target: { kind: 'cell', cellType: 'exponentiation' },
    level: 4,
    multiplier: 8,
    cost: [{ value: 100_000, count: 300 }],
  },
  {
    id: 'exponentiation_lvl5',
    target: { kind: 'cell', cellType: 'exponentiation' },
    level: 5,
    multiplier: 16,
    cost: [{ value: 100_000, count: 3000 }],
    quality: 'fuel cost halved',
  },
];

/** Lookup: next level entry for a given (kind, key) at current level. */
export function nextLevelEntry(
  target: LevelTarget,
  currentLevel: number,
): LevelEntry | null {
  for (const entry of LEVEL_LADDERS) {
    if (entry.level !== currentLevel + 1) continue;
    if (entry.target.kind !== target.kind) continue;
    if (entry.target.cellType === target.cellType) return entry;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Player throughput constants
// ---------------------------------------------------------------------------

/** Manual zero-pickup rate before any pipe ≤1 is purchased. */
export const MANUAL_PICKUP_RATE_PER_TICK = 0.5;

/** Tick = 1 simulated second. */
export const TICK_MS = 1000;

/** Cells fire at most once per tick. */
export const CELL_COOLDOWN_TICKS = 1;
