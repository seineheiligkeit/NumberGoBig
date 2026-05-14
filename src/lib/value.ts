/**
 * Value — the unified numeric type for every block on the canvas.
 *
 * Phase 3 introduces number families (negatives, rationals, irrationals,
 * complex). Each is a new variant of this discriminated union; the rest of
 * the codebase consumes Value through this module's helpers and stays
 * variant-agnostic.
 *
 * Variants shipped so far:
 *   - 4.0:  `real`        — Decimal-backed integer or decimal real
 *   - 4.2:  `rational`    — exact `{ num, den }` in canonical (gcd-reduced,
 *                           den > 0) form. Smart ctor `makeRational` collapses
 *                           den===1 results back to `real`, so canonical
 *                           rationals always have den ≥ 2.
 *   - 4.3:  `irrational`  — symbolic `{ symbol, approx }`. Arithmetic *between*
 *                           irrationals or with anything else collapses to a
 *                           real `approx`. Only negation and absolute value
 *                           preserve the symbol (so `-√2` stays distinct
 *                           from `√2` in the Gallery).
 *   - 4.4:  `complex`     — `{ re, im }`. Smart ctor `makeComplex` collapses
 *                           im===0 to real. All combinations of real /
 *                           rational / irrational / complex through any
 *                           operator produce a canonical Value, with
 *                           integer-only exponentiation for complex bases
 *                           (non-integer exponents fall back to the real
 *                           approximation of the modulus).
 *
 * Design rules:
 *   - **Pure.** No DOM / Pixi / store access. Safe to import from anywhere.
 *   - **Immutable.** Operations return new Values; Decimal itself is
 *     effectively immutable for our purposes.
 *   - **No symbolic algebra.** When irrationals meet arithmetic (other
 *     than neg/abs), they collapse to an `approx` decimal — that's an
 *     explicit design decision, not a bug.
 */

import Decimal, { type DecimalSource } from 'break_eternity.js';

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export type Value =
  | { kind: 'real'; n: Decimal }
  | { kind: 'rational'; num: Decimal; den: Decimal }
  | { kind: 'irrational'; symbol: string; approx: Decimal }
  | { kind: 'complex'; re: Decimal; im: Decimal };

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function valueOf(source: DecimalSource): Value {
  return { kind: 'real', n: new Decimal(source) };
}

export const VALUE_ZERO: Value = { kind: 'real', n: Decimal.dZero };
export const VALUE_ONE: Value = { kind: 'real', n: Decimal.dOne };

/** Smart ctor for rationals (see file header). */
export function makeRational(num: Decimal, den: Decimal): Value {
  if (den.eq(Decimal.dZero)) return VALUE_ZERO;

  let n = num;
  let d = den;
  if (d.lt(Decimal.dZero)) {
    n = n.neg();
    d = d.neg();
  }

  const nNum = n.toNumber();
  const dNum = d.toNumber();
  if (
    Number.isFinite(nNum) &&
    Number.isFinite(dNum) &&
    Number.isInteger(nNum) &&
    Number.isInteger(dNum) &&
    Math.abs(nNum) <= Number.MAX_SAFE_INTEGER &&
    dNum <= Number.MAX_SAFE_INTEGER
  ) {
    const g = gcd(Math.abs(nNum), dNum);
    if (g > 1) {
      n = new Decimal(nNum / g);
      d = new Decimal(dNum / g);
    }
  }

  if (d.eq(Decimal.dOne)) return { kind: 'real', n };

  return { kind: 'rational', num: n, den: d };
}

/**
 * Smart constructor for complex. If `im` is zero, returns a `real` instead
 * so canonical complex values always have `im !== 0`. The narrator's
 * "first complex" beat therefore only fires for genuinely complex numbers.
 */
export function makeComplex(re: Decimal, im: Decimal): Value {
  if (im.eq(Decimal.dZero)) return { kind: 'real', n: re };
  return { kind: 'complex', re, im };
}

function gcd(a: number, b: number): number {
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Promotes a real or rational Value to a (num, den) pair. Null for variants
 *  not rationally representable. */
function toRationalParts(v: Value): { num: Decimal; den: Decimal } | null {
  switch (v.kind) {
    case 'real':
      return { num: v.n, den: Decimal.dOne };
    case 'rational':
      return { num: v.num, den: v.den };
    case 'irrational':
    case 'complex':
      return null;
  }
}

/** Promotes any Value to complex coordinates. */
function toComplexParts(v: Value): { re: Decimal; im: Decimal } {
  switch (v.kind) {
    case 'real':
      return { re: v.n, im: Decimal.dZero };
    case 'rational':
      return { re: v.num.div(v.den), im: Decimal.dZero };
    case 'irrational':
      return { re: v.approx, im: Decimal.dZero };
    case 'complex':
      return { re: v.re, im: v.im };
  }
}

/** Best-effort Decimal approximation. For complex, returns the *real part*
 *  — most arithmetic shouldn't reach here for complex (the dispatch routes
 *  complex through the complex branches first). */
function approximate(v: Value): Decimal {
  switch (v.kind) {
    case 'real':
      return v.n;
    case 'rational':
      return v.num.div(v.den);
    case 'irrational':
      return v.approx;
    case 'complex':
      return v.re;
  }
}

// ---------------------------------------------------------------------------
// Arithmetic — variant-aware. Complex takes precedence; then irrational
// collapse; then rational; then real fast-path.
// ---------------------------------------------------------------------------

function anyComplex(a: Value, b: Value): boolean {
  return a.kind === 'complex' || b.kind === 'complex';
}

function anyIrrational(a: Value, b: Value): boolean {
  return a.kind === 'irrational' || b.kind === 'irrational';
}

export function valueAdd(a: Value, b: Value): Value {
  if (anyComplex(a, b)) {
    const ac = toComplexParts(a);
    const bc = toComplexParts(b);
    return makeComplex(ac.re.add(bc.re), ac.im.add(bc.im));
  }
  if (anyIrrational(a, b)) {
    return { kind: 'real', n: approximate(a).add(approximate(b)) };
  }
  if (a.kind === 'real' && b.kind === 'real') {
    return { kind: 'real', n: a.n.add(b.n) };
  }
  const ar = toRationalParts(a)!;
  const br = toRationalParts(b)!;
  return makeRational(ar.num.mul(br.den).add(br.num.mul(ar.den)), ar.den.mul(br.den));
}

export function valueSub(a: Value, b: Value): Value {
  if (anyComplex(a, b)) {
    const ac = toComplexParts(a);
    const bc = toComplexParts(b);
    return makeComplex(ac.re.sub(bc.re), ac.im.sub(bc.im));
  }
  if (anyIrrational(a, b)) {
    return { kind: 'real', n: approximate(a).sub(approximate(b)) };
  }
  if (a.kind === 'real' && b.kind === 'real') {
    return { kind: 'real', n: a.n.sub(b.n) };
  }
  const ar = toRationalParts(a)!;
  const br = toRationalParts(b)!;
  return makeRational(ar.num.mul(br.den).sub(br.num.mul(ar.den)), ar.den.mul(br.den));
}

export function valueMul(a: Value, b: Value): Value {
  if (anyComplex(a, b)) {
    const ac = toComplexParts(a);
    const bc = toComplexParts(b);
    // (a + bi)(c + di) = (ac − bd) + (ad + bc)i
    const re = ac.re.mul(bc.re).sub(ac.im.mul(bc.im));
    const im = ac.re.mul(bc.im).add(ac.im.mul(bc.re));
    return makeComplex(re, im);
  }
  if (anyIrrational(a, b)) {
    return { kind: 'real', n: approximate(a).mul(approximate(b)) };
  }
  if (a.kind === 'real' && b.kind === 'real') {
    return { kind: 'real', n: a.n.mul(b.n) };
  }
  const ar = toRationalParts(a)!;
  const br = toRationalParts(b)!;
  return makeRational(ar.num.mul(br.num), ar.den.mul(br.den));
}

export function valueDiv(a: Value, b: Value): Value {
  if (anyComplex(a, b)) {
    const ac = toComplexParts(a);
    const bc = toComplexParts(b);
    // (a + bi) / (c + di) = ((ac + bd) + (bc − ad)i) / (c² + d²)
    const denom = bc.re.mul(bc.re).add(bc.im.mul(bc.im));
    if (denom.eq(Decimal.dZero)) return VALUE_ZERO;
    const re = ac.re.mul(bc.re).add(ac.im.mul(bc.im)).div(denom);
    const im = ac.im.mul(bc.re).sub(ac.re.mul(bc.im)).div(denom);
    return makeComplex(re, im);
  }
  if (anyIrrational(a, b)) {
    return { kind: 'real', n: approximate(a).div(approximate(b)) };
  }
  const ar = toRationalParts(a)!;
  const br = toRationalParts(b)!;
  return makeRational(ar.num.mul(br.den), ar.den.mul(br.num));
}

export function valuePow(a: Value, b: Value): Value {
  // Complex base with integer exponent — repeated multiplication preserves
  // exactness. Negative exponents invert. Caller is responsible for
  // refusing absurdly large |k| (we cap at 50 here to bound the loop).
  if (anyComplex(a, b)) {
    if (b.kind === 'real' && b.n.isFinite() && Number.isInteger(b.n.toNumber())) {
      const k = b.n.toNumber();
      if (Math.abs(k) <= 50) {
        if (k === 0) return VALUE_ONE;
        const absK = Math.abs(k);
        let result: Value = a.kind === 'complex' ? a : { kind: 'complex', re: toComplexParts(a).re, im: toComplexParts(a).im };
        for (let i = 1; i < absK; i++) {
          result = valueMul(result, a);
        }
        if (k < 0) result = valueDiv(VALUE_ONE, result);
        return result;
      }
    }
    // Non-integer or huge exponent: collapse to a real approximation of the
    // modulus raised to the exponent. Mathematically imprecise but the
    // design notes (DESIGN §6, ROADMAP 4.4) call out integer-only
    // exponentiation for complex initially.
    const ac = toComplexParts(a);
    const mod = ac.re.mul(ac.re).add(ac.im.mul(ac.im)).pow(new Decimal(0.5));
    return { kind: 'real', n: mod.pow(approximate(b)) };
  }
  if (anyIrrational(a, b)) {
    return { kind: 'real', n: approximate(a).pow(approximate(b)) };
  }
  // Integer-exponent fast path on real / rational.
  if (b.kind === 'real' && b.n.isFinite() && Number.isInteger(b.n.toNumber())) {
    const k = b.n.toNumber();
    if (a.kind === 'rational') {
      if (k === 0) return VALUE_ONE;
      if (k > 0) return makeRational(a.num.pow(k), a.den.pow(k));
      return makeRational(a.den.pow(-k), a.num.pow(-k));
    }
    if (a.kind === 'real') {
      return { kind: 'real', n: a.n.pow(b.n) };
    }
  }
  return { kind: 'real', n: approximate(a).pow(approximate(b)) };
}

export function valueNeg(v: Value): Value {
  switch (v.kind) {
    case 'real':
      return { kind: 'real', n: v.n.neg() };
    case 'rational':
      return makeRational(v.num.neg(), v.den);
    case 'irrational':
      return {
        kind: 'irrational',
        symbol: v.symbol.startsWith('-') ? v.symbol.slice(1) : `-${v.symbol}`,
        approx: v.approx.neg(),
      };
    case 'complex':
      return makeComplex(v.re.neg(), v.im.neg());
  }
}

export function valueAbs(v: Value): Value {
  switch (v.kind) {
    case 'real':
      return { kind: 'real', n: v.n.abs() };
    case 'rational':
      return makeRational(v.num.abs(), v.den);
    case 'irrational':
      return {
        kind: 'irrational',
        symbol: v.symbol.startsWith('-') ? v.symbol.slice(1) : v.symbol,
        approx: v.approx.abs(),
      };
    case 'complex':
      // Modulus = √(re² + im²). Generally irrational; we collapse to real
      // approx for 4.4. (A future polish could keep this symbolic.)
      return { kind: 'real', n: v.re.mul(v.re).add(v.im.mul(v.im)).pow(new Decimal(0.5)) };
  }
}

// ---------------------------------------------------------------------------
// Square root — produces real, rational, irrational, or complex.
// ---------------------------------------------------------------------------

function perfectSquareInteger(n: Decimal): number | null {
  const num = n.toNumber();
  if (!Number.isFinite(num)) return null;
  if (!Number.isInteger(num) || num < 0 || num > Number.MAX_SAFE_INTEGER) return null;
  const s = Math.sqrt(num);
  const sr = Math.round(s);
  return sr * sr === num ? sr : null;
}

/**
 * Square root with the Phase 3 semantics:
 *   - Perfect-square non-negative integer → integer real
 *   - Positive non-perfect-square integer → irrational `√k`
 *   - Negative real → complex (0, √|n|).  Slice 4.4 — was refused in 4.3.
 *   - Rational p/q with both terms perfect squares → rational √p/√q
 *   - Anything else → real `approx`
 */
export function valueSqrt(v: Value): Value {
  switch (v.kind) {
    case 'real': {
      if (v.n.lt(Decimal.dZero)) {
        // Slice 4.4 — negative reals route through the complex plane.
        // √(-k) = 0 + √k · i; if k is a perfect square the imaginary part
        // is an integer, otherwise it's a Decimal approx.
        const abs = v.n.abs();
        const sq = perfectSquareInteger(abs);
        if (sq !== null) return makeComplex(Decimal.dZero, new Decimal(sq));
        return makeComplex(Decimal.dZero, abs.pow(new Decimal(0.5)));
      }
      const sq = perfectSquareInteger(v.n);
      if (sq !== null) return valueOf(sq);
      const safe = valueToSafeNumber(v);
      if (safe !== null && Number.isInteger(safe) && safe > 0) {
        return {
          kind: 'irrational',
          symbol: `√${safe}`,
          approx: v.n.pow(new Decimal(0.5)),
        };
      }
      return { kind: 'real', n: v.n.pow(new Decimal(0.5)) };
    }
    case 'rational': {
      const numSq = perfectSquareInteger(v.num);
      const denSq = perfectSquareInteger(v.den);
      if (numSq !== null && denSq !== null) {
        return makeRational(new Decimal(numSq), new Decimal(denSq));
      }
      return { kind: 'real', n: v.num.div(v.den).pow(new Decimal(0.5)) };
    }
    case 'irrational':
      return { kind: 'real', n: v.approx.pow(new Decimal(0.5)) };
    case 'complex':
      // sqrt of a complex is a complex (principal root). Use polar form:
      // sqrt(r e^{iθ}) = √r e^{iθ/2}. Decimal doesn't have atan2 natively,
      // so we approximate via JS numbers — acceptable for 4.4 scope.
      // For (0, 0) we'd already collapse to real(0) by makeComplex, so
      // we don't reach here with both re=0 and im=0.
      {
        const reN = v.re.toNumber();
        const imN = v.im.toNumber();
        const r = Math.hypot(reN, imN);
        const theta = Math.atan2(imN, reN);
        const sr = Math.sqrt(r);
        return makeComplex(
          new Decimal(sr * Math.cos(theta / 2)),
          new Decimal(sr * Math.sin(theta / 2)),
        );
      }
  }
}

// ---------------------------------------------------------------------------
// Comparison & predicates
// ---------------------------------------------------------------------------

export function valueEq(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'real':
      return a.n.eq((b as { n: Decimal }).n);
    case 'rational': {
      const br = b as { num: Decimal; den: Decimal };
      return a.num.eq(br.num) && a.den.eq(br.den);
    }
    case 'irrational': {
      const bi = b as { symbol: string; approx: Decimal };
      return a.symbol === bi.symbol;
    }
    case 'complex': {
      const bc = b as { re: Decimal; im: Decimal };
      return a.re.eq(bc.re) && a.im.eq(bc.im);
    }
  }
}

export function valueLt(a: Value, b: Value): boolean {
  // Complex numbers aren't totally ordered; we compare moduli when one is
  // involved. Same fallback used by `valueExceeds` for pipe/comprehension.
  if (a.kind === 'complex' || b.kind === 'complex') {
    return valueMagnitude(a).lt(valueMagnitude(b));
  }
  if (anyIrrational(a, b)) {
    return approximate(a).lt(approximate(b));
  }
  const ar = toRationalParts(a)!;
  const br = toRationalParts(b)!;
  return ar.num.mul(br.den).lt(br.num.mul(ar.den));
}

export function valueGt(a: Value, b: Value): boolean {
  return valueLt(b, a);
}

export function valueLte(a: Value, b: Value): boolean {
  return !valueGt(a, b);
}

export function valueGte(a: Value, b: Value): boolean {
  return !valueLt(a, b);
}

export function valueIsZero(v: Value): boolean {
  switch (v.kind) {
    case 'real':
      return v.n.eq(Decimal.dZero);
    case 'rational':
      return v.num.eq(Decimal.dZero);
    case 'irrational':
    case 'complex':
      // makeRational / makeComplex collapse zero-cases to real(0).
      return false;
  }
}

export function valueIsOne(v: Value): boolean {
  switch (v.kind) {
    case 'real':
      return v.n.eq(Decimal.dOne);
    case 'rational':
    case 'irrational':
    case 'complex':
      return false;
  }
}

/** True if the Value is a non-negative integer representable as a JS number. */
export function valueIsNonNegativeInteger(v: Value): boolean {
  if (v.kind !== 'real') return false;
  if (v.n.lt(Decimal.dZero)) return false;
  if (!v.n.isFinite()) return false;
  const num = v.n.toNumber();
  return Number.isInteger(num) && num <= Number.MAX_SAFE_INTEGER;
}

/** True if the Value is negative in a meaningful sense. Complex never is. */
export function valueIsNegative(v: Value): boolean {
  switch (v.kind) {
    case 'real':
      return v.n.lt(Decimal.dZero);
    case 'rational':
      return v.num.lt(Decimal.dZero);
    case 'irrational':
      return v.approx.lt(Decimal.dZero);
    case 'complex':
      return false;
  }
}

/** Converts a Value to a safe JS number if it fits, else null. */
export function valueToSafeNumber(v: Value): number | null {
  if (v.kind !== 'real') return null;
  if (!v.n.isFinite()) return null;
  const num = v.n.toNumber();
  if (!Number.isFinite(num)) return null;
  if (Math.abs(num) > Number.MAX_SAFE_INTEGER) return null;
  return num;
}

// ---------------------------------------------------------------------------
// Magnitude
// ---------------------------------------------------------------------------

export function valueMagnitude(v: Value): Decimal {
  switch (v.kind) {
    case 'real':
      return v.n.abs();
    case 'rational':
      return v.num.abs().div(v.den);
    case 'irrational':
      return v.approx.abs();
    case 'complex':
      // Modulus.
      return v.re.mul(v.re).add(v.im.mul(v.im)).pow(new Decimal(0.5));
  }
}

export function valueExceeds(v: Value, ceiling: number): boolean {
  return valueMagnitude(v).gt(new Decimal(ceiling));
}

// ---------------------------------------------------------------------------
// Display & identity
// ---------------------------------------------------------------------------

export function valueLabel(v: Value): string {
  switch (v.kind) {
    case 'real':
      return v.n.toString();
    case 'rational':
      return `${v.num.toString()}/${v.den.toString()}`;
    case 'irrational':
      return v.symbol;
    case 'complex': {
      // Pure-imaginary special cases for legibility.
      const reStr = v.re.toString();
      const imAbs = v.im.abs();
      const imStr = imAbs.eq(Decimal.dOne) ? 'i' : `${imAbs.toString()}i`;
      if (v.re.eq(Decimal.dZero)) {
        return v.im.lt(Decimal.dZero) ? `-${imStr}` : imStr;
      }
      return v.im.lt(Decimal.dZero) ? `${reStr} - ${imStr}` : `${reStr} + ${imStr}`;
    }
  }
}

export function valueKey(v: Value): string {
  switch (v.kind) {
    case 'real':
      return `real:${v.n.toString()}`;
    case 'rational':
      return `rational:${v.num.toString()}/${v.den.toString()}`;
    case 'irrational':
      return `irrational:${v.symbol}`;
    case 'complex':
      return `complex:${v.re.toString()}+${v.im.toString()}i`;
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export type ValueSnapshot =
  | { kind: 'real'; n: string }
  | { kind: 'rational'; num: string; den: string }
  | { kind: 'irrational'; symbol: string; approx: string }
  | { kind: 'complex'; re: string; im: string };

export function valueSnapshot(v: Value): ValueSnapshot {
  switch (v.kind) {
    case 'real':
      return { kind: 'real', n: v.n.toString() };
    case 'rational':
      return { kind: 'rational', num: v.num.toString(), den: v.den.toString() };
    case 'irrational':
      return { kind: 'irrational', symbol: v.symbol, approx: v.approx.toString() };
    case 'complex':
      return { kind: 'complex', re: v.re.toString(), im: v.im.toString() };
  }
}

export function valueRestore(snap: ValueSnapshot): Value {
  switch (snap.kind) {
    case 'real':
      return { kind: 'real', n: new Decimal(snap.n) };
    case 'rational':
      return makeRational(new Decimal(snap.num), new Decimal(snap.den));
    case 'irrational':
      return { kind: 'irrational', symbol: snap.symbol, approx: new Decimal(snap.approx) };
    case 'complex':
      return makeComplex(new Decimal(snap.re), new Decimal(snap.im));
  }
}

export function valueFromLegacyOrSnapshot(input: number | ValueSnapshot): Value {
  if (typeof input === 'number') return valueOf(input);
  return valueRestore(input);
}
