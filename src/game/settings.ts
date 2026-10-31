// Player settings, persisted to localStorage (Electron build maps this to the user data dir).
import { G } from './G';
import { i18n, Lang } from './i18n';
import { rumbleSettings } from '../engine/rumble';
import { DEFAULT_BINDINGS, Action } from '../engine/input';

export interface Settings {
  master: number; music: number; sfx: number;
  shake: number;
  lang: Lang;
  rumble: boolean;
  rumbleStrength: number;
  pixelPerfect: boolean;
  flashes: boolean;
  bindings: Partial<Record<Action, string[]>>;
  aimAssist: boolean;
  showDamage: boolean;
}

const KEY = 'secondhand.settings.v1';

export const settings: Settings = {
  master: 0.8, music: 0.7, sfx: 0.85, shake: 1, lang: 'zh', rumble: true, rumbleStrength: 1,
  pixelPerfect: false, flashes: true, bindings: {}, aimAssist: true, showDamage: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
    else if (!navigator.language.toLowerCase().startsWith('zh')) settings.lang = 'en';
  } catch { /* storage unavailable */ }
  applySettings();
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  applySettings();
}

export function applySettings() {
  G.audio.volumes.master = settings.master;
  G.audio.volumes.music = settings.music;
  G.audio.volumes.sfx = settings.sfx;
  G.audio.applyVolumes();
  i18n.lang = settings.lang;
  rumbleSettings.enabled = settings.rumble;
  rumbleSettings.strength = settings.rumbleStrength;
  if (G.r) G.r.params.pixelPerfect = settings.pixelPerfect;
  for (const k of Object.keys(DEFAULT_BINDINGS) as Action[]) G.input.bindings[k] = settings.bindings[k]?.slice() ?? DEFAULT_BINDINGS[k].slice();
}
