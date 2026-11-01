// The lesson board (ONBOARD2 §8.3): the Rehearsal Hall's menu of every move, grouped (prologue,
// basics, combos, timing, know, co-op, combat), each row with a ✓ (learned) and a ★ (mastered) box,
// locked rows dimmed with their reason; on the right the selected lesson's loop, its name and plain
// line, when to use it and why, its ★ goal and rewards. {@confirm} starts it on the stage,
// {@special} just plays it on the curtain, {@info} opens "How rewind works".
//
//   Panels.register('rehearsal', (args?: { who?: PlayerInput; slot?: number; lesson?: string }) => …)
import type { Renderer } from '../../engine/gfx/renderer';
import type { PlayerInput } from '../../engine/input';
import type { Overlay } from './overlay';
import type { Player } from '../entities/player';
import type { L10n } from '../i18n';
import { G, sfx } from '../G';
import { S, term } from '../strings';
import { tr } from '../i18n';
import { Teach } from '../meta/registry';
import { col } from '../../art/palette';
import { rect } from './draw';
import { Text } from './text';
import { drawPanel } from './widgets';
import { Panels } from './panels';
import { Onboard, Tut } from '../onboard/core';
import { Rich } from '../onboard/rich';
import { LoopPlayer, STAGE_W, STAGE_H } from '../onboard/loopPlayer';
import { LOOPS } from '../onboard/loops';
import { HALL_ROWS, GROUP_KEY, nameOf, OWN_PLAIN, HAS_WHEN, type HallRow } from '../onboard/lessons/advanced';
import { TRIALS } from '../onboard/lessons/hall';
import { todaysDrill } from '../onboard/coach/mastery';
import { drawTickBox } from '../../art/sprites/hall';
import { Hall } from '../rooms/rehearsal';
import '../strings/coach';

const C = (k: string): L10n => S('coach', k);
const PX = 80, PY = 40, PW = 480, PH = 280;
const LX = PX + 12, LW = 220, RX = PX + 244, RW = 224;

type Item = { kind: 'group'; key: string } | { kind: 'row'; row: HallRow };

export class RehearsalBoard implements Overlay {
  blocks = true;
  hidesNotes = true;
  sel = 0;
  top = 0;
  t = 0;
  done = false;
  private items: Item[] = [];
  private flash: { text: L10n; t: number } | null = null;
  constructor(private o: { who?: PlayerInput; slot?: number; lesson?: string } = {}) {
    let g = '';
    for (const r of HALL_ROWS) {
      if (r.group !== g) { g = r.group; this.items.push({ kind: 'group', key: GROUP_KEY[r.group] }); }
      this.items.push({ kind: 'row', row: r });
    }
    const want = o.lesson ? this.items.findIndex((it) => it.kind === 'row' && it.row.id === o.lesson) : -1;
    this.sel = want >= 0 ? want : this.firstOpen();
    sfx('uiOpen');
    Tut.log('hallBoard', { open: true, lesson: o.lesson ?? null });
    current = this;
  }
  private firstOpen(): number {
    // the first lesson not learned yet (else the first row)
    const i = this.items.findIndex((it) => it.kind === 'row' && it.row.group !== 'prologue' && !it.row.coop && it.row.unlocked(this.hand).ok && !Teach.has('hall.' + it.row.id));
    return i >= 0 ? i : 1;
  }
  private get who(): PlayerInput { return this.o.who ?? (G.input as unknown as PlayerInput); }
  private get hand(): Player | null {
    const w = (G.scenes.current as { world?: { players: Player[] } } | null)?.world;
    return w?.players.find((p) => p.slot === (this.o.slot ?? 0)) ?? w?.players[0] ?? null;
  }
  private get row(): HallRow | null { const it = this.items[this.sel]; return it?.kind === 'row' ? it.row : null; }
  private rowH() { return Math.max(18, Math.ceil(Text.lineH('body')) + 3); }

  update(dt: number): boolean {
    this.t += dt;
    if (this.flash) { this.flash.t += dt; if (this.flash.t > 2) this.flash = null; }
    const inp = this.who;
    if (inp.pressed('cancel') || inp.pressed('pause')) { G.input.consume('pause'); sfx('uiBack'); return this.close(); }
    const nav = inp.nav(dt);
    if (nav.y) {
      let s = this.sel;
      for (let k = 0; k < this.items.length; k++) { s = (s + nav.y + this.items.length) % this.items.length; if (this.items[s].kind === 'row') break; }
      this.sel = s; sfx('uiMove');
    }
    const row = this.row;
    if (row) Hall.preview(row.id);
    if (inp.pressed('info')) { const g = Panels.open('rewindGuide', { who: this.who }); if (g) (G.scenes.current as unknown as { overlays: Overlay[] }).overlays.push(g); return true; }
    if (row && inp.pressed('special')) {
      // just watch: the curtain plays it; the board steps aside
      sfx('uiSelect');
      Hall.preview(row.id);
      return this.close();
    }
    if (row && inp.pressed('confirm')) {
      const lock = row.unlocked(this.hand);
      const players = this.hand?.world?.playerCount ?? 1;
      if (!lock.ok) { sfx('denied'); this.flash = { text: lock.why ?? C('hallLockSoon'), t: 0 }; return true; }
      if (row.coop && players < 2) { sfx('denied'); this.flash = { text: C('hallNeedTwo'), t: 0 }; return true; }
      const p = this.hand;
      if (p) { sfx('uiSelect'); this.close(); Hall.startLesson(row.id, p); return false; }
    }
    return !this.done;
  }
  private close(): boolean { this.done = true; if (current === this) current = null; Tut.log('hallBoard', { open: false }); return false; }

  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.55; rect(ctx, 0, 0, 640, 360, 'K0'); ctx.globalAlpha = 1;
    drawPanel(ctx, PX, PY, PW, PH, 'paper');
    const lb = Math.ceil(Text.lineH('body')), ls = Math.ceil(Text.lineH('small'));
    // header: the hall's name, the one sentence, and the guide button
    let y = PY + 7;
    Text.draw(ctx, C('hallTitle'), PX + 14, y, { color: 'B1', shadow: false });
    const gb = Rich.measure(`{@info} ${tr(C('hallGuideBtn'))}`, 'small', this.who);
    Rich.draw(ctx, `{@info} ${tr(C('hallGuideBtn'))}`, PX + PW - 14 - gb.w, y + 2, { size: 'small', color: 'S0', who: this.who });
    y += lb + 1;
    Text.draw(ctx, `${tr(S('onboard', 'model1'))}`, PX + 14, y, { size: 'small', color: 'K5', shadow: false, maxW: PW - 28 });
    y += ls;
    Text.draw(ctx, `${tr(S('onboard', 'model2'))}`, PX + 14, y, { size: 'small', color: 'K5', shadow: false, maxW: PW - 28 });
    y += ls + 3;
    rect(ctx, PX + 10, y, PW - 20, 1, 'S2');
    const listTop = y + 4, footY = PY + PH - ls - 8;
    this.renderList(ctx, listTop, footY - 4);
    rect(ctx, RX - 8, listTop, 1, footY - 4 - listTop, 'S2');
    this.renderDetail(ctx, listTop + 2, footY - 4);
    // footer
    const row = this.row;
    const foot = row && row.unlocked(this.hand).ok && !(row.coop && (this.hand?.world?.playerCount ?? 1) < 2) ? C('hallFooter') : C('hallFooterWatch');
    const fm = Rich.measure(foot, 'small', this.who);
    rect(ctx, PX + 10, footY - 3, PW - 20, 1, 'S2');
    Rich.draw(ctx, foot, PX + PW / 2 - fm.w / 2, footY, { size: 'small', color: 'K4', who: this.who });
    if (this.flash) {
      const a = Math.min(1, (2 - this.flash.t) / 0.3);
      const m = Text.measure(this.flash.text, 'body');
      ctx.globalAlpha = a;
      rect(ctx, 320 - m.w / 2 - 8, PY + PH - 46, m.w + 16, lb + 6, 'K0');
      Text.draw(ctx, this.flash.text, 320, PY + PH - 43, { color: 'R4', align: 'center' });
      ctx.globalAlpha = 1;
    }
  }

  private renderList(ctx: CanvasRenderingContext2D, y0: number, y1: number) {
    const rh = this.rowH();
    const rows = Math.max(1, Math.floor((y1 - y0) / rh));
    // keep the selection (and its group heading) in view
    const want = this.items[this.sel - 1]?.kind === 'group' ? this.sel - 1 : this.sel;
    if (want < this.top) this.top = want;
    if (this.sel >= this.top + rows) this.top = this.sel - rows + 1;
    this.top = Math.max(0, Math.min(this.items.length - rows, this.top));
    const drill = todaysDrill();
    for (let i = this.top; i < Math.min(this.items.length, this.top + rows); i++) {
      const it = this.items[i];
      const y = y0 + (i - this.top) * rh;
      const cy = y + rh / 2;
      if (it.kind === 'group') {
        const tw = Text.draw(ctx, C(it.key), LX, cy, { size: 'small', color: 'B2', valign: 'middle', shadow: false }).w;
        rect(ctx, LX + tw + 5, Math.round(cy), LW - tw - 8, 1, 'S2');
        continue;
      }
      const row = it.row;
      const lock = row.unlocked(this.hand);
      const sel = i === this.sel;
      if (sel) { rect(ctx, LX - 4, y + 1, LW + 6, rh - 2, 'S2'); rect(ctx, LX - 4, y + 1, 2, rh - 2, 'B2'); }
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = lock.ok ? 1 : 0.6;
      rowIcon(ctx, row, LX + 2, cy);
      const name = row.id === 'prologue' ? tr(C('hallPrologue')) : nameOf(row.id);
      Text.draw(ctx, name, LX + 20, cy, { color: sel ? 'K0' : 'K2', valign: 'middle', shadow: false, maxW: LW - 70 });
      ctx.globalAlpha = a0;
      if (!lock.ok && lock.why) {
        const s = tr(lock.why);
        Text.draw(ctx, s, LX + LW - 2, cy, { size: 'small', color: 'K5', align: 'right', valign: 'middle', shadow: false });
      } else if (row.group !== 'prologue') {
        const tick = Teach.has('hall.' + row.id) ? 'done' : Onboard.learned(this.hand, row.id + ':soft') && !Onboard.taught(this.hand, row.id) ? 'soft' : Onboard.taught(this.hand, row.id) ? 'done' : 'empty';
        drawTickBox(ctx, LX + LW - 26, cy - 4, 'check', tick, col);
        if (TRIALS[row.id]) drawTickBox(ctx, LX + LW - 13, cy - 4, 'star', Teach.has('star.' + row.id) ? 'done' : 'empty', col);
      }
      // today's drill: a brass pin
      if (drill === row.id) { rect(ctx, LX - 9, cy - 3, 4, 4, 'B4'); rect(ctx, LX - 8, cy - 2, 2, 2, 'B6'); rect(ctx, LX - 7, cy + 1, 1, 3, 'K4'); }
    }
    // scroll marks
    if (this.top > 0) for (let k = 0; k < 3; k++) rect(ctx, LX + LW / 2 - k, y0 - 3 + k, 1 + k * 2, 1, 'B2');
    if (this.top + rows < this.items.length) for (let k = 0; k < 3; k++) rect(ctx, LX + LW / 2 - 2 + k, y1 - 2 + k, 5 - k * 2, 1, 'B2');
  }

  private renderDetail(ctx: CanvasRenderingContext2D, y: number, yMax: number) {
    const row = this.row;
    if (!row) return;
    const ls = Math.ceil(Text.lineH('small'));
    // the loop (184×72), centred in the column
    const lx = Math.round(RX + RW / 2 - STAGE_W / 2);
    rect(ctx, lx - 2, y - 2, STAGE_W + 4, STAGE_H + 4, 'K2');
    LoopPlayer.draw(ctx, LOOPS[row.loop], this.t, lx, y, { scale: 1, who: this.who });
    y += STAGE_H + 6;
    const name = row.id === 'prologue' ? tr(C('hallPrologue')) : nameOf(row.id);
    Text.draw(ctx, name, RX, y, { color: 'K0', shadow: false });
    y += Math.ceil(Text.lineH('body'));
    const t = term(row.id === 'undo' ? 'rewind' : row.id === 'tick' ? 'tickDodge' : row.id);
    const plain = row.id === 'prologue' ? C('hallPrologueSub') : OWN_PLAIN.has(row.id) ? S('coach', 'p.' + row.id) : t ? t.plain : null;
    if (plain) y += Text.draw(ctx, plain, RX, y, { size: 'small', color: 'K4', shadow: false, maxW: RW }).h + 3;
    if (HAS_WHEN.has(row.id) && y + ls * 2 < yMax) {
      const when = S('coach', 'w.' + row.id), why = S('coach', 'y.' + row.id);
      const lw = Math.max(Text.measure(C('hallWhen'), 'small').w, Text.measure(C('hallWhy'), 'small').w) + 6;
      Text.draw(ctx, C('hallWhen'), RX, y, { size: 'small', color: 'B2', shadow: false });
      y += Text.draw(ctx, when, RX + lw, y, { size: 'small', color: 'K2', shadow: false, maxW: RW - lw }).h;
      Text.draw(ctx, C('hallWhy'), RX, y, { size: 'small', color: 'B2', shadow: false });
      y += Text.draw(ctx, why, RX + lw, y, { size: 'small', color: 'K2', shadow: false, maxW: RW - lw }).h + 3;
    }
    const tr0 = TRIALS[row.id];
    if (tr0 && y + ls < yMax) y += Text.draw(ctx, tr(C('hallStarGoal')).replace('{goal}', tr(tr0.goal)), RX, y, { size: 'small', color: 'B1', shadow: false, maxW: RW }).h;
    if (y + ls < yMax && row.group !== 'prologue' && row.group !== 'combat') {
      const rw = row.tick > 0 ? fill(C('hallReward'), { a: row.tick, b: row.star }) : row.star > 0 ? fill(C('hallRewardStarOnly'), { b: row.star }) : C('hallRewardNone');
      Text.draw(ctx, rw, RX, y, { size: 'small', color: 'K5', shadow: false, maxW: RW });
    }
  }
}
const fill = (l: L10n, v: Record<string, string | number>): L10n => {
  const f = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  return { zh: f(l.zh), en: f(l.en) };
};

/** a 12×12 mark per lesson family (drawn in pixels, in the board's ink) */
function rowIcon(ctx: CanvasRenderingContext2D, row: HallRow, x: number, cy: number) {
  const y = Math.round(cy - 6);
  x = Math.round(x);
  const px = (i: number, j: number, c: string) => { ctx.fillStyle = col(c); ctx.fillRect(x + i, y + j, 1, 1); };
  const ring = (c: string) => { for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; px(Math.round(6 + Math.cos(a) * 5), Math.round(6 + Math.sin(a) * 5), c); } };
  switch (row.loop) {
    case 'undo': ring('C1'); px(1, 5, 'C1'); px(2, 4, 'C1'); px(0, 4, 'C1'); px(6, 3, 'K3'); px(6, 4, 'K3'); px(6, 5, 'K3'); px(7, 6, 'K3'); break;
    case 'echo': for (const [i, j] of [[5, 1], [6, 1], [4, 2], [5, 2], [6, 2], [7, 2], [5, 3], [6, 3], [4, 4], [5, 4], [6, 4], [7, 4], [4, 5], [5, 5], [6, 5], [7, 5], [5, 6], [6, 6], [4, 7], [7, 7], [4, 8], [7, 8], [3, 9], [8, 9]]) px(i, j, 'C1'); break;
    case 'paradox': ring('C1'); for (const [i, j] of [[6, 3], [5, 4], [6, 4], [7, 4], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [5, 6], [6, 6], [7, 6], [6, 7]]) px(i, j, 'C2'); break;
    case 'scrub': for (let i = 1; i < 11; i++) { px(i, 6, i < 6 ? 'C2' : 'C1'); } px(5, 4, 'K2'); px(5, 5, 'K2'); px(5, 7, 'K2'); px(5, 8, 'K2'); px(8, 4, 'R2'); px(8, 5, 'R2'); break;
    case 'fork': for (const [i, j] of [[2, 9], [3, 8], [4, 7], [5, 6], [6, 5], [7, 4], [8, 3], [9, 2], [5, 7], [5, 8], [5, 9]]) px(i, j, 'C1'); px(9, 1, 'B2'); px(10, 2, 'B2'); break;
    default: for (const [i, j] of [[2, 3], [3, 3], [8, 3], [9, 3], [2, 4], [9, 4], [5, 6], [6, 6], [3, 8], [8, 8], [4, 9], [5, 9], [6, 9], [7, 9]]) px(i, j, 'B2');
  }
  if (row.coop) { px(10, 9, 'B3'); px(11, 9, 'B3'); px(10, 10, 'B3'); px(11, 10, 'B3'); }
}

let current: RehearsalBoard | null = null;
Panels.register('rehearsal', (args?: { who?: PlayerInput; slot?: number; lesson?: string }) => new RehearsalBoard(args ?? {}));
Tut.register('hallBoard', { get open() { return !!current && !current.done; }, get sel() { const it = current ? (current as unknown as { row: HallRow | null }).row : null; return it?.id ?? null; } });
