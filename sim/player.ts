/**
 * THE PLAYER (`sim/player.ts`) — the ink-era gameplay agent, written fresh
 * for the converged ruleset (2026-06-12). The challenger (`sim/challenger.ts`)
 * is FROZEN as the legacy benchmark; this agent exists to play the final
 * rules WELL and to produce the gameplay snapshots the dev presets ship.
 *
 * ── The ruleset it plays (INK_TUNING) and what each law REWARDS ─────────────
 *
 *  THE UNIFIED LAW   need = M^(1/2^k) per operator tier, payable only in
 *                    [need/16, need], pro-rata. → Mult squarings are paid one
 *                    rung down; exp leaps are paid TWO rungs down (the
 *                    crazy-leap license). Smart play: climb by squaring until
 *                    exp's ⁴√ discount dominates, then ladder launches.
 *
 *  THE TOWER         ⁴√ of a launch's output is its own operand class — so a
 *                    launch from apex `a` consumes a + b plus `a`-worth of
 *                    notes in [a/16, a]. The cheapest note-set is a SECOND
 *                    apex MILLED ÷16 (16 in-band pieces). Rebuild rule:
 *                    every rung wants ~2 copies of its class — one to keep,
 *                    one to grind. Launch k funds launch k+1.
 *
 *  THE WRITE FLOOR   an op cannot finish faster than digits(out)/writeSpeed;
 *                    a mill writes EVERY piece. → Launch writes are eras
 *                    (e2466 ≈ 20 min at 2 d/s); giant mill gears serialize.
 *                    Smart play: start the write, then spend it broadening.
 *
 *  THE INK TAX       rent = digits(score) − 7 per tick, paid ONLY from the
 *                    Ledger's store, ONLY by blocks ≤ 16 × rent. Coverage
 *                    throttles writes + amplifier clocks (quadratic, 5%
 *                    floor). → Wealth is not income. Smart play: a PIPED ink
 *                    line (debris → ÷16 mill(s) → Ledger) that self-pays,
 *                    re-fed ahead of each launch (digits ×4 ⇒ rent ×4).
 *
 *  MATERIAL BILLS    first-of-kind puzzles (mult=16, mill=64, exp=10⁶…),
 *                    repeats ≈ √peak in a ×1.1 band; leaves waived. → Every
 *                    expansion is a machining order, not a wallet check.
 *
 *  THE CONTENTION    rent, launch notes, bills, and gears all want the SAME
 *                    small denominations. This is the game's central tension
 *                    and the thing that killed the old agent three ways. The
 *                    structural answer here is the CLAIMS BOARD: every
 *                    outstanding need registers {band, amount, priority};
 *                    nobody consumes a pool block that a higher-priority
 *                    claim still needs. Priorities: 0 = active op notes (a
 *                    started op holding operands hostage is a deadlock),
 *                    1 = material bills (builds are the critical path),
 *                    2 = rent buffer (a dip merely throttles), 3 = stock for
 *                    the NEXT launch (deferrable).
 *
 * ── Architecture ────────────────────────────────────────────────────────────
 *   BUILDER        condition-gated placement program + bill payment + rushes.
 *   MACHINIST      "make blocks in band [a,b]" — pool → mill(gear) → mult
 *                  pair → adder doubling, claims-aware at every take.
 *   INK KEEPER     ledger funding + the piped ink line + pre-launch widening.
 *   LAUNCH DIRECTOR mult-grow + the exp tower (full-coverage starts only —
 *                  the operand trap is never worth it).
 *
 * Usage:
 *   node sim/player.ts --rate 1 --ticks 14400 [--trace] [--snapshots]
 *   node sim/player.ts --rate 0.33 --ticks 28800
 *   Flags: --write-speed N --upkeep N override INK_TUNING for experiments.
 */

import {
  createWorld,
  placeCell,
  placePipe,
  feedOperand,
  injectFuel,
  tick,
  totalScore,
  currentBuildSlots,
  type World,
  type SimCell,
  type CellKind,
} from '../core/engine.ts';
import { valueMagnitude, valueMul, valuePow, type Value } from '../core/value.ts';
import { INK_TUNING, magnitudeDigits, operationWork, unifiedNeed, unifiedBand, type TimeTuning } from '../core/time.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import Decimal from 'break_eternity.js';

let T: TimeTuning = INK_TUNING;
const mag = (v: Value) => valueMagnitude(v);
const D = (n: number | string) => new Decimal(n);
const real = (n: Decimal): Value => ({ kind: 'real', n });

const BUDGET_CAP = 3; // no hoarding idle seconds into superhuman bursts
const RENT_BUFFER_S = 90; // keep ~1.5 min of rent in the office
const CREEP_OK = 150; // ops this cheap may run on the clock alone

// ── The claims board ─────────────────────────────────────────────────────────

interface Claim {
  min: Decimal;
  cap: Decimal;
  amount: Decimal; // in-band magnitude still owed to this need
  prio: number; // 0 op-notes · 1 bills · 2 rent · 3 launch stock
  tag: string;
}

interface Player {
  world: World;
  claims: Claim[];
}

/** Sum of loose in-band value available to a claim. */
function bandSum(world: World, min: Decimal, cap: Decimal): Decimal {
  let s = Decimal.dZero;
  for (const b of world.pool) {
    const m = mag(b.value);
    if (m.gte(min) && m.lte(cap)) s = s.add(m.mul(b.count ?? 1));
  }
  return s;
}

/** May a consumer at `prio` take ONE block of magnitude m? Yes unless some
 *  stricter claim contains m and would no longer be coverable without it. */
function mayTake(p: Player, m: Decimal, prio: number): boolean {
  for (const c of p.claims) {
    if (c.prio >= prio) continue;
    if (m.lt(c.min) || m.gt(c.cap)) continue;
    if (bandSum(p.world, c.min, c.cap).sub(m).lt(c.amount)) return false;
  }
  return true;
}

/** Take ONE block (largest allowed under `pred`) from the pool at `prio`.
 *  Returns the value or null. One pool mutation — the caller spends an act. */
function takeOne(p: Player, prio: number, pred: (m: Decimal) => boolean, largest = true): Value | null {
  let bi = -1;
  let bm: Decimal | null = null;
  for (let i = 0; i < p.world.pool.length; i++) {
    const m = mag(p.world.pool[i].value);
    if (!pred(m) || !mayTake(p, m, prio)) continue;
    if (bm === null || (largest ? m.gt(bm) : m.lt(bm))) {
      bi = i;
      bm = m;
    }
  }
  if (bi < 0) return null;
  const b = p.world.pool[bi];
  const v = b.value;
  if ((b.count ?? 1) > 1) b.count = (b.count ?? 1) - 1;
  else p.world.pool.splice(bi, 1);
  return v;
}

function pushBack(world: World, v: Value): void {
  // straight to pool (no act) — merging is the engine's business
  world.pool.push({ id: -1 - world.pool.length, value: v, x: 0, y: 0, count: 1 });
}

// ── The run ──────────────────────────────────────────────────────────────────

export interface PlayerResult {
  frontierStr: string;
  digits: string;
  score: string;
  actions: number;
  ops: number;
  launches: number;
  landmarks: Record<string, number>;
  launchTicks: number[];
  coverageMin: number; // worst smoothed ink coverage seen after the rent began
  /** Where the actions went — the agent's own time-and-motion study. */
  actionsBy: Record<string, number>;
  timeline: { t: number; digits: string; score: string; cov: number; rent: string; cells: number; ops: number; launches: number }[];
}

export function runPlayer(
  rate: number,
  ticks: number,
  opts: { tuning?: TimeTuning; trace?: boolean; snapshots?: ((name: string, world: World) => void) | null } = {},
): PlayerResult {
  T = opts.tuning ?? INK_TUNING;
  const world = createWorld(T, { stacking: true });
  const p: Player = { world, claims: [] };
  const snap = opts.snapshots ?? null;

  let budget = 0;
  let actions = 0;
  let ops = 0;
  let launches = 0;
  const launchTicks: number[] = [];
  const landmarks: Record<string, number> = {};
  let coverageMin = 1;
  const mark = (k: string, t: number): void => {
    if (!(k in landmarks)) {
      landmarks[k] = t;
      if (snap) snap(k, world);
    }
  };
  const actionsBy: Record<string, number> = {};
  let actSource = '?';
  const act = (fn: () => void): boolean => {
    if (budget < 1) return false;
    budget -= 1;
    actions++;
    actionsBy[actSource] = (actionsBy[actSource] ?? 0) + 1;
    fn();
    return true;
  };
  /** Label the verbs of a subsystem call (for the time-and-motion study). */
  const as = <T>(src: string, fn: () => T): T => {
    const prev = actSource;
    actSource = src;
    const r = fn();
    actSource = prev;
    return r;
  };

  // ── BUILDER: the program ──────────────────────────────────────────────────
  // Placement order IS the pencil queue. Each stage gates on the economy
  // actually needing it — and every placement carries its bill as a claim.

  interface Stage {
    when: () => boolean;
    thunks: (() => void)[];
  }
  const program: Stage[] = [];
  const stage = (when: () => boolean): ((t: () => void) => void) => {
    const s: Stage = { when, thunks: [] };
    program.push(s);
    return (t) => s.thunks.push(t);
  };

  /** A squaring backbone: 2^depth successors → leaf adders → mult tree. */
  function backbone(depth: number, x0: number, y0: number, r: (t: () => void) => void): void {
    const ref: Record<string, number> = {};
    const nS = 1 << depth;
    for (let i = 0; i < nS; i++) {
      const k = `s${i}`;
      r(() => {
        ref[k] = placeCell(world, 'successor', x0, y0 + i * 14);
      });
    }
    let sc = 0;
    const nextS = () => `s${sc++ % nS}`;
    const build = (lvl: number, idx: number, slot: string): void => {
      if (lvl === 0) {
        const a0 = nextS();
        const a1 = nextS();
        const a2 = nextS();
        r(() => {
          ref[slot] = placeCell(world, 'addition', x0 + 200, y0 + idx * 36);
        });
        r(() => placePipe(world, ref[a0], 0, ref[slot], 0));
        r(() => placePipe(world, ref[a1], 0, ref[slot], 1));
        r(() => placePipe(world, ref[a2], 0, ref[slot], -1, { fuel: true }));
        return;
      }
      const l = `${slot}L`;
      const rr = `${slot}R`;
      build(lvl - 1, idx * 2, l);
      build(lvl - 1, idx * 2 + 1, rr);
      r(() => {
        ref[slot] = placeCell(world, 'multiplication', x0 + 200 + lvl * 150, y0 + idx * 36);
      });
      r(() => placePipe(world, ref[l], 0, ref[slot], 0));
      r(() => placePipe(world, ref[rr], 0, ref[slot], 1));
    };
    build(depth, 0, 'root');
  }

  // Benches the subsystems share (ids resolve at placement time). Mults and
  // adders are POOLS, not single benches — the rebuild pyramid is width-bound,
  // and the reactive builder keeps adding pads as the frontier grows.
  const adders: number[] = []; // machining benches (binary-fill)
  const mults: number[] = []; // growers + band-fitters (one pool)
  let benchMill = -1; // band-fitting by partition
  const handExps: number[] = []; // launch pads
  let ledgerId = -1;
  const inkMills: number[] = []; // the piped ink line (debris in → rent out)

  {
    const r1 = stage(() => true); // the opening
    backbone(2, 0, 0, r1);
    r1(() => adders.push(placeCell(world, 'addition', 1100, -160)));
    r1(() => mults.push(placeCell(world, 'multiplication', 1100, -40)));
    const r2 = stage(() => world.peakMagnitude.gte(4096)); // the snowball
    backbone(3, 0, 560, r2);
    r2(() => mults.push(placeCell(world, 'multiplication', 1100, 80)));
    r2(() => {
      benchMill = placeCell(world, 'mill', 1100, 200);
    });
    const r3 = stage(() => T.upkeepCoeff > 0 && world.peakMagnitude.gte(1e6)); // the rent is coming
    r3(() => {
      ledgerId = placeCell(world, 'ledger', 1500, 320);
    });
    r3(() => {
      const m = placeCell(world, 'mill', 1300, 320);
      inkMills.push(m);
      placePipe(world, m, 0, ledgerId, 0); // the ink line: pieces flow to the office
    });
    const r4 = stage(() => world.peakMagnitude.gte(1.2e6)); // exp's bill is machinable
    r4(() => handExps.push(placeCell(world, 'exponentiation', 1500, -40)));
    r4(() => handExps.push(placeCell(world, 'exponentiation', 1500, 80)));
    const r5 = stage(() => world.peakMagnitude.gte(1e12)); // mid-game widening
    backbone(4, 0, 1200, r5);
    r5(() => {
      // THE CASCADE: rent denominations sit many rungs below launch debris —
      // one ÷16 pass can't reach them. A new mill is PREPENDED to the chain
      // (debris → new mill → old mill → … → ledger); the keeper picks the
      // entry stage so the final pieces land inside the rent band.
      const m = placeCell(world, 'mill', 1300 - inkMills.length * 160, 320);
      placePipe(world, m, 0, inkMills[0], 0);
      inkMills.unshift(m);
    });
    const r6 = stage(() => world.peakMagnitude.gte(1e24)); // tower-era ink depth
    r6(() => {
      const m = placeCell(world, 'mill', 1300 - inkMills.length * 160, 320);
      placePipe(world, m, 0, inkMills[0], 0);
      inkMills.unshift(m);
    });
    r6(() => {
      const m = placeCell(world, 'mill', 1300 - inkMills.length * 160, 320);
      placePipe(world, m, 0, inkMills[0], 0);
      inkMills.unshift(m);
    });
  }

  let stageIdx = 0;
  let thunkIdx = 0;
  function placeNext(): boolean {
    while (stageIdx < program.length) {
      const s = program[stageIdx];
      if (thunkIdx === 0 && !s.when()) return false;
      if (thunkIdx >= s.thunks.length) {
        stageIdx++;
        thunkIdx = 0;
        continue;
      }
      const t = s.thunks[thunkIdx];
      if (!act(t)) return false;
      thunkIdx++;
      return true;
    }
    return false;
  }

  // ── Claims assembly (every loop pass) ────────────────────────────────────
  function refreshClaims(): void {
    p.claims = [];
    // prio 0: notes owed to STARTED ops (hostage-prevention)
    for (const c of world.cells.values()) {
      if (!c.op || !c.op.scaffold || !c.op.unifiedNeed) continue;
      const owed = c.op.fuelRequired.gt(0)
        ? c.op.fuelRequired.sub(c.op.fuelPaid)
        : c.op.work.gt(c.op.progress) && c.op.work.gt(CREEP_OK)
          ? c.op.unifiedNeed.mul(c.op.work.sub(c.op.progress)).div(c.op.work)
          : Decimal.dZero;
      if (owed.gt(0)) p.claims.push({ min: c.op.scaffold.min, cap: c.op.scaffold.cap, amount: owed, prio: 0, tag: `op#${c.id}` });
    }
    // prio 1: material bills
    for (const c of world.cells.values()) {
      if (c.materialNeed) p.claims.push({ min: c.materialNeed.min, cap: c.materialNeed.max, amount: c.materialNeed.min, prio: 1, tag: `bill#${c.id}` });
    }
    // prio 2: the rent buffer
    if (T.upkeepCoeff > 0 && world.inkDemand.gt(0) && ledgerId >= 0) {
      const led = world.cells.get(ledgerId);
      if (led?.built) {
        const cap = world.inkDemand.mul(T.upkeepBandRatio);
        let held = Decimal.dZero;
        for (const e of led.store) {
          const m = mag(e.value);
          if (m.lte(cap)) held = held.add(m.mul(e.count));
        }
        const owed = world.inkDemand.mul(RENT_BUFFER_S).sub(held);
        if (owed.gt(0)) p.claims.push({ min: Decimal.dOne, cap, amount: owed, prio: 2, tag: 'rent' });
      }
    }
    // prio 3: the next launch's note stock (the director registers it below)
    if (launchPlan) p.claims.push({ min: launchPlan.band.min, cap: launchPlan.band.cap, amount: launchPlan.need, prio: 3, tag: 'stock' });
    if (growPlan) p.claims.push({ min: growPlan.band.min, cap: growPlan.band.cap, amount: growPlan.need, prio: 3, tag: 'growstock' });
  }

  // ── MACHINIST ────────────────────────────────────────────────────────────
  // One service: push the in-band pool sum for a claim toward its amount.
  // Routes, cheapest-first: mill an oversized block down (re-gearing with a
  // pool gear when ÷16 misses) → mult a pair into the band → double up on
  // the bench adder. One act per call.

  function cellIdle(id: number): SimCell | null {
    const c = world.cells.get(id);
    return c && c.built && c.op === null && c.operands.every((o) => o === null) ? c : null;
  }

  function anyIdle(ids: number[]): SimCell | null {
    for (const id of ids) {
      const c = cellIdle(id);
      if (c) return c;
    }
    return null;
  }

  // ── Reactive widening: the pyramid is WIDTH-bound. A real player keeps
  // building pads as the frontier grows — one mult per ~2 digits, one adder
  // per ~4, and another ink mill per launch (rent quadruples each leap).
  function widen(): boolean {
    const d = magnitudeDigits(real(world.peakMagnitude)).toNumber();
    if (!Number.isFinite(d)) return false;
    const wantMults = Math.min(16, 2 + Math.floor(d / 2));
    const wantAdders = Math.min(8, 1 + Math.floor(d / 4));
    if (mults.length < wantMults) {
      const n = mults.length;
      return act(() => mults.push(placeCell(world, 'multiplication', 1100 + (n % 3) * 150, -40 + Math.floor(n / 3) * 110)));
    }
    if (adders.length < wantAdders) {
      const n = adders.length;
      return act(() => adders.push(placeCell(world, 'addition', 950, -160 + n * 90)));
    }
    return false;
  }

  function machine(claim: Claim): boolean {
    const have = bandSum(world, claim.min, claim.cap);
    if (have.gte(claim.amount)) return false; // satisfied — nothing to do
    // route 1: the mill. A block B with B/g in band for a sane gear g.
    const mill = cellIdle(benchMill);
    if (mill) {
      // candidate gears: the current one, plus any pool denomination 2..4096
      const gears: Decimal[] = [mill.millDivisor];
      for (const b of world.pool) {
        const g = mag(b.value).floor();
        if (g.gte(2) && g.lte(4096) && !gears.some((x) => x.eq(g))) gears.push(g);
      }
      for (const b of world.pool) {
        const B = mag(b.value);
        if (B.lte(claim.cap)) continue; // not oversized — leave it
        for (const g of gears) {
          const piece = B.div(g.floor());
          if (piece.lt(claim.min) || piece.gt(claim.cap)) continue;
          if (!mayTake(p, B, claim.prio)) continue;
          // re-gear first if needed (one act), then feed (one act)
          if (!mill.millDivisor.eq(g.floor())) {
            const gear = takeOne(p, claim.prio, (m) => m.floor().eq(g.floor()));
            if (!gear) continue;
            if (!act(() => feedOperand(world, benchMill, 1, gear))) {
              pushBack(world, gear);
              return false;
            }
            return true; // next pass feeds the dividend
          }
          const feed = takeOne(p, claim.prio, (m) => m.eq(B));
          if (!feed) continue;
          if (!act(() => feedOperand(world, benchMill, 0, feed))) {
            pushBack(world, feed);
            return false;
          }
          return true;
        }
      }
    }
    // route 2: a product lands in band (any idle mult pad).
    // Two-feed sequences need 2 budget UP FRONT — a half-fed cell is a
    // permanently stuck cell (operand staged, nobody returns to finish).
    const bm = budget >= 2 ? anyIdle(mults) : null;
    if (bm) {
      const vs = world.pool.map((b) => mag(b.value));
      for (let i = 0; i < vs.length; i++) {
        for (let j = i; j < vs.length; j++) {
          if (i === j && (world.pool[i].count ?? 1) < 2) continue;
          const prod = vs[i].mul(vs[j]);
          if (prod.lt(claim.min) || prod.gt(claim.cap)) continue;
          if (!mayTake(p, vs[i], claim.prio) || !mayTake(p, vs[j], claim.prio)) continue;
          // take BOTH before feeding either — a half-fed pad is a dead pad
          const a = takeOne(p, claim.prio, (m) => m.eq(vs[i]));
          if (!a) continue;
          const b2 = takeOne(p, claim.prio, (m) => m.eq(vs[j]));
          if (!b2) {
            pushBack(world, a);
            continue;
          }
          if (!act(() => feedOperand(world, bm.id, 0, a))) {
            pushBack(world, a);
            pushBack(world, b2);
            return false;
          }
          if (!act(() => feedOperand(world, bm.id, 1, b2))) pushBack(world, b2);
          return true;
        }
      }
    }
    // route 3: an adder sums toward the band — BAND-AWARE pairing. The bills
    // band is ×1.1 tight: a greedy 48+32 overshoots 70 and strands an 80
    // forever (the Sisyphus treadmill that ate 96% of the idle-pace session).
    // Pick the largest pair whose SUM stays ≤ cap; equal halves land exactly.
    const ba = budget >= 2 ? anyIdle(adders) : null;
    if (ba) {
      const below: { m: Decimal; copies: number }[] = [];
      for (const b of world.pool) {
        const m = mag(b.value);
        if (m.gte(claim.min) || !mayTake(p, m, claim.prio)) continue;
        const e = below.find((x) => x.m.eq(m));
        if (e) e.copies += b.count ?? 1;
        else below.push({ m, copies: b.count ?? 1 });
      }
      below.sort((a, b) => (b.m.gt(a.m) ? 1 : -1));
      let pick: { x: Decimal; y: Decimal } | null = null;
      for (const bx of below) {
        for (const by of below) {
          if (bx.m.eq(by.m) && bx.copies < 2) continue;
          const sum = bx.m.add(by.m);
          if (sum.gt(claim.cap)) continue; // never strand an overshoot
          if (!pick || sum.gt(pick.x.add(pick.y))) pick = { x: bx.m, y: by.m };
        }
      }
      if (pick) {
        const a = takeOne(p, claim.prio, (m) => m.eq(pick!.x));
        if (a) {
          const partner = takeOne(p, claim.prio, (m) => m.eq(pick!.y));
          if (!partner) {
            pushBack(world, a);
            return false;
          }
          if (!act(() => feedOperand(world, ba.id, 0, a))) {
            pushBack(world, a);
            pushBack(world, partner);
            return false;
          }
          if (!act(() => feedOperand(world, ba.id, 1, partner))) pushBack(world, partner);
          return true;
        }
      }
    }
    return false;
  }

  // ── INK KEEPER ───────────────────────────────────────────────────────────
  // The piped line does the routine work (debris → mill → ledger). The keeper
  // feeds the line and tops the office directly when the buffer dips.

  function keepInk(): boolean {
    if (T.upkeepCoeff <= 0 || ledgerId < 0) return false;
    const led = world.cells.get(ledgerId);
    if (!led?.built || world.inkDemand.lte(0)) return false;
    // The CHORE cap (hand top-ups, rent machining) — bulk cascade feeds are
    // exempt: one fed mid-block is half an hour of rent, the best action in
    // the game. (A flat all-ink cap self-locks: ink capped → coverage 0 →
    // throttle stalls everything → total actions freeze → ink stays capped.)
    const choresCapped = (actionsBy['ink'] ?? 0) > actions * 0.34;
    const cap = world.inkDemand.mul(T.upkeepBandRatio);
    const rentClaim = p.claims.find((c) => c.tag === 'rent');
    if (!rentClaim) return false;
    // 1) feed the ink CASCADE — the BULK path (one fed mid-block is minutes
    // of rent; pieces flow office-ward by pipe). SHALLOWEST entry first:
    // fewer passes = fewer block-transfers and less writing. inkMills[0] is
    // the deepest entry; the last stage drains into the office.
    for (let entry = inkMills.length - 1; entry >= 0; entry--) {
      const mill = cellIdle(inkMills[entry]);
      if (!mill) continue;
      const passes = inkMills.length - entry;
      const reduce = D(16).pow(passes);
      const feed = takeOne(p, 2, (m) => m.gt(cap) && m.div(reduce).lte(cap) && m.div(reduce).gte(1));
      if (feed) {
        if (!act(() => feedOperand(world, inkMills[entry], 0, feed))) {
          pushBack(world, feed);
          return false;
        }
        return true;
      }
    }
    // 1.5) REACTIVE DEEPENING: debris exists that NO entry stage can digest
    // (each launch's leavings sit many rungs above the band — at e48 the
    // debris is e12-class while the cap is ~700). Prepend another ÷16 stage;
    // the cascade grows with the wealth it must liquefy.
    if (world.inkCoverage < 0.75 && inkMills.length < 14 && budget >= 2) {
      const deepest = D(16).pow(inkMills.length);
      let orphan: Decimal | null = null;
      for (const b of world.pool) {
        const m = mag(b.value);
        if (m.gt(cap.mul(deepest)) && (orphan === null || m.lt(orphan))) orphan = m;
      }
      if (orphan) {
        // (deep orphans take several stages — each call prepends one)
        const head = inkMills[0];
        let placed = -1;
        if (act(() => {
            placed = placeCell(world, 'mill', 1300 - inkMills.length * 160, 320);
          })) {
          act(() => placePipe(world, placed, 0, head, 0));
          inkMills.unshift(placed);
          return true;
        }
      }
    }
    if (choresCapped) return false; // the rest is hand-shovelling — rationed
    // 2) hand top-up: a whole in-band stack per act (the drag-drop verb)
    let bi = -1;
    let best = Decimal.dZero;
    for (let i = 0; i < world.pool.length; i++) {
      const m = mag(world.pool[i].value);
      if (m.lt(Decimal.dOne) || m.gt(cap) || !mayTake(p, m, 2)) continue;
      const worth = m.mul(world.pool[i].count ?? 1);
      if (worth.gt(best)) {
        bi = i;
        best = worth;
      }
    }
    if (bi >= 0) {
      const stack = world.pool[bi];
      world.pool.splice(bi, 1);
      const ok = act(() => {
        for (let k = 0; k < (stack.count ?? 1); k++) feedOperand(world, ledgerId, 0, stack.value);
      });
      if (!ok) world.pool.push(stack);
      return ok;
    }
    // 3) nothing in range — let the machinist produce rent denominations
    return machine(rentClaim);
  }

  // ── LAUNCH DIRECTOR ──────────────────────────────────────────────────────
  // Mult-grow until exp exists, then the tower: pick the apex, stock its
  // need in [a/16, a] (a second apex milled ÷16 is the canonical set), start
  // ONLY at full coverage, and spend the write broadening.

  interface LaunchPlan {
    aMag: Decimal; // the operand class
    need: Decimal;
    band: { min: Decimal; cap: Decimal };
  }
  let launchPlan: LaunchPlan | null = null;
  /** The next mult-grow blocked on coverage — its notes become a stock claim
   *  so the machinist owns "make my fuel" (the goal gap that froze v0). */
  let growPlan: { need: Decimal; band: { min: Decimal; cap: Decimal } } | null = null;

  function expIdle(): number {
    for (const id of handExps) if (cellIdle(id)) return id;
    return -1;
  }

  function planLaunch(): void {
    if (handExps.length === 0 || expIdle() < 0) {
      launchPlan = null;
      return;
    }
    // the apex: the biggest pool block we may eventually commit
    let apex: Decimal | null = null;
    for (const b of world.pool) {
      const m = mag(b.value);
      if (m.gte(1024) && (apex === null || m.gt(apex))) apex = m;
    }
    if (!apex) {
      launchPlan = null;
      return;
    }
    const out = apex.pow(4);
    const need = unifiedNeed(out, 2); // = apex class
    launchPlan = { aMag: apex, need, band: unifiedBand(need) };
  }

  function tryLaunch(): boolean {
    if (!launchPlan || budget < 2) return false;
    const pad = expIdle();
    if (pad < 0) return false;
    const { aMag, need, band } = launchPlan;
    // full coverage AFTER removing the operand itself — never the trap
    const copies = world.pool.filter((b) => mag(b.value).eq(aMag)).reduce((n, b) => n + (b.count ?? 1), 0);
    const sumWithoutOperand = bandSum(world, band.min, band.cap).sub(aMag.gte(band.min) && aMag.lte(band.cap) ? aMag : Decimal.dZero);
    if (copies < 1 || sumWithoutOperand.lt(need)) return false;
    const four = takeOne(p, 0, (m) => m.eq(4)) ?? takeOne(p, 0, (m) => m.gte(2) && m.lte(8), false);
    if (!four) return false; // need an exponent block (machinist keeps small stock alive)
    const a = takeOne(p, 0, (m) => m.eq(aMag));
    if (!a) {
      pushBack(world, four);
      return false;
    }
    if (!act(() => feedOperand(world, pad, 0, a))) {
      pushBack(world, a);
      pushBack(world, four);
      return false;
    }
    act(() => feedOperand(world, pad, 1, four));
    launches++;
    launchTicks.push(tNow);
    launchPlan = null;
    return true;
  }

  /** Feed notes to started ops, neediest (largest work) first. */
  function service(): boolean {
    const working = [...world.cells.values()]
      .filter((c) => c.op && c.op.scaffold && c.op.unifiedNeed)
      .sort((a, b) => (b.op!.work.gt(a.op!.work) ? 1 : -1));
    for (const c of working) {
      const op = c.op!;
      const mandatoryLeft = op.fuelRequired.gt(0) && op.fuelPaid.lt(op.fuelRequired);
      const clockLeft = op.work.gt(op.progress) && op.work.gt(CREEP_OK);
      if (!mandatoryLeft && !clockLeft) continue;
      const sc = op.scaffold!;
      const f = takeOne(p, 0, (m) => m.gte(sc.min) && m.lte(sc.cap));
      if (!f) continue;
      if (!act(() => injectFuel(world, c.id, f))) {
        pushBack(world, f);
        return false;
      }
      return true;
    }
    return false;
  }

  /** Mult-grow: square the biggest affordable pair (claims-aware coverage). */
  function grow(): boolean {
    if (budget < 2) {
      // a 2-act move is pending — SAVE UP (suppress 1-act spenders this tick)
      if (anyIdle(mults)) wantBudget = true;
      return false;
    }
    const pad = anyIdle(mults);
    if (!pad) return false;
    const padId = pad.id;
    const classes: { m: Decimal; copies: number }[] = [];
    for (const b of world.pool) {
      const m = mag(b.value);
      const e = classes.find((c) => c.m.eq(m));
      if (e) e.copies += b.count ?? 1;
      else classes.push({ m, copies: b.count ?? 1 });
    }
    classes.sort((a, b) => (b.m.gt(a.m) ? 1 : -1));
    for (const cl of classes.slice(0, 8)) {
      if (cl.m.lt(16)) break;
      const pairSelf = cl.copies >= 2;
      const partner = pairSelf ? cl : classes.find((c) => !c.m.eq(cl.m) && c.m.gte(cl.m.div(16)));
      if (!partner) continue;
      const out = cl.m.mul(partner.m);
      const work = operationWork(real(out), 'multiplication', T);
      const need = unifiedNeed(out, 1);
      const band = unifiedBand(need);
      // strict growth past the larger operand (no sideways churn) — but
      // INTERMEDIATE rungs below the peak are legitimate: that's the rebuild
      if (out.lte(Decimal.max(cl.m, partner.m))) continue;
      if (work.gt(CREEP_OK)) {
        // coverage after the operands leave the pool
        let cover = bandSum(world, band.min, band.cap);
        if (cl.m.gte(band.min) && cl.m.lte(band.cap)) cover = cover.sub(cl.m);
        if (partner.m.gte(band.min) && partner.m.lte(band.cap)) cover = cover.sub(partner.m);
        if (cover.lt(need)) {
          // blocked on fuel — register the want so the machinist mints it
          growPlan = { need: need.sub(Decimal.max(0, cover)).add(need.div(8)), band };
          continue;
        }
      }
      if (!mayTake(p, cl.m, 3) || !mayTake(p, partner.m, 3)) continue;
      // take BOTH before feeding either — a half-fed pad is a dead pad
      const a = takeOne(p, 3, (m) => m.eq(cl.m));
      if (!a) continue;
      const b2 = takeOne(p, 3, (m) => m.eq(partner.m));
      if (!b2) {
        pushBack(world, a);
        continue;
      }
      if (!act(() => feedOperand(world, padId, 0, a))) {
        pushBack(world, a);
        pushBack(world, b2);
        return false;
      }
      if (!act(() => feedOperand(world, padId, 1, b2))) pushBack(world, b2);
      ops++;
      return true;
    }
    return false;
  }

  /** Rush queued builds with blocks nobody has claimed. */
  function rush(): boolean {
    const slots = currentBuildSlots(world);
    let queued = 0;
    for (const c of world.cells.values()) {
      if (c.built || c.materialNeed) continue;
      queued++;
      if (queued <= slots) continue; // the pencil is already on it
      const remaining = c.buildWork.sub(c.buildProgress);
      if (remaining.lte(0)) continue;
      const f = takeOne(p, 3, (m) => m.gte(remaining.mul(0.25)) && m.lte(remaining.mul(8)), false);
      if (!f) continue;
      if (!act(() => injectFuel(world, c.id, f))) {
        pushBack(world, f);
        return false;
      }
      return true;
    }
    return false;
  }

  /** Pay bills: drop an in-band block on the cell (the machinist made it). */
  function payBills(): boolean {
    for (const c of world.cells.values()) {
      if (!c.materialNeed) continue;
      const { min, max } = c.materialNeed;
      const f = takeOne(p, 1, (m) => m.gte(min) && m.lte(max), false);
      if (f) {
        if (!act(() => injectFuel(world, c.id, f))) {
          pushBack(world, f);
          return false;
        }
        return true;
      }
      const claim = p.claims.find((cl) => cl.tag === `bill#${c.id}`);
      if (claim && machine(claim)) return true;
    }
    return false;
  }

  // ── The loop ─────────────────────────────────────────────────────────────
  /** Set when a two-act move (grow, pair-machining) was blocked ONLY by
   *  budget: optional one-act spenders (rush, widen) stand down so the
   *  budget can accumulate — a player saves up for the move they intend. */
  let wantBudget = false;
  let tNow = 0;
  const timeline: PlayerResult['timeline'] = [];
  const tlEvery = Math.max(1, Math.floor(ticks / 12));
  const traceEvery = Math.max(1, Math.floor(ticks / 24));
  if (opts.trace) console.log('      t |        frontier        | digits |  cov | rent | acts | ops | launches');

  for (let t = 1; t <= ticks; t++) {
    tNow = t;
    budget = Math.min(BUDGET_CAP, budget + rate);
    wantBudget = false;
    let guard = 0;
    let acted = true;
    while (budget >= 1 && acted && guard++ < 60) {
      acted = false;
      refreshClaims();
      if (as('place', placeNext)) {
        acted = true;
        continue;
      }
      if (as('bills', payBills)) {
        acted = true;
        continue;
      }
      if (as('service', service)) {
        acted = true;
        continue;
      }
      if (as('ink', keepInk)) {
        acted = true;
        continue;
      }
      planLaunch();
      refreshClaims();
      if (as('launch', tryLaunch)) {
        acted = true;
        continue;
      }
      const stock = p.claims.find((c) => c.tag === 'stock');
      if (stock && as('stock', () => machine(stock))) {
        acted = true;
        continue;
      }
      growPlan = null; // re-derived by grow() when coverage blocks it
      if (as('grow', grow)) {
        acted = true;
        continue;
      }
      refreshClaims();
      const gstock = p.claims.find((c) => c.tag === 'growstock');
      if (gstock && as('growstock', () => machine(gstock))) {
        acted = true;
        continue;
      }
      if (wantBudget) break; // saving up — optional spenders stand down
      if (as('widen', widen)) {
        acted = true;
        continue;
      }
      if (as('rush', rush)) acted = true;
    }
    tick(world, 1);
    if (opts.trace && t === 12000) {
      // TEMP probe
      const classes = new Map<string, number>();
      for (const b of world.pool) {
        const k = mag(b.value).toString();
        classes.set(k, (classes.get(k) ?? 0) + (b.count ?? 1));
      }
      const led = ledgerId >= 0 ? world.cells.get(ledgerId) : null;
      console.log(
        `  PROBE inkMills=${inkMills.length} cov=${world.inkCoverage.toFixed(2)} rent=${world.inkDemand} ledStore=${led?.store.length ?? -1} pool=${[...classes.entries()].slice(0, 12).map(([k, v]) => `${k}x${v}`).join(' ')}`,
      );
      for (const id of inkMills) {
        const c = world.cells.get(id)!;
        console.log(`  PROBE inkmill#${id} built=${c.built} bill=${c.materialNeed ? c.materialNeed.min.toString() : '-'} op=${c.op ? 'grinding' : 'idle'} gear=${c.millDivisor}`);
      }
    }
    if (T.upkeepCoeff > 0 && world.inkDemand.gt(0)) coverageMin = Math.min(coverageMin, world.inkCoverage);
    // landmarks (+ snapshots)
    for (const c of world.cells.values()) {
      if (!c.built) continue;
      if (c.kind === 'multiplication') mark('mult', t);
      if (c.kind === 'mill') mark('mill', t);
      if (c.kind === 'ledger') mark('ledger', t);
      if (c.kind === 'exponentiation') mark('exp', t);
    }
    if (launches === 1) mark('launch', t);
    if (launches === 3) mark('tower', t);
    if (t % tlEvery === 0) {
      timeline.push({
        t,
        digits: magnitudeDigits(real(world.peakMagnitude)).toString(),
        score: totalScore(world).toString(),
        cov: Math.round(world.inkCoverage * 100) / 100,
        rent: world.inkDemand.toString(),
        cells: [...world.cells.values()].filter((c) => c.built).length,
        ops,
        launches,
      });
    }
    if (opts.trace && t % traceEvery === 0) {
      console.log(
        `  ${String(t).padStart(5)} | ${world.peakMagnitude.toString().padStart(22)} | ${magnitudeDigits(real(world.peakMagnitude)).toString().padStart(6)} | ${world.inkCoverage.toFixed(2)} | ${world.inkDemand.toString().padStart(4)} | ${String(actions).padStart(4)} | ${ops} | ${launches}`,
      );
    }
  }

  return {
    frontierStr: world.peakMagnitude.toString(),
    digits: magnitudeDigits(real(world.peakMagnitude)).toString(),
    score: totalScore(world).toString(),
    actions,
    ops,
    launches,
    landmarks,
    launchTicks,
    coverageMin,
    actionsBy,
    timeline,
  };
}

// ── Snapshots → dev presets ──────────────────────────────────────────────────

interface SnapshotJson {
  key: string;
  label: string;
  blurb: string;
  cells: { kind: CellKind; x: number; y: number; built: boolean; divisor?: number; store?: { n: string; count: number }[] }[];
  pipes: { from: number; fromPort: number; to: number; toPort: number; fuel: boolean }[];
  pool: { n: string; x: number; y: number; count: number }[];
}

function serializeWorld(key: string, label: string, blurb: string, world: World): SnapshotJson {
  const ids = [...world.cells.keys()];
  const idx = new Map(ids.map((id, i) => [id, i]));
  return {
    key,
    label,
    blurb,
    cells: ids.map((id) => {
      const c = world.cells.get(id)!;
      const out: SnapshotJson['cells'][number] = { kind: c.kind, x: c.x, y: c.y, built: c.built };
      if (c.kind === 'mill') out.divisor = c.millDivisor.toNumber();
      if (c.store.length > 0) out.store = c.store.map((e) => ({ n: mag(e.value).toString(), count: e.count }));
      return out;
    }),
    pipes: [...world.pipes.values()]
      .filter((pi) => idx.has(pi.fromCell) && idx.has(pi.toCell))
      .map((pi) => ({ from: idx.get(pi.fromCell)!, fromPort: pi.fromPort, to: idx.get(pi.toCell)!, toPort: pi.toPort, fuel: pi.fuel })),
    pool: world.pool.map((b) => ({ n: mag(b.value).toString(), x: b.x, y: b.y, count: b.count ?? 1 })),
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  let rate = 1;
  let ticks = 14400;
  let trace = false;
  let snapshots = false;
  let writeSpeed = INK_TUNING.writeSpeed;
  let upkeep = INK_TUNING.upkeepCoeff;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--rate') rate = Number(a[++i]);
    else if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--trace') trace = true;
    else if (a[i] === '--snapshots') snapshots = true;
    else if (a[i] === '--write-speed') writeSpeed = Number(a[++i]);
    else if (a[i] === '--upkeep') upkeep = Number(a[++i]);
  }
  const tuning: TimeTuning = { ...INK_TUNING, writeSpeed, upkeepCoeff: upkeep };

  const SNAP_META: Record<string, { label: string; blurb: string }> = {
    mill: { label: 'Player: first machines', blurb: "the player agent's opening — trees up, the bench row arriving" },
    ledger: { label: 'Player: the rent begins', blurb: 'the ink line goes in BEFORE the office runs dry' },
    exp: { label: 'Player: launch pads', blurb: 'exponentiation built — the million-bill paid by machine' },
    launch: { label: 'Player: first launch', blurb: 'the first paid leap, notes milled from a second apex' },
    tower: { label: 'Player: the tower', blurb: 'launch funds launch — the recursive ladder running' },
  };
  const dir = 'sim/snapshots';
  const snapFn = snapshots
    ? (name: string, world: World): void => {
        const meta = SNAP_META[name];
        if (!meta) return;
        mkdirSync(dir, { recursive: true });
        const j = serializeWorld(`player-${name}`, meta.label, meta.blurb, world);
        writeFileSync(`${dir}/player-${name}.json`, JSON.stringify(j, null, 1));
        console.log(`  [snapshot] ${dir}/player-${name}.json (${j.cells.length} cells, ${j.pool.length} piles)`);
      }
    : null;

  console.log(
    `The Player @ ${rate} action/s, ${ticks} ticks · INK ERA (write ${writeSpeed} d/s · tax ×${upkeep})${snapshots ? ' · SNAPSHOTS' : ''}:`,
  );
  const r = runPlayer(rate, ticks, { tuning, trace, snapshots: snapFn });
  console.log(`\n  frontier ${r.frontierStr} (${r.digits} digits) | score ${r.score} | ${r.actions} actions | ${r.ops} grows | ${r.launches} launches`);
  const lm = (k: string): string => (r.landmarks[k] ? `${(r.landmarks[k] / 60).toFixed(1)}m` : '—');
  console.log(`  LANDMARKS  mult ${lm('mult')} · mill ${lm('mill')} · ledger ${lm('ledger')} · exp ${lm('exp')} · launch ${lm('launch')} · tower ${lm('tower')}`);
  console.log(`  CADENCE    ${r.launchTicks.length ? r.launchTicks.map((lt) => (lt / 60).toFixed(0) + 'm').join(' → ') : '(none)'}`);
  console.log(`  INK        worst coverage ${(r.coverageMin * 100).toFixed(0)}%`);
  console.log(
    `  ACTIONS    ${Object.entries(r.actionsBy)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
  );
  console.log('  TIMELINE   t · digits · cov · rent · cells · grows · launches');
  for (const row of r.timeline)
    console.log(
      `    ${String(row.t).padStart(6)} · ${row.digits.padStart(6)} · ${String(row.cov).padStart(4)} · ${row.rent.padStart(5)} · ${String(row.cells).padStart(3)} · ${String(row.ops).padStart(4)} · ${row.launches}`,
    );
}

if (process.argv[1]?.endsWith('player.ts')) main();
