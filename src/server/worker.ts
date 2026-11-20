// Worker entry: tiny router. Static assets (with SPA fallback) are served by the
// assets binding; only /api/* and /ws/* reach this code (run_worker_first).
import { generateCode, isValidCode, normalizeCode } from '../shared/roomCode';
import type { Env, RoomInfo } from './env';

export { RoomDO } from './RoomDO';

const CREATE_ATTEMPTS = 8;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

/** Accepts any case; returns the canonical code or null. */
function codeParam(raw: string): string | null {
  const code = normalizeCode(raw);
  return isValidCode(code) ? code : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/rooms') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      for (let i = 0; i < CREATE_ATTEMPTS; i++) {
        const code = generateCode();
        if (await roomStub(env, code).claim(code)) return json({ code }, 201);
      }
      return json({ error: 'no_free_code' }, 503);
    }

    const info = pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if (info && request.method === 'GET') {
      const code = codeParam(info[1]);
      const empty: RoomInfo = { exists: false, hasScreen: false, playerCount: 0, phase: null };
      if (!code) return json(empty, 404);
      const result = await roomStub(env, code).info();
      return json(result, result.exists ? 200 : 404);
    }

    const ws = pathname.match(/^\/ws\/([^/]+)$/);
    if (ws) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
      const code = codeParam(ws[1]);
      if (!code) return json({ error: 'bad_code' }, 404);
      return roomStub(env, code).fetch(request);
    }

    if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
