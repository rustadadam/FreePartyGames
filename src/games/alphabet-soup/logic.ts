// Alphabet Soup: find the people who share your color, then unscramble your group's word together.
// Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now.
//
// Rules (also shown in the Rules text of ui.tsx; constants live in rules.ts, dealing in deal.ts):
//  - Several rounds (host setting). Each round the players who are here are split into groups of
//    3–6 (2+ groups, sizes within one of each other, averaging 4–6 when the room allows), each
//    group gets a color and a word, and every group's word has the same length (at most 6).
//  - Each player's phone shows only their own 1 or 2 letters, in their group's color. Nobody is
//    told who else is in their group: they find each other by color.
//  - Any member may type the group's word. Only the group's own word counts. A wrong guess tells
//    the guesser whether it used the group's letters ("right letters, wrong word") or not.
//  - Each member of a group that solves scores 1 point per second left on the clock (rounded
//    up); the first group to solve also gets FIRST_BONUS each. A group that runs out of time
//    scores nothing.
//  - The round ends when every group has solved its word, or when time runs out. Then every
//    word is revealed, and the next round deals new colors, groups and words.
//  - A player who leaves hands their letters to the teammate holding the fewest, so the group
//    can still solve. A player who comes back mid-round sits out until the next deal.
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import type { SettingField } from '../../shared/types';
import { DEFAULT_WORD_SET, wordSetById } from './content';
import { dealLetters, normalize, pickWords, planRound, sortLetters } from './deal';
import { FIRST_BONUS, GROUP_COLORS, MAX_GUESS_LEN, MAX_PLAYERS, MIN_PLAYERS, REVEAL_MS, ROUND_MS } from './rules';

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('guess'), word: z.string().min(1).max(MAX_GUESS_LEN) }).strict(),
]);
export type ASAction = z.infer<typeof actionSchema>;

export interface ASSettings {
  rounds: number;
  /** Seconds each round lasts at most. */
  roundSeconds: number;
}

const settingsFields: SettingField[] = [
  { key: 'rounds', label: 'Rounds', hint: 'New colors and words each round', min: 1, max: 10, step: 1 },
  { key: 'roundSeconds', label: 'Round time', hint: 'To find your group and solve', min: 30, max: 180, step: 15, unit: 's' },
];

export type Phase = 'play' | 'reveal' | 'done';

export type Verdict = 'wrong' | 'notYourLetters';

export interface Group {
  /** Index into GROUP_COLORS. */
  color: number;
  members: string[];
  word: string;
  /** Who holds which letters. Secret: each player sees only their own. */
  letters: Record<string, string[]>;
  /** ms the group took to solve, or null. */
  solvedIn: number | null;
  solvedBy: string | null;
  /** 1 = first to solve. */
  place: number | null;
  /** Points each member earned this round. */
  points: number;
}

export interface ASState {
  playerIds: string[];
  gone: string[];
  rounds: number;
  roundMs: number;
  wordSet: string;
  /** 1-based. */
  round: number;
  phase: Phase;
  /** Server ms the current phase ends. */
  deadline: number;
  wordLen: number;
  /** Words dealt so far this game (fresh words first). */
  used: string[];
  groups: Group[];
  /** Player -> index into groups, for this round. Players not dealt in have no entry. */
  groupOf: Record<string, number>;
  /** Each player's last wrong guess this round. */
  feedback: Record<string, { guess: string; verdict: Verdict; n: number }>;
  scores: Record<string, number>;
  /** Quickest solve of the game, for the summary. */
  best: { color: number; word: string; ms: number } | null;
}

/** One group as everyone may see it. `word` and `members` only once the round is over. */
export interface GroupView {
  color: number;
  size: number;
  solved: boolean;
  place: number | null;
  solvedIn: number | null;
  points: number;
  word: string | null;
  members: string[] | null;
}

export interface ASView {
  phase: Phase;
  round: number;
  rounds: number;
  roundMs: number;
  deadline: number | null;
  wordSet: string;
  /** Every group's word has this many letters. */
  wordLen: number;
  groups: GroupView[];
  scores: Record<string, number>;
  /** Only about the viewing player. Null for the screen and for spectators. */
  you: null | {
    /** Your group's index into `groups`, or null when you were not dealt in this round. */
    group: number | null;
    /** Your own letters, and nobody else's. */
    letters: string[];
    /** Your group's word, once your group has solved it (or the round is over). */
    word: string | null;
    solvedBy: string | null;
    feedback: { guess: string; verdict: Verdict; n: number } | null;
  };
}

const present = (s: ASState): string[] => s.playerIds.filter((p) => !s.gone.includes(p));

function arm(s: ASState, ctx: GameCtx, ms: number): void {
  ctx.clearTimer('phase');
  ctx.setTimer('phase', ms);
  s.deadline = ctx.now() + ms;
}

function startRound(s: ASState, ctx: GameCtx): void {
  s.round++;
  s.phase = 'play';
  s.feedback = {};
  const here = ctx.rng.shuffle(present(s));
  const { sizes, length } = planRound(here.length, ctx.rng);
  const words = pickWords(wordSetById(s.wordSet).words, length, sizes.length, s.used, ctx.rng);
  const colors = ctx.rng.shuffle(GROUP_COLORS.map((_, i) => i));
  s.wordLen = length;
  s.groups = [];
  s.groupOf = {};
  let at = 0;
  sizes.forEach((size, g) => {
    const members = here.slice(at, at + size);
    at += size;
    const word = words[g];
    s.used.push(word);
    s.groups.push({ color: colors[g % colors.length], members, word, letters: dealLetters(word, members, ctx.rng), solvedIn: null, solvedBy: null, place: null, points: 0 });
    for (const m of members) s.groupOf[m] = g;
  });
  arm(s, ctx, s.roundMs);
  checkRoundOver(s, ctx);
}

/** The round ends once every group that still has someone here has solved. */
function checkRoundOver(s: ASState, ctx: GameCtx): void {
  if (s.phase !== 'play') return;
  const live = s.groups.filter((g) => g.members.some((m) => !s.gone.includes(m)));
  if (live.every((g) => g.place !== null)) endRound(s, ctx);
}

function endRound(s: ASState, ctx: GameCtx): void {
  s.phase = 'reveal';
  arm(s, ctx, REVEAL_MS);
}

function solve(s: ASState, ctx: GameCtx, g: Group, by: string): void {
  const now = ctx.now();
  const place = s.groups.filter((x) => x.place !== null).length + 1;
  g.place = place;
  g.solvedBy = by;
  g.solvedIn = Math.max(0, s.roundMs - (s.deadline - now));
  g.points = Math.max(1, Math.ceil((s.deadline - now) / 1000)) + (place === 1 ? FIRST_BONUS : 0);
  for (const m of g.members) s.scores[m] = (s.scores[m] ?? 0) + g.points;
  if (!s.best || g.solvedIn < s.best.ms) s.best = { color: g.color, word: g.word, ms: g.solvedIn };
}

function groupView(s: ASState, g: Group): GroupView {
  const open = s.phase !== 'play';
  return {
    color: g.color,
    size: g.members.length,
    solved: g.place !== null,
    place: g.place,
    solvedIn: g.solvedIn,
    points: g.points,
    word: open ? g.word : null,
    members: open ? g.members : null,
  };
}

// ---------- bot ----------

/** True when `letters` can all be found in `word` (counting repeats). */
function holds(word: string, letters: readonly string[]): boolean {
  const pool = word.split('');
  for (const c of letters) {
    const i = pool.indexOf(c);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

// ---------- the game ----------

export default defineGame<ASState, ASAction, ASSettings>({
  manifest: {
    id: 'alphabet-soup',
    title: 'Alphabet Soup',
    tagline: 'Find everyone who shares your color, then unscramble your word together.',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    screen: 'optional',
    estMinutes: 8,
  },
  defaultSettings: { rounds: 5, roundSeconds: ROUND_MS / 1000 },
  settingsFields,
  actionSchema,

  setup(ctx, players, settings) {
    const s: ASState = {
      playerIds: players.map((p) => p.id),
      gone: [],
      rounds: settings.rounds,
      roundMs: settings.roundSeconds * 1000,
      wordSet: DEFAULT_WORD_SET,
      round: 0,
      phase: 'play',
      deadline: 0,
      wordLen: 0,
      used: [],
      groups: [],
      groupOf: {},
      feedback: {},
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      best: null,
    };
    startRound(s, ctx);
    return s;
  },

  onAction(s, ctx, playerId, a) {
    if (s.phase !== 'play' || s.gone.includes(playerId)) return;
    const g = s.groups[s.groupOf[playerId] ?? -1];
    if (!g || g.place !== null) return;
    const guess = normalize(a.word);
    if (!guess) return;
    if (guess === g.word) {
      solve(s, ctx, g, playerId);
      checkRoundOver(s, ctx);
      return;
    }
    const n = (s.feedback[playerId]?.n ?? 0) + 1;
    s.feedback[playerId] = { guess: guess.slice(0, g.word.length + 4), verdict: sortLetters(guess) === sortLetters(g.word) ? 'wrong' : 'notYourLetters', n };
  },

  onTimer(s, ctx, key) {
    if (key !== 'phase') return;
    if (s.phase === 'play') endRound(s, ctx);
    else if (s.phase === 'reveal') {
      if (s.round >= s.rounds) {
        s.phase = 'done';
        s.deadline = 0;
        ctx.clearTimer('phase');
      } else startRound(s, ctx);
    }
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.gone.includes(playerId)) s.gone.push(playerId);
    if (s.phase !== 'play') return;
    const g = s.groups[s.groupOf[playerId] ?? -1];
    const mine = g?.letters[playerId] ?? [];
    if (g && mine.length) {
      // Hand the letters to the teammate still here who holds the fewest.
      const heir = g.members
        .filter((m) => m !== playerId && !s.gone.includes(m))
        .sort((x, y) => (g.letters[x]?.length ?? 0) - (g.letters[y]?.length ?? 0))[0];
      if (heir) {
        g.letters[heir] = [...(g.letters[heir] ?? []), ...mine];
        g.letters[playerId] = [];
      }
    }
    checkRoundOver(s, ctx);
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((p) => p !== playerId);
  },

  view(s, viewer): ASView {
    const me = viewer.kind === 'player' && s.playerIds.includes(viewer.id) ? viewer.id : null;
    let you: ASView['you'] = null;
    if (me) {
      const gi = s.groupOf[me];
      const g = gi === undefined ? undefined : s.groups[gi];
      const known = !!g && (g.place !== null || s.phase !== 'play');
      you = {
        group: g ? gi : null,
        letters: g?.letters[me] ?? [],
        word: known ? g.word : null,
        solvedBy: g?.solvedBy ?? null,
        feedback: s.phase === 'play' ? (s.feedback[me] ?? null) : null,
      };
    }
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      roundMs: s.roundMs,
      deadline: s.phase === 'done' ? null : s.deadline,
      wordSet: s.wordSet,
      wordLen: s.wordLen,
      groups: s.groups.map((g) => groupView(s, g)),
      scores: s.scores,
      you,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    const b = s.best;
    const summary = b
      ? `Fastest bowl: ${GROUP_COLORS[b.color].name} unscrambled "${b.word}" in ${Math.max(1, Math.round(b.ms / 1000))}s`
      : 'Nobody unscrambled a word in time';
    return { scores: { ...s.scores }, summary };
  },

  bot: {
    act(view, rng) {
      const v = view as ASView;
      const you = v.you;
      if (v.phase !== 'play' || !you || you.group === null || !you.letters.length) return null;
      // Slow on purpose: bots fill seats in dev, and a round should last long enough to look at.
      if (v.groups[you.group]?.solved || !rng.chance(0.04)) return null;
      // Guess a word from the set that could hold this bot's letters.
      const fits = wordSetById(v.wordSet).words.filter((w) => w.length === v.wordLen && holds(w, you.letters));
      return { type: 'guess', word: fits.length ? rng.pick(fits) : you.letters.join('') };
    },
  },
});
