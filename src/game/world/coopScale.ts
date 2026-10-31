// Multiplayer scaling (GDD2 §5.8). Bullet counts and fire rates never scale with the number of
// hands, so the screen stays readable; health, budgets and income do.
export interface CoopScale {
  /** normal enemy health */
  enemyHp: number;
  /** wave point budget */
  budget: number;
  /** elite and boss health */
  eliteHp: number;
  /** break (poise) bar cap — P1 applies it to the poise bar */
  poise: number;
  /** brass income (enemy drops and brass rooms) */
  brass: number;
  /** echoes each hand may keep at once */
  echoCap: number;
  /** extra elite affixes (P2) */
  eliteAffixes: number;
  /** extra boss bullet patterns (P3) */
  bossVolleys: number;
}

const TABLE: CoopScale[] = [
  { enemyHp: 1, budget: 1, eliteHp: 1, poise: 1, brass: 1, echoCap: 3, eliteAffixes: 0, bossVolleys: 0 },
  { enemyHp: 1.45, budget: 1.3, eliteHp: 1.6, poise: 1.3, brass: 1.3, echoCap: 3, eliteAffixes: 0, bossVolleys: 0 },
  { enemyHp: 1.9, budget: 1.6, eliteHp: 2.2, poise: 1.6, brass: 1.6, echoCap: 2, eliteAffixes: 1, bossVolleys: 1 },
  { enemyHp: 2.35, budget: 1.9, eliteHp: 2.8, poise: 1.9, brass: 1.9, echoCap: 2, eliteAffixes: 1, bossVolleys: 1 },
];

/** the scaling row for n hands (1..4) */
export function coopScale(n: number): CoopScale {
  return TABLE[Math.max(1, Math.min(4, Math.round(n) || 1)) - 1];
}
