/**
 * Dev preset: a mid-game factory written into localStorage for testing.
 *
 * Trigger: visit `?preset=midgame` once, or call `devLoadMidgame()` in the
 * browser console. To go back to a fresh game, clear `localStorage`.
 *
 * # Layout overview (canvas coords, default camera at origin, scale 1)
 *
 * Four bands above the river, each holding one stage of the factory:
 *
 *   Band 1 (y≈140) — bootstrap chain
 *     wh-zeros — succ1 ─┐
 *                       ├── wh-ones ── add ── wh-twos
 *               — succ2 ─┘
 *
 *   Band 2 (y≈290) — multiplication
 *     wh-tens ─┐
 *              ├── mul ── wh-twenties        (loose-1s fuel pile nearby)
 *     wh-twos ─┘
 *
 *   Band 3 (y≈450) — cultivation farm + bot
 *     cult-arith   cult-fib    bot (sweeps 1s/2s from cultivation
 *                                    into matching wh-ones/wh-twos)
 *
 *   Band 4 (y≈580) — operator bank (un-piped, for player to use)
 *     sub  div  exp  dec  factor  √
 *
 *   Top (y≈40) — Phase 3 family showcase
 *     -3   1/2   √2   1+2i
 *
 * # Stability design notes (why this preset doesn't fall apart)
 *
 * - **Two river pipes** to wh-zeros so two successors don't drain it.
 * - **Two successors** to wh-ones so addition (2 ones/firing) doesn't drain it.
 * - **wh-zeros pre-stocked to 65** — buffer for warm-up.
 * - **Loose-ones fuel pile** sits AWAY from the bot's 240px radius so it
 *   doesn't get swept into wh-ones (which would deny mul/exp fuel).
 * - **Bot placed near cultivation outputs** — sweeps 1s and 2s into
 *   wh-ones and wh-twos. Other cultivated values (3, 5, 8, 13, …) have
 *   no matching warehouse so they pile up at the cultivation output ports.
 * - **No warehouse can empty** in steady state, so the bot's no-distance-
 *   limit `findClosestMatchingWarehouse` never finds an un-typed warehouse
 *   to hijack with a stray cultivated value.
 *
 * # River endpoint
 *
 * The river is screen-anchored at `app.screen.height − 90`. The preset
 * computes the pipe-tap screenY from the current `window.innerHeight` at
 * install time so the visual pipe actually touches the river instead of
 * stopping in mid-air on a taller-than-expected viewport.
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
  whTens: 7,
  mul: 8,
  whTwenties: 9,
  cultArith: 10,
  cultFib: 11,
  bot: 12,
  // Un-piped operator bank.
  sub: 13,
  div: 14,
  exp: 15,
  dec: 16,
  fac: 17,
  sqrt: 18,
} as const;

function real(n: string | number): BlockSnapshot['value'] {
  return { kind: 'real', n: String(n) };
}

function rational(num: string | number, den: string | number): BlockSnapshot['value'] {
  return { kind: 'rational', num: String(num), den: String(den) };
}

function irrational(symbol: string, approx: string): BlockSnapshot['value'] {
  return { kind: 'irrational', symbol, approx };
}

function complex(re: string | number, im: string | number): BlockSnapshot['value'] {
  return { kind: 'complex', re: String(re), im: String(im) };
}

function buildPreset(): SaveData {
  const Y_BOOT = 140;
  const Y_MUL = 290;
  const Y_CULT = 450;
  const Y_OPS = 580;

  // River screen-y: anchor the pipe-tap to the actual river position so
  // the visual line touches the band of zeros. Falls back to 800 if
  // window isn't available (shouldn't happen — main.ts runs in browser).
  const riverScreenY =
    typeof window !== 'undefined' ? Math.max(600, window.innerHeight - 90) : 800;

  const cells: CellSnapshot[] = [
    // ── Band 1: bootstrap (id 1..6) ─────────────────────────────────
    // 1. wh-zeros — buffered to 65 so warm-up doesn't drain it.
    {
      type: 'warehouse',
      x: 180,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(0), storedCount: 65, capacity: 100 },
    },
    // 2 & 3. Two successors, stacked vertically (occupying the slot
    // between wh-zeros and wh-ones).
    { type: 'successor', x: 380, y: Y_BOOT - 50, pending: [null] },
    { type: 'successor', x: 380, y: Y_BOOT + 50, pending: [null] },
    // 4. wh-ones — pre-stocked to 60.
    {
      type: 'warehouse',
      x: 600,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(1), storedCount: 60, capacity: 100 },
    },
    // 5. Addition.
    { type: 'addition', x: 820, y: Y_BOOT, pending: [null, null] },
    // 6. wh-twos.
    {
      type: 'warehouse',
      x: 1040,
      y: Y_BOOT,
      pending: [null],
      warehouseState: { storedValue: real(2), storedCount: 25, capacity: 100 },
    },

    // ── Band 2: multiplication (id 7..9) ────────────────────────────
    // 7. wh-tens — pre-stocked (no production route yet).
    {
      type: 'warehouse',
      x: 600,
      y: Y_MUL,
      pending: [null],
      warehouseState: { storedValue: real(10), storedCount: 75, capacity: 100 },
    },
    // 8. Multiplication.
    { type: 'multiplication', x: 820, y: Y_MUL, pending: [null, null] },
    // 9. wh-twenties.
    {
      type: 'warehouse',
      x: 1040,
      y: Y_MUL,
      pending: [null],
      warehouseState: { storedValue: real(20), storedCount: 12, capacity: 100 },
    },

    // ── Band 3: cultivation farm + bot (id 10..12) ──────────────────
    // 10. Arithmetic cultivation (seed=1).
    {
      type: 'cultivation-arithmetic',
      x: 180,
      y: Y_CULT,
      pending: [null],
      cultivationState: {
        seed: real(1),
        cultivationStep: 5,
        cultivationCooldownMs: 1800,
        cultivationCooldownRemaining: 900,
      },
    },
    // 11. Fibonacci cultivation (seed=1).
    {
      type: 'cultivation-fibonacci',
      x: 380,
      y: Y_CULT,
      pending: [null],
      cultivationState: {
        seed: real(1),
        cultivationStep: 3,
        cultivationCooldownMs: 2200,
        cultivationCooldownRemaining: 1100,
      },
    },
    // 12. Cleanup bot — within 240px of both cultivation output ports.
    {
      type: 'cleanup-bot',
      x: 295,
      y: Y_CULT + 85,
      pending: [],
      botState: { botRadius: 240, botCooldownMs: 2500, botCooldownRemaining: 1200 },
    },

    // ── Band 4: operator bank — un-piped, for the player to use ─────
    // Six operators in a tight horizontal row.
    { type: 'subtraction', x: 160, y: Y_OPS, pending: [null, null] },
    { type: 'division', x: 340, y: Y_OPS, pending: [null, null] },
    { type: 'exponentiation', x: 520, y: Y_OPS, pending: [null, null] },
    { type: 'decrement', x: 720, y: Y_OPS, pending: [null] },
    { type: 'factor', x: 900, y: Y_OPS, pending: [null] },
    { type: 'square-root', x: 1080, y: Y_OPS, pending: [null] },
  ];

  const pipes: PipeSnapshot[] = [
    // Two river pipes — balance two-successor consumption.
    { source: { kind: 'river', screenX: 150, screenY: riverScreenY }, dest: { kind: 'cell-input', cellId: CID.whZeros, portIndex: 0 }, magnitude: 1, cooldownMs: 1000, cooldownRemaining: 200 },
    { source: { kind: 'river', screenX: 220, screenY: riverScreenY }, dest: { kind: 'cell-input', cellId: CID.whZeros, portIndex: 0 }, magnitude: 1, cooldownMs: 1000, cooldownRemaining: 600 },
    // wh-zeros → both successors.
    { source: { kind: 'cell-output', cellId: CID.whZeros, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.succ1, portIndex: 0 }, magnitude: 1, cooldownMs: 1000, cooldownRemaining: 350 },
    { source: { kind: 'cell-output', cellId: CID.whZeros, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.succ2, portIndex: 0 }, magnitude: 1, cooldownMs: 1000, cooldownRemaining: 650 },
    // Both successors → wh-ones.
    { source: { kind: 'cell-output', cellId: CID.succ1, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.whOnes, portIndex: 0 }, magnitude: 1, cooldownMs: 1000, cooldownRemaining: 500 },
    { source: { kind: 'cell-output', cellId: CID.succ2, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.whOnes, portIndex: 0 }, magnitude: 1, cooldownMs: 1000, cooldownRemaining: 800 },
    // wh-ones → addition (both inputs).
    { source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.add, portIndex: 0 }, magnitude: 1, cooldownMs: 1000, cooldownRemaining: 300 },
    { source: { kind: 'cell-output', cellId: CID.whOnes, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.add, portIndex: 1 }, magnitude: 1, cooldownMs: 1000, cooldownRemaining: 700 },
    // addition → wh-twos.
    { source: { kind: 'cell-output', cellId: CID.add, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.whTwos, portIndex: 0 }, magnitude: 10, cooldownMs: 900, cooldownRemaining: 500 },
    // Multiplication stage.
    { source: { kind: 'cell-output', cellId: CID.whTwos, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.mul, portIndex: 0 }, magnitude: 10, cooldownMs: 1100, cooldownRemaining: 200 },
    { source: { kind: 'cell-output', cellId: CID.whTens, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.mul, portIndex: 1 }, magnitude: 10, cooldownMs: 1100, cooldownRemaining: 400 },
    { source: { kind: 'cell-output', cellId: CID.mul, portIndex: 0 }, dest: { kind: 'cell-input', cellId: CID.whTwenties, portIndex: 0 }, magnitude: 100, cooldownMs: 800, cooldownRemaining: 600 },
  ];

  // ── Loose blocks ────────────────────────────────────────────────────
  const blocks: BlockSnapshot[] = [
    // Multiplication's fuel pile — sits BETWEEN mul (820, 290) and the
    // bot (295, 535). Distance to bot: ~530px, well outside the bot's
    // 240px sweep radius.
    { value: real(1), count: 25, x: 950, y: 380 },
    // Phase 3 family showcase along the very top, evenly spaced.
    { value: real(-3), count: 1, x: 80, y: 40 },
    { value: rational(1, 2), count: 1, x: 180, y: 40 },
    { value: irrational('√2', '1.4142135623730951'), count: 1, x: 280, y: 40 },
    { value: complex(1, 2), count: 1, x: 380, y: 40 },
    // A handful of "interesting numbers" loose near the operator bank —
    // hint to the player about manual ops on big-ish blocks.
    { value: real(144), count: 1, x: 1240, y: Y_OPS - 80 },
    { value: real(100), count: 1, x: 1240, y: Y_OPS - 30 },
    { value: real(7), count: 1, x: 1240, y: Y_OPS + 30 },
  ];

  return {
    version: 9,
    blocks,
    cells,
    achievements: ['play_with_zeros'],
    unlocks: [
      'successor',
      'addition',
      'subtraction',
      'multiplication',
      'division',
      'exponentiation',
      'decrement',
      'factor',
      'square-root',
      'warehouse',
      'pipe_1',
      'pipe_10',
      'pipe_100',
      'cultivation-arithmetic',
      'cultivation-fibonacci',
      'cleanup-bot',
      'comprehension_100',
      'theorem_first_prime',
      'theorem_first_composite',
    ],
    purchaseCounts: [
      ['successor', 2],
      ['addition', 1],
      ['subtraction', 1],
      ['multiplication', 1],
      ['division', 1],
      ['exponentiation', 1],
      ['decrement', 1],
      ['factor', 1],
      ['square-root', 1],
      ['warehouse', 5],
      ['pipe_1', 8],
      ['pipe_10', 3],
      ['pipe_100', 1],
      ['cultivation-arithmetic', 1],
      ['cultivation-fibonacci', 1],
      ['cleanup-bot', 1],
      ['comprehension_100', 1],
      ['theorem_first_prime', 1],
      ['theorem_first_composite', 1],
    ],
    seenMarginalia: [
      'first_pickup',
      'achievement_play_with_zeros',
      'first_one',
      'first_negative',
      'first_rational',
      'first_irrational',
      'first_complex',
      'unlock_successor',
      'unlock_addition',
      'unlock_subtraction',
      'unlock_multiplication',
      'unlock_division',
      'unlock_exponentiation',
      'unlock_decrement',
      'unlock_factor',
      'unlock_square-root',
      'unlock_warehouse',
      'unlock_pipe_1',
      'unlock_pipe_10',
      'unlock_pipe_100',
      'unlock_cultivation-arithmetic',
      'unlock_cultivation-fibonacci',
      'unlock_cleanup-bot',
      'unlock_comprehension_100',
      'unlock_theorem_first_prime',
      'unlock_theorem_first_composite',
    ],
    camera: { x: 0, y: 0, scale: 1 },
    comprehension: 100,
    pipes,
    discoveries: [
      'real:0', 'real:1', 'real:2', 'real:3', 'real:4', 'real:5',
      'real:6', 'real:7', 'real:8', 'real:9', 'real:10',
      'real:13', 'real:21', 'real:34', 'real:55', 'real:89',
      'real:20', 'real:100', 'real:144',
      'real:-3',
      'rational:1/2',
      'irrational:√2',
      'complex:1+2i',
    ],
  };
}

export function installMidgamePreset(): void {
  try {
    const data = buildPreset();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.info('[dev] Mid-game preset installed.');
  } catch (e) {
    console.error('[dev] Failed to install preset:', e);
  }
}

// URL + console-helper wiring moved to `presets.ts` (Slice presets-menu).
// `installMidgamePreset` above is the one the registry calls.
