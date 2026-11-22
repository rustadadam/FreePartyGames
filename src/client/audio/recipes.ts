// The shared effects every game and the shell use by name (SfxName), plus the synth they are
// built from. A lazy chunk: only the room's audio device loads it (sfx.ts). Each is a short
// synthesized cue; see docs/DESIGN.md, Sound, for when to use which.
import { semis } from './scale';
import type { Recipe } from './synth';

export { makeVoice } from './synth';

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

export const KIT = {
  /** A player joins: a rising bubble pop, pitched by seat so a wave of joins plays a tune. */
  join: {
    gap: 40,
    vary: 0.1,
    play(v) {
      v.tone({ f: 440, to: 880, glide: 0.06, dur: 0.16, vol: 0.45 });
      v.tone({ f: 1760, dur: 0.04, vol: 0.07, type: 'triangle' });
    },
  },
  /** A player leaves: a soft falling blip. */
  leave: {
    play(v) {
      v.tone({ f: 520, to: 260, dur: 0.22, vol: 0.26, attack: 0.01 });
    },
  },
  /** The host picks a game: a two-step click, up. */
  pick: {
    gap: 120,
    play(v) {
      v.tone({ f: 880, dur: 0.07, vol: 0.28, type: 'triangle' });
      v.tone({ f: 1320, at: 0.06, dur: 0.1, vol: 0.28, type: 'triangle' });
    },
  },
  /** Game starting: a rising whoosh that lands on a bright major stab. Ducks the music. */
  start: {
    duck: 1.1,
    vary: 0,
    gap: 600,
    play(v) {
      v.noise({ dur: 0.42, vol: 0.32, freq: 300, to: 4200, q: 2, attack: 0.3 });
      [C5, E5, G5, C6].forEach((f, i) => v.tone({ f, at: 0.36 + i * 0.022, dur: 0.7, vol: 0.13, type: 'square', lp: 2600 }));
      v.tone({ f: 130.81, at: 0.36, dur: 0.6, vol: 0.5, type: 'triangle' });
    },
  },
  /** Results: a three-note run up into a held, shimmering chord. Ducks the music. */
  fanfare: {
    duck: 1.9,
    vary: 0,
    gap: 1500,
    play(v) {
      [C5, E5, G5].forEach((f, i) => v.tone({ f, at: i * 0.12, dur: 0.16, vol: 0.2, type: 'square', lp: 3000 }));
      [C5, E5, G5, C6].forEach((f) => v.tone({ f, at: 0.38, dur: 1.2, vol: 0.1, type: 'sawtooth', lp: 2600, wobble: 4 }));
      v.tone({ f: 130.81, at: 0.38, dur: 1.1, vol: 0.42, type: 'triangle' });
      v.noise({ at: 0.38, dur: 0.9, vol: 0.1, filter: 'highpass', freq: 7000 });
    },
  },
  /** Back to the lobby: a gentle two-note settle, down. */
  back: {
    gap: 600,
    play(v) {
      v.tone({ f: G5, dur: 0.14, vol: 0.24, type: 'triangle' });
      v.tone({ f: C5, at: 0.13, dur: 0.32, vol: 0.26, type: 'triangle' });
    },
  },
  /** Timer, last seconds: a woodblock tick (Timer raises the pitch as time runs out). */
  tick: {
    gap: 300,
    vary: 0,
    play(v) {
      v.tone({ f: 1100, dur: 0.05, vol: 0.34 });
      v.noise({ dur: 0.02, vol: 0.1, filter: 'highpass', freq: 3000 });
    },
  },
  /** Timer at zero: a short cartoon buzzer, two detuned low tones. Ducks the music briefly. */
  timeUp: {
    duck: 0.5,
    vary: 0,
    gap: 600,
    play(v) {
      v.tone({ f: 146.8, type: 'square', dur: 0.55, vol: 0.2, lp: 1400, attack: 0.01 });
      v.tone({ f: 155.6, type: 'sawtooth', dur: 0.55, vol: 0.16, lp: 1400, attack: 0.01 });
    },
  },
  /** Someone locked in or voted: a soft glassy tick (useSfxCount pitches it up the scale). */
  lockIn: {
    gap: 50,
    vary: 0.15,
    play(v) {
      v.tone({ f: E5 * 2, to: E5 * 2.6, glide: 0.03, dur: 0.08, vol: 0.16, type: 'triangle' });
    },
  },
  /** One reveal step: an airy whoosh into a low thump. */
  reveal: {
    gap: 150,
    play(v) {
      v.noise({ dur: 0.2, vol: 0.2, freq: 900, to: 3000, q: 1.5, attack: 0.12 });
      v.tone({ f: 150, to: 55, at: 0.13, dur: 0.24, vol: 0.6 });
    },
  },
  /** A fast stagger (score rows popping in): a light coin tick that climbs with the step. */
  count: {
    gap: 40,
    vary: 0.1,
    play(v) {
      v.tone({ f: C6, dur: 0.06, vol: 0.13, type: 'triangle' });
      v.tone({ f: G5 * 2, at: 0.03, dur: 0.12, vol: 0.08 });
    },
  },
  /** Points awarded: three quick rising dings. */
  score: {
    gap: 250,
    play(v) {
      [C6, C6 * semis(4), C6 * semis(7)].forEach((f, i) => v.tone({ f, at: i * 0.055, dur: 0.22, vol: 0.15, type: 'triangle' }));
    },
  },
  /** A prompt card appears: a papery flick. */
  card: {
    gap: 400,
    play(v) {
      v.noise({ dur: 0.09, vol: 0.26, freq: 3200, to: 1200, q: 1.2 });
      v.tone({ f: 600, to: 900, dur: 0.05, vol: 0.07, type: 'triangle' });
    },
  },
} satisfies Record<string, Recipe>;
