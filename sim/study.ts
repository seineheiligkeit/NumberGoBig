// sim/study.ts
//
// A HOLISTIC study of how the manager agent actually plays. Runs the (honest,
// self-tuning) manager at three action rates for a fixed window and reports, per
// rate: the climb, where actions go, how much is built, the throughput, and —
// crucially — where value LEAKS (stranded in the pool, discarded at the cap) and
// where the agent is bottlenecked (idle / fuel-starved / APM it can't absorb).
//
// Goal of the run: biggest frontier + biggest total score. This is the lens for
// "is the play efficient, what's unused, where are the inefficiencies."
//
// Usage: node sim/study.ts [--ticks 10000]

import { runManager, type Stats } from './manager.ts';
import Decimal from 'break_eternity.js';

const fmt = (x: number): string =>
  !Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
const fmtD = (d: Decimal): string => {
  const n = d.toNumber();
  return Number.isFinite(n) ? fmt(n) : d.toExponential(2);
};
const pct = (n: number, d: number): string => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');
const bar = (frac: number, width = 24): string => {
  const fill = Math.max(0, Math.min(width, Math.round(frac * width)));
  return '█'.repeat(fill) + '·'.repeat(width - fill);
};

// Digit-count bands for the pool-composition histogram ("what numbers are sitting
// around"). lo/hi are inclusive digit counts; magnitudeDigits(0)=0 (zeros).
const BANDS: { label: string; lo: number; hi: number }[] = [
  { label: '0 (zeros)', lo: 0, hi: 0 },
  { label: '1 digit (1–9)', lo: 1, hi: 1 },
  { label: '2–3 (10–999)', lo: 2, hi: 3 },
  { label: '4–6 (1e3–1e6)', lo: 4, hi: 6 },
  { label: '7–12', lo: 7, hi: 12 },
  { label: '13–30', lo: 13, hi: 30 },
  { label: '31–60', lo: 31, hi: 60 },
  { label: '61–120', lo: 61, hi: 120 },
  { label: '121+ digits', lo: 121, hi: Infinity },
];

function report(rate: number, label: string, ticks: number, r: ReturnType<typeof runManager>, baseFrontier: number): void {
  const s: Stats = r.stats;
  const spent = s.feed + s.fuel + s.build;
  const line = '─'.repeat(72);
  console.log(`\n${line}`);
  console.log(`  ${label}  (${rate}/tick · ${ticks} ticks)`);
  console.log(line);

  // 1) The outcome (vs the old depth-3 agent).
  const gain = baseFrontier > 0 && Number.isFinite(baseFrontier) ? Math.log10(r.frontier) - Math.log10(baseFrontier) : 0;
  console.log(`  OUTCOME   frontier ${fmt(r.frontier).padStart(10)}   score ${fmt(r.score).padStart(10)}`);
  console.log(`            vs baseline ${fmt(baseFrontier)}  →  +${gain.toFixed(0)} orders of magnitude`);
  console.log(`            cells ${r.cells}  ·  fuel-trees ${r.trees}  ·  frontier-mults ${r.mults}`);

  // 2) The climb (sampled trajectory).
  console.log(`\n  CLIMB`);
  const tr = s.trajectory;
  const step = Math.max(1, Math.floor(tr.length / 8));
  for (let i = 0; i < tr.length; i += step) {
    const p = tr[i];
    console.log(`    t=${String(p.t).padStart(6)}  frontier ${fmt(p.frontier).padStart(10)}  score ${fmt(p.score).padStart(10)}  loose ${String(p.loose).padStart(4)}  trees ${p.trees} mults ${p.mults}`);
  }

  // 3) Where the actions go.
  console.log(`\n  ACTIONS   ${spent} spent of ${fmt(s.budgetGranted)} granted  (utilization ${pct(spent, s.budgetGranted)})`);
  console.log(`            feed  ${String(s.feed).padStart(6)}  ${bar(spent ? s.feed / spent : 0)}  ${pct(s.feed, spent)}`);
  console.log(`            fuel  ${String(s.fuel).padStart(6)}  ${bar(spent ? s.fuel / spent : 0)}  ${pct(s.fuel, spent)}`);
  console.log(`            build ${String(s.build).padStart(6)}  ${bar(spent ? s.build / spent : 0)}  ${pct(s.build, spent)}`);

  // 4) Where the TICKS go (the bottleneck attribution — non-exclusive flags).
  console.log(`\n  TICKS (${ticks})`);
  console.log(`            idle (rate-limited) ${String(s.idleTicks).padStart(6)}  ${bar(s.idleTicks / ticks)}  ${pct(s.idleTicks, ticks)}`);
  console.log(`            productive          ${String(s.productiveTicks).padStart(6)}  ${bar(s.productiveTicks / ticks)}  ${pct(s.productiveTicks, ticks)}`);
  console.log(`            fuel-starved        ${String(s.fuelStarveTicks).padStart(6)}  ${bar(s.fuelStarveTicks / ticks)}  ${pct(s.fuelStarveTicks, ticks)}`);
  console.log(`            APM unspent         ${String(s.unspentTicks).padStart(6)}  ${bar(s.unspentTicks / ticks)}  ${pct(s.unspentTicks, ticks)}`);
  console.log(`            building            ${String(s.buildingTicks).padStart(6)}  ${bar(s.buildingTicks / ticks)}  ${pct(s.buildingTicks, ticks)}`);

  // 5) Throughput.
  const ticksPerOp = s.opsCompleted > 0 ? (ticks / s.opsCompleted).toFixed(1) : '—';
  console.log(`\n  THROUGHPUT  ${s.opsCompleted} frontier ops completed (~${ticksPerOp} ticks/op)`);

  // 6) Value flow — where value lives and leaks.
  console.log(`\n  VALUE`);
  console.log(`            frontier (biggest single) ${fmt(r.frontier).padStart(10)}  = ${pct(r.frontier, r.score)} of score`);
  console.log(`            stranded in pool (loose)   ${fmtD(s.looseValue).padStart(10)}  = ${pct(s.looseValue.toNumber(), r.score)} of score`);
  console.log(`            DISCARDED at pool cap      ${fmtD(s.droppedValue).padStart(10)}  (${s.droppedCount} blocks dropped — pure waste)`);

  // 7) Pool composition — the "unused numbers sitting around".
  console.log(`\n  POOL COMPOSITION (${r.cells} cells; ${s.pool.length} loose stacks)`);
  const blocks = (lo: number, hi: number) => s.pool.filter((p) => p.digits >= lo && p.digits <= hi);
  let totalBlocks = 0;
  for (const p of s.pool) totalBlocks += p.count;
  for (const b of BANDS) {
    const inBand = blocks(b.lo, b.hi);
    if (inBand.length === 0) continue;
    const cnt = inBand.reduce((a, p) => a + p.count, 0);
    let val = Decimal.dZero;
    for (const p of inBand) val = val.add(p.mag.mul(p.count));
    console.log(`            ${b.label.padEnd(16)} ${String(cnt).padStart(6)} blocks  ${bar(totalBlocks ? cnt / totalBlocks : 0, 16)}  value ${fmtD(val)}`);
  }
}

function main(): void {
  let ticks = 10000;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i] === '--ticks') ticks = Number(a[++i]);

  console.log('Holistic study of the manager agent — goal: biggest frontier + biggest score.');
  console.log(`Window: ${ticks} ticks. Self-tuning agent (stacking, auto fuel + width), spread.`);

  const runs: { rate: number; label: string }[] = [
    { rate: 1 / 30, label: 'SLOW  — 1 action / 30 ticks' },
    { rate: 1, label: 'STEADY — 1 action / tick' },
    { rate: 5, label: 'FAST  — 5 actions / tick' },
  ];
  const results = runs.map((run) => ({
    ...run,
    r: runManager(run.rate, ticks, {}), //                                                          improved: the new default (smart fuel + 16 mults)
    base: runManager(run.rate, ticks, { smartFuel: false, fuelDepth: 3, mults: 4 }), //             baseline: the original depth-3, 4-mult agent
  }));
  for (const { rate, label, r, base } of results) report(rate, label, ticks, r, base.frontier);

  // Cross-rate summary: baseline (old depth-3 agent) vs improved (smart fuel).
  console.log(`\n${'═'.repeat(72)}`);
  console.log('  CROSS-RATE SUMMARY — baseline (depth-3) vs improved (smart fuel)');
  console.log('═'.repeat(72));
  console.log('   rate        | baseline   | improved   | gain   | starved | unspent');
  console.log('  -------------+------------+------------+--------+---------+--------');
  for (const { label, r, base } of results) {
    const s = r.stats;
    const gain = base.frontier > 0 && Number.isFinite(base.frontier) ? Math.log10(r.frontier) - Math.log10(base.frontier) : 0;
    console.log(
      `  ${label.slice(0, 12).padEnd(12)} | ${fmt(base.frontier).padStart(10)} | ${fmt(r.frontier).padStart(10)} | ` +
        `+${gain.toFixed(0).padStart(3)} oom | ${pct(s.fuelStarveTicks, ticks).padStart(7)} | ${pct(s.unspentTicks, ticks).padStart(6)}`,
    );
  }
}

main();
