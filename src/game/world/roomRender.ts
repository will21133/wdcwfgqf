// Pre-renders a room: one world-space floor buffer (no visible tiling) and per-row wall strips
// that are y-sorted with actors.  3/4 view: tall walls are 32px (caps raised two tiles, faces
// toward the camera); south boundary walls are cut away to 8px so they never hide the player.
import { PixelBuf } from '../../engine/gfx/canvas';
import { RNG } from '../../engine/rng';
import { bayer, fbm2, hash2, clamp } from '../../engine/math';
import { rgb } from '../../art/blit';
import { Theme } from '../../art/themes';
import { RoomMap, T, TS } from './room';
import type { PaintCtx } from '../../art/biomes/types';
import { BIOMES } from '../../art/biomes';

export interface WallStrip { ty: number; canvas: HTMLCanvasElement; y: number; sortY: number }
export interface RoomVisual { floor: HTMLCanvasElement; walls: WallStrip[]; heights: Uint8Array }

type RGB = [number, number, number];
export const WALL_H = 32;
const LOW_H = 8;
const STRIP_TOP = WALL_H; // strip starts this far above the cell top

export const isOpen = (t: T) => t === T.FLOOR || t === T.PIT || t === T.BLOCK;

/** visual height of a wall cell (32 tall, 8 for cut-away south boundary walls) */
export function wallHeight(m: RoomMap, tx: number, ty: number): number {
  let above = false, below = false;
  for (let k = 1; k <= 3; k++) {
    if (isOpen(m.get(tx, ty - k))) above = true;
    if (isOpen(m.get(tx, ty + k))) below = true;
  }
  return above && !below ? LOW_H : WALL_H;
}

export function renderRoom(m: RoomMap, th: Theme, seed: number): RoomVisual {
  const rng = new RNG(seed);
  const biome = BIOMES[th.id] ?? {};
  const pw = m.pw, ph = m.ph;
  const heights = new Uint8Array(m.w * m.h);
  for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) heights[ty * m.w + tx] = wallHeight(m, tx, ty);
  // distance to wall above (ambient occlusion) per pixel column
  const aoTop = new Int16Array(pw * ph).fill(99);
  for (let x = 0; x < pw; x++) {
    let d = 99;
    for (let y = 0; y < ph; y++) {
      if (wallish(m, x >> 4, y >> 4)) d = 0; else d++;
      aoTop[y * pw + x] = d;
    }
  }
  const c: PaintCtx = { m, th, rng, seed, aoTop, wallish: (x, y) => wallish(m, x, y) };
  const floor = new PixelBuf(pw, ph);
  (biome.paintFloor ?? defaultFloor)(floor, c);
  (biome.paintPits ?? defaultPits)(floor, c);
  paintFloorProps(floor, m, th, rng);
  biome.paintDressing?.(floor, c);
  const walls: WallStrip[] = [];
  for (let ty = 0; ty < m.h; ty++) {
    const strip = new PixelBuf(pw, STRIP_TOP + TS);
    let any = false;
    for (let tx = 0; tx < m.w; tx++) {
      const t = m.get(tx, ty);
      const entryDoor = t === T.DOOR && !!m.entry && ty >= m.entry.ty;
      if (t !== T.WALL && !entryDoor) continue;
      if (!wallVisible(m, tx, ty)) continue;
      any = true;
      const H = heights[ty * m.w + tx];
      (biome.paintCap ?? defaultCap)(strip, c, tx, ty, STRIP_TOP - H);
      const s = m.get(tx, ty + 1);
      const faceVisible = isOpen(s) || s === T.VOID;
      if (faceVisible) (biome.paintFace ?? defaultFace)(strip, c, tx, ty, STRIP_TOP + TS - H, H, s === T.VOID);
    }
    if (any) walls.push({ ty, canvas: strip.toCanvas(), y: ty * TS - STRIP_TOP, sortY: (ty + 1) * TS });
  }
  return { floor: floor.toCanvas(), walls, heights };
}

function wallVisible(m: RoomMap, tx: number, ty: number) {
  for (let j = -2; j <= 3; j++) for (let i = -1; i <= 1; i++) if (isOpen(m.get(tx + i, ty + j))) return true;
  return false;
}

export const wallish = (m: RoomMap, tx: number, ty: number) => {
  const t = m.get(tx, ty);
  return t === T.WALL || t === T.VOID || t === T.DOOR;
};

export function darken(c: RGB, k: number): RGB {
  const tr = 11, tg = 10, tb = 20;
  return [Math.round(c[0] + (tr - c[0]) * k), Math.round(c[1] + (tg - c[1]) * k), Math.round(c[2] + (tb - c[2]) * k)];
}

// ─────────────────────────── floor ───────────────────────────

export function defaultFloor(pb: PixelBuf, c: PaintCtx) {
  const { m, th, rng, seed, aoTop } = c;
  const slab = th.slab.map(rgb), grime = th.grime.map(rgb), plate = th.plate.map(rgb), seam = rgb(th.seam);
  const pw = m.pw, ph = m.ph;
  // slab layout per tile row (brick-offset flagstones)
  const slabId = new Int32Array(pw * ph);
  const slabShade: number[] = [], slabStart: number[] = [], slabW: number[] = [];
  for (let ty = 0; ty < m.h; ty++) {
    let x = -rng.int(0, 12);
    while (x < pw) {
      const w = rng.pick([16, 16, 24, 32, 24, 20]);
      const id = slabShade.length;
      slabShade.push(rng.pick([1, 2, 2, 2, 3]));
      slabStart.push(x); slabW.push(w);
      for (let yy = ty * TS; yy < ty * TS + TS; yy++)
        for (let xx = Math.max(0, x); xx < Math.min(pw, x + w); xx++) slabId[yy * pw + xx] = id;
      x += w;
    }
  }
  // plate regions: tile-aligned rectangles
  const plateTile = new Uint8Array(m.w * m.h);
  const nPlates = Math.round((m.w * m.h * th.plateAmount) / 40);
  for (let i = 0; i < nPlates; i++) {
    const w = rng.int(2, 4), h = rng.int(2, 3);
    const x = rng.int(2, m.w - w - 2), y = rng.int(3, m.h - h - 2);
    for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) plateTile[j * m.w + k] = 1;
  }
  // brass inlay ring (clock motif) at room centre for big rooms
  const ringCx = Math.floor(pw / 2), ringCy = Math.floor((m.ph) / 2) + 8;
  const ringR = m.w > 28 ? 40 : 0;

  // cracks (short random walks)
  const crack = new Uint8Array(pw * ph);
  const nCracks = Math.floor((m.w * m.h) / 10);
  for (let i = 0; i < nCracks; i++) {
    let x = rng.int(0, pw - 1), y = rng.int(0, ph - 1);
    const len = rng.int(3, 10);
    let dx = rng.sign(), dy = 0;
    for (let k = 0; k < len; k++) {
      if (x < 0 || y < 0 || x >= pw || y >= ph) break;
      crack[y * pw + x] = 1;
      if (rng.chance(0.4)) { if (dy) { dy = 0; dx = rng.sign(); } else { dx = 0; dy = 1; } }
      x += dx; y += dy;
    }
  }

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const tx = x >> 4, ty = y >> 4;
      const t = m.get(tx, ty);
      const exitFloor = t === T.DOOR && m.exits.some((e) => tx >= e.tx && tx < e.tx + e.w && ty >= e.ty - 1 && ty <= e.ty + 1);
      if (t !== T.FLOOR && t !== T.BLOCK && !exitFloor) continue;
      const id = slabId[y * pw + x];
      const lx = x - slabStart[id], ly = y & 15, sw = slabW[id];
      let c: RGB;
      const g = hash2(x, y, seed);
      if (plateTile[ty * m.w + tx]) {
        // riveted iron plates
        const px = x & 15, py = y & 15;
        let pl = 1 + (hash2(tx, ty, seed + 3) > 0.6 ? 1 : 0);
        if (py === 0 || px === 0) pl = 2;
        if (py === 15 || px === 15) pl = 0;
        if ((px === 2 || px === 13) && (py === 2 || py === 13)) pl = 3;
        if (g < 0.05 && pl > 0) pl--;
        c = plate[clamp(pl, 0, plate.length - 1)];
        // oxidised patches
        if (hash2(x >> 2, y >> 2, seed + 9) > 0.9 && pl > 0 && pl < 3) c = grime[1];
      } else {
        let L = slabShade[id];
        if (g < 0.05) L -= 1; else if (g > 0.97) L += 1;
        if (ly === 15 || lx === sw - 1) L = -1;
        else if (ly === 0 || lx === 0) L += 1;
        if (L >= 0 && crack[y * pw + x]) L = Math.max(0, L - 2);
        c = L < 0 ? seam : slab[clamp(L, 0, slab.length - 1)];
        // grime collects in seams and near walls
        const gm = fbm2(x * 0.07 + 50, y * 0.07, seed + 11, 3);
        const nearSeam = ly >= 14 || lx >= sw - 2 || ly <= 0 || lx <= 0;
        const wallNear = aoTop[y * pw + x] < 14;
        const thr = 1 - th.grimeAmount * (nearSeam ? 0.9 : wallNear ? 0.75 : 0.5);
        if (gm > thr && L >= 0) {
          const k = (gm - thr) / (1 - thr);
          if (k > bayer(x, y) * 0.85) c = grime[clamp(Math.floor(k * 2.5 + (L > 2 ? 1 : 0)), 0, grime.length - 1)];
        }
      }
      // inlaid brass ring with hour marks
      if (ringR) {
        const dx = x - ringCx, dy = (y - ringCy) * 1.0;
        const d = Math.hypot(dx, dy);
        if (d > ringR - 1.5 && d < ringR + 0.5) c = rgb('B2');
        else if (d >= ringR + 0.5 && d < ringR + 1.5) c = rgb('B1');
        else if (d > ringR - 9 && d < ringR - 4) {
          const a = Math.atan2(dy, dx);
          const hour = Math.round((a / (Math.PI * 2)) * 12);
          const da = Math.abs(a - (hour / 12) * Math.PI * 2);
          if (da * d < 1.2) c = rgb(hour % 3 === 0 ? 'B3' : 'B1');
        }
      }
      // ambient occlusion beneath walls
      const ao = aoTop[y * pw + x];
      let dark = 0;
      if (ao <= 3) dark = 3; else if (ao <= 7) dark = 2; else if (ao <= 12) dark = bayer(x, y) < 0.6 ? 1 : 0; else if (ao <= 16) dark = bayer(x, y) < 0.25 ? 1 : 0;
      const lw = wallish(m, (x - 3) >> 4, ty) || wallish(m, (x + 3) >> 4, ty);
      if (lw) dark = Math.max(dark, 1);
      if (dark) c = darken(c, dark * 0.14);
      pb.set(x, y, c);
    }
  }
}

// ─────────────────────────── pits ───────────────────────────

export function defaultPits(pb: PixelBuf, c: PaintCtx) {
  const { m, th, seed } = c;
  const water = th.pitWater.map(rgb), face = th.pitFace.map(rgb);
  const rim = rgb(th.slab[th.slab.length - 1]);
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (m.get(tx, ty) !== T.PIT) continue;
      const nTop = m.get(tx, ty - 1) !== T.PIT;
      const nL = m.get(tx - 1, ty) !== T.PIT, nR = m.get(tx + 1, ty) !== T.PIT, nB = m.get(tx, ty + 1) !== T.PIT;
      for (let py = 0; py < TS; py++)
        for (let px = 0; px < TS; px++) {
          const x = tx * TS + px, y = ty * TS + py;
          let c: RGB;
          if (nTop && py < 9) {
            const k = Math.min(3, Math.floor(py / 2.3));
            c = face[k];
            if (py === 0) c = rim;
            else if (py < 8 && (x + (py > 4 ? 3 : 0)) % 7 === 0) c = face[Math.min(3, k + 1)];
          } else {
            const w = fbm2(x * 0.06, y * 0.22, seed + 31, 2);
            let k = w > 0.68 ? 2 : w > 0.52 ? 1 : 0;
            if (hash2(x, y, seed + 5) > 0.99) k = 3;
            c = water[k];
            if (nTop && py < 12) c = water[0];
          }
          if ((nL && px === 0) || (nR && px === 15)) c = darken(face[2], 0.3);
          if (nB && py === 15) c = face[1];
          pb.set(x, y, c);
        }
    }
}

// ─────────────────────────── floor props ───────────────────────────

function paintFloorProps(pb: PixelBuf, m: RoomMap, th: Theme, rng: RNG) {
  const water = th.pitWater.map(rgb);
  for (const p of m.props) {
    const bx = p.tx * TS + 8, by = p.ty * TS + 8;
    switch (p.type) {
      case 'puddle': {
        const rx = rng.int(6, 10), ry = rng.int(3, 4);
        for (let y = -ry; y <= ry; y++)
          for (let x = -rx; x <= rx; x++) {
            const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
            if (d > 1) continue;
            let c = water[1];
            if (d > 0.7) c = water[0];
            if (y === -ry + 1 && x > -rx / 2 && x < rx / 3) c = water[3];
            pb.set(bx + x, by + y, c);
          }
        break;
      }
      case 'debris': {
        const n = rng.int(3, 6);
        for (let i = 0; i < n; i++) {
          const x = bx + rng.int(-6, 6), y = by + rng.int(-5, 5);
          const c = rgb(rng.pick([th.slab[3], th.slab[4], 'B2', th.slab[2]]));
          pb.set(x, y, c);
          if (rng.chance(0.4)) pb.set(x + 1, y, c);
          pb.set(x, y + 1, rgb(th.seam));
        }
        break;
      }
      case 'cogpile': {
        for (let i = 0; i < rng.int(2, 3); i++) {
          const x = bx + rng.int(-5, 5), y = by + rng.int(-4, 4), r = rng.int(2, 3);
          for (let a = 0; a < 16; a++) {
            const ang = (a / 16) * Math.PI * 2;
            const rr = a % 2 ? r : r + 1;
            pb.set(Math.round(x + Math.cos(ang) * rr), Math.round(y + Math.sin(ang) * rr * 0.7), rgb(a < 8 ? 'B3' : 'B1'));
          }
          pb.set(x, y, rgb('B0'));
        }
        break;
      }
    }
  }
}

// ─────────────────────────── walls ───────────────────────────

export function defaultCap(pb: PixelBuf, cx: PaintCtx, tx: number, ty: number, oy: number) {
  const { m, th, seed } = cx;
  const cap = th.cap.map(rgb), trim = rgb(th.capTrim), trimHi = rgb(th.wallLip[1]);
  const ox = tx * TS;
  const nN = wallish(m, tx, ty - 1), nS = wallish(m, tx, ty + 1), nW = wallish(m, tx - 1, ty), nE = wallish(m, tx + 1, ty);
  const vN = m.get(tx, ty - 1) === T.VOID, vW = m.get(tx - 1, ty) === T.VOID, vE = m.get(tx + 1, ty) === T.VOID;
  // neighbours of different height get a seam so tall/low walls read as separate masses
  for (let py = 0; py < TS; py++)
    for (let px = 0; px < TS; px++) {
      const x = ox + px, y = ty * TS + py;
      // stone blocks seen from above (8x8 offset)
      const off = (y >> 3) % 2 ? 4 : 0;
      const bx = (x + off) & 7, by = y & 7;
      let c = cap[2];
      const h = hash2((x + off) >> 3, y >> 3, seed + 77);
      if (h > 0.6) c = cap[1];
      if (bx === 7 || by === 7) c = cap[0];
      else if (bx === 0 || by === 0) c = h > 0.6 ? cap[2] : darken(cap[2], -0.15);
      if (hash2(x, y, seed + 78) > 0.96) c = cap[0];
      // trims: brass moulding facing the room, dark edge toward the void
      if (!nN && py === 0) c = trim;
      if (!nN && py === 1) c = cap[0];
      if (!nW && px === 0) c = trim;
      if (!nE && px === 15) c = trim;
      if (!nS && py === 15) c = trimHi;
      if (!nS && py === 14) c = trim;
      if (vN && py === 0) c = cap[0];
      if (vW && px === 0) c = cap[0];
      if (vE && px === 15) c = cap[0];
      pb.set(x, oy + py, c);
    }
}

export function defaultFace(pb: PixelBuf, cx: PaintCtx, tx: number, ty: number, oy: number, H: number, exterior: boolean) {
  const { m, th, seed } = cx;
  const brick = th.wallBrick.map(rgb), mortar = rgb(th.wallMortar), lip = th.wallLip.map(rgb);
  const ox = tx * TS;
  const feat = m.props.find((p) => p.tx === tx && p.ty === ty && (p.type === 'pipe' || p.type === 'window'));
  const turnW = !wallish(m, tx - 1, ty) || isOpen(m.get(tx - 1, ty + 1)) === false && !wallish(m, tx - 1, ty + 1);
  const turnE = !wallish(m, tx + 1, ty) || isOpen(m.get(tx + 1, ty + 1)) === false && !wallish(m, tx + 1, ty + 1);
  // pilaster every 6 tiles on tall interior walls
  const pilaster = !exterior && H === WALL_H && tx % 6 === 3;
  for (let py = 0; py < H; py++)
    for (let px = 0; px < TS; px++) {
      const x = ox + px;
      let c: RGB;
      const fromBottom = H - 1 - py;
      if (py === 0) c = lip[2];
      else if (py === 1) c = lip[1];
      else if (py === 2 && H > 8) c = lip[0];
      else if (fromBottom <= 1) c = fromBottom === 0 ? mortar : brick[0];
      else if (H > 8 && py >= 13 && py <= 14) {
        // brass rail band at mid height
        c = py === 13 ? rgb('B2') : rgb('B1');
        if ((x & 7) === 3 && py === 13) c = rgb('B4');
      } else {
        const by = py >= 15 ? py - 15 : py - 3;
        const course = Math.floor(by / 4) + (py >= 15 ? 10 : 0);
        const cy = by % 4;
        const off = course % 2 ? 4 : 0;
        const bxi = Math.floor((x + off) / 8);
        const cx = (x + off) % 8;
        if (cy === 3 || cx === 7) c = mortar;
        else {
          let L = 1 + Math.floor(hash2(bxi, course + ty * 8, seed + 13) * 2.99);
          if (cy === 0) L = Math.min(3, L + 1);
          if (hash2(x, py + ty * TS, seed + 19) > 0.94) L = Math.max(0, L - 1);
          // lower courses slightly darker (soot/damp)
          if (py > 20 && L > 1 && hash2(x, py, seed) > 0.5) L--;
          c = brick[L];
        }
      }
      if (pilaster && (px >= 5 && px <= 10) && py > 2) {
        c = px === 5 ? lip[1] : px === 10 ? brick[0] : px === 6 ? lip[0] : brick[2];
        if (py === 3 || py === 4) c = lip[1];
        if (fromBottom <= 2) c = px === 5 ? lip[0] : brick[1];
      }
      if ((turnW && px === 0) || (turnE && px === 15)) c = darken(c, 0.3);
      if (exterior) c = darken(c, 0.5);
      pb.set(x, oy + py, c);
    }
  if (feat?.type === 'pipe' && !exterior && H > 8) {
    const py0 = oy + 18;
    for (let px = 0; px < TS; px++) {
      const x = ox + px;
      pb.set(x, py0, rgb('B4')); pb.set(x, py0 + 1, rgb('B3')); pb.set(x, py0 + 2, rgb('B2')); pb.set(x, py0 + 3, rgb('B1'));
      if (hash2(x, ty, seed) > 0.72) pb.set(x, py0 + 2, rgb('T3'));
      if (hash2(x, ty, seed) > 0.85) pb.set(x, py0 + 3, rgb('T2'));
    }
    for (let k = 0; k < 6; k++) { pb.set(ox + 7, py0 - 1 + k, rgb(k < 2 ? 'B5' : 'B2')); pb.set(ox + 8, py0 - 1 + k, rgb(k < 2 ? 'B4' : 'B1')); }
  }
  if (feat?.type === 'window' && !exterior && H > 8) {
    for (let py = 5; py < 24; py++)
      for (let px = 3; px < 13; px++) {
        let c = py < 10 ? rgb('B1') : rgb('K1');
        if (py < 8 && px > 4 && px < 11) c = rgb('O0');
        if (px === 3 || px === 12 || py === 5) c = lip[0];
        else if (px === 6 || px === 9) c = rgb('K0');
        else if (py === 14) c = rgb('K0');
        // arched top
        if (py < 7 && (px < 5 || px > 10)) c = brick[1];
        pb.set(ox + px, oy + py, c);
      }
    for (let px = 2; px < 14; px++) { pb.set(ox + px, oy + 24, lip[1]); pb.set(ox + px, oy + 25, brick[0]); }
  }
}
