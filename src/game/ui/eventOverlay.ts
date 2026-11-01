// Event (Frozen Moment) dialogue overlay: illustration, typewriter text, options, outcome.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { drawScaled } from './overlay';
import { G, sfx } from '../G';
import { tr, L10n } from '../i18n';
import { panel, rect } from './draw';
import { Text } from './text';
import { drawPrompt, promptH } from './widgets';
import type { Sprite } from '../../engine/gfx/sprite';
import { clamp, ease } from '../../engine/math';
import type { EventDef, EventCtx } from '../progression/events';
import type { Run } from '../run';
import type { InputLike } from './overlay';

export class EventOverlay implements Overlay {
  blocks = true;
  t = 0;
  sel = 0;
  result: L10n | null = null;
  resT = 0;
  closing = 0;
  private hover = -1;

  /** `input`: co-op, the deciding hand's own device (solo: the menu aggregate, every device) */
  constructor(private ev: EventDef, private art: Sprite | null, private run: Run, private ctx: EventCtx, private onClose: () => void, private input?: InputLike) {
    sfx('uiOpen');
    G.audio.muffle(true, 2000);
  }

  private opts() { return this.ev.options; }
  private ok(i: number) { const o = this.opts()[i]; return !o.cond || o.cond(this.run, this.ctx.lo); }

  update(dt: number): boolean {
    this.t += dt;
    const inp = this.input ?? G.input;
    const mouseAim = this.input ? !!this.input.usesMouse && G.input.mouseAim : G.input.mouseAim;
    const mx = G.input.mx, my = G.input.my;
    if (this.closing > 0) {
      this.closing += dt;
      if (this.closing > 0.3) { G.audio.muffle(false); this.onClose(); return false; }
      return true;
    }
    if (this.result) {
      this.resT += dt;
      if (this.resT > 0.6 && (inp.pressed('confirm') || inp.pressed('attack') || inp.pressed('interact'))) { this.closing = 0.001; sfx('uiBack'); }
      return true;
    }
    if (this.t < 0.4) return true;
    const nav = inp.nav(dt);
    const n = this.opts().length;
    if (nav.y) { this.sel = (this.sel + nav.y + n) % n; sfx('uiMove'); }
    // mouse
    if (mouseAim) {
      let h = -1;
      for (let i = 0; i < n; i++) {
        const y = this.optY(i);
        if (mx > 250 && mx < 610 && my >= y - 4 && my < y - 4 + this.optH - 1) h = i;
      }
      if (h >= 0 && h !== this.hover) { this.sel = h; sfx('uiMove'); }
      this.hover = h;
    }
    const click = inp.pressed('attack') && mouseAim && this.hover >= 0;
    if (inp.pressed('confirm') || click || inp.pressed('interact')) {
      if (!this.ok(this.sel)) { sfx('denied'); return true; }
      this.result = this.opts()[this.sel].act(this.ctx);
      sfx('uiSelect');
    }
    return true;
  }

  /** option rows (logical y of the first row's text, row height) — from the last render */
  private optTop = 190;
  private optH = 32;
  private optY(i: number) { return this.optTop + i * this.optH; }

  render(r: Renderer) {
    const ctx = r.ui2;
    const k = ease.outCubic(clamp(this.t / 0.35, 0, 1)) * (this.closing > 0 ? 1 - this.closing / 0.3 : 1);
    ctx.globalAlpha = 0.75 * k;
    ctx.fillStyle = '#0b0a14';
    ctx.fillRect(0, 0, 640, 360);
    ctx.globalAlpha = k;
    const x = 28, y = 30 + Math.round((1 - k) * 20), w = 584, h = 300;
    panel(ctx, x, y, w, h, { fill: 'K1' });
    // illustration frame
    panel(ctx, x + 12, y + 12, 200, 276, { fill: 'K0', border: 'B1', rivets: false });
    // night gradient background
    for (let i = 0; i < 268; i += 4) rect(ctx, x + 16, y + 16 + i, 192, 4, i < 120 ? 'U0' : i < 200 ? 'K1' : 'K2');
    if (this.art) drawScaled(ctx, this.art, x + 112, y + 170, 4);
    // floor line
    rect(ctx, x + 16, y + 222, 192, 1, 'K3');
    // title & text
    // title, rule, text, then options / result: each block starts below the measured one above it
    Text.draw(ctx, this.ev.title, x + 228, y + 16, { color: 'B5' });
    const ruleY = Math.round(y + 16 + Text.lineH('body') + 3);
    rect(ctx, x + 228, ruleY, 340, 1, 'B1');
    const text = tr(this.ev.text);
    const shown = Math.floor(clamp((this.t - 0.25) * 60, 0, text.length));
    const textY = ruleY + 8;
    G.font.draw(ctx, text.slice(0, shown), x + 228, textY, { color: 'K9', wrap: 340, lineH: 16 });
    const textEnd = textY + G.font.blockSize(text, 340, 16)[1];
    if (this.result) {
      const ry = Math.max(y + 160, Math.round(textEnd + 8));
      rect(ctx, x + 228, ry, 340, 1, 'B1');
      const rt = tr(this.result);
      const rs = Math.floor(clamp(this.resT * 70, 0, rt.length));
      G.font.draw(ctx, rt.slice(0, rs), x + 228, ry + 10, { color: 'K10', wrap: 340, lineH: 16 });
      if (this.resT > 0.6 && Math.floor(this.t * 3) % 2 === 0) drawPrompt(ctx, 'confirm', x + w - 26, y + h - 9 - promptH(), this.input);
    } else if (shown >= text.length || this.t > 1.2) {
      // rows hold a 12px label and a 10px detail line; they grow with the text and start below it
      this.optH = Math.max(32, Math.ceil(Text.lineH('body') + Text.lineH('small') + 5));
      this.optTop = Math.max(190, Math.round(textEnd + 12 - (y - 30)));
      this.opts().forEach((o, i) => {
        const oy = this.optY(i) - 30 + y;
        const sel = i === this.sel;
        const ok = this.ok(i);
        if (sel) { rect(ctx, x + 226, oy - 4, 344, this.optH - 1, 'K3'); rect(ctx, x + 226, oy - 4, 2, this.optH - 1, 'B5'); }
        Text.draw(ctx, (sel ? '▸ ' : '  ') + tr(o.label), x + 234, oy - 3, { color: !ok ? 'K7' : sel ? 'K10' : 'K9' });
        if (o.detail) Text.draw(ctx, o.detail, x + 246, oy - 3 + Text.lineH('body') + 1, { size: 'small', color: ok ? 'K8' : 'R4', maxW: 320 });
      });
    }
    ctx.globalAlpha = 1;
  }
}
