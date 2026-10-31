// Global notice layer: small toasts for achievements, secrets, chimes and unlocks.
// Drawn above every scene (and scene transitions) by main.ts; never blocks input.
// Top-right corner, under the currency counters (y 36 down, clear of the HUD's brass / shard rows);
// at most three on screen, the rest wait. Stacked toasts share one width so their edges line up.
import type { Renderer } from '../../engine/gfx/renderer';
import { G } from '../G';
import { L, L10n, tr } from '../i18n';
import { Text, ColorKey } from './text';
import { drawPanel, drawBits } from './widgets';
import { rect } from './draw';
import { ease, clamp } from '../../engine/math';

export type NoticeKind = 'achievement' | 'secret' | 'chime' | 'unlock';

export interface NoticeSpec {
  kind: NoticeKind;
  name: L10n;
  /** overrides the small kind label above the name */
  label?: L10n;
  /** optional plain-language line under the name (FP10, K7) */
  sub?: L10n;
}

interface Live extends NoticeSpec { t: number; slotY: number; sz?: { w: number; h: number }; szKey?: string }

const DUR = 4.2, IN = 0.28, OUT = 0.3, MAX_LIVE = 3, TOP = 36;

const COLOR: Record<NoticeKind, ColorKey> = { achievement: 'B5', secret: 'V4', chime: 'B6', unlock: 'G4' };
const LABEL: Record<NoticeKind, L10n> = {
  achievement: L('成就达成', 'Achievement'),
  secret: L('发现秘密', 'Secret found'),
  chime: L('钟响', 'Chime'),
  unlock: L('解锁', 'Unlocked'),
};
// 11×11 icons
const ICON: Record<NoticeKind, string[]> = {
  achievement: [
    '.#########.',
    '##.#####.##',
    '#..#####..#',
    '#..#####..#',
    '.#.#####.#.',
    '..#######..',
    '....###....',
    '.....#.....',
    '.....#.....',
    '...#####...',
    '..#######..',
  ],
  secret: [
    '....###....',
    '...#####...',
    '..#######..',
    '..#######..',
    '..#######..',
    '...#####...',
    '....###....',
    '...#####...',
    '...#####...',
    '..#######..',
    '..#######..',
  ],
  chime: [
    '.....#.....',
    '....###....',
    '...#####...',
    '..##...##..',
    '..#.....#..',
    '..#.....#..',
    '.##.....##.',
    '.#.......#.',
    '###########',
    '...........',
    '....###....',
  ],
  unlock: [
    '...###.....',
    '..#...#....',
    '..#...#....',
    '..#...#....',
    '...###.....',
    '....#......',
    '....#......',
    '....###....',
    '....#......',
    '....##.....',
    '....#......',
  ],
};
const SOUND: Record<NoticeKind, string> = { achievement: 'notice', secret: 'secretFound', chime: 'chimeRing', unlock: 'notice' };

const waiting: NoticeSpec[] = [];
const live: Live[] = [];

/** a toast's own size, measured once per text scale / language */
function size(n: Live) {
  const key = `${Text.k}|${tr(LABEL.chime)}`;
  if (n.sz && n.szKey === key) return n.sz;
  const label = n.label ?? LABEL[n.kind];
  const w = Math.max(Text.measure(label, 'small').w, Text.measure(n.name, 'body').w, n.sub ? Text.measure(n.sub, 'small').w : 0);
  const h = 6 + Text.lineH('small') + Text.lineH('body') + (n.sub ? Text.lineH('small') : 0) + 2;
  n.sz = { w: Math.round(clamp(w + 38, 150, 260)), h: Math.round(h) };
  n.szKey = key;
  return n.sz;
}

export const Notices = {
  push(n: NoticeSpec): void { waiting.push(n); },
  /** notices currently visible or queued */
  get pending(): number { return waiting.length + live.length; },
  update(dt: number): void {
    for (let i = live.length - 1; i >= 0; i--) {
      live[i].t += dt;
      if (live[i].t > DUR) live.splice(i, 1);
    }
    while (live.length < MAX_LIVE && waiting.length) {
      const n = waiting.shift()!;
      live.push({ ...n, t: 0, slotY: -1 });
      G.audio.play(SOUND[n.kind]);
    }
    // stack top-down, sliding into freed slots
    let y = TOP;
    for (const n of live) {
      const h = size(n).h;
      n.slotY = n.slotY < 0 ? y : n.slotY + (y - n.slotY) * Math.min(1, dt * 10);
      y += h + 4;
    }
  },
  render(r: Renderer): void {
    if (!live.length) return;
    const ctx = r.ui2;
    // one width for the whole stack, so the left edges line up
    let w = 0;
    for (const n of live) w = Math.max(w, size(n).w);
    for (const n of live) {
      const { h } = size(n);
      const kIn = ease.outCubic(clamp(n.t / IN, 0, 1));
      const kOut = n.t > DUR - OUT ? ease.inCubic(clamp((n.t - (DUR - OUT)) / OUT, 0, 1)) : 0;
      const x = Math.round(640 - 8 - w + (1 - kIn) * (w + 12) + kOut * (w + 12));
      const y = Math.round(n.slotY);
      const c = COLOR[n.kind];
      drawPanel(ctx, x, y, w, h, 'dark');
      rect(ctx, x + 2, y + 2, 2, h - 4, c);
      // icon well
      rect(ctx, x + 8, y + Math.round(h / 2) - 8, 17, 17, 'K0');
      rect(ctx, x + 9, y + Math.round(h / 2) - 7, 15, 15, 'K2');
      drawBits(ctx, ICON[n.kind], x + 11, y + Math.round(h / 2) - 5, c);
      // arrival glint along the top edge
      if (n.t < 0.6) {
        const gx = x + 4 + Math.round((w - 12) * clamp((n.t - 0.1) / 0.5, 0, 1));
        rect(ctx, gx, y + 2, 6, 1, 'K10');
      }
      const tx = x + 31;
      let ty = y + 2;
      Text.draw(ctx, n.label ?? LABEL[n.kind], tx, ty, { size: 'small', color: 'K8' });
      ty += Text.lineH('small');
      Text.draw(ctx, n.name, tx, ty, { color: c });
      if (n.sub) { ty += Text.lineH('body'); Text.draw(ctx, n.sub, tx, ty, { size: 'small', color: 'K7' }); }
    }
  },
  /** debug helper: drop everything */
  clear(): void { waiting.length = 0; live.length = 0; },
};

export function noticeLabel(kind: NoticeKind): string { return tr(LABEL[kind]); }
