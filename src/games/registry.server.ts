// Server-side game registry. Adding a game = one line here + one in registry.client.ts.
import type { GameRegistry } from '../core/game';
import tapDuel from './_template/logic';
import caveRave from './cave-rave/logic';

export const serverGames: GameRegistry = {
  [tapDuel.manifest.id]: tapDuel,
  [caveRave.manifest.id]: caveRave,
};
