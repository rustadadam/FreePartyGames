// Cracked Cookbook: players draw ingredients and scenery (the pantry), are dealt other
// players' drawings as stickers, cook a dish on a plate (props only, no drawing), name it, and rank
// their top three dishes.
// Pure TypeScript: no DOM, no Cloudflare, no Math.random / Date.now.
import { z } from 'zod';
import { defineGame, type GameCtx } from '../../core/game';
import type { Rng } from '../../core/rng';
import { sanitizeName } from '../../shared/limits';
import { StrokesSchema } from '../../shared/strokeSchema';
import type { SettingField } from '../../shared/types';
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
  RANK_PTS,
  RANK_SLOTS,
  REVEAL_LEAD_MS,
  REVEAL_STEP_MS,
  REVEAL_TAIL_MS,
  TITLE_MAX,
  VOTE_MS,
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

const StickersSchema = z.array(StickerSchema).max(MAX_STICKERS);
const NameSchema = z.string().max(80);
const RoundSchema = z.number().int().min(1).max(DRAW_ROUNDS);
const DishIdSchema = z.number().int().min(0).max(999);
const RankingSchema = z.array(DishIdSchema).max(RANK_SLOTS);

export const actionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('prop'),
      strokes: StrokesSchema,
      name: NameSchema,
      /** The drawing round this prop was drawn in: a late round-1 draft must not land in round 2. */
      round: RoundSchema.optional(),
    })
    .strict(),
  // The cook phase is props only: stickers and a title, no strokes.
  z.object({ type: z.literal('dish'), stickers: StickersSchema, title: NameSchema }).strict(),
  z.object({ type: z.literal('rank'), dishes: RankingSchema }).strict(),
  // Autosave. Same schemas as the real submits; the phase decides which fields are read:
  // draw: strokes + name (+ round), cook: stickers + title, vote: ranking.
  z
    .object({
      type: z.literal('draft'),
      strokes: StrokesSchema.optional(),
      name: NameSchema.optional(),
      round: RoundSchema.optional(),
      stickers: StickersSchema.optional(),
      title: NameSchema.optional(),
      ranking: RankingSchema.optional(),
    })
    .strict(),
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
  stickers: Sticker[];
  meal: string;
  title: string;
}
export interface DishResult {
  /** How many players put this dish 1st, 2nd and 3rd. */
  places: number[];
  /** Points the creator earned from those placements. */
  pts: number;
  /** Distinct prop artists (not the creator) who earn PROP_PTS per placement. */
  artists: string[];
}
export interface PointsLine {
  pts: number;
  why: string;
}

interface PropDraft {
  strokes: Stroke[];
  name: string;
}
interface DishDraft {
  stickers: Sticker[];
  title: string;
}
interface Drafts {
  props: Record<string, PropDraft>;
  dishes: Record<string, DishDraft>;
  ranks: Record<string, number[]>;
}
const emptyDrafts = (): Drafts => ({ props: {}, dishes: {}, ranks: {} });

export interface CookSettings {
  /** Seconds to draw one prop. */
  drawSeconds: number;
  /** Seconds to build the dish. */
  cookSeconds: number;
}

const settingsFields: SettingField[] = [
  { key: 'drawSeconds', label: 'Drawing time', hint: 'Per prop', min: 30, max: 150, step: 15, unit: 's' },
  { key: 'cookSeconds', label: 'Cooking time', hint: 'To build the dish', min: 60, max: 300, step: 30, unit: 's' },
];

export interface CookState {
  /** Length of a drawing round and of the cooking round, in ms. */
  drawMs: number;
  cookMs: number;
  playerIds: string[];
  names: Record<string, string>;
  phase: CookPhase;
  /** Drawing round (1..DRAW_ROUNDS) while phase is 'draw'. */
  round: number;
  /** Server ms when the current phase times out. */
  deadline: number;
  gone: string[];
  /** Players who have submitted in the current phase (draw, cook and rank). */
  submitted: string[];
  itemPrompts: Record<string, string>;
  /** The pantry. A prop's id is its index. */
  props: Prop[];
  meals: Record<string, string>;
  /** Prop indexes each player was dealt. Stickers may only use these. */
  hands: Record<string, number[]>;
  subs: Record<string, { stickers: Sticker[]; title: string }>;
  dishes: Dish[];
  /** Autosaved work, never in a view. Cleared whenever a phase begins. */
  drafts: Drafts;
  /** voter id -> dish indexes, best first (at most RANK_SLOTS). */
  ranks: Record<string, number[]>;
  scores: Record<string, number>;
  detail: DishResult[];
  /** Where each player's points came from. Only the player's own lines reach a view. */
  lines: Record<string, PointsLine[]>;
  revealAt: number;
  /** Dish indexes in reveal order (fewest points first, so the winner comes last). */
  order: number[];
}

// ---------------------------------------------------------------- view

export interface DishView {
  id: number;
  stickers: Sticker[];
  meal: string;
  title: string;
  /** Creator: only once the reveal starts. */
  by?: string;
}
export interface CookView {
  phase: CookPhase;
  round: number;
  rounds: number;
  deadline: number | null;
  /** Length of a drawing round and of the cooking round, for the timer ring. */
  drawMs: number;
  cookMs: number;
  /** `by` (the prop's artist) only from the reveal on: with it, the props on a dish (never the
   *  cook's own) would narrow down who cooked it. */
  pantry: { id: number; asset: string; name: string; by?: string }[];
  /** Players the phase is still waiting on. */
  waiting: string[];
  /** The meals on order (cook phase), sorted and never paired with a cook: each dish shows its
   *  meal in the vote, so a public cook-to-meal map would name every dish's cook. */
  orders: string[] | null;
  dishes: DishView[];
  reveal: { startAt: number; interval: number; order: number[]; detail: DishResult[] } | null;
  scores: Record<string, number> | null;
  you: {
    submitted: boolean;
    prompt: string | null;
    meal: string | null;
    /** Pantry indexes this player may use as stickers. */
    hand: number[];
    /** Dishes this player must rank: min(RANK_SLOTS, dishes that are not theirs). */
    need: number;
    /** Their submitted ranking (dish ids, best first). */
    rank: number[];
    ownDish: number;
    /** Reveal only: this player's own lines of points. */
    points: PointsLine[];
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

/** A voter's ranking with missing dishes, their own dish and repeats dropped, at most RANK_SLOTS. */
export function cleanRanking(list: readonly number[], dishes: readonly Dish[], voter: string): number[] {
  const out: number[] = [];
  for (const i of list) {
    const d = dishes[i];
    if (d && d.by !== voter && !out.includes(i)) out.push(i);
    if (out.length >= RANK_SLOTS) break;
  }
  return out;
}

/** How many dishes a player has to rank. */
export function rankNeed(dishes: readonly Dish[], voter: string): number {
  return Math.min(RANK_SLOTS, dishes.filter((d) => d.by !== voter).length);
}

const ORDINAL = ['1st', '2nd', '3rd'];
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} props`;

/**
 * Turns rankings into points. A dish earns its creator RANK_PTS[place] for each 1st, 2nd and
 * 3rd placement; every distinct prop artist on the dish (other than the creator) earns PROP_PTS
 * per placement. Rankings are cleaned first, so nobody scores from ranking their own dish.
 * `lines` says, per player, where each point came from.
 */
export function tally(
  dishes: readonly Dish[],
  props: readonly Prop[],
  ranks: Record<string, number[]>,
  names: Record<string, string> = {},
): { scores: Record<string, number>; detail: DishResult[]; lines: Record<string, PointsLine[]> } {
  const detail: DishResult[] = dishes.map((d) => ({ places: Array(RANK_SLOTS).fill(0), pts: 0, artists: propArtists(d, props) }));
  for (const [voter, list] of Object.entries(ranks)) {
    cleanRanking(list, dishes, voter).forEach((idx, place) => {
      detail[idx].places[place]++;
      detail[idx].pts += RANK_PTS[place];
    });
  }
  const scores: Record<string, number> = {};
  const lines: Record<string, PointsLine[]> = {};
  const add = (id: string, pts: number, why: string) => {
    scores[id] = (scores[id] ?? 0) + pts;
    (lines[id] ??= []).push({ pts, why });
  };
  dishes.forEach((d, i) => {
    const r = detail[i];
    r.places.forEach((n, place) => {
      if (n > 0) add(d.by, n * RANK_PTS[place], `${ORDINAL[place]} place${n > 1 ? ` from ${n} players` : ''} for ${d.title}`);
    });
    const placed = r.places.reduce((a, b) => a + b, 0);
    if (!placed) return;
    for (const artist of r.artists) {
      const mine: string[] = [];
      for (const st of d.stickers) {
        const p = props[st.p];
        if (p?.by === artist && !mine.includes(p.name)) mine.push(p.name);
      }
      const verb = mine.length === 1 ? 'was' : 'were';
      add(
        artist,
        PROP_PTS * placed,
        `your ${joinNames(mine)} ${verb} in ${names[d.by] ?? 'someone'}’s dish “${d.title}”${placed > 1 ? ` (ranked ${placed} times)` : ''}`,
      );
    }
  });
  for (const l of Object.values(lines)) l.sort((a, b) => b.pts - a.pts);
  return { scores, detail, lines };
}

// ---------------------------------------------------------------- flow

const activeIds = (s: CookState) => s.playerIds.filter((id) => !s.gone.includes(id));

function enter(s: CookState, ctx: GameCtx, phase: CookPhase, ms: number): void {
  s.phase = phase;
  s.deadline = ctx.now() + ms;
  s.submitted = [];
  s.drafts = emptyDrafts();
  ctx.setTimer('phase', ms);
}

function startDraw(s: CookState, ctx: GameCtx, round: number): void {
  s.round = round;
  const pool = ctx.rng.shuffle(round === 1 ? INGREDIENTS : SCENE_ELEMENTS);
  s.playerIds.forEach((id, i) => (s.itemPrompts[id] = pool[i % pool.length]));
  enter(s, ctx, 'draw', s.drawMs);
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
  enter(s, ctx, 'cook', s.cookMs);
}

function endDraw(s: CookState, ctx: GameCtx): void {
  if (s.round < DRAW_ROUNDS) startDraw(s, ctx, s.round + 1);
  else startCook(s, ctx);
}

function endCook(s: CookState, ctx: GameCtx): void {
  for (const id of ctx.rng.shuffle(s.playerIds)) {
    const sub = s.subs[id];
    if (sub && sub.stickers.length) {
      const meal = s.meals[id] ?? '';
      s.dishes.push({ by: id, stickers: sub.stickers, meal, title: sub.title || meal });
    }
  }
  if (s.dishes.length >= 2) enter(s, ctx, 'vote', VOTE_MS);
  else endVote(s, ctx);
}

function endVote(s: CookState, ctx: GameCtx): void {
  const { scores, detail, lines } = tally(s.dishes, s.props, s.ranks, s.names);
  for (const [id, n] of Object.entries(scores)) s.scores[id] = (s.scores[id] ?? 0) + n;
  s.detail = detail;
  s.lines = lines;
  s.order = s.dishes.map((_, i) => i).sort((a, b) => detail[a].pts - detail[b].pts || a - b);
  // One step per dish, one closing step, then a short rest before the shell's podium.
  const total = REVEAL_LEAD_MS + (s.order.length + 1) * REVEAL_STEP_MS + REVEAL_TAIL_MS;
  s.revealAt = ctx.now() + REVEAL_LEAD_MS;
  enter(s, ctx, 'reveal', total);
}

/** Moves on early once everyone still present has submitted. */
function maybeAdvance(s: CookState, ctx: GameCtx): void {
  const present = activeIds(s);
  if (!present.every((id) => s.submitted.includes(id))) return;
  if (s.phase === 'draw') endDraw(s, ctx);
  else if (s.phase === 'cook') endCook(s, ctx);
  else if (s.phase === 'vote') endVote(s, ctx);
}

// ---------------------------------------------------------------- submits (shared by actions and drafts)

function cleanTitle(raw: string): string {
  return sanitizeName(raw).slice(0, TITLE_MAX).trim();
}

function submitProp(s: CookState, ctx: GameCtx, id: string, strokes: Stroke[], name: string): void {
  s.submitted.push(id);
  if (!strokes.length) return;
  const fallback = s.itemPrompts[id] ?? 'Mystery item';
  s.props.push({
    asset: ctx.putAsset(makeDrawing(strokes, 1)),
    name: sanitizeName(name).slice(0, NAME_MAX).trim() || fallback,
    by: id,
  });
}

function submitDish(s: CookState, id: string, stickers: Sticker[], title: string): void {
  s.submitted.push(id);
  const hand = s.hands[id] ?? [];
  // Stickers must come from this player's dealt hand; anything else is dropped.
  s.subs[id] = {
    stickers: stickers
      .filter((st) => hand.includes(st.p) && s.props[st.p])
      .slice(0, MAX_STICKERS)
      .map((st) => ({ ...st, s: Math.round(st.s * 100) / 100 })),
    title: cleanTitle(title),
  };
}

/** Returns false (and records nothing) for a ranking that is not a legal full ranking. */
function submitRank(s: CookState, id: string, ranking: number[], partialOk: boolean): boolean {
  const clean = cleanRanking(ranking, s.dishes, id);
  if (clean.length !== ranking.length) return false; // own dish, missing dish or a repeat
  if (!partialOk && clean.length !== rankNeed(s.dishes, id)) return false;
  s.ranks[id] = clean;
  s.submitted.push(id);
  return true;
}

/** The phase ran out: whoever has a draft and has not submitted gets their latest draft submitted. */
function submitDrafts(s: CookState, ctx: GameCtx): void {
  for (const id of activeIds(s)) {
    if (s.submitted.includes(id)) continue;
    if (s.phase === 'draw') {
      const d = s.drafts.props[id];
      if (d) submitProp(s, ctx, id, d.strokes, d.name);
    } else if (s.phase === 'cook') {
      const d = s.drafts.dishes[id];
      if (d) submitDish(s, id, d.stickers, d.title);
    } else if (s.phase === 'vote') {
      const d = s.drafts.ranks[id];
      // Partial counts; a draft that breaks the rules (own dish, repeat) is skipped.
      if (d?.length) submitRank(s, id, d, true);
    }
  }
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

function botStickers(hand: number[], rng: Rng): Sticker[] {
  return rng
    .shuffle(hand)
    .slice(0, rng.int(1, 3))
    .map((p) => ({ p, x: rng.int(250, 750), y: rng.int(250, 750), s: Math.round(rng.int(60, 160)) / 100, r: rng.int(-40, 40) }));
}

function pickRanking(v: CookView, rng: Rng): number[] {
  const own = v.you?.ownDish ?? -1;
  const ids = v.dishes.filter((d) => d.id !== own).map((d) => d.id);
  return rng.shuffle(ids).slice(0, v.you?.need ?? RANK_SLOTS);
}

// ---------------------------------------------------------------- game

export default defineGame<CookState, CookAction, CookSettings>({
  manifest: {
    id: 'cracked-cookbook',
    title: 'Cracked Cookbook',
    tagline: 'Draw the ingredients, then cook with everyone else’s drawings.',
    minPlayers: 3,
    maxPlayers: 20,
    screen: 'optional',
    estMinutes: 10,
  },
  defaultSettings: { drawSeconds: DRAW_MS / 1000, cookSeconds: COOK_MS / 1000 },
  settingsFields,
  actionSchema,

  setup(ctx, players, settings) {
    const s: CookState = {
      drawMs: settings.drawSeconds * 1000,
      cookMs: settings.cookSeconds * 1000,
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
      drafts: emptyDrafts(),
      ranks: {},
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      detail: [],
      lines: {},
      revealAt: 0,
      order: [],
    };
    startDraw(s, ctx, 1);
    return s;
  },

  onAction(s, ctx, playerId, a) {
    if (!s.playerIds.includes(playerId) || s.gone.includes(playerId)) return;
    // Stale (already submitted, or wrong phase): ignored without error.
    if (s.submitted.includes(playerId)) return;

    if (a.type === 'draft') {
      // A draft never counts as done and never changes a view; the latest one wins.
      if (s.phase === 'draw' && a.strokes) {
        if (a.round !== undefined && a.round !== s.round) return;
        s.drafts.props[playerId] = { strokes: a.strokes, name: a.name ?? '' };
      } else if (s.phase === 'cook' && a.stickers) {
        s.drafts.dishes[playerId] = { stickers: a.stickers, title: a.title ?? '' };
      } else if (s.phase === 'vote' && a.ranking) {
        s.drafts.ranks[playerId] = a.ranking;
      }
      return;
    }

    if (a.type === 'prop') {
      if (s.phase !== 'draw') return;
      if (a.round !== undefined && a.round !== s.round) return;
      submitProp(s, ctx, playerId, a.strokes, a.name);
    } else if (a.type === 'dish') {
      if (s.phase !== 'cook') return;
      submitDish(s, playerId, a.stickers, a.title);
    } else {
      if (s.phase !== 'vote' || !submitRank(s, playerId, a.dishes, false)) return;
    }
    maybeAdvance(s, ctx);
  },

  onTimer(s, ctx, key) {
    if (key !== 'phase') return;
    if (s.phase === 'reveal') {
      s.phase = 'done';
      return;
    }
    submitDrafts(s, ctx);
    if (s.phase === 'draw') endDraw(s, ctx);
    else if (s.phase === 'cook') endCook(s, ctx);
    else if (s.phase === 'vote') endVote(s, ctx);
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
    const open = s.phase === 'draw' || s.phase === 'cook' || s.phase === 'vote';
    const waiting = open ? activeIds(s).filter((id) => !s.submitted.includes(id)) : [];
    return {
      phase: s.phase,
      round: s.round,
      rounds: DRAW_ROUNDS,
      deadline: s.phase === 'done' ? null : s.deadline,
      drawMs: s.drawMs,
      cookMs: s.cookMs,
      pantry: s.props.map((p, i) => ({ id: i, asset: p.asset, name: p.name, ...(revealed ? { by: p.by } : {}) })),
      waiting,
      orders: s.phase === 'cook' ? s.playerIds.map((id) => s.meals[id] ?? '').filter(Boolean).sort() : null,
      // Who cooked a dish stays hidden until the reveal.
      dishes: showDishes
        ? s.dishes.map((d, i) => ({
            id: i,
            stickers: d.stickers,
            meal: d.meal,
            title: d.title,
            ...(revealed ? { by: d.by } : {}),
          }))
        : [],
      reveal: revealed ? { startAt: s.revealAt, interval: REVEAL_STEP_MS, order: s.order, detail: s.detail } : null,
      scores: revealed ? s.scores : null,
      // The hand, prompts, ranking and points are the player's own business: the screen and others never get them.
      you: me
        ? {
            submitted: open ? s.submitted.includes(me) : true,
            prompt: s.phase === 'draw' ? (s.itemPrompts[me] ?? null) : null,
            meal: s.phase === 'cook' ? (s.meals[me] ?? null) : null,
            hand: s.phase === 'cook' ? (s.hands[me] ?? []) : [],
            need: s.phase === 'vote' ? rankNeed(s.dishes, me) : 0,
            rank: s.ranks[me] ?? [],
            ownDish: s.dishes.findIndex((d) => d.by === me),
            points: revealed ? (s.lines[me] ?? []) : [],
          }
        : null,
    };
  },

  result(s) {
    if (s.phase !== 'done') return null;
    let best = -1;
    s.detail.forEach((d, i) => {
      if (d.pts > 0 && (best < 0 || d.pts > s.detail[best].pts)) best = i;
    });
    const top = best >= 0 ? s.dishes[best] : null;
    return {
      scores: { ...s.scores },
      summary: top ? `Best dish: ${s.names[top.by] ?? 'Someone'}’s ${top.title}` : 'The kitchen stayed quiet',
    };
  },

  bot: {
    act(view, rng) {
      const v = view as CookView;
      const you = v.you;
      if (!you || you.submitted) return null;
      // Now and then a bot only autosaves, so the timeout path runs in the contract test too.
      if (rng.chance(0.15)) {
        if (v.phase === 'draw') return { type: 'draft', strokes: botStrokes(rng), name: (you.prompt ?? 'Mystery item').slice(0, NAME_MAX), round: v.round };
        if (v.phase === 'cook') return { type: 'draft', stickers: botStickers(you.hand, rng), title: 'Draft dish' };
        if (v.phase === 'vote') return { type: 'draft', ranking: pickRanking(v, rng).slice(0, 1) };
      }
      if (!rng.chance(0.7)) return null;
      if (v.phase === 'draw') {
        return { type: 'prop', strokes: botStrokes(rng), name: (you.prompt ?? 'Mystery item').slice(0, NAME_MAX), round: v.round };
      }
      if (v.phase === 'cook') {
        return { type: 'dish', stickers: botStickers(you.hand, rng), title: rng.chance(0.5) ? 'Chef’s surprise' : '' };
      }
      if (v.phase === 'vote') return { type: 'rank', dishes: pickRanking(v, rng) };
      return null;
    },
  },
});
