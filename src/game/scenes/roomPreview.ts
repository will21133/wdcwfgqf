// Debug: room generator / renderer review (?scene=room&seed=1&biome=0)
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import { G } from '../G';
import { RNG } from '../../engine/rng';
import { generateRoom } from '../world/roomgen';
import { renderRoom, RoomVisual } from '../world/roomRender';
import { THEMES } from '../../art/themes';
import { RoomMap, TS } from '../world/room';

export class RoomPreview implements Scene {
  m: RoomMap; vis: RoomVisual; t = 0; biome: number;
  constructor(seed: number, biome: number) {
    this.biome = biome;
    this.m = generateRoom({ rng: new RNG(seed), kind: 'combat', biome, exits: 3 });
    this.vis = renderRoom(this.m, THEMES[biome], seed);
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const th = THEMES[this.biome];
    r.ambient = th.ambient;
    const cx = this.m.pw / 2 - 320, cy = this.m.ph / 2 - 180;
    r.begin(cx, cy, th.clear);
    r.w.drawImage(this.vis.floor, 0, 0);
    for (const s of this.vis.walls) r.w.drawImage(s.canvas, 0, s.y);
    for (const p of this.m.props) if (p.type === 'walllamp') {
      const x = p.tx * TS + 8, y = p.ty * TS - 4;
      r.lightAt(x, y + 24, 110, th.lampLight, 0.75);
      r.w.fillStyle = '#ffc04a';
      r.w.fillRect(x - 1, y, 3, 4);
      r.glowAt(x, y + 2, 7, th.lamp, 0.35);
    }
    G.small.draw(r.ui2, `${this.m.shape}  ${this.m.w}x${this.m.h}`, 4, 4);
  }
}
