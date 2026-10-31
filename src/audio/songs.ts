// The score. Each song: base layer (exploration) + combat layer (adaptive).
import type { SongDef } from '../engine/audio/music';
import { EXTRA_SONGS } from './score';

/** helper: build a 16-step bar string from "step:note" pairs */
export function bar(map: Record<number, string>, len = 16): string {
  const out: string[] = [];
  for (let i = 0; i < len; i++) out.push(map[i] ?? '.');
  return out.join(' ');
}
const rep = (s: string, n: number) => Array(n).fill(s).join(' ');
/** sustained chord/note over a full bar */
const hold = (n: string, len = 16) => [n, ...Array(len - 1).fill('-')].join(' ');
/** 16th-note arpeggio over a chord for one bar */
const arp = (notes: string[], len = 16) => Array.from({ length: len }, (_, i) => notes[i % notes.length]).join(' ');

// ───────── Floor 1: The Sunken Gearworks (D minor, 92 bpm) ─────────
const G_MELODY = [
  bar({ 0: 'D6', 2: 'A5', 4: 'D6', 6: 'A5', 8: 'F5', 10: 'E5', 12: 'D5' }),
  bar({ 0: 'D6', 2: 'Bb5', 4: 'D6', 6: 'Bb5', 8: 'F5', 10: 'E5', 12: 'D5', 14: 'C5' }),
  bar({ 0: 'C6', 2: 'A5', 4: 'C6', 6: 'A5', 8: 'F5', 10: 'G5', 12: 'A5' }),
  bar({ 0: 'E5', 2: 'G5', 4: 'C6', 8: 'Bb5', 10: 'A5', 12: 'G5' }),
  bar({ 0: 'D6', 2: 'A5', 4: 'D6', 6: 'A5', 8: 'F5', 10: 'E5', 12: 'D5' }),
  bar({ 0: 'G5', 2: 'Bb5', 4: 'D6', 8: 'C6', 10: 'Bb5', 12: 'A5', 14: 'G5' }),
  bar({ 0: 'F5', 4: 'D5', 6: 'F5', 8: 'Bb5', 10: 'A5', 12: 'G5', 14: 'F5' }),
  bar({ 0: 'E5', 4: 'C#5', 6: 'E5', 8: 'A5' }),
].join(' ');
const G_CHORDS = [['D4', 'F4', 'A4'], ['Bb3', 'D4', 'F4'], ['A3', 'C4', 'F4'], ['G3', 'C4', 'E4'], ['D4', 'F4', 'A4'], ['G3', 'Bb3', 'D4'], ['Bb3', 'D4', 'F4'], ['A3', 'C#4', 'E4']];
const G_ROOTS = ['D2', 'Bb1', 'F2', 'C2', 'D2', 'G1', 'Bb1', 'A1'];

export const SONGS: Record<string, SongDef> = {
  ...EXTRA_SONGS,
  gearworks: {
    bpm: 92, len: 128,
    tracks: [
      { inst: 'box', p: G_MELODY, vol: 1 },
      { inst: 'pad', p: G_CHORDS.map((c) => hold(c.join('+'))).join(' '), vol: 1 },
      { inst: 'bass', p: G_ROOTS.map((r) => bar({ 0: r, 8: r })).join(' '), vol: 0.8 },
      { inst: 'tick', p: rep(bar({ 0: 'x', 4: 'x', 8: 'x', 12: 'x' }), 8), vol: 0.9 },
      { inst: 'tock', p: rep(bar({ 2: 'x', 10: 'x' }), 8), vol: 0.7 },
      // combat layer
      { inst: 'kick', layer: 'combat', p: rep(bar({ 0: 'X', 6: 'x', 8: 'X', 11: 'x' }), 8) },
      { inst: 'snare', layer: 'combat', p: rep(bar({ 4: 'X', 12: 'X', 15: 'x' }), 8) },
      { inst: 'hat', layer: 'combat', p: rep(bar({ 0: 'x', 2: 'x', 3: 'x', 4: 'x', 6: 'x', 7: 'x', 8: 'x', 10: 'x', 11: 'x', 12: 'x', 14: 'x', 15: 'x' }), 8) },
      { inst: 'strings', layer: 'combat', vol: 0.9, p: G_CHORDS.map((c) => arp([c[0], c[2], c[1], c[2]].map((n) => n.replace(/(\d)$/, (d) => String(+d + 1))))).join(' ') },
      { inst: 'bass', layer: 'combat', vol: 0.7, p: G_ROOTS.map((r) => bar({ 2: r, 3: r, 6: r, 10: r, 11: r, 14: r })).join(' ') },
    ],
  },
};
