// Device-aware button prompts: keyboard keycaps, mouse buttons or hand-drawn Xbox buttons.
// The icons live in widgets.ts; this file keeps the 1.0 call sites (drawButton / drawHint).
import type { Action } from '../../engine/input';
import { drawPrompt, promptW, promptH, PROMPT_H, type PromptDevice } from './widgets';
import { Text, type TextSize } from './text';

/** draw one button glyph at (x,y) top-left (13 px tall); returns its width */
export function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, a: Action | 'nav'): number {
  return drawPrompt(ctx, a, x, y);
}

/** width of a drawHint row */
export function hintW(items: [Action | 'nav', string][], who?: PromptDevice | null, size: TextSize = 'body'): number {
  const gap = 12;
  return items.reduce((s, [a, t]) => s + promptW(a, who) + (t ? 4 + Math.ceil(Text.measure(t, size).w) : 0), 0) + Math.max(0, items.length - 1) * gap;
}

/**
 * row of [button] label pairs centred at cx; icons are promptH() (13 px at 100%) tall starting at y.
 * `who`: whose glyphs (a player's own device / key table in co-op panels; default the menu's).
 */
export function drawHint(ctx: CanvasRenderingContext2D, cx: number, y: number, items: [Action | 'nav', string][], who?: PromptDevice | null, size: TextSize = 'body') {
  const gap = 12;
  const widths = items.map(([a, t]) => promptW(a, who) + (t ? 4 + Math.ceil(Text.measure(t, size).w) : 0));
  const total = widths.reduce((s, w) => s + w, 0) + (items.length - 1) * gap;
  let x = Math.round(cx - total / 2);
  items.forEach(([a, t], i) => {
    const bw = drawPrompt(ctx, a, x, y, who);
    if (t) Text.draw(ctx, t, x + bw + 4, y + promptH() / 2, { size, color: 'K8', valign: 'middle' });
    x += widths[i] + gap;
  });
}

export { PROMPT_H, promptH };
