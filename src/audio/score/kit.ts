// Composer's toolkit: small helpers that turn readable notation into step-sequencer patterns.
// Everything here is pure string manipulation; nothing touches WebAudio.
//
//   m('E5:4 A5:4 B5:4 | C6:8 B5:2 A5:2', 12)
//      duration notation. `token:steps` (default 1 step). `.` rest, `-` tie (continues the
//      previous note), notes / chords with optional `!` accent or `?` soft. `|` is a bar line and
//      is checked against `barLen` — mistakes are collected in SCORE_WARNINGS (never thrown).
//   grid('X..x ..x. X... o...')   percussion: X accent, x normal, o soft, `.` rest (spaces / | ignored)
//   arp(['A2 E3 A3 C4', ...], '0 . 1 . 2 . 3 . * . ^ .')
//      one shape per chord. digits index into the chord (wrapping), `*` whole chord, `^` all but the
//      lowest note, `.` rest, `-` tie; digits may carry `!` / `?`. A chord given as '.' is silent.

export const SCORE_WARNINGS: string[] = [];
const warn = (msg: string) => { SCORE_WARNINGS.push(msg); };

/** duration notation → step tokens (see header) */
export function m(spec: string, barLen: number, label = ''): string {
  const out: string[] = [];
  let inBar = 0, bar = 1;
  for (const raw of spec.trim().split(/\s+/)) {
    if (raw === '|') {
      if (inBar !== barLen) warn(`${label} bar ${bar}: ${inBar} steps, expected ${barLen}`);
      inBar = 0; bar++;
      continue;
    }
    const i = raw.lastIndexOf(':');
    const body = i > 0 ? raw.slice(0, i) : raw;
    const n = i > 0 ? Number(raw.slice(i + 1)) : 1;
    if (!Number.isInteger(n) || n < 1) { warn(`${label} bar ${bar}: bad duration in "${raw}"`); continue; }
    out.push(body);
    for (let k = 1; k < n; k++) out.push(body === '.' ? '.' : '-');
    inBar += n;
  }
  if (inBar !== 0 && inBar !== barLen) warn(`${label} last bar ${bar}: ${inBar} steps, expected ${barLen}`);
  return out.join(' ');
}

/** percussion grid → step tokens */
export function grid(s: string): string {
  const out: string[] = [];
  for (const c of s.replace(/[\s|]/g, '')) out.push(c === 'X' ? 'X' : c === 'x' ? 'x' : c === 'o' ? 'x?' : '.');
  return out.join(' ');
}

/** arpeggiate / comp a list of chords with a per-chord rhythmic shape (see header) */
export function arp(chords: string[], shape: string): string {
  const sh = shape.trim().split(/\s+/);
  return chords.map((c) => {
    if (c.trim() === '.') return sh.map(() => '.').join(' ');
    const ns = c.trim().split(/\s+/);
    return sh.map((tk) => {
      if (tk === '.' || tk === '-') return tk;
      const mm = /^([0-9*^])([!?]?)$/.exec(tk);
      if (!mm) { warn(`arp: bad shape token "${tk}"`); return '.'; }
      const note = mm[1] === '*' ? ns.join('+') : mm[1] === '^' ? ns.slice(1).join('+') : ns[Number(mm[1]) % ns.length];
      return note + mm[2];
    }).join(' ');
  }).join(' ');
}

/** sustained notes/chords: hold('A3+C4+E4', 12) */
export const hold = (n: string, len: number) => [n, ...Array(len - 1).fill('-')].join(' ');
/** n silent steps */
export const rest = (len: number) => Array(len).fill('.').join(' ');
/** repeat a pattern n times */
export const rep = (s: string, n: number) => Array(n).fill(s.trim()).join(' ');
/** join pattern fragments */
export const cat = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(' ');
/** number of steps in a pattern */
export const steps = (p: string) => p.trim().split(/\s+/).length;

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** transpose every note in a step pattern by `semis` (spelling with flats or sharps) */
export function tp(p: string, semis: number, flats = false): string {
  const names = flats ? FLAT : SHARP;
  return p.trim().split(/\s+/).map((tk) => {
    const suf = /[!?]$/.test(tk) ? tk.slice(-1) : '';
    const body = suf ? tk.slice(0, -1) : tk;
    if (!/^[A-G]/.test(body)) return tk;
    return body.split('+').map((n) => {
      const mm = /^([A-G])(#|b)?(-?\d)$/.exec(n);
      if (!mm) { warn(`tp: bad note "${n}"`); return n; }
      const midi = (Number(mm[3]) + 1) * 12 + SEMI[mm[1]] + (mm[2] === '#' ? 1 : mm[2] === 'b' ? -1 : 0) + semis;
      return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
    }).join('+') + suf;
  }).join(' ');
}

/** make every note in a pattern soft (`?`) or accented (`!`), replacing existing marks */
export function vel(p: string, mark: '' | '?' | '!'): string {
  return p.trim().split(/\s+/).map((tk) => {
    if (tk === '.' || tk === '-') return tk;
    return tk.replace(/[!?]$/, '') + mark;
  }).join(' ');
}

/** small deterministic PRNG (mulberry32) so generated textures loop identically */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Grains of sand: a wandering, stepwise walk over the given chord tones, one chord per `len` steps.
 * `density` = chance a step sounds; `every` = only consider every n-th step.
 * Notes are soft unless the walk lands on the chord's lowest tone.
 */
export function sand(chords: string[], len: number, seed: number, density = 0.6, every = 1): string {
  const r = rng(seed);
  let idx = 0;
  return chords.map((c) => {
    if (c.trim() === '.') return rest(len);
    const ns = c.trim().split(/\s+/);
    idx = Math.min(idx, ns.length - 1);
    const out: string[] = [];
    for (let i = 0; i < len; i++) {
      if (i % every !== 0 || r() > density) { out.push('.'); continue; }
      const mv = r();
      idx += mv < 0.42 ? -1 : mv < 0.84 ? 1 : 0;
      if (idx < 0) idx = 1;
      if (idx >= ns.length) idx = ns.length - 2;
      out.push(ns[Math.max(0, idx)] + (idx === 0 ? '' : '?'));
    }
    return out.join(' ');
  }).join(' ');
}
