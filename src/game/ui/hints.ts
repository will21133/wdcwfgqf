// Ines's Notes (PLAN2 §1.2, GDD2 §9.2): one-time tips that appear the first time something happens.
//
// · P7 defines the notes (Hints.define); any package triggers one with Hints.show(id).
// · Each note shows once per save. At most one note every 20 s and one per room; none while a boss
//   fight is running or right after a boss changes phase (Hints.hold) — notes wait in a short queue
//   and are dropped (not marked seen, so they can trigger again) if the room changes first.
//   A note requested while a room is being entered (the new scene's constructor, enter() or first
//   frames) belongs to the new room. Queued notes expire after 30 s of time in which they could
//   have shown (a long boss fight does not age them).
// · The card sits bottom-left: 12px text, an icon, and "[Tab] more" when the Horologium is there.
// · pause: true notes (★) pause a solo game until dismissed; in co-op they behave like normal notes.
import type { Renderer } from '../../engine/gfx/renderer';
import { G } from '../G';
import { L, L10n } from '../i18n';
import { profile, saveProfile } from '../save';
import { Text } from './text';
import { drawPanel, drawPrompt, promptW, promptH, drawBits, drawPixelArt, SLOT_COLOR } from './widgets';
import { rect } from './draw';
import { ease, clamp } from '../../engine/math';
import { ICONS } from '../../art/sprites/icons';
import { Panels } from './panels';
import type { Overlay } from './overlay';

export interface HintDef {
  id: string;
  text: L10n;
  /** an ICONS key (16×16 sprite); a pencilled note glyph otherwise */
  icon?: string;
  /** ★ pause a solo game until the player dismisses it */
  pause?: boolean;
  /** Horologium entry opened by [Tab] more (a term id) */
  glossary?: string;
}

/** hooks the game fills in: who is playing, and whether now is a bad moment (boss fights) */
export const hintsHooks = {
  players: (): number => 1,
  busy: (): boolean => false,
  /** bottom edge of the card (co-op: above the bottom-left HUD pod) */
  bottom: (): number => 326,
};

const THROTTLE = 20, SHOW = 6, QUEUE_MAX_AGE = 30, MIN_READ = 0.6;
const W = 232, X = 8;

const DEFS: Record<string, HintDef> = {};
const listeners: ((id: string) => void)[] = [];
const queue: { id: string; player?: number; t0: number; age: number }[] = [];

interface Active { def: HintDef; player?: number; t: number; hold: HoldOverlay | null; out: number }
let active: Active | null = null;
let lastShown = -Infinity;
let holdUntil = -Infinity;
let roomShown = 0;
let roomScene: unknown = null;

// rooms change through the scene manager's switch hook, in the same tick as the new scene's
// constructor and enter(): notes requested in that tick (t0 === now) survive the room change
{
  const prev = G.scenes.onSwitch;
  G.scenes.onSwitch = () => { prev?.(); roomScene = G.scenes.current; startRoom(now()); };
}
function startRoom(cutoff: number) {
  roomShown = 0;
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].t0 < cutoff) queue.splice(i, 1);
}

const HEADER = L('伊妮丝的便条', "Ines's note");
const MORE = L('更多', 'More');
const GOT_IT = L('知道了', 'Got it');

const NOTE_GLYPH = [
  '..........##',
  '.........#.#',
  '........#.#.',
  '.......#.#..',
  '......#.#...',
  '.....#.#....',
  '....#.#.....',
  '...#.#......',
  '..##.#......',
  '..####......',
  '.##.........',
  '#...........',
];

function sceneOverlays(): Overlay[] | null {
  const s = G.scenes.current as any;
  return s && Array.isArray(s.overlays) ? (s.overlays as Overlay[]) : null;
}

/** a pause-menu-like overlay is on top: hide the card and stop its clock */
function covered(): boolean {
  const o = sceneOverlays();
  return !!o?.some((x) => (x as any).hidesNotes);
}

function now() { return G.time; }

function canShowNow(): boolean {
  if (active) return false;
  if (G.scenes.transitioning) return false;
  if (now() - lastShown < THROTTLE) return false;
  if (now() < holdUntil) return false;
  if (roomShown >= 1) return false;
  if (hintsHooks.busy()) return false;
  if (covered()) return false;
  return true;
}

function begin(id: string, player?: number) {
  const def = DEFS[id];
  if (!def || profile.hints.includes(id)) return;
  profile.hints.push(id);
  saveProfile();
  lastShown = now();
  roomShown++;
  const solo = hintsHooks.players() <= 1;
  const ovs = sceneOverlays();
  const hold = def.pause && solo && ovs ? new HoldOverlay() : null;
  active = { def, player, t: 0, hold, out: 0 };
  if (hold) ovs!.push(hold);
  G.audio.play('notePaper');
  for (const cb of listeners) cb(id);
  (G.scenes.current as any)?.world?.bus?.emit?.('hint', { id });
}

function dismiss() {
  if (!active || active.out > 0) return;
  active.out = 0.0001;
  if (active.hold) active.hold.done = true;
}

function openGlossary(): boolean {
  if (!active || !Panels.has('almanac')) return false;
  const ovs = sceneOverlays();
  const p = Panels.open('almanac', { entry: active.def.glossary ?? active.def.id });
  if (!p || !ovs) return false;
  ovs.push(p);
  return true;
}

/** invisible blocking overlay that freezes a solo game while a ★ note is up */
class HoldOverlay implements Overlay {
  blocks = true;
  done = false;
  update(): boolean {
    if (this.done) return false;
    if (!active || active.hold !== this) return false;
    const inp = G.input;
    if (active.t >= MIN_READ) {
      if (inp.pressed('info') && openGlossary()) return true;
      if (inp.pressed('confirm') || inp.pressed('cancel') || inp.pressed('attack') || inp.pressed('interact')) {
        // the same press must not also pause, swing or interact once the game resumes
        for (const a of ['pause', 'confirm', 'cancel', 'attack', 'interact', 'dash'] as const) inp.consume(a);
        dismiss();
        return false;
      }
    }
    return true;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    const a = clamp((active?.t ?? 1) / 0.2, 0, 1) * 0.35;
    ctx.globalAlpha = a;
    rect(ctx, 0, 0, 640, 360, 'K0');
    ctx.globalAlpha = 1;
  }
}

/** the footer row holds "[Tab] more" and/or "[confirm] got it" */
const hasFooter = (a: Active) => !!a.hold || Panels.has('almanac');

function cardHeight(a: Active) {
  const body = Text.measureWrapped(a.def.text, 'body', W - 40).h;
  return Math.round(4 + Text.lineH('small') + 4 + Math.max(18, body) + (hasFooter(a) ? 6 + promptH() : 0) + 9);
}

export const Hints = {
  define(d: HintDef): void { DEFS[d.id] = d; },
  /** request a note. false if undefined or already seen; otherwise it shows now or soon */
  show(id: string, o?: { player?: number }): boolean {
    if (!DEFS[id] || profile.hints.includes(id)) return false;
    if (active?.def.id === id || queue.some((q) => q.id === id)) return true;
    queue.push({ id, player: o?.player, t0: now(), age: 0 });
    Hints.pump();
    return true;
  },
  seen(id: string): boolean { return profile.hints.includes(id); },
  onShow(cb: (id: string) => void): void { listeners.push(cb); },
  /** hold every note back for a few seconds (boss phase changes, cutscene beats) */
  hold(sec: number): void { holdUntil = Math.max(holdUntil, now() + sec); },
  /** a new room started: allow one more note, drop notes queued before this tick (the old room's) */
  newRoom(): void { startRoom(now()); },
  /** the note on screen (or null) */
  get active(): string | null { return active?.def.id ?? null; },
  defs(): HintDef[] { return Object.values(DEFS); },
  def(id: string): HintDef | null { return DEFS[id] ?? null; },
  /** debug: show a note right now without marking it seen or checking the throttle */
  preview(d: HintDef): void {
    active = { def: d, t: 0, hold: null, out: 0 };
    G.audio.play('notePaper');
  },
  /** show queued notes when allowed */
  pump(): void {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].age > QUEUE_MAX_AGE || profile.hints.includes(queue[i].id)) queue.splice(i, 1);
    if (!queue.length || !canShowNow()) return;
    const q = queue.shift()!;
    begin(q.id, q.player);
  },
  /** main.ts: every tick, before the scene updates */
  update(dt: number): void {
    // scenes put in place without a transition (boot, debug routes) also count as a new room;
    // the queue is kept (it is noticed a tick late, after the new scene may have asked for a note)
    const sc = G.scenes.current;
    if (sc !== roomScene) { roomScene = sc; roomShown = 0; }
    // queued notes age only while they could show (not during boss fights / holds / menus)
    if (queue.length && !hintsHooks.busy() && now() >= holdUntil && !covered() && !G.scenes.transitioning) for (const q of queue) q.age += dt;
    if (active) {
      if (active.out > 0) {
        active.out += dt;
        if (active.out > 0.3) active = null;
      } else if (!covered() && !G.scenes.transitioning) {
        active.t += dt;
        // [Tab] more while a non-pausing note is up (takes Tab away from the build panel for a moment)
        if (!active.hold && Panels.has('almanac') && G.input.pressed('info')) { G.input.consume('info'); openGlossary(); }
        if (!active.hold && active.t > SHOW) dismiss();
      }
    }
    Hints.pump();
  },
  /** main.ts: after the scene renders */
  render(r: Renderer): void {
    if (!active || (covered() && !active.hold) || G.scenes.transitioning) return;
    const ctx = r.ui2;
    const def = active.def;
    const h = cardHeight(active);
    const kIn = ease.outCubic(clamp(active.t / 0.25, 0, 1));
    const kOut = active.out > 0 ? clamp(active.out / 0.3, 0, 1) : 0;
    const x = X, y = Math.round(hintsHooks.bottom() - h + (1 - kIn) * 14 + kOut * 10);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * kIn * (1 - kOut);
    drawPanel(ctx, x, y, W, h, 'dark');
    // parchment header strip
    const hh = Math.round(Text.lineH('small') + 3);
    rect(ctx, x + 2, y + 2, W - 4, hh, 'S3');
    rect(ctx, x + 2, y + 2, W - 4, 1, 'S4');
    rect(ctx, x + 2, y + 2 + hh, W - 4, 1, 'S1');
    if (active.player !== undefined) rect(ctx, x + 2, y + 2, 3, hh, SLOT_COLOR[((active.player % 4) + 4) % 4]);
    Text.draw(ctx, HEADER, x + 9, y + 2 + hh / 2, { size: 'small', color: 'K1', shadow: false, valign: 'middle' });
    // dog-eared corner on the strip
    for (let i = 0; i < 6; i++) {
      rect(ctx, x + W - 8 + i, y + 2, 6 - i, 1, 'K1');
      rect(ctx, x + W - 8, y + 2 + i, i + 1, 1, i === 5 ? 'S1' : 'S2');
    }
    // icon
    const iy = y + hh + 7;
    const spr = def.icon ? ICONS[def.icon] : undefined;
    if (spr) drawPixelArt(ctx, spr.img, x + 16, iy + 8);
    else drawBits(ctx, NOTE_GLYPH, x + 10, iy + 2, 'S3');
    // body text (12px)
    Text.draw(ctx, def.text, x + 30, iy - 1, { color: 'K10', maxW: W - 40 });
    // footer: [Tab] more · timer / [confirm] got it
    const ph = promptH();
    const fy = y + h - ph - 7;
    let fx = x + W - 8;
    if (active.hold) {
      const tw = Math.ceil(Text.measure(GOT_IT, 'body').w);
      fx -= tw;
      Text.draw(ctx, GOT_IT, fx, fy + ph / 2, { color: active.t >= MIN_READ ? 'B5' : 'K7', valign: 'middle' });
      fx -= promptW('confirm') + 4;
      drawPrompt(ctx, 'confirm', fx, fy);
      fx -= 12;
    } else {
      // time left: a fuse burning along the card's bottom edge (not an underline under the text)
      const k = 1 - clamp(active.t / SHOW, 0, 1);
      rect(ctx, x + 2, y + h - 3, Math.round((W - 4) * k), 1, 'S2');
    }
    if (Panels.has('almanac')) {
      const tw = Math.ceil(Text.measure(MORE, 'small').w);
      fx -= tw;
      Text.draw(ctx, MORE, fx, fy + ph / 2, { size: 'small', color: 'K8', valign: 'middle' });
      fx -= promptW('info') + 3;
      drawPrompt(ctx, 'info', fx, fy);
    }
    ctx.globalAlpha = a;
  },
};
