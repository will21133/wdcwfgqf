// Text API (PLAN2 §1.1). One entry point for every player-facing string:
//   title = FP12 × 2 · body = FP12 (line 15) · small = FP10 (line 13) · tiny = FP8, latin / digits only.
// Coordinates and sizes are logical 640×360 pixels; on the device-resolution UI layer glyphs are
// blitted at an integer multiple of the font pixel (see engine/gfx/font.ts).
import { G } from '../G';
import { tr, L10n } from '../i18n';
import type { PalKey } from '../../art/palette';
import type { PixelFont } from '../../engine/gfx/font';
import { textScale } from '../../engine/gfx/font';
import { Renderer } from '../../engine/gfx/renderer';
import { rect } from './draw';

export type ColorKey = PalKey | (string & {});
export type TextSize = 'title' | 'body' | 'small' | 'tiny';
export interface TextOpts {
  size?: TextSize; color?: ColorKey; align?: 'left' | 'center' | 'right';
  shadow?: boolean; outline?: ColorKey | false; maxW?: number; alpha?: number;
  /** 85% K0 backing plate */
  plate?: boolean;
}

function font(size: TextSize): PixelFont {
  return size === 'small' ? G.small : size === 'tiny' ? G.tiny : G.font;
}
const mag = (size: TextSize) => (size === 'title' ? 2 : 1);
const str = (s: string | L10n) => (typeof s === 'string' ? s : tr(s));

export const Text = {
  draw(ctx: CanvasRenderingContext2D, s: string | L10n, x: number, y: number, o: TextOpts = {}): { w: number; h: number } {
    const t = str(s);
    if (!t) return { w: 0, h: 0 };
    const size = o.size ?? 'body';
    const f = font(size);
    if (o.plate) {
      const m = Text.measureWrapped(t, size, o.maxW);
      const x0 = o.align === 'center' ? x - m.w / 2 : o.align === 'right' ? x - m.w : x;
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * 0.85 * Math.max(0, Math.min(1, o.alpha ?? 1));
      rect(ctx, x0 - 3, y + 1, m.w + 6, m.h + 1, 'K0');
      ctx.globalAlpha = a;
    }
    const [w, h] = f.draw(ctx, t, x, y, {
      color: o.color ?? 'K10', align: o.align, wrap: o.maxW, alpha: o.alpha, scale: mag(size),
      outline: o.outline ? o.outline : false, shadow: o.outline ? false : o.shadow === false ? false : 'K0',
    });
    return { w, h };
  },
  /** single-line size in logical px (no wrapping) */
  measure(s: string | L10n, size: TextSize = 'body'): { w: number; h: number } {
    const t = str(s);
    return { w: font(size).measure(t) * mag(size), h: Text.lineH(size) * Math.max(1, t.split('\n').length) };
  },
  measureWrapped(s: string | L10n, size: TextSize, maxW?: number): { w: number; h: number } {
    const t = str(s);
    const k = mag(size);
    const [w, h] = font(size).blockSize(t, maxW ? maxW / k : undefined);
    return { w: w * k, h: h * k };
  },
  wrap(s: string | L10n, size: TextSize, maxW: number): string[] {
    return font(size).wrapLines(str(s), maxW / mag(size));
  },
  /** line height in logical px on the UI layer */
  lineH(size: TextSize): number {
    return font(size).lineH * mag(size) * textScale.k;
  },
};

const SLOT_TICK = ['R3', 'B5', 'G3', 'U4'];

// World labels (r.label) are painted with the Text API, centred on their anchor; y is the text top.
Renderer.labelPainter = (ctx, l, x, y, alpha) => {
  const size = l.size ?? 'body';
  const m = Text.draw(ctx, l.text, x, y, { size, color: l.color ?? 'K10', align: 'center', plate: l.plate, alpha });
  if (l.player !== undefined) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * alpha;
    rect(ctx, x - m.w / 2 - 3, y + 1, 1, m.h + 1, SLOT_TICK[((l.player % 4) + 4) % 4]);
    ctx.globalAlpha = a;
  }
};
