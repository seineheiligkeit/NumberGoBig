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

/** The JOURNAL (U4.3) — the notebook's back page. Every note ever shown,
 *  timestamped; nothing evaporates anymore. Rendered by the journal panel. */
export interface JournalEntry {
  id: number;
  t: string; // wall-clock HH:MM
  text: string;
}
export const journal = writable<JournalEntry[]>([]);
const JOURNAL_CAP = 300;

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
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  journal.update((list) => {
    const next = [...list, { id, t: `${hh}:${mm}`, text }];
    return next.length > JOURNAL_CAP ? next.slice(next.length - JOURNAL_CAP) : next;
  });
  setTimeout(() => {
    marginalia.update((list) => list.filter((n) => n.id !== id));
  }, LIFETIME_MS);
}
