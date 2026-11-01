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
import { glyphs, PlayerInput } from '../../engine/input';
import { GameHooks } from '../hooks';
import { GameScene } from '../scenes/game';
import { HubScene } from '../scenes/hub';
import { TitleScene } from '../scenes/title';
import { Door } from '../entities/door';
import * as Down from '../systems/downed';
import { Onboard, Tut, tut, tutCounts, TEACH_VERBS } from './core';
import { Gates } from './gates';
import { Stage } from './stage';
import { Wipe } from './host';
import { Lessons, LessonFlags, tutDemoPlays, tutFails, tutAttempts, type LessonId, type StartOpts } from './lesson';

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
registerDebugRoute('scene=p0|prologue', async (q) => {
  const s = q.get('scene');
  if (s === 'p0') {
    const { openFirstLaunch } = await import('./firstLaunch');
    openFirstLaunch();
    return true;
  }
  if (s === 'prologue') {
    const { Prologue } = await import('../scenes/prologue');
    const lesson = q.get('lesson') as LessonId | 'report' | 'outro' | null;
    const phase = q.get('phase') as StartOpts['phase'] | null;
    const help = q.has('help') ? Number(q.get('help')) : undefined;
    Prologue.start(lesson ?? undefined, { phase: phase ?? undefined, step: q.get('step') ?? undefined, help });
    return true;
  }
  return false;
});
// ?lesson=<id>[&where=calm|sandbox] · ?inrun=fork|scrub (= ?lesson=<id>&where=calm): one lesson alone.
//   a prologue lesson → the prologue from that lesson; where=calm → a cleared first room of a real
//   run (seed / floor from the URL) with the lesson starting at once; sandbox → an empty rehearsal stage
registerDebugRoute('lesson|inrun', async (q) => {
  const id = (q.get('inrun') ?? (q.get('scene') ? null : q.get('lesson'))) as LessonId | null;
  if (!id) return false;
  const where = q.has('inrun') ? 'calm' : q.get('where') ?? 'sandbox';
  const { PROLOGUE_ORDER, Prologue } = await import('../scenes/prologue');
  if (PROLOGUE_ORDER.includes(id) && where !== 'calm') { Prologue.start(id); return true; }
  if (!Lessons.get(id)) { console.warn(`[onboard] ?lesson=${id}: no such lesson`); return false; }
  // a lesson needs what comes before it: the prologue's three (and Fork for Scrub)
  if (!q.has('onboard')) applyOnboardPreset('prologueDone');
  if (id === 'scrub') teachInMemory(['fork']);
  const [{ Run }, { ensurePlayers }, { Flow }, { SoftHost }] = await Promise.all([import('../run'), import('../players'), import('../flow'), import('./host')]);
  const seats = ensurePlayers();
  const seed = Number(q.get('seed') ?? 2);
  const run = new Run({ mode: where === 'calm' ? 'standard' : 'practice', seed, contracts: {}, players: seats.map((inp) => ({ slot: inp.slot, device: inp.device, hand: 'tick', weapon: q.get('weapon') ?? 'rapier' })) });
  run.floor = Number(q.get('floor') ?? 0);
  for (const lo of run.all) lo.hp = lo.mods.maxHp;
  pendingLesson = { id, where, host: (w, p) => new SoftHost(w, p) };
  const gs = new GameScene(run, where === 'calm' ? { kind: 'combat', reward: 'memory', patron: 'oren' } : { kind: 'prologue', reward: null }, seed);
  Flow.wire(gs);
  G.scenes.set(gs);
  return true;
});
let pendingLesson: { id: LessonId; where: string; host: (w: World, p: Player) => import('./host').SoftHost } | null = null;
GameHooks.onRoomStart(({ w, scene }) => {
  const pl = pendingLesson;
  if (!pl) return;
  pendingLesson = null;
  const sc = scene as GameScene;
  // the room is already cleared: no waves, the doors open
  sc.waves = [];
  sc.titleCard = null;
  if (!sc.cleared) { sc.cleared = true; sc.unlockDoors(); }
  w.after(0.6, () => {
    const p = w.players[0];
    if (!p || Lessons.active(p)) return;
    Lessons.start(pl.id, p, pl.where === 'calm' ? 'calm' : 'hall', pl.host(w, p));
  });
});
// ?autoplay=onboard[&fumble=1]: the lessons drive the hand with their own scripts (ONBOARD2 §3.9);
// read at load (not as a route: a route that takes over boot first would hide it)
if (G.debug.get('autoplay') === 'onboard') { LessonFlags.autoplay = true; LessonFlags.fumble = G.debug.get('fumble') === '1'; }
// ?room=tutorial still loads the retired tutorial room (a regression room: the dummy and two coglings);
// the lesson it used to teach is the prologue's L3: ?scene=prologue&lesson=undo
registerDebugRoute('stagedebug|tutlog', () => false);

// ───────────────────────── autoplay / autopilot: the QA bot fights between lessons ─────────────────────────
let autopilotOn = false;
const swapped = new WeakMap<Player, { bot: PlayerInput; real: PlayerInput }>();
Stage.onUpdate(() => {
  if (!LessonFlags.autoplay && !autopilotOn) return;
  const sc = G.scenes.current;
  if (!(sc instanceof GameScene) || sc.opt.kind === 'prologue') return;
  if (sc.overlays.some((o) => o.blocks)) return;
  const p = sc.world.players[0];
  if (!p) return;
  const s = swapped.get(p);
  if (Lessons.active(p)) {
    // a lesson drives the hand itself (its demo, its step scripts): give it the real input back
    if (s && p.input === s.bot) { p.input = s.real; s.bot.dispose(); swapped.delete(p); }
    return;
  }
  if (!s && p.input.kind !== 'bot' && (p.input.kind as string) !== 'demo' && p.state === 'alive') {
    const bot = new PlayerInput(p.slot, `bot${10 + p.slot}`);
    swapped.set(p, { bot, real: p.input });
    p.input = bot;
  }
});
// qarun prints window.__botLog: autoplay leaves a line per lesson and at the prologue's end
const botLog = () => (window as unknown as { __botLog?: string[] }).__botLog;
Tut.onLog((ev, data) => {
  if (!LessonFlags.autoplay) return;
  const d = data as { lesson?: string; how?: string } | undefined;
  if (ev === 'lessonEnd') botLog()?.push(`[tut] lessonEnd ${d?.lesson} ${d?.how} where=${whereNow()} taught=${profile.taught.filter((t) => !t.includes('.')).join(',')}`);
  if (ev === 'prologueDone') botLog()?.push(`[tut] prologueDone=${profile.prologueDone}`);
  if (ev === 'demo-desync') botLog()?.push(`[tut] demo-desync ${JSON.stringify(data)}`);
});
GameHooks.onHub(() => { if (LessonFlags.autoplay) botLog()?.push(`[tut] where=hub prologueDone=${profile.prologueDone} taught=${profile.taught.join(',')}`); });
GameHooks.onRoomStart(({ run }) => { if (LessonFlags.autoplay) botLog()?.push(`[tut] room floor=${run.floor} room=${run.roomIndex} lessonsThisRun=${run.flags['onboard.lessons'] ?? 0} taught=${profile.taught.filter((t) => !t.includes('.')).join(',')}`); });

// ───────────────────────── __tut ─────────────────────────
/** the prologue director, once its module has loaded (a dynamic import keeps the cycle out) */
let prologueRef: { active: boolean; clockS: number } | null = null;
void import('../scenes/prologue').then((m) => { prologueRef = m.Prologue; });
type Where = 'title' | 'p0' | 'prologue' | 'hub' | 'run' | 'hall' | 'guide' | 'other';
const sceneWorld = (): World | null => (G.scenes.current as unknown as { world?: World } | null)?.world ?? null;
const lead = (): Player | null => sceneWorld()?.players[0] ?? null;

/** bus events __tut.wait counts (only human hands: bots never count) */
const evCounts: Record<string, number> = {};
const bump = (k: string) => { evCounts[k] = (evCounts[k] ?? 0) + 1; };
const human = (p: Player | undefined) => !!p && p.input?.kind !== 'bot' && !p.renderTint;
/** the lead hand's recent rewinds and forks (CI evals read __tut.events) */
const evLog: unknown[] = [];
GameHooks.onRoomStart(({ w }) => {
  w.bus.on('damaged', (e) => { if (human(e.player)) bump('hit'); });
  w.bus.on('rewind', (e) => { if (human(e.player)) { bump('rewind'); evLog.push({ type: 'rewind', scrub: !!e.scrub, restored: e.restored, seconds: +(e.seconds ?? 0).toFixed(2), cost: Math.round(e.cost ?? 0), toX: Math.round(e.toX), toY: Math.round(e.toY) }); } });
  w.bus.on('fork', (e) => { if (human(e.player)) evLog.push({ type: 'fork', sand: Math.round(e.player?.lo.sand ?? 0) }); });
  w.bus.on('custom', (e) => { if (e.id === 'onboard.success') evLog.push({ type: 'success', id: (e.data as { id?: string })?.id }); });
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
    // a caption that has come up, once no scene transition or film wipe is over the screen (a
    // screenshot taken on it shows the line, not the wipe)
    case 'caption': { const c = counted(() => tutCounts.shown ?? 0); let hit = false; return () => (hit ||= c()) && !G.scenes.transitioning && !Wipe.active; }
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

let heldStop = 0;
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
  /** CI: put a line / card on the Stage (Stage.say) — the docking tests */
  say(o: Parameters<typeof Stage.say>[0]): void { Stage.say(o); },
  /** wait this many seconds of simulated time */
  async sleep(simSec: number): Promise<void> { await simWait(simSec); },
  /** CI: the player's state in one line (hp, Sand, tape, rewinding, echoes) */
  get me(): Record<string, unknown> | null {
    const p = lead();
    if (!p) return null;
    const pv = p.rewindPreview();
    return { hp: Math.round(p.hp), sand: Math.round(p.lo.sand), tape: +p.rec.seconds.toFixed(2), rw: !!p.rw, x: Math.round(p.x), y: Math.round(p.y), gain: pv.hpGain, cost: pv.cost, echoes: p.echoes.filter((e) => !e.dead).length, state: p.state };
  },
  /** CI: the last few bus events of the lead hand ({type, …}) */
  get events(): unknown[] { return evLog.slice(-12); },
  /** hold the world still for a screenshot (the FreezeGuide's own hold is kept: thaw restores it) */
  freeze(): void { const w = sceneWorld(); if (w) { if (w.stop < 1e6) heldStop = w.stop; w.stop = 2e9; } },
  thaw(): void { const w = sceneWorld(); if (w && w.stop >= 2e9 - 1) w.stop = heldStop; heldStop = 0; },
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
  /** the QA bot moves and fights while no lesson is running (lessons, the coach and notes carry on) */
  autopilot(on: boolean): void { autopilotOn = on; Tut.log('autopilot', { on }); },
  // ── CI only ──
  get caption() { return Stage.current(); },
  audit() { return Stage.audit(); },
  /** attempts per step: the running lesson's, else every lesson's so far ({lesson: {step: n}}) */
  get attempts(): Record<string, unknown> { return Lessons.active(lead())?.attempts ?? tutAttempts; },
  /** failed steps per lesson (kept after the lesson ends) */
  get fails(): Record<string, string[]> { return tutFails; },
  get help(): number { return Lessons.active(lead())?.help ?? 0; },
  get demoPlays(): Record<string, number> { return tutDemoPlays; },
  get gates() { const p = lead(); return p ? { tapOnly: Gates.tapOnly(p), forkAllow: Gates.wouldFork(p), live: Gates.live, novice: Onboard.isNovice(p), mode: Onboard.mode() } : null; },
  get taught(): string[] { return profile.taught.slice(); },
  /** the prologue's clock (11:59:27), null outside it */
  get clock(): string | null { return prologueRef?.active ? `11:59:${String(Math.min(59, prologueRef.clockS)).padStart(2, '0')}` : null; },
  /** CI: the running lesson succeeds now */
  next(): void { const r = Lessons.runner(Lessons.active(lead())); if (r) { if (r.phase === 'try') r.succeed(); else r.end('success'); } },
  skipLesson(): void { const r = Lessons.active(lead()); if (r) r.skip(); },
  setHelp(n: number): void { const r = Lessons.active(lead()); if (r) r.help = Math.max(0, Math.min(3, n | 0)) as 0 | 1 | 2 | 3; },
};
// the base fields join whatever is already registered (log stays the shared array)
for (const k of Object.keys(Object.getOwnPropertyDescriptors(base))) {
  const d = Object.getOwnPropertyDescriptor(base, k)!;
  Object.defineProperty(tut, k, { ...d, configurable: true, enumerable: true });
}
