// sim/scaffold-sweep.ts
//
// Tune the SCAFFOLDING law ("show your work" — TimeTuning.scaffold*): sweep
// α (scaffoldExp) × C (scaffoldCoeff) × band and report, per combo, how the
// scaffolding-aware challenger's climb compares against:
//   - the NO-EXP baseline (pure mult pyramid — the floor exp must beat), and
//   - the UNSCAFFOLDED exp run (the broken tower the law must tame).
//
// What "good" looks like (the Slice-1 acceptance targets):
//   - exp-enabled digits ≈ 3–10× the no-exp digits at the same rate/window
//     (exp is a real, earned edge — not pointless, not a tower),
//   - a launch CADENCE of meaningful milestones, not micro-hops,
//   - still growing in the last quarter (no stall/collapse).
//
// Usage:
//   node sim/scaffold-sweep.ts                  # default: rate 1, 14400 ticks (4 h)
//   node sim/scaffold-sweep.ts --rate 0.1 --ticks 14400
//   node sim/scaffold-sweep.ts --bands          # also sweep the band width at α=0.5

import { runChallenger } from './challenger.ts';
import { DEFAULT_TUNING, type TimeTuning } from '../core/time.ts';
import Decimal from 'break_eternity.js';

const fmtD = (d: Decimal): string => {
  const n = d.toNumber();
  return Number.isFinite(n) && n < 1e9 ? Math.round(n).toLocaleString('en-US') : d.toString();
};

function main(): void {
  let rate = 1;
  let ticks = 14400;
  let sweepBands = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--rate') rate = Number(a[++i]);
    else if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--bands') sweepBands = true;
  }

  console.log(`SCAFFOLDING SWEEP — rate ${rate}/s · ${ticks} ticks (${(ticks / 3600).toFixed(1)} h).`);
  console.log(`Want: digits ≈ 3–10× the no-exp baseline, milestone-sized launches, last-¼ still growing.\n`);

  // The two poles.
  const noExp = runChallenger(rate, ticks, { useExp: false });
  console.log(`  NO-EXP baseline (pure mult pyramid): ${fmtD(noExp.digits)} digits, ${noExp.ops} ops`);
  const tower = runChallenger(rate, ticks, { useExp: true });
  console.log(`  UNSCAFFOLDED exp (the broken tower): ${fmtD(tower.digits)} digits, ${tower.exps} launches\n`);

  console.log('  α      C  band | digits     | ×no-exp | launches | digits/launch | last-¼ ratio | verdict');
  console.log('  ---------------+------------+---------+----------+---------------+--------------+--------');
  const combos: { alpha: number; coeff: number; band: number }[] = [];
  for (const alpha of [0.4, 0.5, 0.65, 0.8]) combos.push({ alpha, coeff: 1, band: 64 });
  if (sweepBands) for (const band of [8, 256]) combos.push({ alpha: 0.65, coeff: 1, band });

  const baseD = noExp.digits.toNumber();
  for (const { alpha, coeff, band } of combos) {
    const tuning: TimeTuning = {
      ...DEFAULT_TUNING,
      scaffoldCoeff: coeff,
      scaffoldExp: alpha,
      scaffoldBand: band,
    };
    const r = runChallenger(rate, ticks, { useExp: true, tuning });
    const d = r.digits.toNumber();
    const ratio = Number.isFinite(d) && baseD > 0 ? d / baseD : Infinity;
    const perLaunch = r.exps > 0 ? d / r.exps : 0;
    const lastQ = r.digitsAt75.gt(0) ? r.digits.div(r.digitsAt75).toNumber() : Infinity;
    const verdict =
      !Number.isFinite(d) || ratio > 50
        ? 'TOWER (too loose)'
        : ratio < 1.5
          ? 'exp pointless (too harsh)'
          : lastQ < 1.05
            ? 'STALLED'
            : ratio >= 3 && ratio <= 10
              ? 'TARGET ✓'
              : 'ok-ish';
    console.log(
      `  ${alpha.toFixed(2)}  ${String(coeff).padStart(3)}  ${String(band).padStart(4)} | ${fmtD(r.digits).padStart(10)} | ${(Number.isFinite(ratio) ? ratio.toFixed(1) + '×' : '∞').padStart(7)} | ${String(r.exps).padStart(8)} | ${perLaunch.toFixed(1).padStart(13)} | ${(Number.isFinite(lastQ) ? lastQ.toFixed(2) + '×' : '∞').padStart(12)} | ${verdict}`,
    );
  }
  console.log('\n  digits/launch = average frontier digits per launch (milestone size proxy).');
  console.log('  last-¼ ratio = final digits / digits at 75% of the window (≈1 → stalled).');
}

main();
