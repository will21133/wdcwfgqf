// Floor 4 — The Clockface: enemy sprites. Hand-authored parts composed into frames at boot
// (same approach as gearworks.ts). Light from the top-left; blued steel (U) for the Great
// Clock's hands, brass (B) fittings, night-indigo (K) cloth. No cyan (echoes) / magenta (bullets).
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, spriteFromDef, RotCache } from '../../engine/gfx/sprite';
import { blit, rgb } from '../blit';

type RGB = [number, number, number];

// ───────────────────────────── 分针骑士 Minute Knight ─────────────────────────────
const KN_PAL: Record<string, string> = {
  k: 'K0', d: 'K1', u: 'U0', U: 'U1', S: 'U2', L: 'U3', H: 'U4', w: 'K8', W: 'K9', v: 'K6',
  b: 'B1', n: 'B2', B: 'B3', Y: 'B4', y: 'B5', c: 'K5', C: 'K3', D: 'K4', e: 'V4', V: 'V3',
};
// facing right. Great helm with a minute-hand crest, brass pauldrons, blued plate, navy tabard.
const KN_TOP = [
  '......yn......',
  '......Yn......',
  '.....nYBn.....',
  '....ULLSU.....',
  '...ULHLSSU....',
  '...ULLSSSU....',
  '...UdVeeeU....',
  '...ULSSSSU....',
  '....USSSU.....',
  '..yYnUSSUnBn..',
  '.YyBnLHSSnBBn.',
  '.nBBULLSSUnBn.',
  '..nULLYSSSUn..',
  '...ULLSSSSU...',
  '...nYYYYYYn...',
  '...WwwYwwvc...',
  '...WwwBwwvc...',
  '....nBBBBn....',
];
const KN_TOP_GUARD = KN_TOP.map((r, i) => (i === 6 ? '...UdeeeeU....' : r));

export interface KnightArt { idle: Sprite[]; walk: Sprite[]; windup: Sprite; swing: Sprite; guard: Sprite; stagger: Sprite }
export function buildMinuteKnight(): KnightArt {
  const make = (bob: number, legA: number, legB: number, lean = 0, cape = 0, rows = KN_TOP, crouch = 0) => {
    const pb = new PixelBuf(20, 30);
    const X0 = 3, Y0 = 1 + bob + crouch;
    // cape (behind): deep navy, sways
    const capeK = [rgb('K1'), rgb('K2'), rgb('U0')];
    for (let y = 10; y < 23; y++) {
      const sway = Math.round(((y - 10) / 12) * cape);
      const w = y < 13 ? 2 : 3;
      for (let i = 0; i < w; i++) pb.set(X0 + 1 - i - sway + (y < 12 ? 1 : 0), Y0 + y - 1, capeK[Math.min(2, i)]);
    }
    // legs: blued greaves with brass knee cops
    const top = Y0 + 18, base = 27;
    for (const [lx, lift, front] of [[X0 + 4, legA, false], [X0 + 7, legB, true]] as [number, number, boolean][]) {
      for (let y = top; y < base - lift; y++) {
        pb.set(lx, y, rgb(front ? 'U3' : 'U1'));
        pb.set(lx + 1, y, rgb(front ? 'U2' : 'U0'));
      }
      pb.set(lx, top + 2 - Math.min(lift, 1), rgb(front ? 'B4' : 'B2'));
      pb.set(lx + 1, top + 2 - Math.min(lift, 1), rgb(front ? 'B3' : 'B1'));
      for (let i = 0; i < 3; i++) pb.set(lx + i, base - lift, rgb(front ? (i === 2 ? 'K2' : 'K4') : 'K2'));
    }
    blit(pb, rows, KN_PAL, X0 + lean, Y0);
    return spriteFromBuf(pb, 10, 27);
  };
  return {
    idle: [make(0, 0, 0, 0, 0), make(1, 0, 0, 0, 1)],
    walk: [make(0, 1, 0, 0, 1), make(-1, 0, 0, 0, 2), make(0, 0, 1, 0, 1), make(-1, 0, 0, 0, 2)],
    windup: make(0, 0, 0, -1, -1, KN_TOP, 1),
    swing: make(0, 0, 1, 1, 2),
    guard: make(1, 0, 0, 0, 0, KN_TOP_GUARD, 1),
    stagger: make(1, 1, 0, -1, -2),
  };
}

/** the minute hand of the Great Clock, used as a sword (points right, pivot at the grip ring) */
export const MINUTE_BLADE = spriteFromDef({
  rows: [
    '.nn....................LL...',
    'nYyn..................LHHL..',
    'nY.bSSSSSSSSSSSSSSSSSSLHwwHL',
    'nbbn.UUUUUUUUUUUUUUUUUSLLS..',
    '.nn....................SS...',
  ],
  pal: { n: 'B2', Y: 'B4', y: 'B5', b: 'B1', U: 'U1', S: 'U3', L: 'U3', H: 'U4', w: 'K10' },
  ox: 2, oy: 2,
});
let minuteRot: RotCache | null = null;
export const minuteBladeRot = () => (minuteRot ??= new RotCache(MINUTE_BLADE, 32));

// ───────────────────────────── 时针枪兵 Hour Lancer ─────────────────────────────
const LN_PAL: Record<string, string> = {
  k: 'K0', d: 'K1', u: 'U0', U: 'U1', S: 'U2', L: 'U3', w: 'K9', W: 'K10',
  a: 'B0', b: 'B1', n: 'B2', B: 'B3', Y: 'B4', y: 'B5', z: 'B6', c: 'K2', C: 'K3', D: 'K4', v: 'V4',
};
// facing right. A bell-shaped brass helm, great round pauldrons, a dial set in the breastplate.
const LN_TOP = [
  '.......nYn........',
  '......nYzYn.......',
  '.....nYzyYBn......',
  '....nYyyYYBBn.....',
  '....BYyYYBBBn.....',
  '...nBYYYBBBBBn....',
  '...ndddddvvvdn....',
  '..anBBBBBBBBBnna..',
  '.nYYnbUSSSUbnBBn..',
  'nYzyYnSLLSUnBYyBn.',
  'nYyYBnwWkWwnBBYBn.',
  'nBBBnwWWkWWwnBBBn.',
  '.nBnUwDWkWDwUnBn..',
  '..nUSwWWWWWwSUn...',
  '..nUSSwwDwwSSUn...',
  '..bnYYYYYYYYYnb...',
  '...cCCDCCCDCCc....',
  '...cCCDCCCDCCc....',
  '....cnBBBBBnc.....',
];
export interface LancerArt { idle: Sprite[]; walk: Sprite[]; plant: Sprite; charge: Sprite; stun: Sprite }
export function buildHourLancer(): LancerArt {
  const make = (bob: number, legA: number, legB: number, lean = 0, crouch = 0, spread = 0) => {
    const pb = new PixelBuf(26, 32);
    const X0 = 4, Y0 = 1 + bob + crouch;
    const top = Y0 + 19, base = 29;
    for (const [lx0, lift, front] of [[X0 + 4 - spread, legA, false], [X0 + 9 + spread, legB, true]] as [number, number, boolean][]) {
      const lx = lx0;
      for (let y = top; y < base - lift; y++) {
        pb.set(lx, y, rgb(front ? 'U3' : 'U1'));
        pb.set(lx + 1, y, rgb(front ? 'U2' : 'U1'));
        pb.set(lx + 2, y, rgb(front ? 'U1' : 'U0'));
      }
      // brass knee and heavy boot
      for (let i = 0; i < 3; i++) pb.set(lx + i, top + 3 - Math.min(lift, 1), rgb(front ? (i === 0 ? 'B5' : 'B3') : 'B2'));
      for (let i = -1; i < 4; i++) { pb.set(lx + i, base - lift, rgb(front ? 'K4' : 'K2')); pb.set(lx + i, base - lift - 1, rgb(front ? (i < 1 ? 'B3' : 'B2') : 'B1')); }
    }
    blit(pb, LN_TOP, LN_PAL, X0 + lean, Y0);
    return spriteFromBuf(pb, 13, 29);
  };
  return {
    idle: [make(0, 0, 0), make(1, 0, 0)],
    walk: [make(0, 2, 0), make(-1, 0, 0), make(0, 0, 2), make(-1, 0, 0)],
    plant: make(0, 0, 0, -1, 2, 1),
    charge: make(0, 0, 1, 2, 1, 1),
    stun: make(1, 0, 0, -1, 1),
  };
}

/** the hour hand of the Great Clock as a lance: broad shaft, Breguet "pomme" ring, short tip */
export const HOUR_LANCE = spriteFromDef({
  rows: [
    '...................uuu.....',
    '..nn..............uSLLu....',
    '.nYyn............uL...Lu...',
    'nYzyYnuSSSSSSSSSSuL...LSSu.',
    'nYyyYnuLLLLLLLLLLLL...LLLHW',
    'nbYYbnuUUUUUUUUUUuS...SUUu.',
    '.nbbn............uS...Su...',
    '..nn..............uSUUu....',
    '...................uuu.....',
  ],
  pal: { n: 'B2', Y: 'B4', y: 'B5', z: 'B6', b: 'B1', u: 'U0', U: 'U1', S: 'U2', L: 'U3', H: 'U4', W: 'K10' },
  ox: 3, oy: 4,
});
let lanceRot: RotCache | null = null;
export const hourLanceRot = () => (lanceRot ??= new RotCache(HOUR_LANCE, 32));

// ───────────────────────────── 星屑 Star Shard ─────────────────────────────
/** spinning 4-point star crystals: 6 spin frames, plus a brighter "charging" set */
export function buildStarShard(): { spin: Sprite[]; hot: Sprite[] } {
  const mk = (sx: number, hot: boolean) => {
    const pb = new PixelBuf(13, 13);
    const c = 6;
    const K = hot
      ? { lit: 'W', ridge: 'K10', mid: 'U4', dark: 'U3', deep: 'V3', core: 'W' }
      : { lit: 'K10', ridge: 'U4', mid: 'U3', dark: 'U2', deep: 'U1', core: 'V4' };
    const asx = Math.abs(sx);
    for (let y = 0; y < 13; y++)
      for (let x = 0; x < 13; x++) {
        const dx = (x - c) / Math.max(0.15, asx), dy = y - c;
        const ax = Math.abs(dx), ay = Math.abs(dy);
        // star mask: thin long arms (taper) in a + shape
        const inArmV = ay <= 6 && ax <= (ay <= 1 ? 1.6 : ay <= 3 ? 1.1 : 0.55);
        const inArmH = ax <= 6 && ay <= (ax <= 1 ? 1.6 : ax <= 3 ? 1.1 : 0.5);
        if (!inArmV && !inArmH) continue;
        if (asx < 0.2 && x !== c) continue;
        let k: string;
        const flipShade = sx < 0;
        const left = flipShade ? dx > 0 : dx < 0;
        if (x === c && y === c) k = K.core;
        else if (inArmV && ay >= ax) k = Math.round(dx) === 0 ? K.ridge : left ? K.lit : K.dark;
        else k = Math.round(dy) === 0 ? K.ridge : dy < 0 ? (left ? K.lit : K.mid) : (left ? K.mid : K.deep);
        pb.set(x, y, rgb(k));
      }
    return spriteFromBuf(pb, 6, 6);
  };
  const steps = [1, 0.7, 0.25, -0.25, -0.7, -1];
  return { spin: steps.map((s) => mk(s, false)), hot: steps.map((s) => mk(s, true)) };
}

// ───────────────────────────── 钟摆刽子手 Pendulum Executioner (elite) ─────────────────────────────
// A longcase clock come to judgement: a pointed lacquer hood framing a white dial face, a tall
// case robe with a brass-framed (empty) pendulum window, ball-and-claw feet, long brass arms.
export interface ExecArt { idle: Sprite[]; walk: Sprite[]; windup: Sprite; swing: Sprite; lift: Sprite; slam: Sprite; hands: Record<'down' | 'back' | 'out' | 'up' | 'slam', { x: number; y: number }> }
export function buildExecutioner(): ExecArt {
  const W = 44, H = 54, PX = 22, PY = 50;
  const make = (bob: number, footA: number, footB: number, lean = 0, arm: 'down' | 'up' | 'out' | 'back' = 'down', hemPh = 0) => {
    const pb = new PixelBuf(W, H);
    const set = (x: number, y: number, k: string) => pb.set(Math.round(x), Math.round(y), rgb(k));
    const Y0 = 4 + bob;
    const cx = PX + lean * 0.5;
    // claw feet peeking out under the hem
    for (const [fx, lift] of [[PX - 6, footA], [PX + 4, footB]] as [number, number][]) {
      const fy = PY - lift;
      for (let i = 0; i < 5; i++) set(fx + i, fy, i === 0 || i === 4 ? 'B1' : 'B2');
      for (let i = 0; i < 5; i++) set(fx + i, fy - 1, i === 0 ? 'B5' : i === 4 ? 'B2' : 'B3');
      set(fx + 1, fy - 2, 'B4'); set(fx + 2, fy - 2, 'B3'); set(fx + 3, fy - 2, 'B2');
    }
    // back arm (behind the robe)
    const shL = { x: PX - 11 + lean, y: Y0 + 19 };
    const handB = { x: shL.x - 3, y: shL.y + 13 };
    pb.line(shL.x, shL.y, handB.x, handB.y, rgb('B1'));
    pb.line(shL.x + 1, shL.y, handB.x + 1, handB.y, rgb('B2'));
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) set(handB.x + i, handB.y + 1 + j, j ? 'B1' : 'B3');
    // robe / clock case: flares toward the hem, lit from the left
    const rTop = Y0 + 20, rBot = Y0 + 41;
    for (let y = rTop; y <= rBot + 3; y++) {
      const t = (y - rTop) / (rBot - rTop);
      const hw = Math.round(8 + t * 4.5);
      const sh = Math.round(lean * (1 - t) * 0.6);
      for (let x = -hw; x <= hw; x++) {
        const u = (x + hw) / (hw * 2);
        let k = u < 0.12 ? 'K5' : u < 0.36 ? 'K4' : u < 0.7 ? 'K3' : u < 0.9 ? 'K2' : 'K1';
        // cloth folds
        if ((x === -4 || x === 5) && y > rTop + 13) k = u < 0.5 ? 'K3' : 'K1';
        if (y > rBot) {
          // tattered hem: teeth that sway with hemPh
          const tooth = ((x + hw + hemPh + 40) % 4);
          if (y - rBot > (tooth < 2 ? 3 : 1)) continue;
          k = y === rBot + 1 ? 'B1' : u < 0.4 ? 'K3' : 'K2';
        }
        if (y === rBot - 1) k = u < 0.2 ? 'B5' : u < 0.7 ? 'B4' : 'B2';
        if (y === rBot) k = u < 0.5 ? 'B3' : 'B1';
        set(cx + sh + x, y, k);
      }
    }
    // the case window, brass framed: the pendulum chamber stands empty
    const wx0 = Math.round(cx) - 5, wy0 = Y0 + 24;
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 11; x++) {
        const edge = x === 0 || y === 0 || x === 10 || y === 11;
        let k: string;
        if (edge) k = x === 0 || y === 0 ? (x + y < 4 ? 'B5' : 'B4') : 'B2';
        else {
          k = 'U0';
          if (x - y === 1 || x - y === 2) k = y < 6 ? 'U2' : 'U1';
          if (x === 5 && y < 5) k = y === 4 ? 'B4' : 'B2';
        }
        set(wx0 + x, wy0 + y, k);
      }
    set(wx0 + 5, wy0 + 14, 'B5'); set(wx0 + 5, wy0 + 15, 'B2'); // keyhole escutcheon
    // brass mantle across the shoulders, sloping down at the ends
    for (let x = -14; x <= 14; x++) {
      const drop = Math.round(Math.pow(Math.abs(x) / 14, 2) * 4);
      for (let y = 0; y < 4; y++) {
        if ((y === 0 || y === 3) && Math.abs(x) === 14) continue;
        const k = y === 0 ? (x < 0 ? 'B5' : 'B4') : y === 1 ? (x < -6 ? 'B4' : 'B3') : y === 2 ? 'B2' : 'B1';
        set(cx + x, Y0 + 17 + y + drop, k);
      }
    }
    for (const rx of [-9, -3, 3, 9]) set(cx + rx, Y0 + 18 + Math.round(Math.pow(Math.abs(rx) / 14, 2) * 4), 'B6');
    // the face: a clock dial deep in the hood, two violet slits for eyes
    const fx = Math.round(cx) + 1, fy = Y0 + 12;
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        const d = Math.hypot(x, y * 1.1);
        if (d > 5.2) continue;
        let k = d > 4.3 ? 'K0' : d > 3.4 ? (x + y < 0 ? 'B3' : 'B1') : x + y < -2 ? 'K9' : 'K8';
        if (d <= 3.4 && d > 2.5 && (x === 0 || y === 0)) k = 'K5';
        set(fx + x, fy + y, k);
      }
    set(fx - 2, fy, 'V4'); set(fx - 1, fy, 'V3'); set(fx + 2, fy, 'V4'); set(fx + 3, fy, 'V3');
    set(fx, fy + 1, 'K1'); set(fx, fy + 2, 'K2');
    // tall pointed hood (lit from the left), tip drooping forward, brim shading the dial
    const hTop = Y0 + 1, hBot = Y0 + 19;
    for (let y = hTop; y < hBot; y++) {
      const t = (y - hTop) / (hBot - hTop);
      const hw = 0.6 + t * 9.6;
      const droop = Math.round((1 - t) * (1 - t) * 3);
      for (let x = Math.floor(-hw); x <= Math.ceil(hw); x++) {
        if (Math.abs(x) > hw + 0.3) continue;
        // the opening in the hood around the face
        const ox = x + droop - (fx - Math.round(cx)), oy = y - fy;
        if (Math.hypot(ox, oy * 1.05) < 4.6 && oy > -3) continue;
        const u = (x + hw) / (hw * 2);
        let k = u < 0.16 ? 'K5' : u < 0.4 ? 'K4' : u < 0.7 ? 'K3' : 'K2';
        if (Math.hypot(ox, oy * 1.05) < 5.8 && oy > -4) k = oy < -1 ? 'K1' : 'K2'; // shadowed rim
        set(cx + x + droop, y, k);
      }
    }
    // finial
    set(cx + 3, hTop - 1, 'B5'); set(cx + 3, hTop - 2, 'B6'); set(cx + 4, hTop - 1, 'B2');
    // front arm: pose depends on the attack
    const fs = { x: Math.round(cx) + 12, y: Y0 + 19 };
    const hand = arm === 'up' ? { x: fs.x + 2, y: fs.y - 16 } : arm === 'out' ? { x: fs.x + 10, y: fs.y + 3 } : arm === 'back' ? { x: fs.x - 4, y: fs.y + 9 } : { x: fs.x + 3, y: fs.y + 12 };
    pb.line(fs.x, fs.y, hand.x, hand.y, rgb('B2'));
    pb.line(fs.x + 1, fs.y, hand.x + 1, hand.y, rgb('B4'));
    const ex = Math.round((fs.x + hand.x) / 2), ey = Math.round((fs.y + hand.y) / 2);
    set(ex, ey, 'B5'); set(ex + 1, ey, 'B3'); set(ex, ey + 1, 'B3'); set(ex + 1, ey + 1, 'B1');
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) set(hand.x - 1 + i, hand.y - 1 + j, i === 0 && j === 0 ? 'B5' : i + j > 2 ? 'B1' : 'B3');
    return { s: spriteFromBuf(pb, PX, PY), hand: { x: hand.x - PX, y: hand.y - PY } };
  };
  const idle = [make(0, 0, 0, 0, 'down', 0), make(1, 0, 0, 0, 'down', 1)];
  const walk = [make(0, 2, 0, 0, 'down', 0), make(-1, 0, 0, 0, 'down', 1), make(0, 0, 2, 0, 'down', 2), make(-1, 0, 0, 0, 'down', 3)];
  const wind = make(1, 0, 0, -2, 'back', 1), swing = make(0, 0, 1, 2, 'out', 2), lift = make(-1, 0, 0, -1, 'up', 0), slam = make(2, 0, 0, 2, 'down', 3);
  return {
    idle: idle.map((f) => f.s), walk: walk.map((f) => f.s),
    windup: wind.s, swing: swing.s, lift: lift.s, slam: slam.s,
    hands: { down: idle[0].hand, back: wind.hand, out: swing.hand, up: lift.hand, slam: slam.hand },
  };
}

/** pendulum bob with a crescent blade on its far side (points along +x, pivot at the rod end) */
export function buildPendulumBlade(): Sprite {
  const pb = new PixelBuf(24, 22);
  const cx = 12, cy = 11;
  for (let y = 0; y < 22; y++)
    for (let x = 0; x < 24; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const lit = (dx * -0.6 + dy * -0.8) / Math.max(1, d);
      let k = '';
      if (d < 6.2) k = d > 5.2 ? 'B1' : lit > 0.45 ? 'B6' : lit > 0.1 ? 'B5' : lit > -0.35 ? 'B4' : 'B3';
      if (d < 2.2) k = 'B2';
      if (d < 1.2) k = 'K1';
      // crescent blade on the far (+x) side
      if (!k && Math.abs(a) < 1.35 && d >= 6.2 && d < 10.8 - Math.abs(a) * 2.2) {
        const edge = d > 9.6 - Math.abs(a) * 2.2;
        k = edge ? (a < 0 ? 'K10' : 'U4') : a < -0.2 ? 'U3' : a < 0.5 ? 'U2' : 'U1';
      }
      // rod stub toward the chain (-x)
      if (!k && dx < -5 && dx > -12 && Math.abs(dy) < 1) k = dy < 0 ? 'B4' : 'B2';
      if (k) pb.set(x, y, rgb(k));
    }
  return spriteFromBuf(pb, 1, 11);
}
let pendRot: RotCache | null = null;
export const pendulumRot = () => (pendRot ??= new RotCache(buildPendulumBlade(), 32));

// ───────────────────────────── steel smear (moon-steel blades) ─────────────────────────────
const SMEAR_PAL: Record<string, string[]> = {
  steel: ['W', 'K10', 'U4', 'U3'],
  violet: ['W', 'V4', 'V3', 'V2'],
  dark: ['V4', 'V2', 'V1', 'K1'],
};
const smearCache = new Map<string, Sprite>();
/** crescent swing smear like weapons.arcSmear but in the floor-4 palettes */
export function cfArcSmear(R: number, thick: number, sweep: number, dir: number, frame: number, pal: 'steel' | 'violet' | 'dark', cw = true): Sprite {
  const N = 32;
  const ai = ((Math.round((dir / (Math.PI * 2)) * N) % N) + N) % N;
  const key = `${R}|${thick}|${sweep.toFixed(2)}|${ai}|${frame}|${pal}|${cw}`;
  let s = smearCache.get(key);
  if (s) return s;
  const ang = (ai / N) * Math.PI * 2;
  const size = R * 2 + 4, c = size / 2;
  const pb = new PixelBuf(size, size);
  const cols: RGB[] = SMEAR_PAL[pal].map((k) => rgb(k) as RGB);
  const half = sweep / 2;
  const fadeTail = frame * 0.28;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d > R || d < R - thick - 1) continue;
      let a = Math.atan2(dy, dx) - ang;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > half) continue;
      let u = (a + half) / (half * 2);
      if (!cw) u = 1 - u;
      if (u < fadeTail) continue;
      const th = Math.max(1, thick * Math.pow((u - fadeTail) / (1 - fadeTail), 0.7) * (1 - frame * 0.18));
      const depth = R - d;
      if (depth > th) continue;
      const band = depth / th;
      let ci = band < 0.22 ? 0 : band < 0.5 ? 1 : band < 0.8 ? 2 : 3;
      ci = Math.min(3, ci + (frame >= 2 ? 1 : 0));
      if (frame === 3 && ((x + y) & 1)) continue;
      pb.set(x, y, cols[ci]);
    }
  s = new Sprite(pb.toCanvas(), c, c);
  smearCache.set(key, s);
  return s;
}

/** dizzy stars circling a stunned head */
export const DIZZY_STAR = spriteFromDef({ rows: ['.y.', 'yWy', '.y.'], pal: { y: 'B5', W: 'B6' }, ox: 1, oy: 1 });
