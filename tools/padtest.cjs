// Virtual Xbox (standard mapping) controller test.
const { chromium } = require('playwright');
(async () => {
  const [, , query = 'scene=title', out = 'tools/out/pad'] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  await p.addInitScript(() => {
    const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: { type: 'dual-rumble', playEffect: (t, o) => { window.__padFx = (window.__padFx || 0) + 1; return Promise.resolve('complete'); } } };
    window.__pad = pad;
    navigator.getGamepads = () => [pad, null, null, null];
    window.__press = (i, v = true) => { pad.buttons[i].pressed = v; pad.buttons[i].value = v ? 1 : 0; pad.timestamp++; };
    window.__axes = (a) => { pad.axes = a; pad.timestamp++; };
  });
  await p.goto('http://127.0.0.1:5173/?' + query);
  await p.waitForTimeout(9000);
  const tap = async (i, hold = 120) => { await p.evaluate((i) => window.__press(i, true), i); await p.waitForTimeout(hold); await p.evaluate((i) => window.__press(i, false), i); await p.waitForTimeout(150); };
  await p.screenshot({ path: out + '_1title.png' });
  await tap(13); await tap(13); await tap(12); await tap(12);          // dpad down x2, up x2 → back on "Begin"
  await p.screenshot({ path: out + '_2nav.png' });
  await tap(0);                                                         // A: begin
  await p.waitForTimeout(9000);
  await p.screenshot({ path: out + '_3after.png' });
  // skip intro if shown (B / cancel)
  await tap(1); await p.waitForTimeout(6000);
  await p.screenshot({ path: out + '_4hub.png' });
  // walk with the left stick toward Ines, then press B (interact)
  await p.evaluate(() => window.__axes([-0.9, -0.6, 0, 0])); await p.waitForTimeout(900); await p.evaluate(() => window.__axes([0, 0, 0, 0]));
  await p.waitForTimeout(300);
  await p.screenshot({ path: out + '_5walk.png' });
  await tap(0); await tap(2); await tap(4);                             // A dash, X attack, LB rewind (2.0: RB = fork)
  await p.waitForTimeout(400);
  const state = await p.evaluate(() => ({ rumbles: (window.__rumbles || []).reduce((a, b) => a + (b || 0), 0), padFx: window.__padFx || 0, device: window.__G.input.lastDevice, scene: window.__G.scenes.current.constructor.name }));
  console.log(JSON.stringify(state));
  console.log(logs.join('\n'));
  await b.close();
})();
