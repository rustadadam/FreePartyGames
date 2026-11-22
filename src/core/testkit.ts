// Pure test helpers shared by tests/*, per-game tests and scripts/smoke.ts.
// A fake clock + in-memory sockets around a Room, and simulateGame() to drive any
// GameDefinition with bots while asserting the contract.
import type { HostCmd, ServerMsg, ServerMsgOf } from '../shared/protocol';
import { MAX_VIEW_BYTES } from '../shared/protocol';
import type { GameResult, Lobby, Viewer } from '../shared/types';
import { serverGames } from '../games/registry.server';
import { Room, type RoomDeps } from './engine';
import { Rng } from './rng';
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
    this.room.reconcileConnections();
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
  /** Bots never act (AFK humans): the game must still reach a result through its own timers. */
  idleBots?: boolean;
  /**
   * After every step, replay a random earlier valid action as a random seated player (stale
   * or out-of-turn input, e.g. a vote arriving after the phase moved on). The game must ignore
   * or handle it without throwing, and still finish.
   */
  staleActions?: boolean;
  /** Before the start, set every settings field of the game to its smallest or largest value (via the host command). */
  settings?: 'min' | 'max';
  /** Called with every view computed for every viewer (see recordViews). */
  onView?(record: ViewRecord): void;
}

/** One projected view, as recorded by recordViews / SimulateOptions.onView. */
export interface ViewRecord<S = unknown> {
  /** Simulation step the view was computed at (0 = right after start). */
  step: number;
  viewer: Viewer;
  /** 'screen' or the player id. */
  viewerKey: string;
  view: unknown;
  /** JSON of the view. */
  json: string;
  /** Deep copy of the full game state the view was projected from: use it to know the secret. */
  state: S;
}

export interface SimulateReport {
  /** The game's own result() value. */
  result: GameResult;
  playerIds: string[];
  steps: number;
  /** Actions that reached onAction. */
  actions: number;
  /** Distinct players whose actions reached onAction. */
  actors: number;
  views: number;
  maxViewBytes: number;
  harness: RoomHarness;
}

/** Wraps a game so every view and action is checked against the contract. */
interface SpyStats {
  actions: number;
  actors: Set<string>;
  /** Valid actions seen, for stale replays. */
  seen: unknown[];
  views: number;
  maxViewBytes: number;
  result: GameResult | null;
  step: number;
  onView?: (r: ViewRecord) => void;
}

function contractSpy(def: AnyGame, stats: SpyStats, idleBots: boolean): AnyGame {
  return {
    ...def,
    onAction(state, ctx, playerId, action) {
      const ok = def.actionSchema.safeParse(action);
      if (!ok.success) throw new Error(`action reached onAction without passing actionSchema: ${JSON.stringify(action)}`);
      stats.actions++;
      stats.actors.add(playerId);
      if (stats.seen.length < 200) stats.seen.push(structuredClone(action));
      def.onAction(state, ctx, playerId, action);
    },
    view(state, viewer) {
      const v = def.view(state, viewer);
      assertJsonSafe(v, `view(${JSON.stringify(viewer)})`);
      const json = JSON.stringify(v ?? null);
      const bytes = json.length;
      if (bytes > MAX_VIEW_BYTES) throw new Error(`view is ${bytes} bytes (cap ${MAX_VIEW_BYTES})`);
      stats.views++;
      stats.maxViewBytes = Math.max(stats.maxViewBytes, bytes);
      stats.onView?.({
        step: stats.step,
        viewer,
        viewerKey: viewer.kind === 'screen' ? 'screen' : viewer.id,
        view: JSON.parse(json),
        json,
        state: structuredClone(state),
      });
      return v;
    },
    bot: idleBots ? { act: () => null } : def.bot,
    result(state) {
      const r = def.result(state);
      if (r) stats.result = r;
      return r;
    },
  };
}

/** Plays `def` with bots to result() on a fake clock, asserting the contract. Throws on any violation. */
export function simulateGame(def: AnyGame, opts: SimulateOptions): SimulateReport {
  const stats: SpyStats = { actions: 0, actors: new Set(), seen: [], views: 0, maxViewBytes: 0, result: null, step: 0, onView: opts.onView };
  const id = def.manifest.id;
  const spy = contractSpy(def, stats, !!opts.idleBots);
  const h = createHarness({ games: { [id]: spy }, seed: opts.seed, dev: true, strict: true });
  const fuzz = new Rng((opts.seed ^ 0x5bd1e995) >>> 0);
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
  if (opts.settings) {
    for (const f of def.settingsFields ?? []) cmd({ type: 'setSetting', key: f.key, value: opts.settings === 'min' ? f.min : f.max });
  }
  cmd({ type: 'start' });
  const playerIds = [...h.lobby().inGame];
  const viewers: Viewer[] = [...playerIds.map((p): Viewer => ({ kind: 'player', id: p })), ...(opts.screen ? [{ kind: 'screen' } as Viewer] : [])];
  /** Every viewer's current view JSON (null outside a running/finished game). */
  const allViews = (): string[] => {
    const state = h.room.snapshot().game?.state;
    return viewers.map((v) => (state === undefined ? 'null' : JSON.stringify(spy.view(state, v) ?? null)));
  };
  if (opts.onView) allViews();

  let steps = 0;
  while (h.lobby().phase !== 'results') {
    if (steps >= maxSteps) throw new Error(`${id}: no result within ${maxSteps} steps`);
    if (opts.restoreEvery && steps > 0 && steps % opts.restoreEvery === 0) {
      assertJsonSafe(h.room.snapshot().game?.state, `${id} state before restore`);
      const before = allViews();
      h.restart();
      const after = allViews();
      for (let i = 0; i < viewers.length; i++) {
        if (before[i] !== after[i]) throw new Error(`${id}: view for ${JSON.stringify(viewers[i])} changed across snapshot/restore`);
      }
    }
    if (opts.dropPlayerAtStep === steps) {
      const victim = h.lobby().players.filter((p) => playerIds.includes(p.id)).at(-1);
      if (victim) cmd({ type: 'kick', playerId: victim.id });
    }
    if (h.lobby().phase === 'results') break;
    if (!h.step()) throw new Error(`${id}: stalled after ${steps} steps with no pending timers`);
    steps++;
    stats.step = steps;
    if (opts.staleActions && stats.seen.length && h.lobby().phase === 'playing') {
      const seated = h.lobby().inGame.filter((p) => h.lobby().players.some((q) => q.id === p));
      if (seated.length) h.room.runAction(fuzz.pick(seated), structuredClone(fuzz.pick(stats.seen)));
    }
    if (opts.onView) allViews();
  }
  const game = h.room.snapshot().game;
  assertJsonSafe(game?.state, `${id} state`);
  if (!stats.result) throw new Error(`${id}: finished without a result`);
  if (opts.onView) allViews(); // the final (results-phase) views too
  return {
    result: stats.result,
    playerIds,
    steps,
    actions: stats.actions,
    actors: stats.actors.size,
    views: stats.views,
    maxViewBytes: stats.maxViewBytes,
    harness: h,
  };
}

/**
 * Plays `def` like simulateGame and records every view every viewer (each player and, with
 * `screen`, the screen) was shown, after start, after every step, and at the end, deduplicated
 * per viewer. Each record carries a deep copy of the game state it was projected from, so a
 * secret-leak test can read the truth from `state` and check the `view`:
 *
 *   const { records } = recordViews(forgery, { players: 6, seed: 1, screen: true });
 *   const leaks = findLeaks(records, (r) =>
 *     r.viewerKey === (r.state as S).forger ? { text: [(r.state as S).word] } : null);
 *   expect(leaks).toEqual([]);
 */
export function recordViews<S = unknown>(def: AnyGame, opts: Omit<SimulateOptions, 'onView'>): { records: ViewRecord<S>[]; report: SimulateReport } {
  const records: ViewRecord<S>[] = [];
  const last = new Map<string, string>();
  const report = simulateGame(def, {
    ...opts,
    onView(r) {
      if (last.get(r.viewerKey) === r.json) return;
      last.set(r.viewerKey, r.json);
      records.push(r as ViewRecord<S>);
    },
  });
  return { records, report };
}

/** What a viewer must not see. `exact`: no string value or object key equals one of these
 *  (use for ids like "p3"). `text`: no string value or key contains one, case-insensitively
 *  (use for secret words). */
export interface Secrets {
  exact?: readonly string[];
  text?: readonly string[];
}

/** Returns one line per leak found (empty = no leaks). `secretsFor` returns null to skip a record. */
export function findLeaks<S>(records: readonly ViewRecord<S>[], secretsFor: (r: ViewRecord<S>) => Secrets | null): string[] {
  const out: string[] = [];
  for (const r of records) {
    const sec = secretsFor(r);
    if (!sec) continue;
    const exact = new Set(sec.exact ?? []);
    const text = (sec.text ?? []).filter(Boolean).map((t) => t.toLowerCase());
    const hit = (str: string, path: string) => {
      if (exact.has(str)) out.push(`step ${r.step} ${r.viewerKey} ${path}: equals secret ${JSON.stringify(str)}`);
      const low = str.toLowerCase();
      for (const t of text) if (low.includes(t)) out.push(`step ${r.step} ${r.viewerKey} ${path}: contains secret ${JSON.stringify(t)}`);
    };
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'string') hit(v, path);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          hit(k, `${path}{key}`);
          walk(x, `${path}.${k}`);
        }
      }
    };
    walk(r.view, '$');
  }
  return out;
}
