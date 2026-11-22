// Cracked Cookbook constants shared by logic.ts (server) and ui.tsx (client).
// No imports, so the client chunk can use them without pulling in zod.

/** Rounds of prop drawing before the cooking round. */
export const DRAW_ROUNDS = 2;
/** Props dealt to each cook (other players' drawings first). */
export const HAND_SIZE = 6;
/** If other players made fewer props than this, the hand is topped up with the cook's own. */
export const MIN_HAND = 3;
export const MAX_STICKERS = 12;
export const NAME_MAX = 24;

/** Points the dish creator earns per vote. */
export const VOTE_PTS = 300;
/** Points each prop artist earns per vote on any dish that used one of their props. */
export const PROP_PTS = 100;

export const DRAW_MS = 75_000;
export const COOK_MS = 150_000;
export const VOTE_MS = 60_000;
export const REVEAL_LEAD_MS = 1_500;
export const REVEAL_STEP_MS = 4_500;
export const STANDINGS_MS = 9_000;

/** Stickers are authored on a square plate in a 0..PLATE_UNITS box. */
export const PLATE_UNITS = 1000;
/** A sticker at scale 1 is this percent of the plate width. */
export const STICKER_BASE_PCT = 24;
