// One WebSocket connection to a room, with hello/rejoin, reconnect backoff,
// the server clock, the asset cache and ephemeral fan-out. UI reads `state`
// through subscribe(); it never touches the socket.
import type { ClientMsgInput, ErrorCode, HostCmd, ServerMsg } from '../../shared/protocol';
import type { Lobby, Role, Viewer } from '../../shared/types';
import { ActionOutbox } from './actionOutbox';
import { assetCache } from './assets';
import { ServerClock, localNow } from './clock';
import { clearSession, saveSession } from './session';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'ended';

/** Why the connection will not come back on its own. */
export type EndReason = 'kicked' | 'replaced' | 'left' | 'gone' | 'full' | 'screen_taken';

export interface RoomState {
  status: ConnStatus;
  /** Failed attempts since the socket was last open. */
  attempt: number;
  /** Player actions sent or waiting for a connection, until acknowledged or expired. */
  pendingActions: number;
  you: Viewer | null;
  lobby: Lobby | null;
  view: unknown;
  ended: EndReason | null;
  /** Last non-fatal server error, for a toast. `at` changes on each error. */
  notice: { code: ErrorCode | 'delivery_timeout'; message: string; at: number } | null;
}

const BACKOFF_MS = [400, 1000, 2000, 4000, 8000];
const PING_BURST = 5;
const PING_BURST_MS = 700;
const PING_EVERY_MS = 15_000;
/** No message for this long on an "open" socket means it is half-open (phone slept): reconnect. */
const STALE_MS = PING_EVERY_MS * 2 + 5_000;
/** After the tab comes back, the server must answer a ping within this or we reconnect. */
const PROBE_MS = 5_000;
/** Ended states where the saved seat token is useless; dropped so a reload does not silently re-seat. */
const FORGET_SEAT: ReadonlySet<EndReason> = new Set(['kicked', 'left', 'gone', 'full', 'screen_taken']);
/** After this many failed attempts, ask the API whether the room still exists. */
const CHECK_GONE_AFTER = 3;
const FATAL_HELLO: Partial<Record<ErrorCode, EndReason>> = {
  room_full: 'full',
  screen_taken: 'screen_taken',
  wrong_room: 'gone',
};

export function wsUrl(code: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/${code}`;
}

export class RoomClient {
  readonly clock = new ServerClock();
  state: RoomState = { status: 'connecting', attempt: 0, pendingActions: 0, you: null, lobby: null, view: null, ended: null, notice: null };

  private ws: WebSocket | null = null;
  private token: string | undefined;
  private listeners = new Set<() => void>();
  private ephemeralListeners = new Set<(payload: unknown) => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pingsSent = 0;
  private lastHeard = 0;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly outbox: ActionOutbox;

  constructor(
    readonly code: string,
    readonly name: string,
    readonly role: Role,
    token?: string,
  ) {
    this.token = token;
    this.outbox = new ActionOutbox(
      (id, payload) => this.sendAction(id, payload),
      (pendingActions) => this.set({ pendingActions }),
      () =>
        this.set({
          notice: {
            code: 'delivery_timeout',
            message: 'Could not confirm that action. Check the game before tapping again.',
            at: Date.now(),
          },
        }),
    );
    addEventListener('online', this.nudge);
    document.addEventListener('visibilitychange', this.nudge);
    this.connect();
  }

  // ---------- public API ----------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Live, unstored game traffic (e.g. in-progress strokes). */
  onEphemeral(fn: (payload: unknown) => void): () => void {
    this.ephemeralListeners.add(fn);
    return () => this.ephemeralListeners.delete(fn);
  }

  action(payload: unknown): void {
    if (this.state.ended) return;
    if (isTransientAction(payload)) return this.send({ type: 'action', payload });
    this.outbox.submit(payload);
  }

  host(cmd: HostCmd): void {
    this.send({ type: 'host', cmd });
  }

  /** True when this device holds host controls. */
  get isHost(): boolean {
    const { lobby, you } = this.state;
    const h = lobby?.host;
    if (!h || !you) return false;
    return h.kind === 'screen' ? you.kind === 'screen' : you.kind === 'player' && h.id === you.id;
  }

  /** Leave for good: frees the seat on the server. */
  leave(): void {
    this.send({ type: 'leave' });
    this.end('left');
  }

  dispose(): void {
    this.disposed = true;
    removeEventListener('online', this.nudge);
    document.removeEventListener('visibilitychange', this.nudge);
    this.clearTimers();
    this.outbox.dispose();
    assetCache.setRequester(null);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'bye');
  }

  // ---------- connection ----------

  private connect(): void {
    if (this.disposed || this.state.ended) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(this.code));
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.send({ type: 'hello', code: this.code, name: this.name, role: this.role, ...(this.token ? { token: this.token } : {}) });
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastHeard = Date.now();
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      assetCache.setRequester(null);
      if (ev.code === 4000 && (ev.reason === 'kicked' || ev.reason === 'replaced')) return this.end(ev.reason);
      this.scheduleRetry();
    };
    ws.onerror = () => {
      if (this.ws === ws) this.dropSocket();
    };
  }

  private handle(msg: ServerMsg): void {
    switch (msg.type) {
      case 'welcome':
        this.token = msg.token;
        saveSession(this.code, { token: msg.token, name: this.name, role: this.role });
        this.clock.seed(msg.serverNow);
        assetCache.setRequester((ids) => this.send({ type: 'assetReq', ids }));
        this.set({ status: 'open', attempt: 0, you: msg.you });
        this.outbox.reconnected();
        this.pingsSent = 0;
        this.ping();
        return;
      case 'room':
        return this.set({ lobby: msg.lobby });
      case 'view':
        return this.set({ view: msg.gameView });
      case 'ephemeral':
        for (const fn of this.ephemeralListeners) fn(msg.payload);
        return;
      case 'assets':
        return assetCache.receive(msg.items);
      case 'pong':
        return this.clock.sample(msg.c, msg.s);
      case 'actionAck':
        return this.outbox.acknowledge(msg.id);
      case 'error': {
        const fatal = this.state.status !== 'open' ? FATAL_HELLO[msg.code] : undefined;
        if (fatal) return this.end(fatal);
        // End now rather than wait for the 4000 close: if that frame is lost, a retry with the
        // old token would silently take a fresh seat (kicked) or steal the seat back (replaced).
        if (msg.code === 'kicked' || msg.code === 'replaced') return this.end(msg.code);
        this.set({ notice: { code: msg.code, message: msg.message, at: Date.now() } });
        return;
      }
    }
  }

  private ping = (): void => {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    if (this.state.status === 'open' && Date.now() - this.lastHeard > STALE_MS) return this.dropSocket();
    this.send({ type: 'ping', c: localNow() });
    this.pingsSent++;
    this.pingTimer = setTimeout(this.ping, this.pingsSent < PING_BURST ? PING_BURST_MS : PING_EVERY_MS);
  };

  private scheduleRetry(): void {
    if (this.disposed || this.state.ended || this.retryTimer) return;
    const attempt = this.state.attempt + 1;
    this.set({ status: 'reconnecting', attempt });
    if (attempt === CHECK_GONE_AFTER) void this.checkGone();
    const base = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        this.connect();
      },
      base + Math.random() * base * 0.3,
    );
  }

  /** The socket looks open but is dead (no traffic): abandon it and reconnect. */
  private dropSocket(): void {
    const ws = this.ws;
    this.ws = null;
    this.clearTimers();
    assetCache.setRequester(null);
    try {
      ws?.close(1000, 'stale');
    } catch {
      /* already closed */
    }
    this.scheduleRetry();
  }

  /** Network back or tab visible again: retry now instead of waiting out the backoff. */
  private nudge = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (this.state.status === 'open' && this.ws?.readyState === WebSocket.OPEN) {
      // After a phone sleeps the socket often looks open but is dead: prove it with a ping.
      const asked = Date.now();
      this.send({ type: 'ping', c: localNow() });
      if (this.probeTimer) clearTimeout(this.probeTimer);
      this.probeTimer = setTimeout(() => {
        this.probeTimer = null;
        if (this.state.status === 'open' && this.lastHeard < asked) this.dropSocket();
      }, PROBE_MS);
      return;
    }
    if (this.state.status !== 'reconnecting' || this.ws) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connect();
  };

  private async checkGone(): Promise<void> {
    try {
      const res = await fetch(`/api/rooms/${this.code}`);
      if (res.status === 404) this.end('gone');
    } catch {
      /* offline: keep retrying */
    }
  }

  private end(reason: EndReason): void {
    if (this.state.ended) return;
    if (FORGET_SEAT.has(reason)) clearSession(this.code);
    this.clearTimers();
    this.outbox.dispose();
    this.set({ status: 'ended', ended: reason });
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'bye');
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearTimeout(this.pingTimer);
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.retryTimer = this.pingTimer = this.probeTimer = null;
  }

  private sendAction(id: string, payload: unknown): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify({ type: 'action', id, payload }));
      return true;
    } catch {
      if (this.ws === ws) this.dropSocket();
      return false;
    }
  }

  private send(msg: ClientMsgInput): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private set(patch: Partial<RoomState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
}

function isTransientAction(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const type = (payload as { type?: unknown }).type;
  return type === 'live' || type === 'ink';
}
