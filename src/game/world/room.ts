// Room map: tile grid + collision queries.
export const TS = 16;

export const enum T {
  VOID = 0,
  FLOOR = 1,
  WALL = 2,
  PIT = 3,
  /** door slot: solid until opened */
  DOOR = 4,
  /** floor blocked by a solid prop */
  BLOCK = 5,
}

export type DoorDir = 'n' | 's' | 'e' | 'w';

export interface DoorSpec { tx: number; ty: number; dir: DoorDir; w: number }
export interface PropSpec { type: string; tx: number; ty: number; data?: Record<string, unknown> }

export class RoomMap {
  tiles: Uint8Array;
  /** decorative variant per tile (0-255) */
  vari: Uint8Array;
  props: PropSpec[] = [];
  exits: DoorSpec[] = [];
  entry: DoorSpec | null = null;
  /** tiles where enemies may spawn */
  spawnable: { tx: number; ty: number }[] = [];
  /** shape label (debug) */
  shape = '';

  constructor(public w: number, public h: number) {
    this.tiles = new Uint8Array(w * h).fill(T.VOID);
    this.vari = new Uint8Array(w * h);
  }

  get pw() { return this.w * TS; }
  get ph() { return this.h * TS; }

  in(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  get(tx: number, ty: number): T { return this.in(tx, ty) ? (this.tiles[ty * this.w + tx] as T) : T.VOID; }
  set(tx: number, ty: number, t: T) { if (this.in(tx, ty)) this.tiles[ty * this.w + tx] = t; }

  isWallLike(tx: number, ty: number) {
    const t = this.get(tx, ty);
    return t === T.WALL || t === T.VOID || t === T.DOOR;
  }
  /** blocks movement (walls, closed doors, solid props) */
  isSolid(tx: number, ty: number) {
    const t = this.get(tx, ty);
    return t === T.WALL || t === T.VOID || t === T.DOOR || t === T.BLOCK;
  }
  /** blocks projectiles (props don't by default? they do) */
  blocksShot(tx: number, ty: number) { return this.isSolid(tx, ty); }
  isPit(tx: number, ty: number) { return this.get(tx, ty) === T.PIT; }
  isFloor(tx: number, ty: number) { return this.get(tx, ty) === T.FLOOR; }

  solidAt(px: number, py: number) { return this.isSolid(Math.floor(px / TS), Math.floor(py / TS)); }
  pitAt(px: number, py: number) { return this.isPit(Math.floor(px / TS), Math.floor(py / TS)); }
  shotBlockedAt(px: number, py: number) { return this.blocksShot(Math.floor(px / TS), Math.floor(py / TS)); }

  /** Line of sight (for AI and projectiles) — DDA */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.ceil(Math.hypot(dx, dy) / 6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.shotBlockedAt(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  /** flood fill walkable from a tile; pits count as passable only if allowPits */
  reach(tx: number, ty: number, allowPits = false): Uint8Array {
    const seen = new Uint8Array(this.w * this.h);
    const st = [ty * this.w + tx];
    seen[st[0]] = 1;
    while (st.length) {
      const i = st.pop()!;
      const x = i % this.w, y = (i / this.w) | 0;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ax, ny = y + ay;
        if (!this.in(nx, ny)) continue;
        const j = ny * this.w + nx;
        if (seen[j]) continue;
        const t = this.tiles[j];
        if (t === T.FLOOR || t === T.DOOR || (allowPits && t === T.PIT)) { seen[j] = 1; st.push(j); }
      }
    }
    return seen;
  }

  /** random walkable floor tile far from walls/pits */
  openTiles(margin = 1): { tx: number; ty: number }[] {
    const out: { tx: number; ty: number }[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== T.FLOOR) continue;
        let ok = true;
        for (let j = -margin; j <= margin && ok; j++)
          for (let i = -margin; i <= margin && ok; i++) if (this.get(x + i, y + j) !== T.FLOOR) ok = false;
        if (ok) out.push({ tx: x, ty: y });
      }
    return out;
  }
}
