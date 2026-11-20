// Forgery: rules, content invariants and the secret-leak tests (the word and the forger's
// identity must not reach anyone who shouldn't know them before the reveal).
import { describe, expect, it } from 'vitest';
import { createHarness, findLeaks, recordViews, type RoomHarness, type TestClient } from '../src/core/testkit';
import forgery, { type ForgeryState, type ForgeryView } from '../src/games/forgery/logic';
import { CATEGORIES } from '../src/games/forgery/content';
import { POINTS } from '../src/games/forgery/rules';

// ---------- content ----------

describe('forgery content', () => {
  // Strings that appear in views: a word hidden inside one would be a false leak.
  const viewLiterals = 'draw vote guess reveal done artist forger escaped stolen caught void category';

  it('has enough categories and words', () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(30);
    for (const c of CATEGORIES) expect(c.words.length, c.title).toBeGreaterThanOrEqual(8);
  });

  it('keeps words clean, unique per category and out of the strings views carry', () => {
    for (const c of CATEGORIES) {
      expect(new Set(c.words).size, c.title).toBe(c.words.length);
      for (const w of c.words) {
        expect(w, w).toMatch(/^[a-z]+( [a-z]+)*$/);
        expect(w.length, w).toBeGreaterThanOrEqual(4);
        expect(c.title.toLowerCase(), `${w} in title`).not.toContain(w);
        expect(viewLiterals, w).not.toContain(w);
        // asset ids are hex: a word made only of a-f could appear inside one by chance
        expect(w.replace(/ /g, ''), w).not.toMatch(/^[a-f]+$/);
      }
    }
  });
});

// ---------- manual rounds ----------

interface Rig {
  h: RoomHarness;
  clients: TestClient[];
  screen: TestClient;
  st(): ForgeryState;
  act(id: string, action: unknown): void;
}

function rig(n: number, seed = 1): Rig {
  const h = createHarness({ seed });
  const screen = h.join('Screen', { role: 'screen' });
  const clients = Array.from({ length: n }, (_, i) => h.join(`P${i + 1}`));
  expect(h.room.runHostCommand({ type: 'selectGame', gameId: 'forgery' })).toBeNull();
  expect(h.room.runHostCommand({ type: 'start' })).toBeNull();
  const st = () => h.room.snapshot().game!.state as ForgeryState;
  return { h, clients, screen, st, act: (id, a) => void h.room.runAction(id, a) };
}

const STROKE = { type: 'stroke', stroke: { c: '#ffffff', w: 14, p: [10, 10, 200, 150] } };

function drawAll(r: Rig): void {
  while (r.st().phase === 'draw') r.act(r.st().turns[r.st().turn], STROKE);
}

function voteAll(r: Rig, pick: (voter: string) => string): void {
  for (const id of r.st().playerIds) r.act(id, { type: 'vote', target: pick(id) });
}

describe('forgery rules', () => {
  it('plays two laps of single strokes in the voter-visible seat colors', () => {
    const r = rig(4);
    const s0 = r.st();
    expect(s0.turns).toHaveLength(8);
    drawAll(r);
    const s = r.st();
    expect(s.phase).toBe('vote');
    expect(s.strokes).toHaveLength(8);
    const asset = r.h.room.getAsset(s.strokes[0].id!) as { strokes: Array<{ c: string }> };
    expect(asset.strokes).toHaveLength(1);
    expect(asset.strokes[0].c).toBe(s.colors[s.strokes[0].by]); // forced to the seat color, whatever the client sent
  });

  it('ignores strokes from anyone but the current drawer', () => {
    const r = rig(3);
    const drawer = r.st().turns[0];
    const other = r.st().playerIds.find((id) => id !== drawer)!;
    r.act(other, STROKE);
    expect(r.st().turn).toBe(0);
    r.act(drawer, STROKE);
    expect(r.st().turn).toBe(1);
  });

  it('skips a turn on timeout', () => {
    const r = rig(3);
    r.h.step();
    expect(r.st().strokes).toEqual([{ by: r.st().turns[0], id: null }]);
    expect(r.st().turn).toBe(1);
  });

  it('escaped: a tie for first accuses nobody and the forger scores', () => {
    const r = rig(4);
    drawAll(r);
    const { forger, playerIds } = r.st();
    const [a0, a1, a2] = playerIds.filter((id) => id !== forger);
    const picks: Record<string, string> = { [forger]: a0, [a0]: a1, [a1]: a0, [a2]: a1 }; // a0: 2, a1: 2
    voteAll(r, (v) => picks[v]);
    const s = r.st();
    expect(s.accused).toBeNull();
    expect(s.outcome).toBe('escaped');
    expect(s.gain[forger]).toBe(POINTS.escaped);
  });

  it('caught and wrong guess: artists score, forger does not', () => {
    const r = rig(4);
    drawAll(r);
    const { forger, playerIds, category, word } = r.st();
    const artists = playerIds.filter((id) => id !== forger);
    voteAll(r, (v) => (v === forger ? artists[0] : forger));
    expect(r.st().phase).toBe('guess');
    const wrong = CATEGORIES[category].words.find((w) => w !== word)!;
    r.act(forger, { type: 'guess', word: wrong });
    const s = r.st();
    expect(s.outcome).toBe('caught');
    for (const a of artists) expect(s.gain[a]).toBe(POINTS.caught + POINTS.sharpEye);
    expect(s.gain[forger]).toBeUndefined();
  });

  it('caught but right guess steals the win', () => {
    const r = rig(4);
    drawAll(r);
    const { forger, playerIds, word } = r.st();
    const artists = playerIds.filter((id) => id !== forger);
    voteAll(r, (v) => (v === forger ? artists[0] : forger));
    r.act(forger, { type: 'guess', word });
    const s = r.st();
    expect(s.outcome).toBe('stolen');
    expect(s.gain[forger]).toBe(POINTS.stolen);
    for (const a of artists) expect(s.gain[a]).toBe(POINTS.sharpEye);
  });

  it('only the caught forger can guess, and only from the category', () => {
    const r = rig(3);
    drawAll(r);
    const { forger, playerIds } = r.st();
    const artists = playerIds.filter((id) => id !== forger);
    voteAll(r, (v) => (v === forger ? artists[0] : forger));
    r.act(artists[0], { type: 'guess', word: r.st().word });
    expect(r.st().phase).toBe('guess');
    r.act(forger, { type: 'guess', word: 'definitely not in the list' });
    expect(r.st().phase).toBe('guess');
  });

  it('rotates the forger and ends after min(players, 4) rounds', () => {
    const r = rig(3);
    const forgers: string[] = [];
    for (let i = 0; i < 3; i++) {
      forgers.push(r.st().forger);
      r.h.runUntil(() => r.st().phase === 'reveal' || r.h.lobby().phase === 'results');
      r.h.runUntil(() => r.st().round > i + 1 || r.h.lobby().phase === 'results');
    }
    expect(new Set(forgers).size).toBe(3);
    expect(r.h.lobby().phase).toBe('results');
  });

  it('voids the round when the forger leaves, and never stalls', () => {
    const r = rig(4);
    const forger = r.st().forger;
    r.h.room.runHostCommand({ type: 'kick', playerId: forger });
    const s = r.st();
    expect(s.phase).toBe('reveal');
    expect(s.outcome).toBe('void');
    expect(Object.keys(s.gain)).toHaveLength(0);
    r.h.runUntil(() => r.h.lobby().phase === 'results');
  });

  it('skips the drawer who leaves', () => {
    const r = rig(5);
    const drawer = r.st().turns[0];
    if (drawer === r.st().forger) return; // forger leaving voids the round instead (covered above)
    r.h.room.runHostCommand({ type: 'kick', playerId: drawer });
    expect(r.st().strokes[0]).toEqual({ by: drawer, id: null });
    expect(r.st().turns[r.st().turn]).not.toBe(drawer);
  });
});

// ---------- secrets ----------

const SEEDS = [1, 2, 3, 4, 5];
const COUNTS = [3, 5, 8];

describe('forgery secret leaks', () => {
  for (const players of COUNTS) {
    for (const seed of SEEDS) {
      it(`${players} players, seed ${seed}: word and forger stay hidden until they should not`, () => {
        const { records } = recordViews<ForgeryState>(forgery, { players, seed, screen: true });
        const prePhase = (r: { state: ForgeryState }) => r.state.phase === 'draw' || r.state.phase === 'vote';

        // 1. The forger never sees the word while drawing or voting.
        const forgerLeaks = findLeaks(records, (r) =>
          r.viewerKey === r.state.forger && prePhase(r) ? { text: [r.state.word] } : null,
        );
        expect(forgerLeaks).toEqual([]);

        // 2. The screen never shows the word before the reveal (the pick-list goes to the forger only).
        const screenLeaks = findLeaks(records, (r) =>
          r.viewerKey === 'screen' && r.state.phase !== 'reveal' && r.state.phase !== 'done' ? { text: [r.state.word] } : null,
        );
        expect(screenLeaks).toEqual([]);

        // 3. Nobody but the forger can tell who the forger is before the reveal:
        //    no view names the role, and each view is identical whoever the forger is.
        const roleLeaks = findLeaks(records, (r) =>
          r.viewerKey !== r.state.forger && prePhase(r) ? { exact: ['forger'] } : null,
        );
        expect(roleLeaks).toEqual([]);
        let compared = 0;
        for (const r of records) {
          if (r.viewerKey === r.state.forger || !prePhase(r)) continue;
          const swap = r.state.playerIds.find((id) => id !== r.state.forger && id !== r.viewerKey);
          if (!swap) continue;
          const alt: ForgeryState = { ...structuredClone(r.state), forger: swap };
          expect(JSON.stringify(forgery.view(alt, r.viewer)), `${r.viewerKey} at step ${r.step}`).toBe(r.json);
          compared++;
        }
        expect(compared).toBeGreaterThan(0);

        // 4. The pick-list (it contains the word) reaches only the forger, only while guessing.
        for (const r of records) {
          const v = r.view as ForgeryView;
          if (v.options) {
            expect(r.viewerKey).toBe(r.state.forger);
            expect(r.state.phase).toBe('guess');
          }
        }
      });
    }
  }

  it('live ink carries no secrets and looks the same for every drawer', () => {
    const r = rig(4, 3);
    const word = r.st().word;
    const forger = r.st().forger;
    const all = [r.screen, ...r.clients];
    while (r.st().phase === 'draw') {
      const drawer = r.st().turns[r.st().turn];
      r.act(drawer, { type: 'ink', pts: [10, 10, 40, 40, 80, 60] });
      r.act(drawer, STROKE);
    }
    const payloads = all.flatMap((c) => c.all('ephemeral').map((m) => m.payload as Record<string, unknown>));
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(Object.keys(p).sort()).toEqual(['by', 'k', 'pts', 'round', 'turn']);
      expect(JSON.stringify(p).toLowerCase()).not.toContain(word.toLowerCase());
    }
    // the forger's ink is indistinguishable in shape from an artist's
    const forgerInk = payloads.find((p) => p.by === forger);
    const artistInk = payloads.find((p) => p.by !== forger);
    expect(Object.keys(forgerInk!).sort()).toEqual(Object.keys(artistInk!).sort());
    // the drawer does not get their own echo
    const drawerClient = r.clients.find((c) => c.id === forger)!;
    expect(drawerClient.all('ephemeral').every((m) => (m.payload as { by: string }).by !== forger)).toBe(true);
  });
});
