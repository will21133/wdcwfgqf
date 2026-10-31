// Count the distinct colours inside a rectangle of a PNG (text sharpness check: crisp pixel text on a
// solid plate has a handful of colours; blurred / bloomed text has hundreds).
// usage: node tools/textcheck.cjs <png> <x> <y> <w> <h> [--top N]
// No dependencies: a minimal PNG decoder (8-bit greyscale / RGB / RGBA / palette, non-interlaced).
const fs = require('node:fs');
const zlib = require('node:zlib');

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0, plte = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
    else if (type === 'PLTE') plte = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || inter) throw new Error(`unsupported PNG (depth ${depth}, interlace ${inter})`);
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * bpp;
      if (ctype === 2 || ctype === 6) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = ctype === 6 ? cur[s + 3] : 255; }
      else if (ctype === 3) { const k = cur[s] * 3; out[o] = plte[k]; out[o + 1] = plte[k + 1]; out[o + 2] = plte[k + 2]; out[o + 3] = 255; }
      else { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = ctype === 4 ? cur[s + 1] : 255; }
    }
    [prev, cur] = [cur, prev];
  }
  return { w, h, data: out };
}

const args = process.argv.slice(2);
if (args.length < 5) { console.log('usage: node tools/textcheck.cjs <png> <x> <y> <w> <h> [--top N]'); process.exit(1); }
const [file, X, Y, W, H] = args;
const top = args.includes('--top') ? +args[args.indexOf('--top') + 1] : 0;
const img = decodePng(fs.readFileSync(file));
const x0 = Math.max(0, +X), y0 = Math.max(0, +Y), x1 = Math.min(img.w, +X + +W), y1 = Math.min(img.h, +Y + +H);
const counts = new Map();
for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
  const o = (y * img.w + x) * 4;
  const k = (img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2];
  counts.set(k, (counts.get(k) || 0) + 1);
}
console.log(`${file} [${x0},${y0} ${x1 - x0}x${y1 - y0}] distinct colours: ${counts.size}`);
if (top) [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).forEach(([k, n]) => console.log('  #' + k.toString(16).padStart(6, '0'), n));
