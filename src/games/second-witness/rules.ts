// Second Witness constants shared by logic.ts (server) and ui.tsx (client). No imports, no zod:
// the UI may import values from here without dragging the game logic into its chunk.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;

/** Score multiplier of each round, in order. The game has one round per entry. */
export const MULTIPLIERS: readonly number[] = [1, 1, 2, 2, 3, 3];
export const ROUNDS = MULTIPLIERS.length;

/** Longest answer, in characters after trimming. */
export const MAX_ANSWER_LEN = 40;

/** Time to come up with the answers (the default of the host's "Writing time" setting). */
export const WRITE_MS = 30_000;
/** Each player's words are up for matching this long, by default (it ends early once every word has settled). */
export const CALL_MS = 3_000;
/** Between turns: errors on unmatched words and the points each player just got. */
export const RESULT_MS = 3_200;
/** The round standings stay up this long after the last turn. */
export const STANDINGS_MS = 8_000;
/** The final totals and the Unique thinker bonus. */
export const FINAL_MS = 16_000;

/** Round points before the multiplier. Shown in Rules, applied by logic.ts. */
export const POINTS = {
  /** One answer, and someone else wrote it too. */
  single: 3,
  /** Two answers, and both were witnessed. */
  second: 5,
  /** Two answers, only one witnessed. */
  half: 1,
} as const;

/** Unique thinker: zero points in this many rounds in which you wrote two answers. */
export const UNIQUE_MIN_ROUNDS = 3;
/** Flat bonus at the end (not multiplied). */
export const UNIQUE_BONUS = 10;

export type Outcome = 'single' | 'second' | 'half' | 'none' | 'blank';
