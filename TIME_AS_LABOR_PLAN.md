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
