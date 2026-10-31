// Debug: art review sheet (?scene=art). Shows sprites zoomed for the art director.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Sprite } from '../../engine/gfx/sprite';
import { G } from '../G';
import { col } from '../../art/palette';

export class ArtPreview implements Scene {
  t = 0;
  constructor(private groups: { name: string; sprites: Sprite[] | (() => Sprite[]); zoom?: number }[], private bg = 'K4') {}
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    r.params.lighting = false;
    r.params.bloom = 0;
    r.params.vignette = 0;
    r.params.grain = 0;
    r.begin(0, 0, col('K2'));
    const ctx = r.ui2;
    ctx.fillStyle = col(this.bg);
    ctx.fillRect(0, 0, 640, 360);
    let y = 4;
    for (const g of this.groups) {
      const z = g.zoom ?? 3;
      G.small.draw(ctx, g.name, 4, y, { color: 'K10' });
      y += 10;
      let x = 4;
      let rowH = 0;
      const sprites = typeof g.sprites === 'function' ? g.sprites() : g.sprites;
      for (const s of sprites) {
        if (x + s.w * z > 636) { x = 4; y += rowH + 4; rowH = 0; }
        ctx.drawImage(s.img, x, y, s.w * z, s.h * z);
        x += s.w * z + 4;
        rowH = Math.max(rowH, s.h * z);
      }
      y += rowH + 6;
    }
  }
}
