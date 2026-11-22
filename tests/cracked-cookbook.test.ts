// Cracked Cookbook invariants: stickers come only from the dealt hand, prop artists are
// paid per vote on dishes that used their props, and nobody votes for their own dish.
import { describe, expect, it } from 'vitest';
import type { GameCtx } from '../src/core/game';
import { contentId } from '../src/core/hash';
import { Rng } from '../src/core/rng';
import { recordViews } from '../src/core/testkit';
import game, { tally, type CookState, type CookView, type Dish, type Prop } from '../src/games/cracked-cookbook/logic';
import { MEAL_PROMPTS } from '../src/games/cracked-cookbook/content';
import { HAND_SIZE, PROP_PTS, VOTE_PTS } from '../src/games/cracked-cookbook/rules';

const strokes = [{ c: '#1a1033', w: 14, p: [100, 100, 400, 400] }];

function fakeCtx(seed = 1) {
  const timers = new Map<string, number>();
  const assets = new Map<string, unknown>();
  let t = 1000;
  const ctx: GameCtx = {
    rng: new Rng(seed),
    now: () => t,
    setTimer: (k, ms) => void timers.set(k, t + ms),
    clearTimer: (k) => void timers.delete(k),
    timerAt: (k) => timers.get(k) ?? null,
    putAsset: (d) => {
      const id = contentId(d);
      assets.set(id, d);
      return id;
    },
    getAsset: (id) => assets.get(id),
    broadcastEphemeral: () => {},
    log: () => {},
  };
  return { ctx, timers };
}

const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), color: '#fff', isBot: false }));

/** Plays both drawing rounds so every player has two props, and returns a state at the cook phase. */
function toCook(count = 4) {
  const { ctx } = fakeCtx();
  const s = game.setup(ctx, players.slice(0, count), game.defaultSettings);
  for (let round = 0; round < 2; round++) {
    for (const p of players.slice(0, count)) game.onAction(s, ctx, p.id, { type: 'prop', strokes, name: `${p.id}${round}` });
  }
  expect(s.phase).toBe('cook');
  return { ctx, s };
}

describe('cracked cookbook: dealt hands', () => {
  it('deals other players’ props, never a cook’s own when the pantry allows', () => {
    const { s } = toCook(4);
    for (const p of players) {
      const hand = s.hands[p.id];
      expect(hand.length).toBe(HAND_SIZE);
      for (const i of hand) expect(s.props[i].by).not.toBe(p.id);
    }
  });

  it('keeps only stickers from the sender’s own hand', () => {
    const { ctx, s } = toCook(4);
    const hand = s.hands.a;
    const outside = s.props.map((_, i) => i).filter((i) => !hand.includes(i));
    const own = s.props.findIndex((p) => p.by === 'a');
    const st = (p: number) => ({ p, x: 500, y: 500, s: 1, r: 0 });
    game.onAction(s, ctx, 'a', {
      type: 'dish',
      strokes: [],
      stickers: [st(hand[0]), st(outside[0] ?? 999), st(own), st(999), st(hand[1])],
    });
    const kept = s.subs.a.stickers.map((x) => x.p);
    expect(kept).toEqual([hand[0], hand[1]]);
    for (const p of kept) expect(s.hands.a).toContain(p);
  });

  it('accepts at most 12 stickers and rejects bad shapes', () => {
    const st = { p: 0, x: 1, y: 1, s: 1, r: 0 };
    expect(game.actionSchema.safeParse({ type: 'dish', strokes: [], stickers: Array(13).fill(st) }).success).toBe(false);
    expect(game.actionSchema.safeParse({ type: 'dish', strokes: [], stickers: [{ ...st, s: 9 }] }).success).toBe(false);
    expect(game.actionSchema.safeParse({ type: 'dish', strokes: [], stickers: [{ ...st, extra: 1 }] }).success).toBe(false);
  });

  it('has at least 40 meal twists', () => {
    expect(MEAL_PROMPTS.length).toBeGreaterThanOrEqual(40);
  });
});

describe('cracked cookbook: scoring', () => {
  const props: Prop[] = [
    { asset: 'x0', name: 'p0', by: 'b' }, // 0
    { asset: 'x1', name: 'p1', by: 'c' }, // 1
    { asset: 'x2', name: 'p2', by: 'a' }, // 2: a's own
    { asset: 'x3', name: 'p3', by: 'b' }, // 3
  ];
  const st = (p: number) => ({ p, x: 1, y: 1, s: 1, r: 0 });
  const dishes: Dish[] = [
    { by: 'a', asset: null, meal: 'Lunch', stickers: [st(0), st(3), st(1), st(2)] }, // b twice, c, a own
    { by: 'd', asset: null, meal: 'Dessert', stickers: [st(2)] }, // a's prop
  ];

  it('pays the creator per vote and each distinct prop artist once per vote', () => {
    const { scores, detail } = tally(dishes, props, { b: 0, c: 0, d: 0 });
    expect(detail[0]).toEqual({ votes: 3, pts: 3 * VOTE_PTS, artists: ['b', 'c'] });
    expect(scores.a).toBe(3 * VOTE_PTS); // creator; using her own prop earns no extra
    expect(scores.b).toBe(3 * PROP_PTS); // two b props on one dish still pay once per vote
    expect(scores.c).toBe(3 * PROP_PTS);
    expect(scores.d ?? 0).toBe(0);
  });

  it('pays artists on any dish that used their prop', () => {
    const { scores } = tally(dishes, props, { a: 1, b: 0, c: 1 });
    expect(scores.d).toBe(2 * VOTE_PTS);
    expect(scores.a).toBe(VOTE_PTS + 2 * PROP_PTS); // creator of dish 0, artist behind dish 1
    expect(scores.b).toBe(PROP_PTS);
    expect(scores.c).toBe(PROP_PTS);
  });

  it('ignores self votes and missing dishes', () => {
    const { scores, detail } = tally(dishes, props, { a: 0, d: 1, c: 7 });
    expect(scores).toEqual({});
    expect(detail.map((d) => d.votes)).toEqual([0, 0]);
  });
});

describe('cracked cookbook: voting', () => {
  function toVote() {
    const { ctx, s } = toCook(4);
    for (const p of players) game.onAction(s, ctx, p.id, { type: 'dish', strokes, stickers: [] });
    expect(s.phase).toBe('vote');
    return { ctx, s };
  }

  it('does not count a vote for your own dish', () => {
    const { ctx, s } = toVote();
    const own = s.dishes.findIndex((d) => d.by === 'a');
    game.onAction(s, ctx, 'a', { type: 'vote', dish: own });
    expect(s.votes.a).toBeUndefined();
    const other = s.dishes.findIndex((d) => d.by !== 'a');
    game.onAction(s, ctx, 'a', { type: 'vote', dish: other });
    expect(s.votes.a).toBe(other);
  });

  it('hides who cooked a dish until the reveal', () => {
    const { ctx, s } = toVote();
    const v = game.view(s, { kind: 'screen' }) as CookView;
    expect(v.dishes.length).toBe(4);
    for (const d of v.dishes) expect('by' in d).toBe(false);
    for (const p of players) game.onAction(s, ctx, p.id, { type: 'vote', dish: s.dishes.findIndex((d) => d.by !== p.id) });
    expect(s.phase).toBe('reveal');
    expect(((game.view(s, { kind: 'screen' }) as CookView).dishes[0] as { by?: string }).by).toBeTruthy();
  });
});

describe('cracked cookbook: views', () => {
  it('keeps hands private and dish authors hidden before the reveal', () => {
    const { records } = recordViews<CookState>(game, { players: 6, seed: 3, screen: true });
    for (const r of records) {
      const v = r.view as CookView;
      if (r.viewerKey === 'screen') expect(v.you).toBeNull();
      else if (v.phase === 'cook') {
        const mine = JSON.stringify(r.state.hands[r.viewerKey]);
        for (const other of r.state.playerIds) {
          if (other === r.viewerKey) continue;
          const theirs = JSON.stringify(r.state.hands[other]);
          if (theirs !== mine) expect(r.json).not.toContain(`"hand":${theirs}`);
        }
      }
      if (v.phase === 'vote') for (const d of v.dishes) expect('by' in d).toBe(false);
    }
  });
});

describe('cracked cookbook: anonymous dishes', () => {
  // Each dish shows its meal in the vote, and a dish never uses its cook's own props: so before
  // the reveal no view may pair a player with a meal, or say who drew a prop.
  for (const seed of [1, 2, 3]) {
    it(`no cook-to-meal or prop-to-artist pairing before the reveal (seed ${seed})`, () => {
      const { records } = recordViews<CookState>(game, { players: 5, seed, screen: true });
      let swapped = 0;
      for (const r of records) {
        const v = r.view as CookView;
        if (v.phase === 'reveal' || v.phase === 'done') continue;
        for (const p of v.pantry) expect(p).not.toHaveProperty('by');
        if (v.phase === 'cook') {
          expect(Array.isArray(v.orders)).toBe(true);
          expect(v.orders).toEqual([...v.orders!].sort());
          for (const other of r.state.playerIds) if (other !== r.viewerKey) expect(r.json).not.toContain(`"${other}":"`);
        }
        if (v.phase === 'vote') {
          // Swapping the cooks of two dishes neither of which is the viewer's changes nothing.
          const others = r.state.dishes.map((d, i) => (d.by === r.viewerKey ? -1 : i)).filter((i) => i >= 0);
          if (others.length < 2) continue;
          const alt: CookState = structuredClone(r.state);
          const [i, j] = others;
          [alt.dishes[i].by, alt.dishes[j].by] = [alt.dishes[j].by, alt.dishes[i].by];
          expect(JSON.stringify(game.view(alt, r.viewer))).toBe(r.json);
          swapped++;
        }
      }
      expect(swapped).toBeGreaterThan(0);
    });
  }
});

describe('cracked cookbook: late drafts', () => {
  it('a round-1 prop arriving in round 2 does not use up the round-2 drawing', () => {
    const { ctx } = fakeCtx();
    const s = game.setup(ctx, players, game.defaultSettings);
    game.onTimer!(s, ctx, 'phase');
    expect(s.round).toBe(2);
    game.onAction(s, ctx, 'a', { type: 'prop', strokes, name: 'late', round: 1 });
    expect(s.submitted).not.toContain('a');
    game.onAction(s, ctx, 'a', { type: 'prop', strokes, name: 'fresh', round: 2 });
    expect(s.props.map((p) => p.name)).toEqual(['fresh']);
  });
});
