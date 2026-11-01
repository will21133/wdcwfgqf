// Four virtual Xbox (standard mapping) controllers: each presses A to join in the workshop, each
// left stick moves only its own player, rumble reaches only its own pad, a pad disconnect reports
// its slot, and pad buttons reach the recent-codes buffer. Also the solo rules: a solo player who
// picks up another pad (or the keyboard) keeps playing (a tap never seats a second hand), the
// first friend joins by HOLDING A (devices.JOIN_HOLD), and once two humans sit, a tap joins.
// Every step waits on game state (not fixed sleeps), so a busy machine only makes it slower.
// usage: node tools/padtest4.cjs ["scene=hub"] [outPrefix]   (exit code 1 on any failed check)
const { chromium } = require('playwright');
(async () => {
  const [, , query = 'scene=hub', out = 'tools/out/F2/padtest4'] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
  await p.addInitScript(() => {
    const mk = (index) => ({
      id: `Xbox Wireless Controller (STANDARD GAMEPAD) #${index}`, index, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: { type: 'dual-rumble', playEffect: () => { window.__padFx[index] = (window.__padFx[index] || 0) + 1; return Promise.resolve('complete'); } },
    });
    window.__padFx = [0, 0, 0, 0];
    const pads = [mk(0), mk(1), mk(2), mk(3)];
    window.__pads = pads;
    navigator.getGamepads = () => pads.map((g) => (g.connected ? g : null));
    window.__press = (pi, i, v = true) => { const g = pads[pi]; g.buttons[i].pressed = v; g.buttons[i].value = v ? 1 : 0; g.timestamp++; };
    window.__axes = (pi, a) => { pads[pi].axes = a; pads[pi].timestamp++; };
  });
  await p.goto((process.env.BASE || 'http://127.0.0.1:5173/') + '?' + query);
  // wait until the game ticks (frames counted by the scene's own clock, not wall time)
  const until = async (fn, ms = 15000, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(100); } return false; };
  /** wait until the scene clock has advanced by `sec` game seconds */
  const ticks = async (sec) => { const t0 = await p.evaluate(() => window.__G.scenes.current.t ?? 0); await until((a) => (window.__G.scenes.current.t ?? 0) >= a, 20000, t0 + sec); };
  await until(() => window.__G?.scenes?.current?.constructor?.name === 'HubScene' && window.__G.scenes.current.t > 1.2, 30000);
  // a press is held until the game has seen it for a few ticks, then released (and seen released)
  const tap = async (pi, i, sec = 0.1) => { await p.evaluate(([pi, i]) => window.__press(pi, i, true), [pi, i]); await ticks(sec); await p.evaluate(([pi, i]) => window.__press(pi, i, false), [pi, i]); await ticks(0.08); };
  const seatsN = () => p.evaluate(() => window.__G.players.length);
  const state = () => p.evaluate(() => {
    const s = window.__G.scenes.current;
    const w = s.world;
    return {
      scene: s.constructor.name, overlays: (s.overlays || []).length,
      seats: window.__G.players.map((q) => ({ slot: q.slot, dev: q.device, kind: q.kind, merged: q.merged })),
      players: w ? w.players.map((q) => ({ slot: q.slot, dev: q.input.device, x: q.x, y: q.y })) : [],
      rumbles: Array.from({ length: 4 }, (_, i) => window.__rumbles[i] || 0), padFx: window.__padFx.slice(),
    };
  });
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

  let st = await state();
  console.log('start', JSON.stringify({ scene: st.scene, overlays: st.overlays, seats: st.seats }));
  // Ines greets a new profile: B closes the dialogue (and is pad 0's first touch: pad 0 becomes player I)
  if (st.overlays) { await tap(0, 1); await until(() => !window.__G.scenes.current.overlays.length, 4000); }
  // (with no dialogue: pad 0 touches first, so it is player I's)
  await tap(0, 13);
  await p.screenshot({ path: out + '_1solo.png' });

  // solo device switch (1.0: every device just works): a TAP of A on another pad, or Enter on the
  // keyboard, is still player I's input and seats nobody; pad 1's stick moves player I
  {
    const x0 = (await state()).players[0];
    await tap(1, 0);
    await p.keyboard.down('Enter'); await ticks(0.1); await p.keyboard.up('Enter'); await ticks(0.1);
    await p.evaluate(() => window.__axes(1, [0.95, 0, 0, 0])); await ticks(0.4); await p.evaluate(() => window.__axes(1, [0, 0, 0, 0])); await ticks(0.15);
    const s1 = await state();
    check(s1.seats.length === 1, `solo: tapping A on pad1 / Enter seats nobody (seats ${s1.seats.length})`);
    check(Math.hypot(s1.players[0].x - x0.x, s1.players[0].y - x0.y) > 15, 'solo: pad1 still drives player I (1.0)');
    // the player picks pad 0 back up (its stick), so pad 0 is what player I was on last
    await p.evaluate(() => window.__axes(0, [0, 0.95, 0, 0])); await ticks(0.2); await p.evaluate(() => window.__axes(0, [0, 0, 0, 0])); await ticks(0.1);
  }

  // the first friend HOLDS A on pad 1 (JOIN_HOLD 0.8 s): the "hold to join" plate fills, then II sits
  await p.evaluate(() => window.__press(1, 0, true));
  await ticks(0.45);
  const holding = await p.evaluate(() => { const h = window.__G.devices.joinHold; return h ? { id: h.id, k: h.k } : null; });
  check(!!holding && holding.id === 'pad1' && holding.k > 0.3 && holding.k < 1, `holding A on pad1 shows the join progress (${JSON.stringify(holding)})`);
  await p.screenshot({ path: out + '_1hold.png' });
  await until(() => window.__G.players.length === 2, 4000);
  await p.evaluate(() => window.__press(1, 0, false));
  await ticks(0.1);
  // two humans now: pads 2 and 3 join with a tap
  for (const k of [2, 3]) { await tap(k, 0); await until((n) => window.__G.players.length >= n, 3000, k + 1); }
  await ticks(0.3);
  st = await state();
  console.log('seats', JSON.stringify(st.seats));
  check(st.seats.length === 4, `4 players seated (got ${st.seats.length})`);
  check(st.players.length === 4, `4 Player entities in the workshop (got ${st.players.length})`);
  for (let k = 0; k < 4; k++) check(st.seats.some((q) => q.slot === k && q.dev === `pad${k}`), `slot ${k} is driven by pad${k}`);
  check(st.seats.every((q) => !q.merged), 'no player reads every device once others joined');
  await ticks(1.2);
  await p.screenshot({ path: out + '_2joined.png' });

  // left stick: only the pad's own player moves
  for (let k = 0; k < 4; k++) {
    const before = (await state()).players;
    // push toward the middle of the room (a hand standing against the bottom wall cannot go down)
    const me = before.find((q) => q.dev === `pad${k}`);
    const dy = me && me.y > 200 ? -0.95 : 0.95;
    await p.evaluate(([k, dy]) => window.__axes(k, [0, dy, 0, 0]), [k, dy]);
    await ticks(0.4);
    await p.evaluate((k) => window.__axes(k, [0, 0, 0, 0]), k);
    await ticks(0.2);
    const after = (await state()).players;
    const moved = after.map((q) => { const o = before.find((r) => r.slot === q.slot); return Math.hypot(q.x - o.x, q.y - o.y); });
    const own = after.findIndex((q) => q.dev === `pad${k}`);
    check(moved[own] > 20 && moved.every((d, i) => i === own || d < 3), `pad${k} stick moves only its player (moved ${moved.map((d) => d.toFixed(1)).join(' / ')})`);
  }
  await p.screenshot({ path: out + '_3moved.png' });

  // rumble: A = dash, which rumbles the dasher's own pad only
  for (let k = 0; k < 4; k++) {
    const r0 = (await state());
    await ticks(0.6);   // dash charges back
    await tap(k, 0);
    await ticks(0.1);
    const r1 = (await state());
    const dr = r1.rumbles.map((v, i) => v - r0.rumbles[i]);
    const df = r1.padFx.map((v, i) => v - r0.padFx[i]);
    check(dr[k] >= 1 && dr.every((v, i) => i === k || v === 0) && df[k] >= 1 && df.every((v, i) => i === k || v === 0), `pad${k} dash rumbles pad${k} only (__rumbles Δ ${dr.join(',')}; actuator Δ ${df.join(',')})`);
  }

  // pad buttons reach the recent-codes buffer (secret sequences)
  await tap(2, 12); await tap(2, 12); await tap(2, 13);
  const codes = await p.evaluate(() => window.__G.devices.recentCodes.slice(-3));
  check(codes.join() === 'PadUp,PadUp,PadDown', `recentCodes records pad buttons (${codes.join(' ')})`);

  // disconnect: the slot is reported
  await p.evaluate(() => { window.__lost = -1; window.__G.devices.onDisconnect((s) => { window.__lost = s; }); window.__pads[3].connected = false; });
  await until(() => window.__lost !== -1, 3000);
  const lost = await p.evaluate(() => window.__lost);
  check(lost === 3, `pad3 disconnect reports slot 3 (got ${lost})`);

  st = await state();
  console.log('final', JSON.stringify({ seats: st.seats, rumbles: st.rumbles, padFx: st.padFx }));
  if (logs.length) console.log(logs.join('\n'));
  check(!logs.some((l) => l.startsWith('[pageerror]')), 'no page errors');
  console.log(fails.length ? `PADTEST4: ${fails.length} FAILED` : 'PADTEST4: ALL PASSED');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
