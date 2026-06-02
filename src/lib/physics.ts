import { Container, Graphics } from 'pixi.js';
import { ACCENT_RED } from './colors';

// ===========================================================================
// Light physics / game-feel layer (DESIGN §17 — "the timing of a calm,
// confident hand"). Two tiny, reusable, VISUAL-ONLY systems stepped from the
// main ticker:
//
//   1. Dust particles — short pencil/eraser specks flung on an impact, with
//      velocity + gravity + spin + fade. On-theme: it's pencil dust.
//   2. Spring offsets — a critically-damped spring that nudges a container's
//      position around its resting base. Apply an `impulse` (a kick of
//      velocity) and it recoils, then settles. Reusable for recoil now and
//      drop-settle / drag-weight later.
//
// Both are PURELY cosmetic — game logic (hit-testing, ports, merge radii)
// always uses logical positions; these only jiggle the rendered transform and
// restore it exactly. Bodies sleep when settled, so a page of resting blocks
// costs nothing.
// ===========================================================================

/** Global intensity scalar. 1.0 = "tasteful pop". Lower → subtler. */
export const JUICE = 1.0;

const MAX_PARTICLES = 160;

// --------------------------------------------------------------------------
// Dust particles.
// --------------------------------------------------------------------------
interface Particle {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  gravity: number;
  life: number;
  max: number;
}
const particles: Particle[] = [];

interface DustOpts {
  count?: number;
  color?: number;
  speed?: number; // px/sec initial burst
  gravity?: number; // px/sec²
  life?: number; // ms
  size?: number; // base shaving length px
}

/** Fling a small burst of specks from (x, y) on `layer`. */
export function emitDust(layer: Container, x: number, y: number, opts: DustOpts = {}): void {
  const {
    count = 8,
    color = ACCENT_RED,
    speed = 80,
    gravity = 200,
    life = 450,
    size = 4,
  } = opts;
  const n = Math.max(1, Math.round(count * JUICE));
  for (let i = 0; i < n; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.45 + Math.random()) * JUICE;
    const g = new Graphics();
    const len = size * (0.5 + Math.random());
    g.rect(-len / 2, -0.8, len, 1.6).fill({ color, alpha: 0.9 });
    g.x = x;
    g.y = y;
    g.rotation = Math.random() * Math.PI;
    layer.addChild(g);
    particles.push({
      g,
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 30, // slight upward bias, gravity pulls back
      rot: g.rotation,
      spin: (Math.random() - 0.5) * 12,
      gravity,
      life,
      max: life,
    });
  }
}

// --------------------------------------------------------------------------
// Spring offsets (recoil / settle).
// --------------------------------------------------------------------------
// Two independent spring maps so a scale punch never writes position (which
// would fight a concurrent drag) and a position impulse never writes scale.
interface PosSpring { baseX: number; baseY: number; ox: number; oy: number; vx: number; vy: number; }
interface ScaleSpring { baseS: number; os: number; vs: number; }
const posSprings = new Map<Container, PosSpring>();
const scaleSprings = new Map<Container, ScaleSpring>();

// Stiffness / damping. D just under critical (2√K ≈ 31 for K=240) gives a
// tiny overshoot — the "pop" — then a quick settle (~250ms).
const SPRING_K = 240;
const SPRING_D = 27;
const SETTLE_EPS = 0.05;

/**
 * Add a velocity impulse to a container's spring offset (it recoils from its
 * resting base, then springs back). Impulses accumulate and damp naturally,
 * so rapid hits read as a sustained jitter rather than a stuck offset.
 */
export function impulse(c: Container, ix: number, iy: number): void {
  let s = posSprings.get(c);
  if (!s) {
    s = { baseX: c.x, baseY: c.y, ox: 0, oy: 0, vx: 0, vy: 0 };
    posSprings.set(c, s);
  }
  s.vx += ix * JUICE;
  s.vy += iy * JUICE;
}

/**
 * A scale "pop": kick the container's scale spring so it bumps up (or down)
 * and settles back to rest. Used for drop-settle and stack-merge. Scale-only,
 * so it never moves the logical (hit-tested) position of a block.
 */
export function punch(c: Container, amount: number): void {
  let s = scaleSprings.get(c);
  if (!s) {
    s = { baseS: c.scale.x, os: 0, vs: 0 };
    scaleSprings.set(c, s);
  }
  s.vs += amount * JUICE;
}

// --------------------------------------------------------------------------
// Drag-weight: a container that trails a moving target with a little lag and
// leans into its motion. Safe to move the position directly — this is only
// used on the transient drag *ghost*, which is never hit-tested (the drop
// snaps to the cursor, not the ghost).
// --------------------------------------------------------------------------
interface Follow { tx: number; ty: number; vx: number; vy: number; baseRot: number; }
const follows = new Map<Container, Follow>();

const FOLLOW_K = 900; // stiffness — higher = less lag (weightier "snap")
const FOLLOW_D = 56; // damping (near critical for K=900)
const LEAN = 0.0002; // rad of tilt per px/sec of horizontal velocity
const MAX_LEAN = 0.13; // clamp the tilt

/** Make `c` trail `(tx, ty)` with weight; call each time the target moves. */
export function follow(c: Container, tx: number, ty: number): void {
  const f = follows.get(c);
  if (!f) follows.set(c, { tx, ty, vx: 0, vy: 0, baseRot: c.rotation });
  else {
    f.tx = tx;
    f.ty = ty;
  }
}

/** Stop a drag-follow (on release/cancel) — MUST be called before the ghost
 *  becomes a placed (hit-tested) block. Restores the resting rotation so a
 *  block released mid-lean doesn't stay tilted. */
export function unfollow(c: Container): void {
  const f = follows.get(c);
  if (f && !c.destroyed) c.rotation = f.baseRot;
  follows.delete(c);
}

// --------------------------------------------------------------------------
// Tick — step both systems. Called from the main ticker.
// --------------------------------------------------------------------------
export function tickPhysics(dtMs: number): void {
  const dt = Math.min(0.05, dtMs / 1000); // clamp big frame gaps

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += p.gravity * JUICE * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    p.life -= dtMs;
    const a = Math.max(0, p.life / p.max);
    p.g.x = p.x;
    p.g.y = p.y;
    p.g.rotation = p.rot;
    p.g.alpha = a * 0.9;
    if (p.life <= 0) {
      p.g.parent?.removeChild(p.g);
      p.g.destroy();
      particles.splice(i, 1);
    }
  }

  for (const [c, s] of posSprings) {
    // A spring's container may have been destroyed (e.g. a punched block
    // consumed by a pipe) — drop it before touching its (now-null) transform.
    if (c.destroyed) {
      posSprings.delete(c);
      continue;
    }
    s.vx += (-SPRING_K * s.ox - SPRING_D * s.vx) * dt;
    s.vy += (-SPRING_K * s.oy - SPRING_D * s.vy) * dt;
    s.ox += s.vx * dt;
    s.oy += s.vy * dt;
    if (
      Math.abs(s.ox) < SETTLE_EPS && Math.abs(s.oy) < SETTLE_EPS &&
      Math.abs(s.vx) < SETTLE_EPS && Math.abs(s.vy) < SETTLE_EPS
    ) {
      c.x = s.baseX;
      c.y = s.baseY;
      posSprings.delete(c);
      continue;
    }
    c.x = s.baseX + s.ox;
    c.y = s.baseY + s.oy;
  }

  for (const [c, s] of scaleSprings) {
    if (c.destroyed) {
      scaleSprings.delete(c);
      continue;
    }
    s.vs += (-SPRING_K * s.os - SPRING_D * s.vs) * dt;
    s.os += s.vs * dt;
    if (Math.abs(s.os) < SETTLE_EPS && Math.abs(s.vs) < SETTLE_EPS) {
      c.scale.set(s.baseS);
      scaleSprings.delete(c);
      continue;
    }
    c.scale.set(s.baseS * (1 + s.os));
  }

  for (const [c, f] of follows) {
    if (c.destroyed) {
      follows.delete(c);
      continue;
    }
    // Spring the ghost toward the cursor target (the lag = weight)...
    f.vx += (FOLLOW_K * (f.tx - c.x) - FOLLOW_D * f.vx) * dt;
    f.vy += (FOLLOW_K * (f.ty - c.y) - FOLLOW_D * f.vy) * dt;
    c.x += f.vx * dt;
    c.y += f.vy * dt;
    // ...and lean into the horizontal motion, returning to rest when still.
    const lean = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, f.vx * LEAN * JUICE));
    c.rotation = f.baseRot + lean;
  }
}
