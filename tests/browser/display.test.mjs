// Task 9: the page in all 7 languages, from the narrowest window the app allows (400 px) to a wide one, with
// the real data file (text only). Checks: no sideways scrolling, no text cut off or sticking out of its
// button / badge / box, both dialogs fit, Hebrew runs right to left. The letters each language needs from
// the pixel font are reported by tools/display-report.mjs (that one is a design question, not a test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, EDGE } from '../lib/edge.mjs';
import { fakeTauri } from '../lib/fake-tauri.mjs';
import { testCape } from '../lib/png.mjs';
import { FIND_PROBLEMS } from '../lib/layout-check.mjs';

const PAGE = fileUrl(fileURLToPath(new URL('../../app/dist/index.html', import.meta.url)));
const DATA = JSON.parse(readFileSync(new URL('../../data/capewatch.json', import.meta.url), 'utf8'));
const LANGS = ['en', 'he', 'es', 'pt', 'fr', 'de', 'ru'];
const skip = !EDGE && 'Microsoft Edge not found';
let edge;
before(async () => { if (!skip) edge = await launch(); });
after(async () => { await edge?.close(); });


async function open(lang, width) {
  const page = await edge.newPage();
  await page.viewport(width, 880, 1);
  await page.block(['*mojang.com*']);
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.init(`try { localStorage.setItem('caperadar:lang', ${JSON.stringify(lang)}); } catch {}`);
  await page.init(fakeTauri({ data: DATA }));
  await page.goto(PAGE);
  await page.waitFor(`document.querySelectorAll('#grid .tile').length > 10`);
  await page.eval(`document.fonts.ready.then(() => true)`);
  await new Promise((r) => setTimeout(r, 400));
  return page;
}

for (const width of [400, 1200]) {
  for (const lang of LANGS) {
    test(`${lang} at ${width} px: nothing cut off or outside the window (page, details, settings)`, { skip }, async () => {
      const page = await open(lang, width);
      assert.equal(await page.eval('document.documentElement.lang'), lang, 'the page is in the chosen language');
      const problems = [];
      problems.push(...(await page.eval(FIND_PROBLEMS)).map((p) => 'page: ' + p));
      await page.eval(`CapeWatchPage.openDetail('aurora')`);
      await new Promise((r) => setTimeout(r, 200));
      problems.push(...(await page.eval(FIND_PROBLEMS)).map((p) => 'details: ' + p));
      await page.eval(`document.getElementById('dlg').close()`);
      await page.click('#cw-open-settings');
      await page.waitFor(`document.getElementById('cw-settings')?.open`);
      await new Promise((r) => setTimeout(r, 200));
      problems.push(...(await page.eval(FIND_PROBLEMS)).map((p) => 'settings: ' + p));
      if (lang === 'he') {
        // the layout never mirrors; only the text inside each box runs right to left
        assert.equal(await page.eval(`document.getElementById('wrap').dir`), 'ltr');
        assert.equal(await page.eval(`document.getElementById('cw-settings').dir`), 'ltr');
        assert.equal(await page.eval(`document.querySelector('.lede').dir`), 'rtl');
        assert.equal(await page.eval(`document.querySelector('#cw-settings legend').dir`), 'rtl');
      }
      assert.deepEqual(page.exceptions, []);
      await page.close();
      assert.deepEqual(problems, []);
    });
  }
}

test('Hebrew page: the English Mojang line reads left to right, its final period at the end (right)', { skip }, async () => {
  const page = await open('he', 1200);
  const order = await page.eval(`[...document.querySelectorAll('.mojang-en')].map((e) => {
    const t = e.firstChild, r = document.createRange();
    r.setStart(t, 0); r.setEnd(t, 1); const first = r.getBoundingClientRect().left;
    r.setStart(t, t.length - 1); r.setEnd(t, t.length); const last = r.getBoundingClientRect().left;
    return last > first; })`);
  assert.deepEqual(order, [true, true], 'header and footer notice');
  await page.close();
});
