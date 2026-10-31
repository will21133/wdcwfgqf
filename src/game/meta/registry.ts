// Shared meta registries (PLAN2 §1.2 / §1.2b): achievements, unlocks, cosmetics, the eleven
// chimes, save-level flags, lifetime stats, secrets, term sightings and taught concepts.
// Everything persists in save v2 (save.ts). Packages define content in their own files
// (e.g. progression/achievements.ts) and only call these functions — no cross-package imports.
//
// First-time events (achievement, secret, chime, unlock) pop a small toast (ui/notices.ts) and are
// emitted on the current world's bus as { id }. Frequent writers (Stats, Flags, Terms) mark the
// profile dirty; it is flushed every few seconds and when the page is hidden.
import { G } from '../G';
import { profile, saveProfile } from '../save';
import { L, L10n } from '../i18n';
import { settings } from '../settings';
import { term } from '../strings';
import { Notices } from '../ui/notices';

type MetaKind = 'achievement' | 'secret' | 'chime' | 'unlock' | 'cosmetic' | 'teach';
const metaListeners: ((kind: MetaKind, id: string, source?: string) => void)[] = [];
/** one listener for every first-time meta event (handy for eggs, notes and the ledger); unlocks pass their source */
export function onMeta(cb: (kind: MetaKind, id: string, source?: string) => void): void { metaListeners.push(cb); }

const isDev = (() => { try { return !!(import.meta as any).env?.DEV; } catch { return false; } })();

function emit(kind: MetaKind, id: string, source?: string) {
  for (const cb of metaListeners) cb(kind, id, source);
  if (kind === 'achievement' || kind === 'secret' || kind === 'chime') {
    const w = (G.scenes.current as any)?.world;
    w?.bus?.emit?.(kind, { id });
  }
}

let dirty = false;
let flushT = 0;
function touch() { dirty = true; }
/** write pending Stats / Flags / Terms changes now */
export function flushRegistry(): void {
  if (!dirty) return;
  dirty = false;
  saveProfile();
}
/** called every tick by main.ts: flushes dirty registry data every 4 s */
export function tickRegistry(dt: number): void {
  flushT += dt;
  if (flushT >= 4) { flushT = 0; flushRegistry(); }
}
try {
  window.addEventListener('pagehide', flushRegistry);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushRegistry(); });
} catch { /* not in a browser */ }

const addOnce = (list: string[], id: string) => { if (list.includes(id)) return false; list.push(id); return true; };

// ───────────────────────── achievements ─────────────────────────
export interface AchievementDef { id: string; name: L10n; desc: L10n; icon?: string; hidden?: boolean; reward?: string }
export const ACHIEVEMENTS: Record<string, AchievementDef> = {};
export function defineAchievement(d: AchievementDef): void { ACHIEVEMENTS[d.id] = d; }
/**
 * true the first time (and pops a toast). Ids without a definition are still recorded, but get no
 * toast (it would show a raw id to the player) and a warning in dev builds.
 */
export function achieve(id: string): boolean {
  if (!addOnce(profile.achievements, id)) return false;
  saveProfile();
  const d = ACHIEVEMENTS[id];
  if (d) Notices.push({ kind: 'achievement', name: d.name });
  else if (isDev) console.warn(`[registry] achieve('${id}'): no defineAchievement for this id — recorded without a toast`);
  emit('achievement', id);
  if (d?.reward) unlock(d.reward, `achievement:${id}`);
  return true;
}
export function hasAchievement(id: string): boolean { return profile.achievements.includes(id); }

// ───────────────────────── unlocks ─────────────────────────
export type UnlockKind = 'weapon' | 'hand' | 'keystone' | 'cosmetic' | 'mode' | 'station' | 'memory' | 'part' | 'aspect';
export interface UnlockDef { id: string; kind: UnlockKind; name: L10n; desc?: L10n; hint?: L10n }
export const UNLOCKS: Record<string, UnlockDef> = {};
const unlockListeners: ((id: string) => void)[] = [];
export function defineUnlock(d: UnlockDef): void { UNLOCKS[d.id] = d; }
/** true the first time; defined unlocks pop a toast */
export function unlock(id: string, source?: string): boolean {
  if (!addOnce(profile.unlocks, id)) return false;
  saveProfile();
  const d = UNLOCKS[id];
  if (d) Notices.push({ kind: 'unlock', name: d.name, sub: d.desc });
  emit('unlock', id, source);
  for (const cb of unlockListeners) cb(id);
  return true;
}
export function isUnlocked(id: string): boolean { return profile.unlocks.includes(id); }
export function onUnlock(cb: (id: string) => void): void { unlockListeners.push(cb); }

// ───────────────────────── cosmetics ─────────────────────────
export type CosmeticKind = 'scarf' | 'hat' | 'trail' | 'shadow' | 'title' | 'echoMask' | 'companion' | 'mode';
export interface CosmeticDef { id: string; kind: CosmeticKind; name: L10n; data?: any }
export const COSMETICS: Record<string, CosmeticDef> = {};
export function defineCosmetic(d: CosmeticDef): void { COSMETICS[d.id] = d; }
export const Cosmetics = {
  /** give the player a cosmetic; true the first time */
  grant(id: string): boolean {
    if (!addOnce(profile.cosmetics.owned, id)) return false;
    saveProfile();
    const d = COSMETICS[id];
    if (d) Notices.push({ kind: 'unlock', name: d.name, label: L('新外观', 'New cosmetic') });
    emit('cosmetic', id);
    return true;
  },
  owns(id: string): boolean { return profile.cosmetics.owned.includes(id); },
  /** equip into a kind slot (null clears it) */
  equip(kind: CosmeticKind, id: string | null): void {
    if (id) profile.cosmetics.equipped[kind] = id; else delete profile.cosmetics.equipped[kind];
    saveProfile();
  },
  equipped(kind: CosmeticKind): CosmeticDef | null {
    const id = profile.cosmetics.equipped[kind];
    return id ? COSMETICS[id] ?? null : null;
  },
};

// ───────────────────────── chimes (GDD2 §11.1) ─────────────────────────
export const CHIME_IDS = ['strike', 'homecoming', 'wound', 'minutehand', 'patience', 'westminster', 'ghostwriter', 'lostminute', 'watchman', 'dissonance', 'midnight'] as const;
export type ChimeId = (typeof CHIME_IDS)[number];
export const CHIME_NAME: Record<ChimeId, L10n> = {
  strike: L('敲响', 'Strike'),
  homecoming: L('归家', 'Homecoming'),
  wound: L('上弦', 'Wound'),
  minutehand: L('分针', 'The Minute Hand'),
  patience: L('耐心', 'Patience'),
  westminster: L('威斯敏斯特', 'Westminster'),
  ghostwriter: L('代笔', 'Ghostwriter'),
  lostminute: L('失落的一分钟', 'Lost Minute'),
  watchman: L('守夜人', 'Night Watchman'),
  dissonance: L('不协和', 'Dissonance'),
  midnight: L('午夜·某处', 'Midnight Somewhere'),
};
export const Chimes = {
  /** ring a chime: true the first time (bell toll, toast, bus 'chime') */
  ring(id: ChimeId): boolean {
    if (!(CHIME_IDS as readonly string[]).includes(id)) return false;
    if (!addOnce(profile.chimes, id)) return false;
    saveProfile();
    const n = profile.chimes.length;
    Notices.push({
      kind: 'chime',
      name: CHIME_NAME[id],
      label: L(`钟响 · 第 ${n} / 11 响`, `Chime · ${n} of 11`),
      sub: Terms.showPlain('chime') ? term('chime')?.plain : undefined,
    });
    Terms.seen('chime');
    emit('chime', id);
    return true;
  },
  has(id: ChimeId): boolean { return profile.chimes.includes(id); },
  count(): number { return profile.chimes.filter((c) => (CHIME_IDS as readonly string[]).includes(c)).length; },
};

// ───────────────────────── flags & stats ─────────────────────────
/** save-level numeric flags (eggs, one-time events, story beats) */
export const Flags = {
  get(id: string): number { return profile.flags[id] ?? 0; },
  set(id: string, v: number): void { if (profile.flags[id] !== v) { profile.flags[id] = v; touch(); } },
  inc(id: string, n = 1): number { const v = (profile.flags[id] ?? 0) + n; profile.flags[id] = v; touch(); return v; },
};
/** lifetime counters: rewindFrames, damage, deaths, catPets, tickDodges ... */
export const Stats = {
  add(id: string, n: number): void { if (!n) return; profile.stats[id] = (profile.stats[id] ?? 0) + n; touch(); },
  get(id: string): number { return profile.stats[id] ?? 0; },
};

// ───────────────────────── secrets ─────────────────────────
export const Secrets = {
  /** true the first time; pops a toast (payload.toast, or a generic line) */
  found(id: string, payload?: { toast?: L10n }): boolean {
    if (!addOnce(profile.secrets, id)) return false;
    saveProfile();
    Notices.push({ kind: 'secret', name: payload?.toast ?? L('这座城又少了一个秘密', 'The city keeps one secret fewer') });
    emit('secret', id);
    return true;
  },
  has(id: string): boolean { return profile.secrets.includes(id); },
};

// ───────────────────────── terms & teaching (GDD2 §9.8) ─────────────────────────
const termLastSeen = new Map<string, number>();
export const Terms = {
  /** should the plain-language line be shown under this term right now? */
  showPlain(id: string): boolean {
    const mode = settings.termHints;
    if (mode === 'always') return true;
    if (mode === 'off') return false;
    return (profile.termSeen[id] ?? 0) < 3;
  },
  /**
   * count one sighting of a term. Call once when a screen that shows the term opens; repeated calls
   * within 1.5 s for the same id count once, so calling it every frame is harmless.
   */
  seen(id: string): void {
    const now = G.time;
    const last = termLastSeen.get(id);
    termLastSeen.set(id, now);
    if (last !== undefined && now - last < 1.5) return;
    profile.termSeen[id] = (profile.termSeen[id] ?? 0) + 1;
    touch();
  },
  count(id: string): number { return profile.termSeen[id] ?? 0; },
};

const teachListeners: ((id: string) => void)[] = [];
/** progressive disclosure: HUD parts, notes and door labels show advanced elements once taught */
export const Teach = {
  has(id: string): boolean { return profile.taught.includes(id); },
  mark(id: string): void {
    if (!addOnce(profile.taught, id)) return;
    saveProfile();
    emit('teach', id);
    for (const cb of teachListeners) cb(id);
  },
  onMark(cb: (id: string) => void): void { teachListeners.push(cb); },
};

// ───────────────────────── debug ─────────────────────────
export function registryCounts() {
  return {
    achievements: { defined: Object.keys(ACHIEVEMENTS).length, earned: profile.achievements.length },
    unlocks: { defined: Object.keys(UNLOCKS).length, owned: profile.unlocks.length },
    cosmetics: { defined: Object.keys(COSMETICS).length, owned: profile.cosmetics.owned.length },
    chimes: { total: CHIME_IDS.length, rung: Chimes.count() },
    flags: Object.keys(profile.flags).length,
    stats: Object.keys(profile.stats).length,
    secrets: profile.secrets.length,
    termsSeen: Object.keys(profile.termSeen).length,
    taught: profile.taught.length,
  };
}
