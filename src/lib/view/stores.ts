/**
 * Svelte-readable bridge between the Pixi GameView and the DOM UI.
 *
 * The view (game-view.ts) writes; the Svelte components (App.svelte) read.
 * Keeps the renderer free of any Svelte-component coupling — it just sets
 * plain stores each frame.
 */

import { writable } from 'svelte/store';
import type { CellKind } from '../../../core/engine';

/** What the player is about to place / draw. `'pipe'` is the two-click pipe
 *  tool; a CellKind is a cell to drop; null is the idle pointer. */
export type Tool = CellKind | 'pipe';

/** Formatted Total Score for the header. */
export const scoreStore = writable('0');

/** The active tool (toolbar → click canvas), or null. */
export const toolStore = writable<Tool | null>(null);

/** A short dry-academic note, or null. */
export const noteStore = writable<string | null>(null);

// --- Dev instruments (playtest monitors) -----------------------------------

/** Formatted FRONTIER — the biggest single number anywhere (the real "numbers
 *  go big" metric, distinct from Total Score). */
export const frontierStore = writable('0');

/** Live factory stats for the dev monitor. */
export const statsStore = writable({ cells: 0, pipes: 0, loose: 0, elapsed: 0, working: 0, building: 0, slots: 1 });

/** Playback speed in engine ticks per real second (0 = paused). The dev speed
 *  control writes this; the ticker reads it. */
export const speedStore = writable(3);

/** The most recently reached magnitude milestone (e.g. "a googol"), or null.
 *  The view sets it once when the frontier first crosses a threshold; the
 *  narrator (P4) reacts. */
export const milestoneStore = writable<string | null>(null);

/** Tools the player has unlocked — the toolbar filters by this for a gentle
 *  progressive reveal. You start able to make and combine ones; the amplifiers
 *  appear as you build their prerequisites. */
export const unlockedTools = writable<Tool[]>(['successor', 'addition', 'pipe']);

/** Whether the synth audio layer is muted (the 🔊/🔇 toggle). */
export const audioMuted = writable(false);

/** Live build-time preview per tool ("~45s") — the cost grows with each cell
 *  of that kind you own (a core rule the shelf should never let surprise you). */
export const buildPreviews = writable<Record<string, string>>({});
