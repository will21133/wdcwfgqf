// Biome registry — index = theme id (= tower floor).
import type { BiomeArt } from './types';
import { GEARWORKS } from './gearworks';
import { CONSERVATORY } from './conservatory';
import { ARCHIVE } from './archive';
import { CLOCKFACE } from './clockface';

export const BIOMES: BiomeArt[] = [GEARWORKS, CONSERVATORY, ARCHIVE, CLOCKFACE];
