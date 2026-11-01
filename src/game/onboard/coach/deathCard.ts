// The death card (ONBOARD2 §9.3–§9.5): in the scene, the moment the last hand is out, one true
// sentence about what stopped you — "2s before the end, +22 was yours to take back: [Q]" — and,
// on {@rewind}, a 3.6 s tape replay redrawn from what the DeathTape really recorded: it plays the
// last second up to the moment to press, freezes there, shows the button go down, runs back along
// the hand's real path to its Shadow and lands with the HP a tap would have given. It never shows
// a future that did not happen; when no rewind could have helped, the replay just stops at the blow.
//
// A non-blocking overlay on the GameScene (it draws after the scene's own dim, so it is never
// dimmed); game.ts already skips its "stopped" words while Onboard.deathCard.active(). Its
// existing rule stays: after 2.4 s, {@confirm} goes on to the summary.
import type { Renderer } from '../../../engine/gfx/renderer';
import type { Overlay } from '../../ui/overlay';
import type { Player } from '../../entities/player';
import type { Sprite } from '../../../engine/gfx/sprite';
import type { L10n } from '../../i18n';
import { G, sfx } from '../../G';
import { S } from '../../strings';
import { tr } from '../../i18n';
import { Flags } from '../../meta/registry';
import { settings } from '../../settings';
import { GameScene } from '../../scenes/game';
import { Text } from '../../ui/text';
import { rect } from '../../ui/draw';
import { drawPanel, drawPixelArt, drawStamp } from '../../ui/widgets';
import { drawSprite } from '../../../engine/gfx/sprite';
import { col } from '../../../art/palette';
import { slotColor, ROMAN } from '../../players';
import { Panels } from '../../ui/panels';
import * as Down from '../../systems/downed';
import { drawShadowOutline } from '../../ui/rewindHud';
import { Onboard, Tut } from '../core';
import { Rich, bigPrompt } from '../rich';
import { ModelStrip, STRIP } from '../modelStrip';
import { Stage } from '../stage';
import { tapeOf, captureLook, type DeathTape, type DeathSnap, type TapeMeta, type TapeHand } from './deathTape';
import { recapLines, verbName } from './mastery';
import { oweLevel } from './coach';

const C = (k: string): L10n => S('coach', k);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
/** seconds into the card when it appears after everyone is out (ONBOARD2 §9.3) */
const SHOW_AT = 0.8;
const REPLAY_T = 3.6;
/** the replay window (logical px) and the right column */
const PX = 38, PY = 58, PW = 320, PH = 180;
const RX = 376, RW = 236;

const sceneOf = () => (G.scenes.current instanceof GameScene ? G.scenes.current : null);

class DeathCardOverlay implements Overlay {
  blocks = false;
  t = 0;
  /** real seconds into the replay (< 0: not playing) */
  rt = -1;
  played = 0;
  seat = 0;
  readonly snaps: DeathSnap[];
  private foeLook = new Map<number, Sprite | null>();
  private killerLook: Sprite | null | undefined;
  private recap: string[];
  constructor(readonly scene: GameScene, readonly tape: DeathTape) {
    this.snaps = tape.snap();
    this.foeLook = tape.foeSprites;
    const s = this.snaps[0];
    this.recap = recapLines(s?.practise ?? null);
    // C1 / C2: the coach comes back next run (ONBOARD2 §6.3)
    if (this.snaps.some((x) => x.case === 'c1' || x.case === 'c2')) oweLevel();
    // the same enemy again and again: the workshop sends the hand straight into the Hall on that lesson
    const rec = this.snaps.find((x) => x.repeat >= 2 && x.practise);
    if (rec?.practise) hallAfterDeath = rec.practise;
    // the very first death plays the replay once by itself; after that the player presses it
    if (tape.record && Flags.get('death.autoplayed') === 0 && settings.coach !== 'off') { Flags.set('death.autoplayed', 1); this.play(); }
    Tut.log('deathCard', { cases: this.snaps.map((x) => x.case) });
  }
  get snap(): DeathSnap | null { return this.snaps[this.seat] ?? null; }
  get hand(): Player | null { const s = this.snap; return s ? this.scene.world.players.find((p) => p.slot === s.slot) ?? null : null; }
  play() { if (!this.tape.record) return; this.rt = 0; this.played++; sfx('rewindHold', { vol: 0.35 }); }

  update(dt: number): boolean {
    if (G.scenes.current !== this.scene) return false;
    this.t += dt;
    const menuOpen = this.scene.overlays.some((o) => o.blocks);
    if (this.rt >= 0) {
      const prev = this.rt;
      this.rt += dt;
      // sound cues on the replay's beats
      const cross = (k: number) => prev < k && this.rt >= k;
      if (cross(1.6) || cross(1.8)) sfx('glyphPress', { vol: 0.5 });
      if (this.reversible() && cross(2.0)) sfx('tapeClick', { vol: 0.5 });
      if (this.reversible() && cross(2.6)) { sfx('rewindLand', { vol: 0.7 }); sfx('lessonPass', { vol: 0.5 }); }
      if (this.rt > REPLAY_T + 30) this.rt = REPLAY_T + 30;
    }
    if (menuOpen) return true;
    const inp = G.input;
    if (inp.pressed('rewind') && this.t > SHOW_AT + 0.2) { inp.consume('rewind'); this.play(); }
    if (inp.pressed('special')) {
      inp.consume('special');
      const g = Panels.open('rewindGuide', { who: this.hand?.input, focus: this.snap?.case === 'c7' ? 4 : this.snap?.case === 'c3' ? 6 : 1 });
      if (g) this.scene.overlays.push(g);
    }
    if (this.snaps.length > 1 && (inp.pressed('tabL') || inp.pressed('tabR'))) {
      this.seat = (this.seat + (inp.pressed('tabR') ? 1 : this.snaps.length - 1)) % this.snaps.length;
      this.killerLook = undefined;
      sfx('uiMove');
    }
    return true;
  }

  /** C1 / C2: a rewind would have saved this hand, so the replay runs back to the Shadow */
  reversible(): boolean { const s = this.snap; return !!s && (s.case === 'c2' || s.case === 'c1'); }

  render(r: Renderer) {
    const ctx = r.ui2;
    const a = Math.min(1, this.t / 0.3);
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * a;
    // the scene fades its own 75% dim in from 1.0 s; together with ours the world sits at ~85%
    const g = Math.min(1, Math.max(0, (this.scene.deathT - 1) / 1)) * 0.75;
    ctx.globalAlpha = a0 * a * Math.max(0, 1 - 0.15 / (1 - g));
    rect(ctx, 0, 0, 640, 360, 'K0');
    ctx.globalAlpha = a0 * a;
    const s = this.snap;
    const who = this.hand?.input ?? null;
    Text.draw(ctx, C('dcTitle'), 320, 30 - Text.lineH('body') / 2, { color: 'R3', align: 'center', outline: 'K0' });
    // ── the replay window ──
    drawPanel(ctx, PX - 2, PY - 2, PW + 4, PH + 4, 'dark');
    if (s) this.drawReplay(ctx, s);
    Text.draw(ctx, C('dcReplay'), PX + 5, PY + 3, { size: 'small', color: 'K8', plate: true });
    // ── the right column ──
    if (s) this.drawColumn(ctx, s, who);
    // ── the model strip (C1 / C2: its first two cells pulse) ──
    const pulse = this.reversible() ? STRIP.undo : 0;
    const k = (Math.sin(G.time * 5) + 1) / 2;
    const ms = ModelStrip.draw(ctx, 320, 248, STRIP.all, { pulse, pulseK: pulse ? k : 0 });
    // ── the buttons ──
    let y = 248 + ms.h + 6;
    const lh = Math.max(Math.ceil(Text.lineH('body')), 15);
    if (this.tape.record) {
      const see = this.played ? C('dcSeeAgain') : C('dcSee');
      Rich.draw(ctx, see, PX, y, { size: 'body', color: this.reversible() ? 'C4' : 'K9', who });
    } else Text.draw(ctx, C('dcNoReplay'), PX, y, { size: 'small', color: 'K7' });
    // {@confirm} continue: grey with a filling rule until the scene accepts it (2.4 s)
    const ready = this.scene.deathT > 2.4;
    const cw = Rich.measure(C('dcContinue'), 'body', who).w;
    Rich.draw(ctx, C('dcContinue'), 612 - cw, y, { size: 'body', color: ready ? 'K10' : 'K6', who });
    if (!ready) { rect(ctx, 612 - cw, y + lh, cw, 1, 'K3'); rect(ctx, 612 - cw, y + lh, Math.round(cw * Math.min(1, this.scene.deathT / 2.4)), 1, 'K8'); }
    y += lh + 3;
    Rich.draw(ctx, C('dcGuide'), PX, y, { size: 'body', color: 'K9', who });
    if (this.snaps.length > 1) { const tw = Rich.measure(C('dcSeat'), 'small', who).w; Rich.draw(ctx, C('dcSeat'), 612 - tw, y + 2, { size: 'small', color: 'K8', who }); }
    ctx.globalAlpha = a0;
  }

  private drawColumn(ctx: CanvasRenderingContext2D, s: DeathSnap, who: Player['input'] | null) {
    let y = 62;
    // the enemy that did it (its own look) and its name
    if (this.killerLook === undefined) {
      const killer = this.scene.world.entities.find((e) => (e as { codexId?: string }).codexId === s.killer || (e as { kind?: string }).kind === s.killer);
      this.killerLook = killer ? captureLook(killer) : [...this.foeLook.values()].find((x) => x) ?? null;
    }
    const lb = Math.ceil(Text.lineH('body')), ls = Math.ceil(Text.lineH('small'));
    if (this.killerLook) {
      const kh = Math.max(24, this.killerLook.h * 2);
      drawPixelArt(ctx, this.killerLook.img, RX + 18, y + kh / 2, 2);
      if (s.killerName) Text.draw(ctx, s.killerName, RX + 40, y + kh / 2, { color: 'K10', valign: 'middle', maxW: RW - 44 });
      y += kh + 6;
    } else if (s.killerName) { Text.draw(ctx, s.killerName, RX, y, { color: 'K10' }); y += lb + 6; }
    else y += 4;
    if (this.snaps.length > 1) {
      // co-op: whose card this is
      rect(ctx, RX, y + 2, 3, lb - 4, slotColor(s.slot));
      Text.draw(ctx, ROMAN[s.slot % 4], RX + 7, y, { color: slotColor(s.slot) });
      y += lb + 2;
    }
    const h = this.headline(s);
    y += Rich.draw(ctx, h.title, RX, y, { size: 'body', color: 'C4', who, maxW: RW }).h + 6;
    if (h.sub) y += Rich.draw(ctx, h.sub, RX, y, { size: 'small', color: 'K8', who, maxW: RW }).h + 6;
    if (s.repeat >= 2) {
      const nm = s.killerName ? tr(s.killerName) : s.killer;
      y += Text.draw(ctx, fill(tr(C('dcRepeat')), { k: s.repeat, name: nm }), RX, y, { size: 'small', color: 'R4', maxW: RW }).h + 2;
      if (s.practise) y += Text.draw(ctx, fill(tr(C('dcPractise')), { lesson: tr(verbName(s.practise === 'lastSecond' ? 'undo' : s.practise)) }), RX, y, { size: 'small', color: 'B5', maxW: RW }).h + 2;
    }
    // co-op: what a teammate could have done (on that teammate's card)
    for (const o of this.snaps) if (o.mateCould === s.slot && o !== s) {
      y += Rich.draw(ctx, fill(tr(C('dcMate')), { r: ROMAN[o.slot % 4] }), RX, y, { size: 'small', color: 'K9', who, maxW: RW }).h + 2;
    }
    // the run's recap (what you did, first times, what to try)
    y = Math.max(y + 4, 196);
    const bottom = 240;
    rect(ctx, RX, y - 3, RW, 1, 'K3');
    for (const line of this.recap) {
      const m = Text.measureWrapped(line, 'small', RW);
      if (y + m.h > bottom + ls) break;
      Text.draw(ctx, line, RX, y, { size: 'small', color: 'K8', maxW: RW });
      y += m.h;
    }
  }

  /** ONBOARD2 §9.2: the headline and its second line for this seat's case */
  headline(s: DeathSnap): { title: string; sub: string | null } {
    const v: Record<string, string | number> = {};
    switch (s.case) {
      case 'c2': {
        v.s = Math.max(0.5, Math.round(s.best!.ago * 2) / 2); v.n = s.best!.gain;
        return { title: fill(tr(C('dcC2')), v), sub: tr(s.alsoC1 ? C('dcC2and1') : S('onboard', 'model1')) };
      }
      case 'c1': return { title: tr(C('dcC1')), sub: fill(tr(C('dcC1sub')), { sand: s.lastSecond!.sand, n: s.lastSecond!.gain }) };
      case 'c3': return { title: fill(tr(C('dcC3')), { sand: s.lastSecond?.sand ?? this.hand?.lo.sand ?? 0 }), sub: tr(C('dcC3sub')) };
      case 'c4': return { title: tr(C('dcC4')), sub: tr(C('dcC4sub')) };
      case 'c5': return { title: tr(C('dcC5')), sub: tr(C('dcC5sub')) };
      case 'c6': return { title: tr(C('dcC6')), sub: tr(C('dcC6sub')) };
      case 'c7': return { title: tr(C('dcC7')), sub: tr(C('dcC7sub')) };
      default: return { title: tr(enemyTip(s.killer)), sub: tr(C('dcC8')) };
    }
  }

  // ───────────────────────── the replay ─────────────────────────
  private drawReplay(ctx: CanvasRenderingContext2D, s: DeathSnap) {
    const frames = this.tape.frames();
    if (!frames.length) { Text.draw(ctx, C('dcNoReplay'), PX + PW / 2, PY + PH / 2, { size: 'small', color: 'K7', align: 'center', valign: 'middle' }); return; }
    const rev = this.reversible();
    // the moment to press (f*), 1.2 s before it (fa), the Shadow's moment (fs)
    const tStar = s.case === 'c2' ? s.best!.t : s.tDeath - (s.case === 'c1' ? 0.2 : 0);
    const tA = Math.max(frames[0].t, tStar - 1.2);
    const star = handAt(frames, s.slot, tStar);
    const back = s.case === 'c2' ? s.best!.shadowAgo : star?.shadow.seconds ?? 0;
    const tS = tStar - back;
    // the way back: the recorded positions from f* down to the Shadow's moment, then its spot
    const path: { x: number; y: number }[] = [];
    for (let i = frames.length - 1; i >= 0; i--) {
      const m = frames[i];
      if (m.t > tStar + 1e-6 || m.t < tS - 1e-6) continue;
      const h = m.hands.find((x) => x.on && x.slot === s.slot);
      if (h) path.push({ x: h.x, y: h.y });
    }
    if (star) { path.unshift({ x: star.x, y: star.y }); path.push({ x: star.shadow.x, y: star.shadow.y }); }
    // the view: around what happens (1×; co-op 0.5× when the hands are far apart)
    const pts: { x: number; y: number }[] = [];
    for (const m of frames) if (m.t >= tA - 0.05 && m.t <= tStar + 0.35) for (const h of m.hands) if (h.on) pts.push(h);
    if (star) pts.push({ x: star.shadow.x, y: star.shadow.y });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    if (!isFinite(x0)) { x0 = x1 = frames[frames.length - 1].cam.x + 320; y0 = y1 = frames[frames.length - 1].cam.y + 180; }
    const sc = x1 - x0 > PW - 60 || y1 - y0 > PH - 60 ? 0.5 : 1;
    const vw = PW / sc, vh = PH / sc;
    // centred on what happens, then kept inside the room (no void past its outer walls)
    const map = this.scene.world.map;
    const fit = (v: number, size: number, room: number) => (room <= size ? Math.round((room - size) / 2) : Math.max(0, Math.min(room - size, v)));
    const vx = fit(Math.round((x0 + x1) / 2 - vw / 2), vw, map.pw), vy = fit(Math.round((y0 + y1) / 2 - 8 - vh / 2), vh, map.ph);
    const P = (wx: number, wy: number) => ({ x: PX + (wx - vx) * sc, y: PY + (wy - vy) * sc });
    // timeline
    const rt = this.rt;
    let t = tStar, phase: 'still' | 'play' | 'hold' | 'back' | 'land' = 'still', backK = 0;
    if (rt >= 0) {
      if (rt < 0.3) { t = tA; phase = 'play'; }
      else if (rt < 1.5) { t = tA + ((tStar - tA) * (rt - 0.3)) / 1.2; phase = 'play'; }
      else if (rt < 2.0 || !rev) { t = tStar; phase = 'hold'; }
      else if (rt < 2.6) { backK = (rt - 2.0) / 0.6; t = tStar - back * backK; phase = 'back'; }
      else { t = tS; phase = 'land'; }
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(PX, PY, PW, PH); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    // the room itself (its floor, decals and walls; no entities): the real art, pixel for pixel
    const w = this.scene.world;
    rect(ctx, PX, PY, PW, PH, 'K1');
    ctx.save();
    ctx.translate(PX - vx * sc, PY - vy * sc);
    ctx.scale(sc, sc);
    ctx.drawImage(w.vis.floor, 0, 0);
    ctx.drawImage(w.decals, 0, 0);
    for (const ws of w.vis.walls) if (ws.y + 48 >= vy && ws.y <= vy + vh + 40) ctx.drawImage(ws.canvas, 0, ws.y);
    ctx.restore();
    // outside the ripple the colour drains while the tape runs back (a dark veil, like the game's)
    if (phase === 'back' || phase === 'hold') { ctx.globalAlpha = 0.25; rect(ctx, PX, PY, PW, PH, 'K0'); ctx.globalAlpha = 1; }
    ctx.save();
    ctx.translate(PX - vx * sc, PY - vy * sc);
    ctx.scale(sc, sc);
    // enemies at their recorded places
    const fr = frameAt(frames, Math.min(t, tStar + (rev ? 0 : 0.3)));
    for (const f of fr.foes) {
      if (!f.on) continue;
      const pos = foeAt(frames, f.id, t) ?? f;
      const look = this.foeLook.get(f.id);
      if (look) drawSprite(ctx, look, pos.x, pos.y, { flip: f.flip });
      else { rect(ctx, Math.round(pos.x) - 5, Math.round(pos.y) - 10, 10, 10, 'K3'); }
    }
    // every hand; the focused one with its Shadow and hairspring
    for (const h of fr.hands) {
      if (!h.on) continue;
      const focus = h.slot === s.slot;
      const cur = handAt(frames, h.slot, phase === 'back' || phase === 'land' ? tStar : t) ?? h;
      let hx = cur.x, hy = cur.y, spr = cur.spr, flip = cur.flip;
      if (focus && (phase === 'back' || phase === 'land') && star) {
        // running back along the real recorded path, then on to the Shadow's recorded spot
        const q = phase === 'land' ? { x: star.shadow.x, y: star.shadow.y } : alongPath(path, backK);
        hx = q.x; hy = q.y;
        if (phase === 'land') { spr = star.shadow.spr; flip = star.shadow.flip; }
      }
      // (a death the rewind could not have answered shows no Shadow at the end: nothing to jump back to)
      if (focus && star && ((rev && (phase === 'hold' || phase === 'back' || phase === 'still')) || (phase === 'play' && cur.shadow.ok))) {
        const sh = phase === 'play' ? cur.shadow : star.shadow;
        if (sh.spr && sh.ok && (phase !== 'back' || backK < 0.95) && Math.hypot(sh.x - hx, sh.y - hy) > 4) {
          // the hairspring (C3 40%) and the hollow Shadow with its +N
          ctx.globalAlpha = 0.4; ctx.strokeStyle = col('C3'); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(Math.round(hx) + 0.5, Math.round(hy) - 8.5); ctx.lineTo(Math.round(sh.x) + 0.5, Math.round(sh.y) - 8.5); ctx.stroke();
          ctx.globalAlpha = 1;
          drawShadowOutline(ctx, sh.spr, sh.x, sh.y, focus ? 'C3' : slotColor(h.slot), { flip: sh.flip });
          if (sh.gain > 0 && rev) G.digits.draw(ctx, '+' + Math.round(sh.gain), Math.round(sh.x), Math.round(sh.y) - 36, { fill: 'C4', outline: 'K0', align: 'center' });
        }
      }
      // the hand: its slot ring, its sprite (a hit flashes it white for 0.1 s)
      ctx.strokeStyle = col(slotColor(h.slot)); ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(Math.round(hx) + 0.5, Math.round(hy) + 0.5, 7, 3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      const flash = phase === 'play' && hitNear(frames, h.slot, t, 0.1);
      if (spr) {
        if (phase === 'back') for (const lag of [0.12, 0.06]) {
          const q = alongPath(path, Math.max(0, backK - lag));
          ctx.globalAlpha = lag > 0.1 ? 0.18 : 0.32;
          drawSprite(ctx, spr, q.x, q.y, { flip, tint: '#5fe1ff' });
          ctx.globalAlpha = 1;
        }
        drawSprite(ctx, spr, hx, hy, { flip, tint: flash ? '#ffffff' : undefined });
      }
      // damage numbers rising over the hand
      if (phase === 'play' || phase === 'hold') for (const m of frames) for (const hit of m.hits) {
        if (hit.slot !== h.slot || m.t > t || t - m.t > 0.7) continue;
        const k = (t - m.t) / 0.7;
        G.digits.draw(ctx, '-' + Math.round(hit.amount), Math.round(cur.x), Math.round(cur.y - 26 - k * 14), { fill: hit.fixed ? 'V3' : 'R4', outline: 'K0', align: 'center', alpha: 1 - k * 0.6 });
      }
    }
    ctx.restore();
    // ── the beats on top ──
    const focusHand = star ? P(star.x, star.y) : { x: PX + PW / 2, y: PY + PH / 2 };
    if (phase === 'back' && star) {
      // a cyan ripple round the hand running back
      const at = alongPath(path, backK);
      const q = P(at.x, at.y - 8);
      const rr = (20 + 14 * Math.sin(backK * Math.PI)) * sc;
      ctx.strokeStyle = col('C3'); ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.18; for (let yy = PY + (Math.floor(G.time * 60) % 3); yy < PY + PH; yy += 3) rect(ctx, PX, yy, PW, 1, 'C2');
      ctx.globalAlpha = 1;
    }
    if (phase === 'hold') {
      // 2× {@rewind} goes down twice; "press it here" (only where a press would have saved the hand)
      const down = (rt > 1.6 && rt < 1.7) || (rt > 1.8 && rt < 1.9);
      if (rev) {
        bigPrompt(ctx, 'rewind', PX + PW / 2, PY + PH / 2 - 10, this.hand?.input, down ? 'down' : 'up');
        const line = tr(C('dcPressHere'));
        const m = Rich.measure(line, 'body', this.hand?.input);
        ctx.globalAlpha = 0.85; rect(ctx, PX + PW / 2 - m.w / 2 - 6, PY + PH - m.h - 8, m.w + 12, m.h + 4, 'K0'); ctx.globalAlpha = 1;
        Rich.draw(ctx, line, PX + PW / 2, PY + PH - m.h - 6, { size: 'body', color: 'C4', align: 'center', who: this.hand?.input });
      }
    }
    if (phase === 'land' && star && s) {
      const k = Math.min(1, (rt - 2.6) / 0.5);
      const q = P(star.shadow.x, star.shadow.y - 8);
      // the shrinking 12-tick landing ring
      ctx.fillStyle = col('C4');
      const rr = (12 - 6 * k) * sc + 4;
      for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; ctx.fillRect(Math.round(q.x + Math.cos(ang) * rr), Math.round(q.y + Math.sin(ang) * rr * 0.6), 2, 1); }
      const gain = s.case === 'c2' ? s.best!.gain : s.lastSecond?.gain ?? 0;
      Text.draw(ctx, '+' + gain, Math.round(q.x), Math.round(q.y - 34 - Text.lineH('title') / 2), { size: 'title', color: 'C3', align: 'center', outline: 'K0' });
      drawStamp(ctx, C('undoneStamp'), PX + PW / 2, PY + 22, 'C4', Math.min(0.9, rt - 2.6));
      const a = Math.round(s.hpAt), b = Math.min(s.maxHp, Math.round(s.hpAt + gain));
      const line = fill(tr(C('dcBack')), { s: Math.max(0.5, Math.round(back * 2) / 2), a, b });
      const m = Text.measure(line, 'body');
      ctx.globalAlpha = 0.85; rect(ctx, PX + PW / 2 - m.w / 2 - 6, PY + PH - Text.lineH('body') - 8, m.w + 12, Text.lineH('body') + 4, 'K0'); ctx.globalAlpha = 1;
      Text.draw(ctx, line, PX + PW / 2, PY + PH - Text.lineH('body') - 6, { color: 'K10', align: 'center' });
    }
    // the clock in the corner: how long before the end this frame is
    if (rt >= 0 || phase === 'still') {
      const ago = s.tDeath - t;
      const str = (ago > 0.05 ? '-' : '') + Math.abs(ago).toFixed(1) + 's';
      G.digits.draw(ctx, str, PX + PW - 6, PY + PH - 12, { fill: phase === 'back' ? 'C4' : 'K8', outline: 'K0', align: 'right' });
    }
    ctx.restore();
    void focusHand;
  }
}

// ───────────────────────── sampling helpers ─────────────────────────
/** the point a fraction k along a polyline (by length) */
function alongPath(pts: { x: number; y: number }[], k: number): { x: number; y: number } {
  if (!pts.length) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let d = Math.max(0, Math.min(1, k)) * total;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (d <= L && L > 0) { const f = d / L; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f }; }
    d -= L;
  }
  return pts[pts.length - 1];
}
function frameAt(frames: TapeMeta[], t: number): TapeMeta {
  let best = frames[0];
  for (const m of frames) { if (m.t <= t + 1e-6) best = m; else break; }
  return best;
}
/** a hand's state at sim time t (positions interpolated between samples) */
function handAt(frames: TapeMeta[], slot: number, t: number): TapeHand | null {
  let a: TapeHand | null = null, ta = 0, b: TapeHand | null = null, tb = 0;
  for (const m of frames) {
    const h = m.hands.find((x) => x.on && x.slot === slot);
    if (!h) continue;
    if (m.t <= t) { a = h; ta = m.t; } else { b = h; tb = m.t; break; }
  }
  if (!a) return b;
  if (!b || tb <= ta) return a;
  const k = (t - ta) / (tb - ta);
  return { ...a, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}
function foeAt(frames: TapeMeta[], id: number, t: number): { x: number; y: number } | null {
  let a: { x: number; y: number } | null = null, ta = 0;
  for (const m of frames) {
    const f = m.foes.find((x) => x.on && x.id === id);
    if (!f) continue;
    if (m.t <= t) { a = f; ta = m.t; continue; }
    if (!a) return f;
    const k = (t - ta) / Math.max(1e-3, m.t - ta);
    return { x: a.x + (f.x - a.x) * k, y: a.y + (f.y - a.y) * k };
  }
  return a;
}
function hitNear(frames: TapeMeta[], slot: number, t: number, win: number): boolean {
  for (const m of frames) if (m.t <= t && t - m.t <= win && m.hits.some((h) => h.slot === slot)) return true;
  return false;
}

/** C8: what to watch for with this enemy (GDD2 §9.6; P2 / P7 extend the table) */
const TIPS: Record<string, L10n> = {
  cogling: { zh: '齿轮仔蓄力后会直冲：侧向冲刺躲开', en: 'A Cogling winds up, then rolls straight: dash sideways' },
  sentry: { zh: '锡兵后拉长枪就要突刺：等它刺完再上', en: 'A Sentry pulls its spear back to thrust: strike after it' },
  spitter: { zh: '炮台炮口发光后连射三发：横着走开', en: 'The muzzle glows, then three bolts: step aside' },
  mite: { zh: '锈螨会扑跳：别站在一群中间', en: 'Rust Mites leap: do not stand in the swarm' },
  brute: { zh: '蒸汽蛮兵抡锤前会停顿：冲刺穿过去', en: 'The Brute pauses before the swing: dash through' },
};
function enemyTip(kind: string): L10n { return TIPS[kind] ?? S('coach', 'dcC8generic'); }

// ───────────────────────── wiring ─────────────────────────
let card: DeathCardOverlay | null = null;
/** "Practise {lesson} in the Rehearsal Hall": taken by the workshop once the summary is done */
let hallAfterDeath: string | null = null;
export function takeHallLesson(): string | null { const l = hallAfterDeath; hallAfterDeath = null; return l; }
Stage.onUpdate((dt) => {
  const sc = sceneOf();
  if (!sc) { card = null; return; }
  if (card && card.scene !== sc) card = null;
  const w = sc.world;
  const tape = tapeOf(w);
  if (!tape) return;
  tape.tickReal(dt);
  if (card || !w.players.length || !w.players.every((p) => Down.isOut(p)) || sc.deathT < SHOW_AT) return;
  card = new DeathCardOverlay(sc, tape);
  sc.overlays.push(card);
});

Onboard.deathCard = {
  active: () => !!card && card.scene === G.scenes.current,
  lastSnap: () => (card ? card.snaps : null),
};
Tut.register('death', {
  snap: () => (card ? card.snaps.map((s) => ({ ...s, killerName: s.killerName ? tr(s.killerName) : null })) : null),
  replay: () => (card ? { playing: card.rt >= 0 && card.rt < REPLAY_T, t: +Math.max(0, card.rt).toFixed(2) } : null),
  play: () => card?.play(),
  seek: (t: number) => { if (card) card.rt = t; },
  headline: () => (card && card.snap ? card.headline(card.snap) : null),
});
