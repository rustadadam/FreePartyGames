// npm run smoke: starts `wrangler dev` locally (no account), then plays EVERY game in the
// server registry end to end over real WebSockets: 1 screen (host) + 6 player clients.
// SMOKE_PLAYERS=30 plays with that many players in the room (1-30): each game seats its own
// cap and the rest spectate. SMOKE_GAMES=forgery,tap-duel plays only those games.
// Players pick actions with the game's own bot.act() on the view they receive.
// If no view changes for STALE_SKIP_MS the screen sends a `skip` host command (logged).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import WebSocket from 'ws';
import { MAX_PLAYERS } from '../src/core/engine';
import { Rng } from '../src/core/rng';
import { serverGames } from '../src/games/registry.server';
import type { ClientMsgInput, ServerMsg } from '../src/shared/protocol';
import type { Lobby, Viewer } from '../src/shared/types';

const PLAYERS = Number(process.env.SMOKE_PLAYERS ?? 6);
if (!Number.isInteger(PLAYERS) || PLAYERS < 1 || PLAYERS > MAX_PLAYERS) throw new Error(`SMOKE_PLAYERS must be 1-${MAX_PLAYERS}`);
const BOT_INTERVAL_MS = 300;
const STALE_SKIP_MS = 8_000;
const GAME_TIMEOUT_MS = 240_000;
const READY_TIMEOUT_MS = 90_000;
const FATAL_ERRORS = new Set(['bad_message', 'bad_action', 'game_error', 'not_joined', 'wrong_room']);
const ROOT = resolve(import.meta.dirname, '..');

// ---------- wrangler lifecycle ----------

let wrangler: ChildProcess | null = null;
const wranglerLog: string[] = [];

/** Signals the whole wrangler process group (npx -> wrangler -> workerd). False if it is gone. */
function signalGroup(pid: number, sig: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pid, sig);
    return true;
  } catch {
    return false;
  }
}

function killWrangler(): void {
  if (wrangler?.pid) signalGroup(wrangler.pid, 'SIGTERM');
  wrangler = null;
}

/** SIGTERM the wrangler process group, wait until every process in it exits, SIGKILL after 5 s. */
async function stopWrangler(): Promise<void> {
  const pid = wrangler?.pid;
  if (!pid) return;
  killWrangler();
  for (let waited = 0; waited < 5000; waited += 100) {
    if (!signalGroup(pid, 0)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  signalGroup(pid, 'SIGKILL');
}
process.on('exit', killWrangler);
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    killWrangler();
    process.exit(130);
  });
}

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => ok(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startWrangler(): Promise<string> {
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) {
    console.log('smoke: dist/ missing, running vite build');
    const b = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('vite build failed');
  }
  const port = await freePort();
  const inspector = await freePort();
  const args = ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--inspector-port', String(inspector), '--var', 'DEV_BOTS:1', '--log-level', 'warn'];
  console.log(`smoke: starting wrangler dev on :${port}`);
  wrangler = spawn('npx', args, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' },
  });
  const keep = (d: Buffer) => {
    wranglerLog.push(d.toString());
    if (wranglerLog.length > 200) wranglerLog.shift();
  };
  wrangler.stdout?.on('data', keep);
  wrangler.stderr?.on('data', keep);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!wrangler || wrangler.exitCode !== null) break;
    try {
      const res = await fetch(`${base}/api/rooms/ABCD`);
      if (res.status === 404 || res.ok) return base;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`wrangler dev did not become ready:\n${wranglerLog.join('').slice(-3000)}`);
}

// ---------- WebSocket client ----------

class Client {
  view: unknown = null;
  viewChangedAt = Date.now();
  lobby: Lobby | null = null;
  you: Viewer | null = null;
  errors: Array<{ code: string; message: string }> = [];
  readonly views: unknown[] = [];
  private listeners: Array<(m: ServerMsg) => void> = [];

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as ServerMsg;
      if (msg.type === 'view') {
        this.view = msg.gameView;
        this.viewChangedAt = Date.now();
        this.views.push(msg.gameView);
      } else if (msg.type === 'room') this.lobby = msg.lobby;
      else if (msg.type === 'welcome') this.you = msg.you;
      else if (msg.type === 'error') this.errors.push({ code: msg.code, message: msg.message });
      for (const l of [...this.listeners]) l(msg);
    });
  }

  static open(base: string, code: string): Promise<Client> {
    return new Promise((ok, fail) => {
      const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/${code}`);
      const c = new Client(ws);
      ws.once('open', () => ok(c));
      ws.once('error', fail);
    });
  }

  get id(): string {
    return this.you?.kind === 'player' ? this.you.id : '';
  }

  send(msg: ClientMsgInput): void {
    this.ws.send(JSON.stringify(msg));
  }

  waitFor(pred: (m: ServerMsg) => boolean, timeoutMs = 10_000): Promise<ServerMsg> {
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== listener);
        fail(new Error('timed out waiting for a server message'));
      }, timeoutMs);
      const listener = (m: ServerMsg) => {
        if (!pred(m)) return;
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== listener);
        ok(m);
      };
      this.listeners.push(listener);
    });
  }

  close(): void {
    this.ws.close();
  }
}

async function join(base: string, code: string, name: string, role: 'player' | 'screen'): Promise<Client> {
  const c = await Client.open(base, code);
  const welcome = c.waitFor((m) => m.type === 'welcome' || m.type === 'error');
  c.send({ type: 'hello', code, name, role });
  const m = await welcome;
  if (m.type !== 'welcome') throw new Error(`${name} could not join: ${JSON.stringify(m)}`);
  return c;
}

/** Strings that look like content-addressed asset ids (see src/core/hash.ts). */
function findAssetIds(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string' && /^[0-9a-f]{28}$/.test(value)) out.add(value);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) findAssetIds(v, out);
  return out;
}

// ---------- one game ----------

async function playGame(base: string, gameId: string, seed: number): Promise<string> {
  const def = serverGames[gameId];
  const t0 = Date.now();
  const res = await fetch(`${base}/api/rooms`, { method: 'POST' });
  if (res.status !== 201) throw new Error(`POST /api/rooms -> ${res.status}`);
  const { code } = (await res.json()) as { code: string };
  const info = await (await fetch(`${base}/api/rooms/${code}`)).json();
  if (!(info as { exists: boolean }).exists) throw new Error('GET /api/rooms/:code says the new room does not exist');

  const screen = await join(base, code, 'Screen', 'screen');
  const players: Client[] = [];
  const rest = (): Client[] => players.filter((p) => !screen.lobby?.inGame.includes(p.id));
  for (let i = 1; i <= PLAYERS; i++) players.push(await join(base, code, `Smoke ${i}`, 'player'));
  const all = [screen, ...players];

  const pong = screen.waitFor((m) => m.type === 'pong');
  screen.send({ type: 'ping', c: 1 });
  await pong;

  screen.send({ type: 'host', cmd: { type: 'selectGame', gameId } });
  screen.send({ type: 'host', cmd: { type: 'start' } });
  const started = (await screen.waitFor((m) => m.type === 'room' && m.lobby.phase === 'playing')) as Extract<ServerMsg, { type: 'room' }>;
  const seats = Math.min(PLAYERS, def.manifest.maxPlayers);
  if (started.lobby.inGame.length !== seats) throw new Error(`expected ${seats} seated, got ${started.lobby.inGame.length}`);
  if (PLAYERS === MAX_PLAYERS) {
    const extra = await Client.open(base, code);
    const refused = extra.waitFor((m) => m.type === 'error' || m.type === 'welcome');
    extra.send({ type: 'hello', code, name: 'One too many', role: 'player' });
    const m = await refused;
    extra.close();
    if (m.type !== 'error' || m.code !== 'room_full') throw new Error(`player ${PLAYERS + 1} was not refused with room_full: ${m.type}`);
  }

  const rng = new Rng(seed);
  let skips = 0;
  const done = screen.waitFor((m) => m.type === 'room' && m.lobby.phase === 'results', GAME_TIMEOUT_MS);
  const tick = setInterval(() => {
    for (const p of players) {
      if (p.view === null || screen.lobby?.phase !== 'playing') continue;
      const action = def.bot.act(JSON.parse(JSON.stringify(p.view)), rng, p.id);
      if (action !== null && action !== undefined) p.send({ type: 'action', payload: action });
    }
    const lastChange = Math.max(...all.map((c) => c.viewChangedAt));
    if (Date.now() - lastChange > STALE_SKIP_MS && screen.lobby?.phase === 'playing') {
      skips++;
      console.log(`  [${gameId}] no view change for ${STALE_SKIP_MS / 1000}s: screen sends skip #${skips}`);
      screen.send({ type: 'host', cmd: { type: 'skip' } });
      for (const c of all) c.viewChangedAt = Date.now();
    }
  }, BOT_INTERVAL_MS);

  try {
    const final = await done;
    const lobby = (final as Extract<ServerMsg, { type: 'room' }>).lobby;

    const assetIds = [...findAssetIds(screen.views), ...players.flatMap((p) => [...findAssetIds(p.views)])];
    let assetNote = 'no assets';
    if (assetIds.length) {
      const got = screen.waitFor((m) => m.type === 'assets');
      screen.send({ type: 'assetReq', ids: [assetIds[0]] });
      const m = (await got) as Extract<ServerMsg, { type: 'assets' }>;
      if (!(assetIds[0] in m.items)) throw new Error(`assetReq for ${assetIds[0]} returned nothing`);
      assetNote = `assets ok (${new Set(assetIds).size} ids)`;
    }

    const watchers = rest();
    const lateViews = watchers.filter((p) => p.view !== null);
    if (lateViews.length) throw new Error(`${lateViews.length} spectator(s) were sent a game view`);

    const fatal = all.flatMap((c) => c.errors).filter((e) => FATAL_ERRORS.has(e.code));
    if (fatal.length) throw new Error(`server errors: ${JSON.stringify(fatal.slice(0, 5))}`);
    if (lobby.lastResult?.gameId !== gameId) throw new Error('results phase without a result for this game');

    const names = new Map(lobby.players.map((p) => [p.id, p.name]));
    const scores = lobby.lastResult.ranking.map((id) => `${names.get(id) ?? id}=${lobby.lastResult!.scores[id]}`).join(', ');
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    return `PASS ${gameId} room ${code} in ${secs}s, ${lobby.inGame.length} seated + ${watchers.length} watching, ${skips} skips, ${assetNote}; scores: ${scores}`;
  } finally {
    clearInterval(tick);
    for (const c of all) c.close();
  }
}

// ---------- main ----------

async function main(): Promise<number> {
  const base = await startWrangler();
  const only = process.env.SMOKE_GAMES?.split(',').filter(Boolean);
  const ids = Object.keys(serverGames).filter((id) => !only || only.includes(id));
  if (!ids.length) throw new Error(`SMOKE_GAMES matched no game (have: ${Object.keys(serverGames).join(', ')})`);
  console.log(`smoke: ${ids.length} game(s): ${ids.join(', ')}; ${PLAYERS} players + 1 screen each`);
  let failures = 0;
  let seed = 1;
  for (const id of ids) {
    try {
      console.log(await playGame(base, id, seed++));
    } catch (err) {
      failures++;
      console.log(`FAIL ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures) console.log(`--- wrangler log tail ---\n${wranglerLog.join('').slice(-3000)}`);
  console.log(failures ? `smoke: ${failures} game(s) FAILED` : `smoke: all ${ids.length} game(s) passed`);
  return failures ? 1 : 0;
}

main()
  .catch((err) => {
    console.error('smoke: fatal:', err);
    return 1;
  })
  .then(async (code) => {
    await stopWrangler();
    process.exit(code);
  });
