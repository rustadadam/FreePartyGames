// Wiki-what's signature cues (synthesized; ships in this game's chunk). See docs/DESIGN.md, Sound.
import { defineSfx } from '../../client/kit';

export const play = defineSfx({
  /** The team got it: two bright notes up with a sparkle. */
  right: {
    vary: 0,
    play(v) {
      v.tone({ f: 1046.5, dur: 0.12, vol: 0.24, type: 'triangle' });
      v.tone({ f: 1568, at: 0.1, dur: 0.4, vol: 0.24, type: 'triangle' });
      v.noise({ at: 0.1, dur: 0.3, vol: 0.06, filter: 'highpass', freq: 8000 });
    },
  },
  /** The team got it wrong: a buzzy "nuh-uh", two notes down. */
  wrong: {
    vary: 0,
    play(v) {
      v.tone({ f: 233, dur: 0.16, vol: 0.24, type: 'sawtooth', lp: 1500 });
      v.tone({ f: 175, at: 0.18, dur: 0.34, vol: 0.26, type: 'sawtooth', lp: 1200 });
    },
  },
  /** The Mole unmasked: a low dramatic "dun, dun, dunnn". Ducks the music. */
  mole: {
    duck: 1.6,
    vary: 0,
    play(v) {
      v.tone({ f: 146.8, dur: 0.22, vol: 0.4, type: 'sawtooth', lp: 900 });
      v.tone({ f: 138.6, at: 0.28, dur: 0.22, vol: 0.4, type: 'sawtooth', lp: 900 });
      v.tone({ f: 110, at: 0.56, dur: 1.1, vol: 0.45, type: 'sawtooth', lp: 800, wobble: 3 });
      v.tone({ f: 55, at: 0.56, dur: 1.1, vol: 0.5 });
    },
  },
});
