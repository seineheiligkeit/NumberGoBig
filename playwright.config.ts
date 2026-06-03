import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { globSync } from 'node:fs';

/**
 * Playwright config for the Time-as-Labor prototype.
 *
 * The network policy blocks Playwright's browser CDN, so we drive the
 * Chromium that's pre-installed in the environment (rev may differ from the
 * @playwright/test version — launching via executablePath bypasses the
 * version pin, and basic CDP automation works fine). Software WebGL is
 * forced on (SwiftShader) so PixiJS renders headlessly.
 *
 * Override the binary with PW_CHROMIUM=/path/to/chrome if it moves.
 */

function findChromium(): string {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  const matches = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome');
  if (matches.length > 0) return matches.sort().reverse()[0];
  return ''; // fall back to Playwright's own resolution (will error if absent)
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    launchOptions: {
      executablePath: findChromium() || undefined,
      args: [
        '--no-sandbox',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
