/**
 * Literature catalog — type definitions.
 *
 * The shape of every Shop entry, plus the cost-item discriminated union
 * (value-cost vs predicate-cost) and helper type guards.
 *
 * Lives in `core/` so both the game (`src/lib/literature.ts`) and the
 * pacing sim (`sim/catalog.ts`) consume the same shape. Pure types and
 * pure guards — no runtime state access.
 */

import type { Value } from '../value.ts';
import type { CellType } from '../cell-types.ts';

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

export function isValueItem(item: LiteratureCostItem): item is LiteratureCostValue {
  return 'value' in item;
}

export function isPredicateItem(item: LiteratureCostItem): item is LiteratureCostPredicate {
  return 'ruleId' in item;
}

/** Multi-item cost. Single-cost entries supply a one-element array. */
export type LiteratureCost = readonly LiteratureCostItem[];

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
