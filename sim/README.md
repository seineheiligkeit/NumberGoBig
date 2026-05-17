# Pacing Simulator — Phase 6 + α.5c (Ladder Rule)

A standalone simulator for **Numbers Go Big!** that walks an
"optimal-play" agent through the Literature roadmap and reports
time-to-each-unlock in ticks (1 tick = 1 second of play).

The simulator's purpose is to make pacing iterable: edit costs in
`catalog.ts`, re-run, and see the impact on the unlock curve without
playtesting every change.

**Status (α.5c lock):** full ladder rule modelled end-to-end —
per-firing ladder, unlock-cost ladders, comp milestone puzzles,
multi-currency comp tiers, predicate stocks (prime/negative/
irrational), warehouse capacity scaling. Game code matches: see
`src/lib/cost.ts:fuelLadder`, `src/lib/world.ts:consumeFuelLadder`,
`src/lib/literature.ts:ladderUnlockCost`. Save schema v17.

**Locked pacing:** Tetration **4h 10m**, Pentation **11h 48m** (sim
agent). Real-player ~10% slower. See `PACING_LOCKED.md` for the
full unlock table.

## Two tools

- **`run.ts`** — the core simulator. Prints unlock pacing + the basic
  bottleneck/cliff analysis. Use for quick "did my edit shift the
  curve?" runs.
- **`analyze.ts`** — the richer metric tool. Adds per-value
  consumption-vs-production flow, bottleneck distribution over the
  run, focus-time distribution, and pool snapshots at every unlock
  event. Use when investigating "where is the agent actually
  spending time" or "is this value the binding constraint."

## Running

Requires Node 22.6+ (native TypeScript support). The project is on
Node 24.

```bash
node sim/run.ts                       # default roadmap, console output
node sim/run.ts --verbose             # print every purchase event
node sim/run.ts --csv pacing.csv      # spreadsheet-friendly CSV
node sim/run.ts --to multiplication   # stop at a specific roadmap entry
node sim/run.ts --max-ticks 50000     # cap simulation runtime

node sim/analyze.ts                   # richer metric report
node sim/analyze.ts --to tetration    # truncated analyze
node sim/analyze.ts --csv-cons f.csv  # consumption CSV
```

## α.5c model — Ladder Rule

The Ladder Rule replaces magnitude-scaled single-block fuel with a
**structured pyramid of small numbers per firing.** See `DESIGN.md §6`
for the full design rationale. Sim implementation:

- **`ladderPosition(type)`** — hierarchy L per cell type. Successor 0,
  Add 1, Mult 2, Exp 3, Tet 4, Pent 5. Variadic-arrow is dynamic
  (its L = arrows-input value).
- **`ladderFor(type, maxInput)`** — returns `Map<value, count>`. At
  position L, demands `2^(L-k)` of value k for k=0..L, scaled by
  `⌈log₁₀(max input)⌉`.
- **`ladderUnlockCost(L, M)`** — unlock-cost ladder (operator/comp
  unlocks follow the same pattern but with per-entry M multiplier).
- **`compUpgradeCost(n)`** — every comp tier follows the ladder
  pattern + adds a `1 × 2^(N-1)` milestone puzzle.
- **Operator construction puzzles** — multiplication demands 1 × 10,
  exp/div/inv/sqrt demand 1 × 100, tetration demands 1 × 1024,
  pentation demands 1 × 1,000,000. Modeled as standard value cost
  items.
- **Predicate stocks** — `world.predicateStocks` tracks per-predicate
  counters (prime/negative/irrational), grown by specific cell-type
  firings: factor → primes, subtraction/negation → negatives,
  square-root → irrationals.
- **Warehouses as bought resource** — per-value warehouse Literature
  entries; pool capped at `LOOSE_POOL_TOLERANCE + warehouses × warehouseCapacity(comp)`.
- **River-tap removed.** Zero supply = `pipe_0` throughput only.

## What the agent does NOT model

- T-bots as frontier-band throughput (catalog stubs only).
- Decomposer bots as a jam-clearing alternative to comp upgrade.
- Cultivators as a production path (catalog stubs; agent doesn't
  pick them because they're economically dominated by base
  operators for round-magnitude values).
- Specific manual UX (drag-drop placement, pipe wiring time, etc.).
  Agent assumes instantaneous placement.

## Production model

- **Currencies** as pools keyed by integer value (0, 1, 2, ..., 10,
  100, 1024, 16384, ...). Caps from warehouse capacity.
- **Cells** counted per type. **Cell levels** — per-type, max 5.
  Throughput multiplier `2^(L-1)`. Agent picks between cloning and
  upgrading based on ROI.
- **Production rates** as continuous flow with a resource-cost-vector
  model: `rate(target) = min over (cells, zero supply, predicate
  producers) of (supply / cost_per_output)`.
- **Comprehension gate** — value V production requires comp ≥ V *and*
  every intermediate in the recipe DAG must also be ≤ comp.
- **Pipes lag comp by one tier (strict)** — pipe ≤2^N requires
  comp ≥ 2^(N+1).
- **Geometric repurchase scaling** (default ×1.6 per copy) — matches
  the game's Literature cost-scale.

## What it doesn't model (yet)

- **Manual play / casual idle time.** The agent is a speedrunner.
- **T-bots as throughput.** They're catalog stubs in α.1. α.2 will
  model them as additional throughput at the current frontier band
  ([2^(N-1), 2^N] when comp = 2^N), where pipes can't yet reach.
- **Decomposer bots as jam-clearing.** Stubs in α.1. The decision-
  tree question α.2 must answer: when comp gates a needed value, is
  it better to buy a comp upgrade or deploy a decomposer bot that
  can act above comp? Both reduce the time-to-affordability; α.2
  picks the right ROI.
- **Transformer cultivators.** Stubs in α.1. α.2 models the per-
  step input → output mapping and the escalating fuel cost.
- **Theorems** (the milestone narrator beats with no mechanical
  payoff).
- **Filters, warehouses (as discrete cells), blueprints.** Layout-
  shaped concerns the throughput model doesn't need.
- **Variadic Knuth arrow.** Its cost is runtime-parametric on the
  arrows input; hard to fold into a static-recipe model.
- **Reveal events on comp upgrades.** Not pacing-relevant — they
  affect Gallery / Theorem narrator beats, not production rate.
- **Cell-jam visualization.** The cell-jam mechanic is captured in
  the production rate (rate = 0 when comp-gated); whether the cell
  pins in place is a UX concern the sim doesn't render.

## Tuning surface

`catalog.ts` is the primary tuning file:

- **`ladderUnlockCost(L, M)`** — every operator unlock. Per-entry M
  values are the main lever for unlock pacing.
- **`compUpgradeCost(n)`** — comp ladder. Depth `L = min(3, floor(n/3))`,
  multiplier M(n) geometric early then linear past tier 10. Adds
  the `1 × 2^(N-1)` puzzle for n ≥ 2.
- **`fuelLadder` shape (in `ladderPosition` mapping)** — the L value
  per cell type controls per-firing ladder depth.
- **`pipeCost(n)`** — pipe placement cost. Preserves the recursive-
  bootstrap economy.
- **`RECIPES`** — what each value is made from. Changing the canonical
  recipe shifts which currency is the production bottleneck.
- **`MANUAL_PICKUP_RATE_PER_TICK`** — slow opening (no-pipe) rate.
- **`LOOSE_POOL_TOLERANCE` (simulator.ts)** — loose-pile clutter
  tolerance before warehouses bind.
- **`WAREHOUSE_BASE_CAPACITY` (simulator.ts)** — comp-scaled storage
  per warehouse.

**When you finalize a tuning change, port it to the game source
files.** Edit the sim first, run analyze, iterate, then mirror the
locked numbers to `src/lib/literature.ts` (and `src/lib/cost.ts` if
the ladder formula changes). The simulator's catalog is a working
copy, not the canonical version.

## Output

A typical run prints four sections:

1. **Unlock pacing** — table of `tick | time | gap | unlock`.
2. **Infrastructure built** — final counts of each cell and pipe,
   plus final comp ceiling.
3. **Pacing analysis** — largest and smallest gaps, mean-gap
   baseline, and a flag if the largest gap is >5× the mean (likely a
   cliff).
4. **Final pool** — remaining currency at end of run.

With `--csv`, columns are `tick, time, gap_ticks, unlock`.

**Note on unlock ordering.** The comp-bottleneck branch in `decide()`
can cause the agent to buy comp upgrades out of strict roadmap order
when production of a needed value is gated. This shows up in the
unlock table as a negative gap (a later-in-roadmap entry recorded at
an earlier tick than the entry above it). Informative — it tells you
which comp tier the agent needed to climb to unblock a goal — but a
cosmetic wart.

## Limitations to be aware of

- The agent is **greedy and goal-directed** — it follows a fixed
  roadmap and buys infrastructure only when bottlenecked on the
  current goal. A real player might explore more sideways purchases.
- **Continuous-rate model** is over-optimistic for very-small cell
  counts. Real opening minutes are ~10–15% slower than the sim claims.
- **Predicate costs use abstract counters** — `predicateStocks` grow
  via specific cell-type firings, decoupled from value pools. Sim
  slightly overestimates predicate-cost difficulty because it doesn't
  share pool currency.
- **Cultivators / decomposer bots / T-bots** are catalog-only — they
  don't affect sim pacing because they're economically dominated by
  base operators in the speedrun model.
- **Sim/game divergence on cell-level interaction with pipes.**
  Sim uses `rate = min(cell_supply, pipe_supply, …)`; game multiplies
  cell-level output count and pipe count independently. For balanced
  factories the two models agree; for unbalanced layouts the game
  may run faster.

## Slice α timeline

- **α.1** — Phase 6 model ported. Runs end-to-end. Placeholder costs.
- **α.2** — Sim tuning. Sweep cost levers.
- **α.3** — Lock catalog. Frozen data for code slices β–ζ to consume.
- **α.4** — Reverse-ported game numbers into sim. Added warehouses as
  bought infrastructure, predicate-cost demands (prime/negative/
  irrational), multi-currency comp ladder. Tuned to ~5h Tet / ~7h Pent.
- **α.5** — **Ladder Rule shipped end-to-end.** Per-firing ladder of
  small numbers replaces single-block fuel. Unlock-cost ladders.
  Comp milestone puzzles (1 × 2^(N-1) per tier). Operator construction
  puzzles. River-tap removed. Fuel ports dropped from non-inversion
  cells. Ported to game (literature.ts + cost.ts + fire paths +
  cell shapes + save migration v17). Locked at **~5h Tet / ~12h Pent**
  — Pent grew with the per-tier comp puzzle layer.
