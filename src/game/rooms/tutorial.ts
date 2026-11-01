// First-run tutorial: floor inscriptions with device-aware prompts, and a training automaton that
// teaches the core verb — take a hit, then rewind it away. Rewind 2.0 (F3): tap goes back to the
// Shadow, holding scrubs the tape; the coach points at the Shadow once you are hurt.
import { Entity } from '../entities/entity';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Action } from '../../engine/input';
import { tr, L, L10n } from '../i18n';
import { S } from '../strings';
import '../strings/f3';
import { drawPrompt, drawPromptLabel, promptW, promptH } from '../ui/widgets';
import { Text } from '../ui/text';
import type { World } from '../world/world';
import { TS } from '../world/room';

class Sign extends Entity {
  constructor(x: number, y: number, private actions: Action[], private text: L10n, private when?: () => boolean) { super(); this.x = x; this.y = y; }
  renderUnlit(r: Renderer) {
    if (this.when && !this.when()) return;
    const p = this.world.nearestPlayer(this.x, this.y, { alive: false });
    const near = p ? Math.max(0, 1 - Math.hypot(p.x - this.x, p.y - this.y) / 220) : 0;
    // floor inscriptions never fade below 0.7 so they stay readable from across the room
    const a = Math.max(0.7, 0.35 + near * 0.65);
    const t = tr(this.text), acts = this.actions, sx = this.x, sy = this.y;
    r.worldUi((ctx, toUi) => {
      const q = toUi(sx, sy);
      ctx.globalAlpha = a;
      const bw = acts.reduce((s, act) => s + promptW(act) + 3, 0);
      const tw = Text.measure(t, 'body').w;
      let x = Math.round(q.x - (bw + tw + 2) / 2);
      for (const act of acts) x += drawPrompt(ctx, act, x, Math.round(q.y)) + 3;
      // text centred on the key icons at any text size
      Text.draw(ctx, t, x + 2, Math.round(q.y) + promptH() / 2, { color: 'B6', valign: 'middle' });
      ctx.globalAlpha = 1;
    });
  }
}

/** watches the player: when they get hurt by the dummy, prompts the rewind */
class RewindCoach extends Entity {
  shown = false;
  t = 0;
  done = false;
  /** seconds until the follow-up line ("touch it to cause a Paradox"); runs on world time */
  private followUp = -1;
  constructor() { super(); }
  /** the hand being coached (whoever took the hit) */
  private who: import('../entities/player').Player | null = null;
  added() {
    this.world.bus.on('damaged', (e) => { if (!this.done) { this.shown = true; this.t = 0; this.who = e.player ?? this.who; } }, this);
    this.world.bus.on('rewind', (e) => {
      if (this.done) return;
      this.done = true;
      const p = e.player ?? this.world.player!;
      this.who = p;
      this.world.fx.banner(p.x, p.y - 44, tr(S('f3', 'tutShadow')), 'C3', 2.4);
      this.followUp = 2.5;
    }, this);
  }
  removed() { this.world.bus.off(this); }
  update(dt: number) {
    this.t += dt;
    if (this.followUp > 0 && (this.followUp -= dt) <= 0) {
      const p = this.who ?? this.world.player;
      if (p) this.world.fx.banner(p.x, p.y - 44, tr(S('f3', 'tutParadox')), 'C3', 2.4);
    }
  }
  renderUnlit(r: Renderer) {
    if (!this.shown || this.done) return;
    const p = this.who ?? this.world.player;
    if (!p) return;
    const t = tr(S('f3', 'tutCoach'));
    const blink = Math.floor(this.t * 3) % 2 === 0;
    const px = p.x, py = p.y - 52;
    const who = p.input;
    r.worldUi((ctx, toUi) => { const q = toUi(px, py); drawPromptLabel(ctx, 'rewind', t, q.x, q.y, { color: blink ? 'C3' : 'C4', who }); });
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
  w.add(new Sign(ex, ey - 166, ['rewind'], S('f3', 'tutTap')));
  w.add(new Sign(ex, ey - 150, ['rewind'], S('f3', 'tutHold')));
  w.add(new Sign(ex, ey - 134, ['attack'], S('f3', 'tutSand')));
  w.add(new RewindCoach());
}
