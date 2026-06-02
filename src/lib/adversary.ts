import { Container } from 'pixi.js';
import Decimal from 'break_eternity.js';
import { writable, type Readable } from 'svelte/store';
import {
  valueAdd,
  valueDiv,
  valueIsNegative,
  valueIsZero,
  valueMagnitude,
  valueOf,
  type Value,
} from './value';
import {
  allBlocks,
  allCells,
  comprehensionLevel,
  consumePositiveBlock,
  decreaseStack,
  hasUnlock,
  spendFuel,
} from './world';
import { isPrime, KNOWN_PERFECTS, FAMOUS_NUMBERS } from './classify';
import { showMarginalia } from './marginalia';
import { commitSpawn } from './spawn';
import { emitDust, impulse } from './physics';
import { ACCENT_RED, GRAPHITE } from './colors';
import { drawAntinumber, drawCore, type CoreHandle } from './pixi/antinumber';
import type { BatteryMode } from './pixi/battery-cell';

// ===========================================================================
// V2.1 — The Adversary (DESIGN.md Part II).
//
// An advancing Front of negative "antinumbers" crawls leftward across a
// screen-fixed band toward a defendable Core. The player intercepts them by
// dragging positive blocks onto them (manual defense — automation arrives in
// V2.2). Antinumbers live in their OWN registry, separate from world.ts
// blocks, so they never touch Total Score (recompute() ignores them); only a
// future Negate weapon converts one into a player block.
//
// The Adversary onsets at the Subtraction unlock — the first calm minutes
// stay a pure builder, and the tool that reveals negatives is the same tool
// that begins the fight.
//
// V2.1 scope: spawn / advance / Core damage / manual cancel + a stubbed
// setback. Frontier-scaled magnitudes, batteries, the real band-erase
// setback, bosses, and persistence are later slices (V2.2–V2.5). Antinumbers
// and Core HP are in-memory only this slice — they reset on reload (no save
// schema change until V2.5).
// ===========================================================================

const ONSET_UNLOCK = 'subtraction';

const CORE_HP_BASE = 24; // Core HP per frontier tier (V2.3 — scales with comp)
const CORE_FORTIFY_STEP = 20; // HP added per Core-fortification purchase (V2.5)
const CORE_X = 52; // px from the left screen edge
const FRONT_Y = 132; // px from the top — a band mirroring the river at the bottom
const FRONT_Y_JITTER = 44;
const RAMPART_X = CORE_X + 78; // V3: antinumbers clash with the Shield here
const IMPACT_X = CORE_X + 28; // ...and damage Core HP here if the Shield fails

const FEED_COOLDOWN_MS = 800; // V3: Rampart feeder pulls one block this often
// Auto-feed maintains the Shield up to this multiple of the Core's max HP
// (which scales with the frontier). Past it, Ramparts idle rather than drain
// the pool — bounding the defense tax and keeping currency free for growth.
// Manual feed is uncapped (a deliberate big commitment is the player's call).
const SHIELD_TARGET_MULT = 4;
const SPAWN_INTERVAL_MS = 4200; // cadence between routine spawns (the lull)
const BURST_SPAWN_MS = 900; // cadence inside a wave burst
const WAVE_PERIOD_MS = 22000; // time between wave bursts
const WAVE_SIZE = 4; // antinumbers released per burst
const ANTI_SPEED = 28; // px/sec leftward
const HIT_RADIUS = 42; // manual-cancel drop tolerance
const FEED_DROP_RADIUS = 78; // drop a positive this near the Core to feed the Shield

// V2.4 bosses — predicate-flavoured heavyweights on a slow timer. Each
// forces a different answer (a prime can't be divided; a power of two
// halves cleanly). Magnitude is capped near the Core's HP so a boss is a
// real "stop it before it lands" threat, not an instant loss.
const BOSS_PERIOD_MS = 60000;
const BOSS_SPEED = 17; // slower than the routine wave — there's time to react
const BOSS_MAG_VS_CORE = 1.5; // boss magnitude ≈ this × Core max HP

// V2.3 setback — on Core collapse the Front overruns and erases a band of
// the player's loose blocks, then the wave pauses while they regroup.
const SETBACK_PAUSE_MS = 9000;
const SETBACK_ERASE_FRACTION = 0.25;

const BATTERY_COOLDOWN_MS = 1500; // cadence between battery shots
const BATTERY_RETRY_MS = 300; // re-check soon when a shot is ammo-blocked
const DIVIDE_BY = new Decimal(2); // divide-battery softens by halving

type BossKind = 'prime' | 'pow2' | 'perfect' | 'famous';

interface Antinumber {
  id: number;
  value: Value; // always negative
  container: Container;
  x: number;
  y: number;
  speed: number;
  /** V2.4 boss flavour (undefined for the routine wave). */
  boss?: BossKind;
  /** V2.4 — prime bosses can't be evenly divided; divide-batteries no-op. */
  indivisible?: boolean;
}

const antinumbers: Antinumber[] = [];
let nextId = 1;
let spawnTimer = SPAWN_INTERVAL_MS;
let waveCountdown = WAVE_PERIOD_MS;
let burstRemaining = 0;
let bossCountdown = BOSS_PERIOD_MS;
let pauseMs = 0; // > 0 while a setback suspends the wave

let core: CoreHandle | null = null;
let coreHp = 0; // set to coreMaxHp() in setupCore
let totalSetbacks = 0; // count of Core collapses (telemetry / future stats HUD)

/** Number of Core collapses (setbacks) this run. */
export function setbackCount(): number {
  return totalSetbacks;
}
let fortifyTiers = 0; // V2.5 Core-fortification purchases
let frontLayerRef: Container | null = null;

// V3: the Shield — committed positive magnitude (the "army") that antinumbers
// clash into at the Rampart before they can reach Core HP.
let shield = Decimal.dZero;

const _coreHp = writable<number>(0);
/** Reactive Core HP — for a future HUD; the Core visual also shows it. */
export const coreHp$: Readable<number> = _coreHp;

const _shield = writable<string>('0');
/** Reactive Shield magnitude (formatted) — for a future HUD. */
export const shield$: Readable<string> = _shield;

/** Compact magnitude formatting for the Shield readout. */
function fmtMag(d: Decimal): string {
  if (d.lte(0)) return '0';
  if (d.lt(1e6)) return Math.round(d.toNumber()).toLocaleString('en-US');
  return d.toExponential(2);
}

function refreshShield(): void {
  core?.setShield(shield.gt(0) ? fmtMag(shield) : '');
  _shield.set(fmtMag(shield));
}

/**
 * V3 — feed the Shield with a produced positive value (the army). Called by
 * the manual drop path and the Rampart feeder. Negatives/zeros are ignored.
 */
export function feedShield(value: Value, count = 1): boolean {
  if (valueIsNegative(value) || valueIsZero(value)) return false;
  shield = shield.add(valueMagnitude(value).mul(count));
  refreshShield();
  return true;
}

/** Frontier tier from the comprehension ceiling (≈ log₂). Min 1. */
function frontierTier(): number {
  return Math.max(1, Math.round(Math.log2(Math.max(2, comprehensionLevel()))));
}

/** Core HP ceiling — scales with the frontier so difficulty stays
 *  proportionate (the sim's frontier-invariance, in game units), plus any
 *  Core-fortification purchased from the Defense branch (V2.5). */
function coreMaxHp(): number {
  return CORE_HP_BASE * frontierTier() + fortifyTiers * CORE_FORTIFY_STEP;
}

/** V2.5 — Defense Literature: fortify the Core (raise its HP ceiling and
 *  top it up immediately). Called from `literature.ts:purchase`. */
export function fortifyCore(): void {
  fortifyTiers += 1;
  coreHp += CORE_FORTIFY_STEP;
  core?.setHp(coreHp, coreMaxHp());
  _coreHp.set(coreHp);
}

/** Persisted Adversary state (V2.5 save schema v18; V3 adds the Shield). */
export function snapshotAdversary(): { coreHp: number; fortifyTiers: number; shield: string } {
  return { coreHp, fortifyTiers, shield: shield.toString() };
}

export function restoreAdversary(s: { coreHp?: number; fortifyTiers?: number; shield?: string }): void {
  fortifyTiers = s.fortifyTiers ?? 0;
  if (typeof s.coreHp === 'number' && s.coreHp > 0) coreHp = s.coreHp;
  if (s.shield) shield = new Decimal(s.shield);
  core?.setHp(coreHp, coreMaxHp());
  _coreHp.set(coreHp);
  refreshShield();
}

/** A frontier-appropriate antinumber magnitude: roughly [tier, 3·tier]. */
function waveMagnitude(): number {
  const tier = frontierTier();
  return Math.max(2, Math.round(tier * (1 + Math.random() * 2)));
}

/**
 * Installs the Core into the (screen-fixed) front layer. Hidden until the
 * Adversary onsets at the Subtraction unlock.
 */
export function setupCore(frontLayer: Container): void {
  frontLayerRef = frontLayer;
  // Keep a restored HP (restoreAdversary runs first); only initialise fresh.
  if (coreHp <= 0) coreHp = coreMaxHp();
  _coreHp.set(coreHp);
  core = drawCore();
  core.container.x = CORE_X;
  core.container.y = FRONT_Y;
  core.container.visible = hasUnlock(ONSET_UNLOCK);
  core.setHp(coreHp, coreMaxHp());
  refreshShield();
  frontLayer.addChild(core.container);
}

/**
 * Per-frame Adversary tick. Spawns on cadence, advances each antinumber
 * leftward, and damages the Core on impact. Ordered before `tickPipes` in the
 * main loop. Cheap no-op until the onset unlock.
 */
export function tickAntinumbers(dtMs: number, frontLayer: Container, screenW: number): void {
  const active = hasUnlock(ONSET_UNLOCK);
  if (core) core.container.visible = active;
  if (!active) return;

  // Setback pause: the wave is suspended while the player regroups.
  if (pauseMs > 0) {
    pauseMs -= dtMs;
    core?.setHp(coreHp, coreMaxHp());
    return;
  }

  // Wave scheduler: a periodic burst of WAVE_SIZE on top of the routine
  // trickle — lulls punctuated by pressure spikes.
  waveCountdown -= dtMs;
  if (waveCountdown <= 0) {
    waveCountdown += WAVE_PERIOD_MS;
    burstRemaining += WAVE_SIZE;
  }

  spawnTimer -= dtMs;
  if (spawnTimer <= 0) {
    spawnTimer += burstRemaining > 0 ? BURST_SPAWN_MS : SPAWN_INTERVAL_MS;
    spawnAntinumber(frontLayer, screenW);
    if (burstRemaining > 0) burstRemaining -= 1;
  }

  // Boss timer: a slow, heavy, predicate-flavoured arrival.
  bossCountdown -= dtMs;
  if (bossCountdown <= 0) {
    bossCountdown += BOSS_PERIOD_MS;
    spawnBoss(frontLayer, screenW);
  }

  const dt = dtMs / 1000;
  for (let i = antinumbers.length - 1; i >= 0; i--) {
    const a = antinumbers[i];
    a.x -= a.speed * dt;
    a.container.x = a.x;

    // V3 — the clash: the Shield (your army) meets the antinumber at the
    // Rampart and annihilates it 1:1 by magnitude.
    if (a.x <= RAMPART_X && shield.gt(0)) {
      const mag = valueMagnitude(a.value);
      if (shield.gte(mag)) {
        shield = shield.sub(mag);
        refreshShield();
        clashAt(a.x, a.y); // the army meets the correction — eraser-shavings + recoil
        removeAt(i); // fully annihilated against the army
        continue;
      }
      // Shield spent: it chips the antinumber, which carries on toward the Core.
      const reduced = valueAdd(a.value, valueOf(shield));
      shield = Decimal.dZero;
      refreshShield();
      if (frontLayerRef) emitDust(frontLayerRef, a.x, a.y, { count: 4, speed: 60 }); // a small chip puff
      weaken(a, reduced);
    }

    if (a.x <= IMPACT_X) {
      // A setback clears the whole Front (clearAll) and pauses the wave, so
      // stop iterating — `antinumbers` is now empty and `a` is already gone.
      if (damageCore(toThreat(a.value))) break;
      removeAt(i);
    }
  }
  core?.setHp(coreHp, coreMaxHp());
}

/**
 * Manual defense: a positive block dropped onto an antinumber is added into
 * it (DESIGN §V2.4 Add weapon). If the result is ≥ 0 the antinumber is
 * annihilated; otherwise it is weakened. Returns true if the drop was
 * consumed as ammo (so the caller does not place the block).
 *
 * `sx, sy` are screen-relative coordinates — the front layer is screen-fixed
 * and un-transformed, so they compare directly to antinumber positions.
 */
export function tryCancelAntinumberAt(sx: number, sy: number, incoming: Value): boolean {
  if (!hasUnlock(ONSET_UNLOCK)) return false;
  if (valueIsNegative(incoming) || valueIsZero(incoming)) return false; // need positive ammo

  let hit = -1;
  let best = HIT_RADIUS;
  for (let i = 0; i < antinumbers.length; i++) {
    const a = antinumbers[i];
    const d = Math.hypot(a.x - sx, a.y - sy);
    if (d <= best) {
      best = d;
      hit = i;
    }
  }
  if (hit < 0) return false;

  const a = antinumbers[hit];
  const result = valueAdd(a.value, incoming);

  if (!valueIsNegative(result)) {
    // Annihilated. (Spilling the positive remainder into the economy is a
    // V2.2 concern, once batteries land.)
    showMarginalia(
      'Struck through, then struck out. The correction is neutralised.',
      'adversary_first_cancel',
    );
    clashAt(a.x, a.y, ACCENT_RED, true); // a hand-placed cancel gets a fuller burst
    removeAt(hit);
  } else {
    // Weakened — redraw at the new (smaller) magnitude.
    weaken(a, result);
  }
  return true;
}

/**
 * V3 manual feed: a positive block dropped near the Core is committed to the
 * Shield (the army). Returns true if consumed. Screen-relative coords.
 */
export function tryFeedShieldAt(sx: number, sy: number, value: Value, count = 1): boolean {
  if (!hasUnlock(ONSET_UNLOCK)) return false;
  if (valueIsNegative(value) || valueIsZero(value)) return false;
  if (Math.hypot(sx - CORE_X, sy - FRONT_Y) > FEED_DROP_RADIUS) return false;
  feedShield(value, count);
  showMarginalia('Committed to the line. The Shield holds your number.', 'adversary_first_feed');
  return true;
}

/**
 * Game-feel: the impact of an antinumber being annihilated — a burst of
 * eraser-shavings at the point of contact and a recoil of the Core (the army
 * absorbed the hit). Red for a destroyed correction; graphite for a Negate
 * conversion (it becomes your wealth). `big` for a fuller burst.
 */
function clashAt(x: number, y: number, color: number = ACCENT_RED, big = false): void {
  if (frontLayerRef) {
    emitDust(frontLayerRef, x, y, { color, count: big ? 11 : 8, speed: big ? 105 : 88 });
  }
  if (core) impulse(core.container, -90, 16); // recoil left+down (enemies come from the right)
}

/** Replace an antinumber's value and redraw its (smaller) numeral in place. */
function weaken(a: Antinumber, value: Value): void {
  a.value = value;
  const parent = frontLayerRef ?? a.container.parent;
  a.container.destroy({ children: true });
  const nc = drawAntinumber(value);
  nc.x = a.x;
  nc.y = a.y;
  parent?.addChild(nc);
  a.container = nc;
}

/** Index of the antinumber nearest the Core (front-most). -1 if none. */
function frontMostIndex(): number {
  let idx = -1;
  let minX = Infinity;
  for (let i = 0; i < antinumbers.length; i++) {
    if (antinumbers[i].x < minX) {
      minX = antinumbers[i].x;
      idx = i;
    }
  }
  return idx;
}

/**
 * V2.2 — automated defense. Each battery fires on its cadence at the
 * front-most antinumber, pulling ammo from the pool (loose blocks +
 * warehouses) via `spendFuel`, exactly like operator fuel — no wiring.
 *
 *   add    — a single block ≥ the target's magnitude annihilates it.
 *   divide — a small block (≥ 2) halves the target (the cheap softener).
 *   negate — a small block (≥ 1) flips the target into a positive block
 *            spawned at the battery (the "error becomes an asset" convert).
 */
export function tickBatteries(dtMs: number, canvasLayer: Container): void {
  if (!hasUnlock(ONSET_UNLOCK)) return;

  for (const cell of allCells()) {
    if (cell.type !== 'battery') continue;
    const mode = cell.batteryMode ?? 'add';
    const cd = (cell.batteryCooldownRemaining ?? 0) - dtMs;
    if (cd > 0) {
      cell.batteryCooldownRemaining = cd;
      continue;
    }

    // V3 Rampart feeder: convert a pool block into Shield (the army). Runs
    // whether or not the Front is currently populated, so the Shield builds
    // up between waves — but only up to a frontier-proportional target, so it
    // doesn't drain the whole pool into a wastefully oversized Shield. Once
    // the Shield is topped up, overflow REPAIRS the Core (a well-supplied
    // line slowly heals); when both are full the feeder idles.
    if (mode === 'feed') {
      const shieldFull = shield.gte(coreMaxHp() * SHIELD_TARGET_MULT);
      if (shieldFull && coreHp >= coreMaxHp()) {
        cell.batteryCooldownRemaining = FEED_COOLDOWN_MS; // both full — idle
        continue;
      }
      const v = consumePositiveBlock();
      if (v === null) {
        cell.batteryCooldownRemaining = BATTERY_RETRY_MS;
        continue;
      }
      if (shieldFull) repairCore(valueMagnitude(v).toNumber());
      else feedShield(v);
      cell.batteryCooldownRemaining = FEED_COOLDOWN_MS;
      continue;
    }

    // Combat batteries are ARTILLERY: they only engage a threat the Shield
    // (the army) won't absorb on its own — the front-most antinumber whose
    // magnitude exceeds the current Shield. When the Shield is healthy and
    // the wave is small, artillery holds fire (no wasted overkill); it kicks
    // in for breaches and bosses. (Per sim/throughput.ts: army carries the
    // bulk, artillery picks off what it can't.)
    const fm = frontMostIndex();
    if (fm < 0 || shield.gte(valueMagnitude(antinumbers[fm].value))) {
      cell.batteryCooldownRemaining = BATTERY_RETRY_MS;
      continue;
    }
    const fired = fireBattery(mode, cell.container.x, cell.container.y, canvasLayer);
    cell.batteryCooldownRemaining = fired ? BATTERY_COOLDOWN_MS : BATTERY_RETRY_MS;
  }
}

function fireBattery(mode: BatteryMode, cx: number, cy: number, canvasLayer: Container): boolean {
  const idx = frontMostIndex();
  if (idx < 0) return false;
  const a = antinumbers[idx];
  const mag = valueMagnitude(a.value);

  if (mode === 'add') {
    // Finisher: needs one positive block big enough to neutralise the target.
    if (!spendFuel(mag)) return false;
    clashAt(a.x, a.y, ACCENT_RED, true); // artillery hit — fuller burst
    removeAt(idx);
    return true;
  }

  if (mode === 'divide') {
    // Softener: a small block halves the target. Prime bosses (V2.4) resist.
    if (a.indivisible) return false;
    if (!spendFuel(DIVIDE_BY)) return false;
    weaken(a, valueDiv(a.value, valueOf(DIVIDE_BY)));
    return true;
  }

  // negate: convert the attacker into a positive block (wealth + ammo).
  if (!spendFuel(new Decimal(1))) return false;
  commitSpawn({ kind: 'new', x: cx, y: cy - 48 }, valueOf(mag), canvasLayer);
  clashAt(a.x, a.y, GRAPHITE); // conversion — graphite dust (it becomes yours)
  removeAt(idx);
  return true;
}

// ---------------------------------------------------------------------------
// Internals.
// ---------------------------------------------------------------------------

function spawnAntinumber(frontLayer: Container, screenW: number): void {
  const value = valueOf(-waveMagnitude());
  const x = screenW + 30;
  const y = FRONT_Y + (Math.random() - 0.5) * FRONT_Y_JITTER;

  const container = drawAntinumber(value);
  container.x = x;
  container.y = y;
  frontLayer.addChild(container);

  antinumbers.push({ id: nextId++, value, container, x, y, speed: ANTI_SPEED });
}

// ---------------------------------------------------------------------------
// V2.4 bosses — predicate-flavoured heavyweights.
// ---------------------------------------------------------------------------

function spawnBoss(frontLayer: Container, screenW: number): void {
  const spec = pickBoss();
  const x = screenW + 40;
  const y = FRONT_Y;

  const container = drawAntinumber(spec.value, { boss: true, label: spec.label });
  container.x = x;
  container.y = y;
  frontLayer.addChild(container);

  antinumbers.push({
    id: nextId++,
    value: spec.value,
    container,
    x,
    y,
    speed: BOSS_SPEED,
    boss: spec.kind,
    indivisible: spec.indivisible,
  });

  showMarginalia(`A correction of note approaches — ${spec.label}.`, `adversary_boss_${spec.kind}`);
}

interface BossSpec {
  value: Value;
  kind: BossKind;
  label: string;
  indivisible: boolean;
}

function pickBoss(): BossSpec {
  const cap = Math.max(8, Math.round(coreMaxHp() * BOSS_MAG_VS_CORE));
  const kinds: BossKind[] = ['pow2', 'prime', 'perfect', 'famous'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];

  let mag = 6;
  let label: string = kind;
  let indivisible = false;

  switch (kind) {
    case 'pow2':
      mag = 1 << Math.max(2, Math.floor(Math.log2(cap)));
      label = 'a power of two (halves cleanly)';
      break;
    case 'prime':
      mag = nearestPrimeAtMost(cap);
      indivisible = true;
      label = 'prime — division will not divide it';
      break;
    case 'perfect':
      mag = largestAtMost(KNOWN_PERFECTS, cap) ?? 6;
      label = 'a perfect number';
      break;
    case 'famous': {
      const f = famousAtMost(cap);
      mag = f.value;
      label = f.label;
      break;
    }
  }

  return { value: valueOf(-Math.max(2, mag)), kind, label, indivisible };
}

function nearestPrimeAtMost(cap: number): number {
  for (let k = Math.floor(cap); k >= 2; k--) {
    if (isPrime(valueOf(k))) return k;
  }
  return 2;
}

function largestAtMost(list: readonly number[], cap: number): number | null {
  let best: number | null = null;
  for (const v of list) {
    if (v <= cap && (best === null || v > best)) best = v;
  }
  return best;
}

function famousAtMost(cap: number): { value: number; label: string } {
  let best = { value: 42, label: 'forty-two' };
  let bestV = -1;
  for (const f of FAMOUS_NUMBERS) {
    if (f.value >= 2 && f.value <= cap && f.value > bestV) {
      bestV = f.value;
      best = { value: f.value, label: f.label };
    }
  }
  return best;
}

/** Antinumber magnitude as a Number for HP math. */
function toThreat(value: Value): number {
  const n = valueMagnitude(value).toNumber();
  return Number.isFinite(n) ? n : coreMaxHp(); // unrenderable enemy = a full breach
}

/** V3 — repair Core HP (Rampart overflow when the Shield is topped up). */
function repairCore(amount: number): void {
  if (coreHp >= coreMaxHp()) return;
  coreHp = Math.min(coreMaxHp(), coreHp + amount);
  core?.setHp(coreHp, coreMaxHp());
  _coreHp.set(coreHp);
}

/** Returns true if the hit collapsed the Core and fired a setback (which
 *  clears the Front), so callers iterating `antinumbers` must stop. */
function damageCore(amount: number): boolean {
  coreHp -= amount;
  let setback = false;
  if (coreHp <= 0) {
    triggerSetback();
    setback = true;
  }
  core?.setHp(coreHp, coreMaxHp());
  _coreHp.set(coreHp);
  return setback;
}

/**
 * V2.3 setback. The Front overruns the Core: a band of the player's loose
 * blocks is erased (the cheapest-to-rebuild stacks, so trophies survive),
 * the Front is cleared, the wave pauses, and the Core is rebuilt. Real
 * stakes, fully recoverable, no run loss.
 */
function triggerSetback(): void {
  showMarginalia(
    'The line broke. The grader overruns your work and erases a band of it. The wave pauses while you regroup.',
    'adversary_setback',
  );
  eraseBand();
  clearAll();
  pauseMs = SETBACK_PAUSE_MS;
  coreHp = coreMaxHp();
  totalSetbacks += 1;
}

/** Erase the lowest-magnitude fraction of loose blocks (least painful). */
function eraseBand(): void {
  const loose = [...allBlocks()];
  const n = Math.floor(loose.length * SETBACK_ERASE_FRACTION);
  if (n <= 0) return;
  loose.sort((a, b) => valueMagnitude(a.value).cmp(valueMagnitude(b.value)));
  for (let i = 0; i < n; i++) decreaseStack(loose[i], loose[i].count);
}

function removeAt(i: number): void {
  const a = antinumbers[i];
  a.container.destroy({ children: true });
  antinumbers.splice(i, 1);
}

function clearAll(): void {
  for (const a of antinumbers) a.container.destroy({ children: true });
  antinumbers.length = 0;
}
