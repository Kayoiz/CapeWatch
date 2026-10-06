// Task 2: the settings dialog keeps what the user picks the moment they pick it (there is no Save button), shows it
// again after a restart, and "Delete my data" removes everything CapeWatch keeps on the computer.
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
  await page.block(['*textures.minecraft.net*', '*mojang.com*', '*capes.me*']);
  await page.init(fakeTauri({ data: sampleData() }));
  await page.goto(PAGE);
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
});
after(async () => { await edge?.close(); });

const boxes = () => page.eval(`(() => { const f = document.querySelector('#cw-settings form'); return Object.fromEntries(['notifyNew','notifyOpen','notifyEnding','autostart','soundOnOpen','invertDrag'].map(k => [k, f[k].checked]).concat([['skinName', f.skinName.value]])); })()`);
const saved = () => page.eval(`JSON.parse(localStorage.getItem('capewatch:settings') || 'null')`);
const msg = () => page.eval(`document.querySelector('#cw-settings .cw-msg').textContent`);
async function openSettings() {
  await page.click('#cw-open-settings');
  await page.waitFor(`document.getElementById('cw-settings')?.open`);
  await new Promise((r) => setTimeout(r, 200));   // the start-with-Windows state is read asynchronously
}

test('defaults: new cape on, opened and ending off, start with Windows on (the app turns it on at the first start), sound on, reverse drag off', { skip }, async () => {
  await openSettings();
  assert.deepEqual(await boxes(), { notifyNew: true, notifyOpen: false, notifyEnding: false, autostart: true, soundOnOpen: true, invertDrag: false, skinName: '' });
  assert.equal(await page.eval(`document.querySelector('#cw-settings [value=save]')`), null, 'no Save button: every change is kept at once');
});

test('every change is kept the moment it is made: start with Windows goes off, the figure turns the other way, "Saved."', { skip }, async () => {
  for (const k of ['notifyOpen', 'notifyEnding', 'autostart', 'soundOnOpen', 'invertDrag']) {   // flip all but "new cape"
    await page.click(`#cw-settings input[name=${k}]`);
    await page.waitFor(`JSON.parse(localStorage.getItem('capewatch:settings') || '{}').${k} === ${k === 'autostart' || k === 'soundOnOpen' ? 'false' : 'true'}`);
  }
  assert.deepEqual(await saved(), { notifyNew: true, notifyOpen: true, notifyEnding: true, autostart: false, soundOnOpen: false, invertDrag: true, skinName: '' });
  await page.waitFor(`__test.autostart === false`);
  assert.equal(await msg(), 'Saved.');
  assert.ok((await page.eval('__test.logs')).some((l) => /settings: invertDrag on/.test(l)));
  assert.ok((await page.eval('__test.logs')).some((l) => /drag direction reversed/.test(l)), 'the figure got the new drag direction at once');
  await page.click('#cw-settings [value=close]');
  await page.waitFor(`!document.getElementById('cw-settings').open`);
});

test('the skin name is kept when Enter is pressed (and looked up), and when the window closes', { skip }, async () => {
  await openSettings();
  await page.click('#cw-settings input[name=skinName]');
  await page.type('Nobody_Here');
  await page.key('Enter');
  await page.waitFor(`document.querySelector('#cw-settings .cw-msg').textContent === 'Username not found.'`);
  assert.equal(await page.eval(`document.getElementById('cw-settings').open`), true, 'Enter does not close the window');
  assert.equal((await saved()).skinName, 'Nobody_Here');
  await page.eval(`document.querySelector('#cw-settings input[name=skinName]').value = ''`);
  await page.click('#cw-settings [value=close]');
  await page.waitFor(`JSON.parse(localStorage.getItem('capewatch:settings')).skinName === ''`);
});

test('after a restart the dialog shows the kept choices, and start with Windows stays off', { skip }, async () => {
  await page.reload();
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`);
  await openSettings();
  assert.deepEqual(await boxes(), { notifyNew: true, notifyOpen: true, notifyEnding: true, autostart: false, soundOnOpen: false, invertDrag: true, skinName: '' });
  assert.ok(!(await page.eval('__test.logs')).some((l) => /autostart: was missing/.test(l)), 'the app does not turn it back on by itself');
  await page.click('#cw-settings [value=close]');
});

test('"Delete my data": asked once more; Cancel keeps everything; Delete removes it all and the logs, but not start with Windows', { skip }, async () => {
  await page.eval(`localStorage.setItem('caperadar:owned', '{"current":null,"players":{}}'); localStorage.setItem('caperadar:lang', 'en')`);
  await openSettings();
  await page.click('#cw-settings [value=delete]');
  assert.equal(await page.eval(`document.querySelector('#cw-settings .cw-ask').hidden`), false);
  assert.equal(await page.eval(`document.activeElement.value`), 'delete-no', 'the focus is on Cancel, never on Delete');
  assert.equal(await page.eval(`document.querySelector('#cw-settings .cw-ask').textContent`).then((t) => t.includes('This can’t be undone.')), true);
  await page.click('#cw-settings [value=delete-no]');
  assert.equal(await page.eval(`document.querySelector('#cw-settings .cw-ask').hidden`), true);
  assert.equal(await page.eval(`document.activeElement.value`), 'delete');
  assert.ok(await page.eval(`localStorage.getItem('caperadar:owned') !== null`), 'Cancel kept everything');
  const keys = await page.eval(`Object.keys(localStorage).length`);
  assert.ok(keys > 3);
  await page.click('#cw-settings [value=delete]');
  await page.click('#cw-settings [value=delete-yes]');
  await page.waitFor(`document.querySelectorAll('#grid .tile').length === 2`, 20000);   // the page started again
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.eval(`localStorage.getItem('caperadar:owned')`), null, 'the players and capes are gone');
  assert.equal(await page.eval(`sessionStorage.getItem('__clearedLogs')`), '1', 'the log files were emptied');
  assert.deepEqual(await saved(), { autostart: false }, 'only "start with Windows" kept its value');
  assert.equal(await page.eval(`__test.autostart`), false, 'and it was not turned back on');
  assert.ok((await page.eval('__test.logs')).some((l) => /notify: first run/.test(l)), 'a first start again: news already out is not notified again');
  assert.deepEqual(await page.eval('__test.notifications'), []);
});

test('no page errors', { skip }, async () => {
  assert.deepEqual(page.exceptions, []);
});
