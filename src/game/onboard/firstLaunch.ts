// P0 · first launch (ONBOARD2 §2.1; F4a): the title's "Begin", the first time — "First time in
// Second Hand 2?" with two choices: start the prologue (about five minutes; the default), or "I know
// how to play" (everything counts as learned, guidance drops to Light). A 1.0 player migrated to 2.0
// is welcomed back instead; seated co-op hands see "Rehearse together".
//
//   FlowHooks.titleStart   the card (first time), the prologue resumed where it was left (it was
//                          started but not finished), or the old path (the intro, then the workshop)
//   FlowHooks.firstRoom    every run starts in a combat room now (the F3 tutorial room is retired)
//   FlowHooks.runScene     a novice's first run gives the first wave 2 s before it comes
// ?scene=p0 opens the title with the card up.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from '../ui/overlay';
import { G, sfx } from '../G';
import { tr } from '../i18n';
import { S } from '../strings';
import { Flow, FlowHooks } from '../flow';
import { Cutscenes, GameHooks } from '../hooks';
import { profile, saveProfile } from '../save';
import { Flags } from '../meta/registry';
import { devices } from '../../engine/devices';
import { MenuList } from '../ui/menu';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { drawPanel } from '../ui/widgets';
import { Rich } from './rich';
import { Onboard, tut, Tut } from './core';
import { Gates } from './gates';
import { Prologue, PROLOGUE_ORDER } from '../scenes/prologue';
import '../strings/onboard';

/** the card is shown when the prologue was never done and the card never answered */
export const firstLaunchDue = (): boolean => !profile.prologueDone && !Flags.get('onboard.firstCard');

/** after the intro (the first time), then `go` */
function afterIntro(go: () => void) {
  if (profile.introSeen) { go(); return; }
  Cutscenes.play('intro', () => { profile.introSeen = true; saveProfile(); go(); });
}

export class FirstLaunchCard implements Overlay {
  blocks = true;
  private list: MenuList;
  private t = 0;
  private done = false;
  constructor() {
    const coop = devices.humans.length >= 2;
    this.list = new MenuList([
      { label: () => tr(S('onboard', coop ? 'p0ACoop' : 'p0A')), act: () => this.pick('prologue') },
      { label: () => tr(S('onboard', 'p0B')), act: () => this.pick('skip') },
    ]);
    this.list.rowH = 20;
    tut.p0 = { open: true };
    Tut.log('p0');
  }
  private pick(what: 'prologue' | 'skip') {
    if (this.done) return;
    this.done = true;
    sfx('uiSelect');
    Flags.set('onboard.firstCard', 1);
    tut.p0 = { open: false };
    Tut.log('p0Pick', { what });
    if (what === 'prologue') afterIntro(() => Prologue.start());
    else {
      Flags.set('onboard.skipped', 1);
      Onboard.skipAll();
      afterIntro(() => Flow.hub('start'));
    }
  }
  update(dt: number): boolean {
    this.t += dt;
    if (this.done) return false;
    if (this.t > 0.25) this.list.update(dt);
    if (G.input.pressed('cancel') && this.t > 0.3) { sfx('uiBack'); tut.p0 = { open: false }; return false; }
    return true;
  }
  render(r: Renderer): void {
    const ctx = r.ui2;
    const k = Math.min(1, this.t / 0.2);
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * 0.55 * k; rect(ctx, 0, 0, 640, 360, 'K0'); ctx.globalAlpha = a0 * k;
    const back = profile.migration?.from === 1;
    const lt = Math.ceil(Text.lineH('title')), lb = Math.ceil(Text.lineH('body')), ls = Math.ceil(Text.lineH('small'));
    const rh = this.list.rh;
    // sized from the text: title, (welcome-back line), two rows, B's note, the footer and the device line
    const W = 380;
    const H = 12 + lt + (back ? ls + 2 : 0) + 10 + rh * 2 + ls + 10 + ls + 4 + ls + 12;
    const x = Math.round(320 - W / 2), y = Math.round(180 - H / 2) + Math.round((1 - k) * 6);
    drawPanel(ctx, x, y, W, H, 'dark');
    let yy = y + 12;
    Text.draw(ctx, S('onboard', back ? 'p0Back' : 'p0Title'), 320, yy, { size: back ? 'body' : 'title', color: 'B5', align: 'center' });
    yy += back ? lb + 2 : lt;
    if (back) { Text.draw(ctx, S('onboard', 'p0BackSub'), 320, yy, { size: 'small', color: 'K8', align: 'center' }); yy += ls; }
    yy += 10;
    const lw = 300;
    this.list.render(ctx, 320 - lw / 2, yy, lw);
    yy += rh * 2;
    Text.draw(ctx, S('onboard', 'p0BSub'), 320 - lw / 2 + 12, yy - 2, { size: 'small', color: 'K8', maxW: lw - 12 });
    yy += ls + 10;
    rect(ctx, x + 16, yy - 5, W - 32, 1, 'K3');
    Rich.draw(ctx, S('onboard', 'p0Foot'), 320, yy, { size: 'small', color: 'K8', align: 'center' });
    yy += ls + 4;
    // the device in use (and its rewind button, live): pressing anything switches it
    const inp = G.players[0] ?? G.input;
    const dev = inp.lastDevice === 'pad' ? 'devPad' : inp.lastCodeFor?.('attack') === 'KeyJ' ? 'devKb' : 'devKbm';
    const line = Rich.fill(tr(S('onboard', 'p0Device')), { device: tr(S('onboard', dev)) }) + '  {@rewind}';
    Rich.draw(ctx, line, 320, yy, { size: 'small', color: 'K7', align: 'center', who: inp });
    ctx.globalAlpha = a0;
  }
}

/** push the card onto the title scene standing now */
function showCard(): void {
  const sc = G.scenes.current as unknown as { overlays?: Overlay[] } | null;
  if (sc?.overlays && !sc.overlays.some((o) => o instanceof FirstLaunchCard)) sc.overlays.push(new FirstLaunchCard());
}
let openOnTitle = false;
/** ?scene=p0: the title with the card up */
export function openFirstLaunch(): void { openOnTitle = true; Flow.title(); }
GameHooks.onTitle(() => { if (openOnTitle) { openOnTitle = false; showCard(); } });

// ── the flow (ONBOARD2 §2.1, §11.2 flow.ts) ──
FlowHooks.titleStart = (next) => {
  // a seated co-op group (the title's "Together") goes straight to the workshop: the prologue is one
  // hand's rehearsal (the co-op lanes, C2, are cut); guests take the seat lesson and the Hall
  if (devices.humans.length >= 2) { next(); return; }
  if (firstLaunchDue()) { showCard(); return; }
  // started but never finished: carry on where it was left (the lesson it was in)
  const at = Flags.get('onboard.prologueAt');
  if (!profile.prologueDone && Flags.get('onboard.firstCard') && at >= 0 && at < PROLOGUE_ORDER.length && Onboard.mode() !== 'skip') {
    afterIntro(() => Prologue.start(PROLOGUE_ORDER[at]));
    return;
  }
  next();
};
// the F3 tutorial room is retired from the run flow (?room=tutorial still loads it for regressions)
FlowHooks.firstRoom = () => 'combat';
FlowHooks.runScene = (s) => {
  // a novice's first run: the first wave waits 2 s (time to read the room, ONBOARD2 §11.2)
  if (profile.runs <= 1 && Gates.live) s.waveDelay = Math.max(s.waveDelay, 2);
};
