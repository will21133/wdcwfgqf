// FLOOR 4 — The Clockface. The summit under the stars: the great dial, the moon, the last climb.
// C minor, 4/4, 72 bpm, 40 bars (~133 s loop). Vast, solemn, always rising.
// intro (1-4)   tower bells toll C over a C pedal: Cm | Ab/C | Fm/C | G/C
// A  (5-12)     the ascent: the bass climbs C D Eb F G Ab Bb B, the bells ring the top voice a tenth
//               above it, a staircase of parallel tenths; choir holds the chords
// A' (13-20)    same stairs, a horn now sings with turns and passing notes up to D6 over G
// B  (21-32)    Ines's waltz in augmentation (every note twice as long, 1.5 bars per waltz bar):
//               the choir sings it, the tower bells strike each note — the clock plays her song
// summit (33-36) Ab | Bb | Csus4 | C — horn + strings climb to the major third (Picardy)
// outro (37-40) back to the C pedal with a Neapolitan Db shimmer → loop
// combat: clockwork 16th ticks, taiko, pitched timpani on the roots, string ostinato, 8th bass, crashes.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep, sand, tp } from './kit';

const B = 16;
const L = 'clockface';

// bar-by-bar harmony ('X/Y' = half a bar each)
const BARS = [
  'Cm', 'AbC', 'FmC', 'GC',
  'Cm', 'BbD', 'CmEb', 'Fm', 'EbG', 'Ab', 'Bb', 'GB',
  'Cm', 'BbD', 'CmEb', 'Fm', 'EbG', 'Ab', 'Bb', 'G',
  'Cm', 'Cm/Ab', 'Ab', 'Fm6', 'Fm6/G', 'G', 'Cm', 'Cm/Ab', 'Ab', 'G7b9', 'G7b9/Cm', 'Cm',
  'Ab', 'Bb', 'Csus', 'C',
  'Cm', 'DbC', 'AbC', 'Cm',
];
const HALVES = BARS.flatMap((b) => (b.includes('/') ? b.split('/') : [b, b]));

const CH: Record<string, { choir: string; root: string; ost: string; star: string }> = {
  Cm: { choir: 'G3+C4+Eb4', root: 'C2', ost: 'C4 Eb4 G4', star: 'C6 Eb6 G6 C7 Eb7' },
  AbC: { choir: 'C4+Eb4+Ab4', root: 'C2', ost: 'C4 Eb4 Ab4', star: 'C6 Eb6 Ab6 C7' },
  FmC: { choir: 'C4+F4+Ab4', root: 'C2', ost: 'C4 F4 Ab4', star: 'C6 F6 Ab6 C7' },
  GC: { choir: 'B3+D4+G4', root: 'C2', ost: 'B3 D4 G4', star: 'B5 D6 G6 B6' },
  BbD: { choir: 'F3+Bb3+D4', root: 'D2', ost: 'D4 F4 Bb4', star: 'D6 F6 Bb6 D7' },
  CmEb: { choir: 'G3+C4+Eb4', root: 'Eb2', ost: 'Eb4 G4 C5', star: 'C6 Eb6 G6 C7' },
  Fm: { choir: 'Ab3+C4+F4', root: 'F2', ost: 'F4 Ab4 C5', star: 'C6 F6 Ab6 C7' },
  EbG: { choir: 'G3+Bb3+Eb4', root: 'G2', ost: 'G4 Bb4 Eb5', star: 'Bb5 Eb6 G6 Bb6' },
  Ab: { choir: 'Ab3+C4+Eb4', root: 'Ab1', ost: 'Ab4 C5 Eb5', star: 'C6 Eb6 Ab6 C7' },
  Bb: { choir: 'Bb3+D4+F4', root: 'Bb1', ost: 'Bb4 D5 F5', star: 'D6 F6 Bb6 D7' },
  GB: { choir: 'B3+D4+G4', root: 'B1', ost: 'B4 D5 G5', star: 'B5 D6 G6 B6' },
  G: { choir: 'B3+D4+G4', root: 'G1', ost: 'B4 D5 G5', star: 'B5 D6 G6 B6' },
  Fm6: { choir: 'Ab3+D4+F4', root: 'F2', ost: 'F4 Ab4 D5', star: 'D6 F6 Ab6 C7' },
  G7b9: { choir: 'B3+D4+F4+Ab4', root: 'G1', ost: 'B4 D5 Ab5', star: 'B5 D6 F6 Ab6' },
  Csus: { choir: 'C4+F4+G4', root: 'C2', ost: 'C5 F5 G5', star: 'C6 F6 G6 C7' },
  C: { choir: 'C4+E4+G4', root: 'C2', ost: 'C5 E5 G5', star: 'C6 E6 G6 C7 E7' },
  DbC: { choir: 'Db4+F4+Ab4', root: 'C2', ost: 'Db4 F4 Ab4', star: 'Db6 F6 Ab6 C7' },
};

// sustained choir chords everywhere except the waltz (B), where the choir sings the tune
const choirChords = cat(...BARS.map((b, i) => (i >= 20 && i < 32 ? m('.:16', B, L) : m(`${CH[b].choir}:16`, B, L))));

// ── melodies ──
// Ines's waltz (C minor) in augmentation: one waltz bar = 24 steps = 1.5 bars of 4/4
const W = 24;
const WALTZ_AUG = 'G4:8 C5:8 D5:8 | Eb5:16 D5:4 C5:4 | F5:16 Eb5:4 D5:4 | D5:12 C5:4 B4:8 | ' +
  'G4:8 C5:8 D5:8 | Eb5:8 F5:8 G5:8 | Ab5:16 G5:4 F5:4 | Eb5:24';
const silent = (bars: number) => m(rep('.:16 |', bars - 1) + ' .:16', B, L);
const waltz = m(WALTZ_AUG, W, L);
const choirMel = cat(silent(20), waltz, silent(8));
const choirLow = cat(silent(20), tp(waltz, -12), silent(8));

// the bells: intro tolls, the stair of tenths, downbeats in A', the waltz, the summit peal, outro
const bell = cat(
  m('C3:16 | .:16 | C3?:16 | .:8 G3?:8', B, L),
  m('Eb4:16 | F4:16 | G4:16 | Ab4:16 | Bb4:16 | C5:16 | D5:16 | D5:8 B4:8', B, L),
  m('C4:16 | D4:16 | Eb4:16 | F4:16 | G4:16 | Ab4:16 | Bb4:16 | G4:16', B, L),
  tp(waltz, -12),
  m('C5:4 Bb4:4 Ab4:4 G4:4 | D5:4 C5:4 Bb4:4 F4:4 | C5:4 G4:4 F4:4 C4:4 | C4!:16', B, L),
  m('C3:16 | .:16 | C3?:16 | .:16', B, L),
);

const horn = m([
  rep('.:16 |', 12),
  'Eb5:12 D5:2 Eb5:2 | F5:12 Eb5:2 F5:2 | G5:12 F5:2 G5:2 | Ab5:12 G5:2 Ab5:2 |',
  'Bb5:8 G5:4 Ab5:4 | C6:8 Ab5:4 Bb5:4 | D6:8 Bb5:4 C6:4 | D6:16 |',
  rep('.:16 |', 12),
  // the summit
  'Eb5:8 C5:4 Eb5:4 | F5:8 D5:4 F5:4 | G5:8 F5:8 | E5!:16 |',
  rep('.:16 |', 3), '.:16',
].join(' '), B, L);

const strings = m([
  rep('.:16 |', 12),
  // A': a falling counter-line against the rising stair
  'G4:16 | F4:16 | Eb4:8 C4:8 | Ab3:16 | Bb3:16 | C4:8 Eb4:8 | F4:8 D4:8 | D4:8 B3:8 |',
  // B: harmony under the choir's waltz (1.5-bar chords)
  'Eb4+G4:16 | -:8 Eb4+Ab4:8 | -:16 | D4+F4:16 | -:8 D4+G4:8 | -:16 | Eb4+G4:16 | -:8 Eb4+Ab4:8 | -:16 | D4+F4:16 | -:8 Eb4+G4:8 | -:16 |',
  // the summit, with the horn an octave below
  'Eb4:8 C4:4 Eb4:4 | F4:8 D4:4 F4:4 | G4:8 F4:8 | E4:16 |',
  rep('.:16 |', 3), '.:16',
].join(' '), B, L);

// pedal / bass line (sustained)
const drone = cat(...HALVES.map((h, i) => {
  const r = CH[h].root;
  const same = i > 0 && CH[HALVES[i - 1]].root === r;
  return m(`${same ? '-' : r}:8`, 8, L);
}));

const stars = sand(BARS.map((b) => CH[b.split('/')[0]].star), B, 77, 0.14, 2);

// ── combat ──
const ticks = grid(rep('x.o.x.o.x.o.x.o.', 40));
const taiko = grid(rep('X.......X....... X.......X.....x. X.......X....... X.....x.X.x.x.x.', 10));
const timp = cat(...HALVES.map((h) => { const r = tp(CH[h].root, 12); return m(`${r}:6 ${r}?:2`, 8, L); }));
const ost = cat(...HALVES.map((h) => arp([CH[h].ost], '0 1 2 1 0? 1? 2 1?')));
const bass = cat(...HALVES.map((h) => { const r = CH[h].root; return m(`${r}:2 ${r}:2 ${tp(r, 12)}:2 ${r}:2`, 8, L); }));
const snare = grid(rep('....X.......X... ....X.......X... ....X.......X... ....X...X.o.XoXo', 10));
const crash = m(['.:16 |', rep('.:16 |', 3), 'x:16 |', rep('.:16 |', 7), 'x:16 |', rep('.:16 |', 7), 'x:16 |', rep('.:16 |', 11), 'x:16 |', rep('.:16 |', 6), '.:16'].join(' '), B, L);

export const clockface: SongDef = {
  bpm: 72, len: 40 * B,
  tracks: [
    { inst: 'choir', p: choirMel, vol: 3.4 },
    { inst: 'choir', p: choirLow, vol: 2.0 },
    { inst: 'choir', p: choirChords, vol: 1.5 },
    { inst: 'towerbell', p: bell, vol: 0.7, pan: -0.1 },
    { inst: 'horn', p: horn, vol: 1.45, pan: 0.1 },
    { inst: 'bowed', p: strings, vol: 1.45, pan: 0.25 },
    { inst: 'drone', p: drone, vol: 0.5 },
    { inst: 'celesta', p: stars, vol: 0.9, pan: 0.4 },
    // combat
    { inst: 'tick', layer: 'combat', p: ticks, vol: 0.8, pan: 0.3 },
    { inst: 'taiko', layer: 'combat', p: taiko, vol: 0.6 },
    { inst: 'timpani', layer: 'combat', p: timp, vol: 0.45 },
    { inst: 'strings', layer: 'combat', p: ost, vol: 1.1, pan: -0.2 },
    { inst: 'bass', layer: 'combat', p: bass, vol: 0.4 },
    { inst: 'snare', layer: 'combat', p: snare, vol: 0.9 },
    { inst: 'crash', layer: 'combat', p: crash, vol: 0.8 },
  ],
};
