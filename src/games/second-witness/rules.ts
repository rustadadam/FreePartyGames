// Second Witness constants shared by logic.ts (server) and ui.tsx (client). No imports, no zod:
// the UI may import values from here without dragging the game logic into its chunk.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;

/** Score multiplier of each round, in order. The game has one round per entry. */
export const MULTIPLIERS: readonly number[] = [1, 1, 2, 2, 3, 3];
export const ROUNDS = MULTIPLIERS.length;

/** Longest answer, in characters after trimming. */
export const MAX_ANSWER_LEN = 40;
/** Open "same answer?" proposals one player may have at a time. */
export const MAX_OPEN_PROPOSALS = 3;

export const WRITE_MS = 60_000;
export const MERGE_MS = 45_000;
/** Pause before the first group of a reveal appears. */
export const REVEAL_LEAD_MS = 1_200;
/** Each group takes about this long on stage, but the whole group reveal is capped (see revealInterval). */
export const REVEAL_PER_GROUP_MS = 3_000;
export const REVEAL_CAP_MS = 20_000;
/** The round standings stay up this long after the last group. */
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

/** ms between groups in the reveal: about REVEAL_PER_GROUP_MS, shrunk so the whole thing stays under the cap. */
export function revealInterval(groups: number): number {
  return groups > 0 ? Math.min(REVEAL_PER_GROUP_MS, Math.floor(REVEAL_CAP_MS / groups)) : 0;
}

export type Outcome = 'single' | 'second' | 'half' | 'none' | 'blank';
