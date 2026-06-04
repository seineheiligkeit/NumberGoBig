# *Time as Labor* — design / UX / polish plan

The economy and scales are validated (see [HANDOVER.md](./HANDOVER.md)); a
realistic session is **~25–50 cells, numbers ~1e26–1e45 over 4 h**. Before the
human playtest, this pass makes the prototype *feel finished*. Design north star:
[TIME_AS_LABOR.md](./TIME_AS_LABOR.md) — especially §6 "the draws-itself
aesthetic as core mechanic" and the **pressure→relief "whoosh"**.

> **The anchor.** *A mathematician's notebook that does the labor for you, in
> pencil, where time is visible.* Every slice must make one of three things
> **felt**: the **hand doing work**, the **relief** when you speed it up, the
> **awe** of the number getting big. If a change doesn't serve one of those, cut
> it. The pencil-on-cream aesthetic is non-negotiable; color only for meaning.

**Working method (unchanged):** small slices, each ending **buildable +
playtestable** — `npm run build` clean, `npm run check` 0/0, `npm test` 38/38,
`npm run test:e2e` green — validate by playing before the next.

## The honest starting point (what's live vs. promised)

Live today (`src/lib/view/game-view.ts`): cells **alpha-fade** in as they build;
the result numeral **alpha-fades** faint→dark over the op; a straight pencil
progress bar; the in-flight numeral slides along a **straight** pipe line; the
accelerator halo pulses. Score header + monitor + speed control.

Missing (the gap this plan closes): **real** stroke-by-stroke pencil (currently
fakery), **bezier** pipes, **any juice layer** (no pop/recoil/dust — the old
`physics.ts` never came over), the **whoosh**, distinct **cell states**
(starving looks like thriving), **milestone** celebration, **onboarding**,
**narrator**, **audio**.

---

## Progress

- ✅ **P1 — Foundations & quick wins** (bezier pipes · juice substrate · clog state).
- ✅ **P2 — Draws-itself made real** (build traces in · result written out +
  clock-sweep · eraser deletion · graphite-weight fuel gauge). Engine gained
  pure `outputStalled` / `stalled` / `recentBurn` signals (unit-tested); the
  juice layer gained dust, scale-punch, the eraser tween, and a `JUICE` scalar.
  *Hard-won lesson:* never scale or spawn interactive FX on a hit-tested
  container — visuals go in an inner `body`, the FX layer is `eventMode:'none'`.
- ⏭️ **P3 — Legibility & the whoosh** (next).
- ◻️ **P4 — Notebook & onboarding finish.**

## Sequencing (interleaved by dependency + impact-per-effort)

Four threads were chosen; they're sequenced as four phases. **P1 lays shared
substrate** (a juice layer P2/P3 reuse) and banks a fast visible win (bezier
pipes). **P2 makes draws-itself real** (the signature). **P3** is legibility +
the whoosh. **P4** is the notebook/onboarding/audio finish.

---

### P1 — Foundations & quick wins

| Slice | Content | Done when |
|---|---|---|
| **P1.1 Bezier pipes** | Replace the straight pipe line with a **port-aware cubic bezier** (tangents exit along each port's outward axis; control-distance clamped so short pipes don't loop). The in-flight numeral rides the curve by **arc-length** (sample the curve, position = arcLen·progress). A faint **dotted graphite "ink-flow"** along the path. Fuel pipes stay thinner/dashed. | Pipes read as hand-drawn notebook lines; the block follows the curve, not a chord. |
| **P1.2 Juice substrate** | Port a lean, **visual-only** `src/lib/view/physics.ts` (from the old game's `physics.ts`): velocity+gravity **dust particles**, a critically-damped **scale "punch"** and **position "impulse"** spring, a `JUICE` scalar, stepped from the ticker, guarding destroyed containers. Decoupled from sim. Wire **one** hook as proof: a **pop on block emit/arrival**. | A block landing/emitting gives a small, tasteful scale-pop; nothing in the sim changes. |
| **P1.3 Back-pressure / clog state** | When a cell's output has nowhere to go (all pipes full → spill) or a pipe's dest port is occupied, show it: the pipe end **clogs** (a small dashed-red waiting mark) and the held block **jitters** at the mouth. | A jammed supply line is visible at a glance (no more silent spills). |

**Deliverable:** the canvas already looks like a notebook (curved inked pipes)
and has the juice plumbing the rest of the pass leans on.

---

### P2 — Draws-itself, made real (the signature)

| Slice | Content | Done when |
|---|---|---|
| **P2.1 Build traces in** | Compute the cell outline's **wobble path once** (extend `pencilStroke` to expose its waypoint list), then **reveal it progressively** up to `buildFraction` each frame — a real graphite line being drawn, not an alpha ramp. A faint **pencil-tip mark** rides the drawing head. At 100%, a **snap + flourish** (a quick scribble via the juice layer). | A half-built cell is a half-*drawn* cell; completion feels like the hand finishing. |
| **P2.2 Result written out** | The output numeral is **revealed digit-by-digit / stroke-by-stroke** over the op (progressive mask of the `value-label` container) instead of alpha-fading. For long ops where that's imperceptible, layer a **clock-hand sweep on the operator glyph** (the `×`/`^` rotates a faint hand). | You can watch the answer being written; long ops read via the sweeping glyph. |
| **P2.3 Eraser deletion** | Shift-click delete plays a brief **eraser scrub**: the strokes wipe out under a moving eraser, leaving **graphite shavings** (dust particles) and a faint smudge, then removeCell/removePipe. | Deleting feels like erasing pencil, not a UI pop-out. |
| **P2.4 Graphite weight = fuel gauge** | A cell being **actively fueled** draws **darker and faster** (stroke alpha/width + meter speed scale with recent burn-rate); unfueled draws faint and slow at `baseRate`. | You read "is this cell fueled?" from how hard the pencil presses — no extra UI. |

**Deliverable:** the draws-itself promise (TIME_AS_LABOR §6) is literally true;
the hand's motion is the primary feedback channel.

---

### P3 — Legibility & the whoosh

| Slice | Content | Done when |
|---|---|---|
| **P3.1 Cell states at a glance** | Four distinct, instantly-readable looks: **idle** (faint, waiting, operand ghosts on empty ports), **working** (scratching, meter moving), **starving** (working but crawling — pencil drags, a small stalled "…"), **clogged** (from P1.3). | A glance across the factory tells you what each cell is doing and what's stuck. |
| **P3.2 The whoosh** | Feed-fuel / finish-build / connect-supply each trigger a **felt jump**: the fuel block visibly **tossed into the furnace port** and consumed in a **flare of shavings**, the **meter lurches**, strokes briefly **thicken**, a graphite **puff** (juice punch + dust). Tie intensity to the fuel value burned. | Speeding a cell up is *viscerally* rewarding — the core dopamine beat lands. |
| **P3.3 Big numbers feel epic** | **Frozen vs liquid** made visual: big blocks render **heavy** (crosshatch shading, they **sag** the pipe and crawl — transit already does the math; show it); small fuel zips bright and light. **Milestone detection hook** (first 10⁶ / googol / first power-tower) firing into P4.1. | The value/digits duality is visible; crossing a magnitude threshold is noticeable. |

**Deliverable:** the factory is legible at the 25–50-cell scale and the
pressure→relief rhythm is felt, not inferred.

---

### P4 — The notebook & onboarding finish

| Slice | Content | Done when |
|---|---|---|
| **P4.1 Narrator + milestones** | A `marginalia` store + **left-margin** UI (dry-academic TA voice), reacting to **duration** and **magnitude** milestones ("This multiplication will conclude shortly after the sun does. Allocate resources, perhaps."). Driven by P3.3's hook + op/build events. | First burn, first big build, first googol each earn a note; the voice fits. |
| **P4.2 Onboarding (first 60 s)** | Progressive hints ("Place a Successor on the river →"), **ghosted placement targets**, and **progressive tool reveal** (Exponentiation/Mill/Accelerator hidden until prerequisites used). | A fresh player reaches the first "whoosh" unaided within minutes. |
| **P4.3 Audio layer** | A tiny set: **pencil scratch** (pitched by op tier) under active ops, **eraser** on delete, a **page-flip whoosh** on milestone, soft ambient paper/room tone. Behind a mute toggle + respects reduced-motion/volume. | The silence is gone; the notebook sounds like one. |
| **P4.4 Notebook texture & areas** | Optional, if play wants it: **hand-drawn area labels** (pencil a labeled region — "Fuel Farm"), paper grain / margin doodles, and a **minimap** past ~20 cells. | The board feels authored; large factories stay navigable. |

**Deliverable:** a prototype that teaches itself, narrates dryly, sounds like a
notebook, and stays legible as it grows — ready for the human playtest.

---

## Cross-cutting

- **`physics.ts` is visual-only**, stepped from the ticker, decoupled from the
  engine — game logic always uses logical positions; springs only jiggle the
  rendered transform and restore it. Guard against destroyed containers.
- **No new color or primitive** beyond progress meters, dust, dashed-red clog,
  and the heavy/crosshatch big-block shading — pencil aesthetic holds.
- **The engine stays untouched** by this pass (it's view/feel). If a slice
  *needs* an engine read (e.g. recent burn-rate for P2.4), add a pure getter to
  `core/engine.ts` with a unit test — don't leak state into the view.
- **Respect reduced-motion / audio prefs** for juice and sound.
- **Validate by playing after every slice.** If it doesn't *feel* better, fix
  the feel before moving on.

## Suggested first concrete slice

**P1.1 (bezier pipes)** — self-contained, high visual payoff, no dependencies;
it instantly makes the canvas read as a notebook. Then **P1.2 (juice
substrate)**, which P2/P3 build on.
