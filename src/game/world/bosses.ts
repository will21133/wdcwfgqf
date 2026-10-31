// Boss registry by floor.
import type { Boss } from '../entities/boss';
import { Foreman } from '../entities/bosses/foreman';

export const BOSSES: ((x: number, y: number) => Boss)[] = [
  (x, y) => new Foreman(x, y),
];

export function makeBoss(floor: number, x: number, y: number): Boss | null {
  const f = BOSSES[floor];
  return f ? f(x, y) : null;
}
