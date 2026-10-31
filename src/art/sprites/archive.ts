// Floor 3 — The Sand Archive (流沙档案馆): environment props + enemy sprites.
// Light comes from the top-left; ramps are hue-shifted (shadows lean violet/indigo, highlights lean gold).
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, spriteFromDef } from '../../engine/gfx/sprite';
import { blit, rgb } from '../blit';

// ═════════════════════════════ environment props ═════════════════════════════

/** brass candle sconce mounted on a bookcase upright (flame drawn separately, pivot = wick) */
export const ARCH_SCONCE = spriteFromDef({
  rows: [
    '...Wv...',
    '...Wv...',
    '...Wv...',
    '..dWvd..',
    '.nBYYBn.',
    '..nbbn..',
    '...Bn...',
    '.n.bn.n.',
    '.bnBbnb.',
    '..bBbn..',
    '...nn...',
  ],
  pal: { W: 'K10', v: 'K8', d: 'K9', n: 'B1', b: 'B2', B: 'B3', Y: 'B5' },
  ox: 4, oy: 0,
});

/** short floor candles: returns sprite + wick offsets (relative to pivot) */
export function buildCandleCluster(seed: number): { spr: Sprite; wicks: { x: number; y: number }[] } {
  const pb = new PixelBuf(16, 14);
  const r = (n: number) => { const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
  // wax pool / saucer
  for (let x = 2; x < 14; x++) pb.set(x, 12, rgb(x < 4 || x > 11 ? 'B1' : 'B2'));
  for (let x = 3; x < 13; x++) pb.set(x, 13, rgb('B0'));
  for (let x = 4; x < 11; x++) pb.set(x, 11, rgb(x < 6 ? 'K9' : 'K8'));
  const n = 2 + Math.floor(r(1) * 2);
  const wicks: { x: number; y: number }[] = [];
  const xs = n === 2 ? [5, 9] : [3, 7, 10];
  for (let i = 0; i < n; i++) {
    const cx = xs[i] + Math.floor(r(i + 2) * 2);
    const h = 4 + Math.floor(r(i + 7) * 6);
    const w = i === 1 && n === 3 ? 3 : 2;
    const top = 11 - h;
    for (let y = top; y < 11; y++)
      for (let k = 0; k < w; k++) pb.set(cx + k, y, rgb(k === 0 ? 'K10' : k === w - 1 ? 'K8' : 'K9'));
    // a drip running down the side
    const dy = top + 1 + Math.floor(r(i + 11) * Math.max(1, h - 3));
    pb.set(cx - 1, dy, rgb('K9')); pb.set(cx - 1, dy + 1, rgb('K8'));
    pb.set(cx + Math.floor(w / 2), top - 1, rgb('K2')); // wick
    wicks.push({ x: cx + Math.floor(w / 2) - 8, y: top - 1 - 13 });
  }
  return { spr: spriteFromBuf(pb, 8, 13), wicks };
}

/** pendulum wall clock (case, face, window) — hands + pendulum drawn at runtime. pivot = face centre */
export const CLOCK_CASE = spriteFromDef({
  rows: [
    '....nBBBn....',
    '..nBYYYYBBn..',
    '.nBwWWWWWwbn.',
    '.BwWWWkWWWvb.',
    'nBWWWWWWWWWbn',
    'nBWWWWWWWWWbn',
    'nBWkWWOWWkWbn',
    'nBWWWWWWWWvbn',
    'nBwWWWWWWWvbn',
    '.bvWWWkWWvvb.',
    '.nbvvvvvvvbn.',
    '..nbbbbbbbn..',
    '..rRRRRRRRr..',
    '..rqqqqqqqr..',
    '..rq.....qr..',
    '..rq.....qr..',
    '..rq.....qr..',
    '..rq.....qr..',
    '..rq.....qr..',
    '..rq.....qr..',
    '..rqqqqqqqr..',
    '..rRRRRRRRr..',
    '.nBBBBBBBBBn.',
    '..nnnnnnnnn..',
  ],
  pal: { n: 'B1', b: 'B2', B: 'B3', Y: 'B5', w: 'K9', W: 'K10', v: 'K8', k: 'K4', O: 'K2', r: 'R0', R: 'R1', q: 'K0' },
  ox: 6, oy: 6,
});
export const CLOCK_SMALL = spriteFromDef({
  rows: [
    '..nBBBn..',
    '.nBwWWbn.',
    'nBwWWkWbn',
    'BwWWWWWvb',
    'BWkWOWkvb',
    'BWWWWWvvb',
    'nbvWkWvbn',
    '.nbvvvbn.',
    '..nbbbn..',
  ],
  pal: { n: 'B1', b: 'B2', B: 'B3', w: 'K9', W: 'K10', v: 'K8', k: 'K4', O: 'K2' },
  ox: 4, oy: 4,
});

/** a single loose page seen at several turn angles (for hovering pages) */
export function buildFloatPages(): Sprite[] {
  const pal = { W: 'K9', w: 'K8', v: 'K7', s: 'K6', k: 'K5' };
  const frames = [
    ['wWWWWW', 'wkkkWW', 'wWWWWv', 'wkkWkv', 'wWWWWv', 'vkkkWv', 'vvvvvs'],
    ['.wWWWW', 'wWkkWv', 'wWWWWv', 'wkkWWv', 'wWWWvv', 'vvvvvs'],
    ['.wWWW.', 'wWkWWv', 'wkkWvv', 'vvvvvs'],
    ['..wW..', '.wWWv.', 'wWWvvs', '.vvs..'],
    ['wWW..', 'wkWWv', '.wkWv', '.vvvs', '...s.'],
    ['.wWW', 'wkWv', 'wWkv', 'wkWv', 'vvvs'],
  ];
  return frames.map((rows) => spriteFromDef({ rows, pal, ox: Math.floor(rows[0].length / 2), oy: rows.length - 1, outline: 'K1' }));
}

/** breakable: archive record box (stamped crate with files poking out) */
export const ARCHIVE_BOX = spriteFromDef({
  rows: [
    '...wWw..vWwv....',
    '..wWWkv.WWkwv...',
    '.nbbbbbbbbbbbbn.',
    'nBYYYYYYYYYYYYbn',
    'nbBBBBBBBBBBBBbn',
    'nnnnnnnnnnnnnnnn',
    'nbBbbbbbbbbbbBbn',
    'nBbbbbbbbbbbbbbn',
    'nBbbbqYYYYqbbbbn',
    'nBbbbqKKKKqbbbbn',
    'nBbbbqYYYYqbbbbn',
    'nBbbbbbbbbbbbbbn',
    'nBbbbbbbbbbbbbbn',
    'nbBbbbbbbbbbbbbn',
    'nnnnnnnnnnnnnnnn',
    '.dddddddddddddd.',
  ],
  pal: { n: 'B0', b: 'B1', B: 'B2', Y: 'B3', q: 'B4', K: 'K2', W: 'K10', w: 'K9', v: 'K8', k: 'K5', d: 'K1' },
  ox: 8, oy: 15,
});

/** breakable: precarious stack of big tomes */
export const TOME_STACK = spriteFromDef({
  rows: [
    '...vWWWWWWwv..',
    '..rRRRRRRRRRr.',
    '..rssssssssRr.',
    '..zzzzzzzzzzz.',
    '.wWWWWWWWWWWv.',
    '.uUUUUUUUUUUu.',
    '.uUyyyyyyyyUu.',
    '.xxxxxxxxxxxx.',
    'gGGGGGGGGGGGg.',
    'gGGBGGGGGGBGgk',
    'gGkkkkkkkkkGgv',
    'oooooooooooooo',
    '.nNNNNNNNNNNNn',
    '.nNYNNNNNNNYNn',
    '.nNNNNNNNNNNNn',
    '.mmmmmmmmmmmmm',
  ],
  pal: {
    W: 'K10', w: 'K9', v: 'K8', k: 'K7',
    r: 'R0', R: 'R2', s: 'R1', z: 'K1',
    u: 'U0', U: 'U2', y: 'U1', x: 'K1',
    g: 'G0', G: 'G2', B: 'B4', o: 'K1',
    n: 'B0', N: 'B2', Y: 'B4', m: 'K1',
  },
  ox: 7, oy: 15,
});

// ═════════════════════════════ enemies ═════════════════════════════

// ───────────── Page Swarm: a folded leaf that flaps like a bird; red wax seal for an eye ─────────────
const PAGE_PAL: Record<string, string> = { W: 'K10', w: 'K9', v: 'K8', s: 'K7', k: 'K5', r: 'R2', R: 'R4' };
export function buildPage(): { flap: Sprite[]; fold: Sprite; dart: Sprite } {
  const frames = [
    // wings up
    ['.WW.......wv.', '.WWW.....wwv.', '..WWkw.wkwv..', '...WWwrwwv...', '....vvRvv....'],
    // level
    ['.WWWWw.wWWWW.', 'WWkkWwrwWkkwv', 'WWWWWwRwWWWwv', 'WkkWwvrvwkkwv', '.vvvv.v.vvvv.'],
    // down
    ['....wwrww....', '...WWkRkwv...', '..WWWw.wwwv..', '.WWW.....wwv.', '.vv.......vv.'],
    // level (return)
    ['.WWWWw.wWWWW.', 'WWkkWwrwWkkwv', 'WWWWWwRwWWWwv', 'WkkWwvrvwkkwv', '.vvvv.v.vvvv.'],
  ];
  const flap = frames.map((rows) => spriteFromDef({ rows, pal: PAGE_PAL, ox: 6, oy: rows.length - 1 }));
  const fold = spriteFromDef({ rows: ['...WWw...', '..WWkWw..', '.WWkRkwv.', 'WWWwrwwvv', '.vvvvvvv.'], pal: PAGE_PAL, ox: 4, oy: 4 });
  // paper dart pointing +x (rotated at runtime)
  const dart = spriteFromDef({
    rows: ['Ww........', 'wWWw......', '.vwWWWw...', '..vvwRWWWW', '.vwWWWw...', 'wWWv......', 'Wv........'],
    pal: PAGE_PAL, ox: 5, oy: 3,
  });
  return { flap, fold, dart };
}

// ───────────── Ink Hound: a lean dog poured from an inkwell; brush-stroke tail ─────────────
export interface HoundPose { phase: number; moving: boolean; crouch: number; stretch: number; open: number }
export function houndFrame(o: HoundPose): Sprite {
  const pb = new PixelBuf(32, 20);
  const P = (x: number, y: number, k: string) => pb.set(Math.round(x), Math.round(y), rgb(k));
  const cy = 9 + o.crouch;
  const s = o.moving ? Math.sin(o.phase * Math.PI * 2) : 0, c2 = o.moving ? Math.cos(o.phase * Math.PI * 2) : 0;
  // legs (far pair darker, drawn first)
  const legTop = cy + 2;
  const feetY = 17;
  const leg = (x: number, swing: number, lift: number, far: boolean) => {
    const fx = x + swing;
    const fy = feetY - lift;
    const n = Math.max(1, fy - legTop);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const xx = x + (fx - x) * t;
      P(xx, legTop + i, far ? 'K2' : 'K3');
      P(xx + 1, legTop + i, far ? 'K1' : 'K2');
    }
    P(fx - 1, fy, far ? 'K2' : 'K4'); P(fx, fy, far ? 'K2' : 'K3'); P(fx + 1, fy, 'K2');
  };
  const st = o.stretch;
  leg(8 - st, -s * 2.5, Math.max(0, c2) * 1.5, true);
  leg(19 + st, s * 2.5, Math.max(0, -c2) * 1.5, true);
  leg(10 - st, s * 2.5, Math.max(0, -c2) * 1.5, false);
  leg(21 + st, -s * 2.5, Math.max(0, c2) * 1.5, false);
  // body: glossy ink barrel
  const bx = 15, rx = 8 + st, ry = 3.4 - st * 0.25;
  for (let y = -5; y <= 5; y++)
    for (let x = -12; x <= 12; x++) {
      const e = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (e > 1) continue;
      let k = 'K3';
      if (y > ry * 0.35) k = 'K2';
      if (y < -ry * 0.25 && e > 0.25) k = 'K4';
      if (y < -ry * 0.55 && x < rx * 0.5 && x > -rx * 0.7) k = 'U2';
      if (Math.round(y) === Math.round(-ry + 1) && x > -rx * 0.55 && x < rx * 0.2) k = 'U3';
      P(bx + x, cy + y, k);
    }
  P(bx - 3, cy - 3, 'U4'); P(bx - 2, cy - 3, 'U4');
  // drips under the belly
  const dp = Math.floor(o.phase * 4) % 2;
  P(bx - 2, cy + ry + 1, 'K3'); P(bx - 2, cy + ry + 2 + dp, 'K2');
  P(bx + 4, cy + ry + 1, 'K2');
  // neck + head (facing right)
  const hx = 24 + st, hy = cy - 4 + (o.crouch > 0 ? 1 : 0);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) P(hx - 4 + x + y * 0.5, hy + 2 + y, y === 0 ? 'K4' : 'K3');
  const HEAD = [
    'aa.........',
    '.aUa.......',
    'aUUbbbb....',
    'aUbbbEebbb.',
    'abbbbbbbbbc',
    '.bbbbbbbbc.',
  ];
  const HO = [
    'aa.........',
    '.aUa.......',
    'aUUbbbb....',
    'aUbbbEebbb.',
    'abbbbbbbbbc',
    '.bbbW.W....',
    '..bbbbbbc..',
    '....b......',
  ];
  const head = o.open ? HO : HEAD;
  const HP: Record<string, string> = { a: 'K2', U: 'U2', b: 'K3', c: 'K2', E: 'R4', e: 'R2', W: 'K9' };
  blit(pb, head, HP, hx - 3, hy - 2);
  P(hx - 1, hy + 1, 'U3'); P(hx, hy, 'U3'); P(hx + 1, hy, 'U3'); P(hx + 5, hy + 1, 'U2');
  // tail: a calligraphy-brush stroke, tip flicks with the gait
  const tw = Math.sin(o.phase * Math.PI * 2 + 1) * 1.3;
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 7 - st - i, y = cy - 2 - Math.round(t * t * 3 + t * tw * 2);
    const thick = i < 2 ? 2 : i < 6 ? 3 : i < 8 ? 2 : 1;
    for (let k = 0; k < thick; k++) P(x, y + k - (thick > 2 ? 1 : 0), k === 0 ? (i < 4 ? 'K4' : 'U2') : k === thick - 1 ? 'K2' : 'K3');
  }
  P(-1 + 7 - st - 9, cy - 2 - Math.round(3 + tw * 2), 'U3');
  return spriteFromBuf(pb, 16, 17);
}

// ───────────── Sand Wraith: a hooded shape of sand with ember eyes ─────────────
const WRAITH_PAL: Record<string, string> = { a: 'S0', d: 'S1', s: 'S2', S: 'S2', h: 'S3', k: 'K0', K: 'B0', E: 'O4', e: 'O2', v: 'V2' };
const WRAITH_TOP = [
  '......a.........',
  '......aa........',
  '......aSa.......',
  '.....aShda......',
  '.....aSSsda.....',
  '....aShSssda....',
  '....aSSKKKsda...',
  '...aShKkkkKsa...',
  '...aSKkkkkkKda..',
  '...aSkEkkEkkda..',
  '...aSKkkkkkKda..',
  '...aShKkkkKsda..',
  '..aSSsdKKKdssda.',
  '..aShsssdsssssa.',
  '.aSSsssdssdsssda',
];
export function buildWraith(): { idle: Sprite[]; cast: Sprite[]; fade: Sprite[] } {
  const make = (frame: number, arms: 'down' | 'up' | 'out', dissolve: number) => {
    const pb = new PixelBuf(22, 34);
    blit(pb, WRAITH_TOP, WRAITH_PAL, 3, 1);
    // robe: tapers into a trickle of sand
    for (let j = 0; j < 17; j++) {
      const y = 16 + j;
      const half = Math.max(0.5, 6.5 - j * 0.38 + Math.sin(j * 0.9 + frame * 1.7) * 0.6);
      const sway = Math.sin(j * 0.45 + frame * 1.3) * (j / 15) * 2;
      for (let x = Math.floor(-half); x <= Math.ceil(half); x++) {
        const xx = 11 + x + Math.round(sway);
        const gap = j > 9 && ((x + j + frame) % 3 === 0);
        const hsh = Math.sin((xx * 12.9 + y * 78.2 + frame * 3.1)) * 43758.5;
        const rnd = hsh - Math.floor(hsh);
        if (gap || rnd < Math.max(0, (j - 10) * 0.1)) continue;
        // vertical folds catch the light on their left edges
        let k = x < -half + 1.5 ? 'S3' : x > half - 1.5 ? 'S0' : (x + 20) % 4 === 0 ? 'S2' : (x + 20) % 4 === 1 ? 'S1' : 'S1';
        if ((x + 20) % 4 === 3 && j < 10) k = 'S0';
        if (x <= -half + 0.5 && j < 8) k = 'S2';
        pb.set(xx, y, rgb(k));
      }
    }
    // arms / sleeves
    const arm = (side: -1 | 1) => {
      const ax = 11 + side * 6, ay = 15;
      // long sleeves; bony sand fingers
      if (arms === 'down') {
        for (let i = 0; i < 8; i++) { pb.set(ax + side * (i > 4 ? 1 : 0), ay + i, rgb(side < 0 ? 'S2' : 'S1')); pb.set(ax - side, ay + i, rgb(side < 0 ? 'S1' : 'S0')); }
        pb.set(ax + side, ay + 8, rgb('S3')); pb.set(ax + side * 2, ay + 9, rgb('S2')); pb.set(ax, ay + 9, rgb('S2'));
      } else if (arms === 'out') {
        for (let i = 0; i < 6; i++) { pb.set(ax + side * i, ay + Math.floor(i / 2), rgb(i % 2 ? 'S1' : 'S2')); pb.set(ax + side * i, ay + 1 + Math.floor(i / 2), rgb('S0')); }
        pb.set(ax + side * 6, ay + 2, rgb('S3')); pb.set(ax + side * 6, ay + 1, rgb('S3')); pb.set(ax + side * 7, ay + 2, rgb('S2'));
      } else {
        for (let i = 0; i < 8; i++) { pb.set(ax + side * Math.floor(i / 3), ay - 1 - i, rgb(i % 2 ? 'S2' : 'S3')); pb.set(ax + side * (Math.floor(i / 3) + 1), ay - 1 - i, rgb('S1')); }
        pb.set(ax + side * 2, ay - 9, rgb('S3')); pb.set(ax + side * 3, ay - 10, rgb('S3')); pb.set(ax + side * 1, ay - 10, rgb('S3'));
      }
    };
    arm(-1); arm(1);
    if (dissolve > 0) {
      // sand-burst: knock out pixels everywhere
      for (let y = 0; y < 34; y++) for (let x = 0; x < 22; x++) {
        const hsh = Math.sin(x * 91.7 + y * 47.3 + frame * 13.1) * 43758.5;
        if (hsh - Math.floor(hsh) < dissolve * (0.6 + y / 60)) pb.clear(x, y);
      }
    }
    return spriteFromBuf(pb, 11, 32);
  };
  return {
    idle: [0, 1, 2, 3].map((f) => make(f, 'down', 0)),
    cast: [make(0, 'out', 0), make(1, 'up', 0), make(2, 'up', 0)],
    fade: [0.25, 0.5, 0.75].map((d, i) => make(i, 'down', d)),
  };
}

// ───────────── Tome Mimic: a fat grimoire; the gilt eye on the cover opens ─────────────
const TOME_PAL: Record<string, string> = {
  U: 'U2', u: 'U1', x: 'U0', y: 'B4', Y: 'B5', B: 'B3', n: 'B1', W: 'K10', w: 'K9', v: 'K8', p: 'K7',
  k: 'K0', K: 'K1', R: 'R3', r: 'R2', E: 'O4', e: 'O2', m: 'R1',
};
const TOME_CLOSED = [
  '.YyuUUUUUUUUUUUyY.',
  'YyuUUuuuuuuuuuuuyy',
  'uUuuuuuuBBBuuuuuux',
  'uUuuuuuBnnnBuuuuux',
  'uUuuuuBnnOnnBuuuux',
  'uUuuuuuBnnnBuuuuux',
  'uUuuuuuuBBBuuuuuux',
  'yyuuuuuuuuuuuuuuyy',
  '.yyxxxxxxxxxxxxyyn',
  'pWWWWWWWWWWWWWWWvn',
  'pWvwvwvwvwvwvwvwvn',
  '.nnnnnnnnnnnnnnnn.',
];
export function buildTome(): { closed: Sprite[]; peek: Sprite; open: Sprite[]; bite: Sprite; hop: Sprite } {
  const closed = [0, 1].map((b) => {
    const rows = TOME_CLOSED.map((r) => r.replace('O', 'n'));
    const pb = new PixelBuf(20, 14);
    blit(pb, rows, TOME_PAL, 1, 1 + (b ? 0 : 1));
    return spriteFromBuf(pb, 10, 13);
  });
  // reveal: cover cracks open, the sigil's eye glows
  const peek = (() => {
    const rows = TOME_CLOSED.map((r, i) => (i === 4 ? r.replace('nnOnn', 'nEREn') : i === 3 ? r.replace('nnn', 'nen') : r));
    const pb = new PixelBuf(20, 16);
    blit(pb, rows.slice(0, 8), TOME_PAL, 1, 1);
    // dark gap with teeth glinting
    for (let x = 2; x < 18; x++) { pb.set(x, 9, rgb('K0')); pb.set(x, 10, rgb(x % 2 ? 'K9' : 'K0')); }
    blit(pb, rows.slice(8), TOME_PAL, 1, 11);
    return spriteFromBuf(pb, 10, 14);
  })();
  // awake: side view (facing +x). Both halves carry a thick page block; the page edges are its teeth.
  const jaw = (deg: number, eye: boolean) => {
    const pb = new PixelBuf(28, 30);
    const P = (x: number, y: number, k: string) => pb.set(Math.round(x), Math.round(y), rgb(TOME_PAL[k] ?? k));
    const hx = 4, hy = 25; // hinge (spine), near the ground
    const L = 18;
    const th = (deg * Math.PI) / 180;
    const ax = Math.cos(th), ay = -Math.sin(th);
    const nx = Math.sin(th), ny = Math.cos(th); // inward normal of the upper half
    // gullet: dark wedge between the page blocks
    for (let t = 1; t < L - 3; t++)
      for (let a = 0; a <= th; a += 0.02) {
        const x = hx + Math.cos(a) * t, y = hy - 5 - Math.sin(a) * t;
        P(x, y, t > L - 6 ? 'K' : 'k');
      }
    // lower half: cover + page block lying on the ground
    for (let t = 0; t <= L; t++) {
      P(hx + t, hy, t === L ? 'y' : 'x');
      P(hx + t, hy - 1, t === L ? 'Y' : 'u');
      for (let d = 2; d <= 4; d++) P(hx + t, hy - d, t >= L - 1 ? 'v' : d === 4 ? 'W' : (t + d) % 3 === 0 ? 'v' : 'w');
      if (t > 2 && t < L - 1 && t % 3 === 0) P(hx + t, hy - 5, 'W');
    }
    // ribbon tongue lolling over the lower pages
    if (deg > 16) for (let i = 0; i < 7; i++) P(hx + 7 + i, hy - 5 - (i > 1 && i < 5 ? 1 : 0), i < 5 ? 'r' : 'R');
    // upper half: hinged at the spine, swung up by deg
    const UH = hy - 5;
    for (let t = 0; t <= L; t++) {
      const bx = hx + ax * t, by = UH + ay * t;
      for (let d = 0; d <= 4; d++) {
        const x = bx + nx * (d - 4), y = by + ny * (d - 4);
        let k = d === 0 ? (t === L ? 'Y' : 'U') : d === 1 ? (t === L ? 'y' : 'u') : t >= L - 1 ? 'v' : d === 2 ? 'W' : (t + d) % 3 === 0 ? 'v' : 'w';
        P(x, y, k);
        P(x + 0.5, y, k);
      }
      if (t > 3 && t < L - 1 && t % 3 === 1) P(bx + nx, by + ny, 'W');
    }
    // gilt eye on the cover
    const ex = hx + ax * 10 - nx * 4, ey = UH + ay * 10 - ny * 4 - 1;
    P(ex - 1, ey, 'B'); P(ex + 1, ey, 'B'); P(ex, ey - 1, 'B'); P(ex, ey + 1, 'n');
    P(ex, ey, eye ? 'E' : 'n');
    // spine with gold bands
    for (let y = hy - 9; y <= hy; y++) { P(hx - 1, y, (y - hy) % 4 === 0 ? 'Y' : 'u'); P(hx - 2, y, 'x'); }
    return spriteFromBuf(pb, 13, hy);
  };
  return { closed, peek, open: [jaw(22, true), jaw(28, true)], bite: jaw(48, true), hop: jaw(6, true) };
}
export const PAPER_SHARD = spriteFromDef({ rows: ['wWW.', '.wWv', '..vv'], pal: { W: 'K10', w: 'K9', v: 'K8' }, ox: 2, oy: 1 });

// ───────────── Hourglass Golem (elite): sandstone and brass around a great hourglass ─────────────
const GOLEM_PAL: Record<string, string> = {
  a: 'S0', b: 'S1', c: 'S2', d: 'S3', K: 'B0', n: 'B1', m: 'B2', M: 'B3', Y: 'B4', G: 'B5', k: 'K1', o: 'K0',
  v: 'V2', V: 'V3', E: 'V4', q: 'K2',
};
const GOLEM_HEAD = [
  '..MYYYM..',
  '.MbcccbM.',
  'Mbcdddcbn',
  'bcoEoEocn',
  'bccvvvcbn',
  '.bbbbbbn.',
];
const GOLEM_SHOULDER = [
  '..bcddc...',
  '.bcddddcb.',
  'bcddddccba',
  'bcdvddcbba',
  'abccccbbaa',
  '.aabbbbaa.',
];
export interface GolemPose { bob: number; legA: number; legB: number; arm: 'idle' | 'raise' | 'slam' | 'stomp'; armBob: number; charged?: boolean }
export function golemFrame(o: GolemPose): Sprite {
  const pb = new PixelBuf(48, 50);
  // charged: the stasis runes burn bright just before a strike
  const pal = o.charged ? { ...GOLEM_PAL, v: 'V4', V: 'K10' } : GOLEM_PAL;
  const B = (rows: string[], x: number, y: number, flip = false) => blit(pb, rows, pal, x, y, flip);
  const P = (x: number, y: number, k: string) => pb.set(x, y, rgb(pal[k] ?? k));
  const by = o.bob;
  // legs: stacked sandstone drums with brass collars
  for (const [lx, lift] of [[15, o.legA], [28, o.legB]] as [number, number][]) {
    for (let y = 34 + by; y < 46 - lift; y++)
      for (let i = -1; i < 7; i++) {
        let k = i <= 0 ? 'c' : i === 6 ? 'a' : i === 1 ? 'd' : i >= 4 ? 'a' : 'b';
        if ((y - by) === 38 || (y - by) === 39) k = i <= 0 ? 'Y' : i === 6 ? 'n' : (y - by) === 38 ? 'G' : 'M';
        P(lx + i, y, k);
      }
    for (let i = -2; i < 8; i++) { P(lx + i, 46 - lift, i < 2 ? 'c' : 'b'); P(lx + i, 47 - lift, 'a'); }
  }
  // pelvis: brass base plate of the hourglass
  for (let x = 13; x < 36; x++) { P(x, 31 + by, x < 16 ? 'Y' : 'M'); P(x, 32 + by, 'm'); P(x, 33 + by, x > 32 ? 'K' : 'n'); P(x, 34 + by, 'K'); }
  for (let x = 15; x < 34; x += 6) P(x, 32 + by, 'G');
  // hourglass cage: four brass posts (glass is drawn at runtime)
  for (let y = 12 + by; y < 31 + by; y++) {
    const ring = (y - by) % 6 === 2;
    P(14, y, ring ? 'G' : 'Y'); P(15, y, ring ? 'Y' : 'm'); P(33, y, ring ? 'Y' : 'M'); P(34, y, 'n');
  }
  // the hollow where the glass sits (dark)
  for (let y = 12 + by; y < 31 + by; y++) for (let x = 16; x < 33; x++) P(x, y, 'k');
  // top plate
  for (let x = 13; x < 36; x++) { P(x, 9 + by, x < 16 ? 'G' : 'Y'); P(x, 10 + by, 'M'); P(x, 11 + by, 'n'); }
  for (let x = 15; x < 34; x += 6) P(x, 10 + by, 'G');
  // head
  B(GOLEM_HEAD, 20, 3 + by);
  // shoulders
  B(GOLEM_SHOULDER, 4, 8 + by);
  B(GOLEM_SHOULDER, 34, 8 + by, true);
  // arms + fists
  const fist = ['..bccb...', '.bcddcbb.', 'bMYYYMMna', 'bcdddccba', 'bcdVdcbba', 'bccvcbbaa', 'abbbbbaaa', '.aaaaaaa.'];
  const drawArm = (side: -1 | 1) => {
    const sx = side < 0 ? 8 : 39;
    let fx = sx, fy = 24 + by + o.armBob;
    if (o.arm === 'raise') { fx = sx + side * -2; fy = 2 + by; }
    if (o.arm === 'slam') { fx = sx + side * -5; fy = 33 + by; }
    if (o.arm === 'stomp') { fy = 20 + by; fx = sx + side * 2; }
    // forearm column between shoulder and fist
    const y0 = Math.min(13 + by, fy + 3), y1 = Math.max(13 + by, fy + 1);
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      const ax = Math.round(sx + (fx - sx) * (o.arm === 'raise' ? 1 - t : t));
      P(ax - 2, y, 'c'); P(ax - 1, y, 'c'); P(ax, y, 'b'); P(ax + 1, y, 'a');
      if (Math.abs(y - Math.round((y0 + y1) / 2)) < 1) { P(ax - 2, y, 'G'); P(ax - 1, y, 'Y'); P(ax, y, 'M'); P(ax + 1, y, 'n'); }
    }
    B(fist, fx - 4, fy, side > 0);
  };
  drawArm(-1); drawArm(1);
  return spriteFromBuf(pb, 24, 47);
}
/** offset of the glass centre from the golem's feet pivot */
export const GLASS_DX = 0, GLASS_DY = -26;
/** glass of the golem's hourglass at fill f (sand left in the top bulb, 0..1). pivot = centre */
export function hourglassGlass(f: number, draining: boolean): Sprite {
  const W = 17, H = 19;
  const pb = new PixelBuf(W, H);
  const cx = 8;
  const half = (y: number) => {
    // bulb profile: wide at the ends, pinched at the neck (row 9)
    const t = Math.abs(y - 9) / 9;
    return Math.max(0.6, 7.8 * Math.pow(t, 0.75));
  };
  // sand volumes: fill from the bottom of each bulb
  const nTop = Math.round(f * 6.5), nBot = Math.round((1 - f) * 6.5);
  for (let y = 0; y < H; y++) {
    const hw = half(y);
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      if (Math.abs(dx) > hw) continue;
      let k = 'K1';
      const edge = Math.abs(dx) > hw - 1;
      // top bulb sand sits on the neck; bottom bulb sand piles from the floor
      if (y < 9 && y >= 9 - nTop) k = y === 9 - nTop ? 'S4' : dx < -1 ? 'S3' : 'S2';
      if (y >= 9 && y > 17 - nBot) k = y === 18 - nBot ? (Math.abs(dx) < 3 ? 'S4' : 'S3') : dx < -1 ? 'S3' : 'S2';
      if (edge) k = dx < 0 ? 'K8' : 'K6';
      pb.set(x, y, rgb(k));
    }
  }
  if (draining && f > 0.02) for (let y = 9; y < 18 - nBot; y++) pb.set(cx, y, rgb(y % 2 ? 'S4' : 'S3'));
  // glints on the glass
  pb.set(cx - 5, 3, rgb('K10')); pb.set(cx - 5, 4, rgb('K9')); pb.set(cx - 4, 14, rgb('K10'));
  return spriteFromBuf(pb, cx, 9, 'K0');
}

// ───────────── art review sheet (?scene=art_archive) ─────────────
function withGlass(body: Sprite, f: number, bob: number): Sprite {
  const g = hourglassGlass(f, f > 0 && f < 1);
  const c = document.createElement('canvas');
  c.width = body.w; c.height = body.h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(body.img, 0, 0);
  ctx.drawImage(g.img, Math.round(body.ox + GLASS_DX - g.ox), Math.round(body.oy + GLASS_DY + bob - g.oy));
  return new Sprite(c, body.ox, body.oy);
}
export function archivePreview(page = 0): { name: string; sprites: Sprite[]; zoom?: number }[] {
  if (page === 1) {
    const g = [golemFrame({ bob: 0, legA: 0, legB: 0, arm: 'idle', armBob: 0 }), golemFrame({ bob: -1, legA: 2, legB: 0, arm: 'idle', armBob: 1 }), golemFrame({ bob: -2, legA: 0, legB: 0, arm: 'raise', armBob: 0 }), golemFrame({ bob: 2, legA: 0, legB: 0, arm: 'slam', armBob: 0 }), golemFrame({ bob: 0, legA: 3, legB: 0, arm: 'stomp', armBob: 0 })];
    return [
      { name: 'hourglass golem', sprites: [...g.map((f, i) => withGlass(f, [1, 0.7, 0.2, 0, 0.5][i], i === 3 ? 2 : i === 2 ? -2 : 0)), hourglassGlass(0.5, true)], zoom: 2 },
      { name: 'props', sprites: [ARCH_SCONCE, CLOCK_CASE, CLOCK_SMALL, ARCHIVE_BOX, TOME_STACK, ...buildFloatPages(), buildCandleCluster(3).spr], zoom: 2 },
    ];
  }
  const pg = buildPage();
  const hounds = [0, 1, 2, 3].map((i) => houndFrame({ phase: i / 4, moving: true, crouch: 0, stretch: 0, open: 0 }));
  const hTell = houndFrame({ phase: 0, moving: false, crouch: 2, stretch: -1, open: 1 });
  const hDash = houndFrame({ phase: 0.25, moving: true, crouch: 0, stretch: 2, open: 1 });
  const w = buildWraith();
  const t = buildTome();
  return [
    { name: 'page swarm / ink hound', sprites: [...pg.flap, pg.fold, pg.dart, ...hounds.slice(0, 2), hTell, hDash], zoom: 3 },
    { name: 'sand wraith', sprites: [...w.idle, ...w.cast, ...w.fade], zoom: 2 },
    { name: 'tome mimic', sprites: [...t.closed, t.peek, ...t.open, t.bite, t.hop, PAPER_SHARD], zoom: 3 },
  ];
}
