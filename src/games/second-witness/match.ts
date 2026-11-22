// Second Witness matching and scoring helpers. Pure TypeScript, no zod: logic.ts, the bot and the
// tests all use these, and so can the UI.
import { POINTS, type Outcome } from './rules';

/** One player's answer sitting in a group. `t` is what they wrote, trimmed. */
export interface Member {
  p: string;
  t: string;
}

export interface Group {
  id: number;
  members: Member[];
}

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

/** Auto-matching: answers with the same normalized form share a group. Players are visited in the given order. */
export function groupAnswers(answers: Readonly<Record<string, readonly string[]>>, order: readonly string[]): Member[][] {
  const byKey = new Map<string, Member[]>();
  for (const p of order) {
    for (const t of answers[p] ?? []) {
      const key = normalize(t);
      const list = byKey.get(key);
      if (list) list.push({ p, t });
      else byKey.set(key, [{ p, t }]);
    }
  }
  return [...byKey.values()];
}

/** A merge would collapse one player's two answers into one, so it is not allowed. */
export function canMerge(a: Group, b: Group): boolean {
  return !a.members.some((m) => b.members.some((n) => n.p === m.p));
}

/** Display labels of a group: the distinct spellings, most common first (at most `max`). */
export function labelsOf(g: Group, max = 4): string[] {
  const seen = new Map<string, { t: string; n: number }>();
  for (const m of g.members) {
    const k = m.t.toLowerCase();
    const e = seen.get(k);
    if (e) e.n++;
    else seen.set(k, { t: m.t, n: 1 });
  }
  return [...seen.values()]
    .sort((x, y) => y.n - x.n || x.t.toLowerCase().localeCompare(y.t.toLowerCase()))
    .slice(0, max)
    .map((e) => e.t);
}

/** Round points before the multiplier. `answered` is 0, 1 or 2; `witnessed` counts those answers someone else shared. */
export function basePoints(answered: number, witnessed: number): number {
  if (answered === 1) return witnessed >= 1 ? POINTS.single : 0;
  if (answered === 2) return witnessed >= 2 ? POINTS.second : witnessed === 1 ? POINTS.half : 0;
  return 0;
}

export function outcomeOf(answered: number, witnessed: number): Outcome {
  if (answered === 0) return 'blank';
  if (answered === 1) return witnessed >= 1 ? 'single' : 'none';
  return witnessed >= 2 ? 'second' : witnessed === 1 ? 'half' : 'none';
}

/** Whether two answers look like the same thing worded differently (one normalized text holds the other). */
export function looselyRelated(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y || x === y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && (` ${long} `).includes(` ${short} `);
}
