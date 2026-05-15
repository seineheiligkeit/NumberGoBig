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

### Cultivation Cells

A late-mid-game family of equation cells — **Cultivation Cells** — generate streams of numbers from a single seed. Each takes a number as a seed input (which is *not consumed*) and emits a continuous output stream determined by the cell's growth function.

Different Cultivation cells implement different mathematical growth patterns, each its own Literature unlock:

- **Arithmetic** — emits `seed, seed + k, seed + 2k, seed + 3k, …` (linear growth)
- **Geometric** — emits `seed, seed × r, seed × r², …` (exponential growth)
- **Fibonacci** — emits the Fibonacci sequence scaled by the seed
- **Harmonic** — emits the partial sums of `seed × (1 + ½ + ⅓ + …)` (painfully slow; narrator joke material)
- **Polynomial** — emits values along a chosen polynomial curve
- **Factorial** — emits `seed × 0!, seed × 1!, seed × 2!, …` (terrifying)
- Other growth functions unlock progressively as Literature deepens.

Cultivation cells are the primary mechanism for producing the **ungodly stockpiles of low-value numbers** that high-tier operators require as fuel (see *Computational Cost* below). A dedicated cultivation zone — typically seeded with `1`s, producing endless streams of small numbers — becomes a normal part of the mid-to-late factory layout.

Cultivation respects the "one source" pillar by requiring a seed: every cultivated number derives ultimately from a seed the player constructed from the river of zeros. The river remains the origin; cultivation only amplifies.

### Computational Cost

Operators (and cultivators) have a **computational cost** in addition to their operand inputs: each firing consumes fuel. The cost is **proportional to the order of magnitude** of what the operator is working with — which mirrors how much information the operator is actually generating.

#### The cost rule

For binary operators, **cost ≈ tier · ⌈log₁₀(max(|a|, |b|) + 1)⌉**, where `tier` is:

| Operator | Tier | Cost per firing |
|---|---|---|
| Successor | 0 | 0 (free) |
| Addition / Subtraction | 0 | 0 (free) |
| Multiplication / Division | 1 | `⌈log₁₀(max + 1)⌉` |
| Exponentiation | 2 | `2 · ⌈log₁₀(max + 1)⌉` |
| Tetration | 4 | `4 · ⌈log₁₀(max + 1)⌉` |
| Pentation and higher | 8, 16, … | escalating per tier |

Successor on a `0` is free; multiplication of two single-digit numbers costs `1`; multiplication by a `10⁶` costs `6`; exponentiation `2^10` costs `2`; tetration `2↑↑3` costs ~4. The framing is mathematically honest: the operator pays in proportion to the work it represents.

For **cultivators** (which emit a sequence on a timer), each emission's cost is **⌈log₁₀(emission + 1)⌉**. A geometric cultivator with seed `2` emits 2, 4, 8, 16, … and costs 1, 1, 1, 2, 2, 2, 3, … as the values grow — the chain naturally throttles itself. Player removes the seed when fuel runs short.

**Decomposition** (Decrement, Factor) is **free and refunds magnitude**: factoring a 144 returns three 2s and a 3 (small, useful fuel), at the cost of Total Score. Decomposition is the game's mid-game pressure release.

#### Fuel currency: magnitude, not denomination

Fuel is **paid in magnitude**, not in "ones". One block per firing, whose value is at least the cost — over-payment is wasted (the player learns to keep matched denominations: small change in `wh<10`, bigger units in `wh<1000`). A multiplication of cost 5 can pay with one `5` block, one `7` block (over-pays 2), or one `50` block (over-pays 45).

This is what makes **rule-based warehouses** (§8) load-bearing — the player designs warehouses as fuel reservoirs at different denominations and wires them to operators that need them.

#### Tiered fuel ports

Where the fuel comes from depends on the operator's tier:

- **Tier 0** (Successor, Addition, Subtraction): no fuel port. Free, no wiring.
- **Tier 1** (Multiplication, Division, Exponentiation): **optional fuel port**. If a pipe is wired to it, the operator pulls exclusively from that warehouse. If no pipe is wired, the operator falls back to scanning loose blocks and warehoused contents globally — a safety net that keeps early factories simple.
- **Tier 2+** (Tetration, Pentation, Knuth arrow, …): **required fuel port**. Won't fire without explicit wiring. Late-game becomes a real fuel-pipeline logistics puzzle, with each high-tier operator demanding its own dedicated fuel route.

The optional/required boundary is the player's onboarding ramp into resource management. Mid-game teaches the pattern; late-game requires it.

**Consequences:**

- **Cultivators self-throttle.** A geometric chain producing `2^30` costs `9` per emission — sustainable only with serious fuel infrastructure.
- **The small-number warehouse stays critical forever.** Cheap operations need cheap fuel; players hoard small denominations as small change.
- **Decomposition gains sharp purpose.** Factoring a 10⁶ reclaims real fuel (six 1-magnitude units), not narrator commentary.
- **Fuel routing is layout work.** Where you put your `wh<100` matters. The factory grows a circulatory system.
- The high-tier operator's **net contribution to Total Score remains positive** — the output dwarfs the fuel — but the fuel must be earned, stored, and routed. Infrastructure depth without reward erosion.

**This replaces the rejected "Operator Fuel" pattern.** That earlier idea gave every operator its own fuel pool — pure bookkeeping. Here, fuel is one currency (magnitude), drawn from one kind of container (warehouses), with cost that scales naturally with what the operator is doing.

### Equation Properties

- **Throughput** (firing rate) — upgradeable from the Shop with appropriate currency.
- **Magnitude limit** — the size of inputs/outputs the cell can handle. Upgradeable.
- **Polymorphism** — equations accept *any* combination of types and produce the appropriately-typed output. A `+` cell happily adds a Real and an Irrational and outputs an Irrational. An `i × i` produces a Real. Surprising identities (Euler's, etc.) emerge as gameplay moments.

### Unrouted Outputs

If an equation has no output pipe and no storage, blocks pile up at the output port. The pile is clickable; identical blocks consolidate visually. When the pile hits a soft cap, the equation pauses until cleared.

---

## 7. Pipes and Magnitude

Pipes transport blocks automatically between cells. Each pipe has a **magnitude rating** — a 10-rated pipe carries blocks up to 10 but rejects anything larger.

**Building a pipe rated for magnitude N costs N-rated blocks.** A 10-pipe costs 10s; a 1000-pipe costs 1000s; a 10⁶-pipe costs 10⁶s.

This creates a **recursive bootstrap**: you must first produce a magnitude before you can pipe it. Hand-craft a few 10s manually, use them to build a 10-pipe, automate 10-production, accumulate 100s to build a 100-pipe, and so on up the magnitude tower.

**Connections are strict**: a pipe rated below an equation's output magnitude simply will not connect. The player must plan their layout by magnitude.

---

## 8. Storage

Storages (warehouses) hold blocks up to a capacity. They are unlocked once the player accumulates a meaningful stack on the canvas — clutter triggers the unlock organically.

Larger storages, more storages, and richer storage rules are purchased from the Shop.

Storage is what allows the player to **hoard numbers** to fuel later operations. Late-game, warehouses are the backbone of the economy — fuel reservoirs, currency vaults, and the visible expression of the player's accumulated work (per §3, warehouse contents count toward Total Score).

### Typed warehouses (early game)

The basic warehouse holds blocks of a **single value type**, locked by the first deposit (drop a `1` and the warehouse stores `1`s; further deposits of any other value are refused). Capacity is fixed (default 100). Drag-drop on the deposit zone to add; click the output port to withdraw one.

### Generalized warehouses (mid-game and beyond)

Mid-game introduces **rule-based warehouses** — warehouses defined by a *predicate* rather than a single locked value. Examples:

- `wh: value < 10` — accepts any 0..9
- `wh: value < 100` — small-change wallet
- `wh: prime` — currency vault for Literature entries that demand primes
- `wh: composite`, `wh: divisible by 6`, `wh: family = irrational`, …

The predicate vocabulary is the same one Filters (§13) uses — Generalized Warehouses are essentially "Filter + Storage" fused into one cell. They reuse the predicate language so introducing standalone Filters later is a small step rather than a new concept.

**As fuel sources.** Wired to a tier-1 or tier-2+ operator's fuel port, a generalized warehouse provides fuel: the operator pulls one matching block per firing and pays its value (§6 Computational Cost). The player designs warehouses by intended denomination — `wh<10` for cheap operations, `wh<1000` for tetration's appetite — and wires them to the operators they're meant to feed.

**As currency reservoirs.** Wired to a Literature entry's demand (when that mechanism arrives in Phase 4), a generalized warehouse can satisfy multi-unit costs ("400 primes ≥ 10⁶") by drawing from its own rule-matching contents.

**Composite rules** ("prime AND > 10⁶") arrive alongside Filters in Phase 4 and use the same predicate combinator UI.

---

## 9. Comprehension (manual handling cap)

The player can manually drag blocks anywhere on the canvas — but only up to their current **Comprehension** level. Early game, Comprehension is small (e.g. 10). Larger blocks visibly exist on the canvas but cannot be picked up by hand.

**Comprehension is upgraded from the Shop**, and is the spine of the pacing curve — eight tiers from ≤25 to ≤10⁹, each pairing a **specific-number engineering puzzle** (1729, 6174, 65,536, etc.) with a **bulk stockpile** at the tier's magnitude.

The ladder, as currently tuned (Phase 5.6):

| Tier | Ceiling | Engineering puzzle | Bulk |
|------|---------|--------------------|------|
| I    | 25      | one each of 1–9 + a 25 | — |
| II   | 100     | one each of 25, 50, 100 | — |
| III  | 250     | one 250 | 5 hundreds |
| IV   | 1,000   | one 1,729 (Hardy–Ramanujan) | 10 hundreds |
| V    | 10,000  | one 6,174 (Kaprekar) | 3,500 ten-thousands + 350 thousands |
| VI   | 100,000 | one 65,536 (2¹⁶) | 1,750 hundred-thousands + 350 ten-thousands |
| VII  | 10⁶     | one 9,999 | 700 millions + 175 hundred-thousands |
| VIII | 10⁹     | — | 350 billions |

The puzzle is the *signature challenge*; the bulk is the *pacing*. A player who knows how to construct 1729 (12³ + 1) spends a moment on it; the 10 hundreds force the factory to run for a while. Together they make each tier feel both intellectual and earned.

This mechanic guarantees that **manual play has a soft ceiling that climbs behind automation**. Automated pipes can transport any-sized block they are rated for; only manual drag is gated. The player can build big numbers but cannot trivially hand-place them — they must first earn the right to understand them.

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

The Gallery is the game's Pokédex — a visible record of every special number the player has ever produced. It is organized into tabs:

- **Integers** — a literal grid filling in as each value is produced
- **Primes** — with subcategories for twins, cousins, Mersennes, Fermats, etc.
- **Perfect numbers**
- **Famous constants** — π, e, φ, …
- **Famous numbers** — 1729, 42, 65,536, 6174 (Kaprekar), …
- **Sequences and families** — Fibonacci, Catalan, Lucas, …
- **And so on, expandable indefinitely**

**Gallery entries persist across prestiges.** Discovery is permanent; currency is per-run. The Gallery is the player's long-term identity and achievement record.

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

### Cleanup Bots

A later automation upgrade: bots that patrol the canvas, collecting loose blocks into the nearest matching storage. Frees the player from manual tidying once factories sprawl.

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

- **Red** for primes
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

### Pacing targets (Phase 5.6)

| Milestone | Speedrun (optimal play) | Casual |
|-----------|--------------------------|--------|
| Tetration | ~5 hours | ~10 hours |
| Pentation | ~7 hours | ~14 hours |

The shape is **dense early, climbing mid, aspirational late**:

- **Stage A (0–15 min)**: Successor → Subtraction. 5 unlocks at 3–7 min cadence. Teaches mechanics.
- **Stage B (15–60 min)**: Multiplication and infrastructure. The first real grind appears (500-1000 ones for Addition).
- **Stage C (1–2 hr)**: Exponentiation, Square Root, Comp_1k. Mid-magnitude production matures.
- **Stage D (2–3 hr)**: Pipe ≤100 climb. 5,000 hundreds — the signature mid-game gate. Cultivation Arithmetic intermediate.
- **Stage E (3–4 hr)**: Comp_10k, Comp_100k, Pipe ≤1k, Comp_1m. Real stockpiles at each tier, not waterfall.
- **Stage F (4–5 hr)**: Tetration. 4,000 thousands.
- **Stage G (5+ hr)**: Comp_1b, Pentation. The "10⁹ class" payoff.

### Three axes of progression

Every primitive (Successor, Adder, Mult, Exp, Pipe, Warehouse) has three orthogonal growth axes:

1. **Quantity** — build more copies. Geometric repurchase scaling.
2. **Level** — upgrade existing copies. Doubling per level, with **qualities** at certain tiers:
   - Successor lvl 3: *river-tap* (fires without a pipe ≤1)
   - Successor lvl 5: *bundle output* (every 5 firings emit a `5` block)
   - Addition lvl 4: *variadic* (sums 3 inputs per firing)
   - Mult/Exp lvl 3: *fuel cost −1* (min 1)
   - Mult/Exp lvl 5: *fuel cost halved*
   - Pipe lvl 3: *lower jam threshold*
   - Pipe lvl 4: *batched transfer* (2 items per tick)
   - Warehouse lvl 3: *dual output ports*
   - Warehouse lvl 4: *built-in fuel port*
   - Warehouse lvl 5: *feeds multiple destinations*
3. **Type** — entirely new variants (cell types, pipe magnitudes, warehouse rules).

Both Quantity and Level are mathematically equivalent in pure throughput
(2× for 1 level, 2× for 2 copies), but **leveling adds qualities, takes
less canvas space, and costs higher-magnitude currency** (self-amortizing —
you must use a cell to afford its next level). The player makes
meaningful choices at every step.

Level cap is currently 5; future iterations may extend levels into the
giant-number tiers themselves.

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

The simulator models the leveling system, river-tap, and fuel-cost
discount qualities. The agent automatically considers cloning vs.
upgrading, picking whichever has higher ROI given the bottleneck.

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
- **Not a real-time strategy game.** Time pressure is absent.
- **Not a puzzle game with discrete levels.** One continuous canvas.
- **Not a teaching tool.** Math is the content, not the curriculum.
- **Not a clicker.** Clicking is available; the design rewards engineering over clicking.

It is one thing only: a parody factory in which numbers go big.
