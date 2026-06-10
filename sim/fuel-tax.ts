// sim/fuel-tax.ts
//
// THE FUEL-TAX SWEEP (the chosen direction after Stage 1 ruled out per-block
// digit-fuel). Each amplifying op (multiplication and up) carries a fuel
// REQUIREMENT = C · magnitude(output)^α that ONLY burned fuel can satisfy
// (baseRate pays time, never the tax). So a bigger result demands proportionally
// more fuel → fuel production must chase number production. It's a magnitude
// QUANTITY (conserved — no shatter exploit), net-positive for α<1.
//
// The agent is now tax-aware (manager.ts `takeTaxFuel`): it pays the tax by
// recycling a right-sized sub-frontier block, reserving the champion as the next
// operand. We sweep (C, α) and watch:
//   - frontier        : does the climb survive (and how much is it throttled)?
//   - fuel-starved%    : is the agent fuel-pressured (the treadmill biting)?
//   - tax-bite         : fuel-magnitude burned ÷ score (how much production is
//                        recycled as fuel — the "ever-increasing fuel" signal).
//   - trees            : did the agent have to scale fuel production?
//   - net-positive     : frontier still a healthy fraction of score?
//
// Goal: a (C, α) where fuel is a real, scaling cost (starve% up, tax-bite up) but
// the climb stays alive and net-positive. That's the treadmill the design wants.
//
// Usage:
//   node sim/fuel-tax.ts                         # default grid, rates 1 & 5
//   node sim/fuel-tax.ts --ticks 12000 --climb
//   node sim/fuel-tax.ts --rates 0.1,1 --alphas 0.5,0.7,1 --coeffs 1,2

import { runManager, type Stats } from './manager.ts';
import { DEFAULT_TUNING, type TimeTuning } from '../core/time.ts';
import Decimal from 'break_eternity.js';

const fmt = (x: number): string =>
  !Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
const fmtD = (d: Decimal): string => {
  const n = d.toNumber();
  return Number.isFinite(n) ? fmt(n) : d.toExponential(2);
};
const pct = (n: number, d: number): string => (d > 0 ? `${((100 * n) / d).toFixed(0)}%` : '0%');
const oom = (x: number): number => (x > 1 && Number.isFinite(x) ? Math.log10(x) : 0);

// Tax floor: ops below this magnitude are free, so the auto-piped fuel trees
// (which have no fuel feed of their own) run — without it the whole fuel supply
// deadlocks. 1e20 clears the agent's deepest fuel root (~2^64 ≈ 1.8e19).
const TAX_FLOOR = 1e20;
function taxTuning(coeff: number, alpha: number): TimeTuning {
  return { ...DEFAULT_TUNING, fuelTaxCoeff: coeff, fuelTaxExp: alpha, fuelTaxFloor: TAX_FLOOR };
}

// tax-bite = fuel magnitude burned ÷ final score. Decimal-safe ratio in oom.
function taxBitePct(s: Stats, score: number): string {
  const burned = s.fuelMagBurned;
  if (!Number.isFinite(score) || score <= 0) return '—';
  const b = burned.toNumber();
  if (Number.isFinite(b)) return `${((100 * b) / score).toFixed(0)}%`;
  // both astronomically large — compare in log space.
  const d = oom(burned.toNumber()) - oom(score);
  return Number.isFinite(d) ? `10^${d.toFixed(0)}×` : '—';
}

interface Row {
  coeff: number;
  alpha: number;
  byRate: Map<number, ReturnType<typeof runManager>>;
}

function main(): void {
  let ticks = 12000;
  let rates = [1, 5];
  let alphas = [0.5, 0.7, 0.85, 1.0];
  let coeffs = [0.5, 1, 2];
  let climb = false;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--rates') rates = a[++i].split(',').map(Number);
    else if (a[i] === '--alphas') alphas = a[++i].split(',').map(Number);
    else if (a[i] === '--coeffs') coeffs = a[++i].split(',').map(Number);
    else if (a[i] === '--climb') climb = true;
  }

  console.log('FUEL-TAX SWEEP — op needs C·magnitude(output)^α of BURNED fuel to complete.');
  console.log(`Window ${ticks} ticks (${(ticks / 3600).toFixed(1)}h) · tax-aware agent · spread · 16 mults + auto-scale.`);
  console.log('Looking for: fuel a real SCALING cost (starve% & tax-bite up) WITHOUT collapsing the climb.\n');

  // Reference: no tax (current game) per rate.
  const base = new Map<number, ReturnType<typeof runManager>>();
  for (const r of rates) base.set(r, runManager(r, ticks, {}));
  console.log('  REFERENCE (no tax — current game):');
  for (const r of rates) {
    const b = base.get(r)!;
    console.log(`    rate ${String(r).padStart(3)} | frontier ${fmt(b.frontier).padStart(10)} | ops ${String(b.stats.opsCompleted).padStart(5)} | starve ${pct(b.stats.fuelStarveTicks, ticks).padStart(4)} | trees ${b.trees}`);
  }

  for (const r of rates) {
    console.log(`\n${'═'.repeat(110)}`);
    console.log(`  RATE ${r} action(s)/tick    (reference frontier ${fmt(base.get(r)!.frontier)})`);
    console.log('═'.repeat(110));
    console.log('   C    α   | frontier      | vs base | fuel% | starve% | tax-bite | trees | ops  | net(front/score) | verdict');
    console.log('  ---------+---------------+---------+-------+---------+----------+-------+------+------------------+---------');
    const baseFr = base.get(r)!.frontier;
    for (const coeff of coeffs) {
      for (const alpha of alphas) {
        const res = runManager(r, ticks, { tuning: taxTuning(coeff, alpha) });
        const s: Stats = res.stats;
        const spent = s.feed + s.fuel + s.build || 1;
        const gain = oom(res.frontier) - oom(baseFr);
        const netFrac = res.score > 0 ? res.frontier / res.score : 0;
        const collapsed = gain < -8;
        const pressured = s.fuelStarveTicks / ticks > 0.15;
        const alive = res.frontier > 1e6 && netFrac > 1e-6;
        const verdict = !alive ? 'STALLED' : collapsed ? (pressured ? 'too steep' : 'throttled') : pressured ? 'TREADMILL' : 'too cheap';
        console.log(
          `  ${coeff.toFixed(1).padStart(3)} ${alpha.toFixed(2)} | ${fmt(res.frontier).padStart(13)} | ${(gain >= 0 ? '+' : '') + gain.toFixed(0).padStart(2)} oom | ${pct(s.fuel, spent).padStart(5)} | ${pct(s.fuelStarveTicks, ticks).padStart(7)} | ${taxBitePct(s, res.score).padStart(8)} | ${String(res.trees).padStart(5)} | ${String(s.opsCompleted).padStart(4)} | ${(netFrac >= 0.01 ? netFrac.toFixed(2) : netFrac.toExponential(1)).padStart(16)} | ${verdict}`,
        );
        if (climb && r === rates[0]) {
          const tr = s.trajectory;
          const step = Math.max(1, Math.floor(tr.length / 7));
          const pts: string[] = [];
          for (let i = 0; i < tr.length; i += step) pts.push(fmt(tr[i].frontier));
          pts.push(fmt(res.frontier));
          console.log(`           climb: ${pts.join(' → ')}`);
        }
      }
    }
  }

  console.log(`\n${'─'.repeat(110)}`);
  console.log('  verdict key: TREADMILL = fuel-pressured & still climbing (the goal) · too cheap = tax negligible');
  console.log('               throttled = climb slowed but healthy · too steep = collapsing · STALLED = climb dead');
  console.log('  tax-bite = fuel-magnitude burned ÷ score (how much production is recycled as fuel).');
}

main();
