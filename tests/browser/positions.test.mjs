// Switching language never moves anything: every box (buttons, menus, settings, cards, figure, catalog, both
// windows) is at the same place and of the same size in all 7 languages, at the narrowest window (400 px) and a
// wide one (1200 px). Words inside a sentence (a link in a paragraph) follow the text and are not compared.
// tools/lang-positions.mjs makes the pictures of all 7 languages one above the other, for looking.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, EDGE } from '../lib/edge.mjs';
import { fakeTauri } from '../lib/fake-tauri.mjs';
import { testCape } from '../lib/png.mjs';

const PAGE = fileUrl(fileURLToPath(new URL('../../app/dist/index.html', import.meta.url)));
const DATA = JSON.parse(readFileSync(new URL('../../data/capewatch.json', import.meta.url), 'utf8'));
const LANGS = ['en', 'he', 'es', 'pt', 'fr', 'de', 'ru'];
const skip = !EDGE && 'Microsoft Edge not found';
let edge;
before(async () => { if (!skip) edge = await launch(); });
after(async () => { await edge?.close(); });

// every element that is a box of its own (not a word inside a line of text), with its place and size
const BOXES = (root) => `(() => { const out = []; const root = ${root};
  for (const e of root.querySelectorAll('*')) {
    if (getComputedStyle(e).display === 'inline' || e.closest('.slot') || e.tagName === 'OPTION') continue;
    const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue;
    // the key: the element's place in the page structure (the same element in every language)
    let path = '', n = e; while (n && n !== root) { path = '/' + [...n.parentElement.children].indexOf(n) + path; n = n.parentElement; }
    out.push([path + ' ' + e.tagName + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/)[0] : ''), Math.round(r.left), Math.round(r.top + (root === document.getElementById('wrap') ? scrollY : 0)), Math.round(r.width), Math.round(r.height)]);
  } return out; })()`;

async function places(lang, width) {
  const page = await edge.newPage();
  await page.viewport(width, 900, 1);
  await page.block(['*mojang.com*']);
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.init(`try { localStorage.setItem('caperadar:lang', ${JSON.stringify(lang)}); } catch {} Date.now = () => 1791100000000;`);
  await page.init(fakeTauri({ data: DATA }));
  await page.goto(PAGE);
  await page.waitFor(`document.querySelectorAll('#grid .tile img.gen').length > 10`, 30000).catch(() => {});
  await page.eval(`document.fonts.ready.then(() => 1)`);
  await new Promise((r) => setTimeout(r, 900));   // the sizes are locked again once the pictures stop arriving
  const out = { page: await page.eval(BOXES(`document.getElementById('wrap')`)) };
  await page.click('#cw-open-settings'); await new Promise((r) => setTimeout(r, 300));
  out.settings = await page.eval(BOXES(`document.getElementById('cw-settings')`));
  await page.eval(`document.getElementById('cw-settings').close(); CapeWatchPage.openDetail('aurora')`); await new Promise((r) => setTimeout(r, 300));
  out.details = await page.eval(BOXES(`document.getElementById('dlg')`));
  assert.deepEqual(page.exceptions, []);
  await page.close();
  return out;
}

for (const width of [1200, 400]) {
  test(`at ${width} px every box is at the same place in all 7 languages`, { skip }, async () => {
    const all = {};
    for (const l of LANGS) all[l] = await places(l, width);
    const moved = [];
    for (const screen of ['page', 'settings', 'details']) {
      // An element with nothing in it in one language (the Mojang translation line is empty in English) has no
      // box there; its room is kept all the same. Every box present in both is compared.
      const base = new Map(all.en[screen].map((b) => [b[0], b]));
      for (const l of LANGS.slice(1)) {
        for (const b of all[l][screen]) {
          const e = base.get(b[0]); if (!e) continue;
          const d = [1, 2, 3, 4].map((j) => Math.abs(b[j] - e[j]));
          if (d.some((x) => x > 1)) moved.push(`${screen} ${l}: ${b[0]} differs from English by ${d.join('/')} px (left/top/width/height)`);
        }
      }
    }
    assert.deepEqual(moved.slice(0, 15), [], moved.length + ' boxes move');
  });
}
