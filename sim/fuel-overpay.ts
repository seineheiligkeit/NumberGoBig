// sim/fuel-overpay.ts
//
// The chosen lever: diminishing-returns on overpaying fuel (fuelOverpayExp) +
// a REDUCED (not zero) amplifier baseRate (amplifierBaseRateScale). Goal: the
// strongest "fuel actually matters" feel that still CLIMBS smoothly (no cascade
// collapse — which is what amplifierBaseRateScale = 0 does).
//
// We sweep both knobs and report, per combo:
//   frontier      — how high it climbs (vs the no-lever baseline)
//   last-¼ growth — orders of magnitude gained in the final quarter of the run.
//                   Healthy climb → still growing; ~0 → STALLED/collapsed.
//   fuel%         — share of actions spent on fuel (how fuel-bound play becomes)
//
// Usage:
//   node sim/fuel-overpay.ts
//   node sim/fuel-overpay.ts --rate 1 --ticks 12000 --factory

import { runManager, type Stats } from './manager.ts';
import { DEFAULT_TUNING, type TimeTuning } from '../core/time.ts';

const fmt = (x: number): string =>
  !Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
const pct = (n: number, d: number): string => (d > 0 ? `${((100 * n) / d).toFixed(0)}%` : '0%');
const oom = (x: number): number => (x > 1 && Number.isFinite(x) ? Math.log10(x) : 0);

// orders of magnitude gained in the final quarter of the run (stall detector)
function lastQuarterGrowth(s: Stats): number {
  const tr = s.trajectory;
  if (tr.length < 4) return 0;
  const i = Math.floor(tr.length * 0.75);
  return oom(tr[tr.length - 1].frontier) - oom(tr[i].frontier);
}

function main(): void {
  let ticks = 12000;
  let rate = 1;
  let factory = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--rate') rate = Number(a[++i]);
    else if (a[i] === '--factory') factory = true;
  }
  const ampBases = [1, 0.5, 0.25, 0.1, 0.05];
  const overpays = [1, 0.5, 0.3];

  console.log('FUEL-OVERPAY + REDUCED-BASERATE SWEEP — find the strongest stable "fuel matters" lever.');
  console.log(`rate ${rate} · ${ticks} ticks (${(ticks / 3600).toFixed(1)}h) · factory-fuel ${factory ? 'ON' : 'off'}.`);
  console.log('Want: big drop vs baseline (fuel/time matters) BUT last-¼ growth > 0 (still climbing, not collapsed).\n');

  // The pre-lock "vanilla" economy — DEFAULT_TUNING now SHIPS 0.5/0.5 (the
  // 2026-06-10 lock), so the no-lever baseline must be requested explicitly.
  const vanilla: TimeTuning = { ...DEFAULT_TUNING, amplifierBaseRateScale: 1, fuelOverpayExp: 1 };
  const base = runManager(rate, ticks, { tuning: vanilla });
  console.log(`  baseline (ampBase 1, overpay 1): frontier ${fmt(base.frontier)}\n`);
  console.log('  ampBase  overpay | frontier      | vs base | last-¼ | fuel% | verdict');
  console.log('  -----------------+---------------+---------+--------+-------+---------------------');
  for (const ampBase of ampBases) {
    for (const overpay of overpays) {
      const tuning: TimeTuning = { ...DEFAULT_TUNING, amplifierBaseRateScale: ampBase, fuelOverpayExp: overpay };
      const r = runManager(rate, ticks, { tuning, fuelFactory: factory });
      const s = r.stats;
      const spent = s.feed + s.fuel + s.build || 1;
      const gain = oom(r.frontier) - oom(base.frontier);
      const grow = lastQuarterGrowth(s);
      const stalled = grow < 1; // <1 oom in the final quarter ≈ flatlined
      const verdict = stalled ? 'STALLED/collapsed' : gain < -3 ? 'fuel matters, climbs' : 'barely changed';
      console.log(
        `  ${ampBase.toFixed(2).padStart(6)}  ${overpay.toFixed(2).padStart(6)} | ${fmt(r.frontier).padStart(13)} | ${(gain >= 0 ? '+' : '') + gain.toFixed(0).padStart(2)} oom | ${grow.toFixed(0).padStart(5)}o | ${pct(s.fuel, spent).padStart(5)} | ${verdict}`,
      );
    }
  }
  console.log('\n  Pick the lowest ampBase / overpay that still shows last-¼ growth > 0 — that\'s the');
  console.log('  most fuel-dependent setting that doesn\'t collapse. Then wire it into the game.');
}

main();
