// Wiki-what: team trivia from strange real Wikipedia topics, with a secret Mole.
// Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now.
//
// Rules (also shown in the Rules text of ui.tsx):
//  - 3 rounds of 4 questions. Each round opens with a 5-second role card on every phone (the TV
//    only says "check your phone"). Everyone picks one of 4 choices (locked once picked).
//  - Team answer = plurality of picks. Tie: the tied choice that was locked in first wins.
//    No picks at all = no team answer (counts as wrong, but nobody scores for it).
//  - Right team answer: +2 team points. Each player who picked the right choice: +1 personal.
//  - Each round one secret Mole sees the answer. Team wrong (with an answer given): Mole +3 personal.
//  - After the round everyone accuses a player. The Mole accuses too, as a decoy that never
//    counts, so who has locked in (and when the phase ends) cannot single the Mole out. The Mole
//    is caught if strictly more players accused them than any other player. Caught: +3 team points and +1 to each correct
//    accuser. Not caught: Mole +3 personal.
//  - Each phone gets "where my points came from" lines (`you.note`) for its own points only. A
//    question reveal reads the same on every phone whoever the Mole is (a Mole-only line would
//    point at them); the Mole's lines wait for the Mole reveal.
//  - The game ends on the shell's podium: there is no final-standings page here.
//  - Final score = personal points + the whole team total, for everyone who stayed.
//  - The article title is hidden until the reveal (titles often give the answer away).
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import type { SettingField } from '../../shared/types';
import { QUESTIONS, type Question } from './content';

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pick'), choice: z.number().int().min(0).max(3) }).strict(),
  z.object({ type: z.literal('accuse'), target: z.string().min(1).max(64) }).strict(),
]);
export type WikiAction = z.infer<typeof actionSchema>;

export interface WikiSettings {
  rounds: number;
  perRound: number;
  /** Seconds to answer each question. */
  askSeconds: number;
}

const settingsFields: SettingField[] = [
  { key: 'rounds', label: 'Rounds', hint: 'One Mole per round', min: 1, max: 5, step: 1 },
  { key: 'perRound', label: 'Questions per round', min: 1, max: 8, step: 1 },
  { key: 'askSeconds', label: 'Answer time', hint: 'Per question', min: 10, max: 60, step: 5, unit: 's' },
];

export type Phase = 'role' | 'ask' | 'reveal' | 'accuse' | 'moleReveal' | 'done';

/** Default time to answer a question (the host can change it). */
export const ASK_MS = 25_000;
/** The private role card that opens every round. */
export const ROLE_MS = 5_000;
export const REVEAL_MS = 8_000;
export const ACCUSE_MS = 25_000;
export const MOLE_MS = 10_000;

const TEAM_RIGHT = 2;
const CAUGHT_BONUS = 3;
const MOLE_WRONG = 3;
const MOLE_HIDDEN = 3;
const PICK_RIGHT = 1;
const ACCUSE_RIGHT = 1;

const BY_ID = new Map<string, Question>(QUESTIONS.map((q) => [q.id, q]));

export interface WikiState {
  playerIds: string[];
  gone: string[];
  rounds: number;
  perRound: number;
  /** Time to answer one question, in ms. */
  askMs: number;
  qids: string[];
  /** 1-based; 0 before the first round starts. */
  round: number;
  /** 0-based question index within the round. */
  qi: number;
  phase: Phase;
  /** Mole of each round so far. */
  moles: string[];
  picks: Record<string, number>;
  /** Pick arrival order (ties go to the earliest). */
  order: string[];
  teamPick: number | null;
  teamRight: boolean;
  accuse: Record<string, string>;
  caught: boolean;
  caughtCount: number;
  /** Questions this round the team got wrong (with an answer given): the Mole's +3 each, told at the Mole reveal. */
  moleMisses: number;
  team: number;
  personal: Record<string, number>;
  /** Server ms the current phase times out. */
  deadline: number;
}

/** One source of points, in plain words ("for you: ..." or "for the team: ..."). */
export interface NoteLine {
  pts: number;
  why: string;
}

export interface WikiView {
  phase: Phase;
  round: number;
  rounds: number;
  qi: number;
  perRound: number;
  /** Time to answer one question, for the timer ring. */
  askMs: number;
  deadline: number | null;
  players: string[];
  gone: string[];
  team: number;
  /** The current question without its answer or article. */
  q: { text: string; choices: string[] } | null;
  /** Who has locked in a pick (ask) or an accusation (accuse). */
  voted: string[];
  /** Per-viewer extras. null for the screen. */
  you: null | {
    pick: number | null;
    accused: string | null;
    /** Where this player's points came from in this reveal: own points only. */
    note: NoteLine[];
    mole?: true;
    answerIndex?: number;
  };
  reveal: null | {
    article: string;
    answerIndex: number;
    fact: string | null;
    teamPick: number | null;
    right: boolean;
    picks: Record<string, number>;
    counts: number[];
  };
  roundEnd: null | { mole: string; caught: boolean; accuse: Record<string, string> };
}

const present = (s: WikiState): string[] => s.playerIds.filter((p) => !s.gone.includes(p));
const currentMole = (s: WikiState): string => s.moles[s.round - 1] ?? '';
const question = (s: WikiState): Question => BY_ID.get(s.qids[(s.round - 1) * s.perRound + s.qi]) as Question;

function arm(s: WikiState, ctx: GameCtx, ms: number): void {
  ctx.clearTimer('phase');
  ctx.setTimer('phase', ms);
  s.deadline = ctx.now() + ms;
}

function add(map: Record<string, number>, id: string, n: number): void {
  map[id] = (map[id] ?? 0) + n;
}

function pickMole(s: WikiState, ctx: GameCtx): string {
  const here = present(s);
  const pool = here.length ? here : s.playerIds;
  const last = s.moles[s.moles.length - 1];
  const tiers = [
    pool.filter((p) => !s.moles.includes(p)),
    pool.filter((p) => p !== last),
    pool,
  ];
  const tier = tiers.find((t) => t.length > 0) as string[];
  return ctx.rng.pick(tier);
}

function startQuestion(s: WikiState, ctx: GameCtx): void {
  s.phase = 'ask';
  s.picks = {};
  s.order = [];
  s.teamPick = null;
  s.teamRight = false;
  arm(s, ctx, s.askMs);
}

function startRound(s: WikiState, ctx: GameCtx): void {
  s.round++;
  s.qi = 0;
  s.moles.push(pickMole(s, ctx));
  s.accuse = {};
  s.caught = false;
  s.moleMisses = 0;
  s.picks = {};
  s.order = [];
  s.teamPick = null;
  s.teamRight = false;
  s.phase = 'role';
  arm(s, ctx, ROLE_MS);
}

function resolveQuestion(s: WikiState, ctx: GameCtx): void {
  const q = question(s);
  const counts = [0, 0, 0, 0];
  for (const c of Object.values(s.picks)) counts[c]++;
  const top = Math.max(...counts);
  if (top > 0) {
    // Tie: the tied choice whose first supporter locked in earliest.
    const tied = counts.map((n, i) => (n === top ? i : -1)).filter((i) => i >= 0);
    const first = s.order.find((p) => tied.includes(s.picks[p])) as string;
    s.teamPick = s.picks[first];
  }
  s.teamRight = s.teamPick === q.answer;
  if (s.teamRight) s.team += TEAM_RIGHT;
  else if (s.teamPick !== null) {
    add(s.personal, currentMole(s), MOLE_WRONG);
    s.moleMisses = (s.moleMisses ?? 0) + 1;
  }
  for (const [p, c] of Object.entries(s.picks)) {
    if (c === q.answer) add(s.personal, p, PICK_RIGHT);
  }
  s.phase = 'reveal';
  arm(s, ctx, REVEAL_MS);
}

function resolveAccuse(s: WikiState, ctx: GameCtx): void {
  const mole = currentMole(s);
  const counts: Record<string, number> = {};
  // The Mole's own accusation is a decoy: it never counts.
  for (const [p, t] of Object.entries(s.accuse)) if (p !== mole) add(counts, t, 1);
  const mine = counts[mole] ?? 0;
  const others = Math.max(0, ...Object.entries(counts).filter(([id]) => id !== mole).map(([, n]) => n));
  s.caught = mine > 0 && mine > others;
  if (s.caught) {
    s.team += CAUGHT_BONUS;
    s.caughtCount++;
    for (const [p, t] of Object.entries(s.accuse)) {
      if (t === mole) add(s.personal, p, ACCUSE_RIGHT);
    }
  } else {
    add(s.personal, mole, MOLE_HIDDEN);
  }
  s.phase = 'moleReveal';
  arm(s, ctx, MOLE_MS);
}

function checkDone(s: WikiState, ctx: GameCtx): void {
  if (s.phase === 'ask') {
    if (present(s).every((p) => s.picks[p] !== undefined)) resolveQuestion(s, ctx);
  } else if (s.phase === 'accuse') {
    // Everyone, the Mole included: waiting on "everyone but one" would point at the Mole.
    if (present(s).every((p) => s.accuse[p] !== undefined)) resolveAccuse(s, ctx);
  }
}

/** Where `me` earned points in the current reveal, from public rules and their own picks only. */
function noteFor(s: WikiState, me: string): NoteLine[] {
  const mole = currentMole(s);
  const lines: NoteLine[] = [];
  if (s.phase === 'reveal') {
    if (s.teamRight) lines.push({ pts: TEAM_RIGHT, why: 'for the team: the team was right' });
    if (s.picks[me] === question(s).answer) lines.push({ pts: PICK_RIGHT, why: 'for you: you picked right' });
    // Nothing Mole-only here: an extra line on one phone would point at the Mole. The Mole's
    // points for wrong answers are told at the Mole reveal, when everyone sees who it was.
  } else if (s.phase === 'moleReveal') {
    const misses = s.moleMisses ?? 0;
    if (me === mole && misses > 0) {
      lines.push({ pts: MOLE_WRONG * misses, why: `for you: the team missed ${misses === 1 ? 'a question' : `${misses} questions`} (Mole)` });
    }
    if (s.caught) {
      lines.push({ pts: CAUGHT_BONUS, why: 'for the team: the Mole was caught' });
      if (s.accuse[me] === mole) lines.push({ pts: ACCUSE_RIGHT, why: 'for you: you accused the Mole' });
    } else if (me === mole) lines.push({ pts: MOLE_HIDDEN, why: 'for you: you stayed hidden (Mole)' });
  }
  return lines;
}

function totals(s: WikiState): Record<string, number> {
  return Object.fromEntries(s.playerIds.map((p) => [p, (s.personal[p] ?? 0) + (s.gone.includes(p) ? 0 : s.team)]));
}

export default defineGame<WikiState, WikiAction, WikiSettings>({
  manifest: {
    id: 'wiki-what',
    title: 'Wiki-what',
    tagline: 'Strange-but-true trivia, with a traitor on the team.',
    minPlayers: 3,
    maxPlayers: 20,
    screen: 'optional',
    estMinutes: 12,
  },
  defaultSettings: { rounds: 3, perRound: 4, askSeconds: ASK_MS / 1000 },
  settingsFields,
  actionSchema,

  setup(ctx, players, settings) {
    const rounds = Math.min(5, Math.max(1, Math.floor(settings.rounds)));
    const perRound = Math.min(8, Math.max(1, Math.floor(settings.perRound)));
    const ids = ctx.rng.shuffle(QUESTIONS.map((q) => q.id)).slice(0, rounds * perRound);
    const s: WikiState = {
      playerIds: players.map((p) => p.id),
      gone: [],
      rounds,
      perRound,
      askMs: Math.round(settings.askSeconds * 1000),
      qids: ids,
      round: 0,
      qi: 0,
      phase: 'role',
      moles: [],
      picks: {},
      order: [],
      teamPick: null,
      teamRight: false,
      accuse: {},
      caught: false,
      caughtCount: 0,
      moleMisses: 0,
      team: 0,
      personal: {},
          deadline: 0,
    };
    startRound(s, ctx);
    return s;
  },

  onAction(s, ctx, playerId, a) {
    if (!s.playerIds.includes(playerId) || s.gone.includes(playerId)) return;
    if (a.type === 'pick') {
      if (s.phase !== 'ask' || s.picks[playerId] !== undefined) return;
      s.picks[playerId] = a.choice;
      s.order.push(playerId);
    } else {
      if (s.phase !== 'accuse' || s.accuse[playerId] !== undefined) return;
      if (a.target === playerId || !s.playerIds.includes(a.target)) return;
      s.accuse[playerId] = a.target;
    }
    checkDone(s, ctx);
  },

  onTimer(s, ctx, key) {
    if (key !== 'phase') return;
    if (s.phase === 'role') startQuestion(s, ctx);
    else if (s.phase === 'ask') resolveQuestion(s, ctx);
    else if (s.phase === 'reveal') {
      if (s.qi + 1 < s.perRound) {
        s.qi++;
        startQuestion(s, ctx);
      } else {
        s.phase = 'accuse';
        s.accuse = {};
        arm(s, ctx, ACCUSE_MS);
        checkDone(s, ctx);
      }
    } else if (s.phase === 'accuse') resolveAccuse(s, ctx);
    else if (s.phase === 'moleReveal') {
      if (s.round >= s.rounds) {
        s.phase = 'done';
        ctx.clearTimer('phase');
        s.deadline = 0;
      } else startRound(s, ctx);
    }
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.gone.includes(playerId)) s.gone.push(playerId);
    checkDone(s, ctx);
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((p) => p !== playerId);
  },

  view(s, viewer): WikiView {
    const me = viewer.kind === 'player' ? viewer.id : null;
    const live = s.phase === 'ask' || s.phase === 'reveal';
    const mole = currentMole(s);
    const q = live ? question(s) : null;
    const roundOver = s.phase === 'moleReveal' || s.phase === 'done';
    let you: WikiView['you'] = null;
    if (me) {
      you = {
        pick: s.picks[me] ?? null,
        accused: s.accuse[me] ?? null,
        note: noteFor(s, me),
      };
      if (me === mole && s.phase !== 'done') {
        you.mole = true;
        if (s.phase === 'ask' && q) you.answerIndex = q.answer;
      }
    }
    let reveal: WikiView['reveal'] = null;
    if (s.phase === 'reveal' && q) {
      const counts = [0, 0, 0, 0];
      for (const c of Object.values(s.picks)) counts[c]++;
      reveal = {
        article: q.article,
        answerIndex: q.answer,
        fact: q.fact ?? null,
        teamPick: s.teamPick,
        right: s.teamRight,
        picks: s.picks,
        counts,
      };
    }
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      qi: s.qi,
      perRound: s.perRound,
      askMs: s.askMs,
      deadline: s.deadline || null,
      players: s.playerIds,
      gone: s.gone,
      team: s.team,
      q: q ? { text: q.question, choices: q.choices } : null,
      voted: s.phase === 'ask' ? s.order : s.phase === 'accuse' ? Object.keys(s.accuse) : [],
      you,
      reveal,
      // The Mole's decoy accusation is left out: only accusations that counted are shown.
      roundEnd: roundOver
        ? {
            mole,
            caught: s.caught,
            accuse: Object.fromEntries(Object.entries(s.accuse).filter(([p]) => p !== mole)),
          }
        : null,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    const scores = totals(s);
    return {
      scores,
      summary: `Team scored ${s.team} points and caught the Mole in ${s.caughtCount} of ${s.rounds} rounds`,
    };
  },

  bot: {
    act(view, rng, me) {
      const v = view as WikiView;
      if (!v.you) return null;
      if (v.phase === 'ask' && v.you.pick === null && rng.chance(0.7)) {
        if (v.you.mole && v.you.answerIndex !== undefined) {
          const wrong = [0, 1, 2, 3].filter((i) => i !== v.you!.answerIndex);
          return { type: 'pick', choice: rng.pick(wrong) };
        }
        return { type: 'pick', choice: rng.int(4) };
      }
      // The Mole bot casts its decoy too.
      if (v.phase === 'accuse' && v.you.accused === null && rng.chance(0.7)) {
        const others = v.players.filter((p) => p !== me);
        if (others.length) return { type: 'accuse', target: rng.pick(others) };
      }
      return null;
    },
  },
});
