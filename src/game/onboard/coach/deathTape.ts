// DeathTape (ONBOARD2 §9.1–§9.2): a 10 Hz ring of plain data — where each hand, its Shadow and the
// nearby enemies were, what a rewind would have given then — so the death card can tell the truth
// about the last 3.6 s and redraw them. Render-free, allocation-free per sample (36 preallocated
// slots), never touches the simulation. Frozen 0.3 s after a solo lethal hit (thawed again if the
// Last Second saves the hand) or when the last hand of a co-op team is out; a new room starts fresh.
//
// DeathSnap is computed once at the freeze, per seat, from that data only: every "could have" is a
// canRewind().ok / rewindPreview().hpGain that was really sampled at the time — nothing guessed.
import type { Player, RewindRefusal } from '../../entities/player';
import type { World } from '../../world/world';
import type { Sprite } from '../../../engine/gfx/sprite';
import type { Entity } from '../../entities/entity';
import type { L10n } from '../../i18n';
import { G } from '../../G';
import { Sprite as SpriteCls } from '../../../engine/gfx/sprite';
import { makeCanvas } from '../../../engine/gfx/canvas';
import { settings } from '../../settings';
import { Flags } from '../../meta/registry';
import { profile } from '../../save';
import { GameHooks } from '../../hooks';
import { ROSTERS } from '../../world/director';
import * as Down from '../../systems/downed';
import { Tut } from '../core';

export const TAPE_N = 36, TAPE_DT = 0.1;
const MAX_FOES = 6, FOE_R = 160;

export interface TapeShadow { x: number; y: number; ok: boolean; gain: number; cost: number; seconds: number; spr: Sprite | null; flip: boolean }
export interface TapeHand {
  slot: number; x: number; y: number; spr: Sprite | null; flip: boolean;
  hp: number; maxHp: number; sand: number; state: string;
  shadow: TapeShadow;
  reason: RewindRefusal | null; anchored: boolean; burnt: number;
  on: boolean;
}
export interface TapeFoe { id: number; kind: string; x: number; y: number; flip: boolean; wind: boolean; on: boolean }
export interface TapeHit { slot: number; amount: number; fixed: boolean; killer: string; lethal: boolean }
export interface TapeRewind { slot: number; scrub: boolean; restored: number }
export interface TapeMeta {
  t: number;
  cam: { x: number; y: number };
  hands: TapeHand[];
  foes: TapeFoe[];
  hits: TapeHit[];
  rewinds: TapeRewind[];
}

export interface DeathSnap {
  slot: number;
  killer: string; killerName: L10n | null;
  best: { t: number; ago: number; gain: number; cost: number; shadowAgo: number } | null;
  lastSecond: { offered: boolean; pressed: boolean; sand: number; gain: number } | null;
  reason: RewindRefusal | null;
  lethalFixed: boolean;
  scrubShort: boolean;
  mateCould: number | null;
  repeat: number;
  /** which case heads the card (ONBOARD2 §9.2): c1 … c8 */
  case: 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8';
  /** C2 and C1 together: the second line says the last 1.5 s would have worked too */
  alsoC1: boolean;
  /** sim time of the lethal hit / the stop */
  tDeath: number;
  /** the lesson the card recommends (undo, lastSecond, echo, fixed, scrub …) or null */
  practise: string | null;
  /** HP at the frame to press, and what a tap there gave back */
  hpAt: number; maxHp: number;
}

const mkShadow = (): TapeShadow => ({ x: 0, y: 0, ok: false, gain: 0, cost: 0, seconds: 0, spr: null, flip: false });
const mkHand = (): TapeHand => ({ slot: 0, x: 0, y: 0, spr: null, flip: false, hp: 0, maxHp: 1, sand: 0, state: 'alive', shadow: mkShadow(), reason: null, anchored: false, burnt: 0, on: false });
const mkFoe = (): TapeFoe => ({ id: 0, kind: '', x: 0, y: 0, flip: false, wind: false, on: false });
const mkMeta = (): TapeMeta => ({ t: -1, cam: { x: 0, y: 0 }, hands: [mkHand(), mkHand(), mkHand(), mkHand()], foes: Array.from({ length: MAX_FOES }, mkFoe), hits: [], rewinds: [] });

/** a hand's facts that do not need the ring (kept even with the replay off) */
interface Facts {
  lethalT: number; lethalFixed: boolean; killer: string; killerId: number;
  reasonAtLethal: RewindRefusal | null; anchoredAtLethal: boolean; burntAtLethal: boolean;
  stopT: number; lsOpenReal: number; lsPressed: boolean; lsSand: number; lsGain: number; lsCan: boolean;
  downT: number;
}
const mkFacts = (): Facts => ({ lethalT: -1, lethalFixed: false, killer: '', killerId: 0, reasonAtLethal: null, anchoredAtLethal: false, burntAtLethal: false, stopT: -1, lsOpenReal: 0, lsPressed: false, lsSand: 0, lsGain: 0, lsCan: false, downT: -1 });

export class DeathTape {
  ring: TapeMeta[] = Array.from({ length: TAPE_N }, mkMeta);
  head = 0;
  count = 0;
  frozen = false;
  private freezeAt = -1;
  /** events between two samples */
  private pendHits: TapeHit[] = [];
  private pendRw: TapeRewind[] = [];
  facts = new Map<number, Facts>();
  /** each foe's look, captured once at the freeze (id → sprite) */
  foeSprites = new Map<number, Sprite | null>();
  snaps: DeathSnap[] | null = null;
  readonly record: boolean;
  constructor(readonly w: World) {
    this.record = settings.deathReplay && G.debug.get('deathreplay') !== '0';
  }
  fact(slot: number): Facts { let f = this.facts.get(slot); if (!f) this.facts.set(slot, (f = mkFacts())); return f; }

  /** oldest → newest */
  frames(): TapeMeta[] {
    const out: TapeMeta[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.ring[(this.head - this.count + i + TAPE_N) % TAPE_N]);
    return out;
  }

  sample() {
    const w = this.w;
    if (this.frozen) return;
    if (this.freezeAt >= 0 && w.time >= this.freezeAt) { this.freeze(); return; }
    if (!this.record) { this.pendHits.length = 0; this.pendRw.length = 0; return; }
    const m = this.ring[this.head];
    this.head = (this.head + 1) % TAPE_N;
    this.count = Math.min(TAPE_N, this.count + 1);
    m.t = w.time;
    const v = w.cam.view();
    m.cam.x = v.x; m.cam.y = v.y;
    for (let i = 0; i < 4; i++) m.hands[i].on = false;
    w.players.forEach((p, i) => { if (i < 4) sampleHand(m.hands[i], p); });
    // the enemies near any hand (closest first, at most 6)
    for (const f of m.foes) f.on = false;
    const near: { e: Entity & { flip?: boolean; wind?: unknown; codexId?: string; kind?: string }; d: number }[] = [];
    for (const e of w.enemies) {
      if (e.dead) continue;
      let d = Infinity;
      for (const p of w.players) d = Math.min(d, Math.hypot(e.x - p.x, e.y - p.y));
      if (d <= FOE_R) near.push({ e: e as never, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(MAX_FOES, near.length); i++) {
      const f = m.foes[i], e = near[i].e;
      f.on = true; f.id = e.id; f.kind = e.codexId || e.kind || ''; f.x = e.x; f.y = e.y; f.flip = !!e.flip; f.wind = !!e.wind;
    }
    m.hits = this.pendHits.splice(0);
    m.rewinds = this.pendRw.splice(0);
  }

  onDamaged(p: Player, amount: number, fixed: boolean, owner: unknown) {
    if (this.frozen) return;
    const o = owner as { codexId?: string; kind?: string; id?: number } | null | undefined;
    const killer = o?.codexId || o?.kind || '';
    const lethal = p.hp <= 0;
    this.pendHits.push({ slot: p.slot, amount, fixed, killer, lethal });
    if (lethal) {
      const f = this.fact(p.slot);
      f.lethalT = this.w.time; f.lethalFixed = fixed; f.killer = killer; f.killerId = o?.id ?? 0;
      // why no rewind was possible a moment before this blow (the last sample's reason)
      const last = this.ring[(this.head - 1 + TAPE_N) % TAPE_N];
      const hs = last.hands.find((h) => h.on && h.slot === p.slot);
      f.reasonAtLethal = hs ? hs.reason : null;
      f.anchoredAtLethal = p.anchorT > 0 || !!hs?.anchored;
      f.burntAtLethal = p.rec.burnT > 0 || (hs?.burnt ?? 0) > 0;
      // solo: keep taping 0.3 s more, then freeze (the Last Second may still save it)
      if (this.w.playerCount <= 1) this.freezeAt = this.w.time + 0.3;
    }
  }
  onRewind(p: Player, scrub: boolean, restored: number) {
    if (this.frozen) return;
    this.pendRw.push({ slot: p.slot, scrub, restored });
  }
  /** a self-rescue in the Last Second: forget the freeze, keep taping */
  onRevived(p: Player) {
    if (this.w.playerCount > 1) return;
    this.freezeAt = -1;
    if (this.frozen) { this.frozen = false; this.snaps = null; }
    const f = this.fact(p.slot);
    f.lethalT = -1; f.stopT = -1; f.lsOpenReal = 0; f.lsPressed = false;
  }
  /** every Stage update (real time): the Last Second's window and whether rewind was pressed in it */
  tickReal(dt: number) {
    const w = this.w;
    for (const p of w.players) {
      if (p.state !== 'stopped') continue;
      const f = this.fact(p.slot);
      if (f.stopT < 0) {
        f.stopT = w.time; f.downT = w.time;
        f.lsSand = Math.floor(p.lo.sand);
        f.lsGain = p.rewindPreview().hpGain;
        f.lsCan = p.canRewindFromStop();
      }
      if (w.playerCount <= 1 && !p.down.final && p.down.lastSecond > 0) {
        if (f.lsCan) f.lsOpenReal += dt;
        if (p.input.pressed('rewind') || p.rw) f.lsPressed = true;
      }
    }
    // co-op: the last hand out freezes the tape
    if (!this.frozen && w.playerCount > 1 && w.players.length && w.players.every((p) => Down.isOut(p))) this.freeze();
  }

  freeze() {
    if (this.frozen) return;
    this.frozen = true;
    this.freezeAt = -1;
    // the enemies' looks, once (their real render code into a scratch canvas)
    for (const m of this.frames()) for (const f of m.foes) if (f.on && !this.foeSprites.has(f.id)) {
      const e = this.w.entities.find((x) => x.id === f.id);
      this.foeSprites.set(f.id, e ? captureLook(e) : null);
    }
  }
  /** the cases, worked out once the run is really over (the Last Second has had its say) */
  snap(): DeathSnap[] {
    if (!this.frozen) this.freeze();
    if (!this.snaps) {
      this.snaps = computeSnaps(this);
      Tut.log('deathSnap', this.snaps.map((s) => ({ slot: s.slot, case: s.case, gain: s.best?.gain ?? null })));
    }
    return this.snaps;
  }
}

function sampleHand(h: TapeHand, p: Player) {
  h.on = true;
  h.slot = p.slot; h.x = p.x; h.y = p.y;
  h.spr = p.currentSprite(); h.flip = p.flip;
  h.hp = Math.max(0, p.hp); h.maxHp = p.maxHp; h.sand = Math.floor(p.lo.sand); h.state = p.state;
  const pv = p.rewindPreview();
  const sh = h.shadow;
  sh.x = pv.x; sh.y = pv.y; sh.ok = p.state === 'alive' && pv.ok; sh.gain = pv.hpGain; sh.cost = pv.cost; sh.seconds = pv.seconds;
  if (p.rec.length > 1) { const fr = p.rec.at(pv.frame); sh.spr = p.spriteFor(fr); sh.flip = fr.flip; } else { sh.spr = h.spr; sh.flip = h.flip; }
  h.reason = p.state === 'alive' ? p.rewindBlock() : null;
  h.anchored = p.anchorT > 0;
  h.burnt = p.rec.burnT;
}

/**
 * An actor's look right now, drawn by its own render code into a scratch canvas (a fake renderer
 * whose layers are one 2D context; lights, labels and glow are no-ops) — the codex does the same.
 */
export function captureLook(e: Entity): Sprite | null {
  try {
    const S = 72;
    const [cv, ctx] = makeCanvas(S, S);
    const noop = () => {};
    const fake = { w: ctx, u: ctx, g: ctx, ui2: ctx, lightAt: noop, glowAt: noop, label: noop, worldUi: noop, visible: () => true, params: {}, camX: 0, camY: 0 } as never;
    const x0 = e.x, y0 = e.y;
    e.x = S / 2; e.y = S - 8;
    try { (e as unknown as { render(r: unknown): void }).render(fake); } finally { e.x = x0; e.y = y0; }
    const id = ctx.getImageData(0, 0, S, S).data;
    let a = S, b = S, c = -1, d = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (id[(y * S + x) * 4 + 3] > 0) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
    if (c < 0) return null;
    const w = c - a + 1, h = d - b + 1;
    const [c2, x2] = makeCanvas(w, h);
    x2.drawImage(cv, a, b, w, h, 0, 0, w, h);
    return new SpriteCls(c2, S / 2 - a, S - 8 - b);
  } catch { return null; }
}

export function killerName(kind: string): L10n | null {
  for (const r of ROSTERS) for (const d of r) if (d.id === kind && d.name) return d.name;
  return null;
}

/** ONBOARD2 §9.2: the first case that holds heads the card */
function computeSnaps(t: DeathTape): DeathSnap[] {
  const w = t.w;
  const frames = t.frames();
  const solo = w.playerCount <= 1;
  const out: DeathSnap[] = [];
  for (const p of w.players) {
    if (solo && p !== w.players[0]) continue;
    const f = t.fact(p.slot);
    const tDeath = f.lethalT >= 0 ? f.lethalT : f.downT >= 0 ? f.downT : w.time;
    // the best moment to have pressed: 0.3–3.5 s before the end, a rewind possible, most HP back,
    // and no rewind of this hand after it
    let best: DeathSnap['best'] = null;
    let hpAt = 0, maxHp = p.maxHp;
    for (let i = 0; i < frames.length; i++) {
      const m = frames[i];
      const ago = tDeath - m.t;
      if (ago < 0.3 || ago > 3.5) continue;
      const h = m.hands.find((x) => x.on && x.slot === p.slot);
      if (!h || h.state !== 'alive' || !h.shadow.ok || h.shadow.gain <= 0) continue;
      let rewoundAfter = false;
      for (let j = i + 1; j < frames.length; j++) if (frames[j].t <= tDeath + 1e-6 && frames[j].rewinds.some((r) => r.slot === p.slot)) rewoundAfter = true;
      if (rewoundAfter) continue;
      if (!best || h.shadow.gain > best.gain) { best = { t: m.t, ago, gain: h.shadow.gain, cost: h.shadow.cost, shadowAgo: h.shadow.seconds }; hpAt = h.hp; maxHp = h.maxHp; }
    }
    // the Last Second: open long enough to use (≥ 0.4 real s with the Sand for it), pressed or not
    const lastSecond = solo && f.stopT >= 0 ? { offered: f.lsCan && f.lsOpenReal >= 0.4, pressed: f.lsPressed, sand: f.lsSand, gain: f.lsGain } : null;
    // a scrub in the last 3.5 s that undid nothing although a tap then would have given ≥ 5
    let scrubShort = false;
    for (let i = 0; i < frames.length; i++) {
      const m = frames[i];
      if (tDeath - m.t > 3.5 || m.t > tDeath + 1e-6) continue;
      if (!m.rewinds.some((r) => r.slot === p.slot && r.scrub && r.restored === 0)) continue;
      const prev = frames[i - 1]?.hands.find((x) => x.on && x.slot === p.slot);
      if (prev && prev.shadow.gain >= 5) scrubShort = true;
    }
    // co-op: a teammate who could have pulled this hand back (within 200 px, 100 Sand, in the first 3 s)
    let mateCould: number | null = null;
    if (!solo && f.downT >= 0) {
      for (const m of frames) {
        if (m.t < f.downT || m.t > f.downT + 3) continue;
        const me = m.hands.find((x) => x.on && x.slot === p.slot);
        if (!me) continue;
        for (const q of m.hands) if (q.on && q.slot !== p.slot && q.state === 'alive' && q.sand >= 100 && Math.hypot(q.x - me.x, q.y - me.y) <= 200) { mateCould = q.slot; break; }
        if (mateCould !== null) break;
      }
    }
    const killer = f.killer;
    const repeat = killer ? Flags.inc('death.by.' + killer) : 0;
    if (killer) Flags.set('death.lastRun.' + killer, profile.runs);
    const reason = f.reasonAtLethal;
    const c2 = !!best && best.gain >= 5;
    const c1 = !!lastSecond && lastSecond.offered && !lastSecond.pressed && lastSecond.gain >= 5;
    let cs: DeathSnap['case'] = 'c8';
    if (c2) cs = 'c2';
    else if (c1) cs = 'c1';
    else if (reason === 'sand') cs = 'c3';
    else if (reason === 'burnt' || f.burntAtLethal) cs = 'c4';
    else if (reason === 'anchor' || f.anchoredAtLethal) cs = 'c5';
    else if (f.lethalFixed) cs = 'c6';
    else if (scrubShort) cs = 'c7';
    const practise: Record<string, string | null> = { c1: 'lastSecond', c2: 'undo', c3: 'echo', c4: 'lastSecond', c5: null, c6: 'fixed', c7: 'scrub', c8: 'undo' };
    if (cs === 'c1') { hpAt = 0; maxHp = p.maxHp; }
    out.push({
      slot: p.slot, killer, killerName: killerName(killer), best: c2 ? best : null, lastSecond, reason, lethalFixed: f.lethalFixed, scrubShort, mateCould, repeat,
      case: cs, alsoC1: c2 && c1, tDeath, practise: practise[cs], hpAt, maxHp,
    });
  }
  return out;
}

// ───────────────────────── one tape per room ─────────────────────────
const tapes = new WeakMap<World, DeathTape>();
export function tapeOf(w: World | null | undefined): DeathTape | null { return w ? tapes.get(w) ?? null : null; }
GameHooks.onRoomStart(({ w, scene }) => {
  if (scene.opt.kind === 'rehearsal' || scene.opt.kind === 'prologue') return;
  const t = new DeathTape(w);
  tapes.set(w, t);
  const owner = t;
  w.every(TAPE_DT, () => t.sample(), owner);
  w.bus.on('damaged', (e) => { if (e.player) t.onDamaged(e.player, e.dealt, !!e.info.fixed, e.info.owner); }, owner);
  w.bus.on('rewind', (e) => { if (e.player) t.onRewind(e.player, !!e.scrub, e.restored ?? 0); }, owner);
  w.bus.on('revived', (e) => { if (e.source === 'self') t.onRevived(e.player); }, owner);
});
