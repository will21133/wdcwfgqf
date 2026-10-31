// Stock (gearworks) generator props, unless the floor's biome claims them.
import { WallLamp, WallGear, Breakable } from '../entities/props';
import type { World } from './world';
import type { RoomMap } from './room';
import type { Theme } from '../../art/themes';
import { BIOMES } from '../../art/biomes';

/** spawn the stock generator props unless the floor's biome claims them */
export function spawnStockProps(w: World, map: RoomMap, th: Theme) {
  const claimed = new Set(BIOMES[th.id]?.claimsProps ?? []);
  for (const p of map.props) {
    if (claimed.has(p.type)) continue;
    if (p.type === 'walllamp') w.add(new WallLamp(p.tx, p.ty, th.lamp, th.lampLight));
    else if (p.type === 'wallgear') w.add(new WallGear(p.tx, p.ty, !!p.data?.big));
    else if (p.type === 'crate' || p.type === 'barrel') w.add(new Breakable(p.tx, p.ty, p.type));
  }
}
