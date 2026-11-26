// Client-side game registry: lazy imports, so each game's UI is its own chunk
// and Node tests can import this file without loading Preact components.
// Keys must match registry.server.ts (enforced by tests/contract.test.ts).
import type { ClientGameModule } from '../client/gameModule';

export const clientGames: Record<string, () => Promise<ClientGameModule>> = {
  'tap-duel': () => import('./_template/ui').then((m) => m.default),
  forgery: () => import('./forgery/ui').then((m) => m.default),
  'comic-strip-club': () => import('./comic-strip-club/ui').then((m) => m.default),
  'wiki-what': () => import('./wiki-what/ui').then((m) => m.default),
  'cracked-cookbook': () => import('./cracked-cookbook/ui').then((m) => m.default),
  'cave-rave': () => import('./cave-rave/ui').then((m) => m.default),
  'second-witness': () => import('./second-witness/ui').then((m) => m.default),
  'alphabet-soup': () => import('./alphabet-soup/ui').then((m) => m.default),
};
