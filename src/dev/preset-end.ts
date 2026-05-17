/**
 * Dev preset — End game (~6-8h in).
 *
 * Stage E/F under the α.5c Ladder Rule. Player has unlocked Tetration
 * and is climbing the comp ladder through 2^14..2^17 toward pentation
 * (which demands a 1 × 1,000,000 puzzle plus the L=5 ladder cost).
 *
 * Showcased mechanics:
 *   - Full operator hierarchy through Tetration.
 *   - Per-firing ladder consumption (no fuel ports on tier-1+).
 *   - Multi-tier warehouse layout — zeros through millions.
 *   - Inversion + Negation + wh-negative loop intact.
 *   - Cell-leveling visible (successor lvl 3, addition lvl 3,
 *     multiplication lvl 3, exponentiation lvl 2).
 *
 * Layout (canvas coords):
 *   Band 1 (y≈170) — bootstrap (8 succ for ladder zero demand)
 *   Band 2 (y≈340) — mult / exp column
 *   Band 3 (y≈510) — tetration column
 *   Band 4 (y≈680) — family bank + predicate warehouses
 *
 * Comp: ≤16384 (comp_14). Working toward comp_15..17 + pentation.
 */
import type { SaveData } from '../lib/persistence';
import type { BlockSnapshot, CellSnapshot, PipeSnapshot } from '../lib/world';

const STORAGE_KEY = 'numbers-go-big.save';

const CID = {
  whZeros: 1,
  succ1: 2, succ2: 3, succ3: 4, succ4: 5,
  succ5: 6, succ6: 7, succ7: 8, succ8: 9,
  whOnes: 10,
  add1: 11, add2: 12, add3: 13,
  whTwos: 14,
  whTens: 15,
  mul1: 16, mul2: 17,
  whHundreds: 18,
  exp1: 19, exp2: 20,
  whThousands: 21,
  whTenK: 22,
  whHundredK: 23,
  whMillion: 24,
  tet: 25,
  // Family bank
  sub: 26, div: 27, neg: 28, inv: 29, sqrt: 30, factor: 31, dec: 32,
  // Predicate warehouses
  whNegative: 33, whPrime: 34, whIrrational: 35,
} as const;

function real(n: string | number): BlockSnapshot['value'] {
  return { kind: 'real', n: String(n) };
}

function irrational(symbol: string, approx: string): BlockSnapshot['value'] {
  return { kind: 'irrational', symbol, approx };
}

function buildPreset(): SaveData {
  const Y_BOOT = 170;
  const Y_MID = 340;
  const Y_TET = 510;
  const Y_FAM = 680;
  const riverScreenY =
    typeof window !== 'undefined' ? Math.max(600, window.innerHeight - 90) : 800;

  const cells: CellSnapshot[] = [
    // ── Band 1: bootstrap chain ─────────────────────────────────────
    {
      type: 'warehouse', x: 180, y: Y_BOOT, pending: [null],
      warehouseState: { storedValue: real(0), storedCount: 400, capacity: 500 },
    },
    // 8 successors stacked vertically.
    ...Array.from({ length: 8 }, (_, i) => ({
      type: 'successor' as const,
      x: 360,
      y: Y_BOOT - 140 + i * 40,
      pending: [null],
    })),
    {
      type: 'warehouse', x: 580, y: Y_BOOT, pending: [null],
      warehouseState: { storedValue: real(1), storedCount: 350, capacity: 500 },
    },
    { type: 'addition', x: 800, y: Y_BOOT - 60, pending: [null, null] },
    { type: 'addition', x: 800, y: Y_BOOT, pending: [null, null] },
    { type: 'addition', x: 800, y: Y_BOOT + 60, pending: [null, null] },
    {
      type: 'warehouse', x: 1020, y: Y_BOOT, pending: [null],
      warehouseState: { storedValue: real(2), storedCount: 200, capacity: 500 },
    },

    // ── Band 2: mult / exp ──────────────────────────────────────────
    {
      type: 'warehouse', x: 180, y: Y_MID, pending: [null],
      warehouseState: { storedValue: real(10), storedCount: 180, capacity: 500 },
    },
    { type: 'multiplication', x: 380, y: Y_MID - 30, pending: [null, null] },
    { type: 'multiplication', x: 380, y: Y_MID + 30, pending: [null, null] },
    {
      type: 'warehouse', x: 580, y: Y_MID, pending: [null],
      warehouseState: { storedValue: real(100), storedCount: 120, capacity: 500 },
    },
    { type: 'exponentiation', x: 780, y: Y_MID - 30, pending: [null, null] },
    { type: 'exponentiation', x: 780, y: Y_MID + 30, pending: [null, null] },
    {
      type: 'warehouse', x: 980, y: Y_MID, pending: [null],
      warehouseState: { storedValue: real(1000), storedCount: 60, capacity: 500 },
    },

    // ── Band 3: high-magnitude warehouses + tetration ──────────────
    {
      type: 'warehouse', x: 180, y: Y_TET, pending: [null],
      warehouseState: { storedValue: real(10000), storedCount: 30, capacity: 500 },
    },
    {
      type: 'warehouse', x: 380, y: Y_TET, pending: [null],
      warehouseState: { storedValue: real(100000), storedCount: 18, capacity: 500 },
    },
    {
      type: 'warehouse', x: 580, y: Y_TET, pending: [null],
      warehouseState: { storedValue: real(1000000), storedCount: 8, capacity: 500 },
    },
    // Tetration — the boss. Two operand slots, no fuel port.
    { type: 'tetration', x: 820, y: Y_TET, pending: [null, null] },

    // ── Band 4: family bank + predicate warehouses ─────────────────
    { type: 'subtraction', x: 180, y: Y_FAM, pending: [null, null] },
    { type: 'division', x: 320, y: Y_FAM, pending: [null, null] },
    { type: 'negation', x: 460, y: Y_FAM, pending: [null] },
    { type: 'inversion', x: 600, y: Y_FAM, pending: [null, null] },
    { type: 'square-root', x: 740, y: Y_FAM, pending: [null] },
    { type: 'factor', x: 880, y: Y_FAM, pending: [null] },
    { type: 'decrement', x: 1020, y: Y_FAM, pending: [null] },
    {
      type: 'warehouse-rule', x: 1180, y: Y_FAM - 40, pending: [null],
      ruleWarehouseState: {
        ruleId: 'negative',
        items: [
          { value: real(-1), count: 8 }, { value: real(-2), count: 5 },
          { value: real(-3), count: 4 }, { value: real(-10), count: 2 },
        ],
        capacity: 500,
      },
    },
    {
      type: 'warehouse-rule', x: 1180, y: Y_FAM + 20, pending: [null],
      ruleWarehouseState: {
        ruleId: 'prime',
        items: [
          { value: real(2), count: 35 }, { value: real(3), count: 25 },
          { value: real(5), count: 20 }, { value: real(7), count: 16 },
          { value: real(11), count: 9 }, { value: real(13), count: 7 },
        ],
        capacity: 500,
      },
    },
    {
      type: 'warehouse-rule', x: 1180, y: Y_FAM + 80, pending: [null],
      ruleWarehouseState: {
        ruleId: 'irrational',
        items: [
          { value: irrational('sqrt(2)', '1.41421356'), count: 4 },
          { value: irrational('sqrt(3)', '1.73205080'), count: 3 },
          { value: irrational('sqrt(5)', '2.23606797'), count: 3 },
          { value: irrational('sqrt(7)', '2.64575131'), count: 2 },
        ],
        capacity: 500,
      },
    },
  ];

  // Cells start at CID 1 (whZeros). After 8 successors, ones warehouse,
  // 3 additions, twos warehouse: that's 1 + 8 + 1 + 3 + 1 = 14 cells.
  // Cell ids are array indexed (1-based). So succ ids 2..9, add ids 11..13, etc.
  const succIds = [CID.succ1, CID.succ2, CID.succ3, CID.succ4, CID.succ5, CID.succ6, CID.succ7, CID.succ8];
  const addIds = [CID.add1, CID.add2, CID.add3];
  const mulIds = [CID.mul1, CID.mul2];
  const expIds = [CID.exp1, CID.exp2];

  const pipes: PipeSnapshot[] = [
    // River → wh-zeros (4 pipes for high zero supply).
    ...[120, 180, 240, 300].map((x, i) => ({
      source: { kind: 'river' as const, screenX: x, screenY: riverScreenY },
      dest: { kind: 'cell-input' as const, cellId: CID.whZeros, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 100 + i * 200,
    })),
    // wh-zeros → each succ.
    ...succIds.map((id, i) => ({
      source: { kind: 'cell-output' as const, cellId: CID.whZeros, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: id, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 80 * i,
    })),
    // Each succ → wh-ones.
    ...succIds.map((id, i) => ({
      source: { kind: 'cell-output' as const, cellId: id, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: CID.whOnes, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 200 + 70 * i,
    })),
    // wh-ones → each addition (both inputs).
    ...addIds.flatMap((id, i) => [
      {
        source: { kind: 'cell-output' as const, cellId: CID.whOnes, portIndex: 0 },
        dest: { kind: 'cell-input' as const, cellId: id, portIndex: 0 },
        magnitude: 1,
        cooldownMs: 1000,
        cooldownRemaining: 100 + 250 * i,
      },
      {
        source: { kind: 'cell-output' as const, cellId: CID.whOnes, portIndex: 0 },
        dest: { kind: 'cell-input' as const, cellId: id, portIndex: 1 },
        magnitude: 1,
        cooldownMs: 1000,
        cooldownRemaining: 200 + 250 * i,
      },
    ]),
    // additions → wh-twos.
    ...addIds.map((id, i) => ({
      source: { kind: 'cell-output' as const, cellId: id, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: CID.whTwos, portIndex: 0 },
      magnitude: 4,
      cooldownMs: 1000,
      cooldownRemaining: 300 + 150 * i,
    })),
    // wh-tens → each mult (both inputs).
    ...mulIds.flatMap((id, i) => [
      {
        source: { kind: 'cell-output' as const, cellId: CID.whTens, portIndex: 0 },
        dest: { kind: 'cell-input' as const, cellId: id, portIndex: 0 },
        magnitude: 16,
        cooldownMs: 1000,
        cooldownRemaining: 100 + 200 * i,
      },
      {
        source: { kind: 'cell-output' as const, cellId: CID.whTens, portIndex: 0 },
        dest: { kind: 'cell-input' as const, cellId: id, portIndex: 1 },
        magnitude: 16,
        cooldownMs: 1000,
        cooldownRemaining: 250 + 200 * i,
      },
    ]),
    // mults → wh-hundreds.
    ...mulIds.map((id, i) => ({
      source: { kind: 'cell-output' as const, cellId: id, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: CID.whHundreds, portIndex: 0 },
      magnitude: 128,
      cooldownMs: 1000,
      cooldownRemaining: 400 + 150 * i,
    })),
    // wh-hundreds → exp base, wh-tens → exp exponent.
    ...expIds.flatMap((id, i) => [
      {
        source: { kind: 'cell-output' as const, cellId: CID.whHundreds, portIndex: 0 },
        dest: { kind: 'cell-input' as const, cellId: id, portIndex: 0 },
        magnitude: 128,
        cooldownMs: 1000,
        cooldownRemaining: 200 + 200 * i,
      },
      {
        source: { kind: 'cell-output' as const, cellId: CID.whTens, portIndex: 0 },
        dest: { kind: 'cell-input' as const, cellId: id, portIndex: 1 },
        magnitude: 16,
        cooldownMs: 1000,
        cooldownRemaining: 350 + 200 * i,
      },
    ]),
    // exps → wh-thousands.
    ...expIds.map((id, i) => ({
      source: { kind: 'cell-output' as const, cellId: id, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: CID.whThousands, portIndex: 0 },
      magnitude: 1024,
      cooldownMs: 1000,
      cooldownRemaining: 500 + 100 * i,
    })),
    // wh-thousands → tetration base; wh-twos → tetration height.
    {
      source: { kind: 'cell-output', cellId: CID.whThousands, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.tet, portIndex: 0 },
      magnitude: 1024,
      cooldownMs: 1000,
      cooldownRemaining: 200,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whTwos, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.tet, portIndex: 1 },
      magnitude: 4,
      cooldownMs: 1000,
      cooldownRemaining: 600,
    },
  ];

  const blocks: BlockSnapshot[] = [
    { value: real(10), count: 20, x: 1180, y: Y_BOOT + 100 },
    { value: real(100), count: 12, x: 1180, y: Y_MID + 100 },
    { value: real(1000), count: 6, x: 1180, y: Y_TET + 80 },
    { value: real(10000), count: 3, x: 1280, y: Y_TET + 40 },
    { value: real(1024), count: 1, x: 1280, y: Y_TET - 40 }, // tet puzzle proof
  ];

  return {
    version: 17,
    blocks,
    cells,
    achievements: [
      'play_with_zeros', 'first_one', 'first_two', 'first_three',
      'first_prime', 'first_negative', 'first_irrational',
      'first_hundred', 'first_thousand', 'first_million',
    ],
    unlocks: [
      'successor', 'addition', 'subtraction', 'multiplication', 'division',
      'negation', 'exponentiation', 'inversion', 'square-root',
      'decrement', 'factor', 'tetration', 'warehouse',
      'warehouse_rule_lt10', 'warehouse_rule_lt100', 'warehouse_rule_lt1000',
      'warehouse_rule_negative', 'warehouse_rule_prime', 'warehouse_rule_irrational',
      ...Array.from({ length: 10 }, (_, i) => `pipe_${i}`),
      ...Array.from({ length: 13 }, (_, i) => `comp_${i + 2}`), // comp_2..comp_14
    ],
    purchaseCounts: [
      ['successor', 8], ['addition', 3],
      ['subtraction', 1], ['multiplication', 2], ['division', 1],
      ['negation', 1], ['exponentiation', 2], ['inversion', 1],
      ['square-root', 1], ['factor', 1], ['decrement', 1],
      ['tetration', 1],
      ['warehouse', 12],
      ['warehouse_rule_negative', 1], ['warehouse_rule_prime', 1],
      ['warehouse_rule_irrational', 1],
      ['pipe_0', 18], ['pipe_2', 6], ['pipe_3', 4], ['pipe_4', 3],
      ['pipe_5', 3], ['pipe_6', 2], ['pipe_7', 2], ['pipe_8', 2], ['pipe_9', 1],
      ...Array.from({ length: 13 }, (_, i) => [`comp_${i + 2}`, 1] as [string, number]),
    ],
    seenMarginalia: [
      'first_pickup', 'first_one', 'first_two', 'first_prime',
      'first_negative', 'first_irrational', 'first_hundred',
      'first_thousand', 'first_million',
    ],
    camera: { x: -40, y: 0, scale: 0.6 },
    comprehension: 16384,
    pipes,
    discoveries: [
      'real:0', 'real:1', 'real:2', 'real:3', 'real:4', 'real:5',
      'real:6', 'real:7', 'real:8', 'real:9', 'real:10',
      'real:50', 'real:100', 'real:250', 'real:1000', 'real:1024',
      'real:10000', 'real:100000', 'real:1000000',
      'real:-1', 'real:-2', 'real:-3',
      'irrational:sqrt(2):1.41421356',
    ],
    cellLevels: [
      ['successor', 3],
      ['addition', 3],
      ['multiplication', 3],
      ['exponentiation', 2],
    ],
  };
}

export function installEndPreset(): void {
  try {
    const data = buildPreset();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.info('[dev] End-game preset installed (α.5c).');
  } catch (e) {
    console.error('[dev] Failed to install End preset:', e);
  }
}
