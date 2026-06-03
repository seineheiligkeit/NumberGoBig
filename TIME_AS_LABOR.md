# Numbers Go Big! — *Time as Labor* (prototype design)

*A ground-up reconception of the core loop. This document is the north star
for the `time-as-labor` prototype branch. It deliberately supersedes the
comprehension spine, the fuel ladder, the Adversary, Sets, the Gallery, and
the reducing operators — those return later, carefully, once the basic loop
is satisfying on its own.*

> **Relationship to the main docs.** `DESIGN.md` Pillars §2, the river-of-zeros
> (§5), the operator hierarchy (§6), Total Score (§3), and the pencil-notebook
> aesthetic (§17) all still hold. What changes is the *cost model*: the
> artificial per-firing resource ladder and the comprehension gate are replaced
> by a single, organic law — **time**. Everything else in this doc is downstream
> of that one change.

---

## 1. The thesis: math is labor, numbers are capital

A number is two things at once: **the product** you are trying to grow, and
the **fuel that buys time**. That duality is the whole game.

- **Every computation is *work* that takes *time*.** Turning `0` into `1` is
  quick. Multiplying two hundred-digit numbers is the labor of writing a
  two-hundred-digit result — it takes a long while.
- **Your accumulated numbers are *capital*.** Total Score stops being a
  passive headline and becomes a literal reserve of *bankable speed*: how many
  operation-seconds you have saved up. Spending a number to go faster is
  spending savings.
- **The factory exists to build a faster factory.** This is the Factorio loop,
  rendered in a mathematician's notebook. You out-run the rising cost of big
  numbers by building an ever-larger economy of small, fast ones.

Crucially, this is *more faithful to the original pillars* than the mechanics
it replaces. "Production runs ahead of utilization" stops being an aspiration
enforced by an artificial gate and becomes a physical fact: big numbers are
**slow to handle**, so you must keep a small-number economy flowing to keep
up. The river of zeros stays eternally central — not by decree, but because
small numbers are the cheapest, fastest fuel.

---

## 2. The one law

> **Handling a number costs time proportional to its magnitude. Building a cell
> costs time proportional to how many you already own. Distance on the page
> adds to both. Burning numbers into a cell buys speed — a fuel-number of value
> *v* is worth about *v* of work.**

This single rule governs every verb in the game.

| Verb | Duration scales with | Fuel-acceleratable? |
|---|---|---|
| **Build** a cell | how many of that cell type you already own (× delivery distance) | yes |
| **Fire** an operation | the **magnitude of its output** (the cost of writing the result) | yes |
| **Transport** a block through a pipe | **magnitude × distance** | (transport *is* the fuel-delivery throttle) |
| **Deposit / withdraw** from a warehouse | magnitude (× distance) | — |

Two clean scalings, no exceptions:
- **Magnitude** governs handling numbers (fire, transport, store).
- **Count** governs building cells (the RTS repurchase, expressed in time).

Nothing is ever *forbidden*. There is no "you cannot lift this." A `10^100` is
not blocked — it is merely *slow*, and you can always pay to hurry it. That
softness is the point: the player is never walled, only ever deciding **wait,
or spend**.

## The fuel economy — converged model (the backbone)

A number has **two sizes**, and the entire economy is the tension between them:

- **Value** (magnitude) = what a number is *worth* — as score, and as fuel.
- **Digits** (log) = what it *cost to create*.

For small numbers these are close; for big numbers the gap is enormous (a `10⁶`
is worth a million but cost ~7 digits to make). **That gap is the game.** You
cheaply *create* gigantic value, but gigantic value is *unwieldy* to move and
use. The factory exists to convert between **frozen** value (big, cheap-to-make,
nearly impossible to move) and **liquid** value (small, movable, burnable).

The full assignment of "which size do we mean where":

| Quantity | Measured in | Why |
|---|---|---|
| **Score** | **value** | wealth = what you possess |
| **Fuel content** (burned for op progress) | **value** | conserved under decomposition → no "shatter-to-1s" exploit; a handful of correctly-graded blocks powers an op |
| **Operation cost** (ticks of labor) | **digits^k**, `k` *per operator*, steepening up the hierarchy | sub-linear in value, so climbing stays net-positive; steep `k` makes higher operators dramatically more labor-intensive |
| **Min fuel denomination** (per op) | scales with the op's labor | a big op *refuses* small fuel → **fuel grades** → each tier needs the previous tier's grade → the areas chain |
| **Build cost** | count, per type | the RTS repurchase |
| **Transit** | **value^p** (super-linear) | big blocks are *frozen* — must be decomposed (or processed locally) to move/use |

**The synthesis in one line:** *digits are what it cost; value is what it's
worth; transit punishes worth super-linearly — so the value you cheaply created
is frozen until you spend cheap effort to liquefy it.*

### Why this all synergizes (the emergent fuel ladder)

Because `fuel = value` and `op-cost = digits^k`, the fuel a single operation
needs is roughly a number the *previous tier* produces, and the **minimum
denomination** forbids feeding it anything smaller. So:

- A multiplication's labor ≈ a 5-digit number → its fuel grade ≈ **the
  Addition/Successor area's output**.
- An exponentiation's labor ≈ a ~7-digit number → fuel grade ≈ **the
  Multiplication area's output**.
- …and so on. Each tier is fuelled by the tier below it, **enforced by the
  grade rule, not designed in**. "Production runs ahead of utilization" becomes
  literal: to run the top, the whole pyramid below must be producing fuel.

### The areas (emergent, not designed)

- **Fuel Farm** — mass production of small numbers (liquid, freely pipeable).
- **Production** — operators making big numbers (frozen value = score), fuelled
  from the Farm, kept fast by accelerators.
- **Reprocessing** — Mills liquefying big numbers back into graded fuel;
  accelerators burning big numbers locally for transport power.

Locality is *forced* by the transit law: a high-tier op needs high-grade (big)
fuel, and big fuel is super-linearly hard to move — so each tier must produce
its grade *near* where it's consumed, with only modest cross-area flow. That's
the multi-area factory, falling straight out of the math.

### The two new objects

- **The Mill** — an *additive* splitter (`V → smaller blocks summing to V`,
  score-conserved). It does **not** multiply fuel (value is conserved); it
  **liquefies** a frozen block into a deliverable stream at a chosen grade. The
  reason to decompose is *delivery*, never fuel gain.
- **The Pipe-Accelerator** — a placed beacon that **consumes fuel to boost the
  throughput of surrounding pipes** (transit is divided by the local boost). A
  freshly-made *big* number can be dropped into an adjacent accelerator as a
  long-burning **power cell** — its huge value = a huge local boost — giving big
  numbers a spatial sink without having to pipe them anywhere. The player's
  fork: **liquefy** (Mill into a distributed stream) or **burn whole** (local
  power cell).

> **Multiplicative decomposition (Factor → primes) is NOT a fuel tool** — it
> collapses score (factors *sum* to almost nothing) and yields little fuel. It
> returns later as a *prime-currency* tool, not here.

### Work and rate

Formally, for the simulator and the engine:


- An action has a **work cost** `W` (in "number-seconds").
- It completes at **rate** `R = baseRate + burnRate`.
- **Duration = W / R.**
- `baseRate` is a small, global, **nonzero** constant — so the game *always*
  trickles forward, even fully idle. (Idle-friendly by construction; never a
  twitch game.)
- `burnRate` comes from fuel consumed *into that specific cell*. Fuel is
  destroyed in the process (a real spend against Total Score).

**The single most important tuning knob is `baseRate`** — and the *steepness*
of how `W` grows with magnitude. We lean **aggressive** (work grows steeply, so
the acceleration economy is dominant and the mid-game is *about* feeding your
cells), but exact curves are deferred to a sim-first tuning pass (§7). Concept
first.

### Architecture B (chosen)

Two architectures were considered:

- **A — shared compute pool** ("the power grid"): one global `compute/tick`
  budget that all operations divide. Richer, but a single huge op can starve
  the rest, and it needs a budget-split policy and more UI. *Deferred as a
  possible later enrichment.*
- **B — free base per op + local burn (chosen).** Every operation runs at the
  global `baseRate` **for free, in parallel** (base is per-cell, never
  divided). On top of that, you optionally pipe fuel into a specific cell to
  rush its current operation past base speed. Scarcity comes from build-time
  scaling (caps going wide) and from fuel-delivery logistics (caps how fast you
  can burn). Simpler, fully parallel, no starvation. **We build B, designed so
  A remains reachable.**

There is **no separate furnace building and no explicit burn-rate cap** —
because fuel must physically *flow into the cell through pipes*, the delivery
logistics already cap how fast you can apply it. You cannot teleport a hoard
in to instant-finish a wall; it has to arrive. The self-limiting property is
free.

---

## 3. The economy — the generative spine

```
   ∞ zeros (free, instant)
        │
   [Successor]   ← the only primitive that creates value from nothing (0 → 1)
        │           fast & cheap (writing a "1" is trivial);
        │           gated by HOW MANY you build, not by fuel
        ▼
      1 1 1 …
        │
   [Addition]    ← score-neutral PLUMBING: consolidates many small → fewer medium
        │
        ▼
   [Multiplication / Exponentiation]  ← the AMPLIFIERS: where Total Score explodes
        │           slow (big outputs), fuel-hungry
        ▼
   big numbers = simultaneously SCORE and potential FUEL
        │
        └── burned back into cells to buy speed & build-out ──┐
                                                              ▼
                                              a larger factory, spread across the page
```

- **Zeros** are the infinite, free substrate (magnitude 0 → ~instant to write
  and move). They are not wealth; they are the raw material.
- **Successor** is the source — the only net-positive-from-nothing primitive.
  Its output is a `1`: cheap to write, therefore fast. It **can't meaningfully
  be fuel-accelerated** (the only sensible fuel for "make a 1" is a `1`, which
  is a wash), so its throughput is gated by **width** — how many successors you
  build. *This is why the factory spreads across the notebook:* the economy's
  root demands you keep widening the successor farm along the river.
- **Addition** is score-neutral plumbing — it consolidates loose small numbers
  into fewer, larger operands so the amplifiers can be fed efficiently.
- **Multiplication / Exponentiation** are the amplifiers — the only operators
  that grow Total Score super-linearly. They produce big outputs, so they are
  slow and fuel-hungry. This is where the burn economy earns its keep.

**The early bootstrap, which should feel great:**

> a few slow successors trickle out `1`s → burn some of those `1`s to *build the
> next successor faster* → more `1`s → more successors → the farm spreads and
> accelerates → eventually each new successor costs so much build-time that it's
> better to **stop making `1`s one at a time and start combining them** (build
> an Addition, then a Multiplication).

That inflection — *go wider on the source, or go up the hierarchy?* — emerges
on its own from build-time scaling. It is the first real strategic decision,
and it is not designed in; it falls out of the law.

**Warehouses** are kept (under that name). They are the fuel/operand reservoirs
you stockpile *near where they're needed* — because distance matters, a
warehouse of fast fuel next to a hungry multiplication cell is a real layout
optimization. Numbers pipe in; numbers pipe out as operands or fuel.

**Total Score = your bank of bankable work.** It measures what you possess
(loose + warehoused + in-transit), exactly as in `DESIGN.md` §3. Burning fuel
is the deliberate, recoverable spend; climbing the operator hierarchy is the
net-positive growth that must always out-pace the burn (a tuning invariant:
*burning to go fast must never cost more than the value created*).

---

## 4. The canvas becomes a map

The single biggest consequence of the law: **position finally means
something.** Distance adds to transport and fuel-delivery time, so:

- You keep fuel stockpiles **close** to the cells that burn them.
- Successor farms cluster near the **river** (their free source).
- Big-op cells sit wherever, with deliberate **supply lines** of fast small
  fuel running to them.
- A sprawling, unplanned layout is *slow*; a tight, well-supplied one is *fast*.

This is the "light RTS base-building" the prototype is really about — not
combat, but **layout, supply, and throughput**. The pan-zoom notebook stops
being mere organization and becomes the board you play on.

### The fuel logistics tradeoff (emergent, not designed)

Because transport time = magnitude × distance:

- A **big fuel block** is compact storage but **slow to deliver**.
- **Small fuel** (zeros, ones) is **fast and parallelizable** but needs
  throughput — many pipes.

So the optimal fuel economy is a *high-throughput stream of small
denominations* — which is exactly the river-of-zeros economy the game already
rests on. The pillar falls out of the physics. No ladder required.

---

## 5. Firing, reconsidered

The "cell fires on a cooldown / produces at a rate" machine is retired. A cell
is now in one of two states:

- **Idle** — operands not yet present.
- **Working** — counting down a single operation of duration `W / R`,
  optionally accelerated by fuel arriving at its fuel port.

When it finishes, it emits the output, then picks up the next operands if they
are waiting. *One computation at a time, each a real piece of labor.* This is
what makes the draws-itself visual honest: you are watching that one operation
actually happen.

Each operator cell therefore has **two kinds of input**:

1. **Operand port(s)** — the numbers being computed on (e.g. the two addends).
2. **An optional fuel port** — numbers piped in to be *burned* for speed. No
   fuel wired = runs at `baseRate` (slow but always progressing). Fuel wired =
   faster, at the cost of consuming those numbers.

(The fuel port returns from the α.5-era design, but with the opposite meaning:
it is **optional acceleration**, never a mandatory cost.)

---

## 6. Visual feedback — the draws-itself aesthetic as core mechanic, not polish

"Everything draws itself" is no longer flavor; it is the **primary feedback
channel**. The player reads the entire game state from how the hand moves.

- **Build:** a cell **sketches itself in proportional to construction
  progress** — a half-built Addition is a half-drawn box. Feeding fuel makes the
  pencil visibly move faster. At 100% it snaps to life with a small flourish.
- **Operation:** the output block is **penciled in stroke-by-stroke** at the
  output port over the operation's duration — a faint graphite ghost darkening
  into a finished numeral. Progress is readable at a glance from how complete
  the numeral is.
- **Transport:** the numeral **physically slides along the pencil pipe** — slow
  for a big magnitude, quick for a small one. "Small fuel is faster" is
  something you *see*, never a hidden stat.
- **Long-op legibility:** for operations that take a very long time (where
  stroke-by-stroke fill is imperceptible), a **subtle secondary progress meter**
  layers on top — a pencil progress bar or a clock-hand sweep of the operator
  symbol. *Draws-itself for the texture; the meter for the legibility.*

### The satisfaction rhythm

The dopamine engine of an aggressive time economy is **pressure → relief**:

> everything's crawling → I feed the furnace / widen the farm / add a supply
> line → **whoosh**, the page visibly speeds up → numbers climb → they get big
> enough to crawl again → repeat, one tier higher.

That "whoosh" is the reward. The tuning rule that protects it: **every fuel or
build-out investment must produce a felt, immediate jump in speed.** As long as
that holds, aggressive steepness is thrilling rather than grindy.

---

## 7. Deferred (but the seams stay clean)

These are **out of the prototype** but explicitly anticipated so we don't paint
ourselves in:

- **Global time levers (later, probably prestige).** "Tick-rate upgrades" are
  actually *two distinct knobs*, kept distinct from day one:
  1. **Wall-clock speed** (×N game speed) — scales work *and* fuel-production
     equally, so it merely compresses real time. Strategically neutral; the
     safe, classic idle/prestige reward.
  2. **`baseRate` boost** — raises the free trickle *relative to* work cost,
     reducing dependence on burning. Strategy-altering and far more powerful.

  For the prototype, `baseRate` is a single hardcoded constant and neither lever
  is exposed — but the engine must treat it as a single readable global so both
  can bolt on cleanly.

- **The shared-compute-pool architecture (A)** as a richer end-state.
- **Reducing operators** (Subtraction / Decrement / Factor / Negation /
  Inversion) — return *with* a properly integrated combat rethink, not before.
- **Comprehension, the Adversary, Sets, the Gallery, Filters, Blueprints,
  Cultivation, cell leveling, prestige** — all out for now.

- **Sim-first tuning.** The steepness exponents, `baseRate`, build-time scaling,
  and the magnitude→work and distance→time constants are all empirical. The
  `sim/` harness is re-pointed at the time model before any number is locked —
  exactly the discipline the main game used. (Concept now; tuning in its own
  pass.)

---

## 8. What stays sacred (the pillars, re-derived)

| Pillar (`DESIGN.md` §2) | How the time model honors it |
|---|---|
| One river, one substrate | Zeros are the only source; the fast-fuel economy *is* the river economy, emergent from transport time. |
| Production runs ahead of utilization | Big numbers are slow to handle — a physical fact, not a gate. You out-run it by building. |
| Abstraction cures clutter | (Blueprints return later; the prototype keeps the canvas small.) |
| Math is content | The operator hierarchy and magnitude ladder are the content; time makes climbing it a felt labor. |
| No story | Unchanged. The narrator stays a dry academic, now occasionally remarking on *how long things take*. |

The test for every prototype feature: *does it make the number-factory more
satisfying to build, watch, and optimize — and does it fall out of the one law,
or fight it?*
