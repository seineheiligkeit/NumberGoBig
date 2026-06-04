# Session handover — *Time as Labor* prototype

*Last updated: 2026-06-04. Branch: `time-as-labor`. Read this first when picking
up. The design north star is [`TIME_AS_LABOR.md`](./TIME_AS_LABOR.md); the
sliced plan + full progress log is [`TIME_AS_LABOR_PLAN.md`](./TIME_AS_LABOR_PLAN.md).
This file is the fast on-ramp: where we are, what we learned, what's next.*

---

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
  - Tests: `engine.test.ts` + `time.test.ts`, **38 unit tests** incl.
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
| `strategy-test.ts` | Smart vs naive at high APM. **Concentrate-one-frontier beats naive-spread by ~13 orders.** |
| `manager.ts` | Active management (shuttle/fuel/rebalance) → climbs to ~1e24 where a static factory plateaus. |
| `factory-agent.ts` | A fully-piped balanced multiplication tree; surfaced the round-robin-emit fix + the depth-vs-throughput wall. |
| `logistics.ts` | Transport as a real constraint: distance starves a pipe; parallel pipes + accelerators recover it. |
| `agent.ts` | Production economy in isolation (free logistics) — confirms the exponential climb is sound. |
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
5. **The agent's *strategy quality* is the deep skill edge.** Concentrate +
   out-fuel one frontier ≫ naive spread. A good economy rewards thinking, and
   ours does (~13 orders at high APM).
6. **Beware sim agents that over-build or self-sabotage.** `play.ts` first
   spam-built 100+ never-finishing fuel trees, and a greedy fuel selector torched
   the frontier as fuel. When an agent's numbers look wrong, suspect the *agent*
   before the economy.
7. **Sim gotchas:** huge `Decimal`s (layer-2/3) slow everything → cap windows /
   early-stop at targets. `node --test` needs the glob `'core/**/*.test.ts'`.
   Test files are excluded from `svelte-check` (tsconfig) so `node:` builtins
   don't leak into app type-checking. Playwright uses the pre-installed
   `/opt/pw-browsers/...chrome` with swiftshader (CDN download is blocked).

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
0/0, `npm test` 38/38, `npm run test:e2e` green.

---

## 6. House rules / constraints

- Develop on **`time-as-labor`** (user-authorized; tracks `origin/time-as-labor`).
  All session work lives here. Don't push elsewhere without explicit permission.
- **Pencil aesthetic is non-negotiable.** Penciled, slightly imperfect. Pull
  text from `pixi/typography.ts`; color only for meaning.
- **Small slices, validate by playing.** The user playtests after each.
- Don't create PRs unless explicitly asked. Keep GitHub replies frugal.
