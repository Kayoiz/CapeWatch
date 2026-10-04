// Task 11 (design consistency review): before / after pictures of each item in tools/preview/fixes-11.css.
// Run: node tools/design-review.mjs   (needs app/dist: node app/build-web.mjs)
// Pictures go to _screenshots/night/review/ (local only, never committed). The cape textures here are made-up
// two-colour pictures, so the screenshots hold no game art. tools/design-review.html shows them.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../tests/lib/edge.mjs';
import { fakeTauri } from '../tests/lib/fake-tauri.mjs';
import { testCape } from '../tests/lib/png.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = root + '_screenshots/night/review/';
mkdirSync(OUT, { recursive: true });
const DATA = JSON.parse(readFileSync(root + 'data/capewatch.json', 'utf8'));
const FIX = readFileSync(root + 'tools/preview/fixes-11.css', 'utf8');
const ADD_X = `(() => { const d = document.getElementById('cw-settings'); if (d && !d.querySelector('.cw-preview-x')) { const b = document.createElement('button'); b.className = 'btn ghost cw-preview-x'; b.type = 'button'; b.textContent = '✕'; d.append(b); } })()`;

// item: [name, theme, how to get there, element to photograph, extra margin]
const SHOTS = [
  ['1-controls-title', 'dark', '', '#title-tools', 8],
  ['1-controls-filters', 'dark', '', '.filters', 8],
  ['2-sizes-card', 'dark', '', '.live-card', 0],
  ['3-badges', 'dark', '', '#grid .tile .meta', 6],
  ['4-spacing-grid', 'dark', '', '#grid', 0],
  ['5-dialog-details', 'dark', `CapeWatchPage.openDetail('aurora')`, '#dlg', 0],
  ['5-dialog-settings', 'dark', `document.getElementById('cw-open-settings').click()`, '#cw-settings', 0],
  ['6-title-light', 'light', '', '#titlebar', 0]
];

const edge = await launch();
for (const fixed of [false, true]) {
  for (const [name, theme, go, sel, margin] of SHOTS) {
    const page = await edge.newPage();
    await page.viewport(1200, 900, 1);
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    await page.route('https://textures.minecraft.net/*', () => ({ body: testCape(), type: 'image/png' }));
    await page.init(fakeTauri({ data: DATA }));
    await page.goto(fileUrl(root + 'app/dist/index.html'));
    await page.waitFor(`document.querySelectorAll('#grid .tile img.gen').length > 10`, 30000).catch(() => {});
    await page.eval('document.fonts.ready.then(() => 1)');
    if (fixed) await page.eval(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(FIX)}; document.head.append(s); })()`);
    if (go) { await page.eval(go); await new Promise((r) => setTimeout(r, 300)); if (fixed) await page.eval(ADD_X); }
    if (name === '4-spacing-grid') await page.eval(`document.getElementById('grid').style.maxHeight = '620px'; document.getElementById('grid').style.overflow = 'hidden'`);
    await new Promise((r) => setTimeout(r, 300));
    const clip = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e.closest('dialog')) e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(), m = ${margin};
      return { x: Math.max(0, r.x - m + scrollX), y: Math.max(0, r.y - m + scrollY), width: r.width + 2 * m, height: Math.min(r.height, 640) + 2 * m }; })()`);
    writeFileSync(OUT + name + (fixed ? '-after' : '-before') + '.png', await page.screenshot({ clip }));
    const measure = await page.eval(`(() => { const h = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height * 10) / 10 : null; };
      return { settingsBtn: h('#cw-open-settings'), langMenu: h('#f-lang'), search: h('#f-q'), menu: h('#f-ed'), ed: h('#grid .meta .ed'), pill: h('#grid .meta .pill') }; })()`);
    if (name === '1-controls-title') console.log(fixed ? 'after ' : 'before', JSON.stringify(measure));
    await page.close();
  }
}
await edge.close();
console.log('pictures in', OUT);
