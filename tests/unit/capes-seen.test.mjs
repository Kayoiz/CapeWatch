// "Owned capes" also asks capes.me, a public cape database, which capes it has seen a player wear (app/shell.js,
// capesSeen): Mojang only tells the one being worn. capes.me runs faked here, with made-up answers in its real
// format: what the page gets, its list of capes kept for a day, the one-minute memory, and that it never fails a lookup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, dataServer, sampleData, response, settle, makeStorage } from '../lib/shell-sandbox.mjs';

const TEX = 'https://textures.minecraft.net/texture/';
const H = (c) => c.repeat(64);   // a made-up texture hash
const JEB = '853c80ef3c3749fdaa49938b674adae6';
// capes.me's list of capes as it answers: its own name for each cape, the texture, older textures
const LIST = [
  { type: 'migrator_cape', title: 'Migrator', url: TEX + H('a'), alts: [TEX + H('b')], hidden: false, users: 30926 },
  { type: 'vanilla_cape', title: 'Vanilla', url: 'http://textures.minecraft.net/texture/' + H('c'), alts: [] },
  { type: 'mojangstudios', title: 'Mojang-new', url: TEX + H('d'), alts: [] }
];
const plain = (v) => JSON.parse(JSON.stringify(v));   // a plain copy of what the shell made in its own context

// capes.me, answering for the given accounts ({ id: { name, capes } }). answer(url) may answer first.
function capesMe(accounts, { answer, list = LIST } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, ua: opts?.headers?.['User-Agent'] ?? null });
    const a = answer?.(url); if (a) return typeof a === 'function' ? a() : a;
    if (url === 'https://capes.me/api/capes') return response(list);
    const m = /^https:\/\/capes\.me\/api\/user\/([0-9a-f]{32})$/.exec(url);
    if (m) {
      const u = accounts[m[1]];
      return u ? response({ username: u.name, uuid: u.uuid ?? m[1], capes: u.capes }) : response({ error: true, message: 'not_found' }, { status: 404 });
    }
    throw new Error('unexpected address ' + url);
  };
  fn.calls = calls;
  fn.urls = () => calls.map((c) => c.url);
  return fn;
}
const JEB_ON = (capes) => ({ [JEB]: { name: 'jeb_', capes } });
const start = (http, opts = {}) => loadShell({ fetch: dataServer({ data: sampleData() }), http, ...opts });
const seen = async (s, id, name) => plain(await s.ctx.CapeWatchShell.capesSeen(id, name));

test('an account capes.me has seen: each cape as its Mojang textures on https (the current one first); taken-off capes left out', async () => {
  const http = capesMe(JEB_ON([{ type: 'mojangstudios', removed: false }, { type: 'migrator_cape', removed: false }, { type: 'vanilla_cape', removed: true }]));
  const s = await start(http);
  assert.deepEqual(await seen(s, JEB, 'jeb_'), { state: 'found', capes: [[TEX + H('d')], [TEX + H('a'), TEX + H('b')]] });
  assert.deepEqual(http.urls(), ['https://capes.me/api/user/' + JEB, 'https://capes.me/api/capes'], 'by id, and its list of capes');
  assert.ok(http.calls.every((c) => c.ua === 'CapeWatch (+https://github.com/Kayoiz/CapeWatch)'), 'says who is asking (capes.me refuses requests that do not)');
  assert.ok(s.out.file.some((l) => /capes\.me: jeb_: 2 capes seen/.test(l)), 'written to the log');
  const dashed = await start(capesMe({ [JEB]: { name: 'jeb_', uuid: '853c80ef-3c37-49fd-aa49-938b674adae6', capes: [{ type: 'vanilla_cape' }] } }));
  assert.deepEqual(await seen(dashed, JEB.toUpperCase(), 'jeb_'), { state: 'found', capes: [[TEX + H('c')]] }, 'an id with dashes or capitals is the same id');
});

test('an account capes.me has not seen: "unknown", nothing more', async () => {
  const http = capesMe({}), s = await start(http);
  assert.deepEqual(await seen(s, JEB, 'jeb_'), { state: 'unknown', capes: [] });
  assert.ok(s.out.file.some((l) => /capes\.me: jeb_: not seen there/.test(l)));
});

test('capes.me cannot be reached, fails or answers oddly: "failed" (logged), never an error for the page', async () => {
  const cases = {
    offline: () => { throw new TypeError('Failed to fetch'); },
    error500: response('oops', { status: 500 }),
    tooMany: response('', { status: 429 }),
    refused: response('<html>Just a moment...</html>', { status: 403 }),
    notJson: response('<html>not json</html>')
  };
  for (const [what, a] of Object.entries(cases)) {
    const s = await start(capesMe(JEB_ON([{ type: 'migrator_cape' }]), { answer: () => a }));
    assert.deepEqual(await seen(s, JEB, 'jeb_'), { state: 'failed', capes: [] }, what);
    assert.ok(s.out.file.some((l) => /^\[App\] capes\.me: jeb_: /.test(l)), what + ': written to the log');
  }
  const odd = {
    someoneElse: response({ username: 'x', uuid: '0'.repeat(32), capes: [{ type: 'migrator_cape' }] }),
    noCapes: response({ username: 'jeb_', uuid: JEB }),
    capesNotAList: response({ username: 'jeb_', uuid: JEB, capes: 'migrator_cape' })
  };
  for (const [what, a] of Object.entries(odd)) {
    const s = await start(capesMe({}, { answer: (u) => (u.includes('/user/') ? a : null) }));
    assert.deepEqual(await seen(s, JEB, 'jeb_'), { state: 'failed', capes: [] }, what);
  }
  const noList = await start(capesMe(JEB_ON([{ type: 'migrator_cape' }]), { answer: (u) => (u.endsWith('/capes') ? response({ nope: 1 }) : null) }));
  assert.deepEqual(await seen(noList, JEB, 'jeb_'), { state: 'failed', capes: [] }, 'no list of capes: names cannot be turned into textures');
  const http = capesMe({}), bad = await start(http);
  for (const id of ['', 'zz', '../../x', JEB + '0', null, undefined]) assert.deepEqual(await seen(bad, id), { state: 'failed', capes: [] }, String(id));
  assert.equal(http.calls.length, 0, 'nothing sent for an id that cannot be one');
});

test('no answer within 6 seconds: "failed", and the late answer is dropped', async () => {
  let late = null;
  const http = capesMe(JEB_ON([{ type: 'migrator_cape' }]), { answer: (u) => (u.includes('/user/') ? () => new Promise((r) => { late = r; }) : null) });
  const s = await start(http);
  const asked = s.ctx.CapeWatchShell.capesSeen(JEB, 'jeb_');
  await settle();
  const wait = s.out.timeouts.find((t) => t.ms === 6000);
  assert.ok(wait, 'waits 6 s at most');
  wait.fn();
  assert.deepEqual(plain(await asked), { state: 'failed', capes: [] });
  assert.ok(s.out.file.some((l) => /capes\.me: jeb_: no answer within 6 s/.test(l)));
  late(response({ username: 'jeb_', uuid: JEB, capes: [{ type: 'migrator_cape' }] }));
  await settle();
  assert.deepEqual(s.out.errors, []);
  assert.equal(s.out.file.filter((l) => /capes\.me: jeb_:/.test(l)).length, 1, 'nothing more about it');
});

test('its list of capes: asked once a day and kept in storage; when it cannot be loaded, the kept one is used', async () => {
  let now = 1_800_000_000_000;
  const storage = makeStorage(), accounts = JEB_ON([{ type: 'migrator_cape' }]);
  const a = capesMe(accounts), s = await start(a, { storage, clock: () => now });
  await seen(s, JEB, 'jeb_');
  assert.equal(a.urls().filter((u) => u.endsWith('/capes')).length, 1);
  assert.equal(storage.json('capesMe').list.length, 3, 'kept');
  now += 3600e3;   // CapeWatch starts again an hour later: only the player is asked
  const b = capesMe(accounts), s2 = await start(b, { storage, clock: () => now });
  assert.deepEqual(await seen(s2, JEB, 'jeb_'), { state: 'found', capes: [[TEX + H('a'), TEX + H('b')]] });
  assert.deepEqual(b.urls(), ['https://capes.me/api/user/' + JEB]);
  now += 48 * 3600e3;   // two days later the list is asked again, and fails: the kept one still does the job
  const c = capesMe(accounts, { answer: (u) => (u.endsWith('/capes') ? response('oops', { status: 500 }) : null) });
  const s3 = await start(c, { storage, clock: () => now });
  assert.deepEqual(await seen(s3, JEB, 'jeb_'), { state: 'found', capes: [[TEX + H('a'), TEX + H('b')]] });
  assert.ok(s3.out.file.some((l) => /list of capes not loaded \(answer 500\), using the one kept 49 h ago/.test(l)));
  const broken = makeStorage({ 'capewatch:capesMe': '{"at":"soon","list":"nope"}' });   // a damaged copy is not used
  const d = capesMe(accounts), s4 = await start(d, { storage: broken });
  assert.equal((await seen(s4, JEB, 'jeb_')).state, 'found');
  assert.equal(d.urls().filter((u) => u.endsWith('/capes')).length, 1);
});

test('a cape newer than the kept list: the list is asked again, at most every 10 minutes', async () => {
  const now = 1_800_000_000_000;
  const storage = makeStorage({ 'capewatch:capesMe': JSON.stringify({ at: now - 3600e3, list: LIST.slice(0, 2) }) });   // kept an hour ago, before Mojang Studios
  const http = capesMe(JEB_ON([{ type: 'mojangstudios' }, { type: 'migrator_cape' }]));
  const s = await start(http, { storage, clock: () => now });
  assert.deepEqual((await seen(s, JEB, 'jeb_')).capes, [[TEX + H('d')], [TEX + H('a'), TEX + H('b')]]);
  assert.equal(http.urls().filter((u) => u.endsWith('/capes')).length, 1, 'asked again for the new cape');
  // a cape capes.me's own list has no texture for: left out, and the list is not asked again so soon
  const odd = capesMe(JEB_ON([{ type: 'mystery' }, { type: 'migrator_cape' }]));
  const s2 = await start(odd, { storage, clock: () => now + 5 * 60e3 });
  assert.deepEqual((await seen(s2, JEB, 'jeb_')).capes, [[TEX + H('a'), TEX + H('b')]]);
  assert.equal(odd.urls().filter((u) => u.endsWith('/capes')).length, 0);
  assert.ok(s2.out.file.some((l) => /capes\.me: jeb_: "mystery" is not on its list of capes/.test(l)));
});

test('only Mojang texture addresses get through, and odd names in the list do no harm', async () => {
  const list = [
    { type: 'evil', url: 'https://evil.example/texture/' + H('e'), alts: ['javascript:alert(1)', TEX + '../x'] },
    { type: '__proto__', url: TEX + H('f'), alts: [] },
    { type: 'constructor', url: TEX + H('1'), alts: [] },
    { type: '<img src=x>', url: TEX + H('2'), alts: [] },
    { type: 'many', url: TEX + H('3'), alts: Array.from({ length: 20 }, (_, i) => TEX + String(i % 10).repeat(64)) },
    ...LIST
  ];
  const types = ['evil', '__proto__', 'constructor', '<img src=x>', 'toString', 'many', 'vanilla_cape'].map((type) => ({ type }));
  const s = await start(capesMe(JEB_ON(types), { list }));
  const r = await seen(s, JEB, 'jeb_');
  assert.deepEqual(r.capes.map((x) => x[0]), [TEX + H('f'), TEX + H('1'), TEX + H('3'), TEX + H('c')]);
  assert.equal(r.capes[2].length, 8, 'at most 8 textures for one cape');
  assert.deepEqual(s.out.errors, []);
});

test('one minute of memory: lookups at the same moment share one request; a failed answer is not kept', async () => {
  let now = 1_800_000_000_000, down = false;
  const http = capesMe(JEB_ON([{ type: 'migrator_cape' }]), { answer: (u) => (down && u.includes('/user/') ? response('', { status: 500 }) : null) });
  const s = await start(http, { clock: () => now });
  const asks = () => http.urls().filter((u) => u.includes('/user/')).length;
  const [a, b] = await Promise.all([seen(s, JEB, 'jeb_'), seen(s, JEB.toUpperCase(), 'jeb_')]);
  assert.deepEqual(a, b);
  assert.equal(asks(), 1, 'two lookups at once: one request');
  now += 30e3; await seen(s, JEB, 'jeb_');
  assert.equal(asks(), 1, 'half a minute later: the answer kept');
  now += 31e3; down = true;
  assert.equal((await seen(s, JEB, 'jeb_')).state, 'failed', 'after a minute: asked again');
  down = false;
  assert.equal((await seen(s, JEB, 'jeb_')).state, 'found', 'right after a failure: asked again');
  assert.equal(asks(), 3);
});

test('at most 20 lookups a minute at capes.me: the 21st is not sent, a minute later it is', async () => {
  let now = 1_800_000_000_000;
  const accounts = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [(i + 1).toString(16).padStart(32, '0'), { name: 'p' + i, capes: [{ type: 'migrator_cape' }] }]));
  const http = capesMe(accounts), s = await start(http, { clock: () => now });
  const ids = Object.keys(accounts), users = () => http.urls().filter((u) => u.includes('/user/')).length;
  for (let i = 0; i < 20; i++) assert.equal((await seen(s, ids[i], 'p' + i)).state, 'found');
  assert.equal(users(), 20);
  assert.deepEqual(await seen(s, ids[20], 'p20'), { state: 'failed', capes: [] });
  assert.equal(users(), 20, 'not sent');
  assert.ok(s.out.file.some((l) => /capes\.me: p20: not asked, 20 lookups in the last minute/.test(l)));
  now += 60e3;
  assert.equal((await seen(s, ids[20], 'p20')).state, 'found');
});
