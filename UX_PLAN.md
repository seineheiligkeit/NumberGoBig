# UX_PLAN — UI/UX audit + improvement plan (*time-as-labor*)

*Written 2026-06-10, from a code-walk of `src/lib/view/` + `core/engine.ts` and a
headless screenshot audit of the live game at every preset stage (captures +
the reusable harness live in `tmp-uxaudit/` — `shots.mjs` full-screen stages,
`detail.mjs` close-up cell states). Companion to TIME_AS_LABOR_PLAN.md; this is
the playtest-readiness UX pass (HANDOVER §5).*

The audit confirms the four reported pains (clutter, missing feedback,
unreadable operators, no stat overview) and the missing group-move, and adds
~20 more findings. They cluster into five workstreams, ordered by stakes.

---

## Part I — Audit findings

### A. The game doesn't say what it wants (feedback gaps)

**A1. Fuel grade is completely invisible — the #1 finding.** Every op has a
minimum fuel denomination (`cell.op.grade`); under-grade fuel is *silently
refused* (`applyFuel` → lands loose), and overpay is *silently wasted*
(`grade^(1-p)·V^p`, so a frontier-sized block burns at roughly √ value). Neither
rule appears anywhere in the UI. This is also the known design risk: the
mid-rate e22 plateau breaks only when the player discovers deep fuel
(HANDOVER §0 watch-item), and right now *nothing in-game teaches it*. The
narrator + presets were supposed to carry this; they don't yet.

**A2. Drops fail silently.** `feedOperand` returns `false` on an occupied port
or unbuilt cell and `endDrag` just leaves the block at the drop point — no
bounce, no flash, no note. Fuel dropped on an idle cell bounces back to the
pool with zero cue. The player cannot distinguish "fed" from "refused".

**A3. Staged operands are invisible.** After feeding op0, the cell renders
nothing about what it holds (verified: a fed 1,234 leaves no trace —
`tmp-uxaudit/11`). The pulsing empty port is good, but you can't see *what's
staged*, so you can't predict the output or notice you fed the wrong value.

**A4. Port semantics are unlabeled — operators aren't self-explanatory.**
Exponentiation is `inputs[0] ^ inputs[1]`, but both operand ports are identical
circles. 10^40 vs 40^10 is a catastrophic difference with no UI distinction.
Same for tetration/pentation. The fuel square vs operand circle distinction
also vanishes below ~0.7 zoom.

**A5. No durations anywhere, in a game about time.** Working cells show only
the clock ring; long ops have no remaining-time estimate (the engine has
`progress`/`work` + the rate — it's computable). Building cells show only the
traced outline — no countdown, and the *toolbar never previews the build cost*,
even though `buildWork` grows with every cell you own (a core rule the player
can only learn by being surprised).

**A6. Early long-ops look dead.** The left-to-right reveal mask means a long
op's ghost numeral is invisible for its first stretch (`tmp-uxaudit/12`) —
a working exponentiation reads as an idle cell with a faint ring.

**A7. No drop-target affordance during drag.** While carrying a block, valid
ports don't light up; the dashed idle hints exist whether or not you're
dragging and don't know about grade or occupancy.

**A8. Transient information evaporates.** Narrator notes live 9s, max 4;
milestones flash once (`milestoneStore` is set but never rendered by any
component). There is no log to re-read anything.

### B. Clutter / readability

**B1. The river permanently owns ~⅓ of the screen.** It's screen-fixed
ambiance, but at factory scale it visually merges with the loose pool and the
marginalia (both live at the bottom) into one band of noise (`tmp-uxaudit/01,
03, 07`). It's also where spilled blocks drift toward, the worst possible
backdrop for them.

**B2. Heavy-block crosshatch destroys label contrast.** At ~1e22 the hatch +
small ladder label is nearly illegible (`tmp-uxaudit/15`). Reading your big
numbers IS the fantasy; the "frozen/dense" metaphor is right but the numeral
must always win.

**B3. DOM overlays float over the playfield with no reserved space.** The
engaged preset's frontier bank sits *underneath* the monitor panel
(`tmp-uxaudit/16`); `frameWorld` fits to the full viewport ignoring the
~220px occupied on each side. Marginalia overlaps the river/pool.

**B4. No level-of-detail at zoom-out.** Framed at the engaged preset
(~0.3×), every cell is an unreadable 30px box with a 9px glyph
(`tmp-uxaudit/06/07`). The states that matter at that altitude (working /
starving / stalled / unfueled) are encoded in alpha differences invisible at
that size.

**B5. In-cell visual stacking.** Meter ring + glyph + ghost numeral + port
hints all share a 100×76 box; on small cells (successor) they overlap into
scribble (`tmp-uxaudit/13, 17`).

**B6. Two giant unexplained numbers.** Σ (score) top-right and `frontier` in
the monitor often render near-identically (`1.00e+51` twice) with no hint of
the distinction. Formats are also inconsistent: header/monitor use raw
`toExponential` (`1.00e+51`) while blocks use the pretty ladder (`1.23×10⁸`).

### C. Labor / missing creature comforts

**C1. No multi-select / group move** (the named pain). `cellDrag` is
single-cell, blocks move one stack at a time. Rearranging a 25–110-cell
factory is one-at-a-time surgery; consolidating a scattered pool is dozens of
drags across the map.

**C2. Tools drop after one placement.** `placeCell` → `toolStore.set(null)`.
The opening play is "place 5–16 successors": that's 10–32 clicks of pure
friction. No Escape/right-click cancel either, and zero keyboard shortcuts.

**C3. No undo for destructive verbs.** Shift-click instantly erases a cell
(plus its pipes) that may represent minutes of build time. One slipped click
mid-rearrange is real loss.

**C4. Pipe ergonomics are minimal.** Two-click wiring only; no drag-to-wire;
no endpoint re-drag (reroute = delete + redraw — the main game already solved
this); no hover readout of what a pipe carries / its transit time.

**C5. Warehouse is deposit-only by hand.** You can dump a pile onto it, but
retrieval requires wiring a pipe. No click-to-withdraw. Also no "collect
nearby" verb anywhere — the de-clutter tool still requires manual shuttling
to it.

**C6. No camera QoL.** Fit-to-factory exists (`frameWorld`) but only fires on
preset load; no hotkey/button, no zoom-to-cursor indicator, no minimap
(deferred is fine — but fit-all is one binding away).

### D. No stat overview / info sources

**D1. No inspector.** Nothing on the canvas is clickable-for-information. A
cell can't tell you its operands, its op's work/progress/**grade**, or its
recent throughput; a block can't tell you its fuel value or what ops it could
one-shot.

**D2. The monitor is a dev gauge, not a player instrument.** cells/working +
pipes/loose are counts, not rates. No score/s, no production-vs-consumption
per grade, no bottleneck hint — even though the two starvation signatures
(idle-for-operands vs fuel-starved) are *the* strategic signal (learning #13)
and are cheap to count engine-side.

**D3. Toolbar text is cryptic.** "Literature" is a leftover label for what is
now a toolbar; `M Mill (split → fuel)`, `W Warehouse (store → fuel)`, `{ }
Successor` assume the design doc. No tooltips, no "what does this cost", no
legend for the canvas vocabulary (ports, dashes, rings, clog marks).

### E. Bugs caught during the audit

**E1. `reset()`/`loadPreset()` id-recycling renders stale visuals.**
`resetWorld` resets `world.nextId = 1`, and `loadPreset` does `reset(); build()`
synchronously in one frame — so `cellVisuals` (keyed by id) still holds the
old world's visuals when the new same-id cells arrive, and `syncCells` happily
reuses them: an exponentiation cell wearing a `×` glyph, a warehouse wearing a
successor's river-spout (caught on camera, `tmp-uxaudit/12, 14`). Fix: purge
visual caches in `reset()` (or key visuals by `id:kind`).

**E2. Onboarding copy is misleading.** "Pick Successor, then click the river"
— the river is screen-fixed ambiance; successors work anywhere. A literal
player places their first cell inside the noisiest zone of the screen.

### What already works (build on it, don't replace it)

Sketch-in builds, the clock ring, pulsing missing-operand ports, clog rings,
stack badges, fuel-line dashing vs solid operand pipes, heaviness hatching
(as a metaphor), the burn whoosh, the narrator voice, progressive tool
unlocks. The bones of the feedback language are good — the gaps are about
*coverage* (states with no cue) and *altitude* (nothing legible when zoomed
out).

---

> **Progress (2026-06-10, first UX session):** Orders 1–2 SHIPPED — ✅ U5.1
> (reset purges visual caches), ✅ U5.2 (onboarding copy), ✅ U1.1 (grade
> readout `≥ N` at the fuel socket + jamFlash refusal ring + narrator notes
> for idle/grade/band refusals), ✅ U1.2 (overpay waste-puff + note; occupied
> operand ports also flash), ✅ U1.3 (staged/held operand value labels under
> each port), ✅ U1.4 (italic `a`/`b` on exponentiation ports — pulled forward),
> ✅ U3.1 (marquee box-select + halos + group move, pipes follow, Esc/empty
> click clears), ✅ U3.2 (sticky tools, Esc/right-click cancel cascade, hotkeys
> 1–8/Space/−+/F with bindings on the shelf), ✅ U5.3 partial (e2e: sticky
> tool, box-select group move; refusal-bounce e2e deferred — engine refusal
> semantics already unit-tested). 10 e2e + 61 unit green. NEXT: Order 3
> (U2.1–.3 river/contrast/overlay), then U1.5–.7, U4.

## Part II — The plan

Five workstreams, in stakes order. House rules apply: pencil aesthetic,
color only for meaning, dry narrator, small slices, `npm run build` +
`npm run check` + `npm test` + `npm run test:e2e` green per slice, playtest
after each.

### U1 — The game says what it wants (feedback) — *highest stakes*

- **U1.1 Fuel-grade readout + refusal feedback.** A working cell pencils its
  grade next to the fuel socket (`≥ 256`, ladder-formatted, HINT typography).
  Under-grade drop: the block hops back off with a small shake + dust, fuel
  socket flashes JAM_TINT dashes once, narrator (one-time): *"Refused. This
  operation does not take small change — ≥ 256."* This is the deep-fuel
  teaching surface; treat it as gameplay, not chrome.
- **U1.2 Overpay warning.** When dropped fuel's value exceeds ~20× grade, show
  the burn but with a visibly oversized waste-puff + one-time narrator note
  (*"Most of that burned as smoke. Fuel near the asking grade goes furthest."*).
  No confirm dialogs — teach through consequence cues.
- **U1.3 Visible staged operands.** Render filled operand ports with a small
  value label (mini ladder label inside/beside the port circle); keep them
  visible as held inputs while the op runs.
- **U1.4 Port labels for non-commutative ops.** Italic `a`/`b` beside
  exponentiation/tetration/pentation operand ports (the old variadic-arrow
  cell pattern); successor/addition/multiplication stay bare.
- **U1.5 Drag-aware drop targets.** While a block is in hand: empty compatible
  operand ports brighten; fuel sockets brighten only if grade-accepting (else
  show faint JAM dash); warehouses brighten always. Everything else stays
  rest-state.
- **U1.6 Time is visible.** (a) Working cells: remaining-time estimate under
  the cell (`~3m` / `~2h`, current-rate honest, HINT size, only when >10s).
  (b) Building cells: same countdown. (c) Toolbar buttons: live build-time
  preview (`+ Addition · ~45s`) since cost grows with each cell owned.
- **U1.7 Early-op visibility.** Give the ghost numeral a faint full-width
  under-trace (alpha ~0.12) from t=0 so a long op never reads as dead; the
  reveal wipe stays as the progress signal.

### U2 — Declutter (screen hygiene at factory scale)

- **U2.1 Tame the river.** Slim to ~15% of screen height, lower density +
  contrast, and fade it toward near-invisible as the camera zooms out past
  ~0.6× (it's ambiance for the close-up game, noise at altitude). Keep one
  clean margin line separating it from the workspace.
- **U2.2 Numeral contrast guarantee.** Paper-colored underlay behind every
  block numeral (and cap hatch alpha) so the value always wins over the
  heaviness hatch. Audit at 1×, 0.5×, 0.3× zoom.
- **U2.3 Reserve overlay space.** Make the left shelf + right monitor
  collapsible cards; teach `frameWorld` the occupied margins so framed
  factories never hide under panels; move marginalia up clear of the river
  band.
- **U2.4 Zoom LOD.** Below ~0.5× swap cell rendering to a simplified chip:
  outline + state encoding only (working = solid + ring, starving = pulsing
  port dot, stalled = JAM dash, building = half-traced). Hide glyph detail,
  port markers, intake spouts. Block labels collapse to magnitude-only
  (`e22`). This is what makes the engaged-scale factory a readable *board*.
- **U2.5 Pool hygiene.** Spilled/refused blocks drift to a tidy shelf row
  near their producer (visual-only settle, logical position follows); same-
  value merge radius already handles stacking. Bound the visual sprawl, not
  the economy.

### U3 — Labor relief (the named comforts)

- **U3.1 Box-select + group move.** Drag on empty canvas (with no tool) draws
  a dashed pencil rectangle; selected cells+stacks get a faint halo; dragging
  any selected member moves the set (pipes follow); Esc/click-away clears.
  Also the foundation for blueprints later.
- **U3.2 Sticky tools, cancel, hotkeys.** Tool persists after placement;
  Esc/right-click drops it (and cancels a half-laid pipe). Keys: 1–8 tools,
  Space pause, [-/+] speed steps, F fit-to-factory. Show the binding in the
  toolbar rows.
- **U3.3 Warehouse hand-verbs.** Click a warehouse: withdraw largest (shift:
  whole largest stack). A small "collect" button on its card pulls loose
  blocks within a radius in over transit time (it's tedium removal, not an
  economy lever — hand-dragging is already free and instant).
- **U3.4 Pipe ergonomics.** Drag-to-wire (pointerdown on an output nub →
  release on a port) alongside two-click; endpoint re-drag to reroute (port
  the main game's `findPipeEndpointAt` pattern); hover a pipe → tooltip with
  carried value + transit time.
- **U3.5 One-step undo for delete.** Cache the last removed cell/pipe (incl.
  build state + connected pipes) and restore on Ctrl+Z / `⟲`. One level is
  enough to de-fang the misclick.

### U4 — Instruments (stat overview & info sources)

- **U4.1 Inspector card.** Click (no drag) a cell → bottom-right card: name +
  one-line role, state, operands, op work/progress/**grade**/fuel-paid,
  output rate (last 60s), connected pipes. Click a block → value, count,
  fuel value, and "one-shots ops up to work ≤ X" (the grade-fit hint — more
  deep-fuel teaching). Click-away closes.
- **U4.2 Rates in the monitor.** Replace raw counts with player-grade
  instruments: score/s and frontier trend (sparkline-ish pencil tick row),
  production vs consumption per grade bucket, and a bottleneck line driven by
  the two starvation signatures — *"7 cells idle for operands · 3 crawling
  unfuelled"*. Engine-side: cheap per-tick counters, unit-tested.
- **U4.3 The journal.** A notebook "back page" panel collecting all narrator
  notes + milestones with timestamps (the `milestoneStore` finally gets a
  consumer). Toolbar toggle; nothing evaporates anymore.
- **U4.4 Legend + tooltips.** Hover tooltips on toolbar entries (micro
  description + current build time); a small `?` card with the canvas
  vocabulary (ports, fuel square, dashes, ring, clog, hatching). Rename
  "Literature" → "Apparatus" (it's a toolbar now; Literature returns when the
  shop does).
- **U4.5 One number language.** Route the header Σ, monitor frontier, and all
  readouts through the value-label ladder formatting; caption the two big
  numbers (*Σ total · frontier: biggest single number*).

### U5 — Fixes (fold into whichever slice touches them first)

- **U5.1** Purge `cellVisuals`/`blockVisuals`/`pipeVisuals` in `reset()` (E1).
- **U5.2** Onboarding copy: "Pick **Successor**, place it anywhere — it taps
  the river of zeros into 1s." (E2)
- **U5.3** E2E coverage for the new verbs (box-select, sticky tool, refusal
  bounce) in `e2e/smoke.spec.ts`.

### Suggested order

| Order | Slices | Why first |
|---|---|---|
| 1 | U5.1–.2, U1.1–.3 | Bug + the fuel-teaching gap — playtest validity depends on it |
| 2 | U3.1, U3.2 | The two named tedium pains; cheap, huge feel win |
| 3 | U2.1, U2.2, U2.3 | Clutter floor: river, contrast, overlay space |
| 4 | U1.4–.7 | Operator self-explanation + time visibility |
| 5 | U4.1, U4.2 | Inspector + rates (stat overview) |
| 6 | U2.4, U2.5, U3.3–.5, U4.3–.5 | Altitude LOD + remaining comforts/instruments |

Defer (unchanged from HANDOVER): minimap, area-label naming UI.

### Out of scope / guardrails

- No new colors without meaning (JAM_TINT stays the only alarm color).
- No modal dialogs/confirms — feedback through consequence cues + narrator.
- The engine stays pure: rates/counters land in `core/` as tested signals
  (the `outputStalled`/`recentBurn` pattern); the view only reads.
- Don't gamify the monitor into HUD soup — instruments stay penciled,
  marginal, collapsible.
