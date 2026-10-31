// First-run tutorial: floor inscriptions with device-aware prompts, and a training automaton that
// teaches the core verb — take a hit, then rewind it away.
import { Entity } from '../entities/entity';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Action } from '../../engine/input';
import { G } from '../G';
import { tr, L, L10n } from '../i18n';
import { drawButton } from '../ui/prompts';
import type { World } from '../world/world';
import { TS } from '../world/room';

class Sign extends Entity {
  constructor(x: number, y: number, private actions: Action[], private text: L10n, private when?: () => boolean) { super(); this.x = x; this.y = y; }
  renderUnlit(r: Renderer) {
    if (this.when && !this.when()) return;
    const p = this.world.player;
    const near = p ? Math.max(0, 1 - Math.hypot(p.x - this.x, p.y - this.y) / 220) : 0;
    const a = 0.35 + near * 0.65;
    const ctx = r.u;
    ctx.globalAlpha = a;
    const t = tr(this.text);
    const bw = this.actions.length * 15;
    const tw = G.small.measure(t);
    let x = Math.round(this.x - (bw + tw + 4) / 2);
    for (const act of this.actions) x += drawButton(ctx, x, Math.round(this.y), act) + 3;
    G.small.draw(ctx, t, x + 2, Math.round(this.y) + 1, { color: 'B6' });
    ctx.globalAlpha = 1;
  }
}

/** watches the player: when they get hurt by the dummy, prompts the rewind */
class RewindCoach extends Entity {
  shown = false;
  t = 0;
  done = false;
  constructor() { super(); }
  added() {
    this.world.bus.on('damaged', () => { if (!this.done) { this.shown = true; this.t = 0; } }, this);
    this.world.bus.on('rewind', () => {
      if (this.done) return;
      this.done = true;
      const p = this.world.player!;
      this.world.fx.banner(p.x, p.y - 44, tr(L('那是三秒前的你。', 'That is you, three seconds ago.')), 'C3', 2.4);
      setTimeout(() => this.world.fx.banner(p.x, p.y - 44, tr(L('触碰它，引发{c:悖论}。', 'Touch it to cause a {c:Paradox}.')), 'C3', 2.4), 2500);
    }, this);
  }
  removed() { this.world.bus.off(this); }
  update(dt: number) { this.t += dt; }
  renderUnlit(r: Renderer) {
    if (!this.shown || this.done) return;
    const p = this.world.player!;
    const ctx = r.u;
    const t = tr(L('受伤了？按下回溯，撤销刚才的伤害！', 'Hurt? Rewind to undo the damage!'));
    const blink = Math.floor(this.t * 3) % 2 === 0;
    const w = G.small.measure(t) + 20;
    const x = Math.round(p.x - w / 2), y = Math.round(p.y - 50);
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#0b0a14'; ctx.fillRect(x - 3, y - 3, w + 6, 17); ctx.globalAlpha = 1;
    drawButton(ctx, x, y, 'rewind');
    G.small.draw(ctx, t, x + 18, y + 1, { color: blink ? 'C3' : 'C4' });
  }
}

export function setupTutorial(w: World) {
  const m = w.map;
  const e = m.entry!;
  const ex = (e.tx + 1) * TS, ey = e.ty * TS;
  w.add(new Sign(ex, ey - 46, ['up', 'left', 'down', 'right'], L('移动', 'Move')));
  w.add(new Sign(ex - 120, ey - 90, ['attack'], L('攻击（连按三下）', 'Attack (press three times)')));
  w.add(new Sign(ex + 120, ey - 90, ['dash'], L('冲刺：短暂无敌', 'Dash: brief invulnerability')));
  w.add(new Sign(ex + 120, ey - 70, ['special'], L('特技', 'Special')));
  w.add(new Sign(ex, ey - 150, ['rewind'], L('回溯：回到三秒前，撤销受到的伤害', 'Rewind: return 3s into the past, undoing damage taken')));
  w.add(new Sign(ex, ey - 134, ['attack'], L('造成伤害可以积攒{c:时砂}', 'Dealing damage fills your {c:Sand}')));
  w.add(new RewindCoach());
}
