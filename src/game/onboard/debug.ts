// F4a debug routes (ONBOARD2 §11.6) and the base of window.__tut (§11.7).
//
// Routes (registered here, tried before boot's built-ins; all return false so boot carries on):
//   ?onboard=fresh|skip|lite|off|full|prologueDone|taught:<id,id>   a profile preset in memory before boot
//            (fresh = no taught verbs, no onboard / coach / prompt flags, no did.* stats, prologue not
//            done; skip / lite / off / full set the guidance mode for the session — core.ts)
//   ?glyph=kbm|kb|pad                       force the prompt glyph family (kb = the keyboard-only column)
//   ?stagedebug=1 · ?tutlog=1               draw the Stage's obstacles and docks · print __tut.log
//   ?gates=1|0                              base gates on / off (gates.ts)
//   ?scene=p0 · ?scene=prologue[&lesson&phase&step&help] · ?lesson=<id>[&where=calm|sandbox]
//   ?inrun=fork|scrub · ?autoplay=onboard[&fumble=1] · ?room=tutorial (→ prologue)
//                                           skeletons until their scenes land (F4a days 5–8): they say
//                                           so in the console and boot goes on as before
//
// __tut base (F4b hangs coach / death / guide / hall on it with Tut.register):
//   where lesson phase step · wait(ev, simSec) · freeze() thaw() · hold(code, simSec) tap(code)
//   walkToward('door'|'marker'|'objective', simSec) · autopilot(on) · caption audit() attempts fails
//   help demoPlays gates taught clock log · next() skipLesson() setHelp(n)
import type { World } from '../world/world';
import type { Player } from '../entities/player';
import { G } from '../G';
import { registerDebugRoute } from '../debugRoutes';
import { profile } from '../save';
import { glyphs } from '../../engine/input';
import { GameHooks } from '../hooks';
import { GameScene } from '../scenes/game';
import { HubScene } from '../scenes/hub';
import { TitleScene } from '../scenes/title';
import { Door } from '../entities/door';
import * as Down from '../systems/downed';
import { Onboard, Tut, tut, tutCounts, TEACH_VERBS } from './core';
import { Gates } from './gates';
import { Stage } from './stage';
import { Lessons } from './lesson';

// ───────────────────────── routes ─────────────────────────
/** what the prologue leaves taught (ONBOARD2 §2.8 epilogue) */
const AFTER_PROLOGUE = ['move', 'attack', 'dash', 'undo', 'echo', 'paradox', 'hall.undo', 'hall.echo', 'hall.paradox'];
function teachInMemory(ids: string[]) { for (const id of ids) if (id && !profile.taught.includes(id)) profile.taught.push(id); }
export function applyOnboardPreset(v: string): void {
  if (v === 'fresh') {
    const drop = new Set<string>();
    for (const t of TEACH_VERBS) { drop.add(t); drop.add(t + ':soft'); }
    profile.taught = profile.taught.filter((id) => !drop.has(id) && !id.startsWith('hall.') && !id.startsWith('star.'));
    for (const k of Object.keys(profile.flags)) if (/^(onboard|coach|prompt)\./.test(k)) delete profile.flags[k];
    for (const k of Object.keys(profile.stats)) if (k.startsWith('did.')) delete profile.stats[k];
    profile.prologueDone = false;
  } else if (v === 'prologueDone') {
    profile.prologueDone = true;
    teachInMemory(AFTER_PROLOGUE);
  } else if (v.startsWith('taught:')) {
    teachInMemory(v.slice(7).split(','));
  }
}
const later = (what: string) => console.info(`[onboard] ${what} lands with F4a's later days; booting as before`);

registerDebugRoute('onboard', (q) => {
  const v = q.get('onboard');
  if (v) { applyOnboardPreset(v); Tut.log('preset', { onboard: v, mode: Onboard.mode() }); }
  return false;
});
registerDebugRoute('glyph', (q) => {
  const v = q.get('glyph');
  if (v === 'kbm' || v === 'kb' || v === 'pad') glyphs.force = v;
  return false;
});
registerDebugRoute('scene=p0|prologue', (q) => {
  const s = q.get('scene');
  if (s === 'p0') later('?scene=p0 (the first-launch card)');
  if (s === 'prologue') later('?scene=prologue (the prologue)');
  return false;
});
registerDebugRoute('lesson|inrun', (q) => {
  if (q.has('lesson') && q.get('scene') !== 'prologue') later(`?lesson=${q.get('lesson')}`);
  if (q.has('inrun')) later(`?inrun=${q.get('inrun')}`);
  return false;
});
registerDebugRoute('autoplay', (q) => { if (q.get('autoplay') === 'onboard') later('?autoplay=onboard'); return false; });
// ?room=tutorial keeps the F3 tutorial room until the prologue replaces it (then: → ?scene=prologue&lesson=undo)
registerDebugRoute('stagedebug|tutlog', () => false);

// ───────────────────────── __tut ─────────────────────────
type Where = 'title' | 'p0' | 'prologue' | 'hub' | 'run' | 'hall' | 'guide' | 'other';
const sceneWorld = (): World | null => (G.scenes.current as unknown as { world?: World } | null)?.world ?? null;
const lead = (): Player | null => sceneWorld()?.players[0] ?? null;

/** bus events __tut.wait counts (only human hands: bots never count) */
const evCounts: Record<string, number> = {};
const bump = (k: string) => { evCounts[k] = (evCounts[k] ?? 0) + 1; };
const human = (p: Player | undefined) => !!p && p.input?.kind !== 'bot';
GameHooks.onRoomStart(({ w }) => {
  w.bus.on('damaged', (e) => { if (human(e.player)) bump('hit'); });
  w.bus.on('rewind', (e) => { if (human(e.player)) bump('rewind'); });
  w.bus.on('paradox', (e) => { if (human(e.player)) bump('paradox'); });
  w.bus.on('fork', (e) => { if (human(e.player)) bump('fork'); });
  w.bus.on('custom', (e) => { if (e.id === 'demoEnd') bump('demoEnd'); });
});
GameHooks.onRoomClear(() => bump('room:clear'));

/** the simulated clock waits run on (G.time advances once per fixed tick, ×speed, never with the wall clock) */
const simNow = () => G.time;
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
async function simWait(sec: number): Promise<void> { const t0 = simNow(); while (simNow() - t0 < sec) await frame(); }
const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));

function whereNow(): Where {
  if ((tut.guide as { open?: boolean } | undefined)?.open) return 'guide';
  const sc = G.scenes.current;
  if (sc instanceof GameScene) return sc.opt.kind === 'prologue' ? 'prologue' : sc.opt.kind === 'rehearsal' ? 'hall' : 'run';
  if (sc instanceof HubScene) return 'hub';
  if (sc instanceof TitleScene) return (tut.p0 as { open?: boolean } | undefined)?.open ? 'p0' : 'title';
  return 'other';
}

function waitCheck(ev: string): () => boolean {
  const counted = (n: () => number) => { const c0 = n(); return () => n() > c0; };
  switch (ev) {
    case 'caption': return counted(() => tutCounts.shown ?? 0);
    case 'success': return counted(() => tutCounts.success ?? 0);
    case 'hit': case 'rewind': case 'paradox': case 'fork': case 'demoEnd': case 'room:clear': return counted(() => evCounts[ev] ?? 0);
    case 'idle': return () => !Stage.list().length && !Lessons.active();
    case 'death': return () => { const w = sceneWorld(); return !!w && w.players.length > 0 && w.players.every((p) => Down.isOut(p)); };
    case 'phase:try': return () => base.phase === 'try';
    case 'phase:demo': return () => base.phase === 'demo';
  }
  if (ev.startsWith('lesson:')) { const id = ev.slice(7); return () => base.lesson === id; }
  if (ev.startsWith('where:')) { const w = ev.slice(6); return () => whereNow() === w; }
  console.warn(`[tut] wait('${ev}'): unknown event`);
  return () => false;
}

const base = {
  // ── state (sync only) ──
  get where(): Where { return whereNow(); },
  get lesson(): string | null { return Lessons.active(lead())?.id ?? null; },
  get phase(): string | null { return Lessons.active(lead())?.phase ?? null; },
  get step(): string | null { return Lessons.active(lead())?.stepKey ?? null; },
  // ── input and waiting (all on simulated time) ──
  async wait(ev: string, timeoutSec = 30): Promise<'ok' | 'timeout'> {
    const ok = waitCheck(ev);
    const t0 = simNow();
    while (!ok()) { if (simNow() - t0 >= timeoutSec) return 'timeout'; await frame(); }
    return 'ok';
  },
  freeze(): void { const w = sceneWorld(); if (w) w.stop = 1e9; },
  thaw(): void { const w = sceneWorld(); if (w) w.stop = 0; },
  async hold(code: string, simSec: number): Promise<void> { key(code, true); await simWait(simSec); key(code, false); },
  async tap(code: string): Promise<void> { key(code, true); await simWait(0.05); await frame(); key(code, false); },
  /** walk toward the nearest door (or, once the lessons land, the marker / objective) like a person looking at it */
  async walkToward(target: 'objective' | 'marker' | 'door', simSec = 1.5): Promise<void> {
    const held = new Set<string>();
    const set = (code: string, on: boolean) => { if (on && !held.has(code)) { key(code, true); held.add(code); } else if (!on && held.has(code)) { key(code, false); held.delete(code); } };
    const t0 = simNow();
    while (simNow() - t0 < simSec) {
      const w = sceneWorld(), p = lead();
      if (!w || !p) break;
      let tx = NaN, ty = NaN;
      if (target === 'door' || target === 'objective') {
        let bd = Infinity;
        for (const e of w.entities) if (e instanceof Door && !e.dead) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; tx = e.x; ty = e.y; } }
      } else {
        const m = (tut.marker as (() => { x: number; y: number } | null) | undefined)?.();
        if (m) { tx = m.x; ty = m.y; }
      }
      if (!isFinite(tx)) break;
      const dx = tx - p.x, dy = ty - p.y;
      if (Math.hypot(dx, dy) < 10) break;
      set('KeyD', dx > 4); set('KeyA', dx < -4); set('KeyS', dy > 4); set('KeyW', dy < -4);
      await frame();
    }
    for (const c of [...held]) set(c, false);
  },
  /** the QA bot takes over moving and fighting (after the first run's two lessons) — lands with F4a day 9 */
  autopilot(on: boolean): void { later(`__tut.autopilot(${on})`); },
  // ── CI only ──
  get caption() { return Stage.current(); },
  audit() { return Stage.audit(); },
  get attempts(): Record<string, number> { return Lessons.active(lead())?.attempts ?? {}; },
  get fails(): Record<string, string[]> { const r = Lessons.active(lead()); return r ? { [r.id]: r.fails } : {}; },
  get help(): number { return Lessons.active(lead())?.help ?? 0; },
  demoPlays: {} as Record<string, number>,
  get gates() { const p = lead(); return p ? { tapOnly: Gates.tapOnly(p), forkAllow: Gates.wouldFork(p), live: Gates.live, novice: Onboard.isNovice(p), mode: Onboard.mode() } : null; },
  get taught(): string[] { return profile.taught.slice(); },
  /** the prologue's clock (11:59:27), null outside it */
  clock: null as string | null,
  next(): void { later('__tut.next()'); },
  skipLesson(): void { const r = Lessons.active(lead()); if (r) r.skip(); },
  setHelp(n: number): void { const r = Lessons.active(lead()); if (r) r.help = Math.max(0, Math.min(3, n | 0)) as 0 | 1 | 2 | 3; },
};
// the base fields join whatever is already registered (log stays the shared array)
for (const k of Object.keys(Object.getOwnPropertyDescriptors(base))) {
  const d = Object.getOwnPropertyDescriptor(base, k)!;
  Object.defineProperty(tut, k, { ...d, configurable: true, enumerable: true });
}
