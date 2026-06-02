/**
 * Pure set operations on `'set'` Values (V4 — the Set-Theoretic Foundations).
 *
 * The Set layer is *logic*: these functions are pure and total, mirroring the
 * arithmetic helpers in `value.ts`. A set is a `Value` (`makeSet` canonical:
 * distinct + sorted by `valueKey`), so set-blocks drag, pipe and store like
 * any number; `setCardinality` (the Count cell) is the one bridge back into
 * the number/economy layer.
 *
 * No DOM / Pixi / store access — safe to import anywhere.
 */

import { makeSet, valueKey, valueOf, type Value } from './value';

/** Largest base-set size we'll materialise a power set for (2^n elements).
 *  The Power-set cell gates by Comprehension too; this is a hard safety cap. */
export const POWERSET_BASE_CAP = 22;

function elementsOf(v: Value): readonly Value[] {
  return v.kind === 'set' ? v.elements : [];
}

export function setUnion(a: Value, b: Value): Value {
  return makeSet([...elementsOf(a), ...elementsOf(b)]);
}

export function setIntersect(a: Value, b: Value): Value {
  const bk = new Set(elementsOf(b).map(valueKey));
  return makeSet(elementsOf(a).filter((e) => bk.has(valueKey(e))));
}

export function setDifference(a: Value, b: Value): Value {
  const bk = new Set(elementsOf(b).map(valueKey));
  return makeSet(elementsOf(a).filter((e) => !bk.has(valueKey(e))));
}

export function setSymDiff(a: Value, b: Value): Value {
  return setUnion(setDifference(a, b), setDifference(b, a));
}

/** Count — the bridge into the number layer. |A| as a real Value. */
export function setCardinality(a: Value): Value {
  return valueOf(elementsOf(a).length);
}

/** Wrap a value in a one-element set: `{v}`. */
export function setSingleton(v: Value): Value {
  return makeSet([v]);
}

/** Unfold a natural `n` into the set `{0, 1, …, n-1}` (its cardinality is n —
 *  the set ↔ number duality). Members are the plain numbers, not nested von
 *  Neumann sets, to keep it legible. */
export function setUnfold(n: number): Value {
  const els: Value[] = [];
  for (let i = 0; i < n; i++) els.push(valueOf(i));
  return makeSet(els);
}

/** Power set P(A) — the set of all subsets. |P(A)| = 2^|A| (Cantor's
 *  explosion engine). Returns null if the base is too large to materialise;
 *  callers gate by Comprehension first. */
export function powerSet(a: Value): Value | null {
  const els = elementsOf(a);
  if (els.length > POWERSET_BASE_CAP) return null;
  const subsets: Value[] = [];
  const total = 1 << els.length;
  for (let mask = 0; mask < total; mask++) {
    const sub: Value[] = [];
    for (let i = 0; i < els.length; i++) {
      if (mask & (1 << i)) sub.push(els[i]);
    }
    subsets.push(makeSet(sub));
  }
  return makeSet(subsets);
}
