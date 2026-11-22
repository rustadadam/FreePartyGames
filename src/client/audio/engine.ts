// The page's one AudioContext, shared by music, sound effects and any game synth (Cave Rave).
//
//   music decks -> musicBus --\
//                              +-> destination
//   effects ----> sfxBus ----/      (sfxBus runs through a gentle compressor)
//
// Ducking lowers musicBus for a moment under a big stinger. Browsers only start audio inside a
// user gesture, so bindUnlock() resumes the context on the first tap or key press anywhere.

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let unlockBound = false;
const unlockFns = new Set<() => void>();

/** Effects sit a little under the music's 0.5 so stingers pop without blasting. */
const SFX_LEVEL = 0.55;

/** The shared context, created on first use. Null where Web Audio is missing. */
export function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: 'interactive' });
  musicBus = ctx.createGain();
  musicBus.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_LEVEL;
  sfxBus.connect(comp);
  return ctx;
}

export function running(): boolean {
  return ctx?.state === 'running';
}

/** Where music decks connect (ducked under stingers). */
export function musicOut(): AudioNode | null {
  return audioCtx() ? musicBus : null;
}

/** Where sound effects connect. */
export function sfxOut(): AudioNode | null {
  return audioCtx() ? sfxBus : null;
}

/** Half a second of white noise (fixed LCG, so it is identical on every device). */
export function noiseBuffer(): AudioBuffer | null {
  const c = audioCtx();
  if (!c) return null;
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const ch = noise.getChannelData(0);
    let x = 0x1234567;
    for (let i = 0; i < ch.length; i++) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      ch[i] = (x / 0xffffffff) * 2 - 1;
    }
  }
  return noise;
}

/**
 * Drops the music to `depth` (0..1) in 40 ms, holds it for `holdS` seconds, then brings it back
 * over half a second. A newer duck replaces one in progress.
 */
export function duck(holdS: number, depth = 0.3, delayS = 0): void {
  if (!ctx || !musicBus) return;
  const g = musicBus.gain;
  const t = ctx.currentTime + delayS;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(Math.min(g.value, depth), t + 0.04);
  g.setValueAtTime(depth, t + 0.04 + holdS);
  g.linearRampToValueAtTime(1, t + 0.54 + holdS);
}

/** Resume inside a gesture. The silent blip is what finally unlocks iOS Safari. */
export function unlock(): void {
  const c = audioCtx();
  if (!c) return;
  if (c.state !== 'running') void c.resume().then(() => unlockFns.forEach((fn) => fn()), () => {});
  const o = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0;
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.01);
  unlockFns.forEach((fn) => fn());
}

/** Unlock on the first tap or key press anywhere (bound once, on the device that plays audio). */
export function bindUnlock(onUnlock?: () => void): void {
  if (onUnlock) unlockFns.add(onUnlock);
  if (unlockBound || typeof document === 'undefined') return;
  unlockBound = true;
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}
