// Reward / patron / UI icons (16x16 unless noted). Hand-authored pixel art.
import { PixelBuf } from '../../engine/gfx/canvas';
import { Sprite, spriteFromDef, spriteFromBuf } from '../../engine/gfx/sprite';
import { blit, rgb } from '../blit';

const P = {
  n: 'B1', Y: 'B6', B: 'B5', b: 'B4', m: 'B3', d: 'B2', k: 'K1', K: 'K0', w: 'K10', W: 'W', g: 'K7', G: 'K8',
  C: 'C3', c: 'C2', x: 'C4', r: 'R3', R: 'R4', z: 'R2', o: 'O2', O: 'O3', q: 'O4', t: 'T3', T: 'T5', s: 'T4',
  v: 'V3', V: 'V4', u: 'U3', U: 'U4', e: 'G3', E: 'G4', f: 'G2', p: 'K5', P: 'K6', a: 'K3', A: 'K4', i: 'K9',
};
const icon = (rows: string[], ox = 8, oy = 8) => spriteFromDef({ rows, pal: P, ox, oy });

export const ICONS: Record<string, Sprite> = {
  hourglass: icon([
    '..dddddddddddd..',
    '..dYYYYYYYYYYd..',
    '...dkkkkkkkkd...',
    '...dkCCCCCCkd...',
    '....dkxCCCkd....',
    '.....dkCCkd.....',
    '......dkkd......',
    '.......kk.......',
    '......dkkd......',
    '.....dk.ckd.....',
    '....dk..c.kd....',
    '...dk..ccc.kd...',
    '...dkcCCCCckd...',
    '..dddddddddddd..',
    '..dYYYYYYYYYYd..',
    '..dddddddddddd..',
  ]),
  whetstone: icon([
    '................',
    '..........G.....',
    '.........GiG....',
    '........GiiG....',
    '.......GiigG....',
    '......GiigG.....',
    '.....GiigG......',
    '....GwigG.......',
    '...ppppppppppp..',
    '..pPPPPPPPPPPPp.',
    '..pPAAAAAAAAAPp.',
    '..pAaAaAaAaAaAp.',
    '..paaaaaaaaaaap.',
    '...ppppppppppp..',
    '................',
    '................',
  ]),
  chest: icon([
    '................',
    '...nnnnnnnnnn...',
    '..nmmmmmmmmmmn..',
    '.nmdddddddddmn..',
    '.nmdbBbbbbbdmn..',
    '.nnnnnnnnnnnnn..',
    '.ndddddYYdddddn.',
    '.nmmmmmYBmmmmmn.',
    '.nddddkYBkddddn.',
    '.nmmmmmkkmmmmmn.',
    '.nddddddddddddn.',
    '.nmmmmmmmmmmmmn.',
    '.nnnnnnnnnnnnnn.',
    '................',
    '................',
    '................',
  ]),
  oil: icon([
    '................',
    '..........nn....',
    '.........nYn....',
    '........nBn.....',
    '...nnnnnBn......',
    '..nmmmmmmn......',
    '.nmbBBBbbmn.....',
    '.nmBeeeebmn.....',
    '.nmbeEEebmnn....',
    '.nmbeEEebmnmn...',
    '.nmbeeeebmn.n...',
    '.nmbbbbbbmn.n...',
    '.nmmmmmmmmnn....',
    '..nnnnnnnn......',
    '................',
    '................',
  ]),
  coins: icon([
    '................',
    '................',
    '.......nnn......',
    '......nBYBn.....',
    '......nbmbn.....',
    '...nnnnBnbn.....',
    '..nBYBnbmbn.....',
    '..nbmbnnnnnn....',
    '..nBnbnBYYBn....',
    '..nbmbnbmmbn....',
    '...nnnnBnnbn....',
    '.......bmmbn....',
    '.......nnnn.....',
    '................',
    '................',
    '................',
  ]),
  shards: icon([
    '................',
    '.......VV.......',
    '......VvvV......',
    '.....VvWvvV.....',
    '....VvWvvvvV....',
    '....VvWvvvvV....',
    '....VvvvvvvV....',
    '.....VvvvvV.....',
    '.....VvvvvV.....',
    '......VvvV......',
    '......VvvV......',
    '.......VV.......',
    '................',
    '................',
    '................',
    '................',
  ]),
  snail: icon([
    '................',
    '......nnnnn.....',
    '.....nbBBbmn....',
    '....nbYnnnbmn...',
    '....nBnkkknbn...',
    '....nBnkwknbn...',
    '....nbnnkknmn...',
    'G...nmbbbnmmn...',
    '.G..nnmmmmmn....',
    '.iG..nnnnnn.....',
    '.iiiiiiiiiiiiG..',
    '..GGGGGGGGGGGG..',
    '................',
    '................',
    '................',
    '................',
  ]),
  event: icon([
    '................',
    '....iiiiiiii....',
    '...iwwwwwwwwi...',
    '...iwwGGGGwwi...',
    '...iwGwwwwGwi...',
    '...iwwwwwwGwi...',
    '...iwwwwwGwwi...',
    '...iwwwwGwwwi...',
    '...iwwwwGwwwi...',
    '...iwwwwwwwwi...',
    '...iwwwwGwwwi...',
    '...iwwwwwwwwi...',
    '....iiiiiiii....',
    '................',
    '................',
    '................',
  ]),
  rest: icon([
    '................',
    '..GG.......GG...',
    '..GiG.....GiG...',
    '...GiG...GiG....',
    '....GiG.GiG.....',
    '.....GiGiG......',
    '......GiG.......',
    '.....GiGiG......',
    '....GiG.GiG.....',
    '...nmG...Gmn....',
    '..nbmn...nmbn...',
    '..nmn.....nmn...',
    '...n.......n....',
    '................',
    '................',
    '................',
  ]),
  vault: icon([
    '................',
    '.....nnnnnn.....',
    '....nb....bn....',
    '....nm....mn....',
    '....nm....mn....',
    '..nnnnnnnnnnnn..',
    '..nBBBBBBBBBBn..',
    '..nbmmmkkmmmbn..',
    '..nbmmkkkkmmbn..',
    '..nbmmmkkmmmbn..',
    '..nbmmmkkmmmbn..',
    '..nbbbbbbbbbbn..',
    '..nnnnnnnnnnnn..',
    '................',
    '................',
    '................',
  ]),
  elite: icon([
    '................',
    '....r..rr..r....',
    '...rzrrRRrrzr...',
    '..rzRRRRRRRRzr..',
    '..rRwwRRRRwwRr..',
    '..rRwKwRRwKwRr..',
    '..rRRRRzzRRRRr..',
    '...rRRzKKzRRr...',
    '..rrRRRRRRRRrr..',
    '..r.rRrRRrRr.r..',
    '.....rz.rz......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
  boss: icon([
    '.....nnnnnn.....',
    '...nnbBBBBbnn...',
    '..nbBwwwwwwBbn..',
    '.nbwwwwwwwwwwbn.',
    '.nBwKKwwwwKKwBn.',
    'nbwwKKwrrwKKwwbn',
    'nBwwwwwrrwwwwwBn',
    'nBwwwwwrrwwwwwBn',
    'nbwwwwwrrrrrwwbn',
    '.nBwwwwwwwwwwBn.',
    '.nbBwwwwwwwwBbn.',
    '..nnbBBBBBBbnn..',
    '....nnnnnnnn....',
    '................',
    '................',
    '................',
  ]),
  heal: icon([
    '................',
    '......nnnn......',
    '.....nYBBn......',
    '......nbn.......',
    '.....nEEEn......',
    '....nEeeeEn.....',
    '...nEeEEeeEn....',
    '...nEeEeeeEn....',
    '...nEeeeeeEn....',
    '...nfEeeeEfn....',
    '....nfffffn.....',
    '.....nnnnn......',
    '................',
    '................',
    '................',
    '................',
  ]),
  key: icon([
    '................',
    '...nnnn.........',
    '..nBYBbn........',
    '.nB.nn.bn.......',
    '.nbn..nmn.......',
    '.nbn..nmn.......',
    '..nbmmbnnnnnnn..',
    '...nnnnmmmmmmbn.',
    '.......nnnnbnmn.',
    '..........nbnmn.',
    '..........nnnnn.',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
};

// ───── patron medallions: brass rim + coloured field + symbol ─────
const SYMBOLS: Record<string, string[]> = {
  oren: ['....q.....', '...qO.....', '...qOo....', '..oOOo.o..', '..oOqOooo.', '.oOqqqOOo.', '.oOqqqqOo.', '.ooOqqOOo.', '..ooOOOo..', '...oooo...'],
  pip: ['...E..E...', '..EEEEEE..', '.EEEeeEEE.', '..Ee..eEE.', '.EEe..eEE.', '..EeeeeE..', '.EEEEEEEE.', '..EE..EE..', '..........', '..........'],
  marta: ['....UU....', '...UiiU...', '..UiiiiU..', '..UiiiiU..', '..UiiiiU..', '.UiiiiiiU.', '.UiiiiiiU.', 'UUUUUUUUUU', '....UU....', '..........'],
  fen: ['......TT..', '....TTsT..', '...TssT...', '..TsT.....', '.TsT..TT..', '.TT..TssT.', '..T.TsT...', '...TT.....', '...T......', '...T......'],
  asu: ['....V.....', '....V.....', '...VvV....', 'VVVvWvVVV.', '.VvWWWvV..', '..VvWvV...', '..Vv.vV...', '.VV...VV..', '..........', '..........'],
};
const PATRON_FIELD: Record<string, [string, string]> = { oren: ['O0', 'R1'], pip: ['G0', 'G1'], marta: ['U0', 'U1'], fen: ['T0', 'T1'], asu: ['V0', 'V1'] };

const sigilCache = new Map<string, Sprite>();
export function patronSigil(patron: string, big = false): Sprite {
  const key = patron + big;
  let s = sigilCache.get(key);
  if (s) return s;
  const pb = new PixelBuf(16, 16);
  const [f0, f1] = PATRON_FIELD[patron] ?? ['K1', 'K2'];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d > 7.6) continue;
      if (d > 6.6) pb.set(x, y, rgb(y < 8 ? 'B5' : 'B3'));
      else if (d > 5.8) pb.set(x, y, rgb('B1'));
      else pb.set(x, y, rgb(y < 7 ? f1 : f0));
    }
  blit(pb, SYMBOLS[patron] ?? SYMBOLS.oren, P, 3, 3);
  s = spriteFromBuf(pb, 8, 8);
  sigilCache.set(key, s);
  return s;
}

/** Part icon: brass cog frame with a coloured core keyed by part id (unique-ish per part) */
const partCache = new Map<string, Sprite>();
const PART_GLYPHS: Record<string, string[]> = {
  key: ['..nn....', '.nYbn...', '.n..n...', '..nbnnnn', '....nmmn', '.....nnn'],
  heart: ['.rr.rr..', 'rRRrRRr.', 'rRRRRRr.', '.rRRRr..', '..rRr...', '...r....'],
  oil: ['...nn...', '..nBn...', '.nmmmn..', 'nmEEEmn.', 'nmEEEmn.', '.nnnnn..'],
  lens: ['.GGGG...', 'GiwwiG..', 'GwiwwG..', 'GwwiwG..', '.GGGGG..', '....GG..'],
  plumb: ['...n....', '...n....', '..nBn...', '.nBbmn..', '.nbmmn..', '..nmn...'],
  watch: ['..nYn...', '.nbbbn..', 'nbwwwbn.', 'nbwKwbn.', 'nbwwwbn.', '.nnnnn..'],
  shard: ['...Cx...', '..CCx...', '.CCCC...', '..CCC...', '..CC....', '...C....'],
  shell: ['..iiii..', '.iwGwGi.', 'iwGwGwi.', 'iGwGwGi.', '.iiiii..', '..ii....'],
  bird: ['....nn..', '..nnBYn.', '.nBBBn..', 'nbBBn...', '.nbn....', '..n.....'],
  magnet: ['r.....u.', 'r.....u.', 'rr...uu.', '.rr.uu..', '..ruu...', '........'],
  rabbit: ['.i..i...', '.i..i...', '.iiii...', 'iwKwi...', 'iiiiin..', '.inni...'],
  photo: ['GGGGGG..', 'GwwwwG..', 'GwbbwG..', 'GwmmwG..', 'GGGGGG..', '........'],
  bell: ['...nn...', '..nBBn..', '..nBbn..', '.nBBbbn.', 'nnnnnnn.', '...nn...'],
  whetstone: ['.....Gi.', '....Gi..', '...Gi...', 'pppppp..', 'pAAAAp..', 'pppppp..'],
  ink: ['..kk....', '.kKKk...', '.kVVk...', 'kKVVKk..', 'kKKKKk..', '.kkkk...'],
  eye: ['.iiii...', 'iwwwwi..', 'iwVKwi..', 'iwwwwi..', '.iiii...', '........'],
  gear: ['.E.E.E..', 'EEEEEEE.', '.Ee.eE..', 'EE...EE.', '.EeeeE..', 'E.E.E.E.'],
  star: ['...V....', '..VVV...', 'VVVWVVV.', '.VVVVV..', '.V...V..', '........'],
  snail: ['.nnnn...', 'nBnnBn..', 'nBnkBn..', 'nmmmmnG.', 'GGGGGGG.', '........'],
  card: ['iiiiii..', 'iwwwwi..', 'iwGGwi..', 'iwwwwi..', 'iiiiii..', '........'],
  hourhand: ['......n.', '.....nB.', '....nB..', '..nBn...', '.nBn....', 'nBn.....'],
  score: ['wwwwwww.', 'GGGGGGG.', 'wwkwwww.', 'GGkGkGG.', 'wkkwkkw.', 'GGGGGGG.'],
  wax: ['..rrr...', '.rRRRr..', 'rRzRRRr.', 'rRRRzRr.', '.rRRRr..', '..rrr...'],
  mirror: ['.GiiG...', 'GiwwiG..', 'GwiwwG..', 'GwwiwG..', '.GiiG...', '..nn....'],
  ember: ['...q....', '..qO....', '.oOqo...', 'oOqqOo..', 'ooOOoo..', '.oooo...'],
  anvil: ['pPPPPPp.', '.pAAAp..', '..pAp...', '..pAp...', '.pAAAp..', 'ppppppp.'],
  pendulum: ['...n....', '...n....', '...n....', '...n....', '..nBn...', '..nbn...'],
  lantern: ['..nn....', '.nYYn...', 'nqOOqn..', 'nOqqOn..', '.nnnn...', '........'],
  crown: ['z..z..z.', 'zr.zr.z.', 'zrrzrrz.', 'zRRRRRz.', 'zzzzzzz.', '........'],
  spring: ['.GGGG...', '....G...', '.GGGG...', '.G......', '.GGGG...', '....G...'],
  blacksand: ['.kkkk...', 'kKKKKk..', '.kKKk...', '..kk....', '.kKKk...', 'kKKKKk..'],
  pocket: ['..nYn...', '.nbbbn..', 'nbwwwbn.', 'nbwKwbn.', 'nbwwwbn.', '.nnnnn..'],
};
export function partIcon(glyph: string, cursed = false): Sprite {
  const key = glyph + cursed;
  let s = partCache.get(key);
  if (s) return s;
  const pb = new PixelBuf(16, 16);
  // rounded plate
  for (let y = 1; y < 15; y++)
    for (let x = 1; x < 15; x++) {
      const corner = (x < 3 || x > 12) && (y < 3 || y > 12) && Math.hypot(x < 8 ? 3 - x : x - 12, y < 8 ? 3 - y : y - 12) > 1.5;
      if (corner) continue;
      const edge = x === 1 || x === 14 || y === 1 || y === 14;
      pb.set(x, y, rgb(edge ? (cursed ? 'R1' : 'B2') : y < 6 ? 'K3' : 'K2'));
    }
  for (let x = 3; x < 13; x++) pb.set(x, 2, rgb(cursed ? 'R2' : 'B4'));
  blit(pb, PART_GLYPHS[glyph] ?? PART_GLYPHS.gear, P, 4, 5);
  s = spriteFromBuf(pb, 8, 8);
  partCache.set(key, s);
  return s;
}

/** slot glyphs for memory cards (7x7) */
export const SLOT_GLYPH: Record<string, string[]> = {
  attack: ['......w', '.....w.', '....w..', '.w.w...', '..w....', '.w.w...', 'w......'],
  special: ['...w...', '...w...', '.wwwww.', '...w...', '..w.w..', '.w...w.', '.......'],
  dash: ['.......', 'w..w...', '.w..w..', '..w..w.', '.w..w..', 'w..w...', '.......'],
  rewind: ['..www..', '.w...w.', 'w.....w', 'w.w...w', 'ww....w', 'w....w.', '..www..'],
  echo: ['.w...w.', 'w.w.w.w', 'w.w.w.w', 'w.w.w.w', 'w.w.w.w', '.w...w.', '.......'],
  passive: ['...w...', '..w.w..', '.w...w.', 'w..w..w', '.w...w.', '..w.w..', '...w...'],
  legendary: ['...w...', '..www..', 'wwwwwww', '.wwwww.', '..w.w..', '.w...w.', '.......'],
  duo: ['.ww.ww.', 'w..w..w', 'w..w..w', 'w..w..w', '.ww.ww.', '.......', '.......'],
};
