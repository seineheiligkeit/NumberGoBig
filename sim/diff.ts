// sim/diff.ts
//
// Counterfactual harness: run two SimConfigs back-to-back with the
// same strategy and report the pacing delta per unlock. The fastest
// way to answer "what if I cut multiplication's M from 100 to 60?"
//
// Usage:
//   node sim/diff.ts sim/configs/baseline.json sim/configs/flat-fuel.json
//   node sim/diff.ts baseline.json variant.json --strategy beam-search
//   node sim/diff.ts a.json b.json --to tetration

import { simulate, type SimulationResult } from './simulator.ts';
import { LITERATURE_BY_ID } from './catalog.ts';
import { createStrategy } from './strategy.ts';
import './strategies/speedrun-greedy.ts';
import './strategies/comp-rush.ts';
import './strategies/warehouse-hoarder.ts';
import './strategies/cell-spammer.ts';
import './strategies/beam-search.ts';
import { loadConfigFile, withConfig } from './config.ts';

const DEFAULT_ROADMAP: string[] = [
  'successor', 'pipe_0', 'addition', 'comp_2', 'subtraction', 'comp_3',
  'multiplication', 'comp_4', 'pipe_2', 'division', 'negation', 'comp_5',
  'pipe_3', 'comp_6', 'pipe_4', 'comp_7', 'exponentiation', 'pipe_5',
  'inversion', 'square-root', 'comp_8', 'pipe_6', 'comp_9', 'pipe_7',
  'comp_10', 'pipe_8', 'tetration', 'comp_11', 'pipe_9', 'comp_14',
  'comp_17', 'comp_20', 'pentation',
];

function formatTicks(n: number): string {
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m`;
}

function formatDelta(a: number | undefined, b: number | undefined): string {
  if (a === undefined && b === undefined) return '—';
  if (a === undefined) return '↑ new';
  if (b === undefined) return '↓ lost';
  const d = b - a;
  if (d === 0) return '0';
  const sign = d > 0 ? '+' : '−';
  return `${sign}${formatTicks(Math.abs(d))}`;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === '-h' || args[0] === '--help') {
    console.log(`Usage: node sim/diff.ts <baseline.json> <variant.json> [options]

Options:
  --strategy <name>      Agent strategy (default: speedrun-greedy)
  --to <entryId>         Stop at this entry
  --max-ticks <n>        Max ticks per run (default: 200000)`);
    process.exit(args.length < 2 ? 1 : 0);
  }

  const baselinePath = args[0];
  const variantPath = args[1];
  let strategy = 'speedrun-greedy';
  let to: string | null = null;
  let maxTicks = 200_000;
  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === '--strategy') strategy = args[++i] ?? strategy;
    else if (a === '--to') to = args[++i] ?? null;
    else if (a === '--max-ticks') maxTicks = Number(args[++i] ?? maxTicks);
  }

  let roadmap = DEFAULT_ROADMAP;
  if (to) {
    const idx = roadmap.indexOf(to);
    if (idx < 0) {
      console.error(`Unknown roadmap entry: ${to}`);
      process.exit(1);
    }
    roadmap = roadmap.slice(0, idx + 1);
  }

  const cfgA = loadConfigFile(baselinePath);
  const cfgB = loadConfigFile(variantPath);

  const runOne = (cfg: ReturnType<typeof loadConfigFile>): SimulationResult => {
    const s = createStrategy(strategy, { roadmap });
    return withConfig(cfg, () => simulate(s, { maxTicks }));
  };

  console.log(`Diff: ${baselinePath}  →  ${variantPath}`);
  console.log(`  Strategy: ${strategy}`);
  console.log(`  Roadmap: ${roadmap.length} unlocks`);
  console.log('');

  process.stderr.write('Running baseline…\n');
  const A = runOne(cfgA);
  process.stderr.write('Running variant…\n');
  const B = runOne(cfgB);

  const interesting = roadmap.filter((id) => {
    const entry = LITERATURE_BY_ID.get(id);
    return entry && (entry.kind === 'cell' || entry.kind === 'comprehension');
  });

  const labelW = 22;
  const colW = 12;
  console.log(
    'unlock'.padEnd(labelW) +
      'baseline'.padStart(colW) +
      'variant'.padStart(colW) +
      'delta'.padStart(colW),
  );
  console.log('-'.repeat(labelW + colW * 3));

  for (const id of interesting) {
    const ta = A.unlocks.get(id);
    const tb = B.unlocks.get(id);
    const aStr = ta === undefined ? '—' : formatTicks(ta);
    const bStr = tb === undefined ? '—' : formatTicks(tb);
    const dStr = formatDelta(ta, tb);
    console.log(
      id.slice(0, labelW - 1).padEnd(labelW) +
        aStr.padStart(colW) +
        bStr.padStart(colW) +
        dStr.padStart(colW),
    );
  }

  console.log('');
  console.log(
    `Final tick: baseline=${formatTicks(A.finalTick)}  variant=${formatTicks(B.finalTick)}  ` +
      `delta=${formatDelta(A.finalTick, B.finalTick)}`,
  );
  if (A.stalled) console.log('  ⚠  baseline stalled');
  if (B.stalled) console.log('  ⚠  variant stalled');
}

main();
