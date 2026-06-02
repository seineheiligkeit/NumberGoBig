# V4 — The Set-Theoretic Foundations (project plan)

**Status:** the **core set system is BUILT and verified** (V4.0–V4.2 + the
V4.4 primitives). Remaining slices (V4.3 predicate-sets, full V4.4 guided
derivations, V4.5 Dedekind cuts, V4.6 ordinals) are designed below but not
yet built. A creative-but-careful plan for grounding the game in set theory,
following the V2/V3 discipline.

> **Build status (this batch).**
> - **Done & run-verified:** a `'set'` **Value** variant (magnitude 0 → never
>   scores; Comprehension gates *cardinality*); `sets.ts` (pure ∪ ∩ \ △,
>   power set, cardinality, singleton, unfold); **8 cells** (`singleton`,
>   `count`, `unfold`, `powerset`, `set-union/intersect/diff/symdiff`) wired
>   through `operate()`, rendered (`pixi/set-cell.ts`), priced
>   (`literature.ts`, gated behind Addition / Exponentiation), and persisted
>   (set blocks snapshot/restore, incl. nested sets). The block renderer
>   shows set labels (`{2, 5, 7}`). Type-check 0/0, build clean, 0 runtime
>   errors. **Headless tests confirm:** dedup, ∪/∩/\/△, |𝒫(A)|=2^n,
>   order-independent equality, set magnitude 0, and — the capstone —
>   **successor built from set primitives**: `Count(Union(Unfold(n),
>   Singleton(n))) = n+1`.
> - **Not yet built:** V4.3 (intensional predicate-sets + Separation as a
>   first-class layer — the Filter already does stream-separation), the
>   *guided* V4.4 derivation puzzle + Blueprint capture + ×/^ derivations,
>   V4.5 (Dedekind cuts), V4.6 (ω + ordinals). Each is its own slice.

---

## 1. Context — why this is a natural fit, not a bolt-on

The game is *already* standing on set theory and doesn't say so:

- The river is **∅** (the empty set); the **von Neumann successor**
  `S(n) = n ∪ {n}` builds the numbers.
- **Warehouses** are collections of numbers — i.e. sets.
- The **Filter** cell is the **Axiom of Separation**: `{x ∈ A : φ(x)}`.
- **Rule-warehouses** (`primes`, `composites`, `<100`) are sets defined by a
  predicate — *comprehension* sets.
- The **Comprehension** spine is named after a set-theory axiom and gates
  exactly the thing set theory cares about: which sets you can *form*.

So V4 is **mostly a reframe + a thin new logic layer + a few cells**, not a
rewrite. That is the whole reason it can "behave nicely in the system."

## 2. The one insight to build around

The game climbs the **operator hierarchy**. In set theory that ladder *is* a
ladder of **set operations**, each more tangible than the abstract operator:

| Operator | The set operation that *is* it | Why it grows that way |
|---|---|---|
| Successor | `n ∪ {n}` (union + singleton) | add one element |
| Addition | disjoint union `A ⊔ B` | pour two sets together |
| Multiplication | Cartesian product `A × B` | the grid of all pairs |
| Exponentiation | **power set** `P(A)` / `Aᴮ` | *all subsets* |
| Tetration | cumulative hierarchy `Vₙ = P(Vₙ₋₁)` | subsets of subsets… |

Two gems make this worth doing:

- **Cantor's theorem** (`|P(A)| > |A|`) is *the reason numbers go big* — the
  power set is the explosion engine.
- The **cumulative hierarchy is literally tetration of 2**: `V₀,V₁,V₂,V₃,V₄`
  have `1,2,4,16,65536` elements. The late game's "numbers as buildings"
  already *is* the hierarchy of sets.

## 3. The crucial distinction: two notions of "set"

Getting this clean upfront prevents the biggest breakage (player confusion):

- **Collection-sets** — a *bag of distinct numbers* (`{2, 5, 1729}`). The
  everyday, extensional set. This is what warehouses already are. Supports
  Boolean algebra (∪ ∩ \ △). **Accessible, fun, low-risk — the early layers.**
- **Numbers-as-sets** — the von Neumann encoding where `3 = {0,1,2}`. The
  foundational construction. Surfaced via *unfold* and the constructive
  operators. **Deep, higher-risk (nesting/abstraction) — the later layers.**

They must look and read differently (a `{ }` Set bag vs a `⊞` stock
warehouse; "unfold" reveals the *inside* of a number). The plan keeps them in
separate slices and lets the narrator name each once.

## 4. Architecture principles (how it stays clean in our system)

These are the integration rules every slice obeys:

1. **The Set layer is *logic*, the number layer is *wealth*.** Sets organize
   and transform; they do **not** contribute to Total Score. Magnitude
   crosses between layers only via **Count** (set → number) and **Unfold**
   (number → set). This keeps `recompute()` and score-conservation untouched
   — the careful economy the whole game rests on is preserved.
2. **Infinite sets are intensional, never enumerated.** Predicate-sets
   (`primes`, a Dedekind cut) are stored as *rules* and combined logically;
   only finite enumerated sets are ever materialized. (Reuses the
   filter/rule-warehouse predicate machinery.)
3. **Comprehension gates *cardinality and predicate complexity*, exactly as
   it gates magnitude today.** You cannot *form* a set whose size exceeds your
   Comprehension ceiling — which naturally throttles Power set and Unfold, the
   same way it throttles exponentiation. The pun becomes the mechanic.
4. **Augment, never replace.** The working operator cells stay. V4 adds a
   *lens* (numbers are sets), an *optional constructive path* (build operators
   from primitives), and a *new logic layer* (set algebra). Nothing existing
   is torn out.
5. **One tangible action per concept, discovered through play.** The player
   *does* `n ∪ {n}` long before anyone says "von Neumann," exactly as they
   pick up a zero before anyone says "Peano." The dry narrator supplies the
   single wry footnote.

## 5. The sliced roadmap

Each slice ships a complete, playable increment. V4.0–V4.2 alone are a
satisfying, low-risk layer; the deeper slices are optional depth.

### V4.0 — The Set object: membership + Count
**What:** a first-class **Set** (built on the rule-warehouse infra) that holds
*distinct* numbers. Drop blocks in to add them (a duplicate does nothing —
"a set has no repeats"); **Count** emits a number block equal to `|A|`.
**Behaves:** reuses warehouse storage/render; Sets don't score (principle 1);
Count is the one bridge into the economy.
**Fun:** the "no duplicates" aha is the perfect first set-theory beat;
collecting feels good (Pokédex-like, and the Gallery already rewards it).
**Risk:** Set-vs-warehouse confusion → mitigate with distinct `{ }` visual +
the narrator. **Acceptance:** you can build a set, dropping a duplicate is a
no-op, and Count turns it into a usable number.

### V4.1 — Set algebra: ∪ ∩ \ △ (the AND / OR)
**What:** Union, Intersection, Difference, Symmetric-difference cells
(two Set inputs → one Set output) on finite enumerated sets.
**Behaves:** pure set semantics on distinct elements; composes with the
rule-warehouse predicates already present.
**Fun:** the **logic-factory** layer — building `{even} ∩ {<20}` to fill a
Literature demand is a genuine puzzle; XOR enables nice "exactly one of"
tasks.
**Risk:** wiring two set inputs adds a little plumbing complexity → keep the
cell shapes generous; cap enumerated-set size by Comprehension (principle 3).
**Acceptance:** the four ops produce correct sets; Literature can demand a
composed set and verify it.

### V4.2 — Power set + the cardinality production loop (Cantor, made fun)
**What:** the **Power set** cell `P(A)` → the set of all subsets (size
`2^|A|`), Comprehension-gated. Combined with Count, this is **exponentiation
*via sets*** — build a set, power-set it, count it → a big number.
**Behaves:** the explosion is gated by Comprehension exactly like `^`
(forming `P(A)` when `2^|A|` exceeds your ceiling jams — consistent with the
existing jam rule). Gives the Set layer a real **economic purpose** (an
alternative production engine), not just logic.
**Fun:** Cantor's theorem is *viscerally felt* — `P` of a 5-set is 32, of a
20-set is a million. "Make all the subsets" is a great verb.
**Risk:** materializing `2^|A|` elements is an explosion → never enumerate
beyond Comprehension; render the power set abstractly (cardinality + a sample,
collapse the rest), like the magnitude ladder already collapses big numbers.
**Acceptance:** `P` + Count reproduces `2^n` within the Comprehension band and
jams (doesn't hang) past it.

### V4.3 — Comprehension cashed in: predicate-sets + Separation
**What:** **Predicate-sets** (intensional, possibly infinite — `primes`,
`evens`, `<N`) as first-class; the Filter cell reframed as **Separation**
`{x ∈ A : φ(x)}`. Set algebra extends to predicates (predicate ∩ enumerated =
filter; predicate ∩ predicate = a conjoined rule).
**Behaves:** reuses the existing predicate/filter system wholesale; raising
**Comprehension** literally widens the predicates/sets you can form.
**Fun:** the pun pays off ("Comprehension = what you can comprehend (form)");
composable predicates are deep but tactile. Optional late flavor: a
**Russell** hazard — try to separate "the set of all sets that don't contain
themselves" and a cell jams on the paradox until you constrain it (a wink, not
a wall).
**Risk:** intensional vs extensional is the subtlest idea here → introduce
*after* enumerated sets are second nature; keep infinite sets as rules only.
**Acceptance:** a predicate-set ∩ an enumerated set yields the right finite
subset; infinite sets never enumerate.

### V4.4 — Numbers are sets: Unfold + the constructive ascent
**What:** **Unfold** (number `n` → its von Neumann set `{0,…,n−1}`, gated to
comprehensible `n`); the primitives **Singleton `{·}`** and **Pair**; and the
**constructive operator derivations** — Successor `= Union∘Singleton`,
Addition `= ⊔`, Multiplication `= ×`, Exponentiation `= P`. A derivation is a
*one-time puzzle* that, once solved, is captured as a **Blueprint** = a
reusable, self-defined operator (you don't hand-grind primitives forever).
**Behaves:** uses the Blueprint system as "define-your-own-operator";
augments (doesn't replace) the packaged operator cells.
**Fun:** the **constructive ascent** — "I built `+` from disjoint union," "I
built `^` from power sets." The single deepest payoff of V4.
**Risk:** *the homework risk lives here.* Mitigate hard: derivations are
short, on small numbers, **optional** (they grant a bonus — a Gallery beat, a
cheaper leveled operator, or the next-tier unlock — but the packaged operator
remains the everyday tool); nesting is rendered abstractly.
**Acceptance:** a player can derive successor from `{·}` + `∪`, save it as a
blueprint, and it produces `n+1`; bulk production still uses the packaged cell.

### V4.5 — Constructing the number systems (families as constructions)
**What:** reframe/deepen the family unlocks as set constructions — negatives
as difference-classes of pairs `(a,b)`, rationals as pairs `(p,q)`, and
**irrationals as Dedekind cuts**: `√2 = { q : q² < 2 }` built with the
predicate-set machinery (V4.3).
**Behaves:** a cut is just a predicate-set of rationals — no new machinery,
only a new *meaning* for the irrational family.
**Fun:** "I built √2 as a *set of rationals*" — the chuckle-worthy depth;
mathematicians nod. Optional/discovery-flavored, never required.
**Risk:** abstraction → keep late, optional, narrator-delighted.
**Acceptance:** an irrational can be produced as a named cut via a predicate
on rationals.

### V4.6 — The transfinite: ω and the ordinals (the endgame)
**What:** **complete the river → ω** (the Axiom of Infinity as a milestone:
"all the naturals, gathered into one set"), then ordinal arithmetic (`ω+1`,
`ω·2`, `ω²`, `ω^ω`, `ε₀`). Merges with the long-deferred ordinals/surreals;
Total Score becomes ordinal-valued (DESIGN §3 already anticipates this).
**Behaves:** the cumulative-hierarchy = tetration link (V4.2) is the bridge
from finite to transfinite.
**Fun:** the ultimate "numbers go big in every sense"; non-commutative ordinal
addition (`1+ω = ω ≠ ω+1`) is a delightful narrator gotcha ("the void was here
first").
**Risk:** large scope; a new ordinal `Value` variant → its own mini-project.
**Acceptance:** ω is reachable as an object; `ω+1 ≠ 1+ω` reads correctly.

### V4.A — Adversary tie-in (optional flavor; slots into V2/V3)
A **Russell-set boss** (paradoxical — forces a Separation tool, not brute
force), **self-membership loops** as a hazard (Foundation: no set contains
itself), and **∅ as the void** the antinumbers try to collapse you into.
The math *is* the encounter design. Pure spice — never required.

## 6. Where this could break the game (consolidated)

1. **Two "sets" muddle.** → crisp naming/visuals, separate slices, narrator.
2. **Economy double-count / broken conservation.** → Sets are logic-layer,
   don't score; magnitude crosses only via Count/Unfold (principle 1).
3. **Infinite / explosive sets** (predicates, power set). → intensional
   predicates; Comprehension gates cardinality; abstract rendering.
4. **Tedium / homework** (esp. V4.4). → package operators after one-time
   derivations; deep constructions optional + late.
5. **Visual explosion** (von Neumann nesting). → abstract like big numbers
   (cardinality + sample + collapse); never render deep nesting.
6. **Scope creep.** → V4.0–V4.2 is a complete, shippable layer; the rest is
   opt-in depth, sliced independently.
7. **Pacing.** → Power-set production and derivation costs touch the magnitude
   economy; **sim-first** for those (extend `sim/` with a set-production path
   before tuning game costs).

## 7. Where it's really fun (consolidated)

- The **"no duplicates" aha** (first set action).
- **Composable logic puzzles** (∪ ∩ △ to satisfy Literature).
- The **fold/unfold duality** — build a set and count it; take a number apart.
- The **constructive ascent** — building `+`, `×`, `^` from set primitives.
- **Define-your-own-operator** via blueprints.
- **Power set as the explosion engine** — Cantor, felt in your hands.
- The **reveals**: numbers-are-sets, √2-is-a-set-of-rationals, ℕ-becomes-ω.
- **Collection** as a goal (sets to complete — the Gallery, set-ified).
- The **mathematician's chuckle**: it's *correct*, just playful.

## 8. The no-homework standard

Every set concept enters through **one action**, never a definition, and the
deep machinery is **optional reward**, not a gate:
- You see a **duplicate vanish** before you hear the word "set."
- You **make all the subsets** before anyone says "power set" or "Cantor."
- You **derive successor** as a rewarding puzzle — then never have to again.
- The narrator delivers the single dry footnote ("Several centuries of
  mathematicians, briefly impressed").

The test for every feature: *would a player have fun and learn one true
thing, while a mathematician chuckles and can't fairly say we faked it?*

## 9. Testing / sim

- **Correctness:** set ops (∪ ∩ \ △, P, Separation) are pure functions on
  value-collections — unit-testable headlessly, and drivable in the real game
  via the DEV hooks (build a set, count it, assert cardinality).
- **Balance:** the power-set→count production path and the derivation
  costs are pacing-sensitive — extend `sim/` with a set-production agent
  (sim-first) before locking game costs, exactly as for V2.0/V3.

## 10. What V4 deliberately defers

Forcing arithmetic to *always* run on raw von Neumann sets (it would be
unplayably slow and visually impossible); full transfinite cardinal arithmetic
(ℵ₀, the continuum) beyond ordinals; and the deeper foundational axioms
(Choice, Replacement, Foundation as core mechanics rather than flavor).

---

**Suggested first concrete step:** V4.0 + V4.1 (the Set object + the
∪ ∩ \ △ logic layer) — the lowest-risk, highest-clarity win, built almost
entirely on the warehouse/filter infrastructure already in place. It
establishes "warehouses are sets" and the AND/OR you asked about, and proves
the economy-separation principle, before the deeper constructive slices.
