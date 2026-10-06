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


async function open(lang, width, data = DATA) {
  const page = await edge.newPage();
  await page.viewport(width, 880, 1);
  await page.block(['*mojang.com*']);
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.route('https://minecraft.wiki/images/*', () => ({ body: testCape(), type: 'image/png' }));   // the three wiki textures, answered by the test
  await page.init(`try { localStorage.setItem('caperadar:lang', ${JSON.stringify(lang)}); } catch {}`);
  await page.init(fakeTauri({ data }));
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
        // paragraphs from the right of their box; short labels and numbers on the left, next to what they belong to
        assert.equal(await page.eval(`getComputedStyle(document.querySelector('.lede')).textAlign`), 'start');
        assert.equal(await page.eval(`[...document.querySelectorAll('.stat span, .stat b, #cw-settings .cw-opt span')].map((e) => getComputedStyle(e).textAlign).join()`),
          Array(6 + 6 + 6).fill('left').join());
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

test('the details window opens at the top with the focus on ✕, also when it is taller than the window', { skip }, async () => {
  for (const lang of ['en', 'he']) {
    const page = await open(lang, 400);
    await page.click('#grid .tile .slot');   // a real mouse click
    await page.waitFor(`document.getElementById('dlg').open`);
    await new Promise((r) => setTimeout(r, 300));
    const s = await page.eval(`(() => { const d = document.getElementById('dlg'), a = document.activeElement;
      return { tall: d.scrollHeight > d.clientHeight, top: d.scrollTop, focus: a.id, ring: a.matches(':focus-visible') }; })()`);
    assert.deepEqual(s, { tall: true, top: 0, focus: 'dlg-close', ring: false }, lang);
    assert.deepEqual(page.exceptions, []);
    await page.close();
  }
});

test('status strip: in every language the labels of a row are on one line, the numbers sit right above them', { skip }, async () => {
  for (const width of [400, 1200]) for (const lang of LANGS) {
    const page = await open(lang, width);
    const rows = await page.eval(`(() => { const rows = {};
      for (const s of document.querySelectorAll('.stat')) {
        const b = s.querySelector('b'), n = document.createRange(); n.selectNodeContents(b);
        const r = s.getBoundingClientRect(), t = n.getBoundingClientRect(), l = s.querySelector('span').getBoundingClientRect();
        (rows[Math.round(r.top)] ||= []).push([Math.round(l.top), Math.round(l.top - t.bottom)]);
      } return Object.values(rows); })()`);
    for (const row of rows) {
      assert.equal(new Set(row.map((x) => x[0])).size, 1, `${lang} ${width}: label tops ${JSON.stringify(row)}`);
      assert.ok(row.every((x) => x[1] >= 0 && x[1] <= 6), `${lang} ${width}: number to label ${JSON.stringify(row)}`);
    }
    await page.close();
  }
});

test('details window: each label is a small line right above its value', { skip }, async () => {
  for (const lang of ['en', 'he']) {
    const page = await open(lang, 1200);
    await page.eval(`CapeWatchPage.openDetail('aurora')`);
    await new Promise((r) => setTimeout(r, 200));
    const pairs = await page.eval(`[...document.querySelectorAll('#dlg-facts dt')].map((dt) => { const dd = dt.nextElementSibling, a = dt.getBoundingClientRect(), b = dd.getBoundingClientRect();
      return [Math.round(a.left - b.left), Math.round(b.top - a.bottom)]; })`);
    assert.ok(pairs.length >= 3, lang);
    for (const [dx, gap] of pairs) assert.ok(dx === 0 && gap >= 0 && gap <= 4, `${lang}: ${JSON.stringify(pairs)}`);
    await page.close();
  }
});

const WIKI = {
  'christmas-2010': 'https://minecraft.wiki/images/Christmas_2010_Cape_%28texture%29.png',
  'new-year-2011': 'https://minecraft.wiki/images/New_Years_2011_Cape_%28texture%29.png',
  'progress-pride': 'https://minecraft.wiki/images/Progress_Pride_Cape_%28texture%29_rv4.png'
};
test('Christmas 2010, New Year 2011 and Progress Pride: drawn from their wiki textures when shown; the footer credits the wiki', { skip }, async () => {
  assert.deepEqual(Object.keys(WIKI).filter((id) => DATA.capes[id]?.textureId), [], 'Mojang has no texture for them');
  const page = await open('en', 1200);
  await page.waitFor(`${JSON.stringify(Object.keys(WIKI))}.every((id) => document.querySelector('#grid .tile[data-cape="' + id + '"] img.gen'))`, 30000);
  assert.equal(await page.eval(`document.querySelectorAll('#grid .ph.shape').length`), 0, 'no plain outline any more');
  const wiki = [...new Set(page.requests.filter((u) => u.includes('minecraft.wiki')))].sort();
  assert.deepEqual(wiki, Object.values(WIKI).sort(), 'only these three files, from the images folder');
  await page.eval(`CapeWatchPage.openDetail('progress-pride')`);
  await page.waitFor(`document.querySelector('#dlg-slot img.gen')`);
  await page.eval(`document.getElementById('dlg').close()`);
  assert.equal(await page.eval(`document.getElementById('foot-tex').hidden`), false);
  assert.equal(await page.eval(`document.getElementById('foot-tex').textContent`), 'Cape textures © Mojang Studios, via the Minecraft Wiki');
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('#foot-tex a')].map((a) => a.href)`), ['https://minecraft.wiki/']);
  await page.click('#foot-tex a');
  assert.equal(await page.eval('__test.opened'), 'https://minecraft.wiki/', 'opens in the browser');
  assert.ok(!page.console.some((l) => /no texture, skipped (christmas-2010|new-year-2011|progress-pride)/.test(l)), 'the figure wears them too');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('the credit line in all 7 languages: © Mojang Studios and the link to the wiki, no other licence', { skip }, async () => {
  for (const lang of LANGS) {
    const page = await open(lang, 400);
    const r = await page.eval(`(() => { const e = document.getElementById('foot-tex'); return { text: e.textContent, links: [...e.querySelectorAll('a')].map((a) => a.textContent), shown: !e.hidden && e.getBoundingClientRect().height > 0 }; })()`);
    assert.ok(r.shown, lang);
    assert.deepEqual(r.links, ['Minecraft Wiki'], lang);
    assert.ok(r.text.includes('© Mojang Studios') && !/CC BY|\{\w+\}/.test(r.text), lang + ': ' + r.text);
    await page.close();
  }
});

test('a cape with no texture anywhere: the same plain cape outline with its name, also in its details window', { skip }, async () => {
  // made up: two capes with no texture on Mojang's server and none on the wiki
  const data = JSON.parse(JSON.stringify(DATA));
  for (const [id, name] of [['test-plain-one', 'Test Plain One Cape'], ['test-plain-two', 'Test Plain Two Cape']]) data.capes[id] = { ...DATA.capes.migrator, name, textureId: null };
  const none = Object.entries(data.capes).filter(([id, c]) => !c.textureId && !c.textureUrl && !WIKI[id]);
  assert.equal(none.length, 2);
  const page = await open('en', 1200, data);
  await page.waitFor(`document.querySelectorAll('#grid .ph.shape').length === ${none.length}`);
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('#grid .ph.shape .ph-name')].map((e) => e.textContent).sort()`), none.map(([, c]) => c.name).sort());
  assert.equal(await page.eval(`new Set([...document.querySelectorAll('#grid .ph.shape svg')].map((e) => e.outerHTML)).size`), 1, 'one outline for all');
  await page.eval(`CapeWatchPage.openDetail(${JSON.stringify(none[0][0])})`);
  assert.equal(await page.eval(`document.querySelector('#dlg-slot .ph-name')?.textContent`), none[0][1].name);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});
