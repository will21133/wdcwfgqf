// Biome themes — palettes and lighting moods for each floor of the tower.
export interface Theme {
  id: number;
  key: string;
  name: { zh: string; en: string };
  /** light-map ambient (0.5 grey = neutral brightness) */
  ambient: string;
  clear: string;
  grade: { tint: [number, number, number]; lift: [number, number, number]; sat: number; contrast: number };
  /** floor slab ramp (dark → light) */
  slab: string[];
  seam: string;
  /** grime / moss overlay ramp */
  grime: string[];
  grimeAmount: number;
  /** secondary floor material (plates / tiles) */
  plate: string[];
  plateAmount: number;
  wallBrick: string[];
  wallMortar: string;
  wallLip: string[];
  cap: string[];
  capTrim: string;
  pitWater: string[];
  pitFace: string[];
  lamp: string;
  lampLight: string;
  dust: string;
  music: string;
}

export const THEMES: Theme[] = [
  {
    id: 0, key: 'gearworks',
    name: { zh: '沉没齿轮厂', en: 'The Sunken Gearworks' },
    ambient: '#363d55', clear: '#07060d',
    grade: { tint: [0.98, 1.0, 1.04], lift: [0.0, 0.03, 0.05], sat: 0.95, contrast: 1.04 },
    slab: ['K2', 'K3', 'K4', 'K5', 'K6'], seam: 'K1',
    grime: ['T0', 'T1', 'T2'], grimeAmount: 0.42,
    plate: ['K1', 'K3', 'K4', 'B3'], plateAmount: 0.18,
    wallBrick: ['K2', 'K3', 'K4', 'K5'], wallMortar: 'K1', wallLip: ['K5', 'K6', 'K7'],
    cap: ['K0', 'K1', 'K2'], capTrim: 'B2',
    pitWater: ['U0', 'U1', 'T1', 'T2', 'U3'], pitFace: ['K4', 'K3', 'K2', 'K1'],
    lamp: 'O3', lampLight: 'O2', dust: 'B5', music: 'gearworks',
  },
  {
    id: 1, key: 'conservatory',
    name: { zh: '铜绿温室', en: 'The Verdigris Conservatory' },
    ambient: '#2f4a52', clear: '#06100f',
    grade: { tint: [0.96, 1.03, 1.0], lift: [0.0, 0.04, 0.03], sat: 1.0, contrast: 1.03 },
    slab: ['T0', 'T1', 'K4', 'K5', 'T3'], seam: 'G0',
    grime: ['G0', 'G1', 'G2'], grimeAmount: 0.55,
    plate: ['T1', 'T2', 'T3', 'T4'], plateAmount: 0.2,
    wallBrick: ['T0', 'T1', 'T2', 'T3'], wallMortar: 'G0', wallLip: ['T3', 'T4', 'T5'],
    cap: ['K0', 'G0', 'T0'], capTrim: 'T3',
    pitWater: ['G0', 'T0', 'T1', 'G1', 'T3'], pitFace: ['T2', 'T1', 'T0', 'G0'],
    lamp: 'G4', lampLight: 'T5', dust: 'T5', music: 'conservatory',
  },
  {
    id: 2, key: 'archive',
    name: { zh: '流沙档案馆', en: 'The Sand Archive' },
    ambient: '#4a3d3a', clear: '#0d0806',
    grade: { tint: [1.04, 1.0, 0.94], lift: [0.04, 0.02, 0.0], sat: 0.95, contrast: 1.05 },
    slab: ['S0', 'B1', 'S1', 'S2', 'S3'], seam: 'B0',
    grime: ['S2', 'S3', 'S4'], grimeAmount: 0.4,
    plate: ['R0', 'R1', 'R2', 'B2'], plateAmount: 0.22,
    wallBrick: ['B0', 'B1', 'S0', 'S1'], wallMortar: 'K1', wallLip: ['S1', 'S2', 'S3'],
    cap: ['K0', 'B0', 'K1'], capTrim: 'B3',
    pitWater: ['S0', 'S1', 'S2', 'S3', 'S4'], pitFace: ['S1', 'S0', 'B0', 'K1'],
    lamp: 'O3', lampLight: 'O3', dust: 'S4', music: 'archive',
  },
  {
    id: 3, key: 'clockface',
    name: { zh: '钟面', en: 'The Clockface' },
    ambient: '#3a3060', clear: '#05040c',
    grade: { tint: [1.0, 0.97, 1.06], lift: [0.03, 0.0, 0.06], sat: 1.0, contrast: 1.06 },
    slab: ['K3', 'K5', 'K7', 'K8', 'K9'], seam: 'K2',
    grime: ['V0', 'V1', 'U1'], grimeAmount: 0.3,
    plate: ['B2', 'B3', 'B4', 'B5'], plateAmount: 0.1,
    wallBrick: ['K3', 'K4', 'K5', 'K6'], wallMortar: 'K1', wallLip: ['K7', 'K8', 'K9'],
    cap: ['K0', 'U0', 'K1'], capTrim: 'B4',
    pitWater: ['K0', 'U0', 'V0', 'U1', 'V2'], pitFace: ['K5', 'K4', 'K3', 'K1'],
    lamp: 'V4', lampLight: 'V3', dust: 'V4', music: 'clockface',
  },
];
