// The six loops of "How rewind works" (ONBOARD2 §7.4), frame by frame, and the Hall's lesson
// previews. Times are loop seconds; the stage is 184×72 with the feet line at y 56. The loop
// squeezes "3 seconds" into ~1 s of stage time but its words still say 3 s (the real number).
import { S } from '../strings';
import type { L10n } from '../i18n';
import { track, type LoopDef, type LoopCtx } from './loopPlayer';
import { col } from '../../art/palette';
import '../strings/coach';

const C = (k: string): L10n => S('coach', k);
/** 0..1 of a span, clamped */
const span = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const ease = (k: number) => 1 - (1 - k) * (1 - k);

// ───────────────────────── 1 · Undo (4.4 s) ─────────────────────────
const UNDO: LoopDef = {
  id: 'undo', name: C('loopUndo'), period: 4.4, caption: C('loopUndoCap'), sub: C('loopUndoSub'),
  keys: [{ a: 'rewind', word: C('gKeyTap') }], teach: 'undo', lesson: 'undo',
  draw(L, t) {
    const walk = track([[0, 36, 56], [1.2, 108, 56]], t);
    // the cogling rolls in from the right and bumps the hand at 1.2
    const cx = t < 1.2 ? 150 - t * 20 * 1.5 : 122 + Math.max(0, 1 - (t - 1.2) * 4) * 2;
    const hit = t >= 1.2;
    const back = span(t, 1.8, 2.05), landed = t >= 2.05;
    // the hand: run, get hit (white 2 frames, 4 px knock), wait, travel back to the Shadow
    let hx = walk.x, hy = 56;
    if (hit && t < 1.8) hx = 108 - Math.min(4, (t - 1.2) * 40);
    if (t >= 1.8) hx = 104 + (48 - 104) * ease(back);
    // the Shadow = where the hand was 1 stage-second before (frozen at the hit)
    const shadowX = t < 1.2 ? 36 + 60 * Math.max(0, Math.min(1.2, t - 1)) : 48;
    // HUD in the corner: HP 40×4 and the Sand number
    const gainShown = hit && !landed ? 12 : 0;
    L.hp(6, 6, 40, 4, landed ? 50 : hit ? 38 : 50, gainShown);
    L.hourglass(50, 3, true); L.hourglass(58, 3, !landed);
    L.num(68, 7.5, landed ? '100' : '200', 'C3', { align: 'left' });
    if (landed && t < 3.2) L.num(88, 7.5, '-100', 'C4', { align: 'left', alpha: 1 - span(t, 2.6, 3.2) });
    L.cog(cx, 56, { spin: t * (t < 1.2 ? 6 : 0), flash: hit && t < 1.25, look: -1 });
    // the Shadow (from 0.4) and its hairspring, the +12 over it after the hit
    if (t >= 0.4 && t < 2.05) {
      const a = span(t, 0.4, 0.6);
      L.line(shadowX, 48, hx, 48, 'C3', 0.4 * a);
      L.shadow(shadowX, 56, { alpha: a });
      if (hit) L.num(shadowX, 22, '+12', 'C4');
    }
    // the echo walks the cut seconds again (60%, not stressed)
    if (landed && t < 4.4) {
      const e = track([[2.05, 48, 56], [3.6, 108, 56]], t);
      L.echo(e.x, 56, { pose: e.moving ? 'run' : 'idle', t, alpha: 0.6 * (t > 4 ? 1 - span(t, 4, 4.4) : 1) });
    }
    if (t >= 1.8 && t < 2.05) {
      // the ripple and three afterimages along the way back
      L.ring(hx, 46, 20, 'C3', 0.3);
      for (let i = 1; i <= 3; i++) L.preview(hx + i * 7, 56, { alpha: 0.3 });
    }
    L.tick(hx, hy, { pose: t < 1.2 && walk.moving ? 'run' : hit && t < 1.5 ? 'hurt' : 'idle', t, flash: hit && t < 1.234 });
    if (hit && t < 1.8) L.rise(hx, 56, '-12', 'R4', (t - 1.2) / 0.6);
    // the button over the hand: fades in at 1.3, goes down at 1.70, up at 1.78
    if (t >= 1.3 && t < 2.05) {
      const down = t >= 1.7 && t < 1.78;
      L.glyph('rewind', 108, 18, down ? 'down' : 'up', 0, span(t, 1.3, 1.45));
      if (t < 1.7) L.text(122, 18, C('gKeyTap'), 'K9', { align: 'left' });
      if (t >= 1.7 && t < 1.95) L.ring(108, 18, 6 + span(t, 1.7, 1.95) * 6, 'C3', 1 - span(t, 1.7, 1.95));
    }
    if (landed) {
      const k = span(t, 2.05, 2.55);
      if (k < 1) L.clockRing(48, 50, 12 - 6 * k, 1 - k * 0.5);
      if (t < 3.0) L.rise(48, 60, '+12', 'C3', span(t, 2.05, 2.65) * 0.7);
    }
  },
};

// ───────────────────────── 2 · Echo (4.8 s) ─────────────────────────
const ECHO: LoopDef = {
  id: 'echo', name: C('loopEcho'), period: 4.8, caption: C('loopEchoCap'), sub: C('loopEchoSub'),
  keys: [{ a: 'attack', word: C('gKeyAttack') }, { a: 'rewind', word: C('gKeyTap') }], teach: 'echo', lesson: 'echo',
  draw(L, t) {
    const run = track([[0, 40, 56], [0.7, 110, 56]], t);
    const swings = [0.75, 1.05, 1.4], dmg = [12, 12, 22];
    let hp = 50;
    for (let i = 0; i < 3; i++) if (t >= swings[i]) hp -= dmg[i];
    const broken = t >= 3.2;
    const back = span(t, 2.15, 2.4);
    let hx = run.x;
    if (t >= 2.0 && t < 2.15) hx = 110 - Math.min(4, (t - 2) * 40);
    if (t >= 2.15) hx = 106 + (40 - 106) * ease(back);
    // the dummy and its 6-cell bar (B5 frame, R3 fill), "Kept ✓" once the rewind lands
    const wind = t >= 1.6 && t < 2.0, punch = t >= 2.0 && t < 2.3;
    if (!broken) {
      L.dummy(128, 56, wind ? 'wind' : punch ? 'punch' : swings.some((s) => t >= s && t < s + 0.08) ? 'hit' : 'idle', { flip: true });
      if (wind) L.fan(122, 56, 'l', span(t, 1.6, 2.0));
      const bx = 116, by = 26;
      L.c.fillStyle = col('K0'); L.c.fillRect(bx - 1, by - 1, 26, 5);
      for (let i = 0; i < 6; i++) { L.c.fillStyle = i < Math.ceil((hp / 50) * 6) ? col('R3') : col('K3'); L.c.fillRect(bx + i * 4, by, 3, 3); }
      if (t >= 2.45 && t < 3.65) { L.text(146, 27, C('kept'), 'G4', { align: 'left', alpha: 1 - span(t, 3.4, 3.65) }); L.check(146 + 20, 25, 1 - span(t, 3.4, 3.65)); }
    } else if (t < 4.2) {
      // debris (B3 / K6) flying out
      const k = span(t, 3.2, 3.9);
      for (let i = 0; i < 8; i++) { const a = -Math.PI * (0.1 + (i / 7) * 0.8), d = 4 + k * 16; L.c.fillStyle = i % 2 ? col('B3') : col('K6'); L.c.fillRect(Math.round(128 + Math.cos(a) * d), Math.round(48 + Math.sin(a) * d + k * k * 18), 2, 2); }
    }
    // the player's three swings (white numbers)
    for (let i = 0; i < 3; i++) { L.slash(hx, 56, 'r', (t - swings[i]) / 0.18); L.rise(124, 56, String(dmg[i]), 'K10', (t - swings[i]) / 0.6); }
    // the echo: appears at 2.45 where the hand went back, runs in, the first swing breaks the dummy
    if (t >= 2.45 && t < 4.4) {
      const e = track([[2.45, 40, 56], [3.15, 110, 56]], t);
      const shatter = t >= 4.2;
      if (!shatter) L.echo(e.x, 56, { pose: e.moving ? 'run' : 'idle', t, alpha: 0.85 });
      for (const s of [3.2, 3.5, 3.85]) L.slash(e.x, 56, 'r', (t - s) / 0.18, 'C4');
      L.rise(124, 56, '7', 'C4', (t - 3.2) / 0.6, 'R2');
      if (shatter) for (let i = 0; i < 6; i++) { const k = span(t, 4.2, 4.6); L.c.fillStyle = col('C3'); L.c.fillRect(Math.round(110 + (i - 3) * 3 * (1 + k * 3)), Math.round(46 + k * k * 12 - (i % 2) * 3), 1, 2); }
    }
    // the hand
    L.tick(hx, 56, { pose: run.moving && t < 0.7 ? 'run' : punch ? 'hurt' : 'idle', t, flash: t >= 2.0 && t < 2.034 });
    if (t >= 2.0 && t < 2.6) L.rise(hx, 56, '-8', 'R4', (t - 2.0) / 0.6);
    if (t >= 1.6 && t < 2.15) {
      // where it will land: the Shadow back at the start
      L.shadow(40, 56, { alpha: span(t, 1.6, 1.8) * 0.9 });
      const down = t >= 2.1 && t < 2.18;
      L.glyph('rewind', 110, 18, down ? 'down' : 'up', 0, span(t, 1.7, 1.85));
    }
    if (t >= 2.4 && t < 3.0) L.rise(40, 60, '+8', 'C3', span(t, 2.4, 3.0) * 0.8);
  },
};

// ───────────────────────── 3 · Paradox (3.6 s) ─────────────────────────
const PARADOX: LoopDef = {
  id: 'paradox', name: C('loopParadox'), period: 3.6, caption: C('loopParadoxCap'), sub: C('loopParadoxSub'),
  keys: [{ a: 'move', word: C('gKeyMove') }], teach: 'paradox', lesson: 'paradox',
  draw(L, t) {
    const walk = track([[0, 24, 56], [0.9, 92, 56]], t);
    const boom = t >= 0.9;
    const bk = span(t, 0.9, 1.15);
    // mini Sand: +20 when the blast lands
    L.hourglass(6, 3, true); L.hourglass(14, 3, t >= 1.3);
    L.num(24, 7.5, t >= 1.3 ? '160' : '140', 'C3', { align: 'left' });
    if (!boom) {
      // the armed echo standing with its ◆ and the beating ground ring
      L.ellipse(96, 56, 9, 4, 'C3', 0.4 + 0.3 * Math.sin(t * 20));
      L.echo(96, 56, { armed: true, diamondT: t, alpha: 0.85 });
      L.cog(82, 48, { spin: 0, look: 1 }); L.cog(112, 62, { spin: 1, look: -1 });
      if (t >= 0.45) {
        // within 56 px: the dashed preview circle, ▾ over what it will hit
        const mx = (walk.x + 96) / 2;
        L.dotted(mx + 10, 54, 48, 'C2', span(t, 0.45, 0.6));
        for (const [x, y] of [[82, 48], [112, 62]]) { L.c.fillStyle = col('R4'); L.c.fillRect(x - 2, y - 24, 5, 1); L.c.fillRect(x - 1, y - 23, 3, 1); L.c.fillRect(x, y - 22, 1, 1); }
      }
    } else {
      // the blast: r6 → r48 in 0.25 s, C4 → C2; the coglings take 50 and break; the echo turns to glass
      if (bk < 1) { L.ring(96, 50, 6 + 42 * bk, bk < 0.5 ? 'C4' : 'C2', 1 - bk * 0.6, 2); L.ring(96, 50, 4 + 30 * bk, 'K10', 0.6 * (1 - bk)); }
      if (t < 1.25) { L.c.globalAlpha = 0.5 * (1 - span(t, 0.9, 1.0)); L.c.fillStyle = col('W'); L.c.fillRect(0, 0, 184, 72); L.c.globalAlpha = 1; }
      for (const [x, y] of [[82, 48], [112, 62]]) {
        const k = span(t, 0.95, 1.6);
        if (k < 1) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; L.c.fillStyle = i % 2 ? col('B3') : col('B1'); L.c.fillRect(Math.round(x + Math.cos(a) * k * 12), Math.round(y - 6 + Math.sin(a) * k * 10 + k * k * 8), 2, 2); }
        L.rise(x, y + 4, '50', 'C4', span(t, 0.95, 1.55), 'R2');
      }
      const gk = span(t, 0.9, 1.5);
      if (gk < 1) for (let i = 0; i < 8; i++) { L.c.fillStyle = i % 2 ? col('C4') : col('C3'); L.c.fillRect(Math.round(96 + (i - 4) * 3 * (1 + gk * 2)), Math.round(44 - Math.sin((i / 8) * Math.PI) * gk * 8 + gk * gk * 14), 1, 2); }
      if (t < 2.1) L.stamp(C('d4Stamp'), 92, 12, t - 0.9);
      // +20 flying to the Sand
      const fk = span(t, 1.0, 1.3);
      if (fk < 1) L.num(96 + (30 - 96) * fk, 30 + (8 - 30) * fk, '+20', 'C4');
      if (t < 1.4) L.clockRing(walk.x, 50, 10, 0.8);
    }
    L.tick(boom ? 92 : walk.x, 56, { pose: !boom && walk.moving ? 'run' : 'idle', t });
  },
};

// ───────────────────────── 4 · Hold: pick how far (5.2 s) ─────────────────────────
const SCRUB: LoopDef = {
  id: 'scrub', name: C('loopScrub'), period: 5.2, caption: C('loopScrubCap'), sub: C('loopScrubSub'),
  keys: [{ a: 'rewind', word: C('gKeyHold') }, { a: 'dash', word: C('gKeyDash') }], teach: 'scrub', lesson: 'scrub',
  draw(L, t) {
    const run = track([[0, 24, 56], [1.6, 144, 56]], t);
    // the tape fills as it runs; two red notches at the two hits
    const fill = Math.min(1, t / 1.6);
    const n1 = 0.7 / 1.6, n2 = 1.3 / 1.6;
    const holding = t >= 1.7 && t < 2.9;
    const hk = span(t, 1.7, 2.9);
    // the preview slides back along the path: x 144 → 64 over 1.2 s; the tape cursor follows
    const px = 144 + (64 - 144) * hk;
    const cursor = holding || (t >= 2.9 && t < 3.15) ? (px - 24) / 120 : -1;
    const landed = t >= 3.15;
    L.tape(62, 66, 60, 5, landed ? (64 - 24) / 120 : fill, landed ? [n1] .filter((n) => n < (64 - 24) / 120) : [t >= 0.7 ? n1 : -1, t >= 1.3 ? n2 : -1], landed ? -1 : cursor, holding ? (px - 24) / 120 : -1);
    // the gears: a shadow grows, then the gear drops (−8 each)
    for (const [tg, gx] of [[0.7, 76], [1.3, 121]] as const) {
      const sk = span(t, tg - 0.35, tg);
      if (t < tg) { L.ellipse(gx, 56, 2 + 6 * sk, 1 + 2 * sk, 'K0', 0.5, true); L.gear(gx, 56 - 40 * (1 - sk), t); }
      else if (t < tg + 0.3) { const k = span(t, tg, tg + 0.3); for (let i = 0; i < 4; i++) { L.c.fillStyle = col('B3'); L.c.fillRect(Math.round(gx + (i - 1.5) * 4 * (1 + k)), Math.round(52 + k * 4 - (i % 2) * 3), 2, 2); } }
      L.rise(gx, 56, '-8', 'R4', (t - tg) / 0.6);
    }
    // Sand: 200 → 132 on landing
    L.hourglass(6, 3, true); L.hourglass(14, 3, !landed);
    L.num(24, 7.5, landed ? '132' : '200', 'C3', { align: 'left' });
    if (landed && t < 4.2) L.num(46, 7.5, '-68', 'C4', { align: 'left', alpha: 1 - span(t, 3.7, 4.2) });
    // the future echo's stretch (from the preview to the hand) while holding
    if (holding) L.line(px, 49, 144, 49, 'C3', 0.5, 2);
    if (holding) {
      L.preview(px, 56, { face: 'l' });
      // the label over the preview: +0 −25 → +8 −38 → +16 −60 → +16 −68
      const gain = px <= 76 ? 16 : px <= 121 ? 8 : 0, cost = Math.round(25 + 43 * hk);
      L.num(px - 4, 26, '+' + gain, gain ? 'C4' : 'K6', { align: 'right' });
      L.num(px + 2, 26, '-' + cost, 'C3', { align: 'left' });
    }
    // the hand: runs, then holds (still), then travels back 0.25 s to the preview's spot
    let hx = run.x;
    if (t >= 2.9) hx = 144 + (64 - 144) * ease(span(t, 2.9, 3.15));
    L.tick(hx, 56, { pose: run.moving && t < 1.6 ? 'run' : 'idle', t, flash: (t >= 0.7 && t < 0.734) || (t >= 1.3 && t < 1.334) });
    if (t >= 1.5 && t < 3.15) {
      const st = t < 1.7 ? 'up' : holding ? 'hold' : 'up';
      L.glyph('rewind', 144, 16, st, holding ? hk : 0, span(t, 1.5, 1.65));
      L.text(128, 16, C('gKeyHold'), holding ? 'C4' : 'K9', { align: 'right' });
    }
    if (landed && t < 3.8) { L.clockRing(64, 50, 12 - 6 * span(t, 3.15, 3.65)); L.rise(64, 60, '+16', 'C3', span(t, 3.15, 3.75) * 0.7); }
    if (landed && t < 5.2) {
      const e = track([[3.15, 64, 56], [4.8, 144, 56]], t);
      L.echo(e.x, 56, { pose: e.moving ? 'run' : 'idle', t, alpha: 0.5 });
    }
  },
};

// ───────────────────────── 5 · Fork (5.0 s) ─────────────────────────
const FORK: LoopDef = {
  id: 'fork', name: C('loopFork'), period: 5.0, caption: C('loopForkCap'), sub: C('loopForkSub'),
  keys: [{ a: 'fork', word: C('gKeyFork') }], teach: 'fork', lesson: 'fork',
  draw(L, t) {
    const path: [number, number, number][] = [[0, 30, 60], [0.85, 90, 60], [1.2, 112, 50]];
    const me = t < 1.2 ? track(path, t) : t < 1.6 ? track([[1.2, 112, 50], [1.6, 88, 66]], t) : t < 2.9 ? { x: 88, y: 66, moving: false, face: 'r' as const } : track([[2.9, 88, 66], [3.3, 108, 52]], t);
    const boom = t >= 3.3;
    // Sand 200 → 150 at the press
    L.hourglass(6, 3, true); L.hourglass(14, 3, t < 1.2);
    L.num(24, 7.5, t >= 1.2 ? '150' : '200', 'C3', { align: 'left' });
    if (t >= 1.2 && t < 2.0) L.num(46, 7.5, '-50', 'C4', { align: 'left', alpha: 1 - span(t, 1.6, 2.0) });
    // the jar (whole until the blast)
    if (!boom) L.jar(120, 52);
    else { L.jarBase(120, 52); if (t < 4.6) L.shatter(120, 52, span(t, 3.3, 3.9), true); }
    // the mark where Fork was pressed
    if (t >= 1.2 && !boom) L.mark(112, 51);
    // the echo: unspools from the path's start, walks to the mark, stands, ◆ at 2.8
    if (t >= 1.2 && !boom) {
      const e = track([[1.2, 30, 60], [1.85, 90, 60], [2.4, 112, 50]], t);
      const armed = t >= 2.8;
      for (let i = 0; i < 5; i++) { const k = span(t, 1.2 + i * 0.06, 1.5 + i * 0.06); if (k > 0 && k < 1) L.ring(30 + i * 15, 58, 2 + k * 3, 'C3', 1 - k); }
      if (t < 2.4) L.line(e.x, 59, 112, 51, 'C3', 0.35, 2);
      L.echo(e.x, e.y, { pose: e.moving ? 'run' : 'idle', t, alpha: 0.85, armed, diamondT: t - 2.8 });
      if (t >= 3.1) L.dotted(110, 52, 48, 'C2', span(t, 3.1, 3.2));
    }
    if (boom) {
      const bk = span(t, 3.3, 3.55);
      if (bk < 1) { L.ring(112, 46, 6 + 42 * bk, bk < 0.5 ? 'C4' : 'C2', 1 - bk * 0.6, 2); }
      if (t < 3.45) { L.c.globalAlpha = 0.45 * (1 - span(t, 3.3, 3.42)); L.c.fillStyle = col('W'); L.c.fillRect(0, 0, 184, 72); L.c.globalAlpha = 1; }
    }
    L.tick(boom ? 108 : me.x, boom ? 52 : me.y, { pose: me.moving ? 'run' : 'idle', face: t >= 1.2 && t < 1.6 ? 'l' : 'r', t });
    if (t >= 0.7 && t < 1.5) {
      const down = t >= 1.2 && t < 1.28;
      L.glyph('fork', 112, 14, down ? 'down' : 'up', 0, span(t, 0.7, 0.85));
      if (t >= 1.2) L.ring(112, 14, 6 + span(t, 1.2, 1.45) * 6, 'C3', 1 - span(t, 1.2, 1.45));
    }
  },
};

// ───────────────────────── 6 · Sand & Tape (4.6 s) ─────────────────────────
const SAND: LoopDef = {
  id: 'sand', name: C('loopSand'), period: 4.6, caption: C('loopSandCap'), sub: C('loopSandSub'),
  keys: [{ a: 'rewind', word: C('gKeyTap') }, { a: 'attack', word: C('gKeyAttack') }], teach: 'undo', lesson: 'echo',
  draw(L, t) {
    const hit = t >= 0.8, tapped = t >= 1.3;
    // the HUD, 1.5× big: HP bar, Tape, Sand
    L.hp(8, 8, 80, 6, tapped || !hit ? 50 : 40, hit && !tapped ? 10 : 0);
    const notch = hit && !tapped ? 1 - span(t, 0.8, 2.3) : -1;
    L.tape(8, 20, 90, 5, Math.min(1, t / 0.6), notch >= 0 ? [notch] : []);
    L.text(53, 30, C('tapeWord'), 'K8');
    // Sand: 200 → 100 (0.3 s roll) → 146 → 156 as hits land
    const hits = [1.9, 2.2, 2.55], echoHits = [2.85, 3.15];
    let sand = 200;
    if (tapped) sand = Math.round(200 - 100 * span(t, 1.3, 1.6));
    let add = 0;
    for (let i = 0; i < 3; i++) if (t >= hits[i] + 0.25) add += [12, 12, 22][i];
    for (const e of echoHits) if (t >= e + 0.25) add += 5;
    sand += add;
    L.hourglass(104, 16, true); L.hourglass(112, 16, sand >= 199);
    L.num(124, 20.5, String(sand), 'C3', { align: 'left' });
    L.num(146, 20.5, '/200', 'K7', { align: 'left' });
    if (tapped && t < 2.0) L.num(150, 32, '-100', 'C4', { align: 'center', alpha: 1 - span(t, 1.7, 2.0) });
    // below: a small Tick and a cogling
    L.cog(120, 62, { spin: t > 0.6 && t < 0.8 ? t * 8 : 0, look: -1, flash: [1.9, 2.2, 2.55, 2.85, 3.15].some((h) => t >= h && t < h + 0.05) });
    const hx = 40 + (t >= 0.7 && t < 0.8 ? 0 : 0) + (t >= 1.9 ? 64 : 0) * Math.min(1, span(t, 1.7, 1.9) * 1);
    L.tick(Math.min(hx, 104), 62, { pose: t >= 1.7 && t < 1.9 ? 'run' : hit && !tapped ? 'hurt' : 'idle', t, flash: hit && t < 0.834 });
    if (hit && t < 1.4) L.rise(40, 62, '-10', 'R4', (t - 0.8) / 0.6);
    // the cut piece of tape turns into a small cyan figure that flies to the hand
    if (tapped && t < 1.9) {
      const k = span(t, 1.3, 1.8);
      L.echo(98 + (52 - 98) * k, 26 + (62 - 26) * k, { alpha: 0.7 * (1 - span(t, 1.75, 1.9)) });
    }
    for (let i = 0; i < 3; i++) { L.slash(104, 62, 'r', (t - hits[i]) / 0.18); L.rise(120, 62, String([12, 12, 22][i]), 'K10', (t - hits[i]) / 0.6); }
    if (t >= 2.6 && t < 3.6) L.echo(92, 62, { alpha: 0.8 });
    for (const e of echoHits) { L.slash(92, 62, 'r', (t - e) / 0.18, 'C4'); L.rise(120, 60, '7', 'C4', (t - e) / 0.6, 'R2'); }
    // cyan dots fly from each hit to the Sand number
    for (const h of [...hits, ...echoHits]) {
      const k = span(t, h, h + 0.25);
      if (k > 0 && k < 1) for (let i = 0; i < 3; i++) { L.c.fillStyle = col('C3'); L.c.fillRect(Math.round(120 + (128 - 120) * k + i * 2), Math.round(56 + (20 - 56) * k - i), 1, 1); }
    }
    if (t >= 1.15 && t < 1.5) L.glyph('rewind', 40, 34, t >= 1.3 && t < 1.38 ? 'down' : 'up', 0, span(t, 1.15, 1.25));
  },
};

/** the guide's six, in page order */
export const GUIDE_LOOPS: LoopDef[] = [UNDO, ECHO, PARADOX, SCRUB, FORK, SAND];
export const LOOPS: Record<string, LoopDef> = { undo: UNDO, echo: ECHO, paradox: PARADOX, scrub: SCRUB, fork: FORK, sand: SAND };
export type { LoopCtx };
