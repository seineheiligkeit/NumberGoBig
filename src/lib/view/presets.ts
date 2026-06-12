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

import { placeCell, placePipe, feedOperand, addLoose, depositToWarehouse, type World, type CellKind } from '../../../core/engine';
import { INK_TUNING } from '../../../core/time';
import { valueOf, type Value } from '../../../core/value';
import Decimal from 'break_eternity.js';
// The player agent's own gameplay, frozen at its landmark moments
// (`node sim/player.ts --snapshots` → sim/snapshots/ → copied here).
import snapMill from './snapshots/player-mill.json';
import snapLedger from './snapshots/player-ledger.json';
import snapExp from './snapshots/player-exp.json';
import snapLaunch from './snapshots/player-launch.json';
import snapTower from './snapshots/player-tower.json';

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

/** A serialized world from the player agent (`sim/player.ts --snapshots`). */
interface Snapshot {
  key: string;
  label: string;
  blurb: string;
  cells: { kind: string; x: number; y: number; built: boolean; divisor?: number; store?: { n: string; count: number }[] }[];
  pipes: { from: number; fromPort: number; to: number; toPort: number; fuel: boolean }[];
  pool: { n: string; x: number; y: number; count: number }[];
}

const realOf = (s: string): Value => ({ kind: 'real', n: new Decimal(s) });

/** Rehydrate an agent snapshot under the INK ERA rules — what the player
 *  agent's factory actually looked like at that moment of its run. */
function snapshotPreset(snap: Snapshot): Preset {
  return {
    key: snap.key,
    label: snap.label,
    blurb: snap.blurb,
    build(world) {
      world.tuning = INK_TUNING;
      const ids: number[] = [];
      for (const c of snap.cells) {
        const id = placeCell(world, c.kind as CellKind, c.x, c.y, { built: c.built });
        ids.push(id);
        const cell = world.cells.get(id)!;
        if (c.divisor) cell.millDivisor = new Decimal(c.divisor);
        if (c.built) cell.materialNeed = null; // snapshots capture paid, standing machinery
        if (c.store) for (const e of c.store) cell.store.push({ value: realOf(e.n), count: e.count });
      }
      for (const pi of snap.pipes) placePipe(world, ids[pi.from], pi.fromPort, ids[pi.to], pi.toPort, { fuel: pi.fuel });
      for (const b of snap.pool) addLoose(world, realOf(b.n), b.x, b.y, b.count);
    },
  };
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
      // The launch: 1e12 ^ 2 → 1e24. Unified tier-2 need = (1e24)^(1/4) = 10⁶,
      // band [62.5k, 10⁶]. Four 2.5×10⁵ notes are minted and waiting beside it.
      feedOperand(world, exp, 0, valueOf(1e12));
      feedOperand(world, exp, 1, valueOf(2));
      addLoose(world, valueOf(2.5e5), 1700, 80, 4); // the working notes (drop on the cell)
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
  {
    key: 'inkdistrict',
    label: 'Ink district',
    blurb: 'THE UNIFIED LAW live: the ink tax is ON — a mill cascade feeds the Ledger; starve it and the writes slow',
    build(world) {
      // This preset switches the running world onto the INK ERA rules so the
      // new machinery actually operates: tier-indexed needs, the write-time
      // floor (2 digits/s), and the ink tax (×1, paid from the Ledger).
      world.tuning = INK_TUNING;
      // The production base: two fuel trees (the small-number economy).
      fuelBackbone(world, 3, 0, -340);
      fuelBackbone(world, 2, 0, 260);
      // THE INK DISTRICT: an oversized-debris pile → a ÷16 mill → the Ledger.
      // The mill's pieces flow by pipe into the tax office; the rent is paid
      // from its store. Re-gear the mill by feeding port 2 a number.
      const mill = placeCell(world, 'mill', 1500, 200, BUILT);
      const ledger = placeCell(world, 'ledger', 1900, 200, BUILT);
      placePipe(world, mill, 0, ledger, 0);
      addLoose(world, valueOf(12800), 1350, 320, 8); // debris: feed the mill → 800-pieces
      addLoose(world, valueOf(16), 1350, 420, 4); // spare gears (port 2 re-gears)
      // The frontier wing: a working mult + an exp with its first bill paid.
      frontierMult(world, 1500, -160, 2 ** 20);
      placeCell(world, 'exponentiation', 1500, 0, BUILT);
      addLoose(world, valueOf(2 ** 20), 1700, -160, 3); // operand + note stock
      addLoose(world, valueOf(2), 1700, -60, 3); // exponents
      // Wealth above the 10⁶ floor so the rent is actually due — watch the
      // Ledger's "rent N/s · ink %" line, then let it run dry to feel the law.
      addLoose(world, valueOf(1e9), 1700, -320, 1);
    },
  },
  // ── The player agent's own run, frozen at its landmarks ───────────────────
  snapshotPreset(snapMill as Snapshot),
  snapshotPreset(snapLedger as Snapshot),
  snapshotPreset(snapExp as Snapshot),
  snapshotPreset(snapLaunch as Snapshot),
  snapshotPreset(snapTower as Snapshot),
];
