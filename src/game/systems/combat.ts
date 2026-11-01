import type { Actor, Entity, Team } from '../entities/entity';
import type { World } from '../world/world';
import { angleDiff, clamp, TAU } from '../../engine/math';
import { frand } from '../../engine/rng';
import { sfx, G } from '../G';
import { settings } from '../settings';
import { rumbleOwner, ownerPlayer, slotColor } from '../players';
import { BASE_MODS, type Mods, type Loadout } from '../run';
import type { Player } from '../entities/player';
import type { Enemy } from '../entities/enemy';
import { S } from '../strings';
import { tr } from '../i18n';
import '../strings/f3';
const G_sfx = sfx;
/** GDD2 §3.3: Sand from an echo's damage, and for a kill */
const ECHO_SAND = 0.75;
const KILL_SAND = 2;
/** GDD2 §3.3 / §4.1: an interrupt gives Sand and staggers 0.8 s */
const INTERRUPT_SAND = 20, INTERRUPT_STAGGER = 0.8;
/** GDD2 §3.7: one Chord per target per second; lastHits are kept this long */
const CHORD_CD = 1, HIT_MEMORY = 1;
/** GDD2 §4.4 Break points: light hit / heavy hit / paradox (3× heavy-ish); echo hits ×1.5 */
const POISE_LIGHT = 4, POISE_HEAVY = 10, POISE_PARADOX = 35, POISE_ECHO = 1.5;
/** a Broken enemy takes +50% (GDD2 §4.4) */
const BREAK_TAKEN = 1.5;

/** build tags (P4 defines the ids; GDD2 §6.1) */
export type TagId = string;

/**
 * DamageInfo.src (PLAN2 §1.9): who dealt it, as a number Sync can compare — slot × 2 + (echo ? 1 : 0)
 * for a hand or its echo, -1 for an enemy, -2 for nobody (hazards, falls). combat fills it in.
 */
export function srcOf(owner: unknown, echo?: boolean): number {
  const p = ownerPlayer(owner);
  if (p) return p.slot * 2 + (echo ? 1 : 0);
  const a = owner as { team?: string } | null | undefined;
  return a && a.team === 'enemy' ? -1 : -2;
}

export type DmgKind = 'melee' | 'proj' | 'aoe' | 'dot' | 'paradox' | 'contact' | 'fall' | 'status';

export interface DamageInfo {
  amount: number;
  kind: DmgKind;
  /** attacker (player / echo / enemy) */
  owner?: Actor | null;
  /** origin for knockback */
  x?: number; y?: number;
  /** knockback impulse (px/s) */
  knock?: number;
  crit?: boolean;
  /** unrewindable (violet) damage */
  fixed?: boolean;
  /** dealt by an echo */
  echo?: boolean;
  /** statuses applied on hit */
  burn?: number; rust?: number; stasis?: number; resonance?: number; slow?: number; stun?: number;
  /** skip hitstop / shake */
  quiet?: boolean;
  /** hitstop override (seconds) */
  hitstop?: number;
  /** internal: released from stasis storage */
  fromStasis?: boolean;
  /** what dealt it, for stats and effects: 'attack' 'special' 'resonance' 'burn' 'paradox' 'memory' … (1.0's string `src`) */
  via?: string;
  /** ignore invulnerability (e.g. falling) */
  pierceInvuln?: boolean;
  // ── 2.0 combat contract (PLAN2 §1.9) ──
  /** numeric source: slot × 2 + (echo ? 1 : 0); enemy −1; nobody −2 (filled in by combat; see srcOf) */
  src?: number;
  /** the hand behind it (filled in by combat) */
  player?: Player;
  /** a heavy hit (finishers, heavies, specials, counters, paradoxes): interrupts, Break ×2.5 */
  heavy?: boolean;
  /** Break points this hit adds (default by kind, GDD2 §4.4) */
  poise?: number;
  /** a Counter: the hit after a Tick-Dodge (guaranteed crit) */
  counter?: boolean;
  /** a reversed enemy bullet (P1) */
  reversed?: boolean;
  /** set by combat when this hit was a Sync (2) or a Chord (3+): the number of sources */
  sync?: number;
  /** build tags of what dealt it (P4) */
  tags?: TagId[];
  /** environmental (hazards, traps): never counts as an attack for Perfect Rewind / Tick-Dodge */
  hazard?: boolean;
}

export type Shape =
  | { t: 'circle'; x: number; y: number; r: number }
  | { t: 'arc'; x: number; y: number; r: number; a: number; w: number; r0?: number }
  | { t: 'line'; x0: number; y0: number; x1: number; y1: number; r: number };

export interface Hitbox {
  shape: Shape;
  team: Team;
  info: DamageInfo;
  /** ticks remaining */
  life: number;
  hit: Set<number>;
  /** repeat hit interval (seconds) — 0 = once per target */
  rehit?: number;
  rehitT?: Map<number, number>;
  /** follow an entity (offset kept) */
  follow?: Entity;
  fx?: number; fy?: number;
  onHit?: (target: Actor, dealt: number) => void;
  /** max targets */
  pierce?: number;
}

export function circleHits(s: Shape, x: number, y: number, r: number): boolean {
  switch (s.t) {
    case 'circle': {
      const dx = x - s.x, dy = y - s.y, rr = s.r + r;
      return dx * dx + dy * dy <= rr * rr;
    }
    case 'arc': {
      const dx = x - s.x, dy = y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > s.r + r) return false;
      if (s.r0 && d < s.r0 - r) return false;
      if (d < r + 4) return true;
      const a = Math.atan2(dy, dx);
      // widen arc by target radius
      const extra = Math.atan2(r, Math.max(1, d));
      return Math.abs(angleDiff(s.a, a)) <= s.w + extra;
    }
    case 'line': {
      const vx = s.x1 - s.x0, vy = s.y1 - s.y0;
      const L2 = vx * vx + vy * vy || 1;
      let t = ((x - s.x0) * vx + (y - s.y0) * vy) / L2;
      t = clamp(t, 0, 1);
      const px = s.x0 + vx * t, py = s.y0 + vy * t;
      const dx = x - px, dy = y - py, rr = s.r + r;
      return dx * dx + dy * dy <= rr * rr;
    }
  }
}

export class Combat {
  hitboxes: Hitbox[] = [];
  constructor(private world: World) {}

  add(hb: Partial<Hitbox> & { shape: Shape; team: Team; info: DamageInfo }): Hitbox {
    const h: Hitbox = { life: 1, hit: new Set(), ...hb } as Hitbox;
    if (h.follow) {
      const c = shapeCenter(h.shape);
      h.fx = c.x - h.follow.x;
      h.fy = c.y - h.follow.y;
    }
    this.hitboxes.push(h);
    return h;
  }

  clear() { this.hitboxes.length = 0; }

  update(dt: number) {
    const w = this.world;
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const hb = this.hitboxes[i];
      if (hb.follow) {
        if (hb.follow.dead) { this.hitboxes.splice(i, 1); continue; }
        moveShape(hb.shape, hb.follow.x + hb.fx! - shapeCenter(hb.shape).x, hb.follow.y + hb.fy! - shapeCenter(hb.shape).y);
      }
      const targets = hb.team === 'player' ? (w.breakables.length ? [...w.enemies, ...w.breakables] : w.enemies) : hb.team === 'enemy' ? w.playerTeam : [];
      for (const t of targets) {
        if (t.dead || t.falling > 0) continue;
        if (!circleHits(hb.shape, t.x, t.y - 4, t.r + 2)) continue;
        if (hb.rehit) {
          hb.rehitT ??= new Map();
          const last = hb.rehitT.get(t.id) ?? -99;
          if (w.time - last < hb.rehit) continue;
          hb.rehitT.set(t.id, w.time);
        } else {
          if (hb.hit.has(t.id)) continue;
          hb.hit.add(t.id);
        }
        const info = { ...hb.info };
        if (info.x === undefined) { const c = shapeCenter(hb.shape); info.x = c.x; info.y = c.y; }
        const dealt = t.hurt(info);
        if (dealt > 0) hb.onHit?.(t, dealt);
        if (hb.pierce !== undefined && --hb.pierce <= 0) { hb.life = 0; break; }
      }
      // a hitbox inside a co-op time bubble lasts as long in that bubble's time as anywhere else
      // (an enemy's swing inside a rewinding hand's r72 is slowed with it; GDD2 §3.2, review F3 #12)
      if (w.bubbles.list.length) { const c = shapeCenter(hb.shape); hb.life -= w.bubbles.localAt(c.x, c.y); } else hb.life--;
      if (hb.life <= 0) this.hitboxes.splice(i, 1);
    }
  }

  // ───────────── ownership (F2b): every effect belongs to the hand that caused it ─────────────
  /** the loadout of the hand behind an owner (null for enemies / hazards) */
  loOf(owner: unknown): Loadout | null {
    const p = ownerPlayer(owner);
    return p && this.world.run ? this.world.run.lo(p.slot) : null;
  }
  /** that hand's mods; with no hand behind it, slot I's (1.0) or the base table */
  modsOf(owner: unknown): Mods {
    const lo = this.loOf(owner);
    if (lo) return lo.mods;
    const p0 = this.world.player;
    return p0 && this.world.run ? this.world.run.lo(p0.slot).mods : BASE_MODS;
  }
  /** the 1.0 default owner for an effect with no recorded applier */
  private fallbackOwner(): Actor | null { return this.world.player; }
  /** the loadout Sand earned by `owner` goes to (a ghost's goes to the nearest standing teammate) */
  private sandTo(owner: unknown): Loadout | null {
    let p = ownerPlayer(owner);
    if (!p || !this.world.run) return null;
    if (p.state === 'ghost') {
      const q = this.world.nearestPlayer(p.x, p.y) as typeof p | null;
      if (!q || ownerPlayer(q) !== q) return null;
      p = q;
    }
    return this.world.run.lo(p.slot);
  }
  /** damage dealt by a hand refunds Sand to that hand (GDD2 §3.3: ×1, its echoes ×0.75) */
  private refundSand(owner: unknown, amount: number, echo: boolean | undefined) {
    const lo = this.sandTo(owner);
    if (lo) lo.addSand(amount * (echo && !lo.mods.echoSand ? ECHO_SAND : 1));
  }

  /** Central damage resolution. Returns damage dealt. */
  applyDamage(t: Actor, info: DamageInfo): number {
    const w = this.world;
    if (t.dead) return 0;
    if (t.invuln > 0 && !info.pierceInvuln) return 0;
    let amt = info.amount;
    const fromPlayer = !!info.owner && info.owner.team === 'player';
    const player = fromPlayer ? ownerPlayer(info.owner) ?? undefined : undefined;
    const om = fromPlayer ? this.modsOf(info.owner) : null;
    // the 2.0 contract fields (PLAN2 §1.9)
    if (info.src === undefined) info.src = srcOf(info.owner, info.echo);
    if (player && !info.player) info.player = player;
    const strike = info.kind !== 'dot' && info.kind !== 'status' && info.kind !== 'fall';
    const vsEnemy = t.team === 'enemy';
    // Counter (GDD2 §4.1): the hand's next own hit within 1.2 s of a Tick-Dodge is a crit ×2 with a white flash
    if (player && !info.echo && strike && vsEnemy && player.counterT > 0 && om) {
      player.counterT = 0;
      info.counter = true;
      if (!info.crit) { amt *= om.counterMult; info.crit = true; }
      info.hitstop = Math.max(info.hitstop ?? 0, 0.1);
      this.counterFx(t, player);
    }
    if (info.heavy === undefined) info.heavy = info.kind === 'paradox' || info.via === 'special' || !!info.counter;
    // rust: +4% damage taken per stack (the rust's applier's Rust Power)
    if (t.st.rust > 0 && info.kind !== 'fall') amt *= 1 + t.st.rust * 0.04 * this.modsOf(t.st.rustBy ?? info.owner).rustPower;
    if (om && om.freshDmg && t.hp / t.maxHp > 0.8) amt *= 1 + om.freshDmg;
    // "the past's revenge" (GDD2 §3.8): a hand's echoes deal +50% to the Culprit it marked
    if (om && info.echo && player && (t.culpritOf.get(player.slot) ?? 0) > 0) amt *= 1 + om.culpritBonus;
    // a Broken enemy takes +50% (GDD2 §4.4)
    const en = vsEnemy ? (t as Enemy) : null;
    if (en && en.breakT > 0) amt *= BREAK_TAKEN;
    // Sync / Chord (GDD2 §3.7): another source hit this enemy within 0.25 s
    if (om && vsEnemy && strike && info.src >= 0) amt *= this.judgeSync(t, info, om, player);
    // stasis: store instead of dealing
    if (t.st.stasis > 0 && !info.fromStasis && t.team === 'enemy') {
      t.st.stasisStored += amt;
      t.flash = 0.06;
      this.hitFx(t, info, amt, true);
      if (info.owner && info.owner.team === 'player') {
        this.refundSand(info.owner, amt, info.echo);
        w.noteDamage(t, info.owner, amt);
        w.bus.emit('hit', { target: t, info, dealt: amt, player });
      }
      return amt;
    }
    // player-side mitigation handled by player.hurt override before reaching here
    amt = Math.max(info.kind === 'dot' ? 0.5 : 1, amt);
    const before = t.hp;
    t.hp -= amt;
    const dealt = Math.min(before, amt);
    t.lastHit = info;
    t.flash = 0.1;
    // knockback
    if (info.knock && info.x !== undefined) {
      const dx = t.x - info.x, dy = t.y - (info.y ?? t.y);
      const d = Math.hypot(dx, dy) || 1;
      const k = (info.knock * (om ? om.knockMul : 1)) / t.mass;
      t.kx += (dx / d) * k;
      t.ky += (dy / d) * k;
    }
    if (amt >= t.flinch && info.kind !== 'dot' && info.kind !== 'status') t.hitstun = Math.max(t.hitstun, 0.18);
    if (en && fromPlayer && strike) {
      // a heavy hit in the last 0.18 s of a windup interrupts it (GDD2 §4.1); P1 tunes this
      if (info.heavy && en.interruptWindow) this.interrupt(en, player);
      // Break points (GDD2 §4.4)
      const pts = info.poise ?? (info.kind === 'paradox' ? POISE_PARADOX : info.heavy ? POISE_HEAVY : POISE_LIGHT);
      en.addPoise(pts * (info.echo ? POISE_ECHO : 1) * (om?.poiseMul ?? 1), player);
    }
    // statuses (credited to the attacker)
    const by = info.owner ?? null;
    if (info.burn) this.addStatus(t, 'burn', info.burn, by);
    if (info.rust) this.addStatus(t, 'rust', info.rust, by);
    if (info.resonance) this.addStatus(t, 'resonance', info.resonance, by);
    if (info.slow) { t.st.slow = Math.max(t.st.slow, info.slow); t.st.slowAmt = 0.4; }
    if (info.stun && !t.isBoss) t.st.stun = Math.max(t.st.stun, info.stun);
    if (info.stasis) this.addStatus(t, 'stasis', info.stasis, by);

    t.onHurt(info, dealt);
    this.hitFx(t, info, amt, false);

    if (info.owner && info.owner.team === 'player' && t.team === 'enemy') {
      this.refundSand(info.owner, dealt, info.echo);
      w.stats.damage += dealt;
      w.noteDamage(t, info.owner, dealt);
      w.bus.emit('hit', { target: t, info, dealt, player });
      // resonance rings when struck by an echo or a paradox
      if ((info.echo || info.kind === 'paradox') && info.via !== 'resonance' && t.st.resonance > 0) this.ring(t, info.owner);
    }
    if (t.hp <= 0) {
      t.hp = 0;
      t.die(info);
      if (t.team === 'enemy') {
        w.bus.emit('kill', { target: t, info, player: ownerPlayer(info.owner) ?? undefined });
        w.stats.kills++;
        // +2 Sand a kill (GDD2 §3.3), to the hand behind it
        if (fromPlayer) this.sandTo(info.owner)?.addSand(KILL_SAND);
      }
    }
    return dealt;
  }

  /**
   * Sync / Chord (GDD2 §3.7): count the different sources (you, your echo, a teammate, theirs) that
   * hit `t` within syncWindow, including this one. Two = Sync (+50%), three or more = Chord (+100%,
   * once per target per second; otherwise it counts as a Sync). Returns the damage multiplier.
   */
  private judgeSync(t: Actor, info: DamageInfo, m: Mods, player: Player | undefined): number {
    const w = this.world;
    const now = w.time;
    const L = t.lastHits;
    while (L.length && now - L[0].t > HIT_MEMORY) L.shift();
    const src = info.src!;
    // the other sources inside the window, and those whose hit has not been paired yet: a Sync uses
    // its pair up, so two sources trading blows sync once per new pair, not on every hit (review F3 #6)
    let others = 0, fresh = 0, seen = 0, seenFresh = 0;
    for (const h of L) {
      if (h.src === src || now - h.t > m.syncWindow) continue;
      const bit = 1 << Math.min(30, h.src);
      if (!(seen & bit)) { seen |= bit; others++; }
      if (!h.used && !(seenFresh & bit)) { seenFresh |= bit; fresh++; }
    }
    const cd = t.marks.get('chordCd');
    const chord = others >= 2 && !(cd && cd.t > 0);
    const n = chord ? others + 1 : fresh ? 2 : 1;
    if (n >= 2) for (const h of L) if (now - h.t <= m.syncWindow) h.used = true;
    L.push({ src, t: now, used: n >= 2 });
    if (L.length > 24) L.shift();
    if (n < 2) return 1;
    if (n >= 3) t.marks.set('chordCd', { t: CHORD_CD, stacks: 1, src });
    info.sync = n;
    this.syncFx(t, n, player);
    w.bus.emit('sync', { player, target: t, sources: n });
    return 1 + (n >= 3 ? m.chordBonus : m.syncBonus);
  }
  private syncFx(t: Actor, n: number, player: Player | undefined) {
    const w = this.world;
    const y = t.y - t.height * 0.5;
    const c = n >= 3 ? 'B5' : 'C4';
    w.fx.ring(t.x, y, 2, 16, 0.3, 'W', 2);
    w.fx.ring(t.x, y, 6, 24, 0.4, c, 2);
    if (n >= 3) w.fx.ring(t.x, y, 10, 32, 0.5, 'C3', 1);
    const text = n >= 3 ? tr(S('f3', 'chord')).replace('{n}', String(n)) : S('f3', 'sync');
    w.fx.stamp(t.x, t.y - t.height - 12, text, n >= 3 ? 'B5' : 'C4', 0.75, { rule: n >= 3 ? 'B5' : 'C3', small: n < 3, term: 'sync' });
    player?.input.rumble(0.08, 0.25, 50);
    sfx(n >= 3 ? 'chord' : 'sync', { vol: 0.75, pan: w.pan(t.x), pitch: n });
  }
  private counterFx(t: Actor, p: Player) {
    const w = this.world;
    if (settings.flashes) G.r.params.flash = Math.max(G.r.params.flash ?? 0, 0.22);
    w.shake(0.3);
    w.fx.ring(t.x, t.y - t.height * 0.5, 3, 26, 0.3, 'W', 3);
    w.fx.stamp(t.x, t.y - t.height - 14, S('f3', 'counter'), 'K10', 0.9, { rule: 'B5', term: 'counter' });
    sfx('counter', { pan: w.pan(t.x) });
    p.input.rumble(0.5, 0.7, 120);
  }
  /** a heavy hit inside an interrupt window (GDD2 §4.1): the attack is cancelled */
  private interrupt(e: Enemy, by: Player | undefined) {
    const w = this.world;
    e.stagger(INTERRUPT_STAGGER, 'interrupt');
    if (by) this.sandTo(by)?.addSand(INTERRUPT_SAND);
    w.fx.ring(e.x, e.y - e.height * 0.5, 2, 28, 0.35, 'W', 3);
    w.fx.stamp(e.x, e.y - e.height - 14, S('f3', 'interrupt'), 'K10', 1, { rule: 'W', term: 'interrupt' });
    w.hitstop(0.07);
    sfx('interrupt', { pan: w.pan(e.x) });
    w.bus.emit('interrupt', { player: by, target: e });
  }

  /** Resonance detonation: area damage scaled by stacks, consumes them; `by` rang it */
  ring(t: Actor, by?: Actor | null) {
    const w = this.world;
    const n = t.st.resonance;
    t.st.resonance = 0;
    const owner = (ownerPlayer(by) ?? ownerPlayer(t.st.resonanceBy) ?? this.fallbackOwner()) as Actor | null;
    const dmg = 14 * n * this.modsOf(owner).resonanceDmg;
    const R = 30 + n * 6;
    w.fx.ring(t.x, t.y - 6, 3, R, 0.35, 'U4', 3);
    w.fx.burst(t.x, t.y - 8, 10 + n * 3, ['W', 'U4', 'U3'], 140, 0.4);
    G_sfx('wave', { vol: 0.5, pan: w.pan(t.x) });
    for (const e of w.enemiesNear(t.x, t.y, R)) this.applyDamage(e, { amount: dmg, kind: 'aoe', owner, x: t.x, y: t.y, knock: 120, via: 'resonance', quiet: e !== t });
  }

  /**
   * Apply a status. `by` is who applied it (player, echo, effect entity); its hand's mods set the
   * caps and the stacks' later damage is credited to it. Omitted = slot I (1.0 behaviour).
   */
  addStatus(t: Actor, s: 'burn' | 'rust' | 'stasis' | 'resonance', n: number, by?: unknown) {
    const st = t.st;
    const owner = ((by !== undefined ? ownerPlayer(by) : null) ?? (t.team === 'enemy' ? this.fallbackOwner() : null)) as Actor | null;
    const mods = this.modsOf(owner);
    switch (s) {
      case 'burn':
        st.burn = Math.min(mods.burnMax, st.burn + n);
        st.burnT = 4;
        st.burnBy = owner;
        break;
      case 'rust':
        st.rust += n;
        st.rustBy = owner;
        if (st.rust >= 10) {
          st.rust = 0;
          // corrode burst
          this.world.fx.corrode(t.x, t.y - 6);
          this.applyDamage(t, { amount: 30 * mods.corrodeMul, kind: 'status', x: t.x, y: t.y, via: 'corrode', owner });
          for (const e of this.world.enemiesNear(t.x, t.y, 40)) if (e !== t) this.addStatus(e, 'rust', 3, owner);
        }
        break;
      case 'stasis':
        if (t.isBoss) n *= 0.4;
        if (st.stasis <= 0) { st.stasisStored = 0; sfx('stasis', { vol: 0.6 }); }
        st.stasis = Math.max(st.stasis, n);
        st.stasisBy = owner;
        break;
      case 'resonance':
        st.resonance = Math.min(mods.resonanceMax, st.resonance + n);
        st.resonanceBy = owner;
        break;
    }
    this.world.bus.emit('statusApplied', { target: t, status: s, stacks: n, player: ownerPlayer(owner) ?? undefined });
  }

  /** per-tick status processing for an actor; returns true if actor is frozen this tick */
  tickStatus(t: Actor, dt: number): boolean {
    const st = t.st;
    if (st.burn > 0) {
      st.burnT -= dt;
      st.burnTick -= dt;
      if (st.burnTick <= 0) {
        st.burnTick = 0.5;
        const owner = t.team === 'enemy' ? (st.burnBy ?? this.fallbackOwner()) : null;
        const dmg = st.burn * 1 * this.modsOf(owner).burnMul;
        this.applyDamage(t, { amount: dmg, kind: 'dot', via: 'burn', owner, quiet: true });
        this.world.fx.burnTick(t);
      }
      if (st.burnT <= 0) st.burn = 0;
    }
    if (st.slow > 0) st.slow -= dt;
    if (st.stun > 0) st.stun -= dt;
    if (st.stasis > 0) {
      st.stasis -= dt;
      if (st.stasis <= 0) {
        st.stasis = 0;
        const owner = st.stasisBy ?? this.fallbackOwner();
        const stored = st.stasisStored * 1.5 * this.modsOf(owner).stasisMul;
        st.stasisStored = 0;
        if (stored > 0) {
          this.world.fx.stasisRelease(t.x, t.y - t.height / 2, stored);
          this.applyDamage(t, { amount: stored, kind: 'status', fromStasis: true, x: t.x, y: t.y + 1, knock: 60, via: 'stasis', owner });
        }
      }
      return true;
    }
    return false;
  }

  private hitFx(t: Actor, info: DamageInfo, amt: number, stored: boolean) {
    const w = this.world;
    const big = info.crit || amt >= 30;
    const color = info.fixed ? 'V3' : info.crit ? 'B5' : t.team === 'player' ? 'R4' : stored ? 'V4' : info.echo ? 'C3' : info.kind === 'dot' ? (info.via === 'burn' ? 'O2' : 'T4') : 'K10';
    // settings → "damage numbers": numbers over enemies can be turned off; your own damage always shows
    // an echo's numbers are cyan with its owner's colour around them (GDD2 §3.5)
    const echoP = info.echo ? ownerPlayer(info.owner) : null;
    if (settings.showDamage || t.team === 'player') w.fx.number(t.x, t.y - t.height - 2, amt, color, big, echoP && w.playerCount > 1 ? slotColor(echoP.slot) : undefined);
    if (info.quiet || info.kind === 'dot') return;
    const ang = info.x !== undefined ? Math.atan2(t.y - (info.y ?? t.y), t.x - info.x) : frand(0, TAU);
    w.fx.hitSparks(t.x, t.y - t.height * 0.5, ang, info.echo ? 'echo' : t.team === 'player' ? 'blood' : big ? 'crit' : 'normal', amt);
    if (t.team === 'enemy') {
      // GDD2 §4.5: echo hits freeze 0.03 s with a glass ping and a light buzz on the owner's pad
      const hs = info.hitstop ?? (big ? 0.075 : info.echo ? 0.03 : 0.045);
      w.hitstop(hs);
      w.shake(big ? 0.28 : info.echo ? 0.06 : 0.12);
      if (!info.echo) rumbleOwner(info.owner, big ? 0.35 : 0.12, big ? 0.5 : 0.25, big ? 90 : 50);
      else rumbleOwner(info.owner, 0.04, 0.12, 35);
      sfx(big ? 'hitCrit' : info.echo ? 'hitEcho' : 'hit', { vol: 0.8, pan: w.pan(t.x) });
    }
  }
}

export function shapeCenter(s: Shape): { x: number; y: number } {
  if (s.t === 'line') return { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 };
  return { x: s.x, y: s.y };
}
function moveShape(s: Shape, dx: number, dy: number) {
  if (s.t === 'line') { s.x0 += dx; s.x1 += dx; s.y0 += dy; s.y1 += dy; }
  else { s.x += dx; s.y += dy; }
}
