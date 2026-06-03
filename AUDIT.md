# Numbers Go Big! — Design & Architecture Audit

**Date:** 2026-06-03
**Scope:** Full game (Phases 1–6 + V2 Adversary + V3 Clash + V4 Sets), the
`core/` / `src/` / `sim/` trees, pacing, economy, and onboarding.
**Method:** Source-code read (not the design docs — DESIGN.md / ROADMAP.md are
aspirational and frequently mark features "design vision, not built"). Findings
are evidence-backed with `file:line` references and severity tags. Pacing
figures are from `node sim/run.ts` / `analyze.ts` / `adversary.ts`.

Severity legend: **[CRITICAL]** ship-blocking or principle-violating ·
**[MAJOR]** significant · **[MINOR]** small · **[OBSERVATION]** neutral note.

---

## 0. Verdict

**The foundation is excellent; the three newest systems are not yet pulling
their weight.** Phases 1–6 — the operator ladder, the Comprehension spine, the
α.5c fuel economy, and the `core/` refactor — are well-built: clean module
boundaries, exceptional type hygiene, a single coherent progression axis, and
admirable sim-first discipline. But **V2/V3 combat, V4 sets, and the number
families each violate the project's own north-star pillar — "the best new
mechanics integrate, they don't isolate"** — and in two cases the headline
design promise is thematic, not mechanical. The entire codebase rides on **zero
automated tests**.

Framing for the whole document: *the project has one deep system pretending to
be a platform for many shallow ones.* The discipline that made the early phases
good (sim-first, integrate-don't-isolate) slipped in V2–V4. The highest-value
work is to **consolidate the systems already present into the one deep loop
before widening further.**

---

## 1. Strengths (protect these)

- **[OBSERVATION] `core/` purity holds.** No `core/*` file imports pixi, svelte,
  DOM, or `src/lib/*` at runtime — the headless sim can import it. The old
  cell-types↔pixi TDZ cycle is gone (constants lifted to `core/cell-geometry.ts`).
- **[OBSERVATION] Exceptional type hygiene.** Across `src/` and `core/`: **0
  `as any`, 0 non-null `!`, 0 `@ts-ignore`, 0 `eslint-disable`.** The 51 `as`
  casts are localized to the save-deserialization boundary (`persistence.ts`)
  where they're justified. `core/` has zero real casts.
- **[OBSERVATION] The Comprehension spine is a genuine design achievement.** One
  axis (`valueComprehensible`, `core/value.ts:860`) gates manual lift, the
  cell-output jam (`world/index.ts:1142`), pipe placement *and* runtime, T-bots
  (`bots.ts:299`), and combat difficulty (`adversary.ts:162`). That coherence
  is rare.
- **[OBSERVATION] Macro pacing hits its targets.** Tetration **4h11m**,
  Pentation **11h48m** (sim) vs the ~5h / ~12h locks.
- **[OBSERVATION] `physics.ts` is a clean, leak-free, visual-only layer.** Every
  tick checks `c.destroyed` and evicts; particles hard-capped at 160; `punch`
  is scale-only so it never moves a hit-tested position.
- **[OBSERVATION] Persistence is robust.** Complete v1→v18 migration chain;
  load failures degrade to "start fresh," not a crash.

---

## 2. The central problem — integrate vs. isolate

This is the thread tying the audit together, measured against the project's own
stated pillar and its canonical example (Inversion exists to give Subtraction /
Division economic purpose).

### 2.1 Combat's core promise is thematic, not mechanical — [CRITICAL]

V2's entire pitch: *the number-reducing operators (Subtraction, Division,
Factor, Decrement, Negation, Inversion), useless for building score, become the
weapon tree.* **This synergy is not in the code.**

- Batteries are **standalone shop-bought cells** (`placementCellType:
  'battery'`, `core/catalog/entries.ts`) that pull **generic positive ammo from
  the pool** via `spendFuel` (`adversary.ts` `fireBattery`, ~`:450-478`). The
  player's *placed* Subtraction / Division / Factor / Decrement / Inversion
  cells **never touch an antinumber** — there is no code path connecting them.
- **4 of the 6 promised weapons have no combat implementation** (Subtract,
  Factor, Decrement, Inversion). The only true reducing-operator weapon (Negate)
  is just a battery mode (`adversary.ts:472-477`).
- The synergy ships as **glyphs + flavor text** (`battery-cell.ts:22-24` maps
  modes to `+ ÷ ± ▲`).

Why it matters most: this is the *reason V2/V3 exist*. Further balance-tuning of
the current shape cannot fix it — it needs a mechanical change. The integration
the pillar demands is something like *enemies are negative `Value`s on the Front
and your existing operator cells fire on them* (route a pipe to the Front; a
placed Division cell softens whatever is in range). The current design took the
easy path (new cell types) over the integrating one.

### 2.2 Combat does not actually threaten — [CRITICAL]

- Sim reports **0 setbacks on the optimal line** (`sim/adversary.ts`); one
  Rampart + any production trivializes it (Shield auto-feeds to `4 ×` Core HP,
  `SHIELD_TARGET_MULT=4`, and *overflow repairs the Core*, `adversary.ts:428`).
- Enemy magnitude scales off the **Comprehension ceiling, not production**
  (`waveMagnitude`, `adversary.ts:162-199`), so it's a flat **~13% tax**, not an
  allocation decision. DESIGN §V2.5's "continuous allocation decision" is not
  realized.
- **The balance sim does not describe the shipped code.** `sim/throughput.ts`
  models a `mod` battery, log-scaled cooldowns, and a throughput-fed shield —
  **none implemented** (game batteries use a flat `BATTERY_COOLDOWN_MS=1500`;
  the Shield is feed-rate-limited at one block / `FEED_COOLDOWN_MS=800`). The
  "balance source of truth" validates a different mechanic than the one that
  ships.
- **[MAJOR] Reload wipes the Front (cheese exploit).** Antinumbers / waves are
  in-memory only (`adversary.ts:46-48`); only `coreHp` / `fortifyTiers` /
  `shield` persist (`adversary.ts:183-194`, `persistence.ts:164-166`). A player
  facing an unwinnable wave reloads to clear it while keeping Shield + Core HP.

### 2.3 V4 Sets is a fully isolated toy — [CRITICAL]

- Sets have **magnitude 0** (`core/value.ts:835-839`) → never touch Total
  Score. Intended ("logic not wealth") — fine in principle.
- Exhaustive repo search: **nothing requires a set or a cardinality** — no
  Literature cost, comp tier, warehouse rule, theorem, or achievement; the sim
  doesn't model sets at all (so V4 was never costed into the pacing curve). The
  only bridge back (`count`) yields ordinary naturals you can mint more cheaply.
- The narrative hook is undercut: "Powerset + Count *is* exponentiation"
  (`entries.ts` powerset description) — but exponentiation already exists, and
  `powerSet` is hard-capped at base size 22 (`core/sets.ts:17`), so it can never
  out-produce it.

There is no economic reason to build the set subgraph. The fix is a **demand**
(gate something behind "produce a set of cardinality N," or make sets a key /
fuel for a real sink), not polish. Otherwise descope to an educational
easter-egg and stop paying its maintenance tax (§3.4).

### 2.4 Number families are mostly decoration — [MAJOR]

| Family | Sink | Verdict |
|---|---|---|
| Negative | `multiplication` unlock demands 20 (`entries.ts`); fuels Inversion + Negate battery | Load-bearing (one-shot) |
| Prime | `exponentiation` unlock demands 30 | Load-bearing (one-shot) |
| Irrational | `tetration` unlock demands 10 — the *only* sink | Barely load-bearing |
| Rational | **No entry requires a rational** | **Pure decoration** |
| Complex | **No sink, no requirement** | **Pure decoration** |
| Set | `count` bridge exists; **nothing consumes sets** | **Isolated subsystem** |

Negatives / primes / irrationals are **one-shot taxes**: `analyze.ts` shows the
player produces exactly the unlock requirement once, then each family is <0.2%
of total play ticks. The catalog explicitly tried to prevent "bought once and
abandoned"; the predicate tax delays it by exactly one unlock.

---

## 3. Correctness & architecture (developer hat)

### 3.1 Latent crash: sets in numeric operand ports — [MAJOR]

Nothing in `tryFeedPort` (`interaction/attach.ts`) checks operand kind, so a
`'set'` block can be dropped on an Addition/Multiply/etc. operand port.
`valueAdd(set, x)` reaches `toRationalParts(set)!` which is `null!` →
**uncaught `TypeError`** (verified `core/value.ts:198-213`, same for
`valueSub`/`valueMul`/`valueDiv`). `valueTetrate(set, 2)` instead **silently
coerces the set to 0** and emits `0↑↑2` (`core/value.ts:385-390`). Fix: refuse
sets at numeric operand ports, or add a `'set'` refusal in each numeric
`operate` case.

### 3.2 Comprehension gate bypassed for sets in two sites — [MINOR]

`pixi/block.ts:280-284` and `pixi/setup.ts:87` use `valueExceeds` (magnitude
based) instead of `valueComprehensible` (cardinality based). A set's magnitude
is 0, so a 4-million-element set always renders at full alpha and is
auto-discovered instantly — defeating the comp-gates-discovery rule for sets.

### 3.3 Other set-coercion footguns — [MINOR]

- Set cells fire **for free** — `ladderPosition` returns -1 for set types
  (`core/cost.ts`), so `fuelLadder` is empty and `consumeFuelLadder({})`
  short-circuits true. Harmless today, unguarded.
- `<10` / `<100` rule warehouses **accept sets** (magnitude 0 < threshold,
  `core/warehouse-rules.ts`), mixing logic objects into numeric storage and
  sorting to the front of withdrawal.
- `valueLt(set, number)` compares cardinality against magnitude as if one axis
  (`core/value.ts:729-733`) — a latent sort-order trap if any caller sorts mixed
  lists.

### 3.4 Value-union maintenance burden — [OBSERVATION]

Of the ~21 `'set'` switch-cases in `core/value.ts`, ~12 are dummy stubs that
exist only to satisfy the exhaustive compiler (`valueNeg`→no-op,
`valueRecip`→null, `valueTetrate/Pentate/Arrow`→0, `valueIsZero/One/Negative`→
false, etc.). `'set'` is structurally unlike the four numeric variants; a
cleaner design is a separate dispatch (or refusing sets at numeric ports so the
numeric operators never need a `'set'` case). Every future operator pays this
tax.

### 3.5 Zero automated tests — [CRITICAL]

No `*.test.ts` / `*.spec.ts`, no Vitest/Jest/Playwright config, no `test`
script. The entire safety net is `tsc`/svelte-check (types only) + the sim
(which walks a *separate* model and cannot catch a bug in `world/index.ts`) +
manual playtest. ~14.5k LOC of game logic with recent large refactors (world
split, the 1840-line interaction split, V2–V4 merges) landed untested. **Pure
`core/` (`value.ts`, `cost.ts`, `sets.ts`, the `persistence.ts` migrators) is
dependency-light and trivially testable** — the highest-leverage, lowest-cost
first move. Vitest is zero-config with Vite.

### 3.6 Catalog is only half-DRY — [MAJOR]

Cost *formulas* flow from `core/catalog/costs.ts` to the sim, but the Literature
*entry list* is hand-mirrored in `sim/catalog.ts` (already diverged in
granularity: ~79 vs ~44 entries). A comment in `core/catalog/entries.ts:4-6`
claims "the game and the sim both walk" this file — **they don't** (the sim
never imports it). Either import the entry list into the sim and adapt at the
boundary, or add a CI check diffing entry ids. Fix the misleading comment.

### 3.7 God modules — [MAJOR]

- `src/lib/world/index.ts` (**1542 lines**) — the Phase B.1 split extracted only
  *types*; behavior (registries, warehouses, fuel/spend, leveling, discoveries,
  persistence-mutators) was never decomposed. Natural seams exist.
- `src/lib/adversary.ts` (**657 lines**) — simulation + rendering + its own
  persistence in one file, importing pixi directly (`Container`,
  `drawAntinumber`, `impulse`). Clearest break from the "`world.ts` is pure"
  convention. Defensible as a feature boundary, but it sets a precedent the next
  combat system will copy. Decide if it's the sanctioned pattern and document it.

### 3.8 Minor notes — [MINOR]

- `persistence.ts:328-330` v17→v18 comment says "coreHp/coreHpMax added"; the
  actual field is `coreFortifyTiers`. Doc drift.
- `add` battery requires a **single** pooled block ≥ target magnitude
  (`spendFuel`); with only many small blocks it never fires (back-pressure
  trap). Divide-to-soften is the intended workaround but isn't hinted.
- `pow2` boss magnitude uses `1 << n`, which 32-bit-overflows at very high comp
  tiers — unlikely in practice but unguarded vs the Decimal-everywhere convention.

---

## 4. Pacing & onboarding (designer hat)

### 4.1 The 9-minute dead cliff to first Addition — [CRITICAL]

Successor @20s, pipe @40s, then **Addition @ 9m25s** (`analyze.ts`) with nothing
to buy or do in between — Addition costs `ladderUnlockCost(1, 400)` = 800 zeros
+ 400 ones through a 1/sec pipe (`entries.ts`). A new player learns the toy in
60s, then gets nine minutes of watching a pipe. Highest-ROI fix in the game:
inject one interactive purchase into that window (a second Successor, a
Decrement, a cheap theorem) or cut Addition's cost ~40%. `comp_2` lands 2 ticks
after Addition, so it offers no relief.

### 4.2 The 2h50m silent cliff `pipe_8` → Tetration — [MAJOR]

~24% of the run-to-Tetration with only auto-bought warehouses occurring
(`analyze.ts`). Move a comp puzzle or a new mechanic into it.

### 4.3 ~80% zero-bound with a single lever — [MAJOR]

`analyze.ts`: ~79.7% of run-to-Tet ticks are bottlenecked on zeros; the only
response is "buy more pipe ≤1" (the agent buys 16). The Quantity / Level / Type
axes (DESIGN §19) collapse to one because throughput-starvation makes Quantity
strictly dominate Level. Give zeros a second lever (a multiplier, an alternate
source, a compression mechanic) so the dominant stretch involves a decision.

### 4.4 Build decisions are near-zero / combat choice is illusory — [MAJOR]

The roadmap is fixed; the agent's only runtime decision is clone-vs-level ROI,
which the zero-bound economy almost always resolves to "more pipe ≤1." Combat is
**not in the main pacing sim at all** (`simulator.ts` has no combat); it lives
in a separate static model that self-regulates to a flat 13% tax with 0
setbacks — so "growth vs defense" is not a real allocation. Either model combat
in `simulator.ts` so the tax is visible in the headline curve, or tune
difficulty so setbacks are reachable on competent play.

---

## 5. Recommendations (priority order)

1. **[CRITICAL] Fix the 9-minute onboarding cliff.** Trivial; biggest
   first-session retention impact. (§4.1)
2. **[CRITICAL] Add Vitest + seed unit tests on pure `core/`** before any more
   features. (§3.5)
3. **[MAJOR] Guard set operands** to kill the latent crash. (§3.1)
4. **[MAJOR] Make the catalog truly DRY** (sim imports the entry list) so pacing
   can't silently drift. (§3.6)
5. **[CRITICAL→strategic] Decide the fate of the three isolated systems
   together, not piecemeal:**
   - *Combat:* commit to real synergy (placed operator cells fire on the Front)
     or stop calling the tax a decision. (§2.1, §2.2)
   - *Sets:* give them a demand or descope to an easter-egg. (§2.3)
   - *Rationals / complex:* add a recurring sink or drop them from the economy.
     (§2.4)
6. **[MAJOR] Break the `pipe_8`→Tetration cliff** and **give zeros a second
   lever.** (§4.2, §4.3)
7. **[MAJOR] Decompose `world/index.ts`** along its existing seams; document
   whether `adversary.ts`'s sim+render mixing is the sanctioned combat pattern.
   (§3.7)
8. **Then** consider the long "design vision, not built" backlog — *after* the
   existing systems integrate.

---

## Appendix — key files

- Combat: `src/lib/adversary.ts`, `src/lib/pixi/{antinumber,battery-cell}.ts`,
  `core/catalog/entries.ts` (Defense branch), `sim/{adversary,throughput,weapons}.ts`
- Sets: `core/sets.ts`, `core/value.ts` (the `'set'` cases),
  `core/cell-types.ts` (`operate`), `src/lib/pixi/set-cell.ts`
- Spine / economy: `core/value.ts:860` (`valueComprehensible`),
  `core/cost.ts` (`fuelLadder`), `core/catalog/{costs,entries}.ts`,
  `sim/{simulator,catalog,run,analyze}.ts`
- Architecture: `src/lib/world/index.ts`, `src/lib/interaction/*`,
  `src/lib/persistence.ts`, `package.json` (no test runner)
- Onboarding: `core/catalog/entries.ts` (Addition cost), `DESIGN.md` §18
