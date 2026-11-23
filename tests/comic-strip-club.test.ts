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

describe('comic-strip-club drafts (autosave)', () => {
  const draw = (w: number) => [{ c: '#14101f', w, p: [10, 10, 300, 300] }];

  function start(n = 4) {
    const f = fakeCtx();
    const s = game.setup(f.ctx, roster(n), game.defaultSettings);
    f.setState(s);
    return { s, f };
  }
  const submitAll = (s: CscState, f: ReturnType<typeof fakeCtx>, except: string[], act: (p: string, i: number) => Parameters<typeof game.onAction>[3]) =>
    ids(s.playerIds.length).forEach((p, i) => !except.includes(p) && game.onAction(s, f.ctx, p, act(p, i)));

  it('a premise draft is submitted when the timer runs out; no draft falls back to a random premise', () => {
    const { s, f } = start();
    game.onAction(s, f.ctx, 'p0', { type: 'draft', text: 'half a prem' });
    game.onAction(s, f.ctx, 'p0', { type: 'draft', text: 'half a premise' }); // latest wins
    expect(s.inbox).toEqual({}); // a draft is never "done"
    submitAll(s, f, ['p0', 'p1'], (_p, i) => ({ type: 'prompt', text: `premise ${i}` }));
    f.fire('round');
    expect(s.round).toBe(1);
    expect(s.chains[0]).toMatchObject({ prompt: 'half a premise', auto: false });
    expect(s.chains[1].auto).toBe(true);
    expect(PREMISES).toContain(s.chains[1].prompt);
  });

  it('a panel draft is submitted when the timer runs out; no draft stays a blank panel', () => {
    const { s, f } = start();
    submitAll(s, f, [], (_p, i) => ({ type: 'prompt', text: `premise ${i}` }));
    expect(s.phase).toBe('draw');
    game.onAction(s, f.ctx, 'p0', { type: 'draft', panel: 1, strokes: draw(8) });
    expect(s.phase).toBe('draw');
    expect(s.inbox).toEqual({});
    f.fire('round');
    // round 1: player p works chain (p - 1) mod n
    expect(s.chains[chainFor(4, 1, 0)].panels[0].by).toBe('p0');
    expect(s.chains[chainFor(4, 1, 0)].panels[0].asset).not.toBeNull();
    expect(s.chains[chainFor(4, 1, 1)].panels[0].asset).toBeNull();
    expect(s.drafts).toEqual({});
  });

  it('is ignored after the player submitted, from an earlier round, in the wrong phase and when empty', () => {
    const { s, f } = start();
    game.onAction(s, f.ctx, 'p0', { type: 'draft', panel: 1, strokes: draw(8) }); // wrong phase
    game.onAction(s, f.ctx, 'p0', { type: 'draft', text: '   '.trim() || undefined });
    expect(s.drafts).toEqual({});
    game.onAction(s, f.ctx, 'p0', { type: 'prompt', text: 'real one' });
    game.onAction(s, f.ctx, 'p0', { type: 'draft', text: 'late draft' }); // after submit
    expect(s.drafts).toEqual({});
    submitAll(s, f, ['p0'], (_p, i) => ({ type: 'prompt', text: `premise ${i}` }));
    expect(s.chains[0].prompt).toBe('real one');

    // round 1 -> round 2: a draft for panel 1 arriving in round 2 is dropped; drafts reset each round
    game.onAction(s, f.ctx, 'p1', { type: 'draft', panel: 1, strokes: draw(9) });
    submitAll(s, f, [], (_p, i) => ({ type: 'panel', panel: 1, strokes: draw(10 + i) }));
    expect(s.round).toBe(2);
    expect(s.drafts).toEqual({});
    game.onAction(s, f.ctx, 'p1', { type: 'draft', panel: 1, strokes: draw(11) });
    game.onAction(s, f.ctx, 'p2', { type: 'draft', panel: 2, strokes: [] });
    expect(s.drafts).toEqual({});
    // a draft sent after the real panel does not replace it
    game.onAction(s, f.ctx, 'p3', { type: 'panel', panel: 2, strokes: draw(12) });
    const mine = s.inbox.p3;
    game.onAction(s, f.ctx, 'p3', { type: 'draft', panel: 2, strokes: draw(13) });
    expect(s.drafts).toEqual({});
    expect(s.inbox.p3).toBe(mine);
  });

  it('a leaver’s draft is not lost when the round ends early', () => {
    const { s, f } = start();
    game.onAction(s, f.ctx, 'p2', { type: 'draft', text: 'my last words' });
    submitAll(s, f, ['p2'], (_p, i) => ({ type: 'prompt', text: `premise ${i}` }));
    game.onPlayerLeave!(s, f.ctx, 'p2');
    expect(s.chains[2].prompt).toBe('my last words');
  });

  it('drafts never appear in any view, and draft limits match the submit limits', () => {
    const { s, f } = start();
    game.onAction(s, f.ctx, 'p0', { type: 'draft', text: 'SECRET DRAFT TEXT' });
    const viewers = [...ids(4).map((id) => ({ kind: 'player' as const, id })), { kind: 'screen' as const }];
    for (const v of viewers) expect(JSON.stringify(game.view(s, v as never))).not.toContain('SECRET DRAFT TEXT');
    const ok = (a: unknown) => game.actionSchema.safeParse(a).success;
    expect(ok({ type: 'draft', text: 'x'.repeat(121) })).toBe(false);
    expect(ok({ type: 'draft', panel: 1, strokes: [{ c: 'red', w: 6, p: [1, 1, 2, 2] }] })).toBe(false);
    expect(ok({ type: 'draft', text: 'fine' })).toBe(true);
  });
});

describe('comic-strip-club points reasons', () => {
  it('each player is told where their points came from, only their own, only from the tally', () => {
    const { s, f } = playToVote(4);
    expect((game.view(s, { kind: 'player', id: 'p0' } as never) as CscView).you?.earned).toBeNull();
    for (const p of ['p0', 'p2', 'p3']) game.onAction(s, f.ctx, p, { type: 'vote', strip: 'p1' });
    game.onAction(s, f.ctx, 'p1', { type: 'vote', strip: 'p0' });
    expect(s.phase).toBe('tally');
    const v = (id: string) => (game.view(s, { kind: 'player', id } as never) as CscView).you!.earned!;
    // p1 wrote strip p1 (3 votes) and drew a panel on strip p0 (1 vote)
    expect(v('p1')).toEqual([
      { pts: 100, why: '1 vote for "premise 0" (you drew panel 1)' },
      { pts: 300, why: '3 votes for "premise 1" (you wrote the premise)' },
    ]);
    for (const id of ids(4)) expect(v(id).reduce((t, l) => t + l.pts, 0)).toBe(s.scores[id]);
    expect(JSON.stringify(game.view(s, { kind: 'screen' } as never))).not.toContain('earned');
  });

  it('a blank panel or an auto-filled premise earns nothing', () => {
    const { s, f } = playToVote(4);
    s.chains[1].panels[0].asset = null;
    const blankBy = s.chains[1].panels[0].by;
    for (const p of ['p0', 'p2', 'p3']) game.onAction(s, f.ctx, p, { type: 'vote', strip: 'p1' });
    game.onAction(s, f.ctx, 'p1', { type: 'vote', strip: 'p0' });
    const lines = (game.view(s, { kind: 'player', id: blankBy } as never) as CscView).you!.earned!;
    expect(lines.some((l) => l.why.includes('"premise 1"'))).toBe(false);
  });
});
