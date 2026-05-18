// sim/compare.ts
//
// Multi-strategy comparison runner. Runs every named strategy (or
// every registered strategy) against the same roadmap + config and
// prints a side-by-side pacing table.
//
// Usage:
//   node sim/compare.ts                                # all strategies, default config
//   node sim/compare.ts --strategies speedrun-greedy,beam-search
//   node sim/compare.ts --config sim/configs/no-leveling.json
//   node sim/compare.ts --csv-dir /tmp/compare-runs    # one CSV per strategy
//   node sim/compare.ts --to tetration --max-ticks 30000

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { simulate, type SimulationResult } from './simulator.ts';
import { LITERATURE_BY_ID } from './catalog.ts';
import { STRATEGIES, createStrategy } from './strategy.ts';
import './strategies/speedrun-greedy.ts';
import './strategies/comp-rush.ts';
import './strategies/warehouse-hoarder.ts';
import './strategies/cell-spammer.ts';
import './strategies/beam-search.ts';
import {
  applyScaleOverride,
  defaultConfig,
  loadConfigFile,
  withConfig,
} from './config.ts';

// Shared roadmap (kept in sync with sim/run.ts:DEFAULT_ROADMAP).
const DEFAULT_ROADMAP: string[] = [
  'successor', 'pipe_0', 'addition', 'comp_2', 'subtraction', 'comp_3',
  'multiplication', 'comp_4', 'pipe_2', 'division', 'negation', 'comp_5',
  'pipe_3', 'comp_6', 'pipe_4', 'comp_7', 'exponentiation', 'pipe_5',
  'inversion', 'square-root', 'comp_8', 'pipe_6', 'comp_9', 'pipe_7',
  'comp_10', 'pipe_8', 'tetration', 'comp_11', 'pipe_9', 'comp_14',
  'comp_17', 'comp_20', 'pentation',
];

interface CliArgs {
  strategies: string[];
  configPath: string | null;
  scaleOverrides: string[];
  to: string | null;
  maxTicks: number;
  csvDir: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const r: CliArgs = {
    strategies: [],
    configPath: null,
    scaleOverrides: [],
    to: null,
    maxTicks: 200_000,
    csvDir: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--strategies') r.strategies = (args[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--config') r.configPath = args[++i] ?? null;
    else if (a === '--scale') {
      const v = args[++i];
      if (v) r.scaleOverrides.push(v);
    } else if (a === '--to') r.to = args[++i] ?? null;
    else if (a === '--max-ticks') r.maxTicks = Number(args[++i] ?? r.maxTicks);
    else if (a === '--csv-dir') r.csvDir = args[++i] ?? null;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return r;
}

function printHelp(): void {
  console.log(`Numbers Go Big — multi-strategy comparison

Usage:
  node sim/compare.ts [options]

Options:
  --strategies <names>   Comma-separated list (default: every registered)
  --config <path>        Load a SimConfig JSON
  --scale key=value      Override one config field (repeatable)
  --to <entryId>         Stop each strategy at this entry
  --max-ticks <n>        Max ticks per run (default: 200000)
  --csv-dir <dir>        Write one CSV per strategy
`);
}

function formatTicks(n: number): string {
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m`;
}

function writeCsv(result: SimulationResult, roadmap: string[], path: string): void {
  const lines: string[] = ['tick,unlock'];
  // Use chronological order to faithfully capture beam-search reorderings.
  const sorted = [...result.unlocks.entries()].sort((a, b) => a[1] - b[1]);
  for (const [id, tick] of sorted) {
    lines.push(`${tick},${id}`);
  }
  for (const id of roadmap) {
    if (!result.unlocks.has(id)) lines.push(`,${id} (not reached)`);
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

function main(): void {
  const args = parseArgs();
  const strategyNames =
    args.strategies.length > 0 ? args.strategies : Object.keys(STRATEGIES);

  for (const name of strategyNames) {
    if (!STRATEGIES[name]) {
      console.error(`Unknown strategy: ${name}`);
      console.error(`Known: ${Object.keys(STRATEGIES).join(', ')}`);
      process.exit(1);
    }
  }

  let roadmap = DEFAULT_ROADMAP;
  if (args.to) {
    const idx = roadmap.indexOf(args.to);
    if (idx === -1) {
      console.error(`Unknown roadmap entry: ${args.to}`);
      process.exit(1);
    }
    roadmap = roadmap.slice(0, idx + 1);
  }

  let cfg = args.configPath ? loadConfigFile(args.configPath) : defaultConfig();
  for (const kv of args.scaleOverrides) cfg = applyScaleOverride(cfg, kv);

  console.log(`Running ${strategyNames.length} strategies against ${roadmap.length} unlocks…`);
  if (args.configPath) console.log(`  Config: ${args.configPath}`);
  if (args.scaleOverrides.length > 0) {
    console.log(`  Overrides: ${args.scaleOverrides.join(', ')}`);
  }

  const results = new Map<string, SimulationResult>();
  for (const name of strategyNames) {
    const strategy = createStrategy(name, { roadmap });
    process.stderr.write(`  ${name}…\n`);
    const t0 = Date.now();
    const result = withConfig(cfg, () => simulate(strategy, { maxTicks: args.maxTicks }));
    const elapsedMs = Date.now() - t0;
    process.stderr.write(`    done in ${elapsedMs}ms — finalTick=${result.finalTick}\n`);
    results.set(name, result);
  }

  printComparisonTable(results, strategyNames, roadmap);

  if (args.csvDir) {
    if (!existsSync(args.csvDir)) mkdirSync(args.csvDir, { recursive: true });
    for (const name of strategyNames) {
      const path = `${args.csvDir}/${name}.csv`;
      const result = results.get(name);
      if (result) writeCsv(result, roadmap, path);
    }
    console.log(`\n✓ CSVs written to ${args.csvDir}/`);
  }
}

function printComparisonTable(
  results: Map<string, SimulationResult>,
  strategyNames: string[],
  roadmap: string[],
): void {
  console.log('\n=== Strategy comparison (time to unlock) ===\n');

  const colWidth = 12;
  const labelWidth = 22;

  const header =
    'unlock'.padEnd(labelWidth) +
    strategyNames.map((n) => n.slice(0, colWidth).padStart(colWidth)).join(' ');
  console.log(header);
  console.log('-'.repeat(header.length));

  // Show milestone entries (skip pipe/comp infrastructure for table
  // readability — they're auto-bought as needed by every strategy).
  const interesting = roadmap.filter((id) => {
    const entry = LITERATURE_BY_ID.get(id);
    return entry && (entry.kind === 'cell' || entry.kind === 'comprehension');
  });

  const fastestPerRow = new Map<string, number>();
  for (const id of interesting) {
    let fastest = Infinity;
    for (const name of strategyNames) {
      const t = results.get(name)?.unlocks.get(id);
      if (t !== undefined && t < fastest) fastest = t;
    }
    fastestPerRow.set(id, fastest);
  }

  for (const id of interesting) {
    const fastest = fastestPerRow.get(id) ?? Infinity;
    let row = id.slice(0, labelWidth - 1).padEnd(labelWidth);
    for (const name of strategyNames) {
      const t = results.get(name)?.unlocks.get(id);
      if (t === undefined) {
        row += '—'.padStart(colWidth);
      } else {
        const marker = t === fastest ? '*' : ' ';
        row += (marker + formatTicks(t)).padStart(colWidth);
      }
    }
    console.log(row);
  }
  console.log(`\n  * = fastest for that unlock`);

  // Aggregate: total ticks to last unlock per strategy.
  console.log('\n=== Final tick ===\n');
  for (const name of strategyNames) {
    const r = results.get(name);
    if (!r) continue;
    const stalled = r.stalled ? ' (STALLED)' : '';
    console.log(`  ${name.padEnd(labelWidth)} ${formatTicks(r.finalTick)}${stalled}`);
  }
}

main();
