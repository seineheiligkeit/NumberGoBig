// sim/fuel-experiment.ts
//
// THE FUEL-LAW EXPERIMENT (design question: "multiplicative ops are too cheap to
// run; fuel production should have to chase number production").
//
// We sweep candidate `fuelLaw`s and watch the managing agent play under each:
//   - magnitude (current): fuel contribution = raw value. One recycled big output
//     over-pays any op → fuel is never scarce → dedicated fuel production is
//     pointless → no treadmill.
//   - digits^q: fuel contribution = (digit-count)^q. Sub-linear in value, so a big
//     output buys only bounded progress and you must keep WIDENING fuel production
//     to feed the digits^k-growing ops. The intended treadmill.
//
// STAGE 1 (this file): run TODAY's agent (which is hard-tuned to the magnitude
// law — deep "smart" fuel trees, recycle-the-frontier-as-fuel) under each law and
// report WHERE IT BREAKS. The agent is deliberately NOT adapted yet: the point is
// to see, honestly, what the unchanged optimal-for-magnitude play does when the
// law moves — fuel-starvation, throughput collapse, value leaks, climb stalls.
// Stage 2 will adapt the agent to the promising law(s) and re-measure.
//
// Usage:
//   node sim/fuel-experiment.ts                 # full sweep, default window
//   node sim/fuel-experiment.ts --ticks 12000 --rates 1,5
//   node sim/fuel-experiment.ts --climb         # also print per-law climb traces

import { runManager, type Stats } from './manager.ts';
import { DEFAULT_TUNING, type TimeTuning } from '../core/time.ts';
import Decimal from 'break_eternity.js';

// --- The candidate laws under test. magnitude = the current game. -------------
interface Law {
  key: string;
  blurb: string;
  tuning: TimeTuning;
}
function law(key: string, blurb: string, over: Partial<TimeTuning>): Law {
  return { key, blurb, tuning: { ...DEFAULT_TUNING, ...over } };
}
const LAWS: Law[] = [
  law('magnitude', 'raw value (current game) — fuel never scarce', { fuelLaw: 'magnitude' }),
  law('digits^1', 'pure digit-count — most scarce', { fuelLaw: 'digits', fuelDigitExp: 1 }),
  law('digits^2', 'digits squared — moderate scarcity', { fuelLaw: 'digits', fuelDigitExp: 2 }),
  law('digits^3', 'digits cubed (≈ mult opExponent) — ~1 same-tier block ≈ 1 op', {
    fuelLaw: 'digits',
    fuelDigitExp: 3,
  }),
];

const fmt = (x: number): string =>
  !Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
const fmtD = (d: Decimal): string => {
  const n = d.toNumber();
  return Number.isFinite(n) ? fmt(n) : d.toExponential(2);
};
const pct = (n: number, d: number): string => (d > 0 ? `${((100 * n) / d).toFixed(0)}%` : '—');
const oom = (x: number): number => (x > 1 && Number.isFinite(x) ? Math.log10(x) : 0);

interface Cell {
  rate: number;
  law: Law;
  r: ReturnType<typeof runManager>;
}

function diag(c: Cell, ticks: number, baseFrontier: number): void {
  const { r, law } = c;
  const s: Stats = r.stats;
  const spent = s.feed + s.fuel + s.build;
  const gain = baseFrontier > 0 && Number.isFinite(baseFrontier) ? oom(r.frontier) - oom(baseFrontier) : 0;
  // "Treadmill present?" heuristic: fuel production had to GROW over the run
  // (trees built > 1) AND the agent was meaningfully fuel-pressured AND the climb
  // is still net-positive (frontier is a real fraction of score).
  const treesGrew = r.trees > 1;
  const pressured = s.fuelStarveTicks / ticks > 0.2;
  console.log(
    `  ${law.key.padEnd(10)} | frontier ${fmt(r.frontier).padStart(10)} (${gain >= 0 ? '+' : ''}${gain.toFixed(0)} oom vs current) | score ${fmt(r.score).padStart(10)}`,
  );
  console.log(
    `             | actions: feed ${pct(s.feed, spent).padStart(4)}  fuel ${pct(s.fuel, spent).padStart(4)}  build ${pct(s.build, spent).padStart(4)}` +
      `   |  ${r.trees} trees · ${r.mults} mults · ${s.opsCompleted} ops (${s.opsCompleted ? (ticks / s.opsCompleted).toFixed(0) : '—'} t/op)`,
  );
  console.log(
    `             | ticks: fuel-starved ${pct(s.fuelStarveTicks, ticks).padStart(4)}  APM-unspent ${pct(s.unspentTicks, ticks).padStart(4)}  building ${pct(s.buildingTicks, ticks).padStart(4)}` +
      `  |  loose-value ${fmtD(s.looseValue)} (${pct(s.looseValue.toNumber(), r.score)} of score)`,
  );
  console.log(
    `             | treadmill? trees-grew=${treesGrew ? 'Y' : 'n'} fuel-pressured=${pressured ? 'Y' : 'n'} net-positive=${r.frontier > 1 ? 'Y' : 'n'}`,
  );
}

function climbTrace(c: Cell): void {
  const tr = c.r.stats.trajectory;
  const step = Math.max(1, Math.floor(tr.length / 8));
  const pts: string[] = [];
  for (let i = 0; i < tr.length; i += step) pts.push(`${fmt(tr[i].frontier)}`);
  pts.push(fmt(tr[tr.length - 1]?.frontier ?? c.r.frontier));
  console.log(`             climb: ${pts.join(' → ')}`);
}

function main(): void {
  let ticks = 14000;
  let rates = [1, 5];
  let climb = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--rates') rates = a[++i].split(',').map(Number);
    else if (a[i] === '--climb') climb = true;
  }

  console.log('FUEL-LAW EXPERIMENT — Stage 1: today\'s (magnitude-tuned) agent under each law.');
  console.log(`Window ${ticks} ticks (${(ticks / 3600).toFixed(1)}h) · spread · smart fuel + 16 mults + auto-scale.`);
  console.log('Watching: does fuel become scarce (treadmill) WITHOUT stalling the climb?\n');
  for (const l of LAWS) console.log(`    ${l.key.padEnd(10)} — ${l.blurb}`);

  for (const rate of rates) {
    console.log(`\n${'═'.repeat(96)}`);
    console.log(`  RATE ${rate} action(s)/tick`);
    console.log('═'.repeat(96));
    // Baseline = magnitude law at this rate (the current game), for the oom delta.
    let baseFrontier = 0;
    for (const l of LAWS) {
      const r = runManager(rate, ticks, { tuning: l.tuning });
      if (l.key === 'magnitude') baseFrontier = r.frontier;
      const c: Cell = { rate, law: l, r };
      diag(c, ticks, baseFrontier);
      if (climb) climbTrace(c);
      console.log('');
    }
  }

  console.log(`${'─'.repeat(96)}`);
  console.log('  Read: a good law shows fuel-starved% UP and trees-grew=Y (fuel must chase),');
  console.log('  but frontier still climbing (net-positive=Y, t/op not exploding). If the climb');
  console.log('  collapses, either the law is too steep OR the agent needs adapting (Stage 2).');
}

main();
