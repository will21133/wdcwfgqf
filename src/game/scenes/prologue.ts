// 序章《最后一分钟》The Last Minute (ONBOARD2 §2; F4a). Six lessons, about four and a half minutes:
// move · strike (attack + dash) · undo · echo · paradox · final, then the report card and the
// epilogue (the clock stops at 11:59:59) and off to the workshop.
//
//   Prologue.start(from?)    a practice Run (seed 1159, not counted in profile.runs); every lesson
//                            phase is a fresh GameScene of kind 'prologue' (22×11, flat, no exits),
//                            built through a RebuildHost, so a retry is a brand-new World
//   the clock                top right, in the purse's place: 11:59:00 → … → 11:59:59, it jumps a few
//                            seconds 1.6 s into each lesson's success beat
//   the HUD                  L1–L2: health and dash pips only; from L3 the Tape and the Sand join;
//                            never the special dial, the build slots or the purse (Gates layer)
//   verbs                    Fork is off ("This lesson uses {@rewind}"); holding rewind is a tap
//   safety                   a hand that stops for good is wound back to the step's start at full health
//
// Routes: ?scene=prologue[&lesson=move|strike|undo|echo|paradox|final|report|outro][&phase=demo|try]
// [&step=<key>][&help=0..3] (onboard/debug.ts).
import type { Player } from '../entities/player';
import type { Overlay } from '../ui/overlay';
import type { Renderer } from '../../engine/gfx/renderer';
import type { LessonId, LessonRun, StartOpts } from '../onboard/lesson';
import { G, sfx } from '../G';
import { L } from '../i18n';
import { S } from '../strings';
import type { Run } from '../run';
import { GameScene } from './game';
import { RoomTypes } from '../rooms/registry';
import { GameHooks } from '../hooks';
import { Flow } from '../flow';
import { ensurePlayers } from '../players';
import { SeatWeapons } from '../ui/metaPanels';
import { profile, saveProfile } from '../save';
import { Teach, Flags } from '../meta/registry';
import { Hud } from '../ui/hud';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { drawPanel } from '../ui/widgets';
import { col } from '../../art/palette';
import { clockFace } from '../../art/sprites/onboard';
import { Lessons } from '../onboard/lesson';
import { RebuildHost } from '../onboard/host';
import { Gates } from '../onboard/gates';
import { Stage } from '../onboard/stage';
import { Rich } from '../onboard/rich';
import { ModelStrip, STRIP } from '../onboard/modelStrip';
import { Onboard, Tut } from '../onboard/core';
import { PracticeKnobs } from '../onboard/lessons/core';
import '../onboard/lessons/core';
import '../strings/onboard';

export const PROLOGUE_ORDER: LessonId[] = ['move', 'strike', 'undo', 'echo', 'paradox', 'final'];
/** seconds past 11:59:00 when each lesson starts, and the stop (ONBOARD2 §2.11) */
const CLOCK_AT = [0, 8, 18, 30, 42, 52, 59];
const SEED = 1159;
/** the shards the prologue pays once (ONBOARD2 §2.8) */
const PROLOGUE_SHARDS = 15;
/** HUD widgets the prologue never shows; and the ones only from L3 on */
const HUD_NEVER = new Set(['special', 'slots', 'brass', 'objective', 'tempo', 'keystone', 'metaKey']);
const HUD_FROM_L3 = new Set(['tape', 'sand', 'chain']);

type Phase = 'idle' | 'lesson' | 'report' | 'outro';

class PrologueDirector {
  active = false;
  phase: Phase = 'idle';
  run: Run | null = null;
  host: RebuildHost | null = null;
  idx = 0;
  lesson: LessonRun | null = null;
  skipped = new Set<string>();
  /** clock: shown seconds past 11:59, and the jump under way */
  clockS = 0;
  private jump: { from: number; to: number; t: number; at: number } | null = null;
  private ungate: (() => void) | null = null;
  private startOpts: StartOpts | undefined;
  private outroT = 0;
  private stopT = 0;
  private replaying = false;
  /** real seconds since the epilogue's clock stopped (the digits shake) */
  stopShake = 0;
  private told = new WeakSet<object>();
  /** G.time at the start (the prologue's length in simulated seconds: ONBOARD2 §2.11, ≤ 360) */
  private startG = 0;

  /** begin (or resume) the prologue; `from` = a lesson id, 'report' or 'outro' (debug) */
  start(from?: LessonId | 'report' | 'outro', opts?: StartOpts): void {
    this.replaying = profile.prologueDone;
    this.startG = G.time;
    this.active = true;
    this.skipped.clear();
    this.startOpts = opts;
    this.pushGates();
    const seats = ensurePlayers();
    const run = Flow.newRun({ mode: 'practice', seed: SEED, contracts: {}, players: seats.slice(0, 1).map((inp) => ({ slot: inp.slot, device: inp.device, hand: 'tick', weapon: SeatWeapons.get(inp.slot) })) });
    // practice: no crits (the dummy is built around the combo), and L5's training wheel
    run.bonuses.push({ apply: (m) => { m.critChance = 0; if (PracticeKnobs.standT !== null) m.echoStandT = PracticeKnobs.standT; } });
    run.recompute();
    for (const lo of run.all) { lo.hp = lo.mods.maxHp; lo.sand = lo.sandMax; }
    this.run = run;
    this.host = null;
    const at = from === 'report' || from === 'outro' ? PROLOGUE_ORDER.length - 1 : from ? Math.max(0, PROLOGUE_ORDER.indexOf(from)) : 0;
    this.idx = at;
    this.clockS = CLOCK_AT[at];
    this.jump = null;
    this.phase = 'lesson';
    Tut.log('prologue', { from: from ?? 'move' });
    if (from === 'report' || from === 'outro') {
      this.phase = from === 'report' ? 'report' : 'outro';
      this.clockS = 59;
      this.idx = PROLOGUE_ORDER.length;
    }
    G.scenes.go(() => this.makeScene(), 'fade', 0.6);
  }

  /** the room for the lesson at hand (each retry gets a fresh one) */
  makeScene(): GameScene {
    const s = new GameScene(this.run!, { kind: 'prologue', reward: null }, SEED + this.idx * 7);
    return s;
  }

  /** a prologue room just started (GameHooks.onRoomStart, after the Stage reset) */
  roomStarted(scene: GameScene): void {
    scene.titleCard = null;
    scene.onDeath = () => this.windBack();
    scene.onQuit = () => this.quit();
    // the prologue is one hand's rehearsal: other seats watch (C2 lanes are cut; ONBOARD2 §13.2)
    const w = scene.world;
    for (const q of w.players.slice(1)) { q.kill(); }
    w.players = w.players.slice(0, 1);
    const p = w.players[0];
    if (!p) return;
    if (this.phase === 'report' || this.phase === 'outro') { this.standForEnd(scene, p); return; }
    if (!this.host) {
      this.host = new RebuildHost(scene, () => this.makeScene(), (q) => this.prepare(q));
      this.startLesson(p);
    } else this.host.built(scene);
  }

  private prepare(p: Player): void {
    const lo = p.lo;
    lo.hp = lo.mods.maxHp;
    lo.sand = lo.sandMax;
    lo.tape = null;
  }

  private startLesson(p: Player): void {
    const id = PROLOGUE_ORDER[this.idx];
    Flags.set('onboard.prologueAt', this.idx);
    this.clockS = CLOCK_AT[this.idx];
    const opts = this.startOpts;
    this.startOpts = undefined;
    const run = Lessons.start(id, p, 'prologue', this.host!, opts);
    this.lesson = run;
    Lessons.runner(run)?.onEnd((how) => this.lessonEnded(id, how));
  }

  /** 1.6 s into the success beat the clock jumps to the next lesson's time */
  succeeded(id: LessonId): void {
    const i = PROLOGUE_ORDER.indexOf(id);
    if (i < 0 || !this.active) return;
    this.jump = { from: CLOCK_AT[i], to: CLOCK_AT[i + 1], t: 0, at: id === 'move' ? 0 : 1.6 };
  }

  private lessonEnded(id: LessonId, how: string): void {
    if (!this.active || how === 'abort') return;
    if (how === 'skip') { this.skipped.add(id); this.clockS = CLOCK_AT[this.idx + 1]; }
    this.lesson = null;
    this.idx++;
    if (this.idx >= PROLOGUE_ORDER.length) { this.toReport(); return; }
    this.host = null;
    G.scenes.go(() => this.makeScene(), 'clock', 0.5);
  }

  // ───────────────────────── the end: report card, epilogue ─────────────────────────
  private toReport(): void {
    this.phase = 'report';
    const sc = G.scenes.current;
    if (sc instanceof GameScene) {
      for (const p of sc.world.players) p.locked = true;
      sc.overlays.push(new ReportCard(() => this.toOutro()));
    }
  }
  /** a debug start at the report / outro: a quiet stage */
  private standForEnd(scene: GameScene, p: Player): void {
    p.locked = true;
    if (this.phase === 'report') scene.overlays.push(new ReportCard(() => this.toOutro()));
    else this.toOutro();
  }
  private toOutro(): void {
    this.phase = 'outro';
    this.outroT = 0;
    this.stopShake = 0;
    this.clockS = 59;
    sfx('clockStrike');
    G.r.params.flash = Math.max(G.r.params.flash ?? 0, 0.15);
  }
  private tickOutro(dt: number): void {
    this.outroT += dt;
    this.stopShake += dt;
    const p = (G.scenes.current as unknown as { world?: { players: Player[] } } | null)?.world?.players[0];
    if (this.outroT >= 0.6 && !this.told.has(LINE1)) { this.told.add(LINE1); Stage.say({ key: 'prologue.outro', tier: 'A', speaker: 'ines', text: S('onboard', 'out1'), dur: 2.6, who: p?.input }); }
    if (this.outroT >= 3.2 && !this.told.has(LINE2)) { this.told.add(LINE2); Stage.say({ key: 'prologue.outro', tier: 'A', speaker: 'ines', text: S('onboard', 'out2'), dur: 1.6, who: p?.input }); }
    if (this.outroT >= 4.9) this.finish();
  }
  /** the prologue is done: rewards, what it taught, the workshop */
  finish(): void {
    if (!this.active) return;
    const first = !profile.prologueDone;
    profile.prologueDone = true;
    if (first && !this.replaying) { profile.shards += PROLOGUE_SHARDS; profile.totalShards = (profile.totalShards ?? 0) + PROLOGUE_SHARDS; }
    for (const v of ['move', 'attack', 'dash']) Teach.mark(v);
    for (const v of ['undo', 'echo', 'paradox']) if (!this.skipped.has(v)) Teach.mark('hall.' + v);
    Flags.set('onboard.prologueAt', -1);
    saveProfile();
    Tut.log('prologueDone', { skipped: [...this.skipped], shards: first ? PROLOGUE_SHARDS : 0, sim: +(G.time - this.startG).toFixed(1) });
    this.stop();
    Flow.hub('start');
  }
  /** "skip the prologue" (the pause menu, F4b): everything counts as learned, no shards */
  skipAll(): void {
    Flags.set('onboard.skipped', 1);
    Onboard.skipAll();
    this.stop();
    Flow.hub('start');
  }
  /** quit to the title (the pause menu's abandon) */
  quit(): void { this.stop(); Flow.title(); }
  private stop(): void {
    if (this.lesson) { Lessons.runner(this.lesson)?.end('abort'); this.lesson = null; }
    this.active = false;
    this.phase = 'idle';
    this.host = null;
    this.ungate?.();
    this.ungate = null;
    PracticeKnobs.standT = null;
  }

  /** stopped for good: back to the step's start at full health (the prologue never ends in a death) */
  windBack(): void {
    const r = Lessons.runner(this.lesson);
    if (!r || r.ended) return;
    const key = r.stepKey;
    if (key) r.ctx.wipeTo(key);
  }
  /** every Stage update: the clock, the epilogue, the safety net */
  tick(dt: number): void {
    if (!this.active) return;
    if (this.jump) {
      const j = this.jump;
      j.t += dt;
      if (j.t >= j.at) {
        const k = Math.min(1, (j.t - j.at) / 0.5);
        if (j.t - dt < j.at) sfx('clockJump');
        this.clockS = Math.round(j.from + (j.to - j.from) * k);
        if (k >= 1) this.jump = null;
      }
    }
    if (this.phase === 'outro') this.tickOutro(dt);
    // a hand that stopped for good (the Last Second ran out) is wound back after a breath
    const sc = G.scenes.current;
    if (this.phase === 'lesson' && sc instanceof GameScene && sc.opt.kind === 'prologue') {
      const p = sc.world.players[0];
      if (p && p.state === 'stopped' && p.down.final) { this.stopT += dt; if (this.stopT > 1.4) { this.stopT = 0; this.windBack(); } }
      else this.stopT = 0;
    }
  }

  // ───────────────────────── gates (ONBOARD2 §2.0) ─────────────────────────
  private pushGates(): void {
    this.ungate?.();
    const told = new WeakSet<object>();
    this.ungate = Gates.push({
      name: 'prologue',
      tapOnly: () => true,
      forkAllow: () => false,
      onForkDenied: (p) => {
        // "This lesson uses {@rewind}" — once per stage
        const w = p.world;
        if (!w || told.has(w)) return;
        told.add(w);
        Stage.say({ key: 'gate.lessonUses', tier: 'B', text: S('onboard', 'lessonUses'), dur: 1.6, slot: p.slot, who: p.input, speaker: 'ines' });
      },
      // rewind (and its Shadow) arrive with L3; until then a press does nothing
      rewindAllow: () => (this.idx >= 2 ? undefined : false),
      shows: (_p, what) => (what === 'shadow' ? this.idx >= 2 || this.phase !== 'lesson' : false),
      hud: (id) => {
        if (HUD_NEVER.has(id)) return false;
        if (HUD_FROM_L3.has(id)) return this.idx >= 2;
        if (id === 'slots:empty') return false;
        return undefined;
      },
    });
  }
}
const LINE1 = {}, LINE2 = {};

export const Prologue = new PrologueDirector();

// the prologue's room: 22×11, flat, no exits (roomgen.ts); nothing to fight unless a lesson brings it
RoomTypes.register('prologue', {
  label: L('序章', 'Prologue'), icon: 'boss', combat: false, advancesRoom: false,
  weight: () => 0,
  build: (s) => { s.waves = []; s.cleared = true; },
});
GameHooks.onRoomStart(({ scene, kind }) => { if (kind === 'prologue' && Prologue.active) Prologue.roomStarted(scene as GameScene); });
Lessons.onComplete((id, _p, how) => { if (how !== 'skip' && Prologue.active) Prologue.succeeded(id); });
Stage.onUpdate((dt) => {
  const sc = G.scenes.current as unknown as { overlays?: Overlay[] } | null;
  if (sc?.overlays?.some((o) => o.blocks)) return;
  Prologue.tick(dt);
});

// ───────────────────────── the clock (in the purse's place) ─────────────────────────
Hud.register({
  id: 'prologueClock', area: 'corner', order: 5,
  visible: () => Prologue.active,
  draw(ctx, _p, r) {
    if (!Prologue.active) return;
    const s = Prologue.clockS;
    const stopped = Prologue.phase === 'outro';
    const txt = `11:59:${String(Math.min(59, s)).padStart(2, '0')}`;
    const x1 = r.x + r.w, y0 = r.y;
    const shake = stopped && Prologue.stopShake < 0.8 ? Math.round(Math.sin(Prologue.stopShake * 60) * 1) : 0;
    const w = G.digits.draw(ctx, txt, x1 + shake, y0 + 2, { fill: stopped ? 'B5' : 'K10', align: 'right', pop: 2 });
    const face = clockFace();
    const ix = Math.round(x1 - w - 10), iy = y0 + 9;
    const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(face.img, ix - face.ox, iy - face.oy);
    ctx.imageSmoothingEnabled = sm;
    // "3/6" under it
    const n = Math.min(PROLOGUE_ORDER.length, Prologue.idx + 1);
    Text.draw(ctx, `${n}/${PROLOGUE_ORDER.length}`, x1, y0 + 22, { size: 'small', color: 'K8', align: 'right' });
  },
});

// ───────────────────────── the report card (ONBOARD2 §2.8) ─────────────────────────
class ReportCard implements Overlay {
  blocks = true;
  private t = 0;
  private closing = -1;
  constructor(private done: () => void) { sfx('lessonPass'); }
  private rowsIn = 0;
  update(dt: number): boolean {
    this.t += dt;
    // each lesson's row stamps in after the last
    while (this.rowsIn < 3 && this.t >= 0.35 + this.rowsIn * 0.3) { this.rowsIn++; sfx('stampSlam', { vol: 0.6 }); }
    if (this.closing >= 0) { this.closing += dt; if (this.closing >= 0.25) { this.done(); return false; } return true; }
    if (this.t > 0.6 && (G.input.pressed('confirm') || G.input.pressed('attack'))) this.closing = 0;
    if (this.t >= 8) this.closing = 0;
    return true;
  }
  render(r: Renderer): void {
    const ctx = r.ui2;
    const a = Math.min(1, this.t / 0.25) * (this.closing >= 0 ? 1 - this.closing / 0.25 : 1);
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * a * 0.6; rect(ctx, 0, 0, 640, 360, 'K0'); ctx.globalAlpha = a0 * a;
    const W = 400, H = 210, x = 120, y = 75 + Math.round((1 - Math.min(1, this.t / 0.25)) * 6);
    drawPanel(ctx, x, y, W, H, 'paper');
    Text.draw(ctx, S('onboard', 'repTitle'), 320, y + 10, { size: 'title', color: 'B1', align: 'center', shadow: false });
    const rows: [string, string, string][] = [['undo', 'rep1n', 'rep1d'], ['echo', 'rep2n', 'rep2d'], ['paradox', 'rep3n', 'rep3d']];
    let yy = y + 14 + Math.ceil(Text.lineH('title')) + 6;
    const who = (G.scenes.current as unknown as { world?: { players: Player[] } } | null)?.world?.players[0]?.input ?? null;
    rows.forEach(([id, n, d], i) => {
      const done = !Prologue.skipped.has(id);
      // each row ticks in after the last (a stamp per lesson)
      const ra = Math.max(0, Math.min(1, (this.t - 0.35 - i * 0.3) / 0.15));
      if (ra <= 0) { yy += 22; return; }
      ctx.globalAlpha = a0 * a * ra;
      const cy = yy + 8;
      checkMark(ctx, x + 22, cy, done);
      const nw = Text.draw(ctx, S('onboard', n), x + 36, cy, { color: done ? 'K1' : 'K4', valign: 'middle', shadow: false }).w;
      Text.draw(ctx, '·', x + 40 + nw, cy, { color: 'S1', valign: 'middle', shadow: false });
      Rich.draw(ctx, done ? S('onboard', d) : S('onboard', 'repSkipped'), x + 50 + nw, cy, { color: done ? 'K2' : 'K4', valign: 'middle', who, outline: false, maxW: W - 70 - nw });
      yy += Math.max(22, Math.ceil(Text.lineH('body')) + 6);
    });
    ctx.globalAlpha = a0 * a;
    yy += 4;
    rect(ctx, x + 20, yy, W - 40, 1, 'S2');
    yy += 6;
    Text.draw(ctx, S('onboard', 'model1'), 320, yy, { size: 'small', color: 'K3', align: 'center', shadow: false });
    yy += Math.ceil(Text.lineH('small'));
    Text.draw(ctx, S('onboard', 'model2'), 320, yy, { size: 'small', color: 'K3', align: 'center', shadow: false });
    yy += Math.ceil(Text.lineH('small')) + 4;
    // the strip, fully lit, on a dark plate (it is drawn for dark backgrounds)
    const sw = 300;
    rect(ctx, 320 - sw / 2, yy - 2, sw, 32, 'K1');
    ModelStrip.draw(ctx, 320, yy + 1, STRIP.all);
    Rich.draw(ctx, S('onboard', 'repFoot'), 320, y + H - 30, { size: 'small', color: 'K3', align: 'center', outline: false });
    if (this.t > 0.6) Rich.draw(ctx, S('onboard', 'repGo'), 320, y + H - 16, { size: 'small', color: Math.floor(this.t * 2) % 2 ? 'K1' : 'K3', align: 'center', who, outline: false });
    ctx.globalAlpha = a0;
  }
}
/** a drawn ✓ in a G4 ring (or a hollow ring for a skipped lesson); the fonts have no ✓ */
function checkMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, done: boolean) {
  ctx.fillStyle = col(done ? 'G2' : 'S1');
  for (let i = 0; i < 20; i++) { const an = (i / 20) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(an) * 7), Math.round(cy + Math.sin(an) * 7), 1, 1); }
  if (!done) return;
  const pts = [[-4, 0], [-3, 1], [-2, 2], [-1, 3], [0, 2], [1, 1], [2, 0], [3, -1], [4, -2], [5, -3]];
  for (const [dx, dy] of pts) { rect(ctx, cx + dx, cy + dy, 1, 2, 'G1'); }
}
