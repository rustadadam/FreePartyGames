import { describe, expect, it } from 'vitest';
import secondWitness, { type SWState, type SWView } from '../src/games/second-witness/logic';
import { PROMPTS } from '../src/games/second-witness/content';
import { basePoints, normalize } from '../src/games/second-witness/match';
import { CALL_MS, MAX_ANSWER_LEN, MULTIPLIERS, POINTS, UNIQUE_BONUS, WRITE_MS } from '../src/games/second-witness/rules';
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
const screenView = (e: Env) => secondWitness.view(e.st(), { kind: 'screen' }) as SWView;

/** On the active player's turn, everyone claims every pair of words that normalize the same. */
function callMatches(e: Env): void {
  const s = e.st();
  const active = s.order[s.turn];
  e.ids.forEach((id, i) => {
    if (id === active) return;
    (s.answers[id] ?? []).forEach((mine, m) => s.answers[active].forEach((theirs, th) => normalize(mine) === normalize(theirs) && act(e, i, { type: 'match', mine: m, theirs: th })));
  });
}

/** Everyone submits (index -> answers), every turn gets its matches, and this round's points come back. Then moves on. */
function playRound(e: Env, answers: string[][]): number[] {
  expect(e.st().phase).toBe('write');
  answers.forEach((a, i) => submit(e, i, ...a));
  while (e.st().phase !== 'reveal') {
    if (e.st().phase === 'call') callMatches(e);
    e.h.step();
  }
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

describe('second-witness call phase', () => {
  it('gives 30 s to write and 3 s per turn, and shows each player\'s words in turn', () => {
    expect([WRITE_MS, CALL_MS]).toEqual([30_000, 3_000]);
    const e = setup(4);
    expect(screenView(e).deadline! - e.h.clock.now()).toBe(WRITE_MS);
    submit(e, 0, 'x');
    submit(e, 1, 'x');
    submit(e, 2, 'y');
    submit(e, 3, 'z');
    const s = e.st();
    expect(s.phase).toBe('call');
    expect([...s.order].sort()).toEqual([...e.ids].sort());
    expect(screenView(e).deadline! - e.h.clock.now()).toBe(CALL_MS);
    const first = e.ids.indexOf(s.order[0]);
    expect(screenView(e).call!.words.map((w) => w.text)).toEqual(s.answers[e.ids[first]]);
  });

  it('a claim matches both words; unmatched words fail; points are paid at the end of each turn', () => {
    const e = setup(4);
    ['x', 'x', 'y', 'z'].forEach((w, i) => submit(e, i, w));
    const active = e.ids.indexOf(e.st().order[0]);
    const paired = active < 2;
    if (paired) {
      act(e, 1 - active, { type: 'match', mine: 0, theirs: 0 });
      expect(screenView(e).call!.words[0].matchers).toEqual([e.ids[1 - active]]);
    }
    expect(screenView(e).call!.pts).toEqual({}); // nothing is paid until the turn ends
    e.h.step(); // the 3 seconds are up
    const v = screenView(e);
    expect(e.st().phase).toBe('result');
    expect(v.call!.words[0].error).toBe(!paired);
    expect(Object.values(v.call!.pts).reduce((a, b) => a + b, 0)).toBe(paired ? 6 : 0);
    expect(v.scores[e.ids[active]]).toBe(paired ? 3 : 0);
  });

  it('ignores your own claims, out-of-range words and other phases; repeating a claim takes it back; a claim can be moved', () => {
    const e = setup(3);
    submit(e, 0, 'a', 'b');
    submit(e, 1, 'a');
    submit(e, 2, 'c');
    // Walk to player 1's turn (nobody claims, so nothing ends a turn early).
    const claims = () => e.st().claims.length;
    while (e.st().order[e.st().turn] !== e.ids[0]) e.h.step();
    expect(e.st().phase).toBe('call');
    const before = claims();
    act(e, 0, { type: 'match', mine: 0, theirs: 0 }); // the active player
    act(e, 2, { type: 'match', mine: 1, theirs: 0 }); // player 3 has one word only
    expect(claims()).toBe(before);
    act(e, 1, { type: 'match', mine: 0, theirs: 1 });
    act(e, 1, { type: 'match', mine: 0, theirs: 0 }); // moved
    expect(claims() - before).toBe(1);
    expect(screenView(e).call!.words.map((w) => w.matchers.length)).toEqual([1, 0]);
    act(e, 1, { type: 'match', mine: 0, theirs: 0 }); // again: taken back
    expect(claims()).toBe(before);
  });

  it('ends the turn at once when every word is matched, then skips to the standings', () => {
    const e = setup(3);
    [0, 1, 2].forEach((i) => submit(e, i, 'same'));
    const active = e.ids.indexOf(e.st().order[0]);
    [0, 1, 2].filter((i) => i !== active).forEach((i) => act(e, i, { type: 'match', mine: 0, theirs: 0 }));
    expect(e.st().phase).toBe('result'); // no waiting for the 3 seconds
    e.h.step();
    expect(e.st().phase).toBe('reveal'); // nothing left to match, so the other turns are skipped
    expect(e.ids.map((id) => e.st().roundPts[id])).toEqual([3, 3, 3]);
  });

  it('ends the turn when the active player leaves', () => {
    const e = setup(4);
    ['a', 'b', 'c', 'd'].forEach((w, i) => submit(e, i, w));
    const active = e.st().order[0];
    expect(e.h.room.runHostCommand({ type: 'kick', playerId: active })).toBeNull();
    expect(e.st().phase).toBe('result');
    e.h.step();
    expect(e.st().order[e.st().turn]).not.toBe(active);
  });
});

describe('second-witness secrets', () => {
  for (const players of [3, 8, 20]) {
    for (const seed of [1, 2, 3]) {
      it(`no view holds another player's answers, except the active player's words on their turn (${players} players, seed ${seed})`, () => {
        const { records } = recordViews<SWState>(secondWitness, { players, seed, screen: true });
        let checked = 0;
        const leaks = findLeaks(records, (r) => {
          const s = r.state;
          if (s.phase !== 'write' && s.phase !== 'call' && s.phase !== 'result') return null;
          const active = s.phase === 'write' ? '' : s.order[s.turn];
          const allowed = new Set([...(s.answers[r.viewerKey] ?? []), ...(s.answers[active] ?? [])].map((t) => t.toLowerCase()));
          const prompt = (r.view as SWView).prompt.text.toLowerCase();
          const others = Object.entries(s.answers)
            .filter(([p]) => p !== r.viewerKey && p !== active)
            .flatMap(([, a]) => a)
            .filter((t) => !allowed.has(t.toLowerCase()) && t.toLowerCase() !== prompt);
          if (others.length) checked++;
          return { exact: others };
        });
        expect(leaks).toEqual([]);
        expect(checked).toBeGreaterThan(0);
      });
    }
  }

  it('hides distinctive answers from everyone else until it is their turn', () => {
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
    // The fourth locks in: the call phase starts, and only the active player's words are shown to the others.
    h.room.runAction(clients[3].id, { type: 'submit', answers: ['other'] });
    expect(state().phase).toBe('call');
    const active = clients.findIndex((c) => c.id === state().order[state().turn]);
    for (const [name, viewer, own] of [['screen', screen, -1], ...clients.map((c, i) => [`client ${i}`, c, i] as const)] as const) {
      for (const j of [0, 1, 2]) {
        const shown = j === active || j === own;
        expect(seen(viewer).includes(secret(j)), `${name} sees ${secret(j)}`).toBe(shown);
      }
    }
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
