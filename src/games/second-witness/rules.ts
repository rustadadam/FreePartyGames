// Second Witness constants shared by logic.ts (server) and ui.tsx (client). No imports, no zod:
// the UI may import values from here without dragging the game logic into its chunk.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;

/** Longest answer, in characters after trimming. */
export const MAX_ANSWER_LEN = 40;

/** Time to come up with the answers (the default of the host's "Writing time" setting). */
export const WRITE_MS = 30_000;
/**
 * Backstop for the matching phase (the default of the host's "Matching time" setting). The phase
 * normally ends when every player has checked off Done; this only stops a stuck phone from holding the room.
 */
export const MATCH_MS = 120_000;

/** Points. Shown in Rules, applied by match.ts. */
export const POINTS = {
  /** One answer, and someone else wrote it too. */
  single: 3,
  /** Two answers, and both were witnessed. */
  second: 5,
  /** Two answers, only one witnessed. */
  half: 1,
} as const;
