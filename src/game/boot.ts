import { G } from './G';
import type { Scene } from '../engine/scene';
import type { Renderer } from '../engine/gfx/renderer';
import { col } from '../art/palette';

class TestScene implements Scene {
  t = 0;
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    r.ambient = '#30304a';
    r.begin(0, 0);
    const w = r.w;
    // checker floor
    for (let y = 0; y < 23; y++)
      for (let x = 0; x < 41; x++) {
        w.fillStyle = (x + y) % 2 ? col('K3') : col('K2');
        w.fillRect(x * 16, y * 16, 16, 16);
      }
    r.lightAt(320 + Math.cos(this.t) * 120, 180, 120, 'O3', 0.9);
    r.lightAt(160, 120, 90, 'C3', 0.7);
    r.glowAt(160, 120, 20, 'C3', 0.8);
    w.fillStyle = col('B4');
    w.fillRect(300, 170, 20, 20);
    const ui = r.ui2;
    G.font.draw(ui, '秒针 SECOND HAND — {g:撤销}失误，{c:保留}胜果。', 20, 20);
    G.font.draw(ui, '回溯三秒：受过的伤撤销，打出的伤保留——而三秒前的你，会继续替你战斗。', 20, 44, { wrap: 300, color: 'K9' });
    G.small.draw(ui, 'small 8px text 小号文字 ABC 123', 20, 120, { color: 'K8' });
    ui.drawImage(G.digits.render('1234', 'K10', 'K0', 'B6'), 20, 140);
    ui.drawImage(G.digitsSmall.render('56/78', 'B5', 'K0'), 60, 140);
  }
}

export async function boot() {
  G.scenes.set(new TestScene());
}
