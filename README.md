# Numbers Go Big!

A parody incremental game in which the player constructs the natural numbers
— and eventually all of mathematics — from a humble river of zeros. Pan-and-zoom
canvas, hand-drawn pencil-notebook aesthetic, dry-academic narrator.

The title is the philosophy. There is no story. The numbers go big.

## What's playable today

Phases 1–6 are done, plus the **V2 "Adversary"** and **V3 "The Clash"**
combat layers (prototype). From a single river of `0`s the player can:

- Build numbers via **Successor**, **Addition**, **Subtraction**,
  **Multiplication**, **Division**, **Exponentiation**, **Tetration**,
  **Pentation**, **Square Root**.
- Break them down via **Decrement** and **Factor**.
- Automate flow with **warehouses** (typed + rule-based), **magnitude-rated
  pipes**, **filters**, **blueprints**, **cultivation cells**, and
  **decomposer / cleanup bots**.
- Pay **computational cost** via the **α.5c ladder** — each firing pulls a
  pyramid of small numbers from the pool (zeros are the universal substrate).
- Progress along the **Comprehension spine** — a power-of-2 ceiling
  (`≤ 2^N`) that gates what you can lift, produce, and defend against.
- Discover **five number families**: naturals, negatives, rationals
  (`{ num, den }`), irrationals (`√k`), complex (`a + bi`).
- **Defend (V2/V3):** once **Subtraction** is unlocked, an advancing front
  of negative **antinumbers** attacks a defendable **Core**. Your produced
  positives form a **Shield** (the army) that clashes with them 1:1 by
  magnitude; **batteries** (Add / Divide / Negate) are throughput-capped
  **artillery** for threats the Shield can't absorb; the **Rampart** feeds
  the Shield automatically. Prime / power-of-two / perfect / famous-number
  **bosses** each force a different answer. Balance is validated by three
  standalone models in `sim/`.

Score, blocks, and discoveries are **Decimal-backed** (via
[`break_eternity.js`](https://github.com/Patashu/break_eternity.js)), so
nothing overflows past `Number.MAX_SAFE_INTEGER`.

Save schema is at **v18** with backwards-compatible migrations all the way
back to v1.

## Tech stack

- **Vite + TypeScript + Svelte 5** for the build / UI shell
- **PixiJS 8** for the canvas (river, blocks, equation cells, pipes)
- **`break_eternity.js`** for arbitrary-magnitude numbers

## Run locally

```bash
npm install
npm run dev      # opens on http://localhost:5173
npm run check    # svelte-check, zero/zero expected
npm run build    # production bundle to dist/
```

The dev server hot-reloads on any change. Persistent state lives in
`localStorage` under the key `numbers-go-big.save` — clear that to start
fresh.

## Authoritative documents

These are the project's north stars. Read them before significant changes.

- **[CLAUDE.md](./CLAUDE.md)** — engineering context: tech stack,
  architecture, conventions, build commands, recipes for adding cells.
- **[DESIGN.md](./DESIGN.md)** — creative basis: vision, design pillars,
  core systems, aesthetic, narrator tone. The thing not to drift from.
- **[ROADMAP.md](./ROADMAP.md)** — execution plan: phase-by-phase,
  slice-by-slice, what's done, what's next (incl. V2 "The Adversary" and
  V3 "The Clash").
- **[V3_PLAN.md](./V3_PLAN.md)** — the army/Shield combat plan + status.
- **[sim/README.md](./sim/README.md)** — the standalone balance models
  (`run`, `analyze`, `adversary`, `weapons`, `throughput`).

## Architecture at a glance

```
src/
├── App.svelte                 Mount + UI overlays
├── lib/
│   ├── value.ts               The discriminated Value union (real / rational /
│   │                          irrational / complex) — every block's number
│   ├── family.ts              Value → family classification + colour
│   ├── colors.ts              Canonical canvas-side palette
│   ├── world.ts               Pure data model — blocks, cells, pipes, stores
│   ├── cell-types.ts          CellType registry, port geometry, operate()
│   ├── literature.ts          Shop catalog + purchase logic
│   ├── interaction.ts         Drag controller (singleton)
│   ├── cultivation.ts         Cultivation-cell tick
│   ├── pipe.ts                Pipe simulation tick
│   ├── bots.ts                Cleanup / decomposer-bot tick
│   ├── adversary.ts           V2/V3 combat — antinumbers, Core, Shield, batteries
│   ├── camera.ts              Pan + zoom
│   ├── persistence.ts         localStorage save/load, schema v18
│   ├── marginalia.ts          Narrator-note store
│   └── pixi/                  Per-element renderers (block, cells, pipes, river,
│                              antinumber/Core, battery)
├── ui/                        Svelte components (ScoreHeader, Literature, Marginalia)
└── sim/                       Standalone balance models (pacing + combat)
```

Simulation and rendering are kept separate. `world.ts` is pure TypeScript;
the renderer reads world state via the `onBlockChange` listener.

## What's next

**V3.4 — combat balance tuning:** wave/threat curves, feed cadence, and the
Shield target, validated against `sim/throughput.ts` (softening the early
setbacks observed in the playthrough). The prestige tie-in and the
designed-but-unbuilt weapons (Subtract / Multiply / Inversion defenders)
remain deferred. See [ROADMAP.md](./ROADMAP.md) ("V3 — The Clash") and
[V3_PLAN.md](./V3_PLAN.md).

## License

All rights reserved. This is a solo project in active development; the
codebase is shared privately and not yet open-sourced.
