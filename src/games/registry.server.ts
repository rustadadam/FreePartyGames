// Server-side game registry. Adding a game = one import + one entry here, and one line in registry.client.ts.
import type { GameRegistry } from '../core/game';
import tapDuel from './_template/logic';
import forgery from './forgery/logic';
import comicStripClub from './comic-strip-club/logic';
import wikiWhat from './wiki-what/logic';
import crackedCookbook from './cracked-cookbook/logic';
import caveRave from './cave-rave/logic';
import secondWitness from './second-witness/logic';

export const serverGames: GameRegistry = {
  [tapDuel.manifest.id]: tapDuel,
  [forgery.manifest.id]: forgery,
  [comicStripClub.manifest.id]: comicStripClub,
  [wikiWhat.manifest.id]: wikiWhat,
  [crackedCookbook.manifest.id]: crackedCookbook,
  [caveRave.manifest.id]: caveRave,
  [secondWitness.manifest.id]: secondWitness,
};
