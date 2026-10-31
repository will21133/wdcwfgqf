// Additional songs (composer team). Merged into SONGS in ../songs.ts.
import type { SongDef } from '../../engine/audio/music';
import { INSTRUMENTS } from '../instruments';
import { EXTRA_INSTRUMENTS } from './instruments2';
import { title } from './title';
import { hub } from './hub';
import { conservatory } from './conservatory';
import { archive } from './archive';
import { clockface } from './clockface';
import { boss } from './boss';
import { boss_final } from './boss_final';
import { victory } from './victory';
import { shop } from './shop';
import { death } from './death';

export { EXTRA_INSTRUMENTS };
export { SCORE_WARNINGS } from './kit';

// The score needs the extra voices (harp, glass, bowed, horn, timpani, …). Register them into the
// shared instrument table so the songs work even before boot wires EXTRA_INSTRUMENTS explicitly.
// Never overrides an existing instrument of the same name.
for (const [k, fn] of Object.entries(EXTRA_INSTRUMENTS)) if (!(k in INSTRUMENTS)) INSTRUMENTS[k] = fn;

export const EXTRA_SONGS: Record<string, SongDef> = {
  title,
  hub,
  conservatory,
  archive,
  clockface,
  boss,
  boss_final,
  victory,
  shop,
  death,
};
