// Patron rescue & affinity (GDD2 §6.5). F2 provides the API on top of the save's `rescued` /
// `affinity` fields; P6 owns this file and fills in the rules (rescue rooms, affinity levels, perks).
import type { Patron } from './memories';
import { profile, saveProfile } from '../save';

/** affinity points needed for each level (P6 tunes these) */
const LEVELS = [0, 3, 8, 15, 25];

export const Patrons = {
  isRescued(p: Patron): boolean { return profile.rescued.includes(p); },
  rescue(p: Patron): void {
    if (profile.rescued.includes(p)) return;
    profile.rescued.push(p);
    saveProfile();
  },
  addAffinity(p: Patron, n: number): void {
    profile.affinity[p] = Math.max(0, (profile.affinity[p] ?? 0) + n);
    saveProfile();
  },
  /** 0 … 4 */
  level(p: Patron): number {
    const a = profile.affinity[p] ?? 0;
    let l = 0;
    while (l + 1 < LEVELS.length && a >= LEVELS[l + 1]) l++;
    return l;
  },
};
