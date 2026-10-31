// Screenshot harness for art review / QA.
// usage: node tools/shot.mjs <url-query> <out.png> [waitMs] [w] [h] [script.json]
//   script.json: [{"t":ms,"down":"KeyW"},{"t":ms,"up":"KeyW"},{"t":ms,"shot":"name"} ...]
//   also: {"eval":"js"}, {"setStorage":{"key":k,"file":path}|{"key":k,"value":str}}, {"removeStorage":k},
//         {"reload":true} (reload the page; later steps keep their absolute times)
const { chromium } = require('playwright');
const fs = require('node:fs');

(async()=>{
const [, , query = '', out = 'tools/out/shot.png', wait = '1500', W = '1280', H = '720', scriptPath] = process.argv;
const base = process.env.BASE || 'http://127.0.0.1:5173/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const logs = [];
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await p.goto(base + (query ? '?' + query : ''));
await p.waitForTimeout(+wait);
fs.mkdirSync(out.substring(0, out.lastIndexOf('/')) || '.', { recursive: true });
if (scriptPath) {
  const steps = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  let now = 0;
  for (const s of steps) {
    if (s.t > now) { await p.waitForTimeout(s.t - now); now = s.t; }
    if (s.down) await p.keyboard.down(s.down);
    if (s.up) await p.keyboard.up(s.up);
    if (s.press) await p.keyboard.press(s.press);
    if (s.move) await p.mouse.move(s.move[0], s.move[1]);
    if (s.mdown !== undefined) await p.mouse.down({ button: s.mdown === 2 ? 'right' : 'left' });
    if (s.mup !== undefined) await p.mouse.up({ button: s.mup === 2 ? 'right' : 'left' });
    if (s.setStorage) {
      const v = s.setStorage.file ? fs.readFileSync(s.setStorage.file, 'utf8') : String(s.setStorage.value);
      await p.evaluate(([k, val]) => localStorage.setItem(k, val), [s.setStorage.key, v]);
    }
    if (s.removeStorage) await p.evaluate((k) => localStorage.removeItem(k), s.removeStorage);
    if (s.reload) await p.reload();
    if (s.eval) logs.push('[eval] ' + JSON.stringify(await p.evaluate(s.eval)));
    if (s.shot) await p.screenshot({ path: out.replace(/\.png$/, `_${s.shot}.png`) });
  }
} else {
  await p.screenshot({ path: out });
}
console.log(logs.slice(-40).join('\n'));
await b.close();
})();
