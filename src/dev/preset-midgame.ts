/**
 * Dev preset — Mid game (~2-3h in).
 *
 * Stage C/D under the α.5c Ladder Rule. Player has unlocked the full
 * operator hierarchy through Exponentiation, plus the family-
 * exploration cells (subtraction, negation, division, inversion,
 * square-root, factor). Comp is climbing through the hundreds toward
 * the thousands the tetration unlock demands.
 *
 * Layout (canvas coords):
 *   Band 1 (y≈170) — bootstrap
 *     wh-zeros — 6 successors — wh-ones — add — wh-twos
 *   Band 2 (y≈340) — mid-tier
 *     wh-tens — mul — wh-hundreds — exp — wh-thousands
 *   Band 3 (y≈500) — family bank (un-piped, for puzzle work)
 *     sub  div  neg  inv  √  factor
 *   Band 4 (y≈660) — predicate warehouses
 *     wh-negative  wh-prime  wh-irrational
 *
 * Unlocks: everything except tetration / pentation / variadic-arrow.
 * Comp: ≤256 (comp_8). Working toward comp_9 (puzzle: 1 × 256) and
 * onward, toward tetration's 1 × 1024 puzzle.
 */
import type { SaveData } from '../lib/persistence';
import type { BlockSnapshot, CellSnapshot, PipeSnapshot } from '../lib/world';

const STORAGE_KEY = 'numbers-go-big.save';

const CID = {
  // Band 1
  whZeros: 1,
  succ1: 2, succ2: 3, succ3: 4, succ4: 5, succ5: 6, succ6: 7,
  whOnes: 8,
  add1: 9, add2: 10,
  whTwos: 11,
  // Band 2
  whTens: 12,
  mul: 13,
  whHundreds: 14,
  exp: 15,
  whThousands: 16,
  // Band 3 — family bank
  sub: 17, div: 18, neg: 19, inv: 20, sqrt: 21, factor: 22,
  // Band 4 — predicate warehouses
  whNegative: 23, whPrime: 24, whIrrational: 25,
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
  const Y_FAMILY = 500;
  const Y_PRED = 660;
  const riverScreenY =
    typeof window !== 'undefined' ? Math.max(600, window.innerHeight - 90) : 800;

  const cells: CellSnapshot[] = [
    // ── Band 1: bootstrap (6 succ for zero supply) ──────────────────
    {
      type: 'warehouse', x: 180, y: Y_BOOT, pending: [null],
      warehouseState: { storedValue: real(0), storedCount: 140, capacity: 200 },
    },
    { type: 'successor', x: 360, y: Y_BOOT - 110, pending: [null] },
    { type: 'successor', x: 360, y: Y_BOOT - 60, pending: [null] },
    { type: 'successor', x: 360, y: Y_BOOT - 10, pending: [null] },
    { type: 'successor', x: 360, y: Y_BOOT + 40, pending: [null] },
    { type: 'successor', x: 360, y: Y_BOOT + 90, pending: [null] },
    { type: 'successor', x: 360, y: Y_BOOT + 140, pending: [null] },
    {
      type: 'warehouse', x: 580, y: Y_BOOT, pending: [null],
      warehouseState: { storedValue: real(1), storedCount: 180, capacity: 200 },
    },
    { type: 'addition', x: 800, y: Y_BOOT - 40, pending: [null, null] },
    { type: 'addition', x: 800, y: Y_BOOT + 40, pending: [null, null] },
    {
      type: 'warehouse', x: 1020, y: Y_BOOT, pending: [null],
      warehouseState: { storedValue: real(2), storedCount: 90, capacity: 200 },
    },

    // ── Band 2: mid-tier (mult + exp) ───────────────────────────────
    {
      type: 'warehouse', x: 180, y: Y_MID, pending: [null],
      warehouseState: { storedValue: real(10), storedCount: 45, capacity: 200 },
    },
    // Mult: 2 operand slots only (no fuel port — α.5c).
    { type: 'multiplication', x: 380, y: Y_MID, pending: [null, null] },
    {
      type: 'warehouse', x: 580, y: Y_MID, pending: [null],
      warehouseState: { storedValue: real(100), storedCount: 28, capacity: 200 },
    },
    // Exp: same shape.
    { type: 'exponentiation', x: 780, y: Y_MID, pending: [null, null] },
    {
      type: 'warehouse', x: 980, y: Y_MID, pending: [null],
      warehouseState: { storedValue: real(1000), storedCount: 5, capacity: 200 },
    },

    // ── Band 3: family bank (un-piped, manual use) ──────────────────
    { type: 'subtraction', x: 200, y: Y_FAMILY, pending: [null, null] },
    { type: 'division', x: 360, y: Y_FAMILY, pending: [null, null] },
    { type: 'negation', x: 520, y: Y_FAMILY, pending: [null] },
    // Inversion KEEPS its fuel port (signed-fuel block contract).
    { type: 'inversion', x: 680, y: Y_FAMILY, pending: [null, null] },
    { type: 'square-root', x: 840, y: Y_FAMILY, pending: [null] },
    { type: 'factor', x: 1000, y: Y_FAMILY, pending: [null] },

    // ── Band 4: predicate warehouses ────────────────────────────────
    {
      type: 'warehouse-rule', x: 240, y: Y_PRED, pending: [null],
      ruleWarehouseState: {
        ruleId: 'negative',
        items: [{ value: real(-1), count: 6 }, { value: real(-2), count: 4 }, { value: real(-3), count: 2 }],
        capacity: 200,
      },
    },
    {
      type: 'warehouse-rule', x: 520, y: Y_PRED, pending: [null],
      ruleWarehouseState: {
        ruleId: 'prime',
        items: [
          { value: real(2), count: 18 },
          { value: real(3), count: 12 },
          { value: real(5), count: 8 },
          { value: real(7), count: 6 },
        ],
        capacity: 200,
      },
    },
    {
      type: 'warehouse-rule', x: 800, y: Y_PRED, pending: [null],
      ruleWarehouseState: {
        ruleId: 'irrational',
        items: [
          { value: irrational('sqrt(2)', '1.41421356'), count: 1 },
          { value: irrational('sqrt(3)', '1.73205080'), count: 1 },
          { value: irrational('sqrt(5)', '2.23606797'), count: 1 },
        ],
        capacity: 200,
      },
    },
  ];

  const succIds = [CID.succ1, CID.succ2, CID.succ3, CID.succ4, CID.succ5, CID.succ6];

  const pipes: PipeSnapshot[] = [
    // Three river pipes feeding wh-zeros (more zero supply for ladder).
    ...[150, 220, 290].map((x, i) => ({
      source: { kind: 'river' as const, screenX: x, screenY: riverScreenY },
      dest: { kind: 'cell-input' as const, cellId: CID.whZeros, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 100 + i * 250,
    })),
    // wh-zeros → each succ.
    ...succIds.map((id, i) => ({
      source: { kind: 'cell-output' as const, cellId: CID.whZeros, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: id, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 100 + i * 130,
    })),
    // Each succ → wh-ones.
    ...succIds.map((id, i) => ({
      source: { kind: 'cell-output' as const, cellId: id, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: CID.whOnes, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 300 + i * 100,
    })),
    // wh-ones → both addition inputs (one each).
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.add1, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 400,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.add1, portIndex: 1 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 700,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.add2, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 200,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.add2, portIndex: 1 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 500,
    },
    // additions → wh-twos.
    {
      source: { kind: 'cell-output', cellId: CID.add1, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whTwos, portIndex: 0 },
      magnitude: 4,
      cooldownMs: 1000,
      cooldownRemaining: 600,
    },
    {
      source: { kind: 'cell-output', cellId: CID.add2, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whTwos, portIndex: 0 },
      magnitude: 4,
      cooldownMs: 1000,
      cooldownRemaining: 800,
    },
    // wh-tens → mul (both inputs — agent constructed 100s).
    {
      source: { kind: 'cell-output', cellId: CID.whTens, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.mul, portIndex: 0 },
      magnitude: 16,
      cooldownMs: 1000,
      cooldownRemaining: 300,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whTens, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.mul, portIndex: 1 },
      magnitude: 16,
      cooldownMs: 1000,
      cooldownRemaining: 700,
    },
    {
      source: { kind: 'cell-output', cellId: CID.mul, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whHundreds, portIndex: 0 },
      magnitude: 128,
      cooldownMs: 1000,
      cooldownRemaining: 500,
    },
    // wh-hundreds → exp base; tens → exp exponent.
    {
      source: { kind: 'cell-output', cellId: CID.whHundreds, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.exp, portIndex: 0 },
      magnitude: 128,
      cooldownMs: 1000,
      cooldownRemaining: 400,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whTens, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.exp, portIndex: 1 },
      magnitude: 16,
      cooldownMs: 1000,
      cooldownRemaining: 900,
    },
    {
      source: { kind: 'cell-output', cellId: CID.exp, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whThousands, portIndex: 0 },
      magnitude: 256,
      cooldownMs: 1000,
      cooldownRemaining: 600,
    },
  ];

  // Loose blocks: bits of intermediate magnitude — recent player work.
  const blocks: BlockSnapshot[] = [
    { value: real(10), count: 8, x: 1180, y: Y_BOOT + 60 },
    { value: real(100), count: 3, x: 1180, y: Y_MID + 60 },
    { value: real(5), count: 4, x: 1180, y: Y_BOOT - 60 },
    { value: real(50), count: 2, x: 1180, y: Y_BOOT + 130 },
    { value: real(1000), count: 1, x: 1180, y: Y_MID + 130 },
  ];

  return {
    version: 17,
    blocks,
    cells,
    achievements: ['play_with_zeros', 'first_one', 'first_prime', 'first_negative'],
    unlocks: [
      'successor', 'addition', 'subtraction', 'multiplication', 'division',
      'negation', 'exponentiation', 'inversion', 'square-root',
      'decrement', 'factor', 'warehouse',
      'warehouse_rule_lt10', 'warehouse_rule_lt100', 'warehouse_rule_lt1000',
      'warehouse_rule_negative', 'warehouse_rule_prime', 'warehouse_rule_irrational',
      'pipe_0', 'pipe_1', 'pipe_2', 'pipe_3', 'pipe_4', 'pipe_5', 'pipe_6', 'pipe_7',
      'comp_2', 'comp_3', 'comp_4', 'comp_5', 'comp_6', 'comp_7', 'comp_8',
    ],
    purchaseCounts: [
      ['successor', 6], ['addition', 2], ['subtraction', 1],
      ['multiplication', 1], ['division', 1], ['negation', 1],
      ['exponentiation', 1], ['inversion', 1], ['square-root', 1],
      ['factor', 1],
      ['warehouse', 5],
      ['warehouse_rule_negative', 1], ['warehouse_rule_prime', 1],
      ['warehouse_rule_irrational', 1],
      ['pipe_0', 12], ['pipe_1', 0], ['pipe_2', 4], ['pipe_3', 3],
      ['pipe_4', 2], ['pipe_5', 2], ['pipe_6', 2], ['pipe_7', 1],
      ['comp_2', 1], ['comp_3', 1], ['comp_4', 1], ['comp_5', 1],
      ['comp_6', 1], ['comp_7', 1], ['comp_8', 1],
    ],
    seenMarginalia: [
      'first_pickup', 'first_one', 'first_two', 'first_prime',
      'first_negative', 'first_irrational',
    ],
    camera: { x: 0, y: 0, scale: 0.85 },
    comprehension: 256,
    pipes,
    discoveries: [
      'real:0', 'real:1', 'real:2', 'real:3', 'real:4', 'real:5',
      'real:6', 'real:7', 'real:8', 'real:9', 'real:10',
      'real:50', 'real:100', 'real:1000',
      'real:-1', 'real:-2', 'real:-3',
      'irrational:sqrt(2):1.41421356',
    ],
    cellLevels: [],
  };
}

export function installMidgamePreset(): void {
  try {
    const data = buildPreset();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.info('[dev] Mid-game preset installed (α.5c).');
  } catch (e) {
    console.error('[dev] Failed to install Mid preset:', e);
  }
}
