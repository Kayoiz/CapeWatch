// Builds robot/allowed-words.json: names the robot's word filter (robot/offensive.mjs) never marks, so a text about a
// real cape or a real thing in the game is never replaced. Every cape the wiki lists (and those CapeWatch knows from
// its data file and from capes.me), and the names of mobs, items, blocks, biomes, structures, dimensions, enchantments,
// effects, events and characters. Names only (facts), from the wiki's categories and their subcategories.
// Run: node tools/make-allowed-words.mjs   (asks the wiki one page at a time, with a short pause between)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://minecraft.wiki/api.php';
const UA = { 'User-Agent': 'CapeWatchBot/1.0 (+https://github.com/Kayoiz/CapeWatch)' };
const CAPES = ['Capes'];
const GAME = ['Mobs', 'Items', 'Blocks', 'Biomes', 'Structures', 'Generated structures', 'Dimensions', 'Enchantments', 'Effects', 'Food',
  'Tools', 'Weapons', 'Armor', 'Events', 'Minecraft Live', 'Characters'];
const DEPTH = 3;   // subcategories followed this deep
const pause = () => new Promise((r) => setTimeout(r, 250));

async function members(category, type) {
  const out = [];
  let cont = null;
  do {
    const q = new URLSearchParams({ action: 'query', list: 'categorymembers', cmtitle: 'Category:' + category, cmtype: type, cmlimit: '500', format: 'json', formatversion: '2', ...(cont ? { cmcontinue: cont } : {}) });
    const r = await fetch(API + '?' + q, { headers: UA });
    if (!r.ok) throw new Error(category + ': HTTP ' + r.status);
    const j = await r.json();
    out.push(...(j.query?.categorymembers || []));
    cont = j.continue?.cmcontinue || null;
    await pause();
  } while (cont);
  return out;
}
async function walk(roots) {
  const names = new Set(), seen = new Set();
  const visit = async (cat, depth) => {
    if (seen.has(cat)) return;
    seen.add(cat);
    for (const p of await members(cat, 'page')) if (p.ns === 0) names.add(p.title);
    if (depth < DEPTH) for (const c of await members(cat, 'subcat')) await visit(c.title.replace(/^Category:/, ''), depth + 1);
  };
  for (const r of roots) await visit(r, 0);
  return { names, categories: seen.size };
}
// "Bat (mob)" -> "Bat (mob)" and "Bat"; "Cape/Gallery" is left out
const forms = (title) => title.includes('/') ? [] : [title, title.replace(/\s*\([^)]*\)\s*$/, '')].filter(Boolean);

const capes = await walk(CAPES);
const game = await walk(GAME);
const known = new Set([...capes.names].flatMap(forms));
const data = JSON.parse(readFileSync(new URL('../data/capewatch.json', import.meta.url), 'utf8'));
for (const c of Object.values(data.capes)) { known.add(c.name); if (c.wikiTitle) known.add(c.wikiTitle.split('#')[0]); }
const capesMe = new URL('../robot/capes-me-titles.txt', import.meta.url);   // optional: one title per line
if (existsSync(capesMe)) for (const t of readFileSync(capesMe, 'utf8').split('\n')) if (t.trim()) known.add(t.trim());
const things = new Set([...game.names].flatMap(forms).filter((n) => !known.has(n)));
const sort = (s) => [...s].sort((a, b) => a.localeCompare(b, 'en'));
writeFileSync(new URL('../robot/allowed-words.json', import.meta.url), JSON.stringify({
  about: 'Names the robot word filter (robot/offensive.mjs) never marks: capes and things in the game. Made by tools/make-allowed-words.mjs from the categories of minecraft.wiki (names only).',
  capes: sort(known), game: sort(things)
}, null, 1) + '\n');
console.log('capes:', known.size, '(' + capes.categories + ' categories), game names:', things.size, '(' + game.categories + ' categories)');
