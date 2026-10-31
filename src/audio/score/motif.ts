// "Ines's waltz" — the leitmotif of SECOND HAND.
// Written once in A minor, 3/4, 12 steps (16ths) per bar; other cues transpose / re-rhythm it.
//
//   5 1 2 | b3 — 2 1 | 4 — b3 2 | 2 — 1 7 | 5 1 2 | b3 4 5 | b6 — 5 4 | b3
//   a rising question (5→b3), a sigh, a rising sequence, a half cadence on the leading tone;
//   the answer climbs higher to the b9 over the dominant and lands on the minor third —
//   never on the tonic. Only the victory cue finally lets it come home to the root.
//
// Harmony:  Am | F | Dm6 | E | Am | F | E7(b9) | Am

/** antecedent + consequent, A minor (duration notation, see kit.m) */
export const WALTZ =
  'E5:4 A5:4 B5:4 | C6:8 B5:2 A5:2 | D6:8 C6:2 B5:2 | B5:6 A5:2 G#5:4 | ' +
  'E5:4 A5:4 B5:4 | C6:4 D6:4 E6:4 | F6:8 E6:2 D6:2 | C6:12';

/** the B strain: relative major with a borrowed iv (Fm) — C | G/B | Am | Em/G | F | Fm/Ab | C/G | E7 */
export const WALTZ_B =
  'E5:6 F5:2 G5:4 | D5:8 G5:4 | C5:6 D5:2 E5:4 | B4:12 | ' +
  'A4:4 C5:4 F5:4 | Ab5:8 G5:2 F5:2 | E5:8 D5:2 C5:2 | B4:8 .:4';
