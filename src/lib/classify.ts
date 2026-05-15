/**
 * Number classification — predicates and lookups for the Gallery
 * (Slice 5.1) and forthcoming Filter cells (Slice 5.2). Predicates here
 * share their semantics with `warehouse-rules.ts`, deliberately, so a
 * `prime` filter and a `wh: prime` warehouse agree on which values
 * qualify.
 *
 * All tests reject non-`real` Values and out-of-range integers.
 * Primality uses trial division up to `1e9` (matching warehouse-rules);
 * the perfect-number set is the well-known sequence (6, 28, 496, …).
 *
 * Pure: no DOM, no Pixi, no stores. Safe to import from anywhere.
 */

import { valueToSafeNumber, type Value } from './value';

const PRIME_CHECK_MAX = 1e9;

export function isPrime(v: Value): boolean {
  if (v.kind !== 'real' || !v.n.isFinite()) return false;
  const n = v.n.toNumber();
  if (!Number.isInteger(n) || n < 2 || n > PRIME_CHECK_MAX) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

export function isComposite(v: Value): boolean {
  if (v.kind !== 'real' || !v.n.isFinite()) return false;
  const n = v.n.toNumber();
  if (!Number.isInteger(n) || n < 4 || n > PRIME_CHECK_MAX) return false;
  if (n % 2 === 0) return true;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return true;
  }
  return false;
}

/**
 * The known perfect numbers under 2^53 — the first seven. A perfect
 * number equals the sum of its proper divisors (6 = 1+2+3, 28 = 1+2+4+7+14, …).
 * Higher perfects exist but are astronomical and outside what the
 * current factory can produce.
 */
export const KNOWN_PERFECTS: readonly number[] = [
  6,
  28,
  496,
  8128,
  33_550_336,
  8_589_869_056,
  137_438_691_328,
];

export function isPerfect(v: Value): boolean {
  const n = valueToSafeNumber(v);
  if (n === null) return false;
  return KNOWN_PERFECTS.includes(n);
}

export interface FamousNumber {
  value: number;
  label: string;
  detail: string;
}

/**
 * Curated short list of named integers worth highlighting in the
 * Gallery. The detail strings are written in the narrator's dry-academic
 * register — short, occasionally amused, never theatrical (DESIGN §17).
 * Easy to expand; keep entries integer-valued and under ~10⁹ so the
 * Gallery can render them without scientific notation.
 */
export const FAMOUS_NUMBERS: readonly FamousNumber[] = [
  { value: 0, label: 'zero', detail: 'the additive identity; the empty set; the river itself.' },
  { value: 1, label: 'one', detail: 'the multiplicative identity; the successor of zero.' },
  { value: 2, label: 'two', detail: 'the smallest, and only even, prime.' },
  { value: 3, label: 'three', detail: 'the smallest odd prime; the first triangle.' },
  { value: 6, label: 'six', detail: 'the first perfect number: 1 + 2 + 3 = 1 × 2 × 3.' },
  { value: 12, label: 'twelve', detail: 'a highly composite number — six distinct divisors.' },
  { value: 28, label: 'twenty-eight', detail: 'the second perfect number.' },
  { value: 42, label: 'forty-two', detail: 'The Answer. The question is left as an exercise.' },
  { value: 100, label: 'one hundred', detail: 'the century — 10², a round figure of historical importance.' },
  { value: 144, label: 'gross', detail: '12² — also the twelfth Fibonacci number.' },
  { value: 360, label: 'three hundred sixty', detail: 'degrees in a turn; divisible by 24 distinct integers.' },
  { value: 496, label: 'four hundred ninety-six', detail: 'the third perfect number.' },
  { value: 666, label: 'six hundred sixty-six', detail: 'a triangular number that has worked hard for its reputation.' },
  { value: 1024, label: 'one thousand twenty-four', detail: '2¹⁰ — the kibibyte.' },
  { value: 1729, label: 'Hardy–Ramanujan', detail: '1³ + 12³ = 9³ + 10³ — smallest sum of two cubes two ways.' },
  { value: 6174, label: "Kaprekar's constant", detail: 'the fixed point of the Kaprekar map on four-digit numbers.' },
  { value: 8128, label: 'eight thousand one hundred twenty-eight', detail: 'the fourth perfect number.' },
  { value: 65_536, label: 'sixty-five thousand five hundred thirty-six', detail: '2¹⁶ — the first impossibility.' },
];

const FAMOUS_BY_VALUE = new Map<number, FamousNumber>(
  FAMOUS_NUMBERS.map((f) => [f.value, f] as const),
);

export function famousNumberOf(v: Value): FamousNumber | null {
  const n = valueToSafeNumber(v);
  if (n === null) return null;
  return FAMOUS_BY_VALUE.get(n) ?? null;
}

/**
 * Pulls the integer payload out of a `valueKey` string like `"real:42"`.
 * Returns null for non-real keys or non-integer reals — callers in the
 * Gallery use this to convert the `discoveredValues` set (which stores
 * keys, not Values) back into a clean list of integers to render.
 */
export function integerFromKey(key: string): number | null {
  if (!key.startsWith('real:')) return null;
  const s = key.slice(5);
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}
