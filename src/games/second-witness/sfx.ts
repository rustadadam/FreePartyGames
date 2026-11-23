// Second Witness's signature cue (synthesized; ships in this game's chunk). See docs/DESIGN.md, Sound.
import { defineSfx, pentatonic, type Voice } from '../../client/kit';

/** One struck gold-plate partial set (bell-like, inharmonic). */
function plate(v: Voice, f: number, at: number, vol: number, dur: number) {
  v.tone({ f, at, dur, vol });
  v.tone({ f: f * 2.41, at, dur: dur * 0.5, vol: vol * 0.35 });
  v.tone({ f: f * 3.98, at, dur: dur * 0.25, vol: vol * 0.15 });
}

export const play = defineSfx({
  /**
   * A word marked as matched: a chime that grows with the witnesses (Voice.n), one rising note per
   * witness up to eight, ringing longer the more there are.
   */
  witness: {
    gap: 150,
    vary: 0,
    play(v) {
      const n = Math.max(2, Math.min(8, v.n));
      v.noise({ dur: 0.03, vol: 0.18, filter: 'highpass', freq: 5000 });
      for (let i = 0; i < n; i++) plate(v, 880 * 2 ** (pentatonic(i) / 12), i * 0.07, 0.15, 0.6 + n * 0.08);
    },
  },
});
