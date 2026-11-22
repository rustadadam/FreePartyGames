// Sound-effect building blocks. Every effect is synthesized at play time from oscillators and
// filtered noise with short envelopes: no audio files, no samples, nothing to download.
// A recipe is a few `tone` / `noise` calls against a Voice that already carries the start time,
// the pitch (so one recipe can be played higher or lower) and the output bus.
import { noiseBuffer } from './engine';

export interface ToneOpts {
  /** Start frequency (Hz), before the voice's pitch is applied. */
  f: number;
  /** Glide to this frequency (exponential) over `glide` seconds (default: the whole note). */
  to?: number;
  glide?: number;
  type?: OscillatorType;
  /** Offset from the voice start, seconds. */
  at?: number;
  /** Length, seconds (attack + decay). */
  dur: number;
  /** Peak gain, 0..1 (default 0.4). */
  vol?: number;
  /** Attack, seconds (default 5 ms). Keep it soft for anything that must not read as a beat. */
  attack?: number;
  /** Lowpass cutoff, Hz: tames square and saw waves. */
  lp?: number;
  /** Vibrato depth in Hz at 7 Hz. */
  wobble?: number;
}

export interface NoiseOpts {
  at?: number;
  dur: number;
  vol?: number;
  attack?: number;
  /** Filter shape and cutoff (Hz). Default bandpass at 2 kHz. */
  filter?: BiquadFilterType;
  freq?: number;
  /** Sweep the cutoff to this frequency over the note. */
  to?: number;
  q?: number;
}

export interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  /** Start time (AudioContext seconds). */
  t: number;
  /** Pitch multiplier from `PlayOpts.pitch` plus a little random variation. */
  p: number;
  /** Recipe-specific amount from `PlayOpts.n` (a count, a step). Default 1. */
  n: number;
  tone(o: ToneOpts): void;
  noise(o: NoiseOpts): void;
}

export interface Recipe {
  play(v: Voice): void;
  /** Duck the music for this many seconds (big stingers only). */
  duck?: number;
  /** Random pitch variation, ± semitones (default 0.4), so repeats don't grate. */
  vary?: number;
  /** The same effect is skipped if it was already started this many ms ago (default 60). */
  gap?: number;
}

const FLOOR = 0.0008;

function envelope(g: GainNode, t: number, vol: number, attack: number, dur: number): void {
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, FLOOR * 2), t + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + Math.max(dur, attack + 0.01));
}

export function makeVoice(ctx: AudioContext, out: AudioNode, t: number, p: number, n: number): Voice {
  return {
    ctx,
    out,
    t,
    p,
    n,
    tone({ f, to, glide, type = 'sine', at = 0, dur, vol = 0.4, attack = 0.005, lp, wobble }) {
      const s = t + at;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * p, s);
      if (to) o.frequency.exponentialRampToValueAtTime(to * p, s + (glide ?? dur));
      if (wobble) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 7;
        depth.gain.value = wobble;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(s);
        lfo.stop(s + dur + 0.02);
      }
      const g = ctx.createGain();
      envelope(g, s, vol, attack, dur);
      let node: AudioNode = o;
      if (lp) {
        const fl = ctx.createBiquadFilter();
        fl.type = 'lowpass';
        fl.frequency.value = lp;
        node = node.connect(fl);
      }
      node.connect(g).connect(out);
      o.start(s);
      o.stop(s + dur + 0.02);
    },
    noise({ at = 0, dur, vol = 0.3, attack = 0.003, filter = 'bandpass', freq = 2000, to, q = 1 }) {
      const buf = noiseBuffer();
      if (!buf) return;
      const s = t + at;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = dur > buf.duration;
      const fl = ctx.createBiquadFilter();
      fl.type = filter;
      fl.Q.value = q;
      fl.frequency.setValueAtTime(freq, s);
      if (to) fl.frequency.exponentialRampToValueAtTime(to, s + dur);
      const g = ctx.createGain();
      envelope(g, s, vol, attack, dur);
      src.connect(fl).connect(g).connect(out);
      src.start(s);
      src.stop(s + dur + 0.02);
    },
  };
}
