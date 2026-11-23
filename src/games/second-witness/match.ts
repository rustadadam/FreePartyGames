// Second Witness answer and scoring helpers. Pure TypeScript, no zod: logic.ts, the bot and the
// tests all use these, and so can the UI. Players decide for themselves what matches; `normalize`
// is only for de-duplicating your own two answers.
import { POINTS } from './rules';

function foldWord(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  // cookie / cookies / family / families: both ends meet at -y.
  if (w.length > 4 && (w.endsWith('ies') || w.endsWith('ie'))) return w.replace(/ies?$/, 'y');
  if (/(sses|shes|ches|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 5 && /[^aeiou]oes$/.test(w)) return w.slice(0, -2); // potatoes, heroes
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/**
 * The form two answers are compared in: lowercase, no diacritics or punctuation, "&" as "and",
 * single spaces, no leading the/a/an, and simple plural folding ("temples" = "temple").
 * Returns '' when nothing is left (such an answer is not accepted).
 */
export function normalize(raw: string): string {
  const t = raw
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`.]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const words = t.split(' ').filter(Boolean);
  if (words.length > 1 && (words[0] === 'the' || words[0] === 'a' || words[0] === 'an')) words.shift();
  return words.map(foldWord).join(' ');
}

/** Trims, drops answers that normalize to nothing, and drops a second answer that normalizes like the first. */
export function cleanAnswers(raw: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const t = r.trim();
    const key = normalize(t);
    if (!t || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Points for a player's answers. `answered` is 0, 1 or 2; `witnessed` counts those answers they marked as matched. */
export function basePoints(answered: number, witnessed: number): number {
  if (answered === 1) return witnessed >= 1 ? POINTS.single : 0;
  if (answered === 2) return witnessed >= 2 ? POINTS.second : witnessed === 1 ? POINTS.half : 0;
  return 0;
}

export interface PointsWhy {
  pts: number;
  why: string;
}

/**
 * Where a player's points come from, one line, in plain words, for the PointsNote footer.
 * `matched[j]` says whether answer `j` is marked as matched. No line when nothing is matched yet.
 */
export function pointsWhy(answers: readonly string[], matched: readonly boolean[]): PointsWhy[] {
  const hit = answers.filter((_, j) => matched[j]);
  const pts = basePoints(answers.length, hit.length);
  if (!hit.length) return [];
  if (answers.length === 1) return [{ pts, why: `${hit[0]} matched` }];
  if (hit.length === 2) return [{ pts, why: `${hit[0]} and ${hit[1]} both matched` }];
  const miss = answers.find((_, j) => !matched[j]);
  return [{ pts, why: `${hit[0]} matched, ${miss} did not` }];
}
