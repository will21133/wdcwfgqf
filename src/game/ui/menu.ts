// Reusable vertical menu list: buttons, sliders, toggles, choices. Keyboard / mouse / gamepad.
import { G, sfx } from '../G';
import { rect } from './draw';
import { col } from '../../art/palette';

export interface MenuItem {
  label: () => string;
  kind?: 'button' | 'slider' | 'toggle' | 'choice';
  act?: () => void;
  get?: () => number | boolean | string;
  set?: (v: any) => void;
  min?: number; max?: number; step?: number;
  options?: { label: string; value: string }[];
  disabled?: () => boolean;
  hint?: () => string;
}

export class MenuList {
  sel = 0;
  private hover = -1;
  rowH = 20;
  x = 0; y = 0; w = 240;
  constructor(public items: MenuItem[]) {}

  update(dt: number) {
    const inp = G.input;
    const n = this.items.length;
    const nav = inp.nav(dt);
    if (nav.y) { this.sel = (this.sel + nav.y + n) % n; sfx('uiMove'); }
    if (inp.mouseAim) {
      let h = -1;
      for (let i = 0; i < n; i++) if (inp.mx >= this.x && inp.mx < this.x + this.w && inp.my >= this.y + i * this.rowH - 2 && inp.my < this.y + (i + 1) * this.rowH - 2) h = i;
      if (h >= 0 && h !== this.hover) { this.sel = h; sfx('uiMove'); }
      this.hover = h;
    }
    const it = this.items[this.sel];
    if (!it || it.disabled?.()) return;
    const kind = it.kind ?? 'button';
    if (nav.x && (kind === 'slider' || kind === 'choice' || kind === 'toggle')) { this.change(it, nav.x); return; }
    const click = inp.pressed('attack') && inp.mouseAim && this.hover === this.sel;
    if (inp.pressed('confirm') || click) {
      if (kind === 'button') { sfx('uiSelect'); it.act?.(); }
      else if (kind === 'toggle' || kind === 'choice') this.change(it, 1);
      else if (kind === 'slider' && click) {
        const v = Math.max(0, Math.min(1, (inp.mx - (this.x + this.w - 90)) / 80));
        it.set?.((it.min ?? 0) + v * ((it.max ?? 1) - (it.min ?? 0)));
        sfx('uiMove');
      }
    }
  }

  private change(it: MenuItem, d: number) {
    const kind = it.kind;
    if (kind === 'slider') {
      const v = (it.get?.() as number) ?? 0;
      const st = it.step ?? 0.1;
      it.set?.(Math.max(it.min ?? 0, Math.min(it.max ?? 1, Math.round((v + d * st) * 100) / 100)));
    } else if (kind === 'toggle') it.set?.(!(it.get?.() as boolean));
    else if (kind === 'choice' && it.options) {
      const cur = it.get?.();
      let i = it.options.findIndex((o) => o.value === cur);
      i = (i + d + it.options.length) % it.options.length;
      it.set?.(it.options[i].value);
    }
    sfx('uiMove');
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
    this.x = x; this.y = y; this.w = w;
    this.items.forEach((it, i) => {
      const yy = y + i * this.rowH;
      const sel = i === this.sel;
      const dis = it.disabled?.();
      if (sel) {
        rect(ctx, x - 4, yy - 3, w + 8, this.rowH - 2, 'K3');
        rect(ctx, x - 4, yy - 3, 2, this.rowH - 2, 'B5');
      }
      G.font.draw(ctx, it.label(), x + 6, yy, { color: dis ? 'K5' : sel ? 'K10' : 'K8' });
      const kind = it.kind ?? 'button';
      const rx = x + w - 90;
      if (kind === 'slider') {
        const v = (it.get?.() as number) ?? 0;
        const k = (v - (it.min ?? 0)) / ((it.max ?? 1) - (it.min ?? 0));
        rect(ctx, rx, yy + 5, 80, 3, 'K0');
        rect(ctx, rx, yy + 5, Math.round(80 * k), 3, sel ? 'B5' : 'B3');
        rect(ctx, rx + Math.round(80 * k) - 1, yy + 3, 3, 7, sel ? 'B6' : 'B4');
        ctx.drawImage(G.digitsSmall.render(String(Math.round(v * 100)), 'K9', 'K0'), rx - 18, yy + 3);
      } else if (kind === 'toggle') {
        const on = !!it.get?.();
        rect(ctx, rx + 56, yy + 2, 22, 9, 'K0');
        rect(ctx, rx + 57, yy + 3, 20, 7, on ? 'G2' : 'K3');
        rect(ctx, on ? rx + 67 : rx + 58, yy + 3, 9, 7, on ? 'G4' : 'K6');
      } else if (kind === 'choice') {
        const cur = it.get?.();
        const o = it.options?.find((x) => x.value === cur);
        G.font.draw(ctx, `◀ ${o?.label ?? ''} ▶`, rx + 80, yy, { align: 'right', color: sel ? 'B5' : 'K8' });
      }
      if (sel && it.hint) G.small.draw(ctx, it.hint(), x + 6, y + this.items.length * this.rowH + 6, { color: 'K6', wrap: w });
    });
    void col;
  }
}
