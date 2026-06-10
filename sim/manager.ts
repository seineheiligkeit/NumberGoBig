// sim/manager.ts
//
// A MANAGING agent with a HUMAN ACTION BUDGET — the tuning lens.
//
// Principle we're tuning toward (the player's words): idling is always fine and
// satisfying (the free river makes Total Score rise no matter what), but ACTIVE
// interaction is always *more efficient*, so there's always something worth
// doing — without demanding robotic APM. To measure that, we cap the agent's
// manual actions (place / pipe / feed / fuel / remove) to a realistic rate:
// 1 tick = 1 second of play, so ~1 action/sec is a fast human. Banked budget is
// capped (you can't time-travel actions), so idle time isn't hoarded into a burst.
//
// Each manual action = 1 budget. We sweep the rate from idle-ish to "instant"
// (superhuman) and report how far the FRONTIER (biggest single number) climbs.
// The gap between rates IS the value of active play.
//
// Usage:
//   node sim/manager.ts                 # sweep rates over a fixed window
//   node sim/manager.ts --rate 1 --ticks 20000 --trace

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
import { valueMagnitude, type Value } from '../core/value.ts';
import { DEFAULT_TUNING, fuelTax, magnitudeDigits, type TimeTuning } from '../core/time.ts';
import Decimal from 'break_eternity.js';

const mag = (v: Value) => valueMagnitude(v);
const BUDGET_CAP = 3; // can't hoard idle time into a burst of actions

/** Remove ONE block from pool index `bi`. With stacking on the entry may be a
 *  stack — peel one off (decrement count) rather than splice the whole pile,
 *  which would discard the rest. One action still moves one block, as for a human. */
function peel(w: World, bi: number): Value | null {
  if (bi < 0) return null;
  const b = w.pool[bi];
  if ((b.count ?? 1) > 1) { b.count -= 1; return b.value; }
  return w.pool.splice(bi, 1)[0].value;
}
function takeLargest(w: World, max = Infinity): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value).toNumber();
    if (m <= max && (bi < 0 || mag(w.pool[i].value).gt(mag(w.pool[bi].value)))) bi = i;
  }
  return peel(w, bi);
}
function takeSmallest(w: World): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) if (bi < 0 || mag(w.pool[i].value).lt(mag(w.pool[bi].value))) bi = i;
  return peel(w, bi);
}
/** Largest loose block whose value is ≤ cap (a "moderate multiplier", not the frontier). */
function takeModerate(w: World, cap: number): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value).toNumber();
    if (m >= 2 && m <= cap && (bi < 0 || mag(w.pool[i].value).gt(mag(w.pool[bi].value)))) bi = i;
  }
  return peel(w, bi);
}
/** Smallest loose block whose value ≥ floor (grade-matched fuel — minimal waste,
 *  but needs many actions to fill a big op). The "spread" strategy's choice. */
function takeFuel(w: World, floor: Decimal): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value);
    if (m.gte(floor) && (bi < 0 || m.lt(mag(w.pool[bi].value)))) bi = i;
  }
  return peel(w, bi);
}
/** Biggest loose block whose value ≥ floor (≥grade). The "concentrate" choice:
 *  one big fuel block finishes a (digits³) op in ~one action AND recycles a
 *  stranded result into progress instead of letting it rot in the pool. */
function takeFuelBig(w: World, floor: Decimal): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value);
    if (m.gte(floor) && (bi < 0 || m.gt(mag(w.pool[bi].value)))) bi = i;
  }
  return peel(w, bi);
}
/** Pay a magnitude fuel-TAX efficiently: the SMALLEST loose block that is ≥ the
 *  remaining tax (so we don't torch a far bigger number on a small tax), and if
 *  none is big enough, the biggest available (chip away). Always ≥ grade, and
 *  strictly below `cap` (the reigning frontier) so we never burn the champion —
 *  it's reserved as the next operand. This is the fuel-tax era's core choice:
 *  recycle a right-sized chunk of production back as fuel. */
function takeTaxFuel(w: World, floor: Decimal, need: Decimal, cap: number): Value | null {
  let fitI = -1; // smallest block in [max(floor,need), cap)
  let bigI = -1; // biggest block in [floor, cap)
  const lo = Decimal.max(floor, need);
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value);
    if (m.toNumber() >= cap) continue;
    if (m.gte(lo) && (fitI < 0 || m.lt(mag(w.pool[fitI].value)))) fitI = i;
    if (m.gte(floor) && (bigI < 0 || m.gt(mag(w.pool[bigI].value)))) bigI = i;
  }
  return peel(w, fitI >= 0 ? fitI : bigI);
}
/** Biggest loose block with floor ≤ value < cap. Used to pick the largest
 *  recyclable sibling (below the reigning frontier) worth milling into tax-fuel. */
function takeBigInRange(w: World, floor: Decimal, cap: number): Value | null {
  let bi = -1;
  for (let i = 0; i < w.pool.length; i++) {
    const m = mag(w.pool[i].value);
    if (m.gte(floor) && m.toNumber() < cap && (bi < 0 || m.gt(mag(w.pool[bi].value)))) bi = i;
  }
  return peel(w, bi);
}
function pushBack(w: World, v: Value | null): void {
  if (v) w.pool.push({ id: w.nextId++, value: v, x: 0, y: 0, count: 1 });
}
/** Safety only: a human can't hold unlimited loose blocks. With stacking on this
 *  never fires (the pool is a handful of stacks). NOT a free merge. */
const POOL_HARD_CAP = 4000;
/** Deep-study instrumentation, collected every run (cheap). Read by sim/study.ts. */
export interface Stats {
  feed: number; fuel: number; build: number; mill: number; // actions by category
  fuelMagBurned: Decimal; // total fuel-MAGNITUDE consumed (the real tax bite / score sink)
  budgetGranted: number; // total action-budget handed out over the run (capped/tick)
  idleTicks: number; // ticks the agent had < 1 budget (rate-limited, can't act)
  productiveTicks: number; // ticks it spent ≥1 feed/fuel action
  fuelStarveTicks: number; // ticks a working op wanted fuel but found none ≥ grade
  unspentTicks: number; // ticks it had budget left over after managing (APM not absorbed)
  buildingTicks: number; // ticks with ≥1 cell still under construction
  opsCompleted: number; // frontier-mult op completions detected (multi-tick ops)
  droppedValue: Decimal; droppedCount: number; // value discarded at the pool cap (pure waste)
  looseValue: Decimal; // total value sitting in the loose pool at the end (stranded)
  pool: { digits: number; count: number; mag: Decimal }[]; // final pool composition (stacks)
  trajectory: { t: number; frontier: number; score: number; loose: number; trees: number; mults: number }[];
}
interface Result { frontier: number; score: number; actions: number; cells: number; trees: number; mults: number; stats: Stats }

export type Strategy = 'spread' | 'concentrate';

/** Every knob the managing agent exposes. All optional — the defaults ARE the
 *  current best-play strategy (deep "smart" fuel + a wide 16-mult frontier). */
export interface ManagerOpts {
  trace?: boolean; // print a sampled progress trace
  stacking?: boolean; // loose-block stacking (mirrors the live game)
  strategy?: Strategy; // fuel selection + default width: spread (best) | concentrate (dead end)
  fuelTrees?: number; // initial fuel-tree count (instant/free); auto-fuel adds more under pressure
  autoWidth?: boolean; // GRADUAL width-scaling — off: adding mults mid-climb steals op0 from the
  //                      leader and underperforms a fixed wide start (N_FRONTIER=16). For repro only.
  fuelDepth?: number; // FIXED squaring depth when smartFuel is off (3 → 256-grade, 4 → 65536, …)
  smartFuel?: boolean; // scale fuel depth with the frontier so one block ≈ one op (no overkill, no starvation)
  mults?: number; // initial frontier-mult count (0 → strategy default: 16 spread / 1 concentrate)
  autoFuel?: boolean; // auto-build more fuel trees under sustained starvation
  tuning?: TimeTuning; // cost-law overrides (e.g. fuelLaw experiments); defaults to DEFAULT_TUNING
  fuelFactory?: boolean; // under a fuel tax, also hand-feed the fuel TREE's own taxed mults from the
  //                        pool (they have no fuel pipe). Measures whether the action budget can
  //                        sustain a fully-forced-fuel factory — i.e. whether fuel MUST be piped.
  milling?: boolean; // the fuel-tax loop: MILL frontier-scale siblings down to ~tax-size pieces and
  //                    pay each amplifier's tax from them (the only way — tax-fuel is too big to pipe).
  ladder?: boolean; // the fuel-LADDER loop: K tiers, tier i sits at frontier^(α^i) (climbs slower via a
  //                   smaller op1), so tier i's output magnitude == tier (i-1)'s tax → a 1:1 fuel chain
  //                   anchored on the free base. The faithful test of "fuel chases numbers".
}
// NB: a Mill (additive splitter) was tested as a fuel source and REJECTED — milling
// is score-conserved while the frontier grows by multiplication, so you can't
// fragment your way up: forced milling collapsed the climb 2.7e126 → 1.7e7. The
// Mill's role is spatial delivery (move/liquefy frozen blocks), not efficiency.

export function runManager(rate: number, ticks: number, opts: ManagerOpts = {}): Result {
  const {
    trace = false,
    stacking = true,
    strategy = 'spread',
    fuelTrees = 1,
    autoWidth = false,
    fuelDepth = 3,
    smartFuel = true,
    mults = 0,
    autoFuel = true,
    tuning = DEFAULT_TUNING,
    fuelFactory = false,
    milling = false,
    ladder = false,
  } = opts;
  const alpha = tuning.fuelTaxExp; // ladder geometry: tier i at frontier^(alpha^i)
  const taxFloorMag = Math.max(1, tuning.fuelTaxFloor);
  // Stacking on mirrors the live game: un-piped output piles into one movable
  // stack, so the agent peels fuel off a pile and nothing is discarded — and the
  // pool stays a handful of entities instead of needing a (cheating) free merge.
  const world = createWorld(tuning, { stacking });
  let budget = 0;
  let actions = 0;
  const stats: Stats = {
    feed: 0, fuel: 0, build: 0, mill: 0, fuelMagBurned: Decimal.dZero, budgetGranted: 0,
    idleTicks: 0, productiveTicks: 0, fuelStarveTicks: 0, unspentTicks: 0, buildingTicks: 0,
    opsCompleted: 0, droppedValue: Decimal.dZero, droppedCount: 0,
    looseValue: Decimal.dZero, pool: [], trajectory: [],
  };
  const act = (fn: () => void): boolean => {
    if (budget < 1) return false;
    budget -= 1;
    actions++;
    fn();
    return true;
  };

  // --- The idle baseline: an AUTO-PIPED backbone that runs with zero actions.
  // A balanced multiplication tree (successors → adders → squaring mults), all
  // wired, that steadily spills its root product (~65,536) into the loose pool.
  // Left alone (rate 0) it keeps producing → score rises → idle is fine. Built
  // "for free" here: this is the factory you've already set up; we measure the
  // value of ONGOING management on top of it.
  const placePiped = (kind: CellKind, x: number, y: number): number => placeCell(world, kind, x, y);
  // Build a depth-3 squaring fuel backbone (successors → leaf adders → squaring
  // mults; root spills 256-grade fuel). `run` executes each placement — either
  // immediately (the initial, already-set-up factory) or by pushing it onto the
  // action queue (auto-scaled expansion, which then builds over real time). Pipe
  // thunks resolve cell ids from `ref` at run time, so deferred building works.
  function buildBackbone(depth: number, yBase: number, run: (t: () => void) => void): void {
    const ref: Record<string, number> = {};
    const nSucc = 1 << depth;
    const succ: string[] = [];
    for (let i = 0; i < nSucc; i++) {
      const k = `s${yBase}_${i}`;
      succ.push(k);
      run(() => { ref[k] = placePiped('successor', 0, yBase + i * 12); });
    }
    let sc = 0;
    const nextS = () => succ[sc++ % nSucc];
    const build = (level: number, idx: number, slot: string): void => {
      if (level === 0) {
        run(() => { ref[slot] = placePiped('addition', 200, yBase + idx * 40); });
        const a0 = nextS(), a1 = nextS(), a2 = nextS();
        run(() => placePipe(world, ref[a0], 0, ref[slot], 0));
        run(() => placePipe(world, ref[a1], 0, ref[slot], 1));
        run(() => placePipe(world, ref[a2], 0, ref[slot], -1, { fuel: true }));
        return;
      }
      const l = `${slot}L`, r = `${slot}R`;
      build(level - 1, idx * 2, l);
      build(level - 1, idx * 2 + 1, r);
      run(() => { ref[slot] = placePiped('multiplication', 200 + level * 160, yBase + idx * 40); });
      run(() => placePipe(world, ref[l], 0, ref[slot], 0));
      run(() => placePipe(world, ref[r], 0, ref[slot], 1));
    };
    build(depth, 0, 'root'); // root spills its product (depth 3 → 256s) loose
  }
  // Auto-scaling fuel plant. Start with `fuelTrees` instant backbone(s) — the
  // factory you've already set up. Under sustained fuel starvation the agent
  // BUILDS another (action-costed, via the queue; it then constructs over real
  // time), so fuel production self-scales to the digits³-growing demand. This is
  // the honest "build a wider plant and keep it fed" lever — no knob required.
  const queue: (() => void)[] = [];
  let treesBuilt = fuelTrees;
  let yOff = fuelTrees * 400;
  let starve = 0;
  let starvedThisTick = false; // set in manageCell when a working op finds no fuel
  const MAX_TREES = 24; // safety bound (build cost escalates per cell anyway)
  const STARVE_TRIGGER = 80; // sustained unfuelled-op ticks before expanding
  // Fuel grade should track the climb: a frontier op's work is ~digits(result)³,
  // and one fuel block finishes it iff the block's value ≥ that work. The tree
  // root is 2^(2^depth), so the depth that just covers the current op work is
  // ceil(log2(log2(work))) — deepen as the frontier grows, no sooner (deeper =
  // overkill waste + a pricier tree). Capped at 6 (depth 7 is huge + slow).
  function smartFuelDepth(): number {
    const fr = frontier();
    const dig = fr > 1 ? Math.log10(fr) : 1;
    const work = Math.pow(dig + 3, 3);
    const depth = Math.ceil(Math.log2(Math.max(2, Math.log2(Math.max(2, work)))));
    return Math.max(3, Math.min(6, depth));
  }
  // The initial tree is built instantly (free, the factory you already have), so
  // make it generously deep (5 → covers up to ~1e1900 with one block per op).
  const initialDepth = smartFuel ? 5 : fuelDepth;
  for (let k = 0; k < fuelTrees; k++) buildBackbone(initialDepth, k * 400, (t) => t());
  function queueFuelTree(): void {
    const d = smartFuel ? Math.max(5, smartFuelDepth()) : fuelDepth;
    buildBackbone(d, yOff, (t) => queue.push(t));
    yOff += 400;
    treesBuilt++;
  }
  // ONE frontier multiplication, grown INCREMENTALLY: each pass multiplies the
  // current frontier by a moderate block (×≤1000), so the frontier's digits
  // grow ~linearly per action (a smooth gradient) instead of doubling (a cliff).
  // op0 = the frontier (largest loose); op1 = a moderate multiplier.
  // N PARALLEL frontier-builders — more APM keeps more of them fed/fuelled, so
  // active play can absorb extra actions (the factory-width APM gradient).
  // SPREAD fans value across 4 builders (absorbs more APM, but fragments the
  // frontier → regresses at high rates). CONCENTRATE funnels everything into ONE
  // frontier and out-fuels its (digits³-growing) op — strategy-test's winner.
  // 16 frontier mults is the empirical sweet spot with deep fuel (each cell runs
  // at baseRate FOR FREE in parallel, so width is free throughput): the peak at
  // both STEADY (2.7e126 vs 3.1e85 at 4) and FAST (2.9e135 vs 1.2e86), neutral at
  // SLOW (rate-limited). Beyond ~16 a single tree's fuel dilutes and it regresses.
  // The ladder: K tiers × a few mults. Tier 0 is the climbing frontier; lower
  // tiers sit at frontier^(α^i) and supply tier (i-1)'s tax. fmults = tier 0 so
  // the existing frontier/ops instrumentation keeps working.
  const LADDER_K = 7;
  const MULTS_PER_TIER = 3;
  const tierMults: number[][] = [];
  const N_FRONTIER = mults > 0 ? mults : strategy === 'spread' ? 16 : 1;
  const fmults: number[] = [];
  const millIds: number[] = [];
  if (ladder) {
    for (let i = 0; i < LADDER_K; i++) {
      const row: number[] = [];
      for (let j = 0; j < MULTS_PER_TIER; j++) row.push(placePiped('multiplication', 1100 + i * 130, (j - 1) * 70));
      tierMults.push(row);
    }
    fmults.push(...tierMults[0]); // tier 0 = the frontier, for the stats
  } else {
    for (let i = 0; i < N_FRONTIER; i++) fmults.push(placePiped('multiplication', 1100, (i - (N_FRONTIER - 1) / 2) * 90));
    // Mills (fuel-tax loop): shred frontier-scale siblings down to ~tax-size fuel.
    const N_MILLS = 4;
    if (milling) for (let i = 0; i < N_MILLS; i++) millIds.push(placePiped('mill', 1500, (i - (N_MILLS - 1) / 2) * 90));
  }
  const MULT_CAP = 1000; // each multiply grows the frontier by at most ×1000
  // Auto-scaling frontier WIDTH — the symmetric lever to fuel-tree scaling. When
  // the agent has APM and material it can't use (budget left over while the pool
  // piles up and it is NOT fuel-starved), the frontier itself is the bottleneck,
  // so it BUILDS another multiplication (1 action + build time). Gated to spread
  // (concentrate stays a fixed single-frontier probe). The two control loops
  // co-scale: more mults raise fuel demand, which in turn triggers fuel-tree
  // building — the factory grows in both dimensions, bounded by the caps.
  let frontierCount = N_FRONTIER;
  let widthPressure = 0;
  const MAX_FRONTIER = 16;
  const WIDTH_TRIGGER = 2; // sustained unspent-APM ticks before adding a mult (only when
  //                          --auto-width is on; the default starts wide at N_FRONTIER=16)
  function queueFrontierMult(): void {
    const y = 1100 + frontierCount * 60;
    frontierCount++;
    queue.push(() => { fmults.push(placePiped('multiplication', 1100, y)); });
  }
  // Build everything instantly (the factory is already set up).
  while ([...world.cells.values()].some((c) => !c.built)) tick(world, 1);

  function manageCell(fm: number): boolean {
    const cell = world.cells.get(fm)!;
    if (cell.op === null) {
      if (cell.operands[0] === null) {
        const front = takeLargest(world);
        if (front && mag(front).gte(2)) { if (!act(() => feedOperand(world, fm, 0, front))) { pushBack(world, front); return false; } stats.feed++; return true; }
        pushBack(world, front); return false;
      } else if (cell.operands[1] === null) {
        const m = takeModerate(world, MULT_CAP);
        if (m) { if (!act(() => feedOperand(world, fm, 1, m))) { pushBack(world, m); return false; } stats.feed++; return true; }
        return false;
      }
      return false;
    }
    // Op working. Completion now needs BOTH time (progress≥work) and the fuel
    // tax (fuelPaid≥fuelRequired). Skip a fully-satisfied op (fuelling it just
    // wastes the block + action — the worst high-APM waste).
    const op = cell.op;
    const timeDone = op.progress.gte(op.work);
    const taxRemaining = op.fuelRequired.sub(op.fuelPaid);
    const taxDone = taxRemaining.lte(0);
    if (timeDone && taxDone) return false;
    // Pick the fuel block:
    //  - tax outstanding → recycle a right-sized sub-frontier block to pay it
    //    (the fuel-tax era's defining move; reserves the champion as op0);
    //  - only time left → the old behaviour (spread sips small, concentrate grabs big).
    const f = !taxDone
      ? takeTaxFuel(world, op.grade, taxRemaining, frontier())
      : (strategy === 'concentrate' ? takeFuelBig : takeFuel)(world, op.grade);
    if (f) { if (!act(() => injectFuel(world, fm, f))) { pushBack(world, f); return false; } stats.fuel++; stats.fuelMagBurned = stats.fuelMagBurned.add(mag(f)); starve = Math.max(0, starve - 4); return true; }
    starve++; // wanted to fuel a working op but nothing usable — real fuel pressure
    starvedThisTick = true;
    return false;
  }

  function manage(): void {
    // 1) Expansion first: spend actions constructing any queued fuel-tree cells
    //    and pipes (a real action + build-time cost, like a player going wide).
    while (budget >= 1 && queue.length) { if (act(queue.shift()!)) stats.build++; }
    // 1.5) Forced-fuel factory (tax era): the fuel TREE's own multipliers are
    //    taxed too but have no fuel pipe, so hand-feed any that are tax-starved
    //    from the pool (smallest grade block, to spare big blocks for the
    //    frontier). This costs actions FIRST — if it eats the budget, the factory
    //    can't be hand-fed and fuel must be PIPED. Only active under a tax.
    if (fuelFactory && (world.tuning.fuelTaxCoeff > 0 || world.tuning.amplifierBaseRateScale < 1)) {
      for (const c of world.cells.values()) {
        if (budget < 1) break;
        if (c.kind !== 'multiplication' || fmults.includes(c.id) || !c.built || !c.op) continue;
        if (c.op.progress.gte(c.op.work) && c.op.fuelPaid.gte(c.op.fuelRequired)) continue; // fully done
        const f = takeFuel(world, c.op.grade);
        if (!f) continue;
        if (act(() => injectFuel(world, c.id, f))) { stats.fuel++; stats.fuelMagBurned = stats.fuelMagBurned.add(mag(f)); }
        else pushBack(world, f);
      }
    }
    // 2) Manage the frontier(s).
    let progressed = true;
    while (budget >= 1 && progressed) {
      progressed = false;
      for (const fm of fmults) {
        if (budget < 1) break;
        if (manageCell(fm)) progressed = true;
      }
    }
    // 2.5) Tend the mills (fuel-tax loop): keep them fed with frontier-scale
    //    siblings, shredding them toward ~tax-size pieces. We only mill blocks
    //    well ABOVE the current tax (mag > taxMag·16) so a pass yields pieces ≥
    //    taxMag (good tax-fuel) rather than over-milling into useless dust. Pieces
    //    still too big get re-fed next pass → a natural cascade down to tax grade.
    if (milling && world.tuning.fuelTaxCoeff > 0 && millIds.length) {
      const fr = frontier();
      const taxMag = fuelTax(new Decimal(fr).mul(MULT_CAP), world.tuning);
      if (taxMag.gt(0)) {
        const remillFloor = taxMag.mul(16);
        for (const mid of millIds) {
          if (budget < 1) break;
          const m = world.cells.get(mid);
          if (!m || !m.built || m.op) continue; // skip a busy mill
          const blk = takeBigInRange(world, remillFloor, fr);
          if (!blk) continue;
          if (act(() => feedOperand(world, mid, 0, blk))) stats.mill++;
          else pushBack(world, blk);
        }
      }
    }
    // 3) Fuel self-scale: under sustained fuel starvation, build another fuel
    //    tree. NB with smart (deep) fuel one tree already finishes ops in ~1
    //    action, so this rarely fires — and over-building is actively harmful
    //    (a 99-cell tree's later copies hit the build-cost wall and never finish,
    //    burning actions for nothing). Fuel quantity is not the deep-fuel bottleneck.
    if (autoFuel && starve > STARVE_TRIGGER && queue.length === 0 && treesBuilt < MAX_TREES) {
      queueFuelTree();
      starve = 0;
    }
    // 4) Width self-scale (spread): if APM is left UNSPENT after managing, the
    //    frontier mults can't absorb the action rate → add another mult (cheap:
    //    1 action, no pipes). With deep fuel each mult is well-fed, so this is pure
    //    throughput. The old gate (starve < 4) never held in the deep-fuel regime
    //    (the agent reads "starved" between big fuel arrivals), so width never grew.
    //    Unspent-APM is the true throughput-bound signal and self-limits: once
    //    enough mults absorb the actions, nothing is unspent → it stops. Capped at
    //    MAX_FRONTIER (past ~16 a single tree's fuel dilutes and it regresses).
    //    At human rates (≤~30/s) APM is fully spent, so this never fires.
    if (autoWidth && strategy === 'spread') {
      if (budget >= 1 && world.pool.length > 20) widthPressure++;
      else widthPressure = Math.max(0, widthPressure - 2);
      if (widthPressure > WIDTH_TRIGGER && queue.length === 0 && frontierCount < MAX_FRONTIER) {
        queueFrontierMult();
        widthPressure = 0;
      }
    }
    // 5) Last-resort pool safety (NOT a free merge — the old code summed the two
    //    smallest, which the real game can't do). With stacking on the pool is a
    //    few stacks so this never fires; without it, drop the smallest as a backstop.
    while (world.pool.length > POOL_HARD_CAP) {
      const d = takeSmallest(world);
      if (d) { stats.droppedValue = stats.droppedValue.add(mag(d)); stats.droppedCount++; }
    }
  }

  // The fuel-LADDER manager. Tier i targets magnitude F^(α^i) and climbs with a
  // smaller op1 (1000^(α^i)) so it sits at that power of the frontier; its output
  // then pays tier (i-1)'s tax (== F^(α^i)). Bottom tiers fall below the tax
  // floor → free → anchored on the river. Tax for any tier is paid from a block
  // BELOW its target (the tier underneath).
  function manageLadder(): void {
    while (budget >= 1 && queue.length) { if (act(queue.shift()!)) stats.build++; }
    const F = Math.max(2, frontier());
    for (let i = 0; i < tierMults.length; i++) {
      if (budget < 1) break;
      // ×MULT_CAP-spaced tiers: tier i sits at F / 1000^i, one multiply-step apart,
      // so tier i's op0 comes straight from tier (i+1)'s output. All tiers climb at
      // ×1000/op (in lockstep, preserving the spacing as the frontier rises).
      const target = F / Math.pow(MULT_CAP, i);
      const op1cap = MULT_CAP;
      const op0cap = i === 0 ? Infinity : target; // op0 < target → from the tier below
      for (const m of tierMults[i]) {
        if (budget < 1) break;
        const cell = world.cells.get(m);
        if (!cell || !cell.built) continue;
        if (cell.op === null) {
          if (cell.operands[0] === null) {
            const o0 = takeBigInRange(world, new Decimal(2), op0cap);
            if (o0) { if (act(() => feedOperand(world, m, 0, o0))) stats.feed++; else pushBack(world, o0); }
          } else if (cell.operands[1] === null) {
            const o1 = takeModerate(world, op1cap);
            if (o1) { if (act(() => feedOperand(world, m, 1, o1))) stats.feed++; else pushBack(world, o1); }
          }
          continue;
        }
        const op = cell.op;
        if (op.progress.gte(op.work) && op.fuelPaid.gte(op.fuelRequired)) continue;
        const taxDone = op.fuelPaid.gte(op.fuelRequired);
        const f = !taxDone
          ? (takeBigInRange(world, op.grade, target) ?? takeFuel(world, op.grade))
          : takeFuel(world, op.grade);
        if (f) {
          if (act(() => injectFuel(world, m, f))) { stats.fuel++; stats.fuelMagBurned = stats.fuelMagBurned.add(mag(f)); }
          else pushBack(world, f);
        } else { starve++; starvedThisTick = true; }
      }
    }
  }

  const frontier = (): number => {
    let b = 0;
    for (const bl of world.pool) b = Math.max(b, mag(bl.value).toNumber());
    for (const c of world.cells.values()) {
      for (const o of c.operands) if (o) b = Math.max(b, mag(o).toNumber());
      if (c.op) for (const e of c.op.emits) b = Math.max(b, mag(e.value).toNumber());
    }
    return b;
  };

  const fmt = (x: number) => (!Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US'));
  const sample = Math.max(1, Math.floor(ticks / 16));
  const sampleEvery = Math.max(1, Math.floor(ticks / 40)); // trajectory resolution
  const cap = Math.max(BUDGET_CAP, rate); // a fast rate isn't throttled by the anti-hoard cap
  for (let t = 1; t <= ticks; t++) {
    budget = Math.min(cap, budget + rate);
    stats.budgetGranted += rate;
    if (budget < 1) stats.idleTicks++; // rate-limited: can't act this tick
    starvedThisTick = false;
    const fefuBefore = stats.feed + stats.fuel;
    // Snapshot frontier-mult op results for completion detection (catches the
    // multi-tick ops; very-fast fuel-completed ops may slip through — a proxy).
    const opBefore = fmults.map((fm) => { const c = world.cells.get(fm); return c && c.op ? mag(c.op.emits[0]?.value ?? c.op.heldInputs[0]) : null; });
    if (ladder) manageLadder(); else manage();
    if (budget >= 1) stats.unspentTicks++; // had APM left after managing (not absorbed)
    if (stats.feed + stats.fuel > fefuBefore) stats.productiveTicks++;
    if (starvedThisTick) stats.fuelStarveTicks++;
    if ([...world.cells.values()].some((c) => !c.built)) stats.buildingTicks++;
    tick(world, 1);
    for (let i = 0; i < fmults.length; i++) {
      if (opBefore[i] === null) continue;
      const c = world.cells.get(fmults[i]);
      if (c && c.op === null) stats.opsCompleted++;
    }
    if (t % sampleEvery === 0 || t === ticks) {
      stats.trajectory.push({ t, frontier: frontier(), score: totalScore(world).toNumber(), loose: world.pool.length, trees: treesBuilt, mults: frontierCount });
    }
    if (trace && t % sample === 0) {
      // Deadlock diagnostics: biggest loose, how many ≤1000 "moderate" blocks
      // exist (op1 supply), and how many frontier mults are actually working.
      let top = 0, moderate = 0;
      for (const b of world.pool) { const m = mag(b.value).toNumber(); top = Math.max(top, m); if (m >= 2 && m <= MULT_CAP) moderate += b.count ?? 1; }
      let working = 0; for (const fm of fmults) { const c = world.cells.get(fm); if (c && c.op) working++; }
      console.log(`  t=${String(t).padStart(6)} | score ${fmt(totalScore(world).toNumber()).padStart(10)} | frontier ${fmt(frontier()).padStart(10)} | topLoose ${fmt(top).padStart(10)} | mod≤1k ${String(moderate).padStart(4)} | working ${working}/${fmults.length} | loose ${world.pool.length}`);
    }
  }
  // Final pool composition (the stranded numbers) + total loose value.
  let looseValue = Decimal.dZero;
  for (const b of world.pool) {
    const m = mag(b.value);
    looseValue = looseValue.add(m.mul(b.count ?? 1));
    stats.pool.push({ digits: magnitudeDigits(b.value).toNumber(), count: b.count ?? 1, mag: m });
  }
  stats.looseValue = looseValue;
  return { frontier: frontier(), score: totalScore(world).toNumber(), actions, cells: world.cells.size, trees: treesBuilt, mults: frontierCount, stats };
}

function main(): void {
  let rate: number | null = null;
  let ticks = 18000;
  let trace = false;
  let stacking = true;
  let strategy: Strategy = 'spread';
  let fuelTrees = 1;
  let autoWidth = false;
  let fuelDepth = 3;
  let smartFuel = true;
  let mults = 0;
  let autoFuel = true;
  let taxCoeff = 0;
  let taxExp = 0.5;
  let taxFloor = 1e20;
  let milling = false;
  let ladder = false;
  // Default to the SHIPPED economy (DEFAULT_TUNING locked 0.5/0.5 on
  // 2026-06-10); pass --amp-base 1 --overpay 1 for the pre-lock vanilla.
  let ampBase = DEFAULT_TUNING.amplifierBaseRateScale;
  let overpay = DEFAULT_TUNING.fuelOverpayExp;
  let fuelFactory = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--rate') rate = Number(a[++i]);
    else if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--trace') trace = true;
    else if (a[i] === '--no-stacking') stacking = false;
    else if (a[i] === '--strategy') strategy = a[++i] as Strategy;
    else if (a[i] === '--fuel-trees') fuelTrees = Number(a[++i]);
    else if (a[i] === '--auto-width') autoWidth = true; // enable the (experimental) gradual width-scaler
    else if (a[i] === '--fuel-depth') { fuelDepth = Number(a[++i]); smartFuel = false; } // force a fixed depth
    else if (a[i] === '--mults') mults = Number(a[++i]);
    else if (a[i] === '--no-auto-fuel') autoFuel = false;
    else if (a[i] === '--tax-coeff') taxCoeff = Number(a[++i]);
    else if (a[i] === '--tax-exp') taxExp = Number(a[++i]);
    else if (a[i] === '--tax-floor') taxFloor = Number(a[++i]);
    else if (a[i] === '--milling') milling = true;
    else if (a[i] === '--ladder') ladder = true;
    else if (a[i] === '--amp-base') ampBase = Number(a[++i]);
    else if (a[i] === '--overpay') overpay = Number(a[++i]);
    else if (a[i] === '--fuel-factory') fuelFactory = true;
  }
  const tuning: TimeTuning = {
    ...DEFAULT_TUNING,
    fuelTaxCoeff: taxCoeff, fuelTaxExp: taxExp, fuelTaxFloor: taxFloor,
    amplifierBaseRateScale: ampBase, fuelOverpayExp: overpay,
  };
  const fmt = (x: number) => (!Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US'));
  const stackNote = stacking ? 'ON (mirrors the live game)' : 'OFF (legacy per-block pool)';

  if (rate !== null) {
    console.log(`Managing agent @ ${rate} actions/sec, ${ticks} ticks (${(ticks / 3600).toFixed(1)}h) · ${strategy} · ${fuelTrees} initial fuel-tree(s), auto-scaling · stacking ${stackNote}:\n`);
    const r = runManager(rate, ticks, { trace, stacking, strategy, fuelTrees, autoWidth, fuelDepth, smartFuel, mults, autoFuel, tuning, milling, ladder, fuelFactory });
    console.log(`\n  frontier ${fmt(r.frontier)} | score ${fmt(r.score)} | ${r.actions} actions | ${r.cells} cells | ${r.trees} fuel-trees(${smartFuel ? 'smart' : 'd' + fuelDepth}), ${r.mults} mults built`);
    return;
  }

  console.log(`Managing agent — frontier vs action rate (fuel${autoWidth ? ' + frontier-width' : ''} SELF-SCALE)`);
  console.log(`window: ${ticks} ticks ≈ ${(ticks / 3600).toFixed(1)}h · ${fuelTrees} initial fuel-tree(s), auto-scaling · stacking ${stackNote}\n`);
  console.log('  actions/sec |  spread frontier  | trees | mults | concentrate | note');
  console.log('  ------------+-------------------+-------+-------+-------------+-----------------');
  const rates: [number, string][] = [
    [0, 'idle (never touch it)'],
    [1 / 60, '1 / min (mostly thinking)'],
    [1 / 30, '1 / 30s (relaxed)'],
    [0.1, '1 / 10s (engaged)'],
    [1, '1 / sec (fast human)'],
    [10, '10 / sec (superhuman)'],
  ];
  for (const [r, note] of rates) {
    const s = runManager(r, ticks, { stacking, strategy: 'spread', fuelTrees, autoWidth, fuelDepth, smartFuel, mults, autoFuel });
    const c = runManager(r, ticks, { stacking, strategy: 'concentrate', fuelTrees, autoWidth, fuelDepth, smartFuel, mults, autoFuel });
    console.log(`  ${String(r).padStart(11)} | ${fmt(s.frontier).padStart(17)} | ${String(s.trees).padStart(5)} | ${String(s.mults).padStart(5)} | ${fmt(c.frontier).padStart(11)} | ${note}`);
  }
  console.log('\n  Faster play builds MORE fuel (trees) and climbs higher — fuel production');
  console.log('  self-scales to the digits³ demand. At human rates (≤30/s) the 4 mults absorb');
  console.log('  the APM, so width never grows here; it engages only past ~100/s. Idle never stalls.');
}

// Only run the CLI when invoked directly — importing this module (e.g. from
// sim/study.ts, which reuses runManager) must NOT trigger the sweep.
if (process.argv[1]?.endsWith('manager.ts')) main();
