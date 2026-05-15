import type { CellType } from './cell-types';
import { snapshotSeenMarginalia, restoreSeenMarginalia } from './marginalia';
import {
  dirtyTick,
  resetWorld,
  restoreAchievements,
  restoreCellLevels,
  restoreDiscoveries,
  restorePipeLevels,
  restorePurchaseCounts,
  restoreUnlocks,
  setComprehension,
  snapshotAchievements,
  snapshotBlocks,
  snapshotCellLevels,
  snapshotCells,
  snapshotComprehension,
  snapshotDiscoveries,
  snapshotPipeLevels,
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
 */

const STORAGE_KEY = 'numbers-go-big.save';
const SAVE_VERSION = 13;
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
  /** Per-pipe-magnitude upgrade levels (added in v13). */
  pipeLevels?: [number, number][];
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
    pipeLevels: snapshotPipeLevels(),
  };
}

function saveToStorage(): void {
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
    // v11 → v12: pacing overhaul. The comprehension ladder grew from 3
    // tiers (≤100/≤1k/≤1M) to 8 (≤25/≤100/≤250/≤1k/≤10k/≤100k/≤1M/≤1B).
    // Pre-v12 players paid for exactly the legacy IDs they unlocked; the
    // new sub-tiers were unreachable at the time. We back-fill `unlocks`
    // and `purchaseCounts` so the player's ceiling is treated as if they'd
    // earned every comprehension entry at or below it. This matches the
    // common-sense reading ("I'm at ≤1M, so I implicitly have ≤25 too")
    // without retroactively charging them.
    if (parsed.version === 11) {
      return migrateComprehensionLadder(parsed as SaveData);
    }
    // v12 → v13: leveling system landed. v12 saves have no level state;
    // every cell/pipe defaults to level 1. Pure version bump.
    if (parsed.version === 12) {
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
 * v11 → v12 migration: back-fills the eight-tier comprehension ladder so
 * pre-overhaul players have lower tiers implicitly granted. A player at
 * ceiling 1,000 (from the legacy `comprehension_1k`) is treated as having
 * also earned `comprehension_25`, `comprehension_100`, and
 * `comprehension_250` — every tier at or below their ceiling. We add to
 * both `unlocks` and `purchaseCounts` so the UI hides these as "owned"
 * rather than offering them as still-purchasable.
 *
 * Doing this in the migration (rather than at runtime) keeps the
 * Literature display logic simple — it only ever has to check
 * `purchaseCount > 0` to know if a once-only entry is done.
 */
function migrateComprehensionLadder(data: SaveData): SaveData {
  const ceilings: Array<[string, number]> = [
    ['comprehension_25', 25],
    ['comprehension_100', 100],
    ['comprehension_250', 250],
    ['comprehension_1k', 1000],
    ['comprehension_10k', 10_000],
    ['comprehension_100k', 100_000],
    ['comprehension_1m', 1_000_000],
    ['comprehension_1b', 1_000_000_000],
  ];
  const currentCeiling = data.comprehension ?? 10;

  const unlocks = new Set(data.unlocks ?? []);
  const counts = new Map(data.purchaseCounts ?? []);

  for (const [id, ceiling] of ceilings) {
    if (ceiling <= currentCeiling) {
      unlocks.add(id);
      if ((counts.get(id) ?? 0) === 0) counts.set(id, 1);
    }
  }

  return {
    ...data,
    version: SAVE_VERSION,
    unlocks: [...unlocks],
    purchaseCounts: [...counts],
  };
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
      cell.botState,
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
  if (data.pipeLevels) restorePipeLevels(data.pipeLevels);
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
