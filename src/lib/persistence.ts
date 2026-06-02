import type { CellType } from './cell-types';
import { snapshotSeenMarginalia, restoreSeenMarginalia } from './marginalia';
import {
  dirtyTick,
  resetWorld,
  restoreAchievements,
  restoreCellLevels,
  restoreDiscoveries,
  restorePurchaseCounts,
  restoreUnlocks,
  setComprehension,
  snapshotAchievements,
  snapshotBlocks,
  snapshotCellLevels,
  snapshotCells,
  snapshotComprehension,
  snapshotDiscoveries,
  snapshotPipes,
  snapshotPurchaseCounts,
  snapshotUnlocks,
  type BlockSnapshot,
  type CellSnapshot,
  type PipeEndpoint,
  type PipeSnapshot,
} from './world';
import type { DragController } from './interaction';
import { restoreCamera, snapshotCamera } from './camera';
import { restoreAdversary, snapshotAdversary } from './adversary';
import { valueRestore, type ValueSnapshot } from './value';

/**
 * Save / load — localStorage persistence for the world.
 *
 * One key in localStorage: a versioned JSON document containing blocks, cells
 * (with pending input state), achievements, unlocks, purchase counts, and the
 * one-shot marginalia keys the player has already seen.
 *
 * Autosave runs on a short debounce after any world mutation, plus a forced
 * synchronous save on `beforeunload` as a closing-tab safety net. There is no
 * cloud save; localStorage is sufficient for Phase 1.
 *
 * Schema is versioned. When future slices add fields, bump `SAVE_VERSION`
 * and add migration logic in `loadFromStorage()`.
 *
 * **v5 — Slice 4.0**: every block / pending / stored / seed value migrated
 * from a plain `number` to a `ValueSnapshot` (`{ kind: 'real'; n: string }`)
 * so future variants (rationals, irrationals, complex) extend the same
 * envelope. v4 saves are auto-migrated on load.
 *
 * **v6 — Slice 4.2**: `ValueSnapshot` extended with a `rational` variant
 * (`{ kind: 'rational'; num: string; den: string }`). v5 saves carry only
 * `real` snapshots, so the bump is version-only — no transformation needed.
 *
 * **v7 — Slice 4.3**: `ValueSnapshot` extended with an `irrational` variant
 * (`{ kind: 'irrational'; symbol: string; approx: string }`). Again
 * version-only — older saves don't have irrationals.
 *
 * **v8 — Slice 4.4**: `ValueSnapshot` extended with a `complex` variant
 * (`{ kind: 'complex'; re: string; im: string }`). Version-only bump.
 *
 * **v9 — Slice 4.5**: adds `discoveries: string[]` — every `valueKey` the
 * player has ever produced, foundation for the Phase 4 Gallery. v8 saves
 * have no record; the migration best-effort-seeds discoveries from the
 * currently-present blocks (the historical set before the upgrade is lost).
 *
 * **v10 — Slice 3.5.4**: adds optional `ruleWarehouseState` on cell
 * snapshots for the new `warehouse-rule` cell type. v9 saves have no
 * rule-warehouses, so the migration is version-only.
 *
 * **v11 — Slice 5.2**: adds optional `filterState` on cell snapshots for
 * the new `filter` cell type. v10 saves have no filters; version-only bump.
 *
 * **v12 — Phase 5.6 pacing overhaul**: the comprehension ladder grew from
 * 3 tiers to 8 (added I/III/V/VI/VIII) and existing entries' costs were
 * rebalanced. New `pipe_1k` Literature entry. No schema-structural
 * changes — the migration auto-unlocks lower comprehension tiers that
 * the player's saved ceiling implicitly covers, so they don't see new
 * sub-tier entries as "still available" after upgrading.
 *
 * **v13 — Slice 6.7 leveling**: adds optional `cellLevels` and
 * `pipeLevels` arrays storing per-cell-type and per-pipe-magnitude
 * upgrade levels. Pre-v13 saves have no leveling state; the migration
 * is version-only — every primitive defaults to level 1.
 *
 * **v14 — Slice 6.11 Translation Operators**: cleanup-bot `botState`
 * gained optional phase-machine fields (`botPhase`, `botTargetBlockId`,
 * `botDestCellId`, `botWorkerX/Y`, `botSpeed`, `botCarried`). Pre-v14
 * saves omit them; the rehydrator falls back to idle defaults
 * (worker at home position, empty-handed). Pure version bump.
 *
 * **v15 — Phase 6 slice β.1 Comprehension Spine**: the comprehension
 * ladder dissolves the eight fixed tiers (`comprehension_25` /
 * `_100` / `_250` / `_1k` / `_10k` / `_100k` / `_1m` / `_1b`) into
 * a power-of-2 generator (`comp_1` → ≤2, `comp_30` → ≤2^30). Old
 * comp ids are stripped from `unlocks` and `purchaseCounts`; new
 * `comp_N` ids are back-filled up to the player's saved ceiling
 * (rounded UP to the next power of 2). The baseline drops from 10
 * to 2 in fresh saves; existing players' ceilings are preserved
 * (or rounded up — never down). See DESIGN.md §9.
 *
 * **v16 — Phase 6 slice γ.1 Pipe Catalog Regen**: pipe Literature
 * dissolves the four fixed-magnitude entries (`pipe_1` / `_10` /
 * `_100` / `_1k`) into a power-of-2 generator (`pipe_0` → ≤1,
 * `pipe_29` → ≤2^29). Each is comp-gated (rating < comp). Pipe
 * leveling DISSOLVES — the `pipeLevels` field, all `pipe_X_lvlY`
 * Literature entries, and the per-pipe-magnitude level state are
 * gone. Old pipe ids are mapped to the next-power-of-2 ≥ their
 * old magnitude so the player's placement capability isn't reduced.
 * Existing pipe instances on canvas keep their magnitude. See
 * DESIGN.md §7 + §9.
 */

const STORAGE_KEY = 'numbers-go-big.save';
const SAVE_VERSION = 18;
const DEBOUNCE_MS = 250;

export interface SaveData {
  version: number;
  blocks: BlockSnapshot[];
  cells: CellSnapshot[];
  achievements: string[];
  unlocks: string[];
  purchaseCounts: [string, number][];
  seenMarginalia: string[];
  /** Pan/zoom state (added in v2). */
  camera?: { x: number; y: number; scale: number };
  /** Manual-lift ceiling (added in v2). */
  comprehension?: number;
  /** Pipes (added in v2). Restored after cells so endpoint lookups resolve. */
  pipes?: PipeSnapshot[];
  /** Every `valueKey` the player has ever produced (added in v9). Foundation
   *  for the Gallery in Slice 5.1. */
  discoveries?: string[];
  /** Per-cell-type upgrade levels (added in v13). Only non-default (>1)
   *  entries are stored. */
  cellLevels?: [CellType, number][];
  /** Per-pipe-magnitude upgrade levels (added in v13, REMOVED in v16
   *  alongside the dissolution of pipe leveling). The field stays in the
   *  SaveData type as optional so v15 saves can still be parsed by
   *  `isSaveDataLike`; the migration strips it. */
  pipeLevels?: [number, number][];
  /** V2.5 Adversary: Core HP and fortification tier (added in v18). */
  coreHp?: number;
  coreFortifyTiers?: number;
  /** V3: the Shield magnitude (Decimal string). */
  coreShield?: string;
}

function serialize(): SaveData {
  return {
    version: SAVE_VERSION,
    blocks: snapshotBlocks(),
    cells: snapshotCells(),
    achievements: snapshotAchievements(),
    unlocks: snapshotUnlocks(),
    purchaseCounts: snapshotPurchaseCounts(),
    seenMarginalia: snapshotSeenMarginalia(),
    camera: snapshotCamera(),
    comprehension: snapshotComprehension(),
    pipes: snapshotPipes(),
    discoveries: snapshotDiscoveries(),
    cellLevels: snapshotCellLevels(),
    // pipeLevels dropped in v16 (Phase 6 γ.1) — pipe leveling dissolved.
    coreHp: snapshotAdversary().coreHp,
    coreFortifyTiers: snapshotAdversary().fortifyTiers,
    coreShield: snapshotAdversary().shield,
  };
}

/**
 * One-shot kill switch for autosave. Set by the reset flow before
 * removing the storage entry and reloading — without this, the
 * `beforeunload` handler installed by `installAutosave` synchronously
 * serializes the still-populated in-memory world and writes it back to
 * localStorage in the same turn, defeating the reset.
 *
 * Module-scoped boolean; resets implicitly on page reload. Both the
 * debounced timer callback and the `beforeunload` handler funnel
 * through `saveToStorage`, so one check here covers every save path.
 */
let _saveSuppressed = false;

export function suppressAutosave(): void {
  _saveSuppressed = true;
}

function saveToStorage(): void {
  if (_saveSuppressed) return;
  try {
    const data = serialize();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage may be unavailable (private mode, quota exceeded). Log
    // once and continue; missing autosave is annoying, not fatal.
    console.warn('Failed to save world:', e);
  }
}

/**
 * Cheap structural validation. Doesn't try to verify every nested field —
 * the rehydration code path is permissive about missing/extra properties.
 * What we DO want to catch: a corrupted localStorage entry that happens to
 * be valid JSON but isn't the right shape (e.g. another tool wrote there,
 * or a partial write got truncated). Returning false makes us treat it as
 * "no save" and start fresh, which is safer than crashing on `.map(...)`.
 */
function isSaveDataLike(x: unknown): x is Partial<SaveData> & { version: number } {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.version !== 'number') return false;
  // Required collections must at least be arrays if present.
  for (const key of ['blocks', 'cells', 'achievements', 'unlocks', 'purchaseCounts', 'seenMarginalia']) {
    if (o[key] !== undefined && !Array.isArray(o[key])) return false;
  }
  return true;
}

export function loadFromStorage(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSaveDataLike(parsed)) {
      console.warn('Save did not match the expected shape. Ignoring.');
      return null;
    }
    if (parsed.version === SAVE_VERSION) return parsed as SaveData;

    // ---- Migrations -----------------------------------------------------
    // v1 → v2: added optional `camera` and `comprehension`. For legacy saves
    // we auto-grant comprehension high enough to cover the largest existing
    // block so the player doesn't suddenly find their work un-liftable.
    //
    // v2 → v3: river pipe endpoints switched from canvas coords to screen
    // coords. The reprojector below migrates either shape transparently.
    //
    // v3 → v4: added optional cooldown / bot fields. No transformation
    // needed — older saves just lose a tiny bit of "remaining cooldown"
    // precision on the first tick.
    //
    // v4 → v5: every numeric block value, pending slot, warehouse stored
    // value, and cultivation seed is wrapped as a `ValueSnapshot`. Done
    // unconditionally for any pre-v5 save once it's reached this point.
    if (parsed.version === 1) {
      const v1 = parsed as Record<string, unknown> & { blocks?: Array<{ value: unknown }> };
      const blocks = (v1.blocks ?? []) as Array<{ value: unknown }>;
      const maxBlock = blocks.reduce((m, b) => {
        const n = typeof b.value === 'number' ? b.value : 0;
        return Math.max(m, n);
      }, 0);
      const auto = Math.max(10, maxBlock);
      return migrateValues(migrateRiverEndpoints({
        ...(parsed as SaveData),
        version: SAVE_VERSION,
        comprehension: auto,
      }));
    }
    if (parsed.version === 2 || parsed.version === 3 || parsed.version === 4) {
      return migrateValues(migrateRiverEndpoints({ ...(parsed as SaveData), version: SAVE_VERSION }));
    }
    // v5 → v6 / v6 → v7 / v7 → v8: ValueSnapshot gained new variants.
    // Older saves carry only the variants from their era, so no per-record
    // transformation is needed — just bump the version.
    if (parsed.version === 5 || parsed.version === 6 || parsed.version === 7) {
      return { ...(parsed as SaveData), version: SAVE_VERSION };
    }
    // v8 → v9: best-effort seed `discoveries` from the currently-present
    // blocks. The historical set before this upgrade is lost — acceptable
    // since the Gallery itself only arrives in Slice 5.1.
    if (parsed.version === 8) {
      const data = parsed as SaveData;
      const blocks = (data.blocks ?? []) as Array<{ value: unknown }>;
      const seeded = new Set<string>();
      for (const b of blocks) {
        const v = b.value as { kind?: string; n?: string; num?: string; den?: string; symbol?: string; re?: string; im?: string };
        if (!v || typeof v !== 'object') continue;
        switch (v.kind) {
          case 'real':
            if (typeof v.n === 'string') seeded.add(`real:${v.n}`);
            break;
          case 'rational':
            if (typeof v.num === 'string' && typeof v.den === 'string') {
              seeded.add(`rational:${v.num}/${v.den}`);
            }
            break;
          case 'irrational':
            if (typeof v.symbol === 'string') seeded.add(`irrational:${v.symbol}`);
            break;
          case 'complex':
            if (typeof v.re === 'string' && typeof v.im === 'string') {
              seeded.add(`complex:${v.re}+${v.im}i`);
            }
            break;
        }
      }
      return { ...data, version: SAVE_VERSION, discoveries: [...seeded] };
    }
    // v9 → v10: ruleWarehouseState added as an optional field on cell
    // snapshots. v9 saves have no warehouse-rule cells, so nothing to do
    // beyond bumping the version.
    // v10 → v11: filterState added similarly. Same treatment.
    if (parsed.version === 9 || parsed.version === 10) {
      return { ...(parsed as SaveData), version: SAVE_VERSION };
    }
    // v11..v14 → v15: collapsing the fixed-tier comp ladder into the
    // Phase 6 power-of-2 ladder. v15 → v16: dissolving pipe leveling
    // + regenerating the pipe ladder on the same power-of-2 model.
    // Both transforms run for any pre-v16 save; the migrations are
    // designed to be idempotent and order-independent (comp transform
    // touches comp ids + ceiling; pipe transform touches pipe ids +
    // pipeLevels) so they compose cleanly.
    if (
      parsed.version === 11 ||
      parsed.version === 12 ||
      parsed.version === 13 ||
      parsed.version === 14
    ) {
      return migrateLadderRuleToV17(
        migratePipeLadderToV16(migrateCompLadderToV15(parsed as SaveData)),
      );
    }
    if (parsed.version === 15) {
      return migrateLadderRuleToV17(migratePipeLadderToV16(parsed as SaveData));
    }
    if (parsed.version === 16) {
      return migrateLadderRuleToV17(parsed as SaveData);
    }
    // v17 → v18 (V2.2): batteryState added as an optional cell field, and
    // coreHp/coreHpMax added at the top level (V2.5). All additive — pre-v18
    // saves simply lack them and the rehydrator falls back to defaults.
    if (parsed.version === 17) {
      return { ...(parsed as SaveData), version: SAVE_VERSION };
    }
    console.warn(
      `Save version mismatch: got ${parsed.version}, expected ${SAVE_VERSION}. Ignoring save.`,
    );
    return null;
  } catch (e) {
    console.warn('Failed to load world:', e);
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * v11..v14 → v15: collapses the fixed-tier comprehension ladder into the
 * Phase 6 power-of-2 ladder (DESIGN.md §9; ROADMAP §2 Phase 6).
 *
 * Strategy:
 *   1. Round the player's saved ceiling UP to the next power of 2. Never
 *      down — comprehension represents capability already paid for.
 *   2. Strip all old `comprehension_X` ids from `unlocks` and
 *      `purchaseCounts`. They reference entries that no longer exist.
 *   3. Back-fill new `comp_N` ids for every tier up to and including the
 *      resolved ceiling, so the UI hides them as "owned" rather than
 *      re-offering them.
 *
 * Pre-Phase-6 baseline was 10 (auto-granted to cover starting blocks);
 * Phase 6 baseline is 2. A v14 save with no comp upgrades had comp=10;
 * post-migration that becomes comp=16 (next power of 2), with comp_2,
 * comp_3, comp_4 implicitly owned. Never lift capability is lost.
 */
function migrateCompLadderToV15(data: SaveData): SaveData {
  const v14Ceiling = data.comprehension ?? 10;
  const v15Ceiling = Math.max(2, nextPowerOf2(v14Ceiling));
  const tierN = Math.round(Math.log2(v15Ceiling));

  const oldCompIds = new Set([
    'comprehension_25',
    'comprehension_100',
    'comprehension_250',
    'comprehension_1k',
    'comprehension_10k',
    'comprehension_100k',
    'comprehension_1m',
    'comprehension_1b',
  ]);

  const unlocks = new Set(
    (data.unlocks ?? []).filter((id) => !oldCompIds.has(id)),
  );
  const counts = new Map(
    (data.purchaseCounts ?? []).filter(([id]) => !oldCompIds.has(id)),
  );

  // Back-fill new ids. `comp_1` is the baseline (ceiling 2) and isn't a
  // purchasable entry, so we start at n=2.
  for (let n = 2; n <= tierN; n++) {
    const id = `comp_${n}`;
    unlocks.add(id);
    if ((counts.get(id) ?? 0) === 0) counts.set(id, 1);
  }

  return {
    ...data,
    version: SAVE_VERSION,
    comprehension: v15Ceiling,
    unlocks: [...unlocks],
    purchaseCounts: [...counts],
  };
}

/** Returns the smallest power of 2 ≥ n. Floor at 1. */
function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * v15 → v16: dissolves pipe leveling and regenerates the pipe Literature
 * ladder on a power-of-2 model. Old pipe ids (`pipe_1` mag 1,
 * `pipe_10` mag 10, `pipe_100` mag 100, `pipe_1k` mag 1000) map to
 * `pipe_N` where N is the next-power-of-2 ≥ the old magnitude.
 * Pipe-level entries (`pipe_X_lvlY`) and the `pipeLevels` save field
 * are stripped entirely.
 *
 * The actual pipe INSTANCES on canvas (in `data.pipes`) keep their
 * magnitudes — a saved magnitude-10 pipe stays magnitude 10 and
 * continues to operate. Only the Literature catalog and level state
 * are reshaped.
 */
function migratePipeLadderToV16(data: SaveData): SaveData {
  // Old pipe placement ids → new pipe ids (next-power-of-2 ≥ old mag).
  const PIPE_ID_REMAP: Record<string, string> = {
    pipe_1: 'pipe_0',   // mag 1 = 2^0
    pipe_10: 'pipe_4',  // 10 → 16 = 2^4
    pipe_100: 'pipe_7', // 100 → 128 = 2^7
    pipe_1k: 'pipe_10', // 1000 → 1024 = 2^10
  };

  // Old pipe-level ids — dropped entirely.
  const oldPipeLevelIds = new Set<string>();
  for (const mag of [1, 10, 100]) {
    for (let lvl = 2; lvl <= 5; lvl++) {
      oldPipeLevelIds.add(`pipe_${mag === 1 ? '1' : mag}_lvl${lvl}`);
    }
  }

  const remapId = (id: string): string | null => {
    if (oldPipeLevelIds.has(id)) return null; // strip
    return PIPE_ID_REMAP[id] ?? id;
  };

  const unlocksOut = new Set<string>();
  for (const id of data.unlocks ?? []) {
    const next = remapId(id);
    if (next !== null) unlocksOut.add(next);
  }

  const countsOut = new Map<string, number>();
  for (const [id, count] of data.purchaseCounts ?? []) {
    const next = remapId(id);
    if (next === null) continue;
    countsOut.set(next, (countsOut.get(next) ?? 0) + count);
  }

  return {
    ...data,
    version: SAVE_VERSION,
    unlocks: [...unlocksOut],
    purchaseCounts: [...countsOut],
    pipeLevels: undefined, // strip
  };
}

/**
 * v16 → v17: α.5c Ladder Rule. Tier-1+ cells (mult/div/exp/tet/pent/
 * variadic-arrow) no longer have a fuel-port input slot — fuel is
 * pulled automatically from the global pool as a multi-block ladder.
 *
 * Legacy cells have a 3rd (or 4th, variadic-arrow) `pending` entry
 * that was the fuel slot. We trim the pending array to match the new
 * cell shape; any pending fuel block in the slot is dropped silently
 * (worst case is a single block per such cell — minor compared to
 * the new system's benefits).
 *
 * Inversion keeps its fuel port (signed-fuel contract) — its pending
 * shape is unchanged.
 */
function migrateLadderRuleToV17(data: SaveData): SaveData {
  // Map cell type → new operand count (pending entries to keep).
  const NEW_OPERAND_COUNT: Record<string, number> = {
    multiplication: 2,
    division: 2,
    exponentiation: 2,
    tetration: 2,
    pentation: 2,
    'variadic-arrow': 3, // base + arrows + height (no fuel)
  };

  const cells = (data.cells ?? []).map((c) => {
    const newLen = NEW_OPERAND_COUNT[c.type];
    if (newLen === undefined) return c;
    if (!Array.isArray(c.pending)) return c;
    if (c.pending.length <= newLen) return c;
    // Trim trailing fuel-slot entry/entries.
    return { ...c, pending: c.pending.slice(0, newLen) };
  });

  return { ...data, version: SAVE_VERSION, cells };
}

function migrateRiverEndpoints(data: SaveData): SaveData {
  const pipes = (data.pipes ?? []).map((p) => ({
    ...p,
    source: migrateEndpoint(p.source),
    dest: migrateEndpoint(p.dest),
  }));
  return { ...data, pipes };
}

/**
 * Migrates a single pipe endpoint from any earlier shape to the current one.
 * v2's `{kind: 'river', x, y}` → v3's `{kind: 'river', screenX, screenY}`.
 * Cell endpoints are stable across versions and pass through unchanged.
 */
function migrateEndpoint(ep: unknown): PipeEndpoint {
  const raw = ep as Record<string, unknown>;
  if (raw && raw.kind === 'river') {
    if (typeof raw.screenX === 'number') return raw as unknown as PipeEndpoint;
    const x = typeof raw.x === 'number' ? raw.x : 0;
    const y = typeof raw.y === 'number' ? raw.y : 0;
    return { kind: 'river', screenX: x, screenY: y };
  }
  return raw as unknown as PipeEndpoint;
}

/**
 * v4 → v5: wraps every numeric block value, pending slot, warehouse stored
 * value, and cultivation seed in a `{ kind: 'real'; n: string }` envelope.
 * Idempotent: values already in the v5 shape pass through unchanged.
 */
function migrateValues(data: SaveData): SaveData {
  const blocks = (data.blocks ?? []).map((b) => ({
    ...b,
    value: wrapValue((b as unknown as { value: unknown }).value),
  })) as BlockSnapshot[];

  const cells = (data.cells ?? []).map((c) => {
    const next: CellSnapshot = {
      ...c,
      pending: (c.pending ?? []).map((p) => (p === null || p === undefined ? null : wrapValue(p))),
    };
    if (c.warehouseState) {
      const sv = (c.warehouseState as unknown as { storedValue: unknown }).storedValue;
      next.warehouseState = {
        ...c.warehouseState,
        storedValue: sv === null || sv === undefined ? null : wrapValue(sv),
      };
    }
    if (c.cultivationState) {
      const seed = (c.cultivationState as unknown as { seed: unknown }).seed;
      next.cultivationState = {
        ...c.cultivationState,
        seed: seed === null || seed === undefined ? null : wrapValue(seed),
      };
    }
    return next;
  });

  return { ...data, blocks, cells };
}

/** Wrap any legacy form into a ValueSnapshot. Numbers → `{ kind, n }`. */
function wrapValue(raw: unknown): ValueSnapshot {
  if (typeof raw === 'number') return { kind: 'real', n: String(raw) };
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (o.kind === 'real' && typeof o.n === 'string') {
      return raw as ValueSnapshot;
    }
    if (o.kind === 'rational' && typeof o.num === 'string' && typeof o.den === 'string') {
      return raw as ValueSnapshot;
    }
    if (o.kind === 'irrational' && typeof o.symbol === 'string' && typeof o.approx === 'string') {
      return raw as ValueSnapshot;
    }
    if (o.kind === 'complex' && typeof o.re === 'string' && typeof o.im === 'string') {
      return raw as ValueSnapshot;
    }
  }
  // Unrecognised input — default to zero. Better than dropping the whole save.
  return { kind: 'real', n: '0' };
}

/**
 * Rehydrates the world from a save. Wipes any current state first, then
 * iterates blocks and cells through the controller's rehydrate methods so
 * each gets its Pixi container, world registration, and interaction wiring.
 * Achievements, unlocks, purchase counts, and seen-marginalia keys are
 * restored as raw sets.
 */
export function restoreFromSave(controller: DragController, data: SaveData): void {
  resetWorld();
  restoreSeenMarginalia(data.seenMarginalia);
  // V2.5: restore Core HP + fortification before setupCore builds the Core
  // (setupCore keeps a positive restored HP rather than re-initialising).
  restoreAdversary({ coreHp: data.coreHp, fortifyTiers: data.coreFortifyTiers, shield: data.coreShield });

  for (const cell of data.cells) {
    controller.rehydrateCell(
      cell.type as CellType,
      cell.x,
      cell.y,
      cell.pending.map((p) => (p === null ? null : valueRestore(p))),
      cell.warehouseState
        ? {
            storedValue: cell.warehouseState.storedValue
              ? valueRestore(cell.warehouseState.storedValue)
              : null,
            storedCount: cell.warehouseState.storedCount,
            capacity: cell.warehouseState.capacity,
          }
        : undefined,
      cell.cultivationState
        ? {
            seed: cell.cultivationState.seed ? valueRestore(cell.cultivationState.seed) : null,
            cultivationStep: cell.cultivationState.cultivationStep,
            cultivationCooldownMs: cell.cultivationState.cultivationCooldownMs,
            cultivationCooldownRemaining: cell.cultivationState.cultivationCooldownRemaining,
          }
        : undefined,
      cell.botState
        ? {
            botRadius: cell.botState.botRadius,
            botCooldownMs: cell.botState.botCooldownMs,
            botCooldownRemaining: cell.botState.botCooldownRemaining,
            botPhase: cell.botState.botPhase,
            botTargetBlockId: cell.botState.botTargetBlockId,
            botDestCellId: cell.botState.botDestCellId,
            botWorkerX: cell.botState.botWorkerX,
            botWorkerY: cell.botState.botWorkerY,
            botSpeed: cell.botState.botSpeed,
            botCarried: cell.botState.botCarried
              ? valueRestore(cell.botState.botCarried)
              : null,
            botRating: cell.botState.botRating,
          }
        : undefined,
      cell.ruleWarehouseState
        ? {
            ruleId: cell.ruleWarehouseState.ruleId,
            items: cell.ruleWarehouseState.items.map((it) => ({
              value: valueRestore(it.value),
              count: it.count,
            })),
            capacity: cell.ruleWarehouseState.capacity,
          }
        : undefined,
      cell.filterState ? { ruleId: cell.filterState.ruleId } : undefined,
      cell.batteryState ? { mode: cell.batteryState.mode } : undefined,
    );
  }
  for (const block of data.blocks) {
    controller.rehydrateBlock(valueRestore(block.value), block.count, block.x, block.y);
  }

  // Pipes restore AFTER cells so endpoint lookups (by cell id) resolve.
  if (data.pipes) {
    for (const pipe of data.pipes) {
      controller.rehydratePipe(
        pipe.source,
        pipe.dest,
        pipe.magnitude,
        pipe.cooldownMs,
        pipe.cooldownRemaining,
      );
    }
  }

  restoreAchievements(data.achievements);
  restoreUnlocks(data.unlocks);
  restorePurchaseCounts(data.purchaseCounts);
  // Discoveries restore BEFORE any rehydration would fire `addBlock`'s
  // recordDiscovery hook — but addBlock has already run above. The save's
  // own `discoveries` array is the authoritative set; overwrite whatever
  // addBlock seeded during rehydrate.
  if (data.discoveries) restoreDiscoveries(data.discoveries);

  if (typeof data.comprehension === 'number') setComprehension(data.comprehension);
  if (data.camera) restoreCamera(data.camera);
  if (data.cellLevels) restoreCellLevels(data.cellLevels);
  // pipeLevels dropped in v16 (Phase 6 γ.1) — the migration strips
  // the field from older saves before reaching here.
}

/**
 * Subscribes to the world's dirty tick and writes to localStorage on a short
 * debounce. Also installs a `beforeunload` handler that forces a synchronous
 * save, so a tab close mid-debounce doesn't lose work.
 *
 * The initial subscription call fires immediately with the current value;
 * we skip the very first tick to avoid writing on bootstrap before the
 * player has done anything.
 */
export function installAutosave(): () => void {
  let timer: number | null = null;
  let initialSkip = true;

  const unsub = dirtyTick.subscribe(() => {
    if (initialSkip) {
      initialSkip = false;
      return;
    }
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      saveToStorage();
    }, DEBOUNCE_MS);
  });

  const onBeforeUnload = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    saveToStorage();
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    unsub();
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (timer !== null) window.clearTimeout(timer);
  };
}
