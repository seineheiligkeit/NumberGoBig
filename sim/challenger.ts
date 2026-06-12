// sim/challenger.ts
//
// A CHALLENGER to sim/manager.ts — same honest harness, smarter policy.
//
// The manager is fuel-production-bound by POLICY, not by the economy. It leaves
// three exponential levers on the table:
//
//   1. It never places an EXPONENTIATION cell (it's in the player's toolbar!).
//      Multiplication only CONCENTRATES log-mass — digits(a·b) = digits(a) +
//      digits(b) — while exponentiation MULTIPLIES it: digits(a^b) = b·digits(a).
//   2. It caps op1 at ×1000 (MULT_CAP): +3 digits per op. Merging the two
//      BIGGEST blocks instead compounds the frontier Fibonacci-style.
//   3. It burns only tree-grown fuel. But fuel content = VALUE (exponential in
//      digits) while op work = digits^k (polynomial) — so once the climb is
//      rolling, your own old RESULTS are limitless one-shot fuel, even under
//      the √-overpay law (need V ≥ W²/grade, and the bank grows like 10^d
//      while the need grows like d^4.5/d^6).
//
// The challenger's loop is one greedy rule: every cycle, start the op with the
// LARGEST AFFORDABLE OUTPUT (mult of the two biggest, or exp of the best
// base/exponent pair), where "affordable" means its work can actually be paid —
// a one-shot fuel block exists (V ≥ W²/grade and ≥ grade), or a small chip-set
// covers it, or it's cheap enough to creep at baseRate. A keep-invariant
// forbids strip-mining the bank: a plan is only valid if, after it consumes its
// operands+fuel, the NEXT squaring of its own output is still affordable.
//
// Honesty rules (same as the manager — see HANDOVER learning #8):
//   * 1 action per verb (feed / fuel / place / pipe), budget = rate·t, capped
//     burst (BUDGET_CAP), stacking-aware peel, no free merges, correct
//     placePipe signature.
//   * Pre-built initial factory, FREE before the measured window (the manager's
//     convention) and SMALLER than the manager's: 110 cells vs its 111.
//   * Only toolbar cells: successor / addition / multiplication / exponentiation.
//
// Usage:
//   node sim/challenger.ts                      # head-to-head vs manager at 1/30, 1, 5 /s
//   node sim/challenger.ts --rate 1 --ticks 10000 --trace
//   node sim/challenger.ts --no-exp             # ablation: multiplication-only snowball
//   node sim/challenger.ts --no-vs              # skip the manager comparison runs

import {
  createWorld,
  placeCell,
  placePipe,
  feedOperand,
  injectFuel,
  tick,
  totalScore,
  type World,
  type CellKind,
} from '../core/engine.ts';
import { valueMagnitude, valueMul, valuePow, type Value } from '../core/value.ts';
import {
  DEFAULT_TUNING,
  UNIFIED_TUNING,
  magnitudeDigits,
  operationWork,
  minFuelDenomination,
  scaffoldRequirement,
  unifiedNeed,
  unifiedBand,
  type TimeTuning,
} from '../core/time.ts';
import { runManager } from './manager.ts';
import Decimal from 'break_eternity.js';

// The active run's tuning (set by runChallenger; the sims are single-threaded).
let T: TimeTuning = DEFAULT_TUNING;
const mag = (v: Value) => valueMagnitude(v);
const BUDGET_CAP = 3; // same as the manager: no hoarding idle time into bursts
const CREEP_OK = 150; // ops this cheap may run unfueled (≤ ~300 ticks at amp 0.5)
const MAX_CHIPS = 8; // most chip-fuel actions we'll budget for one op

// --- pool helpers (stacking-aware: peel ONE block per action) ---------------

function peel(w: World, bi: number): Value | null {
  if (bi < 0 || bi >= w.pool.length) return null;
  const b = w.pool[bi];
  if ((b.count ?? 1) > 1) {
    b.count -= 1;
    return b.value;
  }
  return w.pool.splice(bi, 1)[0].value;
}
function pushBack(w: World, v: Value | null): void {
  if (v) w.pool.push({ id: w.nextId++, value: v, x: 0, y: 0, count: 1 });
}
/** Peel the first pool block whose magnitude equals `m` exactly. */
function peelByMag(w: World, m: Decimal): Value | null {
  for (let i = 0; i < w.pool.length; i++) if (mag(w.pool[i].value).eq(m)) return peel(w, i);
  return null;
}

// --- the cost arithmetic the policy plans with (engine-exact) ---------------

/** A fuel block's effective progress for an op of this grade (engine formula). */
function eff(grade: Decimal, v: Decimal): Decimal {
  const p = T.fuelOverpayExp;
  return p >= 1 ? v : grade.pow(1 - p).mul(v.pow(p));
}
/** Fuel magnitude that one-shots `work` in a single inject: eff(V) ≥ W. */
function oneShotNeed(work: Decimal, grade: Decimal): Decimal {
  const p = T.fuelOverpayExp;
  if (p >= 1) return work;
  // grade^(1-p)·V^p ≥ W  →  V ≥ (W / grade^(1-p))^(1/p)
  return work.div(grade.pow(1 - p)).pow(1 / p);
}

// --- a virtual pool snapshot for atomic plan feasibility ---------------------

interface VBlock {
  m: Decimal;
  d: Decimal; // digit count (cached)
  copies: number; // stack count remaining for planning
}
function virtualPool(w: World): VBlock[] {
  const vs: VBlock[] = w.pool.map((b) => {
    const m = mag(b.value);
    return { m, d: magnitudeDigits(b.value), copies: b.count ?? 1 };
  });
  vs.sort((a, b) => (b.m.gt(a.m) ? 1 : b.m.lt(a.m) ? -1 : 0));
  return vs;
}
function vTake(vs: VBlock[], i: number): void {
  vs[i].copies -= 1;
  if (vs[i].copies <= 0) vs.splice(i, 1);
}
function vClone(vs: VBlock[]): VBlock[] {
  return vs.map((v) => ({ m: v.m, d: v.d, copies: v.copies }));
}

/** Can `work` be paid from this (virtual) pool, using only blocks SMALLER (in
 *  digits) than the planned output? (Burning a block bigger than what the op
 *  produces is a net regression — the one true strip-mine.) Returns the fuel
 *  plan: 'oneshot' (the smallest adequate block), 'chips' (≤ MAX_CHIPS
 *  biggest-eff blocks), or 'creep' (cheap enough to run on baseRate). */
function fuelPlan(
  vs: VBlock[],
  work: Decimal,
  grade: Decimal,
  outDigits: Decimal,
): { kind: 'creep' } | { kind: 'oneshot'; m: Decimal } | { kind: 'chips'; ms: Decimal[] } | null {
  if (work.lte(CREEP_OK)) return { kind: 'creep' };
  const usable = vs.filter((v) => v.m.gte(grade) && v.d.lt(outDigits));
  const need = oneShotNeed(work, grade);
  // one-shot: smallest usable block ≥ need
  let best: Decimal | null = null;
  for (const v of usable) {
    if (v.m.gte(need) && (best === null || v.m.lt(best))) best = v.m;
  }
  if (best !== null) return { kind: 'oneshot', m: best };
  // chips: greedily take the highest-eff usable blocks
  const cands = usable
    .flatMap((v) => Array(Math.min(v.copies, MAX_CHIPS)).fill(v.m) as Decimal[])
    .sort((a, b) => (b.gt(a) ? 1 : b.lt(a) ? -1 : 0));
  let acc = Decimal.dZero;
  const ms: Decimal[] = [];
  for (const m of cands) {
    if (ms.length >= MAX_CHIPS) break;
    ms.push(m);
    acc = acc.add(eff(grade, m));
    if (acc.gte(work)) return { kind: 'chips', ms };
  }
  return null;
}

/** Max in-band notes we'll budget for one launch (action thrift). */
const MAX_NOTES = 16;
/** Launch discipline: a scaffolded launch must target at least this multiple of
 *  the current apex's digits. Micro-launches are technically feasible all the
 *  time (tiny S) but they drain the notes and actions the BIG d/α jump needs —
 *  without this gate the agent degenerates into 300+ hops of <1 digit each. */
const LAUNCH_GAIN = 1.5;

/** Can the (virtual) pool pay a scaffolding requirement S in the band
 *  [bandMin, S], largest-first, within MAX_NOTES blocks — and do those notes
 *  also cover the op's TIME work (or is it cheap enough to creep)? */
function scaffoldFeasible(vs: VBlock[], s: Decimal, bandMin: Decimal, grade: Decimal, work: Decimal): boolean {
  let sum = Decimal.dZero;
  let effSum = Decimal.dZero;
  let n = 0;
  for (const v of vs) {
    if (v.m.gt(s) || v.m.lt(bandMin)) continue; // out of band
    for (let c = 0; c < v.copies && n < MAX_NOTES; c++) {
      sum = sum.add(v.m);
      effSum = effSum.add(eff(grade, v.m));
      n++;
      if (sum.gte(s)) break;
    }
    if (sum.gte(s)) break;
  }
  if (sum.lt(s)) return false;
  // the notes themselves must move the clock (or the op can creep)
  return effSum.gte(work) || work.lte(CREEP_OK * 4);
}

// --- the planner -------------------------------------------------------------

interface Plan {
  kind: 'multiplication' | 'exponentiation';
  aMag: Decimal; // operand for port 0 (mult: factor / exp: base)
  bMag: Decimal; // operand for port 1 (mult: factor / exp: exponent)
  outDigits: Decimal;
  work: Decimal;
  grade: Decimal;
}

interface Reserve {
  min: Decimal;
  cap: Decimal;
}
const inReserve = (m: Decimal, reserves: Reserve[]): boolean =>
  reserves.some((r) => m.gte(r.min) && m.lte(r.cap));

/** The greedy decision, scaffolding-aware, in two passes:
 *
 *  1. EXP pass (full pool): among (base, exponent) pairs — bases from the top
 *     classes, exponents from top AND tail (launch exponents are small VALUES
 *     like 2…16) — the largest-output launch whose scaffolding S is payable
 *     in-band (≤ MAX_NOTES notes). A feasible launch always wins.
 *  2. MULT pass (pool minus `reserves` — in-band notes held for an active or
 *     upcoming launch are not operands/fuel): prefer merges whose output lands
 *     IN the mint band (stockpiling launch notes), then the largest merge.
 */
function bestPlan(
  w: World,
  useExp: boolean,
  reserves: Reserve[],
  mintBand: Reserve | null,
  apexD: Decimal,
  minLaunchD: Decimal, // discipline floor for PAID launches (campaign-locked)
): Plan | null {
  const vs0 = virtualPool(w);
  if (vs0.length < 2 && !(vs0.length === 1 && vs0[0].copies >= 2)) return null;

  const evaluate = (pool: VBlock[], kind: Plan['kind'], i: number, j: number): Plan | null => {
    if (i === j && pool[i].copies < 2) return null;
    const vs = vClone(pool);
    const aM = vs[i].m;
    const bM = vs[j].m;
    const maxOperandD = Decimal.max(vs[i].d, vs[j].d);
    vTake(vs, Math.max(i, j));
    if (i !== j) vTake(vs, Math.min(i, j));
    const a: Value = { kind: 'real', n: aM };
    const b: Value = { kind: 'real', n: bM };
    const out = kind === 'multiplication' ? valueMul(a, b) : valuePow(a, b);
    const outDigits = magnitudeDigits(out);
    if (outDigits.lte(maxOperandD)) return null; // must strictly grow past its inputs
    const work = operationWork(out, kind, T);
    const grade = minFuelDenomination(work, T);
    if (T.unifiedCosts) {
      // THE UNIFIED LAW: need = √(output) in the band [need/16, need], pro-rata.
      const need = unifiedNeed(valueMagnitude(out), kind === 'exponentiation' ? 2 : 1);
      const band = unifiedBand(need);
      const mandatory = kind === 'exponentiation' && valueMagnitude(out).gt(1e6);
      // Paid exps below the apex are NOT spam under the unified law — they are
      // the TOWER REBUILD (re-minting operand-class blocks at ⁴√ prices is how
      // the next launch gets funded). Greedy only picks them when nothing
      // bigger is affordable, which is exactly when rebuilding is the move.
      // Free toys (≤10⁶ output) that don't advance the apex stay banned.
      if (kind === 'exponentiation' && !mandatory && outDigits.lte(apexD)) return null;
      if (work.gt(CREEP_OK) || mandatory) {
        // Full coverage before committing operands. (A 0.3 start-fraction was
        // tried — "stream the rest during the burn" — and produced the OPERAND
        // TRAP: the frontier locked inside an op whose remaining notes could
        // only be minted USING the frontier. Wealth imprisoned forever. The
        // real game needs a cancel-op verb before streaming is player-safe.)
        const startFrac = 1;
        let sum = Decimal.dZero;
        let n = 0;
        for (const v of vs) {
          if (v.m.lt(band.min) || v.m.gt(band.cap)) continue;
          for (let c2 = 0; c2 < v.copies && n < MAX_NOTES; c2++) {
            sum = sum.add(v.m);
            n++;
            if (sum.gte(need.mul(startFrac))) break;
          }
          if (sum.gte(need.mul(startFrac))) break;
        }
        if (sum.lt(need.mul(startFrac))) return null;
      }
      return { kind, aMag: aM, bMag: bM, outDigits, work, grade };
    }
    if (kind === 'exponentiation') {
      const s = scaffoldRequirement(valueMagnitude(out), T);
      if (s.gt(Decimal.dZero)) {
        // launch discipline: paid launches must be MILESTONE jumps, not hops —
        // judged against the CAMPAIGN's locked target (so apex creep during
        // stocking can't outrun the minted notes), and always above the apex.
        if (outDigits.lt(minLaunchD) || outDigits.lte(apexD)) return null;
        const bandMin = Decimal.max(grade, s.div(T.scaffoldBand));
        if (!scaffoldFeasible(vs, s, bandMin, grade, work)) return null;
        return { kind, aMag: aM, bMag: bM, outDigits, work, grade };
      }
    }
    if (!fuelPlan(vs, work, grade, outDigits)) return null;
    return { kind, aMag: aM, bMag: bM, outDigits, work, grade };
  };

  // --- pass 1: launches (full pool; exponents include the tail classes) ---
  let bestExp: Plan | null = null;
  if (useExp) {
    const topN = Math.min(10, vs0.length);
    const tailStart = Math.max(topN, vs0.length - 6);
    const candIdx: number[] = [];
    for (let i = 0; i < topN; i++) candIdx.push(i);
    for (let i = tailStart; i < vs0.length; i++) candIdx.push(i);
    for (const i of candIdx) {
      for (const j of candIdx) {
        if (vs0[j].m.lt(2)) continue; // exponent ≥ 2
        const p = evaluate(vs0, 'exponentiation', i, j);
        if (p && (!bestExp || p.outDigits.gt(bestExp.outDigits))) bestExp = p;
      }
    }
  }

  // --- pass 2: merges (reserved notes are untouchable; mint preference) ---
  const vsR = vs0.filter((v) => !inReserve(v.m, reserves));
  let bestMint: Plan | null = null;
  let bestMerge: Plan | null = null;
  if (vsR.length >= 2 || (vsR.length === 1 && vsR[0].copies >= 2)) {
    const candsR = vsR.slice(0, 10);
    for (let i = 0; i < candsR.length; i++) {
      for (let j = i; j < candsR.length; j++) {
        const p = evaluate(vsR, 'multiplication', i, j);
        if (!p) continue;
        const outMag = Decimal.pow(10, p.outDigits.sub(1)); // ~lower bound of the output's magnitude
        if (mintBand && outMag.gte(mintBand.min) && outMag.lte(mintBand.cap)) {
          if (!bestMint || p.outDigits.gt(bestMint.outDigits)) bestMint = p;
        } else if (!bestMerge || p.outDigits.gt(bestMerge.outDigits)) {
          bestMerge = p;
        }
      }
    }
  }

  // The winner: a launch only if it BEATS the best merge outright (ties → mult,
  // so exp cells stay free for real launches and toy exps can't eat the budget
  // at slow action rates — that degeneracy cost a 1/30s run its whole session).
  const mult = bestMint ?? bestMerge;
  if (bestExp && (!mult || bestExp.outDigits.gt(mult.outDigits))) return bestExp;
  return mult;
}

// --- the run -----------------------------------------------------------------

interface Result {
  frontier: Decimal; // biggest single magnitude anywhere
  frontierStr: string;
  digits: Decimal;
  digitsAt75: Decimal; // frontier digits at 75% of the window (stall detector)
  score: Decimal;
  actions: number;
  ops: number;
  exps: number;
  paidExps: number; // scaffolded launches (above the floor) — the real milestones
  /** Experience-curve landmarks: tick each operator first completed + first launch. */
  landmarks: Record<string, number>;
  firstLaunchTick: number;
  /** Tick of EVERY paid launch — the cadence curve the design tunes. */
  launchTicks: number[];
  /** Ink-tax telemetry: final smoothed coverage + final demand (0 when off). */
  inkCoverage: number;
  inkDemand: string;
  /** Session timeline (12 samples): production/burn/build telemetry over time. */
  timeline: {
    t: number;
    digits: string; // frontier digits
    score: string;
    produced: number; // blocks emitted by cells, lifetime
    burned: string; // total fuel magnitude burned (ops + builds + charge)
    ops: number; // hand-ops started
    launches: number; // paid launches so far
    pool: number; // loose entities
    cells: number; // cells BUILT (vs placed — the build-out curve)
    placed: number;
  }[];
}

export function runChallenger(
  rate: number,
  ticks: number,
  opts: { trace?: boolean; useExp?: boolean; tuning?: TimeTuning; fromZero?: boolean } = {},
): Result {
  const { trace = false, useExp = true, tuning = DEFAULT_TUNING, fromZero = false } = opts;
  T = tuning;
  const world = createWorld(T, { stacking: true });
  const hands: number[] = [];
  let millId: number | null = null;
  let ledgerId: number | null = null; // the tax office (ink upkeep)
  let handAdder: number | null = null; // the machining bench (unified bills)

  // Backbone builder; `run` either executes immediately (the pre-built
  // convention) or queues the thunk as one ACTION (from-zero play, where the
  // PLACEMENT ORDER is also the build-slot queue order — successors first, so
  // production flows while the rest of the tree is still being sketched).
  function buildBackbone(depth: number, yBase: number, run: (t: () => void) => void): void {
    const ref: Record<string, number> = {};
    const nSucc = 1 << depth;
    const succ: string[] = [];
    for (let i = 0; i < nSucc; i++) {
      const k = `s${yBase}_${i}`;
      succ.push(k);
      run(() => {
        ref[k] = placeCell(world, 'successor', 0, yBase + i * 12);
      });
    }
    let sc = 0;
    const nextS = () => succ[sc++ % nSucc];
    const build = (level: number, idx: number, slot: string): void => {
      if (level === 0) {
        run(() => {
          ref[slot] = placeCell(world, 'addition', 200, yBase + idx * 40);
        });
        const a0 = nextS(),
          a1 = nextS(),
          a2 = nextS();
        run(() => placePipe(world, ref[a0], 0, ref[slot], 0));
        run(() => placePipe(world, ref[a1], 0, ref[slot], 1));
        run(() => placePipe(world, ref[a2], 0, ref[slot], -1, { fuel: true }));
        return;
      }
      const l = `${slot}L`,
        r = `${slot}R`;
      build(level - 1, idx * 2, l);
      build(level - 1, idx * 2 + 1, r);
      run(() => {
        ref[slot] = placeCell(world, 'multiplication', 200 + level * 160, yBase + idx * 40);
      });
      run(() => placePipe(world, ref[l], 0, ref[slot], 0));
      run(() => placePipe(world, ref[r], 0, ref[slot], 1));
    };
    build(depth, 0, 'root');
  }

  // --- The build PROGRAM. Pre-built mode (the established-factory benchmark):
  //     everything placed and built for free up front. From-zero mode (the
  //     gameplay agent under the LIVE rules): a staged, action-costed program —
  //     each step waits for its frontier gate (exp cells honour the game's 1e9
  //     toolbar unlock), placements queue under the build-slot law, and the
  //     agent fuel-rushes the queue with right-sized blocks.
  const program: { when: () => boolean; thunks: (() => void)[] }[] = [];
  const step = (when: () => boolean): ((t: () => void) => void) => {
    const entry = { when, thunks: [] as (() => void)[] };
    program.push(entry);
    return (t) => entry.thunks.push(t);
  };
  if (fromZero) {
    const always = () => true;
    const r1 = step(always); // the opening: a depth-2 starter + the bench + 2 hand mults
    buildBackbone(2, 0, r1);
    r1(() => {
      handAdder = placeCell(world, 'addition', 1200, -140); // the machining bench
    });
    r1(() => hands.push(placeCell(world, 'multiplication', 1200, 0)));
    r1(() => hands.push(placeCell(world, 'multiplication', 1200, 120)));
    const r2 = step(() => world.peakMagnitude.gte(4096)); // the snowball is rolling → real fuel tree
    buildBackbone(3, 600, r2);
    if (T.unifiedCosts) {
      r2(() => {
        millId = placeCell(world, 'mill', 1400, 260); // bills need right-sizing early
      });
      if (T.upkeepCoeff > 0) {
        r2(() => {
          ledgerId = placeCell(world, 'ledger', 1400, 380); // the rent comes due past 10⁶
        });
      }
    }
    if (useExp) {
      // exp arrives when its first bill (1e6) is plausibly machinable —
      // unified: shortly past a million; legacy: the 1e9 toolbar milestone.
      const r3 = step(() => world.peakMagnitude.gte(T.unifiedCosts ? 1.2e6 : 1e9));
      r3(() => hands.push(placeCell(world, 'exponentiation', 1400, 0)));
      r3(() => hands.push(placeCell(world, 'exponentiation', 1400, 120)));
      if (!T.unifiedCosts) {
        r3(() => {
          millId = placeCell(world, 'mill', 1400, 260); // the note right-sizer
        });
      }
    }
    const r4 = step(() => world.peakMagnitude.gte(1e12)); // mid-game: deepen the farm
    buildBackbone(4, 1400, r4);
  } else {
    const run = (t: () => void): void => t();
    buildBackbone(5, 0, run); // 95 cells → 2^32 roots
    buildBackbone(2, 600, run); // 11 cells → 16s, flowing within ~60 ticks
    for (let i = 0; i < 2; i++) hands.push(placeCell(world, 'multiplication', 1200, i * 120));
    if (useExp) for (let i = 0; i < 2; i++) hands.push(placeCell(world, 'exponentiation', 1400, i * 120));
    while ([...world.cells.values()].some((c) => !c.built)) tick(world, 1); // free pre-build
  }

  let budget = 0;
  let actions = 0;
  let ops = 0;
  let exps = 0;
  let paidExps = 0;
  const act = (fn: () => void): boolean => {
    if (budget < 1) return false;
    budget -= 1;
    actions++;
    fn();
    return true;
  };

  const frontier = (): Decimal => {
    let b = Decimal.dZero;
    for (const bl of world.pool) b = Decimal.max(b, mag(bl.value));
    for (const c of world.cells.values()) {
      for (const o of c.operands) if (o) b = Decimal.max(b, mag(o));
      if (c.op) for (const e of c.op.emits) b = Decimal.max(b, mag(e.value));
    }
    return b;
  };

  /** Service one working hand cell. Scaffolded ops (a launch): pay the notes —
   *  the LARGEST in-band block each action (fewest actions); the band is the
   *  only thing the op accepts anyway. Plain ops: inject the smallest one-shot,
   *  else the best chip if it buys ≥ 15% of what remains. */
  function serviceWorking(id: number): boolean {
    const c = world.cells.get(id)!;
    if (!c.op) return false;
    const remaining = c.op.work.sub(c.op.progress);
    const needPay = c.op.fuelRequired.sub(c.op.fuelPaid);
    if (remaining.lte(0) && needPay.lte(0)) return false;
    const grade = c.op.grade;
    const sc = c.op.scaffold;
    let bi = -1;
    if (c.op.unifiedNeed && sc) {
      // UNIFIED: pay the largest in-band block (pro-rata — fewest actions).
      // Skip near-done optional ops (the clock will finish them).
      const fuelLeft = Decimal.max(needPay, c.op.unifiedNeed.mul(remaining).div(c.op.work));
      if (fuelLeft.lt(c.op.unifiedNeed.mul(0.05))) return false;
      for (let i = 0; i < world.pool.length; i++) {
        const m = mag(world.pool[i].value);
        if (m.lt(sc.min) || m.gt(sc.cap)) continue;
        if (bi < 0 || m.gt(mag(world.pool[bi].value))) bi = i;
      }
      if (bi < 0) return false;
      const f0 = peel(world, bi);
      if (!f0) return false;
      if (!act(() => injectFuel(world, id, f0))) {
        pushBack(world, f0);
        return false;
      }
      return true;
    }
    if (sc) {
      // largest in-band note (pays requirement AND clock fastest per action)
      for (let i = 0; i < world.pool.length; i++) {
        const m = mag(world.pool[i].value);
        if (m.lt(sc.min) || m.gt(sc.cap)) continue;
        if (bi < 0 || m.gt(mag(world.pool[bi].value))) bi = i;
      }
      // once the requirement is paid, only keep feeding if it moves the clock
      if (bi >= 0 && needPay.lte(0) && eff(grade, mag(world.pool[bi].value)).lt(remaining.mul(0.15))) bi = -1;
    } else {
      if (remaining.lte(0)) return false;
      const need = oneShotNeed(remaining, grade);
      // never burn a block bigger than what this op will produce (net regression)
      let outD = Decimal.dZero;
      for (const e of c.op.emits) outD = Decimal.max(outD, magnitudeDigits(e.value));
      const usable = (i: number): Decimal | null => {
        const m = mag(world.pool[i].value);
        return m.gte(grade) && magnitudeDigits(world.pool[i].value).lt(outD) ? m : null;
      };
      // smallest usable block that one-shots the REMAINING work
      for (let i = 0; i < world.pool.length; i++) {
        const m = usable(i);
        if (m && m.gte(need) && (bi < 0 || m.lt(mag(world.pool[bi].value)))) bi = i;
      }
      if (bi < 0) {
        // chip: the highest-eff usable block, if it meaningfully advances the op
        let ci = -1;
        for (let i = 0; i < world.pool.length; i++) {
          const m = usable(i);
          if (m && (ci < 0 || m.gt(mag(world.pool[ci].value)))) ci = i;
        }
        if (ci >= 0 && eff(grade, mag(world.pool[ci].value)).gte(remaining.mul(0.15))) bi = ci;
      }
    }
    if (bi < 0) return false;
    const f = peel(world, bi);
    if (!f) return false;
    if (!act(() => injectFuel(world, id, f))) {
      pushBack(world, f);
      return false;
    }
    return true;
  }

  const isIdle = (id: number): boolean => {
    const c = world.cells.get(id)!;
    return c.built && c.op === null && c.operands.every((o) => o === null);
  };

  /** The STICKY launch campaign: when stocking begins, the note band is LOCKED
   *  to the apex at that moment. A target re-derived every action chases its
   *  own tail — merges move the apex, the (narrow, ~1.8-digit) band moves past
   *  the minted notes, and the launch never fires. Sticky targeting is what a
   *  deliberate player does: pick the jump, mint its notes, LAUNCH, repeat. */
  let campaign: { refApexD: Decimal; sStar: Decimal; bandLo: Decimal } | null = null;

  /** Notes held for an active (or staged) launch, plus — once past the toy
   *  region — the mint band for the NEXT launch from the current apex: those
   *  blocks are reserved from the mult planner so merges can't eat them. */
  function currentReserves(): { reserves: Reserve[]; mintBand: Reserve | null } {
    const reserves: Reserve[] = [];
    let mintBand: Reserve | null = null;
    // Outstanding material bills reserve their bands — merges must not eat
    // the very block that pays a bill.
    if (T.unifiedCosts) {
      for (const c of world.cells.values()) {
        if (c.materialNeed) reserves.push({ min: c.materialNeed.min, cap: c.materialNeed.max });
      }
    }
    for (const id of hands) {
      const c = world.cells.get(id)!;
      if (c.op?.scaffold && c.op.fuelPaid.lt(c.op.fuelRequired)) reserves.push(c.op.scaffold);
      else if (c.kind === 'exponentiation' && c.op === null && c.operands.every((o) => o !== null)) {
        // launch staged but not started — project its band so the same-tick
        // mult planning can't eat the notes it is about to need
        const out = valuePow(c.operands[0]!, c.operands[1]!);
        const s = scaffoldRequirement(valueMagnitude(out), T);
        if (s.gt(Decimal.dZero)) reserves.push({ min: s.div(T.scaffoldBand), cap: s });
      }
    }
    if (useExp && T.scaffoldCoeff > 0) {
      const apex = frontier();
      const apexD = magnitudeDigits({ kind: 'real', n: apex });
      // stockpile only past the toy region (~2× the floor's digits)
      const mintStart = 2 * Math.max(1, Math.ceil(Math.log10(Math.max(10, T.scaffoldFloor))));
      const expIdle = hands.some((id) => world.cells.get(id)!.kind === 'exponentiation' && isIdle(id));
      if (expIdle && apexD.gte(mintStart)) {
        // (Re)open a campaign only when none exists or the apex has outgrown
        // the locked target (the old launch would no longer be a milestone).
        if (!campaign || apexD.gte(campaign.refApexD.mul(LAUNCH_GAIN))) {
          const targetMag = Decimal.pow(10, apexD.mul(LAUNCH_GAIN));
          const sStar = T.unifiedCosts ? unifiedNeed(targetMag, 2) : scaffoldRequirement(targetMag, T);
          const ratio = T.unifiedCosts ? 16 : T.scaffoldBand;
          campaign = sStar.gt(Decimal.dZero)
            ? { refApexD: apexD, sStar, bandLo: sStar.div(ratio) }
            : null;
        }
        if (campaign) {
          const band: Reserve = { min: campaign.bandLo, cap: campaign.sStar };
          reserves.push(band);
          let have = Decimal.dZero;
          for (const b of world.pool) {
            const m = mag(b.value);
            if (m.gte(band.min) && m.lte(band.cap)) have = have.add(m.mul(b.count ?? 1));
          }
          if (have.lt(campaign.sStar)) mintBand = band;
        }
      }
    }
    return { reserves, mintBand };
  }

  /** Plan the globally best affordable op, then start it on an idle hand cell
   *  of the PLAN's kind (2 feed actions) — so when budget is scarce, the
   *  biggest op gets it, whatever cell type that needs. */
  function startBest(): boolean {
    if (budget < 2) return false; // atomic: both feeds in one burst
    const expIdle = useExp && hands.some((id) => world.cells.get(id)!.kind === 'exponentiation' && isIdle(id));
    const multIdle = hands.some((id) => world.cells.get(id)!.kind === 'multiplication' && isIdle(id));
    if (!expIdle && !multIdle) return false;
    const { reserves, mintBand } = currentReserves();
    const apexD = magnitudeDigits({ kind: 'real', n: frontier() });
    // Paid-launch floor: the campaign's LOCKED target (slightly relaxed), so a
    // launch whose notes are already minted stays valid under apex creep.
    const minLaunchD = campaign
      ? Decimal.max(apexD.add(1), campaign.refApexD.mul(LAUNCH_GAIN).mul(0.95))
      : apexD.mul(LAUNCH_GAIN);
    const plan = bestPlan(world, expIdle, reserves, mintBand, apexD, minLaunchD);
    if (!plan) return false;
    if (plan.kind === 'multiplication' && !multIdle) return false;
    const id = hands.find((h) => world.cells.get(h)!.kind === plan.kind && isIdle(h))!;
    const a = peelByMag(world, plan.aMag);
    if (!a) return false;
    const b = peelByMag(world, plan.bMag);
    if (!b) {
      pushBack(world, a);
      return false;
    }
    if (!act(() => feedOperand(world, id, 0, a))) {
      pushBack(world, a);
      pushBack(world, b);
      return false;
    }
    if (!act(() => feedOperand(world, id, 1, b))) {
      pushBack(world, b);
      return false;
    }
    ops++;
    if (plan.kind === 'exponentiation') {
      exps++;
      // a PAID launch (above the scaffolding/notes floor) is a real milestone;
      // sub-floor toys are free and uncounted as achievements
      const isPaid = T.unifiedCosts
        ? plan.outDigits.gt(7) // unified notes floor: outputs above 10⁶
        : T.scaffoldCoeff > 0 && plan.outDigits.gt(Math.log10(Math.max(10, T.scaffoldFloor)) + 1);
      if (isPaid) {
        paidExps++;
        campaign = null; // launched — the next campaign re-derives from the new apex
      }
    }
    return true;
  }

  // --- From-zero verbs: lay out the program (1 action per place/pipe, gated
  //     by frontier milestones) and fuel-rush the build queue. ---
  let stepIdx = 0;
  let thunkIdx = 0;
  function placeNext(): boolean {
    while (stepIdx < program.length) {
      const s = program[stepIdx];
      if (thunkIdx >= s.thunks.length) {
        if (stepIdx + 1 < program.length && program[stepIdx + 1].when()) {
          stepIdx++;
          thunkIdx = 0;
          continue;
        }
        return false; // drained; next step's gate not open yet
      }
      if (budget < 1) return false;
      const thunk = s.thunks[thunkIdx];
      if (!act(thunk)) return false;
      thunkIdx++;
      return true;
    }
    return false;
  }
  /** MILL for notes: when a campaign's band is unfilled and merges can't land
   *  in the (narrow) band, feed the Mill the smallest oversized block — one
   *  pass splits a block in (S, 16S] into 16 perfectly in-band notes; bigger
   *  blocks chain down in further passes. THE Mill verb of the live game. */
  function millForNotes(mintBand: Reserve | null): boolean {
    if (!campaign || !mintBand || millId === null) return false;
    const m = world.cells.get(millId);
    if (!m || !m.built || m.op !== null || m.operands[0] !== null) return false;
    const sStar = campaign.sStar;
    let bi = -1;
    let biM: Decimal | null = null;
    for (let i = 0; i < world.pool.length; i++) {
      const v = mag(world.pool[i].value);
      // oversized for the band, but ONE ÷16 pass lands its pieces inside it
      if (v.gt(sStar) && v.lte(sStar.mul(16)) && (biM === null || v.lt(biM))) {
        bi = i;
        biM = v;
      }
    }
    if (bi < 0) return false;
    const f = peel(world, bi);
    if (!f) return false;
    if (!act(() => feedOperand(world, millId!, 0, f))) {
      pushBack(world, f);
      return false;
    }
    return true;
  }

  /** Fund the tax office: keep the ledger stocked with ~a minute of rent in
   *  in-band blocks. One action deposits a WHOLE pool stack (mirrors the
   *  player's drag-drop), so a healthy small-number economy covers the ink
   *  with a few actions per minute — the cost of holding wealth is real but
   *  never frantic. Largest-in-band stack first (fewest trips). */
  function fundLedger(): boolean {
    if (T.upkeepCoeff <= 0 || ledgerId === null) return false;
    const led = world.cells.get(ledgerId);
    if (!led || !led.built || world.inkDemand.lte(0)) return false;
    const cap = world.inkDemand.mul(T.upkeepBandRatio);
    let held = Decimal.dZero;
    for (const e of led.store) {
      const m = mag(e.value);
      if (m.lte(cap)) held = held.add(m.mul(e.count));
    }
    if (held.gte(world.inkDemand.mul(60))) return false; // a minute buffered — enough
    // The rent must never eat a reserved note: skip blocks inside any active
    // scaffold/bill/mint band (rent and launch notes COMPETE for the same
    // denominations — that contention is the game; this is the arbitration).
    const { reserves, mintBand } = currentReserves();
    const isReserved = (m: Decimal): boolean => {
      if (mintBand && m.gte(mintBand.min) && m.lte(mintBand.cap)) return true;
      return reserves.some((r) => m.gte(r.min) && m.lte(r.cap));
    };
    let bi = -1;
    let best = Decimal.dZero; // stack VALUE (magnitude × count) — biggest deposit per action
    for (let i = 0; i < world.pool.length; i++) {
      const m = mag(world.pool[i].value);
      if (m.lt(Decimal.dOne) || m.gt(cap) || isReserved(m)) continue;
      const worth = m.mul(world.pool[i].count ?? 1);
      if (bi < 0 || worth.gt(best)) {
        bi = i;
        best = worth;
      }
    }
    if (bi < 0) return false;
    const stack = world.pool[bi];
    world.pool.splice(bi, 1);
    const ok = act(() => {
      for (let k = 0; k < (stack.count ?? 1); k++) feedOperand(world, ledgerId!, 0, stack.value);
    });
    if (!ok) world.pool.push(stack); // out of budget — restore untouched
    return ok;
  }

  /** Pay outstanding MATERIAL bills (unified law): a one-block deposit in the
   *  tight band [min, max]. Route order: an in-band pool block → MILL an
   *  oversized one down (16ths) → MULT a pair into the band → grow toward it
   *  with the hand ADDER (binary-fill — addition's job: making things FIT). */
  function payBills(): boolean {
    if (!T.unifiedCosts) return false;
    for (const c of world.cells.values()) {
      if (!c.materialNeed) continue;
      const { min, max } = c.materialNeed;
      // 1) direct: the smallest in-band pool block
      let bi = -1;
      for (let i = 0; i < world.pool.length; i++) {
        const m = mag(world.pool[i].value);
        if (m.gte(min) && m.lte(max) && (bi < 0 || m.lt(mag(world.pool[bi].value)))) bi = i;
      }
      if (bi >= 0) {
        const f = peel(world, bi);
        if (f && act(() => injectFuel(world, c.id, f))) return true;
        if (f) pushBack(world, f);
        return false;
      }
      // 2) mill: a block whose sixteenth lands in the band
      if (millId !== null) {
        const mill = world.cells.get(millId);
        if (mill?.built && !mill.op && mill.operands[0] === null) {
          for (let i = 0; i < world.pool.length; i++) {
            const m = mag(world.pool[i].value);
            if (m.gte(min.mul(16)) && m.lte(max.mul(16))) {
              const f = peel(world, i);
              if (f && act(() => feedOperand(world, millId!, 0, f))) return true;
              if (f) pushBack(world, f);
              return false;
            }
          }
        }
      }
      // 3) mult a pair into the band (the squaring pool usually has the factors)
      // — pair routes are ATOMIC: both feeds in one burst, or a half-staged
      // cell deadlocks the bench (the bug this comment commemorates).
      if (budget < 2) return false;
      const mc = hands.find((h) => {
        const hc = world.cells.get(h);
        return hc?.kind === 'multiplication' && hc.built && !hc.op && hc.operands.every((o) => o === null);
      });
      if (mc !== undefined) {
        const vs = virtualPool(world).slice(0, 14);
        for (let i = 0; i < vs.length; i++) {
          for (let j = i; j < vs.length; j++) {
            if (i === j && vs[i].copies < 2) continue;
            const prod = vs[i].m.mul(vs[j].m);
            if (prod.gte(min) && prod.lte(max)) {
              const a2 = peelByMag(world, vs[i].m);
              if (!a2) return false;
              const b2 = peelByMag(world, vs[j].m);
              if (!b2) {
                pushBack(world, a2);
                return false;
              }
              if (!act(() => feedOperand(world, mc, 0, a2))) {
                pushBack(world, a2);
                pushBack(world, b2);
                return false;
              }
              if (!act(() => feedOperand(world, mc, 1, b2))) {
                pushBack(world, b2);
                return false;
              }
              return true;
            }
          }
        }
      }
      // 4) adder binary-fill: take the largest sub-band block, add the largest
      //    partner that stays ≤ max — monotone progress toward the band.
      if (handAdder !== null) {
        const ad = world.cells.get(handAdder);
        // recovery: a half-staged pair (operand 0 only) just needs its partner
        if (ad?.built && !ad.op && ad.operands[0] !== null && ad.operands[1] === null) {
          const staged = mag(ad.operands[0]!);
          let rM: Decimal | null = null;
          for (let i = 0; i < world.pool.length; i++) {
            const m = mag(world.pool[i].value);
            if (staged.add(m).lte(max) && (rM === null || m.gt(rM))) rM = m;
          }
          if (rM !== null) {
            const r3b = peelByMag(world, rM);
            if (r3b && act(() => feedOperand(world, handAdder!, 1, r3b))) return true;
            if (r3b) pushBack(world, r3b);
          }
          return false;
        }
        if (ad?.built && !ad.op && ad.operands.every((o) => o === null)) {
          let ai = -1;
          for (let i = 0; i < world.pool.length; i++) {
            const m = mag(world.pool[i].value);
            if (m.lt(min) && (ai < 0 || m.gt(mag(world.pool[ai].value)))) ai = i;
          }
          if (ai >= 0) {
            const accM = mag(world.pool[ai].value);
            let bM: Decimal | null = null;
            for (let i = 0; i < world.pool.length; i++) {
              if (i === ai && (world.pool[i].count ?? 1) < 2) continue;
              const m = mag(world.pool[i].value);
              if (accM.add(m).lte(max) && (bM === null || m.gt(bM))) bM = m;
            }
            if (bM !== null) {
              const a3 = peel(world, ai);
              if (!a3) return false;
              const b3 = peelByMag(world, bM);
              if (!b3) {
                pushBack(world, a3);
                return false;
              }
              if (!act(() => feedOperand(world, handAdder, 0, a3))) {
                pushBack(world, a3);
                pushBack(world, b3);
                return false;
              }
              if (!act(() => feedOperand(world, handAdder, 1, b3))) {
                pushBack(world, b3);
                return false;
              }
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /** Rush the build-queue HEAD with a right-sized block (build fuel is 1:1 and
   *  grade-agnostic; surplus past completion is wasted, so prefer the smallest
   *  block that finishes it — capped at 8× to avoid torching real product). */
  function rushBuilds(): boolean {
    let head: ReturnType<typeof getCell> = null;
    for (const c of world.cells.values()) {
      if (!c.built && !c.materialNeed) {
        // unpaid cells are payBills' job — fuel-rushing them just bounces
        head = c;
        break;
      }
    }
    if (!head) return false;
    const remaining = head.buildWork.sub(head.buildProgress);
    if (remaining.lte(2)) return false; // about to finish anyway
    let bi = -1;
    let biM: Decimal | null = null;
    for (let i = 0; i < world.pool.length; i++) {
      const m = mag(world.pool[i].value);
      if (m.gte(remaining) && m.lte(remaining.mul(8)) && (biM === null || m.lt(biM))) {
        bi = i;
        biM = m;
      }
    }
    if (bi < 0) {
      // no one-shot: chip with the biggest block ≤ remaining, if it's meaningful
      for (let i = 0; i < world.pool.length; i++) {
        const m = mag(world.pool[i].value);
        if (m.lte(remaining) && m.gte(Decimal.max(4, remaining.mul(0.25))) && (biM === null || m.gt(biM))) {
          bi = i;
          biM = m;
        }
      }
    }
    if (bi < 0) return false;
    const f = peel(world, bi);
    if (!f) return false;
    const id = head.id;
    if (!act(() => injectFuel(world, id, f))) {
      pushBack(world, f);
      return false;
    }
    return true;
  }

  const sample = Math.max(1, Math.floor(ticks / 24));
  if (trace) {
    console.log(`\nChallenger trace — ${rate} action/s, ${ticks} ticks:`);
    console.log('     t |        frontier        |  digits  | pool | actions | ops(exp)');
  }

  let digitsAt75 = Decimal.dZero;
  const t75 = Math.floor(ticks * 0.75);
  const timeline: Result['timeline'] = [];
  const tlSample = Math.max(1, Math.floor(ticks / 12));
  // Experience-curve landmarks: the tick each operator kind first COMPLETES,
  // and the first paid launch — the "minutes to each stage" the design tunes.
  const landmarks: Record<string, number> = {};
  const pendingKinds = new Set(['addition', 'multiplication', 'mill', 'exponentiation']);
  let firstLaunchTick = 0;
  const launchTicks: number[] = [];
  for (let t = 1; t <= ticks; t++) {
    budget = Math.min(BUDGET_CAP, budget + rate);
    if (t === t75) digitsAt75 = magnitudeDigits({ kind: 'real', n: frontier() });
    if (t % tlSample === 0) {
      let built = 0;
      for (const c of world.cells.values()) if (c.built) built++;
      timeline.push({
        t,
        digits: magnitudeDigits({ kind: 'real', n: frontier() }).toString(),
        score: totalScore(world).toString(),
        produced: world.produced,
        burned: world.burned.toString(),
        ops,
        launches: paidExps,
        pool: world.pool.length,
        cells: built,
        placed: world.cells.size,
      });
    }
    // 1) keep working hand ops fed (largest work first — that's the frontier op)
    let guard = 0;
    let acted = true;
    while (budget >= 1 && acted && guard++ < 50) {
      acted = false;
      // 0) from-zero: lay out the next piece of the factory (placement order
      //    IS the build queue — the program is the build-order strategy)
      if (fromZero && placeNext()) {
        acted = true;
        continue;
      }
      // 0.5) unified: pay/machine outstanding material bills (the critical path)
      if (payBills()) {
        acted = true;
        continue;
      }
      const working = hands
        .map((id) => world.cells.get(id)!)
        .filter((c) => c.built && c.op && c.op.work.gt(c.op.progress))
        .sort((a, b) => (b.op!.work.gt(a.op!.work) ? 1 : -1));
      for (const c of working) {
        if (serviceWorking(c.id)) {
          acted = true;
          break;
        }
      }
      if (acted) continue;
      // 1.5) the rent: an underfunded ledger throttles everything — top it up.
      // AFTER working ops: a started mandatory op holds operands hostage (a
      // deadlock if starved); a rent dip is merely a throttle (recoverable).
      if (fundLedger()) {
        acted = true;
        continue;
      }
      // 2) start the globally best affordable op on a matching idle hand cell
      if (startBest()) acted = true;
      // 3) campaign stocking: mill an oversized block into in-band notes
      if (!acted && millForNotes(currentReserves().mintBand)) acted = true;
      // 4) from-zero: spend leftover budget rushing the build queue
      if (!acted && fromZero && rushBuilds()) acted = true;
    }
    tick(world, 1);
    if (pendingKinds.size > 0) {
      for (const c of world.cells.values()) {
        if (c.built && pendingKinds.has(c.kind)) {
          landmarks[c.kind] = t;
          pendingKinds.delete(c.kind);
        }
      }
    }
    if (firstLaunchTick === 0 && paidExps > 0) firstLaunchTick = t;
    while (launchTicks.length < paidExps) launchTicks.push(t);
    if (trace && t % sample === 0) {
      const f = frontier();
      console.log(
        `  ${String(t).padStart(5)} | ${f.toString().padStart(22)} | ${magnitudeDigits({ kind: 'real', n: f }).toString().padStart(8)} | ${String(world.pool.length).padStart(4)} | ${String(actions).padStart(7)} | ${ops}(${exps})`,
      );
    }
  }

  const f = frontier();
  return {
    frontier: f,
    frontierStr: f.toString(),
    digits: magnitudeDigits({ kind: 'real', n: f }),
    digitsAt75,
    score: totalScore(world),
    actions,
    ops,
    exps,
    paidExps,
    landmarks,
    firstLaunchTick,
    launchTicks,
    inkCoverage: world.inkCoverage,
    inkDemand: world.inkDemand.toString(),
    timeline,
  };
}

// --- CLI ----------------------------------------------------------------------

function main(): void {
  let rate: number | null = null;
  let ticks = 10000;
  let trace = false;
  let useExp = true;
  let vs = true;
  let scaffold = DEFAULT_TUNING.scaffoldCoeff;
  let alpha = DEFAULT_TUNING.scaffoldExp;
  let band = DEFAULT_TUNING.scaffoldBand;
  let floor = DEFAULT_TUNING.scaffoldFloor;
  let slots = DEFAULT_TUNING.buildSlots;
  let carry = DEFAULT_TUNING.accelChargeCarry;
  let fromZero = false;
  let unified = false;
  let writeSpeed = 0; // digits/tick write-time floor; 0 = off
  let upkeep = 0; // ink-tax coeff; 0 = off
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--rate') rate = Number(a[++i]);
    else if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--trace') trace = true;
    else if (a[i] === '--no-exp') useExp = false;
    else if (a[i] === '--no-vs') vs = false;
    else if (a[i] === '--scaffold') scaffold = Number(a[++i]); // coeff C; 0 = off
    else if (a[i] === '--alpha') alpha = Number(a[++i]);
    else if (a[i] === '--band') band = Number(a[++i]);
    else if (a[i] === '--floor') floor = Number(a[++i]);
    else if (a[i] === '--slots') slots = Number(a[++i]); // build slots; 0 = unlimited
    else if (a[i] === '--from-zero') fromZero = true;
    else if (a[i] === '--unified') unified = true; // THE UNIFIED LAW (UNIFIED_TUNING)
    else if (a[i] === '--write-speed') writeSpeed = Number(a[++i]); // digits/tick floor; 0 = off
    else if (a[i] === '--upkeep') upkeep = Number(a[++i]); // ink-tax coeff; 0 = off
    else if (a[i] === '--live') {
      // the LIVE game's exact rules (GAME_TUNING): scaffolding + powered
      // logistics + one starting build slot — the gameplay agent's benchmark
      scaffold = 1;
      carry = 1;
      slots = 1;
    }
  }
  const tuning: TimeTuning = unified
    ? { ...UNIFIED_TUNING, writeSpeed, upkeepCoeff: upkeep }
    : {
        ...DEFAULT_TUNING,
        scaffoldCoeff: scaffold,
        scaffoldExp: alpha,
        scaffoldBand: band,
        scaffoldFloor: floor,
        buildSlots: slots,
        accelChargeCarry: carry,
        writeSpeed,
      };
  const scLabel = unified
    ? ' · THE UNIFIED LAW' +
      (writeSpeed > 0 ? ` · WRITE ${writeSpeed} d/s` : '') +
      (upkeep > 0 ? ` · INK TAX ×${upkeep}` : '') +
      (fromZero ? ' · FROM ZERO' : '')
    : (scaffold > 0 ? ` · SCAFFOLDING C=${scaffold} α=${alpha} band=${band}` : '') +
      (slots > 0 ? ` · SLOTS ${slots}+milestones` : '') +
      (fromZero ? ' · FROM ZERO' : '');
  const fmtN = (x: number) =>
    !Number.isFinite(x) ? '>1e308' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');

  if (rate !== null) {
    console.log(
      `Challenger @ ${rate} action/s, ${ticks} ticks${useExp ? '' : ' · NO-EXP ablation'}${scLabel} (110 pre-built cells vs manager's 111):`,
    );
    const r = runChallenger(rate, ticks, { trace, useExp, tuning, fromZero });
    console.log(
      `\n  frontier ${r.frontierStr} (${r.digits.toString()} digits) | score ${r.score.toString()} | ${r.actions} actions | ${r.ops} hand-ops (${r.exps} exp, ${r.paidExps} paid launches)`,
    );
    const lm = (k: string): string => (r.landmarks[k] ? `${(r.landmarks[k] / 60).toFixed(1)}m` : '—');
    console.log(
      `  LANDMARKS  first adder ${lm('addition')} · first MULT ${lm('multiplication')} · mill ${lm('mill')} · first EXP ${lm('exponentiation')} · first paid launch ${r.firstLaunchTick ? (r.firstLaunchTick / 60).toFixed(1) + 'm' : '—'}`,
    );
    console.log(
      `  LAUNCH CADENCE  ${r.launchTicks.length ? r.launchTicks.map((lt) => (lt / 60).toFixed(0) + 'm').join(' → ') : '(none)'}`,
    );
    if (tuning.upkeepCoeff > 0)
      console.log(`  INK  final coverage ${(r.inkCoverage * 100).toFixed(0)}% · demand ${r.inkDemand}/tick`);
    console.log('\n  SESSION TELEMETRY (cumulative):');
    console.log('      t |  digits |     score     | cells(built/placed) | produced | burned (mag) | ops | launches | pool');
    console.log('  ------+---------+---------------+---------------------+----------+--------------+-----+----------+-----');
    for (const row of r.timeline) {
      console.log(
        `  ${String(row.t).padStart(5)} | ${row.digits.padStart(7)} | ${row.score.length > 13 ? row.score.slice(0, 10) + '…' : row.score.padStart(13)} | ${`${row.cells}/${row.placed}`.padStart(19)} | ${String(row.produced).padStart(8)} | ${row.burned.length > 12 ? row.burned.slice(0, 9) + '…' : row.burned.padStart(12)} | ${String(row.ops).padStart(3)} | ${String(row.launches).padStart(8)} | ${row.pool}`,
      );
    }
    return;
  }

  console.log(`Challenger vs manager — same engine, same ${ticks}-tick window, same action budget.`);
  console.log(`Challenger pre-builds 110 cells (manager: 111).${scLabel || ' Locked economy (DEFAULT_TUNING).'}\n`);
  console.log('  rate    | manager frontier | challenger frontier (digits)        | hand-ops(exp)');
  console.log('  --------+------------------+-------------------------------------+--------------');
  for (const r of [1 / 30, 1, 5]) {
    const label = r >= 1 ? `${r}/s` : `1/${Math.round(1 / r)}s`;
    const m = vs ? runManager(r, ticks, { tuning }) : { frontier: NaN };
    const c = runChallenger(r, ticks, { useExp, tuning });
    console.log(
      `  ${label.padStart(6)} | ${fmtN(m.frontier).padStart(16)} | ${c.frontierStr.padStart(24)} (${c.digits.toString()} d) | ${c.ops}(${c.exps})`,
    );
  }
}

// Only run the CLI when invoked directly — importing this module (e.g. from
// sim/scaffold-sweep.ts, which reuses runChallenger) must NOT trigger the runs.
if (process.argv[1]?.endsWith('challenger.ts')) main();
