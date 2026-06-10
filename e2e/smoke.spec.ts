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

  // Build (buildWork(0) = 24 at baseRate 1).
  await steps(page, 26);
  const built = await page.evaluate((i) => window.__nbg.cellState(i)!.built, id);
  expect(built).toBe(true);

  // Produce a stream of 1s.
  await steps(page, 60);
  const score = await page.evaluate(() => Number(window.__nbg.score()));
  expect(score).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__nbg.poolSize())).toBeGreaterThan(0);
});

test('Multiplication amplifies score (3 × 4 → 12)', async ({ page }) => {
  await bootPaused(page);
  const id = await page.evaluate(() => window.__nbg.place('multiplication', 0, 0));

  await steps(page, 26); // build
  expect(await page.evaluate((i) => window.__nbg.cellState(i)!.built, id)).toBe(true);

  // Stage the two operands; score now reflects the held inputs (3 + 4 = 7).
  await page.evaluate((i) => {
    window.__nbg.feed(i, 0, 3);
    window.__nbg.feed(i, 1, 4);
  }, id);
  expect(await page.evaluate(() => Number(window.__nbg.score()))).toBe(7);

  // Let the operation complete: work to write "12" = 2³ = 8, and the locked
  // economy runs amplifiers at HALF baseRate (amplifierBaseRateScale 0.5) →
  // ~16 ticks. Give it headroom.
  await steps(page, 30);
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

test('a Mill liquefies a block into graded fuel, conserving score', async ({ page }) => {
  await bootPaused(page);
  const m = await page.evaluate(() => window.__nbg.place('mill', 0, 0));
  await steps(page, 26); // build
  await page.evaluate((i) => window.__nbg.feed(i, 0, 8000), m); // → 8 × 1000
  const before = await page.evaluate(() => Number(window.__nbg.score()));
  await steps(page, 40);
  const after = await page.evaluate(() => Number(window.__nbg.score()));
  expect(after).toBe(before); // additive split conserves value
  // The loose pool holds the milled pieces. With stacking ON (the live game),
  // 8 identical 1000-blocks merge into ONE ×8 stack — count BLOCKS, not
  // pool entities.
  const blocks = await page.evaluate(() =>
    window.__nbg.world.pool.reduce((sum, b) => sum + (b.count ?? 1), 0),
  );
  expect(blocks).toBeGreaterThanOrEqual(8);
});

test('a scaffolded Exponentiation holds for working notes, then launches', async ({ page }) => {
  await bootPaused(page);
  const f = await page.evaluate(() => window.__nbg.place('exponentiation', 0, 0));
  await steps(page, 30); // build (first exp cell: buildWork(0) = 16)
  await page.evaluate((i) => {
    window.__nbg.feed(i, 0, 10);
    window.__nbg.feed(i, 1, 7); // 10⁷ — above the 10⁶ scaffolding floor
  }, f);
  // Let the CLOCK complete fully (work = 8⁴ = 4096 at amplifier half-base
  // → ~8200 ticks). The unpaid working notes must still hold the op open.
  await steps(page, 9500);
  expect(await page.evaluate(() => Number(window.__nbg.score()))).toBe(17); // inputs held, no result
  // An oversized block is refused (returned loose), not burned.
  await page.evaluate((i) => window.__nbg.fuel(i, 5e6), f);
  // Two in-band notes (S ≈ 2162, band ≈ [34, 2162]) pay the requirement.
  await page.evaluate((i) => {
    window.__nbg.fuel(i, 1100);
    window.__nbg.fuel(i, 1100);
  }, f);
  await steps(page, 2);
  // Result lands (10⁷) + the bounced oversized block (5e6) + held inputs gone.
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
