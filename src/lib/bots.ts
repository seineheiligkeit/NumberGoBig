import type { Container } from 'pixi.js';
import {
  allBlocks,
  allCells,
  decreaseStack,
  depositToWarehouse,
  type PlacedBlock,
  type PlacedCell,
} from './world';
import { spawnSweepPulse } from './pixi/cleanup-bot';
import { valueEq, type Value } from './value';

/**
 * Bot tick — for each cleanup bot, look for a loose block within its sweep
 * radius and a matching warehouse anywhere on the canvas. If both are found,
 * transfer one unit and flash a small pulse line.
 *
 * Bots prefer the *closest* candidate block and the *closest* matching
 * warehouse, so multiple bots near each other don't all fight over the same
 * pile.
 */

export function tickBots(dtMs: number, canvasLayer: Container): void {
  for (const cell of allCells()) {
    if (cell.type !== 'cleanup-bot') continue;
    const cooldown = cell.botCooldownMs ?? 2500;
    cell.botCooldownRemaining = (cell.botCooldownRemaining ?? cooldown) - dtMs;
    if ((cell.botCooldownRemaining ?? 0) > 0) continue;
    cell.botCooldownRemaining = cooldown;

    const radius = cell.botRadius ?? 240;
    const block = findClosestBlock(cell.container.x, cell.container.y, radius);
    if (!block) continue;

    const warehouse = findClosestMatchingWarehouse(cell.container.x, cell.container.y, block.value);
    if (!warehouse) continue;

    // Transfer.
    const ok = depositToWarehouse(warehouse, block.value);
    if (!ok) continue;
    decreaseStack(block, 1);

    // Visual pulse: bot → block, then block → warehouse. For simplicity v1
    // we just draw bot → warehouse as a single sweep.
    spawnSweepPulse(canvasLayer, cell.container.x, cell.container.y, warehouse.container.x, warehouse.container.y);
  }
}

function findClosestBlock(x: number, y: number, radius: number): PlacedBlock | null {
  let best: PlacedBlock | null = null;
  let bestDist = Infinity;
  for (const b of allBlocks()) {
    if (b.count <= 0) continue;
    const dx = b.container.x - x;
    const dy = b.container.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) continue;
    if (dist < bestDist) {
      best = b;
      bestDist = dist;
    }
  }
  return best;
}

function findClosestMatchingWarehouse(
  x: number,
  y: number,
  value: Value,
): PlacedCell | null {
  let best: PlacedCell | null = null;
  let bestDist = Infinity;
  for (const c of allCells()) {
    if (c.type !== 'warehouse') continue;
    if (c.storedValue !== null && c.storedValue !== undefined && !valueEq(c.storedValue, value)) {
      continue;
    }
    const cap = c.capacity ?? 0;
    if ((c.storedCount ?? 0) >= cap) continue;
    const dx = c.container.x - x;
    const dy = c.container.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}
