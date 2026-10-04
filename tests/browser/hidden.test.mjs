// Task 5: while the window is hidden (tray, minimized) the 3D figure is not drawn and the capes do not swap,
// so CapeWatch does no work in the background. Back on screen it goes on at once.
// The cape textures here are made-up two-colour pictures (tests/lib/png.mjs), served by the test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, EDGE } from '../lib/edge.mjs';
import { fakeTauri } from '../lib/fake-tauri.mjs';
import { sampleData } from '../lib/shell-sandbox.mjs';
import { testCape } from '../lib/png.mjs';

const PAGE = fileUrl(fileURLToPath(new URL('../../app/dist/index.html', import.meta.url)));
const skip = !EDGE && 'Microsoft Edge not found';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let edge;
before(async () => { if (!skip) edge = await launch(); });
after(async () => { await edge?.close(); });

function data() {
  const d = sampleData();
  d.capes['test-alpha'].textureId = 'aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000';
  d.capes['test-beta'].textureId = 'bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000';
  return d;
}
async function open(greeting) {
  const page = await edge.newPage();
  await page.block(['*mojang.com*']);
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.init(fakeTauri({ data: data(), greeting }));
  await page.goto(PAGE);
  return page;
}
const count = (page, re) => page.console.filter((l) => re.test(l)).length;
const frames = (page) => page.eval(`(() => { const v = CapeWatchPage.cape3d.viewer; return v.renderer.info.render.frame; })()`);

test('hidden: no frames drawn, no cape swaps, no log lines; shown again: swaps resume', { skip }, async () => {
  const page = await open('none');
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  await page.waitFor(`true`);
  const until = Date.now() + 15000;
  while (count(page, /\[Cape3D\] swap:/) < 1 && Date.now() < until) await sleep(200);
  assert.ok(count(page, /\[Cape3D\] swap:/) >= 1, 'the rotation runs while visible');

  await page.eval(`__test.emit('window-visible', false)`);          // what main.rs sends when the window hides
  await sleep(300);
  const f0 = await frames(page), swaps0 = count(page, /\[Cape3D\] (swap|cape: load)/), fps0 = count(page, /\[Cape3D\] fps/);
  await sleep(11000);                                                 // two swap periods
  assert.equal(await frames(page), f0, 'no frame drawn while hidden');
  assert.equal(count(page, /\[Cape3D\] (swap|cape: load)/), swaps0, 'no swap while hidden');
  assert.equal(count(page, /\[Cape3D\] fps/), fps0, 'no fps line while hidden');
  assert.equal(await page.eval(`CapeWatchPage.cape3d.viewer.renderPaused`), true);

  await page.eval(`__test.emit('window-visible', true)`);
  await sleep(6000);
  assert.ok(await frames(page) > f0 + 10, 'drawing again');
  assert.ok(count(page, /\[Cape3D\] (swap|cape: load)/) > swaps0, 'swapping again');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});

test('started hidden with Windows: at most the first cape loads, nothing swaps until the first open, then it runs at once', { skip }, async () => {
  const page = await open('wait');
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  await sleep(1500);
  // at most the very first cape: it can load in the moment before the shell has said "hidden"
  const first = count(page, /\[Cape3D\] cape: loaded/), swaps = count(page, /\[Cape3D\] swap:/);
  assert.ok(first <= 1, 'at most one cape loaded at the start');
  await sleep(7000);
  assert.equal(count(page, /\[Cape3D\] cape: loaded/), first, 'no cape loaded while hidden');
  assert.equal(count(page, /\[Cape3D\] swap:/), swaps, 'no swap (cape to elytra either) while hidden');
  await page.eval(`__test.emit('window-visible', true)`);
  await page.waitFor(`true`);
  const t0 = Date.now();
  while (count(page, /\[Cape3D\] cape: loaded/) < 1 && Date.now() - t0 < 3000) await sleep(100);
  assert.ok(count(page, /\[Cape3D\] cape: loaded/) >= 1, 'a cape is on within 3 seconds of the first open');
  assert.deepEqual(page.exceptions, []);
  await page.close();
});
