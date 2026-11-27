// Wire protocol. Every inbound message is validated with these schemas at the boundary.
import { z } from 'zod';
import type { Lobby, Viewer } from './types';
import { MAX_ASSET_REQ, MAX_BOTS_PER_REQUEST, MAX_ID_LENGTH, MAX_NAME_LENGTH, MAX_TOKEN_LENGTH, sanitizeName } from './limits';

export * from './limits';

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
    minPlayers: z.number().int().min(1).max(30),
    maxPlayers: z.number().int().min(1).max(30),
    screen: z.enum(['required', 'optional', 'none']),
    estMinutes: z.number().positive().max(120),
    hidden: z.boolean().optional(),
  })
  .strict();

// ---- client -> server ----

export const HostCmdSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('selectGame'), gameId: Id }).strict(),
  z.object({ type: z.literal('setSetting'), key: Id, value: z.number().finite() }).strict(),
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
  z.object({ type: z.literal('action'), payload: z.unknown(), id: z.string().uuid().optional() }).strict(),
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
  | { type: 'actionAck'; id: string }
  | { type: 'error'; code: ErrorCode; message: string };

export type ServerMsgOf<T extends ServerMsg['type']> = Extract<ServerMsg, { type: T }>;
