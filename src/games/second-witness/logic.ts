// Second Witness: everyone answers a category prompt with one or two answers, hoping someone else
// wrote the same thing. Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now.
//
// Rules (also shown in the Rules text of ui.tsx; constants live in rules.ts):
//  - 6 rounds, score multipliers x1 x1 x2 x2 x3 x3. Each round has a different prompt.
//  - Write (60 s): each player locks in one or two answers (<= 40 chars). Two answers that normalize
//    the same count as one. Nobody sees anyone else's answers until this phase is over.
//  - Auto-matching: answers with the same normalized form form one group.
//  - Merge (45 s, skipped with fewer than 2 groups): groups are shown anonymously. A player taps two to
//    propose they are the same; present players vote yes/no. A merge sticks when yes votes exceed half
//    of the players present (the proposer counts as yes). Merges chain. A proposal is invalid when one
//    player has answers in both groups. At most 3 open proposals each. Ends at the deadline or when
//    everyone present taps Done. (The host's Skip ahead fires the phase timer: that is the override.)
//  - Scoring: an answer is witnessed when another player has an answer in the same final group.
//    One answer, witnessed: 3. Two answers, both witnessed: 5; only one: 1. Otherwise 0. Times the
//    round's multiplier.
//  - Unique thinker: 3+ rounds with two answers and 0 points earns a flat +10 at the end.
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import { PROMPTS, PROMPT_BY_ID, GENERIC_ANSWERS } from './content';
import {
  basePoints,
  canMerge,
  cleanAnswers,
  groupAnswers,
  labelsOf,
  looselyRelated,
  outcomeOf,
  type Group,
  type Member,
} from './match';
import {
  FINAL_MS,
  MAX_ANSWER_LEN,
  MAX_OPEN_PROPOSALS,
  MAX_PLAYERS,
  MERGE_MS,
  MIN_PLAYERS,
  MULTIPLIERS,
  REVEAL_LEAD_MS,
  ROUNDS,
  STANDINGS_MS,
  UNIQUE_BONUS,
  UNIQUE_MIN_ROUNDS,
  WRITE_MS,
  revealInterval,
  type Outcome,
} from './rules';

const Answer = z
  .string()
  .max(MAX_ANSWER_LEN * 4)
  .transform((t) => t.trim())
  .pipe(z.string().min(1).max(MAX_ANSWER_LEN));

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit'), answers: z.array(Answer).min(1).max(2) }).strict(),
  z.object({ type: z.literal('propose'), a: z.number().int().min(0).max(999), b: z.number().int().min(0).max(999) }).strict(),
  z.object({ type: z.literal('vote'), proposal: z.number().int().min(0).max(100_000), yes: z.boolean() }).strict(),
  z.object({ type: z.literal('done') }).strict(),
]);
export type SWAction = z.infer<typeof actionSchema>;

export type Phase = 'write' | 'merge' | 'reveal' | 'final' | 'done';

interface Proposal {
  id: number;
  /** Group ids, a < b. */
  a: number;
  b: number;
  by: string;
  yes: string[];
  no: string[];
}

export interface SWState {
  playerIds: string[];
  gone: string[];
  /** The six prompt ids, in round order. */
  promptIds: string[];
  /** 1-based. */
  round: number;
  phase: Phase;
  /** Server ms the current phase times out (0 when none). */
  deadline: number;
  /** Locked-in answers this round (1 or 2 each, already de-duplicated). */
  answers: Record<string, string[]>;
  groups: Group[];
  proposals: Proposal[];
  nextProposal: number;
  /** Tapped Done in the merge phase. */
  done: string[];
  /** Pair keys ("a-b") that were voted down, so they are not proposed again. */
  closed: string[];
  /** Pair keys a player proposed that were invalid (one player wrote both). Private to that player. */
  refused: Record<string, string[]>;
  /** Reveal: when group 0 appears and the gap between groups (server ms / ms). */
  revealAt: number;
  revealStep: number;
  /** This round's multiplied points, outcome and answer count per player. */
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
  players: string[];
  gone: string[];
  prompt: { id: string; text: string };
  /** Write: who has locked in. Merge: who tapped Done. Never any answers. */
  locked: string[];
  you: null | {
    /** Your own locked answers (the only answers visible during the write phase). */
    answers: string[] | null;
    open: number;
    /** Merge: you tapped Done. */
    done: boolean;
    refused: string[];
    /** Merge: ids of the groups that hold your answers. */
    mine: number[];
  };
  merge: null | {
    need: number;
    /** Pair keys ("a-b") already voted down. */
    closed: string[];
    groups: { id: number; labels: string[] }[];
    proposals: { id: number; a: number; b: number; yes: number; no: number; mine: 'yes' | 'no' | null; own: boolean }[];
  };
  reveal: null | {
    startAt: number;
    interval: number;
    groups: { id: number; labels: string[]; members: Member[] }[];
    pts: Record<string, number>;
    outcome: Record<string, Outcome>;
  };
  /** Totals so far. Round points are added at the reveal; the bonus at the final. */
  scores: Record<string, number>;
  bonus: string[];
  twoZero: Record<string, number>;
}

const present = (s: SWState): string[] => s.playerIds.filter((p) => !s.gone.includes(p));
const mult = (s: SWState): number => MULTIPLIERS[Math.min(s.round, ROUNDS) - 1] ?? 1;
const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

function arm(s: SWState, ctx: GameCtx, ms: number): void {
  ctx.clearTimer('phase');
  ctx.setTimer('phase', ms);
  s.deadline = ctx.now() + ms;
}

// ---------- phases ----------

function startRound(s: SWState, ctx: GameCtx): void {
  s.round++;
  s.phase = 'write';
  s.answers = {};
  s.groups = [];
  s.proposals = [];
  s.done = [];
  s.closed = [];
  s.refused = {};
  s.roundPts = {};
  s.outcome = {};
  arm(s, ctx, WRITE_MS);
}

function endWrite(s: SWState, ctx: GameCtx): void {
  const lists = groupAnswers(s.answers, s.playerIds);
  // Shuffle so the order of the groups does not hint at who wrote what.
  s.groups = ctx.rng.shuffle(lists).map((members, i) => ({ id: i + 1, members }));
  if (s.groups.length >= 2) {
    s.phase = 'merge';
    arm(s, ctx, MERGE_MS);
  } else toReveal(s, ctx);
}

function toReveal(s: SWState, ctx: GameCtx): void {
  const m = mult(s);
  s.proposals = [];
  const witnessed: Record<string, number> = {};
  for (const g of s.groups) if (g.members.length >= 2) for (const mem of g.members) witnessed[mem.p] = (witnessed[mem.p] ?? 0) + 1;
  for (const p of s.playerIds) {
    const answered = s.answers[p]?.length ?? 0;
    const w = witnessed[p] ?? 0;
    const base = basePoints(answered, w);
    s.roundPts[p] = base * m;
    s.outcome[p] = outcomeOf(answered, w);
    s.totals[p] = (s.totals[p] ?? 0) + base * m;
    if (answered === 2 && base === 0) s.twoZero[p] = (s.twoZero[p] ?? 0) + 1;
  }
  // Small groups first: the big matches land last.
  s.groups.sort((x, y) => x.members.length - y.members.length || labelsOf(x)[0].toLowerCase().localeCompare(labelsOf(y)[0].toLowerCase()) || x.id - y.id);
  s.phase = 'reveal';
  s.revealStep = revealInterval(s.groups.length);
  s.revealAt = ctx.now() + REVEAL_LEAD_MS;
  arm(s, ctx, REVEAL_LEAD_MS + s.groups.length * s.revealStep + STANDINGS_MS);
}

function checkDone(s: SWState, ctx: GameCtx): void {
  if (s.phase === 'write') {
    if (present(s).every((p) => s.answers[p] !== undefined)) endWrite(s, ctx);
  } else if (s.phase === 'merge') {
    settle(s);
    if (present(s).every((p) => s.done.includes(p))) toReveal(s, ctx);
  }
}

// ---------- merging ----------

const findGroup = (s: SWState, id: number): Group | undefined => s.groups.find((g) => g.id === id);

/** Applies a stuck merge: group b folds into group a, and open proposals follow the surviving id. */
function mergeGroups(s: SWState, pr: Proposal): void {
  const a = findGroup(s, pr.a);
  const b = findGroup(s, pr.b);
  if (!a || !b) return;
  a.members.push(...b.members);
  s.groups = s.groups.filter((g) => g !== b);
  const next: Proposal[] = [];
  for (const q of s.proposals) {
    if (q === pr) continue;
    const qa = q.a === b.id ? a.id : q.a;
    const qb = q.b === b.id ? a.id : q.b;
    if (qa === qb) continue;
    const [lo, hi] = qa < qb ? [qa, qb] : [qb, qa];
    const twin = next.find((n) => n.a === lo && n.b === hi);
    if (twin) {
      // Two proposals became the same pair: pool their votes.
      for (const p of q.yes) if (!twin.yes.includes(p)) twin.yes.push(p);
      for (const p of q.no) if (!twin.no.includes(p)) twin.no.push(p);
      twin.no = twin.no.filter((p) => !twin.yes.includes(p));
    } else next.push({ ...q, a: lo, b: hi });
  }
  s.proposals = next;
}

/** Resolves every proposal that has enough votes to stick or enough to fail, until nothing changes. */
function settle(s: SWState): void {
  const here = present(s);
  const need = Math.floor(here.length / 2) + 1;
  for (let guard = 0; guard < 1000; guard++) {
    s.proposals = s.proposals.filter((pr) => {
      const a = findGroup(s, pr.a);
      const b = findGroup(s, pr.b);
      return !!a && !!b && a !== b && canMerge(a, b);
    });
    let changed = false;
    for (const pr of s.proposals) {
      const yes = pr.yes.filter((p) => here.includes(p)).length;
      const no = pr.no.filter((p) => here.includes(p)).length;
      if (yes >= need) {
        mergeGroups(s, pr);
        changed = true;
      } else if (here.length - no < need) {
        // Even if everyone left voted yes it could not stick.
        s.proposals = s.proposals.filter((q) => q !== pr);
        s.closed.push(pairKey(pr.a, pr.b));
        changed = true;
      }
      if (changed) break;
    }
    if (!changed) return;
  }
}

function propose(s: SWState, playerId: string, a: number, b: number): void {
  const ga = findGroup(s, a);
  const gb = findGroup(s, b);
  if (!ga || !gb || ga === gb) return;
  const key = pairKey(a, b);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  if (s.proposals.some((p) => p.a === lo && p.b === hi) || s.closed.includes(key)) return;
  if (s.proposals.filter((p) => p.by === playerId).length >= MAX_OPEN_PROPOSALS) return;
  if (!canMerge(ga, gb)) {
    const list = (s.refused[playerId] ??= []);
    if (!list.includes(key) && list.length < 60) list.push(key);
    return;
  }
  s.proposals.push({ id: s.nextProposal++, a: lo, b: hi, by: playerId, yes: [playerId], no: [] });
}

// ---------- the game ----------

/** Totals so far for every player. The bonus is only in `bonus` once the final starts, so this is the running total until then. */
function finalTotals(s: SWState): Record<string, number> {
  return Object.fromEntries(s.playerIds.map((p) => [p, (s.totals[p] ?? 0) + (s.bonus.includes(p) ? UNIQUE_BONUS : 0)]));
}

export default defineGame<SWState, SWAction, Record<string, never>>({
  manifest: {
    id: 'second-witness',
    title: 'Second Witness',
    tagline: 'Write what others will write. Two answers, or play it safe?',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    screen: 'optional',
    estMinutes: 10,
  },
  defaultSettings: {},
  actionSchema,

  setup(ctx, players) {
    const s: SWState = {
      playerIds: players.map((p) => p.id),
      gone: [],
      promptIds: ctx.rng.shuffle(PROMPTS.map((p) => p.id)).slice(0, ROUNDS),
      round: 0,
      phase: 'write',
      deadline: 0,
      answers: {},
      groups: [],
      proposals: [],
      nextProposal: 1,
      done: [],
      closed: [],
      refused: {},
      revealAt: 0,
      revealStep: 0,
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
      case 'propose':
        if (s.phase !== 'merge') return;
        propose(s, playerId, a.a, a.b);
        break;
      case 'vote': {
        if (s.phase !== 'merge') return;
        const pr = s.proposals.find((p) => p.id === a.proposal);
        if (!pr || pr.yes.includes(playerId) || pr.no.includes(playerId)) return;
        (a.yes ? pr.yes : pr.no).push(playerId);
        break;
      }
      case 'done':
        if (s.phase !== 'merge' || s.done.includes(playerId)) return;
        s.done.push(playerId);
        break;
    }
    checkDone(s, ctx);
  },

  onTimer(s, ctx, key) {
    if (key !== 'phase') return;
    if (s.phase === 'write') endWrite(s, ctx);
    else if (s.phase === 'merge') toReveal(s, ctx);
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
    const inWrite = s.phase === 'write';
    const here = present(s);
    const need = Math.floor(here.length / 2) + 1;
    let you: SWView['you'] = null;
    if (me) {
      you = {
        answers: s.answers[me] ?? null,
        open: s.proposals.filter((p) => p.by === me).length,
        done: s.done.includes(me),
        refused: s.refused[me] ?? [],
        mine: s.phase === 'merge' ? s.groups.filter((g) => g.members.some((m) => m.p === me)).map((g) => g.id) : [],
      };
    }
    return {
      phase: s.phase,
      round: s.round,
      rounds: ROUNDS,
      mult: mult(s),
      deadline: s.deadline || null,
      players: s.playerIds,
      gone: s.gone,
      prompt: { id: pr?.id ?? '', text: pr?.text ?? '' },
      locked: inWrite ? Object.keys(s.answers) : s.phase === 'merge' ? s.done : [],
      you,
      merge:
        s.phase === 'merge'
          ? {
              need,
              closed: s.closed,
              groups: s.groups.map((g) => ({ id: g.id, labels: labelsOf(g) })),
              proposals: s.proposals.map((p) => ({
                id: p.id,
                a: p.a,
                b: p.b,
                yes: p.yes.filter((x) => here.includes(x)).length,
                no: p.no.filter((x) => here.includes(x)).length,
                mine: me ? (p.yes.includes(me) ? 'yes' : p.no.includes(me) ? 'no' : null) : null,
                own: me !== null && p.by === me,
              })),
            }
          : null,
      reveal:
        s.phase === 'reveal'
          ? {
              startAt: s.revealAt,
              interval: s.revealStep,
              groups: s.groups.map((g) => ({ id: g.id, labels: labelsOf(g), members: g.members })),
              pts: s.roundPts,
              outcome: s.outcome,
            }
          : null,
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
        : 'Six rounds of looking for a second witness',
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
      if (v.phase === 'merge' && v.merge) {
        if (!rng.chance(0.7)) return null;
        const groups = v.merge.groups;
        const related = (a: number, b: number): boolean => {
          const la = groups.find((g) => g.id === a)?.labels ?? [];
          const lb = groups.find((g) => g.id === b)?.labels ?? [];
          return la.some((x) => lb.some((y) => looselyRelated(x, y)));
        };
        const open = v.merge.proposals.find((p) => p.mine === null);
        if (open) return { type: 'vote', proposal: open.id, yes: related(open.a, open.b) };
        if (v.you.open < MAX_OPEN_PROPOSALS) {
          for (const a of groups) {
            for (const b of groups) {
              if (a.id >= b.id || !related(a.id, b.id)) continue;
              const key = `${a.id}-${b.id}`;
              if (v.you.refused.includes(key) || v.merge.closed.includes(key) || v.merge.proposals.some((p) => p.a === a.id && p.b === b.id)) continue;
              return { type: 'propose', a: a.id, b: b.id };
            }
          }
        }
        if (!v.locked.includes(me)) return { type: 'done' };
      }
      return null;
    },
  },
});
