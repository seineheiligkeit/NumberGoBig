/**
 * Warehouse rules — predicates that define what a `warehouse-rule` cell
 * accepts (Slice 3.5.4, DESIGN §8).
 *
 * A rule-based warehouse takes ANY block satisfying its predicate and
 * stores it alongside other matched values — `wh<10` happily holds a mix
 * of 1s, 2s, 3s, …, 9s. The same vocabulary will power Filter cells
 * in Phase 4, so the predicate API stays simple and composable.
 *
 * Starter catalog (ROADMAP 3.5.4):
 *   - `lt10`, `lt100`, `lt1000`  — magnitude bounds (small-change wallets)
 *   - `prime`                     — primes only (currency vault for Phase 4)
 *   - `composite`                 — composites only (Factor's natural sink)
 *
 * Notes:
 *   - Magnitude-bound rules use `valueMagnitude`, so a `-5` qualifies for
 *     `< 10` (negatives are real values; their magnitude is what matters
 *     for fuel-style sizing).
 *   - Prime/composite tests only accept positive integer reals. Rationals,
 *     irrationals, complex — none of these have a conventional primality.
 *     The predicate returns false rather than collapsing to an approx.
 *   - Trial division is capped at n ≤ 1e9 for speed. Larger integer reals
 *     fail the test silently — Phase 5 polish can add Miller-Rabin.
 */

import Decimal from 'break_eternity.js';
import { valueIsNegative, valueMagnitude, type Value } from './value.ts';

export interface WarehouseRule {
  id: string;
  /** Short label shown in the cell's centre badge. */
  label: string;
  /** Long-form description for Literature entries and tooltips. */
  description: string;
  /** Predicate: returns true if the value belongs in this warehouse. */
  test: (v: Value) => boolean;
}

const D_TEN = new Decimal(10);
const D_HUNDRED = new Decimal(100);
const D_THOUSAND = new Decimal(1000);

const PRIME_TRIAL_CAP = 1e9;

function isPrimeValue(v: Value): boolean {
  if (v.kind !== 'real' || !v.n.isFinite()) return false;
  const n = v.n.toNumber();
  if (!Number.isInteger(n) || n < 2 || n > PRIME_TRIAL_CAP) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

function isCompositeValue(v: Value): boolean {
  if (v.kind !== 'real' || !v.n.isFinite()) return false;
  const n = v.n.toNumber();
  if (!Number.isInteger(n) || n < 4 || n > PRIME_TRIAL_CAP) return false;
  if (n % 2 === 0) return true;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return true;
  }
  return false;
}

export const WAREHOUSE_RULES: readonly WarehouseRule[] = [
  {
    id: 'lt10',
    label: '< 10',
    description: 'Accepts any block whose magnitude is below 10.',
    test: (v) => valueMagnitude(v).lt(D_TEN),
  },
  {
    id: 'lt100',
    label: '< 100',
    description: 'Accepts any block whose magnitude is below 100.',
    test: (v) => valueMagnitude(v).lt(D_HUNDRED),
  },
  {
    id: 'lt1000',
    label: '< 1000',
    description: 'Accepts any block whose magnitude is below 1000.',
    test: (v) => valueMagnitude(v).lt(D_THOUSAND),
  },
  {
    id: 'prime',
    label: 'prime',
    description: 'Accepts prime natural numbers only.',
    test: isPrimeValue,
  },
  {
    id: 'composite',
    label: 'composite',
    description: 'Accepts composite natural numbers only.',
    test: isCompositeValue,
  },
  {
    // Slice 6.15: the natural fuel reservoir for Inversion. Holds any
    // negative-valued block — produced by the Negation cell, by
    // Subtraction (`0 − n`), or by any operator that yields a negative.
    // The predicate uses `valueIsNegative` to handle every variant
    // uniformly (real, rational with negative num, irrational with
    // `-` symbol prefix). Complex blocks never qualify — no total order
    // on ℂ.
    id: 'negative',
    label: '< 0',
    description: 'Accepts any negative-valued block — fuel for Inversion.',
    test: valueIsNegative,
  },
  {
    // α.4d: irrational predicate — natural sink for Square Root output
    // on non-square inputs. Used as a predicate side-cost on Tetration
    // (the pacing sim's variety-enforcement mechanism) so Square Root
    // gains a productive role beyond mere unlock.
    id: 'irrational',
    label: '√',
    description: 'Accepts irrational-valued blocks (produced by Square Root on non-squares).',
    test: (v) => v.kind === 'irrational',
  },
];

const RULE_BY_ID = new Map(WAREHOUSE_RULES.map((r) => [r.id, r] as const));

export function getWarehouseRule(id: string | null | undefined): WarehouseRule | null {
  if (!id) return null;
  return RULE_BY_ID.get(id) ?? null;
}
