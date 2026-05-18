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

**Phases 1–4 complete, plus Phase 5's operator + rendering legs
(6.1a/b/c, 6.2a/b/c), the pacing overhaul + leveling system (6.6 +
6.7), and the Iteration Wave (6.11–6.18).** Phase 1: manual construction of any
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
leveled cell; save schema v13. **Phase 5 Iteration Wave (6.11–6.18,
shipped 2026-05-16):** Translation Operators replace cleanup-bot
teleport with animated walking workers carrying blocks across the
canvas (`pixi/cleanup-bot.ts` + new state machine in `bots.ts`; save
schema v14 with optional T-bot phase fields); pipe endpoints draggable
to re-route in place (`findPipeEndpointAt` + `previewPipeEndpoint` +
`setPipeEndpoint` in `pipe.ts`, `'rerouting-pipe'` mode in
`interaction.ts`); pipes use port-aware bezier tangents so the curve
exits each cell along its port's outward axis (`pipeEndpointDirection`
in `pipe.ts`); the **Inversion family** ships — `negation` (n ↦ −n,
tier 0 free), `inversion` (n ↦ 1/n, tier 2 with required fuel port),
`wh: negative` rule warehouse — built on a **signed-fuel** mechanic
where `consumeFuelOrFail` and `spendFuel` match block sign against
cost sign before checking magnitude (`valueRecip` in `value.ts`,
signed cost formula in `cost.ts`); polish trio adds per-cell-type
level-badge offsets (`cellLevelBadgeOffset` in `level-badge.ts`),
shared `drawDashedRect` in `pencil.ts`, micro-animations
(`pixi/micro-anim.ts` with `spawnEmitScribble` + `fadeAndDestroy`),
and a typography hierarchy in `typography.ts` (`BADGE` / `HINT` /
`ARROW` / `COUNTER` constants + `pencilText` factory baking in
`PENCIL_TEXT_RESOLUTION = 2` for crispness at max zoom). See
`ROADMAP.md` §1 for slice-by-slice notes.

**Pacing target (α.5c lock):** **~5h speedrun to Tetration / ~12h to
Pentation.** The Pentation target grew from ~7h because every comp
tier now carries an engineering puzzle — more decision-relevant
moments at the cost of grind length. See `sim/PACING_LOCKED.md` for
the locked unlock table.

**Phase 6 — SHIPPED end-to-end.** All 14 code slices (β.1–ε.2) are
live. Save schema is **v17**.

**α.5 Ladder Rule — SHIPPED (this session).** The fuel economy has
been replaced wholesale by a **per-firing ladder** of small numbers:

  * Each cell at hierarchy position L consumes `2^(L-k) × ⌈log₁₀(max input)⌉`
    blocks of value k, for k=0..L. So successor draws 1 zero,
    addition 2z + 1o, multiplication 4z + 2o + 1t, exponentiation
    8z + 4o + 2t + 1×3, tetration 16z + 8o + 4t + 2×3 + 1×4,
    pentation 32z + 16o + 8t + 4×3 + 2×4 + 1×5.
  * **Fuel ports dropped** from tier-1+ binary cells (mult, div,
    exp, tet, pent, variadic-arrow). The ladder pulls from loose
    pool + warehouses automatically — no wiring required. Inversion
    keeps its fuel port for the signed-fuel single-block contract.
  * **Unlock-cost ladders** — every operator unlock follows the
    same ladder pattern. Multiplication = `400z + 200o + 100t + 20 negatives + 1 × 10`.
    Tetration = `15.2k z + 7.6k o + 3.8k t + 1.9k × 3 + 950 × 4 + 10 irrationals + 1 × 1024`.
  * **Comp milestone puzzles** — every comp_N tier demands
    `1 × 2^(N-1)` (the previous tier's ceiling) as an engineering
    proof. Forces a "construct this number" moment at every step.
  * **Operator construction puzzles** — multiplication demands a
    1 × 10, exp/div/inv/sqrt demand 1 × 100, tetration demands
    1 × 1024, pentation demands 1 × 1,000,000.
  * **River-tap removed.** Successor lvl 3 is now a pure 4×
    throughput bump. Zeros always flow via pipe ≤1.
  * **Zero warehouses** are now meaningful — the agent buys them as
    the pool stockpile grows. (Required because the ladder pulls
    zeros at every firing.)

Build is clean, type-check 0/0, save schema **v17** with full
migration chain from v11.

**`sim/analyze.ts` — the new metric tool.** Beyond the basic
unlock-pacing table that `sim/run.ts` prints, `analyze.ts` reports
per-value consumption-vs-production flow, bottleneck distribution
over the run, focus-time distribution, and pool snapshots at every
unlock event. Use it to see *where* zeros are binding (the answer
is: 82% of ticks in the α.5c curve).

**Cultivation cells rework shipped.** Streaming cultivators are now
input-driven transformer cells (`cultivationStep` per cell; output =
`f(input, step)`; fire path goes through the standard `fireCell` and
`fireCellViaPipe`). `tickCultivation` retired; `captureSeed` removed.
Three previously-deferred series landed: harmonic, polynomial,
factorial. See DESIGN.md §6 *Cultivation Cells*. **Per-firing fuel
cost** wired in α.4b.2 — cultivators now consume
`cultivationEmissionCost(emission)` per firing.

## Pacing simulator

The `sim/` directory holds a standalone Node CLI that walks an
optimal-play agent through the Literature roadmap and reports
time-to-each-unlock. **It is the source of truth for pacing numbers.**

- Run with `node sim/run.ts` (Node 22.6+ has native TS; nothing to install)
- α.5c: models the **full ladder rule** (per-firing + unlock), comp
  milestone puzzles, multi-currency comp tiers, predicate stocks
  (prime/negative/irrational), and warehouse capacity scaling.
- Flags: `--verbose`, `--csv pacing.csv`, `--to <entry>`, `--max-ticks <n>`,
  `--strategy <name>`, `--config <path>`, `--scale key=value` (repeatable).
- **`sim/analyze.ts`** — richer report: consumption-vs-production
  per value, bottleneck distribution, pool snapshots at each unlock.
  Run with `node sim/analyze.ts`. Use this when investigating
  "where is the agent really spending time."
- **`sim/compare.ts`** — runs every strategy (or `--strategies a,b,c`)
  side-by-side against the same roadmap + config and prints a unified
  pacing table. Use to surface where strategies actually diverge —
  i.e. where the design has real choices to make.
- **`sim/diff.ts`** — runs two SimConfig JSONs back-to-back and prints
  the pacing delta per unlock. The fastest way to answer "what if I
  cut tetration's M from 950 to 600?":
  `node sim/diff.ts sim/configs/baseline.json variant.json`.
- See `sim/README.md` for the full strategy + config reference and
  `sim/PACING_LOCKED.md` for the locked α.5c baseline.

**The playtester (Phase A.6).** The agent's policy is pluggable. Each
strategy in `sim/strategies/` registers a factory via
`registerStrategy()` (see `sim/strategy.ts`); registration happens
on import, so `run.ts` / `compare.ts` / `diff.ts` each import every
strategy file at the top. Built-in strategies:

- `speedrun-greedy` — the original baked-in agent. Reproduces
  `sim/pacing-locked.csv` byte-for-byte under the default config —
  this is the **regression baseline**. Always tune from here.
- `comp-rush` — diverts grinding-time toward the next comp upgrade
  whenever its cost is reachable.
- `warehouse-hoarder` — buys typed warehouses preemptively at 40%
  pool fill.
- `cell-spammer` — redirects level-up purchases to fresh clones.
- `beam-search` — picks each next milestone by rolling out every
  candidate in a cloned world and taking the fastest. Surfaces
  "weird and fast" orderings the hand-curated roadmap doesn't try.
  Rollouts have a 2000-tick stall guard; ~100ms per pick.

To add a new strategy: drop a file in `sim/strategies/`, call
`registerStrategy('my-name', factory)` at module load, and add the
import to `run.ts`, `compare.ts`, and `diff.ts`.

**SimConfig (sim/config.ts).** Toggle mechanics (`cellLeveling`,
`ladderFuel`, `warehouses`, `comprehensionGate`) and scale costs
(`operatorM.<id>`, `compTier`, `pipe`, `warehouse`, `level`)
without editing catalog data. Configs live as JSON in `sim/configs/`
(baseline, flat-fuel, no-leveling, no-warehouses, cheap-mult).
Active config is installed via `withConfig(cfg, () => simulate(...))`
which sets a module-level `currentConfig()` for the duration of one
run. Sim helpers (`cellThroughput`, `ladderForCell`, `poolCap`,
`currentCost`, `purchaseLevel`, `canPurchase`, `steadyStateRate`,
`bottleneckResource`) read `currentConfig()` to branch on toggles
and apply scales.

**Cost formulas are unified (Phase A).** `ladderUnlockCost`,
`compUpgradeCost`, `pipeCost`, and the Literature entries data table
live in `core/catalog/` — imported by both the game (`src/lib/literature.ts`)
and the sim (`sim/catalog.ts`) so edits flow into both automatically.
Sim's same-named functions are thin number-shape adapters around
core's Value-shape versions. **When changing a ladder formula, edit
`core/catalog/costs.ts`** and the change reaches game + sim together.
The per-entry M values (e.g. `multiplication`'s M=100) for sim's
operator roadmap are still hand-curated in `sim/catalog.ts` —
that's intentional drift surface for sim tuning. After any change,
verify pacing identity with:

```bash
node sim/run.ts --csv /tmp/after.csv && diff /tmp/after.csv sim/pacing-locked.csv
```

## Tech stack

- **Vite + TypeScript + Svelte 5** for the build / UI shell
- **PixiJS 8** for the canvas (river, blocks, equation cells)
- **break_eternity.js** installed; *not yet wired in* — used once numeric
  values exceed `Number.MAX_SAFE_INTEGER` (likely mid-Phase 2)
- Build: `npm run build`; type-check: `npm run check`; dev: `npm run dev`

## Architecture at a glance

The repo has **three top-level TypeScript trees** (Phase A, 2026-05-17):
`core/` (shared pure rules), `src/` (game runtime — Pixi + Svelte),
`sim/` (pacing CLI). Both `src/` and `sim/` import from `core/` for
the cost math + Literature catalog; neither imports from the other.
See [project_core_module memory](../../.claude/projects/.../memory/) for
the unification details and verification protocol.

```
core/                          Pure rules + catalog — shared by game + sim.
                               No Pixi, no Svelte, no world state.
├── value.ts                   `Value` discriminated union (real / rational /
│                              irrational / complex) backed by break_eternity
│                              Decimal. Pure math + snapshot/restore.
├── cell-geometry.ts           *_CELL_WIDTH / *_CELL_HEIGHT constants
│                              (extracted A.2 — broke the cell-types ↔ pixi
│                              width cycle).
├── cell-types.ts              CellType union, CELL_SHAPES (port positions +
│                              `kind: 'operand'|'fuel'`), operate() →
│                              { emits, marginalia? }.
├── cost.ts                    Per-firing fuel ladder: `fuelLadder` returns
│                              `Map<value, count>`. `ladderPosition`, `costTier`,
│                              `computationalCost` (Decimal sum for badges).
│                              `cultivationEmit` + `cultivationEmissionCost`.
├── warehouse-rules.ts         WAREHOUSE_RULES catalog (`lt10`, `lt100`, `lt1000`,
│                              `prime`, `composite`, `negative`) + getWarehouseRule.
│                              Same predicate vocabulary Filters and
│                              predicate-cost Literature entries use.
├── classify.ts                Gallery-side classifiers — isPrime, isPerfect,
│                              FAMOUS_NUMBERS catalog, integerFromKey.
└── catalog/
    ├── types.ts               LiteratureCost*, LiteratureKind, LiteratureEntry
    │                          types + isValueItem / isPredicateItem guards.
    ├── costs.ts               ladderUnlockCost, compUpgradeCost, pipeCost,
    │                          generateComprehensionLadder, generatePipeLadder.
    │                          **The single source of truth for cost formulas.**
    └── entries.ts             LITERATURE_ENTRIES — the full Shop data table +
                               isCellEntry type guard.

src/                           Game runtime — Pixi rendering, Svelte UI,
                               localStorage persistence, drag interaction.
├── main.ts                    Svelte 5 mount() entry.
├── App.svelte                 Root: canvas + ScoreHeader + Literature + Marginalia.
├── app.css                    Pencil-notebook palette as CSS variables.
├── lib/
│   ├── world/                 Pure data model (Phase B.1 split — types peeled out).
│   │   ├── index.ts           PlacedBlock / PlacedCell / PlacedPipe registries;
│   │   │                      reactive Svelte stores (totalScore, zeroCount,
│   │   │                      countByValue, achievements, unlocks, purchaseCounts,
│   │   │                      comprehension, cellLevels, dirtyTick).
│   │   │                      spendValue / spendFuel / consumeFuelLadder scan
│   │   │                      loose + warehouses + warehouse-rule items.
│   │   │                      consumeFuelOrFail for inversion's signed-fuel
│   │   │                      path. recompute folds warehouse contents into
│   │   │                      Total Score AND countByValue. Snapshot / restore /
│   │   │                      resetWorld mutators for persistence.
│   │   │                      setPendingDisplayDisposer (6.17) is the renderer
│   │   │                      hook for fading consumed pending-input ghosts —
│   │   │                      keeps world.ts pixi-free at the import level.
│   │   └── types.ts           PlacedBlock, PlacedCell, PlacedPipe, PipeEndpoint,
│   │                          BlockSnapshot, CellSnapshot, PipeSnapshot,
│   │                          FuelOutcome — all entity + persistence types.
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
│   ├── literature.ts          Game-runtime layer: purchase() + canAfford() +
│   │                          currentCost() + formatCost / formatCostItem +
│   │                          isLevelUpgradeAvailable / isComprehensionEntryAvailable /
│   │                          isCompRequirementMet. Catalog data + cost helpers
│   │                          re-exported from `core/catalog/` (Phase A.4 split).
│   ├── marginalia.ts          Narrator-note store + showMarginalia (key-dedup);
│   │                          snapshot/restoreSeenMarginalia for persistence.
│   ├── persistence.ts         Versioned SaveData (v17) — blocks, cells (with
│   │                          warehouse/rule-warehouse/cultivation/bot state),
│   │                          pipes (with cooldownRemaining), achievements,
│   │                          unlocks, purchaseCounts, cellLevels, seenMarginalia,
│   │                          camera, comprehension, discoveries. Debounced
│   │                          autosave + beforeunload. v1→v17 migration chain.
│   ├── camera.ts              Pan (mid-mouse / right-mouse drag) + zoom (wheel
│   │                          to cursor). screenToCanvas helper drives every
│   │                          hit-test in the interaction layer.
│   ├── pipe.ts                Pipe simulation tick (peek/pull source, dest accepts,
│   │                          transit). Stall timer + setJammed visualisation.
│   │                          findPipeAt / deletePipe for shift-click removal.
│   │                          findPipeEndpointAt + previewPipeEndpoint +
│   │                          setPipeEndpoint + refreshPipeVisual for the
│   │                          re-route flow. pipeEndpointDirection for
│   │                          port-aware bezier tangents.
│   │                          Equation-cell retry pass for cost-blocked cells.
│   │                          fireCellViaPipe is the canonical fire path.
│   ├── cultivation.ts         Per-tick cultivation cell emission (legacy entry
│   │                          point; cultivators are now input-driven via the
│   │                          standard fire path, Phase 6 ε.1).
│   ├── bots.ts                Translation Operator (T-bot) tick — four-phase
│   │                          state machine per bot: idle → approaching →
│   │                          returning → going-home. Claim system
│   │                          (botTargetBlockId) prevents two bots fighting over
│   │                          the same block. The walk is the throttle.
│   │                          Internal type name stays `cleanup-bot`;
│   │                          user-visible name is "Translation Operator".
│   ├── cursors.ts             Pencil-style SVG cursor URLs.
│   ├── family.ts              valueColor — picks the pencil tint per Value
│   │                          variant (real / negative / rational / irrational /
│   │                          complex).
│   ├── interaction/           Drag controller — split into mode files (Phase B.3).
│   │   ├── index.ts           DragController public interface + ControllerCtx +
│   │   │                      createDragController factory. The factory builds
│   │   │                      the ctx, installs the persistent output-click
│   │   │                      listener, wires the spawn/pipe/cultivation/filter
│   │   │                      block-interaction-attach hooks, and exposes the
│   │   │                      8 public methods that delegate to sibling modules.
│   │   ├── helpers.ts         Pure helpers — drawCellByType, makePendingDisplay,
│   │   │                      cellLabel, clickIsOnPort, installWarehouseRefresh,
│   │   │                      placementMarginalia, endpointsEqual,
│   │   │                      resolvePipeEndpoint, describeLadder, rectOf.
│   │   ├── attach.ts          The mutually-recursive drag/fire/attach cluster:
│   │   │                      beginDrag, attachBlockInteraction, beginCellMove,
│   │   │                      attachCellInteraction, tryFeedPort, fireCell.
│   │   ├── modes.ts           Entry-mode functions — beginCellPlacement,
│   │   │                      beginPipePlacement, beginBlueprintSelection,
│   │   │                      beginBlueprintPlacement, stampBlueprint,
│   │   │                      beginPipeReroute, installOutputClickListener
│   │   │                      (the persistent listener handling shift-click
│   │   │                      pipe delete + warehouse withdrawal + endpoint
│   │   │                      drag).
│   │   └── rehydration.ts     rehydrateBlock / rehydrateCell / rehydratePipe
│   │                          for save-load restoration.
│   └── pixi/
│       ├── setup.ts           Bootstraps the scene + camera + load/autosave +
│       │                      app.ticker(cultivation, pipes, equation retry, bots)
│       ├── paper.ts           Cream + faint blue squared grid
│       ├── pencil.ts          pencilStroke / pencilStrokeDouble (wobbly graphite).
│       │                      drawDashedRect (Slice 6.16) — shared dashed-rect
│       │                      helper used by every cell visual's drop-zone hint.
│       ├── typography.ts      PENCIL_FONT_FAMILY, GRAPHITE, pencilTextStyle.
│       │                      Slice 6.18: BADGE / HINT / ARROW / COUNTER
│       │                      typography-hierarchy constants + .style() factories;
│       │                      pencilText(text, style) bakes in PENCIL_TEXT_RESOLUTION
│       │                      = 2 so Text textures stay crisp at the camera's
│       │                      max 4× zoom. Apply to any Text that needs to
│       │                      survive camera scaling (canvasLayer children).
│       ├── micro-anim.ts      Slice 6.17. spawnEmitScribble(layer, x, y) — a
│       │                      4-stroke pencil flourish at block-materialisation
│       │                      points, ~260 ms life with sin(πt) alpha curve.
│       │                      Wired into spawn.commitSpawn for every emit.
│       │                      fadeAndDestroy(display, dur?) — ease-out
│       │                      replacement for instant removeChild + destroy;
│       │                      used in the three fire paths (interaction.ts,
│       │                      pipe.ts, world.ts via setPendingDisplayDisposer).
│       ├── level-badge.ts     applyLevelBadge installs/updates the Roman-numeral
│       │                      badge on a leveled cell's container.
│       │                      cellLevelBadgeOffset(type) (Slice 6.16) returns
│       │                      per-cell-type offsets so the badge lands ~24 px
│       │                      from the right edge regardless of cell shape.
│       ├── block.ts           drawBlock + updateStackBadge + applyComprehensionStyle.
│       │                      Slice 6.18: numerals and stack badges use
│       │                      pencilText for crispness at max zoom.
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
│       ├── unary-cell.ts      Shared visual for Decrement / Factor / Square
│       │                      Root / Negation / Inversion cells. hasFuelPort
│       │                      option (6.15) adds the fuel socket + cost-preview
│       │                      badge for Inversion (the only unary tier-2 cell).
│       ├── warehouse-cell.ts  Warehouse visual (typed + rule-based) +
│       │                      updateWarehouseBadge. Rule label baked into the
│       │                      centre glyph at construction.
│       ├── cultivation-cell.ts Cultivation cell visual + updateCultivationBadge.
│       │                      Badge shows `seed: V` and `next ≥ N` (next-emission
│       │                      cost, Slice 3.5.6).
│       ├── cleanup-bot.ts     Translation Operator (T-bot) visual (Slice 6.11).
│       │                      Stationary station + dashed search-radius halo at
│       │                      the placed position; separate worker container
│       │                      with `T` glyph whose local position is driven by
│       │                      bots.ts each tick. Carried block is parented on
│       │                      the worker as a child while returning, cleared
│       │                      on dropoff. getBotHandles(container) returns the
│       │                      setWorkerLocal + setCarried API for the sim layer.
│       └── pipe-visual.ts     Magnitude-weighted pencil pipe + transit pulse +
│                              setJammed dashed-red state + destroy hook. Slice
│                              6.13: port-aware bezier tangents via optional
│                              srcDir/dstDir args on drawPipe / redraw; control-
│                              point distance clamped to [24, len/2] so short
│                              pipes don't loop; flatter pulse alpha curve.
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

1. Add the type to `CellType` in **`core/cell-types.ts`**.
2. Add a `CELL_SHAPES` entry (operand port positions, output offset).
   α.5c: tier-1+ binary cells DO NOT have fuel ports — the ladder
   pulls from pool. Only inversion still uses a `kind: 'fuel'`
   port (for the signed-fuel single-block contract).
3. Add an `operate()` case (operate sees ONLY operand values).
4. Add a `draw<X>Cell` in `src/lib/pixi/binary-cell.ts` (binary) or a new
   file (unary). Pass `hasFuelPort: false` (only inversion/legacy
   passes true). If your visual needs a fixed canvas footprint, add
   the width/height to `core/cell-geometry.ts` and re-export from your
   pixi file.
5. Add `drawCellByType` and `placementMarginalia` cases in
   **`src/lib/interaction/helpers.ts`**, and `cellLabel` if it should
   appear in narrator messages.
6. Add a Literature entry in **`core/catalog/entries.ts`**. Use
   `ladderUnlockCost(L, M)` for the cost — the operator's hierarchy
   position L and per-entry multiplier M, plus any predicate side
   demands (negatives / primes / irrationals) and construction puzzles
   (`{ value: V, count: 1 }`). For the game-side purchase wiring (level
   upgrades, comp requirement checks), edit `src/lib/literature.ts`.
   For sim's roadmap, also add to `sim/catalog.ts:OPERATOR_AND_CELL_ENTRIES`.
7. If it has per-firing fuel cost, extend `ladderPosition` in
   **`core/cost.ts`** to return the new cell's L. The ladder runs
   automatically; the fire path calls `consumeFuelLadder(ladder)` to
   consume the per-firing pyramid of small numbers. For cost formulas
   that depend on runtime input (variadic-arrow), special-case inside
   `fuelLadder` itself.
8. If it needs persistent state (warehouse-style), add fields to
   `PlacedCell` in **`src/lib/world/types.ts`**, snapshot in
   `world/index.ts:snapshotCells`, restore in
   **`src/lib/interaction/rehydration.ts:rehydrateCell`**.

The TypeScript exhaustive-switch will tell you what's left to wire.

**Cell-types ↔ pixi cycle is now broken (Phase A.2).** Cell width
constants live in `core/cell-geometry.ts`. `core/cell-types.ts` imports
widths from there; each `pixi/*-cell.ts` imports + re-exports its width
constant from `core/cell-geometry.ts` so external callers that reach
for e.g. `BINARY_CELL_WIDTH` via the pixi file keep working. The old
TDZ trap (cell-types imports pixi imports cell-types) is gone — but
the discipline still applies:

- Pixi cell files may import from `core/cost.ts`, `core/value.ts`,
  `core/cell-geometry.ts` freely (all pure).
- Pixi cell files must import `PlacedCell` from `src/lib/world` as
  `import type`, never as a runtime value.
- If you need a `world.ts` helper inside a pixi/cell file, inline it
  there.

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
- **`core/` is shared between game and sim** (Phase A, 2026-05-17).
  Cost formulas live in `core/catalog/costs.ts`; the Literature entries
  data table is `core/catalog/entries.ts`. Editing core/ flows to both
  sides. The verification protocol after any core/ edit is
  `npm run check` → `npm run build` → `node sim/run.ts --csv after.csv` +
  diff against `sim/pacing-locked.csv`.
- **Interaction layer uses a `ControllerCtx` pattern** (Phase B.3).
  Every mode function takes `ctx: ControllerCtx` as its first arg
  (`{ app, canvasLayer, state: { mode } }`). No closure captures, no
  classes. To add a new interaction mode: write a `beginX(ctx, ...)`
  function in `src/lib/interaction/modes.ts`, wire it into
  `DragController` in `interaction/index.ts`. To call into existing
  modes from a new helper, import from `attach.ts` (drag/fire/attach)
  or `modes.ts` (entry-mode functions). The dependency graph is
  acyclic: `helpers → attach → modes`, `attach → rehydration`.
- **Imports from `core/` use depth-aware relative paths.** From
  `src/lib/*.ts` use `'../../core/X'`. From `src/lib/pixi/*.ts`,
  `src/lib/world/*.ts`, or `src/lib/interaction/*.ts` use
  `'../../../core/X'`. `core/*` files import each other with explicit
  `.ts` extensions (required for Node native TS in sim/).
- **Cultivators are input-driven transformer cells** (Phase 6 ε.1).
  Each firing consumes one operand; output = `f(input, step)` per
  `cost.ts:cultivationEmit`; step persists per cell. No seed concept,
  no auto-firing — they flow through `fireCell` / `fireCellViaPipe`
  like any operator. Per-step fuel cost is a future sim-tuning
  iteration; the universal comp-jam is the throttle today.
- **Comprehension is the spine.** Phase 6 (DESIGN.md §9) makes the
  comp ceiling govern lift, pipe, T-bot, and warehouse — not just
  manual handling. Any new cell or infrastructure touching block
  transport must check `valueComprehensible(v, comp)` once that
  helper lands. Decomposer bots are the one exception.
- **Inversion (`1/x`) introduces "negative fuel"** — signed costs paid
  by negative blocks. When working on it, see DESIGN.md §6 *Inversion
  and the Negative-Fuel Pivot* and ROADMAP.md slice 6.15. The mechanic
  must be sim-validated (slice 6.14) before any game code lands.
- **The user's best new mechanics integrate, they don't isolate.** When
  he pitches something new, look first for which existing under-used
  systems it makes essential — not just what content it adds. Inversion
  is the canonical example: its real point is giving Subtraction and
  Division new economic purpose, not the rationals it produces.
