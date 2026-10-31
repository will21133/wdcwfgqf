// Validate every song pattern without a browser.
//   node tools/check_score.mjs          (loads the TS sources through vite's SSR loader)
// Checks: known instruments, valid tokens (rest / hold / note names / chords / percussion, with
// optional ! or ? marks), percussion vs pitched usage, sane note range, pattern length divides the
// song length, no hold at a pattern start, kit bar-length warnings, and prints a summary per song.
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failed = 0;
try {
  const { SONGS } = await server.ssrLoadModule('/src/audio/songs.ts');
  const { INSTRUMENTS } = await server.ssrLoadModule('/src/audio/instruments.ts');
  const { SCORE_WARNINGS } = await server.ssrLoadModule('/src/audio/score/index.ts');
  const PERC = new Set(['kick', 'snare', 'hat', 'tick', 'tock', 'taiko', 'shaker', 'crash', 'rewind']);
  const NOTE = /^([A-G])(#|b)?(-?\d)$/;
  const midi = (n) => { const m = NOTE.exec(n); const s = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return (+m[3] + 1) * 12 + s; };
  const err = (s) => { failed++; console.log('  ERROR ' + s); };
  for (const w of SCORE_WARNINGS) err('kit: ' + w);
  for (const [name, def] of Object.entries(SONGS)) {
    const spb = def.spb ?? 4;
    const secs = (def.len * 60) / def.bpm / spb;
    const layers = new Set(def.tracks.map((t) => t.layer ?? 'base'));
    console.log(`${name.padEnd(13)} ${String(def.bpm).padStart(3)} bpm spb ${spb} len ${String(def.len).padStart(4)} = ${secs.toFixed(1)}s  tracks ${def.tracks.length}  layers ${[...layers].join('+')}`);
    if (!Number.isInteger(def.len) || def.len <= 0) err(`${name}: bad len`);
    def.tracks.forEach((t, i) => {
      const where = `${name}[${i}] ${t.inst}`;
      if (!INSTRUMENTS[t.inst]) err(`${where}: unknown instrument`);
      const toks = t.p.trim().split(/\s+/);
      if (def.len % toks.length !== 0) err(`${where}: pattern length ${toks.length} does not divide len ${def.len}`);
      if (toks[0] === '-') err(`${where}: pattern starts with a hold`);
      let notes = 0;
      toks.forEach((tk, j) => {
        if (tk === '.' || tk === '-') return;
        const body = tk.replace(/[!?]$/, '');
        if (/^[xXo]$/.test(body)) {
          if (!PERC.has(t.inst)) err(`${where} step ${j}: percussion token "${tk}" on pitched instrument`);
          notes++;
          return;
        }
        for (const n of body.split('+')) {
          if (!NOTE.test(n)) { err(`${where} step ${j}: bad token "${tk}"`); return; }
          const mm = midi(n) + (t.tr ?? 0);
          if (mm < 21 || mm > 108) err(`${where} step ${j}: note ${n} out of range`);
        }
        notes++;
      });
      if (!notes) err(`${where}: silent track`);
    });
  }
} finally {
  await server.close();
}
console.log(failed ? `\n${failed} problem(s)` : '\nall patterns OK');
process.exit(failed ? 1 : 0);
