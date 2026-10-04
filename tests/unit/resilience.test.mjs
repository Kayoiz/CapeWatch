// Task 4: no internet, the GitHub hourly limit, a bad or partial data file. The app never loses the copy it
// has, never stores a bad one, and the page always gets something it can draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, makeStorage, dataServer, sampleData, ev } from '../lib/shell-sandbox.mjs';

const saved = () => makeStorage({ 'capewatch:data': JSON.stringify(sampleData()), 'capewatch:seen': JSON.stringify(['20260930-baseline']) });
const lastCapes = (s) => s.out.snapshots.capes.at(-1)?.map(([id]) => id).sort();

test('no internet: the saved copy is shown and kept', async () => {
  const storage = saved();
  const before = storage.getItem('capewatch:data');
  const s = await loadShell({ storage, fetch: dataServer({ mode: 'offline' }) });
  assert.deepEqual(lastCapes(s), ['test-alpha', 'test-beta']);
  assert.equal(storage.getItem('capewatch:data'), before);
  assert.ok(s.out.logs.some((l) => /fetch failed \(start\).*showing the saved copy/.test(l)));
  assert.equal(s.out.errors.length, 0);
});

test('no internet and nothing saved (first start offline): no crash, and it tries again soon, not in 30 minutes', async () => {
  const server = dataServer({ mode: 'offline' });
  const s = await loadShell({ storage: makeStorage(), fetch: server });
  assert.equal(s.out.snapshots.capes.length, 0);
  assert.equal(s.out.errors.length, 0);
  assert.ok(s.out.logs.some((l) => /trying again in 1 min/.test(l)), 'a quick retry is planned');
});

test('the connection comes back: it checks at once', async () => {
  const state = { mode: 'offline', data: sampleData() };
  const s = await loadShell({ storage: makeStorage(), fetch: dataServer(state) });
  state.mode = 'ok';
  await s.fire('online');
  assert.deepEqual(lastCapes(s), ['test-alpha', 'test-beta']);
  assert.ok(s.out.logs.some((l) => /data: loaded \(back online/.test(l)));
});

test('GitHub hourly limit reached: the data comes from the second address', async () => {
  const server = dataServer({ api: 'ratelimit', raw: 'ok', data: sampleData() });
  const s = await loadShell({ storage: makeStorage(), fetch: server });
  assert.deepEqual(lastCapes(s), ['test-alpha', 'test-beta']);
  assert.ok(s.out.logs.some((l) => /hourly limit reached/.test(l)));
  assert.ok(s.out.logs.some((l) => /via raw/.test(l)));
});

test('both addresses fail: the saved copy stays', async () => {
  const storage = saved();
  const s = await loadShell({ storage, fetch: dataServer({ api: '500', raw: 'offline' }) });
  assert.deepEqual(lastCapes(s), ['test-alpha', 'test-beta']);
  assert.equal(JSON.parse(storage.getItem('capewatch:data')).capes['test-beta'].name, 'Test Beta Cape');
});

for (const [name, body] of [
  ['an error page instead of the file', '<html>Server error</html>'],
  ['a file cut off in the middle', JSON.stringify(sampleData()).slice(0, 300)],
  ['an empty file', ''],
  ['a file with no capes', JSON.stringify({ status: {}, events: {} })],
  ['a file whose capes are a list', JSON.stringify({ capes: [], events: {} })],
  ['a file whose capes are all broken', JSON.stringify({ capes: { a: null, b: 5, c: { name: 7 } }, events: {} })],
  ['the word null', 'null']
]) {
  test('bad data file (' + name + '): ignored, the saved copy is kept and shown', async () => {
    const storage = saved();
    const before = storage.getItem('capewatch:data');
    const s = await loadShell({ storage, fetch: dataServer({ mode: 'raw-body', body }) });
    assert.equal(storage.getItem('capewatch:data'), before, 'not stored');
    assert.deepEqual(lastCapes(s), ['test-alpha', 'test-beta'], 'the page still has the saved capes');
    assert.equal(s.out.errors.length, 0);
  });
}

test('partial data file: the broken entries are dropped, the good ones are shown, nothing crashes', async () => {
  const data = sampleData({ events: { bad1: null, bad2: 'text', good: ev('test-beta', 'new', new Date().toISOString()) } });
  data.capes.broken = null;
  data.capes.nameless = { availability: 'available' };
  data.capes['odd-types'] = { name: 'Odd Types Cape', releaseDate: 2024, editions: 'java', availableUntil: { x: 1 }, obtainEn: ['a'], approx: 'soon' };
  data.status = 'fine';
  const storage = makeStorage({ 'capewatch:seen': JSON.stringify(['20260930-baseline']) });
  const s = await loadShell({ storage, fetch: dataServer({ data }) });
  assert.deepEqual(lastCapes(s), ['odd-types', 'test-alpha', 'test-beta']);
  const odd = Object.fromEntries(s.out.snapshots.capes.at(-1))['odd-types'];
  assert.equal(odd.releaseDate, '2024', 'a number where text belongs becomes text');
  assert.deepEqual(odd.editions, ['java'], 'a single edition becomes a list');
  assert.ok(!('availableUntil' in odd) && !('obtainEn' in odd) && !('approx' in odd), 'values of the wrong kind are dropped');
  assert.deepEqual(s.out.snapshots.events.at(-1).map((e) => e.type).sort(), ['baseline', 'new']);
  assert.equal(s.out.notifications.length, 1, 'the good new event is still notified');
  assert.equal(s.out.errors.length, 0);
});

test('a saved copy that is already bad (from an older version) does not stop the start', async () => {
  const bad = sampleData({ events: { x: null } });
  bad.capes.y = null;
  const storage = makeStorage({ 'capewatch:data': JSON.stringify(bad), 'capewatch:seen': '[]' });
  const s = await loadShell({ storage, fetch: dataServer({ mode: 'offline' }) });
  assert.deepEqual(lastCapes(s), ['test-alpha', 'test-beta']);
  assert.equal(s.out.errors.length, 0);
});

test('a saved copy that is not even JSON: treated as nothing saved', async () => {
  const storage = makeStorage({ 'capewatch:data': '{oops' });
  const s = await loadShell({ storage, fetch: dataServer({ data: sampleData() }) });
  assert.deepEqual(lastCapes(s), ['test-alpha', 'test-beta']);
});

test('after a failure the next good check clears the retry and loads normally', async () => {
  const state = { mode: 'offline', data: sampleData() };
  const s = await loadShell({ storage: makeStorage(), fetch: dataServer(state) });
  state.mode = 'ok';
  await s.checkNow();
  assert.deepEqual(lastCapes(s), ['test-alpha', 'test-beta']);
  assert.ok(s.out.logs.some((l) => /data: loaded \(tray/.test(l)));
});
