// Forgery's signature cues (synthesized; ships in this game's chunk). See docs/DESIGN.md, Sound.
import { defineSfx } from '../../client/kit';

export const play = defineSfx({
  /** The vote lands on the forger: a two-tone gallery alarm. */
  busted: {
    duck: 0.7,
    vary: 0,
    play(v) {
      for (let i = 0; i < 4; i++) v.tone({ f: i % 2 ? 660 : 880, at: i * 0.11, dur: 0.1, vol: 0.18, type: 'square', lp: 2200 });
    },
  },
  /** The wax seal stamps FORGED: a heavy low thud with a waxy squish. */
  stamp: {
    play(v) {
      v.tone({ f: 120, to: 42, dur: 0.28, vol: 0.85 });
      v.noise({ dur: 0.09, vol: 0.45, filter: 'lowpass', freq: 700 });
    },
  },
  /** Caught for good: a bright "got you" run up to a held major chord. Ducks the music. */
  caught: {
    duck: 1.2,
    vary: 0,
    play(v) {
      [659.25, 830.61, 987.77].forEach((f, i) => v.tone({ f, at: i * 0.08, dur: 0.12, vol: 0.2, type: 'triangle' }));
      [659.25, 830.61, 987.77, 1318.5].forEach((f) => v.tone({ f, at: 0.26, dur: 0.8, vol: 0.09, type: 'square', lp: 2600 }));
    },
  },
  /** The forger walks free: a sly slide-whistle down and two little snickers. Ducks the music. */
  escaped: {
    duck: 1.2,
    vary: 0,
    play(v) {
      v.tone({ f: 1400, to: 330, dur: 0.6, vol: 0.28, attack: 0.03, wobble: 18 });
      v.tone({ f: 440, at: 0.66, dur: 0.08, vol: 0.2, type: 'triangle' });
      v.tone({ f: 523.25, at: 0.78, dur: 0.12, vol: 0.2, type: 'triangle' });
    },
  },
});
