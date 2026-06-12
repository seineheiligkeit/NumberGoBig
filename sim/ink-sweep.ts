/**
 * THE INK-ERA TUNING SWEEP (`sim/ink-sweep.ts`) — grids the three
 * highest-leverage knobs against THE PLAYER at two paces and scores each
 * configuration against the locked experience targets (2026-06-12, set with
 * the user):
 *
 *   opening      first mult ~3–8 m, exp ~20–35 m, first launch ~30–50 m (1/s)
 *   eras         bursts self-limit at ≤3 launches per 30-min window
 *   idle contract 1/10 pace still launches (≤5 h) and reaches ≥20 digits in 8 h
 *   pace spread  engaged/idle digit ratio in [3, 15]
 *   chores       ink ≤ 30% of actions
 *   progress     ≥100 digits by 4 h engaged
 *
 * Usage: node sim/ink-sweep.ts [--fine] [--grace N]
 *   The coarse grid is writeSpeed {1,2,4} × upkeepCoeff {0.5,1,2} ×
 *   firstBillScale {1,4,16}; --fine narrows around the coarse winners.
 *   Grace (the delayed shock) defaults to 180 ticks for every cell.
 */

import { runPlayer, type PlayerResult } from './player.ts';
import { INK_TUNING, type TimeTuning } from '../core/time.ts';

interface Score {
  ws: number;
  uk: number;
  bt: number;
  // 1/s metrics
  mult: number; // minutes
  exp: number;
  launch: number;
  launches: number;
  burstMax: number; // max launches in any 30-min window
  digits: number;
  covMin: number;
  chore: number; // ink action share
  // 1/10 metrics
  idleLaunch: number;
  idleDigits: number;
  pass: string[]; // failed-target tags (empty = PASS)
}

function digitsOf(r: PlayerResult): number {
  const d = Number(r.digits);
  return Number.isFinite(d) ? d : 1e9; // tower-class counts as huge
}

function burstMax(ticks: number[], window = 1800): number {
  let best = 0;
  for (let i = 0; i < ticks.length; i++) {
    let n = 0;
    for (let j = i; j < ticks.length && ticks[j] - ticks[i] <= window; j++) n++;
    best = Math.max(best, n);
  }
  return best;
}

function evaluate(ws: number, uk: number, bt: number, grace: number): Score {
  const tuning: TimeTuning = {
    ...INK_TUNING,
    writeSpeed: ws,
    upkeepCoeff: uk,
    buildTimeScale: bt,
    upkeepGraceTicks: grace,
  };
  const fast = runPlayer(1, 14400, { tuning });
  const idle = runPlayer(0.1, 28800, { tuning });
  const lm = (r: PlayerResult, k: string): number => (r.landmarks[k] ? r.landmarks[k] / 60 : Infinity);
  const inkActs = fast.actionsBy['ink'] ?? 0;
  const s: Score = {
    ws,
    uk,
    bt,
    mult: lm(fast, 'mult'),
    exp: lm(fast, 'exp'),
    launch: lm(fast, 'launch'),
    launches: fast.launches,
    burstMax: burstMax(fast.launchTicks),
    digits: digitsOf(fast),
    covMin: fast.coverageMin,
    chore: fast.actions > 0 ? inkActs / fast.actions : 0,
    idleLaunch: lm(idle, 'launch'),
    idleDigits: digitsOf(idle),
    pass: [],
  };
  if (s.mult < 3 || s.mult > 8) s.pass.push('mult');
  if (s.exp < 20 || s.exp > 35) s.pass.push('exp');
  if (s.launch < 30 || s.launch > 50) s.pass.push('launch');
  if (s.burstMax > 3) s.pass.push('burst');
  if (s.digits < 100) s.pass.push('progress');
  if (s.chore > 0.3) s.pass.push('chore');
  if (s.idleLaunch > 300) s.pass.push('idle-launch');
  if (s.idleDigits < 20) s.pass.push('idle-digits');
  const spread = s.digits / Math.max(1, s.idleDigits);
  if (spread < 3 || spread > 15) s.pass.push('spread');
  return s;
}

function main(): void {
  const a = process.argv.slice(2);
  const fine = a.includes('--fine');
  let grace = 180;
  const gi = a.indexOf('--grace');
  if (gi >= 0) grace = Number(a[gi + 1]);

  // Round 2: build-time replaces first-bill as the opening lever (bills are
  // labor and compound against idle play); centered on round 1's near-miss
  // (ws 2 · tax 2 · bill 1, failing only "opening too fast").
  const WS = fine ? [2, 2.5, 3] : [2, 3];
  const UK = fine ? [1.75, 2, 2.5] : [1.5, 2, 3];
  const BT = fine ? [3, 4, 5] : [2, 4, 8];

  console.log(`Ink-era sweep (${fine ? 'fine' : 'coarse'} grid, grace ${grace}): write × tax × build-time, Player @ 1/s 4h + 1/10 8h`);
  console.log('  ws · tax · bt |  mult |   exp | launch | n | burst | digits | cov% | chore% | idleL | idleD | verdict');
  const all: Score[] = [];
  for (const ws of WS)
    for (const uk of UK)
      for (const bt of BT) {
        const s = evaluate(ws, uk, bt, grace);
        all.push(s);
        const f = (x: number, w = 5): string => (Number.isFinite(x) ? x.toFixed(1).padStart(w) : '    —');
        console.log(
          `  ${String(ws).padStart(2)} · ${String(uk).padStart(3)} · ${String(bt).padStart(2)} | ${f(s.mult)} | ${f(s.exp)} | ${f(s.launch, 6)} | ${s.launches} | ${String(s.burstMax).padStart(5)} | ${String(s.digits).padStart(6)} | ${String(Math.round(s.covMin * 100)).padStart(4)} | ${String(Math.round(s.chore * 100)).padStart(6)} | ${f(s.idleLaunch)} | ${String(s.idleDigits).padStart(5)} | ${s.pass.length === 0 ? 'PASS' : s.pass.join(',')}`,
        );
      }
  const winners = all.filter((s) => s.pass.length === 0);
  console.log(`\n  ${winners.length}/${all.length} configurations hit every target.`);
  if (winners.length === 0) {
    const ranked = [...all].sort((x, y) => x.pass.length - y.pass.length);
    console.log('  Nearest misses:');
    for (const s of ranked.slice(0, 5))
      console.log(`    ws ${s.ws} · tax ${s.uk} · bt ${s.bt} — missing: ${s.pass.join(', ')}`);
  }
}

if (process.argv[1]?.endsWith('ink-sweep.ts')) main();
