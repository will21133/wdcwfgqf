import type { Weapon } from './weapon';
import { Rapier } from './rapier';
import { Maul } from './maul';
import { Bow } from './bow';
import { Chakram } from './chakram';

export function makeWeapon(id: string): Weapon {
  switch (id) {
    case 'maul': return new Maul();
    case 'bow': return new Bow();
    case 'chakram': return new Chakram();
    default: return new Rapier();
  }
}
