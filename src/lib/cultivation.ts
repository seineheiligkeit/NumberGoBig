/**
 * Cultivation — Phase 6 ε.1.
 *
 * Cultivators used to be timer-driven cells: drop a seed, watch values
 * emit on a cadence. ε.1 inverts the model — they are now input-driven
 * **transformer cells**. Each firing consumes one input value, advances
 * an internal step counter, and emits `f(input, step)` at the output
 * port. The fire path lives in `interaction.ts:fireCell` and
 * `pipe.ts:fireCellViaPipe`; this module retains only the
 * interaction-attach hook for spawn back-compat.
 *
 * What changed:
 *   - `tickCultivation` is gone. The Pixi ticker no longer calls into
 *     this module; cultivators fire like any other operator cell.
 *   - `captureSeed` is gone. The seed concept no longer exists —
 *     pipes and manual drops route to `cell.pending[0]` via the
 *     standard `tryFeedPort` path.
 *   - `cell.seed` is deprecated; saves that carry it have the field
 *     ignored on rehydrate.
 *
 * What persists:
 *   - `cell.cultivationStep` — incremented per firing.
 *   - `cultivationEmit(type, input, step)` (in `cost.ts`) — the
 *     transform formula. Existing 3 cells: arithmetic / geometric /
 *     Fibonacci. ε.2 adds harmonic / polynomial / factorial.
 */

// The shared spawn-block-interaction-attach hook lives in `./spawn`
// (Slice 5.7). Kept this exported no-op so older callers still wire
// through one place; effective attach happens via setSpawnBlockInteractionAttach.
export function setCultivationBlockInteractionAttach(_fn: (b: import('./world').PlacedBlock) => void): void {
  // intentionally empty — interaction.ts now wires setSpawnBlockInteractionAttach.
}
