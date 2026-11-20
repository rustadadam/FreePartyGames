// Forgery: a hidden-impostor drawing game. Pure TypeScript (no DOM, no Cloudflare, no
// Math.random / Date.now).
//
// A round: everyone but the forger gets a category and a secret word; the forger gets only the
// category. Players take turns (LAPS laps, fixed shuffled order), one continuous stroke each on a
// shared canvas, in their seat color. Then everyone votes for the forger. A forger who is
// caught gets one guess at the word (a pick-list of the category's words).
//
// Secrets: the word lives only in `state.word` and in the views of the artists. The forger's
// identity lives only in `state.forger` and in the forger's own view; it is projected to
// everyone else only once the vote is in (phases guess / reveal / done). The pick-list (which
// contains the word) goes only to the forger, and only in the guess phase. Live ink (ephemeral)
// carries just {turn, by, pts}, the same for every drawer.
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import { MAX_ID_LENGTH } from '../../shared/limits';
import { makeDrawing, STROKE_UNITS, strokeBoxHeight, type Stroke } from '../../shared/strokes';
import { StrokeSchema } from '../../shared/strokeSchema';
import { CATEGORIES } from './content';
import { ASPECT, GUESS_MS, LAPS, MAX_PLAYERS, MAX_ROUNDS, MIN_PLAYERS, POINTS, REVEAL_MS, STROKE_W, TURN_MS, VOTE_MS } from './rules';

const MAX_Y = strokeBoxHeight(ASPECT);
/** Live-ink batches are small: the canvas flushes about every 50 ms. */
const MAX_INK_NUMBERS = 240;

const Pts = z
  .array(z.number().int().min(0).max(STROKE_UNITS))
  .min(2)
  .max(MAX_INK_NUMBERS)
  .refine((p) => p.length % 2 === 0, 'points must be x,y pairs');

export const actionSchema = z.discriminatedUnion('type', [
  /** Live points of the stroke being drawn. Relayed, never stored. */
  z.object({ type: z.literal('ink'), pts: Pts }).strict(),
  /** The finished stroke: ends the drawer's turn. */
  z.object({ type: z.literal('stroke'), stroke: StrokeSchema }).strict(),
  z.object({ type: z.literal('vote'), target: z.string().min(1).max(MAX_ID_LENGTH) }).strict(),
  z.object({ type: z.literal('guess'), word: z.string().min(1).max(60) }).strict(),
]);
export type ForgeryAction = z.infer<typeof actionSchema>;

export interface ForgerySettings {
  /** Upper bound on rounds; the game plays min(players, rounds). */
  rounds: number;
}

export type Phase = 'draw' | 'vote' | 'guess' | 'reveal' | 'done';
/** escaped: not accused. stolen: caught, guessed right. caught: caught, guessed wrong. void: round abandoned. */
export type Outcome = 'escaped' | 'stolen' | 'caught' | 'void';

export interface TurnRecord {
  by: string;
  /** Asset id of the stroke's Drawing, or null when the turn was skipped. */
  id: string | null;
}

export interface ForgeryState {
  playerIds: string[];
  names: Record<string, string>;
  colors: Record<string, string>;
  /** Left the game (onPlayerLeave). The game never waits on them. */
  gone: string[];
  rounds: number;
  round: number;
  phase: Phase;
  /** Server ms the current phase ends at. */
  deadline: number | null;
  forgerOrder: string[];
  scores: Record<string, number>;
  usedCategories: number[];
  // --- the round ---
  category: number;
  word: string;
  forger: string;
  /** Turn order across all laps. */
  turns: string[];
  turn: number;
  strokes: TurnRecord[];
  votes: Record<string, string>;
  accused: string | null;
  tally: Record<string, number>;
  guess: string | null;
  outcome: Outcome | null;
  /** Points awarded this round, per player id. */
  gain: Record<string, number>;
}

export interface ForgeryView {
  phase: Phase;
  round: number;
  rounds: number;
  deadline: number | null;
  /** Public: everyone, forger included, knows the category. */
  category: string;
  /** Seated players in seat order (for vote options and bots). */
  players: string[];
  gone: string[];
  scores: Record<string, number>;
  turns: string[];
  turn: number;
  drawer: string | null;
  strokes: TurnRecord[];
  /** Who has voted (not for whom) while voting is open. */
  voted: string[];
  myVote: string | null;
  /** Only the viewing player's own card. Null for the screen and spectators. */
  you: { role: 'artist' | 'forger'; word: string | null } | null;
  /** Forger only, guess phase only: the category's words to pick from. */
  options: string[] | null;
  /** From the end of the vote on (the forger is known by then, or the round is over). */
  result: {
    votes: Record<string, string>;
    tally: Record<string, number>;
    accused: string | null;
  } | null;
  /** Reveal and done only. */
  reveal: {
    forger: string;
    word: string;
    guess: string | null;
    outcome: Outcome;
    gain: Record<string, number>;
  } | null;
}

const present = (s: ForgeryState): string[] => s.playerIds.filter((id) => !s.gone.includes(id));
const wordsOf = (s: ForgeryState): string[] => [...CATEGORIES[s.category].words].sort();

function clearRoundTimers(ctx: GameCtx): void {
  for (const k of ['turn', 'vote', 'guess', 'next']) ctx.clearTimer(k);
}

function finishGame(s: ForgeryState, ctx: GameCtx): void {
  clearRoundTimers(ctx);
  s.phase = 'done';
  s.deadline = null;
}

function startRound(s: ForgeryState, ctx: GameCtx): void {
  const here = present(s);
  if (here.length < MIN_PLAYERS) return finishGame(s, ctx);
  s.round++;
  // The forger rotates through the shuffled order, skipping players who left.
  const n = s.forgerOrder.length;
  for (let i = 0; i < n; i++) {
    const cand = s.forgerOrder[(s.round - 1 + i) % n];
    if (here.includes(cand)) {
      s.forger = cand;
      break;
    }
  }
  let pool = CATEGORIES.map((_, i) => i).filter((i) => !s.usedCategories.includes(i));
  if (!pool.length) {
    s.usedCategories = [];
    pool = CATEGORIES.map((_, i) => i);
  }
  s.category = ctx.rng.pick(pool);
  s.usedCategories.push(s.category);
  s.word = ctx.rng.pick(CATEGORIES[s.category].words);
  const order = ctx.rng.shuffle(here);
  s.turns = Array.from({ length: LAPS }, () => order).flat();
  s.turn = 0;
  s.strokes = [];
  s.votes = {};
  s.accused = null;
  s.tally = {};
  s.guess = null;
  s.outcome = null;
  s.gain = {};
  s.phase = 'draw';
  beginTurn(s, ctx);
}

/** Skips players who left, then arms the turn timer (or moves on to the vote after the last turn). */
function beginTurn(s: ForgeryState, ctx: GameCtx): void {
  while (s.turn < s.turns.length && s.gone.includes(s.turns[s.turn])) {
    s.strokes.push({ by: s.turns[s.turn], id: null });
    s.turn++;
  }
  if (s.turn >= s.turns.length) return startVote(s, ctx);
  s.deadline = ctx.now() + TURN_MS;
  ctx.setTimer('turn', TURN_MS);
}

function startVote(s: ForgeryState, ctx: GameCtx): void {
  ctx.clearTimer('turn');
  s.phase = 'vote';
  s.votes = {};
  s.deadline = ctx.now() + VOTE_MS;
  ctx.setTimer('vote', VOTE_MS);
}

function allVoted(s: ForgeryState): boolean {
  return present(s).every((id) => s.votes[id] !== undefined);
}

/** Plurality accuses; a tie for first accuses nobody. */
function resolveVote(s: ForgeryState, ctx: GameCtx): void {
  ctx.clearTimer('vote');
  const tally: Record<string, number> = {};
  for (const target of Object.values(s.votes)) tally[target] = (tally[target] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter((id) => tally[id] === top);
  s.tally = tally;
  s.accused = top > 0 && leaders.length === 1 ? leaders[0] : null;
  if (s.accused !== s.forger) return endRound(s, ctx, 'escaped');
  if (s.gone.includes(s.forger)) return endRound(s, ctx, 'caught');
  s.phase = 'guess';
  s.deadline = ctx.now() + GUESS_MS;
  ctx.setTimer('guess', GUESS_MS);
}

function endRound(s: ForgeryState, ctx: GameCtx, outcome: Outcome): void {
  clearRoundTimers(ctx);
  const gain: Record<string, number> = {};
  const give = (id: string, pts: number) => {
    if (pts > 0 && !s.gone.includes(id)) gain[id] = (gain[id] ?? 0) + pts;
  };
  if (outcome !== 'void') {
    const artists = s.playerIds.filter((id) => id !== s.forger);
    for (const id of artists) if (s.votes[id] === s.forger) give(id, POINTS.sharpEye);
    if (outcome === 'escaped') give(s.forger, POINTS.escaped);
    else if (outcome === 'stolen') give(s.forger, POINTS.stolen);
    else for (const id of artists) give(id, POINTS.caught);
  }
  for (const [id, pts] of Object.entries(gain)) s.scores[id] = (s.scores[id] ?? 0) + pts;
  s.gain = gain;
  s.outcome = outcome;
  s.phase = 'reveal';
  s.deadline = ctx.now() + REVEAL_MS;
  ctx.setTimer('next', REVEAL_MS);
}

function clampPts(p: number[]): number[] {
  return p.map((v, i) => Math.min(v, i % 2 ? MAX_Y : STROKE_UNITS));
}

export default defineGame<ForgeryState, ForgeryAction, ForgerySettings>({
  manifest: {
    id: 'forgery',
    title: 'Forgery',
    tagline: 'One of you has no idea what you are drawing.',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    screen: 'optional',
    estMinutes: 12,
  },
  defaultSettings: { rounds: MAX_ROUNDS },
  actionSchema,

  setup(ctx, players, settings) {
    const ids = players.map((p) => p.id);
    const s: ForgeryState = {
      playerIds: ids,
      names: Object.fromEntries(players.map((p) => [p.id, p.name])),
      colors: Object.fromEntries(players.map((p) => [p.id, p.color])),
      gone: [],
      rounds: Math.max(1, Math.min(settings.rounds, ids.length)),
      round: 0,
      phase: 'draw',
      deadline: null,
      forgerOrder: ctx.rng.shuffle(ids),
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
      usedCategories: [],
      category: 0,
      word: '',
      forger: '',
      turns: [],
      turn: 0,
      strokes: [],
      votes: {},
      accused: null,
      tally: {},
      guess: null,
      outcome: null,
      gain: {},
    };
    startRound(s, ctx);
    return s;
  },

  onAction(s, ctx, playerId, action) {
    if (!s.playerIds.includes(playerId) || s.gone.includes(playerId)) return;
    switch (action.type) {
      case 'ink': {
        if (s.phase !== 'draw' || s.turns[s.turn] !== playerId) return;
        // Same shape for every drawer: nothing here depends on the secret or the role.
        ctx.broadcastEphemeral({ k: 'ink', round: s.round, turn: s.turn, by: playerId, pts: clampPts(action.pts) }, { except: playerId });
        return;
      }
      case 'stroke': {
        if (s.phase !== 'draw' || s.turns[s.turn] !== playerId) return;
        const stroke: Stroke = { c: s.colors[playerId], w: STROKE_W, p: clampPts(action.stroke.p) };
        s.strokes.push({ by: playerId, id: ctx.putAsset(makeDrawing([stroke], ASPECT)) });
        s.turn++;
        beginTurn(s, ctx);
        return;
      }
      case 'vote': {
        if (s.phase !== 'vote') return;
        if (action.target === playerId || !s.playerIds.includes(action.target) || s.gone.includes(action.target)) return;
        s.votes[playerId] = action.target;
        if (allVoted(s)) resolveVote(s, ctx);
        return;
      }
      case 'guess': {
        if (s.phase !== 'guess' || playerId !== s.forger) return;
        if (!CATEGORIES[s.category].words.includes(action.word)) return;
        s.guess = action.word;
        endRound(s, ctx, action.word === s.word ? 'stolen' : 'caught');
        return;
      }
    }
  },

  onTimer(s, ctx, key) {
    if (key === 'turn' && s.phase === 'draw') {
      s.strokes.push({ by: s.turns[s.turn], id: null });
      s.turn++;
      beginTurn(s, ctx);
    } else if (key === 'vote' && s.phase === 'vote') {
      resolveVote(s, ctx);
    } else if (key === 'guess' && s.phase === 'guess') {
      endRound(s, ctx, 'caught'); // no guess in time
    } else if (key === 'next' && s.phase === 'reveal') {
      if (s.round >= s.rounds) finishGame(s, ctx);
      else startRound(s, ctx);
    }
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.playerIds.includes(playerId) || s.gone.includes(playerId)) return;
    s.gone.push(playerId);
    if (s.phase === 'reveal' || s.phase === 'done') return; // the reveal timer moves on, startRound checks who is left
    const inRound = s.phase === 'draw' || s.phase === 'vote' || s.phase === 'guess';
    if (inRound && (playerId === s.forger || present(s).length < MIN_PLAYERS)) return endRound(s, ctx, s.phase === 'guess' && playerId === s.forger ? 'caught' : 'void');
    if (s.phase === 'draw' && s.turns[s.turn] === playerId) {
      s.strokes.push({ by: playerId, id: null });
      s.turn++;
      beginTurn(s, ctx);
    } else if (s.phase === 'vote' && allVoted(s)) {
      resolveVote(s, ctx);
    }
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((id) => id !== playerId);
  },

  view(s, viewer): ForgeryView {
    const me = viewer.kind === 'player' && s.playerIds.includes(viewer.id) ? viewer.id : null;
    const isForger = me !== null && me === s.forger;
    // The vote is over: the forger is caught (guess) or the round is being shown (reveal).
    const voteOver = s.phase === 'guess' || s.phase === 'reveal' || s.phase === 'done';
    const showReveal = s.phase === 'reveal' || s.phase === 'done';
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      deadline: s.deadline,
      category: CATEGORIES[s.category].title,
      players: s.playerIds,
      gone: s.gone,
      scores: s.scores,
      turns: s.turns,
      turn: s.turn,
      drawer: s.phase === 'draw' ? (s.turns[s.turn] ?? null) : null,
      strokes: s.strokes,
      voted: s.phase === 'vote' ? Object.keys(s.votes) : [],
      myVote: me && s.phase === 'vote' ? (s.votes[me] ?? null) : null,
      you: me ? { role: isForger ? 'forger' : 'artist', word: isForger ? null : s.word } : null,
      options: isForger && s.phase === 'guess' ? wordsOf(s) : null,
      result: voteOver ? { votes: s.votes, tally: s.tally, accused: s.accused } : null,
      reveal: showReveal && s.outcome ? { forger: s.forger, word: s.word, guess: s.guess, outcome: s.outcome, gain: s.gain } : null,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    const best = Math.max(0, ...Object.values(s.scores));
    const top = s.playerIds.filter((id) => s.scores[id] === best && best > 0).map((id) => s.names[id]);
    return { scores: { ...s.scores }, summary: top.length ? `Sharpest: ${top.join(', ')} with ${best}` : 'Nobody scored' };
  },

  bot: {
    act(raw, rng, me) {
      const v = raw as ForgeryView;
      if (v.phase === 'draw' && v.drawer === me) {
        // A meandering line: legal, harmless, and unrelated to any secret.
        let x = rng.int(100, 900);
        let y = rng.int(100, 650);
        const p: number[] = [x, y];
        for (let i = rng.int(12, 30); i > 0; i--) {
          x = Math.max(0, Math.min(STROKE_UNITS, x + rng.int(-70, 70)));
          y = Math.max(0, Math.min(MAX_Y, y + rng.int(-60, 60)));
          p.push(x, y);
        }
        return { type: 'stroke', stroke: { c: '#ffffff', w: STROKE_W, p } };
      }
      if (v.phase === 'vote' && !v.myVote) {
        const others = v.players.filter((id) => id !== me && !v.gone.includes(id));
        return others.length ? { type: 'vote', target: rng.pick(others) } : null;
      }
      if (v.phase === 'guess' && v.options?.length) return { type: 'guess', word: rng.pick(v.options) };
      return null;
    },
  },
});
