# Session handover — *Time as Labor* prototype

*Last updated: 2026-06-10. Branch: `main` (the prototype was promoted; the old
game lives on `legacy-main`). Read this first when picking up. The design north
star is [`TIME_AS_LABOR.md`](./TIME_AS_LABOR.md); the sliced plan + full
progress log is [`TIME_AS_LABOR_PLAN.md`](./TIME_AS_LABOR_PLAN.md); the UX
audit + its completed execution notes are [`UX_PLAN.md`](./UX_PLAN.md).
This file is the fast on-ramp: where we are, what we learned, what's next.*

---

## 0. Latest — state of the game (2026-06-10, the new-economy + UX mega-session)

One session built and shipped the complete economy and the complete UX pass.
Everything below is LIVE on `main`, suite green (**62 unit + 11 e2e**, check
0/0, build clean). The detail trail: the progress log in
[TIME_AS_LABOR_PLAN.md](./TIME_AS_LABOR_PLAN.md), the per-slice progress notes
in [UX_PLAN.md](./UX_PLAN.md), and the five session commits on `main`.

**The five systems (in dependency order):**

1. **The fuel-economy LOCK** — `amplifierBaseRateScale 0.5 / fuelOverpayExp
   0.5` promoted into `DEFAULT_TUNING`. Sim-validated: monotonic across the
   human rate range, idle never stalls, −91 oom fuel-dependence at 1 action/s.
   Two engine lock-guard tests pin it.
2. **SCAFFOLDING ("show your work")** — exp-tier ops demand
   `C·M^α` of working notes, payable only in the band [S/64, S]; oversized
   blocks refused (kills the self-funding exp snowball the challenger found).
   Floor 1e6 keeps toy exps free. **Candidate values α=0.5 C=1 band=64 —
   NOT yet locked** (see §0a). Exp unlocks at the 1e9 frontier milestone.
3. **POWERED LOGISTICS** — an accelerator's charge carries transit
   (`m/(1+charge·carry)` at pipe entry, pipe-feedable, decaying = the standing
   burn). The Mill right-sizes oversized blocks into in-band notes (one pass
   for blocks ≤16×S).
4. **BUILD SLOTS ("one pencil")** — construction queues in placement order;
   fuel rushes any queued build; slots grow at `BUILD_SLOT_MILESTONES`
   (1e6/1e12/1e30/1e100 vs `world.peakMagnitude`). Build order is the early
   strategic puzzle.
5. **The FROM-ZERO challenger** (`sim/challenger.ts --live --from-zero`) —
   THE gameplay benchmark (the manager is retired): gated build program,
   fuel-rushed construction, sticky launch campaigns, Mill-minted notes.
   4 h from-zero results are FLAT across 1/30→1/s action rates (e210–e305,
   sawtooth noise): **strategy dominates APM by construction**; returns
   saturate ~1 action/10 s.

**The UX pass (UX_PLAN.md, all six orders SHIPPED):** the game says what it
wants (fuel-grade readouts, never-silent refusals with JAM flashes + narrator,
overpay smoke, staged-operand labels, a/b port letters, drag-aware drop
targets, `~3m` ETAs everywhere + shelf build-cost previews); the named labor
pains are gone (sticky tools, hotkeys 1–8/Space/−+/F, Esc/right-click cancel,
box-select group move, drag-to-wire, pipe reroute-in-place + hover tooltips,
Ctrl+Z un-erase, warehouse withdraw/collect); the screen is clean at every
altitude (river slimmed + zoom-fade, numeral contrast guarantee, panel-aware
framing, collapsible cards, zoom LOD state-chips + `e22` block tags); and the
player has instruments (live inspector card with the one-shot grade-fit hint,
Σ/s + blocks/s + the two-starvation bottleneck line, the timestamped journal,
a vocabulary legend, ONE `1.23×10⁸` number language, "Apparatus"). Deferred
by design: minimap, area labels.

**Live tuning seams:** `GAME_TUNING` (game-view.ts) = DEFAULT + `scaffoldCoeff
1, accelChargeCarry 1, buildSlots 1` — these three are the candidates the next
session locks (the lock→promote→re-baseline pattern is established).

**Tooling notes:** the preview-MCP screenshot capture hangs against this WebGL
page — use the Playwright harness scripts in repo-ignored `tmp-uxaudit/`
(`uxshot*.cjs`). World telemetry counters exist (`produced`, `burned`,
`peakMagnitude`); the challenger prints a 12-row session timeline on single
runs.

## 0a. THE UNIFIED LAW — built sim-first (2026-06-11); supersedes the agenda below

The tuning session pivoted to a RE-ANCHORING: one closed form replaces the
grade/overpay/scaffold zoo. **"An operator k tiers up is paid k rungs down":
need = M^(1/2^k)** (mult √M, exp ⁴√M), band [need/16, need], pro-rata (full
need completes the work); optional for mult (fuel = speed), mandatory notes
for exp+ above 10⁶. **Material bills** gate construction (first mult = a 16 —
addition's moment; first exp = a MILLION; repeats √peak ×1.1 tight band;
successor/addition waived forever — pencils throttle leaves). **Pencils per
rung** (digits 6/12/24/48…). **Addition d^1.5** — the always-cheap machining
op; band-fitting by binary-fill (2^a sums) is its recurring job. All in
`UNIFIED_TUNING` (`core/time.ts`); legacy baselines byte-identical; 71/71
unit, check 0/0. Challenger `--unified --from-zero` machines bills
(pool → mill → mult-pair → adder binary-fill) and walks the whole ladder:
**adder 0.8m → mult 2.0m → mill 8.3m → exp 12.0m → first launch 17.3m → 5
paid launches → e4932 in 4 h @ 1 act/s** (1/3 pace: mult 2.6m, exp 33.9m;
1/10: mult 8.2m, exp 55.2m). Discoveries worth re-reading: pure
√M-for-everything NEUTERS exp (cost depends only on the landing point — every
step caps at digit-doubling; the tier index is exp's crazy-leap license);
leaf repeat-bills tax the fractal farm (waived); **the OPERAND TRAP** — a
frontier committed to a mandatory op whose remaining notes require that very
frontier to mint is imprisoned forever → **the engine needs a cancel-op verb
before the law reaches GAME_TUNING**. Open next: agent campaign-hardening at
slow paces (1 launch then stall at 1/3—1/10), launch-cadence shaping, then
the promote-to-game pass (bills UI on unbuilt cells, tier-band displays,
cancel verb, unlock-as-answer events from the UX brainstorm).

**Follow-up (2026-06-12) — the WRITE-TIME FLOOR + the INK TAX, both prototyped
behind knobs (off by default), 77/77:** (1) `writeSpeed` (digits/tick): an op
can never complete faster than writing its output's digits — the counter-law
to pro-rata payment, without which the recursive exp tower ("exp pays for
exp": ⁴√ of a launch's output is its own operand class) runs at action-speed
(e18→e4932 in 3 min; rebuild-enabled agent: e9864 by minute 54). At 0.5 d/s
the 4 h arc forms geometric ERAS (20 min → 82 min → 5.5 h writes); user wants
gentler (≈2 d/s) with pacing carried by (2) the INK TAX (`upkeepCoeff`):
holding wealth demands a FLOW of small numbers — demand = coeff·(digits(score)
− 7), auto-pulled from the pool, payable ONLY in blocks ≤ 16×demand (the
frontier can never pay its own rent — only a broad small-number economy can);
coverage EMA throttles writeSpeed + amplifier baseRate down to a 0.25 floor
(never 0; wealth never confiscated — idle-safe). Sweep at write 2 d/s: off →
48 launches/e9864-peak blowup; ×1 → exp 33 m, launches 41/43/48 m, e154 (the
"spread out" pacing); ×10 → path-dependent (agent artifact); ×100 → walls at
e9. Open: agent is not ink-aware (never builds dedicated leaf farms — arcs
are lower bounds; the broadened-base strategy needs a playtest or smarter
agent), the no-floor frontier-loss forensic, notation-ladder tax for
tetration scales (digits itself goes astronomical at layer 2), and the
cancel-op verb before any of this reaches GAME_TUNING.

**Follow-up 2 (2026-06-12) — the LEDGER, the continuous throttle, and the
DIVISOR-MILL (engine+view shipped; agent hit its ceiling).** (1) Upkeep is now
paid from a wired **`ledger`** cell's store, never auto-pulled from the pool
(deposits by pipe / drag / `feedOperand`; oversized deposits sit visibly and
withdrawable; rent pays largest-in-band-first across all built ledgers; the
office glows as it spends). (2) Throttle is continuous: `floor + (1−floor)·
coverage^γ` (γ=2, floor 5%) — near-full coverage barely hurts, an empty
ledger is dramatic. (3) The Mill is the **divisor-mill**: port 0 = dividend,
port 1 = the GEAR (a fed number, consumed on set, retained across firings,
factory default ÷16; `millDivisor`); output = ONE stack of ⌈gear⌉ pieces
(conserved partition, `emitMany` fills attached pipes then piles the rest).
**No divisor cap — scale-invariance comes from the write floor: a mill WRITES
every piece** (minTicks = Σ digits·count), so ÷16 is quick, ÷10⁶ is a
million numerals; cascades pipeline, giant gears serialize. View: § Ledger
tool/glyph/role/inspector (rent · coverage · pays-with) + monitor "ink
(rent)" row + bottleneck line; mill shows its ÷gear. Dev preset
**`inkdistrict`** switches `world.tuning` onto unified+write+ink rules
(loadPreset now resets tuning to GAME_TUNING first). Verified end-to-end in
the browser: rent 3/s, coverage 6%→84% on funding. 81 unit + 11 e2e, check
0/0. **Agent verdict: the organically-grown challenger cannot play the
three-way economy** — rent vs launch-notes vs bills compete for the same
denominations, and it deadlocked three distinct ways (hostage mandatory op
starved by rent priority; action leak; float-dust denominations from mill
pieces). Decision: STOP patching; next session writes a fresh
**`sim/player.ts`** (unified-era only, subsystems: builder / ink keeper /
machinist / launch director; challenger frozen as the legacy benchmark),
then produces the natural agent-snapshot presets + arc data the design
review needs.

**Follow-up 3 (2026-06-12) — THE PLAYER (`sim/player.ts`), the fresh ink-era
agent + gameplay snapshot presets.** Clean rewrite around a CLAIMS BOARD
(every need registers {band, amount, prio}: 0 op-notes, 1 bills, 2 rent,
3 stock; nobody takes a pool block a stricter claim still needs) with four
subsystems: BUILDER (staged program + reactive widening — one mult per ~2
frontier digits; pads are pools, not single benches), MACHINIST ("make
blocks in [a,b]": mill-with-re-gear → mult pair → adder doubling),
INK KEEPER (a PREPENDED ÷16 mill cascade piped into the Ledger — bulk debris
first, hand top-ups second), LAUNCH DIRECTOR (apex⁴ plans, full-coverage
starts only). Hard-won agent rules: take BOTH operands before feeding either
(a half-fed pad is dead); 2-act moves set `wantBudget` so 1-act spenders
stand down (at 1 act/s the budget never reaches 2 otherwise); blocked grows
register their fuel want as a claim (the goal gap that froze v0).
`INK_TUNING` (unified + write 2 d/s + tax ×1) is the named candidate ruleset
in `core/time.ts`. **4 h @ 1 act/s: mult 1.9m → ledger 11.6m → mill 12m →
exp 22.7m → launch 55m → TOWER at 192m (launches 2–6 in three minutes,
e14→e212), worst ink 18%.** `--snapshots` freezes the run at its landmarks →
`sim/snapshots/player-*.json` → copied to `src/lib/view/snapshots/` and
rehydrated as dev presets (Player: first machines / the rent begins / launch
pads / first launch / the tower) under INK_TUNING. Open findings for the
next tuning pass: the 55→192m rebuild trough (intrinsic 3-copies pyramid
cost — is it an era or a desert?); **pace sensitivity is now superlinear**
(1/3 act/s: exp 5.5 h, ink hit 0%; 1/10: stuck at 4096 — the throttle
compounds slowness; against the "capped from APM" goal, wants a rent-floor/
coeff pass); engine mill pieces get a near-integer snap (dust guard).

**Follow-up 4 (2026-06-12) — the idle-pace stall was the AGENT, not the law.**
Action accounting (`Result.actionsBy`, printed per run) traced the 1/10-pace
freeze to a machinist treadmill: greedy adder pairing overshot the ×1.1 bill
band (48+32=80 > cap), stranding dead blocks — 96% of an 8 h session spent
on unpayable bills. Fixed with BAND-AWARE pairing (largest pair whose SUM
stays ≤ cap). Second lesson: a flat ink-action cap self-locks (ink capped →
coverage 0 → throttle stalls all actions → ink stays capped); bulk cascade
feeds are now EXEMPT (one fed mid-block ≈ half an hour of rent — the best
action in the game), only hand top-ups/rent-machining are rationed, and the
cascade prefers the SHALLOWEST entry (deep equal-split cascades multiply
block COUNT exponentially — the geometry that makes the frontier unrentable
also makes deep liquidation impossible: ink must come from mid-tier FLOW,
not wealth). Results: **1 act/s 4 h → e473, 7 launches (cadence 30/30/83/85/
126/155/155 — real eras); 1/3 8 h → e105, 4 launches; 1/10 8 h → e77, 2
launches** — idle play progresses (the user's contract holds). Coverage
transiently hits 0 after each launch (rent ×4 spike outruns the cascade,
then recovers) — drama by design, EMA tunable. Snapshots regenerated from
the better run (123-cell tower).

**Follow-up 5 (2026-06-12) — the tuning pass, round 1: knobs + sweep built,
coarse grid run (0/27 pass — informative).** New engine knobs, both tested:
`upkeepGraceTicks` (THE DELAYED SHOCK — a rent spike >2× opens a full-speed
grace window while the coverage gauge falls; the bite lands when it expires)
and `firstBillScale` (multiplies first-of-kind bills only). `sim/ink-sweep.ts`
grids writeSpeed × upkeepCoeff × firstBillScale against THE PLAYER at 1/s 4 h
+ 1/10 8 h and scores against the locked targets (opening 3–8 m mult /
20–35 m exp / 30–50 m launch, burst ≤3 per 30 min, idle launches ≤5 h &
≥20 digits, spread 3–15×, chore ≤30%). `sim/player.ts` gained --bill/--grace.
COARSE-GRID READINGS: bill ×4 fixes the engaged opening (mult 3.1 m) but
KILLS idle (bills eat 93% of actions — repeats at √peak compound on top);
tax ×2 + bill ×1 tames bursts (2–3) but leaves the opening fast; chore% pins
at the 34% ration cap nearly everywhere; nearest miss = ws 2 · tax 2 ·
bill 1 (failing only mult-too-early + launch-slightly-early). NEXT-ROUND
PLAN: (1) the opening lever should be BUILD TIME, not bills — a
`buildTimeScale` knob (pencil time is idle-friendly pure time; bill scaling
is labor that compounds) — and (2) kill the chore pin by AUTO-WIRING a
dedicated tree → mill-chain → Ledger in the agent's builder (rent should be
infrastructure, not clicks); then the fine sweep around ws 2 · tax 2.

## 0a-prev. The original sim-tuning agenda (superseded by the unified law)

1. **Harden the sweep agent, then lock the scaffold values.** The α/C/band
   cross-sweep (`sim/scaffold-sweep.ts`) is currently confounded by challenger
   brittleness: its mint-targeting hardcodes a 1.5× launch target and one note
   band, so off-candidate rows measure the agent, not the law (non-monotonic α,
   C=30 ≡ C=100). Needed: multi-target stocking, per-α launch sizing, judge
   cadence by **paid** launches (`paidExps`), and ideally the recursive
   note-LADDER (notes for notes) the design implies — the agent only climbs
   the first rung today.
2. **Launch cadence shaping.** At engaged pace paid launches FRONT-LOAD (the
   8 launches land in the first ~20 min; the 9th is 3–4 h of pyramid rebuild
   away — periods grow superlinearly with digits). Casual pace is well-spaced
   (1/session). If playtest wants evener spacing: α↑ = smaller, cheaper, more
   frequent jumps; also consider whether the rebuild curve should be the
   sawtooth (intended?) or flattened.
3. **The mid-rate teaching wall.** From-zero play at 1/30–1/3 action/s
   plateaus (~e22 in the old measurement) until the player discovers deep
   fuel; presets + narrator carry the teaching today. Verify the wall is
   discoverable-through, or tune (fuel-tree depth hints? unlock beat?).
4. **Slot schedule + opening pace.** `BUILD_SLOT_MILESTONES` and
   `buildSlots: 1` are first guesses. Check the opening build-out feel at
   1/3–1 action/s (~20–40 min to a full starter factory) and whether slot 2
   at 1e6 lands at a satisfying moment.
5. **Promote what survives.** Locked values go GAME_TUNING → DEFAULT_TUNING,
   sims re-baselined (`play.ts` table, challenger from-zero table, HANDOVER §2),
   lock-guard tests added — the same ritual as the 0.5/0.5 lock.

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
as the resource**. It is buildable, tested, economically validated by sim
agents, and fully polished (the P-pass §0b and the UX pass UX_PLAN.md are both
done). It has **not yet had a human playtest** — that comes after the sim-tuning
session (§0a).

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

## 5. Next up

**SIM TUNING — see §0a for the full agenda** (harden the sweep agent → lock
the scaffold values → cadence shaping → slot schedule → promote + re-baseline).
After that: the human playtest. The polish pass (§0b) and the UX pass
(UX_PLAN.md, all six orders) are both DONE — the prototype teaches itself,
answers questions, and stays legible at every altitude.

Build status to maintain every slice: `npm run build` clean, `npm run check`
0/0, `npm test` 62/62, `npm run test:e2e` 11/11 green.

---

## 6. House rules / constraints

- Develop on **`main`** (the *Time as Labor* prototype was promoted to main on
  2026-06-10, user-authorized; the pre-prototype game lives on `legacy-main`).
  Don't push elsewhere without explicit permission.
- **Pencil aesthetic is non-negotiable.** Penciled, slightly imperfect. Pull
  text from `pixi/typography.ts`; color only for meaning.
- **Small slices, validate by playing.** The user playtests after each.
- Don't create PRs unless explicitly asked. Keep GitHub replies frugal.
