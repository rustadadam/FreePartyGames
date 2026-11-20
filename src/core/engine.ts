// Pure room engine: lobby, seats, host, game lifecycle, timers, per-viewer views,
// asset store and bots. No Cloudflare or DOM imports. src/server/RoomDO.ts wraps it.
import {
  ClientMsgSchema,
  MAX_MESSAGE_BYTES,
  MAX_NAME_LENGTH,
  type ErrorCode,
  type HostCmd,
  type ServerMsg,
} from '../shared/protocol';
import type { LastResult, Lobby, LobbyPlayer, Phase, PlayerInfo, RoomMode, Viewer } from '../shared/types';
import { normalizeCode } from '../shared/roomCode';
import type { AnyGame, GameCtx, GameRegistry } from './game';
import { contentId } from './hash';
import { Rng } from './rng';

export const MAX_PLAYERS = 20;
/** A disconnected player keeps everything; after this grace they count as gone (host passes, game told). */
export const LEAVE_GRACE_MS = 30_000;
export const BOT_TICK_MS = 600;
const BOT_JITTER_MS = 600;
const MAX_TIMER_FIRES_PER_CALL = 1000;

export const PLAYER_COLORS = [
  '#ff5d5d', '#ffb13b', '#ffe14d', '#7bd85a', '#2ec4b6', '#3fa7ff', '#7a6bff', '#d46bff',
  '#ff6bb5', '#a0522d', '#ff8c61', '#b8e04a', '#5ee0e0', '#6b8cff', '#c9a0ff', '#ff9ecb',
  '#8fd18f', '#e0c068', '#9aa5b1', '#f2f2f2',
];

export type ConnIdentity = Viewer;

export interface RoomDeps {
  code: string;
  games: GameRegistry;
  now(): number;
  /** Outbound sink. The adapter serializes and writes to the socket. */
  send(connId: string, msg: ServerMsg): void;
  /** Ask the adapter to close a socket (kicked / replaced / left). */
  close?(connId: string, reason: string): void;
  /** Dev build: allows bots and lists hidden games. */
  dev?: boolean;
  /** Seed for the room Rng (new rooms only; restored rooms keep their state). */
  seed?: number;
  /** Secret seat tokens. Defaults to crypto.getRandomValues. */
  makeToken?(): string;
  log?(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;
  /** Tests: rethrow errors from game code instead of containing them. */
  strict?: boolean;
}

interface Seat {
  id: string;
  token: string;
  name: string;
  color: string;
  isBot: boolean;
  score: number;
  /** Explicitly left, or disconnected past LEAVE_GRACE_MS. */
  away: boolean;
}

interface GameRun {
  id: string;
  state: unknown;
  playerIds: string[];
  /** Players the game was told left (onPlayerLeave), so return is reported once. */
  left: string[];
}

export interface RoomSnapshot {
  v: 1;
  code: string;
  mode: RoomMode | null;
  hostId: string | null;
  seats: Seat[];
  screen: { token: string; away: boolean } | null;
  phase: Phase;
  selectedGameId: string | null;
  game: GameRun | null;
  /** key -> dueAt. Keys: `g:<game key>`, `bot`, `leave:<playerId|screen>`. Insertion order breaks ties. */
  timers: Record<string, number>;
  lastResult: LastResult | null;
  rng: number;
  gameRng: number;
  botRng: number;
  nextSeat: number;
  version: number;
}

function defaultToken(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

class GameCodeError extends Error {}

export class Room {
  readonly code: string;
  private s: RoomSnapshot;
  private readonly conns = new Map<string, ConnIdentity>();
  private readonly lastView = new Map<string, string>();
  private lastLobbyJson = '';
  private readonly assets = new Map<string, unknown>();
  private newAssets: string[] = [];
  private readonly rng: Rng;
  private readonly gameRng: Rng;
  private readonly botRng: Rng;
  private readonly ctx: GameCtx;

  constructor(
    private readonly deps: RoomDeps,
    snapshot?: RoomSnapshot,
  ) {
    this.code = deps.code;
    const seed = deps.seed ?? Math.floor(Math.random() * 2 ** 32);
    this.s = snapshot ?? {
      v: 1,
      code: deps.code,
      mode: null,
      hostId: null,
      seats: [],
      screen: null,
      phase: 'lobby',
      selectedGameId: null,
      game: null,
      timers: {},
      lastResult: null,
      rng: seed >>> 0,
      gameRng: 0,
      botRng: (seed ^ 0x9e3779b9) >>> 0,
      nextSeat: 1,
      version: 0,
    };
    this.rng = new Rng(this.s.rng);
    this.gameRng = new Rng(this.s.gameRng);
    this.botRng = new Rng(this.s.botRng);
    this.ctx = this.makeCtx();
  }

  static restore(snapshot: RoomSnapshot, deps: RoomDeps, assets?: Iterable<[string, unknown]>): Room {
    const room = new Room(deps, structuredClone(snapshot));
    for (const [id, data] of assets ?? []) room.assets.set(id, data);
    return room;
  }

  // ---------- adapter API ----------

  /** Bumped on every persisted change. The adapter persists when it differs from what it last saved. */
  get version(): number {
    return this.s.version;
  }

  snapshot(): RoomSnapshot {
    this.s.rng = this.rng.state;
    this.s.gameRng = this.gameRng.state;
    this.s.botRng = this.botRng.state;
    return structuredClone(this.s);
  }

  /** Re-binds a socket after hibernation (identity came from the socket attachment). Sends nothing. */
  attach(connId: string, who: ConnIdentity): void {
    if (who.kind === 'player' && !this.seat(who.id)) return;
    if (who.kind === 'screen' && !this.s.screen) return;
    this.conns.set(connId, who);
  }

  identity(connId: string): ConnIdentity | null {
    return this.conns.get(connId) ?? null;
  }

  /** Earliest timer due time, for the single DO alarm. */
  nextAlarmAt(): number | null {
    let min: number | null = null;
    for (const at of Object.values(this.s.timers)) if (min === null || at < min) min = at;
    return min;
  }

  fireDueTimers(): void {
    for (let i = 0; i < MAX_TIMER_FIRES_PER_CALL; i++) {
      const key = this.earliestTimer(() => true);
      if (key === null || this.s.timers[key] > this.deps.now()) break;
      delete this.s.timers[key];
      this.fireTimer(key);
    }
    this.commit();
  }

  /** New assets since the last call, for the adapter to persist under their own keys. */
  drainNewAssets(): Array<[string, unknown]> {
    const out = this.newAssets.map((id): [string, unknown] => [id, this.assets.get(id)]);
    this.newAssets = [];
    return out;
  }

  putAsset(data: unknown): string {
    const id = contentId(data);
    if (!this.assets.has(id)) {
      this.assets.set(id, structuredClone(data));
      this.newAssets.push(id);
    }
    return id;
  }

  getAsset(id: string): unknown {
    return this.assets.get(id);
  }

  getLobby(): Lobby {
    const host = this.host();
    const inGame = this.s.game?.playerIds ?? [];
    const players: LobbyPlayer[] = this.s.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      color: seat.color,
      isBot: seat.isBot,
      score: seat.score,
      connected: seat.isBot || this.isConnected(seat.id),
      isHost: host?.kind === 'player' && host.id === seat.id,
    }));
    return {
      code: this.code,
      mode: this.s.mode,
      host,
      players,
      hasScreen: this.s.screen !== null,
      screenConnected: this.s.screen !== null && this.isConnected('screen'),
      phase: this.s.phase,
      selectedGameId: this.s.selectedGameId,
      currentGameId: this.s.game?.id ?? null,
      inGame: [...inGame],
      games: this.listedGames().map((g) => ({ ...g.manifest })),
      lastResult: this.s.lastResult,
      maxPlayers: MAX_PLAYERS,
      dev: !!this.deps.dev,
    };
  }

  /** Entry point for every inbound socket message. Never throws on bad input. */
  handleMessage(connId: string, raw: unknown): void {
    let data: unknown = raw;
    if (typeof raw === 'string') {
      if (raw.length > MAX_MESSAGE_BYTES) return this.error(connId, 'bad_message', 'Message too large');
      try {
        data = JSON.parse(raw);
      } catch {
        return this.error(connId, 'bad_message', 'Invalid JSON');
      }
    }
    const parsed = ClientMsgSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return this.error(connId, 'bad_message', `${issue?.path.join('.') || 'message'}: ${issue?.message ?? 'invalid'}`);
    }
    const msg = parsed.data;
    if (msg.type === 'ping') return this.deps.send(connId, { type: 'pong', c: msg.c, s: this.deps.now() });

    const who = this.conns.get(connId);
    if (msg.type === 'hello') {
      if (who) return this.error(connId, 'bad_message', 'Already joined');
      this.hello(connId, msg.code, msg.name, msg.role, msg.token);
      return this.commit();
    }
    if (!who) return this.error(connId, 'not_joined', 'Say hello first');

    switch (msg.type) {
      case 'assetReq': {
        const items: Record<string, unknown> = {};
        for (const id of msg.ids) if (this.assets.has(id)) items[id] = this.assets.get(id);
        return this.deps.send(connId, { type: 'assets', items });
      }
      case 'action':
        if (who.kind !== 'player') return this.error(connId, 'not_in_game', 'Screens cannot act');
        this.playerAction(connId, who.id, msg.payload);
        return this.commit();
      case 'host': {
        if (!this.isHost(who)) return this.error(connId, 'not_host', 'Only the host can do that');
        const err = this.runHostCommand(msg.cmd);
        if (err) this.error(connId, 'bad_command', err);
        return;
      }
      case 'leave':
        this.leave(who);
        return this.commit();
    }
  }

  /** Socket closed. The seat is kept; after LEAVE_GRACE_MS it counts as gone. */
  disconnect(connId: string): void {
    const who = this.conns.get(connId);
    if (!who) return;
    this.conns.delete(connId);
    this.lastView.delete(connId);
    const key = who.kind === 'screen' ? 'screen' : who.id;
    if (!this.isConnected(key)) this.setTimerAt(`leave:${key}`, this.deps.now() + LEAVE_GRACE_MS);
    this.commit();
  }

  /**
   * Runs a host command without an authorization check (handleMessage checks first).
   * Also used by trusted callers such as the testkit. Returns an error message or null.
   */
  runHostCommand(cmd: HostCmd): string | null {
    const err = this.hostCommand(cmd);
    this.commit();
    return err;
  }

  // ---------- joining / leaving ----------

  private hello(connId: string, code: string, name: string, role: 'player' | 'screen', token?: string): void {
    if (normalizeCode(code) !== this.code) return this.error(connId, 'wrong_room', 'Wrong room code');
    const now = this.deps.now();
    if (role === 'screen') {
      const screen = this.s.screen;
      if (screen && token !== screen.token) {
        if (!screen.away) return this.error(connId, 'screen_taken', 'This room already has a screen');
        screen.token = this.newToken(); // the old screen is gone for good: take over
      }
      if (!this.s.screen) this.s.screen = { token: this.newToken(), away: false };
      this.s.mode ??= 'screen';
      this.s.screen.away = false;
      this.bind(connId, { kind: 'screen' }, this.s.screen.token, now);
      return;
    }

    let seat = token ? this.s.seats.find((p) => !p.isBot && p.token === token) : undefined;
    if (!seat) {
      if (this.s.seats.length >= MAX_PLAYERS) return this.error(connId, 'room_full', 'Room is full');
      seat = this.addSeat(name, false);
      if (this.s.mode === null) {
        this.s.mode = 'hostPlayer';
        this.s.hostId = seat.id;
      }
    }
    if (this.s.mode === 'hostPlayer' && this.s.hostId === null) this.s.hostId = seat.id;
    this.bind(connId, { kind: 'player', id: seat.id }, seat.token, now);
    if (seat.away) {
      seat.away = false;
      this.playerReturned(seat.id);
    }
  }

  private bind(connId: string, who: ConnIdentity, token: string, now: number): void {
    const key = who.kind === 'screen' ? 'screen' : who.id;
    // One live socket per seat: a newer socket replaces an older one.
    for (const [other, id] of this.conns) {
      if ((id.kind === 'screen' ? 'screen' : id.id) === key) this.drop(other, 'replaced', 'Opened somewhere else');
    }
    delete this.s.timers[`leave:${key}`];
    this.conns.set(connId, who);
    this.deps.send(connId, { type: 'welcome', you: who, token, serverNow: now });
    this.deps.send(connId, { type: 'room', lobby: this.getLobby() });
  }

  private addSeat(rawName: string, isBot: boolean): Seat {
    const used = new Set(this.s.seats.map((p) => p.color));
    const seat: Seat = {
      id: `p${this.s.nextSeat++}`,
      token: isBot ? '' : this.newToken(),
      name: this.uniqueName(rawName),
      color: PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.s.seats.length % PLAYER_COLORS.length],
      isBot,
      score: 0,
      away: false,
    };
    this.s.seats.push(seat);
    return seat;
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.s.seats.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`;
      const candidate = name.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd() + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  private leave(who: ConnIdentity): void {
    if (who.kind === 'screen') {
      for (const [connId, id] of this.conns) if (id.kind === 'screen') this.drop(connId, 'kicked', 'You left');
      this.s.screen = null;
      delete this.s.timers['leave:screen'];
      return;
    }
    this.removePlayer(who.id, 'You left', 'kicked', this.s.phase === 'playing' && this.inGame(who.id));
  }

  /** Kick or leave. Mid-game leavers keep their seat (marked away) unless kicked. */
  private removePlayer(id: string, message: string, code: ErrorCode, keepSeat: boolean): void {
    for (const [connId, who] of this.conns) if (who.kind === 'player' && who.id === id) this.drop(connId, code, message);
    delete this.s.timers[`leave:${id}`];
    const seat = this.seat(id);
    if (!seat) return;
    seat.away = true;
    this.playerGone(id); // before removal, so host passes to the next seat in order
    if (!keepSeat) this.s.seats = this.s.seats.filter((p) => p !== seat);
  }

  private drop(connId: string, code: ErrorCode, message: string): void {
    this.error(connId, code, message);
    this.conns.delete(connId);
    this.lastView.delete(connId);
    this.deps.close?.(connId, code);
  }

  /** Seat is gone for now (grace expired, left or kicked): tell the game, move host. */
  private playerGone(id: string): void {
    const game = this.s.game;
    if (game && this.s.phase === 'playing' && game.playerIds.includes(id) && !game.left.includes(id)) {
      game.left.push(id);
      this.callGame((def) => def.onPlayerLeave?.(game.state, this.ctx, id));
    }
    if (this.s.hostId === id) this.s.hostId = this.nextHost(id);
  }

  private playerReturned(id: string): void {
    const game = this.s.game;
    if (!game || !game.left.includes(id)) return;
    game.left = game.left.filter((p) => p !== id);
    if (this.s.phase === 'playing') this.callGame((def) => def.onPlayerReturn?.(game.state, this.ctx, id));
  }

  // ---------- host ----------

  /** Screen mode: the screen while present, else the first present human. Host-player mode: hostId. */
  private host(): Viewer | null {
    if (this.s.mode === 'screen') {
      if (this.s.screen && !this.s.screen.away) return { kind: 'screen' };
      const fallback = this.s.seats.find((p) => !p.isBot && !p.away && this.isConnected(p.id));
      return fallback ? { kind: 'player', id: fallback.id } : null;
    }
    return this.s.hostId ? { kind: 'player', id: this.s.hostId } : null;
  }

  private isHost(who: ConnIdentity): boolean {
    const host = this.host();
    if (!host) return false;
    return host.kind === 'screen' ? who.kind === 'screen' : who.kind === 'player' && who.id === host.id;
  }

  /** Next human after `fromId` in seat order (wrapping): connected first, then any not away. */
  private nextHost(fromId: string): string | null {
    const seats = this.s.seats;
    const start = Math.max(0, seats.findIndex((p) => p.id === fromId));
    const order = [...seats.slice(start + 1), ...seats.slice(0, start + 1)].filter(
      (p) => !p.isBot && !p.away && p.id !== fromId,
    );
    return (order.find((p) => this.isConnected(p.id)) ?? order[0])?.id ?? null;
  }

  private hostCommand(cmd: HostCmd): string | null {
    switch (cmd.type) {
      case 'selectGame': {
        if (this.s.phase === 'playing') return 'Finish or end the current game first';
        if (!this.listedGames().some((g) => g.manifest.id === cmd.gameId)) return 'Unknown game';
        this.s.selectedGameId = cmd.gameId;
        return null;
      }
      case 'start':
        return this.start();
      case 'skip': {
        if (this.s.phase !== 'playing') return 'No game running';
        const key = this.earliestTimer((k) => k.startsWith('g:'));
        if (key === null) return 'Nothing to skip';
        delete this.s.timers[key];
        this.fireTimer(key);
        return null;
      }
      case 'kick': {
        const seat = this.seat(cmd.playerId);
        if (!seat) return 'No such player';
        const host = this.host();
        if (host?.kind === 'player' && host.id === seat.id) return 'You cannot kick yourself';
        this.removePlayer(seat.id, 'You were removed by the host', 'kicked', false);
        return null;
      }
      case 'returnToLobby':
        this.endGame();
        this.s.phase = 'lobby';
        return null;
      case 'addBots': {
        if (!this.deps.dev) return 'Bots are only available in dev builds';
        if (this.s.phase === 'playing') return 'Add bots between games';
        const room = MAX_PLAYERS - this.s.seats.length;
        if (room <= 0) return 'Room is full';
        for (let i = 0; i < Math.min(cmd.count, room); i++) {
          const n = this.s.seats.filter((p) => p.isBot).length + 1;
          this.addSeat(`Bot ${n}`, true);
        }
        return null;
      }
    }
  }

  // ---------- game lifecycle ----------

  private start(): string | null {
    if (this.s.phase === 'playing') return 'A game is already running';
    const def = this.s.selectedGameId ? this.deps.games[this.s.selectedGameId] : undefined;
    if (!def) return 'Pick a game first';
    const seats = this.s.seats.filter((p) => !p.away);
    const { minPlayers, maxPlayers, screen } = def.manifest;
    if (seats.length < minPlayers) return `Needs at least ${minPlayers} players`;
    if (seats.length > maxPlayers) return `At most ${maxPlayers} players`;
    if (screen === 'required' && !(this.s.screen && this.isConnected('screen'))) return 'This game needs a screen';

    this.endGame();
    this.gameRng.state = this.rng.uint32();
    const players: PlayerInfo[] = seats.map(({ id, name, color, isBot }) => ({ id, name, color, isBot }));
    this.s.phase = 'playing';
    this.s.game = { id: def.manifest.id, state: null, playerIds: players.map((p) => p.id), left: [] };
    this.callGame(() => {
      this.s.game!.state = def.setup(this.ctx, players, structuredClone(def.defaultSettings));
    });
    if (seats.some((p) => p.isBot)) this.armBots();
    this.checkResult();
    return null;
  }

  /** Clears the current game (state, game and bot timers). Leaves `phase` to the caller. */
  private endGame(): void {
    this.s.game = null;
    for (const key of Object.keys(this.s.timers)) if (key.startsWith('g:') || key === 'bot') delete this.s.timers[key];
  }

  private playerAction(connId: string, playerId: string, payload: unknown): void {
    const game = this.s.game;
    const def = this.currentDef();
    if (!game || !def || this.s.phase !== 'playing' || !game.playerIds.includes(playerId)) {
      return this.error(connId, 'not_in_game', 'You are not in a running game');
    }
    const parsed = def.actionSchema.safeParse(payload);
    if (!parsed.success) return this.error(connId, 'bad_action', 'Invalid action');
    const ok = this.callGame((d) => d.onAction(game.state, this.ctx, playerId, parsed.data));
    if (!ok) this.error(connId, 'game_error', 'The game could not handle that');
  }

  private fireTimer(key: string): void {
    if (key.startsWith('g:')) {
      const game = this.s.game;
      if (game && this.s.phase === 'playing') this.callGame((def) => def.onTimer?.(game.state, this.ctx, key.slice(2)));
    } else if (key === 'bot') {
      this.runBots();
    } else if (key.startsWith('leave:')) {
      const id = key.slice('leave:'.length);
      if (id === 'screen') {
        if (this.s.screen && !this.isConnected('screen')) this.s.screen.away = true;
      } else {
        const seat = this.seat(id);
        if (seat && !this.isConnected(id)) {
          seat.away = true;
          this.playerGone(id);
        }
      }
    }
  }

  private armBots(): void {
    this.setTimerAt('bot', this.deps.now() + BOT_TICK_MS + this.botRng.int(BOT_JITTER_MS));
  }

  private runBots(): void {
    const game = this.s.game;
    const def = this.currentDef();
    if (!game || !def || this.s.phase !== 'playing') return;
    const bots = this.botRng.shuffle(
      game.playerIds.filter((id) => this.seat(id)?.isBot && !game.left.includes(id)),
    );
    for (const id of bots) {
      if (this.s.phase !== 'playing') break;
      this.callGame((d) => {
        const view = JSON.parse(JSON.stringify(d.view(game.state, { kind: 'player', id }) ?? null));
        const action = d.bot.act(view, this.botRng, id);
        if (action === null || action === undefined) return;
        const parsed = d.actionSchema.safeParse(action);
        if (!parsed.success) throw new GameCodeError(`bot ${id} produced an invalid action: ${JSON.stringify(action)}`);
        d.onAction(game.state, this.ctx, id, parsed.data);
      });
    }
    if (this.s.phase === 'playing') this.armBots();
  }

  /** Runs game code, containing errors (or rethrowing in strict mode), then checks for a result. */
  private callGame(fn: (def: AnyGame) => void): boolean {
    const def = this.currentDef();
    if (!def) return false;
    try {
      fn(def);
    } catch (err) {
      if (this.deps.strict) throw err;
      this.deps.log?.('error', `game ${def.manifest.id} threw`, String(err));
      return false;
    }
    this.checkResult();
    return true;
  }

  private checkResult(): void {
    const game = this.s.game;
    const def = this.currentDef();
    if (!game || !def || this.s.phase !== 'playing') return;
    let result;
    try {
      result = def.result(game.state);
    } catch (err) {
      if (this.deps.strict) throw err;
      this.deps.log?.('error', `game ${def.manifest.id} result() threw`, String(err));
      return;
    }
    if (!result) return;
    const scores: Record<string, number> = {};
    for (const id of game.playerIds) {
      const pts = Number(result.scores[id] ?? 0);
      scores[id] = Number.isFinite(pts) ? pts : 0;
    }
    for (const seat of this.s.seats) seat.score += scores[seat.id] ?? 0;
    const ranking = [...game.playerIds].sort((a, b) => scores[b] - scores[a]);
    this.s.lastResult = { gameId: game.id, scores, ranking, ...(result.summary ? { summary: String(result.summary) } : {}) };
    this.s.phase = 'results';
    for (const key of Object.keys(this.s.timers)) if (key.startsWith('g:') || key === 'bot') delete this.s.timers[key];
  }

  private makeCtx(): GameCtx {
    return {
      rng: this.gameRng,
      now: () => this.deps.now(),
      setTimer: (key, ms) => this.setTimerAt(`g:${key}`, this.deps.now() + Math.max(0, Number(ms) || 0)),
      clearTimer: (key) => {
        delete this.s.timers[`g:${key}`];
      },
      timerAt: (key) => this.s.timers[`g:${key}`] ?? null,
      putAsset: (data) => this.putAsset(data),
      getAsset: (id) => this.getAsset(id),
      broadcastEphemeral: (payload, opts) => {
        for (const [connId, who] of this.conns) {
          if (opts?.except && who.kind === 'player' && who.id === opts.except) continue;
          this.deps.send(connId, { type: 'ephemeral', payload });
        }
      },
      log: (message, data) => this.deps.log?.('info', message, data),
    };
  }

  // ---------- outbound ----------

  /** Marks state changed and pushes lobby/view updates that differ from what each socket last got. */
  private commit(): void {
    this.s.version++;
    const lobby = this.getLobby();
    const lobbyJson = JSON.stringify(lobby);
    const lobbyChanged = lobbyJson !== this.lastLobbyJson;
    this.lastLobbyJson = lobbyJson;
    const cache = new Map<string, string>();
    for (const [connId, who] of this.conns) {
      if (lobbyChanged) this.deps.send(connId, { type: 'room', lobby });
      const key = who.kind === 'screen' ? 'screen' : who.id;
      let json = cache.get(key);
      if (json === undefined) {
        json = JSON.stringify(this.viewFor(who) ?? null);
        cache.set(key, json);
      }
      if (this.lastView.get(connId) !== json) {
        this.lastView.set(connId, json);
        this.deps.send(connId, { type: 'view', gameView: JSON.parse(json) });
      }
    }
  }

  private viewFor(who: Viewer): unknown {
    const game = this.s.game;
    const def = this.currentDef();
    if (!game || !def) return null;
    if (who.kind === 'player' && !game.playerIds.includes(who.id)) return null;
    try {
      return def.view(game.state, who);
    } catch (err) {
      if (this.deps.strict) throw err;
      this.deps.log?.('error', `game ${def.manifest.id} view() threw`, String(err));
      return null;
    }
  }

  private error(connId: string, code: ErrorCode, message: string): void {
    this.deps.send(connId, { type: 'error', code, message: message.slice(0, 200) });
  }

  // ---------- helpers ----------

  private currentDef(): AnyGame | undefined {
    return this.s.game ? this.deps.games[this.s.game.id] : undefined;
  }

  private listedGames(): AnyGame[] {
    return Object.values(this.deps.games).filter((g) => this.deps.dev || !g.manifest.hidden);
  }

  private seat(id: string): Seat | undefined {
    return this.s.seats.find((p) => p.id === id);
  }

  private inGame(id: string): boolean {
    return !!this.s.game?.playerIds.includes(id);
  }

  /** `key` is a player id or 'screen'. Bots never have sockets. */
  private isConnected(key: string): boolean {
    for (const who of this.conns.values()) if ((who.kind === 'screen' ? 'screen' : who.id) === key) return true;
    return false;
  }

  private setTimerAt(key: string, at: number): void {
    delete this.s.timers[key]; // re-insert so insertion order reflects arming order
    this.s.timers[key] = at;
  }

  private earliestTimer(filter: (key: string) => boolean): string | null {
    let best: string | null = null;
    for (const [key, at] of Object.entries(this.s.timers)) {
      if (filter(key) && (best === null || at < this.s.timers[best])) best = key;
    }
    return best;
  }

  private newToken(): string {
    return (this.deps.makeToken ?? defaultToken)();
  }
}
