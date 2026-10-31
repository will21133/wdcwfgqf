// Device-aware button prompts: keyboard keycaps or Xbox-coloured face buttons.
import { G } from '../G';
import { keyLabel, Action } from '../../engine/input';
import { col } from '../../art/palette';

const XBOX: Partial<Record<Action | 'nav', { label: string; color: string; round: boolean }>> = {
  confirm: { label: 'A', color: 'G3', round: true },
  dash: { label: 'A', color: 'G3', round: true },
  cancel: { label: 'B', color: 'R3', round: true },
  interact: { label: 'B', color: 'R3', round: true },
  attack: { label: 'X', color: 'U3', round: true },
  special: { label: 'Y', color: 'B5', round: true },
  rewind: { label: 'RB', color: 'K6', round: false },
  pause: { label: '☰', color: 'K6', round: false },
  info: { label: '⧉', color: 'K6', round: false },
  nav: { label: '✥', color: 'K6', round: false },
};

/** draw one button glyph at (x,y) top-left; returns its width */
export function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, a: Action | 'nav'): number {
  if (G.input.lastDevice === 'pad') {
    const b = XBOX[a] ?? { label: '?', color: 'K6', round: false };
    const w = b.round ? 11 : Math.max(13, G.small.measure(b.label) + 6);
    ctx.fillStyle = col('K0');
    if (b.round) { ctx.fillRect(x + 2, y, 7, 11); ctx.fillRect(x, y + 2, 11, 7); ctx.fillRect(x + 1, y + 1, 9, 9); }
    else ctx.fillRect(x, y, w, 11);
    ctx.fillStyle = col(b.color);
    if (b.round) { ctx.fillRect(x + 3, y + 1, 5, 9); ctx.fillRect(x + 1, y + 3, 9, 5); ctx.fillRect(x + 2, y + 2, 7, 7); }
    else ctx.fillRect(x + 1, y + 1, w - 2, 9);
    G.small.draw(ctx, b.label, x + w / 2, y + 1, { align: 'center', color: 'K10', shadow: false });
    return w;
  }
  const label = a === 'nav' ? '↑↓←→' : keyLabel(G.input.bindings[a][0]);
  const w = Math.max(11, G.small.measure(label) + 6);
  ctx.fillStyle = col('K0'); ctx.fillRect(x, y, w, 11);
  ctx.fillStyle = col('K6'); ctx.fillRect(x + 1, y, w - 2, 10);
  ctx.fillStyle = col('K4'); ctx.fillRect(x + 1, y + 1, w - 2, 8);
  G.small.draw(ctx, label, x + w / 2, y + 1, { align: 'center', color: 'K10', shadow: false });
  return w;
}

/** row of [button] label pairs centred at x */
export function drawHint(ctx: CanvasRenderingContext2D, cx: number, y: number, items: [Action | 'nav', string][]) {
  const widths = items.map(([a, t]) => (G.input.lastDevice === 'pad' ? 13 : Math.max(11, G.small.measure(a === 'nav' ? '↑↓←→' : keyLabel(G.input.bindings[a as Action][0])) + 6)) + 4 + G.small.measure(t));
  const total = widths.reduce((s, w) => s + w, 0) + (items.length - 1) * 14;
  let x = Math.round(cx - total / 2);
  items.forEach(([a, t], i) => {
    const bw = drawButton(ctx, x, y, a);
    G.small.draw(ctx, t, x + bw + 4, y + 1, { color: 'K7' });
    x += widths[i] + 14;
  });
}
