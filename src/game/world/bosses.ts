// Boss registry by floor.
import type { Boss } from '../entities/boss';
import { Foreman } from '../entities/bosses/foreman';
import { LanternMoth } from '../entities/bosses/moth';
import { Archivist } from '../entities/bosses/archivist';
import { Stillness } from '../entities/bosses/stillness';

export const BOSSES: ((x: number, y: number) => Boss)[] = [
  (x, y) => new Foreman(x, y),
  (x, y) => new LanternMoth(x, y),
  (x, y) => new Archivist(x, y),
  (x, y) => new Stillness(x, y),
];

export function makeBoss(floor: number, x: number, y: number): Boss | null {
  const f = BOSSES[floor];
  return f ? f(x, y) : null;
}

/** boss ids in floor order (routes.ts names a floor's boss by id) */
export const BOSS_IDS = ['foreman', 'moth', 'archivist', 'stillness'];
const BOSS_BY_ID: Record<string, (x: number, y: number) => Boss> = {};
BOSS_IDS.forEach((id, i) => { BOSS_BY_ID[id] = BOSSES[i]; });

/** register a boss under an id (P3: new bosses for branches and secret routes) */
export function registerBoss(id: string, make: (x: number, y: number) => Boss) { BOSS_BY_ID[id] = make; }
export function makeBossById(id: string, x: number, y: number): Boss | null {
  const f = BOSS_BY_ID[id];
  return f ? f(x, y) : null;
}
