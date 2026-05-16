// sim/catalog.ts
//
// Static data for the pacing simulator — Phase 6 model: Comprehension
// as Spine. See DESIGN.md §9 and ROADMAP §2 Phase 6 for the design.
//
// ===========================================================================
// α.3 LOCK (2026-05-16) — these numbers are the source of truth for code
// porting (Phase 6 slices β.1 onward).
// ===========================================================================
//
// LOCKED pacing curve (sim's optimal-play agent; real player ~5-15% slower):
//
//   Successor      → 20s         Tetration      → 4h 44m
//   Addition       → 2m 25s      Pentation      → 6h 38m
//   Multiplication → 44m
//   Exponentiation → 1h 19m
//
// LOCKED sections (cite this file when editing the game source):
//   - `compUpgradeCost(n)`          ← THE spine
//   - `pipeCost(n)`
//   - `OPERATOR_AND_CELL_ENTRIES`   ← all operators
//   - `LEVEL_LADDERS`               ← cell-only leveling
//   - `RECIPES`
//   - `costTier`, `computationalCost`
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

export type EntryKind = 'cell' | 'pipe' | 'theorem' | 'comprehension' | 'bot';

export interface CostItem {
  value: number;
  count: number;
}

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
 * Cost curve for the comp upgrade to tier N (reaches Comp ≤ 2^N).
 *
 * α.2 iteration 1: cost roughly proportional to the new ceiling.
 * Each tier doubles the ceiling, so each tier roughly doubles its
 * cost relative to the previous — geometric in N. Currency tier
 * shifts as the ceiling climbs (small change → tens → hundreds →
 * thousands).
 *
 * Tier 1 (≤2) costs nothing — it's the baseline, not a purchase.
 * Tier 2 (≤4) is the first paid Literature after Successor.
 */
function compUpgradeCost(n: number): CostItem[] {
  const ceiling = Math.pow(2, n);
  // Early tiers: pay in ones. The opening climb teaches the mechanic.
  if (ceiling <= 8) return [{ value: 1, count: ceiling * 20 }];
  if (ceiling <= 64) return [{ value: 2, count: Math.ceil(ceiling * 12) }];
  if (ceiling <= 512) return [{ value: 10, count: Math.ceil(ceiling * 2.5) }];
  if (ceiling <= 4096) return [{ value: 100, count: Math.ceil(ceiling) }];
  if (ceiling <= 32_768) return [{ value: 1000, count: Math.ceil(ceiling / 5) }];
  if (ceiling <= 262_144) return [{ value: 10_000, count: Math.ceil(ceiling / 32) }];
  if (ceiling <= 2_097_152) return [{ value: 100_000, count: Math.ceil(ceiling / 256) }];
  if (ceiling <= 16_777_216) return [{ value: 1_000_000, count: Math.ceil(ceiling / 2048) }];
  return [{ value: 1_000_000, count: Math.ceil(ceiling / 4096) }];
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
function pipeCost(n: number): CostItem[] {
  const mag = Math.pow(2, n);
  // α.2 iteration 1: pipes are stockpile-sized — buying pipe ≤2^N is
  // a "this magnitude is now my comfortable interior" investment, so
  // counts are proportional to magnitude (not 1-or-2).
  if (mag <= 4) return [{ value: 1, count: Math.max(5, mag * 5) }];
  if (mag <= 32) return [{ value: 10, count: Math.max(5, Math.ceil(mag / 2)) }];
  if (mag <= 256) return [{ value: 100, count: Math.max(5, Math.ceil(mag / 4)) }];
  if (mag <= 4096) return [{ value: 1000, count: Math.max(5, Math.ceil(mag / 16)) }];
  if (mag <= 65_536) return [{ value: 10_000, count: Math.max(5, Math.ceil(mag / 128)) }];
  if (mag <= 1_048_576) return [{ value: 100_000, count: Math.max(5, Math.ceil(mag / 1_024)) }];
  return [{ value: 1_000_000, count: Math.max(5, Math.ceil(mag / 8_192)) }];
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
// Hand-curated operator and special-cell Literature
// ---------------------------------------------------------------------------
//
// Costs are PLACEHOLDERS — α.2 sweeps. These are roughly in the right
// order of magnitude to make the sim runnable in α.1.

const OPERATOR_AND_CELL_ENTRIES: LitEntry[] = [
  // α.2 iteration 1: operator costs scaled so each unlock is a real
  // gate against the new comp curve.

  // -- Successor: free opener. -----------------------------------------
  {
    id: 'successor',
    kind: 'cell',
    cellType: 'successor',
    cost: [{ value: 0, count: 10 }],
    costScale: 1.6,
  },

  // -- Addition: first real grind (~5 min target). ---------------------
  {
    id: 'addition',
    kind: 'cell',
    cellType: 'addition',
    cost: [{ value: 1, count: 200 }],
    costScale: 1.6,
  },

  // -- Subtraction. ----------------------------------------------------
  {
    id: 'subtraction',
    kind: 'cell',
    cellType: 'subtraction',
    cost: [{ value: 2, count: 150 }],
    costScale: 1.6,
  },

  // -- Multiplication: introduces tier-1 fuel + the 10-magnitude grind.
  {
    id: 'multiplication',
    kind: 'cell',
    cellType: 'multiplication',
    cost: [{ value: 10, count: 1100 }],
    costScale: 1.6,
  },

  // -- Division. -------------------------------------------------------
  {
    id: 'division',
    kind: 'cell',
    cellType: 'division',
    cost: [{ value: 3, count: 300 }],
    costScale: 1.6,
  },

  // -- Negation: cheap sign-flipper. -----------------------------------
  {
    id: 'negation',
    kind: 'cell',
    cellType: 'negation',
    cost: [{ value: 3, count: 100 }],
    costScale: 1.6,
  },

  // -- Exponentiation: tier-2 fuel + the 100-magnitude grind. ----------
  {
    id: 'exponentiation',
    kind: 'cell',
    cellType: 'exponentiation',
    cost: [{ value: 100, count: 1400 }],
    costScale: 1.6,
  },

  // -- Inversion: side-line, modest cost. ------------------------------
  {
    id: 'inversion',
    kind: 'cell',
    cellType: 'inversion',
    cost: [{ value: 100, count: 150 }],
    costScale: 1.6,
  },

  // -- Square root. ----------------------------------------------------
  {
    id: 'square-root',
    kind: 'cell',
    cellType: 'square-root',
    cost: [{ value: 100, count: 150 }],
    costScale: 1.6,
  },

  // -- Decomposition cells. --------------------------------------------
  {
    id: 'decrement',
    kind: 'cell',
    cellType: 'decrement',
    cost: [{ value: 1, count: 30 }],
    costScale: 1.6,
  },
  {
    id: 'factor',
    kind: 'cell',
    cellType: 'factor',
    cost: [{ value: 2, count: 30 }],
    costScale: 1.6,
  },

  // -- Tetration: tier-4 fuel, the signature late-game gate. -----------
  // Demands thousand-stockpile production at scale.
  {
    id: 'tetration',
    kind: 'cell',
    cellType: 'tetration',
    cost: [
      { value: 1000, count: 19_000 },
      { value: 100, count: 3_500 },
    ],
    costScale: 1.8,
  },

  // -- Pentation: tier-8 fuel. The 10⁶-class payoff. -------------------
  // The hyperoperator boss gate — should feel meaningfully heavier
  // than Tetration's cliff.
  {
    id: 'pentation',
    kind: 'cell',
    cellType: 'pentation',
    cost: [
      { value: 1000, count: 70_000 },
      { value: 1_000_000, count: 1_200 },
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
  ...CULTIVATOR_ENTRIES,
  ...generateTBotLadder(),
  ...generateFBotLadder(),
  ...generateDBotLadder(),
  ...generateIBotLadder(),
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
    case 'inversion':
      return 2;
    case 'tetration':
      return 4;
    case 'pentation':
      return 8;
    default:
      // Includes negation (free), successor / addition / subtraction (free),
      // square-root / decrement / factor (free), cultivators (their per-
      // step cost is modeled separately in α.2).
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
