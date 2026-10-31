// The hands you can play (GDD2 §5.2). F2 seeds the table with Tick; P5 adds Mina, Hora, Ling and
// Manman (and owns this file in production).
import { L, type L10n } from '../i18n';
import type { Mods } from '../run';
import type { ColorKey } from '../ui/text';

export interface HandDef {
  id: 'tick' | 'mina' | 'hora' | 'ling' | 'manman';
  name: L10n;
  title: L10n;
  maxHp: number;
  /** move speed, px/s */
  speed: number;
  dashes: number;
  /** rewind tape length, seconds */
  tape: number;
  /** 'standard' | 'long' | 'hold' | 'snooze' | 'slow' (F3 / P5 implement the styles) */
  rewindStyle: string;
  /** stat changes on top of BASE_MODS (Tick's numbers are the base) */
  mods?(m: Mods): void;
  /** palette letter overrides for buildTick (the slot scarf is applied on top) */
  palette?: Record<string, ColorKey>;
  /** body variant key for buildTick */
  variant?: string;
  /** unlock id required in single player (guests in co-op may use every hand) */
  unlock?: string;
}

export const HANDS: Record<string, HandDef> = {
  tick: {
    id: 'tick',
    name: L('滴答', 'Tick'),
    title: L('秒针', 'The Second Hand'),
    maxHp: 50, speed: 96, dashes: 2, tape: 3,
    rewindStyle: 'standard',
  },
};

export function handDef(id: string | undefined): HandDef { return (id && HANDS[id]) || HANDS.tick; }
