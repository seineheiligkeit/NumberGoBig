/**
 * Filter routing — Slice 5.2.
 *
 * A Filter cell takes one input and emits it at one of two outputs
 * (port 0 = match, port 1 = no-match) based on its predicate. Like
 * Warehouses, Filters live outside the normal `operate()` fire path —
 * they don't compute, they just route. Both interaction paths
 * (manual drop, pipe delivery) call `routeViaFilter` and rely on it to
 * spawn the output block (or merge into an existing stack).
 *
 * The predicate vocabulary is shared with `warehouse-rules.ts`, so a
 * `filter: prime` and a `warehouse: prime` agree on which values pass.
 */

import type { Container } from 'pixi.js';
import { type PlacedBlock, type PlacedCell } from './world';
import { getWarehouseRule } from '../../core/warehouse-rules';
import { type Value } from '../../core/value';
import { commitSpawn, planSpawnAtPort } from './spawn';

// Shared spawn-block-interaction-attach hook lives in `./spawn`. The
// no-op kept here only so older callers stay valid.
export function setFilterBlockInteractionAttach(_fn: (b: PlacedBlock) => void): void {
  // intentionally empty
}

/**
 * Routes `value` through `cell` (a filter). Picks port 0 if the rule
 * matches, port 1 otherwise; back-pressures (returns false) when the
 * chosen output port is clogged so the upstream pipe/drop sees the
 * refusal and falls back to spawning a loose block.
 *
 * Returns true on success, false on no rule / clogged output.
 */
export function routeViaFilter(
  cell: PlacedCell,
  value: Value,
  canvasLayer: Container,
): boolean {
  if (cell.type !== 'filter') return false;
  const rule = getWarehouseRule(cell.ruleId);
  if (!rule) return false;

  const portIndex = rule.test(value) ? 0 : 1;
  const target = planSpawnAtPort(cell, portIndex, value);
  // Phase 6 β.3: 'jammed' (uncomprehended block at the port) refuses
  // the route the same way 'clogged' (fan full) does. Filters silently
  // hold the input pending — the upstream pipe deliver_dest will retry
  // when the jam/clog clears.
  if (target === 'clogged' || target === 'jammed') return false;
  commitSpawn(target, value, canvasLayer);
  return true;
}
