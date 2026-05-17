/**
 * Blueprints — player-defined named layouts that can be stamped onto
 * the canvas (Slice 5.4, DESIGN §14).
 *
 * v1 scope: a Blueprint captures a subgraph of cells + the pipes that
 * connect them. Stamping a Blueprint places fresh copies of those cells
 * and pipes at a chosen offset. There's no packed-cell semantics yet —
 * a stamped blueprint is indistinguishable from manually-placed cells.
 * The Phase 4 design has Blueprints as single-cell abstractions; that
 * upgrade can layer on top of this foundation in a later pass.
 *
 * Blueprints persist in their own localStorage key so the main save
 * schema doesn't need a version bump every time the catalog changes.
 * They are intentionally separate from the main save — they survive
 * `clearStorage()` (the player's intellectual property is permanent).
 */

import { writable, type Readable } from 'svelte/store';
import {
  allCells,
  allPipes,
  type CellSnapshot,
  type PipeSnapshot,
  type PlacedCell,
} from './world';
import { valueSnapshot } from '../../core/value';

const STORAGE_KEY = 'numbers-go-big.blueprints';

export interface BlueprintDef {
  id: string;
  name: string;
  createdAt: number;
  /** Cell snapshots with coordinates relative to the blueprint's anchor
   *  (top-left of the captured bounding box). Stamp adds (anchorX, anchorY)
   *  back at placement time. */
  cells: CellSnapshot[];
  /** Pipes connecting captured cells. Only cell-output → cell-input pipes
   *  are kept; river-anchored or outside-pointing pipes are dropped. The
   *  `cellId` indices reference the position of the cell in `cells[]`. */
  pipes: BlueprintPipe[];
  /** Bounding-box dimensions in pixels, used for the ghost preview. */
  width: number;
  height: number;
}

export interface BlueprintPipe {
  sourceCellIdx: number;
  sourcePortIdx: number;
  destCellIdx: number;
  destPortIdx: number;
  magnitude: number;
  cooldownMs: number;
}

const _blueprints = writable<readonly BlueprintDef[]>([]);
export const blueprints: Readable<readonly BlueprintDef[]> = _blueprints;

let _current: readonly BlueprintDef[] = [];
_blueprints.subscribe((b) => {
  _current = b;
});

export function allBlueprints(): readonly BlueprintDef[] {
  return _current;
}

/**
 * Captures a Blueprint from a list of currently-placed cells. Pipes
 * entirely interior to the selection (both endpoints in `selectedCells`)
 * are included; pipes crossing the selection boundary are dropped.
 * Returns the new BlueprintDef, or null if the selection is empty.
 */
export function createBlueprint(
  name: string,
  selectedCells: readonly PlacedCell[],
): BlueprintDef | null {
  if (selectedCells.length === 0) return null;

  // Anchor at the top-left corner of the selection's bounding box so
  // stamping at (mx, my) lands the top-left there.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of selectedCells) {
    if (c.container.x < minX) minX = c.container.x;
    if (c.container.y < minY) minY = c.container.y;
    if (c.container.x > maxX) maxX = c.container.x;
    if (c.container.y > maxY) maxY = c.container.y;
  }
  const anchorX = minX;
  const anchorY = minY;

  // Snapshot each cell relative to anchor. Reuse the snapshotCells shape
  // so stamping can route through the same rehydrate path.
  const idIndex = new Map<number, number>();
  const cells: CellSnapshot[] = selectedCells.map((c, i) => {
    idIndex.set(c.id, i);
    const snap: CellSnapshot = {
      type: c.type,
      x: c.container.x - anchorX,
      y: c.container.y - anchorY,
      // Pending input state is intentionally cleared — stamping a
      // blueprint should produce a clean fresh copy, not a half-loaded
      // ghost of someone else's run.
      pending: c.pending.map(() => null),
    };
    if (c.type === 'warehouse') {
      snap.warehouseState = {
        storedValue: null,
        storedCount: 0,
        capacity: c.capacity ?? 100,
      };
    }
    if (c.type === 'warehouse-rule') {
      snap.ruleWarehouseState = {
        ruleId: c.ruleId ?? '',
        items: [],
        capacity: c.capacity ?? 100,
      };
    }
    if (c.type === 'filter') {
      snap.filterState = { ruleId: c.ruleId ?? '' };
    }
    if (
      c.type === 'cultivation-arithmetic' ||
      c.type === 'cultivation-geometric' ||
      c.type === 'cultivation-fibonacci'
    ) {
      const cd = c.cultivationCooldownMs ?? 2000;
      snap.cultivationState = {
        // Seed cleared — stamping a cultivation cell shouldn't auto-start.
        seed: null,
        cultivationStep: 0,
        cultivationCooldownMs: cd,
        cultivationCooldownRemaining: cd,
      };
    }
    if (c.type === 'cleanup-bot') {
      snap.botState = {
        botRadius: c.botRadius ?? 240,
        botCooldownMs: c.botCooldownMs ?? 2500,
        botCooldownRemaining: c.botCooldownMs ?? 2500,
      };
    }
    return snap;
  });

  // Snapshot pipes that are entirely interior to the selection.
  const pipes: BlueprintPipe[] = [];
  for (const p of allPipes()) {
    if (p.source.kind !== 'cell-output' || p.dest.kind !== 'cell-input') continue;
    const srcIdx = idIndex.get(p.source.cellId);
    const dstIdx = idIndex.get(p.dest.cellId);
    if (srcIdx === undefined || dstIdx === undefined) continue;
    pipes.push({
      sourceCellIdx: srcIdx,
      sourcePortIdx: p.source.portIndex,
      destCellIdx: dstIdx,
      destPortIdx: p.dest.portIndex,
      magnitude: p.magnitude,
      cooldownMs: p.cooldownMs,
    });
  }

  const blueprint: BlueprintDef = {
    id: `bp_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    createdAt: Date.now(),
    cells,
    pipes,
    width: maxX - anchorX,
    height: maxY - anchorY,
  };

  _blueprints.update((list) => [...list, blueprint]);
  saveToStorage();
  return blueprint;
}

export function deleteBlueprint(id: string): void {
  _blueprints.update((list) => list.filter((b) => b.id !== id));
  saveToStorage();
}

export function findBlueprint(id: string): BlueprintDef | null {
  return _current.find((b) => b.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Persistence — separate localStorage key from the world save.
// ---------------------------------------------------------------------------

interface BlueprintsSnapshot {
  version: 1;
  blueprints: BlueprintDef[];
}

function saveToStorage(): void {
  try {
    const data: BlueprintsSnapshot = {
      version: 1,
      blueprints: [..._current] as BlueprintDef[],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save blueprints:', e);
  }
}

export function loadBlueprintsFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as BlueprintsSnapshot;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return;
    if (!Array.isArray(parsed.blueprints)) return;
    _blueprints.set(parsed.blueprints);
  } catch (e) {
    console.warn('Failed to load blueprints:', e);
  }
}

// Re-export the shape so the renderer / persistence layer can use it
// for type assertions without re-importing from world.ts.
export type { CellSnapshot, PipeSnapshot };
// Silence unused-import warnings for re-exports.
export type _Unused = [typeof valueSnapshot];
