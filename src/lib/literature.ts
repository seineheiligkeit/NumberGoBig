/**
 * Literature — game-side purchase mechanics + UI cost formatting.
 *
 * Phase A.4: catalog data (entries, cost ladders, types) lives in
 * `core/catalog/`. This file is the *game-runtime* layer — anything
 * that touches Svelte stores, world state, or marginalia stays here.
 *
 * What's here:
 *   - `purchase`, `canAfford` — run against `world.ts` state.
 *   - `currentCost` — pure cost-scaling math (geometric per repeat).
 *   - `formatCost` / `formatCostItem` / `pluralName` — UI string builders.
 *   - `isLevelUpgradeAvailable` / `isComprehensionEntryAvailable` /
 *     `isCompRequirementMet` — visibility predicates that read live
 *     world state (cell levels, comp ceiling).
 *   - Re-exports of the catalog (types, entries, helpers) so existing
 *     `from './literature'` callers keep working.
 *
 * Sim does NOT consume from this file. It imports the same catalog
 * pieces from `core/catalog/` directly.
 */

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
  valueToSafeNumber,
  type Value,
} from '../../core/value';
import Decimal from 'break_eternity.js';
import { getWarehouseRule } from '../../core/warehouse-rules';

// Catalog re-exports — types, entries, and cost helpers all live in
// `core/catalog/` after Phase A.4.
export type {
  LiteratureCostValue,
  LiteratureCostPredicate,
  LiteratureCostItem,
  LiteratureCost,
  LiteratureKind,
  LiteratureEntry,
} from '../../core/catalog/types';
export { LITERATURE_ENTRIES, isCellEntry } from '../../core/catalog/entries';
export { ladderUnlockCost, compUpgradeCost, pipeCost } from '../../core/catalog/costs';

// Internal type-guard imports (we re-export the types above; the guards
// stay private here because formatCostItem / currentCost / canAfford /
// purchase use them locally).
import {
  isValueItem,
  isPredicateItem,
  type LiteratureCost,
  type LiteratureCostItem,
  type LiteratureCostPredicate,
  type LiteratureEntry,
} from '../../core/catalog/types';

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
