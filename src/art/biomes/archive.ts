// Floor 3 — The Sand Archive (流沙档案馆).
// The tower's great library: walnut parquet under long red runners, floor-to-ceiling bookcases,
// and the sand of stopped time pouring from the ceiling into drifts and sinkholes.
import type { BiomeArt, PaintCtx } from './types';
import type { PixelBuf } from '../../engine/gfx/canvas';
import { RNG, frand } from '../../engine/rng';
import { bayer, fbm2, hash2, clamp, TAU } from '../../engine/math';
import { rgb } from '../blit';
import { col } from '../palette';
import { RoomMap, T, TS } from '../../game/world/room';
import { darken, WALL_H } from '../../game/world/roomRender';
import type { World } from '../../game/world/world';
import type { Renderer } from '../../engine/gfx/renderer';
import { Entity } from '../../game/entities/entity';
import { Breakable } from '../../game/entities/props';
import { Pickup } from '../../game/entities/pickup';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { FLAME } from '../sprites/props';
import { ARCH_SCONCE, buildCandleCluster, CLOCK_CASE, CLOCK_SMALL, buildFloatPages, ARCHIVE_BOX, TOME_STACK } from '../sprites/archive';
import { sfx } from '../../game/G';

type RGB = [number, number, number];
const C = (k: string): RGB => rgb(k);

// ───────────────────────────── room plan (shared by painters + decorate) ─────────────────────────────

interface Fall { x: number; yTop: number; yBot: number; wall: boolean }
interface PitComp { tiles: number[]; x0: number; y0: number; x1: number; y1: number; centers: { x: number; y: number; rx: number; ry: number }[] }
interface Rug { x0: number; y0: number; x1: number; y1: number; dir: 'v' | 'h' | 'rug' }
interface Plan { falls: Fall[]; pits: PitComp[]; rugs: Rug[]; candles: { x: number; y: number }[]; floaters: { x: number; y: number }[] }

const PLANS = new WeakMap<RoomMap, Plan>();

/** The generator emits floor-1 flavoured prop hints; the archive claims and reinterprets them. */
const CLAIM: Record<string, string> = {
  walllamp: 'ar_sconce', wallgear: 'ar_clock', pipe: 'ar_ladder', window: 'ar_alcove',
  puddle: 'ar_sand', debris: 'ar_pages', cogpile: 'ar_books', crate: 'ar_box', barrel: 'ar_tomes', candles: 'ar_candles',
};
function claimProps(m: RoomMap) {
  for (const p of m.props) { const n = CLAIM[p.type]; if (n) p.type = n; }
}

const isFace = (m: RoomMap, tx: number, ty: number) => {
  if (m.get(tx, ty) !== T.WALL) return false;
  const s = m.get(tx, ty + 1);
  return s === T.FLOOR || s === T.PIT || s === T.BLOCK;
};
const nearExit = (m: RoomMap, tx: number, ty: number, d = 3) => m.exits.some((e) => Math.abs(e.tx + 0.5 - tx) < d && Math.abs(e.ty - ty) < 3);
const propNear = (m: RoomMap, tx: number, ty: number, d: number) => m.props.some((p) => p.type.startsWith('ar_') && p.ty === ty && Math.abs(p.tx - tx) <= d && (p.type === 'ar_sconce' || p.type === 'ar_clock' || p.type === 'ar_ladder' || p.type === 'ar_alcove'));

function getPlan(m: RoomMap, seed: number): Plan {
  let p = PLANS.get(m);
  if (p) return p;
  const rng = new RNG((seed ^ 0x5a17c3) >>> 0);
  p = { falls: [], pits: [], rugs: [], candles: [], floaters: [] };
  // ── pit components (sand sinkholes) ──
  const seen = new Uint8Array(m.w * m.h);
  for (let ty = 0; ty < m.h; ty++)
    for (let tx = 0; tx < m.w; tx++) {
      const i = ty * m.w + tx;
      if (seen[i] || m.get(tx, ty) !== T.PIT) continue;
      const comp: PitComp = { tiles: [], x0: tx, y0: ty, x1: tx, y1: ty, centers: [] };
      const st = [i];
      seen[i] = 1;
      while (st.length) {
        const j = st.pop()!;
        comp.tiles.push(j);
        const x = j % m.w, y = (j / m.w) | 0;
        comp.x0 = Math.min(comp.x0, x); comp.x1 = Math.max(comp.x1, x);
        comp.y0 = Math.min(comp.y0, y); comp.y1 = Math.max(comp.y1, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = ny * m.w + nx;
          if (m.in(nx, ny) && !seen[k] && m.get(nx, ny) === T.PIT) { seen[k] = 1; st.push(k); }
        }
      }
      // funnel centres spaced along the long axis
      const wpx = (comp.x1 - comp.x0 + 1) * TS, hpx = (comp.y1 - comp.y0 + 1) * TS;
      const horiz = wpx >= hpx;
      const short = Math.min(wpx, hpx), long = Math.max(wpx, hpx);
      const n = Math.max(1, Math.round(long / Math.max(30, short * 1.15)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const cx = comp.x0 * TS + (horiz ? wpx * t : wpx / 2), cy = comp.y0 * TS + (horiz ? hpx / 2 : hpx * t);
        // only keep centres that sit on pit tiles
        if (m.get(Math.floor(cx / TS), Math.floor(cy / TS)) !== T.PIT) continue;
        comp.centers.push({ x: cx, y: cy, rx: (horiz ? long / n : short) / 2 - 2, ry: (horiz ? short : long / n) / 2 - 2 });
      }
      if (!comp.centers.length) { const j = comp.tiles[0]; comp.centers.push({ x: (j % m.w) * TS + 8, y: ((j / m.w) | 0) * TS + 8, rx: 6, ry: 6 }); }
      p.pits.push(comp);
    }
  // ── carpets ──
  const ent = m.entry;
  const cxPx = ent ? (ent.tx + 1) * TS : (m.w * TS) / 2;
  const walk = (tx: number, ty: number) => { const t = m.get(tx, ty); return t === T.FLOOR || t === T.PIT || t === T.BLOCK; };
  {
    const tcol = Math.floor(cxPx / TS);
    let top = ent ? ent.ty - 1 : m.h - 4;
    while (top > 0 && (walk(tcol, top - 1) || walk(tcol - 1, top - 1))) top--;
    const W = 36;
    p.rugs.push({ x0: cxPx - W / 2, x1: cxPx + W / 2, y0: top * TS + 6, y1: (ent ? ent.ty : m.h - 3) * TS + 8, dir: 'v' });
  }
  // find interior extent along the middle row
  let floorRows: number[] = [];
  for (let ty = 0; ty < m.h; ty++) { let n = 0; for (let tx = 0; tx < m.w; tx++) if (walk(tx, ty)) n++; if (n > 6) floorRows.push(ty); }
  const midRow = floorRows.length ? floorRows[Math.floor(floorRows.length / 2)] : Math.floor(m.h / 2);
  const roll = rng.next();
  if (roll < 0.45) {
    let l = Math.floor(cxPx / TS), r = l;
    while (l > 0 && walk(l - 1, midRow)) l--;
    while (r < m.w - 1 && walk(r + 1, midRow)) r++;
    p.rugs.unshift({ x0: l * TS + 10, x1: (r + 1) * TS - 10, y0: midRow * TS - 6, y1: midRow * TS + 22, dir: 'h' });
  } else if (roll < 0.8) {
    const hw = rng.int(4, 6) * TS, hh = rng.int(2, 3) * TS;
    const cy = midRow * TS + 8;
    p.rugs.push({ x0: cxPx - hw, x1: cxPx + hw, y0: cy - hh, y1: cy + hh, dir: 'rug' });
  }
  // ── sandfalls: down the bookcases, and into the sinkholes ──
  const faces: { tx: number; ty: number }[] = [];
  for (let ty = 1; ty < m.h - 1; ty++)
    for (let tx = 1; tx < m.w - 1; tx++)
      if (isFace(m, tx, ty) && m.get(tx, ty + 1) === T.FLOOR && isFace(m, tx - 1, ty) && isFace(m, tx + 1, ty) && !nearExit(m, tx, ty) && !propNear(m, tx, ty, 1)) faces.push({ tx, ty });
  rng.shuffle(faces);
  const nWall = Math.min(faces.length, rng.int(1, 3));
  const taken: { tx: number; ty: number }[] = [];
  for (const f of faces) {
    if (taken.length >= nWall) break;
    if (taken.some((t) => Math.abs(t.tx - f.tx) < 6 && Math.abs(t.ty - f.ty) < 3)) continue;
    taken.push(f);
    const x = f.tx * TS + rng.int(4, 11);
    p.falls.push({ x, yTop: f.ty * TS - 46, yBot: (f.ty + 1) * TS + 3, wall: true });
  }
  let pitFalls = 0;
  for (const pc of p.pits) {
    if (p.falls.length >= 4 || pitFalls >= 2) break;
    if ((pc.x1 - pc.x0 + 1) * (pc.y1 - pc.y0 + 1) < 4 || !rng.chance(0.6)) continue;
    const c0 = rng.pick(pc.centers);
    pitFalls++;
    p.falls.push({ x: Math.round(c0.x + rng.int(-2, 2)), yTop: Math.round(c0.y) - 96, yBot: Math.round(c0.y), wall: false });
  }
  // ── floor candles against the north bookcases ──
  const spots = faces.filter((f) => !taken.some((t) => Math.abs(t.tx - f.tx) < 3 && t.ty === f.ty));
  for (let i = 0; i < Math.min(spots.length, rng.int(1, 2)); i++) {
    const f = spots[i];
    if (p.candles.some((c) => Math.abs(c.x - f.tx * TS) < 80)) continue;
    p.candles.push({ x: f.tx * TS + rng.int(5, 11), y: (f.ty + 1) * TS + 5 });
  }
  // ── a few candles along the side / south walls so the lower stacks aren't pitch black ──
  const low: { x: number; y: number }[] = [];
  const midY = (floorRows[0] ?? 0) + (floorRows.length >> 1);
  for (let ty = midY; ty < m.h - 1; ty++)
    for (let tx = 1; tx < m.w - 1; tx++) {
      if (m.get(tx, ty) !== T.FLOOR) continue;
      const wl = m.get(tx - 1, ty) === T.WALL || m.get(tx - 1, ty) === T.VOID, wr = m.get(tx + 1, ty) === T.WALL || m.get(tx + 1, ty) === T.VOID;
      const ws = m.get(tx, ty + 1) === T.WALL || m.get(tx, ty + 1) === T.VOID;
      if (!(wl || wr || ws)) continue;
      if (ent && Math.abs(tx - ent.tx) < 4 && ty > ent.ty - 4) continue;
      low.push({ x: tx * TS + (wl ? 5 : wr ? 11 : 8), y: ty * TS + (ws ? 10 : 8) });
    }
  rng.shuffle(low);
  for (const c of low) {
    if (p.candles.length >= 4) break;
    if (p.candles.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 150)) continue;
    p.candles.push(c);
  }
  // ── pages frozen mid-fall ──
  const open = m.openTiles(1);
  rng.shuffle(open);
  for (let i = 0; i < Math.min(open.length, rng.int(4, 7)); i++) p.floaters.push({ x: open[i].tx * TS + rng.int(2, 14), y: open[i].ty * TS + rng.int(2, 14) });
  PLANS.set(m, p);
  return p;
}

// ───────────────────────────── floor ─────────────────────────────

const PLANK = 6;
// lo / base / hi per plank tone: walnut, dark walnut, mahogany, pale oak
const WOOD: [string, string, string][] = [['B0', 'B1', 'B2'], ['K1', 'B0', 'B1'], ['K1', 'R0', 'B1'], ['B1', 'B2', 'B3']];
const SAND_T = 0.36;

function paintFloor(pb: PixelBuf, c: PaintCtx) {
  const { m, seed, aoTop } = c;
  claimProps(m);
  const plan = getPlan(m, seed);
  const pw = m.pw, ph = m.ph;
  const rng = new RNG((seed * 31 + 7) >>> 0);

  // plank layout: long horizontal boards, staggered joints
  const rows = Math.ceil(ph / PLANK);
  const pid = new Int32Array(pw * rows);
  const pStart: number[] = [], pLen: number[] = [], pTone: number[] = [], pSeed: number[] = [], pKnot: number[] = [];
  for (let r = 0; r < rows; r++) {
    let x = -rng.int(0, 48);
    while (x < pw) {
      const L = rng.pick([28, 36, 44, 52, 60, 72, 84]);
      const k = pStart.length;
      pStart.push(x); pLen.push(L);
      const t = rng.next();
      pTone.push(t < 0.72 ? 0 : t < 0.92 ? 1 : t < 0.97 ? 2 : 3);
      pSeed.push(rng.int(0, 9999));
      pKnot.push(rng.chance(0.2) ? x + rng.int(8, L - 8) : -999);
      for (let xx = Math.max(0, x); xx < Math.min(pw, x + L); xx++) pid[r * pw + xx] = k;
      x += L;
    }
  }

  // sand drift height field
  const H = new Float32Array(pw * ph);
  const dL = new Int16Array(pw * ph), dR = new Int16Array(pw * ph), dB = new Int16Array(pw * ph);
  const wallPx = (x: number, y: number) => c.wallish(x >> 4, y >> 4);
  for (let y = 0; y < ph; y++) {
    let d = 99;
    for (let x = 0; x < pw; x++) { d = wallPx(x, y) ? 0 : Math.min(99, d + 1); dL[y * pw + x] = d; }
    d = 99;
    for (let x = pw - 1; x >= 0; x--) { d = wallPx(x, y) ? 0 : Math.min(99, d + 1); dR[y * pw + x] = d; }
  }
  for (let x = 0; x < pw; x++) {
    let d = 99;
    for (let y = ph - 1; y >= 0; y--) { d = wallPx(x, y) ? 0 : Math.min(99, d + 1); dB[y * pw + x] = d; }
  }
  const piles = plan.falls.filter((f) => f.wall).map((f) => ({ x: f.x, y: f.yBot + 1, rx: 12, ry: 6, a: 1.25 }));
  for (const p of m.props) if (p.type === 'ar_sand') piles.push({ x: p.tx * TS + 8, y: p.ty * TS + 9, rx: rng.int(7, 10), ry: rng.int(4, 5), a: 0.95 });
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const i = y * pw + x;
      const t = m.get(x >> 4, y >> 4);
      if (t !== T.FLOOR && t !== T.BLOCK) continue;
      // drifts banked against the bookcases: long dunes whose reach swells and shrinks along the wall
      const RN = 5 + 30 * Math.pow(clamp((fbm2(x * 0.028, 3.1, seed + 5, 2) - 0.28) / 0.44, 0, 1), 1.5);
      const amp = 0.7 + 0.7 * fbm2(x * 0.016, 9.7, seed + 6, 2);
      const hN = Math.pow(clamp(1 - aoTop[i] / RN, 0, 1), 0.7) * amp;
      const RS = 4 + 16 * Math.pow(fbm2(y * 0.045, 7.7, seed + 8, 2), 1.4);
      const hS = Math.pow(clamp(1 - Math.min(dL[i], dR[i]) / RS, 0, 1), 0.8) * 0.9;
      const hB = clamp(1 - dB[i] / 5, 0, 1) * 0.5;
      const hP = clamp((fbm2(x * 0.03, y * 0.06, seed + 9, 3) - 0.71) * 4, 0, 1) * 0.75;
      let h = Math.max(hN, hS, hB, hP * 0) + 0.45 * hN * hS;
      for (const p of piles) {
        const e = Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry);
        if (e < 1) h = Math.max(h, Math.pow(1 - e, 0.6) * p.a);
      }
      H[i] = h;
    }

  const exitFloor = (tx: number, ty: number) => m.exits.some((e) => tx >= e.tx && tx < e.tx + e.w && ty >= e.ty - 1 && ty <= e.ty + 1);
  const sandRamp = ['B0', 'S0', 'S1', 'S2', 'S3'].map(C);
  for (let y = 0; y < ph; y++) {
    const r = Math.floor(y / PLANK), ly = y - r * PLANK;
    for (let x = 0; x < pw; x++) {
      const tx = x >> 4, ty = y >> 4;
      const t = m.get(tx, ty);
      if (t !== T.FLOOR && t !== T.BLOCK && !(t === T.DOOR && exitFloor(tx, ty))) continue;
      const i = y * pw + x;
      // ── planks ──
      const k = pid[r * pw + x];
      const lx = x - pStart[k], L = pLen[k];
      const wood = WOOD[pTone[k]];
      let ci = 1; // 0 lo 1 base 2 hi -1 joint -2 board seam
      if (ly === PLANK - 1) ci = -2;
      else if (lx === 0) ci = -1;
      else if (lx === 1 || (ly === 0 && hash2(x >> 3, r, seed + 24) > 0.3)) ci = 2;
      else {
        // long grain streaks along the board
        const g = fbm2(x * 0.09 + pSeed[k], ly * 1.9 + pSeed[k] * 0.37, seed + 21, 2);
        if (g > 0.68) ci = 0; else if (g < 0.24 && hash2(x, y, seed + 22) > 0.55) ci = 2;
        // a nail near the joint
        if (ly === 2 && lx === 3) ci = 0;
        // small knot: dark eye with a lit rim
        const kx = x - pKnot[k];
        if ((ly === 2 || ly === 3) && kx === 0) ci = 0;
        else if (ly === 2 && kx === -1) ci = 2;
      }
      let cc: RGB = ci === -1 ? C('K1') : ci === -2 ? C(pTone[k] === 0 || pTone[k] === 3 ? 'B0' : 'K1') : C(wood[ci]);
      if (ci === 1 && hash2(x, y, seed + 23) > 0.985) cc = C(wood[0]);
      // ── carpets ──
      for (const rug of plan.rugs) {
        const rc = rugColor(rug, x, y);
        if (rc) cc = C(rc);
      }
      // ── sand ──
      const h = H[i];
      const thr = SAND_T + (hash2(x >> 1, y, seed + 30) - 0.5) * 0.05;
      let sand = false;
      if (h > thr) {
        sand = true;
        const hl = H[i - 1] ?? h, hr = H[i + 1] ?? h, hu = H[i - pw] ?? h, hd = H[i + pw] ?? h;
        const lit = (hr - hl) + (hd - hu);
        // higher sand catches more candlelight; east/west faces shade by the slope
        let Ls = h > 0.85 ? 3 + (bayer(x, y) < (h - 0.85) / 0.3 ? 1 : 0) : h > 0.5 ? 2 + (bayer(x, y) < (h - 0.5) / 0.35 ? 1 : 0) : 2;
        const gxs = hr - hl;
        Ls += gxs > 0.05 ? 1 : gxs < -0.05 ? -1 : 0;
        void lit;
        // wind ripples
        const rip = Math.sin(y * 1.2 + x * 0.2 + fbm2(x * 0.05, y * 0.05, seed + 31, 2) * 10);
        if (rip > 0.9 && h > 0.5) Ls -= 1;
        // crisp rim: lit on the north-west edge, shadowed on the south-east edge
        if (hd <= SAND_T) Ls = 1;
        else if (hr <= SAND_T) Ls = Math.min(Ls, 2);
        else if (hl <= SAND_T || hu <= SAND_T) Ls = Math.max(Ls, 3);
        let si = clamp(Ls, 0, 4);
        if (si >= 2 && hash2(x, y, seed + 32) > 0.992) si = 4;
        cc = sandRamp[si];
      } else if (h > 0.16 && hash2(x, y, seed + 33) < (h - 0.16) * 0.7) {
        cc = sandRamp[hash2(x, y, seed + 34) > 0.6 ? 2 : 1];
      }
      // ── ambient occlusion beneath the bookcases ──
      const ao = aoTop[i];
      let dark = 0;
      if (ao <= 2) dark = 3; else if (ao <= 6) dark = 2; else if (ao <= 11) dark = bayer(x, y) < 0.6 ? 1 : 0; else if (ao <= 16) dark = bayer(x, y) < 0.25 ? 1 : 0;
      if (Math.min(dL[i], dR[i]) <= 2) dark = Math.max(dark, 1);
      if (sand) dark = Math.max(0, dark - 2);
      if (dark) cc = darken(cc, dark * 0.15);
      pb.set(x, y, cc);
    }
  }
}

/** carpet / runner colour at a pixel, or null */
function rugColor(rug: Rug, x: number, y: number): string | null {
  const fr = rug.dir === 'h' || rug.dir === 'rug' ? 2 : 0; // fringe on the short ends
  const vert = rug.dir === 'v';
  // fringe (tassels) beyond the short ends
  if (vert) {
    if (x >= rug.x0 + 2 && x < rug.x1 - 2 && (y === rug.y0 - 1 || y === rug.y0 - 2)) return (x & 1) ? (y === rug.y0 - 1 ? 'K8' : 'K7') : null;
  } else {
    if (y >= rug.y0 + 2 && y < rug.y1 - 2 && (x === rug.x0 - 1 || x === rug.x0 - 2 || x === rug.x1 || x === rug.x1 + 1)) return (y & 1) ? 'K8' : null;
  }
  void fr;
  if (x < rug.x0 || x >= rug.x1 || y < rug.y0 || y >= rug.y1) return null;
  const u = x - rug.x0, v = y - rug.y0, W = rug.x1 - rug.x0, Hh = rug.y1 - rug.y0;
  const eL = u, eR = W - 1 - u, eT = v, eB = Hh - 1 - v;
  const e = vert ? Math.min(eL, eR, eT) : Math.min(eL, eR, eT, eB);
  // border bands: outer edge, gold, dark, gold hairline
  if (e === 0) return eR === 0 || eB === 0 ? 'K1' : 'R0';
  if (e === 1) return (eL === 1 || eT === 1) && e === Math.min(eL, eT) ? 'B4' : 'B3';
  if (e === 2) return 'R0';
  if (e === 3) {
    // little gold studs on the dark band
    return 'R0';
  }
  if (e === 4) return ((vert ? v : u) % 4 === 0) ? 'B3' : 'R1';
  if (e === 5) return 'R0';
  if (e === 6) return ((vert ? v : u) % 2 === 0) ? 'B2' : 'R0';
  // field with lozenge motif
  const P = 16;
  const fu = vert ? u - W / 2 + 0.5 : (u % P) - P / 2 + 0.5;
  const fv = vert ? (v % P) - P / 2 + 0.5 : v - Hh / 2 + 0.5;
  if (rug.dir === 'rug') {
    // central medallion: an hourglass in gold
    const mu = u - W / 2 + 0.5, mv = v - Hh / 2 + 0.5;
    const md = Math.abs(mu) / 1.4 + Math.abs(mv);
    if (md < 14 && md > 12.5) return 'B3';
    if (md <= 12.5) {
      const hg = Math.abs(mu) <= Math.abs(mv) * 0.55 + 0.6 && Math.abs(mv) < 8;
      if (hg) return Math.abs(mv) < 1 ? 'B3' : Math.abs(mu) > Math.abs(mv) * 0.55 - 0.5 ? 'B2' : 'S1';
      return md > 10.5 ? 'R2' : 'R1';
    }
    if (e === 8 || e === 9) return ((u + v) % 3 === 0) ? 'R2' : 'R1';
  }
  const d = Math.abs(fu) + Math.abs(fv);
  if (d < 1) return 'B3';
  if (Math.abs(d - 4.5) < 0.6) return 'R2';
  if (d > 7.5 && ((u + v) & 1) === 0 && Math.abs(fu) > 2 && Math.abs(fv) > 2) return 'R0';
  return 'R1';
}

// ───────────────────────────── pits: sand sinkholes ─────────────────────────────

function paintPits(pb: PixelBuf, c: PaintCtx) {
  const { m, seed } = c;
  const plan = getPlan(m, seed);
  const pw = m.pw, ph = m.ph;
  if (!plan.pits.length) return;
  // distance (px) from each pit pixel to the nearest non-pit pixel (chamfer 3-4)
  const INF = 30000;
  const D = new Int32Array(pw * ph);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) D[y * pw + x] = m.get(x >> 4, y >> 4) === T.PIT ? INF : 0;
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const i = y * pw + x;
      if (!D[i]) continue;
      let v = D[i];
      if (x > 0) v = Math.min(v, D[i - 1] + 3);
      if (y > 0) v = Math.min(v, D[i - pw] + 3);
      if (x > 0 && y > 0) v = Math.min(v, D[i - pw - 1] + 4);
      if (x < pw - 1 && y > 0) v = Math.min(v, D[i - pw + 1] + 4);
      D[i] = v;
    }
  for (let y = ph - 1; y >= 0; y--)
    for (let x = pw - 1; x >= 0; x--) {
      const i = y * pw + x;
      if (!D[i]) continue;
      let v = D[i];
      if (x < pw - 1) v = Math.min(v, D[i + 1] + 3);
      if (y < ph - 1) v = Math.min(v, D[i + pw] + 3);
      if (x < pw - 1 && y < ph - 1) v = Math.min(v, D[i + pw + 1] + 4);
      if (x > 0 && y < ph - 1) v = Math.min(v, D[i + pw - 1] + 4);
      D[i] = v;
    }
  const ramp = ['K0', 'K1', 'B0', 'S0', 'S1', 'S2', 'S3'].map(C);
  for (const pc of plan.pits) {
    const short = Math.min(pc.x1 - pc.x0 + 1, pc.y1 - pc.y0 + 1) * TS;
    const Dm = short / 2;
    const near = (x: number, y: number) => {
      let best = pc.centers[0], bd = 1e9;
      for (const ce of pc.centers) { const dd = Math.hypot((x - ce.x) / ce.rx, (y - ce.y) / ce.ry); if (dd < bd) { bd = dd; best = ce; } }
      return { ce: best, e: bd };
    };
    // depth 0 (lip) -> 1 (throat): a round funnel sunk into the rectangular opening
    const kAt = (x: number, y: number) => {
      const i = clamp(y, 0, ph - 1) * pw + clamp(x, 0, pw - 1);
      const kc = clamp(D[i] / 3 / Dm, 0, 1);
      const kr = clamp(1 - near(x, y).e * 1.02, 0, 1);
      return kc > 0 ? Math.min(1, kc * 0.55 + kr * 0.6) : 0;
    };
    for (const j of pc.tiles) {
      const tx = j % m.w, ty = (j / m.w) | 0;
      for (let py = 0; py < TS; py++)
        for (let px = 0; px < TS; px++) {
          const x = tx * TS + px, y = ty * TS + py, i = y * pw + x;
          const d = D[i] / 3;
          // rim: the broken floor's edge reads on the far (north) side; a dark crack elsewhere
          const northEdge = m.get(tx, ty - 1) !== T.PIT && py < 3;
          if (northEdge) { pb.set(x, y, C(py === 0 ? 'B2' : py === 1 ? 'B0' : 'K1')); continue; }
          if (d < 1.2) { pb.set(x, y, C('K1')); continue; }
          const k = kAt(x, y);
          const { ce } = near(x, y);
          const th = Math.atan2((y - ce.y) / ce.ry, (x - ce.x) / ce.rx);
          const gx = kAt(x + 1, y) - kAt(x - 1, y), gy = kAt(x, y + 1) - kAt(x, y - 1);
          let L = 4.6 - 5.6 * Math.pow(k, 1.3);
          L += clamp(-(gx + gy) * 9, -1.3, 1.3);
          const band = Math.sin(th * 2 - k * 10 + seed * 0.1);
          if (k > 0.05 && k < 0.85) L += band * 0.85;
          let li = clamp(Math.floor(L + bayer(x, y) * 0.9 - 0.15), 0, 6);
          if (k > 0.9) li = 0;
          if (li >= 5 && hash2(x, y, seed + 41) > 0.985) li = 6;
          pb.set(x, y, ramp[li]);
        }
    }
  }
  // splintered board ends along the pit edges (floor side)
  for (let y = 1; y < ph - 1; y++)
    for (let x = 1; x < pw - 1; x++) {
      const t = m.get(x >> 4, y >> 4);
      if (t !== T.FLOOR) continue;
      const below = m.get(x >> 4, (y + 1) >> 4) === T.PIT && ((y + 1) & 15) === 0;
      const side = (m.get((x + 1) >> 4, y >> 4) === T.PIT && ((x + 1) & 15) === 0) || (m.get((x - 1) >> 4, y >> 4) === T.PIT && (x & 15) === 0);
      const above = m.get(x >> 4, (y - 1) >> 4) === T.PIT && (y & 15) === 0;
      if (below) pb.set(x, y, hash2(x, y, seed + 51) > 0.35 ? C('K1') : C('B0'));
      else if (side && hash2(x, y, seed + 52) > 0.3) pb.set(x, y, C('K1'));
      else if (above) pb.set(x, y, C(hash2(x, y, seed + 53) > 0.5 ? 'B2' : 'B1'));
    }
}

// ───────────────────────────── floor dressing: pages, fallen books ─────────────────────────────

function paintPage(pb: PixelBuf, x: number, y: number, w: number, h: number, skew: number, seed: number) {
  const X = (i: number, j: number) => x + i + Math.round(j * skew);
  // contact shadow along the bottom / right
  for (let j = 1; j <= h; j++) pb.set(X(w, j), y + j, darkPx(pb, X(w, j), y + j));
  for (let i = 1; i <= w; i++) pb.set(X(i, h), y + h, darkPx(pb, X(i, h), y + h));
  const fold = hash2(x, y, seed) > 0.5;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const xx = X(i, j), yy = y + j;
      if (fold && i === w - 1 && j === 0) continue; // dog-eared corner
      let k = 'K9';
      if (j === 0 || i === 0) k = 'K10';
      if (i === w - 1 || j === h - 1) k = 'S2';
      if (fold && i === w - 2 && j === 0) k = 'S1';
      else if (j > 0 && j < h - 1 && j % 2 === 1 && i > 0 && i < w - 1 && hash2(xx, yy, seed + 1) > 0.3) k = 'K6';
      pb.set(xx, yy, C(k));
    }
}
function darkPx(pb: PixelBuf, x: number, y: number): RGB {
  if (!pb.inside(x, y)) return C('K0');
  const [r, g, b] = pb.get(x, y);
  return darken([r, g, b], 0.35);
}

const SPINES: [string, string, string][] = [
  ['B0', 'B1', 'B2'], ['B1', 'B2', 'B3'], ['R0', 'R1', 'R2'], ['G0', 'G1', 'G2'], ['U0', 'U1', 'U2'], ['K1', 'K2', 'K3'], ['S0', 'S1', 'S2'], ['V0', 'V1', 'V2'],
];
const SPINE_W = [3, 2, 2.4, 1.3, 1.3, 1, 0.6, 0.35];
function pickSpine(r: number): [string, string, string] {
  let tot = 0;
  for (const w of SPINE_W) tot += w;
  let a = r * tot;
  for (let i = 0; i < SPINES.length; i++) { a -= SPINE_W[i]; if (a <= 0) return SPINES[i]; }
  return SPINES[0];
}

function paintFlatBook(pb: PixelBuf, x: number, y: number, w: number, h: number, sp: [string, string, string]) {
  // cover seen from above + page block edge on the near side
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let k = sp[1];
      if (j === 0 || i === 0) k = sp[2];
      if (i === w - 1) k = sp[0];
      if (i === 1 && j > 0) k = sp[0]; // spine crease
      pb.set(x + i, y + j, C(k));
    }
  for (let i = 1; i < w; i++) { pb.set(x + i, y + h, C(i === w - 1 ? 'K7' : 'K8')); pb.set(x + i, y + h + 1, C('K1')); }
  pb.set(x, y + h, C(sp[0]));
}

function paintDressing(pb: PixelBuf, c: PaintCtx) {
  const { m, seed } = c;
  const rng = new RNG((seed * 17 + 101) >>> 0);
  const floorAt = (x: number, y: number) => m.get(x >> 4, y >> 4) === T.FLOOR;
  // loose pages across the floor
  const open = m.openTiles(0);
  const nLoose = Math.floor(open.length * 0.03);
  for (let i = 0; i < nLoose; i++) {
    const t = rng.pick(open);
    const x = t.tx * TS + rng.int(1, 9), y = t.ty * TS + rng.int(1, 10);
    if (!floorAt(x + 7, y + 6)) continue;
    paintPage(pb, x, y, rng.int(5, 7), rng.int(4, 5), rng.pick([-0.25, 0, 0, 0, 0.25]), seed + i);
  }
  for (const p of m.props) {
    const bx = p.tx * TS, by = p.ty * TS;
    if (p.type === 'ar_pages') {
      for (let i = 0; i < rng.int(2, 4); i++) paintPage(pb, bx + rng.int(-2, 9), by + rng.int(0, 10), rng.int(5, 7), rng.int(4, 5), rng.pick([-0.25, 0, 0.25]), seed + 300 + i);
    } else if (p.type === 'ar_books') {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const w = rng.int(7, 9), h = rng.int(4, 5);
        paintFlatBook(pb, bx + 3 + rng.int(-2, 2) + (i % 2) * 2, by + 9 - i * 3 + rng.int(-1, 0), w, h, pickSpine(rng.next()));
      }
      if (rng.chance(0.6)) paintPage(pb, bx + rng.int(10, 14), by + rng.int(8, 12), 5, 4, 0.25, seed + 500);
    }
  }
}

// ───────────────────────────── walls: bookcases ─────────────────────────────

interface Bay { x0: number; x1: number; idx: number }
interface FaceCache { bays: Map<number, Bay[]>; shelves: Map<string, (string | null)[]> }
const FACES = new WeakMap<RoomMap, FaceCache>();
const CH = 9; // compartment height

function faceCache(m: RoomMap): FaceCache {
  let f = FACES.get(m);
  if (!f) { f = { bays: new Map(), shelves: new Map() }; FACES.set(m, f); }
  return f;
}
function baysFor(c: PaintCtx, ty: number): Bay[] {
  const fc = faceCache(c.m);
  let b = fc.bays.get(ty);
  if (b) return b;
  b = [];
  let x = -Math.floor(hash2(ty, 3, c.seed + 61) * 24), idx = 0;
  while (x < c.m.pw + 48) {
    const w = [32, 40, 40, 48, 36][Math.floor(hash2(idx, ty, c.seed + 62) * 5)];
    b.push({ x0: x, x1: x + w, idx: idx++ });
    x += w;
  }
  fc.bays.set(ty, b);
  return b;
}
function bayAt(c: PaintCtx, ty: number, x: number): Bay {
  for (const b of baysFor(c, ty)) if (x >= b.x0 && x < b.x1) return b;
  return { x0: x, x1: x + 32, idx: 0 };
}

/** paint the contents of one compartment (books, scrolls, curios) into a small palette-key buffer */
function shelfContents(c: PaintCtx, ty: number, shelf: number, bay: Bay): (string | null)[] {
  const fc = faceCache(c.m);
  const key = `${ty}:${shelf}:${bay.idx}`;
  let buf = fc.shelves.get(key);
  if (buf) return buf;
  const W = bay.x1 - bay.x0 - 3;
  buf = new Array(W * CH).fill(null);
  const set = (x: number, y: number, k: string) => { if (x >= 0 && x < W && y >= 0 && y < CH) buf![y * W + x] = k; };
  const rng = new RNG(((c.seed * 977) ^ (ty * 7919) ^ (shelf * 104729) ^ (bay.idx * 15485863)) >>> 0);
  const roll = rng.next();
  const kind = roll < 0.07 ? 'drawers' : roll < 0.12 ? 'empty' : roll < 0.27 ? 'curio' : 'books';
  if (kind === 'drawers') {
    // card-catalogue drawers: brass label plates and pull rings
    for (let y = 0; y < CH; y++) for (let x = 0; x < W; x++) set(x, y, 'K0');
    const dw = 6;
    const n = Math.floor((W - 1) / dw);
    const x0 = Math.floor((W - n * dw) / 2);
    for (let gy = 0; gy < 2; gy++)
      for (let gx = 0; gx < n; gx++) {
        const ox = x0 + gx * dw, oy = gy * 4 + 1;
        for (let j = 0; j < 4; j++) for (let i = 0; i < dw - 1; i++) set(ox + i, oy + j, j === 0 || i === 0 ? 'B2' : j === 3 || i === dw - 2 ? 'B0' : 'B1');
        set(ox + 1, oy + 1, 'K8'); set(ox + 2, oy + 1, 'K8'); set(ox + 3, oy + 1, 'B3');
        set(ox + 2, oy + 2, 'B4');
      }
    return save();
  }
  let x = 0;
  const curioAt = kind === 'curio' ? rng.int(4, Math.max(5, W - 10)) : -99;
  const empty = kind === 'empty';
  if (empty) {
    // a dusty, abandoned shelf: sand drift + a cobweb + a fallen book
    for (let i = 0; i < W; i++) {
      const hh = Math.max(0, Math.round(2.5 - Math.abs(i - W * 0.7) / 4 + hash2(i, ty, c.seed) * 0.8));
      for (let j = 0; j < hh; j++) set(i, CH - 1 - j, j === hh - 1 ? 'S2' : 'S1');
    }
    for (let i = 0; i < 4; i++) { set(i, 0, 'K6'); set(0, i, 'K6'); }
    set(1, 1, 'K5'); set(2, 1, 'K6'); set(1, 2, 'K6');
    const fx = rng.int(3, Math.max(4, W - 9));
    const sp = pickSpine(rng.next());
    for (let i = 0; i < 7; i++) { set(fx + i, CH - 3, sp[2]); set(fx + i, CH - 2, sp[1]); }
    set(fx + 6, CH - 2, 'K8');
    return save();
  }
  while (x < W) {
    if (x >= curioAt && x < curioAt + 2) {
      paintCurio(set, x, rng);
      x += 7;
      continue;
    }
    const r = rng.next();
    if (r < 0.06) { x += rng.int(1, 3); continue; } // gap
    if (r < 0.12 && W - x >= 4) {
      // leaning book
      const sp = pickSpine(rng.next()), h = rng.int(6, 8), dir = rng.chance(0.5);
      for (let j = 0; j < h; j++) {
        const off = Math.floor((j * 2) / h);
        const xx = dir ? x + off : x + 2 - off;
        set(xx, CH - 1 - j, sp[2]); set(xx + 1, CH - 1 - j, sp[1]);
        if (j === h - 2) set(xx + 1, CH - 1 - j, 'B3');
      }
      x += 4;
      continue;
    }
    if (r < 0.17 && W - x >= 8) {
      // a short stack lying flat
      const n = rng.int(2, 3);
      let wPrev = 8;
      for (let k = 0; k < n; k++) {
        const sp = pickSpine(rng.next()), w = Math.min(wPrev, rng.int(5, 8));
        const off = rng.int(0, wPrev - w);
        for (let i = 0; i < w; i++) {
          set(x + off + i, CH - 1 - k * 2, sp[1]);
          set(x + off + i, CH - 2 - k * 2, i === 0 ? sp[2] : i === w - 1 ? 'K8' : sp[2]);
        }
        set(x + off + w - 1, CH - 1 - k * 2, 'K7');
        wPrev = w;
      }
      x += 9;
      continue;
    }
    const sp = pickSpine(rng.next());
    const w = rng.pick([2, 2, 2, 3, 3, 1]);
    const h = rng.int(5, 8);
    const band = rng.chance(0.55), label = w >= 2 && rng.chance(0.3);
    for (let i = 0; i < w && x + i < W; i++)
      for (let j = 0; j < h; j++) {
        const y = CH - h + j;
        let k = i === 0 ? sp[2] : i === w - 1 && w > 1 ? sp[0] : sp[1];
        if (j === 0 && i < w - 1) k = sp[2];
        if (band && (j === 1 || j === h - 2)) k = i === 0 ? 'B3' : 'B2';
        if (label && j === Math.floor(h / 2) && i === 0) k = 'S2';
        set(x + i, y, k);
      }
    x += w;
  }
  return save();
  function save() { fc.shelves.set(key, buf!); return buf!; }
}

function paintCurio(set: (x: number, y: number, k: string) => void, x: number, rng: RNG) {
  const pick = rng.int(0, 3);
  const art: Record<number, { rows: string[]; pal: Record<string, string> }> = {
    0: { rows: ['nBBBn', '.kSk.', '.kSk.', '..k..', '.kSk.', '.SSS.', 'nBBBn'], pal: { n: 'B1', B: 'B3', k: 'K5', S: 'S3' } }, // hourglass
    1: { rows: ['.uUu.', 'uGUuu', 'uGGuu', '.uuu.', '..n..', '.nBn.'], pal: { u: 'U1', U: 'U2', G: 'G1', n: 'B1', B: 'B3' } }, // globe
    2: { rows: ['.vWv.', 'vWWWk', 'vkWkk', '.vWk.', '.vkv.'], pal: { v: 'K7', W: 'K9', k: 'K5' } }, // skull
    3: { rows: ['.kk.', 'kWvk', 'kSSk', 'kSSk', '.kk.'], pal: { k: 'K5', W: 'K8', v: 'K6', S: 'S2' } }, // jar of sand
  };
  const a = art[pick];
  const h = a.rows.length;
  for (let j = 0; j < h; j++) for (let i = 0; i < a.rows[j].length; i++) {
    const ch = a.rows[j][i];
    if (ch !== '.') set(x + 1 + i, CH - h + j, a.pal[ch]);
  }
}

function paintFace(pb: PixelBuf, c: PaintCtx, tx: number, ty: number, oy: number, H: number, exterior: boolean) {
  const m = c.m;
  const ox = tx * TS;
  const runW = !isFace(m, tx - 1, ty), runE = !isFace(m, tx + 1, ty);
  if (H !== WALL_H) {
    // cut-away south wall: the low back of a bookcase
    for (let py = 0; py < H; py++)
      for (let px = 0; px < TS; px++) {
        const x = ox + px;
        let k = 'B0';
        if (py === 0) k = 'B2';
        else if (py === 1) k = 'B1';
        else if (py === H - 1) k = 'K0';
        else if ((x & 7) === 0) k = 'K1';
        else if ((x & 7) === 1) k = 'B1';
        let cc = C(k);
        if ((runW && px === 0) || (runE && px === 15)) cc = darken(cc, 0.35);
        if (exterior) cc = darken(cc, 0.45);
        pb.set(x, oy + py, cc);
      }
    return;
  }
  const feat = m.props.find((p) => p.tx === tx && p.ty === ty && (p.type === 'ar_ladder' || p.type === 'ar_alcove'))?.type;
  for (let py = 0; py < H; py++)
    for (let px = 0; px < TS; px++) {
      const x = ox + px;
      const bay = bayAt(c, ty, x);
      const u = x - bay.x0;
      let k: string;
      if (py === 0) k = 'B3';
      else if (py === 1) k = 'B2';
      else if (py === 2) k = (x % 3 === 0) ? 'B0' : 'B1';
      else if (py === 31) k = 'K0';
      else if (u < 3) k = u === 0 ? 'B2' : u === 1 ? 'B1' : 'B0'; // bay upright
      else if (py === 12 || py === 23) k = 'B3';
      else if (py === 13 || py === 24) k = 'B1';
      else if (py >= 25) k = cabinetPx(bay, u, py);
      else {
        const shelf = py < 12 ? 0 : 1;
        const ly = py - (shelf ? 14 : 3);
        const buf = shelfContents(c, ty, shelf, bay);
        const W = bay.x1 - bay.x0 - 3;
        const b = buf[ly * W + (u - 3)];
        k = b ?? (ly === 0 ? 'K0' : (u - 3) % 9 === 0 ? 'K0' : 'K1');
        // shadow cast by the shelf above and the upright on the left
        if (b && (ly === 0 || u === 3) && hash2(x, py, c.seed) > 0.3) k = darkerKey(b);
      }
      let cc = C(k);
      if (runW && px <= 1) cc = C(px === 0 ? 'B2' : 'B1');
      if (runE && px >= 14) cc = C(px === 15 ? 'K1' : 'B0');
      if ((runW || runE) && py <= 2) cc = C(py === 0 ? 'B3' : 'B1');
      if (exterior) cc = darken(cc, 0.5);
      pb.set(x, oy + py, cc);
    }
  if (exterior) return;
  if (feat === 'ar_ladder') paintLadder(pb, ox, oy);
  if (feat === 'ar_alcove') paintAlcove(pb, ox, oy);
}

const DARKER: Record<string, string> = {
  B1: 'B0', B2: 'B1', B3: 'B2', B4: 'B3', R1: 'R0', R2: 'R1', G1: 'G0', G2: 'G1', U1: 'U0', U2: 'U1', K2: 'K1', K3: 'K2', S1: 'S0', S2: 'S1', S3: 'S2', V1: 'V0', V2: 'V1', K8: 'K7', K9: 'K8',
};
const darkerKey = (k: string) => DARKER[k] ?? k;

function cabinetPx(bay: Bay, u: number, py: number): string {
  const W = bay.x1 - bay.x0 - 3;
  const lu = u - 3;
  const doors = W >= 26 ? 2 : 1;
  const dw = Math.floor(W / doors);
  const di = Math.min(doors - 1, Math.floor(lu / dw));
  const du = lu - di * dw;
  if (py === 25) return 'B2';
  if (py === 30) return 'B0';
  if (du === 0) return 'B1';
  if (du === dw - 1) return 'K1';
  if (py === 26) return du === 1 ? 'B1' : 'K1';
  if (py === 29) return 'B1';
  if (du === 1) return 'K1';
  if (du === dw - 2) return 'B1';
  const knob = doors === 2 ? (di === 0 ? dw - 4 : 3) : Math.floor(dw / 2);
  if (py === 27 && du === knob) return 'B4';
  if (py === 28 && du === knob) return 'B2';
  return 'B0';
}

function paintLadder(pb: PixelBuf, ox: number, oy: number) {
  for (let py = 3; py < 32; py++) {
    const lean = py < 12 ? 1 : 0;
    for (const [rx, k] of [[2 + lean, 'B3'], [3 + lean, 'B1'], [12 - lean, 'B2'], [13 - lean, 'B0']] as [number, string][]) pb.set(ox + rx, oy + py, C(k));
    if ((py - 5) % 5 === 0) for (let x = 4 + lean; x < 12 - lean; x++) { pb.set(ox + x, oy + py, C('B3')); pb.set(ox + x, oy + py + 1, C('K0')); }
  }
  // hooks over the brass rail
  for (let x = 0; x < TS; x++) pb.set(ox + x, oy + 3, C(x === 3 || x === 12 ? 'B5' : 'B4'));
  for (let x = 0; x < TS; x++) pb.set(ox + x, oy + 4, C('B1'));
}

function paintAlcove(pb: PixelBuf, ox: number, oy: number) {
  for (let py = 3; py < 25; py++)
    for (let px = 2; px < 14; px++) {
      const cx = px - 7.5, cy = py - 9;
      if (py < 9 && cx * cx / 30 + cy * cy / 36 > 1) continue; // arched top
      let k = py < 12 ? 'K1' : 'K2';
      // narrow lancet of leaded glass behind the desk (violet panes, brass leading)
      const wx = px - 7.5;
      if (Math.abs(wx) < 2.6 && py >= 6 && py <= 14 && !(py === 6 && Math.abs(wx) > 1)) {
        k = (px === 7 || py === 10) ? 'B1' : py < 10 ? (px < 7 ? 'U2' : 'U1') : (px < 7 ? 'U1' : 'U0');
        if (py === 8 && px === 6) k = 'K9'; // a star
        if (Math.abs(wx) > 2) k = 'B1';
      }
      if (px === 2 || px === 13) k = 'B2';
      if (py === 3 || (py < 9 && cx * cx / 30 + cy * cy / 36 > 0.75)) k = 'B3';
      pb.set(ox + px, oy + py, C(k));
    }
  // reading desk with an open book
  for (let px = 2; px < 14; px++) { pb.set(ox + px, oy + 19, C('B3')); pb.set(ox + px, oy + 20, C('B1')); }
  for (let py = 21; py < 25; py++) { pb.set(ox + 4, oy + py, C('B1')); pb.set(ox + 11, oy + py, C('B0')); }
  const book = ['.wWW.WWv.', 'wWkW.WkWv', 'vvvvvvvvv'];
  book.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') pb.set(ox + 3 + i, oy + 16 + j, C(ch === 'W' ? 'K10' : ch === 'w' ? 'K9' : ch === 'k' ? 'K5' : 'K7')); }));
}

function paintCap(pb: PixelBuf, c: PaintCtx, tx: number, ty: number, oy: number) {
  const { m, seed } = c;
  const W = (x: number, y: number) => c.wallish(x, y);
  const nN = W(tx, ty - 1), nS = W(tx, ty + 1), nW = W(tx - 1, ty), nE = W(tx + 1, ty);
  const vN = m.get(tx, ty - 1) === T.VOID, vW = m.get(tx - 1, ty) === T.VOID, vE = m.get(tx + 1, ty) === T.VOID;
  const ox = tx * TS;
  for (let py = 0; py < TS; py++)
    for (let px = 0; px < TS; px++) {
      const x = ox + px, y = ty * TS + py;
      // dark boards seen from above
      const row = y % 5;
      let k = row === 4 ? 'K0' : 'K2';
      if (row !== 4 && hash2(x >> 2, y, seed + 71) > 0.8) k = 'K1';
      if (row === 0 && hash2(x, y, seed + 72) > 0.6) k = 'B0';
      // drifting sand settles on top of the shelves
      const s = fbm2(x * 0.09, y * 0.09, seed + 73, 2);
      if (s > 0.58 && bayer(x, y) < (s - 0.58) * 3.4) k = s > 0.7 && bayer(x + 2, y + 1) < 0.5 ? 'S0' : 'B0';
      // brass-trimmed edges toward the room, dark toward the void
      if (!nN && py <= 1) k = py === 0 ? 'B4' : 'B1';
      if (!nW && px <= 1) k = px === 0 ? 'B3' : 'B1';
      if (!nE && px >= 14) k = px === 15 ? 'B1' : 'K1';
      if (!nS && py >= 14) k = py === 15 ? 'B2' : 'B4';
      if (vN && py === 0) k = 'K0';
      if (vW && px === 0) k = 'K0';
      if (vE && px === 15) k = 'K0';
      pb.set(x, oy + py, C(k));
    }
}

// ───────────────────────────── animated dressing ─────────────────────────────

/** brass candle sconce on a bookcase upright */
class Sconce extends Entity {
  flick = frand(0, 10);
  constructor(tx: number, ty: number) {
    super();
    this.x = tx * TS + 8;
    this.y = ty * TS - 6;
    this.sortBias = TS + 6.5;
  }
  update(dt: number) { this.flick += dt; }
  render(r: Renderer) {
    drawSprite(r.w, ARCH_SCONCE, this.x, this.y);
    const f = FLAME[Math.floor(this.flick * 8) % 3];
    drawSprite(r.u, f, this.x, this.y - 1);
    const fl = 0.86 + Math.sin(this.flick * 11) * 0.06 + Math.sin(this.flick * 27) * 0.04;
    r.lightAt(this.x, this.y + 22, 118 * fl, 'O2', 0.52);
    r.lightAt(this.x, this.y + 30, 70 * fl, 'O3', 0.18);
    r.lightAt(this.x, this.y + 2, 30, 'O3', 0.55 * fl);
    r.glowAt(this.x, this.y - 2, 8, 'O3', 0.25 * fl);
  }
}

/** a cluster of floor candles in front of the shelves */
class Candles extends Entity {
  flick = frand(0, 10);
  spr: Sprite; wicks: { x: number; y: number }[];
  constructor(x: number, y: number, seed: number) {
    super();
    this.x = x; this.y = y;
    const cc = buildCandleCluster(seed);
    this.spr = cc.spr; this.wicks = cc.wicks;
  }
  update(dt: number) { this.flick += dt; }
  render(r: Renderer) {
    drawSprite(r.w, this.spr, this.x, this.y);
    const u = r.u;
    this.wicks.forEach((w, i) => {
      const ph = Math.floor(this.flick * 9 + i * 1.7) % 3;
      const fx = Math.round(this.x + w.x), fy = Math.round(this.y + w.y);
      u.fillStyle = col('O2'); u.fillRect(fx, fy - 1, 1, 2);
      u.fillStyle = col('O3'); u.fillRect(fx + (ph === 1 ? -1 : ph === 2 ? 1 : 0), fy - 2, 1, 1);
      u.fillStyle = col('O4'); u.fillRect(fx, fy - 1, 1, 1);
    });
    const fl = 0.85 + Math.sin(this.flick * 9) * 0.07 + Math.sin(this.flick * 23) * 0.05;
    r.lightAt(this.x, this.y - 6, 82 * fl, 'O2', 0.55);
    r.glowAt(this.x, this.y - 9, 10, 'O3', 0.25 * fl);
  }
}

/** pendulum clock stopped at the last second: the second hand trembles at :59 */
class WallClock extends Entity {
  t = frand(0, 5);
  constructor(tx: number, ty: number, private big: boolean) {
    super();
    this.x = tx * TS + 8;
    this.y = ty * TS - (big ? 7 : 2);
    this.sortBias = TS + 7 + (big ? 1 : 0);
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const ctx = r.w;
    const x = Math.round(this.x), y = Math.round(this.y);
    drawSprite(ctx, this.big ? CLOCK_CASE : CLOCK_SMALL, x, y);
    const R = this.big ? 4 : 3;
    const hand = (a: number, len: number, c: string) => {
      ctx.fillStyle = col(c);
      for (let i = 1; i <= len; i++) ctx.fillRect(Math.round(x + Math.cos(a) * i * (R / len) * 1.0), Math.round(y + Math.sin(a) * i * (R / len) * 1.0), 1, 1);
    };
    const up = -Math.PI / 2;
    hand(up - 0.03 * TAU, R - 1, 'K1'); // hour, a breath before twelve
    hand(up - 0.006 * TAU, R, 'K1');
    // second hand: ticks toward 12, never arrives
    const tick = Math.floor(this.t * 1.0) % 2;
    hand(up - (tick ? 1 / 60 : 1.6 / 60) * TAU, R, 'R2');
    ctx.fillStyle = col('B4'); ctx.fillRect(x, y, 1, 1);
    if (this.big) {
      // brass pendulum swinging in the window
      const sw = Math.sin(this.t * 3.1) * 2.4;
      const px = Math.round(x + sw), py = y + 15;
      ctx.fillStyle = col('B2');
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(x + sw * (i / 4)), y + 9 + i, 1, 1);
      ctx.fillStyle = col('B4'); ctx.fillRect(px - 1, py - 1, 3, 3);
      ctx.fillStyle = col('B5'); ctx.fillRect(px - 1, py - 1, 1, 1);
      ctx.fillStyle = col('B1'); ctx.fillRect(px + 1, py + 1, 1, 1);
    }
  }
}

/** reading alcove: candle on the desk + warm window glow */
class AlcoveLight extends Entity {
  flick = frand(0, 10);
  constructor(tx: number, ty: number) {
    super();
    this.x = tx * TS + 12;
    this.y = ty * TS + 1;
    this.sortBias = TS + 1;
  }
  update(dt: number) { this.flick += dt; }
  render(r: Renderer) {
    const u = r.u;
    const x = Math.round(this.x), y = Math.round(this.y);
    u.fillStyle = col('K9'); u.fillRect(x, y - 3, 1, 3);
    u.fillStyle = col('K8'); u.fillRect(x + 1, y - 3, 1, 3);
    const ph = Math.floor(this.flick * 9) % 3;
    u.fillStyle = col('O2'); u.fillRect(x, y - 5, 1, 2);
    u.fillStyle = col('O4'); u.fillRect(x + (ph === 1 ? 1 : 0), y - 5, 1, 1);
    const fl = 0.85 + Math.sin(this.flick * 10) * 0.08;
    r.lightAt(x, y + 14, 70 * fl, 'O2', 0.45);
    r.lightAt(x - 4, y - 10, 18, 'O1', 0.5);
    r.glowAt(x, y - 5, 6, 'O3', 0.3 * fl);
  }
}

/** a glittering stream of sand falling from the dark ceiling */
class Sandfall extends Entity {
  sparkT = 0; splashT = 0;
  constructor(private f: Fall) {
    super();
    this.x = f.x;
    this.y = f.yBot;
    this.sortBias = f.wall ? 0.5 : 0;
  }
  update(dt: number) {
    const P = this.world.particles;
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = frand(0.04, 0.12);
      const len = this.f.yBot - this.f.yTop;
      P.spawn({ kind: 'px', x: this.x + frand(-1, 1.5), y: this.f.yTop + frand(0, len * 0.5), vy: frand(70, 110), life: len / 100, ramp: ['S4', 'S3', 'S4'], layer: 'glow', alpha: frand(0.35, 0.8) });
    }
    this.splashT -= dt;
    if (this.splashT <= 0) {
      this.splashT = frand(0.05, 0.11);
      const a = frand(-Math.PI * 0.9, -Math.PI * 0.1);
      P.spawn({ kind: 'px', x: this.x + frand(-1, 1), y: this.y, z: 1, vx: Math.cos(a) * frand(8, 24), vy: frand(-3, 3), vz: frand(18, 42), grav: 220, life: frand(0.3, 0.5), ramp: ['S3', 'S2'], bounce: 0 });
      if (frand() < 0.25) P.spawn({ kind: 'smoke', x: this.x + frand(-3, 3), y: this.y - 1, vx: frand(-6, 6), vy: frand(-6, -2), life: frand(0.4, 0.7), ramp: ['S2', 'S1'], size: 1.5, size2: 3.5, alpha: 0.35, drag: 2 });
    }
  }
  render(r: Renderer) {
    const ctx = r.w, g = r.g;
    const { yTop, yBot } = this.f;
    const x = Math.round(this.x);
    const t = this.age;
    const len = yBot - yTop;
    g.globalCompositeOperation = 'lighter';
    for (let y = yTop; y < yBot; y++) {
      const a = Math.min(1, (y - yTop) / (this.f.wall ? 22 : 40));
      // scrolling texture: streaks travel down at ~95 px/s
      const ph = Math.floor(y - t * 95);
      const n0 = hash2(ph >> 1, 3, 77), n1 = hash2(ph >> 1, 9, 78), n2 = hash2(ph, 13, 79);
      ctx.globalAlpha = a;
      ctx.fillStyle = col(n0 > 0.7 ? 'S4' : n0 > 0.25 ? 'S3' : 'S2');
      ctx.fillRect(x, y, 1, 1);
      if (n1 > 0.12) { ctx.fillStyle = col(n1 > 0.6 ? 'S3' : 'S2'); ctx.fillRect(x + 1, y, 1, 1); }
      if (n2 > 0.8) { ctx.fillStyle = col('S1'); ctx.fillRect(x + (n2 > 0.9 ? -1 : 2), y, 1, 1); }
      // glitter in the additive layer
      if (n0 > 0.86) { g.globalAlpha = a * 0.7; g.fillStyle = col('S4'); g.fillRect(x + (n1 > 0.5 ? 1 : 0), y, 1, 1); }
    }
    ctx.globalAlpha = 1;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // impact: a churning little crown where the stream lands
    const ph = Math.floor(t * 12) % 3;
    ctx.fillStyle = col('S2');
    ctx.fillRect(x - 2, yBot - 1, 6, 1);
    ctx.fillStyle = col('S3');
    ctx.fillRect(x - 1 + (ph === 1 ? -1 : ph === 2 ? 1 : 0), yBot - 2, 3, 1);
    r.glowAt(x, yBot - 2, 8, 'S3', 0.16);
    for (let i = 0; i < 3; i++) r.glowAt(x, yTop + len * (0.35 + i * 0.22), 7, 'S3', 0.08);
    r.lightAt(x, yBot - 4, 26, 'S3', 0.25);
  }
}

/** sand grains spiralling into a sinkhole funnel */
class Sinkhole extends Entity {
  grains: { a: number; p: number; w: number; c: number }[] = [];
  puffT = frand(0.5, 2);
  constructor(private pc: PitComp) {
    super();
    const c0 = pc.centers[0];
    this.x = c0.x; this.y = c0.y;
    for (const ce of pc.centers) {
      const n = Math.round((ce.rx * ce.ry) / 18);
      for (let i = 0; i < n; i++) this.grains.push({ a: frand(0, TAU), p: frand(0.1, 1), w: frand(0.7, 1.3), c: pc.centers.indexOf(ce) });
    }
  }
  update(dt: number) {
    for (const g of this.grains) {
      g.a += dt * g.w * (0.8 + (1 - g.p) * 3.2);
      g.p -= dt * 0.13 * g.w;
      if (g.p < 0.06) { g.p = 1; g.a = frand(0, TAU); }
    }
    this.puffT -= dt;
    if (this.puffT <= 0) {
      this.puffT = frand(1.2, 2.6);
      const ce = this.pc.centers[Math.floor(frand(0, this.pc.centers.length))];
      this.world.particles.spawn({ kind: 'smoke', x: ce.x + frand(-2, 2), y: ce.y, vx: frand(-4, 4), vy: frand(-10, -4), life: frand(0.8, 1.2), ramp: ['S1', 'S0', 'B0'], size: 2, size2: 6, alpha: 0.3, drag: 1.5 });
    }
  }
  renderGround(r: Renderer) {
    const ctx = r.w;
    for (const g of this.grains) {
      const ce = this.pc.centers[g.c];
      const x = Math.round(ce.x + Math.cos(g.a) * ce.rx * g.p), y = Math.round(ce.y + Math.sin(g.a) * ce.ry * g.p);
      if (this.world.map.get(x >> 4, y >> 4) !== T.PIT) continue;
      ctx.fillStyle = col(g.p > 0.66 ? 'S3' : g.p > 0.33 ? 'S2' : 'S0');
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** a page frozen mid-fall: turns slowly, flutters off when brushed */
let PAGES: Sprite[] | null = null;
class FloatPage extends Entity {
  rot = frand(0, 6);
  spin = frand(0.6, 1.2) * (frand() < 0.5 ? -1 : 1);
  z0 = frand(14, 30);
  ph = frand(0, TAU);
  constructor(x: number, y: number) {
    super();
    this.x = x; this.y = y;
    PAGES ??= buildFloatPages();
  }
  update(dt: number) {
    for (const p of this.world.players) {
      const dx = this.x - p.x, dy = this.y - p.y, d = Math.hypot(dx, dy);
      if (d < 18 && d > 0.1 && Math.hypot(p.vx, p.vy) > 20) {
        this.vx += (dx / d) * 120 * dt; this.vy += (dy / d) * 80 * dt;
        this.spin += Math.sign(this.spin) * dt * 8;
      }
    }
    this.vx *= Math.exp(-2.5 * dt); this.vy *= Math.exp(-2.5 * dt);
    this.spin += (Math.sign(this.spin) * 0.8 - this.spin) * Math.min(1, dt * 0.8);
    this.rot += this.spin * dt;
    const m = this.world.map;
    if (m.solidAt(this.x, this.y)) { this.x -= this.vx * dt * 2; this.y -= this.vy * dt * 2; this.vx = this.vy = 0; }
  }
  get z2() { return this.z0 + Math.sin(this.age * 1.3 + this.ph) * 2.5; }
  renderGround(r: Renderer) {
    r.w.fillStyle = 'rgba(11,10,20,0.25)';
    r.w.fillRect(Math.round(this.x) - 2, Math.round(this.y), 5, 1);
  }
  render(r: Renderer) {
    const n = PAGES!.length;
    const i = ((Math.floor(this.rot * 2) % n) + n) % n;
    drawSprite(r.w, PAGES![i], this.x, this.y - this.z2);
  }
}

/** breakable record box / tome stack (replaces crates and barrels) */
class ArchiveBreakable extends Breakable {
  constructor(private btx: number, private bty: number, private tomes: boolean) {
    super(btx, bty, 'crate');
    this.hp = this.maxHp = tomes ? 16 : 22;
  }
  smash() {
    this.dead = true;
    const w = this.world;
    w.map.set(this.btx, this.bty, T.FLOOR);
    w.fx.shatter(this, this.tomes ? ['R1', 'U1', 'G1', 'K9', 'B2'] : ['B1', 'B2', 'B0', 'K9'], 0.8);
    for (let i = 0; i < 8; i++) {
      const a = frand(0, TAU), s = frand(20, 70);
      w.particles.spawn({ kind: 'debris', x: this.x, y: this.y - 6, z: frand(4, 12), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: frand(40, 90), grav: 90, drag: 2, life: frand(1.2, 2), ramp: [frand() < 0.5 ? 'K9' : 'K8'], size: 2, vrot: frand(-8, 8), bounce: 0.1 });
    }
    sfx('woodBreak', { pan: w.pan(this.x) });
    sfx('paperBurst', { pan: w.pan(this.x), vol: 0.8 });
    if (frand() < 0.5) for (let i = 0; i < 2; i++) w.add(new Pickup(this.x, this.y - 4, 'brass', 1));
    if (frand() < 0.08) w.add(new Pickup(this.x, this.y - 4, 'heal', 8));
  }
  render(r: Renderer) {
    drawSprite(r.w, this.tomes ? TOME_STACK : ARCHIVE_BOX, this.x, this.y + 1, { tint: this.flash > 0 ? '#ffffff' : undefined });
  }
}

function decorate(w: World, m: RoomMap, rng: RNG) {
  claimProps(m);
  const plan = getPlan(m, (m.vari[0] ?? 0) * 7919 + m.w * 31 + m.h);
  const lit: { tx: number; ty: number }[] = [];
  for (const p of m.props) {
    switch (p.type) {
      case 'ar_sconce':
        // the generator crowds lamps on stepped walls; keep candles a few shelves apart
        if (lit.some((l) => Math.abs(l.tx - p.tx) + Math.abs(l.ty - p.ty) < 4)) break;
        lit.push(p);
        w.add(new Sconce(p.tx, p.ty));
        break;
      case 'ar_clock': w.add(new WallClock(p.tx, p.ty, !!p.data?.big)); break;
      case 'ar_alcove': w.add(new AlcoveLight(p.tx, p.ty)); break;
      case 'ar_box': w.add(new ArchiveBreakable(p.tx, p.ty, false)); break;
      case 'ar_tomes': w.add(new ArchiveBreakable(p.tx, p.ty, true)); break;
      case 'ar_candles': if (m.get(p.tx, p.ty) === T.FLOOR) w.add(new Candles(p.tx * TS + 8, p.ty * TS + 6, rng.int(0, 999))); break;
    }
  }
  for (const f of plan.falls) w.add(new Sandfall(f));
  for (const pc of plan.pits) w.add(new Sinkhole(pc));
  for (const c of plan.candles) w.add(new Candles(c.x, c.y, rng.int(0, 999)));
  for (const f of plan.floaters) w.add(new FloatPage(f.x, f.y));
}

export const ARCHIVE: BiomeArt = { paintFloor, paintPits, paintFace, paintCap, paintDressing, decorate };
