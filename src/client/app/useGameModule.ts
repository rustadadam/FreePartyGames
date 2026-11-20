// Lazy-loads a game's UI chunk through the client registry, once per page.
import { useEffect, useState } from 'preact/hooks';
import { clientGames } from '../../games/registry.client';
import type { ClientGameModule } from '../gameModule';

const loaded = new Map<string, ClientGameModule>();
const loading = new Map<string, Promise<ClientGameModule>>();

export function loadGameModule(id: string): Promise<ClientGameModule> | null {
  const importer = clientGames[id];
  if (!importer) return null;
  let p = loading.get(id);
  if (!p) {
    p = importer().then((m) => {
      loaded.set(id, m);
      return m;
    });
    p.catch(() => loading.delete(id)); // allow a retry after a failed chunk fetch
    loading.set(id, p);
  }
  return p;
}

export type GameModuleState = { mod: ClientGameModule | null; error: boolean; retry(): void };

export function useGameModule(id: string | null): GameModuleState {
  const [mod, setMod] = useState<ClientGameModule | null>(id ? (loaded.get(id) ?? null) : null);
  const [error, setError] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!id) return setMod(null);
    const ready = loaded.get(id);
    if (ready) return setMod(ready);
    setMod(null);
    setError(false);
    let live = true;
    const p = loadGameModule(id);
    if (!p) return setError(true);
    p.then(
      (m) => live && setMod(m),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [id, tries]);
  return { mod, error, retry: () => setTries((t) => t + 1) };
}
