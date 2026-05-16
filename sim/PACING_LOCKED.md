# Phase 6 — Locked Pacing Snapshot (α.3 baseline)

**Locked:** α.3 (2026-05-16). This is the reference curve the code
slices β.1–ζ.2 ported to `src/lib/literature.ts` and `src/lib/cost.ts`.
Future tuning iterations compare against this baseline.

**Status post-shipment:** Phase 6 game code is live. The α.3 numbers
were the design-level target; the game now needs a sim α.x extension
pass that models decomposer bots, transformer cultivators, and
dynamic warehouse capacity (none of which existed in the sim at the
time of α.3 lock). Once those models land, re-sweep against this
baseline. See ROADMAP §1 *Next up — Sim α.x extension* for the
extension scope.

## Headline

| Milestone | Speedrun target | Sim (optimal agent) | Casual target (~2× sim) |
|---|---|---|---|
| Tetration | ~5h | **4h 44m** | ~9h 30m |
| Pentation | ~7h | **6h 38m** | ~13h |

Real players are 5–15% slower than the sim's greedy agent due to
hesitation, layout iteration, and idle time. Sim's 4h 44m maps to ~5h
for a careful speedrunner.

## Full unlock curve

| Tick | Time | Gap | Unlock |
|---|---|---|---|
| 20 | 20s | +20s | successor |
| 30 | 30s | +10s | pipe_0 |
| 145 | 2m 25s | +1m 55s | addition |
| 165 | 2m 45s | +20s | comp_2 |
| 315 | 5m 15s | +2m 30s | subtraction |
| 355 | 5m 55s | +40s | comp_3 |
| 547 | 9m 07s | (out-of-order) | comp_4 |
| 2687 | 44m 47s | +38m 52s | multiplication |
| 2689 | 44m 49s | +2s | pipe_2 |
| 2744 | 45m 44s | +55s | division |
| 2761 | 46m 01s | +17s | negation |
| 2798 | 46m 38s | +37s | comp_5 |
| 2802 | 46m 42s | +4s | pipe_3 |
| 2866 | 47m 46s | +1m 04s | comp_6 |
| 2872 | 47m 52s | +6s | pipe_4 |
| 3112 | 51m 52s | +4m 00s | comp_7 |
| 4745 | 1h 19m 05s | +27m 13s | exponentiation |
| 4750 | 1h 19m 10s | +5s | pipe_5 |
| 4834 | 1h 20m 34s | +1m 24s | inversion |
| 4919 | 1h 21m 59s | +1m 25s | square-root |
| 5099 | 1h 24m 59s | +3m 00s | comp_8 |
| 5108 | 1h 25m 08s | +9s | pipe_6 |
| 5468 | 1h 31m 08s | +6m 00s | comp_9 |
| 5486 | 1h 31m 26s | +18s | pipe_7 |
| 6062 | 1h 41m 02s | +9m 36s | comp_10 |
| 6098 | 1h 41m 38s | +36s | pipe_8 |
| 17065 | 4h 44m 25s | +3h 02m 47s | **tetration** |
| 17321 | 4h 48m 41s | +4m 16s | comp_11 |
| 17329 | 4h 48m 49s | +8s | pipe_9 |
| 18148 | 5h 02m 28s | +13m 39s | comp_14 |
| 18710 | 5h 11m 50s | +9m 22s | comp_17 |
| 19128 | 5h 18m 48s | +6m 58s | comp_20 |
| 23877 | 6h 37m 57s | +1h 19m 09s | **pentation** |

The `comp_4` row is "out of order" because the agent auto-bought comp_4
before completing the `multiplication` roadmap entry (multiplication
produces 10s, which requires Comp ≥ 10, so the comp-pursuit branch
fired). The unlock-table display preserves roadmap order rather than
acquisition order; this is informative rather than buggy.

## Pacing shape

**Major cliffs** (the gates the player feels):

| Gap | From → To | What it is |
|---|---|---|
| 3h 02m | `pipe_8 → tetration` | THE late-game grind. Demands thousand-stockpile production at scale. |
| 1h 19m | `comp_20 → pentation` | The hyperoperator boss. Demands million-stockpile. |
| 38m 52s | `comp_3 → multiplication` | First tier-1 fuel cell + 10-magnitude production introduction. |
| 35m 42s | `comp_4 → pipe_2` | Mid-pipe bootstrap; 4-magnitude pipes. |
| 27m 13s | `comp_7 → exponentiation` | Tier-2 fuel cell + 100-magnitude production. |

**Minor cliffs** (intermediate steps, none feel punishing):

- comp_8, comp_9, comp_10 (3–10 min each — the climb to thousands)
- comp_14, comp_17, comp_20 (auto-bought, ~10 min each for the millions climb)

**Trivial steps** (instant or near-instant):

- All `pipe_N` purchases after the comp tier above them already unlocked
- comp tiers below comp_5 (the opening minutes)
- Side operators (division, negation, inversion, square-root) once mults
  / exps exist

## Caveats and known wrinkles

- **Largest/mean ratio is 15×.** The Tetration cliff is 15× the mean
  gap — the sim's automated cliff-detector flags this as a "brutal
  cliff." It IS intentionally the dominant gate of the game; the
  warning is a known false positive in the locked curve.
- **`compUpgradeCost(n)` is the heaviest tuning lever.** A 10% shift
  in its constants moves Tetration by ~30 minutes. When re-tuning,
  start there.
- **Stub mechanics not yet modeled:** transformer cultivators
  (alternative production path with escalating per-step cost),
  decomposer bots (alternative jam-clearing without comp upgrade),
  T-bot frontier throughput. These are net-faster shortcuts. Adding
  them in a future α.x iteration will compress the curve; the locked
  numbers above will need to bump to compensate.
- **Continuous-rate model** is over-optimistic for very-small cell
  counts (1 successor + 1 pipe ≤1 = exactly 1.0/tick in the sim, but
  the discrete game is closer to 0.85/tick). Real opening minutes
  are ~10–15% slower than the sim claims.

## Tuning surface (catalog.ts)

The locked formulas:

- `compUpgradeCost(n)` — piecewise by `ceiling = 2^N`:
  - `ceiling ≤ 8`: `{ value: 1, count: ceiling * 20 }`
  - `≤ 64`: `{ value: 2, count: ceiling * 12 }`
  - `≤ 512`: `{ value: 10, count: ceiling * 2.5 }`
  - `≤ 4096`: `{ value: 100, count: ceiling }`
  - `≤ 32_768`: `{ value: 1000, count: ceiling / 5 }`
  - `≤ 262_144`: `{ value: 10_000, count: ceiling / 32 }`
  - `≤ 2_097_152`: `{ value: 100_000, count: ceiling / 256 }`
  - `≤ 16_777_216`: `{ value: 1_000_000, count: ceiling / 2048 }`
  - else: `{ value: 1_000_000, count: ceiling / 4096 }`

- `pipeCost(n)` — analogous piecewise structure (see catalog).

- **Operator costs** (hand-curated, see `OPERATOR_AND_CELL_ENTRIES`):
  - Successor: 10 zeros
  - Addition: 200 ones
  - Subtraction: 150 twos
  - Multiplication: 1100 tens
  - Division: 300 threes
  - Negation: 100 threes
  - Exponentiation: 1400 hundreds
  - Inversion: 150 hundreds
  - Square root: 150 hundreds
  - Tetration: 19,000 thousands + 3,500 hundreds
  - Pentation: 70,000 thousands + 1,200 millions

## What ports to game source next

Slices β.1 through ζ.2 (ROADMAP §2 Phase 6) consume this catalog. The
mapping:

| Sim entity | Game source |
|---|---|
| `compUpgradeCost(n)` | `src/lib/literature.ts` — new `kind: 'comprehension-upgrade'` generator |
| `pipeCost(n)` | `src/lib/literature.ts` — pipe Literature entries (one per tier) |
| `OPERATOR_AND_CELL_ENTRIES` | `src/lib/literature.ts` — cell Literature entries |
| `LEVEL_LADDERS` | `src/lib/literature.ts` — cell-level entries (existing) |
| `costTier`, `computationalCost` | `src/lib/cost.ts` (already matches game) |
| `RECIPES` | Not ported — sim-only abstraction |

The bot generators (`generateTBotLadder`, etc.) and `CULTIVATOR_ENTRIES`
remain α.1 stubs; their pacing-relevant tuning waits on the simulator
modeling their production effects (a future α.x).
