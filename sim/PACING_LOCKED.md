# Phase 6 — Locked Pacing Snapshot (α.5c baseline)

**Locked:** α.5c. This is the reference curve under the **full ladder
model** plus **engineering puzzles**. The sim's design intent is now
fully expressed:

1. **Per-firing ladder** — every cell at hierarchy position L
   consumes `M × 2^(L-k)` of value k for k=0..L per firing, scaled by
   `⌈log₁₀(max input)⌉`. Every firing pulls a pyramid of small numbers
   from zero up. Zeros are the universal substrate.

2. **Unlock-cost ladder** — every operator/cell unlock follows the
   same ladder pattern. Each unlock demands `M × ladder(L)` of small
   numbers.

3. **Comp milestone puzzles** — every comp_N tier (N ≥ 2) demands
   `1 × 2^(N-1)` as a construction proof — the largest number the
   player can comprehend BEFORE buying comp_N. Forces a "construct
   the milestone" engineering moment at every tier.

4. **Operator construction puzzles** — multiplication demands 1 × 10
   (prove you can add), exp/div/inv/sqrt demand 1 × 100 (prove you
   can multiply), tetration demands 1 × 1024 (prove you can exp), and
   pentation demands 1 × 1,000,000 (prove you can climb to 10⁶).

5. **Predicate side-demands** — variety enforcement is preserved
   (multiplication needs 20 negatives, exp needs 30 primes, tetration
   needs 10 irrationals).

6. **River-tap removed** — Successor lvl 3 is now a pure 4×
   throughput bump. Zeros always flow via pipe ≤1 to the pool. The
   universal zero-supply bottleneck is real and binding.

## Headline

| Milestone | Sim (α.5c) | Real-player (~10% slower) |
|---|---|---|
| Tetration | **4h 10m** | ~4h 35m |
| Pentation | **11h 48m** | ~13h |

Pentation grew significantly versus α.4d (7h → 12h) because every
comp tier now carries an engineering puzzle. **This is intentional —
the player has many more decision-relevant moments, each puzzle is
a "construct this specific number" agency moment.** The new target
is ~5h Tetration / ~12h Pentation.

## Full unlock curve

| Tick | Time | Unlock |
|---|---|---|
| 20 | 20s | successor |
| 40 | 40s | pipe_0 |
| 565 | 9m 25s | addition |
| 567 | 9m 27s | comp_2 (puzzle: 1 × 2) |
| 599 | 9m 59s | subtraction |
| 608 | 10m 08s | comp_3 (puzzle: 1 × 4) |
| 622 | 10m 22s | comp_4 (puzzle: 1 × 8) |
| 831 | 13m 51s | multiplication (puzzle: 1 × 10) |
| 835 | 13m 55s | pipe_2 |
| 861 | 14m 21s | comp_5 (puzzle: 1 × 16) |
| 952 | 15m 52s | comp_6 (puzzle: 1 × 32) |
| 1099 | 18m 19s | comp_7 (puzzle: 1 × 64) |
| 1191 | 19m 51s | division (puzzle: 1 × 100) |
| 1207 | 20m 07s | negation |
| 1253 | 20m 53s | pipe_3 |
| 1325 | 22m 05s | pipe_4 |
| 1337 | 22m 17s | factor (auto, prime predicate) |
| 1666 | 27m 46s | exponentiation (puzzle: 1 × 100, prime predicate) |
| 1810 | 30m 10s | pipe_5 |
| 1913 | 31m 53s | inversion (puzzle: 1 × 100) |
| 1999 | 33m 19s | square-root (puzzle: 1 × 100) |
| 2126 | 35m 26s | comp_8 (puzzle: 1 × 128) |
| 2588 | 43m 08s | pipe_6 |
| 3009 | 50m 09s | comp_9 (puzzle: 1 × 256) |
| 3418 | 56m 58s | pipe_7 |
| 3999 | 1h 06m 39s | comp_10 (puzzle: 1 × 512) |
| 4818 | 1h 20m 18s | pipe_8 |
| 6105 | 1h 41m 45s | warehouse_2 (auto) |
| 8945 | 2h 29m 05s | warehouse_3 (auto) |
| 10862 | 3h 01m 02s | warehouse_0 (auto) |
| 14102 | 3h 55m 02s | warehouse_1 (auto) |
| 15046 | **4h 10m 46s** | **tetration** (puzzle: 1 × 1024, irrational predicate) |
| 15766 | 4h 22m 46s | comp_11 (puzzle: 1 × 1024) |
| 15999 | 4h 26m 39s | pipe_9 |
| 17080 | 4h 44m 40s | comp_12 (puzzle: 1 × 2048) |
| 18517 | 5h 08m 37s | comp_13 (puzzle: 1 × 4096) |
| 20310 | 5h 38m 30s | comp_14 (puzzle: 1 × 8192) |
| 22461 | 6h 14m 21s | comp_15 (puzzle: 1 × 16384) |
| 24969 | 6h 56m 09s | comp_16 (puzzle: 1 × 32768) |
| 27833 | 7h 43m 53s | comp_17 (puzzle: 1 × 65536) |
| 31054 | 8h 37m 34s | comp_18 (puzzle: 1 × 131072) |
| 34632 | 9h 37m 12s | comp_19 (puzzle: 1 × 262144) |
| 38568 | 10h 42m 48s | comp_20 (puzzle: 1 × 524288) |
| 42484 | **11h 48m 04s** | **pentation** (puzzle: 1 × 1,000,000) |

## Focus distribution (full run)

| Value | % of focus | Notes |
|---|---|---|
| 2 | 28.7% | addition operand chain |
| 3 | 24.5% | addition operand chain |
| 1 | 20.5% | addition / level upgrades |
| **0** | **15.2%** | river ladders for every cell firing |
| 4 | 4.7% | exp ladder consumption |
| 100 | 3.6% | multiplication / mid-tier comp |
| 5 | 1.0% | addition operand |
| 10, 1000, milestone values | <1% each | each puzzle is one focus event |

**Small numbers (0-5): 93.6% of focus time.**

**Bottleneck distribution:** **zero supply binds 82% of ticks.** Zero
production is the constant infrastructure investment.

**Warehouses bought:** value 0 × 3, value 1 × 2, value 2 × 1, value 3 × 1.
The factory has a real zero-storage layer for the first time.

## What ports to game source next

The sim is now significantly richer than the game code. Game-side
porting needed:

1. **Unlock-cost ladders** (literature.ts): every operator + comp
   tier follows the ladder pattern.
2. **Per-firing ladder** (cost.ts + fire paths): replace single-fuel
   block with multi-block ladder consumption. **Major refactor**:
   `consumeFuelOrFail` becomes `consumeLadderOrFail`, fire paths
   pull from pool/warehouses for each ladder entry.
3. **Comp milestone puzzles** (literature.ts): every comp tier
   demands `1 × 2^(N-1)`.
4. **Operator puzzles** (literature.ts): mult, div, exp, inv, sqrt,
   tet, pent get their puzzle values.
5. **New recipes** (none in game — recipes are sim-only).
6. **Power-of-2 production paths** — game has no recipe abstraction;
   players construct manually. So nothing to port from sim's recipe
   list. The literature entries demanding specific values just need
   the demands; players figure out construction.

## Caveats

- **Comp milestone puzzles work in game via the strict comp gate**
  (the sim's model). The player must hold a comprehensible block of
  the milestone value to spend on the comp purchase. **Uncomprehended
  blocks are not usable as Literature costs.**
- **The full ladder cost model dramatically increases small-number
  demand.** Zero pool is binding 82% of the time even with the new
  warehouse infrastructure. Players must scale pipe_0 + successor
  count significantly.
- **Predicate stocks (negatives / primes / irrationals)** are
  abstracted in the sim (per-predicate counters grown by specific
  cell-type firings). In-game implementation already exists via the
  predicate-cost path (Slice 5.3).
- **No multi-recipe support yet.** Each value has ONE canonical
  recipe in the sim; the agent doesn't choose between, say,
  multiplication vs cultivator paths to produce 100. Player has
  full choice in-game.
- **Cultivators / decomposer bots / T-bots** are catalog-only in the
  sim. They don't affect speedrun pacing in the current model.

## Tuning surface (α.5c locked numbers)

In `sim/catalog.ts`:

- **Operator unlock ladder multipliers** (`ladderUnlockCost(L, M)`
  per entry):
  - successor M=10, addition M=400, subtraction M=80, mult M=100,
    div M=40, neg M=40, exp M=50, inv M=15, sqrt M=12,
    decrement M=10, factor M=30, tet M=950, pent M=250.
- **Comp ladder formula** (`compUpgradeCost(n)`):
  - L = min(3, floor(n/3)).
  - M(n) = ceil(6 × 1.4^(n-1)) for n≤10; linear (n-9) past.
  - Puzzle: + 1 × 2^(N-1) for every n ≥ 2.
- **Per-firing ladder** (`ladderFor(type, maxInput)`): 2^(L-k) × ⌈log₁₀(max input)⌉.
- **Loose-pile tolerance**: `LOOSE_POOL_TOLERANCE = 1000`.
- **Warehouse capacity** (`warehouseCapacity(comp)`): `10 × 2^(tier-1)`.
- **Manual zero pickup** (`MANUAL_PICKUP_RATE_PER_TICK`): 0.5 / tick
  (only used before pipe_0 is owned).
