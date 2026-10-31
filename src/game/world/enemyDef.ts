import type { Enemy } from '../entities/enemy';

export interface EnemyDef {
  id: string;
  /** budget cost (cogling = 2, sentry = 3, elite ≈ 14) */
  cost: number;
  /** spawn a group of this many */
  group?: number;
  make: (x: number, y: number) => Enemy;
  elite?: boolean;
  /** minimum room index on the floor where it may appear */
  minRoom?: number;
  weight?: number;
  /** codex (ledger) entry */
  name?: { zh: string; en: string };
  desc?: { zh: string; en: string };
}
