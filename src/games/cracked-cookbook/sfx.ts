// Cracked Cookbook's signature cues (synthesized; ships in this game's chunk). See docs/DESIGN.md, Sound.
import { defineSfx } from '../../client/kit';

export const play = defineSfx({
  /** Order up: a counter service bell (inharmonic partials, long ring). Dishes in, dishes revealed. */
  serve: {
    gap: 120,
    vary: 0.25,
    play(v) {
      const f = 1568;
      v.noise({ dur: 0.03, vol: 0.25, filter: 'highpass', freq: 4000 });
      v.tone({ f, dur: 1.1, vol: 0.22 });
      v.tone({ f: f * 2.76, dur: 0.5, vol: 0.08 });
      v.tone({ f: f * 5.4, dur: 0.18, vol: 0.04 });
    },
  },
  /** A prop sticker slapped on the plate: a quick rubbery pop. */
  sticker: {
    gap: 80,
    play(v) {
      v.tone({ f: 320, to: 950, glide: 0.05, dur: 0.09, vol: 0.32 });
      v.noise({ dur: 0.025, vol: 0.15, freq: 2500 });
    },
  },
});
