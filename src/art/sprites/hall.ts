// The Rehearsal Hall (ONBOARD2 §8; F4b): the curtained arch in the workshop's west wall, the lesson
// board, the rehearsal curtain the loops play on, Ines's prompter, the dummy-yard lever, the duet
// bells, the practice dummies and the bell jar the guide's loops use. Same rules as every sprite
// (ART_BIBLE §3): palette keys only, a K0 outline baked in, light from the top-left. Cyan stays
// the echoes' and the rewind's: glass here is neutral K8–K10, wood and brass, rust-red cloth.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, spriteFromDef } from '../../engine/gfx/sprite';
import { rgb } from '../blit';
import { gearFrames, BRASS_GEAR } from '../gear';

const put = (pb: PixelBuf, rows: string[], pal: Record<string, string>, x: number, y: number) => rows.forEach((row, j) => {
  for (let i = 0; i < row.length; i++) { const c = row[i]; if (c !== '.' && c !== ' ') pb.set(x + i, y + j, rgb(pal[c])); }
});

// ───────────────────────── the arch (24×36): deep red curtains, a brass lintel with a clock ─────────────────────────
let ARCH: Sprite | null = null;
export function hallArch(): Sprite {
  if (ARCH) return ARCH;
  ARCH = spriteFromDef({
    rows: [
      '.........bbbbbb.........',
      '.......bBYYYYYYBb.......',
      '......bBYkKKKKkYBb......',
      'nnnnnnbBYKkWWkKYBbnnnnnn',
      'nBBBBBBBYKkWkkKYBBBBBBBn',
      'nYYYYYYYBBbKKbBBYYYYYYYn',
      'nbbbbbbbbbbbbbbbbbbbbbbn',
      '.mRRrRRmdddddddddmRRrRRm',
      '.mRrRRRmdddddddddmRRRrRm',
      '.mRrRRmddddddddddmmRRrRm',
      '.mRrRRmdddddddddddmRRrRm',
      '.mRrRmddddddddddddmRRrRm',
      '.mRrRmdddddddddddddmRrRm',
      '.mRrRmdddddddddddddmRrRm',
      '.mrRRmddddddddddddmRRrRm',
      '.mRRmdddddddddddddmRRrRm',
      '.mRrmddddddddddddddmRrRm',
      '.mRrmddddddddddddddmRrRm',
      '.mRrmddddddddddddddmRrRm',
      '.mRrRmdddddddddddddmRrRm',
      '.mRRrmddddddddddddmRRrRm',
      '.mRrRmddddddddddddmRRrRm',
      '.mYYYmddddddddddddmYYYYm',
      '.mRrRmddddddddddddmRrRRm',
      '.mRrRRmddddddddddmRRrRRm',
      '.mRRrRmddddddddddmRrRRRm',
      '.mRrRRRmdddddddddmRRrRRm',
      '.mRrRRRmddddddddmRRRrRRm',
      '.mRRrRRRmdddddddmRRrRRRm',
      '.mRrRRRRmddddddmRRRRrRRm',
      '.mRrRRRRRmdddddmRRRrRRRm',
      '.mRRrRRRRmdddddmRRRRrRRm',
      '.mRrRRRRRRmddddmRRRRRrRm',
      '.mRrRRRRRRmddddmRRRRRrRm',
      'nnnnnnnnnnnnnnnnnnnnnnnn',
      'nBBBBBBBBBBBBBBBBBBBBBBn',
    ],
    pal: { b: 'B2', B: 'B3', Y: 'B5', k: 'K3', K: 'K9', W: 'K10', n: 'B1', m: 'R0', R: 'R2', r: 'R3', d: 'K1' },
    ox: 12, oy: 36,
  });
  return ARCH;
}

// ───────────────────────── the lesson board (112×36): a framed paper sheet with ticked rows ─────────────────────────
let BOARD: Sprite | null = null;
export function lessonBoard(): Sprite {
  if (BOARD) return BOARD;
  const W = 112, H = 36;
  const pb = new PixelBuf(W, H);
  const fill = (x: number, y: number, w: number, h: number, k: string) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pb.set(x + i, y + j, rgb(k)); };
  fill(0, 0, W, H, 'B1');
  fill(1, 1, W - 2, 1, 'B3');
  fill(1, H - 2, W - 2, 1, 'B0');
  fill(3, 3, W - 6, H - 6, 'S3');
  fill(4, 4, W - 8, H - 8, 'S4');
  // the header rule and a brass name plate
  fill(6, 9, W - 12, 1, 'S2');
  fill(W / 2 - 18, 5, 36, 3, 'B3');
  fill(W / 2 - 17, 6, 34, 1, 'B5');
  // three columns of rows: a tick box and a scribbled name
  for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) {
    const x = 8 + c * 34, y = 12 + r * 5;
    fill(x, y, 4, 4, 'S1');
    fill(x + 1, y + 1, 2, 2, (c + r) % 3 === 0 ? 'G3' : 'S4');
    fill(x + 6, y + 1, 12 + ((c * 5 + r * 3) % 9), 1, 'K5');
    fill(x + 6, y + 3, 6 + ((c * 3 + r * 7) % 7), 1, 'K6');
  }
  // brass corner caps
  for (const [x, y] of [[0, 0], [W - 4, 0], [0, H - 4], [W - 4, H - 4]]) { fill(x, y, 4, 4, 'B3'); fill(x + 1, y + 1, 2, 2, 'B5'); }
  BOARD = spriteFromBuf(pb, W / 2, H);
  return BOARD;
}

// ───────────────────────── the curtain: linen with folds between two brass rollers ─────────────────────────
const curtains = new Map<string, Sprite>();
/** w × h linen (the LoopPlayer plays on its middle 184×72); brass rollers top and bottom */
export function rehearsalCurtain(w: number, h: number): Sprite {
  const key = w + 'x' + h;
  const c = curtains.get(key);
  if (c) return c;
  const pb = new PixelBuf(w, h);
  const set = (x: number, y: number, k: string) => pb.set(x, y, rgb(k));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // gentle vertical folds every 12 px, a lit left edge and a shaded right edge per fold
    const f = x % 12;
    const k = f === 0 ? 'S2' : f === 1 ? 'S4' : f >= 10 ? 'S2' : 'S3';
    set(x, y, k);
  }
  // the hem darkens toward the bottom
  for (let x = 0; x < w; x++) { set(x, h - 6, 'S2'); set(x, h - 5, 'S1'); }
  // rollers: a dark core and a brass highlight
  for (let x = -2; x < w + 2; x++) {
    const xx = Math.max(0, Math.min(w - 1, x));
    set(xx, 0, 'B1'); set(xx, 1, 'B4'); set(xx, 2, 'B3'); set(xx, 3, 'B2');
    set(xx, h - 4, 'B1'); set(xx, h - 3, 'B4'); set(xx, h - 2, 'B3'); set(xx, h - 1, 'B2');
  }
  // knobs at the roller ends
  for (const x of [0, w - 3]) for (const y of [0, h - 4]) for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) set(x + i, y + j, j === 1 ? 'B6' : 'B3');
  const s = spriteFromBuf(pb, Math.floor(w / 2), h);
  curtains.set(key, s);
  return s;
}

// ───────────────────────── Ines's prompter (a lectern with a slate) ─────────────────────────
let PROMPTER: Sprite | null = null;
export function prompterStand(): Sprite {
  return (PROMPTER ??= spriteFromDef({
    rows: [
      'nnnnnnnnnnnnnn',
      'nkkkkkkkkkkkkn',
      'nkKKKKkKKkkkkn',
      'nkkkkkkkkkkkkn',
      'nkKKkKKKKkkkkn',
      'nkkkkkkkkkkkkn',
      'nkKKKkKKkkkkkn',
      'nnnnnnnnnnnnnn',
      '....bbBBbb....',
      '.....bBBb.....',
      '.....bBBb.....',
      '.....bBBb.....',
      '.....bBBb.....',
      '...bbbBBbbb...',
      '..bBBBBBBBBb..',
    ],
    pal: { n: 'B2', k: 'K2', K: 'K8', b: 'B1', B: 'B3' },
    ox: 7, oy: 15,
  }));
}

// ───────────────────────── the dummy-yard lever (up = healing, down = no healing) ─────────────────────────
let LEVER: [Sprite, Sprite] | null = null;
export function leverSprites(): [Sprite, Sprite] {
  if (LEVER) return LEVER;
  const pal = { k: 'R3', K: 'R4', s: 'K5', S: 'K7', b: 'B2', B: 'B4' };
  const base = ['..bBBBBb..', '.bBBBBBBb.', 'bbbbbbbbbb'];
  const up = spriteFromDef({ rows: ['..kK......', '..Kk......', '...S......', '...sS.....', '....sS....', '.....sS...', ...base], pal, ox: 5, oy: 9 });
  const dn = spriteFromDef({ rows: ['..........', '..........', '..........', '......Kk..', '.....sKk..', '...SsS....', ...base], pal, ox: 5, oy: 9 });
  return (LEVER = [up, dn]);
}

// ───────────────────────── the duet bells (they ring only to two blows at once) ─────────────────────────
let BELLS: Sprite | null = null;
export function duetBells(): Sprite {
  return (BELLS ??= spriteFromDef({
    rows: [
      'bbbbbbbbbbbbbbbbb',
      '.b....b...b....b.',
      '.b...YBY.YBY...b.',
      '.b..YBBBYBBBY..b.',
      '.b..YBWBYBWBY..b.',
      '.b..YBBBYBBBY..b.',
      '.b.YBBBBBBBBBY.b.',
      '.b.yyyyyyyyyyy.b.',
      '.b....d...d....b.',
      '.b.............b.',
      '.b.............b.',
      'bbb...........bbb',
    ],
    pal: { b: 'B1', Y: 'B4', B: 'B3', W: 'B6', y: 'B2', d: 'K4' },
    ox: 8, oy: 12,
  }));
}

// ───────────────────────── the practice dummy (wood, brass bands, a target head) ─────────────────────────
const DUMMY_PAL: Record<string, string> = { w: 'B1', W: 'B2', H: 'B3', r: 'R2', R: 'R3', t: 'K10', T: 'K9', b: 'B3', B: 'B5', d: 'B0', D: 'B1', e: 'B2', a: 'S2', A: 'S3', p: 'K3', P: 'K4', q: 'K5', g: 'B4' };
const DUMMY_HEAD = ['.....wwwwww.....', '....wWHHHHWw....', '...wWHtttTHWw...', '...wHtRRRRtHw...', '...wHtRttRtHw...', '...wHtRRRRtHw...', '...wWHtttTHWw...', '....wWHHHHWw....', '.....wwwwww.....', '......bBBb......'];
const DUMMY_BODY = ['.....dDeeDd.....', '....dDeHHeDd....', '....bBBBBBBb....', '....dDeHHeDd....', '....dDeHHeDd....', '....dDeeeeDd....', '....bBBBBBBb....', '....dDeeeeDd....', '.....dDeeDd.....', '.......gg.......', '.......PP.......', '.......pP.......', '.....pPPPPp.....', '....pqqPPqqp....'];
export type DummyPose = 'idle' | 'wind' | 'punch' | 'hit';
const DUMMY = new Map<DummyPose, Sprite>();
export function dummySprite(pose: DummyPose): Sprite {
  const c = DUMMY.get(pose);
  if (c) return c;
  const pb = new PixelBuf(22, 26);
  put(pb, DUMMY_HEAD, DUMMY_PAL, pose === 'hit' ? 2 : 3, 0);
  put(pb, DUMMY_BODY, DUMMY_PAL, 3, 10);
  put(pb, ['aA', 'aA', 'Aa'], DUMMY_PAL, 4, 12);
  if (pose === 'idle' || pose === 'hit') put(pb, ['Aa', 'aA', 'aA'], DUMMY_PAL, 16, 12);
  else if (pose === 'wind') put(pb, ['..aA', '.aA.', 'aA..', 'A...'], DUMMY_PAL, 16, 8);
  else put(pb, ['AAAaa', 'aaaAA', 'ggggg'], DUMMY_PAL, 16, 13);
  const s = spriteFromBuf(pb, 11, 25);
  DUMMY.set(pose, s);
  return s;
}

// ───────────────────────── the bell jar (neutral glass on brass) and its shards ─────────────────────────
let JAR: Sprite | null = null;
export function bellJar(): Sprite {
  return (JAR ??= spriteFromDef({
    rows: [
      '.....KKKK.....',
      '....KWKKKK....',
      '...KW.....K...',
      '..KW.......K..',
      '..KW.......K..',
      '.KW.........K.',
      '.KW...yy....K.',
      '.KW..yYYy...K.',
      '.KW...yy....K.',
      '.KW...yy....K.',
      '.KW..yyyy...K.',
      '.K..........K.',
      'bBBBBBBBBBBBBb',
      'bBYYYYYYYYYYBb',
      '.bbbbbbbbbbbb.',
    ],
    pal: { K: 'K8', W: 'K10', y: 'B3', Y: 'B5', b: 'B1', B: 'B3' },
    ox: 7, oy: 15,
  }));
}
let SHARD: Sprite[] | null = null;
export function jarShards(): Sprite[] {
  return (SHARD ??= [
    spriteFromDef({ rows: ['K.', 'WK'], pal: { K: 'K8', W: 'K10' }, ox: 1, oy: 1 }),
    spriteFromDef({ rows: ['.K', 'KW', 'K.'], pal: { K: 'K8', W: 'K10' }, ox: 1, oy: 2 }),
    spriteFromDef({ rows: ['WK'], pal: { K: 'K8', W: 'K10' }, ox: 1, oy: 1 }),
  ]);
}
let JARBASE: Sprite | null = null;
export function jarBase(): Sprite {
  return (JARBASE ??= spriteFromDef({ rows: ['bBBBBBBBBBBBBb', 'bBYYYYYYYYYYBb', '.bbbbbbbbbbbb.'], pal: { b: 'B1', B: 'B3', Y: 'B5' }, ox: 7, oy: 3 }));
}

// ───────────────────────── a falling brass gear (the guide's scrub loop) ─────────────────────────
let GEAR: Sprite[] | null = null;
export function smallGear(): Sprite[] { return (GEAR ??= gearFrames(5, 8, BRASS_GEAR, 4)); }

// ───────────────────────── a coin (the jar's prize in the Fork loop) ─────────────────────────
let COIN: Sprite | null = null;
export function brassCoin(): Sprite { return (COIN ??= spriteFromDef({ rows: ['.YY.', 'YBBY', 'YBBY', '.YY.'], pal: { Y: 'B5', B: 'B3' }, ox: 2, oy: 4 })); }

// ───────────────────────── tick / star boxes for the lesson board (9×9, UI) ─────────────────────────
/** draws the ✓ (learned) or ★ (mastered) box: empty, done, or a hollow "skipped" ring */
export function drawTickBox(ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'check' | 'star', state: 'empty' | 'done' | 'soft', col: (k: string) => string) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = col('K0'); ctx.fillRect(x - 1, y - 1, 11, 11);
  ctx.fillStyle = col(state === 'done' ? (kind === 'star' ? 'B2' : 'G1') : 'K2'); ctx.fillRect(x, y, 9, 9);
  ctx.fillStyle = col(state === 'done' ? (kind === 'star' ? 'B5' : 'G3') : 'K4');
  ctx.fillRect(x, y, 9, 1); ctx.fillRect(x, y + 8, 9, 1); ctx.fillRect(x, y, 1, 9); ctx.fillRect(x + 8, y, 1, 9);
  if (state === 'empty') return;
  if (state === 'soft') { ctx.fillStyle = col('K7'); for (const [i, j] of [[3, 2], [4, 2], [5, 2], [2, 3], [6, 3], [2, 4], [6, 4], [2, 5], [6, 5], [3, 6], [4, 6], [5, 6]]) ctx.fillRect(x + i, y + j, 1, 1); return; }
  ctx.fillStyle = col(kind === 'star' ? 'B6' : 'G4');
  const px = kind === 'star'
    ? [[4, 1], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [3, 5], [4, 5], [5, 5], [2, 6], [3, 6], [5, 6], [6, 6], [2, 7], [6, 7]]
    : [[2, 4], [3, 5], [4, 6], [5, 5], [6, 4], [6, 3], [7, 2], [2, 5], [3, 6], [4, 7]];
  for (const [i, j] of px) ctx.fillRect(x + i, y + j, 1, 1);
}

/** a ✓ drawn in pixels (the fonts have no ✓): 7×6, top-left at (x, y) */
export function drawCheck(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = c;
  for (const [i, j] of [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1], [1, 3], [2, 4], [6, 0]]) ctx.fillRect(x + i, y + j, 1, 1);
}
/** ∞ drawn in pixels (the fonts have no ∞): 9×5 */
export function drawInfinity(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = c;
  for (const [i, j] of [[1, 0], [2, 0], [0, 1], [3, 1], [5, 1], [0, 2], [4, 2], [8, 2], [0, 3], [3, 3], [5, 3], [8, 3], [1, 4], [2, 4], [6, 0], [7, 0], [8, 1], [6, 4], [7, 4]]) ctx.fillRect(x + i, y + j, 1, 1);
}
