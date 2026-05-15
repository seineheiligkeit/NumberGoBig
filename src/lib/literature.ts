import type { CellType } from './cell-types';
import {
  countMatching,
  hasUnlock,
  incrementPurchaseCount,
  purchaseCountOf,
  raiseComprehension,
  spendMatching,
  spendValue,
  unlock,
} from './world';
import { showMarginalia } from './marginalia';
import {
  valueKey,
  valueLabel,
  valueMagnitude,
  valueOf,
  valueToSafeNumber,
  type Value,
} from './value';
import Decimal from 'break_eternity.js';
import { getWarehouseRule } from './warehouse-rules';

/**
 * Literature — the shop catalog and purchase logic.
 *
 * Three kinds of entries:
 *   - `cell`           — purchasing places a new equation cell on the canvas.
 *                        Most cells are *repeatable*; each subsequent copy
 *                        costs more (geometric scaling). The id matches a
 *                        `CellType`.
 *   - `theorem`        — milestone inscriptions. Once-only. Demand a specific
 *                        construction; the reward is a narrator beat.
 *   - `comprehension`  — once-only upgrades that raise the manual-lift ceiling
 *                        to a specific level. Costs are often multi-item.
 *
 * Any block value can serve as currency. Costs are an *array* of items so a
 * single entry can demand "one of each from 1..10" (Comprehension I) just as
 * easily as "10 zeros" (Successor).
 *
 * Since Slice 4.0 every cost value is a `Value` (Decimal-backed). The static
 * entries below construct them at module load with `valueOf(N)`.
 */

/**
 * Cost items come in two shapes (Slice 5.3):
 *
 *   - **Value cost** `{ value, count }` — N blocks of EXACTLY this value.
 *     The early/mid-game default ("10 ones", "5 twos", "1 × 1729").
 *
 *   - **Predicate cost** `{ ruleId, count, magnitudeMin? }` — N blocks
 *     satisfying a `warehouse-rules` predicate, optionally with an
 *     additional magnitude floor. Powers late-game demands like "5 primes
 *     ≥ 100" or "20 composites".
 *
 * The two are mutually exclusive per item — every `LiteratureCostItem`
 * is either one or the other. Multi-item costs may mix both freely.
 */
export interface LiteratureCostValue {
  value: Value;
  count: number;
}

export interface LiteratureCostPredicate {
  ruleId: string;
  count: number;
  /** Optional magnitude floor (`|v| >= magnitudeMin`). */
  magnitudeMin?: number;
  /** Optional override label for the UI. Defaults to a generated string. */
  label?: string;
}

export type LiteratureCostItem = LiteratureCostValue | LiteratureCostPredicate;

function isValueItem(item: LiteratureCostItem): item is LiteratureCostValue {
  return 'value' in item;
}

function isPredicateItem(item: LiteratureCostItem): item is LiteratureCostPredicate {
  return 'ruleId' in item;
}

/** Multi-item cost. Single-cost entries supply a one-element array. */
export type LiteratureCost = readonly LiteratureCostItem[];

/**
 * Compiles a predicate cost item into a test function suitable for
 * `countMatching` / `spendMatching`. Combines the underlying rule with
 * the optional magnitude floor.
 */
function predicateTest(item: LiteratureCostPredicate): ((v: Value) => boolean) | null {
  const rule = getWarehouseRule(item.ruleId);
  if (!rule) return null;
  const min = item.magnitudeMin;
  if (min === undefined) return rule.test;
  const minD = new Decimal(min);
  return (v: Value) => rule.test(v) && valueMagnitude(v).gte(minD);
}

export type LiteratureKind = 'cell' | 'theorem' | 'comprehension' | 'pipe';

export interface LiteratureEntry {
  id: string;
  kind: LiteratureKind;
  name: string;
  glyph: string;
  description: string;
  cost: LiteratureCost;
  /** Once-only entries cannot be re-purchased. Theorems and comprehension are always once. */
  isOnce?: boolean;
  /** Geometric multiplier per repeat purchase. Default 1.6. Ignored if isOnce. */
  costScale?: number;
  /** For `comprehension` entries: the new ceiling to install on purchase. */
  comprehensionLevel?: number;
  /** For `pipe` entries: the magnitude rating of the pipe to place. */
  pipeMagnitude?: number;
  /** For `pipe` entries: cooldown between items in ms. Default 1000. */
  pipeCooldownMs?: number;
  /** Cell-type override — used when the entry id can't double as the CellType
   *  (rule-warehouse entries are parametric on `ruleId`). */
  placementCellType?: CellType;
  /** For rule-warehouse entries: which predicate to install on the placed cell. */
  ruleId?: string;
  /** Optional narrator note fired on the *first* purchase only. */
  unlockMessage?: string;
}

const ALL_TEN: LiteratureCost = Array.from({ length: 10 }, (_, i) => ({
  value: valueOf(i + 1),
  count: 1,
}));

export const LITERATURE_ENTRIES: readonly LiteratureEntry[] = [
  // -- Operators --------------------------------------------------------
  {
    id: 'successor',
    kind: 'cell',
    name: 'Successor Function',
    glyph: '{ }',
    description: 'Wraps a number. n → n + 1. The first theorem.',
    cost: [{ value: valueOf(0), count: 10 }],
    unlockMessage: 'Result added to your literature: the Successor Function.',
  },
  {
    id: 'addition',
    kind: 'cell',
    name: 'Addition Operator',
    glyph: '+',
    description: 'Two summands enter, their sum emerges. a + b.',
    cost: [{ value: valueOf(1), count: 50 }],
    unlockMessage: 'Result added to your literature: the Addition Operator.',
  },
  {
    id: 'subtraction',
    kind: 'cell',
    name: 'Subtraction Operator',
    glyph: '−',
    description: 'a − b. Minuend on top, subtrahend below. Negatives now admissible.',
    cost: [{ value: valueOf(2), count: 20 }],
    unlockMessage:
      'Result added to your literature: Subtraction. The number line, henceforth, extends in both directions.',
  },
  {
    id: 'multiplication',
    kind: 'cell',
    name: 'Multiplication Operator',
    glyph: '×',
    description:
      'Repeated addition, formalised. a × b. Each firing burns one fuel block of magnitude ≥ the input order.',
    cost: [{ value: valueOf(2), count: 10 }],
    unlockMessage:
      'Result added to your literature: the Multiplication Operator. Fuel is paid in magnitude — one block per firing, overpay is wasted. Keep matched denominations.',
  },
  {
    id: 'division',
    kind: 'cell',
    name: 'Division Operator',
    glyph: '÷',
    description:
      'a ÷ b. Exact rationals when the division does not divide evenly. Each firing burns one fuel block matched to the input order.',
    cost: [{ value: valueOf(3), count: 10 }],
    unlockMessage:
      'Result added to your literature: Division. The rationals are admitted, exact and unreduced where they belong.',
  },
  {
    id: 'exponentiation',
    kind: 'cell',
    name: 'Exponentiation Operator',
    glyph: '^',
    description:
      'Repeated multiplication, formalised. a ^ b. Tier-2 fuel cost — grows twice as fast with input magnitude as multiplication.',
    cost: [{ value: valueOf(4), count: 5 }],
    unlockMessage:
      'Result added to your literature: Exponentiation. Tier-2 fuel cost — tetration, when it arrives, will be ruinous.',
  },
  {
    id: 'tetration',
    kind: 'cell',
    name: 'Tetration Operator',
    glyph: '↑↑',
    description:
      'A tower: a ↑↑ b is a stacked b copies of a. Tier-4 fuel cost — the fuel port is REQUIRED, no global fallback. Wire a dedicated supply.',
    cost: [{ value: valueOf(100), count: 3 }],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Tetration. We told you it would be ruinous. Wire fuel — this operator will not improvise.',
  },
  {
    id: 'pentation',
    kind: 'cell',
    name: 'Pentation Operator',
    glyph: '↑↑↑',
    description:
      'Repeated tetration. a ↑↑↑ b is a tower whose height is itself a tower. Tier-8 fuel cost — heights past 3 are catastrophic.',
    cost: [{ value: valueOf(1000), count: 3 }],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Pentation. Two arrows were a building; three arrows is the building rebuilding itself.',
  },
  {
    id: 'variadic-arrow',
    kind: 'cell',
    name: 'Knuth Arrow Operator',
    glyph: '↑ⁿ',
    description:
      'a ↑ⁿ b — arbitrary-arrow hyperoperation. Three inputs: base, arrow count, height. Fuel cost climbs as 2ⁿ; arrows ≤ 10.',
    cost: [{ value: valueOf(1000), count: 10 }],
    costScale: 2.0,
    unlockMessage:
      'Result added to your literature: the Knuth Arrow. You may now parametrise the operator hierarchy itself.',
  },
  {
    id: 'decrement',
    kind: 'cell',
    name: 'Decrement',
    glyph: '−1',
    description: 'n in, n−1 out one side, a 1 out the other. Liberates units.',
    cost: [{ value: valueOf(10), count: 1 }],
    unlockMessage:
      'Result added to your literature: Decrement. Numbers may now be undone, one step at a time.',
  },
  {
    id: 'factor',
    kind: 'cell',
    name: 'Factor',
    glyph: 'p…',
    description: 'A composite in, its prime factorisation out. Costs Total Score.',
    cost: [{ value: valueOf(10), count: 3 }],
    unlockMessage:
      'Result added to your literature: Factor. The Fundamental Theorem of Arithmetic, mechanised.',
  },
  {
    id: 'square-root',
    kind: 'cell',
    name: 'Square Root',
    glyph: '√',
    description: 'A non-negative input in, its square root out. Non-squares surface as irrationals.',
    cost: [{ value: valueOf(4), count: 8 }],
    unlockMessage:
      'Result added to your literature: the Square Root. The Pythagoreans send their belated apologies.',
  },
  {
    id: 'warehouse',
    kind: 'cell',
    name: 'Warehouse',
    glyph: '▥',
    description: 'Typed storage. Drop on the left to deposit, click the right to withdraw. Capacity 100.',
    cost: [{ value: valueOf(1), count: 25 }],
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: Warehouse. The canvas no longer needs to hold all your work in plain view.',
  },

  // -- Generalized (rule-based) warehouses (Slice 3.5.4) ---------------
  // Each rule is its own Literature entry; the placement code uses the
  // entry's `placementCellType` + `ruleId` instead of `id as CellType`.
  // Costs are deliberately tilted toward currencies the rule itself helps
  // accumulate — a `< 100` warehouse asks for tens you already have.
  {
    id: 'warehouse_rule_lt10',
    kind: 'cell',
    name: 'Generalized Warehouse (< 10)',
    glyph: '▥',
    description: 'A warehouse that accepts any block of magnitude under 10. Useful as a small-change wallet.',
    cost: [{ value: valueOf(5), count: 5 }],
    placementCellType: 'warehouse-rule',
    ruleId: 'lt10',
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to magnitudes below ten. A small-change wallet that mixes its coinage.',
  },
  {
    id: 'warehouse_rule_lt100',
    kind: 'cell',
    name: 'Generalized Warehouse (< 100)',
    glyph: '▥',
    description: 'Accepts any block of magnitude under 100. The mid-range reservoir of choice.',
    cost: [{ value: valueOf(10), count: 10 }],
    placementCellType: 'warehouse-rule',
    ruleId: 'lt100',
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to magnitudes below one hundred.',
  },
  {
    id: 'warehouse_rule_lt1000',
    kind: 'cell',
    name: 'Generalized Warehouse (< 1000)',
    glyph: '▥',
    description: 'Accepts any block of magnitude under 1000. A deeper denomination — fuel for higher operators.',
    cost: [{ value: valueOf(100), count: 5 }],
    placementCellType: 'warehouse-rule',
    ruleId: 'lt1000',
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to magnitudes below one thousand.',
  },
  {
    id: 'warehouse_rule_prime',
    kind: 'cell',
    name: 'Generalized Warehouse (prime)',
    glyph: '▥',
    description: 'Accepts only prime naturals. Currency vault for Literature entries that demand them.',
    cost: [
      { value: valueOf(2), count: 1 },
      { value: valueOf(3), count: 1 },
      { value: valueOf(5), count: 1 },
      { value: valueOf(7), count: 1 },
      { value: valueOf(11), count: 1 },
    ],
    placementCellType: 'warehouse-rule',
    ruleId: 'prime',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to primes. The fundamental currency, in a single tidy bin.',
  },
  {
    id: 'warehouse_rule_composite',
    kind: 'cell',
    name: 'Generalized Warehouse (composite)',
    glyph: '▥',
    description: 'Accepts only composites. Where Factor sends its raw stock.',
    cost: [
      { value: valueOf(4), count: 1 },
      { value: valueOf(6), count: 1 },
      { value: valueOf(8), count: 1 },
      { value: valueOf(9), count: 1 },
      { value: valueOf(10), count: 1 },
    ],
    placementCellType: 'warehouse-rule',
    ruleId: 'composite',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to composites. The natural sink for everything Factor breaks down.',
  },

  // -- Pipes (automation tier I) ----------------------------------------
  // Each pipe rating costs that-many of itself: the recursive bootstrap. To
  // get a 10-pipe you must first hand-craft ten 10s. Once you can mass-
  // produce N, the corresponding pipe is cheap.
  {
    id: 'pipe_1',
    kind: 'pipe',
    name: 'Pipe (≤1)',
    glyph: '─',
    description: 'Carries values 0–1. One item per second. Source: river or cell output. Dest: cell input.',
    cost: [{ value: valueOf(1), count: 1 }],
    pipeMagnitude: 1,
    pipeCooldownMs: 1000,
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: Pipe. Automation begins where the hand stops.',
  },
  {
    id: 'pipe_10',
    kind: 'pipe',
    name: 'Pipe (≤10)',
    glyph: '═',
    description: 'Carries values 0–10. One item per second.',
    cost: [{ value: valueOf(10), count: 10 }],
    pipeMagnitude: 10,
    pipeCooldownMs: 900,
    costScale: 1.6,
    unlockMessage: 'A heavier pipe. Bigger numbers may travel by themselves now.',
  },
  {
    id: 'pipe_100',
    kind: 'pipe',
    name: 'Pipe (≤100)',
    glyph: '≡',
    description: 'Carries values 0–100. One item per second.',
    cost: [{ value: valueOf(100), count: 100 }],
    pipeMagnitude: 100,
    pipeCooldownMs: 800,
    costScale: 1.6,
    unlockMessage: 'A hundred hundreds, well spent.',
  },

  // -- Cultivation cells -------------------------------------------------
  // Cultivation is intentionally late-mid-game work — the cells trivialise
  // production if unlocked too early. Prices demand a substantial factory
  // of hundreds-and-thousands already on the floor; without warehouse-rule
  // infrastructure to absorb the mixed-value output, a seeded cultivator
  // also clogs its own port. Geometric chains self-throttle on fuel cost
  // (Slice 3.5.6); the up-front price keeps them off the early canvas.
  {
    id: 'cultivation-arithmetic',
    kind: 'cell',
    name: 'Cultivation: Arithmetic',
    glyph: 'a+n',
    description:
      'Drop a seed; emits a, a+1, a+2, … every 1.8 seconds. Seed is not consumed. Each emission burns one fuel block matched to its magnitude. Requires real warehouse infrastructure to feed and absorb.',
    cost: [{ value: valueOf(100), count: 50 }],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Arithmetic Cultivation. Numbers march out at a steady linear pace — each one taxing the fuel pool. Build a sink first.',
  },
  {
    id: 'cultivation-geometric',
    kind: 'cell',
    name: 'Cultivation: Geometric',
    glyph: 'a·2ⁿ',
    description:
      'Drop a seed; emits a, 2a, 4a, 8a, … Quick to overrun any pipe. Self-throttles as fuel cost climbs with each emission.',
    cost: [
      { value: valueOf(1000), count: 20 },
      { value: valueOf(100), count: 50 },
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Geometric Cultivation. Exponential growth, mechanised — and exponentially fuel-hungry. A handful of seeded cells is plenty.',
  },
  {
    id: 'cultivation-fibonacci',
    kind: 'cell',
    name: 'Cultivation: Fibonacci',
    glyph: 'a·Fₙ',
    description:
      'Drop a seed; emits a·F₁, a·F₂, a·F₃, … (1, 1, 2, 3, 5, 8, …) times a. Each emission burns fuel matched to its magnitude.',
    cost: [
      { value: valueOf(1000), count: 10 },
      { value: valueOf(2), count: 5 },
      { value: valueOf(3), count: 5 },
      { value: valueOf(5), count: 5 },
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Fibonacci Cultivation. Each emission is the sum of its two predecessors — and pulls fuel proportional to its size.',
  },

  // -- Filters (Slice 5.2) ----------------------------------------------
  // Predicate-based routers. They reuse the same vocabulary as the
  // warehouse-rule cells, so a player who has built the `<10` warehouse
  // already knows what the `<10` filter does.
  {
    id: 'filter_lt10',
    kind: 'cell',
    name: 'Filter (< 10)',
    glyph: 'Y',
    description: 'Routes magnitudes below 10 out the top, the rest out the bottom.',
    cost: [{ value: valueOf(10), count: 5 }],
    placementCellType: 'filter',
    ruleId: 'lt10',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Filter. A two-pronged fork — matches above, rejections below.',
  },
  {
    id: 'filter_lt100',
    kind: 'cell',
    name: 'Filter (< 100)',
    glyph: 'Y',
    description: 'Routes magnitudes below 100 out the top, the rest out the bottom.',
    cost: [{ value: valueOf(100), count: 10 }],
    placementCellType: 'filter',
    ruleId: 'lt100',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: a heavier Filter, threshold one hundred.',
  },
  {
    id: 'filter_lt1000',
    kind: 'cell',
    name: 'Filter (< 1000)',
    glyph: 'Y',
    description: 'Routes magnitudes below 1000 out the top, the rest out the bottom.',
    cost: [{ value: valueOf(1000), count: 5 }],
    placementCellType: 'filter',
    ruleId: 'lt1000',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: a Filter for the thousands.',
  },
  {
    id: 'filter_prime',
    kind: 'cell',
    name: 'Filter (prime)',
    glyph: 'Y',
    description: 'Primes out the top; composites, ones, and other shapes of number out the bottom.',
    cost: [
      { value: valueOf(2), count: 3 },
      { value: valueOf(3), count: 3 },
      { value: valueOf(5), count: 3 },
      { value: valueOf(7), count: 3 },
    ],
    placementCellType: 'filter',
    ruleId: 'prime',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Prime Filter. Now Factor has a downstream.',
  },
  {
    id: 'filter_composite',
    kind: 'cell',
    name: 'Filter (composite)',
    glyph: 'Y',
    description: 'Composites out the top; everything else out the bottom.',
    cost: [
      { value: valueOf(4), count: 3 },
      { value: valueOf(6), count: 3 },
      { value: valueOf(8), count: 3 },
      { value: valueOf(9), count: 3 },
    ],
    placementCellType: 'filter',
    ruleId: 'composite',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Composite Filter. Factor and this make a small workshop.',
  },

  // -- Cleanup bots ------------------------------------------------------
  {
    id: 'cleanup-bot',
    kind: 'cell',
    name: 'Cleanup Bot',
    glyph: '⟲',
    description: 'Sweeps a loose block from a 240 px radius into a matching warehouse every 2.5 s.',
    cost: [{ value: valueOf(10), count: 12 }],
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: Cleanup Bot. The page will tidy itself, eventually.',
  },

  // -- Comprehension upgrades ------------------------------------------
  {
    id: 'comprehension_100',
    kind: 'comprehension',
    name: 'Comprehension I',
    glyph: '≤100',
    description: 'Lift the manual ceiling to 100. Requires one each of 1 through 10.',
    cost: ALL_TEN,
    comprehensionLevel: 100,
    isOnce: true,
    unlockMessage:
      'Comprehension I. You may now lift numbers up to 100. The ones-through-tens were the price.',
  },
  {
    id: 'comprehension_1k',
    kind: 'comprehension',
    name: 'Comprehension II',
    glyph: '≤10³',
    description: 'Lift the ceiling to 1,000. Cost: ten hundreds.',
    cost: [{ value: valueOf(100), count: 10 }],
    comprehensionLevel: 1000,
    isOnce: true,
    unlockMessage: 'Comprehension II. The thousand is in reach.',
  },
  {
    id: 'comprehension_1m',
    kind: 'comprehension',
    name: 'Comprehension III',
    glyph: '≤10⁶',
    description: 'Lift the ceiling to one million. Cost: one 9,999.',
    cost: [{ value: valueOf(9999), count: 1 }],
    comprehensionLevel: 1_000_000,
    isOnce: true,
    unlockMessage:
      'Comprehension III. You can now manually move a million. Whether you should is another question.',
  },

  // -- Theorems (milestone inscriptions) --------------------------------
  // Each demands the construction of a specific number. No mechanical
  // payoff in Phase 1 — these are goal-shaped narrator beats.
  {
    id: 'theorem_first_prime',
    kind: 'theorem',
    name: 'Theorem: The First Prime',
    glyph: '2',
    description: 'Inscribe a 2 into the Literature.',
    cost: [{ value: valueOf(2), count: 1 }],
    isOnce: true,
    unlockMessage:
      'Two: the first prime, and the only even one. The Literature notes the irregularity with discomfort.',
  },
  {
    id: 'theorem_first_composite',
    kind: 'theorem',
    name: 'Theorem: The First Composite',
    glyph: '4',
    description: 'Inscribe a 4 into the Literature.',
    cost: [{ value: valueOf(4), count: 1 }],
    isOnce: true,
    unlockMessage:
      'Four: the smallest composite. Now factor may break it, and the score must pay for the privilege.',
  },
  {
    id: 'theorem_six_sixes',
    kind: 'theorem',
    name: 'Theorem: Six Sixes',
    glyph: '6⁶',
    description: 'A small ritual. Inscribe six sixes.',
    cost: [{ value: valueOf(6), count: 6 }],
    isOnce: true,
    unlockMessage: 'Six sixes. The numerologists are nodding; the mathematicians are not.',
  },
  {
    id: 'theorem_hardy_ramanujan',
    kind: 'theorem',
    name: 'Theorem: 1729',
    glyph: '1729',
    description: 'The Hardy–Ramanujan number. Construct one.',
    cost: [{ value: valueOf(1729), count: 1 }],
    isOnce: true,
    unlockMessage:
      '1729 = 1³ + 12³ = 9³ + 10³. The smallest number expressible as a sum of two cubes in two distinct ways. Ramanujan, dying in hospital, noticed instantly.',
  },

  // -- Theorems backed by predicate currencies (Slice 5.3) --------------
  // These ask for *any* N blocks satisfying a predicate, rather than a
  // single specific value. They scaffold the Phase 4 currency progression:
  // a working factory has the predicate ingredients on hand, an early one
  // doesn't.
  {
    id: 'theorem_box_of_primes',
    kind: 'theorem',
    name: 'Theorem: A Box of Primes',
    glyph: 'p×10',
    description: 'Gather ten primes — any ten.',
    cost: [{ ruleId: 'prime', count: 10, label: 'primes' }],
    isOnce: true,
    unlockMessage:
      'Ten primes, gathered. The Sieve of Eratosthenes nods approvingly from across the centuries.',
  },
  {
    id: 'theorem_big_primes',
    kind: 'theorem',
    name: 'Theorem: A Box of Bigger Primes',
    glyph: 'p≥100',
    description: 'Gather five primes of magnitude at least 100.',
    cost: [{ ruleId: 'prime', count: 5, magnitudeMin: 100, label: 'primes ≥ 100' }],
    isOnce: true,
    unlockMessage:
      'Five primes above one hundred. The deeper part of the prime sequence is no longer pure rumour.',
  },
  {
    id: 'theorem_crate_composites',
    kind: 'theorem',
    name: 'Theorem: A Crate of Composites',
    glyph: 'c×20',
    description: 'Gather twenty composites — any twenty.',
    cost: [{ ruleId: 'composite', count: 20, label: 'composites' }],
    isOnce: true,
    unlockMessage:
      'Twenty composites, displayed plainly. Factor would have something to say about each — but the Theorem is content to enumerate.',
  },
];

/** Convenient predicate for the UI to route only cell purchases to placement mode. */
export function isCellEntry(entry: LiteratureEntry): entry is LiteratureEntry & { id: CellType } {
  return entry.kind === 'cell';
}

/**
 * Returns the cost of the *next* purchase of `entry` given how many times it
 * has already been bought. Once-only entries always return the base cost.
 * Repeatable entries scale geometrically (default ×1.6 per prior purchase)
 * across every cost item.
 */
export function currentCost(entry: LiteratureEntry, purchaseCount: number): LiteratureCost {
  if (entry.isOnce || purchaseCount === 0) return entry.cost;
  const scale = entry.costScale ?? 1.6;
  return entry.cost.map((item) => {
    const scaledCount = Math.ceil(item.count * Math.pow(scale, purchaseCount));
    if (isValueItem(item)) {
      return { value: item.value, count: scaledCount };
    }
    return {
      ruleId: item.ruleId,
      count: scaledCount,
      magnitudeMin: item.magnitudeMin,
      label: item.label,
    };
  });
}

/**
 * Plural-aware English label for the *small* named integers we use as
 * currency. For anything larger or non-small-integer (rationals, irrationals,
 * etc. when Phase 3 lands), defers to the generic `valueLabel`. The result
 * always reads "10 zeros", "1 prime" — never "10 zero" or "1 zeros".
 */
function pluralName(value: Value, count: number): string {
  const n = valueToSafeNumber(value);
  if (n !== null && Number.isInteger(n) && n >= 0 && n <= 10) {
    const plural = count !== 1;
    switch (n) {
      case 0: return plural ? 'zeros' : 'zero';
      case 1: return plural ? 'ones' : 'one';
      case 2: return plural ? 'twos' : 'two';
      case 3: return plural ? 'threes' : 'three';
      case 4: return plural ? 'fours' : 'four';
      case 5: return plural ? 'fives' : 'five';
      case 6: return plural ? 'sixes' : 'six';
      case 7: return plural ? 'sevens' : 'seven';
      case 8: return plural ? 'eights' : 'eight';
      case 9: return plural ? 'nines' : 'nine';
      case 10: return plural ? 'tens' : 'ten';
    }
  }
  return valueLabel(value) + (count !== 1 ? 's' : '');
}

/**
 * Formats a single cost item. Value items get an English plural for small
 * named integers, `N × V` otherwise. Predicate items render their rule
 * label plus an optional magnitude floor — "5 primes ≥ 100".
 */
export function formatCostItem(item: LiteratureCostItem): string {
  if (isPredicateItem(item)) {
    if (item.label) return `${item.count} × ${item.label}`;
    const rule = getWarehouseRule(item.ruleId);
    const ruleLabel = rule?.label ?? item.ruleId;
    const min = item.magnitudeMin !== undefined ? ` ≥ ${item.magnitudeMin}` : '';
    return `${item.count} × ${ruleLabel}${min}`;
  }
  const n = valueToSafeNumber(item.value);
  if (n !== null && n >= 0 && n <= 10 && Number.isInteger(n)) {
    return `${item.count} ${pluralName(item.value, item.count)}`;
  }
  return `${item.count} × ${valueLabel(item.value)}`;
}

/**
 * Formats a multi-item cost. Single-item costs read as plain text; multi-item
 * costs join with " + " — terse enough for a narrow sidebar, explicit enough
 * for the player to see what's required.
 */
export function formatCost(cost: LiteratureCost): string {
  return cost.map(formatCostItem).join(' + ');
}

/**
 * Checks whether the player can currently afford the whole cost bundle. Used
 * for affordability UI. Note: this is a snapshot — call sites must read
 * `$countByValue` to drive reactivity. Keying by `valueKey(v)` keeps the
 * check disjoint across Value variants (`real:5` ≠ `rational:5/1`).
 */
export function canAfford(
  cost: LiteratureCost,
  counts: ReadonlyMap<string, number>,
): boolean {
  // Aggregate value items by key (two `{ value: 1 }` items in the same
  // cost combine to one count requirement).
  const required = new Map<string, number>();
  for (const item of cost) {
    if (!isValueItem(item)) continue;
    const k = valueKey(item.value);
    required.set(k, (required.get(k) ?? 0) + item.count);
  }
  for (const [k, n] of required) {
    if ((counts.get(k) ?? 0) < n) return false;
  }

  // Predicate items can't be answered from `counts` (the map is per-
  // exact-value). Walk the world directly via `countMatching` — cheap
  // since predicate items are rare and the world isn't huge.
  for (const item of cost) {
    if (!isPredicateItem(item)) continue;
    const test = predicateTest(item);
    if (!test) return false;
    if (countMatching(test) < item.count) return false;
  }
  return true;
}

/**
 * Attempts to purchase a Literature entry. Returns true on success.
 * Fails silently on insufficient currency or on a once-only entry already
 * bought. Callers should check `canAfford(cost, $countByValue)` first when
 * driving UI affordability; this function still does a defensive recheck.
 */
export function purchase(entry: LiteratureEntry): boolean {
  const owned = purchaseCountOf(entry.id);
  if (entry.isOnce && owned > 0) return false;

  const cost = currentCost(entry, owned);

  // Aggregate value items by key so a multi-item cost that names the same
  // value twice is summed correctly. Spend in order; if any item fails the
  // whole purchase aborts. We pre-check the bundle's affordability before
  // entering the loop (canAfford in the UI), so a mid-spend failure should
  // only happen if world state mutated under us — vanishingly rare in
  // single-threaded play.
  type Aggregated = { value: Value; total: number };
  const aggregated = new Map<string, Aggregated>();
  for (const item of cost) {
    if (!isValueItem(item)) continue;
    const k = valueKey(item.value);
    const existing = aggregated.get(k);
    if (existing) existing.total += item.count;
    else aggregated.set(k, { value: item.value, total: item.count });
  }
  for (const { value, total } of aggregated.values()) {
    if (!spendValue(value, total)) return false;
  }
  // Predicate items are spent independently — no aggregation since each
  // item carries its own predicate. Order doesn't matter mathematically;
  // we go in declaration order so the diagnostic on failure is consistent.
  for (const item of cost) {
    if (!isPredicateItem(item)) continue;
    const test = predicateTest(item);
    if (!test) return false;
    if (!spendMatching(test, item.count)) return false;
  }

  incrementPurchaseCount(entry.id);
  unlock(entry.id);

  // Kind-specific side effects.
  if (entry.kind === 'comprehension' && entry.comprehensionLevel) {
    raiseComprehension(entry.comprehensionLevel);
  }

  if (owned === 0 && entry.unlockMessage) {
    showMarginalia(entry.unlockMessage, `unlock_${entry.id}`);
  }
  return true;
}

/** Module re-export of `hasUnlock` so consumers don't all reach into world.ts. */
export { hasUnlock };
