export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d', { willReadFrequently: false })!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Mutable RGBA pixel buffer for procedural pixel-art generation. */
export class PixelBuf {
  readonly data: Uint8ClampedArray;
  constructor(public readonly w: number, public readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  static fromCanvas(c: HTMLCanvasElement): PixelBuf {
    const ctx = c.getContext('2d')!;
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const pb = new PixelBuf(c.width, c.height);
    pb.data.set(id.data);
    return pb;
  }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, rgb: [number, number, number], a = 255) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2]; this.data[i + 3] = a;
  }
  alpha(x: number, y: number) {
    if (!this.inside(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }
  get(x: number, y: number): [number, number, number, number] {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  clear(x: number, y: number) { if (this.inside(x, y)) this.data[(y * this.w + x) * 4 + 3] = 0; }
  rect(x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, rgb);
  }
  line(x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, rgb);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  disc(cx: number, cy: number, r: number, rgb: [number, number, number]) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, rgb);
      }
  }
  /** add a 1px outline around opaque pixels (4-neighbourhood) */
  outline(rgb: [number, number, number], diag = false) {
    const src = new Uint8ClampedArray(this.data);
    const a = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[(y * this.w + x) * 4 + 3]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (a(x, y) > 0) continue;
        let n = a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1);
        if (!n && diag) n = a(x - 1, y - 1) || a(x + 1, y - 1) || a(x - 1, y + 1) || a(x + 1, y + 1);
        if (n) this.set(x, y, rgb);
      }
  }
  toCanvas(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(this.w, this.h);
    const id = ctx.createImageData(this.w, this.h);
    id.data.set(this.data);
    ctx.putImageData(id, 0, 0);
    return c;
  }
}
