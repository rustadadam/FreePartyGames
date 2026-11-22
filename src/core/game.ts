// The game contract. A game plugs into the platform only through GameDefinition
// plus one line in each registry (src/games/registry.server.ts / registry.client.ts).
import type { ZodType, ZodTypeDef } from 'zod';
import type { GameResult, Manifest, PlayerInfo, SettingField, Viewer } from '../shared/types';
import type { Rng } from './rng';

export interface GameCtx {
  /** Seeded, snapshot-safe randomness. Never use Math.random in game logic. */
  rng: Rng;
  /** Server clock in ms. Never use Date.now in game logic. */
  now(): number;
  /** (Re)arms timer `key` to fire onTimer(key) after `ms`. Survives hibernation. */
  setTimer(key: string, ms: number): void;
  clearTimer(key: string): void;
  /** ms timestamp the timer fires at, or null. Handy for countdowns in views. */
  timerAt(key: string): number | null;
  /** Stores JSON data once (e.g. drawing strokes) and returns its content id. Views reference ids. */
  putAsset(data: unknown): string;
  getAsset(id: string): unknown;
  /** Live, unstored traffic to every connected device (players and screen). */
  broadcastEphemeral(payload: unknown, opts?: { except?: string }): void;
  log(message: string, data?: unknown): void;
}

/**
 * S: game state. Must be plain JSON data (no Map/Set/class/undefined-in-arrays):
 *    it is snapshotted to storage and restored after hibernation.
 * A: action payload, validated by actionSchema before onAction ever sees it.
 */
export interface GameDefinition<S, A, Settings = Record<string, never>> {
  manifest: Manifest;
  defaultSettings: Settings;
  /**
   * Settings the host may change in the lobby (the shell renders them). Every key must be in
   * `defaultSettings` and every default must sit inside its field's range. `setup` receives
   * `defaultSettings` overlaid with the host's picks, already clamped, but should still read them defensively.
   */
  settingsFields?: SettingField[];
  actionSchema: ZodType<A, ZodTypeDef, unknown>;
  /** Players are in seat order. Arm the first timer(s) here. */
  setup(ctx: GameCtx, players: PlayerInfo[], settings: Settings): S;
  /** Mutate `state` in place. Ignore actions that make no sense in the current phase. */
  onAction(state: S, ctx: GameCtx, playerId: string, action: A): void;
  onTimer?(state: S, ctx: GameCtx, key: string): void;
  /** A player left or was kicked. The game must not wait on them forever. */
  onPlayerLeave?(state: S, ctx: GameCtx, playerId: string): void;
  /** A player who left came back (only after onPlayerLeave). */
  onPlayerReturn?(state: S, ctx: GameCtx, playerId: string): void;
  /** Per-viewer projection. Must not contain anything this viewer may not know. Keep it small. */
  view(state: S, viewer: Viewer): unknown;
  /** Non-null means the game is over. */
  result(state: S): GameResult | null;
  bot: {
    /** Called periodically for each bot with that bot's own view. Return null to do nothing. */
    act(view: unknown, rng: Rng, me: string): A | null;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = GameDefinition<any, any, any>;
export type GameRegistry = Record<string, AnyGame>;

/** Identity helper for type inference: `export default defineGame({...})`. */
export function defineGame<S, A, Settings>(def: GameDefinition<S, A, Settings>): GameDefinition<S, A, Settings> {
  return def;
}
