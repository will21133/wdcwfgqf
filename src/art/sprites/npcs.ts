// NPCs & room objects: Manman the snail merchant, frozen citizens, event objects, stations.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromDef, spriteFromBuf } from '../../engine/gfx/sprite';
import { blit, rgb } from '../blit';

// ── Manman: a snail whose shell is a pocket watch, wearing a tiny merchant cap ──
const MANMAN_PAL: Record<string, string> = {
  n: 'B1', b: 'B3', B: 'B4', Y: 'B6', w: 'K10', W: 'K9', k: 'K1', h: 'R2', H: 'R3',
  s: 'G2', S: 'G3', g: 'G1', e: 'K0', E: 'K10', m: 'K7',
};
const MANMAN_SHELL = [
  '......nnnnnn......',
  '....nnbBBBBbnn....',
  '...nbBYwwwwYBbn...',
  '..nbBwwwmwwwwBbn..',
  '..nBwwwwmwwwwwBn..',
  '.nbBwwwwmwwwwwBbn.',
  '.nbBwwwwkkkkwwBbn.',
  '.nbBwwwwwwwwwwBbn.',
  '.nbBwwwwwwwwwwBbn.',
  '..nBBwwwwwwwwBBn..',
  '..nbBBwwwwwwBBbn..',
  '...nbbBBBBBBbbn...',
  '....nnnnnnnnnn....',
];
export function buildManman(): Sprite[] {
  const frames: Sprite[] = [];
  for (let f = 0; f < 4; f++) {
    const pb = new PixelBuf(32, 26);
    const bob = f === 1 || f === 2 ? 1 : 0;
    // body (foot) — slug-like, green-grey
    for (let x = 4; x < 28; x++) {
      const top = 20 - (x > 22 ? Math.min(4, x - 22) : 0);
      for (let y = top; y < 24; y++) pb.set(x, y, rgb(y === 23 ? 'G0' : y === top ? 'S' === 'S' ? 'G3' : 'G2' : 'G2'));
    }
    // head and eye stalks (on the right)
    for (let y = 13; y < 21; y++) for (let x = 24; x < 29; x++) pb.set(x, y, rgb(x === 24 ? 'G2' : y === 13 ? 'G4' : 'G3'));
    const st = [[25, f % 2 ? 0 : 1], [28, f % 2 ? 1 : 0]];
    for (const [sx, o] of st) {
      for (let y = 7 + o; y < 13; y++) pb.set(sx, y, rgb('G3'));
      pb.set(sx - 1, 6 + o, rgb('K10')); pb.set(sx, 6 + o, rgb('K10')); pb.set(sx, 5 + o, rgb('K10')); pb.set(sx - 1, 5 + o, rgb('K10'));
      pb.set(sx, 6 + o, rgb('K0'));
    }
    // smile
    pb.set(26, 18, rgb('G0')); pb.set(27, 17, rgb('G0'));
    // cap
    for (let x = 24; x < 30; x++) pb.set(x, 12, rgb('R2'));
    for (let x = 25; x < 29; x++) { pb.set(x, 11, rgb('R3')); pb.set(x, 10, rgb('R3')); }
    pb.set(26, 10, rgb('B5'));
    // shell (pocket watch)
    blit(pb, MANMAN_SHELL, MANMAN_PAL, 3, 7 + bob);
    // watch hands rotate slowly
    const ang = (f / 4) * Math.PI * 2;
    pb.set(12 + Math.round(Math.cos(ang) * 2), 14 + bob + Math.round(Math.sin(ang) * 2), rgb('R3'));
    frames.push(spriteFromBuf(pb, 16, 24));
  }
  return frames;
}

// ── Frozen citizens: desaturated, crystalline stillness ──
const CIT_PAL: Record<string, string> = {
  a: 'K3', b: 'K4', c: 'K5', d: 'K6', e: 'K7', f: 'K8', g: 'K9', h: 'U1', i: 'U2', j: 'U3', v: 'V1', V: 'V2', w: 'K10', k: 'K1',
};
export const CITIZENS: Record<string, Sprite> = {
  baker: spriteFromDef({ rows: [
    '.....eeee.....',
    '....efffge....',
    '....efkfke....',
    '....effffe....',
    '.....eeee.....',
    '..wwwwwwwwww..',
    '.gwwfwwwfwwg..',
    '..gggggggggg..',
    '...dfgfgfd....',
    '..dddfffddd...',
    '..dffffffffd..',
    '..dfwwwwwwfd..',
    '..dfwwwwwwfd..',
    '..dfwwwwwwfd..',
    '..ddffffffdd..',
    '...dddddddd...',
    '...dd....dd...',
    '...cc....cc...',
  ], pal: CIT_PAL }),
  child: spriteFromDef({ rows: [
    '....eeee....',
    '...efffge...',
    '...efkfke...',
    '...effffe...',
    '....eeee....',
    '...iijjii...',
    '..ijjjjjji..',
    '..ijjjjjji..',
    '.f.ijjjji.f.',
    '...hiiiih...',
    '...hh..hh...',
    '...cc..cc...',
  ], pal: CIT_PAL }),
  gambler: spriteFromDef({ rows: [
    '....aaaaa.....',
    '...abbbbba....',
    '..aaaaaaaaa...',
    '....effffe....',
    '....efkfke....',
    '....effffe....',
    '.....eeee.....',
    '...hhhhhhhh...',
    '..hhiwwwwihh..',
    '..hiiiwwiiih..',
    '.fhiiiiiiiihf.',
    '.w.hiiiiiih.w.',
    '...hhhhhhhh...',
    '...hh....hh...',
    '...aa....aa...',
  ], pal: CIT_PAL }),
  elder: spriteFromDef({ rows: [
    '....ggggg.....',
    '...gfffffg....',
    '...efkfkfe....',
    '...effffffe...',
    '....efvvfe....',
    '....eeeeee....',
    '...VVVVVVVV...',
    '..VvvvvvvvvV..',
    '..VvvvvvvvvVf.',
    '..VvvvvvvvvV.d',
    '..VvvvvvvvvV.d',
    '..VVvvvvvvVV.d',
    '...VVVVVVVV..d',
    '...cc....cc..d',
  ], pal: CIT_PAL }),
};

export const EVENT_OBJECTS: Record<string, Sprite> = {
  mirror: spriteFromDef({ rows: [
    '...nnnnnnnn...',
    '..nBBBBBBBBn..',
    '.nBjjjjjjjjBn.',
    '.nBjiijjjjjBn.',
    '.nBjijjjjjjBn.',
    '.nBjjjjjjjjBn.',
    '.nBjjjjjjjjBn.',
    '.nBjjjjjjjjBn.',
    '.nBjjjjjjjiBn.',
    '.nBjjjjjjiiBn.',
    '.nBjjjjjjjjBn.',
    '.nBBBBBBBBBBn.',
    '..nnnnnnnnnn..',
    '....nn..nn....',
    '...nnn..nnn...',
  ], pal: { ...CIT_PAL, n: 'B1', B: 'B4' } }),
  bell: spriteFromDef({ rows: [
    '.....nn.....',
    '....nBBn....',
    '...nBYBbn...',
    '...nBBBbn...',
    '..nBBBBbbn..',
    '..nBBBBbbn..',
    '.nnnnnnnnnn.',
    '.....bb.....',
    '...dddddd...',
    '..dffffffd..',
    '..dfeeeefd..',
    '..dfeeeefd..',
    '..dddddddd..',
  ], pal: { ...CIT_PAL, n: 'B1', B: 'B4', Y: 'B6', b: 'B3' } }),
  letter: spriteFromDef({ rows: [
    '..............',
    '..wwwwwwwww...',
    '..wggggggwr...',
    '..wwwwwwwwrr..',
    '..wggggwwww...',
    '..wwwwwwwww...',
    'nnnnnnnnnnnnnn',
    'bmmmmmmmmmmmmb',
    'bmbbbbbbbbbbmb',
    '.b..........b.',
    '.b..........b.',
    '.b..........b.',
  ], pal: { ...CIT_PAL, n: 'B1', m: 'B2', b: 'B1', r: 'R3' } }),
  telescope: spriteFromDef({ rows: [
    '.........nnn',
    '.......nnBBn',
    '.....nnBBnn.',
    '...nnBBnn...',
    '..nBBnn.....',
    '..nnn.......',
    '....d.......',
    '...ddd......',
    '..d.d.d.....',
    '.d..d..d....',
  ], pal: { ...CIT_PAL, n: 'B1', B: 'B4' } }),
  hourglass: spriteFromDef({ rows: [
    '.nnnnnnnnn.',
    '.nYYYYYYYn.',
    '..nk...kn..',
    '...nk.kn...',
    '....nkn....',
    '....nCn....',
    '...nkCkn...',
    '..nkCCCkn..',
    '.nnnnnnnnn.',
    'CCC.....CC.',
  ], pal: { ...CIT_PAL, n: 'B2', Y: 'B5', C: 'C2' } }),
  watches: spriteFromDef({ rows: [
    'nnnnnnnnnnnnnnnn',
    'nmmmmmmmmmmmmmmn',
    'nm.ww..ww..ww.mn',
    'nmwfkwwfkwwfkwmn',
    'nm.ww..ww..ww.mn',
    'nmmmmmmmmmmmmmmn',
    'nm.ww..YY..ww.mn',
    'nmwfkwYwkYwfkwmn',
    'nm.ww..YY..ww.mn',
    'nmmmmmmmmmmmmmmn',
    'nnnnnnnnnnnnnnnn',
    '.b............b.',
    '.b............b.',
  ], pal: { ...CIT_PAL, n: 'B1', m: 'B2', b: 'B1', Y: 'B5', k: 'R3' } }),
};

export const WORKBENCH = spriteFromDef({ rows: [
  '.....G..........GG...',
  '....GiG....nn..GiiG..',
  '.....G....nBBn..GG...',
  'nnnnnnnnnnnnnnnnnnnnn',
  'bmmmmmmmmmmmmmmmmmmmb',
  'bbbbbbbbbbbbbbbbbbbbb',
  '.b.ddd...........ddb.',
  '.b.dpd...........dpb.',
  '.b.ddd...........ddb.',
  '.b................b..',
  '.bb..............bb..',
], pal: { n: 'B2', B: 'B4', b: 'B1', m: 'B3', G: 'K6', i: 'K9', d: 'K3', p: 'K5' }, ox: 10, oy: 10 });

/** pressure plate: 2 frames (up, down) */
export const PLATE = [false, true].map((down) => {
  const pb = new PixelBuf(16, 10);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = (y - 4.5) * 1.6;
      const d = Math.hypot(dx, dy);
      if (d > 7.6) continue;
      let c = d > 6.6 ? 'B1' : d > 5.6 ? (down ? 'B3' : 'B5') : down ? 'B2' : 'B3';
      if (d < 1.5) c = down ? 'O3' : 'K2';
      pb.set(x, y + (down ? 1 : 0), rgb(c));
    }
  // hour ticks
  for (let i = 0; i < 12; i += 3) {
    const a = (i / 12) * Math.PI * 2;
    pb.set(Math.round(7.5 + Math.cos(a) * 4.5), Math.round(4.5 + Math.sin(a) * 2.8) + (down ? 1 : 0), rgb('B6'));
  }
  return spriteFromBuf(pb, 8, 5);
});

export const PEDESTAL = spriteFromDef({ rows: [
  '.nnnnnnnnnnn.',
  'nBBBBBBBBBBBn',
  'nbbbbbbbbbbbn',
  '.nppppppppn..',
  '..pPPPPPPp...',
  '..pPaaaaPp...',
  '..pPPPPPPp...',
  '.nnnnnnnnnnn.',
  'nbbbbbbbbbbbn',
], pal: { n: 'B1', B: 'B4', b: 'B2', p: 'K4', P: 'K5', a: 'K3' }, ox: 6, oy: 8 });
