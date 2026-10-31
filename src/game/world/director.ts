// Encounter director: builds wave plans from a point budget per floor/room.
import type { RNG } from '../../engine/rng';
import type { EnemyDef } from './enemyDef';
import { ROSTER as F1 } from '../entities/enemies/gearworks';
import { ROSTER as F2 } from '../entities/enemies/conservatory';
import { ROSTER as F3 } from '../entities/enemies/archive';
import { ROSTER as F4 } from '../entities/enemies/clockface';
export type { EnemyDef };

/** per floor; an empty roster falls back to the previous floor's (during development) */
export const ROSTERS: EnemyDef[][] = [F1, F2, F3, F4];

export function rosterFor(floor: number): EnemyDef[] {
  for (let f = Math.min(floor, ROSTERS.length - 1); f >= 0; f--) if (ROSTERS[f].length) return ROSTERS[f];
  return ROSTERS[0];
}

export function findEnemy(id: string): EnemyDef | undefined {
  for (const r of ROSTERS) for (const d of r) if (d.id === id) return d;
  return undefined;
}

export interface Wave { defs: EnemyDef[] }

export function planWaves(rng: RNG, floor: number, roomIdx: number, elite: boolean, overwind = 0): Wave[] {
  const roster = rosterFor(floor);
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
