# F4 paused — resume notes

Paused on user request during F4 (rewind teaching / onboarding, spec: docs/ONBOARD2.md).

## State at pause
- `d28beb4` F4a interface — done (gates, Stage, Rich, lesson/demo/host types, `__tut`, routes).
- `ca617fc` F4a core — WIP, typechecked clean on its own. Implemented: props, onboard sprites/sfx,
  DemoDirector, LessonRunner, hosts, prologue L1–L6 + report + P0 card + flow, Calm director,
  run-1 fork/scrub lessons, HUD stages, floor card, objective. Not finished: autoplay route
  verification, stageaudit run, regressions.
- `b06fae2` F4b coach (branch `v2/F4b-coach`, local only) — WIP, typechecked clean on its own.
  Implemented: shot.cjs pad steps, bot noRewind/noFork, coach D1–D12 + mastery, death tape +
  card + replay, LoopPlayer + 6 loops + rewindGuide pause page, Rehearsal Hall, ladder/advanced.
  Not finished: scripts, screenshot review, regressions.
- `f6ff93b` merge of F4b into F4a — **2 type errors** at the integration seam, both in
  `src/game/onboard/lessons/hall.ts` (lines ~325 `LessonCtx` cast, ~390 `FailResult | L10n`).

## To resume
1. Fix the 2 seam errors in `lessons/hall.ts` against the F4a `LessonCtx` / fail-result types.
2. Run the PLAN2 §F4 / ONBOARD2 §12.1 gates: typecheck, `build:single` ≤ 1.6MB, solo seed=21
   victory, coop4, padtest4, jointest, the two `qarun … autoplay=onboard` runs, stageaudit
   `overlapFrames === 0`.
3. Acceptance + code review + blind-tester rounds (ONBOARD2 §12.4: zh / en / zh+pad, fresh
   tester each round, Q1–Q8 all correct, up to 3 rounds).
4. Tag `v2-F4` (tags stay local; the proxy refuses tag pushes), publish a preview build,
   then production P1–P7 from `v2-F4` (merge order P1 → P4 → P2 → P3 → P5 → P6 → P7).
