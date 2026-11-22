import { describe, expect, it } from 'vitest';
import secondWitness, { type SWState, type SWView } from '../src/games/second-witness/logic';
import { PROMPTS } from '../src/games/second-witness/content';
import { basePoints, normalize } from '../src/games/second-witness/match';
import { MAX_ANSWER_LEN, MAX_OPEN_PROPOSALS, MULTIPLIERS, POINTS, UNIQUE_BONUS } from '../src/games/second-witness/rules';
import { createHarness, findLeaks, recordViews, simulateGame, type RoomHarness } from '../src/core/testkit';

describe('second-witness normalization', () => {
  it('folds case, spacing, punctuation, diacritics, "&", leading articles and plurals', () => {
    const same = [
      ['Temple', 'temples', ' The  Temple! '],
      ['Doctrine & Covenants', 'doctrine and covenants', 'Doctrine and Covenant'],
      ['José', 'jose'],
      ['Ice-cream', 'ice cream', 'Ice  Cream.'],
      ['Cookie', 'cookies'],
      ['Family', 'families'],
      ['Joseph Smith’s', 'Joseph Smiths', "joseph smith's"],
      ['A Liahona', 'liahonas'],
      ['Potato', 'potatoes'],
    ];
    for (const group of same) expect(new Set(group.map(normalize)).size, group.join(' | ')).toBe(1);
  });

  it('keeps different answers apart', () => {
    expect(normalize('Jesus')).not.toBe(normalize('Jesse'));
    expect(normalize('Moses')).toBe(normalize('Mose'));
    expect(normalize('1 Nephi')).not.toBe(normalize('2 Nephi'));
    expect(normalize('The')).toBe('the');
    expect(normalize('!!!')).toBe('');
  });
});

describe('second-witness content pack', () => {
  it('has no duplicate prompts after normalization', () => {
    const keys = PROMPTS.map((p) => normalize(p.text));
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(PROMPTS.length);
  });

  it('is big enough and has sample answers for bots', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(120);
    const withSamples = PROMPTS.filter((p) => p.samples.length > 0);
    expect(withSamples.length).toBeGreaterThanOrEqual(40);
    for (const p of PROMPTS) {
      expect(p.text.trim(), p.id).not.toBe('');
      if (p.samples.length) {
        expect(p.samples.length, p.id).toBeGreaterThanOrEqual(3);
        expect(p.samples.length, p.id).toBeLessThanOrEqual(6);
        expect(new Set(p.samples.map(normalize)).size, p.id).toBe(p.samples.length);
        for (const t of p.samples) expect(t.length <= MAX_ANSWER_LEN && normalize(t) !== '', `${p.id}: ${t}`).toBe(true);
      }
    }
  });
});

describe('second-witness scoring table', () => {
  it('pays 3 / 5 / 1 / 0', () => {
    expect(basePoints(1, 1)).toBe(POINTS.single);
    expect(basePoints(1, 0)).toBe(0);
    expect(basePoints(2, 2)).toBe(POINTS.second);
    expect(basePoints(2, 1)).toBe(POINTS.half);
    expect(basePoints(2, 0)).toBe(0);
    expect(basePoints(0, 0)).toBe(0);
    expect([POINTS.single, POINTS.second, POINTS.half]).toEqual([3, 5, 1]);
    expect(MULTIPLIERS).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

// ---- scenario helpers: real room, humans only, no bots ----

interface Env {
  h: RoomHarness;
  ids: string[];
  st: () => SWState;
}

function setup(n: number, seed = 1): Env {
  const h = createHarness({ seed });
  h.join('Screen', { role: 'screen' });
  const ids = Array.from({ length: n }, (_, i) => h.join(`P${i + 1}`).id);
  expect(h.room.runHostCommand({ type: 'selectGame', gameId: 'second-witness' })).toBeNull();
  expect(h.room.runHostCommand({ type: 'start' })).toBeNull();
  return { h, ids, st: () => h.room.snapshot().game!.state as SWState };
}

const submit = (e: Env, i: number, ...answers: string[]) => e.h.room.runAction(e.ids[i], { type: 'submit', answers });
const act = (e: Env, i: number, action: unknown) => e.h.room.runAction(e.ids[i], action);
const groupOf = (e: Env, text: string) => e.st().groups.find((g) => g.members.some((m) => m.t === text))!.id;

/** Everyone submits (index -> answers), skips the merge phase and returns this round's points. Then moves on. */
function playRound(e: Env, answers: string[][]): number[] {
  expect(e.st().phase).toBe('write');
  answers.forEach((a, i) => submit(e, i, ...a));
  if (e.st().phase === 'merge') e.ids.forEach((_, i) => act(e, i, { type: 'done' }));
  expect(e.st().phase).toBe('reveal');
  const pts = e.ids.map((id) => e.st().roundPts[id]);
  e.h.step();
  return pts;
}

describe('second-witness round scoring', () => {
  it('scores one answer, two answers, half matches and de-duplicated answers (x1 round)', () => {
    const e = setup(8);
    const pts = playRound(e, [
      ['x'], // A: one answer, witnessed by B and H -> 3
      ['x'], // B
      ['y', 'z'], // C: both witnessed -> 5
      ['y', 'z'], // D
      ['w', 'q'], // E: nothing witnessed -> 0
      ['Temple', 'temples'], // F: two answers that normalize the same count as one -> 3 (G matches)
      ['the temple'], // G
      ['x', 'h2'], // H: one of two witnessed -> 1
    ]);
    expect(pts).toEqual([3, 3, 5, 5, 0, 3, 3, 1]);
  });

  it('applies the multipliers x1 x1 x2 x2 x3 x3 to round points, then the Unique thinker bonus once', () => {
    const e = setup(5);
    const total = [0, 0, 0, 0, 0];
    for (let r = 0; r < 6; r++) {
      const m = MULTIPLIERS[r];
      const pts = playRound(e, [
        ['x'], // P1 and P2 always match: 3 each
        ['x'],
        [`u${r}a`, `u${r}b`], // P3: two answers nobody shares, every round
        [`solo${r}`], // P4: one answer nobody shares, every round (never a two-answer zero)
        r < 2 ? [`v${r}a`, `v${r}b`] : ['x'], // P5: two unshared answers twice, then joins the x group
      ]);
      const expected = [3 * m, 3 * m, 0, 0, r < 2 ? 0 : 3 * m];
      expect(pts, `round ${r + 1}`).toEqual(expected);
      expected.forEach((x, i) => (total[i] += x));
    }
    // Final: P3 had two-answer zero rounds 6 times; P4 never; P5 only twice (< 3).
    const s = e.st();
    expect(s.phase).toBe('final');
    expect(s.bonus).toEqual([e.ids[2]]);
    const view = secondWitness.view(s, { kind: 'screen' }) as SWView;
    expect(view.bonus).toEqual([e.ids[2]]);
    e.h.step();
    const result = secondWitness.result(e.st())!;
    expect(result.scores).toEqual(Object.fromEntries(e.ids.map((id, i) => [id, total[i] + (i === 2 ? UNIQUE_BONUS : 0)])));
    expect(result.scores[e.ids[0]]).toBe(36);
    expect(result.scores[e.ids[2]]).toBe(10);
    expect(result.scores[e.ids[3]]).toBe(0);
    expect(result.scores[e.ids[4]]).toBe(30); // 3 x (2 + 2 + 3 + 3)
  });

  it('needs three two-answer zero rounds: one-answer zero rounds do not count', () => {
    const e = setup(4);
    // P1: two unshared answers in rounds 1 and 2, then three one-answer zeros. P2-P4 match each other.
    for (let r = 0; r < 6; r++) {
      playRound(e, [r < 2 ? [`a${r}`, `b${r}`] : [`c${r}`], ['x'], ['x'], ['x']]);
    }
    expect(e.st().twoZero[e.ids[0]]).toBe(2);
    expect(e.st().bonus).toEqual([]);
  });
});

describe('second-witness merge phase', () => {
  /** 5 players, each with a distinct answer: five groups, 3 yes votes needed. */
  function mergeRoom(extra?: (e: Env) => void): Env {
    const e = setup(5);
    submit(e, 0, 'alpha');
    submit(e, 1, 'beta');
    submit(e, 2, 'gamma');
    submit(e, 3, 'delta');
    submit(e, 4, 'epsilon');
    expect(e.st().phase).toBe('merge');
    extra?.(e);
    return e;
  }

  it('sticks a merge only when yes votes exceed half of the players present', () => {
    const e = mergeRoom();
    act(e, 0, { type: 'propose', a: groupOf(e, 'alpha'), b: groupOf(e, 'beta') });
    expect(e.st().proposals).toHaveLength(1);
    const pid = e.st().proposals[0].id;
    act(e, 1, { type: 'vote', proposal: pid, yes: true });
    expect(e.st().groups).toHaveLength(5); // 2 of 5 is not a majority
    act(e, 2, { type: 'vote', proposal: pid, yes: true });
    expect(e.st().groups).toHaveLength(4); // 3 of 5 is
    expect(e.st().proposals).toHaveLength(0);
    expect(e.st().groups.find((g) => g.members.some((m) => m.t === 'alpha'))!.members.map((m) => m.t).sort()).toEqual(['alpha', 'beta']);
  });

  it('counts only players still present when someone leaves mid-vote', () => {
    const e = mergeRoom();
    act(e, 0, { type: 'propose', a: groupOf(e, 'alpha'), b: groupOf(e, 'beta') });
    act(e, 1, { type: 'vote', proposal: e.st().proposals[0].id, yes: true });
    expect(e.st().groups).toHaveLength(5);
    // Two of the five leave: 2 yes of 3 present is a majority.
    expect(e.h.room.runHostCommand({ type: 'kick', playerId: e.ids[3] })).toBeNull();
    expect(e.h.room.runHostCommand({ type: 'kick', playerId: e.ids[4] })).toBeNull();
    expect(e.st().groups).toHaveLength(4);
  });

  it('drops a proposal that can no longer reach a majority and does not allow it again', () => {
    const e = mergeRoom();
    act(e, 0, { type: 'propose', a: groupOf(e, 'alpha'), b: groupOf(e, 'beta') });
    const { id } = e.st().proposals[0];
    for (const i of [1, 2, 3]) act(e, i, { type: 'vote', proposal: id, yes: false });
    expect(e.st().proposals).toHaveLength(0);
    expect(e.st().groups).toHaveLength(5);
    act(e, 4, { type: 'propose', a: groupOf(e, 'alpha'), b: groupOf(e, 'beta') });
    expect(e.st().proposals).toHaveLength(0);
  });

  it('chains merges: A+B then B+C ends as one group', () => {
    const e = mergeRoom();
    const [ga, gb, gc] = ['alpha', 'beta', 'gamma'].map((t) => groupOf(e, t));
    act(e, 0, { type: 'propose', a: ga, b: gb });
    act(e, 0, { type: 'propose', a: gb, b: gc });
    const [p1, p2] = e.st().proposals;
    act(e, 3, { type: 'vote', proposal: p1.id, yes: true });
    act(e, 4, { type: 'vote', proposal: p1.id, yes: true });
    // p2 followed the surviving group id and is still open.
    expect(e.st().groups).toHaveLength(4);
    expect(e.st().proposals).toHaveLength(1);
    act(e, 3, { type: 'vote', proposal: p2.id, yes: true });
    act(e, 4, { type: 'vote', proposal: p2.id, yes: true });
    expect(e.st().groups).toHaveLength(3);
    const big = e.st().groups.find((g) => g.members.length === 3)!;
    expect(big.members.map((m) => m.t).sort()).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('rejects a proposal when one player wrote answers in both groups', () => {
    const e = setup(5);
    submit(e, 0, 'alpha', 'beta'); // P1 wrote both
    submit(e, 1, 'gamma');
    submit(e, 2, 'delta');
    submit(e, 3, 'epsilon');
    submit(e, 4, 'zeta');
    expect(e.st().phase).toBe('merge');
    act(e, 1, { type: 'propose', a: groupOf(e, 'alpha'), b: groupOf(e, 'beta') });
    expect(e.st().proposals).toHaveLength(0);
    expect(e.st().refused[e.ids[1]]).toHaveLength(1);
    // The refusal stays private to the proposer.
    expect((secondWitness.view(e.st(), { kind: 'player', id: e.ids[1] }) as SWView).you!.refused).toHaveLength(1);
    expect((secondWitness.view(e.st(), { kind: 'player', id: e.ids[2] }) as SWView).you!.refused).toHaveLength(0);
    // A merge that becomes invalid through chaining is dropped too: alpha+gamma, then gamma+beta would join P1's two answers.
    act(e, 1, { type: 'propose', a: groupOf(e, 'alpha'), b: groupOf(e, 'gamma') });
    act(e, 1, { type: 'propose', a: groupOf(e, 'gamma'), b: groupOf(e, 'beta') });
    expect(e.st().proposals).toHaveLength(2);
    const first = e.st().proposals[0].id;
    act(e, 2, { type: 'vote', proposal: first, yes: true });
    act(e, 3, { type: 'vote', proposal: first, yes: true });
    expect(e.st().groups).toHaveLength(5);
    expect(e.st().proposals).toHaveLength(0);
  });

  it('caps open proposals per player', () => {
    const e = mergeRoom();
    const g = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map((t) => groupOf(e, t));
    // Player 5 (index 4) proposes pairs it has no answers in: alpha-beta, alpha-gamma, alpha-delta, beta-gamma.
    for (const [a, b] of [[0, 1], [0, 2], [0, 3], [1, 2]]) act(e, 4, { type: 'propose', a: g[a], b: g[b] });
    expect(e.st().proposals.filter((p) => p.by === e.ids[4])).toHaveLength(MAX_OPEN_PROPOSALS);
  });

  it('ends when everyone present taps Done, and ignores stale votes after the phase', () => {
    const e = mergeRoom();
    e.ids.slice(0, 4).forEach((_, i) => act(e, i, { type: 'done' }));
    expect(e.st().phase).toBe('merge');
    e.h.room.runHostCommand({ type: 'kick', playerId: e.ids[4] });
    expect(e.st().phase).toBe('reveal');
    expect(() => act(e, 0, { type: 'propose', a: 1, b: 2 })).not.toThrow();
  });

  it('skips the merge phase when fewer than 2 groups', () => {
    const e = setup(3);
    submit(e, 0, 'same');
    submit(e, 1, 'Same');
    submit(e, 2, 'the same');
    expect(e.st().phase).toBe('reveal');
  });
});

describe('second-witness secrets', () => {
  for (const players of [3, 8, 20]) {
    for (const seed of [1, 2, 3]) {
      it(`no view holds another player's answers before the write phase ends (${players} players, seed ${seed})`, () => {
        const { records } = recordViews<SWState>(secondWitness, { players, seed, screen: true });
        let checked = 0;
        const leaks = findLeaks(records, (r) => {
          if (r.state.phase !== 'write') return null;
          const own = new Set((r.state.answers[r.viewerKey] ?? []).map((t) => t.toLowerCase()));
          const prompt = (r.view as SWView).prompt.text.toLowerCase();
          const others = Object.entries(r.state.answers)
            .filter(([p]) => p !== r.viewerKey)
            .flatMap(([, a]) => a)
            .filter((t) => !own.has(t.toLowerCase()) && t.toLowerCase() !== prompt);
          if (others.length) checked++;
          return { exact: others };
        });
        expect(leaks).toEqual([]);
        expect(checked).toBeGreaterThan(0);
        // The merge phase is anonymous: no player id anywhere in the groups or proposals.
        for (const r of records) {
          if (r.state.phase !== 'merge') continue;
          const merge = JSON.stringify((r.view as SWView).merge);
          for (const id of r.state.playerIds) expect(merge).not.toContain(`"${id}"`);
        }
      });
    }
  }

  it('hides distinctive answers from everyone else until the write phase is over', () => {
    const h = createHarness({ seed: 4 });
    const screen = h.join('Screen', { role: 'screen' });
    const clients = ['A', 'B', 'C', 'D'].map((n) => h.join(n));
    h.room.runHostCommand({ type: 'selectGame', gameId: 'second-witness' });
    h.room.runHostCommand({ type: 'start' });
    const secret = (i: number) => `zzqx-secret-${i}`;
    clients.slice(0, 3).forEach((c, i) => h.room.runAction(c.id, { type: 'submit', answers: [secret(i), `${secret(i)}-two`] }));
    const state = () => h.room.snapshot().game!.state as SWState;
    expect(state().phase).toBe('write');
    const seen = (c: { view(): unknown }) => JSON.stringify(c.view());
    expect(seen(screen)).not.toContain('zzqx');
    expect(seen(clients[3])).not.toContain('zzqx');
    clients.slice(0, 3).forEach((c, i) => {
      expect(seen(c)).toContain(secret(i));
      for (const j of [0, 1, 2]) if (j !== i) expect(seen(c)).not.toContain(secret(j));
    });
    // The fourth locks in: the phase ends, and the groups are shown anonymously.
    h.room.runAction(clients[3].id, { type: 'submit', answers: ['other'] });
    expect(state().phase).toBe('merge');
    expect(seen(screen)).toContain('zzqx-secret-0');
  });
});

describe('second-witness play', () => {
  it('plays to a result with a leaving player and idle bots', () => {
    const r = simulateGame(secondWitness, { players: 6, seed: 9, dropPlayerAtStep: 8, staleActions: true });
    expect(Object.keys(r.result.scores)).toHaveLength(6);
    const idle = simulateGame(secondWitness, { players: 4, seed: 2, idleBots: true });
    expect(Object.values(idle.result.scores).every((x) => x === 0)).toBe(true);
  });

  it('never repeats a prompt within a game', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { records } = recordViews<SWState>(secondWitness, { players: 3, seed });
      const ids = records.at(-1)!.state.promptIds;
      expect(ids).toHaveLength(6);
      expect(new Set(ids).size).toBe(6);
    }
  });
});
