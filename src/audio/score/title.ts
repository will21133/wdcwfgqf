// TITLE — "Ines's Waltz". A minor, 3/4, 88 bpm, 32 bars (~65 s loop).
// Intro (1-4) clock + harp | A (5-12) music box alone over an oom-pah-pah pluck waltz, strings
// counter-line | A' (13-20) music box harmonised in thirds/sixths, strings sing the tune an octave
// below | B (21-28) strings take the B strain (C major with the borrowed Fm), music box answers in
// the gaps | coda (29-32) the head once more, then played backwards — rewound — and the clock stalls.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep } from './kit';
import { WALTZ, WALTZ_B } from './motif';

const B = 12; // steps per 3/4 bar
const L = 'title';
const FLOW = '0 . 1 . 2 . 3 . 4 . 3 .';

// harp voicings
const H = {
  Am: 'A2 E3 A3 C4 E4', F: 'F2 C3 F3 A3 C4', Fmaj7: 'F2 C3 F3 A3 E4', Dm7: 'D2 A2 D3 F3 C4',
  Dm6: 'D3 A3 B3 D4 F4', E: 'E2 B2 E3 G#3 B3', E7b9: 'E2 B2 D3 G#3 F4', C: 'C3 G3 C4 E4 G4',
  GB: 'B2 G3 B3 D4 G4', EmG: 'G2 E3 G3 B3 E4', FmAb: 'Ab2 F3 Ab3 C4 F4', CG: 'G2 E3 G3 C4 E4', E7: 'E2 B2 D3 G#3 B3',
};

const harp = cat(
  // intro
  arp([H.Am, H.Fmaj7, H.Dm7], FLOW), m('E2:2 B2:2 D3:2 A3:2 G#3:2 B3:2', B, L),
  // A: harp rests (pluck waltz instead)
  m(rep('.:12 |', 7) + ' .:12', B, L),
  // A'
  arp([H.Am, H.F, H.Dm6, H.E, H.Am, H.F, H.E7b9], FLOW), m('A2:2 E3:2 A3:2 C4:2 G2:2 B3:2', B, L),
  // B
  arp([H.C, H.GB, H.Am, H.EmG, H.F, H.FmAb, H.CG, H.E7], FLOW),
  // coda: thinning out
  arp([H.Am, H.F, H.Dm6], '0 . . . . . 2? . . . . .'), m('E2:6 B2?:6', B, L),
);

// oom-pah-pah for the first A strain
const pluck = cat(
  m(rep('.:12 |', 3) + ' .:12', B, L),
  arp(['A2 A3 C4 E4', 'F2 A3 C4 F4', 'D2 A3 B3 F4', 'E2 G#3 B3 E4', 'A2 A3 C4 E4', 'F2 A3 C4 F4', 'E2 G#3 D4 F4', 'A2 A3 C4 E4'],
    '. . . . ^? . . . ^? . . .'),
  m(rep('.:12 |', 19) + ' .:12', B, L),
);

const box = m([
  rep('.:12 |', 4),
  WALTZ, '|',
  // A': the tune harmonised like a real music-box comb
  'E5+C5:4 A5+C5:4 B5+E5:4 | C6+A5:8 B5+F5:2 A5+F5:2 | D6+F5:8 C6+A5:2 B5+D5:2 | B5+E5:6 A5+E5:2 G#5+E5:4 |',
  'E5+C5:4 A5+C5:4 B5+E5:4 | C6+A5:4 D6+A5:4 E6+C6:4 | F6+D6:8 E6+G#5:2 D6+B5:2 | C6+E5:8 B5+D5:4 |',
  // B: answers in the strings' long notes
  '.:12 | .:2 G5:2 B5:2 D6:2 .:4 | .:12 | .:4 E6:2 D6:2 B5:2 G5:2 |',
  '.:12 | .:2 F5:2 Ab5:2 C6:2 .:4 | .:12 | .:4 G#5:2 B5:2 D6:2 E6:2 |',
  // coda: the head, then the same notes in reverse — a rewind
  'E5:4 A5:4 B5:4 | C6:12 | B5?:4 A5?:4 E5?:4 | .:12',
].join(' '), B, L);

const strings = m([
  rep('.:12 |', 4),
  // A: counter-line in contrary motion
  'A4?:12 | A4?:8 C5?:4 | F5?:8 D5?:4 | E5?:6 D5?:2 B4?:4 | C5?:12 | C5?:4 B4?:4 A4?:4 | G#4?:8 B4?:4 | A4?:12 |',
  // A': the tune, an octave down
  'E4:4 A4:4 B4:4 | C5:8 B4:2 A4:2 | D5:8 C5:2 B4:2 | B4:6 A4:2 G#4:4 | E4:4 A4:4 B4:4 | C5:4 D5:4 E5:4 | F5:8 E5:2 D5:2 | C5:8 B4:4 |',
  WALTZ_B, '|',
  'C5?:12 | C5?:12 | B4?:12 | B4?:8 G#4?:4',
].join(' '), B, L);

const pad = m([
  'A3+C4+E4:12 | A3+C4+E4:12 | A3+C4+F4:12 | A3+B3+D4:8 G#3+B3+D4:4 |',
  'A3+C4+E4:12 | A3+C4+F4:12 | A3+B3+D4+F4:12 | G#3+B3+E4:12 | A3+C4+E4:12 | A3+C4+F4:12 | G#3+B3+D4+F4:12 | A3+C4+E4:12 |',
  'A3+C4+E4:12 | A3+C4+F4:12 | A3+B3+D4+F4:12 | G#3+B3+E4:12 | A3+C4+E4:12 | A3+C4+F4:12 | G#3+B3+D4+F4:12 | A3+C4+E4:8 G3+B3+D4:4 |',
  'G3+C4+E4:12 | G3+B3+D4:12 | A3+C4+E4:12 | G3+B3+E4:12 | A3+C4+F4:12 | Ab3+C4+F4:12 | G3+C4+E4:12 | G#3+B3+D4:12 |',
  'A3+C4+E4:12 | A3+C4+F4:12 | A3+B3+D4+F4:12 | A3+B3+D4:8 G#3+B3+D4:4',
].join(' '), B, L);

const bass = m([
  'A2:12 | F2:12 | D2:12 | E2:12 |',
  'A2:12 | F2:12 | D2:12 | E2:12 | A2:12 | F2:12 | E2:12 | A2:12 |',
  'A2:12 | F2:12 | D2:12 | E2:12 | A2:12 | F2:12 | E2:12 | A2:8 G2:4 |',
  'C3:12 | B2:12 | A2:12 | G2:12 | F2:12 | Ab2:12 | G2:12 | E2:12 |',
  'A2:12 | F2:12 | D2:12 | E2:12',
].join(' '), B, L);

const tick = cat(
  grid(rep('x...o...o...', 4)),
  grid(rep('o...o...o...', 24)),
  grid('x...o...o... o...o...o... o.......o... o...........'),
);

const bell = m(['A3:12 |', rep('.:12 |', 19), 'C4?:12 |', rep('.:12 |', 7), 'A3?:12 |', rep('.:12 |', 2), '.:12'].join(' '), B, L);

export const title: SongDef = {
  bpm: 88, len: 32 * B,
  tracks: [
    { inst: 'box', p: box, vol: 1.0 },
    { inst: 'bowed', p: strings, vol: 1.9, pan: 0.15 },
    { inst: 'harp', p: harp, vol: 0.7, pan: -0.25 },
    { inst: 'pluck', p: pluck, vol: 0.9, pan: -0.15 },
    { inst: 'pad', p: pad, vol: 0.55 },
    { inst: 'bass', p: bass, vol: 0.4 },
    { inst: 'tick', p: tick, vol: 0.8, pan: 0.3 },
    { inst: 'towerbell', p: bell, vol: 0.5 },
  ],
};
