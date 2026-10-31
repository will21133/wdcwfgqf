// Biome art plugin interface. Each floor of the tower provides its own painters and dressing.
// Anything left undefined falls back to the default (gearworks-style) painter in roomRender.ts.
import type { PixelBuf } from '../../engine/gfx/canvas';
import type { RNG } from '../../engine/rng';
import type { Theme } from '../themes';
import type { RoomMap } from '../../game/world/room';
import type { World } from '../../game/world/world';

export interface PaintCtx {
  m: RoomMap;
  th: Theme;
  rng: RNG;
  seed: number;
  /** per-pixel distance (px) to the nearest wall above, for ambient occlusion */
  aoTop: Int16Array;
  /** true if tile counts as wall for neighbour tests */
  wallish(tx: number, ty: number): boolean;
}

export interface BiomeArt {
  /** generator prop types this biome dresses itself (stock gearworks props are not spawned for these) */
  claimsProps?: string[];
  /** paint the whole floor buffer (floor tiles only — pits are painted afterwards) */
  paintFloor?(pb: PixelBuf, c: PaintCtx): void;
  /** paint pit tiles */
  paintPits?(pb: PixelBuf, c: PaintCtx): void;
  /**
   * paint a wall face (16 wide x H tall) for wall cell (tx,ty) at strip offset oy.
   * H is 32 for tall walls, 8 for cut-away south walls. exterior = faces the void.
   */
  paintFace?(pb: PixelBuf, c: PaintCtx, tx: number, ty: number, oy: number, H: number, exterior: boolean): void;
  /** paint the 16x16 top surface of a wall cell at strip offset oy */
  paintCap?(pb: PixelBuf, c: PaintCtx, tx: number, ty: number, oy: number): void;
  /** paint non-entity floor dressing after floors/pits (rugs, sand drifts, inlays) */
  paintDressing?(pb: PixelBuf, c: PaintCtx): void;
  /** add biome entities (animated props, lights, hazards) once the world exists */
  decorate?(w: World, m: RoomMap, rng: RNG): void;
}
