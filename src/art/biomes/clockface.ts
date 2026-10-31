// Floor 4 — 钟面 The Clockface (theme 3). The summit: we fight on the face of the Great Clock
// itself — a white marble dial with brass chapter rings and Roman numerals, its blued-steel
// hands stopped at 11:59:59 — under an endless starry night and an enormous moon.
//
// How the pieces fit
//  • The dial is ONE world-space construction per room (centre + chapter-ring radius), so each
//    room reads as a different region of the same colossal face: panels are annular sectors,
//    numerals are radial, the hands (when this room lies on them) point at XII — the exits.
//    The second hand is missing: its arbor is an empty hole. Tick is that hand.
//  • Boundary walls are LOW balustrades (13px) drawn as a tiny height-field inside the wall
//    strips; everything beyond them is open sky (floor buffer + a backdrop entity outside the
//    map).  Interior wall blocks become tall marble pedestals carrying armillary spheres.
//  • Pits are holes in the dial: a cut marble/brass cliff, then the same starfield far below.
import type { BiomeArt, PaintCtx } from './types';
import { PixelBuf, makeCanvas } from '../../engine/gfx/canvas';
import { RNG, frand } from '../../engine/rng';
import { bayer, fbm2, hash2, clamp, TAU, angleDiff } from '../../engine/math';
import { rgb } from '../blit';
import { col } from '../palette';
import { RoomMap, T, TS } from '../../game/world/room';
import { Entity } from '../../game/entities/entity';
import { WallLamp, WallGear, Breakable } from '../../game/entities/props';
import { Pickup } from '../../game/entities/pickup';
import type { DamageInfo } from '../../game/systems/combat';
import { sfx } from '../../game/G';
import type { World } from '../../game/world/world';
import type { Renderer } from '../../engine/gfx/renderer';
import { WORLD_W, WORLD_H } from '../../engine/gfx/post';
import { Sprite, spriteFromDef, spriteFromBuf, drawSprite } from '../../engine/gfx/sprite';

type RGB = [number, number, number];

// ───────────────────────────── constants ─────────────────────────────
/** balustrade height, newel-post height, balustrade footprint depth */
const P_RAIL = 13, P_POST = 18, RW = 6;
/** backdrop margin around the map (sky beyond the edge of the dial) */
const PADX = 112, PADY = 56;

/** fast 2-arg hypot (Math.hypot is slow in hot loops) */
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
const KS = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10'];
const isOpenT = (t: T) => t === T.FLOOR || t === T.PIT || t === T.BLOCK;

/** one ramp step darker (same hue family) */
function dk(k: string, n: number): string {
  if (n <= 0) return k;
  if (k === 'W') k = 'K10';
  const i = parseInt(k.slice(1), 10);
  return k[0] + Math.max(0, i - n);
}
function lt(k: string, n: number): string {
  const top: Record<string, number> = { K: 10, B: 6, U: 4, V: 4, R: 4, O: 4, T: 5, S: 4, G: 4 };
  const i = parseInt(k.slice(1), 10);
  return k[0] + Math.min(top[k[0]] ?? 4, i + n);
}

// ───────────────────────────── per-room data ─────────────────────────────
interface Dial {
  cx: number; cy: number; Rc: number; hub: boolean;
  /** moon centre / radius (world px) */
  mx: number; my: number; mR: number;
  seed: number;
  /** low-frequency noise fields sampled from a coarse lattice (nebula ×2, marble clouding) */
  nA: Lattice; nB: Lattice; cloud: Lattice;
}

/** Smooth noise is costly per pixel; low-frequency fields are evaluated on a 4px lattice and
 *  bilinearly interpolated (indistinguishable once dithered). */
class Lattice {
  private v: Float32Array;
  private gw: number; private gh: number;
  constructor(private x0: number, private y0: number, w: number, h: number, private step: number, fn: (x: number, y: number) => number) {
    this.gw = Math.ceil(w / step) + 2; this.gh = Math.ceil(h / step) + 2;
    this.v = new Float32Array(this.gw * this.gh);
    for (let j = 0; j < this.gh; j++) for (let i = 0; i < this.gw; i++) this.v[j * this.gw + i] = fn(x0 + i * step, y0 + j * step);
  }
  at(x: number, y: number): number {
    const fx = clamp((x - this.x0) / this.step, 0, this.gw - 1.001), fy = clamp((y - this.y0) / this.step, 0, this.gh - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, t = fy - j;
    const a = this.v[j * this.gw + i], b = this.v[j * this.gw + i + 1], c = this.v[(j + 1) * this.gw + i], d = this.v[(j + 1) * this.gw + i + 1];
    return a + (b - a) * u + (c - a) * t + (a - b - c + d) * u * t;
  }
}
interface Post { x: number; y: number; tx: number; ty: number; tag: string }
interface Box { x0: number; y0: number; x1: number; y1: number }
interface CF {
  m: RoomMap; w: number; h: number; pw: number; ph: number;
  /** wall/void cell connected to the outside */
  bnd: Uint8Array;
  /** balustrade cell (1) or entry gate (2) */
  par: Uint8Array;
  /** per-pixel balustrade height, kind (1 rail, 2 side rail, 3 post, 4 gate) and post-local x */
  foot: Uint8Array; fk: Uint8Array; fx: Uint8Array; fy: Uint8Array;
  /** interior wall component index (-1 none) and component boxes */
  inner: Int16Array; boxes: Box[];
  dial: Dial;
  posts: Post[];
  /** floor buffer snapshot after pits (to clean generator puddles) */
  snap: Uint8ClampedArray | null;
}
const CACHE = new WeakMap<RoomMap, CF>();

function data(m: RoomMap, seed: number): CF {
  let d = CACHE.get(m);
  if (!d) { d = build(m, seed); CACHE.set(m, d); }
  return d;
}

function build(m: RoomMap, seed: number): CF {
  const w = m.w, h = m.h, pw = m.pw, ph = m.ph;
  const open = (x: number, y: number) => isOpenT(m.get(x, y));
  const solidish = (x: number, y: number) => { const t = m.get(x, y); return t === T.WALL || t === T.VOID || t === T.DOOR; };
  const isEntry = (x: number, y: number) => !!m.entry && m.get(x, y) === T.DOOR && y >= m.entry.ty && x >= m.entry.tx && x < m.entry.tx + m.entry.w;
  const isExit = (x: number, y: number) => m.get(x, y) === T.DOOR && !isEntry(x, y);

  // boundary: everything solid that connects to the edge of the map
  const bnd = new Uint8Array(w * h);
  const st: number[] = [];
  const push = (x: number, y: number) => {
    if (!m.in(x, y) || !solidish(x, y)) return;
    const i = y * w + x;
    if (bnd[i]) return;
    bnd[i] = 1; st.push(i);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const i = st.pop()!; const x = i % w, y = (i / w) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }

  // balustrade cells: boundary cells touching the walkable dial
  const par = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bnd[i] || isExit(x, y)) continue;
      let near = false;
      for (let j = -1; j <= 1 && !near; j++) for (let k = -1; k <= 1 && !near; k++) if (open(x + k, y + j)) near = true;
      if (near) par[i] = isEntry(x, y) ? 2 : 1;
    }

  // footprint height-field
  const foot = new Uint8Array(pw * ph), fk = new Uint8Array(pw * ph), fx = new Uint8Array(pw * ph), fy = new Uint8Array(pw * ph);
  const mark = (tx: number, ty: number, x0: number, y0: number, x1: number, y1: number, hgt: number, kind: number) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const X = tx * TS + x, Y = ty * TS + y;
        if (X < 0 || Y < 0 || X >= pw || Y >= ph) continue;
        const i = Y * pw + X;
        if (hgt >= foot[i]) { foot[i] = hgt; fk[i] = kind; fx[i] = x - x0; fy[i] = y - y0; }
      }
  };
  const posts: Post[] = [];
  const post = (tx: number, ty: number, x0: number, y0: number, tag = '') => {
    mark(tx, ty, x0, y0, x0 + 8, y0 + 8, P_POST, 3);
    posts.push({ x: tx * TS + x0 + 4, y: ty * TS + y0 + 4 - P_POST, tx, ty, tag });
  };
  /** does a straight balustrade run of >= 2 cells continue from (tx,ty) in (dx,dy), with open dial at (+ox,+oy)? */
  const run = (tx: number, ty: number, dx: number, dy: number, ox: number, oy: number) => {
    for (let k = 1; k <= 2; k++) {
      const x = tx + dx * k, y = ty + dy * k;
      if (!m.in(x, y) || !par[y * w + x] || !open(x + ox, y + oy)) return false;
    }
    return true;
  };
  const propAt = new Map<number, string>();
  for (const p of m.props) if (p.type === 'walllamp' || p.type === 'wallgear' || p.type === 'window') propAt.set(p.ty * w + p.tx, p.type);
  const nearProp = (tx: number, ty: number) => propAt.has(ty * w + tx - 1) || propAt.has(ty * w + tx + 1) || propAt.has(ty * w + tx);
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const pi = par[ty * w + tx];
      if (!pi) continue;
      const kindH = pi === 2 ? 4 : 1;
      const H = open(tx, ty + 1) || open(tx, ty - 1);
      const VR = open(tx + 1, ty), VL = open(tx - 1, ty);
      if (H) mark(tx, ty, 0, TS - RW, TS, TS, P_RAIL, kindH);
      if (VR) mark(tx, ty, TS - RW, 0, TS, TS, P_RAIL, 2);
      if (VL) mark(tx, ty, 0, 0, RW, TS, P_RAIL, 2);
      if (!H && !VR && !VL) {
        if (open(tx + 1, ty + 1)) { mark(tx, ty, TS - RW, TS - RW, TS, TS, P_RAIL, 1); if (run(tx, ty, 1, 0, 0, 1) && run(tx, ty, 0, 1, 1, 0)) post(tx, ty, 8, 8); }
        if (open(tx - 1, ty + 1)) { mark(tx, ty, 0, TS - RW, RW, TS, P_RAIL, 1); if (run(tx, ty, -1, 0, 0, 1) && run(tx, ty, 0, 1, -1, 0)) post(tx, ty, 0, 8); }
        if (open(tx + 1, ty - 1)) { mark(tx, ty, TS - RW, 0, TS, TS, P_RAIL, 2); if (run(tx, ty, 0, -1, 1, 0) && run(tx, ty, 1, 0, 0, -1)) post(tx, ty, 8, 8); }
        if (open(tx - 1, ty - 1)) { mark(tx, ty, 0, 0, RW, TS, P_RAIL, 2); if (run(tx, ty, 0, -1, -1, 0) && run(tx, ty, -1, 0, 0, -1)) post(tx, ty, 0, 8); }
        continue;
      }
      if (H && VR) { if (run(tx, ty, -1, 0, 0, open(tx, ty + 1) ? 1 : -1) && run(tx, ty, 0, open(tx, ty + 1) ? -1 : 1, 1, 0)) post(tx, ty, 8, 8); continue; }
      if (H && VL) { if (run(tx, ty, 1, 0, 0, open(tx, ty + 1) ? 1 : -1) && run(tx, ty, 0, open(tx, ty + 1) ? -1 : 1, -1, 0)) post(tx, ty, 0, 8); continue; }
      if (H) {
        // rail ends beside exit arches / the entry gate get a newel post
        if (isExit(tx - 1, ty) || (pi === 1 && par[ty * w + tx - 1] === 2)) post(tx, ty, 0, 8);
        if (isExit(tx + 1, ty) || (pi === 1 && par[ty * w + tx + 1] === 2)) post(tx, ty, 8, 8);
        const tag = propAt.get(ty * w + tx);
        if (tag && pi === 1 && open(tx, ty + 1)) post(tx, ty, 4, 8, tag);
        else if (pi === 1 && (tx + 2) % 4 === 0 && !nearProp(tx, ty) && par[ty * w + tx - 1] && par[ty * w + tx + 1] && !isExit(tx - 1, ty) && !isExit(tx + 1, ty)) post(tx, ty, 4, 8);
      } else if ((VR || VL) && ty % 3 === 0 && par[(ty - 1) * w + tx] && par[(ty + 1) * w + tx]) post(tx, ty, VR ? 8 : 0, 4);
    }

  // interior wall blocks → pedestals
  const inner = new Int16Array(w * h).fill(-1);
  const boxes: Box[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bnd[i] || m.get(x, y) !== T.WALL || inner[i] >= 0) continue;
      const id = boxes.length;
      const b: Box = { x0: x, y0: y, x1: x, y1: y };
      const q = [i];
      inner[i] = id;
      while (q.length) {
        const j = q.pop()!;
        const jx = j % w, jy = (j / w) | 0;
        b.x0 = Math.min(b.x0, jx); b.x1 = Math.max(b.x1, jx); b.y0 = Math.min(b.y0, jy); b.y1 = Math.max(b.y1, jy);
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = jx + ax, ny = jy + ay;
          if (!m.in(nx, ny)) continue;
          const k = ny * w + nx;
          if (inner[k] >= 0 || bnd[k] || m.get(nx, ny) !== T.WALL) continue;
          inner[k] = id; q.push(k);
        }
      }
      boxes.push(b);
    }

  const cf: CF = { m, w, h, pw, ph, bnd, par, foot, fk, fx, fy, inner, boxes, dial: null as unknown as Dial, posts, snap: null };
  cf.dial = makeDial(cf, seed);
  return cf;
}

/** Choose which region of the Great Clock this room is, and where the moon hangs. */
function makeDial(cf: CF, seed: number): Dial {
  const { m, pw, ph } = cf;
  const r = new RNG((seed * 2654435761) >>> 0 ^ 0x5eed);
  const rx = pw / 2, ry = ph / 2 + 8;
  const hub = r.chance(0.3);
  let cx: number, cy: number, Rc: number;
  if (hub) {
    Rc = clamp(Math.min(pw * 0.34, ph * 0.6), 128, 176);
    cx = rx + r.range(-36, 36);
    cy = ry + r.range(-6, 18);
  } else {
    Rc = r.range(330, 500);
    const hr = r.chance(0.45) ? r.pick([11, 0, 0, 1]) : r.int(0, 11);
    const th = -Math.PI / 2 + (hr * Math.PI) / 6 + r.range(-0.1, 0.1);
    const D = Rc - 21 + r.range(-70, 40);
    cx = rx - Math.cos(th) * D;
    cy = ry - Math.sin(th) * D;
  }
  // moon: maximise how much of the disc shows over open sky above the room
  const mR = Math.round(r.range(40, 52));
  const skyAtPx = (x: number, y: number) => {
    if (y < -8) return false;
    if (x < 0 || y < 0 || x >= pw || y >= ph) return true;
    const tx = x >> 4, ty = y >> 4, i = ty * cf.w + tx;
    const t = m.get(tx, ty);
    if (isOpenT(t)) return false;
    if (!cf.bnd[i] || cf.par[i]) return false;
    if (t === T.DOOR && !(m.entry && ty >= m.entry.ty)) return false;
    return true;
  };
  let best = -1, bx = pw / 2, by = 10;
  for (let my = -24; my <= 84; my += 8)
    for (let mx = -40; mx <= pw + 40; mx += 16) {
      let vis = 0, tot = 0;
      for (let j = -mR; j <= mR; j += 7)
        for (let i = -mR; i <= mR; i += 7) {
          if (i * i + j * j > mR * mR) continue;
          tot++;
          if (skyAtPx(mx + i, my + j)) vis++;
        }
      let s = vis / tot;
      // keep it off the exit arches and nearer the middle of the view
      for (const e of m.exits) if (Math.abs(mx - (e.tx + 1) * TS) < mR + 18 && my + mR > (e.ty - 1) * TS - 8) s -= 0.25;
      s -= Math.abs(mx - pw / 2) / pw * 0.35;
      s += r.range(0, 0.06);
      if (s > best) { best = s; bx = mx; by = my; }
    }
  const lx = -PADX, ly = -PADY, lw = pw + PADX * 2, lh = ph + PADY * 2;
  return {
    cx, cy, Rc, hub, mx: bx, my: by, mR, seed,
    nA: new Lattice(lx, ly, lw, lh, 4, (x, y) => fbm2(x * 0.011 + 11, y * 0.017, seed + 5, 2)),
    nB: new Lattice(lx, ly, lw, lh, 4, (x, y) => fbm2(x * 0.017 + 40, y * 0.012 + 3, seed + 9, 2)),
    cloud: new Lattice(0, 0, pw + 100, ph + 60, 4, (x, y) => fbm2(x * 0.018, y * 0.018, seed + 62, 2)),
  };
}

// ───────────────────────────── sky / moon ─────────────────────────────
const CRATERS: [number, number, number][] = [[-0.38, -0.22, 0.13], [0.22, 0.34, 0.1], [0.08, -0.48, 0.07], [-0.12, 0.52, 0.06], [0.5, -0.06, 0.09], [-0.55, 0.25, 0.06]];

function moonKey(dx: number, dy: number, R: number, x: number, y: number): string {
  const nx = dx / R, ny = dy / R;
  const r2 = nx * nx + ny * ny;
  const nz = Math.sqrt(Math.max(0, 1 - r2));
  const b = bayer(x, y);
  const lit = -0.3 * nx - 0.36 * ny + 0.88 * nz + (b - 0.5) * 0.06;
  let L = lit > 0.86 ? 6 : lit > 0.66 ? 5 : lit > 0.44 ? 4 : lit > 0.24 ? 3 : lit > 0.1 ? 2 : 1;
  // maria: solid, softly edged seas
  const mar = fbm2(nx * 2.1 + 7.3, ny * 2.1 + 2.1, 4242, 3);
  if (mar > 0.55 + (b - 0.5) * 0.02) L -= 1;
  if (mar > 0.63) L -= 1;
  for (const [ccx, ccy, cr] of CRATERS) {
    const ox = nx - ccx, oy = ny - ccy;
    const dd = hyp(ox, oy) / cr;
    if (dd > 1.15) continue;
    if (dd > 1) { if ((ox * -0.6 + oy * -0.8) > 0) L += 1; continue; } // sunlit outer rim
    if (dd > 0.6) L += (ox * -0.6 + oy * -0.8) > 0 ? -1 : 1;           // inner walls
    else L -= 1;
  }
  if (r2 > 0.93) L = Math.min(L, 3);
  const ramp = ['U1', 'U2', 'U3', 'K7', 'K8', 'K9', 'K10'];
  return ramp[clamp(L, 0, 6)];
}

/** the open night beyond the balustrade (also far below, through the holes) */
function skyKey(x: number, y: number, d: Dial): string {
  const dx = x - d.mx, dy = y - d.my;
  const dm = hyp(dx, dy);
  if (dm < d.mR) return moonKey(dx, dy, d.mR, x, y);
  const b = bayer(x, y);
  const halo = dm - d.mR;
  const n = d.nA.at(x, y);
  const n2 = d.nB.at(x, y);
  let k = 'U0';
  if (n2 < 0.42 && b < (0.42 - n2) * 6) k = 'K1';
  if (n2 > 0.58 && b < (n2 - 0.58) * 5) k = 'U1';
  if (n > 0.63 && b < (n - 0.63) * 4.5) k = 'V0';
  if (halo < 1.5) k = 'U2';
  else if (halo < 9) k = 'U1';
  else if (halo < 18 && hash2(x, y, d.seed + 21) < 1 - (halo - 9) / 9) k = 'U1';
  const s = hash2(x, y, d.seed + 3);
  if (s > 0.9988) k = 'K8'; else if (s > 0.996) k = 'K5';
  return k;
}

/** the abyss seen through a hole in the dial */
function abyssKey(x: number, y: number, d: Dial, edge: number): string {
  if (edge < 2) return 'K0';
  const h = hash2(x, y, d.seed + 13);
  const n = fbm2(x * 0.03 + 5, y * 0.045, d.seed + 41, 3);
  const n2 = fbm2(x * 0.04 + 17, y * 0.025 + 9, d.seed + 47, 2);
  const lift = Math.min(1, (edge - 2) / 9);
  let k = 'K0';
  if (n * lift > 0.36 + (h - 0.5) * 0.08) k = 'U0';
  if (n2 * lift > 0.6 + (h - 0.5) * 0.06) k = 'V0';
  if (n * lift > 0.62 + (h - 0.5) * 0.06) k = 'U1';
  if (edge > 4 && h > 0.992) k = h > 0.998 ? 'K7' : h > 0.996 ? 'U3' : 'U2';
  return k;
}

// ───────────────────────────── numerals ─────────────────────────────
const GH = 24; // glyph height (px, radial)
const NUMERALS = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const GW: Record<string, number> = { I: 8, V: 16, X: 16 };
/** continuous glyph test (gx, gy in glyph px; gy = 0 at the outer edge) */
function glyphHit(ch: string, gx: number, gy: number): boolean {
  const t = gy / GH;
  const serifTop = gy < 2, serifBot = gy >= GH - 2;
  switch (ch) {
    case 'I':
      if (serifTop || serifBot) return gx >= 0 && gx < 8;
      return gx >= 2 && gx < 6;
    case 'V': {
      if (serifTop) return (gx >= 0 && gx < 6.5) || (gx >= 10.5 && gx < 16);
      const xl = 3.2 + 5 * t, xr = 13 - 5 * t;
      return Math.abs(gx - xl) < 2.4 || Math.abs(gx - xr) < 1.45;
    }
    case 'X': {
      if (serifTop || serifBot) return (gx >= 0 && gx < 6.5) || (gx >= 9.5 && gx < 16);
      const xa = 3.2 + 9.6 * t, xb = 12.8 - 9.6 * t;
      return Math.abs(gx - xa) < 2.4 || Math.abs(gx - xb) < 1.45;
    }
  }
  return false;
}
function numeralHit(str: string, gx: number, gy: number): boolean {
  if (gy < 0 || gy >= GH) return false;
  let ox = 0;
  for (const ch of str) {
    const cw = GW[ch];
    if (gx >= ox && gx < ox + cw) return glyphHit(ch, gx - ox, gy);
    ox += cw + 3;
  }
  return false;
}
const SS: [number, number][] = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
function numeralWidth(str: string) { let w = 0; for (const ch of str) w += GW[ch] + 3; return w - 3; }

// ───────────────────────────── hands (blued steel) ─────────────────────────────
/** Hand profile at (s along, q across). Returns half-width (<0 outside). HS_RING/HS_CS/HS_R
 *  describe a disc or ring (centre s, radius) when the pixel belongs to one. */
let HS_RING = false, HS_CS = 0, HS_R = 0;
function disc(s: number, q: number, cs: number, R: number, hole = 0): number {
  const d = hyp(s - cs, q);
  if (d >= R) return -2;
  HS_RING = true; HS_CS = cs; HS_R = R;
  return d < hole ? -1 : R;
}
function handShape(kind: 'hour' | 'minute', s: number, q: number, L: number): number {
  HS_RING = false;
  const aq = Math.abs(q);
  let r: number;
  if (kind === 'minute') {
    if ((r = disc(s, q, -26, 8, 3)) !== -2) return r;      // counterweight ring
    if (s >= -20 && s < 0 && aq < 2.5) return 2.5;
    if ((r = disc(s, q, 0, 9)) !== -2) return r;           // collet
    if (s < 0 || s > L) return -1;
    let w: number;
    if (s < L - 34) w = 4.5 - 2 * (s / (L - 34));
    else if (s < L - 14) w = 2.5 + 4.5 * ((s - (L - 34)) / 20);
    else w = 7 * (1 - (s - (L - 14)) / 14);
    return aq < w ? w : -1;
  }
  // hour hand: Breguet "pomme" ring near the tip
  if ((r = disc(s, q, -18, 7)) !== -2) return r;
  if (s >= -14 && s < 0 && aq < 3.5) return 3.5;
  if ((r = disc(s, q, 0, 12)) !== -2) return r;
  if (s < 0 || s > L) return -1;
  const rc = L - 26;
  if ((r = disc(s, q, rc, 12, 6.5)) !== -2) return r;
  let w: number;
  if (s < rc - 10) w = 7 - 3 * (s / (rc - 10));
  else if (s < rc + 10) w = 4;
  else w = 5.5 * (1 - (s - (rc + 10)) / (L - rc - 10));
  return aq < w ? w : -1;
}

// ───────────────────────────── floor ─────────────────────────────
function paintFloor(pb: PixelBuf, c: PaintCtx) {
  const { m, seed, aoTop } = c;
  const cf = data(m, seed);
  const D = cf.dial;
  const pw = cf.pw, ph = cf.ph;
  const { cx, cy, Rc } = D;
  const rIn = Rc - 42, rOut = Rc + 22, rBez = Rc + 118;
  const isFloorPx = new Uint8Array(pw * ph);
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      const t = m.get(tx, ty);
      const exitFloor = t === T.DOOR && m.exits.some((e) => tx >= e.tx && tx < e.tx + e.w && ty >= e.ty - 1 && ty <= e.ty + 1);
      if (!(t === T.FLOOR || t === T.BLOCK || t === T.PIT || exitFloor || (t === T.WALL && !cf.bnd[ty * cf.w + tx]))) continue;
      for (let y = ty * TS; y < ty * TS + TS; y++) isFloorPx.fill(1, y * pw + tx * TS, y * pw + tx * TS + TS);
    }

  // hands (only drawn where this room lies on them)
  const handAng = [-Math.PI / 2 - 0.014, -Math.PI / 2 - 0.026];
  const handL = [Rc * 0.6, Rc + 10];
  const kinds: ('hour' | 'minute')[] = ['hour', 'minute'];
  const hux = handAng.map(Math.cos), huy = handAng.map(Math.sin);
  const hbox = [0, 1].map((h) => {
    const x0 = cx - 36 * hux[h], y0 = cy - 36 * huy[h], x1 = cx + (handL[h] + 2) * hux[h], y1 = cy + (handL[h] + 2) * huy[h];
    return [Math.min(x0, x1) - 16, Math.min(y0, y1) - 16, Math.max(x0, x1) + 16, Math.max(y0, y1) + 16];
  });
  const handAt = (x: number, y: number): number => {
    // returns shade code 1..4 of the topmost hand (minute over hour), 0 none
    let res = 0;
    for (let h = 0; h < 2; h++) {
      const bb = hbox[h];
      if (x < bb[0] || y < bb[1] || x > bb[2] || y > bb[3]) continue;
      const ux = hux[h], uy = huy[h];
      const px = x + 0.5 - cx, py = y + 0.5 - cy;
      const s = px * ux + py * uy, q = -px * uy + py * ux;
      if (Math.abs(q) > 14 || s < -36 || s > handL[h] + 1) continue;
      const wv = handShape(kinds[h], s, q, handL[h]);
      if (wv < 0) continue;
      // shading: ridge, lit flank (toward upper-left light), shaded flank, dark edge
      const nx = -uy, ny = ux; // +q direction
      const litSide = (nx * -0.6 + ny * -0.8) * q > 0;
      let code: number;
      if (HS_RING) {
        const os = s - HS_CS, oq = q;
        const dd = hyp(os, oq);
        const fx = ux * os + nx * oq, fy = uy * os + ny * oq;
        const face = (fx * -0.6 + fy * -0.8) / Math.max(1, dd);
        code = dd > HS_R - 1.2 ? 1 : face > 0.35 ? 4 : face > -0.2 ? 3 : 2;
      } else {
        code = Math.abs(q) > wv - 1 ? 1 : Math.abs(q) < 0.8 ? 4 : litSide ? 3 : 2;
      }
      res = code;
    }
    return res;
  };

  const reg = new Int32Array(pw * ph).fill(-1);
  const key: string[] = new Array(pw * ph);
  const numMask = new Uint8Array(pw * ph);
  const kindArr = new Uint8Array(pw * ph); // 1 marble, 2 metal/feature (no bevel), 3 roof stone
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const i = y * pw + x;
      if (!isFloorPx[i]) continue;
      const b = bayer(x, y);
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = hyp(dx, dy);
      const a = Math.atan2(dy, dx);
      const spec = Math.cos(a + (3 * Math.PI) / 4); // 1 on the upper-left arc of a ring
      let k = '';
      let id = -1;
      let kind = 1;
      if (D.hub && d < 17) {
        kind = 2;
        if (d < 2.6) k = 'K0';
        else if (d < 4.6) k = spec > 0.2 ? 'B6' : 'B4';
        else if (d < 8.2) k = d < 5.6 ? 'U1' : spec > 0.4 ? 'U4' : spec > -0.3 ? 'U3' : 'U2';
        else if (d < 13.4) k = d > 11.6 ? (Math.floor(((a + Math.PI) / TAU) * 40) % 2 ? 'B4' : 'B2') : spec > 0.4 ? 'B5' : spec > -0.4 ? 'B4' : 'B3';
        else if (d < 14.8) k = 'B1';
        else { kind = 1; k = 'K6'; id = 1; }
      } else if (d < rIn - 1.5) {
        const bw = 56;
        const band = Math.floor(d / bw);
        const n = Math.max(6, Math.round((TAU * (band + 0.5) * bw) / 60));
        const sec = Math.floor((((a + Math.PI) / TAU) * n + (band % 2) * 0.5)) % n;
        id = 10000 + band * 512 + sec;
        // thin guilloché double ring inside the chapter ring
        const g1 = Math.abs(d - (rIn - 12));
        if (g1 < 0.55 || Math.abs(d - (rIn - 16)) < 0.55) { k = spec > 0.3 ? 'B4' : 'B3'; kind = 2; }
      } else if (d < rIn + 1.5) {
        kind = 2;
        const t = d - rIn;
        k = t < -0.5 ? 'B2' : t > 0.5 ? 'B1' : spec > 0.55 ? 'B5' : spec > -0.3 ? 'B4' : 'B3';
      } else if (d < Rc - 1.5) {
        // chapter ring with radial Roman numerals
        const hr = ((Math.round((a + Math.PI / 2) / (Math.PI / 6)) % 12) + 12) % 12;
        const ah = -Math.PI / 2 + (hr * Math.PI) / 6;
        const sec = ((Math.floor((a + Math.PI / 2 + Math.PI / 12) / (Math.PI / 6)) % 12) + 12) % 12;
        id = 20000 + sec;
        const v = d - (rIn + Rc) / 2;
        const str = NUMERALS[hr];
        const nw = numeralWidth(str);
        if (Math.abs(v) < GH / 2 + 1 && Math.abs(d * angleDiff(ah, a)) < nw / 2 + 2) {
          // 2x2 supersampled so the radial (rotated) numerals keep their thick/thin strokes
          let cnt = 0;
          for (const [ox, oy] of SS) {
            const ddx = x + ox - cx, ddy = y + oy - cy;
            const dd = hyp(ddx, ddy), aa = Math.atan2(ddy, ddx);
            if (numeralHit(str, dd * angleDiff(ah, aa) + nw / 2, GH / 2 - (dd - (rIn + Rc) / 2))) cnt++;
          }
          if (cnt >= 2) numMask[i] = 1;
        }
        // half-hour diamonds between numerals
        const ahh = ah + (angleDiff(ah, a) > 0 ? Math.PI / 12 : -Math.PI / 12);
        const tq = d * angleDiff(ahh, a);
        if (Math.abs(tq) + Math.abs(v) < 3.6) { k = Math.abs(tq) + Math.abs(v) < 1.6 ? 'B5' : tq + v < 0 ? 'B4' : 'B2'; kind = 2; }
      } else if (d < Rc + 1.5) {
        kind = 2;
        const t = d - Rc;
        k = t < -0.5 ? 'B1' : t > 0.5 ? 'B2' : spec > 0.55 ? 'B5' : spec > -0.3 ? 'B4' : 'B3';
      } else if (d < rOut - 0.8) {
        // minute track: hour bars (brass), minutes (dark), quarter-minute hairlines
        id = 30000;
        const sub = Math.max(1, Math.round((TAU * (Rc + 11)) / 60 / 13));
        const n = 60 * sub;
        const j = ((Math.round(((a + Math.PI / 2) / TAU) * n) % n) + n) % n;
        const aj = -Math.PI / 2 + (j / n) * TAU;
        const dt = d * Math.abs(angleDiff(aj, a));
        const depth = d - Rc;
        if (j % (5 * sub) === 0 && dt < 2.6 && depth > 2.5 && depth < 19) { k = dt < 0.9 ? (spec > 0 ? 'B6' : 'B5') : angleDiff(aj, a) * spec < 0 ? 'B4' : 'B2'; kind = 2; }
        else if (j % sub === 0 && dt < 0.95 && depth > 3 && depth < 15) { k = 'K3'; kind = 2; }
        else if (dt < 0.6 && depth > 3 && depth < 9) { k = 'K5'; kind = 2; }
      } else if (d < rOut + 1.2) {
        kind = 2;
        k = d - rOut < 0 ? (spec > 0.2 ? 'B4' : 'B3') : 'B1';
      } else if (d < rBez - 4) {
        const bw = 62;
        const band = Math.floor((d - rOut) / bw);
        const rm = rOut + (band + 0.5) * bw;
        const n = Math.max(12, Math.round((TAU * rm) / 70));
        const sec = Math.floor((((a + Math.PI) / TAU) * n + (band % 2) * 0.5)) % n;
        id = 40000 + band * 1024 + sec;
      } else if (d < rBez + 4) {
        kind = 2;
        const t = d - rBez;
        const rivet = ((((a + Math.PI) * rBez) % 22) + 22) % 22;
        if (Math.abs(t) < 1.6 && rivet < 2.2) k = rivet < 1.1 && t < 0.4 ? 'B6' : 'B1';
        else k = t < -3 ? 'B1' : t < -2 ? 'B3' : t < -0.5 ? (spec > 0.3 ? 'B5' : 'B4') : t < 1 ? 'B4' : t < 2.5 ? 'B3' : 'B2';
      } else {
        // the roof of the tower beyond the dial: granite flagstones
        kind = 3;
        const row = y >> 4;
        const off = (row % 2) * 16;
        const sx = Math.floor((x + off) / 32);
        id = 50000 + row * 64 + sx;
      }
      // the stopped hands (blued steel) lie on top of everything but the arbor
      const hc = handAt(x, y);
      if (hc && !(D.hub && d < 14.8)) { k = hc === 1 ? 'U0' : hc === 2 ? 'U1' : hc === 3 ? 'U2' : (b < 0.5 ? 'U4' : 'U3'); kind = 2; }
      reg[i] = id;
      kindArr[i] = kind;
      if (!k) {
        if (kind === 3) {
          let L = 6;
          const g = hash2(id, 3, seed);
          if (g > 0.6) L = 5;
          if (hash2(x, y, seed + 5) > 0.93) L--;
          k = KS[L];
        } else {
          k = marbleKey(x, y, id, seed, b, id >= 20000 && id < 30000 ? 1 : 0, D.cloud);
        }
      }
      // hand cast shadows (they lie a few px proud of the dial)
      if (kind !== 2 && handAt(x - 3, y - 3)) k = dk(k, 2);
      key[i] = k;
    }

  // seams & bevels between panels; inlaid brass numerals with a cut edge
  const R = (x: number, y: number) => (x < 0 || y < 0 || x >= pw || y >= ph ? -9 : reg[y * pw + x]);
  const N = (x: number, y: number) => (x < 0 || y < 0 || x >= pw || y >= ph ? 0 : numMask[y * pw + x]);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const i = y * pw + x;
      if (!isFloorPx[i]) continue;
      let k = key[i];
      const id = reg[i];
      if (numMask[i]) {
        const tl = !N(x - 1, y) || !N(x, y - 1), br = !N(x + 1, y) || !N(x, y + 1);
        k = tl && !br ? 'B5' : br && !tl ? 'B2' : tl && br ? 'B4' : bayer(x, y) < 0.2 ? 'B5' : 'B4';
      } else if (N(x - 1, y) || N(x, y - 1)) k = dk(k, 2); // groove shadow right/below a numeral
      else if (kindArr[i] !== 2 && id >= 0) {
        const r = R(x + 1, y), d2 = R(x, y + 1);
        if ((r >= 0 && r !== id) || (d2 >= 0 && d2 !== id)) k = kindArr[i] === 3 ? 'K3' : 'K5';
        else {
          const l = R(x - 1, y), u = R(x, y - 1);
          if ((l >= 0 && l !== id) || (u >= 0 && u !== id)) k = lt(k, 1);
        }
      }
      // moonlight sheen: a soft vertical streak of reflection below the moon on polished marble
      if (kindArr[i] === 1 && Math.abs(x - D.mx) < 90) {
        const sx = (x - D.mx) / 34, fall = Math.max(0, (y - D.my - D.mR) / 300);
        const sh = Math.exp(-sx * sx) * Math.exp(-fall * 2.2);
        if (sh * 1.25 > bayer(x, y) + 0.45) k = lt(k, 1);
      }
      // ambient occlusion: low balustrades cast short shadows, pedestals long ones
      const tx = x >> 4, ty = y >> 4;
      const ao = aoTop[i];
      const wallAboveTy = (y - ao) >> 4;
      const tall = ao <= 24 && wallAboveTy >= 0 && cf.inner[wallAboveTy * cf.w + tx] >= 0;
      let dark = 0;
      if (tall) { if (ao <= 4) dark = 2; else if (ao <= 10) dark = 1; else if (ao <= 18 && bayer(x, y) < 0.5) dark = 1; }
      else { if (ao <= 2) dark = 2; else if (ao <= 6) dark = 1; else if (ao <= 9 && bayer(x, y) < 0.4) dark = 1; }
      // shadow to the right of walls (light from the upper left)
      if ((x & 15) < 6) for (let s = 1; s <= 6; s++) {
        const lx = (x - s) >> 4;
        if (lx === tx) continue;
        const t = m.get(lx, ty);
        if (t === T.WALL || t === T.VOID) {
          const tallL = cf.inner[ty * cf.w + lx] >= 0;
          if (s <= 2) dark = Math.max(dark, 1);
          else if (tallL && s <= 6 && bayer(x, y) < 0.5) dark = Math.max(dark, 1);
          break;
        }
      }
      if (dark) k = dk(k, dark);
      pb.set(x, y, rgb(k));
    }

  // the sky: every pixel that is not dial is open night (balustrade strips draw on top)
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      if (isFloorPx[y * pw + x]) continue;
      pb.set(x, y, rgb(skyKey(x, y, D)));
    }
}

function marbleKey(x: number, y: number, id: number, seed: number, b: number, bright: number, cloud: Lattice): string {
  const hid = hash2(id, 77, seed);
  const th = hid * Math.PI;
  const cu = Math.cos(th), su = Math.sin(th);
  const u = x * cu + y * su, v = -x * su + y * cu;
  let L = 6 + bright;
  // soft clouding (large, gently dithered)
  const cl = cloud.at(x + hid * 97, y + hid * 53);
  if (cl < 0.36 && b < (0.36 - cl) * 3.5) L--;
  else if (cl > 0.66 && b < (cl - 0.66) * 3) L++;
  // long meandering veins — only some slabs are strongly figured
  if (hid > 0.35) {
    const n1 = fbm2(u * 0.011 + hid * 91, v * 0.04, seed + 61, 2);
    const vein = Math.abs(n1 - 0.5);
    if (vein < 0.0045) L = Math.max(L + 1, 7 + bright);
    else if (vein < 0.011 && b < 0.28) L = Math.max(L, 7 + bright);
  }
  if (hash2(x, y, seed + 64) > 0.992) L = Math.max(5, L - 1);
  return KS[clamp(L, 4, 10)];
}

// ───────────────────────────── pits: holes open to the night below ─────────────────────────────
const CLIFF_D = 14;
function paintPits(pb: PixelBuf, c: PaintCtx) {
  const { m, seed } = c;
  const cf = data(m, seed);
  const D = cf.dial;
  const pit = (tx: number, ty: number) => m.get(tx, ty) === T.PIT;
  const setK = (x: number, y: number, k: string) => pb.set(x, y, rgb(k));
  // jagged broken edge: 0..2 px of marble left standing inside the opening
  const jag = (a: number, b: number) => {
    const v = hash2(a >> 1, b, seed + 31) * 0.6 + hash2(a, b, seed + 32) * 0.4;
    return v > 0.78 ? 2 : v > 0.42 ? 1 : 0;
  };
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (!pit(tx, ty)) continue;
      const nTop = !pit(tx, ty - 1), nL = !pit(tx - 1, ty), nR = !pit(tx + 1, ty), nB = !pit(tx, ty + 1);
      for (let py = 0; py < TS; py++)
        for (let px = 0; px < TS; px++) {
          const x = tx * TS + px, y = ty * TS + py;
          const jt = nTop ? jag(x, 1) : -1, jb = nB ? jag(x, 2) : -1, jl = nL ? jag(y, 3) : -1, jr = nR ? jag(y, 4) : -1;
          // broken marble lip left standing (keeps the floor colour already painted underneath)
          if (py < jt || 15 - py < jb || px < jl || 15 - px < jr) {
            if (py === jt - 1 && nTop) setK(x, y, 'K5');
            else if (15 - py === jb - 1 && nB) setK(x, y, 'K9');
            else if (px === jl - 1 && nL) setK(x, y, 'K8');
            else if (15 - px === jr - 1 && nR) setK(x, y, 'K5');
            continue;
          }
          let k: string;
          const cy = py - Math.max(0, jt);
          const cliffEnd = CLIFF_D - 2 + Math.floor(hash2(x >> 2, ty, seed + 33) * 4);
          if (nTop && cy < cliffEnd) {
            // cut section of the dial: lit marble lip, slab, brass backing plate, masonry, darkness
            const joint = ((x + (cy > 9 ? 5 : 0)) % 11) === 0;
            const rib = (x % 7) === 3;
            k = cy === 0 ? 'K9' : cy === 1 ? 'K8' : cy === 2 ? 'K7' : cy === 3 ? 'K6'
              : cy === 4 ? 'B4' : cy === 5 ? 'B2' : cy === 6 ? 'B1'
              : cy < 9 ? (joint ? 'K2' : rib ? 'K5' : 'K4') : cy < 11 ? (joint ? 'K1' : rib ? 'K4' : 'K3')
              : cy < cliffEnd - 1 ? (rib ? 'K3' : 'K2') : 'K1';
            if ((nL && px <= Math.max(0, jl)) || (nR && px >= 15 - Math.max(0, jr))) k = dk(k, 1);
            // brass brackets hanging beneath the plate
            const hb = hash2(x >> 1, ty, seed + 17);
            if (cy >= 7 && hb > 0.9 && (x & 1) === 0 && cy < 7 + (Math.floor(hb * 40) % 6)) k = cy === 7 ? 'B3' : 'B2';
          } else {
            let e = 99;
            if (nL) e = Math.min(e, px - Math.max(0, jl));
            if (nR) e = Math.min(e, 15 - px - Math.max(0, jr));
            if (nB) e = Math.min(e, 15 - py - Math.max(0, jb));
            if (nTop) e = Math.min(e, cy - cliffEnd + 2);
            if (!pit(tx - 1, ty - 1) && px < 2 && py < 2) e = Math.min(e, Math.max(px, py));
            if (!pit(tx + 1, ty - 1) && px > 13 && py < 2) e = Math.min(e, Math.max(15 - px, py));
            k = abyssKey(x, y, D, e);
          }
          setK(x, y, k);
        }
    }
  // cracks radiating from the corners of each hole — the dial broke here
  const rng = new RNG(seed + 555);
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      if (!pit(tx, ty)) continue;
      const corners: [number, number, number, number][] = [];
      if (!pit(tx - 1, ty) && !pit(tx, ty - 1)) corners.push([tx * TS - 1, ty * TS - 1, -1, -1]);
      if (!pit(tx + 1, ty) && !pit(tx, ty - 1)) corners.push([tx * TS + TS, ty * TS - 1, 1, -1]);
      if (!pit(tx - 1, ty) && !pit(tx, ty + 1)) corners.push([tx * TS - 1, ty * TS + TS, -1, 1]);
      if (!pit(tx + 1, ty) && !pit(tx, ty + 1)) corners.push([tx * TS + TS, ty * TS + TS, 1, 1]);
      for (const [x0, y0, sx, sy] of corners) {
        for (let n = 0; n < 2; n++) {
          let x = x0, y = y0;
          const len = rng.int(5, 13);
          for (let st = 0; st < len; st++) {
            if (m.get(x >> 4, y >> 4) !== T.FLOOR) break;
            setK(x, y, st < 4 ? 'K4' : 'K5');
            if (st < 3 && rng.chance(0.5)) setK(x + (rng.chance(0.5) ? sx : 0), y + sy, 'K6');
            if (rng.chance(0.5)) x += sx; else y += sy;
            if (rng.chance(0.2)) { if (rng.chance(0.5)) x -= sx; else y -= sy; }
          }
        }
      }
    }
  cf.snap = pb.data.slice();
}

// ───────────────────────────── dressing ─────────────────────────────
function paintDressing(pb: PixelBuf, c: PaintCtx) {
  const { m, seed } = c;
  const cf = data(m, seed);
  const snap = cf.snap;
  for (const p of m.props) {
    if (p.type !== 'puddle') continue;
    const bx = p.tx * TS + 8, by = p.ty * TS + 8;
    // there is no water on the dial: restore the marble, then inlay a small brass compass star
    if (snap) for (let y = by - 7; y <= by + 7; y++) for (let x = bx - 12; x <= bx + 12; x++) {
      if (x < 0 || y < 0 || x >= cf.pw || y >= cf.ph) continue;
      if (m.get(x >> 4, y >> 4) !== T.FLOOR) continue;
      const i = (y * cf.pw + x) * 4;
      pb.set(x, y, [snap[i], snap[i + 1], snap[i + 2]]);
    }
    compassInlay(pb, bx, by, 6, seed + p.tx * 31 + p.ty);
  }
}

function compassInlay(pb: PixelBuf, cx: number, cy: number, rs: number, s: number) {
  const rot = hash2(s, 1, 9) < 0.5 ? 0 : Math.PI / 4;
  for (let y = -rs - 1; y <= rs + 1; y++)
    for (let x = -rs - 1; x <= rs + 1; x++) {
      const u = x + 0.5, v = y + 0.5;
      const r = hyp(u, v), ang = Math.atan2(v, u) + rot;
      const r1 = rs * (0.2 + 0.8 * Math.pow(Math.abs(Math.cos(ang * 2)), 12));
      const r2 = rs * 0.55 * (0.35 + 0.65 * Math.pow(Math.abs(Math.sin(ang * 2)), 12));
      const lim = Math.max(r1, r2);
      if (r < lim) {
        const lit = (u * -0.6 + v * -0.8) < 0 ? (Math.sin(ang * 4) > 0 ? 'B4' : 'B3') : (Math.sin(ang * 4) > 0 ? 'B3' : 'B2');
        pb.set(cx + x, cy + y, rgb(r < 1.2 ? 'B6' : r > lim - 0.9 ? 'B1' : lit));
      }
    }
}

// ───────────────────────────── walls ─────────────────────────────
function paintCap(pb: PixelBuf, c: PaintCtx, tx: number, ty: number, oy: number) {
  const cf = data(c.m, c.seed);
  const i = ty * cf.w + tx;
  if (cf.bnd[i]) { if (cf.par[i]) paintBalustrade(pb, cf, tx, ty); return; }
  paintPedestalCap(pb, c, cf, tx, ty, oy);
}

function paintFace(pb: PixelBuf, c: PaintCtx, tx: number, ty: number, oy: number, H: number, _exterior: boolean) {
  const cf = data(c.m, c.seed);
  if (cf.bnd[ty * cf.w + tx]) return;
  paintPedestalFace(pb, c, cf, tx, ty, oy, H);
}

/** low balustrade cell: a small height-field projected 3/4 into the wall strip */
function paintBalustrade(pb: PixelBuf, cf: CF, tx: number, ty: number) {
  const { pw, ph, foot, fk } = cf;
  const sy0 = ty * TS - 32;
  const F = (x: number, y: number) => (x < 0 || y < 0 || x >= pw || y >= ph ? 0 : foot[y * pw + x]);
  for (let py = 0; py < TS; py++)
    for (let px = 0; px < TS; px++) {
      const X = tx * TS + px, Y = ty * TS + py;
      const i = Y * pw + X;
      const hgt = foot[i];
      if (!hgt) continue;
      const kind = fk[i];
      const below = F(X, Y + 1);
      if (below < hgt) {
        for (let z = Math.min(below, hgt); z < hgt; z++) {
          const k = faceKey(cf, kind, X, Y, hgt - 1 - z, i);
          if (k) pb.set(X, Y - z - sy0, rgb(k));
        }
      }
      pb.set(X, Y - hgt - sy0, rgb(topKey(cf, kind, X, Y, hgt, F)));
    }
}

function topKey(cf: CF, kind: number, X: number, Y: number, h: number, F: (x: number, y: number) => number): string {
  const m = cf.m;
  const front = F(X, Y + 1) < h, back = F(X, Y - 1) < h, left = F(X - 1, Y) < h, right = F(X + 1, Y) < h;
  if (kind === 3) {
    if (left || back) return front ? 'B3' : 'B5';
    if (right || front) return 'B2';
    const lx = cf.fx[Y * cf.pw + X];
    const fy = cf.fy[Y * cf.pw + X];
    if ((lx === 3 || lx === 4) && (fy === 3 || fy === 4)) return lx === 3 && fy === 3 ? 'B6' : 'B4';
    return lx <= 2 && fy <= 2 ? 'K10' : 'K9';
  }
  if (front) return 'B4';
  const openL = isOpenT(m.get((X - 1) >> 4, Y >> 4)), openR = isOpenT(m.get((X + 1) >> 4, Y >> 4));
  if (left && openL) return 'B4';
  if (right && openR) return 'B3';
  if (back) return 'K7';
  if (left) return 'K10';
  if (right) return 'K8';
  const s = hash2(X, Y, 707);
  return s > 0.94 ? 'K10' : s < 0.05 ? 'K8' : 'K9';
}

function faceKey(cf: CF, kind: number, X: number, _Y: number, k: number, i: number): string | null {
  if (kind === 3) {
    const lx = cf.fx[i];
    if (k === 0) return 'B3';
    if (k === 1) return 'B1';
    if (k === 2) return 'K6';
    if (k === 7) return lx === 0 ? 'B4' : lx === 7 ? 'B1' : 'B3';
    if (k === 8) return 'B1';
    if (k === 13) return lx === 7 ? 'K7' : 'K9';
    if (k === 14 || k === 15) return lx === 0 ? 'K8' : lx === 7 ? 'K5' : 'K7';
    if (k === 16) return 'B2';
    if (k >= 17) return 'K3';
    return lx === 0 ? 'K10' : lx === 1 ? 'K9' : lx >= 6 ? 'K6' : 'K8';
  }
  switch (k) {
    case 0: return 'B2';
    case 1: return 'K8';
    case 2: return 'K6';
    case 9: return 'K8';
    case 10: return 'K7';
    case 11: return 'B2';
    case 12: return 'K3';
  }
  const r = k - 3; // 0..5 baluster zone, top → bottom
  if (kind === 4) {
    // entry gate: brass bars with spear tips
    const c = ((X % 3) + 3) % 3;
    if (c !== 0) return r === 5 ? 'B1' : null;
    return r === 0 ? 'B5' : r < 3 ? 'B4' : 'B3';
  }
  const c = ((X % 6) + 6) % 6;
  const wide = r === 1 || r === 2 || r === 5;
  if (wide) {
    if (c > 3) return null;
    return c === 0 ? 'K9' : c === 1 ? 'K8' : c === 2 ? 'K7' : 'K5';
  }
  if (c !== 1 && c !== 2) return null;
  return c === 1 ? 'K9' : 'K6';
}

/** faceted 8-point compass rose; returns a brass key or '' */
function roseKey(u: number, v: number, rs: number): string {
  const r = hyp(u, v);
  if (r < 1.1) return 'B6';
  const ang = Math.atan2(v, u);
  const q4 = Math.PI / 2;
  const d1 = angleDiff(Math.round(ang / q4) * q4, ang);
  const d2 = angleDiff(Math.round((ang - q4 / 2) / q4) * q4 + q4 / 2, ang);
  const R1 = rs * 0.2 + rs * 0.8 * Math.max(0, 1 - Math.abs(d1) / 0.62);
  const R2 = rs * 0.16 + rs * 0.42 * Math.max(0, 1 - Math.abs(d2) / 0.55);
  if (r < R1 && R1 >= R2) return d1 > 0 ? 'B5' : 'B2';
  if (r < R2) return d2 > 0 ? 'B4' : 'B1';
  if (r < R1) return d1 > 0 ? 'B5' : 'B2';
  return '';
}

function paintPedestalCap(pb: PixelBuf, c: PaintCtx, cf: CF, tx: number, ty: number, oy: number) {
  const box = cf.boxes[cf.inner[ty * cf.w + tx]];
  const same = (x: number, y: number) => c.m.in(x, y) && cf.inner[y * cf.w + x] === cf.inner[ty * cf.w + tx];
  const nN = same(tx, ty - 1), nS = same(tx, ty + 1), nW = same(tx - 1, ty), nE = same(tx + 1, ty);
  const bw = (box.x1 - box.x0 + 1) * TS, bh = (box.y1 - box.y0 + 1) * TS;
  for (let py = 0; py < TS; py++)
    for (let px = 0; px < TS; px++) {
      const X = tx * TS + px, Y = ty * TS + py;
      const b = bayer(X, Y);
      let k = marbleKey(X, Y, 90000 + cf.inner[ty * cf.w + tx], c.seed, b, 1, cf.dial.cloud);
      if ((!nN && py === 2) || (!nW && px === 2)) k = 'K9';
      if ((!nS && py === 13) || (!nE && px === 13)) k = 'K5';
      if ((!nN && py === 1) || (!nW && px === 1)) k = 'B2';
      if ((!nS && py === 14) || (!nE && px === 14)) k = 'B1';
      if ((!nN && py === 0) || (!nW && px === 0)) k = 'B5';
      if ((!nS && py === 15) || (!nE && px === 15)) k = 'B3';
      const u = X - box.x0 * TS - bw / 2 + 0.5, v = Y - box.y0 * TS - bh / 2 + 0.5;
      const rk = roseKey(u, v, Math.min(bw, bh) / 2 - 4);
      if (rk) k = rk;
      pb.set(X, oy + py, rgb(k));
    }
}

/** pedestal face: brass cornice, lapis panels engraved with constellations, brass base */
function paintPedestalFace(pb: PixelBuf, c: PaintCtx, cf: CF, tx: number, ty: number, oy: number, H: number) {
  const same = (x: number, y: number) => c.m.in(x, y) && cf.inner[y * cf.w + x] === cf.inner[ty * cf.w + tx];
  const turnW = !same(tx - 1, ty), turnE = !same(tx + 1, ty);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < TS; px++) {
      const X = tx * TS + px;
      const k32 = H === 32 ? py : py < 4 ? py : 24 + (py - 4);
      let k: string;
      if (k32 === 0) k = 'K8';
      else if (k32 === 1) k = 'B4';
      else if (k32 === 2) k = (X & 7) === 3 ? 'B6' : 'B5';
      else if (k32 === 3) k = 'B2';
      else if (k32 === 4) k = 'K1';
      else if (k32 === 13) k = (X & 7) === 4 ? 'B5' : 'B3';
      else if (k32 === 14) k = 'B1';
      else if (k32 < 23) {
        // recessed lapis panel with a raised frame
        const frame = px === 1 || px === 14 || k32 === 5 || k32 === 12 || k32 === 15 || k32 === 22;
        if (px === 0 || px === 15) k = 'U1';
        else if (frame) k = px === 14 || k32 === 12 || k32 === 22 ? 'U0' : 'U2';
        else {
          k = 'U0';
          const st = hash2(X, k32 + ty * 37, c.seed + 9);
          if (st > 0.94) k = st > 0.985 ? 'K9' : 'U3';
          else if (st < 0.04) k = 'K2';
        }
      } else if (k32 === 23) k = 'K1';
      else if (k32 === 24) k = 'B3';
      else if (k32 === 25) k = (X & 7) === 4 ? 'B6' : 'B4';
      else if (k32 === 26) k = 'B2';
      else if (k32 === 27) k = 'B1';
      else if (k32 === 28) k = 'K5';
      else if (k32 === 29) k = 'K4';
      else if (k32 === 30) k = 'K3';
      else k = 'K2';
      if (turnW && px === 0) k = lt(k, 1);
      if (turnE && px === 15) k = dk(k, 1);
      pb.set(X, oy + py, rgb(k));
    }
}

// ───────────────────────────── animated dressing (entities) ─────────────────────────────
const STAR_ROWS = [
  ['...v...', '...w...', '..vWv..', 'vwWWWwv', '..vWv..', '...w...', '...v...'],
  ['.......', '.v.w.v.', '..vWv..', '.wWWWw.', '..vWv..', '.v.w.v.', '.......'],
  ['v.....v', '.v...v.', '..wWw..', '..WWW..', '..wWw..', '.v...v.', 'v.....v'],
];
let STARS_W: Sprite[] | null = null, STARS_V: Sprite[] | null = null, CRADLE: Sprite | null = null, SCONCE: Sprite | null = null;
function lampArt() {
  if (!STARS_W) {
    const mk = (pal: Record<string, string>) => [0, 1, 2, 1].map((f) => spriteFromDef({ rows: STAR_ROWS[f], pal, ox: 3, oy: 3, outline: false }));
    STARS_W = mk({ W: 'W', w: 'K10', v: 'U4' });
    STARS_V = mk({ W: 'W', w: 'V4', v: 'V3' });
    CRADLE = spriteFromDef({
      rows: ['n.....n', 'nb...bn', '.nb.bn.', '..nbn..', '...b...', '...m...', '..mbm..'],
      pal: { n: 'B2', b: 'B4', m: 'B1' }, ox: 3, oy: 7,
    });
    SCONCE = spriteFromDef({
      rows: ['.n...n.', '.nb.bn.', '..nbn..', '...b...', '.mmbmm.', '..mmm..'],
      pal: { n: 'B2', b: 'B4', m: 'B1' }, ox: 3, oy: 3,
    });
  }
  return { W: STARS_W!, V: STARS_V!, cradle: CRADLE!, sconce: SCONCE! };
}

/** walllamp → a brass cradle on a newel post holding a captive star (white-blue or violet) */
class StarLamp extends Entity {
  t = frand(0, 10);
  constructor(x: number, y: number, private violet: boolean, private wall: boolean, bias: number) {
    super();
    this.x = x; this.y = y;
    this.sortBias = bias;
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const A = lampArt();
    const bob = Math.round(Math.sin(this.t * 1.9));
    const fr = (this.violet ? A.V : A.W)[Math.floor(this.t * 5) % 4];
    const sy = this.wall ? this.y - 4 : this.y - 9;
    drawSprite(r.w, this.wall ? A.sconce : A.cradle, this.x, this.wall ? this.y : this.y);
    drawSprite(r.u, fr, this.x, sy + bob);
    const pulse = 0.88 + Math.sin(this.t * 3.1) * 0.07 + Math.sin(this.t * 7.3) * 0.04;
    const lc = this.violet ? 'V3' : 'U4';
    r.lightAt(this.x, this.y + 14, 100 * pulse, lc, 0.3);
    r.lightAt(this.x, sy, 30, 'K10', 0.28 * pulse);
    r.glowAt(this.x, sy + bob, 11, lc, 0.32 * pulse);
    r.glowAt(this.x, sy + bob, 4, 'W', 0.35 * pulse);
  }
}

function px1(ctx: CanvasRenderingContext2D, x: number, y: number, k: string) { ctx.fillStyle = col(k); ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }

/** project a ring (unit normal n) of radius R: screen offsets + depth (z > 0 = toward camera) */
function ringPts(nx: number, ny: number, nz: number, R: number, tilt: number): { x: number; y: number; z: number }[] {
  let ux = -ny, uy = nx;
  const uz = 0;
  if (hyp(ux, uy) < 1e-3) { ux = 1; uy = 0; }
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const out: { x: number; y: number; z: number }[] = [];
  const n = Math.round(R * 7);
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU;
    const px = (Math.cos(a) * ux + Math.sin(a) * vx) * R;
    const py = (Math.cos(a) * uy + Math.sin(a) * vy) * R;
    const pz = (Math.cos(a) * uz + Math.sin(a) * vz) * R;
    out.push({ x: px, y: -(py * ct - pz * st), z: py * st + pz * ct });
  }
  return out;
}

const ARM_FR = 24;
let ARM: { back: Sprite[]; front: Sprite[]; stand: Sprite; R: number } | null = null;
function armillaryArt() {
  if (ARM) return ARM;
  const R = 12, S = 34, c = 17;
  const back: Sprite[] = [], front: Sprite[] = [];
  for (let f = 0; f < ARM_FR; f++) {
    const t = (f / ARM_FR) * Math.PI; // the ring set repeats after half a turn
    const rings: [number, number, number, number][] = [
      [0, 1, 0, 0],                                                                              // horizon
      [Math.cos(t), 0, Math.sin(t), 1],                                                          // meridian (turning)
      [Math.sin(0.41) * Math.cos(t + 1.2), Math.cos(0.41), Math.sin(0.41) * Math.sin(t + 1.2), 2], // ecliptic
    ];
    const bb = new PixelBuf(S, S), fb = new PixelBuf(S, S);
    for (const [nx, ny, nz, idx] of rings) {
      const pts = ringPts(nx, ny, nz, idx === 0 ? R + 1 : idx === 2 ? R - 2 : R, 0.45);
      for (let k = 1; k < pts.length; k++) {
        const p0 = pts[k - 1], p1 = pts[k];
        const fr = (p0.z + p1.z) / 2 > 0;
        const hi = fr && (p1.x * -0.6 + p1.y * -0.8) > R * 0.35;
        const key = fr ? (hi ? 'B6' : idx === 2 ? 'B5' : 'B4') : idx === 2 ? 'B2' : 'B1';
        (fr ? fb : bb).line(c + p0.x, c + p0.y, c + p1.x, c + p1.y, rgb(key));
      }
    }
    back.push(spriteFromBuf(bb, c, c, false));
    front.push(spriteFromBuf(fb, c, c));
  }
  const stand = spriteFromDef({
    rows: ['...n...', '...b...', '..nbn..', '...b...', '...b...', '.nnbnn.', 'nbYbbbn', 'nnnnnnn'],
    pal: { n: 'B1', b: 'B3', Y: 'B5' }, ox: 3, oy: 8,
  });
  ARM = { back, front, stand, R };
  return ARM;
}

/** an armillary sphere turning on top of a marble pedestal, a captive star at its heart */
class Armillary extends Entity {
  t = frand(0, 100);
  constructor(x: number, y: number, bias: number) {
    super();
    this.x = x; this.y = y; this.sortBias = bias;
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const A = armillaryArt();
    const L = lampArt();
    const x = this.x, y = this.y;
    const cy = y - 8 - A.R;
    const f = Math.floor(this.t * 5) % ARM_FR;
    drawSprite(r.w, A.stand, x, y);
    drawSprite(r.w, A.back[f], x, cy);
    drawSprite(r.u, L.V[Math.floor(this.t * 4) % 4], x, cy);
    drawSprite(r.w, A.front[f], x, cy);
    const pulse = 0.9 + Math.sin(this.t * 2.3) * 0.08;
    r.glowAt(x, cy, 10, 'V3', 0.3 * pulse);
    r.lightAt(x, cy, 60, 'V3', 0.2 * pulse);
    r.lightAt(x, cy, 20, 'K10', 0.16);
  }
}

let ORR: { back: Sprite; front: Sprite; stem: Sprite; sun: Sprite } | null = null;
function orreryArt() {
  if (ORR) return ORR;
  const S = 32, c = 16;
  const bb = new PixelBuf(S, S), fb = new PixelBuf(S, S);
  for (const R of [8, 13]) {
    const n = R * 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const z = Math.sin(a);
      const x = c + Math.cos(a) * R, y = c + z * R * 0.36;
      if (z > 0) fb.set(Math.round(x), Math.round(y), rgb(Math.cos(a) < -0.3 ? 'B5' : 'B3'));
      else bb.set(Math.round(x), Math.round(y), rgb('B1'));
    }
  }
  const stem = spriteFromDef({ rows: ['.b.', '.b.', '.b.', '.b.', 'nbn', 'mbm', 'mmm'], pal: { b: 'B3', n: 'B4', m: 'B1' }, ox: 1, oy: 7 });
  const sun = spriteFromDef({ rows: ['.YB.', 'YWBb', 'BBbb', '.bb.'], pal: { W: 'B6', Y: 'B5', B: 'B4', b: 'B3' }, ox: 2, oy: 2 });
  ORR = { back: spriteFromBuf(bb, c, c, false), front: spriteFromBuf(fb, c, c, false), stem, sun };
  return ORR;
}

/** wallgear → a little brass orrery on a newel post: sun and two planets on wire orbits */
class Orrery extends Entity {
  t = frand(0, 100);
  constructor(x: number, y: number, bias: number) {
    super();
    this.x = x; this.y = y; this.sortBias = bias;
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const A = orreryArt();
    const ctx = r.w;
    const x = Math.round(this.x), y = Math.round(this.y);
    const sx = x, sy = y - 11;
    drawSprite(ctx, A.stem, x, y);
    const planets = [{ R: 8, sp: 0.9, c: 'U3', hi: 'U4', s: 2 }, { R: 13, sp: 0.42, c: 'R2', hi: 'R4', s: 2 }];
    const drawPlanets = (front: boolean) => {
      for (const o of planets) {
        const pa = this.t * o.sp + o.R;
        const pz = Math.sin(pa);
        if ((pz > 0) !== front) continue;
        const ppx = Math.round(sx + Math.cos(pa) * o.R - 1), ppy = Math.round(sy + pz * o.R * 0.36 - 1);
        ctx.fillStyle = col('K0'); ctx.fillRect(ppx - 1, ppy - 1, o.s + 2, o.s + 2);
        ctx.fillStyle = col(o.c); ctx.fillRect(ppx, ppy, o.s, o.s);
        px1(ctx, ppx, ppy, o.hi);
      }
    };
    drawSprite(ctx, A.back, sx, sy);
    drawPlanets(false);
    drawSprite(ctx, A.sun, sx, sy);
    drawSprite(ctx, A.front, sx, sy);
    drawPlanets(true);
    r.lightAt(sx, sy, 34, 'B5', 0.2);
    r.glowAt(sx, sy, 5, 'B5', 0.3);
  }
}

/** The sky: backdrop beyond the map, twinkling parallax stars over every open patch of night,
 *  the moon's light, rising star-motes from the holes and the odd shooting star. */
class SkyDome extends Entity {
  private back: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private maskA: Uint8Array;
  private mw: number; private mh: number;
  private S: HTMLCanvasElement; private sx: CanvasRenderingContext2D;
  private stars: { x: number; y: number; tier: number; f: number; p: number }[] = [];
  private meteors: { x: number; y: number; vx: number; vy: number; t: number; dur: number }[] = [];
  private meteorT = frand(3, 7);
  private moteT = 0;
  private pitPx: number[] = [];
  private cam0x: number; private cam0y: number;
  t = 0;

  constructor(private cf: CF) {
    super();
    const { pw, ph, m, dial } = cf;
    this.mw = pw + PADX * 2; this.mh = ph + PADY * 2;
    // backdrop outside the map
    const bb = new PixelBuf(this.mw, this.mh);
    const mk = new PixelBuf(this.mw, this.mh);
    const W: RGB = [255, 255, 255];
    const needX = Math.min(PADX, Math.max(0, (WORLD_W - pw) / 2) + 16);
    const needT = 24, needB = Math.min(PADY, Math.max(0, (WORLD_H - ph - 8) / 2) + 24);
    for (let y = 0; y < this.mh; y++)
      for (let x = 0; x < this.mw; x++) {
        const wx = x - PADX, wy = y - PADY;
        if (wx < -needX || wx >= pw + needX || wy < -needT || wy >= ph + needB) continue;
        const inside = wx >= 0 && wy >= 0 && wx < pw && wy < ph;
        const inMoon = hyp(wx - dial.mx, wy - dial.my) < dial.mR + 1;
        if (!inside) {
          bb.set(x, y, rgb(skyKey(wx, wy, dial)));
          if (!inMoon) mk.set(x, y, W);
          continue;
        }
        if (inMoon) continue;
        const tx = wx >> 4, ty = wy >> 4;
        const t = m.get(tx, ty);
        let sky = false;
        if (t === T.VOID) sky = true;
        else if ((t === T.WALL || t === T.DOOR) && cf.bnd[ty * cf.w + tx]) sky = !(t === T.DOOR && !(m.entry && ty >= m.entry.ty));
        else if (t === T.PIT) {
          const top = m.get(tx, ty - 1) !== T.PIT;
          sky = !top || (wy & 15) >= CLIFF_D + 3;
          if (sky && (wx & 15) > 1 && (wx & 15) < 14 && (wy & 15) < 14) this.pitPx.push(wx, wy);
        }
        if (sky) mk.set(x, y, W);
      }
    this.back = bb.toCanvas();
    this.mask = mk.toCanvas();
    this.maskA = new Uint8Array(this.mw * this.mh);
    for (let i = 0; i < this.maskA.length; i++) this.maskA[i] = mk.data[i * 4 + 3];
    [this.S, this.sx] = makeCanvas(WORLD_W, WORLD_H);
    const rng = new RNG(dial.seed + 4242);
    const n = Math.round((this.mw * this.mh) / 520);
    for (let i = 0; i < n; i++) {
      const r = rng.next();
      this.stars.push({ x: rng.range(0, this.mw), y: rng.range(0, this.mh), tier: r < 0.68 ? 0 : r < 0.9 ? 1 : r < 0.975 ? 2 : 3, f: rng.range(0.7, 3.2), p: rng.range(0, TAU) });
    }
    this.cam0x = pw / 2; this.cam0y = ph / 2;
  }

  update(dt: number) {
    this.t += dt;
    // shooting stars
    this.meteorT -= dt;
    if (this.meteorT <= 0) {
      this.meteorT = frand(4, 9);
      const v = this.world.cam.view();
      const a = frand(0.3, 0.7) * (frand() < 0.5 ? 1 : -1) + (frand() < 0.5 ? 0 : Math.PI);
      const sp = frand(220, 320);
      this.meteors.push({ x: v.x + frand(40, 600), y: v.y + frand(-10, 200), vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp * 0.6, t: 0, dur: frand(0.45, 0.8) });
    }
    for (const mt of this.meteors) { mt.t += dt; mt.x += mt.vx * dt; mt.y += mt.vy * dt; }
    this.meteors = this.meteors.filter((mt) => mt.t < mt.dur);
    // star-motes rising out of the holes in the dial
    this.moteT -= dt;
    if (this.moteT <= 0 && this.pitPx.length) {
      this.moteT = 0.07;
      const k = (Math.floor(frand(0, this.pitPx.length / 2))) * 2;
      this.world.particles.spawn({ kind: 'px', x: this.pitPx[k], y: this.pitPx[k + 1], vx: frand(-3, 3), vy: frand(-14, -6), life: frand(0.8, 1.6), ramp: ['K0', 'U3', 'U4', 'K10', 'U3', 'U1'], layer: 'glow', size: 1, alpha: 0.8 });
    }
  }

  renderGround(r: Renderer) {
    const { dial } = this.cf;
    const ctx = r.w;
    ctx.drawImage(this.back, -PADX, -PADY);
    // stars (masked to open night)
    const ix = Math.floor(r.camX), iy = Math.floor(r.camY);
    const s = this.sx;
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, WORLD_W, WORLD_H);
    const par = 0.62; // fraction of camera motion the far stars do NOT follow
    const offX = (r.camX - this.cam0x + WORLD_W / 2) * par, offY = (r.camY - this.cam0y + WORLD_H / 2) * par;
    const mw = this.mw, mh = this.mh;
    const ramp0 = ['K4', 'K6', 'U3', 'K7'];
    const glows: [number, number, number, string][] = [];
    for (const st of this.stars) {
      let wx = st.x + offX, wy = st.y + offY;
      wx = ((wx % mw) + mw) % mw - PADX;
      wy = ((wy % mh) + mh) % mh - PADY;
      const sxp = Math.round(wx - ix + 1), syp = Math.round(wy - iy + 1);
      if (sxp < -3 || syp < -3 || sxp > WORLD_W + 3 || syp > WORLD_H + 3) continue;
      const tw = 0.5 + 0.5 * Math.sin(this.t * st.f + st.p);
      if (st.tier === 0) {
        s.fillStyle = col(ramp0[Math.min(3, Math.floor(tw * 3.99))]);
        s.fillRect(sxp, syp, 1, 1);
      } else if (st.tier === 1) {
        s.fillStyle = col(tw > 0.8 ? 'W' : tw > 0.35 ? 'K9' : 'K7');
        s.fillRect(sxp, syp, 1, 1);
      } else {
        const big = st.tier === 3;
        const arm = tw > 0.55 ? (big ? 2 : 1) : big ? 1 : 0;
        s.fillStyle = col(big ? 'U4' : 'K8');
        for (let a = 1; a <= arm; a++) {
          if (a === 2) s.fillStyle = col(big ? 'V3' : 'U3');
          s.fillRect(sxp - a, syp, 1, 1); s.fillRect(sxp + a, syp, 1, 1);
          s.fillRect(sxp, syp - a, 1, 1); s.fillRect(sxp, syp + a, 1, 1);
        }
        s.fillStyle = col(tw > 0.3 ? 'W' : 'K10');
        s.fillRect(sxp, syp, 1, 1);
        if (big || tw > 0.85) glows.push([wx, wy, tw, big ? 'U4' : 'K10']);
      }
    }
    for (const mt of this.meteors) {
      const k = mt.t / mt.dur;
      const L = 14;
      const sp = hyp(mt.vx, mt.vy);
      const ux = mt.vx / sp, uy = mt.vy / sp;
      for (let i = 0; i < L; i++) {
        const px = Math.round(mt.x - ux * i - ix + 1), py = Math.round(mt.y - uy * i - iy + 1);
        s.fillStyle = col(i < 2 ? 'W' : i < 5 ? 'K10' : i < 9 ? 'U4' : 'U2');
        s.globalAlpha = (1 - k) * (1 - i / L);
        s.fillRect(px, py, 1, 1);
      }
      s.globalAlpha = 1;
    }
    s.globalCompositeOperation = 'destination-in';
    s.drawImage(this.mask, -PADX - ix + 1, -PADY - iy + 1);
    s.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.S, ix - 1, iy - 1);
    for (const [gx, gy, tw, c] of glows) {
      const mx = Math.round(gx) + PADX, my = Math.round(gy) + PADY;
      if (mx < 0 || my < 0 || mx >= mw || my >= mh || !this.maskA[my * mw + mx]) continue;
      r.glowAt(gx, gy, 5, c, 0.35 * tw);
    }
    // moonlight
    const mf = 0.94 + Math.sin(this.t * 0.7) * 0.03;
    r.lightAt(dial.mx, dial.my, dial.mR * 1.4, 'K10', 0.17 * mf);
    r.lightAt(dial.mx, dial.my + dial.mR + 70, 280, 'U4', 0.14 * mf);
    r.glowAt(dial.mx, dial.my, dial.mR * 1.8, 'U3', 0.1 * mf);
  }
}

/** The shadow of the great orrery turning slowly overhead sweeps across the dial. */
class OrreryShadow extends Entity {
  t = frand(0, 100);
  constructor(private px: number, private py: number, private L: number, private w: number, private full: boolean) {
    super();
  }
  update(dt: number) { this.t += dt; }
  renderGround(r: Renderer) {
    const ctx = r.w;
    // over the hub it turns right round the arbor; from beyond the rim it sweeps across the room
    const a = this.full ? this.t * 0.045 : Math.PI / 2 + Math.sin(this.t * 0.07) * 0.95;
    const ux = Math.cos(a), uy = Math.sin(a) * (this.full ? 0.62 : 1);
    const nx = -uy, ny = ux;
    const L = this.L, hw = 3;
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = col('K0');
    ctx.beginPath();
    ctx.moveTo(this.px + nx * hw, this.py + ny * hw);
    ctx.lineTo(this.px + ux * L + nx * hw, this.py + uy * L + ny * hw);
    ctx.lineTo(this.px + ux * L - nx * hw, this.py + uy * L - ny * hw);
    ctx.lineTo(this.px - nx * hw, this.py - ny * hw);
    ctx.closePath();
    ctx.fill();
    for (const [f, rad] of [[0.55, this.w * 0.45], [1, this.w]] as [number, number][]) {
      ctx.beginPath();
      ctx.ellipse(this.px + ux * L * f, this.py + uy * L * f, rad, rad * 0.62, 0, 0, TAU);
      ctx.fill();
    }
    // the orbit ring of the outer planet
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = col('K0');
    ctx.beginPath();
    ctx.ellipse(this.px + ux * L, this.py + uy * L, this.w * 1.9, this.w * 1.9 * 0.62, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

// ───────────────────────────── breakables of the summit ─────────────────────────────
// 'crate' → a marble chronometer case with a little brass-ringed dial; 'barrel' → a lapis
// celestial globe on a brass stand. Same rules as the generic Breakable (props.ts).
let CASE: Sprite | null = null, GLOBE: Sprite | null = null;
function breakableArt() {
  if (!CASE) {
    CASE = spriteFromDef({
      rows: [
        '.nnnnnnnnnnnnnn.',
        'nyYYYYYYYYYYYYBn',
        'nYXWWWWWWWWWWWmn',
        'nYWWWWWWWWWWWmmn',
        'nbbbbbbbbbbbbbbn',
        'nWwwwnBYYBnwwwmn',
        'nWwwnYXXWWYnwwmn',
        'nWwwBXWkWWWBwwmn',
        'nWwwBWWkkWWBwwmn',
        'nWwwnYWWWWYnwwmn',
        'nWwwwnBBBBnwwwmn',
        'nWwwwwwwwwwwwwmn',
        'nWmmmmmmmmmmmmMn',
        'nbbbbbbbbbbbbbbn',
        '.nBn........nBn.',
      ],
      pal: { n: 'B1', b: 'B2', B: 'B3', Y: 'B4', y: 'B5', W: 'K9', w: 'K8', m: 'K7', M: 'K6', k: 'K1', X: 'K10' },
      ox: 8, oy: 15,
    });
    const pb = new PixelBuf(16, 19);
    const cx = 7.5, cy = 7;
    for (let y = 0; y < 19; y++)
      for (let x = 0; x < 16; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = hyp(dx, dy);
        if (d < 6.2) {
          const lit = (dx * -0.6 + dy * -0.8) / 6.2;
          let k = lit > 0.45 ? 'U4' : lit > 0.1 ? 'U3' : lit > -0.3 ? 'U2' : d > 5.2 ? 'U0' : 'U1';
          if (hash2(x, y, 5) > 0.86 && d < 5.5) k = lit > 0 ? 'K10' : 'U4';
          pb.set(x, y, rgb(k));
        } else if (d < 7.6 && dx > -1.5) pb.set(x, y, rgb(dy < -2 ? 'B5' : dy < 3 ? 'B3' : 'B2')); // meridian ring
      }
    for (let y = 14; y < 17; y++) { pb.set(7, y, rgb('B3')); pb.set(8, y, rgb('B1')); }
    for (let x = 4; x < 12; x++) { pb.set(x, 17, rgb(x < 7 ? 'B4' : 'B2')); pb.set(x, 18, rgb('B1')); }
    GLOBE = spriteFromBuf(pb, 8, 18);
  }
  return { crate: CASE!, globe: GLOBE! };
}

class SummitBreakable extends Breakable {
  constructor(private ctx_: number, private cty: number, private sort: 'crate' | 'barrel') {
    super(ctx_, cty, sort);
  }
  hurt(info: DamageInfo): number {
    if (this.dead) return 0;
    this.hp -= info.amount;
    this.flash = 0.08;
    this.world.fx.hitSparks(this.x, this.y - 8, info.x !== undefined ? Math.atan2(this.y - (info.y ?? 0), this.x - info.x) : 0, 'normal', 6);
    sfx('clank', { vol: 0.35, pan: this.world.pan(this.x) });
    if (this.hp <= 0) this.smash();
    return info.amount;
  }
  smash() {
    if (this.dead) return;
    this.dead = true;
    const w = this.world;
    w.map.set(this.ctx_, this.cty, T.FLOOR);
    if (this.sort === 'barrel') {
      w.fx.shatter(this, ['U2', 'U3', 'U1', 'B3', 'K10'], 0.8);
      w.fx.burst(this.x, this.y - 8, 10, ['W', 'K10', 'U4'], 110, 0.35);
      sfx('cfShardBurst', { vol: 0.7, pan: w.pan(this.x) });
    } else {
      w.fx.shatter(this, ['K8', 'K9', 'K7', 'B3', 'B4'], 0.8);
      sfx('death', { vol: 0.7, pan: w.pan(this.x) });
    }
    if (frand() < 0.5) for (let i = 0; i < 2; i++) w.add(new Pickup(this.x, this.y - 4, 'brass', 1));
    if (frand() < 0.08) w.add(new Pickup(this.x, this.y - 4, 'heal', 8));
  }
  render(r: Renderer) {
    const A = breakableArt();
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    if (this.sort === 'barrel') {
      drawSprite(r.w, A.globe, this.x, this.y, { tint });
      r.glowAt(this.x - 1, this.y - 12, 6, 'U4', 0.15);
    } else drawSprite(r.w, A.crate, this.x, this.y, { tint });
  }
}

function decorate(w: World, m: RoomMap, rng: RNG) {
  const cf = data(m, rng.int(0, 1e6));
  // the generic sconces / wall gears / crates belong to the lower floors: reinterpret their hints here
  const gone = (e: Entity) => e instanceof WallLamp || e instanceof WallGear || (e instanceof Breakable && !(e instanceof SummitBreakable));
  const q = (w as unknown as { toAdd?: Entity[] }).toAdd;
  if (q) for (let i = q.length - 1; i >= 0; i--) if (gone(q[i])) q.splice(i, 1);
  for (const e of w.entities) if (gone(e)) e.kill();
  for (const p of m.props) if ((p.type === 'crate' || p.type === 'barrel') && m.get(p.tx, p.ty) === T.BLOCK) w.add(new SummitBreakable(p.tx, p.ty, p.type));

  w.add(new SkyDome(cf));
  // lamps / orreries on newel posts
  let n = 0;
  for (const p of cf.posts) {
    if (!p.tag) continue;
    const bias = (p.ty + 1) * TS + 0.5 - p.y;
    if (p.tag === 'walllamp') w.add(new StarLamp(p.x, p.y + 1, n++ % 3 === 1, false, bias));
    else if (p.tag === 'wallgear') w.add(new Orrery(p.x, p.y + 1, bias));
  }
  // lamps the generator hung on pedestal faces
  for (const p of m.props) {
    if (p.type !== 'walllamp') continue;
    if (cf.inner[p.ty * cf.w + p.tx] < 0) continue;
    w.add(new StarLamp(p.tx * TS + 8, p.ty * TS - 4, n++ % 3 === 1, true, TS + 4.5));
  }
  // armillary spheres on the pedestals
  for (const b of cf.boxes) {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    if (bw < 2 || bh < 2) continue;
    const topY = (b.y0 + b.y1 + 1) * 8 - 32 + 2;
    const xs = bw >= 4 ? [b.x0 * TS + bw * TS * 0.27, b.x0 * TS + bw * TS * 0.73] : [(b.x0 + b.x1 + 1) * 8];
    for (const x of xs) w.add(new Armillary(Math.round(x), topY, (b.y1 + 1) * TS + 1 - topY));
  }
  // the great orrery overhead (only over big open rooms)
  if (m.w >= 30 && rng.chance(0.7)) {
    const D = cf.dial;
    const px = D.hub ? D.cx : rng.range(m.pw * 0.2, m.pw * 0.8), py = D.hub ? D.cy : -rng.range(60, 140);
    w.add(new OrreryShadow(px, py, D.hub ? rng.range(240, 320) : m.ph * 0.75 + rng.range(40, 120), rng.range(16, 24), D.hub));
  }
}

export const CLOCKFACE: BiomeArt = { paintFloor, paintPits, paintCap, paintFace, paintDressing, decorate };
