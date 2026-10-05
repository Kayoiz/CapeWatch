// "Owned capes": a Minecraft player's capes by name, in the installed app. Runs the built page (app/dist) in
// headless Edge with the app faked (tests/lib/fake-tauri.mjs), Mojang included: made-up players, the real data file.
// Mojang only tells which cape a player is wearing: that one is found by itself, the rest are ticked in "Choose capes".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, EDGE } from '../lib/edge.mjs';
import { fakeTauri } from '../lib/fake-tauri.mjs';
import { testCape, testSkin } from '../lib/png.mjs';
import { FIND_PROBLEMS } from '../lib/layout-check.mjs';

const APP_PAGE = fileUrl(fileURLToPath(new URL('../../app/dist/index.html', import.meta.url)));
const WEB_PAGE = fileUrl(fileURLToPath(new URL('../../cape-radar.html', import.meta.url)));
const DATA = JSON.parse(readFileSync(new URL('../../data/capewatch.json', import.meta.url), 'utf8'));
const LANGS = ['en', 'he', 'es', 'pt', 'fr', 'de', 'ru'];
const SKIN = 'abc1230000000000000000000000000000000000000000000000000000000001';
const TEX = 'https://textures.minecraft.net/texture/';
const tex = (id) => DATA.capes[id].textureId;
const KAY = { id: '0123456789abcdef0123456789abcdef', name: 'Kayoiz', skin: SKIN, cape: tex('cherry-blossom') };
const MYSTERY = { id: 'fedcba9876543210fedcba9876543210', name: 'Mystery', skin: SKIN, cape: 'f'.repeat(64) };   // a cape the data file does not know
const PLAIN = { id: '00000000000000000000000000000abc', name: 'Plain', skin: SKIN };                            // wears no cape
const EVIL = { id: '11111111111111111111111111111111', name: 'Evil', answerName: '<img src=x onerror=window.__pwned=1>', skin: SKIN };
const PLAYERS = [KAY, MYSTERY, PLAIN, EVIL];
// Kayoiz as saved on this computer: wearing Cherry Blossom, Migrator and Christmas 2010 ticked by hand
const SAVED = JSON.stringify({ current: KAY.id, players: { [KAY.id]: { name: 'Kayoiz', skin: TEX + SKIN, worn: 'cherry-blossom', tex: {}, show: ['cherry-blossom', 'migrator', 'christmas-2010'], hide: [] } } });
const skip = !EDGE && 'Microsoft Edge not found';
let edge;
before(async () => { if (!skip) edge = await launch(); });
after(async () => { await edge?.close(); });

async function open({ lang = 'en', width = 1200, storage = {}, url = APP_PAGE, players = PLAYERS } = {}) {
  const page = await edge.newPage();
  await page.viewport(width, 900, 1);
  await page.route('https://textures.minecraft.net/texture/' + SKIN, () => ({ body: testSkin(), type: 'image/png' }));
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.block(['*mojang.com*']);   // the page itself never reaches Mojang: only through the app (faked here)
  // a fresh computer for every test; a reload keeps what was saved
  const seed = Object.entries({ 'caperadar:lang': lang, ...storage }).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ');
  await page.init(`try { if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); ${seed} sessionStorage.setItem('__seeded', '1'); } } catch {}`);
  if (url === APP_PAGE) await page.init(fakeTauri({ data: DATA, players }));
  await page.goto(url);
  if (url === APP_PAGE) await page.waitFor(`document.querySelectorAll('#grid .tile').length > 10`, 30000);
  await page.eval('document.fonts.ready.then(() => 1)');
  return page;
}
const lookUp = (page, name) => page.eval(`(() => { document.getElementById('o-name').value = ${JSON.stringify(name)}; document.getElementById('owned-form').requestSubmit(); })()`);
const settled = (page) => page.waitFor(`!document.getElementById('owned').hasAttribute('aria-busy')`);
const tiles = (page) => page.eval(`[...document.querySelectorAll('#owned .o-tile')].map((t) => t.dataset.owned + (t.querySelector('.pill.wearing') ? '*' : ''))`);
const text = (page, id) => page.eval(`document.getElementById(${JSON.stringify(id)}).textContent`);
const httpCalls = (page) => page.eval(`(__test.http || []).length`);

test('the web page (no app) has no "Owned capes": it cannot reach Mojang', { skip }, async () => {
  const page = await open({ url: WEB_PAGE });
  assert.equal(await page.eval(`document.getElementById('sec-owned').hidden`), true);
  assert.equal(await page.eval(`getComputedStyle(document.getElementById('sec-owned')).display`), 'none');
  await page.close();
});

test('first look: the skin name from Settings is in the box, a hint below, nothing looked up for the list yet', { skip }, async () => {
  const page = await open({ storage: { 'capewatch:settings': JSON.stringify({ skinName: 'Kayoiz' }) } });
  assert.equal(await page.eval(`document.getElementById('sec-owned').hidden`), false);
  assert.equal(await page.eval(`document.getElementById('o-name').value`), 'Kayoiz');
  assert.equal(await page.eval(`document.querySelector('#owned .empty').textContent`), 'Type a Minecraft name and press “Show capes”.');
  assert.equal(await page.eval(`document.getElementById('o-choose').disabled`), true, '"Choose capes" waits for a player');
  assert.equal(await page.eval(`localStorage.getItem('caperadar:owned')`), null);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('keyboard only: type a name, Enter; the cape being worn is listed; Tab to "Choose capes", tick one, Esc', { skip }, async () => {
  const page = await open();
  await page.click('#o-name');
  await page.type('kayoiz');
  await page.key('Enter');
  await page.waitFor(`document.querySelector('#owned .o-tile')`);
  await settled(page);
  assert.equal(await page.eval(`document.getElementById('o-name').value`), 'Kayoiz', 'the name as Mojang writes it');
  assert.deepEqual(await tiles(page), ['cherry-blossom*']);
  assert.equal(await text(page, 'o-msg'), 'Kayoiz is wearing the Cherry Blossom Cape.');
  await page.waitFor(`document.getElementById('o-live').textContent === 'Kayoiz is wearing the Cherry Blossom Cape.'`);   // said to screen readers
  await page.waitFor(`document.querySelector('#o-msg img.o-head')?.src.startsWith('data:image/png')`);              // the player's face
  assert.equal(await page.eval(`document.getElementById('o-choose').disabled`), false);
  // Tab: "Show capes", then "Choose capes"; Enter opens it with the search box ready
  await page.key('Tab'); assert.equal(await page.eval('document.activeElement.id'), 'o-show');
  await page.key('Tab'); assert.equal(await page.eval('document.activeElement.id'), 'o-choose');
  await page.key('Enter');
  await page.waitFor(`document.getElementById('pick').open`);
  assert.equal(await page.eval('document.activeElement.id'), 'pick-q');
  assert.equal(await text(page, 'pick-title'), 'Capes of Kayoiz');
  await page.type('migr');
  await page.waitFor(`[...document.querySelectorAll('#pick-list input')].map((i) => i.value).join() === 'migrator'`);
  await page.key('Tab');
  assert.equal(await page.eval('document.activeElement.value'), 'migrator');
  await page.key(' ');
  assert.equal(await page.eval('document.activeElement.checked'), true);
  await page.key('Escape');
  await page.waitFor(`!document.getElementById('pick').open`);
  assert.equal(await page.eval('document.activeElement.id'), 'o-choose', 'the focus comes back to the button');
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 2`);   // the list is drawn again once the window has closed
  assert.deepEqual(await tiles(page), ['cherry-blossom*', 'migrator'], 'the cape being worn first');
  // kept on this computer
  await page.reload();
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 2`, 20000);
  assert.deepEqual(await tiles(page), ['cherry-blossom*', 'migrator']);
  assert.equal(await page.eval(`document.getElementById('o-name').value`), 'Kayoiz');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('a cape taken off the list stays off; at the next start a newly worn cape joins with "Wearing now"', { skip }, async () => {
  const page = await open({ storage: { 'caperadar:owned': SAVED } });
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 3`, 20000);
  assert.deepEqual(await tiles(page), ['cherry-blossom*', 'migrator', 'christmas-2010']);
  await page.click('#o-choose');
  await page.waitFor(`document.getElementById('pick').open`);
  await page.click('#pick-list input[value="cherry-blossom"]');
  await page.click('#pick-done');
  await page.waitFor(`!document.getElementById('pick').open && document.querySelectorAll('#owned .o-tile').length === 2`);
  assert.deepEqual(await tiles(page), ['migrator', 'christmas-2010']);
  assert.equal(await text(page, 'o-msg'), 'Kayoiz is wearing the Cherry Blossom Cape.', 'still says what is worn');
  // Kayoiz now wears the Vanilla Cape; CapeWatch starts again and checks the player once
  await page.eval(`sessionStorage.setItem('__players', ${JSON.stringify(JSON.stringify([{ ...KAY, cape: tex('vanilla') }]))})`);
  await page.reload();
  await page.waitFor(`document.querySelector('#owned [data-owned="vanilla"] .pill.wearing')`, 20000);
  assert.deepEqual(await tiles(page), ['vanilla*', 'migrator', 'christmas-2010'], 'Cherry Blossom did not come back by itself');
  assert.equal(await text(page, 'o-msg'), 'Kayoiz is wearing the Vanilla Cape.');
  assert.equal(await text(page, 'o-note'), '', 'the check at start shows no message of its own');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('a cape the data file does not know: "Unknown cape" with its own picture, also in "Choose capes"', { skip }, async () => {
  const page = await open();
  await lookUp(page, 'Mystery');
  await page.waitFor(`document.querySelector('#owned .o-tile')`);
  await settled(page);
  assert.deepEqual(await tiles(page), ['tex:' + 'f'.repeat(64) + '*']);
  assert.equal(await page.eval(`document.querySelector('#owned .o-name').textContent`), 'Unknown cape');
  assert.equal(await text(page, 'o-msg'), 'Mystery is wearing a cape CapeWatch doesn’t know yet.');
  await page.waitFor(`document.querySelector('#owned [data-owned^="tex:"] img.gen')`, 20000);   // drawn from Mojang's texture
  await page.click('#o-choose');
  await page.waitFor(`document.getElementById('pick').open`);
  const first = await page.eval(`(() => { const r = document.querySelector('#pick-list li'); return [r.dataset.pick, r.querySelector('input').checked, r.textContent]; })()`);
  assert.equal(first[0], 'tex:' + 'f'.repeat(64));
  assert.equal(first[1], true);
  assert.match(first[2], /Unknown cape.*Wearing now/);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('a wrong name, no such player, no internet, too many lookups: a clear message, and the list shown before stays', { skip }, async () => {
  const page = await open();
  await lookUp(page, 'Kayoiz');
  await page.waitFor(`document.querySelector('#owned .o-tile')`); await settled(page);
  const before = await httpCalls(page);
  await lookUp(page, 'a b'); await settled(page);
  assert.equal(await text(page, 'o-note'), 'A Minecraft name has up to 16 letters, numbers or _.');
  assert.equal(await page.eval(`document.getElementById('o-name').getAttribute('aria-invalid')`), 'true');
  assert.equal(await httpCalls(page), before, 'nothing was sent');
  await page.click('#o-name'); await page.type('x');   // a correction clears the error
  await page.waitFor(`document.getElementById('o-note').textContent === '' && !document.getElementById('o-name').hasAttribute('aria-invalid')`);
  await lookUp(page, 'nobody_here'); await settled(page);
  assert.equal(await text(page, 'o-note'), 'There’s no Minecraft player called nobody_here.');
  assert.equal(await page.eval(`document.getElementById('o-note').classList.contains('bad')`), true);
  assert.equal(await page.eval(`getComputedStyle(document.querySelector('#o-note .o-text'), '::before').content`), '"\u26A0\uFE0E\u00A0"', 'a warning sign, not only a colour');
  assert.deepEqual(await tiles(page), ['cherry-blossom*'], 'Kayoiz\'s list is still there');
  assert.equal(await text(page, 'o-msg'), 'Kayoiz is wearing the Cherry Blossom Cape.', 'and whose list it is');
  await page.waitFor(`document.getElementById('o-live').textContent === 'There’s no Minecraft player called nobody_here.'`);
  await page.eval(`__test.cfg.players = 'offline'`);
  await lookUp(page, 'Plain'); await settled(page);
  assert.equal(await text(page, 'o-note'), 'Can’t reach Mojang right now. Try again in a moment.');
  await page.eval(`__test.cfg.players = 'rate'`);
  await lookUp(page, 'Mystery'); await settled(page);
  assert.equal(await text(page, 'o-note'), 'Too many lookups for now. Try again in a minute.');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('a player who wears no cape, and "Show capes" pressed twice quickly: one lookup', { skip }, async () => {
  const page = await open();
  await page.eval(`(() => { const i = document.getElementById('o-name'), f = document.getElementById('owned-form'); i.value = 'Plain'; f.requestSubmit(); f.requestSubmit(); })()`);
  await page.waitFor(`document.querySelector('#owned .empty')?.textContent.includes('Plain')`); await settled(page);
  assert.equal(await httpCalls(page), 2, 'one request for the id, one for the cape: once');
  assert.equal(await text(page, 'o-msg'), 'Plain isn’t wearing a cape right now.');
  assert.equal(await page.eval(`document.querySelector('#owned .empty').textContent`), 'Nothing to show yet. Use “Choose capes” to add the capes Plain owns.');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('an odd answer from Mojang cannot put anything but text on the page', { skip }, async () => {
  const page = await open();
  await lookUp(page, 'Evil');
  await page.waitFor(`document.getElementById('o-msg').textContent.length > 0`); await settled(page);
  assert.equal(await text(page, 'o-msg'), 'Evil isn’t wearing a cape right now.', 'the name typed, not the odd one');
  assert.equal(await page.eval(`document.querySelectorAll('img[src="x"], [onerror]').length`), 0);
  assert.equal(await page.eval(`window.__pwned ?? null`), null);
  await page.close();
});

test('"Show capes" right at start: not held up by the check of the saved player, and that check never switches back', { skip }, async () => {
  const page = await open({ storage: { 'caperadar:owned': SAVED }, players: [{ ...KAY, hold: true }, PLAIN] });   // Mojang holds its answer about Kayoiz
  await page.waitFor(`(__test.http || []).some((u) => u.endsWith('${KAY.id}'))`, 15000);   // the check of Kayoiz has gone out...
  await lookUp(page, 'Plain');                                                              // ...and a name is looked up meanwhile
  await page.waitFor(`document.getElementById('o-msg').textContent === 'Plain isn’t wearing a cape right now.'`);
  assert.equal(await page.eval(`(__test.httpDone || []).some((u) => u.endsWith('${KAY.id}'))`), false, 'answered before the check');
  await page.eval(`__test.release()`);                                                       // now Mojang answers the check
  await page.waitFor(`(__test.httpDone || []).some((u) => u.endsWith('${KAY.id}'))`, 10000);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await text(page, 'o-msg'), 'Plain isn’t wearing a cape right now.', 'still the player asked for');
  assert.equal(await page.eval(`document.getElementById('o-name').value`), 'Plain');
  assert.equal(await page.eval(`JSON.parse(localStorage.getItem('caperadar:owned')).current`), PLAIN.id);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('the saved player changed their name, and someone else took the old one: checked by id, the list stays theirs', { skip }, async () => {
  const thief = { id: '22222222222222222222222222222222', name: 'Kayoiz', skin: SKIN, cape: tex('vanilla') };
  const page = await open({ storage: { 'caperadar:owned': SAVED }, players: [{ ...KAY, name: 'Kayoiz_2' }, thief] });
  await page.waitFor(`document.getElementById('o-msg').textContent.startsWith('Kayoiz_2')`, 20000);
  assert.equal(await text(page, 'o-msg'), 'Kayoiz_2 is wearing the Cherry Blossom Cape.');
  assert.equal(await page.eval(`document.getElementById('o-name').value`), 'Kayoiz_2', 'the name box follows the new name');
  assert.deepEqual(await tiles(page), ['cherry-blossom*', 'migrator', 'christmas-2010']);
  assert.equal(await page.eval(`(__test.http || []).filter((u) => u.includes('/users/profiles/')).length`), 0, 'never looked up by the old name');
  await page.close();
});

test('at most 100 players are kept on this computer: the one looked at longest ago goes first', { skip }, async () => {
  const many = { current: KAY.id, players: JSON.parse(SAVED).players };
  many.players[KAY.id].at = 50;
  for (let i = 1; i < 100; i++) many.players[String(i).padStart(32, '0')] = { name: 'P' + i, skin: null, worn: null, tex: {}, show: [], hide: [], at: i === 1 ? 1 : 100 + i };
  const page = await open({ storage: { 'caperadar:owned': JSON.stringify(many) } });
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 3`, 20000);
  await lookUp(page, 'Plain');
  await page.waitFor(`document.getElementById('o-msg').textContent.startsWith('Plain')`);
  const kept = await page.eval(`Object.keys(JSON.parse(localStorage.getItem('caperadar:owned')).players)`);
  assert.equal(kept.length, 100);
  assert.ok(!kept.includes(String(1).padStart(32, '0')), 'the oldest one went');
  assert.ok(kept.includes(PLAIN.id) && kept.includes(KAY.id));
  await page.close();
});

test('"Choose capes" search with no match says so', { skip }, async () => {
  const page = await open({ storage: { 'caperadar:owned': SAVED } });
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 3`, 20000);
  await page.click('#o-choose');
  await page.waitFor(`document.getElementById('pick').open`);
  await page.type('zzzz');
  await page.waitFor(`document.querySelector('#pick-list .pick-none')?.textContent === 'No cape matches that name.'`);
  await page.key('Escape');
  await page.close();
});

test('7 languages at 400 and 1200 px: nothing in "Owned capes" or "Choose capes" is cut off or sticks out', { skip }, async () => {
  const problems = [];
  for (const width of [400, 1200]) for (const lang of LANGS) {
    const page = await open({ lang, width, storage: { 'caperadar:owned': SAVED } });
    await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 3`, 20000);
    await page.waitFor(`(__test.httpDone || []).some((u) => u.endsWith('${KAY.id}'))`, 15000); await settled(page);   // the check at start is done
    // the rest of the page is checked in display.test.mjs
    problems.push(...(await page.eval(FIND_PROBLEMS)).filter((p) => /[.#]o-|pick|owned|wearing/.test(p)).map((p) => `${lang} ${width} page: ${p}`));
    await page.click('#o-choose');
    await page.waitFor(`document.getElementById('pick').open`);
    await new Promise((r) => setTimeout(r, 300));
    problems.push(...(await page.eval(FIND_PROBLEMS)).map((p) => `${lang} ${width} choose: ${p}`));
    assert.deepEqual(page.exceptions, [], lang + ' ' + width);
    await page.close();
  }
  assert.deepEqual(problems, []);
});
