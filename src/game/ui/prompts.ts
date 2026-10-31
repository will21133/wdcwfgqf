// Device-aware button prompts: keyboard keycaps, mouse buttons or hand-drawn Xbox buttons.
// The icons live in widgets.ts; this file keeps the 1.0 call sites (drawButton / drawHint).
import type { Action } from '../../engine/input';
import { drawPrompt, promptW, promptH, PROMPT_H } from './widgets';
import { Text } from './text';

/** draw one button glyph at (x,y) top-left (13 px tall); returns its width */
export function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, a: Action | 'nav'): number {
  return drawPrompt(ctx, a, x, y);
}

/** row of [button] label pairs centred at cx; icons are promptH() (13 px at 100%) tall starting at y */
export function drawHint(ctx: CanvasRenderingContext2D, cx: number, y: number, items: [Action | 'nav', string][]) {
  const gap = 12;
  const widths = items.map(([a, t]) => promptW(a) + (t ? 4 + Math.ceil(Text.measure(t, 'body').w) : 0));
  const total = widths.reduce((s, w) => s + w, 0) + (items.length - 1) * gap;
  let x = Math.round(cx - total / 2);
  items.forEach(([a, t], i) => {
    const bw = drawPrompt(ctx, a, x, y);
    if (t) Text.draw(ctx, t, x + bw + 4, y + promptH() / 2, { color: 'K8', valign: 'middle' });
    x += widths[i] + gap;
  });
}

export { PROMPT_H, promptH };
