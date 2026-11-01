// Four virtual Xbox (standard mapping) controllers: each presses A to join in the workshop, each
// left stick moves only its own player, rumble reaches only its own pad, a pad disconnect reports
// its slot, and pad buttons reach the recent-codes buffer.
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
  await p.waitForTimeout(7000);
  const tap = async (pi, i, hold = 260) => { await p.evaluate(([pi, i]) => window.__press(pi, i, true), [pi, i]); await p.waitForTimeout(hold); await p.evaluate(([pi, i]) => window.__press(pi, i, false), [pi, i]); await p.waitForTimeout(220); };
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
  if (st.overlays) { await tap(0, 1); await p.waitForTimeout(600); }
  await p.screenshot({ path: out + '_1solo.png' });

  // each pad presses A: pad 0 is already player I (it touched first), pads 1–3 join as II–IV
  for (let k = 0; k < 4; k++) { await tap(k, 0); await p.waitForTimeout(500); }
  st = await state();
  console.log('seats', JSON.stringify(st.seats));
  check(st.seats.length === 4, `4 players seated (got ${st.seats.length})`);
  check(st.players.length === 4, `4 Player entities in the workshop (got ${st.players.length})`);
  for (let k = 0; k < 4; k++) check(st.seats.some((q) => q.slot === k && q.dev === `pad${k}`), `slot ${k} is driven by pad${k}`);
  check(st.seats.every((q) => !q.merged), 'no player reads every device once others joined');
  await p.waitForTimeout(800);
  await p.screenshot({ path: out + '_2joined.png' });

  // left stick: only the pad's own player moves
  for (let k = 0; k < 4; k++) {
    const before = (await state()).players;
    await p.evaluate((k) => window.__axes(k, [0, 0.95, 0, 0]), k);
    await p.waitForTimeout(550);
    await p.evaluate((k) => window.__axes(k, [0, 0, 0, 0]), k);
    await p.waitForTimeout(250);
    const after = (await state()).players;
    const moved = after.map((q) => { const o = before.find((r) => r.slot === q.slot); return Math.hypot(q.x - o.x, q.y - o.y); });
    const own = after.findIndex((q) => q.dev === `pad${k}`);
    check(moved[own] > 20 && moved.every((d, i) => i === own || d < 3), `pad${k} stick moves only its player (moved ${moved.map((d) => d.toFixed(1)).join(' / ')})`);
  }
  await p.screenshot({ path: out + '_3moved.png' });

  // rumble: A = dash, which rumbles the dasher's own pad only
  for (let k = 0; k < 4; k++) {
    const r0 = (await state());
    await tap(k, 0);
    await p.waitForTimeout(250);
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
  await p.waitForTimeout(300);
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
