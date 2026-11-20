/**
 * Small seeded PRNG (mulberry32). The whole state is one uint32 (`state`),
 * so it survives JSON snapshots and Durable Object hibernation.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n) for one argument, or [min, max] inclusive for two. */
  int(n: number): number;
  int(min: number, max: number): number;
  int(a: number, b?: number): number {
    if (b === undefined) return Math.floor(this.next() * a);
    return a + Math.floor(this.next() * (b - a + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Random element; undefined for an empty array. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** Returns a new shuffled array (Fisher–Yates); the input is not modified. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** A fresh uint32, e.g. to seed a child Rng. */
  uint32(): number {
    return Math.floor(this.next() * 4294967296) >>> 0;
  }
}
