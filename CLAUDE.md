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

**Phases 1–4 complete, plus the operator + rendering legs of Phase 5
(Slices 6.1a/b/c and 6.2a/b/c).** Phase 1: manual construction of any
natural number via Successor / Addition / Multiplication /
Exponentiation plus decomposition (Decrement, Factor); Theorem
milestones; repeatable Literature with scaling costs; localStorage
autosave. Phase 2: the factory — pan/zoom canvas, typed warehouses,
magnitude-rated pipes, three cultivation cells, computational cost,
cleanup bots, Comprehension cap. Phase 3: number families — negatives,
rationals (`{num, den}`), irrationals (`{symbol, approx}`), complex
(`{re, im}`); the `Value` discriminated union backed by
`break_eternity.js` `Decimal`; family colour polish. Phase 3.5: the
fuel economy — magnitude-scaled cost (`tier · max(1, ⌈log₁₀(max)⌉)`),
warehouse contents fold into Total Score AND the Literature
affordability pool, fuel paid as one block ≥ cost (over-payment wasted,
under-payment rejected), generalized warehouses with predicates (`<10`,
`<100`, `<1000`, `prime`, `composite`), tier-1 operators (×, ÷, ^)
gain an optional fuel input port with global fallback when unwired, and
cultivation cells pay per emission so geometric chains self-throttle.
Phase 4: discovery & engineering — Number Gallery (Integers grid /
Primes / Perfects / Famous tabs, driven by the `discoveredValues`
store); predicate-based Filter cells (one input, two outputs, sharing
the predicate catalog with `warehouse-rule`); predicate-cost Literature
entries (e.g. "10 primes", "5 primes ≥ 100"); and Blueprints v1 —
named layouts that capture a subgraph by rectangle-drag and stamp
copies wholesale (no packed-cell semantics yet; copies appear as raw
cells, persisted to their own `numbers-go-big.blueprints` localStorage
key so they survive `clearStorage()`). Plus the Phase 4 UX polish pass:
cells are draggable (click on the body to move, pipes follow); all
output spawn sites share a `spawn.ts` `planSpawnAtPort` helper that
back-pressures cells when their fan is full (12 unique slots of 40 px
each); pipes render as orientation-aware cubic bezier curves with
arc-length-driven label/pulse/hit-test; pan/zoom polished (5% wheel
step, grab cursor while panning). And Phase 5's first wave: the
operator hierarchy now reaches Tetration (`↑↑`, tier 4), Pentation
(`↑↑↑`, tier 8), and a variadic Knuth-arrow cell (`↑ⁿ`, tier `2^n`),
each with a REQUIRED fuel port (no global-pool fallback at tier 2+).
`computationalCost` / `spendFuel` / `consumeFuelOrFail` are
`Decimal`-valued end-to-end so chained-tetration outputs don't overflow
`Number.MAX_SAFE_INTEGER`. Every block's label routes through the
magnitude-ladder renderer in `pixi/value-label.ts`: digits / commas /
sci (Unicode superscript exponent) / power tower (stacked `10`s with
`↕N` height badge for truncation) / arrow notation (`10↑↑N` for
unrenderable towers). And Phase 5.6's pacing overhaul (Slices 6.6 +
6.7): the eight-tier Comprehension ladder, rebalanced
operator/pipe/comprehension costs validated against the standalone
simulator (`sim/`), new `pipe_1k`, save schema v12 with auto-migration
of pre-overhaul comprehension levels. Plus the leveling system v1:
per-cell-type and per-pipe-magnitude levels (max 5, doubling
throughput per level) stored in `world.ts` via reactive
`cellLevels` / `pipeLevels` stores; cell output count scaled by level
in both fire paths; pipe cooldown scaled in `tickPipes`; Successor
lvl 3 river-tap implemented as a new `tickRiverTapSuccessors` driver;
Mult/Exp lvl 3 fuel −1 and lvl 5 fuel halved in `cost.ts`; 28 level
upgrade Literature entries that surface only when their immediate
target tier is next; Roman-numeral badge at the top-right of every
leveled cell; save schema v13. See `ROADMAP.md` §1 for slice-by-slice
notes.

**Pacing target:** ~5h optimal-play speedrun / ~10h casual to
Tetration. Per the sim, the leveling system makes the climb from
Pipe ≤100 onward actually reachable; without it the player would
stall on hundreds-production. Slices 6.8 (deferred level qualities),
6.9 (warehouse leveling), 6.10 (Literature tabs) are still pending —
the game is end-to-end playable without them.

**Next:** Slice 6.8 (deferred level qualities) → 6.9 (Warehouse
leveling) → 6.10 (Literature tabs UI). Then Phase 5's remaining
slices: Prestige (6.3), ordinals + surreals (6.4), named giants (6.5).

## Pacing simulator

The `sim/` directory holds a standalone Node CLI that walks an
optimal-play agent through the Literature roadmap and reports
time-to-each-unlock. **It is the source of truth for pacing numbers.**

- Run with `node sim/run.ts` (Node 22.6+ has native TS; nothing to install)
- `sim/catalog.ts` mirrors `src/lib/literature.ts` and `src/lib/cost.ts`
- Models leveling (incl. river-tap on Successor lvl 3, fuel-discount
  on Mult/Exp lvl 3 and 5)
- Flags: `--verbose`, `--csv pacing.csv`, `--to <entry>`, `--max-ticks <n>`
- See `sim/README.md` for usage notes and current model limitations

**When changing Literature costs, edit `sim/catalog.ts` FIRST**, run the
sim to confirm the curve still hits the pacing target (~5h speedrun /
~10h casual to Tetration), THEN port the locked numbers to
`src/lib/literature.ts`. The other direction is how we got into
pacing trouble before.

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
│   │                          purchaseCounts, comprehension, dirtyTick).
│   │                          spendValue / spendFuel scan loose + warehouses +
│   │                          warehouse-rule items (Slice 3.5.3/7); recompute
│   │                          folds warehouse contents into both Total Score and
│   │                          countByValue. Fuel helpers (operandPending,
│   │                          operandsFilled, fuelPortIndex, hasFuelPipeAttached,
│   │                          consumeFuelOrFail) used by the two fire paths.
│   │                          Snapshot/reset/restore mutators for persistence
│   ├── cell-types.ts          CellType union, CELL_SHAPES (multi-port outputs,
│   │                          with `kind: 'operand'|'fuel'` on inputs since 3.5.5),
│   │                          operate() → { emits, marginalia? }. Cost &
│   │                          cultivation math re-exported from `./cost`.
│   ├── cost.ts                Pure math: magnitude-scaled computationalCost
│   │                          (returns Decimal; variadic-arrow's `2^n` tier is
│   │                          a special case), cultivationEmit,
│   │                          cultivationEmissionCost (also Decimal),
│   │                          costTier (exported so consumeFuelOrFail can
│   │                          gate tier-2+ cells out of the global fuel pool).
│   │                          Lives outside cell-types so renderers (binary-cell,
│   │                          cultivation-cell) can import the formulas without
│   │                          threading a runtime cycle back through cell-types.
│   ├── warehouse-rules.ts     WAREHOUSE_RULES catalog (`lt10`, `lt100`, `lt1000`,
│   │                          `prime`, `composite`) + getWarehouseRule. Same
│   │                          predicate vocabulary Filters and predicate-cost
│   │                          Literature entries use.
│   ├── classify.ts            Gallery-side classifiers — isPrime, isPerfect,
│   │                          FAMOUS_NUMBERS catalog, integerFromKey.
│   ├── filter.ts              routeViaFilter — Filter cells' route path,
│   │                          mirroring the warehouse polymorphism pattern.
│   ├── blueprints.ts          Blueprint data model + reactive store. Captures
│   │                          a subgraph (cells + interior pipes) into a
│   │                          BlueprintDef. Persists in its own localStorage
│   │                          key (`numbers-go-big.blueprints`).
│   ├── spawn.ts               Shared output-spawn helpers. `planSpawnAtPort`
│   │                          decides where an emission lands (merge / new
│   │                          / 'clogged'); `commitSpawn` materialises it.
│   │                          Every fire path uses these — cultivation,
│   │                          operators, filters — so back-pressure is
│   │                          uniform across the canvas.
│   ├── literature.ts          Shop catalog (cell / theorem / comprehension / pipe
│   │                          kinds) + purchase() + multi-item cost + currentCost
│   │                          geometric scaling + canAfford
│   ├── marginalia.ts          Narrator-note store + showMarginalia (key-dedup);
│   │                          snapshot/restoreSeenMarginalia for persistence
│   ├── persistence.ts         Versioned SaveData (v10) — blocks, cells (with
│   │                          warehouse/rule-warehouse/cultivation/bot state),
│   │                          pipes (with cooldownRemaining), achievements,
│   │                          unlocks, purchaseCounts, seenMarginalia, camera,
│   │                          comprehension, discoveries. Debounced autosave +
│   │                          beforeunload. Structural typeguard on load.
│   │                          v1→v10 migration chain
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
│       ├── binary-cell.ts     Shared visual for +, −, ×, ÷, ^, ↑↑, ↑↑↑ cells.
│       │                      Mul/div/exp/tetration/pentation get a fuel-port
│       │                      socket below; cost-preview badge `fuel ≥ N`
│       │                      updates on every pending change (works for any
│       │                      cell that installs `container.__costBadge`).
│       ├── variadic-arrow-cell.ts  ↑ⁿ cell — three operand inputs (base, arrows,
│       │                      height) on the left of a taller frame, plus fuel
│       │                      port below. Italic `a`/`n`/`b` port labels.
│       ├── value-label.ts     Magnitude-ladder renderer (Slice 6.2a/b/c).
│       │                      `valueLabelTier(v)` → digits / commas / sci /
│       │                      tower / arrow based on Decimal.layer + magnitude.
│       │                      `drawValueLabel` returns the right Container per
│       │                      tier; block.ts:drawNumeralInto routes real Values
│       │                      through it.
│       ├── unary-cell.ts      Shared visual for Decrement / Factor cells
│       ├── warehouse-cell.ts  Warehouse visual (typed + rule-based) +
│       │                      updateWarehouseBadge. Rule label baked into the
│       │                      centre glyph at construction.
│       ├── cultivation-cell.ts Cultivation cell visual + updateCultivationBadge.
│       │                      Badge shows `seed: V` and `next ≥ N` (next-emission
│       │                      cost, Slice 3.5.6).
│       ├── cleanup-bot.ts     Bot visual + sweep pulse helper
│       └── pipe-visual.ts     Magnitude-weighted pencil pipe + transit pulse +
│                              setJammed dashed-red state + destroy hook
└── ui/
    ├── ScoreHeader.svelte     Σ counter (top-right)
    ├── Literature.svelte      Slide-in shop sidebar (right)
    ├── Gallery.svelte         Phase 4 Pokédex panel (top-left toggle)
    ├── Blueprints.svelte      Blueprint library panel (top-left, next to Gallery)
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
2. Add a `CELL_SHAPES` entry (port positions, output offset). Mark fuel
   ports with `kind: 'fuel'`; operand ports leave it unset (the default).
3. Add an `operate()` case (operate sees ONLY operand values — fuel slots
   are filtered upstream via `operandPending`).
4. Add a `draw<X>Cell` in `binary-cell.ts` (binary) or a new file (unary).
5. Add `drawCellByType` and `placementMarginalia` cases in
   `interaction.ts`.
6. Add a Literature entry in `literature.ts`.
7. If it has computational cost, extend `costTier` in `cost.ts`. The
   formula `tier · max(1, ⌈log₁₀(max(|a|, |b|))⌉)` runs automatically
   and returns a `Decimal`; the fire path consumes the cost via
   `consumeFuelOrFail`. **Tier ≥ 2 makes the fuel port REQUIRED** — no
   global-pool fallback when the slot is empty and no pipe is wired.
   For cost formulas that depend on runtime input (variadic-arrow),
   special-case inside `computationalCost` itself instead of through
   `costTier`.
8. If it needs persistent state (warehouse-style), add fields to
   `PlacedCell`, snapshot in `snapshotCells`, restore in `rehydrateCell`.

The TypeScript exhaustive-switch will tell you what's left to wire.

**Avoiding cell-types ↔ pixi/* runtime cycles.** `cell-types.ts` uses
`*_CELL_WIDTH` constants from each `pixi/*-cell.ts` at module init. Any
runtime import from a `pixi/*-cell.ts` back to `world.ts` (which itself
imports from `cell-types.ts`) will TDZ-crash on `BINARY_CELL_WIDTH` /
`WAREHOUSE_CELL_WIDTH` / `CULTIVATION_CELL_WIDTH`. The rules:

- Pixi cell files may import from `cost.ts` (pure math, type-only
  `CellType`) freely.
- Pixi cell files must import `PlacedCell` from `world.ts` as
  `import type`, never as a runtime value.
- If you need a `world.ts` helper inside a pixi/cell file, inline it
  there — see how `binary-cell.ts` filters operands and
  `warehouse-cell.ts` totals rule items.

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
