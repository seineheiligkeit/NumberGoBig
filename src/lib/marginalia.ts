import { writable, type Readable } from 'svelte/store';

/**
 * Marginalia — pencil-margin annotations from the narrator.
 *
 * The narrator never has a story. They just comment, in the manner of a dry
 * academic, on what the player has done. Marginalia appear in the left
 * margin, in a slightly different hand from the gameplay text (Caveat vs
 * Kalam), and fade out after a few seconds so they don't accumulate.
 *
 * Each note carries an optional `key` — when present, the note is shown only
 * once ever (within the current session). Repeated triggers are no-ops. This
 * is what makes the first-pickup / first-block / first-one notes feel like
 * moments rather than chatter.
 */

export interface MarginaliaNote {
  id: number;
  text: string;
  /** Random rotation in radians for hand-placed feel. */
  rotation: number;
  /** Milliseconds before the note begins fading out. */
  ttl: number;
}

const _notes = writable<MarginaliaNote[]>([]);
export const notes: Readable<MarginaliaNote[]> = _notes;

let nextId = 1;
const seenKeys = new Set<string>();

const DEFAULT_TTL_MS = 8000;
const ROTATION_RANGE_RAD = 0.025;

/**
 * Surface a marginalia note. If `key` is provided and was previously seen,
 * this is a no-op (one-shot notes). Otherwise the note appears immediately,
 * lives for `ttl` ms, then fades away.
 */
export function showMarginalia(text: string, key?: string, ttl = DEFAULT_TTL_MS): void {
  if (key) {
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
  }

  const note: MarginaliaNote = {
    id: nextId++,
    text,
    rotation: (Math.random() - 0.5) * 2 * ROTATION_RANGE_RAD,
    ttl,
  };

  _notes.update((list) => [...list, note]);

  window.setTimeout(() => {
    _notes.update((list) => list.filter((n) => n.id !== note.id));
  }, ttl);
}

/** Snapshot of the one-shot key set — persisted so reloads don't replay notes. */
export function snapshotSeenMarginalia(): string[] {
  return [...seenKeys];
}

export function restoreSeenMarginalia(keys: readonly string[]): void {
  seenKeys.clear();
  for (const k of keys) seenKeys.add(k);
}
