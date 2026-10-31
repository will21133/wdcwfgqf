// Event (Frozen Moment) dialogue overlay: illustration, typewriter text, options, outcome.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { drawScaled } from './overlay';
import { G, sfx } from '../G';
import { tr, L10n } from '../i18n';
import { panel, rect } from './draw';
import { Text } from './text';
import { drawPrompt } from './widgets';
import type { Sprite } from '../../engine/gfx/sprite';
import { clamp, ease } from '../../engine/math';
import type { EventDef, EventCtx } from '../progression/events';
import type { Run } from '../run';

export class EventOverlay implements Overlay {
  blocks = true;
  t = 0;
  sel = 0;
  result: L10n | null = null;
  resT = 0;
  closing = 0;
  private hover = -1;

  constructor(private ev: EventDef, private art: Sprite | null, private run: Run, private ctx: EventCtx, private onClose: () => void) {
    sfx('uiOpen');
    G.audio.muffle(true, 2000);
  }

  private opts() { return this.ev.options; }
  private ok(i: number) { const o = this.opts()[i]; return !o.cond || o.cond(this.run); }

  update(dt: number): boolean {
    this.t += dt;
    const inp = G.input;
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
    if (inp.mouseAim) {
      let h = -1;
      for (let i = 0; i < n; i++) {
        const y = this.optY(i);
        if (inp.mx > 250 && inp.mx < 610 && inp.my >= y - 4 && inp.my < y + 27) h = i;
      }
      if (h >= 0 && h !== this.hover) { this.sel = h; sfx('uiMove'); }
      this.hover = h;
    }
    const click = inp.pressed('attack') && inp.mouseAim && this.hover >= 0;
    if (inp.pressed('confirm') || click || inp.pressed('interact')) {
      if (!this.ok(this.sel)) { sfx('denied'); return true; }
      this.result = this.opts()[this.sel].act(this.ctx);
      sfx('uiSelect');
    }
    return true;
  }

  private optY(i: number) { return 190 + i * 32; }

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
    G.font.draw(ctx, tr(this.ev.title), x + 228, y + 16, { color: 'B5' });
    rect(ctx, x + 228, y + 34, 340, 1, 'B1');
    const text = tr(this.ev.text);
    const shown = Math.floor(clamp((this.t - 0.25) * 60, 0, text.length));
    G.font.draw(ctx, text.slice(0, shown), x + 228, y + 42, { color: 'K9', wrap: 340, lineH: 16 });
    if (this.result) {
      rect(ctx, x + 228, y + 160, 340, 1, 'B1');
      const rt = tr(this.result);
      const rs = Math.floor(clamp(this.resT * 70, 0, rt.length));
      G.font.draw(ctx, rt.slice(0, rs), x + 228, y + 170, { color: 'K10', wrap: 340, lineH: 16 });
      if (this.resT > 0.6 && Math.floor(this.t * 3) % 2 === 0) drawPrompt(ctx, 'confirm', x + w - 26, y + h - 22);
    } else if (shown >= text.length || this.t > 1.2) {
      this.opts().forEach((o, i) => {
        const oy = this.optY(i) - 30 + y;
        const sel = i === this.sel;
        const ok = this.ok(i);
        if (sel) { rect(ctx, x + 226, oy - 4, 344, 31, 'K3'); rect(ctx, x + 226, oy - 4, 2, 31, 'B5'); }
        Text.draw(ctx, (sel ? '▸ ' : '  ') + tr(o.label), x + 234, oy - 4, { color: !ok ? 'K7' : sel ? 'K10' : 'K9' });
        if (o.detail) Text.draw(ctx, o.detail, x + 246, oy + 12, { size: 'small', color: ok ? 'K8' : 'R4', maxW: 320 });
      });
    }
    ctx.globalAlpha = 1;
  }
}
