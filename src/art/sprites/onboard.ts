// Onboarding props (ONBOARD2 §2, §5.6; F4a): the rehearsal's training dummy, the bell jar with its
// brass key, the alarm turret, the pendulum blade, the falling gear, the fence posts, Ines's little
// speaker head and the prologue clock face. Same rules as every other sprite (ART_BIBLE §3): palette
// keys only, K0 outline baked in, light from the top-left. Cyan stays reserved for echoes / rewind:
// glass here is neutral K8–K10, the dummy is wood and brass, danger is rust red, bullets magenta.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, spriteFromDef } from '../../engine/gfx/sprite';
import { rgb } from '../blit';
import { paintGear, BRASS_GEAR, IRON_GEAR } from '../gear';

// ───────────────────────── training dummy (PracticeDummy) ─────────────────────────
// A wooden practice automaton on a post: a target-painted head, a banded barrel body, padded arms.
const DUMMY_PAL: Record<string, string> = {
  w: 'B1', W: 'B2', H: 'B3', r: 'R2', R: 'R3', t: 'K10', T: 'K9',
  b: 'B3', B: 'B5', d: 'B0', D: 'B1', e: 'B2', a: 'S2', A: 'S3', p: 'K3', P: 'K4', q: 'K5', g: 'B4',
};
const DUMMY_HEAD = [
  '.....wwwwww.....',
  '....wWHHHHWw....',
  '...wWHtttTHWw...',
  '...wHtRRRRtHw...',
  '...wHtRttRtHw...',
  '...wHtRRRRtHw...',
  '...wWHtttTHWw...',
  '....wWHHHHWw....',
  '.....wwwwww.....',
  '......bBBb......',
];
const DUMMY_BODY = [
  '.....dDeeDd.....',
  '....dDeHHeDd....',
  '....bBBBBBBb....',
  '....dDeHHeDd....',
  '....dDeHHeDd....',
  '....dDeeeeDd....',
  '....bBBBBBBb....',
  '....dDeeeeDd....',
  '.....dDeeDd.....',
  '.......gg.......',
  '.......PP.......',
  '.......pP.......',
  '.....pPPPPp.....',
  '....pqqPPqqp....',
];
/** arms per pose, painted over the body rows (row offset from the body's first row) */
function dummyFrame(pose: 'idle' | 'wind' | 'punch' | 'hit'): Sprite {
  const W = 22, H = 26;
  const pb = new PixelBuf(W, H);
  const put = (rows: string[], x: number, y: number) => rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = row[i]; if (c !== '.') pb.set(x + i, y + j, rgb(DUMMY_PAL[c])); } });
  const hx = pose === 'hit' ? 2 : 3;
  put(DUMMY_HEAD, hx, 0);
  put(DUMMY_BODY, 3, 10);
  // left arm (always a short padded stub)
  put(['aA', 'aA', 'Aa'], 4, 12);
  if (pose === 'idle' || pose === 'hit') put(['Aa', 'aA', 'aA'], 16, 12);
  else if (pose === 'wind') put(['..aA', '.aA.', 'aA..', 'A...'], 16, 8);
  else put(['AAAaa', 'aaaAA', 'ggggg'], 16, 13);
  return spriteFromBuf(pb, 11, 25);
}
let DUMMY: Record<'idle' | 'wind' | 'punch' | 'hit', Sprite> | null = null;
export function dummySprites() {
  return (DUMMY ??= { idle: dummyFrame('idle'), wind: dummyFrame('wind'), punch: dummyFrame('punch'), hit: dummyFrame('hit') });
}

// ───────────────────────── bell jar (GlassJar) ─────────────────────────
// The brass base and the key are a sprite; the glass dome is drawn by the prop itself (a thin
// neutral rim, a faint fill and a moving highlight read as glass without any cyan).
export function jarBase(): Sprite {
  return spriteFromDef({
    rows: [
      '.bBBBBBBBBBBBBb.',
      'bBBBBBBBBBBBBBBb',
      'dbbbbbbbbbbbbbbd',
      '.dddddddddddddd.',
    ],
    pal: { b: 'B3', B: 'B4', d: 'B1' },
    ox: 8, oy: 3,
  });
}
export function brassKey(): Sprite {
  return spriteFromDef({
    rows: [
      '.bbb.....',
      'bB.Bbbbbb',
      'bB.BbB.b.',
      '.bbb.....',
    ],
    pal: { b: 'B4', B: 'B6' },
    ox: 4, oy: 2,
  });
}

// ───────────────────────── alarm turret (AlarmTurret) ─────────────────────────
// A squat brass pedestal with a bell on top and a short barrel; its lens lights magenta to fire.
function turretFrame(lit: boolean): Sprite {
  return spriteFromDef({
    rows: [
      '......bbbb......',
      '.....bBBBBb.....',
      '....bBGGBBBb....',
      '....bBBBBBBb....',
      '.....dbbbbd.....',
      '...kkkkkkkkkk...',
      '..kKKKKKKKKKKk..',
      '..kKllLLKKKKKkmm',
      '..kKllLLKKKKKkMm',
      '..kKKKKKKKKKKk..',
      '...kkkkkkkkkk...',
      '....dbbbbbbd....',
      '...dbBBBBBBbd...',
      '..dbbbbbbbbbbd..',
      '..dddddddddddd..',
    ],
    pal: { b: 'B3', B: 'B5', G: 'B6', d: 'B1', k: 'K3', K: 'K5', l: lit ? 'M2' : 'K4', L: lit ? 'M3' : 'K6', m: 'K4', M: lit ? 'M3' : 'K6' },
    ox: 8, oy: 14,
  });
}
let TURRET: [Sprite, Sprite] | null = null;
export function turretSprites(): [Sprite, Sprite] { return (TURRET ??= [turretFrame(false), turretFrame(true)]); }

// ───────────────────────── pendulum blade (PendulumBlade) ─────────────────────────
export function pendulumPivot(): Sprite {
  return spriteFromDef({
    rows: ['..bbbb..', '.bBBBBb.', 'bBGkkBBb', 'bBkKKkBb', '.bBBBBb.', '..bbbb..'],
    pal: { b: 'B2', B: 'B4', G: 'B6', k: 'K2', K: 'K4' },
    ox: 4, oy: 3,
  });
}
export function pendulumBlade(): Sprite {
  // a steel crescent, edge up and down (it sweeps along the column)
  return spriteFromDef({
    rows: [
      '....ss....',
      '...sSSs...',
      '..sSWWSs..',
      '.sSW..WSs.',
      'sSW....WSs',
      'sS..bb..Ss',
      'sS..bb..Ss',
      'sSW....WSs',
      '.sSW..WSs.',
      '..sSWWSs..',
      '...sSSs...',
      '....ss....',
    ],
    pal: { s: 'K6', S: 'K8', W: 'K10', b: 'B4' },
    ox: 5, oy: 6,
  });
}

// ───────────────────────── falling gear (FallingGear) ─────────────────────────
let GEAR: Sprite[] | null = null;
/** a heavy iron-and-brass gear, 4 rotation frames (it tumbles as it falls) */
export function fallingGearFrames(): Sprite[] {
  if (GEAR) return GEAR;
  GEAR = [];
  for (let f = 0; f < 4; f++) {
    const pb = new PixelBuf(19, 19);
    paintGear(pb, 9, 9, 8, 9, (f / 4) * (Math.PI * 2 / 9), f % 2 ? IRON_GEAR : BRASS_GEAR, 2);
    GEAR.push(spriteFromBuf(pb, 9, 9));
  }
  return GEAR;
}
/** a half gear (the two pieces it breaks into) */
let HALVES: [Sprite, Sprite] | null = null;
export function gearHalves(): [Sprite, Sprite] {
  if (HALVES) return HALVES;
  const mk = (left: boolean) => {
    const pb = new PixelBuf(19, 19);
    paintGear(pb, 9, 9, 8, 9, 0, BRASS_GEAR, 2);
    // a jagged break line down the middle
    for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) if (left ? x > 9 - (y % 3 === 1 ? 1 : 0) : x <= 9 - (y % 3 === 1 ? 1 : 0)) pb.clear(x, y);
    return spriteFromBuf(pb, 9, 9);
  };
  return (HALVES = [mk(true), mk(false)]);
}

// ───────────────────────── fence post (L2) ─────────────────────────
export function fencePost(): Sprite {
  return spriteFromDef({
    rows: ['.bb.', 'bGBb', 'bBBb', '.kk.', '.kK.', '.kK.', '.kK.', '.kK.', '.kK.', '.kK.', 'dkKd', 'dddd'],
    pal: { b: 'B3', B: 'B4', G: 'B6', k: 'K4', K: 'K6', d: 'B1' },
    ox: 2, oy: 11,
  });
}

// ───────────────────────── Ines's speaker head (12×12, the caption rail) ─────────────────────────
let INES_HEAD: Sprite | null = null;
export function inesHead(): Sprite {
  return (INES_HEAD ??= spriteFromDef({
    rows: [
      '...hHHh...',
      '..hHWHHh..',
      '.hHHHHHhh.',
      '.hgGgGghh.',
      '.hdsSSdhh.',
      '.hseSesh..',
      '..sdSSd...',
      '..ssmms...',
      '.cCCddCCc.',
      'cCaCppCaCc',
    ],
    pal: { h: 'K8', H: 'K9', W: 'K10', g: 'B4', G: 'B5', s: 'S3', S: 'S4', d: 'S2', e: 'K1', m: 'R2', c: 'G1', C: 'G2', a: 'B1', p: 'B5' },
    ox: 5, oy: 5,
  }));
}

// ───────────────────────── prologue clock face (12×12) ─────────────────────────
let CLOCK: Sprite | null = null;
export function clockFace(): Sprite {
  return (CLOCK ??= spriteFromDef({
    rows: [
      '....bbbb....',
      '..bbKKKKbb..',
      '.bKKKwKKKKb.',
      '.bKKKwKKKKb.',
      'bKKKKwKKKKKb',
      'bKwKKcKKKwKb',
      'bKKKKKrKKKKb',
      'bKKKKKKrKKKb',
      '.bKKKKKKrKb.',
      '.bKKKwKKKKb.',
      '..bbKKKKbb..',
      '....bbbb....',
    ],
    pal: { b: 'B4', K: 'K9', w: 'K3', c: 'K1', r: 'R3' },
    ox: 6, oy: 6,
  }));
}
