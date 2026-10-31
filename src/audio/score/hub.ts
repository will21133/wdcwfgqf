// HUB — Ines's workshop. F major, 4/4, 72 bpm, 32 bars (~107 s loop). Warm, close, unhurried.
// A (1-8)   celesta lullaby over a descending scale bass (F E D C Bb A G C) and harp
// A' (9-16) the music box takes the tune, a cello sings parallel tenths, the celesta echoes
//           the ends of phrases (the past answering the present)
// B (17-24) Ines's waltz remembered in major, straightened into 4/4; the borrowed Bbm6 under
//           the high Db is the one shadow in the room
// C (25-32) D minor duet: cello calls, celesta answers; then home via C7.
// The grandfather clock (tick on 1 & 3, tock on 2 & 4) never stops here.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, arp, cat, rep } from './kit';

const B = 16;
const L = 'hub';
const UPDOWN = '0 . 1 . 2 . 3 . 4 . 3 . 2 . 1 .';
const HALF = '0 . 1 . 2 . 3 .';
const LILT = '0 . . 1 . . 2 . . 3 . . 4 . 3 .';

const H = {
  F: 'F3 C4 F4 A4 C5', CE: 'E3 G3 C4 E4 G4', Dm7: 'D3 A3 C4 F4 A4', Am7C: 'C3 G3 A3 E4 G4', Bbmaj7: 'Bb2 F3 A3 D4 F4',
  FA: 'A2 F3 A3 C4 F4', Gm7: 'G2 D3 F3 Bb3 D4', C7sus: 'C3 G3 Bb3 F4', C7: 'C3 G3 Bb3 E4', Gm7h: 'G2 D3 F3 Bb3',
  Bbm6: 'Bb2 F3 G3 Db4 F4', Dm: 'D3 A3 D4 F4 A4', A7sus: 'A2 E3 G3 D4', A7: 'A2 E3 G3 C#4', C7full: 'C3 G3 Bb3 E4 G4',
};

const harp = cat(
  arp([H.F, H.CE, H.Dm7, H.Am7C, H.Bbmaj7, H.FA, H.Gm7], UPDOWN), arp([H.C7sus, H.C7], HALF),
  arp([H.F, H.CE, H.Dm7, H.Am7C, H.Bbmaj7, H.FA], UPDOWN), arp([H.Gm7h, H.C7], HALF), arp([H.F], UPDOWN),
  arp([H.F, H.Dm7, H.Gm7, H.C7full, H.F, H.Bbmaj7, H.Bbm6, H.F], UPDOWN),
  arp([H.Dm, H.Bbmaj7, H.Gm7], LILT), arp([H.A7sus, H.A7], HALF),
  arp([H.Dm, H.Bbmaj7, H.Gm7], LILT), arp([H.C7sus, H.C7], HALF),
);

const celesta = m([
  // A: the lullaby
  'A5:6 G5:2 F5:4 C5:4 | E5:6 F5:2 G5:8 | F5:6 E5:2 D5:4 A4:4 | C5:6 D5:2 E5:8 |',
  'D5:6 E5:2 F5:4 A5:4 | C6:8 A5:4 F5:4 | Bb5:6 A5:2 G5:4 D5:4 | F5:8 E5:8 |',
  // A': echoes of the box's phrase endings
  '.:16 | .:10 G6?:2 F6?:2 E6?:2 | .:16 | .:10 E6?:2 D6?:2 C6?:2 |',
  '.:16 | .:16 | .:16 | .:8 A6?:2 G6?:2 F6?:4 |',
  // B: silent — the music box remembers alone
  rep('.:16 |', 8),
  // C: answers to the cello
  '.:10 A5:2 D6:2 F6:2 | .:10 F6:2 D6:2 Bb5:2 | .:10 G5:2 Bb5:2 D6:2 | .:10 E6:2 C#6:2 A5:2 |',
  '.:10 D6:2 F6:2 A6:2 | .:10 F6:2 D6:2 A5:2 | .:10 Bb5:2 A5:2 G5:2 | .:10 G5:2 Bb5:2 E6:2',
].join(' '), B, L);

const box = m([
  rep('.:16 |', 8),
  // A': the lullaby on the music box
  'A5:6 G5:2 F5:4 C5:4 | E5:6 F5:2 G5:8 | F5:6 E5:2 D5:4 A4:4 | C5:6 D5:2 E5:8 |',
  'D5:6 E5:2 F5:4 A5:4 | C6:8 A5:4 F5:4 | Bb5:4 A5:4 G5:4 E5:4 | F5:16 |',
  // B: Ines's waltz, in major, in four
  '.:4 C5:4 F5:4 G5:4 | A5:8 G5:4 F5:4 | Bb5:8 A5:4 G5:4 | G5:8 F5:4 E5:4 |',
  '.:4 C5:4 F5:4 G5:4 | A5:4 Bb5:4 C6:8 | Db6:8 C6:4 Bb5:4 | A5:16 |',
  rep('.:16 |', 7), '.:16',
].join(' '), B, L);

const cello = m([
  rep('.:16 |', 8),
  // A': tenths above the bass
  'A3:16 | G3:16 | F3:16 | E3:16 | D3:16 | C3:16 | Bb2:16 | A2:16 |',
  rep('.:16 |', 8),
  // C: the cello's song
  'F4:6 E4:2 D4:8 | D4:6 C4:2 Bb3:8 | Bb3:6 C4:2 D4:8 | D4:8 C#4:8 |',
  'F4:6 G4:2 A4:8 | Bb4:6 A4:2 F4:8 | G4:6 F4:2 D4:8 | F4:8 E4:8',
].join(' '), B, L);

const pad = m([
  rep('.:16 |', 8),
  'A3+C4+F4:16 | G3+C4+E4:16 | A3+C4+F4:16 | G3+C4+E4:16 | A3+D4+F4:16 | A3+C4+F4:16 | Bb3+D4+F4:8 Bb3+C4+E4:8 | A3+C4+F4:16 |',
  'A3+C4+F4:16 | A3+C4+F4:16 | Bb3+D4+F4:16 | Bb3+C4+E4:16 | A3+C4+F4:16 | A3+D4+F4:16 | G3+Db4+F4:16 | A3+C4+F4:16 |',
  'A3+D4+F4:16 | A3+D4+F4:16 | Bb3+D4+F4:16 | G3+D4+E4:8 G3+C#4+E4:8 | A3+D4+F4:16 | A3+D4+F4:16 | Bb3+D4+F4:16 | Bb3+C4+F4:8 Bb3+C4+E4:8',
].join(' '), B, L);

const bass = m([
  'F2:8 C3:8 | E2:8 C3:8 | D2:8 A2:8 | C2:8 G2:8 | Bb1:8 F2:8 | A1:8 F2:8 | G1:8 D2:8 | C2:8 C2:8 |',
  'F2:8 C3:8 | E2:8 C3:8 | D2:8 A2:8 | C2:8 G2:8 | Bb1:8 F2:8 | A1:8 F2:8 | G1:8 C2:8 | F2:16 |',
  'F2:8 C3:8 | D2:8 A2:8 | G1:8 D2:8 | C2:8 G2:8 | F2:8 C3:8 | Bb1:8 F2:8 | Bb1:8 Db2:8 | F2:8 C2:8 |',
  'D2:8 A2:8 | Bb1:8 F2:8 | G1:8 D2:8 | A1:8 E2:8 | D2:8 A2:8 | Bb1:8 F2:8 | G1:8 D2:8 | C2:8 C2:8',
].join(' '), B, L);

export const hub: SongDef = {
  bpm: 72, len: 32 * B,
  tracks: [
    { inst: 'celesta', p: celesta, vol: 2.2, pan: 0.1 },
    { inst: 'box', p: box, vol: 1.1 },
    { inst: 'bowed', p: cello, vol: 1.6, pan: 0.2 },
    { inst: 'harp', p: harp, vol: 0.75, pan: -0.2 },
    { inst: 'pad', p: pad, vol: 0.5 },
    { inst: 'bass', p: bass, vol: 0.38 },
    { inst: 'tick', p: grid(rep('x.......x.......', 32)), vol: 0.6, pan: 0.35 },
    { inst: 'tock', p: grid(rep('....x.......x...', 32)), vol: 0.7, pan: 0.35 },
  ],
};
