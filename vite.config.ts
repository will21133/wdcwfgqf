import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// `npm run build*` runs tools/subset-fonts.py first; production builds then ship the subset fonts
// from build/fonts/ (the dev server keeps the full fonts so new strings never miss glyphs).
const subsetDir = fileURLToPath(new URL('./build/fonts/', import.meta.url));
const fontAliases = ['fusion-12', 'fusion-10', 'fusion-8']
  .filter((n) => existsSync(subsetDir + n + '.woff2'))
  .map((n) => ({ find: new RegExp(`^\\./assets/fonts/${n}\\.woff2`), replacement: subsetDir + n + '.woff2' }));

export default defineConfig(({ mode, command }) => ({
  base: './',
  resolve: { alias: command === 'build' ? fontAliases : [] },
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 4000,
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
