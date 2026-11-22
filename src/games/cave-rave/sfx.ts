// Cave Rave's room cues (synthesized; ships in this game's chunk). See docs/DESIGN.md, Sound.
// The song itself is audio.ts, played by each phone. These cues are for the room's audio device,
// and the UI holds every effect during the song (useSfxHold) except `sabotage` on the TV.
import { defineSfx } from '../../client/kit';

export const play = defineSfx({
  /** The bracket moves on: a filtered saw riser into a bright stab. */
  advance: {
    duck: 1,
    vary: 0,
    play(v) {
      v.tone({ f: 110, to: 880, dur: 0.55, vol: 0.2, type: 'sawtooth', lp: 3000, attack: 0.4 });
      v.noise({ dur: 0.55, vol: 0.12, filter: 'highpass', freq: 800, to: 8000, attack: 0.45 });
      [440, 554.37, 659.25].forEach((f) => v.tone({ f, at: 0.52, dur: 0.5, vol: 0.12, type: 'sawtooth', lp: 2400 }));
    },
  },
  /**
   * A saboteur strikes, as heard on the TV during the song. Soft attack and no pitch drop, so
   * it reads as a smear across the room, never as a drum hit on the dancers' beat.
   */
  sabotage: {
    gap: 250,
    play(v) {
      v.noise({ dur: 0.4, vol: 0.2, freq: 2400, to: 500, q: 3, attack: 0.05 });
      v.tone({ f: 330, to: 300, dur: 0.4, vol: 0.08, type: 'square', lp: 1200, attack: 0.05, wobble: 30 });
    },
  },
});
