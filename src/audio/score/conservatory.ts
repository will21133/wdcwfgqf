// FLOOR 2 — The Verdigris Conservatory. Glasshouse at night, frozen moths, moonlight on copper.
// E major with a Lydian lift (A#), 6/8 at 60 dotted-quarter bpm (spb 6: 12 steps = one 6/8 bar),
// 48 bars (~96 s loop).
// intro (1-4) Emaj9 / F#/E vamp: the Lydian II-over-I shimmer, harp barcarolle, celesta dust
// A  (5-20)  glass-harmonica melody; second half turns through Am6 (borrowed iv) — the one cold draught
// B  (21-36) Ines's waltz in C# minor, in its own 3/4 rhythm against the 6/8 harp: a hemiola,
//            a memory out of step with the room; then glass calls / celesta answers with the waltz head,
//            sliding through Cmaj7 (bVI) back to B7
// A' (37-44) the melody returns, glass + celesta in octaves; outro (45-48) = intro vamp → seamless loop
// combat: 6/8 kick/snare backbeat, hats, strings "pah-pah" stabs, pulsing bass — melody stays on top.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep, tp } from './kit';
import { WALTZ } from './motif';

const B = 12;
const L = 'conservatory';
const BARC = '0 . 1 . 2 . 3 . 4 . 3 .';
const HALF = '0 . 1 . 2 .';

// harp voicings (low → high); 2-chord bars use HALF on each half
const H: Record<string, string> = {
  E9: 'E2 B2 G#3 D#4 F#4', FE: 'E2 C#3 F#3 A#3 C#4', Gm7: 'G#2 D#3 F#3 B3 D#4', Cm9: 'C#3 G#3 B3 D#4 E4',
  Amaj7: 'A2 E3 G#3 C#4 E4', A9: 'A2 E3 B3 C#4 G#4', B7s: 'B2 F#3 A3 E4', B7: 'B2 F#3 A3 D#4', Am6: 'A2 E3 F#3 C4 E4',
  EB: 'B2 G#3 B3 D#4 E4', Cm: 'C#3 G#3 C#4 E4 G#4', A: 'A2 E3 A3 C#4 E4', Fm6: 'F#2 C#3 D#3 A3 C#4',
  G: 'G#2 D#3 G#3 B#3 D#4', G7b9: 'G#2 D#3 F#3 A3 B#3', Bmaj: 'B2 F#3 B3 D#4 F#4', Cm7: 'C#3 G#3 B3 E4 G#4',
  Fm9: 'F#2 C#3 E3 A3 G#4', CM7: 'C3 G3 B3 E4 G4',
};
// choir (rootless, soft) voicings
const C: Record<string, string> = {
  E9: 'G#3+D#4+F#4', FE: 'A#3+C#4+F#4', Gm7: 'B3+D#4+F#4', Cm9: 'E3+B3+D#4', Amaj7: 'G#3+C#4+E4', A9: 'G#3+B3+C#4',
  B7s: 'A3+E4+F#4', B7: 'A3+D#4+F#4', Am6: 'A3+C4+F#4', EB: 'B3+D#4+G#4', Cm: 'G#3+C#4+E4', A: 'A3+C#4+E4',
  Fm6: 'A3+C#4+F#4', G: 'G#3+B#3+D#4', G7b9: 'B#3+F#4+A4', Bmaj: 'B3+D#4+F#4', Cm7: 'B3+E4+G#4', Fm9: 'A3+E4+G#4', CM7: 'B3+E4+G4',
};
// bar-by-bar harmony; 'X/Y' = two chords, half a bar each
const PROG = [
  'E9', 'FE', 'E9', 'FE',
  'E9', 'FE', 'E9', 'FE', 'Gm7', 'Cm9', 'Amaj7', 'B7s',
  'E9', 'FE', 'Gm7', 'Cm9', 'A9', 'Am6', 'EB', 'B7s/B7',
  'Cm', 'A', 'Fm6', 'G', 'Cm', 'A', 'G7b9', 'Cm',
  'Amaj7', 'Bmaj', 'Gm7', 'Cm7', 'Fm9', 'B7s', 'CM7', 'B7s/B7',
  'E9', 'FE', 'Gm7', 'Cm9', 'A9', 'Am6', 'EB', 'B7s/B7',
  'E9', 'FE', 'E9', 'FE',
];
const eachBar = (f: (c: string, half: boolean) => string) =>
  cat(...PROG.map((p) => p.includes('/') ? p.split('/').map((c) => f(c, true)).join(' ') : f(p, false)));

const harp = eachBar((c, half) => arp([H[c]], half ? HALF : BARC));
const choir = eachBar((c, half) => m(`${C[c]}:${half ? 6 : 12}`, half ? 6 : 12, L));

// the melody of A, second half (bars 13-20) — reused for the return
const A2 = 'E5:4 F#5:2 G#5:4 B5:2 | A#5:6 C#6:4 B5:2 | B5:4 A#5:2 G#5:4 F#5:2 | E5:6 D#5:4 C#5:2 | ' +
  'C#6:6 B5:4 G#5:2 | C6:6 B5:4 A5:2 | G#5:12 | F#5:6 D#5:6';

const glass = m([
  rep('.:12 |', 4),
  // A
  'E5:4 F#5:2 G#5:4 B5:2 | A#5:6 G#5:4 F#5:2 | G#5:4 F#5:2 E5:4 D#5:2 | C#5:12 |',
  'D#5:4 E5:2 F#5:4 B5:2 | G#5:6 D#5:6 | E5:4 F#5:2 G#5:4 C#6:2 | B5:12 |',
  A2, '|',
  // B: (waltz on the other glass track) then the calls
  rep('.:12 |', 8),
  'E5:4 G#5:2 C#6:6 | B5:12 | D#6:4 C#6:2 B5:6 | G#5:12 | A5:4 G#5:2 F#5:4 E5:2 | E5:12 | E5:4 G5:2 B5:6 | E5:6 D#5:6 |',
  // A'
  A2, '|',
  rep('.:12 |', 3), '.:12',
].join(' '), B, L);

// B: the waltz itself — glass (low) + celesta (octave above) — out of phase with the 6/8 pulse
const waltz = m(WALTZ, B, L);
const silent = (bars: number) => m(rep('.:12 |', bars - 1) + ' .:12', B, L);
const glassWaltz = cat(silent(20), tp(waltz, -8), silent(20));

const dust = '.:6 D#6:2 F#6:2 B6?:2 | .:6 C#6:2 E6:2 A#6?:2 | .:6 B5:2 D#6:2 G#6?:2 | .:6 A#5:2 C#6:2 F#6?:2';
const celesta = cat(
  m([
    dust, '|',
    // A: dust in the glass line's long notes
    '.:12 | .:12 | .:12 | .:6 A#5:2 C#6:2 F#6:2 | .:12 | .:12 | .:12 | .:6 F#6:2 E6:2 B5:2 |',
    '.:12 | .:12 | .:12 | .:12 | .:12 | .:12 | .:6 B5:2 E6:2 G#6:2 | .:12',
  ].join(' '), B, L),
  tp(waltz, 4),
  // answers: the waltz head (5-1-2) in B, then C#m, then B again
  m('.:12 | .:6 F#5:2 B5:2 C#6:2 | .:12 | .:6 G#5:2 C#6:2 D#6:2 | .:12 | .:6 F#5:2 B5:2 C#6:2 | .:6 E6?:2 G6?:2 B6?:2 | .:6 B5:2 D#6:2 F#6:2', B, L),
  tp(m(A2, B, L), 12),
  m(dust, B, L),
);

const tick = grid(rep('o.....o.....', 48));
// E pedal under the vamps (intro + first A phrase, outro)
const pedal = cat(m('E2:12 | -:12 | -:12 | -:12 | -:12 | -:12 | -:12 | -:11 .:1', B, L), silent(36), m('E2:12 | -:12 | -:12 | -:11 .:1', B, L));

// ── combat ──
const kick = grid(rep('X.....X..... X.....X..... X.....X..... X.....X...x.', 12));
const snare = grid(rep('......X..... ......X..... ......X..... ......X..o.o', 12));
const hat = grid(rep('x.o.o.x.o.o.', 48));
const stabs = eachBar((c, half) => arp([H[c].split(' ').slice(2).join(' ')], half ? '. . *? . *? .' : '. . *? . *? . . . *? . *? .'));
const pulse = eachBar((c, half) => {
  const low = H[c].split(' ')[0];
  const r = low.endsWith('3') ? tp(low, -12) : low; // keep the pulse in octave 2
  const five = tp(r, 7);
  return half ? m(`${r}:3 ${r}:3`, 6, L) : m(`${r}:4 ${r}:2 ${r}:4 ${five}:2`, 12, L);
});

export const conservatory: SongDef = {
  bpm: 60, spb: 6, len: 48 * B,
  tracks: [
    { inst: 'glass', p: glass, vol: 1.6 },
    { inst: 'glass', p: glassWaltz, vol: 1.4, pan: -0.1 },
    { inst: 'celesta', p: celesta, vol: 1.6, pan: 0.2 },
    { inst: 'harp', p: harp, vol: 0.75, pan: -0.25 },
    { inst: 'choir', p: choir, vol: 0.9 },
    { inst: 'tick', p: tick, vol: 0.5, pan: 0.3 },
    { inst: 'drone', p: pedal, vol: 0.5 },
    // combat
    { inst: 'kick', layer: 'combat', p: kick, vol: 0.85 },
    { inst: 'snare', layer: 'combat', p: snare, vol: 1.2 },
    { inst: 'hat', layer: 'combat', p: hat, vol: 0.8, pan: 0.2 },
    { inst: 'strings', layer: 'combat', p: stabs, vol: 1.6, pan: 0.15 },
    { inst: 'bass', layer: 'combat', p: pulse, vol: 0.45 },
  ],
};
