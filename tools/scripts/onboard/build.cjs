// Builds the F4b onboarding scripts (ONBOARD2 §12.2) into plain tools/shot.cjs JSON files.
// usage: node tools/scripts/onboard/build.cjs        (writes tools/scripts/onboard/<name>.json)
// Every script: the helper lib first, then waits on game state, freeze → shot → thaw around each
// picture, the checks as evals, and finally __tut.audit() (overlap frames must be 0) and the
// demo-desync count. Run one with:
//   BASE=http://127.0.0.1:5174/ node tools/shot.cjs "<URL>" tools/out/F4/onboard/<name>.png 2500 1280 720 tools/scripts/onboard/<name>.json
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const lib = fs.readFileSync(path.join(dir, '_lib.js'), 'utf8');
const E = (js) => ({ eval: `(async()=>{const T=window.__T;${js}})()` });
const W = (expr, ms = 60000) => ({ waitFor: expr, ms });
const SHOT = (name) => [E('T.freeze();return 1'), { shot: name }, E('T.thaw();return 1')];
const END = [E('return {audit: __tut.audit(), desync: __tut.log.filter(e=>e.ev===\'demo-desync\').length}')];
const scripts = {};

// ── coach_hit: the L3 card (frozen), Q → the success card, then D3 (ONBOARD2 §6.6) ──
const coachHit = (press, attack) => [
  { eval: lib },
  W('window.__T && __T.w() && __T.p()'),
  // the cogling and the hand in the middle of the room (the top rail stays free); the hand swings at it
  E(`await T.ready(); const p=T.p(), e=T.near(p), m=T.w().map; const cx=m.pw/2, cy=m.ph/2+20;
     if(e){e.x=cx+18; e.y=cy; e.hp=e.maxHp=999;} p.x=cx-6; p.y=cy; p.rec.clear(); p.rec.prefill(p.x,p.y,p.rec.capacity,{hp:p.hp}); await T.sim(0.5); return {p:[p.x,p.y]}`),
  ...attack,
  E(`await T.sim(0.5); const p=T.p(); T.hit(p, 14); const ok = await T.until(()=>T.vis()!==null && T.vis().form==='card', 30000);
     T.freeze(); return {ok, vis: T.vis(), level: __tut.coach.level(), state: __tut.coach.state()};`),
  { shot: 'card' },
  E('return {card: T.vis() && T.vis().form, dock: T.vis() && T.vis().dock, text: T.vis() && T.vis().text}'),
  E('T.thaw(); return 1'),
  ...press,
  E(`const ok = await T.until(()=>__tut.coach.log.some(l=>l.ev==='success'), 30000); T.freeze(); return {ok, last: __tut.coach.log.slice(-3)}`),
  { shot: 'success' },
  E(`T.thaw(); const d3 = await T.until(()=>__tut.coach.log.some(l=>l.det==='D3'), 20000); if (d3) { await T.until(()=>T.vis() && T.vis().key==='coach.d3', 8000); T.freeze(); } return {d3, vis: T.vis()}`),
  { shot: 'd3' },
  E(`T.thaw(); const s=__tut.coach.state(); return {pass: true, slowMinInv: s.slowMinInv, coached: s.coached, log: __tut.coach.log.map(l=>l.ev+':'+(l.det||'')).join(',')}`),
  ...END,
];
const mouseSwings = [{ move: [760, 352] }, ...[0, 1, 2].flatMap(() => [{ mdown: 0 }, E('await T.sim(0.08); return 1'), { mup: 0 }, E('await T.sim(0.12); return 1')])];
const keySwings = [0, 1, 2].flatMap(() => [E("await T.tap('KeyJ'); await T.sim(0.12); return 1")]);
const padSwings = [{ axes: [0, [0.9, 0, 0, 0]] }, E('await T.sim(0.1); return 1'), { axes: [0, [0, 0, 0, 0]] }, ...[0, 1, 2].flatMap(() => [{ pad: [0, 2, true] }, E('await T.sim(0.1); return 1'), { pad: [0, 2, false] }, E('await T.sim(0.1); return 1')])];
scripts.coach_hit = coachHit([{ down: 'KeyQ' }, E('await T.sim(0.08); return 1'), { up: 'KeyQ' }], mouseSwings);
scripts.coach_hit_kb = coachHit([{ down: 'KeyL' }, E('await T.sim(0.08); return 1'), { up: 'KeyL' }], keySwings);
// the text-size row of the resolution matrix (§12.2): 125 % text, saved the way the settings page saves it
scripts.coach_hit_t125 = [{ setStorage: { key: 'secondhand.settings.v1', value: JSON.stringify({ textSize: 125 }) } }, { reload: true }, ...coachHit([{ down: 'KeyQ' }, E('await T.sim(0.08); return 1'), { up: 'KeyQ' }], mouseSwings)];
scripts.coach_hit_pad = coachHit([{ pad: [0, 4, true] }, E('await T.sim(0.12); return 1'), { pad: [0, 4, false] }], padSwings);

// ── coach_fade: six self-undos (pressed within 0.1 s of the hit) → L2 / L1 / L0 ──
scripts.coach_fade = [
  { eval: lib },
  W('window.__T && __T.w() && __T.p()'),
  E(`await T.ready(); T.pin(); const p=T.p(); const out=[__tut.coach.level()];
     // pressed 0.15 s after the blow: past its 0.09 s hit-stop (a press inside it is not seen), before the 0.3 s grace ends
     for (let i=0;i<6;i++) { p.lo.sand=p.lo.sandMax; await T.sim(0.8); T.hit(p, 12); await T.sim(0.15); T.key('KeyQ', true); await T.sim(0.07); T.key('KeyQ', false);
       await T.until(()=>!p.rw && !__tut.coach.state().opp, 20000); await T.sim(1.6); out.push(__tut.coach.level()); }
     return {levels: out, state: __tut.coach.state(), pass: out[2]==='L2' && out[4]==='L1' && out[6]==='L0'}`),
  ...SHOT('after'),
  ...END,
];

// ── coach_miss: a shown L2 ignored twice → D2; the next hit (next room) shows the L3 card ──
scripts.coach_miss = [
  { eval: lib },
  W('window.__T && __T.w() && __T.p()'),
  E(`await T.ready(); T.pin(); const p=T.p(); const seen=[];
     for (let i=0;i<2;i++) { p.lo.sand=p.lo.sandMax; await T.sim(4.4); T.hit(p, 12); await T.until(()=>T.vis() && T.vis().key==='coach.d1', 20000); seen.push(T.vis().form);
       await T.until(()=>!__tut.coach.state().opp, 30000); }
     const d2 = __tut.coach.log.some(l=>l.det==='D2'); await T.until(()=>T.vis() && T.vis().key==='coach.d2', 6000); T.freeze();
     return {seen, d2, state: __tut.coach.state()}`),
  { shot: 'd2' },
  E(`T.thaw(); const s=__G.scenes.current; const n=s.next({kind:'combat',reward:'memory',patron:'oren'}); __G.scenes.set(n); await T.ready(1.4); T.pin(); const p=T.p(); p.lo.sand=p.lo.sandMax;
     await T.sim(4.2); T.hit(p, 12); const ok = await T.until(()=>T.vis() && T.vis().key==='coach.d1', 20000); T.freeze();
     return {ok, third: T.vis() && T.vis().form, state: __tut.coach.state(), pass: __tut.coach.state().ignored===2 && T.vis() && T.vis().form==='card'}`),
  { shot: 'third' },
  E('T.thaw(); return 1'),
  ...END,
];

// ── coach_echo: hit → rewind → the armed echo stands by the cogling → D4 + arrows → walk in → success ──
scripts.coach_echo = [
  { eval: lib },
  W('window.__T && __T.w() && __T.p()'),
  E(`await T.ready(); T.pin(); const p=T.p(), e=T.near(p);
     // walk from 70 px away to the cogling (the tape records the path), swing, take a hit
     p.x=e.x-90; p.y=e.y; p.rec.clear(); p.rec.prefill(p.x,p.y,p.rec.capacity,{hp:p.hp});
     await T.hold('KeyD', 0.9); await T.tap('KeyJ'); await T.sim(0.3); T.hit(p, 14);
     await T.until(()=>T.vis() && T.vis().key==='coach.d1', 20000); T.key('KeyQ', true); await T.sim(0.07); T.key('KeyQ', false);
     const ok = await T.until(()=>__tut.coach.log.some(l=>l.det==='echoIgnored' && l.ev==='prompt'), 30000);
     await T.sim(0.15); T.freeze(); return {ok, vis: T.vis(), echoes: p.echoes.length}`),
  { shot: 'd4' },
  E(`T.thaw(); const p=T.p(); const ec=p.echoes.find(x=>!x.dead); if (ec) { p.x=ec.x-6; p.y=ec.y; }
     const ok = await T.until(()=>__tut.coach.log.some(l=>l.det==='echoIgnored' && l.ev==='success'), 20000); await T.sim(0.1); T.freeze();
     return {ok, pass: ok && __tut.coach.log.some(l=>l.det==='echoIgnored'), log: __tut.coach.log.map(l=>l.ev+':'+(l.det||'')).join(',')}`),
  { shot: 'success' },
  E('T.thaw(); return 1'),
  ...END,
];

// ── coach_coop2: I hit → its seat card; II hit → its own; II down → I gets D12 ──
scripts.coach_coop2 = [
  { eval: lib },
  W('window.__T && __T.w() && __T.p(1)'),
  E(`await T.ready(); T.pin(); window.__botOpts(1, {noRewind:true, noFork:true}); const a=T.p(0), b=T.p(1);
     a.x=b.x-60; a.y=b.y; a.rec.clear(); a.rec.prefill(a.x,a.y,a.rec.capacity,{hp:a.hp}); await T.sim(0.6);
     T.hit(a, 14); await T.until(()=>T.vis(0) && T.vis(0).key==='coach.d1', 20000);
     T.hit(b, 14); await T.until(()=>T.vis(1) && T.vis(1).key==='coach.d1', 20000);
     await T.sim(0.05); T.freeze(); const r0=T.rect(T.vis(0)), r1=T.rect(T.vis(1));
     return {v0: T.vis(0), v1: T.vis(1), both: !!T.vis(0) && !!T.vis(1), apart: !T.overlap(r0, r1)}`),
  { shot: 'seats' },
  E(`T.thaw(); await T.sim(3.5); const a=T.p(0), b=T.p(1); a.lo.sand=a.lo.sandMax; a.x=b.x-120; a.y=b.y; b.invuln=0; b.hurt({amount:999,kind:'melee',owner:null,x:b.x+5,y:b.y,knock:0});
     const ok = await T.until(()=>__tut.coach.log.some(l=>l.det==='D12' && l.ev==='prompt'), 20000); await T.sim(0.1); T.freeze();
     return {ok, v0: T.vis(0), pass: ok}`),
  { shot: 'd12' },
  E('T.thaw(); return 1'),
  ...END,
];

// ── death_cases: the card (static), then the replay at 0.5 / 1.6 / 2.3 / 3.1 s ──
scripts.death_cases = [
  { eval: lib },
  W('window.__tut && __tut.death && __tut.death.snap()', 90000),
  E('await T.sim(1.8); T.freeze(); return {snap: __tut.death.snap().map(s=>({case:s.case, best:s.best, ls:s.lastSecond, killer:s.killer}))}'),
  { shot: 'card' },
  E('T.thaw(); __tut.death.play(); __tut.death.seek(0.5); return __tut.death.replay()'), { shot: 'r05' },
  E('__tut.death.seek(1.6); return __tut.death.replay()'), { shot: 'r16' },
  E('__tut.death.seek(2.3); return __tut.death.replay()'), { shot: 'r23' },
  E('__tut.death.seek(3.1); return {replay: __tut.death.replay(), headline: __tut.death.headline()}'), { shot: 'r31' },
  ...END,
];

// ── guide: the grid, then each loop zoomed at 0.6 / 1.8 / 3.2 s ──
scripts.guide = [
  { eval: lib },
  W('window.__tut && __tut.guide && __tut.guide.open'),
  E('await T.sim(1.2); return {open: __tut.guide.open, view: __tut.guide.view}'),
  { shot: 'grid' },
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [0.6, 1.8, 3.2].flatMap((t) => [E(`__tut.guide.seek(${n}, ${t}, 'focus'); await T.sim(0.05); return __tut.guide.loop`), { shot: `l${n}_${String(t).replace('.', '')}` }])),
  E('__tut.guide.seek(1, null, \'grid\'); return 1'),
  ...END,
];

// ── hall: the workshop arch → the board → fork and scrub (✓) and one ★ → back to the workshop ──
scripts.hall = [
  { eval: lib },
  W('__G.scenes.current.constructor.name==="HubScene" && __G.scenes.current.t>1.5'),
  E(`const s=T.s(); while (s.overlays.length) { T.key('Escape', true); await T.sim(0.1); T.key('Escape', false); await T.sim(0.2); if (s.overlays.length) { T.key('Enter', true); await T.sim(0.1); T.key('Enter', false); await T.sim(0.3); } }
     const arch=T.w().entities.find(e=>e.constructor.name==='HubArch'); const p=T.p(); p.x=arch.x+16; p.y=arch.y+10; await T.sim(0.5); T.freeze(); return {arch: !!arch, shards: __save.profile.shards}`),
  { shot: 'arch' },
  E(`T.thaw(); window.__shards0 = __save.profile.shards; await T.tap('KeyE'); const ok = await T.until(()=>window.__tut.hallBoard && __tut.hallBoard.open, 60000); await T.sim(0.6); T.freeze(); return {ok, where: __tut.where}`),
  { shot: 'board' },
  // fork: press Fork beside the jar, step away, wait for ◆, walk back in
  E(`T.thaw(); T.key('Escape', true); await T.sim(0.1); T.key('Escape', false); await T.sim(0.3);
     __tut.hall.start('fork'); await T.until(()=>__tut.hall.active().length && __tut.hall.active()[0].phase==='try', 60000);
     const p=T.p(); const jar=T.w().enemies.find(e=>e.kind==='jar'); p.x=jar.x-14; p.y=jar.y+4; await T.sim(0.6); await T.tap('KeyR'); await T.sim(0.2);
     await T.hold('KeyA', 0.8); await T.until(()=>p.echoes.some(e=>e.armed), 20000); await T.sim(0.2); T.freeze(); return {step: __tut.hall.active()[0]}`),
  { shot: 'fork_armed' },
  E(`T.thaw(); const p=T.p(); const ec=p.echoes.find(e=>!e.dead); if (ec) { p.x=ec.x-4; p.y=ec.y; }
     const ok = await T.until(()=>__tut.hall.board().fork.tick, 30000); await T.sim(0.3); T.freeze(); return {ok, board: __tut.hall.board().fork}`),
  { shot: 'fork_success' },
  // the ★ question → cancel back to the board → scrub
  E(`T.thaw(); await T.until(()=>__tut.hall.active().length && __tut.hall.active()[0].ask, 20000); T.key('Escape', true); await T.sim(0.1); T.key('Escape', false);
     await T.until(()=>__tut.hallBoard.open, 20000); await T.sim(0.3); T.key('Escape', true); await T.sim(0.1); T.key('Escape', false); await T.sim(0.3);
     __tut.hall.start('scrub'); await T.until(()=>__tut.hall.active().length && __tut.hall.active()[0].phase==='try', 60000);
     const p=T.p(); await T.until(()=>p.hp < p.maxHp - 12, 30000); await T.sim(0.15);
     T.key('KeyQ', true); await T.until(()=>p.rw && p.rw.scrub && (p.rec.length - p.rw.cursor)/60 >= 1.4, 20000); T.freeze(); return {rw: !!p.rw, back: p.rw ? (p.rec.length - p.rw.cursor)/60 : 0}`),
  { shot: 'scrub_hold' },
  E(`T.thaw(); T.key('KeyQ', false); const ok = await T.until(()=>__tut.hall.board().scrub.tick, 30000); await T.sim(0.3); T.freeze(); return {ok, board: __tut.hall.board().scrub}`),
  { shot: 'scrub_success' },
  // ★ for scrub: three short scrubs that give health back
  E(`T.thaw(); await T.until(()=>__tut.hall.active().length && __tut.hall.active()[0].ask, 20000); T.key('Enter', true); await T.sim(0.1); T.key('Enter', false);
     await T.until(()=>__tut.hall.active().length && __tut.hall.active()[0].trial, 30000); const p=T.p();
     for (let i=0;i<3 && !__tut.hall.board().scrub.star;i++) { await T.until(()=>p.hp < p.maxHp - 6, 30000); await T.sim(0.1); T.key('KeyQ', true); await T.until(()=>p.rw && p.rw.scrub && (p.rec.length - p.rw.cursor)/60 >= 0.7, 20000); T.key('KeyQ', false); await T.until(()=>!p.rw, 10000); await T.sim(0.4); }
     await T.until(()=>__tut.hall.board().scrub.star, 20000); await T.sim(0.3); T.freeze(); return {star: __tut.hall.board().scrub.star, shards: __save.profile.shards - window.__shards0}`),
  { shot: 'star' },
  E(`T.thaw(); await T.sim(1); const arch=T.w().entities.find(e=>e.constructor.name==='ExitArch'); const p=T.p(); p.x=arch.x+10; p.y=arch.y+6; await T.sim(0.5); await T.tap('KeyE');
     const ok = await T.until(()=>__G.scenes.current.constructor.name==='HubScene' && __G.scenes.current.t>0.8, 60000); await T.sim(0.5); T.freeze();
     return {ok, board: __tut.hall.board(), gained: __save.profile.shards - window.__shards0, pass: __tut.hall.board().fork.tick && __tut.hall.board().scrub.tick && (__save.profile.shards - window.__shards0) >= 6}`),
  { shot: 'back' },
  E('T.thaw(); return 1'),
  ...END,
];

// ── hall_coop: two hands, two lessons at once on the two half stages; then the duet ──
scripts.hall_coop = [
  { eval: lib },
  W('window.__tut && __tut.hallBoard && __tut.hallBoard.open'),
  E(`T.key('Escape', true); await T.sim(0.1); T.key('Escape', false); await T.sim(0.3); window.__botOpts(1, {noRewind:true, noFork:true});
     __tut.hall.start('undo', 0); __tut.hall.start('echo', 1);
     const ok = await T.until(()=>__tut.hall.active().length===2 && __tut.hall.active().every(a=>a.phase==='try'), 90000); await T.sim(0.3); T.freeze();
     return {ok, active: __tut.hall.active()}`),
  { shot: 'two' },
  E(`T.thaw(); __tut.hall.skipAll(); await T.sim(0.5);
     __tut.hall.start('duet', 0); const ok = await T.until(()=>__tut.hall.active().length && __tut.hall.active()[0].phase==='try', 90000);
     const a=T.p(0), b=T.p(1); b.x=a.x+60; b.y=a.y-20; b.rec.clear(); b.rec.prefill(b.x,b.y,b.rec.capacity,{hp:b.hp}); await T.sim(0.3); b.lo.sand=b.lo.sandMax; const forked = b.fork();
     await T.until(()=>b.echoes.some(e=>e.armed), 20000); await T.sim(0.2); T.freeze(); return {ok, forked, echoes: b.echoes.length}`),
  { shot: 'duet_armed' },
  E(`T.thaw(); const a=T.p(0), b=T.p(1); const e=b.echoes.find(x=>!x.dead && x.armed); if (e) { a.x=e.x-4; a.y=e.y; }
     const ok = await T.until(()=>__tut.log.some(l=>l.ev==='success' && l.data && l.data.id==='duet'), 20000); await T.sim(0.2); T.freeze();
     return {ok, board: __tut.hall.board().duet, pass: ok}`),
  { shot: 'duet' },
  E('T.thaw(); return 1'),
  ...END,
];

// ── ladder: stage 3 (fork + scrub taught, run 2): the first cleared room teaches Sync; two natural chains → recognised ──
const CLEAR = `const sc=__G.scenes.current; for (let k=0;k<80 && !sc.cleared;k++) { for (const e of T.w().enemies) if (!e.dead && !e.ignoreClear) { e.spawnT=0; e.invuln=0; e.hurt({amount:9999,kind:'melee',owner:T.p(),x:e.x,y:e.y}); } await T.sim(0.4); }`;
scripts.ladder = [
  { eval: lib },
  W('window.__T && __T.w() && __T.p()'),
  E(`await T.ready(1.5, false); ${CLEAR}
     const ok = await T.until(()=>__tut.log.some(e=>e.ev==='lessonStart' && e.data && e.data.lesson==='sync'), 90000); await T.sim(2.5); T.freeze();
     return {ok, cleared: __G.scenes.current.cleared, lessons: __tut.log.filter(e=>e.ev==='lessonStart').map(e=>e.data.lesson), caption: __tut.caption}`),
  { shot: 'sync' },
  E(`T.thaw(); __tut.hall && __tut.hall.skipAll && __tut.hall.skipAll(); if (__tut.lesson) __tut.skipLesson(); await T.sim(0.5);
     __save.profile.stats['did.chain']=2; for (const id of ['sync','culprit']) if (!__save.profile.taught.includes(id)) __save.profile.taught.push(id);
     const n=__G.scenes.current.next({kind:'combat',reward:'memory',patron:'oren'}); __G.scenes.set(n); await T.ready(1.5, false); ${CLEAR}
     const ok = await T.until(()=>__tut.log.some(e=>e.ev==='recognised'), 90000); await T.until(()=>__tut.caption && __tut.caption.key==='ladder.recognised', 8000); T.freeze();
     return {ok, taughtChain: __tut.taught.includes('chain'), caption: __tut.caption, pass: ok && __tut.taught.includes('chain')}`),
  { shot: 'recognised' },
  E('T.thaw(); return 1'),
  ...END,
];

// ── seat_novice: a second hand joins in the workshop, says "first time", gets its own crash course ──
scripts.seat_novice = [
  { eval: lib },
  W('__G.scenes.current.constructor.name==="HubScene" && __G.scenes.current.t>1.5 && __T'),
  E(`const s=T.s(); while (s.overlays.length) { T.key('Escape', true); await T.sim(0.1); T.key('Escape', false); await T.sim(0.3); }
     const ok = await T.until(()=>window.__tut.seat && __tut.seat.prompting(1), 30000); await T.sim(0.3); T.freeze(); return {ok, players: T.w().players.length}`),
  { shot: 'ask' },
  E(`T.thaw(); __tut.seat.accept(1); const ok = await T.until(()=>__tut.seat.lesson(1), 20000); await T.sim(0.6); T.freeze();
     return {ok, novice: __tut.seat.novice(1), slot0Novice: __tut.seat.novice(0), lesson: __tut.seat.lesson(1)}`),
  { shot: 'course' },
  E('T.thaw(); return 1'),
  ...END,
];

// ── blind_template: the skeleton a blind tester fills in (only waits, pictures and allowed __tut calls) ──
scripts.blind_template = [
  { eval: '1' },
  { waitFor: "window.__tut && __tut.where==='title'", ms: 60000 },
  { shot: 'title' },
  { eval: "__tut.freeze(); 1" }, { shot: 'example_frozen' }, { eval: "__tut.thaw(); 1" },
  { eval: "(async()=>{ /* your keys here, e.g. */ await __tut.tap('Enter'); return __tut.where })()" },
  { eval: "(async()=>{ return await __tut.wait('caption', 30) })()" },
  { shot: 'after_first_caption' },
];

fs.mkdirSync(dir, { recursive: true });
for (const [name, steps] of Object.entries(scripts)) {
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(steps, null, 1) + '\n');
  console.log('wrote', name + '.json', steps.length, 'steps');
}
