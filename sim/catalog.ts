// sim/catalog.ts
//
// Static data for the pacing simulator. Mirrors the canonical game sources:
//
//   - Literature entries        ↔ src/lib/literature.ts
//   - Cost formulas             ↔ src/lib/cost.ts
//
// THIS file is the primary tuning surface — edit costs, recipes, and tier
// coefficients here and re-run the simulator to see how pacing shifts.
// Re-sync with the game files when you finalize numbers.
//
// Pacing target (declared, not enforced):
//
//   Speedrun:  Tetration unlock at ~18,000 ticks  (5 hours @ 1 tick/sec)
//   Casual:    Tetration unlock at ~36,000 ticks  (10 hours, ~2× speedrun)
//
//   Per-stage shape:
//     Stage A (0–10 min):    early operators, dense unlocks every 1–3 min
//     Stage B (10–60 min):   first real grind — multiplication chain
//     Stage C (1–3 hr):      mid-tier exponentiation + comprehension climb
//     Stage D (3–5 hr):      heavy infrastructure for hyperoperators
//     Stage E (5+ hr):       Tetration and beyond

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
  | 'cultivation-arithmetic'
  | 'cultivation-geometric'
  | 'cultivation-fibonacci';

export type EntryKind = 'cell' | 'pipe' | 'theorem' | 'comprehension';

export interface CostItem {
  value: number;
  count: number;
}

export interface LitEntry {
  id: string;
  kind: EntryKind;
  cellType?: CellType;
  cost: CostItem[];
  costScale?: number;
  once?: boolean;
  pipeMagnitude?: number;
  pipeCooldownTicks?: number;
  comprehensionLevel?: number;
}

// ---------------------------------------------------------------------------
// Literature catalog (rebalanced — see header for pacing target)
// ---------------------------------------------------------------------------

const ONE_EACH_OF_1_TO_9: CostItem[] = Array.from({ length: 9 }, (_, i) => ({
  value: i + 1,
  count: 1,
}));

export const LITERATURE: LitEntry[] = [
  // -- Stage A: opening (0–10 min target) -----------------------------------

  // Successor: 10 zeros. Quick onboarding — gets the first unlock into
  // the player's hand inside 30 seconds so the opening doesn't drag.
  // The grind shifts to Addition (900 ones), which is the first real
  // Stage A wait.
  {
    id: 'successor',
    kind: 'cell',
    cellType: 'successor',
    cost: [{ value: 0, count: 10 }],
    costScale: 1.6,
  },
  // Pipe ≤1: 1 one. Same as before.
  {
    id: 'pipe_1',
    kind: 'pipe',
    cost: [{ value: 1, count: 1 }],
    pipeMagnitude: 1,
    pipeCooldownTicks: 1,
    costScale: 1.6,
  },
  // Addition: 900 ones (was 500; tuned for leveling-aware curve).
  {
    id: 'addition',
    kind: 'cell',
    cellType: 'addition',
    cost: [{ value: 1, count: 900 }],
    costScale: 1.6,
  },
  // Comprehension I: ceiling 25. Cost: one each of 1–9 + one 25.
  // Engineering puzzle — small, but introduces the pattern.
  {
    id: 'comprehension_25',
    kind: 'comprehension',
    cost: [...ONE_EACH_OF_1_TO_9, { value: 25, count: 1 }],
    comprehensionLevel: 25,
    once: true,
  },

  // -- Stage B: combinators (10–60 min) -------------------------------------

  // Subtraction: 200 twos. Was 20. Gate held by Addition having to grind first.
  {
    id: 'subtraction',
    kind: 'cell',
    cellType: 'subtraction',
    cost: [{ value: 2, count: 200 }],
    costScale: 1.6,
  },
  // Multiplication: 200 tens (was 100).
  {
    id: 'multiplication',
    kind: 'cell',
    cellType: 'multiplication',
    cost: [{ value: 10, count: 200 }],
    costScale: 1.6,
  },
  // Pipe ≤10: 200 tens (was 100).
  {
    id: 'pipe_10',
    kind: 'pipe',
    cost: [{ value: 10, count: 200 }],
    pipeMagnitude: 10,
    pipeCooldownTicks: 1,
    costScale: 1.6,
  },
  // Division: same magnitude as Mult, denominated in threes.
  {
    id: 'division',
    kind: 'cell',
    cellType: 'division',
    cost: [{ value: 3, count: 200 }],
    costScale: 1.6,
  },
  // Comprehension II: ceiling 100. Cost: one 100 + one 50 + one 25.
  {
    id: 'comprehension_100',
    kind: 'comprehension',
    cost: [
      { value: 100, count: 1 },
      { value: 50, count: 1 },
      { value: 25, count: 1 },
    ],
    comprehensionLevel: 100,
    once: true,
  },

  // -- Stage C: exponentiation + comprehension climb (1–3 hr) --------------

  // Exponentiation: 200 hundreds (was 100).
  {
    id: 'exponentiation',
    kind: 'cell',
    cellType: 'exponentiation',
    cost: [{ value: 100, count: 200 }],
    costScale: 1.6,
  },
  // Comprehension III: ceiling 250.
  {
    id: 'comprehension_250',
    kind: 'comprehension',
    cost: [
      { value: 250, count: 1 },
      { value: 100, count: 5 },
    ],
    comprehensionLevel: 250,
    once: true,
  },
  // Square Root: introduces irrationals. Cost in hundreds.
  {
    id: 'square-root',
    kind: 'cell',
    cellType: 'square-root',
    cost: [{ value: 100, count: 50 }],
    costScale: 1.6,
  },
  // Comprehension IV: ceiling 1,000. The 1729 gate (modeled as a single
  // value of magnitude 1000 — the engineering puzzle of constructing
  // 1729 specifically is real but doesn't grind time).
  {
    id: 'comprehension_1k',
    kind: 'comprehension',
    cost: [
      { value: 1000, count: 1 },
      { value: 100, count: 10 },
    ],
    comprehensionLevel: 1000,
    once: true,
  },

  // -- Stage D: heavy infrastructure (3–5 hr) ------------------------------

  // Cultivation: Arithmetic. Stage D intermediate.
  {
    id: 'cultivation-arithmetic',
    kind: 'cell',
    cellType: 'cultivation-arithmetic',
    cost: [{ value: 100, count: 700 }],
    costScale: 1.8,
  },
  // Pipe ≤100: 5,000 hundreds. The signature mid-game gate, sized so
  // leveled production is genuinely required.
  {
    id: 'pipe_100',
    kind: 'pipe',
    cost: [{ value: 100, count: 5000 }],
    pipeMagnitude: 100,
    pipeCooldownTicks: 1,
    costScale: 1.6,
  },
  // Comprehension V: ceiling 10,000.
  {
    id: 'comprehension_10k',
    kind: 'comprehension',
    cost: [
      { value: 10_000, count: 3500 },
      { value: 1000, count: 350 },
    ],
    comprehensionLevel: 10_000,
    once: true,
  },
  // Comprehension VI: ceiling 100,000.
  {
    id: 'comprehension_100k',
    kind: 'comprehension',
    cost: [
      { value: 100_000, count: 1750 },
      { value: 10_000, count: 350 },
    ],
    comprehensionLevel: 100_000,
    once: true,
  },
  // Pipe ≤1,000: required for cultivation and tetration outputs.
  {
    id: 'pipe_1k',
    kind: 'pipe',
    cost: [{ value: 1000, count: 1000 }],
    pipeMagnitude: 1000,
    pipeCooldownTicks: 1,
    costScale: 1.6,
  },
  // Comprehension VII: ceiling 1,000,000.
  {
    id: 'comprehension_1m',
    kind: 'comprehension',
    cost: [
      { value: 1_000_000, count: 700 },
      { value: 100_000, count: 175 },
    ],
    comprehensionLevel: 1_000_000,
    once: true,
  },

  // -- Stage E: hyperoperators (5+ hr) -------------------------------------

  // Tetration: 4,000 thousands + 200 hundreds. The hyperoperator gate
  // demands tier-3 production at scale.
  {
    id: 'tetration',
    kind: 'cell',
    cellType: 'tetration',
    cost: [
      { value: 1000, count: 4000 },
      { value: 100, count: 200 },
    ],
    costScale: 1.8,
  },
  // Comprehension VIII: ceiling 10⁹. 350 blocks at that scale.
  {
    id: 'comprehension_1b',
    kind: 'comprehension',
    cost: [{ value: 1_000_000_000, count: 350 }],
    comprehensionLevel: 1_000_000_000,
    once: true,
  },
  // Pentation: tetration-class infrastructure investment.
  {
    id: 'pentation',
    kind: 'cell',
    cellType: 'pentation',
    cost: [
      { value: 1000, count: 8500 },
      { value: 1_000_000, count: 350 },
    ],
    costScale: 1.8,
  },
];

export const LITERATURE_BY_ID = new Map(LITERATURE.map((e) => [e.id, e] as const));

// ---------------------------------------------------------------------------
// Cost tier table (mirror of src/lib/cost.ts:65 `costTier`)
// ---------------------------------------------------------------------------

export function costTier(type: CellType): number {
  switch (type) {
    case 'multiplication':
    case 'division':
      return 1;
    case 'exponentiation':
      return 2;
    case 'tetration':
      return 4;
    case 'pentation':
      return 8;
    default:
      return 0;
  }
}

export function computationalCost(type: CellType, maxInput: number): number {
  const tier = costTier(type);
  if (tier === 0) return 0;
  if (maxInput <= 0) return 0;
  const log = Math.log10(maxInput);
  const order = Math.max(1, Math.ceil(log));
  return tier * order;
}

// ---------------------------------------------------------------------------
// Cell recipes — what each cell type produces given its inputs
// ---------------------------------------------------------------------------

export interface Recipe {
  produces: number;
  cell: CellType;
  inputs: number[];
  fuelMagnitude: number;
}

function recipe(produces: number, cell: CellType, inputs: number[]): Recipe {
  const maxInput = inputs.length > 0 ? Math.max(...inputs.map(Math.abs)) : 0;
  return {
    produces,
    cell,
    inputs,
    fuelMagnitude: computationalCost(cell, maxInput),
  };
}

/**
 * Standard recipe for each value the simulator tracks. The agent picks one
 * recipe per value; multiple paths exist for some (e.g. 10 = 2×5 vs 5+5)
 * but we commit to a single canonical form for tractability.
 *
 * Tuning note: changing a recipe shifts which currencies become the
 * production bottleneck. The simulator will faithfully report the impact.
 */
export const RECIPES: Recipe[] = [
  // Small values: addition-only paths, so they're constructible during
  // Stage A before multiplication is unlocked. The agent can switch to
  // mult-based recipes once mult is available — but the sim uses one
  // recipe per value statically, so we pick what's reachable earliest.
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
  // for the 100+ range where it's a real shortcut.
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
];

export const RECIPE_BY_VALUE = new Map(RECIPES.map((r) => [r.produces, r] as const));

// ---------------------------------------------------------------------------
// Level ladders (per cell / pipe type)
// ---------------------------------------------------------------------------
//
// Every leveled primitive doubles throughput per level (2^(L-1)) and
// occasionally adds a quality. Costs are denominated in the currency the
// primitive helps produce, so leveling is self-amortizing: you can't
// upgrade a cell without first running it for a while.
//
// Level cap is 5 (matches user preference). Qualities listed are
// documented but only `multiplier` affects sim pacing — the qualities
// are real game effects we'll add when porting to src/lib/.

export type LevelTarget =
  | { kind: 'cell'; cellType: CellType }
  | { kind: 'pipe'; magnitude: number };

export interface LevelEntry {
  id: string; // e.g. 'successor_lvl2', 'pipe_10_lvl3'
  target: LevelTarget;
  level: number; // the level reached by this upgrade (2..5)
  multiplier: number; // total throughput multiplier at this level
  cost: CostItem[];
  quality?: string; // documented but not yet sim-modeled
}

/** Throughput multiplier given current level (1-indexed). */
export function levelMultiplier(level: number): number {
  return Math.pow(2, Math.max(0, level - 1));
}

// Tuning note: level costs ramp ×3-5 at lvl 4 and 5 — these are
// aspirational. The first two levels are accessible; max levels demand
// a mature factory.

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
    quality: 'river-tap: fires without a pipe ≤1',
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

  // -- Pipe ≤1 -------------------------------------------------------------
  {
    id: 'pipe_1_lvl2',
    target: { kind: 'pipe', magnitude: 1 },
    level: 2,
    multiplier: 2,
    cost: [{ value: 1, count: 200 }],
  },
  {
    id: 'pipe_1_lvl3',
    target: { kind: 'pipe', magnitude: 1 },
    level: 3,
    multiplier: 4,
    cost: [{ value: 1, count: 2000 }],
  },
  {
    id: 'pipe_1_lvl4',
    target: { kind: 'pipe', magnitude: 1 },
    level: 4,
    multiplier: 8,
    cost: [{ value: 10, count: 3000 }],
  },
  {
    id: 'pipe_1_lvl5',
    target: { kind: 'pipe', magnitude: 1 },
    level: 5,
    multiplier: 16,
    cost: [{ value: 100, count: 5000 }],
  },

  // -- Pipe ≤10 ------------------------------------------------------------
  {
    id: 'pipe_10_lvl2',
    target: { kind: 'pipe', magnitude: 10 },
    level: 2,
    multiplier: 2,
    cost: [{ value: 10, count: 200 }],
  },
  {
    id: 'pipe_10_lvl3',
    target: { kind: 'pipe', magnitude: 10 },
    level: 3,
    multiplier: 4,
    cost: [{ value: 100, count: 200 }],
  },
  {
    id: 'pipe_10_lvl4',
    target: { kind: 'pipe', magnitude: 10 },
    level: 4,
    multiplier: 8,
    cost: [{ value: 1000, count: 300 }],
  },
  {
    id: 'pipe_10_lvl5',
    target: { kind: 'pipe', magnitude: 10 },
    level: 5,
    multiplier: 16,
    cost: [{ value: 1000, count: 3000 }],
  },

  // -- Pipe ≤100 -----------------------------------------------------------
  {
    id: 'pipe_100_lvl2',
    target: { kind: 'pipe', magnitude: 100 },
    level: 2,
    multiplier: 2,
    cost: [{ value: 100, count: 200 }],
  },
  {
    id: 'pipe_100_lvl3',
    target: { kind: 'pipe', magnitude: 100 },
    level: 3,
    multiplier: 4,
    cost: [{ value: 1000, count: 200 }],
  },
  {
    id: 'pipe_100_lvl4',
    target: { kind: 'pipe', magnitude: 100 },
    level: 4,
    multiplier: 8,
    cost: [{ value: 10_000, count: 300 }],
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
    if (entry.target.kind === 'cell' && target.kind === 'cell') {
      if (entry.target.cellType === target.cellType) return entry;
    } else if (entry.target.kind === 'pipe' && target.kind === 'pipe') {
      if (entry.target.magnitude === target.magnitude) return entry;
    }
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
