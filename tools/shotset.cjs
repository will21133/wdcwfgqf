// Regression screenshot set: one fresh browser context per shot (clean localStorage), several window sizes.
// usage: node tools/shotset.cjs <outDir> [WxH,WxH,...] [name,name,...]
//   default sizes 1280x720,1920x1080; default = every shot below.
//   env: TEXT=125 (start with the 125% text-size setting), QLANG=zh|en (append &lang= to every URL)
//   prints console warnings/errors per shot ("[text] CJK in tiny" is counted separately).
const { chromium } = require('playwright');
const fs = require('node:fs');

const openStation = (zh) => `(() => { const s = window.__G.scenes.current; const st = s.world.entities.find((e) => e.prompt && e.interact && e.prompt() === ${JSON.stringify(zh)}); if (st) st.interact(); return !!st; })()`;
const skipDialogue = `(() => { const s = window.__G.scenes.current; s.overlays.length = 0; return true; })()`;

const nearStation = (zh) => `(() => { const s = window.__G.scenes.current; s.overlays.length = 0; const p = s.world.player; const st = s.world.entities.find((e) => e.prompt && e.interact && e.prompt() === ${JSON.stringify(zh)}); p.x = st.x; p.y = st.y + 12; return true; })()`;
const injectReplace = `(() => { const o = window.__G.scenes.current.overlays.find((o) => o.choices); o.choices[1].replaces = { zh: '齿轮之刃', en: 'Gear Blade' }; o.choices[2].isNew = true; return true; })()`;

const SHOTS = [
  { name: 'title', q: 'scene=title', wait: 3000 },
  { name: 'title_menu', q: 'scene=title', wait: 1600, steps: [{ t: 0, press: 'KeyX' }, { t: 1800, shot: 1 }] },
  { name: 'hub_dialogue', q: 'scene=hub', wait: 4500 },
  { name: 'hub', q: 'scene=hub', wait: 4000, steps: [{ t: 0, eval: skipDialogue }, { t: 100, down: 'KeyD' }, { t: 1150, up: 'KeyD' }, { t: 1200, down: 'KeyW' }, { t: 1500, up: 'KeyW' }, { t: 2200, shot: 1 }] },
  { name: 'mainspring', q: 'scene=hub', wait: 4000, steps: [{ t: 0, eval: skipDialogue }, { t: 100, eval: openStation('发条台') }, { t: 900, shot: 1 }] },
  { name: 'weapons', q: 'scene=hub', wait: 4000, steps: [{ t: 0, eval: skipDialogue }, { t: 100, eval: openStation('武器架') }, { t: 900, shot: 1 }] },
  { name: 'ledger', q: 'scene=hub', wait: 4000, steps: [{ t: 0, eval: skipDialogue }, { t: 100, eval: openStation('账簿') }, { t: 900, shot: 1 }] },
  { name: 'floorcard', q: 'seed=1&floor=1&god=1', wait: 900 },
  { name: 'fight', q: 'seed=1&floor=0&god=1', wait: 3800 },
  { name: 'offer', q: 'seed=1&floor=0&god=1&offer=oren', wait: 3200 },
  { name: 'offer_en', q: 'seed=1&floor=0&god=1&offer=oren&lang=en', wait: 3200 },
  { name: 'pause', q: 'seed=1&floor=0&god=1', wait: 3000, steps: [{ t: 0, press: 'Escape' }, { t: 600, shot: 1 }] },
  { name: 'build', q: 'seed=1&floor=0&god=1&offer=oren', wait: 3000, steps: [{ t: 0, press: 'Enter' }, { t: 1200, press: 'Tab' }, { t: 1800, shot: 1 }] },
  { name: 'settings', q: 'seed=1&floor=0&god=1', wait: 3000, steps: [{ t: 0, press: 'Escape' }, { t: 700, down: 'ArrowDown' }, { t: 900, up: 'ArrowDown' }, { t: 1500, down: 'ArrowDown' }, { t: 1700, up: 'ArrowDown' }, { t: 2300, press: 'Enter' }, { t: 3100, shot: 1 }] },
  { name: 'controls', q: 'scene=controls', wait: 2600 },
  { name: "summary", q: "scene=summary", wait: 7000 },
  { name: "summary_death", q: "scene=summary&kind=death", wait: 7000 },
  { name: 'tutorial', q: 'seed=5&room=tutorial&god=1', wait: 3200 },
  { name: 'shop', q: 'seed=1&room=shop&god=1&brass=300', wait: 3000, steps: [{ t: 0, move: [700, 300] }, { t: 100, down: 'KeyW' }, { t: 560, up: 'KeyW' }, { t: 1300, shot: 1 }] },
  { name: 'event', q: 'seed=1&room=event&god=1', wait: 2500, steps: [{ t: 0, move: [700, 300] }, { t: 0, down: 'KeyW' }, { t: 1250, up: 'KeyW' }, { t: 1400, press: 'KeyE' }, { t: 4500, shot: 1 }] },
  { name: 'offer_replace', q: 'seed=1&floor=0&god=1&offer=oren', wait: 2500, steps: [{ t: 0, eval: injectReplace }, { t: 900, shot: 1 }] },
  { name: 'offer_replace_en', q: 'seed=1&floor=0&god=1&offer=oren&lang=en', wait: 2500, steps: [{ t: 0, eval: injectReplace }, { t: 900, shot: 1 }] },
  { name: 'hub_prompt', q: 'scene=hub', wait: 4000, steps: [{ t: 0, eval: nearStation('发条台') }, { t: 900, shot: 1 }] },
  { name: 'hub_rewind', q: 'scene=hub', wait: 4000, steps: [{ t: 0, eval: nearStation('发条台') }, { t: 4500, down: 'KeyQ' }, { t: 4750, shot: 1 }, { t: 4800, up: 'KeyQ' }] },
  { name: 'shop_near', q: 'seed=1&room=shop&god=1&brass=300', wait: 9000, steps: [{ t: 0, eval: `(() => { const w = window.__G.scenes.current.world; const it = w.entities.filter((e) => e.price && e.prompt)[2]; w.player.x = it.x; w.player.y = it.y + 8; return true; })()` }, { t: 2500, shot: 1 }] },
  { name: 'widgets', q: 'scene=widgets', wait: 2500 },
  { name: 'widgets_pad', q: 'scene=widgets&pad=1&lang=en', wait: 2500 },
  { name: 'rewind', q: 'seed=1&floor=0&god=1', wait: 3000, steps: [{ t: 0, move: [640, 300] }, { t: 0, down: 'KeyD' }, { t: 1200, up: 'KeyD' }, { t: 1300, down: 'KeyQ' }, { t: 1600, shot: 1 }, { t: 1700, up: 'KeyQ' }] },
  { name: 'settings_bottom', q: 'seed=1&floor=0&god=1', wait: 3000, steps: [{ t: 0, press: 'Escape' }, { t: 700, eval: `(() => { const s = window.__G.scenes.current; s.overlays.at(-1).list.items[2].act(); const st = s.overlays.at(-1); st.list.sel = st.list.items.length - 3; st.list.follow(); return 1; })()` }, { t: 1500, shot: 1 }] },
  { name: 'cutscene', q: 'scene=intro', wait: 6500 },
  { name: 'registry_demo', q: 'debug=registry&demo=1', wait: 6000 },
  { name: 'floorcard_pause', q: 'seed=1&floor=1&god=1', wait: 700, steps: [{ t: 0, press: 'Escape' }, { t: 700, shot: 1 }] },
];

(async () => {
  const [, , outDir = 'tools/out/shotset', sizesArg = '1280x720,1920x1080', namesArg] = process.argv;
  const base = process.env.BASE || 'http://127.0.0.1:5173/';
  const sizes = sizesArg.split(',').map((s) => s.split('x').map(Number));
  const names = namesArg ? new Set(namesArg.split(',')) : null;
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  let tinyWarn = 0, errors = 0;
  for (const s of SHOTS) {
    if (names && !names.has(s.name)) continue;
    for (const [W, H] of sizes) {
      const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DPR || 1), locale: process.env.LOCALE || 'zh-CN' });
      if (process.env.TEXT === '125') await ctx.addInitScript(() => { try { localStorage.setItem('secondhand.settings.v1', JSON.stringify({ textSize: 125 })); } catch {} });
      const p = await ctx.newPage();
      const logs = [];
      p.on('console', (m) => {
        const t = m.text();
        if (t.includes('[text] CJK in tiny')) tinyWarn++;
        if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${t}`);
      });
      p.on('pageerror', (e) => { errors++; logs.push(`[pageerror] ${e.message}`); });
      await p.goto(base + '?' + s.q + (process.env.QLANG ? '&lang=' + process.env.QLANG : ''));
      await p.waitForTimeout(s.wait);
      const out = `${outDir}/${s.name}_${W}x${H}.png`;
      if (s.steps) {
        let now = 0;
        for (const st of s.steps) {
          if (st.t > now) { await p.waitForTimeout(st.t - now); now = st.t; }
          if (st.down) await p.keyboard.down(st.down);
          if (st.up) await p.keyboard.up(st.up);
          if (st.press) await p.keyboard.press(st.press);
          if (st.move) await p.mouse.move(st.move[0], st.move[1]);
          if (st.eval) { try { await p.evaluate(st.eval); } catch (e) { logs.push('[eval] ' + e.message); } }
          if (st.shot) await p.screenshot({ path: out });
        }
      } else await p.screenshot({ path: out });
      console.log(out + (logs.length ? '\n  ' + [...new Set(logs)].slice(0, 6).join('\n  ') : ''));
      await ctx.close();
    }
  }
  console.log(`TINY-CJK-WARNINGS: ${tinyWarn}  PAGE-ERRORS: ${errors}`);
  await b.close();
})();
