// Cracked Cookbook: players draw ingredients and scenery (the pantry), are dealt other
// players' drawings as stickers, cook a dish on a plate, and vote for the best one.
// Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now.
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import type { Rng } from '../../core/rng';
import { sanitizeName } from '../../shared/limits';
import { StrokesSchema } from '../../shared/strokeSchema';
import { makeDrawing, type Stroke } from '../../shared/strokes';
import { INGREDIENTS, MEAL_PROMPTS, SCENE_ELEMENTS } from './content';
import {
  COOK_MS,
  DRAW_MS,
  DRAW_ROUNDS,
  HAND_SIZE,
  MAX_STICKERS,
  MIN_HAND,
  NAME_MAX,
  PLATE_UNITS,
  PROP_PTS,
  REVEAL_LEAD_MS,
  REVEAL_STEP_MS,
  STANDINGS_MS,
  VOTE_MS,
  VOTE_PTS,
} from './rules';

// ---------------------------------------------------------------- actions

const StickerSchema = z
  .object({
    /** Index into the pantry (state.props). Must be in the sender's dealt hand. */
    p: z.number().int().min(0).max(999),
    x: z.number().int().min(0).max(PLATE_UNITS),
    y: z.number().int().min(0).max(PLATE_UNITS),
    /** Scale, 1 = a quarter of the plate width. */
    s: z.number().min(0.3).max(3),
    /** Rotation in degrees. */
    r: z.number().int().min(-180).max(180),
  })
  .strict();
export type Sticker = z.infer<typeof StickerSchema>;

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prop'), strokes: StrokesSchema, name: z.string().max(80) }).strict(),
  z
    .object({ type: z.literal('dish'), strokes: StrokesSchema, stickers: z.array(StickerSchema).max(MAX_STICKERS) })
    .strict(),
  z.object({ type: z.literal('vote'), dish: z.number().int().min(0).max(999) }).strict(),
]);
export type CookAction = z.infer<typeof actionSchema>;

// ---------------------------------------------------------------- state

export type CookPhase = 'draw' | 'cook' | 'vote' | 'reveal' | 'done';

export interface Prop {
  asset: string;
  name: string;
  by: string;
}
export interface Dish {
  by: string;
  asset: string | null;
  stickers: Sticker[];
  meal: string;
}
interface Sub {
  asset: string | null;
  stickers: Sticker[];
}
export interface DishResult {
  votes: number;
  /** Points the creator earned from these votes. */
  pts: number;
  /** Distinct prop artists (not the creator) who earn PROP_PTS per vote. */
  artists: string[];
}

export interface CookState {
  playerIds: string[];
  names: Record<string, string>;
  phase: CookPhase;
  /** Drawing round (1..DRAW_ROUNDS) while phase is 'draw'. */
  round: number;
  /** Server ms when the current phase times out. */
  deadline: number;
  gone: string[];
  /** Players who have acted in the current phase (draw and cook). */
  submitted: string[];
  itemPrompts: Record<string, string>;
  /** The pantry. A prop's id is its index. */
  props: Prop[];
  meals: Record<string, string>;
  /** Prop indexes each player was dealt. Stickers may only use these. */
  hands: Record<string, number[]>;
  subs: Record<string, Sub>;
  dishes: Dish[];
  /** voter id -> dish index. */
  votes: Record<string, number>;
  scores: Record<string, number>;
  detail: DishResult[];
  revealAt: number;
  /** Dish indexes in reveal order (fewest points first, so the winner comes last). */
  order: number[];
}

// ---------------------------------------------------------------- view

export interface DishView {
  id: number;
  asset: string | null;
  stickers: Sticker[];
  meal: string;
  /** Creator: only once the reveal starts. */
  by?: string;
}
export interface CookView {
  phase: CookPhase;
  round: number;
  rounds: number;
  deadline: number | null;
  pantry: { id: number; asset: string; name: string; by: string }[];
  /** Players the phase is still waiting on. */
  waiting: string[];
  /** Who is cooking what (cook phase). */
  meals: Record<string, string> | null;
  dishes: DishView[];
  reveal: { startAt: number; interval: number; order: number[]; detail: DishResult[] } | null;
  scores: Record<string, number> | null;
  you: {
    submitted: boolean;
    prompt: string | null;
    meal: string | null;
    /** Pantry indexes this player may use as stickers. */
    hand: number[];
    vote: number | null;
    ownDish: number;
  } | null;
}

// ---------------------------------------------------------------- scoring

/** Distinct prop artists behind a dish, excluding its creator. */
export function propArtists(dish: Dish, props: readonly Prop[]): string[] {
  const out: string[] = [];
  for (const st of dish.stickers) {
    const by = props[st.p]?.by;
    if (by && by !== dish.by && !out.includes(by)) out.push(by);
  }
  return out;
}

/**
 * Turns votes into points. The dish creator earns VOTE_PTS per vote; every distinct prop
 * artist behind the dish (other than the creator) earns PROP_PTS per vote. Votes for a
 * missing dish or for the voter's own dish are ignored.
 */
export function tally(
  dishes: readonly Dish[],
  props: readonly Prop[],
  votes: Record<string, number>,
): { scores: Record<string, number>; detail: DishResult[] } {
  const scores: Record<string, number> = {};
  const add = (id: string, n: number) => (scores[id] = (scores[id] ?? 0) + n);
  const detail: DishResult[] = dishes.map((d) => ({ votes: 0, pts: 0, artists: propArtists(d, props) }));
  for (const [voter, idx] of Object.entries(votes)) {
    const d = dishes[idx];
    if (!d || d.by === voter) continue;
    detail[idx].votes++;
    detail[idx].pts += VOTE_PTS;
    add(d.by, VOTE_PTS);
    for (const a of detail[idx].artists) add(a, PROP_PTS);
  }
  return { scores, detail };
}

// ---------------------------------------------------------------- flow

const activeIds = (s: CookState) => s.playerIds.filter((id) => !s.gone.includes(id));

function enter(s: CookState, ctx: GameCtx, phase: CookPhase, ms: number): void {
  s.phase = phase;
  s.deadline = ctx.now() + ms;
  s.submitted = [];
  ctx.setTimer('phase', ms);
}

function startDraw(s: CookState, ctx: GameCtx, round: number): void {
  s.round = round;
  const pool = ctx.rng.shuffle(round === 1 ? INGREDIENTS : SCENE_ELEMENTS);
  s.playerIds.forEach((id, i) => (s.itemPrompts[id] = pool[i % pool.length]));
  enter(s, ctx, 'draw', DRAW_MS);
}

function startCook(s: CookState, ctx: GameCtx): void {
  const meals = ctx.rng.shuffle(MEAL_PROMPTS);
  s.playerIds.forEach((id, i) => (s.meals[id] = meals[i % meals.length]));
  for (const id of s.playerIds) {
    const others: number[] = [];
    const own: number[] = [];
    s.props.forEach((p, i) => (p.by === id ? own : others).push(i));
    const hand = ctx.rng.shuffle(others).slice(0, HAND_SIZE);
    // Only when the pantry is tiny does a cook get their own props back.
    if (hand.length < MIN_HAND) hand.push(...ctx.rng.shuffle(own).slice(0, MIN_HAND - hand.length));
    s.hands[id] = hand;
  }
  enter(s, ctx, 'cook', COOK_MS);
}

function endDraw(s: CookState, ctx: GameCtx): void {
  if (s.round < DRAW_ROUNDS) startDraw(s, ctx, s.round + 1);
  else startCook(s, ctx);
}

function endCook(s: CookState, ctx: GameCtx): void {
  for (const id of ctx.rng.shuffle(s.playerIds)) {
    const sub = s.subs[id];
    if (sub && (sub.asset || sub.stickers.length)) {
      s.dishes.push({ by: id, asset: sub.asset, stickers: sub.stickers, meal: s.meals[id] ?? '' });
    }
  }
  if (s.dishes.length >= 2) {
    enter(s, ctx, 'vote', VOTE_MS);
    s.votes = {};
  } else {
    endVote(s, ctx);
  }
}

function endVote(s: CookState, ctx: GameCtx): void {
  const { scores, detail } = tally(s.dishes, s.props, s.votes);
  for (const [id, n] of Object.entries(scores)) s.scores[id] = (s.scores[id] ?? 0) + n;
  s.detail = detail;
  s.order = s.dishes.map((_, i) => i).sort((a, b) => detail[a].pts - detail[b].pts || a - b);
  const total = REVEAL_LEAD_MS + s.order.length * REVEAL_STEP_MS + STANDINGS_MS;
  s.revealAt = ctx.now() + REVEAL_LEAD_MS;
  enter(s, ctx, 'reveal', total);
}

/** Moves on early once everyone still present has acted. */
function maybeAdvance(s: CookState, ctx: GameCtx): void {
  const present = activeIds(s);
  if (s.phase === 'draw' && present.every((id) => s.submitted.includes(id))) endDraw(s, ctx);
  else if (s.phase === 'cook' && present.every((id) => s.submitted.includes(id))) endCook(s, ctx);
  else if (s.phase === 'vote' && present.every((id) => id in s.votes)) endVote(s, ctx);
}

// ---------------------------------------------------------------- bots

const BOT_INK = ['#1a1033', '#ff5e87', '#ff8a1f', '#3fbf6f', '#36a5f4', '#7a5cff', '#8b5a2b'];

/** A legal, simple drawing: a blob and a squiggle. */
export function botStrokes(rng: Rng): Stroke[] {
  const cx = rng.int(380, 620);
  const cy = rng.int(380, 620);
  const r = rng.int(140, 300);
  const blob: number[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rr = r * (0.85 + rng.next() * 0.3);
    blob.push(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr));
  }
  const strokes: Stroke[] = [{ c: rng.pick(BOT_INK), w: 24, p: blob }];
  if (rng.chance(0.7)) {
    const sq: number[] = [];
    for (let i = 0; i < 6; i++) sq.push(rng.int(250, 750), rng.int(250, 750));
    strokes.push({ c: rng.pick(BOT_INK), w: 14, p: sq });
  }
  return strokes;
}

// ---------------------------------------------------------------- game

export default defineGame<CookState, CookAction, Record<string, never>>({
  manifest: {
    id: 'cracked-cookbook',
    title: 'Cracked Cookbook',
    tagline: 'Draw the pantry, then cook with everyone else’s scribbles.',
    minPlayers: 3,
    maxPlayers: 20,
    screen: 'optional',
    estMinutes: 10,
  },
  defaultSettings: {},
  actionSchema,

  setup(ctx, players) {
    const s: CookState = {
      playerIds: players.map((p) => p.id),
      names: Object.fromEntries(players.map((p) => [p.id, p.name])),
      phase: 'draw',
      round: 1,
      deadline: 0,
      gone: [],
      submitted: [],
      itemPrompts: {},
      props: [],
      meals: {},
      hands: {},
      subs: {},
      dishes: [],
      votes: {},
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      detail: [],
      revealAt: 0,
      order: [],
    };
    startDraw(s, ctx, 1);
    return s;
  },

  onAction(s, ctx, playerId, a) {
    if (!s.playerIds.includes(playerId) || s.gone.includes(playerId)) return;

    if (a.type === 'prop') {
      if (s.phase !== 'draw' || s.submitted.includes(playerId)) return;
      s.submitted.push(playerId);
      if (a.strokes.length) {
        const fallback = s.itemPrompts[playerId] ?? 'Mystery item';
        const name = sanitizeName(a.name).slice(0, NAME_MAX).trim() || fallback;
        s.props.push({ asset: ctx.putAsset(makeDrawing(a.strokes, 1)), name, by: playerId });
      }
      maybeAdvance(s, ctx);
    } else if (a.type === 'dish') {
      if (s.phase !== 'cook' || s.submitted.includes(playerId)) return;
      s.submitted.push(playerId);
      const hand = s.hands[playerId] ?? [];
      // Stickers must come from this player's dealt hand; anything else is dropped.
      const stickers = a.stickers
        .filter((st) => hand.includes(st.p) && s.props[st.p])
        .slice(0, MAX_STICKERS)
        .map((st) => ({ ...st, s: Math.round(st.s * 100) / 100 }));
      s.subs[playerId] = { asset: a.strokes.length ? ctx.putAsset(makeDrawing(a.strokes, 1)) : null, stickers };
      maybeAdvance(s, ctx);
    } else {
      if (s.phase !== 'vote') return;
      const d = s.dishes[a.dish];
      if (!d || d.by === playerId) return; // no voting for your own dish
      s.votes[playerId] = a.dish;
      maybeAdvance(s, ctx);
    }
  },

  onTimer(s, ctx, key) {
    if (key !== 'phase') return;
    if (s.phase === 'draw') endDraw(s, ctx);
    else if (s.phase === 'cook') endCook(s, ctx);
    else if (s.phase === 'vote') endVote(s, ctx);
    else if (s.phase === 'reveal') s.phase = 'done';
  },

  onPlayerLeave(s, ctx, playerId) {
    if (!s.gone.includes(playerId)) s.gone.push(playerId);
    maybeAdvance(s, ctx);
  },

  onPlayerReturn(s, _ctx, playerId) {
    s.gone = s.gone.filter((id) => id !== playerId);
  },

  view(s, viewer): CookView {
    const me = viewer.kind === 'player' ? viewer.id : null;
    const revealed = s.phase === 'reveal' || s.phase === 'done';
    const showDishes = s.phase === 'vote' || revealed;
    const present = activeIds(s);
    let waiting: string[] = [];
    if (s.phase === 'draw' || s.phase === 'cook') waiting = present.filter((id) => !s.submitted.includes(id));
    else if (s.phase === 'vote') waiting = present.filter((id) => !(id in s.votes));
    return {
      phase: s.phase,
      round: s.round,
      rounds: DRAW_ROUNDS,
      deadline: s.phase === 'done' ? null : s.deadline,
      pantry: s.props.map((p, i) => ({ id: i, asset: p.asset, name: p.name, by: p.by })),
      waiting,
      meals: s.phase === 'cook' ? s.meals : null,
      // Who cooked a dish stays hidden until the reveal.
      dishes: showDishes
        ? s.dishes.map((d, i) => ({
            id: i,
            asset: d.asset,
            stickers: d.stickers,
            meal: d.meal,
            ...(revealed ? { by: d.by } : {}),
          }))
        : [],
      reveal: revealed ? { startAt: s.revealAt, interval: REVEAL_STEP_MS, order: s.order, detail: s.detail } : null,
      scores: revealed ? s.scores : null,
      // The hand and prompts are the player's own business: the screen and others never get them.
      you: me
        ? {
            submitted:
              s.phase === 'vote' ? me in s.votes : s.phase === 'draw' || s.phase === 'cook' ? s.submitted.includes(me) : true,
            prompt: s.phase === 'draw' ? (s.itemPrompts[me] ?? null) : null,
            meal: s.phase === 'cook' ? (s.meals[me] ?? null) : null,
            hand: s.phase === 'cook' ? (s.hands[me] ?? []) : [],
            vote: s.votes[me] ?? null,
            ownDish: s.dishes.findIndex((d) => d.by === me),
          }
        : null,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    let best = -1;
    s.detail.forEach((d, i) => {
      if (d.votes > 0 && (best < 0 || d.pts > s.detail[best].pts)) best = i;
    });
    const top = best >= 0 ? s.dishes[best] : null;
    return {
      scores: { ...s.scores },
      summary: top
        ? `Best dish: ${s.names[top.by] ?? 'Someone'}’s ${top.meal.toLowerCase()} (${s.detail[best].votes} votes)`
        : 'The kitchen stayed quiet',
    };
  },

  bot: {
    act(view, rng) {
      const v = view as CookView;
      const you = v.you;
      if (!you || !rng.chance(0.7)) return null;
      if (v.phase === 'draw' && !you.submitted) {
        return { type: 'prop', strokes: botStrokes(rng), name: (you.prompt ?? 'Mystery item').slice(0, NAME_MAX) };
      }
      if (v.phase === 'cook' && !you.submitted) {
        const stickers: Sticker[] = [];
        const picks = rng.shuffle(you.hand).slice(0, rng.int(1, 3));
        for (const p of picks) {
          stickers.push({ p, x: rng.int(250, 750), y: rng.int(250, 750), s: Math.round(rng.int(60, 160)) / 100, r: rng.int(-40, 40) });
        }
        return { type: 'dish', strokes: rng.chance(0.6) ? botStrokes(rng).slice(0, 1) : [], stickers };
      }
      if (v.phase === 'vote' && you.vote === null) {
        const options = v.dishes.filter((d) => d.id !== you.ownDish);
        if (options.length) return { type: 'vote', dish: rng.pick(options).id };
      }
      return null;
    },
  },
});
