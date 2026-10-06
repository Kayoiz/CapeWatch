// Accessibility, the basis of the accessibility statement: axe-core (tests/lib/axe, Deque, MPL-2.0) finds nothing
// against WCAG 2.0, 2.1 and 2.2 levels A and AA, on the page and in every window (details, settings, "Choose capes",
// the statement itself), in English and Hebrew, in the light and the dark theme, in a wide and a narrow window.
// And the statement window: opened from the footer, by keyboard too, in all 7 languages, nothing cut off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, EDGE } from '../lib/edge.mjs';
import { fakeTauri } from '../lib/fake-tauri.mjs';
import { testCape, testSkin } from '../lib/png.mjs';
import { FIND_PROBLEMS } from '../lib/layout-check.mjs';

const PAGE = fileUrl(fileURLToPath(new URL('../../app/dist/index.html', import.meta.url)));
const AXE = readFileSync(new URL('../lib/axe/axe.min.js', import.meta.url), 'utf8');
const DATA = JSON.parse(readFileSync(new URL('../../data/capewatch.json', import.meta.url), 'utf8'));
const LANGS = ['en', 'he', 'es', 'pt', 'fr', 'de', 'ru'];
const SKIN = 'abc1230000000000000000000000000000000000000000000000000000000001';
const KAY = { id: '0123456789abcdef0123456789abcdef', name: 'Kayoiz', skin: SKIN, cape: DATA.capes['cherry-blossom'].textureId, seen: ['migrator', 'vanilla'] };
const SAVED = JSON.stringify({ current: KAY.id, players: { [KAY.id]: { name: 'Kayoiz', skin: 'https://textures.minecraft.net/texture/' + SKIN, worn: 'cherry-blossom', tex: {}, show: ['cherry-blossom', 'migrator'], hide: [], seen: 'found' } } });
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const skip = !EDGE && 'Microsoft Edge not found';
let edge;
before(async () => { if (!skip) edge = await launch(); });
after(async () => { await edge?.close(); });

async function open(lang, width, theme = 'dark') {
  const page = await edge.newPage();
  await page.viewport(width, 900, 1);
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await page.route('https://textures.minecraft.net/texture/' + SKIN, () => ({ body: testSkin(), type: 'image/png' }));
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.route('https://minecraft.wiki/images/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.block(['*mojang.com*', '*capes.me*']);
  await page.init(`try { if (!sessionStorage.getItem('__s')) { localStorage.clear(); localStorage.setItem('caperadar:lang', '${lang}'); localStorage.setItem('caperadar:owned', ${JSON.stringify(SAVED)}); sessionStorage.setItem('__s', '1'); } } catch {}`);
  await page.init(fakeTauri({ data: DATA, players: [KAY] }));
  await page.goto(PAGE);
  await page.waitFor(`document.querySelectorAll('#grid .tile img.gen').length > 10`, 60000);
  await page.waitFor(`(__test.httpDone || []).includes('https://capes.me/api/user/${KAY.id}')`, 20000);   // "Owned capes" filled
  await page.eval('document.fonts.ready.then(() => 1)');
  await new Promise((r) => setTimeout(r, 600));
  await page.eval(AXE);
  return page;
}
// a window's name for screen readers (WCAG 4.1.2): from aria-label or the elements aria-labelledby points to
const dialogName = (page, id) => page.eval(`(() => { const d = document.getElementById('${id}'); if (!d?.open) return '';
  return d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') || '').split(' ').map((x) => document.getElementById(x)?.textContent || '').join(' ').trim(); })()`);
const axe = (page, context) => page.eval(`axe.run(${context}, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] })
  .then((r) => r.violations.flatMap((v) => v.nodes.map((n) => v.id + ' (' + v.impact + '): ' + n.target.join(' '))))`);

for (const [lang, width, theme] of [['en', 1200, 'dark'], ['en', 1200, 'light'], ['he', 1200, 'light'], ['he', 400, 'dark'], ['en', 400, 'light']]) {
  test(`${lang} ${width} px ${theme}: no WCAG A/AA problem on the page or in any window`, { skip }, async () => {
    const page = await open(lang, width, theme);
    const found = [];
    found.push(...(await axe(page, 'document')).map((x) => 'page: ' + x));
    await page.eval(`CapeWatchPage.openDetail('aurora')`); await page.waitFor(`document.getElementById('dlg').open`); await new Promise((r) => setTimeout(r, 300));
    found.push(...(await axe(page, `document.getElementById('dlg')`)).map((x) => 'details: ' + x));
    if (!(await dialogName(page, 'dlg'))) found.push('details: the window has no name');
    await page.eval(`document.getElementById('dlg').close()`);
    await page.click('#cw-open-settings'); await page.waitFor(`document.getElementById('cw-settings')?.open`); await new Promise((r) => setTimeout(r, 300));
    found.push(...(await axe(page, `document.getElementById('cw-settings')`)).map((x) => 'settings: ' + x));
    if (!(await dialogName(page, 'cw-settings'))) found.push('settings: the window has no name');
    await page.click('#cw-settings [value=delete]');                                   // the question "Delete my data?"
    found.push(...(await axe(page, `document.getElementById('cw-settings')`)).map((x) => 'settings, delete: ' + x));
    await page.eval(`document.getElementById('cw-settings').close()`);
    await page.eval(`document.getElementById('o-choose').click()`); await page.waitFor(`document.getElementById('pick').open`); await new Promise((r) => setTimeout(r, 300));
    found.push(...(await axe(page, `document.getElementById('pick')`)).map((x) => 'choose capes: ' + x));
    if (!(await dialogName(page, 'pick'))) found.push('choose capes: the window has no name');
    await page.eval(`document.getElementById('pick').close()`);
    await page.eval(`document.getElementById('a11y-open').click()`);
    await page.waitFor(`document.getElementById('a11y').open`); await new Promise((r) => setTimeout(r, 300));
    found.push(...(await axe(page, `document.getElementById('a11y')`)).map((x) => 'statement: ' + x));
    if (!(await dialogName(page, 'a11y'))) found.push('statement: the window has no name');
    assert.deepEqual(found, []);
    assert.deepEqual(page.exceptions, []);
    await page.close();
  });
}

test('the accessibility statement: from the footer by keyboard, opens at its top on ✕, Esc closes it and the focus comes back', { skip }, async () => {
  const page = await open('en', 1200);
  await page.eval(`document.getElementById('a11y-open').focus()`);
  await page.key('Enter');
  await page.waitFor(`document.getElementById('a11y').open`);
  assert.equal(await page.eval('document.activeElement.id'), 'a11y-close');
  assert.equal(await page.eval(`document.getElementById('a11y').scrollTop`), 0);
  assert.equal(await page.eval(`document.getElementById('a11y-title').textContent`), 'Accessibility statement');
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('#a11y a')].map((a) => a.href)`), ['mailto:kayoiz.dev@gmail.com']);
  assert.match(await page.eval(`document.getElementById('a11y').textContent`), /WCAG 2\.1.*IS 5568.*keyboard.*screen readers.*Known limits.*kayoiz\.dev@gmail\.com.*October 2026/s);
  await page.key('Escape');
  await page.waitFor(`!document.getElementById('a11y').open`);
  assert.equal(await page.eval('document.activeElement.id'), 'a11y-open');
  await page.close();
});

test('the statement in all 7 languages at 400 px: every text there, Hebrew right to left, nothing cut off or sticking out', { skip }, async () => {
  const problems = [];
  for (const lang of LANGS) {
    const page = await open(lang, 400);
    await page.click('#a11y-open');
    await page.waitFor(`document.getElementById('a11y').open`);
    const empty = await page.eval(`[...document.querySelectorAll('#a11y [data-i18n], #a11y-contact')].filter((e) => !e.textContent.trim()).map((e) => e.dataset.i18n || e.id)`);
    assert.deepEqual(empty, [], lang + ': texts missing');
    if (lang === 'he') assert.equal(await page.eval(`document.querySelector('#a11y [data-i18n=a11yIntro]').dir`), 'rtl');
    problems.push(...(await page.eval(FIND_PROBLEMS)).map((p) => lang + ': ' + p));
    await page.close();
  }
  assert.deepEqual(problems, []);
});
