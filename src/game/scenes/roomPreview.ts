// Debug: room generator / renderer review (?scene=room&seed=1&biome=0[&kind=combat])
// Renders through the real World (biome decor, lamps, lighting) with a fixed camera.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import { G } from '../G';
import { RNG } from '../../engine/rng';
import { generateRoom, RoomKind } from '../world/roomgen';
import { THEMES } from '../../art/themes';
import { World } from '../world/world';
import { WallLamp, WallGear, Breakable } from '../entities/props';
import { BIOMES } from '../../art/biomes';
import { Run } from '../run';

export class RoomPreview implements Scene {
  w: World;
  constructor(seed: number, biome: number) {
    const kind = (G.debug.get('kind') as RoomKind) ?? 'combat';
    const m = generateRoom({ rng: new RNG(seed), kind, biome, exits: 3 });
    const th = THEMES[biome];
    this.w = new World(m, th, seed);
    this.w.run = new Run(seed);
    for (const p of m.props) {
      if (p.type === 'walllamp') this.w.add(new WallLamp(p.tx, p.ty, th.lamp, th.lampLight));
      else if (p.type === 'wallgear') this.w.add(new WallGear(p.tx, p.ty, !!p.data?.big));
      else if (p.type === 'crate' || p.type === 'barrel') this.w.add(new Breakable(p.tx, p.ty, p.type));
    }
    BIOMES[biome]?.decorate?.(this.w, m, new RNG(seed + 99));
    this.w.flushAdds();
    this.w.cam.snap(m.pw / 2, m.ph / 2);
  }
  update(dt: number) { this.w.update(dt); }
  render(r: Renderer) {
    const th = this.w.theme;
    const pp = r.params;
    pp.tint = th.grade.tint; pp.lift = th.grade.lift; pp.saturation = th.grade.sat; pp.contrast = th.grade.contrast;
    pp.vignette = 0.42; pp.bloom = 0.5; pp.bloomThreshold = 0.6; pp.lighting = true;
    this.w.render(r);
    G.small.draw(r.ui2, `${th.key}  ${this.w.map.shape}  ${this.w.map.w}x${this.w.map.h}`, 4, 4);
  }
}
