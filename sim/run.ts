// sim/run.ts
//
// CLI entry point for the pacing simulator (Phase 6 model — Comprehension
// as Spine; see DESIGN.md §9, ROADMAP §2 Phase 6).
//
// Usage:
//   node sim/run.ts                     # default roadmap, console summary
//   node sim/run.ts --csv pacing.csv    # also write per-unlock CSV
//   node sim/run.ts --verbose           # print every purchase event
//   node sim/run.ts --to tetration      # stop at a specific roadmap entry

import { writeFileSync } from 'node:fs';
import { simulate, type SimulationResult } from './simulator.ts';
import { LITERATURE_BY_ID } from './catalog.ts';
import {
  STRATEGIES,
  createStrategy,
} from './strategy.ts';
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
  type SimConfig,
} from './config.ts';

// ---------------------------------------------------------------------------
// Default roadmap (Phase 6 ordering)
// ---------------------------------------------------------------------------
//
// The roadmap is a list of unlocks the agent pursues *and* the table
// of pacing milestones the report displays. The agent will also
// auto-buy comp upgrades on demand when comp gates a production path
// (via the comp-bottleneck branch in decide()), so this list doesn't
// need to be exhaustive — but listing the comp tiers explicitly
// surfaces them in the unlock table.
//
// Comp tier reference:
//   comp_1 → ≤2     comp_5 → ≤32      comp_9  → ≤512    comp_13 → ≤8192
//   comp_2 → ≤4     comp_6 → ≤64      comp_10 → ≤1024   comp_14 → ≤16384
//   comp_3 → ≤8     comp_7 → ≤128     comp_11 → ≤2048   comp_17 → ≤131072
//   comp_4 → ≤16    comp_8 → ≤256     comp_12 → ≤4096   comp_20 → ≤1M
//
// Pipe tier reference:
//   pipe_N → magnitude 2^N (requires Comp ≥ 2^(N+1))
//   pipe_0 → ≤1     pipe_4 → ≤16     pipe_8  → ≤256
//   pipe_1 → ≤2     pipe_5 → ≤32     pipe_9  → ≤512
//   pipe_2 → ≤4     pipe_6 → ≤64     pipe_10 → ≤1024
//   pipe_3 → ≤8     pipe_7 → ≤128

const DEFAULT_ROADMAP: string[] = [
  // -- Stage A: opening, Comp ≤ 2 baseline ----------------------------------
  'successor',
  'pipe_0', // Pipe ≤1 — only pipe available at Comp ≤2 baseline
  'addition',
  'comp_2', // ≤4 — first paid Literature entry teaches the mechanic

  // -- Stage B: combinators -------------------------------------------------
  'subtraction',
  'comp_3', // ≤8
  'multiplication',
  'comp_4', // ≤16 — unlocks pipe_2
  'pipe_2', // ≤4
  'division',
  'negation',
  'comp_5', // ≤32 — unlocks pipe_3
  'pipe_3', // ≤8

  // -- Stage C: exponentiation + comp climb to hundreds --------------------
  'comp_6', // ≤64 — unlocks pipe_4
  'pipe_4', // ≤16
  'comp_7', // ≤128 — unlocks pipe_5; enables exp production (needs comp ≥ 100)
  'exponentiation',
  'pipe_5', // ≤32
  'inversion',
  'square-root',

  // -- Stage D: comp climb through thousands -------------------------------
  'comp_8', // ≤256
  'pipe_6', // ≤64
  'comp_9', // ≤512
  'pipe_7', // ≤128
  'comp_10', // ≤1024 — unlocks pipe_9; enables 1000-magnitude production
  'pipe_8', // ≤256

  // -- Stage E: tetration --------------------------------------------------
  'tetration',
  'comp_11', // ≤2048
  'pipe_9', // ≤512

  // -- Stage F: climb to pentation magnitudes ------------------------------
  'comp_14', // ≤16384 (intermediate tiers comp_12, comp_13 auto-bought as needed)
  'comp_17', // ≤131072
  'comp_20', // ≤1048576 — enables 1M-magnitude production
  'pentation',
];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  csvPath: string | null;
  verbose: boolean;
  to: string | null;
  maxTicks: number;
  strategy: string;
  configPath: string | null;
  scaleOverrides: string[];
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    csvPath: null,
    verbose: false,
    to: null,
    maxTicks: 200_000,
    strategy: 'speedrun-greedy',
    configPath: null,
    scaleOverrides: [],
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--csv') {
      result.csvPath = args[++i] ?? null;
    } else if (a === '--verbose') {
      result.verbose = true;
    } else if (a === '--to') {
      result.to = args[++i] ?? null;
    } else if (a === '--max-ticks') {
      result.maxTicks = Number(args[++i] ?? result.maxTicks);
    } else if (a === '--strategy') {
      result.strategy = args[++i] ?? result.strategy;
    } else if (a === '--config') {
      result.configPath = args[++i] ?? null;
    } else if (a === '--scale') {
      const v = args[++i];
      if (v) result.scaleOverrides.push(v);
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

function buildConfig(args: CliArgs): SimConfig {
  let cfg = args.configPath ? loadConfigFile(args.configPath) : defaultConfig();
  for (const kv of args.scaleOverrides) cfg = applyScaleOverride(cfg, kv);
  return cfg;
}

function printHelp(): void {
  console.log(`Numbers Go Big — pacing simulator (Phase 6 model)

Usage:
  node sim/run.ts [options]

Options:
  --csv <path>           Write per-unlock CSV to the given path
  --verbose              Print every purchase event
  --to <entryId>         Stop at this roadmap entry (default: full roadmap)
  --max-ticks <n>        Maximum ticks to simulate (default: 200000)
  --strategy <name>      Agent strategy (default: speedrun-greedy)
                         Known: ${Object.keys(STRATEGIES).join(', ') || 'speedrun-greedy'}
  --config <path>        Load a SimConfig JSON (sim/configs/*.json)
  --scale key=value      Override one config field (repeatable).
                         Keys: compTier, pipe, warehouse, level,
                               operatorM.<id>, mechanics.<flag>
  -h, --help             Show this help

Phase 6 model: Comprehension is the spine. Power-of-2 ladder
(comp_1..comp_30); production of value V requires comp ≥ V.
Pipes lag manual by one tier (pipe_N needs comp ≥ 2^(N+1)).
See DESIGN.md §9 and sim/README.md for details.

Edit sim/catalog.ts to tune costs, recipes, and tier coefficients.
`);
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatTicks(n: number): string {
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

function printUnlockTable(result: SimulationResult, roadmap: string[]): void {
  console.log('\n=== Unlock pacing ===');
  console.log('');
  console.log(
    '  tick    |  time         |  gap         |  unlock'.padEnd(70),
  );
  console.log('-'.repeat(70));

  let prevTick = 0;
  for (const id of roadmap) {
    const tick = result.unlocks.get(id);
    if (tick === undefined) {
      console.log(
        `  ------  |  ---          |  ---         |  ${id} (not reached)`,
      );
      continue;
    }
    const gap = tick - prevTick;
    console.log(
      `  ${String(tick).padStart(6)}  |  ${formatTicks(tick).padEnd(11)}  |  +${formatTicks(gap).padEnd(10)} |  ${id}`,
    );
    prevTick = tick;
  }
}

function printRepurchaseCounts(result: SimulationResult): void {
  console.log('\n=== Infrastructure built ===');
  console.log('');
  const sortedCells = Array.from(result.finalWorld.cells.entries()).sort();
  for (const [cellType, count] of sortedCells) {
    const level = result.finalWorld.cellLevels.get(cellType) ?? 1;
    const lvlSuffix = level > 1 ? `  (lvl ${level})` : '';
    console.log(`  ${cellType.padEnd(28)} × ${count}${lvlSuffix}`);
  }
  const sortedPipes = Array.from(result.finalWorld.pipes.entries()).sort(
    (a, b) => a[0] - b[0],
  );
  for (const [mag, count] of sortedPipes) {
    // Phase 6: pipes don't level. Single count.
    console.log(`  pipe ≤${String(mag).padEnd(22)} × ${count}`);
  }
  const sortedWarehouses = Array.from(result.finalWorld.warehouses.entries()).sort(
    (a, b) => a[0] - b[0],
  );
  for (const [val, count] of sortedWarehouses) {
    if (count > 0) {
      console.log(`  warehouse(${String(val).padEnd(17)}) × ${count}`);
    }
  }
  console.log(
    `  comprehension                ${result.finalWorld.comprehension} (= 2^${Math.round(Math.log2(result.finalWorld.comprehension))})`,
  );
}

function printBottleneckSummary(result: SimulationResult, roadmap: string[]): void {
  console.log('\n=== Pacing analysis ===');
  console.log('');

  const gaps: { from: string; to: string; gap: number }[] = [];
  let prevTick = 0;
  let prev = 'start';
  for (const id of roadmap) {
    const tick = result.unlocks.get(id);
    if (tick === undefined) continue;
    gaps.push({ from: prev, to: id, gap: tick - prevTick });
    prevTick = tick;
    prev = id;
  }

  const sortedByGap = [...gaps].sort((a, b) => b.gap - a.gap);
  console.log('  Largest gaps (likely cliffs):');
  for (const g of sortedByGap.slice(0, 5)) {
    console.log(`    ${formatTicks(g.gap).padEnd(10)}  ${g.from} → ${g.to}`);
  }

  console.log('');
  console.log('  Smallest gaps (likely too cheap):');
  for (const g of [...sortedByGap].reverse().slice(0, 5)) {
    if (g.gap === 0) continue;
    console.log(`    ${formatTicks(g.gap).padEnd(10)}  ${g.from} → ${g.to}`);
  }

  if (gaps.length > 0) {
    const totalTicks = gaps.reduce((s, g) => s + g.gap, 0);
    const meanGap = totalTicks / gaps.length;
    const ratio = sortedByGap[0].gap / Math.max(1, meanGap);
    console.log('');
    console.log(
      `  Mean gap: ${formatTicks(Math.round(meanGap))}.  Largest/mean ratio: ${ratio.toFixed(2)}×`,
    );
    if (ratio > 5) {
      console.log(
        '  ⚠  Largest gap is >5× the mean — likely a brutal cliff. Consider lowering its currency cost or moving an unlock earlier.',
      );
    }
  }
}

function printFinalPool(result: SimulationResult): void {
  console.log('\n=== Final pool ===');
  const entries = Array.from(result.finalWorld.pool.entries())
    .filter(([, n]) => n > 0)
    .sort((a, b) => a[0] - b[0]);
  for (const [value, count] of entries) {
    console.log(`  ${String(value).padStart(10)} : ${count.toFixed(1)}`);
  }
}

function writeCsv(result: SimulationResult, roadmap: string[], path: string): void {
  const lines: string[] = ['tick,time,gap_ticks,unlock'];
  let prevTick = 0;
  for (const id of roadmap) {
    const tick = result.unlocks.get(id);
    if (tick === undefined) {
      lines.push(`,,,${id} (not reached)`);
      continue;
    }
    const gap = tick - prevTick;
    lines.push(`${tick},${formatTicks(tick)},${gap},${id}`);
    prevTick = tick;
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
  console.log(`\n✓ CSV written to ${path}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs();

  let roadmap = DEFAULT_ROADMAP;
  if (args.to) {
    const idx = roadmap.indexOf(args.to);
    if (idx === -1) {
      console.error(`Unknown roadmap entry: ${args.to}`);
      console.error(`Known entries: ${roadmap.join(', ')}`);
      process.exit(1);
    }
    roadmap = roadmap.slice(0, idx + 1);
  }

  for (const id of roadmap) {
    if (!LITERATURE_BY_ID.has(id)) {
      console.error(`Roadmap entry "${id}" is not in the catalog. Add it to sim/catalog.ts.`);
      process.exit(1);
    }
  }

  const config = buildConfig(args);
  const strategy = createStrategy(args.strategy, { roadmap });

  console.log(`Running pacing simulator (Phase 6 model)…`);
  console.log(`  Strategy: ${strategy.name}`);
  if (args.configPath) console.log(`  Config: ${args.configPath}`);
  if (args.scaleOverrides.length > 0) {
    console.log(`  Overrides: ${args.scaleOverrides.join(', ')}`);
  }
  console.log(`  Roadmap: ${roadmap.length} unlocks`);
  console.log(`  Max ticks: ${args.maxTicks}`);

  const result = withConfig(config, () =>
    simulate(strategy, { maxTicks: args.maxTicks }),
  );

  if (args.verbose) {
    console.log('\n=== Event trace ===');
    for (const ev of result.events) {
      console.log(`  ${String(ev.tick).padStart(6)}  ${ev.kind.padEnd(8)}  ${ev.message}`);
    }
  }

  printUnlockTable(result, roadmap);
  printRepurchaseCounts(result);
  printBottleneckSummary(result, roadmap);
  printFinalPool(result);

  if (result.stalled) {
    console.log(
      '\n⚠  Simulation stalled — agent could not make progress. See the stall event in the trace for details (re-run with --verbose).',
    );
  }

  if (args.csvPath) {
    writeCsv(result, roadmap, args.csvPath);
  }

  console.log('');
}

main();
