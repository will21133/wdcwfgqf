// A guest seat's "first time?" (ONBOARD2 §5.10): when a second, third or fourth hand sits down in
// the workshop, a plate over its head asks for 5 s — "First time? Hold {@interact} for a 25 s lesson".
// Holding it 0.6 s makes that seat a novice for this session (its own coach from L3, its own gates)
// and stands a punching dummy by the grand clock for an `undo` crash course: "let the dummy hit you
// → {@rewind}". Nobody else is held up; letting the plate pass = a veteran (coach from L2, no gates).
// The workshop's HUD draws only the pods, so these few words are drawn over the hand itself.
import type { Player } from '../../entities/player';
import type { HubScene } from '../../scenes/hub';
import type { Renderer } from '../../../engine/gfx/renderer';
import type { L10n } from '../../i18n';
import { G, sfx } from '../../G';
import { S } from '../../strings';
import { tr } from '../../i18n';
import { Entity } from '../../entities/entity';
import { GameHooks } from '../../hooks';
import { rect } from '../../ui/draw';
import { Onboard, Tut } from '../core';
import { Rich } from '../rich';
import { HallDummy } from '../lessons/hall';
import { seatOf } from './coach';
import '../../strings/coach';

const C = (k: string): L10n => S('coach', k);
const ASK_T = 5, HOLD_T = 0.6;

interface SeatState { p: Player; askT: number; holdT: number; asked: boolean; course: { dummy: HallDummy; t: number; done: number } | null }
const states = new Map<number, SeatState>();

class SeatGuide extends Entity {
  constructor(private scene: HubScene) { super(); this.collides = false; }
  update(dt: number) {
    const w = this.world;
    for (const p of w.players) {
      if (p.slot === 0) continue;
      let s = states.get(p.slot);
      if (!s || s.p !== p) {
        // ask each guest once a session (a seat that already chose keeps its answer)
        const asked = states.get(p.slot)?.asked ?? false;
        s = { p, askT: asked ? 0 : ASK_T, holdT: 0, asked: true, course: null };
        states.set(p.slot, s);
      }
      if (s.askT > 0 && !p.locked) {
        s.askT -= dt;
        if (p.input.down('interact')) { s.holdT += dt; if (s.holdT >= HOLD_T) accept(p); } else s.holdT = 0;
      }
      const c = s.course;
      if (c) {
        c.t += dt;
        if (c.done > 0) { c.done -= dt; if (c.done <= 0) { c.dummy.dead = true; s.course = null; } }
      }
    }
    void this.scene;
  }
  render() {}
  renderUnlit(r: Renderer) {
    for (const s of states.values()) {
      const p = s.p;
      if (p.world !== this.world) continue;
      const line = s.askT > 0 ? C('seatAsk') : s.course ? (s.course.done > 0 ? C('seatDone') : S('onboard', 'b.undo.s1')) : null;
      if (!line) continue;
      const x = p.x, y = p.y - 44;
      const who = p.input;
      const k = s.askT > 0 ? Math.min(1, s.askT / 0.4) : 1;
      const fillK = s.holdT / HOLD_T;
      r.worldUi((ctx, toUi) => {
        const q = toUi(x, y);
        const m = Rich.measure(line, 'body', who);
        const w = Math.ceil(m.w) + 12, h = Math.ceil(m.h) + 6;
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * k * 0.88;
        rect(ctx, Math.round(q.x - w / 2), Math.round(q.y - h), w, h, 'K0');
        ctx.globalAlpha = a0 * k;
        rect(ctx, Math.round(q.x - w / 2), Math.round(q.y - h), w, 1, s.course?.done ? 'G4' : 'C3');
        if (fillK > 0) rect(ctx, Math.round(q.x - w / 2), Math.round(q.y - 1), Math.round(w * Math.min(1, fillK)), 1, 'C3');
        Rich.draw(ctx, line, q.x, q.y - h + 3, { size: 'body', align: 'center', color: s.course?.done ? 'G4' : 'K10', who });
        ctx.globalAlpha = a0;
      });
    }
  }
}

/** the guest said "first time": a novice seat (its own coach from L3) and the crash course */
function accept(p: Player) {
  const s = states.get(p.slot);
  if (!s || s.course) return;
  s.askT = 0;
  Onboard.seat(p.slot).novice = true;
  seatOf(p.slot).lvl = 3;
  sfx('uiSelect');
  // a dummy beside the hand's grand clock (the left one for II / IV, the right one for III)
  const w = p.world;
  const d = new HallDummy(p.x + (p.slot === 2 ? -26 : 26), p.y - 4, 'punch');
  d.every = 1.6;
  w.add(d);
  s.course = { dummy: d, t: 0, done: 0 };
  w.bus.on('rewind', (e) => {
    if (e.player !== p || !s.course || s.course.done > 0 || (e.restored ?? 0) <= 0) return;
    Onboard.mark(p, 'undo');
    s.course.done = 2.4;
    sfx('lessonPass');
    Tut.log('seatCourse', { slot: p.slot, done: true });
  }, s);
  Tut.log('seatNovice', { slot: p.slot });
}

GameHooks.onHub((scene) => { scene.world.add(new SeatGuide(scene)); for (const s of states.values()) s.course = null; });

Tut.register('seat', {
  prompting: (slot: number) => (states.get(slot)?.askT ?? 0) > 0,
  accept: (slot: number) => { const s = states.get(slot); if (s) accept(s.p); },
  novice: (slot: number) => { const w = (G.scenes.current as { world?: { players: Player[] } } | null)?.world; const p = w?.players.find((q) => q.slot === slot); return p ? Onboard.isNovice(p) : false; },
  lesson: (slot: number) => !!states.get(slot)?.course,
});
void tr;
