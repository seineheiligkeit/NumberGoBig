# Numbers Go Big! — Status & Roadmap

A working document for "where we are" and "where we're going." The creative
north star is `DESIGN.md`. This file is the execution plan.

---

## 1. Where we are

**Phases 1, 2, 3, 3.5, 4, and the Phase 4 UX polish pass are complete.** The factory runs without
constant clicking: the canvas pans and zooms; warehouses store typed
stacks at capacity; magnitude-rated pipes carry blocks automatically
between cells; three cultivation cells (arithmetic, geometric, Fibonacci)
generate streams from a single seed; multiplication and exponentiation
pay fuel per firing (a tick retries blocked cells once fuel becomes
available); cleanup bots sweep loose blocks into matching warehouses;
and a Comprehension cap gates manual lifts so big numbers must be earned.
The number families are admitted: subtraction yields negatives, division
yields exact rationals, roots yield irrationals and complex via `√(-1)`.
The fuel economy is in place: magnitude-scaled costs, warehouses as a
real currency reservoir, rule-based warehouses with predicate catalogs
(`<10`, `<100`, `<1000`, `prime`, `composite`), an optional fuel port
on tier-1 operators, and cultivation cells that self-throttle as
emissions climb. Plus Phase 4 discovery & engineering: the Number
Gallery (Integers / Primes / Perfects / Famous tabs); Filter cells
sharing the warehouse-rule predicate catalog; predicate-cost Literature
entries ("10 primes", "5 primes ≥ 100"); and Blueprints v1 — rectangle-
drag selection captures a subgraph as a named layout, stamped copies
appear on the canvas as raw cells (no packed-cell unwrap semantics
yet). Save schema v11; blueprints in their own localStorage key.

A subsequent review pass closed real bugs (pipes can now deliver seeds to
cultivation cells; cooldown-remaining is preserved across save/load;
`first_one` narrator beat fires for the value `1` only; per-cell
marginalia keys so each freshly placed cell can earn its waiting beat),
plumbing leaks (pipe pulse animations cancel on container destroy,
resize handler no longer leaks the old paper), inconsistencies (one
shared `findBlockAt`, one shared `PENCIL_FONT_FAMILY`, one shared
`GRAPHITE`, one set of merge radii), dead code (~6 small items), and an
aesthetic round (warehouse port labels read as italic notebook
annotations, the cleanup bot's glyph is now a notation-like rotation
arrow). Save schema is v4. Build clean, type-check zero/zero, ~368 KB
bundle (~118 KB gzipped).

### Built and verified

**Aesthetic and rendering**
- Cream-and-blue squared paper background, drawn programmatically
- Pencil-stroke utility (`pencilStroke`, `pencilStrokeDouble`) — perpendicular wobble at subdivided waypoints, double-pass for graphite buildup
- Block rendering: corner-jittered outline, double-stroked, Kalam-lettered numeral, slight whole-block rotation
- River of zeros: 500 overlapping cards in a 160px-tall band, depth-correlated size / alpha / speed, parallax sort
- Stack `×N` badges with hand-lettered tally style
- Successor cell rendering: scribbled `{ }` with dashed drop-zone

**Simulation core (`src/lib/world.ts`)**
- `PlacedBlock` registry with reactive Svelte stores (`totalScore`, `zeroCount`, `blockCount`)
- `PlacedCell` registry with axis-aligned hit-testing
- Achievement and unlock sets (Svelte stores + imperative helpers)
- `addBlock`, `increaseStack`, `findNearbyMatching`, `findCellAt`, `spendZeros`
- `onBlockChange` listener pattern so renderer reacts without circular imports

**Interaction (`src/lib/interaction.ts`)**
- River-zero pickup → ghost follows cursor → drop resolution
- Drop resolution order: **cell drop-target → stack-merge → new placement**
- Cell-placement mode (post-purchase ghost cell follows cursor → commit on click)
- Singleton accessor so UI components can trigger placement

**UI (`src/ui/`)**
- `ScoreHeader.svelte` — top-right `Σ N` display, italic zero-count subtitle
- `Literature.svelte` — sidebar that slides in after first achievement, renders catalog with cost gate

**Build / infra**
- Vite + TypeScript + Svelte 5 + PixiJS 8 + break_eternity.js (installed, unused yet)
- `npm run build` clean, `npm run check` zero errors zero warnings
- ~318 KB bundle (~102 KB gzipped)

### Slice 1.5 — done
- **Marginalia system** — narrator pencil-notes in page margins, fade in/out, one-shot via key dedup
- **Pencil cursor** — idle and active SVG-based cursors with hot-spot at the graphite tip

### Slice 2.1 — done
- **Draggable placed blocks** — pressing any canvas block decrements the stack and starts a fresh drag; the stack badge updates, single blocks vanish when grabbed
- **Interaction-mode flag** prevents concurrent drag/placement conflicts

### Slice 2.2 — done
- **Addition operator** — binary cell, two stacked drop-zones, pending state per port, fires on both-filled
- **Generic cell architecture**: `cell-types.ts` registry, `findCellPortAt`, per-port hit-testing
- **Generic Literature costs**: `LiteratureCost = { value, count }`; `countByValue` reactive map; `valueLabel()` plural-aware

### Slice 2.3 — done
- **Multiplication operator** — second binary cell
- **Shared binary-cell rendering** in `src/lib/pixi/binary-cell.ts`; addition/multiplication/exponentiation all reuse it
- **Centralized binary port geometry** in `cell-types.ts`

### Slice 2.4 — done
- **Exponentiation operator** — third binary cell (`a ** b`)
- **`valueLabel`** extended through ten (fours, fives, … tens)

### Slice 2.5 — done
- **Multi-output cell architecture**: `CellShape.outputs[]`, `operate()`
  returns `{ emits, marginalia? }` so a cell may fire any number of blocks
  at any port
- **Decrement** — unary cell, two outputs: `n−1` straight right, a `1`
  block out the bottom. Underflow on `0` is refused with a narrator note
- **Factor** — unary cell that emits the prime factorisation of its input.
  Primes pass through unchanged (with a narrator quip); composites are
  shattered into their factors at the output port (fanned, same-value
  factors auto-stack)
- **Shared `unary-cell.ts`** mirroring the binary renderer pattern
- **Secondary-output indicators** in the unary cell visual (the `↓ 1` hint
  on Decrement)

### Slice 2.6 — done
- **Repeatable cell purchases** — most operators can be acquired multiple
  times; cost scales geometrically (×1.6 per copy by default)
- **Literature entry kind**: `'cell'` (places a cell) vs. `'theorem'`
  (milestone inscription, once-only, narrator beat only)
- **Theorem entries** — *First Prime* (1× 2), *First Composite* (1× 4),
  *Six Sixes* (6× 6), *Hardy–Ramanujan 1729* (1× 1729). Phase 4 will give
  these mechanical payoff via the Gallery; for now they're aspirational
  narrator beats
- **`formatCost`** — English plurals for values ≤ 10, `N × V` for higher
- **Purchase counter** (`purchaseCounts` reactive map) drives the scaling
  cost UI ("acquire another • owned 2")

### Slice 2.7 — done
- **Versioned `SaveData` schema** (`v1`) — blocks (with positions and
  stack counts), cells (with pending input state), achievements, unlocks,
  purchase counts, and the seen-marginalia key set
- **Autosave** subscribes to a `dirtyTick` store and writes to
  localStorage on a 250ms debounce. `beforeunload` forces a synchronous
  save so a tab close mid-debounce doesn't drop work
- **Rehydration** wipes the world, then drives the controller's new
  `rehydrateBlock` / `rehydrateCell` methods to recreate every Pixi
  container and re-wire interactivity. One-shot marginalia keys persist,
  so the player's first-pickup narrator beat doesn't replay
- **`persistence.ts`** is the orchestrator; `world.ts` exposes
  `snapshotBlocks/Cells/...`, `resetWorld`, and `restore*` mutators

### Slice 3.8 — done
- **Camera module** (`src/lib/camera.ts`) — pan via middle-mouse or
  right-mouse drag (with contextmenu suppressed), zoom via mousewheel
  with zoom-to-cursor focal-point math; clamps to [0.25, 4]. The
  canvasLayer is the only thing transformed; river / HUD stay screen-fixed
- **`screenToCanvas` / `canvasToScreen`** helpers feed the interaction
  layer's hit tests; all ghost positions go through them so dragging at
  zoom 2× drops where the cursor actually is
- **Camera persisted** in save v2 (`{x, y, scale}`)

### Slice 3.7 — done
- **`comprehension` reactive store** in `world.ts`, default 10. Manual
  block pickup is gated: oversize blocks refuse with a marginalia note
  and visually fade (`applyComprehensionStyle`)
- **Three Literature upgrades** — *Comprehension I* (→ 100, cost: one
  each of 1..10 — multi-item cost), *II* (→ 1k), *III* (→ 1M)
- **Header readout** (`comprehension ≤ N`) in `ScoreHeader`
- **Migration v1 → v2 auto-grants** comprehension to cover legacy saves'
  largest block so existing players aren't suddenly stranded

### Slice 3.1 — done
- **`warehouse` cell type** — single typed bin, capacity 100; the first
  deposit locks the type. Drops on the left half deposit; clicks on the
  right-side output port withdraw one and start a drag
- **`drawWarehouseCell`** with a centre badge (`N / cap` + type glyph)
  and `updateWarehouseBadge` refresh callback installed at addCell time
- **`depositToWarehouse` / `withdrawFromWarehouse`** in `world.ts` with
  type-mismatch and capacity guards; failures show contextual marginalia
- **Output-port window listener** in the controller routes warehouse
  output clicks to the withdraw-and-drag path

### Slices 3.2 + 3.3 — done
- **Pipe data model** in `world.ts`: `PipeEndpoint` union (`river` /
  `cell-output` / `cell-input`), `PlacedPipe` registry, `addPipe` /
  `removePipe`. Endpoint cell ids are stable across save/load because
  `resetWorld` now resets the monotonic id counters
- **Pipe simulation tick** (`src/lib/pipe.ts`): per-frame peek source →
  destination accepts → atomic pull-and-deliver. Backpressure on full
  destinations, magnitude-rejection on oversize values. Pipe-delivered
  full input sets fire equation cells via a parallel `fireCellViaPipe`
  path
- **Pipe placement UX**: two-click flow (source then dest), ghost line
  trails the cursor between clicks, ESC cancels. River source endpoints
  are placed when the player clicks in the river band; pipe stores the
  river-tap position in canvas coords
- **Pipe visuals** (`pixi/pipe-visual.ts`): pencil-stroke double line
  whose weight + cross-hatch density scale with magnitude, endpoint dots
  (filled source / hollow destination), midpoint `≤N` label rotated with
  the pipe, and a fading-numeral pulse on each transit
- **Three pipe tiers** in Literature — `≤1` (1 one), `≤10` (10 tens),
  `≤100` (100 hundreds) — the recursive bootstrap encoded as cost

### Slice 3.4 — done
- **Three cultivation cell types** — `cultivation-arithmetic`,
  `cultivation-geometric`, `cultivation-fibonacci`. Each takes a seed on
  the left port (captured, not consumed), pulses an output on its cadence
  (1800–2200ms), and stops at nothing
- **`cultivationEmit(type, seed, step)`** in `cell-types.ts` is the pure
  sequence formula; `tickCultivation` in `src/lib/cultivation.ts` drives
  the cadence and spawns outputs at the cell's output port, merging into
  existing same-value stacks
- **Seed capture** wires into `tryFeedPort`: dropping on a cultivation
  cell's input installs the seed and updates the centre badge

### Slice 3.5 — done
- **`computationalCost(type)`** in `cell-types.ts` returns the per-firing
  cost in `1`s (0 for additive ops, 1 for `×`, 3 for `^`). Both fire
  paths (manual `fireCell`, pipe-driven `fireCellViaPipe`) call it
- **`tickEquationCells`** retries cost-blocked loaded cells each frame
  so adding a one to the world unblocks the next firing automatically
- Multiplication/exponentiation Literature entries now disclose the cost
  in their descriptions and unlock messages

### Slice 3.6 — done
- **`cleanup-bot` cell type** (portless). State: search radius (240 px),
  cooldown (2500ms). Per-tick (in `src/lib/bots.ts`), the bot finds the
  closest loose block in radius and the closest matching warehouse, then
  transfers one unit instantaneously with a brief pulse line
- **`drawCleanupBot`** is a small hand-drawn circle with a `⟲` glyph and
  a faint dashed radius halo

### Pipe critical review — done
A targeted pass after Phase 2 shipped, fixing four user-visible issues
that the initial pipe slice deferred:
- **Dot clutter on placement** — `drawPipe` had `addChild`'d new
  endpoint-dot Graphics on every redraw. `Graphics.clear()` doesn't drop
  children, so each pointer move during placement piled up dozens of
  overlapping shapes. The decor layer is now a single pure Graphics
  buffer that gets `.clear()`'d each render; the magnitude label is a
  persistent Text child repositioned in place.
- **River pipes disconnected from the river on pan/zoom** — the
  `PipeEndpoint.river` shape changed from canvas coords to screen coords
  (`screenX`/`screenY`). `pipeEndpointPosition` re-projects via
  `screenToCanvas` each render, and an `onCameraChange` listener redraws
  river-anchored pipes whenever the camera moves. Save schema v2 → v3
  migrates legacy endpoints.
- **Shift+left-click deletes a pipe.** `findPipeAt` does a per-pipe
  segment hit-test with magnitude-scaled tolerance; `deletePipe()`
  destroys both the runtime and the visual.
- **Jammed pipes go dashed graphite-red.** Per-pipe stall timer
  accumulates dtMs on every failed transfer attempt; past
  `JAM_THRESHOLD_MS` (3 s) the visual flips via `setJammed(true)`. A
  successful transfer immediately resets.

### Codebase polish pass — done
A broader review after the pipe pass, fixing real bugs across the rest
of the codebase, unifying scattered constants, and tightening the save
format. Schema bumped to v4.
- **Bug — pipes silently consumed cultivation seeds.** `deliverDest`
  fired through `operate()` which returns `{ emits: [] }` for cultivation
  types — the seed value vanished. Pipe delivery now routes to
  `captureSeed` for cultivation destinations.
- **Bug — `first_one` narrator beat fired on any positive emit.** A
  `1+1` → `2` triggered the "Built 1 from nothing" line. Tightened to
  `ev.value === 1`.
- **Bug — cost-blocked & pipe-overflow marginalia were keyed by cell
  type / pipe magnitude.** Only the very first instance of each ever
  surfaced the message. Re-keyed by cell/pipe id so each freshly placed
  one earns its single warning.
- **Save schema v4** — adds `cooldownRemaining` (pipes),
  `cultivationCooldownRemaining` (cultivation cells), and a full
  `botState` so cleanup bots persist their config and stall timers. All
  fields optional; v3 saves migrate by version-bump only.
- **Save validation** — `loadFromStorage` now runs a small structural
  typeguard before trusting the parsed payload. Mangled JSON is
  treated as "no save" rather than crashing rehydrate.
- **Memory — pipe pulse animations now cancel on container destroy.**
  Earlier, shift-clicking a pipe mid-transit left a `requestAnimationFrame`
  loop poking at destroyed Pixi objects. `PipeVisualHandles.destroy()`
  flips a flag the rAF callback checks each frame.
- **Memory — resize handler used to leak the old paper container.** Each
  window resize now destroys the prior paper Graphics before re-adding a
  fresh one.
- **Consistency — one `findBlockAt`** (value-optional) replaces the
  earlier `findNearbyMatching` + `findAnyBlockAt` near-duplicates.
- **Consistency — one set of merge radii.** `MERGE_DROP_RADIUS = 60`
  (forgiving for manual drops) and `MERGE_EMIT_RADIUS = 32` (tight for
  automated emits) replace three locally-declared constants that drifted
  between modules.
- **Consistency — `PENCIL_FONT_FAMILY` and `GRAPHITE`** live in one
  shared module (`pixi/typography.ts`). Twelve files used to repeat the
  font stack string verbatim; a CSS variable `--pencil-font` mirrors it
  for DOM-side UI.
- **Consistency — `markDirty()` everywhere** instead of inline
  `_dirtyTick.update((n) => n + 1)` calls.
- **Consistency — `recompute()` runs before `notifyChange()`** in
  `increaseStack` / `decreaseStack` / `spendValue`. Listeners that read
  `$totalScore` from inside `onBlockChange` now see post-mutation
  aggregates.
- **Aesthetic — warehouse port labels** read as italic lowercase
  notebook annotations (`in`, `out`) rather than full-words centered
  sans-style. Bot glyph swapped from a decorative `✦` to a notation-
  shaped `⟲`.
- **Dead code** — removed `void` no-op statements, unused refund-loop
  rollback in `purchase`, unused cell-sizing re-exports in
  `interaction.ts`, `teardownCamera`, `canvasToScreen`, `getCameraScale`.

---

## 2. The path forward

Five phases, roughly in dependency order. Each phase is a series of small slices, each self-contained and buildable.

### Phase 1: The Tactile Toolkit
**Goal:** the player can engineer their way from `0` to large numbers entirely by hand. No automation yet — bare math, bare drag.

| Slice | Content | Status |
|---|---|---|
| **1.5** | Marginalia system; hand-drawn pencil cursor | ✅ done |
| **2.1** | Draggable placed blocks (move them around, drop them on cells, restack) | ✅ done |
| **2.2** | Addition operator (binary cell, two input ports, sums output) | ✅ done |
| **2.3** | Multiplication operator | ✅ done |
| **2.4** | Exponentiation operator | ✅ done |
| **2.5** | Decomposition cells (Decrement, Factor) — bidirectional flow | ✅ done |
| **2.6** | Literature cost ladder fleshed out (richer cost progression, special-number currencies) | ✅ done |
| **2.7** | Save/load (JSON to localStorage, versioned) | ✅ done |

**Deliverable achieved:** A player can construct any natural number from zero, manually, using all basic operators. Bidirectional flow works. Total Score climbs visibly through play. The session persists between page reloads.

### Phase 2: The Factory
**Goal:** automation kicks in. The factory hums on its own.

| Slice | Content | Status |
|---|---|---|
| **3.1** | Storage warehouses (typed bins, capacity, overflow handling) | ✅ done |
| **3.2** | Pipes (magnitude-rated, recursive bootstrap economy) | ✅ done |
| **3.3** | Pipe routing and visualization (weight-coded by rating) | ✅ done |
| **3.4** | Cultivation cells (arithmetic, geometric, Fibonacci — harmonic / polynomial / factorial deferred) | ✅ done |
| **3.5** | Computational cost on multiplication and exponentiation | ✅ done |
| **3.6** | Cleanup bots | ✅ done |
| **3.7** | Comprehension cap (manual lift ceiling) | ✅ done |
| **3.8** | Pan and zoom on canvas | ✅ done |

**Deliverable achieved:** The factory runs without constant clicking. Pipes feed equation cells. Cultivation produces fuel. Comprehension gates manual lifts. The canvas pans and zooms.

**Deferred:** Harmonic / polynomial / factorial cultivation cells (the design's full set is six; Phase 2 ships three). Automatic pipe re-routing as cells move (cells don't move in Phase 2). Bot motion animation (sweeps are currently instantaneous with a fading pulse line). These are pickup work for Phase 3.

### Phase 3: The Mathematical World
**Goal:** new number families unlock through play. Each first-encounter is a moment.

| Slice | Content | Status |
|---|---|---|
| **4.0** | `Value` discriminated-union type + `break_eternity.js` wiring. Foundation for every family to come; resolves the cross-cutting `Number.MAX_SAFE_INTEGER` concern at the same time. | ✅ done |
| **4.1** | Subtraction → negatives unlock (sign on the `real` variant; no new variant yet). Blue accent on negatives. First-negative narrator beat. | ✅ done |
| **4.2** | Division → **exact rationals** as a new Value variant (`{ num, den }`, gcd-reduced, sign on `num`, `den > 0`). Division of integers that divides evenly collapses to integer. Green accent. Polymorphic rules across `rational ↔ real` for every existing operator. | ✅ done |
| **4.3** | Roots → irrationals as a symbolic variant (`{ symbol: 'sqrt(k)', approx }`). Perfect squares collapse to integer; negatives refused (deferred to 4.4). Arithmetic *between* irrationals collapses to `approx` — no symbolic CAS. "We owe you an apology" beat on first irrational. | ✅ done |
| **4.4** | `√(-1)` → complex variant (`{ re, im }`). Polymorphic arithmetic per standard rules; integer-only exponentiation initially. Purple accent. Rotation visualizations deferred to a polish micro-pass. | ✅ done |
| **4.5** | Family-colour polish + centralization. New `colors.ts` as single source of truth for canvas-side palette (mirrors `--accent-*` CSS vars). Gallery `discoveredValues` store + persistence hooks (Slice 5.1 will consume). | ✅ done |

**Deliverable:** The page gains colour as discoveries multiply. Each family unlock reshapes what factories the player can build. Polymorphic operators handle every type combination. `Decimal`-backed values let the factory go genuinely big.

**Architectural notes:**
- **`Value` is the load-bearing abstraction.** Each Phase 3 slice adds a new variant; the goal is that each is a small, additive change rather than a sweeping refactor.
- **Polymorphic equation rules** form a `(family × family × operator) → Value` table that each slice extends. Operators that can't honestly handle a combination refuse with a narrator beat rather than producing garbage.
- **`countByValue`** rekeys to `Map<string, number>` keyed by a stable `valueKey(v)` (e.g. `"real:5"`, `"rational:1/3"`, `"irrational:sqrt:2"`, `"complex:3+4i"`). Drives Literature cost UI generically.
- **Persistence schema bumps:** v4 → v5 in 4.0 (wraps existing `number` as `real`), v5 → v6 in 4.2 (adds `rational`), and so on per new variant.
- **Symbolic algebra is out of scope.** Irrationals collapse to `approx` on arithmetic. A Computer Algebra System is its own decade.
- **`break_eternity.js`** is wired in 4.0 — `Decimal` becomes the numeric primitive inside every `real`, every `rational` numerator/denominator, every irrational `approx`, and every complex `re`/`im`.

### Phase 3.5: The Fuel Economy
**Goal:** Pivot the cost model from "flat per-tier" to "magnitude-scaled". Make warehouses full participants in the economy — fuel reservoirs, currency vaults, score contributors. Mid-game becomes a real resource-management problem, not a math demo.

This phase lands BEFORE Phase 4 because Phase 4's Filters and special-currency Literature entries lean heavily on warehouses-as-resources. Doing the fuel economy first means Filters become "filters but for routing" rather than introducing the concept fresh.

| Slice | Content | Status |
|---|---|---|
| **3.5.1** | `computationalCost(type, inputs)` returns `tier · max(1, ⌈log₁₀(max(\|a\|, \|b\|))⌉)`. Tier table: successor/addition/subtraction 0; mul/div 1; exp 2; tetration 4; pentation 8. Cost preview badge `fuel ≥ N` on every cost-bearing cell, recomputed on every pending change. | ✅ done |
| **3.5.2** | Total Score includes warehouse contents. `recompute()` scans warehouses and folds their contents into both Total Score and `countByValue`. In-transit pipe items aren't summed (the simulation transfers atomically — no persistent in-flight state to scan). | ✅ done |
| **3.5.3** | `spendValue` extends to scan warehouse contents AND rule-warehouse items. Loose pool drains first, then typed warehouses, then rule warehouses. One spend path, one search order. | ✅ done |
| **3.5.4** | Generalized Warehouse cell (`warehouse-rule`). Starter catalog of predicates: `<10`, `<100`, `<1000`, `prime`, `composite`. One Literature entry per rule (the picker-on-placement idea was simpler to express as separate entries — the predicate vocabulary is shared with Filters in Phase 4). Save schema bumps to v10. | ✅ done |
| **3.5.5** | Tier-1 operators (mul, div, exp) gain an **optional fuel input port**. If a pipe is wired to it OR the player manually drops a fuel block there, the cell uses slot fuel; otherwise it falls back to the global scan from 3.5.3. Slot fuel below cost stays parked (under-payment rejected, symmetric to over-payment wasted). | ✅ done |
| **3.5.6** | Per-emission cultivation cost: `max(1, ⌈log₁₀(\|emission\|)⌉)`. Cell badge shows the next emission's `next ≥ N`. Starved cells stall — cooldown doesn't reset, step doesn't advance — until fuel reappears. Geometric chains self-throttle. | ✅ done |
| **3.5.7** | Fuel paid in **magnitude per block**. `spendFuel(cost)` picks the smallest qualifying block from loose / typed / rule pools so over-payment is minimised but never split across multiple small blocks. Bundled with 3.5.3 since both touched the same spend path. | ✅ done |

**Deliverable achieved:** The mid-game IS a real resource economy. Cultivators self-throttle on cost; warehouses are storage AND currency AND fuel tanks; decomposition (Decrement, Factor) has real strategic value (small denominations to fuel cheap operations); Total Score reflects everything the player owns, not just the loose pile.

**Architectural notes (post-build):**
- The `cost.ts` module pulled all the cost formulas + `cultivationEmit` out of `cell-types.ts` to break a runtime cycle with the pixi-side cost-preview badges. `cell-types.ts` re-exports them for callers that don't need to thread that cycle.
- `consumeFuelOrFail(cell, cost)` is the single source of truth for the fuel-resolution decision tree (slot → wait-for-pipe → global pool). Both fire paths call it.
- Predicate vocabulary in `warehouse-rules.ts` is intentionally shaped to power Phase 4 Filter cells without additional design work.

**Architectural notes:**
- **`computationalCost` becomes input-aware.** Existing call sites pass cell type only; they'll need the cell's pending input values. The fire path already has those; the retry path (`tickEquationCells`) needs to recompute on each retry.
- **Fuel resolution becomes a single function.** `resolveFuel(cell, cost): { source: WarehouseRef | LoosePool, block: PlacedBlock } | null`. Tier-1 with a wired fuel pipe restricts to that warehouse; tier-1 without falls back to global; tier-2+ requires the fuel pipe (returns null otherwise).
- **Save schema bumps to v10** to accommodate the new warehouse-rule cell type and the per-cell fuel-port wiring state.
- **Cost preview is a tiny Text child** on each cost-bearing cell, updated whenever inputs change or — for cultivators — at every emission. Cheap.

### Phase 4: Discovery and Engineering
**Goal:** deep strategy. The game is genuinely a math-engineering puzzle.

| Slice | Content | Status |
|---|---|---|
| **5.1** | Number Gallery — toggleable panel with Integers (0-99 grid + overflow list), Primes, Perfects, Famous tabs. Driven by the existing `discoveredValues` store; famous integers get a yellow-highlighter tint. | ✅ done |
| **5.2** | Filter cells — one input, two outputs (match top, no-match bottom). Reuses the warehouse-rule predicate catalog so `filter: prime` and `wh: prime` agree on which values pass. Lives outside `operate()` on its own route path. | ✅ done |
| **5.3** | Predicate-cost Literature — `LiteratureCostItem` extended with `{ruleId, count, magnitudeMin?}` variant. `canAfford` and `purchase` route to `countMatching`/`spendMatching` which walk loose + warehouses + rule-warehouses. Three showpiece Theorems land ("Box of Primes", "Box of Bigger Primes", "Crate of Composites"). | ✅ done |
| **5.4** | Blueprints v1 (data + capture) — rectangle-drag selection mode; subgraph captured as a BlueprintDef (cells + interior pipes, coords anchored at the bounding-box top-left). Stored in `numbers-go-big.blueprints` localStorage key, independent of the main world save. | ✅ done |
| **5.5** | Blueprint library UI + stamp placement — toggleable panel listing saved blueprints. Click a blueprint → ghost preview at cursor → click to stamp. Stamping creates fresh cells + interior pipes (no packed-cell semantics; copies appear as raw cells). | ✅ done |

**Deliverable achieved:** Literature can now demand predicate-defined currencies, and the player has both Filters and rule-warehouses to design factories that produce them. The Gallery records every value ever produced. Blueprints let layouts be saved and reused.

**Deferred to a future polish pass:**
- Packed-cell Blueprint semantics — a Blueprint instance as a single visual cell that PRESENTS as one input/output box, with click-to-unwrap. The current implementation always unwraps on placement.
- Blueprint preview thumbnails in the library.
- More filter predicates (divisibility, family, composite predicates).
- Special-number currency UI in Literature (per-predicate visible totals as the player accumulates them).

### Phase 4 UX polish pass
**Goal:** layout-by-hand. Make the factory feel like a hand-arranged page rather than a fixed circuit.

| Slice | Content | Status |
|---|---|---|
| **5.6** | Movable cells — drag the cell body (not on a port) to reposition. The new `redrawPipesForCell(cellId)` in `pipe.ts` walks all connected pipes and re-projects them on every drag tick, so connections follow in real time. ESC cancels mid-drag, snapping back. Hit priority preserves drop-zones and output-port click semantics. | ✅ done |
| **5.7** | Generalised output fan + back-pressure. The cultivation `planSpawn` / `commitSpawn` pair moved to a shared `src/lib/spawn.ts`. Operators (`fireCell`, `fireCellViaPipe`) and filters now pre-check each output port; if any is clogged (12 fan slots full) the cell stalls — no fuel burn, no input consumption, retries next frame. Multi-emit-per-port (Factor) keeps its 18 px within-firing fan anchored to the first emit's planned spot. | ✅ done |
| **5.8** | Curved pipes. Cubic bezier with orientation-aware control points: horizontal-mostly pipes flow like flow-chart connectors; vertical-mostly pipes (fuel ports) bow up/down. Sampled into a polyline so `pencilStrokeDouble` still wobbles them by hand. Arc-length sampling drives the magnitude label, transit pulse, cross-hatch ticks, and jammed-state dashes — they all trace the visible curve. Hit-test walks the polyline segments. | ✅ done |
| **5.9** | Pan/zoom polish. Wheel step halved (10% → 5% per notch) for finer settling. Min zoom widened (0.25 → 0.2) for a broader overview. `grabbing` cursor while middle/right-drag panning, restored on release. | ✅ done |

**Deliverable achieved:** the factory feels arranged-by-hand. Cells move where the player wants; pipes flow as soft arcs that follow; output ports never pile up; pan/zoom is comfortable.

### Phase 5: The Long Arc
**Goal:** open-ended escalation. The game has no end.

| Slice | Content |
|---|---|
| **6.1** | Tetration, pentation, arrow notation operators |
| **6.2** | Magnitude-ladder rendering tiers (scientific notation → power towers → arrow notation → FGH placeholder) |
| **6.3** | Prestige system + Ancestral Numbers shelf |
| **6.4** | Ordinals (ω, ε₀, Γ₀), surreal numbers |
| **6.5** | Named giant numbers as currency targets (Graham, TREE(3), Loader, Rayo) |

**Deliverable:** Endgame. Numbers climb beyond any conventional notation. Prestige offers acceleration without trivialization. The player can chase named giants for the rest of their lives.

---

## 3. Cross-cutting concerns

These touch every phase and ship in parallel rather than as discrete slices.

### Persistence
- **Save/load** — landed in Slice 2.7 (v1) and extended in Phase 2 (v2).
  V2 adds: pan/zoom camera state, comprehension level, pipes (source +
  dest endpoints, magnitude, cooldown), warehouse stored state, and
  cultivation seed + step counters. The `v1 → v2` migration auto-grants
  comprehension to cover legacy saves' largest block.
- Cloud saves: deferred indefinitely. localStorage is enough.

### Performance
- Profile only when measured slowdowns appear.
- Likely interventions when needed: `ParticleContainer` for dense river / fuel streams, batched draw calls, deferred re-renders.
- `break_eternity.js` integration the moment we exceed JavaScript's safe integer range (probably mid-Phase 2, definitely by Phase 5).

### Audio
- A dedicated pass after Phase 3 (when the game feels like a game).
- Pencil scratches, page rustles, soft mechanical clicks. Possibly degrading into structured noise as numbers escalate beyond comprehension.

### Visual polish
- Hand-drawn pencil cursor (Slice 1.5)
- Marginalia layout tuning (Slice 1.5)
- Family colour palette refinement (Phase 3)
- Per-tier number rendering as magnitudes climb (Phase 5)

### Documentation
- This file and `DESIGN.md` evolve together. When a design decision shifts, both get updated.

---

## 4. Open decisions

Deliberately uncommitted, to be settled by playtesting or experimentation:

- **Save format and migration strategy** — JSON schema design, versioning approach
- **Final pacing curves** — Literature costs, Comprehension tier requirements, throughput upgrade prices. All empirical.
- **Mobile support** — desktop-first; mobile is a re-skin question deferred to post-Phase 3.
- **Computational cost balance** — only known after playtesting Phase 2
- **Gallery scope** — how many special-number categories? Capped or open-ended?

---

## 5. Working approach

- **Small slices.** Each slice is self-contained, ends in a buildable state, and is testable end-to-end. A few hours to a few days each.
- **Validate before extending.** After each slice, play the game. If it doesn't feel right, fix it before adding more layers.
- **The design doc is the north star.** When in doubt about a feature, refer to `DESIGN.md`. Update both docs when designs evolve.
- **Performance later.** Don't optimize without measurement. The current architecture has substantial headroom.
- **Aesthetic discipline.** Every new visual element should look like it belongs on the same page. Penciled, slightly imperfect, never twee.

---

## 6. Rough scale

Counting slices across all five phases: **~30 slices total**, give or take.

For a solo developer working steadily: roughly **3–6 months of focused work** to reach the end of Phase 4 (genuine playable game with depth). Phase 5 is open-ended.

This is an estimate, not a commitment. Adjust as scope clarifies through play.
