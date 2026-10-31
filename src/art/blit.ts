import { PixelBuf } from '../engine/gfx/canvas';
import { hexToRgb, col } from './palette';

/** Blit a palette-mapped row-art part into a pixel buffer. */
export function blit(pb: PixelBuf, rows: string[], pal: Record<string, string>, x: number, y: number, flip = false) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      const k = pal[ch];
      if (!k) throw new Error(`blit: unmapped '${ch}'`);
      const xx = flip ? x + row.length - 1 - i : x + i;
      pb.set(xx, y + j, hexToRgb(col(k)));
    }
  }
}

export const rgb = (k: string) => hexToRgb(col(k));
