/**
 * Juice — a lean, VISUAL-ONLY game-feel layer (P1.2).
 *
 * Decoupled from the simulation: game logic always uses logical positions; this
 * only jiggles the *rendered* transform and restores it. The engine never sees
 * it. Two spring DOFs that are safe to apply to containers the view repositions
 * every frame (sync only sets `.position`, so `.scale` and `.rotation` are free):
 *
 *   - **punch** — a scale pop that settles back to 1 (slightly underdamped, so
 *     it overshoots a touch — the "pop"). Scale-only, so it never moves a
 *     block's logical / hit-tested position.
 *   - **lean** — a rotation kick that settles back to 0 (for later: drag-lean).
 *
 * Plus **dust** — graphite "shavings": small particles with velocity + gravity
 * that fade out, living in a world-space FX layer.
 *
 * Everything is gated by a global `JUICE` intensity scalar (0 disables it —
 * wired to prefers-reduced-motion at setup). `step(dtMs)` is called from the
 * ticker in REAL time (independent of the sim's tick rate / pause). Springs and
 * particles guard against destroyed containers — a punched block can be consumed
 * before its spring settles.
 */

import { Container, Graphics } from 'pixi.js';
import { GRAPHITE } from '../colors';

let JUICE = 1;
/** Set the global juice intensity (0 = off). Wired to reduced-motion at setup. */
export function setJuice(n: number): void {
  JUICE = Math.max(0, n);
}

const STIFF = 22; // spring angular frequency (ω)
const ZETA = 0.55; // damping ratio (<1 → a little overshoot = the pop)
const GRAVITY = 240; // px/s² on dust
const MAX_DUST = 400; // hard cap so a fast/zoomed factory can't flood particles
const ERASER_PINK = 0xd99a9a; // the notebook eraser — diegetic, instantly readable

interface Spring {
  scale: number;
  scaleVel: number;
  rot: number;
  rotVel: number;
}

interface Dust {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
  alpha: number;
}

/** A generic timed tween (0→1 over `dur` seconds), for one-shot FX like the
 *  eraser sweep. `fn(k)` runs each step; `done()` once at the end. */
interface Anim {
  t: number;
  dur: number;
  fn: (k: number) => void;
  done?: () => void;
}

export interface JuiceLayer {
  /** Scale-pop a container (settles to 1). Safe on synced containers. */
  punch(target: Container, amount?: number): void;
  /** Rotation-kick a container (settles to 0). Safe on synced containers. */
  lean(target: Container, angle: number): void;
  /** Spray graphite shavings at a world-space point. */
  burst(x: number, y: number, count?: number, spread?: number): void;
  /** Play an eraser scrub over a world-space box: a pink eraser sweeps across,
   *  shedding shavings, and leaves a fading graphite smudge. */
  eraser(x: number, y: number, halfW: number, halfH: number): void;
  /** A milestone flourish at a world-space point: an expanding ring + a generous
   *  spray of shavings. The "numbers go BIG" celebratory beat. */
  flash(x: number, y: number): void;
  /** Advance springs + particles by real elapsed ms. Call from the ticker. */
  step(dtMs: number): void;
  destroy(): void;
}

export function createJuice(fxLayer: Container): JuiceLayer {
  const springs = new Map<Container, Spring>();
  const dust: Dust[] = [];
  const anims: Anim[] = [];
  const tween = (dur: number, fn: (k: number) => void, done?: () => void): void => {
    anims.push({ t: 0, dur, fn, done });
  };

  const springOf = (t: Container): Spring => {
    let s = springs.get(t);
    if (!s) {
      s = { scale: 1, scaleVel: 0, rot: 0, rotVel: 0 };
      springs.set(t, s);
    }
    return s;
  };

  return {
    punch(target, amount = 0.22) {
      if (JUICE <= 0 || target.destroyed) return;
      const s = springOf(target);
      s.scale = 1 + amount * JUICE; // displace; the spring eases it home with a small overshoot
      s.scaleVel = 0;
    },

    lean(target, angle) {
      if (JUICE <= 0 || target.destroyed) return;
      springOf(target).rotVel += angle * JUICE;
    },

    burst(x, y, count = 6, spread = 60) {
      if (JUICE <= 0) return;
      const n = Math.round(count * JUICE);
      for (let i = 0; i < n && dust.length < MAX_DUST; i++) {
        const g = new Graphics();
        const r = 0.8 + Math.random() * 1.4;
        g.circle(0, 0, r).fill({ color: GRAPHITE, alpha: 0.7 });
        g.position.set(x, y);
        fxLayer.addChild(g);
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6; // mostly up, fanned
        const sp = spread * (0.4 + Math.random() * 0.6);
        dust.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 0.35 + Math.random() * 0.25, alpha: 0.7 });
      }
    },

    eraser(x, y, halfW, halfH) {
      if (JUICE <= 0) return;
      // The eraser sweeps across the box, sheds shavings, leaves a smudge.
      const ew = 24;
      const eh = 16;
      const er = new Graphics();
      er.roundRect(-ew / 2, -eh / 2, ew, eh, 3).fill({ color: ERASER_PINK, alpha: 0.92 });
      er.roundRect(-ew / 2, -eh / 2, ew, eh * 0.4, 3).fill({ color: 0xffffff, alpha: 0.35 }); // ferrule highlight
      fxLayer.addChild(er);
      const smudge = new Graphics();
      fxLayer.addChild(smudge);
      const x0 = x - halfW - 10;
      const x1 = x + halfW + 10;
      tween(
        0.22,
        (k) => {
          const ex = x0 + (x1 - x0) * k;
          er.position.set(ex, y);
          er.alpha = 1 - Math.max(0, (k - 0.7) / 0.3);
          if (Math.random() < 0.7) this.burst(ex, y + (Math.random() - 0.5) * 2 * halfH, 1, 26);
          smudge.clear();
          smudge.ellipse(x, y, halfW * 0.9, halfH * 0.7).fill({ color: GRAPHITE, alpha: 0.12 * Math.sin(Math.PI * k) });
        },
        () => {
          er.destroy();
          // A faint graphite smudge lingers a beat where the drawing was.
          tween(
            0.4,
            (k) => {
              smudge.clear();
              smudge.ellipse(x, y, halfW * 0.8, halfH * 0.6).fill({ color: GRAPHITE, alpha: 0.13 * (1 - k) });
            },
            () => smudge.destroy(),
          );
        },
      );
    },

    flash(x, y) {
      if (JUICE <= 0) return;
      this.burst(x, y, 14, 90);
      const ring = new Graphics();
      fxLayer.addChild(ring);
      tween(
        0.5,
        (k) => {
          ring.clear();
          ring.circle(x, y, 12 + 64 * k).stroke({ color: GRAPHITE, width: 2.4 * (1 - k), alpha: 0.5 * (1 - k) });
        },
        () => ring.destroy(),
      );
    },

    step(dtMs) {
      const dt = Math.min(0.05, dtMs / 1000); // clamp so a frame hitch can't blow up the spring

      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i];
        a.t += dt;
        const k = Math.min(1, a.t / a.dur);
        a.fn(k);
        if (k >= 1) {
          a.done?.();
          anims.splice(i, 1);
        }
      }

      for (const [t, s] of springs) {
        if (t.destroyed) {
          springs.delete(t);
          continue;
        }
        // Damped spring toward rest (scale→1, rot→0).
        s.scaleVel += (-2 * ZETA * STIFF * s.scaleVel - STIFF * STIFF * (s.scale - 1)) * dt;
        s.scale += s.scaleVel * dt;
        s.rotVel += (-2 * ZETA * STIFF * s.rotVel - STIFF * STIFF * s.rot) * dt;
        s.rot += s.rotVel * dt;
        t.scale.set(s.scale);
        t.rotation = s.rot;
        if (
          Math.abs(s.scale - 1) < 0.002 && Math.abs(s.scaleVel) < 0.01 &&
          Math.abs(s.rot) < 0.002 && Math.abs(s.rotVel) < 0.01
        ) {
          t.scale.set(1);
          t.rotation = 0;
          springs.delete(t);
        }
      }

      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        if (d.g.destroyed) {
          dust.splice(i, 1);
          continue;
        }
        d.life += dt;
        const k = d.life / d.max;
        if (k >= 1) {
          d.g.destroy();
          dust.splice(i, 1);
          continue;
        }
        d.vy += GRAVITY * dt;
        d.g.x += d.vx * dt;
        d.g.y += d.vy * dt;
        d.g.alpha = d.alpha * (1 - k);
      }
    },

    destroy() {
      for (const [t] of springs) {
        if (!t.destroyed) {
          t.scale.set(1);
          t.rotation = 0;
        }
      }
      springs.clear();
      for (const d of dust) if (!d.g.destroyed) d.g.destroy();
      dust.length = 0;
      anims.length = 0; // FX graphics are torn down with the fxLayer
    },
  };
}
