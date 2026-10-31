// FLOOR 3 — The Sand Archive. Shelves drowned in sand, falling pages, sand-falls that never land.
// G minor / G Dorian (E natural) with a Phrygian shadow (Ab), 4/4, 84 bpm, 40 bars (~114 s loop).
// The texture is mostly air: a G pedal, two celesta "sand" voices trickling left and right
// (deterministic random walks over the chord tones — every grain falls the same way each loop),
// a clarinet-like reed singing a slow, sparse line.
// intro (1-4)  pedal + sand, Dorian C/G colour
// A (5-20)     reed melody; D7(b9) with its augmented second (F#–Eb); the second half lifts to Abmaj7
// B (21-32)    a reversed swell (the Archivist rewinding) and Ines's waltz, found in an old record:
//              the music box plays it in G minor, straightened into 4/4; then the Phrygian Ab drifts back
// A' (33-40)   the reed's second phrase, harp thickening, another rewind → loop
// combat: maqsum groove (taiko "dum", woodblock "tek"), 16th shaker, Phrygian bass ostinato,
//         spiccato strings — sand stirred into a storm.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep, sand, tp } from './kit';

const B = 16;
const L = 'archive';

// bar-by-bar harmony
const PROG = [
  'Gm9', 'Gm9', 'CG', 'Gm9',
  'Gm9', 'Gm9', 'CG', 'CG', 'Ebmaj7', 'Cm7', 'D7s', 'D7b9',
  'Gm9', 'Gm9', 'Bbmaj7', 'Ebmaj7', 'Abmaj7', 'Abmaj7', 'D7s', 'D7',
  'Gm', 'Eb', 'Cm6', 'D', 'Gm', 'Eb', 'D7b9', 'Gm', 'Abmaj7', 'Abmaj7', 'Cm9', 'D7s',
  'Gm9', 'Gm9', 'Bbmaj7', 'Ebmaj7', 'Abmaj7', 'Abmaj7', 'D7s', 'D7',
];
// high chord tones for the sand (celesta), mid voicings for pad/harp, roots for bass
const SAND: Record<string, string> = {
  Gm9: 'G5 A5 Bb5 D6 F6 A6', CG: 'G5 C6 D6 E6 G6 C7', Ebmaj7: 'G5 Bb5 D6 Eb6 G6 Bb6', Cm7: 'G5 Bb5 C6 Eb6 G6 C7',
  D7s: 'G5 A5 C6 D6 G6 A6', D7b9: 'F#5 A5 C6 Eb6 F#6 A6', D7: 'F#5 A5 C6 D6 F#6 A6', Bbmaj7: 'F5 A5 Bb5 D6 F6 A6',
  Abmaj7: 'G5 Ab5 C6 Eb6 G6 C7', Gm: 'G5 Bb5 D6 G6 Bb6 D7', Eb: 'G5 Bb5 Eb6 G6 Bb6 Eb7', Cm6: 'G5 A5 C6 Eb6 G6 A6',
  D: 'F#5 A5 D6 F#6 A6 D7', Cm9: 'G5 Bb5 D6 Eb6 G6 Bb6',
};
const PAD: Record<string, string> = {
  Gm9: 'Bb3+D4+F4', CG: 'C4+E4+G4', Ebmaj7: 'Bb3+D4+G4', Cm7: 'Bb3+Eb4+G4', D7s: 'A3+C4+G4', D7b9: 'A3+C4+Eb4+F#4', D7: 'A3+C4+F#4',
  Bbmaj7: 'A3+D4+F4', Abmaj7: 'Ab3+C4+Eb4', Gm: 'Bb3+D4+G4', Eb: 'Bb3+Eb4+G4', Cm6: 'A3+C4+Eb4', D: 'A3+D4+F#4', Cm9: 'Bb3+D4+Eb4',
};
const ROOT: Record<string, string> = {
  Gm9: 'G2', CG: 'G2', Ebmaj7: 'Eb2', Cm7: 'C2', D7s: 'D2', D7b9: 'D2', D7: 'D2', Bbmaj7: 'Bb1', Abmaj7: 'Ab1',
  Gm: 'G2', Eb: 'Eb2', Cm6: 'C2', D: 'D2', Cm9: 'C2',
};

const sandL = sand(PROG.map((c) => SAND[c]), B, 1729, 0.32, 2);
const sandR = sand(PROG.map((c) => SAND[c]), B, 4242, 0.3, 1).split(' ')
  .map((tk, i) => (i % 2 === 0 ? '.' : tk)).join(' '); // odd 16ths only: the grains interleave L/R
const pad = cat(...PROG.map((c) => m(`${PAD[c]}:16`, B, L)));

// the reed (clarinet / duduk colour)
const A1 = 'D5:8 C5:2 Bb4:2 A4:4 | Bb4:12 .:4 | E5:8 D5:2 C5:2 A4:4 | G4:12 .:4 | ' +
  'G5:8 F5:2 Eb5:2 D5:4 | Eb5:6 D5:2 C5:8 | G4:4 A4:4 C5:4 Bb4:4 | A4:4 F#4:4 Eb5:8';
const A2 = 'D5:8 C5:2 Bb4:2 A4:4 | Bb4:4 C5:4 D5:8 | F5:6 D5:2 Bb4:4 A4:4 | G4:12 .:4 | ' +
  'C6:8 Bb5:2 Ab5:2 G5:4 | Eb5:12 .:4 | G5:6 F5:2 A5:8 | F#5:8 D5:4 A4:4';
const reed = m([
  rep('.:16 |', 4), A1, '|', A2, '|',
  rep('.:16 |', 12),
  A2,
].join(' '), B, L);

// Ines's waltz in G minor (4/4 version, as in the hub) on the music box — an old recording
const box = m([
  rep('.:16 |', 20),
  '.:4 D5:4 G5:4 A5:4 | Bb5:8 A5:4 G5:4 | C6:8 Bb5:4 A5:4 | A5:8 G5:4 F#5:4 |',
  '.:4 D5:4 G5:4 A5:4 | Bb5:4 C6:4 D6:8 | Eb6:8 D6:4 C6:4 | Bb5:16 |',
  // echoes of its head, slower and slower, as the sand covers it
  '.:4 C6?:4 Ab5?:4 G5?:4 | .:16 | .:8 G5?:4 Bb5?:4 | .:16 |',
  rep('.:16 |', 7), '.:16',
].join(' '), B, L);

// low harp: sparse in A, a slow broken chord under the waltz, fuller in A'
const harpChord = (c: string) => `${ROOT[c]} ${tp(ROOT[c], 7)} ${tp(ROOT[c], 12)} ${PAD[c].split('+').join(' ')}`;
const harp = cat(
  ...PROG.slice(0, 20).map((c, i) => arp([harpChord(c)], i % 2 === 0 ? '0 . . . . . 1 . . . . . . . . .' : '0 . . . . . . . 2 . . . . . . .')),
  ...PROG.slice(20, 32).map((c) => arp([harpChord(c)], '0 . . . 1 . . . 2 . . . 3 . . .')),
  ...PROG.slice(32).map((c) => arp([harpChord(c)], '0 . . 1 . . 2 . . 3 . . 4 . 5 .')),
);

// the pedal: G, moving to D only under the dominants
const DRONE = PROG.map((c) => (c.startsWith('D') ? 'D2' : c.startsWith('Ab') ? 'Ab1' : 'G2'));
const drone = (() => {
  const out: string[] = [];
  for (let i = 0; i < DRONE.length; i++) {
    const tie = i > 0 && DRONE[i] === DRONE[i - 1];
    const last = i === DRONE.length - 1 || DRONE[i + 1] !== DRONE[i];
    out.push(m(`${tie ? '-' : DRONE[i]}:${last ? 15 : 16}${last ? ' .:1' : ''}`, B, L));
  }
  return cat(...out);
})();

const shaker = grid(rep('....o.......o... ........o.....o.', 20));
const rewind = m([rep('.:16 |', 19), 'x:16 |', rep('.:16 |', 11), 'x:16 |', rep('.:16 |', 7), 'x:16'].join(' '), B, L);

// ── combat ──
const dum = grid(rep('X.......X....... X.......X.....x.', 20));
const tek = grid(rep('..x...x.....x... ..x...x.....x.x.', 20));
const shakerFast = grid(rep('x.o.x.oox.o.x.oo', 40));
// Phrygian bass ostinato: per chord, [upper neighbour (a quick offbeat flick), lower neighbour, fifth]
const NB: Record<string, [string, string, string]> = {
  Gm9: ['Ab2', 'F2', 'D3'], Gm: ['Ab2', 'F2', 'D3'], CG: ['A2', 'E2', 'D3'], Ebmaj7: ['F2', 'C2', 'Bb2'], Cm7: ['D2', 'Bb1', 'G2'],
  Cm6: ['D2', 'G1', 'G2'], Cm9: ['D2', 'Bb1', 'G2'], D7s: ['E2', 'C2', 'A2'], D7: ['E2', 'C2', 'A2'], D7b9: ['Eb2', 'C2', 'A2'],
  D: ['E2', 'A1', 'A2'], Bbmaj7: ['C2', 'G1', 'F2'], Abmaj7: ['Bb1', 'F1', 'Eb2'], Eb: ['F2', 'C2', 'Bb2'],
};
const bassLine = cat(...PROG.map((c) => {
  const r = ROOT[c], [up, down, five] = NB[c];
  return m(`${r}:3 ${r}:1 ${r}:2 ${up}:1 ${r}:1 ${down}:3 ${r}:3 ${five}:2`, B, L);
}));
// spiccato strings on the plain triad (no 7ths/9ths: they'd grind against the pad in 16ths)
const TRIAD: Record<string, string> = {
  Gm9: 'G4 Bb4 D5', Gm: 'G4 Bb4 D5', CG: 'G4 C5 E5', Ebmaj7: 'G4 Bb4 Eb5', Cm7: 'G4 C5 Eb5', Cm6: 'G4 C5 Eb5', Cm9: 'G4 C5 Eb5',
  D7s: 'A4 D5 G5', D7: 'A4 D5 F#5', D7b9: 'A4 D5 F#5', D: 'A4 D5 F#5', Bbmaj7: 'F4 Bb4 D5', Abmaj7: 'Ab4 C5 Eb5', Eb: 'G4 Bb4 Eb5',
};
const spicc = cat(...PROG.map((c) => arp([TRIAD[c]], '0! 1? 2? 1? 0 1? 2? 1? 0! 1? 2? 1? 0 1? 2 1?')));

export const archive: SongDef = {
  bpm: 84, len: 40 * B,
  tracks: [
    { inst: 'reed', p: reed, vol: 1.95, pan: 0.05 },
    { inst: 'box', p: box, vol: 1.45, pan: -0.1 },
    { inst: 'celesta', p: sandL, vol: 1.4, pan: -0.55 },
    { inst: 'celesta', p: sandR, vol: 1.4, pan: 0.55 },
    { inst: 'harp', p: harp, vol: 0.85, pan: -0.15 },
    { inst: 'pad', p: pad, vol: 0.5 },
    { inst: 'drone', p: drone, vol: 0.4 },
    { inst: 'shaker', p: shaker, vol: 2.4, pan: 0.3 },
    { inst: 'rewind', p: rewind, vol: 1.0 },
    // combat
    { inst: 'taiko', layer: 'combat', p: dum, vol: 0.55 },
    { inst: 'tock', layer: 'combat', p: tek, vol: 2.6, pan: -0.2 },
    { inst: 'shaker', layer: 'combat', p: shakerFast, vol: 2.2, pan: 0.25 },
    { inst: 'bass', layer: 'combat', p: bassLine, vol: 0.4 },
    { inst: 'strings', layer: 'combat', p: spicc, vol: 1.3, pan: 0.15 },
  ],
};
