/**
 * Dev preset: an early-game factory written into localStorage for testing.
 *
 * Snapshot of the Stage A/B boundary (~15 min of play): the bootstrap
 * chain is humming, Addition is making twos, and the player is grinding
 * twos toward Subtraction (200 ×2). Pacing-realistic snapshot — not a
 * sandbox.
 *
 * # Layout (canvas coords, default camera at origin)
 *
 *   Band 1 (y≈140) — bootstrap chain
 *     wh-zeros — succ1 ─┐
 *                       ├── wh-ones ── add ── wh-twos
 *               — succ2 ─┘
 *
 *   Loose blocks scattered near the addition output for the player to
 *   pick up and play with manually.
 *
 * # Unlocked Literature
 *
 *   successor, pipe_1, addition, comprehension_25, warehouse
 *
 * # NOT yet unlocked
 *
 *   subtraction (the next goal — 200 twos to grind), multiplication,
 *   pipe_10, division, exponentiation, everything beyond.
 */
import type { SaveData } from '../lib/persistence';
import type { BlockSnapshot, CellSnapshot, PipeSnapshot } from '../lib/world';

const STORAGE_KEY = 'numbers-go-big.save';

const CID = {
  whZeros: 1,
  succ1: 2,
  succ2: 3,
  whOnes: 4,
  add: 5,
  whTwos: 6,
} as const;

function real(n: string | number): BlockSnapshot['value'] {
  return { kind: 'real', n: String(n) };
}

function buildPreset(): SaveData {
  const Y_BOOT = 200;

  // River screen-y: anchor the pipe-tap to the actual river position so
  // the visual line touches the band of zeros. Falls back to 800 if
  // window isn't available (shouldn't happen — main.ts runs in browser).
  const riverScreenY =
    typeof window !== 'undefined' ? Math.max(600, window.innerHeight - 90) : 800;

  const cells: CellSnapshot[] = [
    // 1. wh-zeros — pre-stocked so warm-up doesn't drain it.
    {
      type: 'warehouse',
      x: 180,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(0), storedCount: 40, capacity: 100 },
    },
    // 2 & 3. Two successors, stacked vertically.
    { type: 'successor', x: 380, y: Y_BOOT - 50, pending: [null] },
    { type: 'successor', x: 380, y: Y_BOOT + 50, pending: [null] },
    // 4. wh-ones — pre-stocked low; the addition grind has been
    // consuming them.
    {
      type: 'warehouse',
      x: 600,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(1), storedCount: 22, capacity: 100 },
    },
    // 5. Addition.
    { type: 'addition', x: 820, y: Y_BOOT, pending: [null, null] },
    // 6. wh-twos — the new accumulation pool the player is now growing
    // toward 200 to unlock Subtraction.
    {
      type: 'warehouse',
      x: 1040,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(2), storedCount: 14, capacity: 100 },
    },
  ];

  const pipes: PipeSnapshot[] = [
    // River → wh-zeros (one pipe at this stage; two would over-supply
    // since only one successor needs feeding at a time and the early
    // pipe ≤1 has 1000ms cooldown).
    {
      source: { kind: 'river', screenX: 180, screenY: riverScreenY },
      dest: { kind: 'cell-input', cellId: CID.whZeros, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 300,
    },
    // wh-zeros → both successors.
    {
      source: { kind: 'cell-output', cellId: CID.whZeros, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.succ1, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 500,
    },
    {
      source: { kind: 'cell-output', cellId: CID.whZeros, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.succ2, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 800,
    },
    // Both successors → wh-ones.
    {
      source: { kind: 'cell-output', cellId: CID.succ1, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whOnes, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 200,
    },
    {
      source: { kind: 'cell-output', cellId: CID.succ2, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whOnes, portIndex: 0 },
      magnitude: 1,
      cooldownMs: 1000,
      cooldownRemaining: 600,
    },
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
    // addition → wh-twos. Output is a 2, which a ≤1 pipe would refuse
    // — use a ≤10 pipe… but wait, pipe_10 isn't unlocked yet at this
    // stage. The player has to MANUALLY ferry twos until they buy
    // pipe_10. We model that by leaving the addition output stacked
    // and letting the bot-less stage pile blocks at the port. For the
    // preset we cheat slightly by using a magnitude-10 pipe here so
    // the warehouse stays alive — it's a "you have this already"
    // shortcut consistent with mid-game presets.
    {
      source: { kind: 'cell-output', cellId: CID.add, portIndex: 0 },
      dest: { kind: 'cell-input', cellId: CID.whTwos, portIndex: 0 },
      magnitude: 10,
      cooldownMs: 1000,
      cooldownRemaining: 600,
    },
  ];

  // A handful of loose blocks scattered nearby for hand exploration.
  const blocks: BlockSnapshot[] = [
    { value: real(1), count: 5, x: 1180, y: Y_BOOT - 80 },
    { value: real(2), count: 3, x: 1180, y: Y_BOOT + 80 },
    { value: real(0), count: 6, x: 1180, y: Y_BOOT },
  ];

  return {
    version: 14,
    blocks,
    cells,
    achievements: ['play_with_zeros'],
    unlocks: [
      'successor',
      'addition',
      'warehouse',
      'pipe_1',
      'comprehension_25',
    ],
    purchaseCounts: [
      ['successor', 2],
      ['addition', 1],
      ['warehouse', 3],
      ['pipe_1', 4],
      ['comprehension_25', 1],
    ],
    seenMarginalia: [
      'first_pickup',
      'achievement_play_with_zeros',
      'first_one',
      'unlock_successor',
      'unlock_addition',
      'unlock_warehouse',
      'unlock_pipe_1',
      'unlock_comprehension_25',
    ],
    camera: { x: 0, y: 0, scale: 1 },
    comprehension: 25,
    pipes,
    discoveries: ['real:0', 'real:1', 'real:2'],
    cellLevels: [],
    pipeLevels: [],
  };
}

export function installEarlyPreset(): void {
  try {
    const data = buildPreset();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.info('[dev] Early-game preset installed.');
  } catch (e) {
    console.error('[dev] Failed to install Early preset:', e);
  }
}
