// FINAL BOSS — The Stillness (Ines's grief). A minor, 3/4, 126 bpm, 48 bars (~69 s loop).
// Three layers, all in step:
//  base   frozen: an A pedal, a glass cluster (A+B) that never moves, a music box that keeps
//         starting the waltz and running down, ticks that keep stopping — and at bars 33-36
//         (the time-stop) no ticks at all, while the box finally gets through the first phrase.
//  combat a slow heartbeat (Oren, in the last second) + low string breathing; it stops during
//         the time-stop too.
//  boss   the waltz made huge and desperate: taiko on one, snare on two-three, string tremolo,
//         choir + strings + horn across three octaves, tower bells on the downbeats.
//         1-8 accompaniment + horn fragments | 9-16 waltz | 17-24 waltz + square lead |
//         25-32 the B strain fortissimo | 33-40 time-stop: everything holds its breath, then
//         rebuilds under a reverse swell | 41-48 the waltz climbs to F6 over E7(b9) and stays
//         there, unresolved, until the loop drops back to A minor.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep, sand, tp } from './kit';
import { WALTZ, WALTZ_B } from './motif';

const B = 12;
const L = 'boss_final';

const BARS = [
  'Am', 'F', 'Dm6', 'E', 'Am', 'F', 'E7b9', 'E7',
  'Am', 'F', 'Dm6', 'E', 'Am', 'F', 'E7b9', 'Am',
  'Am', 'F', 'Dm6', 'E', 'Am', 'F', 'E7b9', 'Am/G',
  'C', 'GB', 'Am', 'EmG', 'F', 'FmAb', 'CG', 'E7',
  'Am', 'F', 'Dm6', 'E', 'Am', 'F', 'E7b9', 'E7',
  'Am', 'F', 'Dm6', 'E', 'Am', 'F', 'E7b9', 'E7',
];
const CH: Record<string, { root: string; trem: string; choir: string }> = {
  Am: { root: 'A1', trem: 'A3 C4 E4', choir: 'A3+C4+E4' }, F: { root: 'F1', trem: 'A3 C4 F4', choir: 'A3+C4+F4' },
  Dm6: { root: 'D2', trem: 'A3 B3 F4', choir: 'A3+B3+F4' }, E: { root: 'E1', trem: 'G#3 B3 E4', choir: 'G#3+B3+E4' },
  E7b9: { root: 'E1', trem: 'G#3 D4 F4', choir: 'G#3+D4+F4' }, E7: { root: 'E1', trem: 'G#3 B3 D4', choir: 'G#3+B3+D4' },
  G: { root: 'G1', trem: 'G3 B3 D4', choir: 'G3+B3+D4' }, C: { root: 'C2', trem: 'G3 C4 E4', choir: 'G3+C4+E4' },
  GB: { root: 'B1', trem: 'G3 B3 D4', choir: 'G3+B3+D4' }, EmG: { root: 'G1', trem: 'G3 B3 E4', choir: 'G3+B3+E4' },
  FmAb: { root: 'Ab1', trem: 'Ab3 C4 F4', choir: 'Ab3+C4+F4' }, CG: { root: 'G1', trem: 'G3 C4 E4', choir: 'G3+C4+E4' },
};
// split 'X/Y' bars 8+4 (the waltz's last beat)
const perBar = (f: (c: string, len: number) => string) =>
  cat(...BARS.map((b) => (b.includes('/') ? f(b.split('/')[0], 8) + ' ' + f(b.split('/')[1], 4) : f(b, 12))));
const silent = (bars: number) => m(rep('.:12 |', bars - 1) + ' .:12', B, L);
const isStop = (i: number) => i >= 32 && i < 36;
/** silence bars [from, to) of a step pattern */
const mute = (p: string, from: number, to: number) =>
  p.split(' ').map((tk, i) => (Math.floor(i / B) >= from && Math.floor(i / B) < to ? '.' : tk)).join(' ');

// ───────── base: frozen ─────────
// A pedal in the intro and the time-stop; elsewhere the drone follows the roots (tied when repeated)
const drone = cat(...BARS.map((b, i) => {
  const pedal = (k: number) => k < 8 || (k >= 32 && k < 40);
  const root = (k: number) => (pedal(k) ? 'A1' : CH[BARS[k].split('/')[0]].root);
  const tie = i > 0 && root(i - 1) === root(i);
  const last = i === BARS.length - 1;
  return m(`${tie ? '-' : root(i)}:${last ? 11 : 12}${last ? ' .:1' : ''}`, B, L);
}));
// the cluster: a bare, cold E octave (fits every chord of the waltz); C/F colours in the B strain
const cluster = m('E5+E6:12 | ' + rep('-:12 |', 22) + ' -:11 .:1 | E5+G5:12 | -:12 | -:12 | -:12 | F5+C6:12 | -:11 .:1 | E5+E6:12 | ' + rep('-:12 |', 16) + ' -:11 .:1', B, L);
// the music box, winding down: each attempt slower, each stopping sooner
const box = m([
  'E5:4 A5:4 B5:4 | C6:12 |', rep('.:12 |', 6),
  'E5:6 A5:6 | C6:12 |', rep('.:12 |', 6),
  'E5:12 | A5:12 | .:12 | B5:12 |', rep('.:12 |', 12),
  // time-stop: it finally plays the first phrase… and gives out
  'E5:4 A5:4 B5:4 | C6:8 B5:2 A5:2 | D6:8 C6:2 B5:2 | B5:6 A5:2 G#5:4 | E5:4 A5:8 |', rep('.:12 |', 10), '.:12',
].join(' '), B, L);
const tick = grid([
  'x...x...x... x...x...x... x...x....... ............',
  '............ ....x...x... x........... ............',
  'x...x...x... x...x...x... x...x...x... x...x...x...',
  'x...x...x... x...x....... ............ ....x.......',
  'x...x...x... x...x...x... x...x...x... x...........',
  '............ x...x...x... x...x...x... x...x...x...',
  'x...x...x... x...x...x... x...x...x... x...x...x...',
  'x...x...x... x...x...x... x........... ............',
  '............ ............ ............ ............',
  '............ x........... x...x....... x...x...x...',
  'x...x...x... x...x...x... x...x...x... x...x...x...',
  'x...x...x... x...x...x... x...x...x... x...x.......',
].join(' '));
const tock = grid(BARS.map((_, i) => (isStop(i) || i < 8 ? '............' : 'o...........')).join(' '));
const ice = sand(BARS.map((b, i) => (isStop(i) ? '.' : 'A6 B6 E7 A7')), B, 31, 0.08, 4);
const rewind = cat(silent(31), m('x:12', B, L), silent(6), m('x:24', 24, L), silent(7), m('x:12', B, L));

// ───────── combat: the heartbeat ─────────
const heart = cat(...BARS.map((b, i) => (isStop(i) ? m('.:12', B, L) : m(`${tp(CH[b.split('/')[0]].root, 12)}:2 ${tp(CH[b.split('/')[0]].root, 12)}?:10`, B, L))));
const breath = mute(perBar((c, n) => m(`${tp(CH[c].root, 12)}?:${n}`, n, L)), 32, 36);

// ───────── boss: the huge waltz ─────────
const waltz = m(WALTZ, B, L);
const climax = m('E5:4 A5:4 B5:4 | C6:8 B5:2 A5:2 | D6:8 C6:2 B5:2 | B5:6 A5:2 G#5:4 | E5:4 A5:4 B5:4 | C6:4 D6:4 E6:4 | F6!:12 | E6:8 D6:2 B5:2', B, L);
const waltzToC = m(WALTZ.replace(/C6:12$/, 'C6:8 B5:4'), B, L);
const strMel = cat(silent(8), waltz, waltzToC, m(WALTZ_B, B, L), silent(8), climax);
const choirMel = cat(silent(8), tp(waltz, -12), tp(waltzToC, -12), tp(m(WALTZ_B, B, L), -12),
  // time-stop: a held breath
  ...BARS.slice(32, 40).map((b) => m(`${CH[b].choir}?:12`, B, L)),
  tp(climax, -12));
const horn = cat(
  // intro: fragments of the head, big and low
  m('E3:4 A3:4 B3:4 | C4:12 | .:12 | .:12 | E3:4 A3:4 B3:4 | C4:4 D4:4 E4:4 | F4:12 | E4:12', B, L),
  tp(waltz, -24), tp(waltzToC, -24),
  // B: counter-line
  m('E4:12 | D4:12 | C4:12 | B3:12 | A3:12 | C4:12 | C4:12 | B3:8 D4:4', B, L),
  silent(6), m('E3:12 | G#3:12', B, L),
  tp(climax, -24),
);
const lead = cat(silent(16), waltzToC, silent(24));
const TREM: Record<number, string> = { 12: '0 0 0 0 1 1 1 1 2 2 2 2', 8: '0 0 0 0 1 1 2 2', 4: '0 0 1 1' };
const tremBoss = mute(perBar((c, n) => arp([CH[c].trem], TREM[n])), 32, 37);
const bassBoss = mute(perBar((c, n) => (n === 12 ? m(`${CH[c].root}:8 ${tp(CH[c].root, 12)}:4`, 12, L) : m(`${CH[c].root}:${n}`, n, L))), 32, 37);
const taiko = grid([
  rep('X.......x... X.......x... X.......x... X...x.x.XXXX', 2),
  rep('X.....x.x... X.....x.x... X.....x.x... X.....x.X.x.', 6),
  '............ ............ ............ ............',
  '............ X........... X.......x... X...x.x.XXXX',
  rep('X.....x.x... X.....x.x... X.....x.x... X.....x.X.x.', 2),
].join(' '));
const snare = grid([
  rep('....o...o... ....o...o... ....o...o... ....o.o.oXoX', 2),
  rep('....X...X... ....X...X... ....X...X... ....X.X.XXXX', 6),
  '............ ............ ............ ............',
  '............ ............ ....o...o... ..o.o.oXoXXX',
  rep('....X...X... ....X...X... ....X...X... ....X.X.XXXX', 2),
].join(' '));
const timp = cat(...BARS.map((b, i) => (isStop(i) || (i >= 36 && i < 37) ? m('.:12', B, L) : m(`${tp(CH[b.split('/')[0]].root, 12)}:12`, B, L))));
const bellBoss = cat(silent(8), ...BARS.slice(8, 32).map((b) => m(`${tp(CH[b.split('/')[0]].root, 24)}:12`, B, L)), silent(8),
  ...BARS.slice(40).map((b) => m(`${tp(CH[b.split('/')[0]].root, 24)}:12`, B, L)));
const crash = m(['.:12 |', rep('.:12 |', 7), 'x:12 |', rep('.:12 |', 7), 'x:12 |', rep('.:12 |', 7), 'x:12 |', rep('.:12 |', 15), 'x:12 |', rep('.:12 |', 6), '.:12'].join(' '), B, L);

export const boss_final: SongDef = {
  bpm: 126, len: 48 * B,
  tracks: [
    // base
    { inst: 'drone', p: drone, vol: 0.55 },
    { inst: 'glass', p: cluster, vol: 0.7, pan: 0.2 },
    { inst: 'box', p: box, vol: 1.1, pan: -0.15 },
    { inst: 'tick', p: tick, vol: 0.9, pan: 0.3 },
    { inst: 'tock', p: tock, vol: 1.2, pan: -0.3 },
    { inst: 'celesta', p: ice, vol: 0.8, pan: 0.45 },
    { inst: 'rewind', p: rewind, vol: 1.0 },
    // combat
    { inst: 'timpani', layer: 'combat', p: heart, vol: 0.5 },
    { inst: 'bowed', layer: 'combat', p: breath, vol: 1.2, pan: -0.2 },
    // boss
    { inst: 'strings', layer: 'boss', p: strMel, vol: 1.4, pan: 0.1 },
    { inst: 'choir', layer: 'boss', p: choirMel, vol: 2.2 },
    { inst: 'horn', layer: 'boss', p: horn, vol: 1.3, pan: -0.1 },
    { inst: 'lead', layer: 'boss', p: lead, vol: 0.6, pan: 0.25 },
    { inst: 'strings', layer: 'boss', p: tremBoss, vol: 0.7, pan: -0.25 },
    { inst: 'bass', layer: 'boss', p: bassBoss, vol: 0.45 },
    { inst: 'taiko', layer: 'boss', p: taiko, vol: 0.75 },
    { inst: 'snare', layer: 'boss', p: snare, vol: 0.9 },
    { inst: 'timpani', layer: 'boss', p: timp, vol: 0.4 },
    { inst: 'towerbell', layer: 'boss', p: bellBoss, vol: 0.45 },
    { inst: 'crash', layer: 'boss', p: crash, vol: 0.8 },
  ],
};
