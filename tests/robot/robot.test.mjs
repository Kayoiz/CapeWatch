// Task 3: the robot (robot/robot.mjs) with saved sample answers instead of the real wiki.
// A wiki page that changed, a page that does not load, missing data, dates and time zones.
// The sample answers are in tests/fixtures/robot/ (invented capes, no wiki text).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIX = new URL('../fixtures/robot/', import.meta.url);
const ROBOT = new URL('../../robot/robot.mjs', import.meta.url);
delete process.env.GITHUB_TOKEN;   // never call GitHub Models from the tests: the robot uses its templates
const robot = await import(ROBOT);

// Fake wiki: answers from the sample files; `broken` titles answer HTTP 500, `down` makes every call fail.
const wiki = { down: false, broken: new Set(['Sample Broken Page Cape']), calls: [] };
const realFetch = globalThis.fetch;
const quiet = console.log;
beforeEach(() => {
  wiki.down = false; wiki.calls = [];
  console.log = () => {};
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    wiki.calls.push(u.searchParams.get('titles') || u.searchParams.get('list') || u.host);
    if (u.host !== 'minecraft.wiki') throw new Error('the robot test tried to reach ' + u.host);
    if (wiki.down) return new Response('Service Unavailable', { status: 503 });
    if (u.searchParams.get('list') === 'categorymembers') return new Response(readFileSync(new URL('category.json', FIX)));
    const title = u.searchParams.get('titles');
    if (wiki.broken.has(title)) return new Response('<html>error</html>', { status: 500 });
    const f = new URL('pages/' + title + '.wikitext', FIX);
    const content = existsSync(f) ? readFileSync(f, 'utf8') : null;
    const page = content == null ? { title, missing: true } : { title, revisions: [{ slots: { main: { content } } }] };
    return new Response(JSON.stringify({ query: { pages: [page] } }));
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.log = quiet; });

const AT = '2026-10-04T06:00:00Z', NOW = Date.parse(AT);
const known = () => ({
  schema: 1, status: {},
  capes: { 'known-sample': { name: 'Known Sample Cape', wikiTitle: 'Known Sample Cape', apiAlias: 'Known', editions: ['java'], availability: 'ended', category: 'other' } },
  events: {}
});

test('a new cape page on the wiki: added with its facts, texts in 7 languages and one "new" event', async () => {
  const data = known();
  const result = await robot.check(data, { at: AT, now: NOW });
  const c = data.capes['sample-sunrise'];
  assert.ok(c, 'added under its id');
  assert.equal(c.name, 'Sample Sunrise Cape');
  assert.deepEqual(c.editions, ['java', 'bedrock']);
  assert.equal(c.apiAlias, 'sunrise');
  assert.equal(c.textureId, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  for (const l of ['En', 'He', 'Es', 'Pt', 'Fr', 'De', 'Ru']) { assert.ok(c['obtain' + l], 'obtain' + l); assert.ok(c['short' + l], 'short' + l); }
  assert.ok(!JSON.stringify(c).includes('invented cape used only'), 'no sentence copied from the page');
  const evs = Object.values(data.events).filter((e) => e.capeId === 'sample-sunrise');
  assert.deepEqual(evs.map((e) => e.type), ['new']);
  assert.match(result, /^2 new, 0 changed; problems: page Sample Broken Page Cape$/);
});

test('a cape the robot already knows is never changed by an edit of its wiki page', async () => {
  const data = known();
  const before = JSON.stringify(data.capes['known-sample']);
  await robot.check(data, { at: AT, now: NOW });
  assert.equal(JSON.stringify(data.capes['known-sample']), before);
  assert.ok(!wiki.calls.includes('Known Sample Cape'), 'its page is not even read');
});

test('pages that are not a cape (lists, galleries, duplicates, the main Cape page) are skipped', async () => {
  const data = known();
  await robot.check(data, { at: AT, now: NOW });
  const names = Object.values(data.capes).map((c) => c.name).sort();
  assert.deepEqual(names, ['Known Sample Cape', 'Sample Bedrock Only Cape', 'Sample Sunrise Cape']);
});

test('missing facts on a page: no texture id or API name is fine, and nothing is invented for them', async () => {
  const data = known();
  await robot.check(data, { at: AT, now: NOW });
  const c = data.capes['sample-bedrock-only'];
  assert.deepEqual(c.editions, ['bedrock']);
  assert.ok(!('textureId' in c) && !('apiAlias' in c), 'empty fields are left out, not written as ""');
});

test('a page that does not load: the other pages still go through, the problem is in the status line', async () => {
  const data = known();
  await robot.check(data, { at: AT, now: NOW });
  assert.ok(data.capes['sample-sunrise']);
  assert.match(data.status.lastResult, /problems: page Sample Broken Page Cape/);
  assert.equal(data.status.lastCheckAt, AT);
});

test('the wiki is down: nothing is added or removed, the status line says so', async () => {
  wiki.down = true;
  const data = known();
  const before = JSON.stringify(data.capes);
  const result = await robot.check(data, { at: AT, now: NOW });
  assert.equal(JSON.stringify(data.capes), before);
  assert.match(result, /wiki category unreachable/);
  assert.equal(data.status.capeCount, 1);
});

test('a data file without an events list (or capes list) does not stop the robot', async () => {
  wiki.down = true;
  const data = { schema: 1, status: {}, capes: { x: { name: 'X', availability: 'available', availableUntil: '2026-10-01' } } };
  await robot.check(data, { at: AT, now: NOW });
  assert.equal(data.capes.x.availability, 'ended');
  assert.equal(Object.values(data.events)[0].type, 'ended');
  const empty = {};
  await robot.check(empty, { at: AT, now: NOW });
  assert.deepEqual(empty.capes, {});
});

// ---------- dates ----------
const promo = (c) => ({ schema: 1, status: {}, capes: { p: { name: 'Promo Cape', ...c } }, events: {} });
const run = async (c, at) => { wiki.down = true; const d = promo(c); await robot.check(d, { at, now: Date.parse(at) }); return d; };
const types = (d) => Object.values(d.events).map((e) => e.type);

test('a promotion opens on its first day at 00:00 UTC, not before', async () => {
  const c = { availability: 'announced', availableFrom: '2026-10-05', availableUntil: '2026-10-20' };
  assert.equal((await run(c, '2026-10-04T23:59:00Z')).capes.p.availability, 'announced');
  const d = await run(c, '2026-10-05T00:00:00Z');
  assert.equal(d.capes.p.availability, 'available');
  assert.deepEqual(types(d), ['available']);
});

test('a promotion runs through its whole last day (until 23:59:59 UTC)', async () => {
  const c = { availability: 'available', availableUntil: '2026-10-20', remindedAt: '2026-10-19T00:00:00Z' };
  assert.equal((await run(c, '2026-10-20T23:59:00Z')).capes.p.availability, 'available');
  const d = await run(c, '2026-10-21T00:00:00Z');
  assert.equal(d.capes.p.availability, 'ended');
  assert.deepEqual(types(d), ['ended']);
});

test('"ending soon" comes once, within the last 48 hours', async () => {
  const c = { availability: 'available', availableUntil: '2026-10-20' };
  assert.deepEqual(types(await run(c, '2026-10-18T23:00:00Z')), [], '49 hours before the end: not yet');
  const d = await run(c, '2026-10-19T01:00:00Z');
  assert.deepEqual(types(d), ['ending']);
  wiki.down = true;
  await robot.check(d, { at: '2026-10-19T13:00:00Z', now: Date.parse('2026-10-19T13:00:00Z') });
  assert.deepEqual(types(d), ['ending'], 'the next check does not repeat it');
});

test('an exact end time with a time zone is respected', async () => {
  const c = { availability: 'available', availableUntil: '2026-10-20T10:00:00-07:00', remindedAt: 'x' };   // 17:00 UTC
  assert.equal((await run(c, '2026-10-20T16:59:00Z')).capes.p.availability, 'available');
  assert.equal((await run(c, '2026-10-20T17:00:00Z')).capes.p.availability, 'ended');
});

test('a whole promotion between two checks (opened and closed while the robot was not running) ends up "ended"', async () => {
  const d = await run({ availability: 'announced', availableFrom: '2026-10-01', availableUntil: '2026-10-02' }, '2026-10-04T06:00:00Z');
  assert.equal(d.capes.p.availability, 'ended');
  assert.deepEqual(types(d), ['ended']);
});

test('a date the robot cannot read is ignored, not treated as "now" or "1970"', async () => {
  const d = await run({ availability: 'available', availableUntil: 'TBA' }, AT);
  assert.equal(d.capes.p.availability, 'available');
  assert.deepEqual(types(d), []);
});

test('the event ids are made from UTC time, so they sort in time order', async () => {
  const d = await run({ availability: 'available', availableUntil: '2026-10-01' }, '2026-10-04T06:07:08Z');
  assert.deepEqual(Object.keys(d.events), ['20261004-0607-p-ended']);
});

test('same result in every time zone of the computer running it', () => {
  const script = `
    const r = await import(${JSON.stringify(ROBOT.href)});
    globalThis.fetch = async () => new Response('down', { status: 503 });
    console.log = () => {};
    const out = [];
    for (const [c, at] of [
      [{ availability: 'announced', availableFrom: '2026-10-05', availableUntil: '2026-10-20' }, '2026-10-05T00:30:00Z'],
      [{ availability: 'available', availableUntil: '2026-10-20' }, '2026-10-19T02:00:00Z'],
      [{ availability: 'available', availableUntil: '2026-10-20' }, '2026-10-21T00:00:01Z'],
      [{ availability: 'available', availableUntil: '2026-10-20T10:00:00-07:00' }, '2026-10-20T17:00:00Z']
    ]) { const d = { capes: { p: { name: 'P', ...c } }, events: {} }; await r.check(d, { at, now: Date.parse(at) }); out.push(d.capes.p.availability + ':' + Object.keys(d.events).join(',')); }
    process.stdout.write(JSON.stringify(out));`;
  const results = ['UTC', 'America/Los_Angeles', 'Asia/Jerusalem', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'].map((TZ) =>
    [TZ, execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' })]);
  for (const [tz, r] of results) assert.equal(r, results[0][1], tz + ' differs from UTC');
  assert.deepEqual(JSON.parse(results[0][1]), ['available:20261005-0030-p-available', 'available:20261019-0200-p-ending', 'ended:20261021-0000-p-ended', 'ended:20261020-1700-p-ended']);
});

// ---------- the word filter (robot/offensive.mjs), on the owner's rules ----------
// The wiki answers as usual, plus one more cape page in the category: `title`, with the facts of Sample Sunrise Cape.
function withExtraCape(title) {
  const wikiFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = new URL(String(url));
    if (u.searchParams.get('list') === 'categorymembers') {
      const j = JSON.parse(readFileSync(new URL('category.json', FIX), 'utf8'));
      j.query.categorymembers.push({ ns: 0, title });
      return new Response(JSON.stringify(j));
    }
    if (u.searchParams.get('titles') === title) {
      const content = readFileSync(new URL('pages/Sample Sunrise Cape.wikitext', FIX), 'utf8');
      return new Response(JSON.stringify({ query: { pages: [{ title, revisions: [{ slots: { main: { content } } }] }] } }));
    }
    return wikiFetch(url, opts);
  };
}

test('rule 1: a cape\'s official name is never checked: a name with a listed word is published and notified as usual', async () => {
  withExtraCape('Sample Sh1t Cape');
  const data = known(), replaced = [];
  await robot.check(data, { at: AT, now: NOW, replaced });
  const c = data.capes['sample-sh1t'];
  assert.ok(c, 'added');
  assert.equal(c.name, 'Sample Sh1t Cape');
  assert.ok(Object.values(data.events).some((e) => e.capeId === 'sample-sh1t' && e.type === 'new'), 'and notified');
  assert.deepEqual(replaced, [], 'its texts (the templates, with its name) are not replaced either');
});

test('rules 2 and 6: a model text with a listed word becomes the template sentence, only that one; the cape goes out; logged with the word and field', async () => {
  process.env.GITHUB_TOKEN = 'test-token';
  const answer = { availability: 'available', availableFrom: '2026-10-01', availableUntil: '2026-10-31', cost: 'free' };
  for (const l of ['En', 'He', 'Es', 'Pt', 'Fr', 'De', 'Ru']) { answer['obtain' + l] = 'Text ' + l; answer['short' + l] = 'Short ' + l; }
  answer.obtainEs = 'Consíguela antes de que termine, hijo de puta.';
  answer.shortEn = 'Get the Zombie Horse cape at the Trial Chambers.';   // names from the game: never marked
  const wikiFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => String(url).startsWith('https://models.github.ai/')
    ? new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
    : wikiFetch(url, opts);
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  try {
    const data = known(), replaced = [];
    await robot.check(data, { at: AT, now: NOW, replaced });
    const c = data.capes['sample-sunrise'];
    assert.ok(c, 'published');
    assert.notEqual(c.obtainEs, answer.obtainEs, 'the marked text is not used');
    assert.match(c.obtainEs, /Sample Sunrise Cape/, 'the template sentence, with the cape\'s name');
    assert.equal(c.obtainEn, 'Text En', 'the other texts are the model\'s');
    assert.equal(c.shortEn, answer.shortEn);
    assert.equal(c.availability, 'available', 'and its facts are kept');
    assert.ok(Object.values(data.events).some((e) => e.capeId === 'sample-sunrise' && e.type === 'new'), 'notified as usual');
    assert.deepEqual(replaced.filter((r) => r.id === 'sample-sunrise'), [{ id: 'sample-sunrise', cape: 'Sample Sunrise Cape', field: 'obtainEs', word: 'hijo de puta' }]);
    assert.ok(lines.some((l) => /filter: obtainEs of sample-sunrise replaced by the template \(word: "hijo de puta"\)/.test(l)), 'in the log: the word and the field');
    const msg = robot.filterReport(replaced);
    assert.match(msg, /Sample Sunrise Cape.*obtainEs.*hijo de puta/);
  } finally { delete process.env.GITHUB_TOKEN; }
});

// ---------- texts written by GitHub Models ----------
test('answers from GitHub Models with wrong values are cleaned before they reach the data file', async () => {
  process.env.GITHUB_TOKEN = 'test-token';
  const answer = { availability: 'soon!', availableFrom: 'next week', availableUntil: '2026-10-31', cost: 'cheap' };
  for (const l of ['En', 'He', 'Es', 'Pt', 'Fr', 'De', 'Ru']) { answer['obtain' + l] = 'Text ' + l; answer['short' + l] = 'Short ' + l; }
  const wikiFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => String(url).startsWith('https://models.github.ai/')
    ? new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
    : wikiFetch(url, opts);
  try {
    const data = known();
    await robot.check(data, { at: AT, now: NOW });
    const c = data.capes['sample-sunrise'];
    assert.equal(c.obtainEn, 'Text En');
    assert.equal(c.availability, 'announced', 'an unknown availability becomes "announced"');
    assert.ok(!('availableFrom' in c) || c.availableFrom === null, 'a date that is not a date is dropped');
    assert.equal(c.availableUntil, '2026-10-31');
    assert.ok(!('cost' in c), 'an unknown cost is left out');
  } finally { delete process.env.GITHUB_TOKEN; }
});

test('the robot file still runs as a program; --dry reads the data file and does not write it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-robot-'));
  const file = join(dir, 'capewatch.json');
  writeFileSync(file, JSON.stringify(known()));
  const before = readFileSync(file, 'utf8');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.fetch = async () => new Response('down', { status: 503 });
    process.argv[1] = ${JSON.stringify(fileURLToPath(ROBOT))}; process.argv.push('--dry');
    await import(${JSON.stringify(ROBOT.href)});`], { env: { ...process.env, CAPEWATCH_DATA: file }, encoding: 'utf8' });
  assert.match(out, /result: 0 new, 0 changed; problems: wiki category unreachable/);
  assert.match(out, /dry run: file not written/);
  assert.equal(readFileSync(file, 'utf8'), before);
  rmSync(dir, { recursive: true, force: true });
});
