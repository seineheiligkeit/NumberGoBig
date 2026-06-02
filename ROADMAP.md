# Numbers Go Big! — Status & Roadmap

A working document for "where we are" and "where we're going." The creative
north star is `DESIGN.md`. This file is the execution plan.

---

## 1. Where we are

**Phases 1, 2, 3, 3.5, 4, the Phase 4 UX polish pass, the operator
+ rendering legs of Phase 5 (Slices 6.1a/b/c + 6.2a/b/c), the
Phase 5.6 pacing overhaul + leveling system (Slices 6.6 + 6.7), and
the Phase 5 Iteration Wave (Slices 6.11–6.18) are complete.**

The pacing overhaul rebalanced every operator, pipe, and comprehension
cost against a standalone simulator (`sim/`) that models optimal play
under the planned leveling system. The comprehension ladder grew from
three tiers (≤100, ≤1k, ≤1M) to eight (≤25, ≤100, ≤250, ≤1k, ≤10k,
≤100k, ≤1M, ≤1B), each pairing an engineered specific-number puzzle
(1729, 6174, 65536, ...) with a bulk stockpile. Pipe ≤1000 was added.
Tetration and Pentation costs were moved into the tens of thousands of
thousands and millions, sized to require leveled production
infrastructure. Save schema v12 auto-migrates pre-overhaul players by
back-filling implied lower-tier comprehensions. **Pacing target:
~5h speedrun, ~10h casual to Tetration.**

Phase 5.6 also includes **Slice 6.7 — leveling system v1**. Cells and
pipes now have per-type/per-magnitude upgrade levels (max 5, doubling
throughput per level). Successor gains river-tap at lvl 3; Mult and
Exp gain fuel-cost discounts at lvl 3 and lvl 5. The Literature panel
lists upgrade entries that become visible only when the immediate next
tier is reachable. A Roman-numeral badge marks every leveled cell.

Still not in game code: warehouses don't yet have levels (Slice 6.9),
some level *qualities* are documented but not implemented in v1
(bundle output, variadic addition, batched pipe transfer, jam
threshold — see Slice 6.8). Pure throughput-multiplier leveling ships
in 6.7; non-throughput qualities arrive later.
The factory runs without constant clicking: the canvas pans and zooms;
warehouses store typed stacks at capacity; magnitude-rated pipes carry
blocks automatically between cells; three cultivation cells (arithmetic,
geometric, Fibonacci) generate streams from a single seed; the
multiplicative operators (×, ÷, ^) pay fuel per firing with an optional
fuel port; the hyperoperators (`↑↑`, `↑↑↑`, `↑ⁿ`) each have a
required fuel port that won't fire without explicit wiring; cleanup bots
sweep loose blocks into matching warehouses; and a Comprehension cap
gates manual lifts so big numbers must be earned. The number families
are admitted: subtraction yields negatives, division yields exact
rationals, roots yield irrationals and complex via `√(-1)`. The fuel
economy is in place: magnitude-scaled costs, warehouses as a real
currency reservoir, rule-based warehouses with predicate catalogs
(`<10`, `<100`, `<1000`, `prime`, `composite`), and cultivation cells
that self-throttle as emissions climb. Plus Phase 4 discovery &
engineering: the Number Gallery (Integers / Primes / Perfects / Famous
tabs); Filter cells sharing the warehouse-rule predicate catalog;
predicate-cost Literature entries ("10 primes", "5 primes ≥ 100"); and
Blueprints v1 — rectangle-drag selection captures a subgraph as a named
layout, stamped copies appear on the canvas as raw cells (no packed-cell
unwrap semantics yet). And Phase 5's operator hierarchy: tetration,
pentation, and a variadic Knuth arrow cell, each tier 2+ with required
fuel routing and Decimal-valued cost; plus the magnitude-ladder
renderer in `pixi/value-label.ts` that routes every block's label
through five tiers (digits → commas → sci → power tower → arrow) with a
narrator beat per transition. Save schema v11; blueprints in their own
localStorage key.

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

**Phase 5 Iteration Wave shipped 2026-05-16 (Slices 6.11–6.18).**
Translation Operators (T-bots) replaced the cleanup-bot teleport with
animated walking workers that pick up blocks and carry them to
matching warehouses. Pipes can be re-routed in place by dragging
either endpoint dot to a new compatible port. Pipe rendering polished
with port-aware bezier tangents (flow-chart-connector look) and a
flatter transit-pulse alpha curve. The **Inversion family** landed —
`negation` (n ↦ −n, tier 0 free), `inversion` (n ↦ 1/n, tier 2 with
required fuel port), `wh: negative` rule warehouse — built on a new
**signed-fuel** mechanic: `consumeFuelOrFail` and `spendFuel` now
match a block's sign against the cost's sign before checking
magnitude. Subtraction's negatives and Division's tiny rationals
finally have a productive role. Save schema bumped to v14 (T-bot
phase fields, optional). Three polish passes closed the wave:
per-cell-type level-badge offsets + shared `drawDashedRect` helper
(6.16), micro-animations on emit/consume via new `pixi/micro-anim.ts`
(6.17), and a typography hierarchy + `pencilText` resolution-boosting
factory applied to block numerals, cost badges, level badges, and
stack badges (6.18). Pacing held at ~5h speedrun / ~10h casual to
Tetration per the sim. See §2 *Phase 5 — Iteration Wave* for slice
detail and DESIGN.md §6 *Inversion and the Negative-Fuel Pivot* for
the design intent.

**Phase 6 — Comprehension as Spine — SHIPPED.** All design, sim
porting, and code slices complete. Comprehension is the singular
pacing axis: power-of-2 ladder (Comp ≤ 2^N, infinite); universal
magnitude gate on manual lift / pipes / warehouses / T-bots;
cell-jam mechanic pins stuck cells in place and renders oversize
outputs as `?`; reveal events on comp upgrades retroactively decode
parked `?`-blocks; new decomposer bot family (F-bot / D-bot / I-bot)
as the *delegated-comprehension* exception that can act on
uncomprehended blocks; warehouse capacity scales geometrically with
comp; pipe leveling dissolved into the comp ladder (single Literature
entry per magnitude tier); cultivators rebuilt as input-driven
transformer cells with internal step counter; three new cultivators
deferred since Phase 2 (harmonic / polynomial / factorial) landed.

**Save schema bumped three times** during Phase 6 + α.5:
- v15 (β.1) collapses the old comp ladder into the power-of-2 model.
- v16 (γ.1) dissolves pipe leveling and remaps old pipe ids.
- **v17 (α.5c)** trims fuel-port slot from non-inversion cells.
Migrations are idempotent and cover every pre-v15 save.

**α.5 Ladder Rule — SHIPPED.** Following a deep sim-side iteration
the fuel economy was replaced wholesale:

  - **Per-firing ladder.** Every cell at hierarchy position L consumes
    `2^(L-k) × ⌈log₁₀(max input)⌉` blocks of value k, for k=0..L.
    Successor: 1 zero. Addition: 2z+1o. Multiplication: 4z+2o+1t.
    Tetration: 16z+8o+4t+2×3+1×4 per firing.
  - **Unlock-cost ladders.** Every operator unlock + every comp tier
    cost follows the ladder pattern. `ladderUnlockCost(L, M)` in
    literature.ts.
  - **Comp milestone puzzles.** Every comp_N tier additionally
    demands `1 × 2^(N-1)` — the previous tier's ceiling — as an
    engineering construction proof.
  - **Operator construction puzzles.** Multiplication demands a
    1 × 10, exp/div/inv/sqrt demand 1 × 100, tetration demands
    1 × 1024, pentation demands 1 × 1,000,000.
  - **Fuel ports dropped** from tier-1+ cells (except inversion).
    Ladder pulls from pool/warehouses automatically — no wiring.
  - **River-tap removed.** Successor lvl 3 is now a pure throughput
    bump; zeros always flow via pipe ≤1.
  - **Zero warehouses** become meaningful — the agent buys them as
    the pool stockpile grows. (Required because the ladder pulls
    zeros at every firing.)

  Locked at **~5h Tetration / ~12h Pentation** (sim agent). Pentation
  grew significantly because every comp tier now carries a puzzle —
  the design trade is more decision-relevant moments for more total
  grind length. See `sim/PACING_LOCKED.md` for the unlock table.

**`sim/analyze.ts` — richer metric tool.** Beyond `run.ts`'s basic
unlock-pacing table, `analyze.ts` reports per-value consumption-vs-
production flow, bottleneck distribution over the run, focus-time
distribution, and pool snapshots at every unlock event. Use to
investigate "where is the agent really spending time" — answer for
α.5c is "82% of ticks bottlenecked on zero supply."

**Sim coverage gaps that remain** (game features the speedrun model
doesn't actively use, but they're catalog-stubbed):
  - T-bot frontier-band throughput.
  - Decomposer-bot jam-clearing as an alternative to comp upgrade.

Those models can land later when a specific tuning question requires
them.

**Cultivation cells rework shipped.** Streaming cultivators
(`cultivation-arithmetic` / `cultivation-geometric` /
`cultivation-fibonacci`) are now input-driven transformers (ε.1).
Three previously-deferred series (harmonic / polynomial / factorial)
landed in ε.2. See DESIGN.md §6 *Cultivation Cells* for the design.

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

Slices 6.1 and 6.2 were interleaved in execution: each operator unlocked
needs the rendering tier its output produces, and the rendering tiers
can't be tested without operators that produce values at that scale.

| Slice | Content | Status |
|---|---|---|
| **6.1a** | **Tetration cell** (`a↑↑b`, tier 4, required fuel port). Switched `computationalCost` / `spendFuel` / `consumeFuelOrFail` to `Decimal` so future stacked-tower inputs don't overflow `Number.MAX_SAFE_INTEGER`. New `valueTetrate` via `Decimal.tetrate`. | ✅ done |
| **6.2a** | **Magnitude-ladder skeleton + sci-notation tier.** New `pixi/value-label.ts` returns a Pixi `Container` per `Value`, routed via `valueLabelTier`. Plain digits / commas (`1,234`) / sci (`1.50×10⁴⁵` via Unicode superscript). Notation-transition marginalia (*"Comma notation discontinued"*). | ✅ done |
| **6.2b** | **Power-tower tier.** Stacks of `10`s with the Decimal's `mag` at the top, sized adaptively for 1–4 visible levels; truncated towers add a `⋮` row and an `↕N` height badge. Tier classifier switched to use `Decimal.layer`. Marginalia (*"This number is now a building"*). | ✅ done |
| **6.1b** | **Pentation cell** (`a↑↑↑b`, tier 8). Mirrors tetration's structure; `valuePentate` via `Decimal.pentate`. `PENTATE_HEIGHT_CAP = 100`. | ✅ done |
| **6.2c** | **Arrow-notation tier.** For values whose tower height exceeds `TIER_ARROW_LAYER_MIN = 100_000`, the visual stack stops communicating — compact `10↑↑N` notation takes over (sci-formatted N for huge counts, `∞` for break_eternity overflow). Marginalia (*"We have stopped writing the tower out. Use your imagination."*). | ✅ done |
| **6.1c** | **Variadic Knuth arrow cell** (`a↑ⁿb`). Three operand inputs (base, arrows, height) + fuel; tier scales as `2^n` (computed at firing time from the arrows input). break_eternity has no native `arrow(n)` past pentation, so for `n ≥ 4` we iterate the recursive definition `a↑ⁿb = a↑^(n-1)(a↑ⁿ(b-1))`. Heights cap progressively: 1000 for tetration, 100 for pentation, 50 for higher. Cost preview shows `fuel ≥ N` like the binary cells (the shared `updateCostBadge` is polymorphic). | ✅ done |
| **6.6** | **Pacing overhaul — data port.** Apply the simulator-validated cost curve to `src/lib/literature.ts`. Eight comprehension tiers (was three) with engineered specific-number puzzles + bulk stockpiles. New `pipe_1k` entry. Rebalanced operator and infrastructure costs sized for the leveling system that lands in 6.7. Save schema bumps to v12; migration back-fills implied lower-tier comprehensions for pre-overhaul saves. **Pacing target locked: ~5h speedrun, ~10h casual to Tetration.** | ✅ done |
| **6.7** | **Leveling system v1 — full integration.** Per-cell-type levels stored in `world.ts` (`cellLevels: Map<CellType, number>`) and per-pipe-magnitude levels (`pipeLevels: Map<number, number>`). Throughput multiplier `2ⁿ⁻¹` per level — applied to cell output stack count in both fire paths and to pipe cooldown in `tickPipes`. Qualities modeled in code: **Successor lvl 3 river-tap** (new `tickRiverTapSuccessors` driver that emits without a pipe attached) and **Mult/Exp lvl 3 fuel −1 / lvl 5 fuel halved** (in `cost.ts`). 28 level-upgrade Literature entries (4 levels × 5 cells + 4 levels × 3 pipes − pipe_100 capped at IV), each denominated in the currency the primitive helps produce. New `kind: 'level'` purchase branch; `isLevelUpgradeAvailable` gates entry visibility to the immediate next tier. Save schema v13 with cellLevels + pipeLevels snapshots. Pencil Roman-numeral badge (II–V) at the top-right of each leveled cell. | ✅ done |
| **6.8** | **Leveling polish — deferred qualities.** Currently unmodeled in v1: Successor lvl 5 bundle output (every 5 firings emit a `5`-block instead of 5 ones), Addition lvl 4 variadic (sum 3 inputs per firing), Pipe lvl 3+ lower jam threshold, Pipe lvl 4+ batched transfer (2 items per tick). Pure throughput-multiplier model ships in 6.7; these are non-throughput qualities that need bespoke firing behaviour. | not started |
| **6.9** | **Leveling — Warehouses.** Capacity ladder (100 → 500 → 2k → 10k → 100k) plus qualities at lvl 3 (dual output), 4 (built-in fuel port), 5 (feeds multiple destinations). Not in 6.7 because warehouses don't fit the "output multiplier" pattern — they're storage. | not started |
| **6.10** | **Literature tabs UI.** Split the single Literature sidebar into tabs: Operators / Levels / Infrastructure / Discovery / Comprehension / Theorems. Reduces clutter as the catalog now spans 60+ entries. Greyed-out locked entries become visible (the player sees the road ahead). | not started |
| **6.3** | Prestige system + Ancestral Numbers shelf | not started |
| **6.4** | Ordinals (ω, ε₀, Γ₀), surreal numbers | not started |
| **6.5** | Named giant numbers as currency targets (Graham, TREE(3), Loader, Rayo) | not started |

**Architectural notes (Phase 5 in progress):**
- **`Decimal`-valued cost.** `computationalCost(type, inputs)` and `cultivationEmissionCost(value)` return `Decimal`; `spendFuel(cost)` and `consumeFuelOrFail(cell, cost)` take `Decimal`. Cost-preview badges in `binary-cell.ts` / `cultivation-cell.ts` / `variadic-arrow-cell.ts` use `cost.toString()` which emits `eXX` notation cleanly for tetration-tier costs.
- **Required fuel port.** `consumeFuelOrFail` reads `costTier(cell.type)` and routes tier-2+ cells through `'awaiting-pipe'` when the fuel slot is empty (no global-pool fallback). Tier-1 (mul/div/exp) still falls through to global as a safety net.
- **`Decimal.layer` drives the tier classifier.** Layer 0 with mag < 1000 is digits; layer 0 with mag < 10⁶ is commas; layer 0 ≥ 10⁶ or layer 1 is sci; layer 2 to ~10⁵ is tower; beyond is arrow. The sci tier's mantissa-and-exponent split works for any layer-1 value, so `2↑↑5 ≈ 2e19728` renders cleanly without overflowing the exponent cap.
- **Variadic-arrow tier formula.** `costTier('variadic-arrow')` returns the baseline 2 (so `consumeFuelOrFail`'s `>= 2` check treats it as required-fuel); the actual cost is computed inline in `computationalCost` from the runtime arrows-input slot (slot 1).

**Deliverable so far:** the operator hierarchy is complete from successor through arbitrary-arrow hyperoperations. Outputs at every magnitude render in the appropriate notation tier — digits, commas, scientific, power tower, arrow — and the narrator notes each transition. The mid-late game now has a real climb past exponentiation, with each operator requiring tighter fuel routing than the last.

### Phase 5 — Iteration Wave (2026-05-16)
**Goal:** make the canvas feel alive, reroute pipes without re-placing them, and add a new operator that turns the bottom of the magnitude ladder into raw material. Polish passes interleave at the end so they cover the new cells too.

This wave reordered the previously-planned 6.8 / 6.9 / 6.10 slices behind a higher-priority block of UX, presentation, and one new operator (Inversion). The leveling-quality and warehouse-leveling work stays on the roadmap, just behind this.

| Slice | Content | Status |
|---|---|---|
| **6.11** | **Translation Operators (T-bots).** The cleanup-bot family is now *Translation Operators* — the math/physics T̂ shift operator. Internal cell type stays `cleanup-bot` (no save migration); user-visible name + visual upgraded. Each bot now has a walking worker that picks up the target, carries it across the canvas, and sets it down at the warehouse. Per-bot phase machine in `world.ts` (`botPhase`, `botTargetBlockId`, `botDestCellId`, `botWorkerX/Y`, `botCarried`); claim system prevents two bots fighting over the same block. New visual layer in `pixi/cleanup-bot.ts` — station + halo at home, separate worker container with `T` glyph that gets the carried block as a child while returning. Save schema v14 with optional phase fields. Edge cases: target vanishes mid-walk → revert to idle; warehouse full at deposit → drop loose with narrator beat. | ✅ done |
| **6.12** | **Pipe re-routing (endpoint drag).** Grab either pipe-endpoint dot (10 px tolerance, tighter than the 22 px output-port hit-zone so warehouse withdraw still works near the edges) and drag to a new compatible port. The bezier re-routes live during drag via `previewPipeEndpoint`; release on a compatible port commits via `setPipeEndpoint`, release elsewhere snaps back via `refreshPipeVisual`. New `'rerouting-pipe'` interaction mode. 4 px movement threshold so click-without-drag is a deliberate no-op. Shift+click on an endpoint still deletes the whole pipe (existing shortcut preserved). | ✅ done |
| **6.13** | **Pipe rendering polish.** Port-aware bezier tangents — pipes now exit each cell along the port's outward axis (`pipeEndpointDirection(ep)`) rather than along the chord, eliminating the visible 45° flip the old chord-orientation heuristic produced. Control-point distance clamped to `[24, len/2]` so very short pipes don't loop back on themselves. Transit-pulse alpha curve flattened (`sin(πt)^0.45 × 0.95`) so the pulse is visible across most of the pipe instead of just at the midpoint. Falls back to chord heuristic when an endpoint has no port (ghost during 2-click placement, mid-drag during re-route). | ✅ done |
| **6.14** | **Inversion — sim prototype.** Modelled `negation` + `inversion` cells in `sim/catalog.ts` and added them to the default roadmap (`negation` after division, `inversion` after exponentiation). Tier 2 for inversion; cost formula validated. Verified Tetration unlock shifts only +5m 33s (2h 39m → 2h 45m), well inside the 5 h speedrun target. The agent never picks the inversion path for production — exp 10⁶ costs 2 fuel vs. inversion-route's 12 magnitude. New entries are pure content gates, not throughput shortcuts. **Gated 6.15.** | ✅ done |
| **6.15** | **Inversion + Negation + `wh: negative`.** All three ship together. New `valueRecip(v)` in `value.ts` (variant-aware: integers → `rational(1, n)`, rationals flip num/den, irrationals collapse to `approx`, complex via `(a−bi)/(a²+b²)`). `negation` cell tier 0 free (calls `valueNeg`); `inversion` cell tier 2 with required fuel port and the SIGNED cost formula `cost = -tier × ⌈log₁₀(|output|)⌉` — uphill inversions (|input| < 1 → big output) need negative fuel, downhill inversions need positive fuel, [1, 10) is a free zone. `spendFuel` and `consumeFuelOrFail` generalised to sign-aware matching: a block qualifies iff `valueIsNegative(block) === (cost < 0)` AND `|block| ≥ |cost|`. Cost-preview badge reads `fuel ≥ N` for positive cost and `fuel ≤ N` for negative. New `wh: negative` rule warehouse predicate (`valueIsNegative`). Three Literature entries (`negation` 100 ×3s, `inversion` 100 ×100s, `warehouse_rule_negative` 1 each of −1/−2/−3). First-encounter narrator beat: *"The cost, regrettably, is negative. The cell accepts negative fuel. Do not ask why."* No save schema bump — new cells use the existing generic snapshot path. | ✅ done |
| **6.16** | **Cell visuals consistency pass.** New `cellLevelBadgeOffset(type)` in `level-badge.ts` returns a per-shape offset so the Roman-numeral badge lands ~24 px from the right edge on every cell (was cramped at 2 px on successor with the old default). `drawDashedRect` consolidated into `pencil.ts` — five identical copies in the cell visuals collapsed to one shared import. Whole-cell rotation standardised to 0.03 rad across the catalog (warehouse + filter were 0.025). | ✅ done |
| **6.17** | **Micro-animations on emit/consume.** New `pixi/micro-anim.ts` module. `spawnEmitScribble(layer, x, y)` — a 4-stroke pencil flourish at every block-materialisation point, ~260 ms life with a `sin(πt)` alpha curve. Wired into `commitSpawn` so it fires for both new-spawn and merge cases. `fadeAndDestroy(display, dur?)` — replaces instant `removeChild + destroy` for consumed pending-input ghosts. Wired into the three fire paths (manual fire in `interaction.ts`, pipe-driven fire in `pipe.ts`, fuel-slot consume in `world.ts`). World stays pixi-free at the import level via a registered hook (`setPendingDisplayDisposer`); `interaction.ts` registers `fadeAndDestroy` at controller-init time. | ✅ done |
| **6.18** | **Typography & badge legibility pass.** Hierarchy constants in `typography.ts`: `BADGE` (13 pt italic), `HINT` (12 pt italic), `ARROW` (28 pt), `COUNTER` (18 pt), each with a `.style()` factory. `pencilTextStyle` extended to accept `fontStyle` and weight `'600'`. New `pencilText(text, style)` factory bakes in `PENCIL_TEXT_RESOLUTION = 2` so text stays crisp at the camera's max 4× zoom. Applied to highest-impact Text instances: cost-preview badges (binary / unary / variadic-arrow), level-badge Roman numerals, block numerals (single-line + rational fractions), and stack `×N` badges. Other Text can migrate gradually — the hierarchy is documented in `typography.ts`. | ✅ done |

After the wave: **6.10** (Literature tabs UI) becomes urgent because Inversion + Negation + `wh: negative` added entries to a sidebar already at ~60. Then **6.8** (deferred level qualities) and **6.9** (warehouse leveling) close out Phase 5's mid-game depth. Then **6.3** (prestige + Ancestral), **6.4** (ordinals + surreals), **6.5** (named giants).

**Architectural notes (Iteration Wave):**
- **Translation Operator path state.** Each bot's runtime grew six fields: `botPhase` (`'idle' | 'approaching' | 'returning' | 'going-home'`), `botTargetBlockId`, `botDestCellId`, `botWorkerX/Y`, `botSpeed`, `botCarried`. The tick advances the worker's stored position toward the active target; arrival triggers the next phase. Legacy `botCooldownMs` / `botCooldownRemaining` retained for save back-compat but no longer consulted — the walk itself is the throttle. Save schema v14 with optional phase fields; pre-v14 saves restore at idle, worker at home.
- **Pipe endpoint drag** reuses the same `resolvePipeEndpoint` validator as fresh placement, so the rules ("source = cell-output or river; dest = cell-input") are guaranteed identical. New helpers in `pipe.ts`: `findPipeEndpointAt(x, y, tol)`, `previewPipeEndpoint(pipe, end, pos)`, `setPipeEndpoint(pipe, end, endpoint)`, `refreshPipeVisual(pipe)`.
- **Port-aware tangents.** `pipeEndpointDirection(ep)` returns the outward unit vector for an endpoint (river: `(0,-1)`; cell ports: derived from port offset relative to cell center, snapped to dominant axis). `drawPipe` accepts optional `srcDir`/`dstDir`; when both are provided, control points sit along those tangents (clean flow-chart-connector look); when omitted, falls back to the chord-orientation heuristic.
- **Negative fuel.** `computationalCost('inversion', [v])` returns a signed `Decimal`. `consumeFuelOrFail` checks `valueIsNegative(slot) === cost.lt(dZero)` then magnitude; `spendFuel` does the same scan across loose, typed warehouses, and rule warehouses. Existing positive-cost cells are unaffected since their costs stay non-negative and positive blocks still match. Narrator marginalia (`first_inversion_negative_fuel`) fires the first time a player inverts a value with `|v| < 1`.
- **Negation is tier 0 free** — no fuel port — because its only job is to produce the fuel for Inversion. Direct `valueNeg(inputs[0])` in `operate()`. Intentionally quiet (no marginalia).
- **Micro-anim hook in world.ts.** `setPendingDisplayDisposer` keeps `world.ts` pixi-free at the import level. The renderer wires `fadeAndDestroy` at controller init; `consumeFuelOrFail` calls the registered hook (or falls back to instant destroy when no hook is registered, e.g. tests).
- **Per-cell-type level-badge offsets.** `cellLevelBadgeOffset(type)` aims for ~24 px from right edge, ~14 px below top edge across every cell shape. Centralised in `level-badge.ts`; `setup.ts` queries it per-cell at subscription time.
- **Text resolution boost.** `pencilText` bakes in `resolution: 2` so Text textures render at 2× and survive the camera's 4× zoom without pixelating. Memory cost is bounded: ~hundreds of Text nodes in a typical factory, each at 2× pixel area = ~4× per-text texture memory but still small in absolute terms.

**Deliverable achieved:** the canvas reads as a hand-arranged page that moves with the player. T-bots make automation visible (workers actually walk; you watch your factory). Pipes can be re-routed in place without delete-and-replace. The Inversion family closes the small-numbers economy — Subtraction's negatives and Division's tiny rationals finally have a productive role, powered by the new negative-fuel mechanic. The polish trio (consistency, micro-animations, typography) tightened every cell visual and gave block production a small visible exhale on every firing.

**Phase 5 remaining → folded into Phase 6.** The Literature tabs UI
(was 6.10), warehouse leveling (was 6.9), and the cultivator design
rethink all land inside Phase 6's slice list below. Deferred level
qualities (was 6.8) defer further, behind a separate cell-leveling
redesign. Prestige + Ancestral (6.3), ordinals + surreals (6.4),
named giants (6.5) queue *behind* Phase 6.

### Phase 6: Comprehension as Spine
**Goal:** elevate Comprehension from a niche manual-handling limiter
to the singular pacing axis of the economy. Production, transport,
storage, and automation all bend to it. Pipe progression collapses
into the Comprehension ladder. A new decomposer bot family handles
in-place reduction of uncomprehended blocks. Cultivators are rebuilt
as input-driven transformers under the universal rule. See
DESIGN.md §9 for the complete design spec.

This phase is large but unusually disciplined: the simulator does
the parameter discovery before any code lands. Each implementation
slice ends in a buildable state.

#### Phase 6.α — Design and simulation (no code)

| Slice | Content | Status |
|---|---|---|
| **α.1** | **Sim port.** Power-of-2 Comprehension ladder in `sim/catalog.ts`; universal magnitude check on lift/pipe/warehouse/T-bot wired into `steadyStateRate` and `bottleneckResource`; `compRequirement` enforced in `purchase`; agent's `pursueCompUpgrade` branch routes comp-gated production through comp tiers; pipe leveling dissolved (cell leveling preserved); decomposer-bot / T-bot / transformer-cultivator entries land as catalog stubs (production effects deferred to a later α.x). | ✅ done |
| **α.2** | **Sim tuning.** Four cost-curve iterations to land Tetration at 4h 44m (sim agent) and Pentation at 6h 38m — both within 5% of the ~5h / ~7h targets after accounting for real-player overhead. Levers swept: `compUpgradeCost(n)`, `pipeCost(n)`, multiplication / exponentiation / tetration / pentation costs. Pacing shape: one signature 3h Tetration cliff, one 1h 20m Pentation cliff, four mid-game 27–39 min operator gates, and 9 comp-tier intermediates ≤10 min each. | ✅ done |
| **α.3** | **Lock the catalog.** Added an `α.3 LOCK` header to `sim/catalog.ts` distinguishing locked sections (comp / pipe / operator costs, level ladders, recipes) from α.1 stubs (bot ladders, cultivator entries). Captured the locked unlock curve in `sim/PACING_LOCKED.md` and `sim/pacing-locked.csv` for reference. Code slices β–ζ port from the locked sections; the stubs unlock again when their simulator models land in a future α.x iteration. | ✅ done |

#### Phase 6.β — Comp engine and jam rule

| Slice | Content | Status |
|---|---|---|
| **β.1** | **Power-of-2 comp ladder.** New `comprehension` engine in `world.ts` (Decimal-valued cap). New Literature kind `comprehension-upgrade` auto-generates the next-tier entry; cost from sim catalog. Header readout updated to `Comp ≤ 2^N (= V)`. Save schema v15 with migration: existing v14 saves map their comp tier to the new ladder (round up to nearest 2^N). Baseline starts at Comp ≤ 2; first paid Literature entry after Successor is the upgrade to ≤ 4. | not started |
| **β.2** | **Universal comp check.** `valueComprehensible(v, comp)` in `value.ts`. Wired into manual lift (existing), pipe placement (new — gates by comp), pipe runtime accept (new), warehouse deposit + withdraw (new), T-bot pickup (new). Pipe-rating gate enforces strict one-tier lag (`pipe rating < comp`). | not started |
| **β.3** | **Cell-jam mechanic.** Output port back-pressure check extends to `valueComprehensible`. Stuck cells: pinned drag, dashed-red outline, `?`-block rendering via new tier in `pixi/value-label.ts`, one-shot marginalia per cell. Pipes attached to a stuck cell remain editable. Shift-click delete destroys cell and its `?`-block together. | not started |
| **β.4** | **Reveal events.** Subscribe to the `comprehension` store: on upgrade, walk all blocks, re-render those that just became comprehensible (small pencil-fill-in animation). Fire Gallery and Theorem hooks on reveal, not on production. | not started |

#### Phase 6.γ — Infrastructure re-rating

| Slice | Content | Status |
|---|---|---|
| **γ.1** | **Pipe catalog regenerated.** One Literature entry per power-of-2 magnitude tier, auto-generated from sim data. Unlock gated by comp. Per-placement cost from sim catalog (recursive bootstrap preserved). The existing `pipeLevels` reactive store and lvl I–V upgrade entries are removed. Save migration converts pipe-level state to plain magnitude tiers. | not started |
| **γ.2** | **T-bot catalog regenerated.** T-bot rating tracks the current comp ceiling. Per-bot rating field already exists in `botState`; pickup logic checks block magnitude against bot rating. Stockpile-priced Literature entries from sim catalog. | not started |
| **γ.3** | **Warehouse capacity scales with comp.** Capacity is a derived value: `baseCount * f(comp)`, with `f` geometric in comp tier per sim-tuned exponent. Visible in warehouse badge. Withdraw/deposit still gated by the universal comp rule. | not started |

#### Phase 6.δ — Decomposer bots

| Slice | Content | Status |
|---|---|---|
| **δ.1** | **Decomposer bot family.** New cell types: `factor-bot`, `decrement-bot`, `inversion-bot`. Each with independent magnitude rating. New `pixi/decomposer-bot.ts` visual variants (glyphs `F` / `D` / `1/x`). Tick logic: walk to nearest in-range loose block (regardless of player comp), apply transformation in place, leave outputs at the original position. Free fuel for F-bot / D-bot (matches static cell forms); I-bot inherits signed-fuel mechanic. | not started |
| **δ.2** | **Decomposer bot Literature catalog.** Stockpile-denominated costs from sim catalog. No comp prerequisite — the bot is *delegated comprehension*. First-encounter narrator marginalia per bot type. | not started |

#### Phase 6.ε — Cultivator rework

| Slice | Content | Status |
|---|---|---|
| **ε.1** | **Transformer cultivators.** Streaming variants (`cultivation-arithmetic` / `cultivation-geometric` / `cultivation-fibonacci`) reshaped to input-driven transformers. Each firing consumes one input, advances an internal `cultivationStep`, emits `f(input, step)` at the output port via the standard fire path. `tickCultivation` retired; cultivators flow through `fireCell` and `fireCellViaPipe` like any operator. Seed capture and the "one seed per cell" lifetime are gone — cultivators accept inputs normally, including via pipes. Per-step fuel cost deferred to a future sim-tuning iteration; the universal comp-jam (β.3) is the throttle today. Legacy `cell.seed` field retained on `PlacedCell` for save back-compat. Badge readout now shows `step N` instead of `seed: V`. | ✅ done |
| **ε.2** | **Missing cultivators land.** Three new transformer cells deferred from Phase 2 (DESIGN §6): `cultivation-harmonic` (f(x, n) = x · Hₙ₊₁), `cultivation-polynomial` (f(x, n) = x · (n+1)²), `cultivation-factorial` (f(x, n) = x · (n+1)!). Each its own Literature entry, formula in `cost.ts:cultivationEmit`, glyph (`a·Hₙ` / `a·n²` / `a·n!`) on the shared cultivation-cell renderer. Costs placeholder pending sim α.x tuning. | ✅ done |

#### Phase 6.ζ — Polish and save migration

| Slice | Content | Status |
|---|---|---|
| **ζ.1** | **Literature tabs UI** (carry-over from the deferred 6.10). With the new comp ladder + decomposer bots + transformer cultivators, the catalog will exceed 80 entries. Tabs: Operators / Comprehension / Pipes / Bots / Warehouses / Discovery / Theorems. Greyed-out locked entries become visible so the player sees the road ahead. | not started |
| **ζ.2** | **Save schema v15 polish.** Covers: new comp value (as `2^N`), removed pipeLevels, decomposer bot state, transformer cultivator state (`step` instead of `seed`), warehouse capacity tied to comp. Pre-v15 saves get a clean migration path. | not started |

**Architectural notes (Phase 6):**

- **Pipe leveling dissolves.** The `pipeLevels` reactive store and all level-related code paths for pipes go away in γ.1. Cell leveling stays in place at its current cap of 5; a separate redesign session revisits cell leveling on its own terms.
- **Decomposer bot exception, narrowly scoped.** `valueComprehensible(v, comp)` is the universal gate; only the bot tick for `factor-bot` / `decrement-bot` / `inversion-bot` bypasses it. Single exception, tightly contained.
- **Cultivator transformer pattern.** Each transformer cultivator carries a `formula(input, step)` and a `costFormula(step)` — both pure functions on the cell type. No per-cell tuning, no seed state. Step counter persists per-cell across saves.
- **Sim discipline.** All numeric tuning happens in `sim/catalog.ts`. The `src/lib/` slices consume from a locked data file; no hand-tuning post-port. Same pattern that closed the 6.6 retro.
- **No new visual primitives.** `?`-block reuses existing `pencilText` infrastructure; cell-jam reuses `JAM_TINT`; decomposer bots reuse the cleanup-bot visual chassis with new glyphs. Phase 6 is mechanically deep, visually conservative.

After Phase 6: cell-leveling redesign (its own session), prestige + Ancestral (was 6.3), ordinals + surreals (was 6.4), named giants (was 6.5).

---

### V2 — The Adversary  ← **active next phase**

The gameplay overhaul. A defensive-conflict spine on top of the factory:
an advancing front of **negative numbers** ("antinumbers") crawls toward a
defendable **Core**, and the player repels it with the numbers they
produce. The design driver is synergy, not addition — the "number-reducing"
operators (Subtraction, Division, Factor, Decrement, Negation, Inversion),
which all *cost* Total Score in construction and so go unused, become the
**weapon tree**. Full design in **DESIGN.md Part II**; combat-sim model in
**`sim/ADVERSARY.md`**.

Design decisions locked this session (from the planning Q&A):

- **Spatial model:** advancing front on the *existing* canvas (not a
  separate tower-defense strip), so combat and the factory share one space.
- **Stakes:** a Core with hit-points and a **recoverable setback** on
  collapse (erase a band + pause the wave) — real consequence, no run loss.
- **Onset:** the Adversary switches on when the player **unlocks
  Subtraction** — the first calm minutes stay a pure builder, and the tool
  that reveals negatives is the same tool that begins the fight.
- **Score model:** antinumbers live in their own registry, excluded from
  `recompute()`; only Negate-converted enemies count toward Total Score;
  two things subtract score — the setback (erases blocks) and feeding the
  V3 Shield (a positive committed to the army leaves the pool).

Sliced in dependency order. **Sim first**, per project discipline. Each
slice ends buildable + playtestable.

```
V2.0  Adversary sim model         (sim/ only — proves the loop is balanceable)
V2.1  Front + antinumber entity + Core HP + manual-throw defense
V2.2  Battery cells (add/divide/negate) + ammo from the pool + fuel ladder
V2.3  Wave scheduler + frontier scaling + the setback
V2.4  Boss-numbers (predicate encounters)
V2.5  Defense Literature branch + flavor/polish + save bump (defensive bots deferred)
V2.6  Prestige tie-in (optional, deferred)
```

| Slice | Content | Acceptance | Status |
|---|---|---|---|
| **V2.0** | **Adversary sim (no game code).** `sim/adversary.ts` — standalone combat-balance model layered on the locked pacing curve: threat/production both scale with the frontier (normalized units), a growth-vs-defense allocation agent, Core HP, bosses at every comp tier, the metrics (defense tax, survival margin, Core-HP trace, pacing stretch), a `--sweep` tax/pacing trade-off menu, and the `--no-adversary` regression guard. **Remaining:** fold the allocation into the main `simulator.ts` agent so the per-firing economy pays the tax. | Defense never fully starves growth; pacing holds within tolerance incl. the defense tax. **Met:** tax ~13%, 0 setbacks, bosses dent Core to ~16/40, ~1.15× stretch, regression reproduces locked curve. **Open call:** re-baseline §V2.8 pentation target to ~13h. | **model done; agent integration next** |
| **V2.1** | **Front + antinumber + Core.** New `src/lib/adversary.ts` registry + `tickAntinumbers()` added to the `pixi/setup.ts` ticker **before** `tickPipes`; screen-fixed `frontLayer` between `canvasLayer` and `river`; Core entity with HP (`src/lib/pixi/antinumber.ts` — red struck-through enemies + ℕ Core); manual **drag-a-positive-onto-an-antinumber** cancel (interaction.ts step 0, reuses `valueAdd`). Onset gated on `hasUnlock('subtraction')`. **Caveats:** magnitudes fixed small (frontier scaling = V2.3), setback stubbed (real band-erase = V2.3), antinumbers + Core HP in-memory only (persistence = V2.5). | Enemies spawn at the right edge, advance left, can be hand-cancelled, and damage the Core; setback stubbed; antinumbers never appear in Total Score. **Met** (type-check 0/0, build clean; visual playtest pending). | **done (pending playtest)** |
| **V2.2** | **Battery cells.** One portless `battery` CellType + `batteryMode` (add/divide/negate), threaded like the bot/ruleId pattern through `cell-types.ts` / `world.ts` / `interaction.ts` / `persistence.ts`. `adversary.ts:tickBatteries` fires the front-most antinumber on a cadence, pulling ammo from the pool via `spendFuel` (no wiring — the α.5 philosophy); negate spills the converted positive via `commitSpawn`. Three gated Literature entries (`requiresUnlock: 'subtraction'`). **Simplification:** batteries target the front-most enemy regardless of position (spatial range = later polish); ammo is pool-pull, not piped. | An automated line holds against a steady trickle with no manual input. | **done (pending playtest)** |
| **V2.3** | **Waves + scaling + setback.** Wave-burst scheduler (lulls punctuated by `WAVE_SIZE` bursts); antinumber magnitude + Core HP both scale with frontier tier (`comprehensionLevel`) so difficulty stays frontier-invariant, matching the sim. Real **setback** on Core collapse: erase the lowest-magnitude band of loose blocks (trophies survive) via `decreaseStack`, clear the Front, pause the wave, rebuild the Core. | Difficulty tracks progression; a lost Core is recoverable and the run continues. | **done (pending playtest)** |
| **V2.4** | **Boss-numbers.** Slow heavy arrivals on a timer, drawn larger + labeled; kind picked from `isPrime` / `KNOWN_PERFECTS` / `FAMOUS_NUMBERS` / powers of two, magnitude capped near Core HP. Prime bosses set `indivisible` so divide-batteries no-op (forcing a big Add). | A prime boss cannot be cheesed by Division alone; the arsenal stays relevant. | **done (pending playtest)** |
| **V2.5** | **Defense economy + polish + save.** Defense Literature branch (3 batteries + repeatable **Core fortification**, a new `'defense'` entry kind handled in `purchase()`); red-pen strike-through visuals + narrator beats; **save schema v18** persists Core HP + fortification with an additive v17→v18 migration (batteries persist as cells). **Deferred:** defensive bot variants; range/cadence/wall upgrades. | The full vertical loop is shoppable, persists across reload, and migrates cleanly from pre-V2 saves. | **done (pending playtest)** |
| **V2.6** | **Prestige tie-in (deferred).** Wire Core collapse as the optional prestige trigger; banks peak as an Ancestral Number. | Documented hook honored; no base-game permadeath. | deferred |

**Architectural notes (V2):**

- **Additive, not invasive.** The Adversary is a new layer (registry +
  tick + Pixi layer), reusing `value.ts` arithmetic, `operate()`, the fuel
  ladder, `spawn.ts`, pipes, and `bots.ts` wholesale. No rewrite of the
  factory — antinumbers are just negative `Value`s on a moving lane.
- **One score invariant.** `recompute()` is touched only to *keep ignoring*
  antinumbers; score sinks are the setback and (V3) feeding the Shield.
  Stated once in DESIGN §3 and enforced in code.
- **Sim discipline holds.** All combat tuning lands in `sim/adversary.ts`
  first; game costs are ported from locked numbers, never hand-tuned.
- **Onset gating.** The Adversary is unlocked by the Subtraction purchase,
  so the opening-60-seconds onboarding (DESIGN §18) is untouched.

---

### V3 — The Clash (prototype; `V3_PLAN.md`)

The combat overhaul's other half: the **army**. V2 shipped the artillery
(batteries pre-processing specific threats); V3 makes the *primary* defense
**your produced positives clashing with incoming negatives, 1:1 by
magnitude**. Sim-validated by `sim/throughput.ts` (army carries ~99.7% of
enemy count; functions stay throughput-capped spice) and `sim/weapons.ts`
(cost-tuning is fragile; difficulty is Comprehension-anchored).

| Slice | Content | Status |
|---|---|---|
| **V3.1** | **Shield + Rampart clash.** `adversary.ts` gains a `shield: Decimal` reservoir (the army), rendered on the Core; antinumbers clash with it at `RAMPART_X` before reaching Core HP at `IMPACT_X`. | **prototype done** |
| **V3.2** | **Feed paths.** Manual: a positive dropped near the Core feeds the Shield (`tryFeedShieldAt`). Automated: `batteryMode: 'feed'` (the **Rampart**) pulls pool blocks into the Shield via `consumePositiveBlock`; a Literature "Rampart" entry gated behind Subtraction. | **prototype done** |
| **V3.3** | **Threading + persistence.** `'feed'` added to the `batteryMode` unions; Shield persisted in the save. | **prototype done** |
| **V3.4** | **Tuning to the throughput model.** Wave/threat curves, feed cadence, Shield target. Deferred to a dedicated balancing pass (per design owner). | not started |

**Findings from the headless playthrough harness** (Playwright + DEV hooks,
very-early → exponentiation):

- **Numbers go up.** A real river→successor→warehouse factory produces a
  clean rising curve; mid-game with multiplication/exponentiation blocks the
  score reaches 5-figures.
- **Agency is strategic, not idle.** Side-by-side: a static "set-and-forget"
  defense (one Rampart, no production) **collapses** — the Shield depletes
  and the Core falls (a setback). Active investment (ongoing production + two
  Ramparts) **holds the line *and* grows the score**. You can't idle; you
  must keep production flowing and scale defense to the threat (the
  throughput war). Moment-to-moment is calm (Ramparts auto-feed); the agency
  lives in the build-out and spike response.
- **Two balance bugs found and fixed by running:** the auto-feeder drained
  the whole pool into a wastefully huge Shield (fixed with a
  frontier-proportional auto-feed cap; manual feed stays uncapped); and the
  Add battery overkilled tiny enemies the Shield would absorb (fixed by
  gating artillery to only engage threats that exceed the Shield — exactly
  the army/artillery split `sim/throughput.ts` prescribes). Also fixed: a
  Core-collapse crash in the setback loop, caught only by actually running.

---

### V4 — The Set-Theoretic Foundations (core built; `V4_PLAN.md`)

**Built & run-verified (this batch):** a `'set'` Value variant + `sets.ts`
(pure ∪ ∩ \ △, power set, cardinality, singleton, unfold) + 8 cells
(`singleton`/`count`/`unfold`/`powerset`/`set-union`/`-intersect`/`-diff`/
`-symdiff`) + set-block rendering + Literature gating + persistence. The Set
layer is *logic* (magnitude 0 → no score); Comprehension gates cardinality.
Capstone test: `Count(Union(Unfold(n), Singleton(n))) = n+1` — successor from
set primitives. **Not yet built:** predicate-sets/Separation (V4.3), guided
derivations + ×/^ (V4.4), Dedekind cuts (V4.5), ordinals (V4.6).


A creative-but-careful plan to ground the game in set theory — which it
already half-is (river = ∅, von Neumann successor, warehouses = collections,
Filter = Separation, the literally-named **Comprehension** spine). Mostly a
reframe + a thin logic layer + a few cells, built on existing infrastructure.
Sliced V4.0 (the Set object + Count) → V4.1 (set algebra ∪ ∩ \ △, the AND/OR)
→ V4.2 (power set + the Cantor production loop) → V4.3 (predicate-sets +
Separation, the Comprehension pun) → V4.4 (numbers-are-sets: Unfold +
constructive operators via Blueprints) → V4.5 (number-system constructions;
irrationals as Dedekind cuts) → V4.6 (transfinite: ω + ordinals, merges the
deferred ordinals/surreals). Key integration rule: the Set layer is *logic*,
the number layer is *wealth* — magnitude crosses only via Count/Unfold, so
score-conservation is untouched. Full design, per-slice fun/risk analysis,
and the no-homework guardrail in **V4_PLAN.md**.

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

### Pacing simulator (`sim/`)
- A standalone Node CLI that walks an optimal-play agent through the
  Literature roadmap and reports time-to-each-unlock. Lives in `sim/`,
  runs with `node sim/run.ts` (Node 22.6+ native TS support, no
  install needed).
- **Single source of truth for pacing numbers.** `sim/catalog.ts`
  mirrors `src/lib/literature.ts` and `src/lib/cost.ts`. When changing
  a Literature cost, edit `sim/catalog.ts` first, run the sim to see
  the curve shift, then port the locked numbers to `src/lib/`.
- Models leveling, the river-tap quality, and mult/exp fuel-discount
  qualities. The agent automatically chooses between cloning and
  upgrading based on ROI.
- Use `--csv pacing.csv` for spreadsheet analysis, `--verbose` for the
  per-purchase event trace, `--to <id>` to stop at a specific roadmap
  entry.
- See `sim/README.md` for the full usage notes and current model
  limitations.

---

## 4. Open decisions

Deliberately uncommitted, to be settled by playtesting or experimentation:

- **Save format and migration strategy** — JSON schema design, versioning approach
- **Final pacing curves** — Literature costs, Comprehension tier requirements, throughput upgrade prices. All empirical.
- **Mobile support** — desktop-first; mobile is a re-skin question deferred to post-Phase 3.
- **Computational cost balance** — only known after playtesting Phase 2
- **Gallery scope** — how many special-number categories? Capped or open-ended?
- ~~Cultivation cells need a fundamental rethink.~~ Resolved by the Phase 6 Comprehension Spine rework. Cultivators become input-driven transformer cells under the universal Comprehension rule. See DESIGN.md §6 *Cultivation Cells* and §9 *Comprehension — Spine of the Economy*; implementation in slices ε.1–ε.2.

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
