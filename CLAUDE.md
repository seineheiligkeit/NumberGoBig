# Numbers Go Big!

A parody incremental game in which the player constructs the natural numbers
— and eventually all of mathematics — from a river of zeros. Solo project.
Web-first.

## Authoritative documents

These two files are the project's north stars. Read them before significant
changes.

- **[DESIGN.md](./DESIGN.md)** — creative basis. Vision, design pillars,
  core systems, aesthetics, narrator tone. Update when design decisions
  change.
- **[ROADMAP.md](./ROADMAP.md)** — execution plan. Phases, slices, what's
  done, what's next, cross-cutting concerns. Update when a slice completes.

## Current state

**Phases 1 and 2 are complete.** Phase 1: manual construction of any
natural number via Successor / Addition / Multiplication / Exponentiation
plus decomposition (Decrement, Factor); Theorem milestones; repeatable
Literature with scaling costs; localStorage autosave. Phase 2: the factory.
Pan-and-zoom canvas; typed warehouses with capacity; magnitude-rated
pipes with a tick-driven simulation; three cultivation cells
(arithmetic / geometric / Fibonacci) for seed-driven streams;
computational cost on multiplication (1 one) and exponentiation (3 ones);
cleanup bots that sweep loose blocks into matching warehouses;
Comprehension cap (default 10, upgradeable via Literature) gating manual
lifts on large numbers. Save schema v2. See `ROADMAP.md` §1 for
slice-by-slice notes.

**Next:** Phase 3 — number families (subtraction → negatives, division →
rationals, roots → irrationals, complex). Plus the cross-cutting
`break_eternity.js` integration once outputs cross `Number.MAX_SAFE_INTEGER`
through stacked geometric cultivation or exponentiation chains.

## Tech stack

- **Vite + TypeScript + Svelte 5** for the build / UI shell
- **PixiJS 8** for the canvas (river, blocks, equation cells)
- **break_eternity.js** installed; *not yet wired in* — used once numeric
  values exceed `Number.MAX_SAFE_INTEGER` (likely mid-Phase 2)
- Build: `npm run build`; type-check: `npm run check`; dev: `npm run dev`

## Architecture at a glance

```
src/
├── main.ts                    Svelte 5 mount() entry
├── App.svelte                 Root: canvas + ScoreHeader + Literature + Marginalia
├── app.css                    Pencil-notebook palette as CSS variables
├── lib/
│   ├── world.ts               Pure data model — PlacedBlock, PlacedCell, PlacedPipe
│   │                          registries; reactive Svelte stores (totalScore,
│   │                          zeroCount, countByValue, achievements, unlocks,
│   │                          purchaseCounts, comprehension, dirtyTick);
│   │                          snapshot/reset/restore mutators for persistence
│   ├── cell-types.ts          CellType union, CELL_SHAPES (multi-port outputs),
│   │                          operate() → { emits, marginalia? }, cultivationEmit(),
│   │                          computationalCost()
│   ├── literature.ts          Shop catalog (cell / theorem / comprehension / pipe
│   │                          kinds) + purchase() + multi-item cost + currentCost
│   │                          geometric scaling + canAfford
│   ├── marginalia.ts          Narrator-note store + showMarginalia (key-dedup);
│   │                          snapshot/restoreSeenMarginalia for persistence
│   ├── persistence.ts         Versioned SaveData (v4) — blocks, cells (with
│   │                          warehouse/cultivation/bot state), pipes (with
│   │                          cooldownRemaining), achievements, unlocks,
│   │                          purchaseCounts, seenMarginalia, camera,
│   │                          comprehension. Debounced autosave +
│   │                          beforeunload. Structural typeguard on load.
│   │                          v1→v4 migration chain
│   ├── camera.ts              Pan (mid-mouse / right-mouse drag) + zoom (wheel to
│   │                          cursor). screenToCanvas helper drives every
│   │                          hit-test in the interaction layer
│   ├── pipe.ts                Pipe simulation tick (peek/pull source, dest accepts,
│   │                          transit). Stall timer + setJammed visualisation.
│   │                          findPipeAt / deletePipe for shift-click removal.
│   │                          Equation-cell retry pass for cost-blocked cells.
│   │                          fireCellViaPipe is the canonical fire path
│   ├── cultivation.ts         Per-tick cultivation cell emission; captureSeed()
│   ├── bots.ts                Cleanup bot tick — closest-block to closest-matching-
│   │                          warehouse with pulse line
│   ├── cursors.ts             Pencil-style SVG cursor URLs
│   ├── interaction.ts         Drag controller (singleton): drag, cell placement,
│   │                          pipe placement (two-click), warehouse output click,
│   │                          shift-click pipe delete, rehydrate* methods for
│   │                          save restoration
│   └── pixi/
│       ├── setup.ts           Bootstraps the scene + camera + load/autosave +
│       │                      app.ticker(cultivation, pipes, equation retry, bots)
│       ├── paper.ts           Cream + faint blue squared grid
│       ├── pencil.ts          pencilStroke / pencilStrokeDouble (wobbly graphite)
│       ├── typography.ts      PENCIL_FONT_FAMILY, GRAPHITE, pencilTextStyle —
│       │                      shared text constants for the pencil aesthetic
│       ├── block.ts           drawBlock + updateStackBadge + applyComprehensionStyle
│       ├── river.ts           500-zero parallax flow, interactive
│       ├── successor-cell.ts  Unary { } visual
│       ├── binary-cell.ts     Shared visual for +, ×, ^ cells
│       ├── unary-cell.ts      Shared visual for Decrement / Factor cells
│       ├── warehouse-cell.ts  Warehouse visual + updateWarehouseBadge
│       ├── cultivation-cell.ts Cultivation cell visual + updateCultivationBadge
│       ├── cleanup-bot.ts     Bot visual + sweep pulse helper
│       └── pipe-visual.ts     Magnitude-weighted pencil pipe + transit pulse +
│                              setJammed dashed-red state + destroy hook
└── ui/
    ├── ScoreHeader.svelte     Σ counter (top-right)
    ├── Literature.svelte      Slide-in shop sidebar
    └── Marginalia.svelte      Left-margin narrator notes
```

## Key conventions

- **Simulation / rendering separation.** `world.ts` is pure TypeScript with
  no rendering dependency. The renderer reads world state and subscribes to
  changes via `onBlockChange`.
- **Automation tick.** Every frame, `setup.ts` calls four tick functions
  in order: `tickCultivation` (cells emit on their cadence), `tickPipes`
  (one transfer per pipe per cooldown), `tickEquationCells` (cost-blocked
  cells retry), `tickBots` (sweep loose blocks). Adding a new automation
  type means adding a new tick function — same pattern.
- **Coordinate spaces.** Pointer events deliver screen coordinates (canvas-
  relative). Every hit test against the world must convert via
  `screenToCanvas` from `camera.ts` first. Ghosts during drag live in
  `canvasLayer` so they scale with zoom automatically.
- **Reactive UI via Svelte stores.** UI components import stores from
  `world.ts` (e.g. `$totalScore`, `$countByValue`). The render layer
  subscribes through `onBlockChange`.
- **Drag controller singleton.** `getController()` returns the active
  controller — used by Svelte components (e.g. Literature) to start cell
  placement.
- **Pencil aesthetic is non-negotiable.** Every new visual element should
  look penciled and slightly imperfect. Use `pencilStroke` /
  `pencilStrokeDouble`. For text, pull from `pixi/typography.ts`
  (`PENCIL_FONT_FAMILY`, `GRAPHITE`, `pencilTextStyle`) — never hardcode
  the font stack. Avoid pixel-perfect rectangles.
- **Color is sparing.** The default is graphite-on-cream. Color enters
  only for *meaning*: `JAM_TINT` (dashed red) for stalled pipes,
  forthcoming `--accent-red` for primes / `--accent-blue` for negatives
  (declared in `app.css`, awaiting Phase 3). Don't introduce a new color
  without a design pillar to back it.
- **Merge radii**: `MERGE_DROP_RADIUS` (60) for manual drops,
  `MERGE_EMIT_RADIUS` (32) for automated emits. Both exported from
  `world.ts`. Don't introduce new local constants.
- **Narrator tone: dry academic.** Marginalia messages should sound like a
  math TA observing student work. Short, occasionally amused, never
  theatrical. No story.
- **Slice discipline.** Each slice ends in a buildable state and a feature
  the user can play-test. Run `npm run build` and `npm run check` before
  declaring done.

## Adding a new equation cell (recipe)

1. Add the type to `CellType` in `cell-types.ts`.
2. Add a `CELL_SHAPES` entry (port positions, output offset).
3. Add an `operate()` case.
4. Add a `draw<X>Cell` in `binary-cell.ts` (binary) or a new file (unary).
5. Add `drawCellByType` and `placementMarginalia` cases in
   `interaction.ts`.
6. Add a Literature entry in `literature.ts`.
7. If it has computational cost, add a `computationalCost()` case.
8. If it needs persistent state (warehouse-style), add fields to
   `PlacedCell`, snapshot in `snapshotCells`, restore in `rehydrateCell`.

The TypeScript exhaustive-switch will tell you what's left to wire.

## Build verification before committing a slice

```bash
npm run build   # must succeed
npm run check   # must report 0 errors 0 warnings
```

The dev server is `npm run dev` (auto-opens on port 5173).

## Things to remember when picking up

- The user prefers small slices and validates by playing after each.
- Visual iterations sometimes require a fundamental rethink, not just
  parameter tweaks. If the user says "this doesn't look right," consider
  whether the underlying approach is wrong before tuning numbers.
- Don't drift from the design pillars in `DESIGN.md` §2 — they were
  established through extensive brainstorming.
