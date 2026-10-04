// Task 2: the settings dialog saves what the user picks, and shows it again after a restart.
// Runs the built page (app/dist) in headless Edge with the app bridge faked (tests/lib/fake-tauri.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, EDGE } from '../lib/edge.mjs';
import { fakeTauri } from '../lib/fake-tauri.mjs';
import { sampleData } from '../lib/shell-sandbox.mjs';

const PAGE = fileUrl(fileURLToPath(new URL('../../app/dist/index.html', import.meta.url)));
let edge, page;
const skip = !EDGE && 'Microsoft Edge not found';

before(async () => {
  if (skip) return;
  edge = await launch();
  page = await edge.newPage();
  await page.block(['*textures.minecraft.net*', '*mojang.com*']);
  await page.init(fakeTauri({ data: sampleData() }));
  await page.goto(PAGE);
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
});
after(async () => { await edge?.close(); });

const boxes = () => page.eval(`(() => { const f = document.querySelector('#cw-settings form'); return Object.fromEntries(['notifyNew','notifyOpen','notifyEnding','autostart','soundOnOpen','invertDrag'].map(k => [k, f[k].checked]).concat([['skinName', f.skinName.value]])); })()`);

test('defaults: new cape on, opened and ending off, start with Windows on (the app turns it on at the first start), sound on, reverse drag off', { skip }, async () => {
  await page.click('#cw-open-settings');
  await page.waitFor(`document.getElementById('cw-settings')?.open`);
  await new Promise((r) => setTimeout(r, 200));   // the start-with-Windows state is read asynchronously
  assert.deepEqual(await boxes(), { notifyNew: true, notifyOpen: false, notifyEnding: false, autostart: true, soundOnOpen: true, invertDrag: false, skinName: '' });
});

test('Save keeps every choice, turns off start with Windows and closes the dialog', { skip }, async () => {
  for (const k of ['notifyNew', 'notifyOpen', 'notifyEnding', 'autostart', 'soundOnOpen', 'invertDrag']) {
    if (k !== 'notifyNew') await page.click(`#cw-settings input[name=${k}]`);   // flip all but "new cape"
  }
  await page.click('#cw-settings [value=save]');
  await page.waitFor(`!document.getElementById('cw-settings').open`);
  const saved = await page.eval(`JSON.parse(localStorage.getItem('capewatch:settings'))`);
  assert.deepEqual(saved, { notifyNew: true, notifyOpen: true, notifyEnding: true, autostart: false, soundOnOpen: false, invertDrag: true, skinName: '' });
  assert.equal(await page.eval('__test.autostart'), false, 'start with Windows was switched off');
  assert.ok((await page.eval('__test.logs')).some((l) => /settings: saved/.test(l)));
  assert.ok((await page.eval('__test.logs')).some((l) => /drag direction reversed/.test(l)), 'the figure got the new drag direction');
});

test('after a restart the dialog shows the saved choices', { skip }, async () => {
  await page.reload();
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  await page.click('#cw-open-settings');
  await page.waitFor(`document.getElementById('cw-settings')?.open`);
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(await boxes(), { notifyNew: true, notifyOpen: true, notifyEnding: true, autostart: false, soundOnOpen: false, invertDrag: true, skinName: '' });
  assert.ok(!(await page.eval('__test.logs')).some((l) => /autostart: was missing/.test(l)), 'the app does not turn it back on by itself');
  await page.click('#cw-settings [value=close]');
});

test('Close without saving changes nothing', { skip }, async () => {
  await page.click('#cw-open-settings');
  await page.waitFor(`document.getElementById('cw-settings')?.open`);
  await page.click(`#cw-settings input[name=notifyNew]`);
  await page.click('#cw-settings [value=close]');
  const saved = await page.eval(`JSON.parse(localStorage.getItem('capewatch:settings'))`);
  assert.equal(saved.notifyNew, true);
});

test('no page errors', { skip }, async () => {
  assert.deepEqual(page.exceptions, []);
});
