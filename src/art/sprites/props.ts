import { spriteFromDef, Sprite } from '../../engine/gfx/sprite';

export const SCONCE = spriteFromDef({
  rows: [
    '..nnn..',
    '.nYYYn.',
    'nY...Yn',
    'n.....n',
    'n.....n',
    '.nnnnn.',
    '..bbb..',
    '...b...',
    '..mbm..',
  ],
  pal: { n: 'B2', Y: 'B4', b: 'B3', m: 'B1' },
  ox: 3, oy: 4,
});
export const FLAME: Sprite[] = [
  ['..o..', '.oOo.', '.OwO.', '.oOo.'],
  ['.o...', '.oOo.', '.OwO.', '..oo.'],
  ['...o.', '.oOo.', '.OwO.', '.oo..'],
].map((rows) => spriteFromDef({ rows, pal: { o: 'O2', O: 'O3', w: 'O4' }, ox: 2, oy: 3, outline: false }));

export const CRATE = spriteFromDef({
  rows: [
    'nbbbbbbbbbbbbbbn',
    'bYddddddddddddYb',
    'bdcccccccccccccb',
    'bdcddddddddddcdb',
    'bdcdccccccccdcdb',
    'nbbbbbbbbbbbbbbn',
    'bYeeeeeeeeeeeeYb',
    'bedddddddddddded',
    'beeddddddddddeeb',
    'bedeeddddddeeded',
    'beddeeddddeeddeb',
    'bedddeeddeedddeb',
    'beddddeeeeddddeb',
    'bedddeeddeedddeb',
    'beddeeddddeeddeb',
    'bedeeddddddeeded',
    'bYeeeeeeeeeeeeYb',
    'nbbbbbbbbbbbbbbn',
  ],
  pal: { n: 'B1', b: 'B2', Y: 'B4', d: 'B0', c: 'B1', e: 'B1' },
  ox: 8, oy: 17,
});

export const BARREL = spriteFromDef({
  rows: [
    '...kkkkkkkk...',
    '..kssssssssk..',
    '.ksSSSSSSSSsk.',
    '.kssssssssssk.',
    '.nnnnnnnnnnnn.',
    'kaaAAAAAAAaaak',
    'kaAAAhAAAAAaak',
    'kaAAAhAAAAAaak',
    'nnnnnnnnnnnnnn',
    'kaAAAhAAAAAaak',
    'kaAAAhAAAAAaak',
    'kaaAAAAAAAaaak',
    '.nnnnnnnnnnnn.',
    '..kaaaaaaaak..',
  ],
  pal: { k: 'K1', s: 'K4', S: 'K5', n: 'B2', a: 'T1', A: 'T2', h: 'T3' },
  ox: 7, oy: 13,
});
