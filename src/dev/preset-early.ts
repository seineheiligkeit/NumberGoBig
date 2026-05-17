/**
 * Dev preset — Early game (~13 min in).
 *
 * Stage A/B under the α.5c Ladder Rule. The player has just unlocked
 * Subtraction and a few comp tiers; they're now grinding toward
 * Multiplication, which demands a ladder of small numbers PLUS a
 * 1 × 10 engineering puzzle (the player must construct a 10 by
 * adding 5+5).
 *
 * Layout (canvas coords, default camera):
 *   Band 1 (y≈200) — bootstrap chain
 *     wh-zeros — 4 successors — wh-ones — addition — wh-twos
 *     (plus a sub-cell sitting off to the right, lightly used)
 *
 *   Loose blocks: a few engineered 5s and 10s nearby, showing the
 *   player is in the middle of preparing the multiplication puzzle.
 *
 * Unlocked: successor, addition, subtraction, warehouse, pipe_0,
 *           comp_2, comp_3, comp_4 (ceiling 16).
 */
import type { SaveData } from '../lib/persistence';
import type { BlockSnapshot, CellSnapshot, PipeSnapshot } from '../lib/world';

const STORAGE_KEY = 'numbers-go-big.save';

const CID = {
  whZeros: 1,
  succ1: 2,
  succ2: 3,
  succ3: 4,
  succ4: 5,
  whOnes: 6,
  add: 7,
  whTwos: 8,
  sub: 9,
} as const;

function real(n: string | number): BlockSnapshot['value'] {
  return { kind: 'real', n: String(n) };
}

function buildPreset(): SaveData {
  const Y_BOOT = 240;
  const riverScreenY =
    typeof window !== 'undefined' ? Math.max(600, window.innerHeight - 90) : 800;

  const cells: CellSnapshot[] = [
    // wh-zeros (pre-stocked) → 4 successors → wh-ones.
    {
      type: 'warehouse',
      x: 180,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(0), storedCount: 60, capacity: 100 },
    },
    { type: 'successor', x: 380, y: Y_BOOT - 90, pending: [null] },
    { type: 'successor', x: 380, y: Y_BOOT - 30, pending: [null] },
    { type: 'successor', x: 380, y: Y_BOOT + 30, pending: [null] },
    { type: 'successor', x: 380, y: Y_BOOT + 90, pending: [null] },
    {
      type: 'warehouse',
      x: 600,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(1), storedCount: 80, capacity: 100 },
    },
    // Addition pending: [null, null] — no fuel slot (L=1 ladder pulls
    // zeros + ones from pool/warehouses automatically per firing).
    { type: 'addition', x: 820, y: Y_BOOT, pending: [null, null] },
    {
      type: 'warehouse',
      x: 1040,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(2), storedCount: 36, capacity: 100 },
    },
    // Subtraction — just unlocked, sitting unwired for player to use.
    { type: 'subtraction', x: 820, y: Y_BOOT + 200, pending: [null, null] },
  ];

  const pipes: PipeSnapshot[] = [
    // River → wh-zeros.
    {
      source: { kind: 'river', screenX: 150, screenY: riverScreenY },
      dest: { kind: 'cell-input', cellId: CID.whZeros, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 200,
    },
    {
      source: { kind: 'river', screenX: 220, screenY: riverScreenY },
      dest: { kind: 'cell-input', cellId: CID.whZeros, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 600,
    },
    // wh-zeros → each successor.
    ...[CID.succ1, CID.succ2, CID.succ3, CID.succ4].map((succId, i) => ({
      source: { kind: 'cell-output' as const, cellId: CID.whZeros, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: succId, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 100 + i * 200,
    })),
    // Successors → wh-ones.
    ...[CID.succ1, CID.succ2, CID.succ3, CID.succ4].map((succId, i) => ({
      source: { kind: 'cell-output' as const, cellId: succId, portIndex: 0 },
      dest: { kind: 'cell-input' as const, cellId: CID.whOnes, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 300 + i * 150,
    })),
    // wh-ones → addition (both inputs).
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.add, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 400,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.add, portIndex: 1 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 900,
    },
    // addition → wh-twos. Magnitude-4 pipe (cheap, unlocked after comp_4).
    {
      source: { kind: 'cell-output', cellId: CID.add, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whTwos, portIndex: 0 },
      magnitude: 4,
      cooldownMs: 1000,
      cooldownRemaining: 600,
    },
  ];

  // Loose blocks: engineering 5s and 10s for the multiplication puzzle.
  const blocks: BlockSnapshot[] = [
    { value: real(5), count: 2, x: 1200, y: Y_BOOT - 40 },
    { value: real(10), count: 1, x: 1200, y: Y_BOOT + 40 }, // the puzzle target!
    { value: real(3), count: 1, x: 1200, y: Y_BOOT + 120 },
    { value: real(1), count: 3, x: 1280, y: Y_BOOT },
  ];

  return {
    version: 17,
    blocks,
    cells,
    achievements: ['play_with_zeros', 'first_one'],
    unlocks: [
      'successor',
      'addition',
      'subtraction',
      'warehouse',
      'pipe_0',
      'pipe_1',
      'pipe_2',
      'comp_2',
      'comp_3',
      'comp_4',
    ],
    purchaseCounts: [
      ['successor', 4],
      ['addition', 1],
      ['subtraction', 1],
      ['warehouse', 3],
      ['pipe_0', 6],
      ['pipe_1', 0],
      ['pipe_2', 1],
      ['comp_2', 1],
      ['comp_3', 1],
      ['comp_4', 1],
    ],
    seenMarginalia: [
      'first_pickup',
      'achievement_play_with_zeros',
      'first_one',
      'unlock_successor',
      'unlock_addition',
      'unlock_subtraction',
      'unlock_warehouse',
      'unlock_pipe_0',
      'unlock_comp_2',
      'unlock_comp_3',
      'unlock_comp_4',
    ],
    camera: { x: 0, y: 0, scale: 1 },
    comprehension: 16,
    pipes,
    discoveries: ['real:0', 'real:1', 'real:2', 'real:3', 'real:4', 'real:5', 'real:10'],
    cellLevels: [],
  };
}

export function installEarlyPreset(): void {
  try {
    const data = buildPreset();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.info('[dev] Early-game preset installed (α.5c).');
  } catch (e) {
    console.error('[dev] Failed to install Early preset:', e);
  }
}
