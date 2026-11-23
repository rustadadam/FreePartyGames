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
/** Longest dish title. */
export const TITLE_MAX = 30;

/** How many dishes each player ranks (fewer when fewer than this many are rankable). */
export const RANK_SLOTS = 3;
/** Points the dish creator earns for a 1st, 2nd and 3rd placement. */
export const RANK_PTS: readonly number[] = [300, 200, 100];
/** Points each prop artist earns per top-three placement of a dish that used one of their props. */
export const PROP_PTS = 100;

/** Default drawing and cooking times (the host can change them). */
export const DRAW_MS = 75_000;
export const COOK_MS = 150_000;
export const VOTE_MS = 75_000;
export const REVEAL_LEAD_MS = 1_500;
export const REVEAL_STEP_MS = 4_500;
/** The reveal ends on a closing card (one more step) and then rests this long. */
export const REVEAL_TAIL_MS = 4_000;

/** Stickers are authored on a square plate in a 0..PLATE_UNITS box. */
export const PLATE_UNITS = 1000;
/** A sticker at scale 1 is this percent of the plate width. */
export const STICKER_BASE_PCT = 24;
