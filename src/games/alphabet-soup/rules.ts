// Alphabet Soup constants shared by logic.ts (server) and ui.tsx (client). No imports, no zod:
// the UI may import values from here without dragging the game logic into its chunk.

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 30;

/** Word lengths a round can use. Every player holds 1 or 2 letters, so a group of n needs n..2n. */
export const MIN_WORD = 3;
export const MAX_WORD = 6;

/** Group sizes. Groups average 4–6; 3 only when the room is too small for more. */
export const MIN_GROUP = 3;
export const MAX_GROUP = MAX_WORD;
/** Preferred smallest average group size. */
export const AVG_GROUP_MIN = 4;

/** Time to find your group and unscramble (the default of the host's "Round time" setting). */
export const ROUND_MS = 90_000;
/** The words are shown, then the next round deals. */
export const REVEAL_MS = 9_000;

/** Extra points for each member of the first group to solve its word. */
export const FIRST_BONUS = 30;

/** Longest guess accepted, in characters before cleaning. */
export const MAX_GUESS_LEN = 24;

/** Group colors, in no particular order. Each has a name to call out across the room. */
export const GROUP_COLORS = [
  { name: 'Red', hex: '#ff5b5b' },
  { name: 'Blue', hex: '#4fa9ff' },
  { name: 'Yellow', hex: '#ffd84a' },
  { name: 'Green', hex: '#6fdc5c' },
  { name: 'Purple', hex: '#b98aff' },
  { name: 'Teal', hex: '#3fd9c8' },
  { name: 'Pink', hex: '#ff86cf' },
] as const;
