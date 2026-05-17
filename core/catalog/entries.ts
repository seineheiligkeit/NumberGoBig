/**
 * Literature catalog — the Shop entries.
 *
 * One canonical home for every purchasable, gated, or theorem entry the
 * game and the sim both walk. Edit numbers HERE (after sim-validating
 * in `sim/catalog.ts` per §19 — sim is the source of truth for pacing).
 *
 * The array's order matters for the in-game Literature sidebar (rendered
 * in declaration order, filtered by availability) and for the sim agent's
 * roadmap walk (consumed in declaration order until a goal entry is
 * unlocked).
 *
 * Pure data — no runtime state access, no rendering. Live in `core/` so
 * `src/lib/literature.ts` (game purchase mechanics) and `sim/catalog.ts`
 * (agent roadmap) consume the same shape.
 */

import { valueOf } from '../value.ts';
import type { CellType } from '../cell-types.ts';
import {
  ladderUnlockCost,
  generateComprehensionLadder,
  generatePipeLadder,
} from './costs.ts';
import type { LiteratureEntry } from './types.ts';

export const LITERATURE_ENTRIES: readonly LiteratureEntry[] = [
  // -- Operators --------------------------------------------------------
  // Costs rebalanced in the Phase 5.6 pacing overhaul. Validated via the
  // standalone simulator in `sim/`. The shape: dense Stage A unlocks,
  // increasingly aspirational mid-game, hyperoperators gated on real
  // factory scale. Edit `sim/catalog.ts` and re-run `node sim/run.ts`
  // before changing numbers here — the sim is the source of truth.
  {
    id: 'successor',
    kind: 'cell',
    name: 'Successor Function',
    glyph: '{ }',
    description: 'Wraps a number. n → n + 1. The first theorem.',
    cost: ladderUnlockCost(0, 10), // 10 zeros
    unlockMessage: 'Result added to your literature: the Successor Function.',
  },
  {
    id: 'addition',
    kind: 'cell',
    name: 'Addition Operator',
    glyph: '+',
    description: 'Two summands enter, their sum emerges. a + b.',
    cost: ladderUnlockCost(1, 400), // 800 zeros + 400 ones
    unlockMessage: 'Result added to your literature: the Addition Operator.',
  },
  {
    id: 'subtraction',
    kind: 'cell',
    name: 'Subtraction Operator',
    glyph: '−',
    description: 'a − b. Minuend on top, subtrahend below. Negatives now admissible.',
    cost: ladderUnlockCost(1, 80), // 160 zeros + 80 ones
    unlockMessage:
      'Result added to your literature: Subtraction. The number line, henceforth, extends in both directions.',
  },
  {
    id: 'multiplication',
    kind: 'cell',
    name: 'Multiplication Operator',
    glyph: '×',
    description:
      'Repeated addition, formalised. a × b. Each firing burns a ladder of small numbers (DESIGN §6).',
    // α.5c: ladder unlock (L=2, M=100) + negative predicate + 1 × 10 puzzle.
    cost: [
      ...ladderUnlockCost(2, 100), // 400z + 200o + 100t
      { ruleId: 'negative', count: 20 },
      { value: valueOf(10), count: 1 }, // puzzle: construct a 10 via addition
    ],
    unlockMessage:
      'Result added to your literature: the Multiplication Operator. Fuel is paid as a ladder — every firing pulls a pyramid of small numbers.',
  },
  {
    id: 'division',
    kind: 'cell',
    name: 'Division Operator',
    glyph: '÷',
    description:
      'a ÷ b. Exact rationals when the division does not divide evenly. Each firing burns a ladder of small numbers.',
    // α.5c: ladder L=2 × M=40 + puzzle 1 × 100.
    cost: [
      ...ladderUnlockCost(2, 40),
      { value: valueOf(100), count: 1 }, // puzzle: prove you can multiply
    ],
    unlockMessage:
      'Result added to your literature: Division. The rationals are admitted, exact and unreduced where they belong.',
  },
  {
    id: 'exponentiation',
    kind: 'cell',
    name: 'Exponentiation Operator',
    glyph: '^',
    description:
      'Repeated multiplication, formalised. a ^ b. Fuel ladder one tier deeper than mult — every firing pulls zeros through threes.',
    // α.5c: ladder L=3 × M=50 + prime predicate + 1 × 100 puzzle.
    cost: [
      ...ladderUnlockCost(3, 50), // 400z + 200o + 100t + 50×3
      { ruleId: 'prime', count: 30 },
      { value: valueOf(100), count: 1 },
    ],
    unlockMessage:
      'Result added to your literature: Exponentiation. Tetration, when it arrives, will be ruinous.',
  },
  {
    id: 'tetration',
    kind: 'cell',
    name: 'Tetration Operator',
    glyph: '↑↑',
    description:
      'A tower: a ↑↑ b is a stacked b copies of a. Each firing pulls a five-deep ladder: 16 zeros, 8 ones, 4 twos, 2 threes, 1 four (× the magnitude of inputs).',
    // α.5c: ladder L=4 × M=950 + irrational predicate + 1 × 1024 puzzle.
    cost: [
      ...ladderUnlockCost(4, 950), // 15200z + 7600o + 3800t + 1900×3 + 950×4
      { ruleId: 'irrational', count: 10 },
      { value: valueOf(1024), count: 1 }, // puzzle: 2^10
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Tetration. We told you it would be ruinous.',
  },
  {
    id: 'pentation',
    kind: 'cell',
    name: 'Pentation Operator',
    glyph: '↑↑↑',
    description:
      'Repeated tetration. a ↑↑↑ b is a tower whose height is itself a tower. Each firing pulls a six-deep ladder through zeros up to fives.',
    // α.5c: ladder L=5 × M=250 + 1 × 1M puzzle.
    cost: [
      ...ladderUnlockCost(5, 250), // 8000z + 4000o + 2000t + 1000×3 + 500×4 + 250×5
      { value: valueOf(1_000_000), count: 1 }, // puzzle: the 10^6 milestone
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Pentation. Two arrows were a building; three arrows is the building rebuilding itself.',
  },
  {
    id: 'variadic-arrow',
    kind: 'cell',
    name: 'Knuth Arrow Operator',
    glyph: '↑ⁿ',
    description:
      'a ↑ⁿ b — arbitrary-arrow hyperoperation. Three inputs: base, arrow count, height. Fuel cost climbs as 2ⁿ; arrows ≤ 10.',
    cost: [{ value: valueOf(1000), count: 10 }],
    costScale: 2.0,
    unlockMessage:
      'Result added to your literature: the Knuth Arrow. You may now parametrise the operator hierarchy itself.',
  },
  {
    id: 'decrement',
    kind: 'cell',
    name: 'Decrement',
    glyph: '−1',
    description: 'n in, n−1 out one side, a 1 out the other. Liberates units.',
    cost: ladderUnlockCost(1, 10), // 20z + 10o
    unlockMessage:
      'Result added to your literature: Decrement. Numbers may now be undone, one step at a time.',
  },
  {
    id: 'factor',
    kind: 'cell',
    name: 'Factor',
    glyph: 'p…',
    description: 'A composite in, its prime factorisation out. Costs Total Score.',
    cost: ladderUnlockCost(1, 30), // 60z + 30o
    unlockMessage:
      'Result added to your literature: Factor. The Fundamental Theorem of Arithmetic, mechanised.',
  },
  {
    id: 'square-root',
    kind: 'cell',
    name: 'Square Root',
    glyph: '√',
    description: 'A non-negative input in, its square root out. Non-squares surface as irrationals.',
    // α.5c: ladder L=3 × M=12 + puzzle 1 × 100.
    cost: [
      ...ladderUnlockCost(3, 12),
      { value: valueOf(100), count: 1 },
    ],
    unlockMessage:
      'Result added to your literature: the Square Root. The Pythagoreans send their belated apologies.',
  },

  // -- Inversion family (Slice 6.15) -----------------------------------
  // Negation produces negatives systematically; Inversion turns small
  // inputs into big outputs (and vice versa) on a *signed* fuel cost.
  // The pacing sim (6.14) locked these numbers: Negation cheap (100 ×3),
  // Inversion mid-game gate (100 ×100), no production-shortcut concern.
  {
    id: 'negation',
    kind: 'cell',
    name: 'Negation',
    glyph: '(−)',
    description: 'A unary sign flip — n becomes −n. A clean source of negative blocks without the awkward 0 − n dance.',
    cost: ladderUnlockCost(1, 40), // 80z + 40o
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: Negation. The minus sign now arrives on demand.',
  },
  {
    id: 'inversion',
    kind: 'cell',
    name: 'Inversion',
    glyph: '1/x',
    description: 'Maps n to 1/n. Cost is signed, so tiny rationals invert into large numbers powered by negative fuel.',
    // α.5c: ladder L=3 × M=15 + puzzle 1 × 100.
    cost: [
      ...ladderUnlockCost(3, 15),
      { value: valueOf(100), count: 1 },
    ],
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: Inversion. The cost, regrettably, is sometimes negative. The cell will accept negative fuel. Do not ask why.',
  },
  {
    id: 'warehouse',
    kind: 'cell',
    name: 'Warehouse',
    glyph: '▥',
    description: 'Typed storage. Drop on the left to deposit, click the right to withdraw. Capacity 100.',
    cost: [{ value: valueOf(1), count: 25 }],
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: Warehouse. The canvas no longer needs to hold all your work in plain view.',
  },

  // -- Generalized (rule-based) warehouses (Slice 3.5.4) ---------------
  // Each rule is its own Literature entry; the placement code uses the
  // entry's `placementCellType` + `ruleId` instead of `id as CellType`.
  // Costs are deliberately tilted toward currencies the rule itself helps
  // accumulate — a `< 100` warehouse asks for tens you already have.
  {
    id: 'warehouse_rule_lt10',
    kind: 'cell',
    name: 'Generalized Warehouse (< 10)',
    glyph: '▥',
    description: 'A warehouse that accepts any block of magnitude under 10. Useful as a small-change wallet.',
    cost: [{ value: valueOf(5), count: 5 }],
    placementCellType: 'warehouse-rule',
    ruleId: 'lt10',
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to magnitudes below ten. A small-change wallet that mixes its coinage.',
  },
  {
    id: 'warehouse_rule_lt100',
    kind: 'cell',
    name: 'Generalized Warehouse (< 100)',
    glyph: '▥',
    description: 'Accepts any block of magnitude under 100. The mid-range reservoir of choice.',
    cost: [{ value: valueOf(10), count: 10 }],
    placementCellType: 'warehouse-rule',
    ruleId: 'lt100',
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to magnitudes below one hundred.',
  },
  {
    id: 'warehouse_rule_lt1000',
    kind: 'cell',
    name: 'Generalized Warehouse (< 1000)',
    glyph: '▥',
    description: 'Accepts any block of magnitude under 1000. A deeper denomination — fuel for higher operators.',
    cost: [{ value: valueOf(100), count: 5 }],
    placementCellType: 'warehouse-rule',
    ruleId: 'lt1000',
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to magnitudes below one thousand.',
  },
  {
    id: 'warehouse_rule_prime',
    kind: 'cell',
    name: 'Generalized Warehouse (prime)',
    glyph: '▥',
    description: 'Accepts only prime naturals. Currency vault for Literature entries that demand them.',
    cost: [
      { value: valueOf(2), count: 1 },
      { value: valueOf(3), count: 1 },
      { value: valueOf(5), count: 1 },
      { value: valueOf(7), count: 1 },
      { value: valueOf(11), count: 1 },
    ],
    placementCellType: 'warehouse-rule',
    ruleId: 'prime',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to primes. The fundamental currency, in a single tidy bin.',
  },
  {
    id: 'warehouse_rule_composite',
    kind: 'cell',
    name: 'Generalized Warehouse (composite)',
    glyph: '▥',
    description: 'Accepts only composites. Where Factor sends its raw stock.',
    cost: [
      { value: valueOf(4), count: 1 },
      { value: valueOf(6), count: 1 },
      { value: valueOf(8), count: 1 },
      { value: valueOf(9), count: 1 },
      { value: valueOf(10), count: 1 },
    ],
    placementCellType: 'warehouse-rule',
    ruleId: 'composite',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to composites. The natural sink for everything Factor breaks down.',
  },
  {
    // Slice 6.15. The natural fuel reservoir for Inversion. Cost in
    // negatives so the player must have made a few first — they
    // produce these through Subtraction (0 − n) or, once unlocked, the
    // Negation cell.
    id: 'warehouse_rule_negative',
    kind: 'cell',
    name: 'Generalized Warehouse (< 0)',
    glyph: '▥',
    description: 'Accepts any negative-valued block. Wire it to an Inversion cell\'s fuel port to power uphill inversions.',
    cost: [
      { value: valueOf(-1), count: 1 },
      { value: valueOf(-2), count: 1 },
      { value: valueOf(-3), count: 1 },
    ],
    placementCellType: 'warehouse-rule',
    ruleId: 'negative',
    costScale: 1.6,
    unlockMessage:
      'Result added to your literature: the Generalized Warehouse, scoped to negatives. Inversion\'s natural fuel tank.',
  },

  // -- Pipes (Phase 6 γ.1) ----------------------------------------------
  // Power-of-2 ladder, generated programmatically. One Literature entry
  // per magnitude tier (`pipe_N` rated ≤ 2^N for N = 0..29). Pipe
  // leveling has DISSOLVED into the Comp ladder (DESIGN §9): throughput
  // comes from placing parallel pipes, not from upgrading them. The
  // recursive-bootstrap rule survives — each pipe is priced in blocks
  // of its own magnitude.
  ...generatePipeLadder(),

  // -- Cultivation cells -------------------------------------------------
  // Cultivation is intentionally late-mid-game work — the cells trivialise
  // production if unlocked too early. Prices demand a substantial factory
  // of hundreds-and-thousands already on the floor; without warehouse-rule
  // infrastructure to absorb the mixed-value output, a seeded cultivator
  // also clogs its own port. Geometric chains self-throttle on fuel cost
  // (Slice 3.5.6); the up-front price keeps them off the early canvas.
  {
    id: 'cultivation-arithmetic',
    kind: 'cell',
    name: 'Cultivation: Arithmetic',
    glyph: 'a+n',
    description:
      'Drop a seed; emits a, a+1, a+2, … every 1.8 seconds. Seed is not consumed. Each emission burns one fuel block matched to its magnitude. Requires real warehouse infrastructure to feed and absorb.',
    cost: [{ value: valueOf(100), count: 700 }],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Arithmetic Cultivation. Numbers march out at a steady linear pace — each one taxing the fuel pool. Build a sink first.',
  },
  {
    id: 'cultivation-geometric',
    kind: 'cell',
    name: 'Cultivation: Geometric',
    glyph: 'a·2ⁿ',
    description:
      'Drop a seed; emits a, 2a, 4a, 8a, … Quick to overrun any pipe. Self-throttles as fuel cost climbs with each emission.',
    cost: [
      { value: valueOf(1000), count: 20 },
      { value: valueOf(100), count: 50 },
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Geometric Cultivation. Exponential growth, mechanised — and exponentially fuel-hungry. A handful of seeded cells is plenty.',
  },
  {
    id: 'cultivation-fibonacci',
    kind: 'cell',
    name: 'Cultivation: Fibonacci',
    glyph: 'a·Fₙ',
    description:
      'Input-driven transformer: each input is multiplied by the n-th Fibonacci number (F₁, F₂, F₃, … = 1, 1, 2, 3, 5, …), where n advances per firing.',
    cost: [
      { value: valueOf(1000), count: 10 },
      { value: valueOf(2), count: 5 },
      { value: valueOf(3), count: 5 },
      { value: valueOf(5), count: 5 },
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Fibonacci Cultivation. Each emission is your input scaled by the n-th Fibonacci number.',
  },

  // Phase 6 ε.2 — three series deferred since Phase 2 (DESIGN §6).
  // Costs are placeholders pending α.x sim-tuned curves.
  {
    id: 'cultivation-harmonic',
    kind: 'cell',
    name: 'Cultivation: Harmonic',
    glyph: 'a·Hₙ',
    description:
      'Input-driven transformer: each input scales by the n-th harmonic sum (1 + 1/2 + 1/3 + …). Painfully slow growth.',
    cost: [
      { value: valueOf(100), count: 250 },
    ],
    costScale: 1.7,
    unlockMessage:
      'Result added to your literature: Harmonic Cultivation. Each scaling is the running sum of reciprocals — growth measured against ln n.',
  },
  {
    id: 'cultivation-polynomial',
    kind: 'cell',
    name: 'Cultivation: Polynomial',
    glyph: 'a·n²',
    description:
      'Input-driven transformer: each input scales by (n+1)². Quadratic growth — slower than geometric, faster than arithmetic.',
    cost: [
      { value: valueOf(100), count: 350 },
    ],
    costScale: 1.8,
    unlockMessage:
      'Result added to your literature: Polynomial Cultivation. The quadratic terms march upward at a steady, calculable pace.',
  },
  {
    id: 'cultivation-factorial',
    kind: 'cell',
    name: 'Cultivation: Factorial',
    glyph: 'a·n!',
    description:
      'Input-driven transformer: each input scales by (n+1)!. Factorial growth — terrifying, throttled only by the universal Comprehension gate.',
    cost: [
      { value: valueOf(1000), count: 100 },
      { value: valueOf(100), count: 200 },
    ],
    costScale: 2.0,
    unlockMessage:
      'Result added to your literature: Factorial Cultivation. The factorial does not blink at 20! ≈ 2.4 × 10¹⁸. It does not blink at 100! either.',
  },

  // -- Filters (Slice 5.2) ----------------------------------------------
  // Predicate-based routers. They reuse the same vocabulary as the
  // warehouse-rule cells, so a player who has built the `<10` warehouse
  // already knows what the `<10` filter does.
  {
    id: 'filter_lt10',
    kind: 'cell',
    name: 'Filter (< 10)',
    glyph: 'Y',
    description: 'Routes magnitudes below 10 out the top, the rest out the bottom.',
    cost: [{ value: valueOf(10), count: 5 }],
    placementCellType: 'filter',
    ruleId: 'lt10',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Filter. A two-pronged fork — matches above, rejections below.',
  },
  {
    id: 'filter_lt100',
    kind: 'cell',
    name: 'Filter (< 100)',
    glyph: 'Y',
    description: 'Routes magnitudes below 100 out the top, the rest out the bottom.',
    cost: [{ value: valueOf(100), count: 10 }],
    placementCellType: 'filter',
    ruleId: 'lt100',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: a heavier Filter, threshold one hundred.',
  },
  {
    id: 'filter_lt1000',
    kind: 'cell',
    name: 'Filter (< 1000)',
    glyph: 'Y',
    description: 'Routes magnitudes below 1000 out the top, the rest out the bottom.',
    cost: [{ value: valueOf(1000), count: 5 }],
    placementCellType: 'filter',
    ruleId: 'lt1000',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: a Filter for the thousands.',
  },
  {
    id: 'filter_prime',
    kind: 'cell',
    name: 'Filter (prime)',
    glyph: 'Y',
    description: 'Primes out the top; composites, ones, and other shapes of number out the bottom.',
    cost: [
      { value: valueOf(2), count: 3 },
      { value: valueOf(3), count: 3 },
      { value: valueOf(5), count: 3 },
      { value: valueOf(7), count: 3 },
    ],
    placementCellType: 'filter',
    ruleId: 'prime',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Prime Filter. Now Factor has a downstream.',
  },
  {
    id: 'filter_composite',
    kind: 'cell',
    name: 'Filter (composite)',
    glyph: 'Y',
    description: 'Composites out the top; everything else out the bottom.',
    cost: [
      { value: valueOf(4), count: 3 },
      { value: valueOf(6), count: 3 },
      { value: valueOf(8), count: 3 },
      { value: valueOf(9), count: 3 },
    ],
    placementCellType: 'filter',
    ruleId: 'composite',
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: the Composite Filter. Factor and this make a small workshop.',
  },

  // -- Translation Operators (T-bots) -----------------------------------
  // Slice 6.11. The cell type id stays `cleanup-bot` for save back-compat;
  // the displayed name is the joke (translation operator T̂ in mechanics
  // shifts a function in space — exactly what these bots do for blocks).
  {
    id: 'cleanup-bot',
    kind: 'cell',
    name: 'Translation Operator',
    glyph: 'T̂',
    description:
      'A small worker patrols within a 240 px radius, walks to a loose block, and carries it to the nearest matching warehouse. Caps at the player\'s current Comprehension.',
    cost: [{ value: valueOf(10), count: 12 }],
    costScale: 1.5,
    unlockMessage:
      'Result added to your literature: Translation Operator. T̂ commutes with the identity. It does not commute with anything else.',
  },

  // -- Decomposer bots (Phase 6 δ.1, DESIGN §9) -------------------------
  // The keystone unjam tool. Each bot walks to a loose block within
  // its rating and transforms it in place. Crucially, the rating is
  // INDEPENDENT of player Comprehension — these are the ONE family of
  // automation that can act on uncomprehended `?`-blocks. Stockpile-
  // priced (the rating is paid for in lots of small change), three
  // tiers per family: low / mid / high.
  //
  // Costs are placeholders pending α.2-extension sim modeling of bot
  // tick effects on pacing. Revisit when the simulator can choose
  // between comp-upgrade and decomposer-bot deployment for jam
  // clearing.

  // Factor-bot — splits a composite into prime factors. Decomposition's
  // hot path: turn a stuck 9,797 into 97 × 101 in one motion.
  {
    id: 'factor-bot',
    kind: 'cell',
    name: 'Factor Operator (≤256)',
    glyph: 'F',
    description:
      'A walking worker rated for blocks up to 256. On arrival, splits a composite into its prime factors at the original position. Independent of Comprehension.',
    cost: [{ value: valueOf(10), count: 40 }],
    costScale: 1.6,
    botRating: 256,
    unlockMessage:
      'Result added to your literature: Factor Operator. The factorizer does not know what it has split apart. Neither, regrettably, do we.',
  },
  {
    id: 'factor-bot-mid',
    kind: 'cell',
    placementCellType: 'factor-bot',
    name: 'Factor Operator (≤16,384)',
    glyph: 'F',
    description:
      'A heavier Factor Operator rated for blocks up to 2¹⁴ = 16,384. Same action, larger reach.',
    cost: [
      { value: valueOf(100), count: 100 },
      { value: valueOf(1000), count: 5 },
    ],
    costScale: 1.6,
    botRating: 16384,
    unlockMessage:
      'Result added to your literature: Factor Operator (mid). The unknown sixteen-thousand may now be quietly disassembled.',
  },
  {
    id: 'factor-bot-hi',
    kind: 'cell',
    placementCellType: 'factor-bot',
    name: 'Factor Operator (≤1,048,576)',
    glyph: 'F',
    description:
      'A late-game Factor Operator rated for blocks up to 2²⁰ ≈ 1.05M. Even the megabyte-scale ?-blocks now have a path home.',
    cost: [
      { value: valueOf(10_000), count: 200 },
      { value: valueOf(100_000), count: 20 },
    ],
    costScale: 1.7,
    botRating: 1048576,
    unlockMessage:
      'Result added to your literature: Factor Operator (high). What you cannot read, this one will partition.',
  },

  // Decrement-bot — chips one off. Brute-force salvage for any
  // stuck number, including primes (which Factor refuses).
  {
    id: 'decrement-bot',
    kind: 'cell',
    name: 'Decrement Operator (≤256)',
    glyph: 'D',
    description:
      'A walking worker rated for blocks up to 256. Removes one and leaves a free 1 alongside. The slow, honest unjam tool.',
    cost: [{ value: valueOf(10), count: 30 }],
    costScale: 1.6,
    botRating: 256,
    unlockMessage:
      'Result added to your literature: Decrement Operator. The decrementer takes one off the unknown. This may take a while.',
  },
  {
    id: 'decrement-bot-mid',
    kind: 'cell',
    placementCellType: 'decrement-bot',
    name: 'Decrement Operator (≤16,384)',
    glyph: 'D',
    description:
      'A heavier Decrement Operator rated for blocks up to 2¹⁴ = 16,384.',
    cost: [
      { value: valueOf(100), count: 80 },
      { value: valueOf(1000), count: 4 },
    ],
    costScale: 1.6,
    botRating: 16384,
    unlockMessage:
      'Result added to your literature: Decrement Operator (mid).',
  },
  {
    id: 'decrement-bot-hi',
    kind: 'cell',
    placementCellType: 'decrement-bot',
    name: 'Decrement Operator (≤1,048,576)',
    glyph: 'D',
    description:
      'A late-game Decrement Operator rated for blocks up to 2²⁰ ≈ 1.05M.',
    cost: [
      { value: valueOf(10_000), count: 160 },
      { value: valueOf(100_000), count: 15 },
    ],
    costScale: 1.7,
    botRating: 1048576,
    unlockMessage:
      'Result added to your literature: Decrement Operator (high).',
  },

  // Inversion-bot — turns a big number into a tiny one. Inherits
  // Inversion's signed-fuel mechanic (DESIGN §6).
  {
    id: 'inversion-bot',
    kind: 'cell',
    name: 'Inversion Operator (≤256)',
    glyph: '1/x',
    description:
      'A walking worker rated for blocks up to 256. Replaces a block with its reciprocal. Inherits Inversion\'s signed-fuel mechanic — see DESIGN §6.',
    cost: [{ value: valueOf(100), count: 30 }],
    costScale: 1.6,
    botRating: 256,
    unlockMessage:
      'Result added to your literature: Inversion Operator. The inverter trades a large number for its small reciprocal. The cost, as before, is sometimes negative.',
  },
  {
    id: 'inversion-bot-mid',
    kind: 'cell',
    placementCellType: 'inversion-bot',
    name: 'Inversion Operator (≤16,384)',
    glyph: '1/x',
    description:
      'A heavier Inversion Operator rated for blocks up to 2¹⁴ = 16,384.',
    cost: [
      { value: valueOf(1000), count: 50 },
      { value: valueOf(10_000), count: 5 },
    ],
    costScale: 1.7,
    botRating: 16384,
    unlockMessage:
      'Result added to your literature: Inversion Operator (mid).',
  },
  {
    id: 'inversion-bot-hi',
    kind: 'cell',
    placementCellType: 'inversion-bot',
    name: 'Inversion Operator (≤1,048,576)',
    glyph: '1/x',
    description:
      'A late-game Inversion Operator rated for blocks up to 2²⁰ ≈ 1.05M.',
    cost: [
      { value: valueOf(100_000), count: 100 },
      { value: valueOf(1_000_000), count: 10 },
    ],
    costScale: 1.8,
    botRating: 1048576,
    unlockMessage:
      'Result added to your literature: Inversion Operator (high).',
  },

  // -- Comprehension ladder -------------------------------------------------
  // Phase 6 (DESIGN.md §9): the comprehension ladder is power-of-2 and
  // generated programmatically. 29 tiers materialise here — `comp_2` → ≤4
  // through `comp_30` → ≤2^30 ≈ 1.07B. `comp_1` (ceiling 2) is the
  // baseline; the world starts there without a purchase. The cost curve
  // mirrors `sim/catalog.ts:compUpgradeCost` after α.3 lock.
  //
  // The Literature panel hides all but the *next-unowned* tier via
  // `isComprehensionEntryAvailable`, so the catalog doesn't visually
  // explode despite housing 29 entries here.
  ...generateComprehensionLadder(),

  // -- Theorems (milestone inscriptions) --------------------------------
  // Each demands the construction of a specific number. No mechanical
  // payoff in Phase 1 — these are goal-shaped narrator beats.
  {
    id: 'theorem_first_prime',
    kind: 'theorem',
    name: 'Theorem: The First Prime',
    glyph: '2',
    description: 'Inscribe a 2 into the Literature.',
    cost: [{ value: valueOf(2), count: 1 }],
    isOnce: true,
    unlockMessage:
      'Two: the first prime, and the only even one. The Literature notes the irregularity with discomfort.',
  },
  {
    id: 'theorem_first_composite',
    kind: 'theorem',
    name: 'Theorem: The First Composite',
    glyph: '4',
    description: 'Inscribe a 4 into the Literature.',
    cost: [{ value: valueOf(4), count: 1 }],
    isOnce: true,
    unlockMessage:
      'Four: the smallest composite. Now factor may break it, and the score must pay for the privilege.',
  },
  {
    id: 'theorem_six_sixes',
    kind: 'theorem',
    name: 'Theorem: Six Sixes',
    glyph: '6⁶',
    description: 'A small ritual. Inscribe six sixes.',
    cost: [{ value: valueOf(6), count: 6 }],
    isOnce: true,
    unlockMessage: 'Six sixes. The numerologists are nodding; the mathematicians are not.',
  },
  {
    id: 'theorem_hardy_ramanujan',
    kind: 'theorem',
    name: 'Theorem: 1729',
    glyph: '1729',
    description: 'The Hardy–Ramanujan number. Construct one.',
    cost: [{ value: valueOf(1729), count: 1 }],
    isOnce: true,
    unlockMessage:
      '1729 = 1³ + 12³ = 9³ + 10³. The smallest number expressible as a sum of two cubes in two distinct ways. Ramanujan, dying in hospital, noticed instantly.',
  },

  // -- Theorems backed by predicate currencies (Slice 5.3) --------------
  // These ask for *any* N blocks satisfying a predicate, rather than a
  // single specific value. They scaffold the Phase 4 currency progression:
  // a working factory has the predicate ingredients on hand, an early one
  // doesn't.
  {
    id: 'theorem_box_of_primes',
    kind: 'theorem',
    name: 'Theorem: A Box of Primes',
    glyph: 'p×10',
    description: 'Gather ten primes — any ten.',
    cost: [{ ruleId: 'prime', count: 10, label: 'primes' }],
    isOnce: true,
    unlockMessage:
      'Ten primes, gathered. The Sieve of Eratosthenes nods approvingly from across the centuries.',
  },
  {
    id: 'theorem_big_primes',
    kind: 'theorem',
    name: 'Theorem: A Box of Bigger Primes',
    glyph: 'p≥100',
    description: 'Gather five primes of magnitude at least 100.',
    cost: [{ ruleId: 'prime', count: 5, magnitudeMin: 100, label: 'primes ≥ 100' }],
    isOnce: true,
    unlockMessage:
      'Five primes above one hundred. The deeper part of the prime sequence is no longer pure rumour.',
  },
  {
    id: 'theorem_crate_composites',
    kind: 'theorem',
    name: 'Theorem: A Crate of Composites',
    glyph: 'c×20',
    description: 'Gather twenty composites — any twenty.',
    cost: [{ ruleId: 'composite', count: 20, label: 'composites' }],
    isOnce: true,
    unlockMessage:
      'Twenty composites, displayed plainly. Factor would have something to say about each — but the Theorem is content to enumerate.',
  },

  // -- Level upgrades (Slice 6.7) -------------------------------------------
  //
  // Every leveled primitive (cells + pipes) has 4 upgrade entries (levels
  // 2..5). Throughput multiplier doubles per level. Costs are denominated
  // in the currency the primitive helps produce — self-amortizing.
  //
  // Qualities at specific levels:
  //   - Successor lvl 5: bundle output (deferred behaviour; not modeled in v1)
  //   - Addition lvl 4: variadic sum (deferred to a later slice)
  //   - Multiplication / Exponentiation lvl 3: fuel cost −1 (min 1)
  //   - Multiplication / Exponentiation lvl 5: fuel cost halved
  //   - Pipe lvl 3+: deferred jam-threshold quality
  //   - Pipe lvl 4+: deferred batched-transfer quality
  //
  // (Successor lvl 3 river-tap removed in α.5 — zeros must always flow
  // through pipe ≤1, keeping zero supply a binding constraint at every
  // factory scale.)
  //
  // Costs validated via the simulator in `sim/catalog.ts`. When tuning,
  // edit the sim first and port back here.

  // Successor levels
  {
    id: 'successor_lvl2',
    kind: 'level',
    name: 'Successor II',
    glyph: 'Ⅱ',
    description: 'Levels every Successor cell to II. Each firing emits 2 ones.',
    cost: [{ value: valueOf(1), count: 200 }],
    isOnce: true,
    levelCellType: 'successor',
    targetLevel: 2,
    unlockMessage: 'Successor levelled to II. Each firing now emits two ones.',
  },
  {
    id: 'successor_lvl3',
    kind: 'level',
    name: 'Successor III',
    glyph: 'Ⅲ',
    description: 'Levels every Successor to III. Each firing emits 4 ones.',
    cost: [{ value: valueOf(10), count: 200 }],
    isOnce: true,
    levelCellType: 'successor',
    targetLevel: 3,
    unlockMessage: 'Successor levelled to III. Four ones from each firing.',
  },
  {
    id: 'successor_lvl4',
    kind: 'level',
    name: 'Successor IV',
    glyph: 'Ⅳ',
    description: 'Levels every Successor to IV. 8 ones per firing.',
    cost: [{ value: valueOf(100), count: 300 }],
    isOnce: true,
    levelCellType: 'successor',
    targetLevel: 4,
    unlockMessage: 'Successor IV. The river feels lighter.',
  },
  {
    id: 'successor_lvl5',
    kind: 'level',
    name: 'Successor V',
    glyph: 'Ⅴ',
    description: 'Levels every Successor to V — the maximum. 16 ones per firing.',
    cost: [{ value: valueOf(100), count: 5000 }],
    isOnce: true,
    levelCellType: 'successor',
    targetLevel: 5,
    unlockMessage: 'Successor V. Peano would barely recognise the production.',
  },

  // Addition levels
  {
    id: 'addition_lvl2',
    kind: 'level',
    name: 'Addition II',
    glyph: 'Ⅱ',
    description: 'Levels every Addition cell to II. 2 sums per firing.',
    cost: [{ value: valueOf(10), count: 100 }],
    isOnce: true,
    levelCellType: 'addition',
    targetLevel: 2,
    unlockMessage: 'Addition II. The sums arrive in pairs.',
  },
  {
    id: 'addition_lvl3',
    kind: 'level',
    name: 'Addition III',
    glyph: 'Ⅲ',
    description: 'Levels every Addition to III. 4 sums per firing.',
    cost: [{ value: valueOf(100), count: 200 }],
    isOnce: true,
    levelCellType: 'addition',
    targetLevel: 3,
    unlockMessage: 'Addition III.',
  },
  {
    id: 'addition_lvl4',
    kind: 'level',
    name: 'Addition IV',
    glyph: 'Ⅳ',
    description: 'Levels every Addition to IV. 8 sums per firing.',
    cost: [{ value: valueOf(1000), count: 300 }],
    isOnce: true,
    levelCellType: 'addition',
    targetLevel: 4,
    unlockMessage: 'Addition IV.',
  },
  {
    id: 'addition_lvl5',
    kind: 'level',
    name: 'Addition V',
    glyph: 'Ⅴ',
    description: 'Levels every Addition to V — the maximum. 16 sums per firing.',
    cost: [{ value: valueOf(1000), count: 5000 }],
    isOnce: true,
    levelCellType: 'addition',
    targetLevel: 5,
    unlockMessage: 'Addition V.',
  },

  // Multiplication levels
  {
    id: 'multiplication_lvl2',
    kind: 'level',
    name: 'Multiplication II',
    glyph: 'Ⅱ',
    description: 'Levels every Multiplication cell to II. 2 products per firing.',
    cost: [{ value: valueOf(100), count: 100 }],
    isOnce: true,
    levelCellType: 'multiplication',
    targetLevel: 2,
    unlockMessage: 'Multiplication II.',
  },
  {
    id: 'multiplication_lvl3',
    kind: 'level',
    name: 'Multiplication III — Fuel Saver',
    glyph: 'Ⅲ',
    description:
      'Levels every Multiplication to III. 4 products per firing. Fuel cost reduced by 1 (minimum 1).',
    cost: [{ value: valueOf(1000), count: 200 }],
    isOnce: true,
    levelCellType: 'multiplication',
    targetLevel: 3,
    unlockMessage:
      'Multiplication III. A unit of fuel is shaved from each firing — the cell has learned to economise.',
  },
  {
    id: 'multiplication_lvl4',
    kind: 'level',
    name: 'Multiplication IV',
    glyph: 'Ⅳ',
    description: 'Levels every Multiplication to IV. 8 products per firing.',
    cost: [{ value: valueOf(10_000), count: 300 }],
    isOnce: true,
    levelCellType: 'multiplication',
    targetLevel: 4,
    unlockMessage: 'Multiplication IV.',
  },
  {
    id: 'multiplication_lvl5',
    kind: 'level',
    name: 'Multiplication V — Frugal',
    glyph: 'Ⅴ',
    description:
      'Levels every Multiplication to V — the maximum. 16 products per firing. Fuel cost halved.',
    cost: [{ value: valueOf(10_000), count: 3000 }],
    isOnce: true,
    levelCellType: 'multiplication',
    targetLevel: 5,
    unlockMessage:
      'Multiplication V. The fuel cost halves; the player resists every other economic instinct.',
  },

  // Exponentiation levels
  {
    id: 'exponentiation_lvl2',
    kind: 'level',
    name: 'Exponentiation II',
    glyph: 'Ⅱ',
    description: 'Levels every Exponentiation cell to II. 2 powers per firing.',
    cost: [{ value: valueOf(1000), count: 100 }],
    isOnce: true,
    levelCellType: 'exponentiation',
    targetLevel: 2,
    unlockMessage: 'Exponentiation II.',
  },
  {
    id: 'exponentiation_lvl3',
    kind: 'level',
    name: 'Exponentiation III — Fuel Saver',
    glyph: 'Ⅲ',
    description:
      'Levels every Exponentiation to III. 4 powers per firing. Fuel cost reduced by 1 (minimum 1).',
    cost: [{ value: valueOf(10_000), count: 200 }],
    isOnce: true,
    levelCellType: 'exponentiation',
    targetLevel: 3,
    unlockMessage: 'Exponentiation III.',
  },
  {
    id: 'exponentiation_lvl4',
    kind: 'level',
    name: 'Exponentiation IV',
    glyph: 'Ⅳ',
    description: 'Levels every Exponentiation to IV. 8 powers per firing.',
    cost: [{ value: valueOf(100_000), count: 300 }],
    isOnce: true,
    levelCellType: 'exponentiation',
    targetLevel: 4,
    unlockMessage: 'Exponentiation IV.',
  },
  {
    id: 'exponentiation_lvl5',
    kind: 'level',
    name: 'Exponentiation V — Frugal',
    glyph: 'Ⅴ',
    description:
      'Levels every Exponentiation to V — the maximum. 16 powers per firing. Fuel cost halved.',
    cost: [{ value: valueOf(100_000), count: 3000 }],
    isOnce: true,
    levelCellType: 'exponentiation',
    targetLevel: 5,
    unlockMessage: 'Exponentiation V.',
  },

  // -- Pipe leveling DISSOLVED (Phase 6 γ.1) ----------------------------
  // Pipe progression collapses into the Comp ladder; throughput comes
  // from placing parallel pipes (Quantity), not from upgrading them.
  // The 12 lvl-II/III/IV/V pipe entries that lived here are gone.
];

/** Convenient predicate for the UI to route only cell purchases to placement mode. */
export function isCellEntry(entry: LiteratureEntry): entry is LiteratureEntry & { id: CellType } {
  return entry.kind === 'cell';
}
