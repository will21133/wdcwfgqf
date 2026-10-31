// TICK — the living second hand. Hand-authored parts, composed into frames at boot.
// Proportions: 11px clock head (with crown) on a 9px body, ~21px total.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf } from '../../engine/gfx/sprite';
import { blit, rgb } from '../blit';

export type Dir = 'down' | 'up' | 'side';

const PAL: Record<string, string> = {
  W: 'K10', w: 'K9', v: 'K8', e: 'K1', E: 'K2', p: 'R4',
  Y: 'B6', B: 'B5', b: 'B4', n: 'B3', m: 'B2', d: 'B1',
  S: 'R4', s: 'R3', z: 'R2', Z: 'R1',
  C: 'U3', c: 'U2', x: 'U1', X: 'U0',
  l: 'K3', L: 'K2', o: 'B1', O: 'B0', h: 'K9', H: 'K7',
};

// ── heads (11 wide, 11 tall incl. crown) ──
const HEAD_DOWN = [
  '....nYn....',
  '.....m.....',
  '...bBBBbn..',
  '..bWWvWWwn.',
  '.bWWWWWWWwm',
  '.bWeWWWeWwm',
  '.nWeWWWeWwm',
  '.nWWWWWWwvm',
  '.mwWWWWwwvm',
  '..mnwwwvnm.',
  '...mmmmmm..',
];
const HEAD_DOWN_BLINK = HEAD_DOWN.map((r, i) => (i === 5 ? '.bWWWWWWWwm' : i === 6 ? '.nWEWWWEWwm' : r));
const HEAD_DOWN_HURT = HEAD_DOWN.map((r, i) => (i === 5 ? '.bWeWWWeWwm' : i === 6 ? '.nWWeWeWWwm' : i === 7 ? '.nWWWEWWwvm' : r));
const HEAD_UP = [
  '....nYn....',
  '.....m.....',
  '...nbbbnm..',
  '..nbBBBbnm.',
  '.nbBbmmbBnm',
  '.nbBmbbmBnm',
  '.nbBmbbmBnm',
  '.mnbBmmBbnm',
  '.mnbbBBbnmm',
  '..mnnnnnmm.',
  '...mmmmmm..',
];
const HEAD_SIDE = [
  '.....nYn...',
  '......m....',
  '....nbBBb..',
  '...nbWWWWb.',
  '..mnbWWWWWb',
  '..mnbWWWeWb',
  '..mnbWWWeWn',
  '..mnbWWWWwn',
  '..mmnbwWwvn',
  '...mmnbwvn.',
  '....mmmmm..',
];
const HEAD_SIDE_BLINK = HEAD_SIDE.map((r, i) => (i === 5 ? '..mnbWWWWWb' : i === 6 ? '..mnbWWWEWn' : r));
const HEAD_SIDE_HURT = HEAD_SIDE.map((r, i) => (i === 5 ? '..mnbWWeWWb' : i === 6 ? '..mnbWWWeWn' : r));
const HEAD_UP_HURT = HEAD_UP;

// ── bodies (11 wide) — scarf wraps the neck, navy coat, brass buttons ──
const BODY_DOWN = [
  '...zsSSsz..',
  '..zsSSSSsz.',
  '..CcsZcccx.',
  '..CcsYcccx.',
  '..Ccccccx..',
  '..xCcYccx..',
  '...xxXxx...',
];
const BODY_UP = [
  '...zsSSsz..',
  '..zsssssz..',
  '..xcccccCx.',
  '..xcccccCx.',
  '..xccccCx..',
  '..xcccccx..',
  '...xxXxx...',
];
const BODY_SIDE = [
  '...zsSSs...',
  '..zzsSSz...',
  '..xcCcCz...',
  '..xccCcc...',
  '..xcccYc...',
  '..xccccx...',
  '...xXxx....',
];

export interface TickFrames {
  idle: Record<Dir, Sprite[]>;
  run: Record<Dir, Sprite[]>;
  dash: Record<Dir, Sprite>;
  hurt: Record<Dir, Sprite>;
  blink: Record<Dir, Sprite>;
  /** neck anchor (for scarf) per dir/state frame: offset from pivot */
  neck: Record<Dir, { x: number; y: number }>;
  /** hand anchor offsets (relative to pivot) for weapon, per dir */
  hand: Record<Dir, { x: number; y: number }>;
}

const W = 22, H = 26, PX = 11, PY = 24; // canvas & pivot (feet centre)

function drawLegs(pb: PixelBuf, dir: Dir, phase: number, moving: boolean, bodyY: number) {
  const leg = rgb('K3'), legD = rgb('K2'), shoe = rgb('B2'), shoeD = rgb('B1');
  const baseY = PY - 1; // shoe row
  if (dir === 'side') {
    // two legs swinging forward/back
    const s = moving ? Math.sin(phase * Math.PI * 2) : 0;
    const legs = [
      { off: Math.round(s * 2.5), lift: moving ? Math.max(0, Math.round(-Math.cos(phase * Math.PI * 2) * 1.5)) : 0, back: true },
      { off: Math.round(-s * 2.5), lift: moving ? Math.max(0, Math.round(Math.cos(phase * Math.PI * 2) * 1.5)) : 0, back: false },
    ];
    for (const L of legs) {
      const x = PX - 1 + L.off;
      const top = bodyY + 7;
      for (let y = top; y < baseY - L.lift; y++) {
        pb.set(x, y, L.back ? legD : leg);
        pb.set(x + 1, y, L.back ? legD : leg);
      }
      pb.set(x, baseY - L.lift, L.back ? shoeD : shoe);
      pb.set(x + 1, baseY - L.lift, L.back ? shoeD : shoe);
      pb.set(x + 2, baseY - L.lift, L.back ? shoeD : shoe);
    }
  } else {
    const s = moving ? Math.sin(phase * Math.PI * 2) : 0;
    const liftA = moving ? Math.max(0, Math.round(s * 2)) : 0;
    const liftB = moving ? Math.max(0, Math.round(-s * 2)) : 0;
    const top = bodyY + 7;
    const xs = [PX - 3, PX + 1];
    [liftA, liftB].forEach((lift, i) => {
      const x = xs[i];
      for (let y = top; y < baseY - lift; y++) { pb.set(x, y, i ? legD : leg); pb.set(x + 1, y, i ? legD : leg); }
      pb.set(x, baseY - lift, i ? shoeD : shoe);
      pb.set(x + 1, baseY - lift, i ? shoeD : shoe);
    });
  }
}

function drawArms(pb: PixelBuf, dir: Dir, phase: number, moving: boolean, bodyY: number) {
  const coat = rgb('U2'), coatD = rgb('U1'), glove = rgb('K9');
  const sw = moving ? Math.round(Math.sin(phase * Math.PI * 2) * 1.5) : 0;
  if (dir === 'side') {
    // back arm only (front arm holds the weapon, drawn at runtime)
    const x = PX - 3 - sw, y = bodyY + 3;
    pb.set(x, y, coatD); pb.set(x, y + 1, coatD); pb.set(x, y + 2, glove);
    return;
  }
  // left arm swings, right arm (weapon side) stays near body
  const ly = bodyY + 3;
  const lx = PX - 5;
  pb.set(lx, ly + sw * 0, dir === 'up' ? coatD : coat);
  pb.set(lx, ly + 1, dir === 'up' ? coatD : coat);
  pb.set(lx, ly + 2 + (sw > 0 ? 0 : 0), glove);
  const rx = PX + 4;
  pb.set(rx, ly, coatD);
  pb.set(rx, ly + 1, coatD);
  pb.set(rx, ly + 2, glove);
}

function compose(dir: Dir, opts: { phase: number; moving: boolean; bodyBob: number; headBob: number; head: string[]; lean?: number; squashX?: number }, pal: Record<string, string>): Sprite {
  const pb = new PixelBuf(W, H);
  const bodyY = PY - 9 + opts.bodyBob; // body top
  const lean = opts.lean ?? 0;
  const body = dir === 'down' ? BODY_DOWN : dir === 'up' ? BODY_UP : BODY_SIDE;
  // draw order: back arm/legs, body, head
  drawLegs(pb, dir, opts.phase, opts.moving, bodyY);
  if (dir === 'up') drawArms(pb, dir, opts.phase, opts.moving, bodyY);
  blit(pb, body, pal, PX - 5 + lean, bodyY);
  if (dir !== 'up') drawArms(pb, dir, opts.phase, opts.moving, bodyY);
  const headY = bodyY - 10 + opts.headBob;
  blit(pb, opts.head, pal, PX - 5 + lean + (dir === 'side' ? 0 : 0), headY);
  return spriteFromBuf(pb, PX, PY, 'K0');
}

const CACHE = new Map<string, TickFrames>();

/**
 * Tick's frames. `pal` overrides palette letters (the scarf is S/s/z/Z: each player slot gets its
 * own colour, GDD2 §5.2); `variant` is reserved for alternative bodies (P5). Frames are cached
 * per (variant, pal), so every caller with the same look shares one set.
 */
export function buildTick(pal?: Partial<Record<string, string>>, variant?: string): TickFrames {
  const over = pal ? Object.entries(pal).filter(([, v]) => !!v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : [];
  const key = `${variant ?? ''}|${over.map(([k, v]) => `${k}=${v}`).join(',')}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const P: Record<string, string> = { ...PAL };
  for (const [k, v] of over) P[k] = v as string;
  const dirs: Dir[] = ['down', 'up', 'side'];
  const headOf = (d: Dir) => (d === 'down' ? HEAD_DOWN : d === 'up' ? HEAD_UP : HEAD_SIDE);
  const out: TickFrames = {
    idle: {} as any, run: {} as any, dash: {} as any, hurt: {} as any, blink: {} as any,
    neck: { down: { x: 0, y: -9 }, up: { x: 0, y: -9 }, side: { x: -1, y: -9 } },
    hand: { down: { x: 5, y: -4 }, up: { x: -5, y: -4 }, side: { x: 2, y: -4 } },
  };
  for (const d of dirs) {
    const bob = [0, 0, 1, 1];
    const hb = [0, 0, 0, 1];
    out.idle[d] = bob.map((b, i) => compose(d, { phase: 0, moving: false, bodyBob: b, headBob: hb[i], head: headOf(d) }, P));
    out.blink[d] = compose(d, { phase: 0, moving: false, bodyBob: 0, headBob: 0, head: d === 'down' ? HEAD_DOWN_BLINK : d === 'side' ? HEAD_SIDE_BLINK : HEAD_UP }, P);
    const rb = [0, -1, -1, 0, -1, -1];
    out.run[d] = rb.map((b, i) =>
      compose(d, { phase: i / 6, moving: true, bodyBob: b, headBob: i % 3 === 0 ? 1 : 0, head: headOf(d), lean: d === 'side' ? 1 : 0 }, P),
    );
    out.dash[d] = compose(d, { phase: 0.25, moving: true, bodyBob: 1, headBob: 1, head: headOf(d), lean: d === 'side' ? 1 : 0 }, P);
    out.hurt[d] = compose(d, { phase: 0, moving: false, bodyBob: 1, headBob: 2, head: d === 'down' ? HEAD_DOWN_HURT : d === 'side' ? HEAD_SIDE_HURT : HEAD_UP_HURT }, P);
  }
  CACHE.set(key, out);
  return out;
}

// ── wind-up key (drawn behind/in front at runtime, rotates) ──
export const KEY_FRAMES: string[][] = [
  ['.nn.nn.', 'nbbmbbn', '.nnmnn.', '...m...'],
  ['..nn...', '.nbbm..', '..nmbn.', '...mnn.'],
  ['...n...', '...b...', '...m...', '...m...'],
  ['...nn..', '..mbbn.', '.nbmn..', '.nnm...'],
];
export const KEY_PAL = PAL;
