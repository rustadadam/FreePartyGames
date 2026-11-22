// Comic Strip Club invariants: chain rotation, what each panel's view may show, vote rules, scoring.
import { describe, expect, it } from 'vitest';
import game, { chainFor, type CscState, type CscView } from '../src/games/comic-strip-club/logic';
import { PREMISES } from '../src/games/comic-strip-club/content';
import { contentId } from '../src/core/hash';
import { Rng } from '../src/core/rng';
import type { GameCtx } from '../src/core/game';
import { findLeaks, recordViews, type ViewRecord } from '../src/core/testkit';

function fakeCtx(seed = 5) {
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
    broadcastEphemeral() {},
    log() {},
  };
  return { ctx, timers, fire: (key: string) => game.onTimer!(state(), ctx, key), setState: (s: CscState) => (cur = s) };
  function state() {
    return cur;
  }
}
let cur: CscState;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const roster = (n: number) => ids(n).map((id) => ({ id, name: id.toUpperCase(), color: '#ffffff', isBot: false }));
const scribble = [{ c: '#14101f', w: 6, p: [10, 10, 200, 200] }];

/** Plays a whole game by hand up to the vote, every player submitting a distinct drawing. */
function playToVote(n: number) {
  const f = fakeCtx();
  const s = game.setup(f.ctx, roster(n), game.defaultSettings);
  f.setState(s);
  ids(n).forEach((p, i) => game.onAction(s, f.ctx, p, { type: 'prompt', text: `premise ${i}` }));
  for (let panel = 1; panel <= 3; panel++) {
    ids(n).forEach((p, i) =>
      game.onAction(s, f.ctx, p, { type: 'panel', panel, strokes: [{ ...scribble[0], w: 6 + i + panel * 10 }] }),
    );
  }
  expect(s.phase).toBe('reveal');
  f.fire('reveal');
  expect(s.phase).toBe('vote');
  return { s, f };
}

describe('comic-strip-club chain rotation', () => {
  it('no player works on the same chain in consecutive rounds; no repeats at all for 4+ players', () => {
    for (let n = 3; n <= 20; n++) {
      for (let p = 0; p < n; p++) {
        const seq = [0, 1, 2, 3].map((r) => chainFor(n, r, p));
        for (let r = 1; r < seq.length; r++) expect(seq[r], `n=${n} p=${p}`).not.toBe(seq[r - 1]);
        if (n >= 4) expect(new Set(seq).size, `n=${n} p=${p}`).toBe(4);
      }
    }
  });

  it('holds in a real game: contributors per chain', () => {
    for (const n of [3, 4, 8, 20]) {
      const { s } = playToVote(n);
      for (const chain of s.chains) {
        const who = [chain.author, ...chain.panels.map((p) => p.by)];
        expect(chain.panels).toHaveLength(3);
        // consecutive items of a chain never come from the same player
        for (let i = 1; i < who.length; i++) expect(who[i]).not.toBe(who[i - 1]);
        if (n >= 4) expect(new Set(who).size).toBe(4);
        // 3 players: the author draws panel 3 of their own strip (documented), never twice in a row
        else expect(who[3]).toBe(chain.author);
      }
    }
  });
});

describe('comic-strip-club panel views', () => {
  it('a panel sees only the previous item of its chain', () => {
    const { records } = recordViews<CscState>(game, { players: 5, seed: 4, screen: true });
    const drawViews = records.filter((r: ViewRecord<CscState>) => r.state.phase === 'draw' && r.viewer.kind === 'player');
    expect(drawViews.length).toBeGreaterThan(0);
    for (const r of drawViews) {
      const v = r.view as CscView;
      const s = r.state;
      const chain = s.chains[chainFor(s.playerIds.length, s.round, s.playerIds.indexOf(r.viewerKey))];
      if (s.round === 1) expect(v.you?.source).toEqual({ kind: 'prompt', text: chain.prompt });
      else expect(v.you?.source).toEqual({ kind: 'panel', asset: chain.panels[s.round - 2].asset });
      expect(v.strips).toBeNull();
    }
    // ...and nothing from any other chain leaks into it.
    const leaks = findLeaks(drawViews, (r) => {
      const s = r.state;
      const mine = s.chains[chainFor(s.playerIds.length, s.round, s.playerIds.indexOf(r.viewerKey))];
      const seen = s.round === 1 ? mine.prompt : mine.panels[s.round - 2].asset;
      const others = s.chains.filter((c) => c !== mine);
      const secrets = others.flatMap((c) => [c.prompt, ...c.panels.map((p) => p.asset ?? '')]).filter((x) => x && x !== seen);
      return { exact: secrets };
    });
    expect(leaks).toEqual([]);
  });

  it('the screen never sees prompts or drawings while they are being made', () => {
    const { records } = recordViews<CscState>(game, { players: 4, seed: 2, screen: true });
    for (const r of records.filter((x) => x.viewerKey === 'screen' && (x.state.phase === 'prompt' || x.state.phase === 'draw'))) {
      expect((r.view as CscView).strips).toBeNull();
      expect((r.view as CscView).you).toBeNull();
    }
  });
});

describe('comic-strip-club voting and scoring', () => {
  it('rejects a vote for your own prompt strip and for unknown strips; the first valid vote sticks', () => {
    const { s, f } = playToVote(4);
    game.onAction(s, f.ctx, 'p0', { type: 'vote', strip: 'p0' });
    game.onAction(s, f.ctx, 'p0', { type: 'vote', strip: 'nobody' });
    expect(s.votes).toEqual({});
    game.onAction(s, f.ctx, 'p0', { type: 'vote', strip: 'p1' });
    game.onAction(s, f.ctx, 'p0', { type: 'vote', strip: 'p2' });
    expect(s.votes).toEqual({ p0: 'p1' });
  });

  it('with 4 players you can vote for a strip you only drew on', () => {
    const { s, f } = playToVote(4);
    // p0 drew a panel on every chain, yet has 3 legal options
    game.onAction(s, f.ctx, 'p0', { type: 'vote', strip: 'p3' });
    expect(s.votes.p0).toBe('p3');
  });

  it('pays every contributor of a strip per vote, and not blank panels', () => {
    const { s, f } = playToVote(4);
    for (const p of ['p0', 'p2', 'p3']) game.onAction(s, f.ctx, p, { type: 'vote', strip: 'p1' });
    game.onAction(s, f.ctx, 'p1', { type: 'vote', strip: 'p0' });
    expect(s.phase).toBe('tally');
    // strip p1 got 3 votes: all four contributors earn 300 from it; strip p0 got 1 vote: 100 each. All 4 players contributed to both.
    expect(Object.values(s.scores)).toEqual([400, 400, 400, 400]);

    // blank panel earns nothing
    const g = playToVote(4);
    g.s.chains[1].panels[0].asset = null;
    const blankBy = g.s.chains[1].panels[0].by;
    for (const p of ['p0', 'p2', 'p3']) game.onAction(g.s, g.f.ctx, p, { type: 'vote', strip: 'p1' });
    game.onAction(g.s, g.f.ctx, 'p1', { type: 'vote', strip: 'p0' });
    expect(g.s.scores[blankBy]).toBe(100);
  });
});

describe('comic-strip-club content', () => {
  it('has at least 60 distinct premises that fit the prompt limit', () => {
    expect(new Set(PREMISES).size).toBeGreaterThanOrEqual(60);
    for (const p of PREMISES) expect(p.length).toBeLessThanOrEqual(120);
  });
});
