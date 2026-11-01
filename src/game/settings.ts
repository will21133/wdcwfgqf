// Player settings, persisted to localStorage (Electron build maps this to the user data dir).
import { G } from './G';
import { i18n, Lang } from './i18n';
import { rumbleSettings } from '../engine/rumble';
import { KB, KB_DEFAULTS, ACTIONS, padLayout, Action, KbProfile } from '../engine/input';
import { textScale } from '../engine/gfx/font';

export interface Settings {
  master: number; music: number; sfx: number;
  shake: number;
  lang: Lang;
  rumble: boolean;
  rumbleStrength: number;
  pixelPerfect: boolean;
  flashes: boolean;
  /** keyboard + mouse rebinds (1.0 key) */
  bindings: Partial<Record<Action, string[]>>;
  /** split-keyboard rebinds, per half (GDD2 §2.2: every device rebinds on its own) */
  bindingsKb: Partial<Record<'kbL' | 'kbR', Partial<Record<Action, string[]>>>>;
  /** pads: LB fork / RB rewind instead of the default LB rewind / RB fork */
  padSwap: boolean;
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
  /**
   * guidance (ONBOARD2 §5.10 / §6.12): full = lessons after fights, the adaptive coach, gates on
   * untaught verbs; lite = notes and the Rehearsal Hall only; off = safety notes only
   */
  onboarding: 'full' | 'lite' | 'off';
  /** coach prompts when hit (ONBOARD2 §6.3): auto = fades once learned, comes back if forgotten */
  coach: 'auto' | 'always' | 'off';
  /** the coach slows time briefly the first few times its card shows (ONBOARD2 §6.7) */
  coachSlowmo: boolean;
  /** the death card replays the last 3 seconds (ONBOARD2 §9) */
  deathReplay: boolean;
}

const KEY = 'secondhand.settings.v1';

export const settings: Settings = {
  master: 0.8, music: 0.7, sfx: 0.85, shake: 1, lang: 'zh', rumble: true, rumbleStrength: 1,
  pixelPerfect: false, flashes: true, bindings: {}, bindingsKb: {}, padSwap: false, aimAssist: true, showDamage: true,
  textSize: 100, hudLabels: 'auto', rewindMode: 'both', flashLimit: false, termHints: 'auto',
  onboarding: 'full', coach: 'auto', coachSlowmo: true, deathReplay: true,
};

/**
 * Settings whose consumers are not built yet stay out of the menu until the owning package wires
 * them up and flips the flag (an option that does nothing would only confuse players):
 * rewindMode → F3 (tap-only rewind; live), hudLabels → P1 (HUD 2.0 labels), onboarding / coach /
 * coachSlowmo / deathReplay → F4 (the pause menu's settings rows, F4b, once the coach and death card exist).
 */
export const settingsLive = { rewindMode: true, hudLabels: false, onboarding: false, coach: false, coachSlowmo: false, deathReplay: false };

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
  if (!settings.bindingsKb || typeof settings.bindingsKb !== 'object') settings.bindingsKb = {};
  if (!settings.bindings || typeof settings.bindings !== 'object') settings.bindings = {};
  settings.padSwap = !!settings.padSwap;
  if (!['full', 'lite', 'off'].includes(settings.onboarding)) settings.onboarding = 'full';
  if (!['auto', 'always', 'off'].includes(settings.coach)) settings.coach = 'auto';
  settings.coachSlowmo = settings.coachSlowmo !== false;
  settings.deathReplay = settings.deathReplay !== false;
}

/** the saved rebinds of one keyboard layout (writable: the controls panel edits it) */
export function profileBindings(p: KbProfile): Partial<Record<Action, string[]>> {
  if (p === 'kbm') return settings.bindings;
  return (settings.bindingsKb[p] ??= {});
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
  // every keyboard layout: saved rebinds over the defaults (G.input.bindings is KB.kbm)
  for (const p of ['kbm', 'kbL', 'kbR'] as KbProfile[]) {
    const saved = p === 'kbm' ? settings.bindings : settings.bindingsKb[p] ?? {};
    for (const k of ACTIONS) KB[p][k] = saved[k]?.slice() ?? KB_DEFAULTS[p][k].slice();
  }
  padLayout.swapBumpers = settings.padSwap;
}
