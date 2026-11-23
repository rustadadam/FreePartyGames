// Cracked Cookbook invariants: stickers come only from the dealt hand, the cook phase is props
// only, dishes carry a capped title, players rank their top three (never their own dish), points
// follow placements, drafts are handed in at timeout, and dish authors stay hidden until the reveal.
import { describe, expect, it } from 'vitest';
import type { GameCtx } from '../src/core/game';
import { contentId } from '../src/core/hash';
import { Rng } from '../src/core/rng';
import { recordViews } from '../src/core/testkit';
import game, { cleanRanking, tally, type CookState, type CookView, type Dish, type Prop } from '../src/games/cracked-cookbook/logic';
import { MEAL_PROMPTS } from '../src/games/cracked-cookbook/content';
import { HAND_SIZE, PROP_PTS, RANK_PTS, TITLE_MAX } from '../src/games/cracked-cookbook/rules';

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
      title: '',
      stickers: [st(hand[0]), st(outside[0] ?? 999), st(own), st(999), st(hand[1])],
    });
    const kept = s.subs.a.stickers.map((x) => x.p);
    expect(kept).toEqual([hand[0], hand[1]]);
    for (const p of kept) expect(s.hands.a).toContain(p);
  });

  it('accepts at most 12 stickers and rejects bad shapes', () => {
    const st = { p: 0, x: 1, y: 1, s: 1, r: 0 };
    const dish = (o: object) => game.actionSchema.safeParse({ type: 'dish', title: '', stickers: [], ...o }).success;
    expect(dish({ stickers: Array(12).fill(st) })).toBe(true);
    expect(dish({ stickers: Array(13).fill(st) })).toBe(false);
    expect(dish({ stickers: [{ ...st, s: 9 }] })).toBe(false);
    expect(dish({ stickers: [{ ...st, extra: 1 }] })).toBe(false);
  });

  it('has at least 40 meal twists', () => {
    expect(MEAL_PROMPTS.length).toBeGreaterThanOrEqual(40);
  });
});

describe('cracked cookbook: the cook phase is props only', () => {
  it('rejects strokes in a dish and stores no drawing', () => {
    expect(game.actionSchema.safeParse({ type: 'dish', strokes, stickers: [], title: '' }).success).toBe(false);
    const { ctx, s } = toCook(4);
    game.onAction(s, ctx, 'a', { type: 'dish', stickers: [], title: 'x' });
    expect(Object.keys(s.subs.a).sort()).toEqual(['stickers', 'title']);
  });

  it('a dish with no props never reaches the vote', () => {
    const { ctx, s } = toCook(4);
    for (const p of players) game.onAction(s, ctx, p.id, { type: 'dish', stickers: [], title: 'Empty' });
    expect(s.dishes).toEqual([]);
    expect(s.phase).toBe('reveal');
  });
});

describe('cracked cookbook: dish titles', () => {
  const place = (s: CookState, id: string) => [{ p: s.hands[id][0], x: 500, y: 500, s: 1, r: 0 }];

  it('stores a cleaned, capped title and falls back to the meal prompt', () => {
    const { ctx, s } = toCook(4);
    const long = `  Dragon​   pancakes ${'z'.repeat(80)}`;
    game.onAction(s, ctx, 'a', { type: 'dish', stickers: place(s, 'a'), title: long });
    game.onAction(s, ctx, 'b', { type: 'dish', stickers: place(s, 'b'), title: '   ' });
    expect(s.subs.a.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(s.subs.a.title.startsWith('Dragon pancakes')).toBe(true);
    game.onAction(s, ctx, 'c', { type: 'dish', stickers: place(s, 'c'), title: 'C dish' });
    game.onAction(s, ctx, 'd', { type: 'dish', stickers: place(s, 'd'), title: 'D dish' });
    expect(s.phase).toBe('vote');
    const b = s.dishes.find((d) => d.by === 'b')!;
    expect(b.title).toBe(s.meals.b);
    expect(b.title).toBe(b.meal);
    const v = game.view(s, { kind: 'player', id: 'a' }) as CookView;
    expect(v.dishes.map((d) => d.title).sort()).toEqual([s.meals.b, 'C dish', 'D dish', s.subs.a.title].sort());
  });

  it('rejects titles over the schema limit', () => {
    expect(game.actionSchema.safeParse({ type: 'dish', stickers: [], title: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('cracked cookbook: scoring', () => {
  const props: Prop[] = [
    { asset: 'x0', name: 'syrup', by: 'b' }, // 0
    { asset: 'x1', name: 'p1', by: 'c' }, // 1
    { asset: 'x2', name: 'p2', by: 'a' }, // 2: a's own
    { asset: 'x3', name: 'p3', by: 'b' }, // 3
  ];
  const st = (p: number) => ({ p, x: 1, y: 1, s: 1, r: 0 });
  const dishes: Dish[] = [
    { by: 'a', meal: 'Lunch', title: 'Big Lunch', stickers: [st(0), st(3), st(1), st(2)] }, // b twice, c, a own
    { by: 'd', meal: 'Dessert', title: 'Sweet', stickers: [st(2)] }, // a's prop
  ];
  const names = { a: 'Ana', b: 'Bo', c: 'Cy', d: 'Di' };

  it('pays the creator 300 / 200 / 100 per placement and each distinct prop artist 100 per placement', () => {
    // b: dish0 first. c: dish0 second. d: dish0 third.
    const { scores, detail } = tally(dishes, props, { b: [0], c: [0], d: [0] }, names);
    expect(detail[0]).toEqual({ places: [3, 0, 0], pts: 3 * RANK_PTS[0], artists: ['b', 'c'] });
    expect(scores.a).toBe(3 * RANK_PTS[0]);
    expect(scores.b).toBe(3 * PROP_PTS); // two b props on one dish still pay once per placement
    expect(scores.c).toBe(3 * PROP_PTS);
    expect(scores.d ?? 0).toBe(0);
  });

  it('counts each place separately', () => {
    // c ranks dish1 first then dish0; b ranks dish0 first then dish1; a ranks dish1 only.
    const { scores, detail } = tally(dishes, props, { c: [1, 0], b: [0, 1], a: [1] }, names);
    expect(detail[0].places).toEqual([1, 1, 0]);
    expect(detail[0].pts).toBe(RANK_PTS[0] + RANK_PTS[1]);
    expect(detail[1].places).toEqual([2, 1, 0]);
    expect(scores.d).toBe(2 * RANK_PTS[0] + RANK_PTS[1]);
    // a: creator of dish0 (300 + 200) and the artist behind dish1 (3 placements).
    expect(scores.a).toBe(RANK_PTS[0] + RANK_PTS[1] + 3 * PROP_PTS);
    expect(scores.b).toBe(2 * PROP_PTS); // dish0 placed twice
    expect(scores.c).toBe(2 * PROP_PTS);
  });

  it('gives a third place 100', () => {
    const three: Dish[] = [0, 1, 2, 3].map((i) => ({ by: 'abcd'[i], meal: 'm', title: `T${i}`, stickers: [] }));
    const { scores } = tally(three, [], { x: [3, 2, 1] }, {});
    expect(scores).toEqual({ d: 300, c: 200, b: 100 });
  });

  it('ignores self rankings, repeats, missing dishes and anything past third', () => {
    expect(cleanRanking([0, 1, 1, 7, 0], dishes, 'a')).toEqual([1]);
    const { scores, detail } = tally(dishes, props, { a: [0], d: [1], c: [7] }, names);
    expect(scores).toEqual({});
    expect(detail.map((d) => d.pts)).toEqual([0, 0]);
    const five: Dish[] = [0, 1, 2, 3, 4].map((i) => ({ by: 'abcde'[i], meal: 'm', title: 't', stickers: [] }));
    expect(cleanRanking([0, 1, 2, 3, 4], five, 'z')).toEqual([0, 1, 2]);
  });

  it('says where each player’s points came from', () => {
    const ranks = { b: [0], c: [0, 1], d: [0, 1] };
    const { lines, scores } = tally(dishes, props, ranks, names);
    expect(lines.a).toEqual([
      { pts: 3 * RANK_PTS[0], why: '1st place from 3 players for Big Lunch' },
      { pts: PROP_PTS, why: 'your p2 was in Di’s dish “Sweet”' },
    ]);
    expect(lines.b).toEqual([{ pts: 3 * PROP_PTS, why: 'your syrup and p3 were in Ana’s dish “Big Lunch” (ranked 3 times)' }]);
    expect(lines.d).toEqual([{ pts: RANK_PTS[1], why: '2nd place for Sweet' }]);
    for (const id of Object.keys(scores)) expect(lines[id].reduce((n, l) => n + l.pts, 0)).toBe(scores[id]);
  });
});

describe('cracked cookbook: ranking', () => {
  function toRank(count = 5) {
    const { ctx, s } = toCook(count);
    for (const p of players.slice(0, count)) {
      game.onAction(s, ctx, p.id, { type: 'dish', stickers: [{ p: s.hands[p.id][0], x: 500, y: 500, s: 1, r: 0 }], title: `${p.id} dish` });
    }
    expect(s.phase).toBe('vote');
    return { ctx, s };
  }
  const idx = (s: CookState, id: string) => s.dishes.findIndex((d) => d.by === id);
  const rank = (s: CookState, ctx: GameCtx, id: string, dishes: number[]) => game.onAction(s, ctx, id, { type: 'rank', dishes });

  it('needs min(3, rankable dishes) and rejects own dish, repeats and short rankings', () => {
    const { ctx, s } = toRank(5);
    const others = s.dishes.map((_, i) => i).filter((i) => i !== idx(s, 'a'));
    expect((game.view(s, { kind: 'player', id: 'a' }) as CookView).you!.need).toBe(3);
    rank(s, ctx, 'a', [idx(s, 'a'), others[0], others[1]]);
    expect(s.ranks.a).toBeUndefined();
    rank(s, ctx, 'a', [others[0], others[0], others[1]]);
    expect(s.ranks.a).toBeUndefined();
    rank(s, ctx, 'a', [others[0], others[1]]);
    expect(s.ranks.a).toBeUndefined();
    rank(s, ctx, 'a', [others[2], others[0], others[1]]);
    expect(s.ranks.a).toEqual([others[2], others[0], others[1]]);
    expect(s.submitted).toContain('a');
  });

  it('accepts at most three (schema) and locks after submitting', () => {
    expect(game.actionSchema.safeParse({ type: 'rank', dishes: [0, 1, 2, 3] }).success).toBe(false);
    expect(game.actionSchema.safeParse({ type: 'rank', dishes: [-1] }).success).toBe(false);
    const { ctx, s } = toRank(5);
    const others = s.dishes.map((_, i) => i).filter((i) => i !== idx(s, 'b'));
    rank(s, ctx, 'b', others.slice(0, 3));
    rank(s, ctx, 'b', others.slice(1, 4));
    expect(s.ranks.b).toEqual(others.slice(0, 3));
  });

  it('asks for fewer when fewer dishes are rankable', () => {
    const { ctx, s } = toCook(3); // 3 dishes: each player may rank 2
    for (const p of players.slice(0, 3)) game.onAction(s, ctx, p.id, { type: 'dish', stickers: [{ p: s.hands[p.id][0], x: 1, y: 1, s: 1, r: 0 }], title: '' });
    expect((game.view(s, { kind: 'player', id: 'a' }) as CookView).you!.need).toBe(2);
    const others = s.dishes.map((_, i) => i).filter((i) => i !== idx(s, 'a'));
    rank(s, ctx, 'a', [others[0]]);
    expect(s.ranks.a).toBeUndefined();
    rank(s, ctx, 'a', others);
    expect(s.ranks.a).toEqual(others);
  });

  it('ends early when everyone ranks, then scores by placement', () => {
    const { ctx, s } = toRank(4);
    for (const p of players) {
      const others = s.dishes.map((_, i) => i).filter((i) => i !== idx(s, p.id));
      rank(s, ctx, p.id, others);
    }
    expect(s.phase).toBe('reveal');
    const total = Object.values(s.scores).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    // Every ranker gives out 300 + 200 + 100 to creators.
    expect(s.detail.reduce((a, d) => a + d.pts, 0)).toBe(4 * (RANK_PTS[0] + RANK_PTS[1] + RANK_PTS[2]));
  });

  it('shows each player only their own points, in the reveal', () => {
    const { ctx, s } = toRank(4);
    for (const p of players) rank(s, ctx, p.id, s.dishes.map((_, i) => i).filter((i) => i !== idx(s, p.id)));
    const a = game.view(s, { kind: 'player', id: 'a' }) as CookView;
    const scr = game.view(s, { kind: 'screen' }) as CookView;
    expect(a.you!.points.length).toBeGreaterThan(0);
    expect(a.you!.points.reduce((n, l) => n + l.pts, 0)).toBe(s.scores.a);
    expect(scr.you).toBeNull();
    expect(JSON.stringify(scr)).not.toContain('"points"');
    expect(JSON.stringify(game.view(s, { kind: 'player', id: 'b' }))).not.toContain(s.lines.a[0].why);
    expect(JSON.stringify(a)).not.toContain(JSON.stringify(s.lines.b));
  });

  it('hides who cooked a dish, and every ranking, until the reveal', () => {
    const { ctx, s } = toRank(4);
    const v = game.view(s, { kind: 'screen' }) as CookView;
    expect(v.dishes.length).toBe(4);
    for (const d of v.dishes) expect('by' in d).toBe(false);
    rank(s, ctx, 'b', s.dishes.map((_, i) => i).filter((i) => i !== idx(s, 'b')));
    const pv = game.view(s, { kind: 'player', id: 'c' }) as CookView;
    expect(pv.you!.rank).toEqual([]);
    expect(JSON.stringify(pv)).not.toContain('"ranks"');
    for (const p of players) rank(s, ctx, p.id, s.dishes.map((_, i) => i).filter((i) => i !== idx(s, p.id)));
    expect(s.phase).toBe('reveal');
    expect(((game.view(s, { kind: 'screen' }) as CookView).dishes[0] as { by?: string }).by).toBeTruthy();
  });
});

describe('cracked cookbook: drafts', () => {
  const key = (id: string) => ({ kind: 'player' as const, id });

  it('submits the latest pantry draft at timeout, never counts it as done, never shows it', () => {
    const { ctx } = fakeCtx();
    const s = game.setup(ctx, players, game.defaultSettings);
    game.onAction(s, ctx, 'a', { type: 'draft', strokes: [{ c: '#111111', w: 5, p: [1, 1, 2, 2] }], name: 'first', round: 1 });
    game.onAction(s, ctx, 'a', { type: 'draft', strokes, name: 'latest', round: 1 });
    expect(s.submitted).toEqual([]);
    expect(s.props).toEqual([]);
    for (const p of players) expect(JSON.stringify(game.view(s, key(p.id)))).not.toContain('latest');
    expect(JSON.stringify(game.view(s, { kind: 'screen' }))).not.toContain('latest');
    game.onTimer!(s, ctx, 'phase');
    expect(s.props.map((p) => [p.name, p.by])).toEqual([['latest', 'a']]);
    expect(s.round).toBe(2);
    expect(s.drafts.props).toEqual({});
  });

  it('a late round-1 draft cannot land in round 2, and a draft after submitting is ignored', () => {
    const { ctx } = fakeCtx();
    const s = game.setup(ctx, players, game.defaultSettings);
    game.onTimer!(s, ctx, 'phase');
    game.onAction(s, ctx, 'a', { type: 'draft', strokes, name: 'stale', round: 1 });
    expect(s.drafts.props.a).toBeUndefined();
    game.onAction(s, ctx, 'b', { type: 'prop', strokes, name: 'real', round: 2 });
    game.onAction(s, ctx, 'b', { type: 'draft', strokes, name: 'after', round: 2 });
    expect(s.drafts.props.b).toBeUndefined();
    game.onTimer!(s, ctx, 'phase');
    expect(s.props.map((p) => p.name)).toEqual(['real']);
  });

  it('submits a half-built dish and a partial ranking at timeout', () => {
    const { ctx, s } = toCook(4);
    const st = (id: string) => ({ p: s.hands[id][0], x: 500, y: 500, s: 1, r: 0 });
    game.onAction(s, ctx, 'a', { type: 'draft', stickers: [st('a')], title: 'Draft title' });
    game.onAction(s, ctx, 'b', { type: 'draft', stickers: [st('b')], title: '' });
    game.onAction(s, ctx, 'c', { type: 'draft', stickers: [], title: 'nothing on the plate' });
    expect(s.submitted).toEqual([]);
    game.onTimer!(s, ctx, 'phase');
    expect(s.dishes.map((d) => [d.by, d.title]).sort()).toEqual([['a', 'Draft title'], ['b', s.meals.b]].sort());
    expect(s.phase).toBe('vote');

    const own = s.dishes.findIndex((d) => d.by === 'a');
    const other = s.dishes.findIndex((d) => d.by === 'b');
    game.onAction(s, ctx, 'a', { type: 'draft', ranking: [own, other] }); // illegal: skipped at timeout
    game.onAction(s, ctx, 'b', { type: 'draft', ranking: [own] });
    game.onTimer!(s, ctx, 'phase');
    expect(s.ranks).toEqual({ b: [own] });
    expect(s.phase).toBe('reveal');
    expect(s.scores.a).toBe(RANK_PTS[0]);
  });

  it('keeps drafts out of every view, in every phase', () => {
    const { records } = recordViews<CookState>(game, { players: 5, seed: 7, screen: true });
    for (const r of records) expect(r.json).not.toContain('"drafts"');
  });

  it('a draft with a bad shape is rejected by the schema', () => {
    expect(game.actionSchema.safeParse({ type: 'draft', ranking: [1, 2, 3, 4] }).success).toBe(false);
    expect(game.actionSchema.safeParse({ type: 'draft', title: 'x'.repeat(81) }).success).toBe(false);
    expect(game.actionSchema.safeParse({ type: 'draft', whatever: 1 }).success).toBe(false);
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
