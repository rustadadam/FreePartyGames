// Plain data types shared by server, client and games. No runtime code here.

export type Role = 'player' | 'screen';

/** Who is looking at a view. Games project their state per viewer. */
export type Viewer = { kind: 'player'; id: string } | { kind: 'screen' };

/** What a game knows about a player at setup. */
export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
}

export interface LobbyPlayer extends PlayerInfo {
  isHost: boolean;
  connected: boolean;
  /** Left, or disconnected past the grace period: cannot be seated in a game. Absent counts as present. */
  away?: boolean;
  /** Cumulative across games played in this room. */
  score: number;
}

export type ScreenMode = 'required' | 'optional' | 'none';

export interface Manifest {
  /** Lowercase slug, also the registry key. */
  id: string;
  title: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  screen: ScreenMode;
  estMinutes: number;
  /** Hidden games (e.g. the dev template) are listed only in dev builds. */
  hidden?: boolean;
}

/**
 * One number the host can change in the lobby before a game starts (rounds, seconds per phase).
 * A game lists these as `settingsFields`; the shell renders them, so no game ships settings UI.
 */
export interface SettingField {
  /** Key in the game's settings object (and in `defaultSettings`). */
  key: string;
  label: string;
  /** One short line under the label. */
  hint?: string;
  min: number;
  max: number;
  step: number;
  /** Shown after the value, e.g. 's' for seconds. */
  unit?: string;
}

/** The selected game's settings, as the lobby shows them. */
export interface LobbySettings {
  gameId: string;
  fields: SettingField[];
  values: Record<string, number>;
}

/** Returned by GameDefinition.result() when the game is over. */
export interface GameResult {
  /** Points earned this game, per player id. Missing ids score 0. */
  scores: Record<string, number>;
  /** Optional one-line recap shown in the results screen. */
  summary?: string;
}

export interface LastResult extends GameResult {
  gameId: string;
  /** Player ids ordered by this game's score, best first. */
  ranking: string[];
}

export type RoomMode = 'screen' | 'hostPlayer';
export type Phase = 'lobby' | 'playing' | 'results';

export interface Lobby {
  code: string;
  /** Set by the first device to join: a screen makes 'screen', a player makes 'hostPlayer'. */
  mode: RoomMode | null;
  /** Who holds host controls right now. */
  host: Viewer | null;
  players: LobbyPlayer[];
  hasScreen: boolean;
  screenConnected: boolean;
  phase: Phase;
  selectedGameId: string | null;
  /** Host-editable settings of the selected game, or null when it has none. */
  settings: LobbySettings | null;
  /** Game being played (or whose results are showing). */
  currentGameId: string | null;
  /** Player ids seated in the current game. Players who joined later wait for the next one. */
  inGame: string[];
  games: Manifest[];
  lastResult: LastResult | null;
  maxPlayers: number;
  /** Dev build: bots and hidden games are available. */
  dev: boolean;
}
