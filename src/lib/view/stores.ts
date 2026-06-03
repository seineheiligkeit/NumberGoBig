/**
 * Svelte-readable bridge between the Pixi GameView and the DOM UI.
 *
 * The view (game-view.ts) writes; the Svelte components (App.svelte) read.
 * Keeps the renderer free of any Svelte-component coupling — it just sets
 * plain stores each frame.
 */

import { writable } from 'svelte/store';
import type { CellKind } from '../../../core/engine';

/** Formatted Total Score for the header. */
export const scoreStore = writable('0');

/** The cell kind the player is about to place (toolbar → click canvas), or null. */
export const placingStore = writable<CellKind | null>(null);

/** A short dry-academic note, or null. */
export const noteStore = writable<string | null>(null);
