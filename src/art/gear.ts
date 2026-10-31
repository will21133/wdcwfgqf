// Procedural shaded gear — used by wall machinery, coglings and bosses.
import { PixelBuf } from '../engine/gfx/canvas';
import { Sprite, spriteFromBuf } from '../engine/gfx/sprite';
import { rgb } from './blit';

export interface GearStyle {
  /** ramp dark → light (4 entries) */
  ramp: string[];
  hub: string;
  hole?: string;
  spokes?: number;
}

export const BRASS_GEAR: GearStyle = { ramp: ['B1', 'B2', 'B3', 'B4', 'B5'], hub: 'B6', hole: 'K1', spokes: 4 };
export const IRON_GEAR: GearStyle = { ramp: ['K2', 'K3', 'K4', 'K5', 'K6'], hub: 'K7', hole: 'K0', spokes: 5 };
export const RUST_GEAR: GearStyle = { ramp: ['R0', 'B1', 'R1', 'B2', 'R2'], hub: 'B3', hole: 'K0', spokes: 3 };

export function paintGear(pb: PixelBuf, cx: number, cy: number, R: number, teeth: number, phase: number, st: GearStyle, toothLen = 2, squashY = 1) {
  const r0 = R - toothLen;
  const ramp = st.ramp.map(rgb);
  const size = Math.ceil(R + 2);
  for (let y = -size; y <= size; y++)
    for (let x = -size; x <= size; x++) {
      const px = x + 0.5, py = (y + 0.5) / squashY;
      const d = Math.hypot(px, py);
      const a = Math.atan2(py, px);
      // tooth profile
      const tp = ((((a - phase) / (Math.PI * 2)) * teeth) % 1 + 1) % 1;
      const tooth = tp < 0.45;
      const rr = tooth ? R : r0;
      if (d > rr) continue;
      // shading: light from top-left
      const lit = (-px * 0.6 - py * 0.8) / Math.max(1, d);
      let L = 2 + Math.round(lit * 1.2);
      if (d > rr - 1) L -= 1; // rim
      if (d < r0 - 2 && d > r0 - 3.2) L = 1; // inner ring groove
      // spokes / lightening holes
      if (st.spokes && d < r0 - 3.5 && d > R * 0.32) {
        const sp = ((((a - phase) / (Math.PI * 2)) * st.spokes) % 1 + 1) % 1;
        if (sp > 0.3 && sp < 0.7) { pb.set(cx + x, cy + y, rgb(st.hole ?? 'K0')); continue; }
      }
      if (d < R * 0.32) L = d < R * 0.18 ? -1 : 3;
      if (L === -1) { pb.set(cx + x, cy + y, rgb(st.hole ?? 'K0')); continue; }
      L = Math.max(0, Math.min(ramp.length - 1, L));
      pb.set(cx + x, cy + y, ramp[L]);
    }
  // hub highlight
  pb.set(cx - 1, cy - Math.round(R * 0.25), rgb(st.hub));
}

/** pre-rendered rotation frames (gears are symmetric so few frames are needed) */
export function gearFrames(R: number, teeth: number, st: GearStyle, frames = 4, toothLen = 2, outline: string | false = 'K0'): Sprite[] {
  const out: Sprite[] = [];
  const size = Math.ceil(R) * 2 + 3;
  for (let i = 0; i < frames; i++) {
    const pb = new PixelBuf(size, size);
    const phase = (i / frames) * ((Math.PI * 2) / teeth);
    paintGear(pb, Math.floor(size / 2), Math.floor(size / 2), R, teeth, phase, st, toothLen);
    out.push(spriteFromBuf(pb, Math.floor(size / 2), Math.floor(size / 2), outline));
  }
  return out;
}
