# V3 — The Clash: implementation plan

**Status:** prototype complete (V3.1–V3.3 built, type-check 0/0, build clean,
run-verified headlessly very-early → exponentiation); V3.4 balance tuning
deferred. Builds on V2 (the Adversary: antinumbers, Core, batteries, waves,
bosses, setback). Sim-validated by `sim/throughput.ts` (army + artillery).

## The one idea
V2 shipped the *artillery* half of combat (batteries + manual cancel —
functions that pre-process specific threats). V3 adds the missing *army*
half, which is the **primary** combat: **your produced positive numbers
physically clash with the incoming negatives, annihilating 1:1 by
magnitude.** Production throughput *is* defensive capacity. Functions stay
throughput-capped strategic tools (proven non-trivial in
`sim/throughput.ts`). Comprehension gates the functions and scales the
threat; the army can brute-force the frontier at a cost.

## The mechanic: the Shield (the army), the Rampart (where it clashes)
- The Core gains a **Shield** — a positive-magnitude reservoir rendered as a
  bold number just ahead of it. The Shield *is* your committed army.
- Antinumbers advance to the **Rampart line** (just ahead of the Core) and
  **clash** with the Shield: `shield −= |antinumber|`. If the Shield covers
  it, the antinumber is annihilated (collision scribble). If the Shield is
  exhausted, the remaining magnitude passes to the Core and damages HP.
- The Shield is **fed by production**, two ways (the manual→automated arc the
  whole game teaches):
  - **Manual:** drop a positive block on/near the Core → its magnitude joins
    the Shield. Big block = big Shield in one motion (magnitude matters).
  - **Automated:** a **Rampart battery** (a fourth `batteryMode: 'feed'`)
    pulls positive blocks from the pool on a cadence and adds their magnitude
    to the Shield. Reuses the entire battery plumbing — no new cell type.
- **The defense tax, made physical:** feeding the Shield consumes blocks from
  the same pool you spend on Literature. Defending competes with growing.
  Hold the line iff feed-rate ≥ incoming-rate. Scale production to scale
  defense — the throughput war.

## Why this delivers the feel
- **Numbers clashing with numbers:** the Shield number is contested in real
  time — it climbs as you feed, drops as antinumbers smash into it, and the
  red enemies visibly collide at the Rampart. The army does ~all the fighting
  by count (per `sim/throughput.ts`); batteries pick off the rare giants.
- **Agency, not idling:** as waves scale with the frontier, one feeder can't
  hold; you must build more production, add feeders, place artillery on
  spikes, and raise Comprehension for the frontier band. The optimal line is
  *active management of a scaling throughput economy*, not a wait.
- **Both senses of "big":** amount (out-feed the swarm) and magnitude (one
  big block = a big Shield slab / one-shots an elite).

## Build slices
- **V3.1 — Shield + Rampart clash. ✅ done.** `adversary.ts`: `shield: Decimal`
  + `shield$` store; `feedShield(value,count)`; antinumber impact reworked to
  clash with the Shield at `RAMPART_X` before Core HP at `IMPACT_X`; Shield
  rendered on the Core (`pixi/antinumber.ts:drawCore`).
- **V3.2 — Feed paths. ✅ done.** Manual: the interaction drop feeds the
  Shield when a positive lands near the Core (`tryFeedShieldAt`, before the
  per-antinumber cancel). Automated: `batteryMode: 'feed'` in `tickBatteries`
  pulls the **smallest loose positive block** (helper `consumePositiveBlock`
  in `world.ts` — loose blocks only, not warehouses) and feeds the Shield; a
  Literature "Rampart" entry gated behind Subtraction.
- **V3.3 — Threading + persistence. ✅ done.** `'feed'` added to the
  `batteryMode` unions (`world.ts`, `literature.ts`, `pixi/battery-cell.ts`
  glyph `▲`); Shield persisted in the save as `coreShield` (v18).
- **Refinements found by running the real game (✅ done):** auto-feed is
  **capped** at `SHIELD_TARGET_MULT (=4) × coreMaxHp` (so it doesn't drain
  the pool); **overflow past the cap repairs Core HP** (`repairCore`); combat
  batteries are **artillery** — they only fire on a front-most antinumber
  whose magnitude exceeds the Shield (no overkill); a real `setbackCount()`
  telemetry getter was added.
- **V3.4 — Tuning to the throughput model. ⏳ deferred (dedicated pass).**
  Feed cadence, Shield target, and wave/threat scaling — especially softening
  the 2 early-game setbacks observed in the 15-min playthrough. Validate
  against `sim/throughput.ts`.

## Verification (this prototype)
Headless playthrough harness (Playwright + the `__nbgWorld`/`__nbgAdvance`
DEV hooks): drive a blank start through Successor → Addition → Subtraction
(combat onset) → Division → Multiplication → Exponentiation. Log the score
curve and the Shield/threat balance; screenshot very-early / early / mid;
assess "numbers up?", "looks right?", and "how much agency?".
