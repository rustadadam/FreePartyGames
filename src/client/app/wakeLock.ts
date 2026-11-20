// Keeps a phone's screen awake while it is in a room. The browser drops the lock
// whenever the tab is hidden, so it is re-acquired on visibilitychange.
import { useEffect } from 'preact/hooks';

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock;
    if (!active || !wl) return;
    let sentinel: Sentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        sentinel = await wl.request('screen');
        if (stopped) void sentinel.release();
      } catch {
        /* denied (battery saver, unsupported context): nothing to do */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
