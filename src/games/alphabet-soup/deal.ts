// Alphabet Soup's dealing rules: how many groups, how long the words are, who holds which letters.
// Pure TypeScript, shared by logic.ts and the tests.
import type { Rng } from '../../core/rng';
import { AVG_GROUP_MIN, MAX_GROUP, MAX_WORD, MIN_GROUP, MIN_WORD } from './rules';

/** Lowercase, letters a–z only. */
export const normalize = (text: string): string => text.toLowerCase().replace(/[^a-z]/g, '');

/** The letters of `text` in alphabetical order: two words with the same letters sort the same. */
export const sortLetters = (text: string): string => text.split('').sort().join('');

const range = (lo: number, hi: number): number[] => (lo <= hi ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : []);

/** `n` players split into `k` groups as evenly as possible (sizes differ by at most 1). */
export function splitSizes(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0));
}

/**
 * The group counts a round may use for `n` players. At least 2 groups of at most MAX_GROUP, and
 * preferably an average size of AVG_GROUP_MIN..MAX_GROUP; when the room is too small for that,
 * groups may shrink to MIN_GROUP. Fewer than 2 * MIN_GROUP players (someone left) is one group.
 */
export function groupCounts(n: number): number[] {
  if (n <= 0) return [];
  const lo = Math.max(2, Math.ceil(n / MAX_GROUP));
  const preferred = range(lo, Math.floor(n / AVG_GROUP_MIN));
  if (preferred.length) return preferred;
  const smaller = range(lo, Math.floor(n / MIN_GROUP));
  if (smaller.length) return smaller;
  return [Math.ceil(n / MAX_GROUP)];
}

/** Word lengths every group can share: each member holds 1 or 2 letters. */
export function wordLengths(sizes: readonly number[]): number[] {
  const lo = Math.max(MIN_WORD, ...sizes);
  const hi = Math.min(MAX_WORD, 2 * Math.min(...sizes));
  const ok = range(lo, hi);
  return ok.length ? ok : [Math.min(MAX_WORD, lo)];
}

/** Group sizes (shuffled) and the shared word length for one round of `n` players. */
export function planRound(n: number, rng: Rng): { sizes: number[]; length: number } {
  const counts = groupCounts(n);
  if (!counts.length) return { sizes: [], length: MIN_WORD };
  const sizes = rng.shuffle(splitSizes(n, rng.pick(counts)));
  return { sizes, length: rng.pick(wordLengths(sizes)) };
}

/** `k` different words of `length`, fresh ones first; repeats only when the set runs dry. */
export function pickWords(words: readonly string[], length: number, k: number, used: readonly string[], rng: Rng): string[] {
  const all = words.filter((w) => w.length === length);
  const fresh = rng.shuffle(all.filter((w) => !used.includes(w)));
  const stale = rng.shuffle(all.filter((w) => used.includes(w)));
  const out = [...fresh, ...stale].slice(0, k);
  while (out.length < k && all.length) out.push(rng.pick(all));
  return out;
}

/** Deals the shuffled letters of `word` round the shuffled members: 1 or 2 each when it fits. */
export function dealLetters(word: string, members: readonly string[], rng: Rng): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!members.length) return out;
  const order = rng.shuffle(members);
  for (const m of order) out[m] = [];
  rng.shuffle(word.split('')).forEach((c, i) => out[order[i % order.length]].push(c));
  return out;
}
