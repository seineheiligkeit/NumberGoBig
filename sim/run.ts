// sim/run.ts
//
// CLI entry point for the pacing simulator.
//
// Usage:
//   node sim/run.ts                     # default roadmap, console summary
//   node sim/run.ts --csv pacing.csv    # also write per-unlock CSV
//   node sim/run.ts --verbose           # print every purchase event
//   node sim/run.ts --to tetration      # stop at a specific roadmap entry
//
// The default roadmap walks Successor through Tetration, hitting every
// pacing-relevant unlock along the way.

import { writeFileSync } from 'node:fs';
import { simulate, newAgent, type SimulationResult } from './simulator.ts';
import { LITERATURE_BY_ID } from './catalog.ts';

// ---------------------------------------------------------------------------
// Default roadmap — the order an optimal-play agent unlocks things
// ---------------------------------------------------------------------------

const DEFAULT_ROADMAP: string[] = [
  'successor',
  'pipe_1',
  'addition',
  'comprehension_25',
  'subtraction',
  'multiplication',
  'pipe_10',
  'division',
  // Slice 6.14: negation lands here — player just unlocked rationals via
  // division and negatives via subtraction; negation makes producing
  // negatives systematic, in anticipation of Inversion.
  'negation',
  'comprehension_100',
  'exponentiation',
  // Slice 6.14: inversion arrives once the full operator hierarchy is in
  // hand. It's the bridge that turns the previously-decorative small-
  // number outputs (negatives, tiny rationals) into productive raw
  // material — even if the sim's agent doesn't pick it as a shortcut.
  'inversion',
  'comprehension_250',
  'square-root',
  'comprehension_1k',
  'cultivation-arithmetic',
  'pipe_100',
  'comprehension_10k',
  'comprehension_100k',
  'pipe_1k',
  'comprehension_1m',
  'tetration',
  'comprehension_1b',
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
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    csvPath: null,
    verbose: false,
    to: null,
    maxTicks: 200_000,
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
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

function printHelp(): void {
  console.log(`Numbers Go Big — pacing simulator

Usage:
  node sim/run.ts [options]

Options:
  --csv <path>       Write per-unlock CSV to the given path
  --verbose          Print every purchase event
  --to <entryId>     Stop at this roadmap entry (default: full roadmap)
  --max-ticks <n>    Maximum ticks to simulate (default: 200000)
  -h, --help         Show this help

The roadmap walks: successor → pipe_1 → addition → subtraction →
multiplication → division → exponentiation → pipe_10 → pipe_100 →
comprehension tiers → tetration → pentation.

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
    '  tick  |  time      |  gap      |  unlock'.padEnd(70),
  );
  console.log('-'.repeat(70));

  let prevTick = 0;
  for (const id of roadmap) {
    const tick = result.unlocks.get(id);
    if (tick === undefined) {
      console.log(
        `  ----  |  ---       |  ---      |  ${id} (not reached)`,
      );
      continue;
    }
    const gap = tick - prevTick;
    console.log(
      `  ${String(tick).padStart(4)}  |  ${formatTicks(tick).padEnd(8)}  |  +${formatTicks(gap).padEnd(7)} |  ${id}`,
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
    const level = result.finalWorld.pipeLevels.get(mag) ?? 1;
    const lvlSuffix = level > 1 ? `  (lvl ${level})` : '';
    console.log(`  pipe ≤${String(mag).padEnd(22)} × ${count}${lvlSuffix}`);
  }
  console.log(`  comprehension                ${result.finalWorld.comprehension}`);
}

function printBottleneckSummary(result: SimulationResult, roadmap: string[]): void {
  console.log('\n=== Pacing analysis ===');
  console.log('');

  // Compute gaps between consecutive unlocks; flag any abnormally large.
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

  // Sort gaps by size; identify outliers.
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

  // Geometric-mean baseline: if every gap was identical, what would it be?
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
        '  ⚠  Largest gap is >5× the mean — likely a brutal cliff. Consider lowering its currency cost or unlocking a pre-requisite operator earlier.',
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
    console.log(`  ${String(value).padStart(8)} : ${count.toFixed(1)}`);
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

  // Sanity-check that every roadmap entry exists in the catalog.
  for (const id of roadmap) {
    if (!LITERATURE_BY_ID.has(id)) {
      console.error(`Roadmap entry "${id}" is not in the catalog. Add it to sim/catalog.ts.`);
      process.exit(1);
    }
  }

  console.log(`Running pacing simulator…`);
  console.log(`  Roadmap: ${roadmap.length} unlocks`);
  console.log(`  Max ticks: ${args.maxTicks}`);

  const agent = newAgent(roadmap);
  const result = simulate(agent, { maxTicks: args.maxTicks });

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
