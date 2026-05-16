# Pacing Simulator — Phase 6 (Comprehension as Spine)

A standalone simulator for **Numbers Go Big!** that walks an
"optimal-play" agent through the Literature roadmap and reports
time-to-each-unlock in ticks (1 tick = 1 second of play).

The simulator's purpose is to make pacing iterable: edit costs in
`catalog.ts`, re-run, and see the impact on the unlock curve without
playtesting every change.

**Status:** Phase 6 model ported and locked at α.3 (2026-05-16);
game code β.1–ζ.2 shipped. The α.3 lock predates three mechanics
that now exist in game code:
  - Decomposer bots (F-bot / D-bot / I-bot) — independent magnitude
    rating, can act on uncomprehended blocks.
  - Transformer cultivators — input-driven, step-counter, per-step
    transform formula.
  - Dynamic warehouse capacity — scales geometrically with comp tier.

The next sim work — α.x extension — needs to model these and
re-sweep the cost curve. Until then, the α.3 numbers remain the
design-level target; the game runs on the ported values without
further tuning.

## Running

Requires Node 22.6+ (native TypeScript support). The project is on
Node 24.

```bash
node sim/run.ts                       # default roadmap, console output
node sim/run.ts --verbose             # also print every purchase event
node sim/run.ts --csv pacing.csv      # write a spreadsheet-friendly CSV
node sim/run.ts --to multiplication   # stop at a specific roadmap entry
node sim/run.ts --max-ticks 50000     # cap simulation runtime
```

## Phase 6 model — what's new

The Phase 6 rework elevates Comprehension from a niche manual-handling
limiter to the **singular pacing axis** of the economy. The simulator
reflects this:

- **Comprehension ladder is power-of-2.** `comp_1` (≤2) through
  `comp_30` (≤2^30 ≈ 1.07B), generated programmatically. Cost curve
  is parameterized (in `compUpgradeCost(n)`) and α.2 sweeps it.
- **Comprehension baseline is 2.** The world starts at Comp ≤ 2
  (zeros and ones only). The first paid Literature entry after
  Successor is the upgrade to ≤ 4 — teaches the mechanic
  immediately.
- **Universal magnitude gate.** Producing value V requires comp ≥ V
  *and* every intermediate in the recipe DAG must also be ≤ comp.
  `steadyStateRate(world, V)` returns 0 if the path is gated.
  `bottleneckResource(world, V)` returns `'comprehension'` in that
  case, which routes the agent to the next comp upgrade.
- **Pipes lag comp by one tier (strict).** A pipe rated ≤ 2^N has
  `compRequirement = 2^(N+1)`. The agent can't buy a pipe until comp
  climbs above it.
- **Pipe leveling dissolved.** The pipe-level upgrade entries
  (`pipe_X_lvl2..5`) are gone. Throughput from pipes = count × 1 per
  tick; players acquire throughput via parallel placement (Quantity,
  not Level). The `LEVEL_LADDERS` array now contains only cell-level
  upgrades.
- **Bot entries (stubs).** `tbot_N`, `fbot_N`, `dbot_N`, `ibot_N`
  generators produce one Literature entry per power-of-2 rating
  tier. T-bots carry `compRequirement` (capped at comp); decomposer
  bots have no comp prerequisite (delegated comprehension). α.1
  models the entries in the catalog but not the tick-time effects —
  α.2 wires those up (T-bots as frontier throughput; decomposer
  bots as jam-clearing paths).
- **Transformer cultivator entries (stubs).** Six cultivator types
  in the catalog (arithmetic / geometric / fibonacci / harmonic /
  polynomial / factorial). The per-step transformer model lands in
  α.2 once we know which curve shape each one wants.

## What it models

- **Currencies** as pools keyed by integer value (1, 2, 3, …, 10,
  100, …).
- **Cells** counted per type — not individual placements.
- **Pipes** counted per magnitude rating — assumed routed wherever
  useful.
- **Cell levels** — per-type, max 5. Throughput multiplier `2^(L-1)`
  per level. The agent picks between cloning and upgrading based on
  ROI.
- **Qualities** wired up where they affect throughput:
  - Successor lvl 3+ **river-tap**: zero supply matches successor
    throughput when ≥1 cell is owned (no pipe ≤1 needed)
  - Mult/Exp lvl 3+: **fuel −1** (min 1), then **halved at lvl 5**
- **Comprehension gating** — universal rule per DESIGN.md §9.
- **Production rates** as continuous flow with a resource-cost-vector
  model: `rate(target) = min over cell types of (count ×
  level_multiplier / cost_per_output)`. Handles input sharing across
  recipes.
- **Fuel** consumed from the loose pool at the cheapest denomination
  ≥ the cost magnitude. Level-adjusted fuel cost shows up in the
  resource vector.
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

- `compUpgradeCost(n)` — the cost curve for the power-of-2
  comprehension ladder. **The most important tuning surface in Phase 6.**
  α.2 sweeps this against the ~5h speedrun / ~10h casual target.
- `pipeCost(n)` — per-magnitude pipe placement cost. Preserves the
  recursive-bootstrap economy.
- `OPERATOR_AND_CELL_ENTRIES` — operator costs (successor, addition,
  …, pentation). Hand-curated, placeholder values.
- `CULTIVATOR_ENTRIES` — transformer cultivator costs. Placeholder
  until α.2 models their production.
- `LEVEL_LADDERS` — per-level upgrade costs and qualities for each
  leveled cell. Cell-only in Phase 6 (pipes don't level).
- `RECIPES` — what each value is made from. Changing
  `recipe(10, 'multiplication', [2, 5])` to
  `recipe(10, 'addition', [5, 5])` changes which currency is the
  production bottleneck.
- `costTier` and `computationalCost` — fuel coefficients. Mirror of
  `src/lib/cost.ts`.
- `MANUAL_PICKUP_RATE_PER_TICK` — the slow opening (no-pipe) rate.

**When you finalize a tuning change in α.3, port it to the game
source files.** Edit the sim first, run, iterate, then mirror the
locked numbers to `src/lib/literature.ts` (and `src/lib/cost.ts` if
cost formulas changed). The simulator's catalog is a working copy,
not the canonical version.

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
  current goal. A real player might explore more sideways purchases
  (Decrement, Factor, Square Root) that don't accelerate the main
  line.
- **Continuous-rate model** is over-optimistic for very-small cell
  counts. With 1 successor and 1 pipe ≤1, the discrete game produces
  ~1 one per second; the sim says exactly 1.0/tick. Close enough for
  pacing.
- **Predicate costs are not modeled.** Theorems demanding "10 primes"
  or "5 primes ≥ 100" require Filter routing the agent doesn't
  simulate. Those entries are skipped if present in the roadmap.
- **Transformer cultivator production not yet modeled** (α.2).
- **Decomposer-bot jam-clearing not yet modeled** (α.2). When a
  value would be unblocked by a decomposer bot rather than a comp
  upgrade, the sim currently picks comp — which is a reasonable but
  not necessarily optimal default.
- **Sim/game model divergence on cell-level interaction with pipes.**
  The sim uses `rate = min(cell_supply, pipe_supply, …)`; the game
  multiplies cell-level output count and pipe count independently.
  For balanced factories the two models agree; for unbalanced
  layouts the game may run faster than the sim predicts.

## Slice α timeline

- **α.1** (this commit) — Phase 6 model ported. Runs end-to-end.
  Placeholder costs.
- **α.2** — Sim tuning. Sweep `compUpgradeCost`, `pipeCost`,
  operator/cultivator costs, decomposer-bot ratings. Model
  transformer cultivator production and decomposer-bot
  jam-clearing. Target: ~5h speedrun / ~10h casual to Tetration.
- **α.3** — Lock the catalog. Produce a frozen data file for code
  slices β–ζ to consume directly.
