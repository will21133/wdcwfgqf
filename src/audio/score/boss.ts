// BOSS (floors 1-3). E minor, 4/4, 152 bpm, 48 bars (~76 s loop). Driving, urgent.
// Ines's waltz forced into four: each waltz bar becomes a 4/4 bar, its three beats re-cut 3+3+2
// (tresillo) — the same notes, now running.
// intro (1-4)   taiko + low string gears, a rewind swell into…
// A  (5-12)     the motif: strings lead, horn an octave below
// A' (13-20)    the motif traded in two-bar halves — horn (low) and strings (high), self and echo
// B  (21-28)    C | D | Bm | Em | C | D | Ab | C7 — horn calls (waltz head), strings answer with
//               16th runs; Ab → C7 pivots up a semitone…
// C  (29-36)    …the motif in F minor, everything doubled, the square lead on top
// rewind (37-40) drums fall away; the motif's head plays BACKWARDS on the music box, stepping down
//               through Fm, Db, C (pivot: V of F = VI of E) to B7 under a reverse swell
// A'' (41-48)   E minor again, full force → loop
// base layer = the whole piece; combat layer adds hats, kick, an upper string octave and crashes.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep, tp } from './kit';

const B = 16;
const L = 'boss';

const BARS = [
  'Em', 'Em', 'C', 'B',
  'Em', 'C', 'Am6', 'B', 'Em', 'C', 'B7b9', 'Em',
  'Em', 'C', 'Am6', 'B', 'Em', 'C', 'B7b9', 'B7',
  'C', 'D', 'Bm', 'Em', 'C', 'D', 'Ab', 'C7',
  'Fm', 'Db', 'Bbm6', 'C', 'Fm', 'Db', 'C7b9', 'Fm',
  'Fm', 'Db', 'C', 'B7',
  'Em', 'C', 'Am6', 'B', 'Em', 'C', 'B7b9', 'Em',
];
const CH: Record<string, { root: string; ost: string }> = {
  Em: { root: 'E2', ost: 'E3 B3 E4' }, C: { root: 'C2', ost: 'C3 G3 C4' }, Am6: { root: 'A1', ost: 'A3 E4 F#4' },
  B: { root: 'B1', ost: 'B2 F#3 B3' }, B7b9: { root: 'B1', ost: 'B2 A3 C4' }, B7: { root: 'B1', ost: 'B2 F#3 A3' },
  D: { root: 'D2', ost: 'D3 A3 D4' }, Bm: { root: 'B1', ost: 'B2 F#3 B3' }, Ab: { root: 'Ab1', ost: 'Ab2 Eb3 Ab3' },
  C7: { root: 'C2', ost: 'C3 G3 Bb3' }, Fm: { root: 'F2', ost: 'F3 C4 F4' }, Db: { root: 'Db2', ost: 'Db3 Ab3 Db4' },
  Bbm6: { root: 'Bb1', ost: 'Bb2 F3 G3' }, C7b9: { root: 'C2', ost: 'C3 G3 Db4' },
};
const silent = (bars: number) => m(rep('.:16 |', bars - 1) + ' .:16', B, L);

// the motif, tresillo-cut (E minor)
const MOTIF = 'B4:6 E5:6 F#5:4 | G5:12 F#5:2 E5:2 | A5:12 G5:2 F#5:2 | F#5:8 E5:2 D#5:6 | ' +
  'B4:6 E5:6 F#5:4 | G5:6 A5:6 B5:4 | C6:12 B5:2 A5:2 | G5:16';
const motif = m(MOTIF, B, L);
const motifF = tp(motif, 1, true);

const strings = cat(
  silent(4),
  motif,
  // A': the strings' halves
  m('.:16 | .:16 | A5:12 G5:2 F#5:2 | F#5:8 E5:2 D#5:6 | .:16 | .:16 | C6:12 B5:2 A5:2 | B5:8 A5:4 F#5:4', B, L),
  // B: answers
  m('.:16 | A5:1 G5:1 F#5:1 E5:1 D5:1 E5:1 F#5:1 A5:1 D6:8 | .:16 | G5:1 F#5:1 E5:1 D5:1 B4:1 D5:1 E5:1 G5:1 B5:8 |', B, L),
  m('.:16 | F#5:1 E5:1 D5:1 C5:1 A4:1 C5:1 D5:1 F#5:1 A5:8 | Eb5:6 Ab5:6 C6:4 | Bb5:8 G5:4 E5:4', B, L),
  motifF,
  silent(4),
  motif,
);

const horn = cat(
  silent(4),
  tp(motif, -12),
  m('B3:6 E4:6 F#4:4 | G4:12 F#4:2 E4:2 | .:16 | .:16 | B3:6 E4:6 F#4:4 | G4:6 A4:6 B4:4 | .:16 | .:16', B, L),
  m('E4:6 G4:6 C5:4 | .:16 | D4:6 F#4:6 B4:4 | .:16 | G4:6 C5:6 E5:4 | .:16 | Ab4:6 C5:6 Eb5:4 | E4:8 Bb4:8', B, L),
  tp(motifF, -12, true),
  // under the rewind: long tones
  m('F3:16 | Ab3:16 | G3:16 | F#3:16', B, L),
  tp(motif, -12),
);

const lead = cat(silent(28), motifF, silent(4), motif);

// the rewind: waltz head backwards, stepping down through the keys
const box = cat(silent(36), m('Ab5:4 G5:4 F5:4 C5:4 | Ab5:4 F5:4 Db5:4 C5:4 | G5:4 F5:4 E5:4 C5:4 | F#5:4 E5:4 D#5:4 B4:4', B, L), silent(8));
const rewind = cat(m('.:16 | .:16 | .:16 | x:16', B, L), silent(34), m('x:32', 32, L), silent(8));

// gears: 16th ostinato on every chord (rests under the rewind)
const ost = cat(...BARS.map((c, i) => (i >= 36 && i < 40
  ? arp([CH[c].ost], '0 . . . . . . . 1 . . . . . . .')
  : arp([CH[c].ost], '0! 1 2 1 0 1 2 1 0! 1 2 1 0 1 2 1'))));
const bass = cat(...BARS.map((c, i) => {
  const r = CH[c].root, o = tp(r, 12, true);
  if (i < 4 || (i >= 36 && i < 40)) return m(`${r}:16`, B, L);
  return m(`${r}:2 ${r}:2 ${o}:2 ${r}:2 ${r}:2 ${r}:2 ${o}:2 ${r}:2`, B, L);
}));

const taiko = cat(
  grid('X.......X.......  X.......X.......  X.......X.......  X...X...X.X.XXXX'),
  grid(rep('X.....X.....X... X.....X.....X... X.....X.....X... X.....X.....X.X.', 8)),
  grid('X............... ................ X............... X.......X.X.XXXX'),
  grid(rep('X.....X.....X... X.....X.....X... X.....X.....X... X.....X.....X.X.', 2)),
);
const snare = cat(
  grid('................ ................ ................ ........o.o.oXoX'),
  grid(rep('....X.......X... ....X.......X... ....X.......X... ....X.......X.XX', 8)),
  grid('................ ................ ................ ....o.o.oXoXXXXX'),
  grid(rep('....X.......X... ....X.......X... ....X.......X... ....X.......X.XX', 2)),
);

// ── combat ──
const hat = cat(silent(4), grid(rep('x.o.x.o.x.o.x.o.', 32)), silent(4), grid(rep('x.o.x.o.x.o.x.o.', 8)));
const kick = cat(silent(4), grid(rep('X.......X.......', 32)), silent(4), grid(rep('X.......X.......', 8)));
const ostHigh = cat(...BARS.map((c, i) => (i < 4 || (i >= 36 && i < 40)
  ? m('.:16', B, L)
  : arp([tp(CH[c].ost, 12)], '. . 2 . . . 2 . . . 2 . . . 2 1'))));
const crash = m(['.:16 | .:16 | .:16 | .:16 | x:16 |', rep('.:16 |', 15), 'x:16 |', rep('.:16 |', 7), 'x:16 |', rep('.:16 |', 11), 'x:16 |', rep('.:16 |', 6), '.:16'].join(' '), B, L);

export const boss: SongDef = {
  bpm: 152, len: 48 * B,
  tracks: [
    { inst: 'strings', p: strings, vol: 1.85, pan: 0.1 },
    { inst: 'horn', p: horn, vol: 1.55, pan: -0.1 },
    { inst: 'lead', p: lead, vol: 0.8, pan: 0.2 },
    { inst: 'box', p: box, vol: 1.2 },
    { inst: 'rewind', p: rewind, vol: 1.0 },
    { inst: 'strings', p: ost, vol: 0.9, pan: -0.25 },
    { inst: 'bass', p: bass, vol: 0.45 },
    { inst: 'taiko', p: taiko, vol: 0.85 },
    { inst: 'snare', p: snare, vol: 0.9 },
    // combat
    { inst: 'hat', layer: 'combat', p: hat, vol: 1.2, pan: 0.25 },
    { inst: 'kick', layer: 'combat', p: kick, vol: 0.85 },
    { inst: 'strings', layer: 'combat', p: ostHigh, vol: 0.9, pan: 0.3 },
    { inst: 'crash', layer: 'combat', p: crash, vol: 0.8 },
  ],
};
