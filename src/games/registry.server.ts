// Server-side game registry. Adding a game = one line here + one in registry.client.ts.
import type { GameRegistry } from '../core/game';
import tapDuel from './_template/logic';
import wikiWhat from './wiki-what/logic';

export const serverGames: GameRegistry = {
  [tapDuel.manifest.id]: tapDuel,
  [wikiWhat.manifest.id]: wikiWhat,
};
