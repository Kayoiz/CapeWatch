// "Owned capes": a Minecraft player's capes by name, in the installed app. Runs the built page (app/dist) in
// headless Edge with the app faked (tests/lib/fake-tauri.mjs), Mojang and capes.me included: made-up players, the
// real data file. Mojang only tells which cape a player is wearing and capes.me which capes it has seen them wear,
// and CapeWatch keeps its own record of every cape it sees on the player at its checks (at start, every 10 minutes,
// when the window opens): those join the list by themselves, the rest are ticked in "Choose capes".
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
// What capes.me has seen on Kayoiz (made up): a cape the data file does not know, Minecon 2011 (capes.me knows it
// by an older texture, the data file's one is its alternative) and the Vanilla Cape, taken off the account since.
const KAY_SEEN = { ...KAY, seen: ['cherry-blossom', 'migrator', '15th-anniversary', 'not-in-data', 'minecon-2011', { type: 'vanilla', removed: true }] };
const NEW_TEX = 'tex:' + 'e'.repeat(64);
// the list then: the cape being worn first, then the newest first (one the data file does not know has no date)
const KAY_LIST = ['cherry-blossom*', '15th-anniversary', 'migrator', 'minecon-2011', NEW_TEX];
const CAPES_ME_USER = (p) => 'https://capes.me/api/user/' + p.id;
const UNKNOWN_KAY = 'capes.me has no record of Kayoiz yet. While CapeWatch runs, it checks the cape they wear every 10 minutes and adds each one it sees; add the rest with “Choose capes”.';
// Kayoiz as saved on this computer: wearing Cherry Blossom, Migrator and Christmas 2010 ticked by hand
const SAVED = JSON.stringify({ current: KAY.id, players: { [KAY.id]: { name: 'Kayoiz', skin: TEX + SKIN, worn: 'cherry-blossom', tex: {}, show: ['cherry-blossom', 'migrator', 'christmas-2010'], hide: [] } } });
const skip = !EDGE && 'Microsoft Edge not found';
let edge;
before(async () => { if (!skip) edge = await launch(); });
after(async () => { await edge?.close(); });

async function open({ lang = 'en', width = 1200, storage = {}, url = APP_PAGE, players = PLAYERS, capesMe = 'ok' } = {}) {
  const page = await edge.newPage();
  await page.viewport(width, 900, 1);
  await page.route('https://textures.minecraft.net/texture/' + SKIN, () => ({ body: testSkin(), type: 'image/png' }));
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.route('https://minecraft.wiki/images/*', () => ({ body: testCape(), type: 'image/png' }));   // the three wiki textures, answered by the test
  await page.block(['*mojang.com*', '*capes.me*']);   // the page itself never reaches Mojang or capes.me: only through the app (faked here)
  // a fresh computer for every test; a reload keeps what was saved
  const seed = Object.entries({ 'caperadar:lang': lang, ...storage }).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ');
  await page.init(`try { if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); ${seed} sessionStorage.setItem('__seeded', '1'); } } catch {}`);
  if (url === APP_PAGE) await page.init(fakeTauri({ data: DATA, players, capesMe }));
  // the page's timers (the check every 10 minutes is run by hand) and its clock (__later(ms) moves it on)
  await page.init(`(() => { const si = window.setInterval.bind(window), now = Date.now.bind(Date); let shift = 0;
    window.__intervals = []; window.setInterval = (fn, ms, ...a) => { window.__intervals.push({ fn, ms }); return si(fn, ms, ...a); };
    Date.now = () => now() + shift; window.__later = (ms) => { shift += ms; }; })()`);
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
const answered = (page, u, ms = 15000) => page.waitFor(`(__test.httpDone || []).includes(${JSON.stringify(u)})`, ms);

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
  assert.equal(await text(page, 'o-src'), 'capes.me has no record of Kayoiz yet. While CapeWatch runs, it checks the cape they wear every 10 minutes and adds each one it sees; add the rest with “Choose capes”.');
  await page.waitFor(`document.getElementById('o-live').textContent === 'Kayoiz is wearing the Cherry Blossom Cape. capes.me has no record of Kayoiz yet. While CapeWatch runs, it checks the cape they wear every 10 minutes and adds each one it sees; add the rest with “Choose capes”.'`);   // said to screen readers
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
  assert.deepEqual(await page.eval(`__test.http.map((u) => new URL(u).host)`), ['api.mojang.com', 'sessionserver.mojang.com', 'capes.me', 'capes.me'],
    'Mojang: one request for the id, one for the cape; capes.me: the player and its list of capes; once');
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
  await answered(page, CAPES_ME_USER(KAY), 10000);                                            // ...and capes.me after it
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
    const page = await open({ lang, width, storage: { 'caperadar:owned': SAVED }, players: [KAY_SEEN] });
    await answered(page, CAPES_ME_USER(KAY)); await settled(page);   // the check at start is done:
    await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 6 && document.querySelector('#o-src a')`);   // 3 more capes seen, and the line under the list
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

test('the capes capes.me has seen join the list by themselves; the line under it says so and links to the player there', { skip }, async () => {
  const page = await open({ players: [KAY_SEEN] });
  await lookUp(page, 'Kayoiz');
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length > 1`); await settled(page);
  assert.deepEqual(await tiles(page), KAY_LIST, 'the Vanilla Cape was taken off the account: not listed');
  assert.equal(await page.eval(`document.querySelector('#owned [data-owned="${NEW_TEX}"] .o-name').textContent`), 'Unknown cape');
  await page.waitFor(`document.querySelector('#owned [data-owned="${NEW_TEX}"] img.gen')`, 20000);   // drawn from Mojang's texture
  assert.equal(await text(page, 'o-msg'), 'Kayoiz is wearing the Cherry Blossom Cape.');
  assert.equal(await text(page, 'o-src'), 'Capes Kayoiz wore before come from capes.me and from CapeWatch’s own checks.');
  await page.waitFor(`document.getElementById('o-live').textContent === 'Kayoiz is wearing the Cherry Blossom Cape. Capes Kayoiz wore before come from capes.me and from CapeWatch’s own checks.'`);
  assert.equal(await page.eval(`document.querySelector('#o-src a').href`), 'https://capes.me/Kayoiz');
  await page.click('#o-src a');
  assert.equal(await page.eval('__test.opened'), 'https://capes.me/Kayoiz', 'opens in the browser, not in CapeWatch');
  // what was sent, and to whom: the name to Mojang, the player's id to capes.me (saying who asks), nothing else
  assert.deepEqual(await page.eval(`__test.http`), ['https://api.mojang.com/users/profiles/minecraft/Kayoiz', 'https://sessionserver.mojang.com/session/minecraft/profile/' + KAY.id,
    CAPES_ME_USER(KAY), 'https://capes.me/api/capes']);
  assert.ok(await page.eval(`__test.httpOpts.filter((o) => o.url.includes('capes.me')).every((o) => o.headers?.['User-Agent'] === 'CapeWatch (+https://github.com/Kayoiz/CapeWatch)')`));
  // kept on this computer, and shown at the next start
  await page.reload();
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === ${KAY_LIST.length}`, 20000);
  assert.deepEqual(await tiles(page), KAY_LIST);
  assert.equal(await text(page, 'o-src'), 'Capes Kayoiz wore before come from capes.me and from CapeWatch’s own checks.');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('a cape capes.me has seen, taken off the list by hand, stays off: after the next lookup and the next start', { skip }, async () => {
  const page = await open({ players: [KAY_SEEN] });
  await lookUp(page, 'Kayoiz');
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === ${KAY_LIST.length}`); await settled(page);
  await page.click('#o-choose');
  await page.waitFor(`document.getElementById('pick').open`);
  await page.click('#pick-list input[value="migrator"]');
  await page.click('#pick-done');
  const without = KAY_LIST.filter((k) => k !== 'migrator');
  await page.waitFor(`!document.getElementById('pick').open && document.querySelectorAll('#owned .o-tile').length === ${without.length}`);
  await lookUp(page, 'Kayoiz'); await settled(page);
  assert.deepEqual(await tiles(page), without);
  await page.reload();
  await answered(page, CAPES_ME_USER(KAY)); await settled(page);   // the check at start asked capes.me again
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(await tiles(page), without);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('capes.me has no record of the player, or does not answer: the cape being worn is listed, and the line says why others may be missing', { skip }, async () => {
  const page = await open();
  await lookUp(page, 'Plain'); await settled(page);
  assert.equal(await text(page, 'o-src'), 'capes.me has no record of Plain yet. While CapeWatch runs, it checks the cape they wear every 10 minutes and adds each one it sees; add the rest with “Choose capes”.');
  assert.equal(await page.eval(`document.querySelector('#owned .empty').textContent`), 'Nothing to show yet. Use “Choose capes” to add the capes Plain owns.');
  await page.eval(`__test.cfg.capesMe = 'offline'`);
  await lookUp(page, 'Kayoiz'); await settled(page);
  assert.deepEqual(await tiles(page), ['cherry-blossom*'], 'what Mojang said is shown all the same');
  assert.equal(await text(page, 'o-msg'), 'Kayoiz is wearing the Cherry Blossom Cape.');
  assert.equal(await text(page, 'o-note'), '', 'not an error: the lookup worked');
  assert.equal(await text(page, 'o-src'), 'capes.me didn’t answer, so capes worn before may be missing. Try again later.');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('"Choose capes" lists every cape seen on the player that the data file does not know, the one being worn first', { skip }, async () => {
  const page = await open({ players: [{ ...MYSTERY, seen: ['not-in-data', 'migrator'] }] });
  await lookUp(page, 'Mystery');
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 3`); await settled(page);
  assert.deepEqual(await tiles(page), ['tex:' + 'f'.repeat(64) + '*', 'migrator', NEW_TEX]);
  await page.click('#o-choose');
  await page.waitFor(`document.getElementById('pick').open`);
  const rows = await page.eval(`[...document.querySelectorAll('#pick-list li')].slice(0, 2).map((r) => [r.dataset.pick, r.querySelector('input').checked, r.textContent])`);
  assert.deepEqual(rows.map((r) => r.slice(0, 2)), [['tex:' + 'f'.repeat(64), true], [NEW_TEX, true]]);
  assert.match(rows[0][2], /Unknown cape.*Wearing now/);
  await page.click(`#pick-list input[value="${NEW_TEX}"]`);   // taken off, still in the window to tick again
  await page.click('#pick-done');
  await page.waitFor(`!document.getElementById('pick').open && document.querySelectorAll('#owned .o-tile').length === 2`);
  await page.click('#o-choose');
  await page.waitFor(`document.getElementById('pick').open`);
  assert.equal(await page.eval(`document.querySelector('#pick-list input[value="${NEW_TEX}"]')?.checked`), false);
  await page.key('Escape');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('the check at start asks capes.me again: a cape it has seen since joins; when it does not answer, the line keeps what it said before', { skip }, async () => {
  const saved = JSON.parse(SAVED); saved.players[KAY.id].seen = 'found';
  const page = await open({ storage: { 'caperadar:owned': JSON.stringify(saved) }, players: [{ ...KAY, seen: ['cherry-blossom', 'migrator', 'mojang-office'] }] });
  await page.waitFor(`document.querySelector('#owned [data-owned="mojang-office"]')`, 20000);
  assert.deepEqual(await tiles(page), ['cherry-blossom*', 'mojang-office', 'migrator', 'christmas-2010']);
  assert.equal(await text(page, 'o-src'), 'Capes Kayoiz wore before come from capes.me and from CapeWatch’s own checks.');
  assert.equal(await text(page, 'o-note'), '', 'no message of its own');
  await page.eval(`sessionStorage.setItem('__capesMe', 'offline')`);   // the next start: capes.me does not answer
  await page.reload();
  await answered(page, CAPES_ME_USER(KAY)); await settled(page);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(await tiles(page), ['cherry-blossom*', 'mojang-office', 'migrator', 'christmas-2010']);
  assert.equal(await text(page, 'o-src'), 'Capes Kayoiz wore before come from capes.me and from CapeWatch’s own checks.');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('the longest lines under the list (no record, no answer) in 7 languages at 400 px: nothing cut off or sticking out', { skip }, async () => {
  const problems = [];
  for (const seen of ['unknown', 'failed']) for (const lang of LANGS) {
    const saved = JSON.parse(SAVED); saved.players[KAY.id].seen = seen;
    const page = await open({ lang, width: 400, storage: { 'caperadar:owned': JSON.stringify(saved) }, capesMe: seen === 'failed' ? 'offline' : 'ok' });
    await answered(page, CAPES_ME_USER(KAY)); await settled(page);
    await new Promise((r) => setTimeout(r, 300));
    assert.ok((await text(page, 'o-src')).includes('capes.me'), lang + ' ' + seen);
    problems.push(...(await page.eval(FIND_PROBLEMS)).filter((p) => /[.#]o-|owned/.test(p)).map((p) => `${lang} ${seen}: ${p}`));
    assert.deepEqual(page.exceptions, [], lang + ' ' + seen);
    await page.close();
  }
  assert.deepEqual(problems, []);
});

// ---------- CapeWatch's own record ----------
const saved = (page) => page.eval(`JSON.parse(localStorage.getItem('caperadar:owned'))`);
const mojangAsked = (page) => page.eval(`(__test.http || []).filter((u) => u.includes('sessionserver.mojang.com')).length`);
const capesMeAsked = (page) => page.eval(`(__test.http || []).filter((u) => u.includes('capes.me')).length`);
const wearing = (page, cape) => page.eval(`__test.cfg.players = [${JSON.stringify({ ...KAY, cape })}]`);
const tenMinutes = (page) => page.eval(`(() => { __later(10 * 60e3); const t = __intervals.filter((i) => i.ms === 10 * 60e3); t.forEach((i) => i.fn()); return t.length; })()`);

test('CapeWatch’s own record: every 10 minutes it checks the player shown, and each cape it sees joins the list, with when it saw it', { skip }, async () => {
  // Kayoiz as saved before CapeWatch kept a record, last seen in the Cherry Blossom Cape; capes.me does not know them
  const before = JSON.parse(SAVED); before.players[KAY.id].at = Date.parse('2026-10-01T12:00:00Z');
  const page = await open({ storage: { 'caperadar:owned': JSON.stringify(before) } });
  await answered(page, CAPES_ME_USER(KAY)); await settled(page);   // the check at start: Mojang, then capes.me
  await page.waitFor(`JSON.parse(localStorage.getItem('caperadar:owned')).players['${KAY.id}'].saw?.['cherry-blossom']?.[1] > ${before.players[KAY.id].at}`);
  let rec = (await saved(page)).players[KAY.id].saw;
  assert.deepEqual(Object.keys(rec), ['cherry-blossom']);
  assert.equal(rec['cherry-blossom'][0], before.players[KAY.id].at, 'the cape seen before the record began is its first entry');
  assert.equal(await text(page, 'o-src'), UNKNOWN_KAY);
  const asked = { mojang: await mojangAsked(page), capesMe: await capesMeAsked(page) };
  // Kayoiz puts on the Vanilla Cape; ten minutes later CapeWatch sees it
  await wearing(page, tex('vanilla'));
  assert.equal(await tenMinutes(page), 1, 'one check every 10 minutes');
  await page.waitFor(`document.querySelector('#owned [data-owned="vanilla"] .pill.wearing')`);
  assert.deepEqual(await tiles(page), ['vanilla*', 'cherry-blossom', 'migrator', 'christmas-2010']);
  assert.equal(await text(page, 'o-msg'), 'Kayoiz is wearing the Vanilla Cape.');
  assert.equal(await text(page, 'o-note'), '', 'quietly: no message of its own');
  // then a cape the data file does not know
  await wearing(page, 'f'.repeat(64));
  await tenMinutes(page);
  await page.waitFor(`document.querySelector('#owned [data-owned="tex:${'f'.repeat(64)}"] .pill.wearing')`);
  assert.deepEqual(await tiles(page), ['tex:' + 'f'.repeat(64) + '*', 'cherry-blossom', 'vanilla', 'migrator', 'christmas-2010'], 'the Vanilla Cape stays: CapeWatch saw it');
  rec = (await saved(page)).players[KAY.id].saw;
  assert.deepEqual(Object.keys(rec).sort(), ['cherry-blossom', 'tex:' + 'f'.repeat(64), 'vanilla']);
  assert.ok(rec.vanilla[0] > rec['cherry-blossom'][0] && rec['tex:' + 'f'.repeat(64)][0] > rec.vanilla[0], 'each kept with when it was first seen');
  assert.equal(await mojangAsked(page), asked.mojang + 2, 'Mojang once per check');
  assert.equal(await capesMeAsked(page), asked.capesMe, 'capes.me only at start and on "Show capes"');
  assert.ok((await page.eval('__test.logs')).some((l) => l === '[Owned] Kayoiz: wearing vanilla, the first time CapeWatch sees it on them (every 10 minutes)'), 'written to the log file');
  // kept on this computer
  await page.reload();
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 5`, 20000);
  assert.deepEqual((await tiles(page)).map((k) => k.replace('*', '')).sort(), ['cherry-blossom', 'christmas-2010', 'migrator', 'tex:' + 'f'.repeat(64), 'vanilla']);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('the window coming back checks the player again; never twice within a minute, and a resize is not a return', { skip }, async () => {
  const page = await open({ storage: { 'caperadar:owned': SAVED } });
  await answered(page, CAPES_ME_USER(KAY)); await settled(page);
  const n = await mojangAsked(page), at = (await saved(page)).players[KAY.id].at;
  await wearing(page, tex('vanilla'));
  // right after the check at start: no check at all (Mojang's answer of a moment ago is not even looked at again)
  await page.eval(`__test.emit('window-visible', false); __test.emit('window-visible', true)`);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await mojangAsked(page), n, 'not within a minute of the last check');
  assert.equal((await saved(page)).players[KAY.id].at, at, 'nothing checked, nothing saved');
  // a minute later, hidden in the tray and opened again: checked
  await page.eval(`__later(61e3); __test.emit('window-visible', false); __test.emit('window-visible', true)`);
  await page.waitFor(`document.querySelector('#owned [data-owned="vanilla"] .pill.wearing')`);
  assert.equal(await mojangAsked(page), n + 1);
  // the window resized while open (main.rs says "visible" then too): no check
  await page.eval(`__later(61e3); __test.emit('window-visible', true); __test.emit('window-visible', true)`);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await mojangAsked(page), n + 1);
  assert.equal(await capesMeAsked(page), 2, 'capes.me: only the check at start (the player and its list of capes)');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('a cape taken off the list by hand stays off when CapeWatch sees it again, and stays in the record', { skip }, async () => {
  const page = await open({ storage: { 'caperadar:owned': SAVED } });
  await answered(page, CAPES_ME_USER(KAY)); await settled(page);
  await page.click('#o-choose');
  await page.waitFor(`document.getElementById('pick').open`);
  await page.click('#pick-list input[value="cherry-blossom"]');
  await page.click('#pick-done');
  await page.waitFor(`!document.getElementById('pick').open && document.querySelectorAll('#owned .o-tile').length === 2`);
  const first = (await saved(page)).players[KAY.id].saw['cherry-blossom'];
  await tenMinutes(page);   // still wearing it
  await page.waitFor(`JSON.parse(localStorage.getItem('caperadar:owned')).players['${KAY.id}'].saw['cherry-blossom'][1] > ${first[1]}`);
  assert.deepEqual(await tiles(page), ['migrator', 'christmas-2010']);
  assert.deepEqual((await saved(page)).players[KAY.id].saw['cherry-blossom'][0], first[0], 'seen again: first seen stays, last seen moves on');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('no player shown yet, or no answer: the checks ask no one, or change nothing', { skip }, async () => {
  let page = await open();
  await tenMinutes(page);
  await page.eval(`__later(61e3); __test.emit('window-visible', false); __test.emit('window-visible', true)`);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await page.eval(`(__test.http || []).length`), 0, 'no player to check');
  await page.close();
  page = await open({ storage: { 'caperadar:owned': SAVED } });
  await answered(page, CAPES_ME_USER(KAY)); await settled(page);
  const was = await saved(page);
  await page.eval(`__test.cfg.players = 'offline'`);
  await tenMinutes(page);
  await page.waitFor(`(__test.logs || []).some((l) => l.startsWith('[Owned] check (every 10 minutes): '))`);
  assert.deepEqual(await saved(page), was, 'the list and the record as they were');
  assert.deepEqual(await tiles(page), ['cherry-blossom*', 'migrator', 'christmas-2010']);
  assert.equal(await text(page, 'o-note'), '');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('a broken or odd record on this computer is left out, the rest of the player kept', { skip }, async () => {
  const odd = JSON.parse(SAVED);
  odd.players[KAY.id].saw = { vanilla: [1, 2], 'tex:zz': [1, 2], migrator: 'yesterday', 'mojang-office': [5], ['x'.repeat(90)]: [1, 2], 'tex:abc': [3, Infinity] };
  const page = await open({ storage: { 'caperadar:owned': JSON.stringify(odd) }, players: [{ ...KAY, hold: true }] });   // Mojang holds its answer: what was loaded
  await page.waitFor(`document.querySelectorAll('#owned .o-tile').length === 3`, 20000);
  await page.eval(`__test.cfg.players = [${JSON.stringify(KAY)}]`);
  await page.eval(`__test.release()`);
  await page.waitFor(`JSON.parse(localStorage.getItem('caperadar:owned') || '{}').players?.['${KAY.id}']?.saw?.['cherry-blossom']`, 15000);
  assert.deepEqual(Object.keys((await saved(page)).players[KAY.id].saw).sort(), ['cherry-blossom', 'vanilla']);
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('"Delete my data" while a check of the player is under way: what that check saw does not come back', { skip }, async () => {
  const page = await open({ storage: { 'caperadar:owned': SAVED } });
  await answered(page, CAPES_ME_USER(KAY)); await settled(page);
  // the next check goes out, and Mojang holds its answer; then the user deletes their data, and the log files take a moment
  await page.eval(`__test.cfg.players = [${JSON.stringify({ ...KAY, cape: tex('vanilla'), hold: true })}]; __test.cfg.holdClear = true`);
  await tenMinutes(page);
  await page.waitFor(`(__test.http || []).filter((u) => u.includes('sessionserver')).length === 2`);
  await page.click('#cw-open-settings');
  await page.waitFor(`document.getElementById('cw-settings')?.open`);
  await page.click('#cw-settings [value=delete]');
  await page.click('#cw-settings [value=delete-yes]');
  await page.waitFor(`localStorage.getItem('caperadar:owned') === null && typeof __test.releaseClear === 'function'`);
  await page.eval(`__test.release()`);   // the check ends while the logs are being cleared, and saves what it saw
  await page.waitFor(`JSON.parse(localStorage.getItem('caperadar:owned') || 'null')?.players?.['${KAY.id}']?.worn === 'vanilla'`);
  await page.eval(`__test.releaseClear()`);
  await page.waitFor(`document.querySelectorAll('#grid .tile').length > 10 && sessionStorage.getItem('__clearedLogs') === '1'`, 30000);   // started again
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.eval(`localStorage.getItem('caperadar:owned')`), null, 'nothing of the player is left');
  assert.equal(await page.eval(`document.querySelector('#owned .empty').textContent`), 'Type a Minecraft name and press “Show capes”.');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});
