# Adversary Sim Model — V2.0 spec

The combat-balance model for **Numbers Go Big! V2 — The Adversary**
(design: `DESIGN.md` Part II; roadmap: `ROADMAP.md` → "V2 — The
Adversary"). This document specifies the V2.0 slice: extend the standalone
simulator so that **defense competes with growth** and the existing pacing
targets still hold. **Sim before game code** — no V2 game code lands until
this model shows the loop is balanceable.

It defines the state, the tick math, the agent decision, the metrics, and
the acceptance bar.

> **Status — V2.0 standalone model is built** (`sim/adversary.ts`). It
> implements §§3–7 at the normalized-unit level described below, layered on
> the locked pacing curve, and **passes the §7 acceptance bar** (defense tax
> ~13%, 0 setbacks, bosses dent the Core to ~16/40, pacing stretch ~1.15×,
> `--no-adversary` reproduces the locked curve exactly). The `--sweep` mode
> maps the open call it surfaces — combat can never return pentation to the
> locked ~11h48m; the recommended lock lands it at **~13h**. See
> `sim/README.md` → "V2.0 — Adversary model". The remaining V2.0 work is
> folding this combat allocation into the *main* `simulator.ts` agent so the
> per-firing economy (not just the normalized proxy) pays the defense tax;
> that integration is the bridge to porting locked numbers into game code.
>
> **Superseded as the primary combat model (read this too).** This file is
> the V2.0 *aggregate-tax* spec. The design later moved to the **army +
> artillery** architecture (the army — your produced positives clashing with
> the enemy — does the bulk; functions are throughput-capped artillery). The
> primary combat-balance model is now **`sim/throughput.ts`**, and the
> per-weapon cost analysis is **`sim/weapons.ts`**. The shipped game also
> adds a fourth battery mode, `'feed'` (the V3 Rampart), absent from the
> V2.0 `BatteryKind` below.

---

## 1. Principles (inherited)

- **1 tick = 1 second of play.** Same clock as the existing sim.
- **Decoupled mirror.** Combat tuning lives in `sim/`, never imported from
  game code. New state goes in a new file `sim/adversary.ts`; `catalog.ts`
  stays the cost mirror and gains only the new Defense entries.
- **Locked-numbers discipline.** Tune here first; port the locked combat
  numbers to `src/lib/` only after the curve is accepted. Never hand-tune
  game costs.
- **The agent is optimal-but-honest.** Continuous-rate approximation, ~10%
  optimistic vs a real player — unchanged from the base model.

---

## 2. New state (in `WorldState`)

Additive fields; nothing existing changes shape.

```
core: {
  hp:        number     // current Core hit-points ("rigor")
  hpMax:     number     // scales with Defense Literature
  repairRate:number     // positive-value/tick the agent routes to repair
}

front: {
  // active threats, aggregated rather than per-entity for tractability:
  incomingRate:  number   // total enemy magnitude arriving per tick at the current frontier
  laneTransitMs: number   // time an antinumber takes to cross the Front (the reaction window)
  pendingBosses: BossSpec[]
}

defense: {
  batteries: Map<BatteryKind, { count: number; level: number }>  // 'add' | 'divide' | 'negate'
  // throughput per battery derived from cell throughput + fuel-ladder cost, see §4
}

// derived per tick, reported by analyze.ts:
defenseTax: number   // fraction of total production diverted to defense this tick
```

`BatteryKind = 'add' | 'divide' | 'negate'`. Bosses (§6) are the only
per-entity objects; the routine wave is modelled as a magnitude *rate* so
the agent reasons about flow, not individuals.

---

## 3. The threat curve

Antinumber magnitude must be **frontier-appropriate** at all times — never
trivial, never impossible. Tie it to the player's current frontier (the
quantity the rest of the sim already tracks):

```
frontier(t)        = current Comprehension ceiling (a power of two)
waveMagnitude(t)   = K_mag · frontier(t)              // per-antinumber threat
waveCadence(t)     = base spawn interval, shrinking slowly with progression
incomingRate(t)    = waveMagnitude(t) / waveCadence(t) · concurrencyFactor
```

`K_mag`, the cadence schedule, and `concurrencyFactor` are the primary
balance knobs. Start conservative (threat well under peak production) and
tighten until the defense tax (§5) lands in the target band.

Bosses are scheduled at milestone frontiers (every comp tier, say) and
drawn from the predicate catalog — see §6.

---

## 4. Defense throughput

A battery of kind `k` at level `L` neutralizes enemy magnitude per tick:

```
batteryThroughput(k, L) = baseRate(k) · levelMultiplier(L) / fuelLadderCost(k)
```

- `baseRate('add')`   — finisher: removes up to its ammo magnitude per shot.
- `baseRate('divide')`— softener: divides enemy magnitude by the ammo, so
  it converts a large incoming magnitude into a small residual cheaply
  (model as a magnitude-reduction multiplier, not a flat removal).
- `baseRate('negate')`— converter: removes enemy magnitude *and* returns it
  to the economy as positive value (a production rebate — model the rebate
  so the agent values negate-batteries as both defense and income).

`fuelLadderCost(k)` reuses the existing `fuelLadder` shape: a battery firing
is an operator firing and pays the same per-firing pyramid of small
numbers. This is what makes defense *cost production* — the core tension.

**Total defended magnitude/tick** = Σ over batteries of `batteryThroughput`,
capped by available ammo throughput (positives the factory can feed in).
Leak = `max(0, incomingRate − totalDefended)`; leak reduces Core HP.

---

## 5. The agent decision (growth vs defense)

Each decision point, the greedy agent now chooses among:

1. **Grow** — buy the next roadmap unlock (existing behavior).
2. **Defend** — buy/level a battery, or fortify the Core, when projected
   leak would drain Core HP before the next growth payoff lands.
3. **Repair** — divert positive production into Core HP.

Decision rule (sketch): compute projected Core HP over the next horizon
under the current allocation. If it stays above a safety floor, prefer
**Grow**. If it would breach the floor, buy the cheapest defense that
restores margin, then resume growing. This yields an emergent **defense
tax** — the fraction of production the agent must continuously divert.

The agent must never deadlock: if it cannot both grow and survive, that is
a balance failure the sim is meant to surface (see acceptance, §7).

---

## 6. Bosses

Per-entity, scheduled at milestone frontiers, reusing the game's predicate
classifiers (mirror `isPrime` / `isPerfect` / `FAMOUS_NUMBERS`):

```
BossSpec = {
  value:      Value      // negative; e.g. -1729
  kind:       'prime' | 'pow2' | 'perfect' | 'famous'
  forces:     BatteryKind[]   // which weapons can actually dent it
}
```

- **prime** — Divide does *not* reduce it (`indivisible`; divide-batteries
  no-op). In the shipped game the answer is a big **Add** (Decrement is not a
  combat weapon). Forces ammo magnitude ≈ boss magnitude.
- **pow2** — Divide halves cleanly: cheap for a Divide-heavy build.
- **perfect / famous** — flavor encounters; same mechanics, narrator beats.

A boss the agent cannot answer with its current arsenal is, again, a
balance signal.

---

## 7. Metrics & acceptance (`analyze.ts` additions)

New report blocks:

- **Defense tax over time** — % of production diverted to defense per tick;
  report mean and peak.
- **Per-wave survival margin** — `totalDefended − incomingRate`, distribution
  over the run. Negative values are leaks.
- **Core HP trace** — min HP reached, number of setbacks triggered.
- **Ammo throughput vs incoming threat** — the binding-constraint check for
  defense, analogous to the existing zero-bottleneck readout.

**Acceptance bar for V2.0:**

1. **Growth is never fully starved.** Mean defense tax stays within a
   target band (proposed: 15–35%); the agent still reaches every unlock.
2. **Pacing holds.** Tetration ≈ 5 h and Pentation ≈ 12 h (sim agent, the
   Part I targets) survive *including* the defense tax, within the usual
   tolerance.
3. **No deadlocks, ≤ a small number of setbacks** on the optimal line —
   setbacks should be a mistakes-cost, not the default trajectory.
4. **Every weapon matters.** A run that disables any one battery kind, or
   skips bosses' forced weapon, should visibly degrade (longer, more
   setbacks) — proving the arsenal isn't collapsing onto one tool.

---

## 8. Running (planned)

Mirrors the existing tools; combat is on by default once unlocked, and can
be inspected with new flags:

```bash
node sim/run.ts                      # roadmap incl. Adversary onset at Subtraction
node sim/run.ts --no-adversary       # disable combat (regression vs pre-V2 curve)
node sim/analyze.ts --defense        # defense-tax / survival-margin / Core-HP report
```

`--no-adversary` is the regression guard: with combat off, the curve must
reproduce the locked pre-V2 pacing in `PACING_LOCKED.md` exactly, proving
the Adversary is a clean additive layer.

---

## 9. Out of scope for V2.0

- Spatial pathing / per-antinumber positions (the routine wave is a rate).
- Manual-play friction in combat (placement, aiming) — same omission as the
  base sim's manual-handling stance.
- Prestige interactions (V2.6, deferred).

Once V2.0 is accepted, port the locked combat numbers into the Defense
Literature branch and `cost.ts`, then build the game slices V2.1→V2.5
against this validated model.
