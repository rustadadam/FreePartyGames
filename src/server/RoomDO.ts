// Thin Durable Object adapter around the pure Room engine (src/core/engine.ts):
// WebSocket Hibernation <-> Room.handleMessage, one DO alarm <-> Room timers,
// snapshot persistence in SQLite-backed storage.
//
// Persistence policy (U4 review decision):
//  - Lobby-level changes (new seat/token, host, phase, scores, results, connects/disconnects
//    and the leave timers they arm) are written in the same event, so the output gate holds
//    every outbound message until they are durable: a crash can never lose a seat or a score.
//  - A snapshot identical to the last one written (e.g. an action that only broadcast
//    ephemeral stroke points) is not written at all.
//  - Pure game-state churn is written leading-edge + trailing-edge at most once per
//    PERSIST_INTERVAL_MS. The free plan allows 100k SQLite rows written per day, and live
//    drawing games can change state 10-20 times a second, so per-event writes would exhaust
//    it in a couple of hours of play. A pending setTimeout keeps the object from hibernating,
//    so graceful hibernation never loses state; only a hard crash/eviction can lose <= 1 s of
//    game-only state (never seats, tokens, scores or phase).
import { DurableObject } from 'cloudflare:workers';
import { Room, type ConnIdentity, type RoomSnapshot } from '../core/engine';
import { serverGames } from '../games/registry.server';
import type { ServerMsg } from '../shared/protocol';
import type { Env, RoomInfo } from './env';

/** Storage keys: one snapshot, one key per asset, and the idle deadline. */
const SNAPSHOT_KEY = 'snapshot';
const ASSET_PREFIX = 'a:';
const IDLE_KEY = 'idleAt';
/** At most one snapshot write per this interval (leading + trailing edge). */
const PERSIST_INTERVAL_MS = 1000;
/** A room with no open sockets for this long is deleted. */
export const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PUT_KEYS = 128;
/** Open sockets per room: 30 players + a screen, with headroom for reconnect overlap. */
const MAX_SOCKETS = 64;

interface Attachment {
  connId: string;
  who: ConnIdentity | null;
}

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  private readonly sockets = new Map<string, WebSocket>();
  private idleAt: number | null = null;
  private savedVersion = -1;
  private savedLobbyVersion = -1;
  /** JSON of the last snapshot written, minus its version, to skip identical writes. */
  private savedJson = '';
  private lastSaveAt = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Last alarm time we set (undefined = unknown after a wake), to skip redundant writes. */
  private alarmAt: number | null | undefined = undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Runs on every (re)start, including wake from hibernation. Blocks events until loaded.
    ctx.blockConcurrencyWhile(() => this.load());
  }

  private deps(code: string) {
    return {
      code,
      games: serverGames,
      now: () => Date.now(),
      dev: this.env.DEV_BOTS === '1',
      send: (connId: string, msg: ServerMsg) => {
        try {
          this.sockets.get(connId)?.send(JSON.stringify(msg));
        } catch {
          // Socket already closing; its close event cleans up.
        }
      },
      close: (connId: string, reason: string) => {
        const ws = this.sockets.get(connId);
        this.sockets.delete(connId);
        try {
          // Forget the identity first: if we hibernate before the close completes, load()
          // must not re-attach a replaced/kicked socket as a live seat.
          ws?.serializeAttachment({ connId, who: null } satisfies Attachment);
          ws?.close(4000, reason.slice(0, 100));
        } catch {
          // already closed
        }
      },
      log: (level: string, message: string, data?: unknown) => console.log(`[room ${code}] ${level}: ${message}`, data ?? ''),
    };
  }

  private async load(): Promise<void> {
    const snap = await this.ctx.storage.get<RoomSnapshot>(SNAPSHOT_KEY);
    this.idleAt = (await this.ctx.storage.get<number>(IDLE_KEY)) ?? null;
    if (!snap) return;
    const assets = await this.ctx.storage.list({ prefix: ASSET_PREFIX });
    const entries = [...assets].map(([k, v]): [string, unknown] => [k.slice(ASSET_PREFIX.length), v]);
    this.room = Room.restore(snap, this.deps(snap.code), entries);
    this.savedVersion = this.room.version;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.sockets.set(att.connId, ws);
      if (att.who && ws.readyState === WebSocket.OPEN) this.room.attach(att.connId, att.who);
    }
    // Seats whose sockets died while we were evicted get a leave-grace timer (persisted on
    // the next event; the alarm below makes sure that event happens).
    this.room.reconcileConnections();
    if (this.room.version !== this.savedVersion) {
      this.persist(true);
      await this.scheduleAlarm();
    }
  }

  // ---------- RPC from the Worker ----------

  /** Claims this DO for a new room. False if the code is already in use. */
  async claim(code: string): Promise<boolean> {
    if (this.room) return false;
    this.room = new Room(this.deps(code));
    await this.setIdle(Date.now() + IDLE_TTL_MS);
    this.persist(true);
    await this.scheduleAlarm();
    return true;
  }

  async info(): Promise<RoomInfo> {
    if (!this.room) return { exists: false, hasScreen: false, playerCount: 0, phase: null };
    const lobby = this.room.getLobby();
    return { exists: true, hasScreen: lobby.hasScreen, playerCount: lobby.players.length, phase: lobby.phase };
  }

  // ---------- WebSockets ----------

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected websocket', { status: 426 });
    if (!this.room) return new Response('No such room', { status: 404 });
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('Too many connections', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const connId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connId, who: null } satisfies Attachment);
    this.sockets.set(connId, server);
    await this.setIdle(null);
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || !this.room) return;
    this.sockets.set(att.connId, ws);
    this.room.handleMessage(att.connId, typeof message === 'string' ? message : null);
    const who = this.room.identity(att.connId);
    const changed = JSON.stringify(who) !== JSON.stringify(att.who);
    if (changed) ws.serializeAttachment({ connId: att.connId, who } satisfies Attachment);
    // A new seat (token) is written right away; everything else is throttled.
    await this.afterEvent(changed);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.socketGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.socketGone(ws);
  }

  private async socketGone(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    try {
      ws.close(1000, 'bye');
    } catch {
      // already closed
    }
    if (!att || !this.room) return;
    this.sockets.delete(att.connId);
    this.room.disconnect(att.connId);
    const open = this.ctx.getWebSockets().filter((s) => s !== ws && s.readyState === WebSocket.OPEN);
    if (open.length === 0) await this.setIdle(Date.now() + IDLE_TTL_MS);
    await this.afterEvent(true);
  }

  // ---------- alarm: engine timers + idle cleanup ----------

  override async alarm(): Promise<void> {
    this.alarmAt = undefined; // the alarm we set has fired
    if (!this.room) return;
    const now = Date.now();
    const open = this.ctx.getWebSockets().filter((s) => s.readyState === WebSocket.OPEN);
    if (this.idleAt !== null && now >= this.idleAt && open.length === 0) {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.room = null;
      this.idleAt = null;
      this.alarmAt = null;
      // A later claim() on this object must write its fresh room even if versions collide.
      this.savedVersion = -1;
      this.savedLobbyVersion = -1;
      this.savedJson = '';
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    this.room.fireDueTimers();
    await this.afterEvent(false);
  }

  // ---------- persistence ----------

  private async afterEvent(urgent: boolean): Promise<void> {
    this.persist(urgent);
    await this.scheduleAlarm();
  }

  /**
   * See the persistence policy at the top of this file. Lobby-level changes and `urgent`
   * events write now; other changes write now if the last write is older than
   * PERSIST_INTERVAL_MS, else once at the end of the interval. Unchanged snapshots are skipped.
   */
  private persist(urgent: boolean): void {
    if (!this.room || this.room.version === this.savedVersion) return;
    if (this.room.lobbyVersion !== this.savedLobbyVersion) urgent = true;
    const wait = this.lastSaveAt + PERSIST_INTERVAL_MS - Date.now();
    if (!urgent && wait > 0) {
      this.saveTimer ??= setTimeout(() => {
        this.saveTimer = null;
        this.persist(true);
      }, wait);
      return;
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const snap = this.room.snapshot();
    const { version: _v, ...rest } = snap;
    const json = JSON.stringify(rest);
    const entries: Record<string, unknown> = {};
    if (json !== this.savedJson) entries[SNAPSHOT_KEY] = snap;
    for (const [id, data] of this.room.drainNewAssets()) entries[ASSET_PREFIX + id] = data;
    this.savedVersion = this.room.version;
    this.savedLobbyVersion = this.room.lobbyVersion;
    const keys = Object.keys(entries);
    if (!keys.length) return; // nothing durable changed: no write, no throttle slot used
    this.savedJson = json;
    for (let i = 0; i < keys.length; i += MAX_PUT_KEYS) {
      const chunk = Object.fromEntries(keys.slice(i, i + MAX_PUT_KEYS).map((k) => [k, entries[k]]));
      this.ctx.storage.put(chunk).catch((err) => console.error('persist failed', err));
    }
    this.lastSaveAt = Date.now();
  }

  private async setIdle(at: number | null): Promise<void> {
    if (at === this.idleAt) return;
    this.idleAt = at;
    if (at === null) await this.ctx.storage.delete(IDLE_KEY);
    else await this.ctx.storage.put(IDLE_KEY, at);
  }

  /** One DO alarm = min(next engine timer, idle deadline). */
  private async scheduleAlarm(): Promise<void> {
    const times = [this.room?.nextAlarmAt() ?? null, this.idleAt].filter((t): t is number => t !== null);
    const at = times.length ? Math.min(...times) : null;
    if (at === this.alarmAt) return;
    this.alarmAt = at;
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
  }
}
