import { describe, expect, it } from 'vitest';
import type { GameCtx } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { simulateGame } from '../src/core/testkit';
import { LANES, PERFECT_PTS, makeChart, maxScore } from '../src/games/cave-rave/chart';
import caveRave, { type CRState } from '../src/games/cave-rave/logic';
import { SAB_COOLDOWN_MS } from '../src/games/cave-rave/rules';

/** A hand-cranked GameCtx: timers are recorded, never fired on their own. */
function fakeCtx(seed = 1) {
  let t = 1_000_000;
  const timers = new Map<string, number>();
  const ctx: GameCtx = {
    rng: new Rng(seed),
    now: () => t,
    setTimer: (k, ms) => void timers.set(k, t + ms),
    clearTimer: (k) => void timers.delete(k),
    timerAt: (k) => timers.get(k) ?? null,
    putAsset: () => 'x',
    getAsset: () => undefined,
    broadcastEphemeral: () => {},
    log: () => {},
  };
  return { ctx, set: (ms: number) => (t = ms), timers };
}

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#ffffff', isBot: false }));
}

/** Runs one round's song to its end and has every duelist submit `score`. */
function playRound(s: CRState, f: ReturnType<typeof fakeCtx>) {
  caveRave.onTimer!(s, f.ctx, 'ready');
  f.set(s.endAt!);
  for (const d of s.duels) {
    for (const id of d.b ? [d.a, d.b] : []) {
      caveRave.onAction(s, f.ctx, id, { type: 'score', duel: d.id, score: 0, hits: 0, misses: s.chart.notes });
    }
  }
}

describe('cave-rave chart', () => {
  it('is deterministic per seed, and the max score is every note perfect', () => {
    for (const seed of [1, 42, 0xdeadbeef]) {
      for (let level = 0; level <= 4; level++) {
        const a = makeChart(seed, level);
        expect(makeChart(seed, level)).toEqual(a);
        expect(maxScore(a)).toBe(a.notes.length * PERFECT_PTS);
        expect(a.notes.length).toBeGreaterThan(20);
        for (const n of a.notes) {
          expect(n.lane).toBeGreaterThanOrEqual(0);
          expect(n.lane).toBeLessThan(LANES);
          expect(n.t).toBeLessThan(a.lengthMs);
        }
        expect(a.notes.map((n) => n.t)).toEqual([...a.notes.map((n) => n.t)].sort((x, y) => x - y));
      }
    }
    expect(makeChart(1, 0).notes).not.toEqual(makeChart(2, 0).notes);
  });

  it('gets faster and denser each bracket round', () => {
    const seed = 7;
    const c0 = makeChart(seed, 0);
    const c4 = makeChart(seed, 4);
    expect(c4.bpm).toBeGreaterThan(c0.bpm);
    expect(c4.notes.length / c4.lengthMs).toBeGreaterThan(c0.notes.length / c0.lengthMs);
  });
});

describe('cave-rave bracket', () => {
  for (const n of [3, 5, 7, 11]) {
    it(`${n} players: byes keep it fair and exactly one champion remains`, () => {
      const report = simulateGame(caveRave, { players: n, seed: n, screen: false });
      const s = report.harness.room.snapshot().game!.state as CRState;
      expect(s.phase).toBe('done');
      expect(s.champion).not.toBeNull();
      expect(s.alive).toEqual([s.champion]);
      expect(new Set(s.out).size).toBe(n - 1);
      expect(s.out).not.toContain(s.champion);
      expect(Object.values(s.byes).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      // Only the champion has the top score.
      const top = Math.max(...Object.values(report.result.scores));
      expect(Object.entries(report.result.scores).filter(([, v]) => v === top).map(([k]) => k)).toEqual([s.champion]);
    });
  }

  it('an odd round pairs everyone but one, who gets the bye', () => {
    const f = fakeCtx();
    const s = caveRave.setup(f.ctx, players(5), {});
    expect(s.duels.filter((d) => d.b).length).toBe(2);
    expect(s.duels.filter((d) => !d.b).length).toBe(1);
    const all = s.duels.flatMap((d) => [d.a, d.b].filter(Boolean));
    expect(new Set(all).size).toBe(5);
  });
});

describe('cave-rave scores', () => {
  it('refuses scores above the max, for the wrong duel, inconsistent or too early', () => {
    const f = fakeCtx();
    const s = caveRave.setup(f.ctx, players(2), {});
    caveRave.onTimer!(s, f.ctx, 'ready');
    const d = s.duels[0];
    const max = s.chart.max;
    const n = s.chart.notes;
    // Too early: the song is still playing.
    caveRave.onAction(s, f.ctx, d.a, { type: 'score', duel: d.id, score: 100, hits: 1, misses: 0 });
    expect(d.subs[d.a]).toBeUndefined();
    f.set(s.endAt!);
    caveRave.onAction(s, f.ctx, d.a, { type: 'score', duel: d.id, score: max + PERFECT_PTS, hits: n + 1, misses: 0 });
    caveRave.onAction(s, f.ctx, d.a, { type: 'score', duel: d.id, score: max + PERFECT_PTS, hits: n, misses: 0 });
    caveRave.onAction(s, f.ctx, d.a, { type: 'score', duel: 'r9d0', score: 100, hits: 1, misses: 0 });
    caveRave.onAction(s, f.ctx, d.a, { type: 'score', duel: d.id, score: 300, hits: 1, misses: 0 });
    // Hits worth less than a "good" each: a padded accuracy for the tie-break.
    caveRave.onAction(s, f.ctx, d.a, { type: 'score', duel: d.id, score: 0, hits: n, misses: 0 });
    expect(d.subs[d.a]).toBeUndefined();
    caveRave.onAction(s, f.ctx, d.a, { type: 'score', duel: d.id, score: max, hits: n, misses: 0 });
    expect(d.subs[d.a]?.score).toBe(max);
    // One score per duel.
    caveRave.onAction(s, f.ctx, d.a, { type: 'score', duel: d.id, score: 0, hits: 0, misses: n });
    expect(d.subs[d.a]?.score).toBe(max);
  });

  it('a missing score counts as zero at the deadline', () => {
    const f = fakeCtx();
    const s = caveRave.setup(f.ctx, players(2), {});
    caveRave.onTimer!(s, f.ctx, 'ready');
    const d = s.duels[0];
    f.set(s.endAt!);
    caveRave.onAction(s, f.ctx, d.b!, { type: 'score', duel: d.id, score: 100, hits: 1, misses: 0 });
    caveRave.onTimer!(s, f.ctx, 'deadline');
    expect(s.phase).toBe('reveal');
    expect(d.winner).toBe(d.b);
  });
});

describe('cave-rave sabotage', () => {
  it('only eliminated players sabotage, on a cooldown, and only during the song', () => {
    const f = fakeCtx(3);
    const s = caveRave.setup(f.ctx, players(3), {});
    const r1 = s.duels.find((d) => d.b)!;
    const bye = s.duels.find((d) => !d.b)!.a;

    // Round 1: nobody is out yet, so nobody can sabotage (the bye player included).
    caveRave.onTimer!(s, f.ctx, 'ready');
    f.set(s.startAt! + 500);
    caveRave.onAction(s, f.ctx, bye, { type: 'sabotage', target: r1.a, effect: 'fog' });
    caveRave.onAction(s, f.ctx, r1.b!, { type: 'sabotage', target: r1.a, effect: 'fog' });
    expect(s.sabs).toEqual([]);
    f.set(s.endAt!);
    caveRave.onAction(s, f.ctx, r1.a, { type: 'score', duel: r1.id, score: 100, hits: 1, misses: 0 });
    caveRave.onAction(s, f.ctx, r1.b!, { type: 'score', duel: r1.id, score: 0, hits: 0, misses: 1 });
    expect(s.phase).toBe('reveal');
    const loser = r1.b!;
    expect(s.out).toEqual([loser]);

    caveRave.onTimer!(s, f.ctx, 'next');
    expect(s.round).toBe(2);
    const final = s.duels[0];
    expect([final.a, final.b].sort()).toEqual([r1.a, bye].sort());
    caveRave.onTimer!(s, f.ctx, 'ready');

    // Before the first beat: refused.
    caveRave.onAction(s, f.ctx, loser, { type: 'sabotage', target: final.a, effect: 'fog' });
    expect(s.sabs).toHaveLength(0);
    f.set(s.startAt! + 1000);
    // A duelist can't sabotage, and nobody can target a non-duelist.
    caveRave.onAction(s, f.ctx, final.a, { type: 'sabotage', target: final.b!, effect: 'fog' });
    caveRave.onAction(s, f.ctx, loser, { type: 'sabotage', target: loser, effect: 'fog' });
    expect(s.sabs).toHaveLength(0);
    caveRave.onAction(s, f.ctx, loser, { type: 'sabotage', target: final.a, effect: 'fog' });
    expect(s.sabs).toHaveLength(1);
    expect(s.sabs[0]).toMatchObject({ by: loser, target: final.a, effect: 'fog', at: s.startAt! + 1000 });
    // Cooldown.
    f.set(s.startAt! + 1000 + SAB_COOLDOWN_MS - 1);
    caveRave.onAction(s, f.ctx, loser, { type: 'sabotage', target: final.b!, effect: 'mirror' });
    expect(s.sabs).toHaveLength(1);
    f.set(s.startAt! + 1000 + SAB_COOLDOWN_MS);
    caveRave.onAction(s, f.ctx, loser, { type: 'sabotage', target: final.b!, effect: 'mirror' });
    expect(s.sabs).toHaveLength(2);
    // The target's view lists it with server timestamps; the opponent's doesn't.
    const tv = caveRave.view(s, { kind: 'player', id: final.b! }) as { you: { effects: unknown[] } };
    expect(tv.you.effects).toEqual([s.sabs[1]]);
    const ov = caveRave.view(s, { kind: 'player', id: final.a }) as { you: { effects: unknown[] } };
    expect(ov.you.effects).toEqual([s.sabs[0]]);
  });

  it('plays through to one champion when driven by hand', () => {
    const f = fakeCtx(9);
    const s = caveRave.setup(f.ctx, players(6), {});
    for (let i = 0; i < 10 && s.phase !== 'done'; i++) {
      playRound(s, f);
      caveRave.onTimer!(s, f.ctx, 'next');
    }
    expect(s.phase).toBe('done');
    expect(caveRave.result(s)).not.toBeNull();
    expect(s.out).toHaveLength(5);
  });
});
