// Floor 2 — The Verdigris Conservatory: decor and enemy sprites.
// Light from the top-left; copper/verdigris/foliage ramps, parchment blossoms, warm accents.
// Never C (echo cyan) or M (enemy bullets) on bodies.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, spriteFromDef } from '../../engine/gfx/sprite';
import { rgb, blit } from '../blit';
import { paintGear, gearFrames, GearStyle } from '../gear';
import { TAU } from '../../engine/math';

const lazy = <T,>(f: () => T) => { let v: T | null = null; return () => (v ??= f()); };

// ═══════════════════════════════ DECOR ═══════════════════════════════

/** Victorian carriage lantern; pivot = hook at the top. The glass is overdrawn by a warm flame on the unlit layer. */
export const LANTERN = lazy(() => spriteFromDef({
  rows: [
    '...n...',
    '..nYn..',
    '.nYBBn.',
    'nBBBBBb',
    '.kgggk.',
    '.kgggk.',
    '.kgggk.',
    'nYBBBBb',
    '.nbbbn.',
    '..nbn..',
    '...n...',
  ],
  pal: { n: 'B1', Y: 'B5', B: 'B3', b: 'B2', k: 'B1', g: 'O1' },
  ox: 3, oy: 0,
}));

/** small standing lantern for the floor (generator 'candles') */
export const FLOOR_LANTERN = lazy(() => spriteFromDef({
  rows: [
    '..nYn..',
    '.nYBBn.',
    'nBBBBBb',
    '.kgggk.',
    '.kgggk.',
    '.kgggk.',
    '.kgggk.',
    'nYBBBBb',
    '.nbbbn.',
    'nbbbbbn',
  ],
  pal: { n: 'B1', Y: 'B5', B: 'B3', b: 'B2', k: 'B1', g: 'O1' },
  ox: 3, oy: 9,
}));

const COPPER_GEAR: GearStyle = { ramp: ['B0', 'B1', 'B2', 'B3', 'B4'], hub: 'B6', hole: 'K1', spokes: 6 };

/** wall-mounted clockwork sunflower (generator 'wallgear'): copper petals around a turning seed-gear */
export function buildClockFlower(big: boolean): { petals: Sprite; gear: Sprite[]; stalk: Sprite } {
  const R = big ? 12.5 : 8.5, gr = big ? 7 : 4.6, n = big ? 14 : 10;
  const S = Math.ceil(R) * 2 + 3, c = Math.floor(S / 2);
  const pb = new PixelBuf(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c - 0.5, dy = y + 0.5 - c - 0.5;
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      // petal profile: pointed lobes
      const k = (((a / TAU) * n) % 1 + 1) % 1;
      const lobe = 1 - Math.abs(k - 0.5) * 2;
      const pr = gr + 1 + (R - gr - 1) * Math.pow(lobe, 0.55);
      if (d > pr || d < gr - 0.5) continue;
      const lit = (-dx * 0.6 - dy * 0.8) / Math.max(1, d);
      let key = lit > 0.35 ? 'B4' : lit > -0.25 ? 'B3' : 'B2';
      if (d > pr - 1.2) key = lit > 0.2 ? 'B3' : 'B1';
      if (lobe < 0.18) key = 'B1';
      if (d > R - 2.5 && lobe > 0.6) key = lit > 0 ? 'T4' : 'T3';
      pb.set(x, y, rgb(key));
    }
  const petals = spriteFromBuf(pb, c, c);
  const gear = gearFrames(gr, big ? 9 : 7, COPPER_GEAR, 4, 1.4);
  // stalk with two leaves (pivot at top = flower centre)
  const H = big ? 16 : 12;
  const sb = new PixelBuf(9, H);
  for (let y = 0; y < H; y++) { sb.set(4, y, rgb(y < 3 ? 'T1' : 'T2')); sb.set(5, y, rgb('T1')); }
  const leaf = (y: number, dir: number) => {
    for (let i = 1; i <= 3; i++) sb.set(4 + dir * (i + (dir > 0 ? 1 : 0)), y - (i > 1 ? 1 : 0), rgb(i === 1 ? 'T3' : i === 2 ? 'T4' : 'T2'));
    sb.set(4 + dir * (dir > 0 ? 3 : 2), y, rgb('T1'));
  };
  leaf(Math.floor(H * 0.55), -1);
  leaf(Math.floor(H * 0.8), 1);
  const stalk = spriteFromBuf(sb, 4, 0);
  return { petals, gear, stalk };
}

/** terracotta urn with a verdigris fern (generator 'barrel' → breakable planter) */
export const URN = lazy(() => spriteFromDef({
  rows: [
    '......f.F.....',
    '...f..fFF..F..',
    '..fFf.FfF.FF..',
    '.f..FfFHFfF.f.',
    '....fFHfFFf.F.',
    '..FfFfFHFfFf..',
    '.f.FffFfFFfFf.',
    '...f.fFfFf.f..',
    '....f.fff.f...',
    '...nnnnnnnn...',
    '..nRRRRRRRRd..',
    '...dddddddd...',
    '..rRRRrrrrrd..',
    '.rRRrrrrrrrrd.',
    '.rRttttttttrd.',
    '.rRrrrrrrrrrd.',
    '.rRrrrrrrrrrd.',
    '..rRrrrrrrrd..',
    '..drrrrrrrdd..',
    '...ddddddd....',
    '...nnnnnnn....',
    '..nNNNNNNNn...',
  ],
  pal: { f: 'T1', F: 'T2', H: 'T4', n: 'B1', R: 'B3', r: 'B2', d: 'B1', t: 'T2', N: 'B0' },
  ox: 7, oy: 21,
}));

/** glass-lidded cold frame with seedlings (generator 'crate' → breakable planter) */
export const COLDFRAME = lazy(() => spriteFromDef({
  rows: [
    'kkkkkkkkkkkkkkkk',
    'kUuuuUuuuuuUuuuk',
    'kuGuuGuUuGuuGuuk',
    'kugGugGuggGugGuk',
    'kbbbbbbbbbbbbbbk',
    'bYYYYYYYYYYYYYYb',
    'beddddddddddddeb',
    'bedddddddddddded',
    'bYeeeeeeeeeeeeYb',
    'beddddddddddddeb',
    'bedddddddddddded',
    'kbbbbbbbbbbbbbbk',
  ],
  pal: { k: 'B0', U: 'U3', u: 'U1', G: 'G3', g: 'G2', b: 'B1', Y: 'B3', e: 'B2', d: 'B1' },
  ox: 8, oy: 11,
}));

/** small terracotta pot for decorative plants (pivot = bottom centre) */
export const POT = lazy(() => spriteFromDef({
  rows: [
    'nYYYYYYn',
    'nrrrrrrd',
    '.rRrrrd.',
    '.rRrrrd.',
    '..rrrd..',
  ],
  pal: { n: 'B1', Y: 'B3', r: 'B2', R: 'B3', d: 'B1' },
  ox: 4, oy: 5,
}));

/** frozen butterflies: three poses x three wing palettes (pivot = body centre) */
export function buildButterflies(): Sprite[][] {
  const poses = [
    ['aa.b.aa', 'aAAbAAa', '.aAbAa.', '.aa.aa.'],
    ['.a.b.a.', '.aAbAa.', '..aba..', '..a.a..'],
    ['...a...', '..aba..', '..aAa..', '...b...'],
  ];
  const pals = [
    { a: 'K7', A: 'K10', b: 'B1' },
    { a: 'O1', A: 'O3', b: 'K1' },
    { a: 'T2', A: 'T5', b: 'B1' },
  ];
  return pals.map((pal) => poses.map((rows) => spriteFromDef({ rows, pal, ox: 3, oy: 2 })));
}

// ═══════════════════════════════ ENEMIES ═══════════════════════════════

const hsh = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
/** light from the top-left (and slightly toward the viewer) on a unit-sphere normal */
const litN = (nx: number, ny: number, nz: number) => -nx * 0.55 - ny * 0.6 + nz * 0.58;
const set = (pb: PixelBuf, x: number, y: number, k: string) => pb.set(Math.round(x), Math.round(y), rgb(k));

// ───────────── 孢子囊 Spore Pod: a copper-ribbed seed bulb on a leafy rosette ─────────────

export interface SporePodArt { base: Sprite; idle: Sprite[]; swell: Sprite[]; puff: Sprite; limp: Sprite }

function paintBulb(rx: number, ry: number, vent: number, veins: 0 | 1 | 2, wrinkle = false): Sprite {
  const W = Math.ceil(rx * 2) + 4, H = Math.ceil(ry * 2) + 5;
  const pb = new PixelBuf(W, H);
  const cx = W / 2, cy = H - 3 - ry;
  for (let y = Math.floor(cy + ry - 1); y < H; y++) { set(pb, Math.floor(cx) - 1, y, 'T1'); set(pb, Math.floor(cx), y, 'G1'); }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d), l = litN(nx, ny, nz);
      let k = l > 0.78 ? 'T4' : l > 0.45 ? 'T3' : l > 0.08 ? 'T2' : l > -0.3 ? 'T1' : 'T0';
      // copper ribs along the longitudes
      const lon = nx / Math.sqrt(Math.max(0.1, 1 - ny * ny));
      const rp = ((((lon + 1) * 3.5) / 2) % 1 + 1) % 1;
      if (Math.abs(rp - 0.5) < 0.14 && ny > -0.8) {
        if (veins === 2) k = l > 0.15 ? 'O3' : 'O2';
        else if (veins === 1) k = l > 0.15 ? 'B4' : 'B3';
        else k = l > 0.3 ? 'B3' : l > -0.1 ? 'B2' : 'B1';
      }
      // pale spore sacs between the ribs on the lower belly
      if (ny > 0.1 && ny < 0.7 && Math.abs(rp) < 0.07 && d < 0.8) k = veins === 2 ? 'O4' : 'K8';
      if (wrinkle && d > 0.15 && ((y + Math.round(nx * 2)) % 3 === 0)) k = l > 0.3 ? 'T2' : 'T0';
      // glossy specular on the upper-left shoulder
      if (l > 0.9 && nx < -0.2 && ny < -0.2) k = 'T5';
      // vent crown
      if (ny < -0.62 && Math.abs(nx) < 0.12 + vent * 0.28) k = ny < -0.8 ? (veins === 2 ? 'O1' : 'K1') : veins === 2 ? 'O3' : 'B3';
      pb.set(x, y, rgb(k));
    }
  // a little copper lip around the vent
  const top = Math.round(cy - ry);
  const vw = Math.round(0.5 + vent * 1.6);
  for (let i = -vw - 1; i <= vw; i++) set(pb, Math.floor(cx) + i, top - 1, i < 0 ? 'B4' : 'B2');
  return spriteFromBuf(pb, Math.floor(cx), H - 1);
}

export function buildSporePod(): SporePodArt {
  const base = spriteFromDef({
    rows: [
      '...HG.......GH...',
      '..HGGg.....gGGH..',
      '.HGGgg.ttt.ggGGH.',
      'HGGgg.sstss.ggGGH',
      '.gg..sSSSSss..gg.',
      '....sssssssss....',
    ],
    pal: { H: 'G3', G: 'G2', g: 'G1', t: 'T1', s: 'B0', S: 'S0' },
    ox: 8, oy: 5,
  });
  return {
    base,
    idle: [paintBulb(5.6, 5.2, 0, 0), paintBulb(5.9, 5.0, 0, 0), paintBulb(5.7, 5.3, 0, 0)],
    swell: [paintBulb(6.3, 5.9, 0.3, 1), paintBulb(6.9, 6.6, 0.6, 1), paintBulb(7.5, 7.2, 1, 2)],
    puff: paintBulb(7.0, 4.4, 1, 0, true),
    limp: paintBulb(5.2, 4.6, 0.4, 0, true),
  };
}

// ───────────── 咬藤 Snapvine: a copper flytrap on a beaded vine ─────────────

export interface SnapvineArt { heads: Sprite[]; bead: Sprite; beadThorn: Sprite; root: Sprite; mound: Sprite[] }

/** trap head facing right, pivot at the hinge. theta = half-angle of the open jaws */
function paintTrap(theta: number): Sprite {
  const W = 19, H = 21, hx = 3, hy = 10, L = 13, Wm = 4.6;
  const pb = new PixelBuf(W, H);
  // maw between the lobes
  if (theta > 0.12)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - hx, dy = y + 0.5 - hy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        if (Math.abs(a) < theta - 0.04 && r < L * 0.9 && r > 0.5) pb.set(x, y, rgb(r < 4 ? 'R0' : Math.abs(a) < theta * 0.45 && r < L * 0.7 ? 'R2' : 'R1'));
      }
  for (const side of [-1, 1]) {
    const ang = side * theta, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
        const du = dx * ca + dy * sa, dv = (-dx * sa + dy * ca) * side;
        if (du < 0 || du > L) continue;
        const thick = 1.4 + (Wm - 1.4) * Math.pow(Math.sin((Math.PI * Math.min(du, L * 0.96)) / L), 0.6);
        if (dv < -0.4 || dv > thick) continue;
        const t = dv / thick;
        let k: string;
        if (side < 0) k = t > 0.72 ? 'B4' : t > 0.36 ? 'B3' : 'B2';
        else k = t > 0.3 ? 'B2' : 'B1';
        if (t > 0.86) k = side < 0 ? 'T3' : 'T2';
        if (side > 0 && hsh(x, y, 7) > 0.8 && t > 0.3) k = 'T2';
        if (dv < 0.7) k = theta > 0.2 ? (side < 0 ? 'R2' : 'R1') : 'B0';
        pb.set(x, y, rgb(k));
      }
    // cilia: pale spines along the inner rim, pointing across the mouth
    for (const f of [0.38, 0.52, 0.66, 0.8, 0.93]) {
      const du = f * L;
      for (let s = 1; s <= 2; s++) {
        const dv = -s * 0.95;
        const x = hx + du * ca - dv * side * sa + s * 0.35, y = hy + du * sa + dv * side * ca;
        set(pb, x, y, s === 2 ? 'K10' : 'K9');
      }
    }
  }
  return spriteFromBuf(pb, hx, hy);
}

export function buildSnapvine(): SnapvineArt {
  const beadBuf = (thorn: boolean) => {
    const pb = new PixelBuf(7, 7);
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const nx = (x - 3) / 2.6, ny = (y - 3) / 2.6, d = nx * nx + ny * ny;
        if (d > 1) continue;
        const l = litN(nx, ny, Math.sqrt(1 - d));
        pb.set(x, y, rgb(l > 0.6 ? 'G3' : l > 0.15 ? 'G2' : l > -0.3 ? 'G1' : 'T0'));
      }
    if (thorn) { set(pb, 1, 1, 'B3'); set(pb, 0, 0, 'K9'); set(pb, 5, 5, 'B2'); set(pb, 6, 6, 'K8'); }
    return spriteFromBuf(pb, 3, 3);
  };
  const root = spriteFromDef({
    rows: [
      '..HG.........GH..',
      '.HGg..s...s..gGH.',
      'HGg.sSsKKKsSs.gGH',
      '.g.ssKKKKKKKss.g.',
      '...sssssssssss...',
    ],
    pal: { H: 'G3', G: 'G2', g: 'G1', s: 'B0', S: 'S0', K: 'K0' },
    ox: 8, oy: 3,
  });
  const mound = [0, 1].map((ph) => spriteFromDef({
    rows: ph === 0
      ? ['....G...g.....', '...Gg.SG.g....', '..sSSSSSSss...', '.sSSSssssSss..', 'ssssssssssssss']
      : ['.....G...g....', '....gG.SgG....', '..sSSSSSSss...', '.sSSSsssssss..', 'ssssssssssssss'],
    pal: { G: 'G3', g: 'G2', S: 'S2', s: 'B1' },
    ox: 7, oy: 4,
  }));
  return {
    heads: [paintTrap(0.05), paintTrap(0.32), paintTrap(0.6), paintTrap(0.85)],
    bead: beadBuf(false),
    beadThorn: beadBuf(true),
    root,
    mound,
  };
}

// ───────────── 铜蛾 Brass Moth: copper-plated wings with an eyespot ─────────────

export interface MothArt { flap: Sprite[]; dive: Sprite }

function paintMoth(f: number, swept = false): Sprite {
  const W = 23, H = 17, cx = 11, cy = 8;
  const pb = new PixelBuf(W, H);
  const lift = (1 - f) * 3;
  for (const s of [-1, 1]) {
    const fcx = cx + s * (1.2 + 4.4 * f), fcy = cy - 1.5 - lift + (swept ? 2 : 0), frx = 0.8 + 4.6 * f, fry = 3.2;
    const hcx = cx + s * (1 + 3 * f), hcy = cy + 2.2 - lift * 0.6 + (swept ? 2 : 0), hrx = 0.7 + 3.1 * f, hry = 2.5;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        // hindwing (under)
        let nx = (x + 0.5 - hcx) / hrx, ny = (y + 0.5 - hcy) / hry;
        if (nx * nx + ny * ny <= 1 && (x - cx) * s >= 0) {
          let k = ny < -0.3 ? 'B3' : 'B2';
          if (ny > 0.55) k = 'T2';
          if (Math.abs(nx) > 0.75) k = 'B1';
          pb.set(x, y, rgb(k));
        }
        // forewing (over), slightly swept toward the tip
        nx = (x + 0.5 - fcx) / frx; ny = (y + 0.5 - fcy + nx * s * 0.8) / fry;
        if (nx * nx + ny * ny <= 1 && (x - cx) * s >= 0) {
          let k = 'B3';
          if (ny < -0.55) k = 'B5';
          else if (ny < -0.15) k = 'B4';
          else if (ny > 0.6) k = 'T3';
          if (nx * s > 0.82) k = 'B2';
          // eyespot
          const ex = nx * s - 0.25, ey = ny - 0.05;
          const ed = ex * ex + ey * ey;
          if (f > 0.4 && ed < 0.1) k = ed < 0.03 ? 'K10' : 'K1';
          // radial vein
          if (f > 0.5 && Math.abs(ny + 0.1 - nx * s * 0.4) < 0.08 && nx * s < 0.7) k = 'B2';
          pb.set(x, y, rgb(k));
        }
      }
  }
  // body
  const by = cy - 3 + (swept ? 1 : 0);
  for (let j = 0; j < 9; j++) {
    const yy = by + j;
    if (j < 2) { set(pb, cx, yy, 'B4'); set(pb, cx - 1, yy, j === 1 ? 'K0' : 'B3'); set(pb, cx + 1, yy, j === 1 ? 'K0' : 'B2'); }
    else if (j < 4) { set(pb, cx - 1, yy, 'K9'); set(pb, cx, yy, 'K8'); set(pb, cx + 1, yy, 'K7'); }
    else { const st = j % 2 === 0; set(pb, cx - 1, yy, st ? 'B1' : 'B4'); set(pb, cx, yy, st ? 'B2' : 'B5'); if (j < 8) set(pb, cx + 1, yy, st ? 'B0' : 'B3'); }
  }
  // feathered antennae
  for (const s of [-1, 1]) {
    set(pb, cx + s, by - 1, 'B3'); set(pb, cx + s * 2, by - 2, 'B4'); set(pb, cx + s * 2, by - 3, 'B5'); set(pb, cx + s * 3, by - 3, 'B3');
  }
  return spriteFromBuf(pb, cx, cy + 2);
}

export function buildMoth(): MothArt {
  return { flap: [paintMoth(1), paintMoth(0.62), paintMoth(0.22), paintMoth(0.62)], dive: paintMoth(0.35, true) };
}

// ───────────── 修剪者 Pruner: a cloche-headed gardener automaton with great shears ─────────────

export interface PrunerArt { idle: Sprite[]; walk: Sprite[]; crouch: Sprite; lunge: Sprite; slump: Sprite }

const PRUNER_PAL: Record<string, string> = {
  q: 'U2', g: 'U3', G: 'U4', W: 'K10', w: 'K8', o: 'O3', O: 'O4', n: 'B1', b: 'B2', B: 'B3', Y: 'B5',
  a: 'G1', A: 'G2', h: 'G3', p: 'B1', c: 'B2', C: 'B4', k: 'K2',
};
const PRUNER_TOP = [
  '.....GW.......',
  '....gGWg......',
  '...gGWggq.....',
  '..gGWgooqq....',
  '..gWgoOoqq....',
  '..gggoooqq....',
  '..qgggggqq....',
  '.nBYBBBBBBn...',
  '..nbBBBbbn....',
  '.CAhhhhhhAc...',
  '.cAhAAAAhAc...',
  '..AhAApAhA....',
  '..AhAApAhA....',
  '..aAAAAAAa....',
  '...aaaaaa.....',
];
export function buildPruner(): PrunerArt {
  const make = (bob: number, legA: number, legB: number, lean = 0, crouch = 0) => {
    const pb = new PixelBuf(16, 27);
    const top = 17 + bob + crouch;
    for (const [lx, lift] of [[4, legA], [8, legB]] as [number, number][]) {
      for (let y = top; y < 24 - lift; y++) { set(pb, lx, y, 'B3'); set(pb, lx + 1, y, 'B1'); }
      set(pb, lx - 1, 24 - lift, 'K3'); set(pb, lx, 24 - lift, 'K4'); set(pb, lx + 1, 24 - lift, 'K2'); set(pb, lx + 2, 24 - lift, 'K1');
      set(pb, lx, 25 - lift, 'K1'); set(pb, lx + 1, 25 - lift, 'K1');
    }
    blit(pb, PRUNER_TOP, PRUNER_PAL, 1 + lean, 2 + bob + crouch);
    return spriteFromBuf(pb, 7, 25);
  };
  return {
    idle: [make(0, 0, 0), make(1, 0, 0)],
    walk: [make(0, 2, 0), make(-1, 0, 0), make(0, 0, 2), make(-1, 0, 0)],
    crouch: make(1, 0, 0, -1, 2),
    lunge: make(0, 0, 1, 1, 0),
    slump: make(2, 0, 0, 0, 1),
  };
}

/** great shears pointing right; pivot at the grip. open = half-angle of the blades */
export function paintShears(open: number): Sprite {
  const W = 30, H = 19, gx = 5, gy = 9, rv = 9;
  const pb = new PixelBuf(W, H);
  // handles: two brass loops behind the rivet
  for (const s of [-1, 1]) {
    const lx = gx - 2, ly = gy + s * (2 + open * 6);
    for (let t = 0; t <= 1; t += 0.12) set(pb, lx + (rv - lx) * t, ly + (gy - ly) * t, t < 0.5 ? 'B2' : 'B3');
    for (let a = 0; a < TAU; a += 0.5) set(pb, lx + Math.cos(a) * 1.6, ly + Math.sin(a) * 1.6, a > Math.PI ? 'B3' : 'B1');
  }
  // blades: tapered steel, bright cutting edge toward the other blade
  for (const s of [-1, 1]) {
    const a = s * open, ca = Math.cos(a), sa = Math.sin(a);
    const len = 19;
    for (let t = 0; t <= len; t += 0.5) {
      const w = t < 11 ? 2.2 : 2.2 * (1 - (t - 11) / (len - 11));
      for (let v = 0; v <= w; v += 0.5) {
        const x = rv + ca * t - sa * v * s, y = gy + sa * t + ca * v * s;
        const k = v < 0.6 ? (s < 0 ? 'K10' : 'K9') : v > w - 0.6 ? (s < 0 ? 'K6' : 'K5') : s < 0 ? 'K8' : 'K7';
        set(pb, x, y, k);
      }
    }
  }
  set(pb, rv, gy, 'B5'); set(pb, rv - 1, gy, 'B3'); set(pb, rv + 1, gy, 'B2'); set(pb, rv, gy - 1, 'B4'); set(pb, rv, gy + 1, 'B1');
  return spriteFromBuf(pb, gx, gy);
}

// ───────────── 荆棘母 Thornmother (elite): a rose-crowned matron of vine and leaf ─────────────

export interface ThornmotherArt { idle: Sprite[]; raise: Sprite[]; cast: Sprite; plunge: Sprite[]; spike: Sprite[] }

type ArmPose = 'idle' | 'raise' | 'cast' | 'plunge';

function paintMother(bloom: number, phase: number, arms: ArmPose, bob: number, flare = 0, eyesOpen = false): Sprite {
  const W = 48, H = 52, cx = 24, base = 48;
  const pb = new PixelBuf(W, H);
  const yb = base + bob;
  // ── arms (plunging arms are drawn in front of the body, the rest behind) ──
  const arm = (s: number, front: boolean) => {
    const sx = cx + s * 5, sy = yb - 30;
    let ex: number, ey: number, mx: number, my: number;
    switch (arms) {
      case 'raise': ex = cx + s * 15; ey = yb - 44; mx = cx + s * 15; my = yb - 32; break;
      case 'cast': ex = cx + s * 21; ey = yb - 29; mx = cx + s * 13; my = yb - 36; break;
      case 'plunge': ex = cx + s * 8; ey = yb + 1; mx = cx + s * 14; my = yb - 18; break;
      default: ex = cx + s * 13; ey = yb - 15; mx = cx + s * 11; my = yb - 27;
    }
    if (front !== (arms === 'plunge')) return;
    let n = 0;
    for (let t = 0; t <= 1.0001; t += 0.035, n++) {
      const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex;
      const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey;
      const r = 1.8 - t * 0.7;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const d = Math.hypot(i, j);
        if (d > r) continue;
        const l = (-i - j) / Math.max(1, d);
        set(pb, x + i, y + j, d > r - 0.8 ? (l > 0 ? 'B2' : 'B0') : l > 0.3 ? 'B3' : n % 5 === 0 ? 'T2' : 'B2');
      }
      // thorns: short hooked spikes on the outer side
      if (n % 7 === 3 && t < 0.9) { set(pb, x + s * 2, y - 1, 'B3'); set(pb, x + s * 3, y - 2, 'K9'); }
    }
    // leaf-claw hand
    const hk = arms === 'raise' || arms === 'cast' ? 'G3' : 'G2';
    for (const [i, j] of [[0, 0], [s, -1], [s * 2, -1], [s, 1], [s * 2, 2], [0, 2], [-s, 2]]) set(pb, ex + i, ey + j, hk);
    set(pb, ex + s * 3, ey - 2, 'K10'); set(pb, ex + s * 3, ey + 3, 'K9'); set(pb, ex, ey + 3, 'K9');
  };
  arm(-1, false); arm(1, false);
  // ── skirt: rows of hanging teardrop leaves, drawn bottom row first so upper rows overlap ──
  const top = yb - 23;
  const rows = 5;
  for (let r = rows - 1; r >= 0; r--) {
    const ly = top + r * 4.4;
    const hwRow = 6 + r * 3.4 + flare * r * 0.9;
    const n = Math.max(2, Math.round((hwRow * 2) / 5.2));
    const sh = r % 2 === 1 ? phase : -phase;
    for (let k = 0; k < n; k++) {
      const lx = cx - hwRow + ((k + 0.5) * hwRow * 2) / n + sh;
      const lh = 7 + (r === rows - 1 ? 1 : 0), lw = 3.3;
      const verd = hsh(k, r, 5) > 0.74;
      const ramp = verd ? ['T0', 'T1', 'T2', 'T3'] : ['G0', 'G1', 'G2', 'G3'];
      const shade = (lx - cx) / (hwRow + 1); // -1 (lit left) .. 1 (shadow right)
      for (let j = 0; j <= lh; j++) {
        const v = j / lh;
        const hw = lw * Math.pow(Math.sin(Math.PI * (0.12 + v * 0.88)), 0.75);
        for (let i = -4; i <= 4; i++) {
          const u = i + 0.5 - (lx - Math.floor(lx));
          if (Math.abs(u) > hw) continue;
          const x = Math.floor(lx) + i, y = Math.round(ly + j);
          let L = u < -0.6 ? 3 : u < 0.6 ? 2 : 1;
          if (Math.abs(u) > hw - 1) L = u < 0 ? 2 : 0;
          if (Math.abs(u) < 0.5 && v > 0.15 && v < 0.85) L = verd ? 1 : 1; // midrib
          if (v > 0.8) L = Math.min(L, 1);
          if (shade > 0.35 && L > 0) L--;
          if (shade < -0.5 && L < 3 && v < 0.5) L++;
          let key = ramp[L];
          if (verd && Math.abs(u) < 0.5 && v > 0.15 && v < 0.85) key = 'T1';
          set(pb, x, y, key);
        }
      }
    }
  }
  // roots spreading from the hem
  for (const [dx, len, dir] of [[-13, 6, -1], [-6, 4, -1], [8, 5, 1], [14, 6, 1]] as [number, number, number][]) {
    for (let i = 0; i < len; i++) set(pb, cx + dx + dir * i, yb + (i > 2 ? 1 : 0), i === len - 1 ? 'B1' : 'B0');
  }
  // ── bodice: twisted copper vines and verdigris ──
  for (let y = yb - 31; y < yb - 21; y++) {
    const ry = y - (yb - 31);
    const hw = 4.5 - (ry > 5 ? (ry - 5) * 0.3 : 0) + (ry < 2 ? 1 : 0);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const band = ((x + y) % 5 + 5) % 5;
      const left = x < cx;
      let k = band < 2 ? (left ? 'B3' : 'B2') : band < 4 ? (left ? 'T2' : 'T1') : 'B1';
      if (Math.abs(x + 0.5 - cx) > hw - 1) k = left ? 'B2' : 'B0';
      set(pb, x, y, k);
    }
    if (ry % 4 === 1) { set(pb, cx - hw - 1, y, 'K9'); set(pb, cx + hw + 1, y + 1, 'K8'); }
  }
  // collar ruff of small leaves
  for (let i = -7; i <= 7; i++) {
    const y = yb - 32 + Math.round(Math.abs(i) * 0.25);
    set(pb, cx + i, y, i < -2 ? 'G3' : i < 3 ? 'G2' : 'G1');
    set(pb, cx + i, y + 1, i < 0 ? 'G2' : 'G0');
    if (i % 3 === 0) set(pb, cx + i, y - 1, i < 0 ? 'G3' : 'G1');
  }
  arm(-1, true); arm(1, true);
  // ── hood of dark leaves framing a porcelain doll's face ──
  const hcx = cx, hcy = yb - 39;
  for (let y = hcy - 7; y <= hcy + 7; y++)
    for (let x = hcx - 7; x <= hcx + 7; x++) {
      const nx = (x + 0.5 - hcx) / 6.6, ny = (y + 0.5 - hcy) / 7.2, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const l = litN(nx, ny, Math.sqrt(1 - d));
      let k = l > 0.55 ? 'G2' : l > 0.1 ? 'G1' : 'G0';
      // leaf scales on the hood
      if (((x + (y >> 1)) % 3 === 0) && y % 2 === 0) k = l > 0.3 ? 'G3' : 'G1';
      set(pb, x, y, k);
    }
  for (let y = hcy - 4; y <= hcy + 5; y++)
    for (let x = hcx - 4; x <= hcx + 4; x++) {
      const nx = (x + 0.5 - hcx) / 3.9, ny = (y + 0.5 - hcy - 0.6) / 5, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const l = litN(nx, ny, Math.sqrt(1 - d));
      set(pb, x, y, l > 0.62 ? 'K10' : l > 0.25 ? 'K9' : l > -0.15 ? 'K8' : 'K7');
    }
  if (eyesOpen) {
    for (const ex of [hcx - 3, hcx + 1]) { set(pb, ex, hcy, 'K1'); set(pb, ex + 1, hcy, 'K1'); set(pb, ex + (ex < hcx ? 1 : 0), hcy, 'O3'); set(pb, ex, hcy - 1, 'K6'); set(pb, ex + 1, hcy - 1, 'K6'); }
  } else {
    // serene closed eyes: downturned lash lines
    for (const ex of [hcx - 3, hcx + 1]) { set(pb, ex, hcy, 'K5'); set(pb, ex + 1, hcy + 1, 'K4'); set(pb, ex + 2, hcy, 'K5'); }
  }
  set(pb, hcx - 3, hcy + 2, 'K8'); set(pb, hcx + 2, hcy + 2, 'K8'); // cheeks
  set(pb, hcx, hcy + 3, 'R2'); set(pb, hcx - 1, hcy + 3, 'K6');      // small painted lips
  set(pb, hcx + 2, hcy - 3, 'K7'); set(pb, hcx + 3, hcy - 2, 'K6');  // hairline crack
  // ── the crown rose: hand-drawn bloom stages (bud → open with an ember heart) ──
  const ROSES = [
    ['..KWK..', '.KWkKk.', 'KWkaKkk', 'KKaakKk', '.kKKkk.', '..kkk..'],
    ['...KWK...', '.KWkWKk..', 'KWkaaKkk.', 'KKakKaKka', 'KkaKkaKka', '.kkaaakk.', '..kkkkk..'],
    ['....KWK....', '.KWkKWKkK..', 'KWkKaaaKkk.', 'KKkaWcKaKka', 'KKkaccKaKka', '.KkkaaaKkk.', '..kkKKKkk..', '....kkk....'],
  ];
  const rose = ROSES[Math.max(0, Math.min(2, bloom))];
  const rw = rose[0].length, rh = rose.length;
  const rx0 = hcx + 1 - (rw >> 1), ry0 = hcy - 6 - rh;
  blit(pb, rose, { K: 'K9', W: 'K10', k: 'K8', a: 'K7', c: 'O3' }, rx0, ry0);
  const rr = rw / 2, rcx = hcx + 1, rcy = ry0 + rh / 2;
  // sepal leaves under the bloom
  set(pb, rcx - rr - 1, rcy + 2, 'G2'); set(pb, rcx - rr, rcy + 3, 'G3'); set(pb, rcx + rr + 1, rcy + 2, 'G1'); set(pb, rcx + rr, rcy + 3, 'G1');
  return spriteFromBuf(pb, cx, base);
}
/** thorn spikes bursting from the tiles (rise → full → withdraw) */
function paintSpike(h: number): Sprite {
  const pb = new PixelBuf(13, 18);
  const bx = 6, by = 16;
  for (const [ox, sh, lean] of [[-3, 0.65, -0.25], [0, 1, 0.05], [3, 0.75, 0.3]] as [number, number, number][]) {
    const hh = Math.round(h * sh);
    for (let j = 0; j < hh; j++) {
      const w = Math.max(0, Math.round((1 - j / hh) * 1.6));
      const x0 = bx + ox + Math.round(lean * j);
      for (let i = -w; i <= w; i++) set(pb, x0 + i, by - j, j > hh - 3 ? (j === hh - 1 ? 'K10' : 'K9') : i < 0 ? 'B3' : i > 0 ? 'B1' : 'B2');
    }
  }
  for (let i = -5; i <= 5; i++) { set(pb, bx + i, by + 1, Math.abs(i) > 3 ? 'B0' : 'S0'); if (Math.abs(i) < 4) set(pb, bx + i, by, i < 0 ? 'S1' : 'B0'); }
  return spriteFromBuf(pb, bx, by + 1);
}

export function buildThornmother(): ThornmotherArt {
  return {
    idle: [paintMother(0, 0, 'idle', 0), paintMother(0, 1, 'idle', 1), paintMother(0, 0, 'idle', 1), paintMother(0, -1, 'idle', 0)],
    raise: [paintMother(1, 0, 'raise', -1, 0, true), paintMother(2, 1, 'raise', -1, 0, true)],
    cast: paintMother(2, 0, 'cast', 0, 0.6, true),
    plunge: [paintMother(0, 0, 'plunge', 1, 0.4, true), paintMother(0, 1, 'plunge', 2, 0.8, true)],
    spike: [paintSpike(5), paintSpike(13), paintSpike(9)],
  };
}

// ═══════════════════════════════ preview ═══════════════════════════════

export function previewGroups(page: number): { name: string; sprites: Sprite[]; zoom?: number }[] {
  if (page === 1) {
    const t = buildThornmother();
    return [
      { name: 'thornmother idle / raise / cast', sprites: [...t.idle.slice(0, 2), ...t.raise, t.cast], zoom: 3 },
      { name: 'thornmother plunge + spikes', sprites: [...t.plunge, ...t.spike], zoom: 3 },
    ];
  }
  if (page === 2) {
    const f = [buildClockFlower(true), buildClockFlower(false)];
    return [
      { name: 'decor', sprites: [LANTERN(), FLOOR_LANTERN(), URN(), COLDFRAME(), POT(), f[0].petals, f[0].gear[0], f[0].stalk, f[1].petals, f[1].gear[0]], zoom: 4 },
      { name: 'butterflies', sprites: buildButterflies().flat(), zoom: 5 },
    ];
  }
  if (page === 3) {
    const mo = buildMoth(), pr = buildPruner();
    return [
      { name: 'brass moth', sprites: [...mo.flap, mo.dive], zoom: 4 },
      { name: 'pruner + shears', sprites: [...pr.idle, ...pr.walk, pr.crouch, pr.lunge, pr.slump, paintShears(0.05), paintShears(0.4)], zoom: 3 },
    ];
  }
  const sp = buildSporePod(), sv = buildSnapvine();
  return [
    { name: 'spore pod: base / idle / swell / puff / limp', sprites: [sp.base, ...sp.idle, ...sp.swell, sp.puff, sp.limp], zoom: 4 },
    { name: 'snapvine: heads / beads / root / mound', sprites: [...sv.heads, sv.bead, sv.beadThorn, sv.root, ...sv.mound], zoom: 4 },
  ];
}
