# Session handover — *Time as Labor* prototype

*Last updated: 2026-06-10. Branch: `time-as-labor`. Read this first when picking
up. The design north star is [`TIME_AS_LABOR.md`](./TIME_AS_LABOR.md); the
sliced plan + full progress log is [`TIME_AS_LABOR_PLAN.md`](./TIME_AS_LABOR_PLAN.md).
This file is the fast on-ramp: where we are, what we learned, what's next.*

---

## 0. Latest

**BUILD SLOTS ("one pencil") + the FROM-ZERO gameplay agent + new presets
(2026-06-10, same session).** Construction is now a strategic QUEUE, and the
challenger plays the whole game from an empty canvas under the live rules.
**The manager is RETIRED as the gameplay benchmark** — use
`sim/challenger.ts --live --from-zero`. Suite: 61 unit + 8 e2e, check 0/0.

- **The slots law** (`TimeTuning.buildSlots`, 0 = off, GAME_TUNING = 1; engine
  `currentBuildSlots`/`buildQueuePosition`): only the first K unbuilt cells
  (placement order) draw the free baseRate; the rest queue. **Fuel rushes any
  queued build** (1:1, grade-agnostic) — concurrency is priced, not forbidden,
  so the feel-bad "wait 40 min" wall can always be paid through. Slots grow at
  the shared `BUILD_SLOT_MILESTONES` (1e6/1e12/1e30/1e100, judged against the
  new `world.peakMagnitude`) — one rule for game AND sims. View: №k-in-queue
  badges, "a second pencil" narrator beats, a pencils row in the monitor.
- **From-zero agent** (`--from-zero`): staged, gated build program (starter
  tree → mults → depth-3 → exps only after the 1e9 unlock → depth-4),
  fuel-rushed builds, **sticky launch campaigns** (lock the note band when
  stocking starts — a target re-derived from a moving apex never fires), and
  **the Mill as the note-minter** (one pass splits an oversized block into 16
  in-band notes; merges almost never land in the 1.8-digit band — the Mill is
  now structurally essential, worth ×10³⁷ digits in the 1/s run).
- **THE PACING RESULT (4 h from zero, live rules):** frontier is FLAT across
  a 30× action-rate spread — 1/30 s: e305 · 1/10 s: e210 · 1/3 s: e231 ·
  1/s: e283 (differences = launch-sawtooth noise). **Strategy dominates APM
  by construction**; returns on extra actions saturate at ~1 action/10 s.
  There is always something worth doing (agents found useful actions at every
  rate), but never a reason to spam. Early game is where rates differ
  (build-out takes ~40 min at 1/3 s vs ~20 min at 1/s); late game equalizes.
- **Presets rebuilt** for the current rules (`presets.ts`): Opening (with a
  visible build queue) · Mult factory (pre-1e9) · Launch prep (a staged first
  launch: base+exponent fed, four in-band notes beside it) · Powered age
  (warehouse-fed accelerator pipe + a mill with oversized blocks to shred).
  All four verified loading + ticking headlessly, zero console errors.
- **Design finding for later:** scaffolding is RECURSIVE at scale — minting
  notes by exponentiation needs smaller notes, a ladder of preparations all
  the way down. A planning player can launch far more often than the greedy
  agent (e283 at 1/s is a FLOOR). The ladder is the late-game engineering
  puzzle, unprompted.

**SLICES 2 + 3 — the new economy is LIVE in the game (2026-06-10, same
session; awaiting the human playtest).** `GAME_TUNING` now opts into
`scaffoldCoeff: 1` (the Slice-1 candidate: α=0.5, band=64, floor=1e6) and
`accelChargeCarry: 1`. Suite: **57 unit tests + 8 e2e green**, check 0/0,
build clean, preview-verified (zero console errors).

- **Slice 2 (view):** Exponentiation is no longer drafted by building a mult —
  it UNLOCKS at the one-billion frontier milestone ("…be warned, it will
  demand to see your work"). A scaffolded op draws a second, DASHED outer
  ring (notes paid / required) around the clock-sweep; narrator beats for the
  first scaffold demand (with the actual band numbers), the first paid launch
  (flash + milestone sting), and both band refusals ("your finished result is
  not scratch paper — Mill it down, perhaps"). Accelerators read
  `carries ≤X` (their charge = what covered pipes can ferry).
- **Slice 3 (engine, `accelChargeCarry`):** powered logistics — a block
  entering a pipe covered by a charged accelerator gets effective transit
  magnitude `m/(1+charge·carry)`, computed at entry (warehouse withdrawals
  too). Charge can be FED BY PIPE (applyFuel on an accelerator adds charge),
  decays per tick (the standing burn), so late-game note delivery is
  automatable. The Mill already right-sizes: a block in (S, 16·S] mills into
  16 in-band notes in ONE pass. Off in DEFAULT_TUNING; 3 new engine tests.
- **World counters** for session telemetry: `world.produced` (blocks emitted)
  and `world.burned` (fuel magnitude spent — ops, builds, charge). The
  challenger reports a 12-row session timeline (`--rate` single runs).
- **Cadence watch-item for the playtest:** at engaged pace the 8 paid
  launches FRONT-LOAD (all within ~20 min, then a 3–4 h rebuild before the
  9th — inter-launch periods grow with digits). Casual pace is lovely (one
  launch mid-session). If the playtest wants evener spacing, higher α
  (smaller, cheaper jumps) is the lever — needs the hardened sweep agent
  first.

**SLICE 1 — SCAFFOLDING ("show your work"), the exponentiation pacing law
(2026-06-10, built sim-first, awaiting review before promotion).** The
challenger's exp snowball (learning #14) is closed by a new law in
`core/time.ts` + `core/engine.ts`, behind `TimeTuning.scaffold*` knobs (**off
in DEFAULT_TUNING** — the live game is untouched until the values are locked):

- **The law.** An exp-tier op (exponentiation+) producing output magnitude M
  demands `S = scaffoldCoeff·(M^α − floor^α)` of burned magnitude (its
  *working notes* — the intermediate powers), payable ONLY in blocks within
  the denomination band **[S/scaffoldBand, S]**. Blocks above the band are
  refused outright (your finished result is not scratch paper) — this is what
  breaks the burn-the-output-to-fund-the-next-jump chain. baseRate never pays
  it; outputs ≤ scaffoldFloor (1e6) are a free toy. Multiplication is NEVER
  scaffolded (the locked accelerant economy is its whole cost model). Reuses
  the V2-era `fuelRequired/fuelPaid` machinery + a new `op.scaffold` band.
  **7 new tests (61 total).**
- **Validated shape (challenger, scaffolding-aware, C=1 α=0.5 band=64, 4 h):**
  the 10^10^236,740-digit tower collapses to a paced sawtooth — engaged (1/s):
  **e4978 via 8 PAID milestone launches** (~one prepared launch / 30 min,
  ×1.5–2 digits each, forced pyramid rebuild between); casual (1/30 s):
  **exactly 1 paid launch**, e151 vs e118 no-exp. Sub-floor toy exps stay
  free and harmless. Mult-only baseline: e149 — exp is a real, earned edge.
- **Candidate lock: α=0.5, C=1, band=64, floor=1e6.** α sets milestone size
  (launch ≈ ×1/α digits when stocked); C taxes SMALL jumps hardest (C=1000 →
  exp break-even — too harsh); band sets how many chunks a launch is paid in.
- **Honest caveat for the next pass:** the α/C cross-sweep
  (`sim/scaffold-sweep.ts`) is confounded by AGENT brittleness — the
  challenger's mint-targeting hardcodes a 1.5× launch target and a single
  note band, so off-candidate settings measure the agent, not the law
  (non-monotonic α rows, C=30 ≡ C=100 byte-identical). Before locking
  anything other than the candidate, harden the sweep agent: multi-target
  stocking, per-α adaptive launch sizing, and judge cadence by **paid**
  launches (the `paidExps` metric) — never raw launch counts.
- Strategy lessons that cost real debugging, for the agent-hardening pass:
  toy exps must COMPETE with merges, never short-circuit them (a 1/30 s run
  spent its whole session on 16^4 hops); the mint band must derive from the
  prospective launch's notes (α·D*), not from the apex; micro-launches drain
  the notes the big jump needs — gate paid launches at ≥1.5× apex digits.

**THE FUEL-ECONOMY LOCK — 0.5/0.5 promoted to `DEFAULT_TUNING` (2026-06-10,
the tuning session).** The two knobs from the entry below were sim-tuned across
the full human rate range and **locked at `amplifierBaseRateScale: 0.5,
fuelOverpayExp: 0.5`**. `GAME_TUNING` is now just `{ ...DEFAULT_TUNING }` —
game and sims share one economy. The pre-lock "vanilla" economy is available
only by passing `{ amplifierBaseRateScale: 1, fuelOverpayExp: 1 }` explicitly
(`fuel-overpay.ts`'s baseline row does; `manager.ts` / `play.ts` CLI flag
defaults now read `DEFAULT_TUNING`). Tests are **47** (two new lock-guards pin
the halved amplifier base + the √ overpay law in the engine).

- **Decision evidence (4 h windows, both probes).** The **manager**
  (optimal-play probe, 14 400 ticks) is **strictly monotonic across the whole
  human range only at 0.5/0.5**: 1/60 → 1/s gives e19 → e24 → e34 → e41 → e43,
  no saturation — every step of engagement is rewarded. The competitors fail
  on shape: (1, 0.5) and (0.25, 0.5) saturate by ~1/3 s; (0.5, 1) leaves
  overpay free (half of "fuel matters" undone); (0.5, 0.3) just compresses.
  Fuel-dependence at 1 action/s: **−91 oom vs vanilla**. Idle never stalls
  (e17–e19 from zero in 4 h).
- **`sim/play.ts` grew tuning flags** (`--amp-base S`, `--overpay P`) **and an
  honest-competent upgrade** (learning #8 — the agent must change with the
  game): smallest-one-shot fuel pick using the engine's exact
  `grade^(1-p)·V^p`; the fuel band capped at **the grades the agent actually
  produces** (tree roots) — burning *results* as fuel torches the operand
  supply and cost 14 oom before it was caught; **two separate expansion
  pressures** (operand-starve → another depth-3 tree; grade-starve → a deeper
  tree) plus **proactive deepening** when the frontier outgrows the built
  root. See learning #13 for the signal bug not to relearn.
- **Watch-item for the human playtest:** from-zero play at *mid* rates
  (1/30–1/3 action/s) plateaus ~e22 over 4 h until the player deepens fuel —
  the breakthrough move (deep trees) must be discoverable in-game; the dev
  presets + narrator carry that teaching load. Engaged play that deepens
  reaches e36+ from zero.

**THE CHALLENGER — the manager is beaten into power-tower territory (same
session).** `sim/challenger.ts` plays the same honest harness (action budget,
peel, real wiring, 110 pre-built cells vs the manager's 111) with a smarter
policy and **crushes the manager at every rate** (10 k ticks, locked economy):
1/30 s: 4.7e21 → **10^10^1.0e10** (with only 89 hand-ops!); 1/s: 8.7e40 →
**10^10^236,740**; 5/s: 2.3e49 → **10^10^10^69,049** (a layer-3 tower). The
`--no-exp` ablation isolates the levers: pairing + result-fuel alone give
~e118 at 1/s (+77 oom); exponentiation does the rest. See learning #14 — this
is as much a **balance finding** as an agent: a player can do everything the
challenger does.

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
  grade-100 fuel finished it → 1e6; zero console errors). **Sim tuning of the
  two values: DONE — see the lock entry above** (promoted to `DEFAULT_TUNING`,
  sims re-baselined).

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
  - Tests: `engine.test.ts` + `time.test.ts`, **47 unit tests** incl.
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
over a **4-hour** session, under the **locked economy** (0.5/0.5; re-baselined
2026-06-10). **This is the scale the polish pass must serve.**

| action rate | FRONTIER | score | cells (built) | fuel trees |
|---|---|---|---|---|
| 1 / 60 s (idle)   | 1.8e19 | 7.2e16 | 25 | 1 |
| 1 / 30 s          | 7.6e22 | 3.0e20 | 25 | 1 |
| 1 / 10 s          | 7.6e22 | 3.0e20 | 25 | 1 |
| 1 / 3 s           | 1.9e22 | 4.7e21 | 25 | 1 |
| 1 / s (engaged)   | 5.3e36 | 2.1e34 | 72 | 2 |

(The manager — optimal play with a pre-built factory, same 4 h — spans e19 →
e43 monotonically over the same rates; the mid-rate plateau above is the
naive-strategy wall, broken by deepening fuel. Pre-lock vanilla numbers, for
history: 3.1e26 idle → 1.4e45 engaged.)

**Takeaways that shape the design:**
- A realistic factory is **~25–75 cells, ~30–110 pipes**. Not thousands. The
  canvas is a readable *board*, not a sprawl. Design for legibility at this size.
- Numbers reach **~1e19 (very casual) to ~1e36–e43 (engaged)** in 4 h → the
  **value-label ladder** (digits → sci → tower) is exercised constantly; it must
  be beautiful and instantly readable.
- **Idle never stalls; engagement is monotonically rewarded** (optimal play).
  Naive mid-rate play hits a **fuel-grade wall (~e22)** — by design; the game
  must *teach* the deep-fuel move. The pressure→relief "whoosh" rhythm
  (TIME_AS_LABOR §6) is the dopamine engine — animations must *sell* it.

---

## 3. The sim toolbox (how we reason about the economy)

All standalone Node CLIs (native TS, no install). Run with `node sim/<x>.ts`.

| File | What it answers |
|---|---|
| `play.ts` | **Real play from zero** at a human rate. The baseline numbers above. `--rate R --hours H --trace --amp-base S --overpay P`. Agent is overpay-aware (2026-06-10): smallest-one-shot fuel from produced grades only, two-pressure expansion (operand → depth-3 tree, grade → deeper), proactive deepening. |
| `strategy-test.ts` | Spread vs concentrate at high APM (wiring + free-merge **fixed**, stacking-aware). **Corrected finding: concentrate does NOT beat spread** — it self-starves on one fuel grade; the original "wins by ~13 orders" was a bug+early-stop artifact. |
| `manager.ts` | The honest **active-management benchmark**: real wired backbone, stacking-aware, no free-merge, **smart fuel-depth scaling** (one block ≈ one op) + **16 frontier mults** (free parallel `baseRate` throughput) + auto-fuel scaling. 10k-tick frontier under the **locked economy**: ~4.7e21 (slow 1/30) / **~8.7e40** (steady 1/s) / **~2.3e49** (fast 5/s); pre-lock vanilla was ~7.9e28 / ~2.7e126 / ~3.6e162 (`--amp-base 1 --overpay 1` to reproduce). Flags: `--rate --ticks --trace --strategy spread\|concentrate --mults N --fuel-trees N --fuel-depth N --auto-width --no-auto-fuel --no-stacking`. **Fuel-economy experiment flags (2026-06-10):** `--tax-coeff/-exp/-floor` (fuel-tax), `--milling`, `--ladder`, `--fuel-factory`, `--amp-base S` (amplifier baseRate scale), `--overpay P` (diminishing-overpay exp). |
| `challenger.ts` | **The manager-beater** (2026-06-10): same honest harness, three policy fixes — merge the two BIGGEST blocks (no ×1000 op1 cap), fuel ops with recycled RESULTS (smallest one-shot via the engine-exact `grade^(1-p)·V^p`; fuel = value is exponential in digits, work is polynomial — production is its own best fuel), and **use exponentiation** (digits(a^b) = b·digits(a) — the manager never places one). One greedy rule: start the largest-output op whose work is payable (one-shot / ≤8 chips / creep), never burning a block bigger than the op's own output; plan globally, then route the plan to an idle cell of its kind. 10 k ticks: **10^10^1.0e10 (1/30 s) / 10^10^236740 (1/s) / 10^10^10^69049 (5/s)** vs manager's 4.7e21 / 8.7e40 / 2.3e49. `--rate --ticks --trace --no-exp --no-vs`. |
| `scaffold-sweep.ts` | **The scaffolding tuner** (Slice 1): sweeps α × C × band against the no-exp baseline and the unscaffolded tower; reports digits, ×no-exp, launches, last-¼ growth. NB: off-candidate rows currently measure agent brittleness (see §0) — harden the challenger's stocking before trusting a full lock. `--rate --ticks --bands`. |
| `study.ts` | **Holistic agent study** at 3 rates: action breakdown, build accounting, value-flow (stranded/discarded), per-tick bottleneck attribution, pool composition, baseline-vs-improved. The lens for "where are the inefficiencies." `--ticks N`. |
| `fuel-overpay.ts` | **The landed-and-locked lever** (2026-06-10). Sweeps `amplifierBaseRateScale × fuelOverpayExp`; reports frontier, last-¼ growth (stall detector), fuel%. Its baseline row now requests pre-lock vanilla explicitly (DEFAULT_TUNING ships 0.5/0.5). `--rate --ticks --factory`. |
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
13. **Under diminishing overpay, fuel and operands are separate economies —
    and three agent traps proved it (the lock session).** (a) An agent that
    burns *results* as one-shot fuel torches its own operand supply: a result
    is worth ×op1 *multiplied* but only `√(grade·V)` *burned* — banding fuel to
    "the grades my trees produce" was worth +14 oom. (b) Starvation has TWO
    distinct signatures needing different fixes: mults idle-for-operands →
    widen basic (depth-3) production; ops crawling on homeopathic fuel → build
    a DEEPER tree. One counter can't drive both. (c) Judge a fuel block's
    grade-fit against the op's **full work, never the remaining slice** — tiny
    late-op top-ups read as "good fuel" and mask the starve signal entirely
    (this single comparison hid the wall for 4 sim-hours). Corollary of (a)+(b):
    rate-independent plateaus (two rates landing on the *same* frontier) mean a
    production-throughput cap, not an action cap — look at the supply, not
    the APM.
14. **The economy has an exponentiation snowball — `sim/challenger.ts` proves
    it, and a player can do it (open balance question).** Three compounding
    moves the manager never makes: (a) merge the two BIGGEST blocks (mult
    output digits = digits(a)+digits(b); the ×1000 op1 cap wastes the op);
    (b) burn old RESULTS as fuel — `fuel = value` is *exponential* in digits
    while `work = digits^k` is *polynomial*, so past ~e20 your own production
    one-shots any op even under √-overpay (need V ≥ W²/grade; the bank grows
    like 10^d, the need like d^4.5–d^6); (c) **exponentiation multiplies
    digits** (digits(a^b) = b·digits(a)) — pick the largest exponent whose
    work is still fuel-affordable and digits go hyper-exponential
    (10^10^236,740 in 10 k ticks at 1 action/s, vs the manager's e40; even 89
    total hand-ops at idle-ish 1/30 s reach 10^10^1e10). The √-overpay
    law softens but cannot close this: eff = √(grade·V) is still exponential
    in the digits of V. **Design fork to decide before/after the playtest:**
    either this snowball IS the intended discovered endgame (a very
    incremental-genre "break the curve" moment — and the pacing question is
    only how long discovery takes), or exp needs a binding cost that scales
    with its OUTPUT's digits in a way value-fuel can't trivially pay (today's
    opExponent k=4 is polynomial, so it can't bind). Bot agents should
    benchmark against the challenger, not the manager, from now on.

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
0/0, `npm test` 47/47, `npm run test:e2e` green.

---

## 6. House rules / constraints

- Develop on **`main`** (the *Time as Labor* prototype was promoted to main on
  2026-06-10, user-authorized; the pre-prototype game lives on `legacy-main`).
  Don't push elsewhere without explicit permission.
- **Pencil aesthetic is non-negotiable.** Penciled, slightly imperfect. Pull
  text from `pixi/typography.ts`; color only for meaning.
- **Small slices, validate by playing.** The user playtests after each.
- Don't create PRs unless explicitly asked. Keep GitHub replies frugal.
