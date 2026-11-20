// Forgery constants shared by logic.ts (server) and ui.tsx (client). No imports, no zod:
// the UI may import values from here without dragging the game logic into its chunk.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;
/** Default round count is min(players, MAX_ROUNDS); the setting can lower it. */
export const MAX_ROUNDS = 4;
export const LAPS = 2;

export const TURN_MS = 25_000;
export const VOTE_MS = 30_000;
export const GUESS_MS = 20_000;
export const REVEAL_MS = 10_000;
/** Reveal steps appear this far apart (ms), starting when the reveal phase begins. */
export const REVEAL_STEP_MS = 1_800;

/** Shared canvas: width / height, and the one brush every stroke uses. */
export const ASPECT = 4 / 3;
export const STROKE_W = 14;

/** Round scoring. Shown in Rules, applied by logic.ts. */
export const POINTS = {
  /** Forger was not accused (or the vote tied): forger scores. */
  escaped: 3,
  /** Forger was caught, but guessed the word: forger scores. */
  stolen: 2,
  /** Forger was caught and guessed wrong: every artist scores. */
  caught: 1,
  /** Bonus for each artist who voted for the forger, whatever the outcome. */
  sharpEye: 1,
};
