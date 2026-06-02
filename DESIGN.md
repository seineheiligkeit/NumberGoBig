# Numbers Go Big!

*Game Design Document — creative basis*

---

## 1. Vision

**Numbers Go Big!** is a parody incremental game in which the player constructs the natural numbers — and eventually all of mathematics — from a humble river of zeros. Starting from the empty set, you discover the successor function, then addition, multiplication, exponentiation, tetration, and onward up the operator hierarchy. Along the way you produce primes, factor composites, invent decimals, accidentally create imaginary numbers, and build increasingly elaborate factories chasing increasingly absurd target numbers.

The aesthetic is **Zachtronics meets Cookie Clicker**: a free-form canvas where you wire mathematical equations into pipelines, with a dry, academic narrator quietly amused by your progress.

The title is the philosophy. There is no story. The numbers go big.

---

## 2. Design Pillars

These are the constraints that should not bend during development. Everything else is negotiable.

1. **One river, one substrate, one set of rules.** The player's only source is a river of zeros. Every other number — negatives, decimals, primes, irrationals, complex numbers — is **constructed** by the player's factory. The factory itself is the source. Every exotic number is a constructive achievement, not a content drop.

2. **Production runs ahead of utilization.** Each new operator unlocks the ability to *make* numbers larger than the player can yet *move, pipe, or comprehend*. The mid-game tension is closing that gap by leveling small-number infrastructure, harvesting large numbers downward, and earning the capacity to use what can already be produced.

3. **Abstraction is the cure for clutter.** Player-defined composite functions (Blueprints) are the primary scaling mechanism beyond a few dozen cells. Blueprints unlock only after raw wiring becomes painful — not before.

4. **Math is content.** Every named number, prime class, sequence, and constant has a mechanical and parodic role. Hardy–Ramanujan numbers, Mersenne primes, perfect numbers, transcendentals — not flavor, but substance.

5. **No story.** No characters, factions, lore, or world. The narrator is a wry academic. The long arc is the climb toward mathematical absurdity.

---

## 3. Core Loop

Three nested loops:

- **Moment-to-moment** — Pick up blocks, drop them into equations, watch outputs accumulate, wire pipes, place storages.
- **Session** — Earn enough of the right currency to unlock a new operator, family, filter, or tool from the Literature shop. Each unlock reshapes what factory designs are viable.
- **Long arc** — Climb the operator hierarchy → discover new number families → produce increasingly exotic numbers → eventually prestige to do it all again, faster and further.

### Total Score — the headline number

A single number, prominently displayed at the top of the page in pencil-notebook style, tracks the **sum of every block the player currently possesses** (canvas + storage + pipes-in-flight + Ancestral shelf). This is the game's literal headline: the number that, above all, **goes big**.

- **Negatives** contribute their absolute value (a `-5` adds 5).
- **Complex numbers** contribute their modulus (`3 + 4i` adds 5).
- **Ordinals and surreals** become a late-game concern — when the time comes, the score itself becomes ordinal-valued.
- **Storage counts.** Anything in a warehouse contributes its `count × magnitude`. A `wh-ones` at 99/100 contributes 99; a `wh-million` at 5/100 contributes 5,000,000. Storage isn't a sink — it's accumulated wealth made visible.
- **In-transit counts.** A block currently traveling through a pipe is still yours; it contributes too.

**Why this metric works:**

The operator hierarchy naturally rewards the score:

| Operation | Effect on Total Score |
|---|---|
| **Successor** (`0 → 1`) | **+1** (net value created from nothing) |
| **Addition** (`a + b → c`) | **0** (conservation of mass) |
| **Multiplication** (`a × b → c`) | **+a·b − a − b** (positive for a,b ≥ 2) |
| **Exponentiation** (`a^b → c`) | **+aᵇ − a − b** (much larger) |
| **Tetration and higher** | enormous |
| **Decomposition** (factor `12 → 2·2·3`) | **negative** (12 → 7) |

So climbing the operator hierarchy is the only efficient way to grow the score, and **decomposition costs score** in exchange for the small-number currencies the Literature wants. Every harvest is a deliberate trade.

The Total Score is also the natural **prestige trigger** — the player can prestige once the score reaches a threshold, and Ancestral Numbers are essentially the previous run's peak score preserved as a single trophy block.

> **V2/V3 note.** The Adversary's *antinumbers* (Part II) are **not** part
> of Total Score — they are a threat the player does not yet possess, held
> in a separate registry and excluded from the score computation. Only an
> antinumber *converted* by a Negate weapon becomes a player block and
> counts. Two things subtract from Total Score: the combat **setback**
> (which erases loose blocks), and **feeding the Shield** (Part III) — a
> positive committed to the army leaves the pool, moving its magnitude out
> of Total Score into defense (a deliberate, recoverable sink). The
> headline-number semantics above are otherwise unchanged.

---

## 4. The Canvas

The play space is a single open canvas with smooth pan and zoom. Cells (sources, equations, storages, pipes, filters, blueprints) are placed freely with **light grid snapping** for tidiness. Pipes auto-route between cell ports — the player places endpoints, not segments.

The canvas grows with the player. It begins as a modest workspace just large enough for a source and a few cells, then scrolls outward indefinitely as the factory expands. There are no levels and no zones — only one ever-expanding workshop.

---

## 5. The River and the Source

The game opens on a humble river of `0`-blocks flowing horizontally along the bottom of the page. The river is **infinite and free**, extending past both edges of the canvas in perpetuity, and is the only source in the entire game.

- **The cursor is a pencil-drawn hand.** It pinches when hovering over the river or any block, points when over UI elements, and erases when in delete mode.
- **Manual play**: click and drag zeros directly out of the river to anywhere on the canvas. A new zero immediately slides in to fill the gap behind it — the river is uncountable in feel, never running out, never speeding up or slowing down.
- **Automated play**: wire pipes from the river to feed zeros into equations.
- **First achievement**: *"Play with some zeros"* fires the first time the player picks one up.

Zeros are the foundational substrate. Every block on the canvas — no matter how large or exotic — eventually traces back to a zero pulled from this river. The river's pace is deliberate and slow; the player should never feel rushed, but should sense the river's quiet patience.

---

## 6. Equations and Functions

Equations are cells with one or more typed input ports and one or more output ports. They consume input blocks and produce output blocks.

### The Operator Hierarchy

Equations are unlocked from the Shop in roughly this order:

1. **Successor** `{ }` — the von Neumann generator. `0 → 1`. Unary. The first purchased function. **Visual rendering**: the successor cell is drawn as a scribbled `{ }` symbol with a drop zone in the empty space between the braces. A zero (or any number) dropped in is briefly visualized *inside* the braces — mirroring the von Neumann construction `S(n) = n ∪ {n}` — before the incremented result slides out the other side. The successor is the only equation that depicts its mathematical operation literally; later operators use their conventional symbols only.
2. **Addition** — `a + b`. Binary.
3. **Subtraction** — `a − b`. Binary. *Unlocks negatives.*
4. **Multiplication** — `a × b`. Binary.
5. **Division** — `a / b`. Binary. *Unlocks rationals and decimals.*
6. **Exponentiation** — `a^b`. Binary.
7. **Roots and inverses** — *unlock irrationals; eventually complex.*
8. **Tetration**, **pentation**, **arrow notation**, **Conway chains** — the upper hierarchy.
9. **Specialty functions** — `gcd`, `lcm`, `Σ`, `Π`, `n!`, `polynomial(...)`, etc. (variadic).

Higher-arity equations occupy more space and demand more inbound pipes. Their physical complexity matches their mathematical complexity.

### Decomposition Equations

Alongside the constructive operators are decompositional ones. These create **bidirectional flow** — the factory builds up *and* breaks down.

- **Decrement** — unary; `n` in, `n−1` out one side, a `1` block out another side. Useful for harvesting large numbers into small-number currency and fuel.
- **Factor** — unary; composite in, its prime factorization out as separate blocks. The primary route for turning composites into primes-as-currency, and a major source of fuel reclamation.

### Inversion and the Negative-Fuel Pivot

Two unary cells widen the bottom of the magnitude ladder into a productive loop:

- **Negation** — `n ↦ −n`. Tier 0, free, no fuel port. A sign flip, not an operation. Its only mechanical purpose is to give the player a clean way to produce negative blocks without the awkward `0 − n` dance through Subtraction. Ships alongside Inversion because Inversion needs negatives as fuel.

- **Inversion** — `n ↦ 1/n`. Tier 2, required fuel port. Maps any non-zero number to its reciprocal: `5 ↦ 1/5`, `1000 ↦ 0.001`, `0.001 ↦ 1000`. The output is rational unless the input is already rational, in which case it may collapse to integer.

**Why Inversion matters.** Until Inversion lands, the "small numbers" branch of the economy — Subtraction's negatives, Division's tiny rationals — is mostly decorative. Inversion converts both into raw material for big numbers: divide a `1` by a large denominator to produce a tiny rational, invert to get a large integer. Subtraction and Division gain an economic destination they didn't have before. The mechanic is load-bearing for *integration*, not new content per se — it ties three previously-isolated systems into one productive line.

**Negative fuel.** Inversion's *output* magnitude is `−log₁₀(input)` — a small input produces a large output, and vice versa. To stay honest with the existing rule (fuel cost ∝ operator magnitude), Inversion's cost must scale with the *result*'s magnitude, not the input's. So the cost is signed: `cost = −⌈log₁₀(1/|n|)⌉`. A fuel block satisfies a positive cost iff its value is `≥` the cost; it satisfies a negative cost iff its value is `≤` the cost. In practice: feed Inversion negative blocks. A `wh: negative` rule warehouse is the natural reservoir.

The mechanic is the same fuel rule the rest of the economy already uses — magnitude paid in proportion to operator size — applied to the only operator whose output magnitude is signed. The narrator notes this on first encounter (*"the cost is, regrettably, negative. The cell will accept negative fuel. Do not ask why."*).

Inversion is also the first slice in which the player plans a factory that depends on producing negatives at scale — a small but real new logistics problem, and the reason Negation ships alongside.

### Cultivation Cells

A late-mid-game family of equation cells — **Cultivation Cells** — apply a mathematical series to each input they consume. Each cultivator has **one input port** and **one output port** and maintains an **internal step counter** that advances with every input consumed. The output is `f(input, step)` per the cell's growth function. The cell is an **inline transformer**, not an autonomous printer.

The shift away from the earlier timer-driven streaming model is deliberate. Cultivators previously fired on a cadence regardless of input, which made them auto-clicker-shaped and undermined the "one river, one substrate" provenance chain. Under the transformer model, the player **paces** the cultivator by routing inputs into it; the series **flavors** the transformation. Every emission has an explicit upstream block to its name.

Different Cultivation cells implement different mathematical growth patterns, each its own Literature unlock:

- **Arithmetic** — adds a step-scaled offset, e.g. `f(x, n) = x + nk`.
- **Geometric** — multiplies by a step-scaled factor, e.g. `f(x, n) = x · r^n` (exponential growth).
- **Fibonacci** — advances along a Fibonacci-shaped curve in `n`, scaled by the most recent input.
- **Harmonic** — emits the running partial sum `x · (1 + ½ + ⅓ + … + 1/n)` (painfully slow; narrator joke material).
- **Polynomial** — output follows a chosen polynomial in step `n`.
- **Factorial** — multiplies by `n!` (terrifying).
- Other growth functions unlock progressively as Literature deepens.

**Per-step fuel cost escalates.** Each cell type carries its own cost formula in step `n` (arithmetic perhaps linear in `n`; geometric quadratic; factorial exponential). The cell self-throttles: the longer the series runs, the more expensive each emission. Exact constants are sim-tuned (§19).

**Cell Jam still applies.** Per §9, an output whose magnitude exceeds Comprehension pins the cell. The cultivator climbs exactly to the player's Comp ceiling and stops there until comprehension advances or a decomposer bot intervenes. *Production runs ahead of utilization* (Pillar §2.2) becomes mechanically enforced, not aspirational.

Cultivation respects the "one source" pillar (§2.1): every cultivated number derives ultimately from an input the player constructed from the river of zeros. The river remains the origin; cultivation only amplifies. Making cultivators input-driven rather than self-running renders the chain of provenance explicit at every emission.

### Computational Cost — the Ladder Rule (α.5c)

Operators (and cultivators) have a **computational cost** in addition to their operand inputs: each firing consumes fuel. Fuel is **a structured pyramid of small numbers**, not a single magnitude-scaled block. The rule is:

> A cell at hierarchy position **L** consumes per firing:
>
> `2^L` zeros, `2^(L-1)` ones, `2^(L-2)` twos, …, `1` of value `L` — scaled by `⌈log₁₀(max input)⌉`.

#### The hierarchy ladder

| Cell | L | Per-firing ladder (mag=1) | Total tokens |
|---|---|---|---|
| Successor | 0 | 1 zero | 1 |
| Addition / Subtraction / Negation | 1 | 2 zeros + 1 one | 3 |
| Multiplication / Division | 2 | 4z + 2o + 1t | 7 |
| Exponentiation / Square Root / Inversion | 3 | 8z + 4o + 2t + 1×3 | 15 |
| Tetration | 4 | 16z + 8o + 4t + 2×3 + 1×4 | 31 |
| Pentation | 5 | 32z + 16o + 8t + 4×3 + 2×4 + 1×5 | 63 |

Counts scale with `⌈log₁₀(max input)⌉`. A multiplication of 10×10 (mag=1) costs `4z + 2o + 1t`. The same cell firing on 10⁶×10⁶ (mag=6) costs `24z + 12o + 6t`. The magnitude tax preserves "operator pays in proportion to the work it represents" — the ladder distributes that cost across the lower-tier pyramid.

**Mathematical intuition.** Each operation is built atop a doubled foundation of the operation below it. Tetration is a tower of tetrations is a tower of pentations… the doubling at each rung is the structural cost of the recursion.

**Why this works in service of the design pillars:**

- **§2.1 *One river, one substrate*.** Zeros are demanded by every firing at every tier. Higher tiers demand more zeros, not fewer. The river of zeros stays mechanically central forever, not just in the opening.
- **§2.2 *Production runs ahead of utilization*.** Each tier requires the entire lower ladder. To run pentation, you must be producing all of {zeros, ones, twos, threes, fours, fives} at scale. No "skipping" the small numbers once you reach the big ones.
- **Routing becomes a continuous coordination puzzle.** A late-game pentation cell draws from six different value streams simultaneously. The factory's circulatory system spans every magnitude.

#### Inversion: the signed-fuel exception

Inversion (`n ↦ 1/n`) is the only operator whose output magnitude is **negative** in log space — small inputs produce large outputs and vice versa. Its cost can't fit the ladder shape cleanly. So Inversion **keeps the old single-block signed-fuel contract**:

> `cost = -2 × ⌈log₁₀(|output|)⌉` — negative for uphill (|input| < 1 → |output| > 1), positive for downhill, free in [1, 10).

A single block of magnitude ≥ |cost| with matching sign satisfies the cost. The natural fuel reservoir is `wh: negative` (§8) for uphill inversions. **Inversion is also the one tier-2+ cell that still has a fuel input port** — the wired-warehouse route is needed because the signed-block draw isn't symmetric with positive fuel.

#### Cultivators: per-emission cost

Cultivators (input-driven transformer cells, see *Cultivation Cells* above) consume fuel proportional to the **magnitude of the emission they're about to produce**: `cost = ⌈log₁₀(|emission|)⌉` per firing, paid as a single block. The cell self-throttles as its step grows — a geometric chain producing `2^30` costs 9 fuel per emission; a factorial chain costs much more. Combined with the Cell Jam rule (§9), the chain throttles itself twice: cost grows per step, and output magnitude grows per step until it outruns Comprehension and the cell pins.

**Decomposition** (Decrement, Factor) remains **free and refunds magnitude**: factoring a 144 returns three 2s and a 3, at the cost of Total Score. Decomposition is the game's mid-game pressure release.

#### No fuel-port wiring (except inversion)

Tier-1+ cells (mult, div, exp, tet, pent, variadic-arrow, sqrt) **have no fuel port**. The ladder pulls automatically from the global pool — loose blocks first, then warehouses, then rule warehouses. The player doesn't wire fuel pipes for these.

The trade-off is mechanical simplicity: no more "this cell will not fire without a wired warehouse" friction. The cost of the simplification is that fuel routing is now diffuse — the factory must keep many small-number streams flowing into the shared pool, rather than dedicated pipes per cell. Routing is still layout work (§8 *Storage*), just at a higher abstraction — "is my zero supply keeping up with my factory's total demand?" instead of "did I wire the fuel port on this specific multiplication cell?"

**This supersedes the earlier "tiered fuel ports" design** that gated tier-2+ operators behind required wired warehouses. The Ladder Rule replaces that mechanic with the structural small-number demand at every tier.

#### Engineering puzzles

Beyond the per-firing ladder, **every operator unlock and every comp tier carries a `1 × V` construction puzzle** — a specific number the player must actually engineer before paying the unlock cost:

- Multiplication unlock demands a `1 × 10` (prove you can add).
- Exp / Division / Inversion / Square Root demand `1 × 100` (prove you can multiply).
- Tetration demands `1 × 1024` (= 2^10, prove you can exponentiate).
- Pentation demands `1 × 1,000,000` (the million milestone).
- **Every comp_N demands `1 × 2^(N-1)`** (the previous tier's ceiling — the largest number the player can comprehend NOW).

These puzzles add agency to an otherwise grinding loop. Each one is a moment of "what cell do I need, where do I place it, where does the input come from, how do I wire it?" The bulk-grind ladder runs in the background while the player engineers each milestone block by hand.

### Equation Properties

- **Throughput** (firing rate) — upgradeable from the Shop with appropriate currency.
- **Magnitude limit** — the size of inputs/outputs the cell can handle. Upgradeable.
- **Polymorphism** — equations accept *any* combination of types and produce the appropriately-typed output. A `+` cell happily adds a Real and an Irrational and outputs an Irrational. An `i × i` produces a Real. Surprising identities (Euler's, etc.) emerge as gameplay moments.

### Unrouted Outputs

If an equation has no output pipe and no storage, blocks pile up at the output port. The pile is clickable; identical blocks consolidate visually. When the pile hits a soft cap, the equation pauses until cleared.

---

## 7. Pipes and Magnitude

Pipes transport blocks automatically between cells. Each pipe has a **magnitude rating** — a 2^N-rated pipe carries blocks up to 2^N but rejects anything larger. Pipe magnitudes are powers of two, aligned with the Comprehension ladder (§9).

**Building a pipe rated for magnitude 2^N costs blocks of that magnitude.** The recursive bootstrap is preserved: you must first produce a magnitude before you can pipe it. Hand-craft a few small blocks manually, use them to build a small-rated pipe, automate that magnitude's production, accumulate the next tier, and so on up the tower.

**Pipes are gated by Comprehension.** A pipe rated for 2^N requires Comp ≥ 2^(N+1) — pipes lag manual handling by exactly one tier (§9 *The Frontier Band*). The player cannot build a pipe for a magnitude they have not yet comfortably mastered.

**One Literature entry per magnitude tier**, auto-generated from the Comp ladder. Pipes have **no separate leveling axis** — the lvl I–V system that briefly existed has dissolved into the Comp ladder itself. Throughput comes from placing parallel pipes (per §19 *Three axes of progression*: Quantity, not Level).

**Connections are strict**: a pipe rated below an equation's output magnitude simply will not connect. The player must plan their layout by magnitude.

---

## 8. Storage

Storages (warehouses) hold blocks up to a capacity. They are unlocked once the player accumulates a meaningful stack on the canvas — clutter triggers the unlock organically.

Larger storages, more storages, and richer storage rules are purchased from the Shop.

Storage is what allows the player to **hoard numbers** to fuel later operations. Late-game, warehouses are the backbone of the economy — fuel reservoirs, currency vaults, and the visible expression of the player's accumulated work (per §3, warehouse contents count toward Total Score).

### Typed warehouses (early game)

The basic warehouse holds blocks of a **single value type**, locked by the first deposit (drop a `1` and the warehouse stores `1`s; further deposits of any other value are refused). Drag-drop on the deposit zone to add; click the output port to withdraw one.

**Capacity is tied to Comprehension** (§9). A small base count scales geometrically as Comprehension climbs — each comp doubling roughly doubles available storage. Warehouse-quality leveling (planned: dual output, fuel port, multi-destination) layers atop this capacity axis. Both deposit and withdrawal of individual blocks are also gated by Comprehension under the universal rule (§9) — a block too large to lift is also too large to warehouse.

### Generalized warehouses (mid-game and beyond)

Mid-game introduces **rule-based warehouses** — warehouses defined by a *predicate* rather than a single locked value. Examples:

- `wh: value < 10` — accepts any 0..9
- `wh: value < 100` — small-change wallet
- `wh: prime` — currency vault for Literature entries that demand primes
- `wh: composite`, `wh: divisible by 6`, `wh: family = irrational`, …
- `wh: negative` — fuel reservoir for Inversion (see §6 *Inversion and the Negative-Fuel Pivot*)

The predicate vocabulary is the same one Filters (§13) uses — Generalized Warehouses are essentially "Filter + Storage" fused into one cell. They reuse the predicate language so introducing standalone Filters later is a small step rather than a new concept.

**As fuel sources.** Wired to a tier-1 or tier-2+ operator's fuel port, a generalized warehouse provides fuel: the operator pulls one matching block per firing and pays its value (§6 Computational Cost). The player designs warehouses by intended denomination — `wh<10` for cheap operations, `wh<1000` for tetration's appetite — and wires them to the operators they're meant to feed.

**As currency reservoirs.** Wired to a Literature entry's demand (when that mechanism arrives in Phase 4), a generalized warehouse can satisfy multi-unit costs ("400 primes ≥ 10⁶") by drawing from its own rule-matching contents.

**Composite rules** ("prime AND > 10⁶") arrive alongside Filters in Phase 4 and use the same predicate combinator UI.

---

## 9. Comprehension — Spine of the Economy

The player's **Comprehension** ceiling is the single pacing axis around which the rest of the economy turns. Production, transport, storage, and automation all bend to it. Where §6, §7, §8, and §14 speak of lifting, piping, warehousing, or carrying, the rule below governs.

### The Ladder

- **Form:** Comp ≤ 2^N for N = 1, 2, 3, …
- **Open-ended:** no cap. Each Literature purchase doubles the ceiling.
- **Baseline:** the player begins at **Comp ≤ 2** (zeros and ones only). The first paid Literature entry after Successor is the upgrade to ≤ 4 — teaching the mechanic in the opening minute.
- **Display:** the header reads `Comp ≤ 2^N (= V)` — the bit-count alongside the explicit value. Bit-counting fits the mathematician's voice.
- **Cost ingredients:** most tiers are paid in **bulk stockpile** at the current magnitude (forcing sustained production). **Milestone tiers** (2^10 = 1024, 2^16 = 65,536, 2^20, 2^24, …) carry an additional **engineering puzzle** — a specific significant number the player must construct (1024, 1729, 6174, …). The narrator marks each milestone.

The exact cost curve is sim-discovered, not hand-designed (§19).

### The Universal Rule

One sentence governs the entire economy:

> **Anything that lifts, carries, routes, or stores a block requires that block to be within Comprehension.**

| Mechanism | Magnitude cap | Acts on uncomprehended? |
|---|---|---|
| Manual lift | ≤ Comp | no |
| **T-bot** | ≤ Comp | no |
| **Pipe** | < Comp (one tier behind, strict) | no |
| **Warehouse** (deposit / withdraw) | ≤ Comp per block | no |
| **Warehouse capacity** (count) | scales with Comp | — |
| **Decomposer bot** (Factor / Decrement / Inversion) | independent magnitude rating | **yes** |

Decomposer bots are the only exception — *delegated comprehension*, see below.

### The Frontier Band

A pipe rated for magnitude 2^N requires **Comp ≥ 2^(N+1)**. The strict inequality carves a permanent **frontier band** [2^(N-1), 2^N] at the top of every Comprehension tier: a magnitude range the player can handle by hand and by T-bot, but not yet by pipe. The frontier moves with Comprehension; it is never empty.

Every Comprehension purchase delivers two payoffs at once — a new band opens at the top (manual + T-bot work to do), and the previous frontier becomes pipeable (automation arrives where you grew comfortable).

### Cell Jams and Pinned Cells

A cell will not fire if its next emission would land at a port already holding a block whose magnitude exceeds Comprehension.

- **Cell stalls.** No fuel burn, no input consumption, no step advance.
- **Cell pins in place.** A stuck cell cannot be dragged. The factory must engineer *around* it.
- **Pipes attached to the cell remain editable.** Inputs can be redirected; output pipes can be detached and re-wired.
- **Visual:** dashed-red `JAM_TINT` cell outline; the offending block at the port renders as `?` (a single graphite question mark).
- **Narrator beat fires once per cell** on first jam.

### The Uncomprehended Block

A block whose magnitude exceeds Comprehension displays as a single `?`. The game knows the underlying value; the player does not. The block exists, occupies a port, blocks emissions, and contributes its magnitude to Total Score (the bookkeeping is internal). It cannot be read, lifted, piped, or warehoused. Only a decomposer bot can act on it.

### Recovery from a Jam

A stuck cell has five named recovery paths:

1. **Upgrade Comprehension.** Eventually the block reveals and becomes liftable.
2. **Build a pipe of sufficient rating** and route the block away. Possible only after Comprehension climbs enough to make such a pipe purchasable.
3. **Deploy a T-bot of sufficient rating** to carry the block to a matching warehouse. Same caveat.
4. **Deploy a decomposer bot** rated for the block's magnitude. Reduces in place — no waiting on Comprehension.
5. **Shift-click delete the cell.** Cell and its uncomprehended block are both destroyed. Cost: the cell purchase. Recovery of last resort.

### Decomposer Bots — Delegated Comprehension

A new bot family extends the Translation Operator (§14):

- **Factor-bot (F-bot)** — walks to a loose block, splits it into its prime factorisation, leaves the fan of factors at the original position.
- **Decrement-bot (D-bot)** — walks to a loose block, decrements once, leaves the result and a `1`.
- **Inversion-bot (I-bot)** — walks to a loose block, replaces it with its reciprocal. Late-game; inherits Inversion's signed-fuel mechanic.

Decomposer bots have **independent magnitude ratings**, purchased in Literature and denominated in stockpiles. The rating is not gated by Comprehension — the bot is a mechanical specialist trained to perform a transformation regardless of whether the player has yet learned to read what it is operating on.

This makes Factor / Decrement / Inversion structurally essential, not curiosities. Decomposition cells in static form remain in the catalog for piped use; their bot variants are the keystone unjam tool. The narrator can be very pleased: *"The factorizer has split the unknown 9,797 into 97 × 101. Both, regrettably, remain beyond your reading. Progress, however, has been made."*

### Reveal Events

When the player upgrades Comprehension, every parked `?`-block on the canvas whose magnitude is now ≤ Comp resolves into its true numeral in a brief pencil-fill-in animation. The page literally clarifies. Three things fire on reveal:

- **Gallery entries** record the discovery. Producing a number is not enough; the player must come to comprehend it. The Gallery becomes *"what I have understood,"* not *"what passed through my pipes."*
- **Theorem narrator beats** fire on comprehension — Hardy–Ramanujan 1729 unlocks when the player can read a 1729, not when one was silently produced upstream.
- **Stuck cells unjam** as their oversize outputs reveal. Frozen factory branches resume in waves.

### Pipes — One Per Tier, No Leveling

The pipe-leveling axis (lvl I–V per magnitude, the Phase 5.6 system) **collapses into the Comprehension ladder**. There is no separate "Pipe ≤100 lvl II" purchase.

- **One Literature entry per pipe magnitude tier** (2^0, 2^1, 2^2, …), auto-generated from the Comp ladder.
- **Unlock requirement:** Comp ≥ 2^(N+1) for the pipe ≤ 2^N tier.
- **Per-placement cost** scales with magnitude — the recursive-bootstrap economy (a 2^N pipe paid in 2^N-rated blocks) is preserved.
- **Throughput:** constant per pipe. Players acquire throughput by placing **parallel** pipes, not by levelling individual ones.

One ladder, one knob: Comprehension. Quantity remains the throughput axis, exactly as Quantity governs throughput everywhere else (§19).

### Translation Operators — The Bridge

T-bots sit at the **current Comprehension tier**. They are the only automation available at the leading edge — pipes lag one tier behind, so the frontier band [2^(N-1), 2^N] is reachable only by hand and by T-bot.

Their structural role: **rotating scouts**. As Comp climbs and pipes catch up to the old frontier, T-bots retire from that magnitude and redeploy to the new frontier. Pipes are the permanent backbone; T-bots are the perpetually-leading edge.

T-bot ratings are purchased per-bot, capped at current Comp. T-bots cannot lift uncomprehended blocks.

### Warehouse Capacity

Warehouse capacity is **tied to Comprehension**.

- **Base count:** small (target: 10–25, sim-tuned).
- **Multiplier:** scales geometrically in Comp tier — each Comp doubling roughly doubles available storage.
- **Magnitude constraint:** the universal rule applies — deposited and withdrawn blocks must be ≤ Comp.
- **Warehouse-quality leveling** (planned slice for dual output, fuel port, multi-destination) layers on top. Capacity is the Comp-tied axis; qualities are level-tied.

This is the mechanism that pushes resource management. A low-Comp player cannot hoard enough small numbers to fuel high-tier operators; they must climb Comprehension to climb production. The entire economy threads through Comp at every level.

### Cultivators (Downstream)

Cultivators are rebuilt as **transformer cells** under the universal rule — see §6 *Cultivation Cells*. Briefly: one input port, one output port, internal step counter; each input consumed produces `f(input, step)` and advances the counter. Outputs are subject to the Cell Jam rule. The cultivator climbs exactly to the player's Comp ceiling and stops there until the player advances. Per-step fuel-cost escalation is a future sim-tuning iteration; the universal comp-jam alone is the throttle today. Production runs ahead of utilization (Pillar §2.2) is mechanically enforced.

### What This Replaces

| Replaced | By |
|---|---|
| Eight-tier Comp ladder (≤25 → ≤10⁹) | Power-of-2 ladder, infinite |
| Pipe leveling system (lvl I–V) | Comp ladder alone |
| Streaming cultivators (timer-driven) | Transformer cultivators (input-driven, §6) |
| Decomposition cells as tactical-currency tools | Decomposition cells + bots as the salvage layer |
| Comprehension as a manual-lift gate | Comprehension as the spine of the economy |

### What This Defers

- **Cell levels.** Currently capped at 5; remain so. A separate design session revisits cell leveling on its own terms.
- **Warehouse-quality leveling.** Stays in scope as a later slice; capacity scaling lands here.
- **Bot leveling.** Bots have rating tiers, not levels. Whether bots gain qualities at higher tiers is a future question.

---

## 10. Literature (The Shop)

The Shop is called **Literature** — drawing on the mathematicians' phrase *"search the literature"*. Every unlock is a published result the player has added to their working knowledge. The narrator can refer to purchases in this register: *"This result has been added to your literature."*

Literature is the player's central interface for unlocks: new operators, cell types, filters, Comprehension tiers, larger storages, faster throughput.

Each entry costs a specific currency, escalating in sophistication as the game progresses:

- **Early** — zeros, ones (abundant, cheap)
- **Mid** — primes, composites, specific magnitudes
- **Late** — challenging engineered sets ("400 primes greater than 10⁶," "the first ten Mersenne primes," "one irrational with at least 100 decimal places")

The currency progression is the game's **goal system**: each next unlock is an engineering challenge translated into a price tag.

Some achievements unlock automatically (first prime produced, first composite, first 10⁶). Some appear as Literature purchases gated by milestones. Both modes coexist — surprise *and* goal.

**Visual**: Literature is rendered as a sidebar styled like a penciled to-do list in a working notebook. Each entry a line item with a checkbox, cost in pencil, ticked off on purchase. Locked items appear faintly with their requirements visible; mystery items appear as `?`.

---

## 11. The Number Gallery

The Gallery is the game's Pokédex — a visible record of every special number the player has ever *comprehended*. It is organized into tabs:

- **Integers** — a literal grid filling in as each value is produced and read
- **Primes** — with subcategories for twins, cousins, Mersennes, Fermats, etc.
- **Perfect numbers**
- **Famous constants** — π, e, φ, …
- **Famous numbers** — 1729, 42, 65,536, 6174 (Kaprekar), …
- **Sequences and families** — Fibonacci, Catalan, Lucas, …
- **And so on, expandable indefinitely**

**Discovery is comprehension, not mere production.** Per §9, a number produced beyond Comprehension renders as `?` and is not added to the Gallery. When the player later upgrades Comp and the `?`-block reveals its numeral, *then* the Gallery records the entry and any associated theorem narrator beat fires. Numbers comprehended in passing-through pipes count; numbers that left the factory before the player could read them do not.

**Gallery entries persist across prestiges.** Discovery is permanent; currency is per-run. The Gallery is the player's long-term identity and achievement record — a notebook of what they have come to understand.

---

## 12. Number Families

Number families are **not** separate sources, substrates, or zones. They are **types of blocks** the factory produces, each with type-aware behavior:

- **Naturals** — default; produced by successor and additive chains
- **Negatives** — emerge from subtraction with a larger right operand
- **Rationals / decimals** — emerge from division
- **Irrationals** — emerge from roots of non-perfect-squares and similar
- **Complex** — emerge from roots of negatives
- **Quaternions, ordinals, surreals, hyperreals** — late-game families emerging from increasingly exotic operations

All families coexist on the same canvas, flowing through the same equations. The game's polymorphic operators handle every combination, sometimes with mathematically surprising and parodically rich results.

Families are content unlocks discovered through normal play — *not* gated behind prestige. The first negative, the first decimal, the first imaginary are some of the game's best moments and should be reachable in a single playthrough.

---

## 13. Filters

Filter cells route blocks by property. They are the primary mechanism for converting mixed-output streams into specific-currency streams. Each filter type is its own Shop unlock.

- **Primality filter** — primes vs. composites
- **Magnitude filter** — `> N` or `< N` thresholds
- **Divisibility filter** — divisible by `k`
- **Family filter** — by number family (natural, negative, complex, …)
- **Composite filters** — multi-condition (prime AND > 10⁶)

Filters become essential the moment the player wants to produce a *specific kind* of number reliably.

---

## 14. Blueprints

Approximately 30 minutes into a fresh game — after the player has had to hand-wire enough repetitive operations to feel the friction — Blueprinting unlocks.

A **Blueprint** is a player-defined composite function:

1. The player selects a subgraph of their canvas (one or more inputs, the equations between them, the final output).
2. They name the abstraction (e.g. "Doubler," "Tenify," "Mersenne Candidate").
3. The subgraph collapses into a single new cell with the selected inputs and output.

The new cell visually resembles any other equation but internally instantiates the full underlying circuit. Throughput, cell behaviour, and resource use are all preserved.

### Blueprint Semantics

- **Blueprints are immutable named templates.** Once defined, the template never silently changes. All instances behave identically to the original definition forever.
- **Opening an instance unwraps it.** Clicking into a Blueprint instance dissolves it back into its raw constituent cells on the canvas. Those cells become normal, editable parts of the factory. The named template in the library remains untouched.
- **To revise, re-blueprint.** If the player wants a better Doubler, they unwrap a copy, modify the cells, and create a new Blueprint (new name, or deliberately overwrite — explicit choice).
- **No silent edits.** A Blueprint cannot be edited in place. This prevents the "I broke twelve places at once" frustration and makes each Blueprint a deliberate engineered artifact.
- **The library persists across prestiges.** The player's accumulated mathematical inventions are permanent intellectual property.

### Bots — Translation and Decomposition

Two families of mobile automation. Both are walking workers; both have **magnitude ratings** purchased in Literature.

**Translation Operators (T-bots).** Small worker units patrolling the canvas, collecting loose blocks and carrying them to the nearest matching warehouse. The name is the joke — a *translation operator* T̂ in mechanics is the operator that shifts a function in space, which is exactly what these bots do for blocks. Each bot wears a hand-drawn `T` glyph; on placement the dry narrator may observe that *"this T̂ commutes with the identity. It does not commute with anything else."* Mechanically: the bot picks the closest unmatched loose block within its search radius, walks to it, picks it up, walks to the destination warehouse, sets it down. Multiple bots queue on disjoint targets so they don't fight over the same pile.

**T-bots are capped at current Comprehension** (§9). They share the lift constraint with the player — they cannot pick up what cannot be lifted. Their structural role is *rotating scout*: at any Comp tier, T-bots sit at the **current frontier band** (manual-only for pipes), retiring as Comprehension climbs and pipes catch up.

**Decomposer bots** (Factor-bot, Decrement-bot, Inversion-bot). The unjam family. Each walks to a loose block within its rating, applies its transformation **in place**, and leaves the output(s) where the original was — no carrying. The F-bot splits a composite into its prime factors; the D-bot decrements by one; the I-bot replaces a value with its reciprocal (late-game; inherits Inversion's signed-fuel mechanic).

**Decomposer bots have independent magnitude ratings**, priced in Literature in **stockpiles, not in Comp prerequisites**. The bot is a mechanical specialist — *delegated comprehension* — trained to perform a specific transformation without the player needing to read what it operates on. Decomposer bots are therefore the **only** infrastructure in the game that can act on uncomprehended blocks (§9), and the keystone tool for unjamming cells whose outputs have outrun Comprehension. The narrator can be very pleased: *"The factorizer has split the unknown 9,797 into 97 × 101. Both, regrettably, remain beyond your reading. Progress, however, has been made."*

---

## 15. Prestige

When the player reaches a sufficient milestone (initially: producing some sufficiently large number; later thresholds escalate), they may **prestige**: reset the entire factory back to the empty canvas and the humble river of zeros.

### Persists across prestige

- **The Number Gallery** (in full)
- **The Blueprint library** (in full)
- **The Ancestral Numbers shelf** (see below)

### Ancestral Numbers

When the player prestiges, their **single largest produced number** is preserved as a unique persistent block in an **Ancestral Numbers shelf** — a permanent trophy hall of the player's peak achievements across all past lives.

Each Ancestral Number is **spendable** for early-run boosts:

- Spend a 10⁶ → start the new run with multiplication pre-unlocked
- Spend a 10⁹ → start with Comprehension at 100
- Spend a 10¹² → start with two pre-upgraded successors and a 100-rated pipe placed
- (etc., scaling with magnitude)

The player chooses which past triumph to convert into present advantage. Each Ancestral spent is consumed.

Ancestral Numbers are **limited in count** (e.g. only the player's all-time top three are kept). Scarcity makes spending meaningful.

### Why Prestige Works Without Substrate Change

The reward of prestige is *not* "now you unlock new math." It is "now you can flow through the math you already know, much faster, and push further than you did before." Prestige is **speedrunning your way to the new horizon**, propelled by ancestral wealth and the persistent library of Blueprints.

---

## 16. The Long Arc

The endgame is open-ended. Beyond ordinary naturals, the operator hierarchy climbs into tetration, pentation, Knuth arrows, Conway chains, fast-growing hierarchies, transfinite ordinals, surreal numbers, and beyond.

Named giant numbers become aspirational engineering goals:
- Skewes' number
- Graham's number
- TREE(3)
- Loader's number
- Rayo's number

Each requires the player to design a factory capable of producing it — a real and increasingly absurd challenge.

There is no "you have won." There is always a larger number, a stranger family, a more exotic operator. The game ends when the player stops playing.

---

## 17. Tone and Aesthetic

### Narrator

A dry academic. Wry, occasionally amused, never theatrical. Comments on milestones in the manner of a math TA observing a student's work.

> *"Achievement unlocked: produced your first prime. Statistically, this was inevitable."*

> *"You have just disassembled a perfectly good 144 to recover four 2s and a 3. We hope this was worth it."*

> *"Congratulations, you have invented the function. Several centuries of mathematicians, briefly impressed."*

> *"You produced f<sub>ε₀</sub>(100). We have no idea what to award you."*

### Visual

**Direction: a mathematician's pencil notebook on squared paper.**

The canvas is cream/off-white paper with a faint pale-blue squared grid (5mm, the European mathematician's standard). Everything the player places is rendered as if **penciled in by hand** — slightly imperfect strokes, variable line weight, character without being twee. The aesthetic register is closer to *Ramanujan's notebooks* than to a sketchbook-style indie game: confident, precise, focused on the work.

The frame is "you are working in your own private mathematical notebook," which fits the discovery-and-invention loop better than any engineering or lecture-hall framing would. It also unlocks **marginalia** as a natural home for the narrator — penciled side-notes at the edge of the page, sometimes with arrows pointing to the relevant cell.

**Concrete elements:**

- **Paper**: warm off-white, subtle grain, faint squared grid (light pencil-blue, near-invisible).
- **Blocks**: pencil-sketched tiles with handwritten-feeling numerals inside. Slight variation between identical instances gives the page life. All blocks are the same physical size — only labels vary.
- **Equations**: drawn function-boxes with hand-lettered operator symbols (`+`, `×`, `^`, `↑↑`). Input/output ports as small drawn arrows.
- **Pipes**: pencil lines between cells. Magnitude communicated by line weight and hatching (a 1-pipe is a single thin stroke; a 10⁶-pipe is heavier with cross-hatching).
- **River of zeros**: a horizontal strip along the bottom edge where small penciled `0`s drift slowly. Faint hatching underneath suggests flow. The river extends past both edges of the page — uncountably many zeros implied by it never starting and never ending.
- **Gallery**: a separate notebook section. A grid of cells filling in as numbers are produced. Primes get red colored-pencil highlight; perfect numbers get a star; famous numbers get a margin annotation.
- **Shop / Curriculum**: a margin or sidebar styled as a penciled to-do list. Each unlock a line item with a checkbox, ticked off on purchase.
- **Narrator marginalia**: pencil notes at the page edge, in a slightly different hand from printed labels. Short, dry, sometimes underlined. Occasional arrows to specific cells.

**Color discipline:**

Default state is graphite-gray on cream. Color is used the way mathematicians use colored pencils — *sparingly, for meaning*:

- **Red** for *marking* — the grader's pen. A prime gets a red **underline**
  (something notable); a V2 antinumber gets a red **strike-through**
  (something crossed out). One pen, two marks; the strike-through reads as
  threat, the underline as discovery.
- **Blue** for negatives
- **Green** for rationals / decimals
- **Purple** for complex
- **Yellow highlighter** for the player's current selection or active callouts

The page begins muted and gains color slowly as discoveries multiply. That gradual chromatic growth is itself a long-arc visual reward.

**Animation philosophy:**

Everything "draws itself" rather than appearing instantly. New cells sketch in with a brief stroke animation (~150ms). Pipes trace themselves when placed. Deleted cells get an eraser swipe and leave a faint smudge that fades. Block production: a small scribble at the equation's output where the new block materializes. None of it is fast or flashy — it's the timing of a calm, confident hand.

**The discipline:** clean and unsentimental. Not a kid's doodle notebook. A working mathematician's page.

### Number Display and the Magnitude Ladder

All blocks share the same physical size. As numbers escalate, the *label* climbs through notation tiers:

| Range | Notation | Example |
|---|---|---|
| 0–999 | plain digits | `42`, `999` |
| 10³–10⁶ | digits with commas | `123,456` |
| 10⁶ – ~10¹⁰⁰⁰⁰ | scientific notation | `1.5 × 10⁴⁵` |
| Beyond that, up to legible tower heights | **power tower** (literal stacked exponents, penciled in) | a 4-level stack |
| Towers too tall to render fully | truncated tower with height badge | top 3 levels, ellipsis, base, `↕ 47` |
| Beyond power towers | Knuth arrow / hyperoperation notation | `3 ↑↑↑ 4` |
| Beyond arrows | Conway chains, fast-growing hierarchy | `f_{ε₀}(100)` |
| Beyond that | the game gives up | `yes`, `▮▮▮`, or similar parody placeholder |

**Why power towers matter:** tetration is an actual mechanical operation in the game, and its outputs *are* power towers by construction. Rendering them as stacked exponents is faithful to what the number is — not a notation trick. The pencil-notebook aesthetic also renders towers beautifully: each level smaller and lighter than the one below, exactly as mathematicians actually write them.

**Notation transitions are parody beats**, each accompanied by narrator marginalia:

- First scientific-notation block: *"Comma notation discontinued."*
- First power tower: *"This number is now a building."*
- First Knuth arrow: *"We have stopped writing the tower out. Use your imagination."*
- First fast-growing-hierarchy number: *"This number is technically definable. That is all we are prepared to claim."*

### Audio

To be designed. Soft ambient base layer, discrete satisfying tactile sounds for production events — pencil scratches on paper, the soft rustle of page-turn, mechanical clicks for cell placement. Possibly degrading into structured noise as numbers escalate beyond comprehension.

---

## 18. First Moments — The Opening 60 Seconds

The opening teaches every core mechanic through play, with one short pencil-margin annotation per beat. No tutorial text walls. No menus first.

- **0:00** — Empty cream page, faint blue squared grid, soft ambient pencil-on-paper sound. At the bottom, small penciled `0`s drift slowly leftward. Hand cursor visible. No UI, no text.
- **0:05** — Player moves the cursor; the hand follows. Hovering over the river, it pinches.
- **0:10** — Player click-drags a `0` from the river. It lifts out; a new `0` slides in to fill the gap behind it. Player drops it on the page with a soft `tap`. Marginalia: *"You picked up a zero. Auspicious."*
- **0:15** — Player picks more zeros. On dropping a second near the first, they auto-stack with a small `×2` count. Stacking is learned implicitly.
- **0:25** — A few more zeros stacked. Achievement marginalia draws itself in: *"Play with some zeros."* The **Literature** tab unfolds at the page's edge.
- **0:30** — Player opens Literature. One item available: *The Successor Function `{ }` — Wraps a zero. Produces a one. Cost: 10 zeros.* Below it, faint placeholders: `?`, `?`, `?`.
- **0:35** — Player stacks 10 zeros, buys the Successor. A new cell template attaches to the cursor. Player drops it on the page. It draws itself in: a scribbled `{ }` with a drop zone inside, input port on one side, output on the other.
- **0:45** — Player picks a `0`, drops it into the brace's center. The `0` is briefly visible *inside* the braces, then a `1` slides out the other side. *"Built `1` from nothing. Peano nods approvingly."* The Total Score in the top corner ticks: **1**. A small `+1` floats upward like a red-pencil mark.
- **0:55** — Player repeats. Score climbs: 2, 3, 4. The page is filling with `1`s. The loop is now taught entirely through play.

By 60 seconds the player has held a number, stacked numbers, opened the Literature, purchased a function, placed it, used it, and watched their Total Score begin its long climb. From here the path to addition, to pipes, to the first storage, and onward is the same lesson repeated at each scale: *the next obvious thing to do.* Addition (the first real grind, 900 ones at ~1 one/sec with a pipe ≤1) is the first deliberate wait.

---

## 19. Pacing and the Simulator

Pacing is the most playtest-sensitive aspect of the game, and the team
relies on a standalone simulator (`sim/`) to model the curve rather than
guessing.

### Pacing targets

| Milestone | Speedrun (optimal play) | Casual |
|-----------|--------------------------|--------|
| Tetration | ~5 hours | ~10 hours |
| Pentation | ~12 hours | ~24 hours |

**Pentation grew (was ~7h) with the α.5c Ladder Rule + per-tier comp
puzzles.** Every comp tier now demands the construction of `1 × 2^(N-1)`
as an engineering proof; that's eighteen additional puzzles on the
path to pentation. The new shape trades a flatter final cliff for many
small decision points — more agency, less idle waiting.

These targets are stable across the Comprehension Spine rework (§9). The curve underneath will change — power-of-2 Comprehension tiers replace the eight-tier ladder, pipe leveling dissolves into Comprehension itself, cultivators move from streaming to transformer-with-escalating-cost — so the previous Stage A–G stage-by-stage outline is being re-derived from scratch. Phase 6's first move is to re-port the simulator and discover the new shape; the targets in this table are what the sim is solving for.

### Three axes of progression

Every primitive (Successor, Adder, Mult, Exp, Warehouse) has three orthogonal growth axes:

1. **Quantity** — build more copies. Geometric repurchase scaling. This is also the throughput knob for **Pipes**, which no longer have a separate leveling axis (per §9, pipe progression collapses into the Comprehension ladder; one Literature entry per magnitude tier, parallel placement for throughput).
2. **Level** — upgrade existing copies. Doubling per level, with **qualities** at certain tiers:
   - Successor lvl 3: *river-tap* (fires without a pipe ≤1)
   - Successor lvl 5: *bundle output* (every 5 firings emit a `5` block)
   - Addition lvl 4: *variadic* (sums 3 inputs per firing)
   - Mult/Exp lvl 3: *fuel cost −1* (min 1)
   - Mult/Exp lvl 5: *fuel cost halved*
   - Warehouse lvl 3: *dual output ports*
   - Warehouse lvl 4: *built-in fuel port*
   - Warehouse lvl 5: *feeds multiple destinations*
3. **Type** — entirely new variants (cell types, warehouse rules, bot families).

Both Quantity and Level are mathematically equivalent in pure throughput
(2× for 1 level, 2× for 2 copies), but **leveling adds qualities, takes
less canvas space, and costs higher-magnitude currency** (self-amortizing —
you must use a cell to afford its next level). The player makes
meaningful choices at every step.

Level cap is currently 5; a separate design session revisits cell leveling
on its own terms (§9 *What This Defers*). **Bots** carry independent
magnitude ratings rather than levels — see §14.

### The simulator

`sim/` is a standalone Node CLI that walks an optimal-play agent through
the Literature roadmap and reports time-to-each-unlock. It is the source
of truth for pacing numbers — `sim/catalog.ts` mirrors
`src/lib/literature.ts` and `src/lib/cost.ts`, and is the file to edit
when retuning.

Usage:
```bash
node sim/run.ts                # default roadmap, console summary
node sim/run.ts --verbose      # show every purchase event
node sim/run.ts --csv pacing.csv   # spreadsheet output
```

The simulator currently models the leveling system, river-tap, fuel-cost
discount qualities, and inversion. Phase 6 extends it to model the
Comprehension Spine: power-of-2 Comprehension ladder, universal
magnitude gate, cell-jam state, decomposer bots, warehouse-capacity
scaling, transformer cultivators. The agent decision tree gains new
branches: choose between Comp upgrade, decomposer bot for in-place jam
clearing, T-bot deployment at the current frontier, or waiting for
cheaper paths.

When changing Literature costs in `src/lib/literature.ts`, also update
`sim/catalog.ts` and re-run the sim to confirm the curve still hits the
pacing targets above.

---

## 20. Open Design Questions

Deliberately left unsettled, to be resolved by prototyping and playtesting:

- **Output-magnitude fuel cost.** Today fuel scales with input magnitude. A future design lever: scale fuel with the magnitude of the *result*, so exp(10, 9) producing a 10⁹ is appropriately expensive. Risks: tetration overflow. Deferred but tracked.
- **Specific Shop costs.** Tuned via the simulator; future passes refine.
- **Detailed UI layout.** The conceptual model is clear; the screen design is not.
- **Polymorphic-equation edge cases.** What does `0^0` do? `0!`? Surprising identities — Easter eggs or surfaced content?
- **Save/load and autosave cadence.** Standard concerns but not designed.
- **Platform.** Desktop primary; mobile possible but not committed.
- **Performance ceilings.** What happens when the player has 10,000 cells firing? Throttling? Aggregation?

---

## 21. Non-Goals

Things this game is *not* — guardrails to prevent drift:

- **Not a story-driven game.** No plot, no characters, no world.
- **Not a multiplayer game.** Single-player only.
- **Not a twitch real-time strategy game.** *Revised for V2:* the
  Adversary (Part II) adds a light, **abstracted** real-time defense
  layer — a slowly advancing front, generous reaction windows, idle-
  friendly automation. It is not an APM contest, not unit micro, not a
  game you can lose to slow reflexes. The factory remains the heart; the
  defense is pressure, not panic.
- **Not a puzzle game with discrete levels.** One continuous canvas.
- **Not a teaching tool.** Math is the content, not the curriculum.
- **Not a clicker.** Clicking is available; the design rewards engineering over clicking.

It is one thing only: a parody factory in which numbers go big.

---

# Part II — The Adversary (V2)

*This part layers a defensive-conflict spine onto the factory described in
Part I. Everything in Part I still holds: the river of zeros is the only
source, numbers grow in magnitude **and** amount, the page is a pencil
notebook, the narrator is a dry academic, and Comprehension governs the
economy. V2 adds something to push **against**.*

> **Reading note (post-V3).** Part II is the V2 design vision — the
> *artillery* (functions that pre-process threats). The **primary** combat
> that actually shipped is the **army** (the Shield), described in **Part
> III — The Clash (V3)**; read the two together. Where Part II says "is",
> treat it as design intent; the **Implementation status** box at the end of
> Part III is the authority on what's actually built and how (e.g. batteries
> pull ammo from the *pool*, not from pipes; there is no remainder-spill).

## V2.1 Why an adversary

V1 is a clean construction toy with no opposition. Two consequences:

1. **No moment-to-moment tension.** The score only goes up; there is
   never a reason to act *now*.
2. **Half the math is dead weight.** Subtraction, Division, Factor,
   Decrement, Negation, and Inversion all *reduce* Total Score, so an
   optimal builder avoids them. The "number-reducing" operators exist but
   have no compelling job.

The Adversary solves both at once. An advancing front of **negative
numbers** threatens a defendable **Core**; the player repels it using the
numbers they produce. The reducing operators become the **primary weapon
tree** — the worse a tool is at *building* score, the better it is at
*destroying* a threat. The dead half of the math becomes the live half of
the defense. (This follows the project's own rule: *the best new mechanics
integrate, they don't isolate* — the point of the Adversary is not the
enemies it adds but the existing systems it makes essential.)

## V2.2 The fiction — the grader's red pen

The adversary is the **grading correction**. You construct in graphite;
the red pen crosses your work out. This reuses, rather than expands, the
notebook's palette: red is the *marking* color. A prime gets a red
**underline** (the grader noting something notable); an antinumber is a red
**strike-through** (the grader crossing something out). One pen, two marks.

The narrator stays dry and unalarmed:

> *"A correction approaches from the right margin."*

> *"−12 has been struck through. The grader remains unconvinced."*

> *"You negated an incoming −256 into a +256. The error is now an asset.
> Sound pedagogy."*

No story, no characters, no lore — just entropy with a red pencil. The
flavor is suggested; the mechanics below stand without it.

## V2.3 Entities

- **Antinumber (the enemy).** A **negative `Value`** (−4, −100, −2^k, …)
  that spawns at the far right edge and advances slowly leftward along a
  horizontal **lane band** toward the Core. Its **magnitude is its threat
  and its hit-points**, rendered as a red, struck-through `−N` numeral.
  (Routing enemy labels through the full magnitude ladder — commas / sci /
  towers / arrows — is design vision; today it is a plain `−mag` string.)
  An antinumber is **not a player
  block**: it lives in its own `antinumbers` registry and is **excluded
  from `recompute()`**, so it never contributes to Total Score until it is
  *converted* (see Negate, below).
- **The Core ("rigor").** A protected anchor at the safe (left) edge with
  a hit-point pool (scales with the frontier). An antinumber that reaches it
  deals damage equal to its magnitude. The Core is **repaired by Rampart
  overflow** — once the Shield (Part III) is topped up, the feeder's surplus
  heals the Core. At 0 HP it triggers a **setback** (§V2.6), never a hard
  loss.
- **The Front.** The lane region the antinumbers cross. Visually it is the
  contested strip between the far edge and the Core, drawn on its own
  layer above the workspace and below the river so combat reads clearly
  against the calm factory behind it.

## V2.4 The weapon tree — the synergy core

Defense is **your operators acting on the passing antinumber**, reusing the
existing pure arithmetic (`value.ts`) and `operate()` verbatim — an
antinumber is just a negative `Value`, so every operator already knows what
to do with it. Each reducing operator earns a combat job:

| Weapon | On enemy `−M` with ammo `a` | Effect | Reuses |
|---|---|---|---|
| **Add** | `−M + a` | **Finish.** If the result ≥ 0 the enemy is annihilated. (A remainder-spill reward is design vision, *not* implemented.) | `valueAdd` |
| **Divide** | `−M / a` | **Soften.** `−100 / 4 → −25`. The premier crowd-control — knock a big threat down so a cheap Add can finish it. | `valueDiv` |
| **Subtract** | chip | Cheap continuous chip damage. | `valueSub` |
| **Negate** | `−M ↦ +M` | **Convert.** Turn the attacker into score *and* ammo. High value, paid in signed fuel. | `operate('negation')` |
| **Multiply** | `−M × −b` | **Sign-flip combo.** Two negatives make a large positive — turn a clustered threat into a windfall (mis-sign it and you make the threat *worse*). | `valueMul` |
| **Inversion** | `−M ↦ −1/M` | **Trivialize.** Collapse a boss's magnitude to a fraction; produces negative fuel, feeding the existing signed-fuel economy. | `valueRecip` |
| **Factor / Decrement bots** | decompose enemy | Autonomous chip/split defenders. | `operate('factor' \| 'decrement')` |

The canonical defensive combo — **Divide to soften → Add to finish →
Negate the remainder into wealth** — is built from exactly the three
operators that *cost* Total Score in construction. That inversion of
worth is the heart of V2: the tools you avoided while building are the
tools you live by while defending.

> **Built vs. designed.** Of the table above, the shipped artillery is the
> **Add / Divide / Negate** battery (plus the manual Add of a dropped
> positive). Subtract, Multiply, Inversion, and Factor/Decrement *defenders*
> are design vision, not yet implemented. And per V3 (Part III), combat
> batteries are **artillery** — they only fire on a front-most antinumber
> whose magnitude *exceeds the Shield*; the Shield (the army) absorbs the
> rest.

**Both growth axes gain combat demand.** A *wave of many* small
antinumbers requires **throughput** — many shots per second, i.e. the
*amount* axis. A single *boss* antinumber requires **magnitude** — one
shot big enough, i.e. the *magnitude* axis. The two ways "numbers go big"
each get a defensive reason to exist, which is exactly the V1 promise the
overhaul must keep.

## V2.5 Manual → automated defense

The defense arc mirrors the river→pipe arc the game already teaches, at a
new scale.

- **Manual (the moment the Adversary appears).** Drag a positive block
  from your workspace directly onto an incoming antinumber to add into it
  by hand (or near the Core to feed the Shield — Part III). Tactile,
  immediate, and reuses the existing drag-onto-target resolution in the
  interaction layer.
- **Automated (mid-game).** Place **Battery cells** on the canvas. A battery
  targets the **front-most** antinumber and **pulls its ammo from the pool**
  (loose blocks + warehouses, via `spendFuel` — *not* from pipes; no wiring,
  matching the α.5c "ladder pulls from the pool" philosophy), then applies
  its operator. Batteries come in the three combo flavors — **Add** (finish),
  **Divide** (soften), **Negate** (convert) — plus the V3 **Rampart**
  (`feed`, the army-feeder, Part III). Per V3 they are *artillery*: they hold
  fire unless the front-most threat exceeds the Shield.

## V2.6 The Core and the setback

When the Front overruns the Core's hit-points, a **setback** fires — real
stakes, fully recoverable, never a deleted run:

- The Front overruns a **band of the canvas**: the loose blocks in that
  band are **erased** (the eraser-swipe animation already in the visual
  language), and the production frontier is pushed back temporarily.
- The wave **pauses** to let the player rebuild and re-establish the line.

Repair is proactive: route positive numbers into the Core to rebuild HP
before it falls. The Core is therefore a permanent, scaling **score sink**
that competes with growth for the player's production — the central
economic tension of V2. A *hard* loss (Core collapse ending the run) is
reserved as an optional **prestige trigger** (§V2.9), not a base-game
punishment.

## V2.7 Waves and boss-numbers

- **Waves** spawn on a cadence. Antinumber magnitude **scales with the
  player's frontier** (tied to the Comprehension tier and/or Total Score)
  so the threat is always *frontier-appropriate* — never trivial, never
  impossible. This keeps the mid and late game full of things to do and
  gives the player a standing reason to maintain a *steady stream* of
  production rather than parking a single trophy number.
- **Boss-numbers** turn the predicate catalog into encounter design — the
  "math is content" pillar made literal, reusing `classify.ts` and
  `warehouse-rules.ts`:
  - **Prime boss** `−p` — indivisible: Division stalls on it (no clean
    quotient), forcing exact-magnitude Add or Decrement. Uses `isPrime`.
  - **Power-of-two boss** — halves cleanly: a Division-friendly breather.
  - **Perfect-number boss** `−6, −28, −496, …` — uses `isPerfect`.
  - **Famous boss** `−1729` ("Erratum: Hardy–Ramanujan") — uses
    `FAMOUS_NUMBERS`; pure narrator delight.

  Each boss type *forces* a different weapon, so the player's whole arsenal
  stays relevant instead of collapsing onto one optimal tool.

## V2.8 The economy and pacing

- **A new Defense branch in Literature** (gated by `requiresUnlock:
  'subtraction'`): the battery cells (Add / Divide / Negate / **Rampart**
  `feed`) as repeatable `cell` entries, plus Core fortification (a
  `kind: 'defense'` entry). Range / cadence / wall upgrades and defensive
  bot variants are design vision, not yet built.
- **Score-model decision (authoritative).** Antinumbers are excluded from
  `recompute()`; only a *converted* antinumber (via Negate) becomes a
  player block and counts toward Total Score. Two things subtract score:
  the **setback** (erases loose blocks) and **feeding the Shield** (a
  positive committed to the army leaves the pool — see Part III). The score
  still measures *what you possess*; the threat, and magnitude committed to
  defense, are things you do not currently hold as blocks.
- **The defense tax.** Because the Core competes with growth for
  production, the player runs a continuous allocation decision: how much
  output to divert to defense versus unlocks. The simulator models this
  explicitly (§V2.10) and the pacing targets (Tetration ~5 h, Pentation
  ~12 h) are held within tolerance *including* the defense tax — defense
  must never fully starve growth.

  > **Sim finding (V2.0, `sim/adversary.ts`).** Combat *cannot* return
  > pentation to the locked ~12 h — any felt defense tax delays it. At the
  > recommended baseline (≈13% tax) pentation lands at **~13 h** with
  > tetration ~4h47m; bosses dent the Core but never break it (0 setbacks
  > on the optimal line). The trade-off (war intensity vs minutes-to-
  > pentation, offset by battery efficiency) is mapped by `--sweep`. The
  > standing recommendation is to **re-baseline this target to "~13 h with
  > combat."**

## V2.9 Prestige tie-in (documented, deferred)

The Core's collapse is the natural **prestige trigger**: a run that "fails
its defense" resets, banking its peak as an Ancestral Number (§15). V2
documents this hook so the slices leave room for it; it does not build
prestige.

## V2.10 The combat simulator

The Adversary must be balanceable before it is built, so V2 is **sim-first**
like every prior phase. The standalone `sim/` harness gains an adversary
model (`sim/adversary.ts`, mirroring the decoupled `catalog.ts` pattern):
wave schedule, antinumber magnitude curve, battery throughput, and Core
hit-points. The optimal-play agent now splits production between **growth**
(unlocks) and **defense** (surviving waves), and the report adds combat
metrics: per-wave **survival margin**, **ammo-throughput vs incoming
threat**, **Core HP over time**, and the **defense tax** (fraction of
production diverted to defense). The acceptance bar: defense never fully
starves growth, and the Part I pacing targets still hold. The full model
spec lives in `sim/ADVERSARY.md`.

---

# Part III — The Clash (V3)

*Part II built the **artillery** — functions that pre-process specific
threats. Part III adds the **army**, which is the primary combat: your
produced positives clash with the incoming negatives, mass against mass.
Plan + prototype notes live in `V3_PLAN.md`; the balance model is
`sim/throughput.ts`.*

## V3.1 The Shield (the army) and the Rampart

- **The Shield** is a positive-magnitude reservoir on the Core, rendered as
  a bold number just ahead of it. It *is* your committed army. Antinumbers
  reaching the **Rampart line** clash with it and annihilate **1:1 by
  magnitude** *before* they can reach Core HP. If the Shield covers the
  antinumber, it is annihilated; if the Shield is exhausted, the remainder
  carries on and damages the Core.
- **Feeding the Shield** follows the manual→automated arc: drop a positive
  near the Core by hand, or place a **Rampart** (a battery in `feed` mode)
  that pulls positives from the pool and converts their magnitude into
  Shield. Auto-feed is **capped at a frontier-proportional target**
  (`SHIELD_TARGET_MULT × coreMaxHp`) so it doesn't drain the whole pool;
  **overflow past the cap repairs Core HP**. Manual feed is uncapped — a
  deliberate big commitment is the player's call.

## V3.2 Why this is the design's heart

- **Numbers clashing with numbers.** The army (the Shield) does ~all the
  fighting *by count* and *by fuel*; the artillery only picks off the rare
  threats the Shield can't absorb. Validated in `sim/throughput.ts`: the
  army fights ~99.7% of enemy count, functions stay throughput-capped
  "spice," and their leverage asymptotes — **the swarm and the
  uncomprehended frontier are structurally immune to functions** (modding a
  tiny number is pointless; the frontier is comp-gated), so no amount of
  battery-spam replaces the clash.
- **Throughput war = agency.** Holding the line means keeping production
  flowing and scaling defense to the threat. A static "set-and-forget"
  defense collapses; active investment holds *and* grows. Moment-to-moment
  is calm (Ramparts auto-feed), but every Comprehension tier scales the
  threat and creates a pressure-then-relief beat.

## V3.3 Implementation status (authoritative)

What is actually built (the source of truth over any "is" phrasing in
Part II):

- **Army:** `shield: Decimal` on the Core; antinumbers clash at `RAMPART_X`
  before Core HP at `IMPACT_X` (`src/lib/adversary.ts`). Shield rendered by
  `pixi/antinumber.ts:drawCore`.
- **Feed:** manual `tryFeedShieldAt` (drop near the Core); automated
  `batteryMode: 'feed'` → `consumePositiveBlock` (pulls the **smallest loose
  positive block**, not warehouses), capped at `SHIELD_TARGET_MULT (=4) ×
  coreMaxHp`, overflow → `repairCore`.
- **Artillery:** `battery` cell, `batteryMode ∈ {add, divide, negate,
  feed}`, ammo from the pool via `spendFuel`; combat batteries only fire on
  the front-most antinumber whose magnitude **exceeds the Shield**.
- **Core:** HP scales with the frontier (`CORE_HP_BASE × tier + fortify`).
  Setback on collapse erases the lowest-magnitude band of loose blocks,
  clears the Front, pauses the wave, rebuilds the Core; recoverable, no run
  loss.
- **Onset:** the whole Adversary is gated on the **Subtraction** unlock.
- **Persistence:** save schema **v18** stores `coreHp`, `coreFortifyTiers`,
  `coreShield`.
- **Not built (design vision):** Subtract/Multiply/Inversion/Factor
  *defenders*, remainder-spill, magnitude-ladder enemy rendering, defensive
  bots, range/cadence/wall upgrades, the prestige tie-in, and full V3.4
  wave/threat tuning.
