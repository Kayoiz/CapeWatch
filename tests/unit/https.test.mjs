// Every address the installed app reaches is encrypted (https): its security policy, the HTTP plugin's list, the links
// it may open, the update address, and every address written in the page and the app shell. The only "http" names
// are not on the network: Tauri's own channel inside the app (ipc.localhost) and the SVG namespace. Mojang's answers
// give texture addresses as http; the shell turns them into https before anything is loaded (tests/unit/player.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CONF = JSON.parse(readFileSync(new URL('../../app/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const CAPS = JSON.parse(readFileSync(new URL('../../app/src-tauri/capabilities/default.json', import.meta.url), 'utf8'));
const LOCAL = new Set(['http://ipc.localhost']);

test('the security policy names only https addresses (and the app’s own channel inside it)', () => {
  const seen = [];
  for (const [directive, value] of Object.entries(CONF.app.security.csp)) {
    for (const src of value.split(/\s+/)) if (/^[a-z]+:\/\//i.test(src)) { seen.push(src); assert.ok(src.startsWith('https://') || LOCAL.has(src), directive + ': ' + src); }
  }
  assert.ok(seen.length >= 5);
});

test('the HTTP plugin, the links the app may open and the update address: https only (mail links aside)', () => {
  const urls = CAPS.permissions.filter((p) => typeof p === 'object').flatMap((p) => p.allow || []).map((a) => a.url);
  assert.ok(urls.length > 5);
  for (const u of urls) assert.ok(u.startsWith('https://') || u.startsWith('mailto:'), u);
  assert.ok(CONF.plugins.updater.endpoints.length > 0);
  for (const u of CONF.plugins.updater.endpoints) assert.ok(u.startsWith('https://'), u);
});

test('no plain http address in the page or the app shell', () => {
  for (const f of ['../../cape-radar.html', '../../app/shell.js']) {
    const s = readFileSync(new URL(f, import.meta.url), 'utf8');
    const plain = [...s.matchAll(/http:\/\/[^\s'"`)<>\\]+/g)].map((m) => m[0]).filter((u) => u !== 'http://www.w3.org/2000/svg');
    assert.deepEqual(plain, [], f);
  }
});
