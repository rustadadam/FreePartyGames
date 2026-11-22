import { describe, expect, it } from 'vitest';
import wikiWhat, { type WikiState, type WikiView } from '../src/games/wiki-what/logic';
import { QUESTIONS } from '../src/games/wiki-what/content';
import { createHarness, findLeaks, recordViews, simulateGame } from '../src/core/testkit';

describe('wiki-what content pack', () => {
  it('is a valid pack of at least 150 questions', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map((q) => q.question.trim().toLowerCase())).size).toBe(QUESTIONS.length);
    for (const q of QUESTIONS) {
      expect(q.article.trim(), q.id).not.toBe('');
      expect(q.question.trim(), q.id).not.toBe('');
      expect(q.choices, q.id).toHaveLength(4);
      expect(new Set(q.choices.map((c) => c.trim().toLowerCase())).size, q.id).toBe(4);
      expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, q.id).toBe(true);
    }
  });

  it('spreads the correct answer over all four positions', () => {
    const n = [0, 0, 0, 0];
    for (const q of QUESTIONS) n[q.answer]++;
    for (const c of n) expect(c / QUESTIONS.length).toBeGreaterThan(0.15);
  });
});

type R = { state: WikiState };
const moleOf = (r: R) => r.state.moles[r.state.round - 1];
const qOf = (r: R) => QUESTIONS.find((x) => x.id === r.state.qids[(r.state.round - 1) * r.state.perRound + r.state.qi])!;

describe('wiki-what secrets', () => {
  for (const players of [3, 6, 11]) {
    for (const seed of [1, 2, 3]) {
      it(`hides answer and Mole before their reveals (${players} players, seed ${seed})`, () => {
        const { records } = recordViews<WikiState>(wikiWhat, { players, seed, screen: true });

        // Answer: only the Mole's `answerIndex`, only while asking. Article and fun fact stay hidden until the reveal.
        const answerLeaks = findLeaks(records, (r) => {
          if (r.state.phase !== 'ask' || r.viewerKey === moleOf(r)) return null;
          const x = qOf(r);
          // Some questions name their topic in the question text itself, which is public by design.
          const named = x.question.toLowerCase().includes(x.article.toLowerCase());
          return { text: ['answerIndex', ...(named ? [] : [x.article]), ...(x.fact ? [x.fact] : [])] };
        });
        expect(answerLeaks).toEqual([]);

        // Mole identity: nothing role-like in any other view until the Mole reveal.
        const moleLeaks = findLeaks(records, (r) => {
          const hidden = r.state.phase === 'ask' || r.state.phase === 'reveal' || r.state.phase === 'accuse';
          return hidden && r.viewerKey !== moleOf(r) ? { exact: ['mole', 'moleReveal'] } : null;
        });
        expect(moleLeaks).toEqual([]);

        for (const r of records) {
          if (!['ask', 'reveal', 'accuse'].includes(r.state.phase) || r.viewerKey === moleOf(r)) continue;
          const v = r.view as WikiView;
          expect(v.you ?? {}).not.toHaveProperty('mole');
          expect(v.you ?? {}).not.toHaveProperty('answerIndex');
          expect(v.scores).toBeNull();
          expect(v.roundEnd).toBeNull();
        }

        // Each non-Mole view (and the screen's) is identical whoever else the Mole is.
        let compared = 0;
        for (const r of records) {
          if (!['ask', 'reveal', 'accuse'].includes(r.state.phase) || r.viewerKey === moleOf(r)) continue;
          const swap = r.state.playerIds.find((id) => id !== moleOf(r) && id !== r.viewerKey);
          if (!swap) continue;
          const alt: WikiState = structuredClone(r.state);
          alt.moles[alt.round - 1] = swap;
          expect(JSON.stringify(wikiWhat.view(alt, r.viewer)), `${r.viewerKey} at step ${r.step}`).toBe(r.json);
          compared++;
        }
        expect(compared).toBeGreaterThan(0);

        const moleAsk = records.filter((r) => r.state.phase === 'ask' && r.viewerKey === moleOf(r));
        expect(moleAsk.length).toBeGreaterThan(0);
        for (const r of moleAsk) expect((r.view as WikiView).you?.answerIndex).toBe(qOf(r).answer);
      });
    }
  }
});

describe('wiki-what rules', () => {
  it('never makes the same player Mole two rounds in a row', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { records } = recordViews<WikiState>(wikiWhat, { players: 3, seed });
      const moles = records.at(-1)!.state.moles;
      expect(moles).toHaveLength(3);
      for (let i = 1; i < moles.length; i++) expect(moles[i]).not.toBe(moles[i - 1]);
    }
  });

  it('scores every seated player', () => {
    const r = simulateGame(wikiWhat, { players: 5, seed: 5 });
    expect(Object.keys(r.result.scores)).toHaveLength(5);
    expect(Math.min(...Object.values(r.result.scores))).toBeGreaterThanOrEqual(0);
  });
});

describe('wiki-what accusations', () => {
  // If the Mole could not lock in, the "who has accused" pills (and the phase ending once
  // everyone else had) would point straight at the Mole.
  it('the Mole casts a decoy accusation: shown as locked in like anyone, never counted', () => {
    const h = createHarness({ seed: 7 });
    h.join('Screen', { role: 'screen' });
    const ids = Array.from({ length: 5 }, (_, i) => h.join(`P${i + 1}`).id);
    h.room.runHostCommand({ type: 'selectGame', gameId: 'wiki-what' });
    h.room.runHostCommand({ type: 'start' });
    const st = () => h.room.snapshot().game!.state as WikiState;
    h.runUntil(() => st().phase === 'accuse');
    const mole = st().moles[0];
    const team = ids.filter((id) => id !== mole);
    // Every team member accuses the same innocent player: the phase still waits for the Mole.
    for (const id of team) h.room.runAction(id, { type: 'accuse', target: id === team[0] ? team[1] : team[0] });
    expect(st().phase).toBe('accuse');
    const screenView = wikiWhat.view(st(), { kind: 'screen' }) as WikiView;
    expect(screenView.voted).not.toContain(mole);
    // Only once the Mole has cast a decoy does the phase end.
    h.room.runAction(mole, { type: 'accuse', target: team[1] });
    const s = st();
    expect(s.phase).toBe('moleReveal');
    expect(s.caught).toBe(false);
    const v = wikiWhat.view(s, { kind: 'screen' }) as WikiView;
    expect(v.roundEnd?.accuse).not.toHaveProperty(mole);
  });

  it('a decoy never decides the vote', () => {
    const h = createHarness({ seed: 3 });
    const ids = Array.from({ length: 4 }, (_, i) => h.join(`P${i + 1}`).id);
    h.room.runHostCommand({ type: 'selectGame', gameId: 'wiki-what' });
    h.room.runHostCommand({ type: 'start' });
    const st = () => h.room.snapshot().game!.state as WikiState;
    h.runUntil(() => st().phase === 'accuse');
    const mole = st().moles[0];
    const [a, b, c] = ids.filter((id) => id !== mole);
    // Mole gets 2 real accusations, b gets 1 real + the decoy: the decoy must not make it a tie.
    h.room.runAction(a, { type: 'accuse', target: mole });
    h.room.runAction(b, { type: 'accuse', target: mole });
    h.room.runAction(c, { type: 'accuse', target: b });
    h.room.runAction(mole, { type: 'accuse', target: b });
    expect(st().phase).toBe('moleReveal');
    expect(st().caught).toBe(true);
  });
});
