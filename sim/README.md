# Pacing Simulator

A standalone simulator for **Numbers Go Big!** that walks a "optimal-play"
agent through the Literature roadmap and reports time-to-each-unlock in
ticks (1 tick = 1 second of play).

The simulator's purpose is to make pacing iterable: edit costs in
`catalog.ts`, re-run, and see the impact on the unlock curve without
playtesting every change.

## Running

Requires Node 22.6+ (native TypeScript support). The project is on Node 24.

```bash
node sim/run.ts                       # default roadmap, console output
node sim/run.ts --verbose             # also print every purchase event
node sim/run.ts --csv pacing.csv      # write a spreadsheet-friendly CSV
node sim/run.ts --to multiplication   # stop at a specific roadmap entry
node sim/run.ts --max-ticks 50000     # cap simulation runtime
```

## What it models

- **Currencies** as pools keyed by integer value (1, 2, 3, …, 10, 100, …).
- **Cells** counted per type (3 successors, 1 adder, …) — not individual
  placements.
- **Pipes** counted per magnitude rating — assumed routed wherever useful.
- **Cell levels and pipe levels** (Slice 6.7) — per-type and per-magnitude
  global level (max 5). Throughput multiplier `2^(level-1)` per level.
  The agent automatically picks between cloning and upgrading based on
  ROI for the current bottleneck.
- **Qualities** wired up where they affect throughput:
  - Successor lvl 3+ **river-tap**: zero supply matches successor
    throughput when ≥1 cell is owned (no pipe ≤1 needed)
  - Mult/Exp lvl 3+: **fuel −1** (min 1), then **halved at lvl 5**
- **Production rates** as continuous flow with a resource-cost-vector
  model: `rate(target) = min over cell types of (count × level_multiplier
  / cost_per_output)`. Handles input sharing across recipes.
- **Fuel** consumed from the loose pool at the cheapest denomination ≥ the
  cost magnitude. Level-adjusted fuel cost shows up in the resource vector.
- **Geometric repurchase scaling** (default ×1.6 per copy) — matches the
  game's Literature cost-scale.

## What it doesn't model

- **Manual play / casual idle time.** The agent is a speedrunner.
- **Cultivation cells.** They emit on a cadence with self-throttling fuel
  cost — a separate sub-model. Listed in `catalog.ts` but not on the
  default roadmap.
- **Theorems** (the milestone narrator beats with no mechanical payoff).
- **Filters, warehouses, blueprints.** Layout-shaped concerns the
  throughput model doesn't need.
- **Pipe placement.** Pipes are assumed to exist between any two
  connected cells.
- **Variadic Knuth arrow.** Its cost is runtime-parametric on the arrows
  input; hard to fold into a static-recipe model.

## Tuning surface

`catalog.ts` is the primary tuning file:

- `LITERATURE` — costs, scaling, kind of each entry. Mirror of
  `src/lib/literature.ts`. Edit a `count` to retune a gate.
- `LEVEL_LADDERS` — per-level upgrade costs and qualities for each
  leveled cell and pipe. Mirror of the `kind: 'level'` entries in
  `src/lib/literature.ts`. Tune top-of-ladder costs upward to make
  max-level aspirational.
- `RECIPES` — what each value is made from. Changing
  `recipe(10, 'multiplication', [2, 5])` to `recipe(10, 'addition', [5, 5])`
  changes which currency is the production bottleneck.
- `costTier` and `computationalCost` — fuel coefficients. Mirror of
  `src/lib/cost.ts`. Cranking tier numbers makes operators self-throttle
  harder.
- `MANUAL_PICKUP_RATE_PER_TICK` — the slow opening (no-pipe) rate.

**When you finalize a tuning change, port it to the game source files.**
Edit the sim first, run, iterate, then mirror the locked numbers to
`src/lib/literature.ts` (and `src/lib/cost.ts` if cost formulas changed).
The simulator's catalog is a working copy, not the canonical version.

## Output

A typical run prints four sections:

1. **Unlock pacing** — table of `tick | time | gap | unlock`.
2. **Infrastructure built** — final counts of each cell and pipe.
3. **Pacing analysis** — largest and smallest gaps, mean-gap baseline,
   and a flag if the largest gap is >5× the mean (likely a cliff).
4. **Final pool** — remaining currency at end of run.

With `--csv`, columns are `tick, time, gap_ticks, unlock`.

## Limitations to be aware of

- The agent is **greedy and goal-directed** — it follows a fixed roadmap
  and buys infrastructure only when bottlenecked on the current goal.
  A real player might explore more sideways purchases (Decrement, Factor,
  Square Root) that don't accelerate the main line.
- **Continuous-rate model** is over-optimistic for very-small cell counts.
  With 1 successor and 1 pipe ≤1, the discrete game produces ~1 one per
  second; the sim says exactly 1.0/tick. Close enough for pacing.
- **Predicate costs are not modeled.** Theorems demanding "10 primes" or
  "5 primes ≥ 100" require Filter routing the agent doesn't simulate.
  Those entries are skipped if present in the roadmap.
- **Cultivation cells** mostly aren't modeled. Only
  `cultivation-arithmetic` is on the default roadmap as a Stage D gate —
  not as a production source. Cadence-based emission with per-emission
  fuel cost is a different rate shape.
- **Sim/game model divergence on cell-level interaction with pipes.** The
  sim uses `rate = min(cell_supply, pipe_supply, …)`; the game
  multiplies cell-level output count and pipe-level cooldown speed
  independently. For balanced (cell-lvl = pipe-lvl) factories the two
  models agree; for unbalanced layouts the game runs faster than the
  sim predicts. Real playtest will say whether this needs reconciling.
