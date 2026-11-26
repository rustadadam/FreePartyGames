import { describe, expect, it } from 'vitest';
import alphabetSoup, { type ASState, type ASView } from '../src/games/alphabet-soup/logic';
import { WORD_SETS } from '../src/games/alphabet-soup/content';
import { dealLetters, groupCounts, planRound, sortLetters, splitSizes, wordLengths } from '../src/games/alphabet-soup/deal';
import { FIRST_BONUS, GROUP_COLORS, MAX_PLAYERS, MAX_WORD, MIN_PLAYERS, MIN_WORD, REVEAL_MS, ROUND_MS } from '../src/games/alphabet-soup/rules';
import { Rng } from '../src/core/rng';
import { createHarness, findLeaks, recordViews, type RoomHarness } from '../src/core/testkit';

describe('alphabet-soup dealing', () => {
  it('splits every room into fair groups that can share one word', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const counts = groupCounts(n);
      expect(counts.length, `n=${n}`).toBeGreaterThan(0);
      for (const k of counts) {
        const sizes = splitSizes(n, k);
        expect(k, `n=${n}`).toBeGreaterThanOrEqual(2);
        expect(k, `n=${n}`).toBeLessThanOrEqual(GROUP_COLORS.length);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...sizes) - Math.min(...sizes), `n=${n} k=${k}`).toBeLessThanOrEqual(1);
        expect(Math.min(...sizes), `n=${n} k=${k}`).toBeGreaterThanOrEqual(3);
        expect(Math.max(...sizes), `n=${n} k=${k}`).toBeLessThanOrEqual(MAX_WORD);
        for (const len of wordLengths(sizes)) {
          expect(len).toBeGreaterThanOrEqual(Math.max(MIN_WORD, ...sizes));
          expect(len).toBeLessThanOrEqual(Math.min(MAX_WORD, 2 * Math.min(...sizes)));
        }
      }
    }
    expect(groupCounts(6)).toEqual([2]);
    expect(groupCounts(10)).toEqual([2]);
    expect(groupCounts(12)).toEqual([2, 3]);
  });

  it('deals every letter of the word, 1 or 2 to each member', () => {
    const rng = new Rng(7);
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const { sizes, length } = planRound(n, rng);
      for (const size of sizes) {
        const members = Array.from({ length: size }, (_, i) => `p${i}`);
        const word = 'abcdef'.slice(0, length);
        const dealt = dealLetters(word, members, rng);
        expect(Object.keys(dealt).sort()).toEqual(members.slice().sort());
        for (const l of Object.values(dealt)) expect(l.length === 1 || l.length === 2).toBe(true);
        expect(sortLetters(Object.values(dealt).flat().join(''))).toBe(sortLetters(word));
      }
    }
  });

  it('word sets have enough clean words of every usable length', () => {
    for (const set of WORD_SETS) {
      expect(new Set(set.words).size, set.id).toBe(set.words.length);
      for (const w of set.words) expect(w, set.id).toMatch(new RegExp(`^[a-z]{${MIN_WORD},${MAX_WORD}}$`));
      for (let len = MIN_WORD; len <= MAX_WORD; len++)
        expect(set.words.filter((w) => w.length === len).length, `${set.id} ${len}`).toBeGreaterThanOrEqual(GROUP_COLORS.length);
    }
  });
});

// ---------- the game ----------

interface Env {
  h: RoomHarness;
  ids: string[];
  st: () => ASState;
}

function setup(n: number, seed = 1): Env {
  const h = createHarness({ seed });
  h.join('Screen', { role: 'screen' });
  const clients = Array.from({ length: n }, (_, i) => h.join(`P${i + 1}`));
  expect(h.room.runHostCommand({ type: 'selectGame', gameId: 'alphabet-soup' })).toBeNull();
  expect(h.room.runHostCommand({ type: 'start' })).toBeNull();
  return { h, ids: clients.map((c) => c.id), st: () => h.room.snapshot().game!.state as ASState };
}

const guess = (e: Env, id: string, word: string) => e.h.room.runAction(id, { type: 'guess', word });
const viewOf = (e: Env, id: string) => alphabetSoup.view(e.st(), { kind: 'player', id }) as ASView;
const advance = (e: Env, ms: number) => {
  e.h.clock.t += ms;
  e.h.room.fireDueTimers();
};

describe('alphabet-soup rounds and scoring', () => {
  it('pays seconds left, plus the bonus to the first group only, and ends when all have solved', () => {
    const e = setup(8);
    const [a, b] = e.st().groups;
    expect(e.st().groups.length).toBe(2);
    advance(e, 10_000); // 80 s left
    guess(e, a.members[0], a.word.toUpperCase());
    advance(e, 20_500); // 59.5 s left: rounds up to 60
    expect(e.st().phase).toBe('play');
    guess(e, b.members[1], ` ${b.word}! `);
    const s = e.st();
    expect(s.phase).toBe('reveal');
    expect(s.groups[0]).toMatchObject({ place: 1, points: ROUND_MS / 1000 - 10 + FIRST_BONUS });
    expect(s.groups[1]).toMatchObject({ place: 2, points: 60 });
    for (const m of a.members) expect(s.scores[m]).toBe(80 + FIRST_BONUS);
    for (const m of b.members) expect(s.scores[m]).toBe(60);
  });

  it('scores nothing for a group that runs out of time, then deals a new round', () => {
    const e = setup(6);
    const [a, b] = e.st().groups;
    guess(e, a.members[0], a.word);
    advance(e, ROUND_MS);
    const s = e.st();
    expect(s.phase).toBe('reveal');
    for (const m of b.members) expect(s.scores[m]).toBe(0);
    advance(e, REVEAL_MS);
    expect(e.st()).toMatchObject({ phase: 'play', round: 2 });
  });

  it('only your own group word counts, and wrong guesses say whether they used your letters', () => {
    const e = setup(8);
    const [a, b] = e.st().groups;
    const p = a.members[0];
    guess(e, p, b.word);
    expect(e.st().groups[1].place).toBeNull();
    expect(e.st().groups[0].place).toBeNull();
    const reversed = a.word.split('').reverse().join('');
    if (reversed !== a.word) {
      guess(e, p, reversed);
      expect(viewOf(e, p).you?.feedback).toMatchObject({ verdict: 'wrong' });
    }
    guess(e, p, 'zzzzzzzzz');
    expect(viewOf(e, p).you?.feedback).toMatchObject({ verdict: 'notYourLetters' });
  });

  it('hands a leaving player its letters to a teammate', () => {
    const e = setup(8);
    const g = e.st().groups[0];
    const leaver = g.members[0];
    const before = Object.values(g.letters).flat().sort();
    expect(e.h.room.runHostCommand({ type: 'kick', playerId: leaver })).toBeNull();
    const after = e.st().groups[0];
    expect(after.letters[leaver]).toEqual([]);
    expect(Object.values(after.letters).flat().sort()).toEqual(before);
  });
});

describe('alphabet-soup secrets', () => {
  it('no view shows a word before it is solved, another player its letters, or your teammates', () => {
    for (const seed of [1, 2]) {
      const { records } = recordViews<ASState>(alphabetSoup, { players: 9, seed, screen: true });
      const leaks = findLeaks(
        // Left out: a player's own last guess (their input, echoed back) and the scoreboard (keyed by every id).
        records.map((r) => {
          const v = r.view as ASView;
          return { ...r, view: { ...v, scores: null, you: v?.you ? { ...v.you, feedback: null } : null } };
        }),
        (r) => {
          const s = r.state;
          if (s.phase !== 'play') return null;
          const mine = s.groupOf[r.viewerKey];
          const hidden = s.groups.filter((g, i) => !(i === mine && g.place !== null)).map((g) => g.word);
          const open = mine !== undefined && s.groups[mine].place !== null; // solved: "typed by" may name a teammate
          const mates = mine === undefined || open ? [] : s.groups[mine].members.filter((m) => m !== r.viewerKey);
          return { exact: [...hidden, ...mates] };
        },
      );
      expect(leaks).toEqual([]);
      for (const r of records) {
        const v = r.view as ASView;
        if (r.state.phase !== 'play' || !v?.you) continue;
        const g = r.state.groups[r.state.groupOf[r.viewerKey]];
        expect(v.you.letters).toEqual(g?.letters[r.viewerKey] ?? []);
      }
    }
  });
});
