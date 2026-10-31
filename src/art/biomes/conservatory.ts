// Floor 2 — 铜绿温室 The Verdigris Conservatory.
// A Victorian glasshouse inside the clock tower at night, frozen at 11:59:59. Moonlight through
// copper-framed glass, harlequin encaustic tiles lifted by roots and moss, reflecting ponds,
// raised planter beds, hanging lanterns, frozen butterflies.
//
// Painters are deterministic per room seed. Room-wide precomputed fields (wall distance, ivy,
// pond components...) live in a per-PaintCtx cache.
import { PixelBuf } from '../../engine/gfx/canvas';
import type { BiomeArt, PaintCtx } from './types';
import { rgb } from '../blit';
import { hash2, fbm2, bayer, clamp, TAU } from '../../engine/math';
import { RNG } from '../../engine/rng';
import { T, TS, RoomMap } from '../../game/world/room';
import type { World } from '../../game/world/world';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Ctx } from '../../engine/gfx/canvas';
import { makeCanvas } from '../../engine/gfx/canvas';
import { Entity } from '../../game/entities/entity';
import { WallLamp, WallGear, Breakable } from '../../game/entities/props';
import { Pickup } from '../../game/entities/pickup';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { col as pcol, hexToRgb } from '../palette';
import { frand, fpick } from '../../engine/rng';
import { sfx } from '../../game/G';
import type { DamageInfo } from '../../game/systems/combat';
import { LANTERN, FLOOR_LANTERN, buildClockFlower, URN, COLDFRAME, POT, buildButterflies } from '../sprites/conservatory';

type RGB = [number, number, number];
const C = (k: string) => rgb(k) as RGB;

/** darken toward the global outline indigo (same law as the default painters) */
function dk(c: RGB, k: number): RGB {
  return [Math.round(c[0] + (11 - c[0]) * k), Math.round(c[1] + (10 - c[1]) * k), Math.round(c[2] + (20 - c[2]) * k)];
}

const isOpenT = (t: T) => t === T.FLOOR || t === T.PIT || t === T.BLOCK;

// ───────────────────────────── per-room cache ─────────────────────────────

interface Cache {
  /** px distance to nearest wall pixel */
  wd: Float32Array;
  /** px distance to nearest pit pixel */
  pd: Float32Array;
  /** floor+pits snapshot, used to clear under generator floor props before re-dressing them */
  snap: Uint8ClampedArray | null;
  ivy: Map<number, RGB> | null;
  /** tile x of the bay where the moon shows through the north glass */
  moonTx: number;
  moonTy: number;
}
const caches = new WeakMap<PaintCtx, Cache>();

function chamfer(src: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e7;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = src[i] ? 0 : INF;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (!v) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (!v) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

function getCache(c: PaintCtx): Cache {
  let k = caches.get(c);
  if (k) return k;
  const { m } = c;
  const pw = m.pw, ph = m.ph;
  const wm = new Uint8Array(pw * ph), pm = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const tx = x >> 4, ty = y >> 4;
      if (c.wallish(tx, ty) && !exitFloor(m, tx, ty)) wm[y * pw + x] = 1;
      if (m.get(tx, ty) === T.PIT) pm[y * pw + x] = 1;
    }
  // moon bay: the tall north-wall face closest to the room's horizontal centre-left
  let moonTx = -1, moonTy = -1, best = 1e9;
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (!tallInteriorFace(m, tx, ty) || isIsland(m, tx, ty)) continue;
      if (m.exits.some((e) => Math.abs(e.tx - tx) < 3)) continue;
      const s = Math.abs(tx - m.w * 0.36) + ty * 3;
      if (s < best) { best = s; moonTx = tx; moonTy = ty; }
    }
  k = { wd: chamfer(wm, pw, ph), pd: chamfer(pm, pw, ph), snap: null, ivy: null, moonTx, moonTy };
  caches.set(c, k);
  return k;
}

function exitFloor(m: RoomMap, tx: number, ty: number) {
  return m.get(tx, ty) === T.DOOR && m.exits.some((e) => tx >= e.tx && tx < e.tx + e.w && ty >= e.ty - 1 && ty <= e.ty + 1);
}

function wallHeightOf(m: RoomMap, tx: number, ty: number) {
  let above = false, below = false;
  for (let k = 1; k <= 3; k++) {
    if (isOpenT(m.get(tx, ty - k))) above = true;
    if (isOpenT(m.get(tx, ty + k))) below = true;
  }
  return above && !below ? 8 : 32;
}

/** wall tile whose visible face is a tall interior (room-facing) face */
export function tallInteriorFace(m: RoomMap, tx: number, ty: number) {
  if (m.get(tx, ty) !== T.WALL) return false;
  const s = m.get(tx, ty + 1);
  return isOpenT(s) && wallHeightOf(m, tx, ty) === 32;
}

/** free-standing wall block inside the room (pillars / islands) → painted as a raised planter bed */
export function isIsland(m: RoomMap, tx: number, ty: number) {
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (m.get(tx + i, ty + j) === T.VOID) return false;
  return true;
}

// ───────────────────────────── palette ramps ─────────────────────────────

const GROUT = C('T0'), GROUT_MOSS = C('G0');
const R_TEAL = ['T0', 'T1', 'T2', 'T3'].map(C);
const R_FERN = ['G0', 'G1', 'G2', 'G3'].map(C);
const R_CREAM = ['K3', 'K4', 'K5', 'K6'].map(C);
const R_TERRA = ['B0', 'B1', 'B2', 'B3'].map(C);
const R_BAND = ['K1', 'K2', 'K3', 'K4'].map(C);
const MOSS = ['G0', 'G1', 'G1', 'G2', 'G3'].map(C);
const SOIL = ['K1', 'B0', 'S0'].map(C);

// ───────────────────────────── floor ─────────────────────────────

function paintFloor(pb: PixelBuf, c: PaintCtx) {
  const { m, seed, aoTop } = c;
  const pw = m.pw, ph = m.ph;
  const K = getCache(c);
  const rng = new RNG(seed * 7 + 1301);
  const isFloorTile = (tx: number, ty: number) => {
    const t = m.get(tx, ty);
    return t === T.FLOOR || t === T.BLOCK || exitFloor(m, tx, ty);
  };
  // border band: floor tiles touching a wall (not doors)
  const band = new Uint8Array(m.w * m.h);
  let floorTiles = 0;
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (!isFloorTile(tx, ty)) continue;
      floorTiles++;
      if (exitFloor(m, tx, ty)) continue;
      let near = false;
      for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1 && !near; i++) {
        const t = m.get(tx + i, ty + j);
        if ((t === T.WALL || t === T.VOID) && !isIsland(m, tx + i, ty + j)) near = true;
      }
      if (near) band[ty * m.w + tx] = 1;
    }
  // floral-clock medallion at the room centre (big rooms)
  const mcx = Math.floor(pw / 2), mcy = Math.floor(ph / 2) + 8;
  const MR = m.w > 26 ? 38 : 0;

  // soil patches where tiles have been lifted
  const soil = new Uint8Array(pw * ph);
  const nSoil = Math.max(2, Math.round(floorTiles / 60));
  for (let k = 0; k < nSoil; k++) {
    for (let tries = 0; tries < 20; tries++) {
      const tx = rng.int(1, m.w - 2), ty = rng.int(1, m.h - 2);
      if (m.get(tx, ty) !== T.FLOOR) continue;
      const cx = tx * TS + rng.int(2, 13), cy = ty * TS + rng.int(2, 13);
      if (K.pd[cy * pw + cx] < 18) continue;
      if (MR && Math.hypot(cx - mcx, cy - mcy) < MR + 12) continue;
      const r = rng.range(4.5, 11);
      const R = Math.ceil(r + 4);
      for (let y = cy - R; y <= cy + R; y++)
        for (let x = cx - R; x <= cx + R; x++) {
          if (x < 0 || y < 0 || x >= pw || y >= ph) continue;
          const d = Math.hypot(x - cx, (y - cy) * 1.25) + (fbm2(x * 0.3, y * 0.3, seed + 70 + k, 2) - 0.5) * 7;
          const i = y * pw + x;
          if (d < r) soil[i] = 2;
          else if (d < r + 2.2 && soil[i] < 1) soil[i] = 1;
        }
      break;
    }
  }

  // roots creeping in from the walls
  const root = new Uint8Array(pw * ph);
  const growRoot = (x0: number, y0: number, dir: number, len: number, thick: boolean, depth: number) => {
    let x = x0, y = y0, a = dir;
    for (let s = 0; s < len; s++) {
      const ix = Math.round(x), iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= pw || iy >= ph) return;
      if (!isFloorTile(ix >> 4, iy >> 4)) { if (s > 2) return; }
      else {
        const th = thick && s < len * 0.55 ? 2 : 1;
        root[iy * pw + ix] = Math.max(root[iy * pw + ix], th);
        if (th === 2) {
          const ox = Math.abs(Math.sin(a)) > 0.7 ? 1 : 0, oy = 1 - ox;
          const j = (iy + oy) * pw + ix + ox;
          if (iy + oy < ph && ix + ox < pw) root[j] = Math.max(root[j], 2);
        }
      }
      if (depth < 2 && rng.chance(0.07)) growRoot(x, y, a + rng.sign() * rng.range(0.6, 1.1), rng.int(4, 12), false, depth + 1);
      a += rng.range(-0.38, 0.38);
      x += Math.cos(a); y += Math.sin(a);
    }
  };
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (m.get(tx, ty) !== T.FLOOR || exitFloor(m, tx, ty)) continue;
      const wN = c.wallish(tx, ty - 1) && !exitFloor(m, tx, ty - 1);
      const wW = c.wallish(tx - 1, ty), wE = c.wallish(tx + 1, ty);
      if (wN && rng.chance(0.2)) growRoot(tx * TS + rng.int(1, 14), ty * TS, Math.PI / 2 + rng.range(-0.7, 0.7), rng.int(12, 38), rng.chance(0.6), 0);
      if (wW && rng.chance(0.16)) growRoot(tx * TS, ty * TS + rng.int(1, 14), rng.range(-0.6, 0.6), rng.int(10, 30), rng.chance(0.5), 0);
      if (wE && rng.chance(0.16)) growRoot(tx * TS + 15, ty * TS + rng.int(1, 14), Math.PI + rng.range(-0.6, 0.6), rng.int(10, 30), rng.chance(0.5), 0);
    }

  // moss field: clumps hugging the walls and pond copings, seeded into lifted soil
  const moss = new Float32Array(pw * ph).fill(-1);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      if (!isFloorTile(x >> 4, y >> 4)) continue;
      const i = y * pw + x;
      const prox = Math.max(0, 1 - K.wd[i] / 26) * 0.48 + Math.max(0, 1 - K.pd[i] / 14) * 0.3;
      const n = fbm2(x * 0.075, y * 0.075, seed + 101, 3);
      const isl = Math.max(0, fbm2(x * 0.028, y * 0.028, seed + 303, 2) - 0.63) * 2.4;
      moss[i] = n * 0.95 + prox + isl - 0.86 + (soil[i] ? 0.14 : 0);
    }
  const M = (x: number, y: number) => x >= 0 && y >= 0 && x < pw && y < ph && moss[y * pw + x] > 0;

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const tx = x >> 4, ty = y >> 4;
      if (!isFloorTile(tx, ty)) continue;
      const i = y * pw + x;
      let col: RGB;
      let grout = false;
      // ── base: band / medallion / harlequin mosaic ──
      const dm = MR ? Math.hypot(x - mcx, y - mcy) : 99;
      if (band[ty * m.w + tx]) {
        // larger dark quarry tiles, 8x8, with a cream fillet on the room side
        const lx = x & 7, ly = y & 7;
        const h = hash2(x >> 3, y >> 3, seed + 41);
        if (lx === 7 || ly === 7) { col = GROUT; grout = true; }
        else {
          let L = h < 0.3 ? 1 : h < 0.85 ? 2 : 3;
          if (lx === 0 || ly === 0) L = Math.min(3, L + 1);
          if (lx === 6 || ly === 6) L = Math.max(0, L - 1);
          col = R_BAND[L];
          if (h > 0.6 && lx > 1 && lx < 5 && ly > 1 && ly < 5 && ((lx + ly) & 1) === 0) col = R_TERRA[1];
        }
      } else if (dm < MR + 1.5) {
        const r = medallion(x, y, mcx, mcy, MR, seed);
        col = r.c; grout = r.grout;
      } else {
        const wear = clamp((fbm2(x * 0.022, y * 0.022, seed + 400, 3) - 0.5) * 4.5, 0, 1);
        const r = mosaic(x, y, seed, wear);
        col = r.c; grout = r.grout;
      }
      // fillet: thin cream line where the band meets the mosaic
      if (!band[ty * m.w + tx]) {
        const lx = x & 15, ly = y & 15;
        if ((lx === 0 && band[ty * m.w + tx - 1]) || (lx === 15 && band[ty * m.w + tx + 1]) || (ly === 0 && band[(ty - 1) * m.w + tx]) || (ly === 15 && band[(ty + 1) * m.w + tx]))
          col = R_CREAM[(x + y) & 1 ? 1 : 2];
      }
      // ── lifted tiles / soil ──
      const s = soil[i];
      if (s === 2) {
        const n = fbm2(x * 0.45, y * 0.45, seed + 3, 2);
        col = n > 0.62 ? SOIL[2] : n > 0.38 ? SOIL[1] : SOIL[0];
        const h = hash2(x, y, seed + 17);
        if (h > 0.985) col = C('K6');
        else if (h > 0.975) col = C('G3');
      } else if (s === 1) {
        col = grout ? SOIL[0] : dk(col, 0.4);
      }
      // ── moss: defined clumps, lit on the upper-left rim, shadowed lower-right; creeps along grout first ──
      const mv = moss[i];
      if (grout && mv > -0.12) col = mv > -0.05 ? MOSS[1] : GROUT_MOSS;
      if (mv > 0) {
        // chunky 2x2 tufts: lit corner, shadowed corner
        let L = 1;
        const bx = (x + ((y >> 1) & 1)) >> 1, by = y >> 1;
        if (hash2(bx, by, seed + 202) > 0.62) {
          const lx = (x + ((y >> 1) & 1)) & 1, ly = y & 1;
          L = lx === 0 && ly === 0 ? 3 : lx === 1 && ly === 1 ? 0 : 2;
        }
        if (!M(x - 1, y - 1) || !M(x, y - 1)) L = 3;
        if (!M(x + 1, y + 1) || !M(x, y + 1)) L = 0;
        if (L === 3 && hash2(x, y, seed + 23) > 0.97) L = 4;
        col = MOSS[L];
      } else if (M(x - 1, y - 1) && M(x, y - 1)) col = dk(col, 0.3);
      // ── roots ──
      const rt = root[i];
      if (rt) {
        const above = y > 0 ? root[i - pw] : 0;
        col = C(above ? 'B0' : rt === 2 ? 'B2' : 'B1');
        if (rt === 2 && above && y > 1 && !root[i - pw * 2]) col = C('B1');
      } else if (y > 0 && root[i - pw]) col = dk(col, 0.38);
      // ── ambient occlusion ──
      col = ao(col, x, y, i, aoTop, c);
      pb.set(x, y, col);
    }
  }

  // ── fallen petals, copper leaves and glass grit ──
  const nPet = Math.round(floorTiles * 0.55);
  for (let k = 0; k < nPet; k++) {
    const x = rng.int(0, pw - 1), y = rng.int(0, ph - 1);
    if (!isFloorTile(x >> 4, y >> 4) || m.get(x >> 4, y >> 4) === T.BLOCK) continue;
    const i = y * pw + x;
    const prox = Math.max(0, 1 - K.wd[i] / 40);
    if (!rng.chance(0.2 + prox * 0.7)) continue;
    const r = rng.next();
    if (r < 0.45) {
      // parchment petal (2px) with a cool shadow
      const vert = rng.chance(0.4);
      put(pb, c, x, y, 'K9'); put(pb, c, x + (vert ? 0 : 1), y + (vert ? 1 : 0), rng.chance(0.5) ? 'K8' : 'K10');
      put(pb, c, x + (vert ? 1 : 0), y + (vert ? 1 : 1), 'K5');
    } else if (r < 0.75) {
      // copper leaf
      const f = rng.sign();
      put(pb, c, x, y, 'B3'); put(pb, c, x + f, y, 'B2'); put(pb, c, x + f * 2, y + 1, 'B1');
      if (rng.chance(0.4)) put(pb, c, x + f, y + 1, 'T3');
    } else if (r < 0.92) {
      // green leaf
      put(pb, c, x, y, 'G3'); put(pb, c, x + 1, y, 'G2'); put(pb, c, x + 1, y + 1, 'G1');
    } else {
      // glass grit glint from a cracked pane above
      put(pb, c, x, y, 'U4');
    }
  }
}

/** encaustic trellis tiles: 8px diamonds; a cream lattice with terracotta knots frames fields of teal or fern glaze */
function mosaic(x: number, y: number, seed: number, wear = 0): { c: RGB; grout: boolean } {
  const u = x + y + 4, v = x - y + 8192;
  const iu = u >> 3, iv = v >> 3, lu = u & 7, lv = v & 7;
  if (lu === 0 || lv === 0) return { c: GROUT, grout: true };
  const a = ((iu % 4) + 4) % 4, b = ((iv % 4) + 4) % 4;
  const h = hash2(iu, iv, seed + 5);
  let ramp: RGB[];
  const lattice = a === 0 || b === 0;
  if (a === 0 && b === 0) ramp = R_TERRA;
  else if (lattice) ramp = R_CREAM;
  else ramp = hash2(iu >> 2, iv >> 2, seed + 4) > 0.68 ? R_FERN : R_TEAL;
  let L = 1;
  // bevel + glaze glint only on the raised lattice; the field tiles stay flat and quiet
  if (lattice && lu === 1) L = 2;
  if (lattice && lu === 1 && lv === 6 && h > 0.5) L = 3;
  if (!lattice && lu === 1 && lv === 6 && h > 0.8) L = 2;
  // worn / cracked / missing tiles — more of them where foot traffic and damp have eaten the glaze
  const hw = hash2(iu, iv, seed + 6);
  if (hw < wear * 0.16) return { c: (lu + lv) % 5 === 0 ? SOIL[2] : lu < 3 ? SOIL[0] : SOIL[1], grout: true };
  if (hw < wear * 0.85) L = Math.max(0, L - 1);
  if (h < 0.1) L = Math.max(0, L - 1);
  if (h > 0.95 && lu === lv && lu > 1) L = 0;
  return { c: ramp[L], grout: false };
}

/** floral clock inlaid in fine tesserae: copper bezel, twelve petals, hands stopped at 11:59 */
function medallion(x: number, y: number, cx: number, cy: number, R: number, seed: number): { c: RGB; grout: boolean } {
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
  const r = Math.hypot(dx, dy);
  if (r > R + 0.5) return mosaic(x, y, seed);
  const a = Math.atan2(dy, dx);
  let k: string;
  if (r > R - 1) k = 'B1';
  else if (r > R - 3) k = dx + dy < -R * 0.4 ? 'B3' : 'B2';
  else if (r > R - 4) k = 'K2';
  else if (r > R - 9) {
    const hr = Math.round((a / TAU) * 12);
    const da = Math.abs(a - (hr / 12) * TAU) * r;
    const major = ((hr % 3) + 3) % 3 === 0;
    k = da < (major ? 1.6 : 0.8) && r < R - 4.5 ? (major ? 'B3' : 'B2') : 'K6';
  } else if (r > R - 10) k = 'K2';
  else {
    const RI = R - 10;
    const hand = (ang: number, len: number, w: number) => {
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const t = dx * ux + dy * uy;
      if (t < -2 || t > len) return false;
      return Math.abs(dx * uy - dy * ux) < w * (1 - Math.max(0, t) / (len * 1.15));
    };
    const lobeA = ((a + TAU / 24 + TAU) % TAU) / (TAU / 12);
    const lobe = Math.floor(lobeA);
    const petal = RI * (0.42 + 0.58 * Math.pow(Math.abs(Math.cos(a * 6)), 0.6));
    if (hand(-Math.PI / 2 - TAU / 60, RI - 2, 1.4) || hand(-Math.PI / 2 - TAU / 720, RI * 0.58, 2.2)) k = 'B4';
    else if (r < 2.5) k = 'B4';
    else if (r < 5) k = 'B2';
    else if (r < petal) {
      const verd = lobe & 1;
      if (petal - r < 1.1) k = verd ? 'T1' : 'K5';
      else if (r > petal * 0.72) k = verd ? 'T3' : 'K8';
      else k = verd ? 'T2' : 'K7';
    } else k = r < 6.5 ? 'K2' : 'U1';
  }
  let col = C(k);
  // tesserae: a faint 3px grout grid in running bond
  const row = Math.floor(y / 3);
  if (y % 3 === 0 || (x + (row & 1 ? 1 : 0)) % 3 === 0) col = dk(col, 0.18);
  else if (hash2(x, y, seed + 9) > 0.93) col = dk(col, -0.08);
  return { c: col, grout: false };
}

function ao(col: RGB, x: number, y: number, i: number, aoTop: Int16Array, c: PaintCtx): RGB {
  const a = aoTop[i];
  let dark = 0;
  if (a <= 3) dark = 3; else if (a <= 7) dark = 2; else if (a <= 12) dark = bayer(x, y) < 0.6 ? 1 : 0; else if (a <= 16) dark = bayer(x, y) < 0.25 ? 1 : 0;
  const ty = y >> 4;
  if (c.wallish((x - 3) >> 4, ty) || c.wallish((x + 3) >> 4, ty)) dark = Math.max(dark, 1);
  return dark ? dk(col, dark * 0.14) : col;
}

function put(pb: PixelBuf, c: PaintCtx, x: number, y: number, k: string) {
  const { m } = c;
  if (x < 0 || y < 0 || x >= m.pw || y >= m.ph) return;
  const t = m.get(x >> 4, y >> 4);
  if (t !== T.FLOOR && t !== T.BLOCK && !exitFloor(m, x >> 4, y >> 4)) return;
  pb.set(x, y, ao(C(k), x, y, y * m.pw + x, c.aoTop, c));
}

// ───────────────────────────── ponds ─────────────────────────────

/** connected pit regions */
export function pondRegions(m: RoomMap): { tiles: number[]; x0: number; y0: number; x1: number; y1: number }[] {
  const seen = new Uint8Array(m.w * m.h);
  const out: { tiles: number[]; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      const i0 = ty * m.w + tx;
      if (seen[i0] || m.get(tx, ty) !== T.PIT) continue;
      const st = [i0];
      seen[i0] = 1;
      const reg = { tiles: [] as number[], x0: tx, y0: ty, x1: tx, y1: ty };
      while (st.length) {
        const i = st.pop()!;
        reg.tiles.push(i);
        const x = i % m.w, y = (i / m.w) | 0;
        reg.x0 = Math.min(reg.x0, x); reg.x1 = Math.max(reg.x1, x); reg.y0 = Math.min(reg.y0, y); reg.y1 = Math.max(reg.y1, y);
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ax, ny = y + ay;
          const j = ny * m.w + nx;
          if (m.get(nx, ny) === T.PIT && !seen[j]) { seen[j] = 1; st.push(j); }
        }
      }
      out.push(reg);
    }
  return out;
}

/** pixel is open water (not coping / basin wall) */
export function pondWater(m: RoomMap, x: number, y: number) {
  const tx = x >> 4, ty = y >> 4;
  if (m.get(tx, ty) !== T.PIT) return false;
  const px = x & 15, py = y & 15;
  if (m.get(tx, ty - 1) !== T.PIT && py < 8) return false;
  if (m.get(tx - 1, ty) !== T.PIT && px < 2) return false;
  if (m.get(tx + 1, ty) !== T.PIT && px > 13) return false;
  if (m.get(tx, ty + 1) !== T.PIT && py > 13) return false;
  return true;
}

function paintPits(pb: PixelBuf, c: PaintCtx) {
  const { m, seed } = c;
  const K = getCache(c);
  const rng = new RNG(seed * 13 + 77);
  const water = ['K0', 'U0', 'U1', 'U2', 'T0'].map(C);
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (m.get(tx, ty) !== T.PIT) continue;
      const nTop = m.get(tx, ty - 1) !== T.PIT, nL = m.get(tx - 1, ty) !== T.PIT, nR = m.get(tx + 1, ty) !== T.PIT, nB = m.get(tx, ty + 1) !== T.PIT;
      // depth below the far rim (for the basin shadow)
      for (let py = 0; py < TS; py++)
        for (let px = 0; px < TS; px++) {
          const x = tx * TS + px, y = ty * TS + py;
          let col: RGB;
          // water
          const n = fbm2(x * 0.05, y * 0.2, seed + 31, 2);
          const ripple = fbm2(x * 0.11, y * 0.5, seed + 32, 2);
          let L = n > 0.62 ? 2 : 1;
          if (fbm2(x * 0.04, y * 0.04, seed + 33, 2) > 0.6) L = 4; // algae bloom
          if (ripple > 0.66 && ripple < 0.69) L = 3;
          col = water[L];
          // the far basin wall shades the water just below it
          const fromTop = nTop ? py - 8 : 99;
          if (fromTop >= 0 && fromTop < 3) col = water[fromTop === 2 && bayer(x, y) < 0.5 ? 1 : 0];
          if (nTop && py < 8) {
            // coping stone + mossy basin wall seen across the water
            if (py === 0) col = C('K7');
            else if (py === 1) col = C('K6');
            else if (py === 2) col = C('K4');
            else {
              const course = py < 5 ? 0 : 1;
              const off = course ? 4 : 0;
              const joint = (x + off) % 8 === 7 || py === 5;
              col = joint ? C('K1') : C(py < 4 ? 'K4' : py < 6 ? 'K3' : 'K2');
              const mo = fbm2(x * 0.2, y * 0.3, seed + 34, 2);
              if (!joint && mo > 0.58) col = C(py > 5 ? 'T0' : 'G1');
              if (py === 7) col = C('K1');
            }
            if (py === 0 && hash2(x, y, seed + 35) > 0.8) col = C('K8');
          }
          // side and near coping
          if (nL && px < 2 && !(nTop && py < 2)) col = C(px === 0 ? 'K6' : 'K3');
          if (nR && px > 13 && !(nTop && py < 2)) col = C(px === 15 ? 'K5' : 'K2');
          if (nB && py > 13) col = C(py === 14 ? 'K6' : 'K5');
          if (nB && py === 15 && hash2(x, y, seed + 36) > 0.7) col = C('K4');
          // moss creeping over the coping
          if (!pondWater(m, x, y) && !(nTop && py >= 2 && py < 8)) {
            const mo = fbm2(x * 0.09, y * 0.09, seed + 101, 3) + 0.08;
            if (mo > 0.64) col = C(mo > 0.7 ? 'G2' : 'G1');
          }
          pb.set(x, y, col);
        }
    }
  // lily pads and blossoms floating on open water
  for (const reg of pondRegions(m)) {
    const nPads = Math.round(reg.tiles.length * rng.range(0.7, 1.3));
    for (let k = 0; k < nPads; k++) {
      const ti = rng.pick(reg.tiles);
      const tx = ti % m.w, ty = (ti / m.w) | 0;
      const cx = tx * TS + rng.int(3, 12), cy = ty * TS + rng.int(4, 12);
      const r = rng.range(2.2, 4.4);
      if (!pondWater(m, cx, cy)) continue;
      lilyPad(pb, m, cx, cy, r, rng.range(0, TAU), rng.chance(0.3));
    }
  }
  K.snap = new Uint8ClampedArray(pb.data);
}

function lilyPad(pb: PixelBuf, m: RoomMap, cx: number, cy: number, r: number, notch: number, bloom: boolean) {
  const ry = r * 0.7;
  const R = Math.ceil(r) + 1;
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = (x * x) / (r * r) + (y * y) / (ry * ry);
      const px = cx + x, py = cy + y;
      if (!pondWater(m, px, py)) continue;
      if (d > 1) {
        // shadow on the water to the lower right
        const d2 = ((x - 1) * (x - 1)) / (r * r) + ((y - 1) * (y - 1)) / (ry * ry);
        if (d2 <= 1) pb.set(px, py, C('K0'));
        continue;
      }
      const a = Math.atan2(y / ry, x / r);
      let da = Math.abs(a - notch) % TAU;
      if (da > Math.PI) da = TAU - da;
      if (da < 0.38 && d > 0.08) continue;
      let k = 'G2';
      if (d > 0.62) k = x + y < 0 ? 'G3' : 'G1';
      else if ((x === 0 || y === 0) && d > 0.15) k = 'G1';
      pb.set(px, py, C(k));
    }
  if (bloom) {
    pb.set(cx, cy - 1, C('K10')); pb.set(cx - 1, cy, C('K9')); pb.set(cx + 1, cy, C('K8')); pb.set(cx, cy, C('B4'));
    pb.set(cx, cy + 1, C('K7'));
  }
}

// ───────────────────────────── generator floor props, re-dressed ─────────────────────────────

function paintDressing(pb: PixelBuf, c: PaintCtx) {
  const { m, seed } = c;
  const K = getCache(c);
  const rng = new RNG(seed * 17 + 5);
  for (const p of m.props) {
    if (p.type !== 'puddle' && p.type !== 'debris' && p.type !== 'cogpile') continue;
    const bx = p.tx * TS + 8, by = p.ty * TS + 8;
    // restore what the default prop painter covered
    if (K.snap) {
      for (let y = by - 8; y <= by + 8; y++)
        for (let x = bx - 12; x <= bx + 12; x++) {
          if (x < 0 || y < 0 || x >= m.pw || y >= m.ph) continue;
          const i = (y * m.pw + x) * 4;
          pb.data[i] = K.snap[i]; pb.data[i + 1] = K.snap[i + 1]; pb.data[i + 2] = K.snap[i + 2]; pb.data[i + 3] = K.snap[i + 3];
        }
    }
    if (p.type === 'puddle') {
      // rain that found a cracked pane: shallow puddle with a moonlit mullion reflection
      const rx = rng.int(5, 8), ry = rng.int(2, 3);
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) {
          const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
          if (d > 1) continue;
          let k = d > 0.6 ? 'U0' : 'U1';
          if (y === -ry + 1 && x > -rx / 2 && x < rx / 3) k = 'U3';
          if (x === 1 && y > -ry && y < ry) k = 'K1';
          put(pb, c, bx + x, by + y, k);
        }
    } else if (p.type === 'debris') {
      // a toppled seedling pot: terracotta shards, spilled soil, a few leaves
      for (let i = 0; i < 9; i++) {
        const x = bx + rng.int(-5, 5), y = by + rng.int(-2, 3);
        put(pb, c, x, y, rng.pick(['B0', 'K1', 'B0', 'S0']));
      }
      for (let i = 0; i < 3; i++) {
        const x = bx + rng.int(-6, 6), y = by + rng.int(-4, 4);
        put(pb, c, x, y, 'B2'); put(pb, c, x + 1, y, 'B1'); put(pb, c, x, y - 1, 'B3');
      }
      for (let i = 0; i < 3; i++) { const x = bx + rng.int(-6, 6), y = by + rng.int(-4, 4); put(pb, c, x, y, 'G3'); put(pb, c, x + 1, y, 'G2'); }
    } else {
      // drift of fallen copper leaves and parchment petals
      for (let i = 0; i < 10; i++) {
        const x = bx + rng.int(-7, 7), y = by + rng.int(-4, 4);
        if (rng.chance(0.55)) { put(pb, c, x, y, 'B3'); put(pb, c, x + 1, y, 'B2'); if (rng.chance(0.5)) put(pb, c, x + 1, y + 1, 'T3'); }
        else { put(pb, c, x, y, 'K9'); put(pb, c, x + 1, y, 'K8'); put(pb, c, x, y + 1, 'K5'); }
      }
    }
  }
}

// ───────────────────────────── walls ─────────────────────────────

const ivyKey = (x: number, ty: number, py: number) => (ty * 8192 + x) * 64 + py;

function buildIvy(c: PaintCtx): Map<number, RGB> {
  const { m, seed } = c;
  const ivy = new Map<number, RGB>();
  const rng = new RNG(seed * 31 + 7);
  const leaf = (x: number, ty: number, py: number, glint: boolean) => {
    const set = (xx: number, yy: number, k: string) => { if (yy >= 0 && yy < 32) ivy.set(ivyKey(xx, ty, yy), C(k)); };
    set(x, py - 1, 'G3'); set(x - 1, py, 'G3'); set(x, py, 'G2'); set(x + 1, py, 'G2'); set(x, py + 1, 'G1');
    if (glint) set(x - 1, py - 1, 'G4');
  };
  const stem = (x: number, ty: number, py: number) => { if (!ivy.has(ivyKey(x, ty, py))) ivy.set(ivyKey(x, ty, py), C('G0')); };
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (!tallInteriorFace(m, tx, ty)) continue;
      const island = isIsland(m, tx, ty);
      // climbing ivy from the plinth
      if (rng.chance(island ? 0.25 : 0.38)) {
        let x = tx * TS + rng.int(2, 13), py = 31;
        const top = rng.int(island ? 12 : 6, 22);
        let side = rng.sign();
        while (py > top) {
          stem(x, ty, py);
          if ((py & 1) === 0 && rng.chance(0.75)) { leaf(x + side * 2, ty, py, rng.chance(0.12)); side = -side; }
          py--;
          if (rng.chance(0.3)) x += rng.sign();
        }
        leaf(x, ty, py, rng.chance(0.3));
      }
      // tendrils hanging from the rail (planters spill over their rim)
      if (rng.chance(island ? 0.8 : 0.3)) {
        let x = tx * TS + rng.int(1, 14), py = island ? 2 : 3;
        const bottom = rng.int(island ? 8 : 6, island ? 18 : 14);
        while (py < bottom) {
          stem(x, ty, py);
          if (rng.chance(0.5)) leaf(x + rng.sign(), ty, py, rng.chance(0.1));
          py++;
          if (rng.chance(0.2)) x += rng.sign();
        }
        leaf(x, ty, py, false);
      }
    }
  return ivy;
}

function paintFace(pb: PixelBuf, c: PaintCtx, tx: number, ty: number, oy: number, H: number, exterior: boolean) {
  const { m, seed } = c;
  const K = getCache(c);
  K.ivy ??= buildIvy(c);
  const island = isIsland(m, tx, ty);
  const feat = m.props.find((p) => p.tx === tx && p.ty === ty && (p.type === 'pipe' || p.type === 'window'));
  const turnW = !c.wallish(tx - 1, ty);
  const turnE = !c.wallish(tx + 1, ty);
  const ox = tx * TS;
  const column = !exterior && !island && H === 32 && tx % 5 === 2;
  const moon = !exterior && H === 32 && tx === K.moonTx && ty === K.moonTy;
  const stained = feat?.type === 'window' && !exterior && H === 32 && !island;
  for (let py = 0; py < H; py++)
    for (let px = 0; px < TS; px++) {
      const x = ox + px;
      let col: RGB;
      if (H !== 32) col = lowFace(x, py, ty, seed);
      else if (island) col = planterFace(x, px, py, ty, seed);
      else col = glassFace(x, px, py, ty, seed, column, moon, stained, tx);
      if (!exterior && H === 32) {
        const iv = K.ivy.get(ivyKey(x, ty, py));
        if (iv && !(py === 0)) col = iv;
      }
      if ((turnW && px === 0) || (turnE && px === 15)) col = dk(col, 0.3);
      if (exterior) col = dk(col, 0.5);
      pb.set(x, oy + py, col);
    }
  if (feat?.type === 'pipe' && !exterior && H === 32 && !island) {
    // copper irrigation pipe along the plinth with a little valve wheel
    const y0 = oy + 24;
    for (let px = 0; px < TS; px++) {
      const x = ox + px;
      pb.set(x, y0, C('B4')); pb.set(x, y0 + 1, C('B3')); pb.set(x, y0 + 2, C('B1'));
      if (hash2(x, ty, seed + 3) > 0.7) pb.set(x, y0 + 1, C('T3'));
      if (hash2(x, ty, seed + 4) > 0.8) pb.set(x, y0 + 2, C('T2'));
    }
    const vx = ox + 7;
    for (const [dx, dy, k] of [[0, -3, 'B3'], [-1, -2, 'B4'], [1, -2, 'B2'], [0, -2, 'K1'], [0, -1, 'B2']] as [number, number, string][]) pb.set(vx + dx, y0 + dy, C(k));
  }
}

function lowFace(x: number, py: number, ty: number, seed: number): RGB {
  if (py === 0) return C('T3');
  if (py === 1) return C(hash2(x, ty, seed + 1) > 0.75 ? 'T2' : 'B2');
  if (py === 2) return C('B1');
  if (py === 7) return C('K2');
  if ((x + (py > 4 ? 4 : 0)) % 8 === 7) return C('K3');
  return C(py === 3 ? 'K6' : hash2(x >> 3, ty, seed + 2) > 0.5 ? 'K5' : 'K4');
}

/** greenhouse wall: copper rail, glazing with night sky, stone sill and ashlar plinth */
function glassFace(x: number, px: number, py: number, ty: number, seed: number, column: boolean, moon: boolean, stained: boolean, tx: number): RGB {
  // top rail
  if (py === 0) return C('T3');
  if (py === 1) return C(hash2(x, ty, seed + 1) > 0.7 ? 'T2' : 'B2');
  if (py === 2) return C('B1');
  // sill
  if (py === 20) return C(column && px >= 5 && px <= 10 ? 'K6' : 'K7');
  if (py === 21) return C('K5');
  if (py === 22) return C('K2');
  // plinth
  if (py >= 23) {
    if (py === 31) return C('K2');
    if (column && px >= 5 && px <= 10) {
      // column base block
      return C(px === 5 ? 'K6' : px === 10 ? 'K3' : py === 23 ? 'K6' : 'K4');
    }
    const course = py < 27 ? 0 : 1;
    if (py === 27) return C('K3');
    const off = course ? 4 : 0;
    const bx = Math.floor((x + off) / 8), lx = (x + off) % 8;
    if (lx === 7) return C('K3');
    const h = hash2(bx, course + ty * 4, seed + 13);
    let L = h > 0.66 ? 2 : h > 0.25 ? 1 : 0;
    if (py === 23 || py === 28) L++;
    if (lx === 0) L = Math.min(3, L + 1);
    let col = C(['K3', 'K4', 'K5', 'K6'][clamp(L, 0, 3)]);
    // damp: algae stains creeping up from the floor
    const st = fbm2(x * 0.15, py * 0.3 + ty * 7, seed + 14, 2) + (py - 23) * 0.03;
    if (st > 0.66) col = C(st > 0.74 ? 'G1' : 'T1');
    if (hash2(x, py + ty * 64, seed + 15) > 0.96) col = C('K3');
    return col;
  }
  // structural column across the glazing
  if (column && px >= 6 && px <= 9) {
    if (py === 3 || py === 4) return C(px === 6 ? 'T4' : px === 9 ? 'T1' : 'T3');
    if (py === 11 || py === 17) return C(px === 6 ? 'B4' : 'B2');
    return C(['T4', 'T3', 'T2', 'T1'][px - 6]);
  }
  if (column && (px === 5 || px === 10) && py === 3) return C('T2');
  // glazing bars
  const mull = px === 0 || px === 8;
  const transom = py === 8;
  if (mull || transom) {
    if (mull && transom) return C('B3');
    if (py === 3 && mull) return C('T3');
    return C(hash2(x, py + ty * 64, seed + 6) > 0.85 ? 'B2' : 'T2');
  }
  // arched top corners on the upper lights
  if (py === 3 && (px === 1 || px === 7 || px === 9 || px === 15)) return C('T1');
  // stained glass (generator 'window' hint): leaded diamond quarries in amber, moss green and garnet
  if (stained && py >= 3 && py <= 19) {
    const lx = px & 7;
    if (py < 8) return C(py === 3 ? 'K1' : lx === 4 && py === 5 ? 'O3' : (lx + py) % 3 === 0 ? 'O1' : 'O2');
    const u = (lx + py + 1) & 3, v = (lx - py + 64) & 3;
    if (u === 0 || v === 0) return C('K1');
    const q = hash2((lx + py) >> 2, ((lx - py + 64) >> 2) + tx * 7, seed + 16);
    const lit = u === 1 || v === 3;
    if (q < 0.45) return C(lit ? 'B4' : 'B3');
    if (q < 0.78) return C(lit ? 'G3' : 'G2');
    return C(lit ? 'R3' : 'R2');
  }
  // night sky through the glass: moon-haze at the top, deep blue below
  const t = (py - 3) / 16;
  const lvl = 2.6 - t * 2.4 + (fbm2(x * 0.06, py * 0.1 + ty, seed + 7, 2) - 0.5) * 0.9;
  const sky = ['K1', 'U0', 'U1', 'U2'];
  const li = clamp(Math.floor(lvl + bayer(x, py) * 0.999 - 0.5), 0, 3);
  let col = C(sky[li]);
  // stars
  if (li >= 1 && hash2(x, py + ty * 64, seed + 8) > 0.988) col = C(hash2(x, py, seed + 9) > 0.5 ? 'K8' : 'U4');
  // the moon, glimpsed through one bay
  if (moon) {
    const mx = tx * TS + 11, my = 7;
    const d = Math.hypot(x - mx, py - my);
    if (d < 4.6) {
      const shade = (x - mx) + (py - my) > 2.5 ? 'K8' : 'K10';
      col = C(d > 3.7 ? 'K9' : shade);
      if (d < 2.2 && hash2(x, py, 3) > 0.6) col = C('K8');
    } else if (d < 6.5 && li < 3) col = C('U2');
  }
  // foliage outside pressed against the lower panes
  const f = fbm2(x * 0.18, py * 0.22 + ty * 3, seed + 10, 2) + (py - 12) * 0.045;
  if (f > 0.72) col = C(f > 0.8 ? 'K1' : 'G0');
  // inner pane edges: depth below the bars, a cold reflection streak
  if (py === 9 || py === 4) col = dk(col, 0.35);
  if (((x - py + 64) % 13 === 0 || (x - py + 64) % 13 === 1) && hash2(x >> 3, ty, seed + 11) > 0.45 && li < 3) col = C(li >= 2 ? 'U4' : 'U2');
  // a few cracked panes
  if (hash2(x >> 3, (py > 8 ? 1 : 0) + ty * 2, seed + 12) > 0.93) {
    const lx = px & 7;
    if (lx === ((py * 3) % 7) + 1) col = C('U4');
  }
  return col;
}

/** free-standing raised planter bed: copper rim, brick body with banding, moss foot */
function planterFace(x: number, px: number, py: number, ty: number, seed: number): RGB {
  if (py === 0) return C('B3');
  if (py === 1) return C('B2');
  if (py === 2) return C('B0');
  // foliage spilling over the rim
  const spill = fbm2(x * 0.25, ty * 5, seed + 50, 2);
  const depth = Math.floor(spill * 14) - 3;
  if (py >= 3 && py < 3 + depth) {
    const h = hash2(x, py + ty * 64, seed + 51);
    return C(py === 2 + depth ? 'G1' : h > 0.85 ? 'G3' : h > 0.4 ? 'G2' : 'G1');
  }
  if (py === 16) return C('T2');
  if (py === 17) return C('T0');
  if (py === 31) return C('K2');
  // brick courses (warm terracotta brick, unlike the cold stone of the glasshouse plinth)
  const by = py >= 18 ? py - 18 : py - 3;
  const course = Math.floor(by / 4) + (py >= 18 ? 10 : 0);
  const cy = by % 4;
  const off = course % 2 ? 4 : 0;
  const bxi = Math.floor((x + off) / 8), cx = (x + off) % 8;
  if (cy === 3 || cx === 7) return C('K2');
  const h = hash2(bxi, course + ty * 8, seed + 52);
  let L = h > 0.6 ? 2 : h > 0.2 ? 1 : 0;
  if (cy === 0) L++;
  let col = C(['K2', 'R0', 'B0', 'B1'][clamp(L, 0, 3)]);
  const st = fbm2(x * 0.2, py * 0.25 + ty * 7, seed + 53, 2) + (py - 20) * 0.025;
  if (py > 20 && st > 0.62) col = C(st > 0.7 ? 'G1' : 'G0');
  void px;
  return col;
}

function paintCap(pb: PixelBuf, c: PaintCtx, tx: number, ty: number, oy: number) {
  const { m, seed } = c;
  const nN = c.wallish(tx, ty - 1), nS = c.wallish(tx, ty + 1), nW = c.wallish(tx - 1, ty), nE = c.wallish(tx + 1, ty);
  const vN = m.get(tx, ty - 1) === T.VOID, vW = m.get(tx - 1, ty) === T.VOID, vE = m.get(tx + 1, ty) === T.VOID;
  const island = isIsland(m, tx, ty);
  for (let py = 0; py < TS; py++)
    for (let px = 0; px < TS; px++) {
      const x = tx * TS + px, y = ty * TS + py;
      let col: RGB;
      if (island) {
        // planter bed seen from above: loam under a tangle of leaf clumps, a few pale blossoms
        const LM = (xx: number, yy: number) => fbm2(xx * 0.2, yy * 0.2, seed + 60, 3) > 0.36;
        if (!LM(x, y)) col = C(hash2(x, y, seed + 62) > 0.85 ? 'B0' : 'K1');
        else {
          const t = fbm2(x * 0.45, y * 0.45, seed + 61, 2);
          let L = t > 0.58 ? 2 : 1;
          if (!LM(x - 1, y - 1) || !LM(x, y - 1)) L = 2;
          if (!LM(x - 1, y - 1) && !LM(x - 1, y)) L = 3;
          if (!LM(x + 1, y + 1) || !LM(x, y + 1)) L = 0;
          col = C(['G0', 'G1', 'G2', 'G3'][L]);
        }
        // blossoms: a 5-px parchment flower in some 8x8 cells
        const fx = (x >> 3) * 8 + 2 + Math.floor(hash2(x >> 3, y >> 3, seed + 64) * 4), fy = (y >> 3) * 8 + 2 + Math.floor(hash2(x >> 3, y >> 3, seed + 65) * 4);
        if (hash2(x >> 3, y >> 3, seed + 63) > 0.72 && LM(fx, fy)) {
          const ddx = x - fx, ddy = y - fy;
          if (ddx === 0 && ddy === 0) col = C('B4');
          else if (Math.abs(ddx) + Math.abs(ddy) === 1) col = C(ddx < 0 || ddy < 0 ? 'K10' : 'K8');
          else if (ddx === 1 && ddy === 1) col = C('G0');
        }
        if (py === 0 && !nN) col = C('B2');
        if (px === 0 && !nW) col = C('B2');
        if (px === 15 && !nE) col = C('B1');
        if (py === 15 && !nS) col = C('B3');
        if (py === 1 && !nN) col = dk(col, 0.4);
      } else {
        // glass roof seen from above: dark panes between verdigris glazing bars
        const bx = x & 15, by = y & 15;
        if (bx === 0 || by === 0) col = C(bx === 0 && by === 0 ? 'T1' : 'T0');
        else {
          const h = hash2(x >> 4, y >> 4, seed + 70);
          col = C(by < 4 && h > 0.4 ? 'U0' : 'K1');
          if ((bx - by + 32) % 19 === 0 && h > 0.6 && by > 2) col = C('U0');
        }
        if (!nN && py === 0) col = C('T3');
        if (!nN && py === 1) col = C('K0');
        if (!nW && px === 0) col = C('T2');
        if (!nE && px === 15) col = C('T1');
        if (!nS && py === 15) col = C('B3');
        if (!nS && py === 14) col = C('T2');
        if (vN && py === 0) col = C('K0');
        if (vW && px === 0) col = C('K0');
        if (vE && px === 15) col = C('K0');
      }
      pb.set(x, oy + py, col);
    }
}

// ═════════════════════════════ decor entities ═════════════════════════════

const px1 = (ctx: Ctx, x: number, y: number, k: string) => { ctx.fillStyle = pcol(k); ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };

/** generator 'walllamp' → a carriage lantern hanging on a short chain from the glazing rail */
class Lantern extends Entity {
  t = frand(0, 10);
  ph = frand(0, TAU);
  constructor(tx: number, ty: number) {
    super();
    this.x = tx * TS + 8;
    this.y = ty * TS - 4;
    this.sortBias = TS + 4.5;
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const sway = Math.sin(this.t * 1.15 + this.ph) * 1.1;
    const top = this.y - 10, hx = Math.round(this.x + sway), hy = this.y - 5;
    for (let i = 0; i < 5; i++) px1(r.w, this.x + (sway * i) / 5, top + i, i & 1 ? 'B1' : 'B3');
    drawSprite(r.w, LANTERN(), hx, hy);
    const fl = 0.86 + Math.sin(this.t * 11 + this.ph) * 0.06 + Math.sin(this.t * 27) * 0.04;
    // warm glass, unlit so it reads as the light source
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        const core = i === 1 && j >= 1;
        px1(r.u, hx - 1 + i, hy + 5 + j, core ? (fl > 0.9 ? 'O4' : 'O3') : j === 0 ? 'O1' : 'O2');
      }
    r.lightAt(hx, hy + 34, 118 * fl, 'O2', 0.62);
    r.lightAt(hx, hy + 6, 24, 'O3', 0.65 * fl);
    r.glowAt(hx, hy + 6, 9, 'O3', 0.3 * fl);
  }
}

/** generator 'candles' → a small lantern standing on the tiles */
class FloorLantern extends Entity {
  t = frand(0, 10);
  constructor(tx: number, ty: number) {
    super();
    this.x = tx * TS + 8; this.y = ty * TS + 12;
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    drawSprite(r.w, FLOOR_LANTERN(), this.x, this.y);
    const fl = 0.86 + Math.sin(this.t * 12) * 0.06 + Math.sin(this.t * 29) * 0.04;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) px1(r.u, this.x - 1 + i, this.y - 6 + j, i === 1 && j >= 1 ? (fl > 0.9 ? 'O4' : 'O3') : j === 0 ? 'O1' : 'O2');
    r.lightAt(this.x, this.y - 2, 70 * fl, 'O2', 0.45);
    r.glowAt(this.x, this.y - 5, 8, 'O3', 0.28 * fl);
  }
}

const FLOWERS: { big?: ReturnType<typeof buildClockFlower>; small?: ReturnType<typeof buildClockFlower> } = {};
/** generator 'wallgear' → a clockwork sunflower whose seed-head is a slowly turning gear */
class ClockFlower extends Entity {
  rot = frand(0, 10);
  constructor(tx: number, ty: number, private big: boolean) {
    super();
    this.x = tx * TS + 8;
    this.y = ty * TS - 5;
    this.sortBias = TS + 3;
  }
  update(dt: number) { this.rot += dt * (this.big ? 1.6 : -2.4); }
  render(r: Renderer) {
    const A = this.big ? (FLOWERS.big ??= buildClockFlower(true)) : (FLOWERS.small ??= buildClockFlower(false));
    drawSprite(r.w, A.stalk, this.x, this.y);
    drawSprite(r.w, A.petals, this.x, this.y);
    const n = A.gear.length;
    drawSprite(r.w, A.gear[((Math.floor(this.rot) % n) + n) % n], this.x, this.y);
  }
}

/** generator 'crate'/'barrel' → breakable cold frame / terracotta urn */
class Planter extends Breakable {
  constructor(private ptx: number, private pty: number, private urn: boolean) {
    super(ptx, pty, urn ? 'barrel' : 'crate');
    this.hp = this.maxHp = urn ? 16 : 20;
  }
  hurt(info: DamageInfo): number {
    if (this.dead) return 0;
    this.hp -= info.amount;
    this.flash = 0.08;
    const a = info.x !== undefined ? Math.atan2(this.y - (info.y ?? 0), this.x - info.x) : 0;
    this.world.fx.hitSparks(this.x, this.y - 8, a, 'normal', 6);
    sfx(this.urn ? 'potHit' : 'woodHit', { vol: 0.6, pan: this.world.pan(this.x) });
    if (this.hp <= 0) this.smash();
    return info.amount;
  }
  smash() {
    if (this.dead) return;
    this.dead = true;
    const w = this.world;
    w.map.set(this.ptx, this.pty, T.FLOOR);
    w.fx.shatter(this, this.urn ? ['B2', 'B1', 'B3', 'T2', 'B0'] : ['B1', 'B2', 'U3', 'G2', 'B0'], 0.8);
    for (let i = 0; i < 10; i++) {
      const ang = frand(0, TAU), sp = frand(20, 70);
      w.particles.spawn({ kind: 'debris', x: this.x, y: this.y - 4, z: frand(2, 10), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6, vz: frand(30, 90), grav: 320, life: frand(0.6, 1.2), ramp: [fpick(['G2', 'G3', 'B0', 'T3'])], size: 1 });
    }
    sfx(this.urn ? 'potBreak' : 'frameBreak', { pan: w.pan(this.x) });
    if (frand() < 0.5) for (let i = 0; i < 2; i++) w.add(new Pickup(this.x, this.y - 4, 'brass', 1));
    if (frand() < 0.08) w.add(new Pickup(this.x, this.y - 4, 'heal', 8));
  }
  render(r: Renderer) {
    drawSprite(r.w, this.urn ? URN() : COLDFRAME(), this.x, this.y, { tint: this.flash > 0 ? '#ffffff' : undefined });
  }
}

// moonlight cookies (light-map pool + additive haze), built once
let POOL: HTMLCanvasElement | null = null, HAZE: HTMLCanvasElement | null = null;
const SHEAR = 0.42, PW = 18, PH = 58, HZ = 30;
function moonCookies() {
  if (POOL && HAZE) return;
  const [r, g, b] = hexToRgb(pcol('K9'));
  const W = PW + Math.ceil(PH * SHEAR) + 4;
  const [pc, pctx] = makeCanvas(W, PH);
  const pid = pctx.createImageData(W, PH);
  for (let y = 0; y < PH; y++)
    for (let x = 0; x < W; x++) {
      const u = x - 2 - y * SHEAR;
      if (u < 0 || u > PW) continue;
      const edge = Math.min(1, Math.min(u, PW - u) / 3.5);
      const fall = y < 10 ? 0.55 + y * 0.045 : Math.max(0, 1 - (y - 10) / (PH - 10));
      let k = edge * fall;
      if (Math.abs(u - PW / 2) < 1.3) k *= 0.3; // mullion shadow
      if (Math.abs(y - 20) < 1.5 || Math.abs(y - 41) < 1.2) k *= 0.35; // transom shadows
      const i = (y * W + x) * 4;
      pid.data[i] = r; pid.data[i + 1] = g; pid.data[i + 2] = b; pid.data[i + 3] = Math.round(255 * k);
    }
  pctx.putImageData(pid, 0, 0);
  POOL = pc;
  // haze: the shaft volume from the glazing down into the pool
  const HH = PH + HZ, HW = W + 14;
  const [hc, hctx] = makeCanvas(HW, HH);
  const hid = hctx.createImageData(HW, HH);
  for (let y = 0; y < HH; y++)
    for (let x = 0; x < HW; x++) {
      const u = x - 2 - (y - HZ) * SHEAR;
      if (u < 0 || u > PW) continue;
      const edge = Math.min(1, Math.min(u, PW - u) / 5);
      const t = y / HH;
      const k = edge * (t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.7)) * 0.9;
      const i = (y * HW + x) * 4;
      hid.data[i] = r; hid.data[i + 1] = g; hid.data[i + 2] = b; hid.data[i + 3] = Math.round(255 * k);
    }
  hctx.putImageData(hid, 0, 0);
  HAZE = hc;
}

/** moonbeam falling through one glazed bay onto the tiles, with drifting motes */
class MoonShaft extends Entity {
  t = frand(0, 20);
  motes: { u: number; v: number; s: number; ph: number }[] = [];
  constructor(tx: number, ty: number, private power: number) {
    super();
    this.x = tx * TS; this.y = (ty + 1) * TS;
    for (let i = 0; i < 7; i++) this.motes.push({ u: frand(2, PW - 2), v: frand(-HZ, PH * 0.8), s: frand(1.5, 4), ph: frand(0, TAU) });
  }
  update(dt: number) {
    this.t += dt;
    for (const m of this.motes) { m.v += m.s * dt; if (m.v > PH * 0.85) m.v = -HZ + frand(0, 6); }
  }
  renderGround(r: Renderer) {
    if (!r.visible(this.x + 20, this.y + 20, 80)) return;
    moonCookies();
    const k = this.power * (0.9 + Math.sin(this.t * 0.45) * 0.08);
    r.l.globalAlpha = Math.min(1, 0.62 * k);
    r.l.drawImage(POOL!, this.x - 2, this.y);
    r.l.globalAlpha = 1;
    const g = r.g;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.07 * k;
    g.drawImage(HAZE!, this.x - 2, this.y - HZ);
    // crisp window-shaped sheen on the tiles (the light map alone is half-res and soft)
    g.globalAlpha = 0.1 * k;
    g.drawImage(POOL!, this.x - 2, this.y);
    g.fillStyle = pcol('K9');
    for (const m of this.motes) {
      const tw = 0.5 + 0.5 * Math.sin(this.t * 2.2 + m.ph);
      g.globalAlpha = 0.35 * tw * k;
      g.fillRect(Math.round(this.x + m.u + m.v * SHEAR + Math.sin(this.t * 0.7 + m.ph) * 1.5), Math.round(this.y + m.v), 1, 1);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

let BFLY: Sprite[][] | null = null;
/** a butterfly stopped mid-wingbeat. Startles when the second hand brushes past, then freezes again. */
class FrozenButterfly extends Entity {
  t = frand(0, 10);
  pose: number;
  flutter = 0;
  fx0 = 0; fy0 = 0; fx1 = 0; fy1 = 0; z0 = 0; z1 = 0;
  glint = frand(1, 6);
  ph = frand(0, TAU);
  constructor(x: number, y: number, z: number, private pal: number) {
    super();
    this.x = x; this.y = y; this.z = z;
    this.pose = Math.floor(frand(0, 3));
  }
  update(dt: number) {
    this.t += dt;
    this.glint -= dt;
    if (this.glint < -0.35) this.glint = frand(2.5, 7);
    const p = this.world.player;
    if (this.flutter <= 0 && p && Math.hypot(p.x - this.x, p.y - this.y) < 14) {
      // startle: flutter to a nearby open spot
      for (let k = 0; k < 8; k++) {
        const a = Math.atan2(this.y - p.y, this.x - p.x) + frand(-0.9, 0.9), d = frand(26, 46);
        const nx = this.x + Math.cos(a) * d, ny = this.y + Math.sin(a) * d * 0.8;
        if (this.world.map.get(Math.floor(nx / TS), Math.floor(ny / TS)) !== T.FLOOR) continue;
        this.fx0 = this.x; this.fy0 = this.y; this.fx1 = nx; this.fy1 = ny; this.z0 = this.z; this.z1 = frand(10, 22);
        this.flutter = 1;
        sfx('butterfly', { vol: 0.35, pan: this.world.pan(this.x) });
        break;
      }
    }
    if (this.flutter > 0) {
      this.flutter = Math.max(0, this.flutter - dt / 0.85);
      const k = 1 - this.flutter, e = k * k * (3 - 2 * k);
      this.x = this.fx0 + (this.fx1 - this.fx0) * e + Math.sin(k * 9) * 3 * (1 - k);
      this.y = this.fy0 + (this.fy1 - this.fy0) * e;
      this.z = this.z0 + (this.z1 - this.z0) * e + Math.sin(k * Math.PI) * 8;
      if (this.flutter === 0) this.pose = Math.floor(frand(0, 3));
    }
  }
  render(r: Renderer) {
    BFLY ??= buildButterflies();
    const fr = BFLY[this.pal];
    const s = this.flutter > 0 ? fr[[0, 1, 2, 1][Math.floor(this.t * 22) % 4]] : fr[this.pose];
    const bob = this.flutter > 0 ? 0 : Math.round(Math.sin(this.t * 0.9 + this.ph) * 0.6);
    r.w.fillStyle = 'rgba(11,10,20,0.35)';
    r.w.fillRect(Math.round(this.x) - 1, Math.round(this.y), 3, 1);
    drawSprite(r.w, s, this.x, this.y - this.z + bob);
    if (this.glint < 0 && this.flutter <= 0) {
      const k = Math.sin((-this.glint / 0.35) * Math.PI);
      const gx = Math.round(this.x + (this.pose === 0 ? -2 : 1)), gy = Math.round(this.y - this.z + bob - 1);
      const g = r.g;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = pcol('K10');
      g.globalAlpha = k;
      g.fillRect(gx, gy, 1, 1);
      g.globalAlpha = k * 0.5;
      g.fillRect(gx - 1, gy, 3, 1); g.fillRect(gx, gy - 1, 1, 3);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      r.glowAt(gx, gy, 5, 'U4', 0.25 * k);
    }
  }
}

/** fireflies, cold moonglow spilling from the glass, and other room-wide ambience */
class Ambience extends Entity {
  t = 0;
  flies: { ax: number; ay: number; r: number; sp: number; ph: number; bs: number; c: string }[] = [];
  glass: { x: number; y: number }[] = [];
  stained: { x: number; y: number }[] = [];
  constructor() { super(); this.layerTop = true; }
  update(dt: number) { this.t += dt; }
  renderGround(r: Renderer) {
    for (const gl of this.glass) r.lightAt(gl.x, gl.y + 8, 44, 'U3', 0.16);
    // stained glass throws a soft amber-and-green patch onto the tiles
    for (const s of this.stained) { r.lightAt(s.x - 2, s.y + 12, 30, 'B4', 0.3); r.lightAt(s.x + 5, s.y + 18, 20, 'G3', 0.2); }
  }
  render(r: Renderer) {
    for (const f of this.flies) {
      const x = f.ax + Math.sin(this.t * f.sp + f.ph) * f.r + Math.sin(this.t * f.sp * 2.3 + f.ph * 2) * 3;
      const y = f.ay + Math.cos(this.t * f.sp * 0.7 + f.ph) * f.r * 0.5 - 10 + Math.sin(this.t * 1.7 + f.ph) * 2;
      const b = Math.pow(Math.max(0, Math.sin(this.t * f.bs + f.ph)), 2);
      if (b < 0.05) continue;
      r.u.globalAlpha = Math.min(1, b * 1.3);
      px1(r.u, x, y, b > 0.6 ? 'O4' : f.c);
      r.u.globalAlpha = 1;
      r.glowAt(x, y, 5, f.c, 0.55 * b);
      r.lightAt(x, y + 6, 22, 'G3', 0.3 * b);
    }
  }
}

type PondReg = { tiles: number[]; x0: number; y0: number; x1: number; y1: number };
/** moon reflection and drifting glints on a reflecting pond */
class PondShimmer extends Entity {
  t = frand(0, 10);
  water: number[] = [];
  glints: { x: number; y: number; len: number; t: number; dur: number }[] = [];
  moon: { x: number; y: number } | null = null;
  spawn = 0;
  constructor(m: RoomMap, reg: PondReg) {
    super();
    for (const ti of reg.tiles) {
      const tx = ti % m.w, ty = (ti / m.w) | 0;
      for (let py = 0; py < TS; py += 2) for (let px = 0; px < TS; px += 2) {
        const x = tx * TS + px, y = ty * TS + py;
        if (pondWater(m, x, y) && pondWater(m, x + 3, y) && pondWater(m, x - 3, y)) this.water.push(y * 65536 + x);
      }
    }
    this.x = ((reg.x0 + reg.x1 + 1) / 2) * TS; this.y = ((reg.y0 + reg.y1 + 1) / 2) * TS;
    if (reg.tiles.length >= 4) {
      // the moon's reflection sits toward the far (upper-left) side of the pond
      const cands = this.water.filter((v) => { const x = v & 65535, y = v >> 16; return pondWater(m, x - 6, y) && pondWater(m, x + 6, y) && pondWater(m, x, y - 3) && pondWater(m, x, y + 6); });
      if (cands.length) {
        cands.sort((a, b) => ((a & 65535) + (a >> 16) * 1.5) - ((b & 65535) + (b >> 16) * 1.5));
        const v = cands[Math.floor(cands.length * 0.3)];
        this.moon = { x: v & 65535, y: v >> 16 };
      }
    }
  }
  update(dt: number) {
    this.t += dt;
    this.spawn -= dt;
    if (this.spawn <= 0 && this.water.length) {
      this.spawn = frand(0.05, 0.18) * Math.min(1.5, 40 / this.water.length + 0.3);
      const v = fpick(this.water);
      this.glints.push({ x: v & 65535, y: v >> 16, len: Math.floor(frand(1, 4)), t: 0, dur: frand(0.5, 1.2) });
    }
    for (let i = this.glints.length - 1; i >= 0; i--) { this.glints[i].t += dt; if (this.glints[i].t > this.glints[i].dur) this.glints.splice(i, 1); }
  }
  renderGround(r: Renderer) {
    if (!r.visible(this.x, this.y, 140)) return;
    const g = r.g;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = pcol('U4');
    for (const gl of this.glints) {
      g.globalAlpha = Math.sin((gl.t / gl.dur) * Math.PI) * 0.45;
      g.fillRect(gl.x, gl.y, gl.len, 1);
    }
    if (this.moon) {
      const rows = [[-1, 3], [0, 5], [1, 6], [2, 5], [3, 3], [5, 2]];
      for (const [dy, w] of rows) {
        const wob = Math.round(Math.sin(this.t * 2.1 + dy * 1.3) * 1.2);
        g.globalAlpha = dy === 5 ? 0.25 : 0.55;
        g.fillStyle = pcol(dy < 2 ? 'K10' : 'K8');
        g.fillRect(this.moon.x - (w >> 1) + wob, this.moon.y + dy, w, 1);
      }
      r.lightAt(this.moon.x, this.moon.y, 26, 'U4', 0.3);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

/** potted mechanical plants along the walls: verdigris ferns, bell-lilies that breathe open and shut */
class PottedPlant extends Entity {
  t = frand(0, 10);
  ph = frand(0, TAU);
  fronds: { a: number; len: number; curl: number }[] = [];
  constructor(x: number, y: number, private kind: number) {
    super();
    this.x = x; this.y = y;
    const n = kind === 0 ? 5 : 2;
    for (let i = 0; i < n; i++) this.fronds.push({ a: -Math.PI / 2 + (i - (n - 1) / 2) * (kind === 0 ? 0.5 : 0.9) + frand(-0.1, 0.1), len: kind === 0 ? frand(7, 11) : frand(4, 6), curl: frand(0.06, 0.12) * (i < n / 2 ? -1 : 1) });
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const ctx = r.w;
    const top = this.y - 5;
    const sway = Math.sin(this.t * 1.3 + this.ph) * 0.09 + Math.sin(this.t * 3.1 + this.ph) * 0.02;
    for (const f of this.fronds) {
      let a = f.a + sway, x = this.x, y = top;
      for (let s = 0; s < f.len; s++) {
        x += Math.cos(a); y += Math.sin(a);
        a += f.curl * (1 + s * 0.12);
        px1(ctx, x, y, s < 2 ? 'T1' : 'T2');
        if (this.kind === 0 && s > 1 && (s & 1) === 0) {
          const nx = -Math.sin(a), ny = Math.cos(a);
          px1(ctx, x + nx * 1.4, y + ny * 1.4 - 1, s < f.len - 2 ? 'T3' : 'T4');
          px1(ctx, x - nx * 1.4, y - ny * 1.4 - 1, 'T2');
        }
      }
      if (this.kind === 0) px1(ctx, x, y - 1, 'T4');
    }
    if (this.kind === 1) {
      // bell-lily on a tall stem
      const H = 13;
      let x = this.x, y = top;
      for (let s = 0; s < H; s++) {
        x = this.x + sway * s * s * 0.12;
        y = top - s;
        px1(ctx, x, y, s < 4 ? 'T1' : 'T2');
      }
      const open = (Math.sin(this.t * 0.5 + this.ph) + 1) / 2;
      const bx = Math.round(x), by = Math.round(y) - 1;
      const P = open > 0.66 ? ['.KkK.', 'KkskK', '.k.k.'] : open > 0.33 ? ['.Kk.', 'Kksk', '.kk.'] : ['.K.', 'Kkk', '.k.'];
      const w = P[0].length;
      for (let j = 0; j < P.length; j++)
        for (let i = 0; i < w; i++) {
          const ch = P[j][i];
          if (ch === '.') continue;
          px1(ctx, bx - (w >> 1) + i, by - 1 + j, ch === 'K' ? 'K10' : ch === 'k' ? 'K8' : 'B5');
        }
      if (open > 0.66) r.glowAt(bx, by, 4, 'K9', 0.12 * (open - 0.66) * 3);
    }
    drawSprite(ctx, POT(), this.x, this.y);
  }
}

function decorateConservatory(w: World, m: RoomMap, rng: RNG) {
  // stock gearworks props are not spawned for this biome (see claimsProps); dress those hints here
  const nearExit = (tx: number, ty: number, d = 3) => m.exits.some((e) => Math.abs(e.tx - tx) < d && Math.abs(e.ty - ty) < d) || (!!m.entry && Math.abs(m.entry.tx - tx) < d && Math.abs(m.entry.ty - ty) < d + 1);
  const used = new Set<number>();
  for (const p of m.props) {
    if (p.type === 'walllamp') {
      // planter beds get a standing lantern at their foot instead of one hung on the brick
      if (isIsland(m, p.tx, p.ty)) w.add(new FloorLantern(p.tx, p.ty + 1));
      else w.add(new Lantern(p.tx, p.ty));
      used.add(p.ty * m.w + p.tx);
    }
    else if (p.type === 'wallgear') { w.add(new ClockFlower(p.tx, p.ty, !!p.data?.big)); used.add(p.ty * m.w + p.tx); }
    else if (p.type === 'crate' || p.type === 'barrel') w.add(new Planter(p.tx, p.ty, p.type === 'barrel'));
    else if (p.type === 'candles') w.add(new FloorLantern(p.tx, p.ty));
  }
  // moonbeams through a few north bays
  const bays: { tx: number; ty: number }[] = [];
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++)
      if (tallInteriorFace(m, tx, ty) && !isIsland(m, tx, ty) && m.get(tx, ty + 1) === T.FLOOR && m.get(tx, ty + 2) === T.FLOOR && !nearExit(tx, ty, 2)) bays.push({ tx, ty });
  rng.shuffle(bays);
  const shafts: { tx: number; ty: number }[] = [];
  for (const b of bays) {
    if (shafts.length >= 3) break;
    if (shafts.some((s) => Math.abs(s.tx - b.tx) < 5 && Math.abs(s.ty - b.ty) < 3)) continue;
    if (used.has(b.ty * m.w + b.tx)) continue;
    shafts.push(b);
    w.add(new MoonShaft(b.tx, b.ty, rng.range(0.8, 1.1)));
  }
  // potted plants along the wall feet
  const feet: { x: number; y: number }[] = [];
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (m.get(tx, ty) !== T.FLOOR || nearExit(tx, ty)) continue;
      if (m.get(tx, ty - 1) === T.WALL && !isIsland(m, tx, ty - 1)) feet.push({ x: tx * TS + rng.int(4, 12), y: ty * TS + 7 });
      else if (m.get(tx - 1, ty) === T.WALL && m.get(tx, ty - 1) === T.FLOOR) feet.push({ x: tx * TS + 5, y: ty * TS + rng.int(8, 14) });
      else if (m.get(tx + 1, ty) === T.WALL && m.get(tx, ty - 1) === T.FLOOR) feet.push({ x: tx * TS + 11, y: ty * TS + rng.int(8, 14) });
    }
  rng.shuffle(feet);
  const plants: { x: number; y: number }[] = [];
  const nPlants = clamp(Math.round(feet.length * 0.12), 2, 7);
  for (const f of feet) {
    if (plants.length >= nPlants) break;
    if (plants.some((p) => Math.hypot(p.x - f.x, p.y - f.y) < 40)) continue;
    plants.push(f);
    w.add(new PottedPlant(f.x, f.y, rng.chance(0.55) ? 0 : 1));
  }
  // frozen butterflies hanging in the air
  const open = m.openTiles(1);
  const nB = Math.min(open.length, rng.int(3, 6));
  for (let i = 0; i < nB; i++) {
    const t = rng.pick(open);
    w.add(new FrozenButterfly(t.tx * TS + rng.int(2, 14), t.ty * TS + rng.int(2, 14), rng.range(10, 24), rng.weighted([0, 1, 2], (k) => [5, 2, 2][k])!));
  }
  // ambience: fireflies near plants and water, cold glow from the glazing
  const amb = new Ambience();
  for (const p of m.props) if (p.type === 'window' && tallInteriorFace(m, p.tx, p.ty) && !isIsland(m, p.tx, p.ty)) amb.stained.push({ x: p.tx * TS + 8, y: (p.ty + 1) * TS });
  const ponds = pondRegions(m);
  const anchors = [...plants, ...ponds.map((r) => ({ x: ((r.x0 + r.x1 + 1) / 2) * TS, y: ((r.y0 + r.y1 + 1) / 2) * TS }))];
  const nF = rng.int(5, 9);
  for (let i = 0; i < nF && open.length; i++) {
    let a: { x: number; y: number };
    if (anchors.length && rng.chance(0.7)) a = rng.pick(anchors);
    else { const t = rng.pick(open); a = { x: t.tx * TS + 8, y: t.ty * TS + 8 }; }
    amb.flies.push({ ax: a.x + rng.range(-14, 14), ay: a.y + rng.range(-6, 10), r: rng.range(5, 14), sp: rng.range(0.25, 0.6), ph: rng.range(0, TAU), bs: rng.range(0.8, 1.6), c: rng.chance(0.75) ? 'G4' : 'O3' });
  }
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++)
      if (tallInteriorFace(m, tx, ty) && !isIsland(m, tx, ty) && (tx + ty) % 3 === 0) amb.glass.push({ x: tx * TS + 8, y: (ty + 1) * TS });
  w.add(amb);
  for (const reg of ponds) w.add(new PondShimmer(m, reg));
}

export const CONSERVATORY: BiomeArt = {
  claimsProps: ['walllamp', 'wallgear', 'crate', 'barrel'],
  paintFloor,
  paintPits,
  paintDressing,
  paintFace,
  paintCap,
  decorate: decorateConservatory,
};
