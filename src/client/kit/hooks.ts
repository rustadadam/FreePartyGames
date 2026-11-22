// Hooks games use to reach the room: server clock, assets, ephemeral messages.
// They work outside a room too (Rules previews, tests): the clock falls back to local time.
import { useEffect, useRef, useState } from 'preact/hooks';
import { assetCache } from '../net/assets';
import { ServerClock } from '../net/clock';
import { useRoomClient } from '../net/context';
import type { AssetMap } from '../gameModule';

const localClock = new ServerClock();

/** The NTP-style server clock: `.now()` (server ms), `.toLocal(serverMs)`, `.offset`, `.rtt`, `.synced`. */
export function useServerClock(): ServerClock {
  return useRoomClient()?.clock ?? localClock;
}

/** Server time in ms, re-rendering every `everyMs` (default 250). Pass 0 to pause ticking. */
export function useServerNow(everyMs = 250): number {
  const clock = useServerClock();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    setNow(clock.now());
    const unsub = clock.subscribe(() => setNow(clock.now()));
    if (!everyMs) return unsub;
    const t = setInterval(() => setNow(clock.now()), everyMs);
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [clock, everyMs]);
  return now;
}

/**
 * Fetches the given asset ids (once per page, shared across games) and returns the whole
 * cache. Missing ids are simply absent until their `assets` message arrives.
 */
export function useAssets(ids: readonly (string | null | undefined)[] = []): AssetMap {
  const [map, setMap] = useState(assetCache.map);
  const key = ids.filter(Boolean).join(',');
  useEffect(() => assetCache.subscribe(() => setMap(assetCache.map)), []);
  useEffect(() => {
    if (key) assetCache.request(key.split(','));
  }, [key]);
  return map;
}

/** One asset, typed by the caller. Undefined while loading. */
export function useAsset<T = unknown>(id: string | null | undefined): T | undefined {
  const map = useAssets(id ? [id] : []);
  return id ? (map[id] as T | undefined) : undefined;
}

/** Subscribes to the room's ephemeral channel (live, unstored traffic) while mounted. */
export function useEphemeral(handler: (payload: unknown) => void): void {
  const client = useRoomClient();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => client?.onEphemeral((p) => ref.current(p)), [client]);
}
