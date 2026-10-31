// VICTORY — the Great Clock strikes midnight; time flows again. A minor → A major, 3/4, 76 bpm,
// 18 bars (~43 s, loops back to the first strike).
// bars 1-12  twelve tower-bell strikes, one per bar.
//            1-4: strings play the waltz's first phrase in A minor, as it always was (no ticking:
//                 the city is still frozen)
//            5-8: the same phrase in A MAJOR on the music box — and the clock starts ticking again
//            9-12: the answer, with a borrowed Dm6 under the high F (the old grief, remembered,
//                 not undone) — the 12th strike lands on A major
// bars 13-16 celesta peals; the waltz's head one last time, and for the first time ever it walks
//            down to the root: D6 C#6 B5 | A5  (D → E → A, a real cadence)
// bars 17-18 A major rings out.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep, tp } from './kit';

const B = 12;
const L = 'victory';

const minorPhrase = 'E4:4 A4:4 B4:4 | C5:8 B4:2 A4:2 | D5:8 C5:2 B4:2 | B4:6 A4:2 G#4:4';
const majorTune = 'E5:4 A5:4 B5:4 | C#6:8 B5:2 A5:2 | D6:8 C#6:2 B5:2 | B5:6 A5:2 G#5:4 | ' +
  'E5:4 A5:4 B5:4 | C#6:4 D6:4 E6:4 | F6:8 E6:2 D6:2 | C#6:12';
const home = 'E5:4 A5:4 B5:4 | C#6:12 | D6:4 C#6:4 B5:4 | A5:12';

const box = m([rep('.:12 |', 4), majorTune, '|', home, '|', '.:12 | .:12'].join(' '), B, L);
const strings = cat(
  m(minorPhrase, B, L),
  tp(m(majorTune, B, L), -12),
  m('C#5:12 | C#5:12 | F#4:8 G#4:4 | A4:12 | A4+C#5+E5:12 | -:11 .:1', B, L),
);

const CH: Record<string, { pad: string; harp: string; bass: string }> = {
  Am: { pad: 'A3+C4+E4', harp: 'A2 E3 A3 C4 E4', bass: 'A2' },
  F: { pad: 'A3+C4+F4', harp: 'F2 C3 F3 A3 C4', bass: 'F2' },
  Dm6: { pad: 'A3+B3+D4+F4', harp: 'D3 A3 B3 D4 F4', bass: 'D2' },
  E: { pad: 'G#3+B3+E4', harp: 'E2 B2 E3 G#3 B3', bass: 'E2' },
  A: { pad: 'A3+C#4+E4', harp: 'A2 E3 A3 C#4 E4', bass: 'A2' },
  Fsm: { pad: 'A3+C#4+F#4', harp: 'F#2 C#3 F#3 A3 C#4', bass: 'F#2' },
  Bm7: { pad: 'A3+D4+F#4', harp: 'B2 F#3 A3 D4 F#4', bass: 'B1' },
  E7s: { pad: 'A3+B3+E4', harp: 'E2 B2 D3 A3', bass: 'E2' },
  Dmaj9: { pad: 'F#3+A3+C#4+E4', harp: 'D2 A2 F#3 C#4 E4', bass: 'D2' },
  D: { pad: 'A3+D4+F#4', harp: 'D3 A3 D4 F#4', bass: 'D2' },
};
// bar harmony; 'X/Y' = 8 + 4 steps
const BARS = ['Am', 'F', 'Dm6', 'E', 'A', 'Fsm', 'Bm7', 'E7s/E', 'A', 'Dmaj9', 'Dm6', 'A', 'A', 'Fsm', 'D/E', 'A', 'A', 'A'];
const each = (f: (c: string, n: number, i: number) => string) =>
  cat(...BARS.map((b, i) => (b.includes('/') ? f(b.split('/')[0], 8, i) + ' ' + f(b.split('/')[1], 4, i) : f(b, 12, i))));

const pad = each((c, n, i) => (i === 17 ? m(`${CH[c].pad}:11 .:1`, 12, L) : m(`${CH[c].pad}:${n}`, n, L)));
const choir = each((c, n, i) => (i < 4 || i > 16 ? m(`.:${n}`, n, L) : m(`${CH[c].pad}?:${n}`, n, L)));
const bass = each((c, n) => m(`${CH[c].bass}:${n}`, n, L));
const harp = each((c, n, i) => (i < 4 ? m(`.:${n}`, n, L)
  : i >= 16 ? (i === 16 ? arp([CH[c].harp], '0 1 2 3 4 . . . . . . .') : m(`.:${n}`, n, L))
  : arp([CH[c].harp], n === 12 ? '0 . 1 . 2 . 3 . 4 . 3 .' : n === 8 ? '0 . 1 . 2 . 3 .' : '0 . 2 .')));

// twelve strikes, then a single high bell as the city wakes
const bells = m([rep('A2!:12 |', 12), '.:12 | .:12 | .:12 | .:12 | E4?:12 | .:12'].join(' '), B, L);
const peal = m([rep('.:12 |', 12),
  'A6:2 E6:2 C#6:2 A5:2 E6:2 C#6:2 | F#6:2 C#6:2 A5:2 F#5:2 C#6:2 A5:2 | D6:2 A5:2 F#5:2 D5:2 B5:2 G#5:2 | A5:2 C#6:2 E6:2 A6:6 |',
  '.:12 | .:12'].join(' '), B, L);
// the clock starts again with the major key
const tick = grid(rep('............', 4) + ' ' + rep('x...o...o...', 13) + ' ' + 'o...........');

export const victory: SongDef = {
  bpm: 76, len: BARS.length * B,
  tracks: [
    { inst: 'towerbell', p: bells, vol: 0.6 },
    { inst: 'box', p: box, vol: 1.1 },
    { inst: 'bowed', p: strings, vol: 1.7, pan: 0.15 },
    { inst: 'harp', p: harp, vol: 0.7, pan: -0.25 },
    { inst: 'celesta', p: peal, vol: 1.4, pan: 0.3 },
    { inst: 'pad', p: pad, vol: 0.5 },
    { inst: 'choir', p: choir, vol: 1.2 },
    { inst: 'bass', p: bass, vol: 0.35 },
    { inst: 'tick', p: tick, vol: 0.7, pan: 0.3 },
  ],
};
