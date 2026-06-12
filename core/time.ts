/**
 * Time as Labor — the cost math.
 *
 * One law (see TIME_AS_LABOR.md §2): handling a number costs time proportional
 * to its *magnitude*; building a cell costs time proportional to how many you
 * already own; distance on the page adds to both; burning numbers into a cell
 * buys speed.
 *
 * THE UNIT IS DIGITS (log-magnitude), NOT RAW VALUE. This is the one decision
 * everything hangs off, and it is the only internally consistent choice:
 *
 *   - "Work = the cost of writing the result." Writing 10^200 is writing ~201
 *     digits, so an operation's work scales with the digit-count of its output.
 *   - Climbing stays net-positive. Producing 10^200 costs ~200 work; the fuel
 *     you burn to rush it is measured in digits too (a `1000` block is worth 3,
 *     a `1` is worth 1), so the *value* created dwarfs the *value* burned. If
 *     work scaled with raw value instead, making a number would cost its own
 *     magnitude in fuel and the operator hierarchy would be pointless.
 *   - Small fuel stays good. Per-block fuel contribution is its digit-count, so
 *     big fuel is barely better per block — and big fuel transits slowly
 *     (transit also scales with digits), so a fast stream of small denominations
 *     wins on delivery. The river-of-zeros economy falls out of the physics.
 *   - Zeros are ~free. A zero has 0 digits → ~0 work to write, move, or tap.
 *
 * This module is PURE: no Pixi, no Svelte, no world state. The headless engine
 * (`core/engine.ts`) and any future sim import it directly. Everything is
 * `Decimal`-valued so power-tower outputs (whose digit-counts are themselves
 * astronomical — i.e. "this will finish shortly after the sun does") never
 * overflow `Number`.
 */

import Decimal from 'break_eternity.js';
import { valueMagnitude, type Value } from './value.ts';

/**
 * The balance surface. Every constant the pacing depends on lives here so a
 * future sim can sweep them without touching logic. Defaults are a sane
 * *starting* point only — the real curve is found sim-first (PLAN Phase 5.3).
 * We lean aggressive (steep work growth) per the design, but conservatively
 * enough that the opening minutes still bootstrap by hand.
 */
export interface TimeTuning {
  /** Free progress every cell/pipe earns per tick, before any fuel. The single
   *  most important knob (and the future global time-lever). Nonzero so the
   *  game always trickles forward when idle. */
  baseRate: number;
  /** Operation labor = max(floor, digits(output)^opExponent[kind]). The
   *  exponent is PER OPERATOR and steepens up the hierarchy, so higher
   *  operators are dramatically more labor-intensive per digit. Sub-linear in
   *  value (digit-based), so climbing the hierarchy stays net-positive. */
  opExponent: Record<string, number>;
  opWorkFloor: number;
  /** Build work for the Nth owned cell of a type = buildBase · buildGrowth^N. */
  buildBase: number;
  buildGrowth: number;
  /** Transit work = max(floor, transitCoeff · value^transitExp · distFactor).
   *  Super-linear in VALUE (not digits) so big blocks are frozen — they must be
   *  decomposed (or processed locally) to move. Small blocks always move freely. */
  transitCoeff: number;
  transitExp: number;
  transitDistanceUnit: number;
  transitNearCost: number;
  transitFloor: number;
  /** Min fuel denomination an op accepts = max(1, gradeCoeff · opWork^gradeExp).
   *  A big op refuses fuel below its grade → fuel grades → the tiers chain.
   *  gradeCoeff < 1 keeps the smallest ops accepting `1`s (the base fuel). */
  gradeExp: number;
  gradeCoeff: number;
  /** How a fuel block's progress contribution is computed from its value:
   *   - 'magnitude' : raw value (a 1000-block → 1000 progress). The original law.
   *                   Because op work is only digits(output)^k (polynomial in the
   *                   digit-count) while value is exponential, one recycled big
   *                   output over-pays any op by astronomical margins → fuel is
   *                   never scarce, dedicated fuel production is pointless.
   *   - 'digits'    : (digit-count)^fuelDigitExp (a 1000-block → 3^q). Sub-linear
   *                   in value, so a big output gives only *bounded* fuel; you
   *                   must run (and keep widening) dedicated fuel production to
   *                   feed the digits^k-growing ops. The intended treadmill.
   *  This is the headline tuning lever for "fuel must chase number production". */
  fuelLaw: 'magnitude' | 'digits';
  /** Exponent q in (digits)^q when fuelLaw === 'digits'. q=1 is pure digit-count
   *  (very scarce); larger q eases the scarcity. Matching q to an operator's
   *  opExponent makes ~one recycled same-tier block finish ~one op. */
  fuelDigitExp: number;
  /** Fuel TAX — the "fuel must chase number production" lever. An amplifying op
   *  (multiplication and up) gets an explicit fuel REQUIREMENT of
   *  `fuelTaxCoeff · magnitude(output)^fuelTaxExp` that baseRate canNOT pay down —
   *  only *burned fuel* satisfies it. So a bigger result demands proportionally
   *  more fuel, and you must keep scaling fuel production. It's a magnitude
   *  QUANTITY (conserved — no shatter exploit), and net-positive for
   *  fuelTaxExp < 1 (the tax is a shrinking fraction of the output as it grows).
   *  fuelTaxCoeff = 0 turns it off → the engine behaves exactly as before (fuel
   *  only buys speed). Successor/addition (non-amplifiers) are never taxed. */
  fuelTaxCoeff: number;
  /** Exponent α in magnitude(output)^α for the fuel tax. α<1 keeps climbing
   *  net-positive; α→1 makes the tax a near-constant fraction of output (the
   *  grindiest treadmill); α small makes it negligible at scale. */
  fuelTaxExp: number;
  /** Scales the baseRate that AMPLIFIER ops (multiplication and up) accrue, in
   *  [0,1]. 1 = full baseRate (original behavior); <1 makes amplifiers creep
   *  slower without fuel, so fuel matters more; 0 = fuel-only (mandatory) — but
   *  that collapses the self-fueling cascade (the free base can't feed every
   *  amplifier), so stay above ~0.05. Successor/Addition always get full baseRate
   *  (the free base). The stable middle ground for "fuel must matter". */
  amplifierBaseRateScale: number;
  /** Diminishing returns on OVERPAYING fuel. A block of magnitude V (≥ grade)
   *  contributes effective progress `grade^(1-p) · V^p`, where p = fuelOverpayExp:
   *    p = 1  → effective = V (no diminishing — the original behavior).
   *    p = 0.5→ effective = √(grade·V) (a 100× block buys ~10× → 10% efficient).
   *    p = 0  → effective = grade (any block buys exactly one grade — max penalty).
   *  So you're most efficient paying near the grade (the op's natural
   *  denomination), and dumping one giant block wastes most of it. This is what
   *  makes a STREAM of right-sized fuel (→ piping/automation) the optimal play. */
  fuelOverpayExp: number;
  /** Magnitude FLOOR for the fuel tax: ops whose output ≤ this are free (tax 0),
   *  and above it the tax is `C·(magnitude^α − floor^α)` (continuous at the
   *  floor). This is essential, not cosmetic: small fuel-grade production (the
   *  auto-piped fuel trees that have no fuel feed of their own) must run FREE, or
   *  the whole fuel supply deadlocks. So "you don't pay a fuel tax to make small
   *  numbers — only to push the frontier past the floor." Set it above your fuel
   *  producers' output. 0 = tax everything above magnitude 1 (only sensible if
   *  every amplifier has a fuel feed). */
  fuelTaxFloor: number;
  /** SCAFFOLDING — the exponentiation pacing law ("show your work").
   *  An exp-tier op (exponentiation and up) producing output magnitude M demands
   *  `scaffoldCoeff · M^scaffoldExp` of burned magnitude before it can complete
   *  (the working notes — intermediate powers — the cell consumes), payable
   *  ONLY in blocks within the denomination band [S/scaffoldBand, S]. Blocks
   *  ABOVE the band are refused outright — your finished result is not scratch
   *  paper — which is what breaks the self-funding chain (burn the output →
   *  jump again) the challenger exploited: every jump needs a freshly
   *  mult-produced SET at the new scale, so the pyramid rebuild is forced and
   *  exp events become prepared milestones. baseRate never pays scaffolding
   *  (it's material, not time). 0 = off (the engine behaves exactly as before).
   *  Multiplication and below are NEVER scaffolded — the accelerant economy
   *  (amplifierBaseRateScale/fuelOverpayExp) is their whole cost model. */
  scaffoldCoeff: number;
  /** Exponent α in M^α for scaffolding. The per-launch digit multiplier is
   *  ~1/α (a launch paid with d-digit notes reaches ~d/α digits), so α sets
   *  the milestone size: 0.5 → each prepared launch ~doubles the frontier's
   *  digits. α → 1 makes launches marginal; α small makes them wild. */
  scaffoldExp: number;
  /** Outputs ≤ this magnitude need no scaffolding (continuous at the floor,
   *  same shape as fuelTaxFloor). Keeps a freshly-unlocked exp cell a playful
   *  toy — only BIG jumps demand preparation. */
  scaffoldFloor: number;
  /** Width of the acceptable denomination band: blocks in [S/band, S] count.
   *  Sets how many chunks a launch is paid in (~1–band) — i.e. how much of a
   *  SET the mult factory must mint, not just how much total value. */
  scaffoldBand: number;
  /** CONSTRUCTION CONCURRENCY (build slots — "one pencil"). When > 0, only
   *  the first `buildSlots + (BUILD_SLOT_MILESTONES crossed)` unbuilt cells,
   *  in placement order, accrue baseRate; the rest QUEUE. Fuel still rushes
   *  ANY queued build (hand-paid parallelism — concurrency is priced, never
   *  forbidden), so build ORDER becomes the early strategic puzzle instead of
   *  blueprint-dumping everything at t=0. 0 = unlimited (off — the legacy
   *  parallel-build behaviour every sim baseline assumes). */
  buildSlots: number;
  /** THE UNIFIED LAW ("everything is paid one rung down"). When true, the
   *  grade/overpay/scaffold zoo collapses into ONE closed form anchored on the
   *  game's natural tier ladder (the squaring ladder, rung = log₂ digits):
   *
   *    · An op producing magnitude M wants `need = √M` of fuel, payable ONLY
   *      in the band [need/16, need], pro-rata (paying the full need completes
   *      the work). OPTIONAL for mult-tier amplifiers (baseRate still finishes
   *      — fuel is speed), MANDATORY for exp-tier ops above the floor (the
   *      working notes — scaffolding IS this law).
   *    · Constructing a cell demands a MATERIAL: one block in a tight band
   *      [bill, 1.1·bill] deposited before the pencil starts. First cells of a
   *      kind have fixed bills (the "construct this number" puzzles); repeats
   *      cost max(firstBill, √peak) — priced in the game's own currency.
   *    · Build slots grow one per RUNG of the frontier (digits 6, 12, 24, …).
   *    · Fixed ratios stay fixed (band 16 = the Mill's split; the powered-pipe
   *      service fraction) — the other scale-free shape.
   *
   *  Self-similarity is structural: tier n+1's economy is tier n's with every
   *  number squared. Off = the legacy hand-tuned laws (sims' old baselines). */
  unifiedCosts: boolean;
  /** POWERED LOGISTICS (Slice 3): a covering accelerator's CHARGE carries
   *  transit. A block entering a powered pipe gets effective magnitude
   *  `m / (1 + charge·accelChargeCarry)` for its transit work — "a powered
   *  region can move numbers up to its charge." The charge's per-tick decay is
   *  the standing fuel burn that keeps big logistics running (and it can be
   *  FED BY PIPE — applyFuel on an accelerator adds charge), so late-game
   *  delivery of scaffolding notes is automatable instead of hand-shuttled.
   *  0 = off (the legacy log-boost only; big blocks stay frozen on pipes). */
  accelChargeCarry: number;
  /** WRITE-TIME FLOOR (digits per tick; 0 = off). An op can never complete
   *  faster than writing its output's digits: minTicks = digits(output)/
   *  writeSpeed. Fuel buys down the WORK, but the cell still has to write the
   *  number. This is the counter-law to pro-rata payment: without it, a fully
   *  paid op of ANY size completes instantly, and the recursive exp tower
   *  ("exp pays for exp" — ⁴√ of a launch's output is its own operand class)
   *  runs at action-speed: e18 → e4932 in three minutes. With it, each launch
   *  level writes 4× the digits of the last — the cadence decelerates
   *  geometrically and each rung becomes an era. */
  writeSpeed: number;
}

export const DEFAULT_TUNING: TimeTuning = {
  baseRate: 1,
  // Per-operator labor exponents (digits^k). Steepening up the hierarchy.
  // Starting moderate; the real curve is sim-tuned (sim/time-run.ts).
  opExponent: {
    successor: 1,
    addition: 2,
    multiplication: 3,
    exponentiation: 4,
    tetration: 5,
    pentation: 6,
  },
  opWorkFloor: 2,
  buildBase: 16,
  // Mild geometric repurchase. Was 1.5, but the build-ROI sweep (sim/build-roi.ts)
  // showed 1.5 walls expansion at ~10 cells (payback explodes), which chokes the
  // factory-WIDTH lever that rewards active play. 1.15 keeps every next cell
  // worth building deep into the game ("always something to build").
  buildGrowth: 1.15,
  // Transit super-linear in value: a 1 ≈ free, a 100 ≈ 10 ticks, a 1000 ≈ 300,
  // a 10⁴ ≈ frozen — so you decompose to ~100-grade fuel for fluid transport.
  transitCoeff: 0.01,
  transitExp: 1.5,
  transitDistanceUnit: 240,
  transitNearCost: 0.5,
  transitFloor: 1,
  // Grade ≈ gradeCoeff·sqrt(opWork): an op of labor W needs ~sqrt(W) blocks.
  // gradeCoeff 0.3 keeps tiny ops + small adds accepting `1`s, while
  // multiplication wants ≥~6 and exponentiation ≥~30. (Sim-tuned later.)
  gradeExp: 0.5,
  gradeCoeff: 0.3,
  // Default to the original raw-value law so existing sims/tests/regression are
  // byte-identical until an experiment explicitly opts into 'digits'.
  fuelLaw: 'magnitude',
  fuelDigitExp: 2,
  // Fuel tax OFF by default (coeff 0): no per-op fuel requirement, so the engine
  // is byte-identical to before until an experiment dials it in.
  fuelTaxCoeff: 0,
  fuelTaxExp: 0.5,
  fuelTaxFloor: 0,
  // The fuel-economy lever, LOCKED 2026-06-10 (sim-tuned; see HANDOVER §0):
  // amplifiers creep at HALF baseRate (fuel matters, but never 0 — that
  // collapses the self-fueling cascade), and overpaying fuel has √ diminishing
  // returns (effective = grade^(1-p)·V^p), so a stream of right-sized fuel is
  // optimal. Validated: manager monotonic across the human rate range
  // (e19→e43 / 4h), idle never stalls, −91 oom fuel-dependence at 1 action/s.
  // The pre-lock "vanilla" economy is {amplifierBaseRateScale: 1,
  // fuelOverpayExp: 1} — sims that need it pass it explicitly.
  amplifierBaseRateScale: 0.5,
  fuelOverpayExp: 0.5,
  // Scaffolding OFF by default (coeff 0) while the law is sim-tuned (Slice 1).
  // The exploratory values below are the sweep's starting point, not a lock.
  scaffoldCoeff: 0,
  scaffoldExp: 0.5,
  scaffoldFloor: 1e6,
  scaffoldBand: 64,
  // Write-time floor OFF by default (instant completion stays the baseline
  // until the unified-law experiments dial it in).
  writeSpeed: 0,
  // Build slots OFF by default (unlimited parallel construction — the legacy
  // behaviour the sim baselines assume); the live game opts in via GAME_TUNING.
  buildSlots: 0,
  // Powered logistics OFF by default (legacy log-boost only) — the live game
  // opts in via GAME_TUNING while the lever is play-validated.
  accelChargeCarry: 0,
  // The unified law OFF by default — legacy baselines stay byte-identical.
  unifiedCosts: false,
};

/**
 * THE UNIFIED ECONOMY — the re-anchored candidate (2026-06-10 brainstorm:
 * "everything is paid one rung down"). This is the preset the unified sims and
 * tests target; it is promoted to the live game only after the from-zero arc
 * is validated. Addition drops to d^1.5 (big sums cost a beat, never a wall —
 * the always-cheap machining op); slots and powered logistics are part of the
 * law itself.
 */
export const UNIFIED_TUNING: TimeTuning = {
  ...DEFAULT_TUNING,
  unifiedCosts: true,
  opExponent: {
    successor: 1,
    addition: 1.5,
    multiplication: 3,
    exponentiation: 4,
    tetration: 5,
    pentation: 6,
  },
  buildSlots: 1,
  accelChargeCarry: 1,
};

// --- The unified law's constants -------------------------------------------

/** The universal denomination band ratio: payments live in [need/16, need].
 *  Deliberately equal to the Mill's split count — one pass of the Mill takes a
 *  block from "just too big" to "in band". */
export const UNIFIED_BAND = 16;
/** Material bills with max below this are waived (pocket lint — the opening
 *  successors and adders are free to sketch). */
export const UNIFIED_BILL_WAIVE = 4;
/** Tight-band tolerance on material bills: accept [bill, bill·1.1]. */
export const UNIFIED_BILL_TOLERANCE = 1.1;
/** Exp-tier fuel becomes MANDATORY (the working notes) above this output
 *  magnitude; below it a fresh exponentiation cell is a free toy. */
export const UNIFIED_NOTES_FLOOR = 1e6;

/** First-of-a-kind material bills — the "construct this number" puzzles. The
 *  first multiplication wants a 16 (an adder-chain product: addition's first
 *  moment); the first exponentiation wants a MILLION (the mult game's goal,
 *  visible from the start). 0 = free. */
export const UNIFIED_FIRST_BILL: Record<string, number> = {
  successor: 0,
  addition: 0,
  multiplication: 16,
  mill: 64,
  warehouse: 256,
  accelerator: 1024,
  exponentiation: 1e6,
  tetration: 1e12,
  pentation: 1e15,
};

/** Flat pencil time per kind (the TIME part of construction — small; the
 *  MATERIAL is the project). No geometric repurchase: expansion is priced by
 *  the √peak material anchor instead. */
export const UNIFIED_BUILD_TIME: Record<string, number> = {
  successor: 10,
  addition: 12,
  multiplication: 20,
  mill: 24,
  warehouse: 24,
  accelerator: 24,
  exponentiation: 48,
  tetration: 96,
  pentation: 96,
};

const dSixteen = new Decimal(UNIFIED_BAND);

/** The universal cost, indexed by operator tier: "an operator k tiers up is
 *  paid k rungs down" — need = M^(1/2^k). Multiplication (k=1) pays √M (one
 *  squaring-rung below its product); exponentiation (k=2) pays the fourth
 *  root — which is why exp keeps its CRAZY-LEAP identity: an e20→e80 jump
 *  demands exactly one frontier-class commitment (e20 of notes), affordable
 *  but dramatic, while mult to the same e80 would demand unreachable e40. */
export function unifiedNeed(outputMagnitude: Decimal, tier = 1): Decimal {
  return outputMagnitude.root(Math.pow(2, tier));
}

/** Operator tier for the unified need: how many rungs up the hierarchy the
 *  operator jumps (mult 1, exp 2, tet 3, pent 4). Non-amplifiers are tier 0
 *  (no unified need). */
export function unifiedTier(kind: string): number {
  switch (kind) {
    case 'multiplication':
      return 1;
    case 'exponentiation':
      return 2;
    case 'tetration':
      return 3;
    case 'pentation':
      return 4;
    default:
      return 0;
  }
}

/** The acceptance band for a unified payment of `need`: [need/16, need].
 *  Blocks outside are refused — right-size them (Mill down, Add up). */
export function unifiedBand(need: Decimal): { min: Decimal; cap: Decimal } {
  return { min: Decimal.max(dOne, need.div(dSixteen)), cap: need };
}

/** Material bill for the (owned+1)-th cell of a kind, given the world's peak
 *  magnitude: first cells use the fixed puzzle bills; repeats cost
 *  max(firstBill, √peak) — always payable from the factory you have, never
 *  trivial. Null = waived (below the pocket-lint floor). */
export function materialBill(
  kind: string,
  owned: number,
  peakMagnitude: Decimal,
): { min: Decimal; max: Decimal } | null {
  const first = new Decimal(UNIFIED_FIRST_BILL[kind] ?? 0);
  // Leaf-class kinds (first bill 0: successor, addition) are waived FOREVER —
  // the fractal farm's volume cells must stay cheap; their throttle is pencil
  // time. Only amplifier-class kinds carry √peak repeat bills.
  if (first.lte(0)) return null;
  const bill = owned <= 0 ? first : Decimal.max(first, unifiedNeed(peakMagnitude));
  if (bill.mul(UNIFIED_BILL_TOLERANCE).lt(UNIFIED_BILL_WAIVE)) return null;
  return { min: bill, max: bill.mul(UNIFIED_BILL_TOLERANCE) };
}

/** Pencil count under the unified law: one per RUNG of the frontier — a new
 *  pencil each time the peak's digit-count doubles past 6 (6, 12, 24, 48 …). */
export function unifiedBuildSlots(peakMagnitude: Decimal): number {
  const digits = magnitudeDigits({ kind: 'real', n: peakMagnitude }).toNumber();
  if (!Number.isFinite(digits)) return 12; // tower-class — pencils are not the constraint
  let slots = 1;
  for (let t = 6; digits >= t && slots < 12; t *= 2) slots++;
  return slots;
}

/** Frontier magnitudes that each grant +1 build slot (the second pencil, the
 *  third hand…). Shared by the game (narrator + monitor) and the sims so the
 *  rule can never drift between them. Crossing is judged against the world's
 *  PEAK magnitude ever produced (milestones don't un-happen). */
export const BUILD_SLOT_MILESTONES: number[] = [1e6, 1e12, 1e30, 1e100];

const dZero = Decimal.dZero;
const dOne = Decimal.dOne;

/**
 * Digit-count of a value's magnitude — the unit of *creation cost* (labor).
 *
 *   - 0 (and sets, magnitude 0)  → 0   (free to handle: zeros, the substrate)
 *   - 0 < |v| < 1 (fractions)    → 1   (a few chars; fractions aren't the focus)
 *   - |v| ≥ 1                    → ⌊log₁₀|v|⌋ + 1
 *
 * Returns a `Decimal` because a power tower's digit-count is itself enormous.
 */
export function magnitudeDigits(v: Value): Decimal {
  const m = valueMagnitude(v); // absolute value, Decimal
  if (m.lte(dZero)) return dZero;
  if (m.lt(dOne)) return dOne;
  return m.log10().floor().add(1);
}

/** Per-operator labor exponent (digits^k), defaulting to 1 for unknown kinds. */
export function opExponentFor(kind: string, t: TimeTuning = DEFAULT_TUNING): number {
  return t.opExponent[kind] ?? 1;
}

/**
 * Labor of an operation: `max(floor, digits(output)^k)` where `k` is the
 * operator's exponent. Digit-based (so climbing pays), steep at high tiers.
 */
export function operationWork(output: Value, kind: string, t: TimeTuning = DEFAULT_TUNING): Decimal {
  const digits = magnitudeDigits(output);
  const raw = digits.pow(opExponentFor(kind, t));
  return Decimal.max(raw, new Decimal(t.opWorkFloor));
}

/**
 * Work to construct the `owned`-th cell of a type (0-indexed: the first cell
 * you ever build passes owned=0). Geometric in count — the RTS repurchase
 * scaling, expressed in time. Independent of magnitude (building isn't writing
 * a number).
 */
export function buildWork(owned: number, t: TimeTuning = DEFAULT_TUNING): Decimal {
  const n = Math.max(0, Math.floor(owned));
  return new Decimal(t.buildBase).mul(Decimal.pow(t.buildGrowth, n));
}

/**
 * Work to carry a block of value `v` a distance of `distancePx`. Super-linear
 * in VALUE: small blocks move freely, big blocks are frozen (and must be
 * decomposed to move). `boost` divides the cost (a pipe-accelerator's effect).
 */
export function transitWork(
  v: Value,
  distancePx: number,
  t: TimeTuning = DEFAULT_TUNING,
  boost = 1,
): Decimal {
  const mag = valueMagnitude(v);
  const units = Math.max(0, distancePx) / t.transitDistanceUnit + t.transitNearCost;
  const raw = mag.pow(t.transitExp).mul(t.transitCoeff).mul(units).div(Math.max(1e-9, boost));
  return Decimal.max(raw, new Decimal(t.transitFloor));
}

/**
 * Fuel content of a block = the progress its burning buys, per the tuning's
 * `fuelLaw`:
 *
 *   - 'magnitude' (default): its raw VALUE. Conserved under additive
 *     decomposition (splitting conserves the sum) — no "shatter-to-1s" exploit;
 *     decomposition is a *delivery* tool, not a fuel-multiplier. But because op
 *     work is sub-exponential (digits^k) while value is exponential, a recycled
 *     big block over-pays any op → fuel is effectively never scarce.
 *
 *   - 'digits': (digit-count)^fuelDigitExp. Sub-linear in value, so a big block
 *     buys only bounded progress and you must run dedicated fuel production that
 *     *scales with the climb*. Still conserved-ish at the small end (a value-1
 *     block buys 1), and still monotonic, so grading/delivery logic is unchanged.
 *
 * Either way the block is consumed (a real spend against Total Score).
 */
export function fuelValue(v: Value, t: TimeTuning = DEFAULT_TUNING): Decimal {
  if (t.fuelLaw === 'digits') return magnitudeDigits(v).pow(t.fuelDigitExp);
  return valueMagnitude(v);
}

/**
 * The fuel TAX for an amplifying op that produces a result of the given
 * magnitude: `fuelTaxCoeff · magnitude^fuelTaxExp`, the amount of fuel-magnitude
 * that MUST be burned for the op to complete (baseRate can't pay it). Zero when
 * the tax is off (coeff ≤ 0) or the output is trivial (≤ 1, e.g. a successor's
 * `1`). The engine applies this only to amplifiers (multiplication and up) —
 * successor/addition are plumbing and never taxed.
 */
export function fuelTax(outputMagnitude: Decimal, t: TimeTuning = DEFAULT_TUNING): Decimal {
  if (t.fuelTaxCoeff <= 0) return dZero;
  const floor = new Decimal(Math.max(1, t.fuelTaxFloor));
  if (outputMagnitude.lte(floor)) return dZero; // small production is free (fuel trees run)
  const above = outputMagnitude.pow(t.fuelTaxExp).sub(floor.pow(t.fuelTaxExp));
  return Decimal.max(dZero, above).mul(t.fuelTaxCoeff);
}

/**
 * Minimum fuel denomination an operation of labor `opWork` will accept:
 * `max(1, opWork^gradeExp)`. Smaller blocks are refused — this is what creates
 * fuel grades and chains the tiers.
 */
export function minFuelDenomination(opWork: Decimal, t: TimeTuning = DEFAULT_TUNING): Decimal {
  return Decimal.max(dOne, opWork.pow(t.gradeExp).mul(t.gradeCoeff));
}

/**
 * SCAFFOLDING requirement for an exp-tier op producing the given output
 * magnitude: `scaffoldCoeff · (M^α − floor^α)` above the floor (continuous
 * there, like the fuel tax), zero at or below it. This is the burned-magnitude
 * the op demands as working notes — payable only in the denomination band
 * [S/scaffoldBand, S] (the engine enforces the band). Zero when off (coeff ≤ 0).
 */
export function scaffoldRequirement(outputMagnitude: Decimal, t: TimeTuning = DEFAULT_TUNING): Decimal {
  if (t.scaffoldCoeff <= 0) return dZero;
  const floor = new Decimal(Math.max(1, t.scaffoldFloor));
  if (outputMagnitude.lte(floor)) return dZero; // small jumps are a free toy
  const above = outputMagnitude.pow(t.scaffoldExp).sub(floor.pow(t.scaffoldExp));
  return Decimal.max(dZero, above).mul(t.scaffoldCoeff);
}

/**
 * Ticks to finish `work` at a given steady `rate` (= baseRate + any sustained
 * fuel feed). Convenience for the sim / previews; the engine itself accrues
 * progress incrementally so discrete fuel chunks are handled exactly.
 * `Infinity` when rate ≤ 0.
 */
export function ticksToComplete(work: Decimal, rate: number): number {
  if (rate <= 0) return Infinity;
  return work.div(rate).toNumber();
}
