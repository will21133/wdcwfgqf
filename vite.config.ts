import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// `npm run build*` runs tools/subset-fonts.py first; production builds then ship the subset fonts
// from build/fonts/ (the dev server keeps the full fonts so new strings never miss glyphs).
// The subset is only used while its stamp is newer than every source file: a stale subset could
// lack characters added since, so in that case the build ships the full fonts and says so.
const root = fileURLToPath(new URL('./', import.meta.url));
const subsetDir = root + 'build/fonts/';
function newestSource(dir: string): number {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) t = Math.max(t, newestSource(p));
    else if (/\.(ts|json|woff2)$/.test(e.name)) t = Math.max(t, statSync(p).mtimeMs);
  }
  return t;
}
function subsetFresh(): boolean {
  const stamp = subsetDir + '.stamp';
  if (!existsSync(stamp)) return false;
  const fresh = statSync(stamp).mtimeMs >= Math.max(newestSource(root + 'src'), statSync(root + 'index.html').mtimeMs);
  if (!fresh) console.warn('[fonts] build/fonts is older than the sources: shipping the full fonts (run `npm run subset-fonts`)');
  return fresh;
}
const fontAliases = () => (subsetFresh() ? ['fusion-12', 'fusion-10', 'fusion-8'] : [])
  .filter((n) => existsSync(subsetDir + n + '.woff2'))
  .map((n) => ({ find: new RegExp(`^\\./assets/fonts/${n}\\.woff2`), replacement: subsetDir + n + '.woff2' }));

export default defineConfig(({ mode, command }) => ({
  base: './',
  resolve: { alias: command === 'build' ? fontAliases() : [] },
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 4000,
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
