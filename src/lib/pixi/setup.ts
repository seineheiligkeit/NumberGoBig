import { Application, Container } from 'pixi.js';
import { drawPaper } from './paper';
import { setupRiver } from './river';
import { applyComprehensionStyle, updateStackBadge } from './block';
import { createDragController } from '../interaction';
import {
  allBlocks,
  blockCount,
  comprehension,
  comprehensionLevel,
  markDirty,
  onBlockChange,
  unlockAchievement,
} from '../world';
import { showMarginalia } from '../marginalia';
import { installAutosave, loadFromStorage, restoreFromSave } from '../persistence';
import { loadBlueprintsFromStorage } from '../blueprints';
import { onCameraChange, setupCamera } from '../camera';
import { tickEquationCells, tickPipes } from '../pipe';
import { tickCultivation } from '../cultivation';
import { tickBots } from '../bots';
import { tickRiverTapSuccessors } from '../river-tap';
import {
  allCells,
  cellLevel,
  cellLevels,
} from '../world';
import { applyLevelBadge, cellLevelBadgeOffset } from './level-badge';
import { VALUE_ZERO } from '../value';
import { family } from '../family';
import { valueLabelTier } from './value-label';

/**
 * Bootstraps the PixiJS canvas inside the given container element and
 * assembles the layered scene:
 *
 *   1. Paper background (static, redrawn on resize)
 *   2. Canvas layer (player-placed blocks and cells)
 *   3. River (animated, continuous leftward drift; interactive)
 *
 * Also wires up:
 *   - The drag controller
 *   - The world's block-change listener → badge re-rendering
 *   - The first-block-placed achievement (unlocks Literature)
 *   - Marginalia for milestone events (achievement, first purchase)
 */
export async function setupPixi(container: HTMLElement): Promise<void> {
  const app = new Application();

  await app.init({
    background: 0xfbf7ee,
    resizeTo: container,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  container.appendChild(app.canvas);

  // Layer 1: paper
  let paper = drawPaper(app.screen.width, app.screen.height);
  app.stage.addChild(paper);

  // Layer 2: canvas (player-placed content)
  const canvasLayer = new Container();
  app.stage.addChild(canvasLayer);

  // Camera: middle-mouse / right-mouse pan, wheel zoom. Transforms canvasLayer.
  setupCamera(app, canvasLayer);
  // Persist camera state through the autosave path (debounced — pan/zoom
  // bursts collapse into a single localStorage write).
  onCameraChange(() => markDirty());

  // World <-> render glue: whenever a stack changes (or a new block lands),
  // refresh the badge and the Comprehension fade.
  onBlockChange((block) => {
    updateStackBadge(block);
    applyComprehensionStyle(block, comprehensionLevel());
    // First-encounter narrator beats. Marginalia dedups by key, so each
    // family's beat fires exactly once across the lifetime of the save.
    const fam = family(block.value);
    if (fam === 'negative') {
      showMarginalia(
        'Less than nothing. Mathematicians spent centuries quietly disagreeing about whether this counted.',
        'first_negative',
      );
    } else if (fam === 'rational') {
      showMarginalia(
        'A non-integer ratio. The Pythagoreans had a man drowned for less.',
        'first_rational',
      );
    } else if (fam === 'irrational') {
      showMarginalia(
        'You have produced a number that cannot be written as a ratio. We owe you, on behalf of the Pythagoreans, an apology.',
        'first_irrational',
      );
    } else if (fam === 'complex') {
      showMarginalia(
        'You have constructed √(-1). We extend our condolences, and our admiration.',
        'first_complex',
      );
    }

    // Notation-transition beats (Slice 6.2a). DESIGN §17 — each time the
    // magnitude crosses a rendering tier for the first time, the narrator
    // notes it. Marginalia dedups by key, so each beat fires exactly once
    // across the save's lifetime. The `commas` beat is quiet (this is just
    // "your numbers got bigger"); the `sci` beat is the first true escalation
    // off conventional notation, so the line carries more weight.
    const tier = valueLabelTier(block.value);
    if (tier === 'commas') {
      showMarginalia(
        'Comma notation engaged. Your numbers now require punctuation.',
        'first_commas_tier',
      );
    } else if (tier === 'sci') {
      showMarginalia(
        'Comma notation discontinued. We have transitioned to scientific notation.',
        'first_sci_tier',
      );
    } else if (tier === 'tower') {
      showMarginalia(
        'This number is now a building.',
        'first_tower_tier',
      );
    } else if (tier === 'arrow') {
      showMarginalia(
        'We have stopped writing the tower out. Use your imagination.',
        'first_arrow_tier',
      );
    }
  });

  // Comprehension upgrades retro-style every existing block on the canvas.
  comprehension.subscribe((cap) => {
    for (const b of allBlocks()) applyComprehensionStyle(b, cap);
  });

  // Drag controller (also registers itself as module-level singleton)
  const drag = createDragController(app, canvasLayer);

  // Restore prior session if one exists. Must happen *after* the controller
  // is constructed (the controller is what knows how to rehydrate Pixi
  // containers) and *before* the river / first-block subscription is set up,
  // so the deduped achievement and marginalia fire from the restored state
  // instead of the empty world.
  const saved = loadFromStorage();
  if (saved) restoreFromSave(drag, saved);
  // Blueprints live in their own localStorage key (Slice 5.4) so they
  // survive `clearStorage()` and aren't tangled with the world schema.
  loadBlueprintsFromStorage();

  // Layer 3: river
  const river = setupRiver(app, {
    onZeroPicked: (event) => drag.beginDragFromRiver(event, VALUE_ZERO),
  });
  app.stage.addChild(river);

  // First achievement on first block placed → unlocks Literature.
  // We fire a marginalia note alongside the achievement so the player gets
  // a single beat of recognition. If the world was restored with blocks
  // already present, both the achievement and the marginalia are already
  // deduped via their seen-key sets.
  //
  // The `let … = null; … = subscribe(...)` two-step (rather than a single
  // `const = subscribe(...)`) sidesteps a TDZ crash when restoreFromSave
  // brought in loose blocks: Svelte stores fire subscribers synchronously
  // with the current value, so if `count` is already > 0, the callback
  // would dereference an as-yet-unassigned const. With `let`, the optional
  // chain is just a harmless no-op on the initial fire; the next change
  // fires the callback again (by which time the variable is set) and the
  // unsub takes effect.
  let unsubBlockCount: (() => void) | null = null;
  unsubBlockCount = blockCount.subscribe((count) => {
    if (count > 0) {
      unlockAchievement('play_with_zeros');
      showMarginalia('Play with some zeros.', 'achievement_play_with_zeros');
      unsubBlockCount?.();
    }
  });

  // Autosave: subscribes to the world's dirty tick. Forces a synchronous
  // save on tab close so 250ms of debounce doesn't drop work.
  installAutosave();

  // Level badges (Slice 6.7). Levels are stored per cell-type (not
  // per-instance), so when a Literature upgrade raises a type's level,
  // every cell of that type needs its badge refreshed. Subscribing to
  // the levels store handles both initial restore-from-save and
  // runtime upgrade purchases. The subscription fires with the current
  // state on first subscribe, so the initial pass covers any cells
  // restored from a save.
  //
  // Pipes don't get a corner badge — their level is reflected in the
  // Literature panel only (a pencil pipe is a line, not a box; a
  // floating numeral over it would clutter). Refining the visual is
  // a future polish task.
  cellLevels.subscribe(() => {
    for (const cell of allCells()) {
      const off = cellLevelBadgeOffset(cell.type);
      applyLevelBadge(cell.container, cellLevel(cell.type), off.x, off.y);
    }
  });

  // Simulation loop: cultivation cells emit on their cadence, pipes carry
  // items between cells. Pinned to Pixi's ticker so it pauses when the tab
  // is hidden — autosave persists state on the way out via beforeunload.
  const advance = (dtMs: number): void => {
    tickCultivation(dtMs, canvasLayer);
    // River-tap: lvl-3+ Successors emit on their own cadence even
    // without a pipe attached (Slice 6.7).
    tickRiverTapSuccessors(dtMs, canvasLayer);
    tickPipes(dtMs, canvasLayer);
    // Equation cells loaded but blocked on computational cost retry here.
    // Cheap when nothing is blocked.
    tickEquationCells(dtMs, canvasLayer);
    // Cleanup bots sweep loose blocks into nearby matching warehouses.
    tickBots(dtMs, canvasLayer);
  };
  app.ticker.add((ticker) => advance(ticker.deltaMS));

  // Dev-only: expose the manual driver + the live world module so headless
  // preview tooling can drive the simulation and inspect runtime state
  // (cells, blocks, badge text). Stripped from production builds.
  if (import.meta.env.DEV) {
    const win = window as unknown as {
      __nbgAdvance: (dt: number) => void;
      __nbgWorld: typeof import('../world');
      __nbgController: typeof drag;
    };
    win.__nbgAdvance = advance;
    win.__nbgController = drag;
    import('../world').then((w) => {
      win.__nbgWorld = w;
    });
  }

  // (Unlock marginalia is fired by literature.ts inside purchase().)

  // Redraw paper and reposition river on resize. Placed blocks/cells keep
  // their absolute positions on the canvas layer. Destroy the old paper
  // container before replacing it — previously each resize event leaked
  // one detached Container + Graphics.
  window.addEventListener('resize', () => {
    app.stage.removeChild(paper);
    paper.destroy({ children: true });
    paper = drawPaper(app.screen.width, app.screen.height);
    app.stage.addChildAt(paper, 0);

    river.y = app.screen.height - 90;
  });
}
