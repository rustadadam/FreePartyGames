// Pure test helpers shared by tests/*, per-game tests and scripts/smoke.ts.
// A fake clock + in-memory sockets around a Room, and simulateGame() to drive any
// GameDefinition with bots while asserting the contract.
import type { HostCmd, ServerMsg, ServerMsgOf } from '../shared/protocol';
import { MAX_VIEW_BYTES } from '../shared/protocol';
import type { GameResult, Lobby, Viewer } from '../shared/types';
import { serverGames } from '../games/registry.server';
import { Room, type RoomDeps } from './engine';
import type { AnyGame, GameRegistry } from './game';

export class FakeClock {
  constructor(public t = 1_000_000) {}
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

export interface TestClient {
  connId: string;
  /** Player id after a successful player hello ('' otherwise). */
  id: string;
  messages: ServerMsg[];
  closed: boolean;
  last<T extends ServerMsg['type']>(type: T): ServerMsgOf<T> | undefined;
  all<T extends ServerMsg['type']>(type: T): ServerMsgOf<T>[];
  welcome(): ServerMsgOf<'welcome'> | undefined;
  /** Latest game view received (null when none). */
  view(): unknown;
  /** Closes the socket (room.disconnect). */
  disconnect(): void;
}

export interface HarnessOptions {
  games?: GameRegistry;
  seed?: number;
  /** Default true (bots allowed, hidden games listed). */
  dev?: boolean;
  code?: string;
  /** Default true: game code errors propagate. */
  strict?: boolean;
  /** Start time for the fake clock. */
  now?: number;
}

export class RoomHarness {
  readonly clock: FakeClock;
  readonly deps: RoomDeps;
  readonly code: string;
  room: Room;
  private readonly clients = new Map<string, TestClient>();
  private readonly storedAssets = new Map<string, unknown>();
  private nextConn = 1;

  constructor(opts: HarnessOptions = {}) {
    this.clock = new FakeClock(opts.now);
    this.code = opts.code ?? 'TEST';
    let tokens = 0;
    this.deps = {
      code: this.code,
      games: opts.games ?? serverGames,
      now: this.clock.now,
      dev: opts.dev ?? true,
      seed: opts.seed ?? 1,
      strict: opts.strict ?? true,
      makeToken: () => `token-${++tokens}`,
      send: (connId, msg) => {
        // Round-trip through JSON like a real socket would.
        this.clients.get(connId)?.messages.push(JSON.parse(JSON.stringify(msg)) as ServerMsg);
      },
      close: (connId) => {
        const c = this.clients.get(connId);
        if (c) c.closed = true;
      },
    };
    this.room = new Room(this.deps);
  }

  /** Opens a socket without saying hello. */
  connect(): TestClient {
    const connId = `c${this.nextConn++}`;
    const client: TestClient = {
      connId,
      id: '',
      messages: [],
      closed: false,
      last: (type) => client.all(type).at(-1),
      all: <T extends ServerMsg['type']>(type: T) =>
        client.messages.filter((m): m is ServerMsgOf<T> => m.type === type),
      welcome: () => client.last('welcome'),
      view: () => client.last('view')?.gameView ?? null,
      disconnect: () => {
        client.closed = true;
        this.room.disconnect(connId);
      },
    };
    this.clients.set(connId, client);
    return client;
  }

  /** Connects and says hello. Check `client.last('error')` for refusals. */
  join(name: string, opts: { role?: 'player' | 'screen'; token?: string } = {}): TestClient {
    const client = this.connect();
    this.send(client, { type: 'hello', code: this.code, name, role: opts.role ?? 'player', token: opts.token });
    const you = client.welcome()?.you;
    if (you?.kind === 'player') client.id = you.id;
    return client;
  }

  send(client: TestClient, msg: unknown): void {
    this.room.handleMessage(client.connId, JSON.stringify(msg));
  }

  lobby(): Lobby {
    return this.room.getLobby();
  }

  /** Advances the clock to the next timer and fires it. False when no timer is pending. */
  step(): boolean {
    const at = this.room.nextAlarmAt();
    if (at === null) return false;
    this.clock.t = Math.max(this.clock.t, at);
    this.room.fireDueTimers();
    return true;
  }

  /** Steps until `done()` is true. Throws on stall (no timers) or after `maxSteps`. Returns steps taken. */
  runUntil(done: () => boolean, maxSteps = 50_000): number {
    for (let i = 0; i <= maxSteps; i++) {
      if (done()) return i;
      if (!this.step()) throw new Error(`stalled after ${i} steps: no pending timers`);
    }
    throw new Error(`step cap ${maxSteps} reached`);
  }

  /** Simulates hibernation: snapshot -> JSON -> Room.restore, assets reloaded, sockets re-attached. */
  restart(): void {
    for (const [id, data] of this.room.drainNewAssets()) this.storedAssets.set(id, data);
    const identities: Array<[string, Viewer]> = [];
    for (const c of this.clients.values()) {
      const who = this.room.identity(c.connId);
      if (who && !c.closed) identities.push([c.connId, who]);
    }
    const snap = JSON.parse(JSON.stringify(this.room.snapshot()));
    this.room = Room.restore(snap, this.deps, this.storedAssets);
    for (const [connId, who] of identities) this.room.attach(connId, who);
  }
}

export function createHarness(opts?: HarnessOptions): RoomHarness {
  return new RoomHarness(opts);
}

/** Throws unless `value` is plain JSON data (no undefined in arrays, NaN, functions, Map, class instances...). */
export function assertJsonSafe(value: unknown, path = '$'): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}: non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      if (v === undefined) throw new Error(`${path}[${i}]: undefined in array`);
      assertJsonSafe(v, `${path}[${i}]`);
    });
    return;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error(`${path}: not a plain object`);
    for (const [k, v] of Object.entries(value)) if (v !== undefined) assertJsonSafe(v, `${path}.${k}`);
    return;
  }
  throw new Error(`${path}: ${typeof value} is not JSON data`);
}

export interface SimulateOptions {
  players: number;
  seed: number;
  /** Connect a screen (screen mode). Without it no device is connected and only bots look at views. */
  screen?: boolean;
  maxSteps?: number;
  /** Snapshot/restore the room every N steps (hibernation). */
  restoreEvery?: number;
  /** Kick one bot at this step to exercise onPlayerLeave. */
  dropPlayerAtStep?: number;
}

export interface SimulateReport {
  /** The game's own result() value. */
  result: GameResult;
  playerIds: string[];
  steps: number;
  /** Actions that reached onAction. */
  actions: number;
  views: number;
  maxViewBytes: number;
  harness: RoomHarness;
}

/** Wraps a game so every view and action is checked against the contract. */
function contractSpy(def: AnyGame, stats: { actions: number; views: number; maxViewBytes: number; result: GameResult | null }): AnyGame {
  return {
    ...def,
    onAction(state, ctx, playerId, action) {
      const ok = def.actionSchema.safeParse(action);
      if (!ok.success) throw new Error(`action reached onAction without passing actionSchema: ${JSON.stringify(action)}`);
      stats.actions++;
      def.onAction(state, ctx, playerId, action);
    },
    view(state, viewer) {
      const v = def.view(state, viewer);
      assertJsonSafe(v, `view(${JSON.stringify(viewer)})`);
      const bytes = JSON.stringify(v ?? null).length;
      if (bytes > MAX_VIEW_BYTES) throw new Error(`view is ${bytes} bytes (cap ${MAX_VIEW_BYTES})`);
      stats.views++;
      stats.maxViewBytes = Math.max(stats.maxViewBytes, bytes);
      return v;
    },
    result(state) {
      const r = def.result(state);
      if (r) stats.result = r;
      return r;
    },
  };
}

/** Plays `def` with bots to result() on a fake clock, asserting the contract. Throws on any violation. */
export function simulateGame(def: AnyGame, opts: SimulateOptions): SimulateReport {
  const stats = { actions: 0, views: 0, maxViewBytes: 0, result: null as GameResult | null };
  const id = def.manifest.id;
  const h = createHarness({ games: { [id]: contractSpy(def, stats) }, seed: opts.seed, dev: true, strict: true });
  const maxSteps = opts.maxSteps ?? 50_000;
  const cmd = (c: HostCmd) => {
    const err = h.room.runHostCommand(c);
    if (err) throw new Error(`${c.type}: ${err}`);
  };
  if (opts.screen) {
    const screen = h.join('Screen', { role: 'screen' });
    if (!screen.welcome()) throw new Error('screen could not join');
  }
  cmd({ type: 'addBots', count: opts.players });
  cmd({ type: 'selectGame', gameId: id });
  cmd({ type: 'start' });
  const playerIds = [...h.lobby().inGame];

  let steps = 0;
  while (h.lobby().phase !== 'results') {
    if (steps >= maxSteps) throw new Error(`${id}: no result within ${maxSteps} steps`);
    if (opts.restoreEvery && steps > 0 && steps % opts.restoreEvery === 0) h.restart();
    if (opts.dropPlayerAtStep === steps) {
      const victim = h.lobby().players.filter((p) => playerIds.includes(p.id)).at(-1);
      if (victim) cmd({ type: 'kick', playerId: victim.id });
    }
    if (h.lobby().phase === 'results') break;
    if (!h.step()) throw new Error(`${id}: stalled after ${steps} steps with no pending timers`);
    steps++;
  }
  const game = h.room.snapshot().game;
  assertJsonSafe(game?.state, `${id} state`);
  if (!stats.result) throw new Error(`${id}: finished without a result`);
  return { result: stats.result, playerIds, steps, actions: stats.actions, views: stats.views, maxViewBytes: stats.maxViewBytes, harness: h };
}
