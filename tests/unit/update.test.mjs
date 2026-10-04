// Task 1: updating from CapeWatch 1.0.5 to the combined update keeps the settings and the events the user
// has already seen, and does not send a pile of old notifications.
// Each test runs the released 1.0.5 shell first, then today's shell on the same storage (a real update keeps
// the app's storage: same app id, same WebView2 data folder).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadShell, makeStorage, dataServer, sampleData, ev } from '../lib/shell-sandbox.mjs';

const OLD = readFileSync(new URL('../fixtures/shell-1.0.5.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-04T06:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600e3).toISOString().replace(/\.\d{3}Z$/, 'Z');

// The real clock is used by the shell; the event times below are relative to it.
const realNow = Date.now;
const atNow = (fn) => async () => { Date.now = () => NOW; try { await fn(); } finally { Date.now = realNow; } };

test('settings chosen in 1.0.5 survive the update, new settings get their defaults', atNow(async () => {
  const storage = makeStorage();
  const server = dataServer({ data: sampleData() });
  await loadShell({ source: OLD, storage, fetch: server });
  // what the 1.0.5 settings dialog saves
  storage.setItem('capewatch:settings', JSON.stringify({ notifyNew: false, notifyOpen: true, notifyEnding: true, autostart: false, skinName: 'Someone' }));
  await loadShell({ storage, fetch: server });
  const s = storage.json('settings');
  assert.equal(s.notifyNew, false);
  assert.equal(s.notifyOpen, true);
  assert.equal(s.notifyEnding, true);
  assert.equal(s.autostart, false);
  assert.equal(s.skinName, 'Someone');
}));

test('the events seen in 1.0.5 are not notified again after the update', atNow(async () => {
  const storage = makeStorage();
  const data = sampleData({ events: { e1: ev('test-beta', 'new', hoursAgo(30)), e2: ev('test-beta', 'available', hoursAgo(20)) } });
  const server = dataServer({ data });
  const old = await loadShell({ source: OLD, storage, fetch: server });
  assert.equal(old.out.notifications.length, 0, '1.0.5 first run: everything is marked as seen');
  const now = await loadShell({ storage, fetch: server });
  assert.deepEqual(now.out.notifications, [], 'no notification for events 1.0.5 already saw');
  assert.ok(now.out.snapshots.capes.length >= 1, 'the page got the capes');
}));

test('the saved cape list from 1.0.5 is shown at once, before the network answers', atNow(async () => {
  const storage = makeStorage();
  await loadShell({ source: OLD, storage, fetch: dataServer({ data: sampleData() }) });
  const now = await loadShell({ storage, fetch: dataServer({ mode: 'offline' }) });
  assert.ok(now.out.snapshots.capes.length >= 1, 'the saved copy reaches the page while offline');
  assert.equal(now.out.snapshots.capes.at(-1).length, 2);
}));

test('one new event after the update gives exactly one notification', atNow(async () => {
  const storage = makeStorage();
  const state = { data: sampleData() };
  await loadShell({ source: OLD, storage, fetch: dataServer(state) });
  state.data = sampleData({ events: { n1: ev('test-gamma', 'new', hoursAgo(2)) }, capes: { 'test-gamma': { name: 'Test Gamma Cape', availability: 'announced', editions: ['java'] } } });
  const now = await loadShell({ storage, fetch: dataServer(state) });
  assert.equal(now.out.notifications.length, 1);
  assert.equal(now.out.notifications[0].capeId, 'test-gamma');
}));

test('after a long time without CapeWatch: no pile of old notifications', atNow(async () => {
  const storage = makeStorage();
  await loadShell({ source: OLD, storage, fetch: dataServer({ data: sampleData() }) });
  storage.setItem('capewatch:settings', JSON.stringify({ notifyNew: true, notifyOpen: true, notifyEnding: true, autostart: true, skinName: '' }));
  // Three months later. Meanwhile: old new capes, a promotion that opened, was ending and is over,
  // and one fresh new cape from today.
  const events = {
    a: ev('old-one', 'new', hoursAgo(24 * 80)),
    b: ev('old-two', 'new', hoursAgo(24 * 60)),
    c: ev('test-alpha', 'available', hoursAgo(24 * 40)),
    d: ev('test-alpha', 'ending', hoursAgo(24 * 30)),
    f: ev('test-alpha', 'ended', hoursAgo(24 * 28)),
    g: ev('fresh', 'new', hoursAgo(3))
  };
  const capes = { 'old-one': { name: 'Old One Cape' }, 'old-two': { name: 'Old Two Cape' }, fresh: { name: 'Fresh Cape', availability: 'announced' } };
  const now = await loadShell({ storage, fetch: dataServer({ data: sampleData({ events, capes }) }) });
  assert.deepEqual(now.out.notifications.map((n) => n.capeId), ['fresh'], 'only the fresh event is notified');
  assert.ok(now.out.logs.some((l) => /too old/.test(l)), 'the skipped ones are written to the log');
}));

test('a promotion that is already over is not announced as open or ending', atNow(async () => {
  const storage = makeStorage();
  storage.setItem('capewatch:seen', JSON.stringify(['20260930-baseline']));
  storage.setItem('capewatch:settings', JSON.stringify({ notifyNew: true, notifyOpen: true, notifyEnding: true }));
  // test-alpha is "ended" in the data; both events are recent (the PC was off for two days)
  const events = { o: ev('test-alpha', 'available', hoursAgo(50)), p: ev('test-alpha', 'ending', hoursAgo(40)), q: ev('test-beta', 'ending', hoursAgo(1)) };
  const now = await loadShell({ storage, fetch: dataServer({ data: sampleData({ events }) }) });
  assert.deepEqual(now.out.notifications.map((n) => n.capeId), ['test-beta']);
}));

test('several new events at once arrive oldest first', atNow(async () => {
  const storage = makeStorage();
  storage.setItem('capewatch:seen', JSON.stringify(['20260930-baseline']));
  const events = { z: ev('test-beta', 'new', hoursAgo(1)), y: ev('test-alpha', 'new', hoursAgo(5)) };
  const now = await loadShell({ storage, fetch: dataServer({ data: sampleData({ events }) }) });
  assert.deepEqual(now.out.notifications.map((n) => n.capeId), ['test-alpha', 'test-beta']);
}));
