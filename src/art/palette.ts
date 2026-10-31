// Master palette — hue-shifted ramps (shadows lean violet/blue, highlights lean yellow).
// See docs/ART_BIBLE.md §3. Every sprite must use these names.

export const PAL = {
  // K — night indigo neutrals (K0 is the global outline colour)
  K0: '#0b0a14', K1: '#15121f', K2: '#201a2e', K3: '#2c2440', K4: '#3d3354',
  K5: '#534669', K6: '#6e5f80', K7: '#8f7f9c', K8: '#b3a5b8', K9: '#d8ccd0', K10: '#f3ead9',
  // B — brass
  B0: '#3a2219', B1: '#5c3524', B2: '#87502c', B3: '#b37435', B4: '#d99c45', B5: '#f2c766', B6: '#fbe79e',
  // R — rust red
  R0: '#3b1420', R1: '#6b1f2c', R2: '#a1303a', R3: '#d24e45', R4: '#f07f5a',
  // O — ember
  O0: '#7a2e1a', O1: '#c4501f', O2: '#f08a2a', O3: '#ffc04a', O4: '#fff1a8',
  // T — verdigris
  T0: '#0f2a2e', T1: '#17434a', T2: '#1f6463', T3: '#2f8a7f', T4: '#55b39a', T5: '#94dbb8',
  // C — echo cyan (reserved for echoes / rewind / sand)
  C0: '#123a5c', C1: '#1d6aa3', C2: '#2fa6d9', C3: '#6be3f7', C4: '#c4fbff',
  // G — foliage
  G0: '#1a2e1f', G1: '#2c4a2a', G2: '#4a6e34', G3: '#7a9a40', G4: '#b8c95a',
  // V — stasis violet (fixed damage, magic)
  V0: '#2a1240', V1: '#4b1f6e', V2: '#7a35a8', V3: '#b35ee0', V4: '#e3a6ff',
  // M — magenta (reserved for enemy bullets)
  M0: '#5e1040', M1: '#a3195e', M2: '#e33b7d', M3: '#ff7aa8',
  // U — night blue / water
  U0: '#121a3a', U1: '#1d2b5c', U2: '#2d4685', U3: '#4a6bb0', U4: '#7d9ad6',
  // S — sand
  S0: '#5a4430', S1: '#8a6c48', S2: '#b8956a', S3: '#dcc08e', S4: '#f2e2b5',
  // pure white for flashes only
  W: '#ffffff',
} as const;

export type PalKey = keyof typeof PAL;

const cache = new Map<string, [number, number, number]>();
export function hexToRgb(hex: string): [number, number, number] {
  let c = cache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    cache.set(hex, c);
  }
  return c;
}

export function col(k: PalKey | string): string {
  return (PAL as Record<string, string>)[k] ?? k;
}

export function rgba(k: PalKey | string, a: number): string {
  const [r, g, b] = hexToRgb(col(k));
  return `rgba(${r},${g},${b},${a})`;
}

/** Linear blend of two palette colours, returned as css rgb(). Used only for lights / fx. */
export function mix(a: PalKey | string, b: PalKey | string, t: number): string {
  const ca = hexToRgb(col(a)), cb = hexToRgb(col(b));
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
