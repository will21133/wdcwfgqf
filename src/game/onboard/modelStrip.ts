// The model strip (ONBOARD2 §1.3): five icon cells that spell the one sentence, lit lesson by lesson
// — "undo seconds → damage too → past you = Echo → does it again → touch ◆ = boom". It anchors every
// lesson's success beat, the report card, the pause page header, the death card and the Hall board.
//
//   ModelStrip.draw(ctx, cx, y, lit, o)   lit = bitmask (bit 0 = cell ①); centred on cx, top at y
//   STRIP.undo … STRIP.all                the bits each lesson lights
//
// Interface day: real cells, labels and lighting; the light-up animation (K5 → C4 → C3 with the 1 px
// white ring and spotPing) comes with Beat.success (F4a days 2–4) through o.pulse.
import { S } from '../strings';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { drawBits } from '../ui/widgets';
import '../strings/onboard';

export const STRIP = { undo: 0b00011, echo: 0b01100, paradox: 0b10000, all: 0b11111 } as const;

/** 12×12 line icons (drawn in one colour) */
const ICONS: string[][] = [
  // ① a counter-clockwise arrow
  ['....####....', '..##....##..', '.#........#.', '#..........#', '#..........#', '#...........', '#...........', '#......#....', '.#....###...', '..##.#####..', '....####....', '............'],
  // ② a heart with a curl back
  ['............', '.##...##....', '####.####...', '#########...', '#########.#.', '.#######..#.', '..#####...#.', '...###...#..', '....#...#...', '.......#....', '.....###....', '............'],
  // ③ a little hand (person)
  ['....###.....', '...#####....', '...#####....', '....###.....', '..#######...', '.#.#####.#..', '...#####....', '...#####....', '...##.##....', '...##.##....', '..###.###...', '............'],
  // ④ two blades
  ['#.........#.', '.#.......#..', '..#.....#...', '...#...#....', '....#.#.....', '.....#......', '....#.#.....', '...#...#....', '.##.....##..', '.##.....##..', '............', '............'],
  // ⑤ ◆ and a blast ring
  ['....####....', '..##....##..', '.#...#....#.', '#...###....#', '#..#####...#', '#...###....#', '#....#.....#', '.#........#.', '..##....##..', '....####....', '............', '............'],
];

export interface ModelStripOpts {
  /** label size (default small) */
  size?: 'small' | 'body';
  /** bitmask of cells drawing their light-up flash this frame (Beat.success animates it) */
  pulse?: number;
  /** 0..1 of the flash (white ring r+0 → r+6) */
  pulseK?: number;
}

/** the cells' total size at this text scale (before drawing) */
export function modelStripSize(o: ModelStripOpts = {}): { w: number; h: number } {
  const size = o.size ?? 'small';
  let w = 0;
  for (let i = 0; i < 5; i++) w += cellW(i, size) + (i < 4 ? ARROW_W : 0);
  return { w, h: 12 + 2 + Math.ceil(Text.lineH(size)) };
}
const ARROW_W = 11;
function cellW(i: number, size: 'small' | 'body'): number {
  return Math.max(28, Math.ceil(Text.measure(S('onboard', 'strip' + (i + 1)), size).w) + 6);
}

export const ModelStrip = {
  draw(ctx: CanvasRenderingContext2D, cx: number, y: number, lit: number, o: ModelStripOpts = {}): { w: number; h: number } {
    const size = o.size ?? 'small';
    const { w, h } = modelStripSize(o);
    let x = Math.round(cx - w / 2);
    y = Math.round(y);
    for (let i = 0; i < 5; i++) {
      const cw = cellW(i, size);
      const on = !!(lit & (1 << i));
      const icx = x + Math.round(cw / 2);
      drawBits(ctx, ICONS[i], icx - 6, y, on ? 'C3' : 'K5');
      if (o.pulse && o.pulse & (1 << i)) {
        const k = Math.max(0, Math.min(1, o.pulseK ?? 0));
        const r = 7 + Math.round(6 * k);
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * (1 - k);
        rect(ctx, icx - r, y + 6 - r, r * 2, 1, 'K10'); rect(ctx, icx - r, y + 6 + r, r * 2, 1, 'K10');
        rect(ctx, icx - r, y + 6 - r, 1, r * 2, 'K10'); rect(ctx, icx + r, y + 6 - r, 1, r * 2 + 1, 'K10');
        ctx.globalAlpha = a0;
      }
      Text.draw(ctx, S('onboard', 'strip' + (i + 1)), icx, y + 14, { size, align: 'center', color: on ? 'K8' : 'K6' });
      x += cw;
      if (i < 4) {
        // a small "→" between cells, on the icons' middle line
        rect(ctx, x + 2, y + 6, 6, 1, 'K6');
        rect(ctx, x + 6, y + 5, 1, 3, 'K6');
        rect(ctx, x + 7, y + 6, 1, 1, 'K6');
        x += ARROW_W;
      }
    }
    return { w, h };
  },
};
