// "How rewind works" (ONBOARD2 §7): the pause menu's reference page. Six small loops played with
// the game's real sprites — Undo, Echo, Paradox, Hold (scrub), Fork, Sand & Tape — in a 3 × 2 grid,
// and a 2× zoom of any one with its caption, its note and its buttons. Every button icon follows
// whoever opened it (keyboard + mouse, keyboard only, pad). A move not taught yet is dimmed with a
// ribbon but still plays: it is a page the player chose to open, curiosity costs nothing.
//
//   Panels.register('rewindGuide', (args?: { who?: PlayerInput; focus?: 1..6 }) => …)
//   {@special} "practise": in the workshop → into the Hall on that lesson; in a run → "teach me
//   after this fight" (Calm.request); not offered in the prologue.
import type { Renderer } from '../../engine/gfx/renderer';
import type { PlayerInput } from '../../engine/input';
import type { Overlay } from './overlay';
import type { Player } from '../entities/player';
import type { L10n } from '../i18n';
import { G, sfx } from '../G';
import { S } from '../strings';
import { tr } from '../i18n';
import { Terms } from '../meta/registry';
import { rect } from './draw';
import { Text } from './text';
import { drawPanel } from './widgets';
import { Panels } from './panels';
import { GameScene } from '../scenes/game';
import { HubScene } from '../scenes/hub';
import { registerDebugRoute } from '../debugRoutes';
import { Onboard, Tut } from '../onboard/core';
import { Rich } from '../onboard/rich';
import { ModelStrip, modelStripSize, STRIP } from '../onboard/modelStrip';
import { Calm } from '../onboard/calm';
import { Stage } from '../onboard/stage';
import { LoopPlayer, STAGE_W, STAGE_H } from '../onboard/loopPlayer';
import { GUIDE_LOOPS } from '../onboard/loops';
import { presetFromUrl } from '../onboard/coach/debug';
import '../strings/coach';
import '../strings/onboard';

const C = (k: string): L10n => S('coach', k);
const CARD_W = 196, GAP = 8, X0 = 18;

type Where = 'run' | 'hub' | 'hall' | 'prologue' | 'other';
function whereNow(): Where {
  const sc = G.scenes.current;
  if (sc instanceof HubScene) return 'hub';
  if (sc instanceof GameScene) return sc.opt.kind === 'prologue' ? 'prologue' : sc.opt.kind === 'rehearsal' ? 'hall' : 'run';
  return 'other';
}

export class RewindGuidePanel implements Overlay {
  blocks = true;
  hidesNotes = true;
  view: 'grid' | 'focus' = 'grid';
  sel = 0;
  /** real seconds the page has been open (the loops' clock) */
  t = 0;
  /** CI: a fixed loop time (guide.seek) */
  fixedT: number | null = null;
  done = false;
  private where = whereNow();
  private flash: { text: string; t: number } | null = null;
  private lastMouse = { x: -1, y: -1 };
  constructor(private o: { who?: PlayerInput | null; focus?: number } = {}) {
    if (o.focus && o.focus >= 1 && o.focus <= 6) { this.sel = o.focus - 1; this.view = 'focus'; }
    for (const id of ['rewind', 'shadow', 'echo', 'paradox', 'tape', 'sand']) Terms.seen(id);
    sfx('uiOpen');
    current = this;
    Tut.log('guide', { open: true, focus: o.focus ?? 0 });
  }
  private get who(): PlayerInput { return this.o.who ?? (G.input as unknown as PlayerInput); }
  private get hand(): Player | null {
    const w = (G.scenes.current as { world?: { players: Player[] } } | null)?.world;
    const slot = this.o.who?.slot ?? 0;
    return w?.players.find((p) => p.slot === slot) ?? w?.players[0] ?? null;
  }
  private taught(i: number): boolean {
    const d = GUIDE_LOOPS[i];
    return Onboard.taught(this.hand, d.teach) || Onboard.learned(this.hand, d.teach);
  }
  private loopT(i: number): number { return this.fixedT ?? this.t + i * 0.37; }

  update(dt: number): boolean {
    this.t += dt;
    if (this.flash) { this.flash.t += dt; if (this.flash.t > 2.2) this.flash = null; }
    const inp = this.who;
    if (inp.pressed('cancel') || inp.pressed('pause')) {
      G.input.consume('pause');
      if (this.view === 'focus' && !this.o.focus) { this.view = 'grid'; sfx('uiBack'); return true; }
      sfx('uiBack'); return this.close();
    }
    const nav = inp.nav(dt);
    if (this.view === 'grid') {
      if (nav.x) { this.sel = (this.sel + nav.x + 6) % 6; sfx('uiMove'); }
      if (nav.y) { this.sel = (this.sel + 3) % 6; sfx('uiMove'); }
      // mouse: hover selects (when it moves), a click zooms
      const mx = G.input.mx, my = G.input.my;
      if (G.input.mouseAim && (mx !== this.lastMouse.x || my !== this.lastMouse.y || G.input.pressed('attack'))) {
        const hitI = this.cardAt(mx, my);
        if (hitI >= 0 && hitI !== this.sel) { this.sel = hitI; sfx('uiMove'); }
        if (hitI >= 0 && G.input.pressed('attack')) { this.view = 'focus'; sfx('uiSelect'); }
      }
      this.lastMouse = { x: mx, y: my };
      if (inp.pressed('confirm')) { this.view = 'focus'; sfx('uiSelect'); }
    } else {
      if (nav.x || inp.pressed('tabL') || inp.pressed('tabR')) {
        const d = nav.x || (inp.pressed('tabR') ? 1 : -1);
        this.sel = (this.sel + d + 6) % 6; sfx('uiMove');
      }
    }
    if (inp.pressed('special') && this.where !== 'prologue') this.practise();
    return !this.done;
  }
  private close(): boolean { this.done = true; if (current === this) current = null; Tut.log('guide', { open: false }); return false; }

  /** {@special}: practise this move — the Hall (workshop / Hall) or after this fight (in a run) */
  private practise() {
    const d = GUIDE_LOOPS[this.sel];
    if (this.where === 'hub' || this.where === 'hall') {
      sfx('uiSelect');
      this.close();
      void import('../rooms/rehearsal').then((m) => m.Hall.enter({ lesson: d.lesson }));
      return;
    }
    if (this.where === 'run') {
      Calm.request(d.lesson, 'guide');
      sfx('uiSelect');
      this.flash = { text: tr(C('gRequested')).replace('{x}', tr(d.name)), t: 0 };
    }
  }

  /** grid geometry this frame (heights follow the text size) */
  private layout() {
    const capH = Math.max(...GUIDE_LOOPS.map((d) => Rich.measureWrapped(d.caption, 'body', 184, this.who).h));
    const cardH = Math.ceil(6 + STAGE_H + 4 + capH + 6);
    const titleH = Math.ceil(Text.lineH('title'));
    const modelH = Rich.measureWrapped(`${tr(S('onboard', 'model1'))}\n${tr(S('onboard', 'model2'))}`, 'body', 560).h;
    let y = 12 + titleH + 2 + modelH + 4;
    const strip = modelStripSize();
    let showStrip = y + strip.h + 6 + cardH * 2 + GAP <= 338;
    if (showStrip) y += strip.h + 6;
    else showStrip = false;
    return { cardH, gridY: Math.round(y), showStrip, modelH, titleH };
  }
  private cardAt(mx: number, my: number): number {
    const L = this.layout();
    for (let i = 0; i < 6; i++) {
      const x = X0 + (i % 3) * (CARD_W + GAP), y = L.gridY + Math.floor(i / 3) * (L.cardH + GAP);
      if (mx >= x && mx < x + CARD_W && my >= y && my < y + L.cardH) return i;
    }
    return -1;
  }

  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.92; rect(ctx, 0, 0, 640, 360, 'K0'); ctx.globalAlpha = 1;
    drawPanel(ctx, 8, 6, 624, 348, 'dark');
    if (this.view === 'grid') this.renderGrid(ctx); else this.renderFocus(ctx);
    if (this.flash) {
      const a = Math.min(1, (2.2 - this.flash.t) / 0.3);
      ctx.globalAlpha = a;
      const m = Text.measure(this.flash.text, 'body');
      rect(ctx, 320 - m.w / 2 - 8, 300 - 4, m.w + 16, Text.lineH('body') + 8, 'K0');
      rect(ctx, 320 - m.w / 2 - 8, 300 - 4, m.w + 16, 1, 'C3');
      Text.draw(ctx, this.flash.text, 320, 300, { color: 'C4', align: 'center' });
      ctx.globalAlpha = 1;
    }
  }

  private footer(ctx: CanvasRenderingContext2D, s: L10n) {
    const m = Rich.measure(s, 'small', this.who);
    Rich.draw(ctx, s, 320, 352 - m.h, { size: 'small', color: 'K8', align: 'center', who: this.who });
  }

  private renderGrid(ctx: CanvasRenderingContext2D) {
    const L = this.layout();
    Text.draw(ctx, C('gTitle'), 320, 12, { size: 'title', color: 'B5', align: 'center' });
    Rich.draw(ctx, `${tr(S('onboard', 'model1'))}\n${tr(S('onboard', 'model2'))}`, 320, 12 + L.titleH + 2, { size: 'body', color: 'K9', align: 'center', maxW: 560 });
    if (L.showStrip) ModelStrip.draw(ctx, 320, 12 + L.titleH + 2 + L.modelH + 4, STRIP.all);
    for (let i = 0; i < 6; i++) {
      const d = GUIDE_LOOPS[i];
      const x = X0 + (i % 3) * (CARD_W + GAP), y = L.gridY + Math.floor(i / 3) * (L.cardH + GAP);
      const learned = this.taught(i);
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = learned ? 1 : 0.6;
      rect(ctx, x, y, CARD_W, L.cardH, 'K1');
      rect(ctx, x, y, CARD_W, 1, 'K3');
      LoopPlayer.draw(ctx, d, this.loopT(i), x + 6, y + 6, { scale: 1, who: this.who, alpha: learned ? 1 : 0.6 });
      Rich.draw(ctx, d.caption, x + 6, y + 6 + STAGE_H + 4, { size: 'body', color: 'K10', who: this.who, maxW: 184 });
      ctx.globalAlpha = a0;
      if (!learned) this.ribbon(ctx, x + CARD_W - 4, y + 4, true);
      if (i === this.sel) {
        rect(ctx, x - 2, y - 2, CARD_W + 4, 2, 'B5'); rect(ctx, x - 2, y + L.cardH, CARD_W + 4, 2, 'B5');
        rect(ctx, x - 2, y, 2, L.cardH, 'B5'); rect(ctx, x + CARD_W, y, 2, L.cardH, 'B5');
      }
    }
    this.footer(ctx, this.where === 'prologue' || this.where === 'other' ? C('gFooterNoPractise') : C('gFooter'));
    // the selected card is not taught yet: where it will be (the long ribbon text)
    if (!this.taught(this.sel)) {
      const s = tr(this.where === 'run' ? C('gNotYetRun') : C('gNotYetHall'));
      const y = 352 - Math.ceil(Text.lineH('small')) * 2 - 2;
      Text.draw(ctx, s, 320, y, { size: 'small', color: 'B4', align: 'center' });
    }
  }

  /** "not yet · after a fight" (in a run) or "in the Hall" (the workshop) */
  private ribbon(ctx: CanvasRenderingContext2D, rx: number, y: number, short = false) {
    const s = tr(short ? C('gNotYet') : this.where === 'run' ? C('gNotYetRun') : C('gNotYetHall'));
    const m = Text.measure(s, 'small');
    const w = Math.ceil(m.w) + 10, h = Math.ceil(Text.lineH('small')) + 2;
    rect(ctx, rx - w, y, w, h, 'B2');
    rect(ctx, rx - w, y, w, 1, 'B4');
    rect(ctx, rx - w - 3, y + h - 1, 3, 3, 'B1');
    Text.draw(ctx, s, rx - w / 2, y + h / 2, { size: 'small', color: 'K10', align: 'center', valign: 'middle', shadow: false });
  }

  private renderFocus(ctx: CanvasRenderingContext2D) {
    const d = GUIDE_LOOPS[this.sel];
    Text.draw(ctx, d.name, 320, 10, { size: 'title', color: 'C3', align: 'center' });
    const sx = 136, sy = Math.max(36, Math.round(10 + Text.lineH('title') + 4));
    rect(ctx, sx - 2, sy - 2, STAGE_W * 2 + 4, STAGE_H * 2 + 4, 'K3');
    LoopPlayer.draw(ctx, d, this.loopT(this.sel), sx, sy, { scale: 2, who: this.who });
    if (!this.taught(this.sel)) this.ribbon(ctx, sx + STAGE_W * 2 - 2, sy + 2);
    let y = sy + STAGE_H * 2 + 8;
    y += Rich.draw(ctx, d.caption, 320, y, { size: 'body', color: 'K10', align: 'center', who: this.who, maxW: 400 }).h + 3;
    y += Rich.draw(ctx, d.sub, 320, y, { size: 'small', color: 'K8', align: 'center', who: this.who, maxW: 440 }).h + 6;
    // the buttons it uses, each with its word
    const parts = d.keys.map((k) => `{@${k.a}} ${tr(k.word)}`).join('   ');
    Rich.draw(ctx, parts.replace('{fork}', ''), 320, y, { size: 'body', color: 'C4', align: 'center', who: this.who });
    // ◀ ▶ and six dots
    const ay = sy + STAGE_H - 4;
    for (let k = 0; k < 5; k++) { rect(ctx, 112 + k, ay - k, 1, k * 2 + 1, 'B4'); rect(ctx, 528 - k, ay - k, 1, k * 2 + 1, 'B4'); }
    for (let i = 0; i < 6; i++) rect(ctx, 320 - 30 + i * 12, 334, i === this.sel ? 6 : 4, i === this.sel ? 3 : 2, i === this.sel ? 'B5' : 'K5');
    this.footer(ctx, C('gFocusFooter'));
  }
}

let current: RewindGuidePanel | null = null;
Panels.register('rewindGuide', (args?: { who?: PlayerInput; focus?: number }) => new RewindGuidePanel(args ?? {}));

Tut.register('guide', {
  get open() { return !!current && !current.done; },
  get view() { return current?.view ?? null; },
  get loop() { return current ? current.sel + 1 : 0; },
  /** CI only: show loop n (1..6) at loop time t (null = live) */
  seek(loop: number, t: number | null, view?: 'grid' | 'focus') {
    if (!current) return;
    current.sel = Math.max(0, Math.min(5, loop - 1));
    current.fixedT = t;
    if (view) current.view = view;
  },
});

// ?scene=rewindGuide[&focus=1..6]: the page over a paused seeded room
registerDebugRoute('scene=rewindGuide', async (q) => {
  if (q.get('scene') !== 'rewindGuide') return false;
  presetFromUrl(q);
  const [{ Run }, { Flow }, { ensurePlayers }] = await Promise.all([import('../run'), import('../flow'), import('../players')]);
  const seats = ensurePlayers();
  const seed = Number(q.get('seed') ?? 2);
  const run = new Run({ mode: 'standard', seed, contracts: {}, players: seats.map((inp) => ({ slot: inp.slot, device: inp.device, hand: 'tick', weapon: 'rapier' })) });
  const gs = new GameScene(run, { kind: 'rest', reward: null }, seed);
  Flow.wire(gs);
  G.scenes.set(gs);
  const f = Number(q.get('focus') ?? 0);
  gs.overlays.push(new RewindGuidePanel({ who: seats[0], focus: f >= 1 && f <= 6 ? f : undefined }));
  return true;
});
void Stage;
