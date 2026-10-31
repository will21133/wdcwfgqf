// Pixel-crisp UI primitives (brass & indigo house style). Only fillRect — no AA.
import { col } from '../../art/palette';
import type { Ctx } from '../../engine/gfx/canvas';

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = col(c);
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Indigo panel with double brass border, rivets in the corners. */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, o: { fill?: string; border?: string; hi?: string; alpha?: number; rivets?: boolean } = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const a = o.alpha ?? 1;
  if (a !== 1) ctx.globalAlpha = a;
  rect(ctx, x, y, w, h, 'K0');
  rect(ctx, x + 1, y + 1, w - 2, h - 2, o.border ?? 'B2');
  rect(ctx, x + 2, y + 2, w - 4, h - 4, 'K0');
  rect(ctx, x + 3, y + 3, w - 6, h - 6, o.fill ?? 'K1');
  // top highlight on the brass line
  rect(ctx, x + 2, y + 1, w - 4, 1, o.hi ?? 'B4');
  // inner subtle gradient: top 1px lighter
  rect(ctx, x + 3, y + 3, w - 6, 1, 'K2');
  if (o.rivets !== false) {
    for (const [rx, ry] of [[x + 1, y + 1], [x + w - 3, y + 1], [x + 1, y + h - 3], [x + w - 3, y + h - 3]]) {
      rect(ctx, rx, ry, 2, 2, 'B5');
      rect(ctx, rx + 1, ry + 1, 1, 1, 'B2');
    }
  }
  if (a !== 1) ctx.globalAlpha = 1;
}

/** Parchment card (memories / parts) */
export function card(ctx: Ctx, x: number, y: number, w: number, h: number, rim: string, hi = false) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x, y, w, h, 'K0');
  rect(ctx, x + 1, y + 1, w - 2, h - 2, rim);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, 'K0');
  rect(ctx, x + 3, y + 3, w - 6, h - 6, hi ? 'K3' : 'K2');
  rect(ctx, x + 3, y + 3, w - 6, 1, hi ? 'K4' : 'K3');
  // corner notches
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) rect(ctx, cx, cy, 1, 1, 'K0');
}

export function hourglass(ctx: Ctx, x: number, y: number, fill: number, full: boolean, t: number, dim = false) {
  // 9x13 hourglass. frame brass, glass dark, sand cyan
  x = Math.round(x); y = Math.round(y);
  const fr = dim ? 'K4' : 'B4', frD = dim ? 'K3' : 'B2', glass = 'K1';
  rect(ctx, x, y, 9, 2, frD); rect(ctx, x, y, 9, 1, fr);
  rect(ctx, x, y + 11, 9, 2, frD); rect(ctx, x, y + 11, 9, 1, fr);
  // glass bulbs
  const rows = [7, 7, 5, 3, 1, 3, 5, 7, 7];
  for (let i = 0; i < 9; i++) {
    const w = rows[i];
    rect(ctx, x + Math.floor((9 - w) / 2) - 1, y + 2 + i, w + 2, 1, 'K0');
    rect(ctx, x + Math.floor((9 - w) / 2), y + 2 + i, w, 1, glass);
  }
  const sand = full ? 'C3' : 'C2';
  if (full) {
    // all sand in top bulb, glowing
    for (let i = 0; i < 4; i++) { const w = rows[i]; rect(ctx, x + Math.floor((9 - w) / 2), y + 2 + i, w, 1, i === 0 ? 'C4' : sand); }
  } else {
    // sand accumulating in the bottom bulb
    const lv = Math.round(fill * 4);
    for (let i = 0; i < lv; i++) { const r = 8 - i; const w = rows[r]; rect(ctx, x + Math.floor((9 - w) / 2), y + 2 + r, w, 1, sand); }
    if (fill > 0 && fill < 1 && Math.floor(t * 8) % 2) rect(ctx, x + 4, y + 6, 1, 2, 'C3');
  }
}

export function gearIcon(ctx: Ctx, x: number, y: number, c = 'B4', c2 = 'B2', core = 'R3') {
  // 9x9 gear
  const px = [
    '...x.x...', '..xxxxx..', '.xxxxxxx.', 'xxxoooxxx', '.xxoooxx.', 'xxxoooxxx', '.xxxxxxx.', '..xxxxx..', '...x.x...',
  ];
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const ch = px[j][i];
    if (ch === '.') continue;
    rect(ctx, x + i, y + j, 1, 1, ch === 'o' ? core : j < 4 ? c : c2);
  }
}

export function coinIcon(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 1, y, 5, 1, 'K0'); rect(ctx, x, y + 1, 7, 5, 'K0'); rect(ctx, x + 1, y + 6, 5, 1, 'K0');
  rect(ctx, x + 1, y + 1, 5, 5, 'B3'); rect(ctx, x + 1, y + 1, 4, 1, 'B5'); rect(ctx, x + 1, y + 1, 1, 4, 'B5');
  rect(ctx, x + 3, y + 2, 1, 3, 'B1');
}

/** time shard: a cut violet gem (crown facets, girdle, pointed pavilion) in a 7×8 box */
const SHARD = [
  '.kkkkk.',
  'klwlmdk',
  'kllmmdk',
  'kdddddk',
  '.kmmdk.',
  '..kmdk.',
  '..kdk..',
  '...k...',
];
const SHARD_C: Record<string, string> = { k: 'K0', l: 'V4', w: 'K10', m: 'V3', d: 'V2' };
export function shardIcon(ctx: Ctx, x: number, y: number) {
  for (let j = 0; j < SHARD.length; j++) {
    const row = SHARD[j];
    for (let i = 0; i < row.length; i++) {
      const c = SHARD_C[row[i]];
      if (!c) continue;
      let n = 1;
      while (i + n < row.length && row[i + n] === row[i]) n++;
      rect(ctx, x + i, y + j, n, 1, c);
      i += n - 1;
    }
  }
}

/** keycap prompt like  [Q]  */
export function keycap(ctx: Ctx, x: number, y: number, w: number) {
  rect(ctx, x, y, w, 11, 'K0');
  rect(ctx, x + 1, y, w - 2, 10, 'K6');
  rect(ctx, x + 1, y + 1, w - 2, 8, 'K4');
  rect(ctx, x + 1, y + 9, w - 2, 1, 'K3');
}
