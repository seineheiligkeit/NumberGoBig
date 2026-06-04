// sim/build-roi.ts
//
// Build-cost vs throughput: is expanding the factory always worthwhile?
//
// buildWork(N) = buildBase · buildGrowth^N — geometric in how many of a kind
// you already own. Production from N cells is ~linear in N. So the question is
// whether the geometric build cost outruns the linear throughput gain — i.e.
// whether there's always a worthwhile next cell to build, or a wall.
//
// We report, per owned-count N: the build time of the Nth cell, the cumulative
// build time, and the PAYBACK of the Nth cell (build cost ÷ the throughput it
// adds). A flat-ish payback = expansion stays worthwhile; an exploding payback
// = a wall (you can't afford to go wide, which kills "always something to build"
// and the factory-width APM gradient).
//
// Usage: node sim/build-roi.ts   (compares the current growth vs gentler ones)

import { buildWork, DEFAULT_TUNING, operationWork } from '../core/time.ts';
import { VALUE_ONE } from '../core/value.ts';
import Decimal from 'break_eternity.js';

const base = DEFAULT_TUNING.baseRate;
// One successor's steady production: ~baseRate / opWork(write a "1") ones per sec.
const succOpTicks = operationWork(VALUE_ONE, 'successor').toNumber();
const perCellRate = base / succOpTicks; // 1s/sec added by one more successor

function secs(t: number): string {
  if (!Number.isFinite(t)) return '∞';
  if (t < 90) return `${t.toFixed(0)}s`;
  if (t < 5400) return `${(t / 60).toFixed(1)}m`;
  if (t < 1.3e5) return `${(t / 3600).toFixed(1)}h`;
  return `${(t / 8.6e4).toFixed(0)}d`;
}

function table(growth: number): void {
  console.log(`\nbuildGrowth = ${growth} (buildBase ${DEFAULT_TUNING.buildBase}, +${perCellRate}/s per cell):`);
  console.log('    N | build the Nth |  cumulative  | payback of Nth cell');
  console.log('  ----+---------------+--------------+--------------------');
  const t = { ...DEFAULT_TUNING, buildGrowth: growth };
  let cum = 0;
  for (let N = 0; N < 24; N++) {
    const w = buildWork(N, t).toNumber() / base; // ticks to build the Nth
    cum += w;
    const payback = w / perCellRate; // seconds of extra production to recoup the build
    if (N < 8 || N % 2 === 0) {
      console.log(`  ${String(N + 1).padStart(3)} | ${secs(w).padStart(13)} | ${secs(cum).padStart(12)} | ${secs(payback).padStart(10)} per +${perCellRate}/s`);
    }
  }
}

console.log('Build-cost vs throughput — is the next cell always worth building?');
console.log('(payback = time the new cell must run to produce back its own build cost)');
for (const g of [DEFAULT_TUNING.buildGrowth, 1.2, 1.1, 1.05]) table(g);
console.log('\nRead: if payback explodes with N, going wide hits a wall (bad — width is the APM sink).');
console.log('A gentle growth keeps every next cell worth building → "always something to build".');
