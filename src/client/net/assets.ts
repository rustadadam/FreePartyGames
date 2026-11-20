// Client asset cache. Asset ids are content hashes, so one cache serves every room and
// game for the life of the page: each id is fetched once and kept.
import { MAX_ASSET_REQ } from '../../shared/limits';
import type { AssetMap } from '../gameModule';

type Requester = (ids: string[]) => void;

export class AssetCache {
  /** Replaced (not mutated) on every change, so components can compare by identity. */
  map: AssetMap = {};
  private pending = new Set<string>();
  private queued = new Set<string>();
  private listeners = new Set<() => void>();
  private requester: Requester | null = null;
  private flushScheduled = false;

  /** The live connection's sender. Pending ids are re-requested when it changes (reconnect). */
  setRequester(fn: Requester | null): void {
    this.requester = fn;
    if (fn && this.pending.size) {
      for (const id of this.pending) this.queued.add(id);
      this.pending.clear();
      this.schedule();
    }
  }

  /** Ask for ids not yet cached. Batched per microtask, chunked to the protocol cap. */
  request(ids: readonly string[]): void {
    let added = false;
    for (const id of ids) {
      if (typeof id !== 'string' || !id || id in this.map || this.pending.has(id) || this.queued.has(id)) continue;
      this.queued.add(id);
      added = true;
    }
    if (added) this.schedule();
  }

  receive(items: Record<string, unknown>): void {
    const ids = Object.keys(items);
    if (!ids.length) return;
    const next = { ...this.map };
    for (const id of ids) {
      next[id] = items[id];
      this.pending.delete(id);
    }
    this.map = next;
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private schedule(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      if (!this.requester || !this.queued.size) return;
      const ids = [...this.queued];
      this.queued.clear();
      for (const id of ids) this.pending.add(id);
      for (let i = 0; i < ids.length; i += MAX_ASSET_REQ) this.requester(ids.slice(i, i + MAX_ASSET_REQ));
    });
  }
}

/** The page-wide cache. */
export const assetCache = new AssetCache();
