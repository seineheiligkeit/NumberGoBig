/**
 * The narrator — dry-academic marginalia in the left margin.
 *
 * The view pushes short notes (milestones, first-time events, observations on
 * duration); `Marginalia.svelte` renders the most recent few, fading them out.
 * Tone: a maths TA observing student work — short, occasionally amused, never
 * theatrical, no story (CLAUDE.md narrator rules).
 */

import { writable } from 'svelte/store';

export interface Note {
  id: number;
  text: string;
}

export const marginalia = writable<Note[]>([]);

const seen = new Set<string>();
let nextId = 1;
const MAX_VISIBLE = 4;
const LIFETIME_MS = 9000;

/**
 * Push a marginal note. If `key` is given, the note fires only once ever — for
 * first-time observations ("the first burn", "construction complete") that
 * shouldn't repeat. Milestone notes pass no key (the caller already dedupes).
 */
export function note(text: string, key?: string): void {
  if (key) {
    if (seen.has(key)) return;
    seen.add(key);
  }
  const id = nextId++;
  marginalia.update((list) => {
    const next = [...list, { id, text }];
    return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
  });
  setTimeout(() => {
    marginalia.update((list) => list.filter((n) => n.id !== id));
  }, LIFETIME_MS);
}
