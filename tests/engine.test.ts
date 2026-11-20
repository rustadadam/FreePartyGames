import { describe, expect, it } from 'vitest';
import { createHarness } from '../src/core/testkit';
import { Room, LEAVE_GRACE_MS, MAX_PLAYERS } from '../src/core/engine';
import { CODE_ALPHABET, generateCode, isValidCode, normalizeCode } from '../src/shared/roomCode';
import { MAX_MESSAGE_BYTES } from '../src/shared/protocol';
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
