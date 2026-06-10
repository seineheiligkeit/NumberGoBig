// sim/fuel-forced.ts
//
// "FORCE FUEL EVERYWHERE" — testing the design question: instead of giving small
// production a free pass, can we TAX every multiplier (incl. the fuel factory's
// own) and force the player to PIPE fuel into all of them — a satisfying extra
// automation layer?
//
// We sweep the tax FLOOR (ops with output ≤ floor are free):
//   floor = 1     → every multiplication is taxed (force everything)
//   floor = 1e20  → only the frontier (past the fuel-tree's reach) is taxed
//
// The agent here also HAND-FEEDS the fuel tree's taxed mults from the pool
// (fuelFactory). Hand-feeding is a stand-in for piping: if the action budget
// CAN'T sustain a fully-taxed factory by hand, that's the quantitative argument
// that fuel MUST be piped (the automation layer) — and where it stalls tells us
// how deep hand/throughput can go before the transit-freeze wall.
//
// Watch:
//   frontier   — how high it climbs vs the no-tax baseline
//   unspent%   — leftover APM. ~0 = action-BOUND (can't hand-feed it all → must pipe)
//   starve%    — fuel pressure
//   ops        — factory throughput (are the tree mults even completing?)
//
// Usage:
//   node sim/fuel-forced.ts
//   node sim/fuel-forced.ts --ticks 10000 --C 1 --alpha 0.7 --rates 1,5

import { runManager, type Stats } from './manager.ts';
import { DEFAULT_TUNING, type TimeTuning } from '../core/time.ts';

const fmt = (x: number): string =>
  !Number.isFinite(x) ? '∞' : Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString('en-US');
const pct = (n: number, d: number): string => (d > 0 ? `${((100 * n) / d).toFixed(0)}%` : '0%');
const oom = (x: number): number => (x > 1 && Number.isFinite(x) ? Math.log10(x) : 0);

function main(): void {
  let ticks = 10000;
  let C = 1;
  let alpha = 0.7;
  let rates = [1, 5];
  const floors = [1, 1e2, 1e4, 1e8, 1e16, 1e20];
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--ticks') ticks = Number(a[++i]);
    else if (a[i] === '--C') C = Number(a[++i]);
    else if (a[i] === '--alpha') alpha = Number(a[++i]);
    else if (a[i] === '--rates') rates = a[++i].split(',').map(Number);
  }

  console.log('FORCE-FUEL SWEEP — tax every multiplier above the FLOOR; agent hand-feeds the whole factory.');
  console.log(`C=${C} α=${alpha} · window ${ticks} ticks (${(ticks / 3600).toFixed(1)}h) · floor 1 = force everything, 1e20 = free base.`);
  console.log('unspent%≈0 ⇒ action-BOUND (a hand-fed forced-fuel factory is infeasible → fuel must be PIPED).\n');

  for (const r of rates) {
    const base = runManager(r, ticks, {}); // no tax = current game
    console.log(`${'═'.repeat(104)}`);
    console.log(`  RATE ${r}    (no-tax baseline: frontier ${fmt(base.frontier)}, unspent ${pct(base.stats.unspentTicks, ticks)})`);
    console.log('═'.repeat(104));
    console.log('   floor    | frontier      | vs base | fuel% | starve% | unspent% | ops   | reading');
    console.log('  ----------+---------------+---------+-------+---------+----------+-------+----------------------------');
    for (const floor of floors) {
      const tuning: TimeTuning = { ...DEFAULT_TUNING, fuelTaxCoeff: C, fuelTaxExp: alpha, fuelTaxFloor: floor };
      const res = runManager(r, ticks, { tuning, fuelFactory: true });
      const s: Stats = res.stats;
      const spent = s.feed + s.fuel + s.build || 1;
      const gain = oom(res.frontier) - oom(base.frontier);
      const unspent = s.unspentTicks / ticks;
      const actionBound = unspent < 0.05;
      const climbs = gain > -8;
      const reading = climbs
        ? actionBound ? 'climbs but action-bound' : 'climbs, APM to spare'
        : actionBound ? 'STALLED — action-starved' : 'STALLED — fuel-starved';
      console.log(
        `  ${floor.toExponential(0).padStart(8)} | ${fmt(res.frontier).padStart(13)} | ${(gain >= 0 ? '+' : '') + gain.toFixed(0).padStart(2)} oom | ${pct(s.fuel, spent).padStart(5)} | ${pct(s.fuelStarveTicks, ticks).padStart(7)} | ${pct(s.unspentTicks, ticks).padStart(8)} | ${String(s.opsCompleted).padStart(5)} | ${reading}`,
      );
    }
    console.log('');
  }
  console.log('  If low floors STALL (action-starved) but high floors climb, that\'s the data that');
  console.log('  forced-fuel can\'t be HAND-fed — it has to be PIPED. The floor then sets how much of');
  console.log('  the factory the player must wire for fuel (low = wire everything, the automation layer).');
}

main();
