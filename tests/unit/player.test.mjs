// "Owned capes" and the figure's skin look a Minecraft player up at Mojang through the app shell (app/shell.js).
// The shell runs here with Mojang faked (made-up answers in Mojang's real format): what it gives the page for a
// player, every way a lookup can fail, the one-minute memory and Mojang's "too many requests".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, dataServer, sampleData, response, settle, makeStorage } from '../lib/shell-sandbox.mjs';

const JEB = { id: '853c80ef3c3749fdaa49938b674adae6', name: 'jeb_', skin: '7fd9ba42a7c81eeea22f1524271ae85a8e045ce0af5a6ae16c6406ae917e68b5', cape: '9e507afc56359978a3eb3e32367042b853cddd0995d17d0da995662913fb00f7' };
const NOTCH = { id: '069a79f444e94726a5befca90e38aaf5', name: 'Notch', skin: '292009a4925b58f02c77dadc3ecef07ea4c7472f64e0fdc32ce5522489362680' };
const TEX = 'https://textures.minecraft.net/texture/';
const plain = (v) => JSON.parse(JSON.stringify(v));   // a plain copy of what the shell made in its own context

// Mojang's two addresses, answering for the given players. answer(url) may answer first (an error, an odd reply).
function mojang(players, answer) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const a = answer?.(url); if (a) return typeof a === 'function' ? a() : a;
    let m = /^https:\/\/api\.mojang\.com\/users\/profiles\/minecraft\/(.+)$/.exec(url);
    if (m) {
      const p = players.find((x) => x.name.toLowerCase() === decodeURIComponent(m[1]).toLowerCase());
      return p ? response({ id: p.id, name: p.name }) : response({ errorMessage: 'Couldn\'t find any profile' }, { status: 404 });
    }
    m = /^https:\/\/sessionserver\.mojang\.com\/session\/minecraft\/profile\/([0-9a-f]{32})$/.exec(url);
    if (m) {
      const p = players.find((x) => x.id === m[1]);
      if (!p) return response('', { status: 204 });
      const textures = { SKIN: { url: p.skinUrl || 'http://textures.minecraft.net/texture/' + p.skin } };
      if (p.cape || p.capeUrl) textures.CAPE = { url: p.capeUrl || 'http://textures.minecraft.net/texture/' + p.cape };
      return response({ id: p.id, name: p.name, properties: [{ name: 'textures', value: Buffer.from(JSON.stringify({ timestamp: 1, textures })).toString('base64') }] });
    }
    throw new Error('unexpected address ' + url);
  };
  fn.calls = calls;
  return fn;
}
const start = (http, opts = {}) => loadShell({ fetch: dataServer({ data: sampleData() }), http, ...opts });
async function ask(shell, name) {
  try { return { ok: plain(await shell.ctx.CapeWatchShell.player(name)) }; } catch (e) { return { code: e.code, message: String(e.message) }; }
}

test('a player who wears a cape: id, the name as Mojang writes it, skin and cape on https', async () => {
  const http = mojang([JEB]), s = await start(http);
  assert.deepEqual(await ask(s, 'JEB_'), { ok: { id: JEB.id, name: 'jeb_', skin: TEX + JEB.skin, cape: TEX + JEB.cape } });
  assert.equal(http.calls.length, 2, 'one request for the id, one for the skin and cape');
  assert.ok(s.out.file.some((l) => /player: jeb_ found, wearing a cape/.test(l)), 'written to the log');
});

test('a player who wears no cape: cape is empty', async () => {
  const s = await start(mojang([NOTCH]));
  assert.deepEqual(await ask(s, 'Notch'), { ok: { id: NOTCH.id, name: 'Notch', skin: TEX + NOTCH.skin, cape: null } });
});

test('a name that cannot be a Minecraft name is refused before anything is sent', async () => {
  const http = mojang([JEB]), s = await start(http);
  for (const name of ['', '   ', 'a b', 'name!', 'x'.repeat(17), '<img src=x>', '../../x', 'שם']) {
    assert.equal((await ask(s, name)).code, 'invalid', JSON.stringify(name));
  }
  assert.equal(http.calls.length, 0);
  assert.equal((await ask(s, '  jeb_  ')).ok?.name, 'jeb_', 'spaces around a name are dropped');
});

test('no such player: at the first address (404) or the second one (204)', async () => {
  const s = await start(mojang([JEB]));
  assert.equal((await ask(s, 'nobody_here')).code, 'notfound');
  const gone = await start(mojang([JEB], (u) => (u.includes('sessionserver') ? response('', { status: 204 }) : null)));
  assert.equal((await ask(gone, 'jeb_')).code, 'notfound', 'the id exists but the profile does not answer');
});

test('no internet, a server error or an answer in another format: "network", nothing invented', async () => {
  const cases = {
    offline: () => { throw new TypeError('Failed to fetch'); },
    error500: response('oops', { status: 500 }),
    noId: response({ name: 'jeb_' }),
    badId: response({ id: '../../etc', name: 'jeb_' })
  };
  for (const [what, a] of Object.entries(cases)) {
    const s = await start(mojang([JEB], () => a));
    assert.equal((await ask(s, 'jeb_')).code, 'network', what);
  }
  const odd = {
    noProperties: response({ id: JEB.id, name: 'jeb_' }),
    notBase64: response({ id: JEB.id, name: 'jeb_', properties: [{ name: 'textures', value: '%%%' }] }),
    notJson: response({ id: JEB.id, name: 'jeb_', properties: [{ name: 'textures', value: Buffer.from('nope').toString('base64') }] })
  };
  for (const [what, a] of Object.entries(odd)) {
    const s = await start(mojang([JEB], (u) => (u.includes('sessionserver') ? a : null)));
    assert.equal((await ask(s, 'jeb_')).code, 'network', what);
  }
});

test('skin or cape addresses that are not Mojang\'s texture server are dropped', async () => {
  const s = await start(mojang([{ ...JEB, capeUrl: 'https://evil.example/texture/' + JEB.cape, skinUrl: 'javascript:alert(1)' }]));
  assert.deepEqual((await ask(s, 'jeb_')).ok, { id: JEB.id, name: 'jeb_', skin: null, cape: null });
});

test('one minute of memory: lookups at the same moment share one request, a new one goes out after a minute', async () => {
  let now = 1_000_000;
  const http = mojang([JEB]), s = await start(http, { clock: () => now });
  const [a, b] = await Promise.all([ask(s, 'jeb_'), ask(s, 'Jeb_')]);
  assert.deepEqual(a, b);
  assert.equal(http.calls.length, 2, 'two lookups at once: one request pair');
  now += 30e3; await ask(s, 'jeb_');
  assert.equal(http.calls.length, 2, 'half a minute later: the answer kept');
  now += 31e3; await ask(s, 'jeb_');
  assert.equal(http.calls.length, 4, 'after a minute: asked again');
});

test('Mojang says "too many": the last answer if there is one, else "rate"', async () => {
  let now = 1_000_000, busy = false;
  const http = mojang([JEB], () => (busy ? response('', { status: 429 }) : null));
  const s = await start(http, { clock: () => now });
  busy = true;
  assert.equal((await ask(s, 'jeb_')).code, 'rate', 'never answered before');
  busy = false; await ask(s, 'jeb_');
  now += 5 * 60e3; busy = true;
  assert.equal((await ask(s, 'jeb_')).ok?.cape, TEX + JEB.cape, 'the answer from 5 minutes ago');
  assert.ok(s.out.file.some((l) => /too many requests, using the answer from 5 min ago/.test(l)));
});

test('the skin from Settings and "Owned capes" asking for the same player at start: one request pair', async () => {
  const http = mojang([JEB]);
  const storage = makeStorage({ 'capewatch:settings': JSON.stringify({ skinName: 'jeb_' }) });
  const s = await start(http, { storage });
  let skin = null;
  s.ctx.CapeWatchPage = { cape3d: { setSkin: async (url) => { skin = url; return true; }, setInvertDrag() {}, setVisible() {} } };
  await s.fire('DOMContentLoaded');   // the shell puts the saved skin on the figure
  const owned = await ask(s, 'jeb_');   // the page looks the same player up
  await settle();
  assert.equal(skin, TEX + JEB.skin);
  assert.equal(owned.ok?.name, 'jeb_');
  assert.equal(http.calls.length, 2);
  assert.equal(s.ctx.CapeWatchShell.skinName(), 'jeb_', 'the page can start the name box with the skin name');
});

test('by id (the check at start): the name the player has now; one answer serves lookups by name and by id', async () => {
  const http = mojang([{ ...JEB, name: 'jeb_new' }]), s = await start(http);
  const byId = await s.ctx.CapeWatchShell.playerById(JEB.id.toUpperCase(), 'jeb_').then(plain);
  assert.equal(byId.name, 'jeb_new', 'renamed since');
  assert.equal(byId.cape, TEX + JEB.cape);
  assert.equal(http.calls.length, 1, 'by id is one request');
  assert.equal((await ask(s, 'jeb_new')).ok?.id, JEB.id);
  assert.equal(http.calls.length, 1, 'the same answer found by the new name');
  const fresh = mojang([JEB]), t = await start(fresh);
  await ask(t, 'jeb_');
  await t.ctx.CapeWatchShell.playerById(JEB.id, 'jeb_');
  assert.equal(fresh.calls.length, 2, 'looked up by name first: by id needs no request');
  for (const id of ['', 'zz', '../../x', JEB.id + '0']) assert.equal(await t.ctx.CapeWatchShell.playerById(id).then(() => 'ok', (e) => e.code), 'invalid', id);
});

test('at most 20 lookups a minute at Mojang: the 21st is not sent ("rate"), a kept answer still comes, a minute later it is sent', async () => {
  let now = 1_000_000;
  const players = Array.from({ length: 21 }, (_, i) => ({ ...JEB, id: (i + 1).toString(16).padStart(32, '0'), name: 'p' + i }));
  const http = mojang(players), s = await start(http, { clock: () => now });
  for (let i = 0; i < 20; i++) assert.ok((await ask(s, 'p' + i)).ok, 'lookup ' + (i + 1));
  const sent = http.calls.length;
  assert.equal((await ask(s, 'p20')).code, 'rate');
  assert.equal(http.calls.length, sent, 'not sent');
  assert.ok(s.out.file.some((l) => /p20: not asked, 20 lookups in the last minute/.test(l)));
  assert.ok((await ask(s, 'p3')).ok, 'an answer kept in memory still comes');
  now += 60e3;
  assert.ok((await ask(s, 'p20')).ok, 'a minute later it is asked');
});
