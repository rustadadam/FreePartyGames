// What a game's ui.tsx default-exports. Loaded lazily through src/games/registry.client.ts.
import type { FunctionComponent } from 'preact';
import type { Lobby } from '../shared/types';

/** Asset id -> data, filled as `assets` messages arrive. */
export type AssetMap = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PlayerProps<V = any, A = unknown> {
  view: V;
  send(action: A): void;
  /** This player's id. */
  me: string;
  assets: AssetMap;
  /** Names, colors and scores for the ids that views reference. */
  lobby: Lobby;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ScreenProps<V = any> {
  view: V;
  assets: AssetMap;
  lobby: Lobby;
}

export interface ClientGameModule {
  Player: FunctionComponent<PlayerProps>;
  Screen: FunctionComponent<ScreenProps>;
  Rules: FunctionComponent;
}
