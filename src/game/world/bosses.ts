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
