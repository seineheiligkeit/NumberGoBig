# Numbers Go Big!

A parody incremental game in which the player constructs the natural numbers
— and eventually all of mathematics — from a humble river of zeros. Pan-and-zoom
canvas, hand-drawn pencil-notebook aesthetic, dry-academic narrator.

The title is the philosophy. There is no story. The numbers go big.

## What's playable today

Phases 1–3 are done. From a single river of `0`s the player can:

- Build numbers via **Successor**, **Addition**, **Subtraction**,
  **Multiplication**, **Division**, **Exponentiation**, **Square Root**.
- Break them down via **Decrement** and **Factor**.
- Automate flow with **typed warehouses**, **magnitude-rated pipes**, and
  **cultivation cells** (arithmetic, geometric, Fibonacci).
- Manage **computational cost** on `×`, `÷`, `^` (consume `1`s per firing).
- Lift only what they can **comprehend** — the manual-pickup ceiling raises
  via Literature upgrades.
- Sweep loose blocks with **cleanup bots**.
- Discover **five number families** as gameplay progresses: naturals,
  negatives, rationals (exact `{ num, den }`), irrationals (symbolic `√k`),
  complex (`a + bi`). Each unlocks through play, not a menu.

Score, blocks, and discoveries are **Decimal-backed** (via
[`break_eternity.js`](https://github.com/Patashu/break_eternity.js)), so
nothing overflows past `Number.MAX_SAFE_INTEGER`.

Save schema is at **v9** with backwards-compatible migrations all the way
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
  slice-by-slice, what's done, what's next.

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
│   ├── bots.ts                Cleanup-bot tick
│   ├── camera.ts              Pan + zoom
│   ├── persistence.ts         localStorage save/load, schema v9
│   ├── marginalia.ts          Narrator-note store
│   └── pixi/                  Per-element renderers (block, cells, pipes, river)
└── ui/                        Svelte components (ScoreHeader, Literature, Marginalia)
```

Simulation and rendering are kept separate. `world.ts` is pure TypeScript;
the renderer reads world state via the `onBlockChange` listener.

## What's next

**Phase 4** (Discovery and Engineering): the Number Gallery, filter cells,
special-number currencies, Blueprints. See
[ROADMAP.md](./ROADMAP.md#phase-4-discovery-and-engineering) for the
slice plan.

## License

All rights reserved. This is a solo project in active development; the
codebase is shared privately and not yet open-sourced.
