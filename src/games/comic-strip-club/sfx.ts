// Comic Strip Club's signature cues (synthesized; ships in this game's chunk). See docs/DESIGN.md, Sound.
import { defineSfx } from '../../client/kit';

export const play = defineSfx({
  /** A panel lands in the reveal: a crisp paper page flip with a soft slap. */
  flip: {
    gap: 120,
    play(v) {
      v.noise({ dur: 0.16, vol: 0.34, freq: 3600, to: 900, q: 1.4, attack: 0.03 });
      v.tone({ f: 220, to: 120, at: 0.1, dur: 0.08, vol: 0.3 });
    },
  },
  /** The votes are in: a drum "ba-dum" and a splashy cymbal, the comic's punchline. Ducks the music. */
  rimshot: {
    duck: 1,
    vary: 0,
    play(v) {
      v.tone({ f: 240, to: 170, dur: 0.14, vol: 0.42 });
      v.tone({ f: 170, to: 115, at: 0.15, dur: 0.18, vol: 0.45 });
      v.noise({ at: 0.15, dur: 0.05, vol: 0.25, freq: 1800 });
      v.noise({ at: 0.34, dur: 0.7, vol: 0.22, filter: 'highpass', freq: 6000 });
    },
  },
});
