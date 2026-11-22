// Second Witness: everyone answers a category prompt with one or two answers, hoping someone else
// wrote the same thing. Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now.
//
// Rules (also shown in the Rules text of ui.tsx; constants live in rules.ts):
//  - 6 rounds, score multipliers x1 x1 x2 x2 x3 x3. Each round has a different prompt.
//  - Write (30 s): each player locks in one or two answers (<= 40 chars). Two answers that normalize
//    the same count as one. Nobody sees anyone else's answers until their turn.
//  - Call: the players who wrote something take turns in a random order. On a player's turn their
//    words are shown to everybody, and every other player has 3 s to say which of their own words
//    match (drag a word onto the other, or tap one then the other). Players decide for themselves;
//    the game does not check. A word is matched once any claim touches it, on either side.
//    The turn ends early when every word in the room is matched or already failed.
//  - Result (between turns): a word that nobody matched fails with an error, and every player sees
//    the points they just earned. Failed words cannot match later.
//  - Scoring: one answer, matched: 3. Two answers, both matched: 5; only one: 1. Otherwise 0.
//    Times the round's multiplier. Points are added at the end of each turn.
//  - Unique thinker: 3+ rounds with two answers and 0 points earns a flat +10 at the end.
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import type { SettingField } from '../../shared/types';
import { PROMPTS, PROMPT_BY_ID, GENERIC_ANSWERS } from './content';
import { basePoints, cleanAnswers, looselyRelated, normalize, outcomeOf } from './match';
import {
  CALL_MS,
  FINAL_MS,
  MAX_ANSWER_LEN,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MULTIPLIERS,
  RESULT_MS,
  ROUNDS,
  STANDINGS_MS,
  UNIQUE_BONUS,
  UNIQUE_MIN_ROUNDS,
  WRITE_MS,
  type Outcome,
} from './rules';

const Answer = z
  .string()
  .max(MAX_ANSWER_LEN * 4)
  .transform((t) => t.trim())
  .pipe(z.string().min(1).max(MAX_ANSWER_LEN));

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit'), answers: z.array(Answer).min(1).max(2) }).strict(),
  /** "My word `mine` matches the word `theirs` of the player whose turn it is." Sent again, it takes the claim back. */
  z.object({ type: z.literal('match'), mine: z.number().int().min(0).max(1), theirs: z.number().int().min(0).max(1) }).strict(),
]);
export type SWAction = z.infer<typeof actionSchema>;

/** Seconds, set by the host in the lobby. */
export interface SWSettings {
  /** How long everyone has to write their words. */
  writeSeconds: number;
  /** How long each player's words are up for matching. */
  callSeconds: number;
}

const settingsFields: SettingField[] = [
  { key: 'writeSeconds', label: 'Writing time', hint: 'To write your words each round', min: 10, max: 90, step: 5, unit: 's' },
  { key: 'callSeconds', label: 'Matching time', hint: 'Per player, to match their words', min: 2, max: 10, step: 1, unit: 's' },
];

export type Phase = 'write' | 'call' | 'result' | 'reveal' | 'final' | 'done';

/** `by` says their word `mine` matches word `theirs` of `target`, on target's turn. */
interface Claim {
  target: string;
  by: string;
  mine: number;
  theirs: number;
}

export interface SWState {
  playerIds: string[];
  gone: string[];
  /** Phase lengths chosen by the host, in ms. */
  writeMs: number;
  callMs: number;
  /** The six prompt ids, in round order. */
  promptIds: string[];
  /** 1-based. */
  round: number;
  phase: Phase;
  /** Server ms the current phase times out (0 when none). */
  deadline: number;
  /** Locked-in answers this round (1 or 2 each, already de-duplicated). */
  answers: Record<string, string[]>;
  /** This round's turns: the players who wrote something, in random order. `turn` indexes it. */
  order: string[];
  turn: number;
  claims: Claim[];
  /** Word indexes that nobody matched by the end of their owner's turn (they failed). */
  dead: Record<string, number[]>;
  /** Points each player earned in the turn that just ended (result phase). */
  turnPts: Record<string, number>;
  /** This round's multiplied points and outcome per player. */
  roundPts: Record<string, number>;
  outcome: Record<string, Outcome>;
  /** Running totals, without the Unique thinker bonus. */
  totals: Record<string, number>;
  /** Rounds in which the player wrote two answers and scored 0. */
  twoZero: Record<string, number>;
  /** Players who earned the Unique thinker bonus (set when the final starts). */
  bonus: string[];
}

export interface SWView {
  phase: Phase;
  round: number;
  rounds: number;
  mult: number;
  deadline: number | null;
  /** Length of the write and call phases, for the timer ring. */
  writeMs: number;
  callMs: number;
  players: string[];
  gone: string[];
  prompt: { id: string; text: string };
  /** Write: who has locked in. Never any answers. */
  locked: string[];
  you: null | {
    /** Your own locked answers. */
    answers: string[] | null;
    /** Per answer of yours: matched, or failed. */
    matched: boolean[];
    dead: boolean[];
    /** Per answer of yours: the word of the active player you matched it with this turn. */
    claims: (number | null)[];
  };
  /** Call and result: whose turn it is and their words, the only other player's words anyone sees. */
  call: null | {
    active: string;
    turn: number;
    turns: number;
    /** `matchers`: players whose word matched this one. `error`: nobody did (result only). */
    words: { text: string; matchers: string[]; error: boolean }[];
    /** Result only: the points each player earned in this turn. */
    pts: Record<string, number>;
  };
  reveal: null | {
    pts: Record<string, number>;
    outcome: Record<string, Outcome>;
  };
  /** Totals so far, including this round's points. The bonus is added at the final. */
  scores: Record<string, number>;
  bonus: string[];
  twoZero: Record<string, number>;
}

const present = (s: SWState): string[] => s.playerIds.filter((p) => !s.gone.includes(p));
const mult = (s: SWState): number => MULTIPLIERS[Math.min(s.round, ROUNDS) - 1] ?? 1;

function arm(s: SWState, ctx: GameCtx, ms: number): void {
  ctx.clearTimer('phase');
  ctx.setTimer('phase', ms);
  s.deadline = ctx.now() + ms;
}

// ---------- matches ----------

const isMatched = (s: SWState, p: string, j: number): boolean => s.claims.some((c) => (c.target === p && c.theirs === j) || (c.by === p && c.mine === j));
const isDead = (s: SWState, p: string, j: number): boolean => s.dead[p]?.includes(j) ?? false;
const matchedCount = (s: SWState, p: string): number => (s.answers[p] ?? []).filter((_, j) => isMatched(s, p, j)).length;

/** Every word of every player here is matched or has failed: nothing is left to call. */
function settled(s: SWState): boolean {
  return present(s).every((p) => (s.answers[p] ?? []).every((_, j) => isMatched(s, p, j) || isDead(s, p, j)));
}

// ---------- phases ----------

function startRound(s: SWState, ctx: GameCtx): void {
  s.round++;
  s.phase = 'write';
  s.answers = {};
  s.order = [];
  s.turn = -1;
  s.claims = [];
  s.dead = {};
  s.turnPts = {};
  s.roundPts = {};
  s.outcome = {};
  arm(s, ctx, s.writeMs);
}

function endWrite(s: SWState, ctx: GameCtx): void {
  s.order = ctx.rng.shuffle(present(s).filter((p) => s.answers[p]));
  s.turn = -1;
  nextTurn(s, ctx);
}

/** Opens the next player's turn, or ends the round when everyone has had one or nothing is left to match. */
function nextTurn(s: SWState, ctx: GameCtx): void {
  s.turn++;
  while (s.turn < s.order.length && s.gone.includes(s.order[s.turn])) s.turn++;
  if (s.turn >= s.order.length || settled(s)) {
    toReveal(s, ctx);
    return;
  }
  s.phase = 'call';
  s.turnPts = {};
  arm(s, ctx, s.callMs);
}

/** Closes the turn: unmatched words of the active player fail, and the points are paid. */
function endTurn(s: SWState, ctx: GameCtx): void {
  const active = s.order[s.turn];
  (s.answers[active] ?? []).forEach((_, j) => {
    if (!isMatched(s, active, j)) (s.dead[active] ??= []).push(j);
  });
  const m = mult(s);
  s.turnPts = {};
  for (const p of s.playerIds) {
    const now = basePoints(s.answers[p]?.length ?? 0, matchedCount(s, p)) * m;
    const gained = now - (s.roundPts[p] ?? 0);
    s.roundPts[p] = now;
    s.totals[p] = (s.totals[p] ?? 0) + gained;
    s.turnPts[p] = gained;
  }
  s.phase = 'result';
  arm(s, ctx, RESULT_MS);
}

function toReveal(s: SWState, ctx: GameCtx): void {
  for (const p of s.playerIds) {
    const answered = s.answers[p]?.length ?? 0;
    s.outcome[p] = outcomeOf(answered, matchedCount(s, p));
    if (answered === 2 && (s.roundPts[p] ?? 0) === 0) s.twoZero[p] = (s.twoZero[p] ?? 0) + 1;
  }
  s.phase = 'reveal';
  arm(s, ctx, STANDINGS_MS);
}

function checkDone(s: SWState, ctx: GameCtx): void {
  if (s.phase === 'write') {
    if (present(s).every((p) => s.answers[p] !== undefined)) endWrite(s, ctx);
  } else if (s.phase === 'call') {
    if (s.gone.includes(s.order[s.turn]) || settled(s)) endTurn(s, ctx);
  }
}

// ---------- the game ----------

/** Totals so far for every player. The bonus is only in `bonus` once the final starts, so this is the running total until then. */
function finalTotals(s: SWState): Record<string, number> {
  return Object.fromEntries(s.playerIds.map((p) => [p, (s.totals[p] ?? 0) + (s.bonus.includes(p) ? UNIQUE_BONUS : 0)]));
}

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
  defaultSettings: { writeSeconds: WRITE_MS / 1000, callSeconds: CALL_MS / 1000 },
  settingsFields,
  actionSchema,

  setup(ctx, players, settings) {
    const s: SWState = {
      playerIds: players.map((p) => p.id),
      gone: [],
      writeMs: settings.writeSeconds * 1000,
      callMs: settings.callSeconds * 1000,
      promptIds: ctx.rng.shuffle(PROMPTS.map((p) => p.id)).slice(0, ROUNDS),
      round: 0,
      phase: 'write',
      deadline: 0,
      answers: {},
      order: [],
      turn: -1,
      claims: [],
      dead: {},
      turnPts: {},
      roundPts: {},
      outcome: {},
      totals: {},
      twoZero: {},
      bonus: [],
    };
    startRound(s, ctx);
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
        break;
      }
      case 'match': {
        if (s.phase !== 'call') return;
        const active = s.order[s.turn];
        const mine = s.answers[playerId];
        const theirs = s.answers[active];
        if (playerId === active || !mine || !theirs || a.mine >= mine.length || a.theirs >= theirs.length || isDead(s, playerId, a.mine)) return;
        const i = s.claims.findIndex((c) => c.target === active && c.by === playerId && c.mine === a.mine);
        if (i < 0) s.claims.push({ target: active, by: playerId, mine: a.mine, theirs: a.theirs });
        else if (s.claims[i].theirs === a.theirs) s.claims.splice(i, 1);
        else s.claims[i].theirs = a.theirs;
        break;
      }
    }
    checkDone(s, ctx);
  },

  onTimer(s, ctx, key) {
    if (key !== 'phase') return;
    if (s.phase === 'write') endWrite(s, ctx);
    else if (s.phase === 'call') endTurn(s, ctx);
    else if (s.phase === 'result') nextTurn(s, ctx);
    else if (s.phase === 'reveal') {
      if (s.round < ROUNDS) startRound(s, ctx);
      else {
        s.bonus = s.playerIds.filter((p) => (s.twoZero[p] ?? 0) >= UNIQUE_MIN_ROUNDS);
        s.phase = 'final';
        arm(s, ctx, FINAL_MS);
      }
    } else if (s.phase === 'final') {
      s.phase = 'done';
      ctx.clearTimer('phase');
      s.deadline = 0;
    }
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.gone.includes(playerId)) s.gone.push(playerId);
    checkDone(s, ctx);
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((p) => p !== playerId);
  },

  view(s, viewer): SWView {
    const me = viewer.kind === 'player' ? viewer.id : null;
    const pr = PROMPT_BY_ID.get(s.promptIds[Math.min(s.round, ROUNDS) - 1]);
    const turnOn = s.phase === 'call' || s.phase === 'result';
    const active = turnOn ? s.order[s.turn] : undefined;
    let you: SWView['you'] = null;
    if (me) {
      const mine = s.answers[me] ?? [];
      you = {
        answers: s.answers[me] ?? null,
        matched: mine.map((_, j) => isMatched(s, me, j)),
        dead: mine.map((_, j) => isDead(s, me, j)),
        claims: mine.map((_, j) => s.claims.find((c) => c.target === active && c.by === me && c.mine === j)?.theirs ?? null),
      };
    }
    return {
      phase: s.phase,
      round: s.round,
      rounds: ROUNDS,
      mult: mult(s),
      deadline: s.deadline || null,
      writeMs: s.writeMs,
      callMs: s.callMs,
      players: s.playerIds,
      gone: s.gone,
      prompt: { id: pr?.id ?? '', text: pr?.text ?? '' },
      locked: s.phase === 'write' ? Object.keys(s.answers) : [],
      you,
      call:
        active !== undefined
          ? {
              active,
              turn: s.turn + 1,
              turns: s.order.length,
              words: (s.answers[active] ?? []).map((text, j) => ({
                text,
                matchers: [
                  ...new Set(s.claims.flatMap((c) => (c.target === active && c.theirs === j ? [c.by] : c.by === active && c.mine === j ? [c.target] : []))),
                ],
                error: s.phase === 'result' && isDead(s, active, j),
              })),
              pts: s.phase === 'result' ? s.turnPts : {},
            }
          : null,
      reveal: s.phase === 'reveal' ? { pts: s.roundPts, outcome: s.outcome } : null,
      scores: finalTotals(s),
      bonus: s.phase === 'final' || s.phase === 'done' ? s.bonus : [],
      twoZero: s.phase === 'final' || s.phase === 'done' ? s.twoZero : {},
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    const scores = finalTotals(s);
    const names = s.bonus.length;
    return {
      scores,
      summary: names
        ? `${names} Unique thinker${names > 1 ? 's' : ''} earned the +${UNIQUE_BONUS} bonus`
        : 'Six rounds of hoping someone wrote the same thing',
    };
  },

  bot: {
    act(view, rng, me) {
      const v = view as SWView;
      if (!v.you || v.gone.includes(me)) return null;
      if (v.phase === 'write') {
        if (v.you.answers || !rng.chance(0.6)) return null;
        const prompt = PROMPT_BY_ID.get(v.prompt.id);
        const pool = prompt && prompt.samples.length >= 2 ? prompt.samples : GENERIC_ANSWERS;
        const n = rng.chance(0.5) ? 1 : 2;
        const picks = rng.shuffle(pool).slice(0, n);
        return { type: 'submit', answers: picks.map((t) => t.slice(0, MAX_ANSWER_LEN)) };
      }
      if (v.phase === 'call' && v.call && v.call.active !== me && v.you.answers && rng.chance(0.85)) {
        const words = v.call.words;
        for (let mine = 0; mine < v.you.answers.length; mine++) {
          if (v.you.dead[mine] || v.you.claims[mine] !== null) continue;
          const text = v.you.answers[mine];
          const theirs = words.findIndex((w) => normalize(w.text) === normalize(text) || looselyRelated(w.text, text));
          if (theirs >= 0) return { type: 'match', mine, theirs };
        }
      }
      return null;
    },
  },
});
