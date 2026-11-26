import { describe, expect, it } from 'vitest';
import secondWitness, { type SWState, type SWView } from '../src/games/second-witness/logic';
import { PROMPTS } from '../src/games/second-witness/content';
import { basePoints, normalize, pointsWhy } from '../src/games/second-witness/match';
import { MATCH_MS, MAX_ANSWER_LEN, MAX_ROUNDS, POINTS, ROUNDS, WRITE_MS } from '../src/games/second-witness/rules';
import { createHarness, findLeaks, recordViews, simulateGame, type RoomHarness, type TestClient } from '../src/core/testkit';

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
  it('pays 3 / 5 / 1 / 0 and says why', () => {
    expect(basePoints(1, 1)).toBe(POINTS.single);
    expect(basePoints(1, 0)).toBe(0);
    expect(basePoints(2, 2)).toBe(POINTS.second);
    expect(basePoints(2, 1)).toBe(POINTS.half);
    expect(basePoints(2, 0)).toBe(0);
    expect(basePoints(0, 0)).toBe(0);
    expect([POINTS.single, POINTS.second, POINTS.half]).toEqual([3, 5, 1]);
    expect(pointsWhy(['Pizza'], [true])).toEqual([{ pts: 3, why: 'Pizza matched' }]);
    expect(pointsWhy(['Pizza', 'Pasta'], [true, true])).toEqual([{ pts: 5, why: 'Pizza and Pasta both matched' }]);
    expect(pointsWhy(['Pizza', 'Pasta'], [false, true])).toEqual([{ pts: 1, why: 'Pasta matched, Pizza did not' }]);
    expect(pointsWhy(['Pizza', 'Pasta'], [false, false])).toEqual([]);
  });
});

// ---- scenario helpers: real room, humans only, no bots ----

interface Env {
  h: RoomHarness;
  ids: string[];
  screen: TestClient;
  clients: TestClient[];
  st: () => SWState;
}

/** Most scenarios play a one-round game; the rounds tests pass `rounds`. */
function setup(n: number, seed = 1, rounds = 1): Env {
  const h = createHarness({ seed });
  const screen = h.join('Screen', { role: 'screen' });
  const clients = Array.from({ length: n }, (_, i) => h.join(`P${i + 1}`));
  expect(h.room.runHostCommand({ type: 'selectGame', gameId: 'second-witness' })).toBeNull();
  expect(h.room.runHostCommand({ type: 'setSetting', key: 'rounds', value: rounds })).toBeNull();
  expect(h.room.runHostCommand({ type: 'start' })).toBeNull();
  return { h, ids: clients.map((c) => c.id), screen, clients, st: () => h.room.snapshot().game!.state as SWState };
}

const act = (e: Env, i: number, action: unknown) => e.h.room.runAction(e.ids[i], action);
const submit = (e: Env, i: number, ...answers: string[]) => act(e, i, { type: 'submit', answers });
const tap = (e: Env, i: number, word: number, on = true) => act(e, i, { type: 'match', word, on });
const done = (e: Env, i: number, on = true) => act(e, i, { type: 'done', on });
const viewOf = (e: Env, i: number) => secondWitness.view(e.st(), { kind: 'player', id: e.ids[i] }) as SWView;
const screenView = (e: Env) => secondWitness.view(e.st(), { kind: 'screen' }) as SWView;
const result = (e: Env) => secondWitness.result(e.st());

/** Everyone submits (index -> answers), which moves the game on to matching. */
function toMatch(e: Env, answers: string[][]): void {
  expect(e.st().phase).toBe('write');
  answers.forEach((a, i) => submit(e, i, ...a));
  expect(e.st().phase).toBe('match');
}

describe('second-witness scoring', () => {
  it('pays one answer, two answers, half matches, live in the view and in the result', () => {
    const e = setup(6);
    toMatch(e, [['x'], ['x'], ['y', 'z'], ['y', 'z'], ['w', 'q'], ['x', 'h2']]);
    tap(e, 0, 0); // one answer, matched: 3
    tap(e, 1, 0);
    tap(e, 2, 0); // both matched: 5
    tap(e, 2, 1);
    tap(e, 3, 1); // only one of two: 1
    // player 5 taps nothing: 0. Player 6 taps its first word only: 1
    tap(e, 5, 0);
    expect(viewOf(e, 0).you).toMatchObject({ points: 3, matched: [true], why: [{ pts: 3, why: 'x matched' }] });
    expect(viewOf(e, 2).you).toMatchObject({ points: 5, why: [{ pts: 5, why: 'y and z both matched' }] });
    expect(viewOf(e, 3).you).toMatchObject({ points: 1, why: [{ pts: 1, why: 'z matched, y did not' }] });
    expect(viewOf(e, 4).you).toMatchObject({ points: 0, why: [] });
    tap(e, 0, 0, false); // taking it back takes the points back
    expect(viewOf(e, 0).you).toMatchObject({ points: 0, matched: [false], why: [] });
    tap(e, 0, 0);
    [0, 1, 2, 3, 4, 5].forEach((i) => done(e, i));
    expect(e.st().phase).toBe('done');
    expect(Object.values(result(e)!.scores)).toEqual([3, 3, 5, 1, 0, 1]);
  });

  it('counts two answers that normalize the same as one', () => {
    const e = setup(3);
    toMatch(e, [['Temple', 'temples'], ['the temple'], ['x']]);
    expect(e.st().answers[e.ids[0]]).toEqual(['Temple']);
    tap(e, 0, 0);
    tap(e, 0, 1); // there is no second word
    expect(e.st().matched[e.ids[0]]).toEqual([0]);
    expect(viewOf(e, 0).you!.points).toBe(3);
  });

  it('ignores matches out of range, from players with no words, in other phases, and after Done', () => {
    const e = setup(4);
    tap(e, 0, 0); // still writing
    done(e, 0);
    expect(e.st().matched).toEqual({});
    expect(e.st().done).toEqual([]);
    toMatch(e, [['a'], ['b'], ['c'], ['d']]);
    tap(e, 0, 1); // no second word
    expect(e.st().matched[e.ids[0]] ?? []).toEqual([]);
    tap(e, 0, 0);
    done(e, 0);
    tap(e, 0, 0, false); // locked while Done is on
    expect(e.st().matched[e.ids[0]]).toEqual([0]);
    done(e, 0, false);
    tap(e, 0, 0, false);
    expect(e.st().matched[e.ids[0]]).toEqual([]);
  });
});

describe('second-witness phases', () => {
  it('writing ends early once everyone is in, and the host settings set the timers', () => {
    const e = setup(3);
    expect([WRITE_MS, MATCH_MS]).toEqual([30_000, 120_000]);
    expect(screenView(e).deadline! - e.h.clock.now()).toBe(WRITE_MS);
    submit(e, 0, 'x');
    submit(e, 1, 'x');
    expect(e.st().phase).toBe('write');
    submit(e, 2, 'y');
    expect(e.st().phase).toBe('match');
    expect(screenView(e).deadline! - e.h.clock.now()).toBe(MATCH_MS);
  });

  it('matching ends only when every present player is Done; Done can be undone until then', () => {
    const e = setup(3);
    toMatch(e, [['x'], ['x'], ['y']]);
    done(e, 0);
    done(e, 1);
    expect(e.st().phase).toBe('match');
    expect(screenView(e).done).toEqual([e.ids[0], e.ids[1]]);
    done(e, 1, false); // changed their mind
    expect(screenView(e).done).toEqual([e.ids[0]]);
    done(e, 2);
    expect(e.st().phase).toBe('match');
    done(e, 1);
    expect(e.st().phase).toBe('done');
    const final = result(e);
    expect(final).not.toBeNull();
    done(e, 1, false); // too late: the game is over
    expect(e.st().phase).toBe('done');
    expect(result(e)).toEqual(final);
  });

  it('a player who left never blocks, and neither does one who wrote nothing', () => {
    const e = setup(4);
    submit(e, 0, 'a');
    submit(e, 1, 'a');
    submit(e, 2, 'b');
    expect(e.h.room.runHostCommand({ type: 'kick', playerId: e.ids[3] })).toBeNull(); // the last writer leaves: writing is over
    expect(e.st().phase).toBe('match');
    done(e, 0);
    done(e, 1);
    expect(e.st().phase).toBe('match');
    expect(e.h.room.runHostCommand({ type: 'kick', playerId: e.ids[2] })).toBeNull(); // the last one still to tap Done leaves
    expect(e.st().phase).toBe('done');

    const f = setup(3);
    submit(f, 0, 'a');
    submit(f, 1, 'a');
    f.h.step(); // time is up; player 3 wrote nothing
    expect(f.st().phase).toBe('match');
    expect(viewOf(f, 2).you!.answers).toBeNull();
    expect(screenView(f).done).toEqual([f.ids[2]]); // nothing to match, so already done
    done(f, 0);
    done(f, 1);
    expect(f.st().phase).toBe('done');
    expect(result(f)!.scores[f.ids[2]]).toBe(0);
  });

  it('the backstop timer ends matching when someone never taps Done, keeping the points marked', () => {
    const e = setup(3);
    toMatch(e, [['x'], ['x'], ['y']]);
    tap(e, 0, 0);
    done(e, 0);
    e.h.step(); // the 2 minutes are up
    expect(e.st().phase).toBe('done');
    expect(Object.values(result(e)!.scores)).toEqual([3, 0, 0]);
  });

  it('nobody writing anything ends the game at the writing timer', () => {
    const e = setup(3);
    e.h.step();
    expect(e.st().phase).toBe('done');
    expect(Object.values(result(e)!.scores)).toEqual([0, 0, 0]);
  });
});

describe('second-witness rounds', () => {
  it('plays 5 rounds by default, each with a new prompt, and adds the points up', () => {
    expect(ROUNDS).toBe(5);
    expect(secondWitness.defaultSettings.rounds).toBe(5);
    const e = setup(3, 4, ROUNDS);
    const prompts: string[] = [];
    for (let r = 1; r <= ROUNDS; r++) {
      expect(screenView(e)).toMatchObject({ phase: 'write', round: r, rounds: ROUNDS });
      prompts.push(screenView(e).prompt.id);
      toMatch(e, [['x'], ['x'], ['y']]);
      tap(e, 0, 0); // 3 a round for player 1, nothing for the others
      expect(viewOf(e, 0).you).toMatchObject({ points: 3, banked: 3 * (r - 1) });
      [0, 1, 2].forEach((i) => done(e, i));
    }
    expect(new Set(prompts).size).toBe(ROUNDS);
    expect(e.st().phase).toBe('done');
    expect(Object.values(result(e)!.scores)).toEqual([3 * ROUNDS, 0, 0]);
    expect(result(e)!.summary).toBe(`${ROUNDS} words found a second witness over ${ROUNDS} rounds`);
  });

  it('starts each round clean: no answers, marks, Done or drafts carry over', () => {
    const e = setup(3, 1, 2);
    toMatch(e, [['a', 'b'], ['a'], ['c']]);
    tap(e, 0, 0);
    act(e, 2, { type: 'draft', answers: ['stale'] }); // a draft in the wrong phase is ignored
    [0, 1, 2].forEach((i) => done(e, i));
    expect(e.st()).toMatchObject({ phase: 'write', round: 2, answers: {}, matched: {}, done: [], drafts: {} });
    expect(viewOf(e, 0).you).toMatchObject({ answers: null, draft: null, matched: [], points: 0, banked: 1 });
  });

  it('the host picks the number of rounds, and the timers still end every round', () => {
    expect(secondWitness.settingsFields!.find((f) => f.key === 'rounds')).toMatchObject({ min: 1, max: MAX_ROUNDS, step: 1 });
    const e = setup(3, 2, 3);
    expect(screenView(e).rounds).toBe(3);
    for (let i = 0; i < 3; i++) e.h.step(); // nobody writes: each round ends at its writing timer
    expect(e.st().phase).toBe('done');
    expect(Object.values(result(e)!.scores)).toEqual([0, 0, 0]);
  });
});

describe('second-witness drafts', () => {
  it('submits half-typed answers when time runs out, and never counts a draft as locked in', () => {
    const e = setup(4);
    act(e, 0, { type: 'draft', answers: ['  half typed ', ''] });
    act(e, 0, { type: 'draft', answers: ['half typed', 'and more'] }); // latest wins
    act(e, 1, { type: 'draft', answers: ['', ''] }); // nothing to submit
    act(e, 3, { type: 'draft', answers: ['drafted'] });
    submit(e, 3, 'real'); // the real submit beats the draft
    act(e, 3, { type: 'draft', answers: ['late draft'] }); // stale
    submit(e, 2, 'y');
    expect(e.st().phase).toBe('write');
    expect(screenView(e).locked).toEqual([e.ids[3], e.ids[2]]);
    expect(viewOf(e, 0).you).toMatchObject({ answers: null, draft: ['half typed', 'and more'] });
    e.h.step();
    expect(e.st().phase).toBe('match');
    expect(e.st().answers[e.ids[0]]).toEqual(['half typed', 'and more']);
    expect(e.st().answers[e.ids[1]]).toBeUndefined();
    expect(e.st().answers[e.ids[3]]).toEqual(['real']);
    expect(e.st().drafts).toEqual({});
    expect(viewOf(e, 0).you!.draft).toBeNull();
  });

  it('refuses drafts over the answer limit, like a real submit', () => {
    expect(secondWitness.actionSchema.safeParse({ type: 'draft', answers: ['x'.repeat(MAX_ANSWER_LEN + 1)] }).success).toBe(false);
    expect(secondWitness.actionSchema.safeParse({ type: 'draft', answers: ['a', 'b', 'c'] }).success).toBe(false);
    expect(secondWitness.actionSchema.safeParse({ type: 'draft', answers: ['ok', ''] }).success).toBe(true);
  });

  it('keeps a draft in nobody else\'s view', () => {
    const e = setup(3);
    act(e, 0, { type: 'draft', answers: ['zzqx-draft'] });
    const seen = (c: TestClient) => JSON.stringify(c.view());
    expect(seen(e.clients[0])).toContain('zzqx-draft'); // the author's own view, to restore the input
    expect(seen(e.screen)).not.toContain('zzqx');
    expect(seen(e.clients[1])).not.toContain('zzqx');
    expect(seen(e.clients[2])).not.toContain('zzqx');
  });
});

describe('second-witness secrets', () => {
  for (const players of [3, 8, 20]) {
    for (const seed of [1, 2, 3]) {
      it(`no view ever holds another player's answers, marks or drafts (${players} players, seed ${seed})`, () => {
        const { records } = recordViews<SWState>(secondWitness, { players, seed, screen: true });
        let checked = 0;
        const leaks = findLeaks(records, (r) => {
          const s = r.state;
          const prompt = (r.view as SWView).prompt.text.toLowerCase();
          const own = new Set([...(s.answers[r.viewerKey] ?? []), ...(s.drafts[r.viewerKey] ?? [])].map((t) => t.toLowerCase()));
          const others = Object.entries({ ...s.drafts, ...s.answers })
            .filter(([p]) => p !== r.viewerKey)
            .flatMap(([, a]) => a)
            .filter((t) => t && !own.has(t.toLowerCase()) && t.toLowerCase() !== prompt);
          if (others.length) checked++;
          return { exact: others };
        });
        expect(leaks).toEqual([]);
        expect(checked).toBeGreaterThan(0);
      });
    }
  }

  it('shows distinctive answers only to their author, in both phases, and never on the screen', () => {
    const e = setup(4, 4);
    const secret = (i: number) => `zzqx-secret-${i}`;
    [0, 1, 2].forEach((i) => submit(e, i, secret(i), `${secret(i)}-two`));
    const seen = (c: TestClient) => JSON.stringify(c.view());
    const check = () => {
      expect(seen(e.screen)).not.toContain('zzqx');
      expect(seen(e.clients[3])).not.toContain('zzqx');
      [0, 1, 2].forEach((i) => {
        expect(seen(e.clients[i])).toContain(secret(i));
        for (const j of [0, 1, 2]) if (j !== i) expect(seen(e.clients[i])).not.toContain(secret(j));
      });
    };
    expect(e.st().phase).toBe('write');
    check();
    submit(e, 3, 'other');
    expect(e.st().phase).toBe('match');
    tap(e, 0, 0);
    check();
  });
});

describe('second-witness play', () => {
  it('plays to a result with a leaving player, stale actions and idle bots', () => {
    const r = simulateGame(secondWitness, { players: 6, seed: 9, dropPlayerAtStep: 8, staleActions: true });
    expect(Object.keys(r.result.scores)).toHaveLength(6);
    const idle = simulateGame(secondWitness, { players: 4, seed: 2, idleBots: true });
    expect(Object.values(idle.result.scores).every((x) => x === 0)).toBe(true);
  });

  it('bots write, tap matches and check off Done, with up to 20 players', () => {
    const r = simulateGame(secondWitness, { players: 20, seed: 3, screen: true });
    expect(Object.keys(r.result.scores)).toHaveLength(20);
    expect(Object.values(r.result.scores).some((x) => x > 0)).toBe(true);
  });
});
