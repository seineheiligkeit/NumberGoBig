/**
 * Dev factory presets — snapshots of the game at different stages, built around
 * the CURRENT rules (the from-zero sim agent, `sim/challenger.ts --live
 * --from-zero`): build slots ("one pencil" — construction queues, fuel rushes),
 * the 1e9 exponentiation unlock, SCAFFOLDING ("show your work" — exp-tier ops
 * demand working notes in a denomination band), and powered logistics (an
 * accelerator's charge carries big blocks on covered pipes).
 *
 * The progression the agent actually plays:
 *   1. Opening      — successors tap the river; one adder; one pencil.
 *   2. Mult factory — a depth-3 fuel tree + two frontier mults (pre-1e9).
 *   3. Launch prep  — exp unlocked; a NOTE STOCKPILE minted for the first paid
 *                     launch (base × exponent staged, band-sized notes ready).
 *   4. Powered age  — deep trees, a warehouse-fed accelerator (powered pipes),
 *                     a mill for right-sizing oversized blocks into notes.
 *
 * Cells are placed already-built (`{ built: true }`) — a preset is the *shape*
 * of a stage, no construction wait. Loose seeds set the world's peak magnitude,
 * so the correct number of build slots comes along for free.
 */

import { placeCell, placePipe, feedOperand, addLoose, depositToWarehouse, type World } from '../../../core/engine';
import { valueOf } from '../../../core/value';

const BUILT = { built: true } as const;

/**
 * A correctly-wired squaring fuel backbone (mirrors the sim agents' tree).
 * `2^depth` successors → leaf adders (1+1→2, a 3rd successor as fuel) → a binary
 * tree of multiplications squaring upward. The root spills its product (depth 3
 * → 256s, depth 4 → 65,536s) into the loose pool. Returns the root cell id.
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
    blurb: 'the first minutes — successors tap the river into 1s; one adder makes 2s; ONE pencil',
    build(world) {
      // Five successors; three feed one adder (1+1→2, a 3rd as fuel), two are
      // left un-piped so their 1s pile into a movable ×N stack. A sixth cell is
      // placed UNBUILT so the build queue (one pencil) is visible immediately.
      const s: number[] = [];
      for (let i = 0; i < 5; i++) s.push(placeCell(world, 'successor', 0, (i - 2) * 44, BUILT));
      const add = placeCell(world, 'addition', 240, 0, BUILT);
      placePipe(world, s[0], 0, add, 0);
      placePipe(world, s[1], 0, add, 1);
      placePipe(world, s[2], 0, add, -1, { fuel: true });
      placeCell(world, 'addition', 240, 120); // sketching in — fuel it to hurry
      placeCell(world, 'multiplication', 480, 0); // queued behind it (№1 in queue)
    },
  },
  {
    key: 'multfactory',
    label: 'Mult factory',
    blurb: 'pre-billion: a depth-3 fuel tree feeding two frontier mults — the climb toward the exp unlock',
    build(world) {
      fuelBackbone(world, 3, 0, -140);
      frontierMult(world, 1300, -60, 1e6);
      frontierMult(world, 1300, 60, 16777216); // 16M — two climbers mid-stride
      addLoose(world, valueOf(256), 1100, 0, 24); // tree output: op1 feed + fuel
      addLoose(world, valueOf(4096), 1100, 120, 6);
    },
  },
  {
    key: 'launchprep',
    label: 'Launch prep',
    blurb: 'the first PAID launch, staged: base ready, notes minted in-band — drop them in and show your work',
    build(world) {
      fuelBackbone(world, 3, 0, -340);
      fuelBackbone(world, 4, 0, 260);
      frontierMult(world, 1500, -160, 1e10);
      const exp = placeCell(world, 'exponentiation', 1500, 0, BUILT);
      // The launch: 1e12 ^ 2 → 1e24. Scaffolding S = √(1e24) = 1e12, band
      // [≈1.6e10, 1e12]. Four 4e11 notes are minted and waiting beside it.
      feedOperand(world, exp, 0, valueOf(1e12));
      feedOperand(world, exp, 1, valueOf(2));
      addLoose(world, valueOf(4e11), 1700, 80, 4); // the working notes (drop on the cell)
      addLoose(world, valueOf(65536), 1300, 160, 12); // deep-tree fuel for the mults
      addLoose(world, valueOf(2), 1700, -80, 3); // spare exponents
    },
  },
  {
    key: 'poweredage',
    label: 'Powered age',
    blurb: 'late game: warehouse-fed accelerator carries big blocks on pipes; a mill right-sizes notes',
    build(world) {
      fuelBackbone(world, 4, 0, -420);
      fuelBackbone(world, 3, 0, 320);
      frontierMult(world, 1500, -240, 1e18);
      frontierMult(world, 1500, -120, 1e20);
      placeCell(world, 'exponentiation', 1500, 20, BUILT);
      // Powered logistics: a warehouse stocked with charge blocks feeds the
      // accelerator by FUEL PIPE — the power plant runs itself, and pipes near
      // it can carry blocks up to ~the charge.
      const wh = placeCell(world, 'warehouse', 1900, -120, BUILT);
      const accel = placeCell(world, 'accelerator', 2100, 20, BUILT);
      placePipe(world, wh, 0, accel, -1, { fuel: true });
      depositToWarehouse(world, wh, valueOf(1e9), 40); // the standing power budget
      // A mill beside the launch pad: feed it an oversized block → 16 in-band notes.
      placeCell(world, 'mill', 1900, 160, BUILT);
      addLoose(world, valueOf(1e13), 2000, 240, 2); // oversized — mill them down
      addLoose(world, valueOf(4294967296), 1700, 120, 10); // 2^32 deep fuel
      addLoose(world, valueOf(1e20), 1700, -320, 1); // the reigning frontier block
    },
  },
];
