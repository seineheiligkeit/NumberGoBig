# Session handover — *Time as Labor* prototype

*Last updated: 2026-06-10. Branch: `time-as-labor`. Read this first when picking
up. The design north star is [`TIME_AS_LABOR.md`](./TIME_AS_LABOR.md); the
sliced plan + full progress log is [`TIME_AS_LABOR_PLAN.md`](./TIME_AS_LABOR_PLAN.md).
This file is the fast on-ramp: where we are, what we learned, what's next.*

---

## 0. Latest

**Fuel economy — "fuel must actually matter" (2026-06-10).** Tackled the
complaint that *multiplicative ops are too cheap to run once you have a basic
fuel line*. A long sim-first exploration: **three approaches ruled out, one
landed and shipped to the game.** (All experiment knobs live in `core/time.ts`
`TimeTuning`, **off in `DEFAULT_TUNING`**, so sim baselines + the 45 tests are
untouched; the live game opts in via `GAME_TUNING`.)

- **RULED OUT — per-block digit-fuel** (`fuelLaw:'digits'`, fuel = digits(V)^q):
  collapses the climb −120…−150 oom (fuel can only be hand-delivered and a
  digit-valued op needs *thousands* of blocks), AND it reopens the **shatter
  exploit** — digits^q is sub-additive, so milling a block into pieces multiplies
  total fuel. No safe q. (`sim/fuel-experiment.ts`.)
- **RULED OUT — fuel-tax** (`fuelTaxCoeff/Exp/Floor`: an amplifier op needs
  `C·magnitude(output)^α` of *burned* fuel). Net-positive in theory, but paying a
  frontier-scaling tax requires a **tiered fuel ladder = α.5c's ladder reborn**
  (which this branch deleted), and the needed fuel is `frontier^α` (huge) which
  **can't be piped** — transit-freeze caps pipe-able fuel at ~mag 2000. Built
  milling, force-fuel, and an explicit ladder agent; **all stall ~1e16–1e21** (vs
  1e133 untaxed). Fractally unsatisfiable as a physical/piped network.
  (`sim/fuel-tax.ts`, `sim/fuel-forced.ts`; `--milling`/`--ladder`/`--fuel-factory`.)
- **RULED OUT — milling/cascade as a fuel *source*** (re-confirmed): fuel =
  magnitude is **conserved**, so milling only *right-sizes* fuel, never *creates*
  it. Removing baseRate to force a self-fueling cascade collapses it (the free
  successor base can't feed every amplifier).
- **LANDED — reduced amplifier baseRate + diminishing overpay** (two new knobs):
  `amplifierBaseRateScale` (amplifiers — mult and up — accrue baseRate × this, so
  fuel *matters*; **never 0** — that collapses the cascade; successor/addition
  stay fully free) and `fuelOverpayExp` p (a fuel block contributes
  `grade^(1-p)·V^p`, so dumping one giant block is wasteful and a *stream of
  grade-sized fuel* is optimal — the "most efficient when paying exactly" feel).
  Sweep `sim/fuel-overpay.ts`: **stable across the whole range**, smooth throttle
  −48 oom (gentle) → −114 oom (aggressive), no collapse — *provided the agent
  fuels only the frontier and lets fuel trees creep* (hand-feeding the whole
  factory collapses it). **Live in the game** at `amplifierBaseRateScale: 0.5,
  fuelOverpayExp: 0.5` (`src/lib/view/game-view.ts` → `GAME_TUNING`);
  headless-verified (a mult reached 8.7% in 60 ticks unfuelled, then streamed
  grade-100 fuel finished it → 1e6; zero console errors). **Sim tuning of the two
  values is the next session** — once the feel is locked, promote `GAME_TUNING` →
  `DEFAULT_TUNING` and re-baseline the sims (`play.ts` is still 6.19e26 vanilla).

**Stacking, dev presets, honest agents (prior session).** Three things landed:

- **Loose-block stacking.** Identical un-piped outputs merge into one movable
  `×N` stack (engine `LooseBlock.count`, gated by `World.stacking` — on in the
  game, **off by default so the sims are untouched**). Kills the "invisible heap
  on the output port" + a perf bomb; economically a no-op (a stack of N ≡ N
  blocks for score/counts). Output now also spills clear of the output nub
  (`OUTPUT_SPILL_OFFSET`) so the port stays wireable. `core/engine.ts` +
  `src/lib/view/game-view.ts`; 4 new engine tests.
- **Dev menu: reset + factory presets.** A Reset button + stage snapshots in the
  monitor panel — `src/lib/view/presets.ts`, engine `resetWorld` +
  `placeCell(..., {built:true})`, view `reset()`/`loadPreset()` (also on `__nbg`).
  **Refreshed to the agent's best-play strategy** (deep fuel + wide frontier):
  Opening (early) · **Deep fuel** (depth-4 → 65,536/op) · **Wide bank** (depth-4 +
  8 mults) · **Engaged climb / agent's best** (depth-5 → ~4.3e9/op + 16 mults,
  ~110 cells). The fuel tree auto-runs; frontier mults wait for you to feed op1 +
  fuel from the pool.
- **The manager is now an honest benchmark.** Found + fixed `sim/manager.ts`'s
  backbone (arg-shifted `placePipe` → its leaf adders never fired) and removed
  its **free pool-merge cheat** (`sum the two smallest`); made it stacking-aware.
  With a real squaring backbone it climbs to **~1.3e36 @1/s** — the old
  ~1e22–1e24 was an artifact of the broken tree propped up by the free-merge.
  NB: `sim/strategy-test.ts` carries the *same* wiring bug + free-merge (left as-is
  — we only care about the manager).
- **Then pushed the agent higher — and corrected a long-held belief.** Added
  `--strategy spread|concentrate` + `--fuel-trees N` to the manager. The
  project believed "concentrate-one-frontier ≫ spread" and "spread regresses at
  high APM" (from `strategy-test.ts`). In the *honest* manager both are **false**:
  the regression is **fuel starvation**, and scaling fuel production fixes it —
  spread goes monotonic and climbs far higher (1 tree @10/s ≈ **6e35** → 2 trees
  (50 cells) ≈ **5e67** → 8 trees ≈ **3e91**). Concentrate is a **dead end** here
  (one fuel grade → its op1 multiplier and fuel contend → self-starves, caps
  ~1e31–1e38); strategy-test's "win" was an artifact of its early-stop at 1e30.
  **Fuel production is the dominant reach-higher lever** ("build a wider fuel
  plant, keep it fed"). See learning #5.
- **Built auto-scaling fuel + fixed the rest of the suite.** The manager now
  **self-scales fuel**: under sustained starvation it BUILDS another backbone
  (action-costed, via a queue; constructs over real time), so fuel production
  tracks the digits³ demand — one honest curve, no `--fuel-trees` knob needed
  (the flag still sets the *initial* count). Result: spread is monotonic and
  climbs to **~1.9e53 over 5h @10/s** (it builds a 2nd tree, then correctly stops
  once the pool saturates). Also **fixed `strategy-test.ts`** (same arg-shifted
  backbone + free-merge) and **`agent.ts`** (free-merge in `capPool`) — both now
  wired correctly, stacking-aware, with drop-not-merge pool safety.
- **Then auto-scaling frontier WIDTH (symmetric lever) — and the key insight it
  surfaced.** The agent now also builds more frontier mults under "APM I can't
  spend" pressure (on by default; `--no-auto-width`). **Finding: at human action
  rates (≤~30/s) the initial 4 mults already absorb the APM, so width NEVER fires
  — fuel is the only lever that binds in the human range** (and it self-scales,
  monotonic). Width engages only past ~100/s (superhuman), where it helps (×~16
  @100/s). Beware cross-rate comparisons: I briefly mis-read width as harmful by
  comparing different rates; the correct *same-rate* test shows it neutral-to-
  helpful. (Exact numbers ≥~1e60 are sawtooth-noisy.)
- **Holistic study → the biggest win yet: smart fuel-depth scaling.** Built
  `sim/study.ts` (action breakdown · build accounting · value-flow · per-tick
  bottleneck attribution · pool composition). It showed the agent was
  **fuel-throughput-bound** (80–99% fuel-starved) while leaking 15–23k unusable
  ONES. The fix was NOT consolidating the 1s (a trap: ~0.5 fuel-value/action, and
  the 1s are ~1% of fuel need) but **deeper fuel trees**: a depth-3 root emits
  256/op (~9.5 value/tick); a depth-5 root emits 2³²/op — one block finishes any
  op in ~1 action. The agent now **scales fuel depth with the frontier** (root ≥
  op-work, no overkill), default on; `--fuel-depth N` forces a fixed depth. Result
  vs the old depth-3 agent (10k ticks): STEADY **5.6e42 → 3.1e85 (+43 orders)**,
  FAST **6.9e69 → 4.0e118 (+49 orders)**; SLOW unchanged (rate-limited, never
  fuel-bound). The wasted-1s problem is now moot — fuel is abundant.
- **Width pass → another +41/+44 orders: frontier width is FREE throughput.** With
  deep fuel abundant, the next ceiling was frontier-mult count. Crucial engine
  fact (Architecture B): **each cell runs at `baseRate` for free, in parallel** —
  so more frontier mults = more free parallel op-progress, *not* fragmentation
  (my earlier "width fragments" was the fuel-*scarce* regime). Swept it: **16
  mults is the peak** at both STEADY (3.1e85 → **2.7e126**) and FAST (1.2e86 →
  **2.9e135**), neutral at SLOW (rate-limited); beyond ~16 a single tree's fuel
  dilutes and it regresses. Defaulted the agent to **16 mults from the start**.
  *Gotcha:* scaling width GRADUALLY is counterproductive — adding a mult mid-climb
  steals `op0` (the leader) and underperforms a fixed wide start; so the gradual
  scaler is off by default (`--auto-width` to reproduce). Parallel fuel roots help
  only at FAST (auto-fuel built ~9 trees → contributes), negligible at human rates.
  **Combined two-pass result vs the original depth-3/4-mult agent (10k ticks):
  STEADY 5.6e42 → 2.71e126 (+84 oom), FAST 6.9e69 → 3.60e162 (+93 oom)**; SLOW
  unchanged. Superhuman numbers ≥1e120 are sawtooth-noisy — trust the trend.
- **River intake + warehouses + the Mill verdict (this session).** (a) **River
  intake** — successors now show a downward pencil spout with a rising `0`
  (cosmetic, attached to the cell; the river stays screen-fixed so a literal pipe
  would drift). (b) **Warehouses** — a new `warehouse` CellKind (engine): an
  any-block store; pipe blocks in to stockpile (deposit), pipe out to withdraw
  largest-first, drag a pile on to dump it in. Counts toward Total Score; returns
  to the pool on delete. In the toolbar (unlocks with Addition). De-clutters
  outputs + buffers fuel. (c) **Mill for the agent: tested, REJECTED** (learning
  #11) — additive splitter can't climb a multiplicative ladder; forced milling
  collapsed the climb 2.7e126 → 1.7e7. The Mill is a spatial/convenience tool, not
  an efficiency lever — which is exactly the niche warehouses now fill.

## 0b. The polish pass is DONE (2026-06-04)

The full design/UX/polish pass (**[POLISH_PLAN.md](./POLISH_PLAN.md)**, P1–P4)
shipped. The prototype now *feels* finished: bezier pipes + a visual-only juice
layer (`src/lib/view/physics.ts`), real draws-itself (cells trace in, results
written stroke-by-stroke, eraser-scrub delete, graphite-weight fuel gauge),
four legible cell states, the burn "whoosh", heavy/crosshatched frozen blocks +
milestone flashes, a dry-academic narrator (`narrator.ts` + `Marginalia.svelte`),
onboarding (gated toolbar + hints), a synthesised audio layer (`audio.ts`, mute
toggle), and notebook paper texture. The engine stayed almost untouched — it
gained four small unit-tested pure signals (`outputStalled`, `stalled`,
`recentBurn`) read by the view. **Next: the human playtest** (`npm run dev`) vs.
the `sim/play.ts` baseline. Deferred-optional: area-label naming UI + minimap.
*Key gotcha learned:* never scale or spawn interactive FX on a hit-tested
container — visuals live in an inner `body`; the FX layer is `eventMode:'none'`.

## 1. Where the prototype stands

A clean **pure-engine + thin-view** reconception of the core loop around **time
as the resource**. It is buildable, tested, and economically validated by a
suite of sim agents. It has **not yet had a human playtest** or a UI/UX polish
pass — that polish pass is the *next* piece of work (§5).

**The loop, in one breath:** an infinite free river of zeros → Successors tap it
into `1`s → Addition consolidates → Multiplication/Exponentiation amplify into
big numbers that are *both* score *and* fuel → burn fuel back into cells to buy
speed. Everything takes **time**: ops take time ∝ digits^k of the output,
building a cell takes time ∝ how many you own, transport takes time ∝ value×
distance. Fuel buys rate. Nothing is ever forbidden — only slow, and you can
always pay to hurry.

### What exists (the surface)

- **`core/` — the pure, headless, fully-tested engine** (no Pixi/Svelte/DOM):
  - `value.ts` — the `Value` union (real/rational/irrational/complex/set) over
    break_eternity `Decimal`. Full families retained for later; only `real` is
    exercised now.
  - `time.ts` — **the balance surface.** `DEFAULT_TUNING` holds every constant
    (`baseRate`, per-operator `opExponent`, `buildBase/buildGrowth`, transit
    coeffs, fuel-grade coeffs). All the cost math: `operationWork`, `buildWork`,
    `transitWork`, `fuelValue`, `minFuelDenomination`.
  - `engine.ts` — the world: `createWorld`, `placeCell`, `placePipe`,
    `feedOperand`, `injectFuel`, `addLoose`, `removeCell`/`removePipe`,
    `moveCell`/`moveLoose`, `tick`, `totalScore`. Cells are *idle* or *working*;
    one op at a time; **fair round-robin emit** across a cell's output pipes;
    full blocks spill to the loose pool under back-pressure. Two reprocessing
    objects: the **Mill** (additive splitter → graded fuel) and the
    **Accelerator** (beacon that burns charge to boost nearby pipe throughput).
  - `cell-types.ts` — the 6 constructive operators + `operate()`.
  - Tests: `engine.test.ts` + `time.test.ts`, **45 unit tests** incl.
    pacing-guards and the round-robin / score-conservation invariants.
- **`src/lib/view/` — the thin Pixi view** (767-line `game-view.ts` + 36-line
  `stores.ts`). Holds a `World`, ticks it from a Pixi ticker reading
  `speedStore`, draws it, publishes `scoreStore`/`frontierStore`/`statsStore`.
  Reuses `src/lib/pixi/{paper,pencil,river,typography,value-label}.ts` +
  `camera.ts`/`colors.ts`/`cursors.ts`. DEV inspection seam: `window.__nbg`.
- **`src/App.svelte`** — toolbar (successor/addition/multiplication/
  exponentiation/mill/accelerator/pipe), Σ score header, a live **monitor**
  (frontier / time / cells·working / pipes·loose), and a **speed control**
  (⏸ 1× 3× 10× 30×).
- **`e2e/smoke.spec.ts`** — 7 Playwright tests against the real game (env's
  pre-installed Chromium + software WebGL), incl. shift-click delete.

### Interaction verbs already in the human game
Place a cell (sketches in over build time) · drag a loose block onto an operand
port to feed · drag onto a working cell to burn as fuel · two-click to lay a
pipe · drag a cell to move it (pipes follow) · **shift-click to delete** a cell
or pipe (reroute = delete + redraw). A human can do everything the managing
agent did: place, move, wire, shuttle, fuel, delete/rebalance.

---

## 2. The known scales (what a session looks like)

From `sim/play.ts` — a competent player **from an empty canvas**, no shortcuts,
over a **4-hour** session. **This is the scale the polish pass must serve.**

| action rate | FRONTIER | score | cells (built) | fuel trees |
|---|---|---|---|---|
| 1 / 60 s (idle)   | 3.1e26 | 1.2e24 | 25 | 1 |
| 1 / 30 s          | 2.0e31 | 7.9e28 | 25 | 1 |
| 1 / 10 s          | 8.3e34 | 3.3e32 | 25 | 1 |
| 1 / 3 s           | 1.3e36 | 8.3e34 | 25 | 1 |
| 1 / s (engaged)   | 1.4e45 | 8.9e43 | 48 | 2 |

**Takeaways that shape the design:**
- A realistic factory is **~25–50 cells, ~30–90 pipes**. Not thousands. The
  canvas is a readable *board*, not a sprawl. Design for legibility at this size.
- Numbers reach **~1e26 (very casual) to ~1e45 (engaged)** in 4 h → the
  **value-label ladder** (digits → sci → tower) is exercised constantly; it must
  be beautiful and instantly readable.
- **Idle never stalls; speed is monotonically rewarded.** The pressure→relief
  "whoosh" rhythm (TIME_AS_LABOR §6) is the dopamine engine — animations must
  *sell* it.

---

## 3. The sim toolbox (how we reason about the economy)

All standalone Node CLIs (native TS, no install). Run with `node sim/<x>.ts`.

| File | What it answers |
|---|---|
| `play.ts` | **Real play from zero** at a human rate. The baseline numbers above. `--rate R --hours H --trace`. |
| `strategy-test.ts` | Spread vs concentrate at high APM (wiring + free-merge **fixed**, stacking-aware). **Corrected finding: concentrate does NOT beat spread** — it self-starves on one fuel grade; the original "wins by ~13 orders" was a bug+early-stop artifact. |
| `manager.ts` | The honest **active-management benchmark**: real wired backbone, stacking-aware, no free-merge, **smart fuel-depth scaling** (one block ≈ one op) + **16 frontier mults** (free parallel `baseRate` throughput) + auto-fuel scaling. 10k-tick frontier: ~7.9e28 (slow) / **~2.7e126** (steady) / **~3.6e162** (fast). Flags: `--rate --ticks --trace --strategy spread\|concentrate --mults N --fuel-trees N --fuel-depth N --auto-width --no-auto-fuel --no-stacking`. **Fuel-economy experiment flags (2026-06-10):** `--tax-coeff/-exp/-floor` (fuel-tax), `--milling`, `--ladder`, `--fuel-factory`, `--amp-base S` (amplifier baseRate scale), `--overpay P` (diminishing-overpay exp). |
| `study.ts` | **Holistic agent study** at 3 rates: action breakdown, build accounting, value-flow (stranded/discarded), per-tick bottleneck attribution, pool composition, baseline-vs-improved. The lens for "where are the inefficiencies." `--ticks N`. |
| `fuel-overpay.ts` | **The landed lever** (2026-06-10). Sweeps `amplifierBaseRateScale × fuelOverpayExp`; reports frontier, last-¼ growth (stall detector), fuel%. The harness to **tune the live game's two fuel knobs** next session. `--rate --ticks --factory`. |
| `fuel-experiment.ts` / `fuel-tax.ts` / `fuel-forced.ts` | The **ruled-out** explorations (per-block digit-fuel; fuel-tax sweep; force-fuel/floor sweep). Kept as the record of *why* those dead-ends fail — see §0 + learning #12. |
| `factory-agent.ts` | A fully-piped balanced multiplication tree; surfaced the round-robin-emit fix + the depth-vs-throughput wall. |
| `logistics.ts` | Transport as a real constraint: distance starves a pipe; parallel pipes + accelerators recover it. |
| `agent.ts` | Production economy in isolation (free logistics) — confirms the exponential climb is sound. (Free-merge **fixed**, stacking-aware.) |
| `build-roi.ts` | Build-cost vs added throughput → the `buildGrowth 1.5→1.15` fix that unwalls factory width. |
| `time-run.ts` | The tuning report (build ladder, op-duration base-vs-fuelled). |

**Two ways to verify, complementary:** the `sim/` agents for fast economy/pacing
at scale; the **real game driven headlessly** via `window.__nbg` + Playwright for
ground-truth correctness/visuals/feel.

---

## 4. Learnings worth keeping (don't relearn these)

1. **Pure engine + thin view was the right call.** `core/engine.ts` being
   Pixi/Svelte-free makes the economy testable, sim-drivable, and reasoned-about.
   Keep new game logic in `core/`; keep `src/lib/view/` a thin renderer.
2. **Fair round-robin emit is load-bearing.** Emitting to the *first empty* pipe
   starved fan-out (a multiplication's 2nd operand port never filled). The
   per-cell `emitCursor` fix is pinned by a test — don't regress it.
3. **`fuel = value`, `op-cost = digits^k`, `min-denomination` ⇒ the fuel ladder
   is emergent**, not designed. Each tier is fuelled by the tier below because
   the grade rule forbids feeding an op anything smaller. This is the spine —
   protect it when tuning.
4. **`buildGrowth` is the factory-width lever.** 1.5 walled expansion at ~10
   cells; 1.15 keeps every next cell worth building. Width (kept fed) is the
   unbounded active-play lever — not superhuman APM.
5. **Fuel PRODUCTION is the dominant lever — *not* "strategy quality" (corrected).**
   We long believed "concentrate-one-frontier ≫ spread" and "spread regresses at
   high APM" (from `strategy-test.ts`). In the *honest* manager (fixed backbone,
   no free-merge) both are **wrong**: the high-APM regression is **fuel
   starvation**, and scaling fuel production fixes it — spread becomes monotonic
   and climbs far higher (1 tree @10/s ≈ 6e35 → 2 trees ≈ 5e67 → 8 trees ≈ 3e91).
   Concentrate is actually a *dead end* here: with one fuel grade (256s) its op1
   multiplier and its fuel contend, so it self-starves (caps ~1e31–1e38).
   strategy-test's "concentrate wins" was an artifact of its early-stop at 1e30 —
   it never climbed far enough to hit the contention. **The unbounded
   reach-higher lever is "build a wider fuel plant and keep it fed"** (the
   `--fuel-trees` knob), matching `play.ts`'s width lesson. (Exact top numbers
   are noisy — the greedy agent's frontier sawtooths — but the *trend* is robust.)
6. **Beware sim agents that over-build or self-sabotage.** `play.ts` first
   spam-built 100+ never-finishing fuel trees, and a greedy fuel selector torched
   the frontier as fuel. When an agent's numbers look wrong, suspect the *agent*
   before the economy.
7. **Sim gotchas:** huge `Decimal`s (layer-2/3) slow everything → cap windows /
   early-stop at targets. `node --test` needs the glob `'core/**/*.test.ts'`
   (on Windows the quoted glob may match nothing — pass the files explicitly).
   Test files are excluded from `svelte-check` (tsconfig) so `node:` builtins
   don't leak into app type-checking. Playwright uses the pre-installed
   `/opt/pw-browsers/...chrome` with swiftshader (CDN download is blocked).
8. **Sims can silently cheat — audit their wiring + pool discipline.** `manager.ts`
   (and `strategy-test.ts`) had an arg-shifted `placePipe` so their leaf adders
   never fired, and the climb rode a *free pool-merge* (`sum the two smallest`)
   the real game can't do. Always check: do the agent's pipes match
   `placePipe(world, from, fromPort, to, toPort, opts)`, and is any pool
   "consolidation" a real op or a cheat? **When the game changes, the agent must
   change too** — stacking-aware `take` = peel one off a stack, never splice the
   whole pile (that discards count−1 blocks and corrupts the economy).
   *Status:* `manager.ts`, `strategy-test.ts`, and `agent.ts` are now all fixed
   (correct wiring, drop-not-merge pool safety, stacking-aware). `play.ts`,
   `factory-agent.ts`, `logistics.ts`, `time-run.ts` were already clean.
9. **Fuel DEPTH (denomination), not fuel quantity, is the dominant throughput
   lever — and don't consolidate small blocks by hand.** A frontier op's work is
   ~digits(result)³; one fuel block finishes it iff block-value ≥ that work. The
   tree root is 2^(2^depth), so deepening the tree one step squares the fuel
   denomination and finishes far more op-work per action. Going depth-3 → smart
   depth (≈5 in range) bought **+43–49 orders**. Corollary: *consolidating loose
   1s by hand is a trap* (~0.5 fuel-value/action vs ~256 for taking backbone
   fuel; and the 1s are ~1% of fuel need) — the right fix for "wasted 1s" is
   making fuel abundant (deep), after which they're irrelevant. Over-building
   fuel is also harmful (later trees hit the build-cost wall and never finish).
10. **Width (cell count) is FREE throughput — set it wide from the START, don't
    scale it gradually.** Each cell runs at `baseRate` for free, in parallel
    (Architecture B), so more frontier mults = more free op-progress. With deep
    fuel, 16 mults is the peak (+41/+44 orders over 4); past ~16 a single tree's
    fuel dilutes and it regresses. But *adding* mults mid-climb steals `op0` from
    the leader and underperforms — fixed-wide-from-start beats gradual auto-width.
    Corollary on measuring: the deep regime (≥~1e90) is **sawtooth-noisy and
    order-sensitive** — compare configs at the same rate/window and trust trends,
    not single values (I mis-read both "width fragments" and "concentrate wins"
    from uneven comparisons before pinning them down).
11. **Milling for fuel was tested and REJECTED — you can't fragment up a
    multiplicative ladder.** The Mill is an *additive* splitter (score-conserved);
    the frontier grows by *multiplication* (super-additive). So recycling a result
    R as op0 (→ R×m) strictly beats milling it into 16 pieces (→ max (R/16)×m), and
    milling can't create fuel-value. In the natural agent the mills sat idle (op0
    consumes every result first); forced to run, milling **collapsed the climb
    2.7e126 → 1.7e7**. The Mill's real role is **spatial delivery** (liquefy a
    frozen big block so it can be moved/stored), which has no benefit in the
    friction-less sim — it's a convenience/logistics tool, not an efficiency lever.
12. **"Fuel must chase number production" = a fuel LADDER — and a ladder can't be
    a physical/piped network, so don't build one.** A cost that scales with the
    frontier needs *scaling fuel*, which needs tiered amplification (α.5c's
    ladder). But the branch's transit rule freezes big blocks (pipe-able fuel caps
    at ~mag 2000) and frontier-scale fuel is far above that, so the ladder can
    only be *hand-operated* — which no action budget sustains (proven across
    milling, force-fuel, and ladder agents: all stall ~1e16–1e21). Corollaries:
    (a) the α.5c ladder worked because it was **abstract bookkeeping** (the
    Literature auto-deducted the pyramid), not a physical factory; making it
    spatial breaks it. (b) The workable lever is **bounded** — fuel as an
    *accelerant* of a (digits^k, small, pipe-able) cost, not a frontier-scaling
    *requirement*. So: reduce amplifier baseRate so fuel *matters*, + diminishing
    overpay so right-sized fuel is *optimal*. Never zero the amplifier baseRate
    (the self-fueling cascade then collapses — the free base can't feed it).

---

## 5. Next up — the full design / UX / polish pass (this session's pivot)

Goal: before the human playtest, make the prototype **feel finished** — proper
design, UI/UX, animation, game-feel — at the now-known ~25–50-cell / e26–e45
scale. This is a *brainstorm-first* pass (the user wants to ideate together),
not a slice list yet. Candidate threads to develop with the user:

- **The "draws-itself" feedback channel** (TIME_AS_LABOR §6): build-sketch-in,
  stroke-by-stroke result fill, sliding transit numerals, the completion
  flourish, long-op progress meters. How much is live vs. aspirational?
- **The pressure→relief "whoosh"** — animation that *sells* the speed jump when
  you feed/build/supply. Tie to a `physics.ts`-style juice layer (the old game
  had one; this branch may not yet).
- **Readability of big numbers** — the value-label ladder at e26–e45, and
  reading factory state (idle vs working vs starving) at a glance.
- **Onboarding / the opening 60 seconds** — the bootstrap must teach itself.
- **Layout legibility** at 25–50 cells — areas (Farm / Production / Reprocessing),
  zoom, the canvas-as-board feel.
- **Narrator voice** — dry-academic marginalia on *duration* (deferred slice 5.4).

Build status to maintain every slice: `npm run build` clean, `npm run check`
0/0, `npm test` 45/45, `npm run test:e2e` green.

---

## 6. House rules / constraints

- Develop on **`time-as-labor`** (user-authorized; tracks `origin/time-as-labor`).
  All session work lives here. Don't push elsewhere without explicit permission.
- **Pencil aesthetic is non-negotiable.** Penciled, slightly imperfect. Pull
  text from `pixi/typography.ts`; color only for meaning.
- **Small slices, validate by playing.** The user playtests after each.
- Don't create PRs unless explicitly asked. Keep GitHub replies frugal.
