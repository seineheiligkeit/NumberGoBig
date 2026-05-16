/**
 * Dev preset: an end-game factory written into localStorage for testing.
 *
 * Snapshot deep into Stage E/F (~3+ h of play). Designed primarily to
 * showcase the Iteration Wave (Slices 6.11–6.18):
 *
 *   - **Translation Operator** (T-bot) sweeping a cultivation region.
 *   - **Inversion + Negation + wh: negative** loop wired end to end —
 *     small rational → Inversion (fuelled by negatives) → big number.
 *   - **Tetration** cell with explicit fuel routing from a wh<1000.
 *   - **Leveled cells** (Roman-numeral badges) — Successor lvl 4,
 *     Multiplication lvl 4, Exponentiation lvl 3.
 *   - **Magnitude-ladder rendering** — a 10^9 and a power-tower
 *     loose for inspection.
 *
 * # Layout (canvas coords)
 *
 *   Band 1 (y≈ 140) — bootstrap (river-tap from Successor lvl 3+
 *                     means no pipe ≤1 needed)
 *   Band 2 (y≈ 320) — multiplication + exponentiation column
 *   Band 3 (y≈ 520) — Inversion family + tetration
 *   Band 4 (y≈ 720) — cultivation + T-bot
 *   Top   (y≈  40) — magnitude showcase (10^9, power-tower)
 *
 * # Why this preset doesn't fall apart
 *
 *   - All operator-tier fuel ports are explicitly wired or sit next to
 *     a same-magnitude warehouse the global pool will draw from.
 *   - The T-bot is positioned within sweep radius of the cultivation
 *     output ports; matching warehouses (wh<10, wh<100) accept the
 *     stream so nothing piles up.
 *   - wh:negative is pre-stocked so Inversion can fire on day one.
 *   - All purchase counts are set so the player sees mature scaling
 *     costs in Literature (no "next is cheap" anomalies).
 */
import type { SaveData } from '../lib/persistence';
import type { BlockSnapshot, CellSnapshot, PipeSnapshot } from '../lib/world';

const STORAGE_KEY = 'numbers-go-big.save';

const CID = {
  // Band 1 — bootstrap (river-tap successors, no pipe needed)
  succLvl4_1: 1,
  succLvl4_2: 2,
  whOnes: 3,
  add: 4,
  whTwos: 5,
  whTens: 6,
  // Band 2 — multiplication / exponentiation column
  mul: 7,
  whHundreds: 8,
  exp: 9,
  whThousands: 10,
  whMillions: 11,
  // Band 3 — Inversion family + tetration
  div: 12,
  negation: 13,
  whNegative: 14,
  inversion: 15,
  whRationals: 16,
  tetration: 17,
  whLt1000: 18,
  // Band 4 — cultivation + T-bot
  cultArith: 19,
  cultGeo: 20,
  whLt100: 21,
  tbot: 22,
  // Side bank — utility operators
  sub: 23,
  decrement: 24,
  factor: 25,
  sqrt: 26,
} as const;

function real(n: string | number): BlockSnapshot['value'] {
  return { kind: 'real', n: String(n) };
}

function rational(num: string | number, den: string | number): BlockSnapshot['value'] {
  return { kind: 'rational', num: String(num), den: String(den) };
}

function buildPreset(): SaveData {
  const Y_BOOT = 140;
  const Y_MUL = 320;
  const Y_INV = 520;
  const Y_CULT = 720;

  const cells: CellSnapshot[] = [
    // ── Band 1: bootstrap ───────────────────────────────────────────
    // Two Successors at lvl 4 — river-tap (lvl 3+) means they emit
    // ones directly without needing a pipe ≤1 attached. Each emits
    // 2^3 = 8 ones per firing (lvl 4 multiplier).
    { type: 'successor', x: 180, y: Y_BOOT - 50, pending: [null] },
    { type: 'successor', x: 180, y: Y_BOOT + 50, pending: [null] },
    // 3. wh-ones — pre-stocked, the river-tap feeds it.
    {
      type: 'warehouse',
      x: 380,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(1), storedCount: 88, capacity: 100 },
    },
    // 4. Addition.
    { type: 'addition', x: 580, y: Y_BOOT, pending: [null, null] },
    // 5. wh-twos.
    {
      type: 'warehouse',
      x: 780,
      y: Y_BOOT - 60,
      pending: [null],
      warehouseState: { storedValue: real(2), storedCount: 64, capacity: 100 },
    },
    // 6. wh-tens — fuel reservoir for the mul/exp column.
    {
      type: 'warehouse',
      x: 780,
      y: Y_BOOT + 60,
      pending: [null],
      warehouseState: { storedValue: real(10), storedCount: 72, capacity: 100 },
    },

    // ── Band 2: multiplication + exponentiation column ──────────────
    // 7. Multiplication lvl 4 — emits 2^3 = 8 outputs per firing.
    { type: 'multiplication', x: 240, y: Y_MUL, pending: [null, null, null] },
    // 8. wh-hundreds — accumulated mul output.
    {
      type: 'warehouse',
      x: 440,
      y: Y_MUL,
      pending: [null],
      warehouseState: { storedValue: real(100), storedCount: 56, capacity: 100 },
    },
    // 9. Exponentiation lvl 3 — output flows into wh-thousands.
    { type: 'exponentiation', x: 640, y: Y_MUL, pending: [null, null, null] },
    // 10. wh-thousands.
    {
      type: 'warehouse',
      x: 840,
      y: Y_MUL,
      pending: [null],
      warehouseState: { storedValue: real(1000), storedCount: 41, capacity: 100 },
    },
    // 11. wh-millions — manual stock from earlier exp firings.
    {
      type: 'warehouse',
      x: 1040,
      y: Y_MUL,
      pending: [null],
      warehouseState: { storedValue: real(1_000_000), storedCount: 8, capacity: 100 },
    },

    // ── Band 3: Inversion family + tetration ────────────────────────
    // 12. Division — produces the small rationals that feed Inversion.
    { type: 'division', x: 180, y: Y_INV, pending: [null, null, null] },
    // 13. Negation — sign-flip cell, source of negatives for wh-negative.
    { type: 'negation', x: 380, y: Y_INV, pending: [null] },
    // 14. wh: negative — fuel reservoir for Inversion. Pre-stocked
    // with a mix of small negatives so the player can immediately
    // fire Inversion on a tiny rational and watch it produce a big
    // number with the "cost is negative" narrator beat.
    {
      type: 'warehouse-rule',
      x: 580,
      y: Y_INV,
      pending: [null],
      ruleWarehouseState: {
        ruleId: 'negative',
        items: [
          { value: real(-1), count: 8 },
          { value: real(-2), count: 6 },
          { value: real(-3), count: 4 },
          { value: real(-5), count: 3 },
        ],
        capacity: 100,
      },
    },
    // 15. Inversion — the centrepiece. Operand from division output;
    // fuel from wh-negative wired below.
    { type: 'inversion', x: 780, y: Y_INV, pending: [null, null] },
    // 16. wh-rationals — collects Inversion's output (currently
    // mixed because Inversion produces both rationals and integers
    // depending on input). Typed warehouse won't lock until first
    // deposit — left empty.
    {
      type: 'warehouse',
      x: 980,
      y: Y_INV,
      pending: [null],
      warehouseState: { storedValue: null, storedCount: 0, capacity: 100 },
    },
    // 17. Tetration — fuelled by wh<1000.
    { type: 'tetration', x: 1180, y: Y_INV, pending: [null, null, null] },
    // 18. wh<1000 rule warehouse — feeds tetration's required fuel
    // port. Stocked with mid-magnitude blocks.
    {
      type: 'warehouse-rule',
      x: 1180,
      y: Y_INV + 200,
      pending: [null],
      ruleWarehouseState: {
        ruleId: 'lt1000',
        items: [
          { value: real(50), count: 5 },
          { value: real(100), count: 6 },
          { value: real(500), count: 3 },
        ],
        capacity: 100,
      },
    },

    // ── Band 4: cultivation + T-bot ─────────────────────────────────
    // 19. Arithmetic cultivation (seed = 1) — emits 1, 2, 3, 4, …
    {
      type: 'cultivation-arithmetic',
      x: 240,
      y: Y_CULT,
      pending: [null],
      cultivationState: {
        seed: real(1),
        cultivationStep: 12,
        cultivationCooldownMs: 1800,
        cultivationCooldownRemaining: 900,
      },
    },
    // 20. Geometric cultivation (seed = 1) — emits 1, 2, 4, 8, …
    {
      type: 'cultivation-geometric',
      x: 440,
      y: Y_CULT,
      pending: [null],
      cultivationState: {
        seed: real(1),
        cultivationStep: 6,
        cultivationCooldownMs: 1800,
        cultivationCooldownRemaining: 1100,
      },
    },
    // 21. wh<100 — destination for the T-bot's cultivation sweep.
    {
      type: 'warehouse-rule',
      x: 720,
      y: Y_CULT,
      pending: [null],
      ruleWarehouseState: {
        ruleId: 'lt100',
        items: [
          { value: real(4), count: 3 },
          { value: real(8), count: 4 },
          { value: real(16), count: 2 },
          { value: real(32), count: 1 },
        ],
        capacity: 100,
      },
    },
    // 22. T-bot — within sweep radius of both cultivation outputs.
    {
      type: 'cleanup-bot',
      x: 360,
      y: Y_CULT + 110,
      pending: [],
      botState: {
        botRadius: 240,
        botCooldownMs: 2500,
        botCooldownRemaining: 1200,
        botPhase: 'idle',
        botTargetBlockId: null,
        botDestCellId: null,
        botWorkerX: 360,
        botWorkerY: Y_CULT + 110,
        botSpeed: 100,
        botCarried: null,
      },
    },

    // ── Side bank: utility operators, unpiped, for hand use ─────────
    { type: 'subtraction', x: 940, y: Y_CULT - 60, pending: [null, null] },
    { type: 'decrement', x: 940, y: Y_CULT + 40, pending: [null] },
    { type: 'factor', x: 1140, y: Y_CULT - 60, pending: [null] },
    { type: 'square-root', x: 1140, y: Y_CULT + 40, pending: [null] },
  ];

  const pipes: PipeSnapshot[] = [
    // Successor lvl 3+ river-tap means no pipe ≤1 needed — successors
    // pull zeros directly from the river driver. The pipes start at
    // the successor outputs.

    // Successors → wh-ones.
    {
      source: { kind: 'cell-output', cellId: CID.succLvl4_1, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whOnes, portIndex: 0 },
      magnitude: 10,
      cooldownMs: 800,
      cooldownRemaining: 200,
    },
    {
      source: { kind: 'cell-output', cellId: CID.succLvl4_2, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whOnes, portIndex: 0 },
      magnitude: 10,
      cooldownMs: 800,
      cooldownRemaining: 500,
    },
    // wh-ones → addition (both inputs).
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.add, portIndex: 0 },
      magnitude: 10,
      cooldownMs: 700,
      cooldownRemaining: 300,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.add, portIndex: 1 },
      magnitude: 10,
      cooldownMs: 700,
      cooldownRemaining: 600,
    },
    // addition → wh-twos.
    {
      source: { kind: 'cell-output', cellId: CID.add, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whTwos, portIndex: 0 },
      magnitude: 10,
      cooldownMs: 700,
      cooldownRemaining: 400,
    },

    // ── Multiplication column ──────────────────────────────────────
    // wh-tens × wh-tens → multiplication (using wh-tens for both
    // operands — produces hundreds).
    {
      source: { kind: 'cell-output', cellId: CID.whTens, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.mul, portIndex: 0 },
      magnitude: 100,
      cooldownMs: 700,
      cooldownRemaining: 100,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whTens, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.mul, portIndex: 1 },
      magnitude: 100,
      cooldownMs: 700,
      cooldownRemaining: 400,
    },
    // multiplication → wh-hundreds.
    {
      source: { kind: 'cell-output', cellId: CID.mul, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whHundreds, portIndex: 0 },
      magnitude: 1000,
      cooldownMs: 700,
      cooldownRemaining: 350,
    },

    // ── Exponentiation column ──────────────────────────────────────
    // exp inputs: base from wh-hundreds, exponent from wh-twos (so
    // it produces 100^2 = 10000 per firing). Plus fuel from wh-tens.
    {
      source: { kind: 'cell-output', cellId: CID.whHundreds, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.exp, portIndex: 0 },
      magnitude: 1000,
      cooldownMs: 1000,
      cooldownRemaining: 200,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whTwos, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.exp, portIndex: 1 },
      magnitude: 10,
      cooldownMs: 1000,
      cooldownRemaining: 500,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whTens, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.exp, portIndex: 2 },
      magnitude: 100,
      cooldownMs: 1000,
      cooldownRemaining: 700,
    },

    // ── Inversion family ───────────────────────────────────────────
    // Division: dividend = wh-ones (1), divisor = wh-hundreds (100).
    // Produces 1/100 — exactly the kind of small rational Inversion
    // wants. Fuel from wh-tens (tier 1 div).
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.div, portIndex: 0 },
      magnitude: 10,
      cooldownMs: 1200,
      cooldownRemaining: 300,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whHundreds, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.div, portIndex: 1 },
      magnitude: 1000,
      cooldownMs: 1200,
      cooldownRemaining: 700,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whTens, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.div, portIndex: 2 },
      magnitude: 100,
      cooldownMs: 1200,
      cooldownRemaining: 100,
    },
    // Division output → Inversion operand (port 0). The small
    // rational 1/100 lands at the Inversion cell's operand port,
    // and Inversion pulls a negative from wh-negative as fuel.
    {
      source: { kind: 'cell-output', cellId: CID.div, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.inversion, portIndex: 0 },
      magnitude: 100,
      cooldownMs: 1500,
      cooldownRemaining: 400,
    },
    // wh-negative → Inversion fuel port (port 1).
    {
      source: { kind: 'cell-output', cellId: CID.whNegative, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.inversion, portIndex: 1 },
      magnitude: 100,
      cooldownMs: 1500,
      cooldownRemaining: 800,
    },
    // Inversion output → wh-rationals.
    {
      source: { kind: 'cell-output', cellId: CID.inversion, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whRationals, portIndex: 0 },
      magnitude: 100,
      cooldownMs: 1500,
      cooldownRemaining: 600,
    },

    // ── Tetration ──────────────────────────────────────────────────
    // Tetration: base from wh-twos (2), height from wh-twos (2).
    // 2 ↑↑ 2 = 4. Modest output to keep the warehouse happy.
    // Plus fuel from wh<1000.
    {
      source: { kind: 'cell-output', cellId: CID.whTwos, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.tetration, portIndex: 0 },
      magnitude: 10,
      cooldownMs: 2000,
      cooldownRemaining: 800,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whTwos, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.tetration, portIndex: 1 },
      magnitude: 10,
      cooldownMs: 2000,
      cooldownRemaining: 1200,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whLt1000, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.tetration, portIndex: 2 },
      magnitude: 1000,
      cooldownMs: 2000,
      cooldownRemaining: 1500,
    },
  ];

  const blocks: BlockSnapshot[] = [
    // Magnitude showcase along the top — pre-discovered values.
    { value: real(1_000_000_000), count: 1, x: 200, y: 40 },
    { value: real('1e1000'), count: 1, x: 400, y: 40 }, // power-tower territory
    { value: real(-100), count: 1, x: 600, y: 40 }, // negative showcase
    { value: rational(1, 7), count: 1, x: 800, y: 40 }, // rational showcase
    // A few loose blocks near the operator bank for hand exploration.
    { value: real(144), count: 1, x: 1340, y: Y_CULT - 80 },
    { value: real(1729), count: 1, x: 1340, y: Y_CULT },
    { value: real(7), count: 1, x: 1340, y: Y_CULT + 80 },
  ];

  return {
    version: 14,
    blocks,
    cells,
    achievements: [
      'play_with_zeros',
      'first_negative',
      'first_rational',
      'first_irrational',
      'first_complex',
    ],
    unlocks: [
      'successor',
      'addition',
      'subtraction',
      'multiplication',
      'division',
      'exponentiation',
      'tetration',
      'decrement',
      'factor',
      'square-root',
      'negation',
      'inversion',
      'warehouse',
      'warehouse_rule_lt10',
      'warehouse_rule_lt100',
      'warehouse_rule_lt1000',
      'warehouse_rule_negative',
      'pipe_1',
      'pipe_10',
      'pipe_100',
      'pipe_1k',
      'cultivation-arithmetic',
      'cultivation-geometric',
      'cleanup-bot',
      'comprehension_25',
      'comprehension_100',
      'comprehension_250',
      'comprehension_1k',
      'comprehension_10k',
      'comprehension_100k',
      'comprehension_1m',
    ],
    purchaseCounts: [
      ['successor', 2],
      ['addition', 1],
      ['subtraction', 1],
      ['multiplication', 1],
      ['division', 1],
      ['exponentiation', 1],
      ['tetration', 1],
      ['decrement', 1],
      ['factor', 1],
      ['square-root', 1],
      ['negation', 1],
      ['inversion', 1],
      ['warehouse', 4],
      ['warehouse_rule_lt100', 1],
      ['warehouse_rule_lt1000', 1],
      ['warehouse_rule_negative', 1],
      ['pipe_1', 4],
      ['pipe_10', 6],
      ['pipe_100', 6],
      ['pipe_1k', 2],
      ['cultivation-arithmetic', 1],
      ['cultivation-geometric', 1],
      ['cleanup-bot', 1],
      ['comprehension_25', 1],
      ['comprehension_100', 1],
      ['comprehension_250', 1],
      ['comprehension_1k', 1],
      ['comprehension_10k', 1],
      ['comprehension_100k', 1],
      ['comprehension_1m', 1],
    ],
    seenMarginalia: [
      'first_pickup',
      'achievement_play_with_zeros',
      'first_one',
      'first_negative',
      'first_rational',
      'first_irrational',
      'first_complex',
      'first_inversion_negative_fuel',
    ],
    camera: { x: 0, y: 0, scale: 0.7 },
    comprehension: 1_000_000,
    pipes,
    discoveries: [
      'real:0', 'real:1', 'real:2', 'real:3', 'real:4', 'real:5',
      'real:6', 'real:7', 'real:8', 'real:9', 'real:10',
      'real:100', 'real:144', 'real:1000', 'real:1729',
      'real:1000000', 'real:1000000000', 'real:1e1000',
      'real:-1', 'real:-2', 'real:-3', 'real:-5', 'real:-100',
      'rational:1/2', 'rational:1/7', 'rational:1/100',
    ],
    cellLevels: [
      ['successor', 4],
      ['addition', 3],
      ['multiplication', 4],
      ['exponentiation', 3],
    ],
    pipeLevels: [
      [1, 3],
      [10, 3],
      [100, 2],
    ],
  };
}

export function installEndPreset(): void {
  try {
    const data = buildPreset();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.info('[dev] End-game preset installed.');
  } catch (e) {
    console.error('[dev] Failed to install End preset:', e);
  }
}
