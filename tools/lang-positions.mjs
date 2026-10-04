// Same place in every language: photographs the same screen in all 7 languages, one above the other, and
// measures where the main pieces sit (buttons, language picker, settings, cards, figure, catalog) in each one.
// Run: node tools/lang-positions.mjs [name]   (needs app/dist: node app/build-web.mjs)
// Output: _screenshots/night/positions/<name>-<screen>.png (local only, never committed) and a table of every
// piece that is not at the same place in all languages (empty = nothing moves).
// The cape textures are made-up two-colour pictures, so the pictures hold no game art.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../tests/lib/edge.mjs';
import { fakeTauri } from '../tests/lib/fake-tauri.mjs';
import { testCape } from '../tests/lib/png.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = root + '_screenshots/night/positions/';
mkdirSync(OUT, { recursive: true });
const name = process.argv[2] || 'now';
const width = +(process.argv[3] || 1200);
const DATA = JSON.parse(readFileSync(root + 'data/capewatch.json', 'utf8'));
const LANGS = ['en', 'he', 'es', 'pt', 'fr', 'de', 'ru'];

// the pieces whose place is compared (a CSS selector, and which of the matches: all of them)
export const PIECES = ['#f-lang', '#cw-open-settings', '#leaf-title', '#logo', '#view-reset', '.lede', '.unofficial', '.stat', '#live .live-card',
  '#live .live-card .btn', '#live .live-card .countdown', '#live .live-card .meta', 'h2', '.filters .field', '.filters select', '#f-q', '#grid .tile',
  '#grid .tile .ely-btn', 'footer .btn', 'footer a'];
export const WHERE = `((pieces) => { const out = {}; for (const s of pieces) document.querySelectorAll(s).forEach((e, i) => {
  const r = e.getBoundingClientRect(); out[s + ' #' + i] = [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)]; }); return out; })`;
const DIALOG = `((pieces) => { const out = {}; for (const s of pieces) document.querySelectorAll(s).forEach((e, i) => {
  const r = e.getBoundingClientRect(); out[s + ' #' + i] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }); return out; })`;
const SET_PIECES = ['#cw-settings', '#cw-settings h3', '#cw-settings legend', '#cw-settings .cw-opt', '#cw-settings input', '#cw-settings .cw-skin input', '#cw-settings .btn'];
const DLG_PIECES = ['#dlg', '#dlg-slot', '#dlg-title', '#dlg-meta', '#dlg-how', '#dlg-facts', '#dlg-actions .btn', '#dlg-close'];

const edge = await launch();
const shots = { top: [], settings: [], details: [] }, where = { page: {}, settings: {}, details: {} };
for (const lang of LANGS) {
  const page = await edge.newPage();
  await page.viewport(width, 900, 1);
  await page.block(['*mojang.com*']);
  await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
  await page.init(`try { localStorage.setItem('caperadar:lang', ${JSON.stringify(lang)}); } catch {}`);
  await page.init(fakeTauri({ data: DATA }));
  await page.goto(fileUrl(root + 'app/dist/index.html'));
  await page.waitFor(`document.querySelectorAll('#grid .tile img.gen').length > 10`, 30000).catch(() => {});
  await page.eval(`document.fonts.ready.then(() => 1)`);
  await page.eval(`Date.now = () => 1791100000000`);   // the same "time left" text in every picture
  await new Promise((r) => setTimeout(r, 700));
  where.page[lang] = await page.eval(WHERE + '(' + JSON.stringify(PIECES) + ')');
  shots.top.push(await page.screenshot({ clip: { x: 0, y: 0, width, height: 1150 }, full: true }));
  await page.click('#cw-open-settings'); await new Promise((r) => setTimeout(r, 400));
  where.settings[lang] = await page.eval(DIALOG + '(' + JSON.stringify(SET_PIECES) + ')');
  const sr = await page.eval(`(() => { const r = document.getElementById('cw-settings').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; })()`);
  shots.settings.push(await page.screenshot({ clip: sr }));
  await page.eval(`document.getElementById('cw-settings').close(); CapeWatchPage.openDetail('aurora')`); await new Promise((r) => setTimeout(r, 400));
  where.details[lang] = await page.eval(DIALOG + '(' + JSON.stringify(DLG_PIECES) + ')');
  const dr = await page.eval(`(() => { const r = document.getElementById('dlg').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; })()`);
  shots.details.push(await page.screenshot({ clip: dr }));
  await page.close();
  console.log('done', lang);
}
await edge.close();

// one picture per screen: the 7 languages one above the other, with the language written at the side
for (const [screen, list] of Object.entries(shots)) {
  const files = list.map((buf, i) => { const f = OUT + `_tmp-${screen}-${i}.png`; writeFileSync(f, buf); return f; });
  execFileSync('python', ['-c', `
import sys
from PIL import Image, ImageDraw
files, langs, out = sys.argv[1:8], sys.argv[8].split(','), sys.argv[9]
ims = [Image.open(f).convert('RGB') for f in files]
W = max(i.width for i in ims) + 60; H = sum(i.height + 10 for i in ims)
o = Image.new('RGB', (W, H), (255, 255, 255)); d = ImageDraw.Draw(o); y = 0
for l, im in zip(langs, ims):
    o.paste(im, (60, y)); d.rectangle([0, y, 54, y + im.height], fill=(40, 40, 40)); d.text((10, y + 8), l.upper(), fill=(255, 220, 90)); y += im.height + 10
o.save(out)
import os
for f in files: os.remove(f)
`, ...files, LANGS.join(','), OUT + `${name}-${screen}-${width}.png`]);
}

// every piece that is not at the same place in all languages
const moved = {};
for (const [screen, byLang] of Object.entries(where)) {
  const keys = new Set(Object.values(byLang).flatMap((o) => Object.keys(o)));
  for (const k of keys) {
    const vals = LANGS.map((l) => byLang[l][k]);
    if (vals.some((v) => !v)) { moved[screen + ' ' + k] = 'missing in some languages'; continue; }
    const diff = ['left', 'top', 'width', 'height'].map((_, j) => Math.max(...vals.map((v) => v[j])) - Math.min(...vals.map((v) => v[j])));
    if (diff.some((d) => d > 1)) moved[screen + ' ' + k] = 'moves by left ' + diff[0] + ', top ' + diff[1] + ', width ' + diff[2] + ', height ' + diff[3] + ' px';
  }
}
writeFileSync(OUT + `${name}-${width}-moved.json`, JSON.stringify(moved, null, 1));
console.log(Object.keys(moved).length + ' pieces move between languages');
for (const [k, v] of Object.entries(moved).slice(0, 40)) console.log(' ', k, ':', v);
console.log('pictures in', OUT);
