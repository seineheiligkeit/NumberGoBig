import type { CellType } from './cell-types';
import {
  cellLevel,
  comprehensionLevel,
  countMatching,
  hasUnlock,
  incrementPurchaseCount,
  purchaseCountOf,
  raiseComprehension,
  setCellLevel,
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

export type LiteratureKind = 'cell' | 'theorem' | 'comprehension' | 'pipe' | 'level';

export interface LiteratureEntry {
  id: string;
  kind: LiteratureKind;
  name: string;
  glyph: string;
  description: string;
  cost: LiteratureCost;
  /** Once-only entries cannot be re-purchased. Theorems, comprehension,
   *  and `level` upgrades are always once-only per (type, target level). */
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
  /** For `level` entries: which cell type's level to raise. Mutually
   *  exclusive with `levelPipeMagnitude`. */
  levelCellType?: CellType;
  /** For `level` entries: which pipe magnitude's level to raise. */
  levelPipeMagnitude?: number;
  /** For `level` entries: the target level (2..5). The entry only
   *  becomes purchasable when the current level for the target is
   *  exactly `targetLevel - 1`. */
  targetLevel?: number;
  /** Phase 6 β.2 (DESIGN §9): minimum comprehension required to purchase.
   *  Used by pipes to enforce the one-tier-lag rule (`pipe rating < comp`).
   *  Undefined means no comp requirement. */
  compRequirement?: number;
  /** Phase 6 δ.1: bot magnitude rating set on placement. Decomposer
   *  bots (factor-bot / decrement-bot / inversion-bot) read this field
   *  to know what magnitudes their worker can act on — independent of
   *  player Comprehension. Undefined for non-decomposer entries. */
  botRating?: number;
  /** Optional narrator note fired on the *first* purchase only. */
  unlockMessage?: string;
}

/**
 * Phase 6 — Comprehension as Spine (DESIGN.md §9; ROADMAP §2 Phase 6).
 *
 * The comprehension ladder is power-of-2, infinite in principle. We
 * materialise 30 tiers up front (`comp_1` → ≤2, …, `comp_30` → ≤2^30
 * ≈ 1.07B); extending past that is a single bump of `COMP_MAX_TIER`.
 *
 * The cost curve mirrors `sim/catalog.ts:compUpgradeCost` — locked at
 * α.3 against the ~5h speedrun / ~10h casual target. Re-tune in the
 * sim first, then port back here.
 */
const COMP_MAX_TIER = 30;

/**
 * α.5c: ladder unlock cost — at hierarchy position L, demand
 * `M × 2^(L-k)` of value k for k = 0..L. Mirrors
 * `sim/catalog.ts:ladderUnlockCost`. Used for every operator unlock
 * and re-used by the comp upgrade ladder below.
 */
function ladderUnlockCost(L: number, M: number): LiteratureCostItem[] {
  const items: LiteratureCostItem[] = [];
  for (let k = 0; k <= L; k++) {
    items.push({ value: valueOf(k), count: M * Math.pow(2, L - k) });
  }
  return items;
}

/**
 * α.5c: every comp tier follows the ladder pattern + a milestone
 * puzzle. The milestone is `1 × 2^(N-1)` — the largest value
 * comprehensible AFTER buying comp_(N-1) (= the previous ceiling).
 * The player must engineer that number as proof of mastery before
 * paying the comp_N cost.
 *
 * Mirrors `sim/catalog.ts:compUpgradeCost` after α.5c.
 */
function compUpgradeCost(n: number): LiteratureCostItem[] {
  // Ladder depth: caps at 3 (zeros..threes). Beyond L=3 the bottleneck
  // becomes specific small numbers (4s, 5s) that addition struggles
  // to produce at scale, blowing up late-game pacing.
  const L = Math.min(3, Math.floor(n / 3));
  // Multiplier curve (sim-tuned):
  //   - early geometric (1.4× per tier).
  //   - linear past tier 10 to keep late game finite.
  let M: number;
  if (n <= 10) M = Math.ceil(6 * Math.pow(1.4, n - 1));
  else M = Math.ceil(6 * Math.pow(1.4, 9) * (n - 9));
  const cost = ladderUnlockCost(L, M);
  // Milestone puzzle: construct 1 × 2^(N-1) before unlocking.
  if (n >= 2) {
    cost.push({ value: valueOf(Math.pow(2, n - 1)), count: 1 });
  }
  return cost;
}

/** Unicode superscript digits for the 2^N glyph notation. */
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT_DIGITS[parseInt(d, 10)] ?? d)
    .join('');
}

function compGlyph(n: number): string {
  const ceiling = Math.pow(2, n);
  return ceiling < 1000 ? `≤${ceiling}` : `≤2${superscript(n)}`;
}

/**
 * Optional milestone flavor for specific binary-canonical tiers. Generic
 * tiers fall back to the utilitarian default; milestones get narrator
 * beats on first comprehension.
 */
function compMilestoneFlavor(
  n: number,
): { name?: string; description?: string; unlockMessage?: string } | null {
  switch (n) {
    case 2: // ≤4 — first paid entry after Successor
      return {
        unlockMessage:
          'Comprehension ≤4. The first paid result. The mechanism, in miniature.',
      };
    case 10: // ≤1024 — first kilobyte
      return {
        name: 'Comprehension ≤2¹⁰ — Kilobyte',
        unlockMessage:
          'Two to the tenth is one thousand and twenty-four. The thousand is admitted, with twenty-four to spare.',
      };
    case 11: // ≤2048 — Hardy-Ramanujan reachable (1729 < 2048)
      return {
        unlockMessage:
          'Comprehension ≤2¹¹. 1,729 is now liftable — the smallest number expressible as a sum of two cubes in two distinct ways.',
      };
    case 16: // ≤65,536 — 16-bit
      return {
        name: 'Comprehension ≤2¹⁶ — 16-bit',
        unlockMessage:
          'Sixty-five thousand, five hundred and thirty-six. The same as a moderately well-fed birthday.',
      };
    case 20: // ≈1.05M — megabyte
      return {
        name: 'Comprehension ≤2²⁰ — Megabyte',
        unlockMessage:
          'Comprehension ≤2²⁰. The million is in reach. Whether you should manually move one is another question.',
      };
    case 30: // ≈1.07B — gigabyte
      return {
        name: 'Comprehension ≤2³⁰ — Gigabyte',
        unlockMessage:
          'Comprehension ≤2³⁰. The billion is held in mind, if not in hand.',
      };
    default:
      return null;
  }
}

function generateComprehensionLadder(): LiteratureEntry[] {
  const entries: LiteratureEntry[] = [];
  // We skip n=1 (ceiling 2) because it's the baseline — the world starts
  // there, no purchase required. The first paid entry is n=2 (≤4).
  for (let n = 2; n <= COMP_MAX_TIER; n++) {
    const ceiling = Math.pow(2, n);
    const ceilStr = ceiling.toLocaleString();
    const flavor = compMilestoneFlavor(n);
    const defaultName = `Comprehension ${compGlyph(n)}`;
    entries.push({
      id: `comp_${n}`,
      kind: 'comprehension',
      name: flavor?.name ?? defaultName,
      glyph: compGlyph(n),
      description:
        flavor?.description ??
        `Lift the manual ceiling to ${ceilStr}.`,
      cost: compUpgradeCost(n),
      comprehensionLevel: ceiling,
      isOnce: true,
      unlockMessage: flavor?.unlockMessage,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Phase 6 γ.1 — Pipe ladder generator (power-of-2, gated by Comp)
// ---------------------------------------------------------------------------
//
// Pipe rated ≤ 2^N requires Comp ≥ 2^(N+1) (strict one-tier lag —
// DESIGN §9). Per-placement cost preserves the recursive bootstrap:
// a 2^N-pipe is paid in blocks at that magnitude. Mirrors
// `sim/catalog.ts:pipeCost` after α.3 lock.

const PIPE_MAX_TIER = 30; // pipe_0 (≤1) through pipe_29 (≤2^29)

function pipeCost(n: number): LiteratureCostItem[] {
  const mag = Math.pow(2, n);
  if (mag <= 4) return [{ value: valueOf(1), count: Math.max(5, mag * 5) }];
  if (mag <= 32) return [{ value: valueOf(10), count: Math.max(5, Math.ceil(mag / 2)) }];
  if (mag <= 256) return [{ value: valueOf(100), count: Math.max(5, Math.ceil(mag / 4)) }];
  if (mag <= 4096) return [{ value: valueOf(1000), count: Math.max(5, Math.ceil(mag / 16)) }];
  if (mag <= 65_536) return [{ value: valueOf(10_000), count: Math.max(5, Math.ceil(mag / 128)) }];
  if (mag <= 1_048_576) return [{ value: valueOf(100_000), count: Math.max(5, Math.ceil(mag / 1_024)) }];
  return [{ value: valueOf(1_000_000), count: Math.max(5, Math.ceil(mag / 8_192)) }];
}

function pipeGlyph(n: number): string {
  const mag = Math.pow(2, n);
  return mag < 1000 ? `≤${mag}` : `≤2${superscript(n)}`;
}

function generatePipeLadder(): LiteratureEntry[] {
  const entries: LiteratureEntry[] = [];
  for (let n = 0; n < PIPE_MAX_TIER; n++) {
    const mag = Math.pow(2, n);
    const isBaseline = n === 0;
    entries.push({
      id: `pipe_${n}`,
      kind: 'pipe',
      name: `Pipe ${pipeGlyph(n)}`,
      glyph: pipeGlyph(n),
      description:
        isBaseline
          ? 'Carries 0s and 1s. One item per second. Source: river or cell output. Dest: cell input.'
          : `Carries values up to ${mag.toLocaleString()}. One item per second.`,
      cost: pipeCost(n),
      pipeMagnitude: mag,
      pipeCooldownMs: 1000,
      costScale: 1.6,
      compRequirement: Math.pow(2, n + 1),
      unlockMessage:
        isBaseline
          ? 'Result added to your literature: Pipe. Automation begins where the hand stops.'
          : `A heavier pipe rated for ${mag.toLocaleString()}. Bigger numbers may travel by themselves now.`,
    });
  }
  return entries;
}

export const LITERATURE_ENTRIES: readonly LiteratureEntry[] = [
  // -- Operators --------------------------------------------------------
  // Costs rebalanced in the Phase 5.6 pacing overhaul. Validated via the
  // standalone simulator in `sim/`. The shape: dense Stage A unlocks,
  // increasingly aspirational mid-game, hyperoperators gated on real
  // factory scale. Edit `sim/catalog.ts` and re-run `node sim/run.ts`
  // before changing numbers here — the sim is the source of truth.
  {
    id: 'successor',
    kind: 'cell',
    name: 'Successor Function',
    glyph: '{ }',
    description: 'Wraps a number. n → n + 1. The first theorem.',
    cost: ladderUnlockCost(0, 10), // 10 zeros
    unlockMessage: 'Result added to your literature: the Successor Function.',
  },
  {
    id: 'addition',
    kind: 'cell',
    name: 'Addition Operator',
    glyph: '+',
    description: 'Two summands enter, their sum emerges. a + b.',
    cost: ladderUnlockCost(1, 400), // 800 zeros + 400 ones
    unlockMessage: 'Result added to your literature: the Addition Operator.',
  },
  {
    id: 'subtraction',
    kind: 'cell',
    name: 'Subtraction Operator',
    glyph: '−',
    description: 'a − b. Minuend on top, subtrahend below. Negatives now admissible.',
    cost: ladderUnlockCost(1, 80), // 160 zeros + 80 ones
    unlockMessage:
      'Result added to your literature: Subtraction. The number line, henceforth, extends in both directions.',
  },
  {
    id: 'multiplication',
    kind: 'cell',
    name: 'Multiplication Operator',
    glyph: '×',
    description:
      'Repeated addition, formalised. a × b. Each firing burns a ladder of small numbers (DESIGN §6).',
    // α.5c: ladder unlock (L=2, M=100) + negative predicate + 1 × 10 puzzle.
    cost: [
      ...ladderUnlockCost(2, 100), // 400z + 200o + 100t
      { ruleId: 'negative', count: 20 },
      { value: valueOf(10), count: 1 }, // puzzle: construct a 10 via addition
    ],
    unlockMessage:
      'Result added to your literature: the Multiplication Operator. Fuel is paid as a ladder — every firing pulls a pyramid of small numbers.',
  },
  {
    id: 'division',
    kind: 'cell',
    name: 'Division Operator',
    glyph: '÷',
    description:
      'a ÷ b. Exact rationals when the division does not divide evenly. Each firing burns a ladder of small numbers.',
    // α.5c: ladder L=2 × M=40 + puzzle 1 × 100.
    cost: [
      ...ladderUnlockCost(2, 40),
      { value: valueOf(100), count: 1 }, // puzzle: prove you can multiply
    ],
    unlockMessage:
      'Result added to your literature: Division. The rationals are admitted, exact and unreduced where they belong.',
  },
  {
    id: 'exponentiation',
    kind: 'cell',
    name: 'Exponentiation Operator',
    glyph: '^',
    description:
      'Repeated multiplication, formalised. a ^ b. Fuel ladder one tier deeper than mult — every firing pulls zeros through threes.',
    // α.5c: ladder L=3 × M=50 + prime predicate + 1 × 100 puzzle.
    cost: [
      ...ladderUnlockCost(3, 50), // 400z + 200o + 100t + 50×3
      { ruleId: 'prime', count: 30 },
      { value: valueOf(100), count: 1 },
    ],
    unlockMessage:
      'Result added to your literature: Exponentiation. Tetration, when it arrives, will be ruinous.',
  },
  {
    id: 'tetration',
    kind: 'cell',
    name: 'Tetration Operator',
    glyph: '↑↑',
    description:
      'A tower: a ↑↑ b is a stacked b copies of a. Each firing pulls a five-deep ladder: 16 zeros, 8 ones, 4 twos, 2 threes, 1 four (× the magnitude of inputs).',
    // α.5c: ladder L=4 × M=950 + irrational predicate + 1 × 1024 puzzle.
    cost: [
      ...ladderUnlockCost(4, 950), // 15200z + 7600o + 3800t + 1900×3 + 950×4
      { ruleId: 'irrational', count: 10 },
      { value: valueOf(1024), count: 1 }, // puzzle: 2^10
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Tetration. We told you it would be ruinous.',
  },
  {
    id: 'pentation',
    kind: 'cell',
    name: 'Pentation Operator',
    glyph: '↑↑↑',
    description:
      'Repeated tetration. a ↑↑↑ b is a tower whose height is itself a tower. Each firing pulls a six-deep ladder through zeros up to fives.',
    // α.5c: ladder L=5 × M=250 + 1 × 1M puzzle.
    cost: [
      ...ladderUnlockCost(5, 250), // 8000z + 4000o + 2000t + 1000×3 + 500×4 + 250×5
      { value: valueOf(1_000_000), count: 1 }, // puzzle: the 10^6 milestone
    ],
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
    cost: ladderUnlockCost(1, 10), // 20z + 10o
    unlockMessage:
      'Result added to your literature: Decrement. Numbers may now be undone, one step at a time.',
  },
  {
    id: 'factor',
    kind: 'cell',
    name: 'Factor',
    glyph: 'p…',
    description: 'A composite in, its prime factorisation out. Costs Total Score.',
    cost: ladderUnlockCost(1, 30), // 60z + 30o
    unlockMessage:
      'Result added to your literature: Factor. The Fundamental Theorem of Arithmetic, mechanised.',
  },
  {
    id: 'square-root',
    kind: 'cell',
    name: 'Square Root',
    glyph: '√',
    description: 'A non-negative input in, its square root out. Non-squares surface as irrationals.',
    // α.5c: ladder L=3 × M=12 + puzzle 1 × 100.
    cost: [
      ...ladderUnlockCost(3, 12),
      { value: valueOf(100), count: 1 },
    ],
    unlockMessage:
      'Result added to your literature: the Square Root. The Pythagoreans send their belated apologies.',
  },

  // -- Inversion family (Slice 6.15) -----------------------------------
  // Negation produces negatives systematically; Inversion turns small
  // inputs into big outputs (and vice versa) on a *signed* fuel cost.
  // The pacing sim (6.14) locked these numbers: Negation cheap (100 ×3),
  // Inversion mid-game gate (100 ×100), no production-shortcut concern.
  {
    id: 'negation',
    kind: 'cell',
    name: 'Negation',
    glyph: '(−)',
    description: 'A unary sign flip — n becomes −n. A clean source of negative blocks without the awkward 0 − n dance.',
    cost: ladderUnlockCost(1, 40), // 80z + 40o
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: Negation. The minus sign now arrives on demand.',
  },
  {
    id: 'inversion',
    kind: 'cell',
    name: 'Inversion',
    glyph: '1/x',
    description: 'Maps n to 1/n. Cost is signed, so tiny rationals invert into large numbers powered by negative fuel.',
    // α.5c: ladder L=3 × M=15 + puzzle 1 × 100.
    cost: [
      ...ladderUnlockCost(3, 15),
      { value: valueOf(100), count: 1 },
    ],
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: Inversion. The cost, regrettably, is sometimes negative. The cell will accept negative fuel. Do not ask why.',
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
  {
    // Slice 6.15. The natural fuel reservoir for Inversion. Cost in
    // negatives so the player must have made a few first — they
    // produce these through Subtraction (0 − n) or, once unlocked, the
    // Negation cell.
    id: 'warehouse_rule_negative',
    kind: 'cell',
    name: 'Generalized Warehouse (< 0)',
    glyph: '▥',
    description: 'Accepts any negative-valued block. Wire it to an Inversion cell\'s fuel port to power uphill inversions.',
    cost: [
      { value: valueOf(-1), count: 1 },
      { value: valueOf(-2), count: 1 },
      { value: valueOf(-3), count: 1 },
    ],
    placementCellType: 'warehouse-rule',
    ruleId: 'negative',
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to negatives. Inversion\'s natural fuel tank.',
  },

  // -- Pipes (Phase 6 γ.1) ----------------------------------------------
  // Power-of-2 ladder, generated programmatically. One Literature entry
  // per magnitude tier (`pipe_N` rated ≤ 2^N for N = 0..29). Pipe
  // leveling has DISSOLVED into the Comp ladder (DESIGN §9): throughput
  // comes from placing parallel pipes, not from upgrading them. The
  // recursive-bootstrap rule survives — each pipe is priced in blocks
  // of its own magnitude.
  ...generatePipeLadder(),

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
    cost: [{ value: valueOf(100), count: 700 }],
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
      'Input-driven transformer: each input is multiplied by the n-th Fibonacci number (F₁, F₂, F₃, … = 1, 1, 2, 3, 5, …), where n advances per firing.',
    cost: [
      { value: valueOf(1000), count: 10 },
      { value: valueOf(2), count: 5 },
      { value: valueOf(3), count: 5 },
      { value: valueOf(5), count: 5 },
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Fibonacci Cultivation. Each emission is your input scaled by the n-th Fibonacci number.',
  },

  // Phase 6 ε.2 — three series deferred since Phase 2 (DESIGN §6).
  // Costs are placeholders pending α.x sim-tuned curves.
  {
    id: 'cultivation-harmonic',
    kind: 'cell',
    name: 'Cultivation: Harmonic',
    glyph: 'a·Hₙ',
    description:
      'Input-driven transformer: each input scales by the n-th harmonic sum (1 + 1/2 + 1/3 + …). Painfully slow growth.',
    cost: [
      { value: valueOf(100), count: 250 },
    ],
    costScale: 1.7,
    unlockMessage:
      'Result added to your literature: Harmonic Cultivation. Each scaling is the running sum of reciprocals — growth measured against ln n.',
  },
  {
    id: 'cultivation-polynomial',
    kind: 'cell',
    name: 'Cultivation: Polynomial',
    glyph: 'a·n²',
    description:
      'Input-driven transformer: each input scales by (n+1)². Quadratic growth — slower than geometric, faster than arithmetic.',
    cost: [
      { value: valueOf(100), count: 350 },
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Polynomial Cultivation. The quadratic terms march upward at a steady, calculable pace.',
  },
  {
    id: 'cultivation-factorial',
    kind: 'cell',
    name: 'Cultivation: Factorial',
    glyph: 'a·n!',
    description:
      'Input-driven transformer: each input scales by (n+1)!. Factorial growth — terrifying, throttled only by the universal Comprehension gate.',
    cost: [
      { value: valueOf(1000), count: 100 },
      { value: valueOf(100), count: 200 },
    ],
    costScale: 2.0,
    unlockMessage:
      'Result added to your literature: Factorial Cultivation. The factorial does not blink at 20! ≈ 2.4 × 10¹⁸. It does not blink at 100! either.',
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

  // -- Translation Operators (T-bots) -----------------------------------
  // Slice 6.11. The cell type id stays `cleanup-bot` for save back-compat;
  // the displayed name is the joke (translation operator T̂ in mechanics
  // shifts a function in space — exactly what these bots do for blocks).
  {
    id: 'cleanup-bot',
    kind: 'cell',
    name: 'Translation Operator',
    glyph: 'T̂',
    description:
      'A small worker patrols within a 240 px radius, walks to a loose block, and carries it to the nearest matching warehouse. Caps at the player\'s current Comprehension.',
    cost: [{ value: valueOf(10), count: 12 }],
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: Translation Operator. T̂ commutes with the identity. It does not commute with anything else.',
  },

  // -- Decomposer bots (Phase 6 δ.1, DESIGN §9) -------------------------
  // The keystone unjam tool. Each bot walks to a loose block within
  // its rating and transforms it in place. Crucially, the rating is
  // INDEPENDENT of player Comprehension — these are the ONE family of
  // automation that can act on uncomprehended `?`-blocks. Stockpile-
  // priced (the rating is paid for in lots of small change), three
  // tiers per family: low / mid / high.
  //
  // Costs are placeholders pending α.2-extension sim modeling of bot
  // tick effects on pacing. Revisit when the simulator can choose
  // between comp-upgrade and decomposer-bot deployment for jam
  // clearing.

  // Factor-bot — splits a composite into prime factors. Decomposition's
  // hot path: turn a stuck 9,797 into 97 × 101 in one motion.
  {
    id: 'factor-bot',
    kind: 'cell',
    name: 'Factor Operator (≤256)',
    glyph: 'F',
    description:
      'A walking worker rated for blocks up to 256. On arrival, splits a composite into its prime factors at the original position. Independent of Comprehension.',
    cost: [{ value: valueOf(10), count: 40 }],
    costScale: 1.6,
    botRating: 256,
    unlockMessage:
      'Result added to your literature: Factor Operator. The factorizer does not know what it has split apart. Neither, regrettably, do we.',
  },
  {
    id: 'factor-bot-mid',
    kind: 'cell',
    placementCellType: 'factor-bot',
    name: 'Factor Operator (≤16,384)',
    glyph: 'F',
    description:
      'A heavier Factor Operator rated for blocks up to 2¹⁴ = 16,384. Same action, larger reach.',
    cost: [
      { value: valueOf(100), count: 100 },
      { value: valueOf(1000), count: 5 },
    ],
    costScale: 1.6,
    botRating: 16384,
    unlockMessage:
      'Result added to your literature: Factor Operator (mid). The unknown sixteen-thousand may now be quietly disassembled.',
  },
  {
    id: 'factor-bot-hi',
    kind: 'cell',
    placementCellType: 'factor-bot',
    name: 'Factor Operator (≤1,048,576)',
    glyph: 'F',
    description:
      'A late-game Factor Operator rated for blocks up to 2²⁰ ≈ 1.05M. Even the megabyte-scale ?-blocks now have a path home.',
    cost: [
      { value: valueOf(10_000), count: 200 },
      { value: valueOf(100_000), count: 20 },
    ],
    costScale: 1.7,
    botRating: 1048576,
    unlockMessage:
      'Result added to your literature: Factor Operator (high). What you cannot read, this one will partition.',
  },

  // Decrement-bot — chips one off. Brute-force salvage for any
  // stuck number, including primes (which Factor refuses).
  {
    id: 'decrement-bot',
    kind: 'cell',
    name: 'Decrement Operator (≤256)',
    glyph: 'D',
    description:
      'A walking worker rated for blocks up to 256. Removes one and leaves a free 1 alongside. The slow, honest unjam tool.',
    cost: [{ value: valueOf(10), count: 30 }],
    costScale: 1.6,
    botRating: 256,
    unlockMessage:
      'Result added to your literature: Decrement Operator. The decrementer takes one off the unknown. This may take a while.',
  },
  {
    id: 'decrement-bot-mid',
    kind: 'cell',
    placementCellType: 'decrement-bot',
    name: 'Decrement Operator (≤16,384)',
    glyph: 'D',
    description:
      'A heavier Decrement Operator rated for blocks up to 2¹⁴ = 16,384.',
    cost: [
      { value: valueOf(100), count: 80 },
      { value: valueOf(1000), count: 4 },
    ],
    costScale: 1.6,
    botRating: 16384,
    unlockMessage:
      'Result added to your literature: Decrement Operator (mid).',
  },
  {
    id: 'decrement-bot-hi',
    kind: 'cell',
    placementCellType: 'decrement-bot',
    name: 'Decrement Operator (≤1,048,576)',
    glyph: 'D',
    description:
      'A late-game Decrement Operator rated for blocks up to 2²⁰ ≈ 1.05M.',
    cost: [
      { value: valueOf(10_000), count: 160 },
      { value: valueOf(100_000), count: 15 },
    ],
    costScale: 1.7,
    botRating: 1048576,
    unlockMessage:
      'Result added to your literature: Decrement Operator (high).',
  },

  // Inversion-bot — turns a big number into a tiny one. Inherits
  // Inversion's signed-fuel mechanic (DESIGN §6).
  {
    id: 'inversion-bot',
    kind: 'cell',
    name: 'Inversion Operator (≤256)',
    glyph: '1/x',
    description:
      'A walking worker rated for blocks up to 256. Replaces a block with its reciprocal. Inherits Inversion\'s signed-fuel mechanic — see DESIGN §6.',
    cost: [{ value: valueOf(100), count: 30 }],
    costScale: 1.6,
    botRating: 256,
    unlockMessage:
      'Result added to your literature: Inversion Operator. The inverter trades a large number for its small reciprocal. The cost, as before, is sometimes negative.',
  },
  {
    id: 'inversion-bot-mid',
    kind: 'cell',
    placementCellType: 'inversion-bot',
    name: 'Inversion Operator (≤16,384)',
    glyph: '1/x',
    description:
      'A heavier Inversion Operator rated for blocks up to 2¹⁴ = 16,384.',
    cost: [
      { value: valueOf(1000), count: 50 },
      { value: valueOf(10_000), count: 5 },
    ],
    costScale: 1.7,
    botRating: 16384,
    unlockMessage:
      'Result added to your literature: Inversion Operator (mid).',
  },
  {
    id: 'inversion-bot-hi',
    kind: 'cell',
    placementCellType: 'inversion-bot',
    name: 'Inversion Operator (≤1,048,576)',
    glyph: '1/x',
    description:
      'A late-game Inversion Operator rated for blocks up to 2²⁰ ≈ 1.05M.',
    cost: [
      { value: valueOf(100_000), count: 100 },
      { value: valueOf(1_000_000), count: 10 },
    ],
    costScale: 1.8,
    botRating: 1048576,
    unlockMessage:
      'Result added to your literature: Inversion Operator (high).',
  },

  // -- Comprehension ladder -------------------------------------------------
  // Phase 6 (DESIGN.md §9): the comprehension ladder is power-of-2 and
  // generated programmatically. 29 tiers materialise here — `comp_2` → ≤4
  // through `comp_30` → ≤2^30 ≈ 1.07B. `comp_1` (ceiling 2) is the
  // baseline; the world starts there without a purchase. The cost curve
  // mirrors `sim/catalog.ts:compUpgradeCost` after α.3 lock.
  //
  // The Literature panel hides all but the *next-unowned* tier via
  // `isComprehensionEntryAvailable`, so the catalog doesn't visually
  // explode despite housing 29 entries here.
  ...generateComprehensionLadder(),

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

  // -- Level upgrades (Slice 6.7) -------------------------------------------
  //
  // Every leveled primitive (cells + pipes) has 4 upgrade entries (levels
  // 2..5). Throughput multiplier doubles per level. Costs are denominated
  // in the currency the primitive helps produce — self-amortizing.
  //
  // Qualities at specific levels:
  //   - Successor lvl 5: bundle output (deferred behaviour; not modeled in v1)
  //   - Addition lvl 4: variadic sum (deferred to a later slice)
  //   - Multiplication / Exponentiation lvl 3: fuel cost −1 (min 1)
  //   - Multiplication / Exponentiation lvl 5: fuel cost halved
  //   - Pipe lvl 3+: deferred jam-threshold quality
  //   - Pipe lvl 4+: deferred batched-transfer quality
  //
  // (Successor lvl 3 river-tap removed in α.5 — zeros must always flow
  // through pipe ≤1, keeping zero supply a binding constraint at every
  // factory scale.)
  //
  // Costs validated via the simulator in `sim/catalog.ts`. When tuning,
  // edit the sim first and port back here.

  // Successor levels
  {
    id: 'successor_lvl2',
    kind: 'level',
    name: 'Successor II',
    glyph: 'Ⅱ',
    description: 'Levels every Successor cell to II. Each firing emits 2 ones.',
    cost: [{ value: valueOf(1), count: 200 }],
    isOnce: true,
    levelCellType: 'successor',
    targetLevel: 2,
    unlockMessage: 'Successor levelled to II. Each firing now emits two ones.',
  },
  {
    id: 'successor_lvl3',
    kind: 'level',
    name: 'Successor III',
    glyph: 'Ⅲ',
    description: 'Levels every Successor to III. Each firing emits 4 ones.',
    cost: [{ value: valueOf(10), count: 200 }],
    isOnce: true,
    levelCellType: 'successor',
    targetLevel: 3,
    unlockMessage: 'Successor levelled to III. Four ones from each firing.',
  },
  {
    id: 'successor_lvl4',
    kind: 'level',
    name: 'Successor IV',
    glyph: 'Ⅳ',
    description: 'Levels every Successor to IV. 8 ones per firing.',
    cost: [{ value: valueOf(100), count: 300 }],
    isOnce: true,
    levelCellType: 'successor',
    targetLevel: 4,
    unlockMessage: 'Successor IV. The river feels lighter.',
  },
  {
    id: 'successor_lvl5',
    kind: 'level',
    name: 'Successor V',
    glyph: 'Ⅴ',
    description: 'Levels every Successor to V — the maximum. 16 ones per firing.',
    cost: [{ value: valueOf(100), count: 5000 }],
    isOnce: true,
    levelCellType: 'successor',
    targetLevel: 5,
    unlockMessage: 'Successor V. Peano would barely recognise the production.',
  },

  // Addition levels
  {
    id: 'addition_lvl2',
    kind: 'level',
    name: 'Addition II',
    glyph: 'Ⅱ',
    description: 'Levels every Addition cell to II. 2 sums per firing.',
    cost: [{ value: valueOf(10), count: 100 }],
    isOnce: true,
    levelCellType: 'addition',
    targetLevel: 2,
    unlockMessage: 'Addition II. The sums arrive in pairs.',
  },
  {
    id: 'addition_lvl3',
    kind: 'level',
    name: 'Addition III',
    glyph: 'Ⅲ',
    description: 'Levels every Addition to III. 4 sums per firing.',
    cost: [{ value: valueOf(100), count: 200 }],
    isOnce: true,
    levelCellType: 'addition',
    targetLevel: 3,
    unlockMessage: 'Addition III.',
  },
  {
    id: 'addition_lvl4',
    kind: 'level',
    name: 'Addition IV',
    glyph: 'Ⅳ',
    description: 'Levels every Addition to IV. 8 sums per firing.',
    cost: [{ value: valueOf(1000), count: 300 }],
    isOnce: true,
    levelCellType: 'addition',
    targetLevel: 4,
    unlockMessage: 'Addition IV.',
  },
  {
    id: 'addition_lvl5',
    kind: 'level',
    name: 'Addition V',
    glyph: 'Ⅴ',
    description: 'Levels every Addition to V — the maximum. 16 sums per firing.',
    cost: [{ value: valueOf(1000), count: 5000 }],
    isOnce: true,
    levelCellType: 'addition',
    targetLevel: 5,
    unlockMessage: 'Addition V.',
  },

  // Multiplication levels
  {
    id: 'multiplication_lvl2',
    kind: 'level',
    name: 'Multiplication II',
    glyph: 'Ⅱ',
    description: 'Levels every Multiplication cell to II. 2 products per firing.',
    cost: [{ value: valueOf(100), count: 100 }],
    isOnce: true,
    levelCellType: 'multiplication',
    targetLevel: 2,
    unlockMessage: 'Multiplication II.',
  },
  {
    id: 'multiplication_lvl3',
    kind: 'level',
    name: 'Multiplication III — Fuel Saver',
    glyph: 'Ⅲ',
    description:
      'Levels every Multiplication to III. 4 products per firing. Fuel cost reduced by 1 (minimum 1).',
    cost: [{ value: valueOf(1000), count: 200 }],
    isOnce: true,
    levelCellType: 'multiplication',
    targetLevel: 3,
    unlockMessage:
      'Multiplication III. A unit of fuel is shaved from each firing — the cell has learned to economise.',
  },
  {
    id: 'multiplication_lvl4',
    kind: 'level',
    name: 'Multiplication IV',
    glyph: 'Ⅳ',
    description: 'Levels every Multiplication to IV. 8 products per firing.',
    cost: [{ value: valueOf(10_000), count: 300 }],
    isOnce: true,
    levelCellType: 'multiplication',
    targetLevel: 4,
    unlockMessage: 'Multiplication IV.',
  },
  {
    id: 'multiplication_lvl5',
    kind: 'level',
    name: 'Multiplication V — Frugal',
    glyph: 'Ⅴ',
    description:
      'Levels every Multiplication to V — the maximum. 16 products per firing. Fuel cost halved.',
    cost: [{ value: valueOf(10_000), count: 3000 }],
    isOnce: true,
    levelCellType: 'multiplication',
    targetLevel: 5,
    unlockMessage:
      'Multiplication V. The fuel cost halves; the player resists every other economic instinct.',
  },

  // Exponentiation levels
  {
    id: 'exponentiation_lvl2',
    kind: 'level',
    name: 'Exponentiation II',
    glyph: 'Ⅱ',
    description: 'Levels every Exponentiation cell to II. 2 powers per firing.',
    cost: [{ value: valueOf(1000), count: 100 }],
    isOnce: true,
    levelCellType: 'exponentiation',
    targetLevel: 2,
    unlockMessage: 'Exponentiation II.',
  },
  {
    id: 'exponentiation_lvl3',
    kind: 'level',
    name: 'Exponentiation III — Fuel Saver',
    glyph: 'Ⅲ',
    description:
      'Levels every Exponentiation to III. 4 powers per firing. Fuel cost reduced by 1 (minimum 1).',
    cost: [{ value: valueOf(10_000), count: 200 }],
    isOnce: true,
    levelCellType: 'exponentiation',
    targetLevel: 3,
    unlockMessage: 'Exponentiation III.',
  },
  {
    id: 'exponentiation_lvl4',
    kind: 'level',
    name: 'Exponentiation IV',
    glyph: 'Ⅳ',
    description: 'Levels every Exponentiation to IV. 8 powers per firing.',
    cost: [{ value: valueOf(100_000), count: 300 }],
    isOnce: true,
    levelCellType: 'exponentiation',
    targetLevel: 4,
    unlockMessage: 'Exponentiation IV.',
  },
  {
    id: 'exponentiation_lvl5',
    kind: 'level',
    name: 'Exponentiation V — Frugal',
    glyph: 'Ⅴ',
    description:
      'Levels every Exponentiation to V — the maximum. 16 powers per firing. Fuel cost halved.',
    cost: [{ value: valueOf(100_000), count: 3000 }],
    isOnce: true,
    levelCellType: 'exponentiation',
    targetLevel: 5,
    unlockMessage: 'Exponentiation V.',
  },

  // -- Pipe leveling DISSOLVED (Phase 6 γ.1) ----------------------------
  // Pipe progression collapses into the Comp ladder; throughput comes
  // from placing parallel pipes (Quantity), not from upgrading them.
  // The 12 lvl-II/III/IV/V pipe entries that lived here are gone.
];

/** Convenient predicate for the UI to route only cell purchases to placement mode. */
export function isCellEntry(entry: LiteratureEntry): entry is LiteratureEntry & { id: CellType } {
  return entry.kind === 'cell';
}

/**
 * Whether a level-upgrade entry is currently visible/purchasable. Returns
 * true when the target's current level is exactly `targetLevel - 1` — i.e.
 * this entry is the NEXT step. Lower-tier upgrades that have already been
 * applied are not "available"; higher-tier ones are not yet reachable.
 *
 * Non-level entries always return true (the function is a no-op for them).
 */
export function isLevelUpgradeAvailable(entry: LiteratureEntry): boolean {
  if (entry.kind !== 'level' || entry.targetLevel === undefined) return true;
  if (entry.levelCellType) {
    return cellLevel(entry.levelCellType) === entry.targetLevel - 1;
  }
  // Pipe leveling dissolved in γ.1 — any lingering `levelPipeMagnitude`
  // entry (shouldn't exist; defensive) is treated as unavailable.
  return false;
}

/**
 * Phase 6: whether a comprehension entry is the *next-unowned* tier.
 * The ladder houses 29 entries (`comp_2` through `comp_30`); the
 * Literature panel shows only the next one so the catalog doesn't
 * visually explode. Equivalent to "this entry's ceiling is exactly
 * twice the player's current comprehension."
 *
 * Non-comprehension entries always return true.
 */
export function isComprehensionEntryAvailable(entry: LiteratureEntry): boolean {
  if (entry.kind !== 'comprehension') return true;
  if (entry.comprehensionLevel === undefined) return false;
  return entry.comprehensionLevel === comprehensionLevel() * 2;
}

/**
 * Phase 6 β.2 (DESIGN §9): whether an entry's `compRequirement` is met
 * by the player's current Comprehension. Pipes use this to stay hidden
 * until comp climbs past their magnitude (the one-tier-lag rule). Other
 * entries with no `compRequirement` always pass.
 */
export function isCompRequirementMet(entry: LiteratureEntry): boolean {
  if (entry.compRequirement === undefined) return true;
  return comprehensionLevel() >= entry.compRequirement;
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
  // Phase 6 β.2 (DESIGN §9): a `compRequirement` field gates purchase
  // beneath the affordability check. Pipes carry one for the one-tier-
  // lag rule; future bot entries will too.
  if (!isCompRequirementMet(entry)) return false;

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

  if (entry.kind === 'level' && entry.targetLevel) {
    if (entry.levelCellType) {
      setCellLevel(entry.levelCellType, entry.targetLevel);
    }
    // Pipe leveling dissolved in γ.1 — `levelPipeMagnitude` no longer
    // routed. Old saves that still reference these entries are stripped
    // in the v15 → v16 migration.
  }

  if (owned === 0 && entry.unlockMessage) {
    showMarginalia(entry.unlockMessage, `unlock_${entry.id}`);
  }
  return true;
}

/** Module re-export of `hasUnlock` so consumers don't all reach into world.ts. */
export { hasUnlock };
