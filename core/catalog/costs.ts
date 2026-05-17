/**
 * Literature catalog — cost-math helpers + the auto-generated ladders.
 *
 * Pure math; no runtime state. Both the game's `literature.ts` and the
 * pacing sim's `catalog.ts` consume these.
 *
 * The α.5c Ladder Rule has two complementary applications here:
 *
 *   1. **Per-firing fuel ladders** (in `core/cost.ts`) — what each cell
 *      type pulls from the pool on every operation.
 *   2. **Unlock-cost ladders** (this file) — what each operator /
 *      comprehension upgrade demands as a one-shot construction proof.
 *
 * The shape is the same on both sides: at hierarchy position L, demand
 * `M × 2^(L-k)` of value k for k = 0..L. The multiplier M is per-entry
 * for unlock costs, per-firing-magnitude for fuel.
 *
 * Mirrors `sim/catalog.ts` after α.5c. When tuning, edit the sim first,
 * confirm against PACING_LOCKED.md, then port back here.
 */

import { valueOf } from '../value.ts';
import type { LiteratureCostItem, LiteratureEntry } from './types.ts';

const COMP_MAX_TIER = 30;
const PIPE_MAX_TIER = 30; // pipe_0 (≤1) through pipe_29 (≤2^29)

/**
 * α.5c: ladder unlock cost — at hierarchy position L, demand
 * `M × 2^(L-k)` of value k for k = 0..L. Mirrors
 * `sim/catalog.ts:ladderUnlockCost`. Used for every operator unlock
 * and re-used by the comp upgrade ladder below.
 */
export function ladderUnlockCost(L: number, M: number): LiteratureCostItem[] {
  const items: LiteratureCostItem[] = [];
  for (let k = 0; k <= L; k++) {
    items.push({ value: valueOf(k), count: M * Math.pow(2, L - k) });
  }
  return items;
}

/**
 * α.5c: every comp tier follows the ladder pattern + a milestone
 * puzzle. The milestone is `1 × 2^(N-1)` — the largest value
 * comprehensible AFTER buying comp_(N-1) (= the previous ceiling).
 * The player must engineer that number as proof of mastery before
 * paying the comp_N cost.
 *
 * Mirrors `sim/catalog.ts:compUpgradeCost` after α.5c.
 */
export function compUpgradeCost(n: number): LiteratureCostItem[] {
  // Ladder depth: caps at 3 (zeros..threes). Beyond L=3 the bottleneck
  // becomes specific small numbers (4s, 5s) that addition struggles
  // to produce at scale, blowing up late-game pacing.
  const L = Math.min(3, Math.floor(n / 3));
  // Multiplier curve (sim-tuned):
  //   - early geometric (1.4× per tier).
  //   - linear past tier 10 to keep late game finite.
  let M: number;
  if (n <= 10) M = Math.ceil(6 * Math.pow(1.4, n - 1));
  else M = Math.ceil(6 * Math.pow(1.4, 9) * (n - 9));
  const cost = ladderUnlockCost(L, M);
  // Milestone puzzle: construct 1 × 2^(N-1) before unlocking.
  if (n >= 2) {
    cost.push({ value: valueOf(Math.pow(2, n - 1)), count: 1 });
  }
  return cost;
}

/** Unicode superscript digits for the 2^N glyph notation. */
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT_DIGITS[parseInt(d, 10)] ?? d)
    .join('');
}

function compGlyph(n: number): string {
  const ceiling = Math.pow(2, n);
  return ceiling < 1000 ? `≤${ceiling}` : `≤2${superscript(n)}`;
}

/**
 * Optional milestone flavor for specific binary-canonical tiers. Generic
 * tiers fall back to the utilitarian default; milestones get narrator
 * beats on first comprehension.
 */
function compMilestoneFlavor(
  n: number,
): { name?: string; description?: string; unlockMessage?: string } | null {
  switch (n) {
    case 2: // ≤4 — first paid entry after Successor
      return {
        unlockMessage:
          'Comprehension ≤4. The first paid result. The mechanism, in miniature.',
      };
    case 10: // ≤1024 — first kilobyte
      return {
        name: 'Comprehension ≤2¹⁰ — Kilobyte',
        unlockMessage:
          'Two to the tenth is one thousand and twenty-four. The thousand is admitted, with twenty-four to spare.',
      };
    case 11: // ≤2048 — Hardy-Ramanujan reachable (1729 < 2048)
      return {
        unlockMessage:
          'Comprehension ≤2¹¹. 1,729 is now liftable — the smallest number expressible as a sum of two cubes in two distinct ways.',
      };
    case 16: // ≤65,536 — 16-bit
      return {
        name: 'Comprehension ≤2¹⁶ — 16-bit',
        unlockMessage:
          'Sixty-five thousand, five hundred and thirty-six. The same as a moderately well-fed birthday.',
      };
    case 20: // ≈1.05M — megabyte
      return {
        name: 'Comprehension ≤2²⁰ — Megabyte',
        unlockMessage:
          'Comprehension ≤2²⁰. The million is in reach. Whether you should manually move one is another question.',
      };
    case 30: // ≈1.07B — gigabyte
      return {
        name: 'Comprehension ≤2³⁰ — Gigabyte',
        unlockMessage:
          'Comprehension ≤2³⁰. The billion is held in mind, if not in hand.',
      };
    default:
      return null;
  }
}

export function generateComprehensionLadder(): LiteratureEntry[] {
  const entries: LiteratureEntry[] = [];
  // We skip n=1 (ceiling 2) because it's the baseline — the world starts
  // there, no purchase required. The first paid entry is n=2 (≤4).
  for (let n = 2; n <= COMP_MAX_TIER; n++) {
    const ceiling = Math.pow(2, n);
    const ceilStr = ceiling.toLocaleString();
    const flavor = compMilestoneFlavor(n);
    const defaultName = `Comprehension ${compGlyph(n)}`;
    entries.push({
      id: `comp_${n}`,
      kind: 'comprehension',
      name: flavor?.name ?? defaultName,
      glyph: compGlyph(n),
      description:
        flavor?.description ??
        `Lift the manual ceiling to ${ceilStr}.`,
      cost: compUpgradeCost(n),
      comprehensionLevel: ceiling,
      isOnce: true,
      unlockMessage: flavor?.unlockMessage,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Phase 6 γ.1 — Pipe ladder generator (power-of-2, gated by Comp)
// ---------------------------------------------------------------------------
//
// Pipe rated ≤ 2^N requires Comp ≥ 2^(N+1) (strict one-tier lag —
// DESIGN §9). Per-placement cost preserves the recursive bootstrap:
// a 2^N-pipe is paid in blocks at that magnitude. Mirrors
// `sim/catalog.ts:pipeCost` after α.3 lock.

export function pipeCost(n: number): LiteratureCostItem[] {
  const mag = Math.pow(2, n);
  if (mag <= 4) return [{ value: valueOf(1), count: Math.max(5, mag * 5) }];
  if (mag <= 32) return [{ value: valueOf(10), count: Math.max(5, Math.ceil(mag / 2)) }];
  if (mag <= 256) return [{ value: valueOf(100), count: Math.max(5, Math.ceil(mag / 4)) }];
  if (mag <= 4096) return [{ value: valueOf(1000), count: Math.max(5, Math.ceil(mag / 16)) }];
  if (mag <= 65_536) return [{ value: valueOf(10_000), count: Math.max(5, Math.ceil(mag / 128)) }];
  if (mag <= 1_048_576) return [{ value: valueOf(100_000), count: Math.max(5, Math.ceil(mag / 1_024)) }];
  return [{ value: valueOf(1_000_000), count: Math.max(5, Math.ceil(mag / 8_192)) }];
}

function pipeGlyph(n: number): string {
  const mag = Math.pow(2, n);
  return mag < 1000 ? `≤${mag}` : `≤2${superscript(n)}`;
}

export function generatePipeLadder(): LiteratureEntry[] {
  const entries: LiteratureEntry[] = [];
  for (let n = 0; n < PIPE_MAX_TIER; n++) {
    const mag = Math.pow(2, n);
    const isBaseline = n === 0;
    entries.push({
      id: `pipe_${n}`,
      kind: 'pipe',
      name: `Pipe ${pipeGlyph(n)}`,
      glyph: pipeGlyph(n),
      description:
        isBaseline
          ? 'Carries 0s and 1s. One item per second. Source: river or cell output. Dest: cell input.'
          : `Carries values up to ${mag.toLocaleString()}. One item per second.`,
      cost: pipeCost(n),
      pipeMagnitude: mag,
      pipeCooldownMs: 1000,
      costScale: 1.6,
      compRequirement: Math.pow(2, n + 1),
      unlockMessage:
        isBaseline
          ? 'Result added to your literature: Pipe. Automation begins where the hand stops.'
          : `A heavier pipe rated for ${mag.toLocaleString()}. Bigger numbers may travel by themselves now.`,
    });
  }
  return entries;
}
