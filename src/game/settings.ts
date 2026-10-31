// Player settings, persisted to localStorage (Electron build maps this to the user data dir).
import { G } from './G';
import { i18n, Lang } from './i18n';
import { rumbleSettings } from '../engine/rumble';
import { DEFAULT_BINDINGS, Action } from '../engine/input';
import { textScale } from '../engine/gfx/font';

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
  /** damage numbers over enemies */
  showDamage: boolean;
  /** UI text size in percent: 125 draws glyphs one device-pixel step larger where the window allows */
  textSize: 100 | 125;
  /** HUD labels next to the health bar, tape, sand ... (GDD2 §9.4): auto = first 3 runs */
  hudLabels: 'auto' | 'always' | 'off';
  /** rewind input: tap + hold-to-scrub (default), or tap only (GDD2 §3.2) */
  rewindMode: 'both' | 'tap';
  /** cap full-screen flash intensity (photosensitivity) */
  flashLimit: boolean;
  /** plain-language lines under stylised terms (GDD2 §9.8): auto = until seen 3 times */
  termHints: 'auto' | 'always' | 'off';
}

const KEY = 'secondhand.settings.v1';

export const settings: Settings = {
  master: 0.8, music: 0.7, sfx: 0.85, shake: 1, lang: 'zh', rumble: true, rumbleStrength: 1,
  pixelPerfect: false, flashes: true, bindings: {}, aimAssist: true, showDamage: true,
  textSize: 100, hudLabels: 'auto', rewindMode: 'both', flashLimit: false, termHints: 'auto',
};

/**
 * Settings whose consumers are not built yet stay out of the menu until the owning package wires
 * them up and flips the flag (an option that does nothing would only confuse players):
 * rewindMode → F3 (tap-only rewind), hudLabels → P1 (HUD 2.0 labels).
 */
export const settingsLive = { rewindMode: false, hudLabels: false };

/** the ?lang= debug override applies until the player picks a language in the menu */
let urlLang = true;
/** menu: switch language (also ends a ?lang= override for this session) */
export function setLanguage(v: Lang) { settings.lang = v; urlLang = false; saveSettings(); }

/** strongest full-screen flash allowed: 0 when flashes are off, a soft cap when limited */
export function flashCap(): number { return !settings.flashes ? 0 : settings.flashLimit ? 0.12 : Infinity; }

/** should HUD labels show? (auto: the first three runs) */
export function hudLabelsOn(runs: number): boolean {
  return settings.hudLabels === 'always' || (settings.hudLabels === 'auto' && runs < 3);
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
    else if (!navigator.language.toLowerCase().startsWith('zh')) settings.lang = 'en';
  } catch { /* storage unavailable */ }
  sanitize();
  applySettings();
}

function sanitize() {
  if (settings.textSize !== 100 && settings.textSize !== 125) settings.textSize = 100;
  if (!['auto', 'always', 'off'].includes(settings.hudLabels)) settings.hudLabels = 'auto';
  if (!['auto', 'always', 'off'].includes(settings.termHints)) settings.termHints = 'auto';
  if (settings.rewindMode !== 'both' && settings.rewindMode !== 'tap') settings.rewindMode = 'both';
  settings.flashLimit = !!settings.flashLimit;
  settings.showDamage = settings.showDamage !== false;
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
  // ?lang=zh|en (debug / screenshots) wins over the saved language for this session
  const q = urlLang ? G.debug.get('lang') : null;
  i18n.lang = q === 'zh' || q === 'en' ? q : settings.lang;
  rumbleSettings.enabled = settings.rumble;
  rumbleSettings.strength = settings.rumbleStrength;
  if (G.r) G.r.params.pixelPerfect = settings.pixelPerfect;
  textScale.boost = settings.textSize === 125;
  for (const k of Object.keys(DEFAULT_BINDINGS) as Action[]) G.input.bindings[k] = settings.bindings[k]?.slice() ?? DEFAULT_BINDINGS[k].slice();
}
