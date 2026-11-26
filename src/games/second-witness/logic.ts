// Second Witness: each round, everyone answers a category prompt with one or two answers, hoping
// someone else wrote the same thing. Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now.
//
// Rules (also shown in the Rules text of ui.tsx; constants live in rules.ts):
//  - Several rounds (5, host setting), each with a new prompt and two phases.
//  - Write (30 s, host setting): each player locks in one or two answers (<= 40 chars). Two answers that
//    normalize the same count as one. A half-typed answer is sent as a `draft` and submitted when the
//    timer runs out. The phase ends early when every present player has locked in.
//  - Match (no turns): players say their words out loud, round the room, and on their own phone tap
//    the words that someone else matched. It is an honor system: the game does not check. Each player
//    sees only their own words. The phase ends when every present player has checked off Done (a
//    player who wrote nothing has nothing to do, so counts as done); Done can be undone until then.
//    A backstop timer (120 s, host setting) ends it anyway.
//  - Scoring: one answer, matched: 3. Two answers, both matched: 5; only one: 1. Otherwise 0.
//  - Points add up over the rounds. After the last round the game is over: the shell's podium and
//    ranking take it from here.
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import type { SettingField } from '../../shared/types';
import { GENERIC_ANSWERS, PROMPTS, PROMPT_BY_ID } from './content';
import { basePoints, cleanAnswers, pointsWhy, type PointsWhy } from './match';
import { MATCH_MS, MAX_ANSWER_LEN, MAX_PLAYERS, MAX_ROUNDS, MIN_PLAYERS, ROUNDS, WRITE_MS } from './rules';

const Answer = z
  .string()
  .max(MAX_ANSWER_LEN * 4)
  .transform((t) => t.trim())
  .pipe(z.string().min(1).max(MAX_ANSWER_LEN));

/** The same limits as a real answer, except that a half-typed line may be empty. */
const DraftLine = z
  .string()
  .max(MAX_ANSWER_LEN * 4)
  .transform((t) => t.trim())
  .pipe(z.string().max(MAX_ANSWER_LEN));

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit'), answers: z.array(Answer).min(1).max(2) }).strict(),
  /** Autosave of the two input lines (see docs/ADDING_A_GAME.md, Drafts). Never locks the player in. */
  z.object({ type: z.literal('draft'), answers: z.array(DraftLine).min(1).max(2) }).strict(),
  /** "Someone else matched my word `word`" (on), or taking it back (off). */
  z.object({ type: z.literal('match'), word: z.number().int().min(0).max(1), on: z.boolean() }).strict(),
  /** Checks off (or un-checks) Done. */
  z.object({ type: z.literal('done'), on: z.boolean() }).strict(),
]);
export type SWAction = z.infer<typeof actionSchema>;

/** Set by the host in the lobby. */
export interface SWSettings {
  /** How many prompts the game plays. */
  rounds: number;
  /** How long everyone has to write their words. */
  writeSeconds: number;
  /** Backstop for the matching phase: it normally ends when everyone is Done. */
  matchSeconds: number;
}

const settingsFields: SettingField[] = [
  { key: 'rounds', label: 'Rounds', hint: 'A new category each round', min: 1, max: MAX_ROUNDS, step: 1 },
  { key: 'writeSeconds', label: 'Writing time', hint: 'To write your words', min: 10, max: 90, step: 5, unit: 's' },
  { key: 'matchSeconds', label: 'Matching time', hint: 'At most, if someone forgets to tap Done', min: 30, max: 300, step: 15, unit: 's' },
];

export type Phase = 'write' | 'match' | 'done';

export interface SWState {
  playerIds: string[];
  gone: string[];
  /** Phase lengths chosen by the host, in ms. */
  writeMs: number;
  matchMs: number;
  /** One prompt per round, all different, in round order. */
  promptIds: string[];
  /** 1-based. */
  round: number;
  phase: Phase;
  /** Server ms the current phase times out (0 when none). */
  deadline: number;
  /** Locked-in answers (1 or 2 each, already de-duplicated). */
  answers: Record<string, string[]>;
  /** Half-typed answers, by player, during write only. Never in any view but the author's own. */
  drafts: Record<string, string[]>;
  /** Indexes of each player's words they marked as matched. */
  matched: Record<string, number[]>;
  /** Players who checked off Done. */
  done: string[];
  /** Points from the rounds already played (this round's live points are added on top). */
  totals: Record<string, number>;
  /** Words marked as matched over the finished rounds, for the results summary. */
  witnessed: number;
}

export interface SWView {
  phase: Phase;
  round: number;
  rounds: number;
  /** The prompt's place in the pack, shown as the "chapter" on the plate. */
  chapter: number;
  deadline: number | null;
  /** Length of the phase, for the timer ring. */
  writeMs: number;
  matchMs: number;
  players: string[];
  gone: string[];
  prompt: { id: string; text: string };
  /** Write: who has locked in. Never any answers. */
  locked: string[];
  /** Match: who is done (players with nothing to match count as done). */
  done: string[];
  /** Only about the viewing player, and never about anyone else. */
  you: null | {
    /** Your own locked answers. */
    answers: string[] | null;
    /** Your own half-typed answers, to restore the inputs after a reload (write only). */
    draft: string[] | null;
    /** Per answer of yours: marked as matched. */
    matched: boolean[];
    done: boolean;
    /** This round's points and why, live as you tap. */
    points: number;
    why: PointsWhy[];
    /** Points from the earlier rounds. */
    banked: number;
  };
}

const present = (s: SWState): string[] => s.playerIds.filter((p) => !s.gone.includes(p));

/** A player with no words has nothing to match, so never holds the room up. */
const isDone = (s: SWState, p: string): boolean => s.done.includes(p) || !(s.answers[p]?.length ?? 0);

const matchedFlags = (s: SWState, p: string): boolean[] => (s.answers[p] ?? []).map((_, j) => (s.matched[p] ?? []).includes(j));
const pointsOf = (s: SWState, p: string): number => basePoints(s.answers[p]?.length ?? 0, matchedFlags(s, p).filter(Boolean).length);

function arm(s: SWState, ctx: GameCtx, ms: number): void {
  ctx.clearTimer('phase');
  ctx.setTimer('phase', ms);
  s.deadline = ctx.now() + ms;
}

// ---------- phases ----------

function endWrite(s: SWState, ctx: GameCtx): void {
  // The timer ran out: a half-typed answer is submitted for whoever has not locked in.
  for (const p of s.playerIds) {
    if (s.answers[p] !== undefined) continue;
    const draft = cleanAnswers(s.drafts[p] ?? []);
    if (draft.length) s.answers[p] = draft;
  }
  s.drafts = {};
  s.phase = 'match';
  arm(s, ctx, s.matchMs);
  checkDone(s, ctx);
}

/** Matching is over: bank this round's points, then start the next round or end the game. */
function endRound(s: SWState, ctx: GameCtx): void {
  for (const p of s.playerIds) {
    s.totals[p] = (s.totals[p] ?? 0) + pointsOf(s, p);
    s.witnessed += matchedFlags(s, p).filter(Boolean).length;
  }
  s.answers = {};
  s.drafts = {};
  s.matched = {};
  s.done = [];
  if (s.round < s.promptIds.length) {
    s.round += 1;
    s.phase = 'write';
    arm(s, ctx, s.writeMs);
    return;
  }
  s.phase = 'done';
  s.deadline = 0;
  ctx.clearTimer('phase');
}

function checkDone(s: SWState, ctx: GameCtx): void {
  if (s.phase === 'write') {
    if (present(s).every((p) => s.answers[p] !== undefined)) endWrite(s, ctx);
  } else if (s.phase === 'match') {
    if (present(s).every((p) => isDone(s, p))) endRound(s, ctx);
  }
}

// ---------- the game ----------

export default defineGame<SWState, SWAction, SWSettings>({
  manifest: {
    id: 'second-witness',
    title: 'Second Witness',
    tagline: 'A matching game: write what the others will write.',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    screen: 'optional',
    estMinutes: 10,
  },
  defaultSettings: { rounds: ROUNDS, writeSeconds: WRITE_MS / 1000, matchSeconds: MATCH_MS / 1000 },
  settingsFields,
  actionSchema,

  setup(ctx, players, settings) {
    const s: SWState = {
      playerIds: players.map((p) => p.id),
      gone: [],
      writeMs: settings.writeSeconds * 1000,
      matchMs: settings.matchSeconds * 1000,
      promptIds: ctx.rng
        .shuffle(PROMPTS)
        .slice(0, Math.max(1, Math.min(MAX_ROUNDS, Math.round(settings.rounds) || ROUNDS)))
        .map((p) => p.id),
      round: 1,
      phase: 'write',
      deadline: 0,
      answers: {},
      drafts: {},
      matched: {},
      done: [],
      totals: {},
      witnessed: 0,
    };
    arm(s, ctx, s.writeMs);
    return s;
  },

  onAction(s, ctx, playerId, a) {
    if (!s.playerIds.includes(playerId) || s.gone.includes(playerId)) return;
    switch (a.type) {
      case 'submit': {
        if (s.phase !== 'write' || s.answers[playerId] !== undefined) return;
        const answers = cleanAnswers(a.answers);
        if (!answers.length) return;
        s.answers[playerId] = answers;
        delete s.drafts[playerId];
        break;
      }
      case 'draft':
        // Never locks in, never ends the phase, never shows in a view (only the author's own).
        if (s.phase === 'write' && s.answers[playerId] === undefined) s.drafts[playerId] = a.answers;
        return;
      case 'match': {
        const n = s.answers[playerId]?.length ?? 0;
        if (s.phase !== 'match' || a.word >= n || isDone(s, playerId)) return;
        const rest = (s.matched[playerId] ?? []).filter((j) => j !== a.word);
        s.matched[playerId] = a.on ? [...rest, a.word].sort() : rest;
        return;
      }
      case 'done': {
        if (s.phase !== 'match' || !s.answers[playerId]?.length) return;
        s.done = s.done.filter((p) => p !== playerId);
        if (a.on) s.done.push(playerId);
        break;
      }
    }
    checkDone(s, ctx);
  },

  onTimer(s, ctx, key) {
    if (key !== 'phase') return;
    if (s.phase === 'write') endWrite(s, ctx);
    else if (s.phase === 'match') endRound(s, ctx);
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.gone.includes(playerId)) s.gone.push(playerId);
    checkDone(s, ctx);
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((p) => p !== playerId);
  },

  view(s, viewer): SWView {
    const me = viewer.kind === 'player' && s.playerIds.includes(viewer.id) ? viewer.id : null;
    const promptId = s.promptIds[s.round - 1] ?? '';
    const pr = PROMPT_BY_ID.get(promptId);
    let you: SWView['you'] = null;
    if (me) {
      const answers = s.answers[me] ?? null;
      const matched = matchedFlags(s, me);
      you = {
        answers,
        draft: s.phase === 'write' && !answers ? (s.drafts[me] ?? null) : null,
        matched,
        done: s.done.includes(me),
        points: pointsOf(s, me),
        why: answers ? pointsWhy(answers, matched) : [],
        banked: s.totals[me] ?? 0,
      };
    }
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.promptIds.length,
      chapter: Math.max(0, PROMPTS.findIndex((p) => p.id === promptId)) + 1,
      deadline: s.deadline || null,
      writeMs: s.writeMs,
      matchMs: s.matchMs,
      players: s.playerIds,
      gone: s.gone,
      prompt: { id: pr?.id ?? '', text: pr?.text ?? '' },
      locked: s.phase === 'write' ? Object.keys(s.answers) : [],
      done: s.phase === 'match' ? s.playerIds.filter((p) => isDone(s, p)) : [],
      you,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    const scores = Object.fromEntries(s.playerIds.map((p) => [p, s.totals[p] ?? 0]));
    const n = s.promptIds.length;
    const words = s.witnessed === 1 ? '1 word' : `${s.witnessed} words`;
    return { scores, summary: `${words} found a second witness over ${n} ${n === 1 ? 'round' : 'rounds'}` };
  },

  bot: {
    act(view, rng, me) {
      const v = view as SWView;
      if (!v.you || v.gone.includes(me)) return null;
      if (v.phase === 'write') {
        if (v.you.answers || !rng.chance(0.6)) return null;
        const prompt = PROMPT_BY_ID.get(v.prompt.id);
        const pool = prompt && prompt.samples.length >= 2 ? prompt.samples : GENERIC_ANSWERS;
        const picks = rng.shuffle(pool).slice(0, rng.chance(0.5) ? 1 : 2);
        return { type: 'submit', answers: picks.map((t) => t.slice(0, MAX_ANSWER_LEN)) };
      }
      if (v.phase === 'match' && v.you.answers && !v.you.done) {
        // Sometimes tap a word as matched, then check off Done.
        const open = v.you.matched.map((m, j) => (m ? -1 : j)).filter((j) => j >= 0);
        if (open.length && rng.chance(0.4)) return { type: 'match', word: rng.pick(open), on: true };
        if (rng.chance(0.5)) return { type: 'done', on: true };
      }
      return null;
    },
  },
});
