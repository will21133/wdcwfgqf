// SHOP — Manman the snail ("I'm too slow for time to notice me"). G major, 4/4, 80 bpm, swung:
// the grid is triplet eighths (spb 3, 12 steps per bar), so a lazy long-short swing is 2+1.
// 16 bars (~48 s loop).
// A (1-8)   oom-pah: a bassoon plods on 1 and 3, pizzicato "pah" on 2 and 4; the celesta tune
//           dawdles, slides into notes from a semitone below, and stops for a rest in bar 4
// B (9-16)  the snail sings: a bassoon solo with a comic droop into Cm6 (borrowed iv),
//           celesta drops on beat four, a chromatic "yawn" in bar 15, then a sleepy turnaround.
// His pocket-watch shell ticks at HALF speed, of course.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep } from './kit';

const B = 12;
const L = 'shop';

const celesta = m([
  // A
  'D5:6 B4:2 C#5:1 D5:3 | E5:6 D5:2 B4:1 G4:3 | .:3 A4:2 B4:1 C5:2 D#5:1 E5:3 | D5:9 .:3 |',
  'D5:6 B4:2 C#5:1 D5:3 | G#5:6 F#5:2 E5:1 D5:3 | E5:3 C5:3 A4:3 F#4:3 | G4:6 .:6 |',
  // B: drops of dew on beat four, a yawn, a lead-in
  '.:9 G6?:3 | .:9 Eb6?:3 | .:9 D6?:3 | .:9 G#5?:3 | .:9 C6?:3 | .:9 F#6?:3 |',
  'D6:1 C#6:1 C6:1 B5:2 Bb5:1 A5:3 Ab5:3 | .:6 A5:2 G5:1 F#5:3',
].join(' '), B, L);

const bassoon = m([
  // A: oom (on 1 and 3), with lazy walk-ups
  'G2:2 .:4 D2:2 .:4 | E2:2 .:4 B1:2 .:4 | A2:2 .:4 E2:2 .:4 | D2:2 .:4 A1:2 .:1 B1:1 C#2:1 .:1 |',
  'G2:2 .:4 D2:2 .:4 | E2:2 .:4 G#2:2 .:4 | A2:2 .:4 D2:2 .:4 | G2:2 .:1 D2:2 .:1 G2:1 A2:1 B2:1 .:3 |',
  // B: the snail's song
  'E4:6 D4:2 C4:1 B3:3 | Eb4:6 D4:2 C4:1 A3:3 | D4:6 B3:2 G3:1 D4:3 | E4:6 D4:3 B3:3 |',
  'C4:6 E4:2 G4:1 A4:3 | F#4:3 A4:3 C5:2 B4:1 A4:3 | G4:12 | .:12',
].join(' '), B, L);

// "pah" on 2 and 4 (A); low pizz roots carry the bass in B
const PAH = '. . . *? . . . . . *? . .';
const pizzA = arp(['B3 D4 G4', 'B3 D4 G4', 'C4 E4 G4', 'C4 F#4 A4', 'B3 D4 G4', 'B3 D4 G#4', 'C4 E4 G4', 'B3 D4 G4'], PAH);
const pizzB = cat(
  arp(['C3 G3 C4 E4', 'C3 G3 C4 Eb4', 'B2 G3 B3 D4', 'E2 G#3 B3 D4', 'A2 G3 C4 E4', 'D3 F#3 A3 C4'], '0 . . ^? . . 1 . . ^? . .'),
  m('G2:6 D2:6 | D2:6 E2:3 F#2:3', B, L),
);
const pizz = cat(pizzA, pizzB);

const tick = grid(rep('x.....o.....', 16));
const tock = grid([rep('............', 3), '.........x..', rep('............', 3), '.........x.x', rep('............', 6), '......x.....', '............'].join(' '));

export const shop: SongDef = {
  bpm: 80, spb: 3, len: 16 * B,
  tracks: [
    { inst: 'celesta', p: celesta, vol: 2.8, pan: 0.15 },
    { inst: 'reed', p: bassoon, vol: 1.8, pan: -0.1 },
    { inst: 'pizz', p: pizz, vol: 1.6, pan: 0.25 },
    { inst: 'tick', p: tick, vol: 0.9, pan: -0.3 },
    { inst: 'tock', p: tock, vol: 1.6, pan: 0.3 },
  ],
};
