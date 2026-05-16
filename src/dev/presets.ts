/**
 * Dev presets registry — three pre-built save snapshots for testing:
 *
 *   - `early` (Stage A/B): bootstrap chain through Addition, working
 *     toward Subtraction.
 *   - `mid`   (Stage C):   multiplication + cultivation + bot, full
 *     Phase 3 family showcase.
 *   - `end`   (Stage E/F): full operator hierarchy through Tetration,
 *     Inversion + Negation + wh:negative loop, leveled cells,
 *     magnitude-ladder showcase.
 *
 * Triggers:
 *   - Menu: bottom-left Game Menu has a "Load preset" section.
 *   - URL: `?preset=early|mid|end` installs and reloads once.
 *   - Console: `devLoadEarly()`, `devLoadMid()`, `devLoadEnd()`. The
 *     legacy `devLoadMidgame()` alias is preserved.
 *
 * Each preset writes a full `SaveData` to localStorage. To go back to
 * a fresh game, clear localStorage or use the menu's "New game" /
 * "Hard reset".
 */

import { installEarlyPreset } from './preset-early';
import { installMidgamePreset } from './preset-midgame';
import { installEndPreset } from './preset-end';

export type PresetId = 'early' | 'mid' | 'end';

export interface PresetMeta {
  id: PresetId;
  label: string;
  description: string;
  install: () => void;
}

export const PRESETS: readonly PresetMeta[] = [
  {
    id: 'early',
    label: 'Early game',
    description:
      'Stage A/B boundary — bootstrap chain feeding Addition. Working toward Subtraction.',
    install: installEarlyPreset,
  },
  {
    id: 'mid',
    label: 'Mid game',
    description:
      'Stage C — multiplication, cultivation, cleanup bot. Phase 3 number families showcased.',
    install: installMidgamePreset,
  },
  {
    id: 'end',
    label: 'End game',
    description:
      'Stage E/F — full hierarchy through Tetration. Inversion + Negation wired with negative-fuel; leveled cells; T-bots.',
    install: installEndPreset,
  },
];

/** Installs the named preset then reloads the page so the new save
 *  takes effect. Used by the in-game menu. */
export function loadPreset(id: PresetId): void {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) {
    console.warn(`[dev] Unknown preset id: ${id}`);
    return;
  }
  preset.install();
  window.location.reload();
}

/** Boot-time hook. Registers console helpers and installs a preset if
 *  the URL has `?preset=<id>`. Runs from `main.ts` before mount so
 *  localStorage is ready by the time the renderer loads. */
export function maybeInstallFromUrl(): void {
  const win = window as unknown as {
    devLoadEarly: () => void;
    devLoadMid: () => void;
    devLoadEnd: () => void;
    devLoadMidgame: () => void;
  };
  win.devLoadEarly = () => loadPreset('early');
  win.devLoadMid = () => loadPreset('mid');
  win.devLoadEnd = () => loadPreset('end');
  // Legacy alias — keep working for anyone with the old console hint.
  win.devLoadMidgame = () => loadPreset('mid');

  const url = new URL(window.location.href);
  const param = url.searchParams.get('preset');
  if (!param) return;

  // Accept both new short ids ('early', 'mid', 'end') and the legacy
  // 'midgame' for back-compat with bookmarks and docs.
  const normalised: PresetId | null =
    param === 'early' ? 'early'
    : param === 'mid' || param === 'midgame' ? 'mid'
    : param === 'end' ? 'end'
    : null;

  if (!normalised) {
    console.warn(`[dev] Unknown preset URL param: ${param}`);
    return;
  }

  const preset = PRESETS.find((p) => p.id === normalised);
  if (!preset) return;
  preset.install();
  url.searchParams.delete('preset');
  window.history.replaceState({}, '', url.toString());
}
