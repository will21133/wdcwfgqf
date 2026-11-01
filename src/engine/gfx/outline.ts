// Sprite silhouettes in one colour (F3): the hollow Shadow (ui/rewindHud.ts) and an echo's dashed /
// solid rim (entities/echo.ts). The edge = opaque pixels with a transparent 4-neighbour. Cached per
// sprite, colour and dash pattern.
import { Sprite } from './sprite';
import { makeCanvas } from './canvas';
import { col } from '../../art/palette';

export type OutlineDash = 'solid' | 'dash' | 'dot';
const OUTLINES = new WeakMap<Sprite, Map<string, Sprite>>();

/** `dash` keeps 2 of every 3 edge pixels (dashed) or 1 of 2 (dotted) */
export function outlineOf(s: Sprite, color: string, dash: OutlineDash): Sprite {
  let m = OUTLINES.get(s);
  if (!m) OUTLINES.set(s, (m = new Map()));
  const key = color + dash;
  let o = m.get(key);
  if (o) return o;
  const w = s.w, h = s.h;
  const src = s.img.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [cv, ctx] = makeCanvas(w, h);
  ctx.fillStyle = col(color);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    if (on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) continue;
    if (dash === 'dash' && (x + y) % 3 === 2) continue;
    if (dash === 'dot' && (x + y) % 2 === 1) continue;
    ctx.fillRect(x, y, 1, 1);
  }
  o = new Sprite(cv, s.ox, s.oy);
  m.set(key, o);
  return o;
}
