/**
 * A tiny SYNTHESISED audio layer — no asset files (none would load in the
 * sandbox anyway). Everything is Web Audio: filtered noise bursts and short
 * oscillator blips, shaped to sound like a pencil at work in a notebook.
 *
 * The AudioContext is created lazily and resumed on the first user gesture
 * (browsers block audio until then). Every cue is throttled so a fast factory
 * can't machine-gun the speakers, and the whole layer is muteable.
 */

let ctx: AudioContext | null = null;
let muted = false;

export function setAudioMuted(m: boolean): void {
  muted = m;
}

/** Resume (or lazily create) the context — call from a user-gesture handler. */
export function resumeAudio(): void {
  ensure();
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// Per-cue throttle so frequent events (builds, burns) stay tasteful.
const lastAt: Record<string, number> = {};
function gate(key: string, minMs: number): AudioContext | null {
  if (muted) return null;
  const c = ensure();
  if (!c) return null;
  const now = c.currentTime * 1000;
  if (lastAt[key] !== undefined && now - lastAt[key] < minMs) return null;
  lastAt[key] = now;
  return c;
}

function noiseBuffer(c: AudioContext, dur: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Envelope helper: ramp a gain 0 → peak → 0 over `dur`. */
function env(c: AudioContext, node: AudioNode, peak: number, dur: number): GainNode {
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g);
  g.connect(c.destination);
  return g;
}

/** A short graphite "tick" — a built cell snapping to life. */
export function sndSnap(): void {
  const c = gate('snap', 45);
  if (!c) return;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 480 + Math.random() * 60;
  env(c, o, 0.06, 0.13);
  o.start();
  o.stop(c.currentTime + 0.14);
}

/** The whoosh — a downward filtered-noise sweep, "coal in the furnace". */
export function sndBurn(): void {
  const c = gate('burn', 70);
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.25);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  const t = c.currentTime;
  f.frequency.setValueAtTime(2200, t);
  f.frequency.exponentialRampToValueAtTime(320, t + 0.22);
  src.connect(f);
  env(c, f, 0.05, 0.24);
  src.start();
  src.stop(t + 0.25);
}

/** The eraser — a mid-band noise scrub. */
export function sndErase(): void {
  const c = gate('erase', 60);
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.2);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1400;
  f.Q.value = 0.7;
  src.connect(f);
  env(c, f, 0.07, 0.2);
  src.start();
  src.stop(c.currentTime + 0.21);
}

/** A milestone — a soft two-tone bell + a noise "page flip". */
export function sndMilestone(): void {
  const c = gate('milestone', 400);
  if (!c) return;
  const t = c.currentTime;
  for (const [freq, delay] of [[660, 0], [990, 0.09]] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(0.09, t + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.5);
    o.connect(g);
    g.connect(c.destination);
    o.start(t + delay);
    o.stop(t + delay + 0.52);
  }
}
