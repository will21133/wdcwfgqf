// F4 · rewind teaching and onboarding — the package entry (ONBOARD2 §11; boot.ts imports it).
//
// Everything F4b, P1–P7 call is exported from here:
//   Onboard (mode, isNovice, taught, mark, skipAll, reset, covers, coach, deathCard) · Tut (register,
//   log → window.__tut) · Gates (tapOnly, forkAllow, shows, hud; frozen after F4) · Stage (say, clear,
//   busy, current, obstacles, audit) · Rich + bigPrompt ({@action} tokens) · ModelStrip · Beat ·
//   Lessons + LessonDef / LessonStep / LessonRun · DemoClip · StageHost · Calm (addRule, request,
//   isCalm) · RewindHudHooks + drawShadowOutline (re-exported from ui/rewindHud.ts).
//
// This file wires the pieces together: the gates speak through the Stage, Ines's notes wait while
// the Stage teaches, the F3 term callouts and HUD plates go quiet while a lesson runs, and the
// lesson runner ticks with the Stage.
import { S } from '../strings';
import { tr } from '../i18n';
import { hintsHooks } from '../ui/hints';
import { Callouts } from '../ui/callouts';
import { RewindHudHooks } from '../ui/rewindHud';
import { GateHooks } from './gates';
import { OnboardHooks } from './core';
import { Stage } from './stage';
import { Lessons } from './lesson';
import { G } from '../G';
import './host';
import './demo';
import './calm';
import './lessons/core';
import './lessons/inrun';
import './objective';
import './firstLaunch';
import './debug';
import '../strings/onboard';

export { Onboard, Tut, OnboardHooks, CORE_VERBS, NOTE_COVERS, TEACH_VERBS } from './core';
export type { OnboardMode, TeachHow, CoachApi, DeathCardApi, SeatRecord, TutLogEntry } from './core';
export { Gates, GateHooks, FORK_WINDOW } from './gates';
export type { GateLayer, ShowId } from './gates';
export { Stage } from './stage';
export type { SayOpts, SayHandle, SpotRef, Tier, DockId, Box, StageCurrent, StageAudit } from './stage';
export { Rich, bigPrompt, tokenLabel, TOKENS } from './rich';
export type { RichOpts, RichSize, RichLayout, TokenAction } from './rich';
export { ModelStrip, modelStripSize, STRIP } from './modelStrip';
export type { ModelStripOpts } from './modelStrip';
export { Beat } from './beat';
export type { SuccessOpts } from './beat';
export { Lessons } from './lesson';
export type { LessonId, Where, LessonPhase, LessonState, CompleteHow, LessonEvent, LessonCtx, LessonStep, LessonDef, LessonRun } from './lesson';
export { PUPPET_TINT, DemoDirector, Demos } from './demo';
export type { DemoClip, DemoStep, DemoEvent, DemoCaption, DemoDirectorApi } from './demo';
export { WIPE_T, WIPE_RESET_AT, RebuildHost, SoftHost, filmWipe, Wipe } from './host';
export { FallingGear, PracticeDummy, GlassJar, AlarmTurret, PendulumBlade, Fence, MarkerRing, InesStand, FloorArrows, comboDamage, isLessonProp } from './props';
export { LessonFlags, floorCentre, placeHand, helpFor } from './lesson';
export type { StartOpts, FailResult, IntroBeat } from './lesson';
export type { StageHost, HostKind } from './host';
export { Calm, CALM_AFTER_CLEAR, CALM_AFTER_ENTER } from './calm';
export type { CalmRule, CalmWhy } from './calm';
export { RewindHudHooks, drawShadowOutline } from '../ui/rewindHud';
export type { HudPart } from '../ui/rewindHud';
export { applyOnboardPreset } from './debug';

// ── the gates speak through the Stage (ONBOARD2 §5.3, §6.5 D9) ──
GateHooks.explainFork = (p) => {
  Stage.say({
    key: 'gate.fork', tier: 'A', slot: p.slot, who: p.input, dur: 3,
    text: () => `${tr(S('onboard', 'forkExplain1'))}\n${tr(S('onboard', 'forkExplain2'))}`,
    vars: () => ({ fork: p.mods.forkCost }),
  });
};
GateHooks.holdIsTap = (p) => {
  Stage.say({ key: 'gate.hold', tier: 'A', slot: p.slot, who: p.input, dur: 2.4, text: S('onboard', 'holdIsTap') });
};

// ── Ines's notes wait while the Stage teaches (tier S / A on screen), a lesson runs or the prologue plays (§4.6, §5.11, §2.0) ──
const inPrologue = () => (G.scenes.current as unknown as { opt?: { kind?: string } } | null)?.opt?.kind === 'prologue';
const notesBusy = hintsHooks.busy;
hintsHooks.busy = () => notesBusy() || Stage.busy(undefined, 'A') || !!Lessons.active() || inPrologue();

// ── the pocket-watch button is "watch again" during a lesson; a tier-S card folds the floor card away ──
OnboardHooks.claimsInfo = () => !!Lessons.active() || inPrologue();
OnboardHooks.bigCard = () => Stage.bigCard();

// ── a lesson teaches through the caption rail: the F3 world callouts and HUD plates stay quiet (§2.0) ──
RewindHudHooks.muted = () => !!Lessons.active() || inPrologue();
Stage.onUpdate((dt) => {
  Callouts.mute('lesson', !!Lessons.active() || inPrologue());
  // a menu over the game (pause, a reward) holds every lesson where it is
  const sc = G.scenes.current as unknown as { overlays?: { blocks: boolean }[] } | null;
  if (sc?.overlays?.some((o) => o.blocks)) return;
  Lessons.tick(dt);
});
