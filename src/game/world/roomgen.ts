// Procedural arena generator. Rooms are entered from the south and exited through
// reward doors on the north wall — the run reads as a climb up the tower.
import { RNG } from '../../engine/rng';
import { RoomMap, T, PropSpec } from './room';

// every room kind (rooms/registry.ts); unknown kinds get the plain safe-room shape
import type { RoomKind } from '../rooms/registry';
export type { RoomKind };

export interface GenOpts {
  rng: RNG;
  kind: RoomKind;
  biome: number;
  exits: number;
  /** override interior size */
  size?: [number, number];
}

const SIDE = 3, TOP = 4, BOTTOM = 3;

export function generateRoom(o: GenOpts): RoomMap {
  for (let attempt = 0; attempt < 30; attempt++) {
    const m = tryGenerate(o, attempt);
    if (m) return m;
  }
  return tryGenerate({ ...o, kind: 'start' }, 99)!;
}

function tryGenerate(o: GenOpts, attempt: number): RoomMap | null {
  const { rng, kind } = o;
  let iw: number, ih: number;
  if (o.size) [iw, ih] = o.size;
  else if (kind === 'combat') { iw = rng.int(22, 32); ih = rng.int(13, 18); }
  else if (kind === 'elite') { iw = rng.int(26, 32); ih = rng.int(15, 19); }
  else if (kind === 'boss') { iw = 34; ih = 21; }
  else if (kind === 'vault') { iw = 22; ih = 13; }
  else if (kind === 'hub') { iw = 30; ih = 16; }
  else if (kind === 'tutorial') { iw = 26; ih = 14; }
  // onboarding stages (ONBOARD2 §2.0, §8.1): the prologue's 22×11 and the Rehearsal Hall's 36×17, flat and clear
  else if (kind === 'prologue') { iw = 22; ih = 11; }
  else if (kind === 'rehearsal') { iw = 36; ih = 17; }
  else { iw = rng.int(18, 22); ih = rng.int(10, 12); }
  if (iw % 2) iw++; // even widths keep doors centred
  const w = iw + SIDE * 2, h = ih + TOP + BOTTOM;
  const m = new RoomMap(w, h);
  const x0 = SIDE, y0 = TOP, x1 = x0 + iw - 1, y1 = y0 + ih - 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.set(x, y, T.FLOOR);

  // shape
  const shapes: [string, number][] = kind === 'combat' || kind === 'elite'
    ? [['plain', 1], ['chamfer', 3], ['cross', 2], ['alcove', 2], ['notch', 2], ['hall', 1.2]]
    : kind === 'boss' ? [['chamfer', 1]] : kind === 'vault' || kind === 'prologue' || kind === 'rehearsal' ? [['plain', 1]] : [['chamfer', 2], ['plain', 1]];
  const shape = rng.weighted(shapes, (s) => s[1])![0];
  m.shape = shape;
  applyShape(m, rng, shape, x0, y0, x1, y1);

  // obstacles
  if (kind === 'combat' || kind === 'elite') {
    const ob = rng.weighted<[string, number]>([
      ['pillars4', 2], ['pillars2', 2], ['pitCenter', 1.6], ['pitSides', 1.4], ['channel', 1.2], ['crates', 2], ['island', 1], ['none', 0.6], ['pitScatter', 1.2],
    ], (s) => s[1])![0];
    applyObstacles(m, rng, ob, x0, y0, x1, y1, o.biome);
    m.shape += '+' + ob;
  } else if (kind === 'boss') {
    // four pillars at quarters for cover
    for (const [fx, fy] of [[0.22, 0.3], [0.78, 0.3], [0.22, 0.75], [0.78, 0.75]]) {
      const px = Math.round(x0 + iw * fx), py = Math.round(y0 + ih * fy);
      block(m, px - 1, py - 1, 2, 2, T.WALL);
    }
  }

  // doors
  const cx = Math.floor(w / 2);
  // entry: south centre
  if (kind !== 'hub') {
    for (let y = y1 + 1; y < h; y++) { m.set(cx - 1, y, T.FLOOR); m.set(cx, y, T.FLOOR); }
    // make sure there is floor right above the entry
    for (let y = y1; y >= y0 && m.get(cx, y) !== T.FLOOR; y--) { m.set(cx - 1, y, T.FLOOR); m.set(cx, y, T.FLOOR); }
    m.entry = { tx: cx - 1, ty: y1 + 1, dir: 's', w: 2 };
    for (let y = y1 + 1; y < h; y++) { m.set(cx - 1, y, T.DOOR); m.set(cx, y, T.DOOR); }
  }
  if (o.exits > 0) {
    const xs: number[] = [];
    for (let i = 0; i < o.exits; i++) xs.push(Math.round(x0 + (iw * (i + 1)) / (o.exits + 1)));
    for (const dx of xs) {
      // find the topmost floor in this column pair
      let fy = -1;
      for (let y = 0; y < h; y++) if (m.get(dx - 1, y) === T.FLOOR && m.get(dx, y) === T.FLOOR) { fy = y; break; }
      if (fy < 0) return null;
      for (let y = fy - 1; y >= fy - 2; y--) { m.set(dx - 1, y, T.DOOR); m.set(dx, y, T.DOOR); }
      // keep the floor tile below the door clear
      m.set(dx - 1, fy, T.FLOOR); m.set(dx, fy, T.FLOOR);
      m.exits.push({ tx: dx - 1, ty: fy - 1, dir: 'n', w: 2 });
    }
  }

  // walls around everything walkable
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (m.get(x, y) !== T.VOID) continue;
      let near = false;
      for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2 && !near; i++) {
        const t = m.get(x + i, y + j);
        if (t === T.FLOOR || t === T.PIT || t === T.BLOCK) near = true;
      }
      if (near) m.set(x, y, T.WALL);
    }
  // top wall must be at least 2 thick so faces read
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((m.get(x, y) === T.FLOOR || m.get(x, y) === T.PIT) && m.get(x, y - 1) === T.WALL && m.get(x, y - 2) === T.VOID) m.set(x, y - 2, T.WALL);
  }

  // connectivity: every exit and spawn region reachable from entry (no pits)
  const start = m.entry ? { tx: m.entry.tx, ty: m.entry.ty - 1 } : { tx: cx, ty: y1 };
  const reach = m.reach(start.tx, start.ty, false);
  for (const e of m.exits) if (!reach[(e.ty + 1) * w + e.tx] || !reach[(e.ty + 1) * w + e.tx + 1]) return null;
  // remove unreachable floor islands (fill with pit so they read as ledges)
  let floorCount = 0, reachCount = 0;
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === T.FLOOR) { floorCount++; if (reach[i]) reachCount++; }
  if (reachCount < floorCount * 0.85 && attempt < 25) return null;

  // spawnable tiles: reachable floor away from the entry
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!reach[y * w + x] || m.get(x, y) !== T.FLOOR) continue;
      let ok = true;
      for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (m.get(x + i, y + j) !== T.FLOOR) ok = false;
      if (!ok) continue;
      if (m.entry && Math.hypot(x - m.entry.tx, y - m.entry.ty) < 7) continue;
      m.spawnable.push({ tx: x, ty: y });
    }
  if ((kind === 'combat' || kind === 'elite') && m.spawnable.length < 40) return null;

  for (let i = 0; i < m.vari.length; i++) m.vari[i] = rng.int(0, 255);
  decorate(m, rng, kind, o.biome);
  return m;
}

function block(m: RoomMap, x: number, y: number, w: number, h: number, t: T) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m.set(i, j, t);
}

function applyShape(m: RoomMap, rng: RNG, shape: string, x0: number, y0: number, x1: number, y1: number) {
  const iw = x1 - x0 + 1, ih = y1 - y0 + 1;
  switch (shape) {
    case 'chamfer': {
      const c = rng.int(2, 4);
      for (let k = 0; k < c; k++)
        for (let j = 0; j < c - k; j++) {
          m.set(x0 + j, y0 + k, T.VOID); m.set(x1 - j, y0 + k, T.VOID);
          m.set(x0 + j, y1 - k, T.VOID); m.set(x1 - j, y1 - k, T.VOID);
        }
      break;
    }
    case 'cross': {
      const cw = rng.int(3, Math.floor(iw / 4)), ch = rng.int(2, Math.floor(ih / 4));
      block(m, x0, y0, cw, ch, T.VOID); block(m, x1 - cw + 1, y0, cw, ch, T.VOID);
      block(m, x0, y1 - ch + 1, cw, ch, T.VOID); block(m, x1 - cw + 1, y1 - ch + 1, cw, ch, T.VOID);
      break;
    }
    case 'alcove': {
      // shrink sides, leave alcoves in the middle
      const s = 2, ah = rng.int(3, 5);
      const my = Math.floor((y0 + y1) / 2);
      block(m, x0, y0, s, ih, T.VOID); block(m, x1 - s + 1, y0, s, ih, T.VOID);
      block(m, x0, my - (ah >> 1), s, ah, T.FLOOR); block(m, x1 - s + 1, my - (ah >> 1), s, ah, T.FLOOR);
      break;
    }
    case 'notch': {
      // bites from the top wall between exits
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const nw = rng.int(3, 5);
        const nx = i === 0 ? x0 + Math.floor(iw * 0.5) - Math.floor(nw / 2) : x0 + rng.int(2, iw - nw - 2);
        block(m, nx, y1 - 1, nw, 2, T.VOID);
      }
      break;
    }
    case 'hall': {
      // long hall with pinched middle
      const p = Math.floor(ih / 4);
      const mx = Math.floor((x0 + x1) / 2);
      block(m, mx - 2, y0, 4, p, T.VOID);
      block(m, mx - 2, y1 - p + 1, 4, p, T.VOID);
      break;
    }
  }
}

function applyObstacles(m: RoomMap, rng: RNG, ob: string, x0: number, y0: number, x1: number, y1: number, biome: number) {
  const iw = x1 - x0 + 1, ih = y1 - y0 + 1;
  const cx = Math.floor((x0 + x1 + 1) / 2), cy = Math.floor((y0 + y1 + 1) / 2);
  switch (ob) {
    case 'pillars4': {
      const fx = rng.range(0.22, 0.3), fy = rng.range(0.28, 0.34);
      for (const [ax, ay] of [[fx, fy], [1 - fx, fy], [fx, 1 - fy], [1 - fx, 1 - fy]]) {
        const px = Math.round(x0 + iw * ax) - 1, py = Math.round(y0 + ih * ay) - 1;
        block(m, px, py, 2, 2, T.WALL);
      }
      break;
    }
    case 'pillars2': {
      const fx = rng.range(0.25, 0.33);
      for (const ax of [fx, 1 - fx]) block(m, Math.round(x0 + iw * ax) - 1, cy - 1, 2, rng.int(2, 3), T.WALL);
      break;
    }
    case 'pitCenter': {
      const pw = rng.int(4, Math.min(8, iw - 12)), ph = rng.int(3, Math.min(5, ih - 8));
      block(m, cx - (pw >> 1), cy - (ph >> 1), pw, ph, T.PIT);
      break;
    }
    case 'pitSides': {
      const pw = rng.int(3, 5), ph = rng.int(3, Math.min(6, ih - 6));
      block(m, x0 + 3, cy - (ph >> 1), pw, ph, T.PIT);
      block(m, x1 - 3 - pw + 1, cy - (ph >> 1), pw, ph, T.PIT);
      break;
    }
    case 'channel': {
      // horizontal water channel with two bridges
      const chy = cy - 1;
      block(m, x0, chy, iw, 2, T.PIT);
      const b1 = x0 + Math.floor(iw * 0.25), b2 = x0 + Math.floor(iw * 0.75) - 2;
      block(m, b1, chy, 3, 2, T.FLOOR);
      block(m, b2, chy, 3, 2, T.FLOOR);
      // keep the central entry->exit lane connected
      block(m, cx - 1, chy, 2, 2, T.FLOOR);
      break;
    }
    case 'crates': {
      const n = rng.int(4, 8);
      for (let i = 0; i < n; i++) {
        const px = rng.int(x0 + 3, x1 - 3), py = rng.int(y0 + 2, y1 - 3);
        if (Math.abs(px - cx) < 2) continue;
        m.props.push({ type: rng.chance(0.5) ? 'crate' : 'barrel', tx: px, ty: py });
        m.set(px, py, T.BLOCK);
        if (rng.chance(0.4)) { m.props.push({ type: 'crate', tx: px + 1, ty: py }); m.set(px + 1, py, T.BLOCK); }
      }
      break;
    }
    case 'island': {
      const pw = rng.int(4, 6), ph = rng.int(2, 3);
      block(m, cx - (pw >> 1), cy - (ph >> 1) - 1, pw, ph, T.WALL);
      break;
    }
    case 'pitScatter': {
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const pw = rng.int(2, 3), ph = rng.int(2, 3);
        const px = rng.int(x0 + 2, x1 - pw - 2), py = rng.int(y0 + 2, y1 - ph - 3);
        if (Math.abs(px + pw / 2 - cx) < 3) continue;
        block(m, px, py, pw, ph, T.PIT);
      }
      break;
    }
  }
}

/** Non-blocking dressing + lights. Biome renderers interpret prop types. */
function decorate(m: RoomMap, rng: RNG, kind: RoomKind, biome: number) {
  const P = (type: string, tx: number, ty: number, data?: Record<string, unknown>) => m.props.push({ type, tx, ty, data } as PropSpec);
  // wall lamps along north face rows
  const faceTiles: { tx: number; ty: number }[] = [];
  for (let y = 1; y < m.h; y++)
    for (let x = 0; x < m.w; x++) if (m.get(x, y) === T.WALL && m.get(x, y + 1) === T.FLOOR && m.get(x, y - 1) !== T.FLOOR) faceTiles.push({ tx: x, ty: y });
  // lamps every ~6 tiles
  const usedFace = new Set<number>();
  faceTiles.sort((a, b) => a.ty * 1000 + a.tx - (b.ty * 1000 + b.tx));
  let lastX = -99, lastY = -1;
  for (const f of faceTiles) {
    if (f.ty !== lastY) { lastX = -99; lastY = f.ty; }
    if (f.tx - lastX >= 6 && rng.chance(0.8)) {
      // avoid doors
      if (m.exits.some((e) => Math.abs(e.tx - f.tx) < 3 && Math.abs(e.ty - f.ty) < 3)) continue;
      P('walllamp', f.tx, f.ty);
      usedFace.add(f.ty * m.w + f.tx);
      lastX = f.tx;
    }
  }
  // wall features
  for (const f of faceTiles) {
    if (usedFace.has(f.ty * m.w + f.tx)) continue;
    if (m.exits.some((e) => Math.abs(e.tx - f.tx) < 3 && Math.abs(e.ty - f.ty) < 3)) continue;
    const r = rng.next();
    if (r < 0.06) P('wallgear', f.tx, f.ty, { big: rng.chance(0.4) });
    else if (r < 0.1) P('pipe', f.tx, f.ty);
    else if (r < 0.13) P('window', f.tx, f.ty);
  }
  // floor clutter (non-blocking)
  const open = m.openTiles(1);
  const nClutter = Math.floor(open.length * 0.03);
  for (let i = 0; i < nClutter; i++) {
    const t = rng.pick(open);
    P(rng.pick(['debris', 'debris', 'cogpile', 'puddle', 'puddle']), t.tx, t.ty);
  }
  // corner candles / standing lamps for small rooms
  if (kind !== 'combat' && kind !== 'elite' && kind !== 'boss') {
    const fl = m.openTiles(0).filter((t) => m.get(t.tx, t.ty - 1) === T.WALL);
    for (let i = 0; i < 2 && fl.length; i++) { const t = rng.pick(fl); P('candles', t.tx, t.ty); }
  }
  // floating dust motes handled by the world (ambient)
  void biome;
}
