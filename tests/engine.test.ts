import { describe, expect, it } from 'vitest';
import { createHarness, findLeaks, recordViews } from '../src/core/testkit';
import { Room, LEAVE_GRACE_MS, MAX_ASSETS_MSG_BYTES, MAX_PLAYERS, PLAYER_COLORS } from '../src/core/engine';
import type { AnyGame } from '../src/core/game';
import tapDuel, { type TapState } from '../src/games/_template/logic';
import { CODE_ALPHABET, generateCode, isValidCode, normalizeCode } from '../src/shared/roomCode';
import { MAX_MESSAGE_BYTES } from '../src/shared/protocol';
import { planSeats } from '../src/shared/seating';
import { inkOn } from '../src/client/kit/Avatar';
import { Rng } from '../src/core/rng';

const GAME = 'tap-duel';

/** Host-player room: host + `others` humans, template game selected. */
function hostPlayerRoom(others = 2) {
  const h = createHarness();
  const host = h.join('Host');
  const rest = Array.from({ length: others }, (_, i) => h.join(`P${i + 1}`));
  h.send(host, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
  return { h, host, rest };
}

describe('room codes', () => {
  it('only uses the unambiguous alphabet', () => {
    expect(CODE_ALPHABET).not.toMatch(/[IOL]/);
    expect(CODE_ALPHABET).toHaveLength(23);
    const rng = new Rng(42);
    for (let i = 0; i < 2000; i++) {
      const code = generateCode(() => rng.next());
      expect(code).toMatch(/^[A-HJKMNP-Z]{4}$/);
      expect(isValidCode(code)).toBe(true);
    }
  });

  it('validates and normalizes', () => {
    expect(isValidCode('ABCI')).toBe(false);
    expect(isValidCode('ABCL')).toBe(false);
    expect(isValidCode('ABC0')).toBe(false);
    expect(isValidCode('abcd')).toBe(false);
    expect(isValidCode('ABCDE')).toBe(false);
    expect(normalizeCode(' ab-cd ')).toBe('ABCD');
  });

  it('rejects hello for a different room', () => {
    const h = createHarness({ code: 'ABCD' });
    const c = h.connect();
    h.send(c, { type: 'hello', code: 'WXYZ', name: 'X', role: 'player' });
    expect(c.last('error')?.code).toBe('wrong_room');
    expect(c.last('welcome')).toBeUndefined();
  });
});

describe('joining and reconnecting', () => {
  it('reconnect with token keeps the seat and the score', () => {
    const { h, host, rest } = hostPlayerRoom(1);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    // Host taps whenever it can, so it scores.
    h.runUntil(() => {
      if ((host.view() as { phase?: string })?.phase === 'go') h.send(host, { type: 'action', payload: { type: 'tap' } });
      return h.lobby().phase === 'results';
    });
    const before = h.lobby().players.find((p) => p.id === host.id)!;
    expect(before.score).toBeGreaterThan(0);

    const token = host.welcome()!.token;
    host.disconnect();
    expect(h.lobby().players.find((p) => p.id === host.id)!.connected).toBe(false);

    const again = h.join('Someone Else', { token });
    expect(again.id).toBe(host.id);
    const after = h.lobby().players.find((p) => p.id === host.id)!;
    expect(after).toMatchObject({ name: 'Host', score: before.score, connected: true, isHost: true });
    expect(h.lobby().players).toHaveLength(2);
    expect(rest[0].id).not.toBe(host.id);
  });

  it('a reconnecting player gets the current game view', () => {
    const { h, host, rest } = hostPlayerRoom(1);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    h.step();
    const token = rest[0].welcome()!.token;
    const seen = rest[0].view();
    expect(seen).not.toBeNull();
    rest[0].disconnect();
    const back = h.join('P1', { token });
    expect(back.id).toBe(rest[0].id);
    expect(back.view()).toEqual(seen);
  });

  it('caps the room at MAX_PLAYERS players plus one screen', () => {
    expect(MAX_PLAYERS).toBe(30);
    const h = createHarness();
    const screen = h.join('TV', { role: 'screen' });
    h.send(screen, { type: 'host', cmd: { type: 'addBots', count: MAX_PLAYERS } });
    expect(h.lobby().players).toHaveLength(MAX_PLAYERS);
    const late = h.join('Late');
    expect(late.last('error')?.code).toBe('room_full');
    const tv2 = h.join('TV2', { role: 'screen' });
    expect(tv2.last('error')?.code).toBe('screen_taken');
  });

  it('sanitizes and de-duplicates names', () => {
    const h = createHarness();
    const a = h.join('  Ann   Lee  ');
    const b = h.join('ann lee');
    const names = h.lobby().players.map((p) => p.name);
    expect(names).toEqual(['Ann Lee', 'ann lee 2']);
    expect(a.id).not.toBe(b.id);
  });
});

describe('host controls', () => {
  it('first player is host in host-player mode; others cannot use host commands', () => {
    const { h, host, rest } = hostPlayerRoom(2);
    expect(h.lobby().mode).toBe('hostPlayer');
    expect(h.lobby().host).toEqual({ kind: 'player', id: host.id });
    h.send(rest[0], { type: 'host', cmd: { type: 'start' } });
    expect(rest[0].last('error')?.code).toBe('not_host');
    expect(h.lobby().phase).toBe('lobby');
  });

  it('screen holds host controls in screen mode', () => {
    const h = createHarness();
    const tv = h.join('TV', { role: 'screen' });
    const p = h.join('Pat');
    expect(h.lobby().mode).toBe('screen');
    expect(h.lobby().host).toEqual({ kind: 'screen' });
    h.send(p, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
    expect(p.last('error')?.code).toBe('not_host');
    h.send(tv, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
    expect(h.lobby().selectedGameId).toBe(GAME);
  });

  it('host passes to the next connected player after the grace period', () => {
    const { h, host, rest } = hostPlayerRoom(2);
    host.disconnect();
    expect(h.lobby().host).toEqual({ kind: 'player', id: host.id });
    h.clock.advance(LEAVE_GRACE_MS - 1);
    h.room.fireDueTimers();
    expect(h.lobby().host).toEqual({ kind: 'player', id: host.id });
    h.clock.advance(1);
    h.room.fireDueTimers();
    expect(h.lobby().host).toEqual({ kind: 'player', id: rest[0].id });
    // Reconnecting does not take host back.
    h.join('Host', { token: host.welcome()!.token });
    expect(h.lobby().host).toEqual({ kind: 'player', id: rest[0].id });
  });

  it('host passes immediately when the host leaves, skipping disconnected players', () => {
    const { h, host, rest } = hostPlayerRoom(2);
    rest[0].disconnect();
    h.send(host, { type: 'leave' });
    expect(h.lobby().host).toEqual({ kind: 'player', id: rest[1].id });
    expect(h.lobby().players.find((p) => p.id === host.id)).toBeUndefined();
  });

  it('kick removes the seat and invalidates the token', () => {
    const { h, host, rest } = hostPlayerRoom(2);
    const victim = rest[1];
    const token = victim.welcome()!.token;
    h.send(host, { type: 'host', cmd: { type: 'kick', playerId: victim.id } });
    expect(victim.last('error')?.code).toBe('kicked');
    expect(victim.closed).toBe(true);
    expect(h.lobby().players.map((p) => p.id)).not.toContain(victim.id);
    const back = h.join('Sneaky', { token });
    expect(back.id).not.toBe(victim.id);
    // Host cannot kick themself.
    h.send(host, { type: 'host', cmd: { type: 'kick', playerId: host.id } });
    expect(host.last('error')?.code).toBe('bad_command');
  });

  it('kicking a player mid-game does not stall the game', () => {
    const { h, host, rest } = hostPlayerRoom(2);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    h.step();
    h.send(host, { type: 'host', cmd: { type: 'kick', playerId: rest[0].id } });
    h.runUntil(() => h.lobby().phase === 'results');
  });

  it('start enforces min players and a selected game', () => {
    const h = createHarness();
    const host = h.join('Solo');
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect(host.last('error')?.code).toBe('bad_command');
    h.send(host, { type: 'host', cmd: { type: 'selectGame', gameId: 'nope' } });
    expect(host.last('error')?.code).toBe('bad_command');
    h.send(host, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect(host.last('error')?.code).toBe('bad_command'); // 1 < minPlayers
    expect(h.lobby().phase).toBe('lobby');
  });

  it('return to lobby ends the game, clears views and timers', () => {
    const { h, host, rest } = hostPlayerRoom(2);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect(h.lobby().phase).toBe('playing');
    expect(rest[0].view()).not.toBeNull();
    h.send(host, { type: 'host', cmd: { type: 'returnToLobby' } });
    expect(h.lobby().phase).toBe('lobby');
    expect(h.lobby().currentGameId).toBeNull();
    expect(rest[0].view()).toBeNull();
    expect(h.room.nextAlarmAt()).toBeNull();
    // Can start again.
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect(h.lobby().phase).toBe('playing');
  });

  it('skip fires the next game timer early', () => {
    const { h, host } = hostPlayerRoom(2);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect((host.view() as { phase: string }).phase).toBe('wait');
    h.send(host, { type: 'host', cmd: { type: 'skip' } });
    expect((host.view() as { phase: string }).phase).toBe('go');
  });

  it('bots are dev-only', () => {
    const h = createHarness({ dev: false });
    const host = h.join('Host');
    h.send(host, { type: 'host', cmd: { type: 'addBots', count: 2 } });
    expect(host.last('error')?.code).toBe('bad_command');
    expect(h.lobby().players).toHaveLength(1);
    expect(h.lobby().games.some((g) => g.id === GAME)).toBe(false); // hidden game
  });
});

describe('input validation', () => {
  it('rejects bad input with errors and never throws', () => {
    const h = createHarness();
    const c = h.connect();
    const bad: unknown[] = [
      'not json',
      '{"type":"nope"}',
      'x'.repeat(MAX_MESSAGE_BYTES + 1),
      42,
      null,
      undefined,
      { type: 'action', payload: { type: 'tap' } }, // before hello
      { type: 'hello', code: h.code, name: '', role: 'player' },
      { type: 'hello', code: h.code, name: 'x'.repeat(100), role: 'player' },
      { type: 'hello', code: h.code, name: 'Ok', role: 'god' },
      { type: 'hello', code: h.code, name: 'Ok', role: 'player', token: 'x'.repeat(500) },
      '{"__proto__":{"polluted":true}}',
    ];
    for (const m of bad) expect(() => h.room.handleMessage(c.connId, m)).not.toThrow();
    expect(c.all('error')).toHaveLength(bad.length);
    expect(c.last('welcome')).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('invalid actions are rejected and leave the game untouched', () => {
    const { h, host, rest } = hostPlayerRoom(1);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    const snap = JSON.stringify(h.room.snapshot().game);
    const viewsBefore = rest[0].all('view').length;
    for (const payload of [{ type: 'explode' }, 'tap', null, { type: 'tap', extra: 'x'.repeat(10) }]) {
      h.send(rest[0], { type: 'action', payload });
    }
    expect(rest[0].all('error').length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(h.room.snapshot().game)).toBe(snap);
    expect(rest[0].all('view').length).toBe(viewsBefore);
  });

  it('answers ping and only re-sends views that changed', () => {
    const { h, host } = hostPlayerRoom(1);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    const n = host.all('view').length;
    h.send(host, { type: 'ping', c: 123 });
    expect(host.last('pong')).toMatchObject({ c: 123, s: h.clock.now() });
    expect(host.all('view').length).toBe(n);
  });
});

describe('assets', () => {
  it('stores content-addressed assets and serves them on request', () => {
    const h = createHarness();
    const host = h.join('Host');
    const id1 = h.room.putAsset({ strokes: [[1, 2, 3]] });
    const id2 = h.room.putAsset({ strokes: [[1, 2, 3]] });
    expect(id1).toBe(id2);
    expect(h.room.drainNewAssets()).toEqual([[id1, { strokes: [[1, 2, 3]] }]]);
    expect(h.room.drainNewAssets()).toEqual([]);
    h.send(host, { type: 'assetReq', ids: [id1, 'missing'] });
    expect(host.last('assets')?.items).toEqual({ [id1]: { strokes: [[1, 2, 3]] } });
  });
});

describe('snapshot / restore', () => {
  it('round-trips mid-game state and timers, then plays on identically', () => {
    const a = createHarness({ seed: 5 });
    const tv = a.join('TV', { role: 'screen' });
    a.send(tv, { type: 'host', cmd: { type: 'addBots', count: 4 } });
    a.send(tv, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
    a.send(tv, { type: 'host', cmd: { type: 'start' } });
    for (let i = 0; i < 6; i++) a.step();

    const snap = JSON.parse(JSON.stringify(a.room.snapshot()));
    const b = createHarness({ seed: 999, now: a.clock.now() });
    b.room = Room.restore(snap, b.deps);
    expect(b.room.snapshot()).toEqual(a.room.snapshot());
    expect(b.room.nextAlarmAt()).toBe(a.room.nextAlarmAt());

    a.runUntil(() => a.room.getLobby().phase === 'results');
    b.runUntil(() => b.room.getLobby().phase === 'results');
    expect(b.room.getLobby().lastResult).toEqual(a.room.getLobby().lastResult);
  });

  it('re-attached connections keep their identity after restore', () => {
    const { h, host } = hostPlayerRoom(1);
    h.restart();
    h.send(host, { type: 'ping', c: 1 });
    expect(host.last('pong')).toBeDefined();
    expect(h.room.identity(host.connId)).toEqual({ kind: 'player', id: host.id });
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect(h.lobby().phase).toBe('playing');
  });

  it('bumps the version on state changes but not on pings', () => {
    const { h, host } = hostPlayerRoom(1);
    const v = h.room.version;
    h.send(host, { type: 'ping', c: 1 });
    expect(h.room.version).toBe(v);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect(h.room.version).toBeGreaterThan(v);
  });
});

describe('review fixes (U4)', () => {
  it('a seat whose socket died during eviction still times out after restore', () => {
    const { h, host, rest } = hostPlayerRoom(2);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    // Eviction: the socket is gone but no close event ever reached the room.
    host.closed = true;
    h.restart();
    h.clock.advance(LEAVE_GRACE_MS);
    h.room.fireDueTimers();
    expect(h.lobby().host).toEqual({ kind: 'player', id: rest[0].id });
    h.runUntil(() => h.lobby().phase === 'results');
  });

  it('a game whose setup throws goes back to the lobby instead of a dead game', () => {
    const broken = { ...tapDuel, setup: () => { throw new Error('boom'); } } as AnyGame;
    const h = createHarness({ games: { [GAME]: broken }, strict: false });
    const host = h.join('Host');
    h.join('P1');
    h.send(host, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect(host.last('error')?.code).toBe('bad_command');
    expect(h.lobby().phase).toBe('lobby');
    expect(h.lobby().currentGameId).toBeNull();
  });

  it('a view that cannot be serialized does not throw out of the engine', () => {
    const bad = { ...tapDuel, view: () => ({ n: BigInt(1) }) } as AnyGame;
    const h = createHarness({ games: { [GAME]: bad }, strict: false });
    const host = h.join('Host');
    h.join('P1');
    h.send(host, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
    expect(() => h.send(host, { type: 'host', cmd: { type: 'start' } })).not.toThrow();
    expect(host.view()).toBeNull();
  });

  it('asset replies are split under the per-message cap and always answered', () => {
    const h = createHarness();
    const c = h.join('Host');
    const big = 'x'.repeat(100_000);
    const ids = [1, 2, 3, 4, 5].map((i) => h.room.putAsset({ i, big }));
    h.send(c, { type: 'assetReq', ids });
    const msgs = c.all('assets');
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(JSON.stringify(m).length).toBeLessThan(MAX_ASSETS_MSG_BYTES + 120_000);
    expect(msgs.flatMap((m) => Object.keys(m.items)).sort()).toEqual([...ids].sort());
    h.send(c, { type: 'assetReq', ids: ['missing'] });
    expect(c.last('assets')?.items).toEqual({});
  });

  it('a player who left cannot act until they return', () => {
    const { h, host, rest } = hostPlayerRoom(2);
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    rest[0].disconnect();
    h.clock.advance(LEAVE_GRACE_MS);
    h.room.fireDueTimers();
    expect(h.room.runAction(rest[0].id, { type: 'tap' })).toMatch(/not in a running game/);
  });
});

describe('testkit leak helpers', () => {
  it('recordViews captures every viewer at every phase, findLeaks flags secrets', () => {
    const { records, report } = recordViews<TapState>(tapDuel, { players: 3, seed: 1, screen: true });
    const keys = new Set(records.map((r) => r.viewerKey));
    expect(keys).toEqual(new Set([...report.playerIds, 'screen']));
    const phases = new Set(records.map((r) => (r.view as { phase: string }).phase));
    expect(phases).toEqual(new Set(['wait', 'go', 'reveal', 'done']));
    // Nothing secret in Tap Duel: a lockout is only shown to the locked-out player.
    expect(findLeaks(records, () => ({ exact: ['p999'], text: ['token-'] }))).toEqual([]);
    // The helper does find a planted "secret".
    const p1 = report.playerIds[0];
    expect(findLeaks(records, (r) => (r.viewerKey === 'screen' ? { exact: [p1], text: ['REVEAL'] } : null)).length).toBeGreaterThan(0);
  });
});

describe('game settings', () => {
  const fieldOf = (key: string) => tapDuel.settingsFields!.find((f) => f.key === key)!;

  it('the lobby lists the selected game\'s fields and values, defaults first', () => {
    const { h } = hostPlayerRoom(1);
    const s = h.lobby().settings!;
    expect(s.gameId).toBe(GAME);
    expect(s.fields.map((f) => f.key)).toEqual(['rounds']);
    expect(s.values).toEqual({ rounds: 3 });
  });

  it('setSetting is host-only, validated and clamped to the field', () => {
    const { h, host, rest } = hostPlayerRoom(1);
    h.send(rest[0], { type: 'host', cmd: { type: 'setSetting', key: 'rounds', value: 5 } });
    expect(rest[0].last('error')?.code).toBe('not_host');
    h.send(host, { type: 'host', cmd: { type: 'setSetting', key: 'nope', value: 5 } });
    expect(host.last('error')?.code).toBe('bad_command');
    h.send(host, { type: 'host', cmd: { type: 'setSetting', key: 'rounds', value: 99 } });
    expect(h.lobby().settings!.values.rounds).toBe(fieldOf('rounds').max);
    h.send(host, { type: 'host', cmd: { type: 'setSetting', key: 'rounds', value: 2.4 } });
    expect(h.lobby().settings!.values.rounds).toBe(2);
  });

  it('the game starts with the host\'s picks, and the picks survive a restore and a new game', () => {
    const { h, host } = hostPlayerRoom(1);
    h.send(host, { type: 'host', cmd: { type: 'setSetting', key: 'rounds', value: 5 } });
    h.restart();
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect((h.room.snapshot().game!.state as TapState).rounds).toBe(5);
    h.send(host, { type: 'host', cmd: { type: 'setSetting', key: 'rounds', value: 1 } });
    expect(host.last('error')?.code).toBe('bad_command'); // not while a game is running
    h.send(host, { type: 'host', cmd: { type: 'returnToLobby' } });
    expect(h.lobby().settings!.values.rounds).toBe(5);
  });
});


// ---- the room holds 30; each game keeps its own cap; the rest spectate ----

/** WCAG relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Perceptual distance (OKLab) between two seat colors. */
function okDistance(a: string, b: string): number {
  const lab = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c: number) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const [r, g, bl] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Screen + `n` human players (joined in order p1..pn; p1 is first seat) with the 20-cap template selected. */
function bigRoom(n: number) {
  const h = createHarness();
  const tv = h.join('TV', { role: 'screen' });
  const players = Array.from({ length: n }, (_, i) => h.join(`Player ${i + 1}`));
  h.send(tv, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
  return { h, tv, players };
}

describe('30 players in the room', () => {
  it('has a seat color for every seat: distinct, readable on the night background, with readable initials', () => {
    expect(PLAYER_COLORS.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
    expect(new Set(PLAYER_COLORS).size).toBe(PLAYER_COLORS.length);
    for (const c of PLAYER_COLORS) {
      expect(contrast(c, '#1a1033'), `${c} on the night background`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c, inkOn(c)), `initial on ${c}`).toBeGreaterThanOrEqual(4.5);
    }
    for (let i = 0; i < MAX_PLAYERS; i++)
      for (let j = i + 1; j < MAX_PLAYERS; j++)
        expect(okDistance(PLAYER_COLORS[i], PLAYER_COLORS[j]), `${PLAYER_COLORS[i]} vs ${PLAYER_COLORS[j]}`).toBeGreaterThan(0.08);
  });

  it('30 players get 30 distinct colors', () => {
    const { h } = bigRoom(MAX_PLAYERS);
    const colors = h.lobby().players.map((p) => p.color);
    expect(colors).toHaveLength(30);
    expect(new Set(colors).size).toBe(30);
  });

  it('the lobby message at 30 players with a finished game stays well under the message cap', () => {
    const { h, players } = bigRoom(MAX_PLAYERS);
    h.room.runHostCommand({ type: 'start' });
    h.runUntil(() => h.lobby().phase === 'results');
    const bytes = JSON.stringify(h.room.getLobby()).length;
    expect(bytes).toBeLessThan(MAX_MESSAGE_BYTES / 4);
  });

  it('starting a 20-cap game seats exactly 20 (the host-player included); the other 10 spectate', () => {
    const cap = tapDuel.manifest.maxPlayers;
    const h = createHarness();
    const host = h.join('Host');
    const rest = Array.from({ length: 29 }, (_, i) => h.join(`P${i + 1}`));
    h.send(host, { type: 'host', cmd: { type: 'selectGame', gameId: GAME } });
    h.send(host, { type: 'host', cmd: { type: 'start' } });
    expect(host.last('error')).toBeUndefined();
    const lobby = h.lobby();
    expect(lobby.phase).toBe('playing');
    expect(lobby.players).toHaveLength(30);
    expect(lobby.inGame).toHaveLength(cap);
    expect(lobby.inGame).toContain(host.id);
    expect(lobby.inGame).toEqual(lobby.players.slice(0, cap).map((p) => p.id)); // seat order
    h.step();
    h.step();
    for (const c of [host, ...rest.slice(0, cap - 1)]) expect(c.view(), c.id).not.toBeNull();
    for (const c of rest.slice(cap - 1)) {
      expect(c.view(), c.id).toBeNull();
      expect(c.last('error')).toBeUndefined();
      h.send(c, { type: 'action', payload: { type: 'tap' } });
      expect(c.last('error')?.code).toBe('not_in_game');
    }
  });

  it('away players do not take a seat from present ones; disconnected-in-grace ones come last', () => {
    const { h, players } = bigRoom(22);
    const cap = tapDuel.manifest.maxPlayers;
    // p2 is gone for good; p3's socket just dropped (still inside the grace period)
    players[1].disconnect();
    h.clock.advance(LEAVE_GRACE_MS + 1);
    h.room.fireDueTimers();
    players[2].disconnect();
    h.room.runHostCommand({ type: 'start' });
    const seated = h.lobby().inGame;
    expect(seated).toHaveLength(cap);
    expect(seated).not.toContain(players[1].id);
    expect(seated).not.toContain(players[2].id);
    expect(seated).toContain(players[20].id); // late seats that would have missed out in plain order
    expect(seated).toContain(players[21].id);
  });

  it('after the game everyone is back for the next one: spectators get the seats the first group gives up', () => {
    const { h, players } = bigRoom(MAX_PLAYERS);
    h.room.runHostCommand({ type: 'start' });
    const first = h.lobby().inGame;
    const watchers = h.lobby().players.map((p) => p.id).filter((id) => !first.includes(id));
    expect(watchers).toHaveLength(10);
    h.runUntil(() => h.lobby().phase === 'results');
    const ranked = h.lobby().lastResult!.ranking;
    expect(ranked.sort()).toEqual([...first].sort()); // spectators are not in the result
    h.room.runHostCommand({ type: 'returnToLobby' });
    expect(h.lobby().inGame).toEqual([]);
    expect(h.lobby().players).toHaveLength(30);
    // the first 12 players leave for good
    for (const c of players.slice(0, 12)) {
      c.disconnect();
    }
    h.clock.advance(LEAVE_GRACE_MS + 1);
    h.room.fireDueTimers();
    h.room.runHostCommand({ type: 'start' });
    const second = h.lobby().inGame;
    expect(second).toHaveLength(18);
    for (const id of watchers) expect(second).toContain(id);
  });
});

describe('planSeats', () => {
  const mk = (id: string, o: Partial<{ isBot: boolean; isHost: boolean; connected: boolean; away: boolean }> = {}) => ({
    id,
    isBot: false,
    isHost: false,
    connected: true,
    away: false,
    ...o,
  });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it('seats everyone, in seat order, when the game fits', () => {
    const ps = [mk('a'), mk('b'), mk('c')];
    const plan = planSeats(ps, 5);
    expect(ids(plan.seated)).toEqual(['a', 'b', 'c']);
    expect(plan.watching).toEqual([]);
  });

  it('keeps the host-player seated even at the end of the seat order', () => {
    const ps = [mk('a'), mk('b'), mk('c'), mk('d', { isHost: true })];
    const plan = planSeats(ps, 2);
    expect(ids(plan.seated)).toEqual(['a', 'd']);
    expect(ids(plan.watching)).toEqual(['b', 'c']);
  });

  it('prefers connected humans, then bots, then players in their grace period; never the away', () => {
    const ps = [
      mk('away', { away: true, connected: false }),
      mk('grace', { connected: false }),
      mk('bot', { isBot: true }),
      mk('h1'),
      mk('h2'),
    ];
    expect(ids(planSeats(ps, 2).seated)).toEqual(['h1', 'h2']);
    expect(ids(planSeats(ps, 3).seated)).toEqual(['bot', 'h1', 'h2']);
    expect(ids(planSeats(ps, 4).seated)).toEqual(['grace', 'bot', 'h1', 'h2']);
    expect(ids(planSeats(ps, 9).watching)).toEqual([]);
  });
});
