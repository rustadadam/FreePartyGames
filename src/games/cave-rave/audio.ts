// Cave Rave sound: every voice is synthesized with Web Audio from the chart (no audio files).
// Times on this page live in the performance.now() domain ("perf ms"); the AudioContext has its
// own clock, so perfToCtx() maps between them. The context and noise are the page's shared ones
// (src/client/audio/engine.ts), unlocked by a user tap (iOS). The song has its own bus, apart
// from the room's music and sound effects.
import { audioCtx, noiseBuffer, unlock } from '../../client/audio/engine';
import type { Chart } from './chart';

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

export function audioState(): 'none' | 'locked' | 'running' {
  if (!ac) return 'none';
  return ac.state === 'running' ? 'running' : 'locked';
}

/** Call from a user gesture (pointerdown/click). Creates and resumes the context. */
export function unlockAudio(): void {
  if (!ac) {
    ac = audioCtx();
    if (!ac) return;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    comp.connect(ac.destination);
    master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    noise = noiseBuffer();
  }
  unlock(); // resume + the silent blip that finally unlocks iOS Safari
}

/** perf ms -> AudioContext seconds. */
export function perfToCtx(perfMs: number): number {
  if (!ac) return 0;
  return ac.currentTime + (perfMs - performance.now()) / 1000;
}

/** AudioContext seconds -> perf ms. */
export function ctxToPerf(t: number): number {
  if (!ac) return performance.now();
  return performance.now() + (t - ac.currentTime) * 1000;
}

function env(g: GainNode, t: number, peak: number, decay: number): void {
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
}

function kick(out: AudioNode, t: number): void {
  const c = ac!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  env(g, t, 1, 0.38);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.4);
}

function noiseHit(out: AudioNode, t: number, hp: number, peak: number, decay: number): void {
  const c = ac!;
  const s = c.createBufferSource();
  s.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = c.createGain();
  env(g, t, peak, decay);
  s.connect(f).connect(g).connect(out);
  s.start(t);
  s.stop(t + decay + 0.02);
}

function snare(out: AudioNode, t: number): void {
  noiseHit(out, t, 1400, 0.55, 0.2);
  const c = ac!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  env(g, t, 0.45, 0.1);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.12);
}

function bass(out: AudioNode, t: number, midi: number, dur: number): void {
  const c = ac!;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 7;
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(180, t + Math.max(0.08, dur));
  const g = c.createGain();
  g.gain.setValueAtTime(0.0008, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
  g.gain.setValueAtTime(0.32, t + Math.max(0.02, dur - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(f).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A short, bright click (calibration). `at` is AudioContext seconds. */
export function click(at: number): void {
  if (!ac || !master) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'square';
  o.frequency.value = 1320;
  env(g, at, 0.35, 0.05);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + 0.06);
}

type Ev = { step: number; play: (out: AudioNode, t: number) => void };

/**
 * Plays `chart` with its first step at `songStartPerf` (perf ms). Schedules in short lookahead
 * chunks, so it can start (or be unlocked) mid-song. Returns a stop function.
 */
export function playSong(chart: Chart, songStartPerf: number): () => void {
  const stepMs = chart.stepMs;
  const evs: Ev[] = [
    ...chart.kick.map((step) => ({ step, play: kick })),
    ...chart.snare.map((step) => ({ step, play: snare })),
    ...chart.hat.map((step) => ({ step, play: (o: AudioNode, t: number) => noiseHit(o, t, 7500, 0.16, 0.045) })),
    ...chart.openHat.map((step) => ({ step, play: (o: AudioNode, t: number) => noiseHit(o, t, 6500, 0.18, 0.28) })),
    ...chart.bass.map((b) => ({ step: b.step, play: (o: AudioNode, t: number) => bass(o, t, b.midi, (b.len * stepMs) / 1000 - 0.01) })),
  ].sort((a, b) => a.step - b.step);
  let i = 0;
  let bus: GainNode | null = null;
  const pump = () => {
    if (!ac || !master || ac.state !== 'running') return;
    if (!bus) {
      bus = ac.createGain();
      bus.connect(master);
    }
    const horizon = performance.now() + 400;
    while (i < evs.length) {
      const at = songStartPerf + evs[i].step * stepMs;
      if (at > horizon) break;
      // Skip what is already in the past (late unlock, late join): never play it late.
      if (at >= performance.now() - 5) evs[i].play(bus, perfToCtx(at));
      i++;
    }
  };
  pump();
  const timer = setInterval(pump, 100);
  return () => {
    clearInterval(timer);
    if (bus && ac) {
      const b = bus;
      b.gain.setTargetAtTime(0, ac.currentTime, 0.03);
      setTimeout(() => b.disconnect(), 300);
    }
  };
}

// ---------- calibration offset (audio output + reaction habit), per device ----------

const KEY = 'cave-rave:offset-ms';

/** Stored offset in ms (positive: you hear and tap late), or null if never calibrated. */
export function loadOffset(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveOffset(ms: number): void {
  try {
    localStorage.setItem(KEY, String(Math.round(ms)));
  } catch {
    /* private mode: it just won't stick */
  }
}

/** Median of tap - click deltas, matching each tap to its nearest click. Null if too few. */
export function medianOffset(clicks: number[], taps: number[], minTaps = 5): number | null {
  const deltas: number[] = [];
  for (const t of taps) {
    let best = Infinity;
    for (const c of clicks) if (Math.abs(t - c) < Math.abs(best)) best = t - c;
    if (Math.abs(best) <= 300) deltas.push(best);
  }
  if (deltas.length < minTaps) return null;
  deltas.sort((a, b) => a - b);
  const m = deltas.length >> 1;
  const med = deltas.length % 2 ? deltas[m] : (deltas[m - 1] + deltas[m]) / 2;
  return Math.max(-100, Math.min(400, med));
}
