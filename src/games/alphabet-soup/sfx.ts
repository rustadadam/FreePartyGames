// Alphabet Soup's signature cues (synthesized; ships in this game's chunk). See docs/DESIGN.md, Sound.
import { defineSfx, pentatonic } from '../../client/kit';

export const play = defineSfx({
  /** Your group got its word: a spoon rung on a bowl, then a quick rising run. */
  solved: {
    gap: 300,
    vary: 0,
    play(v) {
      v.noise({ dur: 0.02, vol: 0.2, filter: 'highpass', freq: 5000 });
      v.tone({ f: 1320, dur: 1.2, vol: 0.16 });
      v.tone({ f: 1320 * 2.7, dur: 0.4, vol: 0.05 });
      for (let i = 0; i < 4; i++) v.tone({ f: 660 * 2 ** (pentatonic(i + 2) / 12), at: 0.08 + i * 0.06, dur: 0.25, vol: 0.12 });
    },
  },
  /** A guess that wasn't the word: a soft, low plop. */
  miss: {
    gap: 120,
    play(v) {
      v.tone({ f: 260, to: 150, glide: 0.12, dur: 0.16, vol: 0.28 });
    },
  },
});
