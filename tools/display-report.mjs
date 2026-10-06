// Display report (task 9 of the night work): screenshots of the app page in every language, at the narrowest
// window (400 px) and a normal one (1200 px), at Windows display scales 100/125/150/200 %, plus the letters each
// language needs that the pixel font does not have. Run: node tools/display-report.mjs   (needs app/dist built)
// Screenshots go to _screenshots/night/display/ (local only, never committed: the page shows Minecraft textures).
// The cape textures here are made-up two-colour pictures, so these screenshots hold no game art.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../tests/lib/edge.mjs';
import { fakeTauri } from '../tests/lib/fake-tauri.mjs';
import { testCape } from '../tests/lib/png.mjs';
import { FIND_PROBLEMS } from '../tests/lib/layout-check.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = root + '_screenshots/night/display/';
mkdirSync(OUT, { recursive: true });
const PAGE = fileUrl(root + 'app/dist/index.html');
const DATA = JSON.parse(readFileSync(root + 'data/capewatch.json', 'utf8'));
const LANGS = ['en', 'he', 'es', 'pt', 'fr', 'de', 'ru'];
const only = process.argv.slice(2);

// letters in the pixel font
const glyphs = new Set(JSON.parse(execFileSync('python', ['-c',
  "import json; from fontTools.ttLib import TTFont; print(json.dumps([chr(c) for c in TTFont(r'" + root + "assets/fonts/CapeWatchPixel.ttf').getBestCmap()]))"], { encoding: 'utf8' })));

const edge = await launch();
const report = { problems: {}, missing: {} };
for (const lang of LANGS.filter((l) => !only.length || only.includes(l))) {
  for (const [w, scales] of [[400, [1, 1.25, 1.5, 2]], [1200, [1, 1.5]]]) {
    for (const scale of scales) {
      const page = await edge.newPage();
      await page.viewport(w, 880, scale);
      await page.block(['*mojang.com*']);
      await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
      await page.route('https://minecraft.wiki/images/*', () => ({ body: testCape(), type: 'image/png' }));
      await page.init(`try { localStorage.setItem('caperadar:lang', ${JSON.stringify(lang)}); } catch {}`);
      await page.init(fakeTauri({ data: DATA }));
      await page.goto(PAGE);
      await page.waitFor(`document.querySelectorAll('#grid .tile img.gen').length > 10`, 30000).catch(() => {});
      await page.eval(`document.fonts.ready.then(() => true)`);
      await new Promise((r) => setTimeout(r, 600));
      const name = `${lang}-${w}px-${Math.round(scale * 100)}`;
      writeFileSync(OUT + name + '-top.png', await page.screenshot());
      if (scale === 1) {
        writeFileSync(OUT + name + '-full.png', await page.screenshot({ full: true }));
        const p = await page.eval(FIND_PROBLEMS);
        if (p.length) report.problems[name] = p;
        await page.click('#cw-open-settings');
        await new Promise((r) => setTimeout(r, 300));
        writeFileSync(OUT + name + '-settings.png', await page.screenshot());
        await page.eval(`document.getElementById('cw-settings').close(); CapeWatchPage.openDetail('aurora')`);
        await new Promise((r) => setTimeout(r, 300));
        writeFileSync(OUT + name + '-details.png', await page.screenshot());
        if (w === 1200) {
          // every text the pixel font has to draw in this language
          const text = await page.eval(`[...document.querySelectorAll('*')].filter(e => getComputedStyle(e).fontFamily.startsWith('"CapeWatch Pixel"') && [...e.childNodes].some(n => n.nodeType === 3)).map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('')).join(' ')`);
          const miss = [...new Set([...text].filter((c) => c.trim() && !glyphs.has(c)))].sort();
          report.missing[lang] = { letters: miss.join(' '), sample: text.split(/\s+/).filter((x) => [...x].some((c) => miss.includes(c))).slice(0, 8) };
        }
      }
      await page.close();
      console.log('done', name);
    }
  }
}
await edge.close();
writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
