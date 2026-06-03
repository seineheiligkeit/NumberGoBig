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
  feed(cellId: number, port: number, n: number): boolean;
  addLoose(n: number, x?: number, y?: number): number;
  score(): string;
  poolSize(): number;
  cellState(id: number): { built: boolean; build: number; op: number; kind: string } | null;
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

  // Let the operation complete (work to write "12" ≈ 8 ticks).
  await steps(page, 14);
  expect(await page.evaluate(() => Number(window.__nbg.score()))).toBe(12);
});
