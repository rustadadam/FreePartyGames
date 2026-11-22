// Cave Rave: single-elimination rhythm duels. Every duel in a bracket round plays the same
// seeded song at the same server time; phones judge hits locally and send one score at the end.
// The server only runs the bracket, checks scores against the chart, and referees sabotage.
// Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now (use ctx.rng / ctx.now).
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import { GOOD_PTS, MAX_LEVEL, PERFECT_PTS, makeChart, maxScore } from './chart';
import {
  CHAMPION_BONUS,
  COUNTDOWN_MS,
  EARLY_SUBMIT_MS,
  EFFECTS,
  EFFECT_MS,
  GRACE_MS,
  MAX_ACTIVE_EFFECTS,
  POINTS_PER_ROUND,
  READY_FIRST_MS,
  READY_MS,
  REVEAL_MS,
  SAB_COOLDOWN_MS,
  type CRPhase,
  type CRView,
  type DuelView,
  type LivePayload,
  type PastDuel,
  type SabEvent,
  type Submission,
  type YouView,
} from './rules';

export type { CRView } from './rules';

const DuelId = z.string().min(1).max(16);
const Count = z.number().int().min(0).max(5000);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('score'), duel: DuelId, score: z.number().int().min(0).max(500_000), hits: Count, misses: Count }).strict(),
  z.object({ type: z.literal('live'), duel: DuelId, score: z.number().int().min(0).max(500_000) }).strict(),
  z.object({ type: z.literal('sabotage'), target: z.string().min(1).max(64), effect: z.enum(EFFECTS) }).strict(),
]);
export type CRAction = z.infer<typeof actionSchema>;

interface Sub extends Submission {
  at: number;
}

interface Duel {
  id: string;
  a: string;
  b: string | null;
  subs: Record<string, Sub>;
  winner: string | null;
}

export interface CRState {
  playerIds: string[];
  gone: string[];
  phase: CRPhase;
  round: number;
  /** Still in the bracket, in bracket order. */
  alive: string[];
  /** Eliminated, in order. */
  out: string[];
  byes: Record<string, number>;
  /** Bracket rounds cleared (wins + byes). */
  cleared: Record<string, number>;
  duels: Duel[];
  history: { round: number; duels: PastDuel[] }[];
  ready: string[];
  chart: { seed: number; level: number; notes: number; max: number; lengthMs: number };
  startAt: number | null;
  endAt: number | null;
  deadline: number | null;
  running: boolean;
  chartOver: boolean;
  sabs: SabEvent[];
  lastSab: Record<string, number>;
  champion: string | null;
}

const MAX_SABS = 80;
const FEED = 6;

// ---------- bracket ----------

function duelOf(s: CRState, id: string): Duel | undefined {
  return s.duels.find((d) => d.a === id || d.b === id);
}

/** Players in a real (non-bye) duel this round. */
function duelists(s: CRState): string[] {
  return s.duels.flatMap((d) => (d.b ? [d.a, d.b] : []));
}

function startRound(s: CRState, ctx: GameCtx): void {
  s.round++;
  const level = Math.min(MAX_LEVEL, s.round - 1);
  const list = s.alive.slice();
  const duels: Duel[] = [];
  let bye: string | null = null;
  if (list.length % 2 === 1) {
    // The bye goes to whoever has had the fewest, ties broken by the seeded rng.
    const fewest = Math.min(...list.map((id) => s.byes[id] ?? 0));
    bye = ctx.rng.pick(list.filter((id) => (s.byes[id] ?? 0) === fewest));
    list.splice(list.indexOf(bye), 1);
  }
  for (let i = 0; i + 1 < list.length; i += 2) {
    duels.push({ id: `r${s.round}d${duels.length}`, a: list[i], b: list[i + 1], subs: {}, winner: null });
  }
  if (bye) duels.push({ id: `r${s.round}bye`, a: bye, b: null, subs: {}, winner: null });
  s.duels = duels;

  const seed = ctx.rng.uint32();
  const chart = makeChart(seed, level);
  s.chart = { seed, level, notes: chart.notes.length, max: maxScore(chart), lengthMs: chart.lengthMs };
  s.phase = 'ready';
  s.ready = [];
  s.startAt = s.endAt = null;
  s.running = s.chartOver = false;
  s.sabs = [];
  const ms = s.round === 1 ? READY_FIRST_MS : READY_MS;
  s.deadline = ctx.now() + ms;
  ctx.setTimer('ready', ms);
}

function beginPlay(s: CRState, ctx: GameCtx): void {
  if (s.phase !== 'ready') return;
  ctx.clearTimer('ready');
  s.phase = 'play';
  const now = ctx.now();
  s.startAt = now + COUNTDOWN_MS;
  s.endAt = s.startAt + s.chart.lengthMs;
  s.deadline = s.endAt + GRACE_MS;
  ctx.setTimer('go', COUNTDOWN_MS);
  ctx.setTimer('chartEnd', COUNTDOWN_MS + s.chart.lengthMs);
  ctx.setTimer('deadline', COUNTDOWN_MS + s.chart.lengthMs + GRACE_MS);
}

function accuracy(sub: Sub | undefined): number {
  if (!sub) return 0;
  const n = sub.hits + sub.misses;
  return n > 0 ? sub.hits / n : 0;
}

/** Winner of a two-player duel: present beats gone, then score, then accuracy, then the rng. */
function decide(s: CRState, ctx: GameCtx, d: Duel & { b: string }): string {
  const key = (id: string): number[] => {
    const sub = d.subs[id];
    return [s.gone.includes(id) ? 0 : 1, sub?.score ?? 0, accuracy(sub)];
  };
  const ka = key(d.a);
  const kb = key(d.b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] > kb[i] ? d.a : d.b;
  }
  return ctx.rng.chance(0.5) ? d.a : d.b;
}

function resolveRound(s: CRState, ctx: GameCtx): void {
  if (s.phase !== 'play') return;
  for (const k of ['go', 'chartEnd', 'deadline']) ctx.clearTimer(k);
  const winners: string[] = [];
  const past: PastDuel[] = [];
  for (const d of s.duels) {
    if (!d.b) {
      d.winner = d.a;
      s.byes[d.a] = (s.byes[d.a] ?? 0) + 1;
    } else {
      d.winner = decide(s, ctx, d as Duel & { b: string });
      s.out.push(d.winner === d.a ? d.b : d.a);
    }
    winners.push(d.winner);
    s.cleared[d.winner] = (s.cleared[d.winner] ?? 0) + 1;
    past.push({ a: d.a, b: d.b, winner: d.winner, sa: d.subs[d.a]?.score ?? 0, sb: d.b ? (d.subs[d.b]?.score ?? 0) : 0 });
  }
  s.alive = winners;
  s.history.push({ round: s.round, duels: past });
  s.phase = 'reveal';
  s.running = false;
  s.chartOver = true;
  s.deadline = ctx.now() + REVEAL_MS;
  ctx.setTimer('next', REVEAL_MS);
}

function nextRound(s: CRState, ctx: GameCtx): void {
  if (s.alive.length <= 1) {
    s.champion = s.alive[0] ?? null;
    s.phase = 'done';
    s.deadline = null;
    return;
  }
  startRound(s, ctx);
}

/** Everyone still here who has to ready up has. */
function maybeAllReady(s: CRState, ctx: GameCtx): void {
  if (s.phase !== 'ready') return;
  const need = duelists(s).filter((id) => !s.gone.includes(id));
  if (need.every((id) => s.ready.includes(id))) beginPlay(s, ctx);
}

/** Every duelist still here has sent a score: no need to wait for the deadline. */
function maybeAllIn(s: CRState, ctx: GameCtx): void {
  if (s.phase !== 'play') return;
  const need = duelists(s).filter((id) => !s.gone.includes(id));
  if (need.every((id) => duelOf(s, id)?.subs[id])) resolveRound(s, ctx);
}

// ---------- validation (exported for tests) ----------

/** Why a score submission is refused, or null when it's accepted. */
export function scoreProblem(s: CRState, now: number, playerId: string, a: { duel: string; score: number; hits: number; misses: number }): string | null {
  if (s.phase !== 'play' || s.endAt === null) return 'not playing';
  const d = duelOf(s, playerId);
  if (!d || !d.b || d.id !== a.duel) return 'wrong duel';
  if (d.subs[playerId]) return 'already in';
  if (now < s.endAt - EARLY_SUBMIT_MS) return 'too early';
  if (a.score > s.chart.max) return 'above max';
  if (a.hits + a.misses > s.chart.notes) return 'too many notes';
  // Every hit is a perfect or a good: hits * GOOD_PTS <= score <= hits * PERFECT_PTS.
  if (a.score > a.hits * PERFECT_PTS || a.score < a.hits * GOOD_PTS || a.score % GOOD_PTS !== 0) return 'inconsistent';
  return null;
}

/** Why a sabotage is refused, or null when it's allowed. */
export function sabotageProblem(s: CRState, now: number, by: string, target: string, effect: (typeof EFFECTS)[number]): string | null {
  if (s.phase !== 'play' || s.startAt === null || s.endAt === null) return 'not playing';
  if (now < s.startAt || now >= s.endAt) return 'song not running';
  if (!s.out.includes(by) || s.gone.includes(by)) return 'only eliminated players sabotage';
  if (!s.playerIds.includes(target) || !duelists(s).includes(target)) return 'target not dueling';
  if (duelOf(s, target)?.subs[target]) return 'target finished';
  if (now < (s.lastSab[by] ?? -Infinity) + SAB_COOLDOWN_MS) return 'cooldown';
  const active = s.sabs.filter((e) => e.target === target && e.until > now);
  if (active.some((e) => e.effect === effect)) return 'already active';
  if (active.length >= MAX_ACTIVE_EFFECTS) return 'target saturated';
  return null;
}

/** Duelists still playing. Effect saturation depends on the clock, so the server checks that on arrival. */
function targetsFor(s: CRState): string[] {
  return duelists(s).filter((id) => !duelOf(s, id)?.subs[id]);
}

// ---------- the game ----------

export default defineGame<CRState, CRAction, Record<string, never>>({
  manifest: {
    id: 'cave-rave',
    title: 'Cave Rave',
    tagline: 'A rhythm tournament where the losers get to sabotage.',
    minPlayers: 2,
    maxPlayers: 20,
    screen: 'optional',
    estMinutes: 6,
  },
  defaultSettings: {},
  actionSchema,

  setup(ctx, players) {
    const ids = players.map((p) => p.id);
    const s: CRState = {
      playerIds: ids,
      gone: [],
      phase: 'ready',
      round: 0,
      alive: ctx.rng.shuffle(ids),
      out: [],
      byes: {},
      cleared: Object.fromEntries(ids.map((id) => [id, 0])),
      duels: [],
      history: [],
      ready: [],
      chart: { seed: 0, level: 0, notes: 0, max: 0, lengthMs: 0 },
      startAt: null,
      endAt: null,
      deadline: null,
      running: false,
      chartOver: false,
      sabs: [],
      lastSab: {},
      champion: null,
    };
    startRound(s, ctx);
    return s;
  },

  onAction(s, ctx, playerId, action) {
    if (s.gone.includes(playerId)) return;
    const now = ctx.now();
    switch (action.type) {
      case 'ready': {
        if (s.phase !== 'ready' || s.ready.includes(playerId) || !duelists(s).includes(playerId)) return;
        s.ready.push(playerId);
        maybeAllReady(s, ctx);
        return;
      }
      case 'score': {
        if (scoreProblem(s, now, playerId, action)) return;
        const d = duelOf(s, playerId)!;
        d.subs[playerId] = { score: action.score, hits: action.hits, misses: action.misses, at: now };
        maybeAllIn(s, ctx);
        return;
      }
      case 'live': {
        // Unstored ticker for the screen; the real score arrives once, at the end.
        const d = duelOf(s, playerId);
        if (s.phase !== 'play' || !s.running || !d?.b || d.id !== action.duel || d.subs[playerId]) return;
        const payload: LivePayload = { cr: 'live', duel: d.id, id: playerId, score: Math.min(action.score, s.chart.max) };
        ctx.broadcastEphemeral(payload);
        return;
      }
      case 'sabotage': {
        if (sabotageProblem(s, now, playerId, action.target, action.effect)) return;
        s.lastSab[playerId] = now;
        s.sabs.push({ by: playerId, target: action.target, effect: action.effect, at: now, until: now + EFFECT_MS[action.effect] });
        if (s.sabs.length > MAX_SABS) s.sabs.shift();
        return;
      }
    }
  },

  onTimer(s, ctx, key) {
    if (key === 'ready') beginPlay(s, ctx);
    else if (key === 'go' && s.phase === 'play') s.running = true;
    else if (key === 'chartEnd' && s.phase === 'play') {
      s.running = false;
      s.chartOver = true;
    } else if (key === 'deadline') resolveRound(s, ctx);
    else if (key === 'next' && s.phase === 'reveal') nextRound(s, ctx);
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.gone.includes(playerId)) s.gone.push(playerId);
    maybeAllReady(s, ctx);
    maybeAllIn(s, ctx);
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((id) => id !== playerId);
  },

  view(s, viewer): CRView {
    const resolved = s.phase === 'reveal' || s.phase === 'done';
    const duels: DuelView[] = s.duels.map((d) => ({
      id: d.id,
      a: d.a,
      b: d.b,
      done: Object.keys(d.subs),
      winner: d.winner,
      scores: resolved && d.b ? Object.fromEntries([d.a, d.b].map((id) => [id, pick(d.subs[id])])) : null,
    }));
    let you: YouView | null = null;
    if (viewer.kind === 'player' && s.playerIds.includes(viewer.id)) {
      const id = viewer.id;
      const d = duelOf(s, id);
      const role: YouView['role'] =
        s.champion === id ? 'champion' : s.out.includes(id) ? 'out' : d && !d.b ? 'bye' : d ? 'duel' : 'out';
      const isOut = role === 'out';
      you = {
        role,
        duel: d?.id ?? null,
        opponent: d ? (d.a === id ? d.b : d.a) : null,
        submitted: !!d?.subs[id],
        ready: s.ready.includes(id),
        effects: s.sabs.filter((e) => e.target === id).slice(-8),
        sabReadyAt: isOut ? (s.lastSab[id] ?? 0) + SAB_COOLDOWN_MS : 0,
        targets: isOut && s.phase === 'play' && !s.gone.includes(id) ? targetsFor(s) : [],
      };
    }
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.round - 1 + Math.max(1, Math.ceil(Math.log2(s.duels.reduce((n, d) => n + (d.b ? 2 : 1), 0)))),
      chart: s.chart,
      startAt: s.startAt,
      endAt: s.endAt,
      deadline: s.deadline,
      running: s.running,
      chartOver: s.chartOver,
      duels,
      history: s.history,
      out: s.out,
      ready: s.ready,
      champion: s.champion,
      feed: s.sabs.slice(-FEED),
      you,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    const scores: Record<string, number> = {};
    for (const id of s.playerIds) scores[id] = (s.cleared[id] ?? 0) * POINTS_PER_ROUND + (id === s.champion ? CHAMPION_BONUS : 0);
    return { scores, summary: s.champion ? 'Last one dancing takes the cave.' : 'The cave fell silent.' };
  },

  bot: {
    act(view, rng) {
      const v = view as CRView;
      const you = v.you;
      if (!you) return null;
      if (v.phase === 'ready' && you.role === 'duel' && !you.ready) return rng.chance(0.7) ? { type: 'ready' } : null;
      if (v.phase !== 'play') return null;
      if (you.role === 'duel' && v.chartOver && !you.submitted && you.duel) {
        // A plausible run: some perfects, some goods, the rest missed.
        const n = v.chart.notes;
        const perfect = Math.floor(n * (0.25 + rng.next() * 0.55));
        const good = Math.floor((n - perfect) * rng.next() * 0.8);
        return { type: 'score', duel: you.duel, score: perfect * PERFECT_PTS + good * GOOD_PTS, hits: perfect + good, misses: n - perfect - good };
      }
      if (you.role === 'out' && v.running && you.targets.length && rng.chance(0.15)) {
        return { type: 'sabotage', target: rng.pick(you.targets), effect: rng.pick(EFFECTS) };
      }
      return null;
    },
  },
});

function pick(sub: Sub | undefined): Submission {
  return sub ? { score: sub.score, hits: sub.hits, misses: sub.misses } : { score: 0, hits: 0, misses: 0 };
}
