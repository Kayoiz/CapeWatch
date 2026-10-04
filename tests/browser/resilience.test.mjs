// Task 4 on the real page (headless Edge): textures that do not load, a data file with odd values, no internet.
// The page must keep working and show what it has.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, EDGE } from '../lib/edge.mjs';
import { fakeTauri } from '../lib/fake-tauri.mjs';
import { sampleData, ev } from '../lib/shell-sandbox.mjs';

const PAGE = fileUrl(fileURLToPath(new URL('../../app/dist/index.html', import.meta.url)));
const skip = !EDGE && 'Microsoft Edge not found';
let edge;
before(async () => { if (!skip) edge = await launch(); });
after(async () => { await edge?.close(); });

async function open(cfg, { setup = '', block = ['*textures.minecraft.net*', '*mojang.com*'] } = {}) {
  const page = await edge.newPage();
  await page.block(block);
  // every test starts with empty storage (all pages of file:// share one), kept across its own reloads
  await page.init(`try { if (!sessionStorage.getItem('__fresh')) { localStorage.clear(); sessionStorage.setItem('__fresh', '1'); } } catch {}`);
  if (setup) await page.init(setup);
  await page.init(fakeTauri(cfg));
  await page.goto(PAGE);
  return page;
}
const withTextures = () => {
  const d = sampleData();
  d.capes['test-alpha'].textureId = 'aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000';
  d.capes['test-beta'].textureId = 'bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000';
  return d;
};

test('textures cannot be loaded: every card shows the cape name instead of a picture, nothing breaks', { skip }, async () => {
  const page = await open({ data: withTextures() });
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  await page.waitFor(`(window.__test.logs.join('\\n').match(/pictures: .* failed/g) || []).length >= 2`, 20000);
  const ph = await page.eval(`[...document.querySelectorAll('#grid .tile .slot .ph')].map(e => e.textContent).sort()`);
  assert.deepEqual(ph, ['Test Alpha Cape', 'Test Beta Cape']);
  assert.deepEqual(page.exceptions, []);
  // the details still open
  const first = await page.eval(`document.querySelector('#grid .tile-name').textContent`);
  await page.click('#grid .tile .slot');
  assert.equal(await page.eval(`document.getElementById('dlg').open && document.getElementById('dlg-title').textContent`), first);
  await page.close();
});

test('a data file with odd values: the page draws the good parts, sorting and filters still work', { skip }, async () => {
  const data = sampleData({ events: { bad: null, good: ev('test-beta', 'new', new Date().toISOString()) } });
  data.capes.broken = null;
  data.capes['odd-types'] = { name: 'Odd Types Cape', releaseDate: 2024, editions: 'java', availableUntil: { x: 1 }, availability: 'something-new', obtainEn: ['a'] };
  const page = await open({ data });
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 3`);
  for (const v of ['name', 'old', 'new']) {
    await page.eval(`(() => { const s = document.getElementById('f-sort'); s.value = '${v}'; s.dispatchEvent(new Event('change')); })()`);
    assert.equal(await page.eval(`document.querySelectorAll('#grid .tile').length`), 3, 'sort ' + v);
  }
  await page.eval(`(() => { const s = document.getElementById('f-ed'); s.value = 'java-only'; s.dispatchEvent(new Event('change')); })()`);
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('#grid .tile-name')].map(e => e.textContent).sort()`), ['Odd Types Cape', 'Test Beta Cape']);
  await page.eval(`(() => { const s = document.getElementById('f-ed'); s.value = 'all'; s.dispatchEvent(new Event('change')); })()`);
  await page.eval(`(() => { const s = document.getElementById('f-sort'); s.value = 'new'; s.dispatchEvent(new Event('change')); })()`);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('no internet, with a saved copy: the saved capes are shown', { skip }, async () => {
  const setup = `try { if (!localStorage.getItem('capewatch:data')) localStorage.setItem('capewatch:data', ${JSON.stringify(JSON.stringify(sampleData()))}); } catch {}`;
  const page = await open({ mode: 'offline' }, { setup });
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  assert.ok((await page.eval('__test.logs')).some((l) => /showing the saved copy/.test(l)));
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('no internet on the very first start: the page says it is loading, and fills in when the connection is back', { skip }, async () => {
  const page = await open({ mode: 'offline', data: sampleData() });
  await page.waitFor(`document.querySelector('#live .empty')?.textContent.length > 0`);
  assert.equal(await page.eval(`document.querySelectorAll('#grid .tile').length`), 0);
  await page.eval(`__test.cfg.mode = 'ok'; dispatchEvent(new Event('online'))`);
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('no announced cape: the "Announced" heading is not shown (it used to stay as an empty heading)', { skip }, async () => {
  const page = await open({ data: sampleData() });   // the sample capes are ended and available, none announced
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  assert.equal(await page.eval(`document.getElementById('sec-ann').hidden`), true);
  assert.equal(await page.eval(`getComputedStyle(document.getElementById('sec-ann')).display`), 'none');
  await page.close();
});
