// QA: run the autopilot for a while, report rooms reached, errors, and periodic screenshots.
const { chromium } = require('playwright');
(async () => {
  const [, , query = 'seed=1&bot=1&speed=4&god=1', secs = '120', out = 'tools/out/qa'] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await p.goto(process.env.BASE || ('http://127.0.0.1:5173/?' + query));
  const n = Math.ceil(+secs / 20);
  for (let i = 0; i < n; i++) {
    await p.waitForTimeout(20000);
    await p.screenshot({ path: `${out}_${i}.png` });
  }
  const log = await p.evaluate(() => (window.__botLog || []).join('\n'));
  console.log(log);
  console.log('ERRORS:', errs.length);
  console.log([...new Set(errs)].slice(0, 10).join('\n---\n'));
  await b.close();
})();
