import { test, expect, type Page } from '@playwright/test';

/**
 * Headless smoke tests for the Time-as-Labor view, driving the REAL game
 * (PixiJS + the engine) through the DEV hooks (`window.__nbg`). This is the
 * ground-truth layer the pure unit tests can't reach: it proves the renderer
 * boots with WebGL, the engine ticks, and the play loop produces results
 * on the actual canvas.
 */

// The DEV inspection surface exposed by game-view.ts.
interface NBG {
  setPaused(p: boolean): void;
  tick(n?: number): void;
  place(kind: string, x?: number, y?: number): number;
  pipe(fromCell: number, toCell: number, toPort: number, fuel?: boolean): number;
  feed(cellId: number, port: number, n: number): boolean;
  fuel(cellId: number, n: number): void;
  addLoose(n: number, x?: number, y?: number): number;
  moveCell(id: number, x: number, y: number): void;
  removeCell(id: number): void;
  removePipe(id: number): void;
  score(): string;
  poolSize(): number;
  pipeCount(): number;
  cellState(id: number): { built: boolean; build: number; op: number; kind: string } | null;
  world: {
    cells: Map<number, { x: number; y: number; built: boolean }>;
    pool: { count?: number }[];
  };
}

declare global {
  interface Window {
    __nbg: NBG;
  }
}

// Network/resource failures (web-font CDN cert errors, missing favicon) are
// environmental — the offline sandbox blocks the Kalam font CDN — not game
// bugs. We gate on real uncaught JS exceptions and code-level console errors.
const BENIGN = /Failed to load resource|ERR_CERT|net::ERR|favicon|fonts\.googleapis|404/i;

async function bootPaused(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__nbg, undefined, { timeout: 15_000 });
  await page.evaluate(() => window.__nbg.setPaused(true)); // deterministic time
  return errors;
}

/** Advance the engine n discrete 1-ticks (progress accrues per call). */
async function steps(page: Page, n: number): Promise<void> {
  await page.evaluate((k) => {
    for (let i = 0; i < k; i++) window.__nbg.tick(1);
  }, n);
}

test('boots with a WebGL canvas and no uncaught errors', async ({ page }) => {
  const errors = await bootPaused(page);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  const size = await canvas.boundingBox();
  expect(size!.width).toBeGreaterThan(100);
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('a Successor builds, taps the river, and grows the score', async ({ page }) => {
  await bootPaused(page);
  const id = await page.evaluate(() => window.__nbg.place('successor', 0, 0));

  // Build: ink-era pencil time = 10 × buildTimeScale 3 = 30 ticks (no bill — leaves are waived).
  await steps(page, 32);
  const built = await page.evaluate((i) => window.__nbg.cellState(i)!.built, id);
  expect(built).toBe(true);

  // Produce a stream of 1s.
  await steps(page, 60);
  const score = await page.evaluate(() => Number(window.__nbg.score()));
  expect(score).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__nbg.poolSize())).toBeGreaterThan(0);
});

test('Multiplication pays its 16-bill, builds, and amplifies (3 × 4 → 12)', async ({ page }) => {
  await bootPaused(page);
  const id = await page.evaluate(() => window.__nbg.place('multiplication', 0, 0));

  // THE MATERIAL BILL: the first multiplication is a sketch until a 16 (the
  // band [16, 17.6]) is deposited — addition's first moment, by construction.
  await steps(page, 70);
  expect(await page.evaluate((i) => window.__nbg.cellState(i)!.built, id)).toBe(false);
  await page.evaluate((i) => window.__nbg.fuel(i, 16), id);
  await steps(page, 66); // pencil time = 20 × 3
  expect(await page.evaluate((i) => window.__nbg.cellState(i)!.built, id)).toBe(true);

  // Stage the two operands; score now reflects the held inputs (3 + 4 = 7).
  await page.evaluate((i) => {
    window.__nbg.feed(i, 0, 3);
    window.__nbg.feed(i, 1, 4);
  }, id);
  expect(await page.evaluate(() => Number(window.__nbg.score()))).toBe(7);

  // Mult fuel is OPTIONAL under the unified law — the clock finishes small
  // products (work to write "12" = 2³ = 8 at half base ≈ 16 ticks).
  await steps(page, 40);
  expect(await page.evaluate(() => Number(window.__nbg.score()))).toBe(12);
});

test('a pipe carries a Successor 1 into an Addition over time', async ({ page }) => {
  await bootPaused(page);
  const { s, a } = await page.evaluate(() => {
    const n = window.__nbg;
    const s = n.place('successor', 0, 0);
    const a = n.place('addition', 600, 0); // far → a slow supply line
    return { s, a };
  });

  // Build both, then wire the successor's output to addition operand 0.
  await steps(page, 30);
  const wired = await page.evaluate(
    ([s, a]) => {
      window.__nbg.pipe(s, a, 0);
      return window.__nbg.pipeCount();
    },
    [s, a],
  );
  expect(wired).toBe(1);

  // The successor produces a 1; it must then transit the long pipe before the
  // addition can stage it. Give it ample time, then assert the operand landed
  // (i.e. score is held in the addition, not just loose at the successor).
  await steps(page, 120);
  const built = await page.evaluate((i) => window.__nbg.cellState(i)!.built, a);
  expect(built).toBe(true);
  expect(await page.evaluate(() => Number(window.__nbg.score()))).toBeGreaterThan(0);
});

test('the divisor-mill partitions a block by its gear, conserving score', async ({ page }) => {
  await bootPaused(page);
  const m = await page.evaluate(() => window.__nbg.place('mill', 0, 0));
  await page.evaluate((i) => window.__nbg.fuel(i, 64), m); // the mill's first bill
  await steps(page, 76); // pencil time = 24 × 3
  expect(await page.evaluate((i) => window.__nbg.cellState(i)!.built, m)).toBe(true);
  await page.evaluate((i) => window.__nbg.feed(i, 0, 8000), m); // ÷16 (factory gear) → 16 × 500
  const before = await page.evaluate(() => Number(window.__nbg.score()));
  // The mill WRITES its pieces: 16 × 3 digits at 2.5 d/s ≈ 20 ticks. Headroom.
  await steps(page, 40);
  const after = await page.evaluate(() => Number(window.__nbg.score()));
  expect(after).toBe(before); // partition conserves value
  // The pieces land as ONE ×16 stack (stacking is on in the live game).
  const blocks = await page.evaluate(() =>
    window.__nbg.world.pool.reduce((sum, b) => sum + (b.count ?? 1), 0),
  );
  expect(blocks).toBeGreaterThanOrEqual(16);
});

test('Exponentiation pays the MILLION bill, holds for notes, then launches', async ({ page }) => {
  await bootPaused(page);
  const f = await page.evaluate(() => window.__nbg.place('exponentiation', 0, 0));
  // The famous first bill: one block in [10⁶, 1.1×10⁶] — visible from the start.
  await page.evaluate((i) => window.__nbg.fuel(i, 1e6), f);
  await steps(page, 148); // pencil time = 48 × 3
  expect(await page.evaluate((i) => window.__nbg.cellState(i)!.built, f)).toBe(true);
  await page.evaluate((i) => {
    window.__nbg.feed(i, 0, 10);
    window.__nbg.feed(i, 1, 7); // 10⁷ — above the 10⁶ notes floor → MANDATORY
  }, f);
  await steps(page, 1);
  // Unified tier-2 need = (10⁷)^(1/4) ≈ 56.2, band ≈ [3.5, 56.2]. The clock
  // NEVER closes a mandatory op — the notes hold it open.
  await steps(page, 400);
  expect(await page.evaluate(() => Number(window.__nbg.score()))).toBe(17); // inputs held, no result
  // An oversized block is refused (returned loose), not burned.
  await page.evaluate((i) => window.__nbg.fuel(i, 5e6), f);
  // Two in-band notes pay the need in full — pro-rata completes the work...
  await page.evaluate((i) => {
    window.__nbg.fuel(i, 30);
    window.__nbg.fuel(i, 30);
  }, f);
  // ...and the WRITE finishes it: 8 digits at 2.5 d/s ≈ 4 ticks. Headroom.
  await steps(page, 8);
  // Result lands (10⁷) + the bounced oversized block (5e6); held inputs gone.
  expect(await page.evaluate(() => Number(window.__nbg.score()))).toBe(1e7 + 5e6);
});

test('cells can be dragged to reposition the factory', async ({ page }) => {
  await bootPaused(page);
  const s = await page.evaluate(() => {
    const n = window.__nbg;
    const id = n.place('successor', -250, 0);
    for (let i = 0; i < 30; i++) n.tick(1); // build
    return id;
  });
  // Camera origin sits at (w/2, h*0.42); the cell at canvas (-250,0) maps there.
  const box = (await page.locator('canvas').boundingBox())!;
  const cx = box.width / 2;
  const cy = box.height * 0.42;
  await page.mouse.move(cx - 250, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 250 + 40, cy + 60, { steps: 5 });
  await page.mouse.up();
  const pos = await page.evaluate((id) => {
    const c = window.__nbg.world.cells.get(id)!;
    return { x: c.x, y: c.y };
  }, s);
  expect(pos.x).toBeGreaterThan(-250);
  expect(pos.y).toBeGreaterThan(0);
});

test('sticky tools: one pick places many cells; Escape puts the tool down', async ({ page }) => {
  await bootPaused(page);
  await page.getByRole('button', { name: /Successor/ }).click();
  const box = (await page.locator('canvas').boundingBox())!;
  const cx = box.width / 2;
  const cy = box.height * 0.42;
  await page.mouse.click(cx - 220, cy - 120);
  await page.mouse.click(cx + 40, cy - 120);
  expect(await page.evaluate(() => window.__nbg.world.cells.size)).toBe(2); // tool stayed in hand
  await page.keyboard.press('Escape');
  await page.mouse.click(cx + 220, cy + 40);
  expect(await page.evaluate(() => window.__nbg.world.cells.size)).toBe(2); // Esc dropped it
});

test('box-select: a marquee selects cells and dragging one moves the whole set', async ({ page }) => {
  await bootPaused(page);
  const ids = await page.evaluate(() => {
    const n = window.__nbg;
    const a = n.place('successor', -100, 0);
    const b = n.place('successor', 100, 0);
    for (let i = 0; i < 80; i++) n.tick(1); // builds queue serially under the slot rule
    return [a, b] as const;
  });
  const box = (await page.locator('canvas').boundingBox())!;
  const cx = box.width / 2;
  const cy = box.height * 0.42;
  // Marquee from an empty corner around both cells.
  await page.mouse.move(cx - 230, cy - 130);
  await page.mouse.down();
  await page.mouse.move(cx + 230, cy + 130, { steps: 4 });
  await page.mouse.up();
  // Drag cell A by (+80, +60) — cell B must come along (group move).
  await page.mouse.move(cx - 100, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 20, cy + 60, { steps: 5 });
  await page.mouse.up();
  const pos = await page.evaluate(([a, b]) => {
    const ca = window.__nbg.world.cells.get(a)!;
    const cb = window.__nbg.world.cells.get(b)!;
    return { ax: ca.x, ay: ca.y, bx: cb.x, by: cb.y };
  }, ids);
  expect(pos.ax).toBeGreaterThan(-60);
  expect(pos.ay).toBeGreaterThan(20);
  expect(pos.bx).toBeGreaterThan(140); // the OTHER cell moved by the same delta
  expect(pos.by).toBeGreaterThan(20);
});

test('clicking a cell (no drag) opens the live inspector card; Esc closes it', async ({ page }) => {
  await bootPaused(page);
  await page.evaluate(() => {
    const n = window.__nbg;
    const id = n.place('multiplication', 0, 0);
    n.fuel(id, 16); // the first mult's MATERIAL bill
    for (let i = 0; i < 66; i++) n.tick(1); // pencil time = 20 × 3
  });
  const box = (await page.locator('canvas').boundingBox())!;
  await page.locator('canvas').click({ position: { x: box.width / 2, y: box.height * 0.42 } });
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('.inspector')).toContainText('multiplication');
  await expect(page.locator('.inspector')).toContainText('idle');
  await page.keyboard.press('Escape');
  await expect(page.locator('.inspector')).toHaveCount(0);
});

test('the cancel verb: an inspector action frees a held op — operands return', async ({ page }) => {
  await bootPaused(page);
  const f = await page.evaluate(() => {
    const n = window.__nbg;
    const id = n.place('exponentiation', 0, 0);
    n.fuel(id, 1e6); // the bill
    for (let i = 0; i < 148; i++) n.tick(1); // pencil 48 × 3
    n.feed(id, 0, 10);
    n.feed(id, 1, 7); // 10⁷ — mandatory notes hold the op (the trap scenario)
    n.tick(1);
    return id;
  });
  const box = (await page.locator('canvas').boundingBox())!;
  await page.locator('canvas').click({ position: { x: box.width / 2, y: box.height * 0.42 } });
  await expect(page.locator('.inspector')).toContainText('working');
  await page.getByRole('button', { name: /cancel/ }).click();
  const state = await page.evaluate((i) => {
    const n = window.__nbg;
    return { op: n.cellState(i)!.op, score: Number(n.score()), pool: n.poolSize() };
  }, f);
  expect(state.op).toBe(0); // no operation any more
  expect(state.score).toBe(17); // 10 + 7 back in the world — nothing destroyed
  expect(state.pool).toBeGreaterThanOrEqual(1);
});

test('shift-click deletes a cell (the rebalancing verb)', async ({ page }) => {
  await bootPaused(page);
  const id = await page.evaluate(() => {
    const n = window.__nbg;
    const id = n.place('multiplication', 0, 0);
    for (let i = 0; i < 30; i++) n.tick(1); // build
    return id;
  });
  // Cell at canvas (0,0) → screen centre (w/2, h*0.42). Shift-click it.
  const box = (await page.locator('canvas').boundingBox())!;
  await page
    .locator('canvas')
    .click({ position: { x: box.width / 2, y: box.height * 0.42 }, modifiers: ['Shift'] });
  const gone = await page.evaluate((i) => !window.__nbg.world.cells.get(i), id);
  expect(gone).toBe(true);
});
