import type { RoomDO } from './RoomDO';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  ASSETS: Fetcher;
  /** "1" enables dev features (bots, hidden games). Off in wrangler.jsonc; `npm run worker` and smoke turn it on. */
  DEV_BOTS?: string;
}

/** GET /api/rooms/:code response. */
export interface RoomInfo {
  exists: boolean;
  hasScreen: boolean;
  playerCount: number;
  phase: string | null;
}
