// DEATH — Tick stops ("winding down"). A minor, 3/4, 60 bpm, 12 bars (~36 s slow loop).
// The music box tries the waltz's head (E A B C) and runs out of spring — each note later than the
// last — then unwinds it backwards (B … A) while the clock's ticks thin out and stop.
// Am(add9) | Fmaj7 | Dm9 | E7sus4 — three bars each; the suspension never resolves before the loop.
import type { SongDef } from '../../engine/audio/music';
import { m, grid, rep } from './kit';

const B = 12;
const U = 36; // one chord = three bars
const L = 'death';

const pad = m('A3+B3+E4:36 | A3+C4+E4:36 | F3+A3+E4:36 | A3+B3+D4:35 .:1', U, L);
const drone = m('A1:36 | F1:36 | D2:36 | E1:35 .:1', U, L);
const line = m('C5?:36 | C5?:36 | A4?:36 | B4?:35 .:1', U, L);
const box = m('E5:6 A5:6 | .:2 B5:10 | .:9 C6:3 | .:12 | .:12 | .:12 | .:6 B5?:6 | .:12 | .:12 | A5?:12 | .:12 | .:12', B, L);
const tick = grid('x...x...x... x.......x... x........... ........x... ' + rep('............', 8));
const bell = m('A2?:12 | .:12 | .:12 | .:12 | .:12 | .:12 | D3?:12 | .:12 | .:12 | .:12 | .:12 | .:12', B, L);

export const death: SongDef = {
  bpm: 60, len: 12 * B,
  tracks: [
    { inst: 'box', p: box, vol: 1.1 },
    { inst: 'pad', p: pad, vol: 0.6 },
    { inst: 'drone', p: drone, vol: 0.5 },
    { inst: 'bowed', p: line, vol: 1.3, pan: 0.2 },
    { inst: 'tick', p: tick, vol: 0.8, pan: 0.3 },
    { inst: 'towerbell', p: bell, vol: 0.45, pan: -0.2 },
  ],
};
