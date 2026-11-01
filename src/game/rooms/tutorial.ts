// First-run tutorial: floor inscriptions with device-aware prompts, and a training automaton that
// teaches the core verb — take a hit, then rewind it away. Rewind 2.0 (F3): tap goes back to the
// Shadow, holding scrubs the tape; the coach points at the Shadow once you are hurt.
//
// One thing at a time (GDD2 §9.8 rule 2; first-play clarity S1.2):
//   · the rewind inscriptions come in two pairs in the same two rows: Tap + Sand first, then (after
//     the first rewind) Hold + Fork — never four lines stacked in the middle of the fight
//   · the coach and the follow-up lines speak on the caption rail at the top centre (ui/callouts.ts),
//     not over the hand that just landed
//   · an inscription fades while a hand stands on it, so it never hides the Shadow or the hand
//   · the practice coglings only come once the first rewind is done (or after 30 s, so the room
//     can always be finished)
import { Entity } from '../entities/entity';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Action } from '../../engine/input';
import { tr, L, L10n } from '../i18n';
import { S } from '../strings';
import '../strings/f3';
import { drawPrompt, promptW, promptH } from '../ui/widgets';
import { Text } from '../ui/text';
import { Caption, Callouts } from '../ui/callouts';
import { G } from '../G';
import type { World } from '../world/world';
import { TS } from '../world/room';

class Sign extends Entity {
  constructor(x: number, y: number, private actions: Action[], private text: L10n, private when?: () => boolean) { super(); this.x = x; this.y = y; }
  renderUnlit(r: Renderer) {
    if (this.when && !this.when()) return;
    const p = this.world.nearestPlayer(this.x, this.y, { alive: false });
    const t = tr(this.text), acts = this.actions, sx = this.x, sy = this.y;
    const bw = acts.reduce((s, act) => s + promptW(act) + 3, 0);
    const tw = Text.measure(t, 'body').w;
    const total = bw + tw + 2, h = promptH();
    // term callouts keep off the inscriptions when they can (soft: they may still sit over one)
    Callouts.avoid(sx - total / 2, sy, total, h, true);
    // floor inscriptions never fade below 0.7 so they stay readable from across the room — except
    // while a hand stands on one: then it steps back so the hand and its Shadow read first
    let a = 0.7;
    if (p) {
      const near = Math.max(0, 1 - Math.hypot(p.x - this.x, p.y - this.y) / 220);
      a = Math.max(0.7, 0.35 + near * 0.65);
      const dx = Math.max(0, Math.abs(p.x - sx) - total / 2), dy = Math.max(0, Math.max(sy - p.y, p.y - 24 - (sy + h)));
      if (Math.hypot(dx, dy) < 24) a = 0.35;
    }
    // a Shadow (and its +N / cost labels above it) standing on an inscription: it steps right back
    for (const q of this.world.players) {
      if (q.state !== 'alive' || q.rec.length < 2) continue;
      const pv = q.rewindPreview();
      const dx = Math.max(0, Math.abs(pv.x - sx) - total / 2), dy = Math.max(0, Math.max(sy - pv.y, pv.y - 60 - (sy + h)));
      if (dx < 26 && dy < 4) a = Math.min(a, 0.25);
    }
    r.worldUi((ctx, toUi) => {
      const q = toUi(sx, sy);
      ctx.globalAlpha = a;
      let x = Math.round(q.x - total / 2);
      for (const act of acts) x += drawPrompt(ctx, act, x, Math.round(q.y)) + 3;
      // text centred on the key icons at any text size
      Text.draw(ctx, t, x + 2, Math.round(q.y) + promptH() / 2, { color: 'B6', valign: 'middle' });
      ctx.globalAlpha = 1;
    });
  }
}

/** watches the player: when they get hurt by the dummy, prompts the rewind (on the caption rail) */
class RewindCoach extends Entity {
  shown = false;
  t = 0;
  done = false;
  constructor() { super(); }
  /** the hand being coached (whoever took the hit) */
  private who: import('../entities/player').Player | null = null;
  added() {
    this.world.bus.on('damaged', (e) => {
      if (this.done) return;
      this.shown = true;
      this.who = e.player ?? this.who;
      const p = this.who ?? this.world.player;
      Caption.say(S('f3', 'tutCoach'), { key: 'tutCoach', dur: Infinity, prio: 2, action: 'rewind', who: p?.input ?? null });
    }, this);
    this.world.bus.on('rewind', (e) => {
      if (this.done) return;
      this.done = true;
      this.who = e.player ?? this.world.player;
      Caption.clear('tutCoach');
      // then, one line at a time: what the echo is, and what touching it does
      Caption.say(S('f3', 'tutShadow'), { key: 'tutShadow', dur: 2.6, prio: 1 });
      Caption.say(S('f3', 'tutParadox'), { key: 'tutParadox', dur: 3.2, prio: 1 });
    }, this);
  }
  removed() { this.world.bus.off(this); Caption.clear('tutCoach'); }
  update(dt: number) {
    this.t += dt;
    // the practice coglings wait for the first rewind (one thing at a time), at most 30 s
    const s = G.scenes.current as unknown as { world?: World; waveIdx?: number; waveDelay?: number } | null;
    if (!this.done && this.t < 30 && s && s.world === this.world && (s.waveIdx ?? 0) < 0) s.waveDelay = Math.max(s.waveDelay ?? 0, 1);
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
  const coach = w.add(new RewindCoach());
  const before = () => !coach.done, after = () => coach.done;
  // two rows for the rewind lines: Tap + Sand until the first rewind, then Hold + Fork in their place
  w.add(new Sign(ex, ey - 164, ['rewind'], S('f3', 'tutTap'), before));
  w.add(new Sign(ex, ey - 144, ['attack'], S('f3', 'tutSand'), before));
  w.add(new Sign(ex, ey - 164, ['rewind'], S('f3', 'tutHold'), after));
  w.add(new Sign(ex, ey - 144, ['fork'], S('f3', 'tutFork'), after));
}
