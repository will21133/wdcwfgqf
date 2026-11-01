// Shared helpers for the F4b onboarding scripts (tools/scripts/onboard/*.json). build.cjs inlines
// this file as each script's first eval, so every script stays a plain tools/shot.cjs JSON.
// Everything waits on simulated time (G.time / world.time), never the wall clock: headless Chrome
// runs at ~4 fps and the game's fixed step keeps the simulation exact.
(() => {
  const G = window.__G;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const T = {
    s: () => G.scenes.current,
    w: () => G.scenes.current && G.scenes.current.world,
    p: (i = 0) => G.scenes.current.world.players[i],
    key: (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
    async until(cond, ms = 30000) { const t0 = performance.now(); while (!cond()) { if (performance.now() - t0 > ms) return false; await raf(); } return true; },
    /** wait `sec` of game time (G.time: the fixed-step clock) */
    async sim(sec) { const t0 = G.time; return T.until(() => G.time - t0 >= sec, 120000); },
    async hold(code, sec) { T.key(code, true); await T.sim(sec); T.key(code, false); await raf(); },
    async tap(code) { T.key(code, true); await T.sim(0.06); T.key(code, false); await T.sim(0.03); },
    near(p) { let b = null, bd = 1e9; for (const e of T.w().enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; b = e; } } return b; },
    /** an undoable blow from the nearest enemy (or none), straight through the real Player.hurt */
    hit(p, amount, o = {}) { const e = T.near(p); p.invuln = 0; p.dashT = 0; return p.hurt({ amount, kind: 'melee', owner: e, x: e ? e.x : p.x + 10, y: e ? e.y : p.y, knock: 0, fixed: !!o.fixed }); },
    /** the room settled: hands walked in, floor card gone (enemies pinned as soon as they exist) */
    async ready(t = 3.6, pin = true) {
      await T.until(() => T.w() && T.p(), 60000);
      if (pin) { await T.until(() => T.w().enemies.length > 0 || T.w().time > 2.5, 60000); T.pin(); }
      await T.until(() => T.p().autoWalk <= 0 && T.w().time > t, 60000);
      if (pin) T.pin();
      for (const p of T.w().players) { p.hp = p.maxHp; p.lo.sand = p.lo.sandMax; }
    },
    /** freeze every enemy where it stands (its update does nothing) */
    pin() { for (const e of T.w().enemies) { e.update = () => {}; e.spawnT = 0; } },
    freeze() { T.w().stop = 1e9; },
    thaw() { T.w().stop = 0; },
    vis(slot) { return window.__tut.coach.visible(slot); },
    rect(c) { return c ? c.rect : null; },
    overlap(a, b) { return !!a && !!b && a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]; },
  };
  window.__T = T;
  return 'lib ready';
})()
