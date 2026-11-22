// Pitch helpers for cues (tiny, so they stay in the shell).

/** Semitones -> frequency ratio. */
export const semis = (n: number): number => 2 ** (n / 12);

/** A major-pentatonic ladder in semitones: any run of these sounds like a tune, never a clash. */
export function pentatonic(step: number): number {
  const scale = [0, 2, 4, 7, 9];
  const i = ((step % 10) + 10) % 10;
  return scale[i % 5] + 12 * Math.floor(i / 5);
}
