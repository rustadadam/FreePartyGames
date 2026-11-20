// Wire protocol. Every inbound message is validated with these schemas at the boundary.
import { z } from 'zod';
import type { Lobby, Viewer } from './types';

/** Inbound raw message cap (UTF-16 length of the string, close enough to bytes for ASCII JSON). */
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** Cap on one serialized game view per viewer. Enforced by the contract test. */
export const MAX_VIEW_BYTES = 64 * 1024;
export const MAX_NAME_LENGTH = 24;
export const MAX_TOKEN_LENGTH = 64;
export const MAX_ID_LENGTH = 64;
export const MAX_ASSET_REQ = 64;
export const MAX_BOTS_PER_REQUEST = 20;

/** Trims, collapses whitespace and strips control characters. May return ''. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const Id = z.string().min(1).max(MAX_ID_LENGTH);
const Name = z
  .string()
  .max(200)
  .transform(sanitizeName)
  .pipe(z.string().min(1).max(MAX_NAME_LENGTH));

export const ManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
    title: z.string().min(1).max(40),
    tagline: z.string().min(1).max(120),
    minPlayers: z.number().int().min(1).max(20),
    maxPlayers: z.number().int().min(1).max(20),
    screen: z.enum(['required', 'optional', 'none']),
    estMinutes: z.number().positive().max(120),
    hidden: z.boolean().optional(),
  })
  .strict();

// ---- client -> server ----

export const HostCmdSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('selectGame'), gameId: Id }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('skip') }).strict(),
  z.object({ type: z.literal('kick'), playerId: Id }).strict(),
  z.object({ type: z.literal('returnToLobby') }).strict(),
  z.object({ type: z.literal('addBots'), count: z.number().int().min(1).max(MAX_BOTS_PER_REQUEST) }).strict(),
]);

export const ClientMsgSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('hello'),
      code: z.string().max(8),
      token: z.string().min(1).max(MAX_TOKEN_LENGTH).optional(),
      name: Name,
      role: z.enum(['player', 'screen']),
    })
    .strict(),
  z.object({ type: z.literal('action'), payload: z.unknown() }).strict(),
  z.object({ type: z.literal('host'), cmd: HostCmdSchema }).strict(),
  z.object({ type: z.literal('ping'), c: z.number().finite() }).strict(),
  z.object({ type: z.literal('assetReq'), ids: z.array(Id).max(MAX_ASSET_REQ) }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
]);

export type HostCmd = z.infer<typeof HostCmdSchema>;
export type ClientMsg = z.infer<typeof ClientMsgSchema>;
/** What a client may send (pre-sanitization input shape). */
export type ClientMsgInput = z.input<typeof ClientMsgSchema>;

// ---- server -> client ----

export type ErrorCode =
  | 'bad_message'
  | 'not_joined'
  | 'wrong_room'
  | 'room_full'
  | 'screen_taken'
  | 'not_host'
  | 'bad_command'
  | 'bad_action'
  | 'not_in_game'
  | 'kicked'
  | 'replaced'
  | 'game_error';

export type ServerMsg =
  | { type: 'welcome'; you: Viewer; token: string; serverNow: number }
  | { type: 'room'; lobby: Lobby }
  | { type: 'view'; gameView: unknown }
  | { type: 'ephemeral'; payload: unknown }
  | { type: 'assets'; items: Record<string, unknown> }
  | { type: 'pong'; c: number; s: number }
  | { type: 'error'; code: ErrorCode; message: string };

export type ServerMsgOf<T extends ServerMsg['type']> = Extract<ServerMsg, { type: T }>;
