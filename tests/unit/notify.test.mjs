// Task 2: the notification rules of app/shell.js, run on the real file.
// New cape, promotion opened, promotion ending; the first run; the three settings; no notification twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, makeStorage, dataServer, sampleData, ev } from '../lib/shell-sandbox.mjs';

const recent = (h = 1) => new Date(Date.now() - h * 3600e3).toISOString();
const seenOnly = (...ids) => makeStorage({ 'capewatch:seen': JSON.stringify(['20260930-baseline', ...ids]) });
const withSettings = (storage, s) => { storage.setItem('capewatch:settings', JSON.stringify(s)); return storage; };

test('first run: nothing is notified, every existing event is marked as seen', async () => {
  const storage = makeStorage();
  const data = sampleData({ events: { a: ev('test-beta', 'new', recent()), b: ev('test-beta', 'available', recent()) } });
  const s = await loadShell({ storage, fetch: dataServer({ data }) });
  assert.equal(s.out.notifications.length, 0);
  assert.deepEqual(storage.json('seen').sort(), ['20260930-baseline', 'a', 'b']);
  assert.ok(s.out.logs.some((l) => /first run, 3 existing events marked as seen/.test(l)));
});

test('new cape: notified (on by default), with the title and text of the event', async () => {
  const data = sampleData({ events: { n: ev('test-beta', 'new', recent()) } });
  const s = await loadShell({ storage: seenOnly(), fetch: dataServer({ data }) });
  assert.deepEqual(s.out.notifications, [{ title: 'CapeWatch: New cape', body: 'test-beta: new', capeId: 'test-beta' }]);
});

test('promotion opened: only when "Promotion opened" is on (off by default)', async () => {
  const data = sampleData({ events: { o: ev('test-beta', 'available', recent()) } });
  const off = await loadShell({ storage: seenOnly(), fetch: dataServer({ data }) });
  assert.equal(off.out.notifications.length, 0);
  assert.ok(off.out.logs.some((l) => /skipped, "notifyOpen" is off/.test(l)));
  const on = await loadShell({ storage: withSettings(seenOnly(), { notifyOpen: true }), fetch: dataServer({ data }) });
  assert.deepEqual(on.out.notifications.map((n) => n.title), ['CapeWatch: Promotion opened']);
});

test('promotion ending soon: only when "Promotion ending soon" is on (off by default)', async () => {
  const data = sampleData({ events: { e: ev('test-beta', 'ending', recent()) } });
  const off = await loadShell({ storage: seenOnly(), fetch: dataServer({ data }) });
  assert.equal(off.out.notifications.length, 0);
  const on = await loadShell({ storage: withSettings(seenOnly(), { notifyEnding: true }), fetch: dataServer({ data }) });
  assert.deepEqual(on.out.notifications.map((n) => n.title), ['CapeWatch: Ending soon']);
});

test('"New cape" switched off: no notification for a new cape', async () => {
  const data = sampleData({ events: { n: ev('test-beta', 'new', recent()) } });
  const s = await loadShell({ storage: withSettings(seenOnly(), { notifyNew: false }), fetch: dataServer({ data }) });
  assert.equal(s.out.notifications.length, 0);
});

test('promotion ended, update notes and the start line never notify', async () => {
  const storage = withSettings(seenOnly(), { notifyNew: true, notifyOpen: true, notifyEnding: true });
  const data = sampleData({ events: { x: ev('test-alpha', 'ended', recent()), y: ev('test-beta', 'changed', recent()), z: ev('test-beta', 'baseline', recent()) } });
  const s = await loadShell({ storage, fetch: dataServer({ data }) });
  assert.equal(s.out.notifications.length, 0);
});

test('no notification twice: the same data again, "Check now", the 30-minute check, a restart', async () => {
  const storage = seenOnly();
  const server = dataServer({ data: sampleData({ events: { n: ev('test-beta', 'new', recent()) } }) });
  const s = await loadShell({ storage, fetch: server });
  await s.checkNow();
  await s.poll();
  await s.checkNow();
  assert.equal(s.out.notifications.length, 1, 'one notification in this run');
  const again = await loadShell({ storage, fetch: server });
  assert.equal(again.out.notifications.length, 0, 'none after a restart');
});

test('no notification twice: two checks at the same moment', async () => {
  const storage = seenOnly();
  const server = dataServer({ data: sampleData({ events: { n: ev('test-beta', 'new', recent()) } }) });
  const s = await loadShell({ storage, fetch: server });
  // start check already ran; now the tray and the timer ask together
  s.out.notifications.length = 0;
  storage.setItem('capewatch:seen', JSON.stringify(['20260930-baseline']));
  await Promise.all([s.checkNow(), s.poll()]);
  assert.equal(s.out.notifications.length, 1);
});

test('the notification follows the app language (Hebrew)', async () => {
  const storage = seenOnly();
  const data = sampleData({ events: { n: ev('test-beta', 'new', recent()) } });
  const s = await loadShell({ storage, fetch: dataServer({ data }), page: false });
  // the language comes from the page; give the shell a page that says Hebrew, then check again
  s.ctx.CapeWatchPage = { lang: () => 'he' };
  storage.setItem('capewatch:seen', JSON.stringify(['20260930-baseline']));
  s.out.notifications.length = 0;
  await s.checkNow();
  assert.deepEqual(s.out.notifications, [{ title: 'CapeWatch: גלימה חדשה', body: 'test-beta: new (he)', capeId: 'test-beta' }]);
});

test('settings saved by any older version are read with defaults for the missing ones', async () => {
  const storage = withSettings(seenOnly(), { notifyNew: false });   // 1.0.0 had only the three boxes and the skin
  const data = sampleData({ events: { n: ev('test-beta', 'new', recent()), o: ev('test-beta', 'available', recent()) } });
  const s = await loadShell({ storage, fetch: dataServer({ data }) });
  assert.equal(s.out.notifications.length, 0, 'new is off (saved), opened is off (default)');
});
