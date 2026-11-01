// The Rehearsal Hall (ONBOARD2 §8): the workshop's practice room, open from the very first visit.
//
//   · The way in: a curtained arch by the workshop's west wall, placed through GameHooks.onHub (no
//     edit to hub.ts); its brass "!" pulses while there is a new lesson or a ★ to win. Coming back
//     out (Flow.hub('rehearsal')) puts the hand in front of the arch again.
//   · The room (kind 'rehearsal', 36×17 flat): the lesson board on the north wall, the rehearsal
//     curtain the lesson loops play on, the brass stage ring (lessons put the hand at its front),
//     the dummy yard with its healing lever (west), Ines's prompter (south-east) and the way out.
//   · Nobody stops here: HP never stays under 10% (except in the Last Second lesson), a stopped hand
//     stands straight back up, Sand is endless unless the prompter says otherwise.
//   · The workshop's first-visit steps (talk to Ines → wind the Mainspring → (optional) the Hall →
//     the big door) as one objective line at the top while no run has been started yet.
//
// Debug: ?scene=rehearsal[&lesson=<id>][&players=N] · __tut.hall.board() / .active()
import type { Player } from '../entities/player';
import type { Renderer } from '../../engine/gfx/renderer';
import type { L10n } from '../i18n';
import type { HubScene } from '../scenes/hub';
import type { StageHost } from '../onboard/host';
import type { LessonRun } from '../onboard/lesson';
import type { Overlay } from '../ui/overlay';
import { G, sfx } from '../G';
import { S, term } from '../strings';
import { tr } from '../i18n';
import { Entity } from '../entities/entity';
import { Interactable } from '../entities/interact';
import { drawSprite } from '../../engine/gfx/sprite';
import { col } from '../../art/palette';
import { profile } from '../save';
import { Flags, Teach, Terms } from '../meta/registry';
import { GameHooks } from '../hooks';
import { GameScene } from '../scenes/game';
import { RoomTypes } from './registry';
import { registerDebugRoute } from '../debugRoutes';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { drawTermLabel, drawPanel } from '../ui/widgets';
import { Panels } from '../ui/panels';
import { MenuList } from '../ui/menu';
import { hallArch, lessonBoard, rehearsalCurtain, prompterStand, leverSprites } from '../../art/sprites/hall';
import { Onboard, Tut } from '../onboard/core';
import { Stage } from '../onboard/stage';
import { Lessons } from '../onboard/lesson';
import { LoopPlayer, STAGE_W, STAGE_H } from '../onboard/loopPlayer';
import { LOOPS } from '../onboard/loops';
import { HallDummy, HallRunner, TrialRun, TRIALS, makeHost, realRunner, payTickNow, activeTrial, hallRuns } from '../onboard/lessons/hall';
import { HALL_ROWS, nameOf } from '../onboard/lessons/advanced';
import { todaysDrill, verbName } from '../onboard/coach/mastery';
import { takeHallLesson } from '../onboard/coach/deathCard';
import { WallLamp, WallGear } from '../entities/props';
import { renderRoom } from '../world/roomRender';
import { HUB_THEME } from '../scenes/hub';
import { presetFromUrl } from '../onboard/coach/debug';
import { Callouts } from '../ui/callouts';
import '../strings/coach';

const C = (k: string): L10n => S('coach', k);

// ───────────────────────── the Hall's state ─────────────────────────
interface Opts { hurt: boolean; half: boolean; sand: 'inf' | 'real' }
export const hallOpts: Opts = { hurt: true, half: false, sand: 'inf' };
/** what the board opens on */
let pending: { lesson?: string } | null = null;
/** the lesson the curtain previews (the board's selection, the lesson on stage) */
let curtainLesson = 'undo';
interface StageUse { p: Player; run: LessonRun | null; trial: TrialRun | null; lesson: string; host: StageHost | null; ask: boolean; spot: { x: number; y: number } }
const uses: StageUse[] = [];

const sceneOf = () => (G.scenes.current instanceof GameScene && G.scenes.current.opt.kind === 'rehearsal' ? G.scenes.current : null);
function centre(scene: GameScene) { const c = scene.center(); return { x: Math.round(c.x), y: Math.round(c.y) }; }
/** the brass stage: the room's own inlaid clock ring (roomRender: the floor centre, r40); co-op: two halves */
function stageMid(scene: GameScene) { const m = scene.world.map; return { x: Math.floor(m.pw / 2), y: Math.floor(m.ph / 2) + 8 }; }
function stageAt(scene: GameScene, half: -1 | 0 | 1) { const c = stageMid(scene); return { x: c.x + half * 56, y: c.y }; }
export function rowOf(id: string) { return HALL_ROWS.find((r) => r.id === id) ?? null; }

export const Hall = {
  /** walk into the Hall (the workshop's arch, the guide's "practise", the death card): optionally on a lesson */
  enter(o: { lesson?: string } = {}): void {
    pending = o;
    if (sceneOf()) { if (o.lesson) Hall.openBoard(o.lesson); return; }
    void import('../flow').then(({ Flow }) => {
      const config = { ...Flow.configFromSeats(), mode: 'practice' as const };
      const run = Flow.newRun(config);
      const gs = new GameScene(run, { kind: 'rehearsal', reward: null });
      Flow.wire(gs);
      G.scenes.go(() => gs, 'clock', 0.5);
    });
  },
  openBoard(lesson?: string, by?: Player | null) {
    const sc = sceneOf();
    if (!sc || sc.overlays.some((o) => o.blocks)) return;
    const who = by ?? sc.world.players[0];
    const b = Panels.open('rehearsal', { who: who?.input, slot: who?.slot ?? 0, lesson });
    if (b) sc.overlays.push(b);
  },
  /** the curtain previews this lesson */
  preview(id: string) { curtainLesson = id; },
  /** start lesson `id` for hand p on the stage */
  startLesson(id: string, p: Player) {
    const sc = sceneOf();
    if (!sc) return;
    if (id === 'prologue') { replayPrologue(); return; }
    const def = Lessons.get(id);
    if (!def) return;
    const use = mkUse(sc, p, id);
    if (!use) return;
    curtainLesson = id;
    moveTo(p, use.spot, () => {
      use.host = makeHost(sc.world, p);
      const done = (how: string) => { if (how === 'success') { payTickNow(id, p); askStar(use); } else release(use); };
      if (realRunner()) { use.run = Lessons.start(id, p, 'hall', use.host); watchRun(use, done); }
      else use.run = new HallRunner(def, p, 'hall', use.host, done);
    });
  },
  startTrial(id: string, p: Player) {
    const sc = sceneOf();
    const def = TRIALS[id];
    if (!sc || !def) return;
    const use = uses.find((u) => u.p === p) ?? mkUse(sc, p, id);
    if (!use) return;
    use.ask = false;
    curtainLesson = id;
    moveTo(p, use.spot, () => {
      use.host = makeHost(sc.world, p);
      use.trial = new TrialRun(def, p, use.host, () => { use.trial = null; release(use); }, hallOpts.half);
    });
  },
  active(p?: Player | null): StageUse | null { return uses.find((u) => !p || u.p === p) ?? null; },
};
function mkUse(sc: GameScene, p: Player, lesson: string): StageUse | null {
  if (uses.some((u) => u.p === p)) return null;
  // solo: the middle; co-op: the free half (two lessons at once)
  const halves: (-1 | 0 | 1)[] = sc.world.playerCount > 1 ? [-1, 1] : [0];
  const half = halves.find((h) => !uses.some((u) => Math.abs(u.spot.x - stageAt(sc, h).x) < 4));
  if (half === undefined) return null;
  const s = stageAt(sc, half);
  const u: StageUse = { p, run: null, trial: null, lesson, host: null, ask: false, spot: { x: s.x, y: s.y + 40 } };
  uses.push(u);
  return u;
}
function release(u: StageUse) { const i = uses.indexOf(u); if (i >= 0) uses.splice(i, 1); }
/** F4a's runner: hear when its run ends (Lessons.runner(run).onEnd) */
function watchRun(u: StageUse, done: (how: string) => void) {
  const r = (Lessons as unknown as { runner?: (run: LessonRun | null) => { onEnd(cb: (how: string) => void): void } | null }).runner?.(u.run);
  if (r) r.onEnd(done); else done('abort');
}
/** after a ✓: "Again: {goal} · {@confirm} trial · {@cancel} board" */
function askStar(u: StageUse) {
  const t = TRIALS[u.lesson];
  if (!t) { release(u); return; }
  u.ask = true;
  const goal = tr(t.goal);
  Stage.say({ key: 'hall.ask', slot: u.p.slot, who: u.p.input, tier: 'A', dur: 10, until: () => !u.ask, text: () => tr(C('hallStarAsk')).replace('{goal}', goal) });
}
/** a hand glides to its spot on the stage (0.3 s), its tape refilled where it stands */
const movers: { p: Player; x0: number; y0: number; x1: number; y1: number; t: number; then: () => void }[] = [];
function moveTo(p: Player, to: { x: number; y: number }, then: () => void) {
  movers.push({ p, x0: p.x, y0: p.y, x1: to.x, y1: to.y, t: 0, then });
  p.locked = true;
}
function replayPrologue() {
  // the prologue is F4a's scene; it exposes its start for the Hall (a replay never pays its shards again)
  const go = (window as unknown as { __onboardPrologue?: () => void }).__onboardPrologue;
  if (go) go(); else Stage.say({ key: 'hall.soon', tier: 'B', text: C('hallLockSoon'), dur: 2 });
}

// ───────────────────────── the room ─────────────────────────
RoomTypes.register('rehearsal', {
  label: S('coach', 'hallBoardSign'), icon: 'rest', color: 'B5', combat: false, advancesRoom: false,
  weight: () => 0,
  build: (s) => buildHall(s),
});

function buildHall(s: GameScene) {
  const w = s.world;
  const c = centre(s);
  // the workshop's own warm room (its theme, lamps and music), not the floor's biome
  for (const e of w.entities) if ((e as { kind?: string }).kind !== 'player') e.dead = true;
  w.theme = HUB_THEME;
  w.vis = renderRoom(w.map, HUB_THEME, 7);
  for (const p of w.map.props) {
    if (p.type === 'walllamp') w.add(new WallLamp(p.tx, p.ty, 'O3', 'O2'));
    else if (p.type === 'wallgear') w.add(new WallGear(p.tx, p.ty, !!p.data?.big));
  }
  w.after(0.05, () => G.music.play('hub', 1.2), s);
  // no doors out of the Hall but its arch (the generated ones go; their walls stay shut)
  for (const d of s.doors) d.dead = true;
  s.doors.length = 0;
  s.titleCard = null;
  w.add(new HallKeeper(s));
  w.add(new BoardStand(c.x, c.y - 120));
  w.add(new Curtain(c.x, c.y - 20));
  w.add(new ExitArch(c.x - 270, c.y + 34));
  w.add(new Prompter(c.x + 136, c.y + 100));
  const yard: HallDummy[] = [];
  const modes: ('idle' | 'punch' | 'slowPunch')[] = ['idle', 'punch', 'slowPunch'];
  [-80, 0, 80].forEach((dy, i) => { const d = new HallDummy(c.x - 224, c.y + dy, modes[i]); d.heals = true; yard.push(w.add(d)); });
  w.add(new Lever(c.x - 256, c.y + 40, yard));
  if (!Flags.get('hall.visited') || pending?.lesson) w.after(1.1, () => Hall.openBoard(pending?.lesson), s);
  Flags.set('hall.visited', 1);
  Terms.seen('hall');
  uses.length = 0;
  movers.length = 0;
  Tut.log('hallEnter', { lesson: pending?.lesson ?? null });
}

/** the Hall's rules each tick: endless Sand, nobody stops, the half-speed option, movers, the star question */
class HallKeeper extends Entity {
  constructor(private s: GameScene) { super(); this.collides = false; }
  update(dt: number) {
    const w = this.world;
    for (const p of w.players) {
      const lesson = Lessons.active(p) ?? hallRuns().find((r) => r.p === p) ?? null;
      const lastSec = (!!lesson && String(lesson.id) === 'lastSecond') || activeTrial(p)?.def.id === 'lastSecond';
      if (hallOpts.sand === 'inf' || lesson || activeTrial(p)) p.lo.sand = p.lo.sandMax;
      if (p.state === 'alive' && !lastSec && p.hp > 0 && p.hp < 0.1 * p.maxHp) p.hp = p.maxHp;
      if (!hallOpts.hurt && p.state === 'alive') p.hp = p.maxHp;
      if (p.state === 'stopped' && (!lastSec || p.down.final || (w.playerCount <= 1 && p.down.lastSecond <= 0))) {
        p.revive(1, null, 'room');
        p.hp = p.maxHp;
        Stage.say({ key: 'hall.nostop', slot: p.slot, who: p.input, tier: 'B', text: C('hallNoStop'), dur: 2 });
      }
    }
    for (let i = movers.length - 1; i >= 0; i--) {
      const m = movers[i];
      m.t += dt / 0.3;
      const k = Math.min(1, m.t), e = 1 - (1 - k) * (1 - k);
      m.p.x = m.x0 + (m.x1 - m.x0) * e; m.p.y = m.y0 + (m.y1 - m.y0) * e;
      if (k >= 1) {
        movers.splice(i, 1);
        m.p.locked = false;
        m.p.rec.clear();
        m.p.rec.prefill(m.p.x, m.p.y, m.p.rec.capacity, { hp: Math.max(1, m.p.hp), fixed: m.p.fixedTaken, tempo: m.p.lo.tempo });
        m.then();
      }
    }
    for (const u of uses.slice()) {
      if (!u.ask) continue;
      const inp = u.p.input;
      if (inp.pressed('confirm')) { inp.consume('confirm'); u.ask = false; Stage.clear('hall.ask'); Hall.startTrial(u.lesson, u.p); }
      else if (inp.pressed('cancel')) { inp.consume('cancel'); u.ask = false; release(u); Hall.openBoard(u.lesson, u.p); }
    }
    // the room's first-room floor card is not for the Hall
    this.s.titleCard = null;
    // the prompter's half speed (★ does not count meanwhile)
    if (hallOpts.half && w.timeScale >= 0.99) w.timeScale = 0.5;
    if (!hallOpts.half && w.timeScale === 0.5) w.timeScale = 1;
  }
  render(r: Renderer) {
    // a warm spotlight over the brass stage
    const c = stageMid(this.s);
    r.lightAt(c.x, c.y, 96, 'O2', 0.6);
  }
}

/** the curtain: linen on brass rollers; the selected lesson's loop plays on it (UI layer) */
class Curtain extends Entity {
  t = 0;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.collides = false; this.solid = false; this.sortBias = -200; }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) { drawSprite(r.w, rehearsalCurtain(224, 108), this.x, this.y); }
  renderUnlit(r: Renderer) {
    const row = rowOf(curtainLesson);
    const def = LOOPS[row?.loop ?? 'undo'];
    const x = this.x - STAGE_W / 2, y = this.y - 98;
    const who = this.world.players[0]?.input;
    const t = this.t;
    const name = row ? (row.id === 'prologue' ? tr(C('hallPrologue')) : nameOf(row.id)) : '';
    r.worldUi((ctx, toUi) => {
      const q = toUi(x, y);
      // the loop "projected" on the linen: no floor of its own, just a faint stage line
      ctx.globalAlpha = 0.25; rect(ctx, q.x + 4, q.y + 57, STAGE_W - 8, 1, 'S1'); ctx.globalAlpha = 1;
      LoopPlayer.draw(ctx, def, t, q.x, q.y, { scale: 1, who, bg: false });
      // the curtain's picture is the lesson's demo: teaching lines keep off it (next frame)
      Callouts.avoidUi(q.x, q.y, STAGE_W, STAGE_H + 10);
      Text.draw(ctx, name, q.x + STAGE_W / 2, q.y + STAGE_H + 4, { size: 'small', color: 'B0', align: 'center', shadow: false });
    });
  }
}

/** the lesson board on the north wall: {@interact} opens it */
class BoardStand extends Interactable {
  range = 36;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.collides = false; }
  prompt() { return tr(C('hallBoardOpen')); }
  interact() { Hall.openBoard(undefined, this.user); }
  render(r: Renderer) { drawSprite(r.w, lessonBoard(), this.x, this.y - 18); }
  promptY() { return 62; }
}
/** the way back to the workshop */
class ExitArch extends Interactable {
  range = 26;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.collides = false; }
  prompt() { return tr(C('hallExit')); }
  interact() {
    for (const u of uses.slice()) { u.run?.postpone?.(); u.trial?.finish(false); }
    uses.length = 0;
    void import('../flow').then(({ Flow }) => Flow.hub('rehearsal'));
  }
  render(r: Renderer) { drawSprite(r.w, hallArch(), this.x, this.y); }
  promptY() { return 44; }
}
/** the dummy yard's lever: healing on / off */
class Lever extends Interactable {
  range = 22;
  heal = true;
  constructor(x: number, y: number, private yard: HallDummy[]) { super(); this.x = x; this.y = y; this.collides = false; }
  prompt() { return tr(C('hallLever')).replace('{x}', tr(this.heal ? C('hallLeverHeal') : C('hallLeverNoHeal'))); }
  interact() { this.heal = !this.heal; for (const d of this.yard) d.heals = this.heal; sfx('clank', { vol: 0.5 }); }
  render(r: Renderer) { drawSprite(r.w, leverSprites()[this.heal ? 0 : 1], this.x, this.y); }
}
/** Ines's prompter: the Hall's practice options */
class Prompter extends Interactable {
  range = 24;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.collides = false; }
  prompt() { return tr(C('hallPrompter')); }
  interact() { const sc = sceneOf(); if (sc) sc.overlays.push(new PrompterPanel()); }
  render(r: Renderer) { drawSprite(r.w, prompterStand(), this.x, this.y); }
}

class PrompterPanel implements Overlay {
  blocks = true;
  hidesNotes = true;
  list: MenuList;
  done = false;
  constructor() {
    const onOff = () => [{ label: tr(C('hallOptOn')), value: 'on' }, { label: tr(C('hallOptOff')), value: 'off' }];
    let resetArmed = false;
    this.list = new MenuList([
      { label: () => tr(C('hallOptHurt')), kind: 'choice', get options() { return onOff(); }, get: () => (hallOpts.hurt ? 'on' : 'off'), set: (v: string) => { hallOpts.hurt = v === 'on'; } },
      { label: () => tr(C('hallOptTime')), kind: 'choice', options: [{ label: '100%', value: '1' }, { label: '50%', value: '0.5' }], get: () => (hallOpts.half ? '0.5' : '1'), set: (v: string) => { hallOpts.half = v === '0.5'; }, hint: () => tr(C('hallHalfSpeed')) },
      { label: () => tr(C('hallOptSand')), kind: 'choice', get options() { return [{ label: tr(C('hallInfinite')), value: 'inf' }, { label: tr(C('hallOptReal')), value: 'real' }]; }, get: () => hallOpts.sand, set: (v: string) => { hallOpts.sand = v === 'real' ? 'real' : 'inf'; } },
      { label: () => tr(C('hallOptFoes')), kind: 'choice', get options() { return [{ label: tr(C('hallOptNone')), value: 'none' }, { label: tr(C('hallOptCog')), value: 'cog' }]; }, get: () => 'none', set: (v: string) => { if (v === 'cog') void spawnPracticeFoes(); } },
      { label: () => tr(resetArmed ? S('coach', 'setResetConfirm') : C('hallOptReset')), act: () => { if (!resetArmed) { resetArmed = true; return; } Onboard.reset(); resetArmed = false; sfx('uiSelect'); } },
      { label: () => tr({ zh: '返回', en: 'Back' }), act: () => { this.done = true; } },
    ]);
  }
  update(dt: number) {
    if (G.input.pressed('cancel') || G.input.pressed('pause')) { G.input.consume('pause'); sfx('uiBack'); return false; }
    this.list.update(dt);
    return !this.done;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.5; rect(ctx, 0, 0, 640, 360, 'K0'); ctx.globalAlpha = 1;
    const top = 70, lb = Math.ceil(Text.lineH('body'));
    drawPanel(ctx, 190, top, 260, 220, 'paper');
    Text.draw(ctx, C('hallPrompterTitle'), 320, top + 10, { color: 'B1', align: 'center', shadow: false });
    rect(ctx, 204, top + 10 + lb + 3, 232, 1, 'S2');
    this.list.maxH = 220 - lb - 60;
    this.list.render(ctx, 212, top + 10 + lb + 14, 216);
  }
}
async function spawnPracticeFoes() {
  const sc = sceneOf();
  if (!sc) return;
  const { Cogling } = await import('../entities/enemies/gearworks');
  const c = centre(sc);
  for (const dx of [200, 236]) sc.world.add(new Cogling(c.x + dx, c.y + 20));
}

// ───────────────────────── the workshop side: the arch, its "!", the first-visit steps ─────────────────────────
/** where the arch stands in the workshop (by the west wall, between the grand clock and the plant) */
const HUB_ARCH = { dx: -218, dy: -26 };
class HubArch extends Interactable {
  range = 28;
  glowT = 0;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.collides = false; }
  prompt() { return tr(term('hall')?.name ?? C('hallBoardSign')); }
  interact() { Hall.enter(); }
  update(dt: number) { super.update(dt); if (this.glowT > 0) this.glowT -= dt; }
  render(r: Renderer) {
    drawSprite(r.w, hallArch(), this.x, this.y);
    r.lightAt(this.x, this.y - 18, 34, 'R3', 0.35 + (this.glowT > 0 ? 0.4 * Math.abs(Math.sin(this.glowT * 6)) : 0));
  }
  renderUnlit(r: Renderer) {
    super.renderUnlit(r);
    const p = this.world.players[0];
    const near = !!p && Math.hypot(p.x - this.x, p.y - this.y) < 96;
    const fresh = hallHasNews();
    const x = this.x, y = this.y - 40;
    const drill = near ? todaysDrill() : null;
    const showName = near && !this.near;
    r.worldUi((ctx, toUi) => {
      const q = toUi(x, y);
      if (fresh || this.glowT > 0) {
        // a brass "!" bobbing over the lintel
        const b = Math.round(Math.sin(G.time * 5) * 1.5);
        rect(ctx, q.x - 3, q.y - 14 + b, 7, 12, 'K0');
        rect(ctx, q.x - 2, q.y - 13 + b, 5, 10, 'B5');
        rect(ctx, q.x - 1, q.y - 12 + b, 3, 5, 'B1'); rect(ctx, q.x - 1, q.y - 6 + b, 3, 2, 'B1');
      }
      if (showName) {
        // the name plate: "Rehearsal Hall — practise moves · you can't fall here" (plus today's drill)
        const lb = Text.lineH('body'), ls = Text.lineH('small');
        const nm = term('hall');
        const w = Math.max(Text.measure(nm?.name ?? '', 'body').w, Text.measure(nm?.plain ?? '', 'small').w) + 10;
        const y0 = q.y - 20 - lb - ls - 4;
        ctx.globalAlpha = 0.85; rect(ctx, q.x - w / 2, y0 - 2, w, lb + ls + 6, 'K0'); ctx.globalAlpha = 1;
        drawTermLabel(ctx, 'hall', q.x, y0, { size: 'body', align: 'center', color: 'B5', forcePlain: true });
        if (drill) Text.draw(ctx, tr(C('drillToday')).replace('{x}', tr(verbName(drill))), q.x, q.y + 48, { size: 'small', color: 'K9', align: 'center', plate: true });
      }
    });
  }
}
/** a new lesson to learn in the Hall (the "!" over the arch) */
function hallHasNews(): boolean {
  for (const r of HALL_ROWS) {
    if (r.group === 'prologue' || r.group === 'combat' || r.coop) continue;
    if (!r.unlocked(null).ok) continue;
    if (!Teach.has('hall.' + r.id) && !Onboard.taught(null, r.id)) return true;
  }
  return false;
}
let hubArch: HubArch | null = null;
GameHooks.onHub((scene: HubScene) => {
  const w = scene.world;
  const c = { x: w.map.pw / 2, y: w.map.ph / 2 + 8 };
  hubArch = w.add(new HubArch(Math.round(c.x + HUB_ARCH.dx), Math.round(c.y + HUB_ARCH.dy)));
  if (profile.runs === 0) w.add(new HubSteps());
  // the death card recommended a lesson (the same enemy twice or more): straight into the Hall on it
  const fromDeath = takeHallLesson();
  if (fromDeath) w.after(0.9, () => Hall.enter({ lesson: fromDeath }), w);
  // back out of the Hall: stand in front of its arch (the workshop itself is P6's; no edit there)
  void import('../flow').then(({ FlowHooks }) => {
    const a = hubArch;
    if (FlowHooks.lastHub !== 'rehearsal' || !a) return;
    w.players.forEach((p, i) => { p.x = a.x + 22 + i * 14; p.y = a.y + 12; p.rec.clear(); p.rec.prefill(p.x, p.y, p.rec.capacity, { hp: Math.max(1, p.hp) }); });
  });
});

/** the first visit's four steps as one line at the top of the workshop (drawn on the UI layer) */
class HubSteps extends Entity {
  private shownStep = -1;
  constructor() { super(); this.collides = false; }
  step(): number {
    if (profile.ines < 1) return 0;
    const wound = profile.clockNodes.length > 0 || Object.values(profile.nodes).some((v) => v > 0) || profile.shards < 5;
    if (!wound) return 1;
    if (!Flags.get('hall.visited')) return 2;
    return 3;
  }
  update() {
    const s = this.step();
    if (s !== this.shownStep) { if (s === 2 && hubArch) hubArch.glowT = 3; this.shownStep = s; }
  }
  render() {}
  renderUnlit(r: Renderer) {
    const s = this.step();
    const keys = ['hubStep1', 'hubStep2', 'hubStep3', 'hubStep4'];
    r.worldUi((ctx) => {
      const sc = G.scenes.current as { overlays?: { blocks: boolean }[] } | null;
      if (sc?.overlays?.length) return;
      const text = tr(C(keys[s]));
      const num = `${s + 1}/4`;
      const m = Text.measure(text, 'body');
      const nw = Math.ceil(G.digits.measure(num)) + 8;
      const w = Math.ceil(m.w) + nw + 20, h = Math.ceil(Text.lineH('body')) + 8;
      const x0 = Math.round(320 - w / 2), y0 = 8;
      ctx.globalAlpha = 0.85; rect(ctx, x0, y0, w, h, 'K0'); ctx.globalAlpha = 1;
      rect(ctx, x0, y0 + h, w, 1, 'B3');
      G.digits.draw(ctx, num, x0 + 8, y0 + h / 2 - 4.5 * Text.k, { fill: 'B5' });
      Text.draw(ctx, text, x0 + 8 + nw + 4, y0 + h / 2, { color: s === 2 ? 'K9' : 'K10', valign: 'middle' });
    });
  }
}

// ───────────────────────── debug + __tut.hall ─────────────────────────
registerDebugRoute('scene=rehearsal', async (q) => {
  if (q.get('scene') !== 'rehearsal') return false;
  presetFromUrl(q);
  const lesson = q.get('lesson') ?? undefined;
  const { Flow } = await import('../flow');
  const config = { ...Flow.configFromSeats(2), mode: 'practice' as const };
  const run = Flow.newRun(config);
  pending = { lesson };
  const gs = new GameScene(run, { kind: 'rehearsal', reward: null }, 2);
  Flow.wire(gs);
  G.scenes.set(gs);
  return true;
});
Tut.register('hall', {
  board() {
    const out: Record<string, { tick: boolean; star: boolean; locked: boolean }> = {};
    for (const r of HALL_ROWS) out[r.id] = { tick: Teach.has('hall.' + r.id), star: Teach.has('star.' + r.id), locked: !r.unlocked(sceneOf()?.world.players[0] ?? null).ok };
    return out;
  },
  active() { return uses.map((u) => ({ slot: u.p.slot, lesson: u.lesson, phase: u.run?.phase ?? (u.trial ? 'trial' : null), step: u.run?.stepKey ?? null, trial: u.trial ? { count: u.trial.count, need: u.trial.def.need } : null, ask: u.ask })); },
  start: (id: string, slot = 0) => { const p = sceneOf()?.world.players.find((q) => q.slot === slot); if (p) Hall.startLesson(id, p); },
  trial: (id: string, slot = 0) => { const p = sceneOf()?.world.players.find((q) => q.slot === slot); if (p) Hall.startTrial(id, p); },
  opts: hallOpts,
  shards: () => profile.shards,
  /** end every Hall lesson / trial (and any lesson the Hall's runner gives in a run) */
  skipAll: () => { for (const u of uses.slice()) { u.ask = false; u.trial?.finish(false); u.run?.skip?.(); release(u); } for (const r of hallRuns().slice()) r.skip(); },
  get curtain() { return curtainLesson; },
});
