// Floor 1 — The Sunken Gearworks: enemy sprites.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, spriteFromDef, RotCache } from '../../engine/gfx/sprite';
import { blit, rgb } from '../blit';
import { paintGear, BRASS_GEAR, IRON_GEAR, RUST_GEAR, gearFrames } from '../gear';

// ───────────── Cogling: a walking gear with one curious eye ─────────────
const COG_STYLE = { ramp: ['B0', 'B1', 'B2', 'B3', 'B4'], hub: 'B5', hole: 'K1', spokes: 0 };
export function buildCogling(): { roll: Sprite[]; eye: Sprite; pupil: Sprite } {
  const roll: Sprite[] = [];
  for (let i = 0; i < 4; i++) {
    const pb = new PixelBuf(17, 17);
    paintGear(pb, 8, 8, 7.4, 8, (i / 4) * (Math.PI * 2 / 8), COG_STYLE, 2);
    roll.push(spriteFromBuf(pb, 8, 15));
  }
  const eye = spriteFromDef({ rows: ['.wwww.', 'wWWWWw', 'wWWWWw', 'wWWWWv', 'wWWWWv', '.vvvv.'], pal: { w: 'K9', W: 'K10', v: 'K8' }, ox: 3, oy: 3, outline: 'K0' });
  const pupil = spriteFromDef({ rows: ['kk', 'kk'], pal: { k: 'K0' }, ox: 1, oy: 1, outline: false });
  return { roll, eye, pupil };
}

// ───────────── Tin Sentry: a nutcracker guard with a spear ─────────────
const SENTRY_PAL: Record<string, string> = {
  r: 'R2', S: 'R3', z: 'R1', Y: 'B5', b: 'B3', W: 'K10', w: 'K8', v: 'K7', k: 'K1',
  B: 'B5', c: 'U2', C: 'U3', x: 'U1', g: 'B4',
};
const SENTRY_TOP = [
  '...rrrr...',
  '..rSSSSr..',
  '..rSYYSr..',
  '..rSYbSr..',
  '..zzzzzz..',
  '..wWWWWw..',
  '..wkWWkw..',
  '..wWWWWw..',
  '...wvvw...',
  '.BbccccbB.',
  '.bcCYcYcb.',
  '..cCcYcx..',
  '..cCYcYx..',
  '..xxggxx..',
];
export function buildSentry(): { idle: Sprite[]; walk: Sprite[]; windup: Sprite; thrust: Sprite } {
  const make = (bob: number, legA: number, legB: number, lean = 0) => {
    const pb = new PixelBuf(14, 24);
    // legs: tin cylinders
    const top = 15 + bob;
    const legs: [number, number][] = [[4, legA], [7, legB]];
    for (const [lx, lift] of legs) {
      for (let y = top; y < 22 - lift; y++) { pb.set(lx + 1, y, rgb('K8')); pb.set(lx + 2, y, rgb('K6')); }
      pb.set(lx + 1, 22 - lift, rgb('K2')); pb.set(lx + 2, 22 - lift, rgb('K2')); pb.set(lx + 3, 22 - lift, rgb('K1'));
    }
    blit(pb, SENTRY_TOP, SENTRY_PAL, 2 + lean, 1 + bob);
    return spriteFromBuf(pb, 7, 22);
  };
  return {
    idle: [make(0, 0, 0), make(1, 0, 0)],
    walk: [make(0, 1, 0), make(-1, 0, 0), make(0, 0, 1), make(-1, 0, 0)],
    windup: make(1, 0, 0, -1),
    thrust: make(0, 0, 1, 1),
  };
}
export const SPEAR = spriteFromDef({
  rows: [
    '......................kk.',
    'bbbbbbbbbbbbbbbbbbbbYwWWk',
    'nnnnnnnnnnnnnnnnnnnnnwwk.',
  ],
  pal: { b: 'B3', n: 'B1', Y: 'B5', w: 'K8', W: 'K10', k: 'K6' },
  ox: 4, oy: 1,
});
export const spearRot = new RotCache(SPEAR, 32);

// ───────────── Bolt Spitter: squat crab turret ─────────────
const SPIT_PAL: Record<string, string> = { a: 'K3', A: 'K4', s: 'K5', S: 'K6', h: 'K7', b: 'B3', B: 'B5', e: 'M2', E: 'M3', k: 'K1', d: 'K2' };
const SPIT_BODY = [
  '....dddddd....',
  '..daASSSSAad..',
  '.daAShhhhSAad.',
  '.dAShbSSbhSAd.',
  'daAsSSSSSSsAad',
  'daAsSkEEkSsAad',
  'daaAAAAAAAAaad',
  '.dbbbbbbbbbbd.',
  '..dddddddddd..',
];
export function buildSpitter(): { idle: Sprite[]; charge: Sprite } {
  const make = (bob: number, legPhase: number, eye: 'e' | 'E') => {
    const pb = new PixelBuf(18, 16);
    // 4 crab legs
    const legY = 11;
    for (const [x, dir] of [[2, -1], [4, -1], [12, 1], [14, 1]] as [number, number][]) {
      const lift = (legPhase + (x > 8 ? 1 : 0)) % 2;
      pb.set(x, legY + bob, rgb('K4'));
      pb.set(x + dir, legY + 1 + bob, rgb('K4'));
      pb.set(x + dir, legY + 2 - lift + bob, rgb('K3'));
      pb.set(x + dir, legY + 3 - lift, rgb('K2'));
    }
    const rows = SPIT_BODY.map((r) => r.replace(/E/g, eye));
    blit(pb, rows, SPIT_PAL, 2, 3 + bob);
    return spriteFromBuf(pb, 9, 14);
  };
  return { idle: [make(0, 0, 'e'), make(1, 1, 'e')], charge: make(1, 0, 'E') };
}
export const SPIT_BARREL = spriteFromDef({
  rows: ['.nnnn...', 'nBBBBbbn', 'nbbbbbbn', '.nnnn...'],
  pal: { n: 'B1', B: 'B4', b: 'B3' },
  ox: 1, oy: 2,
});
export const spitBarrelRot = new RotCache(SPIT_BARREL, 32);

// ───────────── Rust Mite: tiny skittering beetle ─────────────
export function buildMite(): { walk: Sprite[]; hop: Sprite } {
  const body = ['..rr..', '.rRRr.', 'rRYRRr', 'rRRRRr', '.rrrr.'];
  const pal = { r: 'R1', R: 'R2', Y: 'R4' };
  const make = (phase: number, hop = false) => {
    const pb = new PixelBuf(10, 9);
    blit(pb, body, pal, 2, hop ? 1 : 2);
    if (!hop) for (const [x, y] of [[1, 5], [8, 5], [1, 3], [8, 3]] as [number, number][]) pb.set(x, y + ((x + phase) % 2), rgb('K2'));
    pb.set(3, hop ? 0 : 1, rgb('K3')); pb.set(6, hop ? 0 : 1, rgb('K3'));
    return spriteFromBuf(pb, 5, 7);
  };
  return { walk: [make(0), make(1)], hop: make(0, true) };
}

// ───────────── Steam Brute (elite): boiler golem ─────────────
const BRUTE_PAL: Record<string, string> = {
  a: 'B0', b: 'B1', c: 'B2', d: 'B3', e: 'B4', f: 'B5', k: 'K0', K: 'K1', o: 'O3', O: 'O4', r: 'O1', s: 'K5', S: 'K6', t: 'T3',
};
const BRUTE_BODY = [
  '.........sSSs..........',
  '.........sKKs..........',
  '......bbbcccccbbb......',
  '....bbcdddeeedddcbb....',
  '...bcdeefffffeeeddcb...',
  '..bcdefffffffffeeddcb..',
  '..bcdKKKKKKKKKKKKdccb..',
  '.bcdeKoOoKKKKKoOoKddcb.',
  '.bcdeKrorKKKKKrorKddcb.',
  '.bcdeKKKKKKKKKKKKKddcb.',
  '.bcdeeeeffffffeeeddccb.',
  '.bcddeeeeeeeeeeeddcccb.',
  '.bccddedddddddddddccbb.',
  '.bbcddddtdddddtddcccbb.',
  '..bccdddddddddddcccbb..',
  '..bbcccccccccccccccbb..',
  '...bbbccccccccccbbbb...',
  '....aabbbbbbbbbbbaa....',
];
export function buildBrute(): { idle: Sprite[]; walk: Sprite[]; slam: Sprite; windup: Sprite } {
  const make = (bob: number, legA: number, legB: number, armY: number, armX = 0) => {
    const pb = new PixelBuf(34, 34);
    // legs: thick pistons
    for (const [lx, lift] of [[11, legA], [19, legB]] as [number, number][]) {
      for (let y = 24 + bob; y < 31 - lift; y++) for (let k = 0; k < 4; k++) pb.set(lx + k, y, rgb(k === 0 ? 'K6' : k === 3 ? 'K3' : 'K4'));
      for (let k = -1; k < 5; k++) { pb.set(lx + k, 31 - lift, rgb('K2')); pb.set(lx + k, 32 - lift, rgb('K1')); }
    }
    blit(pb, BRUTE_BODY, BRUTE_PAL, 5, 6 + bob);
    // arms: piston + fist on each side
    for (const side of [-1, 1]) {
      const ax = side < 0 ? 3 - armX : 30 + armX, ay = 16 + bob + armY;
      for (let k = 0; k < 6; k++) pb.set(ax, ay - 3 + k, rgb('K5'));
      for (let j = 0; j < 5; j++) for (let i = -2; i <= 2; i++) pb.set(ax + i, ay + 3 + j, rgb(j === 0 ? 'B4' : j === 4 ? 'B1' : i < 0 ? 'B3' : 'B2'));
    }
    return spriteFromBuf(pb, 17, 32);
  };
  return {
    idle: [make(0, 0, 0, 0), make(1, 0, 0, 1)],
    walk: [make(0, 2, 0, 0), make(-1, 0, 0, -1), make(0, 0, 2, 0), make(-1, 0, 0, 1)],
    windup: make(-2, 0, 0, -12, 1),
    slam: make(2, 0, 0, 4, -1),
  };
}

// ───────────── wall machinery ─────────────
export const WALL_GEAR_BIG = () => gearFrames(11, 12, IRON_GEAR, 6, 3);
export const WALL_GEAR_SMALL = () => gearFrames(6, 8, BRASS_GEAR, 4, 2);
