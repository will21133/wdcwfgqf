// How a hand rewinds (PLAN2 §1.8). F3 implements 'standard' (Tick, GDD2 §3.2); P5 owns this file in
// production and adds Mina / Hora / Ling / Manman. A style prices a rewind and commits it: by the
// time `commit` runs the tape has been cut at the target (rec = the part rewound over, oldest first,
// rec.frames[0] = where the hand lands) and the travel animation has played.
import type { Player } from '../entities/player';
import type { Recording } from './rewind';
// ?drill=perfect registers itself (debug route; PLAN2 §2 F3)
import './rewindDrill';

export interface RewindStyle {
  id: string;
  /** Sand for rewinding `seconds` of tape (before any free-scrub rule) */
  cost(p: Player, seconds: number): number;
  /** land the hand: move, heal, restore tempo, mark culprits, leave the echo */
  commit(p: Player, frameIdx: number, rec: Recording): void;
  /** the hand travels back along its path (false: it stays put and only the effects happen) */
  teleports: boolean;
}

const STYLES = new Map<string, RewindStyle>();

export const RewindStyles = {
  register(s: RewindStyle): void { STYLES.set(s.id, s); },
  /** a style by id ('standard' when unknown) */
  get(id: string | undefined): RewindStyle { return (id && STYLES.get(id)) || STYLES.get('standard')!; },
  ids(): string[] { return [...STYLES.keys()]; },
};

/** GDD2 §3.2: clamp(round(33.4 × seconds), 25, 100); hg_dense's sandPerCharge < 100 makes it cheaper */
export function standardCost(p: Player, seconds: number): number {
  const m = p.mods;
  const base = Math.max(m.rewindMinCost, Math.min(100, Math.round(m.rewindCostPerSec * seconds)));
  return Math.max(1, Math.round(base * (m.sandPerCharge / 100)));
}

RewindStyles.register({
  id: 'standard',
  teleports: true,
  cost: standardCost,
  commit(p, _frameIdx, rec) {
    const f = rec.frames[0];
    p.x = f.x; p.y = f.y;
    p.dir = f.dir === 0 ? 'down' : f.dir === 1 ? 'up' : 'side';
    p.flip = f.flip;
    p.restoreFromFrame(f);
    p.markCulprits(rec);
    p.spawnEcho(rec);
  },
});
