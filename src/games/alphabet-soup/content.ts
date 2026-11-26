// Alphabet Soup word sets. To add a set, append one entry to WORD_SETS: words are lowercase a–z,
// MIN_WORD..MAX_WORD letters (rules.ts), and each length needs at least 7 words (one per group
// color). Leave out words whose letters spell another everyday word (leaf/flea, pear/reap): only
// the set's own word is accepted, so the other spelling would feel like a right answer marked wrong.

export interface WordSet {
  id: string;
  title: string;
  words: readonly string[];
}

const HARVEST: WordSet = {
  id: 'harvest',
  title: 'Thanksgiving & Fall',
  words: [
    // 3 letters
    'pie', 'hay', 'cob', 'ham', 'oat', 'nut', 'elm', 'oak', 'fog',
    // 4 letters
    'fall', 'corn', 'plum', 'herb', 'bake', 'cook', 'dish', 'fork', 'roll', 'soup', 'tart', 'warm',
    'wind', 'wood', 'gold', 'bowl', 'cozy',
    // 5 letters
    'crisp', 'feast', 'gravy', 'gourd', 'apple', 'pecan', 'spice', 'clove', 'thyme', 'acorn',
    'frost', 'chill', 'scarf', 'boots', 'quilt', 'plaid', 'amber', 'brown', 'maize', 'wheat',
    'grain', 'roast', 'slice', 'thank', 'bless', 'grace', 'peace', 'unity', 'guest', 'toast',
    // 6 letters
    'autumn', 'turkey', 'squash', 'potato', 'carrot', 'celery', 'garlic', 'butter', 'nutmeg',
    'pastry', 'muffin', 'kernel', 'bushel', 'meadow', 'breeze', 'chilly', 'candle', 'wreath',
    'ribbon', 'gather', 'family', 'cousin', 'dinner', 'supper', 'buffet', 'goblet', 'carafe',
    'napkin', 'saucer', 'simmer', 'season', 'cheers', 'bounty', 'plenty', 'giving', 'memory',
    'joyous', 'copper', 'russet', 'auburn', 'maroon', 'orange', 'yellow',
  ],
};

export const WORD_SETS: readonly WordSet[] = [HARVEST];

export const DEFAULT_WORD_SET = HARVEST.id;

export function wordSetById(id: string): WordSet {
  return WORD_SETS.find((w) => w.id === id) ?? HARVEST;
}
