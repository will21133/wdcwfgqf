// The player's real local clock (PLAN2 §1.2), for real-time eggs (GDD2 §11.2) and chime #11.
// Never used for game logic or simulation timing.
//
// · ?fakeTime=2026-10-31T23:59:30  starts the clock at that local time and lets it run on.
// · RealClock.freeze(d) pins it (daily runs and seeded runs freeze it so real-time eggs stay off);
//   freeze(null) releases it.

function parseFake(): { base: number; t0: number } | null {
  try {
    const v = new URLSearchParams(location.search).get('fakeTime');
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) { console.warn(`[clock] bad fakeTime "${v}"`); return null; }
    return { base: d.getTime(), t0: performance.now() };
  } catch { return null; }
}

const fake = parseFake();
let frozen: Date | null = null;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export const RealClock = {
  now(): Date {
    if (frozen) return new Date(frozen.getTime());
    if (fake) return new Date(fake.base + (performance.now() - fake.t0));
    return new Date();
  },
  freeze(d: Date | null): void { frozen = d ? new Date(d.getTime()) : null; },
  get frozen(): boolean { return frozen !== null; },
  /** local time within [h1:m1:00, h2:m2:59]; the range may wrap past midnight */
  isBetween(h1: number, m1: number, h2: number, m2: number): boolean {
    const d = RealClock.now();
    const t = d.getHours() * 60 + d.getMinutes();
    const a = mod(h1 * 60 + m1, 1440), b = mod(h2 * 60 + m2, 1440);
    return a <= b ? t >= a && t <= b : t >= a || t <= b;
  },
  /** month 1–12 */
  dateIs(month: number, day: number): boolean {
    const d = RealClock.now();
    return d.getMonth() + 1 === month && d.getDate() === day;
  },
  season(): 'halloween' | 'newyear' | 'leap' | 'pi' | null {
    if (RealClock.dateIs(10, 31)) return 'halloween';
    if (RealClock.dateIs(12, 31) || RealClock.dateIs(1, 1)) return 'newyear';
    if (RealClock.dateIs(2, 29)) return 'leap';
    if (RealClock.dateIs(3, 14)) return 'pi';
    return null;
  },
};
