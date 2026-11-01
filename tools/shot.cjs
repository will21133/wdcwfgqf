// Screenshot harness for art review / QA.
// usage: node tools/shot.cjs <url-query> <out.png> [waitMs] [w] [h] [script.json]
//   script.json: [{"t":ms,"down":"KeyW"},{"t":ms,"up":"KeyW"},{"t":ms,"shot":"name"} ...]
//   also: {"eval":"js"} (awaited; its result goes to the log), {"setStorage":{"key":k,"file":path}|{"key":k,"value":str}},
//         {"removeStorage":k}, {"reload":true} (reload the page; later steps keep their absolute times)
//   F4b (ONBOARD2 §11.3), all optional and backwards compatible:
//         {"pad":[index,button,down]}        a virtual Xbox pad (standard mapping) presses / releases a button
//                                            (A 0 · B 1 · X 2 · Y 3 · LB 4 · RB 5 · LT 6 · RT 7 · View 8 · Menu 9 ·
//                                            LS 10 · RS 11 · d-pad 12–15); down defaults to true
//         {"axes":[index,[lx,ly,rx,ry]]}     its sticks
//         {"waitFor":"<js expression>","ms":N}  poll every 100 ms until the expression is truthy (or N ms,
//                                            default 20000; the log says which). The wait is taken out of the
//                                            timeline: later "t" values count as if it took no time.
//   A script with a pad / axes step gets four virtual pads before the page loads (padtest4.cjs's
//   addInitScript); the game then sees them as connected Xbox controllers.
//   Steps without "t" run right after the previous one. The whole log is written next to the
//   screenshot as <out>.log (the console shows its last 40 lines).
const { chromium } = require('playwright');
const fs = require('node:fs');

(async()=>{
const [, , query = '', out = 'tools/out/shot.png', wait = '1500', W = '1280', H = '720', scriptPath] = process.argv;
const base = process.env.BASE || 'http://127.0.0.1:5173/';
const steps = scriptPath ? JSON.parse(fs.readFileSync(scriptPath, 'utf8')) : null;
const usesPad = !!steps && steps.some((s) => s.pad || s.axes);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const logs = [];
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
if (usesPad) {
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
}
await p.goto(base + (query ? '?' + query : ''));
await p.waitForTimeout(+wait);
fs.mkdirSync(out.substring(0, out.lastIndexOf('/')) || '.', { recursive: true });
if (steps) {
  let now = 0;
  /** ms taken by waitFor steps so far (removed from the timeline) */
  let shift = 0;
  for (const s of steps) {
    const at = s.t === undefined ? undefined : s.t + shift;
    if (at !== undefined && at > now) { await p.waitForTimeout(at - now); now = at; }
    if (s.down) await p.keyboard.down(s.down);
    if (s.up) await p.keyboard.up(s.up);
    if (s.press) await p.keyboard.press(s.press);
    if (s.move) await p.mouse.move(s.move[0], s.move[1]);
    if (s.mdown !== undefined) await p.mouse.down({ button: s.mdown === 2 ? 'right' : 'left' });
    if (s.mup !== undefined) await p.mouse.up({ button: s.mup === 2 ? 'right' : 'left' });
    if (s.pad) { const [pi, bi, down = true] = s.pad; await p.evaluate(([a, c, d]) => window.__press(a, c, d), [pi, bi, down]); }
    if (s.axes) { const [pi, ax] = s.axes; await p.evaluate(([a, v]) => window.__axes(a, v), [pi, ax]); }
    if (s.setStorage) {
      const v = s.setStorage.file ? fs.readFileSync(s.setStorage.file, 'utf8') : String(s.setStorage.value);
      await p.evaluate(([k, val]) => localStorage.setItem(k, val), [s.setStorage.key, v]);
    }
    if (s.removeStorage) await p.evaluate((k) => localStorage.removeItem(k), s.removeStorage);
    if (s.reload) await p.reload();
    if (s.waitFor) {
      const limit = s.ms ?? 20000, t0 = Date.now();
      let ok = false;
      while (Date.now() - t0 < limit) {
        ok = await p.evaluate((x) => { try { return !!(0, eval)(x); } catch { return false; } }, s.waitFor).catch(() => false);
        if (ok) break;
        await p.waitForTimeout(100);
      }
      const took = Date.now() - t0;
      shift += took;
      now += took;
      logs.push(`[waitFor] ${ok ? 'ok' : 'TIMEOUT'} ${took}ms ${s.waitFor}`);
    }
    if (s.eval) logs.push('[eval] ' + JSON.stringify(await p.evaluate(s.eval).catch((e) => 'ERROR ' + e.message)));
    if (s.shot) await p.screenshot({ path: out.replace(/\.png$/, `_${s.shot}.png`) });
  }
} else {
  await p.screenshot({ path: out });
}
try { fs.writeFileSync(out.replace(/\.png$/, '') + '.log', logs.join('\n') + '\n'); } catch { /* read-only dir */ }
console.log(logs.slice(-40).join('\n'));
await b.close();
})();
