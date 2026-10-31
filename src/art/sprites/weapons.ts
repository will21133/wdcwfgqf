// Weapon sprites and procedural pixel-perfect smears (computed per angle, cached lazily).
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromDef, RotCache } from '../../engine/gfx/sprite';
import { rgb } from '../blit';

// The rapier IS a clock's second hand: brass counterweight ring hilt, slender red blade.
export const RAPIER = spriteFromDef({
  rows: [
    '.nnn................',
    'nYBbn...............',
    'nBkBnmssSSSSSSSSSSSS',
    'nbBbnmzzsssssssssss.',
    '.nnn................',
  ],
  pal: { n: 'B2', Y: 'B6', B: 'B5', b: 'B3', k: 'K1', m: 'B1', s: 'R3', S: 'R4', z: 'R2' },
  ox: 2, oy: 2,
});

export const MAUL = spriteFromDef({
  rows: [
    '...............nnnn.',
    '..............nBBBbn',
    'nnn..........nBYBBbn',
    'nBbmmmmmmmmmmnBBBBbn',
    'nnn..........nbBBbbn',
    '..............nbbbn.',
    '...............nnnn.',
  ],
  pal: { n: 'B1', Y: 'B6', B: 'B4', b: 'B3', m: 'K5' },
  ox: 2, oy: 3,
});

export const BOW = spriteFromDef({
  rows: [
    '..nn..',
    '.nB...',
    'nB.s..',
    'nb..s.',
    'nb...s',
    'nY...s',
    'nb...s',
    'nb..s.',
    'nB.s..',
    '.nB...',
    '..nn..',
  ],
  pal: { n: 'B1', B: 'B4', b: 'B3', Y: 'B6', s: 'K9' },
  ox: 1, oy: 5,
});

export const GEAR_BLADE = spriteFromDef({
  rows: [
    '...nn...',
    '.nnBBnn.',
    '.nBYBbn.',
    'nBBkkBbn',
    'nBbkkbbn',
    '.nbbbbn.',
    '.nnbbnn.',
    '...nn...',
  ],
  pal: { n: 'B1', B: 'B4', b: 'B3', Y: 'B6', k: 'K1' },
  ox: 4, oy: 4,
});

export const rapierRot = new RotCache(RAPIER, 32);
export const maulRot = new RotCache(MAUL, 32);
export const bowRot = new RotCache(BOW, 32);

export type SmearPal = 'brass' | 'echo' | 'ember' | 'violet' | 'enemy';
const PALS: Record<SmearPal, string[]> = {
  brass: ['W', 'B6', 'B5', 'B4'],
  echo: ['W', 'C4', 'C3', 'C2'],
  ember: ['W', 'O4', 'O3', 'O2'],
  violet: ['W', 'V4', 'V3', 'V2'],
  enemy: ['W', 'M3', 'M2', 'M1'],
};

const ANG = 32;
const cache = new Map<string, Sprite>();

/** Crescent swing smear. dir = centre angle of the arc; frame 0..3 (fades/thins). */
export function arcSmear(R: number, thick: number, sweep: number, dir: number, frame: number, pal: SmearPal, cw = true): Sprite {
  const ai = ((Math.round((dir / (Math.PI * 2)) * ANG) % ANG) + ANG) % ANG;
  const key = `a${R}|${thick}|${sweep.toFixed(2)}|${ai}|${frame}|${pal}|${cw}`;
  let s = cache.get(key);
  if (s) return s;
  const ang = (ai / ANG) * Math.PI * 2;
  const size = R * 2 + 4;
  const c = size / 2;
  const pb = new PixelBuf(size, size);
  const cols = PALS[pal].map(rgb);
  const half = sweep / 2;
  const fadeTail = frame * 0.28; // portion of the trailing arc removed per frame
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d > R || d < R - thick - 1) continue;
      let a = Math.atan2(dy, dx) - ang;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > half) continue;
      // u: 0 at trailing edge → 1 at leading edge
      let u = (a + half) / (half * 2);
      if (!cw) u = 1 - u;
      if (u < fadeTail) continue;
      const th = Math.max(1, thick * Math.pow((u - fadeTail) / (1 - fadeTail), 0.7) * (1 - frame * 0.18));
      const depth = R - d; // 0 at outer edge
      if (depth > th) continue;
      const band = depth / th;
      let ci = band < 0.22 ? 0 : band < 0.5 ? 1 : band < 0.8 ? 2 : 3;
      ci = Math.min(3, ci + (frame >= 2 ? 1 : 0));
      if (frame === 3 && ((x + y) & 1)) continue;
      pb.set(x, y, cols[ci]);
    }
  s = new Sprite(pb.toCanvas(), c, c);
  cache.set(key, s);
  return s;
}

/** Thrust streak: wedge pointing along dir, base at pivot. */
export function thrustSmear(len: number, width: number, dir: number, frame: number, pal: SmearPal): Sprite {
  const ai = ((Math.round((dir / (Math.PI * 2)) * ANG) % ANG) + ANG) % ANG;
  const key = `t${len}|${width}|${ai}|${frame}|${pal}`;
  let s = cache.get(key);
  if (s) return s;
  const ang = (ai / ANG) * Math.PI * 2;
  const size = len * 2 + 4;
  const c = size / 2;
  const pb = new PixelBuf(size, size);
  const cols = PALS[pal].map(rgb);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const start = frame * 0.22 * len;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const along = dx * ux + dy * uy;
      const across = Math.abs(-dx * uy + dy * ux);
      if (along < start || along > len) continue;
      const t = along / len;
      const w = (width / 2) * (1 - t) * (1 - frame * 0.2) + 0.5;
      if (across > w) continue;
      const band = across / w;
      let ci = band < 0.3 ? 0 : band < 0.65 ? 1 : 2;
      if (t > 0.75) ci = Math.max(ci, 1);
      ci = Math.min(3, ci + (frame >= 2 ? 1 : 0));
      if (frame === 3 && ((x + y) & 1)) continue;
      pb.set(x, y, cols[ci]);
    }
  s = new Sprite(pb.toCanvas(), c, c);
  cache.set(key, s);
  return s;
}
