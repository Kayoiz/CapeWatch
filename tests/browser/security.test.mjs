// Task 7: security.
// 1. Text from the data file can never run as code: every text field filled with HTML and script tricks.
// 2. The app's security policy (tauri.conf.json "csp") lets the page reach only what it needs, and blocks
//    everything else; the whole app still works under it (pictures, figure, title effect, dialogs, links).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, EDGE } from '../lib/edge.mjs';
import { fakeTauri } from '../lib/fake-tauri.mjs';
import { sampleData, ev } from '../lib/shell-sandbox.mjs';
import { serveApp } from '../lib/serve-app.mjs';
import { testCape } from '../lib/png.mjs';

const skip = !EDGE && 'Microsoft Edge not found';
let edge, server;
before(async () => { if (skip) return; edge = await launch(); server = await serveApp(); });
after(async () => { await edge?.close(); await server?.close(); });

const CATCH = `window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.effectiveDirective + ' ' + e.blockedURI));`;
async function open(data, greeting = 'none') {
  const page = await edge.newPage();
  await page.block(['*mojang.com*']);
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(200, 60, 60), type: 'image/png' }));
  await page.route('https://minecraft.wiki/*', () => ({ body: testCape(60, 60, 200), type: 'image/png' }));   // answered here: never the real wiki
  await page.init(CATCH);
  await page.init(fakeTauri({ data, greeting }));
  await page.goto(server.url + 'index.html');
  return page;
}

// ---------- 1. data text never runs ----------
const EVIL = [
  '<img src=x onerror="window.__pwned=1">',
  '<script>window.__pwned=2<\/script>',
  '"><svg onload="window.__pwned=3">',
  "javascript:window.__pwned=4",
  '**<b onmouseover="window.__pwned=5">bold</b>**',
  '{{constructor.constructor("window.__pwned=6")()}}'
].join(' ');

function evilData() {
  const d = sampleData({ events: { x: { ...ev('evil" onclick="x', 'new', new Date().toISOString()), textEn: EVIL, capeName: EVIL } } });
  d.capes['evil" onclick="x'] = {
    name: EVIL, wikiTitle: 'javascript:window.__pwned=7', apiAlias: EVIL, availability: 'available', availableUntil: '2099-01-01',
    category: EVIL, cost: 'free', editions: ['java', EVIL], releaseDate: '2026-10-01', obtainEn: EVIL, shortEn: EVIL,
    approx: { releaseDate: { en: EVIL } }, textureUrl: 'javascript:window.__pwned=8'
  };
  d.status.lastCheckAt = EVIL;
  return d;
}

test('text from the data file is shown as text, never run, in every place it appears', { skip }, async () => {
  const page = await open(evilData());
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 3`);
  await page.click('#live .live-card[data-cape^="evil"] .slot');               // the detail window of the evil cape
  await page.waitFor(`document.getElementById('dlg').open`);
  await page.eval(`document.querySelectorAll('a, button, [onmouseover]').forEach(e => e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))`);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await page.eval('window.__pwned ?? null'), null, 'no payload ran');
  // (the plain cape outline of a cape with no texture is the page's own fixed svg, not data text)
  assert.equal(await page.eval(`document.querySelectorAll('[onerror], [onload], [onclick], [onmouseover], svg:not(.ph.shape > svg)').length`), 0, 'no element made from data text');
  assert.equal(await page.eval(`document.querySelectorAll('script').length`), await page.eval(`document.querySelectorAll('script[src], body > script').length`), 'no extra script tags');
  assert.ok(await page.eval(`document.getElementById('dlg-title').textContent.includes('<img src=x onerror=')`), 'the name is shown literally');
  assert.ok(await page.eval(`[...document.querySelectorAll('#dlg-actions a')].every(a => a.href.startsWith('https://minecraft.wiki/w/'))`), 'the wiki link stays on the wiki');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

// ---------- 2. the security policy ----------
test('under the app security policy everything works and nothing is blocked', { skip }, async () => {
  const d = sampleData();
  d.capes['test-alpha'].textureId = 'aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000';
  d.capes['test-beta'].textureId = 'bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000';
  const page = await open(d, 'greet');                                           // with the title effect and sound
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  await page.waitFor(`document.querySelectorAll('#grid .tile img.gen').length === 2`, 30000);   // pictures drawn (data: images)
  await page.waitFor(`__test.logs.some(l => /\\[Title\\] glow: start/.test(l))`, 15000);
  await page.click('#grid .tile .slot');
  await page.waitFor(`document.getElementById('dlg').open`);
  await page.click('#dlg-close');
  await page.click('#cw-open-settings');                                          // the dialog's own styles are added at run time
  await page.waitFor(`document.getElementById('cw-settings')?.open`);
  assert.equal(await page.eval(`getComputedStyle(document.querySelector('.cw-set')).display`), 'grid', 'the settings dialog has its styles');
  await page.click('#cw-settings input[name=notifyOpen]');                       // kept at once
  await page.click('#cw-settings [value=delete]'); await page.click('#cw-settings [value=delete-no]');
  await page.click('#cw-settings [value=close]');
  await page.click('#a11y-open'); await page.waitFor(`document.getElementById('a11y').open`); await page.click('#a11y-close');
  await page.click('#donate');
  assert.equal(await page.eval('__test.opened'), 'https://paypal.me/Kayoiz', 'links open in the browser');
  assert.equal(await page.eval(`getComputedStyle(document.querySelector('.live-name')).fontFamily.includes('CapeWatch Pixel')`), true);
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual(await page.eval('window.__csp'), [], 'nothing blocked');
  assert.ok(await page.eval(`CapeWatchPage.cape3d.viewer.renderer.info.render.frame > 0`), 'the figure draws');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('the policy is really on: an address the app does not use is blocked, and the block is logged', { skip }, async () => {
  const page = await open(sampleData());
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  const fetched = await page.eval(`fetch('https://example.com/steal?x=1').then(() => 'reached', () => 'blocked')`);
  assert.equal(fetched, 'blocked');
  await page.eval(`new Promise(r => { const i = new Image(); i.onerror = r; i.onload = r; i.src = 'https://example.com/pixel.png'; })`);
  await new Promise((r) => setTimeout(r, 300));
  const blocked = await page.eval('window.__csp');
  assert.ok(blocked.some((b) => /^connect-src https:\/\/example\.com/.test(b)), 'fetch blocked');
  assert.ok(blocked.some((b) => /^img-src https:\/\/example\.com/.test(b)), 'image blocked');
  assert.ok((await page.eval('__test.logs')).some((l) => /blocked by the security policy: connect-src https:\/\/example\.com/.test(l)), 'written to the app log');
  await page.close();
});

test('the page only contacts its own files and the texture server (no Google fonts)', { skip }, async () => {
  const d = sampleData();
  d.capes['test-alpha'].textureId = 'aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000';
  const page = await open(d);
  await page.waitFor(`document.querySelectorAll('#grid .tile img.gen').length === 1`, 30000);
  const hosts = [...new Set(page.requests.map((u) => { try { const x = new URL(u); return x.protocol === 'data:' ? 'data:' : x.host; } catch { return u; } }))].sort();
  const allowed = new Set([new URL(server.url).host, 'textures.minecraft.net', 'data:']);   // fonts ship with the app
  assert.deepEqual(hosts.filter((h) => !allowed.has(h)), [], 'unexpected: ' + hosts.join(', '));
  await page.close();
});

test('the wiki: only the three texture files are loaded, under the policy; nothing else from the wiki can load', { skip }, async () => {
  const d = sampleData({ capes: {
    'christmas-2010': { name: 'Christmas 2010 Cape', editions: ['java'], availability: 'ended', category: 'other', releaseDate: '2010-12-24', obtainEn: 'Made up for the tests.' },
    // a data file pointing at another wiki file: the installed app does not load it
    'test-gamma': { name: 'Test Gamma Cape', editions: ['java'], availability: 'ended', category: 'other', releaseDate: '2020-01-01', obtainEn: 'Made up.', textureUrl: 'https://minecraft.wiki/images/Other_Cape_%28texture%29.png' }
  } });
  const page = await open(d);
  await page.waitFor(`document.querySelector('#grid .tile[data-cape="christmas-2010"] img.gen')`, 30000);
  await new Promise((r) => setTimeout(r, 800));
  assert.deepEqual([...new Set(page.requests.filter((u) => u.includes('minecraft.wiki')))], ['https://minecraft.wiki/images/Christmas_2010_Cape_%28texture%29.png']);
  assert.equal(await page.eval(`!!document.querySelector('#grid .tile[data-cape="test-gamma"] img.gen')`), false, 'the other wiki file is not used');
  assert.deepEqual(await page.eval('window.__csp'), [], 'nothing blocked');
  // the policy itself: wiki images only, nothing else from the wiki
  await page.eval(`new Promise(r => { const i = new Image(); i.onerror = r; i.onload = r; i.src = 'https://minecraft.wiki/w/Special:FilePath/Cape.png'; })`);
  const f = await page.eval(`fetch('https://minecraft.wiki/images/Christmas_2010_Cape_%28texture%29.png').then(() => 'reached', () => 'blocked')`);
  await new Promise((r) => setTimeout(r, 300));
  const blocked = await page.eval('window.__csp');
  assert.ok(blocked.some((b) => /^img-src https:\/\/minecraft\.wiki\/w\/Special/.test(b)), 'a wiki page outside its images folder is blocked: ' + blocked.join(', '));
  assert.equal(f, 'blocked', 'the page cannot fetch from the wiki, only show its images');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('Trusted Types: under the app policy no text can become HTML or code anywhere, and the app still does everything', { skip }, async () => {
  const page = await open(sampleData());
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  // every way text could turn into markup or script is refused by the browser itself (tried from the page's own timer:
  // code sent through the debugging connection may use eval by default)
  const tries = await page.eval(`new Promise((done) => setTimeout(() => {
    const out = {};
    const t = (k, f) => { try { f(); out[k] = 'allowed'; } catch (e) { out[k] = e.name; } };
    t('innerHTML', () => { document.body.insertAdjacentElement('beforeend', document.createElement('div')).innerHTML = '<img src=x onerror="window.__pwned=9">'; });
    t('outerHTML', () => { const d = document.createElement('div'); document.body.append(d); d.outerHTML = '<b>x</b>'; });
    t('insertAdjacentHTML', () => { document.body.insertAdjacentHTML('beforeend', '<b>x</b>'); });
    t('document.write', () => { document.write('<b>x</b>'); });
    t('script text', () => { const s = document.createElement('script'); s.textContent = 'window.__pwned=10'; document.body.append(s); });
    t('script src', () => { const s = document.createElement('script'); s.src = 'data:text/javascript,window.__pwned=11'; });
    t('a new policy', () => { trustedTypes.createPolicy('mine', { createHTML: (x) => x }); });
    t('eval', () => { eval('window.__pwned = 12'); });
    done(out);
  }, 0))`);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(tries, { innerHTML: 'TypeError', outerHTML: 'TypeError', insertAdjacentHTML: 'TypeError', 'document.write': 'TypeError',
    'script text': 'TypeError', 'script src': 'TypeError', 'a new policy': 'TypeError', eval: 'EvalError' });
  assert.equal(await page.eval('window.__pwned ?? null'), null, 'nothing ran');
  assert.ok((await page.eval('window.__csp')).some((b) => /^require-trusted-types-for/.test(b)), 'the browser reported the refusals');
  assert.ok((await page.eval('__test.logs')).some((l) => /blocked by the security policy: require-trusted-types-for/.test(l)), 'and they are written to the app log');
  // the parts built from fixed pieces still work: the settings window, the plain outline, the accessibility statement
  await page.click('#cw-open-settings');
  await page.waitFor(`document.getElementById('cw-settings')?.open && document.querySelectorAll('#cw-settings input').length === 7`);
  await page.click('#cw-settings [value=close]');
  assert.deepEqual(page.exceptions.filter((e) => !/TrustedHTML|TrustedScript|Trusted Type|EvalError|unsafe-eval/i.test(e)), []);
  await page.close();
});
