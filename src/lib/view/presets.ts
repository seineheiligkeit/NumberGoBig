/**
 * Dev factory presets — snapshots of the game at different stages, built around
 * the sim agent's BEST-PLAY strategy (`sim/manager.ts`), which two optimization
 * passes distilled to two levers:
 *
 *   1. DEEP fuel — a squaring backbone whose root emits a big block (depth 4 →
 *      65,536, depth 5 → ~4.3e9). One such block finishes an operation in roughly
 *      one shove, so fuel stops being the bottleneck (a depth-3 256-block is far
 *      too small at scale). Fuel grade should ~match the op's work.
 *   2. WIDE frontier — MANY multiplication cells, because each cell runs at the
 *      free base rate IN PARALLEL, so width is free throughput. ~16 is the agent's
 *      sweet spot (beyond that a single tree's fuel dilutes).
 *
 * Cells are placed already-built (`{ built: true }`) — a preset is the *shape* of
 * a stage, no construction wait. The fuel tree auto-runs the moment time advances
 * and spills graded fuel into the loose pool; each frontier mult has one operand
 * seeded and the other open (reads as "starving"), so you play by shuttling fuel
 * from the pool into the mults' operand + fuel ports — exactly what the agent does.
 */

import { placeCell, placePipe, feedOperand, addLoose, type World } from '../../../core/engine';
import { valueOf } from '../../../core/value';

const BUILT = { built: true } as const;

/**
 * A correctly-wired squaring fuel backbone (mirrors `sim/play.ts` queueFuelTree).
 * `2^depth` successors → leaf adders (1+1→2, a 3rd successor as fuel) → a binary
 * tree of multiplications squaring upward. The root spills its product (depth 3
 * → 256s) into the loose pool as graded fuel. Returns the root cell id.
 */
function fuelBackbone(world: World, depth: number, x0: number, y0: number): number {
  const nSucc = 1 << depth;
  const succ: number[] = [];
  for (let i = 0; i < nSucc; i++) succ.push(placeCell(world, 'successor', x0, y0 + i * 16, BUILT));
  let sc = 0;
  const nextS = (): number => succ[sc++ % nSucc];
  const build = (level: number, idx: number): number => {
    if (level === 0) {
      const adder = placeCell(world, 'addition', x0 + 200, y0 + idx * 30, BUILT);
      placePipe(world, nextS(), 0, adder, 0); // round-robin emit lets the shared
      placePipe(world, nextS(), 0, adder, 1); // successors fairly feed every port
      placePipe(world, nextS(), 0, adder, -1, { fuel: true });
      return adder;
    }
    const l = build(level - 1, idx * 2);
    const r = build(level - 1, idx * 2 + 1);
    const m = placeCell(world, 'multiplication', x0 + 200 + level * 170, y0 + idx * 30, BUILT);
    placePipe(world, l, 0, m, 0);
    placePipe(world, r, 0, m, 1);
    return m;
  };
  return build(depth, 0);
}

/** A pre-built frontier multiplication with op0 seeded to a stage's frontier
 *  number; op1 is left open for the player to feed (reads as "starving"). */
function frontierMult(world: World, x: number, y: number, seed: number): number {
  const id = placeCell(world, 'multiplication', x, y, BUILT);
  feedOperand(world, id, 0, valueOf(seed));
  return id;
}

/** A vertical BANK of `count` frontier mults at column `x`, op0 seeded across an
 *  escalating range (`base × step^i`) so the snapshot reads as a wide climb in
 *  progress. Width is free parallel throughput — the agent's key lever. */
function frontierBank(world: World, x: number, count: number, base: number, step: number): void {
  for (let i = 0; i < count; i++) {
    frontierMult(world, x, (i - (count - 1) / 2) * 88, base * Math.pow(step, i));
  }
}

export interface Preset {
  key: string;
  label: string;
  blurb: string;
  build(world: World): void;
}

export const PRESETS: Preset[] = [
  {
    key: 'opening',
    label: 'Opening',
    blurb: 'the first minutes — successors tap the river into 1s; one adder makes 2s',
    build(world) {
      // Five successors; three feed one adder (1+1→2, a 3rd as fuel), two are
      // left un-piped so their 1s pile into a movable ×N stack.
      const s: number[] = [];
      for (let i = 0; i < 5; i++) s.push(placeCell(world, 'successor', 0, (i - 2) * 44, BUILT));
      const add = placeCell(world, 'addition', 240, 0, BUILT);
      placePipe(world, s[0], 0, add, 0);
      placePipe(world, s[1], 0, add, 1);
      placePipe(world, s[2], 0, add, -1, { fuel: true });
    },
  },
  {
    key: 'deepfuel',
    label: 'Deep fuel',
    blurb: 'a depth-4 tree making 65,536-grade fuel — one block powers a whole op; 3 mults to grow',
    build(world) {
      // Depth-4 backbone → 65,536 per root op (vs depth-3's 256). One such block
      // finishes a frontier op in ~one shove — fuel stops being the bottleneck.
      fuelBackbone(world, 4, 0, -260);
      frontierBank(world, 1700, 3, 1e4, 1e3); // 1e4, 1e7, 1e10
      addLoose(world, valueOf(65536), 1500, 0, 30); // ready-to-use deep fuel
    },
  },
  {
    key: 'widebank',
    label: 'Wide bank',
    blurb: 'deep fuel + EIGHT frontier mults — width is free parallel throughput (the agent’s key lever)',
    build(world) {
      fuelBackbone(world, 4, 0, -260);
      frontierBank(world, 1700, 8, 1e3, 1e3); // eight climbers, 1e3 … 1e24
      addLoose(world, valueOf(65536), 1500, -60, 60);
      addLoose(world, valueOf(256), 1500, 60, 60); // smaller blocks for op1 multipliers
    },
  },
  {
    key: 'engaged',
    label: 'Engaged climb (agent’s best)',
    blurb: 'the optimal shape: a depth-5 fuel tree + SIXTEEN frontier mults, mid-climb — big, pan to see it',
    build(world) {
      // The strategy the sim agent converged on: deep fuel (depth 5 → ~4.3e9/op)
      // + a wide 16-mult frontier. ~110 cells — a late-game factory to manage.
      fuelBackbone(world, 5, 0, -520);
      frontierBank(world, 1900, 16, 1e6, 1e3); // sixteen climbers across 1e6 … 1e51
      addLoose(world, valueOf(4294967296), 1650, -80, 80); // 2^32 deep fuel
      addLoose(world, valueOf(65536), 1650, 80, 80);
    },
  },
];
