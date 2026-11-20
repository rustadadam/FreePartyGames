// NTP-style server clock estimate. Each ping carries the local send time `c`;
// the pong returns it with the server time `s`. With round trip rtt, the server
// clock at receipt is about s + rtt/2, so offset = s + rtt/2 - receivedAt.
// We keep the last few samples and trust the one with the lowest rtt (least queueing).

/** Monotonic-ish local epoch ms (immune to wall-clock jumps during a session). */
export function localNow(): number {
  return performance.timeOrigin + performance.now();
}

interface Sample {
  offset: number;
  rtt: number;
}

const KEEP = 8;

export class ServerClock {
  private samples: Sample[] = [];
  /** serverTime - localTime, in ms. */
  offset = 0;
  /** Round trip of the sample the offset came from, ms. Infinity until the first pong. */
  rtt = Infinity;
  private listeners = new Set<() => void>();

  /** Coarse estimate from `welcome.serverNow` (no rtt known yet). */
  seed(serverNow: number): void {
    if (this.samples.length === 0) {
      this.offset = serverNow - localNow();
      this.emit();
    }
  }

  /** Feed a pong. `c` is the local time the ping was sent, `s` the server time. */
  sample(c: number, s: number, receivedAt = localNow()): void {
    const rtt = Math.max(0, receivedAt - c);
    this.samples.push({ offset: s + rtt / 2 - receivedAt, rtt });
    if (this.samples.length > KEEP) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offset = best.offset;
    this.rtt = best.rtt;
    this.emit();
  }

  /** Estimated server time now, ms. */
  now(): number {
    return localNow() + this.offset;
  }

  /** Converts a server timestamp to the local clock (for scheduling audio, animations). */
  toLocal(serverMs: number): number {
    return serverMs - this.offset;
  }

  get synced(): boolean {
    return this.samples.length > 0;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
