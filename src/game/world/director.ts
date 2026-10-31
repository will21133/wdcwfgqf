// Encounter director: builds wave plans from a point budget per floor/room.
import type { RNG } from '../../engine/rng';
import type { Enemy } from '../entities/enemy';
import { Cogling, Sentry, Spitter, Mite, Brute } from '../entities/enemies/gearworks';

export interface EnemyDef {
  id: string;
  cost: number;
  /** spawn a group of this many */
  group?: number;
  make: (x: number, y: number) => Enemy;
  elite?: boolean;
  /** minimum room index on the floor where it may appear */
  minRoom?: number;
  weight?: number;
}

export const ROSTERS: EnemyDef[][] = [
  [
    { id: 'cogling', cost: 2, make: (x, y) => new Cogling(x, y), weight: 3 },
    { id: 'mite', cost: 1, group: 3, make: (x, y) => new Mite(x, y), weight: 2 },
    { id: 'sentry', cost: 3, make: (x, y) => new Sentry(x, y), weight: 3, minRoom: 1 },
    { id: 'spitter', cost: 3, make: (x, y) => new Spitter(x, y), weight: 2.5, minRoom: 1 },
    { id: 'brute', cost: 14, make: (x, y) => new Brute(x, y), elite: true },
  ],
];

export interface Wave { defs: EnemyDef[] }

export function planWaves(rng: RNG, floor: number, roomIdx: number, elite: boolean, overwind = 0): Wave[] {
  const roster = ROSTERS[Math.min(floor, ROSTERS.length - 1)];
  const normal = roster.filter((d) => !d.elite && (d.minRoom ?? 0) <= roomIdx);
  const elites = roster.filter((d) => d.elite);
  const budget = 7 + floor * 5 + roomIdx * 1.6 + overwind * 2;
  const nWaves = roomIdx < 2 ? 2 : rng.chance(0.5) ? 3 : 2;
  const waves: Wave[] = [];
  for (let w = 0; w < nWaves; w++) {
    let b = budget / nWaves * (w === nWaves - 1 ? 1.25 : 1);
    const defs: EnemyDef[] = [];
    if (elite && w === nWaves - 1 && elites.length) {
      const e = rng.pick(elites);
      defs.push(e);
      b -= e.cost * 0.6;
    }
    let guard = 0;
    while (b > 0.5 && guard++ < 40) {
      const d = rng.weighted(normal, (x) => (x.cost <= b + 1 ? x.weight ?? 1 : 0));
      if (!d) break;
      defs.push(d);
      b -= d.cost;
    }
    waves.push({ defs });
  }
  return waves;
}
