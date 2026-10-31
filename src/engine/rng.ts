/** Seeded PRNG (mulberry32). Every run uses its own stream so seeds are shareable. */
export class RNG {
  private s: number;
  constructor(seed: number = (Math.random() * 2 ** 32) >>> 0) {
    this.s = seed >>> 0;
  }
  get state() { return this.s; }
  set state(v: number) { this.s = v >>> 0; }

  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(a + (b - a + 1) * this.next()); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  fork(): RNG { return new RNG((this.next() * 2 ** 32) >>> 0); }
}

/** Global cosmetic RNG — for particles and other things that must not affect run determinism. */
export const fxRng = new RNG(12345);
export const frand = (a = 0, b = 1) => a + (b - a) * fxRng.next();
export const frandi = (a: number, b: number) => Math.floor(a + (b - a + 1) * fxRng.next());
export const fpick = <T>(arr: readonly T[]) => arr[Math.floor(fxRng.next() * arr.length)];
