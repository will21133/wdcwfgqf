// Boss 1 — 工头 THE FOREMAN: a boiler-bodied overseer automaton. Parts are composed at runtime.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, spriteFromDef } from '../../engine/gfx/sprite';
import { rgb } from '../blit';

type C = [number, number, number];

/** riveted copper boiler torso. open = furnace door blown off (phase 2) */
function paintTorso(open: boolean, heat: number): Sprite {
  const W = 46, H = 40;
  const pb = new PixelBuf(W, H);
  const cop = ['B0', 'B1', 'B2', 'B3', 'B4', 'B5'].map(rgb);
  const iron = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'].map(rgb);
  const cx = W / 2;
  // chimney stacks behind shoulders
  for (const sx of [9, 34]) {
    for (let y = 0; y < 16; y++) for (let x = sx; x < sx + 4; x++) pb.set(x, y, iron[x === sx ? 4 : x === sx + 3 ? 1 : 2]);
    for (let x = sx - 1; x < sx + 5; x++) { pb.set(x, 0, iron[5]); pb.set(x, 1, iron[3]); }
  }
  // boiler body: rounded barrel
  for (let y = 6; y < H - 2; y++) {
    const t = (y - 6) / (H - 8);
    const half = 19 - Math.pow(Math.abs(t - 0.45) * 2, 3) * 5;
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      const u = (x - (cx - half)) / (half * 2); // 0..1 across
      // cylindrical shading: light from top-left
      let L = Math.round(1.2 + Math.sin(u * Math.PI) * 3.2 - u * 1.3 - t * 0.8);
      if (y === 6 || y === 7) L += 1;
      L = Math.max(0, Math.min(5, L));
      pb.set(x, y, cop[L]);
    }
    // horizontal bands (riveted seams)
    if (y === 12 || y === 26 || y === 33) for (let x = Math.round(cx - half) + 1; x < Math.round(cx + half) - 1; x++) {
      pb.set(x, y, cop[0]);
      if ((x & 3) === 1) pb.set(x, y - 1, cop[5]);
    }
  }
  // shoulder pauldrons (iron)
  for (const [px, dir] of [[3, -1], [43, 1]] as [number, number][]) {
    for (let y = 8; y < 18; y++)
      for (let x = 0; x < 9; x++) {
        const xx = dir < 0 ? px + x : px - x;
        const d = Math.hypot(x - 4, (y - 12) * 0.9);
        if (d > 5.2) continue;
        pb.set(xx, y, iron[Math.max(0, Math.min(5, Math.round(4 - d * 0.5 - (y - 8) * 0.25)))]);
      }
  }
  // pressure gauge
  const gx = Math.round(cx), gy = 18;
  for (let y = -5; y <= 5; y++)
    for (let x = -5; x <= 5; x++) {
      const d = Math.hypot(x, y);
      if (d > 5.4) continue;
      pb.set(gx + x, gy + y, d > 4.4 ? rgb('B5') : d > 3.8 ? rgb('B1') : rgb('K9'));
    }
  for (let k = 0; k < 4; k++) pb.set(gx - 1 + k, gy - 2 + k, rgb('R3'));
  pb.set(gx, gy, rgb('K0'));
  // furnace door
  const fx0 = Math.round(cx - 7), fy0 = 27;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 14; x++) {
      let c: C;
      if (open) {
        const g = 1 - y / 8;
        c = rgb(y < 2 ? 'O4' : y < 4 ? 'O3' : y < 6 ? 'O2' : 'O1');
        if ((x & 1) && heat > 0.5 && y > 3) c = rgb('O3');
        void g;
      } else {
        c = y === 0 || x === 0 || x === 13 ? iron[4] : y === 7 || x === 12 ? iron[0] : iron[2];
        if (y > 1 && y < 7 && (x === 3 || x === 6 || x === 9)) c = rgb(heat > 0.5 ? 'O1' : 'K0');
      }
      pb.set(fx0 + x, fy0 + y, c);
    }
  if (open) for (let x = -1; x < 15; x++) { pb.set(fx0 + x, fy0 - 1, rgb('K0')); pb.set(fx0 + x, fy0 + 8, rgb('K0')); }
  // rivets
  for (let x = Math.round(cx - 16); x < Math.round(cx + 16); x += 4) { pb.set(x, 9, rgb('B6')); pb.set(x, 30, rgb('B5')); }
  return spriteFromBuf(pb, Math.floor(W / 2), H - 1);
}

const HEAD_PAL = { k: 'K0', a: 'K2', b: 'K3', c: 'K4', d: 'K5', u: 'U1', U: 'U2', y: 'B5', Y: 'B6', o: 'O3', O: 'O4', r: 'R2' };
function head(eye: 'o' | 'r'): Sprite {
  return spriteFromDef({
    rows: [
      '....uuuuuuuu....',
      '...uUUUUUUUUu...',
      '..uUUUyYUUUUUu..',
      '..uuuuuuuuuuuu..',
      '.kkkkkkkkkkkkkk.',
      '..bccccccccccb..',
      '..bc' + eye + eye + eye + 'cc' + eye + eye + eye + 'cb..',
      '..bccccccccccb..',
      '..bcdddddddddb..',
      '..bbaaaaaaaabb..',
      '...bbbbbbbbbb...',
    ],
    pal: HEAD_PAL, ox: 8, oy: 10,
  });
}

export const FIST = spriteFromDef({
  rows: [
    '...nnnnnnnn...',
    '..nBYBBBBBbn..',
    '.nBBBBBBBBbbn.',
    '.nBbnBbnBbnbn.',
    '.nBbnBbnBbnbn.',
    '.nBBBBBBBBbbn.',
    '.nbbbbbbbbbbn.',
    '.nmmmmmmmmmmn.',
    '..nmmmmmmmmn..',
    '...nnnnnnnn...',
  ],
  pal: { n: 'B0', B: 'B4', Y: 'B6', b: 'B3', m: 'B2' },
  ox: 7, oy: 5,
});

export interface ForemanArt { torso: Sprite; torsoOpen: Sprite; torsoHot: Sprite; head: Sprite; headAngry: Sprite; fist: Sprite }
export function buildForeman(): ForemanArt {
  return { torso: paintTorso(false, 0), torsoHot: paintTorso(false, 1), torsoOpen: paintTorso(true, 1), head: head('o'), headAngry: head('r'), fist: FIST };
}
