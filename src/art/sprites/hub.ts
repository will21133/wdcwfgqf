// Hub (the clockmaker's workshop): Ines (sprite + portrait), the clockwork cat, furniture.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, spriteFromDef } from '../../engine/gfx/sprite';
import { rgb, blit } from '../blit';
import { paintGear, BRASS_GEAR } from '../gear';

const INES_PAL: Record<string, string> = {
  h: 'K8', H: 'K9', W: 'K10', s: 'S3', S: 'S4', d: 'S2', e: 'K1', g: 'B4', G: 'B5', l: 'U2', L: 'K10',
  c: 'G1', C: 'G2', a: 'B1', A: 'B2', p: 'B5', m: 'R2', k: 'K2', w: 'K7',
};
const INES_ROWS = [
  '......hHHh......',
  '.....hHWHHh.....',
  '.....hHHHhh.....',
  '....hHgGgGhh....',
  '....hglLlLgh....',
  '....hdsSSSdh....',
  '....hseSSesh....',
  '.....sdSSds.....',
  '.....sSmmSs.....',
  '......dssd......',
  '....cCCccCCc....',
  '...cCaCccCaCc...',
  '...cCacpcCacc...',
  '..ccCaAAAAacc...',
  '..s.CAAAAAAc.s..',
  '..s.cAAAAAAc.s..',
  '....cAAAAAAc....',
  '....cAAAAAAc....',
  '....ccAAAAcc....',
  '....cccccccc....',
  '.....kk..kk.....',
  '.....kk..kk.....',
];
export function buildInes(): Sprite[] {
  const out: Sprite[] = [];
  for (let f = 0; f < 4; f++) {
    const pb = new PixelBuf(18, 26);
    const bob = f === 2 ? 1 : 0;
    const rows = INES_ROWS.map((r, i) => (f === 3 && i === 6 ? '....hsdSSdsh....' : r));
    blit(pb, rows, INES_PAL, 1, 2 + bob);
    out.push(spriteFromBuf(pb, 9, 24));
  }
  return out;
}

/** 40x40 portrait for dialogue */
export function buildInesPortrait(talk = 0): Sprite {
  const pb = new PixelBuf(42, 42);
  const set = (x: number, y: number, c: string) => pb.set(x, y, rgb(c));
  const ell = (cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number, u: number, v: number) => string | null) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1) continue;
        const c = fn(x, y, u, v);
        if (c) set(x, y, c);
      }
  };
  // shoulders / dress
  for (let y = 31; y < 42; y++) for (let x = 4; x < 38; x++) {
    const w = 10 + (y - 31) * 1.8;
    if (Math.abs(x - 21) > w) continue;
    let c = x < 21 - w + 3 ? 'G2' : x > 21 + w - 3 ? 'G0' : 'G1';
    if (Math.abs(x - 14) < 1.5 || Math.abs(x - 28) < 1.5) c = 'B1'; // apron straps
    if (y > 35 && x > 16 && x < 26) c = y === 36 ? 'B2' : 'B1';
    set(x, y, c);
  }
  // pendant watch
  ell(21, 35, 2.2, 2.2, () => 'B5'); set(21, 35, 'K9'); set(21, 33, 'B3'); set(21, 32, 'B3');
  // neck
  for (let y = 28; y < 32; y++) for (let x = 18; x < 25; x++) set(x, y, x > 22 ? 'S2' : 'S3');
  // back hair & bun
  ell(21, 17, 13, 12, (x, y, u, v) => (u + v < -0.6 ? 'K10' : u + v < 0 ? 'K9' : 'K8'));
  ell(21, 5, 7, 5, (x, y, u, v) => (u + v < -0.5 ? 'K10' : u + v < 0.3 ? 'K9' : 'K8'));
  set(17, 4, 'K7'); set(24, 6, 'K7');
  // hair pin
  for (let k = 0; k < 6; k++) set(25 + k, 2 + Math.floor(k / 2), 'B4');
  // face
  ell(22, 21, 9.5, 10.5, (x, y, u, v) => (u > 0.55 || v > 0.7 ? 'S2' : u < -0.4 && v < -0.2 ? 'S4' : 'S3'));
  // fringe over forehead
  for (let x = 13; x < 31; x++) { const h = 13 + Math.round(Math.sin(x * 0.9) * 1.2); for (let y = 10; y < h; y++) set(x, y, y === h - 1 ? 'K8' : 'K9'); }
  // goggles on forehead
  for (const gx of [17, 26]) {
    ell(gx, 11, 3.4, 3.4, (x, y, u, v) => (u * u + v * v > 0.45 ? (v < 0 ? 'B5' : 'B3') : u + v < -0.3 ? 'K10' : 'U2'));
  }
  for (let x = 20; x < 23; x++) set(x, 11, 'B3');
  set(13, 11, 'K2'); set(12, 12, 'K2'); set(30, 11, 'K2'); set(31, 12, 'K2');
  // brows
  for (const [x, y] of [[16, 17], [17, 17], [18, 18], [25, 18], [26, 17], [27, 17]]) set(x, y, 'K7');
  // eyes (kind, tired)
  for (const ex of [17, 26]) { set(ex, 20, 'K1'); set(ex + 1, 20, 'K1'); set(ex, 21, 'K2'); set(ex + 1, 21, 'K10'); set(ex - 1, 21, 'S2'); set(ex + 2, 21, 'S2'); }
  // crow's feet & cheeks
  set(14, 21, 'S2'); set(14, 22, 'S2'); set(29, 21, 'S2'); set(29, 22, 'S2');
  set(16, 24, 'R4'); set(27, 24, 'R4');
  // nose
  set(22, 23, 'S2'); set(22, 24, 'S2'); set(23, 25, 'S2');
  // mouth
  if (talk) { set(20, 27, 'R1'); set(21, 27, 'R1'); set(22, 27, 'R1'); set(23, 27, 'R1'); set(21, 28, 'R2'); set(22, 28, 'R2'); }
  else { set(20, 27, 'R2'); set(21, 27, 'R2'); set(22, 27, 'R2'); set(23, 27, 'R2'); set(19, 26, 'S2'); set(24, 26, 'S2'); }
  // chin shading
  for (let x = 18; x < 26; x++) set(x, 30, 'S2');
  return spriteFromBuf(pb, 21, 41);
}

/** Tick's own portrait (for dialogue responses) */
export function buildTickPortrait(): Sprite {
  const pb = new PixelBuf(42, 42);
  const set = (x: number, y: number, c: string) => pb.set(x, y, rgb(c));
  const cx = 21, cy = 20, r = 15;
  for (let y = -r - 3; y <= r + 3; y++)
    for (let x = -r - 3; x <= r + 3; x++) {
      const d = Math.hypot(x, y);
      if (d > r + 2) continue;
      let c = d > r ? (y < 0 ? 'B5' : 'B3') : x + y < -6 ? 'K10' : x + y > 10 ? 'K8' : 'K9';
      if (d > r + 1) c = 'B2';
      set(cx + x, cy + y, c);
    }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; set(Math.round(cx + Math.cos(a) * (r - 2)), Math.round(cy + Math.sin(a) * (r - 2)), 'K6'); }
  for (const ex of [14, 27]) for (let y = 17; y < 22; y++) { set(ex, y, 'K1'); set(ex + 1, y, 'K1'); }
  set(15, 18, 'K10');
  set(28, 18, 'K10');
  // crown
  for (let y = 0; y < 3; y++) for (let x = 19; x < 24; x++) set(x, y, y === 0 ? 'B6' : 'B4');
  for (let y = 3; y < 5; y++) set(21, y, 'B3');
  // scarf
  for (let y = 36; y < 42; y++) for (let x = 8; x < 34; x++) if (Math.abs(x - 21) < 13 - (y - 36)) set(x, y, y === 36 ? 'R4' : y < 39 ? 'R3' : 'R2');
  return spriteFromBuf(pb, 21, 41);
}

export const CAT: Sprite[] = [0, 1].map((f) => spriteFromDef({
  rows: [
    '..g.......g..',
    '.gGg.....gGg.',
    '.gGGgggggGGg.',
    'gGGkGGGGGkGGg',
    'gGGGGGrGGGGGg',
    '.gGGGGGGGGGg.' + (f ? '' : ''),
    '..gGGGGGGGGGgg',
    '..gGGGGGGGGGGgg',
    '...gggggggggg.g',
  ].map((r) => r.padEnd(15, '.')),
  pal: { g: 'B2', G: 'B4', k: f ? 'K1' : 'B2', r: 'R3' },
  ox: 7, oy: 8,
}));

export const GRANDFATHER_CLOCK = (() => {
  const pb = new PixelBuf(16, 40);
  for (let y = 0; y < 40; y++) for (let x = 1; x < 15; x++) {
    let c = x === 1 || x === 14 ? 'B0' : x < 4 ? 'R1' : x > 11 ? 'R0' : 'R1';
    if (y < 3) c = y === 0 ? 'B3' : 'R2';
    if (y > 36) c = 'B0';
    pb.set(x, y, rgb(c));
  }
  // face
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) { const d = Math.hypot(x, y); if (d <= 5) pb.set(8 + x, 9 + y, rgb(d > 4.2 ? 'B4' : 'K10')); }
  pb.set(8, 9, rgb('K0')); pb.set(8, 6, rgb('K1')); pb.set(8, 7, rgb('K1')); pb.set(9, 8, rgb('K1'));
  // pendulum window
  for (let y = 18; y < 34; y++) for (let x = 5; x < 12; x++) pb.set(x, y, rgb(x === 5 || x === 11 || y === 18 || y === 33 ? 'B2' : 'K1'));
  return spriteFromBuf(pb, 8, 39);
})();

export const PENDULUM_BOB = spriteFromDef({ rows: ['.n.', 'nBn', '.n.'], pal: { n: 'B3', B: 'B5' }, ox: 1, oy: 1, outline: false });

export const WEAPON_RACK = spriteFromDef({
  rows: [
    'nnnnnnnnnnnnnnnnnnnn',
    'nbbbbbbbbbbbbbbbbbbn',
    'n.r....s....g....o.n',
    'n.r....s....g....o.n',
    'n.r...sss..ggg..ooon',
    'n.r....s....g....o.n',
    'n.r....s....g....o.n',
    'nbbbbbbbbbbbbbbbbbbn',
    'nnnnnnnnnnnnnnnnnnnn',
    '.n................n.',
    '.n................n.',
  ],
  pal: { n: 'B1', b: 'B2', r: 'R3', s: 'K7', g: 'B4', o: 'K8' },
  ox: 10, oy: 10,
});

export const LEDGER_STAND = spriteFromDef({
  rows: [
    '.wwwwwwwwwwww.',
    'wKKKKKwKKKKKKw',
    'wKkkkkwkkkkkKw',
    'wKKKKKwKKKKKKw',
    'wKkkkkwkkkkKKw',
    'wwwwwwwwwwwwww',
    '.....nnnn.....',
    '......nn......',
    '......nn......',
    '......nn......',
    '....nnnnnn....',
  ],
  pal: { w: 'R1', K: 'K10', k: 'K6', n: 'B2' },
  ox: 7, oy: 10,
});

export const MAINSPRING_BENCH = (() => {
  const pb = new PixelBuf(36, 30);
  // table
  for (let x = 0; x < 36; x++) { pb.set(x, 16, rgb('B3')); pb.set(x, 17, rgb('B2')); pb.set(x, 18, rgb('B1')); }
  for (const lx of [2, 33]) for (let y = 19; y < 30; y++) { pb.set(lx, y, rgb('B1')); pb.set(lx + 1, y, rgb('B0')); }
  // big mainspring coil on the table
  for (let a = 0; a < 40; a++) {
    const t = a * 0.32;
    const rr = 2 + t * 0.9;
    pb.set(Math.round(18 + Math.cos(t * 2.2) * rr), Math.round(9 + Math.sin(t * 2.2) * rr * 0.6), rgb(a % 3 ? 'B4' : 'B6'));
  }
  paintGear(pb, 6, 11, 4.5, 8, 0, BRASS_GEAR, 1.5);
  paintGear(pb, 30, 12, 3.5, 6, 0.3, BRASS_GEAR, 1.5);
  return spriteFromBuf(pb, 18, 29);
})();
