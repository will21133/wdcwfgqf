// Co-op join flow (GDD2 §5.1) with virtual Xbox pads + the keyboard:
//   1. title → "Together" panel: Enter seats the keyboard (I), pad1 A seats II, both ready → workshop
//   2. workshop hot join: pad2 A → a grandfather clock opens, hand III steps out, its pod drops in
//   3. pad2 holds View 1.6 s → hand III leaves
//   4. pad1 unplugged → the game pauses with "reconnect or continue"; plug it back → resumes;
//      unplug again, Esc → hand II is dropped
//   5. mid-run join (?seed=…&devices=kbm): pad3 A → pending pod; next room hand II walks in and
//      gets its catch-up memory pick (floor 2 → 1 pick)
// usage: node tools/jointest.cjs [outPrefix]   (exit code 1 on any failed check)
const { chromium } = require('playwright');
(async () => {
  const [, , out = 'tools/out/F2/join'] = process.argv;
  const base = process.env.BASE || 'http://127.0.0.1:5173/';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
  const page = async () => {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const logs = [];
    p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' || m.text().includes('CJK in tiny')) logs.push('[console] ' + m.text()); });
    await p.addInitScript(() => {
      const mk = (index) => ({
        id: `Xbox Wireless Controller (STANDARD GAMEPAD) #${index}`, index, connected: true, mapping: 'standard', timestamp: 0,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: { type: 'dual-rumble', playEffect: () => Promise.resolve('complete') },
      });
      const pads = [mk(0), mk(1), mk(2), mk(3)];
      window.__pads = pads;
      navigator.getGamepads = () => pads.map((g) => (g.connected ? g : null));
      window.__press = (pi, i, v = true) => { const g = pads[pi]; g.buttons[i].pressed = v; g.buttons[i].value = v ? 1 : 0; g.timestamp++; };
      window.__plug = (pi, v) => { pads[pi].connected = v; window.dispatchEvent(new Event(v ? 'gamepadconnected' : 'gamepaddisconnected')); };
    });
    p.logs = logs;
    return p;
  };
  const tap = async (p, pi, i, hold = 200) => { await p.evaluate(([pi, i]) => window.__press(pi, i, true), [pi, i]); await p.waitForTimeout(hold); await p.evaluate(([pi, i]) => window.__press(pi, i, false), [pi, i]); await p.waitForTimeout(250); };
  const key = async (p, k, hold = 180) => { await p.keyboard.down(k); await p.waitForTimeout(hold); await p.keyboard.up(k); await p.waitForTimeout(250); };
  const seats = (p) => p.evaluate(() => window.__G.players.map((q) => `${q.slot}:${q.device}`).join(' '));
  const scene = (p) => p.evaluate(() => window.__G.scenes.current.constructor.name);
  const until = async (p, fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn)) return true; await p.waitForTimeout(150); } return false; };

  // ── 1. title → Together ──
  {
    const p = await page();
    await p.goto(base + '?scene=title');
    await p.waitForTimeout(2500);
    await key(p, 'KeyX');
    await p.waitForTimeout(1200);
    await key(p, 'ArrowDown');
    await key(p, 'Enter');
    check(await until(p, () => window.__G.scenes.current.overlays?.some((o) => o.constructor.name === 'JoinPanel'), 3000), 'title "Together" opens the join panel');
    await key(p, 'Enter');
    await tap(p, 1, 0);
    check((await seats(p)) === '0:kbm 1:pad1', `keyboard joins I, pad1 joins II (${await seats(p)})`);
    await p.screenshot({ path: `${out}_panel.png` });
    await key(p, 'Enter');
    await tap(p, 1, 0);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}_ready.png` });
    check(await until(p, () => window.__G.scenes.current.constructor.name === 'HubScene' || window.__G.scenes.current.constructor.name === 'CutsceneScene', 6000), `everyone ready → the workshop (or the intro on a fresh save) (${await scene(p)})`);
    // skip the intro if it played
    if ((await scene(p)) === 'CutsceneScene') { for (let i = 0; i < 12 && (await scene(p)) !== 'HubScene'; i++) await key(p, 'Escape', 120); await p.waitForTimeout(1500); }
    await until(p, () => window.__G.scenes.current.constructor.name === 'HubScene', 6000);
    await p.waitForTimeout(1500);
    const sc = await p.evaluate(() => window.__G.scenes.current.world.players.map((q) => `${q.slot}:${q.color}`).join(' '));
    check(sc === '0:R3 1:B5', `the workshop seats both hands with R3 / B5 scarves (${sc})`);
    check(p.logs.length === 0, `no page errors (${p.logs.join(' | ')})`);
    await p.close();
  }

  // ── 2–4. workshop: hot join, leave, disconnect ──
  {
    const p = await page();
    await p.goto(base + '?scene=hub&devices=pad0');
    await p.waitForTimeout(4500);
    // close Ines's first-visit line if it is up
    for (let i = 0; i < 16; i++) { if (await p.evaluate(() => !window.__G.scenes.current.overlays.length)) break; await tap(p, 0, 0); await p.waitForTimeout(300); }
    // the solo hand has used its pad (until then, the first press anywhere counts as theirs)
    await tap(p, 0, 13);
    await p.evaluate(() => window.__press(2, 0, true));
    await p.waitForTimeout(260);
    await p.screenshot({ path: `${out}_door1.png` });
    await p.evaluate(() => window.__press(2, 0, false));
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}_door2.png` });
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}_door3.png` });
    const s2 = await seats(p);
    check(s2.includes('1:pad2'), `pad2 A hot-joins the workshop as II (${s2})`);
    check(await p.evaluate(() => window.__G.scenes.current.world.players.length === 2), 'hand II stepped out of a clock');
    // leave: hold View 1.6 s
    await p.evaluate(() => window.__press(2, 8, true));
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}_leaving.png` });
    await p.waitForTimeout(1300);
    await p.evaluate(() => window.__press(2, 8, false));
    await p.waitForTimeout(500);
    check(!(await seats(p)).includes('pad2'), `holding View leaves (${await seats(p)})`);
    // disconnect: join pad1, unplug it → paused; plug back → resumes
    await tap(p, 1, 0);
    await p.waitForTimeout(1200);
    await p.evaluate(() => window.__plug(1, false));
    await p.waitForTimeout(600);
    const paused = await p.evaluate(() => window.__G.scenes.current.overlays.some((o) => o.constructor.name === 'DisconnectOverlay'));
    check(paused, 'unplugging a joined pad pauses with the reconnect prompt');
    await p.screenshot({ path: `${out}_lost.png` });
    await p.evaluate(() => window.__plug(1, true));
    await p.waitForTimeout(700);
    check(await p.evaluate(() => !window.__G.scenes.current.overlays.some((o) => o.constructor.name === 'DisconnectOverlay')), 'plugging it back resumes');
    await p.evaluate(() => window.__plug(1, false));
    await p.waitForTimeout(700);
    await tap(p, 0, 9);
    await p.waitForTimeout(500);
    check(!(await seats(p)).includes('pad1'), `Start on another pad continues without the lost hand (${await seats(p)})`);
    check(p.logs.length === 0, `no page errors (${p.logs.join(' | ')})`);
    await p.close();
  }

  // ── 5. mid-run join ──
  {
    const p = await page();
    await p.goto(base + '?seed=4&floor=1&devices=pad0&god=1&room=shop');
    await p.waitForTimeout(4500);
    await tap(p, 0, 13);
    await tap(p, 3, 0);
    await p.waitForTimeout(500);
    const s5 = await seats(p);
    check(s5.includes('1:pad3'), `pad3 A joins mid-run (${s5})`);
    check(await p.evaluate(() => window.__G.scenes.current.world.players.length === 1 && window.__G.scenes.current.hud.pending.includes(1)), 'the hand waits for the next room (pending pod)');
    await p.screenshot({ path: `${out}_pending.png` });
    // walk out through a door: teleport pad0's hand into the first door
    await p.evaluate(() => { const s = window.__G.scenes.current; const d = s.doors[0]; const pl = s.world.players[0]; pl.x = d.x; pl.y = d.y - 10; });
    check(await until(p, () => window.__G.scenes.current.world?.players?.length === 2, 9000), 'next room: hand II walks in');
    await p.waitForTimeout(2500);
    const lo = await p.evaluate(() => { const s = window.__G.scenes.current; return { panel: !!s.panelOf(1), catchup: s.run.lo(1).catchup }; });
    check(lo.panel, `hand II gets its catch-up memory pick (panel open: ${lo.panel})`);
    await p.screenshot({ path: `${out}_catchup.png` });
    check(p.logs.length === 0, `no page errors (${p.logs.join(' | ')})`);
    await p.close();
  }
  await b.close();
  console.log(failed ? `JOINTEST: ${failed} FAILED` : 'JOINTEST: ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
