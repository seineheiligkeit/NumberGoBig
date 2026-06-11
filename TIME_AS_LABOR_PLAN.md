# *Time as Labor* — implementation plan

Execution plan for the `time-as-labor` prototype branch. Design north star:
[`TIME_AS_LABOR.md`](./TIME_AS_LABOR.md). Working method is unchanged from the
main project: **small slices, each ending in a buildable + playtestable state**
(`npm run build` clean, `npm run check` 0/0), validate by playing before
extending.

> **Strategy: strip, then rebuild the core, reusing the chassis.** We keep the
> hard-won infrastructure — Pixi rendering, the pencil aesthetic, the
> pan/zoom canvas, the drag/interaction layer, the `Value` union + Decimal, the
> world registries, persistence plumbing — and replace only the *economic core*
> (the fuel ladder + comprehension gate) with the time model. We do **not**
> rewrite the renderer or the canvas. We do delete or disable everything in the
> "deferred" list of the design doc.

> **Architecture decision (taken during build): pure engine + thin view.**
> Per the audit (the 1542-line `world/index.ts` god module mixes simulation
> with Svelte stores and Pixi hooks; pure `core/` is "the highest-leverage,
> lowest-cost" thing to test), the new game's logic lives in a **pure, headless,
> fully-tested simulation engine** — `core/engine.ts` over `core/time.ts` — with
> **no Pixi/Svelte/DOM**. It *is* the simulation: tickable, deterministic,
> `node --test`-able, sim-drivable (`sim/time-run.ts`). The renderer becomes a
> thin **view** that holds a `World`, ticks it, and draws it. This means the old
> `world/index.ts` is **retired wholesale** rather than surgically de-tangled
> — lower risk, and it gives us a model we can fully reason about and test.
>
> **Test stack:** `npm test` → `node --test 'core/**/*.test.ts'` (native TS,
> **zero new dependencies** — same path the sim already uses). Test files are
> excluded from `svelte-check` so app code stays free of `node:` builtins.

### Progress log

- ✅ **Test infrastructure** — `npm test` (node --test, dependency-free).
- ✅ **`core/time.ts`** — the cost math (Phases 1.1 / 2.1 / 4.1), 13 tests.
- ✅ **`core/engine.ts`** — the pure headless engine: build time, op time,
  fuel acceleration, transport time×distance, loose pool, Total Score. This
  is the **logic of Phases 1–4**, fully tested (15 engine tests, 28 total).
- ✅ **`sim/time-run.ts`** — headless pacing instrument (the time-model
  analogue of `sim/run.ts`). Already shows the economy behaves sensibly: a
  static under-supplied factory grows ~linearly; the exponential climb needs
  active build-out + a wider successor farm (as designed).
- ✅ **View slice A — the model on screen.** `src/lib/view/game-view.ts` is a
  thin Pixi renderer + interaction over the engine (reusing paper / river /
  camera / value-label / pencil): place cells from a toolbar (they **sketch in**
  over build time), Successors tap the river and pencil out `1`s into a
  positioned pool, **drag loose blocks** onto operand ports to feed operators or
  onto the fuel socket of a working cell to burn them, operations **pencil in**
  their result with a progress meter, live Total Score. `main.ts`/`App.svelte`
  rewired to the new view; the old `src/` layers are now **dormant**
  (unreferenced — Vite no longer bundles them) pending deletion in a cleanup
  slice. check 0/0, build clean.
  - *Runtime/visual verification is by play session* (`npm run dev`) — rendering
    isn't unit-testable; a Playwright headless smoke test is a candidate
    follow-up.
- ✅ **Playwright harness + DEV hooks** — `npm run test:e2e` drives the real
  game headlessly (env's Chromium + software WebGL). Caught a real crash-on-load
  the type-check missed. `window.__nbg` is the inspection seam.
- ✅ **View slice B — pipes + transport distance.** Two-click pipe tool; pencil
  pipe lines with a block that **slides** along as transit progresses
  (magnitude × distance). The canvas is now a map.
- ✅ **Phase 0 deletion pass.** Removed all dormant layers: the old `src/`
  (adversary, sets, comprehension, world, interaction, persistence, bots,
  cultivation, blueprints, filters, the old pipe/UI/dev presets), the obsolete
  `sim/` (ladder/comprehension model), and the now-unreferenced `core/`
  (catalog, classify, warehouse-rules, cost, sets, cell-geometry). `cell-types`
  slimmed to the 6 constructive operators. **Core is now just `value`, `time`,
  `engine`, `cell-types`** (+ tests). 810→807 files; check 0/0, 28 unit + 4 e2e
  green, build clean.
  - *Note:* `value.ts` keeps the full number union (rational/irrational/complex/
    set) intact — the families return later per design, and it's pure + working.
- ✅ **First tuning pass.** Rebuilt `sim/time-run.ts` into a tuning report
  (build ladder, operation-duration ladder base-vs-fuelled, driven bootstrap).
  Read it and set an aggressive-leaning `DEFAULT_TUNING`: `opWork = 2·d^1.5`
  (super-linear so big numbers are slow to write), `build = 16·1.5^n`. Result:
  a `1` ≈ 2 ticks, `10^6` ≈ 37s base / ~1s fuelled, `10^100` ≈ **34m base /
  40s fuelled** — the pressure→relief lever is real. Pinned the intended feel
  as **pacing-guard tests** (snappy opening, snappy small ops, googol >100× the
  work of 100, fuel collapses a heavy op 10×) so future tuning stays bounded.
- ✅ **Converged fuel economy + the reprocessing layer.** value-fuel (conserved),
  per-operator labor exponents, fuel grades (tiers chain), super-linear transit
  (big blocks freeze), the **Mill** (additive splitter → graded fuel) and the
  **pipe-accelerator** (fueled beacon; big numbers as local power cells). See
  TIME_AS_LABOR.md "The fuel economy".
- ✅ **Cell dragging** (layout) + `moveCell` hook; pipes follow.
- ✅ **Optimal-play agent** (`sim/agent.ts`) — a competent heuristic climber
  (direct-feed = free logistics) that isolates the *production* economy. It
  **climbs exponentially** (10³ @2m, a 10³→10⁶ build-out cliff ~26m, then
  acceleration to 10¹⁸ @1.7h) — confirming the economy is sound and giving us a
  legible pacing instrument. Transport friction is the layer the player adds.
- ✅ **Logistics-aware pacing tool** (`sim/logistics.ts`) — builds a real piped
  factory (fuel plant → k pipes ± accelerator → fuel-gated builder) and measures
  throughput vs distance/parallelism/accelerators. Confirms transport is a real,
  tunable constraint with working player levers: a far builder **starves** on one
  pipe (distance 2000 → 37% throughput), and **parallel pipes** (→75%) and
  **accelerators** (→100%) recover it. The supply-line decisions matter.
- ✅ **Fully faithful factory agent** (`sim/factory-agent.ts`) — auto-builds and
  runs a *fully piped* factory (operands AND fuel through real pipes), logs
  every action, and reports the build timeline, factory size, action count, and
  climb. It surfaced two real findings:
  1. **Engine fix:** emit picked the *first empty pipe*, so feeding both operand
     ports of one consumer starved port 1 → the multiplication never fired and
     everything spilled loose. Replaced with **fair round-robin emit** (a
     per-cell cursor); now fan-out works (pinned by a test). With it, the
     squaring chain climbs 2→4→16→256→**65,536**.
  2. **A naive squaring chain plateaus** (~65,536 here, 15 cells / 21 pipes /
     37 actions, score 7.6e6 in ~3h) because each squaring stage is 2-in/1-out
     (throughput **halves per stage**) AND the top stage hits the **fuel-grade
     wall** (needs refined fuel, not 1s). Climbing higher demands a *wider*
     factory (parallel feed) + real fuel refinement — the intended engineering
     challenge, now demonstrated.
- ✅ **Width-aware factory agent** (`sim/factory-agent.ts`, rebuilt as a balanced
  binary multiplication tree — each node fed by two distinct children, one per
  port, so width doubles toward the base to match the 2-in/1-out rule). Findings:
  - **Depth 4 works and SUSTAINS the root** (2^(2^4)=65,536): 47 cells, 93 pipes,
    142 actions, score ~4e6 — the tree fills in ~2h then holds, where the chain
    only plateaued.
  - **Depth 5 stalls at 16** (95 cells): the shared successor base can't supply
    enough throughput to fill a 32-leaf tree, and fuelling deep nodes by tapping
    lower levels *steals from operand flow* → cascading starvation. **Finding:**
    each extra squaring level ~doubles the factory AND needs dedicated
    (non-stealing) graded fuel — a real scaling wall that's part agent-naivety,
    part a signal the throughput economy may be too steep (a tuning question).
- ✅ **Managing agent** (`sim/manager.ts`) + engine `removeCell`/`removePipe`
  (held blocks return to the pool — nothing destroyed). The decisive test:
  - A *static* factory plateaus (~65,536). A factory that is **actively managed**
    — shuttling loose blocks into cells, amplifying the frontier, fuelling
    working ops, and **rebalancing** (place/remove/shift capacity) — climbs the
    frontier to **~10²⁴** (peak 4.8e24), 86 cells, via ~87k feeds + ~63k fuels +
    100 rebalances.
  - **Conclusion:** the big-number difficulty is *good puzzle difficulty*, not a
    design wall. There is no hard stall (the free river makes Total Score rise
    forever); the *frontier* requires constant fiddling and rethinking — exactly
    the intended feel. The static-factory plateau was an artifact of the agent
    lacking a player's verbs (manage / reroute / remove / hand-carry), not the
    economy.
  - *Note:* the greedy manager's frontier is **volatile** (sawtooths as it locks
    the biggest blocks into very long ops) — a steadier strategy is a refinement,
    not a blocker.
- ✅ **The manager's verbs in the human game.** Manual shuttle was already there
  (drag blocks onto ports); added **shift-click to delete a cell or pipe**
  (reroute = delete + re-draw) backed by `removeCell`/`removePipe`. Shift tracked
  via a window key listener (robust vs Pixi's event modifier); e2e covers a real
  shift-click delete. So a human can now do everything the managing agent did:
  place, move, wire, shuttle, fuel, delete/rebalance.
- ⏭️ **Now: a careful tuning pass.** With both agents (production `sim/agent.ts`,
  logistics `sim/logistics.ts`, static `sim/factory-agent.ts`, managing
  `sim/manager.ts`) we can read the curve from several angles. Levers:
  per-operator exponents, grades (`gradeCoeff`/`gradeExp`), transit `p`/coeff,
  build scaling, baseRate. Targets to decide: opening feel, the volatility of the
  managed climb, the cost-per-magnitude steepness. Then: global time-levers /
  prestige; exp-centric climb; deferred systems.

  **Tuning lens — human action budget (`sim/manager.ts` rate-limited).** Goal:
  *idle is always fine (score rises), active is always more efficient, always
  something worth doing — without robotic APM.* Findings from the rate sweep
  (auto-piped backbone = idle baseline + rate-limited manual amplification):
  - **Idle is genuinely fine:** rate 0 → score rises forever (free river), small
    frontier. The auto-pipes carry the idle half. ✓
  - **Active play is hugely rewarding:** ~1 action / 4s (66 actions total)
    rockets the frontier from 26 → 3.9e13. Always something very worth doing. ✓
  - **But it's a CLIFF, not a gradient:** rate saturates immediately (0.25/sec
    and 4/sec give the *same* 3.9e13 with the same ~66 actions). The ceiling is
    factory SIZE, not APM — and each amplification ~**squares** the frontier
    (doubly-exponential per action), so a handful of actions → astronomical jump.
  - **Tuning implication:** for a smooth "every action helps a bit, faster play
    steadily out-paces slower" gradient, the *efficient* play should be
    **incremental** (frontier × a moderate graded fuel block) rather than
    **squaring the two biggest**. Tune grades + op-costs so streaming moderate
    multipliers is the best play, not spiky squaring. That makes APM rewarding
    without a cliff and keeps "always something to do" true at every rate.

  **Incremental-gradient findings (`sim/manager.ts`, incremental + parallel).**
  Switched the agent to incremental multiplication (frontier × a ×≤1000 block per
  action) and re-swept the human action rate:
  - **The temporal climb is now smooth** (rate 1: steady ~×10–×100/sample to
    ~8.7e13, no spike) — incremental fixes the squaring cliff. ✓
  - **Idle → active is a huge, healthy gradient** (frontier ~20 idle → e12–e19
    active); idle never stalls (score rises). ✓
  - **Factory WIDTH is the real APM sink.** 1 frontier-builder absorbs only ~400
    actions (frontier ~e12) regardless of budget — it's op/fuel-bound. **4**
    parallel builders absorb thousands of actions (scaling with the budget) and
    reach ~e19. So active play that **builds & rebalances width** is the
    gradient; clicking faster on a *fixed* factory saturates.
  - **Conclusion:** the desired shape is achieved and is *healthy* — idle fine,
    active far more efficient, the climb smooth, and the unbounded lever is
    "build a wider factory and keep it fed," not superhuman APM. This matches the
    "constant fiddling and rethinking" vision. The economy **constants look
    fine** for this; the open lever is keeping **expansion always worthwhile**
    (build-cost vs throughput) and steering play toward incremental-multiply +
    width (design/progression), and ensuring squaring isn't a degenerate shortcut
    (the transit-freeze + op-cost already discourage it at scale).
- ⏭️ **Next:** verify expansion stays rewarding (build-cost vs added throughput
  curve) so "always something to build" holds; then global time-levers /
  prestige; exp-centric climb; deferred systems.

  **Build-cost vs throughput (`sim/build-roi.ts`) — a real economy fix.** Payback
  of the Nth cell = build cost ÷ throughput it adds. At the old `buildGrowth=1.5`
  this *exploded* — the 15th cell took ~2.6h to pay back, the 21st ~29h — so
  expansion **walled at ~10 cells**, choking the factory-WIDTH lever that the
  whole "active play" gradient depends on. **Changed `buildGrowth` 1.5 → 1.15**
  (mild escalation; the 13th cell now pays back in ~3m), so every next cell stays
  worth building deep into the game. (Very-late-game width — hundreds of one
  kind — still escalates; that's blueprints/prestige territory, not this knob.)

  **APM-reward shape — strategy/feel territory, not an economy block.** Swept
  realistic human rates (idle / 1·min⁻¹ / 1·30s⁻¹ / 1·10s⁻¹ / 1·s⁻¹ / 10·s⁻¹).
  Idle « active is huge and monotonic up to ~1/10s; beyond that the *agent*
  regresses (its greedy 4-builder strategy SPREADS value across builders instead
  of concentrating one frontier) — a play-quality artifact, not the economy
  refusing the reward. From first principles the desired shape already holds: a
  faster *and good* player does more useful actions → more progress, with a
  natural soft cap when the fixed factory saturates (ops/material-bound). The
  exact "fast beats slow, 100 APM doesn't matter" feel is now best confirmed by
  **human playtest**, since it hinges on concentrate-vs-spread play the sim agent
  models poorly. The economy permits it; no constant change indicated here.

- ✅ **Real-play-from-zero baseline** (`sim/play.ts`). A competent-player agent
  that starts from an EMPTY canvas at a human action rate — no instant-build, no
  pre-wired farm, **no free block-merge** (fuel is delivered one block per
  fuel-action, so fuel throughput is a real ceiling, as for a human). It builds
  its own fuel supply (depth-3 multiplication trees → ~256-grade fuel), grows
  frontier multiplications by recycling the big result back as an operand, fuels
  from a *reserved band* (never torches the frontier), and scales fuel
  production (bounded ≤6 trees) only under sustained fuel pressure. This is the
  **scale-of-play baseline** to compare a human playtest against:

  | action rate | FRONTIER | score | cells (built) | fuel trees |
  |---|---|---|---|---|
  | 1 / 60 s (idle) | 3.1e26 | 1.2e24 | 25 | 1 |
  | 1 / 30 s | 2.0e31 | 7.9e28 | 25 | 1 |
  | 1 / 10 s | 8.3e34 | 3.3e32 | 25 | 1 |
  | 1 / 3 s | 1.3e36 | 8.3e34 | 25 | 1 |
  | 1 / s (engaged) | 1.4e45 | 8.9e43 | 48 | 2 |

  **Findings:** (1) speed is rewarded **monotonically** (faster → higher
  frontier; the engaged player self-scaled to a 2nd fuel tree); (2) idling never
  stalls (river + auto-running trees keep score climbing); (3) the realistic
  factory is **~25–50 cells** over a 4 h session — that's the scale the
  UI/UX/animation design pass should target. Two bugs fixed en route: the early
  version spam-built 100+ never-finishing fuel trees (now bounded), and faster
  play was non-monotonic because the fuel selector torched the frontier result
  as fuel (now reserved as the next operand; fuel comes from a graded band).

- ⏭️ **Then: a full design / UX / polish pass** (the polish pivot). Economy and
  scales are understood; before the human playtest we want the prototype to
  *feel* finished — UI/UX, animation, game-feel, onboarding, readability at the
  ~25–50-cell scale. See `HANDOVER.md` for the brainstorm agenda and learnings.
  **Shipped (POLISH_PLAN.md P1–P4).**

- ✅ **Loose-block stacking + dev presets + honest agents** (human-feedback pass).
  (1) **Stacking:** identical un-piped outputs merge into one movable `×N` stack
  (`LooseBlock.count`, gated by `World.stacking` — on in the game, off for the
  sims). Kills the invisible-heap-on-the-port problem + a pool perf bomb;
  economically transparent (stack of N ≡ N blocks). Output spills clear of the
  output nub (`OUTPUT_SPILL_OFFSET`). (2) **Dev menu:** Reset + three stage
  presets (Opening / Fuel line / Engaged) via `resetWorld` +
  `placeCell({built:true})` + `src/lib/view/presets.ts`. (3) **Honest manager:**
  fixed `sim/manager.ts`'s arg-shifted backbone wiring + removed its free
  pool-merge cheat + made it stacking-aware → climbs **~1.3e36 @1/s** (was a
  broken-backbone-inflated ~1e22). The agent must mirror the game: stacking-aware
  `take` peels one off a stack. `strategy-test.ts` still carries the same bug
  (deferred — manager is the one we benchmark on).

- ✅ **Manager optimization + a corrected belief.** Added `--strategy
  spread|concentrate` + `--fuel-trees N` and went hunting for a higher climb. The
  finding overturns two long-held assumptions (from `strategy-test.ts`):
  "concentrate ≫ spread" and "spread regresses at high APM" are **false** in the
  honest manager. The regression is **fuel starvation**; scaling fuel production
  fixes it and spread goes monotonic — @10/s, 1 tree ≈ 6e35 → 2 trees (50 cells)
  ≈ 5e67 → 8 trees ≈ 3e91. Concentrate is a dead end (one fuel grade → op1/fuel
  contention → self-starves); strategy-test's "win" was an early-stop-at-1e30
  artifact. **Fuel production — a wider fuel plant kept fed — is the dominant
  reach-higher lever** (matches `play.ts`'s width lesson). `HANDOVER.md` #5 updated.

- ✅ **Holistic study (`sim/study.ts`) + the biggest agent win: smart fuel-depth.**
  Instrumented the benchmark agent (action breakdown, build accounting, value-flow,
  per-tick bottleneck attribution, pool composition) and ran 3 rates × 10k ticks.
  Found the agent fuel-throughput-bound (80–99% starved) while leaking 15–23k
  unusable ONES. Key insight: **fuel DENOMINATION (tree depth), not quantity, is
  the lever** — one fuel block finishes an op iff block-value ≥ op-work (~digits³);
  the root is 2^(2^depth), so deepening squares the denomination. The agent now
  **scales fuel depth with the frontier** (default on; `--fuel-depth N` forces
  fixed). Result vs old depth-3: STEADY 5.6e42 → 3.1e85 (+43 oom), FAST 6.9e69 →
  4.0e118 (+49 oom); slow unchanged (rate-limited). Hand-consolidating 1s was a
  proven trap (~0.5 fuel-value/action); over-building fuel also harmful (build-cost
  wall). `HANDOVER.md` #9 added. Remaining ceiling: superhuman-rate throughput.

- ✅ **Width pass — frontier width is FREE throughput (+41/+44 orders more).**
  Chased the throughput ceiling. Key engine fact (Architecture B): each cell runs
  at `baseRate` for free in parallel, so more frontier mults = more free
  op-progress (NOT fragmentation — that was the fuel-scarce regime). Swept it:
  **16 mults is the peak** at STEADY (3.1e85 → 2.7e126) and FAST (1.2e86 →
  2.9e135), neutral at SLOW; past ~16 a single tree's fuel dilutes. Defaulted to
  16 mults from the start. Gradual auto-width is counterproductive (adding a mult
  mid-climb steals op0 from the leader) → off by default (`--auto-width` to
  repro). Parallel fuel roots help only at FAST (auto-fuel builds ~9 trees).
  **Combined two-pass total vs the original depth-3/4-mult agent (10k ticks):
  STEADY 5.6e42 → 2.71e126 (+84 oom), FAST 6.9e69 → 3.60e162 (+93 oom)**; SLOW
  unchanged (rate-limited). `HANDOVER.md` #10 added. NB ≥~1e90 is sawtooth-noisy.

- ✅ **Consolidation + refreshed dev presets.** `runManager` now takes a single
  `ManagerOpts` options object (was 11 positional params); all call sites + the
  CLI + `sim/study.ts` updated, behavior identical (study unchanged). The dev-menu
  presets (`src/lib/view/presets.ts`) were rebuilt around the agent's best-play
  strategy: Opening · **Deep fuel** (depth-4, 65,536/op) · **Wide bank** (depth-4
  + 8 mults) · **Engaged climb / agent's best** (depth-5 + 16 mults, ~110 cells).
  All four verified loading + auto-running headlessly via `__nbg`, no errors.

- ✅ **Auto-scaling fuel + fixed the whole sim suite.** The manager now
  **self-scales fuel**: under sustained starvation it builds another backbone
  (action-costed via a queue, constructed over real time), so production tracks
  the digits³ demand — one honest curve (no `--fuel-trees` knob), spread monotonic
  to ~1.9e53/5h @10/s (builds a 2nd tree then stops once the pool saturates).
  Also fixed `strategy-test.ts` (same arg-shifted backbone + free-merge) and
  `agent.ts` (free-merge in `capPool`) — all wired correctly, stacking-aware,
  drop-not-merge pool safety. `play.ts`/`factory-agent.ts`/`logistics.ts`/
  `time-run.ts` were already clean.

- ✅ **Auto-scaling frontier width (symmetric lever) — and the insight it surfaced.**
  The manager now also builds more frontier mults under "APM I can't spend"
  pressure (on by default; `--no-auto-width`). **Key finding: at human action
  rates (≤~30/s) the initial 4 mults already absorb the APM, so width never fires
  — fuel is the only lever that binds in the human range** (self-scaling,
  monotonic). Width engages only past ~100/s (superhuman), where it helps (×~16
  @100/s). The manager is now a fully self-tuning best-play benchmark (fuel +
  width). Caveat: compare strategies/levers at the SAME rate — a cross-rate
  comparison briefly mis-read width as harmful; numbers ≥~1e60 are sawtooth-noisy.

- ✅ **Fuel economy — "fuel must actually matter" (2026-06-10).** Addressed the
  complaint that multiplicative ops are too cheap once a basic fuel line exists.
  **Ruled out three levers, shipped one.** *Per-block digit-fuel* (`fuelLaw:
  'digits'`) collapses the climb (−120…−150 oom) and reopens the shatter exploit
  (digits^q sub-additive). *Fuel-tax* (an amplifier op needs `C·magnitude(output)^α`
  of burned fuel) requires a tiered fuel ladder = **α.5c's ladder reborn**, and
  the fuel is `frontier^α` — too big to pipe (transit-freeze caps pipe-able fuel
  ~mag 2000); milling/force-fuel/ladder agents **all stall ~1e16–1e21**. **Landed:
  reduced amplifier baseRate (`amplifierBaseRateScale`) + diminishing overpay
  (`fuelOverpayExp`; a block contributes `grade^(1-p)·V^p`)** — stable, pipe-able,
  smoothly tunable (`sim/fuel-overpay.ts`: −48…−114 oom, no collapse, *if the
  agent fuels only the frontier and lets trees creep*). Live in the game at
  `0.5 / 0.5` (`src/lib/view/game-view.ts` → `GAME_TUNING`), headless-verified
  (a mult creeps to 8.7% unfuelled, streamed grade fuel finishes it → 1e6, no
  errors). All experiment knobs **off in `DEFAULT_TUNING`** so sim baselines + the
  45 tests are intact. **Sim-tuning the two values + the human playtest = next
  session.** New harnesses: `fuel-overpay.ts` (the lever) + `fuel-experiment.ts` /
  `fuel-tax.ts` / `fuel-forced.ts` (the dead-ends). See HANDOVER §0 + learning #12.

- ✅ **The fuel-economy LOCK — 0.5/0.5 promoted to `DEFAULT_TUNING` (2026-06-10,
  tuning session).** Swept `amplifierBaseRateScale × fuelOverpayExp` across the
  full human rate range (1/60 … 1 action/s, 4 h windows) with BOTH probes.
  Manager (optimal play): **only 0.5/0.5 is strictly monotonic with no
  saturation** (e19 → e43); (1, 0.5) / (0.25, 0.5) saturate by ~1/3 s,
  (0.5, 1) leaves overpay free, (0.5, 0.3) compresses. Fuel-dependence −91 oom
  vs vanilla at 1/s; idle never stalls (e17–e19 from zero). Promoted:
  `core/time.ts` DEFAULT_TUNING ships 0.5/0.5, `GAME_TUNING = {...DEFAULT_TUNING}`,
  `fuel-overpay.ts` baseline + `manager.ts` flag defaults updated, **2 new
  engine lock-guard tests (47 total)**. `play.ts` gained `--amp-base/--overpay`
  + an overpay-aware competent agent (grade-banded one-shot fuel, two-pressure
  expansion, proactive deepening — HANDOVER learning #13 for the traps).
  Re-baselined: play.ts 1.8e19 idle → 5.3e36 engaged; manager 10k-tick
  4.7e21 / 8.7e40 / 2.3e49 (slow/steady/fast). **Playtest watch-item:** naive
  mid-rate play walls at ~e22 until the player discovers deep fuel — presets +
  narrator must teach the move.

- ✅ **Slice 1 — SCAFFOLDING, the exponentiation pacing law (2026-06-10,
  sim-first; awaiting review before promotion).** Closes the challenger's exp
  snowball: exp-tier ops demand `C·M^α` of burned *working notes*, payable only
  in the denomination band [S/band, S] — oversized blocks refused (breaks the
  self-funding chain), floor exempts toy exps, baseRate never pays it, mult
  never scaffolded. `core/time.ts` knobs (off in DEFAULT_TUNING) +
  `core/engine.ts` band enforcement + 7 tests (61 total) + scaffolding-aware
  challenger + `sim/scaffold-sweep.ts`. Candidate values **α=0.5 C=1 band=64
  floor=1e6**: engaged 4 h = e4978 via **8 paid milestone launches** (~30 min
  cadence, forced pyramid rebuild between); casual = 1 paid launch, e151 vs
  e118 no-exp; the 10^10^236740 tower is dead at every setting tested. Next:
  harden the sweep agent (multi-target stocking, per-α launch sizing, paid-
  launch metrics), lock values, then milestone unlock + narrator (Slice 2).

- ✅ **Slices 2 + 3 — milestone unlock, scaffold UI, powered logistics; the new
  economy LIVE (2026-06-10).** GAME_TUNING opts into scaffolding (candidate
  values) + `accelChargeCarry: 1`. Slice 2: exp unlocks at the 1e9 frontier
  milestone; dashed notes-ring on scaffolded ops; narrator beats (demand with
  band numbers, paid-launch milestone, both refusal hints); accelerator shows
  `carries ≤X`. Slice 3: charge-carry transit law (`m/(1+charge·carry)` at
  pipe entry, warehouse withdrawals included; pipe-fed charge; decay = the
  standing burn) — the Mill already right-sizes (S,16S] blocks into in-band
  notes in one pass. World `produced`/`burned` counters + challenger session
  telemetry. **57 unit + 8 e2e green** (new live-game scaffold-launch e2e),
  preview-verified. Watch-item: engaged-pace launches front-load (8 in the
  first ~20 min, then a 3–4 h rebuild); casual pace is well-spaced. Deferred:
  hand-drag weight (3c — feel decision), sweep-agent hardening + final value
  lock, tetration/pentation scaffolding (engine-ready, by design).

- ✅ **Build slots ("one pencil") + from-zero agent + new presets
  (2026-06-10).** Construction queues in placement order (buildSlots knob, off
  by default, 1 in GAME_TUNING); fuel rushes any queued build; slots grow at
  shared BUILD_SLOT_MILESTONES vs the new world.peakMagnitude. View: queue
  badges, pencil narrator beats, monitor row. Challenger gained --from-zero
  (gated build program honoring the 1e9 exp unlock, fuel-rushed builds,
  sticky launch campaigns, Mill-minted notes) — THE gameplay benchmark now;
  the manager is retired. Pacing result: 4 h from-zero frontier is FLAT
  across 1/30→1/s action rates (e210–e305, sawtooth noise) — strategy
  dominates APM; returns saturate ~1 action/10 s. Presets rebuilt for the
  current rules (opening / mult factory / launch prep / powered age), all
  verified headlessly. 61 unit + 8 e2e green.

- ✅ **The UX pass — UX_PLAN.md executed in full, Orders 1–6 (2026-06-10).**
  Four commits on `main`. Feedback: fuel-grade readouts, never-silent refusals
  (JAM flash + narrator), overpay smoke, staged-operand labels, a/b port
  letters, drag-aware drop targets, ETAs + shelf build-cost previews, ghost
  under-trace. Labor: sticky tools + hotkeys + Esc/right-click cancel,
  box-select group move, drag-to-wire + reroute-in-place + pipe tooltips,
  Ctrl+Z un-erase, warehouse withdraw/collect (new tested engine verbs).
  Hygiene: river slimmed + zoom-fade + bank line, numeral contrast underlays,
  panel-aware framing, collapsible cards, zoom LOD (state chips + `e22` block
  tags). Instruments: the live inspector card (with the one-shot grade-fit
  hint), Σ/s + blocks/s + the two-starvation bottleneck line, the timestamped
  journal, vocabulary legend, ONE `1.23×10⁸` number language, "Apparatus".
  Bugs E1/E2 fixed. 62 unit + 11 e2e green. Deferred by design: minimap,
  area labels. **Next session: sim tuning (HANDOVER §0a).**

---

## Phase 0 — Carve the minimal baseline

**Goal:** a clean, buildable game that is just *river → successor → addition →
multiplication → exponentiation*, with pipes and warehouses, and **none** of
the cut systems. No time model yet — this is the foundation we build the clock
onto. The old per-firing ladder stays *temporarily* as the cost model so the
game remains playable between slices; it is removed in Phase 3.

| Slice | Content | Done when |
|---|---|---|
| **0.1** | **Disable the cut layers.** Remove from the ticker / setup / UI: Adversary (`adversary.ts`, `frontLayer`, `antinumber.ts`, `battery-cell.ts`), Sets (`set-cell.ts`, set `operate` cases — refuse sets at operand ports as a stopgap), Gallery (`Gallery.svelte`, `discoveredValues`), Cultivation, Blueprints, Filters, decomposer/T-bots. Strip their Literature entries. Leave files in place but unwired where deletion is risky; delete where clean. | Build + check clean; canvas shows only river + buildable operators; no combat, no panels beyond Literature + Score. |
| **0.2** | **Remove reducing operators.** Drop Subtraction, Decrement, Factor, Negation, Inversion from the catalog and `CellType` (or gate them off). Keep `valueNeg`/`valueRecip` in `core/value.ts` dormant for later. | Only Successor / Addition / Multiplication / Exponentiation are placeable. |
| **0.3** | **Remove the comprehension spine.** Tear out `valueComprehensible` gating from manual lift, pipe placement/runtime, warehouse, T-bots; remove the comp ladder Literature + `comprehension` store + header readout + cell-jam (`?`-blocks). Numbers are freely handled again (slowness, not gates, will throttle later). | No comp anywhere; big numbers can be picked up and piped freely. |
| **0.4** | **Fresh save schema + reset.** Prototype starts at save **v1** of its own line (the main game's v18 chain is abandoned on this branch). Load of an old/foreign save → clean start. Persist only: blocks, cells, pipes, warehouses, camera, purchase counts. | Reload preserves a minimal factory; old saves don't crash. |

**Deliverable:** a stripped, satisfying-but-simple builder — the same tactile
toolkit as Phase 1 of the original, minus everything we're deferring. This is
the clean slate the time model lands on.

---

## Phase 1 — The clock (operations take time)

**Goal:** introduce **time as a first-class thing**. Operations have a
*duration*; cells are *idle* or *working*; the result is penciled in over time.
`baseRate` only — no fuel yet.

| Slice | Content | Done when |
|---|---|---|
| **1.1** | **Work model in `core`.** New `core/time.ts`: `operationWork(type, inputs) → Decimal` (work ∝ output magnitude; placeholder steep curve), and `baseRate` constant. Pure, sim-importable. Replaces nothing yet — just the math. | Unit-checkable pure functions; `node` smoke test prints durations for sample ops. |
| **1.2** | **Working-state engine.** `PlacedCell` gains `opProgress` / `opWork` / `opInputs`. New `tickOperations(dtMs)` in the ticker: a cell with operands present and not working *starts* an op (snapshots inputs, computes `W`); each tick advances `opProgress += baseRate·dt`; at `opProgress ≥ opWork` it emits via the existing `commitSpawn` and clears. The old instant `fireCell` becomes "begin op." | A multiplication of big numbers visibly takes many seconds; small ops are quick. Idle game still progresses. |
| **1.3** | **Operation visual — stroke-fill + meter.** Output port shows a graphite **ghost** of the result that darkens to full as `opProgress/opWork → 1`; a subtle **progress meter** (pencil bar or clock-hand on the operator glyph) layers on. Reuse `pixi/value-label.ts` for the ghost numeral; reuse `micro-anim.ts` for the completion flourish. | You can read any cell's progress at a glance; long ops feel alive. |
| **1.4** | **Retire cooldowns.** Remove the old `cooldownRemaining` / rate / leveling-throughput paths from the fire logic (cell leveling is deferred). Pipe tick still moves blocks (instantly for now — transport time is Phase 4). | No vestigial rate machine; one-op-at-a-time everywhere. |

**Deliverable:** the game runs on a clock. Big numbers are slow to make; the
hand visibly works them out. Pure `baseRate`, no acceleration yet — so it's
*deliberately* a bit slow, which sets up the need for fuel.

---

## Phase 2 — Build time (RTS base-building)

**Goal:** placing a cell is a **construction** that takes time and scales with
how many you own. The cell sketches itself in and is inert until done.

| Slice | Content | Done when |
|---|---|---|
| **2.1** | **Build-work model.** `core/time.ts`: `buildWork(type, ownedCount) → Decimal` — escalating in count (geometric, placeholder). | Pure; sim-importable. |
| **2.2** | **Construction state.** A newly placed cell starts at `buildProgress = 0`, advances at `baseRate`, is **inert** (won't accept operands / fire) until complete. New `tickConstruction(dtMs)`. Replaces the instant-place semantics in the placement flow. | Placing the 1st successor is quick; the 5th takes noticeably longer. |
| **2.3** | **Build visual — sketches in.** The cell's pencil strokes draw in proportional to `buildProgress` (partial outline → fuller → snap + flourish). Reuse `pencilStroke` with a progress clip. | A half-built cell is visibly half-drawn. |
| **2.4** | **Literature reframed as "blueprints to draft."** The shop no longer charges a number-cost to unlock; instead each entry, once available, places a cell that then *builds over time*. (Operator *unlocks* — the first time a type becomes available — can stay gated by a simple milestone, e.g. "own ≥1 of the prior tier.") | The shop hands you a cell to construct, not an instant placement. |

**Deliverable:** the factory is *built*, not summoned. Going wide has a rising
time price; the canvas grows organically as you construct.

---

## Phase 3 — Fuel & the burn (acceleration)

**Goal:** the heart. Cells gain an **optional fuel port**; burning numbers into
a working/constructing cell adds to its rate; fuel is consumed.

| Slice | Content | Done when |
|---|---|---|
| **3.1** | **Fuel port on cells.** Add a `kind: 'fuel'` port to operator (and successor/warehouse) `CELL_SHAPES`. Optional: unwired = `baseRate` only. Renders as a distinct small port (reuse the old fuel-port visual chassis). | Cells show a fuel intake; nothing breaks if it's empty. |
| **3.2** | **Burn = rate.** When a block is delivered to a fuel port (piped or hand-dropped) while the cell is working or building, it is **consumed** and contributes `≈ value` of work instantly-ish (added to `opProgress`/`buildProgress`), then the cell continues. `burnRate` accumulates from the stream. Fuel spend decrements Total Score (it's a real spend). | Piping `1`s into a slow multiplication visibly speeds it up; score reflects the spend. |
| **3.3** | **Remove the old ladder entirely.** Delete the per-firing `fuelLadder` / `consumeFuelLadder` / `computationalCost` ladder machinery now that fuel is voluntary acceleration. `core/cost.ts` shrinks to nothing or merges into `time.ts`. | No mandatory per-firing consumption anywhere; the only consumption is voluntary burn. |
| **3.4** | **Burn feedback.** Fuel numerals visibly *fall into* the cell and flare; the progress meter jumps; the pencil speeds up. Tie `JUICE` / `physics.ts` pop to burn events. | Burning *feels* like throwing coal in a furnace. |

**Deliverable:** the wait-vs-spend decision is live. The economy from
`TIME_AS_LABOR.md` §3 is now playable end-to-end: widen the successor farm,
consolidate, amplify, burn the product back in to go faster.

---

## Phase 4 — Transport time + distance (the map)

**Goal:** pipes carry blocks over time ∝ **magnitude × distance**, turning the
canvas into a real layout board. This is also the fuel-delivery throttle that
makes burning self-limiting.

| Slice | Content | Done when |
|---|---|---|
| **4.1** | **Transit-time model.** `core/time.ts`: `transitTime(magnitude, distance)`. Pipe tick reworked: a block entering a pipe gets a transit timer; it's *in-flight* (still counts toward Total Score) until arrival. | A big block crawls; a `1` zips; a long pipe is slower than a short one. |
| **4.2** | **Sliding-numeral visual.** The block's numeral physically travels the bezier from source to dest, position = `arcLength · progress`. Reuse the existing arc-length sampling in `pipe-visual.ts`. | You watch numbers flow; speed reads as magnitude+length. |
| **4.3** | **Distance into build & withdraw.** Fuel/operand delivery distance feeds the §2 build time and warehouse withdraw time (proximity matters). | A fuel stockpile next to a cell accelerates it more cheaply than a far one. |
| **4.4** | **Layout payoff pass.** Tune so a tight, well-supplied base is meaningfully faster than a sprawling one — without making distance punishing. (First real feel-check of the map.) | Playtest confirms "keep fuel close" is a felt, fun optimization. |

**Deliverable:** the pan-zoom notebook is a board you play on. Supply lines,
proximity, and throughput are the strategy. The hoard-dump exploit is gone for
free (fuel must flow in).

---

## Phase 5 — Close the loop + first tuning pass

**Goal:** make the full economy *satisfying*, then point the sim at it.

| Slice | Content | Done when |
|---|---|---|
| **5.1** | **Warehouses as reservoirs.** Confirm warehouses deposit/withdraw under the time law and serve as fuel/operand stockpiles; tidy their visuals. | Stockpile → pipe-to-cell as fuel works smoothly. |
| **5.2** | **The opening 60 seconds.** Tune Phase-0..4 placeholder constants so the bootstrap (`TIME_AS_LABOR.md` §3) feels good *by hand*: first successor quick, the wait-or-burn choice appears early and interactive, the first "whoosh" lands within minutes. | A fresh player feels the pressure→relief rhythm in the first session. |
| **5.3** | **Sim re-point (sim-first tuning).** Re-target `sim/` at the time model: `baseRate`, the work-steepness exponent, build-time scaling, magnitude→work and distance→time constants. Strip the ladder/comp/combat models. Find the curve where each investment yields a felt speed jump and climbing stays net-positive. | `node sim/run.ts` walks the time economy; a locked constant set lands in `core/time.ts`. |
| **5.4** | **Narrator pass.** Dry-academic marginalia for the new model — remarks on *duration* ("This multiplication will conclude shortly after the sun does. Allocate resources, perhaps."), the first burn, the first time a build out-paces the wait. | The voice fits the time theme. |

**Deliverable:** a complete, tuned, satisfying *Time as Labor* core loop — the
"really basic system done right" the prototype set out to be. The deferred
systems (combat, comprehension, sets, prestige, the global time levers) can now
be reintroduced *onto a foundation that actually works*.

---

## Cross-cutting

- **`core/` stays pure.** `core/time.ts` (the new work/rate/transit math) has no
  Pixi/Svelte import, so the sim can use it — same discipline as `core/cost.ts`.
- **`baseRate` is one readable global** from day one, so the two deferred
  time-levers (wall-clock speed, baseRate boost) bolt on cleanly later.
- **Persistence:** prototype save line restarts at v1; in-flight pipe blocks and
  in-progress op/build state should persist (or restart-at-zero-progress as an
  acceptable simplification — decide in 0.4 / 1.2).
- **No new color or visual primitive** beyond progress meters and sliding
  numerals — the pencil aesthetic is non-negotiable.
- **Validate by playing after every slice.** If the factory doesn't *feel*
  satisfying to build and watch, fix the feel before adding the next layer.

## Suggested first concrete step

**Phase 0.1 + 0.2** — carve the baseline by unwiring the cut layers and reducing
operators. Lowest-risk, highest-clarity: it gets us to a clean, buildable
minimal builder we can then bolt the clock onto, and it forces an honest
inventory of what the cut systems were touching.

- ✅ **Dev playtest instruments** — a live monitor (FRONTIER, time, cells/working,
  pipes/loose) + a speed control (⏸ 1× 3× 10× 30×, via `speedStore`).
- ✅ **Smart-vs-naive strategy probe** (`sim/strategy-test.ts`). Answer to "can a
  smart superhuman beat the naive cap?": **yes, hugely.** The naive `spread`
  strategy *collapses* with APM (1.27e30 @1/s → 3.44e10 @30/s — fragments value);
  the smart `concentrate` (one frontier + out-fuel the digits³-growing op) holds
  ~e23–e24 and beats naive-at-high-APM by ~13 orders. So strategy quality is a
  massive skill edge — the intended deep puzzle. (Caveat: raw "more APM →
  bigger frontier on a *fixed* farm" is fuel-SUPPLY-capped; the unbounded lever
  is also building more fuel production, which is itself active play. Huge runs
  overflow to slow layer-3 Decimals, so the probe caps its window.)
