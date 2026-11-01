// Floor routes (PLAN2 §1.5): the run's floors in order. The default route is 1.0's four floors;
// P3 adds branch floors (the Lost Minute, the Belfry) with Routes.registerBranch.
import type { Run } from './run';
import { L, type L10n } from './i18n';
import { THEMES, type Theme } from '../art/themes';

export interface FloorDesc {
  id: string;
  /** a THEMES index, or a theme key */
  theme: number | string;
  /** rooms before the boss (rooms 0 … rooms-1, the boss is room `rooms`) */
  rooms: number;
  /** boss id (world/bosses.ts BOSS_IDS / registerBoss), null = an elite fight instead */
  boss: string | null;
  name: L10n;
  /** the floor card's time code (GDD2 §12.3), e.g. '11:59:59.25' */
  timecode: string;
}

export interface FloorBranch { id: string; afterFloor: number; cond(run: Run): boolean; floor: FloorDesc }

const t = (i: number) => THEMES[i].name as L10n;
const DEFAULT: FloorDesc[] = [
  { id: 'gearworks', theme: 0, rooms: 9, boss: 'foreman', name: t(0), timecode: '11:59:59.00' },
  { id: 'conservatory', theme: 1, rooms: 9, boss: 'moth', name: t(1), timecode: '11:59:59.25' },
  { id: 'archive', theme: 2, rooms: 9, boss: 'archivist', name: t(2), timecode: '11:59:59.50' },
  { id: 'clockface', theme: 3, rooms: 9, boss: 'stillness', name: t(3), timecode: '11:59:59.75' },
];
const BRANCHES: FloorBranch[] = [];

/** a floor when the route is shorter than the run's floor counter (never in 1.0) */
const FALLBACK = (i: number): FloorDesc => ({ ...DEFAULT[DEFAULT.length - 1], id: `extra${i}`, name: L('更高处', 'Higher still') });

export const Routes = {
  /** this run's floors in order: the four defaults with any branch whose condition holds spliced in */
  floors(run: Run): FloorDesc[] {
    const out = DEFAULT.slice();
    for (const b of BRANCHES) {
      if (!b.cond(run)) continue;
      const at = out.findIndex((f) => f === DEFAULT[b.afterFloor]);
      out.splice(at < 0 ? out.length : at + 1, 0, b.floor);
    }
    return out;
  },
  /** the floor the run is on (or floor index i) */
  floor(run: Run, i = run.floor): FloorDesc {
    const fl = Routes.floors(run);
    return fl[i] ?? FALLBACK(i);
  },
  /** is floor i the last one of the route */
  isLast(run: Run, i = run.floor): boolean { return i >= Routes.floors(run).length - 1; },
  registerBranch(b: FloorBranch): void {
    const k = BRANCHES.findIndex((x) => x.id === b.id);
    if (k >= 0) BRANCHES[k] = b; else BRANCHES.push(b);
  },
  /** the art theme of a floor */
  theme(f: FloorDesc): Theme {
    const th = typeof f.theme === 'number' ? THEMES[f.theme] : THEMES.find((x) => x.key === f.theme);
    return th ?? THEMES[Math.min(THEMES.length - 1, Math.max(0, Number(f.theme) || 0))];
  },
  defaults(): readonly FloorDesc[] { return DEFAULT; },
};
